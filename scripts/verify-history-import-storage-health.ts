import assert from 'node:assert/strict';
import {
    HISTORY_STORAGE_SIZING_POLICY_V1,
    classifyHistoryStorageWriteFailure,
    createHistoryImportSizeProjection,
    evaluateHistoryStoragePreflight,
    resolveHistoryDurabilityState,
    validateHistoryStorageHealthSnapshot,
} from '../domain/historyImport/storageHealth.ts';
import type {
    HistoryStorageHealthSnapshot,
} from '../domain/historyImport/storageHealth.ts';
import {
    readHistoryStorageHealth,
    requestHistoryStoragePersistence,
} from '../utils/historyImport/storage/storageHealth.ts';
import {
    HISTORY_BACKUP_RECEIPT_FIXTURE,
} from '../fixtures/history-import/contractFixtures.ts';
import {
    HISTORY_IMPORT_FIXTURE_MANIFEST,
} from '../fixtures/history-import/manifest.ts';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const T0 = 1_768_406_400_000;

const unsupported = await readHistoryStorageHealth({
    environment: {},
    measuredAt: T0,
});
assert.deepEqual(unsupported, {
    measuredAt: T0,
    persistenceState: 'unsupported',
    estimateState: 'unsupported',
    issueCodes: ['storage_api_unavailable'],
});
assert.deepEqual(validateHistoryStorageHealthSnapshot(unsupported), []);

const bestEffort = await readHistoryStorageHealth({
    environment: {
        storage: {
            persisted: async () => false,
            estimate: async () => ({ usage: 100 * MiB, quota: GiB }),
        },
    },
    measuredAt: T0 + 1,
});
assert.equal(bestEffort.persistenceState, 'best_effort');
assert.equal(bestEffort.estimateState, 'available');
assert.equal(bestEffort.usageBytes, 100 * MiB);
assert.equal(bestEffort.quotaBytes, GiB);
assert.deepEqual(bestEffort.issueCodes, []);
assert.deepEqual(validateHistoryStorageHealthSnapshot(bestEffort), []);

const persistent: HistoryStorageHealthSnapshot = {
    ...bestEffort,
    measuredAt: T0 + 2,
    persistenceState: 'persistent',
};
assert.deepEqual(validateHistoryStorageHealthSnapshot(persistent), []);

const queryFailures = await readHistoryStorageHealth({
    environment: {
        storage: {
            persisted: async () => { throw new Error('synthetic persistence read failure'); },
            estimate: async () => { throw new Error('synthetic estimate failure'); },
        },
    },
    measuredAt: T0 + 3,
});
assert.equal(queryFailures.persistenceState, 'unknown');
assert.equal(queryFailures.estimateState, 'error');
assert.deepEqual(
    queryFailures.issueCodes,
    ['persistence_query_failed', 'estimate_query_failed'],
);

const incompleteEstimate = await readHistoryStorageHealth({
    environment: {
        storage: {
            persisted: async () => true,
            estimate: async () => ({ usage: 10 * MiB }),
        },
    },
    measuredAt: T0 + 4,
});
assert.equal(incompleteEstimate.estimateState, 'unavailable');
assert.equal(incompleteEstimate.usageBytes, undefined);
assert.equal(incompleteEstimate.quotaBytes, undefined);
assert.deepEqual(incompleteEstimate.issueCodes, ['estimate_incomplete']);

let persistCalls = 0;
const persistenceEnvironment = {
    storage: {
        persist: async () => {
            persistCalls += 1;
            return true;
        },
    },
    userActivation: { isActive: true },
};
const noGesture = await requestHistoryStoragePersistence({
    userGestureConfirmed: false,
    environment: persistenceEnvironment,
    requestedAt: T0 + 5,
});
assert.equal(noGesture.status, 'user_gesture_required');
assert.equal(persistCalls, 0, 'persistence permission must not be requested in the background');

const inactiveGesture = await requestHistoryStoragePersistence({
    userGestureConfirmed: true,
    environment: {
        ...persistenceEnvironment,
        userActivation: { isActive: false },
    },
    requestedAt: T0 + 6,
});
assert.equal(inactiveGesture.status, 'user_gesture_required');
assert.equal(persistCalls, 0);

const granted = await requestHistoryStoragePersistence({
    userGestureConfirmed: true,
    environment: persistenceEnvironment,
    requestedAt: T0 + 7,
});
assert.equal(granted.status, 'granted');
assert.equal(granted.persistenceState, 'persistent');
assert.equal(persistCalls, 1);

const denied = await requestHistoryStoragePersistence({
    userGestureConfirmed: true,
    environment: {
        storage: { persist: async () => false },
        userActivation: { isActive: true },
    },
    requestedAt: T0 + 8,
});
assert.equal(denied.status, 'denied');
assert.equal(denied.persistenceState, 'best_effort');

const unsupportedRequest = await requestHistoryStoragePersistence({
    userGestureConfirmed: true,
    environment: { storage: {} },
    requestedAt: T0 + 9,
});
assert.equal(unsupportedRequest.status, 'unsupported');

