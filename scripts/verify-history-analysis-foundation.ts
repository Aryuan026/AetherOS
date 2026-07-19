import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
    HISTORY_ANALYSIS_AUTHORITY_ORDER,
    HISTORY_ANALYSIS_HOLD,
    HISTORY_ANALYSIS_IDENTITY_CONTRACT,
    HISTORICAL_NARRATIVE_EXTRACTION_TRUTH_POLICY,
    createHistoryAnalysisPreflight,
    validateHistoricalUserOverlay,
    validateHistoryAnalysisPass,
    validateHistoryAnalysisRequest,
    validateHistoricalNarrativeExtractionResult,
} from '../domain/historyImport/analysis/index.ts';
import type {
    HistoricalDerivedBase,
    HistoricalUserOverlay,
    HistoryAnalysisPass,
    HistoryAnalysisRequest,
    HistoryEvidenceBinding,
    HistorySourceSpan,
    HistoricalNarrativeSourcePacket,
} from '../domain/historyImport/analysis/index.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
    appendHistoricalUserOverlay,
    createHistoricalUserEntityId,
    getHistoricalInterpretationBundle,
    HISTORICAL_NARRATIVE_EXTRACTION_RECEIPT_STORE,
    HISTORICAL_USER_OVERLAY_STORE,
    HISTORY_ANALYSIS_DB_NAME,
    HISTORY_ANALYSIS_PASS_STORE,
    HISTORY_ANALYSIS_SCOPE_CREATED_INDEX,
    HISTORY_ANALYSIS_WORKSPACE_STORE,
    HISTORY_EVIDENCE_BINDING_STORE,
    listHistoricalNarrativeExtractionReceipts,
    openHistoryAnalysisDatabase,
    publishHistoricalNarrativeExtractionResult,
    publishHistoryAnalysisPass,
    saveHistoryEvidenceBinding,
} from '../utils/historyImport/analysis/indexedDbAnalysis.ts';
import {
    projectHistoricalNarrativeProjection,
    projectHistoricalRelationshipViews,
    readHistoricalNarrativeProjection,
    readHistoricalRelationshipViews,
} from '../utils/historyImport/analysis/readAdapters.ts';
import { resolveHistoricalInterpretation } from '../utils/historyImport/analysis/resolver.ts';

const T0 = 1_768_500_000_000;
const SCOPE_A: HistoryScope = {
    progressBundleId: 'bundle-analysis-shared',
    personaMaskId: 'mask-analysis-a',
    charId: 'char-analysis-shared',
};
const SCOPE_B: HistoryScope = { ...SCOPE_A, personaMaskId: 'mask-analysis-b' };

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
assert.equal(preflight.schemaVersion, 3);
assert.equal(preflight.plans.quick_merge.sourceMessageCount, 5_000);
assert.equal(preflight.plans.quick_merge.estimatedCalls, 3);
assert.equal(preflight.plans.deep_daily.estimatedCalls, 6);
assert.ok(preflight.plans.deep_daily.estimatedInputTokens > preflight.plans.quick_merge.estimatedInputTokens);

const request: HistoryAnalysisRequest = {
    schemaVersion: 3,
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
const sharedSceneRef: HistorySourceSpan = {
    ...sourceRef,
    startMessageOffset: 100,
    endMessageOffset: 140,
    messageIds: ['daily-message-100', 'daily-message-139'],
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
    knowledge: 'relationship_private',
    confidence: 0.82,
    status: 'soft_canon',
    analysisRunId: input.analysisRunId,
    extractorVersion: 'history-analysis-fixture-v3',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    revision: 1,
});

