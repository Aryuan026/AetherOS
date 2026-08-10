import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import type {
  APIConfig,
  CharacterProfile,
  Worldbook,
} from '../types.ts';
import { AI_TASK_REGISTRY } from '../domain/aiRuntime/registry.ts';
import type { AiTaskProviderRef } from '../domain/aiRuntime/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import { projectNarrativeDirectorCurrentTruth } from '../domain/narrative/directorContext.ts';
import type {
  NarrativeExperienceReceipt,
  NarrativeRun,
  NarrativeScene,
  NovelNarrativeState,
} from '../domain/narrative/types.ts';
import {
  createWorldbookEntry,
  getActiveWorldbookRevision,
} from '../domain/worldbook/index.ts';
import { DB } from '../utils/db.ts';
import {
  generateNarrativeSceneReceiptProposal,
  generateNarrativeSceneShellProposal,
} from '../utils/narrativeDirectorProposalServices.ts';
import { indexedDbWorldbookPersistence } from '../utils/worldbookPersistence.ts';
import { createWorldbookGroupAssignment } from '../utils/worldbookGroups.ts';

const T0 = 1_776_800_000_000;
const scope: HistoryScope = {
  progressBundleId: 'bundle-director-provider',
  personaMaskId: 'mask-director-provider',
  charId: 'char-director-provider',
};
const run: NarrativeRun = {
  id: 'run-director-provider',
  progressBundleId: scope.progressBundleId,
  bookId: 'book-director-provider',
  routeId: 'route-main',
  branchId: 'branch-main',
  lane: 'mainline',
  status: 'active',
  participantCharIds: [scope.charId],
  directiveIds: [],
  routeSummary: '两人正在追查雾港夜间封航的缘由。',
  routeState: { hidden: 'ROUTE_STATE_PRIVATE_MUST_NOT_ENTER_PROMPT' },
  npcStates: [{
    id: 'npc-secret',
    name: '未公开人物',
    knownFacts: ['NPC_KNOWN_FACT_MUST_NOT_ENTER_PROMPT'],
    updatedAt: T0,
  }],
  openThreads: [],
  startedAt: T0 - 1_000,
  updatedAt: T0,
};
const confirmedScene: NarrativeScene = {
  id: 'scene-confirmed-provider',
  runId: run.id,
  status: 'confirmed',
  title: '旧钟楼的回声',
  location: '雾港旧钟楼',
  participantIds: ['user', scope.charId],
  constraints: [],
  beats: [],
  playedAt: T0 - 900,
  confirmedAt: T0 - 850,
};
const confirmedReceipt: NarrativeExperienceReceipt = {
  id: 'receipt-confirmed-provider',
  progressBundleId: scope.progressBundleId,
  runId: run.id,
  sceneId: confirmedScene.id,
  lane: run.lane,
  participantCharIds: [scope.charId],
  summary: '两人在旧钟楼确认封航前会有三次钟声。',
  acceptedFacts: ['旧钟楼会在封航前鸣钟。'],
  memoryPolicy: 'main_vault',
  confirmedByUser: true,
  playedAt: confirmedScene.playedAt!,
  confirmedAt: confirmedScene.confirmedAt,
};
const playedScene: NarrativeScene = {
  id: 'scene-played-provider',
  runId: run.id,
  status: 'played',
  title: '渡口边的短谈',
  location: '雾港渡口',
  participantIds: ['user', scope.charId],
  objective: '弄清最后一班渡船是否仍会出发',
  constraints: ['潮水正在上涨'],
  beats: Array.from({ length: 30 }, (_, index) => ({
    id: `beat-${index + 1}`,
    kind: index % 2 === 0 ? 'dialogue' as const : 'user_action' as const,
    authorId: index % 2 === 0 ? scope.charId : 'user',
    content: `第 ${index + 1} 个 canonical beat，记录渡口现场的实际互动。`,
    createdAt: T0 - 700 + index,
  })),
  playedAt: T0 - 600,
};
const narrative: NovelNarrativeState = {
  schemaVersion: 1,
  runs: [run],
  scenes: [confirmedScene, playedScene],
  receipts: [confirmedReceipt],
  activeRunId: run.id,
  updatedAt: T0,
};
const currentTruth = projectNarrativeDirectorCurrentTruth({ scope, narrative });
const characterWorldbookGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:director-provider',
  name: '雾港资料',
  owner: { kind: 'character', charId: scope.charId },
});

