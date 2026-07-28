# 第二轮窄门候选冻结清单

这份清单收束第二轮多样本、去名 A/B 的结果。它是给独立裁决看的私有
素材索引与**未启用修订草案**，不是 Chat 注入表、角色卡补丁、世界书，
也不声明任何角色“现在正在做什么”。本轮没有新增 runtime record，也没有
修改现有 record；候选均为 `disabled` 或 `withheld`。

第二轮的正向收益来自极窄的 response operator：去名识别、事实清洁与
硬失败均改善，但这不授权把 909 条来源压成更多常驻 prompt。尤其不能将
稳定身份实例化成今天、刚才、已经完成的生活事实。

## 已收束的候选

| 代号 | 冻结结论 | 可审计绑定 | runtime 边界 |
| --- | --- | --- | --- |
| Q1 | `existing_fingerprint_reinforcement`：祁煜 minimal ping 的角色分没有新增收益，只有事实清洁与硬失败归零的安全佐证。它可在未来作为既有 `builtin-qiyu-voice-playful-turn-v1`（并可旁证 `builtin-qiyu-voice-observed-entry-v1`）的 revision evidence，**不新建同义 record，也不改其当前文字**。 | `asset-qiyu-voice_observed_entry`；strong opaque refs: `lysk-src-4e41533657c85ac6043b`, `lysk-src-89833d8a02282accc71f`, `lysk-src-8b22e76a16718a19474f` | 非 runtime 候选。不得补出创作进度、今日安排、惊喜或任何 current self-report。 |
| L1/L2 | 一个最小 `disabled_revision_candidate`，只供以后复核既有 `builtin-lishen-voice-concrete-entry-v1` 与 `builtin-lishen-voice-calm-confirmation-v1`。它把 concrete/sensory entry 与 calm confirmation 作为两个可变的、非台词模板的 response operator，而非新角色设定。 | `asset-lishen-voice_ask_before_concluding`；strong opaque refs: `lysk-src-6c23b1e0ee3408fa3463`, `lysk-src-91263c4a3bd9d3fcebe8`, `lysk-src-c3482738b6ea6186148c`, `lysk-src-e60c6fc526ad316acbd9`, `lysk-src-f6385c2c2b10828f5bc9` | `disabled`、not runtime。只覆盖 minimal ping、sensory share、refusal clarity；不新增主动生活、建议或行动计划。 |

Q1 与 L1/L2 的 fingerprint 是候选池中交叉支持较强、且不依赖
relationship/canon scope 的可审计绑定。没有把 cluster-level safe-set 冒充成
模型实际选择的单一证据子集；任何未来启用仍须由独立裁决重新记录 source
subset、authority 与 surface。

## L1/L2 的最小修订差异（仍为 disabled）

这不是替换两条既有指纹，而是一个有意识地很小的 future diff：

| 既有 record | 允许在独立裁决中检查的窄增益 | 不包含 |
| --- | --- | --- |
| `builtin-lishen-voice-concrete-entry-v1` | 可先接住用户已经给出的具体或感官线索，再按当轮语境展开；不能从稳定职业/生活身份推导当前事件。 | “刚完成工作”“正在值班”等 current-life 实例化，或任何主动来信事实。 |
| `builtin-lishen-voice-calm-confirmation-v1` | 用户明确拒绝或说明边界时，可先平静确认其表达的含义和选择空间，再决定是否继续当前话题。 | 建议、诊断、固定休息步骤、替用户做决定，或把照看变成默认骨架。 |

第二轮中，黎深的 minimal ping、sensory share、refusal clarity 过窄门，因而
共同支撑这一枚合并修订候选。absence stance-only 只作为既有角色卡/既有
指纹已足够强的 reinforcement，不给 diff 增量；embodied scene 的表现回退，
不提供任何 scene 增量。

## 明确锁住的方向

| 代号 | 簇 | 冻结原因 |
| --- | --- | --- |
| Q3 | `asset-qiyu-voice_optional_care` | care/refusal 易塌成可替换的照护步骤；继续 `withheld`，不作为指纹。 |
| L3 | `asset-lishen-voice_practical_care` | shared-care-skeleton 风险仍在；继续 `withheld`。这不影响 L1/L2 对既有 calm-confirmation 的极窄、无建议修订检查。 |
| L5 | `asset-lishen-scene_composed_lightness` / embodied scene | 第二轮 embodied scene 回退；继续 `withheld`，不得以场景纹理名义回流普通 Chat。 |
| Q4 | `asset-qiyu-opening_curiosity`、`asset-qiyu-opening_reentry`、`asset-qiyu-proactive_own_thread`、`asset-qiyu-motive_curiosity` | 仅在 Character Life 或等价 canonical Life/receipt 已存在时考虑；不进入 ordinary Chat。 |
| L4 | `asset-lishen-opening_observed_detail`、`asset-lishen-proactive_calm_reentry`、`asset-lishen-proactive_own_thread`、`asset-lishen-motive_followthrough` | 同上；不得把稳定职业/生活身份伪装成今天、刚才或已发生的事件。 |

工具场景一律零注入。任何无 canonical receipt 的 current-self-report，包括
“今天/刚才/已经准备好”的生活实例化，都不得由本清单提供。全局
no-advice、current-life-no-receipt、tool 三条门禁保持不消费素材。

## 909 来源的重复证据边界

以下内容属于 duplicate/reinforcement，不因“物尽其用”而重复塞入 prompt：

- 同一簇内反复支持稳定 detail、稳定立场或 response rhythm 的来源，只增
  加置信度、覆盖不同温度/场景，不能增加同义 fragment 数。
- `stable_base`、`relevant_stable_detail` 的支持来源是 relevance-gated
  evidence，不是当前关系记忆、主动生活播报或 ordinary Chat 常驻文字。
- canon/worldbook-only、relationship/private-plot-only 的簇继续 disabled；
  它们不能借由 scene 或开场候选回流。
- Q3/L3 的重复 care 来源只用来检验是否仍同构，不能把可拒绝照看重复包装
  成不同人格指纹；Q1 也只回流为现有 record 的佐证，不生成第二条同义指令。

## 通过前的共同门槛

1. 可选 operator 只能重组用户本轮细节或稳定立场；不生成事实、记忆、
   当下动机、工具策略或固定台词。
2. name-blind 与 common-good-behavior 检查必须通过；轻不适场景还要清除
   shared-solution skeleton。
3. source subset、surface、receipt 条件与 reviewer authority 必须在独立
   裁决中被明确记录。`model_semantic_draft` 永远不能完成这一步。
4. 任何候选只能在 canonical receipt 后的相应入口消费；普通 Chat、无 receipt
   的 current-life、工具场景均须维持零注入。
