import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import { dailyArchiveMessageFromLive, dailyArchiveMessageToInteractionEvidence } from '../domain/dailyArchive/contract.ts';
import { createEvidenceSpan } from '../domain/interactionEvidence/index.ts';
import {
  MEMORY_INTERPRETATION_SCHEMA_VERSION,
  MEMORY_PROMOTION_POLICY_VERSION,
  assertMemoryInterpretationPass,
  createMemoryCandidateId,
  createMemoryExtractionRequestId,
  createMemoryInterpretationPassId,
  createMemoryPromotionCommandId,
  type MemoryDMEvidenceReadPort,
  type MemoryDMEvidenceRecord,
  type MemoryInterpretationPass,
  type MemoryInterpretationStorePort,
  type MemoryPromotionCommand,
  type MemoryPromotionExperienceRef,
  type MemoryPromotionManualDecisionKind,
  type MemoryPromotionTrigger,
} from '../domain/memoryInterpretation/index.ts';
import {
  createMemoryPromotionService,
  listFreshPromotedMemoryRecords,
} from '../utils/memoryCore/memoryPromotion.ts';
import { memoryPromotionStore } from '../utils/memoryCore/promotionStore.ts';
import { formatWorldlinePromptBlock } from '../utils/memoryCore/promptFormatter.ts';
import { promotedMemoryCandidateForSelector } from '../utils/memoryCore/selector.ts';

const scopeA: HistoryScope = { progressBundleId: 'bundle-A', personaMaskId: 'mask-A', charId: 'char-shared' };
const scopeB: HistoryScope = { progressBundleId: 'bundle-B', personaMaskId: 'mask-B', charId: 'char-shared' };

const evidenceRecord = (
  scope: HistoryScope,
  id: number,
  role: 'user' | 'assistant',
  content: string,
  revision = 1,
): MemoryDMEvidenceRecord => {
  const row = dailyArchiveMessageFromLive({
    scope,
    message: {
      id,
      charId: scope.charId,
      role,
      type: 'text',
      content,
      timestamp: Date.parse(`2026-07-${String(10 + id).padStart(2, '0')}T10:00:00+08:00`),
      metadata: {
        source: id % 2 ? 'chat' : 'date',
        relationshipScope: scope,
        interactionId: `promotion-interaction-${scope.personaMaskId}-${id}`,
      },
    },
  });
  return { evidence: dailyArchiveMessageToInteractionEvidence({ ...row, revision }), content };
};

const recordsA = [
  evidenceRecord(scopeA, 1, 'user', '今天第一次一起看雨。'),
  evidenceRecord(scopeA, 2, 'assistant', '我把这一天记下来了。'),
  evidenceRecord(scopeA, 3, 'assistant', '刚才聊过的雨声，我也记得。'),
];
const evidenceSpanA = await createEvidenceSpan({
  scope: scopeA,
  evidence: recordsA.map(record => record.evidence),
});

