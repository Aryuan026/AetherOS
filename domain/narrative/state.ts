import type {
    NarrativeBeat,
    NarrativeBeatKind,
    NarrativeExperienceReceipt,
    NarrativeNpcState,
    NarrativeOpenThread,
    NarrativeReceiptMemoryPolicy,
    NarrativeRouteState,
    NarrativeRun,
    NarrativeRunLane,
    NarrativeRunStatus,
    NarrativeScene,
    NarrativeSceneStatus,
    NovelNarrativeState,
} from './types.ts';

const RUN_LANES: NarrativeRunLane[] = ['mainline', 'if_line'];
const RUN_STATUSES: NarrativeRunStatus[] = ['draft', 'active', 'paused', 'completed', 'abandoned'];
const SCENE_STATUSES: NarrativeSceneStatus[] = ['planned', 'active', 'played', 'confirmed', 'discarded'];
const BEAT_KINDS: NarrativeBeatKind[] = ['narration', 'dialogue', 'choice', 'user_action', 'system_note'];
const RECEIPT_MEMORY_POLICIES: NarrativeReceiptMemoryPolicy[] = [
    'main_vault',
    'relationship_echo',
    'dream_material',
    'excluded_from_main_vault',
];

const isReceiptPolicyCompatible = (
    lane: NarrativeRunLane,
    memoryPolicy: NarrativeReceiptMemoryPolicy,
): boolean => (
    lane === 'if_line'
        ? memoryPolicy === 'dream_material' || memoryPolicy === 'excluded_from_main_vault'
        : memoryPolicy !== 'dream_material'
);

type UnknownRecord = Record<string, unknown>;

export interface CreateNarrativeRunInput {
    id: string;
    progressBundleId: string;
    bookId?: string;
    routeId: string;
    branchId: string;
    lane: NarrativeRunLane;
    status?: 'draft' | 'active';
    participantCharIds: string[];
    directiveIds?: string[];
    routeSummary?: string;
    routeState?: NarrativeRouteState;
    npcStates?: NarrativeNpcState[];
    openThreads?: NarrativeOpenThread[];
}

export interface CreateNarrativeSceneInput {
    id: string;
    runId: string;
    title: string;
    status?: 'planned' | 'active';
    location?: string;
    participantIds: string[];
    objective?: string;
    constraints?: string[];
}

export interface CreateNarrativeBeatInput {
    id: string;
    kind: NarrativeBeatKind;
    authorId?: string;
    content: string;
}

const isRecord = (value: unknown): value is UnknownRecord => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value)
);

const optionalFiniteNumber = (value: unknown): number | undefined => (
    isFiniteNumber(value) ? value : undefined
);

const optionalString = (value: unknown): string | undefined => (
    typeof value === 'string' && value.trim() ? value : undefined
);

const requireString = (value: string, field: string): string => {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`${field} must not be empty`);
    }
    return normalized;
};

const requireTimestamp = (value: number, field: string): number => {
    if (!Number.isFinite(value)) {
        throw new Error(`${field} must be a finite timestamp`);
    }
    return value;
};

const uniqueStrings = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];

    const seen = new Set<string>();
    return values.reduce<string[]>((result, value) => {
        if (typeof value !== 'string') return result;
        const normalized = value.trim();
        if (!normalized || seen.has(normalized)) return result;
        seen.add(normalized);
        result.push(normalized);
        return result;
    }, []);
};

const requireParticipants = (values: string[], field: string): string[] => {
    const participants = uniqueStrings(values);
    if (participants.length === 0) {
        throw new Error(`${field} must include at least one participant`);
    }
    return participants;
};

const cloneRouteState = (value: unknown): NarrativeRouteState => {
    if (!isRecord(value)) return {};

    return Object.entries(value).reduce<NarrativeRouteState>((result, [key, entry]) => {
        if (typeof entry === 'string' || typeof entry === 'boolean' || isFiniteNumber(entry)) {
            result[key] = entry;
        }
        return result;
    }, {});
};

