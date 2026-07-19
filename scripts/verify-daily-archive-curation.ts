import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import type { DailyArchiveMessage } from '../domain/dailyArchive/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
    addManualDailyArchiveMessages,
    confirmDailyArchiveDay,
    curateDailyArchiveMessages,
    getDailyArchiveDocument,
    listConfirmedManualDailyArchiveMessages,
    readDailyArchiveCoverage,
    unlockDailyArchiveDay,
    upsertDailyArchiveMessages,
} from '../utils/dailyArchive/storage.ts';

const scope: HistoryScope = {
    progressBundleId: 'curation-progress',
    personaMaskId: 'curation-mask',
    charId: 'curation-char',
};
const now = new Date(2025, 7, 29, 23, 1, 12).getTime();

const message = (id: string, content: string, sourceOrder: number): DailyArchiveMessage => ({
    schemaVersion: 2,
    id,
    scope,
    source: 'history_import',
    sourceRecordId: id,
    sourceBatchId: 'wrapped-word-batch',
    sourceOrder,
    role: 'unknown',
    kind: 'other',
    content,
    time: { precision: 'unknown' },
    status: 'active',
    recordedAt: now,
    revision: 1,
});

const first = message('history:wrapped-1', '【朋友圈】2025.8.29', 1);
const second = message('history:wrapped-2', '和小雨在一起的第一个七夕~', 2);
await upsertDailyArchiveMessages({ messages: [first, second], now });

await curateDailyArchiveMessages({
    scope,
    messages: [first, second],
    operation: { kind: 'set_role', role: 'user' },
    now: now + 1,
});
let undated = await getDailyArchiveDocument({ scope, undatedKey: 'wrapped-word-batch' });
let active = undated!.messages.filter(item => item.status === 'active');
assert.deepEqual(active.map(item => item.role), ['user', 'user']);

const atomicMove = await curateDailyArchiveMessages({
    scope,
    messages: active,
    operation: { kind: 'merge_and_set_date', dateKey: '2025-08-29' },
    now: now + 2,
});
assert.equal(atomicMove.destinationDateKey, '2025-08-29');
assert.equal(atomicMove.primaryMessageId, first.id);
assert.equal(atomicMove.destinationMessageOffset, 0);
undated = await getDailyArchiveDocument({ scope, undatedKey: 'wrapped-word-batch' });
assert.equal(undated?.messageCount, 0);
assert.equal(undated?.messages.every(item => item.status === 'tombstoned'), true);

let dated = await getDailyArchiveDocument({ scope, dateKey: '2025-08-29' });
active = dated!.messages.filter(item => item.status === 'active');
assert.equal(active.length, 1);
assert.equal(active.every(item => item.time.dateKey === '2025-08-29'), true);
assert.match(active[0].content, /【朋友圈】2025\.8\.29\n\n和小雨/u);
assert.deepEqual(active[0].curation?.sourceMessageIds, ['history:wrapped-1', 'history:wrapped-2']);

const manual = await addManualDailyArchiveMessages({
    scope,
    dateKey: '2025-08-29',
    entries: [
        { role: 'user', content: '我后来想起还送过一张手写卡。' },
        { role: 'character', content: '卡片背面写着：明年也一起过。' },
    ],
    now: now + 3,
});
assert.equal(manual.messageIds.length, 2);
assert.equal((await listConfirmedManualDailyArchiveMessages({ scope })).length, 0);

await confirmDailyArchiveDay({ scope, dateKey: '2025-08-29', now: now + 4 });
dated = await getDailyArchiveDocument({ scope, dateKey: '2025-08-29' });
active = dated!.messages.filter(item => item.status === 'active');
assert.equal(dated?.dayConfirmation?.status, 'confirmed');
assert.equal(dated?.dayConfirmation?.manualEntryCount, 2);
assert.equal(active.filter(item => item.source === 'manual_entry').every(item => (
    item.manualEntry?.status === 'confirmed'
)), true);
assert.equal((await listConfirmedManualDailyArchiveMessages({ scope })).length, 2);
await assert.rejects(
    curateDailyArchiveMessages({
        scope,
        messages: [active[0]],
        operation: { kind: 'edit_content', content: '不应越过锁定' },
        now: now + 5,
    }),
    /先解锁/u,
);
await assert.rejects(
    addManualDailyArchiveMessages({
        scope,
        dateKey: '2025-08-29',
        entries: [{ role: 'unknown', content: '不应越过锁定补录' }],
        now: now + 5,
    }),
    /先解锁/u,
);

await unlockDailyArchiveDay({ scope, dateKey: '2025-08-29', now: now + 6 });
dated = await getDailyArchiveDocument({ scope, dateKey: '2025-08-29' });
active = dated!.messages.filter(item => item.status === 'active');
assert.equal(dated?.dayConfirmation?.status, 'open');
assert.equal(active.filter(item => item.source === 'manual_entry').every(item => (
    item.manualEntry?.status === 'draft'
)), true);
assert.equal((await listConfirmedManualDailyArchiveMessages({ scope })).length, 0);
await curateDailyArchiveMessages({
    scope,
    messages: [active.find(item => item.id === first.id)!],
    operation: { kind: 'edit_content', content: '人工校正后的七夕记录' },
    now: now + 7,
});
dated = await getDailyArchiveDocument({ scope, dateKey: '2025-08-29' });
assert.equal(dated?.messages.find(item => item.status === 'active')?.content, '人工校正后的七夕记录');

// A later raw-history sync remains revision 1 and must not revive the old
// undated projection or overwrite the human-curated dated revision.
await upsertDailyArchiveMessages({ messages: [first, second], now: now + 8 });
undated = await getDailyArchiveDocument({ scope, undatedKey: 'wrapped-word-batch' });
dated = await getDailyArchiveDocument({ scope, dateKey: '2025-08-29' });
assert.equal(undated?.messageCount, 0);
assert.equal(dated?.messages.find(item => item.status === 'active')?.content, '人工校正后的七夕记录');

const coverage = await readDailyArchiveCoverage({ scope });
assert.equal(coverage.undatedMessageCount, 0);
assert.equal(coverage.datedMessageCount, 3);
assert.equal(coverage.documentCount, 1);

console.log('daily archive curation OK: atomic merge/date, manual drafts, day lock, unlock, and raw-resync protection');
