import type { HistoryScope } from '../../domain/historyImport/types.ts';
import {
  createEvidenceSpan,
  sameEvidenceScope,
} from '../../domain/interactionEvidence/index.ts';
import {
  MEMORY_INTERPRETATION_SCHEMA_VERSION,
  MEMORY_PROMOTION_POLICY_VERSION,
  assertMemoryPromotionCommand,
  createMemoryPromotionReceiptId,
  createPromotedMemoryRecordId,
  type MemoryCandidate,
  type MemoryDMEvidenceReadPort,
  type MemoryDMEvidenceRecord,
  type MemoryInterpretationStorePort,
  type MemoryPromotionCommand,
  type MemoryPromotionExperiencePort,
  type MemoryPromotionPort,
  type MemoryPromotionReceipt,
  type MemoryPromotionResult,
  type MemoryPromotionScopeAccessPort,
  type MemoryPromotionSourceAssessment,
  type MemoryPromotionStorePort,
  type PromotedMemoryRecord,
} from '../../domain/memoryInterpretation/index.ts';
import { DB } from '../db.ts';
import { dailyArchiveEvidenceReadPort } from './evidencePort.ts';
import { memoryInterpretationStore } from './interpretationStore.ts';
import { memoryPromotionStore } from './promotionStore.ts';

const RELATIONSHIP_MEMORY_KNOWLEDGE = new Set<MemoryCandidate['knowledge']>([
  'character_private',
  'relationship_private',
  'shared',
  'public_safe',
]);
const TIMEBOOK_KNOWLEDGE = new Set<MemoryCandidate['knowledge']>([
  'relationship_private',
  'shared',
  'public_safe',
]);

export interface CreateMemoryPromotionServiceInput {
  interpretationStore?: MemoryInterpretationStorePort;
  promotionStore?: MemoryPromotionStorePort;
  evidencePort?: MemoryDMEvidenceReadPort;
  scopeAccessPort?: MemoryPromotionScopeAccessPort;
  experiencePort?: MemoryPromotionExperiencePort;
  now?: () => number;
}

export interface FreshPromotedMemoryRecords {
  records: PromotedMemoryRecord[];
  staleRecordIds: string[];
  warnings: string[];
}

const defaultScopeAccessPort: MemoryPromotionScopeAccessPort = {
  isLinked: async (scope: HistoryScope): Promise<boolean> => {
    const [user, characters] = await Promise.all([
      DB.getUserProfile(),
      DB.getAllCharacters(),
    ]);
    if (!user || !characters.some(character => character.id === scope.charId)) return false;
    const mask = user.personaMasks?.find(item => item.id === scope.personaMaskId);
    const bundle = user.progressBundles?.find(item => item.id === scope.progressBundleId);
    return Boolean(
      mask
      && bundle
      && mask.progressBundleId === bundle.id
      && bundle.maskId === mask.id
      && mask.linkedCharacterIds?.includes(scope.charId)
    );
  },
};

const normalizedDate = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) return undefined;
  return trimmed;
};

const receiptFor = (input: {
  command: MemoryPromotionCommand;
  status: MemoryPromotionReceipt['status'];
  createdAt: number;
  truthEffect?: MemoryPromotionReceipt['truthEffect'];
  targetRecordId?: string;
  reason?: string;
}): MemoryPromotionReceipt => ({
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  id: createMemoryPromotionReceiptId(input.command.id),
  commandId: input.command.id,
  scope: { ...input.command.scope },
  candidateId: input.command.candidateId,
  passId: input.command.passId,
  expectedSourceRevisionFingerprint: input.command.expectedSourceRevisionFingerprint,
  trigger: input.command.trigger,
  policyVersion: input.command.policyVersion,
  manualDecision: input.command.manualDecision ? {
    ...input.command.manualDecision,
    scope: { ...input.command.manualDecision.scope },
  } : undefined,
  experienceRef: input.command.experienceRef ? {
    ...input.command.experienceRef,
    scope: { ...input.command.experienceRef.scope },
    acceptedFactRefs: [...input.command.experienceRef.acceptedFactRefs],
  } : undefined,
  status: input.status,
  truthEffect: input.truthEffect ?? 'none',
  targetRecordId: input.targetRecordId,
  reason: input.reason,
  createdAt: input.createdAt,
});

