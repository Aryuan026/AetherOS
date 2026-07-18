import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
    HISTORY_ANALYSIS_AUTHORITY_ORDER,
    HISTORY_ANALYSIS_HOLD,
    HISTORY_ANALYSIS_IDENTITY_CONTRACT,
    createHistoryAnalysisPreflight,
    validateHistoryAnalysisRequest,
    validateHistoryAnalysisSnapshot,
} from '../domain/historyImport/analysis/index.ts';
import type {
    HistoricalDerivedBase,
    HistoryAnalysisRequest,
    HistoryAnalysisSnapshot,
    HistorySourceSpan,
} from '../domain/historyImport/analysis/index.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
    activateHistoryAnalysisSnapshot,
    getActiveHistoryAnalysisSnapshot,
    HISTORY_ANALYSIS_DB_NAME,
    HISTORY_ANALYSIS_SCOPE_STATUS_INDEX,
    HISTORY_ANALYSIS_SNAPSHOT_STORE,
    openHistoryAnalysisDatabase,
} from '../utils/historyImport/analysis/indexedDbAnalysis.ts';
import {
    projectHistoricalRelationshipViews,
    readActiveHistoricalRelationshipViews,
} from '../utils/historyImport/analysis/readAdapters.ts';

const T0 = 1_768_500_000_000;
const SCOPE_A: HistoryScope = {
    progressBundleId: 'bundle-analysis-shared',
    personaMaskId: 'mask-analysis-a',
    charId: 'char-analysis-shared',
};
const SCOPE_B: HistoryScope = {
    ...SCOPE_A,
    personaMaskId: 'mask-analysis-b',
};

const preflight = createHistoryAnalysisPreflight({
    scope: SCOPE_A,
    sourceRevisionFingerprint: 'sha256:calendar-revision-a',
    sourceDocuments: [
        {
            documentId: 'daily:2025-07-16',
            revision: 3,
            dateKey: '2025-07-16',
            messageCount: 2_000,
            estimatedTokens: 32_000,
        },
        {
            documentId: 'daily:2025-07-17',
            revision: 2,
            dateKey: '2025-07-17',
            messageCount: 3_000,
            estimatedTokens: 44_000,
        },
    ],
    generatedAt: T0,
});
assert.equal(preflight.plans.quick_merge.sourceMessageCount, 5_000);
assert.equal(preflight.plans.quick_merge.estimatedCalls, 3);
assert.equal(preflight.plans.deep_daily.estimatedCalls, 6);
assert.ok(preflight.plans.deep_daily.estimatedInputTokens > preflight.plans.quick_merge.estimatedInputTokens);
assert.equal(preflight.plans.deep_daily.approximate, true);

const request: HistoryAnalysisRequest = {
    schemaVersion: 1,
    id: 'analysis-request-a-1',
    scope: SCOPE_A,
    sourceRevisionFingerprint: preflight.sourceRevisionFingerprint,
    sourceDocuments: preflight.sourceDocuments,
    strategy: 'deep_daily',
    estimate: preflight.plans.deep_daily,
    createdAt: T0 + 1,
};
assert.deepEqual(validateHistoryAnalysisRequest(request), []);

const sourceRef: HistorySourceSpan = {
    documentId: 'daily:2025-07-16',
    documentRevision: 3,
    dateKey: '2025-07-16',
    startMessageOffset: 10,
    endMessageOffset: 42,
    messageIds: ['daily-message-10', 'daily-message-41'],
};

const derivedBase = (input: {
    id: string;
    scope: HistoryScope;
    analysisRunId: string;
    createdAt: number;
}): HistoricalDerivedBase => ({
    id: input.id,
    scope: { ...input.scope },
    temporalClass: 'historical',
    sourceRefs: [{ ...sourceRef, messageIds: [...(sourceRef.messageIds || [])] }],
    authority: 'source_inferred',
    confidence: 0.82,
    status: 'soft_canon',
    analysisRunId: input.analysisRunId,
    extractorVersion: 'history-analysis-fixture-v1',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    revision: 1,
});

