import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    buildDailyArchiveDocument,
    dailyArchiveMessageFromHistory,
    dailyArchiveMessageFromLive,
    dateKeyForHistoryMessage,
} from '../domain/dailyArchive/contract.ts';
import {
    chunkDailyArchiveDocument,
    hydrateDailyArchiveDocument,
    readDailyArchivePageFromChunks,
    selectDailyArchiveChunksForPage,
} from '../domain/dailyArchive/chunking.ts';
import { searchDailyArchiveChunk } from '../domain/dailyArchive/search.ts';
import {
    buildClippingVoiceAnalysisPrompt,
    createConversationClipping,
} from '../domain/dailyArchive/clippings.ts';
import type { HistorySourceMessage } from '../domain/historyImport/types.ts';
import {
    buildDailyArchiveBackupFiles,
    verifyDailyArchiveBackupFiles,
} from '../utils/dailyArchive/storage.ts';

const scope = {
    progressBundleId: 'progress-daily-fixture',
    personaMaskId: 'mask-daily-fixture',
    charId: 'char-daily-fixture',
};
const historyBase = {
    schemaVersion: 1,
    batchId: 'batch-daily-fixture',
    scope,
    kind: 'text',
    attachments: [],
    importedAt: 1_752_646_000_000,
    sourceLocator: { kind: 'paragraph', start: 1 },
    sourceFingerprint: 'source-daily',
    normalizedFingerprint: 'normalized-daily',
    sourceMode: 'relationship_chat',
    continuity: 'relationship',
    knowledge: 'unclassified',
    deliveryPolicy: {
        sensitivity: 'normal',
        allowedSurfaces: [],
        recallPolicy: 'never',
        initiativePolicy: 'never',
        archiveSearchable: true,
    },
    status: 'active',
    createdAt: 1_752_646_000_000,
    updatedAt: 1_752_646_000_000,
    revision: 1,
} satisfies Omit<HistorySourceMessage, 'id' | 'speakerRole' | 'content' | 'sourceOrder' | 'sourceTime'>;

const importedUser: HistorySourceMessage = {
    ...historyBase,
    id: 'history-daily-user',
    speakerRole: 'user',
    content: '今天下雨了。',
    sourceOrder: 1,
    sourceTime: {
        originalText: '2025-07-16 12:04:35',
        iso: '2025-07-16T12:04:35',
        precision: 'exact',
        confidence: 0.96,
    },
};
const importedCharacter: HistorySourceMessage = {
    ...historyBase,
    id: 'history-daily-character',
    speakerRole: 'character',
    content: '那就慢一点回家。',
    sourceOrder: 2,
    sourceTime: {
        originalText: '2025-07-16 12:04:36',
        iso: '2025-07-16T12:04:36',
        precision: 'exact',
        confidence: 0.96,
    },
};
const undated: HistorySourceMessage = {
    ...historyBase,
    id: 'history-daily-undated',
    speakerRole: 'user',
    content: '这段原文没有日期。',
    sourceOrder: 3,
    sourceTime: { precision: 'unknown', confidence: 0 },
};

assert.equal(dateKeyForHistoryMessage(importedUser), '2025-07-16');
assert.equal(dateKeyForHistoryMessage(undated), undefined);

const importedMessages = [importedUser, importedCharacter].map(dailyArchiveMessageFromHistory);
const liveMessage = dailyArchiveMessageFromLive({
    scope,
    message: {
        id: 44,
        charId: scope.charId,
        role: 'user',
        type: 'text',
        content: '我们从这里继续。',
        timestamp: new Date(2025, 6, 16, 13, 30, 0).getTime(),
    },
});
assert.equal(liveMessage.time.dateKey, '2025-07-16');
assert.equal(liveMessage.source, 'live_chat');

const revisedLiveMessage = dailyArchiveMessageFromLive({
    scope,
    status: 'tombstoned',
    message: {
        id: 44,
        charId: scope.charId,
        role: 'user',
        type: 'text',
        content: '我们从这里继续。',
        timestamp: new Date(2025, 6, 16, 13, 30, 0).getTime(),
        metadata: { dailyArchiveRevision: 2 },
    },
});
assert.equal(revisedLiveMessage.revision, 2);
assert.equal(revisedLiveMessage.status, 'tombstoned');

const document = buildDailyArchiveDocument({
    scope,
    dateKey: '2025-07-16',
    messages: [...importedMessages, liveMessage],
    now: 1_752_646_000_000,
});
assert.equal(document.messageCount, 3);
assert.deepEqual(document.sourceKinds, ['history_import', 'live_chat']);
assert.equal(document.messages[0].sourceOrder, 1);

