import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CharacterProfile, UserProfile } from '../types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import { dailyArchiveMessageFromLive, dailyArchiveMessageToInteractionEvidence } from '../domain/dailyArchive/contract.ts';
import type {
  MemoryDMEvidenceReadPort,
  MemoryDMEvidenceRecord,
  MemoryDMExtractionReceipt,
  MemoryDMModelPort,
  MemoryInterpretationPass,
  MemoryInterpretationStorePort,
} from '../domain/memoryInterpretation/index.ts';
import { runAutoMemoryPass } from '../utils/memoryCore/autoMemory.ts';
import { runMemoryDMPass } from '../utils/memoryCore/memoryDm.ts';

const scopeA: HistoryScope = { progressBundleId: 'bundle-A', personaMaskId: 'mask-A', charId: 'char-shared' };
const scopeB: HistoryScope = { progressBundleId: 'bundle-B', personaMaskId: 'mask-B', charId: 'char-shared' };

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
  async listPasses(scope: HistoryScope): Promise<MemoryInterpretationPass[]> {
    return this.passes.filter(pass => pass.scope.progressBundleId === scope.progressBundleId && pass.scope.personaMaskId === scope.personaMaskId && pass.scope.charId === scope.charId);
  }
  async listReceipts(scope: HistoryScope): Promise<MemoryDMExtractionReceipt[]> {
    return this.receipts.filter(receipt => receipt.scope.progressBundleId === scope.progressBundleId && receipt.scope.personaMaskId === scope.personaMaskId && receipt.scope.charId === scope.charId);
  }
  async appendPass(pass: MemoryInterpretationPass): Promise<void> { this.passes.push(pass); }
  async appendReceipt(receipt: MemoryDMExtractionReceipt): Promise<void> { this.receipts.push(receipt); }
  async appendCompleted(pass: MemoryInterpretationPass, receipt: MemoryDMExtractionReceipt): Promise<void> {
    this.passes.push(pass);
    this.receipts.push(receipt);
  }
}

const recordsA = [
  record(scopeA, 1, 'user', '（拉住 A 的手腕）第一次见面别紧张。'),
  record(scopeA, 2, 'assistant', '（抿了抿唇）我知道了。'),
];
const recordsB = [record(scopeB, 3, 'user', '另一张面具的私密内容。')];
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
assert.equal(result.candidateCount, 1);
assert.equal(result.rejectedCandidateCount, 1);
assert.deepEqual(modelSawEvidenceIds, recordsA.map(item => item.evidence.evidenceId));
assert.ok(modelSawEvidenceIds.every(id => !id.includes(encodeURIComponent(scopeB.personaMaskId))), 'model input must not cross masks');
assert.equal(result.pass?.truthEffect, 'none');
assert.equal(result.receipt?.truthEffect, 'none');
assert.deepEqual(result.pass?.candidates[0].sourceEvidenceIds, [recordsA[0].evidence.evidenceId]);
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

for (const [path, forbidden] of [
  ['../utils/memoryCore/memoryDm.ts', ['getMessagesByCharId', 'saveCharacter', 'saveAnniversary', 'saveCompanionWakeupRule']],
  ['../utils/memoryCore/autoMemory.ts', ['getMessagesByCharId', 'saveCharacter', 'saveAnniversary', 'saveCompanionWakeupRule']],
] as const) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  forbidden.forEach(token => assert.ok(!source.includes(token), `${path} must not contain direct write/read bypass ${token}`));
}

console.log('memory DM evidence OK: exact scope, intentional re-analysis, unlinked isolation, provenance receipts, and zero target writes');
