# Companion Material 执行与封箱手册

这份手册记录官方短信素材与玩家历史对话怎样被整理成可复用角色素材。它既是本轮
祁煜 / 黎深的执行记录，也是沈星回、秦彻、夏以昼以及未来自建角色的同一条生产线。

## 产品目标

素材的作用是给模型一个更容易“像这个角色”的落脚点，不是替角色写下一句台词。
最终运行时只保存非逐字、可变奏、带作用域的 guidance；原始短信、Word、TXT 与日档
原句继续留在各自私有来源层。

一份来源可以同时支持多条资产线，但运行时不会因此重复递送：

1. `language_fingerprint`：注意力落点、判断节奏、温度变化与表达范围；
2. `stable_detail`：经复核的稳定角色细节，只在相关话题召回；
3. `opening_recipe / proactive_seed / motive_candidate`：只在合法开场或主动 surface
   作为候选；
4. `scene_affordance`：说明某类场景为什么可展开，不证明已经发生。

## 标准执行顺序

### 1. 来源守恒

- 每个来源必须有 disposition，不以“没有生成新 record”冒充遗漏；
- 重复来源增强已有语义簇，不生成同义 Prompt 碎片；
- 一条来源可以多路贡献；
- 损坏、无法抽象或泄漏风险无法消除的来源才进入 quarantine。

### 2. 私有语义整理

- 先做角色内聚类，再做去名、跨角色与 shared-good-behavior 检查；
- 模型草稿固定为无运行时权威，不能因格式正确自动激活；
- 独立裁决必须回到真实 evidence subset，不能只改写 candidate guidance；
- 关怀、不适、拒绝、自生活与具身场景分别验收，避免用同一“好伴侣步骤”冒充角色指纹。

### 3. 干净运行包

- 只输出 opaque source refs、非逐字 guidance、slot、surface、证据统计与 revision；
- stable voice 只描述可变的 response operator；
- 当前地点、刚发生的事、当前动机、工具策略、关系结论与固定动作不得进入素材；
- 没有 canonical Life / Scene / live evidence 时，opening 与 self-life 只能保持
  `non_event` 或显式未来提案。

### 4. 真实消费者接入

```text
canonical active records
  -> exact scope / surface / route / knowledge gates
  -> relevance + novelty + diversity
  -> prompt projection
  -> consumer 真正收到非空内容
  -> truthEffect:none delivery receipt
```

- 普通 Chat：stable voice / base / relevant detail，通常最多一条；
- 主动来信：稳定声音与真正 proactive seed；
- Call：稳定声音；opening 只有具体当轮语义命中才进入；
- Date / Meet：稳定声音；当前直接入口不消费 motive / scene planning；
- StoryDesk / ScenePlan：未来只读 motive candidates / scene affordances，由 Director
  结合路线、Life 与现场证据裁决。

### 5. API 视角压力复核

维护者必须站在模型位置阅读最终 System Prompt，而不是只看素材记录：

- 有没有重复训话或负向指令堆叠；
- guidance 是否把角色压成固定三段式；
- stable identity 是否被误写成“今天已经发生”；
- 拒绝、不要建议、工具请求与纯寒暄能否合法返回 NONE；
- 主动性、转题、沉默、克制玩笑、自由使用合法工具的空间是否仍然存在。

代码门禁只证明边界；API 复读只判断上文压力；自然使用反馈只观察倾向。三者不能
互相冒充，也不存在一次测试证明角色永不 OOC。

### 6. 屎山与旁路复核

- 追到 `source -> review -> selection -> projection -> consumer -> receipt`；
- receipt 必须绑定 exact scope、material revision、真实 consumer 与最终非空输出；
- revised material 不继承旧 revision 的 cooldown；
- superseded / stale history pass 即使 library 清理失败也必须 fail closed；
- legacy 并行路径必须列名并明确 `active / quarantined / HOLD`，不能悄悄形成第二套消费链。
- 同一步评估向量是否真的必要：先量 active / eligible 候选规模与已标注语义漏召回，
  不因“以后可能很多”提前启用；若需要，只允许 hard gate 之后的 hybrid rank，并保留
  lexical fallback、版本 manifest 与失败原子回退。
- 同一步评估持续相处形成的个性偏移：历史塑造保留为 reviewed baseline / relationship
  overlay；新对话只先形成 exact relationship scope 的 candidate observation，经跨日、
  多证据、反模板检查后才能成为可回退的 style revision，不能改 canon、current state、
  current motive 或工具策略。

当前 `utils/activeMsgClient.ts` 与 Rei / ActiveMsg2 server functions 属于遗留外部通道；
默认主动来信运行时使用 `companion_wakeups`。遗留通道尚未删除，继续 HOLD，不得当成
本轮素材消费者或完成证据。

### 7. 复用到其他角色

每位角色分别完成：

- 来源守恒；
- 角色内语义聚类；
- 去名与跨角色区分；
- care / refusal / reentry / self-life / scene holdout；
- 干净 artifact；
- 生产 selector 六格以上探针；
- 最终 Prompt 复读；
- 独立代码复核。

不能复制祁煜或黎深的簇名作为另一位角色的先验答案；可复用的是步骤、合同、门禁和
验收方式。

## 本轮已验证经验

- 泛化 `opening` 只是传输元数据，不能让所有 opening recipe 变相关；
- generic heartbeat 只取真正 proactive seed，不把 reentry 当主动来信；
- 祁煜需要防止固化为“观察 -> 调侃 -> 邀请”；
- 黎深需要防止固化为“确认 -> 建议 -> 照护”；
- Call 的“像真人”示例不能靠虚构咖啡、工作或刚发生事件；
- Date opening 是用户进入后才成立的场景提案，不是当前世界事实；
- provider 返回只有标签 / 时间戳时，清洗后为空，不得写素材 delivery receipt；
- 一个旧日 pass 被 supersede 后，即使投影 library 尚未清理，也必须从 selector 消失。
- 通用括号动作只能说明存在场景容器，不能自动等于轻松、荒诞、打趣或挑战；窄玩笑
  指纹必须由用户明确设下的 premise / game / challenge 触发。
- 只有一条窄算子时，recent-delivery penalty 不足以防止重复；必须有明确 cooldown，
  邻接轮依靠最近对话延续而不是重复注入同一 guidance。
- `independent_life` 不能唤醒 reentry opening；时间间隔必须有真正 reentry 证据。
- 来源复核若只能支持窄 voice，就诚实留下普通分享、自生活和重逢缺口；不得把占位
  角色卡的问题伪装成素材层 Green，也不得用通用好行为填满空白。

## 封箱条件

只有以下状态同时成立才可提交和部署：

- 五位角色来源处置完成；
- 所有公开运行包不含私有原文；
- Chat / proactive / Call / Date 及未来 ScenePlan 边界一致；
- history source freshness、material revision、scope 与 receipt 全链路 Green；
- 向量能力如未启用，明确报告为 seam available，而不是 vector available；
- `verify:history-import`、`verify:companion-material`、`verify:narrative`,
  `verify:daily-archive`、`verify:health` 与独立代码审查 Green。