const repeated = buildDailyArchiveDocument({
    scope,
    dateKey: '2025-07-16',
    messages: importedMessages,
    previous: document,
    now: 1_752_646_000_100,
});
assert.equal(repeated.messageCount, 3, 'stable ids must prevent duplicate daily rows');

const clipping = createConversationClipping({
    scope,
    sourceDocument: document,
    selectedMessageIds: [importedMessages[0].id, importedMessages[1].id],
    id: 'conversation-clipping:fixture',
    now: 1_752_646_000_150,
});
assert.equal(clipping.messageCount, 2);
assert.equal(clipping.characterMessageCount, 1);
assert.equal(clipping.status, 'source_only');
assert.equal(clipping.messages[1].content, '那就慢一点回家。');
const voicePrompt = buildClippingVoiceAnalysisPrompt({
    clippings: [clipping],
    characterName: '糯米',
    userName: '阿鸢',
});
assert.equal(voicePrompt.clippingCount, 1);
assert.equal(voicePrompt.messageCount, 2);
assert.ok(voicePrompt.systemPrompt.includes('用户原句仅用于理解回应场景'));
assert.ok(voicePrompt.systemPrompt.includes('待人工确认'));
assert.ok(voicePrompt.userPrompt.includes('[source:'));
assert.throws(() => createConversationClipping({
    scope,
    sourceDocument: document,
    selectedMessageIds: [importedMessages[0].id],
}), /至少需要一句角色原话/);

const longDayMessages = Array.from({ length: 3_000 }, (_, index) => ({
    ...importedMessages[index % importedMessages.length],
    id: `history:long-day-${index}`,
    sourceRecordId: `long-day-${index}`,
    sourceOrder: index,
    content: `第 ${index + 1} 条长日对话。`,
}));
const longDay = buildDailyArchiveDocument({
    scope,
    dateKey: '2025-07-17',
    messages: longDayMessages,
    now: 1_752_646_000_175,
});
assert.equal(longDay.messageCount, 3_000, 'a chat-heavy day must remain complete in the daily JSON contract');
const chunkedLongDay = chunkDailyArchiveDocument(longDay);
assert.equal(chunkedLongDay.manifest.messageCount, 3_000);
assert.equal(chunkedLongDay.manifest.chunkCount, 15, '3,000 rows must split into bounded 200-row records');
assert.ok(chunkedLongDay.chunks.every(chunk => chunk.messages.length <= 200));
assert.ok(!('messages' in chunkedLongDay.manifest), 'the day manifest must not contain message bodies');
const oneChunkSelection = selectDailyArchiveChunksForPage({
    manifest: chunkedLongDay.manifest,
    offset: 1_520,
    limit: 80,
});
assert.equal(oneChunkSelection.length, 1, 'an aligned 80-row viewport should touch one physical chunk');
const oneChunkPage = readDailyArchivePageFromChunks({
    manifest: chunkedLongDay.manifest,
    chunks: oneChunkSelection.map(selection => chunkedLongDay.chunks[selection.descriptor.chunkIndex]),
    offset: 1_520,
    limit: 80,
});
assert.equal(oneChunkPage.messages.length, 80);
assert.equal(oneChunkPage.loadedChunkCount, 1);
assert.equal(oneChunkPage.messages[0].id, longDay.messages[1_520].id);
assert.equal(oneChunkPage.messages[79].id, longDay.messages[1_599].id);
const crossingSelection = selectDailyArchiveChunksForPage({
    manifest: chunkedLongDay.manifest,
    offset: 1_590,
    limit: 80,
});
assert.equal(crossingSelection.length, 2, 'a page crossing a chunk boundary may touch only the two neighbors');
const keywordChunkIndex = chunkedLongDay.chunks.findIndex(chunk => (
    chunk.messages.some(message => message.content.includes('第 1599 条'))
));
assert.ok(keywordChunkIndex >= 0);
const keywordMatch = searchDailyArchiveChunk({
    chunk: chunkedLongDay.chunks[keywordChunkIndex],
    query: ' 第 1599 条 ',
    activeOffset: keywordChunkIndex * 200,
});
assert.equal(keywordMatch.scannedMessageCount, 200);
assert.equal(keywordMatch.matches.length, 1);
assert.equal(keywordMatch.matches[0].message.id, 'history:long-day-1598');
assert.equal(
    longDay.messages[keywordMatch.matches[0].messageOffset].id,
    keywordMatch.matches[0].message.id,
);
assert.equal(hydrateDailyArchiveDocument(chunkedLongDay).messageCount, 3_000);