const createPass = (input: {
    id: string;
    requestId: string;
    analysisRunId: string;
    scope: HistoryScope;
    createdAt: number;
}): HistoryAnalysisPass => {
    const base = (suffix: string): HistoricalDerivedBase => derivedBase({
        id: `${input.id}:${suffix}`,
        scope: input.scope,
        analysisRunId: input.analysisRunId,
        createdAt: input.createdAt,
    });
    const npcId = `${input.id}:npc:keeper`;
    const actorId = `${input.id}:actor:keeper`;
    const eventId = `${input.id}:event:rain-letter`;
    const mainRouteRecordId = `${input.id}:route-record:main`;
    const ifRouteRecordId = `${input.id}:route-record:if`;
    const stageId = `${input.id}:stage:trust`;
    const threadId = `${input.id}:thread:letter`;
    return {
        schemaVersion: 3,
        id: input.id,
        requestId: input.requestId,
        analysisRunId: input.analysisRunId,
        scope: { ...input.scope },
        strategy: 'deep_daily',
        sourceRevisionFingerprint: request.sourceRevisionFingerprint,
        sourceRefs: [{ ...sourceRef, messageIds: [...(sourceRef.messageIds || [])] }],
        temporalClass: 'historical',
        status: 'completed',
        relationshipMemories: [{
            ...base('memory:rain'),
            kind: 'relationship_memory',
            title: '第一次一起看雨',
            summary: '两人在旧记录中共同记住了窗外的雨声。',
            memoryPolicy: 'relationship_echo',
        }],
        timebookNodes: [{
            ...base('timebook:rain'),
            kind: 'timebook_node',
            title: '雨夜谈心',
            summary: '旧记录中的一次共同场景，不代表今天仍在下雨。',
            continuity: 'mainline',
            surface: 'coauthored_scene',
        }],
        narrativeProfile: {
            ...base('profile'),
            kind: 'narrative_profile',
            title: '旧世界路线图',
            summary: '供剧情主持后台只读参考的历史路线。',
            actors: [{
                ...base('actor:keeper'),
                kind: 'actor_ref',
                actorClass: 'npc',
                mention: '守门人',
                aliases: ['门卫'],
                resolution: 'resolved',
                resolvedNpcProfileId: npcId,
            }],
            events: [{
                ...base('event:rain-letter'),
                kind: 'event',
                eventId: 'event-id:rain-letter',
                title: '雨夜托付信件',
                summary: '守门人在雨夜替两人保管了一封尚未拆开的信。',
                actorRefIds: [actorId],
                surfaces: ['coauthored_scene'],
                location: '旧城门',
                topic: '托付与保密',
                objective: '保存信件',
                outcome: '信件被保存，是否拆开仍未知',
            }],
            eventRouteBindings: [{
                ...base('event-route:main'),
                kind: 'event_route_binding',
                eventProfileId: eventId,
                routeProfileId: mainRouteRecordId,
                continuity: 'mainline',
                branchId: 'branch:shared-main',
            }, {
                ...base('event-route:if'),
                kind: 'event_route_binding',
                eventProfileId: eventId,
                routeProfileId: ifRouteRecordId,
                continuity: 'if_line',
                branchId: 'branch:shared-if',
            }],
            routes: [{
                ...base('route-record:main'),
                kind: 'route',
                continuity: 'mainline',
                routeId: 'route:shared-main',
                branchId: 'branch:shared-main',
                title: '共同生活主线',
                summary: '关系在多次共同场景中逐渐稳定。',
                relationshipStageId: stageId,
                npcProfileIds: [npcId],
                openThreadIds: [threadId],
                surfaces: ['remote_chat', 'coauthored_scene'],
            }, {
                ...base('route-record:if'),
                kind: 'route',
                continuity: 'if_line',
                routeId: 'route:shared-if',
                branchId: 'branch:shared-if',
                title: '如果当时留下来',
                summary: '同一场景也可以成为一条假设路线的证据。',
                npcProfileIds: [],
                openThreadIds: [],
                surfaces: ['coauthored_scene'],
            }],
            npcs: [{
                ...base('npc:keeper'),
                kind: 'npc',
                npcId: 'npc-id:keeper',
                routeId: 'route:shared-main',
                branchId: 'branch:shared-main',
                name: '守门人',
                aliases: ['门卫'],
                knownHistoricalFacts: ['曾替两人保管一封信'],
            }],
            relationshipStages: [{
                ...base('stage:trust'),
                kind: 'relationship_stage',
                stageId: 'stage-id:trust',
                label: '开始信任',
                summary: '双方开始主动交付重要信息。',
                evidenceMarkers: ['主动托付', '共同保密'],
            }],
            openThreads: [{
                ...base('thread:letter'),
                kind: 'open_thread',
                threadId: 'thread-id:letter',
                routeId: 'route:shared-main',
                branchId: 'branch:shared-main',
                title: '尚未拆开的信',
                summary: '旧记录只说明信被保存，没有证明后来已经拆开。',
                state: 'open',
            }],
        },
        createdAt: input.createdAt,
        completedAt: input.createdAt + 1,
    };
};

