import {
    createHistoryScopeKey,
    validateHistoryScope,
    validateHistorySourceTime,
} from '../contract.ts';
import type {
    HistoricalDerivedBase,
    HistoricalNarrativeProfile,
    HistoricalRouteProfile,
    HistoryAnalysisRequest,
    HistoryAnalysisSnapshot,
    HistorySourceSpan,
} from './types.ts';
import { HISTORY_ANALYSIS_SCHEMA_VERSION } from './types.ts';

export const HISTORY_ANALYSIS_IDENTITY_CONTRACT = {
    snapshotIdComponents: ['scopeKey', 'sourceRevisionFingerprint', 'strategy', 'analysisRunId'],
    derivedIdComponents: ['scopeKey', 'kind', 'sourceFamilyKey', 'stableClassifierKey'],
    forbiddenStableIdComponents: ['generatedSummaryText', 'createdAt', 'confidence'],
} as const;

export const HISTORY_ANALYSIS_AUTHORITY_ORDER = [
    'model_reconstructed',
    'source_inferred',
    'source_explicit',
    'user_confirmed',
] as const;

export const HISTORY_ANALYSIS_HOLD = {
    modelExecution: 'hold',
    currentStateWrite: 'hold',
    narrativeRunWrite: 'hold',
    sceneWrite: 'hold',
    experienceReceiptWrite: 'hold',
    characterLifeWrite: 'hold',
} as const;

const forbiddenCurrentStateFields = new Set([
    'activeBuffs',
    'currentCondition',
    'currentLocation',
    'currentMood',
    'currentPressure',
    'currentWhereabouts',
    'pendingCare',
    'activeThreads',
    'storySignals',
    'recentlyMentionedPeople',
    'availability',
    'independentTimeProposal',
    'lifeState',
    'expiresAt',
    'calendarReminder',
    'activeRun',
    'activeScene',
    'experienceReceipt',
]);

const historicalStatuses = new Set([
    'soft_canon',
    'confirmed',
    'stale',
    'archived',
    'discarded',
]);
const historicalAuthorities = new Set(HISTORY_ANALYSIS_AUTHORITY_ORDER);
const historicalContinuities = new Set(['mainline', 'if_line', 'scene_only', 'unknown']);
const historicalSurfaces = new Set([
    'remote_chat',
    'embodied_meeting',
    'coauthored_scene',
    'ooc',
    'mixed',
    'unknown',
]);
const historicalMemoryPolicies = new Set([
    'relationship_echo',
    'narrative_reference',
    'dream_material',
    'source_only',
]);
const historyAnalysisStrategies = new Set(['quick_merge', 'deep_daily']);

const isNonEmpty = (value: string | undefined): boolean => Boolean(value && value.trim());

const scopesMatch = (
    left: HistoricalDerivedBase['scope'],
    right: HistoricalDerivedBase['scope'],
): boolean => createHistoryScopeKey(left) === createHistoryScopeKey(right);

const validateSourceRef = (sourceRef: HistorySourceSpan, label: string): string[] => {
    const errors: string[] = [];
    if (!isNonEmpty(sourceRef.documentId)) errors.push(`${label} documentId is required`);
    if (!Number.isInteger(sourceRef.documentRevision) || sourceRef.documentRevision < 1) {
        errors.push(`${label} documentRevision must be a positive integer`);
    }
    if (!Number.isInteger(sourceRef.startMessageOffset) || sourceRef.startMessageOffset < 0) {
        errors.push(`${label} startMessageOffset must be a non-negative integer`);
    }
    if (
        !Number.isInteger(sourceRef.endMessageOffset)
        || sourceRef.endMessageOffset <= sourceRef.startMessageOffset
    ) {
        errors.push(`${label} endMessageOffset must be greater than startMessageOffset`);
    }
    if (sourceRef.messageIds && new Set(sourceRef.messageIds).size !== sourceRef.messageIds.length) {
        errors.push(`${label} messageIds must be unique`);
    }
    return errors;
};

