import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import { dailyArchiveMessageFromLive, dailyArchiveMessageToInteractionEvidence } from '../domain/dailyArchive/contract.ts';
import { createEvidenceSpan } from '../domain/interactionEvidence/index.ts';
import {
  MEMORY_INTERPRETATION_SCHEMA_VERSION,
  assertPromotedMemoryRecord,
  createPromotedMemoryRecordId,
  type MemoryDMEvidenceReadPort,
  type MemoryPromotionStorePort,
  type PromotedMemoryRecord,
} from '../domain/memoryInterpretation/index.ts';
import {
  MEMORY_PROJECTION_SCHEMA_VERSION,
  createMemoryProjectionCommandId,
  type MemoryProjectionCommand,
} from '../domain/memoryProjection/index.ts';
import {
  createMemoryProjectionService,
  listMemoryProjectionViews,
  resolveMemoryProjectionSourceDate,
} from '../utils/memoryCore/memoryProjection.ts';
import { memoryProjectionStore } from '../utils/memoryCore/projectionStore.ts';

const scopeA: HistoryScope = { progressBundleId: 'bundle-A', personaMaskId: 'mask-A', charId: 'char-shared' };
const scopeB: HistoryScope = { progressBundleId: 'bundle-B', personaMaskId: 'mask-B', charId: 'char-shared' };

const archiveRow = dailyArchiveMessageFromLive({
  scope: scopeA,
  message: {
    id: 1,
    charId: scopeA.charId,
    role: 'user',
    type: 'text',
    content: '那天我们一起看了雨。',
    timestamp: Date.parse('2026-07-12T21:30:00+08:00'),
    metadata: {
      source: 'history_import',
      temporalClass: 'historical',
      relationshipScope: scopeA,
      interactionId: 'projection-source-1',
    },
  },
});
const evidenceRecord = {
  evidence: dailyArchiveMessageToInteractionEvidence(archiveRow),
  content: archiveRow.content,
};
const evidenceSpan = await createEvidenceSpan({ scope: scopeA, evidence: [evidenceRecord.evidence] });

const sourceAssessment = {
  classifierVersion: 'interaction-provenance-v1' as const,
  sourceClass: 'historical_material' as const,
  evidenceIds: [evidenceRecord.evidence.evidenceId],
  surfaces: [evidenceRecord.evidence.source.surface],
  media: [evidenceRecord.evidence.source.medium],
  producers: [evidenceRecord.evidence.producer],
  transportRoles: [evidenceRecord.evidence.transportRole],
};

const baseRecord = {
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  scope: scopeA,
  knowledge: 'shared' as const,
  temporalClass: 'historical' as const,
  interpretationAuthority: 'model_interpretation' as const,
  claimClass: 'conversation_fact' as const,
  sourceAssessment,
  promotionTrigger: 'manual' as const,
  promotionReceiptId: 'promotion-receipt-fixture',
  manualDecision: {
    id: 'manual-decision-fixture',
    scope: scopeA,
    candidateId: 'candidate-fixture',
    decision: 'remember_historical' as const,
    confirmedAt: 1,
  },
  source: {
    passId: 'pass-fixture',
    candidateId: 'candidate-fixture',
    evidenceSpan,
    sourceEvidenceIds: [evidenceRecord.evidence.evidenceId],
  },
  createdAt: 1,
};

const relationshipRecord = assertPromotedMemoryRecord({
  ...baseRecord,
  id: createPromotedMemoryRecordId({
    scope: scopeA,
    passId: baseRecord.source.passId,
    candidateId: baseRecord.source.candidateId,
    target: 'relationship_memory',
  }),
  target: 'relationship_memory',
  title: '雨夜',
  summary: '两个人曾经聊过一场雨。',
});

