import assert from 'node:assert/strict';
import {
    activateNarrativeScene,
    addNarrativeRun,
    addNarrativeScene,
    appendNarrativeBeat,
    confirmNarrativeScene,
    createEmptyNovelNarrativeState,
    createNarrativeBeat,
    createNarrativeRun,
    createNarrativeScene,
    markNarrativeScenePlayed,
    normalizeNovelNarrativeState,
} from '../domain/narrative/state.ts';
import { inspectNovelNarrative } from '../domain/narrative/inspection.ts';
import {
    appendStoryDirection,
    createStoryDirection,
    discardStoryDirection,
    reviseStoryDirection,
} from '../domain/narrative/directives.ts';
import { activateStoryDirection } from '../domain/narrative/activation.ts';
import { startDraftNarrativeRun } from '../domain/narrative/runLifecycle.ts';
import type { NarrativeExperienceReceipt, NovelBook } from '../types.ts';

const T0 = 1_700_000_000_000;

const empty = normalizeNovelNarrativeState(undefined, T0);
assert.deepEqual(empty, {
    schemaVersion: 1,
    runs: [],
    scenes: [],
    receipts: [],
    updatedAt: T0,
});

const mainlineRun = createNarrativeRun({
    id: 'run-mainline-1',
    progressBundleId: 'bundle-user-1',
    bookId: 'book-1',
    routeId: 'route-summer-station',
    branchId: 'branch-main',
    lane: 'mainline',
    status: 'active',
    participantCharIds: ['char-a', 'char-a'],
    directiveIds: ['directive-1'],
    routeState: { trust: 2, umbrellaReturned: false },
}, T0 + 1);
assert.deepEqual(mainlineRun.participantCharIds, ['char-a']);

let mainline = addNarrativeRun(empty, mainlineRun, T0 + 2);
const stationScene = createNarrativeScene({
    id: 'scene-station-rain',
    runId: mainlineRun.id,
    title: '雨里的旧站台',
    participantIds: ['user', 'char-a'],
    constraints: ['角色仍在恢复期，不安排剧烈活动'],
}, T0 + 3);
mainline = addNarrativeScene(mainline, stationScene, T0 + 4);

const narrationBeat = createNarrativeBeat({
    id: 'beat-rain',
    kind: 'narration',
    content: '雨线把站台外的灯切成细碎的光。',
}, T0 + 5);
assert.throws(
    () => appendNarrativeBeat(mainline, stationScene.id, narrationBeat, T0 + 6),
    /active scene/,
);

mainline = activateNarrativeScene(mainline, stationScene.id, T0 + 7);
const beforeFirstBeat = mainline;
mainline = appendNarrativeBeat(mainline, stationScene.id, narrationBeat, T0 + 8);
assert.equal(beforeFirstBeat.scenes[0].beats.length, 0, 'state transitions must not mutate their input');

const actionBeat = createNarrativeBeat({
    id: 'beat-user-action',
    kind: 'user_action',
    authorId: 'user',
    content: '我把伞稍稍偏向他那一边。',
}, T0 + 9);
mainline = appendNarrativeBeat(mainline, stationScene.id, actionBeat, T0 + 10);
mainline = markNarrativeScenePlayed(mainline, stationScene.id, T0 + 11);
assert.throws(
    () => appendNarrativeBeat(mainline, stationScene.id, createNarrativeBeat({
        id: 'beat-too-late',
        kind: 'system_note',
        content: '这一拍不应写入。',
    }, T0 + 12), T0 + 13),
    /active scene/,
);

const mainlineReceipt: NarrativeExperienceReceipt = {
    id: 'receipt-station-rain',
    progressBundleId: mainlineRun.progressBundleId,
    runId: mainlineRun.id,
    sceneId: stationScene.id,
    lane: 'mainline',
    participantCharIds: ['char-a'],
    summary: '两人在雨中的旧站台重逢，用户把伞偏向了角色。',
    acceptedFacts: ['用户在旧站台陪角色等雨变小'],
    rejectedOrEditedFacts: ['没有立刻去跳舞'],
    memoryPolicy: 'relationship_echo',
    confirmedByUser: true,
    playedAt: T0 + 11,
};
assert.throws(
    () => confirmNarrativeScene(mainline, { ...mainlineReceipt, confirmedByUser: false }, T0 + 14),
    /explicit user confirmation/,
);
mainline = confirmNarrativeScene(mainline, mainlineReceipt, T0 + 14);
assert.equal(mainline.scenes[0].status, 'confirmed');
assert.equal(mainline.receipts[0].confirmedAt, T0 + 14);
assert.equal(
    confirmNarrativeScene(mainline, mainlineReceipt, T0 + 15),
    mainline,
    'replaying the same confirmation must be idempotent',
);

