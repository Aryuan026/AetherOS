import { normalizeNovelNarrativeState } from './state.ts';
import type {
    NarrativeDirective,
    NarrativeExperienceReceipt,
    NarrativeRun,
    NarrativeScene,
    NovelNarrativeState,
} from './types.ts';

export interface NarrativeInspectionSource {
    directives?: NarrativeDirective[];
    narrative?: unknown;
    createdAt?: number;
    lastActiveAt?: number;
}

export interface NarrativeInspectionSnapshot {
    progressBundleId?: string;
    state: NovelNarrativeState;
    directives: NarrativeDirective[];
    unscopedDirectives: NarrativeDirective[];
    otherBundleDirectiveCount: number;
    runs: NarrativeRun[];
    scenes: NarrativeScene[];
    receipts: NarrativeExperienceReceipt[];
    activeRunId?: string;
    otherBundleRunCount: number;
}

const isReadableDirective = (value: unknown): value is NarrativeDirective => (
    typeof value === 'object'
    && value !== null
    && typeof (value as NarrativeDirective).id === 'string'
    && typeof (value as NarrativeDirective).title === 'string'
    && typeof (value as NarrativeDirective).summary === 'string'
);

export const inspectNovelNarrative = (
    source: NarrativeInspectionSource,
    progressBundleId?: string,
): NarrativeInspectionSnapshot => {
    const normalizedBundleId = progressBundleId?.trim() || undefined;
    const fallbackTimestamp = source.lastActiveAt ?? source.createdAt ?? 0;
    const state = normalizeNovelNarrativeState(source.narrative, fallbackTimestamp);
    const allDirectives = Array.isArray(source.directives)
        ? source.directives.filter(isReadableDirective)
        : [];
    const unscopedDirectives = allDirectives.filter(directive => !directive.progressBundleId);
    const directives = normalizedBundleId
        ? allDirectives.filter(directive => directive.progressBundleId === normalizedBundleId)
        : [];
    const runs = normalizedBundleId
        ? state.runs.filter(run => run.progressBundleId === normalizedBundleId)
        : [];
    const runIds = new Set(runs.map(run => run.id));
    const scenes = state.scenes.filter(scene => runIds.has(scene.runId));
    const sceneIds = new Set(scenes.map(scene => scene.id));
    const receipts = state.receipts.filter(receipt => (
        receipt.progressBundleId === normalizedBundleId
        && runIds.has(receipt.runId)
        && sceneIds.has(receipt.sceneId)
    ));
    const activeRunId = state.activeRunId && runIds.has(state.activeRunId)
        ? state.activeRunId
        : runs.find(run => run.status === 'active')?.id;

    return {
        progressBundleId: normalizedBundleId,
        state,
        directives,
        unscopedDirectives,
        otherBundleDirectiveCount: allDirectives.length - directives.length - unscopedDirectives.length,
        runs,
        scenes,
        receipts,
        activeRunId,
        otherBundleRunCount: state.runs.length - runs.length,
    };
};
