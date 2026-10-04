import type {Board,Entry,Period,Source} from './types';
export function decode(s:string):string {
 return s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)))
 .replace(/&(quot|apos|amp|lt|gt|nbsp);/g,(_,n:string)=>(({quot:'"',apos:"'",amp:'&',lt:'<',gt:'>',nbsp:' '} as Record<string,string>)[n]||''));
}
export const plain=(s:string)=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const num=(s:string)=>Number(plain(s).replace(/[^\d]/g,''))||0;
export async function hash(s:string) { const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join(''); }
export function sourceDay(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function isoWeek(day:string) {
 const d=new Date(day+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
 const y=d.getUTCFullYear(); const w=Math.ceil((((d.getTime()-Date.UTC(y,0,1))/86400000)+1)/7);
 return `${y}-W${String(w).padStart(2,'0')}`;
}
export function sourceUrl(source:Source,period:Period,day=sourceDay()) {
 if(source==='github')return `https://github.com/trending?since=${period}`;
 return period==='daily'?'https://huggingface.co/papers':period==='weekly'?`https://huggingface.co/papers/week/${isoWeek(day)}`:`https://huggingface.co/papers/month/${day.slice(0,7)}`;
}
export async function parseGithub(html:string):Promise<Entry[]> {
 const blocks=html.match(/<article\b[^>]*class="[^"]*Box-row[^"]*"[^>]*>[\s\S]*?<\/article>/gi)||[];
 if(!blocks.length)throw new Error('GitHub 页面结构变化：未找到榜单，保留上一份数据。');
 return Promise.all(blocks.map(async (b,i)=>{
  const name=b.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href="\/([^/"?#]+\/[^/"?#]+)"/i)?.[1];
  if(!name)throw new Error(`GitHub 第 ${i+1} 行无法解析，未保存不完整榜单。`);
  const summary=plain(b.match(/<p\b[^>]*>[\s\S]*?<\/p>/i)?.[0]||'');
  const stars=b.match(/href="[^"]*\/stargazers"[^>]*>([\s\S]*?)<\/a>/i)?.[1]||'';
  const forks=b.match(/href="[^"]*\/forks"[^>]*>([\s\S]*?)<\/a>/i)?.[1]||'';
  const contributors=Array.from(b.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>[\s]*<img\b([^>]*)>/gi)).flatMap(m=>{
   const avatar=decode(m[2].match(/src="([^"]+)"/)?.[1]||'');
   const name=decode(m[2].match(/alt="([^"]+)"/)?.[1]||'').replace(/^@/,'');
   return avatar.startsWith('https://avatars.githubusercontent.com/')&&name?[{name,avatar,url:`https://github.com${m[1]}`}]:[];
  });
  return {id:`repo:${name.toLowerCase()}`,kind:'project' as const,title:name,summary,url:`https://github.com/${name}`,rank:i+1,
   stars:num(stars),forks:num(forks),growth:num(b.match(/([\d,]+)\s+stars\s+(today|this week|this month)/i)?.[1]||''),
   language:plain(b.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</i)?.[1]||''),
   languageColor:b.match(/repo-language-color[^>]*style="[^"]*background-color:\s*([^;" ]+)/)?.[1],contributors,
   sourceHash:await hash(name+'\n'+summary)};
 }));
}
export async function parseHF(html:string,period:Period) {
 const blocks=Array.from(html.matchAll(/data-props="([^"]*)"/g));
 for(const m of blocks){
  let props;try{props=JSON.parse(decode(m[1]));}catch{continue;}
  if(!Array.isArray(props.dailyPapers))continue;
  if(props.periodType!==({daily:'day',weekly:'week',monthly:'month'}[period]))throw new Error('HF 返回了不同周期的数据，拒绝保存。');
  const items:Entry[]=await Promise.all(props.dailyPapers.map(async(e:Record<string,unknown>,i:number)=>{
   const p=e.paper as Record<string,unknown>;
   if(!p||!/^\d{4}\.\d{4,5}$/.test(String(p.id))||!p.title)throw new Error('HF 论文字段缺失，保留上一份数据。');
   const title=String(p.title),summary=String(p.summary||'');
   return {id:`paper:${p.id}`,kind:'paper' as const,title,summary,url:`https://huggingface.co/papers/${p.id}`,rank:i+1,
    votes:Number(p.upvotes)||0,authors:Array.isArray(p.authors)?p.authors.map((a:Record<string,unknown>)=>String(a.name)):[],
    published:String(p.publishedAt||'').slice(0,10),codeUrl:typeof p.githubRepo==='string'?p.githubRepo:undefined,
    pdfUrl:`https://arxiv.org/pdf/${p.id}`,sourceHash:await hash(title+'\n'+summary)};
  }));
  return {items,sourceDate:String(props.dateString||'')};
 }
 throw new Error('HF 页面结构变化：未找到原始榜单，保留上一份数据。');
}
export async function fetchBoard(source:Source,period:Period):Promise<Board> {
 const url=sourceUrl(source,period);const response=await fetch(url,{headers:{'User-Agent':'JarvisReading/1.0','Accept':'text/html'},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(`${source==='github'?'GitHub':'HF'} 返回 HTTP ${response.status}`);
 const html=await response.text();if(html.length>8000000)throw new Error('来源页面超过大小上限');
 const result=source==='github'?{items:await parseGithub(html),sourceDate:sourceDay()}:await parseHF(html,period);
 return {id:`${source}:${period}`,source,period,url,fetchedAt:new Date().toISOString(),...result,contentHash:await hash(html)};
}