const outcomeForCommit = (
  committed: Awaited<ReturnType<MemoryPromotionStorePort['commit']>>,
): MemoryPromotionResult => ({
  outcome: committed.outcome === 'committed'
    ? committed.receipt.status
    : 'duplicate',
  receipt: committed.receipt,
  targetRecord: committed.targetRecord,
});

const activeSourceRecords = async (input: {
  scope: HistoryScope;
  evidenceIds: readonly string[];
  expectedFingerprint: string;
  evidencePort: MemoryDMEvidenceReadPort;
}): Promise<MemoryDMEvidenceRecord[] | null> => {
  const activeEvidence = await input.evidencePort.listActiveEvidence({ scope: input.scope });
  const byId = new Map(activeEvidence.map(record => [record.evidence.evidenceId, record.evidence]));
  const selected = input.evidenceIds.map(id => byId.get(id));
  if (selected.some(item => !item)) return null;
  const currentSpan = await createEvidenceSpan({
    scope: input.scope,
    evidence: selected as NonNullable<(typeof selected)[number]>[],
  });
  if (currentSpan.sourceRevisionFingerprint !== input.expectedFingerprint) return null;
  const recordsById = new Map(activeEvidence.map(record => [record.evidence.evidenceId, record]));
  return input.evidenceIds.map(id => recordsById.get(id)!) as MemoryDMEvidenceRecord[];
};

const policyRejection = (
  candidate: MemoryCandidate,
  command: MemoryPromotionCommand,
): string | undefined => {
  if (candidate.status !== 'proposed') return 'candidate_not_proposed';
  if (candidate.target !== 'relationship_memory' && candidate.target !== 'timebook') {
    return 'target_owned_by_another_domain';
  }
  if (command.trigger === 'automatic_policy' && candidate.temporalClass !== 'live') {
    return 'automatic_policy_requires_live_evidence';
  }
  if (
    command.trigger === 'automatic_policy'
    && candidate.target === 'relationship_memory'
    && candidate.authority !== 'model_interpretation'
  ) return 'automatic_relationship_memory_requires_model_interpretation';
  if (candidate.target === 'relationship_memory' && !RELATIONSHIP_MEMORY_KNOWLEDGE.has(candidate.knowledge)) {
    return 'relationship_memory_knowledge_not_deliverable';
  }
  if (candidate.target === 'timebook' && !TIMEBOOK_KNOWLEDGE.has(candidate.knowledge)) {
    return 'timebook_knowledge_not_visible';
  }
  if (candidate.target === 'timebook' && !normalizedDate(candidate.happenedAt)) {
    return 'timebook_requires_valid_happened_at';
  }
  return undefined;
};

const candidateDecision = (candidate: MemoryCandidate) => ({
  target: candidate.target,
  knowledge: candidate.knowledge,
  temporalClass: candidate.temporalClass,
  interpretationAuthority: candidate.authority,
  claimClass: candidate.claimClass,
  sourceEvidenceIds: [...candidate.sourceEvidenceIds],
});

const uniqueSorted = <T extends string>(values: T[]): T[] => [...new Set(values)].sort();

/**
 * Classify only from immutable interaction provenance. Model-authored claimClass is
 * deliberately not consulted here, so it cannot grant itself a cheaper gate.
 */
