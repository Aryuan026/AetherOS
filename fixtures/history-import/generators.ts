import {
    HISTORY_IMPORT_SCHEMA_VERSION,
    HISTORY_RAW_SOURCE_DELIVERY_POLICY,
    createHistoryScopeKey,
    validateHistoryScope,
} from '../../domain/historyImport/contract.ts';
import type {
    HistoryImportBatch,
    HistoryScope,
    HistorySourceMessage,
} from '../../domain/historyImport/types.ts';

export interface SyntheticHistoryGeneratorConfig {
    seed: number;
    count: number;
    scope: HistoryScope;
    batchId: string;
    baseSourceEpochMs: number;
    importedAt: number;
    intervalMs?: number;
}

const SYNTHETIC_CONTENT = [
    '今天把一颗蓝色玻璃珠放进纸盒里。',
    '我记得，纸盒在书架第二层，旁边是一本没有写名字的笔记本。',
    '那我们给它画一张小地图，免得以后找不到。',
    '好呀，地图只写合成地点，不对应任何真实住址。',
    '窗外下起了雨，我们决定先听完这段纯虚构的故事。',
    '故事里的旅行者绕了很远，最后还是认出了门口那盏暖色灯。',
    '晚安，明天继续整理纸盒，但这并不代表发生了剧情转折。',
    '收到：这是一条用于性能验证的合成消息，没有现实人物信息。',
] as const;

const assertFiniteInteger = (value: number, label: string): void => {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`${label} must be a finite integer`);
    }
};

const assertGeneratorConfig = (config: SyntheticHistoryGeneratorConfig): number => {
    const scopeErrors = validateHistoryScope(config.scope);
    if (scopeErrors.length > 0) throw new Error(scopeErrors.join('; '));
    if (!config.batchId.trim()) throw new Error('synthetic history batchId is required');
    assertFiniteInteger(config.seed, 'synthetic history seed');
    assertFiniteInteger(config.count, 'synthetic history count');
    if (config.count < 0) throw new Error('synthetic history count must not be negative');
    assertFiniteInteger(config.baseSourceEpochMs, 'synthetic history baseSourceEpochMs');
    assertFiniteInteger(config.importedAt, 'synthetic history importedAt');
    const intervalMs = config.intervalMs ?? 60_000;
    assertFiniteInteger(intervalMs, 'synthetic history intervalMs');
    if (intervalMs <= 0) throw new Error('synthetic history intervalMs must be positive');

    const finalSourceEpochMs = config.baseSourceEpochMs + Math.max(0, config.count - 1) * intervalMs;
    if (!Number.isSafeInteger(finalSourceEpochMs)) {
        throw new Error('synthetic history final source timestamp must be a safe integer');
    }
    if (config.count > 0 && config.importedAt <= finalSourceEpochMs) {
        throw new Error('synthetic history importedAt must be later than every source message');
    }
    // Also proves the generated timestamp can be represented by HistorySourceTime.iso.
    new Date(finalSourceEpochMs).toISOString();
    return intervalMs;
};

// Fixture-only FNV-1a digest. Production identity and archive integrity must use
// the cryptographic hashes required by the Stage 0 contract.
const fixtureDigest = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const fixtureSha256Shape = (value: string): string => {
    const parts = Array.from({ length: 8 }, (_, index) => fixtureDigest(`${index}|${value}`));
    return `sha256:fixture-${parts.join('')}`;
};

const fixtureIdDigest = (value: string): string => (
    Array.from({ length: 4 }, (_, index) => fixtureDigest(`id-${index}|${value}`)).join('')
);

const getSyntheticContent = (seed: number, sourceOrder: number): string => {
    const poolIndex = Math.abs(seed + sourceOrder * 17) % SYNTHETIC_CONTENT.length;
    return `${SYNTHETIC_CONTENT[poolIndex]} [合成序号 ${sourceOrder + 1}]`;
};

