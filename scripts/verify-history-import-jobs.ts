import assert from 'node:assert/strict';
import {
    cancelHistoryJob,
    commitHistoryJobChunk,
    completeHistoryJob,
    createHistoryJob,
    failHistoryJob,
    pauseHistoryJob,
    resumeHistoryJob,
    retryHistoryJob,
    startHistoryJob,
} from '../domain/historyImport/jobState.ts';
import type {
    HistoryJob,
    HistoryJobChunkCheckpoint,
} from '../domain/historyImport/types.ts';
import {
    createSyntheticHistoryMessage,
    createSyntheticImportBatch,
    generateSyntheticHistoryMessages,
    iterateSyntheticHistoryMessages,
} from '../fixtures/history-import/generators.ts';
import {
    HISTORY_IMPORT_FIXTURE_MANIFEST,
} from '../fixtures/history-import/manifest.ts';
import {
    HISTORY_SCOPE_ALPHA,
    HISTORY_SCOPE_BETA,
} from '../fixtures/history-import/contractFixtures.ts';
import { validateHistorySourceMessage } from '../domain/historyImport/contract.ts';

const T0 = 1_768_406_400_000;

const createSixTurnJob = () => createHistoryJob({
    id: 'hjob-synthetic-import-0001',
    kind: 'import',
    scope: HISTORY_SCOPE_ALPHA,
    batchId: 'hbatch-synthetic-stage-0-2',
    totalCount: 6,
    inputVersion: 'normalized-source-v1',
    outputVersion: 'history-sidecar-v1',
}, T0);

const firstChunk: HistoryJobChunkCheckpoint = {
    idempotencyKey: 'fixture-chunk-0-3',
    fromProcessedCount: 0,
    toProcessedCount: 3,
    lastSourceOrder: 2,
    lastSourceMessageId: 'hmsg-fixture-0003',
    checkpointHash: 'fixture-checkpoint-hash-0003',
};

const secondChunk: HistoryJobChunkCheckpoint = {
    idempotencyKey: 'fixture-chunk-3-6',
    fromProcessedCount: 3,
    toProcessedCount: 6,
    lastSourceOrder: 5,
    lastSourceMessageId: 'hmsg-fixture-0006',
    checkpointHash: 'fixture-checkpoint-hash-0006',
};

const queued = createSixTurnJob();
assert.equal(queued.status, 'queued');
assert.equal(queued.attempts, 0);
assert.deepEqual(queued.cursor, { processedCount: 0, totalCount: 6 });

const running = startHistoryJob(queued, T0 + 1);
assert.equal(running.status, 'running');
assert.equal(running.attempts, 1);
assert.equal(queued.status, 'queued', 'start must not mutate the previous job');
assert.strictEqual(startHistoryJob(running, T0 + 2), running, 'duplicate start is idempotent');

const afterFirstChunk = commitHistoryJobChunk(running, firstChunk, T0 + 3);
assert.equal(afterFirstChunk.cursor.processedCount, 3);
assert.equal(running.cursor.processedCount, 0, 'chunk commit must not mutate the previous cursor');
assert.strictEqual(
    commitHistoryJobChunk(afterFirstChunk, firstChunk, T0 + 4),
    afterFirstChunk,
    'replaying the exact durable checkpoint must be idempotent',
);
assert.throws(
    () => commitHistoryJobChunk(afterFirstChunk, {
        ...firstChunk,
        checkpointHash: 'fixture-conflicting-hash',
    }, T0 + 4),
    /idempotency conflict/,
);
assert.throws(
    () => commitHistoryJobChunk(afterFirstChunk, {
        ...secondChunk,
        fromProcessedCount: 2,
    }, T0 + 4),
    /durable processedCount/,
);
assert.throws(
    () => commitHistoryJobChunk(afterFirstChunk, {
        idempotencyKey: 'fixture-regressing-source-order',
        fromProcessedCount: 3,
        toProcessedCount: 4,
        lastSourceOrder: 1,
        lastSourceMessageId: 'hmsg-fixture-0002',
        checkpointHash: 'fixture-checkpoint-regression',
    }, T0 + 4),
    /lastSourceOrder must not move backwards/,
);
assert.throws(
    () => completeHistoryJob(afterFirstChunk, T0 + 4),
    /before every record/,
);

const paused = pauseHistoryJob(afterFirstChunk, T0 + 5);
assert.equal(paused.status, 'paused');
assert.strictEqual(pauseHistoryJob(paused, T0 + 6), paused, 'duplicate pause is idempotent');
const pausedAfterSerialization = JSON.parse(JSON.stringify(paused)) as HistoryJob;
assert.deepEqual(pausedAfterSerialization, paused, 'paused jobs need a lossless persistence shape');
const resumed = resumeHistoryJob(pausedAfterSerialization, T0 + 7);
assert.equal(resumed.status, 'running');
assert.equal(resumed.cursor.processedCount, 3);
assert.strictEqual(resumeHistoryJob(resumed, T0 + 8), resumed, 'duplicate resume is idempotent');

const fullyProcessed = commitHistoryJobChunk(resumed, secondChunk, T0 + 9);
const completed = completeHistoryJob(fullyProcessed, T0 + 10);
assert.equal(completed.status, 'completed');
assert.equal(completed.completedAt, T0 + 10);
assert.strictEqual(completeHistoryJob(completed, T0 + 11), completed, 'duplicate completion is idempotent');
assert.throws(() => cancelHistoryJob(completed, T0 + 12), /cannot cancel/);

