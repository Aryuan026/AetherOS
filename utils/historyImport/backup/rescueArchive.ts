import {
    HISTORY_RESCUE_CONTRACT,
    createHistoryScopeKey,
} from '../../../domain/historyImport/contract.ts';
import {
    HISTORY_RESCUE_ARCHIVE_VERSION,
    HISTORY_RESCUE_CRYPTO_PROFILE,
    HISTORY_RESCUE_FORMAT,
    HISTORY_RESCUE_STORE_ORDER,
    HistoryRescueError,
} from '../../../domain/historyImport/rescue.ts';
import type {
    CreateHistoryRescueArchiveInput,
    HistoryRescueArchiveEnvelope,
    HistoryRescueChunkManifest,
    HistoryRescueEncryptedPart,
    HistoryRescueEncryptionHeader,
    HistoryRescueManifest,
    HistoryRescuePayload,
    HistoryRescueSanitizationResult,
    HistoryRescueSanitizedSections,
    HistoryRescueSectionManifest,
    HistoryRescueSections,
    HistoryRescueStoreName,
    HistoryTemporaryRestorePlan,
    HistoryTemporaryRestoreVerification,
} from '../../../domain/historyImport/rescue.ts';
import {
    HISTORY_IMPORT_SCHEMA_VERSION,
} from '../../../domain/historyImport/contract.ts';
import type {
    HistoryImportBatch,
    HistoryJob,
    HistoryScope,
    HistorySourceMessage,
} from '../../../domain/historyImport/types.ts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const OMIT = Symbol('history-rescue-omit');

const EXTRA_FORBIDDEN_CREDENTIAL_KEYS = [
    'accessToken',
    'refreshToken',
    'authToken',
    'authorization',
    'clientSecret',
    'secretKey',
    'privateKey',
    'password',
] as const;

const getLastPathKey = (path: string): string => (
    path.replace(/\[\*\]/g, '').split('.').slice(-1)[0] || path
);

const FORBIDDEN_CREDENTIAL_KEYS = new Set(
    [
        ...HISTORY_RESCUE_CONTRACT.excludedCredentialFields.map(getLastPathKey),
        ...EXTRA_FORBIDDEN_CREDENTIAL_KEYS,
    ].map(key => key.toLocaleLowerCase('en-US')),
);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const assertNonEmpty = (value: string, label: string): void => {
    if (!value.trim()) throw new HistoryRescueError('invalid_input', `${label} is required`);
};

const assertTimestamp = (value: number, label: string): void => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new HistoryRescueError('invalid_input', `${label} must be a non-negative safe integer`);
    }
};

const canonicalize = (value: unknown, seen: WeakSet<object>): string => {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new HistoryRescueError('invalid_input', 'rescue data must not contain non-finite numbers');
        }
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) throw new HistoryRescueError('invalid_input', 'rescue data must not be circular');
        seen.add(value);
        const result = `[${value.map(item => (
            item === undefined ? 'null' : canonicalize(item, seen)
        )).join(',')}]`;
        seen.delete(value);
        return result;
    }
    if (isPlainObject(value)) {
        if (seen.has(value)) throw new HistoryRescueError('invalid_input', 'rescue data must not be circular');
        seen.add(value);
        const entries = Object.keys(value)
            .filter(key => value[key] !== undefined)
            .sort((left, right) => left.localeCompare(right))
            .map(key => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`);
        seen.delete(value);
        return `{${entries.join(',')}}`;
    }
    throw new HistoryRescueError('invalid_input', `unsupported rescue value type: ${typeof value}`);
};

export const stableHistoryRescueJson = (value: unknown): string => canonicalize(value, new WeakSet());

const bytesToBase64 = (bytes: Uint8Array): string => {
    if (typeof btoa !== 'function') {
        throw new HistoryRescueError('crypto_unavailable', 'base64 encoder is unavailable');
    }
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const base64ToBytes = (value: string, label: string): Uint8Array => {
    if (typeof atob !== 'function') {
        throw new HistoryRescueError('crypto_unavailable', 'base64 decoder is unavailable');
    }
    try {
        const binary = atob(value);
        const result = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            result[index] = binary.charCodeAt(index);
        }
        return result;
    } catch {
        throw new HistoryRescueError('invalid_archive', `${label} is not valid base64`);
    }
};

const getWebCrypto = (): Crypto => {
    if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
        throw new HistoryRescueError('crypto_unavailable', 'Web Crypto is unavailable');
    }
    return globalThis.crypto;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
};

const sha256 = async (value: string): Promise<string> => {
    const digest = await getWebCrypto().subtle.digest('SHA-256', textEncoder.encode(value));
    return `sha256:${Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')}`;
};

const assertExactSectionKeys: (
    sections: unknown,
) => asserts sections is Record<HistoryRescueStoreName, unknown[]> = (sections) => {
    if (!isPlainObject(sections)) {
        throw new HistoryRescueError('invalid_input', 'rescue sections must be an object');
    }
    const expected = [...HISTORY_RESCUE_STORE_ORDER].sort();
    const actual = Object.keys(sections).sort();
    if (stableHistoryRescueJson(actual) !== stableHistoryRescueJson(expected)) {
        throw new HistoryRescueError('invalid_input', 'rescue sections must contain exactly the declared stores');
    }
    HISTORY_RESCUE_STORE_ORDER.forEach(store => {
        if (!Array.isArray(sections[store])) {
            throw new HistoryRescueError('invalid_input', `${store} rescue section must be an array`);
        }
    });
};

interface SanitizationStats {
    credentialFields: number;
    rebuildableFields: number;
}

const sanitizeValue = (
    value: unknown,
    stats: SanitizationStats,
    seen: WeakSet<object>,
): unknown | typeof OMIT => {
    if (value === undefined) return OMIT;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new HistoryRescueError('invalid_input', 'rescue data must not contain non-finite numbers');
        }
        return value;
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) throw new HistoryRescueError('invalid_input', 'rescue data must not be circular');
        seen.add(value);
        const result = value.map(item => {
            const sanitized = sanitizeValue(item, stats, seen);
            return sanitized === OMIT ? null : sanitized;
        });
        seen.delete(value);
        return result;
    }
    if (!isPlainObject(value)) {
        throw new HistoryRescueError('invalid_input', 'rescue records must be plain JSON-compatible objects');
    }
    if (seen.has(value)) throw new HistoryRescueError('invalid_input', 'rescue data must not be circular');
    seen.add(value);
    const result: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, child]) => {
        const normalizedKey = key.toLocaleLowerCase('en-US');
        if (FORBIDDEN_CREDENTIAL_KEYS.has(normalizedKey)) {
            stats.credentialFields += 1;
            return;
        }
        const sanitized = sanitizeValue(child, stats, seen);
        if (sanitized !== OMIT) result[key] = sanitized;
    });
    seen.delete(value);
    return result;
};

