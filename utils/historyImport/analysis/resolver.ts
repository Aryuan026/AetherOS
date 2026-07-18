import type {
    HistoricalDerivedBase,
    HistoricalEntityProvenance,
    HistoricalInterpretationBundle,
    HistoricalNarrativeProfile,
    HistoricalNpcProfile,
    HistoricalOpenThread,
    HistoricalRelationshipMemory,
    HistoricalRelationshipStage,
    HistoricalRouteProfile,
    HistoricalTimebookNode,
    HistoricalUserOverlay,
    HistoryEvidenceTargetKind,
    HistorySourceSpan,
    ResolvedHistoricalInterpretation,
} from '../../../domain/historyImport/analysis/types.ts';
import { HISTORY_ANALYSIS_AUTHORITY_ORDER } from '../../../domain/historyImport/analysis/contract.ts';
import { createHistoryScopeKey } from '../../../domain/historyImport/contract.ts';
import { createHistoricalUserEntityId } from './indexedDbAnalysis.ts';

type ResolvableEntity =
    | HistoricalRelationshipMemory
    | HistoricalTimebookNode
    | HistoricalRouteProfile
    | HistoricalNpcProfile
    | HistoricalRelationshipStage
    | HistoricalOpenThread;

interface EntityEntry<T extends ResolvableEntity = ResolvableEntity> {
    entity: T;
    candidateIds: string[];
    analysisPassIds: string[];
    bindingIds: string[];
    overlayIds: string[];
    provenance: 'source_linked' | 'user_attested';
}

const clone = <T>(value: T): T => {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const isVisible = (value: HistoricalDerivedBase): boolean => (
    value.status === 'soft_canon' || value.status === 'confirmed'
);

const stableSourceRefKey = (sourceRef: HistorySourceSpan): string => JSON.stringify({
    documentId: sourceRef.documentId,
    documentRevision: sourceRef.documentRevision,
    dateKey: sourceRef.dateKey,
    startMessageOffset: sourceRef.startMessageOffset,
    endMessageOffset: sourceRef.endMessageOffset,
    messageIds: sourceRef.messageIds ?? [],
});

const mergeSourceRefs = (...groups: HistorySourceSpan[][]): HistorySourceSpan[] => {
    const byKey = new Map<string, HistorySourceSpan>();
    groups.flat().forEach(sourceRef => byKey.set(stableSourceRefKey(sourceRef), clone(sourceRef)));
    return [...byKey.values()];
};

const strongerAuthority = (
    left: HistoricalDerivedBase['authority'],
    right: HistoricalDerivedBase['authority'],
): HistoricalDerivedBase['authority'] => (
    HISTORY_ANALYSIS_AUTHORITY_ORDER.indexOf(left) >= HISTORY_ANALYSIS_AUTHORITY_ORDER.indexOf(right)
        ? left
        : right
);

const HISTORICAL_KNOWLEDGE_PRIVACY_ORDER: HistoricalDerivedBase['knowledge'][] = [
    'public_safe',
    'shared',
    'relationship_private',
    'char_private',
    'user_private',
];

const morePrivateKnowledge = (
    left: HistoricalDerivedBase['knowledge'],
    right: HistoricalDerivedBase['knowledge'],
): HistoricalDerivedBase['knowledge'] => (
    HISTORICAL_KNOWLEDGE_PRIVACY_ORDER.indexOf(left) >= HISTORICAL_KNOWLEDGE_PRIVACY_ORDER.indexOf(right)
        ? left
        : right
);

const entityKind = (entity: ResolvableEntity): HistoryEvidenceTargetKind => entity.kind;

const editableFields: Record<HistoryEvidenceTargetKind, readonly string[]> = {
    relationship_memory: ['title', 'summary', 'occurredAt', 'memoryPolicy'],
    timebook_node: ['title', 'summary', 'occurredAt', 'continuity', 'surface'],
    route: [
        'title', 'summary', 'continuity', 'routeId', 'branchId', 'startedAt', 'endedAt',
        'relationshipStageId', 'npcProfileIds', 'openThreadIds', 'surfaces',
    ],
    npc: [
        'npcId', 'routeId', 'branchId', 'name', 'aliases', 'relationshipRole',
        'knownHistoricalFacts', 'lastHistoricalState', 'asOf',
    ],
    relationship_stage: [
        'stageId', 'label', 'summary', 'effectiveFrom', 'effectiveTo', 'evidenceMarkers',
    ],
    open_thread: [
        'threadId', 'routeId', 'branchId', 'title', 'summary', 'state',
        'continuationHint', 'lastEvidenceAt',
    ],
};

const assertEditablePatch = (overlay: HistoricalUserOverlay): void => {
    const allowed = new Set(editableFields[overlay.targetKind]);
    const unknown = Object.keys(overlay.patch).filter(key => !allowed.has(key));
    if (unknown.length > 0) {
        throw new Error(`user overlay ${overlay.id} contains non-editable fields: ${unknown.join(', ')}`);
    }
};

const userBase = (
    overlay: HistoricalUserOverlay,
    id: string,
): HistoricalDerivedBase => ({
    id,
    scope: { ...overlay.scope },
    temporalClass: 'historical',
    sourceRefs: clone(overlay.sourceRefs),
    authority: 'user_confirmed',
    knowledge: 'relationship_private',
    confidence: 1,
    status: 'confirmed',
    analysisRunId: `user-overlay:${overlay.seriesId}`,
    extractorVersion: 'historical-user-overlay-v2',
    createdAt: overlay.createdAt,
    updatedAt: overlay.createdAt,
    revision: overlay.revision,
});

const requiredString = (patch: Record<string, unknown>, field: string, overlayId: string): string => {
    const value = patch[field];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`create overlay ${overlayId} requires ${field}`);
    }
    return value.trim();
};