const failedRequest = await requestHistoryStoragePersistence({
    userGestureConfirmed: true,
    environment: {
        storage: {
            persist: async () => { throw new Error('synthetic request failure'); },
        },
        userActivation: { isActive: true },
    },
    requestedAt: T0 + 10,
});
assert.equal(failedRequest.status, 'failed');
assert.equal(failedRequest.issueCode, 'persistence_request_failed');

const projection = createHistoryImportSizeProjection({
    sourceBytes: 80 * MiB,
    normalizedBytes: 100 * MiB,
    recordCount: 50_000,
});
assert.deepEqual(projection, {
    sourceBytes: 80 * MiB,
    normalizedBytes: 100 * MiB,
    recordCount: 50_000,
    estimatedStorageBytes: 172_183_552,
    policyVersion: HISTORY_STORAGE_SIZING_POLICY_V1.version,
});

const ready = evaluateHistoryStoragePreflight(persistent, projection);
assert.equal(ready.status, 'ready');
assert.equal(ready.canStartImport, true);
assert.equal(ready.requiresUserAcknowledgement, false);
assert.deepEqual(ready.reasonCodes, []);
assert.equal(ready.freeBytesBeforeImport, 924 * MiB);
assert.equal(ready.reservedHeadroomBytes, Math.ceil(GiB * 0.2));
assert.equal(
    ready.safeWriteBudgetBytes,
    ready.freeBytesBeforeImport! - ready.reservedHeadroomBytes!,
);

const warning = evaluateHistoryStoragePreflight(bestEffort, projection);
assert.equal(warning.status, 'warning');
assert.equal(warning.canStartImport, true);
assert.equal(warning.requiresUserAcknowledgement, true);
assert.deepEqual(warning.reasonCodes, ['persistence_not_granted']);

const unknown = evaluateHistoryStoragePreflight(unsupported, projection);
assert.equal(unknown.status, 'unknown');
assert.equal(unknown.canStartImport, false);
assert.deepEqual(unknown.reasonCodes, ['storage_estimate_unavailable']);

const blocked = evaluateHistoryStoragePreflight({
    measuredAt: T0 + 11,
    persistenceState: 'persistent',
    estimateState: 'available',
    usageBytes: 200 * MiB,
    quotaBytes: 300 * MiB,
    issueCodes: [],
}, projection);
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.canStartImport, false);
assert.deepEqual(blocked.reasonCodes, ['insufficient_headroom']);

const inconsistent = evaluateHistoryStoragePreflight({
    measuredAt: T0 + 12,
    persistenceState: 'persistent',
    estimateState: 'available',
    usageBytes: 2 * GiB,
    quotaBytes: GiB,
    issueCodes: [],
}, projection);
assert.equal(inconsistent.status, 'blocked');
assert.deepEqual(inconsistent.reasonCodes, ['storage_estimate_inconsistent']);

assert.match(
    validateHistoryStorageHealthSnapshot({
        measuredAt: T0,
        persistenceState: 'persistent',
        estimateState: 'available',
        issueCodes: [],
    }).join('\n'),
    /requires usageBytes and quotaBytes/,
);

assert.equal(resolveHistoryDurabilityState(bestEffort).level, 'only_local');
assert.equal(resolveHistoryDurabilityState(persistent).level, 'persistent_local');
assert.deepEqual(resolveHistoryDurabilityState(bestEffort, HISTORY_BACKUP_RECEIPT_FIXTURE), {
    level: 'external_rescue_verified',
    persistenceState: 'best_effort',
    externalCopyPresent: true,
    restoreVerified: true,
});
assert.equal(
    resolveHistoryDurabilityState(bestEffort, {
        ...HISTORY_BACKUP_RECEIPT_FIXTURE,
        destination: 'temporary_cache',
    }).level,
    'only_local',
    'an internal Cache handoff is not an external rescue copy',
);
const savedButUnverified = resolveHistoryDurabilityState(persistent, {
    ...HISTORY_BACKUP_RECEIPT_FIXTURE,
    status: 'external_save_confirmed',
});
assert.equal(savedButUnverified.level, 'persistent_local');
assert.equal(savedButUnverified.externalCopyPresent, true);
assert.equal(savedButUnverified.restoreVerified, false);

const quotaFailure = classifyHistoryStorageWriteFailure({
    name: 'QuotaExceededError',
    message: 'synthetic quota failure',
});
assert.deepEqual(quotaFailure, {
    kind: 'quota_exceeded',
    errorName: 'QuotaExceededError',
    batchMayBeMarkedComplete: false,
    preserveDurableCursor: true,
    nextActions: ['retry', 'export_rescue', 'cancel'],
});
assert.equal(classifyHistoryStorageWriteFailure({ name: 'AbortError' }).kind, 'write_failed');
assert.equal(classifyHistoryStorageWriteFailure({ code: 22 }).kind, 'quota_exceeded');

assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'quota_interrupt')?.availability,
    'generator_ready',
    'the Stage 0.5 browser harness now proves bounded IndexedDB quota rollback',
);

console.log(
    `history storage health OK: projection=${projection.estimatedStorageBytes} persistence=unsupported/best_effort/persistent quota=ready/warning/blocked/unknown`,
);
