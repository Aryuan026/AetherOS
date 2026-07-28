import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import type { DailyArchiveDocument, DailyArchiveMessage } from '../domain/dailyArchive/types.ts';
import { DAILY_ARCHIVE_SCHEMA_VERSION } from '../domain/dailyArchive/types.ts';
import {
  buildHistoryCompanionAnalysisPackets,
  createHistoryCompanionAnalysisAdjudicationReceipt,
  createHistoryCompanionAnalysisReview,
  finalizeHistoryCompanionAnalysisReview,
  type HistoryCompanionAnalysisFinding,
  type HistoryCompanionAnalysisFinalization,
  type HistoryCompanionAnalysisPacket,
  type HistoryCompanionAnalysisReview,
  type HistoryCompanionAnalysisAdjudicationReceipt,
} from '../domain/historyImport/companionMaterial/index.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  getDailyArchiveDocument,
  upsertDailyArchiveMessages,
} from '../utils/dailyArchive/storage.ts';
import { loadCompanionMaterialRecords } from '../utils/companionMaterial/store.ts';
import { getHistoryCompanionMaterialPass } from '../utils/historyImport/companionMaterial/indexedDbPasses.ts';
import { publishHistoryCompanionMaterialPass } from '../utils/historyImport/companionMaterial/publish.ts';
import {
  appendHistoryCompanionAnalysisFinalizationActivation,
} from '../utils/historyImport/companionMaterial/sourceAuthority.ts';

const T0 = 1_785_000_000_000;
const DATE_KEY = '2026-07-18';
const ZERO_FINDING_DATE_KEY = '2026-07-19';
const SCOPE_A: HistoryScope = {
  progressBundleId: 'bundle-publish-freshness',
  personaMaskId: 'mask-publish-freshness-a',
  charId: 'char-publish-freshness',
};
const SCOPE_B: HistoryScope = {
  ...SCOPE_A,
  personaMaskId: 'mask-publish-freshness-b',
};

const archiveMessage = (input: {
  scope: HistoryScope;
  id: string;
  content: string;
  revision: number;
  dateKey?: string;
  role?: DailyArchiveMessage['role'];
}): DailyArchiveMessage => ({
  schemaVersion: DAILY_ARCHIVE_SCHEMA_VERSION,
  id: input.id,
  scope: { ...input.scope },
  source: 'history_import',
  sourceRecordId: input.id,
  sourceBatchId: 'publish-freshness-batch',
  sourceOrder: 0,
  role: input.role ?? 'character',
  kind: 'text',
  content: input.content,
  time: {
    dateKey: input.dateKey ?? DATE_KEY,
    iso: `${input.dateKey ?? DATE_KEY}T10:00:00.000Z`,
    epochMs: Date.parse(`${input.dateKey ?? DATE_KEY}T10:00:00.000Z`),
    precision: 'exact',
  },
  status: 'active',
  recordedAt: T0,
  revision: input.revision,
});

interface FinalizationFixture {
  packets: readonly HistoryCompanionAnalysisPacket[];
  review: HistoryCompanionAnalysisReview;
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt;
  finalization: HistoryCompanionAnalysisFinalization;
}

