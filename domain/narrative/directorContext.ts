import type {
    HistoricalAuthority,
    HistoricalDerivedBase,
    HistoricalNarrativeProjection,
    HistoricalResultStatus,
} from '../historyImport/analysis/types.ts';
import { HISTORY_ANALYSIS_AUTHORITY_ORDER } from '../historyImport/analysis/contract.ts';
import { normalizeNovelNarrativeState } from './state.ts';
import type {
    NarrativeExperienceReceipt,
    NarrativeRun,
    NarrativeScene,
} from './types.ts';

export const NARRATIVE_DIRECTOR_CONTEXT_SCHEMA_VERSION = 1 as const;

/** Ordered from weakest to strongest. Status remains a separate visibility axis. */
export const NARRATIVE_DIRECTOR_AUTHORITY_ORDER = [
    'reconstructed',
    'soft_historical',
    'user_confirmed_history',
    'active_confirmed_truth',
] as const;

export type NarrativeDirectorAuthority = typeof NARRATIVE_DIRECTOR_AUTHORITY_ORDER[number];

export type NarrativeDirectorReadOnly<T> =
    T extends (...args: never[]) => unknown
        ? T
        : T extends readonly (infer Entry)[]
            ? readonly NarrativeDirectorReadOnly<Entry>[]
            : T extends object
                ? { readonly [Key in keyof T]: NarrativeDirectorReadOnly<T[Key]> }
                : T;

/** Preserves the history domain's ordering inside the historical tiers. */
export const NARRATIVE_DIRECTOR_HISTORICAL_AUTHORITY_ORDER = HISTORY_ANALYSIS_AUTHORITY_ORDER;

export const NARRATIVE_DIRECTOR_READ_ONLY_POLICY = {
    modelCall: false,
    runCreate: false,
    runModify: false,
    sceneCreate: false,
    sceneModify: false,
    receiptCreate: false,
    memoryWrite: false,
    characterLifeWrite: false,
    currentStateWrite: false,
} as const;

export interface NarrativeDirectorScope {
    progressBundleId: string;
    personaMaskId: string;
    charId: string;
}

export interface NarrativeDirectorConfirmedExperience {
    run: NarrativeRun;
    scene: NarrativeScene;
    receipt: NarrativeExperienceReceipt;
}

export interface NarrativeDirectorCurrentTruth {
    scope: NarrativeDirectorScope;
    activeRun: NarrativeRun | null;
    activeScene: NarrativeScene | null;
    confirmedExperiences: NarrativeDirectorConfirmedExperience[];
}

export interface NarrativeDirectorHistoricalContext {
    readonly rootAuthority: NarrativeDirectorAuthority;
    readonly projection: NarrativeDirectorReadOnly<HistoricalNarrativeProjection>;
}

export interface NarrativeDirectorContext {
    readonly schemaVersion: typeof NARRATIVE_DIRECTOR_CONTEXT_SCHEMA_VERSION;
    readonly scope: NarrativeDirectorReadOnly<NarrativeDirectorScope>;
    readonly authorityOrder: readonly NarrativeDirectorAuthority[];
    readonly historicalAuthorityOrder: readonly HistoricalAuthority[];
    readonly currentTruthAuthority: 'active_confirmed_truth';
    readonly currentTruth: NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth>;
    readonly historical: NarrativeDirectorHistoricalContext | null;
    readonly readOnlyPolicy: NarrativeDirectorReadOnly<typeof NARRATIVE_DIRECTOR_READ_ONLY_POLICY>;
}

export interface NarrativeDirectorHistoricalProjectionProvider {
    readHistoricalNarrativeProjection(input: {
        scope: NarrativeDirectorScope;
    }): Promise<HistoricalNarrativeProjection | null>;
}

export interface CreateNarrativeDirectorContextInput {
    scope: NarrativeDirectorScope;
    currentTruth: NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth>;
    historicalProjection?: HistoricalNarrativeProjection | null;
}

export interface LoadNarrativeDirectorContextInput {
    scope: NarrativeDirectorScope;
    currentTruth: NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth>;
    historicalProvider?: NarrativeDirectorHistoricalProjectionProvider;
}

type UnknownRecord = Record<string, unknown>;

const requireScopePart = (value: string, field: keyof NarrativeDirectorScope): string => {
    const normalized = value.trim();
    if (!normalized) throw new Error(`Narrative Director scope ${field} must not be empty`);
    return normalized;
};

const normalizeScope = (scope: NarrativeDirectorScope): NarrativeDirectorScope => ({
    progressBundleId: requireScopePart(scope.progressBundleId, 'progressBundleId'),
    personaMaskId: requireScopePart(scope.personaMaskId, 'personaMaskId'),
    charId: requireScopePart(scope.charId, 'charId'),
});

const scopesMatch = (left: NarrativeDirectorScope, right: NarrativeDirectorScope): boolean => (
    left.progressBundleId === right.progressBundleId
    && left.personaMaskId === right.personaMaskId
    && left.charId === right.charId
);

