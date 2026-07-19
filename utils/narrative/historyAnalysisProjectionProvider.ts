import type { HistoricalNarrativeProjection } from '../../domain/historyImport/analysis/types.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import type { NarrativeDirectorHistoricalProjectionProvider } from '../../domain/narrative/directorContext.ts';
import { readHistoricalNarrativeProjection } from '../historyImport/analysis/readAdapters.ts';

export type HistoricalNarrativeProjectionReader = (input: {
    scope: HistoryScope;
}) => Promise<HistoricalNarrativeProjection | null>;

export interface HistoryAnalysisProjectionProviderOptions {
    readProjection?: HistoricalNarrativeProjectionReader;
}

/**
 * The history domain owns this projection. Narrative receives an exact-scope,
 * read-only view and gains no storage or promotion capability.
 */
export const createHistoryAnalysisProjectionProvider = (
    options: HistoryAnalysisProjectionProviderOptions = {},
): NarrativeDirectorHistoricalProjectionProvider => {
    const readProjection = options.readProjection ?? readHistoricalNarrativeProjection;
    return {
        readHistoricalNarrativeProjection: async ({ scope }) => readProjection({
            scope: {
                progressBundleId: scope.progressBundleId,
                personaMaskId: scope.personaMaskId,
                charId: scope.charId,
            },
        }),
    };
};

export const historyAnalysisProjectionProvider = createHistoryAnalysisProjectionProvider();
