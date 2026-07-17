import JSZip from 'jszip';
import type { HistorySourceUnit } from '../../../domain/historyImport/preview';
import { MAX_HISTORY_SOURCE_UNITS } from './txt.ts';

export const MAX_HISTORY_DOCX_ENTRIES = 2_048;
export const MAX_HISTORY_DOCX_XML_BYTES = 128 * 1024 * 1024;

export interface ParsedDocxSource {
    encoding: 'docx-xml';
    units: HistorySourceUnit[];
    warnings: string[];
}

const decodeXmlText = (value: string): string => value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, digits: string) => String.fromCodePoint(parseInt(digits, 16)));

const localTagName = (tag: string): string => {
    const match = tag.match(/^<\/?\s*([\w:.-]+)/);
    return match?.[1]?.split(':').pop()?.toLowerCase() || '';
};

const sourceUnitsFromDocumentXml = (xml: string): HistorySourceUnit[] => {
    const units: HistorySourceUnit[] = [];
    const tokens = xml.match(/<[^>]+>|[^<]+/g) || [];
    let paragraphText: string | null = null;
    let paragraphLocator: HistorySourceUnit['locator'] | null = null;
    let captureText = false;
    let tableDepth = 0;
    let tableNumber = 0;
    let rowNumber = 0;
    let cellNumber = 0;
    let paragraphNumber = 0;

    const finishParagraph = (): void => {
        if (paragraphText !== null && paragraphLocator) {
            units.push({
                sourceOrder: units.length,
                locator: paragraphLocator,
                text: paragraphText,
            });
            if (units.length > MAX_HISTORY_SOURCE_UNITS) {
                throw new Error(`DOCX 超过 ${MAX_HISTORY_SOURCE_UNITS.toLocaleString('en-US')} 个段落/单元格，请先拆分后再预览。`);
            }
        }
        paragraphText = null;
        paragraphLocator = null;
        captureText = false;
    };

    for (const token of tokens) {
        if (!token.startsWith('<')) {
            if (captureText && paragraphText !== null) {
                paragraphText += decodeXmlText(token);
            }
            continue;
        }

        const tagName = localTagName(token);
        const closing = /^<\//.test(token);
        const selfClosing = /\/\s*>$/.test(token);

        if (!closing && tagName === 'tbl') {
            tableDepth += 1;
            tableNumber += 1;
            rowNumber = 0;
            cellNumber = 0;
            continue;
        }
        if (closing && tagName === 'tbl') {
            tableDepth = Math.max(0, tableDepth - 1);
            continue;
        }
        if (!closing && tagName === 'tr') {
            rowNumber += 1;
            cellNumber = 0;
            continue;
        }
        if (!closing && tagName === 'tc') {
            cellNumber += 1;
            continue;
        }
        if (!closing && tagName === 'p') {
            paragraphNumber += 1;
            paragraphText = '';
            paragraphLocator = tableDepth > 0
                ? {
                    kind: 'table_cell',
                    start: paragraphNumber,
                    end: paragraphNumber,
                    label: `表格 ${tableNumber} · 行 ${rowNumber || 1} · 列 ${cellNumber || 1}`,
                }
                : {
                    kind: 'paragraph',
                    start: paragraphNumber,
                    end: paragraphNumber,
                    label: `第 ${paragraphNumber} 段`,
                };
            if (selfClosing) finishParagraph();
            continue;
        }
        if (closing && tagName === 'p') {
            finishParagraph();
            continue;
        }
        if (!closing && tagName === 't') {
            captureText = true;
            if (selfClosing) captureText = false;
            continue;
        }
        if (closing && tagName === 't') {
            captureText = false;
            continue;
        }
        if (!closing && paragraphText !== null && (tagName === 'br' || tagName === 'cr')) {
            paragraphText += '\n';
            continue;
        }
        if (!closing && paragraphText !== null && tagName === 'tab') {
            paragraphText += '\t';
            continue;
        }
        if (!closing && paragraphText !== null && tagName === 'nobreakhyphen') {
            paragraphText += '-';
        }
    }

    if (paragraphText !== null) {
        throw new Error('DOCX 的 document.xml 段落结构不完整，无法安全预览。');
    }
    if (units.length === 0) {
        throw new Error('这个 DOCX 没有可读取的正文段落或表格内容。');
    }
    return units;
};

export const parseDocxSourceUnits = async (bytes: Uint8Array): Promise<ParsedDocxSource> => {
    if (bytes.byteLength === 0) {
        throw new Error('这个 DOCX 是空的，没有可以预览的内容。');
    }

    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    } catch {
        throw new Error('无法打开 DOCX。文件可能损坏、加密，或并不是真正的 .docx 文件。');
    }

    const entries = Object.keys(zip.files);
    if (entries.length > MAX_HISTORY_DOCX_ENTRIES) {
        throw new Error(`DOCX 内部文件超过 ${MAX_HISTORY_DOCX_ENTRIES} 个，已为防止异常解压而停止。`);
    }
    if (!zip.file('[Content_Types].xml')) {
        throw new Error('DOCX 缺少 [Content_Types].xml，可能不是标准 Word 文档。');
    }

    const documentEntry = zip.file('word/document.xml');
    if (!documentEntry) {
        throw new Error('DOCX 缺少 word/document.xml，无法读取正文。');
    }

    const declaredSize = (documentEntry as unknown as {
        _data?: { uncompressedSize?: number };
    })._data?.uncompressedSize;
    if (declaredSize && declaredSize > MAX_HISTORY_DOCX_XML_BYTES) {
        throw new Error('DOCX 正文解压后超过 128 MiB，请先拆分文档后再预览。');
    }

    const documentBytes = await documentEntry.async('uint8array');
    if (documentBytes.byteLength > MAX_HISTORY_DOCX_XML_BYTES) {
        throw new Error('DOCX 正文解压后超过 128 MiB，请先拆分文档后再预览。');
    }

    let xml: string;
    try {
        xml = new TextDecoder('utf-8', { fatal: true }).decode(documentBytes);
    } catch {
        throw new Error('DOCX 正文 XML 不是有效的 UTF-8，无法安全预览。');
    }

    return {
        encoding: 'docx-xml',
        units: sourceUnitsFromDocumentXml(xml),
        warnings: [],
    };
};
