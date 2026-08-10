import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { HistoryScope } from '../../domain/historyImport/types';
import { inspectNovelNarrative } from '../../domain/narrative/inspection';
import { projectNarrativeDirectorCurrentTruth } from '../../domain/narrative/directorContext';
import {
    confirmPlayedNarrativeScene,
    openAcceptedNarrativeScene,
    type AcceptedNarrativeSceneShell,
} from '../../domain/narrative/sceneLifecycle';
import { finishNarrativeSceneFromSegments } from '../../domain/narrative/sceneBeatSync';
import type {
    NarrativeDirective,
    NarrativeExperienceReceipt,
    NarrativeRun,
    NarrativeScene,
    NovelNarrativeState,
} from '../../domain/narrative/types';
import { useOS } from '../../context/OSContext';
import { resolveAiTaskRoute } from '../../utils/aiRuntime';
import {
    generateNarrativeSceneReceiptProposal,
    generateNarrativeSceneShellProposal,
} from '../../utils/narrativeDirectorProposalServices';
import { generateAndStoreNarrativeWorldGrowthProposals } from '../../utils/narrativeWorldGrowthProposal';
import { resolvePersonaRouteScope } from '../../utils/personaRouteScope';
import { splitWorldbookWorkspace } from '../../utils/worldbookPlayerView';
import { AppID } from '../../types';
import NovelWriter from './NovelWriter';
import {
    StoryExperienceReviewScreen,
    type StoryExperienceReviewDraft,
} from './StoryExperienceReviewScreen';
import {
    StorySceneReviewScreen,
    type StorySceneDraft,
} from './StorySceneReviewScreen';
import { StoryDeskInspector } from './StoryDeskInspector';
import {
    SHELL_APP_HEADER_CONTENT_TOP,
    SHELL_APP_HEADER_HEIGHT,
} from '../shell/shellLayout';

export type NovelWorkspacePanel = 'manuscript' | 'story_desk';

export type NovelWorkspaceProps = React.ComponentProps<typeof NovelWriter> & {
    activePanel: NovelWorkspacePanel;
    onPanelChange: (panel: NovelWorkspacePanel) => void;
};

type GrowthActionState = { status: 'idle' | 'loading' | 'none' | 'error'; message?: string };

const compactSceneSummary = (scene: NarrativeScene): string => {
    const text = scene.beats.map(beat => beat.content.trim()).filter(Boolean).join(' ');
    return text.slice(0, 600) || scene.title;
};

