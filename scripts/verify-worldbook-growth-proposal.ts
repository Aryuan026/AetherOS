import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import type {
  APIConfig,
  CharacterProfile,
  Worldbook,
} from '../types.ts';
import type { AiTaskProviderRef } from '../domain/aiRuntime/types.ts';
import { AI_TASK_REGISTRY } from '../domain/aiRuntime/registry.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  projectNarrativeDirectorCurrentTruth,
} from '../domain/narrative/directorContext.ts';
import type {
  NarrativeExperienceReceipt,
  NarrativeRun,
  NarrativeScene,
  NovelNarrativeState,
} from '../domain/narrative/types.ts';
import {
  createNarrativeWorldGrowthCandidates,
  createWorldbookEntry,
  getActiveWorldbookRevision,
} from '../domain/worldbook/index.ts';
import { DB } from '../utils/db.ts';
import {
  generateAndStoreNarrativeWorldGrowthProposals,
} from '../utils/narrativeWorldGrowthProposal.ts';
import { indexedDbWorldbookPersistence } from '../utils/worldbookPersistence.ts';
import { createWorldbookGroupAssignment } from '../utils/worldbookGroups.ts';

const T0 = 1_776_700_000_000;
const scope: HistoryScope = {
  progressBundleId: 'bundle-growth-proposal',
  personaMaskId: 'mask-growth-proposal',
  charId: 'char-growth-proposal',
};
const run: NarrativeRun = {
  id: 'run-growth-proposal',
  progressBundleId: scope.progressBundleId,
  bookId: 'book-growth-proposal',
  routeId: 'route-main',
  branchId: 'branch-main',
  lane: 'mainline',
  status: 'active',
  participantCharIds: [scope.charId],
  directiveIds: [],
  routeState: {},
  npcStates: [],
  openThreads: [],
  startedAt: T0 - 100,
  updatedAt: T0,
};
const scene: NarrativeScene = {
  id: 'scene-growth-proposal',
  runId: run.id,
  status: 'confirmed',
  title: '确认潮汐钟规则',
  location: '雾港钟楼',
  participantIds: ['user', scope.charId],
  constraints: [],
  beats: [],
  playedAt: T0 - 80,
  confirmedAt: T0 - 70,
};
const receipt: NarrativeExperienceReceipt = {
  id: 'receipt-growth-proposal',
  progressBundleId: scope.progressBundleId,
  runId: run.id,
  sceneId: scene.id,
  lane: run.lane,
  participantCharIds: [scope.charId],
  summary: '两人在雾港确认潮汐钟会在封港前鸣响。',
  acceptedFacts: ['DO_NOT_AUTO_COPY_RECEIPT_FACT'],
  memoryPolicy: 'main_vault',
  confirmedByUser: true,
  playedAt: scene.playedAt!,
  confirmedAt: scene.confirmedAt,
};
const secondaryScene: NarrativeScene = {
  ...scene,
  id: 'scene-growth-proposal-secondary',
  title: '确认雾港渡船时刻',
  playedAt: T0 - 60,
  confirmedAt: T0 - 50,
};
const secondaryReceipt: NarrativeExperienceReceipt = {
  ...receipt,
  id: 'receipt-growth-proposal-secondary',
  sceneId: secondaryScene.id,
  summary: '两人在雾港确认渡船会在退潮后开放。',
  acceptedFacts: [],
  playedAt: secondaryScene.playedAt!,
  confirmedAt: secondaryScene.confirmedAt,
};
const narrative: NovelNarrativeState = {
  schemaVersion: 1,
  runs: [run],
  scenes: [scene, secondaryScene],
  receipts: [receipt, secondaryReceipt],
  activeRunId: run.id,
  updatedAt: T0,
};
const currentTruth = projectNarrativeDirectorCurrentTruth({ scope, narrative });
const characterWorldbookGroup = createWorldbookGroupAssignment({
  id: 'worldbook-group:growth-proposal',
  name: '雾港资料',
  owner: { kind: 'character', charId: scope.charId },
});