const createSnapshot = (input: {
    id: string;
    requestId: string;
    analysisRunId: string;
    scope: HistoryScope;
    createdAt: number;
}): HistoryAnalysisSnapshot => {
    const base = (id: string): HistoricalDerivedBase => derivedBase({
        id,
        scope: input.scope,
        analysisRunId: input.analysisRunId,
        createdAt: input.createdAt,
    });
    return {
        schemaVersion: 1,
        id: input.id,
        requestId: input.requestId,
        analysisRunId: input.analysisRunId,
        scope: { ...input.scope },
        strategy: 'deep_daily',
        sourceRevisionFingerprint: `sha256:${input.id}`,
        temporalClass: 'historical',
        status: 'active',
        relationshipMemories: [{
            ...base(`${input.id}:memory:rain`),
            kind: 'relationship_memory',
            title: '第一次一起看雨',
            summary: '两人在旧记录中共同记住了窗外的雨声。',
            memoryPolicy: 'relationship_echo',
        }],
        timebookNodes: [{
            ...base(`${input.id}:timebook:rain`),
            kind: 'timebook_node',
            title: '雨夜谈心',
            summary: '旧记录中的一次共同场景，不代表今天仍在下雨。',
            continuity: 'mainline',
            surface: 'coauthored_scene',
        }],
        narrativeProfile: {
            ...base(`${input.id}:profile`),
            kind: 'narrative_profile',
            title: '旧世界路线图',
            summary: '供剧情主持后台只读参考的历史路线。',
            routes: [{
                ...base(`${input.id}:route-record:main`),
                kind: 'route',
                continuity: 'mainline',
                routeId: `${input.id}:route:main`,
                branchId: `${input.id}:branch:main`,
                title: '共同生活主线',
                summary: '关系在多次共同场景中逐渐稳定。',
                relationshipStageId: `${input.id}:stage:trust`,
                npcProfileIds: [`${input.id}:npc:keeper`],
                openThreadIds: [`${input.id}:thread:letter`],
                surfaces: ['remote_chat', 'coauthored_scene'],
            }],
            npcs: [{
                ...base(`${input.id}:npc:keeper`),
                kind: 'npc',
                npcId: `${input.id}:npc-id:keeper`,
                routeId: `${input.id}:route:main`,
                branchId: `${input.id}:branch:main`,
                name: '守门人',
                aliases: ['门卫'],
                relationshipRole: '旧场景里的协助者',
                knownHistoricalFacts: ['曾替两人保管一封信'],
                lastHistoricalState: '最后一次出现在旧城门口',
            }],
            relationshipStages: [{
                ...base(`${input.id}:stage:trust`),
                kind: 'relationship_stage',
                stageId: `${input.id}:stage-id:trust`,
                label: '开始信任',
                summary: '双方开始主动交付重要信息。',
                evidenceMarkers: ['主动托付', '共同保密'],
            }],
            openThreads: [{
                ...base(`${input.id}:thread:letter`),
                kind: 'open_thread',
                threadId: `${input.id}:thread-id:letter`,
                routeId: `${input.id}:route:main`,
                branchId: `${input.id}:branch:main`,
                title: '尚未拆开的信',
                summary: '旧记录只说明信被保存，没有证明后来已经拆开。',
                state: 'open',
                continuationHint: '只有玩家主动续写时才转成新的剧情意图。',
            }],
        },
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        revision: 1,
    };
};

const snapshotA1 = createSnapshot({
    id: 'analysis-snapshot-a-1',
    requestId: request.id,
    analysisRunId: 'analysis-run-a-1',
    scope: SCOPE_A,
    createdAt: T0 + 10,
});
assert.deepEqual(validateHistoryAnalysisSnapshot(snapshotA1), []);
assert.match(
    validateHistoryAnalysisSnapshot({
        ...snapshotA1,
        narrativeProfile: {
            ...snapshotA1.narrativeProfile,
            scope: SCOPE_B,
        },
    }).join('\n'),
    /crosses snapshot scope/,
);
assert.match(
    validateHistoryAnalysisSnapshot({
        ...snapshotA1,
        narrativeProfile: {
            ...snapshotA1.narrativeProfile,
            currentLocation: '今天的旧城门口',
        },
    } as HistoryAnalysisSnapshot).join('\n'),
    /forbidden current-state field/,
);

