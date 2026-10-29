import { createElement, type ReactNode } from 'react';
import { type SourceNode, sourceColor, sourceLink } from '@/lib/feishu-rich-text';

const tags = new Set(['p','h2','h3','h4','h5','h6','ul','ol','li','span','strong','em','del','u','code','pre','blockquote','br','img','a']);
function render(node: SourceNode, key: number): ReactNode {
  if (typeof node === 'string') return node;
  if (!tags.has(node.tag)) return null;
  const children = node.children.map(render);
  const color = sourceColor(node.color); const backgroundColor = sourceColor(node.background);
  const props = { key, style: color || backgroundColor ? { color, backgroundColor } : undefined };
  if (node.tag === 'img') return node.src?.startsWith('/learning-circle/') && !node.src.startsWith('//')
    ? createElement('img', { key, src: node.src, alt: node.alt || '笔记配图', width: node.width, height: node.height, loading: 'lazy' }) : null;
  if (node.tag === 'br') return createElement('br', { key });
  if (node.tag === 'a') return createElement('a', { ...props, href: sourceLink(node.href), target: '_blank', rel: 'noreferrer' }, children);
  return createElement(node.tag, props, children);
}
export default function LearningRichText({ nodes }: { nodes: SourceNode[] }) { return <>{nodes.map(render)}</>; }
