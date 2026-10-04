import type {Reading} from './types';
import {studyLabel} from './reading-label';
export function readingMarkdown(r:Reading){
 const markdown=[`# ${r.title}`,r.summary,`作者：${r.author} | ${r.generatedAt} | ${studyLabel(r)}`,r.study?`阅读范围：${r.study.scope}\n固定来源：${r.study.sourceSnapshot}`:'',...(r.skillCards||[]).flatMap(c=>[`## ${c.name}`,c.problem,`什么时候用：${c.when}`,`边界：${c.boundary}`,`[固定来源](${c.url})`]),...r.sections.flatMap(s=>[`## ${s.heading}`,s.body,...s.citations.map(id=>{const x=r.sources.find(s=>s.id===id);return x?`来源：[${x.locator||x.title}](${x.url})`:'';})]),...(r.study?.connections||[]).flatMap(c=>[`## 关联分析：${c.title}`,c.body]),'## 边界与未验证内容',...r.limitations.map(x=>'- '+x),'## 来源索引',...r.sources.map(s=>`- [${s.locator||s.title}](${s.url})`),'## 可追溯结构化记录','```json',JSON.stringify(r.study||{status:'reference'},null,2),'```'].join('\n\n');
 return markdown;
}
