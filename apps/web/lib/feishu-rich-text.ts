import { load } from 'cheerio';

export type SourceNode = string | {
  tag: 'p'|'h2'|'h3'|'h4'|'h5'|'h6'|'ul'|'ol'|'li'|'span'|'strong'|'em'|'del'|'u'|'code'|'pre'|'blockquote'|'br'|'img'|'a';
  children: SourceNode[]; color?: string; background?: string; href?: string;
  src?: string; alt?: string; width?: number; height?: number;
};

export function sourceColor(value: string | undefined): string | undefined {
  if (!value) return;
  if (/^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(value)) return value.toLowerCase();
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
  if (rgb && rgb.slice(1).every(x => Number(x) <= 255)) return `rgb(${rgb.slice(1).map(Number).join(',')})`;
}

export function sourceLink(value: string | undefined): string | undefined {
  if (!value) return;
  try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') return url.href; } catch {}
}

/** Convert official DocxXML to an allowlisted tree; never render raw source HTML. */
export function parseFeishuRichText(xml: string, images: Record<string, string> = {}) {
  const $ = load(`<source-root>${xml}</source-root>`, { xml: true });
  const colors = new Set<string>(); const unsupported = new Set<string>();
  const tags: Record<string, Exclude<SourceNode, string>['tag']> = {
    p:'p', h2:'h2', h3:'h3', h4:'h4', h5:'h5', h6:'h6', ul:'ul', ol:'ol', li:'li', span:'span',
    b:'strong', strong:'strong', i:'em', em:'em', del:'del', s:'del', u:'u', code:'code', pre:'pre',
    blockquote:'blockquote', br:'br', img:'img', a:'a',
  };
  function convert(node: ReturnType<typeof $>[number]): SourceNode[] {
    if (node.type === 'text') {
      if (node.parent?.type === 'tag' && node.parent.name === 'a') return [node.data];
      return node.data.split(/(https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+)/g).map(text => {
        const href = /^https?:\/\//.test(text) ? sourceLink(text) : undefined;
        return href ? { tag: 'a' as const, href, children: [text] } : text;
      });
    }
    if (node.type !== 'tag') return [];
    if (node.name === 'title' || node.name === 'script' || node.name === 'style') return [];
    const children = node.children.flatMap(convert);
    const tag = tags[node.name];
    if (!tag) { unsupported.add(node.name); return children; }
    const attrs = node.attribs;
    const color = sourceColor(attrs['text-color']);
    const background = sourceColor(attrs['background-color'] || attrs['bg-color']);
    if (color) colors.add(color); if (background) colors.add(background);
    const result: Exclude<SourceNode, string> = { tag, children, ...color ? { color } : {}, ...background ? { background } : {} };
    if (tag === 'a') result.href = sourceLink(attrs.href);
    if (tag === 'img') {
      const src = images[attrs.src];
      if (!src?.startsWith('/learning-circle/') || src.startsWith('//')) throw new Error('文档图片尚未映射到本站公开资源');
      result.src = src; result.alt = attrs.alt || attrs.name || '笔记配图';
      for (const key of ['width', 'height'] as const) if (/^\d+$/.test(attrs[key] || '') && Number(attrs[key]) <= 10_000) result[key] = Number(attrs[key]);
    }
    return [result];
  }
  const nodes = $('source-root').contents().toArray().flatMap(convert);
  return { nodes, colors: [...colors], unsupported: [...unsupported] };
}