const findForbiddenCredentialPaths = (
    value: unknown,
    path = '$',
    found: string[] = [],
): string[] => {
    if (Array.isArray(value)) {
        value.forEach((item, index) => findForbiddenCredentialPaths(item, `${path}[${index}]`, found));
        return found;
    }
    if (!isPlainObject(value)) return found;
    Object.entries(value).forEach(([key, child]) => {
        const childPath = `${path}.${key}`;
        if (FORBIDDEN_CREDENTIAL_KEYS.has(key.toLocaleLowerCase('en-US'))) {
            found.push(childPath);
        } else {
            findForbiddenCredentialPaths(child, childPath, found);
        }
    });
    return found;
};

export const sanitizeHistoryRescueSections = (
    sections: HistoryRescueSections,
): HistoryRescueSanitizationResult => {
    assertExactSectionKeys(sections);
    const stats: SanitizationStats = { credentialFields: 0, rebuildableFields: 0 };
    const sanitized = sanitizeValue(sections, stats, new WeakSet());
    if (!isPlainObject(sanitized)) {
        throw new HistoryRescueError('invalid_input', 'sanitized rescue sections are invalid');
    }
    assertExactSectionKeys(sanitized);
    const forbiddenPaths = findForbiddenCredentialPaths(sanitized);
    if (forbiddenPaths.length > 0) {
        throw new HistoryRescueError(
            'credential_exclusion_failed',
            `credential fields remain in rescue payload: ${forbiddenPaths.join(', ')}`,
        );
    }
    return {
        sections: sanitized as HistoryRescueSanitizedSections,
        removedCredentialFieldCount: stats.credentialFields,
        removedRebuildableFieldCount: stats.rebuildableFields,
    };
};

const extractStableIds = (records: unknown[]): string[] => records.flatMap(record => {
    if (!isPlainObject(record)) return [];
    const id = record.id;
    return typeof id === 'string' || typeof id === 'number' ? [String(id)] : [];
});

const indexRecordsById = <RecordType extends { id: string }>(
    records: RecordType[],
    store: HistoryRescueStoreName,
    errors: string[],
): Map<string, RecordType> => {
    const index = new Map<string, RecordType>();
    records.forEach((record, position) => {
        if (typeof record.id !== 'string' || !record.id.trim()) {
            errors.push(`${store}[${position}] has no stable id`);
            return;
        }
        if (index.has(record.id)) {
            errors.push(`${store} contains duplicate id ${record.id}`);
            return;
        }
        index.set(record.id, record);
    });
    return index;
};

const scopesMatch = (left: HistoryScope, right: HistoryScope): boolean => (
    createHistoryScopeKey(left) === createHistoryScopeKey(right)
    && left.personaMaskId === right.personaMaskId
);

