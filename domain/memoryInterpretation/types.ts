import type { HistoryScope } from '../historyImport/types.ts';
import type { EvidenceSpan, InteractionEvidence } from '../interactionEvidence/types.ts';

export const MEMORY_INTERPRETATION_SCHEMA_VERSION = 1 as const;

export type MemoryExtractionTrigger = 'auto' | 'idle' | 'manual';
export type MemoryInterpretationExtractor = 'model' | 'deterministic_heuristic';
export type MemoryPromotionTrigger = 'manual' | 'automatic_policy';
export type MemoryPromotionManualDecisionKind =
    | 'remember_historical'
    | 'remember_relationship'
    | 'confirm_played_experience';
export type MemoryCandidateClaimClass =
    | 'conversation_fact'
    | 'shared_experience'
    | 'world_state_change'
    | 'relationship_stage_change';
export type MemoryPromotionSourceClass =
    | 'historical_material'
    | 'embodied_interaction'
    | 'user_remote_statement'
    | 'two_party_remote_exchange'
    | 'model_or_system_generated'
    | 'manual_material'
    | 'unclassified';
export type MemoryCandidateTarget =
    | 'relationship_memory'
    | 'timebook'
    | 'scheduler_proposal'
    | 'narrative_proposal'
    | 'character_life_proposal'
    | 'discard';
export type MemoryCandidateKnowledge =
    | 'character_private'
    | 'user_private'
    | 'relationship_private'
    | 'shared'
    | 'public_safe'
    | 'unknown_to_char'
    | 'unknown_to_user';

export interface MemoryDMEvidenceRecord {
    evidence: InteractionEvidence;
    content: string;
}

export interface MemoryDMExtractionRequest {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    analysisRunId: string;
    scope: HistoryScope;
    trigger: MemoryExtractionTrigger;
    evidenceSpan: EvidenceSpan;
    extractor: MemoryInterpretationExtractor;
    promptVersion: string;
    outputSchemaVersion: string;
    requestedAt: number;
}

export interface MemoryCandidate {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    passId: string;
    scope: HistoryScope;
    sourceEvidenceIds: string[];
    target: MemoryCandidateTarget;
    knowledge: MemoryCandidateKnowledge;
    temporalClass: 'historical' | 'live' | 'mixed';
    authority: 'model_interpretation' | 'deterministic_heuristic';
    claimClass: MemoryCandidateClaimClass;
    status: 'proposed' | 'discarded';
    title: string;
    summary: string;
    happenedAt?: string;
    mood?: string;
    confidence?: number;
    tags?: string[];
}

export interface MemoryInterpretationPass {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    requestId: string;
    analysisRunId: string;
    scope: HistoryScope;
    evidenceSpan: EvidenceSpan;
    extractor: MemoryInterpretationExtractor;
    promptVersion: string;
    outputSchemaVersion: string;
    status: 'completed';
    truthEffect: 'none';
    candidates: MemoryCandidate[];
    startedAt: number;
    completedAt: number;
}

export interface MemoryExtractionUsage {
    evidenceCount: number;
    inputCharCount: number;
    promptCharCount?: number;
    estimatedInputTokens?: number;
    estimatorId?: 'unicode_chars_div_3_v1';
    providerPromptTokens?: number;
    providerCompletionTokens?: number;
    providerTotalTokens?: number;
    latencyMs?: number;
}

export interface MemoryDMExtractionReceipt {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    requestId: string;
    analysisRunId: string;
    passId?: string;
    scope: HistoryScope;
    evidenceSpan: EvidenceSpan;
    status: 'completed' | 'failed' | 'rejected';
    truthEffect: 'none';
    candidateIds: string[];
    rejectedCandidateCount: number;
    reason?: string;
    extractor: MemoryInterpretationExtractor;
    modelId?: string;
    promptVersion: string;
    outputSchemaVersion: string;
    usage: MemoryExtractionUsage;
    createdAt: number;
}

export interface MemoryExtractionClaim {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    requestId: string;
    scope: HistoryScope;
    extractor: MemoryInterpretationExtractor;
    sourceRevisionFingerprint: string;
    promptVersion: string;
    outputSchemaVersion: string;
    status: 'pending' | 'completed' | 'failed';
    createdAt: number;
    updatedAt: number;
}

export interface MemoryPromotionCommand {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    candidateId: string;
    passId: string;
    expectedSourceRevisionFingerprint: string;
    trigger: MemoryPromotionTrigger;
    policyVersion: 'memory-promotion-policy-v1';
    manualDecision?: MemoryPromotionManualDecision;
    experienceRef?: MemoryPromotionExperienceRef;
    requestedAt: number;
}

export interface MemoryPromotionManualDecision {
    id: string;
    scope: HistoryScope;
    candidateId: string;
    decision: MemoryPromotionManualDecisionKind;
    confirmedAt: number;
}

export interface MemoryPromotionExperienceRef {
    kind: 'scoped_experience_receipt';
    scope: HistoryScope;
    receiptId: string;
    acceptedFactRefs: string[];
}

export interface MemoryPromotionCandidateDecision {
    target: MemoryCandidateTarget;
    knowledge: MemoryCandidateKnowledge;
    temporalClass: MemoryCandidate['temporalClass'];
    interpretationAuthority: MemoryCandidate['authority'];
    claimClass: MemoryCandidateClaimClass;
    sourceEvidenceIds: string[];
}

