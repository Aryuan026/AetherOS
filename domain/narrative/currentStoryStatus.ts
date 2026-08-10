import type { HistoryScope } from '../historyImport/types.ts';
import {
    createNarrativeDirectorContext,
    type NarrativeDirectorCurrentTruth,
    type NarrativeDirectorReadOnly,
} from './directorContext.ts';
import type {
    NarrativeNpcState,
    NarrativeOpenThread,
    NarrativeRouteState,
    NarrativeRunLane,
} from './types.ts';

export const CURRENT_STORY_STATUS_SCHEMA_VERSION = 1 as const;

export interface CurrentStoryStatusActiveRun {
    id: string;
    bookId?: string;
    routeId: string;
    branchId: string;
    lane: NarrativeRunLane;
    routeSummary?: string;
    startedAt: number;
    updatedAt: number;
}

export interface CurrentStoryStatusActiveScene {
    id: string;
    title: string;
    location?: string;
    objective?: string;
    openedAt?: number;
}

export interface CurrentStoryStatusConfirmedExperience {
    receiptId: string;
    runId: string;
    sceneId: string;
    lane: NarrativeRunLane;
    routeId: string;
    branchId: string;
    sceneTitle: string;
    summary: string;
    acceptedFacts: readonly string[];
    playedAt: number;
    confirmedAt: number;
}

interface CurrentStoryStatusProjectionBase {
    schemaVersion: typeof CURRENT_STORY_STATUS_SCHEMA_VERSION;
    scope: HistoryScope;
    routeState: NarrativeRouteState;
    npcStates: readonly NarrativeNpcState[];
    openThreads: readonly NarrativeOpenThread[];
    confirmedExperiences: readonly CurrentStoryStatusConfirmedExperience[];
}

export interface EmptyCurrentStoryStatusProjection extends CurrentStoryStatusProjectionBase {
    status: 'empty';
    activeRun: null;
    activeScene: null;
}

export interface ActiveCurrentStoryStatusProjection extends CurrentStoryStatusProjectionBase {
    status: 'active';
    activeRun: CurrentStoryStatusActiveRun;
    activeScene: CurrentStoryStatusActiveScene | null;
}

export type CurrentStoryStatusProjection =
    | EmptyCurrentStoryStatusProjection
    | ActiveCurrentStoryStatusProjection;

type UnknownRecord = Record<string, unknown>;

const deepFreeze = <T>(value: T): NarrativeDirectorReadOnly<T> => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return value as NarrativeDirectorReadOnly<T>;
    }
    Object.values(value as UnknownRecord).forEach(entry => deepFreeze(entry));
    return Object.freeze(value) as NarrativeDirectorReadOnly<T>;
};

const cloneJsonValue = <T>(value: T): T => {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

/**
 * Read-only internal-runtime projection of the route that is active now.
 * This is not a player-visibility projection: routeState and NPC knownFacts
 * still require an explicit visibility policy before any UI or character
 * prompt may consume them. Historical analysis, planned scenes, and
 * unconfirmed receipts are intentionally absent from the input contract and
 * therefore cannot masquerade as current story truth.
 */
export const projectCurrentStoryStatus = (input: {
    scope: HistoryScope;
    currentTruth: NarrativeDirectorReadOnly<NarrativeDirectorCurrentTruth>;
}): NarrativeDirectorReadOnly<CurrentStoryStatusProjection> => {
    const context = createNarrativeDirectorContext({
        scope: input.scope,
        currentTruth: input.currentTruth,
    });
    const { activeRun, activeScene } = context.currentTruth;

    if (!activeRun) {
        return deepFreeze({
            schemaVersion: CURRENT_STORY_STATUS_SCHEMA_VERSION,
            scope: cloneJsonValue(context.scope),
            status: 'empty' as const,
            activeRun: null,
            activeScene: null,
            routeState: {},
            npcStates: [],
            openThreads: [],
            confirmedExperiences: [],
        });
    }

    const confirmedExperiences = context.currentTruth.confirmedExperiences
        .filter(experience => experience.run.id === activeRun.id)
        .map(experience => ({
            receiptId: experience.receipt.id,
            runId: experience.run.id,
            sceneId: experience.scene.id,
            lane: experience.run.lane,
            routeId: experience.run.routeId,
            branchId: experience.run.branchId,
            sceneTitle: experience.scene.title,
            summary: experience.receipt.summary,
            acceptedFacts: [...experience.receipt.acceptedFacts],
            playedAt: experience.receipt.playedAt,
            confirmedAt: experience.receipt.confirmedAt!,
        }));

    return deepFreeze({
        schemaVersion: CURRENT_STORY_STATUS_SCHEMA_VERSION,
        scope: cloneJsonValue(context.scope),
        status: 'active' as const,
        activeRun: {
            id: activeRun.id,
            bookId: activeRun.bookId,
            routeId: activeRun.routeId,
            branchId: activeRun.branchId,
            lane: activeRun.lane,
            routeSummary: activeRun.routeSummary,
            startedAt: activeRun.startedAt,
            updatedAt: activeRun.updatedAt,
        },
        activeScene: activeScene
            ? {
                id: activeScene.id,
                title: activeScene.title,
                location: activeScene.location,
                objective: activeScene.objective,
                openedAt: activeScene.openedAt,
            }
            : null,
        routeState: cloneJsonValue(activeRun.routeState),
        npcStates: cloneJsonValue(activeRun.npcStates),
        openThreads: cloneJsonValue(activeRun.openThreads),
        confirmedExperiences,
    });
};
