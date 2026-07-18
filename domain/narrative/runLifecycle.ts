import { normalizeNovelNarrativeState } from './state.ts';
import type { NarrativeRun, NovelNarrativeState } from './types.ts';

export interface StartDraftNarrativeRunInput {
    bookId: string;
    progressBundleId: string;
    runId: string;
    expectedUpdatedAt: number;
    narrative: unknown;
}

export interface StartDraftNarrativeRunResult {
    narrative: NovelNarrativeState;
    run: NarrativeRun;
}

const requireString = (value: string, field: string): string => {
    const normalized = value.trim();
    if (!normalized) throw new Error(`${field} must not be empty`);
    return normalized;
};

const requireTimestamp = (value: number, field: string): number => {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite timestamp`);
    return value;
};

/**
 * Selects one reviewed draft as the book's active run without advancing play.
 *
 * This transaction intentionally creates no scene or receipt and has no
 * connection to AI, memory, imported history, or Character Life state.
 */
export const startDraftNarrativeRun = (
    input: StartDraftNarrativeRunInput,
    now: number = Date.now(),
): StartDraftNarrativeRunResult => {
    const timestamp = requireTimestamp(now, 'now');
    const bookId = requireString(input.bookId, 'bookId');
    const progressBundleId = requireString(input.progressBundleId, 'progressBundleId');
    const runId = requireString(input.runId, 'runId');
    const expectedUpdatedAt = requireTimestamp(input.expectedUpdatedAt, 'expectedUpdatedAt');
    const narrative = normalizeNovelNarrativeState(input.narrative, timestamp);
    const run = narrative.runs.find(entry => entry.id === runId);

    if (!run) throw new Error(`Narrative run not found: ${runId}`);
    if (run.bookId !== bookId) throw new Error('Narrative run does not belong to this StoryDesk book');
    if (run.progressBundleId !== progressBundleId) {
        throw new Error('Narrative run does not belong to the active progress bundle');
    }
    if (run.status !== 'draft') {
        throw new Error(`Only a draft narrative run can be started, got ${run.status}`);
    }
    if (run.updatedAt !== expectedUpdatedAt) {
        throw new Error('Narrative run changed after this start review');
    }

    const existingActiveRun = narrative.runs.find(entry => entry.status === 'active');
    if (narrative.activeRunId || existingActiveRun) {
        throw new Error(`Another narrative run is already active: ${narrative.activeRunId ?? existingActiveRun?.id}`);
    }

    const runScenes = narrative.scenes.filter(scene => scene.runId === run.id);
    const runReceipts = narrative.receipts.filter(receipt => receipt.runId === run.id);
    if (run.activeSceneId || runScenes.length > 0 || runReceipts.length > 0) {
        throw new Error('A draft run must be empty before it can be started');
    }

    run.status = 'active';
    run.updatedAt = timestamp;
    narrative.activeRunId = run.id;
    narrative.updatedAt = timestamp;

    return { narrative, run };
};
