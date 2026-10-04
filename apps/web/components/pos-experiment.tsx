'use client';
import {useState} from 'react';
export default function PoSExperiment(){
 const [p,setP]=useState(.8),[s,setS]=useState(.6),[r,setR]=useState(.3);
 const health=1-p*Math.max(s,r);
 return <section className="mechanism" aria-labelledby="mechanism-heading"><span className="eyebrow">动手理解 / 教学演示</span><h2 id="mechanism-heading">调一调：什么情况下健康度会下降？</h2><p>这里把两类缺口的最大持续程度合成 P。滑杆是人为示例，不是论文实验数据或成功率预测。</p>{[[p,setP,'缺口持续 P'],[s,setS,'状态停滞 S'],[r,setR,'状态重复 R']].map(([value,setter,label])=><label key={label as string}><span>{label as string}<b>{Number(value).toFixed(2)}</b></span><input type="range" min="0" max="1" step=".05" value={value as number} aria-label={label as string} onChange={e=>(setter as (n:number)=>void)(Number(e.target.value))}/></label>)}<output>H = 1 − P × max(S, R) = <strong>{health.toFixed(2)}</strong></output><p>{health<.25?'这个示例呈现持续缺口与停滞或循环共同出现的情况。':'只要缺口持续程度或停滞／循环较低，公式就会给出较高健康度。高分本身不能证明任务正确完成。'}</p><div className="mechanism-flow"><span>观察</span><span>候选信念</span><span>一致性检查</span><span>进度监控</span><span>行动或恢复</span></div></section>;
}
