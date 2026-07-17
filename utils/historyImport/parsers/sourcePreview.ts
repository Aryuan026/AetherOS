import type { HistoryIdentityBindingDraft } from '../../../domain/historyImport/identityBinding';
import {
    HISTORY_IMPORT_PARSER_VERSION,
    HISTORY_IMPORT_PREVIEW_VERSION,
    type HistoryImportPreview,
    type HistoryPreviewAttachment,
    type HistoryPreviewIssueCode,
    type HistoryPreviewRow,
    type HistoryPreviewRowStatus,
    type HistorySourceUnit,
} from '../../../domain/historyImport/preview.ts';
import type {
    HistoryAttachmentKind,
    HistorySourceFormat,
    HistorySourceMessageKind,
    HistorySourceTime,
} from '../../../domain/historyImport/types';
import { parseDocxSourceUnits } from './docx.ts';
import { MAX_HISTORY_SOURCE_UNITS, parseTxtSourceUnits } from './txt.ts';

export const MAX_HISTORY_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_HISTORY_PREVIEW_ROWS = 500;

export interface HistoryPreviewSourceInput {
    name: string;
    mimeType?: string;
    lastModifiedAt?: number;
    bytes: Uint8Array;
    bindingDraft: HistoryIdentityBindingDraft;
}

export interface BuildHistoryImportPreviewOptions {
    materializedRowLimit?: number;
}

const DATE_TOKEN = String.raw`(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日?)`;
const CLOCK_TOKEN = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const ZONE_TOKEN = String.raw`(?:Z|[+-]\d{2}:?\d{2})`;
const TIMESTAMP_TOKEN = `${DATE_TOKEN}(?:[ T]${CLOCK_TOKEN}(?:\s*${ZONE_TOKEN})?)?`;

const BRACKETED_TURN = new RegExp(
    `^\\s*[\\[【(（]\\s*(${TIMESTAMP_TOKEN})\\s*[\\]】)）]\\s*(.{1,40}?)[：:]\\s*([\\s\\S]*)$`,
    'u',
);
const PREFIXED_TURN = new RegExp(
    `^\\s*(${TIMESTAMP_TOKEN})\\s+(.{1,40}?)[：:]\\s*([\\s\\S]*)$`,
    'u',
);
const PAID_EXPORT_TIMESTAMP = new RegExp(
    `^\\s*timestamp\\s*[：:]\\s*(${TIMESTAMP_TOKEN})\\s*$`,
    'iu',
);
const SPEAKER_TURN = /^\s*(.{1,40}?)[：:]\s*([\s\S]*)$/u;
const SEPARATOR_ONLY = /^\s*(?:[-—_=*~·•]{3,}|[.。]{4,})\s*$/u;
const SYSTEM_OR_OOC = /^\s*(?:[\[【(（]?\s*(?:系统|system|ooc|旁白)\s*[\]】)）]?|ooc\s*[：:])/iu;

const ATTACHMENT_MARKERS: Array<{
    pattern: RegExp;
    kind: HistoryAttachmentKind;
}> = [
    { pattern: /^\s*(?:[\[【<](?:图片|图像|image)(?:已省略| omitted)?[\]】>]|图片已省略)\s*$/iu, kind: 'image' },
    { pattern: /^\s*(?:[\[【<](?:语音|音频|voice|audio)(?:已省略| omitted)?[\]】>]|语音已省略)\s*$/iu, kind: 'audio' },
    { pattern: /^\s*(?:[\[【<](?:视频|video)(?:已省略| omitted)?[\]】>]|视频已省略)\s*$/iu, kind: 'video' },
    { pattern: /^\s*(?:[\[【<](?:文件|file)(?:已省略| omitted)?[\]】>]|文件已省略)\s*$/iu, kind: 'file' },
    { pattern: /^\s*[\[【<](?:表情|贴纸|sticker)(?:已省略| omitted)?[\]】>]\s*$/iu, kind: 'sticker' },
];

const cloneBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
    const cloned = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    cloned.set(bytes);
    return cloned;
};

