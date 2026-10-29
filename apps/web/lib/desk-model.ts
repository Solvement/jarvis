import type { Board, Entry, Reading } from './types';
import type { DeskEntry } from './desk-types';

export const topicRules: [string, RegExp][] = [
  ['Agents', /agent|智能体|助手|harness|orchestrat/i],
  ['Memory', /memory|context|记忆|上下文|compact/i],
  ['Code', /coding|code|代码|编程|developer|软件/i],
  ['Retrieval', /retriev|\brag\b|检索|知识库|search/i],
  ['Evaluation', /evaluat|benchmark|评估|评测|测试/i],
  ['Training', /train|reinforcement|训练|强化学习|fine.?tun/i],
  ['Multimodal', /vision|image|video|audio|视觉|图像|视频|语音|多模态/i],
];
export const topicLabels: Record<string, string> = { Agents:'智能体', Memory:'记忆与上下文', Code:'代码与开发', Retrieval:'检索与知识', Evaluation:'评估与测试', Training:'训练与学习', Multimodal:'多模态', Other:'更多研究' };
export const versionKey = (r: Reading) => `${r.generatedAt}:${r.level}`;
export function coverageLabel(coverage:string):string {
  return ({fulltext:'论文正文',abstract:'论文摘要',readme:'项目 README',source_code:'源码',translation:'原文翻译',title_only:'仅标题',listing:'榜单简介'} as Record<string,string>)[coverage]||coverage;
}
export function chooseReading(versions: Reading[], version?: string): Reading | undefined {
  if (version) return versions.find(r => versionKey(r) === version);
  return versions.find(r => r.level === 'deep') || versions.find(r => r.level === 'brief') || versions[0];
}

/** 所有已存快照组成历史目录；离榜条目仍能搜索与进入个人书架。 */
export function assembleCatalog(boards: Board[], versions: Reading[]): DeskEntry[] {
  const entries = new Map<string, { entry: Entry; dates: Set<string>; latest: string }>();
  for (const board of [...boards].sort((a,b) => b.fetchedAt.localeCompare(a.fetchedAt))) {
    for (const e of board.items) {
      const known = entries.get(e.id);
      if (known) known.dates.add(board.sourceDate);
      else entries.set(e.id, { entry: e, dates: new Set([board.sourceDate]), latest: board.sourceDate });
    }
  }
  const byItem = new Map<string, Reading[]>();
  for (const r of [...versions].sort((a,b) => b.generatedAt.localeCompare(a.generatedAt))) {
    byItem.set(r.itemId, [...byItem.get(r.itemId) || [], r]);
    if (!entries.has(r.itemId) && r.entry) entries.set(r.itemId, { entry:r.entry, dates:new Set([r.generatedAt.slice(0,10)]), latest:r.generatedAt.slice(0,10) });
  }
  return [...entries.values()].map(({ entry:e, dates, latest }) => {
    const all = byItem.get(e.id) || [];
    const r = chooseReading(all);
    const translated = all.find(r => r.level === 'translation');
    const intro=e.kind==='project'?all.find(r=>r.format==='project_intro'):undefined;
    const example=intro?.sections.find(section=>section.heading==='举个例子')?.body||'';
    const text = `${e.title} ${e.summary} ${r?.title || ''} ${r?.summary || ''}`;
    const topics = topicRules.filter(([,re]) => re.test(text)).map(([tag]) => tag);
    return { ...e, displayTitle:r?.title || translated?.title || e.title, description:intro?.summary || r?.summary || translated?.summary || e.summary,
      topics:topics.length ? topics : ['Other'], editions:[...dates].sort().reverse(), latestSeen:latest,
      levels:[...new Set(all.map(r => r.level))], coverage:r?.coverage || (e.kind === 'paper' ? '已存论文榜单简介；未获取全文' : '已存 GitHub 榜单简介；未读取仓库源码'),
      ...(r?.discovery?{dailyStudy:r.discovery}:{}),
      ...(intro?{introduction:{summary:intro.summary,example,version:versionKey(intro),generatedAt:intro.generatedAt,sourceUrl:intro.sources[0]?.url,coverage:coverageLabel(intro.coverage)}}:{}),
    };
  }).sort((a,b) => b.latestSeen.localeCompare(a.latestSeen) || a.rank-b.rank || a.id.localeCompare(b.id));
}