const normalizeNpcState = (value: unknown): NarrativeNpcState | null => {
    if (!isRecord(value)) return null;
    const id = optionalString(value.id);
    const name = optionalString(value.name);
    if (!id || !name || !isFiniteNumber(value.updatedAt)) return null;

    return {
        id,
        name,
        disposition: optionalString(value.disposition),
        location: optionalString(value.location),
        condition: optionalString(value.condition),
        knownFacts: uniqueStrings(value.knownFacts),
        updatedAt: value.updatedAt,
    };
};

const normalizeOpenThread = (value: unknown): NarrativeOpenThread | null => {
    if (!isRecord(value)) return null;
    const id = optionalString(value.id);
    const title = optionalString(value.title);
    const status = value.status;
    if (!id || !title || (status !== 'open' && status !== 'resolved' && status !== 'dormant')) return null;

    return {
        id,
        title,
        status,
        sourceSceneId: optionalString(value.sourceSceneId),
    };
};

const normalizeRun = (value: unknown): NarrativeRun | null => {
    if (!isRecord(value)) return null;

    const id = optionalString(value.id);
    const progressBundleId = optionalString(value.progressBundleId);
    const routeId = optionalString(value.routeId);
    const branchId = optionalString(value.branchId);
    const lane = value.lane;
    const status = value.status;
    if (
        !id
        || !progressBundleId
        || !routeId
        || !branchId
        || !RUN_LANES.includes(lane as NarrativeRunLane)
        || !RUN_STATUSES.includes(status as NarrativeRunStatus)
        || !isFiniteNumber(value.startedAt)
        || !isFiniteNumber(value.updatedAt)
    ) {
        return null;
    }

    return {
        id,
        progressBundleId,
        bookId: optionalString(value.bookId),
        routeId,
        branchId,
        lane: lane as NarrativeRunLane,
        status: status as NarrativeRunStatus,
        participantCharIds: uniqueStrings(value.participantCharIds),
        activeSceneId: optionalString(value.activeSceneId),
        directiveIds: uniqueStrings(value.directiveIds),
        routeSummary: optionalString(value.routeSummary),
        routeState: cloneRouteState(value.routeState),
        npcStates: Array.isArray(value.npcStates)
            ? value.npcStates.map(normalizeNpcState).filter((entry): entry is NarrativeNpcState => entry !== null)
            : [],
        openThreads: Array.isArray(value.openThreads)
            ? value.openThreads.map(normalizeOpenThread).filter((entry): entry is NarrativeOpenThread => entry !== null)
            : [],
        startedAt: value.startedAt,
        updatedAt: value.updatedAt,
        completedAt: optionalFiniteNumber(value.completedAt),
    };
};

const normalizeBeat = (value: unknown): NarrativeBeat | null => {
    if (!isRecord(value)) return null;
    const id = optionalString(value.id);
    const content = optionalString(value.content);
    const kind = value.kind;
    if (!id || !content || !BEAT_KINDS.includes(kind as NarrativeBeatKind) || !isFiniteNumber(value.createdAt)) {
        return null;
    }

    return {
        id,
        kind: kind as NarrativeBeatKind,
        authorId: optionalString(value.authorId),
        content,
        createdAt: value.createdAt,
    };
};

const normalizeScene = (value: unknown): NarrativeScene | null => {
    if (!isRecord(value)) return null;
    const id = optionalString(value.id);
    const runId = optionalString(value.runId);
    const title = optionalString(value.title);
    const status = value.status;
    if (!id || !runId || !title || !SCENE_STATUSES.includes(status as NarrativeSceneStatus)) return null;

    return {
        id,
        runId,
        status: status as NarrativeSceneStatus,
        title,
        location: optionalString(value.location),
        participantIds: uniqueStrings(value.participantIds),
        objective: optionalString(value.objective),
        constraints: uniqueStrings(value.constraints),
        beats: Array.isArray(value.beats)
            ? value.beats.map(normalizeBeat).filter((entry): entry is NarrativeBeat => entry !== null)
            : [],
        openedAt: optionalFiniteNumber(value.openedAt),
        playedAt: optionalFiniteNumber(value.playedAt),
        confirmedAt: optionalFiniteNumber(value.confirmedAt),
    };
};

