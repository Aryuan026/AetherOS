import assert from 'node:assert/strict';
import type { DailyArchiveDocument } from '../domain/dailyArchive/types.ts';
import {
  createHistoryCompanionAnalysisBatchDraftReceipt,
  createHistoryCompanionAnalysisBatchPlan,
  createHistoryCompanionAnalysisCoverageReceipt,
  createHistoryCompanionAnalysisSynthesisEnvelope,
  validateHistoryCompanionAnalysisBoundedBatch,
  validateHistoryCompanionAnalysisCoverageReceipt,
  validateHistoryCompanionAnalysisSynthesisEnvelope,
} from '../domain/historyImport/companionMaterial/analysisBatch.ts';
import { buildHistoryCompanionAnalysisPackets } from '../domain/historyImport/companionMaterial/analysisPacket.ts';
import {
  buildHistoryCompanionAnalysisPrompt,
  buildHistoryCompanionAnalysisSynthesisPrompt,
  planHistoryCompanionAnalysisPromptBatches,
} from '../domain/historyImport/companionMaterial/analysisPrompt.ts';
import {
  createHistoryCompanionAnalysisAdjudicationReceipt,
  createHistoryCompanionAnalysisReview,
  createHistoryCompanionAnalysisReviewFromSynthesis,
  finalizeHistoryCompanionAnalysisReview,
  validateHistoryCompanionAnalysisReview,
  type HistoryCompanionAnalysisFinding,
} from '../domain/historyImport/companionMaterial/analysisReview.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const scope: HistoryScope = {
  progressBundleId: 'bundle-bounded-analysis',
  personaMaskId: 'mask-bounded-analysis',
  charId: 'char-bounded-analysis',
};

const daily = (
  id: string,
  content: string,
  itemScope: HistoryScope = scope,
): DailyArchiveDocument => ({
  schemaVersion: 2,
  id,
  scope: { ...itemScope },
  sourceKinds: ['history_import'],
  dateKey: '2025-07-16',
  messages: [{
    schemaVersion: 2,
    id: `${id}:message`,
    scope: { ...itemScope },
    source: 'history_import',
    sourceRecordId: `${id}:source`,
    sourceOrder: 0,
    role: 'character',
    kind: 'text',
    content,
    time: { dateKey: '2025-07-16', precision: 'day' },
    status: 'active',
    recordedAt: 1_768_700_000_000,
    revision: 1,
  }],
  messageCount: 1,
  firstTimestamp: 1_768_700_000_000,
  lastTimestamp: 1_768_700_000_000,
  createdAt: 1_768_700_000_000,
  updatedAt: 1_768_700_000_100,
  revision: 3,
});

const rawHistory = [
  '角色保留自己的观察和生活节奏，',
  '但不会把同一种关心写成固定模板。',
  '历史只在当前分析进程中临时存在。',
].join('').repeat(600);
assert.ok([...rawHistory].length > 27_000);

const packets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [daily('daily:bounded-27k', [...rawHistory].slice(0, 27_000).join(''))],
  requestedLanes: ['language_fingerprint', 'stable_detail', 'opening_proactive'],
  maxPacketChars: 9_000,
  maxEvidenceChars: 9_000,
  maxEvidenceItems: 1,
  createdAt: 1_768_700_001_000,
});
assert.equal(packets.length, 3, '27k code points must remain three canonical packets');

assert.throws(
  () => buildHistoryCompanionAnalysisPrompt({ packets }),
  /exceeds planned budget/,
  'the full large packet set must not be forced through one model request',
);