/** Deterministic provenance assessment. It never trusts the model's claimClass. */
export interface MemoryPromotionSourceAssessment {
    classifierVersion: 'interaction-provenance-v1';
    sourceClass: MemoryPromotionSourceClass;
    evidenceIds: string[];
    surfaces: InteractionEvidence['source']['surface'][];
    media: InteractionEvidence['source']['medium'][];
    producers: InteractionEvidence['producer'][];
    transportRoles: InteractionEvidence['transportRole'][];
}

export interface MemoryPromotionReceipt {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    commandId: string;
    scope: HistoryScope;
    candidateId: string;
    passId: string;
    expectedSourceRevisionFingerprint: string;
    trigger: MemoryPromotionTrigger;
    policyVersion: 'memory-promotion-policy-v1';
    candidateDecision?: MemoryPromotionCandidateDecision;
    sourceAssessment?: MemoryPromotionSourceAssessment;
    manualDecision?: MemoryPromotionManualDecision;
    experienceRef?: MemoryPromotionExperienceRef;
    status: 'applied' | 'rejected' | 'stale' | 'duplicate';
    truthEffect: 'none' | 'relationship_memory' | 'timebook';
    targetRecordId?: string;
    duplicateOfTargetRecordId?: string;
    duplicateOfReceiptId?: string;
    reason?: string;
    createdAt: number;
}

export interface PromotedMemorySource {
    passId: string;
    candidateId: string;
    evidenceSpan: EvidenceSpan;
    sourceEvidenceIds: string[];
}

interface PromotedMemoryRecordBase {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    title: string;
    summary: string;
    happenedAt?: string;
    mood?: string;
    confidence?: number;
    tags?: string[];
    knowledge: MemoryCandidateKnowledge;
    temporalClass: MemoryCandidate['temporalClass'];
    interpretationAuthority: MemoryCandidate['authority'];
    claimClass: MemoryCandidateClaimClass;
    sourceAssessment: MemoryPromotionSourceAssessment;
    promotionTrigger: MemoryPromotionTrigger;
    promotionReceiptId: string;
    manualDecision?: MemoryPromotionManualDecision;
    experienceRef?: MemoryPromotionExperienceRef;
    source: PromotedMemorySource;
    createdAt: number;
}

export interface PromotedRelationshipMemory extends PromotedMemoryRecordBase {
    target: 'relationship_memory';
}

export interface PromotedTimebookEntry extends PromotedMemoryRecordBase {
    target: 'timebook';
    happenedAt: string;
}

export type PromotedMemoryRecord = PromotedRelationshipMemory | PromotedTimebookEntry;

export interface MemoryPromotionCommitResult {
    outcome: 'committed' | 'existing_command' | 'existing_target';
    receipt: MemoryPromotionReceipt;
    targetRecord?: PromotedMemoryRecord;
}

export interface MemoryPromotionResult {
    outcome: 'applied' | 'rejected' | 'stale' | 'duplicate';
    receipt: MemoryPromotionReceipt;
    targetRecord?: PromotedMemoryRecord;
}

export interface MemoryDMEvidenceReadPort {
    listActiveEvidence(input: {
        scope: HistoryScope;
        temporalClass?: 'historical' | 'live';
    }): Promise<MemoryDMEvidenceRecord[]>;
}

export interface MemoryDMModelPort {
    run(input: {
        request: MemoryDMExtractionRequest;
        prompt: string;
        api: { baseUrl: string; apiKey: string; model: string };
    }): Promise<{
        text: string;
        modelId: string;
        usage?: Omit<MemoryExtractionUsage, 'evidenceCount' | 'inputCharCount'>;
    }>;
}

export interface MemoryInterpretationStorePort {
    listPasses(scope: HistoryScope): Promise<MemoryInterpretationPass[]>;
    listReceipts(scope: HistoryScope): Promise<MemoryDMExtractionReceipt[]>;
    /** Atomic claim for automatic work. Manual re-analysis intentionally bypasses it. */
    claimRequest(request: MemoryDMExtractionRequest): Promise<boolean>;
    appendCompleted(pass: MemoryInterpretationPass, receipt: MemoryDMExtractionReceipt): Promise<void>;
    appendFailure(request: MemoryDMExtractionRequest, receipt: MemoryDMExtractionReceipt): Promise<void>;
}

export interface MemoryPromotionStorePort {
    listRelationshipMemories(scope: HistoryScope): Promise<PromotedRelationshipMemory[]>;
    listTimebookEntries(scope: HistoryScope): Promise<PromotedTimebookEntry[]>;
    listReceipts(scope: HistoryScope): Promise<MemoryPromotionReceipt[]>;
    commit(input: {
        receipt: MemoryPromotionReceipt;
        targetRecord?: PromotedMemoryRecord;
    }): Promise<MemoryPromotionCommitResult>;
}

export interface MemoryPromotionScopeAccessPort {
    isLinked(scope: HistoryScope): Promise<boolean>;
}

export interface MemoryPromotionExperiencePort {
    verify(input: {
        scope: HistoryScope;
        candidate: MemoryCandidate;
        experienceRef: MemoryPromotionExperienceRef;
    }): Promise<{ verified: boolean; reason?: string }>;
}

export interface MemoryPromotionPort {
    promote(command: MemoryPromotionCommand): Promise<MemoryPromotionResult>;
}
