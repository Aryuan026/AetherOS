import type { HistoryScope } from '../historyImport/types.ts';
import type { EvidenceSpan, InteractionEvidence } from '../interactionEvidence/types.ts';

export const MEMORY_INTERPRETATION_SCHEMA_VERSION = 1 as const;

export type MemoryExtractionTrigger = 'auto' | 'idle' | 'manual';
export type MemoryInterpretationExtractor = 'model' | 'deterministic_heuristic';
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

/** Declared now so extraction cannot grow an implicit direct-write path. */
export interface MemoryPromotionCommand {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    candidateId: string;
    passId: string;
    expectedSourceRevisionFingerprint: string;
    requestedAt: number;
}

export interface MemoryPromotionReceipt {
    schemaVersion: typeof MEMORY_INTERPRETATION_SCHEMA_VERSION;
    id: string;
    commandId: string;
    scope: HistoryScope;
    candidateId: string;
    status: 'applied' | 'rejected' | 'duplicate' | 'stale';
    truthEffect: 'none' | 'relationship_memory' | 'timebook';
    targetRecordId?: string;
    reason?: string;
    createdAt: number;
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

/** Promotion implementation is intentionally HOLD in the extraction-only box. */
export interface MemoryPromotionPort {
    promote(command: MemoryPromotionCommand): Promise<MemoryPromotionReceipt>;
}