const batches = planHistoryCompanionAnalysisPromptBatches({
  packets,
  maxPromptChars: 24_000,
  createdAt: 1_768_700_001_100,
});
assert.ok(batches.length > 1, 'the 27k source must use more than one bounded request');
assert.deepEqual(
  batches.flatMap(batch => batch.packets.map(packet => packet.id)),
  packets.map(packet => packet.id),
  'signed batches must retain canonical exact-once packet coverage',
);
batches.forEach(batch => {
  assert.deepEqual(validateHistoryCompanionAnalysisBoundedBatch(batch), []);
  const prompt = buildHistoryCompanionAnalysisPrompt({ batch });
  assert.ok(prompt.promptChars <= 24_000);
  assert.equal(prompt.batchPlanId, batch.plan.id);
  assert.equal(prompt.batchId, batch.manifest.id);
  assert.equal(prompt.userPrompt.includes(rawHistory), false);
});

const ephemeralDrafts = batches.map((_, index) => (
  `第 ${index + 1} 批只形成非逐字、无运行时权威的语义草稿。`
));
const draftReceipts = batches.map((batch, index) => (
  createHistoryCompanionAnalysisBatchDraftReceipt({
    batch,
    ephemeralDraft: ephemeralDrafts[index],
    completedAt: 1_768_700_002_000 + index,
  })
));
draftReceipts.forEach(receipt => {
  assert.equal(receipt.runtimeAuthority, 'none');
  assert.equal(receipt.truthEffect, 'none');
  assert.equal(JSON.stringify(receipt).includes('语义草稿'), false);
});

const coverage = createHistoryCompanionAnalysisCoverageReceipt({
  plan: batches[0].plan,
  batchDraftReceipts: draftReceipts,
  createdAt: 1_768_700_003_000,
});
assert.deepEqual(
  validateHistoryCompanionAnalysisCoverageReceipt(
    batches[0].plan,
    draftReceipts,
    coverage,
  ),
  [],
);
assert.equal(coverage.coverage, 'all_packets_exactly_once');
assert.equal(coverage.runtimeAuthority, 'none');

const synthesisPrompt = buildHistoryCompanionAnalysisSynthesisPrompt({
  plan: batches[0].plan,
  coverageReceipt: coverage,
  batchDrafts: draftReceipts.map((receipt, index) => ({
    receipt,
    ephemeralDraft: ephemeralDrafts[index],
  })),
});
assert.ok(synthesisPrompt.promptChars <= 24_000);
assert.equal(synthesisPrompt.runtimeAuthority, 'none');
assert.equal(synthesisPrompt.userPrompt.includes(rawHistory), false);

const synthesis = createHistoryCompanionAnalysisSynthesisEnvelope({
  plan: batches[0].plan,
  coverageReceipt: coverage,
  batchDrafts: draftReceipts.map((receipt, index) => ({
    receipt,
    ephemeralDraft: ephemeralDrafts[index],
  })),
  ephemeralSynthesisDraft: '综合各批后仍只是待独立裁决的非逐字角色素材草稿。',
  createdAt: 1_768_700_004_000,
});
assert.deepEqual(
  validateHistoryCompanionAnalysisSynthesisEnvelope(
    batches[0].plan,
    coverage,
    draftReceipts,
    synthesis,
  ),
  [],
);
assert.equal(synthesis.requiresIndependentAdjudication, true);
assert.equal(synthesis.runtimeAuthority, 'none');
assert.equal(JSON.stringify(synthesis).includes('角色素材草稿'), false);
assert.throws(
  () => createHistoryCompanionAnalysisReview({
    packets,
    analysisRunId: 'bounded-direct-bypass',
    extractorVersion: 'bounded-fixture-v1',
    analyzerPrincipal: {
      kind: 'model_runtime',
      principalId: 'bounded-direct-analyzer',
      provider: 'fixture',
      modelOrActor: 'fixture-analyzer',
      capturedBy: 'authenticated_runtime',
    },
    method: {
      name: 'bounded_direct_bypass',
      version: '1',
      reviewerKind: 'model_semantic_draft',
    },
    findings: [],
  }),
  /exceeds planned budget/,
  'a large packet set cannot bypass its bounded synthesis authority with a direct review',
);