const createEntityFromOverlay = (overlay: HistoricalUserOverlay): ResolvableEntity => {
    assertEditablePatch(overlay);
    const id = createHistoricalUserEntityId(overlay.seriesId);
    const base = userBase(overlay, id);
    switch (overlay.targetKind) {
        case 'relationship_memory':
            return {
                ...base,
                kind: 'relationship_memory',
                title: requiredString(overlay.patch, 'title', overlay.id),
                summary: requiredString(overlay.patch, 'summary', overlay.id),
                occurredAt: clone(overlay.patch.occurredAt) as HistoricalRelationshipMemory['occurredAt'],
                memoryPolicy: (overlay.patch.memoryPolicy as HistoricalRelationshipMemory['memoryPolicy'])
                    ?? 'relationship_echo',
            };
        case 'timebook_node':
            return {
                ...base,
                kind: 'timebook_node',
                title: requiredString(overlay.patch, 'title', overlay.id),
                summary: requiredString(overlay.patch, 'summary', overlay.id),
                occurredAt: clone(overlay.patch.occurredAt) as HistoricalTimebookNode['occurredAt'],
                continuity: (overlay.patch.continuity as HistoricalTimebookNode['continuity']) ?? 'unknown',
                surface: (overlay.patch.surface as HistoricalTimebookNode['surface']) ?? 'unknown',
            };
        case 'route': {
            const continuity = (overlay.patch.continuity as HistoricalRouteProfile['continuity']) ?? 'unknown';
            return {
                ...base,
                kind: 'route',
                continuity,
                routeId: (overlay.patch.routeId as string | undefined)
                    ?? (continuity === 'mainline' || continuity === 'if_line' ? id : undefined),
                branchId: (overlay.patch.branchId as string | undefined)
                    ?? (continuity === 'mainline' || continuity === 'if_line' ? `${id}:branch` : undefined),
                title: requiredString(overlay.patch, 'title', overlay.id),
                summary: requiredString(overlay.patch, 'summary', overlay.id),
                startedAt: clone(overlay.patch.startedAt) as HistoricalRouteProfile['startedAt'],
                endedAt: clone(overlay.patch.endedAt) as HistoricalRouteProfile['endedAt'],
                relationshipStageId: overlay.patch.relationshipStageId as string | undefined,
                npcProfileIds: clone(overlay.patch.npcProfileIds as string[] | undefined) ?? [],
                openThreadIds: clone(overlay.patch.openThreadIds as string[] | undefined) ?? [],
                surfaces: clone(overlay.patch.surfaces as HistoricalRouteProfile['surfaces'] | undefined) ?? ['unknown'],
            };
        }
        case 'npc':
            return {
                ...base,
                kind: 'npc',
                npcId: (overlay.patch.npcId as string | undefined) ?? id,
                routeId: overlay.patch.routeId as string | undefined,
                branchId: overlay.patch.branchId as string | undefined,
                name: requiredString(overlay.patch, 'name', overlay.id),
                aliases: clone(overlay.patch.aliases as string[] | undefined) ?? [],
                relationshipRole: overlay.patch.relationshipRole as string | undefined,
                knownHistoricalFacts: clone(overlay.patch.knownHistoricalFacts as string[] | undefined) ?? [],
                lastHistoricalState: overlay.patch.lastHistoricalState as string | undefined,
                asOf: clone(overlay.patch.asOf) as HistoricalNpcProfile['asOf'],
            };
        case 'relationship_stage':
            return {
                ...base,
                kind: 'relationship_stage',
                stageId: (overlay.patch.stageId as string | undefined) ?? id,
                label: requiredString(overlay.patch, 'label', overlay.id),
                summary: requiredString(overlay.patch, 'summary', overlay.id),
                effectiveFrom: clone(overlay.patch.effectiveFrom) as HistoricalRelationshipStage['effectiveFrom'],
                effectiveTo: clone(overlay.patch.effectiveTo) as HistoricalRelationshipStage['effectiveTo'],
                evidenceMarkers: clone(overlay.patch.evidenceMarkers as string[] | undefined) ?? [],
            };
        case 'open_thread':
            return {
                ...base,
                kind: 'open_thread',
                threadId: (overlay.patch.threadId as string | undefined) ?? id,
                routeId: overlay.patch.routeId as string | undefined,
                branchId: overlay.patch.branchId as string | undefined,
                title: requiredString(overlay.patch, 'title', overlay.id),
                summary: requiredString(overlay.patch, 'summary', overlay.id),
                state: (overlay.patch.state as HistoricalOpenThread['state']) ?? 'uncertain',
                continuationHint: overlay.patch.continuationHint as string | undefined,
                lastEvidenceAt: clone(overlay.patch.lastEvidenceAt) as HistoricalOpenThread['lastEvidenceAt'],
            };
    }
};

