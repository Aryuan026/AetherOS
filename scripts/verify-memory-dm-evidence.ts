import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import type { CharacterProfile, UserProfile } from '../types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import { dailyArchiveMessageFromLive, dailyArchiveMessageToInteractionEvidence } from '../domain/dailyArchive/contract.ts';
import {
  MEMORY_INTERPRETATION_SCHEMA_VERSION,
  createMemoryExtractionReceiptId,
  createMemoryExtractionRequestId,
} from '../domain/memoryInterpretation/index.ts';
import type {
  MemoryDMEvidenceReadPort,
  MemoryDMEvidenceRecord,
  MemoryDMExtractionReceipt,
  MemoryDMExtractionRequest,
  MemoryDMModelPort,
  MemoryInterpretationPass,
  MemoryInterpretationStorePort,
} from '../domain/memoryInterpretation/index.ts';
import { runAutoMemoryPass } from '../utils/memoryCore/autoMemory.ts';
import { memoryInterpretationStore } from '../utils/memoryCore/interpretationStore.ts';
import { runMemoryDMPass } from '../utils/memoryCore/memoryDm.ts';

const scopeA: HistoryScope = { progressBundleId: 'bundle-A', personaMaskId: 'mask-A', charId: 'char-shared' };
const scopeB: HistoryScope = { progressBundleId: 'bundle-B', personaMaskId: 'mask-B', charId: 'char-shared' };
const scopeC: HistoryScope = { progressBundleId: 'bundle-C', personaMaskId: 'mask-C', charId: 'char-shared' };

const record = (scope: HistoryScope, id: number, role: 'user' | 'assistant', content: string, revision = 1): MemoryDMEvidenceRecord => {
  const row = dailyArchiveMessageFromLive({
    scope,
    message: {
      id,
      charId: scope.charId,
      role,
      type: 'text',
      content,
      timestamp: Date.parse(`2026-07-1${id % 10}T10:00:00+08:00`),
      metadata: {
        source: id % 2 ? 'chat' : 'date',
        relationshipScope: scope,
        interactionId: `interaction-${scope.personaMaskId}-${id}`,
      },
    },
  });
  return {
    evidence: dailyArchiveMessageToInteractionEvidence({ ...row, revision }),
    content,
  };
};

class InMemoryStore implements MemoryInterpretationStorePort {
  passes: MemoryInterpretationPass[] = [];
  receipts: MemoryDMExtractionReceipt[] = [];
  claims = new Set<string>();
  async listPasses(scope: HistoryScope): Promise<MemoryInterpretationPass[]> {
    return this.passes.filter(pass => pass.scope.progressBundleId === scope.progressBundleId && pass.scope.personaMaskId === scope.personaMaskId && pass.scope.charId === scope.charId);
  }
  async listReceipts(scope: HistoryScope): Promise<MemoryDMExtractionReceipt[]> {
    return this.receipts.filter(receipt => receipt.scope.progressBundleId === scope.progressBundleId && receipt.scope.personaMaskId === scope.personaMaskId && receipt.scope.charId === scope.charId);
  }
  async claimRequest(request: MemoryDMExtractionRequest): Promise<boolean> {
    const key = `${request.scope.progressBundleId}:${request.scope.personaMaskId}:${request.scope.charId}:${request.extractor}:${request.promptVersion}:${request.evidenceSpan.sourceRevisionFingerprint}`;
    if (this.claims.has(key)) return false;
    this.claims.add(key);
    return true;
  }
  async appendCompleted(pass: MemoryInterpretationPass, receipt: MemoryDMExtractionReceipt): Promise<void> {
    this.passes.push(pass);
    this.receipts.push(receipt);
  }
  async appendFailure(_request: MemoryDMExtractionRequest, receipt: MemoryDMExtractionReceipt): Promise<void> {
    this.receipts.push(receipt);
  }
}