const legacyBook = (id: string, patch: Partial<Worldbook> = {}): Worldbook => ({
  id,
  title: id,
  content: `${id} 正文`,
  category: '测试',
  createdAt: T0 - 2_000,
  updatedAt: T0 - 2_000,
  ...patch,
});
const visibleWorldbook = createWorldbookEntry({
  book: legacyBook('visible-fog-port', {
    title: '雾港夜航规则',
    content: '雾港最后一班渡船通常在第三次钟声前离岸。',
    category: characterWorldbookGroup.name,
    group: characterWorldbookGroup,
  }),
  bindings: [{
    id: 'binding-visible-main',
    kind: 'mainline',
    scope,
    routeId: run.routeId,
  }],
  knowledgePolicy: { kind: 'public' },
  sourceRef: { kind: 'player', refId: 'manual:visible-fog-port' },
});
const directorOnlyWorldbook = createWorldbookEntry({
  book: legacyBook('hidden-fog-port', {
    title: '主持秘密',
    content: 'DIRECTOR_ONLY_MUST_NOT_ENTER_SCENE_SHELL_PROMPT',
    category: characterWorldbookGroup.name,
    group: characterWorldbookGroup,
  }),
  bindings: [{
    id: 'binding-hidden-main',
    kind: 'mainline',
    scope,
    routeId: run.routeId,
  }],
  knowledgePolicy: { kind: 'director_only' },
  sourceRef: { kind: 'player', refId: 'manual:hidden-fog-port' },
});
const character = {
  id: scope.charId,
  name: '测试角色',
  avatar: '',
  description: '',
  systemPrompt: '',
  memories: [],
  contextLimit: 20,
  mountedWorldbooks: [],
  mountedWorldbookGroupIds: [characterWorldbookGroup.id],
} as CharacterProfile;
const apiConfig: APIConfig = {
  baseUrl: 'https://system.example/v1',
  apiKey: 'system-secret',
  model: 'system-model',
};
const provider: AiTaskProviderRef = {
  role: 'system_director',
  binding: 'preset',
  presetId: 'system-preset',
  presetName: '系统主持',
  baseUrl: apiConfig.baseUrl,
  model: apiConfig.model,
};

assert.equal(AI_TASK_REGISTRY.narrative_scene_plan.role, 'system_director');
assert.equal(AI_TASK_REGISTRY.narrative_scene_plan.truthEffect, 'none');
assert.equal(AI_TASK_REGISTRY.narrative_scene_receipt_proposal.role, 'system_director');
assert.equal(AI_TASK_REGISTRY.narrative_scene_receipt_proposal.truthEffect, 'none');

await DB.deleteDB();

type ResponseMode =
  | 'scene_ok'
  | 'scene_forbidden'
  | 'scene_unknown_participant'
  | 'receipt_ok'
  | 'receipt_forbidden';
let responseMode: ResponseMode = 'scene_ok';
let lastPacket: Record<string, any> = {};
let lastPrompt = '';
let fetchCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  fetchCount += 1;
  const request = JSON.parse(String(init?.body || '{}')) as {
    messages?: Array<{ role: string; content: string }>;
  };
  lastPrompt = request.messages?.map(message => message.content).join('\n') || '';
  lastPacket = JSON.parse(
    request.messages?.find(message => message.role === 'user')?.content || '{}',
  );
  const common = {
    schemaVersion: 1,
    sourceFingerprint: lastPacket.sourceFingerprint,
  };
  const payload = responseMode === 'scene_forbidden'
    ? {
        ...common,
        title: '越权场景',
        constraints: [],
        participantIds: [scope.charId],
        runId: run.id,
      }
    : responseMode === 'scene_unknown_participant'
      ? {
          ...common,
          title: '陌生人越权加入',
          constraints: [],
          participantIds: [scope.charId, 'npc-not-allowed'],
        }
      : responseMode === 'receipt_ok'
        ? {
            ...common,
            summary: '两人在渡口确认末班船已准备离岸。',
            acceptedFacts: ['渡口工作人员已开始收起登船踏板。'],
            rejectedOrEditedFacts: ['末班船是否会准点离岸仍需玩家确认。'],
          }
        : responseMode === 'receipt_forbidden'
          ? {
              ...common,
              summary: '不应通过。',
              acceptedFacts: [],
              confirmedByUser: true,
            }
          : {
              ...common,
              title: '第三次钟声前的渡口',
              location: '雾港渡口',
              objective: '在船离岸前找到愿意说明封航缘由的人',
              constraints: ['开场时末班船仍未离岸', '玩家可以决定是否登船'],
              participantIds: ['user', scope.charId],
            };
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const shellCall = (
  requestId: string,
  overrides: Partial<Parameters<typeof generateNarrativeSceneShellProposal>[0]> = {},
) => generateNarrativeSceneShellProposal({
  requestId,
  scope,
  currentTruth,
  direction: '沿着封航线继续，但从一个玩家可以自由选择是否登船的现场开始。',
  availableParticipantIds: ['user', scope.charId, 'npc-dock-worker'],
  library: [visibleWorldbook, directorOnlyWorldbook],
  character,
  knowledgeSubjects: [{ kind: 'character', id: scope.charId }],
  explicitWorldbookRefs: [
    { entryId: visibleWorldbook.id, revisionId: getActiveWorldbookRevision(visibleWorldbook).id },
    { entryId: directorOnlyWorldbook.id, revisionId: getActiveWorldbookRevision(directorOnlyWorldbook).id },
  ],
  apiConfig,
  provider,
  now: T0 + 10,
  ...overrides,
});

