import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import {
  addNarrativeRun,
  appendNarrativeBeat,
  createEmptyNovelNarrativeState,
  createNarrativeBeat,
  createNarrativeRun,
} from '../domain/narrative/state.ts';
import {
  confirmPlayedNarrativeScene,
  finishActiveNarrativeScene,
  openAcceptedNarrativeScene,
} from '../domain/narrative/sceneLifecycle.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import type { NovelBook } from '../types.ts';
import { DB } from '../utils/db.ts';
import { createNovelUpdateCoordinator } from '../utils/novelPersistence.ts';

const T0 = 1_700_000_100_000;

const novel = (patch: Partial<NovelBook> = {}): NovelBook => ({
  id: 'novel-1',
  title: '潮汐手稿',
  summary: '',
  coverStyle: 'minimal',
  worldSetting: '',
  collaboratorIds: ['char-a'],
  protagonists: [],
  segments: [],
  createdAt: T0,
  lastActiveAt: T0,
  ...patch,
});

// Consecutive patches are serialized and each reads the last durable snapshot.
let snapshot: NovelBook[] = [novel()];
const persisted: NovelBook[] = [];
let clock = T0 + 1;
const coordinator = createNovelUpdateCoordinator({
  readSnapshot: () => snapshot,
  persist: async next => {
    if (next.title === 'FAIL') throw new Error('disk full');
    persisted.push(structuredClone(next));
  },
  commitSnapshot: next => { snapshot = next; },
  now: () => clock++,
});
const firstPatch = coordinator.update('novel-1', { summary: '第一笔' });
const secondPatch = coordinator.update('novel-1', { worldSetting: '第二笔' });
await Promise.all([firstPatch, secondPatch]);
assert.equal(snapshot[0].summary, '第一笔');
assert.equal(snapshot[0].worldSetting, '第二笔');
assert.equal(persisted[1].summary, '第一笔', 'the second write must retain the first queued patch');

const beforeFailure = structuredClone(snapshot);
await assert.rejects(coordinator.update('novel-1', { title: 'FAIL' }), /disk full/);
assert.deepEqual(snapshot, beforeFailure, 'a rejected durable write must not publish React state');
await coordinator.update('novel-1', { subtitle: '失败后仍可继续' });
assert.equal(snapshot[0].subtitle, '失败后仍可继续', 'a failed write must not poison later updates');
await assert.rejects(coordinator.update('missing', { title: '不存在' }), /not found/);

let releasePersist: (() => void) | undefined;
const delayedSnapshot: NovelBook[] = [novel({ id: 'delayed' })];
let delayedState = delayedSnapshot;
const delayedCoordinator = createNovelUpdateCoordinator({
  readSnapshot: () => delayedState,
  persist: () => new Promise<void>(resolve => { releasePersist = resolve; }),
  commitSnapshot: next => { delayedState = next; },
  now: () => T0 + 20,
});
const delayedUpdate = delayedCoordinator.update('delayed', { summary: '等落库后才可见' });
await Promise.resolve();
assert.equal(delayedState[0].summary, '', 'state must not move before durability completes');
releasePersist?.();
await delayedUpdate;
assert.equal(delayedState[0].summary, '等落库后才可见');

// IndexedDB save/delete promises resolve only after the transaction has settled.
await DB.deleteDB();
await DB.saveNovel(novel());
assert.equal((await DB.getAllNovels())[0]?.id, 'novel-1');
await DB.deleteNovel('novel-1');
assert.deepEqual(await DB.getAllNovels(), []);

const dbSource = readFileSync(new URL('../utils/db.ts', import.meta.url), 'utf8');
for (const handler of ['transaction.oncomplete', 'transaction.onerror', 'transaction.onabort']) {
  assert.match(dbSource.slice(dbSource.indexOf('saveNovel:'), dbSource.indexOf('// --- BANK')), new RegExp(handler.replace('.', '\\.')));
}

