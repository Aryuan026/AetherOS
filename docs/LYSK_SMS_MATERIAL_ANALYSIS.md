# 深空短信素材最终分流说明

日期：2026-07-28

这份说明记录 909 个冻结短信来源怎样被完整审读、提纯和分流。它不保存原句、标题、
URL 或本机路径，也不把每条短信变成一条常驻 Prompt。

## 来源守恒

| 角色 | 来源数 | 支撑当前运行库 |
| --- | ---: | ---: |
| 祁煜 | 187 | 94 |
| 黎深 | 199 | 91 |
| 沈星回 | 221 | 82 |
| 秦彻 | 166 | 74 |
| 夏以昼 | 136 | 75 |
| 合计 | 909 | 416 |

最终守恒公式：

```text
909 frozen sources
  = 416 active-library support
      = 327 direct support + 89 blind-holdout evaluation
  + 493 retained outside active runtime
  = 0 unresolved
```

保留在运行库外不等于丢弃。493 条分别停在 exact-scope evidence、reviewed candidate
support、holdout 或 evidence-insufficient。只有 1 条证据不足；它仍有明确 disposition，
没有被静默删除。

## 四路产物

运行时共有 56 条非逐字素材：

| slot | 数量 | 用法 |
| --- | ---: | --- |
| `stable_character_voice` | 8 | 相关入口的轻量语言/判断角度 |
| `stable_base` | 5 | 稳定行动与判断倾向，不是本轮任务 |
| `relevant_stable_details` | 5 | 现场确有相关线索时才可使用 |
| `opening_recipes` | 18 | Call / Date / Meet / 主动入口的可变开场 |
| `proactive_seeds` | 14 | 主动来信的角色自生活或照看缘由 |
| `motive_candidates` | 1 | 只供合法主动/规划 surface 判断 |
| `scene_affordances` | 5 | 只供未来 ScenePlan 判断可展开性 |

五位角色的运行记录分别为 11 / 11 / 11 / 12 / 11。运行时仍稀疏：普通 Chat
最多 1 条，合法的开场、主动或场景入口最多 1–3 条；没有真正相关内容时返回 NONE。

另有 21 条经过审读的候选：

- 5 条稳定细节候选；
- 5 条开场候选；
- 1 条临时动机候选；
- 10 条场景 affordance 候选。

这些候选由 66 条来源支撑，但仍保留各自的 residual exact-scope evidence。它们不是
`CompanionMaterialRecord`，当前不能持久化、选择或递送。角色事实、明确线程/外部物件
或 Director/ScenePlan 权威成立后，未来 canonical publisher 仍需重新核验 exact receipt
id、revision、digest、issuer、HistoryScope、route 和 lane。

## 语言指纹不是口癖清单

语言指纹描述的是可变的角色侧 operator：

- 注意力先落在哪里；
- 普通、轻松、认真、拒绝或关怀时怎样改变温度；
- 怎样起步、转弯、留白或提出可拒绝的下一步；
- 怎样保留角色自己的生活线；
- 怎样承认信息不足与用户选择，不替对方下结论。

它不能包含固定台词、固定三段式、必须深爱用户、当前情绪、当前动机、工具策略或
“今天已经发生”的事实。相同的来源可共同支撑一个语义簇，增强稳定性但不重复递送。

## 真实入口

当前同一 selector 和 prompt projection 已接入：

- Chat；
- 自动 Call opening 与 Call 回合；
- Date opening 与 Date 回合；
- Wakeup / 主动来信。

真实消费者只在 provider 返回经过 surface 清洗后的非空内容后写
`truthEffect: none` delivery receipt。失败、空结果或仅完成选择都不消耗素材。
普通 Chat 对同一条真实递送设置 1 小时 exact reuse cooldown；场景素材按 exact
`scope + route + branch + scene + lane` 只使用一次，防止同一路线循环同一纹理。

StoryDesk 的纯 ScenePlan 合同已经存在，但真实运行时消费者仍未接入，因此 scene
候选不能被称为已进入剧情。

## 与玩家历史记录共用的方法

旧日对话日历沿用同一四路分析：

```text
按日来源
  -> bounded packets
  -> 非逐字候选
  -> 同模型第二遍证据复核
  -> exact relationship-scope publication
  -> 同一 selector / projection / receipt
```

旧记录只塑造这段关系中的声音、稳定触点和合法 surface 候选。它不会直接改角色卡、
当前心情、未完约定、Character Life、已经发生的剧情或工具权限。来源被修改、删除或
pass 被 supersede 后，旧投影即使清理失败也会 fail closed。

## 能力真相

```text
source adjudicated: 909 / 909
runtime material available: 56
reviewed candidates: 21
candidate runtime available: 0
model-facing payload audit: 20 cases
provider called by audit: no
natural long-run behavior guaranteed: no
vector contract seam: available
local vector producer/index/query: not implemented
```

代码门禁证明 scope、权限、预算、轮换和失败语义；API 视角复读检查上文有没有把模型
压成套路；自然使用只能帮助发现倾向。三者不能互相冒充。
