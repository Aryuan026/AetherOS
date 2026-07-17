import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import { buildHistoryImportPreview } from '../utils/historyImport/parsers/sourcePreview.ts';

const bindingDraft = buildHistoryIdentityBindingDraft({
    draftSeed: 'preview-fixture-001',
    mask: {
        id: 'mask-preview',
        label: '预览面具',
        progressBundleId: 'progress-preview',
    },
    character: { id: 'char-preview', label: '糯米' },
});

const lines = [
    '[2024-05-01T08:30:00+08:00] 阿鸢：早上好',
    '[2024-05-01 08:31] 糯米: 我在这里',
    '这是一行可能的续行',
    '---',
    '阿鸢：[图片]',
    '[OOC]：先暂停角色扮演',
    '[2024-05-01T08:30:00+08:00] 阿鸢：早上好',
];

const escapeXml = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const paragraphXml = (value: string): string => (
    `<w:p><w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`
);

const createSyntheticDocx = async (): Promise<Uint8Array> => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '</Types>',
    ].join(''));
    zip.file('word/document.xml', [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
        paragraphXml(lines[0]),
        paragraphXml(lines[1]),
        '<w:tbl><w:tr><w:tc>',
        paragraphXml(lines[2]),
        '</w:tc></w:tr></w:tbl>',
        ...lines.slice(3).map(paragraphXml),
        '<w:sectPr/></w:body></w:document>',
    ].join(''));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};

const createParagraphOnlyDocx = async (
    paragraphs: string[],
    trailingBodyXml = '',
): Promise<Uint8Array> => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '</Types>',
    ].join(''));
    zip.file('word/document.xml', [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
        ...paragraphs.map(paragraphXml),
        trailingBodyXml,
        '<w:sectPr/></w:body></w:document>',
    ].join(''));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};

const txtBytes = new TextEncoder().encode(lines.join('\n'));
const docxBytes = await createSyntheticDocx();

const txtPreview = await buildHistoryImportPreview({
    name: 'synthetic-history.txt',
    mimeType: 'text/plain',
    bytes: txtBytes,
    bindingDraft,
});
const docxPreview = await buildHistoryImportPreview({
    name: 'synthetic-history.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: docxBytes,
    bindingDraft,
});

const normalizedSignature = (preview: typeof txtPreview) => preview.rows.map(row => ({
    sourceOrder: row.sourceOrder,
    originalText: row.originalText,
    content: row.content,
    speakerLabel: row.speakerLabel,
    time: row.sourceTime.originalText,
    precision: row.sourceTime.precision,
    kind: row.kind,
    status: row.status,
    issues: row.issues,
}));

assert.equal(txtPreview.format, 'txt');
assert.equal(txtPreview.encoding, 'utf-8');
assert.equal(docxPreview.format, 'docx');
assert.equal(docxPreview.encoding, 'docx-xml');
assert.deepEqual(normalizedSignature(docxPreview), normalizedSignature(txtPreview));
assert.equal(docxPreview.rows[2].sourceLocator.kind, 'table_cell');
assert.match(docxPreview.rows[2].sourceLocator.label || '', /表格 1/);
assert.equal(txtPreview.rows[0].sourceLocator.kind, 'line');
assert.equal(txtPreview.rows[0].sourceTime.iso, '2024-05-01T08:30:00+08:00');
assert.equal(txtPreview.rows[0].sourceTime.timezone, '+08:00');
assert.equal(txtPreview.rows[2].status, 'uncertain');
assert.ok(txtPreview.rows[2].issues.includes('possible_continuation'));
assert.equal(txtPreview.rows[3].status, 'skipped');
assert.equal(txtPreview.rows[4].kind, 'attachment_placeholder');
assert.equal(txtPreview.rows[4].attachment?.available, false);
assert.equal(txtPreview.rows[5].kind, 'system_note');
assert.equal(txtPreview.rows[6].status, 'duplicate');
assert.equal(txtPreview.counts.committed, 0);
assert.equal(txtPreview.rawRetained, false);
assert.equal(txtPreview.persistence, 'memory_only');
assert.equal(txtPreview.productionWriteAllowed, false);

