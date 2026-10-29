import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenMatches } from './config.js';
import { makePrompt, normalizeContext } from './context.js';

const assets = { '/': ['panel.html', 'text/html'], '/panel.js': ['panel.js', 'text/javascript'], '/panel.css': ['panel.css', 'text/css'] };
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 600_000) throw new Error('请求超过 600KB'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createBridgeServer({ token, port, publicDir, client, discussion, contexts, botStatus, onShutdown }) {
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'");
    const actualPort = server.address()?.port || port;
    const host = req.headers.host;
    if (host !== `127.0.0.1:${actualPort}`) return json(res, 403, { error: '拒绝非本机 Host' });
    const origin = req.headers.origin;
    const allowedOrigin = origin === `http://127.0.0.1:${actualPort}` || /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
    if (origin && !allowedOrigin) return json(res, 403, { error: '拒绝此网站访问本机助手' });
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    if (req.method === 'GET' && assets[pathname]) {
      const [file, mime] = assets[pathname]; res.setHeader('Content-Type', `${mime}; charset=utf-8`);
      return res.end(readFileSync(join(publicDir, file)));
    }
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true });
    if (!tokenMatches(req.headers.authorization, token)) return json(res, 401, { error: '请先使用本机配对文件连接' });
    try {
      if (pathname === '/api/shutdown' && req.method === 'POST' && onShutdown) {
        json(res, 200, { ok: true }); setImmediate(onShutdown); return;
      }
      if (pathname === '/api/status' && req.method === 'GET') {
        await client.start(); return json(res, 200, { codex: await client.account(), bot: botStatus() });
      }
      if (pathname === '/api/context' && req.method === 'POST') {
        const context = contexts.put(await body(req));
        return json(res, 200, { title: context.title, capturedAt: context.capturedAt, coverage: context.coverage });
      }
      if (pathname === '/api/reset' && req.method === 'POST') {
        const data = await body(req); const context = data.context ? normalizeContext(data.context) : null;
        await discussion.reset(context ? `web:${context.url}` : 'web:general'); return json(res, 200, { ok: true });
      }
      if (pathname === '/api/ask' && req.method === 'POST') {
        const data = await body(req);
        const context = data.context ? normalizeContext(data.context) : null;
        const prompt = makePrompt(data.question, context);
        if (context) contexts.put(context);
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Connection': 'keep-alive' });
        const send = (event, value) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`); };
        const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 10_000);
        try {
          const answer = await discussion.ask(context ? `web:${context.url}` : 'web:general', prompt, text => send('delta', { text }));
          send('done', { answer });
        } catch (error) { send('error', { error: error.message }); }
        finally { clearInterval(heartbeat); res.end(); }
        return;
      }
      return json(res, 404, { error: '没有此接口' });
    } catch (error) { return json(res, 400, { error: error.message }); }
  });
  return server;
}
