import type {
    HistoricalNarrativeProfile,
    HistoricalResultStatus,
    HistoryAnalysisSnapshot,
    HistorySourceSpan,
} from '../../../domain/historyImport/analysis/types.ts';
import type { HistoryScope, HistorySourceTime } from '../../../domain/historyImport/types.ts';
import { getActiveHistoryAnalysisSnapshot } from './indexedDbAnalysis.ts';

export interface HistoricalContactMemoryRow {
    id: string;
    scope: HistoryScope;
    source: 'history_analysis';
    temporalClass: 'historical';
    title: string;
    summary: string;
    date: string;
    status: 'soft_canon' | 'confirmed';
    sourceRefs: HistorySourceSpan[];
    analysisSnapshotId: string;
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
    sourceRefs: HistorySourceSpan[];
    analysisSnapshotId: string;
}

export interface HistoricalRelationshipViews {
    snapshotId?: string;
    contactMemories: HistoricalContactMemoryRow[];
    timebookNodes: HistoricalTimebookRow[];
    narrativeProfile: HistoricalNarrativeProfile | null;
}

const isVisibleResult = (
    status: HistoricalResultStatus,
): status is 'soft_canon' | 'confirmed' => status === 'soft_canon' || status === 'confirmed';

const sourceTimeLabel = (time?: HistorySourceTime): string => {
    if (!time) return 'unknown';
    if (time.iso?.trim()) return time.iso.trim().slice(0, 10);
    if (Number.isFinite(time.epochMs)) return new Date(time.epochMs!).toISOString().slice(0, 10);
    if (time.originalText?.trim()) return time.originalText.trim();
    return 'unknown';
};

const copySourceRefs = (sourceRefs: HistorySourceSpan[]): HistorySourceSpan[] => (
    sourceRefs.map(sourceRef => ({
        ...sourceRef,
        messageIds: sourceRef.messageIds ? [...sourceRef.messageIds] : undefined,
    }))
);

const cloneJsonValue = <T>(value: T): T => {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

export const projectHistoricalRelationshipViews = (
    snapshot: HistoryAnalysisSnapshot | null,
): HistoricalRelationshipViews => {
    if (!snapshot || snapshot.status !== 'active') {
        return { contactMemories: [], timebookNodes: [], narrativeProfile: null };
    }
    const contactMemories = snapshot.relationshipMemories
        .filter(memory => isVisibleResult(memory.status))
        .map(memory => ({
            id: memory.id,
            scope: { ...snapshot.scope },
            source: 'history_analysis' as const,
            temporalClass: 'historical' as const,
            title: memory.title,
            summary: memory.summary,
            date: sourceTimeLabel(memory.occurredAt),
            status: memory.status as 'soft_canon' | 'confirmed',
            sourceRefs: copySourceRefs(memory.sourceRefs),
            analysisSnapshotId: snapshot.id,
        }));
    const timebookNodes = snapshot.timebookNodes
        .filter(node => isVisibleResult(node.status))
        .map(node => ({
            id: node.id,
            scope: { ...snapshot.scope },
            source: 'history_analysis' as const,
            temporalClass: 'historical' as const,
            title: node.title,
            summary: node.summary,
            date: sourceTimeLabel(node.occurredAt),
            status: node.status as 'soft_canon' | 'confirmed',
            sourceRefs: copySourceRefs(node.sourceRefs),
            analysisSnapshotId: snapshot.id,
        }));
    return {
        snapshotId: snapshot.id,
        contactMemories,
        timebookNodes,
        narrativeProfile: isVisibleResult(snapshot.narrativeProfile.status)
            ? cloneJsonValue(snapshot.narrativeProfile)
            : null,
    };
};

export const readActiveHistoricalRelationshipViews = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<HistoricalRelationshipViews> => projectHistoricalRelationshipViews(
    await getActiveHistoryAnalysisSnapshot(input),
);
