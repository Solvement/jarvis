# Jarvis · 开源与论文阅读台

每天从 GitHub Trending 与 Hugging Face Papers 的日 / 周 / 月三榜里，挑出最值得读的项目和论文，做**源码级精读**：先讲清楚现状出了什么问题、为什么会有这个问题、它怎么解决，再按系统设计的方式逐部分拆解到代码与原文。读完的内容沉淀成可检索的知识库。

- 决策与取舍：[IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md)（现行规格真源）
- 实际改动记录：[CHANGELOG.md](CHANGELOG.md)
- 精读写法：[research/deepread-method.md](research/deepread-method.md)、阅读标准 [apps/web/public/reading-standard.md](apps/web/public/reading-standard.md)

## 架构

```
GitHub Trending / HF Papers ──(Vercel Cron 每日 + 访客按钮, 2 分钟锁)──▶ /api/refresh ──▶ Postgres(Neon): snapshots
作者会话（Claude Code 订阅，不调用模型 API）──Bearer AUTHOR_TOKEN──▶ /api/author ──▶ readings（只追加；精读默认草稿）
读者 ──GitHub 登录──▶ /api/me/state ──▶ item_states（已读 / 收藏 / 笔记，只由本人显式写入）
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

打开 http://localhost:3000 。不设 `DATABASE_URL` 时自动使用 `apps/web/.pglite/`。点"刷新最新内容"会实际抓取六榜。环境变量见 [apps/web/.env.example](apps/web/.env.example)。

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