let ifLine = createEmptyNovelNarrativeState(T0 + 20);
const ifRun = createNarrativeRun({
    id: 'run-if-1',
    progressBundleId: 'bundle-user-1',
    bookId: 'book-1',
    routeId: 'route-summer-station',
    branchId: 'branch-if-missed-train',
    lane: 'if_line',
    status: 'active',
    participantCharIds: ['char-a'],
}, T0 + 21);
ifLine = addNarrativeRun(ifLine, ifRun, T0 + 22);
const ifScene = createNarrativeScene({
    id: 'scene-if-missed-train',
    runId: ifRun.id,
    title: '如果没有赶上末班车',
    status: 'active',
    participantIds: ['user', 'char-a'],
}, T0 + 23);
ifLine = addNarrativeScene(ifLine, ifScene, T0 + 24);
ifLine = appendNarrativeBeat(ifLine, ifScene.id, createNarrativeBeat({
    id: 'beat-if',
    kind: 'user_action',
    authorId: 'user',
    content: '我停在检票口外，没有追上去。',
}, T0 + 25), T0 + 26);
ifLine = markNarrativeScenePlayed(ifLine, ifScene.id, T0 + 27);

const ifReceiptBase: NarrativeExperienceReceipt = {
    id: 'receipt-if-missed-train',
    progressBundleId: ifRun.progressBundleId,
    runId: ifRun.id,
    sceneId: ifScene.id,
    lane: 'if_line',
    participantCharIds: ['char-a'],
    summary: 'IF 线里，两人错过了同一班车。',
    acceptedFacts: ['这只属于 IF 线'],
    memoryPolicy: 'dream_material',
    confirmedByUser: true,
    playedAt: T0 + 27,
};
assert.throws(
    () => confirmNarrativeScene(ifLine, { ...ifReceiptBase, lane: 'mainline' }, T0 + 28),
    /lane does not match/,
);
assert.throws(
    () => confirmNarrativeScene(ifLine, { ...ifReceiptBase, memoryPolicy: 'main_vault' }, T0 + 28),
    /incompatible/,
);
ifLine = confirmNarrativeScene(ifLine, ifReceiptBase, T0 + 29);
assert.equal(ifLine.receipts[0].lane, 'if_line');
assert.equal(ifLine.receipts[0].memoryPolicy, 'dream_material');

const imported = normalizeNovelNarrativeState({
    schemaVersion: 99,
    runs: [
        { ...mainlineRun, id: 'run-import-a' },
        { ...mainlineRun, id: 'run-import-b' },
    ],
    scenes: [
        { ...stationScene, id: 'scene-import-a', runId: 'run-import-a', status: 'active', openedAt: T0 },
        { ...stationScene, id: 'scene-import-b', runId: 'run-import-a', status: 'active', openedAt: T0 },
        { ...stationScene, id: 'scene-orphan', runId: 'missing-run' },
    ],
    receipts: [],
    updatedAt: T0 + 30,
}, T0 + 31);
assert.equal(imported.schemaVersion, 1);
assert.equal(imported.runs.filter(run => run.status === 'active').length, 1);
assert.equal(imported.scenes.filter(scene => scene.status === 'active').length, 1);
assert.equal(imported.scenes.some(scene => scene.id === 'scene-orphan'), false);

const bookWithNarrative: NovelBook = {
    id: 'book-1',
    title: '雨站',
    summary: '长剧情基座备份夹具',
    coverStyle: 'midnight',
    worldSetting: '一座总在下雨的沿海城。',
    collaboratorIds: ['char-a'],
    protagonists: [],
    segments: [],
    narrative: mainline,
    createdAt: T0,
    lastActiveAt: T0 + 14,
};
const roundTrippedBook = JSON.parse(JSON.stringify(bookWithNarrative)) as NovelBook;
assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeNovelNarrativeState(roundTrippedBook.narrative, T0 + 40))),
    JSON.parse(JSON.stringify(mainline)),
    'nested narrative state must survive the existing whole-NovelBook backup shape',
);

