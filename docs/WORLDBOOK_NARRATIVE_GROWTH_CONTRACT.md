# Current Story Status & Narrative World Growth Contract

## 这盒解决什么

这盒只把两件容易混在一起的事分开：

1. “故事现在走到哪里”是后台当前线路状态，只来自 Narrative Director 已校验的 `currentTruth`。
2. “这段经历里有没有值得长期补进世界的规则”只是世界书增长候选，必须再由玩家审核。

它不新增虚拟 App。现有 StoryDesk 已经用安全摘要承载线路、场景和玩家确认回执；现有 WorldbookApp 已经承载故事生长候选的审阅、修改与接受。这里仅提供二者之间的纯数据合同。

## A. CurrentStoryStatusProjection

输入只有：

- exact `HistoryScope`：`progressBundleId + personaMaskId + charId`
- 已由 Narrative Director 建立的 `currentTruth`

输出只有当前 active run 的：

- route / branch / lane 与简短摘要
- active scene（允许为空）
- `routeState`
- `npcStates`
- `openThreads`
- 同一 active run 下由玩家确认过的经历

没有 active run 时返回显式 `status: "empty"`，其余集合为空。它不会拿最近一条草稿、旧线路或历史导入结果伪造“当前故事”。

这是一份只读后台运行合同，不是可整包展示给玩家或普通角色的 UI / prompt 投影。当前 `routeState` 与 `NarrativeNpcState.knownFacts` 还没有字段级知情策略；未来若展示世界势力或线路参数，必须再经过显式的 player-visibility projection。当前 StoryDesk 继续只显示它已有的安全摘要。本盒也不接入 Chat。

明确不进入：

- draft / planned / played-but-unconfirmed scene
- 未经玩家确认的 receipt
- 其他 route / branch 的确认经历
- historical analysis projection

## B. Confirmed narrative → WorldGrowthCandidate

适配器必须同时收到：

- exact `HistoryScope`
- Narrative Director `currentTruth`
- 明确匹配的 `receiptId + runId + sceneId`
- 调用方明确给出的 `proposedDrafts`

回执只证明“这段剧情确实玩过并由玩家确认”，不等于回执里的每个事实都应变成世界规则。适配器不会读取 `acceptedFacts` 自动拼草稿；草稿标题、正文、分类、知识可见性都必须由调用方明确提供。

产物复用现有 `createWorldGrowthCandidate`：

- 初始状态固定为 `pending`
- `truthEffect` 固定为 `none`
- 保留 receipt / run / scene 三个 narrative source refs
- source 保留原 lane / route / branch 连续性
- mainline 只生成同 scope、route 的 mainline binding
- IF 只生成同 scope、route、branch 的 if-branch binding
- 第一盒只生成新条目；在 typed target gate 能核对既有条目的 scope、lane、route、branch 与 revision 前，不允许暗改既有条目
- 不自动 accept、不写数据库、不挂载给角色

玩家在 WorldbookApp 审阅、修改并接受后，现有世界书合同才会创建新 revision；接受前它始终不是世界事实。

## 正向验收

- active 主线有场景、NPC 状态、开放线索和同线路确认经历时，可得到完整且只读的当前状态投影。
- active IF 的确认经历可生成保持原 route / branch 的待审世界书候选。
- 一张确认回执可对应多个明确草稿，但每个草稿有独立 `proposalId`，不会被强迫合并成一条世界事实。
- 新建条目和“作为独立新条目的补充”都沿用现有 Worldbook candidate / revision 审核链。

## 污染防护验收

- 无 active run 时不猜测当前线路。
- draft、未确认 scene / receipt、historical projection 不进入当前状态。
- scope、receipt、run、scene 任一不匹配即拒绝。
- receipt 的 `acceptedFacts` 不会自动进入候选正文。
- 带 `targetEntryId` / `baseRevisionId` 的既有条目更新提案会 fail closed，避免主线与 IF 被静默改绑。
- 候选保持 `truthEffect:none`；本适配器不引用 DB、accept 或 mount 能力。

## C. 系统主持提议服务（已接入故事线）

`narrative_world_growth_proposal` 是一条独立的系统主持任务。它只在玩家已经确认一幕之后，把“这段经历里是否产生了可长期复用的世界知识”整理成待审候选；它不是续写、记忆总结或自动世界事实写入。

输入被限制为：

- exact `HistoryScope`
- 同一 scope 下匹配的 confirmed `receipt + run + scene`
- receipt 摘要、最多 8 条已确认事实、最多 1800 字的确认片段
- 当前角色挂载、当前线路以及经过 typed selector 选出的玩家可审世界书摘录

世界书预览固定使用 `worldbook_preview` consumer，而不是 `world_director`。这是有意的第一盒边界：模型只能看到玩家可审阅的 public / entities 条目，`director_only` 不会进入本轮 prompt，也不能成为本轮候选的知识策略。投影预算为 1000 字、最多 2 条、单条最多 500 字；候选最多 3 条，允许返回 0 条。

模型只能填写玩家将来能审阅的正文层字段：标题、正文、分类、别名、激活提示、允许的 knowledge policy、补充目标和证据引用。它不能指定 binding、source refs、status、truth effect、publication status、route / branch 或任何 current state。解析通过后，代码才调用既有 W4 adapter 派生不可伪造的 scope、线路 binding 与 provenance，并以一笔 IndexedDB transaction 保存整批 `pending + truthEffect:none` 候选。

同一 `receiptId + exact scope` 只允许一批候选。再次点击时，只要已有 pending / deferred / accepted / ignored 中任一候选，服务会返回 `existing_batch`，不会再调用模型；数据库事务也会拒绝 proposalId 改名后偷偷新增第二批。模型明确返回 0 条时不写占位记录，未来仍可重试。

能力真相：

- `available`：系统主持路由、严格结构解析、typed 世界书预览、候选映射、批次原子保存与幂等门均存在。
- `delivered`：手稿“故事线”会在玩家确认一幕后显示“整理这一幕的世界变化”。
- `selected / requested / executor_started`：只有玩家点击该按钮才选择任务、请求系统主持并启动 provider；确认经历本身不会静默花费 token。
- `canonical_receipt`：本链只消费已经由玩家确认的 Narrative 回执；模型输出不能生成或替代该回执。
- `visible_projection`：真实 `pending / deferred` 候选显示数量并跳到世界书审阅；`accepted / ignored` 显示“已处理”且不再重复整理；真正零候选才保留再次整理入口。

`narrative_scene_receipt_proposal` 也已接入“确认这一幕”的“帮我整理”：它只能整理可编辑摘要与事实草稿，玩家点击“确认这段经历”后才形成 canonical receipt。

新增门禁覆盖：合法正向候选、0 条、未授权字段、`director_only`、错误 provider、同 receipt 重试跳过模型、并发/改 ID 第二批拒绝，以及第二条写入失败时整批零残留。
