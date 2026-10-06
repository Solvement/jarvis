import type {Reading} from './types';
export function studyLabel(r:Reading){return r.format==='research'?'研究简报':r.format==='skill_guide'?'Skill 选用指南':r.level==='deep'?(r.study?.status==='accepted'?'精读 · 已复核':r.study?.status==='accepted_main_text'?'专题精读 · 已复核':'精读 · 待复核'):r.level==='brief'?'摘要解读':'原文翻译';}