const passA1 = createPass({
    id: 'analysis-pass-a-1',
    requestId: request.id,
    analysisRunId: 'analysis-run-a-1',
    scope: SCOPE_A,
    createdAt: T0 + 10,
});
assert.deepEqual(validateHistoryAnalysisPass(passA1), []);
assert.match(
    validateHistoryAnalysisPass({
        ...passA1,
        narrativeProfile: {
            ...passA1.narrativeProfile,
            actors: [{ ...passA1.narrativeProfile.actors[0], scope: SCOPE_B }],
        },
    }).join('\n'),
    /crosses analysis pass scope/,
);
assert.match(
    validateHistoryAnalysisPass({
        ...passA1,
        narrativeProfile: {
            ...passA1.narrativeProfile,
            actors: [{
                ...passA1.narrativeProfile.actors[0],
                actorClass: 'unknown',
                resolution: 'resolved',
                resolvedNpcProfileId: undefined,
            }],
        },
    }).join('\n'),
    /unknown actor cannot claim resolved identity/,
);
assert.match(
    validateHistoryAnalysisPass({
        ...passA1,
        narrativeProfile: {
            ...passA1.narrativeProfile,
            eventRouteBindings: [{
                ...passA1.narrativeProfile.eventRouteBindings[0],
                routeProfileId: 'missing-route',
            }],
        },
    }).join('\n'),
    /points to missing route/,
);
assert.match(
    validateHistoryAnalysisPass({
        ...passA1,
        narrativeProfile: { ...passA1.narrativeProfile, scope: SCOPE_B },
    }).join('\n'),
    /crosses analysis pass scope/,
);
assert.match(
    validateHistoryAnalysisPass({
        ...passA1,
        narrativeProfile: { ...passA1.narrativeProfile, currentLocation: '今天的旧城门口' },
    } as HistoryAnalysisPass).join('\n'),
    /forbidden current-state field/,
);
assert.deepEqual(HISTORY_ANALYSIS_IDENTITY_CONTRACT.passIdComponents, [
    'scopeKey', 'sourceRevisionFingerprint', 'strategy', 'analysisRunId',
]);
assert.deepEqual(HISTORY_ANALYSIS_AUTHORITY_ORDER, [
    'model_reconstructed', 'source_inferred', 'source_explicit', 'user_confirmed',
]);
assert.equal(Object.values(HISTORY_ANALYSIS_HOLD).every(value => value === 'hold'), true);

const ambiguousActorA = {
    ...passA1.narrativeProfile.actors[0],
    resolution: 'ambiguous' as const,
    resolvedNpcProfileId: undefined,
};
const ambiguousActorB = {
    ...ambiguousActorA,
    id: `${passA1.id}:actor:keeper-other-source`,
    sourceRefs: [{ ...sharedSceneRef }],
};
const ambiguousActorPass: HistoryAnalysisPass = {
    ...passA1,
    narrativeProfile: {
        ...passA1.narrativeProfile,
        actors: [ambiguousActorA, ambiguousActorB],
        events: passA1.narrativeProfile.events.map(event => ({
            ...event,
            actorRefIds: [ambiguousActorA.id, ambiguousActorB.id],
        })),
    },
};
assert.deepEqual(validateHistoryAnalysisPass(ambiguousActorPass), []);
const ambiguousResolution = resolveHistoricalInterpretation({
    workspace: {
        schemaVersion: 3,
        id: 'history-workspace-ambiguous-fixture',
        scope: { ...SCOPE_A },
        contributingPassIds: [ambiguousActorPass.id],
        entityIds: [],
        bindingIds: [],
        overlayIds: [],
        createdAt: T0,
        updatedAt: T0,
        revision: 1,
    },
    passes: [ambiguousActorPass],
    bindings: [],
    overlays: [],
});
assert.equal(
    ambiguousResolution.narrativeProfile?.actors.length,
    2,
    'same unresolved alias in different source spans must not be forced into one NPC',
);

