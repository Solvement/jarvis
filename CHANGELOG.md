# CHANGELOG

只记录真实实施的改动、原因、过程。只追加，带时间戳；旧条目永不修改，纠正用新条目指向旧条目。格式见 [CLAUDE.md](CLAUDE.md)。

---

## 2026-09-06T19:40-04:00 · 速览生成实验（9/6 榜单，DeepSeek 与 Claude 对照）

**改了什么**：新增 `experiments/brief_0906/`：`collect_evidence.py`（证据包：仓库元数据、README、文件树、release、14 天窗口 commit；论文摘要 + arXiv HTML 正文前 22k 字 + 代码仓库 README）、`prompt.md`（共用写作规则：先判类型与上榜状态，再按状态选段落）、`generate_deepseek.py`（`deepseek-v4-pro`，json_object，本地校验，6 并发）、`build_compare.py`（对照页，含投票，投票经 artifact db 保存）。

**为什么**：用户授权在 DeepSeek 质量不够时改由 Claude 写速览；决定方式是同证据、同规则各写一遍，用户对照。

**过程**：第一次收集时「多次上榜」的变更窗口按库内 first_seen 算，只有两天，多数条目无变更可写；停掉生成，改为统一 14 天窗口后重跑。DeepSeek 串行约 30–50 秒 / 条，改 6 并发后完成。Claude 侧由四个子代理分批写 21 条。

**涉及文件**：`experiments/brief_0906/*`，`CHANGELOG.md`。未写入 `state/library.sqlite3`，未改 `jarvis/` 包。

**验证**：21 条证据包无抓取失败；DeepSeek 21/21 通过校验，无重试；Claude 21/21 通过字段校验。DeepSeek 用量 185,475 token，约 0.19–0.37 美元。对照页在本机浏览器打开无控制台错误。用户尚未复核内容质量。

## 2026-09-06T22:10-04:00 · 新前端 web/、速览规则改版与审核、首篇精读

**改了什么**：新增 `web/`（原生 JS 静态站：`index.html`、`styles.css`、`styles-deep.css`、`js/ui.js`、`js/list.js`、`js/detail.js`、`js/deep.js`、`js/app.js`、`build_artifact.py`）。路由：`#/github/<期>`、`#/hf/<期>`、`#/item/<id>[/<作者>]`、`#/deep`、`#/deep/<id>`。列表不展开，点卡片进详情页；详情页可切换 Claude / DeepSeek 两版速览并投票（artifact db 或 localStorage）。`experiments/brief_0906/`：`prompt.md` 改版（去掉「怎么用」，多次上榜只写对开发者有用的更新，噪声提交不写）、`collect_evidence.py` 给 commit 打噪声标签、`review_prompt.md` + `review.py`（DeepSeek 审核，输出问题清单与修订稿）、`build_site.py`（拼 `web/data/site.json`）。`experiments/deepread_2609.02749/`：`fetch_paper.py`（arXiv HTML 全文按节线性化、图表抽取）、`deepread.json`（Repo-To-Skill 精读稿）。旧前端 `docs/` 未删但不再使用。

**为什么**：用户要一个可看的前端、速览放到点击后的页面、增加审核机制、精读要能替代读原文。

**过程**：Claude 四个写作批次撞到会话额度上限，先用 DeepSeek 版补位，Claude 版陆续补齐后重建数据。arXiv HTML 解析第一次得到 0 块，原因是 `<header>` / `ltx_authors` 的 skip 计数只加不减，改为只解析 `<article>` 内部并只跳过 script/style 后正常（213 块、80 标题、3 图、6 表）。图片 URL 需带版本号 `2609.02749v1/`。Bash 工具对长 heredoc 会截断，CSS 改用 Write 单独成文件。

**涉及文件**：`web/**`、`experiments/brief_0906/{prompt.md,collect_evidence.py,review_prompt.md,review.py,build_site.py}`、`experiments/deepread_2609.02749/{fetch_paper.py,deepread.json}`、`CHANGELOG.md`。

**验证**：本机 `python -m http.server 8766 --directory web` 打开列表、详情、精读三页，浏览器无控制台错误；精读页图表（SVG）、步进演示、术语面板渲染正常；图表配色经 dataviz 校验通过。快照发布为 Artifact。未做移动端实测，未做 200% 缩放检查。

## 2026-09-06T23:32:40-04:00 · Declarative Attention 原文归档与正式精读

**改了什么**：归档 arXiv:2609.02737v1 的 42 页原始 PDF 与可检索文本；新增 fulltext 证据包下的 16 节中文精读、14 个术语和 10 条具体边界，并将分析导入知识库、重建旧版 `docs/data` 发布数据。

**为什么**：用户要求拉取并保存原文，同时给出足以替代线性阅读原文的精读；内容必须覆盖问题、机制、实现路径、实验条件、关键消融、失败模式和作者未验证的范围，而不只扩写摘要。

**过程**：先将 `paper:2609.02737` 加入 deep 队列并生成 fulltext bundle，再用 `scripts/fetch_paper.py` 下载 PDF、提取正文；逐项核对证据来源，独立渲染检查 PDF 第 1、8、11、13、35 页；按外部作者协议写入并导入 `analysis.json`。文中明确区分 attended-token 指标、roofline 理论估算与实测延迟，也把附录六个失败来源纳入结论边界。

**涉及文件**：`notes/papers/assets/2609.02737/{paper.pdf,paper.md}`、`state/bundles/paper-2609.02737--deep--53dcf42dd23f/analysis.json`、`state/library.sqlite3`、`docs/data/**`、`CHANGELOG.md`；五张抽检渲染图保留在 `tmp/pdfs/2609.02737/` 作为校核凭据。

**验证**：PDF 为 arXiv 正文 42 页、未加密、SHA-256 `4780AB2074C2FE899945746CA8C8AE5EFD11DAFACCC0CA47DA48262CDF7BFC0A`；五个抽检页面无裁切或渲染缺失。`analysis.json` 可被 PowerShell JSON 解析，含 16 个非空引用章节；`python -m jarvis import` 成功生成分析 ID `0a7175ce9f29fa6be7d207d1366b590acad331f738f1914816a0f59b3cc1b5a1`，`python -m jarvis publish` 完成。未运行作者代码或复现实验，未将条目标为用户已读。