const normalizeReceipt = (value: unknown): NarrativeExperienceReceipt | null => {
    if (!isRecord(value)) return null;
    const id = optionalString(value.id);
    const progressBundleId = optionalString(value.progressBundleId);
    const runId = optionalString(value.runId);
    const sceneId = optionalString(value.sceneId);
    const summary = optionalString(value.summary);
    const lane = value.lane;
    const memoryPolicy = value.memoryPolicy;
    if (
        !id
        || !progressBundleId
        || !runId
        || !sceneId
        || !summary
        || !RUN_LANES.includes(lane as NarrativeRunLane)
        || !RECEIPT_MEMORY_POLICIES.includes(memoryPolicy as NarrativeReceiptMemoryPolicy)
        || typeof value.confirmedByUser !== 'boolean'
        || !isFiniteNumber(value.playedAt)
    ) {
        return null;
    }

    return {
        id,
        progressBundleId,
        runId,
        sceneId,
        lane: lane as NarrativeRunLane,
        participantCharIds: uniqueStrings(value.participantCharIds),
        summary,
        acceptedFacts: uniqueStrings(value.acceptedFacts),
        rejectedOrEditedFacts: Array.isArray(value.rejectedOrEditedFacts)
            ? uniqueStrings(value.rejectedOrEditedFacts)
            : undefined,
        lifeEventIds: Array.isArray(value.lifeEventIds) ? uniqueStrings(value.lifeEventIds) : undefined,
        memoryPolicy: memoryPolicy as NarrativeReceiptMemoryPolicy,
        confirmedByUser: value.confirmedByUser,
        playedAt: value.playedAt,
        confirmedAt: optionalFiniteNumber(value.confirmedAt),
    };
};

const uniqueById = <T extends { id: string }>(values: T[]): T[] => {
    const seen = new Set<string>();
    return values.filter(value => {
        if (seen.has(value.id)) return false;
        seen.add(value.id);
        return true;
    });
};

const cloneRun = (run: NarrativeRun): NarrativeRun => ({
    ...run,
    participantCharIds: [...run.participantCharIds],
    directiveIds: [...run.directiveIds],
    routeState: { ...run.routeState },
    npcStates: run.npcStates.map(npc => ({ ...npc, knownFacts: [...npc.knownFacts] })),
    openThreads: run.openThreads.map(thread => ({ ...thread })),
});

const cloneNpcState = (npc: NarrativeNpcState): NarrativeNpcState => ({
    ...npc,
    knownFacts: [...npc.knownFacts],
});

const cloneScene = (scene: NarrativeScene): NarrativeScene => ({
    ...scene,
    participantIds: [...scene.participantIds],
    constraints: [...scene.constraints],
    beats: scene.beats.map(beat => ({ ...beat })),
});

const cloneReceipt = (receipt: NarrativeExperienceReceipt): NarrativeExperienceReceipt => ({
    ...receipt,
    participantCharIds: [...receipt.participantCharIds],
    acceptedFacts: [...receipt.acceptedFacts],
    rejectedOrEditedFacts: receipt.rejectedOrEditedFacts ? [...receipt.rejectedOrEditedFacts] : undefined,
    lifeEventIds: receipt.lifeEventIds ? [...receipt.lifeEventIds] : undefined,
});

const cloneState = (state: NovelNarrativeState): NovelNarrativeState => ({
    schemaVersion: 1,
    runs: state.runs.map(cloneRun),
    scenes: state.scenes.map(cloneScene),
    receipts: state.receipts.map(cloneReceipt),
    activeRunId: state.activeRunId,
    updatedAt: state.updatedAt,
});

export const createEmptyNovelNarrativeState = (now: number = Date.now()): NovelNarrativeState => ({
    schemaVersion: 1,
    runs: [],
    scenes: [],
    receipts: [],
    updatedAt: requireTimestamp(now, 'now'),
});

