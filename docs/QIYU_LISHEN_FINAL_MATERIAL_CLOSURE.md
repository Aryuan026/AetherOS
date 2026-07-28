# 祁煜、黎深：第一批 Companion Material 结案

这批结案把 386 条私有短信来源从“静态归桶”推进为可交接的语义判断，但没有把
它们塞进 Chat。原文仍在 ignored 私有区；可交接 artifact 只保留 opaque refs、
非逐字 guidance、surface、审计条件和状态。

## 来源守恒

| 角色 | 私有来源 | 结案方式 |
| --- | ---: | --- |
| 祁煜 | 187 | 每条保留 primary final disposition 与 1–N 个支持的最终簇；重复来源只增强证据。 |
| 黎深 | 199 | 同上；voice holdout 保持独立，不进入可用 evidence subset。 |
| 合计 | 386 | `386 = 386 accounted + 0 dropped`。 |

## 最终判断

| 角色 | active | disabled | withheld | 这次真正留下的东西 |
| --- | ---: | ---: | ---: | --- |
| 祁煜 | 1 | 3 | 2 | 一条既有玩心式指纹的 reinforcement，不新增 prompt record；自生活/开场与场景都仍有 receipt 或 ScenePlan 门。 |
| 黎深 | 0 | 4 | 3 | 一枚 concrete-entry + calm-confirmation 的最小修订候选，仍 disabled；照护、默认建议、具身场景不启用。 |

### 祁煜

最强的独立 evidence subset 支持的不是“每轮观察后逗人”，而是既有声音里一条
更窄的能力：在用户已经给出的轻量细节上，容许玩心式侧转和自主判断。它只作为
`builtin-qiyu-voice-playful-turn-v1` / `builtin-qiyu-voice-observed-entry-v1` 的
revision evidence，未增添 record、未改写 record、未进入投递。

关怀、关系专属玩笑、创作/出游近况和场景素材分别留在 withheld 或 receipt-gated
位置。这样保留了祁煜的感官联想、想象力与自生活的证据，却不会把他压成
“观察→逗→邀约”的轮次公式。

### 黎深

独立裁决认可一条最小的 future revision：面对用户已给出的具体线索或明确边界，
可以先以短而平静的确认、澄清或轻微反问建立共同理解。它覆盖 minimal ping、
感官分享与拒绝澄清，不把“确认”自动推进为建议、诊断或照护流程。

该候选只指向既有 `builtin-lishen-voice-concrete-entry-v1` 与
`builtin-lishen-voice-calm-confirmation-v1`，状态仍是 `disabled_revision_candidate`。
absence stance 只增强既有表现；embodied scene 已因盲测回退而 withheld。日程、
职业和主动生活线只能在 canonical Life receipt 支持下进入相应入口。

## 独立裁决与盲测边界

- 本轮裁决使用的是 bounded 私有 batch 的真实语义，而不是把 Qwen 的草稿升级为
  authority。草稿只负责列出候选与不确定性；artifact 记录的 reviewer kind 为
  `independent_model_adjudication`。
- 祁煜的 minimal ping 没带来新增角色辨识收益，只提供事实清洁、硬失败归零的
  reinforcement；因此没有把它误写成新指令。
- 黎深的 minimal ping、sensory share、refusal clarity 通过窄门；care/discomfort
  的 shared-solution skeleton 仍未通过，具身场景也未通过。
- 所有 motive 仍只是候选；所有 stable detail 都不是关系记忆；所有 scene 都不是
  已发生事件。无 canonical receipt 的当前自生活、工具场景和 ordinary Chat 都不
  从这些候选取材。

## 给总控的交接

运行 `node scripts/build-qiyu-lishen-final-material-artifact.mjs` 会写入 ignored
artifact；运行 `node scripts/verify-qiyu-lishen-final-material-artifact.mjs` 会核对：

- 386 条来源的 exact lead scope 与最终去处；
- selected opaque refs 是实际被保留的来源子集；
- active reinforcement 不会创建、改写或投递 runtime record；
- 黎深修订候选仍 disabled；care、motive、scene 的表面/事实抑制条件仍在；
- artifact 没有原文、标题、URL 或本地路径。

artifact/schema 不接 Chat、selector、Context Compiler 或 ScenePlan；这是一份可由
总控在下一步显式编译、并由相应 consumer 回执的素材交接件。
