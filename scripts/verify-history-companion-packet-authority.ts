import assert from 'node:assert/strict';
import type { DailyArchiveDocument } from '../domain/dailyArchive/types.ts';
import {
  buildHistoryCompanionAnalysisPackets,
  canonicalHistoryCompanionAuthorityJson,
  getHistoryCompanionAnalysisEvidenceLaneGrant,
  sha256HistoryCompanionAuthority,
  validateHistoryCompanionAnalysisPacket,
  validateHistoryCompanionAnalysisPacketSet,
} from '../domain/historyImport/companionMaterial/analysisPacket.ts';
import { buildHistoryCompanionAnalysisPrompt } from '../domain/historyImport/companionMaterial/analysisPrompt.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const scope: HistoryScope = {
  progressBundleId: 'bundle-packet-authority',
  personaMaskId: 'mask-packet-authority',
  charId: 'char-packet-authority',
};

const daily = (input: {
  id: string;
  dateKey: string;
  contents: readonly string[];
  documentScope?: HistoryScope;
  messageScopes?: readonly HistoryScope[];
}): DailyArchiveDocument => {
  const documentScope = input.documentScope || scope;
  return {
    schemaVersion: 2,
    id: input.id,
    scope: { ...documentScope },
    sourceKinds: ['history_import'],
    dateKey: input.dateKey,
    messages: input.contents.map((content, index) => ({
      schemaVersion: 2,
      id: `${input.id}:message:${index}`,
      scope: { ...(input.messageScopes?.[index] || documentScope) },
      source: 'history_import',
      sourceRecordId: `${input.id}:source:${index}`,
      sourceOrder: index,
      role: index % 2 === 0 ? 'character' : 'user',
      kind: 'text',
      content,
      time: { dateKey: input.dateKey, precision: 'day' },
      status: 'active',
      recordedAt: 1_768_700_000_000 + index,
      revision: 1,
    })),
    messageCount: input.contents.length,
    firstTimestamp: 1_768_700_000_000,
    lastTimestamp: 1_768_700_000_000 + input.contents.length,
    createdAt: 1_768_700_000_000,
    updatedAt: 1_768_700_000_100,
    revision: 4,
  };
};

assert.equal(
  sha256HistoryCompanionAuthority(''),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'the browser-compatible synchronous implementation must be real SHA-256',
);
assert.equal(
  sha256HistoryCompanionAuthority('abc'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
);
assert.equal(
  canonicalHistoryCompanionAuthorityJson({ z: 1, a: { y: 2, x: 3 } }),
  canonicalHistoryCompanionAuthorityJson({ a: { x: 3, y: 2 }, z: 1 }),
  'authority serialization must not depend on object insertion order',
);

const documents = [
  daily({
    id: 'daily:2025-07-16',
    dateKey: '2025-07-16',
    contents: [
      '角色从手边正在处理的事自然起话。',
      '玩家回应这件小事。',
      '角色把注意力转回一个具体变化。',
      '玩家继续补充背景。',
      '角色用另一种节奏收住这轮交流。',
    ],
  }),
  daily({
    id: 'daily:2025-07-18',
    dateKey: '2025-07-18',
    contents: [
      '两天后是另一组独立来源。',
      '玩家这边保留自己的通道。',
      '角色仍然可以换一种温度表达。',
      '玩家结束这组历史片段。',
    ],
  }),
];

const packets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents,
  requestedLanes: ['scene_texture', 'language_fingerprint', 'stable_detail'],
  maxPacketChars: 34,
  maxEvidenceChars: 34,
  maxEvidenceItems: 2,
  createdAt: 1_768_700_001_000,
});