export const createSyntheticImportBatch = (
    config: SyntheticHistoryGeneratorConfig,
): HistoryImportBatch => {
    assertGeneratorConfig(config);
    const now = config.importedAt;
    const sourceFileHash = fixtureSha256Shape(`${config.seed}|${config.count}`);
    return {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: config.batchId,
        scope: { ...config.scope },
        sourceFile: {
            name: `synthetic-history-${config.count}.txt`,
            format: 'txt',
            sizeBytes: config.count * 96,
            sha256: sourceFileHash,
            rawRetained: false,
        },
        sourceMode: 'relationship_chat',
        timezonePolicy: 'source',
        speakerMappings: [
            {
                sourceLabel: '合成人类',
                role: 'user',
                targetId: config.scope.personaMaskId,
                confidence: 1,
                confirmedByUser: true,
            },
            {
                sourceLabel: '合成角色',
                role: 'character',
                targetId: config.scope.charId,
                confidence: 1,
                confirmedByUser: true,
            },
        ],
        counts: {
            parsed: config.count,
            accepted: config.count,
            skipped: 0,
            uncertain: 0,
            duplicates: 0,
            committed: 0,
        },
        status: 'ready',
        dedupeNamespace: `fixture:${sourceFileHash}`,
        createdAt: now,
        updatedAt: now,
        revision: 1,
    };
};

export const createSyntheticHistoryMessage = (
    config: SyntheticHistoryGeneratorConfig,
    sourceOrder: number,
): HistorySourceMessage => {
    const intervalMs = assertGeneratorConfig(config);
    assertFiniteInteger(sourceOrder, 'synthetic history sourceOrder');
    if (sourceOrder < 0 || sourceOrder >= config.count) {
        throw new Error('synthetic history sourceOrder is outside the configured count');
    }

    const sourceEpochMs = config.baseSourceEpochMs + sourceOrder * intervalMs;
    const sourceIso = new Date(sourceEpochMs).toISOString();
    const speakerRole = sourceOrder % 2 === 0 ? 'user' : 'character';
    const speakerLabel = speakerRole === 'user' ? '合成人类' : '合成角色';
    const speakerId = speakerRole === 'user'
        ? config.scope.personaMaskId
        : config.scope.charId;
    const content = getSyntheticContent(config.seed, sourceOrder);
    const sourceFingerprint = fixtureSha256Shape(
        `${config.seed}|${sourceOrder}|${sourceEpochMs}|${speakerLabel}|${content}`,
    );
    const normalizedFingerprint = fixtureSha256Shape(
        content.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('zh-CN'),
    );
    const scopeKey = createHistoryScopeKey(config.scope);

    return {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: `hmsg-fixture-${fixtureIdDigest(`${scopeKey}|${config.batchId}|${sourceOrder}|${sourceFingerprint}`)}`,
        batchId: config.batchId,
        scope: { ...config.scope },
        kind: 'text',
        speakerRole,
        speakerId,
        speakerLabel,
        content,
        attachments: [],
        sourceOrder,
        sourceTime: {
            originalText: sourceIso,
            iso: sourceIso,
            epochMs: sourceEpochMs,
            timezone: 'UTC',
            precision: 'exact',
            confidence: 1,
        },
        importedAt: config.importedAt,
        sourceLocator: {
            kind: 'line',
            start: sourceOrder + 1,
            end: sourceOrder + 1,
            label: `synthetic-line-${sourceOrder + 1}`,
        },
        sourceFingerprint,
        normalizedFingerprint,
        sourceMode: 'relationship_chat',
        continuity: 'relationship',
        knowledge: 'shared',
        deliveryPolicy: {
            ...HISTORY_RAW_SOURCE_DELIVERY_POLICY,
            allowedSurfaces: [],
        },
        status: 'active',
        createdAt: config.importedAt,
        updatedAt: config.importedAt,
        revision: 1,
    };
};

export function* iterateSyntheticHistoryMessages(
    config: SyntheticHistoryGeneratorConfig,
): Generator<HistorySourceMessage, void, undefined> {
    assertGeneratorConfig(config);
    for (let sourceOrder = 0; sourceOrder < config.count; sourceOrder += 1) {
        yield createSyntheticHistoryMessage(config, sourceOrder);
    }
}

export const generateSyntheticHistoryMessages = (
    config: SyntheticHistoryGeneratorConfig,
): HistorySourceMessage[] => Array.from(iterateSyntheticHistoryMessages(config));
