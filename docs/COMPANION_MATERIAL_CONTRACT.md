# Companion Material And Retrieval Contract

这份合同定义角色素材怎样从内置复核包或旧日分析结果进入 AetherOS 的上下文。目标是帮助角色更像自己、更会从现场起念，而不是把提炼结果变成每轮必演的台词、当前动机或工具指令。

## 当前能力真相

```text
reviewed guidance / historical analysis pass
  -> exact character or relationship-scoped material library
  -> hard eligibility gates
  -> non-vector relevance + novelty + diversity ranking
  -> 1–3 prompt fragments for the current surface
  -> real model request
  -> truthEffect:none delivery receipt
```

- `available`：内置复核素材与通过代码门禁、二次复核和来源新鲜度校验后发布的历史素材都能进入候选仓；回执会诚实区分同模型二次复核与真正独立裁决。
- `selected`：普通 Chat 使用本地检索器，每轮只选择 1 条真正相关的角色侧参考；其他 surface 在自己的预算内选择 1–3 条。
- `delivered`：只有请求已被 API 接受、且经过对应 surface 清洗后仍有可显示内容，才写 delivery receipt；准备、选择、空 completion 或本地 fallback 不写回执。
- `truth effect`：固定为 `none`。素材递送不会改写当前状态、关系事实、角色生活、剧情事实或工具权限。
- `browser runtime`：对话日历可按全部记录或日期范围读取本机日档，先预估 token / 分包 / 调用次数，再把选定原文片段临时发送给当前已启用 API，完成分析、同模型二次复核、最终化与新鲜度校验发布。默认链路的 authority 明确是 `same_model_second_pass`，不同 role-bound principal 只用于审计调用职责，不冒充两位独立评审；run id 与 API key 均不构成 principal。
- `available consumers`：普通 Chat、主动来信、Call 与 Date / Meet 的稳定声音链已接入；Date / Meet 目前只消费稳定层，不把 scene planning 直接塞给前台。
- `HOLD`：未来 StoryDesk / ScenePlan 对 motive / scene candidates 的正式裁决；浏览器/APK 本地向量 index producer、store 与开关。

## 无向量第一层

本轮祁煜/黎深完整 Prompt 复读、辅助离线观察与仍未覆盖的运行时边界见
`docs/COMPANION_MATERIAL_NONVECTOR_ACCEPTANCE.md`。它不声称能证明角色永不 OOC，
也不把玩家体验变成数学验收；代码门禁、API 侧上文判断和自然使用反馈各自回答
不同问题。

选择器先执行不可绕过的代码门禁：

- 完整 `progressBundleId + personaMaskId + charId`；
- surface、mode、purpose；
- route、branch、scene continuity；
- knowledge、relationship floor；
- cooldown、最大递送次数；
- prompt 字符预算和 slot 数量。

通过门禁后，使用四种本地证据组合排序：

1. 小而稳定的场景信号，例如 `mild_discomfort`、`refusal`、`reentry`、`observation`、`character_self_share`；
2. 当前输入与素材 guidance/tags 的 CJK bigram/trigram 和拉丁 token 重合；
3. 真实 delivery receipt 带来的近期惩罚与轮换；
4. slot、variation group 和文本相似度去重。

`ordinary_share` 只表示“不是纯寒暄”，不能单独构成相关性证据。低信号输入只允许一条合法的 `voice_fallback`。关怀、稳定细节、冲突/修复、开场、主动动机与场景可能性全部必须获得更具体的场景信号、文本相关性或同一索引版本的语义分数。

两类零素材结果也是合法正向路径：

- 用户明确说“不要建议/分析，只想聊聊”时，让角色卡自然接话，不额外注入容易同构的关怀步骤；
- 明确的提醒、日程或其他工具请求先走工具合同，正文语气仍由角色卡决定，素材不参与工具选择。

## 历史分析标签的检索含义

历史来源保持固定标签表，不允许无限制造标签：

- `speech_rhythm`：唯一可以成为轻量 voice fallback 的历史类型；
- `care_style`：只随不适/需要照看进入，拒绝或低信号时抑制；
- `boundary_style`：随明确拒绝进入；
- `repair_style`：随重返或有情绪重量的现场进入；
- `initiative_style / stable_habit`：随角色自生活、观察或主动分享进入；
- `world_detail`：随观察、感官或轻场景进入；
- `opening_shape / proactive_intent / scene_permission`：只进入匹配 surface；
- `affection_style / relationship_detail`：必须有上游语义证据或足够的文本相关性，不做默认浪漫化。

历史记录里抽出的 `initiative_motive` 无论置信度多高，都只能进入
`motive_candidates`。它不能借 `stable_base` 变成角色长期驱动力；长期
agency 必须由角色卡或另一条明确复核的角色级高权威来源提供。

原始 Word/TXT、日历消息与逐字对话由本机日档持有；只有玩家本次选定范围的限量
packet 会临时进入当前分析 API 的请求，且不会落入后续角色扮演 prompt 或本机素材库。
分析完成后，Chat / Call / ScenePlan 只能收到复核后的
非逐字 guidance；source refs 保留在私有审计层，原文不能随 material 进入角色扮演
上下文。