const factory = new IDBFactory();
const analysisBindingA1: HistoryEvidenceBinding = {
    schemaVersion: 3,
    id: 'binding-analysis-a1-main',
    scope: { ...SCOPE_A },
    sourceRef: { ...sourceRef },
    targetKind: 'route',
    targetId: passA1.narrativeProfile.routes[0].id,
    purpose: 'evidence',
    origin: 'analysis',
    analysisPassId: passA1.id,
    status: 'active',
    createdAt: T0 + 11,
    updatedAt: T0 + 11,
    revision: 1,
};
const extractionPacket: HistoricalNarrativeSourcePacket = {
    id: 'history-source-packet-a-1',
    scope: { ...SCOPE_A },
    sourceRefs: [{ ...sourceRef }],
    turns: [{
        sourceMessageId: 'daily-message-10',
        transportChannel: 'user',
        content: '两人在旧记录中谈起雨夜托付。',
    }],
    inputCharCount: '两人在旧记录中谈起雨夜托付。'.length,
};
const completedExtraction = {
    status: 'completed' as const,
    pass: passA1,
    bindings: [analysisBindingA1],
    receipt: {
        schemaVersion: 1 as const,
        id: 'history-extraction-receipt-a-1',
        requestId: request.id,
        analysisRunId: passA1.analysisRunId,
        scope: { ...SCOPE_A },
        sourceRevisionFingerprint: request.sourceRevisionFingerprint,
        status: 'completed' as const,
        truthEffect: 'none' as const,
        passId: passA1.id,
        bindingIds: [analysisBindingA1.id],
        extractorVersion: 'history-analysis-fixture-v3',
        promptVersion: 'history-narrative-v1',
        outputSchemaVersion: 'history-analysis-v3',
        usage: {
            packetCount: 1,
            sourceTurnCount: 1,
            inputCharCount: extractionPacket.inputCharCount,
            estimatedInputTokens: Math.ceil(extractionPacket.inputCharCount / 3),
            estimatorId: 'unicode_chars_div_3_v1' as const,
        },
        createdAt: T0 + 11,
    },
};
assert.deepEqual(validateHistoricalNarrativeExtractionResult({
    request,
    packets: [extractionPacket],
    promptVersion: 'history-narrative-v1',
    outputSchemaVersion: 'history-analysis-v3',
    result: completedExtraction,
}), []);
assert.equal(Object.values(HISTORICAL_NARRATIVE_EXTRACTION_TRUTH_POLICY).every(value => value === false), true);
const completedPublication = await publishHistoricalNarrativeExtractionResult({
    request,
    packets: [extractionPacket],
    promptVersion: 'history-narrative-v1',
    outputSchemaVersion: 'history-analysis-v3',
    result: completedExtraction,
    factory,
});
assert.equal(completedPublication.status, 'completed');
let workspaceA = completedPublication.status === 'completed' ? completedPublication.workspace : assert.fail();
assert.equal(workspaceA.revision, 1);
assert.deepEqual((await publishHistoryAnalysisPass({
    pass: passA1,
    bindings: [analysisBindingA1],
    factory,
})).contributingPassIds, [passA1.id]);
assert.deepEqual(
    (await listHistoricalNarrativeExtractionReceipts({ scope: SCOPE_A, factory })).map(item => item.id),
    [completedExtraction.receipt.id],
    'completed pass and its receipt must commit atomically',
);
const failedExtraction = {
    status: 'failed' as const,
    receipt: {
        ...completedExtraction.receipt,
        id: 'history-extraction-receipt-a-failed',
        analysisRunId: 'analysis-run-a-failed',
        status: 'failed' as const,
        passId: undefined,
        bindingIds: [],
        reason: 'fixture provider timeout',
        createdAt: T0 + 12,
    },
};
await publishHistoricalNarrativeExtractionResult({
    request,
    packets: [extractionPacket],
    promptVersion: 'history-narrative-v1',
    outputSchemaVersion: 'history-analysis-v3',
    result: failedExtraction,
    factory,
});
assert.deepEqual(
    (await listHistoricalNarrativeExtractionReceipts({ scope: SCOPE_A, factory }))
        .map(item => [item.id, item.status]),
    [
        [completedExtraction.receipt.id, 'completed'],
        [failedExtraction.receipt.id, 'failed'],
    ],
    'failed attempts retain usage and reason without creating truth',
);
await assert.rejects(
    () => publishHistoryAnalysisPass({
        pass: { ...passA1, completedAt: passA1.completedAt + 50 },
        factory,
    }),
    /another immutable result/,
);