const validateDerivedBase = (
    value: HistoricalDerivedBase,
    snapshot: HistoryAnalysisSnapshot,
    label: string,
): string[] => {
    const errors = validateHistoryScope(value.scope);
    if (!isNonEmpty(value.id)) errors.push(`${label} id is required`);
    if (!scopesMatch(value.scope, snapshot.scope)) errors.push(`${label} crosses snapshot scope`);
    if (value.temporalClass !== 'historical') errors.push(`${label} must remain historical`);
    if (!historicalAuthorities.has(value.authority)) errors.push(`${label} authority is invalid`);
    if (!historicalStatuses.has(value.status)) errors.push(`${label} status is invalid`);
    if (value.analysisRunId !== snapshot.analysisRunId) errors.push(`${label} crosses analysisRunId`);
    if (!isNonEmpty(value.extractorVersion)) errors.push(`${label} extractorVersion is required`);
    if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
        errors.push(`${label} confidence must be between 0 and 1`);
    }
    if (!Number.isInteger(value.revision) || value.revision < 1) {
        errors.push(`${label} revision must be a positive integer`);
    }
    if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) || value.updatedAt < value.createdAt) {
        errors.push(`${label} timestamps are invalid`);
    }
    if (value.sourceRefs.length < 1) errors.push(`${label} needs at least one sourceRef`);
    value.sourceRefs.forEach((sourceRef, index) => {
        errors.push(...validateSourceRef(sourceRef, `${label}.sourceRefs[${index}]`));
    });
    return errors;
};

const validateRoute = (
    route: HistoricalRouteProfile,
    snapshot: HistoryAnalysisSnapshot,
    label: string,
): string[] => {
    const errors = validateDerivedBase(route, snapshot, label);
    if (!isNonEmpty(route.title)) errors.push(`${label} title is required`);
    if (!isNonEmpty(route.summary)) errors.push(`${label} summary is required`);
    if (!historicalContinuities.has(route.continuity)) errors.push(`${label} continuity is invalid`);
    if (route.surfaces.length < 1 || route.surfaces.some(surface => !historicalSurfaces.has(surface))) {
        errors.push(`${label} surfaces are invalid`);
    }
    if (route.continuity === 'mainline' || route.continuity === 'if_line') {
        if (!isNonEmpty(route.routeId)) errors.push(`${label} ${route.continuity} requires routeId`);
        if (!isNonEmpty(route.branchId)) errors.push(`${label} ${route.continuity} requires branchId`);
    } else if (route.routeId || route.branchId) {
        errors.push(`${label} ${route.continuity} must not invent route or branch identity`);
    }
    if (route.startedAt) errors.push(...validateHistorySourceTime(route.startedAt));
    if (route.endedAt) errors.push(...validateHistorySourceTime(route.endedAt));
    return errors;
};

