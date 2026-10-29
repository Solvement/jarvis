import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('扩展仅取得用户点击的标签页访问权，不申请飞书全站权限或后台常驻采集', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*']);
  assert.ok(manifest.permissions.includes('activeTab')); assert.equal(manifest.content_scripts, undefined);
  let click; const injected = []; const opened = [];
  runInNewContext(readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), {
    chrome: { action: { onClicked: { addListener: handler => click = handler } },
      sidePanel: { open: input => opened.push(input.tabId) },
      scripting: { executeScript: async input => injected.push(input.target.tabId) } },
  });
  assert.equal(injected.length, 0);
  click({ id: 1, url: 'https://example.com' });
  click({ id: 2, url: 'https://test.feishu.cn.evil.example/wiki/ABC' });
  click({ id: 3, url: 'https://test.feishu.cn/wiki/ABC' });
  assert.deepEqual(opened, [1, 2, 3]); assert.deepEqual(injected, [3]);
});
