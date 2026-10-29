const commit='3bcbec813a48e5ff385f2d428e5aaa67a89a03cc';
const blob=(path,lines)=>`https://github.com/mksglu/context-mode/blob/${commit}/${path}${lines?'#L'+lines:''}`;
export const project={
 itemId:'repo:mksglu/context-mode',level:'deep',format:'mechanism',coverage:'source_code',
 title:'ContextMode：从一份支付日志，拆出 Agent 的上下文管理链路',
 summary:'Agent 只想查一个支付异常，工具却返回了几千行日志。从“先把结果打印少一点”开始，逐步走到进程执行、原文索引、混合检索、来源范围和输出预算，并用一次实际 MCP 调用检验这条链路。',
 sections:[
 {heading:'为什么先挑它，以及这次究竟读到哪里',citations:['C1','C2','C8'],body:`这次从美东 2026-10-19 已存 GitHub 三榜里选 ContextMode：它出现在周榜与月榜。它不是靠机构名或 star 数入选，而是因为有一个能独立追到底的工程问题：工具返回的海量内容，是否应该原样挤进模型上下文？这个问题涉及进程、数据库、检索、权限和协议适配，能学到超出一个 prompt 技巧的东西。

我的初步分类是“有明确机制、可以验证主链路的工程项目”。它不提出一个新基础模型，检索也建立在已有 SQLite FTS5、BM25 等技术上；价值主要在于把执行与信息交付连接起来。相比先选一个覆盖面很大的编程 Agent 平台，这次可以把一条输入到输出的链路讲完整，再讨论平台适配带来的复杂度。

范围固定在 commit 3bcbec813a48e5ff385f2d428e5aaa67a89a03cc，package.json 版本 1.0.169。核心阅读是 MCP 工具入口、执行器、ContentStore、SQLite 适配和相关检索/执行测试。会话记忆、各宿主插件、所有 hook 与网络抓取不是本篇的完整审计范围，也不把它们包装成已经读透了。

下面仍按约束重建设计，不编造作者开发史。贯穿任务是：一个订单状态迟迟没有更新，Agent 要从支付日志里找原因。我们还真的让这个版本的 MCP 服务处理了一份合成日志，结果和没验证的部分分开记录。`},
 {heading:'最小版本：先让 Agent 把一次故障查出来',citations:['C2','C3'],body:`最初的实现可以非常直接：Agent 调用命令读取日志，工具把 stdout 返回，模型阅读后回答。输入是一个调查目标与一段命令，输出是一大段文本。只有几十行日志时，这条链路几乎没有设计压力，甚至不需要专门做 ContextMode。

量一大，问题就出现了。模型只需要理解某个异常附近的证据，但工具的全部输出都会占用上下文，还会挤掉之前的任务状态。把十份文档、测试输出和日志依次塞进去，模型花了容量阅读大量当前问题用不到的内容。增加模型上下文上限能推迟这个问题，却没有回答“本次究竟该返回什么”。

第一种改进是只打印要看的内容。ContextMode 的 ctx_execute 接收语言、代码以及可选 intent；执行器把代码写入临时脚本，选对应 runtime，通过子进程运行，收集 stdout、stderr 和退出状态。如果你已经知道要找的订单号，可以在代码里先筛选，只打印几行证据。文件版本 ctx_execute_file 则把文件内容提供给脚本，让分析在执行侧完成。

这时模型扮演控制者，代码处理大量数据，返回结果只负责把必要信息交给模型。它不要求大模型亲自逐行扫描原始输入。但这也埋下新问题：如果最初筛选条件错了，没打印出来的内容还能找回来吗？`},
 {heading:'为什么不能简单截断，也不能每次都让模型写摘要',citations:['C2','C4'],body:`对日志只保留前 5,000 个字符，是最容易实现的上限控制。可支付故障常出现在后面，恰好被截掉。保留头尾稍好，但中间仍可能丢证据。它控制了输出长度，却把信息选择变成了位置猜测。

另一条路是先用 LLM 总结。摘要适合交付一个整体概览，但需要再次调用模型，且会把原始信息改写成二次产物。后续如果问“具体哪个订单、原句怎么写”，已经生成的摘要未必保留细节。对于异常排查，这个不可逆的筛选步骤值得警惕。

ContextMode 的核心路径是保留内容、按需取回。server.ts 中有两条需要区分的分支：给定 intent 且输出超过 5,000 字节时，intentSearch 把输出存入持久 ContentStore，再返回匹配片段的标题与短预览；没有 intent 时，普通输出超过 102,400 字节，indexStdout 会索引内容并返回检索入口。较小输出通常直接返回，不是每次执行都一律先建库。

这里的“持久”指内容保存在工具侧数据库，后续可以 ctx_search；不是把全文偷偷塞进模型，也不是把它交给另一个模型概括。小预览告诉 Agent 有什么可找，第二次调用才取回更具体的证据。于是接口从“一次给完所有结果”长成了“先给索引入口，再按问题取回”。`},
 {heading:'把一次调用串起来：入口、执行、存储、第一次返回',citations:['C2','C3','C4'],body:`沿主链路看一次带 intent 的 ctx_execute。MCP handler 首先检查命令或非 shell 代码的拒绝策略；随后 executor.execute 选择语言 runtime、创建脚本、启动进程。这里不是把用户代码当一段提示词交给 LLM，而是真正运行代码。返回值有 stdout、stderr、exitCode、timedOut 等状态，因此入口还得区分正常完成、非零退出和超时。

我们这次运行的是自己写的 JavaScript：打印 5,000 条正常支付日志，最后打印一条 ERROR PAYMENT_STATE_DIVERGED，带 order_id=7492、expected=paid、actual=pending。传入 intent=PAYMENT_STATE_DIVERGED，服务捕获的输出约 304 KB，进入 intentSearch 分支。

intentSearch 调用 getStore 取得持久内容库，用 indexPlainText 把输出按段切块并写入，再按 intent 搜索。第一次返回的是已索引多少段、匹配段的标题和首行预览，以及继续调用 ctx_search 的提示。注意它没有把完整异常片段原样返回。该版本还会回显被执行的源代码，帮助审查执行内容；回显本身也占输出长度。

这条链路的完成条件并非“模型已经解释了故障”，而是“执行结果被接住，内容可检索，调用者拿到了下一步入口”。把这个界限讲清，才能知道下一次搜索是设计要求，还是系统没完成任务。`},
 {heading:'原文进入数据库之后，怎样变成能找回来的内容',citations:['C4','C5'],body:`如果只是把 304 KB 文本存进一列，下一次仍只能全文返回，问题没有解决。ContentStore 先建立片段，再为片段建立全文检索索引。Markdown 路径主要沿标题组织，保留标题层级；代码围栏作为一个单位处理。纯日志走 indexPlainText，不能把两种切分算法混为一谈。

每个片段带标题、内容、来源与内容类型等信息。写入时同一批片段进入 Porter 与 trigram 两份 FTS5 表，还提取词汇供模糊纠错使用。这样查询不必把所有原文交给模型，数据库先做可控的候选筛选。

同一个来源 label 再次索引时，#insertChunks 在一个事务内删除旧来源及关联片段，再插入新内容。这避免同一来源更新后同时返回旧版和新版，但也说明它不是一个完整的历史归档系统。若多个执行结果共用 execute:javascript 这样的 label，新一次内容可能替换旧一次。事务保证这次更新的一致性，并不保证所有历史输出永久保留。

对从文件路径建立的来源，系统记录文件路径及内容 hash，在 searchWithFallback 入口检查是否过期，需要时更新。这种来源新鲜度设计适合会修改的代码或文档。反过来，从 stdout 保存的纯内容没有一个可重读的源文件，不能假设它会自动跟随外部事实变化。`},
 {heading:'从一句查询长成多路检索：每一层分别补什么漏洞',citations:['C4','C6'],body:`现在调用 ctx_search，查询 PAYMENT_STATE_DIVERGED，并把 source 限到刚才的执行来源。为什么不是一个 SQL LIKE 就结束？因为实际问题里，用户写的词不一定和原文完全一致。比如文档里写 caching，查询写 cached；符号是 responseBodyParser，用户只记得 responseBody；甚至把 database 拼成 databse。

当前版本的 #rrfSearch 会同时查两路候选。Porter 路径处理英文词干变化，trigram 路径补充子串匹配。两路内部用全文检索排序，随后做 Reciprocal Rank Fusion：候选在一路的第 r 名贡献 1/(60+r)，两路命中的贡献相加。它比较的是名次，不把两种原始分数直接硬加。实现里的合并 key 是 source 与 title 的组合，这也意味着标题身份的设计会影响去重粒度。

searchWithFallback 在得到融合结果后，还按标题、查询词之间的接近程度等信号重排。如果第一轮没有结果，才尝试基于词汇表和编辑距离的模糊纠错，并重跑检索。阅读源码时会看到某些旧注释仍写“porter → trigram → fuzzy”，但当前主体是前两路融合、空结果再纠错；不能只抄注释当架构。

最后还要把候选变成可读返回。extractSnippet 优先利用 FTS 的匹配高亮位置，在命中处周围取窗口，而不是永远截取片段开头。来源范围则避免“支付项目”的问题搜到另一个项目的同名配置。这里仍是词法与字符层面的检索增强，没有自动获得跨语言概念理解或可靠的语义推理；中文概念问一个全是英文术语的库，依旧可能漏召回。`},
 {heading:'实际跑一次：证据找回来了，但第一次预览并不好读',citations:['C2','C4','C6','C9'],body:`这次验证通过 MCP SDK 连接固定版本源码启动的真实 stdio 服务，依次调用 ctx_execute 和 ctx_search；没有调用外部模型，也没有把生成的日志当真实生产故障。合成输出原始大小是 303,962 字节，异常位于最后。只保留开头 5,000 个字符，确实看不到那条异常。

第一次 ctx_execute 返回的 MCP 结果对象，JSON 序列化后是 856 字节，提示已索引 278 段。然而匹配段的标题和首行是 order_id=4986 的正常日志，因为异常落在那一段的后部。虽然它声明匹配到了目标，预览本身没有直观显示错误。这是一个实测到的交互缺点，不能因为数据进库了就说体验已经足够好。

第二次 ctx_search 的结果对象序列化后是 1,315 字节，返回末尾的相关片段，其中能看到 order_id=7492、expected=paid、actual=pending。它支持的结论很具体：在这份已知关键词的合成日志里，尾部证据没有因模型侧的短返回而消失，后续能取回。它没有证明 Agent 能在未知故障里自主提出正确查询，也没有证明最终解释质量或生产任务成功率。

这些字节数不是 token、费用或端到端性能指标；一次原始日志与两个带协议结构的结果也不能直接变成通用压缩率承诺。另一次验证运行了上游 tests/core/search.test.ts 与 tests/core/executor.test.ts，共 155 项通过，覆盖检索和执行的一部分行为。这不是全项目、所有宿主或真实长期会话的完整验收。`},
 {heading:'问题继续长大：为什么还需要批处理、预算和边界',citations:['C2','C3','C7'],body:`如果调查一个问题要跑十条命令，再分别索引、查询，协议往返又会变成成本。ctx_batch_execute 把多条命令、结果索引和多条查询放进一个调用里，减少控制侧来回协调。它的默认查询范围是本批来源，显式选择 global 才扩大到整个持久库。这是范围与便利之间的取舍，不应默认为“搜得越广越好”。

检索也不能无限返回。命中多、每块又长，会把刚刚节省的上下文重新填满。因此搜索结果数量、片段窗口、返回上限，以及反复搜索的限流提示，构成新的约束。批处理查询的预算计数和片段提取，是另一层有界交付；预算数字在不同路径里的单位和严格程度并不完全一致，不能把它们都当成严格 token 上限。

执行侧同样需要上限。PolyglotExecutor 的进程输出有默认约 100 MiB 的硬字节 cap，超出时会终止进程；超时也可能只返回已捕获的部分。因而“所有原始内容永不丢失”不是对任意规模、任意执行都成立的保证。更准确的说法是：在捕获完成且成功入库的这条路径里，短返回不等于从库里截断删除原文。

还有一个容易误读的词是 sandbox。这里的核心隔离是临时脚本与子进程，外加路径检查、拒绝策略和环境变量过滤；它不是把每次代码运行都放进独立微虚拟机。执行器可以使用宿主环境，#buildSafeEnv 主要移除会注入或干扰 runtime 的变量，不能据此认定所有凭证都被剥离。运行不可信代码时仍要由宿主提供相称的权限边界。本次实测仅运行我们自己写的日志生成代码，子进程也只给了基础系统环境。`},
 {heading:'它真正值得学的架构取舍，以及我会改哪里',citations:['C2','C4','C6','C8'],body:`到这里，我愿意把它列为“值得精读一条核心链路”的项目，依据是机制能落到代码、结果能在本机检验、代价也能指出。它的学习价值不在“省 98%”这类宣传数字，而在把信息处理拆成三个不同责任：执行侧处理大量数据，存储侧保留可查询片段，模型侧只消费当前需要的证据。接口在这些责任之间传递可继续追问的入口。

相较每次用 LLM 做摘要，这条路径保留了原句、无需在核心索引步骤调用另一个模型；代价是你必须知道怎么问，词法匹配可能漏掉关键概念，错误的切片标题也会让用户看不懂预览。相较把完整输出写进一个临时文件、让 Agent 直接按行读，FTS 与来源管理更适合反复、多主题检索；但临时文件方案更简单，也更容易逐行核对。小任务完全可以只用后者。

若为本网站借鉴，我首先会改结果交付：首屏预览应直接显示命中词附近的原句，并清楚区分“没有搜到”与“材料里不存在”。其次给每次获取一个不可变来源版本，避免同名 label 替换让历史引用失效。第三，把质量评估拆成证据召回、最终回答正确性和实际阅读负担，不能只比返回字节少了多少。

这些是本篇的分析与改进建议，没有声称已经修改上游 ContextMode。它采用 Elastic License 2.0，公开可读源码也不代表可以忽略再分发或托管限制；本次学习核心机制，不复制其整套代码进网站。会话记忆与多宿主适配仍值得另开一篇，但要从新的问题出发，不能为了列出全部模块而打断这条主线。`},
 {heading:'读到这里，应该能自己画出什么',citations:['C2','C3','C4','C6'],body:`你应该可以从一条真实入口开始画：ctx_execute 收到代码与 intent，安全策略检查后启动 runtime；执行器交回 stdout 和状态；大输出被切分并在事务中写入 ContentStore；首次返回可检索入口；ctx_search 按来源范围做融合检索与片段提取；模型收到证据后才解释故障。每个箭头都对应实际的数据形态或状态变化。

最需要带走的区别是三个命题互不等价：原文被保存了；正确证据被检索到了；模型据此给出了正确结论。这次实测证明了一个具体例子的前两步，没有越界声称第三步也已经完成。工程质量也应分开判断：某条路径测试扎实，不自动说明所有插件都可靠；一个机制值得学，不自动说明它适合你的每个工作流。

可以自己试着改动三个条件：不提供 intent 而输出只有 20 KB，会不会还走相同的索引路径？把异常换成没有共同词的另一种描述，检索还能命中吗？连续两次用同一个 source label 写入不同日志，第一次的引用还能保持不变吗？如果你知道这些变化会碰到哪一个模块，就已经从“这个项目是干什么的”走到了“这套系统为什么这样工作”。`}
 ],
 sources:[
 {id:'C1',title:'项目用途、版本和许可证',url:blob('package.json','1-L9'),locator:'package.json v1.0.169；LICENSE 为 Elastic-2.0；README 只作功能定位'},
 {id:'C2',title:'MCP 执行入口与输出交付分支',url:blob('src/server.ts','1743-L2035'),locator:'ctx_execute handler；5,000 / 102,400 字节阈值；indexStdout；intentSearch'},
 {id:'C3',title:'运行时执行与资源边界',url:blob('src/executor.ts','231-L571'),locator:'PolyglotExecutor.execute / executeFile / #spawn；#buildSafeEnv 位于 L573 起'},
 {id:'C4',title:'内容存储、索引与检索回退',url:blob('src/store.ts','838-L1389'),locator:'index / indexPlainText / #insertChunks / search / #rrfSearch / searchWithFallback'},
 {id:'C5',title:'Markdown 分块与文件来源更新',url:blob('src/store.ts','1646-L1765'),locator:'#chunkMarkdown；#refreshStaleSources 位于 L1415 起；文件 path + SHA-256'},
 {id:'C6',title:'片段窗口与批量查询范围',url:blob('src/server.ts','1300-L1418'),locator:'extractSnippet / formatBatchQueryResults；search handler L2553 起'},
 {id:'C7',title:'SQLite 多写入架构与适配',url:blob('src/db-base.ts'),locator:'WAL、busy_timeout、withRetry；支持 node:sqlite 等运行时路径'},
 {id:'C8',title:'上游可执行的检索测试',url:blob('tests/core/search.test.ts'),locator:'本机执行本文件与 tests/core/executor.test.ts，155 项通过；原始日志在本机研究归档'},
 {id:'C9',title:'本次验证对应的源码执行与搜索路径',url:blob('src/server.ts','1982-L2035'),locator:'本机合成日志实测：303,962 B 输入；856 B 首次结果对象；1,315 B 搜索结果对象。数据及完整协议回执随本机归档保留；此源码链接不是线上托管的测试回执。'}
 ],
 terms:[{term:'FTS5、BM25 与 RRF 分别做什么？',explanation:'FTS5 是 SQLite 的全文检索能力；BM25 根据词频等信号排列候选；RRF 将不同检索路径的候选名次融合。它们负责找片段，不负责替你判断片段中陈述是否真实。'},{term:'工具侧保存全文，为什么还会漏掉答案？',explanation:'保存解决“是否还在”，检索解决“这次是否找到”。关键词不对应、切片不合适、来源范围过窄或预算太小，都可能让现有证据没进入回答上下文。'}],
 limitations:['固定 commit 3bcbec813a48e5ff385f2d428e5aaa67a89a03cc；没有把该版本的机制当作未来版本保证。','完整追踪 execute → index → search 主链路；会话记忆、宿主适配与全项目安全性未作完整审计。','本次 MCP 实验使用已知查询词的合成日志，没有外部模型参与，不等于未知任务成功率评估。','155 项上游测试属于两个测试文件；没有运行整套测试、性能宣传基准或各宿主端到端验证。','本机回执保存在研究归档和网站仓库的样章验证记录中；上方源码来源链接用于核对机制，不伪装为线上实验数据。'],
 study:{status:'needs_review',scope:'围绕支付日志调查，追踪固定版本的 MCP ctx_execute → PolyglotExecutor → ContentStore → ctx_search；实际执行该路径并核对部分上游测试。',sourceSnapshot:`https://github.com/mksglu/context-mode/tree/${commit}`,sourceCoverage:[{path:'src/server.ts:1647–2035、2553 起检索 handler、1300–1418；batch_execute 相关实现',level:'read',reason:'阅读选定入口、状态分支、索引助手和查询格式化；server.ts 全文件并未逐行审计。'},{path:'src/executor.ts、src/runtime.ts',level:'read',reason:'追踪执行、runtime 选择、输出 cap、超时与环境变量处理。'},{path:'src/store.ts:838–1460、1646–1765；src/db-base.ts',level:'read',reason:'核对写入事务、双索引、RRF、纠错、文件新鲜度、Markdown 分块及 SQLite 运行时基础。'},{path:'tests/core/search.test.ts、tests/core/executor.test.ts',level:'read',reason:'阅读检索和执行相关用例并实际执行；155 项通过。'},{path:'README、package.json、LICENSE；src/search/unified.ts',level:'skimmed',reason:'定位功能、版本、许可及会话检索边界。'},{path:'所有 hooks / 宿主适配 / 会话记忆 / 抓取与全安全审计',level:'not_read',reason:'未对整个仓库作完整行为认证；本文只把核心链路讲透。'}],
 claims:[
 {id:'B1',text:'带 intent 的大输出进入持久索引并返回标题预览，后续 ctx_search 取回正文。',kind:'implementation',evidence:[{source:'C2',anchor:'server.ts:1912–2035',support:'direct'}]},
 {id:'B2',text:'当前检索是 Porter 与 trigram 的 RRF 融合，空结果才尝试模糊纠错。',kind:'implementation',evidence:[{source:'C4',anchor:'store.ts:#rrfSearch、searchWithFallback',support:'direct'}]},
 {id:'B3',text:'同 label 原子替换旧来源，因此持久内容库不等于不可变的全历史归档。',kind:'implementation',evidence:[{source:'C4',anchor:'store.ts:1046–1072',support:'direct'}]},
 {id:'B4',text:'合成日志末尾异常通过实际 MCP execute→search 找回；首次预览未直接露出异常行。',kind:'implementation',evidence:[{source:'C9',anchor:'本机 checks/receipt.json 与 source handler 对照；2026-10-19T21:11:34.166Z',support:'direct'}]},
 {id:'B5',text:'输出 cap、超时、拒绝策略和宿主权限限制了“永不丢失”及“安全沙箱”的适用范围。',kind:'inference',evidence:[{source:'C3',anchor:'executor.ts:#spawn、#buildSafeEnv',support:'indirect'}]},
 {id:'B6',text:'它值得学习的是执行、保留、取证的责任分离；质量不能只用返回字节评估。',kind:'inference',evidence:[{source:'C2',anchor:'两阶段交付',support:'indirect'},{source:'C6',anchor:'命中窗口、范围与预算',support:'indirect'}]}
 ],mechanisms:[{id:'execute-search',name:'一次大输出调查如何完成',steps:['MCP handler 接收代码与 intent，检查拒绝策略。','执行器运行临时脚本并捕获输出与状态。','达到阈值后切分输出，事务写入内容库与全文索引。','首次仅交付可检索入口和预览。','后续按来源搜索，融合候选并返回证据片段。','模型使用证据解释问题；正确性仍需独立检查。'],boundary:'只描述已捕获且成功索引的主链路；内容保存、证据召回与最终正确性分别验证。',claims:['B1','B2','B3','B4']}],connections:[{title:'回到 PagedAttention，分清两个资源层次',body:'PagedAttention 让推理服务更有效利用 KV 显存；这里让 Agent 更有选择地消费工具输出。一个问题是物理布局与生命周期，另一个是信息交付与召回。减少 prompt 并不直接证明引擎显存下降了同样比例，分页也不会替应用决定什么证据值得读。',itemId:'paper:2309.06180'}],review:{checkedAt:'2026-10-19T21:11:34.166Z',method:'固定 commit，使用 Codegraph 追踪核心符号并核对源码；通过 MCP SDK 运行合成日志案例；运行上游两个测试文件，保存协议回执与测试日志。',findings:['155 项检索/执行相关测试通过，非全项目测试。','异常从尾部取回；首次预览标题来自正常日志，暴露预览不足。','旧注释的串行检索描述不代表当前 RRF 主体。','同 label 替换及进程输出 cap 使绝对不丢失承诺不成立。','等待用户评价这条叙述是否让项目机制足够可理解。']},openQuestions:['未知故障中，Agent 自主生成查询时的证据召回率如何？','中文概念查询英文文档时，漏召回会到什么程度？','来源替换后历史引用怎样保持稳定？','所有宿主和长期会话是否具有同样的范围与权限语义？']}
};
