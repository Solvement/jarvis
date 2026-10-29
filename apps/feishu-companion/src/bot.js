import * as lark from '@larksuiteoapi/node-sdk';
import { feishuDocumentUrl, makePrompt } from './context.js';
import { SerialQueue } from './state.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export function createBotHandler({ ownerId, state, documents, defaultDocument, discussion, reply, onError = () => {} }) {
  const queue = new SerialQueue();
  return async event => {
    const { message, sender } = event || {};
    if (!ownerId || sender?.sender_id?.open_id !== ownerId || sender?.sender_type !== 'user' ||
        message?.chat_type !== 'p2p' || message.message_type !== 'text' || !message.message_id) return;
    let question;
    try { question = JSON.parse(message.content).text?.trim(); } catch { return; }
    if (!question) return;
    const key = `bot:${message.chat_id}`;
    return queue.run(key, async () => {
      const id = message.message_id;
      if (state.seen(id)) return;
      let answer = state.receipt(id);
      if (!answer) {
        try {
          if (question === '/help') answer = '发问题即可讨论；已绑定文档时，每条新问题前通过官方 CLI 读取最新正文。\n/doc <飞书链接>：切换文档\n/doc：查看当前文档\n/doc clear：取消文档绑定\n/new：新对话';
          else if (question === '/new') { await discussion.reset(key); answer = '已开始新的讨论。'; }
          else if (question === '/doc clear') { state.bind(key, null); await discussion.reset(key); answer = '已取消文档绑定并开始新讨论。'; }
          else if (question === '/doc') { answer = `当前文档：${state.binding(key) === undefined ? defaultDocument || '未绑定' : state.binding(key) || '未绑定'}\n已绑定时，每条新问题前重新读取正文。`; }
          else if (question.startsWith('/doc ')) {
            const url = feishuDocumentUrl(question.slice(5).trim());
            const context = await documents.read(url);
            state.bind(key, url); await discussion.reset(key);
            answer = `已绑定：${context.title}\n${url}\n每条新问题前读取最新正文，无需扩展同步。`;
          } else {
            const binding = state.binding(key);
            const url = binding === undefined ? defaultDocument : binding;
            const context = url ? await documents.read(url) : null;
            if (context && binding === undefined) state.bind(key, url);
            answer = await discussion.ask(key, makePrompt(question, context));
          }
        } catch (error) { onError(error); answer = `本次未能完成：${error.message}`; }
        // Store before sending: retry delivery without spending model quota twice.
        state.recordAnswer(id, answer);
      }
      await reply(id, answer);
      state.mark(id);
    });
  };
}

export function startBot(config, services, sdk = lark) {
  const missing = ['appId', 'appSecret'].filter(key => !config[key]);
  if (missing.length) return { enabled: false, missing, connection: () => 'not-configured', pairing: () => null, close() {} };
  let ownerId = config.ownerId || services.state.data.ownerId;
  const pairCode = randomBytes(6).toString('hex');
  const pairExpires = Date.now() + 600_000;
  const logger = { error: () => console.error('飞书 SDK 报错；检查连接状态和权限'), warn() {}, info() {}, debug() {}, trace() {} };
  const settings = { appId: config.appId, appSecret: config.appSecret, domain: sdk.Domain.Feishu,
    loggerLevel: sdk.LoggerLevel.error, logger };
  const client = new sdk.Client(settings);
  const ws = new sdk.WSClient(settings);
  const reply = async (messageId, text) => {
      // Chunk by characters below Feishu's text payload size limit.
      if (!text.trim()) throw new Error('模型没有返回可显示的回答');
      const chunks = Array.from(text.matchAll(/[\s\S]{1,1800}/gu), match => match[0]);
      for (let i = 0; i < chunks.length; i++) {
        const result = await client.im.v1.message.reply({ path: { message_id: messageId },
          data: { msg_type: 'text', content: JSON.stringify({ text: chunks[i] }), uuid: `${messageId}-${i}` } });
        if (result.code !== 0) throw new Error('飞书回复失败；检查机器人消息权限，回答已在本机保留');
      }
    };
  let handler = createBotHandler({ ...services, ownerId, reply,
    onError: () => console.error('机器人本次问答失败，原因已反馈给本人'),
  });
  const dispatcher = new sdk.EventDispatcher({ logger }).register({
    'im.message.receive_v1': event => {
      if (!ownerId) {
        const { message, sender } = event;
        if (sender?.sender_type !== 'user' || message?.chat_type !== 'p2p' || message.message_type !== 'text' || Date.now() > pairExpires) return;
        let text; try { text = JSON.parse(message.content).text?.trim(); } catch { return; }
        const expected = Buffer.from(`/pair ${pairCode}`); const actual = Buffer.from(text || '');
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return;
        ownerId = sender.sender_id?.open_id;
        if (!ownerId) return;
        services.state.data.ownerId = ownerId; services.state.save();
        handler = createBotHandler({ ...services, ownerId, reply });
        void reply(message.message_id, '已绑定你为唯一使用者。现在可以直接提问，或发送 /help。').catch(() => console.error('配对已保存，但确认消息未送达'));
        return;
      }
      // Acknowledge immediately. Feishu expects the event handler to finish within 3 seconds.
      void handler(event).catch(() => console.error('飞书消息暂未送达；等待平台重试'));
    },
  });
  ws.start({ eventDispatcher: dispatcher }).catch(() => console.error('飞书长连接失败；检查 .env 与开放平台配置'));
  return { enabled: true, missing: [], connection: () => ws.getConnectionStatus().state,
    pairing: () => ownerId ? null : { command: `/pair ${pairCode}`, expiresAt: pairExpires }, close() { ws.close(); } };
}
