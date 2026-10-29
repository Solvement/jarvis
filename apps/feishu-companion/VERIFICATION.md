# 验证记录 · 2026-10-20

## 已完成

- Node 24.13.1；Codex CLI 0.153.4；飞书官方 SDK 1.76.0。
- `npm test`：14 项通过，覆盖正文/跨段选区/光标采集、失焦保留、原文变化与文档切换丢弃旧位置、上下文有效期、订阅登录限制、消息去重、回复失败复用答案、本人配对、会话隔离、HTTP 访问控制与流式输出，以及扩展仅在用户点击的飞书标签页临时采集。
- `npm run doctor`：ChatGPT 订阅身份通过，没有读取或复制 OAuth token。默认模型由账号目录选择。
- `npm run smoke`：真实模型返回 `CONNECTION_OK`，无私人材料。桌面配置的模型在 CLI 登录下不受支持，修复为账号返回的默认可用模型后通过。
- 浏览器真实提问 → 本机 HTTP → Codex App Server → 流式答复已完成；页面显示“订阅问答已连接”。截图 `.local/preview.png`。
- 采集代码在当前飞书文档读取正文、定位空白块中的折叠光标。浏览器测试沙箱缺少 `document.hasFocus()`，这次只读探测显式传入焦点适配；原生焦点与跨段/失焦行为另由 JSDOM 测试覆盖，尚不能据此声称扩展已完成真实安装验收。
- 飞书 NYU 组织创建“Jarvis 学习搭档”，仅 Kevin 本人可用；仅开通 `im:message.p2p_msg:readonly`、`im:message:send_as_bot`，未申请通讯录或群聊全部消息。
- 飞书长连接验证显示“连接成功”；添加 `im.message.receive_v1`；0.1.0 版本已发布，审核通过。截图 `.local/feishu-published.png`。
- 本人已发送一次性配对指令；本机状态确认 `paired: true`，长连接为 `connected`，订阅登录有效。本机页面检查后已隐藏首次配对提示。真实学习问题的机器人回复待验收。
- 已安装飞书官方 `@larksuite/cli` 1.0.98；创建 `jarvis-feishu-readonly` 本机配置，品牌为 `feishu`，复用现有应用。App Secret 通过 stdin 交给官方 CLI，没有出现在进程参数或明文输出中。本人完成官方网页授权，CLI device flow 登录成功；请求的 `wiki:node:read docx:document:readonly` 均已授予。飞书实际返回的授权集合还包含其他文档/知识库权限；配置名不代表技术上强制只读，当前仅执行读取。
- 使用 `docs +fetch --as user` 成功读取「Agent 评测 10.20小记」，`ok: true`、`identity: user`、文档版本 292。完整 API 响应保存在 Git 忽略的 `.local/agent-eval-2026-10-20.json`。此登录和读取流程没有使用 Computer Use。
- 凭证和本机运行状态均在 Git 忽略范围；未改动已有网站应用及其未提交文件。

## 尚未完成

- 本人向机器人测试一条真实学习问题，确认收到正常回答。
- 在 Chrome/Edge 加载扩展后，验证实际侧栏对话与文档选区；此时仍需用户完成浏览器安装动作。
- 长文虚拟渲染的完整全文不在浏览器采集保证范围；CLI 已可读取明确指定的服务端文档，但不会取得编辑器当前光标或选区。全库消息和文档搜索尚未逐项验证。

REA 没有安装或运行；本轮使用官方接口和公开页面 DOM。后台服务仅在本机运行，电脑离线时不提供问答。
