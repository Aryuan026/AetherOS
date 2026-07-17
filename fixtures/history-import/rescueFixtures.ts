import {
    createHistoryJob,
} from '../../domain/historyImport/jobState.ts';
import type {
    HistoryImportBatch,
    HistoryJob,
} from '../../domain/historyImport/types.ts';
import type {
    HistoryRescueSections,
} from '../../domain/historyImport/rescue.ts';
import {
    createSyntheticImportBatch,
} from './generators.ts';
import {
    HISTORY_BACKUP_RECEIPT_FIXTURE,
    HISTORY_SCOPE_ALPHA,
    HISTORY_SOURCE_MESSAGE_FIXTURE,
} from './contractFixtures.ts';

export const HISTORY_RESCUE_FIXTURE_CREATED_AT = 1_768_406_500_000;
export const HISTORY_RESCUE_FIXTURE_SECRET = 'synthetic-recovery-secret-0001';
export const HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES = [
    'synthetic-api-credential-must-not-export',
    'synthetic-access-token-must-not-export',
    'synthetic-database-credential-must-not-export',
] as const;

const baseBatch = createSyntheticImportBatch({
    seed: 404,
    count: 1,
    scope: HISTORY_SCOPE_ALPHA,
    batchId: HISTORY_SOURCE_MESSAGE_FIXTURE.batchId,
    baseSourceEpochMs: HISTORY_SOURCE_MESSAGE_FIXTURE.sourceTime.epochMs!,
    importedAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
});

const batchWithCredentialTraps = {
    ...baseBatch,
    apiKey: HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES[0],
    privateRuntime: {
        accessToken: HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES[1],
    },
} as HistoryImportBatch;

const rescueJob = createHistoryJob({
    id: 'hjob-synthetic-rescue-import',
    kind: 'import',
    scope: HISTORY_SCOPE_ALPHA,
    batchId: HISTORY_SOURCE_MESSAGE_FIXTURE.batchId,
    totalCount: 1,
    inputVersion: 'normalized-source-v1',
    outputVersion: 'history-sidecar-v1',
}, HISTORY_RESCUE_FIXTURE_CREATED_AT);

const rescueJobWithCredentialTrap = {
    ...rescueJob,
    databaseUrl: HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES[2],
} as HistoryJob;

export const HISTORY_RESCUE_ALL_STORES_FIXTURE: HistoryRescueSections = {
    history_import_batches: [batchWithCredentialTraps],
    history_source_messages: [HISTORY_SOURCE_MESSAGE_FIXTURE],
    history_jobs: [rescueJobWithCredentialTrap],
    history_backup_receipts: [HISTORY_BACKUP_RECEIPT_FIXTURE],
};
