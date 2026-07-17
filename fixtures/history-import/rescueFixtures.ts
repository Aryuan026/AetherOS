import {
    HISTORY_IMPORT_SCHEMA_VERSION,
} from '../../domain/historyImport/contract.ts';
import {
    createHistoryJob,
} from '../../domain/historyImport/jobState.ts';
import type {
    HistoryCompanionProjection,
    HistoryEvent,
    HistoryImportBatch,
    HistoryTagDefinition,
} from '../../domain/historyImport/types.ts';
import type {
    HistoryRescueSections,
} from '../../domain/historyImport/rescue.ts';
import {
    createSyntheticImportBatch,
} from './generators.ts';
import {
    HISTORY_BACKUP_RECEIPT_FIXTURE,
    HISTORY_PLOT_POSITIVE_FIXTURE,
    HISTORY_SCOPE_ALPHA,
    HISTORY_SOURCE_MESSAGE_FIXTURE,
    HISTORY_SOURCE_SPAN_FIXTURE,
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

export const HISTORY_RESCUE_EVENT_FIXTURE: HistoryEvent = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: 'hevent-synthetic-blue-box-promise',
    evidenceFamilyId: 'hevidence-synthetic-blue-box',
    scope: HISTORY_SCOPE_ALPHA,
    sourceBatchIds: [HISTORY_SOURCE_MESSAGE_FIXTURE.batchId],
    sourceSpans: [HISTORY_SOURCE_SPAN_FIXTURE],
    origin: 'system_import',
    continuity: 'relationship',
    knowledge: 'shared',
    status: 'confirmed',
    title: '蓝色盒子的约定',
    factualSummary: '双方约定把备用钥匙放进蓝色盒子。',
    happenedAt: HISTORY_SOURCE_MESSAGE_FIXTURE.sourceTime,
    entities: [
        { type: 'object', label: '蓝色盒子', aliases: ['纸盒'] },
    ],
    tagIds: ['relationship:promise'],
    keywords: ['蓝色盒子', '钥匙'],
    aliases: ['盒子里的钥匙'],
    importance: 0.7,
    deliveryPolicy: {
        sensitivity: 'private',
        allowedSurfaces: ['remote_chat'],
        recallPolicy: 'situational',
        initiativePolicy: 'user_prompted',
        archiveSearchable: true,
    },
    reviewState: 'accepted',
    conflictsWithEventIds: [],
    supersedesEventIds: [],
    factualEmbedding: {
        model: 'fixture-embedding-v1',
        dimension: 3,
        checksum: 'sha256:fixture-event-embedding',
        generatedAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
        status: 'ready',
        values: [0.1, 0.2, 0.3],
    },
    extractorVersion: 'fixture-rescue-v1',
    createdAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    updatedAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    revision: 1,
};

export const HISTORY_RESCUE_COMPANION_FIXTURE: HistoryCompanionProjection = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: 'hcompanion-synthetic-blue-box',
    eventId: HISTORY_RESCUE_EVENT_FIXTURE.id,
    scope: HISTORY_SCOPE_ALPHA,
    sourceSpans: [HISTORY_SOURCE_SPAN_FIXTURE],
    innerView: '这个共同保管的小约定让角色感到被信任。',
    relationshipDelta: '从普通交谈变成明确的共同保管约定。',
    behavioralResidue: '以后提到收纳时可能自然想起蓝色盒子。',
    authority: 'source_inferred',
    confidence: 0.75,
    reviewState: 'accepted',
    status: 'confirmed',
    innerViewEmbedding: {
        model: 'fixture-embedding-v1',
        dimension: 3,
        checksum: 'sha256:fixture-inner-view-embedding',
        generatedAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
        status: 'ready',
        values: [0.4, 0.5, 0.6],
    },
    extractorVersion: 'fixture-rescue-v1',
    createdAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    updatedAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    revision: 1,
};

const rescueJob = createHistoryJob({
    id: 'hjob-synthetic-rescue-import',
    kind: 'import',
    scope: HISTORY_SCOPE_ALPHA,
    batchId: HISTORY_SOURCE_MESSAGE_FIXTURE.batchId,
    totalCount: 1,
    inputVersion: 'normalized-source-v1',
    outputVersion: 'history-sidecar-v1',
}, HISTORY_RESCUE_FIXTURE_CREATED_AT);

const tagWithCredentialTrap = {
    schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
    id: 'relationship:promise',
    namespace: 'relationship',
    label: '约定',
    aliases: ['承诺'],
    status: 'active',
    databaseUrl: HISTORY_RESCUE_FORBIDDEN_SECRET_VALUES[2],
    createdAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    updatedAt: HISTORY_RESCUE_FIXTURE_CREATED_AT,
    revision: 1,
} as HistoryTagDefinition;

export const HISTORY_RESCUE_ALL_STORES_FIXTURE: HistoryRescueSections = {
    history_import_batches: [batchWithCredentialTraps],
    history_source_messages: [HISTORY_SOURCE_MESSAGE_FIXTURE],
    history_events: [HISTORY_RESCUE_EVENT_FIXTURE],
    history_companion_projections: [HISTORY_RESCUE_COMPANION_FIXTURE],
    history_plot_projections: [HISTORY_PLOT_POSITIVE_FIXTURE],
    history_jobs: [rescueJob],
    memory_tag_registry: [tagWithCredentialTrap],
    history_backup_receipts: [HISTORY_BACKUP_RECEIPT_FIXTURE],
};