const legacyBook: NovelBook = {
    id: 'legacy-book',
    title: '旧小说',
    summary: '没有长剧情字段的旧记录',
    coverStyle: 'paper',
    worldSetting: '',
    collaboratorIds: [],
    protagonists: [],
    segments: [],
    createdAt: T0,
    lastActiveAt: T0,
};
assert.deepEqual(normalizeNovelNarrativeState(legacyBook.narrative, T0 + 41).runs, []);

const otherBundleRun = {
    ...ifLine.runs[0],
    id: 'run-bundle-2',
    progressBundleId: 'bundle-user-2',
};
const otherBundleScene = {
    ...ifLine.scenes[0],
    id: 'scene-bundle-2',
    runId: otherBundleRun.id,
};
const otherBundleReceipt = {
    ...ifLine.receipts[0],
    id: 'receipt-bundle-2',
    progressBundleId: otherBundleRun.progressBundleId,
    runId: otherBundleRun.id,
    sceneId: otherBundleScene.id,
};
const inspectionSource = {
    createdAt: T0,
    lastActiveAt: T0 + 50,
    directives: [
        {
            id: 'directive-bundle-1',
            title: '当前面具的约定',
            summary: '只属于 bundle-user-1。',
            lane: 'pending_mainline' as const,
            status: 'pending' as const,
            sourceSurface: 'consult_desk' as const,
            charIds: ['char-a'],
            memoryPolicy: 'manual_promotion' as const,
            progressBundleId: 'bundle-user-1',
            createdAt: T0,
            updatedAt: T0,
        },
        {
            id: 'directive-bundle-2',
            title: '另一个面具的约定',
            summary: '不能在当前面具里出现。',
            lane: 'pending_mainline' as const,
            status: 'pending' as const,
            sourceSurface: 'consult_desk' as const,
            charIds: ['char-a'],
            memoryPolicy: 'manual_promotion' as const,
            progressBundleId: 'bundle-user-2',
            createdAt: T0,
            updatedAt: T0,
        },
        {
            id: 'directive-legacy',
            title: '旧指令',
            summary: '未绑定面具，只能作为待整理记录显示。',
            lane: 'draft' as const,
            status: 'pending' as const,
            sourceSurface: 'novel' as const,
            charIds: ['char-a'],
            memoryPolicy: 'manual_promotion' as const,
            createdAt: T0,
            updatedAt: T0,
        },
    ],
    narrative: {
        schemaVersion: 1,
        runs: [...mainline.runs, otherBundleRun],
        scenes: [...mainline.scenes, otherBundleScene],
        receipts: [...mainline.receipts, otherBundleReceipt],
        activeRunId: mainline.activeRunId,
        updatedAt: T0 + 50,
    },
};
const bundleOneInspection = inspectNovelNarrative(inspectionSource, 'bundle-user-1');
assert.deepEqual(bundleOneInspection.directives.map(directive => directive.id), ['directive-bundle-1']);
assert.deepEqual(bundleOneInspection.runs.map(run => run.id), ['run-mainline-1']);
assert.deepEqual(bundleOneInspection.scenes.map(scene => scene.id), ['scene-station-rain']);
assert.deepEqual(bundleOneInspection.receipts.map(receipt => receipt.id), ['receipt-station-rain']);
assert.deepEqual(bundleOneInspection.unscopedDirectives.map(directive => directive.id), ['directive-legacy']);
assert.equal(bundleOneInspection.otherBundleDirectiveCount, 1);
assert.equal(bundleOneInspection.otherBundleRunCount, 1);

const missingBundleInspection = inspectNovelNarrative(inspectionSource);
assert.equal(missingBundleInspection.directives.length, 0);
assert.equal(missingBundleInspection.runs.length, 0);
assert.deepEqual(missingBundleInspection.unscopedDirectives.map(directive => directive.id), ['directive-legacy']);

const manualMainline = createStoryDirection({
    id: 'directive-manual-mainline',
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    title: ' 雨停以前先谈谈 ',
    summary: ' 两个人留在站台，把一直没说完的话说完。 ',
    lane: 'pending_mainline',
    charIds: ['char-a', 'char-a', '  '],
}, T0 + 60);
assert.equal(manualMainline.title, '雨停以前先谈谈');
assert.deepEqual(manualMainline.charIds, ['char-a']);
assert.equal(manualMainline.status, 'pending');
assert.equal(manualMainline.memoryPolicy, 'manual_promotion');
assert.equal(manualMainline.activationMode, 'manual');
assert.deepEqual(manualMainline.sourceRefs, [{
    surface: 'consult_desk',
    id: 'book-1',
    label: '剧情台手工方向',
}]);