const finalizationFor = (input: {
  scope: HistoryScope;
  documents: readonly DailyArchiveDocument[];
  suffix: string;
  guidance: string;
  at: number;
}): FinalizationFixture => {
  const packets = buildHistoryCompanionAnalysisPackets({
    scope: input.scope,
    documents: input.documents,
    requestedLanes: ['scene_texture'],
    maxPacketChars: 2_000,
    maxEvidenceChars: 1_000,
    createdAt: input.at,
  });
  const finding: HistoryCompanionAnalysisFinding = {
    id: `freshness-scene-${input.suffix}`,
    lane: 'scene_texture',
    decision: 'accepted',
    evidenceIds: packets.flatMap(packet => packet.evidence.map(evidence => evidence.id)),
    confidence: 0.78,
    guidance: input.guidance,
    tags: ['scene_permission'],
    speakerResolution: 'primary_character_direct',
    behaviorBoundary: {
      variationPreserved: true,
      fixedReplyTemplate: false,
      currentStateEffect: 'none',
      toolPolicyEffect: 'none',
    },
    reviewReason: '合成夹具提供一个可转化但不宣称已发生的场景支点。',
    uncertaintyOrConflict: '只作为未来场景候选，不建立当前状态。',
  };
  const review = createHistoryCompanionAnalysisReview({
    packets,
    analysisRunId: `freshness-analysis-${input.suffix}`,
    extractorVersion: 'freshness-analyzer-v1',
    analyzerPrincipal: {
      kind: 'model_runtime',
      principalId: `freshness-analyzer-${input.suffix}`,
      provider: 'fixture',
      modelOrActor: 'fixture-analyzer',
      capturedBy: 'authenticated_runtime',
    },
    method: {
      name: 'freshness_semantic_draft',
      version: '1',
      reviewerKind: 'model_semantic_draft',
    },
    findings: [finding],
    reviewedAt: input.at + 1,
  });
  const adjudication = createHistoryCompanionAnalysisAdjudicationReceipt({
    packets,
    review,
    adjudicationRunId: `freshness-adjudication-${input.suffix}`,
    adjudicatorPrincipal: {
      kind: 'model_runtime',
      principalId: `freshness-adjudicator-${input.suffix}`,
      provider: 'fixture',
      modelOrActor: 'fixture-adjudicator',
      capturedBy: 'authenticated_runtime',
    },
    method: {
      name: 'freshness_independent_adjudication',
      version: '1',
      reviewerKind: 'independent_model_adjudication',
    },
    findings: [{
      findingId: finding.id,
      decision: 'approved',
      evidenceSpeakerAttributions: finding.evidenceIds.map(evidenceId => ({
        evidenceId,
        speakerResolution: 'primary_character_direct',
        reason: '独立夹具确认当前 evidence 属于主角色通道。',
      })),
      reason: '独立夹具确认非逐字方向保留变奏且没有 truth effect。',
    }],
    adjudicatedAt: input.at + 2,
  });
  return {
    packets,
    review,
    adjudication,
    finalization: finalizeHistoryCompanionAnalysisReview(packets, review, adjudication),
  };
};

const appendFinalization = async (fixture: FinalizationFixture): Promise<void> => {
  await appendHistoryCompanionAnalysisFinalizationActivation(fixture);
};

await upsertDailyArchiveMessages({
  messages: [
    archiveMessage({
    scope: SCOPE_A,
    id: 'publish-freshness-message-a',
    content: '第一版日档正文。',
    revision: 1,
    }),
    archiveMessage({
      scope: SCOPE_A,
      id: 'publish-freshness-system-only-a',
      content: '仅系统记录，不产生语义 finding。',
      revision: 1,
      dateKey: ZERO_FINDING_DATE_KEY,
      role: 'system',
    }),
  ],
  now: T0,
});
const documentA1 = await getDailyArchiveDocument({ scope: SCOPE_A, dateKey: DATE_KEY });
const zeroFindingDocumentA1 = await getDailyArchiveDocument({
  scope: SCOPE_A,
  dateKey: ZERO_FINDING_DATE_KEY,
});
assert.ok(documentA1);
assert.ok(zeroFindingDocumentA1);
const primary = finalizationFor({
  scope: SCOPE_A,
  documents: [documentA1, zeroFindingDocumentA1],
  suffix: 'primary',
  guidance: '未来场景可以从一件双方都看见的小变化开始，再由现场决定走向。',
  at: T0 + 10,
});
const alternate = finalizationFor({
  scope: SCOPE_A,
  documents: [documentA1, zeroFindingDocumentA1],
  suffix: 'alternate',
  guidance: '另一条剧情线可以从角色手边的未完物件切入，但保持为可放弃的候选。',
  at: T0 + 20,
});

await assert.rejects(
  () => publishHistoryCompanionMaterialPass({
    pass: primary.finalization.pass,
    activationReceiptId: '',
  }),
  /canonical activationReceiptId is required/,
);
await appendFinalization(primary);
await appendFinalization(primary);
const primaryPublication = await publishHistoryCompanionMaterialPass({
  pass: primary.finalization.pass,
  activationReceiptId: primary.finalization.activationReceipt.id,
  publishedAt: T0 + 30,
});
assert.equal(
  primaryPublication.activationReceiptId,
  primary.finalization.activationReceipt.id,
  'publication exposes the exact canonical activation receipt it consumed',
);

