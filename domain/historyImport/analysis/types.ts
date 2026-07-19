import type {
    HistoryScope,
    HistorySourceTime,
} from '../types.ts';

export const HISTORY_ANALYSIS_SCHEMA_VERSION = 3 as const;

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

/**
 * Who may receive a historical interpretation. This is deliberately stored on
 * every derived entity instead of inferred from the App that happens to read
 * it: one relationship archive must never become public merely because it is
 * opened from a shared surface.
 */
export type HistoricalKnowledgeScope =
    | 'relationship_private'
    | 'char_private'
    | 'user_private'
    | 'shared'
    | 'public_safe';

export interface HistoricalDerivedBase {
    id: string;
    scope: HistoryScope;
    temporalClass: 'historical';
    sourceRefs: HistorySourceSpan[];
    authority: HistoricalAuthority;
    knowledge: HistoricalKnowledgeScope;
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

export type HistoricalActorClass = 'user' | 'character' | 'npc' | 'unknown';
export type HistoricalActorResolution = 'resolved' | 'ambiguous' | 'unresolved';

/**
 * One evidence-linked actor mention. It does not pretend that a turn has only
 * one in-world speaker: a co-authored message may reference any number of
 * actors, and unresolved aliases remain unresolved until evidence supports a
 * merge.
 */
export interface HistoricalActorRef extends HistoricalDerivedBase {
    kind: 'actor_ref';
    actorClass: HistoricalActorClass;
    mention: string;
    aliases: string[];
    resolution: HistoricalActorResolution;
    resolvedNpcProfileId?: string;
    asOf?: HistorySourceTime;
}

/**
 * A neutral historical event reconstructed from one or more source spans.
 * It is not a NarrativeScene and cannot imply that the event is current,
 * played, or confirmed by the player.
 */
export interface HistoricalEventProfile extends HistoricalDerivedBase {
    kind: 'event';
    eventId: string;
    title: string;
    summary: string;
    actorRefIds: string[];
    startedAt?: HistorySourceTime;
    endedAt?: HistorySourceTime;
    surfaces: HistoricalInteractionSurface[];
    location?: string;
    topic?: string;
    objective?: string;
    outcome?: string;
}

/**
 * Many-to-many event/route membership. Sharing one event across mainline, IF,
 * or scene-only routes is legal and never moves it out of a sibling route.
 * Profile ids are explicit so they cannot be confused with the event/route's
 * own semantic ids.
 */
export interface HistoricalEventRouteBinding extends HistoricalDerivedBase {
    kind: 'event_route_binding';
    eventProfileId: string;
    routeProfileId: string;
    continuity: HistoricalContinuity;
    branchId?: string;
}

/**
 * Source-linked historical route material available to a future narrative
 * director. It is not an active run, scene, receipt, or current-life state.
 */
export interface HistoricalNarrativeProfile extends HistoricalDerivedBase {
    kind: 'narrative_profile';
    title: string;
    summary: string;
    actors: HistoricalActorRef[];
    events: HistoricalEventProfile[];
    eventRouteBindings: HistoricalEventRouteBinding[];
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
    | 'actor_ref'
    | 'event'
    | 'event_route_binding'
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

/**
 * History-owned, read-only narrative material. Narrative consumes this port;
 * it does not own or cache historical actors, events, or route bindings.
 */
export interface HistoricalNarrativeProjection {
    schemaVersion: typeof HISTORY_ANALYSIS_SCHEMA_VERSION;
    workspaceId: string;
    workspaceRevision: number;
    scope: HistoryScope;
    temporalClass: 'historical';
    profileId: string;
    title: string;
    summary: string;
    authority: HistoricalAuthority;
    knowledge: HistoricalKnowledgeScope;
    status: HistoricalResultStatus;
    sourceRefs: HistorySourceSpan[];
    actors: HistoricalActorRef[];
    events: HistoricalEventProfile[];
    eventRouteBindings: HistoricalEventRouteBinding[];
    routes: HistoricalRouteProfile[];
    npcs: HistoricalNpcProfile[];
    relationshipStages: HistoricalRelationshipStage[];
    openThreads: HistoricalOpenThread[];
}

export interface HistoricalInterpretationBundle {
    workspace: HistoricalInterpretationWorkspace;
    passes: HistoryAnalysisPass[];
    bindings: HistoryEvidenceBinding[];
    overlays: HistoricalUserOverlay[];
}
