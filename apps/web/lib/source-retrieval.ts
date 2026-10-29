import type { ChatContext,ChatReference } from './desk-types';
import type { SourceDocument,SourceChunk } from './source-types';

const bilingual:[RegExp,string][]=[
  [/公式|数学|推导|计算/,'equation formula mathematical derivation computation'],[/实验|基线|消融|评测|结果/,'experiment baseline ablation benchmark evaluation results'],
  [/局限|不足|失败|边界|缺点/,'limitation failure discussion constraint weakness'],[/方法|机制|原理|流程|架构/,'method mechanism architecture framework pipeline algorithm'],
  [/训练|模型|参数|强化/,'training model parameter reinforcement optimization'],[/数据|状态|存储|记忆/,'data state storage database memory persistence'],
  [/请求|入口|调用/,'request entrypoint handler run invoke main controller route'],[/并发|队列|资源|性能/,'concurrency queue scheduling resource performance latency'],
  [/测试|验证|可靠|错误|恢复/,'test validation error recovery reliability retry'],[/工程|价值|优质|学习|设计/,'architecture design implementation tradeoff modularity engineering'],
];
export function queryTerms(question:string) {
  const expanded=question+' '+bilingual.filter(([re])=>re.test(question)).map(([,s])=>s).join(' ');
  return [...new Set(expanded.toLowerCase().match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,6}/g)||[])].filter(t=>!['the','what','this','with','from','that','and','for','how'].includes(t));
}
export function selectSourceChunks(doc:SourceDocument,question:string,budget=56_000) {
  if(doc.characters<=budget)return {chunks:doc.chunks,truncated:false};
  const terms=queryTerms(question),counts=new Map<string,number>();
  const tokenized=doc.chunks.map(c=>`${c.heading} ${c.path||''} ${c.text}`.toLowerCase());
  for(const term of terms)counts.set(term,tokenized.filter(t=>t.includes(term)).length);
  const scored=doc.chunks.map((c,i)=>({c,i,score:terms.reduce((n,term)=>{
    const matches=tokenized[i].split(term).length-1;if(!matches)return n;
    return n+Math.log(1+(doc.chunks.length-(counts.get(term)||0)+.5)/((counts.get(term)||0)+.5))*(matches*2.2/(matches+1.2*(.25+.75*c.text.length/1200)))+(`${c.heading} ${c.path||''}`.toLowerCase().includes(term)?1.5:0);
  },0)})).sort((a,b)=>b.score-a.score||a.i-b.i);
  const selected=new Set<number>();let size=0;
  const add=(i:number)=>{const c=doc.chunks[i];if(!c||selected.has(i)||size+c.text.length>budget)return;selected.add(i);size+=c.text.length;};
  // 全文主题覆盖 + 相关段落和邻居；不只检索摘要或既有解读。
  add(0);for(const {i}of scored.slice(0,12)){add(i);add(i-1);add(i+1);}
  const labels=new Set<string>();
  for(const i of selected)for(const m of doc.chunks[i].text.matchAll(/\b(?:Appendix|Section|Sec\.?)\s+([A-Z](?:\.\d+)*|\d+(?:\.\d+)+)\b/g))labels.add(m[1]);
  for(const c of doc.chunks)if([...labels].some(label=>c.heading.includes(label)))add(c.ordinal);
  const seen=new Set<string>();for(const c of doc.chunks){if(!seen.has(c.heading)&&seen.size<18){seen.add(c.heading);add(c.ordinal);}}
  for(const {i}of scored){add(i);if(selected.size<30){add(i-1);add(i+1);}}
  return {chunks:[...selected].sort((a,b)=>a-b).map(i=>doc.chunks[i]),truncated:selected.size<doc.chunks.length};
}
export function originalChatContext(doc:SourceDocument,question:string):ChatContext {
  const {chunks,truncated}=selectSourceChunks(doc,question);
  const prefix=doc.kind==='project_code'?'C':'P';
  const references:ChatReference[]=chunks.map(c=>({id:`${prefix}${c.ordinal+1}`,title:c.path?`${c.path}:${c.lineStart}–${c.lineEnd}`:c.page?`原文第 ${c.page} 页 · 段落 ${c.ordinal+1}`:`${c.heading} · 段落 ${c.ordinal+1}`,
    text:c.text,url:c.url,documentId:doc.id,chunkId:c.id,...(c.page?{page:c.page}:{}),...(c.path?{path:c.path,lineStart:c.lineStart,lineEnd:c.lineEnd}:{})}));
  const repo=doc.repository;
  const coverage=repo?`固定 commit ${repo.commit}；已获取 ${repo.selected.length}/${repo.treeCount} 个文件的文字，目录树${repo.treeTruncated?'不完整':'已取得'}。本次问答只检索源码文字，不执行项目或测试；独立实测的范围见精读复核记录。`:
    `已获取并解析论文${doc.kind==='paper_pdf'?` PDF 共 ${doc.pages} 页`:' HTML 正文'}，${doc.chunks.length} 段、${doc.characters} 字符；本次${truncated?`从全文检索 ${chunks.length} 段原文片段`:'材料包含全部已解析文字'}。不使用既有解读代替原文。`;
  return {coverage,version:`source:${doc.id}`,references,truncated,mode:repo?'project-code':'paper-fulltext',
    document:{id:doc.id,kind:doc.kind,sourceUrl:doc.sourceUrl,sourceVersion:doc.sourceVersion,fetchedAt:doc.fetchedAt,totalChunks:doc.chunks.length,selectedChunks:chunks.length,limitations:doc.limitations,
      outline:[...new Set(doc.chunks.map(c=>c.path||c.heading))].slice(0,100),...(repo?{commit:repo.commit,files:repo.selected,treeCount:repo.treeCount}:{})}};
}
