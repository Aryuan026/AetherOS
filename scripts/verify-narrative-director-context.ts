import assert from 'node:assert/strict';
import {
    createNarrativeDirectorContext,
    loadNarrativeDirectorContext,
    NARRATIVE_DIRECTOR_AUTHORITY_ORDER,
    NARRATIVE_DIRECTOR_HISTORICAL_AUTHORITY_ORDER,
    NARRATIVE_DIRECTOR_READ_ONLY_POLICY,
    projectNarrativeDirectorCurrentTruth,
    resolveHistoricalNarrativeAuthority,
} from '../domain/narrative/directorContext.ts';
import type { NarrativeDirectorScope } from '../domain/narrative/directorContext.ts';
import type {
    HistoricalDerivedBase,
    HistoricalNarrativeProfile,
    HistorySourceSpan,
} from '../domain/historyImport/analysis/types.ts';
import type {
    NarrativeExperienceReceipt,
    NarrativeRun,
    NarrativeScene,
    NovelNarrativeState,
} from '../domain/narrative/types.ts';
import { createHistoryAnalysisProfileProvider } from '../utils/narrative/historyAnalysisProfileProvider.ts';

const T0 = 1_768_600_000_000;
const SCOPE_A: NarrativeDirectorScope = {
    progressBundleId: 'bundle-director-shared',
    personaMaskId: 'mask-director-a',
    charId: 'char-director-shared',
};
const SCOPE_B: NarrativeDirectorScope = {
    ...SCOPE_A,
    personaMaskId: 'mask-director-b',
};

const activeRun: NarrativeRun = {
    id: 'run-director-active',
    progressBundleId: SCOPE_A.progressBundleId,
    bookId: 'book-director',
    routeId: 'route-director-active',
    branchId: 'branch-main',
    lane: 'mainline',
    status: 'active',
    participantCharIds: [SCOPE_A.charId],
    activeSceneId: 'scene-director-active',
    directiveIds: ['directive-director-active'],
    routeSummary: '当前正在推进的线路',
    routeState: { trust: 4 },
    npcStates: [],
    openThreads: [],
    startedAt: T0,
    updatedAt: T0 + 1,
};
const confirmedRun: NarrativeRun = {
    ...activeRun,
    id: 'run-director-confirmed',
    routeId: 'route-director-confirmed',
    status: 'completed',
    activeSceneId: undefined,
    startedAt: T0 - 100,
    updatedAt: T0 - 10,
    completedAt: T0 - 10,
};
const activeScene: NarrativeScene = {
    id: 'scene-director-active',
    runId: activeRun.id,
    status: 'active',
    title: '当前第一幕',
    participantIds: ['user', SCOPE_A.charId],
    constraints: ['这里只读，不推进场景'],
    beats: [],
    openedAt: T0 + 1,
};
const confirmedScene: NarrativeScene = {
    id: 'scene-director-confirmed',
    runId: confirmedRun.id,
    status: 'confirmed',
    title: '已经确认的旧站台',
    participantIds: ['user', SCOPE_A.charId],
    constraints: [],
    beats: [{
        id: 'beat-director-confirmed',
        kind: 'user_action',
        authorId: 'user',
        content: '我把伞偏向他那一边。',
        createdAt: T0 - 20,
    }],
    openedAt: T0 - 30,
    playedAt: T0 - 20,
    confirmedAt: T0 - 10,
};
const confirmedReceipt: NarrativeExperienceReceipt = {
    id: 'receipt-director-confirmed',
    progressBundleId: SCOPE_A.progressBundleId,
    runId: confirmedRun.id,
    sceneId: confirmedScene.id,
    lane: 'mainline',
    participantCharIds: [SCOPE_A.charId],
    summary: '两人在旧站台确认彼此仍愿意同行。',
    acceptedFacts: ['用户把伞偏向角色'],
    memoryPolicy: 'relationship_echo',
    confirmedByUser: true,
    playedAt: T0 - 20,
    confirmedAt: T0 - 10,
};
const narrative: NovelNarrativeState = {
    schemaVersion: 1,
    runs: [activeRun, confirmedRun],
    scenes: [activeScene, confirmedScene],
    receipts: [confirmedReceipt],
    activeRunId: activeRun.id,
    updatedAt: T0 + 1,
};
const narrativeBefore = structuredClone(narrative);
const currentTruth = projectNarrativeDirectorCurrentTruth({ scope: SCOPE_A, narrative });
assert.equal(currentTruth.activeRun?.id, activeRun.id);
assert.equal(currentTruth.activeScene?.id, activeScene.id);
assert.equal(currentTruth.confirmedExperiences.length, 1);
assert.equal(currentTruth.confirmedExperiences[0].receipt.id, confirmedReceipt.id);
assert.deepEqual(narrative, narrativeBefore, 'truth projection must not mutate narrative state');
assert.equal(Object.isFrozen(currentTruth), true);
assert.equal(Object.isFrozen(currentTruth.activeRun), true);