const passA2 = createPass({
    id: 'analysis-pass-a-2',
    requestId: 'analysis-request-a-2',
    analysisRunId: 'analysis-run-a-2',
    scope: SCOPE_A,
    createdAt: T0 + 20,
});
await assert.rejects(
    () => publishHistoryAnalysisPass({ pass: passA2, factory }),
    /workspace changed before pass publication/,
);
workspaceA = await publishHistoryAnalysisPass({
    pass: passA2,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});
assert.deepEqual(workspaceA.contributingPassIds, [passA1.id, passA2.id]);

let bundleA = await getHistoricalInterpretationBundle({ scope: SCOPE_A, factory });
assert.ok(bundleA);
assert.equal(bundleA.passes.length, 2, 'same source and strategy must preserve both passes');
let resolvedA = resolveHistoricalInterpretation(bundleA);
assert.equal(resolvedA.relationshipMemories.length, 1, 'exact duplicate cards should coalesce');
assert.equal(resolvedA.narrativeProfile?.actors.length, 1);
assert.equal(resolvedA.narrativeProfile?.events.length, 1);
assert.equal(resolvedA.narrativeProfile?.eventRouteBindings.length, 2);
assert.deepEqual(
    resolvedA.narrativeProfile?.eventRouteBindings.map(binding => binding.continuity).sort(),
    ['if_line', 'mainline'],
    'one event may remain attached to several routes without moving between them',
);
const narrativeProjection = projectHistoricalNarrativeProjection(resolvedA);
assert.equal(narrativeProjection?.workspaceRevision, workspaceA.revision);
assert.equal(narrativeProjection?.events.length, 1);
assert.equal(narrativeProjection?.eventRouteBindings.length, 2);
assert.deepEqual(
    (await readHistoricalNarrativeProjection({ scope: SCOPE_A, factory }))?.profileId,
    narrativeProjection?.profileId,
);
assert.equal(await readHistoricalNarrativeProjection({ scope: SCOPE_B, factory }), null);
assert.deepEqual(
    resolvedA.provenance.find(item => item.entityId === resolvedA.relationshipMemories[0].id)?.analysisPassIds,
    [passA1.id, passA2.id],
    'coalesced cards must retain pass provenance',
);

const mainRouteId = passA1.narrativeProfile.routes[0].id;
const ifRouteId = passA1.narrativeProfile.routes[1].id;
const bindingMain: HistoryEvidenceBinding = {
    schemaVersion: 3,
    id: 'binding-shared-scene-main',
    scope: { ...SCOPE_A },
    sourceRef: { ...sharedSceneRef },
    targetKind: 'route',
    targetId: mainRouteId,
    purpose: 'turning_point',
    origin: 'user',
    status: 'active',
    createdAt: T0 + 30,
    updatedAt: T0 + 30,
    revision: 1,
};
workspaceA = await saveHistoryEvidenceBinding({
    binding: bindingMain,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});
