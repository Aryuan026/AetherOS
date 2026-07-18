import type {
    HistoryScope,
    HistorySourceTime,
} from '../types.ts';

export const HISTORY_ANALYSIS_SCHEMA_VERSION = 2 as const;

export type HistoryAnalysisStrategy = 'quick_merge' | 'deep_daily';

export interface HistoryAnalysisSourceDocument {
    documentId: string;
    revision: number;
    dateKey?: string;
    messageCount: number;
    estimatedTokens: number;
}

/**
 * A stable pointer into a visible Calendar day. Internal model packets never
 * become another human-facing segmentation layer.
 */
export interface HistorySourceSpan {
    documentId: string;
    documentRevision: number;
    dateKey?: string;
    startMessageOffset: number;
    endMessageOffset: number;
    messageIds?: string[];
}

export interface HistoryAnalysisEstimate {
    strategy: HistoryAnalysisStrategy;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCalls: number;
    internalPacketCount: number;
    sourceDocumentCount: number;
    sourceMessageCount: number;
    approximate: true;
}

export interface HistoryAnalysisPreflight {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    scope: HistoryScope;
    sourceRevisionFingerprint: string;
    sourceDocuments: HistoryAnalysisSourceDocument[];
    plans: Record<HistoryAnalysisStrategy, HistoryAnalysisEstimate>;
    generatedAt: number;
}

export interface HistoryAnalysisRequest {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    sourceRevisionFingerprint: string;
    sourceDocuments: HistoryAnalysisSourceDocument[];
    strategy: HistoryAnalysisStrategy;
    estimate: HistoryAnalysisEstimate;
    createdAt: number;
}

export type HistoricalAuthority =
    | 'source_explicit'
    | 'source_inferred'
    | 'model_reconstructed'
    | 'user_confirmed';

export type HistoricalResultStatus =
    | 'soft_canon'
    | 'confirmed'
    | 'stale'
    | 'archived'
    | 'discarded';

export type HistoricalContinuity =
    | 'mainline'
    | 'if_line'
    | 'scene_only'
    | 'unknown';

export type HistoricalInteractionSurface =
    | 'remote_chat'
    | 'embodied_meeting'
    | 'coauthored_scene'
    | 'ooc'
    | 'mixed'
    | 'unknown';

export type HistoricalMemoryPolicy =
    | 'relationship_echo'
    | 'narrative_reference'
    | 'dream_material'
    | 'source_only';

export interface HistoricalDerivedBase {
    id: string;
    scope: HistoryScope;
    temporalClass: 'historical';
    sourceRefs: HistorySourceSpan[];
    authority: HistoricalAuthority;
    confidence: number;
    status: HistoricalResultStatus;
    analysisRunId: string;
    extractorVersion: string;
    createdAt: number;
    updatedAt: number;
    revision: number;
}

export interface HistoricalRelationshipMemory extends HistoricalDerivedBase {
    kind: 'relationship_memory';
    title: string;
    summary: string;
    occurredAt?: HistorySourceTime;
    memoryPolicy: HistoricalMemoryPolicy;
}

export interface HistoricalTimebookNode extends HistoricalDerivedBase {
    kind: 'timebook_node';
    title: string;
    summary: string;
    occurredAt?: HistorySourceTime;
    continuity: HistoricalContinuity;
    surface: HistoricalInteractionSurface;
}

export interface HistoricalRouteProfile extends HistoricalDerivedBase {
    kind: 'route';
    continuity: HistoricalContinuity;
    routeId?: string;
    branchId?: string;
    title: string;
    summary: string;
    startedAt?: HistorySourceTime;
    endedAt?: HistorySourceTime;
    relationshipStageId?: string;
    npcProfileIds: string[];
    openThreadIds: string[];
    surfaces: HistoricalInteractionSurface[];
}

export interface HistoricalNpcProfile extends HistoricalDerivedBase {
    kind: 'npc';
    npcId: string;
    routeId?: string;
    branchId?: string;
    name: string;
    aliases: string[];
    relationshipRole?: string;
    knownHistoricalFacts: string[];
    lastHistoricalState?: string;
    asOf?: HistorySourceTime;
}

export interface HistoricalRelationshipStage extends HistoricalDerivedBase {
    kind: 'relationship_stage';
    stageId: string;
    label: string;
    summary: string;
    effectiveFrom?: HistorySourceTime;
    effectiveTo?: HistorySourceTime;
    evidenceMarkers: string[];
}