const manualIf = createStoryDirection({
    id: 'directive-manual-if',
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    title: '如果错过末班车',
    summary: '只在 IF 线看看另一种可能。',
    lane: 'if_line',
    charIds: ['char-a'],
}, T0 + 61);
assert.equal(manualIf.memoryPolicy, 'dream_material');
assert.throws(() => createStoryDirection({
    id: 'directive-missing-bundle',
    bookId: 'book-1',
    progressBundleId: ' ',
    title: '不会保存',
    summary: '缺少身份进度包。',
    lane: 'pending_mainline',
    charIds: ['char-a'],
}, T0 + 62), /progressBundleId/);
assert.throws(() => createStoryDirection({
    id: 'directive-missing-character',
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    title: '不会保存',
    summary: '缺少同行角色。',
    lane: 'pending_mainline',
    charIds: [],
}, T0 + 62), /participant/);

const originalManualList = [manualMainline];
const appendedManualList = appendStoryDirection(originalManualList, manualIf);
assert.equal(originalManualList.length, 1, 'append must not mutate the source list');
assert.equal(appendedManualList.length, 2);
assert.throws(() => appendStoryDirection(appendedManualList, manualIf), /already exists/);

const revisedManualList = reviseStoryDirection(appendedManualList, manualMainline.id, {
    progressBundleId: 'bundle-user-1',
    expectedUpdatedAt: manualMainline.updatedAt,
    title: '雨停以后再出发',
    summary: '先休息，再决定下一站。',
    lane: 'if_line',
    charIds: ['char-a'],
}, T0 + 63);
assert.equal(appendedManualList[0].title, '雨停以前先谈谈', 'revision must be immutable');
assert.equal(revisedManualList[0].title, '雨停以后再出发');
assert.equal(revisedManualList[0].memoryPolicy, 'dream_material');
assert.throws(() => reviseStoryDirection(revisedManualList, manualMainline.id, {
    progressBundleId: 'bundle-user-1',
    expectedUpdatedAt: manualMainline.updatedAt,
    title: '过期复核',
    summary: '旧页面不能覆盖新内容。',
    lane: 'if_line',
    charIds: ['char-a'],
}, T0 + 64), /changed after this review/);
assert.throws(() => discardStoryDirection(
    revisedManualList,
    manualMainline.id,
    'bundle-user-2',
    revisedManualList[0].updatedAt,
    T0 + 65,
), /progress bundle/);

const discardedManualList = discardStoryDirection(
    revisedManualList,
    manualMainline.id,
    'bundle-user-1',
    revisedManualList[0].updatedAt,
    T0 + 65,
);
assert.equal(discardedManualList[0].status, 'discarded');
assert.equal(revisedManualList[0].status, 'pending', 'discard must not mutate the source list');
assert.throws(() => discardStoryDirection(
    discardedManualList,
    manualMainline.id,
    'bundle-user-1',
    discardedManualList[0].updatedAt,
    T0 + 66,
), /only pending manual/);

const activationSourceDirectives = [manualMainline, manualIf, {
    ...manualIf,
    id: 'directive-other-bundle',
    progressBundleId: 'bundle-user-2',
}];
const mainlineActivation = activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: manualMainline.id,
    expectedUpdatedAt: manualMainline.updatedAt,
    availableCharIds: ['char-a'],
    directives: activationSourceDirectives,
    narrative: undefined,
}, T0 + 70);
assert.equal(activationSourceDirectives[0].status, 'pending', 'activation must not mutate directives');
assert.equal(mainlineActivation.directive.status, 'activated');
assert.equal(mainlineActivation.directive.routeId, `route-${manualMainline.id}`);
assert.equal(mainlineActivation.directive.branchId, 'branch-main');
assert.equal(mainlineActivation.run.id, `run-${manualMainline.id}`);
assert.equal(mainlineActivation.run.status, 'draft');
assert.equal(mainlineActivation.run.lane, 'mainline');
assert.deepEqual(mainlineActivation.run.directiveIds, [manualMainline.id]);
assert.equal(mainlineActivation.narrative.runs.length, 1);
assert.equal(mainlineActivation.narrative.scenes.length, 0);
assert.equal(mainlineActivation.narrative.receipts.length, 0);
assert.equal(mainlineActivation.narrative.activeRunId, undefined);
assert.equal(mainlineActivation.directives[2], activationSourceDirectives[2], 'other bundles must be preserved');

