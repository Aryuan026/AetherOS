import assert from 'node:assert/strict';
import {
  buildHistoryCompanionAnalysisPackets,
  describeHistoryCompanionAnalysisPacket,
  validateHistoryCompanionAnalysisPacket,
} from '../domain/historyImport/companionMaterial/index.ts';
import type { DailyArchiveDocument } from '../domain/dailyArchive/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const scope: HistoryScope = {
  progressBundleId: 'bundle-history-analysis-packet',
  personaMaskId: 'mask-history-analysis-packet',
  charId: 'char-history-analysis-packet',
};

const document = (
  id: string,
  dateKey: string,
  contents: Array<{
    role: 'user' | 'character' | 'system';
    content: string;
    status?: 'active' | 'tombstoned';
    manualEntryStatus?: 'draft' | 'confirmed';
  }>,
): DailyArchiveDocument => ({
  schemaVersion: 2,
  id,
  scope: { ...scope },
  sourceKinds: ['history_import'],
  dateKey,
  messages: contents.map((item, index) => ({
    schemaVersion: 2,
    id: `${id}:message:${index}`,
    scope: { ...scope },
    source: item.manualEntryStatus ? 'manual_entry' : 'history_import',
    sourceRecordId: `${id}:source:${index}`,
    sourceOrder: index,
    role: item.role,
    kind: 'text',
    content: item.content,
    time: { dateKey, precision: 'day' },
    status: item.status || 'active',
    recordedAt: 1_768_700_000_000 + index,
    revision: 1,
    ...(item.manualEntryStatus ? {
      manualEntry: {
        status: item.manualEntryStatus,
        createdAt: 1_768_700_000_000 + index,
        updatedAt: 1_768_700_000_000 + index,
        ...(item.manualEntryStatus === 'confirmed'
          ? { confirmedAt: 1_768_700_000_100 + index }
          : {}),
      },
    } : {}),
  })),
  messageCount: contents.length,
  firstTimestamp: 1_768_700_000_000,
  lastTimestamp: 1_768_700_000_000 + contents.length,
  createdAt: 1_768_700_000_000,
  updatedAt: 1_768_700_000_000,
  revision: 3,
});

const longCharacterTurn = '角色长段落。'.repeat(30);
const emojiBoundaryTurn = '甲😀乙🙂丙';
const documents = [
  document('daily:2025-07-16', '2025-07-16', [
    { role: 'user', content: '今天发生了一件小事。' },
    { role: 'character', content: longCharacterTurn },
    { role: 'system', content: '这一条只是系统提示，不进入素材分析。' },
  ]),
  document('daily:2025-07-18', '2025-07-18', [
    { role: 'character', content: '隔了两天后，角色从自己的近况重新起话。' },
    { role: 'character', content: emojiBoundaryTurn },
    { role: 'user', content: '这一条已经删除。', status: 'tombstoned' },
    { role: 'character', content: '尚未锁定的人工补录草稿。', manualEntryStatus: 'draft' },
    { role: 'character', content: '已经随当天锁定的人工补录。', manualEntryStatus: 'confirmed' },
  ]),
  document('daily:2025-07-19', '2025-07-19', [
    { role: 'system', content: '只有系统内容的日期不产生 evidence，但仍属于来源版本边界。' },
  ]),
];

const packets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents,
  maxPacketChars: 90,
  maxEvidenceChars: 40,
  maxEvidenceItems: 3,
  createdAt: 1_768_700_000_123,
});

assert.ok(packets.length > 1, 'long histories must be split into bounded packets');
packets.forEach(packet => {
  assert.deepEqual(validateHistoryCompanionAnalysisPacket(packet), []);
  assert.ok(packet.inputChars <= 90);
  assert.ok(packet.evidence.length <= 3);
  assert.equal(packet.rawRetention, 'ephemeral_not_persisted');
});

