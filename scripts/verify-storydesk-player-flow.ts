import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  addNarrativeRun,
  createEmptyNovelNarrativeState,
  createNarrativeRun,
} from '../domain/narrative/state.ts';
import { openAcceptedNarrativeScene } from '../domain/narrative/sceneLifecycle.ts';
import {
  finishNarrativeSceneFromSegments,
  syncActiveNarrativeSceneBeats,
} from '../domain/narrative/sceneBeatSync.ts';

const T0 = 1_700_200_000_000;
const scope: HistoryScope = {
  progressBundleId: 'bundle-storydesk',
  personaMaskId: 'mask-storydesk',
  charId: 'char-storydesk',
};
const run = createNarrativeRun({
  id: 'run-storydesk',
  progressBundleId: scope.progressBundleId,
  bookId: 'novel-storydesk',
  routeId: 'main-route',
  branchId: 'main-branch',
  lane: 'mainline',
  status: 'active',
  participantCharIds: [scope.charId],
}, T0);
const withRun = addNarrativeRun(createEmptyNovelNarrativeState(T0), run, T0 + 1);
const opened = openAcceptedNarrativeScene({
  scope,
  narrative: withRun,
  shell: {
    kind: 'narrative_scene_shell',
    acceptedByUser: true,
    id: 'scene-storydesk',
    runId: run.id,
    title: '雨停后的站台',
    location: '旧车站',
    participantIds: [scope.charId],
    objective: '把未说完的话说完',
    constraints: ['秘密身份仍不公开'],
  },
  openedAt: T0 + 2,
});

const manuscript = [
  { id: 'user-story', type: 'story' as const, authorId: 'user', content: '我在站台停下。', timestamp: T0 + 3, meta: { narrativeSceneId: opened.scene.id } },
  { id: 'analysis', type: 'analysis' as const, authorId: scope.charId, content: '这只是分析。', timestamp: T0 + 4, meta: { narrativeSceneId: opened.scene.id } },
  { id: 'chapter-summary', type: 'analysis' as const, authorId: 'system', content: '章节总结。', focus: 'chapter_summary', timestamp: T0 + 5, meta: { narrativeSceneId: opened.scene.id } },
  { id: 'other-scene', type: 'story' as const, authorId: scope.charId, content: '别幕正文。', timestamp: T0 + 6, meta: { narrativeSceneId: 'scene-other' } },
  { id: 'char-story', type: 'story' as const, authorId: scope.charId, content: '他把伞收了起来。', timestamp: T0 + 7, meta: { narrativeSceneId: opened.scene.id } },
];

const firstSync = syncActiveNarrativeSceneBeats({
  scope,
  narrative: opened.narrative,
  sceneId: opened.scene.id,
  segments: manuscript,
  updatedAt: T0 + 8,
});
assert.deepEqual(firstSync.beats.map(beat => beat.content), ['我在站台停下。', '他把伞收了起来。']);
assert.deepEqual(firstSync.beats.map(beat => beat.kind), ['user_action', 'narration']);

const editedAndDeleted = syncActiveNarrativeSceneBeats({
  scope,
  narrative: opened.narrative,
  sceneId: opened.scene.id,
  segments: [{ ...manuscript[1] }, { ...manuscript[4], content: '他没有撑伞，只站在雨里。' }],
  updatedAt: T0 + 9,
});
assert.deepEqual(editedAndDeleted.beats.map(beat => beat.content), ['他没有撑伞，只站在雨里。']);

const finished = finishNarrativeSceneFromSegments({
  scope,
  narrative: opened.narrative,
  sceneId: opened.scene.id,
  segments: manuscript,
  playedAt: T0 + 10,
});
assert.equal(finished.narrative.scenes[0].status, 'played');
assert.equal(finished.beats.length, 2);
assert.equal(finished.narrative.receipts.length, 0, 'ending must still require a separate player confirmation');
assert.throws(() => finishNarrativeSceneFromSegments({
  scope,
  narrative: opened.narrative,
  sceneId: opened.scene.id,
  segments: [],
}), /还没有正文/);

const workspaceSource = readFileSync(new URL('../components/novel/NovelWorkspace.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../components/novel/StoryDeskInspector.tsx', import.meta.url), 'utf8');
const writerSource = readFileSync(new URL('../components/novel/NovelWriter.tsx', import.meta.url), 'utf8');
const sceneReviewSource = readFileSync(new URL('../components/novel/StorySceneReviewScreen.tsx', import.meta.url), 'utf8');
const receiptReviewSource = readFileSync(new URL('../components/novel/StoryExperienceReviewScreen.tsx', import.meta.url), 'utf8');
const novelAppSource = readFileSync(new URL('../apps/NovelApp.tsx', import.meta.url), 'utf8');

assert.match(workspaceSource, /generateNarrativeSceneShellProposal/);
assert.match(workspaceSource, /generateNarrativeSceneReceiptProposal/);
assert.match(workspaceSource, /generateAndStoreNarrativeWorldGrowthProposals/);
assert.match(workspaceSource, /finishNarrativeSceneFromSegments/);
assert.match(workspaceSource, /openApp\(AppID\.Worldbook\)/);
assert.match(workspaceSource, /handledGrowthReceiptIds/);
assert.match(workspaceSource, /\['accepted', 'ignored'\]\.includes\(candidate\.status\)/);
assert.match(workspaceSource, /handledGrowthReceiptIds\.has\(receipt\.id\)/);
assert.match(inspectorSource, /去手稿继续写/);
assert.match(inspectorSource, /结束这一幕/);
assert.match(inspectorSource, /这一幕的世界变化已处理/);
assert.match(inspectorSource, /growthCount > 0/);
assert.match(inspectorSource, /growthCount === 0 && growthHandled/);
assert.match(inspectorSource, /growthCount === 0 && !growthHandled/);
assert.doesNotMatch(inspectorSource, /MEMORY_POLICY_LABELS|\{run\.routeId\} \/ \{run\.branchId\}|剧情台|进度包/);
assert.match(sceneReviewSource, /requiredCharacterId/);
assert.match(sceneReviewSource, /这一幕要尊重的条件/);
assert.match(receiptReviewSource, /暂不算作事实/);
assert.match(writerSource, /narrativeSceneId: activeNarrativeScene\?\.id/);
assert.match(writerSource, /章节已归档在手稿中/);
assert.doesNotMatch(writerSource.slice(writerSource.indexOf('const confirmChapterSummary'), writerSource.indexOf('return (')), /updateCharacter|memories/);
assert.doesNotMatch(novelAppSource, /导入世界书设定|导入世界书/);
assert.match(novelAppSource, /本书补充设定/);
assert.match(novelAppSource, /await addNovel\(newBook\)/);
assert.match(novelAppSource, /await deleteNovel\(id\)/);

console.log('StoryDesk player scene flow: OK');
