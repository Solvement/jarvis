'use client';
import {useState} from 'react';
import type {Reading} from '@/lib/types';
export default function SkillGuide({cards}:{cards:NonNullable<Reading['skillCards']>}){
 const aliases:Record<string,string>={'diagnosing-bugs':'诊断 排障 错误 调试','retro':'复盘 回顾','pr':'拉取请求 交付','tdd':'测试驱动','handoff':'交接 上下文','code-review':'审查 评审','wayfinder':'规划 决策','grill-with-docs':'需求澄清','grill-me':'需求澄清'};
 const [q,setQ]=useState('');const visible=cards.filter(c=>`${c.name} ${aliases[c.name]||''} ${c.problem} ${c.when} ${c.group} ${c.boundary}`.toLowerCase().includes(q.trim().toLowerCase()));
 return <section className="skill-guide"><h2>遇到这个问题，用哪个 skill？</h2><p>逐项核查的 {cards.length} 个 skill。选用建议是阅读分析，点击名称查看固定版本的原文件。</p><label className="skill-search">搜索问题或 skill<input value={q} onChange={e=>setQ(e.target.value)} placeholder="例如：需求不清楚、bug、交接、写作"/></label><p className="byline">{visible.length} / {cards.length} 个匹配</p><div className="skill-grid">{visible.map(c=><div className="skill-card" key={c.name}><span className="eyebrow">{c.group}{c.experimental?' · 仓库 in-progress':''}</span><h3><a href={c.url} target="_blank" rel="noreferrer">{c.name} ↗</a></h3><p>{c.problem}</p><dl><dt>什么时候用</dt><dd>{c.when}</dd><dt>注意边界</dt><dd>{c.boundary}</dd></dl></div>)}</div>{!visible.length&&<p>没有匹配项，试试另一种问题描述。</p>}</section>;
}