export const validateHistoryRescueReferences = (
    sections: HistoryRescueSanitizedSections,
): string[] => {
    assertExactSectionKeys(sections);
    const errors: string[] = [];
    const batches = indexRecordsById(
        sections.history_import_batches as HistoryImportBatch[],
        'history_import_batches',
        errors,
    );
    const sourceMessages = indexRecordsById(
        sections.history_source_messages as HistorySourceMessage[],
        'history_source_messages',
        errors,
    );
    const jobs = indexRecordsById(
        sections.history_jobs as HistoryJob[],
        'history_jobs',
        errors,
    );
    indexRecordsById(
        sections.history_backup_receipts as Array<{ id: string }>,
        'history_backup_receipts',
        errors,
    );

    sourceMessages.forEach(message => {
        const batch = batches.get(message.batchId);
        if (!batch) {
            errors.push(`source message ${message.id} points to missing batch ${message.batchId}`);
        } else if (!scopesMatch(message.scope, batch.scope)) {
            errors.push(`source message ${message.id} crosses its batch scope`);
        }
    });
    jobs.forEach(job => {
        if (!job.batchId) return;
        const batch = batches.get(job.batchId);
        if (!batch) {
            errors.push(`job ${job.id} points to missing batch ${job.batchId}`);
        } else if (!scopesMatch(job.scope, batch.scope)) {
            errors.push(`job ${job.id} crosses batch scope ${job.batchId}`);
        }
    });
    return errors;
};

const createSectionManifest = async (
    store: HistoryRescueStoreName,
    records: unknown[],
): Promise<HistoryRescueSectionManifest> => {
    const storeIndex = HISTORY_RESCUE_STORE_ORDER.indexOf(store);
    const chunks: HistoryRescueChunkManifest[] = [];
    for (
        let recordStart = 0, chunkIndex = 0;
        recordStart < records.length;
        recordStart += HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit, chunkIndex += 1
    ) {
        const chunkRecords = records.slice(
            recordStart,
            recordStart + HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit,
        );
        const chunkJson = stableHistoryRescueJson(chunkRecords);
        const chunkStableIds = extractStableIds(chunkRecords);
        chunks.push({
            chunkId: `chunk-${String(storeIndex).padStart(2, '0')}-${String(chunkIndex).padStart(6, '0')}`,
            store,
            chunkIndex,
            recordStart,
            recordCount: chunkRecords.length,
            plaintextBytes: textEncoder.encode(chunkJson).byteLength,
            sha256: await sha256(chunkJson),
            stableIdCount: chunkStableIds.length,
            stableIdChecksum: await sha256(stableHistoryRescueJson(chunkStableIds)),
        });
    }
    const plaintextBytes = chunks.reduce((sum, chunk) => sum + chunk.plaintextBytes, 0);
    const stableIdCount = chunks.reduce((sum, chunk) => sum + chunk.stableIdCount, 0);
    return {
        store,
        recordCount: records.length,
        plaintextBytes,
        sha256: await sha256(stableHistoryRescueJson(chunks.map(chunk => ({
            chunkId: chunk.chunkId,
            recordCount: chunk.recordCount,
            sha256: chunk.sha256,
        })))),
        stableIdCount,
        stableIdChecksum: await sha256(stableHistoryRescueJson(
            chunks.map(chunk => chunk.stableIdChecksum),
        )),
        chunkCount: chunks.length,
        chunks,
    };
};

export const calculateHistoryRescueManifestChecksum = async (
    manifest: HistoryRescueManifest,
): Promise<string> => sha256(stableHistoryRescueJson(manifest));

export const buildHistoryRescuePayload = async (
    input: Omit<CreateHistoryRescueArchiveInput, 'recoverySecret'>,
): Promise<HistoryRescuePayload> => {
    assertNonEmpty(input.archiveId, 'history rescue archiveId');
    assertNonEmpty(input.sourceDeviceId, 'history rescue sourceDeviceId');
    assertTimestamp(input.createdAt, 'history rescue createdAt');
    const sanitized = sanitizeHistoryRescueSections(input.sections);
    const sectionManifests = await Promise.all(HISTORY_RESCUE_STORE_ORDER.map(store => (
        createSectionManifest(store, sanitized.sections[store])
    )));
    return {
        manifest: {
            archiveVersion: HISTORY_RESCUE_ARCHIVE_VERSION,
            historySchemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
            archiveId: input.archiveId,
            sourceDeviceId: input.sourceDeviceId,
            createdAt: input.createdAt,
            credentialPolicy: 'excluded_default',
            removedCredentialFieldCount: sanitized.removedCredentialFieldCount,
            removedRebuildableFieldCount: sanitized.removedRebuildableFieldCount,
            sections: sectionManifests,
        },
        sections: sanitized.sections,
    };
};