const timebookRecord = assertPromotedMemoryRecord({
  ...baseRecord,
  source: { ...baseRecord.source, candidateId: 'candidate-timebook' },
  manualDecision: {
    ...baseRecord.manualDecision,
    id: 'manual-decision-timebook',
    candidateId: 'candidate-timebook',
    decision: 'confirm_played_experience',
  },
  id: createPromotedMemoryRecordId({
    scope: scopeA,
    passId: baseRecord.source.passId,
    candidateId: 'candidate-timebook',
    target: 'timebook',
  }),
  target: 'timebook',
  title: '一起看雨的晚上',
  summary: '把这个晚上夹进时光簿。',
  happenedAt: '2026-07-12',
});

class FixturePromotionStore implements MemoryPromotionStorePort {
  constructor(private readonly records: PromotedMemoryRecord[]) {}
  async listRelationshipMemories(scope: HistoryScope) {
    return this.records.filter(record => record.target === 'relationship_memory' && record.scope.personaMaskId === scope.personaMaskId) as Extract<PromotedMemoryRecord, { target: 'relationship_memory' }>[];
  }
  async listTimebookEntries(scope: HistoryScope) {
    return this.records.filter(record => record.target === 'timebook' && record.scope.personaMaskId === scope.personaMaskId) as Extract<PromotedMemoryRecord, { target: 'timebook' }>[];
  }
  async listReceipts() { return []; }
  async commit(): Promise<never> { throw new Error('not used'); }
}

const promotionStore = new FixturePromotionStore([relationshipRecord, timebookRecord]);
let activeEvidence = [evidenceRecord];
const evidencePort: MemoryDMEvidenceReadPort = {
  listActiveEvidence: async ({ scope }) => scope.personaMaskId === scopeA.personaMaskId ? activeEvidence : [],
};
const service = createMemoryProjectionService({
  promotionStore,
  projectionStore: memoryProjectionStore,
  evidencePort,
  now: () => Date.parse('2026-07-20T12:00:00+08:00'),
});

const commandFor = (
  record: PromotedMemoryRecord,
  action: MemoryProjectionCommand['action'],
  patch?: MemoryProjectionCommand['patch'],
  requestedAt = Date.parse('2026-07-20T12:00:00+08:00'),
  scope: HistoryScope = scopeA,
): MemoryProjectionCommand => {
  const base: Omit<MemoryProjectionCommand, 'id'> = {
    schemaVersion: MEMORY_PROJECTION_SCHEMA_VERSION,
    scope,
    targetRecordId: record.id,
    expectedSourceRevisionFingerprint: record.source.evidenceSpan.sourceRevisionFingerprint,
    action,
    patch,
    requestedAt,
  };
  return { ...base, id: createMemoryProjectionCommandId(base) };
};

const initialA = await listMemoryProjectionViews({ scope: scopeA, promotionStore, projectionStore: memoryProjectionStore, evidencePort });
assert.equal(initialA.views.length, 2);
const initialB = await listMemoryProjectionViews({ scope: scopeB, promotionStore, projectionStore: memoryProjectionStore, evidencePort });
assert.equal(initialB.views.length, 0, 'same character in another mask must not see projection rows');

const edit = await service.revise(commandFor(relationshipRecord, 'edit', {
  title: '修正后的雨夜',
  summary: '这是人类修正过的整理摘要。',
}));
assert.equal(edit.outcome, 'applied');
assert.equal(edit.receipt.revision, 1);
assert.equal(edit.receipt.truthEffect, 'none');
assert.equal(relationshipRecord.title, '雨夜', 'projection edit must not mutate immutable promoted target');
const afterEdit = await listMemoryProjectionViews({ scope: scopeA, promotionStore, projectionStore: memoryProjectionStore, evidencePort });
const editedView = afterEdit.views.find(view => view.record.id === relationshipRecord.id)!;
assert.equal(editedView.display.title, '修正后的雨夜');
assert.equal(editedView.display.summary, '这是人类修正过的整理摘要。');

const illegalDate = await service.revise(commandFor(
  relationshipRecord,
  'edit',
  { happenedAt: '2026-07-13' },
  Date.parse('2026-07-20T12:00:01+08:00'),
));
assert.equal(illegalDate.outcome, 'rejected');
assert.equal(illegalDate.receipt.reason, 'relationship_memory_cannot_change_happened_at');

