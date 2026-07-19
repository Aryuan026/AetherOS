import type {
    HistoricalAuthority,
    HistoricalKnowledgeScope,
    HistoricalNarrativeProfile,
    HistoricalNarrativeProjection,
    HistorySourceSpan,
    ResolvedHistoricalInterpretation,
} from '../../../domain/historyImport/analysis/types.ts';
import type { HistoryScope, HistorySourceTime } from '../../../domain/historyImport/types.ts';
import { getHistoricalInterpretationBundle } from './indexedDbAnalysis.ts';
import { resolveHistoricalInterpretation } from './resolver.ts';

export interface HistoricalContactMemoryRow {
    id: string;
    scope: HistoryScope;
    source: 'history_analysis';
    temporalClass: 'historical';
    title: string;
    summary: string;
    date: string;
    status: 'soft_canon' | 'confirmed';
    provenance: 'source_linked' | 'user_attested';
    provenanceLabel?: '我补充的';
    sourceRefs: HistorySourceSpan[];
    interpretationWorkspaceId: string;
    provenanceRef: string;
    authority: HistoricalAuthority;
    knowledge: HistoricalKnowledgeScope;
}

export interface HistoricalTimebookRow {
    id: string;
    scope: HistoryScope;
    source: 'history_analysis';
    temporalClass: 'historical';
    title: string;
    summary: string;
    date: string;
    status: 'soft_canon' | 'confirmed';
    provenance: 'source_linked' | 'user_attested';
    provenanceLabel?: '我补充的';
    sourceRefs: HistorySourceSpan[];
    interpretationWorkspaceId: string;
    provenanceRef: string;
    authority: HistoricalAuthority;
    knowledge: HistoricalKnowledgeScope;
}

export interface HistoricalRelationshipViews {
    workspaceId?: string;
    workspaceRevision?: number;
    contactMemories: HistoricalContactMemoryRow[];
    timebookNodes: HistoricalTimebookRow[];
    narrativeProfile: HistoricalNarrativeProfile | null;
}

const sourceTimeLabel = (time?: HistorySourceTime): string => {
    if (!time) return 'unknown';
    if (time.iso?.trim()) return time.iso.trim().slice(0, 10);
    if (Number.isFinite(time.epochMs)) return new Date(time.epochMs!).toISOString().slice(0, 10);
    if (time.originalText?.trim()) return time.originalText.trim();
    return 'unknown';
};

const clone = <T>(value: T): T => {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

export const projectHistoricalRelationshipViews = (
    resolved: ResolvedHistoricalInterpretation | null,
): HistoricalRelationshipViews => {
    if (!resolved) return { contactMemories: [], timebookNodes: [], narrativeProfile: null };
    const provenanceById = new Map(resolved.provenance.map(item => [item.entityId, item]));
    return {
        workspaceId: resolved.workspaceId,
        workspaceRevision: resolved.workspaceRevision,
        contactMemories: resolved.relationshipMemories.map(memory => {
            const provenance = provenanceById.get(memory.id);
            const provenanceKind = provenance?.provenance ?? 'source_linked';
            return {
                id: memory.id,
                scope: { ...resolved.scope },
                source: 'history_analysis',
                temporalClass: 'historical',
                title: memory.title,
                summary: memory.summary,
                date: sourceTimeLabel(memory.occurredAt),
                status: memory.status as 'soft_canon' | 'confirmed',
                provenance: provenanceKind,
                provenanceLabel: provenanceKind === 'user_attested' ? '我补充的' : undefined,
                sourceRefs: clone(memory.sourceRefs),
                interpretationWorkspaceId: resolved.workspaceId,
                provenanceRef: memory.id,
                authority: memory.authority,
                knowledge: memory.knowledge,
            };
        }),
        timebookNodes: resolved.timebookNodes.map(node => {
            const provenance = provenanceById.get(node.id);
            const provenanceKind = provenance?.provenance ?? 'source_linked';
            return {
                id: node.id,
                scope: { ...resolved.scope },
                source: 'history_analysis',
                temporalClass: 'historical',
                title: node.title,
                summary: node.summary,
                date: sourceTimeLabel(node.occurredAt),
                status: node.status as 'soft_canon' | 'confirmed',
                provenance: provenanceKind,
                provenanceLabel: provenanceKind === 'user_attested' ? '我补充的' : undefined,
                sourceRefs: clone(node.sourceRefs),
                interpretationWorkspaceId: resolved.workspaceId,
                provenanceRef: node.id,
                authority: node.authority,
                knowledge: node.knowledge,
            };
        }),
        narrativeProfile: resolved.narrativeProfile ? clone(resolved.narrativeProfile) : null,
    };
};

export const readHistoricalRelationshipViews = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<HistoricalRelationshipViews> => {
    const bundle = await getHistoricalInterpretationBundle(input);
    return projectHistoricalRelationshipViews(bundle ? resolveHistoricalInterpretation(bundle) : null);
};

export const readResolvedHistoricalInterpretation = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<ResolvedHistoricalInterpretation | null> => {
    const bundle = await getHistoricalInterpretationBundle(input);
    return bundle ? resolveHistoricalInterpretation(bundle) : null;
};

export const projectHistoricalNarrativeProjection = (
    resolved: ResolvedHistoricalInterpretation | null,
): HistoricalNarrativeProjection | null => {
    const profile = resolved?.narrativeProfile;
    if (!resolved || !profile) return null;
    return clone({
        schemaVersion: resolved.schemaVersion,
        workspaceId: resolved.workspaceId,
        workspaceRevision: resolved.workspaceRevision,
        scope: resolved.scope,
        temporalClass: 'historical' as const,
        profileId: profile.id,
        title: profile.title,
        summary: profile.summary,
        authority: profile.authority,
        knowledge: profile.knowledge,
        status: profile.status,
        sourceRefs: profile.sourceRefs,
        actors: profile.actors,
        events: profile.events,
        eventRouteBindings: profile.eventRouteBindings,
        routes: profile.routes,
        npcs: profile.npcs,
        relationshipStages: profile.relationshipStages,
        openThreads: profile.openThreads,
    });
};

export const readHistoricalNarrativeProjection = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<HistoricalNarrativeProjection | null> => projectHistoricalNarrativeProjection(
    await readResolvedHistoricalInterpretation(input),
);
