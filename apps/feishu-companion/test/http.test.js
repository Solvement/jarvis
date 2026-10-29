import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createBridgeServer } from '../src/server.js';
import { ContextStore } from '../src/context.js';
import { root } from '../src/config.js';
import { request as httpRequest } from 'node:http';
test('本机 HTTP 拒绝无令牌、恶意 Origin 与重绑定 Host，正常问答输出 SSE', async t => {
  const server = createBridgeServer({ token: 'secret', port: 0, publicDir: join(root, 'extension'),
    client: { start: async () => {}, account: async () => ({ mode: 'chatgpt' }) },
    discussion: { ask: async (_, prompt, delta) => { assert.match(prompt, /问题/); delta('答案'); return '答案'; } },
    contexts: new ContextStore(), botStatus: () => ({ enabled: false }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const call = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    ...options });
  assert.equal((await call('/api/status')).status, 401);
  assert.equal((await call('/api/status', { headers: { Authorization: 'Bearer secret', Origin: 'https://evil.example' } })).status, 403);
  const rebindStatus = await new Promise(resolve => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path: '/api/status', headers: { Host: 'evil.example', Authorization: 'Bearer secret' } }, res => { res.resume(); resolve(res.statusCode); });
    req.end();
  });
  assert.equal(rebindStatus, 403);
  assert.equal((await call('/api/status', { headers: { Authorization: 'Bearer secret' } })).status, 200);
  const answer = await call('/api/ask', { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '问题' }) });
  assert.equal(answer.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.match(await answer.text(), /event: done/);
  assert.equal((await call('/')).status, 200);
});
