import { validateHistoryScope } from '../contract.ts';
import type {
    HistoryAnalysisEstimate,
    HistoryAnalysisPreflight,
    HistoryAnalysisSourceDocument,
} from './types.ts';
import { HISTORY_ANALYSIS_SCHEMA_VERSION } from './types.ts';
import type { HistoryScope } from '../types.ts';

const QUICK_PACKET_TOKEN_BUDGET = 48_000;
const DEEP_PACKET_TOKEN_BUDGET = 18_000;

const positiveInteger = (value: number, label: string): void => {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
};

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const estimateQuick = (
    documents: HistoryAnalysisSourceDocument[],
): HistoryAnalysisEstimate => {
    const estimatedInputTokens = sum(documents.map(document => document.estimatedTokens));
    const internalPacketCount = Math.max(1, Math.ceil(estimatedInputTokens / QUICK_PACKET_TOKEN_BUDGET));
    return {
        strategy: 'quick_merge',
        estimatedInputTokens,
        estimatedOutputTokens: Math.max(900, internalPacketCount * 700),
        estimatedCalls: internalPacketCount + (internalPacketCount > 1 ? 1 : 0),
        internalPacketCount,
        sourceDocumentCount: documents.length,
        sourceMessageCount: sum(documents.map(document => document.messageCount)),
        approximate: true,
    };
};

const estimateDeep = (
    documents: HistoryAnalysisSourceDocument[],
): HistoryAnalysisEstimate => {
    const sourceTokens = sum(documents.map(document => document.estimatedTokens));
    const internalPacketCount = sum(documents.map(document => (
        Math.max(1, Math.ceil(document.estimatedTokens / DEEP_PACKET_TOKEN_BUDGET))
    )));
    const synthesisTokens = Math.max(1_200, internalPacketCount * 900);
    return {
        strategy: 'deep_daily',
        estimatedInputTokens: sourceTokens + synthesisTokens,
        estimatedOutputTokens: Math.max(1_800, internalPacketCount * 1_100),
        estimatedCalls: internalPacketCount + 1,
        internalPacketCount,
        sourceDocumentCount: documents.length,
        sourceMessageCount: sum(documents.map(document => document.messageCount)),
        approximate: true,
    };
};

export const createHistoryAnalysisPreflight = (input: {
    scope: HistoryScope;
    sourceRevisionFingerprint: string;
    sourceDocuments: HistoryAnalysisSourceDocument[];
    generatedAt: number;
}): HistoryAnalysisPreflight => {
    const scopeErrors = validateHistoryScope(input.scope);
    if (scopeErrors.length > 0) throw new Error(scopeErrors.join('; '));
    if (!input.sourceRevisionFingerprint.trim()) throw new Error('sourceRevisionFingerprint is required');
    if (input.sourceDocuments.length < 1) throw new Error('history analysis requires at least one Calendar day');
    const seenDocuments = new Set<string>();
    input.sourceDocuments.forEach(document => {
        if (!document.documentId.trim()) throw new Error('history analysis documentId is required');
        if (seenDocuments.has(document.documentId)) throw new Error(`duplicate history document ${document.documentId}`);
        seenDocuments.add(document.documentId);
        positiveInteger(document.revision, 'history analysis document revision');
        positiveInteger(document.messageCount, 'history analysis document messageCount');
        positiveInteger(document.estimatedTokens, 'history analysis document estimatedTokens');
    });
    const sourceDocuments = input.sourceDocuments.map(document => ({ ...document }));
    return {
        schemaVersion: HISTORY_ANALYSIS_SCHEMA_VERSION,
        scope: { ...input.scope },
        sourceRevisionFingerprint: input.sourceRevisionFingerprint,
        sourceDocuments,
        plans: {
            quick_merge: estimateQuick(sourceDocuments),
            deep_daily: estimateDeep(sourceDocuments),
        },
        generatedAt: input.generatedAt,
    };
};
