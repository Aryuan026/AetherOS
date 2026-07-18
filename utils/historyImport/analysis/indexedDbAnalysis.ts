import {
    validateHistoricalInterpretationWorkspace,
    validateHistoricalUserOverlay,
    validateHistoryAnalysisPass,
    validateHistoryEvidenceBinding,
} from '../../../domain/historyImport/analysis/contract.ts';
import type {
    HistoricalInterpretationBundle,
    HistoricalInterpretationWorkspace,
    HistoricalUserOverlay,
    HistoryAnalysisPass,
    HistoryEvidenceBinding,
} from '../../../domain/historyImport/analysis/types.ts';
import type { HistoryScope } from '../../../domain/historyImport/types.ts';
import {
    createHistoryScopeKey,
    validateHistoryScope,
} from '../../../domain/historyImport/contract.ts';

export const HISTORY_ANALYSIS_DB_NAME = 'AetherOS_HistoryAnalysis:v2' as const;
export const HISTORY_ANALYSIS_DB_VERSION = 1 as const;
export const HISTORY_ANALYSIS_PASS_STORE = 'history_analysis_passes' as const;
export const HISTORY_ANALYSIS_WORKSPACE_STORE = 'historical_interpretation_workspaces' as const;
export const HISTORY_EVIDENCE_BINDING_STORE = 'history_evidence_bindings' as const;
export const HISTORICAL_USER_OVERLAY_STORE = 'historical_user_overlays' as const;
export const HISTORY_ANALYSIS_SCOPE_CREATED_INDEX = 'scope_created' as const;
export const HISTORY_ANALYSIS_WORKSPACE_SCOPE_INDEX = 'scope' as const;
export const HISTORY_EVIDENCE_SCOPE_STATUS_INDEX = 'scope_status_updated' as const;
export const HISTORICAL_OVERLAY_SCOPE_CREATED_INDEX = 'scope_created' as const;

const scopeKeyPath = [
    'scope.progressBundleId',
    'scope.personaMaskId',
    'scope.charId',
] as const;

const getIndexedDbFactory = (factory?: IDBFactory): IDBFactory => {
    const resolved = factory ?? globalThis.indexedDB;
    if (!resolved) throw new Error('IndexedDB is unavailable in this environment');
    return resolved;
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
});

const settleAbort = async (transaction: IDBTransaction, settled: Promise<void>): Promise<void> => {
    try {
        transaction.abort();
    } catch {
        // The transaction may already be settled.
    }
    try {
        await settled;
    } catch {
        // The caller receives the more specific contract/concurrency error.
    }
};

const exactScopeKey = (scope: HistoryScope): IDBValidKey => [
    scope.progressBundleId,
    scope.personaMaskId,
    scope.charId,
];