## 2026-09-06T23:36:01-04:00 · Declarative Attention 精读重心校准

**改了什么**：按用户阅读目标删除复现路线、代码发布状态和部署操作清单；将第 15 节改为“如何读懂作者的评估：一条四层证据链”，集中解释答案质量、计算代理指标、消融因果归因、系统价值外推与失败案例五个判断层次。同步收紧第 6、14 节和 limitations 中与复现无关的内容。

**为什么**：用户的核心是学习方法如何解决问题，以及作者如何评估结果，不计划复现；精读应把阅读注意力留给机制和证据强度。

**过程**：保留原有方法链与实验数字，移除“怎么搭原型”“shadow mode”等工程建议；明确区分 attended tokens 的直接观测、DA-no-mask 的因果作用和 0.71×/0.77× roofline 估算的证据等级。

**涉及文件**：`state/bundles/paper-2609.02737--deep--53dcf42dd23f/analysis.json`、`state/library.sqlite3`、`docs/data/**`、`CHANGELOG.md`。

**验证**：修订稿仍含 16 个非空引用章节、9 条边界；全文检索不再包含“复现”“最小原型”或 `shadow mode`。重新导入的当前分析 ID 为 `1be398c27aa09fee254384b2e22f9c7613e3d8d4c3f9c05ebaa7bad2ec266e5a`，发布数据已重建。


## 2026-10-02T14:21:35-04:00 · 公网阅读台重建与发布

**改了什么**：新增独立 site 产品，公开阅读 GitHub/HF 完整日周月六榜；编辑式布局、搜索、精读书架、章节目录、字号与专注阅读、PoS 公式演示。首批 46 个项目 README 解读、9 篇论文摘要解读与 2 篇全文/源码精读；原榜条目不去重。

**为什么**：用户需要可在公网按按钮更新、长期阅读和理解的产品，原本地 SQLite 与静态实验不能直接充当公网运行环境。

**过程与文件**：调查原目录 1,113 文件与 289 目录，保存逐项 inventory 与 file map；新增 site/lib、app、components、content、D1 迁移、作者协议及安全导入脚本；原资料保留。公开发布 URL 为 https://jarvis-reading-lab.mvm22jgrrg.chatgpt.site。每日订阅写作任务 jarvis 为 ACTIVE，每天 09:00，美东时区；本地任务需要电脑与应用运行。

**验证**：TypeScript、生产构建及六榜解析/顺序/字段/坏页面测试通过；公网实际刷新返回 GitHub 17/17/23、HF 78/105/105；未经授权写入返回 401，过期来源返回 400，合法导入及幂等写入通过，独立读取确认持久化。宽屏与手机阅读无横向溢出，字号、专注开关与公式滑杆已交互验证。剩余仅标题翻译的论文明确标记待处理，由定时任务逐批补齐，不冒充全文精读。
# 2026-10-02T15:14:35-04:00 · 精读标准与知识沉淀修订

**改了什么**：按用户补充与私有 daily-ai-digest 的标准区分摘要、Skill 选用指南和源码/论文精读。新增 Matt Pocock 37 个 skill 的可搜索指南、WeKnora 检索链路 13 节源码专题；论文标题旁展示真实作者，PoS 机构由论文首页核查。详情展示阅读覆盖、论断证据、复核与关联分析，支持服务器 Markdown 导出。历史 Effect/PoS 保留并标待复核。

**保存与沉淀**：核实旧仓库 9 篇论文、16 篇项目精读与 24 份机器记录。私人原笔记仅保留本地备份。新增 reading-vault 冷存/PIN、脑图论断与机制、人读正文、修订版本索引和显式关联图；4 个公开阅读版本完成归档。每日 jarvis 任务已更新，质量优先于数量。

**验证**：类型检查、生产构建、六榜解析回归和精读入库检查通过；公网缺覆盖/快照的 deep 返回 400，无凭证写入 401，导出正文/37 个 skills 完整且返回 attachment，不存在版本 404；浏览器实际下载成功，中文“诊断”检索命中对应 skill；390px 阅读无横向溢出。发布第 4 版，源 commit e5db28f588d677ae9caed7f7d6eb9ce991988159。WeKnora 专题是静态源码阅读，未运行项目或复现实验，不声称全项目已精读。


## 2026-10-04T13:30-04:00 · 清理旧 AI-Brief 系列仓库

**改了什么**：GitHub 账号 Solvement 下 7 个旧版本仓库处理完毕。停用 `daily-ai-digest` 的 "Daily AI Brief"（每日调用 DeepSeek API）和 `jarvis-digest` 的 "daily-digest"（每日调用 OpenAI API）两个定时工作流；私有仓库 `Jarvis` 改名 `jarvis-legacy-0622`；归档 `ai-news`、`signalwiki`、`ai-brief`、`ai-brief-v2`、`jarvis-legacy-0622`、`daily-ai-digest`、`jarvis-digest`。

**为什么**：用户要求只保留一个唯一版本（新仓库 `Solvement/jarvis`，见 IMPLEMENTATION_NOTES D-005/D-008/D-016）；两个工作流 10/3 仍在每日消耗 API 费用，与"只用订阅"冲突；`Jarvis` 名称占用了新仓库名（GitHub 仓库名大小写不敏感）。

**过程**：先只读核查每个仓库的工作流、最近运行、secrets 名称、Pages 与 Vercel 项目。用户经确认对话同意 5 步方案。停用工作流成功；关闭 `ai-brief`、`jarvis-digest` 的 GitHub Pages 返回 403（PAT 无 Pages 权限），未完成；暂停 Vercel 项目 `daily-ai-digest`、`ai-brief-v2` 返回 403（Vercel 连接器对 `2063539021-4182s-projects` scope 只有读权限），未完成。没有删除任何仓库或数据。

**涉及**：GitHub 远端仓库设置，`CHANGELOG.md`，`IMPLEMENTATION_NOTES.md`。

