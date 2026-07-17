import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';

const outputDirectory = resolve(process.argv[2] || 'output/playwright/history-import-preview');
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

await mkdir(outputDirectory, { recursive: true });
const txtPath = resolve(outputDirectory, 'synthetic-history.txt');
const docxPath = resolve(outputDirectory, 'synthetic-history.docx');
const fastImportDocxPath = resolve(outputDirectory, 'synthetic-fast-import.docx');
await writeFile(txtPath, lines.join('\n'), 'utf8');
await writeFile(docxPath, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));

const fastImportZip = new JSZip();
fastImportZip.file('[Content_Types].xml', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '</Types>',
].join(''));
fastImportZip.file('word/document.xml', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
    paragraphXml([
        '这一段暂时没有说话人，但仍然应该可见、可检索。',
        'assistant:第一句仍在同一个 Word 段落里',
        '这一行只是正文换行，不应变成无名字卡片。',
        'timestamp:2025-07-16 12:04:35',
        'user:我也在同一个段落里',
        'timestamp:2025-07-16 12:07:24',
        'assistant:我会保留它，正文里的 assistant: 字样也不会误切。',
        'timestamp:2025-07-16 12:07:25',
    ].join('\n')),
    '<w:p/>',
    '<w:sectPr/></w:body></w:document>',
].join(''));
await writeFile(
    fastImportDocxPath,
    await fastImportZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
);

console.log(`history preview browser fixtures ready: ${txtPath} ${docxPath} ${fastImportDocxPath}`);
