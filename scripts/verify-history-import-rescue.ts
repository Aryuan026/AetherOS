import assert from 'node:assert/strict';
import {
    HISTORY_RESCUE_CRYPTO_PROFILE,
    HISTORY_RESCUE_STORE_ORDER,
    HistoryRescueError,
} from '../domain/historyImport/rescue.ts';
import type {
    HistoryRescuePayload,
    HistoryRescueSanitizedSections,
} from '../domain/historyImport/rescue.ts';
import {
    buildHistoryRescuePayload,
    createHistoryRescueArchive,
    createHistoryTemporaryRestorePlan,
    decryptHistoryRescueArchive,
    generateHistoryRecoverySecret,
    parseHistoryRescueArchive,
    sanitizeHistoryRescueSections,
    serializeHistoryRescueArchive,
    stableHistoryRescueJson,
    validateHistoryRescuePayload,
    validateHistoryRescueReferences,
    verifyHistoryTemporaryRestore,
} from '../utils/historyImport/backup/rescueArchive.ts';
import {
    HISTORY_RESCUE_ALL_STORES_FIXTURE,
    HISTORY_RESCUE_FIXTURE_CREATED_AT,
    HISTORY_RESCUE_FIXTURE_SECRET,
    HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES,
} from '../fixtures/history-import/rescueFixtures.ts';
import {
    HISTORY_IMPORT_FIXTURE_MANIFEST,
} from '../fixtures/history-import/manifest.ts';
import {
    generateSyntheticHistoryMessages,
} from '../fixtures/history-import/generators.ts';
import {
    HISTORY_SCOPE_ALPHA,
    HISTORY_SOURCE_MESSAGE_FIXTURE,
} from '../fixtures/history-import/contractFixtures.ts';

const ARCHIVE_ID = 'hrescue-synthetic-stage-0-4';
const SOURCE_DEVICE_ID = 'device-synthetic-stage-0-4';
const LIVE_DATABASE_ID = 'aetheros-live-synthetic';
const TEMP_DATABASE_ID = 'aetheros-restore-temp-synthetic';

const cloneJson = <T>(value: T): T => JSON.parse(stableHistoryRescueJson(value)) as T;

