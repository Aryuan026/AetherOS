import {
    createHistoryScopeKey,
    validateHistoryScope,
    validateHistorySourceTime,
} from '../contract.ts';
import type {
    HistoricalDerivedBase,
    HistoricalInterpretationWorkspace,
    HistoricalNarrativeProfile,
    HistoricalRouteProfile,
    HistoricalUserOverlay,
    HistoryAnalysisPass,
    HistoryAnalysisRequest,
    HistoryEvidenceBinding,
    HistorySourceSpan,
} from './types.ts';
import { HISTORY_ANALYSIS_SCHEMA_VERSION } from './types.ts';

export const HISTORY_ANALYSIS_IDENTITY_CONTRACT = {
    passIdComponents: ['scopeKey', 'sourceRevisionFingerprint', 'strategy', 'analysisRunId'],
    workspaceIdComponents: ['scopeKey'],
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
const evidenceTargetKinds = new Set([
    'relationship_memory',
    'timebook_node',
    'route',
    'npc',
    'relationship_stage',
    'open_thread',
]);
const evidencePurposes = new Set(['evidence', 'scene', 'turning_point', 'relationship_change']);
const editableOverlayFields = {
    relationship_memory: new Set(['title', 'summary', 'occurredAt', 'memoryPolicy']),
    timebook_node: new Set(['title', 'summary', 'occurredAt', 'continuity', 'surface']),
    route: new Set([
        'title', 'summary', 'continuity', 'routeId', 'branchId', 'startedAt', 'endedAt',
        'relationshipStageId', 'npcProfileIds', 'openThreadIds', 'surfaces',
    ]),
    npc: new Set([
        'npcId', 'routeId', 'branchId', 'name', 'aliases', 'relationshipRole',
        'knownHistoricalFacts', 'lastHistoricalState', 'asOf',
    ]),
    relationship_stage: new Set([
        'stageId', 'label', 'summary', 'effectiveFrom', 'effectiveTo', 'evidenceMarkers',
    ]),
    open_thread: new Set([
        'threadId', 'routeId', 'branchId', 'title', 'summary', 'state',
        'continuationHint', 'lastEvidenceAt',
    ]),
} as const;

const isNonEmpty = (value: string | undefined): boolean => Boolean(value && value.trim());

const scopesMatch = (
    left: HistoricalDerivedBase['scope'],
    right: HistoricalDerivedBase['scope'],
): boolean => createHistoryScopeKey(left) === createHistoryScopeKey(right);

export const validateHistorySourceSpan = (sourceRef: HistorySourceSpan, label: string): string[] => {
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
    pass: HistoryAnalysisPass,
    label: string,
): string[] => {
    const errors = validateHistoryScope(value.scope);
    if (!isNonEmpty(value.id)) errors.push(`${label} id is required`);
    if (!scopesMatch(value.scope, pass.scope)) errors.push(`${label} crosses analysis pass scope`);
    if (value.temporalClass !== 'historical') errors.push(`${label} must remain historical`);
    if (!historicalAuthorities.has(value.authority)) errors.push(`${label} authority is invalid`);
    if (!historicalStatuses.has(value.status)) errors.push(`${label} status is invalid`);
    if (value.analysisRunId !== pass.analysisRunId) errors.push(`${label} crosses analysisRunId`);
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
        errors.push(...validateHistorySourceSpan(sourceRef, `${label}.sourceRefs[${index}]`));
    });
    return errors;
};

