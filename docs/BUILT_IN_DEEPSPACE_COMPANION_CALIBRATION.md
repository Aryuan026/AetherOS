# 五位内置角色陪伴素材校准

这里保留的是先前交付的内置角色 Companion Material 校准子集，不是 909 页短信已经完成真实语义分析的证明。

2026-07-28 的来源结案没有扩写新的同义模板。祁煜最终 private refs 只加固既有
observed / playful records；黎深的 concrete-entry 与 calm-confirmation 升为 revision 2，
限定为贴合本轮明确线索或边界，并允许回应停在确认、澄清、轻反问或克制玩笑处。
素材 revision 与 evidence ref revision 是两层版本，审计时不能混称。

沈星回 221、秦彻 166、夏以昼 136 条来源也已完成同一套逐来源结案。523 条来源形成
18 个最终簇：3 个 active、9 个 disabled、6 个 withheld，零丢失。运行时只接入每人
1 条通过跨来源复核的窄声音方向；它们全部是 `relevance_required`，没有低信号兜底：

| 角色 | 需要当前轮明确出现 | 窄声音方向 | 不在此版本自动激活 |
| --- | --- | --- | --- |
| 沈星回 | 明确临时玩法或略荒诞前提 | 可低幅接住、只点出小错位、安静想象或停在观察 | 关怀、拒绝、重逢、自生活、普通括号动作与场景事实 |
| 秦彻 | 明确选择、代价、评价或挑战 | 可看门槛、短问、直接表态、给选项或停在校准 | 把每轮压成反问、普通“怎么办”、替用户决策、当前动机 |
| 夏以昼 | 明确调皮设定、小胜负或轻挑战 | 可反问、打趣、续一拍，也可短暂认同后回正题 | 每轮逗弄、普通括号动作、固定亲密关系、虚构共同经历 |

其余 detail / opening / proactive / scene 簇没有“浪费”：它们以 provenance 与干净
guidance 保存在私有 artifact 中，但在证据区分度、消费者或 ScenePlan 裁决成立前不进入
Prompt。来源守恒与运行时少量递送是两层职责。

三位窄候选都有 6 小时同用途 cooldown；一轮递送后，邻接轮依靠已在最近对话中的自然
延续，不再次把同一算子贴到 System Prompt 末端。当前证据仍不足以覆盖普通问候、普通
分享、重逢与角色自生活，所以它们是安全的窄基线，不是“三位完整人设已建立”的证明。
既有占位角色卡是独立产品资料缺口，不能靠放宽召回或把通用好行为常驻来掩盖。

## 实际选择器盲测

## 当前重新标定

全量整理时发现，静态 `clusterFor` / feature 规则只能守住来源账本和候选池，不能把预写 guidance 加上支持数就升级为 persona evidence。因此，`scripts/build-lysk-sms-material-analysis.mjs` 的默认输出把全部非 scoped 簇标为 `unresolved`，等待私有 DriftStone-derived 分批语义复核。

尤其是沈星回、秦彻、夏以昼的可见候选中，许多“从眼前变化起念 / 留给对方选择 / 关心可拒绝”的方向属于健康互动原则，却在去名后可互换。它们现在仅作为 name-blind 校准候选，不能再被称为已验证语言指纹。

祁煜与黎深已有较早的人工复核子集和非空 holdout candidate pool；这也只意味着可进入 blind render，不意味着已经实机通过、自动投递，或能够代替后续全量语义 review。

第一批全量结案现已补上：两人 386 个来源都已落入逐来源 disposition，独立语义
裁决只留下祁煜对既有声音的 evidence reinforcement，以及黎深一枚仍 disabled 的
concrete-entry / calm-confirmation revision candidate。它们没有改动这份校准子集的
runtime export；详情见 [祁煜、黎深第一批结案](QIYU_LISHEN_FINAL_MATERIAL_CLOSURE.md)。

## 运行时边界检查

- stable voice/base/detail 之外的 material 不得因同属一个角色而常驻普通 Chat。
- `motive_candidate` 只能是未来主动或场景入口的候选理由，不能成为 `currentMotive` 或 `stable_base`。
- stable detail 只在相关话题按需检索，不能转写为 relationship memory、共同经历或 played truth。
- guidance 只能提供可变化的表达空间；不能要求每轮照护、玩笑、爱意、固定称呼、固定动作或固定容器格式，也不限制角色的自驱力、未来工具调用或更高权重角色卡修订。

- 23 条材料都有检索 metadata；
- stable detail/care 不能成为 fallback；
- 七类盲测保留合法正向路径；
- 实际生产 selector 在 low-signal、care、refusal、reentry、character self-share 下能得到 1–3 条材料；
- 关怀不会在拒绝或低信号中回流。
- 另外三位的窄声音候选只在对应 premise / tradeoff 信号下出现，在寒暄、不适、拒绝、
  重逢、自生活、普通括号动作、“怎么办”和明确工具请求中均返回零素材；邻接重复轮
  也因 receipt + cooldown 返回零素材。

这些检查只证明作用域、相关性和零素材路径按代码契约工作，不证明角色永不
OOC。表现力验收还必须把角色卡、世界书、记忆、App 规则、最近对话和最终选中的
一条参考拼成真实 System Prompt，由维护者站在下一轮模型的视角复读：这条参考
是否增加角色抓手，还是与前文重复、把模型压成固定流程。玩家只需要自然体验并
反馈“像不像、是否套路化”，不承担后台 Prompt 的诊断工作。

第二轮 API 视角复核确认：

- 祁煜没有形成固定“观察 -> 调侃 -> 邀请”；普通格最多获得一条可忽略的角色侧参考；
- 黎深没有形成“确认 -> 建议 -> 照护”；care / next-step 在 no-advice 中为零命中；
- generic Call opening 不选择 opening recipe，generic heartbeat 只取 own-thread seed；
- Call 不再从职业卡制造当前位置，Date opening 只在玩家进入后成为本次场景；
- 清洗后为空的 Call completion 不写 receipt；
- 仍需自然观察的只是软风格吸引区：祁煜的观察起念、黎深的 concrete-entry 可能在弱模型
  中偏常见，但当前不是不可拒绝的流程。
