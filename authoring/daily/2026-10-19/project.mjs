export const commit='d85746a054924241a7edde736eefd079dff9bc00';
const blob='https://github.com/anomalyco/opencode/blob/'+commit+'/';
const source=(id,title,path,lines)=>({id,title,url:blob+path+'#'+lines,locator:path+' '+lines});
export const project={itemId:'repo:anomalyco/opencode',level:'deep',format:'mechanism',coverage:'source_code',
 discovery:{day:'2026-10-19',board:'github:daily',rank:2},
 title:'OpenCode：Agent 正在干活，又收到一条消息，系统怎样接住它？',
 summary:'从一次用户输入开始，追踪持久 inbox、会话内单执行者、可合并的唤醒、steer/queue 边界和重启恢复。用固定源码与 26 项协调器测试，拆解一次模型调用之外的 Agent 工程。',
 sections:[
 {heading:'先选一个比“支持哪些模型”更值得追到底的问题',citations:['C1','C2','C4'],body:`你让编程 Agent 修一个支付回调问题。它开始读文件、调用工具和运行检查；这时你补充：“先别改数据库结构，只解决重复扣款。”这条新消息应当插进正在进行的工作，还是等当前任务结束？如果用户双击发送，或者网络重试，又会不会真的启动两次修改？

单轮聊天可以近似写成 request → LLM → response。编程 Agent 不行：执行可能很长，有持续到来的输入、有外部副作用，还有停止、清理和恢复。OpenCode 值得学的一部分，就在这些产品交互背后的状态与并发机制。

本次选题来自美东 2026-10-19 GitHub 日榜第 2 位。固定源码是 dev 分支的 d85746a054924241a7edde736eefd079dff9bc00；目录已经是新的 packages/core 与 packages/server 结构，不能拿旧版 packages/opencode 的路径来套。本文只追踪输入接纳到执行协调、投影及恢复这一条链，不把整个项目都说成已经读透。

下面的支付任务是教学场景，没有让 OpenCode 接触真实支付系统。我们实际运行的是固定源码协调器的上游测试，后面会说明测试能证明什么、还没覆盖什么。`},
 {heading:'最小版本能工作，但“每来一条输入就启动一次”很快出问题',citations:['C1','C2','C5'],body:`最小实现是用户发来文本就启动一个异步执行循环。只有一个用户、一次输入时，这很直观。第二条消息一到，如果再启动一个循环，两条循环可能同时读取旧状态、分别修改相同文件，模型流、工具结果和会话历史也会交错。

加一个 busy 标记可以避免同时执行，但仍没有回答忙时新输入放在哪里。直接丢弃，用户会觉得“发出去了却没处理”；临时放内存数组，进程退出就不见了；一直阻塞发送请求，则把一次输入被系统接住，与漫长任务何时完成绑在一起。

OpenCode 把这两个完成条件拆开：prompt 被接纳，表示输入已经进入会话的持久待处理状态；执行何时消费它，是另一层职责。server 的 session.prompt handler 传入 sessionID、message ID、文本、附件和 delivery 等参数，调用核心 Session 服务，而不是在 HTTP handler 里直接写一轮模型循环。

这里先建立第一个区分：接收成功、进入模型可见历史、实际执行结束，是三件事。后面的 inbox、事件投影和协调器，分别让这些状态有明确的归属。`},
 {heading:'先把输入接住，再通知执行者：为什么需要持久 inbox',citations:['C2','C3','C5'],body:`核心 Session.prompt 先取得会话并确定 message ID，再尝试 reconcile。相同会话、相同类型和相同 ID 的输入若已接纳，直接返回原记录，不重新准备一份新 payload。这个语义是“首次接纳生效”，不是拿相同 ID 更新消息正文。真正的新输入应当使用新的 ID。

新输入还要经过 SessionPrompt.prepare，把附件、skill 和插件处理后的内容准备好。准备成功之后，admission.admit 发布 InboxEnqueued。对应 projector 将内容写入 inbox 投影，并用事件的 durable sequence 记录排队顺序。输入从此有一个不依赖本地忙闲标记的记录。

接纳之后，若没有显式 resume=false，才调用 execution.wake(sessionID)。这不是一句无关紧要的调用顺序：先存工作，再发唤醒；唤醒只是提醒执行者去检查已有工作。它不需要自己携带每一条用户消息，也不应该成为唯一的消息存储。

这能降低哪些风险，又不能消除哪些风险？它让一次已接纳输入不必依赖某个内存队列生存，并给重试提供稳定身份；但同一用户意图若以两个不同 ID 发送，仍然是两条输入。输入接纳去重也不自动保证之后每一次外部工具副作用都只执行一次。`},
 {heading:'一个会话只要一个执行者，不同会话却可以并行',citations:['C4','C6'],body:`持久化解决了“工作放哪”，还没解决“谁有权运行”。SessionRunCoordinator 的核心是一个以 key 为索引的 executions Map。一个 key 对应一个本地忙碌期，拥有执行 fiber、给等待者用的 done，以及稍后会解释的 pendingWake。真正实例化时，这个 key 是 session ID。

run 在空闲时创建执行；如果该会话已经在运行，就加入当前执行的完成等待，不再启动第二个 drain。wake 则更轻：空闲时启动，忙时只记录一次需要继续检查的通知。另一个 session ID 可以拥有自己的执行，所以这不是把所有用户串成一条全局队列。

有一个容易混淆的层次：会话内只有一个执行协调者，不表示一轮 Agent 内所有工作都只能串行。模型流、工具执行以及其他资源有自己的并发策略；本篇只证明同一会话 drain 的所有权边界，不能据此推导工具层的全部行为。

还必须看清作用域。这个 Map 和 fiber 属于当前进程，不是 Redis 分布式锁。它能约束本进程同一会话的执行，不能单凭这一段就声称多个服务器同时连同一数据库也获得了全局唯一执行权。`},
 {heading:'忙时的唤醒可以合并，为什么消息却不会因此少掉？',citations:['C4','C5','C9'],body:`假设 A 正在执行，期间 B 和 C 都被接纳了。两个 wake 到达同一个活跃 execution 时，不会排成两个独立执行任务，而是更新 pendingWake。它很像门铃：“结束前还要再看一次待办。”多次门铃可以合并，因为真正的 B、C 已在持久 inbox 中，而不是只存在于门铃计数里。

当前 drain 结束后，loop 检查 pendingWake。只要仍有待唤醒范围且执行没有进入停止，就清掉标记、让出一次调度，再做一轮 drain。让出调度也避免同步完成、同步再次唤醒时不断加深调用栈；上游有专门的 trampoline 测试覆盖这一点。

最危险的不是正常运行中的门铃，而是“刚检查完没有工作，准备变空闲”这个缝隙。若通知在清理或 settled hook 阶段才到，settle 会看到仍有 pendingWake，启动后继 execution，而不是简单把 key 从 Map 删除。旧忙碌期的等待者拿到旧 execution 的结果，后继工作有自己的完成边界。

这段代码的价值不在于把所有逻辑藏进一个 while(true)，而在于把工作记录和唤醒通知分开，并明确处理退出窗口。消息数可以很多，通知只需表达“再检查”，只要消费端仍按 inbox 规则取出实际工作。`},
 {heading:'“现在补充要求”与“下一轮再做”为什么要用不同输入范围',citations:['C5','C9'],body:`回到那句“先别改数据库结构”。它与“当前任务做完后再帮我写部署文档”不是同一种交付要求。若任何排队输入都在任意 step 边界抢进来，后一个任务可能把前一个执行意图打断；若所有输入都等结束，用户又无法及时纠正正在发生的工作。

源码用 delivery 表达这一区别：steer 适合当前意图中的补充，queue 作为下一轮输入保留。runner 的中途边界使用 steer 范围；只有允许 input 的边界才可以在没有 steer 待处理时，从 queue 中提升一条。promotion 还要处理 compaction、move 这类控制项，不能把它们当普通文本随手跨过去。

这里的“提升”也不是读一下数组就算结束。InboxDelivered 的投影会消费 pending 行，再把其 payload 插入可见消息；事件总线用数据库事务承载事件与投影更新。于是模型可见历史和待处理 inbox 之间有了可检查的交接，不该出现已经从待办删除、却没有进入可见历史的半交付状态。

我们实际核对了这个事务与 projector 调用关系，但没有把协调器单元测试的结果冒充完整数据库集成验收。与之相似，门铃范围会合并为更宽的 input，不等于把当前任务的 scope 永久保留给后继执行；源码和测试都特别处理了这一点。`},
 {heading:'用户点停止：停止被接受，不等于清理已经结束',citations:['C4','C6'],body:`用户停止正在运行的 A 时，系统不能一直等所有清理完成才回应点击，也不能立即宣告会话完全空闲，让新任务撞上仍在释放资源的旧任务。源码把 interruption accepted 和 execution settled 两个时点分开。

interrupt 标记 stopping，清除截至停止时归属于旧意图的 pendingWake，再请求中断拥有执行权的 fiber。它可以立即确认停止已被接受；清理和 settled hook 继续完成。若有人在这个阶段调用 run，不直接加入正在停止的 execution，而是等待其清理结束后重新尝试。

停止期间又来了真正的新输入怎么办？清理阶段记录的新 wake 会在 settle 看到，并启动后继工作；这与停止前旧意图积累的通知区分开。awaitSettlement 等当前被中断执行收尾，awaitIdle 则继续跟随后继，直到该 key 确实没有活跃执行。两个等待语义并不相同。

还有一个产品上很实用的边界：某个加入等待的调用者取消等待，不应该把共享执行者也一起取消。上游测试专门验证 joined waiter 被中断时，拥有者仍可继续。把这些都简化成一个 AbortController，很容易让“关掉等待窗口”意外变成“取消所有人的工作”。`},
 {heading:'进程真的死了以后：恢复靠持久声明，不靠内存 Map',citations:['C6','C7'],body:`到这里，所有协调器状态都仍在内存里。服务器被强制终止时，done、owner、pendingWake 都会消失，因此不能靠“finally 里肯定会保存一下”保证恢复。清理钩子恰恰可能来不及运行。

SessionExecution 在忙碌期开始时发布 Started，并把执行 claim 与开始事件放在同一提交边界。正常结束或失败会通过终止事件释放 claim；shutdown 中断则保留它。重启服务扫描仍悬挂的 claim，准备恢复原来的执行意图。恢复尝试次数也先持久计数，默认每个 turn 超过 10 次就转为终止，避免不断重启却永远消耗资源。

这里源码自己给出了重要限制：恢复是 at-least-once，不是所有外部副作用的 exactly-once。崩溃发生在外部修改已经完成、内部终态尚未保存之间，重新执行仍可能重复动作。支付回调例子里，真正的扣款接口还需要自己的幂等键和业务状态约束，会话输入去重不能代替它。

恢复扫描也有部署前提：它假设遗留 claim 的旧拥有者已经死亡，托管服务器协议负责确认旧进程退出与注册互斥。本篇没有审计所有注册、远端实例和多机路径，不能把进程内协调器升级解释成任意集群上的分布式任务系统。`},
 {heading:'我们实际验证了什么，以及怎样把它迁移到自己的服务',citations:['C4','C8'],body:`这次没有只看 README。我们固定下载了源码，从输入 handler、Session.prompt、持久 inbox、projector、Bus 事务追到 runner 的提升边界，再读协调器、执行生命周期与重启恢复。协调器模块保持原样，在独立目录执行其上游测试：26 项通过、0 失败，共 67 次断言。

为了隔离庞大的 monorepo 依赖，只调整了测试的模块导入路径和一个仅作类型用途的 import，保留上游测试主体及原 testEffect helper；使用 Effect 4.0.1，运行器是本机 Bun 1.3.14，而仓库声明 Bun 1.4.2。运行子进程没有继承模型凭证。它证明的是这组协调器行为在这个隔离环境下通过，不是整个 OpenCode 产品或生产恢复链的完整认证。

最有价值的测试不是“返回值等于 true”，而是人为卡住 drain、在清理缝隙加入 wake、让一个等待者先取消，再检查执行次数和完成时序。这些测试把罕见交互变成可稳定重放的状态变化。下面的交互回放重建其中一种场景，属于教学演示；真正运行过的证据是上述测试日志。

迁移时先问四个问题：输入何时算已接纳？忙时新工作存在哪里？执行者准备退出时如何接住最后一个通知？停止确认与真正空闲怎样区分？单机服务可以先用持久输入加按会话协调器；需要多机调度时，再解决拥有者、租约或分区等额外约束，而不是误以为内存 Map 已替你解决。

我的结论是，这条链具有明确的工程学习价值：它把常见的“用户多发一句话”拆成持久性、并发、交付语义和恢复边界。选它不是因为 star 多，而是这些行为在固定源码、状态转换和可运行测试中都有落点。`}
 ],
 sources:[source('C1','HTTP session.prompt handler','packages/server/src/handlers/session.ts','L278-L315'),source('C2','接纳输入后唤醒执行','packages/core/src/session/session.ts','L155-L186'),source('C3','持久 inbox 与幂等接纳','packages/core/src/session/inbox.ts','L151-L199'),source('C4','会话协调器完整模块','packages/core/src/session/run-coordinator.ts','L1-L196'),source('C5','输入投影与消费','packages/core/src/session/projector.ts','L634-L682'),source('C6','执行声明与生命周期','packages/core/src/session/execution.ts','L86-L180'),source('C7','恢复及至少一次边界','packages/core/src/session/execution/restart.ts','L18-L113'),source('C8','26项协调器上游测试','packages/core/test/session-run-coordinator.test.ts','L1-L686'),source('C9','steer/queue 提升与 runner 边界','packages/core/src/session/inbox.ts','L491-L545'),source('C10','事件与投影事务','packages/core/src/bus.ts','L315-L405'),source('C11','runner 提升作用域','packages/core/src/session/runner/llm.ts','L50-L185')],
 limitations:['只研究固定 commit d85746a054924241a7edde736eefd079dff9bc00 的输入、执行协调与恢复链；不是整个 OpenCode 架构或安全审计。','实际执行26项隔离协调器上游测试，未运行整个 monorepo、真实模型工具链、数据库恢复集成测试或多机故障注入。','测试仅调整导入适配，模块实现与断言主体保留；本机 Bun 1.3.14 与仓库要求1.4.2不同。','源码明确恢复是至少一次；不保证外部工具副作用恰好一次。教学支付场景未连接真实支付系统。'],
 study:{status:'needs_review',scope:'session.prompt handler→输入接纳→事件投影和inbox→进程内协调器→runner提升→中断清理及恢复边界。',sourceSnapshot:'https://github.com/anomalyco/opencode/tree/'+commit,sourceCoverage:[{path:'packages/server/src/handlers/session.ts:278–315',level:'read',reason:'核对输入字段进入核心服务，不伪造HTTP路由。'},{path:'packages/core/src/session/{session,inbox,run-coordinator,execution,projector}.ts 与 execution/restart.ts',level:'read',reason:'追踪实际接纳、投影、并发、清理、恢复链。'},{path:'packages/core/src/bus.ts 与 runner/llm.ts',level:'read',reason:'核对事务与相关提升调用片段；未逐行审计完整事件总线或所有模型分支。'},{path:'packages/core/test/session-run-coordinator.test.ts',level:'read',reason:'读取测试并执行隔离适配版本26项测试，保留日志及模块hash。'},{path:'前端、权限体系、全部工具、远端/多机注册与完整数据库测试',level:'not_read',reason:'不在本篇的机制范围，不能由局部测试推断完成认证。'}],claims:[{id:'K1',text:'输入先持久接纳再wake；同一稳定ID首次接纳生效。',kind:'implementation',evidence:[{source:'C2',anchor:'Session.prompt',support:'direct'},{source:'C3',anchor:'reconcile/admit',support:'direct'}]},{id:'K2',text:'协调器为同key保持一个本地执行，多次wake可以合并，其他key可并发。',kind:'implementation',evidence:[{source:'C4',anchor:'make/run/wake',support:'direct'},{source:'C8',anchor:'coalesces wakes / different keys',support:'direct'}]},{id:'K3',text:'停止确认、清理settlement与完全idle有不同边界。',kind:'implementation',evidence:[{source:'C4',anchor:'interrupt/awaitIdle',support:'direct'},{source:'C8',anchor:'acknowledges interruption before cleanup settles',support:'direct'}]},{id:'K4',text:'恢复是至少一次，不保证外部副作用恰好一次。',kind:'fact',evidence:[{source:'C7',anchor:'Recovery is at-least-once',support:'direct'}]},{id:'K5',text:'隔离执行26项协调器上游测试通过；不是完整产品验收。',kind:'benchmark',evidence:[{source:'C8',anchor:'test bodies; local coordinator-tests.log and coordinator-verification.json',support:'direct'}]}],mechanisms:[{id:'M1',name:'持久工作与合并唤醒分离',steps:['接纳输入并记录inbox事件','wake通知已记录工作','按session键取得单一执行权','drain后检查门铃','清理阶段通知交给后继执行'],boundary:'进程内执行协调，不构成任意多机全局锁或副作用恰好一次保证。',claims:['K1','K2','K3','K4']}],connections:[{title:'与 CarryOn 的提交边界对照',body:'CarryOn决定何时把历史从活跃上下文退休；这里决定何时接纳、交付和执行工作。两者都需要明确提交与恢复边界，但维护的状态不同。',itemId:'paper:2610.18784'}],review:{checkedAt:new Date().toISOString(),method:'固定源码调用追踪；核对事件事务、runner提升和恢复注释；独立环境执行上游协调器测试。',findings:['26 pass / 0 fail / 67 expect，模块SHA已归档','区分输入记录、唤醒与执行完成','明确进程本地与多机边界','明确Bun版本差异和未跑的集成测试']},openQuestions:['数据库投影故障下的完整端到端行为仍需集成故障测试。','托管服务器注册互斥与多机迁移路径尚未完整审计。','外部工具操作的幂等性需要逐工具核查，不能由会话ID替代。']}
};