const recordsA = [
  record(scopeA, 1, 'user', '（拉住 A 的手腕）第一次见面别紧张。'),
  record(scopeA, 2, 'assistant', '（抿了抿唇）我知道了。'),
];
const recordsB = [record(scopeB, 3, 'user', '另一张面具第一次收到礼物。')];
const recordsC = [record(scopeC, 4, 'user', '第三张面具第一次一起旅行。')];
const evidencePort: MemoryDMEvidenceReadPort = {
  listActiveEvidence: async ({ scope }) => (
    scope.personaMaskId === scopeA.personaMaskId ? recordsA : recordsB
  ),
};
const store = new InMemoryStore();
let modelSawEvidenceIds: string[] = [];
const modelPort: MemoryDMModelPort = {
  run: async ({ request }) => {
    modelSawEvidenceIds = [...request.evidenceSpan.evidenceIds];
    return {
      modelId: 'fixture-model',
      text: JSON.stringify({
        candidates: [
          {
            target: 'narrative_proposal',
            title: '多人场景',
            summary: 'A、B 与 C 出现在同一段轻剧情里。',
            knowledge: 'shared',
            temporalClass: 'live',
            sourceEvidenceIds: [request.evidenceSpan.evidenceIds[0]],
          },
          {
            target: 'relationship_memory',
            title: '同源关系候选',
            summary: '同一段证据也可以支持关系记忆候选。',
            knowledge: 'relationship_private',
            temporalClass: 'live',
            sourceEvidenceIds: [request.evidenceSpan.evidenceIds[0]],
          },
          {
            target: 'relationship_memory',
            title: '越界来源',
            summary: '这条必须被拒绝。',
            sourceEvidenceIds: [request.evidenceSpan.evidenceIds[0], 'interaction-evidence:v1:foreign'],
          },
        ],
      }),
      usage: { providerPromptTokens: 120, providerCompletionTokens: 40, providerTotalTokens: 160 },
    };
  },
};
const char: CharacterProfile = {
  id: scopeA.charId,
  name: '旧日角色',
  avatar: '',
  description: '',
  systemPrompt: '',
  memories: [],
};
const userProfile = {
  name: 'User', avatar: '', bio: '',
  activePersonaMaskId: scopeA.personaMaskId,
  activeProgressBundleId: scopeA.progressBundleId,
  personaMasks: [{
    id: scopeA.personaMaskId, label: 'A', name: 'User', avatar: '', bio: '',
    linkedCharacterIds: [scopeA.charId], progressBundleId: scopeA.progressBundleId,
    createdAt: 1, updatedAt: 1,
  }],
  progressBundles: [{
    id: scopeA.progressBundleId, maskId: scopeA.personaMaskId, label: 'A',
    surfacePolicy: {}, createdAt: 1, updatedAt: 1,
  }],
} as UserProfile;

const result = await runMemoryDMPass({
  char,
  userProfile,
  relationshipScope: scopeA,
  apiConfig: { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'fixture-model' },
  trigger: 'manual',
  evidencePort,
  modelPort,
  interpretationStore: store,
  analysisRunId: 'fixture-run-a',
  now: Date.parse('2026-07-19T12:00:00+08:00'),
});
assert.equal(result.ran, true);
assert.equal(result.candidateCount, 2);
assert.equal(result.rejectedCandidateCount, 1);
assert.deepEqual(modelSawEvidenceIds, recordsA.map(item => item.evidence.evidenceId));
assert.ok(modelSawEvidenceIds.every(id => !id.includes(encodeURIComponent(scopeB.personaMaskId))), 'model input must not cross masks');
assert.equal(result.pass?.truthEffect, 'none');
assert.equal(result.receipt?.truthEffect, 'none');
assert.deepEqual(result.pass?.candidates[0].sourceEvidenceIds, [recordsA[0].evidence.evidenceId]);
assert.deepEqual(result.pass?.candidates[1].sourceEvidenceIds, [recordsA[0].evidence.evidenceId]);
assert.equal(result.receipt?.usage.estimatorId, 'unicode_chars_div_3_v1');
assert.ok((result.receipt?.usage.promptCharCount || 0) > result.receipt!.usage.inputCharCount);
assert.equal(result.appliedMemoryCount, 0);
assert.equal(result.appliedTimebookCount, 0);
assert.equal(result.appliedCalendarCount, 0);

