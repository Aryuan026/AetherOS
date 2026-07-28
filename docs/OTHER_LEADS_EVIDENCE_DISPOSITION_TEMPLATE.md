# 另外三位内置角色：证据处置清单模板（HOLD）

这是一份**未填充的执行模板**，给沈星回、秦彻、夏以昼后续沿用祁煜/黎深
的封箱流程。它不含任何角色判断、私有来源、候选 guidance 或 runtime
素材；在总控对向量必要性与 live 个性偏移契约发出 Green 前，不得填入内容或
触发分析。

## 0. 启动条件

- [ ] 总控已确认可以从 HOLD 进入该角色的私有语义复核。
- [ ] 当前运行时消费链、semantic rank、Life/receipt 与 live 个性偏移契约已
  明确；本模板不替代这些前置决定。
- [ ] 目标范围只含一个 `leadId + charId`；原始短信仍留在 ignored 私有区。
- [ ] 本轮不把“尊重选择”“可拒绝关怀”等共同互动原则误作角色指纹。

## 1. 来源守恒 ledger

| 字段 | 要填的内容 |
| --- | --- |
| sourceFingerprint | opaque ref；不写标题、URL、路径或原文 |
| sourceGroupFingerprint | 用于去重与 holdout 的 opaque group |
| primary disposition | 语言指纹 / 稳定细节 / opening-proactive-motive / scene / scoped / duplicate / withheld / reject |
| secondary supports | 可支持的其他最终簇；重复只增强证据 |
| holdout state | candidate pool / holdout；holdout 不进入 guidance 生成 |
| risk / scope | canon、relationship/private plot、单次事件、泄漏风险或其他明确原因 |

守恒公式必须可核：`来源总数 = 已处置来源 + 明确 quarantined/rejected 来源`。
一个来源可以有多路贡献，但不能因合并簇而消失。

## 2. 私有 batch 与独立裁决

| 层级 | 可以做什么 | 不能做什么 |
| --- | --- | --- |
| `model_semantic_draft` | 在 bounded 私有 batch 内整理候选、选择可能 evidence、暴露不确定性/echo 风险 | 不能把任何簇标 active |
| independent adjudication | 基于真实私有证据选择 exact subset，形成非逐字 guidance 或明确 withheld 原因 | 不能把静态候选、来源总数或模型草稿当 authority |
| final artifact | 写入 opaque subset、状态、surface、正向命中与抑制情景、编译处置 | 不能写入 raw、关系事实、当前 Life、工具策略或固定台词 |

每个 active / disabled / withheld 最终簇至少记录：

```text
id, leadId, lane, route, status,
selectedEvidenceFingerprints, supportedSourceCount,
guidance (仅非逐字、仅在适用时),
allowWhen, suppressWhen, positivePath,
reviewReason, uncertaintyOrConflict,
runtimeCompilation (disabled / existing-record-reinforcement / receipt-gated / scope-blocked)
```

## 3. 语言指纹专门检查

先用私有证据回答，而不是预写答案：

- 注意力常先落在什么可见信息、变化、判断或关系距离上？
- 普通、轻松、认真、拒绝/修复时，温度怎样真正变化？
- 起句、转弯、留白、反问或主动抛题的 mouth-shape 是否能自然变奏？
- 是否保留角色自己的判断与生活方向，而不是围着玩家或关怀任务转？
- 去掉角色名后，是否仍能与其他角色区分？若只是共同的礼貌/尊重，标
  `weak` 或 `withheld`。

care/discomfort 另走高风险检查：必须分别记录 attention landing、response
rhythm、independent-life posture 与 non-shared solution shape。若仍是“确认后给
休息/建议”的共同骨架，不能 active。

## 4. 四类资产的消费边界

| 资产 | 可供未来考虑的入口 | 必须抑制 |
| --- | --- | --- |
| language fingerprint | 相关 Chat / Call / scene 的稀疏声音校准 | 固定台词、固定容器、每轮表演、当前生活事实 |
| stable detail | 有明确相关性的 detail / scene 查询 | relationship memory、共同经历、常驻 lore dump |
| opening / proactive / motive | 具体语义命中或未来 semantic rank 且有合法 Life receipt 的主动、Call、scene 入口 | 泛化 opening、ordinary Chat、`currentMotive`、无 receipt 的“刚才/今天” |
| scene affordance | 已建立的 Meet/Date/Story scene candidate | 已发生场景、长间隔推导的忙碌/落寞、具身事实 |

generic heartbeat 只允许已裁决的真正 proactive seed；reentry 不能因为“很久没聊”
自动成为普通主动来信。Call 不从职业卡编造当前所在；Date opening 只在用户进入
场景后才是提案。

## 5. 最终封箱报告

每位角色单列：

1. 来源总数、各 disposition 数、重复增强数、holdout 数与守恒公式；
2. final clusters：`active / disabled / withheld`、实际 evidence subset 与合法
   命中/抑制情景；
3. name-blind、care differentiation、echo、single-event、scope 的通过/失败证据；
4. runtime compilation 处置：新 record、既有 record revision evidence、receipt
   gate 或不发布；
5. 未启用原因和下一次能改变结论的最小证据；
6. 验证命令结果，以及能力层级：`available -> delivered -> selected -> requested
   -> executor_started -> canonical_receipt -> visible_projection`。

在此模板被正式填充前，后三位维持 HOLD：不抓取、不分析、不改 runtime、不改
角色卡、不提交、不部署。
