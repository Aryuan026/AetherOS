import { isEditableStoryDirection } from './directives.ts';
import {
    addNarrativeRun,
    createNarrativeRun,
    normalizeNovelNarrativeState,
} from './state.ts';
import type {
    NarrativeDirective,
    NarrativeRun,
    NovelNarrativeState,
} from './types.ts';

export interface ActivateStoryDirectionInput {
    bookId: string;
    progressBundleId: string;
    directiveId: string;
    expectedUpdatedAt: number;
    availableCharIds: string[];
    directives: NarrativeDirective[];
    narrative: unknown;
}

export interface ActivateStoryDirectionResult {
    directives: NarrativeDirective[];
    narrative: NovelNarrativeState;
    directive: NarrativeDirective;
    run: NarrativeRun;
}

const requireText = (value: string, field: string): string => {
    const normalized = value.trim();
    if (!normalized) throw new Error(`${field} must not be empty`);
    return normalized;
};

const requireTimestamp = (value: number, field: string): number => {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite timestamp`);
    return value;
};

const uniqueIds = (values: string[]): string[] => [...new Set(
    values.map(value => value.trim()).filter(Boolean),
)];

const routeIdentityForDirective = (directive: NarrativeDirective) => ({
    runId: `run-${directive.id}`,
    routeId: `route-${directive.id}`,
    branchId: directive.lane === 'if_line' ? 'branch-if-root' : 'branch-main',
});

export const activateStoryDirection = (
    input: ActivateStoryDirectionInput,
    now: number = Date.now(),
): ActivateStoryDirectionResult => {
    const timestamp = requireTimestamp(now, 'now');
    const bookId = requireText(input.bookId, 'bookId');
    const progressBundleId = requireText(input.progressBundleId, 'progressBundleId');
    const directiveId = requireText(input.directiveId, 'directiveId');
    requireTimestamp(input.expectedUpdatedAt, 'expectedUpdatedAt');

    const directiveIndex = input.directives.findIndex(directive => directive.id === directiveId);
    if (directiveIndex < 0) throw new Error(`directive ${directiveId} does not exist`);
    const directive = input.directives[directiveIndex];
    if (directive.progressBundleId !== progressBundleId) {
        throw new Error('directive progress bundle does not match');
    }
    if (!isEditableStoryDirection(directive)) {
        throw new Error('only pending manual StoryDesk directions can be activated');
    }
    if (directive.updatedAt !== input.expectedUpdatedAt) {
        throw new Error('directive changed after this activation review opened');
    }
    if (directive.lane !== 'pending_mainline' && directive.lane !== 'if_line') {
        throw new Error('directive lane cannot create a playable route');
    }
    if (directive.routeId || directive.branchId || directive.playedAt) {
        throw new Error('directive already carries route or played state');
    }
    if (!directive.sourceRefs?.some(ref => (
        ref.surface === 'consult_desk' && ref.id === bookId
    ))) {
        throw new Error('directive does not belong to this StoryDesk book');
    }

    const availableCharIds = new Set(uniqueIds(input.availableCharIds));
    if (
        directive.charIds.length === 0
        || directive.charIds.some(charId => !availableCharIds.has(charId))
    ) {
        throw new Error('directive participants are outside the active persona scope');
    }

    const narrative = normalizeNovelNarrativeState(input.narrative, timestamp);
    if (narrative.runs.some(run => run.directiveIds.includes(directive.id))) {
        throw new Error('directive already belongs to a narrative run');
    }
    const identity = routeIdentityForDirective(directive);
    if (narrative.runs.some(run => (
        run.id === identity.runId
        || (run.routeId === identity.routeId && run.branchId === identity.branchId)
    ))) {
        throw new Error('derived narrative route identity already exists');
    }

    const run = createNarrativeRun({
        id: identity.runId,
        progressBundleId,
        bookId,
        routeId: identity.routeId,
        branchId: identity.branchId,
        lane: directive.lane === 'if_line' ? 'if_line' : 'mainline',
        status: 'draft',
        participantCharIds: directive.charIds,
        directiveIds: [directive.id],
        routeSummary: directive.title,
    }, timestamp);
    const nextNarrative = addNarrativeRun(narrative, run, timestamp);
    const activatedDirective: NarrativeDirective = {
        ...directive,
        status: 'activated',
        routeId: run.routeId,
        branchId: run.branchId,
        updatedAt: timestamp,
    };
    const nextDirectives = input.directives.map((entry, index) => (
        index === directiveIndex ? activatedDirective : entry
    ));

    return {
        directives: nextDirectives,
        narrative: nextNarrative,
        directive: activatedDirective,
        run,
    };
};
