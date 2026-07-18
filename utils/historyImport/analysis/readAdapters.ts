import type {
    HistoricalNarrativeProfile,
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