const hide = await service.revise(commandFor(
  relationshipRecord,
  'hide',
  undefined,
  Date.parse('2026-07-20T12:00:02+08:00'),
));
assert.equal(hide.outcome, 'applied');
assert.equal(hide.receipt.revision, 2);
const hiddenView = (await listMemoryProjectionViews({ scope: scopeA, promotionStore, projectionStore: memoryProjectionStore, evidencePort })).views.find(view => view.record.id === relationshipRecord.id)!;
assert.equal(hiddenView.hidden, true);

const repeatedHide = await service.revise(commandFor(
  relationshipRecord,
  'hide',
  undefined,
  Date.parse('2026-07-20T12:00:03+08:00'),
));
assert.equal(repeatedHide.outcome, 'rejected');
assert.equal(repeatedHide.receipt.reason, 'already_hidden');

const restore = await service.revise(commandFor(
  relationshipRecord,
  'restore',
  undefined,
  Date.parse('2026-07-20T12:00:04+08:00'),
));
assert.equal(restore.outcome, 'applied');
assert.equal(restore.receipt.revision, 3);

const timebookEditCommand = commandFor(
  timebookRecord,
  'edit',
  { title: '修正后的时光页', happenedAt: '2026-07-13', summary: '修正了日期和页边注。' },
  Date.parse('2026-07-20T12:00:05+08:00'),
);
const timebookEdit = await service.revise(timebookEditCommand);
assert.equal(timebookEdit.outcome, 'applied');
const exactRetry = await service.revise(timebookEditCommand);
assert.equal(exactRetry.outcome, 'duplicate');
assert.equal(exactRetry.receipt.id, timebookEdit.receipt.id);
const timebookView = (await listMemoryProjectionViews({ scope: scopeA, promotionStore, projectionStore: memoryProjectionStore, evidencePort })).views.find(view => view.record.id === timebookRecord.id)!;
assert.equal(timebookView.display.happenedAt, '2026-07-13');
assert.equal(await resolveMemoryProjectionSourceDate({ view: timebookView, evidencePort }), '2026-07-12', 'source jump follows evidence date, not edited display date');

const crossScope = await service.revise(commandFor(
  relationshipRecord,
  'edit',
  { title: '越界修改' },
  Date.parse('2026-07-20T12:00:06+08:00'),
  scopeB,
));
assert.equal(crossScope.outcome, 'rejected');
assert.equal(crossScope.receipt.reason, 'target_not_found_in_exact_scope');
assert.equal((await memoryProjectionStore.listReceipts(scopeB)).length, 1, 'rejected cross-scope attempt stays in its own audit lane');

activeEvidence = [{
  evidence: dailyArchiveMessageToInteractionEvidence({ ...archiveRow, revision: 2 }),
  content: evidenceRecord.content,
}];
const staleEdit = await service.revise(commandFor(
  relationshipRecord,
  'edit',
  { title: '不能覆盖新来源' },
  Date.parse('2026-07-20T12:00:07+08:00'),
));
assert.equal(staleEdit.outcome, 'rejected');
assert.equal(staleEdit.receipt.reason, 'source_is_stale');
const staleViews = await listMemoryProjectionViews({ scope: scopeA, promotionStore, projectionStore: memoryProjectionStore, evidencePort });
assert.equal(staleViews.views.length, 0);
assert.deepEqual(new Set(staleViews.staleRecordIds), new Set([relationshipRecord.id, timebookRecord.id]));

const projectionSource = readFileSync(new URL('../utils/memoryCore/memoryProjection.ts', import.meta.url), 'utf8');
assert.doesNotMatch(projectionSource, /saveAnniversary|updateCharacter|\.memories\s*=|refinedMemories/u, 'projection corrections must not write legacy truth stores');
const characterSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
const timebookSource = readFileSync(new URL('../apps/ScheduleApp.tsx', import.meta.url), 'utf8');
assert.match(characterSource, /listMemoryProjectionViews/u);
assert.match(characterSource, /onOpenPromotedSource/u);
assert.match(timebookSource, /projectionView/u);
assert.match(timebookSource, /openPromotedTimebookSource/u);

console.log('memory projection verification passed');
