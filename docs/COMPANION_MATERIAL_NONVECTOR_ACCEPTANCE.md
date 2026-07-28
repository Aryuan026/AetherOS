# 陪伴素材无向量召回验收

日期：2026-07-28
状态：本地代码与离线扮演夹具 Green；新增 909 素材仍未激活

## 这轮证明了什么

这轮不是证明“素材越多越像”，而是检查一条更窄的产品主张：

> 已有人设卡负责角色本体；历史记录与复核素材每轮只提供一个真正相关、
> 可以被忽略的回应动作，帮助角色把本轮注意力落在更像自己的位置。

普通 Chat 因此固定为：

- `maxItems = 1`
- `budgetChars = 360`
- `ordinary_share` 不能单独证明某条素材相关
- 明确的“不需要建议，只想聊聊”和工具请求允许合法返回零素材
- 素材只是 optional response operator，不是事实、记忆、当下动机、
  固定台词或工具策略

Call、主动来信、见面与未来 ScenePlan 可以在各自的 canonical receipt 和
预算下选择 1–3 条，但普通 Chat 不继承这个上限。

## 两轮离线 API 镜像

### 第一轮

第一轮把独立裁决出的多个方向一起给角色，结果只带来很小的整体角色辨识
增益，并让自然度、主动性与比例感轻微下降。黎深改善，祁煜回退；同时出现
把稳定身份写成“今天刚发生”的 current-state 幻觉。

结论：整组不激活，并把问题收束为几个可单独检验的窄 operator。

### 第二轮

第二轮包含：

- A2：不递送素材
- B2：只在预先声明的窄场景递送一个 operator
- 每个角色 × 场景生成 3 个变体
- 共 96 条去名回答
- 2 名独立 judge，各自完成全部 96 条评分

双 judge 一致性：

- 去名角色判断一致率：`0.948`
- hard-failure 集合完全一致率：`0.823`

只比较实际发生素材注入的 18 对应回答：

| 指标 | A2 | B2 | 变化 |
| --- | ---: | ---: | ---: |
| role specificity | 2.389 | 3.139 | +0.750 |
| 去名识别率 | 0.778 | 0.972 | +0.194 |
| fact cleanliness | 3.528 | 4.000 | +0.472 |
| agency | 3.194 | 3.472 | +0.278 |
| naturalness | 3.806 | 3.722 | -0.084 |
| hard-failure responses | 6 | 0 | -6 |

这个结果支持“一个稀疏 operator”的代码路线，但不支持把所有候选激活。
完整 A2/B2 由不同独立生成者产生，因此全臂总分只作观察；因果判断只使用
预先声明的注入格和逐格结果。

## 逐格裁决

- 祁煜 minimal ping：角色分没有新增收益，但事实清洁改善、硬失败归零。
  只作为既有 fingerprint 的 reinforcement，不新建同义 runtime record。
- 黎深 minimal ping：通过窄门。
- 黎深 sensory share：通过窄门。
- 黎深 refusal clarity：通过窄门；要继续观察轻微 naturalness 代价。
- 黎深 absence stance-only：既有人设已经较强，只作 reinforcement。
- 黎深 embodied scene：表现回退，继续 withheld。
- no-advice、无 canonical receipt 的 current-life self-report、工具请求：
  不消费素材。

人设巡航据此只留下一个尚未启用的黎深 revision candidate；祁煜不新增，
care、主动生活、场景化方向继续锁住。909 条来源主要成为证据覆盖、重复抑制
与未来检索校准，不是一条来源对应一条 prompt fragment。

## 当前能力真相

| 层级 | 状态 |
| --- | --- |
| available | 既有 20 条祁煜/黎深复核记录可供本地选择；196 私有草稿均不可激活 |
| selected | 无向量 selector、轮换、精确去重与零素材路径已通过夹具 |
| delivered | 普通 Chat 已有真实代码消费口和成功请求后的 receipt 写入 |
| natural behavior observed | 仅完成离线 API 镜像与双盲裁决；尚未用真实玩家 API 做自然多轮观察 |
| new 909 material activated | 否 |
| committed / pushed / deployed | 否 |

## 仍未证明

- 真实 provider、真实角色卡、真实世界书与玩家近期消息拼成的完整请求，在
  多轮自然对话中是否持续保持收益。
- 不同模型供应商对同一 response operator 的服从强度和表达多样性。
- Call、主动来信、见面、ScenePlan 的正式运行时消费与 canonical receipt。
- 浏览器或 APK 本地 embedding 索引。当前只保留可选
  `semanticRank + indexRevision` 接口，向量化继续 HOLD。

下一次允许的激活单位不是“909 素材包”，而是一个通过来源复核、去名盲测、
事实清洁和具体 surface 门禁的窄 revision。
