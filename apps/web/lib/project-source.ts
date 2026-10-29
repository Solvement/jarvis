import type { Db } from '@/db/client';
import type { Entry } from './types';
import type { SourceChunk,SourceDocument } from './source-types';
import { sourceFetch } from './source-network';
import { getSourceDocument,saveSourceDocument,sha256,SourceError,withSourceLock } from './source-documents';

export const PROJECT_PARSER='repo-code-v2';
export function repositoryName(itemId:string) {
  const name=itemId.replace(/^repo:/,'');
  if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(name)||name.includes('..'))throw new SourceError('GitHub 项目标识无效');
  return name;
}
async function githubJson(path:string,signal?:AbortSignal) {
  const headers:Record<string,string>={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'};
  if(process.env.GITHUB_TOKEN)headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
  const result=await sourceFetch(`https://api.github.com${path}`,{hosts:['api.github.com'],maxBytes:8_000_000,headers,signal});
  return JSON.parse(new TextDecoder().decode(result.body));
}
export function isReadableCode(path:string) {
  return !/(^|\/)(?:node_modules|vendor|\.git|dist|build|coverage|fixtures|__snapshots__)(\/|$)/i.test(path)
    && !/(?:lock\.json|lock\.yaml|\.lock|\.min\.[jt]s|\.map|\.svg|\.ipynb)$/i.test(path)
    && /(?:\.(?:md|rst|txt|py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|c|cc|cpp|cu|cuh|h|hpp|cs|swift|rb|php|vue|svelte|yaml|yml|toml|json|xml|mod|sql|proto|sh|tf|hcl|nix)|(?:^|\/)Dockerfile|(?:^|\/)Makefile)$/i.test(path);
}
export function selectInitialFiles(files:{path:string;size:number}[]) {
  const score=(path:string)=>{
    const p=path.toLowerCase();let n=0;
    if(/^readme(?:\.[\w-]+)?$/i.test(path))n+=100;
    if(/(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|dockerfile)$/.test(p))n+=80;
    if(/(^|\/)(main|app|server|index|cli|lib|__main__)\.(py|ts|js|go|rs|java|mjs)$/.test(p))n+=65;
    if(/(architecture|design|overview)/.test(p))n+=60;
    if(/(agent|runtime|engine|workflow|router|controller|handler|store|session|scheduler|model|trainer|inference|attention)/.test(p))n+=35;
    if(/(^|\/)(test[s]?|__tests__)(\/|_)|\.test\.|_test\./.test(p))n+=40;
    n-=path.split('/').length*2;return n;
  };
  const eligible=files.filter(f=>f.size>0&&f.size<=300_000&&isReadableCode(f.path));
  const sorted=[...eligible].sort((a,b)=>score(b.path)-score(a.path)||a.path.localeCompare(b.path));
  // 至少纳入实现与测试；初始包是取证起点，不宣称已读完整仓库。
  const selected:typeof files=[];
  const take=(predicate:(path:string)=>boolean,n:number)=>{for(const f of sorted.filter(f=>predicate(f.path)&&!selected.some(s=>s.path===f.path)).slice(0,n))selected.push(f);};
  take(p=>/^readme(?:\.[\w-]+)?$/i.test(p),1);
  take(p=>/(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml)$/i.test(p),2);
  take(p=>/\.(py|ts|tsx|js|jsx|go|rs|java|kt|cpp|cc|cu|c|mjs|cjs|cs|swift|rb|php|vue|svelte|tf|hcl|nix)$/i.test(p)&&!/(test|spec|example|fixture)/i.test(p),4);
  take(p=>/(test|spec)/i.test(p),2);
  take(p=>/(architecture|design|overview)/i.test(p),1);
  return selected.map(f=>f.path);
}
export function codeChunks(path:string,text:string,repo:string,commit:string,start:number):SourceChunk[] {
  const lines=text.replace(/\r\n/g,'\n').split('\n');const chunks:SourceChunk[]=[];
  for(let from=0;from<lines.length;){let to=from,chars=0;while(to<lines.length&&to-from<65&&chars<2600){chars+=lines[to].length+1;to++;}
    const body=lines.slice(from,to).join('\n');if(body.trim()){const ordinal=start+chunks.length;chunks.push({id:`c${ordinal+1}`,ordinal,heading:path,path,text:body,lineStart:from+1,lineEnd:to,url:`https://github.com/${repo}/blob/${commit}/${path.split('/').map(encodeURIComponent).join('/')}#L${from+1}-L${to}`});}from=to;}
  return chunks;
}
export async function ensureProjectDocument(db:Db,entry:Entry,options:{signal?:AbortSignal;force?:boolean;paths?:string[]}={}) {
  const cached=await getSourceDocument(db,entry.id);
  if(cached?.parserVersion===PROJECT_PARSER&&!options.force&&!options.paths?.length)return cached;
  return withSourceLock(db,entry.id,async()=>{
    const repo=repositoryName(entry.id),signal=options.signal;
    let repository=cached?.repository;
    if(!repository||options.force){
      const metadata=await githubJson(`/repos/${repo}`,signal);
      if(metadata.private!==false)throw new SourceError('只读取公开 GitHub 仓库');
      const commit=await githubJson(`/repos/${repo}/commits/${encodeURIComponent(metadata.default_branch)}`,signal);
      if(!/^[a-f0-9]{40}$/.test(commit.sha))throw new SourceError('未取得有效的固定 commit');
      const tree=await githubJson(`/repos/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`,signal);
      if(!Array.isArray(tree.tree))throw new SourceError('未取得有效目录树');
      const all=tree.tree.filter((f:{type:string;mode:string})=>f.type==='blob'&&f.mode!=='120000');
      repository={commit:commit.sha,branch:metadata.default_branch,owner:metadata.owner.login,treeCount:all.length,treeTruncated:!!tree.truncated||all.length>15000,
        files:all.slice(0,15000).map((f:{path:string;size?:number})=>({path:f.path,size:f.size||0})),selected:[],skipped:[]};
    }
    const repoData=repository;
    const desired=options.paths?.length?options.paths:selectInitialFiles(repoData.files);
    if(desired.length>10)throw new SourceError('每次最多补读 10 个文件');
    if(repoData.selected.length+desired.filter(p=>!repoData.selected.includes(p)).length>30)throw new SourceError('当前证据包最多 30 个文件；请聚焦一个机制或主链路');
    const chunks:SourceChunk[]=options.force?[]:[...(cached?.chunks||[])];const selected=[...repoData.selected],skipped=[...repoData.skipped];
    for(const path of desired){
      if(selected.includes(path))continue;
      const file=repoData.files.find(f=>f.path===path);
      if(!file||!isReadableCode(path)||file.size>300_000)throw new SourceError(`文件不在可读范围或超过 300 KB：${path}`);
      try{
        const fetched=await sourceFetch(`https://raw.githubusercontent.com/${repo}/${repoData.commit}/${path.split('/').map(encodeURIComponent).join('/')}`,{hosts:['raw.githubusercontent.com'],maxBytes:350_000,signal});
        const text=new TextDecoder().decode(fetched.body);if(text.includes('\0')){skipped.push(path);continue;}
        if(chunks.reduce((n,c)=>n+c.text.length,0)+text.length>1_200_000)throw new SourceError('源码证据包超过 120 万字符，请聚焦一个主链路');
        chunks.push(...codeChunks(path,text,repo,repoData.commit,chunks.length));selected.push(path);
      }catch(e){if(signal?.aborted)throw e;if(options.paths?.length)throw e;skipped.push(path);}
    }
    if(!chunks.length)throw new SourceError('未取得可读源码，请稍后重试');
    const doc:Omit<SourceDocument,'id'>={itemId:entry.id,kind:'project_code',title:entry.title,sourceUrl:`https://github.com/${repo}/tree/${repoData.commit}`,sourceVersion:repoData.commit,
      contentHash:sha256(chunks.map(c=>`${c.path}:${c.lineStart}:${c.text}`).join('\n')),parserVersion:PROJECT_PARSER,fetchedAt:new Date().toISOString(),chunks,characters:chunks.reduce((n,c)=>n+c.text.length,0),repository:{...repoData,selected,skipped},
      limitations:[`这是初始源码证据包，已获取 ${selected.length}/${repoData.treeCount} 个文件；自动选择文件不等于已确认主调用链。`,'未运行项目或测试；README 中的宣传、源码可见行为与模型推断需要分别核查。',...(repoData.treeTruncated?['目录树超过上限或来源返回截断，未宣称完整仓库覆盖。']:[])]};
    return saveSourceDocument(db,doc);
  });
}