const scopesMatch = (left: HistoryScope, right: HistoryScope): boolean => (
    createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const requireScope = (scope: HistoryScope): void => {
    const errors = validateHistoryScope(scope);
    if (errors.length > 0) throw new Error(errors.join('; '));
};

const stableJson = (value: unknown): string => JSON.stringify(value);

const unique = (values: string[]): string[] => [...new Set(values)];

const allPassEntityIds = (pass: HistoryAnalysisPass): string[] => [
    ...pass.relationshipMemories.map(item => item.id),
    ...pass.timebookNodes.map(item => item.id),
    pass.narrativeProfile.id,
    ...pass.narrativeProfile.routes.map(item => item.id),
    ...pass.narrativeProfile.npcs.map(item => item.id),
    ...pass.narrativeProfile.relationshipStages.map(item => item.id),
    ...pass.narrativeProfile.openThreads.map(item => item.id),
];

export const createHistoryAnalysisWorkspaceId = (scope: HistoryScope): string => (
    `history-workspace:${scope.progressBundleId.length}:${scope.progressBundleId}`
    + `:${scope.personaMaskId.length}:${scope.personaMaskId}`
    + `:${scope.charId.length}:${scope.charId}`
);

export const createHistoricalUserEntityId = (seriesId: string): string => `history-user:${seriesId}`;

const getWorkspaceFromStore = async (
    store: IDBObjectStore,
    scope: HistoryScope,
): Promise<HistoricalInterpretationWorkspace | null> => {
    const value = await requestAsPromise(store.index(HISTORY_ANALYSIS_WORKSPACE_SCOPE_INDEX).get(exactScopeKey(scope)));
    return (value as HistoricalInterpretationWorkspace | undefined) ?? null;
};

export const openHistoryAnalysisDatabase = async (factory?: IDBFactory): Promise<IDBDatabase> => {
    const request = getIndexedDbFactory(factory).open(HISTORY_ANALYSIS_DB_NAME, HISTORY_ANALYSIS_DB_VERSION);
    request.onupgradeneeded = () => {
        const database = request.result;
        const passStore = database.createObjectStore(HISTORY_ANALYSIS_PASS_STORE, { keyPath: 'id' });
        passStore.createIndex(
            HISTORY_ANALYSIS_SCOPE_CREATED_INDEX,
            [...scopeKeyPath, 'createdAt'],
            { unique: false },
        );
        passStore.createIndex('request_id', 'requestId', { unique: true });
        passStore.createIndex('analysis_run_id', 'analysisRunId', { unique: true });

        const workspaceStore = database.createObjectStore(HISTORY_ANALYSIS_WORKSPACE_STORE, { keyPath: 'id' });
        workspaceStore.createIndex(HISTORY_ANALYSIS_WORKSPACE_SCOPE_INDEX, [...scopeKeyPath], { unique: true });

        const bindingStore = database.createObjectStore(HISTORY_EVIDENCE_BINDING_STORE, { keyPath: 'id' });
        bindingStore.createIndex(
            HISTORY_EVIDENCE_SCOPE_STATUS_INDEX,
            [...scopeKeyPath, 'status', 'updatedAt'],
            { unique: false },
        );

        const overlayStore = database.createObjectStore(HISTORICAL_USER_OVERLAY_STORE, { keyPath: 'id' });
        overlayStore.createIndex(
            HISTORICAL_OVERLAY_SCOPE_CREATED_INDEX,
            [...scopeKeyPath, 'createdAt'],
            { unique: false },
        );
        overlayStore.createIndex('series_revision', ['seriesId', 'revision'], { unique: true });
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('history analysis database open failed'));
        request.onblocked = () => reject(new Error('opening history analysis database was blocked'));
    });
    database.onversionchange = () => database.close();
    return database;
};

