import assert from 'node:assert/strict';
import {
  appendHistoryCompanionAnalysisFinalizationReceipt,
  buildHistoryCompanionAnalysisPackets,
  createHistoryCompanionAnalysisAuthority,
  createHistoryCompanionAnalysisAdjudicationReceipt,
  createHistoryCompanionAnalysisReview,
  finalizeHistoryCompanionAnalysisReview,
  validateHistoryCompanionActivationReceiptLedger,
  validateHistoryCompanionAnalysisFinalization,
  HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  type HistoryCompanionAnalysisFinding,
} from '../domain/historyImport/companionMaterial/index.ts';
import type { DailyArchiveDocument } from '../domain/dailyArchive/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const scope: HistoryScope = {
  progressBundleId: 'bundle-authority',
  personaMaskId: 'mask-authority',
  charId: 'char-authority',
};

const daily = (
  id: string,
  dateKey: string,
  content: string,
  role: 'character' | 'system' = 'character',
): DailyArchiveDocument => ({
  schemaVersion: 2,
  id,
  scope,
  sourceKinds: ['history_import'],
  dateKey,
  messages: [{
    schemaVersion: 2,
    id: `${id}:message`,
    scope,
    source: 'history_import',
    sourceRecordId: `${id}:source`,
    sourceOrder: 0,
    role,
    kind: 'text',
    content,
    time: { dateKey, precision: 'day' },
    status: 'active',
    recordedAt: 1_768_900_000_000,
    revision: 1,
  }],
  messageCount: 1,
  firstTimestamp: 1_768_900_000_000,
  lastTimestamp: 1_768_900_000_000,
  createdAt: 1_768_900_000_000,
  updatedAt: 1_768_900_000_000,
  revision: 1,
});

const packets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [
    daily('authority-day-one', '2025-08-01', '他结束手边的练习后，才注意到对方换了新的杯子。'),
    daily('authority-day-two', '2025-08-03', '隔天忙完自己的安排，他又从一个具体变化打开话题。'),
    daily('authority-day-zero-finding', '2025-08-04', '仅参与来源版本边界。', 'system'),
  ],
  maxPacketChars: 500,
  maxEvidenceChars: 100,
  createdAt: 1_768_900_000_100,
});
const evidence = packets.flatMap(packet => packet.evidence);

const analyzerPrincipal = {
  kind: 'model_runtime' as const,
  principalId: 'runtime-principal-analyzer',
  provider: 'local-fixture',
  modelOrActor: 'semantic-analyzer',
  capturedBy: 'authenticated_runtime' as const,
};
const adjudicatorPrincipal = {
  kind: 'model_runtime' as const,
  principalId: 'runtime-principal-adjudicator',
  provider: 'local-fixture',
  modelOrActor: 'semantic-adjudicator',
  capturedBy: 'authenticated_runtime' as const,
};

const finding: HistoryCompanionAnalysisFinding = {
  id: 'authority-voice',
  lane: 'language_fingerprint',
  decision: 'accepted',
  evidenceIds: evidence.map(item => item.id),
  confidence: 0.84,
  guidance: '表达可以从现场可感知的落点进入，再自然带出角色自己的节奏，并保留变化空间。',
  tags: ['speech_rhythm', 'initiative_style'],
  speakerResolution: 'primary_character_direct',
  behaviorBoundary: {
    variationPreserved: true,
    fixedReplyTemplate: false,
    currentStateEffect: 'none',
    toolPolicyEffect: 'none',
  },
  voiceDiagnostics: {
    nameBlindStatus: 'passed',
    commonGoodBehaviorStatus: 'passed',
    attentionLanding: '从具体可感知处落地。',
    responseRhythm: '落点与自生活之间可以自由伸缩。',
    mouthShapes: ['短观察后自然展开', '具体回应后留出空间'],
    expressionRange: '允许克制、轻快、认真和玩笑。',
    independentLifePosture: '角色保有自己的事务与节奏。',
  },
  reviewReason: '两组材料提供独立支持。',
  uncertaintyOrConflict: '只形成非逐字表达方向。',
};

const review = createHistoryCompanionAnalysisReview({
  packets,
  analysisRunId: 'authority-analysis-run',
  extractorVersion: 'authority-analyzer-v1',
  analyzerPrincipal,
  method: {
    name: 'semantic_analyzer',
    version: '1',
    reviewerKind: 'model_semantic_draft',
  },
  findings: [finding],
  reviewedAt: 1_768_900_000_200,
});

const adjudicationFinding = {
  findingId: finding.id,
  decision: 'approved' as const,
  evidenceSpeakerAttributions: finding.evidenceIds.map(evidenceId => ({
    evidenceId,
    speakerResolution: 'primary_character_direct' as const,
    reason: '独立运行确认它是主角色直接表达。',
  })),
  reason: '独立运行确认该方向有区分度且不固定回复。',
};

assert.throws(
  () => createHistoryCompanionAnalysisAdjudicationReceipt({
    packets,
    review,
    adjudicationRunId: 'different-run-but-same-principal',
    adjudicatorPrincipal: analyzerPrincipal,
    method: {
      name: 'semantic_adjudicator',
      version: '1',
      reviewerKind: 'independent_model_adjudication',
    },
    findings: [adjudicationFinding],
    adjudicatedAt: 1_768_900_000_300,
  }),
  /different execution principal/,
  'changing runId cannot make one executor independent from itself',
);