const generatedSecretA = generateHistoryRecoverySecret();
const generatedSecretB = generateHistoryRecoverySecret();
assert.match(generatedSecretA, /^[A-Za-z0-9_-]{43}$/);
assert.match(generatedSecretB, /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(generatedSecretA, generatedSecretB);

assert.equal(HISTORY_RESCUE_STORE_ORDER.length, 8);
assert.deepEqual(
    Object.keys(HISTORY_RESCUE_ALL_STORES_FIXTURE).sort(),
    [...HISTORY_RESCUE_STORE_ORDER].sort(),
);
assert.equal(
    HISTORY_RESCUE_STORE_ORDER.every(store => HISTORY_RESCUE_ALL_STORES_FIXTURE[store].length === 1),
    true,
    'the rescue fixture must exercise every declared store',
);

const sanitized = sanitizeHistoryRescueSections(HISTORY_RESCUE_ALL_STORES_FIXTURE);
assert.equal(sanitized.removedCredentialFieldCount, 3);
assert.equal(sanitized.removedRebuildableFieldCount, 2);
const sanitizedJson = stableHistoryRescueJson(sanitized.sections);
HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES.forEach(secret => {
    assert.equal(sanitizedJson.includes(secret), false, `credential value leaked after sanitization: ${secret}`);
});
assert.equal(sanitizedJson.includes('"apiKey"'), false);
assert.equal(sanitizedJson.includes('"accessToken"'), false);
assert.equal(sanitizedJson.includes('"databaseUrl"'), false);
const sanitizedEvent = sanitized.sections.history_events[0] as {
    factualEmbedding?: { values?: number[] };
};
const sanitizedCompanion = sanitized.sections.history_companion_projections[0] as {
    innerViewEmbedding?: { values?: number[] };
};
assert.equal(sanitizedEvent.factualEmbedding?.values, undefined);
assert.equal(sanitizedCompanion.innerViewEmbedding?.values, undefined);
assert.deepEqual(
    (HISTORY_RESCUE_ALL_STORES_FIXTURE.history_events[0].factualEmbedding?.values),
    [0.1, 0.2, 0.3],
    'sanitization must not mutate the live source object',
);

const payload = await buildHistoryRescuePayload({
    archiveId: ARCHIVE_ID,
    sourceDeviceId: SOURCE_DEVICE_ID,
    createdAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    sections: HISTORY_RESCUE_ALL_STORES_FIXTURE,
});
assert.equal(payload.manifest.sections.length, 8);
assert.equal(payload.manifest.removedCredentialFieldCount, 3);
assert.equal(payload.manifest.removedRebuildableFieldCount, 2);
assert.equal(payload.manifest.sections.every(section => section.recordCount === 1), true);
assert.equal(payload.manifest.sections.every(section => section.stableIdCount === 1), true);
assert.deepEqual(await validateHistoryRescuePayload(payload), payload);

const chunkBoundaryPayload = await buildHistoryRescuePayload({
    archiveId: `${ARCHIVE_ID}-chunk-boundary`,
    sourceDeviceId: SOURCE_DEVICE_ID,
    createdAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    sections: {
        ...HISTORY_RESCUE_ALL_STORES_FIXTURE,
        history_source_messages: [
            HISTORY_SOURCE_MESSAGE_FIXTURE,
            ...generateSyntheticHistoryMessages({
                seed: 405,
                count: 500,
                scope: HISTORY_SCOPE_ALPHA,
                batchId: HISTORY_SOURCE_MESSAGE_FIXTURE.batchId,
                baseSourceEpochMs: HISTORY_SOURCE_MESSAGE_FIXTURE.sourceTime.epochMs!,
                importedAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
                intervalMs: 1_000,
            }),
        ],
    },
});
const sourceSectionManifest = chunkBoundaryPayload.manifest.sections.find(
    section => section.store === 'history_source_messages',
)!;
assert.equal(sourceSectionManifest.recordCount, 501);
assert.equal(sourceSectionManifest.chunkCount, 2);
assert.deepEqual(sourceSectionManifest.chunks.map(chunk => chunk.recordCount), [500, 1]);
assert.deepEqual(sourceSectionManifest.chunks.map(chunk => chunk.recordStart), [0, 500]);
assert.deepEqual(await validateHistoryRescuePayload(chunkBoundaryPayload), chunkBoundaryPayload);

const brokenReferences = cloneJson<HistoryRescueSanitizedSections>(payload.sections);
(brokenReferences.history_companion_projections[0] as { eventId: string }).eventId = 'missing-event';
assert.match(validateHistoryRescueReferences(brokenReferences).join('\n'), /missing event/);

const corruptPlainPayload = cloneJson<HistoryRescuePayload>(payload);
corruptPlainPayload.manifest.sections[0].sha256 = `sha256:${'0'.repeat(64)}`;
await assert.rejects(
    () => validateHistoryRescuePayload(corruptPlainPayload),
    (error: unknown) => error instanceof HistoryRescueError && error.code === 'integrity_failed',
);

await assert.rejects(
    () => createHistoryRescueArchive({
        archiveId: ARCHIVE_ID,
        sourceDeviceId: SOURCE_DEVICE_ID,
        createdAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
        recoverySecret: 'short',
        sections: HISTORY_RESCUE_ALL_STORES_FIXTURE,
    }),
    (error: unknown) => error instanceof HistoryRescueError && error.code === 'recovery_secret_too_short',
);

const envelope = await createHistoryRescueArchive({
    archiveId: ARCHIVE_ID,
    sourceDeviceId: SOURCE_DEVICE_ID,
    createdAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    recoverySecret: HISTORY_RESCUE_FIXTURE_SECRET,
    sections: HISTORY_RESCUE_ALL_STORES_FIXTURE,
});
assert.equal(envelope.encryption.algorithm, 'AES-GCM');
assert.equal(envelope.encryption.keyLength, 256);
assert.equal(envelope.encryption.keyDerivation, 'PBKDF2');
assert.equal(envelope.encryption.hash, 'SHA-256');
assert.equal(envelope.encryption.iterations, HISTORY_RESCUE_CRYPTO_PROFILE.iterations);
assert.equal(envelope.encryption.chunkRecordLimit, HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit);
assert.equal(envelope.encryptedChunkCount, 8);
assert.equal(envelope.encryptedChunks.length, 8);
assert.equal(
    new Set([
        envelope.encryptedManifest.ivBase64,
        ...envelope.encryptedChunks.map(chunk => chunk.ivBase64),
    ]).size,
    9,
    'every encrypted part needs a unique AES-GCM IV',
);

const serialized = serializeHistoryRescueArchive(envelope);
assert.deepEqual(parseHistoryRescueArchive(serialized), envelope);
assert.equal(serialized.includes(HISTORY_RESCUE_FIXTURE_SECRET), false);
assert.equal(serialized.includes(SOURCE_DEVICE_ID), false, 'source device id belongs inside ciphertext');
assert.equal(serialized.includes('蓝色盒子'), false, 'historical content must not appear in the outer envelope');
HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES.forEach(secret => {
    assert.equal(serialized.includes(secret), false, `credential value leaked into rescue file: ${secret}`);
});

await assert.rejects(
    () => decryptHistoryRescueArchive(envelope, 'synthetic-wrong-recovery-secret'),
    (error: unknown) => error instanceof HistoryRescueError && error.code === 'decryption_failed',
);

const originalChunkCiphertext = envelope.encryptedChunks[0].ciphertextBase64;
const tamperedCiphertext = `${originalChunkCiphertext[0] === 'A' ? 'B' : 'A'}${originalChunkCiphertext.slice(1)}`;
await assert.rejects(
    () => decryptHistoryRescueArchive({
        ...envelope,
        encryptedChunks: [
            {
                ...envelope.encryptedChunks[0],
                ciphertextBase64: tamperedCiphertext,
            },
            ...envelope.encryptedChunks.slice(1),
        ],
    }, HISTORY_RESCUE_FIXTURE_SECRET),
    (error: unknown) => error instanceof HistoryRescueError && error.code === 'decryption_failed',
);

await assert.rejects(
    () => decryptHistoryRescueArchive({
        ...envelope,
        manifestChecksum: `sha256:${'f'.repeat(64)}`,
    }, HISTORY_RESCUE_FIXTURE_SECRET),
    (error: unknown) => error instanceof HistoryRescueError && error.code === 'decryption_failed',
);

await assert.rejects(
    () => createHistoryTemporaryRestorePlan({
        envelope,
        recoverySecret: HISTORY_RESCUE_FIXTURE_SECRET,
        liveDatabaseId: LIVE_DATABASE_ID,
        temporaryDatabaseId: LIVE_DATABASE_ID,
    }),
    (error: unknown) => (
        error instanceof HistoryRescueError
        && error.code === 'temporary_restore_target_invalid'
    ),
);

const plan = await createHistoryTemporaryRestorePlan({
    envelope,
    recoverySecret: HISTORY_RESCUE_FIXTURE_SECRET,
    liveDatabaseId: LIVE_DATABASE_ID,
    temporaryDatabaseId: TEMP_DATABASE_ID,
});
assert.equal(plan.status, 'archive_validated_for_temporary_restore');
assert.equal(plan.switchPreconditionsSatisfied, false);
assert.equal(plan.liveDatabaseMutationAllowed, false);
assert.deepEqual(plan.sections, payload.sections);

const verified = await verifyHistoryTemporaryRestore(
    plan,
    cloneJson<HistoryRescueSanitizedSections>(plan.sections),
    HISTORY_RESCUE_FIXTURE_CREATED_AT + 1_000,
);
assert.equal(verified.status, 'temporary_restore_verified');
assert.equal(verified.switchPreconditionsSatisfied, true);
assert.equal(verified.liveDatabaseMutationAllowed, false);
assert.equal(Object.values(verified.recordCounts).every(count => count === 1), true);

const mismatchedTemporarySections = cloneJson<HistoryRescueSanitizedSections>(plan.sections);
(mismatchedTemporarySections.history_source_messages[0] as { content: string }).content = '被篡改的临时恢复内容';
await assert.rejects(
    () => verifyHistoryTemporaryRestore(
        plan,
        mismatchedTemporarySections,
        HISTORY_RESCUE_FIXTURE_CREATED_AT + 2_000,
    ),
    (error: unknown) => (
        error instanceof HistoryRescueError
        && error.code === 'temporary_restore_mismatch'
    ),
);

assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'backup_all_history_stores')?.availability,
    'generator_ready',
);
assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'corrupt_rescue_archive')?.availability,
    'generator_ready',
    'the Stage 0.5 browser harness now proves rejected temp restore leaves live logical state unchanged',
);

console.log(
    `history rescue OK: stores=${HISTORY_RESCUE_STORE_ORDER.length} chunkBoundary=500+1 credentialsRemoved=${payload.manifest.removedCredentialFieldCount} rebuildableRemoved=${payload.manifest.removedRebuildableFieldCount}`,
);
