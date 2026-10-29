'use client';
import { useEffect,useRef,useState } from 'react';
import type { ChatContext,ChatReference,ChatTurn,DeskEntry,ModelInfo } from '@/lib/desk-types';
import { api,Icon } from './ui';
import Body from '@/components/body';
import s from './desk.module.css';

function readableAnswer(turn:ChatTurn){
  const ids=new Set(turn.context.references.map(ref=>ref.id));
  return turn.answer.replace(/\[((?:P|C|E)\d+)\]/g,(match,id:string)=>ids.has(id)?'':match)
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g,'$1')
    .replace(/^#{1,6}\s+/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1');
}

export default function ChatPanel({entry,version,coverage,close,cite,saveNote,initialQuestion,signedIn,mode,changeMode,codeReady,sourceReady}:{
  entry:DeskEntry;version:string;coverage:string;close:()=>void;cite:(ref:ChatReference,version:string)=>void;
  saveNote:(text:string)=>void;initialQuestion:{text:string;nonce:number};signedIn:boolean;
  mode:'fulltext'|'reading'|'code';changeMode:(mode:'fulltext'|'reading'|'code')=>void;codeReady:boolean;sourceReady:(id:string)=>void;
}) {
  const [turns,setTurns]=useState<ChatTurn[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [model,setModel]=useState<ModelInfo|null>(null);
  const [context,setContext]=useState<ChatContext|null>(null),[phase,setPhase]=useState('');
  const abort=useRef<AbortController|null>(null),end=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),follow=useRef(true),loadedDraft=useRef(false);
  useEffect(()=>{
    let active=true;
    setInput(sessionStorage.getItem(`jarvis-question:${entry.id}`)||'');loadedDraft.current=true;
    if(!signedIn){setLoading(false);return;}
    api<{turns:ChatTurn[];model:ModelInfo}>(`/api/chat?id=${encodeURIComponent(entry.id)}`)
      .then(data=>{if(active){setTurns(data.turns);setModel(data.model);}}).catch((e:Error)=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;abort.current?.abort();};
  },[entry.id,signedIn]);
  useEffect(()=>{if(initialQuestion.text)setInput(initialQuestion.text);},[initialQuestion.nonce,initialQuestion.text]);
  useEffect(()=>{if(loadedDraft.current)sessionStorage.setItem(`jarvis-question:${entry.id}`,input);},[entry.id,input]);
  useEffect(()=>{if(follow.current)end.current?.scrollIntoView({block:'nearest'});},[turns,busy]);
  function replace(turn:ChatTurn){setTurns(all=>all.some(t=>t.id===turn.id)?all.map(t=>t.id===turn.id?turn:t):[...all,turn]);}
  async function send(question:string) {
    if(!question.trim()||busy||loading||!signedIn)return;
    setBusy(true);setError('');setPhase(mode==='fulltext'?'正在获取全文并定位原文依据…':mode==='code'?'正在从已读源码定位依据…':'正在整理已有阅读材料…');follow.current=true;
    const controller=new AbortController();abort.current=controller;
    let turnId='',finished=false;
    try {
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({itemId:entry.id,question:question.trim(),mode,...(version?{version}:{})})});
      if(!response.ok){const body=await response.json();throw new Error(body.error||'提问失败');}
      if(!response.body)throw new Error('没有收到回答');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      try{
        while(true){
          const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
          let index:number;
          while((index=buffer.indexOf('\n'))!==-1){
            const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.trim())continue;
            const event=JSON.parse(line);
            if(event.type==='start'){turnId=event.turn.id;replace(event.turn);setInput('');setContext(event.turn.context);setPhase('正在生成回答…');if(event.turn.context.document)sourceReady(event.turn.context.document.id);}
            if(event.type==='delta')setTurns(all=>all.map(t=>t.id===turnId?{...t,answer:t.answer+event.text}:t));
            if(event.type==='done'||event.type==='error'){finished=true;if(event.turn)replace(event.turn);if(event.error)setError(event.error);}
          }
          if(done)break;
        }
        if(!finished)throw new Error('连接提前结束，请重试。');
      }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }catch(e){
      const stopped=controller.signal.aborted;
      if(!stopped)setError(e instanceof Error?e.message:'连接失败');
      if(turnId)setTurns(all=>all.map(t=>t.id===turnId?{...t,status:stopped?'stopped':'error'}:t));
      else setInput(question);
    }finally{setBusy(false);setPhase('');abort.current=null;}
  }
  return <aside className={s.chatPanel} aria-label="阅读 AI 对话"><div className={s.chatHeader}><div><Icon name="chat"/><strong>一起读懂</strong><span>{model?.model||'真实模型'}</span></div><button className={s.iconButton} onClick={close} aria-label="关闭对话"><Icon name="close"/></button></div>
    <div className={s.chatContext}><label className={s.chatMode}>回答依据<select aria-label="对话依据" value={mode} disabled={busy} onChange={e=>{changeMode(e.target.value as typeof mode);setContext(null);}}>{entry.kind==='paper'?<option value="fulltext">论文全文（默认）</option>:<option value="code" disabled={!codeReady}>固定版本源码{!codeReady?' · 先建立证据包':''}</option>}<option value="reading">已有解读与简介</option></select></label><strong>{entry.displayTitle}</strong><small>{context?.mode===(mode==='fulltext'?'paper-fulltext':mode==='code'?'project-code':'reading')?context.coverage:mode==='fulltext'?'提问时获取并解析全文，从原文检索依据；点击引用定位段落或 PDF 页。':mode==='code'?'基于固定 commit 的已读文件回答，引用定位到具体源码行。':coverage}</small></div>
    <div ref={scroll} className={s.chatMessages} aria-busy={busy||loading} onScroll={()=>{const el=scroll.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}}>
      {loading?<p className={s.chatStatus} role="status">正在载入私人对话…</p>:!signedIn?<div className={s.chatWelcome}><h3>登录后开始对话</h3><p>对话记录只对你的账户可见。</p></div>:!turns.length?<div className={s.chatWelcome}><span className={s.chatGlyph}><Icon name="chat" size={26}/></span><h3>从一个问题开始。</h3><p>基于已存材料回答，<br/>遇到证据不足会明确说明。</p><div>{['用大白话解释它的核心思路','这个结论有哪些依据和局限？','这对我的 Agent 项目有什么启发？'].map(q=><button key={q} disabled={busy||!model?.configured} onClick={()=>send(q)}>{q}<Icon name="arrow" size={15}/></button>)}</div></div>:turns.map(turn=><div key={turn.id} className={s.chatTurn} data-turn-id={turn.id} data-status={turn.status}>
        <div className={s.userMessage}><span className={s.messageRole}>你</span><p>{turn.question}</p></div>
        <div className={s.assistantMessage}><span className={s.messageRole}>JARVIS · {turn.model}{!turn.context.document&&turn.version!==(version||`listing:${entry.sourceHash}`)?' · 其他阅读版本':''}</span>
          <small className={s.answerCoverage}>{turn.context.mode==='paper-fulltext'?`基于论文原文 · ${turn.context.document?.selectedChunks}/${turn.context.document?.totalChunks} 段`:turn.context.mode==='project-code'?`基于固定源码 · ${turn.context.document?.commit?.slice(0,10)}`:'基于已有解读'}</small><Body text={turn.answer?readableAnswer(turn):(turn.status==='streaming'?'正在生成…':turn.status==='error'?'这次未完成回答。':'已停止生成。')}/>
          {turn.context.references.some(ref=>turn.answer.includes(`[${ref.id}]`))&&<details className={s.chatEvidence}><summary>查看原文依据与定位</summary><div>{turn.context.references.filter(ref=>turn.answer.includes(`[${ref.id}]`)).map(ref=><button key={ref.id} onClick={()=>cite(ref,turn.version)}>[{ref.id}] {ref.title} →</button>)}</div></details>}
          <div className={s.messageTools}>
            {turn.answer&&turn.status!=='streaming'&&<button onClick={()=>saveNote(turn.answer)}><Icon name="note" size={13}/>转存笔记</button>}
            {['error','stopped'].includes(turn.status)&&<button disabled={busy||loading} onClick={()=>send(turn.question)}>重新提问 ↻</button>}
            <span>{turn.status==='complete'?'已保存':turn.status==='stopped'?'已停止':turn.status==='error'?'未完成':'生成中'}</span>
          </div>
        </div>
      </div>)}<div ref={end}/>
    </div>
    {phase&&<p className={s.chatStatus} role="status">{phase}</p>}{error&&<p className={s.chatError} role="alert">{error}</p>}
    <form className={s.chatForm} onSubmit={event=>{event.preventDefault();send(input);}}><label htmlFor="desk-question">继续提问</label><div><textarea id="desk-question" value={input} onChange={event=>setInput(event.target.value)} maxLength={4000} rows={2} placeholder="这篇内容里，你想弄清楚什么？" onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();send(input);}}}/>{busy?<button type="button" className={s.primary} onClick={()=>abort.current?.abort()}>停止</button>:<button className={s.primary} aria-label="发送问题" disabled={!input.trim()||loading||!signedIn||!model?.configured}><Icon name="arrow"/></button>}</div><p>真实模型生成 · 当前条目材料会发送给 {model?.provider||'已配置的模型服务'} · 不发送私人笔记</p></form>
  </aside>;
}
