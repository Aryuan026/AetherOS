import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectCurrentStoryStatus } from '../domain/narrative/currentStoryStatus.ts';
import { projectNarrativeDirectorCurrentTruth } from '../domain/narrative/directorContext.ts';
import type {
  NarrativeExperienceReceipt,
  NarrativeRun,
  NarrativeScene,
  NovelNarrativeState,
} from '../domain/narrative/types.ts';
import { createNarrativeWorldGrowthCandidates } from '../domain/worldbook/narrativeGrowth.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const T0 = 1_776_600_000_000;
const SCOPE: HistoryScope = {
  progressBundleId: 'bundle-world-growth',
  personaMaskId: 'mask-world-growth',
  charId: 'char-world-growth',
};
const OTHER_SCOPE: HistoryScope = { ...SCOPE, personaMaskId: 'mask-other' };

const activeRun: NarrativeRun = {
  id: 'run-active-mainline',
  progressBundleId: SCOPE.progressBundleId,
  bookId: 'book-story-desk',
  routeId: 'route-mainline',
  branchId: 'branch-mainline',
  lane: 'mainline',
  status: 'active',
  participantCharIds: [SCOPE.charId],
  activeSceneId: 'scene-active-now',
  directiveIds: [],
  routeSummary: '正在追查旧港失踪案',
  routeState: { clueCount: 3, gateOpen: false },
  npcStates: [{
    id: 'npc-porter',
    name: '守门人',
    disposition: '谨慎',
    knownFacts: ['认识旧港管理员'],
    updatedAt: T0,
  }],
  openThreads: [{
    id: 'thread-key',
    title: '钥匙属于谁',
    status: 'open',
    sourceSceneId: 'scene-confirmed-mainline',
  }],
  startedAt: T0 - 100,
  updatedAt: T0,
};
const activeScene: NarrativeScene = {
  id: 'scene-active-now',
  runId: activeRun.id,
  status: 'active',
  title: '回到旧港',
  location: '旧港仓库',
  participantIds: ['user', SCOPE.charId],
  objective: '确认仓库中的脚印',
  constraints: [],
  beats: [],
  openedAt: T0,
};
const confirmedScene: NarrativeScene = {
  id: 'scene-confirmed-mainline',
  runId: activeRun.id,
  status: 'confirmed',
  title: '拿到旧钥匙',
  participantIds: ['user', SCOPE.charId],
  constraints: [],
  beats: [],
  playedAt: T0 - 80,
  confirmedAt: T0 - 70,
};
const confirmedReceipt: NarrativeExperienceReceipt = {
  id: 'receipt-confirmed-mainline',
  progressBundleId: SCOPE.progressBundleId,
  runId: activeRun.id,
  sceneId: confirmedScene.id,
  lane: 'mainline',
  participantCharIds: [SCOPE.charId],
  summary: '两人确认钥匙来自旧港仓库。',
  acceptedFacts: ['DO_NOT_AUTO_PROMOTE_RECEIPT_FACT'],
  memoryPolicy: 'main_vault',
  confirmedByUser: true,
  playedAt: T0 - 80,
  confirmedAt: T0 - 70,
};
const completedRun: NarrativeRun = {
  ...activeRun,
  id: 'run-completed-other-route',
  routeId: 'route-completed-other',
  branchId: 'branch-completed-other',
  status: 'completed',
  activeSceneId: undefined,
  routeSummary: 'COMPLETED_OTHER_ROUTE',
  routeState: {},
  npcStates: [],
  openThreads: [],
  completedAt: T0 - 200,
};
const completedScene: NarrativeScene = {
  ...confirmedScene,
  id: 'scene-completed-other',
  runId: completedRun.id,
  title: 'COMPLETED_OTHER_ROUTE_SCENE',
};
const completedReceipt: NarrativeExperienceReceipt = {
  ...confirmedReceipt,
  id: 'receipt-completed-other',
  runId: completedRun.id,
  sceneId: completedScene.id,
  summary: 'COMPLETED_OTHER_ROUTE_RECEIPT',
};
const draftRun: NarrativeRun = {
  ...activeRun,
  id: 'run-draft-hidden',
  routeId: 'DRAFT_MARKER_ROUTE',
  branchId: 'DRAFT_MARKER_BRANCH',
  status: 'draft',
  activeSceneId: undefined,
  routeSummary: 'DRAFT_MARKER_SUMMARY',
  routeState: { draftSecret: 'DRAFT_MARKER_STATE' },
  npcStates: [],
  openThreads: [],
};
const draftScene: NarrativeScene = {
  ...activeScene,
  id: 'scene-draft-hidden',
  runId: draftRun.id,
  status: 'planned',
  title: 'DRAFT_MARKER_SCENE',
  openedAt: undefined,
};
const unconfirmedReceipt: NarrativeExperienceReceipt = {
  ...confirmedReceipt,
  id: 'receipt-unconfirmed-hidden',
  summary: 'UNCONFIRMED_MARKER_RECEIPT',
  confirmedByUser: false,
  confirmedAt: undefined,
};

