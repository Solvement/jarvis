'use client';
import type { DeskEntry } from '@/lib/desk-types';
import type { ItemState } from '@/lib/types';
import { topicLabels } from '@/lib/desk-model';
import { Icon } from './ui';
import s from './desk.module.css';

export const levelLabels={translation:'中文简介',brief:'研究简报',deep:'精读'};
type Props={items:DeskEntry[];states:Record<string,ItemState>;open:(entry:DeskEntry,version?:string)=>void;save:(entry:DeskEntry)=>void;disabled:boolean};
function Preview({entry:e}:{entry:DeskEntry}) {
  return <div className={s.paperPreview} aria-label={`${e.title} 的已存简介概览`}><span className={s.previewType}>已存简介 · 非 PDF 原图</span><div className={s.previewPaper}><strong>{e.title}</strong><small>{e.authors?.slice(0,3).join(' · ')||'作者信息见原文'}</small><i/><b>ABSTRACT / 问题概览</b><p>{e.summary}</p><div className={s.previewColumns}><span/><span/></div></div></div>;
}
function SaveButton({entry:e,states,save,disabled}:Pick<Props,'states'|'save'|'disabled'>&{entry:DeskEntry}) {
  return <button className={s.iconButton} disabled={disabled} aria-label={`${states[e.id]?.starred?'取消收藏':'收藏'} ${e.title}`} aria-pressed={!!states[e.id]?.starred} onClick={()=>save(e)}><Icon name="saved" size={16}/></button>;
}
export function Papers({items,states,open,save,disabled,resultMode}:Props&{resultMode:boolean}) {
  const [lead,...rest]=items;
  if(!lead)return null;
  return <div className={s.editorialListing}>
    {!resultMode&&<article className={s.lead}><button className={s.leadVisual} onClick={()=>open(lead)} aria-label={`阅读 ${lead.title}`}><Preview entry={lead}/></button><div className={s.leadCopy}><div className={s.kicker}>FROM YOUR LIBRARY <span>{topicLabels[lead.topics[0]]}</span></div><h2><button onClick={()=>open(lead)}>{lead.displayTitle}</button></h2><p>{lead.description}</p>{lead.published&&<small className={s.paperDate}>发表于 {lead.published}</small>}<div className={s.leadBottom}><button className={s.textButton} onClick={()=>open(lead)}>打开阅读 <Icon name="arrow"/></button><SaveButton {...{entry:lead,states,save,disabled}}/></div></div></article>}
    {!resultMode&&<div className={s.sectionRule}><span>继续发现</span><span>本页另有 {rest.length} 篇</span></div>}
    <div className={s.paperGrid}>{(resultMode?items:rest).map((e,i)=><article className={s.paperCard} key={e.id}>
      <button className={s.cardPreview} onClick={()=>open(e)} aria-label={`预览 ${e.title}`}><Preview entry={e}/></button>
      <div className={s.cardTop}><span className={s.mono}>{String(i+(resultMode?1:2)).padStart(2,'0')}</span><span>{topicLabels[e.topics[0]]}</span><SaveButton {...{entry:e,states,save,disabled}}/></div>
      <h3><button onClick={()=>open(e)}>{e.displayTitle}</button></h3><p>{e.description}</p>{e.published&&<small className={s.paperDate}>发表于 {e.published}</small>}<div className={s.cardBottom}><span>{e.levels.includes('deep')?'有精读':e.authors?.[0]||'原文待深入'}</span><button className={s.textButton} onClick={()=>open(e)}>阅读 <Icon name="arrow" size={15}/></button></div>
    </article>)}</div>
  </div>;
}
export function Projects({items,states,open,save,disabled,more,showAll,remaining,ranks}:{remaining:number;more:()=>void;showAll:()=>void;ranks?:Record<string,number>}&Props) {
  return <div className={s.referenceCatalog}>
    {items.map(e=><details className={s.referenceTool} key={e.id} data-project-id={e.id} data-has-introduction={!!e.introduction}><summary><div><strong>{e.title}</strong><small>{ranks?.[e.id]&&`#${ranks[e.id]} · `}{e.language||'未标注语言'} · {e.introduction?'白话介绍':e.levels.length?e.levels.map(l=>levelLabels[l]).join(' / '):'榜单简介'}</small></div><span>{e.description}{e.introduction?.example&&<small className={s.projectExample}><b>比如</b> {e.introduction.example}</small>}</span><span className={s.toolChevron}>⌄</span></summary><div className={s.referenceToolBody}>
      <div><span>{e.introduction?'介绍依据':'项目简介'}</span><p>{e.introduction?'已核对仓库 README 的用途与功能说明，未进行源码核查或运行验证。':e.summary}</p>{e.introduction?.sourceUrl&&<a className={s.introSource} href={e.introduction.sourceUrl} target="_blank" rel="noreferrer">查看介绍来源 ↗</a>}</div><div><span>{e.introduction?'阅读方式':'已有阅读覆盖'}</span><p>{e.introduction?'先了解它做什么，告诉我你感兴趣的问题，再决定精读哪部分。':e.coverage}</p></div>
      <div className={s.toolSource}><span>最后入档 {e.latestSeen}</span>{e.stars!==undefined&&<span>快照 Stars {e.stars.toLocaleString()}</span>}{e.growth!==undefined&&<span>该榜期增长 {e.growth.toLocaleString()}</span>}<span>以上是已存榜单数据</span></div>
      <div className={s.referenceToolActions}><a href={e.url} target="_blank" rel="noreferrer">打开仓库 ↗</a><button onClick={()=>open(e,e.introduction?.version)}>{e.introduction?'查看白话介绍 →':'打开项目阅读 →'}</button>{e.introduction&&e.levels.some(l=>l!=='translation')&&<button onClick={()=>open(e)}>已有阅读版本 →</button>}<button disabled={disabled} aria-pressed={!!states[e.id]?.starred} onClick={()=>save(e)}>{states[e.id]?.starred?'已收藏':'收藏'} {e.title}</button></div>
    </div></details>)}
    {remaining>0&&<div className={s.projectMore}><button className={s.moreTools} onClick={more}>再显示 {Math.min(8,remaining)} 个项目 ↓</button><button className={s.textButton} onClick={showAll}>显示本榜全部 {items.length+remaining} 个项目</button></div>}
  </div>;
}
export function Shelf({items,states,open,save,disabled}:Props) {
  return <div className={s.catalog}>{items.map(e=><article key={e.id} className={s.shelfRow}><div><span className={s.smallLabel}>{e.kind==='paper'?'论文':'项目'} · {topicLabels[e.topics[0]]}{states[e.id]?.readAt?' · 已读':''}</span><h2><button onClick={()=>open(e)}>{e.displayTitle}</button></h2><p>{states[e.id]?.note||e.description}</p><small>{states[e.id]?.updatedAt ? `保存于 ${new Date(states[e.id].updatedAt).toLocaleString('zh-CN')}`:''}</small></div><SaveButton {...{entry:e,states,save,disabled}}/></article>)}</div>;
}