const bindingIf: HistoryEvidenceBinding = {
    ...bindingMain,
    id: 'binding-shared-scene-if',
    targetId: ifRouteId,
    createdAt: T0 + 31,
    updatedAt: T0 + 31,
};
workspaceA = await saveHistoryEvidenceBinding({
    binding: bindingIf,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});
bundleA = await getHistoricalInterpretationBundle({ scope: SCOPE_A, factory });
assert.ok(bundleA);
assert.equal(bundleA.bindings.filter(binding => binding.status === 'active').length, 3);
assert.equal(
    bundleA.bindings.filter(binding => binding.sourceRef.startMessageOffset === sharedSceneRef.startMessageOffset).length,
    2,
    'one source span must be allowed to bind to two routes',
);

workspaceA = await saveHistoryEvidenceBinding({
    binding: {
        ...bindingMain,
        status: 'hidden',
        updatedAt: T0 + 32,
        revision: 2,
    },
    expectedWorkspaceRevision: workspaceA.revision,
    expectedBindingRevision: 1,
    factory,
});
bundleA = await getHistoricalInterpretationBundle({ scope: SCOPE_A, factory });
assert.ok(bundleA);
assert.equal(bundleA.bindings.find(binding => binding.id === bindingMain.id)?.status, 'hidden');
assert.equal(bundleA.bindings.find(binding => binding.id === bindingIf.id)?.status, 'active');
assert.equal(bundleA.workspace.contributingPassIds.length, 2, 'hiding one binding must not remove source or passes');

const correctionOverlay: HistoricalUserOverlay = {
    schemaVersion: 3,
    id: 'overlay-memory-rain-edit-v1',
    seriesId: 'overlay-memory-rain-edit',
    scope: { ...SCOPE_A },
    targetKind: 'relationship_memory',
    targetId: passA1.relationshipMemories[0].id,
    operation: 'update',
    patch: {
        title: '第一次认真一起听雨',
        summary: '玩家补充：重点是两个人第一次安静听完一场雨。',
    },
    provenance: 'source_linked',
    sourceRefs: [{ ...sourceRef }],
    authority: 'user_confirmed',
    createdAt: T0 + 40,
    revision: 1,
};
workspaceA = await appendHistoricalUserOverlay({
    overlay: correctionOverlay,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});

const passA3 = createPass({
    id: 'analysis-pass-a-3',
    requestId: 'analysis-request-a-3',
    analysisRunId: 'analysis-run-a-3',
    scope: SCOPE_A,
    createdAt: T0 + 50,
});
workspaceA = await publishHistoryAnalysisPass({
    pass: passA3,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});
bundleA = await getHistoricalInterpretationBundle({ scope: SCOPE_A, factory });
assert.ok(bundleA);
resolvedA = resolveHistoricalInterpretation(bundleA);
assert.equal(
    resolvedA.relationshipMemories.some(memory => memory.title === '第一次认真一起听雨'),
    true,
    'user correction must survive later analysis passes',
);
assert.equal(passA1.relationshipMemories[0].title, '第一次一起看雨', 'overlay must not mutate pass output');

const manualOverlay: HistoricalUserOverlay = {
    schemaVersion: 3,
    id: 'overlay-manual-memory-v1',
    seriesId: 'overlay-manual-memory',
    scope: { ...SCOPE_A },
    targetKind: 'relationship_memory',
    operation: 'create',
    patch: {
        title: '我们还约定过一本书',
        summary: '这是玩家自己补充的旧约定，当前没有对应原文。',
        memoryPolicy: 'relationship_echo',
    },
    provenance: 'user_attested',
    sourceRefs: [],
    authority: 'user_confirmed',
    createdAt: T0 + 60,
    revision: 1,
};
workspaceA = await appendHistoricalUserOverlay({
    overlay: manualOverlay,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});
const manualTargetId = createHistoricalUserEntityId(manualOverlay.seriesId);
const hideManualOverlay: HistoricalUserOverlay = {
    ...manualOverlay,
    id: 'overlay-manual-memory-v2-hide',
    previousOverlayId: manualOverlay.id,
    targetId: manualTargetId,
    operation: 'hide',
    patch: {},
    createdAt: T0 + 61,
    revision: 2,
};
workspaceA = await appendHistoricalUserOverlay({
    overlay: hideManualOverlay,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});
