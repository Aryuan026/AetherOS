import { validateHistoryScope } from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import {
  addNarrativeScene,
  confirmNarrativeScene,
  createNarrativeScene,
  markNarrativeScenePlayed,
  normalizeNovelNarrativeState,
} from './state.ts';
import type {
  NarrativeExperienceReceipt,
  NarrativeReceiptMemoryPolicy,
  NarrativeRun,
  NarrativeScene,
  NovelNarrativeState,
} from './types.ts';

export interface AcceptedNarrativeSceneShell {
  kind: 'narrative_scene_shell';
  acceptedByUser: true;
  id: string;
  runId: string;
  title: string;
  location?: string;
  participantIds: readonly string[];
  objective?: string;
  constraints?: readonly string[];
}

export interface NarrativeSceneConfirmationDraft {
  confirmedByUser: true;
  summary: string;
  acceptedFacts: readonly string[];
  rejectedOrEditedFacts?: readonly string[];
  lifeEventIds?: readonly string[];
  memoryPolicy: NarrativeReceiptMemoryPolicy;
}

const assertScope = (scope: HistoryScope): void => {
  const errors = validateHistoryScope(scope);
  if (errors.length) throw new Error(`Narrative scene scope rejected: ${errors.join('; ')}`);
};

const scopedRunFor = (
  narrative: NovelNarrativeState,
  scope: HistoryScope,
  runId: string,
): NarrativeRun => {
  const run = narrative.runs.find(entry => entry.id === runId);
  if (!run) throw new Error(`Narrative run not found: ${runId}`);
  if (run.progressBundleId !== scope.progressBundleId) {
    throw new Error('Narrative run crosses the current progress bundle');
  }
  if (!run.participantCharIds.includes(scope.charId)) {
    throw new Error('Narrative run does not include the scoped character');
  }
  return run;
};

const scopedSceneFor = (
  narrative: NovelNarrativeState,
  scope: HistoryScope,
  sceneId: string,
): { run: NarrativeRun; scene: NarrativeScene } => {
  const scene = narrative.scenes.find(entry => entry.id === sceneId);
  if (!scene) throw new Error(`Narrative scene not found: ${sceneId}`);
  return { run: scopedRunFor(narrative, scope, scene.runId), scene };
};

/** Opens only a shell the player has explicitly accepted; no generation occurs here. */
export const openAcceptedNarrativeScene = (input: {
  scope: HistoryScope;
  narrative: NovelNarrativeState;
  shell: AcceptedNarrativeSceneShell;
  openedAt?: number;
}): { narrative: NovelNarrativeState; scene: NarrativeScene } => {
  assertScope(input.scope);
  if (input.shell.kind !== 'narrative_scene_shell' || input.shell.acceptedByUser !== true) {
    throw new Error('Narrative scene shell requires explicit user acceptance');
  }
  const openedAt = input.openedAt ?? Date.now();
  const narrative = normalizeNovelNarrativeState(input.narrative, openedAt);
  const run = scopedRunFor(narrative, input.scope, input.shell.runId);
  if (run.status !== 'active' || narrative.activeRunId !== run.id) {
    throw new Error('Accepted narrative scene requires the current active run');
  }
  if (!input.shell.participantIds.includes(input.scope.charId)) {
    throw new Error('Accepted narrative scene must include the scoped character');
  }
  const scene = createNarrativeScene({
    id: input.shell.id,
    runId: run.id,
    title: input.shell.title,
    status: 'active',
    location: input.shell.location,
    participantIds: [...input.shell.participantIds],
    objective: input.shell.objective,
    constraints: input.shell.constraints ? [...input.shell.constraints] : [],
  }, openedAt);
  return {
    narrative: addNarrativeScene(narrative, scene, openedAt),
    scene,
  };
};

/** Ends an already played-out active scene without creating truth or a receipt. */
export const finishActiveNarrativeScene = (input: {
  scope: HistoryScope;
  narrative: NovelNarrativeState;
  sceneId: string;
  playedAt?: number;
}): { narrative: NovelNarrativeState; scene: NarrativeScene } => {
  assertScope(input.scope);
  const playedAt = input.playedAt ?? Date.now();
  const narrative = normalizeNovelNarrativeState(input.narrative, playedAt);
  scopedSceneFor(narrative, input.scope, input.sceneId);
  const next = markNarrativeScenePlayed(narrative, input.sceneId, playedAt);
  return {
    narrative: next,
    scene: next.scenes.find(scene => scene.id === input.sceneId)!,
  };
};

/**
 * Creates the canonical receipt only after an explicit player confirmation.
 * It derives route, participants, and playedAt from the scene/run instead of
 * trusting caller-supplied continuity fields.
 */
export const confirmPlayedNarrativeScene = (input: {
  scope: HistoryScope;
  narrative: NovelNarrativeState;
  sceneId: string;
  confirmation: NarrativeSceneConfirmationDraft;
  confirmedAt?: number;
}): { narrative: NovelNarrativeState; receipt: NarrativeExperienceReceipt } => {
  assertScope(input.scope);
  if (input.confirmation.confirmedByUser !== true) {
    throw new Error('Narrative scene receipt requires explicit user confirmation');
  }
  const confirmedAt = input.confirmedAt ?? Date.now();
  const narrative = normalizeNovelNarrativeState(input.narrative, confirmedAt);
  const { run, scene } = scopedSceneFor(narrative, input.scope, input.sceneId);
  if (scene.status !== 'played' && scene.status !== 'confirmed') {
    throw new Error('Narrative scene must be played before player confirmation');
  }
  const playedAt = scene.playedAt;
  if (typeof playedAt !== 'number' || !Number.isFinite(playedAt)) {
    throw new Error('Narrative scene playedAt is required for confirmation');
  }
  const participantCharIds = run.participantCharIds.filter(charId => (
    scene.participantIds.includes(charId)
  ));
  const receiptId = `narrative-receipt:${scene.id}`;
  const receipt: NarrativeExperienceReceipt = {
    id: receiptId,
    progressBundleId: run.progressBundleId,
    runId: run.id,
    sceneId: scene.id,
    lane: run.lane,
    participantCharIds,
    summary: input.confirmation.summary,
    acceptedFacts: [...input.confirmation.acceptedFacts],
    rejectedOrEditedFacts: input.confirmation.rejectedOrEditedFacts
      ? [...input.confirmation.rejectedOrEditedFacts]
      : undefined,
    lifeEventIds: input.confirmation.lifeEventIds
      ? [...input.confirmation.lifeEventIds]
      : undefined,
    memoryPolicy: input.confirmation.memoryPolicy,
    confirmedByUser: true,
    playedAt,
  };
  const next = confirmNarrativeScene(narrative, receipt, confirmedAt);
  const confirmedReceipt = next.receipts.find(entry => entry.id === receiptId);
  if (!confirmedReceipt) throw new Error('Confirmed narrative receipt was not created');
  return { narrative: next, receipt: confirmedReceipt };
};
