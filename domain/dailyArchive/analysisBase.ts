import type { HistoryScope } from '../historyImport/types';

export const DAILY_ARCHIVE_ANALYSIS_BASE_VERSION = 1 as const;
export const DAILY_ARCHIVE_ANALYSIS_HOLD_REASON = 'module_fit_unverified' as const;

/**
 * Source-only handoff reserved for a later Calendar AI run.
 * No extraction categories or downstream memory targets are chosen here.
 */
export interface DailyArchiveAnalysisRequest {
    schemaVersion: typeof DAILY_ARCHIVE_ANALYSIS_BASE_VERSION;
    id: string;
    scope: HistoryScope;
    sourceDocumentIds: string[];
    sourceRevisionFingerprint: string;
    requestedQuestion: string;
    createdAt: number;
}

export interface HeldDailyArchiveAnalysisRun {
    schemaVersion: typeof DAILY_ARCHIVE_ANALYSIS_BASE_VERSION;
    id: string;
    status: 'hold';
    holdReason: typeof DAILY_ARCHIVE_ANALYSIS_HOLD_REASON;
    request: DailyArchiveAnalysisRequest;
    output: null;
}

export const createHeldDailyArchiveAnalysisRun = (
    request: DailyArchiveAnalysisRequest,
): HeldDailyArchiveAnalysisRun => {
    if (request.sourceDocumentIds.length < 1) throw new Error('日历分析至少需要一个来源日档。');
    if (!request.sourceRevisionFingerprint.trim()) throw new Error('日历分析需要固定来源版本。');
    return {
        schemaVersion: DAILY_ARCHIVE_ANALYSIS_BASE_VERSION,
        id: `daily-analysis-hold:${request.id}`,
        status: 'hold',
        holdReason: DAILY_ARCHIVE_ANALYSIS_HOLD_REASON,
        request: {
            ...request,
            scope: { ...request.scope },
            sourceDocumentIds: [...request.sourceDocumentIds],
        },
        output: null,
    };
};
