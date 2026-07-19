import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    assertInteractionEvidence,
    createEvidenceSpan,
} from '../domain/interactionEvidence/index.ts';
import {
    dailyArchiveMessageFromLive,
    dailyArchiveMessageToInteractionEvidence,
    dailyArchiveRevisionToInteractionEvidence,
} from '../domain/dailyArchive/contract.ts';
import type { DailyArchiveMessageRevision } from '../domain/dailyArchive/types.ts';

const scopeA = {
    progressBundleId: 'progress-A',
    personaMaskId: 'mask-A',
    charId: 'char-shared',
};
const scopeB = {
    progressBundleId: 'progress-B',
    personaMaskId: 'mask-B',
    charId: 'char-shared',
};

const chatRow = dailyArchiveMessageFromLive({
    scope: scopeA,
    message: {
        id: 101,
        charId: scopeA.charId,
        role: 'user',
        type: 'text',
        content: '（拉住 A 的手腕）小 C 也没说什么呀，对吧 B。',
        timestamp: Date.parse('2026-07-19T10:00:00+08:00'),
        metadata: {
            source: 'chat',
            interactionId: 'chat-turn-1',
            relationshipScope: scopeA,
        },
    },
});
const dateRow = dailyArchiveMessageFromLive({
    scope: scopeA,
    message: {
        id: 102,
        charId: scopeA.charId,
        role: 'assistant',
        type: 'text',
        content: '[normal] 灯影越过肩头。\n[happy] “你来了。”',
        timestamp: Date.parse('2026-07-19T10:01:00+08:00'),
        metadata: {
            source: 'date',
            dateSessionId: 'date-session-1',
            assistantResponseId: 'date-response-1',
            relationshipScope: scopeA,
        },
    },
});

assert.deepEqual(chatRow.origin, {
    surface: 'chat',
    medium: 'mixed_text',
    producer: 'user',
    interactionId: 'chat-turn-1',
    turnId: '101',
    sequence: 101,
});
assert.equal(dateRow.origin?.surface, 'date');
assert.equal(dateRow.origin?.medium, 'embodied_scene');
assert.equal(dateRow.origin?.interactionId, 'date-session-1');
assert.equal(dateRow.origin?.responseId, 'date-response-1');

const chatEvidence = dailyArchiveMessageToInteractionEvidence(chatRow);
const dateEvidence = dailyArchiveMessageToInteractionEvidence(dateRow);
assert.equal(chatEvidence.source.surface, 'chat');
assert.equal(chatEvidence.source.medium, 'mixed_text');
assert.equal(chatEvidence.transportRole, 'user_channel');
assert.equal(chatEvidence.content.charCount, chatRow.content.length);
assert.ok(!('actor' in chatEvidence), 'source evidence must not invent NPC or in-world speaker identity');
assert.equal(assertInteractionEvidence(chatEvidence), chatEvidence);

const chatRevision2 = dailyArchiveMessageToInteractionEvidence({
    ...chatRow,
    content: `${chatRow.content}\n场景继续。`,
    revision: 2,
});
assert.notEqual(chatEvidence.evidenceId, chatRevision2.evidenceId);
assert.equal(chatRevision2.source.previousRevisionRef?.revision, 1);

const revisionRecord: DailyArchiveMessageRevision = {
    schemaVersion: 1,
    id: `${chatRow.id}:revision:1`,
    messageId: chatRow.id,
    documentId: 'daily-archive:fixture',
    scope: scopeA,
    revision: 1,
    message: chatRow,
    archivedAt: Date.parse('2026-07-19T10:02:00+08:00'),
    replacedByRevision: 2,
};
assert.equal(dailyArchiveRevisionToInteractionEvidence(revisionRecord).source.status, 'superseded');

const span = await createEvidenceSpan({ scope: scopeA, evidence: [chatEvidence, dateEvidence] });
assert.equal(span.evidenceIds.length, 2);
assert.match(span.sourceRevisionFingerprint, /^sha256:[0-9a-f]{64}$/u);
assert.deepEqual(
    await createEvidenceSpan({ scope: scopeA, evidence: [chatEvidence, dateEvidence] }),
    span,
    'same source revisions must produce a stable span fingerprint',
);
assert.notEqual(
    (await createEvidenceSpan({ scope: scopeA, evidence: [dateEvidence, chatEvidence] })).sourceRevisionFingerprint,
    span.sourceRevisionFingerprint,
    'ordered dialogue evidence must not share a fingerprint after reordering',
);
await assert.rejects(
    () => createEvidenceSpan({ scope: scopeA, evidence: [chatEvidence, chatEvidence] }),
    /重复引用/,
);
const otherMaskEvidence = dailyArchiveMessageToInteractionEvidence(
    dailyArchiveMessageFromLive({
        scope: scopeB,
        message: {
            id: 101,
            charId: scopeB.charId,
            role: 'user',
            type: 'text',
            content: chatRow.content,
            timestamp: Date.parse('2026-07-19T10:00:00+08:00'),
            metadata: { source: 'chat', relationshipScope: scopeB },
        },
    }),
);
assert.notEqual(chatEvidence.evidenceId, otherMaskEvidence.evidenceId);
await assert.rejects(
    () => createEvidenceSpan({ scope: scopeA, evidence: [chatEvidence, otherMaskEvidence] }),
    /不能跨关系范围/,
);
assert.throws(
    () => assertInteractionEvidence({ ...chatEvidence, evidenceId: 'tampered' }),
    /来源版本不一致/,
);

const dateSource = readFileSync(new URL('../apps/DateApp.tsx', import.meta.url), 'utf8');
for (const required of [
    'strictRelationshipScopeForProfile',
    'dateSessionIdRef',
    'relationshipScope: initiatingScope',
    'messageMatchesRelationshipScope',
]) assert.ok(dateSource.includes(required), `Date missing scoped evidence seam: ${required}`);

const dbSource = readFileSync(new URL('../utils/db.ts', import.meta.url), 'utf8');
assert.ok(dbSource.includes('save-time active-profile lookup can cross masks'));
assert.ok(!dbSource.includes('readUserProfileForDailyArchive'));

console.log('interaction evidence OK: atomic revisions, explicit origin, mask isolation, and source-only actor semantics');
