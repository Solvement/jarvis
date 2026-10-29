// Only public rendered DOM. No private editor globals, cookies, or network hooks.
globalThis.FeishuCapture = (() => {
  const clean = text => String(text || '').replace(/[\u200B\uFEFF]/g, '');
  function root(doc) {
    return doc.querySelector('.page-block.root-block') || doc.querySelector('.docx-page-block') ||
      doc.querySelector('[contenteditable="true"][role="textbox"]');
  }
  function documentUrl(win) {
    const url = new URL(win.location.href);
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  }
  function captureSelection(doc, win, now = Date.now()) {
    const page = root(doc); const selection = win.getSelection();
    if (!page || !selection?.anchorNode || !selection.focusNode || !selection.rangeCount ||
        !page.contains(selection.anchorNode) || !page.contains(selection.focusNode)) return null;
    const anchorElement = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
    const block = anchorElement?.closest('[data-block-id]');
    return { url: documentUrl(win), text: clean(selection.toString()), collapsed: selection.isCollapsed,
      blockId: block?.getAttribute('data-block-id') || null,
      blockText: clean(block?.innerText || selection.anchorNode.parentElement?.innerText).slice(0, 5000),
      anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, capturedAt: now };
  }
  function collect(doc, win, remembered = null, now = Date.now()) {
    const page = root(doc);
    if (!page) throw new Error('未找到文档正文。确认当前标签是飞书文档，且正文已加载');
    const title = clean(doc.title).replace(/\p{Cf}/gu, '').replace(/\s*-\s*飞书云文档$/, '');
    const blocks = Array.from(page.querySelectorAll('[data-block-id]')).filter(element => {
      const parent = element.parentElement?.closest('[data-block-id]');
      return !parent || !page.contains(parent) || parent.classList.contains('docx-page-block');
    });
    const body = clean(blocks.length ? blocks.map(b => b.innerText).join('\n') : page.innerText).trim();
    const text = `${title}\n\n${body}`;
    const url = documentUrl(win);
    const current = doc.hasFocus() ? captureSelection(doc, win, now) : null;
    let last = remembered?.url === url && now - remembered.capturedAt < 120_000 ? remembered : null;
    if (last?.blockId) {
      const liveBlock = Array.from(page.querySelectorAll('[data-block-id]')).find(b => b.getAttribute('data-block-id') === last.blockId);
      if (!liveBlock || clean(liveBlock.innerText).slice(0, 5000) !== last.blockText) last = null;
    }
    return { url, title, text: text.slice(0, 120_000), capturedAt: now,
      selection: current || last, truncated: text.length > 120_000, coverage: 'rendered-content-only' };
  }
  return { collect, captureSelection, documentUrl };
})();
