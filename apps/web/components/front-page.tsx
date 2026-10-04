'use client';
import type { Edition, Pick, Reading } from '@/lib/types';

const BOARD: Record<string, string> = {
  'github:daily': 'GitHub 日榜', 'github:weekly': 'GitHub 周榜', 'github:monthly': 'GitHub 月榜',
  'hf:daily': 'HF 日榜', 'hf:weekly': 'HF 周榜', 'hf:monthly': 'HF 月榜',
};
const KIND: Record<Pick['kind'], string> = { core: '内核精读', tool: '工具速查', paper: '论文' };
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const num = (n?: number) => new Intl.NumberFormat('en-US').format(n || 0);

function dateline(edition: string) {
  const [y, m, d] = edition.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${y} 年 ${m} 月 ${d} 日 · 星期${WEEKDAY[w]}`;
}

function statusLabel(p: Pick, hasDeep: boolean) {
  if (hasDeep || p.status === 'published') return p.plan === 'guide' ? '指南已发布' : '精读已发布';
  if (p.status === 'reading') return '正在精读';
  return p.plan === 'guide' ? '使用指南 · 待写' : p.plan === 'deep' ? '精读排队中' : '摘要';
}

function readingFor(readings: Reading[], itemId: string) {
  return readings.find((r) => r.itemId === itemId && r.level === 'deep') ?? readings.find((r) => r.itemId === itemId && r.level === 'brief');
}

function Kicker({ p }: { p: Pick }) {
  const e = p.entry;
  return <div className="fp-kicker">
    <span className="fp-kind">{KIND[p.kind]}</span>
    <span>{BOARD[p.board] ?? p.board}</span>
    {e?.stars ? <span>★ {num(e.stars)}</span> : null}
    {e?.votes ? <span>▲ {num(e.votes)}</span> : null}
    {e?.language ? <span>{e.language}</span> : null}
  </div>;
}

function Links({ p, reading }: { p: Pick; reading?: Reading }) {
  const deep = reading?.level === 'deep';
  return <div className="fp-links">
    <span className={'fp-status' + (deep ? ' done' : '')}>{statusLabel(p, deep)}</span>
    {reading && <a href={`#/read/${encodeURIComponent(p.itemId)}`}>{deep ? '读精读' : '读摘要'} →</a>}
    {p.entry && <a href={p.entry.url} target="_blank" rel="noreferrer">{p.kind === 'paper' ? '原文' : '仓库'} ↗</a>}
  </div>;
}

/** 报纸式首页：头条 + 分栏看点卡 + 工具速查。每张卡只承诺"看点"，不冒充已读源码。 */
export default function FrontPage({ edition, readings }: { edition?: Edition | null; readings: Reading[] }) {
  if (!edition?.picks.length)
    return <div className="front"><div className="empty"><h1>今日推荐尚未发布</h1><p>可以先看 <a href="#/github/monthly">GitHub 月榜</a>。</p></div></div>;
  const [lead, ...rest] = edition.picks.filter((p) => p.kind !== 'tool');
  const tools = edition.picks.filter((p) => p.kind === 'tool');
  const leadReading = lead && readingFor(readings, lead.itemId);
  const reading = edition.picks.filter((p) => p.status === 'reading');
  const queue = edition.picks.filter((p) => p.plan === 'deep' && p.status === 'queued');
  return <div className="front">
    <div className="fp-dateline"><span>今日推荐</span><span>{dateline(edition.edition)}</span><span>{edition.picks.length} 张看点卡 · 月榜优先</span></div>
    <div className="fp-top">
    {lead && <article className="fp-lead">
      <Kicker p={lead} />
      <h2><a href={leadReading ? `#/read/${encodeURIComponent(lead.itemId)}` : lead.entry?.url}>{lead.headline}</a></h2>
      <p className="fp-project">{lead.entry?.title ?? lead.itemId}</p>
      <p className="fp-deck">{lead.highlight}</p>
      <p className="fp-why">{lead.why}</p>
      <Links p={lead} reading={leadReading} />
    </article>}
    <aside className="fp-index" aria-label="本期索引">
      <h2>本期索引</h2>
      <dl>
        <div><dt>内核项目</dt><dd>{edition.picks.filter((p) => p.kind === 'core').length}</dd></div>
        <div><dt>论文</dt><dd>{edition.picks.filter((p) => p.kind === 'paper').length}</dd></div>
        <div><dt>工具</dt><dd>{tools.length}</dd></div>
      </dl>
      {!!reading.length && <><h3>正在精读</h3><ul>{reading.map((p) => <li key={p.itemId}><a href={`#/read/${encodeURIComponent(p.itemId)}`}>{p.headline}</a></li>)}</ul></>}
      <h3>精读排队</h3>
      <ol>{queue.slice(0, 5).map((p) => <li key={p.itemId}><span>{p.entry?.title ?? p.itemId}</span></li>)}</ol>
    </aside>
    </div>
    {!!rest.length && <div className="fp-columns">{rest.map((p) => {
      const r = readingFor(readings, p.itemId);
      return <article key={p.itemId} className="fp-card">
        <Kicker p={p} />
        <h3><a href={r ? `#/read/${encodeURIComponent(p.itemId)}` : p.entry?.url}>{p.headline}</a></h3>
        <p className="fp-project">{p.entry?.title ?? p.itemId}</p>
        <p className="fp-highlight"><b>看点</b>{p.highlight}</p>
        <p className="fp-why">{p.why}</p>
        <Links p={p} reading={r} />
      </article>;
    })}</div>}
    {!!tools.length && <section className="fp-tools">
      <h2>工具速查 <small>会用就行：每个工具一句话说清用在哪</small></h2>
      <ol>{tools.map((p) => <li key={p.itemId}>
        <a className="fp-tool-name" href={p.entry?.url} target="_blank" rel="noreferrer">{p.entry?.title ?? p.itemId}</a>
        <span className="fp-tool-line">{p.highlight}</span>
        <span className="fp-tool-board">{BOARD[p.board] ?? p.board}</span>
      </li>)}</ol>
    </section>}
    <p className="fp-footnote">看点卡依据 README 与文件结构写成（每张卡标注实际阅读范围），用于决定读什么；源码级精读发布后，卡片状态会变为"精读已发布"。</p>
  </div>;
}