const applyOverlay = (entry: EntityEntry, overlay: HistoricalUserOverlay): EntityEntry => {
    if (entityKind(entry.entity) !== overlay.targetKind) {
        throw new Error(`user overlay ${overlay.id} target kind does not match ${entry.entity.id}`);
    }
    assertEditablePatch(overlay);
    const next = clone(entry.entity) as ResolvableEntity;
    if (overlay.operation === 'update') {
        Object.assign(next, clone(overlay.patch));
        next.authority = 'user_confirmed';
        next.status = 'confirmed';
        next.sourceRefs = mergeSourceRefs(next.sourceRefs, overlay.sourceRefs);
        next.updatedAt = overlay.createdAt;
        next.revision += 1;
    } else if (overlay.operation === 'hide') {
        next.status = 'discarded';
        next.authority = 'user_confirmed';
        next.updatedAt = overlay.createdAt;
        next.revision += 1;
    } else if (overlay.operation === 'restore') {
        next.status = 'confirmed';
        next.authority = 'user_confirmed';
        next.updatedAt = overlay.createdAt;
        next.revision += 1;
    } else {
        throw new Error(`create overlay ${overlay.id} cannot target an existing entity`);
    }
    return {
        ...entry,
        entity: next,
        overlayIds: [...entry.overlayIds, overlay.id],
    };
};

