import type {DeskEntry} from '@/lib/desk-types';
import {Icon} from './ui';
import s from './desk.module.css';

const samples=[
 {id:'paper:2309.06180',label:'论文 / 经典系统设计',title:'一台 GPU 上，推理服务怎样长出来',path:'单请求 → 批处理 → 分块 → 共享 → 抢占',name:'PagedAttention · arXiv v1 / 2023'},
 {id:'repo:mksglu/context-mode',label:'项目 / 工程写法样章',title:'从一份日志，拆出上下文管理链路',path:'工具输出 → 保存 → 检索 → 取证 → 取舍',name:'ContextMode · commit 3bcbec8'},
];
export default function ReadingSamples({entries,open}:{entries:DeskEntry[];open:(entry:DeskEntry)=>void}){
 const cards=samples.map(sample=>({...sample,entry:entries.find(e=>e.id===sample.id&&e.levels.includes('deep'))}));
 if(cards.some(card=>!card.entry))return null;
 return <section className={s.readingSamples} aria-label="从问题出发的精读样章"><div className={s.samplesHeading}><span>经典与写法参考</span><small>固定样章 · 独立于每日发现</small></div><div className={s.sampleGrid}>{cards.map(card=><button key={card.id} onClick={()=>open(card.entry!)} className={s.sampleCard}><small>{card.label}</small><h2>{card.title}</h2><p>{card.path}</p><span>{card.name}<Icon name="arrow" size={16}/></span></button>)}</div></section>;
}