const sourceRef: HistorySourceSpan = {
    documentId: 'daily:2025-07-16',
    documentRevision: 3,
    dateKey: '2025-07-16',
    startMessageOffset: 10,
    endMessageOffset: 42,
    messageIds: ['history-message-10', 'history-message-41'],
};
const historicalBase = (
    id: string,
    authority: HistoricalDerivedBase['authority'],
    scope: NarrativeDirectorScope = SCOPE_A,
): HistoricalDerivedBase => ({
    id,
    scope: { ...scope },
    temporalClass: 'historical',
    sourceRefs: [{ ...sourceRef, messageIds: [...(sourceRef.messageIds || [])] }],
    authority,
    knowledge: 'relationship_private',
    confidence: 0.8,
    status: 'soft_canon',
    analysisRunId: 'analysis-run-director',
    extractorVersion: 'history-analysis-director-fixture-v1',
    createdAt: T0 - 1_000,
    updatedAt: T0 - 1_000,
    revision: 1,
});
const historicalProfile: HistoricalNarrativeProfile = {
    ...historicalBase('historical-profile-director', 'source_inferred'),
    kind: 'narrative_profile',
    title: '旧世界路线图',
    summary: '只供主持后台参考，不代表当前已续写。',
    routes: [{
        ...historicalBase('historical-route-director', 'user_confirmed'),
        kind: 'route',
        continuity: 'mainline',
        routeId: 'historical-route-main',
        branchId: 'historical-branch-main',
        title: '共同生活旧主线',
        summary: '玩家曾明确确认这是历史主线。',
        relationshipStageId: 'historical-stage-director',
        npcProfileIds: ['historical-npc-director'],
        openThreadIds: ['historical-thread-director'],
        surfaces: ['remote_chat', 'coauthored_scene'],
    }],
    npcs: [{
        ...historicalBase('historical-npc-director', 'source_explicit'),
        kind: 'npc',
        npcId: 'historical-npc-id-director',
        routeId: 'historical-route-main',
        branchId: 'historical-branch-main',
        name: '守门人',
        aliases: ['门卫'],
        knownHistoricalFacts: ['曾替两人保管一封信'],
    }],
    relationshipStages: [{
        ...historicalBase('historical-stage-director', 'model_reconstructed'),
        kind: 'relationship_stage',
        stageId: 'historical-stage-id-director',
        label: '逐渐信任',
        summary: '模型根据多日记录重建出的阶段，仅作低权重参考。',
        evidenceMarkers: ['共同保密'],
    }],
    openThreads: [{
        ...historicalBase('historical-thread-director', 'source_inferred'),
        kind: 'open_thread',
        threadId: 'historical-thread-id-director',
        routeId: 'historical-route-main',
        branchId: 'historical-branch-main',
        title: '尚未拆开的信',
        summary: '旧记录没有证明后来已经拆开。',
        state: 'open',
    }],
};
const profileBefore = structuredClone(historicalProfile);