const runningForRetry = startHistoryJob(createSixTurnJob(), T0 + 1);
const checkpointedForRetry = commitHistoryJobChunk(runningForRetry, firstChunk, T0 + 2);
const failed = failHistoryJob(checkpointedForRetry, {
    code: 'FIXTURE_WRITE_INTERRUPTED',
    message: 'Synthetic write interruption after a durable checkpoint.',
}, T0 + 3);
assert.equal(failed.status, 'failed');
assert.equal(failed.cursor.processedCount, 3);
const retried = retryHistoryJob(failed, T0 + 4);
assert.equal(retried.status, 'queued');
assert.equal(retried.cursor.processedCount, 3, 'retry must preserve the durable cursor');
assert.equal(retried.attempts, 1, 'retry queues work but does not count an attempt before start');
assert.equal(retried.errorCode, undefined);
const retryRunning = startHistoryJob(retried, T0 + 5);
assert.equal(retryRunning.attempts, 2);
assert.strictEqual(
    commitHistoryJobChunk(retryRunning, firstChunk, T0 + 6),
    retryRunning,
    'a restarted worker may safely replay its last durable chunk',
);
const retryCompleted = completeHistoryJob(
    commitHistoryJobChunk(retryRunning, secondChunk, T0 + 7),
    T0 + 8,
);
assert.equal(retryCompleted.status, 'completed');

const cancelled = cancelHistoryJob(createSixTurnJob(), T0 + 1);
assert.equal(cancelled.status, 'cancelled');
assert.strictEqual(cancelHistoryJob(cancelled, T0 + 2), cancelled, 'duplicate cancel is idempotent');
assert.throws(() => startHistoryJob(queued, T0 - 1), /must not move backwards/);
assert.throws(
    () => createHistoryJob({
        id: 'hjob-invalid-scope',
        kind: 'import',
        scope: { ...HISTORY_SCOPE_ALPHA, progressBundleId: '' },
        totalCount: 1,
        inputVersion: 'v1',
        outputVersion: 'v1',
    }, T0),
    /progressBundleId/,
);

const smallGeneratorConfig = {
    seed: 42,
    count: 6,
    scope: HISTORY_SCOPE_ALPHA,
    batchId: 'hbatch-synthetic-generator-small',
    baseSourceEpochMs: 1_704_153_600_000,
    importedAt: T0,
    intervalMs: 90_000,
};

const syntheticBatch = createSyntheticImportBatch(smallGeneratorConfig);
assert.equal(syntheticBatch.counts.accepted, 6);
assert.equal(syntheticBatch.sourceFile.rawRetained, false);
const smallRunA = generateSyntheticHistoryMessages(smallGeneratorConfig);
const smallRunB = generateSyntheticHistoryMessages(smallGeneratorConfig);
assert.deepEqual(smallRunA, smallRunB, 'same seed/config must generate byte-equivalent records');
assert.equal(smallRunA.every(message => validateHistorySourceMessage(message).length === 0), true);
assert.equal(smallRunA[0].speakerRole, 'user');
assert.equal(smallRunA[1].speakerRole, 'character');
assert.equal(smallRunA[0].sourceTime.epochMs, smallGeneratorConfig.baseSourceEpochMs);
assert.equal(
    smallRunA[5].sourceTime.epochMs,
    smallGeneratorConfig.baseSourceEpochMs + 5 * smallGeneratorConfig.intervalMs,
);

const samePositionOtherScope = createSyntheticHistoryMessage({
    ...smallGeneratorConfig,
    scope: HISTORY_SCOPE_BETA,
}, 0);
assert.notEqual(
    smallRunA[0].id,
    samePositionOtherScope.id,
    'same character and source position in another progress bundle needs a different stable id',
);

const largeGeneratorConfig = {
    ...smallGeneratorConfig,
    seed: 20260716,
    count: 50_000,
    batchId: 'hbatch-synthetic-generator-50k',
    intervalMs: 1_000,
};
let generatedCount = 0;
let firstLargeId = '';
let lastLargeId = '';
let lastLargeOrder = -1;
const largeIds = new Set<string>();
for (const message of iterateSyntheticHistoryMessages(largeGeneratorConfig)) {
    if (generatedCount === 0) firstLargeId = message.id;
    lastLargeId = message.id;
    lastLargeOrder = message.sourceOrder;
    assert.deepEqual(validateHistorySourceMessage(message), []);
    largeIds.add(message.id);
    generatedCount += 1;
}
assert.equal(generatedCount, 50_000);
assert.equal(largeIds.size, generatedCount, 'the 50k fixture must not contain stable-id collisions');
assert.equal(lastLargeOrder, 49_999);
assert.equal(
    firstLargeId,
    createSyntheticHistoryMessage(largeGeneratorConfig, 0).id,
    'lazy generation must have a deterministic first record',
);
assert.equal(
    lastLargeId,
    createSyntheticHistoryMessage(largeGeneratorConfig, 49_999).id,
    'lazy generation must have a deterministic final record',
);

assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'txt_basic_zh')?.availability,
    'generator_ready',
);
assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'large_50k_text')?.availability,
    'generator_ready',
);
assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'txt_ambiguous_zh')?.availability,
    'generator_ready',
    'ambiguous TXT coverage is owned by the preview parser verifier, not the exact-turn generator',
);

console.log(
    `history import jobs OK: transitions=pause/resume/retry/cancel/idempotent generated=${generatedCount}`,
);
