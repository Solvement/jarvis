'use client';
import { useEffect,useRef,useState } from 'react';
import type { DeskEntry,ChatReference } from '@/lib/desk-types';
import type { SourceDocument } from '@/lib/source-types';
import { studyQuestions } from '@/lib/project-study-model';
import { api } from './ui';
import s from './desk.module.css';

export type SourceTarget={reference:ChatReference;nonce:number};
export default function SourceReader({entry,target,refreshKey,signedIn,onPrepared,onAsk}:{
  entry:DeskEntry;target:SourceTarget|null;refreshKey:string;signedIn:boolean;onPrepared:(doc:SourceDocument|null)=>void;onAsk:(question:string)=>void;
}) {
  const [document,setDocument]=useState<SourceDocument|null>(null),[open,setOpen]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[focus,setFocus]=useState(''),[path,setPath]=useState('');
  const body=useRef<HTMLDivElement>(null);const paper=entry.kind==='paper';
  function prepared(doc:SourceDocument|null){setDocument(doc);onPrepared(doc);}
  useEffect(()=>{
    if(!signedIn){setLoading(false);return;}
    if(target?.reference.documentId)return;
    const abort=new AbortController();
    api<{document:SourceDocument|null}>(`/api/sources?itemId=${encodeURIComponent(entry.id)}`,{signal:abort.signal}).then(result=>prepared(result.document)).catch((e:Error)=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[entry.id,signedIn,refreshKey,target?.nonce]);
  useEffect(()=>{
    if(!target?.reference.documentId)return;let active=true;
    setOpen(true);setQuery('');setFocus('');
    const show=(doc:SourceDocument)=>{if(!active)return;prepared(doc);setLoading(false);setError('');setFocus(target.reference.chunkId||'');};
    if(document?.id===target.reference.documentId)show(document);
    else api<{document:SourceDocument|null}>(`/api/sources?itemId=${encodeURIComponent(entry.id)}&documentId=${encodeURIComponent(target.reference.documentId)}`).then(result=>{if(result.document)show(result.document);else if(active)setError('这条引用的原文快照未找到');}).catch((e:Error)=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[target?.nonce]);
  useEffect(()=>{
    if(!open||!document||document.id!==target?.reference.documentId)return;
    const frame=requestAnimationFrame(()=>window.document.getElementById(`original-${document.id}-${target.reference.chunkId}`)?.scrollIntoView({behavior:'smooth',block:'center'}));
    return()=>cancelAnimationFrame(frame);
  },[open,document?.id,focus,target?.nonce]);
  async function fetchSource(force=false,paths?:string[]){
    if(busy)return;setBusy(true);setError('');
    try{const result=await api<{document:SourceDocument}>('/api/sources',{method:'POST',body:JSON.stringify({itemId:entry.id,force,...(paths?{paths}:{})})});prepared(result.document);setOpen(true);setFocus('');setPath('');}
    catch(e){setError(e instanceof Error?e.message:'获取未完成');}finally{setBusy(false);}
  }
  const headings=document?[...new Set(document.chunks.map(c=>c.path||c.heading))]:[];
  const chunks=document?.chunks.filter(c=>(!query||`${c.text} ${c.heading} ${c.path||''}`.toLowerCase().includes(query.toLowerCase()))&&(!focus||c.id===focus||c.path===focus||c.heading===focus))||[];
  const repo=document?.repository;
  return <section className={s.sourceReader} aria-label={paper?'论文全文':'源码精读'}>
    <div className={s.sourceReaderHeader}><div><span className={s.smallLabel}>{paper?'PAPER / ORIGINAL TEXT':'PROJECT / ENGINEERING STUDY'}</span><h2>{paper?'回到论文原文':'按工程价值，拆解项目'}</h2><p>{loading?'正在检查已存原始材料…':document?paper?`${document.kind==='paper_html'?'HTML 正文':`${document.pages} 页 PDF`} · ${document.chunks.length} 段 · ${document.sourceVersion}`:`固定 ${repo?.commit.slice(0,12)} · 已获取 ${repo?.selected.length}/${repo?.treeCount} 个文件` :paper?'获取原文后，AI 从全文定位证据；获取失败会明确提示。':'先评估工程价值，再追踪主链路；支持模型、后端、全栈、Agent、软件与 Infra。'}</p></div><div>{document&&<button className={s.secondary} onClick={()=>setOpen(!open)} aria-expanded={open}>{open?'收起原始材料':paper?'阅读原文':'查看源码证据'}</button>}<button className={s.primary} disabled={!signedIn||busy||loading} onClick={()=>fetchSource(!!document)}>{busy?paper?'正在获取并解析…':'正在读取固定版本…':document?paper?'检查新版全文':'更新源码快照':paper?'获取论文全文':'建立源码证据包'}</button></div></div>
    {!signedIn&&<p className={s.sourceHint}>登录后获取原文并保存引用快照。</p>}
    {error&&<p className={s.chatError} role="alert">{error}</p>}
    {document&&<>
      {!paper&&<div className={s.studySteps}>{studyQuestions.map((step,i)=><button key={step.id} onClick={()=>onAsk(step.question)}><span>0{i+1}</span><strong>{step.label}</strong><small>带着源码依据进入 AI 对话 →</small></button>)}</div>}
      <details className={s.sourceLimits}><summary>{paper?'解析范围与限制':'证据覆盖与尚未验证的部分'}</summary>{document.limitations.map((limit,i)=><p key={i}>{limit}</p>)}<p>来源 <a href={document.sourceUrl} target="_blank" rel="noreferrer">打开固定原文版本 ↗</a> · 获取于 {new Date(document.fetchedAt).toLocaleString('zh-CN',{timeZone:'America/New_York'})}（美东）</p></details>
      {open&&<div className={s.originalWorkspace} ref={body}><aside><label htmlFor="original-search">{paper?'搜索全文':'搜索已读源码'}</label><input id="original-search" type="search" value={query} onChange={e=>{setQuery(e.target.value);setFocus('');}} placeholder={paper?'关键词、公式或实验名称…':'符号、文件或实现细节…'}/><button className={!focus?s.sourceSelected:''} onClick={()=>setFocus('')}>{paper?'全部原文':'全部已读文件'} · {document.chunks.length} 段</button><nav aria-label={paper?'原文章节':'已读源码文件'}>{headings.map(heading=><button key={heading} title={heading} className={focus===heading?s.sourceSelected:''} onClick={()=>{setFocus(heading);setQuery('');}}>{heading}</button>)}</nav></aside><div className={s.originalPassages} aria-label="原始材料片段"><div className={s.originalBar}><span>{chunks.length} 段{focus&&' · 已定位'}</span>{focus&&<button onClick={()=>setFocus('')}>展开全文</button>}<a href={document.sourceUrl} target="_blank" rel="noreferrer">原始来源 ↗</a></div>{chunks.map(c=><article key={c.id} id={`original-${document.id}-${c.id}`} data-source-chunk={c.id} data-highlight={target?.reference.documentId===document.id&&target.reference.chunkId===c.id||undefined}><div><span>[{paper?'P':'C'}{c.ordinal+1}] {c.path?`${c.path}:${c.lineStart}–${c.lineEnd}`:c.page?`第 ${c.page} 页`:c.heading}</span><a href={c.url} target="_blank" rel="noreferrer">{paper?'原文位置':'固定源码行'} ↗</a></div>{c.path?<pre><code>{c.text}</code></pre>:<p>{c.text}</p>}</article>)}{!chunks.length&&<p className={s.sourceHint}>没有匹配片段，试试英文术语或清除搜索。</p>}</div></div>}
      {!paper&&repo&&<details className={s.sourceLimits}><summary>补读文件：先追踪缺失调用，再扩展覆盖</summary><p>从固定 commit 的目录选择文件；每次最多补读 10 个，证据包最多 30 个文件。不执行下载的代码。</p><label htmlFor="source-path">文件路径</label><div className={s.addSourceFile}><input id="source-path" list="source-files" value={path} onChange={e=>setPath(e.target.value)} placeholder="选择或输入需要追踪的文件路径"/><datalist id="source-files">{repo.files.filter(f=>!repo.selected.includes(f.path)&&(!path||f.path.toLowerCase().includes(path.toLowerCase()))).slice(0,100).map(f=><option key={f.path} value={f.path}/>)}</datalist><button className={s.secondary} disabled={busy||!path.trim()} onClick={()=>fetchSource(false,[path.trim()])}>加入证据包</button></div><p>已获取：{repo.selected.join('、')}</p>{repo.skipped.length>0&&<p>未取得：{repo.skipped.join('、')}</p>}</details>}
    </>}
  </section>;
}