const legacyBook = (id: string, patch: Partial<Worldbook> = {}): Worldbook => ({
  id,
  title: id,
  content: `${id} 正文`,
  category: '测试',
  createdAt: T0 - 1_000,
  updatedAt: T0 - 1_000,
  ...patch,
});
const visibleWorldbook = createWorldbookEntry({
  book: legacyBook('visible-tide-rule', {
    title: '雾港潮汐钟',
    content: '雾港潮汐钟与封港时刻有关，鸣响后港门进入关闭流程。',
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
  sourceRef: { kind: 'player', refId: 'manual:visible-tide-rule' },
});
const directorOnlyWorldbook = createWorldbookEntry({
  book: legacyBook('director-only-tide-secret', {
    title: '后台秘密',
    content: 'DIRECTOR_ONLY_MUST_NOT_ENTER_PROPOSAL_PROMPT',
    category: characterWorldbookGroup.name,
    group: characterWorldbookGroup,
  }),
  bindings: [{
    id: 'binding-director-main',
    kind: 'mainline',
    scope,
    routeId: run.routeId,
  }],
  knowledgePolicy: { kind: 'director_only' },
  sourceRef: { kind: 'player', refId: 'manual:director-only-tide-secret' },
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
  apiKey: 'secret',
  model: 'system-model',
};
const provider: AiTaskProviderRef = {
  role: 'system_director',
  binding: 'preset',
  presetId: 'system-preset',
  presetName: '结构主持',
  baseUrl: apiConfig.baseUrl,
  model: apiConfig.model,
};

assert.equal(AI_TASK_REGISTRY.narrative_world_growth_proposal.role, 'system_director');
assert.equal(AI_TASK_REGISTRY.narrative_world_growth_proposal.truthEffect, 'none');

await DB.deleteDB();

type ResponseMode = 'success' | 'none' | 'forbidden' | 'director_only';
let responseMode: ResponseMode = 'success';
let lastPrompt = '';
let fetchCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  fetchCount += 1;
  const request = JSON.parse(String(init?.body || '{}')) as {
    messages?: Array<{ role: string; content: string }>;
  };
  lastPrompt = request.messages?.map(message => message.content).join('\n') || '';
  const userPacket = JSON.parse(request.messages?.find(message => message.role === 'user')?.content || '{}');
  const base = {
    schemaVersion: 1,
    sourceFingerprint: userPacket.sourceFingerprint,
  };
  const payload = responseMode === 'none'
    ? { ...base, proposals: [], noProposalReason: '这段经历没有新增的长期世界规则。' }
    : responseMode === 'forbidden'
      ? {
          ...base,
          proposals: [{
            proposalId: 'forbidden-binding',
            title: '越权',
            content: '不应保存。',
            category: '测试',
            knowledgePolicy: { kind: 'public' },
            evidenceRefs: ['receipt-summary'],
            bindings: [{ kind: 'global' }],
          }],
        }
      : responseMode === 'director_only'
        ? {
            ...base,
            proposals: [{
              proposalId: 'hidden-candidate',
              title: '不可审阅候选',
              content: '第一阶段不应保存。',
              category: '测试',
              knowledgePolicy: { kind: 'director_only' },
              evidenceRefs: ['receipt-summary'],
            }],
          }
        : {
            ...base,
            proposals: [{
              proposalId: 'fog-port-bell-process',
              title: '雾港封港鸣钟流程',
              content: '雾港会以潮汐钟作为封港流程的公开信号。',
              category: '地点规则',
              aliases: ['封港钟'],
              activationHint: '雾港封港或潮汐钟相关场景',
              knowledgePolicy: { kind: 'public' },
              supplementsEntryIds: [visibleWorldbook.id],
              evidenceRefs: ['receipt-summary'],
            }],
          };
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const call = (
  requestId: string,
  now: number,
  source: { receiptId: string; runId: string; sceneId: string } = {
    receiptId: receipt.id,
    runId: run.id,
    sceneId: scene.id,
  },
) => generateAndStoreNarrativeWorldGrowthProposals({
  requestId,
  scope,
  currentTruth,
  source,
  confirmedExcerpt: '钟声响起后，港门依次关闭。',
  library: [visibleWorldbook, directorOnlyWorldbook],
  character,
  knowledgeSubjects: [{ kind: 'character', id: scope.charId }],
  explicitWorldbookRefs: [
    { entryId: visibleWorldbook.id, revisionId: getActiveWorldbookRevision(visibleWorldbook).id },
    { entryId: directorOnlyWorldbook.id, revisionId: getActiveWorldbookRevision(directorOnlyWorldbook).id },
  ],
  apiConfig,
  provider,
  now,
});

try {
  const stored = await call('growth-proposal:success', T0 + 10);
  assert.equal(stored.status, 'stored');
  assert.equal(stored.candidates.length, 1);
  assert.equal(stored.candidates[0].status, 'pending');
  assert.equal(stored.candidates[0].truthEffect, 'none');
  assert.equal(stored.candidates[0].draft.bindings[0].kind, 'mainline');
  assert.deepEqual(stored.candidates[0].draft.bindings[0].scope, scope);
  assert.equal(stored.candidates[0].draft.knowledgePolicy.kind, 'public');
  assert.doesNotMatch(JSON.stringify(stored.candidates), /DO_NOT_AUTO_COPY_RECEIPT_FACT/u);
  assert.doesNotMatch(lastPrompt, /DIRECTOR_ONLY_MUST_NOT_ENTER_PROPOSAL_PROMPT/u);
  assert.deepEqual(stored.worldbookProjection.items.map(item => item.entryId), [visibleWorldbook.id]);
  assert.equal((await indexedDbWorldbookPersistence.listGrowthCandidates()).length, 1);

  const requestsAfterStoredBatch = fetchCount;
  const existing = await call('growth-proposal:repeat', T0 + 15);
  assert.equal(existing.status, 'existing_batch');
  assert.equal(existing.candidates.length, 1);
  assert.equal(fetchCount, requestsAfterStoredBatch, 'existing receipt batches must skip the model call');

  responseMode = 'none';
  const secondarySource = {
    receiptId: secondaryReceipt.id,
    runId: run.id,
    sceneId: secondaryScene.id,
  };
  const none = await call('growth-proposal:none', T0 + 20, secondarySource);
  assert.equal(none.status, 'no_proposal');
  assert.deepEqual(none.candidates, []);
  assert.equal((await indexedDbWorldbookPersistence.listGrowthCandidates()).length, 1);

  responseMode = 'forbidden';
  await assert.rejects(
    () => call('growth-proposal:forbidden', T0 + 30, secondarySource),
    /未授权字段：bindings/u,
  );
  assert.equal((await indexedDbWorldbookPersistence.listGrowthCandidates()).length, 1);

  responseMode = 'director_only';
  await assert.rejects(
    () => call('growth-proposal:director-only', T0 + 40, secondarySource),
    /不允许生成仅系统主持可见/u,
  );
  assert.equal((await indexedDbWorldbookPersistence.listGrowthCandidates()).length, 1);

  await assert.rejects(() => generateAndStoreNarrativeWorldGrowthProposals({
    requestId: 'growth-proposal:dialogue-provider',
    scope,
    currentTruth,
    source: { receiptId: receipt.id, runId: run.id, sceneId: scene.id },
    library: [visibleWorldbook],
    character,
    knowledgeSubjects: [],
    apiConfig,
    provider: { ...provider, role: 'dialogue' },
  }), /只能使用系统主持 AI/u);

  const conflictingReceiptBatch = createNarrativeWorldGrowthCandidates({
    scope,
    currentTruth,
    source: { receiptId: receipt.id, runId: run.id, sceneId: scene.id },
    proposedDrafts: [{
      proposalId: 'different-model-id-on-retry',
      title: '重复批次',
      content: '同一确认回执不得因为模型换了 proposalId 而新增第二批。',
      category: '测试',
      knowledgePolicy: { kind: 'public' },
    }],
    createdAt: T0 + 45,
  });
  await assert.rejects(
    () => indexedDbWorldbookPersistence.saveGrowthCandidatesAtomically(conflictingReceiptBatch),
    /already has a World growth candidate batch/u,
  );
  assert.equal((await indexedDbWorldbookPersistence.listGrowthCandidates()).length, 1);

  const rollbackCandidates = createNarrativeWorldGrowthCandidates({
    scope,
    currentTruth,
    source: secondarySource,
    proposedDrafts: [{
      proposalId: 'rollback-one',
      title: '回滚一',
      content: '第一条不应残留。',
      category: '回滚',
      knowledgePolicy: { kind: 'public' },
    }, {
      proposalId: 'rollback-two',
      title: '回滚二',
      content: '第二条触发失败。',
      category: '回滚',
      knowledgePolicy: { kind: 'public' },
    }],
    createdAt: T0 + 50,
  });
  const originalPut = IDBObjectStore.prototype.put;
  let candidateWrites = 0;
  (IDBObjectStore.prototype as any).put = function patchedPut(
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (this.name === 'worldbook_growth_candidates') {
      candidateWrites += 1;
      if (candidateWrites === 2) {
        throw new DOMException('fixture forces second candidate write failure', 'DataCloneError');
      }
    }
    return key === undefined
      ? originalPut.call(this, value)
      : originalPut.call(this, value, key);
  };
  try {
    await assert.rejects(() => (
      indexedDbWorldbookPersistence.saveGrowthCandidatesAtomically(rollbackCandidates)
    ));
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  const afterRollback = await indexedDbWorldbookPersistence.listGrowthCandidates();
  assert.equal(afterRollback.length, 1);
  assert.equal(afterRollback.some(candidate => candidate.id.includes('rollback-')), false);

  await indexedDbWorldbookPersistence.saveGrowthCandidatesAtomically(rollbackCandidates);
  assert.equal((await indexedDbWorldbookPersistence.listGrowthCandidates()).length, 3);
  await indexedDbWorldbookPersistence.saveGrowthCandidatesAtomically(rollbackCandidates);
  assert.equal(
    (await indexedDbWorldbookPersistence.listGrowthCandidates()).length,
    3,
    'an exact batch replay is idempotent',
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('system-director Worldbook growth proposals and atomic candidate batches: OK');