`buildHistoryCompanionAnalysisPackets` 只负责把同一关系 scope 的日历原文按字符与
证据条数分成临时分析包，保留 user / character 传输通道而不擅自判断句内 NPC
归属。人工补录只有在当天锁定、`manualEntry.status=confirmed` 后才是可分析证据；
未锁定草稿不进入 packet。每条消息都必须携带完全一致的三元关系 scope；packet set 还会固化
`packetSetId / packetCount / 连续 ordinal / orderedEvidenceDigest /
canonicalLaneSet / sourceDocuments`。其中 `sourceDocuments` 列出本次分析选择的
全部日档及 revision，即使某一天只有系统内容、最终没有 evidence 或 finding 也不能
从新鲜度边界消失。这些权威身份都由 canonical JSON + SHA-256 重算，不能把另一次
build 的包混进来。`sourceRevisionFingerprint` 由 packet builder 对实际传入的
Daily Archive 文档与消息体机械派生；调用方没有可填写或覆盖该字段的入口，因此不能
只复用 document id / revision、再偷偷替换正文。原文只存在于
`ephemeral_not_persisted` packet；可持久
descriptor 不含原文。语义模型的返回值仍须经过后续角色归属、跨来源支持、非逐字
和 slot 权限复核，不能从 packet 直接发布素材。

`HistoryCompanionAnalysisReview` 是模型返回历史素材的唯一窄门。它必须精确回指
packet、三元关系 scope 与 source revision；每个 finding 只能引用本 packet 的
evidence id。代码而不是模型决定 slot、surface 与 purpose：

- `language_fingerprint` 只有在角色直述归属明确、跨至少两个 source group，并通过
  去名、共同好行为与表达范围检查后，才能进入 `stable_character_voice`；
- `stable_detail` 永远只进 `relevant_stable_details`，不能从旧聊天抬升为角色卡
  `stable_base`；
- `opening_recipe / proactive_seed / initiative_motive` 只能进入各自 surface 候选，
  其中历史 motive 固定为 `motive_candidates`；
- `scene_texture` 只能成为 `scene_affordances`，不会生成已发生剧情。

accepted finding 还必须声明它保留表达变奏，不含固定回复模板，对 current state 与
tool policy 的 effect 都是 `none`。但一次模型分析即使产出了 accepted finding，
整份 review 也固定保持 `pending_adjudication`，不能直接生成 active 素材。浏览器
默认允许当前模型在第二个独立调用中逐 finding 决定、逐 evidence 复核句内说话人，
但 activation receipt 必须标为 `same_model_second_pass`；只有真实不同模型/运行身份
或人类复核才能标为 `independent_adjudication`。只改 role 名或 run id 不构成独立性。
语言指纹只有在全部证据均被二次确认是主角色直述时才能激活。guidance 会先做 NFKC、零宽字符
清除与空白归一，再对本轮全部 packet evidence 执行非逐字检查；短句使用平衡阈值，
既拒绝完整照抄，也不把正常短词误判为抄录。最终 pass 只含机械派生的 source spans
与非逐字 guidance，不含临时原文。

`buildHistoryCompanionAnalysisPrompt` 复用并改写 DriftStone 已验证过的“按场景和温度层
观察嘴型、节奏、注意力与自生活”的分析方法，但不会沿用它最终保留原句的输出形态。
这个 prompt 只在本机分析调用期间携带 packet 原文，标记为
`ephemeral_not_persisted`；模型只返回 findings。随后
`createHistoryCompanionAnalysisReview` 由代码捕获 packet ids、scope、source
revision 与 analyzer principal，模型不能自行改写权威信封。每条 evidence 只能服务于
其所属 packet 明确授权的 lane。大历史先生成 `HistoryCompanionAnalysisBatchPlan`：
它按 prompt 字符上限把 canonical packets 分成若干 bounded batches，每包得到
non-authoritative draft receipt；coverage receipt 必须证明全部 packet 恰好出现一次，
才能产生仍然 `runtimeAuthority:none` 的 synthesis draft。综合稿仍须走二次复核，
不能因为“已经看完全部分包”自动拥有发布权。直接 review 只接受能放进一次 canonical
prompt 的 packet set；超出预算时必须使用 `bounded_synthesis` analysis path，并把
plan、coverage、batch draft receipts 与 synthesis envelope 一并纳入 review digest
和最终 activation receipt。旁边生成一份 coverage 文件、主干却不消费它的做法会被
拒绝。packet 与 prompt 统一使用 Unicode code-point 预算，并为 system/schema/JSON
开销留出空间。

最终化会生成 canonical activation receipt：它用 SHA-256 绑定完整 packet set、
review、adjudication、真实 adjudication authority、执行 principals、approved findings、pass 与
候选集合，并列出所有被分析的 Daily Archive 文档及 revision，包括没有产生 finding
的日期。authority-grade validator 会重新运行完整 finalizer，而不是只验证 digest
自洽；即使攻击者手写了彼此匹配的 active pass 与 receipt，只要它们不能从 packet、
review 与 adjudication 机械重建，就不能进入 append-only authority store。

