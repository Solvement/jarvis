import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const localDir = join(root, '.local');
export function getConfig(env = process.env) {
  const port = Number(env.PORT || 4399);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须为 1024–65535');
  mkdirSync(localDir, { recursive: true });
  const file = join(localDir, 'pairing.json');
  let token;
  if (existsSync(file)) token = JSON.parse(readFileSync(file, 'utf8')).token;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString('hex');
    writeFileSync(file, JSON.stringify({ token }), { mode: 0o600 });
  }
  const url = `http://127.0.0.1:${port}/#token=${token}`;
  writeFileSync(join(localDir, 'connect.html'), `<!doctype html><meta charset="utf-8"><title>连接学习搭档</title><p><a href="${url}">打开本机学习搭档</a></p>`, { mode: 0o600 });
  return { port, token, localDir, model: env.CODEX_MODEL || undefined,
    codexBin: env.CODEX_BIN || undefined, appId: env.FEISHU_APP_ID || '',
    appSecret: env.FEISHU_APP_SECRET || '', ownerId: env.FEISHU_OWNER_OPEN_ID || '',
    defaultDocument: env.FEISHU_DEFAULT_DOCUMENT || undefined };
}
export function tokenMatches(header, token) {
  const candidate = String(header || '').replace(/^Bearer /, '');
  const a = Buffer.from(candidate); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