const analysisRunId = 'promotion-fixture';
const requestId = createMemoryExtractionRequestId({ scope: scopeA, analysisRunId });
const passId = createMemoryInterpretationPassId({ scope: scopeA, analysisRunId });
const candidateRows: MemoryInterpretationPass['candidates'] = [
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 0),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'relationship_memory',
    knowledge: 'relationship_private',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'conversation_fact',
    status: 'proposed',
    title: '一起看雨',
    summary: '两个人第一次一起安静地看雨。',
    happenedAt: '2026-07-11',
    confidence: 0.9,
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 1),
    passId,
    scope: scopeA,
    sourceEvidenceIds: recordsA.map(record => record.evidence.evidenceId),
    target: 'timebook',
    knowledge: 'shared',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'shared_experience',
    status: 'proposed',
    title: '第一次一起看雨',
    summary: '值得留在时光簿的一天。',
    happenedAt: '2026-07-11',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 2),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'narrative_proposal',
    knowledge: 'shared',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'world_state_change',
    status: 'proposed',
    title: '下一段剧情',
    summary: '这只能交给 Narrative。',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 3),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'relationship_memory',
    knowledge: 'unknown_to_char',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'conversation_fact',
    status: 'proposed',
    title: '角色不知道的事',
    summary: '不能写入会递送给角色的关系记忆。',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 4),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'timebook',
    knowledge: 'shared',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'shared_experience',
    status: 'proposed',
    title: '没有日期',
    summary: '没有可见日期不能写进时光簿。',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 5),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'relationship_memory',
    knowledge: 'relationship_private',
    temporalClass: 'historical',
    authority: 'model_interpretation',
    claimClass: 'world_state_change',
    status: 'proposed',
    title: '旧日关系候选',
    summary: '历史材料必须由显式流程提升。',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 6),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'relationship_memory',
    knowledge: 'shared',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'conversation_fact',
    status: 'proposed',
    title: '等待来源修订',
    summary: '来源一旦更新，这条旧候选就不能继续写入。',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 7),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'relationship_memory',
    knowledge: 'shared',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'conversation_fact',
    status: 'proposed',
    title: '并发提升夹具',
    summary: '同一候选同时抵达也只能写入一次。',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 8),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[0].evidence.evidenceId],
    target: 'relationship_memory',
    knowledge: 'shared',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'world_state_change',
    status: 'proposed',
    title: '世界状态变化',
    summary: '只有经过 scoped experience receipt 验证才可自动提升。',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(passId, 9),
    passId,
    scope: scopeA,
    sourceEvidenceIds: [recordsA[1].evidence.evidenceId],
    target: 'relationship_memory',
    knowledge: 'shared',
    temporalClass: 'live',
    authority: 'model_interpretation',
    claimClass: 'conversation_fact',
    status: 'proposed',
    title: '模型误标场景事实',
    summary: '即便模型声称只是普通事实，约会来源仍不能绕开体验凭证。',
  },
];

const pass = assertMemoryInterpretationPass({
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  id: passId,
  requestId,
  analysisRunId,
  scope: scopeA,
  evidenceSpan: evidenceSpanA,
  extractor: 'model',
  promptVersion: 'promotion-fixture-prompt-v1',
  outputSchemaVersion: 'memory-candidates-v1',
  status: 'completed',
  truthEffect: 'none',
  candidates: candidateRows,
  startedAt: 1,
  completedAt: 2,
});

const deterministicAnalysisRunId = 'promotion-deterministic-fixture';
const deterministicRequestId = createMemoryExtractionRequestId({
  scope: scopeA,
  analysisRunId: deterministicAnalysisRunId,
});
const deterministicPassId = createMemoryInterpretationPassId({
  scope: scopeA,
  analysisRunId: deterministicAnalysisRunId,
});
const deterministicCandidate = {
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  id: createMemoryCandidateId(deterministicPassId, 0),
  passId: deterministicPassId,
  scope: scopeA,
  sourceEvidenceIds: [recordsA[0].evidence.evidenceId, recordsA[2].evidence.evidenceId],
  target: 'timebook' as const,
  knowledge: 'relationship_private' as const,
  temporalClass: 'live' as const,
  authority: 'deterministic_heuristic' as const,
  claimClass: 'shared_experience' as const,
  status: 'proposed' as const,
  title: '一段两人都参与的远程聊天',
  summary: '非模型规则确认这是双方参与的远程对话片段。',
  happenedAt: '2026-07-13',
};
const deterministicPass = assertMemoryInterpretationPass({
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  id: deterministicPassId,
  requestId: deterministicRequestId,
  analysisRunId: deterministicAnalysisRunId,
  scope: scopeA,
  evidenceSpan: evidenceSpanA,
  extractor: 'deterministic_heuristic',
  promptVersion: 'promotion-deterministic-fixture-v1',
  outputSchemaVersion: 'memory-candidates-v1',
  status: 'completed',
  truthEffect: 'none',
  candidates: [deterministicCandidate],
  startedAt: 1,
  completedAt: 2,
});
assert.throws(() => assertMemoryInterpretationPass({
  ...deterministicPass,
  candidates: [{ ...deterministicCandidate, authority: 'model_interpretation' }],
}), /authority 不能脱离 interpretation pass extractor/u);

