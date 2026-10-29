import { join } from 'node:path';
import { getConfig, root } from './config.js';
import { State } from './state.js';
import { ContextStore } from './context.js';
import { CodexClient, Discussion } from './codex.js';
import { createBridgeServer } from './server.js';
import { startBot } from './bot.js';
import { FeishuDocumentReader } from './feishu-document.js';

const config = getConfig();
const state = new State(config.localDir);
const contexts = new ContextStore();
const client = new CodexClient(config);
const discussion = new Discussion(client, state);
const bot = startBot(config, { state, documents: new FeishuDocumentReader(), defaultDocument: config.defaultDocument, discussion });
const server = createBridgeServer({ ...config, publicDir: join(root, 'extension'), client, discussion, contexts,
  botStatus: () => ({ enabled: bot.enabled, connection: bot.connection(), pairing: bot.pairing(), missing: bot.missing }), onShutdown: stop });
server.listen(config.port, '127.0.0.1', () => {
  console.log(`学习搭档：http://127.0.0.1:${config.port}`);
  console.log('本机配对入口：apps/feishu-companion/.local/connect.html（请自行打开；勿分享）');
  console.log(bot.enabled ? '飞书机器人：正在建立长连接' : '飞书机器人：等待 .env 中的应用凭证和本人 open_id');
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口被占用，检查已有助手进程或修改 PORT' : error.message); client.close(); bot.close(); process.exitCode = 1; });
function stop() { bot.close(); client.close(); server.close(); setTimeout(() => process.exit(0), 1500).unref(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