export const normalizeNovelNarrativeState = (
    raw: unknown,
    now: number = Date.now(),
): NovelNarrativeState => {
    if (!isRecord(raw)) return createEmptyNovelNarrativeState(now);

    const normalizedRuns = uniqueById(
        (Array.isArray(raw.runs) ? raw.runs : [])
            .map(normalizeRun)
            .filter((entry): entry is NarrativeRun => entry !== null),
    );
    const requestedActiveRunId = optionalString(raw.activeRunId);
    const activeRunId = requestedActiveRunId && normalizedRuns.some(
        run => run.id === requestedActiveRunId && run.status === 'active',
    )
        ? requestedActiveRunId
        : normalizedRuns.find(run => run.status === 'active')?.id;
    const runs = normalizedRuns.map(run => (
        run.status === 'active' && run.id !== activeRunId
            ? { ...run, status: 'paused' as const, activeSceneId: undefined }
            : run
    ));
    const runsById = new Map(runs.map(run => [run.id, run]));
    const normalizedScenes = uniqueById(
        (Array.isArray(raw.scenes) ? raw.scenes : [])
            .map(normalizeScene)
            .filter((entry): entry is NarrativeScene => entry !== null && runsById.has(entry.runId)),
    );
    const activeSceneIdsByRun = new Map<string, string>();
    const scenes = normalizedScenes.map(scene => {
        if (scene.status !== 'active') return scene;
        const run = runsById.get(scene.runId);
        if (run?.status !== 'active' || activeSceneIdsByRun.has(scene.runId)) {
            return { ...scene, status: 'planned' as const, openedAt: undefined };
        }
        activeSceneIdsByRun.set(scene.runId, scene.id);
        return scene;
    });
    const scenesById = new Map(scenes.map(scene => [scene.id, scene]));
    const receipts = uniqueById(
        (Array.isArray(raw.receipts) ? raw.receipts : [])
            .map(normalizeReceipt)
            .filter((entry): entry is NarrativeExperienceReceipt => {
                if (!entry) return false;
                const run = runsById.get(entry.runId);
                const scene = scenesById.get(entry.sceneId);
                return Boolean(
                    run
                    && scene
                    && scene.runId === run.id
                    && scene.status === 'confirmed'
                    && isFiniteNumber(scene.playedAt)
                    && isFiniteNumber(entry.confirmedAt)
                    && entry.confirmedAt >= scene.playedAt
                    && entry.playedAt === scene.playedAt
                    && entry.progressBundleId === run.progressBundleId
                    && entry.lane === run.lane
                    && entry.confirmedByUser
                    && isReceiptPolicyCompatible(entry.lane, entry.memoryPolicy)
                    && entry.participantCharIds.length > 0
                    && entry.participantCharIds.every(charId => run.participantCharIds.includes(charId))
                );
            }),
    );

    const reconciledRuns = runs.map(run => ({
        ...run,
        activeSceneId: activeSceneIdsByRun.get(run.id),
    }));

    return {
        schemaVersion: 1,
        runs: reconciledRuns,
        scenes,
        receipts,
        activeRunId,
        updatedAt: optionalFiniteNumber(raw.updatedAt) ?? requireTimestamp(now, 'now'),
    };
};

export const createNarrativeRun = (
    input: CreateNarrativeRunInput,
    now: number = Date.now(),
): NarrativeRun => {
    const timestamp = requireTimestamp(now, 'now');
    const lane = input.lane;
    if (!RUN_LANES.includes(lane)) throw new Error(`Unsupported narrative lane: ${lane}`);

    return {
        id: requireString(input.id, 'run.id'),
        progressBundleId: requireString(input.progressBundleId, 'run.progressBundleId'),
        bookId: input.bookId ? requireString(input.bookId, 'run.bookId') : undefined,
        routeId: requireString(input.routeId, 'run.routeId'),
        branchId: requireString(input.branchId, 'run.branchId'),
        lane,
        status: input.status ?? 'draft',
        participantCharIds: requireParticipants(input.participantCharIds, 'run.participantCharIds'),
        directiveIds: uniqueStrings(input.directiveIds ?? []),
        routeSummary: input.routeSummary?.trim() || undefined,
        routeState: cloneRouteState(input.routeState ?? {}),
        npcStates: uniqueById((input.npcStates ?? []).map((npc, index) => {
            const normalized = normalizeNpcState(npc);
            if (!normalized) throw new Error(`run.npcStates[${index}] is invalid`);
            return cloneNpcState(normalized);
        })),
        openThreads: uniqueById((input.openThreads ?? []).map((thread, index) => {
            const normalized = normalizeOpenThread(thread);
            if (!normalized) throw new Error(`run.openThreads[${index}] is invalid`);
            return normalized;
        })),
        startedAt: timestamp,
        updatedAt: timestamp,
    };
};