class FixtureInterpretationStore implements MemoryInterpretationStorePort {
  async listPasses(scope: HistoryScope): Promise<MemoryInterpretationPass[]> {
    return scope.personaMaskId === scopeA.personaMaskId ? [pass, deterministicPass] : [];
  }
  async listReceipts(): Promise<[]> { return []; }
  async claimRequest(): Promise<boolean> { return false; }
  async appendCompleted(): Promise<void> { throw new Error('not used'); }
  async appendFailure(): Promise<void> { throw new Error('not used'); }
}
const interpretationStore = new FixtureInterpretationStore();

let activeRecords = recordsA;
const evidencePort: MemoryDMEvidenceReadPort = {
  listActiveEvidence: async ({ scope }) => scope.personaMaskId === scopeA.personaMaskId ? activeRecords : [],
};
const service = createMemoryPromotionService({
  interpretationStore,
  promotionStore: memoryPromotionStore,
  evidencePort,
  scopeAccessPort: { isLinked: async scope => scope.personaMaskId === scopeA.personaMaskId },
  now: () => Date.parse('2026-07-20T10:00:00+08:00'),
});

const commandFor = (
  candidateId: string,
  trigger: MemoryPromotionTrigger = 'manual',
  scope: HistoryScope = scopeA,
  experienceRef?: MemoryPromotionExperienceRef,
  requestedAt = Date.parse('2026-07-20T10:00:00+08:00'),
  manualDecisionKind?: MemoryPromotionManualDecisionKind,
): MemoryPromotionCommand => {
  const resolvedPassId = candidateId === deterministicCandidate.id ? deterministicPassId : passId;
  const decision = trigger === 'manual'
    ? manualDecisionKind || (candidateId === candidateRows[5].id ? 'remember_historical' : 'remember_relationship')
    : undefined;
  const base = {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    scope,
    candidateId,
    passId: resolvedPassId,
    expectedSourceRevisionFingerprint: evidenceSpanA.sourceRevisionFingerprint,
    trigger,
    policyVersion: MEMORY_PROMOTION_POLICY_VERSION,
    manualDecision: decision ? {
      id: `manual-decision:${candidateId}:${decision}:${requestedAt}`,
      scope,
      candidateId,
      decision,
      confirmedAt: requestedAt,
    } : undefined,
    experienceRef,
    requestedAt,
  };
  return { ...base, id: createMemoryPromotionCommandId(base) };
};

const modelSelfAuthorized = await service.promote(commandFor(candidateRows[0].id, 'automatic_policy'));
assert.equal(modelSelfAuthorized.outcome, 'rejected');
assert.equal(modelSelfAuthorized.receipt.reason, 'automatic_model_interpretation_requires_verified_experience');
assert.equal(modelSelfAuthorized.receipt.sourceAssessment?.sourceClass, 'user_remote_statement');

const relationshipCommand = commandFor(candidateRows[0].id, 'manual');
const relationshipResult = await service.promote(relationshipCommand);
assert.equal(relationshipResult.outcome, 'applied');
assert.equal(relationshipResult.receipt.truthEffect, 'relationship_memory');
assert.equal(relationshipResult.targetRecord?.scope.personaMaskId, scopeA.personaMaskId);
assert.deepEqual(relationshipResult.targetRecord?.source.sourceEvidenceIds, [recordsA[0].evidence.evidenceId]);
assert.ok(relationshipResult.targetRecord);
const mixedProjection = promotedMemoryCandidateForSelector({
  ...relationshipResult.targetRecord,
  temporalClass: 'mixed',
});
assert.equal(mixedProjection.temporalClass, 'mixed');
assert.equal(mixedProjection.sourceKind, 'history_analysis');
const mixedPrompt = formatWorldlinePromptBlock([mixedProjection], [], 2_000);
assert.match(mixedPrompt, /旧日关系证据（不是当前状态）/u);
assert.doesNotMatch(mixedPrompt, /世界线交汇记忆/u);

