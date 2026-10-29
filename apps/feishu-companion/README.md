# 飞书学习搭档

在飞书网页版边写边问；也能私聊飞书机器人。模型使用本机 Codex 的 ChatGPT 订阅登录，额度与账号共享，不需要模型 API Key。模型会话独立于桌面里已有的这条聊天。电脑关闭或本机服务退出后，机器人停止回答。

## 启动

在这个目录运行：

```powershell
npm ci
codex login
npm run doctor
npm start
```

已登录时不必重复 `codex login`。默认地址 http://127.0.0.1:4399 。后台启动使用 `powershell -File scripts/start.ps1`，停止使用 `powershell -File scripts/stop.ps1`。没有飞书应用凭证也能先验证本机问答。

## 飞书文档侧栏

1. Chrome 打开 `chrome://extensions`（Edge 使用 `edge://extensions`），打开开发者模式，选择“加载已解压的扩展程序”，目录选本项目的 `extension`。
2. 打开本机 `.local/connect.html`，点击链接进入本机页面。这里已使用本机配对码连接。展开“连接设置”，点击“复制配对码到扩展”。不要把配对码发到任何聊天。
3. 打开飞书文档，点浏览器工具栏的“飞书学习搭档 · Codex”，在侧栏“连接设置”粘贴配对码并连接。点击扩展后才取得当前标签页的临时访问权；没有飞书全站常驻读取权限。
4. 在文档选择一句话，点“查看当前选区”核对。输入问题后点“提问”，或按 Ctrl+Enter。每次提问都会重新读取当前文档。

扩展只采集当前文档已经加载到浏览器的正文。长文未渲染的段落、图片内容和嵌入表格不保证覆盖。侧栏会显示采集范围；不能把“可见正文”当作“完整全文”。选区记录是文档失去焦点前最近的位置，最长保留 2 分钟；原段落变更后丢弃旧位置。

## 飞书机器人

应用使用官方 Node SDK 长连接，不需要公网回调地址。仅本机个人自用，不部署成商业/托管模型服务。

1. 在 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用，添加“机器人”能力。组织和应用名称需与本人预期一致。
2. 在权限管理中仅申请“读取用户发给机器人的单聊消息”与“以应用的身份发消息”。不申请群聊全部消息、通讯录全文、文档写权限。
3. 将 `.env.example` 复制为 `.env`，填写 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`。凭证从应用的“凭证与基础信息”获取；不要把密钥发到聊天或提交 Git。`FEISHU_OWNER_OPEN_ID` 留空即可，无需额外通讯录权限。
4. 启动本机服务。在应用的“事件与回调”中选择“使用长连接接收事件”，添加 `im.message.receive_v1`。按开放平台要求发布版本，可用范围限定本人。在本机配对页面点“连接 Codex”，按提示私聊机器人发送一次性 `/pair ...` 命令，完成本人绑定；未配对时不回答任何问题。配对码 10 分钟有效，过期后重启服务。

机器人命令：

| 输入 | 行为 |
| --- | --- |
| 普通问题 | 用 Codex 订阅问答 |
| `/doc https://组织.feishu.cn/wiki/文档ID` | 显式绑定文档；会开始新讨论 |
| `/doc clear` | 解绑文档并开始新讨论 |
| `/new` | 新讨论，保留绑定 |
| `/help` | 命令说明 |

机器人使用文档前，需在扩展侧栏点“同步给机器人”。机器人只接收被绑定文档的快照；超过 2 分钟要求重新同步，不暗中读取你其他页面。机器人本身无法知道文档光标；该信息来自你主动同步的扩展。

## 验证与边界

### 官方飞书 CLI 读取

已安装官方 `@larksuite/cli`，使用国内版 `feishu` 配置。此项目的独立配置名为 `jarvis-feishu-readonly`，复用已有应用；与机器人收发使用不同的用户授权。配置名用于区分用途，实际权限由飞书授权控制。

```powershell
node scripts/feishu-cli.mjs auth status --json --verify
node scripts/feishu-cli.mjs docs +fetch --as user --doc "飞书文档链接" --doc-format xml --detail full
```

该包装只启动官方 CLI，显式选择本项目配置，并在子进程中排除无关 Agent 的环境标记。本人已完成飞书官方登录授权；发起范围为 `wiki:node:read docx:document:readonly`，实际返回的授权集合还包含其他文档/知识库权限，因此配置名称不代表强制只读。当前仅执行读取。已成功读取「Agent 评测 10.20小记」。CLI 可读取已授权的服务端文档内容；不会提供编辑器当前选区和光标。

用户的字体颜色用于区分转述、分析、评论、理解和重点，属于正文语义。人工读取和网站发布必须采用包含样式的 `xml/full` 格式，不能把 Markdown 无颜色导出称为完整保留原文。颜色含义由用户确认，不自行推断。同目录旧机器人实现仍有 Markdown 读取限制；用户已要求暂停机器人工作，未在本轮扩展它。

已确认的本篇含义：绿色是用户自己的感想，红色是重点。以后可能出现其它颜色；保留原样，不默认复用或推断颜色含义。

```powershell
npm test
npm run doctor
npm run smoke
```

`test` 不调用模型；`doctor` 只检查登录与配置；`smoke` 会消耗一次短回答的订阅额度。测试记录见 `VERIFICATION.md`。使用账号目录中 `model/list` 返回的默认可用模型，不把桌面配置里不受支持的模型直接用于 CLI；指定 `CODEX_MODEL` 时不自动替换该选择。

本机 HTTP 只监听回环地址，API 需配对码；网页跨域请求被拒绝，扩展请求也需配对码。正文仅在内存暂存；会话 ID、去重与待发回答在被忽略的 `.local/state.json`。Codex 自身按其配置保存会话历史，ChatGPT 数据控制仍适用。机器人只响应配置的本人单聊；不提供 shell、文档写回或任意人的模型转发入口。

## REA 的作用

[REA](https://github.com/morluto/rea) 用于理解原生程序、JS/Electron、网站运行行为。它不能直接提供飞书机器人或订阅授权；本项目已有官方 App Server、飞书 SDK 和公开 DOM 足够使用，首版未安装 REA，也不提取会话 token。未来只有公开 DOM 无法提供必要编辑状态且用户授权分析时，再评估它。

技术来源：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Codex 订阅登录](https://learn.chatgpt.com/docs/auth#openai-authentication)、[飞书官方 SDK](https://github.com/larksuite/node-sdk)。App Server 接口仍属实验性，本实现针对本机个人使用。
