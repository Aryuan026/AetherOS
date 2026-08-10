import { validateHistoryScope } from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import { normalizeNovelNarrativeState } from './state.ts';
import { finishActiveNarrativeScene } from './sceneLifecycle.ts';
import type { NarrativeBeat, NovelNarrativeState } from './types.ts';

export interface NarrativeStorySegmentSource {
  id: string;
  type: 'discussion' | 'story' | 'analysis';
  authorId: string;
  content: string;
  timestamp: number;
  focus?: string;
  meta?: {
    narrativeSceneId?: string;
  };
}

const beatIdFor = (sceneId: string, segmentId: string): string => (
  `narrative-beat:${sceneId}:${segmentId}`
);

/**
 * Rebuilds one active scene's beats from the story segments explicitly tagged
 * to that scene. The adapter intentionally ignores analysis, comments and
 * chapter summaries. Played/confirmed scenes are immutable here.
 */
export const syncActiveNarrativeSceneBeats = (input: {
  scope: HistoryScope;
  narrative: NovelNarrativeState;
  sceneId: string;
  segments: readonly NarrativeStorySegmentSource[];
  updatedAt?: number;
}): { narrative: NovelNarrativeState; beats: NarrativeBeat[] } => {
  const scopeErrors = validateHistoryScope(input.scope);
  if (scopeErrors.length) {
    throw new Error(`Narrative beat scope rejected: ${scopeErrors.join('; ')}`);
  }
  const updatedAt = input.updatedAt ?? Date.now();
  if (!Number.isFinite(updatedAt)) throw new Error('Narrative beat updatedAt must be finite');

  const narrative = normalizeNovelNarrativeState(input.narrative, updatedAt);
  const scene = narrative.scenes.find(entry => entry.id === input.sceneId);
  if (!scene) throw new Error(`Narrative scene not found: ${input.sceneId}`);
  if (scene.status !== 'active') {
    throw new Error(`Narrative beats can only sync into an active scene, got ${scene.status}`);
  }
  const run = narrative.runs.find(entry => entry.id === scene.runId);
  if (!run) throw new Error(`Narrative run not found: ${scene.runId}`);
  if (
    run.progressBundleId !== input.scope.progressBundleId
    || !run.participantCharIds.includes(input.scope.charId)
  ) {
    throw new Error('Narrative beat sync crosses the current relationship scope');
  }

  const beats = input.segments
    .filter(segment => (
      segment.type === 'story'
      && segment.focus !== 'chapter_summary'
      && segment.meta?.narrativeSceneId === scene.id
      && segment.content.trim().length > 0
    ))
    .map<NarrativeBeat>(segment => ({
      id: beatIdFor(scene.id, segment.id),
      kind: segment.authorId === 'user' ? 'user_action' : 'narration',
      authorId: segment.authorId,
      content: segment.content.trim(),
      createdAt: Number.isFinite(segment.timestamp) ? segment.timestamp : updatedAt,
    }));

  if (new Set(beats.map(beat => beat.id)).size !== beats.length) {
    throw new Error('Narrative story segments contain duplicate ids');
  }
  scene.beats = beats;
  narrative.updatedAt = updatedAt;
  return { narrative, beats };
};

/**
 * The only manuscript -> canonical scene commit point. Writers merely tag
 * paragraphs while the scene is active; ending the scene rebuilds beats from
 * the latest persisted manuscript and marks the same snapshot as played.
 */
export const finishNarrativeSceneFromSegments = (input: {
  scope: HistoryScope;
  narrative: NovelNarrativeState;
  sceneId: string;
  segments: readonly NarrativeStorySegmentSource[];
  playedAt?: number;
}): { narrative: NovelNarrativeState; beats: NarrativeBeat[] } => {
  const playedAt = input.playedAt ?? Date.now();
  const synced = syncActiveNarrativeSceneBeats({
    scope: input.scope,
    narrative: input.narrative,
    sceneId: input.sceneId,
    segments: input.segments,
    updatedAt: playedAt,
  });
  if (synced.beats.length === 0) {
    throw new Error('这一幕还没有正文，先去手稿写一点再结束');
  }
  const played = finishActiveNarrativeScene({
    scope: input.scope,
    narrative: synced.narrative,
    sceneId: input.sceneId,
    playedAt,
  });
  return { narrative: played.narrative, beats: synced.beats };
};