assert.ok(packets.length >= 3, 'large history remains split into bounded packets');
assert.deepEqual(validateHistoryCompanionAnalysisPacketSet(packets), []);
assert.equal(packets[0].packetSet.packetCount, packets.length);
assert.deepEqual(
  packets[0].packetSet.canonicalLaneSet,
  ['language_fingerprint', 'stable_detail', 'scene_texture'],
  'the set stores one canonical lane order regardless of caller order',
);
packets.forEach((packet, ordinal) => {
  assert.equal(packet.packetOrdinal, ordinal);
  assert.equal(packet.packetSet.packetSetId, packets[0].packetSet.packetSetId);
  assert.match(packet.packetEvidenceDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(packet.packetSet.orderedEvidenceDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(validateHistoryCompanionAnalysisPacket(packet), []);
});

const grant = getHistoryCompanionAnalysisEvidenceLaneGrant(
  packets[0],
  packets[0].evidence[0].id,
);
assert.equal(grant.packetId, packets[0].id);
assert.deepEqual(grant.allowedLanes, packets[0].packetSet.canonicalLaneSet);
assert.throws(
  () => getHistoryCompanionAnalysisEvidenceLaneGrant(packets[0], 'foreign-evidence'),
  /does not belong to packet/,
);

const foreignMessageScope = { ...scope, personaMaskId: 'foreign-mask' };
assert.throws(() => buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [daily({
    id: 'daily:foreign-message',
    dateKey: '2025-07-20',
    contents: ['文档 scope 正确也不能替 foreign message 洗 scope。'],
    documentScope: scope,
    messageScopes: [foreignMessageScope],
  })],
}), /message .* crosses analysis scope/u);

const secondBuild = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [daily({
    id: 'daily:other-build',
    dateKey: '2025-07-21',
    contents: ['另一次 build 的包不能混进第一组。', '即使 scope 相同也会重算正文权威。'],
  })],
  maxPacketChars: 34,
  maxEvidenceChars: 34,
  maxEvidenceItems: 1,
  createdAt: 1_768_700_001_100,
});
assert.match(
  validateHistoryCompanionAnalysisPacketSet([packets[0], ...secondBuild]).join('\n'),
  /mixes packetSetId values/,
  'packets from distinct builds must not form a plausible set',
);

const ordinalGap = packets.filter(packet => packet.packetOrdinal !== 1);
assert.match(
  validateHistoryCompanionAnalysisPacketSet(ordinalGap).join('\n'),
  /packetCount does not match|ordered and contiguous/,
);

const laneManifestTampered = {
  ...packets[0],
  requestedLanes: ['language_fingerprint'] as const,
};
assert.match(
  validateHistoryCompanionAnalysisPacket(laneManifestTampered).join('\n'),
  /requestedLanes do not match canonicalLaneSet/,
);

const contentTampered = {
  ...packets[0],
  evidence: [{
    ...packets[0].evidence[0],
    ephemeralText: `${packets[0].evidence[0].ephemeralText}篡改`,
  }, ...packets[0].evidence.slice(1)],
};
assert.match(
  validateHistoryCompanionAnalysisPacket(contentTampered).join('\n'),
  /contentFingerprint does not match evidence content/,
  'canonical SHA authority must be recomputable from bounded source content',
);

const prompt = buildHistoryCompanionAnalysisPrompt({ packets });
assert.equal(prompt.packetSetId, packets[0].packetSet.packetSetId);
assert.equal(prompt.evidenceLaneGrants.length, packets.flatMap(packet => packet.evidence).length);
assert.equal(
  prompt.evidenceLaneGrants.every(item => (
    item.allowedLanes.includes('language_fingerprint')
    && !item.allowedLanes.includes('opening_proactive')
  )),
  true,
);
assert.equal(
  prompt.promptChars,
  prompt.promptOverheadChars + prompt.evidencePromptChars,
);
assert.ok(prompt.promptChars <= prompt.maxPromptChars);
assert.throws(
  () => buildHistoryCompanionAnalysisPrompt({
    packets: [packets[0], ...secondBuild],
  }),
  /Invalid analysis packet set/,
);

const emojiPackets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [daily({
    id: 'daily:emoji-budget',
    dateKey: '2025-07-22',
    contents: ['😀'.repeat(12_000)],
  })],
  maxPacketChars: 12_000,
  maxEvidenceChars: 12_000,
  maxEvidenceItems: 1,
  createdAt: 1_768_700_001_200,
});
assert.equal(emojiPackets.length, 1);
assert.equal(emojiPackets[0].inputChars, 12_000);
const emojiPrompt = buildHistoryCompanionAnalysisPrompt({ packets: emojiPackets });
assert.ok(
  emojiPrompt.promptChars <= 24_000,
  '12k emoji must fit the default prompt because packet and prompt use code points consistently',
);
assert.equal(
  emojiPrompt.promptChars,
  emojiPrompt.promptOverheadChars + emojiPrompt.evidencePromptChars,
);

console.log(
  `history companion packet authority: green packets=${packets.length} `
  + `emojiPromptChars=${emojiPrompt.promptChars}`,
);
