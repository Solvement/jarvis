import type {Board,Period} from '@/lib/types';
import type {DeskEntry} from '@/lib/desk-types';
import {dailyStudies,todayBoard} from '@/lib/discovery';
import s from './desk.module.css';

export default function Today({entries,boards,day,open,projects}:{entries:DeskEntry[];boards:Board[];day:string;open:(e:DeskEntry)=>void;projects:(period:Period)=>void}){
 const studies=dailyStudies(entries,boards,day);
 return <section className={s.todayOverview} aria-label="美东今日发现">
  <div className={s.samplesHeading}><span>从今天的榜单，读进一个问题</span><small>上榜日期与发表日期分别标注</small></div>
  {studies.length>0?<div className={s.sampleGrid}>{studies.map(e=><button className={s.sampleCard} key={e.id} onClick={()=>open(e)}><small>{e.kind==='paper'?'今日论文精读':'今日项目精读'} · 选题时 {e.dailyStudy?.board==='hf:daily'?'HF 日榜':e.dailyStudy?.board==='github:weekly'?'GitHub 周榜':e.dailyStudy?.board==='github:monthly'?'GitHub 月榜':'GitHub 日榜'} #{e.dailyStudy?.rank}</small><h2>{e.displayTitle}</h2><p>{e.description}</p><span>{e.kind==='paper'?`论文发表于 ${e.published||'原文未标注'} · 今日上榜 ${day}`:`GitHub 快照 ${day}`} →</span></button>)}</div>:<p className={s.sourceHint}>今天的榜单在下面；当天精读尚未完成时，不用历史样章填充。</p>}
  <div className={s.todayBoardGrid}>{(['daily','weekly','monthly'] as Period[]).map(period=>{
   const b=todayBoard(boards,'github',period,day);
   return <section key={period} aria-label={`今日 GitHub ${{daily:'日榜',weekly:'周榜',monthly:'月榜'}[period]}`}><div><h2>GitHub {{daily:'日榜',weekly:'周榜',monthly:'月榜'}[period]}</h2><span>{b?.items.length||0} 项</span></div><p className={s.todayBoardDate}>美东 {day} · {b?'已保存今日快照':'今日快照尚未取得'}</p>{b?.items.slice(0,3).map((item,i)=>{const e=entries.find(e=>e.id===item.id);return <button key={item.id} onClick={()=>e&&open(e)}><small>0{i+1}</small><span><strong>{item.title}</strong><p>{e?.introduction?.summary||item.summary||'打开项目查看原始资料'}</p></span></button>;})}<button className={s.textButton} onClick={()=>projects(period)}>查看本榜全部 →</button></section>;
  })}</div>
 </section>;
}