const validateRoute = (
    route: HistoricalRouteProfile,
    pass: HistoryAnalysisPass,
    label: string,
): string[] => {
    const errors = validateDerivedBase(route, pass, label);
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
    pass: HistoryAnalysisPass,
): string[] => {
    const errors = validateDerivedBase(profile, pass, 'narrativeProfile');
    if (!isNonEmpty(profile.title)) errors.push('narrativeProfile title is required');
    if (!isNonEmpty(profile.summary)) errors.push('narrativeProfile summary is required');
    profile.routes.forEach((route, index) => {
        errors.push(...validateRoute(route, pass, `narrativeProfile.routes[${index}]`));
    });
    profile.npcs.forEach((npc, index) => {
        const label = `narrativeProfile.npcs[${index}]`;
        errors.push(...validateDerivedBase(npc, pass, label));
        if (!isNonEmpty(npc.npcId)) errors.push(`${label} npcId is required`);
        if (!isNonEmpty(npc.name)) errors.push(`${label} name is required`);
        if (npc.asOf) errors.push(...validateHistorySourceTime(npc.asOf));
    });
    profile.relationshipStages.forEach((stage, index) => {
        const label = `narrativeProfile.relationshipStages[${index}]`;
        errors.push(...validateDerivedBase(stage, pass, label));
        if (!isNonEmpty(stage.stageId)) errors.push(`${label} stageId is required`);
        if (!isNonEmpty(stage.label)) errors.push(`${label} label is required`);
        if (!isNonEmpty(stage.summary)) errors.push(`${label} summary is required`);
        if (stage.effectiveFrom) errors.push(...validateHistorySourceTime(stage.effectiveFrom));
        if (stage.effectiveTo) errors.push(...validateHistorySourceTime(stage.effectiveTo));
    });
    profile.openThreads.forEach((thread, index) => {
        const label = `narrativeProfile.openThreads[${index}]`;
        errors.push(...validateDerivedBase(thread, pass, label));
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

export const findForbiddenHistoricalFields = (value: unknown, path = 'historyAnalysis'): string[] => {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => findForbiddenHistoricalFields(item, `${path}[${index}]`));
    }
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
        ...(forbiddenCurrentStateFields.has(key) ? [`${path}.${key} is a forbidden current-state field`] : []),
        ...findForbiddenHistoricalFields(child, `${path}.${key}`),
    ]);
};

