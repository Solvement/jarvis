import { parseBlocks } from '@/lib/body';

/** 章节正文：段落与分点列表。 */
export default function Body({ text }: { text: string }) {
  return <>{parseBlocks(text).map((b, i) =>
    b.kind === 'p' ? <p key={i}>{b.text}</p>
    : b.kind === 'ul' ? <ul key={i} className="body-list">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
    : <ol key={i} className="body-list">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ol>)}</>;
}