assert.deepEqual(
    HISTORY_ANALYSIS_IDENTITY_CONTRACT.snapshotIdComponents,
    ['scopeKey', 'sourceRevisionFingerprint', 'strategy', 'analysisRunId'],
);
assert.deepEqual(HISTORY_ANALYSIS_AUTHORITY_ORDER, [
    'model_reconstructed',
    'source_inferred',
    'source_explicit',
    'user_confirmed',
]);
assert.equal(Object.values(HISTORY_ANALYSIS_HOLD).every(value => value === 'hold'), true);

const factory = new IDBFactory();
await activateHistoryAnalysisSnapshot({ snapshot: snapshotA1, factory });
await activateHistoryAnalysisSnapshot({ snapshot: snapshotA1, factory });
const projectedA1 = projectHistoricalRelationshipViews(snapshotA1);
assert.equal(projectedA1.contactMemories.length, 1);
assert.equal(projectedA1.timebookNodes.length, 1);
assert.equal(projectedA1.narrativeProfile?.id, snapshotA1.narrativeProfile.id);
assert.deepEqual(projectedA1.contactMemories[0].scope, SCOPE_A);

const snapshotB1 = createSnapshot({
    id: 'analysis-snapshot-b-1',
    requestId: 'analysis-request-b-1',
    analysisRunId: 'analysis-run-b-1',
    scope: SCOPE_B,
    createdAt: T0 + 20,
});
await activateHistoryAnalysisSnapshot({ snapshot: snapshotB1, factory });
assert.equal((await getActiveHistoryAnalysisSnapshot({ scope: SCOPE_A, factory }))?.id, snapshotA1.id);
assert.equal((await getActiveHistoryAnalysisSnapshot({ scope: SCOPE_B, factory }))?.id, snapshotB1.id);

const snapshotA2 = createSnapshot({
    id: 'analysis-snapshot-a-2',
    requestId: 'analysis-request-a-2',
    analysisRunId: 'analysis-run-a-2',
    scope: SCOPE_A,
    createdAt: T0 + 30,
});
await assert.rejects(
    () => activateHistoryAnalysisSnapshot({ snapshot: snapshotA2, factory }),
    /active snapshot changed/,
    'reruns must not silently replace a relationship snapshot without optimistic concurrency',
);
await activateHistoryAnalysisSnapshot({
    snapshot: snapshotA2,
    expectedActiveSnapshotId: snapshotA1.id,
    factory,
});
assert.equal((await getActiveHistoryAnalysisSnapshot({ scope: SCOPE_A, factory }))?.id, snapshotA2.id);
assert.equal((await getActiveHistoryAnalysisSnapshot({ scope: SCOPE_B, factory }))?.id, snapshotB1.id);
const activeViewsA = await readActiveHistoricalRelationshipViews({ scope: SCOPE_A, factory });
const activeViewsB = await readActiveHistoricalRelationshipViews({ scope: SCOPE_B, factory });
assert.equal(activeViewsA.snapshotId, snapshotA2.id);
assert.equal(activeViewsB.snapshotId, snapshotB1.id);
assert.equal(activeViewsA.contactMemories.every(row => row.scope.personaMaskId === SCOPE_A.personaMaskId), true);
assert.equal(activeViewsB.timebookNodes.every(row => row.scope.personaMaskId === SCOPE_B.personaMaskId), true);

const database = await openHistoryAnalysisDatabase(factory);
assert.equal(database.name, HISTORY_ANALYSIS_DB_NAME);
assert.deepEqual(
    Array.from(
        database
            .transaction(HISTORY_ANALYSIS_SNAPSHOT_STORE, 'readonly')
            .objectStore(HISTORY_ANALYSIS_SNAPSHOT_STORE)
            .index(HISTORY_ANALYSIS_SCOPE_STATUS_INDEX)
            .keyPath as string[],
    ),
    [
        'scope.progressBundleId',
        'scope.personaMaskId',
        'scope.charId',
        'status',
        'createdAt',
    ],
);
database.close();

console.log('history analysis foundation OK: preflight=2 plans snapshot=atomic relationshipScope=isolated');