const adjudication = createHistoryCompanionAnalysisAdjudicationReceipt({
  packets,
  review,
  adjudicationRunId: 'authority-adjudication-run',
  adjudicatorPrincipal,
  method: {
    name: 'semantic_adjudicator',
    version: '1',
    reviewerKind: 'independent_model_adjudication',
  },
  findings: [adjudicationFinding],
  adjudicatedAt: 1_768_900_000_300,
});

const finalization = finalizeHistoryCompanionAnalysisReview(packets, review, adjudication);
assert.equal(finalization.pass.candidates.length, 1);
assert.equal(finalization.activationReceipt.adjudicationAuthority, 'independent_adjudication');
assert.equal(
  finalization.authorityEnvelope.authority,
  'independent_adjudicated_history_companion_material',
);
assert.match(finalization.activationReceipt.packetSetDigest, /^sha256:[a-f0-9]{64}$/u);
assert.match(finalization.activationReceipt.reviewDigest, /^sha256:[a-f0-9]{64}$/u);
assert.match(finalization.activationReceipt.approvedFindingDigest, /^sha256:[a-f0-9]{64}$/u);
assert.match(finalization.activationReceipt.candidateDigest, /^sha256:[a-f0-9]{64}$/u);
assert.equal(finalization.activationReceipt.analyzerPrincipal.principalId, analyzerPrincipal.principalId);
assert.deepEqual(
  finalization.activationReceipt.sourceDocuments,
  [
    { documentId: 'authority-day-one', documentRevision: 1 },
    { documentId: 'authority-day-two', documentRevision: 1 },
    { documentId: 'authority-day-zero-finding', documentRevision: 1 },
  ],
  'activation receipt binds analyzed documents even when a document yields no finding or evidence',
);
assert.equal(
  finalization.activationReceipt.adjudicatorPrincipal.principalId,
  adjudicatorPrincipal.principalId,
);
assert.deepEqual(validateHistoryCompanionAnalysisFinalization({
  packets,
  review,
  adjudication,
  finalization,
  finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
}), []);

const handEditedPass = {
  ...finalization,
  pass: {
    ...finalization.pass,
    candidates: finalization.pass.candidates.map(candidate => ({
      ...candidate,
      guidance: '手工替换后的 active 素材不应继承原 finalizer 权威。',
    })),
  },
};
assert.match(
  validateHistoryCompanionAnalysisFinalization({
    packets,
    review,
    adjudication,
    finalization: handEditedPass,
    finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  }).join('\n'),
  /not the canonical output/,
  'an active pass cannot impersonate the finalizer after manual mutation',
);
assert.throws(
  () => appendHistoryCompanionAnalysisFinalizationReceipt([], {
    packets,
    review,
    adjudication,
    finalization: handEditedPass,
    finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  }),
  /Invalid history companion finalization/,
  'the append-only authority seam accepts finalizer bundles, not bare active passes',
);

const forgedActivePass = {
  ...finalization.pass,
  id: 'history-material-pass-hand-authored',
  candidates: finalization.pass.candidates.map(candidate => ({
    ...candidate,
    id: 'history-material-candidate-hand-authored',
    guidance: '手写但哈希自洽的 active pass 也不能获得发布权威。',
  })),
};
const forgedAuthority = createHistoryCompanionAnalysisAuthority({
  packets,
  review,
  adjudication,
  pass: forgedActivePass,
  finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
});
const selfConsistentForgery = {
  pass: forgedActivePass,
  ...forgedAuthority,
};
assert.match(
  validateHistoryCompanionAnalysisFinalization({
    packets,
    review,
    adjudication,
    finalization: selfConsistentForgery,
    finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  }).join('\n'),
  /not the canonical output/,
  'self-consistent hashes cannot replace mechanical derivation from approved findings',
);
assert.throws(
  () => appendHistoryCompanionAnalysisFinalizationReceipt([], {
    packets,
    review,
    adjudication,
    finalization: selfConsistentForgery,
    finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  }),
  /Invalid history companion finalization/,
);

const alteredAdjudication = {
  ...adjudication,
  findings: adjudication.findings.map(item => ({
    ...item,
    reason: '事后替换的裁决理由。',
  })),
};
assert.match(
  validateHistoryCompanionAnalysisFinalization({
    packets,
    review,
    adjudication: alteredAdjudication,
    finalization,
    finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  }).join('\n'),
  /not the canonical output/,
  'approved finding and adjudication digests bind the exact reviewed decision',
);

const appendInput = {
  packets,
  review,
  adjudication,
  finalization,
  finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
};
const ledger = appendHistoryCompanionAnalysisFinalizationReceipt([], appendInput);
assert.deepEqual(validateHistoryCompanionActivationReceiptLedger(ledger), []);
assert.throws(
  () => appendHistoryCompanionAnalysisFinalizationReceipt(ledger, appendInput),
  /append-only.*already contains/u,
);
const brokenLedger = ledger.map(entry => ({
  ...entry,
  previousEntryDigest: 'sha256:forged',
}));
assert.match(
  validateHistoryCompanionActivationReceiptLedger(brokenLedger).join('\n'),
  /previousEntryDigest breaks the append-only chain/,
);

console.log(`history companion activation authority: green receipts=${ledger.length}`);