const unsafeAuthorityStore: MemoryInterpretationStorePort = {
  listPasses: async () => [{
    ...pass,
    candidates: pass.candidates.map((candidate, index) => (
      index === 0 ? { ...candidate, authority: 'deterministic_heuristic' as const } : candidate
    )),
  }],
  listReceipts: async () => [],
  claimRequest: async () => false,
  appendCompleted: async () => { throw new Error('not used'); },
  appendFailure: async () => { throw new Error('not used'); },
};
const unsafeAuthorityService = createMemoryPromotionService({
  interpretationStore: unsafeAuthorityStore,
  promotionStore: memoryPromotionStore,
  evidencePort,
  scopeAccessPort: { isLinked: async () => true },
  now: () => Date.parse('2026-07-20T10:00:04+08:00'),
});
const unsafeAuthorityResult = await unsafeAuthorityService.promote(commandFor(
  candidateRows[0].id,
  'automatic_policy',
  scopeA,
  undefined,
  Date.parse('2026-07-20T10:00:04+08:00'),
));
assert.equal(unsafeAuthorityResult.outcome, 'rejected');
assert.equal(unsafeAuthorityResult.receipt.reason, 'interpretation_authority_mismatch');

const exactCommandRetry = await service.promote(relationshipCommand);
assert.equal(exactCommandRetry.outcome, 'duplicate');
assert.equal(exactCommandRetry.receipt.id, relationshipResult.receipt.id, 'exact command retry reuses its receipt');
const duplicateCommand = commandFor(
  candidateRows[0].id,
  'manual',
  scopeA,
  undefined,
  Date.parse('2026-07-20T10:00:01+08:00'),
);
const duplicate = await service.promote(duplicateCommand);
assert.equal(duplicate.outcome, 'duplicate');
assert.equal(duplicate.receipt.status, 'duplicate');
assert.equal(duplicate.receipt.truthEffect, 'none');
assert.equal(duplicate.receipt.commandId, duplicateCommand.id);
assert.notEqual(duplicate.receipt.id, relationshipResult.receipt.id);
assert.equal(duplicate.receipt.duplicateOfTargetRecordId, relationshipResult.targetRecord?.id);
assert.equal(duplicate.receipt.duplicateOfReceiptId, relationshipResult.receipt.id);
assert.equal((await memoryPromotionStore.listRelationshipMemories(scopeA)).length, 1);
assert.equal((await memoryPromotionStore.listRelationshipMemories(scopeB)).length, 0, 'same char in another mask must remain isolated');

const narrativeRejection = await service.promote(commandFor(candidateRows[2].id));
assert.equal(narrativeRejection.outcome, 'rejected');
assert.equal(narrativeRejection.receipt.reason, 'target_owned_by_another_domain');
assert.equal(narrativeRejection.receipt.truthEffect, 'none');

const knowledgeRejection = await service.promote(commandFor(candidateRows[3].id));
assert.equal(knowledgeRejection.outcome, 'rejected');
assert.equal(knowledgeRejection.receipt.reason, 'relationship_memory_knowledge_not_deliverable');

const missingDateRejection = await service.promote(commandFor(candidateRows[4].id));
assert.equal(missingDateRejection.outcome, 'rejected');
assert.equal(missingDateRejection.receipt.reason, 'timebook_requires_valid_happened_at');

const historicalAutoRejection = await service.promote(commandFor(candidateRows[5].id, 'automatic_policy'));
assert.equal(historicalAutoRejection.outcome, 'rejected');
assert.equal(historicalAutoRejection.receipt.reason, 'automatic_policy_requires_live_evidence');
const historicalManual = await service.promote(commandFor(candidateRows[5].id, 'manual'));
assert.equal(historicalManual.outcome, 'applied');
assert.equal(historicalManual.targetRecord?.temporalClass, 'historical');

const embodiedAutoRejection = await service.promote(commandFor(candidateRows[1].id, 'automatic_policy'));
assert.equal(embodiedAutoRejection.outcome, 'rejected');
assert.equal(embodiedAutoRejection.receipt.reason, 'embodied_scene_requires_experience_receipt');
const embodiedMemoryOnly = await service.promote(commandFor(candidateRows[1].id, 'manual'));
assert.equal(embodiedMemoryOnly.outcome, 'rejected');
assert.equal(embodiedMemoryOnly.receipt.reason, 'manual_high_impact_candidate_requires_played_confirmation');

