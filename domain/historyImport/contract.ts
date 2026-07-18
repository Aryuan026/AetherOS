import type {
    HistoryScope,
    HistorySourceMessage,
    HistorySourceTime,
} from './types';

export const HISTORY_IMPORT_SCHEMA_VERSION = 2 as const;

export const HISTORY_IMPORT_STORE_NAMES = {
    batches: 'history_import_batches',
    sourceMessages: 'history_source_messages',
    jobs: 'history_jobs',
    backupReceipts: 'history_backup_receipts',
} as const;

export type HistoryImportStoreName = typeof HISTORY_IMPORT_STORE_NAMES[keyof typeof HISTORY_IMPORT_STORE_NAMES];
export type HistoryRecordScopePolicy = 'relationship' | 'global_registry';
export type HistoryBackupPolicy = 'required' | 'optional' | 'omit_rebuildable';
export type HistoryDurabilityClass = 'irreplaceable' | 'operational' | 'rebuildable';

export interface HistoryRecordFamilyPolicy {
    family: string;
    store: HistoryImportStoreName;
    scope: HistoryRecordScopePolicy;
    durability: HistoryDurabilityClass;
    backup: HistoryBackupPolicy;
    promptReadable: boolean;
}

export const HISTORY_RECORD_FAMILY_POLICIES: HistoryRecordFamilyPolicy[] = [
    {
        family: 'import_batch',
        store: HISTORY_IMPORT_STORE_NAMES.batches,
        scope: 'relationship',
        durability: 'irreplaceable',
        backup: 'required',
        promptReadable: false,
    },
    {
        family: 'source_message',
        store: HISTORY_IMPORT_STORE_NAMES.sourceMessages,
        scope: 'relationship',
        durability: 'irreplaceable',
        backup: 'required',
        promptReadable: false,
    },
    {
        family: 'job',
        store: HISTORY_IMPORT_STORE_NAMES.jobs,
        scope: 'relationship',
        durability: 'operational',
        backup: 'optional',
        promptReadable: false,
    },
    {
        family: 'backup_receipt',
        store: HISTORY_IMPORT_STORE_NAMES.backupReceipts,
        scope: 'global_registry',
        durability: 'operational',
        backup: 'optional',
        promptReadable: false,
    },
];

export const HISTORY_RESCUE_CONTRACT = {
    encryptedPrivatePayloadRequired: true,
    operatorCloudPersistence: 'none',
    legacyMessagesBulkWrite: 'forbidden',
    restoreStrategy: 'verify_temporary_database_before_switch',
    defaultCredentialPolicy: 'exclude',
    excludedCredentialFields: [
        'apiConfig.apiKey',
        'apiConfig.minimaxApiKey',
        'apiPresets[*].apiKey',
        'databaseUrl',
        'tenantToken',
        'cronToken',
        'initSecret',
    ],
    rebuildableFields: [],
} as const;

export const HISTORY_IDENTITY_CONTRACT = {
    scopeKeyComponents: ['progressBundleId', 'personaMaskId', 'charId'],
    batchIdComponents: ['scopeKey', 'sourceFileSha256', 'parserVersion'],
    sourceMessageIdComponents: ['batchId', 'sourceOrder', 'sourceFingerprint'],
    forbiddenStableIdComponents: [
        'autoIncrementPrimaryKey',
        'importedAt',
        'generatedSummaryText',
    ],
} as const;

const isNonEmpty = (value: string | undefined): boolean => Boolean(value && value.trim());

export const createHistoryScopeKey = (scope: HistoryScope): string => (
    [scope.progressBundleId, scope.personaMaskId, scope.charId]
        .map(component => encodeURIComponent(component))
        .join('::')
);

export const validateHistoryScope = (scope: HistoryScope): string[] => {
    const errors: string[] = [];
    if (!isNonEmpty(scope.progressBundleId)) errors.push('progressBundleId is required');
    if (!isNonEmpty(scope.personaMaskId)) errors.push('personaMaskId is required');
    if (!isNonEmpty(scope.charId)) errors.push('charId is required');
    return errors;
};

export const validateHistorySourceTime = (time: HistorySourceTime): string[] => {
    const errors: string[] = [];
    if (!Number.isFinite(time.confidence) || time.confidence < 0 || time.confidence > 1) {
        errors.push('source time confidence must be between 0 and 1');
    }
    if (time.precision === 'exact' && time.epochMs === undefined && !isNonEmpty(time.iso)) {
        errors.push('exact source time requires epochMs or iso');
    }
    if (time.precision === 'unknown' && time.epochMs !== undefined) {
        errors.push('unknown source time must not claim an epochMs');
    }
    return errors;
};

export const validateHistorySourceMessage = (message: HistorySourceMessage): string[] => {
    const errors = [
        ...validateHistoryScope(message.scope),
        ...validateHistorySourceTime(message.sourceTime),
    ];
    if (message.schemaVersion !== HISTORY_IMPORT_SCHEMA_VERSION) errors.push('unsupported source message schemaVersion');
    if (!isNonEmpty(message.id)) errors.push('source message id is required');
    if (!isNonEmpty(message.batchId)) errors.push('source message batchId is required');
    if (!Number.isInteger(message.sourceOrder) || message.sourceOrder < 0) {
        errors.push('sourceOrder must be a non-negative integer');
    }
    if (!message.content.trim() && message.attachments.length === 0) {
        errors.push('source message requires content or an attachment placeholder');
    }
    if (!isNonEmpty(message.rawText)) errors.push('raw source text is required');
    if (!isNonEmpty(message.sourceFingerprint)) errors.push('source fingerprint is required');
    return errors;
};

export const validateHistoryImportContract = (): string[] => {
    const errors: string[] = [];
    const stores = Object.values(HISTORY_IMPORT_STORE_NAMES);
    if (new Set(stores).size !== stores.length) errors.push('history store names must be unique');

    const families = HISTORY_RECORD_FAMILY_POLICIES.map(policy => policy.family);
    if (new Set(families).size !== families.length) errors.push('history record family names must be unique');

    HISTORY_RECORD_FAMILY_POLICIES.forEach(policy => {
        if (!stores.includes(policy.store)) errors.push(`${policy.family} points to an unknown store`);
        if (policy.durability === 'irreplaceable' && policy.backup !== 'required') {
            errors.push(`${policy.family} is irreplaceable and must be in rescue archives`);
        }
        if (policy.family === 'source_message' && policy.promptReadable) {
            errors.push('raw source messages cannot be prompt-readable');
        }
    });

    if (!HISTORY_RESCUE_CONTRACT.encryptedPrivatePayloadRequired) {
        errors.push('private rescue payload encryption must be required');
    }
    if (HISTORY_RESCUE_CONTRACT.operatorCloudPersistence !== 'none') {
        errors.push('operator cloud must not be assumed to persist user history');
    }
    if (HISTORY_RESCUE_CONTRACT.legacyMessagesBulkWrite !== 'forbidden') {
        errors.push('legacy messages bulk write must stay forbidden in Stage 0');
    }
    if ((HISTORY_RESCUE_CONTRACT.excludedCredentialFields as readonly string[]).length === 0) {
        errors.push('default rescue archives need an explicit credential exclusion list');
    }
    return errors;
};