const assessPromotionSource = (input: {
  candidate: MemoryCandidate;
  sourceRecords: MemoryDMEvidenceRecord[];
}): MemoryPromotionSourceAssessment => {
  const records = input.sourceRecords.filter(record => (
    input.candidate.sourceEvidenceIds.includes(record.evidence.evidenceId)
  ));
  const evidence = records.map(record => record.evidence);
  const surfaces = uniqueSorted(evidence.map(row => row.source.surface));
  const media = uniqueSorted(evidence.map(row => row.source.medium));
  const producers = uniqueSorted(evidence.map(row => row.producer));
  const transportRoles = uniqueSorted(evidence.map(row => row.transportRole));
  const isHistorical = evidence.some(row => row.temporalClass === 'historical' || row.producer === 'import');
  const isManual = evidence.some(row => row.producer === 'manual');
  const isEmbodied = evidence.some(row => (
    row.source.surface === 'date' || row.source.medium === 'embodied_scene'
  ));
  const remoteSurface = evidence.every(row => (
    row.source.surface === 'chat'
    || row.source.surface === 'call'
    || row.source.surface === 'group_chat'
    || row.source.surface === 'proactive'
  ));
  const remoteMedium = evidence.every(row => (
    row.source.medium === 'mixed_text'
    || row.source.medium === 'remote_text'
    || row.source.medium === 'voice_call'
  ));
  const allUser = evidence.length > 0 && evidence.every(row => (
    row.producer === 'user' && row.transportRole === 'user_channel'
  ));
  const hasUser = evidence.some(row => row.producer === 'user' && row.transportRole === 'user_channel');
  const hasModel = evidence.some(row => row.producer === 'model' && row.transportRole === 'assistant_channel');
  const onlyConversationProducers = evidence.every(row => row.producer === 'user' || row.producer === 'model');
  const onlyConversationRoles = evidence.every(row => (
    row.transportRole === 'user_channel' || row.transportRole === 'assistant_channel'
  ));
  const generatedWithoutUser = evidence.length > 0 && !hasUser
    && evidence.every(row => row.producer === 'model' || row.producer === 'system');

  const sourceClass: MemoryPromotionSourceAssessment['sourceClass'] = isHistorical
    ? 'historical_material'
    : isManual
      ? 'manual_material'
      : isEmbodied
        ? 'embodied_interaction'
        : remoteSurface && remoteMedium && allUser
          ? 'user_remote_statement'
          : remoteSurface && remoteMedium && hasUser && hasModel && onlyConversationProducers && onlyConversationRoles
            ? 'two_party_remote_exchange'
            : generatedWithoutUser
              ? 'model_or_system_generated'
              : 'unclassified';

  return {
    classifierVersion: 'interaction-provenance-v1',
    sourceClass,
    evidenceIds: evidence.map(row => row.evidenceId),
    surfaces,
    media,
    producers,
    transportRoles,
  };
};

const automaticExperienceRequirement = (input: {
  candidate: MemoryCandidate;
  sourceRecords: MemoryDMEvidenceRecord[];
  sourceAssessment: MemoryPromotionSourceAssessment;
}): string | undefined => {
  const candidateSources = input.sourceRecords.filter(record => (
    input.candidate.sourceEvidenceIds.includes(record.evidence.evidenceId)
  ));
  const hasUser = candidateSources.some(record => record.evidence.transportRole === 'user_channel');
  const hasAssistant = candidateSources.some(record => record.evidence.transportRole === 'assistant_channel');
  if (input.candidate.claimClass === 'world_state_change') return 'world_state_change_requires_experience_receipt';
  if (input.candidate.claimClass === 'relationship_stage_change') return 'relationship_stage_change_requires_experience_receipt';
  if (input.sourceAssessment.sourceClass === 'embodied_interaction') {
    return 'embodied_scene_requires_experience_receipt';
  }
  if (input.candidate.authority === 'model_interpretation') {
    return 'automatic_model_interpretation_requires_verified_experience';
  }
  if (input.candidate.claimClass === 'conversation_fact' && !hasUser) {
    return 'automatic_conversation_fact_requires_user_evidence';
  }
  if (
    input.candidate.claimClass === 'conversation_fact'
    && input.sourceAssessment.sourceClass !== 'user_remote_statement'
  ) return 'automatic_conversation_fact_source_not_verified';
  if (input.candidate.claimClass === 'shared_experience') {
    if (!hasUser || !hasAssistant) return 'automatic_shared_experience_requires_two_party_evidence';
    if (input.sourceAssessment.sourceClass !== 'two_party_remote_exchange') {
      return 'automatic_shared_experience_source_not_verified';
    }
  }
  return undefined;
};

