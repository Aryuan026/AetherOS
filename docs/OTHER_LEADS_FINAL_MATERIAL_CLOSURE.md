# 沈星回、秦彻、夏以昼：首轮素材结案

这份结案把后三位的 523 个私有短信来源从静态归桶推进到可审计的最终素材
artifact。它不是角色卡、世界书或运行时注入：所有公开说明均为非逐字语义，原始
短信、标题、URL 与本地路径继续只在 ignored 私有复核区。

## 结论地图

三位各保留一条很窄的、character-owned reviewed baseline candidate；它们来自
官方角色短信，有独立 candidate-pool 证据子集、跨 source group 支持、去名语义
对照与 held-out source 复核。它们还没有被编译、选择或递送；未来消费者仍以 exact
relationship scope 隔离使用，但这不会改变素材本身属于角色基线的 authority。

这不是“三位声音已经完成”的声明。总控盲审后的 evidence-return v2 重新检查了被
disabled/withheld 的 voice、base 与 detail 证据：没有发现足以安全发布第二条独立
language fingerprint 的 cross-source、去名可区分模式。因此三条既有候选修订为多出口
表达范围，而非再为普通分享、重逢或自生活硬加一条泛化指令。

| 角色 | 角色基线候选（artifact active，不是 runtime） | 只在何时考虑 | 明确不消费 |
| --- | --- | --- | --- |
| 沈星回 | 低幅、近乎认真地接住轻量荒诞前提，再安静续一笔想象/练习 | 用户已给出可接住的小规则、反差或玩笑 | 问候、照护、拒绝、久别、自生活事实、未计划具身场景 |
| 秦彻 | 从用户给定的选择/评价中找真实门槛，短问后给可讨论的明确判断 | 当轮有具体物件、方案、取舍或轻挑战 | 问候、照护、拒绝、久别、职业/地点补全、未计划具身场景 |
| 夏以昼 | 快速顺接调皮设定或小挑战，把眼前细节多推进一格 | 用户已给出可来回玩的日常细节或小胜负 | minimal ping、照护、拒绝、久别、自生活事实、未计划具身场景 |

它们不是台词、固定动作、关系阶段或自驱任务。特别是“主动”仍属于入口候选：没有
具体语义 rank 和 canonical Life receipt，就不得把稳定身份实例化为“今天/刚才”发生
的事件。

## 守恒与状态

artifact 记录了每条来源的 exact character scope、opaque source/group ref、静态
来源簇、最终归宿，以及 candidate-pool 与 holdout 的分离。

| 角色 | 来源 | holdout | active | disabled | withheld |
| --- | ---: | ---: | ---: | ---: | ---: |
| 沈星回 | 221 | 42 | 1 | 3 | 2 |
| 秦彻 | 166 | 26 | 1 | 3 | 2 |
| 夏以昼 | 136 | 29 | 1 | 3 | 2 |
| 合计 | 523 | 97 | 3 | 9 | 6 |

守恒按角色均是 `来源总数 = 显式处置来源总数`。重复 candidate-pool 来源只做
reinforcement；holdout 永远不能成为 `selectedEvidenceFingerprints` 或生成 guidance。

## evidence-return v2：能补的与不能补的

三条 active 都升为 revision 2，仍是同一角色基线候选、同一 `relevance_required`
边界：

- 沈星回：不再要求“接梗后必须展开”。他可以低幅接住、点出小错位、停在观察，或
  安静地续一笔想象。revision 使用了 4 个 candidate-pool opaque refs；中性观察、
  重逢和自生活仍缺独立模式。
- 秦彻：不再要求“反问后必须下判断”。他可以抓判据、短问松动假设、直接定调，或
  提出可讨论的选项。revision 使用了 4 个 candidate-pool opaque refs；没有足以脱离
  具体职业/关系情境的第二种稳定口型。
- 夏以昼：不再要求“玩笑一定推进一格”。他可以回声、轻问、打趣、一拍续接，或短暂
  认同后把话题交还。revision 继续使用 4 个 candidate-pool opaque refs；自生活只有
  单次强信号，重逢/照护也未通过区分门。

这些 refs 只保存在 ignored artifact，不写入本文档。三位的 `additionalActivation`
均为 `none`：这不是少做一步，而是避免把共同礼貌、具体剧情或单次关系线误升成
第二条人设指纹。

## 去名与高风险 holdout

artifact 内的对照不是角色范文，而是可测的口型差异：

- 沈星回以低声量、像认真一样地接住微小的荒诞前提，再轻轻偏转。
- 秦彻先抓取标准/代价并短问校准，然后给出有分量的判断。
- 夏以昼迅速回接调皮语气，把日常小事续成一两拍可以来回玩的互动。

这三条都是 `relevance_required`，只有在对应的具体 ordinary-share 信号下才是合法正向路径。`mild_discomfort`、
`refusal`、`reentry`、`self_life`、`embodied_scene` 五类都被列为零自动候选的
holdout：关怀与尊重边界虽是好行为，但还没有通过跨角色 shared-solution 区分；久别
不推导忙碌或想念；自生活与场景不替代 Life/Scene receipt。

现阶段完成的是 artifact-level 的独立语义去名对照、held-out source 复核和 holdout
隔离；没有在本文档中声称 live API name-blind 生成评分已经完成。未来若做实机盲测，
仍需另存独立 rater assignment、变奏与 no-replay 结果。

## 仍 withheld 的原因

- 三位的 care/refusal 材料都可能掉进“确认—建议—照护”的共享骨架，先不发布。
- 沈星回的纯“安静观察”、秦彻的泛化观察/挑战、夏以昼的自生活单次强信号，分别
  缺少足以抵抗 name-swap 或单次事件风险的证据。
- stable detail 仍混有具体剧情/关系/职业/环境事实，不能写成玩家记忆或当前状态。
- opening/proactive/motive 继续 receipt-gated；scene 继续只属于有 scope 的
  ScenePlan candidate。

## 交接与验证

干净 artifact 只供未来总控显式读取：
`research/lysk-reviewed-private/material-analysis-v3/other-leads-final-material-artifact-v1.json`。
它没有 runtime export；编译后仍须经过 relationship scope、surface、semantic rank、
预算与 receipt。高 authority 人设卡日后若修订某条，按
[素材 authority 契约](COMPANION_MATERIAL_AUTHORITY_CONTRACT.md) 显式 supersession，
不能静默叠加。

验证以 `node scripts/verify-other-leads-final-material-artifact.mjs` 为入口，连同既有
私有草稿、静态守恒、holdout 和 companion-material 门禁一起运行。