const semanticKey = (entity: ResolvableEntity): string => {
    switch (entity.kind) {
        case 'relationship_memory':
            return JSON.stringify([entity.kind, entity.title, entity.summary, entity.occurredAt, entity.memoryPolicy]);
        case 'timebook_node':
            return JSON.stringify([entity.kind, entity.title, entity.summary, entity.occurredAt, entity.continuity, entity.surface]);
        case 'route':
            return JSON.stringify([
                entity.kind, entity.continuity, entity.routeId, entity.branchId, entity.title, entity.summary,
                entity.startedAt, entity.endedAt, entity.surfaces,
            ]);
        case 'npc':
            return JSON.stringify([
                entity.kind, entity.npcId, entity.routeId, entity.branchId, entity.name, entity.aliases,
                entity.relationshipRole, entity.knownHistoricalFacts, entity.lastHistoricalState, entity.asOf,
            ]);
        case 'relationship_stage':
            return JSON.stringify([
                entity.kind, entity.stageId, entity.label, entity.summary, entity.effectiveFrom,
                entity.effectiveTo, entity.evidenceMarkers,
            ]);
        case 'open_thread':
            return JSON.stringify([
                entity.kind, entity.threadId, entity.routeId, entity.branchId, entity.title, entity.summary,
                entity.state, entity.continuationHint, entity.lastEvidenceAt,
            ]);
    }
};

const mergeEntries = <T extends ResolvableEntity>(left: EntityEntry<T>, right: EntityEntry<T>): EntityEntry<T> => {
    const merged = clone(left.entity);
    merged.sourceRefs = mergeSourceRefs(left.entity.sourceRefs, right.entity.sourceRefs);
    merged.authority = strongerAuthority(left.entity.authority, right.entity.authority);
    merged.knowledge = morePrivateKnowledge(left.entity.knowledge, right.entity.knowledge);
    merged.confidence = Math.max(left.entity.confidence, right.entity.confidence);
    merged.status = left.entity.status === 'confirmed' || right.entity.status === 'confirmed'
        ? 'confirmed'
        : left.entity.status;
    merged.createdAt = Math.min(left.entity.createdAt, right.entity.createdAt);
    merged.updatedAt = Math.max(left.entity.updatedAt, right.entity.updatedAt);
    merged.revision = Math.max(left.entity.revision, right.entity.revision);
    if (merged.kind === 'route' && right.entity.kind === 'route') {
        merged.npcProfileIds = unique([...merged.npcProfileIds, ...right.entity.npcProfileIds]);
        merged.openThreadIds = unique([...merged.openThreadIds, ...right.entity.openThreadIds]);
        merged.surfaces = unique([...merged.surfaces, ...right.entity.surfaces]);
        merged.relationshipStageId ??= right.entity.relationshipStageId;
    }
    return {
        entity: merged,
        candidateIds: unique([...left.candidateIds, ...right.candidateIds]),
        analysisPassIds: unique([...left.analysisPassIds, ...right.analysisPassIds]),
        bindingIds: unique([...left.bindingIds, ...right.bindingIds]),
        overlayIds: unique([...left.overlayIds, ...right.overlayIds]),
        provenance: left.provenance === 'source_linked' || right.provenance === 'source_linked'
            ? 'source_linked'
            : 'user_attested',
    };
};

const coalesce = <T extends ResolvableEntity>(entries: EntityEntry<T>[]): {
    entries: EntityEntry<T>[];
    alias: Map<string, string>;
} => {
    const byKey = new Map<string, EntityEntry<T>>();
    for (const entry of entries.filter(item => isVisible(item.entity))) {
        const key = semanticKey(entry.entity);
        const existing = byKey.get(key);
        byKey.set(key, existing ? mergeEntries(existing, entry) : clone(entry));
    }
    const resolved = [...byKey.values()];
    const alias = new Map<string, string>();
    resolved.forEach(entry => entry.candidateIds.forEach(id => alias.set(id, entry.entity.id)));
    return { entries: resolved, alias };
};

const entityProvenance = (entry: EntityEntry): HistoricalEntityProvenance => ({
    entityId: entry.entity.id,
    candidateIds: [...entry.candidateIds],
    analysisPassIds: [...entry.analysisPassIds],
    bindingIds: [...entry.bindingIds],
    overlayIds: [...entry.overlayIds],
    sourceRefs: clone(entry.entity.sourceRefs),
    provenance: entry.provenance,
});

