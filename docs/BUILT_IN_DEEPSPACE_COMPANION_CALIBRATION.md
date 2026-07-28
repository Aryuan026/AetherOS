# 五位内置角色 Companion Material 校准

日期：2026-07-28

本轮使用 909 个冻结短信来源完成五位角色的四路校准。原文、标题、URL 和私有路径
不进入公开仓；运行时只保留非逐字 guidance 与 opaque evidence fingerprint。

## 运行库

| 角色 | 运行记录 | 当前主要辨识重心 |
| --- | ---: | --- |
| 祁煜 | 11 | 感官与反差可转成玩心、观察或小实验，不固定成邀约 |
| 黎深 | 11 | 从明确线索建立共同理解，需要时才给可调整的下一步 |
| 沈星回 | 11 | 从近处与空间变化起念，允许安静观察、留白或自有节奏 |
| 秦彻 | 12 | 注意门槛、代价与判断空间，不固定成挑衅、反问或掌控 |
| 夏以昼 | 11 | 快速接住日常画面与熟悉来回，不固定成每轮打趣 |

全库 56 条，由 37 条四路核心资产、15 条合法 surface 投影和 4 条保留校准基线组成。
slot 总量为 8 voice、5 base、5 detail、18 opening、14 proactive、1 motive 与 5 scene。

这不是 56 条常驻 Prompt。普通 Chat 最多选择一条；其他入口在预算内选择 1–3 条；
无相关信号时返回 NONE。关怀、拒绝、no-advice 与 tool-intent 仍有独立的零素材路径。

## 表现力边界

- guidance 提供注意角度，不提供固定回应步骤；
- 语言指纹不复制玩家的语气、词汇或句法，也不改聊天气泡格式；
- stable detail 只有现场已有可靠线索时才可进入；
- opening / proactive 只在对应 surface 出现；
- motive / scene 是候选，不是 `currentMotive`、已发生剧情或 Character Life；
- 素材不包含 tool allowlist/denylist，不限制模型在拥有真实工具契约的入口自主用工具；
- 祁煜和黎深的人类校准角色卡没有被本轮改写；
- 沈星回、秦彻、夏以昼虽已有完整四路素材，但角色卡本身的人类校准深度仍较低，
  不用素材层冒充角色卡已经完善。

## 真实 API 上文复核

审计不复制角色卡，也不另写假 Prompt。它读取五位当前内置角色，复用运行时的：

- `ChatPrompts.buildModelFacingMessages`
- `buildCallModelFacingMessages`
- `buildDateOpeningModelMessages`
- `buildCompanionWakeupModelMessages`

共生成 20 份完整 `messages[]`。带/不带素材的非 system 消息必须一致；素材只出现一次；
source ref、原文、current motive 和工具策略不得泄漏；审计不调用 provider、不写 receipt。

站在模型位置复读后，五位角色的注意角度仍可区分，但没有被写成唯一答案。Call 的
口语长度、Date 的第三人称电影感和 Wakeup 的短消息长度属于 surface 合同，可能压缩
展开幅度，却不把某一角色动作模板塞进素材。

## 轮换与防复读

- 普通 Chat 对已真实递送的同一条 stable voice/base/detail 设 1 小时 exact reuse
  cooldown；
- opening / proactive 使用各记录的较长 cooldown；
- scene 按 exact `HistoryScope + routeId + branchId + sceneId + lane` 只递送一次；
- 只有 `status=delivered` 的回执消耗素材，选择失败、provider 失败和清洗后为空不消耗；
- revision、作用域和路线不同不会相互误伤。

## 待权威候选

21 条 reviewed candidate 保留了素材密度，但当前不具备运行权：

- draft compiler 只生成 `status=disabled`；
- `availabilityEffect` 固定为 `none`；
- generic store 读写都拒绝 `promotionAuthority`；
- 未来 canonical publisher 尚未实现；
- mainline 与 if_line 通过 `routeLane` 严格隔离。

这批候选当前的真实能力是
`paths=21 / runtimeAvailable=0 / persisted=0 / delivered=0`。

## 验收解释

代码门禁证明 scope、surface、grounding、预算、回执和合法 NONE；20 份 payload 复读
检查上文是否带来负向指令堆叠或固定流程；自然玩家体验只能观察“像不像、会不会腻”。
任何一层都不能证明角色永不 OOC，也不能冒充另一层已经完成。

完整来源分流见 [深空短信素材最终分流说明](LYSK_SMS_MATERIAL_ANALYSIS.md)，向量结论见
[Companion Material 向量召回与关系个性偏移](COMPANION_MATERIAL_VECTOR_AND_LIVE_DRIFT.md)。
