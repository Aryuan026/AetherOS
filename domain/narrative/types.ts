export type NarrativeSurfaceId =
    | 'consult_desk'
    | 'novel'
    | 'date'
    | 'guidebook'
    | 'special_moments'
    | 'check_phone'
    | 'game'
    | 'lifesim'
    | 'timebook'
    | 'chat'
    | 'social_feed';

export type NarrativeLane =
    | 'mainline'
    | 'pending_mainline'
    | 'if_line'
    | 'date_experience'
    | 'keepsake_event'
    | 'user_insight'
    | 'supporting_evidence'
    | 'sandbox'
    | 'draft';

export type NarrativeMemoryPolicy =
    | 'main_vault'
    | 'manual_promotion'
    | 'relationship_echo'
    | 'character_private'
    | 'dream_material'
    | 'excluded_from_main_vault'
    | 'local_keepsake'
    | 'system_trace';

export type NarrativeDirectiveStatus =
    | 'pending'
    | 'activated'
    | 'played'
    | 'archived'
    | 'discarded';

export interface NarrativeDirectiveSourceRef {
    surface: NarrativeSurfaceId;
    id?: string;
    label?: string;
}

export interface NarrativeDirective {
    id: string;
    title: string;
    summary: string;
    lane: NarrativeLane;
    status: NarrativeDirectiveStatus;
    sourceSurface: NarrativeSurfaceId;
    targetSurface?: NarrativeSurfaceId;
    charIds: string[];
    npcNames?: string[];
    tags?: string[];
    constraints?: string[];
    activationHint?: string;
    memoryPolicy: NarrativeMemoryPolicy;
    sourceRefs?: NarrativeDirectiveSourceRef[];
    progressBundleId?: string;
    routeId?: string;
    branchId?: string;
    parentDirectiveId?: string;
    activationMode?: 'manual' | 'after_scene' | 'after_condition';
    activationCondition?: string;
    createdAt: number;
    updatedAt: number;
    playedAt?: number;
    dreamDelivery?: {
        charId: string;
        tone?: 'soft' | 'uneasy' | 'romantic' | 'ominous' | 'playful';
        instruction: string;
        deliveredAt?: number;
    };
}

export type NarrativeRunLane = 'mainline' | 'if_line';

export type NarrativeRunStatus =
    | 'draft'
    | 'active'
    | 'paused'
    | 'completed'
    | 'abandoned';

export interface NarrativeNpcState {
    id: string;
    name: string;
    disposition?: string;
    location?: string;
    condition?: string;
    knownFacts: string[];
    updatedAt: number;
}

export interface NarrativeOpenThread {
    id: string;
    title: string;
    status: 'open' | 'resolved' | 'dormant';
    sourceSceneId?: string;
}

export type NarrativeRouteState = Record<string, string | number | boolean>;

export interface NarrativeRun {
    id: string;
    progressBundleId: string;
    bookId?: string;
    routeId: string;
    branchId: string;
    lane: NarrativeRunLane;
    status: NarrativeRunStatus;
    participantCharIds: string[];
    activeSceneId?: string;
    directiveIds: string[];
    routeSummary?: string;
    routeState: NarrativeRouteState;
    npcStates: NarrativeNpcState[];
    openThreads: NarrativeOpenThread[];
    startedAt: number;
    updatedAt: number;
    completedAt?: number;
}

export type NarrativeSceneStatus =
    | 'planned'
    | 'active'
    | 'played'
    | 'confirmed'
    | 'discarded';

export type NarrativeBeatKind =
    | 'narration'
    | 'dialogue'
    | 'choice'
    | 'user_action'
    | 'system_note';

export interface NarrativeBeat {
    id: string;
    kind: NarrativeBeatKind;
    authorId?: string;
    content: string;
    createdAt: number;
}

export interface NarrativeScene {
    id: string;
    runId: string;
    status: NarrativeSceneStatus;
    title: string;
    location?: string;
    participantIds: string[];
    objective?: string;
    constraints: string[];
    beats: NarrativeBeat[];
    openedAt?: number;
    playedAt?: number;
    confirmedAt?: number;
}

export type NarrativeReceiptMemoryPolicy =
    | 'main_vault'
    | 'relationship_echo'
    | 'dream_material'
    | 'excluded_from_main_vault';

export interface NarrativeExperienceReceipt {
    id: string;
    progressBundleId: string;
    runId: string;
    sceneId: string;
    lane: NarrativeRunLane;
    participantCharIds: string[];
    summary: string;
    acceptedFacts: string[];
    rejectedOrEditedFacts?: string[];
    lifeEventIds?: string[];
    memoryPolicy: NarrativeReceiptMemoryPolicy;
    confirmedByUser: boolean;
    playedAt: number;
    confirmedAt?: number;
}

export interface NovelNarrativeState {
    schemaVersion: 1;
    runs: NarrativeRun[];
    scenes: NarrativeScene[];
    receipts: NarrativeExperienceReceipt[];
    activeRunId?: string;
    updatedAt: number;
}