const assertScope = (
    actual: NarrativeDirectorScope,
    expected: NarrativeDirectorScope,
    label: string,
): void => {
    if (!scopesMatch(actual, expected)) {
        throw new Error(`${label} crosses Narrative Director relationship scope`);
    }
};

const cloneJsonValue = <T>(value: T): T => {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

const deepFreeze = <T>(value: T): NarrativeDirectorReadOnly<T> => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return value as NarrativeDirectorReadOnly<T>;
    }
    Object.values(value as UnknownRecord).forEach(entry => deepFreeze(entry));
    return Object.freeze(value) as NarrativeDirectorReadOnly<T>;
};

const isVisibleHistoricalStatus = (status: HistoricalResultStatus): boolean => (
    status === 'soft_canon' || status === 'confirmed'
);

export const resolveHistoricalNarrativeAuthority = (
    authority: HistoricalAuthority,
): Exclude<NarrativeDirectorAuthority, 'active_confirmed_truth'> => {
    if (authority === 'user_confirmed') return 'user_confirmed_history';
    if (authority === 'model_reconstructed') return 'reconstructed';
    if (authority === 'source_explicit' || authority === 'source_inferred') return 'soft_historical';
    throw new Error(`Unsupported historical authority: ${String(authority)}`);
};

const assertHistoricalRecord = (
    record: HistoricalDerivedBase,
    scope: NarrativeDirectorScope,
    label: string,
): void => {
    assertScope(record.scope, scope, label);
    if (record.temporalClass !== 'historical') {
        throw new Error(`${label} must remain historical`);
    }
    if (!isVisibleHistoricalStatus(record.status)) {
        throw new Error(`${label} is not visible to Narrative Director`);
    }
    resolveHistoricalNarrativeAuthority(record.authority);
};

const assertHistoricalProjection = (
    projection: HistoricalNarrativeProjection,
    scope: NarrativeDirectorScope,
): void => {
    if (
        !Array.isArray(projection.actors)
        || !Array.isArray(projection.events)
        || !Array.isArray(projection.eventRouteBindings)
        || !Array.isArray(projection.routes)
        || !Array.isArray(projection.npcs)
        || !Array.isArray(projection.relationshipStages)
        || !Array.isArray(projection.openThreads)
    ) {
        throw new Error('Historical narrative projection collections are invalid');
    }
    assertScope(projection.scope, scope, 'historicalProjection');
    if (projection.temporalClass !== 'historical') {
        throw new Error('historicalProjection must remain historical');
    }
    if (!isVisibleHistoricalStatus(projection.status)) {
        throw new Error('historicalProjection is not visible to Narrative Director');
    }
    resolveHistoricalNarrativeAuthority(projection.authority);
    projection.actors.forEach((actor, index) => {
        assertHistoricalRecord(actor, scope, `historicalProjection.actors[${index}]`);
    });
    projection.events.forEach((event, index) => {
        assertHistoricalRecord(event, scope, `historicalProjection.events[${index}]`);
    });
    projection.eventRouteBindings.forEach((binding, index) => {
        assertHistoricalRecord(binding, scope, `historicalProjection.eventRouteBindings[${index}]`);
    });
    projection.routes.forEach((route, index) => {
        assertHistoricalRecord(route, scope, `historicalProjection.routes[${index}]`);
    });
    projection.npcs.forEach((npc, index) => {
        assertHistoricalRecord(npc, scope, `historicalProjection.npcs[${index}]`);
    });
    projection.relationshipStages.forEach((stage, index) => {
        assertHistoricalRecord(stage, scope, `historicalProjection.relationshipStages[${index}]`);
    });
    projection.openThreads.forEach((thread, index) => {
        assertHistoricalRecord(thread, scope, `historicalProjection.openThreads[${index}]`);
    });
};

const assertScopedRun = (
    run: NarrativeDirectorReadOnly<NarrativeRun>,
    scope: NarrativeDirectorScope,
    label: string,
): void => {
    if (run.progressBundleId !== scope.progressBundleId) {
        throw new Error(`${label} crosses Narrative Director progress bundle`);
    }
    if (!run.participantCharIds.includes(scope.charId)) {
        throw new Error(`${label} does not include the scoped character`);
    }
};