export const getHistoricalInterpretationBundle = async (input: {
    scope: HistoryScope;
    factory?: IDBFactory;
}): Promise<HistoricalInterpretationBundle | null> => {
    requireScope(input.scope);
    const database = await openHistoryAnalysisDatabase(input.factory);
    try {
        const workspaceTransaction = database.transaction(HISTORY_ANALYSIS_WORKSPACE_STORE, 'readonly');
        const workspace = await getWorkspaceFromStore(
            workspaceTransaction.objectStore(HISTORY_ANALYSIS_WORKSPACE_STORE),
            input.scope,
        );
        if (!workspace) return null;
        const workspaceErrors = validateHistoricalInterpretationWorkspace(workspace);
        if (workspaceErrors.length > 0) {
            throw new Error(`stored historical interpretation workspace is invalid: ${workspaceErrors.join('; ')}`);
        }
        if (!scopesMatch(workspace.scope, input.scope)) throw new Error('history workspace crosses requested scope');

        const transaction = database.transaction([
            HISTORY_ANALYSIS_PASS_STORE,
            HISTORY_EVIDENCE_BINDING_STORE,
            HISTORICAL_USER_OVERLAY_STORE,
        ], 'readonly');
        const passStore = transaction.objectStore(HISTORY_ANALYSIS_PASS_STORE);
        const bindingStore = transaction.objectStore(HISTORY_EVIDENCE_BINDING_STORE);
        const overlayStore = transaction.objectStore(HISTORICAL_USER_OVERLAY_STORE);
        const passes = await Promise.all(workspace.contributingPassIds.map(async id => {
            const pass = await requestAsPromise(passStore.get(id)) as HistoryAnalysisPass | undefined;
            if (!pass) throw new Error(`history workspace points to missing analysis pass ${id}`);
            const errors = validateHistoryAnalysisPass(pass);
            if (errors.length > 0) throw new Error(`stored analysis pass ${id} is invalid: ${errors.join('; ')}`);
            if (!scopesMatch(pass.scope, input.scope)) throw new Error(`analysis pass ${id} crosses workspace scope`);
            return pass;
        }));
        const bindings = await Promise.all(workspace.bindingIds.map(async id => {
            const binding = await requestAsPromise(bindingStore.get(id)) as HistoryEvidenceBinding | undefined;
            if (!binding) throw new Error(`history workspace points to missing evidence binding ${id}`);
            const errors = validateHistoryEvidenceBinding(binding);
            if (errors.length > 0) throw new Error(`stored evidence binding ${id} is invalid: ${errors.join('; ')}`);
            if (!scopesMatch(binding.scope, input.scope)) throw new Error(`evidence binding ${id} crosses workspace scope`);
            return binding;
        }));
        const overlays = await Promise.all(workspace.overlayIds.map(async id => {
            const overlay = await requestAsPromise(overlayStore.get(id)) as HistoricalUserOverlay | undefined;
            if (!overlay) throw new Error(`history workspace points to missing user overlay ${id}`);
            const errors = validateHistoricalUserOverlay(overlay);
            if (errors.length > 0) throw new Error(`stored user overlay ${id} is invalid: ${errors.join('; ')}`);
            if (!scopesMatch(overlay.scope, input.scope)) throw new Error(`user overlay ${id} crosses workspace scope`);
            return overlay;
        }));
        const expectedEntityIds = new Set([
            ...passes.flatMap(allPassEntityIds),
            ...overlays
                .filter(overlay => overlay.operation === 'create')
                .map(overlay => createHistoricalUserEntityId(overlay.seriesId)),
        ]);
        if (
            workspace.entityIds.length !== expectedEntityIds.size
            || workspace.entityIds.some(id => !expectedEntityIds.has(id))
        ) {
            throw new Error('history workspace entity index does not match immutable passes and manual additions');
        }
        bindings.forEach(binding => {
            if (!expectedEntityIds.has(binding.targetId)) {
                throw new Error(`evidence binding ${binding.id} points outside the workspace`);
            }
            if (
                binding.origin === 'analysis'
                && !workspace.contributingPassIds.includes(binding.analysisPassId!)
            ) {
                throw new Error(`evidence binding ${binding.id} points to a missing analysis pass`);
            }
        });
        overlays.forEach(overlay => {
            if (overlay.operation !== 'create' && !expectedEntityIds.has(overlay.targetId!)) {
                throw new Error(`user overlay ${overlay.id} points outside the workspace`);
            }
        });
        return { workspace, passes, bindings, overlays };
    } finally {
        database.close();
    }
};