const validateUniqueIds = (ids: string[], label: string): string[] => {
    const errors: string[] = [];
    if (ids.some(id => !isNonEmpty(id))) errors.push(`${label} must contain only non-empty ids`);
    if (new Set(ids).size !== ids.length) errors.push(`${label} must be unique`);
    return errors;
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

export const validateHistoryAnalysisPass = (pass: HistoryAnalysisPass): string[] => {
    const errors = [
        ...validateHistoryScope(pass.scope),
        ...findForbiddenHistoricalFields(pass, 'analysisPass'),
    ];
    if (pass.schemaVersion !== HISTORY_ANALYSIS_SCHEMA_VERSION) errors.push('unsupported analysis pass schemaVersion');
    if (!isNonEmpty(pass.id)) errors.push('analysis pass id is required');
    if (!isNonEmpty(pass.requestId)) errors.push('analysis pass requestId is required');
    if (!isNonEmpty(pass.analysisRunId)) errors.push('analysis pass analysisRunId is required');
    if (!isNonEmpty(pass.sourceRevisionFingerprint)) errors.push('sourceRevisionFingerprint is required');
    if (!historyAnalysisStrategies.has(pass.strategy)) errors.push('analysis pass strategy is invalid');
    if (pass.temporalClass !== 'historical') errors.push('analysis pass must remain historical');
    if (pass.status !== 'completed') errors.push('analysis pass must be immutable and completed');
    if (!Number.isFinite(pass.createdAt) || !Number.isFinite(pass.completedAt) || pass.completedAt < pass.createdAt) {
        errors.push('analysis pass timestamps are invalid');
    }
    if (pass.sourceRefs.length < 1) errors.push('analysis pass needs at least one sourceRef');
    pass.sourceRefs.forEach((sourceRef, index) => {
        errors.push(...validateHistorySourceSpan(sourceRef, `analysisPass.sourceRefs[${index}]`));
    });
    pass.relationshipMemories.forEach((memory, index) => {
        const label = `relationshipMemories[${index}]`;
        errors.push(...validateDerivedBase(memory, pass, label));
        if (!isNonEmpty(memory.title)) errors.push(`${label} title is required`);
        if (!isNonEmpty(memory.summary)) errors.push(`${label} summary is required`);
        if (!historicalMemoryPolicies.has(memory.memoryPolicy)) errors.push(`${label} memoryPolicy is invalid`);
        if (memory.occurredAt) errors.push(...validateHistorySourceTime(memory.occurredAt));
    });
    pass.timebookNodes.forEach((node, index) => {
        const label = `timebookNodes[${index}]`;
        errors.push(...validateDerivedBase(node, pass, label));
        if (!isNonEmpty(node.title)) errors.push(`${label} title is required`);
        if (!isNonEmpty(node.summary)) errors.push(`${label} summary is required`);
        if (!historicalContinuities.has(node.continuity)) errors.push(`${label} continuity is invalid`);
        if (!historicalSurfaces.has(node.surface)) errors.push(`${label} surface is invalid`);
        if (node.occurredAt) errors.push(...validateHistorySourceTime(node.occurredAt));
    });
    errors.push(...validateNarrativeProfile(pass.narrativeProfile, pass));

    const allDerivedIds = [
        ...pass.relationshipMemories.map(item => item.id),
        ...pass.timebookNodes.map(item => item.id),
        pass.narrativeProfile.id,
        ...pass.narrativeProfile.routes.map(item => item.id),
        ...pass.narrativeProfile.npcs.map(item => item.id),
        ...pass.narrativeProfile.relationshipStages.map(item => item.id),
        ...pass.narrativeProfile.openThreads.map(item => item.id),
    ];
    if (new Set(allDerivedIds).size !== allDerivedIds.length) {
        errors.push('all derived ids inside one analysis pass must be unique');
    }
    return errors;
};

export const validateHistoricalInterpretationWorkspace = (
    workspace: HistoricalInterpretationWorkspace,
): string[] => {
    const errors = [
        ...validateHistoryScope(workspace.scope),
        ...findForbiddenHistoricalFields(workspace, 'interpretationWorkspace'),
    ];
    if (workspace.schemaVersion !== HISTORY_ANALYSIS_SCHEMA_VERSION) errors.push('unsupported workspace schemaVersion');
    if (!isNonEmpty(workspace.id)) errors.push('workspace id is required');
    errors.push(...validateUniqueIds(workspace.contributingPassIds, 'workspace contributingPassIds'));
    errors.push(...validateUniqueIds(workspace.entityIds, 'workspace entityIds'));
    errors.push(...validateUniqueIds(workspace.bindingIds, 'workspace bindingIds'));
    errors.push(...validateUniqueIds(workspace.overlayIds, 'workspace overlayIds'));
    if (!Number.isInteger(workspace.revision) || workspace.revision < 1) {
        errors.push('workspace revision must be a positive integer');
    }
    if (!Number.isFinite(workspace.createdAt) || !Number.isFinite(workspace.updatedAt) || workspace.updatedAt < workspace.createdAt) {
        errors.push('workspace timestamps are invalid');
    }
    return errors;
};

export const validateHistoryEvidenceBinding = (binding: HistoryEvidenceBinding): string[] => {
    const errors = [
        ...validateHistoryScope(binding.scope),
        ...findForbiddenHistoricalFields(binding, 'evidenceBinding'),
        ...validateHistorySourceSpan(binding.sourceRef, 'evidenceBinding.sourceRef'),
    ];
    if (binding.schemaVersion !== HISTORY_ANALYSIS_SCHEMA_VERSION) errors.push('unsupported evidence binding schemaVersion');
    if (!isNonEmpty(binding.id)) errors.push('evidence binding id is required');
    if (!evidenceTargetKinds.has(binding.targetKind)) errors.push('evidence binding targetKind is invalid');
    if (!isNonEmpty(binding.targetId)) errors.push('evidence binding targetId is required');
    if (!evidencePurposes.has(binding.purpose)) errors.push('evidence binding purpose is invalid');
    if (binding.origin === 'analysis' && !isNonEmpty(binding.analysisPassId)) {
        errors.push('analysis evidence binding requires analysisPassId');
    }
    if (binding.origin === 'user' && binding.analysisPassId) {
        errors.push('user evidence binding must not claim analysisPassId');
    }
    if (binding.status !== 'active' && binding.status !== 'hidden') {
        errors.push('evidence binding status is invalid');
    }
    if (!Number.isFinite(binding.createdAt) || !Number.isFinite(binding.updatedAt) || binding.updatedAt < binding.createdAt) {
        errors.push('evidence binding timestamps are invalid');
    }
    if (!Number.isInteger(binding.revision) || binding.revision < 1) {
        errors.push('evidence binding revision must be a positive integer');
    }
    return errors;
};

export const validateHistoricalUserOverlay = (overlay: HistoricalUserOverlay): string[] => {
    const errors = [
        ...validateHistoryScope(overlay.scope),
        ...findForbiddenHistoricalFields(overlay, 'userOverlay'),
    ];
    if (overlay.schemaVersion !== HISTORY_ANALYSIS_SCHEMA_VERSION) errors.push('unsupported user overlay schemaVersion');
    if (!isNonEmpty(overlay.id)) errors.push('user overlay id is required');
    if (!isNonEmpty(overlay.seriesId)) errors.push('user overlay seriesId is required');
    if (!evidenceTargetKinds.has(overlay.targetKind)) errors.push('user overlay targetKind is invalid');
    const editableFields = editableOverlayFields[overlay.targetKind] as ReadonlySet<string> | undefined;
    const nonEditableFields = Object.keys(overlay.patch).filter(field => !editableFields?.has(field));
    if (nonEditableFields.length > 0) {
        errors.push(`user overlay contains non-editable fields: ${nonEditableFields.join(', ')}`);
    }
    if (overlay.operation === 'create') {
        if (overlay.targetId) errors.push('create overlay must not claim an existing targetId');
        const requiredFields = overlay.targetKind === 'npc'
            ? ['name']
            : overlay.targetKind === 'relationship_stage'
                ? ['label', 'summary']
                : ['title', 'summary'];
        requiredFields.forEach(field => {
            const value = overlay.patch[field];
            if (typeof value !== 'string' || !value.trim()) {
                errors.push(`create overlay requires ${field}`);
            }
        });
    } else if (!isNonEmpty(overlay.targetId)) {
        errors.push(`${overlay.operation} overlay requires targetId`);
    }
    if (overlay.operation === 'update' && Object.keys(overlay.patch).length < 1) {
        errors.push('update overlay patch must not be empty');
    }
    if (overlay.operation === 'hide' || overlay.operation === 'restore') {
        if (Object.keys(overlay.patch).length > 0) errors.push(`${overlay.operation} overlay patch must be empty`);
    }
    if (overlay.provenance === 'source_linked' && overlay.sourceRefs.length < 1) {
        errors.push('source-linked overlay needs at least one sourceRef');
    }
    if (overlay.provenance === 'user_attested' && overlay.sourceRefs.length > 0) {
        errors.push('user-attested overlay must not masquerade as source-linked');
    }
    overlay.sourceRefs.forEach((sourceRef, index) => {
        errors.push(...validateHistorySourceSpan(sourceRef, `userOverlay.sourceRefs[${index}]`));
    });
    if (overlay.authority !== 'user_confirmed') errors.push('user overlay authority must be user_confirmed');
    if (!Number.isFinite(overlay.createdAt)) errors.push('user overlay createdAt is invalid');
    if (!Number.isInteger(overlay.revision) || overlay.revision < 1) {
        errors.push('user overlay revision must be a positive integer');
    }
    if (overlay.revision === 1 && overlay.previousOverlayId) {
        errors.push('first user overlay revision must not have previousOverlayId');
    }
    if (overlay.revision > 1 && !isNonEmpty(overlay.previousOverlayId)) {
        errors.push('later user overlay revision requires previousOverlayId');
    }
    return errors;
};
