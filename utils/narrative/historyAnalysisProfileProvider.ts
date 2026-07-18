import type { HistoricalNarrativeProfile } from '../../domain/historyImport/analysis/types.ts';
import type { NarrativeDirectorHistoricalProfileProvider } from '../../domain/narrative/directorContext.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { readHistoricalRelationshipViews } from '../historyImport/analysis/readAdapters.ts';

export type HistoricalRelationshipViewsReader = (input: {
    scope: HistoryScope;
}) => Promise<{
    narrativeProfile: HistoricalNarrativeProfile | null;
}>;

export interface HistoryAnalysisProfileProviderOptions {
    readViews?: HistoricalRelationshipViewsReader;
}

/**
 * Adapts the existing history read projection to the narrative-owned provider
 * boundary. Tests and non-browser runtimes may inject a storage-free reader.
 */
export const createHistoryAnalysisProfileProvider = (
    options: HistoryAnalysisProfileProviderOptions = {},
): NarrativeDirectorHistoricalProfileProvider => {
    const readViews = options.readViews ?? readHistoricalRelationshipViews;
    return {
        readHistoricalNarrativeProfile: async ({ scope }) => {
            const views = await readViews({
                scope: {
                    progressBundleId: scope.progressBundleId,
                    personaMaskId: scope.personaMaskId,
                    charId: scope.charId,
                },
            });
            return views.narrativeProfile;
        },
    };
};

export const historyAnalysisProfileProvider = createHistoryAnalysisProfileProvider();
