import type { NarrativeDirective, NarrativeLane } from './types.ts';

export type StoryDirectionLane = Extract<NarrativeLane, 'pending_mainline' | 'if_line'>;

export interface StoryDirectionDraft {
    title: string;
    summary: string;
    lane: StoryDirectionLane;
    charIds: string[];
}

export interface CreateStoryDirectionInput extends StoryDirectionDraft {
    id: string;
    bookId: string;
    progressBundleId: string;
}

export interface ReviseStoryDirectionInput extends StoryDirectionDraft {
    progressBundleId: string;
    expectedUpdatedAt: number;
}

const STORY_DIRECTION_LANES: StoryDirectionLane[] = ['pending_mainline', 'if_line'];

const requireText = (value: string, field: string): string => {
    const normalized = value.trim();
    if (!normalized) throw new Error(`${field} must not be empty`);
    return normalized;
};

const requireTimestamp = (value: number, field: string): number => {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite timestamp`);
    return value;
};

const uniqueParticipants = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach(value => {
        const normalized = value.trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    if (result.length === 0) {
        throw new Error('charIds must include at least one participant');
    }
    return result;
};

const normalizeDraft = (draft: StoryDirectionDraft): StoryDirectionDraft => {
    if (!STORY_DIRECTION_LANES.includes(draft.lane)) {
        throw new Error('lane must be pending_mainline or if_line');
    }
    return {
        title: requireText(draft.title, 'title'),
        summary: requireText(draft.summary, 'summary'),
        lane: draft.lane,
        charIds: uniqueParticipants(draft.charIds),
    };
};

const memoryPolicyForLane = (lane: StoryDirectionLane): NarrativeDirective['memoryPolicy'] => (
    lane === 'if_line' ? 'dream_material' : 'manual_promotion'
);

export const isEditableStoryDirection = (directive: NarrativeDirective): boolean => (
    directive.status === 'pending'
    && directive.sourceSurface === 'consult_desk'
    && directive.activationMode === 'manual'
);

export const createStoryDirection = (
    input: CreateStoryDirectionInput,
    now: number,
): NarrativeDirective => {
    const id = requireText(input.id, 'id');
    const bookId = requireText(input.bookId, 'bookId');
    const progressBundleId = requireText(input.progressBundleId, 'progressBundleId');
    const timestamp = requireTimestamp(now, 'now');
    const draft = normalizeDraft(input);

    return {
        id,
        title: draft.title,
        summary: draft.summary,
        lane: draft.lane,
        status: 'pending',
        sourceSurface: 'consult_desk',
        targetSurface: 'novel',
        charIds: draft.charIds,
        constraints: [
            '方向未激活前不得视为已经发生',
            '不得绕过游玩与用户确认写入角色记忆',
        ],
        memoryPolicy: memoryPolicyForLane(draft.lane),
        sourceRefs: [{ surface: 'consult_desk', id: bookId, label: '剧情台手工方向' }],
        progressBundleId,
        activationMode: 'manual',
        createdAt: timestamp,
        updatedAt: timestamp,
    };
};

export const appendStoryDirection = (
    directives: NarrativeDirective[],
    directive: NarrativeDirective,
): NarrativeDirective[] => {
    if (!directive.progressBundleId?.trim()) {
        throw new Error('progressBundleId must not be empty');
    }
    if (!isEditableStoryDirection(directive)) {
        throw new Error('only pending manual StoryDesk directions can be appended');
    }
    if (directives.some(existing => existing.id === directive.id)) {
        throw new Error(`directive ${directive.id} already exists`);
    }
    return [...directives, directive];
};

const findEditableDirection = (
    directives: NarrativeDirective[],
    directiveId: string,
    progressBundleId: string,
    expectedUpdatedAt: number,
): { directive: NarrativeDirective; index: number } => {
    const normalizedId = requireText(directiveId, 'directiveId');
    const normalizedBundleId = requireText(progressBundleId, 'progressBundleId');
    requireTimestamp(expectedUpdatedAt, 'expectedUpdatedAt');
    const index = directives.findIndex(directive => directive.id === normalizedId);
    if (index < 0) throw new Error(`directive ${normalizedId} does not exist`);
    const directive = directives[index];
    if (directive.progressBundleId !== normalizedBundleId) {
        throw new Error('directive progress bundle does not match');
    }
    if (!isEditableStoryDirection(directive)) {
        throw new Error('only pending manual StoryDesk directions can be changed');
    }
    if (directive.updatedAt !== expectedUpdatedAt) {
        throw new Error('directive changed after this review opened');
    }
    return { directive, index };
};

export const reviseStoryDirection = (
    directives: NarrativeDirective[],
    directiveId: string,
    input: ReviseStoryDirectionInput,
    now: number,
): NarrativeDirective[] => {
    const timestamp = requireTimestamp(now, 'now');
    const draft = normalizeDraft(input);
    const { directive, index } = findEditableDirection(
        directives,
        directiveId,
        input.progressBundleId,
        input.expectedUpdatedAt,
    );
    const revised: NarrativeDirective = {
        ...directive,
        title: draft.title,
        summary: draft.summary,
        lane: draft.lane,
        charIds: draft.charIds,
        memoryPolicy: memoryPolicyForLane(draft.lane),
        updatedAt: timestamp,
    };
    return directives.map((entry, entryIndex) => entryIndex === index ? revised : entry);
};

export const discardStoryDirection = (
    directives: NarrativeDirective[],
    directiveId: string,
    progressBundleId: string,
    expectedUpdatedAt: number,
    now: number,
): NarrativeDirective[] => {
    const timestamp = requireTimestamp(now, 'now');
    const { directive, index } = findEditableDirection(
        directives,
        directiveId,
        progressBundleId,
        expectedUpdatedAt,
    );
    const discarded: NarrativeDirective = {
        ...directive,
        status: 'discarded',
        updatedAt: timestamp,
    };
    return directives.map((entry, entryIndex) => entryIndex === index ? discarded : entry);
};
