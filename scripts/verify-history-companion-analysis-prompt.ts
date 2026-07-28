import assert from 'node:assert/strict';
import {
  buildHistoryCompanionAnalysisPackets,
  buildHistoryCompanionAnalysisPrompt,
} from '../domain/historyImport/companionMaterial/index.ts';
import type { DailyArchiveDocument } from '../domain/dailyArchive/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const scope: HistoryScope = {
  progressBundleId: 'bundle-history-prompt',
  personaMaskId: 'mask-history-prompt',
  charId: 'char-history-prompt',
};

const archive = (
  id: string,
  dateKey: string,
  content: string,
  documentScope: HistoryScope = scope,
): DailyArchiveDocument => ({
  schemaVersion: 2,
  id,
  scope: { ...documentScope },
  sourceKinds: ['history_import'],
  dateKey,
  messages: [{
    schemaVersion: 2,
    id: `${id}:message`,
    scope: { ...documentScope },
    source: 'history_import',
    sourceRecordId: `${id}:source`,
    sourceOrder: 0,
    role: 'character',
    kind: 'text',
    content,
    time: { dateKey, precision: 'day' },
    status: 'active',
    recordedAt: 1_768_700_000_000,
    revision: 1,
  }],
  messageCount: 1,
  firstTimestamp: 1_768_700_000_000,
  lastTimestamp: 1_768_700_000_000,
  createdAt: 1_768_700_000_000,
  updatedAt: 1_768_700_000_000,
  revision: 1,
});

const packets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [
    archive('daily:2025-07-16', '2025-07-16', '第一份只在临时 prompt 中出现的角色证据。'),
    archive('daily:2025-07-18', '2025-07-18', '第二份用于观察跨日期表达层的角色证据。'),
  ],
  maxPacketChars: 30,
  maxEvidenceChars: 30,
  createdAt: 1_768_700_000_100,
});

const prompt = buildHistoryCompanionAnalysisPrompt({
  packets,
  maxPromptChars: 24_000,
});
assert.equal(prompt.rawRetention, 'ephemeral_not_persisted');
assert.deepEqual(prompt.packetIds, packets.map(item => item.id));
assert.equal(prompt.evidenceIds.length, 2);
packets.flatMap(item => item.evidence).forEach(evidence => {
  assert.equal(prompt.userPrompt.includes(evidence.id), true);
  assert.equal(prompt.userPrompt.includes(evidence.ephemeralText), true);
});
assert.match(prompt.systemPrompt, /共同好行为/);
assert.match(prompt.systemPrompt, /自己的观察、生活和判断/);
assert.match(prompt.systemPrompt, /coauthored_multi_actor/);
assert.match(prompt.systemPrompt, /最多 12 个 findings/);
assert.equal(prompt.promptChars, prompt.systemPrompt.length + prompt.userPrompt.length);

assert.throws(() => buildHistoryCompanionAnalysisPrompt({
  packets,
  maxPromptChars: 100,
}), /exceeds maxPromptChars/);

const otherScope = { ...scope, personaMaskId: 'mask-history-prompt-other' };
const otherPackets = buildHistoryCompanionAnalysisPackets({
  scope: otherScope,
  documents: [archive('daily:2025-07-19', '2025-07-19', '另一个面具的数据。', otherScope)],
});
assert.throws(() => buildHistoryCompanionAnalysisPrompt({
  packets: [packets[0], otherPackets[0]],
}), /cross scope/);

console.log(`history companion analysis prompt: green packets=${packets.length} evidence=${prompt.evidenceIds.length}`);
