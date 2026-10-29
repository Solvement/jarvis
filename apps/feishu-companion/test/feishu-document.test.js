import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FeishuDocumentReader, normalizeCliDocument } from '../src/feishu-document.js';
import { createBotHandler } from '../src/bot.js';
import { State } from '../src/state.js';

const url = 'https://test.feishu.cn/wiki/Abc123';
const response = (revision, text = '正文') => ({ ok: true, identity: 'user', data: { document: {
  content: `# 标题\n${text}`, document_id: 'real-doc-id', revision_id: revision,
} } });
const event = (id, text = '解释这段') => ({ sender: { sender_type: 'user', sender_id: { open_id: 'owner' } },
  message: { message_id: id, chat_id: 'c', chat_type: 'p2p', message_type: 'text', content: JSON.stringify({ text }) } });
const newState = () => new State(mkdtempSync(join(tmpdir(), 'feishu-cli-test-')));

test('官方 CLI 读取固定参数、本人身份和最新版本，拒绝伪装地址与超长正文', async () => {
  const calls = [];
  const reader = new FeishuDocumentReader({ binary: 'official-cli', execute: async (...args) => {
    calls.push(args); return { stdout: JSON.stringify(response(9)) };
  } });
  const doc = await reader.read(url + '?from=share');
  assert.equal(doc.revisionId, 9); assert.equal(doc.selection, null);
  assert.equal(doc.coverage, 'server-document-content');
  assert.deepEqual(calls[0][1], ['--profile', 'jarvis-feishu-readonly', 'docs', '+fetch', '--as', 'user',
    '--doc', url, '--doc-format', 'markdown', '--revision-id', '-1']);
  assert.equal(calls[0][2].shell, undefined); assert.equal(calls[0][2].timeout, 45000);
  assert.equal(calls[0][2].env.FEISHU_APP_SECRET, undefined);
  await assert.rejects(reader.read('https://evil.example/wiki/Abc'), /只接受/);
  assert.equal(calls.length, 1);
  assert.throws(() => normalizeCliDocument(url, { ...response(9), identity: 'bot' }), /本人/);
  assert.throws(() => normalizeCliDocument(url, response(9, 'a'.repeat(120001))), /120000/);
});

test('机器人每个新问题重新读取绑定正文，重复事件复用答案，失败不沿用旧内容', async () => {
  const s = newState(); const prompts = []; const replies = []; let reads = 0;
  const documents = { read: async value => {
    assert.equal(value, url); reads++;
    if (reads === 3) throw new Error('读取最新文档失败');
    return normalizeCliDocument(url, response(reads, `新正文${reads}`));
  } };
  const handler = createBotHandler({ ownerId: 'owner', state: s, documents, defaultDocument: url,
    discussion: { ask: async (_, prompt) => { prompts.push(prompt); return '答案'; }, reset: async () => {} },
    reply: async (_, answer) => replies.push(answer) });
  await handler(event('a')); await handler(event('a')); await handler(event('b')); await handler(event('c'));
  assert.equal(reads, 3); assert.equal(prompts.length, 2); assert.equal(s.binding('bot:c'), url);
  assert.match(prompts[0], /新正文1/); assert.match(prompts[1], /新正文2/);
  assert.doesNotMatch(prompts[1], /新正文1|仅代表浏览器已渲染内容/);
  assert.match(prompts[1], /以本次读取的正文为准/);
  assert.match(replies.at(-1), /读取最新文档失败/);
  await handler(event('clear', '/doc clear')); await handler(event('d'));
  assert.equal(reads, 3); assert.match(prompts.at(-1), /没有附带文档/);
});

test('切换文档先验证访问，失败不替换旧绑定，未授权的发送者不会触发 CLI', async () => {
  const s = newState(); s.bind('bot:c', url); let reads = 0;
  const handler = createBotHandler({ ownerId: 'owner', state: s,
    documents: { read: async () => { reads++; throw new Error('没有权限'); } },
    discussion: { reset: async () => assert.fail('不应重置') }, reply: async () => {} });
  await handler({ ...event('stranger'), sender: { sender_type: 'user', sender_id: { open_id: 'stranger' } } });
  assert.equal(reads, 0);
  await handler(event('switch', '/doc https://test.feishu.cn/docx/Other'));
  assert.equal(s.binding('bot:c'), url); assert.equal(reads, 1);
});

test('读取超时和授权失败返回可操作错误，不泄露 CLI 原始 stderr', async () => {
  const timeout = new FeishuDocumentReader({ execute: async () => { throw { killed: true, stderr: 'secret' }; } });
  await assert.rejects(timeout.read(url), /超时.*没有沿用旧正文/);
  const denied = new FeishuDocumentReader({ execute: async () => { throw { stderr: JSON.stringify({
    error: { type: 'authorization', message: 'secret' },
  }) }; } });
  await assert.rejects(denied.read(url), /重新完成 CLI 授权/);
});
