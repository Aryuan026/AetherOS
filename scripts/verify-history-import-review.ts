import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import {
    assessHistoryPreviewReview,
    createHistoryPreviewRowReviewDrafts,
    freezeHistoryPreviewDecision,
    type HistoryPreviewReviewDraftInput,
} from '../domain/historyImport/previewReview.ts';
import type { HistorySpeakerMapping } from '../domain/historyImport/types.ts';
import { buildHistoryImportPreview } from '../utils/historyImport/parsers/sourcePreview.ts';

const bindingDraft = buildHistoryIdentityBindingDraft({
    draftSeed: 'review-fixture-001',
    mask: {
        id: 'mask-review',
        label: '审阅面具',
        progressBundleId: 'progress-review',
    },
    character: { id: 'char-review', label: '糯米' },
});

const lines = [
    '[2024-05-01T08:30:00+08:00] 阿鸢：早上好',
    '[2024-05-01 08:31] 糯米: 我在这里',
    '这是一行由人确认的续行',
    '---',
    '阿鸢：[图片]',
    '[OOC]：先暂停角色扮演',
    '[2024-05-01T08:30:00+08:00] 阿鸢：早上好',
];

const preview = await buildHistoryImportPreview({
    name: 'synthetic-review.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode(lines.join('\n')),
    bindingDraft,
});

const mappingFor = (sourceLabel: string): HistorySpeakerMapping => {
    const role = sourceLabel === '阿鸢'
        ? 'user'
        : sourceLabel === '糯米' ? 'character' : 'system';
    return {
        sourceLabel,
        role,
        targetId: role === 'user'
            ? preview.scope.personaMaskId
            : role === 'character' ? preview.scope.charId : undefined,
        confidence: 1,
        confirmedByUser: true,
    };
};

const speakerMappings = preview.speakerCandidates.map(candidate => mappingFor(candidate.label));
const rows = createHistoryPreviewRowReviewDrafts(preview);
assert.equal(rows[0].resolution, 'accepted');
assert.equal(rows[2].resolution, 'pending');
assert.equal(rows[3].resolution, 'excluded');
assert.equal(rows[6].resolution, 'excluded');

rows[2] = {
    ...rows[2],
    resolution: 'merged',
    mergeIntoRowId: preview.rows[1].id,
};
rows[4] = { ...rows[4], resolution: 'accepted' };
rows[5] = { ...rows[5], resolution: 'accepted' };

const reviewedInput: HistoryPreviewReviewDraftInput = {
    sourceMode: 'mixed',
    timezonePolicy: 'source',
    metadataConfirmedByUser: true,
    speakerMappings,
    rows,
};

const readyAssessment = assessHistoryPreviewReview(preview, reviewedInput);
assert.equal(readyAssessment.canFreeze, true);
assert.deepEqual(readyAssessment.pendingRowIds, []);
assert.deepEqual(readyAssessment.missingSpeakerMappings, []);

const legacyUncheckedInput: HistoryPreviewReviewDraftInput = {
    ...reviewedInput,
    metadataConfirmedByUser: false,
};
const legacyUncheckedAssessment = assessHistoryPreviewReview(preview, legacyUncheckedInput);
assert.equal(
    legacyUncheckedAssessment.canFreeze,
    true,
    'obsolete source-context consent state must not block a complete review',
);

const decision = await freezeHistoryPreviewDecision(preview, reviewedInput);
const repeatedDecision = await freezeHistoryPreviewDecision(preview, reviewedInput);
const legacyUncheckedDecision = await freezeHistoryPreviewDecision(preview, legacyUncheckedInput);
assert.equal(decision.fingerprint, repeatedDecision.fingerprint);
assert.equal(decision.fingerprint, legacyUncheckedDecision.fingerprint);
assert.equal(decision.id, repeatedDecision.id);
assert.deepEqual(decision, repeatedDecision);
assert.equal(decision.coverage, 'complete_preview');
assert.equal(decision.counts.included, 4);
assert.equal(decision.counts.excluded, 2);
assert.equal(decision.counts.merged, 1);
assert.equal(decision.counts.edited, 0);
assert.equal(decision.rows[0].speakerRole, 'user');
assert.equal(decision.rows[0].speakerId, preview.scope.personaMaskId);
assert.equal(decision.rows[1].speakerRole, 'character');
assert.equal(decision.rows[1].speakerId, preview.scope.charId);
assert.equal(decision.rows[2].disposition, 'merge_into_previous');
assert.equal(decision.rows[2].mergeIntoRowId, preview.rows[1].id);
assert.equal(decision.rows[5].speakerRole, 'system');
assert.equal(decision.rows[6].disposition, 'exclude');
assert.equal(decision.frozen, true);
assert.equal(decision.persistence, 'memory_only');
assert.equal(decision.productionWriteAllowed, false);
assert.equal(Object.isFrozen(decision), true);
assert.equal(Object.isFrozen(decision.rows), true);
assert.equal(Object.isFrozen(decision.rows[0]), true);

assert.throws(() => {
    (decision.rows[0] as { content: string }).content = 'mutated';
}, TypeError);
assert.equal(decision.rows[0].content, '早上好');

const editedRows = rows.map(row => ({ ...row }));
editedRows[1] = {
    ...editedRows[1],
    content: '我会一直在这里',
    resolution: 'edited',
};
const editedDecision = await freezeHistoryPreviewDecision(preview, {
    ...reviewedInput,
    rows: editedRows,
});
assert.notEqual(editedDecision.fingerprint, decision.fingerprint);
assert.equal(editedDecision.counts.edited, 1);
assert.equal(decision.rows[1].content, '我在这里');