const boundedFinding: HistoryCompanionAnalysisFinding = {
  id: 'bounded-opening-finding',
  lane: 'opening_proactive',
  decision: 'accepted',
  evidenceIds: packets.slice(0, 2).map(packet => packet.evidence[0].id),
  confidence: 0.76,
  guidance: '开场可以从角色手边尚在进行的小事落地，再依现场回应决定是否展开。',
  tags: ['opening_shape'],
  speakerResolution: 'primary_character_direct',
  materialKind: 'opening_recipe',
  behaviorBoundary: {
    variationPreserved: true,
    fixedReplyTemplate: false,
    currentStateEffect: 'none',
    toolPolicyEffect: 'none',
  },
  reviewReason: '完整分包综合后形成一条仍待独立裁决的非逐字开场方向。',
  uncertaintyOrConflict: '它不指定当轮动作，也不声明任何旧场景正在发生。',
};
const boundedReview = createHistoryCompanionAnalysisReviewFromSynthesis({
  packets,
  plan: batches[0].plan,
  coverageReceipt: coverage,
  batchDraftReceipts: draftReceipts,
  synthesisEnvelope: synthesis,
  analysisRunId: 'bounded-synthesis-review',
  extractorVersion: 'bounded-fixture-v1',
  analyzerPrincipal: {
    kind: 'model_runtime',
    principalId: 'bounded-synthesis-analyzer',
    provider: 'fixture',
    modelOrActor: 'fixture-analyzer',
    capturedBy: 'authenticated_runtime',
  },
  method: {
    name: 'bounded_synthesis_review',
    version: '1',
    reviewerKind: 'model_semantic_draft',
  },
  findings: [boundedFinding],
  reviewedAt: 1_768_700_004_100,
});
assert.equal(boundedReview.analysisPath.kind, 'bounded_synthesis');
const boundedAdjudication = createHistoryCompanionAnalysisAdjudicationReceipt({
  packets,
  review: boundedReview,
  adjudicationRunId: 'bounded-synthesis-adjudication',
  adjudicatorPrincipal: {
    kind: 'model_runtime',
    principalId: 'bounded-synthesis-adjudicator',
    provider: 'fixture',
    modelOrActor: 'fixture-adjudicator',
    capturedBy: 'authenticated_runtime',
  },
  method: {
    name: 'bounded_synthesis_adjudication',
    version: '1',
    reviewerKind: 'independent_model_adjudication',
  },
  findings: [{
    findingId: boundedFinding.id,
    decision: 'approved',
    evidenceSpeakerAttributions: boundedFinding.evidenceIds.map(evidenceId => ({
      evidenceId,
      speakerResolution: 'primary_character_direct',
      reason: '独立夹具确认这条 evidence 属于主角色直述通道。',
    })),
    reason: '独立夹具确认综合方向保留变奏且没有 truth effect。',
  }],
  adjudicatedAt: 1_768_700_004_200,
});
const boundedFinalization = finalizeHistoryCompanionAnalysisReview(
  packets,
  boundedReview,
  boundedAdjudication,
);
assert.equal(boundedFinalization.pass.candidates.length, 1);
assert.equal(
  boundedFinalization.activationReceipt.reviewRunId,
  boundedReview.analysisRunId,
);

const tamperedBoundedReview = {
  ...boundedReview,
  analysisPath: boundedReview.analysisPath.kind === 'bounded_synthesis'
    ? {
      ...boundedReview.analysisPath,
      synthesisEnvelope: {
        ...boundedReview.analysisPath.synthesisEnvelope,
        coverageReceiptId: 'forged-coverage',
      },
    }
    : boundedReview.analysisPath,
};
assert.match(
  validateHistoryCompanionAnalysisReview(packets, tamperedBoundedReview).join('\n'),
  /coverageReceiptId mismatch|id mismatch/,
  'activation-bound review cannot detach itself from its exact synthesis coverage',
);
assert.throws(() => createHistoryCompanionAnalysisSynthesisEnvelope({
  plan: batches[0].plan,
  coverageReceipt: coverage,
  batchDrafts: draftReceipts.map((receipt, index) => ({
    receipt,
    ephemeralDraft: index === 0 ? '被替换的批草稿' : ephemeralDrafts[index],
  })),
  ephemeralSynthesisDraft: '不应签发。',
}), /does not match its receipt/);

