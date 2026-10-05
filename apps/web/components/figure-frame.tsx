'use client';
import type { Figure } from '@/lib/types';

/** 沙箱渲染作者提供的图示：允许脚本（交互演示需要），不给同源权限，读不到本站 cookie 与存储。 */
export default function FigureFrame({ f }: { f: Figure }) {
  return <figure className="reading-figure">
    <figcaption className="figure-title">{f.title}</figcaption>
    <iframe title={f.title} srcDoc={f.html} sandbox="allow-scripts" loading="lazy" style={{ height: f.height }} />
    <p className="figure-caption">{f.caption}</p>
  </figure>;
}