export const resolveHistoricalInterpretation = (
    bundle: HistoricalInterpretationBundle,
): ResolvedHistoricalInterpretation => {
    const scopeKey = createHistoryScopeKey(bundle.workspace.scope);
    const assertScope = (scope: HistoricalDerivedBase['scope'], label: string): void => {
        if (createHistoryScopeKey(scope) !== scopeKey) throw new Error(`${label} crosses history workspace scope`);
    };
    bundle.passes.forEach(pass => assertScope(pass.scope, `analysis pass ${pass.id}`));
    bundle.bindings.forEach(binding => assertScope(binding.scope, `evidence binding ${binding.id}`));
    bundle.overlays.forEach(overlay => assertScope(overlay.scope, `user overlay ${overlay.id}`));

    const activeBindingsByTarget = new Map<string, typeof bundle.bindings>();
    bundle.bindings.filter(binding => binding.status === 'active').forEach(binding => {
        const current = activeBindingsByTarget.get(binding.targetId) ?? [];
        current.push(binding);
        activeBindingsByTarget.set(binding.targetId, current);
    });

    const entries = new Map<string, EntityEntry>();
    const addPassEntity = (entity: ResolvableEntity, passId: string): void => {
        assertScope(entity.scope, `historical entity ${entity.id}`);
        const bindings = activeBindingsByTarget.get(entity.id) ?? [];
        entries.set(entity.id, {
            entity: {
                ...clone(entity),
                sourceRefs: mergeSourceRefs(entity.sourceRefs, bindings.map(binding => binding.sourceRef)),
            } as ResolvableEntity,
            candidateIds: [entity.id],
            analysisPassIds: [passId],
            bindingIds: bindings.map(binding => binding.id),
            overlayIds: [],
            provenance: 'source_linked',
        });
    };
    bundle.passes.forEach(pass => {
        pass.relationshipMemories.forEach(entity => addPassEntity(entity, pass.id));
        pass.timebookNodes.forEach(entity => addPassEntity(entity, pass.id));
        pass.narrativeProfile.routes.forEach(entity => addPassEntity(entity, pass.id));
        pass.narrativeProfile.npcs.forEach(entity => addPassEntity(entity, pass.id));
        pass.narrativeProfile.relationshipStages.forEach(entity => addPassEntity(entity, pass.id));
        pass.narrativeProfile.openThreads.forEach(entity => addPassEntity(entity, pass.id));
    });

    for (const overlay of bundle.overlays) {
        if (overlay.operation === 'create') {
            const entity = createEntityFromOverlay(overlay);
            const bindings = activeBindingsByTarget.get(entity.id) ?? [];
            entries.set(entity.id, {
                entity: {
                    ...entity,
                    sourceRefs: mergeSourceRefs(entity.sourceRefs, bindings.map(binding => binding.sourceRef)),
                } as ResolvableEntity,
                candidateIds: [entity.id],
                analysisPassIds: [],
                bindingIds: bindings.map(binding => binding.id),
                overlayIds: [overlay.id],
                provenance: overlay.provenance,
            });
            continue;
        }
        const target = entries.get(overlay.targetId!);
        if (!target) throw new Error(`user overlay ${overlay.id} points to missing target ${overlay.targetId}`);
        entries.set(overlay.targetId!, applyOverlay(target, overlay));
    }

    const relationship = coalesce(
        [...entries.values()].filter((entry): entry is EntityEntry<HistoricalRelationshipMemory> => (
            entry.entity.kind === 'relationship_memory'
        )),
    );
    const timebook = coalesce(
        [...entries.values()].filter((entry): entry is EntityEntry<HistoricalTimebookNode> => (
            entry.entity.kind === 'timebook_node'
        )),
    );
    const npcs = coalesce(
        [...entries.values()].filter((entry): entry is EntityEntry<HistoricalNpcProfile> => entry.entity.kind === 'npc'),
    );
    const stages = coalesce(
        [...entries.values()].filter((entry): entry is EntityEntry<HistoricalRelationshipStage> => (
            entry.entity.kind === 'relationship_stage'
        )),
    );
    const threads = coalesce(
        [...entries.values()].filter((entry): entry is EntityEntry<HistoricalOpenThread> => (
            entry.entity.kind === 'open_thread'
        )),
    );
    const routedEntries = [...entries.values()]
        .filter((entry): entry is EntityEntry<HistoricalRouteProfile> => entry.entity.kind === 'route')
        .map(entry => ({
            ...entry,
            entity: {
                ...entry.entity,
                npcProfileIds: unique(entry.entity.npcProfileIds.map(id => npcs.alias.get(id) ?? id)),
                openThreadIds: unique(entry.entity.openThreadIds.map(id => threads.alias.get(id) ?? id)),
                relationshipStageId: entry.entity.relationshipStageId
                    ? (stages.alias.get(entry.entity.relationshipStageId) ?? entry.entity.relationshipStageId)
                    : undefined,
            },
        }));
    const routes = coalesce(routedEntries);

    const visibleProfiles = bundle.passes
        .map(pass => pass.narrativeProfile)
        .filter(isVisible);
    const latestProfile = visibleProfiles[visibleProfiles.length - 1];
    const narrativeChildren = [
        ...routes.entries,
        ...npcs.entries,
        ...stages.entries,
        ...threads.entries,
    ];
    const narrativeProfile: HistoricalNarrativeProfile | null = latestProfile || narrativeChildren.length > 0
        ? {
            ...(latestProfile ? clone(latestProfile) : userBase({
                schemaVersion: 2,
                id: `workspace-profile-overlay:${bundle.workspace.id}`,
                seriesId: `workspace-profile:${bundle.workspace.id}`,
                scope: bundle.workspace.scope,
                targetKind: 'route',
                operation: 'create',
                patch: {},
                provenance: 'user_attested',
                sourceRefs: [],
                authority: 'user_confirmed',
                createdAt: bundle.workspace.createdAt,
                revision: 1,
            }, `history-workspace-profile:${bundle.workspace.id}`)),
            id: `history-workspace-profile:${bundle.workspace.id}`,
            scope: { ...bundle.workspace.scope },
            temporalClass: 'historical',
            sourceRefs: mergeSourceRefs(...visibleProfiles.map(profile => profile.sourceRefs)),
            authority: visibleProfiles.reduce(
                (authority, profile) => strongerAuthority(authority, profile.authority),
                'model_reconstructed' as HistoricalDerivedBase['authority'],
            ),
            confidence: visibleProfiles.length > 0
                ? Math.max(...visibleProfiles.map(profile => profile.confidence))
                : 1,
            status: visibleProfiles.some(profile => profile.status === 'confirmed') ? 'confirmed' : 'soft_canon',
            analysisRunId: `history-workspace:${bundle.workspace.id}`,
            extractorVersion: 'historical-workspace-resolver-v2',
            createdAt: visibleProfiles.length > 0
                ? Math.min(...visibleProfiles.map(profile => profile.createdAt))
                : bundle.workspace.createdAt,
            updatedAt: bundle.workspace.updatedAt,
            revision: bundle.workspace.revision,
            kind: 'narrative_profile',
            title: latestProfile?.title ?? '我补充的历史线索',
            summary: latestProfile?.summary ?? '由玩家补充、尚未绑定原始记录的历史线索。',
            routes: routes.entries.map(entry => entry.entity),
            npcs: npcs.entries.map(entry => entry.entity),
            relationshipStages: stages.entries.map(entry => entry.entity),
            openThreads: threads.entries.map(entry => entry.entity),
        }
        : null;

    const provenance = [
        ...relationship.entries,
        ...timebook.entries,
        ...narrativeChildren,
    ].map(entityProvenance);
    if (narrativeProfile) {
        provenance.push({
            entityId: narrativeProfile.id,
            candidateIds: visibleProfiles.map(profile => profile.id),
            analysisPassIds: [...bundle.workspace.contributingPassIds],
            bindingIds: [],
            overlayIds: [],
            sourceRefs: clone(narrativeProfile.sourceRefs),
            provenance: narrativeProfile.sourceRefs.length > 0 ? 'source_linked' : 'user_attested',
        });
    }

    return {
        schemaVersion: 2,
        workspaceId: bundle.workspace.id,
        workspaceRevision: bundle.workspace.revision,
        scope: { ...bundle.workspace.scope },
        contributingPassIds: [...bundle.workspace.contributingPassIds],
        relationshipMemories: relationship.entries.map(entry => entry.entity),
        timebookNodes: timebook.entries.map(entry => entry.entity),
        narrativeProfile,
        provenance,
    };
};