const manualDecisionRejection = (input: {
  command: MemoryPromotionCommand;
  candidate: MemoryCandidate;
  sourceAssessment: MemoryPromotionSourceAssessment;
}): string | undefined => {
  const decision = input.command.manualDecision?.decision;
  if (!decision) return 'manual_decision_required';
  if (input.candidate.temporalClass !== 'live') {
    return decision === 'remember_historical' ? undefined : 'historical_candidate_requires_historical_decision';
  }
  const requiresPlayedConfirmation = input.candidate.claimClass === 'world_state_change'
    || input.candidate.claimClass === 'relationship_stage_change'
    || input.sourceAssessment.sourceClass === 'embodied_interaction';
  if (requiresPlayedConfirmation) {
    return decision === 'confirm_played_experience' || input.command.experienceRef
      ? undefined
      : 'manual_high_impact_candidate_requires_played_confirmation';
  }
  return decision === 'remember_relationship' || decision === 'confirm_played_experience'
    ? undefined
    : 'live_candidate_requires_relationship_decision';
};

export const createMemoryPromotionService = ({
  interpretationStore = memoryInterpretationStore,
  promotionStore = memoryPromotionStore,
  evidencePort = dailyArchiveEvidenceReadPort,
  scopeAccessPort = defaultScopeAccessPort,
  experiencePort,
  now = () => Date.now(),
}: CreateMemoryPromotionServiceInput = {}): MemoryPromotionPort => ({
  promote: async (rawCommand: MemoryPromotionCommand): Promise<MemoryPromotionResult> => {
    const command = assertMemoryPromotionCommand(rawCommand);
    const createdAt = now();
    let decision: ReturnType<typeof candidateDecision> | undefined;
    let sourceAssessment: MemoryPromotionSourceAssessment | undefined;
    const reject = async (reason: string): Promise<MemoryPromotionResult> => outcomeForCommit(
      await promotionStore.commit({ receipt: {
        ...receiptFor({ command, status: 'rejected', reason, createdAt }),
        candidateDecision: decision,
        sourceAssessment,
      } }),
    );
    const stale = async (reason: string): Promise<MemoryPromotionResult> => outcomeForCommit(
      await promotionStore.commit({ receipt: {
        ...receiptFor({ command, status: 'stale', reason, createdAt }),
        candidateDecision: decision,
        sourceAssessment,
      } }),
    );

    if (!await scopeAccessPort.isLinked(command.scope)) return reject('scope_not_linked');
    const passes = await interpretationStore.listPasses(command.scope);
    const pass = passes.find(item => item.id === command.passId && sameEvidenceScope(item.scope, command.scope));
    if (!pass) return reject('interpretation_pass_not_found');
    if (pass.evidenceSpan.sourceRevisionFingerprint !== command.expectedSourceRevisionFingerprint) {
      return reject('expected_fingerprint_mismatch');
    }
    const candidate = pass.candidates.find(item => item.id === command.candidateId);
    if (!candidate || !sameEvidenceScope(candidate.scope, command.scope)) {
      return reject('candidate_not_found');
    }
    decision = candidateDecision(candidate);
    const expectedAuthority = pass.extractor === 'model'
      ? 'model_interpretation'
      : 'deterministic_heuristic';
    if (candidate.authority !== expectedAuthority) return reject('interpretation_authority_mismatch');
    const rejectedByPolicy = policyRejection(candidate, command);
    if (rejectedByPolicy) return reject(rejectedByPolicy);
    if (candidate.target !== 'relationship_memory' && candidate.target !== 'timebook') {
      return reject('target_owned_by_another_domain');
    }
    const target = candidate.target;

    const sourceRecords = await activeSourceRecords({
      scope: command.scope,
      evidenceIds: pass.evidenceSpan.evidenceIds,
      expectedFingerprint: command.expectedSourceRevisionFingerprint,
      evidencePort,
    });
    if (!sourceRecords) return stale('source_revisions_changed');
    sourceAssessment = assessPromotionSource({ candidate, sourceRecords });

    if (command.trigger === 'manual') {
      const manualRejection = manualDecisionRejection({ command, candidate, sourceAssessment });
      if (manualRejection) return reject(manualRejection);
    }
    const experienceRequirement = command.trigger === 'automatic_policy'
      ? automaticExperienceRequirement({ candidate, sourceRecords, sourceAssessment })
      : undefined;
    if (experienceRequirement && !command.experienceRef) return reject(experienceRequirement);
    if (command.experienceRef) {
      if (!experiencePort) return reject('experience_verifier_unavailable');
      const verification = await experiencePort.verify({
        scope: command.scope,
        candidate,
        experienceRef: command.experienceRef,
      });
      if (!verification.verified) return reject(verification.reason || 'experience_receipt_rejected');
    }

    const targetRecordId = createPromotedMemoryRecordId({
      scope: command.scope,
      passId: pass.id,
      candidateId: candidate.id,
      target,
    });
    const receipt = receiptFor({
      command,
      status: 'applied',
      truthEffect: target,
      targetRecordId,
      createdAt,
    });
    receipt.candidateDecision = decision;
    receipt.sourceAssessment = sourceAssessment;
    const baseRecord = {
      schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
      id: targetRecordId,
      scope: { ...command.scope },
      title: candidate.title,
      summary: candidate.summary,
      happenedAt: normalizedDate(candidate.happenedAt),
      mood: candidate.mood,
      confidence: candidate.confidence,
      tags: candidate.tags ? [...candidate.tags] : undefined,
      knowledge: candidate.knowledge,
      temporalClass: candidate.temporalClass,
      interpretationAuthority: candidate.authority,
      claimClass: candidate.claimClass,
      sourceAssessment,
      promotionTrigger: command.trigger,
      promotionReceiptId: receipt.id,
      manualDecision: command.manualDecision ? {
        ...command.manualDecision,
        scope: { ...command.manualDecision.scope },
      } : undefined,
      experienceRef: command.experienceRef ? {
        ...command.experienceRef,
        scope: { ...command.experienceRef.scope },
        acceptedFactRefs: [...command.experienceRef.acceptedFactRefs],
      } : undefined,
      source: {
        passId: pass.id,
        candidateId: candidate.id,
        evidenceSpan: {
          ...pass.evidenceSpan,
          scope: { ...pass.evidenceSpan.scope },
          evidenceIds: [...pass.evidenceSpan.evidenceIds],
        },
        sourceEvidenceIds: [...candidate.sourceEvidenceIds],
      },
      createdAt,
    };
    const targetRecord: PromotedMemoryRecord = target === 'timebook'
      ? { ...baseRecord, target: 'timebook', happenedAt: normalizedDate(candidate.happenedAt)! }
      : { ...baseRecord, target: 'relationship_memory' };
    return outcomeForCommit(await promotionStore.commit({ receipt, targetRecord }));
  },
});