const assertManifestShape: (
    manifest: unknown,
) => asserts manifest is HistoryRescueManifest = (manifest) => {
    if (!isPlainObject(manifest)) throw new HistoryRescueError('invalid_archive', 'rescue manifest is missing');
    if (manifest.archiveVersion !== HISTORY_RESCUE_ARCHIVE_VERSION) {
        throw new HistoryRescueError('unsupported_archive', 'unsupported rescue manifest version');
    }
    if (manifest.historySchemaVersion !== HISTORY_IMPORT_SCHEMA_VERSION) {
        throw new HistoryRescueError('unsupported_archive', 'unsupported history schema version');
    }
    if (typeof manifest.archiveId !== 'string' || !manifest.archiveId.trim()) {
        throw new HistoryRescueError('invalid_archive', 'rescue manifest archiveId is required');
    }
    if (typeof manifest.sourceDeviceId !== 'string' || !manifest.sourceDeviceId.trim()) {
        throw new HistoryRescueError('invalid_archive', 'rescue manifest sourceDeviceId is required');
    }
    if (!Number.isSafeInteger(manifest.createdAt) || Number(manifest.createdAt) < 0) {
        throw new HistoryRescueError('invalid_archive', 'rescue manifest createdAt is invalid');
    }
    if (manifest.credentialPolicy !== 'excluded_default') {
        throw new HistoryRescueError('unsupported_archive', 'unsupported rescue credential policy');
    }
    if (!Array.isArray(manifest.sections)) {
        throw new HistoryRescueError('invalid_archive', 'rescue section manifest is missing');
    }
};

export const validateHistoryRescuePayload = async (
    payload: unknown,
    expectedManifestChecksum?: string,
): Promise<HistoryRescuePayload> => {
    if (!isPlainObject(payload)) throw new HistoryRescueError('invalid_archive', 'rescue payload is invalid');
    assertManifestShape(payload.manifest);
    assertExactSectionKeys(payload.sections);
    const manifest = payload.manifest;
    const sections = payload.sections as HistoryRescueSanitizedSections;
    if (manifest.sections.length !== HISTORY_RESCUE_STORE_ORDER.length) {
        throw new HistoryRescueError('integrity_failed', 'rescue manifest section count is invalid');
    }
    const forbiddenPaths = findForbiddenCredentialPaths(sections);
    if (forbiddenPaths.length > 0) {
        throw new HistoryRescueError('credential_exclusion_failed', 'rescue payload contains forbidden credential fields');
    }
    for (let index = 0; index < HISTORY_RESCUE_STORE_ORDER.length; index += 1) {
        const store = HISTORY_RESCUE_STORE_ORDER[index];
        const expected = manifest.sections[index];
        if (!isPlainObject(expected) || expected.store !== store) {
            throw new HistoryRescueError('integrity_failed', `rescue manifest order mismatch at ${store}`);
        }
        const actual = await createSectionManifest(store, sections[store]);
        if (stableHistoryRescueJson(actual) !== stableHistoryRescueJson(expected)) {
            throw new HistoryRescueError('integrity_failed', `rescue section integrity mismatch at ${store}`);
        }
    }
    const manifestChecksum = await calculateHistoryRescueManifestChecksum(manifest);
    if (expectedManifestChecksum && manifestChecksum !== expectedManifestChecksum) {
        throw new HistoryRescueError('integrity_failed', 'rescue manifest checksum mismatch');
    }
    const referenceErrors = validateHistoryRescueReferences(sections);
    if (referenceErrors.length > 0) {
        throw new HistoryRescueError('integrity_failed', referenceErrors.join('; '));
    }
    return { manifest, sections };
};

const assertRecoverySecret = (secret: string): Uint8Array => {
    const bytes = textEncoder.encode(secret);
    if (bytes.byteLength < HISTORY_RESCUE_CRYPTO_PROFILE.minimumRecoverySecretBytes) {
        throw new HistoryRescueError(
            'recovery_secret_too_short',
            `recovery secret must be at least ${HISTORY_RESCUE_CRYPTO_PROFILE.minimumRecoverySecretBytes} UTF-8 bytes`,
        );
    }
    return bytes;
};

export const generateHistoryRecoverySecret = (): string => {
    const bytes = getWebCrypto().getRandomValues(
        new Uint8Array(HISTORY_RESCUE_CRYPTO_PROFILE.generatedRecoverySecretBytes),
    );
    return bytesToBase64(bytes)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

const deriveHistoryRescueKey = async (
    recoverySecret: string,
    salt: Uint8Array,
    iterations: number,
): Promise<CryptoKey> => {
    const crypto = getWebCrypto();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(assertRecoverySecret(recoverySecret)),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            hash: HISTORY_RESCUE_CRYPTO_PROFILE.hash,
            salt: toArrayBuffer(salt),
            iterations,
        },
        keyMaterial,
        {
            name: HISTORY_RESCUE_CRYPTO_PROFILE.algorithm,
            length: HISTORY_RESCUE_CRYPTO_PROFILE.keyLength,
        },
        false,
        ['encrypt', 'decrypt'],
    );
};