const paidExportLines = [
    'assistant:（把一张空白便签推到桌边）今天想先整理哪一段回忆？',
    'timestamp:2025-07-16 12:04:35',
    '',
    'user：先从我们第一次一起看雨说起吧。',
    'timestamp：2025-07-16 12:07:24',
    '',
    'assistant:好，我会保留原来的顺序，也把不确定的地方留给你确认。',
    'timestamp:2025-07-16 12:07:25',
];
const paidTxtPreview = await buildHistoryImportPreview({
    name: 'synthetic-paid-export.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode(paidExportLines.join('\n')),
    bindingDraft,
});
const paidDocxPreview = await buildHistoryImportPreview({
    name: 'synthetic-paid-export.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: await createParagraphOnlyDocx(paidExportLines),
    bindingDraft,
});
const paidMeaningfulRows = paidDocxPreview.rows.filter(row => row.status !== 'skipped');

assert.deepEqual(normalizedSignature(paidDocxPreview), normalizedSignature(paidTxtPreview));
assert.equal(paidDocxPreview.parserVersion, 'history-preview-v3');
assert.equal(paidDocxPreview.sourceUnitCount, 8);
assert.equal(paidDocxPreview.totalPreviewRowCount, 5);
assert.equal(paidDocxPreview.counts.accepted, 3);
assert.equal(paidDocxPreview.counts.uncertain, 0);
assert.equal(paidDocxPreview.counts.skipped, 2);
assert.deepEqual(
    paidDocxPreview.speakerCandidates.map(candidate => [candidate.label, candidate.occurrences]),
    [['assistant', 2], ['user', 1]],
);
assert.deepEqual(
    paidMeaningfulRows.map(row => [row.speakerLabel, row.sourceTime.originalText, row.sourceTime.precision]),
    [
        ['assistant', '2025-07-16 12:04:35', 'exact'],
        ['user', '2025-07-16 12:07:24', 'exact'],
        ['assistant', '2025-07-16 12:07:25', 'exact'],
    ],
);
assert.equal(paidMeaningfulRows[0].sourceTime.iso, '2025-07-16T12:04:35');
assert.equal(paidMeaningfulRows[0].sourceTime.epochMs, undefined);
assert.match(paidMeaningfulRows[0].originalText, /timestamp:2025-07-16 12:04:35/u);
assert.equal(paidMeaningfulRows[0].sourceLocator.start, 1);
assert.equal(paidMeaningfulRows[0].sourceLocator.end, 2);
assert.equal(paidMeaningfulRows[0].sourceLocator.label, '第 1-2 段');
assert.equal(paidDocxPreview.speakerCandidates.some(candidate => candidate.label === 'timestamp'), false);

const oneParagraphExport = [
    'assistant:第一句仍在同一个 Word 段落里',
    '这一行只是角色正文的换行，不应该单独变成无名字消息。',
    'timestamp:2025-07-16 12:04:35',
    '',
    'user：我也在同一个段落里',
    'timestamp：2025-07-16 12:07:24',
    'assistant:正文里提到 assistant: 这个字样不会被错误拆开。',
    'timestamp:2025-07-16 12:07:25',
].join('\n');
const oneParagraphPreview = await buildHistoryImportPreview({
    name: 'synthetic-one-paragraph-paid-export.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: await createParagraphOnlyDocx([oneParagraphExport]),
    bindingDraft,
});
assert.equal(oneParagraphPreview.sourceUnitCount, 1);
assert.equal(oneParagraphPreview.totalPreviewRowCount, 3);
assert.equal(oneParagraphPreview.counts.accepted, 3);
assert.equal(oneParagraphPreview.counts.uncertain, 0);
assert.deepEqual(
    oneParagraphPreview.rows.map(row => [row.speakerLabel, row.sourceTime.originalText]),
    [
        ['assistant', '2025-07-16 12:04:35'],
        ['user', '2025-07-16 12:07:24'],
        ['assistant', '2025-07-16 12:07:25'],
    ],
);
assert.match(oneParagraphPreview.rows[0].content, /只是角色正文的换行/u);
assert.match(oneParagraphPreview.rows[2].content, /assistant: 这个字样/u);
assert.match(oneParagraphPreview.rows[1].sourceLocator.label || '', /片段 2/u);

