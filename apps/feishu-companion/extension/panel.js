const $ = id => document.getElementById(id);
const extension = Boolean(globalThis.chrome?.runtime?.id);
let settings = { server: 'http://127.0.0.1:4399', token: '' };
let current = null;
let busy = false;
const status = text => { $('status').textContent = text; };
const add = (role, text) => { const div = document.createElement('div'); div.className = `message ${role}`; div.textContent = text; $('messages').append(div); $('messages').scrollTop = $('messages').scrollHeight; return div; };
async function request(path, data) {
  const response = await fetch(settings.server + path, { method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || `本机服务返回 ${response.status}`); }
  return response;
}
async function connect() {
  try {
    const result = await (await request('/api/status')).json();
    $('connection').textContent = `订阅 · ${result.codex.plan || '已登录'}`;
    $('settings').open = false;
    $('bot-pair').hidden = !result.bot.pairing;
    $('bot-command').textContent = result.bot.pairing?.command || '';
    status(result.bot.pairing ? '机器人等待本人配对。配对指令自服务启动起 10 分钟有效；过期后重启本机服务。' : result.bot.enabled ? `Codex 已连接；机器人连接状态：${result.bot.connection}。` : 'Codex 已连接；机器人等待飞书应用授权。');
  } catch (error) { $('connection').textContent = '未连接'; $('settings').open = true; status(error.message); }
}
function showContext(context) {
  $('doc-title').textContent = context.title;
  const selection = context.selection;
  $('context-detail').textContent = `${context.text.length} 字符 · 浏览器已加载正文${context.truncated ? '（已截断）' : ''} · ${selection ? (selection.collapsed ? '光标已定位' : '已附带选区') : '没有文档选区'}`;
  $('selection').hidden = !selection;
  $('selection').textContent = selection ? (selection.text || `光标所在段落：${selection.blockText || '空段落'}\n节点偏移：${selection.anchorOffset}`) : '';
}
async function capture() {
  if (!extension) { current = null; return null; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/[^/]+\.feishu\.cn\/(wiki|docx|docs)\//.test(tab.url)) throw new Error('切换到要讨论的飞书文档标签页');
  let result;
  try { result = await chrome.tabs.sendMessage(tab.id, { type: 'capture-context' }); }
  catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js', 'content.js'] });
      result = await chrome.tabs.sendMessage(tab.id, { type: 'capture-context' });
    } catch { throw new Error('在这个飞书标签页点一次浏览器工具栏的“飞书学习搭档”，授权访问当前页'); }
  }
  if (result.error) throw new Error(result.error);
  current = result.context; showContext(current); return current;
}
$('pair-form').addEventListener('submit', async event => {
  event.preventDefault();
  const url = new URL($('server').value);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || url.pathname !== '/' || url.username || url.password) return status('只接受 http://127.0.0.1:端口 的本机服务');
  settings = { server: url.origin, token: $('token').value.trim() };
  if (extension) await chrome.storage.local.set({ pairing: settings }); else sessionStorage.setItem('pairing', JSON.stringify(settings));
  await connect();
});
$('copy-token').addEventListener('click', async () => { await navigator.clipboard.writeText(settings.token); status('已复制本机配对码，在扩展“连接设置”中粘贴。不要发送到聊天。'); });
$('copy-pair').addEventListener('click', async () => { await navigator.clipboard.writeText($('bot-command').textContent); status('已复制指令。请只发送到你自己的“Jarvis 学习搭档”机器人私聊。'); });
$('check-bot').addEventListener('click', connect);
$('refresh').addEventListener('click', async () => { try { await capture(); status(extension ? '已更新本次文档范围；尚未发送给模型。' : '此页面是本机测试入口。飞书正文需从浏览器扩展侧栏读取。'); } catch (e) { status(e.message); } });
$('sync').addEventListener('click', async () => {
  try { const context = await capture(); if (!context) throw new Error('请在飞书扩展侧栏同步文档'); await request('/api/context', context); status('已同步到本机。机器人绑定这篇链接后，2 分钟内可使用该快照。'); } catch(e) { status(e.message); }
});
$('reset').addEventListener('click', async () => {
  if (busy) return;
  try { await capture(); await request('/api/reset', { context: current }); $('messages').replaceChildren(); status('已开始新的讨论。'); } catch(e) { status(e.message); }
});
$('question').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); $('ask-form').requestSubmit(); } });
$('ask-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const question = $('question').value.trim(); if (!question) return;
  busy = true; $('send').disabled = true;
  let answer;
  try {
    const context = await capture();
    document.querySelector('.intro')?.remove(); add('user', question); answer = add('assistant', '');
    status('正在使用 Codex 订阅回答…');
    const response = await request('/api/ask', { question, context });
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let done = false;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const packets = buffer.split('\n\n'); buffer = packets.pop();
      for (const packet of packets) {
        const eventName = packet.match(/^event: (.+)$/m)?.[1]; const line = packet.match(/^data: (.+)$/m)?.[1]; if (!line) continue;
        const data = JSON.parse(line);
        if (eventName === 'delta') { answer.textContent += data.text; $('messages').scrollTop = $('messages').scrollHeight; }
        if (eventName === 'error') throw new Error(data.error);
        if (eventName === 'done') { done = true; answer.textContent = data.answer; }
      }
    }
    if (!done) throw new Error('连接提前结束；未确认回答完成，请勿自动重复发送');
    $('question').value = ''; status('回答完成。继续写；下次提问会重新读取文档。');
  } catch (e) { add('error', e.message); status('问题已保留，可修复连接后重试。'); }
  finally { busy = false; $('send').disabled = false; }
});
(async () => {
  const fragmentToken = new URLSearchParams(location.hash.slice(1)).get('token');
  if (extension) settings = (await chrome.storage.local.get('pairing')).pairing || settings;
  else {
    settings = JSON.parse(sessionStorage.getItem('pairing') || 'null') || { ...settings, server: location.origin };
    if (fragmentToken) { settings.token = fragmentToken; sessionStorage.setItem('pairing', JSON.stringify(settings)); history.replaceState(null, '', '/'); }
    $('refresh').hidden = true; $('sync').hidden = true; $('copy-token').hidden = !settings.token;
  }
  $('server').value = settings.server; $('token').value = settings.token;
  if (settings.token) await connect(); else $('settings').open = true;
  if (extension) { try { await capture(); } catch(e) { status(e.message); } }
})();