export const createNarrativeScene = (
    input: CreateNarrativeSceneInput,
    now: number = Date.now(),
): NarrativeScene => {
    const timestamp = requireTimestamp(now, 'now');
    const status = input.status ?? 'planned';
    return {
        id: requireString(input.id, 'scene.id'),
        runId: requireString(input.runId, 'scene.runId'),
        status,
        title: requireString(input.title, 'scene.title'),
        location: input.location?.trim() || undefined,
        participantIds: requireParticipants(input.participantIds, 'scene.participantIds'),
        objective: input.objective?.trim() || undefined,
        constraints: uniqueStrings(input.constraints ?? []),
        beats: [],
        openedAt: status === 'active' ? timestamp : undefined,
    };
};

export const createNarrativeBeat = (
    input: CreateNarrativeBeatInput,
    now: number = Date.now(),
): NarrativeBeat => {
    if (!BEAT_KINDS.includes(input.kind)) throw new Error(`Unsupported narrative beat kind: ${input.kind}`);
    if (!input.content.trim()) throw new Error('beat.content must not be empty');

    return {
        id: requireString(input.id, 'beat.id'),
        kind: input.kind,
        authorId: input.authorId ? requireString(input.authorId, 'beat.authorId') : undefined,
        content: input.content,
        createdAt: requireTimestamp(now, 'now'),
    };
};

export const addNarrativeRun = (
    state: NovelNarrativeState,
    run: NarrativeRun,
    now: number = Date.now(),
): NovelNarrativeState => {
    const next = cloneState(state);
    if (next.runs.some(existing => existing.id === run.id)) {
        throw new Error(`Narrative run already exists: ${run.id}`);
    }
    const existingActiveRun = next.runs.find(existing => existing.status === 'active');
    if (run.status === 'active' && (next.activeRunId || existingActiveRun)) {
        throw new Error(`Another narrative run is already active: ${next.activeRunId ?? existingActiveRun?.id}`);
    }

    next.runs.push(cloneRun(run));
    if (run.status === 'active') next.activeRunId = run.id;
    next.updatedAt = requireTimestamp(now, 'now');
    return next;
};

export const addNarrativeScene = (
    state: NovelNarrativeState,
    scene: NarrativeScene,
    now: number = Date.now(),
): NovelNarrativeState => {
    const next = cloneState(state);
    const runIndex = next.runs.findIndex(run => run.id === scene.runId);
    if (runIndex < 0) throw new Error(`Narrative run not found: ${scene.runId}`);
    if (next.scenes.some(existing => existing.id === scene.id)) {
        throw new Error(`Narrative scene already exists: ${scene.id}`);
    }
    if (scene.status !== 'planned' && scene.status !== 'active') {
        throw new Error(`A new narrative scene cannot start as ${scene.status}`);
    }

    const run = next.runs[runIndex];
    if (scene.status === 'active') {
        if (run.status !== 'active') throw new Error(`Narrative run is not active: ${run.id}`);
        if (run.activeSceneId || next.scenes.some(existing => existing.runId === run.id && existing.status === 'active')) {
            throw new Error(`Narrative run already has an active scene: ${run.id}`);
        }
        run.activeSceneId = scene.id;
        run.updatedAt = requireTimestamp(now, 'now');
    }

    next.scenes.push(cloneScene(scene));
    next.updatedAt = requireTimestamp(now, 'now');
    return next;
};

