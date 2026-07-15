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

console.log('narrative foundation fixtures passed');