const revision2 = record(scopeA, 1, 'user', '（拉住 A 的手腕）第一次见面，后来补了一句。', 2);
const revisionPort: MemoryDMEvidenceReadPort = {
  listActiveEvidence: async () => [revision2, recordsA[1]],
};
const revisionResult = await runMemoryDMPass({
  char,
  userProfile,
  relationshipScope: scopeA,
  apiConfig: { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'fixture-model' },
  trigger: 'manual',
  evidencePort: revisionPort,
  modelPort,
  interpretationStore: store,
  analysisRunId: 'fixture-run-revision-2',
  now: Date.parse('2026-07-19T12:05:00+08:00'),
});
assert.equal(revisionResult.ran, true, 'a new source revision must be eligible for a new interpretation pass');
assert.ok(revisionResult.pass?.evidenceSpan.evidenceIds.includes(revision2.evidence.evidenceId));

const repeatResult = await runMemoryDMPass({
  char,
  userProfile,
  relationshipScope: scopeA,
  apiConfig: { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'fixture-model' },
  trigger: 'manual',
  evidencePort,
  modelPort,
  interpretationStore: store,
  analysisRunId: 'fixture-run-explicit-repeat',
  evidenceIds: recordsA.map(item => item.evidence.evidenceId),
  now: Date.parse('2026-07-19T12:07:00+08:00'),
});
assert.equal(repeatResult.ran, true, 'explicit calendar selection must allow intentional re-analysis');
assert.deepEqual(repeatResult.pass?.evidenceSpan.evidenceIds, recordsA.map(item => item.evidence.evidenceId));

const unlinkedResult = await runMemoryDMPass({
  char,
  userProfile: {
    ...userProfile,
    personaMasks: userProfile.personaMasks?.map(mask => ({ ...mask, linkedCharacterIds: [] })),
  } as UserProfile,
  relationshipScope: scopeA,
  apiConfig: { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'fixture-model' },
  trigger: 'manual',
  evidencePort,
  modelPort,
  interpretationStore: new InMemoryStore(),
  analysisRunId: 'fixture-run-unlinked',
});
assert.equal(unlinkedResult.ran, false);
assert.equal(unlinkedResult.skippedReason, 'scope_not_linked');

const heuristicStore = new InMemoryStore();
const heuristicResult = await runAutoMemoryPass({
  characters: [char],
  userProfile,
  trigger: 'manual',
  includeToday: true,
  evidencePort,
  interpretationStore: heuristicStore,
  now: Date.parse('2026-07-19T12:10:00+08:00'),
});
assert.equal(heuristicResult.candidateCount, 1);
assert.equal(heuristicResult.savedTimebookCount, 0);
assert.equal(heuristicStore.passes[0]?.truthEffect, 'none');
assert.equal(heuristicStore.passes[0]?.candidates[0]?.target, 'timebook');
assert.equal(heuristicStore.receipts[0]?.truthEffect, 'none');

const repeatedHeuristicResult = await runAutoMemoryPass({
  characters: [char],
  userProfile,
  trigger: 'manual',
  includeToday: true,
  evidencePort,
  interpretationStore: heuristicStore,
  now: Date.parse('2026-07-19T12:11:00+08:00'),
});
assert.equal(repeatedHeuristicResult.candidateCount, 0, 'automatic heuristic must not reinterpret unchanged evidence');

const unlinkedHeuristicResult = await runAutoMemoryPass({
  characters: [char],
  userProfile: {
    ...userProfile,
    personaMasks: userProfile.personaMasks?.map(mask => ({ ...mask, linkedCharacterIds: [] })),
  } as UserProfile,
  trigger: 'manual',
  includeToday: true,
  evidencePort,
  interpretationStore: new InMemoryStore(),
  now: Date.parse('2026-07-19T12:12:00+08:00'),
});
assert.equal(unlinkedHeuristicResult.candidateCount, 0, 'unlinked characters must not enter heuristic interpretation');