export interface HistoricalOpenThread extends HistoricalDerivedBase {
    kind: 'open_thread';
    threadId: string;
    routeId?: string;
    branchId?: string;
    title: string;
    summary: string;
    state: 'open' | 'resolved' | 'uncertain';
    continuationHint?: string;
    lastEvidenceAt?: HistorySourceTime;
}

/**
 * Source-linked historical route material available to a future narrative
 * director. It is not an active run, scene, receipt, or current-life state.
 */
export interface HistoricalNarrativeProfile extends HistoricalDerivedBase {
    kind: 'narrative_profile';
    title: string;
    summary: string;
    routes: HistoricalRouteProfile[];
    npcs: HistoricalNpcProfile[];
    relationshipStages: HistoricalRelationshipStage[];
    openThreads: HistoricalOpenThread[];
}

/**
 * One immutable completed interpretation. Re-running the same source produces
 * another pass; it never replaces or mutates an earlier pass.
 */
export interface HistoryAnalysisPass {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    requestId: string;
    analysisRunId: string;
    strategy: HistoryAnalysisStrategy;
    sourceRevisionFingerprint: string;
    sourceRefs: HistorySourceSpan[];
    temporalClass: 'historical';
    status: 'completed';
    relationshipMemories: HistoricalRelationshipMemory[];
    timebookNodes: HistoricalTimebookNode[];
    narrativeProfile: HistoricalNarrativeProfile;
    createdAt: number;
    completedAt: number;
}

export type HistoryEvidenceTargetKind =
    | 'relationship_memory'
    | 'timebook_node'
    | 'route'
    | 'npc'
    | 'relationship_stage'
    | 'open_thread';

export type HistoryEvidenceBindingPurpose =
    | 'evidence'
    | 'scene'
    | 'turning_point'
    | 'relationship_change';

/**
 * A source span may have any number of bindings. There is deliberately no
 * uniqueness rule on sourceRef, so one scene can support several routes.
 */
export interface HistoryEvidenceBinding {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    sourceRef: HistorySourceSpan;
    targetKind: HistoryEvidenceTargetKind;
    targetId: string;
    purpose: HistoryEvidenceBindingPurpose;
    origin: 'analysis' | 'user';
    analysisPassId?: string;
    status: 'active' | 'hidden';
    createdAt: number;
    updatedAt: number;
    revision: number;
}

/** The editable map over immutable passes. One and only one exists per scope. */
export interface HistoricalInterpretationWorkspace {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    contributingPassIds: string[];
    entityIds: string[];
    bindingIds: string[];
    overlayIds: string[];
    createdAt: number;
    updatedAt: number;
    revision: number;
}

/**
 * An append-only user correction. A new revision is another record linked by
 * seriesId/previousOverlayId; pass output and Calendar source stay untouched.
 */
export interface HistoricalUserOverlay {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    id: string;
    seriesId: string;
    previousOverlayId?: string;
    scope: HistoryScope;
    targetKind: HistoryEvidenceTargetKind;
    targetId?: string;
    operation: 'create' | 'update' | 'hide' | 'restore';
    patch: Record<string, unknown>;
    provenance: 'source_linked' | 'user_attested';
    sourceRefs: HistorySourceSpan[];
    authority: 'user_confirmed';
    createdAt: number;
    revision: number;
}

export interface HistoricalEntityProvenance {
    entityId: string;
    candidateIds: string[];
    analysisPassIds: string[];
    bindingIds: string[];
    overlayIds: string[];
    sourceRefs: HistorySourceSpan[];
    provenance: 'source_linked' | 'user_attested';
}

/** A read-only resolved relationship view; never persisted as another archive. */
export interface ResolvedHistoricalInterpretation {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    workspaceId: string;
    workspaceRevision: number;
    scope: HistoryScope;
    contributingPassIds: string[];
    relationshipMemories: HistoricalRelationshipMemory[];
    timebookNodes: HistoricalTimebookNode[];
    narrativeProfile: HistoricalNarrativeProfile | null;
    provenance: HistoricalEntityProvenance[];
}

export interface HistoricalInterpretationBundle {
    workspace: HistoricalInterpretationWorkspace;
    passes: HistoryAnalysisPass[];
    bindings: HistoryEvidenceBinding[];
    overlays: HistoricalUserOverlay[];
}