await appendFinalization(alternate);
await publishHistoryCompanionMaterialPass({
  pass: alternate.finalization.pass,
  activationReceiptId: alternate.finalization.activationReceipt.id,
  publishedAt: T0 + 31,
});
assert.equal(
  (await loadCompanionMaterialRecords(SCOPE_A)).length,
  2,
  'alternate interpretations coexist unless explicitly superseded',
);

const forgedInMemoryDocument = {
  ...documentA1,
  messages: documentA1.messages.map(message => ({
    ...message,
    content: '同一 document id 和 revision 下被替换的内存正文。',
  })),
};
const forgedSourceFinalization = finalizationFor({
  scope: SCOPE_A,
  documents: [forgedInMemoryDocument, zeroFindingDocumentA1],
  suffix: 'forged-source-body',
  guidance: '替换正文产生的候选不能继承真实日档头。',
  at: T0 + 32,
});
await assert.rejects(
  () => appendFinalization(forgedSourceFinalization),
  /activation receipt is stale/,
  'packet source fingerprint is derived from its actual input body and must match the canonical archive head',
);

const handEditedPass = {
  ...primary.finalization.pass,
  candidates: primary.finalization.pass.candidates.map(candidate => ({
    ...candidate,
    guidance: '手工改写的 active pass 不能继承旧回执。',
  })),
};
await assert.rejects(
  () => publishHistoryCompanionMaterialPass({
    pass: handEditedPass,
    activationReceiptId: primary.finalization.activationReceipt.id,
  }),
  /targets another pass/,
);

await upsertDailyArchiveMessages({
  messages: [archiveMessage({
    scope: SCOPE_A,
    id: 'publish-freshness-system-only-a',
    content: '系统记录已被修改，虽然它仍不会生成 finding。',
    revision: 2,
    dateKey: ZERO_FINDING_DATE_KEY,
    role: 'system',
  })],
  now: T0 + 90,
});
await assert.rejects(
  () => publishHistoryCompanionMaterialPass({
    pass: primary.finalization.pass,
    activationReceiptId: primary.finalization.activationReceipt.id,
  }),
  /stale Daily Archive document revision|activation receipt is stale/,
  'a changed zero-finding source document invalidates the old activation receipt',
);
assert.equal(
  (await loadCompanionMaterialRecords(SCOPE_A)).length,
  0,
  'already-published history material disappears from runtime selection as soon as any bound source is stale',
);

await upsertDailyArchiveMessages({
  messages: [archiveMessage({
    scope: SCOPE_A,
    id: 'publish-freshness-message-a',
    content: '第二版已经修改的日档正文。',
    revision: 2,
  })],
  now: T0 + 100,
});
await assert.rejects(
  () => publishHistoryCompanionMaterialPass({
    pass: primary.finalization.pass,
    activationReceiptId: primary.finalization.activationReceipt.id,
  }),
  /stale Daily Archive document revision|activation receipt is stale/,
  'publishing always re-reads the current archive head',
);
await assert.rejects(
  () => appendFinalization(primary),
  /stale Daily Archive document revision|activation receipt is stale/,
  'an old finalization cannot be re-appended after source mutation',
);

await upsertDailyArchiveMessages({
  messages: [archiveMessage({
    scope: SCOPE_B,
    id: 'publish-freshness-message-b',
    content: '另一个面具的日档。',
    revision: 1,
  })],
  now: T0 + 200,
});
const documentB = await getDailyArchiveDocument({ scope: SCOPE_B, dateKey: DATE_KEY });
assert.ok(documentB);
const crossScope = finalizationFor({
  scope: SCOPE_B,
  documents: [documentB],
  suffix: 'cross-scope',
  guidance: '另一个面具的候选场景必须保持隔离。',
  at: T0 + 210,
});
await assert.rejects(
  () => publishHistoryCompanionMaterialPass({
    pass: crossScope.finalization.pass,
    activationReceiptId: primary.finalization.activationReceipt.id,
  }),
  /crosses scope|targets another pass/,
);

assert.equal(
  (await getHistoryCompanionMaterialPass({ passId: primary.finalization.pass.id }))?.id,
  primary.finalization.pass.id,
);
console.log('history companion publish authority: green fresh=1 stale=blocked alternate=preserved');