const validateNarrativeProfile = (
    profile: HistoricalNarrativeProfile,
    snapshot: HistoryAnalysisSnapshot,
): string[] => {
    const errors = validateDerivedBase(profile, snapshot, 'narrativeProfile');
    if (!isNonEmpty(profile.title)) errors.push('narrativeProfile title is required');
    if (!isNonEmpty(profile.summary)) errors.push('narrativeProfile summary is required');
    profile.routes.forEach((route, index) => {
        errors.push(...validateRoute(route, snapshot, `narrativeProfile.routes[${index}]`));
    });
    profile.npcs.forEach((npc, index) => {
        const label = `narrativeProfile.npcs[${index}]`;
        errors.push(...validateDerivedBase(npc, snapshot, label));
        if (!isNonEmpty(npc.npcId)) errors.push(`${label} npcId is required`);
        if (!isNonEmpty(npc.name)) errors.push(`${label} name is required`);
        if (npc.asOf) errors.push(...validateHistorySourceTime(npc.asOf));
    });
    profile.relationshipStages.forEach((stage, index) => {
        const label = `narrativeProfile.relationshipStages[${index}]`;
        errors.push(...validateDerivedBase(stage, snapshot, label));
        if (!isNonEmpty(stage.stageId)) errors.push(`${label} stageId is required`);
        if (!isNonEmpty(stage.label)) errors.push(`${label} label is required`);
        if (!isNonEmpty(stage.summary)) errors.push(`${label} summary is required`);
        if (stage.effectiveFrom) errors.push(...validateHistorySourceTime(stage.effectiveFrom));
        if (stage.effectiveTo) errors.push(...validateHistorySourceTime(stage.effectiveTo));
    });
    profile.openThreads.forEach((thread, index) => {
        const label = `narrativeProfile.openThreads[${index}]`;
        errors.push(...validateDerivedBase(thread, snapshot, label));
        if (!isNonEmpty(thread.threadId)) errors.push(`${label} threadId is required`);
        if (!isNonEmpty(thread.title)) errors.push(`${label} title is required`);
        if (!isNonEmpty(thread.summary)) errors.push(`${label} summary is required`);
        if (thread.lastEvidenceAt) errors.push(...validateHistorySourceTime(thread.lastEvidenceAt));
    });

    const routeIds = new Set(profile.routes.map(route => route.id));
    const npcIds = new Set(profile.npcs.map(npc => npc.id));
    const stageIds = new Set(profile.relationshipStages.map(stage => stage.id));
    const threadIds = new Set(profile.openThreads.map(thread => thread.id));
    profile.routes.forEach(route => {
        route.npcProfileIds.forEach(id => {
            if (!npcIds.has(id)) errors.push(`route ${route.id} points to missing NPC profile ${id}`);
        });
        route.openThreadIds.forEach(id => {
            if (!threadIds.has(id)) errors.push(`route ${route.id} points to missing open thread ${id}`);
        });
        if (route.relationshipStageId && !stageIds.has(route.relationshipStageId)) {
            errors.push(`route ${route.id} points to missing relationship stage ${route.relationshipStageId}`);
        }
    });
    profile.npcs.forEach(npc => {
        if (npc.routeId && !profile.routes.some(route => route.routeId === npc.routeId)) {
            errors.push(`NPC ${npc.id} points to missing routeId ${npc.routeId}`);
        }
    });
    profile.openThreads.forEach(thread => {
        if (thread.routeId && !profile.routes.some(route => route.routeId === thread.routeId)) {
            errors.push(`open thread ${thread.id} points to missing routeId ${thread.routeId}`);
        }
    });
    if (routeIds.size !== profile.routes.length) errors.push('narrative route ids must be unique');
    if (npcIds.size !== profile.npcs.length) errors.push('narrative NPC profile ids must be unique');
    if (stageIds.size !== profile.relationshipStages.length) errors.push('relationship stage ids must be unique');
    if (threadIds.size !== profile.openThreads.length) errors.push('open thread ids must be unique');
    return errors;
};

const findForbiddenFields = (value: unknown, path = 'snapshot'): string[] => {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => findForbiddenFields(item, `${path}[${index}]`));
    }
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
        ...(forbiddenCurrentStateFields.has(key) ? [`${path}.${key} is a forbidden current-state field`] : []),
        ...findForbiddenFields(child, `${path}.${key}`),
    ]);
};

export const validateHistoryAnalysisRequest = (request: HistoryAnalysisRequest): string[] => {
    const errors = validateHistoryScope(request.scope);
    if (request.schemaVersion !== HISTORY_ANALYSIS_SCHEMA_VERSION) errors.push('unsupported analysis request schemaVersion');
    if (!isNonEmpty(request.id)) errors.push('analysis request id is required');
    if (!historyAnalysisStrategies.has(request.strategy)) errors.push('analysis request strategy is invalid');
    if (!isNonEmpty(request.sourceRevisionFingerprint)) errors.push('sourceRevisionFingerprint is required');
    if (request.sourceDocuments.length < 1) errors.push('analysis request needs at least one source document');
    const sourceDocumentIds = new Set<string>();
    request.sourceDocuments.forEach((document, index) => {
        const label = `sourceDocuments[${index}]`;
        if (!isNonEmpty(document.documentId)) errors.push(`${label} documentId is required`);
        if (sourceDocumentIds.has(document.documentId)) errors.push(`${label} documentId must be unique`);
        sourceDocumentIds.add(document.documentId);
        if (!Number.isInteger(document.revision) || document.revision < 1) {
            errors.push(`${label} revision must be a positive integer`);
        }
        if (!Number.isInteger(document.messageCount) || document.messageCount < 1) {
            errors.push(`${label} messageCount must be a positive integer`);
        }
        if (!Number.isInteger(document.estimatedTokens) || document.estimatedTokens < 1) {
            errors.push(`${label} estimatedTokens must be a positive integer`);
        }
    });
    if (request.estimate.strategy !== request.strategy) errors.push('analysis estimate strategy mismatch');
    if (request.estimate.sourceDocumentCount !== request.sourceDocuments.length) {
        errors.push('analysis estimate sourceDocumentCount mismatch');
    }
    if (request.estimate.sourceMessageCount !== request.sourceDocuments.reduce((sum, document) => (
        sum + document.messageCount
    ), 0)) {
        errors.push('analysis estimate sourceMessageCount mismatch');
    }
    for (const field of [
        'estimatedInputTokens',
        'estimatedOutputTokens',
        'estimatedCalls',
        'internalPacketCount',
    ] as const) {
        if (!Number.isInteger(request.estimate[field]) || request.estimate[field] < 1) {
            errors.push(`analysis estimate ${field} must be a positive integer`);
        }
    }
    return errors;
};

