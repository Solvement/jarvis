# Jarvis · 开源与论文阅读台

公开的「学习圈」位于 `/circle`：按日期分享读到的资料与自己的想法，每篇有可直接分享的全文地址。首篇为「Agent 评测 10.20小记」。内容是本人确认发布的笔记快照，与私人书架分开；飞书后续编辑不会自动公开。

每天从 GitHub Trending 与 Hugging Face Papers 的日 / 周 / 月三榜里，挑出最值得读的项目和论文，做**源码级精读**：先讲清楚现状出了什么问题、为什么会有这个问题、它怎么解决，再按系统设计的方式逐部分拆解到代码与原文。读完的内容沉淀成可检索的知识库。

- 决策与取舍：[IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md)（现行规格真源）
- 实际改动记录：[CHANGELOG.md](CHANGELOG.md)
- 精读写法：[research/deepread-method.md](research/deepread-method.md)、阅读标准 [apps/web/public/reading-standard.md](apps/web/public/reading-standard.md)

## 架构

```
GitHub Trending / HF Papers ──(Vercel Cron 每日 + 访客按钮, 2 分钟锁)──▶ /api/refresh ──▶ Postgres(Neon): snapshots
作者会话（Claude Code 订阅，不调用模型 API）──Bearer AUTHOR_TOKEN──▶ /api/author ──▶ readings（只追加；精读默认草稿）
读者 ──GitHub 登录──▶ /api/me/state ──▶ item_states（已读 / 收藏 / 笔记，只由本人显式写入）
读者 ──私人会话──▶ /api/me/collections、/api/chat ──▶ personal_collections、chat_turns
网页对话 ──服务器已有模型配置──▶ DeepSeek / OpenAI（真实流式回答；不发送私人笔记）
论文 arXiv HTML / PDF、GitHub 固定 commit ──获取与解析──▶ source_documents（不可变原文与源码快照）
全文 / 源码检索 ──带位置的原始片段──▶ 模型 ──P/C 引用──▶ 对应段落、PDF 页、源码行
```

- `apps/web`：Next.js 16（App Router）+ Drizzle ORM。生产数据库 Neon Postgres；本地开发与测试用 PGlite（进程内 Postgres，无需安装数据库）。
- 登录：Better Auth + GitHub OAuth。作者身份由 `OWNER_EMAILS` 决定；草稿只有作者可见，讨论修订后在页面上发布。
- 来源解析：`apps/web/lib/sources.ts`。结构变化或周期不符时拒绝保存，保留上次成功快照并标记 stale。

## 本地开发

需要 Node 22.13+。

```bash
cd apps/web
npm ci
npm run dev
```

打开 http://localhost:3000 。不设 `DATABASE_URL` 时自动使用 `apps/web/.pglite/`。点“更新来源榜单”会实际抓取六榜。环境变量见 [apps/web/.env.example](apps/web/.env.example)。

首页使用已选定的 REA 参考布局，搜索所有已存论文与项目。`/prototype` 与 `/prototype/rea` 转到首页；旧阅读器保留在 `/legacy`。功能约定见 [FEATURES.md](apps/web/components/desk/FEATURES.md)。

仅本机个人使用时，在被忽略的 `apps/web/.env.local` 设置 `PERSONAL_LOCAL_MODE=1`，用 `npm run dev -- --hostname 127.0.0.1 --port 3100` 启动。该模式仅在开发环境、回环地址、没有远端数据库及 OAuth 时启用；所有状态落在本机 PGlite。部署后需使用既有 GitHub 登录，不能用此开关开放私人数据。

对话的服务器配置为 `CHAT_PROVIDER=deepseek` 与 `CHAT_MODEL=deepseek-flash`（或 `openai` 配合所需模型），密钥复用服务器进程已有的 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`。论文对话默认获取 arXiv 全文：优先解析带章节锚点的 HTML，失败后逐页解析 PDF；从完整解析语料检索相关片段，引用可回到原文段落或 PDF 页。每次显示全文覆盖、实际送入模型的片段数和解析限制；可明确切换到「已有解读与简介」，获取失败不会静默改用摘要。

项目页默认美东当日 GitHub 日/周/月三榜，按来源顺序展示；获取失败保留上次成功日期，往期快照可单独选择。项目精读可建立固定 commit 的源码证据包，按「工程价值 → 主链路 → 设计取舍 → 验证练习」追问真实模型，并补读具体文件。组织背景只作线索，支持模型、后端、全栈、Agent、通用软件和 Infra。方法与实际覆盖边界见 [PROJECT-STUDY.md](apps/web/components/desk/PROJECT-STUDY.md)。

原始材料与对话保存在数据库，旧引用仍指向旧快照；新增迁移只加表，不覆盖已有资料。PDF 当前提取文字与坐标，不做 OCR 或图片理解；复杂公式、双栏与表格需结合原 PDF 核查。项目证据包只读取公开代码，不运行项目或测试。查看内容、获取原文和提问都不自动标为已读。

```bash
npm run typecheck
npm test
npm run build
```

## 贡献

欢迎 PR。CI 会跑类型检查、全部测试和生产构建；每个 PR 会生成 Vercel 预览环境。请保持：

- 来源事实、源码核查、作者实验、个人推断分开标注；没跑过的不写"已验证"。
- 不替读者标记已读、收藏或笔记。
- 不提交凭证、个人笔记或不可再分发的论文原文。

## 许可

代码 MIT；站点上发布的中文解读与精读为 CC BY-NC 4.0。引用的源码与论文片段遵循其原始许可。

## 2026-10-19 首页与精读更新

首页现在默认美东今天的 HF 日榜论文及 GitHub 日/周/月三榜；按来源日显示，论文初始发表日另标。历史资料在 `#archive`，固定经典/写法样章在 `#samples`，不再作为今日内容填充。打开首页检查四榜，成功快照一小时复用，跨美东日期重新检查；来源未发布或获取失败会提示，不把历史日期改成今天。

当天新写的 CarryOn（arXiv:2610.18784v1）与 OpenCode（固定commit d85746a）各9节精读已同步原Vercel域名，保留私人待复核状态。文章从具体问题逐步走到状态/源码主链路、失败及设计取舍；有独立教学演示、真实原文问答和可定位引用。原文获取与问答本身不执行项目，研究中单独跑过的测试及限制在精读复核记录中列明。当天精读为此次选题研究结果，未启用自动每日生成。当前实现与验证依据见D-031和authoring/daily/2026-10-19/README.md。