await memoryInterpretationStore.appendCompleted(result.pass!, result.receipt!);
const [persistedPasses, persistedReceipts] = await Promise.all([
  memoryInterpretationStore.listPasses(scopeA),
  memoryInterpretationStore.listReceipts(scopeA),
]);
assert.deepEqual(persistedPasses.map(pass => pass.id), [result.pass!.id]);
assert.deepEqual(persistedReceipts.map(receipt => receipt.id), [result.receipt!.id]);

const claimRequest = (analysisRunId: string): MemoryDMExtractionRequest => {
  const base = {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    analysisRunId,
    scope: { ...scopeA },
    trigger: 'auto' as const,
    evidenceSpan: result.pass!.evidenceSpan,
    extractor: 'model' as const,
    promptVersion: 'claim-fixture-v1',
    outputSchemaVersion: 'memory-candidates-v1',
    requestedAt: Date.parse('2026-07-19T12:13:00+08:00'),
  };
  return {
    ...base,
    id: createMemoryExtractionRequestId({ scope: base.scope, analysisRunId }),
  };
};
const claimRun1 = claimRequest('claim-run-1');
const claimRun2 = claimRequest('claim-run-2');
const claimOutcomes = await Promise.all([
  memoryInterpretationStore.claimRequest(claimRun1),
  memoryInterpretationStore.claimRequest(claimRun2),
]);
assert.equal(claimOutcomes.filter(Boolean).length, 1, 'concurrent automatic requests must acquire exactly one claim');
const claimedRequest = claimOutcomes[0] ? claimRun1 : claimRun2;
const retryRequest = claimOutcomes[0] ? claimRun2 : claimRun1;
await memoryInterpretationStore.appendFailure(claimedRequest, {
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  id: createMemoryExtractionReceiptId(claimedRequest.id),
  requestId: claimedRequest.id,
  analysisRunId: claimedRequest.analysisRunId,
  scope: { ...scopeA },
  evidenceSpan: claimedRequest.evidenceSpan,
  status: 'failed',
  truthEffect: 'none',
  candidateIds: [],
  rejectedCandidateCount: 0,
  reason: 'fixture_failure',
  extractor: 'model',
  promptVersion: claimedRequest.promptVersion,
  outputSchemaVersion: claimedRequest.outputSchemaVersion,
  usage: { evidenceCount: claimedRequest.evidenceSpan.evidenceIds.length, inputCharCount: 0 },
  createdAt: Date.now(),
});
assert.equal(await memoryInterpretationStore.claimRequest(retryRequest), true, 'failed automatic claims must be retryable');

const productionHeuristicResult = await runAutoMemoryPass({
  characters: [char],
  userProfile: {
    ...userProfile,
    activePersonaMaskId: scopeB.personaMaskId,
    activeProgressBundleId: scopeB.progressBundleId,
    personaMasks: [{
      id: scopeB.personaMaskId, label: 'B', name: 'User B', avatar: '', bio: '',
      linkedCharacterIds: [scopeB.charId], progressBundleId: scopeB.progressBundleId,
      createdAt: 1, updatedAt: 1,
    }],
    progressBundles: [{
      id: scopeB.progressBundleId, maskId: scopeB.personaMaskId, label: 'B',
      surfacePolicy: {}, createdAt: 1, updatedAt: 1,
    }],
  } as UserProfile,
  trigger: 'manual',
  includeToday: true,
  evidencePort,
  interpretationStore: memoryInterpretationStore,
  now: Date.parse('2026-07-19T12:15:00+08:00'),
});
assert.equal(productionHeuristicResult.candidateCount, 1);
assert.equal((await memoryInterpretationStore.listPasses(scopeB)).length, 1);

