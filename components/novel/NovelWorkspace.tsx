import React, { useCallback, useEffect, useMemo } from 'react';
import type { NarrativeDirective, NovelNarrativeState } from '../../domain/narrative/types';
import { inspectNovelNarrative } from '../../domain/narrative/inspection';
import { resolvePersonaRouteScope } from '../../utils/personaRouteScope';
import NovelWriter from './NovelWriter';
import { StoryDeskInspector } from './StoryDeskInspector';

export type NovelWorkspacePanel = 'manuscript' | 'story_desk';

export type NovelWorkspaceProps = React.ComponentProps<typeof NovelWriter> & {
    activePanel: NovelWorkspacePanel;
    onPanelChange: (panel: NovelWorkspacePanel) => void;
};

const NovelWorkspace: React.FC<NovelWorkspaceProps> = ({
    activePanel,
    onPanelChange,
    ...writerProps
}) => {
    const personaScope = useMemo(() => resolvePersonaRouteScope(
        writerProps.userProfile,
        writerProps.characters,
    ), [writerProps.characters, writerProps.userProfile]);
    const inspection = useMemo(() => inspectNovelNarrative(
        writerProps.activeBook,
        personaScope.activeProgressBundleId,
    ), [personaScope.activeProgressBundleId, writerProps.activeBook]);
    const availableStoryCharacters = useMemo(() => (
        personaScope.hasLinkedFocus ? personaScope.linkedCharacters : writerProps.characters
    ), [personaScope.hasLinkedFocus, personaScope.linkedCharacters, writerProps.characters]);
    const defaultStoryCharacterIds = useMemo(() => {
        const availableIds = new Set(availableStoryCharacters.map(character => character.id));
        const collaboratorIds = writerProps.activeBook.collaboratorIds.filter(id => availableIds.has(id));
        if (collaboratorIds.length > 0) return collaboratorIds;
        if (personaScope.preferredActiveCharacter) return [personaScope.preferredActiveCharacter.id];
        return availableStoryCharacters.length === 1 ? [availableStoryCharacters[0].id] : [];
    }, [availableStoryCharacters, personaScope.preferredActiveCharacter, writerProps.activeBook.collaboratorIds]);
    const saveDirectives = useCallback(async (directives: NarrativeDirective[]) => {
        await writerProps.updateNovel(writerProps.activeBook.id, { directives });
    }, [writerProps.activeBook.id, writerProps.updateNovel]);
    const saveActivation = useCallback(async (
        directives: NarrativeDirective[],
        narrative: NovelNarrativeState,
    ) => {
        await writerProps.updateNovel(writerProps.activeBook.id, { directives, narrative });
    }, [writerProps.activeBook.id, writerProps.updateNovel]);
    const pendingDirectiveCount = inspection.directives.filter(directive => directive.status === 'pending').length;
    const draftRunCount = inspection.runs.filter(run => run.status === 'draft').length;

    useEffect(() => {
        const testWindow = window as typeof window & { render_game_to_text?: () => string };
        const previousRenderer = testWindow.render_game_to_text;
        testWindow.render_game_to_text = () => JSON.stringify({
            surface: 'novel_workspace',
            panel: activePanel,
            bookId: writerProps.activeBook.id,
            progressBundleId: inspection.progressBundleId || null,
            directiveCount: inspection.directives.length,
            pendingDirectiveCount,
            draftRunCount,
            unscopedDirectiveCount: inspection.unscopedDirectives.length,
            otherBundleDirectiveCount: inspection.otherBundleDirectiveCount,
            runCount: inspection.runs.length,
            activeRunId: inspection.activeRunId || null,
            sceneCount: inspection.scenes.length,
            receiptCount: inspection.receipts.length,
            otherBundleRunCount: inspection.otherBundleRunCount,
        });
        return () => {
            if (previousRenderer) testWindow.render_game_to_text = previousRenderer;
            else delete testWindow.render_game_to_text;
        };
    }, [activePanel, draftRunCount, inspection, pendingDirectiveCount, writerProps.activeBook.id]);

    return (
        <div className="h-full w-full flex flex-col bg-slate-50">
            <nav className="h-16 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 pt-5 pb-1 flex items-end justify-center z-40" aria-label="小说工作区">
                <div className="p-1 rounded-xl bg-slate-100 flex gap-1 text-xs font-bold">
                    <button
                        onClick={() => onPanelChange('manuscript')}
                        aria-pressed={activePanel === 'manuscript'}
                        className={`px-4 py-1.5 rounded-lg transition-all ${activePanel === 'manuscript' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                    >
                        手稿
                    </button>
                    <button
                        onClick={() => onPanelChange('story_desk')}
                        aria-pressed={activePanel === 'story_desk'}
                        className={`px-4 py-1.5 rounded-lg transition-all ${activePanel === 'story_desk' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400'}`}
                    >
                        剧情台
                    </button>
                </div>
            </nav>
            <div className="flex-1 min-h-0">
                {activePanel === 'manuscript' ? (
                    <NovelWriter {...writerProps} />
                ) : (
                    <StoryDeskInspector
                        activeBook={writerProps.activeBook}
                        characters={writerProps.characters}
                        availableCharacters={availableStoryCharacters}
                        defaultCharacterIds={defaultStoryCharacterIds}
                        activeMaskLabel={personaScope.activeMaskLabel}
                        inspection={inspection}
                        onDirectivesChange={saveDirectives}
                        onActivationChange={saveActivation}
                        onExit={writerProps.onBack}
                    />
                )}
            </div>
        </div>
    );
};

export default NovelWorkspace;
