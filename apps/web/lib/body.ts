/** 章节正文的极简结构：段落与列表。只认 "- " 与 "1. " 两种行首，不做完整 Markdown。 */
export type Block = { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] };

const UL = /^\s*[-•]\s*/;
const OL = /^\s*\d+[.、]\s*/;

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const para of body.split(/\n\s*\n/)) {
    let text: string[] = [];
    let list: { kind: "ul" | "ol"; items: string[] } | null = null;
    const flushText = () => {
      if (text.length) blocks.push({ kind: "p", text: text.join("\n") });
      text = [];
    };
    const flushList = () => {
      if (list && list.items.length) blocks.push(list);
      list = null;
    };
    for (const line of para.split("\n")) {
      const kind = UL.test(line) ? "ul" : OL.test(line) ? "ol" : null;
      if (!kind) {
        flushList();
        if (line.trim()) text.push(line);
        continue;
      }
      flushText();
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      const item = line.replace(kind === "ul" ? UL : OL, "").trim();
      if (item) list.items.push(item);
    }
    flushText();
    flushList();
  }
  return blocks;
}