export const activateNarrativeScene = (
    state: NovelNarrativeState,
    sceneId: string,
    now: number = Date.now(),
): NovelNarrativeState => {
    const next = cloneState(state);
    const scene = next.scenes.find(entry => entry.id === sceneId);
    if (!scene) throw new Error(`Narrative scene not found: ${sceneId}`);
    if (scene.status !== 'planned') throw new Error(`Narrative scene cannot be activated from ${scene.status}`);

    const run = next.runs.find(entry => entry.id === scene.runId);
    if (!run) throw new Error(`Narrative run not found: ${scene.runId}`);
    if (run.status !== 'active') throw new Error(`Narrative run is not active: ${run.id}`);
    if (run.activeSceneId || next.scenes.some(entry => entry.runId === run.id && entry.status === 'active')) {
        throw new Error(`Narrative run already has an active scene: ${run.id}`);
    }

    const timestamp = requireTimestamp(now, 'now');
    scene.status = 'active';
    scene.openedAt = timestamp;
    run.activeSceneId = scene.id;
    run.updatedAt = timestamp;
    next.updatedAt = timestamp;
    return next;
};

export const appendNarrativeBeat = (
    state: NovelNarrativeState,
    sceneId: string,
    beat: NarrativeBeat,
    now: number = Date.now(),
): NovelNarrativeState => {
    const next = cloneState(state);
    const scene = next.scenes.find(entry => entry.id === sceneId);
    if (!scene) throw new Error(`Narrative scene not found: ${sceneId}`);
    if (scene.status !== 'active') throw new Error(`Narrative beats require an active scene, got ${scene.status}`);
    if (next.scenes.some(entry => entry.beats.some(existing => existing.id === beat.id))) {
        throw new Error(`Narrative beat already exists: ${beat.id}`);
    }

    const normalizedBeat = normalizeBeat(beat);
    if (!normalizedBeat) throw new Error('Narrative beat is invalid');
    scene.beats.push(normalizedBeat);
    next.updatedAt = requireTimestamp(now, 'now');
    return next;
};

export const markNarrativeScenePlayed = (
    state: NovelNarrativeState,
    sceneId: string,
    now: number = Date.now(),
): NovelNarrativeState => {
    const next = cloneState(state);
    const scene = next.scenes.find(entry => entry.id === sceneId);
    if (!scene) throw new Error(`Narrative scene not found: ${sceneId}`);
    if (scene.status !== 'active') throw new Error(`Narrative scene cannot be played from ${scene.status}`);
    if (scene.beats.length === 0) throw new Error('Narrative scene must contain at least one played beat');

    const run = next.runs.find(entry => entry.id === scene.runId);
    if (!run) throw new Error(`Narrative run not found: ${scene.runId}`);
    const timestamp = requireTimestamp(now, 'now');
    scene.status = 'played';
    scene.playedAt = timestamp;
    if (run.activeSceneId === scene.id) run.activeSceneId = undefined;
    run.updatedAt = timestamp;
    next.updatedAt = timestamp;
    return next;
};

const receiptIdentity = (receipt: NarrativeExperienceReceipt): string => {
    const {
        id,
        progressBundleId,
        runId,
        sceneId,
        lane,
        participantCharIds,
        summary,
        acceptedFacts,
        rejectedOrEditedFacts,
        lifeEventIds,
        memoryPolicy,
        confirmedByUser,
        playedAt,
    } = receipt;
    return JSON.stringify({
        id,
        progressBundleId,
        runId,
        sceneId,
        lane,
        participantCharIds,
        summary,
        acceptedFacts,
        rejectedOrEditedFacts,
        lifeEventIds,
        memoryPolicy,
        confirmedByUser,
        playedAt,
    });
};

const sameReceipt = (
    left: NarrativeExperienceReceipt,
    right: NarrativeExperienceReceipt,
): boolean => {
    const { confirmedAt: leftConfirmedAt, ...leftIdentity } = left;
    const { confirmedAt: rightConfirmedAt, ...rightIdentity } = right;
    return receiptIdentity(leftIdentity) === receiptIdentity(rightIdentity)
        && (rightConfirmedAt === undefined || leftConfirmedAt === rightConfirmedAt);
};