const assertCurrentTruth = (
    currentTruth: NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth>,
    scope: NarrativeDirectorScope,
): void => {
    assertScope(currentTruth.scope, scope, 'currentTruth');

    if (currentTruth.activeRun) {
        assertScopedRun(currentTruth.activeRun, scope, 'currentTruth.activeRun');
        if (currentTruth.activeRun.status !== 'active') {
            throw new Error('currentTruth.activeRun must be active');
        }
    }

    if (currentTruth.activeScene) {
        if (!currentTruth.activeRun) throw new Error('An active scene requires an active run');
        if (
            currentTruth.activeScene.status !== 'active'
            || currentTruth.activeScene.runId !== currentTruth.activeRun.id
            || currentTruth.activeRun.activeSceneId !== currentTruth.activeScene.id
            || !currentTruth.activeScene.participantIds.includes(scope.charId)
        ) {
            throw new Error('currentTruth.activeScene does not match the scoped active run');
        }
    }

    const receiptIds = new Set<string>();
    currentTruth.confirmedExperiences.forEach((experience, index) => {
        const label = `currentTruth.confirmedExperiences[${index}]`;
        assertScopedRun(experience.run, scope, `${label}.run`);
        if (
            experience.scene.status !== 'confirmed'
            || experience.scene.runId !== experience.run.id
            || !experience.scene.participantIds.includes(scope.charId)
        ) {
            throw new Error(`${label}.scene is not a confirmed scoped scene`);
        }
        if (
            experience.receipt.runId !== experience.run.id
            || experience.receipt.sceneId !== experience.scene.id
            || experience.receipt.progressBundleId !== scope.progressBundleId
            || experience.receipt.lane !== experience.run.lane
            || !experience.receipt.participantCharIds.includes(scope.charId)
            || !experience.receipt.confirmedByUser
            || !Number.isFinite(experience.scene.playedAt)
            || !Number.isFinite(experience.scene.confirmedAt)
            || !Number.isFinite(experience.receipt.confirmedAt)
            || experience.receipt.playedAt !== experience.scene.playedAt
            || experience.receipt.confirmedAt! < experience.receipt.playedAt
        ) {
            throw new Error(`${label}.receipt is not user-confirmed scoped truth`);
        }
        if (receiptIds.has(experience.receipt.id)) {
            throw new Error(`${label}.receipt is duplicated`);
        }
        receiptIds.add(experience.receipt.id);
    });
};

/**
 * Projects only active continuity and already confirmed experience truth from
 * the current narrative state. Draft and unconfirmed material stays outside
 * the Director context.
 */
export const projectNarrativeDirectorCurrentTruth = (input: {
    scope: NarrativeDirectorScope;
    narrative: unknown;
}): NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth> => {
    const scope = normalizeScope(input.scope);
    const state = normalizeNovelNarrativeState(input.narrative, 0);
    const scopedRuns = state.runs.filter(run => (
        run.progressBundleId === scope.progressBundleId
        && run.participantCharIds.includes(scope.charId)
    ));
    const activeRun = scopedRuns.find(run => (
        run.status === 'active' && run.id === state.activeRunId
    )) ?? null;
    const activeScene = activeRun
        ? state.scenes.find(scene => (
            scene.id === activeRun.activeSceneId
            && scene.runId === activeRun.id
            && scene.status === 'active'
            && scene.participantIds.includes(scope.charId)
        )) ?? null
        : null;
    const confirmedExperiences = state.receipts.flatMap(receipt => {
        if (
            receipt.progressBundleId !== scope.progressBundleId
            || !receipt.participantCharIds.includes(scope.charId)
            || !receipt.confirmedByUser
            || !Number.isFinite(receipt.confirmedAt)
        ) return [];
        const run = scopedRuns.find(entry => entry.id === receipt.runId);
        const scene = state.scenes.find(entry => (
            entry.id === receipt.sceneId
            && entry.runId === receipt.runId
            && entry.status === 'confirmed'
            && entry.participantIds.includes(scope.charId)
        ));
        return run && scene ? [{ run, scene, receipt }] : [];
    });

    return deepFreeze(cloneJsonValue({
        scope,
        activeRun,
        activeScene,
        confirmedExperiences,
    }));
};

/** Pure context assembly. It clones and freezes all inputs and grants no writes. */
export const createNarrativeDirectorContext = (
    input: CreateNarrativeDirectorContextInput,
): NarrativeDirectorContext => {
    const scope = normalizeScope(input.scope);
    assertCurrentTruth(input.currentTruth, scope);
    const historicalProjection = input.historicalProjection ?? null;
    if (historicalProjection) assertHistoricalProjection(historicalProjection, scope);

    return deepFreeze({
        schemaVersion: NARRATIVE_DIRECTOR_CONTEXT_SCHEMA_VERSION,
        scope: cloneJsonValue(scope),
        authorityOrder: [...NARRATIVE_DIRECTOR_AUTHORITY_ORDER],
        historicalAuthorityOrder: [...NARRATIVE_DIRECTOR_HISTORICAL_AUTHORITY_ORDER],
        currentTruthAuthority: 'active_confirmed_truth' as const,
        currentTruth: cloneJsonValue(input.currentTruth),
        historical: historicalProjection
            ? {
                rootAuthority: resolveHistoricalNarrativeAuthority(historicalProjection.authority),
                projection: cloneJsonValue(historicalProjection),
            }
            : null,
        readOnlyPolicy: { ...NARRATIVE_DIRECTOR_READ_ONLY_POLICY },
    });
};

/** Async provider seam. Storage remains outside the narrative domain. */
export const loadNarrativeDirectorContext = async (
    input: LoadNarrativeDirectorContextInput,
): Promise<NarrativeDirectorContext> => {
    const scope = normalizeScope(input.scope);
    const historicalProjection = input.historicalProvider
        ? await input.historicalProvider.readHistoricalNarrativeProjection({ scope: { ...scope } })
        : null;
    return createNarrativeDirectorContext({
        scope,
        currentTruth: input.currentTruth,
        historicalProjection,
    });
};