const misclassifiedScene = await service.promote(commandFor(candidateRows[9].id, 'automatic_policy'));
assert.equal(misclassifiedScene.outcome, 'rejected');
assert.equal(misclassifiedScene.receipt.reason, 'embodied_scene_requires_experience_receipt');
assert.equal(misclassifiedScene.receipt.sourceAssessment?.sourceClass, 'embodied_interaction');

const timebookResult = await service.promote(commandFor(
  candidateRows[1].id,
  'manual',
  scopeA,
  undefined,
  Date.parse('2026-07-20T10:00:00+08:00'),
  'confirm_played_experience',
));
assert.equal(timebookResult.outcome, 'applied');
assert.equal(timebookResult.receipt.truthEffect, 'timebook');
assert.equal((await memoryPromotionStore.listTimebookEntries(scopeA))[0]?.happenedAt, '2026-07-11');

const deterministicRemoteExchange = await service.promote(commandFor(deterministicCandidate.id, 'automatic_policy'));
assert.equal(deterministicRemoteExchange.outcome, 'applied');
assert.equal(deterministicRemoteExchange.receipt.sourceAssessment?.sourceClass, 'two_party_remote_exchange');
assert.equal(deterministicRemoteExchange.targetRecord?.sourceAssessment.sourceClass, 'two_party_remote_exchange');

const worldStateWithoutReceipt = await service.promote(commandFor(candidateRows[8].id, 'automatic_policy'));
assert.equal(worldStateWithoutReceipt.outcome, 'rejected');
assert.equal(worldStateWithoutReceipt.receipt.reason, 'world_state_change_requires_experience_receipt');
const worldStateMemoryOnly = await service.promote(commandFor(candidateRows[8].id, 'manual'));
assert.equal(worldStateMemoryOnly.outcome, 'rejected');
assert.equal(worldStateMemoryOnly.receipt.reason, 'manual_high_impact_candidate_requires_played_confirmation');
const experienceRef: MemoryPromotionExperienceRef = {
  kind: 'scoped_experience_receipt',
  scope: scopeA,
  receiptId: 'scoped-experience-receipt-1',
  acceptedFactRefs: ['fact:world-change:1'],
};
const unavailableExperienceVerifier = await service.promote(
  commandFor(candidateRows[8].id, 'automatic_policy', scopeA, experienceRef),
);
assert.equal(unavailableExperienceVerifier.outcome, 'rejected');
assert.equal(unavailableExperienceVerifier.receipt.reason, 'experience_verifier_unavailable');
const verifiedExperienceService = createMemoryPromotionService({
  interpretationStore,
  promotionStore: memoryPromotionStore,
  evidencePort,
  scopeAccessPort: { isLinked: async scope => scope.personaMaskId === scopeA.personaMaskId },
  experiencePort: {
    verify: async ({ scope, experienceRef: ref }) => ({
      verified: scope.personaMaskId === scopeA.personaMaskId
        && ref.receiptId === experienceRef.receiptId
        && ref.acceptedFactRefs[0] === experienceRef.acceptedFactRefs[0],
    }),
  },
  now: () => Date.parse('2026-07-20T10:00:30+08:00'),
});
const verifiedWorldState = await verifiedExperienceService.promote(
  commandFor(
    candidateRows[8].id,
    'automatic_policy',
    scopeA,
    experienceRef,
    Date.parse('2026-07-20T10:00:01+08:00'),
  ),
);
assert.equal(verifiedWorldState.outcome, 'applied');
assert.equal(verifiedWorldState.targetRecord?.experienceRef?.receiptId, experienceRef.receiptId);