const wpsSelfClosingPreview = await buildHistoryImportPreview({
    name: 'synthetic-wps-self-closing-paragraph.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: await createParagraphOnlyDocx(paidExportLines, '<w:p/>'),
    bindingDraft,
});
const wpsMeaningfulRows = wpsSelfClosingPreview.rows.filter(row => row.status !== 'skipped');
assert.deepEqual(
    wpsMeaningfulRows.map(row => [row.speakerLabel, row.content, row.sourceTime.originalText]),
    paidMeaningfulRows.map(row => [row.speakerLabel, row.content, row.sourceTime.originalText]),
);
assert.equal(wpsSelfClosingPreview.sourceUnitCount, 9);
assert.equal(wpsSelfClosingPreview.totalPreviewRowCount, 6);
assert.equal(wpsSelfClosingPreview.counts.skipped, 3);
assert.ok(
    wpsSelfClosingPreview.rows[wpsSelfClosingPreview.rows.length - 1]?.issues.includes('empty_source_unit'),
);

const orphanTimestampPreview = await buildHistoryImportPreview({
    name: 'synthetic-orphan-timestamp.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode('timestamp:2025-07-16 12:04:35\nuser:仍然保留这条消息'),
    bindingDraft,
});
assert.equal(orphanTimestampPreview.rows[0].status, 'skipped');
assert.ok(orphanTimestampPreview.rows[0].issues.includes('empty_content'));
assert.equal(orphanTimestampPreview.rows[0].speakerLabel, undefined);
assert.equal(orphanTimestampPreview.speakerCandidates.some(candidate => candidate.label === 'timestamp'), false);

const separatedTimestampPreview = await buildHistoryImportPreview({
    name: 'synthetic-separated-timestamp.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode('assistant:先保留正文\n---\ntimestamp:2025-07-16 12:04:35'),
    bindingDraft,
});
assert.equal(separatedTimestampPreview.rows[0].sourceTime.precision, 'unknown');
assert.equal(separatedTimestampPreview.rows[2].status, 'skipped');

for (let attempt = 0; attempt < 3; attempt += 1) {
    const repeated = await buildHistoryImportPreview({
        name: 'synthetic-history.docx',
        bytes: docxBytes,
        bindingDraft,
    });
    assert.equal(repeated.fingerprint, docxPreview.fingerprint);
    assert.deepEqual(repeated.rows, docxPreview.rows);
}

const utf16Text = '阿鸢：UTF16 也能回家';
const utf16Bytes = new Uint8Array(2 + utf16Text.length * 2);
utf16Bytes[0] = 0xff;
utf16Bytes[1] = 0xfe;
const utf16View = new DataView(utf16Bytes.buffer);
for (let index = 0; index < utf16Text.length; index += 1) {
    utf16View.setUint16(2 + index * 2, utf16Text.charCodeAt(index), true);
}
const utf16Preview = await buildHistoryImportPreview({
    name: 'utf16-history.txt',
    bytes: utf16Bytes,
    bindingDraft,
});
assert.equal(utf16Preview.encoding, 'utf-16le');
assert.equal(utf16Preview.rows[0].speakerLabel, '阿鸢');
assert.equal(utf16Preview.rows[0].content, 'UTF16 也能回家');

await assert.rejects(
    buildHistoryImportPreview({
        name: 'legacy-history.doc',
        bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]),
        bindingDraft,
    }),
    /另存为 \.docx/,
);
await assert.rejects(
    buildHistoryImportPreview({
        name: 'broken.docx',
        bytes: new TextEncoder().encode('not a zip'),
        bindingDraft,
    }),
    /无法打开 DOCX/,
);
await assert.rejects(
    buildHistoryImportPreview({
        name: 'truncated-document-xml.docx',
        bytes: await createParagraphOnlyDocx(['user:正文仍然完整'], '<w:p>'),
        bindingDraft,
    }),
    /document\.xml 段落结构不完整/,
);

const intakeSource = readFileSync(
    new URL('../components/history-import/HistorySourceIntake.tsx', import.meta.url),
    'utf8',
);
for (const forbidden of [
    'fetch(',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'updateUserProfile',
    'updateCharacter',
]) {
    assert.equal(intakeSource.includes(forbidden), false, `preview UI must remain local/read-only: ${forbidden}`);
}
assert.ok(intakeSource.includes('.txt,.docx'));
assert.ok(intakeSource.includes('type="file"'));
assert.ok(intakeSource.includes('workspace.counts.parsed'));

console.log(
    `history TXT/DOCX preview OK: rows=${txtPreview.totalPreviewRowCount} ready=${txtPreview.counts.accepted} uncertain=${txtPreview.counts.uncertain} duplicate=${txtPreview.counts.duplicates} paid=${paidMeaningfulRows.length} docxTable=${docxPreview.rows[2].sourceLocator.kind}`,
);