const context = createNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth,
    historicalProfile,
});
assert.deepEqual(NARRATIVE_DIRECTOR_AUTHORITY_ORDER, [
    'reconstructed',
    'soft_historical',
    'user_confirmed_history',
    'active_confirmed_truth',
]);
assert.deepEqual(NARRATIVE_DIRECTOR_HISTORICAL_AUTHORITY_ORDER, [
    'model_reconstructed',
    'source_inferred',
    'source_explicit',
    'user_confirmed',
]);
assert.deepEqual(context.historicalAuthorityOrder, NARRATIVE_DIRECTOR_HISTORICAL_AUTHORITY_ORDER);
assert.equal(context.currentTruthAuthority, 'active_confirmed_truth');
assert.equal(context.historical?.rootAuthority, 'soft_historical');
assert.equal(resolveHistoricalNarrativeAuthority(historicalProfile.routes[0].authority), 'user_confirmed_history');
assert.equal(resolveHistoricalNarrativeAuthority(historicalProfile.npcs[0].authority), 'soft_historical');
assert.equal(resolveHistoricalNarrativeAuthority(historicalProfile.relationshipStages[0].authority), 'reconstructed');
assert.deepEqual(historicalProfile, profileBefore, 'context assembly must not mutate historical profile');
assert.deepEqual(narrative, narrativeBefore, 'historical context must not mutate current narrative truth');
assert.equal(Object.isFrozen(context), true);
assert.equal(Object.isFrozen(context.historical?.profile.routes[0]), true);
assert.equal(Object.values(NARRATIVE_DIRECTOR_READ_ONLY_POLICY).every(value => value === false), true);
assert.equal(Object.values(context.readOnlyPolicy).every(value => value === false), true);
assert.throws(() => {
    (context.currentTruth.activeRun as NarrativeRun).status = 'completed';
}, TypeError, 'read-only context must reject runtime mutation');
assert.equal(activeRun.status, 'active');

assert.throws(() => createNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth,
    historicalProfile: { ...historicalProfile, scope: SCOPE_B },
}), /crosses Narrative Director relationship scope/);
assert.throws(() => createNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth,
    historicalProfile: {
        ...historicalProfile,
        routes: [{ ...historicalProfile.routes[0], scope: SCOPE_B }],
    },
}), /historicalProfile.routes\[0\] crosses Narrative Director relationship scope/);
assert.throws(() => createNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth: { ...currentTruth, scope: SCOPE_B },
    historicalProfile,
}), /currentTruth crosses Narrative Director relationship scope/);
assert.throws(() => createNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth,
    historicalProfile: { ...historicalProfile, status: 'stale' },
}), /not visible to Narrative Director/);

let providerReadCount = 0;
let providerScope: NarrativeDirectorScope | undefined;
const injectedProvider = createHistoryAnalysisProfileProvider({
    readViews: async ({ scope }) => {
        providerReadCount += 1;
        providerScope = { ...scope };
        return { narrativeProfile: historicalProfile };
    },
});
const loadedContext = await loadNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth,
    historicalProvider: injectedProvider,
});
assert.equal(providerReadCount, 1);
assert.deepEqual(providerScope, SCOPE_A);
assert.equal(loadedContext.historical?.profile.id, historicalProfile.id);

await assert.rejects(() => loadNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth,
    historicalProvider: createHistoryAnalysisProfileProvider({
        readViews: async () => ({
            narrativeProfile: { ...historicalProfile, scope: SCOPE_B },
        }),
    }),
}), /crosses Narrative Director relationship scope/);

const contextWithoutHistory = await loadNarrativeDirectorContext({
    scope: SCOPE_A,
    currentTruth,
});
assert.equal(contextWithoutHistory.historical, null);
assert.deepEqual(narrative, narrativeBefore);

console.log('narrative director context OK: scope=triple authority=ordered provider=readonly writes=0');