const allEvidence = packets.flatMap(packet => packet.evidence);
assert.deepEqual(
  packets[0].packetSet.sourceDocuments,
  [
    { documentId: 'daily:2025-07-16', documentRevision: 3 },
    { documentId: 'daily:2025-07-18', documentRevision: 3 },
    { documentId: 'daily:2025-07-19', documentRevision: 3 },
  ],
  'packet-set authority includes source documents that yielded no eligible evidence',
);
assert.equal(allEvidence.some(item => item.authorChannel === 'user'), true);
assert.equal(allEvidence.some(item => item.authorChannel === 'character'), true);
assert.equal(allEvidence.some(item => item.ephemeralText.includes('系统提示')), false);
assert.equal(allEvidence.some(item => item.ephemeralText.includes('已经删除')), false);
assert.equal(allEvidence.some(item => item.ephemeralText.includes('尚未锁定')), false);
assert.equal(allEvidence.some(item => item.ephemeralText.includes('已经随当天锁定')), true);
assert.equal(
  allEvidence
    .filter(item => item.sourceRef.messageIds?.[0] === 'daily:2025-07-16:message:1')
    .sort((left, right) => left.excerptStart - right.excerptStart)
    .map(item => item.ephemeralText)
    .join(''),
  longCharacterTurn,
  'slicing must conserve a long character turn exactly inside the ephemeral analysis layer',
);
const emojiEvidence = allEvidence
  .filter(item => item.sourceRef.messageIds?.[0] === 'daily:2025-07-18:message:1')
  .sort((left, right) => left.excerptStart - right.excerptStart);
assert.equal(
  emojiEvidence.map(item => item.ephemeralText).join(''),
  emojiBoundaryTurn,
  'slicing must conserve emoji-bearing text exactly',
);
assert.equal(
  emojiEvidence.some(item => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(item.ephemeralText)),
  false,
  'no evidence slice may contain an unpaired UTF-16 surrogate',
);

const descriptor = describeHistoryCompanionAnalysisPacket(packets[0]);
assert.equal('evidence' in descriptor, false);
assert.equal(JSON.stringify(descriptor).includes('ephemeralText'), false);
assert.equal(JSON.stringify(descriptor).includes('角色长段落'), false);
assert.equal(descriptor.evidenceIds.length, packets[0].evidence.length);
assert.deepEqual(descriptor.sourceDocuments, packets[0].packetSet.sourceDocuments);

const substitutedDocuments = documents.map((item, index) => (
  index === 0
    ? {
      ...item,
      messages: item.messages.map((message, messageIndex) => (
        messageIndex === 0
          ? { ...message, content: '同一 id 与 revision 下被替换的内存正文。' }
          : message
      )),
    }
    : item
));
const substitutedPackets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: substitutedDocuments,
  maxPacketChars: 90,
  maxEvidenceChars: 40,
  maxEvidenceItems: 3,
  createdAt: 1_768_700_000_123,
});
assert.notEqual(
  substitutedPackets[0].sourceRevisionFingerprint,
  packets[0].sourceRevisionFingerprint,
  'packet source authority is derived from the supplied Daily Archive body, not an external fingerprint',
);

assert.throws(() => buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [{
    ...documents[0],
    scope: { ...scope, personaMaskId: 'another-mask' },
  }],
}), /crosses analysis scope/);

const tampered = {
  ...packets[0],
  inputChars: packets[0].inputChars + 1,
};
assert.match(
  validateHistoryCompanionAnalysisPacket(tampered).join('\n'),
  /inputChars does not match evidence/,
);

const contentTampered = {
  ...packets[0],
  evidence: [{
    ...packets[0].evidence[0],
    ephemeralText: `${packets[0].evidence[0].ephemeralText}被替换`,
  }, ...packets[0].evidence.slice(1)],
};
assert.match(
  validateHistoryCompanionAnalysisPacket(contentTampered).join('\n'),
  /contentFingerprint does not match evidence content/,
);

const identityTampered = {
  ...packets[0],
  id: 'history-companion-analysis-forged',
};
assert.match(
  validateHistoryCompanionAnalysisPacket(identityTampered).join('\n'),
  /id does not match packet evidence/,
);

console.log(`history companion analysis packets: green packets=${packets.length} evidence=${allEvidence.length}`);