// One scene: accepted shell -> active -> played -> explicit player receipt.
const scope: HistoryScope = {
  progressBundleId: 'bundle-1',
  personaMaskId: 'persona-1',
  charId: 'char-a',
};
const activeRun = createNarrativeRun({
  id: 'run-1',
  progressBundleId: scope.progressBundleId,
  bookId: 'novel-1',
  routeId: 'route-main',
  branchId: 'branch-main',
  lane: 'mainline',
  status: 'active',
  participantCharIds: [scope.charId],
}, T0 + 30);
const emptyNarrative = createEmptyNovelNarrativeState(T0 + 31);
const runNarrative = addNarrativeRun(emptyNarrative, activeRun, T0 + 32);
const opened = openAcceptedNarrativeScene({
  scope,
  narrative: runNarrative,
  shell: {
    kind: 'narrative_scene_shell',
    acceptedByUser: true,
    id: 'scene-1',
    runId: activeRun.id,
    title: '雨停之前',
    participantIds: ['user', scope.charId],
    objective: '把没有说完的话说完',
  },
  openedAt: T0 + 33,
});
assert.equal(opened.scene.status, 'active');
assert.equal(runNarrative.scenes.length, 0, 'opening a scene must not mutate its input');
assert.throws(() => openAcceptedNarrativeScene({
  scope,
  narrative: runNarrative,
  shell: { ...opened.scene, kind: 'chapter_summary', acceptedByUser: true } as never,
}), /explicit user acceptance/);

const playedNarrative = appendNarrativeBeat(opened.narrative, opened.scene.id, createNarrativeBeat({
  id: 'beat-1',
  kind: 'dialogue',
  authorId: scope.charId,
  content: '雨声慢慢轻下去。',
}, T0 + 34), T0 + 35);
const finished = finishActiveNarrativeScene({
  scope,
  narrative: playedNarrative,
  sceneId: opened.scene.id,
  playedAt: T0 + 36,
});
assert.equal(finished.scene.status, 'played');
assert.equal(finished.narrative.receipts.length, 0, 'ending a scene must not invent a receipt');
assert.throws(() => confirmPlayedNarrativeScene({
  scope,
  narrative: finished.narrative,
  sceneId: opened.scene.id,
  confirmation: {
    confirmedByUser: false,
    summary: '不应被确认',
    acceptedFacts: [],
    memoryPolicy: 'relationship_echo',
  } as never,
}), /explicit user confirmation/);

const confirmed = confirmPlayedNarrativeScene({
  scope,
  narrative: finished.narrative,
  sceneId: opened.scene.id,
  confirmation: {
    confirmedByUser: true,
    summary: '两人在雨停前说完了那句话。',
    acceptedFacts: ['两人在雨停前见过面'],
    memoryPolicy: 'relationship_echo',
  },
  confirmedAt: T0 + 37,
});
assert.equal(confirmed.receipt.id, 'narrative-receipt:scene-1');
assert.equal(confirmed.receipt.progressBundleId, scope.progressBundleId);
assert.equal(confirmed.receipt.playedAt, T0 + 36);
assert.deepEqual(confirmed.receipt.participantCharIds, [scope.charId]);
assert.equal(confirmed.narrative.scenes[0].status, 'confirmed');
assert.equal(finished.narrative.scenes[0].status, 'played', 'confirmation must not mutate its input');
const repeated = confirmPlayedNarrativeScene({
  scope,
  narrative: confirmed.narrative,
  sceneId: opened.scene.id,
  confirmation: {
    confirmedByUser: true,
    summary: '两人在雨停前说完了那句话。',
    acceptedFacts: ['两人在雨停前见过面'],
    memoryPolicy: 'relationship_echo',
  },
  confirmedAt: T0 + 38,
});
assert.deepEqual(repeated.narrative, confirmed.narrative, 'identical confirmation retries are idempotent');

const lifecycleSource = readFileSync(new URL('../domain/narrative/sceneLifecycle.ts', import.meta.url), 'utf8');
assert.doesNotMatch(lifecycleSource, /chapter_summary|worldbook|memoryCore|useChatAI|callModel/i);

console.log('Novel durability and explicit narrative scene lifecycle: OK');