const ifActivation = activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: manualIf.id,
    expectedUpdatedAt: manualIf.updatedAt,
    availableCharIds: ['char-a'],
    directives: activationSourceDirectives,
    narrative: undefined,
}, T0 + 71);
assert.equal(ifActivation.run.lane, 'if_line');
assert.equal(ifActivation.run.branchId, 'branch-if-root');
assert.equal(ifActivation.directive.memoryPolicy, 'dream_material');

const preservedRunState = addNarrativeRun(
    createEmptyNovelNarrativeState(T0 + 71),
    createNarrativeRun({
        id: 'run-preserved-other-bundle',
        progressBundleId: 'bundle-user-2',
        bookId: 'book-1',
        routeId: 'route-preserved-other-bundle',
        branchId: 'branch-main',
        lane: 'mainline',
        participantCharIds: ['char-b'],
    }, T0 + 71),
    T0 + 71,
);
const preservedRunActivation = activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: manualMainline.id,
    expectedUpdatedAt: manualMainline.updatedAt,
    availableCharIds: ['char-a'],
    directives: activationSourceDirectives,
    narrative: preservedRunState,
}, T0 + 72);
assert.deepEqual(
    preservedRunActivation.narrative.runs.map(run => run.id),
    ['run-preserved-other-bundle', `run-${manualMainline.id}`],
    'activation must preserve runs from other bundles',
);

assert.throws(() => activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-2',
    directiveId: manualMainline.id,
    expectedUpdatedAt: manualMainline.updatedAt,
    availableCharIds: ['char-a'],
    directives: activationSourceDirectives,
    narrative: undefined,
}, T0 + 72), /progress bundle/);
assert.throws(() => activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: manualMainline.id,
    expectedUpdatedAt: manualMainline.updatedAt - 1,
    availableCharIds: ['char-a'],
    directives: activationSourceDirectives,
    narrative: undefined,
}, T0 + 72), /changed after this activation review/);
assert.throws(() => activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: manualMainline.id,
    expectedUpdatedAt: manualMainline.updatedAt,
    availableCharIds: ['char-b'],
    directives: activationSourceDirectives,
    narrative: undefined,
}, T0 + 72), /outside the active persona scope/);
assert.throws(() => activateStoryDirection({
    bookId: 'book-2',
    progressBundleId: 'bundle-user-1',
    directiveId: manualMainline.id,
    expectedUpdatedAt: manualMainline.updatedAt,
    availableCharIds: ['char-a'],
    directives: activationSourceDirectives,
    narrative: undefined,
}, T0 + 72), /does not belong to this StoryDesk book/);
assert.throws(() => activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: manualMainline.id,
    expectedUpdatedAt: manualMainline.updatedAt,
    availableCharIds: ['char-a'],
    directives: [{ ...manualMainline, sourceSurface: 'novel' }],
    narrative: undefined,
}, T0 + 72), /only pending manual/);
assert.throws(() => activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: mainlineActivation.directive.id,
    expectedUpdatedAt: mainlineActivation.directive.updatedAt,
    availableCharIds: ['char-a'],
    directives: mainlineActivation.directives,
    narrative: mainlineActivation.narrative,
}, T0 + 73), /only pending manual/);

const inconsistentPending = {
    ...manualMainline,
    id: 'directive-inconsistent-pending',
};
const conflictingRun = createNarrativeRun({
    id: `run-${inconsistentPending.id}`,
    progressBundleId: 'bundle-user-1',
    bookId: 'book-1',
    routeId: `route-${inconsistentPending.id}`,
    branchId: 'branch-main',
    lane: 'mainline',
    participantCharIds: ['char-a'],
}, T0 + 73);
const conflictingNarrative = addNarrativeRun(
    createEmptyNovelNarrativeState(T0 + 73),
    conflictingRun,
    T0 + 73,
);
assert.throws(() => activateStoryDirection({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    directiveId: inconsistentPending.id,
    expectedUpdatedAt: inconsistentPending.updatedAt,
    availableCharIds: ['char-a'],
    directives: [inconsistentPending],
    narrative: conflictingNarrative,
}, T0 + 74), /derived narrative route identity already exists/);
assert.equal(conflictingNarrative.runs.length, 1, 'failed activation must not mutate narrative state');

