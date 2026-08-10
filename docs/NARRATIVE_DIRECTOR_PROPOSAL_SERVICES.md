# 系统主持剧情提议服务

## 这一盒是什么

这一盒给 Story UI 两个独立、可审阅、零事实写入的 provider service：

1. `generateNarrativeSceneShellProposal` 根据当前 active run 与玩家给出的待演方向，提出一张开放的 scene shell 草稿。
2. `generateNarrativeSceneReceiptProposal` 根据已经 played 的 canonical scene beats，提出一张幕终记录草稿。

两者都使用系统主持 AI；都不创建 scene、不 confirm、不写 run / receipt / memory / Character Life / Worldbook。模型输出始终只是玩家可改的草稿。

## 1. Scene shell proposal

入口：

```ts
generateNarrativeSceneShellProposal(input: {
  requestId: string;
  scope: HistoryScope;
  currentTruth: NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth>;
  direction: string;
  availableParticipantIds: readonly string[];
  library: readonly Worldbook[];
  character: Pick<CharacterProfile, 'id' | 'mountedWorldbooks'>;
  knowledgeSubjects: readonly WorldbookKnowledgeSubjectRef[];
  explicitWorldbookRefs?: readonly WorldbookProjectionExplicitRef[];
  apiConfig: APIConfig;
  provider: AiTaskProviderRef;
  now?: number;
}): Promise<GenerateNarrativeSceneShellProposalResult>
```

返回的 `proposal` 只有：

- `sourceFingerprint`
- `title`
- 可选 `location`
- 可选 `objective`
- `constraints`
- `participantIds`

UI 如果接受，仍需自己生成 code-owned shell id / runId，再显式调用既有 `openAcceptedNarrativeScene`。本 service 不返回 `acceptedByUser`，也不会调用 scene lifecycle。

输入给模型的 current truth 是限长安全片段：active run 的线路身份与 route summary、同线路最近四次玩家确认经历。当前 run 已经存在 active scene 时会在调用模型前 fail closed；下一幕只能在上一幕结束后筹备，active scene 也不会作为“继续生成”的材料进入 prompt。`routeState`、NPC `knownFacts`、历史分析和未确认事实同样不进入 prompt。

世界书使用 `worldbook_preview` typed projection，按 active run 的 mainline / IF continuity 选择；预算为总计 1200 字、最多 3 条、单条最多 500 字。knowledge subject 只能是当前 exact scope 的角色，或以 `personaMaskId` 标识的当前玩家主体，不允许联合其他角色、NPC 或 narrator 取得额外知情权。第一盒不会读取 `director_only`。只有模型输出通过完整 schema、字段、长度、参与者白名单和 fingerprint 校验后，才记录这次世界书 projection 的 delivery receipt；模型失败或非法输出零写。

## 2. Played scene receipt proposal

入口：

```ts
generateNarrativeSceneReceiptProposal(input: {
  requestId: string;
  scope: HistoryScope;
  narrative: NovelNarrativeState;
  sceneId: string;
  apiConfig: APIConfig;
  provider: AiTaskProviderRef;
}): Promise<GenerateNarrativeSceneReceiptProposalResult>
```

服务从调用方持有的 canonical narrative state 内重新定位 run / scene，只接受同 progress bundle、包含当前 char、状态恰为 `played` 且具有 `playedAt` 的 scene。它不会接受 active、planned 或已经 confirmed 的 scene。

beats 最多递送 24 条：长场景保留前 12 条与后 12 条；单条最多 500 字，总计最多 6000 字。返回的 `proposal` 只有：

- `sourceFingerprint`
- `summary`
- `acceptedFacts`
- 可选 `rejectedOrEditedFacts`

`acceptedFacts` 允许为空。UI 让玩家修改并明确确认后，才能把这些字段连同玩家选择的 memory policy 交给既有 `confirmPlayedNarrativeScene`。本 service 不输出 `confirmedByUser`、memory policy、life event、route、branch 或 truth effect，也不直接调用确认函数。

## 能力真相

- `available`：两条 provider service、严格 JSON/schema 校验、限长输入、exact scope、参与者白名单、source fingerprint、合法响应后的世界书 projection receipt。
- `delivered`：纯函数式 provider seam 与 verifier。
- `requested / canonical_receipt / visible_projection`：等待 Story UI 接入后才可能发生。
- 不属于本盒：UI、OSContext、NovelWriter、剧情持久化、自动确认、Worldbook growth、预设与 DM 执行。

验证入口为 `npm run verify:narrative-director-proposals`。夹具同时证明合法正向结果、后台世界书与内部 route/NPC 数据不泄漏、未知参与者/额外字段被拒、played beats 限长、失败零 projection receipt，以及两个服务都不修改 narrative 或创建 canonical receipt。
