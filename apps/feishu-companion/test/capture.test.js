import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../extension/capture.js', import.meta.url), 'utf8');
function fixture() {
  const dom = new JSDOM('<title>学习笔记 - 飞书云文档</title><div class="docx-page-block" data-block-id="1"><div class="page-block root-block"><p data-block-id="2">第一段原文</p><p data-block-id="3">第二段原文</p></div></div>', {
    url: 'https://test.feishu.cn/wiki/ABC', runScripts: 'outside-only',
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  let focused = true; dom.window.document.hasFocus = () => focused;
  runInContext(script, dom.getInternalVMContext());
  const { window } = dom; const api = window.FeishuCapture;
  const select = (start, end, cross = false) => {
    const range = window.document.createRange();
    range.setStart(window.document.querySelector('[data-block-id="2"]').firstChild, start);
    range.setEnd(window.document.querySelector(`[data-block-id="${cross ? '3' : '2'}"]`).firstChild, end);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  };
  return { dom, window, api, select, blur: () => { focused = false; } };
}
test('采集真实 DOM 结构：正文不重复、跨段选区保留、光标偏移有来源', () => {
  const { window: w, api, select } = fixture();
  select(1, 2, true);
  const snapshot = api.collect(w.document, w);
  assert.equal(snapshot.text, '学习笔记\n\n第一段原文\n第二段原文');
  assert.equal(snapshot.selection.text, '一段原文第二');
  assert.equal(snapshot.selection.collapsed, false);
  select(2, 2);
  const caret = api.collect(w.document, w).selection;
  assert.equal(caret.anchorOffset, 2); assert.equal(caret.blockId, '2'); assert.equal(caret.collapsed, true);
});
test('侧栏获得焦点后保留选区；文档变更、切换或过期时丢弃旧位置', () => {
  const { dom, window: w, api, select, blur } = fixture(); select(1, 3);
  const saved = api.captureSelection(w.document, w, 1000); blur(); w.getSelection().removeAllRanges();
  assert.equal(api.collect(w.document, w, saved, 1500).selection.text, '一段');
  assert.equal(api.collect(w.document, w, saved, 122000).selection, null);
  dom.reconfigure({ url: 'https://test.feishu.cn/wiki/OTHER' });
  assert.equal(api.collect(w.document, w, saved, 1500).selection, null);
  dom.reconfigure({ url: 'https://test.feishu.cn/wiki/ABC' });
  w.document.querySelector('[data-block-id="2"]').textContent = '已改写';
  assert.equal(api.collect(w.document, w, saved, 1500).selection, null);
});