type HistoryRescueAuthenticatedHeader = Omit<
    HistoryRescueArchiveEnvelope,
    'encryptedManifest' | 'encryptedChunks'
>;

const getAuthenticatedHeader = (
    envelope: HistoryRescueArchiveEnvelope,
): HistoryRescueAuthenticatedHeader => {
    const {
        encryptedManifest: _encryptedManifest,
        encryptedChunks: _encryptedChunks,
        ...header
    } = envelope;
    return header;
};

const getPartAdditionalData = (
    header: HistoryRescueAuthenticatedHeader,
    partId: string,
): ArrayBuffer => toArrayBuffer(textEncoder.encode(stableHistoryRescueJson({ header, partId })));

const assertEncryptedPart = (
    value: unknown,
    label: string,
): {
    part: HistoryRescueEncryptedPart;
    iv: Uint8Array;
    ciphertext: Uint8Array;
} => {
    if (!isPlainObject(value)) throw new HistoryRescueError('invalid_archive', `${label} is invalid`);
    if (typeof value.partId !== 'string' || !value.partId.trim()) {
        throw new HistoryRescueError('invalid_archive', `${label} partId is missing`);
    }
    if (typeof value.ivBase64 !== 'string' || typeof value.ciphertextBase64 !== 'string') {
        throw new HistoryRescueError('invalid_archive', `${label} ciphertext or iv is missing`);
    }
    const iv = base64ToBytes(value.ivBase64, `${label} iv`);
    const ciphertext = base64ToBytes(value.ciphertextBase64, `${label} ciphertext`);
    if (iv.byteLength !== HISTORY_RESCUE_CRYPTO_PROFILE.ivBytes) {
        throw new HistoryRescueError('invalid_archive', `${label} iv length is invalid`);
    }
    if (ciphertext.byteLength <= HISTORY_RESCUE_CRYPTO_PROFILE.tagLength / 8) {
        throw new HistoryRescueError('invalid_archive', `${label} ciphertext is too short`);
    }
    return {
        part: value as unknown as HistoryRescueEncryptedPart,
        iv,
        ciphertext,
    };
};