export const memoryPromotionService = createMemoryPromotionService();

export const listFreshPromotedMemoryRecords = async (input: {
  scope: HistoryScope;
  promotionStore?: MemoryPromotionStorePort;
  evidencePort?: MemoryDMEvidenceReadPort;
}): Promise<FreshPromotedMemoryRecords> => {
  const store = input.promotionStore ?? memoryPromotionStore;
  const evidenceReader = input.evidencePort ?? dailyArchiveEvidenceReadPort;
  const [relationshipMemories, timebookEntries, activeEvidence] = await Promise.all([
    store.listRelationshipMemories(input.scope),
    store.listTimebookEntries(input.scope),
    evidenceReader.listActiveEvidence({ scope: input.scope }),
  ]);
  const records: PromotedMemoryRecord[] = [...relationshipMemories, ...timebookEntries];
  const activeById = new Map(activeEvidence.map(row => [row.evidence.evidenceId, row.evidence]));
  const fresh: PromotedMemoryRecord[] = [];
  const staleRecordIds: string[] = [];
  for (const record of records) {
    const selected = record.source.evidenceSpan.evidenceIds.map(id => activeById.get(id));
    if (selected.some(item => !item)) {
      staleRecordIds.push(record.id);
      continue;
    }
    const span = await createEvidenceSpan({
      scope: input.scope,
      evidence: selected as NonNullable<(typeof selected)[number]>[],
    });
    if (span.sourceRevisionFingerprint !== record.source.evidenceSpan.sourceRevisionFingerprint) {
      staleRecordIds.push(record.id);
      continue;
    }
    fresh.push(record);
  }
  return {
    records: fresh,
    staleRecordIds,
    warnings: staleRecordIds.length ? [`promoted_memory_stale:${staleRecordIds.length}`] : [],
  };
};

export const MEMORY_PROMOTION_CURRENT_POLICY_VERSION = MEMORY_PROMOTION_POLICY_VERSION;
