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

- `available`：内置复核素材与已发布的历史素材都能进入候选仓。
- `selected`：普通 Chat 使用本地检索器，默认最多选择 3 条。
- `delivered`：只有请求已被 API 接受后才写 delivery receipt；准备或选择素材不写回执。
- `truth effect`：固定为 `none`。素材递送不会改写当前状态、关系事实、角色生活、剧情事实或工具权限。
- `HOLD`：日历原文自动调用模型生成分析 pass；Call、主动来信、见面与 StoryDesk 的正式运行时消费；浏览器/APK 向量索引开关。

## 无向量第一层

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

低信号输入只允许一条合法的 `voice_fallback`。关怀、稳定细节、冲突/修复、开场、主动动机与场景可能性全部必须获得相关证据。

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

原始 Word/TXT、日历消息与逐字对话不会进入 prompt material。Prompt 只收到复核后的非逐字 guidance；source refs 保留在私有审计层。

## Prompt 与 Context Compiler 边界

普通 Chat 只允许：

- `stable_character_voice`
- `stable_base`
- `relevant_stable_details`

`opening_recipes`、`proactive_seeds`、`motive_candidates`、`scene_affordances` 在普通 Chat fail closed。

`CompanionMaterialContextSlice` 可以把已经选择且已经投影的材料编译成稳定层和 surface 候选层，但它不包含：

- `currentMotives` 或 current state；
- Character Life；
- Directive、NarrativeRun、Scene 或 ExperienceReceipt；
- tool allowlist/denylist；
- delivery receipt 写入。

未来 Director/ScenePlan 才能依据路线、Life、关系与现场证据，把 `motiveCandidates` 中的一项转成真正的当下动机。

## 向量升级缝

`CompanionMaterialSemanticRank` 是可选的旁路分数：

- 带 `modelId + indexRevision + materialId/score`；
- query 向量只与同一次 index revision 中的素材向量比较；
- 更换 embedding 模型时新建/重建 revision，不要求永远使用同一个模型；
- 原始素材、source fingerprint 和 scope 是可重建真相，向量只是可丢弃索引；
- embedding 高分不能越过 scope、surface、knowledge、continuity、cooldown 或预算门禁；
- 无向量时 lexical/signals/receipt 路径始终可用。

浏览器与未来 APK 的本地向量化开关属于下一盒。开启前必须展示首次建索引的资源成本；关闭或索引失效时自动回到当前无向量路径。