assert.equal(
    (await readHistoricalRelationshipViews({ scope: SCOPE_A, factory })).contactMemories
        .some(row => row.id === manualTargetId),
    false,
    'hide overlay must remove only the resolved card',
);
const restoreManualOverlay: HistoricalUserOverlay = {
    ...hideManualOverlay,
    id: 'overlay-manual-memory-v3-restore',
    previousOverlayId: hideManualOverlay.id,
    operation: 'restore',
    createdAt: T0 + 62,
    revision: 3,
};
workspaceA = await appendHistoricalUserOverlay({
    overlay: restoreManualOverlay,
    expectedWorkspaceRevision: workspaceA.revision,
    factory,
});
assert.match(
    validateHistoricalUserOverlay({
        ...manualOverlay,
        patch: { ...manualOverlay.patch, currentMood: '想念' },
    }).join('\n'),
    /forbidden current-state field/,
);
await assert.rejects(
    () => appendHistoricalUserOverlay({
        overlay: { ...manualOverlay, id: 'overlay-cross-mask', scope: SCOPE_B },
        expectedWorkspaceRevision: workspaceA.revision,
        factory,
    }),
    /workspace does not exist/,
);

const viewsA = await readHistoricalRelationshipViews({ scope: SCOPE_A, factory });
assert.equal(viewsA.workspaceId, workspaceA.id);
const manualRow = viewsA.contactMemories.find(row => row.title === manualOverlay.patch.title);
assert.equal(manualRow?.provenance, 'user_attested');
assert.equal(manualRow?.provenanceLabel, '我补充的');
assert.equal(manualRow?.sourceRefs.length, 0);
assert.equal('bindingCount' in viewsA, false);
assert.equal(viewsA.contactMemories.some(row => 'routeCount' in row || 'membershipCount' in row), false);
assert.equal(viewsA.narrativeProfile?.routes.length, 2, 'duplicate route pairs should coalesce');

const passB1 = createPass({
    id: 'analysis-pass-b-1',
    requestId: 'analysis-request-b-1',
    analysisRunId: 'analysis-run-b-1',
    scope: SCOPE_B,
    createdAt: T0 + 70,
});
await publishHistoryAnalysisPass({ pass: passB1, factory });
const viewsB = await readHistoricalRelationshipViews({ scope: SCOPE_B, factory });
assert.equal(viewsB.contactMemories.every(row => row.scope.personaMaskId === SCOPE_B.personaMaskId), true);
assert.equal(viewsB.contactMemories.some(row => row.title === manualOverlay.patch.title), false);
assert.deepEqual(projectHistoricalRelationshipViews(null), {
    contactMemories: [], timebookNodes: [], narrativeProfile: null,
});

const database = await openHistoryAnalysisDatabase(factory);
assert.equal(database.name, HISTORY_ANALYSIS_DB_NAME);
assert.deepEqual(
    [...database.objectStoreNames].sort(),
    [
        HISTORICAL_USER_OVERLAY_STORE,
        HISTORICAL_NARRATIVE_EXTRACTION_RECEIPT_STORE,
        HISTORY_ANALYSIS_PASS_STORE,
        HISTORY_ANALYSIS_WORKSPACE_STORE,
        HISTORY_EVIDENCE_BINDING_STORE,
    ].sort(),
);
assert.deepEqual(
    Array.from(
        database
            .transaction(HISTORY_ANALYSIS_PASS_STORE, 'readonly')
            .objectStore(HISTORY_ANALYSIS_PASS_STORE)
            .index(HISTORY_ANALYSIS_SCOPE_CREATED_INDEX)
            .keyPath as string[],
    ),
    [
        'scope.progressBundleId',
        'scope.personaMaskId',
        'scope.charId',
        'createdAt',
    ],
);
database.close();

console.log('history analysis v3 OK: actors + events + non-exclusive routes + immutable passes + overlays');