try {
  const narrativeBefore = JSON.stringify(narrative);
  const shell = await shellCall('scene-shell:ok');
  assert.equal(shell.truthEffect, 'none');
  assert.equal(shell.proposal.title, '第三次钟声前的渡口');
  assert.deepEqual(shell.proposal.participantIds, ['user', scope.charId]);
  assert.equal(shell.worldbookProjection.items.length, 1);
  assert.equal(shell.worldbookProjection.items[0].entryId, visibleWorldbook.id);
  assert.doesNotMatch(lastPrompt, /DIRECTOR_ONLY_MUST_NOT_ENTER_SCENE_SHELL_PROMPT/u);
  assert.doesNotMatch(lastPrompt, /ROUTE_STATE_PRIVATE_MUST_NOT_ENTER_PROMPT/u);
  assert.doesNotMatch(lastPrompt, /NPC_KNOWN_FACT_MUST_NOT_ENTER_PROMPT/u);
  assert.doesNotMatch(lastPrompt, /"activeScene"/u);
  assert.equal(JSON.stringify(narrative), narrativeBefore, 'scene-shell proposal must not mutate narrative');
  assert.equal((await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scope)).length, 1);
  assert.deepEqual(await DB.getAllWorldGrowthCandidates(), []);

  responseMode = 'scene_forbidden';
  await assert.rejects(() => shellCall('scene-shell:forbidden'), /未授权字段：runId/u);
  assert.equal((await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scope)).length, 1);

  responseMode = 'scene_unknown_participant';
  await assert.rejects(
    () => shellCall('scene-shell:unknown-participant'),
    /未授权参与者 npc-not-allowed/u,
  );
  assert.equal((await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scope)).length, 1);

  const fetchesBeforeWrongProvider = fetchCount;
  await assert.rejects(() => generateNarrativeSceneShellProposal({
    requestId: 'scene-shell:wrong-provider',
    scope,
    currentTruth,
    direction: '继续当前线路。',
    availableParticipantIds: [scope.charId],
    library: [],
    character,
    knowledgeSubjects: [],
    apiConfig,
    provider: { ...provider, role: 'dialogue' },
  }), /只能使用系统主持 AI/u);
  assert.equal(fetchCount, fetchesBeforeWrongProvider);

  const activeScene: NarrativeScene = {
    ...playedScene,
    id: 'scene-currently-active',
    status: 'active',
    beats: [],
    playedAt: undefined,
  };
  const currentTruthWithActiveScene = projectNarrativeDirectorCurrentTruth({
    scope,
    narrative: {
      ...narrative,
      runs: [{ ...run, activeSceneId: activeScene.id }],
      scenes: [...narrative.scenes, activeScene],
    },
  });
  const fetchesBeforeActiveScene = fetchCount;
  await assert.rejects(
    () => shellCall('scene-shell:active-scene', { currentTruth: currentTruthWithActiveScene }),
    /已有 active scene/u,
  );
  assert.equal(fetchCount, fetchesBeforeActiveScene, 'active scene must fail before provider call');

  const fetchesBeforeForeignKnower = fetchCount;
  await assert.rejects(
    () => shellCall('scene-shell:foreign-knower', {
      knowledgeSubjects: [{ kind: 'npc', id: 'npc-dock-worker' }],
    }),
    /当前 exact scope 的角色或玩家主体/u,
  );
  assert.equal(fetchCount, fetchesBeforeForeignKnower, 'foreign knowers must fail before provider call');

  responseMode = 'receipt_ok';
  const receiptProposal = await generateNarrativeSceneReceiptProposal({
    requestId: 'scene-receipt:ok',
    scope,
    narrative,
    sceneId: playedScene.id,
    apiConfig,
    provider,
  });
  assert.equal(receiptProposal.truthEffect, 'none');
  assert.equal(receiptProposal.proposal.summary, '两人在渡口确认末班船已准备离岸。');
  assert.equal(lastPacket.beats.length, 24);
  assert.equal(lastPacket.omittedBeatCount, 6);
  assert.equal(JSON.stringify(narrative), narrativeBefore, 'receipt proposal must not mutate narrative');
  assert.equal(narrative.receipts.length, 1, 'receipt proposal must not confirm the scene');
  assert.equal((await indexedDbWorldbookPersistence.listProjectionDeliveryReceipts(scope)).length, 1);

  responseMode = 'receipt_forbidden';
  await assert.rejects(() => generateNarrativeSceneReceiptProposal({
    requestId: 'scene-receipt:forbidden',
    scope,
    narrative,
    sceneId: playedScene.id,
    apiConfig,
    provider,
  }), /未授权字段：confirmedByUser/u);
  assert.equal(narrative.receipts.length, 1);

  await assert.rejects(() => generateNarrativeSceneReceiptProposal({
    requestId: 'scene-receipt:wrong-scope',
    scope: { ...scope, personaMaskId: 'other-mask', charId: 'other-char' },
    narrative,
    sceneId: playedScene.id,
    apiConfig,
    provider,
  }), /跨越了 exact HistoryScope/u);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('system-director scene shell and played-scene receipt proposals: OK');