发布 pass 时，调用方只能传 activation receipt id。发布器会从 authority store 重载
回执，再从当前 Daily Archive 读取同 scope 的真实文档头；玩家在日历中修改、删除或
补录任一来源后，旧 pass 会因文档 revision / content fingerprint 不一致而停止发布。
这条新鲜度门禁也存在于运行时素材库读取：即便旧 pass 曾经成功发布，只要当前
Daily Archive 已变化，它的历史素材会立即从 selector 输入中 fail closed，不会等到
下一次手动发布才失效。publication 会显式返回它实际消费的
`activationReceiptId`。不同解释与不同剧情用途
默认可以并存；只有显式点名
`supersedePassIds` 才会退场旧 pass。同一轮选择器仅硬去除 scope、slot、guidance、
证据与运行用途都完全等价的镜像副本，不会把同一片段的不同合法归属误删。

浏览器运行入口由 `utils/historyImport/companionMaterial/runtimeAnalysis.ts` 和
`components/daily-archive/HistoryCompanionAnalysisSheet.tsx` 承担。它只读取当前
`progressBundleId + personaMaskId + charId` 的 Daily Archive，支持跨月日期范围，
大文本最多拆为八个 bounded batches；超过上限会提示缩小范围，不会静默截断。直接
路径预计两次模型调用，分批路径为每批一次、综合一次、同模型二次复核一次。最终复核
也有独立的 Unicode 字符硬预算；超出预算的 findings 明确保留为 withheld，并提示缩小
日期重试，不会把全部已选原文重新合并成一个无上限请求。第一遍没有任何
accepted finding 时会直接结束，不为形式完整额外花一次调用；任何 API/结构/持久化
失败都不会产生 prompt-visible 素材。只有 canonical activation receipt 与发布均成功
之后，下一轮 Chat 才可能按相关性选中结果。

## Prompt 与 Context Compiler 边界

普通 Chat 只允许：

- `stable_character_voice`
- `stable_base`
- `relevant_stable_details`

`opening_recipes`、`proactive_seeds`、`motive_candidates`、`scene_affordances` 在普通 Chat fail closed。

普通 Chat 的合法零素材路径只覆盖明确工具请求，以及没有同时询问角色自生活的
“只想聊天、不需要建议”。“只想听你说说今天”仍属于角色自生活请求，不能被
`no_advice` 误伤；Call、主动来信、见面与 ScenePlan 也不继承普通 Chat 的硬 bypass。

即使 slot 合法，prompt fragment 也只是一条可忽略的角色侧观察/选择参考，不是事实、
记忆、当轮任务或台词模板。具体的当下事件必须来自用户本轮、可信系统状态或
canonical receipt；角色卡、世界书与稳定身份只能提供观察视角，不能单独证明
“今天/刚才已经发生”。没有当前证据时，可以由角色当下提出新的设想或未来建议，
但不能写成已经准备、已经经历或已有共同约定。

`CompanionMaterialContextSlice` 可以把已经选择且已经投影的材料编译成稳定层和 surface 候选层，但它不包含：

- `currentMotives` 或 current state；
- Character Life；
- Directive、NarrativeRun、Scene 或 ExperienceReceipt；
- tool allowlist/denylist；
- delivery receipt 写入。

未来 Director/ScenePlan 才能依据路线、Life、关系与现场证据，把 `motiveCandidates` 中的一项转成真正的当下动机。

## 向量升级缝

`CompanionMaterialSemanticRank` 是可选的未来排序结果，不是已经上线的索引能力：

- 必须绑定 `manifestId + manifestDigest`，并逐字段匹配代码持有的 active manifest authority；
- 必须绑定 exact `scopeKey` 与当前 `materialSetFingerprint`；
- 必须记录 `modelId + modelArtifactDigest + dimensions + metric + normalized`；
- 必须记录 `projectionVersion + calibrationRevision + strongThreshold + indexRevision`；
- query 只能读取同一份 ready manifest 的向量；任一绑定不一致时忽略 rank；
- 更换 embedding 模型时新建 revision，不要求永远使用同一个模型，也不迁移旧向量；
- rank 只能由未来本机 active index manifest 的可信 producer 内部构造，并和独立传入
  selector 的 `trusted_local_index_manifest` authority 完全一致；导入文件、模型回复、页面
  参数或普通 UI 不能直接提供 scores。当前运行时不传 authority，所以手写 rank 不生效；
- 原始素材与 canonical records 是可重建真相，向量只是可丢弃索引；
- embedding 高分不能越过 scope、surface、knowledge、continuity、cooldown 或预算门禁；
- 纯寒暄、工具请求和 no-advice 输入不能被高分唤醒重素材；
- 无向量时 lexical / signals / receipt 路径始终可用。

当前 56 条内置运行包在硬门后仍是小候选集，不需要生产向量。长期关系素材达到可观察规模并证明无向量漏召回后，
才进入本地 shadow；详细门槛、manifest 与 live 个性偏移见
`docs/COMPANION_MATERIAL_VECTOR_AND_LIVE_DRIFT.md`。