const userProfileC = {
  ...userProfile,
  activePersonaMaskId: scopeC.personaMaskId,
  activeProgressBundleId: scopeC.progressBundleId,
  personaMasks: [{
    id: scopeC.personaMaskId, label: 'C', name: 'User C', avatar: '', bio: '',
    linkedCharacterIds: [scopeC.charId], progressBundleId: scopeC.progressBundleId,
    createdAt: 1, updatedAt: 1,
  }],
  progressBundles: [{
    id: scopeC.progressBundleId, maskId: scopeC.personaMaskId, label: 'C',
    surfacePolicy: {}, createdAt: 1, updatedAt: 1,
  }],
} as UserProfile;
const evidencePortC: MemoryDMEvidenceReadPort = { listActiveEvidence: async () => recordsC };
let rejectFirstCompletion = true;
const failOnceStore: MemoryInterpretationStorePort = {
  ...memoryInterpretationStore,
  appendCompleted: async (pass, receipt) => {
    if (rejectFirstCompletion) {
      rejectFirstCompletion = false;
      throw new Error('fixture_commit_failure');
    }
    await memoryInterpretationStore.appendCompleted(pass, receipt);
  },
};
const firstAttempt = await runAutoMemoryPass({
  characters: [char],
  userProfile: userProfileC,
  trigger: 'auto',
  includeToday: true,
  evidencePort: evidencePortC,
  interpretationStore: failOnceStore,
  now: Date.parse('2026-07-19T12:16:00+08:00'),
});
assert.equal(firstAttempt.failedCount, 1);
const secondAttempt = await runAutoMemoryPass({
  characters: [char],
  userProfile: userProfileC,
  trigger: 'auto',
  includeToday: true,
  evidencePort: evidencePortC,
  interpretationStore: failOnceStore,
  now: Date.parse('2026-07-19T12:16:00+08:00'),
});
assert.equal(secondAttempt.candidateCount, 1, 'same automatic claim must succeed after a failed attempt');
const scopeCReceipts = await memoryInterpretationStore.listReceipts(scopeC);
assert.equal(scopeCReceipts.length, 2);
assert.notEqual(scopeCReceipts[0].id, scopeCReceipts[1].id, 'failure and retry receipts need unique attempt ids');
assert.deepEqual(new Set(scopeCReceipts.map(receipt => receipt.status)), new Set(['failed', 'completed']));

const dbSource = readFileSync(new URL('../utils/db.ts', import.meta.url), 'utf8');
assert.match(
  dbSource,
  /saveAsset:[\s\S]*transaction\.oncomplete = \(\) => resolve\(\)/u,
  'saveAsset must resolve after its IndexedDB transaction commits',
);
assert.match(dbSource, /updateAsset:[\s\S]*transaction\.oncomplete/u, 'atomic asset updates must commit in one transaction');

const storeSource = readFileSync(new URL('../utils/memoryCore/interpretationStore.ts', import.meta.url), 'utf8');
assert.ok(!storeSource.includes('appendPass:'), 'production port must not expose orphan pass writes');
assert.ok(!storeSource.includes('appendReceipt:'), 'production port must not expose orphan receipt writes');

const evidencePortSource = readFileSync(new URL('../utils/memoryCore/evidencePort.ts', import.meta.url), 'utf8');
assert.ok(evidencePortSource.includes('listDailyArchiveDocumentsForScope'));
assert.ok(!evidencePortSource.includes('listAllDailyArchiveDocuments'), 'memory reads must not hydrate every relationship before filtering');

for (const [path, forbidden] of [
  ['../utils/memoryCore/memoryDm.ts', ['getMessagesByCharId', 'saveCharacter', 'saveAnniversary', 'saveCompanionWakeupRule']],
  ['../utils/memoryCore/autoMemory.ts', ['getMessagesByCharId', 'saveCharacter', 'saveAnniversary', 'saveCompanionWakeupRule']],
] as const) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  forbidden.forEach(token => assert.ok(!source.includes(token), `${path} must not contain direct write/read bypass ${token}`));
}

console.log('memory DM evidence OK: exact scope, intentional re-analysis, unlinked isolation, provenance receipts, and zero target writes');