/** Atomically append one immutable pass and extend the editable workspace. */
export const publishHistoryAnalysisPass = async (input: {
    pass: HistoryAnalysisPass;
    bindings?: HistoryEvidenceBinding[];
    expectedWorkspaceRevision?: number;
    factory?: IDBFactory;
}): Promise<HistoricalInterpretationWorkspace> => {
    const passErrors = validateHistoryAnalysisPass(input.pass);
    if (passErrors.length > 0) throw new Error(`invalid history analysis pass: ${passErrors.join('; ')}`);
    const bindings = input.bindings ?? [];
    const entityIds = new Set(allPassEntityIds(input.pass));
    bindings.forEach(binding => {
        const errors = validateHistoryEvidenceBinding(binding);
        if (errors.length > 0) throw new Error(`invalid evidence binding: ${errors.join('; ')}`);
        if (!scopesMatch(binding.scope, input.pass.scope)) throw new Error('evidence binding crosses analysis pass scope');
        if (binding.origin !== 'analysis' || binding.analysisPassId !== input.pass.id) {
            throw new Error('pass publication accepts only bindings owned by that analysis pass');
        }
        if (!entityIds.has(binding.targetId)) throw new Error(`evidence binding points to missing pass entity ${binding.targetId}`);
        if (binding.revision !== 1) throw new Error('new analysis binding revision must be 1');
    });
    if (new Set(bindings.map(binding => binding.id)).size !== bindings.length) {
        throw new Error('analysis pass binding ids must be unique');
    }

    const database = await openHistoryAnalysisDatabase(input.factory);
    const transaction = database.transaction([
        HISTORY_ANALYSIS_PASS_STORE,
        HISTORY_ANALYSIS_WORKSPACE_STORE,
        HISTORY_EVIDENCE_BINDING_STORE,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const passStore = transaction.objectStore(HISTORY_ANALYSIS_PASS_STORE);
        const workspaceStore = transaction.objectStore(HISTORY_ANALYSIS_WORKSPACE_STORE);
        const bindingStore = transaction.objectStore(HISTORY_EVIDENCE_BINDING_STORE);
        const existingPass = await requestAsPromise(passStore.get(input.pass.id)) as HistoryAnalysisPass | undefined;
        const workspace = await getWorkspaceFromStore(workspaceStore, input.pass.scope);

        if (existingPass) {
            if (stableJson(existingPass) !== stableJson(input.pass)) {
                throw new Error(`analysis pass id ${input.pass.id} already contains another immutable result`);
            }
            if (!workspace || !workspace.contributingPassIds.includes(input.pass.id)) {
                throw new Error('stored analysis pass is detached from its relationship workspace');
            }
            for (const binding of bindings) {
                const existingBinding = await requestAsPromise(bindingStore.get(binding.id)) as HistoryEvidenceBinding | undefined;
                if (
                    !existingBinding
                    || stableJson(existingBinding) !== stableJson(binding)
                    || !workspace.bindingIds.includes(binding.id)
                ) {
                    throw new Error(`analysis pass ${input.pass.id} has inconsistent immutable binding ${binding.id}`);
                }
            }
            await settled;
            return workspace;
        }
        if (workspace && input.expectedWorkspaceRevision !== workspace.revision) {
            throw new Error('historical interpretation workspace changed before pass publication');
        }
        if (!workspace && input.expectedWorkspaceRevision !== undefined) {
            throw new Error('expected historical interpretation workspace no longer exists');
        }

        await requestAsPromise(passStore.add(input.pass));
        for (const binding of bindings) {
            const existing = await requestAsPromise(bindingStore.get(binding.id));
            if (existing !== undefined) throw new Error(`evidence binding id ${binding.id} already exists`);
            await requestAsPromise(bindingStore.add(binding));
        }
        const next: HistoricalInterpretationWorkspace = workspace ? {
            ...workspace,
            contributingPassIds: [...workspace.contributingPassIds, input.pass.id],
            entityIds: unique([...workspace.entityIds, ...entityIds]),
            bindingIds: unique([...workspace.bindingIds, ...bindings.map(binding => binding.id)]),
            updatedAt: Math.max(workspace.updatedAt, input.pass.completedAt),
            revision: workspace.revision + 1,
        } : {
            schemaVersion: 2,
            id: createHistoryAnalysisWorkspaceId(input.pass.scope),
            scope: { ...input.pass.scope },
            contributingPassIds: [input.pass.id],
            entityIds: [...entityIds],
            bindingIds: bindings.map(binding => binding.id),
            overlayIds: [],
            createdAt: input.pass.completedAt,
            updatedAt: input.pass.completedAt,
            revision: 1,
        };
        const workspaceErrors = validateHistoricalInterpretationWorkspace(next);
        if (workspaceErrors.length > 0) throw new Error(`invalid next history workspace: ${workspaceErrors.join('; ')}`);
        await requestAsPromise(workspaceStore.put(next));
        await settled;
        return next;
    } catch (error) {
        await settleAbort(transaction, settled);
        throw error;
    } finally {
        database.close();
    }
};

/** Add a binding or update only its status/revision; siblings are untouched. */
export const saveHistoryEvidenceBinding = async (input: {
    binding: HistoryEvidenceBinding;
    expectedWorkspaceRevision: number;
    expectedBindingRevision?: number;
    factory?: IDBFactory;
}): Promise<HistoricalInterpretationWorkspace> => {
    const errors = validateHistoryEvidenceBinding(input.binding);
    if (errors.length > 0) throw new Error(`invalid evidence binding: ${errors.join('; ')}`);
    const database = await openHistoryAnalysisDatabase(input.factory);
    const transaction = database.transaction([
        HISTORY_ANALYSIS_WORKSPACE_STORE,
        HISTORY_EVIDENCE_BINDING_STORE,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const workspaceStore = transaction.objectStore(HISTORY_ANALYSIS_WORKSPACE_STORE);
        const bindingStore = transaction.objectStore(HISTORY_EVIDENCE_BINDING_STORE);
        const workspace = await getWorkspaceFromStore(workspaceStore, input.binding.scope);
        if (!workspace) throw new Error('historical interpretation workspace does not exist');
        if (workspace.revision !== input.expectedWorkspaceRevision) {
            throw new Error('historical interpretation workspace changed before binding update');
        }
        if (!workspace.entityIds.includes(input.binding.targetId)) {
            throw new Error(`evidence binding target ${input.binding.targetId} is outside the workspace`);
        }
        const existing = await requestAsPromise(bindingStore.get(input.binding.id)) as HistoryEvidenceBinding | undefined;
        if (existing) {
            if (input.expectedBindingRevision !== existing.revision) {
                throw new Error('evidence binding changed before update');
            }
            const immutableExisting = {
                scope: existing.scope,
                sourceRef: existing.sourceRef,
                targetKind: existing.targetKind,
                targetId: existing.targetId,
                purpose: existing.purpose,
                origin: existing.origin,
                analysisPassId: existing.analysisPassId,
                createdAt: existing.createdAt,
            };
            const immutableNext = {
                scope: input.binding.scope,
                sourceRef: input.binding.sourceRef,
                targetKind: input.binding.targetKind,
                targetId: input.binding.targetId,
                purpose: input.binding.purpose,
                origin: input.binding.origin,
                analysisPassId: input.binding.analysisPassId,
                createdAt: input.binding.createdAt,
            };
            if (stableJson(immutableExisting) !== stableJson(immutableNext)) {
                throw new Error('evidence binding identity is immutable');
            }
            if (input.binding.revision !== existing.revision + 1) {
                throw new Error('evidence binding revision must increase by one');
            }
        } else {
            if (input.expectedBindingRevision !== undefined) throw new Error('expected evidence binding no longer exists');
            if (input.binding.revision !== 1) throw new Error('new evidence binding revision must be 1');
        }
        await requestAsPromise(bindingStore.put(input.binding));
        const next: HistoricalInterpretationWorkspace = {
            ...workspace,
            bindingIds: unique([...workspace.bindingIds, input.binding.id]),
            updatedAt: Math.max(workspace.updatedAt, input.binding.updatedAt),
            revision: workspace.revision + 1,
        };
        await requestAsPromise(workspaceStore.put(next));
        await settled;
        return next;
    } catch (error) {
        await settleAbort(transaction, settled);
        throw error;
    } finally {
        database.close();
    }
};

/** Append one user-confirmed overlay and preserve every earlier revision. */
export const appendHistoricalUserOverlay = async (input: {
    overlay: HistoricalUserOverlay;
    expectedWorkspaceRevision: number;
    factory?: IDBFactory;
}): Promise<HistoricalInterpretationWorkspace> => {
    const errors = validateHistoricalUserOverlay(input.overlay);
    if (errors.length > 0) throw new Error(`invalid historical user overlay: ${errors.join('; ')}`);
    const database = await openHistoryAnalysisDatabase(input.factory);
    const transaction = database.transaction([
        HISTORY_ANALYSIS_WORKSPACE_STORE,
        HISTORICAL_USER_OVERLAY_STORE,
    ], 'readwrite', { durability: 'strict' });
    const settled = transactionAsPromise(transaction);
    try {
        const workspaceStore = transaction.objectStore(HISTORY_ANALYSIS_WORKSPACE_STORE);
        const overlayStore = transaction.objectStore(HISTORICAL_USER_OVERLAY_STORE);
        const workspace = await getWorkspaceFromStore(workspaceStore, input.overlay.scope);
        if (!workspace) throw new Error('historical interpretation workspace does not exist');
        if (workspace.revision !== input.expectedWorkspaceRevision) {
            throw new Error('historical interpretation workspace changed before overlay append');
        }
        const existingById = await requestAsPromise(overlayStore.get(input.overlay.id));
        if (existingById !== undefined) throw new Error(`historical user overlay id ${input.overlay.id} already exists`);

        if (input.overlay.previousOverlayId) {
            const previous = await requestAsPromise(overlayStore.get(input.overlay.previousOverlayId)) as HistoricalUserOverlay | undefined;
            if (!previous) throw new Error('previous historical user overlay does not exist');
            if (!scopesMatch(previous.scope, input.overlay.scope)) throw new Error('user overlay revision crosses workspace scope');
            if (previous.seriesId !== input.overlay.seriesId || input.overlay.revision !== previous.revision + 1) {
                throw new Error('historical user overlay revision chain is invalid');
            }
            const expectedTargetId = previous.operation === 'create'
                ? createHistoricalUserEntityId(previous.seriesId)
                : previous.targetId;
            if (previous.targetKind !== input.overlay.targetKind || input.overlay.targetId !== expectedTargetId) {
                throw new Error('historical user overlay revision changed target identity');
            }
        }

        const createdEntityId = createHistoricalUserEntityId(input.overlay.seriesId);
        const priorOverlays = await Promise.all(workspace.overlayIds.map(async id => (
            await requestAsPromise(overlayStore.get(id)) as HistoricalUserOverlay | undefined
        )));
        const knownManualEntityIds = new Set(
            priorOverlays
                .filter((overlay): overlay is HistoricalUserOverlay => Boolean(overlay && overlay.operation === 'create'))
                .map(overlay => createHistoricalUserEntityId(overlay.seriesId)),
        );
        if (input.overlay.operation !== 'create') {
            if (!workspace.entityIds.includes(input.overlay.targetId!) && !knownManualEntityIds.has(input.overlay.targetId!)) {
                throw new Error(`user overlay target ${input.overlay.targetId} is outside the workspace`);
            }
        }

        await requestAsPromise(overlayStore.add(input.overlay));
        const next: HistoricalInterpretationWorkspace = {
            ...workspace,
            entityIds: input.overlay.operation === 'create'
                ? unique([...workspace.entityIds, createdEntityId])
                : workspace.entityIds,
            overlayIds: [...workspace.overlayIds, input.overlay.id],
            updatedAt: Math.max(workspace.updatedAt, input.overlay.createdAt),
            revision: workspace.revision + 1,
        };
        await requestAsPromise(workspaceStore.put(next));
        await settled;
        return next;
    } catch (error) {
        await settleAbort(transaction, settled);
        throw error;
    } finally {
        database.close();
    }
};
