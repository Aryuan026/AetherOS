import assert from 'node:assert/strict';
import {
    HISTORY_IMPORT_SCHEMA_VERSION,
    HISTORY_IMPORT_STORE_NAMES,
    HISTORY_IDENTITY_CONTRACT,
    HISTORY_RAW_SOURCE_DELIVERY_POLICY,
    HISTORY_RECORD_FAMILY_POLICIES,
    HISTORY_RESCUE_CONTRACT,
    createHistoryScopeKey,
    validateHistoryImportContract,
    validateHistoryPlotProjection,
    validateHistoryScope,
    validateHistorySourceMessage,
} from '../domain/historyImport/contract.ts';
import {
    HISTORY_BACKUP_RECEIPT_FIXTURE,
    HISTORY_NO_PLOT_FIXTURE,
    HISTORY_PLOT_POSITIVE_FIXTURE,
    HISTORY_SCOPE_ALPHA,
    HISTORY_SCOPE_BETA,
    HISTORY_SOURCE_MESSAGE_FIXTURE,
} from '../fixtures/history-import/contractFixtures.ts';
import {
    HISTORY_IMPORT_FIXTURE_MANIFEST,
    HISTORY_IMPORT_FIXTURE_MANIFEST_VERSION,
} from '../fixtures/history-import/manifest.ts';

assert.equal(HISTORY_IMPORT_SCHEMA_VERSION, 1);
assert.equal(HISTORY_IMPORT_FIXTURE_MANIFEST_VERSION, 1);
assert.deepEqual(validateHistoryImportContract(), []);

const storeNames = Object.values(HISTORY_IMPORT_STORE_NAMES);
assert.equal(new Set(storeNames).size, storeNames.length, 'history sidecar store names must be unique');
assert.equal(
    HISTORY_RECORD_FAMILY_POLICIES.length,
    storeNames.length,
    'each Stage 0 store needs one explicit record-family policy',
);
assert.equal(
    HISTORY_RECORD_FAMILY_POLICIES.every(policy => (
        policy.durability !== 'irreplaceable' || policy.backup === 'required'
    )),
    true,
    'every irreplaceable record family must be included in rescue archives',
);
assert.deepEqual(
    HISTORY_RECORD_FAMILY_POLICIES.filter(policy => policy.promptReadable).map(policy => policy.family),
    ['neutral_event', 'companion_projection', 'plot_projection'],
    'raw source messages and operational stores must not be prompt-readable',
);

assert.equal(HISTORY_RESCUE_CONTRACT.encryptedPrivatePayloadRequired, true);
assert.equal(HISTORY_RESCUE_CONTRACT.operatorCloudPersistence, 'none');
assert.equal(HISTORY_RESCUE_CONTRACT.legacyMessagesBulkWrite, 'forbidden');
assert.equal(HISTORY_RESCUE_CONTRACT.restoreStrategy, 'verify_temporary_database_before_switch');
assert.equal(HISTORY_RESCUE_CONTRACT.excludedCredentialFields.includes('apiConfig.apiKey'), true);
assert.deepEqual(HISTORY_IDENTITY_CONTRACT.scopeKeyComponents, ['progressBundleId', 'charId']);
assert.equal(HISTORY_IDENTITY_CONTRACT.forbiddenStableIdComponents.includes('importedAt'), true);
assert.equal(HISTORY_IDENTITY_CONTRACT.forbiddenStableIdComponents.includes('embeddingValues'), true);

assert.deepEqual(validateHistoryScope(HISTORY_SCOPE_ALPHA), []);
assert.deepEqual(validateHistoryScope(HISTORY_SCOPE_BETA), []);
assert.notEqual(
    createHistoryScopeKey(HISTORY_SCOPE_ALPHA),
    createHistoryScopeKey(HISTORY_SCOPE_BETA),
    'two progress bundles using one character must have different durable scope keys',
);
assert.match(
    validateHistoryScope({ ...HISTORY_SCOPE_ALPHA, progressBundleId: '' }).join('\n'),
    /progressBundleId/,
);

assert.deepEqual(validateHistorySourceMessage(HISTORY_SOURCE_MESSAGE_FIXTURE), []);
assert.equal(
    HISTORY_SOURCE_MESSAGE_FIXTURE.importedAt > (HISTORY_SOURCE_MESSAGE_FIXTURE.sourceTime.epochMs || 0),
    true,
    'fixture must prove import time is independent from source event time',
);
assert.deepEqual(HISTORY_SOURCE_MESSAGE_FIXTURE.deliveryPolicy, HISTORY_RAW_SOURCE_DELIVERY_POLICY);
assert.match(
    validateHistorySourceMessage({
        ...HISTORY_SOURCE_MESSAGE_FIXTURE,
        deliveryPolicy: {
            ...HISTORY_SOURCE_MESSAGE_FIXTURE.deliveryPolicy,
            allowedSurfaces: ['group_chat'],
            recallPolicy: 'situational',
        },
    }).join('\n'),
    /must not be directly prompt-readable/,
);

assert.deepEqual(validateHistoryPlotProjection(HISTORY_NO_PLOT_FIXTURE), []);
assert.deepEqual(validateHistoryPlotProjection(HISTORY_PLOT_POSITIVE_FIXTURE), []);
assert.match(
    validateHistoryPlotProjection({
        ...HISTORY_PLOT_POSITIVE_FIXTURE,
        deltas: [],
    }).join('\n'),
    /requires an evidenced delta/,
);
assert.match(
    validateHistoryPlotProjection({
        ...HISTORY_NO_PLOT_FIXTURE,
        deltas: HISTORY_PLOT_POSITIVE_FIXTURE.deltas,
    }).join('\n'),
    /no_plot must not contain plot deltas/,
);

assert.equal(HISTORY_BACKUP_RECEIPT_FIXTURE.encrypted, true);
assert.equal(HISTORY_BACKUP_RECEIPT_FIXTURE.externalCopyConfirmed, true);
assert.equal(HISTORY_BACKUP_RECEIPT_FIXTURE.status, 'restore_verified');

const fixtureIds = HISTORY_IMPORT_FIXTURE_MANIFEST.map(fixture => fixture.id);
assert.equal(new Set(fixtureIds).size, fixtureIds.length, 'fixture ids must be unique');
assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.every(fixture => (
        fixture.containsPersonalData === false
        && fixture.commitPolicy === 'synthetic_only'
        && fixture.requiredAssertions.length > 0
    )),
    true,
    'every committed fixture definition must be synthetic and assertive',
);
assert.deepEqual(
    [...new Set(HISTORY_IMPORT_FIXTURE_MANIFEST.map(fixture => fixture.gate))].sort(),
    ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'],
    'fixture manifest must cover every planned gate',
);
assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'docx_export_like')?.availability,
    'generator_ready',
    'the generic synthetic DOCX paragraph/table fixture must be runnable',
);
assert.match(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'docx_export_like')?.description || '',
    /no real source file is committed/i,
    'a friend-provided DOCX must never become a repository fixture',
);
assert.equal(
    HISTORY_IMPORT_FIXTURE_MANIFEST.find(fixture => fixture.id === 'large_50k_text')?.targetRecordCount,
    50_000,
);

console.log(
    `history import contract OK: stores=${storeNames.length} fixtures=${fixtureIds.length} schema=v${HISTORY_IMPORT_SCHEMA_VERSION}`,
);