const narrative: NovelNarrativeState = {
  schemaVersion: 1,
  runs: [activeRun, completedRun, draftRun],
  scenes: [activeScene, confirmedScene, completedScene, draftScene],
  receipts: [confirmedReceipt, completedReceipt, unconfirmedReceipt],
  activeRunId: activeRun.id,
  updatedAt: T0,
};
const currentTruth = projectNarrativeDirectorCurrentTruth({ scope: SCOPE, narrative });
assert.equal(currentTruth.confirmedExperiences.length, 2, 'Director truth may retain confirmed receipts across routes');

const status = projectCurrentStoryStatus({ scope: SCOPE, currentTruth });
assert.equal(status.status, 'active');
assert.equal(status.activeRun?.id, activeRun.id);
assert.equal(status.activeScene?.id, activeScene.id);
assert.deepEqual(status.routeState, activeRun.routeState);
assert.deepEqual(status.npcStates.map(npc => ({
  id: npc.id,
  name: npc.name,
  disposition: npc.disposition,
  knownFacts: npc.knownFacts,
})), activeRun.npcStates.map(npc => ({
  id: npc.id,
  name: npc.name,
  disposition: npc.disposition,
  knownFacts: npc.knownFacts,
})));
assert.deepEqual(status.openThreads, activeRun.openThreads);
assert.deepEqual(status.confirmedExperiences.map(entry => entry.receiptId), [confirmedReceipt.id]);
assert.equal(Object.isFrozen(status), true);
assert.equal(Object.isFrozen(status.npcStates), true);
const renderedStatus = JSON.stringify(status);
assert.doesNotMatch(renderedStatus, /DRAFT_MARKER|UNCONFIRMED_MARKER|COMPLETED_OTHER_ROUTE/);

const inactiveTruth = projectNarrativeDirectorCurrentTruth({
  scope: SCOPE,
  narrative: {
    ...narrative,
    runs: narrative.runs.map(run => run.id === activeRun.id
      ? { ...run, status: 'paused' as const, activeSceneId: undefined }
      : run),
    scenes: narrative.scenes.map(scene => scene.id === activeScene.id
      ? { ...scene, status: 'planned' as const, openedAt: undefined }
      : scene),
    activeRunId: undefined,
  },
});
const emptyStatus = projectCurrentStoryStatus({ scope: SCOPE, currentTruth: inactiveTruth });
assert.equal(emptyStatus.status, 'empty');
assert.equal(emptyStatus.activeRun, null);
assert.deepEqual(emptyStatus.confirmedExperiences, []);
assert.deepEqual(emptyStatus.routeState, {});
assert.throws(
  () => projectCurrentStoryStatus({ scope: OTHER_SCOPE, currentTruth }),
  /crosses Narrative Director relationship scope/,
);

const candidates = createNarrativeWorldGrowthCandidates({
  scope: SCOPE,
  currentTruth,
  source: {
    receiptId: confirmedReceipt.id,
    runId: activeRun.id,
    sceneId: confirmedScene.id,
  },
  proposedDrafts: [{
    proposalId: 'old-port-key-rule',
    title: '旧港钥匙管理规则',
    content: '旧港仓库钥匙由当值管理员登记保管。',
    category: '地点规则',
    activationHint: '旧港、仓库或钥匙被提及时',
    knowledgePolicy: { kind: 'director_only' },
  }, {
    proposalId: 'porter-supplement',
    title: '守门人的工作关系',
    content: '守门人与旧港管理员保持工作联络。',
    category: '人物关系',
    knowledgePolicy: { kind: 'public' },
    supplementsEntryIds: ['built-in-old-port'],
  }],
  createdAt: T0 + 10,
});
assert.equal(candidates.length, 2);
candidates.forEach(candidate => {
  assert.equal(candidate.status, 'pending');
  assert.equal(candidate.truthEffect, 'none');
  assert.deepEqual(candidate.scope, SCOPE);
  assert.equal(candidate.source.kind, 'narrative');
  assert.equal(candidate.source.refId, confirmedReceipt.id);
  assert.equal(candidate.source.lane, 'mainline');
  assert.equal(candidate.source.routeId, activeRun.routeId);
  assert.equal(candidate.source.branchId, activeRun.branchId);
  assert.equal(candidate.draft.bindings[0].kind, 'mainline');
  assert.deepEqual(candidate.draft.bindings[0].scope, SCOPE);
  assert.deepEqual(candidate.draft.sourceRefs.map(ref => ref.refId), [
    confirmedReceipt.id,
    activeRun.id,
    confirmedScene.id,
  ]);
  assert.equal(candidate.acceptedRevisionId, undefined);
});
assert.doesNotMatch(JSON.stringify(candidates), /DO_NOT_AUTO_PROMOTE_RECEIPT_FACT/);

