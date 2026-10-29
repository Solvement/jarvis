import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { State, SerialQueue } from '../src/state.js';
import { ContextStore, normalizeContext, feishuDocumentUrl, makePrompt } from '../src/context.js';
import { tokenMatches } from '../src/config.js';
import { CodexClient, Discussion } from '../src/codex.js';
import { createBotHandler, startBot } from '../src/bot.js';

const url = 'https://test.feishu.cn/docx/Abc123';
const context = () => ({ url, text: '原文', capturedAt: Date.now(), selection: { text: '原', anchorOffset: 0, focusOffset: 1 } });
const state = () => new State(mkdtempSync(join(tmpdir(), 'feishu-test-')));
test('文档地址拒绝伪装域名、外部 URL 与过期快照', () => {
  assert.throws(() => feishuDocumentUrl('https://test.feishu.cn.evil.com/docx/abc'));
  assert.throws(() => feishuDocumentUrl('http://test.feishu.cn/docx/abc'));
  assert.equal(feishuDocumentUrl(url + '?from=share#text'), url);
  assert.throws(() => normalizeContext({ ...context(), capturedAt: Date.now() - 121000 }), /过期/);
  assert.throws(() => normalizeContext({ ...context(), text: '' }), /正文/);
  assert.equal(normalizeContext(context()).coverage, 'rendered-content-only');
});
test('机器人上下文只允许显式绑定的文档，过期与重启均拒绝', () => {
  const store = new ContextStore(); const c = store.put(context());
  assert.equal(store.get(url).text, '原文');
  assert.throws(() => store.get('https://test.feishu.cn/wiki/Other'), /没有同步/);
  assert.throws(() => store.get(url, c.capturedAt + 121000), /2 分钟/);
  assert.throws(() => new ContextStore().get(url), /没有同步/);
  assert.match(makePrompt('为何？', c), /不能声称是整篇/);
});
test('令牌比较拒绝非 ASCII 与错误长度，不崩溃', () => {
  assert.equal(tokenMatches('Bearer abc', 'abc'), true);
  assert.equal(tokenMatches('Bearer 中文文', 'abc'), false);
  assert.equal(tokenMatches('', 'abc'), false);
});
test('同会话串行、跨文档隔离、失败不会阻塞后续', async () => {
  const q = new SerialQueue(); const order = []; let release;
  const a = q.run('a', async () => { order.push('a1'); await new Promise(r => release = r); throw new Error('fail'); });
  const b = q.run('a', () => order.push('a2'));
  await q.run('b', () => order.push('b')); release();
  await assert.rejects(a); await b;
  assert.deepEqual(order, ['a1', 'b', 'a2']);
});
test('订阅身份门禁：API key 不被当作订阅登录', async () => {
  const client = new CodexClient({ localDir: tmpdir() });
  client.request = async () => ({ account: { type: 'apiKey' } });
  await assert.rejects(client.account(), /不会改用 API/);
  client.request = async () => ({ account: { type: 'chatgpt', planType: 'pro', email: 'private@example.com' } });
  assert.deepEqual(await client.account(), { authenticated: true, mode: 'chatgpt', plan: 'pro' });
});
test('App Server 流式结果按 threadId 分发，断连立刻拒绝而非假成功', async () => {
  const client = new CodexClient({ localDir: tmpdir() });
  client.request = async () => ({ turn: { id: 'turn' } });
  const result = client.turn('mine', 'q');
  client.receive({ method: 'item/agentMessage/delta', params: { threadId: 'other', delta: 'wrong' } });
  client.receive({ method: 'item/agentMessage/delta', params: { threadId: 'mine', delta: 'right' } });
  client.receive({ method: 'turn/completed', params: { threadId: 'mine', turn: { status: 'completed' } } });
  assert.equal(await result, 'right');
  const interrupted = client.turn('mine', 'q'); client.fail(new Error('offline'));
  await assert.rejects(interrupted, /offline/);
  assert.equal(client.listenerCount('notification'), 0);
});
test('应用保存每篇文档独立会话；重启 resume，不新建丢历史', async () => {
  const s = state(); let count = 0; const resumed = [];
  const client = { start: async () => {}, newThread: async () => `t${++count}`, resume: async id => resumed.push(id), turn: async id => id };
  const d = new Discussion(client, s);
  assert.equal(await d.ask('doc:a', 'q'), 't1');
  assert.equal(await d.ask('doc:b', 'q'), 't2');
  assert.equal(await d.ask('doc:a', 'q2'), 't1');
  const restarted = new Discussion(client, new State(join(s.file, '..')));
  assert.equal(await restarted.ask('doc:a', 'q3'), 't1'); assert.deepEqual(resumed, ['t1']);
});
function message(id, overrides = {}) {
  return { sender: { sender_id: { open_id: 'owner' }, sender_type: 'user' },
    message: { message_id: id, chat_id: 'c', chat_type: 'p2p', message_type: 'text', content: JSON.stringify({ text: '解释这段' }), ...overrides } };
}
test('机器人拒绝非本人和群聊，重复投递仅调用一次模型', async () => {
  let calls = 0; const replies = [];
  const handler = createBotHandler({ ownerId: 'owner', state: state(), contexts: new ContextStore(),
    discussion: { ask: async () => { calls++; return '解释'; } }, reply: async (...args) => replies.push(args) });
  await handler({ ...message('x'), sender: { sender_id: { open_id: 'stranger' }, sender_type: 'user' } });
  await handler(message('g', { chat_type: 'group' }));
  await Promise.all([handler(message('same')), handler(message('same'))]);
  assert.equal(calls, 1); assert.deepEqual(replies, [['same', '解释']]);
});
test('机器人回复失败重试复用已生成答案，节省订阅额度', async () => {
  let calls = 0; let sends = 0;
  const handler = createBotHandler({ ownerId: 'owner', state: state(), contexts: new ContextStore(),
    discussion: { ask: async () => { calls++; return '答案'; } }, reply: async () => { if (++sends === 1) throw new Error('network'); } });
  await assert.rejects(handler(message('retry'))); await handler(message('retry'));
  assert.equal(calls, 1); assert.equal(sends, 2);
});
test('首次机器人配对需要本机一次性码，配对后只接受本人', async () => {
  let receiver; const replies = []; let calls = 0;
  const sdk = { Domain: { Feishu: 0 }, LoggerLevel: { error: 1 },
    Client: class { im = { v1: { message: { reply: async input => { replies.push(input); return { code: 0 }; } } } }; },
    WSClient: class { async start({ eventDispatcher }) { receiver = eventDispatcher.handler; } getConnectionStatus() { return { state: 'connected' }; } close() {} },
    EventDispatcher: class { register(handlers) { this.handler = handlers['im.message.receive_v1']; return this; } },
  };
  const s = state();
  const bot = startBot({ appId: 'test', appSecret: 'test' }, { state: s, contexts: new ContextStore(), discussion: { ask: async () => { calls++; return 'ok'; } } }, sdk);
  receiver(message('unpaired')); assert.equal(calls, 0);
  const pair = message('pair', { content: JSON.stringify({ text: bot.pairing().command }) });
  receiver(pair); assert.equal(s.data.ownerId, 'owner'); assert.equal(bot.pairing(), null);
  receiver({ ...message('stranger'), sender: { sender_type: 'user', sender_id: { open_id: 'other' } } });
  receiver(message('own'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(replies.length, 2);
});