const assertEnvelope = (
    value: unknown,
): {
    envelope: HistoryRescueArchiveEnvelope;
    salt: Uint8Array;
} => {
    if (!isPlainObject(value)) throw new HistoryRescueError('invalid_archive', 'rescue envelope is invalid');
    if (value.format !== HISTORY_RESCUE_FORMAT) {
        throw new HistoryRescueError('unsupported_archive', 'unsupported rescue format');
    }
    if (value.archiveVersion !== HISTORY_RESCUE_ARCHIVE_VERSION) {
        throw new HistoryRescueError('unsupported_archive', 'unsupported rescue archive version');
    }
    if (value.historySchemaVersion !== HISTORY_IMPORT_SCHEMA_VERSION) {
        throw new HistoryRescueError('unsupported_archive', 'unsupported rescue history schema version');
    }
    if (typeof value.archiveId !== 'string' || !value.archiveId.trim()) {
        throw new HistoryRescueError('invalid_archive', 'rescue archiveId is required');
    }
    if (!Number.isSafeInteger(value.createdAt) || Number(value.createdAt) < 0) {
        throw new HistoryRescueError('invalid_archive', 'rescue createdAt is invalid');
    }
    if (typeof value.manifestChecksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.manifestChecksum)) {
        throw new HistoryRescueError('invalid_archive', 'rescue manifestChecksum is invalid');
    }
    if (!isPlainObject(value.encryption)) {
        throw new HistoryRescueError('invalid_archive', 'rescue encryption header is missing');
    }
    const encryption = value.encryption as unknown as HistoryRescueEncryptionHeader;
    if (
        encryption.algorithm !== HISTORY_RESCUE_CRYPTO_PROFILE.algorithm
        || encryption.keyLength !== HISTORY_RESCUE_CRYPTO_PROFILE.keyLength
        || encryption.tagLength !== HISTORY_RESCUE_CRYPTO_PROFILE.tagLength
        || encryption.keyDerivation !== HISTORY_RESCUE_CRYPTO_PROFILE.keyDerivation
        || encryption.hash !== HISTORY_RESCUE_CRYPTO_PROFILE.hash
        || encryption.chunkRecordLimit !== HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit
    ) {
        throw new HistoryRescueError('unsupported_archive', 'unsupported rescue encryption profile');
    }
    if (
        !Number.isSafeInteger(encryption.iterations)
        || encryption.iterations < HISTORY_RESCUE_CRYPTO_PROFILE.minimumAcceptedIterations
        || encryption.iterations > HISTORY_RESCUE_CRYPTO_PROFILE.maximumAcceptedIterations
    ) {
        throw new HistoryRescueError('unsupported_archive', 'rescue PBKDF2 iteration count is outside the accepted range');
    }
    if (typeof encryption.saltBase64 !== 'string') {
        throw new HistoryRescueError('invalid_archive', 'rescue salt is missing');
    }
    if (!Number.isSafeInteger(value.encryptedChunkCount) || Number(value.encryptedChunkCount) < 0) {
        throw new HistoryRescueError('invalid_archive', 'rescue encryptedChunkCount is invalid');
    }
    const salt = base64ToBytes(encryption.saltBase64, 'rescue salt');
    if (salt.byteLength !== HISTORY_RESCUE_CRYPTO_PROFILE.saltBytes) {
        throw new HistoryRescueError('invalid_archive', 'rescue salt length is invalid');
    }
    const manifestPart = assertEncryptedPart(value.encryptedManifest, 'encrypted manifest');
    if (manifestPart.part.partId !== 'manifest') {
        throw new HistoryRescueError('invalid_archive', 'encrypted manifest partId must be manifest');
    }
    if (!Array.isArray(value.encryptedChunks)) {
        throw new HistoryRescueError('invalid_archive', 'encrypted rescue chunks are missing');
    }
    if (value.encryptedChunks.length !== value.encryptedChunkCount) {
        throw new HistoryRescueError('invalid_archive', 'encrypted rescue chunk count mismatch');
    }
    const partIds = new Set<string>();
    const canonicalIvs = [bytesToBase64(manifestPart.iv)];
    value.encryptedChunks.forEach((part, index) => {
        const validated = assertEncryptedPart(part, `encrypted chunk ${index}`);
        if (validated.part.partId === 'manifest' || partIds.has(validated.part.partId)) {
            throw new HistoryRescueError('invalid_archive', 'encrypted rescue chunk partIds must be unique');
        }
        partIds.add(validated.part.partId);
        canonicalIvs.push(bytesToBase64(validated.iv));
    });
    if (new Set(canonicalIvs).size !== canonicalIvs.length) {
        throw new HistoryRescueError('invalid_archive', 'encrypted rescue parts must use unique IVs');
    }
    return {
        envelope: value as unknown as HistoryRescueArchiveEnvelope,
        salt,
    };
};

const createUniqueIv = (usedIvs: Set<string>): Uint8Array => {
    const crypto = getWebCrypto();
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const iv = crypto.getRandomValues(new Uint8Array(HISTORY_RESCUE_CRYPTO_PROFILE.ivBytes));
        const encoded = bytesToBase64(iv);
        if (!usedIvs.has(encoded)) {
            usedIvs.add(encoded);
            return iv;
        }
    }
    throw new HistoryRescueError('crypto_unavailable', 'could not allocate a unique rescue IV');
};

const encryptHistoryRescuePart = async (
    partId: string,
    plaintext: string,
    key: CryptoKey,
    header: HistoryRescueAuthenticatedHeader,
    usedIvs: Set<string>,
): Promise<HistoryRescueEncryptedPart> => {
    const iv = createUniqueIv(usedIvs);
    const ciphertext = await getWebCrypto().subtle.encrypt(
        {
            name: header.encryption.algorithm,
            iv: toArrayBuffer(iv),
            additionalData: getPartAdditionalData(header, partId),
            tagLength: header.encryption.tagLength,
        },
        key,
        textEncoder.encode(plaintext),
    );
    return {
        partId,
        ivBase64: bytesToBase64(iv),
        ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
    };
};

const decryptHistoryRescuePart = async (
    value: unknown,
    key: CryptoKey,
    header: HistoryRescueAuthenticatedHeader,
    label: string,
): Promise<string> => {
    const { part, iv, ciphertext } = assertEncryptedPart(value, label);
    try {
        const plaintext = await getWebCrypto().subtle.decrypt(
            {
                name: header.encryption.algorithm,
                iv: toArrayBuffer(iv),
                additionalData: getPartAdditionalData(header, part.partId),
                tagLength: header.encryption.tagLength,
            },
            key,
            toArrayBuffer(ciphertext),
        );
        return textDecoder.decode(plaintext);
    } catch {
        throw new HistoryRescueError(
            'decryption_failed',
            `${label} could not be decrypted; the secret or archive may be wrong`,
        );
    }
};

