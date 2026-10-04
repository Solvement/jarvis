import type {Reading} from './types';
// Structural admission checks support the editorial review; they cannot certify understanding.
export function validateDeep(r:Reading){
 if(r.level!=='deep')return;
 const s=r.study;
 if(!['fulltext','source_code'].includes(r.coverage))throw Error('精读必须基于论文正文或实际源码');
 if(!s||!s.scope||!s.sourceSnapshot||!/^https:\/\//.test(s.sourceSnapshot))throw Error('精读缺少明确范围及固定来源快照');
 if(!['draft','needs_review','accepted_main_text','accepted'].includes(s.status))throw Error('精读复核状态无效');
 if(!s.sourceCoverage?.some(x=>x.level==='read'&&x.path&&x.reason))throw Error('精读缺少实际阅读覆盖记录');
 const sources=new Set(r.sources.map(x=>x.id));
 if(!s.claims?.length||s.claims.some(c=>!c.id||!c.text||!['fact','implementation','benchmark','inference','personal_application'].includes(c.kind)||!c.evidence?.length||c.evidence.some(e=>!sources.has(e.source)||!e.anchor||!['direct','indirect','weak'].includes(e.support))))throw Error('精读关键论断必须区分事实与分析并定位证据');
 const claims=new Set(s.claims.map(c=>c.id));
 if(!s.mechanisms?.length||s.mechanisms.some(m=>!m.id||!m.name||!m.boundary||m.steps?.length<3||m.steps.length>6||!m.claims?.length||m.claims.some(c=>!claims.has(c))))throw Error('精读缺少可复述的机制步骤及关联论断');
 if(!s.connections?.length||s.connections.some(c=>!c.title||!c.body))throw Error('精读缺少关联分析');
 if(!s.review?.method||!s.review.checkedAt||Number.isNaN(Date.parse(s.review.checkedAt))||!s.review.findings?.length||!Array.isArray(s.openQuestions))throw Error('精读缺少复核记录及开放问题');
 if(r.sections.length<4)throw Error('精读缺少问题、机制、证据与分析的完整展开');
}
