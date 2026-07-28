# 深空短信素材整理冻结说明

这份说明记录的是“素材已被怎样看见”，不是把 909 页压成一套会复读的角色台词，也不是宣布运行时已经接入。原始短信、标题、URL 与缓存仍只留在 ignored 私有研究目录；这里没有逐字内容。

当前冻结输入为 909 个详情单元：黎深 199、祁煜 187、秦彻 166、沈星回 221、夏以昼 136。来源守恒公式为：`909 = 909 accounted + 0 quarantined`。其中 401 个单元为两个以上的资产簇提供支持；重复不被丢弃，而是作为簇的交叉证据。

## 四路整理结果

| 资产路由 | 贡献来源单元 | 派生簇 | workbench active | disabled | unresolved |
| --- | ---: | ---: | ---: | ---: | ---: |
| 语言指纹 / voice calibration | 59 | 16 | 0 | 0 | 16 |
| 稳定细节与长期行动倾向 | 398 | 10 | 0 | 0 | 10 |
| 开场、主动来信与临时动机候选 | 375 | 23 | 0 | 0 | 23 |
| 场景纹理 / scene affordance | 713 | 15 | 0 | 10 | 5 |
| 合计（来源可多路贡献） | — | 64 | 0 | 10 | 54 |

静态归桶不等于语义复核：这次冻结没有把 regex/模板支持数冒充为分析结论，因此所有非 scoped 簇都保持 `unresolved`，直到私有 DriftStone-derived 批次给出非逐字 review。`active` 将来只表示已通过那一步的私有 workbench 簇；即便如此，它也不等同于 Chat 已投递、Context Compiler 已消费、角色已经表现出该特征，或任何事实被写入记忆。`disabled` 是需要单独范围复核的 canon/关系/私密情节纹理，不是删除来源。

## 第一批最终结案：祁煜、黎深

上表仍如实描述原始 64 簇静态 workbench，因此其 `active=0` 没有被事后改写。
在它之外，祁煜 187 条与黎深 199 条已完成 bounded 私有语义裁决，并以单独的
ignored final artifact 保留 386 条逐来源 disposition：

- 祁煜：`1 active / 3 disabled / 2 withheld`。唯一 `active` 是对既有声音 record
  的 evidence reinforcement，不创建、不改写、更不投递新 prompt。
- 黎深：`0 active / 4 disabled / 3 withheld`。concrete-entry + calm-confirmation
  只形成一个 disabled revision candidate；care、默认建议和 embodied scene 仍不启用。
- 这两个数字是 artifact 的 publication state，不是 runtime truth。当前运行时仍只有
  既有 20 条校准 record；新的 artifact 没有被 Chat、selector、Context Compiler 或
  ScenePlan 消费。

结案说明见 [祁煜、黎深第一批结案](QIYU_LISHEN_FINAL_MATERIAL_CLOSURE.md)，总控
编译边界见 [最终素材 artifact schema](COMPANION_MATERIAL_FINAL_ARTIFACT_SCHEMA.md)。

## 五位角色的可用轮廓

| 角色 | 来源 | active / disabled / unresolved | 已整理的声音候选 | 当前冻结判断 |
| --- | ---: | ---: | --- | --- |
| 祁煜 | 187 | 0 / 2 / 10 | 可感观察、玩心式转向、可选照看与自生活线 | 有非空候选与 voice holdout；仍等真实语义 batch，而非直接激活 |
| 黎深 | 199 | 0 / 2 / 10 | 具体观察、平静确认、有限步骤与手边事务 | 有非空候选与 voice holdout；仍等真实语义 batch，而非直接激活 |
| 秦彻 | 166 | 0 / 2 / 11 | 变化/行动结果的注意、判断与边界 | 现有可见措辞去名后可互换；标为 `requires_name_blind_calibration` |
| 沈星回 | 221 | 0 / 2 / 12 | 近处注意、轻意、拒绝姿态与自身节奏 | 现有可见措辞去名后可互换；标为 `requires_name_blind_calibration` |
| 夏以昼 | 136 | 0 / 2 / 11 | 日常转折、轻松温度与边界 | 现有可见措辞去名后可互换；标为 `requires_name_blind_calibration` |

五位角色都有低信号候选可供盲测，但秦彻、沈星回、夏以昼的候选尚不可作为 active 语言指纹：健康的“尊重选择”是共同互动原则，不是可辨人的 persona evidence。

## 语言指纹的主验收

语言指纹不被当成口癖清单。它按五个可以在真实互动中变化的维度整理：

- 注意力通常先落在哪里；
- 在普通、轻松、认真或边界场景中的温度如何变化；
- 回应怎样起步、转弯、留白或提出可拒绝的下一步；
- 主动联系是否能保留角色自己的生活线；
- 面对拒绝、不便或模糊信息时，怎样承认选择而不替人下结论。

完整角色卡未来再补身份、能力、价值冲突和长期目标，它不是候选整理的前置条件；不过“来源很多”也不是 active 的替代品。只有真实语义 review 和 name-blind 测试通过后，候选才会成为“像”的陪伴层基础。

## source-group holdout 与 name-blind 测试

语言指纹候选池按 opaque source group 留出验证集，不把保留组的短信放进候选池。每位角色都至少有一组语言证据被留出，并仍保有非空候选路径：

| 角色 | 非保留来源单元 | 留出来源单元 | 留出语言证据组 | 选中声音候选 |
| --- | ---: | ---: | ---: | ---: |
| 黎深 | 159 | 40 | 1 | 3 |
| 祁煜 | 137 | 50 | 1 | 2 |
| 秦彻 | 140 | 26 | 3 | 2 |
| 沈星回 | 179 | 42 | 5 | 4 |
| 夏以昼 | 107 | 29 | 3 | 4 |

私有工作台已生成同一组三条中性用户输入、五个匿名 subject 与每 subject 两个变体的 blind render request。生成方和独立评估方看不到角色名或原短信；评估记录只问：去名后能否区分、同一 subject 是否自然变奏、有没有复读来源或塌成可互换句子。

祁煜、黎深的候选状态为 `ready_for_blind_render`；秦彻、沈星回、夏以昼明确为 `requires_name_blind_calibration`。两者都不是“实机盲测已通过”：尚未向配置好的生成/评估器提交真实回答，因此实时区分度、变奏与无逐字回放仍待那一次独立执行。

## 表面与事实边界

- `motive_candidate` 只给主动/场景入口的未来候选理由；它不进入 ordinary Chat，也不成为 `stable_base` 或 `currentMotive`。
- 稳定细节只在相关主题或场景按需取用；它不是 relationship memory、共同经历或已发生事实。
- opening/proactive/scene 都有自己的表面边界，不能因“同一角色”而常驻普通 Chat。
- 语言指纹保持非逐字、可变化、可拒绝的角色-owned 倾向；它不压平角色的自驱力，也不限制未来的工具调用、行动、情绪方向或更高权重人设卡修订。

完整的方法、DriftStone 基线继承方式、普通历史记录适配和夹具见 [Historical Record Analyzer Specification](HISTORICAL_RECORD_ANALYZER_SPEC.md)。