export const createHistoryRescueArchive = async (
    input: CreateHistoryRescueArchiveInput,
): Promise<HistoryRescueArchiveEnvelope> => {
    assertRecoverySecret(input.recoverySecret);
    const payload = await buildHistoryRescuePayload(input);
    const manifestChecksum = await calculateHistoryRescueManifestChecksum(payload.manifest);
    const crypto = getWebCrypto();
    const salt = crypto.getRandomValues(new Uint8Array(HISTORY_RESCUE_CRYPTO_PROFILE.saltBytes));
    const chunkManifests = payload.manifest.sections.flatMap(section => section.chunks);
    const encryption: HistoryRescueEncryptionHeader = {
        algorithm: HISTORY_RESCUE_CRYPTO_PROFILE.algorithm,
        keyLength: HISTORY_RESCUE_CRYPTO_PROFILE.keyLength,
        tagLength: HISTORY_RESCUE_CRYPTO_PROFILE.tagLength,
        keyDerivation: HISTORY_RESCUE_CRYPTO_PROFILE.keyDerivation,
        hash: HISTORY_RESCUE_CRYPTO_PROFILE.hash,
        iterations: HISTORY_RESCUE_CRYPTO_PROFILE.iterations,
        chunkRecordLimit: HISTORY_RESCUE_CRYPTO_PROFILE.chunkRecordLimit,
        saltBase64: bytesToBase64(salt),
    };
    const authenticatedHeader: HistoryRescueAuthenticatedHeader = {
        format: HISTORY_RESCUE_FORMAT,
        archiveVersion: HISTORY_RESCUE_ARCHIVE_VERSION,
        historySchemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        archiveId: input.archiveId,
        createdAt: input.createdAt,
        manifestChecksum,
        encryption,
        encryptedChunkCount: chunkManifests.length,
    };
    const key = await deriveHistoryRescueKey(input.recoverySecret, salt, encryption.iterations);
    const usedIvs = new Set<string>();
    const encryptedManifest = await encryptHistoryRescuePart(
        'manifest',
        stableHistoryRescueJson(payload.manifest),
        key,
        authenticatedHeader,
        usedIvs,
    );
    const encryptedChunks: HistoryRescueEncryptedPart[] = [];
    for (const chunk of chunkManifests) {
        const records = payload.sections[chunk.store].slice(
            chunk.recordStart,
            chunk.recordStart + chunk.recordCount,
        );
        encryptedChunks.push(await encryptHistoryRescuePart(
            chunk.chunkId,
            stableHistoryRescueJson(records),
            key,
            authenticatedHeader,
            usedIvs,
        ));
    }
    return {
        ...authenticatedHeader,
        encryptedManifest,
        encryptedChunks,
    };
};

export const decryptHistoryRescueArchive = async (
    value: unknown,
    recoverySecret: string,
): Promise<HistoryRescuePayload> => {
    const { envelope, salt } = assertEnvelope(value);
    const authenticatedHeader = getAuthenticatedHeader(envelope);
    const key = await deriveHistoryRescueKey(recoverySecret, salt, envelope.encryption.iterations);
    let manifest: unknown;
    try {
        manifest = JSON.parse(await decryptHistoryRescuePart(
            envelope.encryptedManifest,
            key,
            authenticatedHeader,
            'encrypted manifest',
        ));
    } catch {
        throw new HistoryRescueError('decryption_failed', 'encrypted rescue manifest is invalid');
    }
    assertManifestShape(manifest);
    const manifestChecksum = await calculateHistoryRescueManifestChecksum(manifest);
    if (manifestChecksum !== envelope.manifestChecksum) {
        throw new HistoryRescueError('integrity_failed', 'rescue manifest checksum mismatch');
    }
    if (
        manifest.archiveId !== envelope.archiveId
        || manifest.createdAt !== envelope.createdAt
    ) {
        throw new HistoryRescueError('integrity_failed', 'rescue envelope and manifest identity mismatch');
    }
    const chunkManifests = manifest.sections.flatMap(section => {
        if (!isPlainObject(section) || !Array.isArray(section.chunks)) {
            throw new HistoryRescueError('integrity_failed', 'rescue chunk manifest is invalid');
        }
        return section.chunks;
    });
    if (chunkManifests.length !== envelope.encryptedChunkCount) {
        throw new HistoryRescueError('integrity_failed', 'rescue encrypted chunk count does not match manifest');
    }
    const encryptedChunkMap = new Map(envelope.encryptedChunks.map(part => [part.partId, part]));
    const sections = Object.fromEntries(
        HISTORY_RESCUE_STORE_ORDER.map(store => [store, []]),
    ) as unknown as HistoryRescueSanitizedSections;
    for (const untypedChunk of chunkManifests) {
        if (
            !isPlainObject(untypedChunk)
            || typeof untypedChunk.chunkId !== 'string'
            || !HISTORY_RESCUE_STORE_ORDER.includes(untypedChunk.store as HistoryRescueStoreName)
            || !Number.isSafeInteger(untypedChunk.recordStart)
            || !Number.isSafeInteger(untypedChunk.recordCount)
        ) {
            throw new HistoryRescueError('integrity_failed', 'rescue chunk manifest entry is invalid');
        }
        const chunk = untypedChunk as unknown as HistoryRescueChunkManifest;
        const encryptedPart = encryptedChunkMap.get(chunk.chunkId);
        if (!encryptedPart) {
            throw new HistoryRescueError('integrity_failed', `encrypted rescue chunk ${chunk.chunkId} is missing`);
        }
        if (sections[chunk.store].length !== chunk.recordStart) {
            throw new HistoryRescueError('integrity_failed', `rescue chunk order mismatch at ${chunk.chunkId}`);
        }
        let records: unknown;
        try {
            records = JSON.parse(await decryptHistoryRescuePart(
                encryptedPart,
                key,
                authenticatedHeader,
                `encrypted chunk ${chunk.chunkId}`,
            ));
        } catch (error) {
            if (error instanceof HistoryRescueError) throw error;
            throw new HistoryRescueError('invalid_archive', `encrypted chunk ${chunk.chunkId} is not valid JSON`);
        }
        if (!Array.isArray(records) || records.length !== chunk.recordCount) {
            throw new HistoryRescueError('integrity_failed', `rescue chunk record count mismatch at ${chunk.chunkId}`);
        }
        sections[chunk.store].push(...records);
        encryptedChunkMap.delete(chunk.chunkId);
    }
    if (encryptedChunkMap.size > 0) {
        throw new HistoryRescueError('integrity_failed', 'rescue envelope contains undeclared encrypted chunks');
    }
    return validateHistoryRescuePayload({ manifest, sections }, envelope.manifestChecksum);
};