export const validateHistoryAnalysisSnapshot = (snapshot: HistoryAnalysisSnapshot): string[] => {
    const errors = [
        ...validateHistoryScope(snapshot.scope),
        ...findForbiddenFields(snapshot),
    ];
    if (snapshot.schemaVersion !== HISTORY_ANALYSIS_SCHEMA_VERSION) errors.push('unsupported analysis snapshot schemaVersion');
    if (!isNonEmpty(snapshot.id)) errors.push('analysis snapshot id is required');
    if (!isNonEmpty(snapshot.requestId)) errors.push('analysis snapshot requestId is required');
    if (!isNonEmpty(snapshot.analysisRunId)) errors.push('analysis snapshot analysisRunId is required');
    if (!isNonEmpty(snapshot.sourceRevisionFingerprint)) errors.push('sourceRevisionFingerprint is required');
    if (!historyAnalysisStrategies.has(snapshot.strategy)) errors.push('analysis snapshot strategy is invalid');
    if (snapshot.temporalClass !== 'historical') errors.push('analysis snapshot must remain historical');
    if (!new Set(['active', 'superseded', 'archived']).has(snapshot.status)) {
        errors.push('analysis snapshot status is invalid');
    }
    if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
        errors.push('analysis snapshot revision must be a positive integer');
    }
    if (
        !Number.isFinite(snapshot.createdAt)
        || !Number.isFinite(snapshot.updatedAt)
        || snapshot.updatedAt < snapshot.createdAt
    ) {
        errors.push('analysis snapshot timestamps are invalid');
    }
    snapshot.relationshipMemories.forEach((memory, index) => {
        const label = `relationshipMemories[${index}]`;
        errors.push(...validateDerivedBase(memory, snapshot, label));
        if (!isNonEmpty(memory.title)) errors.push(`${label} title is required`);
        if (!isNonEmpty(memory.summary)) errors.push(`${label} summary is required`);
        if (!historicalMemoryPolicies.has(memory.memoryPolicy)) errors.push(`${label} memoryPolicy is invalid`);
        if (memory.occurredAt) errors.push(...validateHistorySourceTime(memory.occurredAt));
    });
    snapshot.timebookNodes.forEach((node, index) => {
        const label = `timebookNodes[${index}]`;
        errors.push(...validateDerivedBase(node, snapshot, label));
        if (!isNonEmpty(node.title)) errors.push(`${label} title is required`);
        if (!isNonEmpty(node.summary)) errors.push(`${label} summary is required`);
        if (!historicalContinuities.has(node.continuity)) errors.push(`${label} continuity is invalid`);
        if (!historicalSurfaces.has(node.surface)) errors.push(`${label} surface is invalid`);
        if (node.occurredAt) errors.push(...validateHistorySourceTime(node.occurredAt));
    });
    errors.push(...validateNarrativeProfile(snapshot.narrativeProfile, snapshot));

    const allDerivedIds = [
        ...snapshot.relationshipMemories.map(item => item.id),
        ...snapshot.timebookNodes.map(item => item.id),
        snapshot.narrativeProfile.id,
        ...snapshot.narrativeProfile.routes.map(item => item.id),
        ...snapshot.narrativeProfile.npcs.map(item => item.id),
        ...snapshot.narrativeProfile.relationshipStages.map(item => item.id),
        ...snapshot.narrativeProfile.openThreads.map(item => item.id),
    ];
    if (new Set(allDerivedIds).size !== allDerivedIds.length) {
        errors.push('all derived ids inside one snapshot must be unique');
    }
    return errors;
};
