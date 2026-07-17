import type {
    HistoryPreviewEncoding,
    HistorySourceUnit,
} from '../../../domain/historyImport/preview';

export const MAX_HISTORY_SOURCE_UNITS = 100_000;

export interface ParsedTextSource {
    encoding: HistoryPreviewEncoding;
    units: HistorySourceUnit[];
    warnings: string[];
}

const decodeFatal = (label: string, bytes: Uint8Array): string => (
    new TextDecoder(label, { fatal: true }).decode(bytes)
);

const decodeUtf16Be = (bytes: Uint8Array): string => {
    const evenLength = bytes.byteLength - (bytes.byteLength % 2);
    const swapped = new Uint8Array(evenLength);
    for (let index = 0; index < evenLength; index += 2) {
        swapped[index] = bytes[index + 1];
        swapped[index + 1] = bytes[index];
    }
    return decodeFatal('utf-16le', swapped);
};

const decodeTxt = (bytes: Uint8Array): {
    text: string;
    encoding: HistoryPreviewEncoding;
    warnings: string[];
} => {
    if (bytes.byteLength === 0) {
        throw new Error('这个 TXT 是空的，没有可以预览的内容。');
    }

    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return {
            text: decodeFatal('utf-8', bytes.subarray(3)),
            encoding: 'utf-8-bom',
            warnings: [],
        };
    }
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return {
            text: decodeFatal('utf-16le', bytes.subarray(2)),
            encoding: 'utf-16le',
            warnings: [],
        };
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return {
            text: decodeUtf16Be(bytes.subarray(2)),
            encoding: 'utf-16be',
            warnings: [],
        };
    }

    try {
        return { text: decodeFatal('utf-8', bytes), encoding: 'utf-8', warnings: [] };
    } catch {
        try {
            return {
                text: decodeFatal('gb18030', bytes),
                encoding: 'gb18030',
                warnings: ['TXT 不是 UTF-8，已按 GB18030 中文编码读取；请在预览里确认标点和名字。'],
            };
        } catch {
            throw new Error('无法可靠识别 TXT 编码。请另存为 UTF-8、UTF-16 或 GB18030 后再试。');
        }
    }
};

export const parseTxtSourceUnits = (bytes: Uint8Array): ParsedTextSource => {
    const decoded = decodeTxt(bytes);
    if ((decoded.text.match(/\u0000/g)?.length || 0) > Math.max(2, decoded.text.length * 0.01)) {
        throw new Error('TXT 中包含过多空字符，可能不是文本文件或编码选择错误。');
    }

    const lines = decoded.text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > MAX_HISTORY_SOURCE_UNITS) {
        throw new Error(`TXT 超过 ${MAX_HISTORY_SOURCE_UNITS.toLocaleString('en-US')} 行，请先拆分后再预览。`);
    }

    return {
        encoding: decoded.encoding,
        warnings: decoded.warnings,
        units: lines.map((text, index) => ({
            sourceOrder: index,
            locator: {
                kind: 'line',
                start: index + 1,
                end: index + 1,
                label: `第 ${index + 1} 行`,
            },
            text,
        })),
    };
};