export const confirmNarrativeScene = (
    state: NovelNarrativeState,
    receipt: NarrativeExperienceReceipt,
    now: number = Date.now(),
): NovelNarrativeState => {
    const next = cloneState(state);
    const receiptId = requireString(receipt.id, 'receipt.id');
    if (receiptId !== receipt.id) throw new Error('receipt.id must not contain surrounding whitespace');
    const existingReceipt = next.receipts.find(entry => entry.id === receipt.id);
    if (existingReceipt) {
        if (sameReceipt(existingReceipt, receipt)) return state;
        throw new Error(`Narrative receipt id collision: ${receipt.id}`);
    }
    if (!receipt.confirmedByUser) throw new Error('Narrative receipt requires explicit user confirmation');
    if (!receipt.summary.trim()) throw new Error('Narrative receipt summary must not be empty');

    const scene = next.scenes.find(entry => entry.id === receipt.sceneId);
    if (!scene) throw new Error(`Narrative scene not found: ${receipt.sceneId}`);
    if (scene.status !== 'played' || !isFiniteNumber(scene.playedAt)) {
        throw new Error(`Narrative scene must be played before confirmation: ${scene.id}`);
    }
    if (next.receipts.some(entry => entry.sceneId === scene.id)) {
        throw new Error(`Narrative scene already has a receipt: ${scene.id}`);
    }

    const run = next.runs.find(entry => entry.id === receipt.runId);
    if (!run || scene.runId !== run.id) throw new Error(`Narrative run does not own scene: ${receipt.runId}`);
    if (receipt.progressBundleId !== run.progressBundleId) {
        throw new Error('Narrative receipt progress bundle does not match its run');
    }
    if (receipt.lane !== run.lane) throw new Error('Narrative receipt lane does not match its run');
    if (receipt.playedAt !== scene.playedAt) throw new Error('Narrative receipt playedAt does not match its scene');
    if (!isReceiptPolicyCompatible(run.lane, receipt.memoryPolicy)) {
        throw new Error(`Narrative receipt policy ${receipt.memoryPolicy} is incompatible with ${run.lane}`);
    }
    const participantCharIds = uniqueStrings(receipt.participantCharIds);
    if (
        participantCharIds.length === 0
        || participantCharIds.some(charId => !run.participantCharIds.includes(charId))
    ) {
        throw new Error('Narrative receipt participants must belong to its run');
    }

    const confirmedAt = requireTimestamp(receipt.confirmedAt ?? now, 'receipt.confirmedAt');
    if (confirmedAt < scene.playedAt) throw new Error('Narrative receipt cannot be confirmed before its scene was played');
    const confirmedReceipt: NarrativeExperienceReceipt = {
        ...cloneReceipt(receipt),
        participantCharIds,
        acceptedFacts: uniqueStrings(receipt.acceptedFacts),
        rejectedOrEditedFacts: receipt.rejectedOrEditedFacts
            ? uniqueStrings(receipt.rejectedOrEditedFacts)
            : undefined,
        lifeEventIds: receipt.lifeEventIds ? uniqueStrings(receipt.lifeEventIds) : undefined,
        confirmedAt,
    };

    scene.status = 'confirmed';
    scene.confirmedAt = confirmedAt;
    run.updatedAt = confirmedAt;
    next.receipts.push(confirmedReceipt);
    next.updatedAt = confirmedAt;
    return next;
};

export const discardNarrativeScene = (
    state: NovelNarrativeState,
    sceneId: string,
    now: number = Date.now(),
): NovelNarrativeState => {
    const next = cloneState(state);
    const scene = next.scenes.find(entry => entry.id === sceneId);
    if (!scene) throw new Error(`Narrative scene not found: ${sceneId}`);
    if (scene.status === 'confirmed' || scene.status === 'discarded') {
        throw new Error(`Narrative scene cannot be discarded from ${scene.status}`);
    }

    const run = next.runs.find(entry => entry.id === scene.runId);
    const timestamp = requireTimestamp(now, 'now');
    scene.status = 'discarded';
    if (run) {
        if (run.activeSceneId === scene.id) run.activeSceneId = undefined;
        run.updatedAt = timestamp;
    }
    next.updatedAt = timestamp;
    return next;
};