const sha256Hex = async (value: Uint8Array | string): Promise<string> => {
    if (!globalThis.crypto?.subtle) {
        throw new Error('当前环境缺少 Web Crypto，无法为预览生成稳定指纹。');
    }
    const bytes: Uint8Array<ArrayBuffer> = typeof value === 'string'
        ? new TextEncoder().encode(value)
        : cloneBytes(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const inferSourceFormat = (name: string, mimeType = ''): HistorySourceFormat => {
    const normalizedName = name.trim().toLowerCase();
    if (normalizedName.endsWith('.doc')) {
        throw new Error('旧版 .doc 是二进制格式，请先在 Word/WPS 中另存为 .docx 再导入。');
    }
    if (normalizedName.endsWith('.txt') || mimeType === 'text/plain') return 'txt';
    if (
        normalizedName.endsWith('.docx')
        || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) return 'docx';
    throw new Error('目前只接受 .txt 和 .docx；文件不会被上传。');
};

const isValidSpeakerLabel = (value: string): boolean => {
    const label = value.trim();
    if (!label || label.length > 40) return false;
    if (/[/\\\n\r]/u.test(label) || /^(?:https?|file)$/iu.test(label)) return false;
    if (/^\d+(?::\d+)?$/u.test(label)) return false;
    return /[\p{L}\p{N}]/u.test(label);
};

const parseSourceTime = (originalText?: string): HistorySourceTime => {
    if (!originalText) return { precision: 'unknown', confidence: 0 };
    const normalized = originalText.trim();
    const hasClock = /\d{1,2}:\d{2}/u.test(normalized);
    const hasSeconds = /\d{1,2}:\d{2}:\d{2}/u.test(normalized);
    const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(normalized);
    const result: HistorySourceTime = {
        originalText: normalized,
        precision: hasClock ? (hasSeconds ? 'exact' : 'minute') : 'day',
        confidence: 0.96,
    };

    const dateTime = normalized.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/iu,
    );
    if (dateTime) {
        const [, year, month, day, hour, minute, seconds, zone = ''] = dateTime;
        const normalizedZone = zone && !zone.includes(':') && zone !== 'Z'
            ? `${zone.slice(0, 3)}:${zone.slice(3)}`
            : zone;
        result.iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${seconds || '00'}${normalizedZone}`;
    }

    if (hasExplicitZone && result.iso) {
        const epochMs = Date.parse(result.iso);
        if (Number.isFinite(epochMs)) {
            result.epochMs = epochMs;
            result.timezone = result.iso.match(/(?:Z|[+-]\d{2}:?\d{2})$/iu)?.[0];
        }
    }
    return result;
};

const detectAttachment = (content: string): HistoryPreviewAttachment | undefined => {
    const matched = ATTACHMENT_MARKERS.find(candidate => candidate.pattern.test(content));
    return matched
        ? { kind: matched.kind, sourceLabel: content.trim(), available: false }
        : undefined;
};

interface ParsedTurn {
    speakerLabel?: string;
    timestampText?: string;
    content: string;
}

const parsePaidExportTimestamp = (originalText: string): string | undefined => (
    originalText.match(PAID_EXPORT_TIMESTAMP)?.[1]?.trim()
);

const isPaidExportSpeaker = (speakerLabel?: string): boolean => (
    /^(?:assistant|user)$/iu.test(speakerLabel?.trim() || '')
);

const extendLocatorThroughMetadata = (
    row: HistoryPreviewRow,
    metadataUnit: HistorySourceUnit,
): void => {
    const start = row.sourceLocator.start;
    const end = Math.max(
        row.sourceLocator.end ?? start,
        metadataUnit.locator.end ?? metadataUnit.locator.start,
    );
    const sameKind = row.sourceLocator.kind === metadataUnit.locator.kind;
    const label = sameKind && row.sourceLocator.kind === 'line'
        ? `第 ${start}-${end} 行`
        : sameKind && row.sourceLocator.kind === 'paragraph'
            ? `第 ${start}-${end} 段`
            : row.sourceLocator.label;

    row.sourceLocator = {
        ...row.sourceLocator,
        end,
        label,
    };
};

const parseTurn = (originalText: string): ParsedTurn => {
    const paidExportTimestamp = parsePaidExportTimestamp(originalText);
    if (paidExportTimestamp) {
        return { timestampText: paidExportTimestamp, content: '' };
    }

    for (const pattern of [BRACKETED_TURN, PREFIXED_TURN]) {
        const match = originalText.match(pattern);
        if (match && isValidSpeakerLabel(match[2])) {
            return {
                timestampText: match[1].trim(),
                speakerLabel: match[2].trim(),
                content: match[3],
            };
        }
    }

    const speakerMatch = originalText.match(SPEAKER_TURN);
    if (speakerMatch && isValidSpeakerLabel(speakerMatch[1])) {
        return { speakerLabel: speakerMatch[1].trim(), content: speakerMatch[2] };
    }
    return { content: originalText };
};

const normalizeUnit = (
    unit: HistorySourceUnit,
    fileHashPrefix: string,
    bindingDraft: HistoryIdentityBindingDraft,
    previousMeaningfulRowId?: string,
): HistoryPreviewRow => {
    const originalText = unit.text;
    const trimmed = originalText.trim();
    const issues: HistoryPreviewIssueCode[] = [];
    let status: HistoryPreviewRowStatus = 'ready';
    let kind: HistorySourceMessageKind = 'text';
    const parsed = parseTurn(originalText);
    const content = parsed.content.trim();
    const attachment = detectAttachment(content);

    if (!trimmed) {
        issues.push('empty_source_unit');
        status = 'skipped';
    } else if (SEPARATOR_ONLY.test(trimmed)) {
        issues.push('separator_only');
        status = 'skipped';
    } else {
        if (!parsed.speakerLabel) {
            issues.push('missing_speaker');
            if (previousMeaningfulRowId) issues.push('possible_continuation');
            status = 'uncertain';
        }
        if (!content) {
            issues.push('empty_content');
            status = 'uncertain';
        }
        if (attachment) {
            kind = 'attachment_placeholder';
            issues.push('attachment_missing');
            status = 'uncertain';
        }
        if (SYSTEM_OR_OOC.test(parsed.speakerLabel || content)) {
            kind = 'system_note';
            issues.push('system_or_ooc_candidate');
            status = 'uncertain';
        }
    }

    return {
        schemaVersion: HISTORY_IMPORT_PREVIEW_VERSION,
        id: `history-preview-row-${fileHashPrefix}-${unit.sourceOrder}`,
        scope: { ...bindingDraft.scope },
        sourceOrder: unit.sourceOrder,
        sourceLocator: { ...unit.locator },
        originalText,
        content,
        kind,
        status,
        speakerLabel: parsed.speakerLabel,
        sourceTime: parseSourceTime(parsed.timestampText),
        attachment,
        issues,
        previousMeaningfulRowId: previousMeaningfulRowId && !parsed.speakerLabel
            ? previousMeaningfulRowId
            : undefined,
    };
};

const markDuplicates = (rows: HistoryPreviewRow[]): void => {
    const firstByKey = new Map<string, string>();
    rows.forEach(row => {
        if (row.status === 'skipped' || !row.content) return;
        const key = [
            row.speakerLabel?.trim().toLocaleLowerCase() || '',
            row.sourceTime.originalText || '',
            row.content.replace(/\s+/gu, ' ').trim().toLocaleLowerCase(),
        ].join('\n');
        const firstId = firstByKey.get(key);
        if (firstId) {
            row.status = 'duplicate';
            row.issues = [...row.issues.filter(issue => issue !== 'exact_duplicate'), 'exact_duplicate'];
            row.duplicateOfRowId = firstId;
        } else {
            firstByKey.set(key, row.id);
        }
    });
};

export const buildHistoryImportPreview = async (
    input: HistoryPreviewSourceInput,
    options: BuildHistoryImportPreviewOptions = {},
): Promise<HistoryImportPreview> => {
    if (input.bindingDraft.productionWriteAllowed !== false) {
        throw new Error('只允许从无生产写权限的身份草稿创建预览。');
    }
    if (input.bytes.byteLength > MAX_HISTORY_IMPORT_FILE_BYTES) {
        throw new Error('文件超过 64 MiB。为避免小手机内存崩溃，请先拆分后再预览。');
    }

    const materializedRowLimit = options.materializedRowLimit ?? MAX_HISTORY_PREVIEW_ROWS;
    if (
        !Number.isInteger(materializedRowLimit)
        || materializedRowLimit < 1
        || materializedRowLimit > MAX_HISTORY_SOURCE_UNITS
    ) {
        throw new Error(`预览物化上限必须在 1-${MAX_HISTORY_SOURCE_UNITS} 行之间。`);
    }

    const format = inferSourceFormat(input.name, input.mimeType);
    const fileSha256 = await sha256Hex(input.bytes);
    const parsed = format === 'txt'
        ? parseTxtSourceUnits(input.bytes)
        : await parseDocxSourceUnits(input.bytes);
    const allRows: HistoryPreviewRow[] = [];
    let previousMeaningfulRowId: string | undefined;
    let pendingPaidExportRow: HistoryPreviewRow | undefined;

    parsed.units.forEach(unit => {
        const paidExportTimestamp = parsePaidExportTimestamp(unit.text);
        if (paidExportTimestamp && pendingPaidExportRow) {
            pendingPaidExportRow.sourceTime = parseSourceTime(paidExportTimestamp);
            pendingPaidExportRow.originalText = `${pendingPaidExportRow.originalText}\n${unit.text}`;
            extendLocatorThroughMetadata(pendingPaidExportRow, unit);
            pendingPaidExportRow = undefined;
            return;
        }

        const row = normalizeUnit(unit, fileSha256.slice(0, 16), input.bindingDraft, previousMeaningfulRowId);
        allRows.push(row);
        if (paidExportTimestamp) {
            pendingPaidExportRow = undefined;
            return;
        }
        if (row.status === 'skipped' && unit.text.trim()) {
            pendingPaidExportRow = undefined;
            return;
        }
        if (row.status !== 'skipped') {
            previousMeaningfulRowId = row.id;
            pendingPaidExportRow = isPaidExportSpeaker(row.speakerLabel) && Boolean(row.content)
                ? row
                : undefined;
        }
    });
    markDuplicates(allRows);

    const speakerMap = new Map<string, { occurrences: number; exampleRowIds: string[] }>();
    allRows.forEach(row => {
        if (!row.speakerLabel || row.status === 'skipped') return;
        const current = speakerMap.get(row.speakerLabel) || { occurrences: 0, exampleRowIds: [] };
        current.occurrences += 1;
        if (current.exampleRowIds.length < 3) current.exampleRowIds.push(row.id);
        speakerMap.set(row.speakerLabel, current);
    });

    const counts = {
        parsed: allRows.filter(row => row.status !== 'skipped').length,
        accepted: allRows.filter(row => row.status === 'ready').length,
        skipped: allRows.filter(row => row.status === 'skipped').length,
        uncertain: allRows.filter(row => row.status === 'uncertain').length,
        duplicates: allRows.filter(row => row.status === 'duplicate').length,
        committed: 0,
    };
    const truncated = allRows.length > materializedRowLimit;
    const warnings = [...parsed.warnings];
    if (truncated) {
        warnings.push(`页面只物化前 ${materializedRowLimit} 行；总数与说话人统计仍覆盖整个文件。`);
    }

    const fingerprint = await sha256Hex(JSON.stringify({
        parserVersion: HISTORY_IMPORT_PARSER_VERSION,
        sourceSha256: fileSha256,
        scope: input.bindingDraft.scope,
    }));

    return {
        schemaVersion: HISTORY_IMPORT_PREVIEW_VERSION,
        parserVersion: HISTORY_IMPORT_PARSER_VERSION,
        bindingDraftId: input.bindingDraft.id,
        scope: { ...input.bindingDraft.scope },
        sourceFile: {
            name: input.name,
            format,
            sizeBytes: input.bytes.byteLength,
            sha256: fileSha256,
            lastModifiedAt: input.lastModifiedAt,
            rawRetained: false,
        },
        format,
        encoding: parsed.encoding,
        fingerprint,
        counts,
        sourceUnitCount: parsed.units.length,
        totalPreviewRowCount: allRows.length,
        materializedRowCount: Math.min(allRows.length, materializedRowLimit),
        truncated,
        speakerCandidates: [...speakerMap.entries()]
            .map(([label, detail]) => ({ label, ...detail }))
            .sort((left, right) => (
                right.occurrences - left.occurrences || left.label.localeCompare(right.label, 'zh-CN')
            )),
        rows: allRows.slice(0, materializedRowLimit),
        warnings,
        rawRetained: false,
        persistence: 'memory_only',
        productionWriteAllowed: false,
    };
};

export const buildHistoryImportFullPreview = async (
    input: HistoryPreviewSourceInput,
): Promise<HistoryImportPreview> => buildHistoryImportPreview(input, {
    materializedRowLimit: MAX_HISTORY_SOURCE_UNITS,
});