export const serializeHistoryRescueArchive = (
    envelope: HistoryRescueArchiveEnvelope,
): string => stableHistoryRescueJson(assertEnvelope(envelope).envelope);

export const parseHistoryRescueArchive = (serialized: string): HistoryRescueArchiveEnvelope => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(serialized);
    } catch {
        throw new HistoryRescueError('invalid_archive', 'rescue file is not valid JSON');
    }
    return assertEnvelope(parsed).envelope;
};

export interface CreateHistoryTemporaryRestorePlanInput {
    envelope: unknown;
    recoverySecret: string;
    liveDatabaseId: string;
    temporaryDatabaseId: string;
}

export const createHistoryTemporaryRestorePlan = async (
    input: CreateHistoryTemporaryRestorePlanInput,
): Promise<HistoryTemporaryRestorePlan> => {
    assertNonEmpty(input.liveDatabaseId, 'liveDatabaseId');
    assertNonEmpty(input.temporaryDatabaseId, 'temporaryDatabaseId');
    if (input.liveDatabaseId === input.temporaryDatabaseId) {
        throw new HistoryRescueError(
            'temporary_restore_target_invalid',
            'temporary restore database must differ from the live database',
        );
    }
    const envelope = assertEnvelope(input.envelope).envelope;
    const payload = await decryptHistoryRescueArchive(envelope, input.recoverySecret);
    return {
        archiveId: envelope.archiveId,
        manifestChecksum: envelope.manifestChecksum,
        liveDatabaseId: input.liveDatabaseId,
        temporaryDatabaseId: input.temporaryDatabaseId,
        manifest: payload.manifest,
        sections: payload.sections,
        status: 'archive_validated_for_temporary_restore',
        switchPreconditionsSatisfied: false,
        liveDatabaseMutationAllowed: false,
    };
};

export const verifyHistoryTemporaryRestore = async (
    plan: HistoryTemporaryRestorePlan,
    observedSections: HistoryRescueSanitizedSections,
    verifiedAt: number,
): Promise<HistoryTemporaryRestoreVerification> => {
    assertTimestamp(verifiedAt, 'temporary restore verifiedAt');
    try {
        await validateHistoryRescuePayload(
            { manifest: plan.manifest, sections: observedSections },
            plan.manifestChecksum,
        );
    } catch (error) {
        throw new HistoryRescueError(
            'temporary_restore_mismatch',
            error instanceof Error ? error.message : 'temporary restore does not match the rescue manifest',
        );
    }
    const recordCounts = Object.fromEntries(HISTORY_RESCUE_STORE_ORDER.map(store => (
        [store, observedSections[store].length]
    ))) as Record<HistoryRescueStoreName, number>;
    return {
        archiveId: plan.archiveId,
        manifestChecksum: plan.manifestChecksum,
        liveDatabaseId: plan.liveDatabaseId,
        temporaryDatabaseId: plan.temporaryDatabaseId,
        verifiedAt,
        status: 'temporary_restore_verified',
        switchPreconditionsSatisfied: true,
        liveDatabaseMutationAllowed: false,
        recordCounts,
    };
};