const NovelWorkspace: React.FC<NovelWorkspaceProps> = ({
    activePanel,
    onPanelChange,
    ...writerProps
}) => {
    const {
        apiPresets,
        aiRuntimeRouting,
        loadWorldbookWorkspace,
        openApp,
        addToast,
    } = useOS();
    const [sceneReviewRunId, setSceneReviewRunId] = useState<string | null>(null);
    const [experienceReviewSceneId, setExperienceReviewSceneId] = useState<string | null>(null);
    const [growthCandidateCountByReceiptId, setGrowthCandidateCountByReceiptId] = useState<Map<string, number>>(new Map());
    const [handledGrowthReceiptIds, setHandledGrowthReceiptIds] = useState<Set<string>>(new Set());
    const [growthActionByReceiptId, setGrowthActionByReceiptId] = useState<Map<string, GrowthActionState>>(new Map());
    const [isWriterGenerating, setIsWriterGenerating] = useState(false);

    const personaScope = useMemo(() => resolvePersonaRouteScope(
        writerProps.userProfile,
        writerProps.characters,
    ), [writerProps.characters, writerProps.userProfile]);
    const inspection = useMemo(() => inspectNovelNarrative(
        writerProps.activeBook,
        personaScope.activeProgressBundleId,
    ), [personaScope.activeProgressBundleId, writerProps.activeBook]);
    const availableStoryCharacters = useMemo(() => personaScope.linkedCharacters, [personaScope.linkedCharacters]);
    const defaultStoryCharacterIds = useMemo(() => {
        const availableIds = new Set(availableStoryCharacters.map(character => character.id));
        const collaboratorIds = writerProps.activeBook.collaboratorIds.filter(id => availableIds.has(id));
        if (collaboratorIds.length > 0) return collaboratorIds;
        if (personaScope.preferredActiveCharacter) return [personaScope.preferredActiveCharacter.id];
        return availableStoryCharacters.length === 1 ? [availableStoryCharacters[0].id] : [];
    }, [availableStoryCharacters, personaScope.preferredActiveCharacter, writerProps.activeBook.collaboratorIds]);

    const scopeForRun = useCallback((run: NarrativeRun): HistoryScope => {
        const progressBundleId = personaScope.activeProgressBundleId?.trim();
        const personaMaskId = personaScope.activeMaskId?.trim();
        const charId = run.participantCharIds.find(id => personaScope.linkedCharacterIds.includes(id));
        if (!progressBundleId || !personaMaskId || !charId) {
            throw new Error('这条故事线还没有完整绑定当前面具与角色，请先回通讯录确认关系');
        }
        return { progressBundleId, personaMaskId, charId };
    }, [personaScope.activeMaskId, personaScope.activeProgressBundleId, personaScope.linkedCharacterIds]);

    const refreshGrowthCandidates = useCallback(async () => {
        const rawWorkspace = await loadWorldbookWorkspace();
        const workspace = splitWorldbookWorkspace(rawWorkspace);
        const next = new Map<string, number>();
        const handled = new Set<string>();
        const exactReceiptFor = (candidate: typeof rawWorkspace.candidates[number]) => {
            if (
                candidate.source.kind !== 'narrative'
                || !candidate.scope
                || candidate.draft.knowledgePolicy.kind === 'director_only'
            ) return undefined;
            const receipt = inspection.receipts.find(item => item.id === candidate.source.refId);
            if (!receipt) return undefined;
            const run = inspection.runs.find(item => item.id === receipt.runId);
            if (!run) return undefined;
            const scope = scopeForRun(run);
            return candidate.scope.progressBundleId === scope.progressBundleId
                && candidate.scope.personaMaskId === scope.personaMaskId
                && candidate.scope.charId === scope.charId
                ? receipt
                : undefined;
        };
        rawWorkspace.candidates.forEach(candidate => {
            const receipt = exactReceiptFor(candidate);
            if (receipt && ['accepted', 'ignored'].includes(candidate.status)) handled.add(receipt.id);
        });
        workspace.growthCandidates.forEach(candidate => {
            const receipt = exactReceiptFor(candidate);
            if (!receipt) return;
            next.set(receipt.id, (next.get(receipt.id) || 0) + 1);
        });
        setGrowthCandidateCountByReceiptId(next);
        setHandledGrowthReceiptIds(handled);
    }, [inspection.receipts, inspection.runs, loadWorldbookWorkspace, scopeForRun]);

    useEffect(() => {
        if (activePanel !== 'story_desk') return;
        void refreshGrowthCandidates().catch(() => setGrowthCandidateCountByReceiptId(new Map()));
    }, [activePanel, refreshGrowthCandidates]);

    const saveDirectives = useCallback(async (directives: NarrativeDirective[]) => {
        await writerProps.updateNovel(writerProps.activeBook.id, { directives });
    }, [writerProps.activeBook.id, writerProps.updateNovel]);
    const saveActivation = useCallback(async (directives: NarrativeDirective[], narrative: NovelNarrativeState) => {
        await writerProps.updateNovel(writerProps.activeBook.id, { directives, narrative });
    }, [writerProps.activeBook.id, writerProps.updateNovel]);
    const saveRunStart = useCallback(async (narrative: NovelNarrativeState) => {
        await writerProps.updateNovel(writerProps.activeBook.id, { narrative });
    }, [writerProps.activeBook.id, writerProps.updateNovel]);

    const activeRun = inspection.runs.find(run => run.id === inspection.activeRunId && run.status === 'active');
    const activeScene = activeRun
        ? inspection.scenes.find(scene => scene.runId === activeRun.id && scene.status === 'active')
        : undefined;
    const lockedNarrativeSceneIds = inspection.scenes
        .filter(scene => scene.status !== 'active')
        .map(scene => scene.id);
    const sceneReviewRun = inspection.runs.find(run => run.id === sceneReviewRunId);
    const experienceReviewScene = inspection.scenes.find(scene => scene.id === experienceReviewSceneId);

    const routeFor = useCallback((taskId: 'narrative_scene_plan' | 'narrative_scene_receipt_proposal' | 'narrative_world_growth_proposal') => {
        const route = resolveAiTaskRoute({
            taskId,
            dialogueConfig: writerProps.apiConfig,
            apiPresets,
            routing: aiRuntimeRouting,
        });
        if (!route.ok) throw new Error(route.message);
        return route;
    }, [aiRuntimeRouting, apiPresets, writerProps.apiConfig]);

    const prepareSceneWithAI = useCallback(async (run: NarrativeRun, draft: StorySceneDraft): Promise<StorySceneDraft> => {
        const route = routeFor('narrative_scene_plan');
        const scope = scopeForRun(run);
        const character = availableStoryCharacters.find(item => item.id === scope.charId);
        if (!character) throw new Error('当前关系角色已经不在这条故事线里');
        const workspace = await loadWorldbookWorkspace();
        const result = await generateNarrativeSceneShellProposal({
            requestId: `scene-shell:${run.id}:${Date.now()}`,
            scope,
            currentTruth: projectNarrativeDirectorCurrentTruth({ scope, narrative: writerProps.activeBook.narrative }),
            direction: [draft.title, draft.objective, ...draft.constraints].filter(Boolean).join('\n'),
            availableParticipantIds: run.participantCharIds.filter(id => personaScope.linkedCharacterIds.includes(id)),
            library: workspace.entries,
            character,
            knowledgeSubjects: [{ kind: 'character', id: scope.charId }],
            apiConfig: route.config,
            provider: route.provider,
        });
        return {
            title: result.proposal.title,
            location: result.proposal.location,
            objective: result.proposal.objective,
            constraints: [...result.proposal.constraints],
            participantIds: [...result.proposal.participantIds],
        };
    }, [availableStoryCharacters, loadWorldbookWorkspace, personaScope.linkedCharacterIds, routeFor, scopeForRun, writerProps.activeBook.narrative]);

    const acceptScene = useCallback(async (run: NarrativeRun, shell: AcceptedNarrativeSceneShell) => {
        const scope = scopeForRun(run);
        const result = openAcceptedNarrativeScene({
            scope,
            narrative: writerProps.activeBook.narrative!,
            shell,
        });
        await writerProps.updateNovel(writerProps.activeBook.id, { narrative: result.narrative });
        setSceneReviewRunId(null);
        onPanelChange('manuscript');
        addToast('这一幕已经开始，可以继续写了', 'success');
    }, [addToast, onPanelChange, scopeForRun, writerProps.activeBook.id, writerProps.activeBook.narrative, writerProps.updateNovel]);

    const finishScene = useCallback(async (scene: NarrativeScene) => {
        if (isWriterGenerating) {
            addToast('等正在写的正文完成后再结束这一幕', 'info');
            return;
        }
        const run = inspection.runs.find(item => item.id === scene.runId);
        if (!run) throw new Error('找不到这一幕所属的故事线');
        try {
            const result = finishNarrativeSceneFromSegments({
                scope: scopeForRun(run),
                narrative: writerProps.activeBook.narrative!,
                sceneId: scene.id,
                segments: writerProps.activeBook.segments,
            });
            await writerProps.updateNovel(writerProps.activeBook.id, { narrative: result.narrative });
            setExperienceReviewSceneId(scene.id);
        } catch (reason) {
            addToast(reason instanceof Error ? reason.message : '这一幕没有结束成功', 'error');
        }
    }, [addToast, inspection.runs, isWriterGenerating, scopeForRun, writerProps.activeBook.id, writerProps.activeBook.narrative, writerProps.activeBook.segments, writerProps.updateNovel]);

    const organizeReceiptWithAI = useCallback(async (scene: NarrativeScene, draft: StoryExperienceReviewDraft): Promise<StoryExperienceReviewDraft> => {
        const run = inspection.runs.find(item => item.id === scene.runId);
        if (!run) throw new Error('找不到这一幕所属的故事线');
        const route = routeFor('narrative_scene_receipt_proposal');
        const scope = scopeForRun(run);
        const result = await generateNarrativeSceneReceiptProposal({
            requestId: `scene-receipt:${scene.id}:${Date.now()}`,
            scope,
            narrative: writerProps.activeBook.narrative!,
            sceneId: scene.id,
            apiConfig: route.config,
            provider: route.provider,
        });
        return {
            summary: result.proposal.summary,
            acceptedFacts: [...result.proposal.acceptedFacts],
            rejectedOrEditedFacts: [...(result.proposal.rejectedOrEditedFacts || [])],
            memoryPolicy: draft.memoryPolicy,
        };
    }, [inspection.runs, routeFor, scopeForRun, writerProps.activeBook.narrative]);

    const confirmExperience = useCallback(async (scene: NarrativeScene, draft: StoryExperienceReviewDraft) => {
        const run = inspection.runs.find(item => item.id === scene.runId);
        if (!run) throw new Error('找不到这一幕所属的故事线');
        const result = confirmPlayedNarrativeScene({
            scope: scopeForRun(run),
            narrative: writerProps.activeBook.narrative!,
            sceneId: scene.id,
            confirmation: {
                confirmedByUser: true,
                summary: draft.summary,
                acceptedFacts: draft.acceptedFacts,
                rejectedOrEditedFacts: draft.rejectedOrEditedFacts,
                memoryPolicy: draft.memoryPolicy,
            },
        });
        await writerProps.updateNovel(writerProps.activeBook.id, { narrative: result.narrative });
        setExperienceReviewSceneId(null);
        onPanelChange('story_desk');
        await refreshGrowthCandidates();
        addToast('这段经历已经确认', 'success');
    }, [addToast, inspection.runs, onPanelChange, refreshGrowthCandidates, scopeForRun, writerProps.activeBook.id, writerProps.activeBook.narrative, writerProps.updateNovel]);

    const generateWorldGrowth = useCallback(async (receipt: NarrativeExperienceReceipt) => {
        if (
            (growthCandidateCountByReceiptId.get(receipt.id) || 0) > 0
            || handledGrowthReceiptIds.has(receipt.id)
        ) return;
        setGrowthActionByReceiptId(current => new Map(current).set(receipt.id, { status: 'loading' }));
        try {
            const run = inspection.runs.find(item => item.id === receipt.runId);
            if (!run) throw new Error('找不到这段经历所属的故事线');
            const scope = scopeForRun(run);
            const character = availableStoryCharacters.find(item => item.id === scope.charId);
            if (!character) throw new Error('当前关系角色已经不在这条故事线里');
            const route = routeFor('narrative_world_growth_proposal');
            const workspace = await loadWorldbookWorkspace();
            const result = await generateAndStoreNarrativeWorldGrowthProposals({
                requestId: `world-growth:${receipt.id}:${Date.now()}`,
                scope,
                currentTruth: projectNarrativeDirectorCurrentTruth({ scope, narrative: writerProps.activeBook.narrative }),
                source: { receiptId: receipt.id, runId: receipt.runId, sceneId: receipt.sceneId },
                confirmedExcerpt: [receipt.summary, ...receipt.acceptedFacts].join('\n'),
                library: workspace.entries,
                character,
                knowledgeSubjects: [{ kind: 'character', id: scope.charId }],
                apiConfig: route.config,
                provider: route.provider,
            });
            await refreshGrowthCandidates();
            const playerVisibleCandidates = result.candidates.filter(candidate => candidate.draft.knowledgePolicy.kind !== 'director_only');
            setGrowthActionByReceiptId(current => new Map(current).set(receipt.id, playerVisibleCandidates.length > 0
                ? { status: 'idle' }
                : { status: 'none', message: '这一幕没有需要补进世界书的长期变化' }));
        } catch (reason) {
            setGrowthActionByReceiptId(current => new Map(current).set(receipt.id, {
                status: 'error',
                message: reason instanceof Error ? reason.message : '世界变化没有整理成功',
            }));
        }
    }, [availableStoryCharacters, growthCandidateCountByReceiptId, handledGrowthReceiptIds, inspection.runs, loadWorldbookWorkspace, refreshGrowthCandidates, routeFor, scopeForRun, writerProps.activeBook.narrative]);

    const pendingDirectiveCount = inspection.directives.filter(directive => directive.status === 'pending').length;
    const draftRunCount = inspection.runs.filter(run => run.status === 'draft').length;
    const activeRunCount = inspection.runs.filter(run => run.status === 'active').length;

    useEffect(() => {
        const testWindow = window as typeof window & { render_game_to_text?: () => string };
        const previousRenderer = testWindow.render_game_to_text;
        testWindow.render_game_to_text = () => JSON.stringify({
            surface: 'novel_workspace', panel: activePanel, bookId: writerProps.activeBook.id,
            progressBundleId: inspection.progressBundleId || null, directiveCount: inspection.directives.length,
            pendingDirectiveCount, draftRunCount, activeRunCount, runCount: inspection.runs.length,
            activeRunId: inspection.activeRunId || null, sceneCount: inspection.scenes.length,
            receiptCount: inspection.receipts.length,
        });
        return () => {
            if (previousRenderer) testWindow.render_game_to_text = previousRenderer;
            else delete testWindow.render_game_to_text;
        };
    }, [activePanel, activeRunCount, draftRunCount, inspection, pendingDirectiveCount, writerProps.activeBook.id]);

    if (sceneReviewRun) {
        const scope = scopeForRun(sceneReviewRun);
        return <StorySceneReviewScreen
            run={sceneReviewRun}
            characters={availableStoryCharacters}
            requiredCharacterId={scope.charId}
            onBack={() => setSceneReviewRunId(null)}
            onPrepareWithAI={draft => prepareSceneWithAI(sceneReviewRun, draft)}
            onAccept={shell => acceptScene(sceneReviewRun, shell)}
        />;
    }

    if (experienceReviewScene) {
        const run = inspection.runs.find(item => item.id === experienceReviewScene.runId);
        if (!run) throw new Error('找不到这一幕所属的故事线');
        return <StoryExperienceReviewScreen
            scene={experienceReviewScene}
            initialDraft={{
                summary: compactSceneSummary(experienceReviewScene),
                acceptedFacts: [],
                rejectedOrEditedFacts: [],
                memoryPolicy: run.lane === 'if_line' ? 'dream_material' : 'main_vault',
            }}
            onBack={() => setExperienceReviewSceneId(null)}
            onOrganizeWithAI={organizeReceiptWithAI}
            onConfirm={draft => confirmExperience(experienceReviewScene, draft)}
        />;
    }

    return (
        <div className="h-full w-full flex flex-col bg-slate-50">
            <nav className="box-border shrink-0 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md z-40" style={{ height: SHELL_APP_HEADER_HEIGHT, paddingTop: SHELL_APP_HEADER_CONTENT_TOP }} aria-label="小说工作区">
                <div className="flex h-12 items-center justify-center">
                    <div className="flex gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 text-xs font-bold">
                        <button onClick={() => onPanelChange('manuscript')} aria-pressed={activePanel === 'manuscript'} className={`min-h-8 rounded-xl px-4 transition-all ${activePanel === 'manuscript' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>手稿</button>
                        <button disabled={isWriterGenerating} onClick={() => onPanelChange('story_desk')} aria-pressed={activePanel === 'story_desk'} className={`min-h-8 rounded-xl px-4 transition-all disabled:opacity-40 ${activePanel === 'story_desk' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400'}`}>故事线</button>
                    </div>
                </div>
            </nav>
            <div className="flex-1 min-h-0">
                {activePanel === 'manuscript' ? (
                    <NovelWriter
                        {...writerProps}
                        activeNarrativeScene={activeScene}
                        activeNarrativeContinuity={activeRun ? {
                            lane: activeRun.lane,
                            routeId: activeRun.routeId,
                            branchId: activeRun.branchId,
                        } : undefined}
                        lockedNarrativeSceneIds={lockedNarrativeSceneIds}
                        onOpenStoryDesk={() => onPanelChange('story_desk')}
                        onTypingStateChange={setIsWriterGenerating}
                    />
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
                        onRunStartChange={saveRunStart}
                        onPrepareScene={run => setSceneReviewRunId(run.id)}
                        onContinueScene={() => onPanelChange('manuscript')}
                        onFinishScene={finishScene}
                        isWriterGenerating={isWriterGenerating}
                        onReviewPlayedScene={scene => setExperienceReviewSceneId(scene.id)}
                        growthCandidateCountByReceiptId={growthCandidateCountByReceiptId}
                        handledGrowthReceiptIds={handledGrowthReceiptIds}
                        growthActionByReceiptId={growthActionByReceiptId}
                        onGenerateWorldGrowth={generateWorldGrowth}
                        onOpenWorldbook={() => openApp(AppID.Worldbook)}
                        onExit={writerProps.onBack}
                    />
                )}
            </div>
        </div>
    );
};

export default NovelWorkspace;