const startSource = preservedRunActivation.narrative;
const startSourceRun = startSource.runs.find(run => run.id === mainlineActivation.run.id);
assert.ok(startSourceRun);
const startedRun = startDraftNarrativeRun({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    runId: startSourceRun.id,
    expectedUpdatedAt: startSourceRun.updatedAt,
    narrative: startSource,
}, T0 + 80);
assert.equal(startSourceRun.status, 'draft', 'run start must not mutate the source narrative');
assert.equal(startedRun.run.status, 'active');
assert.equal(startedRun.run.updatedAt, T0 + 80);
assert.equal(startedRun.narrative.activeRunId, startSourceRun.id);
assert.equal(startedRun.narrative.scenes.length, 0, 'run start must not create a scene');
assert.equal(startedRun.narrative.receipts.length, 0, 'run start must not create a receipt');
assert.equal(
    startedRun.narrative.runs.find(run => run.id === 'run-preserved-other-bundle')?.status,
    'draft',
    'run start must preserve another bundle without selecting it',
);

assert.throws(() => startDraftNarrativeRun({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    runId: startSourceRun.id,
    expectedUpdatedAt: startSourceRun.updatedAt - 1,
    narrative: startSource,
}, T0 + 81), /changed after this start review/);
assert.throws(() => startDraftNarrativeRun({
    bookId: 'book-2',
    progressBundleId: 'bundle-user-1',
    runId: startSourceRun.id,
    expectedUpdatedAt: startSourceRun.updatedAt,
    narrative: startSource,
}, T0 + 81), /does not belong to this StoryDesk book/);
assert.throws(() => startDraftNarrativeRun({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-2',
    runId: startSourceRun.id,
    expectedUpdatedAt: startSourceRun.updatedAt,
    narrative: startSource,
}, T0 + 81), /active progress bundle/);
assert.throws(() => startDraftNarrativeRun({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    runId: startSourceRun.id,
    expectedUpdatedAt: startedRun.run.updatedAt,
    narrative: startedRun.narrative,
}, T0 + 81), /Only a draft narrative run/);

const secondDraft = createNarrativeRun({
    id: 'run-second-draft',
    progressBundleId: 'bundle-user-1',
    bookId: 'book-1',
    routeId: 'route-second-draft',
    branchId: 'branch-main',
    lane: 'mainline',
    participantCharIds: ['char-a'],
}, T0 + 81);
const narrativeWithSecondDraft = addNarrativeRun(startedRun.narrative, secondDraft, T0 + 81);
assert.throws(() => startDraftNarrativeRun({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    runId: secondDraft.id,
    expectedUpdatedAt: secondDraft.updatedAt,
    narrative: narrativeWithSecondDraft,
}, T0 + 82), /Another narrative run is already active/);

const nonEmptyDraft = createNarrativeRun({
    id: 'run-non-empty-draft',
    progressBundleId: 'bundle-user-1',
    bookId: 'book-1',
    routeId: 'route-non-empty-draft',
    branchId: 'branch-main',
    lane: 'mainline',
    participantCharIds: ['char-a'],
}, T0 + 83);
let nonEmptyDraftState = addNarrativeRun(createEmptyNovelNarrativeState(T0 + 83), nonEmptyDraft, T0 + 83);
nonEmptyDraftState = addNarrativeScene(nonEmptyDraftState, createNarrativeScene({
    id: 'scene-premature-plan',
    runId: nonEmptyDraft.id,
    title: '不应提前存在的场景',
    participantIds: ['char-a'],
}, T0 + 84), T0 + 84);
assert.throws(() => startDraftNarrativeRun({
    bookId: 'book-1',
    progressBundleId: 'bundle-user-1',
    runId: nonEmptyDraft.id,
    expectedUpdatedAt: nonEmptyDraft.updatedAt,
    narrative: nonEmptyDraftState,
}, T0 + 85), /must be empty/);
assert.equal(nonEmptyDraftState.runs[0].status, 'draft', 'failed run start must leave its source untouched');

console.log('narrative foundation fixtures passed');