const concurrent = await Promise.all([
  service.promote(commandFor(candidateRows[7].id, 'manual', scopeA, undefined, Date.parse('2026-07-20T10:00:02+08:00'))),
  service.promote(commandFor(candidateRows[7].id, 'manual', scopeA, undefined, Date.parse('2026-07-20T10:00:03+08:00'))),
]);
assert.deepEqual(
  concurrent.map(result => result.outcome).sort(),
  ['applied', 'duplicate'],
  'concurrent commands for the same candidate must create one durable target',
);
assert.equal((await memoryPromotionStore.listRelationshipMemories(scopeA)).length, 4);
const promotionReceipts = await memoryPromotionStore.listReceipts(scopeA);
assert.ok(promotionReceipts.some(receipt => (
  receipt.status === 'duplicate'
  && receipt.commandId === duplicateCommand.id
  && receipt.reason === 'existing_target_no_truth_change'
)), 'a new duplicate attempt must retain its own no-truth-change receipt');

const fresh = await listFreshPromotedMemoryRecords({
  scope: scopeA,
  promotionStore: memoryPromotionStore,
  evidencePort,
});
assert.equal(fresh.records.length, 6);
assert.deepEqual(fresh.staleRecordIds, []);

activeRecords = [
  evidenceRecord(scopeA, 1, 'user', '今天第一次一起看雨，后来修正了原文。', 2),
  recordsA[1],
  recordsA[2],
];
const stalePromotion = await service.promote(commandFor(candidateRows[6].id));
assert.equal(stalePromotion.outcome, 'stale');
assert.equal(stalePromotion.receipt.reason, 'source_revisions_changed');
assert.equal(stalePromotion.receipt.truthEffect, 'none');
const afterRevision = await listFreshPromotedMemoryRecords({
  scope: scopeA,
  promotionStore: memoryPromotionStore,
  evidencePort,
});
assert.equal(afterRevision.records.length, 0, 'promoted rows with superseded source revisions must fail closed at read time');
assert.equal(afterRevision.staleRecordIds.length, 6);

const stalePassId = createMemoryInterpretationPassId({ scope: scopeA, analysisRunId: 'stale-fixture' });
const staleCandidateId = createMemoryCandidateId(stalePassId, 0);
const staleCommandBase = {
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  scope: scopeA,
  candidateId: staleCandidateId,
  passId: stalePassId,
  expectedSourceRevisionFingerprint: evidenceSpanA.sourceRevisionFingerprint,
  trigger: 'manual' as const,
  policyVersion: MEMORY_PROMOTION_POLICY_VERSION,
  manualDecision: {
    id: 'manual-decision:missing-pass',
    scope: scopeA,
    candidateId: staleCandidateId,
    decision: 'remember_relationship' as const,
    confirmedAt: Date.parse('2026-07-20T10:01:00+08:00'),
  },
  requestedAt: Date.parse('2026-07-20T10:01:00+08:00'),
};
const missingPass = await service.promote({
  ...staleCommandBase,
  id: createMemoryPromotionCommandId(staleCommandBase),
});
assert.equal(missingPass.outcome, 'rejected');
assert.equal(missingPass.receipt.reason, 'interpretation_pass_not_found');

const foreignScope = await service.promote(commandFor(candidateRows[0].id, 'manual', scopeB));
assert.equal(foreignScope.outcome, 'rejected');
assert.equal(foreignScope.receipt.reason, 'scope_not_linked');

const promotionSource = readFileSync(new URL('../utils/memoryCore/memoryPromotion.ts', import.meta.url), 'utf8');
for (const forbidden of ['saveCharacter', 'saveAnniversary', 'saveCompanionWakeupRule', 'NarrativeRun', 'CharacterLife']) {
  assert.ok(!promotionSource.includes(forbidden), `Memory Promotion must not bypass another target domain via ${forbidden}`);
}
const storeSource = readFileSync(new URL('../utils/memoryCore/promotionStore.ts', import.meta.url), 'utf8');
assert.match(storeSource, /DB\.updateAsset\(MEMORY_PROMOTION_ASSET_ID/u);
assert.ok(storeSource.includes('receipts: [...store.receipts, receipt]'));

console.log('memory promotion OK: exact scope, provenance gate, duplicate attempt receipts, stale fail-closed reads, and target-domain isolation');