const undatedDocument = buildDailyArchiveDocument({
    scope,
    undatedKey: undated.batchId,
    messages: [dailyArchiveMessageFromHistory(undated)],
    now: 1_752_646_000_000,
});
assert.equal(undatedDocument.dateKey, undefined);
assert.equal(undatedDocument.messageCount, 1);

const backup = await buildDailyArchiveBackupFiles({
    documents: [document, undatedDocument],
    generatedAt: 1_752_646_000_200,
});
assert.equal(backup.manifest.documentCount, 2);
assert.equal(backup.manifest.messageCount, 4);
assert.ok(backup.files.some(file => file.path.endsWith('/2025/07/2025-07-16.json')));
assert.ok(backup.files.some(file => file.path.includes('/undated/')));
const restored = await verifyDailyArchiveBackupFiles(backup);
assert.deepEqual(restored.map(item => item.id).sort(), [document.id, undatedDocument.id].sort());

const tampered = backup.files.map((file, index) => (
    index === 0 ? { ...file, json: file.json.replace('今天下雨了。', '内容被改过。') } : file
));
await assert.rejects(
    () => verifyDailyArchiveBackupFiles({ manifest: backup.manifest, files: tampered }),
    /校验失败/,
);

const appSource = readFileSync(new URL('../apps/DailyArchiveApp.tsx', import.meta.url), 'utf8');
for (const required of [
    '对话日历',
    '未标日期',
    'listDailyArchiveMonth',
    '选择要看的关系',
    'switchUserPersonaMask',
    'setActiveCharacterId',
    'DailyArchiveReader',
    'ConversationClippingLibrary',
    'createConversationClipping',
    'getDailyArchiveManifest',
    'readDailyArchiveMessagePage',
    'readUndatedDailyArchiveMessagePage',
    'searchDailyArchiveMessages',
    'openSearchHit',
]) {
    assert.ok(appSource.includes(required));
}
const readerSource = readFileSync(new URL('../components/daily-archive/DailyArchiveReader.tsx', import.meta.url), 'utf8');
for (const required of [
    'daily-archive-reader',
    'daily-archive-virtual-scroll',
    'overflow-y-auto',
    '存入剪藏库',
    '每份最多 80 条',
    '当天对话',
    'MAX_CACHED_PAGES',
    'data-focus-message',
]) {
    assert.ok(readerSource.includes(required));
}
const clippingLibrarySource = readFileSync(new URL('../components/daily-archive/ConversationClippingLibrary.tsx', import.meta.url), 'utf8');
assert.ok(clippingLibrarySource.includes('搜索全部聊天记录'));
assert.ok(clippingLibrarySource.includes('daily-archive-search-results'));
assert.ok(!clippingLibrarySource.includes('这里只收你亲手夹出的原句'));
assert.ok(!clippingLibrarySource.includes('暂时不会变成人设、记忆或聊天提示词'));
assert.ok(!clippingLibrarySource.includes('仅素材'));
const constantsSource = readFileSync(new URL('../constants.tsx', import.meta.url), 'utf8');
const companionGroup = constantsSource.slice(
    constantsSource.indexOf("id: 'companion'"),
    constantsSource.indexOf("id: 'story'"),
);
const studioGroup = constantsSource.slice(constantsSource.indexOf("id: 'studio'"));
assert.ok(!companionGroup.includes('AppID.DailyArchive'));
assert.ok(studioGroup.indexOf('AppID.DailyArchive') > studioGroup.indexOf('AppID.HistoryImport'));
const dbSource = readFileSync(new URL('../utils/db.ts', import.meta.url), 'utf8');
assert.ok(dbSource.includes('archiveLiveMessage'));
const backupSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
for (const required of [
    'buildDailyArchiveBackupFiles',
    'verifyDailyArchiveBackupFiles',
    'deleteDailyArchiveDatabase',
    'listAllConversationClippings',
    'replaceConversationClippings',
    'version: 5',
]) {
    assert.ok(backupSource.includes(required));
}
const dailyStorageSource = readFileSync(new URL('../utils/dailyArchive/storage.ts', import.meta.url), 'utf8');
for (const required of [
    'DAILY_ARCHIVE_DB_VERSION = 3',
    'daily_archive_manifests',
    'daily_archive_chunks',
    'daily_archive_message_index',
    'dailyArchiveMessageIndexId',
    'ensureChunkedManifest',
    'persistIncrementalChunks',
    'searchDailyArchiveMessages',
]) {
    assert.ok(dailyStorageSource.includes(required));
}

console.log(`daily archive contract OK: days=1 undated=1 messages=${backup.manifest.messageCount} chunks=${chunkedLongDay.manifest.chunkCount} files=${backup.manifest.files.length}`);