assert.throws(() => createHistoryCompanionAnalysisBatchPlan({
  packets,
  packetGroups: [[packets[0]], [packets[2]]],
  maxPromptChars: 24_000,
}), /cover every packet exactly once/);
assert.throws(() => createHistoryCompanionAnalysisBatchPlan({
  packets,
  packetGroups: [[packets[0]], [packets[1]], [packets[1]], [packets[2]]],
  maxPromptChars: 24_000,
}), /cover every packet exactly once/);
assert.throws(() => createHistoryCompanionAnalysisCoverageReceipt({
  plan: batches[0].plan,
  batchDraftReceipts: draftReceipts.slice(1),
}), /every batch exactly once/);
assert.throws(() => createHistoryCompanionAnalysisCoverageReceipt({
  plan: batches[0].plan,
  batchDraftReceipts: [draftReceipts[0], draftReceipts[0], ...draftReceipts.slice(1)],
}), /duplicate|every batch exactly once/);

const anotherBuild = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [daily('daily:other-build', '另一轮 build 的 packet。')],
  requestedLanes: ['language_fingerprint', 'stable_detail', 'opening_proactive'],
});
assert.throws(() => createHistoryCompanionAnalysisBatchPlan({
  packets,
  packetGroups: [[packets[0]], [anotherBuild[0]], [packets[2]]],
  maxPromptChars: 24_000,
}), /cover every packet exactly once/);
const mixedBuildBatch = {
  ...batches[0],
  packets: [anotherBuild[0]],
};
assert.match(
  validateHistoryCompanionAnalysisBoundedBatch(mixedBuildBatch).join('\n'),
  /does not match manifest|mixes another packet set/,
);

const otherScope: HistoryScope = { ...scope, personaMaskId: 'mask-other' };
const otherScopePacket = buildHistoryCompanionAnalysisPackets({
  scope: otherScope,
  documents: [daily('daily:other-scope', '另一个 scope。', otherScope)],
  requestedLanes: ['language_fingerprint', 'stable_detail', 'opening_proactive'],
})[0];
assert.match(
  validateHistoryCompanionAnalysisBoundedBatch({
    ...batches[0],
    packets: [otherScopePacket],
  }).join('\n'),
  /crosses scope|mixes another packet set|do not match manifest/,
);

const otherRevisionPacket = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [daily('daily:other-revision', '另一个 revision。')],
  requestedLanes: ['language_fingerprint', 'stable_detail', 'opening_proactive'],
})[0];
assert.match(
  validateHistoryCompanionAnalysisBoundedBatch({
    ...batches[0],
    packets: [otherRevisionPacket],
  }).join('\n'),
  /crosses source revision|mixes another packet set|do not match manifest/,
);

const otherLanePacket = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [daily('daily:other-lane', '另一个 lane set。')],
  requestedLanes: ['scene_texture'],
})[0];
assert.match(
  validateHistoryCompanionAnalysisBoundedBatch({
    ...batches[0],
    packets: [otherLanePacket],
  }).join('\n'),
  /crosses canonical lane set|mixes another packet set|do not match manifest/,
);

const tamperedSynthesis = {
  ...synthesis,
  sourceRevisionFingerprint: `sha256:${'e'.repeat(64)}`,
};
assert.match(
  validateHistoryCompanionAnalysisSynthesisEnvelope(
    batches[0].plan,
    coverage,
    draftReceipts,
    tamperedSynthesis,
  ).join('\n'),
  /crosses source revision|id mismatch/,
);

console.log(
  `history companion bounded batches: green packets=${packets.length} `
  + `batches=${batches.length}`,
);
