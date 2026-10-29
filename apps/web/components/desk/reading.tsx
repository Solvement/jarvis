'use client';
import {useEffect,useRef} from 'react';
import type { DeskEntry } from '@/lib/desk-types';
import type { ItemState,Reading } from '@/lib/types';
import { coverageLabel,versionKey } from '@/lib/desk-model';
import Body from '@/components/body';
import FigureFrame from '@/components/figure-frame';
import StudyRecord from '@/components/study-record';
import SkillGuide from '@/components/skill-guide';
import PoSExperiment from '@/components/pos-experiment';
import { levelLabels } from './listing';
import { Icon } from './ui';
import SourceReader,{type SourceTarget} from './source-reader';
import type { SourceDocument } from '@/lib/source-types';
import s from './desk.module.css';

export default function EntryReading({entry:e,versions,reading,version,choose,state,disabled,save,mark,note,add,ask,askQuestion,previous,next,open,sourceTarget,sourceRefresh,signedIn,sourcePrepared,studyQuestion}:{
  entry:DeskEntry;versions:Reading[];reading?:Reading;version:string;choose:(version:string)=>void;state?:ItemState;disabled:boolean;
  save:()=>void;mark:()=>void;note:()=>void;add:()=>void;ask:()=>void;askQuestion:(text:string)=>void;
  previous?:DeskEntry;next?:DeskEntry;open:(entry:DeskEntry)=>void;
  sourceTarget:SourceTarget|null;sourceRefresh:string;signedIn:boolean;sourcePrepared:(doc:SourceDocument|null)=>void;studyQuestion:(question:string)=>void;
}) {
  const sourceDetails=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(sourceTarget&&sourceDetails.current)sourceDetails.current.open=true;},[sourceTarget]);
  const length=reading?.sections.reduce((n,section)=>n+section.body.length,0)||0;
  return <article className={s.reading}>
    <div className={s.readingEyebrow}><span>{e.kind==='paper'?'PAPER / 论文':'PROJECT / 项目'}</span><span>{reading?levelLabels[reading.level]:'已存榜单简介'}{reading?.visibility==='draft'?' · 私人草稿':''}</span></div>
    <h1>{reading?.title||e.displayTitle}</h1><p className={s.originalTitle}>{e.title}</p>
    <div className={s.byline}>{e.kind==='paper'?e.authors?.join(' · ')||'作者信息见原文':e.language||'语言未标注'}{e.published&&<span> · 发表于 {e.published.slice(0,10)}</span>}<a href={e.url} target="_blank" rel="noreferrer">{e.kind==='paper'?'论文原文':'项目仓库'} ↗</a>{e.pdfUrl&&<a href={e.pdfUrl} target="_blank" rel="noreferrer">PDF ↗</a>}{e.codeUrl&&<a href={e.codeUrl} target="_blank" rel="noreferrer">代码 ↗</a>}</div>
    <p className={s.readingDeck}>{reading?.summary||e.description}</p>
    <div className={s.readingActions}><button className={s.primary} onClick={ask}><Icon name="chat" size={16}/>{e.kind==='paper'?'与这篇论文对话':'与这个项目对话'}</button><button className={s.secondary} disabled={disabled} onClick={save} aria-pressed={!!state?.starred}><Icon name="saved" size={16}/>{state?.starred?'已收藏':'收藏'}</button><button className={s.secondary} disabled={disabled} onClick={mark} aria-pressed={!!state?.readAt}><Icon name="check" size={16}/>{state?.readAt?'已读':'标记已读'}</button><button className={s.iconButton} disabled={disabled} onClick={note} aria-label="写笔记"><Icon name="note"/></button><button className={s.iconButton} disabled={disabled} onClick={add} aria-label="加入合集"><Icon name="plus"/></button></div>
    <details ref={sourceDetails} className={s.sourceDock} id="reading-original"><summary>{e.kind==='paper'?'对照论文原文':'对照固定版本源码'}<span>阅读时按需展开</span></summary><SourceReader key={e.id} entry={e} target={sourceTarget} refreshKey={sourceRefresh} signedIn={signedIn} onPrepared={sourcePrepared} onAsk={studyQuestion}/></details>
    {versions.length>0&&<div className={s.versionTools}><label className={s.versionSelect}>阅读版本<select aria-label="选择阅读版本" value={version} onChange={event=>choose(event.target.value)}>{versions.map(r=><option key={versionKey(r)} value={versionKey(r)}>{levelLabels[r.level]} · {r.generatedAt.slice(0,10)} {new Date(r.generatedAt).toLocaleTimeString('zh-CN',{timeZone:'America/New_York',hour12:false})}{r.visibility==='draft'?' · 草稿':''}</option>)}</select></label>{reading&&<a href={`/api/readings/export?${new URLSearchParams({itemId:e.id,version:reading.generatedAt,level:reading.level})}`}>导出当前阅读 ↗</a>}</div>}
    {reading&&reading.sourceHash!==e.sourceHash&&<p className={s.coverageBox}>这篇解读保留写作时的来源版本；当前榜单简介已有变化，请结合文中固定来源核查。</p>}
    <div className={s.readingProvenance} id="reading-coverage"><span>{reading?`基于${coverageLabel(reading.coverage)}`:e.coverage}</span>{reading&&<span>{reading.sections.length} 节 · 约 {Math.max(1,Math.ceil(length/400))} 分钟</span>}<small>{reading?`${reading.author} · ${reading.generatedAt.slice(0,10)}`:'尚无独立解读'}</small></div>
    <div id="source-entry" className={s.sourceExcerpt}><details><summary>展开已存原始简介</summary><Body text={e.summary}/><a href={e.url} target="_blank" rel="noreferrer">到原始来源核查 ↗</a></details></div>
    {reading?.skillCards&&<SkillGuide cards={reading.skillCards}/>}
    {reading?.sections.map((section,i)=><section key={i} id={`reading-section-${i}`} className={s.readingSection}>
      <span className={s.sectionNumber}>{String(i+1).padStart(2,'0')} / READING</span><h2>{section.heading}</h2><Body text={section.body}/>
      {section.figure&&<FigureFrame f={section.figure}/>}
      <div className={s.sectionHelp}><button onClick={()=>askQuestion(`我正在读「${section.heading}」。\n这段解读：${section.body.slice(0,500)}\n\n请结合本段与原始材料解释机制和必要前提，并举一个具体例子。区分解读的分析与原文事实。`)}><Icon name="chat" size={14}/>没读懂这一节</button><details className={s.sectionCitations}><summary>原文依据 · {section.citations.length}</summary>{section.citations.map(id=>{const source=reading.sources.find(x=>x.id===id);return source?<a key={id} href={source.url} target="_blank" rel="noreferrer">[{id}] {source.title} ↗{source.locator&&<small>{source.locator}</small>}</a>:null;})}</details></div>
    </section>)}
    {reading?.itemId==='paper:2610.01415'&&reading.level==='deep'&&<PoSExperiment/>}
    {reading?.study?.connections&&reading.study.connections.length>0&&<section className={s.readingSection}><h2>从这里继续想</h2>{reading.study.connections.map((connection,i)=><div key={i}><h3>{connection.title}</h3><Body text={connection.body}/>{connection.itemId&&<a href={`#${connection.itemId.startsWith('repo:')?'projects':'papers'}?item=${encodeURIComponent(connection.itemId)}`}>打开关联阅读 →</a>}</div>)}</section>}
    {reading?.terms&&reading.terms.length>0&&<section className={s.readingSection}><h2>术语速查</h2>{reading.terms.map(t=><details className={s.originalDetail} key={t.term}><summary>{t.term}</summary><Body text={t.explanation}/></details>)}</section>}
    {reading&&<><StudyRecord reading={reading}/><section id="reading-limits" className={s.coverageBox}><h2>证据与边界</h2>{reading.limitations.map((line,i)=><p key={i}>{line}</p>)}</section><details id="reading-sources" className={s.originalDetail}><summary>全部引用来源 · {reading.sources.length}</summary>{reading.sources.map(src=><p key={src.id}><a href={src.url} target="_blank" rel="noreferrer">[{src.id}] {src.title} ↗</a>{src.locator&&<small> · {src.locator}</small>}</p>)}</details></>}
    <form className={s.inlineQuestion} onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const text=String(new FormData(form).get('question')||'').trim();if(text){askQuestion(text);form.reset();}}}><label htmlFor="reading-question">读到这里，有什么想问的？</label><textarea id="reading-question" name="question" maxLength={4000} rows={3} placeholder="例如：这个结论有哪些证据支持？"/><button className={s.primary}>带着问题进入对话 <Icon name="arrow" size={15}/></button><small>按对话面板所选依据发送材料，不发送私人笔记。</small></form>
    {state?.note&&<section className={s.savedNote}><span className={s.smallLabel}>我的笔记 · 已保存</span><p>{state.note}</p><button className={s.textButton} onClick={note}>编辑笔记 <Icon name="note" size={14}/></button></section>}
    <div className={s.continuation}>{previous?<button onClick={()=>open(previous)}><span>← 上一篇</span>{previous.displayTitle}</button>:<span/>}{next?<button onClick={()=>open(next)}><span>下一篇 →</span>{next.displayTitle}</button>:<span/>}</div>
  </article>;
}