const ifRun: NarrativeRun = {
  ...activeRun,
  id: 'run-if',
  routeId: 'route-if',
  branchId: 'branch-if-rain',
  lane: 'if_line',
  activeSceneId: undefined,
  routeState: {},
  npcStates: [],
  openThreads: [],
};
const ifScene: NarrativeScene = {
  ...confirmedScene,
  id: 'scene-if-confirmed',
  runId: ifRun.id,
};
const ifReceipt: NarrativeExperienceReceipt = {
  ...confirmedReceipt,
  id: 'receipt-if-confirmed',
  runId: ifRun.id,
  sceneId: ifScene.id,
  lane: 'if_line',
  memoryPolicy: 'dream_material',
};
const ifTruth = projectNarrativeDirectorCurrentTruth({
  scope: SCOPE,
  narrative: {
    schemaVersion: 1,
    runs: [ifRun],
    scenes: [ifScene],
    receipts: [ifReceipt],
    activeRunId: ifRun.id,
    updatedAt: T0,
  },
});
const [ifCandidate] = createNarrativeWorldGrowthCandidates({
  scope: SCOPE,
  currentTruth: ifTruth,
  source: { receiptId: ifReceipt.id, runId: ifRun.id, sceneId: ifScene.id },
  proposedDrafts: [{
    proposalId: 'if-weather-rule',
    title: '雨城天气规律',
    content: '雨城黄昏常有短时阵雨。',
    category: '环境',
    knowledgePolicy: { kind: 'public' },
  }],
  createdAt: T0 + 20,
});
assert.equal(ifCandidate.source.kind, 'narrative');
assert.equal(ifCandidate.source.lane, 'if_line');
assert.equal(ifCandidate.source.routeId, ifRun.routeId);
assert.equal(ifCandidate.source.branchId, ifRun.branchId);
assert.equal(ifCandidate.draft.bindings[0].kind, 'if_branch');
if (ifCandidate.draft.bindings[0].kind === 'if_branch') {
  assert.equal(ifCandidate.draft.bindings[0].branchId, ifRun.branchId);
}

assert.throws(() => createNarrativeWorldGrowthCandidates({
  scope: OTHER_SCOPE,
  currentTruth,
  source: { receiptId: confirmedReceipt.id, runId: activeRun.id, sceneId: confirmedScene.id },
  proposedDrafts: [{
    proposalId: 'wrong-scope',
    title: '错误作用域',
    content: '不应产生。',
    category: '测试',
    knowledgePolicy: { kind: 'public' },
  }],
  createdAt: T0,
}), /crosses Narrative Director relationship scope/);
assert.throws(() => createNarrativeWorldGrowthCandidates({
  scope: SCOPE,
  currentTruth,
  source: { receiptId: confirmedReceipt.id, runId: 'wrong-run', sceneId: confirmedScene.id },
  proposedDrafts: [{
    proposalId: 'wrong-run',
    title: '错误线路',
    content: '不应产生。',
    category: '测试',
    knowledgePolicy: { kind: 'public' },
  }],
  createdAt: T0,
}), /not a matching user-confirmed experience/);
assert.throws(() => createNarrativeWorldGrowthCandidates({
  scope: SCOPE,
  currentTruth,
  source: { receiptId: confirmedReceipt.id, runId: activeRun.id, sceneId: confirmedScene.id },
  proposedDrafts: [],
  createdAt: T0,
}), /requires explicit proposed drafts/);
assert.throws(() => createNarrativeWorldGrowthCandidates({
  scope: SCOPE,
  currentTruth,
  source: { receiptId: confirmedReceipt.id, runId: activeRun.id, sceneId: confirmedScene.id },
  proposedDrafts: [
    { proposalId: 'duplicate', title: '一', content: '一', category: '测试', knowledgePolicy: { kind: 'public' } },
    { proposalId: 'duplicate', title: '二', content: '二', category: '测试', knowledgePolicy: { kind: 'public' } },
  ],
  createdAt: T0,
}), /proposal ids must be unique/);
assert.throws(() => createNarrativeWorldGrowthCandidates({
  scope: SCOPE,
  currentTruth,
  source: { receiptId: confirmedReceipt.id, runId: activeRun.id, sceneId: confirmedScene.id },
  proposedDrafts: [{
    proposalId: 'unsafe-existing-target',
    title: '不应暗改既有条目',
    content: '既有条目的线路和知情边界必须由未来 typed target gate 校验。',
    category: '测试',
    knowledgePolicy: { kind: 'public' },
    targetEntryId: 'mainline-entry',
    baseRevisionId: 'mainline-revision',
  } as never],
  createdAt: T0,
}), /cannot update an existing entry before a typed target gate exists/);

const adapterSource = readFileSync(new URL('../domain/worldbook/narrativeGrowth.ts', import.meta.url), 'utf8');
assert.doesNotMatch(adapterSource, /acceptWorldGrowthCandidate|WorldbookPersistencePort|saveWorldbook|mountWorldbook/);

console.log('Worldbook narrative growth verification passed.');