**验证**：`gh api .../actions/workflows` 显示两个工作流为 `disabled_manually`；`gh repo list` 显示 7 个仓库 `isArchived=true`。未完成项：两个 Pages 页面仍公开；两个旧 Vercel 项目仍在线；两个工作流里的 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY` secret 仍存在。

## 2026-10-04T14:15-04:00 · 迁移到 Next.js + Postgres，加登录、草稿与个人状态

**改了什么**：新建 `apps/web`（Next.js 16 + Drizzle）。数据层 `lib/store.ts` 取代 Cloudflare D1 的 `lib/archive.ts`：最新榜单、刷新锁、失败保留旧快照、整批导入、阅读版本只追加、草稿可见性、每用户已读/收藏/笔记。新增 Better Auth GitHub 登录、`/api/cron/refresh`（Vercel Cron）、`/api/author/visibility`（发布草稿）、`/api/me/state`。阅读界面加登录、已读/收藏按钮和作者发布横幅。根目录变成 git 仓库，`.gitignore` 为允许清单；新增 CI、MIT 许可、新 README。旧 `site/` 保持原样，仍是 ChatGPT Sites 线上版本。

**为什么**：IMPLEMENTATION_NOTES D-005、D-007、D-012、D-017。

**过程**：先写 store 测试（PGlite），首次运行因模块不存在失败；实现后 17 条中 1 条失败——stale 记录与旧快照 fetched_at 相同，`DISTINCT ON` 取到旧记录；改为失败记录按检查时间排序后通过。旧 `test-sources.mjs`、`test-reading-quality.mjs` 移植为 vitest，夹具改为 gzip 存入仓库。Bash 长 heredoc 被截断，改用文件写入。从旧站 `/api/library` 导出数据并导入本地库，两次导入后行数不变（351）。旧根目录 CI（测 Python 包）移到 `state/legacy-root-ci-daily.yml`，旧 README 保存为 `state/legacy-README-2026-10-04.md`。

**涉及**：`apps/web/**`、`.github/workflows/ci.yml`、`.gitignore`、`.gitattributes`、`LICENSE`、`README.md`、`CLAUDE.md`、`IMPLEMENTATION_NOTES.md`。

**验证**：`npm run typecheck` 通过；`npm test` 4 个文件 44 条全部通过；`npm run build` 通过（10 条路由）。本机 dev 服务：首页渲染迁移数据、控制台无错误；无凭证访问 `/api/author`、`/api/cron/refresh`、`/api/me/state` 返回 401，`/api/author/visibility` 与跨站刷新返回 403；同源刷新实际抓取六榜成功（GitHub 15/19/23，HF 84/105/105，HF 来源日期 10/2、9/27、10/1）；临时凭证导入一条草稿，访客 0 条、作者 1 条。**未验证**：GitHub 登录流程（尚无 OAuth App）、Neon 连接与迁移、Vercel 部署与 Cron 实际触发。

## 2026-10-04T14:45-04:00 · 代码审查修复、公开仓库与 CI

**改了什么**：按代码审查的 5 条发现修复：登录系统出错时按匿名访客处理（不再让公开阅读 503）；离榜条目的修订版可导入（用已存版本中的条目核对 sourceHash）；版本 id 只哈希作者内容（榜单星数变化不再造成重复版本）；可见性切换与导出按 条目+层级+生成时间 定位；作者刷新后仍看到草稿。创建公开仓库 https://github.com/Solvement/jarvis 并推送。首次 CI 在 `npm ci` 失败（EBADPLATFORM：vite 的可选 peer `esbuild` 被标为 extraneous，其平台包丢失 optional 标记），显式固定 `esbuild@0.28.2` 为 devDependency 后修复。

**为什么**：审查发现的都是有具体失败场景的缺陷；CI 必须在 Linux 上可复现安装。

**过程**：先为 4 条可在数据层复现的发现写回归测试，确认 5 条新测试失败后再修；重新生成 lockfile 一次无效，定位到 extraneous 依赖后改为显式依赖。尝试用 Vercel 连接器创建项目，返回 403（连接器对该 scope 只读）。

**涉及**：`apps/web/lib/{store,server}.ts`、`apps/web/app/api/{refresh,author/visibility,readings/export}/route.ts`、`apps/web/components/{account,reader}.tsx`、`apps/web/test/store.test.ts`、`apps/web/package.json`、`apps/web/package-lock.json`。

**验证**：本地 `npm test` 48/48 通过，`tsc` 与 `next build` 通过；GitHub Actions run 37220016066（commit 474fa0c）typecheck、test、build 全部通过。**未完成**：Vercel 项目、Neon 数据库、GitHub OAuth App 均未创建（权限所限，待用户操作）。

## 2026-10-04T15:20-04:00 · 上线 Vercel：jarvis-reading.vercel.app

**改了什么**：创建 Vercel 项目 `jarvis`（关联 `Solvement/jarvis`，根目录 `apps/web`），绑定 `jarvis-reading.vercel.app`；用户接入 Neon（Vercel 集成）并填入 7 个环境变量（`AUTHOR_TOKEN`、`CRON_SECRET`、`BETTER_AUTH_SECRET` 由本机生成，存于忽略文件 `state/vercel-env.local.txt`；GitHub App 凭证由用户填入）。生产部署时 `scripts/migrate.ts` 在 Neon 建表；从旧站导出的 6 个榜单快照与 351 个阅读版本导入 Neon。暂停旧 Vercel 项目 `daily-ai-digest`、`ai-brief-v2`；用户手动下线两个旧 GitHub Pages。

**为什么**：D-005、D-012：先把基础设施做牢靠。

**过程**：Vercel 连接器带 `teamId` 调用一律 403，不带 `teamId` 调用成功（个人账号的默认 team）。用户最初在聊天里贴出 GitHub App 的 client secret，按"暴露即视为泄露"处理：请用户重新生成并只填入 Vercel，旧值未被使用。用户建的是 GitHub App（Client ID 前缀 `Iv23`）而非 OAuth App，已请用户开启 Email addresses 只读权限。导入旧数据时从 Vercel 读取一次 `DATABASE_URL`，写入会话临时目录、运行导入后立即删除，未写入仓库。

**涉及**：Vercel 项目与环境变量（远端）、Neon 数据库（远端）、`CHANGELOG.md`。

**验证**（2026-10-04 线上实测）：`/api/library` 200，6 榜、351 版本（翻译 284 / 摘要 62 / 精读 5）；无凭证访问 `/api/author`、`/api/cron/refresh`、`/api/me/state` 返回 401，跨站刷新 403；带凭证 `/api/author` 200；带 `CRON_SECRET` 调 `/api/cron/refresh` 200，Vercel 上实际抓取六榜成功（GitHub 15/19/23，HF 84/105/105，均非 stale）；`/api/auth/sign-in/social` 返回 github.com 授权地址，client_id 与回调地址正确；浏览器打开 WeKnora 精读页正常渲染，出现"GitHub 登录"按钮。旧站 `daily-ai-digest-ten.vercel.app`、`ai-brief-v2.vercel.app` 返回 503，两个 Pages 返回 404。**未验证**：完整 GitHub 登录回调（需用户本人授权）、作者邮箱识别、已读/收藏写入、草稿发布按钮、Vercel Cron 定时自动触发（首次应在 2026-10-05 11:30 UTC 左右）。

## 2026-10-04T15:40-04:00 · 补充验证：线上登录与个人状态

**验证**（用户本人在 https://jarvis-reading.vercel.app 操作）：GitHub 登录成功，右上角显示"作者 · 退出"，`OWNER_EMAILS` 匹配生效；文章页"标为已读"后刷新页面仍显示"已读 ✓"，`item_states` 写入与读取在 Neon 上生效。2026-10-04T15:20 条目中"未验证"的前三项至此已验证；草稿发布按钮与 Vercel Cron 自动触发仍未验证。

## 2026-10-04T16:45-04:00 · 报纸式首页与首期 39 张看点卡

**改了什么**：新增 `picks` 表（迁移 `0001_picks.sql`）、`lib/picks.ts`、`/api/author/picks`、`/api/author/picks/status`；资料库响应附带最新一期；新首页 `#/today`（头条、本期索引、按排名的卡片网格、工具速查），导航增加"今日推荐"，默认进入首页；标题字体 Noto Serif SC。新增 `authoring/collect_pick_evidence.py`。首期 2026-10-04 共 39 张卡（内核 15、论文 4、工具 20），写入线上。

**为什么**：D-012 第二步、D-018。

**过程**：先写 7 条 picks 测试再实现（这次实现与测试同批写完后才首跑，不是严格先红后绿）。用脚本抓 35 个仓库的 README（前 14k 字）、两级目录、语言、最新 release 和固定 commit，存 `research/oct04-picks/`（不入库）；论文只读摘要并按 D-013 初筛。本地导入后截图发现 CSS 多栏使阅读顺序按列排列，改为网格；宽屏头条右侧空白，加"本期索引"；375px 宽导航换行，改为单行可滚动。

**涉及**：`apps/web/{db/schema.ts,db/migrations/0001_picks.sql,lib/picks.ts,lib/store.ts,lib/types.ts,app/api/author/picks/**,app/api/library/route.ts,components/front-page.tsx,components/reader.tsx,app/layout.tsx,app/globals.css}`、`apps/web/test/picks.test.ts`、`authoring/collect_pick_evidence.py`、`.gitignore`、`IMPLEMENTATION_NOTES.md`、`state/author-results/2026-10-04-picks.json`（本地）。

**验证**：本地 `npm test` 55/55、`tsc`、`next build` 通过；GitHub Actions run 37224338452（commit e64119a）通过。本地 1440px 与 375px 截图检查：卡片按排名逐行、无横向滚动（scrollWidth 375）、导航单行。线上 `/api/author/picks` 导入返回 `{"ok":true,"count":39}`，`/api/library` 返回 39 张卡且全部关联到榜单条目；线上首页截图显示头条与本期索引。**未做**：看点卡内容尚未经用户校准；任何一篇新的源码级精读尚未开写。

## 2026-10-05T20:15-04:00 · 精读图示支持与第一篇源码级精读（open-code-review）

**改了什么**：阅读章节新增可选 `figure`（类型 `Figure`、导入校验 `checkFigure`、组件 `figure-frame.tsx`，沙箱 iframe 渲染）。安装 ponytail 插件（用户级，4.12.0）。克隆 ponytail、open-code-review 到 `D:\Agent-Proj`，open-code-review 建立 codegraph 索引。写成 open-code-review 精读（固定 commit 182898c，11 节、14 条论断、4 个机制、1 张流程图、1 个交互演示），以草稿导入。记录 D-020（纠正 D-019 的规则化写法）与 D-021。

**为什么**：用户要求先读月榜、按"问题→怎么解→解得怎样→我的判断"读到源码级；表达形式要求图与交互（D-003）。

**过程**：安装 ponytail 前读了它的 hooks 与 SKILL.md：无网络调用，只在 `~/.claude` 写模式标记文件；其"代码后不写设计说明"与 CLAUDE.md 的四段推理冲突，以用户指令为准。精读按执行顺序用 codegraph 与逐行阅读核对：selection → coverage → grouping → per-group loop → filter → comment resolution → rules。本地预览发现流程图只画出第一个方框：无引号属性值紧跟 `/>` 使 SVG 标签未闭合，在 `/>` 前加空格修复；还发现演示代码中 `Delete` 的返回值不合法，改为 `Update`。每次修改内容都换了新的 generatedAt，避免两个版本共用同一时间戳。

**涉及**：`apps/web/{lib/types.ts,lib/store.ts,components/figure-frame.tsx,components/reader.tsx,app/globals.css,test/store.test.ts}`、`IMPLEMENTATION_NOTES.md`；本地 `state/author-results/{build_ocr_deep.py,2026-10-05-ocr-deep.json}`、`research/selection-calibration.md`。

**验证**：`npm test` 56/56 通过（新增图示校验用例先失败后通过）；`tsc` 通过。本地导入成功，页面 11 节、2 个 iframe；截图确认流程图完整显示，交互演示点击"同文件出现两次"后正确高亮两处并给出说明。未运行 open-code-review，未复现其基准。线上导入与用户阅读尚未发生。

## 2026-10-05T14:43-04:00 · 纠正：本日两条条目的时间戳

**改了什么**：纠正 "2026-10-05T20:15-04:00 · 精读图示支持与第一篇源码级精读" 条目的时间戳——实际发生在 2026-10-05 下午约 14:00–14:40（美东），20:15 是我手写的未来时间，不是系统时钟。该条内容不变。同时，open-code-review 精读的 generatedAt 原先手写为 19:30 / 19:50 / 20:05（均为未来时间，只导入过本地开发库），改为由生成脚本读取系统时钟。

**为什么**：CLAUDE.md 要求时间戳为真实带时区 ISO 时间；未来时间会让版本排序与"何时写成"的证据失真。

**过程**：等待后台任务时用 `date` 发现当前为 14:43 美东，与已写时间不符。生成脚本改为 `datetime.now().astimezone()`；之后的 CHANGELOG 条目用 `date -Iminutes` 生成时间戳。

**涉及**：`CHANGELOG.md`（本条）、本地 `state/author-results/build_ocr_deep.py`。

**验证**：重新生成的 JSON 中 generatedAt 与 `date -Iseconds` 一致（见本次命令输出）。线上尚未导入任何带错误时间戳的版本。10/4 条目的时间戳未逐一核对，可能存在同类问题，未修改。

## 2026-10-05T14:49-04:00 · 第二篇源码级精读（context-mode）与两篇草稿上线

**改了什么**：写成 context-mode 精读（固定 commit e5fcca6，10 节、12 条论断、4 个机制、1 张流程图、1 个输出分流交互演示），并与 hermes-agent（e36a818）的 ContextCompressor 对照。open-code-review 与 context-mode 两篇以草稿（仅作者可见）导入线上；首期看点卡中两者状态改为"正在精读"。克隆 context-mode、hermes-agent 到 `D:\Agent-Proj`，context-mode 建 codegraph 索引。记录 D-022。

**为什么**：沙箱组第一篇；用户要求先回答"沙箱解决什么、怎么解、解得怎样"，并与 Hermes 的压缩对比。

**过程**：首次线上导入被 Vercel 平台的机器人检查拦截（403），原因是我等部署时高频轮询站点；停止请求，约 10 分钟后单次探测恢复 200，再导入。本地预览时预览窗格滚动位置不稳定，改为把图 1 单独作为临时静态文件渲染截图核对，核对后删除该临时文件。

**涉及**：线上数据库（两篇草稿、两张卡片状态）；`IMPLEMENTATION_NOTES.md`；本地 `state/author-results/{build_ctxmode_deep.py,2026-10-05-ctxmode-deep.json}`。

**验证**：本地导入成功，页面 10 节、2 个 iframe；图 1 单独渲染截图完整，图 2 拖动后正确显示"原样返回（小于 5KB）"。线上以作者凭证读取：两篇均为 draft，章节数 11 与 10，各含 2 个图示；访客视图不含草稿（由 D-007 的默认可见性保证，本次未单独请求访客视图）。未运行 context-mode，未复现其基准。

## 2026-10-05T20:22-04:00 · 2026-10-05 研究简报（13 篇）与正文分点、首页研究栏

**改了什么**：新增 `lib/body.ts`（正文分段与列表解析）与 `components/body.tsx`；阅读格式新增 `research` 与 `nextStep`；首页新增"研究简报"栏（按榜单顺序）；首页状态在精读为草稿时显示"精读草稿 · 待讨论"而不是"已发布"。写成 13 篇研究简报（gods-eye-view、ECC、financial-services、paperclip、WeKnora、hindsight、hyperframes、archify、Octop、substrate、OpenShell、cua、ghidra），含 11 个图示，其中 9 个可交互或带动画。

**为什么**：D-023；用户要求查证其提出的具体疑问并以分点、图示、动画在网页展示。

**过程**：先把 12 个仓库全部浅克隆，用户提醒"值得精读的才下载"后删除 6 个（gods-eye-view、worldmonitor、financial-services、hyperframes、archify、Octop）和此前审查用的 ponytail 克隆，改用 GitHub API 读文档；6 个精读候选保留并建 codegraph 索引。正文解析先写测试后实现。本地验证中发现并修复：substrate 动画里被驱逐的"恢复中" actor 会被定时器复活（改为仅在仍持有 worker 时完成恢复）；hyperframes 图中一段纯 HTML 写成了字面 `\n`；financial-services 动画右下说明文字溢出；首页卡片顺序随机、草稿被标成已发布。预览窗格在 iframe 内无法稳定点击，改为把交互图临时放到 public/ 下单独打开、用脚本操作验证，验证后删除临时文件。

**涉及**：`apps/web/{lib/body.ts,components/body.tsx,components/front-page.tsx,components/reader.tsx,lib/types.ts,lib/reading-label.ts,app/globals.css,test/body.test.ts}`、`IMPLEMENTATION_NOTES.md`；本地 `state/author-results/{build_oct05_research.py,2026-10-05-research.json}`、`research/{oct05-curiosity/,selection-calibration.md}`。

**验证**：`npm test` 61/61 通过、`tsc` 与 `next build` 通过；13 篇导入本地成功；首页研究栏 13 张卡；逐个用脚本操作交互图并核对输出（substrate 驱逐与远程恢复、雷达 Beta 更新 50%±57% → 75%±38%、OpenShell 规则分级与退出码、时间轴第 3.6 秒=第 108 帧、hindsight 五步、ghidra 四步、cua 三种 effect）。线上导入见下一条或尚未进行。

## 2026-10-05T20:25-04:00 · 研究简报上线

**改了什么**：commit 55fb30f 部署到生产（Vercel 部署 dpl_2cALKW3Jbj1dCjdKWjiY3qPnr6Vi，状态由 Vercel API 确认为 READY，未轮询站点）；13 篇研究简报以公开可见导入线上。

**验证**：导入返回 `{"ok":true,"count":13}`；访客视角 `/api/library` 读到 13 篇 research 格式、共 11 个图示，"下一步"标签 13 种齐全。线上页面的交互图未在浏览器中逐个复测（本地已逐个验证）。


## 2026-10-19T12:47:44-04:00 · 可点击阅读台原型与 REA 还原版

**改了什么**：增加 /prototype 的三种布局，以及 /prototype/rea 的暖白/紫色参考版；支持论文搜索提交、主题/期刊、URL 分页、详情、收藏、显式已读、笔记、学习与个人合集、演示对话及引用定位。参考版导入从原站公开脚本静态提取的 51 个工具事实字段，提供 7 类、3 许可分组、原生折叠详情和每次再显示 8 个。保留来源与摘要校验值；未导入推荐文案和历史热度指标。

**为什么**：用户先要体验完整交互，再指定用 REA 拆解原站。独立原型使设计可核对，不改动真实个人状态；公开页面和脚本用于取证，自有组件实现行为。正式 AI 仍遵循用户之前“复用现有模型配置”的要求，原型不调用模型。

**过程**：下载 REA 到 D:/Agent-Proj/rea，独立安装官方 6.7.0 CLI。完成原站与本地浏览器场景、公开脚本静态分析和 AST 字面量提取。一个通用 React 块触发堆上限，改为对两份业务脚本做聚焦分析，保留 partial 关系覆盖说明。首次登录页等待误以为邮箱字段 type=email，按实际 identifier DOM 修正后复验完成。补齐分页 URL、阅读返回页码与筛选变化重置页码。

**涉及**：apps/web/app/prototype/、apps/web/components/prototype/、IMPLEMENTATION_NOTES.md；本地 output/rea-dair/ 下的场景、证据、脚本、截图与报告。next dev 自动生成 apps/web/AGENTS.md、CLAUDE.md，并将 next-env.d.ts 的路由类型导入改到 .next/dev/types。

**验证**：npm run typecheck 通过；REA 11 组场景、69 个起始/操作状态完成；verification.json 中目录、显示更多、筛选、空结果、搜索提交、保存状态、笔记、引用、分页返回与合集进度检查均为 true；检查桌面及 390px 手机版截图。未运行生产构建、未运行新增单元测试、未调用真实模型、未部署线上；原型路由在生产环境返回 404。首次完整静态分析仅解析 20/21 文件，公开客户端关系图覆盖不等于服务端源码恢复。

## 2026-10-19T13:36:00-04:00 · 阅读台真实数据、私人沉淀与流式 AI
- **改动**：采用用户选定的 REA 参考版作为首页；接入全部已存目录（242 篇论文、71 个项目），保留阅读版本、证据、术语、图示、实验与导出；搜索、主题、真实日期归档、项目折叠与语言筛选、分页返回贯通。收藏/已读/笔记复用 item_states，新增个人合集和持久化问答；旧原型转到首页，清除模拟对话与样例目录，旧阅读器保留在 /legacy。
- **原因**：用户需要可长期使用的个人研究工具。用自己的内容和数据库承接已验证的交互，模型只根据实际取得的文字回答，避免用样例替代证据。详见 D-025（推理/理由/对比/风险）。
- **过程**：生成仅增加 personal_collections/chat_turns 的迁移；补目录与私人 API，限制本机个人模式的环境/Host/Origin；接通服务器 DeepSeek 流式输出、停止、错误重试、保存与引用。首次模型调用余额不足，用户充值后实测成功。补查原站提问登录交接。清理原型样式引入空选择器，经构建发现后修复；REA 选择器歧义修正后复验；历史引用重新映射后以真实回答回验。
- **文件**：apps/web/components/desk/*、app/page.tsx、app/layout.tsx、app/api/catalog、entry、chat、me/collections、app/legacy、app/prototype；lib/catalog、desk-model、desk-types、chat、personal、access、server；db/schema、0002 迁移及元数据；test/desk、chat-route、access；.env.example、README、原型说明。本机 .env.local 仅增非秘密配置且被忽略，密钥继续来自现有服务器环境。
- **验证**：77 项全套测试与最终相关 14 项回归通过；生产构建/类型检查通过；12 组 REA 正式版场景、122 状态完成；实际 DeepSeek 回答含可定位引用。完整刷新和服务器重启后私人数据均保留；验收写入的书架数据已清理。git diff --check 通过。未部署，未验证线上 OAuth/远端迁移，也未恢复原站私有后台或自动获取全文。

## 2026-10-19T14:19:00-04:00 · 论文全文、原文引用与项目源码精读

- **改动**：接通 arXiv HTML/PDF 实际全文获取和解析，保存不可变原文快照；论文对话默认从全文检索，P 引用可高亮段落、打开章节锚点或 PDF 页。项目默认美东当日 GitHub 日/周/月三榜，支持往期日期与返回今日；新增固定 commit 的源码证据包、文件补读与 C 引用行号定位，提供工程价值、主链路、取舍、验证练习四个真实对话入口。
- **原因**：用户需要原始依据和可迁移的工程学习，摘要、既有解读、README 宣传及组织名不足以作结论。选择不可变来源与逐步补读，明确区分已取得材料、模型实际片段和未验证部分；见 D-026 的推理/理由/对比/风险。
- **过程**：安装 Cheerio/PDF.js，生成仅增加 source_documents 的 0003 迁移，增加原始材料 API、受限网络抓取、双语检索/真实模型检索词改写及源版本引用。补正文到附录的检索和公式文字，修复源码初始包被清单挤占实现的问题；真实 PDF 测试发现 Windows 路径尾斜线不符，规范化后通过。加 PDF 动态 worker/字体产物追踪、全局获取期限、付费检索前并发检查及引用切换竞态/滚动修复。
- **涉及**：lib/{paper-parser,source-documents,source-network,source-retrieval,source-types,project-source,project-study-model,chat,store,desk-types}、api/{sources,chat,catalog}、components/desk、db/schema 与 0003、相关测试、next.config、package/lock、README。详细范围和本机 Evidence 见 IMPLEMENTATION_NOTES.md D-026。
- **验证与边界**：94 项测试、最终类型检查与生产构建通过；6 组 REA 场景 66 状态完成且所采集页面/console 错误为零；实际 DeepSeek 全文与源码回答、原文/源码引用、补读、390px、刷新及完整服务重启恢复通过。今日 GitHub 三榜为 12/14/21 项。PoS HTML 185 段，PDF 实际解析 27 页；Context Mode 599 文件目录中实取 10 个，旧回答仍能定位旧 9 文件包。未做 OCR/图像理解、完整仓库认证或执行第三方项目测试；未部署、未执行远端迁移。早期并发 409、选择器冲突与 REA 沙箱观察器问题均保留失败证据并分别复验。

## 2026-10-19T14:49:00-04:00 · 今日三榜 38 个项目的白话介绍

- **改动**：给美东 2026-10-19 GitHub 日/周/月榜全部项目新增中性白话介绍：日 12、周 14、月 21 个位置，去重 38 个；每项说明用途、一个场景例子、README 来源和核对范围。列表优先显示该介绍，详情可明确进入新版本，旧阅读单独保留；增加来源序号和显示本榜全部按钮，取消介绍的两行截断。
- **原因**：用户要求先了解每个项目，再本人提出感兴趣的问题；当前不做质量判断或精读推荐。以追加版本代替覆盖旧精读，保留历史资料与论文原有显示规则。推理/理由/对比/风险见 D-027。
- **过程与文件**：38 份 README 归档到 D:/Agent-Proj/jarvis-project-intros/2026-10-19，含获取时间、内容 hash、脑图及 outputs/readings.json。现有作者 API 成功导入 38 条 project_intro/translation。修改 lib/{types,desk-types,desk-model,reading-label}、components/desk/{listing,reader,desk.module.css}、public/authoring.json 和 test/desk.test.ts。未调用网页模型 API，也未运行仓库代码。
- **验证**：三榜 47 个位置介绍覆盖完整；95 项测试和生产构建/TypeScript 通过；REA 桌面与手机最终 28 状态完成、采集页面与 console 错误为零，检查全文例子显示、原榜顺序、全量展示、介绍详情版本、来源与刷新保留。未选择精读对象、未改用户书架状态、未部署远端。证据在 output/project-intros/。

## 2026-10-19T17:27:11-04:00 · 问题驱动的论文与项目样章

- **改动**：实际写入 PagedAttention 9 节、ContextMode 10 节私人精读草稿，沿最小问题→新增约束→设计扩展连续展开，配 KV 分块/COW 教学模拟和支付日志取证回放。加入首页样章入口、折叠原文依据、逐节辅助提问、宽对话面板和受限沙箱图示测高。已有文章与私人状态保留。
- **原因**：用户授权自行选题试写，要求以读懂原文机制为核心；依据可核查，问答服务阅读。推理/理由/对比/风险详见 D-028；没有以字数或生成成功宣布精读质量过关。
- **过程与文件**：固定论文 v1 与项目 commit，归档原文、源码、脑图、hash 和回执；从真实 MCP 路径找回 304 KB 合成日志的尾部证据，上游部分测试155项通过。authoring/samples/2026-10-19 保存原创内容与验证摘要。store.ts 支持认证作者导入榜单外规范论文元数据并增加2项回归；components/desk/{reader,reading,reading-samples,chat-panel,desk.module.css}、figure-frame.tsx、chat.ts、authoring.json 更新。论文全文193段与源码证据包16文件实际落库。
- **验证与边界**：最终97项网站测试、类型检查和生产构建通过；REA桌面/手机/最终冒烟共67成功状态、采集错误为零；两个真实模型回答及原文/源码定位通过。修正图示换行错误和手机截断，失败证据保留。论文GPU性能未复现，项目全库/全宿主未认证，样章仍待用户评价。仅本机生效，未部署；详见 output/reading-samples 和 D-028。

## 2026-10-19T18:01:05-04:00 · 新版同步到现有 Vercel，保留线上个人资料

- **改动**：生产域名 https://jarvis-reading.vercel.app 已切换到新版，部署 dpl_561buFy4HmRCWJck7jcJ6kTLkoMo。同步两篇私人精读、今日 GitHub 三榜介绍、论文全文与固定源码、历史对话；现有模型配置为 DeepSeek Flash，凭证只保存为 Vercel Secret。
- **原因与过程**：保留原 Vercel、Neon 和 GitHub OAuth；先备份再应用增加表的迁移，按目标指纹执行仅新增导入，冲突保留线上数据。新增 sync-plan.ts、library-sync.ts 和 5 项回归。旧数据逐行内容比对通过；新增 15 快照、56 阅读版本、9 文档、1 空状态与13对话。推理、备选、风险与修正详见 D-029。
- **验证**：102 项测试、类型检查与本地构建通过，Vercel Linux 构建 READY；暂存目录 HTTP 200 后 promote。正式域名匿名首页/三榜和认证作者样章 API 正常，9/10节稿件、193段论文及16个源码文件证据均在线。桌面/手机各4个 REA 状态完成，采集页面/console错误为零。发布后原108快照、366阅读、39选题、1个人状态原样保留；原收藏、笔记未覆盖。
- **边界**：样章仍为私人草稿。原始数据库、备份、环境文件与私有写作资料未进入源码部署包。当前需用户完成网站 GitHub 登录，线上新问答与引用跳转待实际账号验收，不能用导入旧对话替代。通过 CLI 上传本机当前116文件，未提交/推送 Git；后续 Git 自动发布须包含新版，详见 source-manifest 与 D-029。

## 2026-10-19T18:25:06-04:00 · 线上真实全文与源码问答验收完成

- **验收结果**：原作者通过网站 GitHub 登录；线上分别新提一个 PagedAttention 全文问题和一个 ContextMode 源码问题，DeepSeek Flash 均真实返回并保存。论文依据111/193段、定位 §4.1 式(4)；项目依据27/322段、定位固定commit的 src/store.ts:1032–1096。两次刷新后新回答保留，数据库独立确认两条新turn均complete。
- **保留核对**：迁移后的全部旧资料与13条原对话逐行内容保持原样，仅新增两次实际提问，总对话15。未修改收藏、笔记、已读、模型配置或认证策略，无需再次部署。D-029待验收项已完成；方法、截图、证据与限制见D-030及output/deployment-2026-10-19。

## 2026-10-19T19:41:00-04:00 · 美东今日首页与 CarryOn / OpenCode 精读上线

- **改动**：首页默认真实美东今日HF论文与GitHub三榜，历史资料、经典样章独立；显示发表日与来源日，缺失今日来源不填旧榜。新增CarryOn及OpenCode各9节私人问题驱动精读、两个交互教学回放、169段论文全文和17文件固定源码包。
- **原因与实施**：从明确问题逐步解释新增约束与机制，保留原文证据和失败边界。新增discovery.ts、today.tsx及5项发现回归，修改四榜更新/日期、desk路由和展示、按每日最终稿同步规则及1项同步回归。选题/研究详见authoring/daily/2026-10-19与D-031；Git惰性blob尺寸读取与REA选择器问题已修正，早期失败证据保留。
- **验证**：108项网站测试、TypeScript、本机和Vercel生产构建通过；桌面/手机本机与正式域名共104个最终REA成功状态，采集页面/console错误为零。OpenCode独立协调器26项上游测试/67断言通过（版本与范围限制见文章）。生产真实DeepSeek分别回答新全文/源码问题，原文锚点/固定commit行号定位和刷新持久化、数据库只读核对完成。
- **发布与数据**：正式域名继续https://jarvis-reading.vercel.app，部署dpl_RTbU1ES88g7E4KzbGHxd2XbyhR1h。先备份后仅新增4快照、2阅读、2源文档；原123快照/422阅读/39选题/9文档/2个人状态/15对话逐行不变，再增加两次实际问答，共17。模型/OAuth配置不变；备份与凭证未进入部署包。未推Git、未将私人草稿自动公开，后续自动Git部署须包含当前源码。

## 2026-10-20T11:21:00-04:00 · 外部账号登录改用独立 OAuth App

- **原因**：生产GitHub登录指向private的Jarvis021220 App，拥有者可用，外部账号受限制；注册回调与线上一致。核查原App另有29项仓库权限，未直接将其公开。推理、理由、备选与风险详见D-032。
- **改动**：获用户明确批准后创建Jarvis Reading Login OAuth App，实际只读基本资料和邮箱；更新原Vercel Production/Preview共享的两项GitHub凭据，新secret作为Secret保存，其他配置及原App不动。以现有119文件源码发布dpl_2hmCkKnLtDxzhtcTFpSHFuqdJjSp，原域名保持不变；无业务源码或数据库结构修改。
- **验证**：Vercel构建READY、暂存auth/ok与生产发起登录HTTP200；实际新授权页显示仅身份/邮箱只读权限，授权回调成功、进入原作者账户并刷新保留。原账号绑定仍1条且ID不变；137快照/424阅读/39选题/11原文/2个人状态/17对话逐行未变。截图与脱敏报告见output/access-2026-10-20；同学账号仍需本人重试，未宣称已代测外部账户。未购买/绑定自有域名、未增加邮箱登录，国内直连问题尚未实际部署解决。

## 2026-10-20T11:35:33-04:00 · 自有域名绑定原生产网站

- **改动与原因**：用户亲自购买 jarvisreading.com 后，将域名绑定现有 jarvis 项目；注册一年且自动续费关闭。直接复用原部署与数据库，避免资料分叉；推理、理由、对比、风险见 D-033。
- **验证**：Vercel 域名及项目绑定均 verified=true，DNS misconfigured=false；本机访问 https://jarvisreading.com/api/catalog 返回 200。原 137 快照/424 阅读/39 选题/11 原文/2 个人状态/0 合集/17 对话逐行保持原样，备份与核对报告保存在 output/email-domain-2026-10-20。
- **未完成边界**：未修改业务代码、数据库结构、模型配置或 GitHub 回调，未重部署。Resend Free 安装等待用户在官方页面接受服务条款；邮箱验证码尚未接入，不能据此宣称国内登录链路已完成或大陆访问稳定。

## 2026-10-20T11:56:00-04:00 · 自有域名邮箱验证码登录上线并保留原账户资料

- **改动**：原网站增加邮箱验证码主入口，接入真实 Resend Free；发信子域名已验证。复用 Better Auth 原用户、会话与资料库，增加哈希验证码、五分钟有效期、错误次数和跨实例发送/验证限额、精确新域名信任和已验证邮箱作者判断。保留 GitHub 备用入口及原回调域名；无数据库结构变更。选择与风险见 D-034。
- **实现与修正**：新增 login-email、auth-rate-limit、EmailLogin/CSS 和八项认证集成回归，修改 auth/client/server、AccountBar、viewer 及 catalog/library 输出。真实测试发现发信异常被框架吞掉会误报成功，使用请求内状态与 after hook 转为 503，并修正 hook 上下文合并层级。禁用未使用的 OTP 改邮箱/密码端点；Next 修补到 16.3.8、Resend SDK 6.34.1。没有强制升级 Drizzle 工具链。
- **验证发布**：116 项测试、TypeScript、本机与 Vercel 构建通过；124 文件 hash 隔离上传，暂存 auth/ok 与 catalog HTTP 200 后发布 dpl_EZQvsN1J8CirJ9KYaaoDrNGwrrMs。https://jarvisreading.com 与原域名均服务新版。真实邮件 delivered，用户在站内亲自输入验证码成功进入原作者账户，刷新保留；原精读及 deepseek-flash 已存全文对话正常，浏览器错误零。
- **保留与边界**：原137快照/424阅读/39选题/11原文/2个人状态/17对话逐行不变，原用户与 GitHub 绑定 ID 保留，九项既有模型/数据库/作者/会话配置指纹一致。备份和证据在 output/email-domain-2026-10-20；未保存验证码到报告、未发布私稿、未替用户收藏或写笔记。大陆线路与同学本人账号仍需她关闭梯子实测；未推送 Git，后续自动部署须包含当前源码。


## 2026-10-20 · 学习圈

导航「经典样章」改为公开学习圈。首篇「Agent 评测 10.20小记」保留飞书原文和两张本站图片，每篇提供无需登录的全文分享链接；飞书后续改稿不会自动公开。

学习圈修复：恢复飞书原始红/绿文字标记及其准确范围；后续导入使用包含样式的完整格式，保留颜色语义。