const incomplete = assessHistoryPreviewReview(preview, {
    ...reviewedInput,
    metadataConfirmedByUser: false,
    speakerMappings: speakerMappings.slice(1),
    rows: createHistoryPreviewRowReviewDrafts(preview),
});
assert.equal(incomplete.canFreeze, false);
assert.ok(incomplete.missingSpeakerMappings.length > 0);
assert.ok(incomplete.pendingRowIds.length > 0);

const badMergeRows = rows.map(row => ({ ...row }));
badMergeRows[2] = {
    ...badMergeRows[2],
    mergeIntoRowId: preview.rows[0].id,
};
assert.equal(assessHistoryPreviewReview(preview, {
    ...reviewedInput,
    rows: badMergeRows,
}).canFreeze, false);
await assert.rejects(
    freezeHistoryPreviewDecision(preview, { ...reviewedInput, rows: badMergeRows }),
    /未确认项/,
);

const invalidTimezone = assessHistoryPreviewReview(preview, {
    ...reviewedInput,
    timezonePolicy: 'user_selected',
    selectedTimezone: 'made up timezone',
});
assert.equal(invalidTimezone.timezoneValid, false);
assert.equal(invalidTimezone.canFreeze, false);

const extraRowAssessment = assessHistoryPreviewReview(preview, {
    ...reviewedInput,
    rows: [...rows, { ...rows[0], rowId: 'forged-extra-row' }],
});
assert.equal(extraRowAssessment.canFreeze, false);
assert.ok(extraRowAssessment.invalidRowIds.includes('forged-extra-row'));

const excludedTargetRows = rows.map(row => ({ ...row }));
excludedTargetRows[1] = { ...excludedTargetRows[1], resolution: 'excluded' };
assert.equal(assessHistoryPreviewReview(preview, {
    ...reviewedInput,
    rows: excludedTargetRows,
}).canFreeze, false);

const reviewSource = readFileSync(
    new URL('../components/history-import/HistoryPreviewReview.tsx', import.meta.url),
    'utf8',
);
for (const forbidden of [
    'fetch(',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'updateUserProfile',
    'updateCharacter',
    'createHistoryImportBatch',
]) {
    assert.equal(reviewSource.includes(forbidden), false, `review UI must remain page-memory-only: ${forbidden}`);
}
for (const required of [
    '说话人映射',
    '确认并接到上一条',
    '逐行确认',
    '完成校对',
    'sourceModeOptions',
    'timezoneOptions',
]) {
    assert.ok(reviewSource.includes(required), `review UI must expose ${required}`);
}

const appSource = readFileSync(
    new URL('../apps/HistoryImportApp.tsx', import.meta.url),
    'utf8',
);
assert.ok(appSource.includes('<HistoryPagedReview'));
assert.ok(appSource.includes('getLatestHistoryReviewWorkspace'));
assert.ok(appSource.includes('不会上传'));
assert.ok(appSource.includes('3 接回聊天'));
assert.equal(appSource.includes('生产写入仍 HOLD'), false);
assert.equal(appSource.includes('<HistoryImportSafetyGate'), false);
assert.equal(appSource.includes('<HistoryRescueRehearsal'), false);
assert.equal(appSource.includes('加密救援文件'), false);

const pagedReviewSource = readFileSync(
    new URL('../components/history-import/HistoryPagedReview.tsx', import.meta.url),
    'utf8',
);
const contextNoticeSource = readFileSync(
    new URL('../components/history-import/HistoryContextNotice.tsx', import.meta.url),
    'utf8',
);
for (const required of [
    'completeHistoryReviewWorkspace',
    '导入并继续聊天',
    '不再要求你逐条认领',
    '稍后整理',
    '<HistoryArchiveCommit',
    '<HistoryContextNotice',
]) {
    assert.ok(pagedReviewSource.includes(required), `paged review UI must expose ${required}`);
}
assert.ok(reviewSource.includes('<HistoryContextNotice'));
for (const required of [
    '不会每次整本发给 AI',
    '最近最多 24 条',
    'API 输入 token',
    'API 服务商规则',
]) {
    assert.ok(contextNoticeSource.includes(required), `context notice must explain ${required}`);
}
for (const forbidden of [
    '我确认这些只是来源说明',
    '我确认这只是来源语境和时间解释',
    '来源模式与时间解释尚未确认',
    '对话类型和时间说明尚未确认',
]) {
    assert.equal(
        `${reviewSource}\n${pagedReviewSource}\n${contextNoticeSource}`.includes(forbidden),
        false,
        `review UI must not retain obsolete consent copy: ${forbidden}`,
    );
}

const chatSource = readFileSync(
    new URL('../apps/Chat.tsx', import.meta.url),
    'utf8',
);
assert.ok(chatSource.includes('readActiveHistoryChatTail'));
assert.ok(chatSource.includes('limit: 24'));
for (const forbidden of [
    'fetch(',
    'localStorage',
    'sessionStorage',
    'updateUserProfile',
    'updateCharacter',
    '外部救援文件',
]) {
    assert.equal(pagedReviewSource.includes(forbidden), false, `paged review UI must avoid ${forbidden}`);
}

console.log(
    `history preview review OK: mappings=${decision.speakerMappings.length} included=${decision.counts.included} excluded=${decision.counts.excluded} merged=${decision.counts.merged} immutable=${Object.isFrozen(decision)}`,
);
