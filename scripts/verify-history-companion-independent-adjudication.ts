import assert from 'node:assert/strict';
import {
  buildHistoryCompanionAnalysisPackets,
  createHistoryCompanionAnalysisAdjudicationReceipt,
  createHistoryCompanionAnalysisReview,
  finalizeHistoryCompanionAnalysisReview,
  validateHistoryCompanionAnalysisReview,
  type HistoryCompanionAnalysisFinding,
  type HistoryCompanionAnalysisReview,
  type HistoryCompanionFindingAdjudication,
} from '../domain/historyImport/companionMaterial/index.ts';
import type { DailyArchiveDocument } from '../domain/dailyArchive/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const scope: HistoryScope = {
  progressBundleId: 'bundle-independent-adjudication',
  personaMaskId: 'mask-independent-adjudication',
  charId: 'char-independent-adjudication',
};

const daily = (
  id: string,
  dateKey: string,
  content: string,
): DailyArchiveDocument => ({
  schemaVersion: 2,
  id,
  scope: { ...scope },
  sourceKinds: ['history_import'],
  dateKey,
  messages: [{
    schemaVersion: 2,
    id: `${id}:message`,
    scope: { ...scope },
    source: 'history_import',
    sourceRecordId: `${id}:source`,
    sourceOrder: 0,
    role: 'character',
    kind: 'text',
    content,
    time: { dateKey, precision: 'day' },
    status: 'active',
    recordedAt: 1_768_800_000_000,
    revision: 1,
  }],
  messageCount: 1,
  firstTimestamp: 1_768_800_000_000,
  lastTimestamp: 1_768_800_000_000,
  createdAt: 1_768_800_000_000,
  updatedAt: 1_768_800_000_000,
  revision: 1,
});

const packets = buildHistoryCompanionAnalysisPackets({
  scope,
  documents: [
    daily('day-one', '2025-07-01', '先把旧唱片放回柜子，他才问起今天的新鲜事。'),
    daily('day-two', '2025-07-02', '忙完自己的模型，他留了一张便签，等对方有空再看。'),
    daily('day-npc', '2025-07-03', '同事转述小岚的话：主角每次都会这样安慰人。'),
    daily('day-short', '2025-07-04', '可以'),
    daily('day-unselected', '2025-07-05', 'ＡＢＣ安静地站在门边'),
  ],
  maxPacketChars: 500,
  maxEvidenceChars: 100,
  createdAt: 1_768_800_000_100,
});
const evidence = packets.flatMap(packet => packet.evidence);
const [first, second, npc, short, unselected] = evidence;
const analyzerPrincipal = {
  kind: 'model_runtime' as const,
  principalId: 'fixture-analyzer-principal',
  provider: 'fixture-provider',
  modelOrActor: 'fixture-analyzer',
  capturedBy: 'authenticated_runtime' as const,
};
const adjudicatorPrincipal = {
  kind: 'model_runtime' as const,
  principalId: 'fixture-adjudicator-principal',
  provider: 'fixture-provider',
  modelOrActor: 'fixture-adjudicator',
  capturedBy: 'authenticated_runtime' as const,
};

const boundary = {
  variationPreserved: true,
  fixedReplyTemplate: false as const,
  currentStateEffect: 'none' as const,
  toolPolicyEffect: 'none' as const,
};

const voiceDiagnostics = {
  nameBlindStatus: 'passed' as const,
  commonGoodBehaviorStatus: 'passed' as const,
  attentionLanding: '先回应一个可感知的落点，再打开交流空间。',
  responseRhythm: '起承顺序可以伸缩，不绑定固定句式。',
  mouthShapes: ['短落点后自然展开', '用具体事物连接开放回应'],
  expressionRange: '允许轻快、沉静、玩笑与认真切换。',
  independentLifePosture: '角色保有正在进行的生活，不围绕玩家待机。',
};

const voice: HistoryCompanionAnalysisFinding = {
  id: 'voice',
  lane: 'language_fingerprint',
  decision: 'accepted',
  evidenceIds: [first.id, second.id],
  confidence: 0.86,
  guidance: '表达会先抓住一个具体落点，然后自然带出自身节奏，并把话题选择权留在现场。',
  tags: ['speech_rhythm', 'initiative_style'],
  speakerResolution: 'primary_character_direct',
  behaviorBoundary: boundary,
  voiceDiagnostics,
  reviewReason: '两组独立材料支持相同的注意力与节奏特征。',
  uncertaintyOrConflict: '只校准表达方向，不指定当前事实或固定话术。',
};

const stable: HistoryCompanionAnalysisFinding = {
  id: 'stable',
  lane: 'stable_detail',
  decision: 'accepted',
  evidenceIds: [first.id, second.id],
  confidence: 0.78,
  guidance: '可按需参考角色重视手边秩序、同时保留对方自主空间这一稳定倾向。',
  tags: ['stable_habit'],
  speakerResolution: 'primary_character_direct',
  behaviorBoundary: boundary,
  reviewReason: '跨日材料呈现一致倾向。',
  uncertaintyOrConflict: '不是当前状态，也不把倾向升级为永恒规则。',
};

const motive: HistoryCompanionAnalysisFinding = {
  id: 'motive',
  lane: 'opening_proactive',
  decision: 'accepted',
  evidenceIds: [first.id, second.id],
  confidence: 0.76,
  guidance: '需要主动展开时，可从角色自己的未完事项中生成候选缘由，再由现场反馈决定是否采用。',
  tags: ['proactive_intent'],
  materialKind: 'initiative_motive',
  speakerResolution: 'primary_character_direct',
  behaviorBoundary: boundary,
  reviewReason: '材料支持角色从自生活发起互动。',
  uncertaintyOrConflict: '只是候选，不代表此刻已经发生。',
};

const scene: HistoryCompanionAnalysisFinding = {
  id: 'scene',
  lane: 'scene_texture',
  decision: 'accepted',
  evidenceIds: [first.id],
  confidence: 0.71,
  guidance: '场景规划可以借用可触碰的小物件形成互动支点，但应让角色与玩家共同改变走向。',
  tags: ['scene_permission'],
  speakerResolution: 'primary_character_direct',
  behaviorBoundary: boundary,
  reviewReason: '材料提供了可转化的场景支点。',
  uncertaintyOrConflict: '不宣称该物件仍在当前现场。',
};

const sourceReview = createHistoryCompanionAnalysisReview({
  packets,
  analysisRunId: 'semantic-draft-run',
  extractorVersion: 'semantic-draft-v1',
  analyzerPrincipal,
  method: {
    name: 'semantic_draft',
    version: '1',
    reviewerKind: 'model_semantic_draft',
  },
  findings: [voice, stable, motive, scene],
  reviewedAt: 1_768_800_000_200,
});
assert.deepEqual(validateHistoryCompanionAnalysisReview(packets, sourceReview), []);
assert.equal(sourceReview.activationStatus, 'pending_adjudication');
assert.throws(
  () => finalizeHistoryCompanionAnalysisReview(packets, sourceReview),
  /pending until a second-pass adjudication/,
  'a first semantic draft never activates itself',
);

const selfNamedReview = createHistoryCompanionAnalysisReview({
  packets,
  analysisRunId: 'self-named-review-run',
  extractorVersion: 'semantic-review-v1',
  analyzerPrincipal,
  method: {
    name: 'model_claimed_review',
    version: '1',
    reviewerKind: 'model_semantic_review',
  },
  findings: [voice, stable, motive, scene],
  reviewedAt: 1_768_800_000_210,
});
assert.equal(selfNamedReview.activationStatus, 'pending_adjudication');
assert.throws(
  () => finalizeHistoryCompanionAnalysisReview(packets, selfNamedReview),
  /pending until a second-pass adjudication/,
  'a model cannot activate findings by naming its own JSON a semantic review',
);

const attributions = (
  finding: HistoryCompanionAnalysisFinding,
): HistoryCompanionFindingAdjudication => ({
  findingId: finding.id,
  decision: 'approved',
  evidenceSpeakerAttributions: finding.evidenceIds.map(evidenceId => ({
    evidenceId,
    speakerResolution: 'primary_character_direct',
    reason: '独立检查确认该片段由当前关系中的主角色直接表达。',
  })),
  reason: '独立复核支持该非逐字方向，且未把它升级为当前事实。',
});
const approved = [voice, stable, motive, scene].map(attributions);

assert.throws(
  () => createHistoryCompanionAnalysisAdjudicationReceipt({
    packets,
    review: sourceReview,
    adjudicationRunId: sourceReview.analysisRunId,
    adjudicatorPrincipal,
    method: {
      name: 'independent_adjudicator',
      version: '1',
      reviewerKind: 'independent_model_adjudication',
    },
    findings: approved,
    adjudicatedAt: 1_768_800_000_300,
  }),
  /different run identity/,
  'same-run self-endorsement is never a valid adjudication receipt',
);

assert.throws(
  () => createHistoryCompanionAnalysisAdjudicationReceipt({
    packets,
    review: sourceReview,
    adjudicationRunId: 'role-renamed-same-model-run',
    adjudicatorPrincipal: {
      ...analyzerPrincipal,
      principalId: 'fixture-adjudicator-role-on-same-model',
    },
    method: {
      name: 'independent_adjudicator',
      version: '1',
      reviewerKind: 'independent_model_adjudication',
    },
    findings: approved,
    adjudicatedAt: 1_768_800_000_300,
  }),
  /cannot reuse the analyzer provider and model/,
  'renaming a role-bound principal cannot manufacture independent adjudication',
);

const receipt = createHistoryCompanionAnalysisAdjudicationReceipt({
  packets,
  review: sourceReview,
  adjudicationRunId: 'independent-adjudication-run',
  adjudicatorPrincipal,
  method: {
    name: 'independent_adjudicator',
    version: '1',
    reviewerKind: 'independent_model_adjudication',
  },
  findings: approved,
  adjudicatedAt: 1_768_800_000_300,
});
const materialPass = finalizeHistoryCompanionAnalysisReview(packets, sourceReview, receipt).pass;
assert.equal(materialPass.candidates.length, 4, 'the independent gate retains legal positive paths');
assert.deepEqual(
  new Set(materialPass.candidates.map(candidate => candidate.slot)),
  new Set([
    'stable_character_voice',
    'relevant_stable_details',
    'motive_candidates',
    'scene_affordances',
  ]),
);

const npcClaim: HistoryCompanionAnalysisFinding = {
  ...voice,
  id: 'npc-forwarded-as-direct',
  evidenceIds: [first.id, npc.id],
  reviewReason: '初审误把转述当作主角色直说。',
};
const npcReview = createHistoryCompanionAnalysisReview({
  packets,
  analysisRunId: 'npc-semantic-run',
  extractorVersion: 'semantic-v1',
  analyzerPrincipal,
  method: {
    name: 'semantic_draft',
    version: '1',
    reviewerKind: 'model_semantic_draft',
  },
  findings: [npcClaim],
  reviewedAt: 1_768_800_000_400,
});
assert.throws(
  () => createHistoryCompanionAnalysisAdjudicationReceipt({
    packets,
    review: npcReview,
    adjudicationRunId: 'npc-independent-run',
    adjudicatorPrincipal,
    method: {
      name: 'independent_adjudicator',
      version: '1',
      reviewerKind: 'independent_model_adjudication',
    },
    findings: [{
      findingId: npcClaim.id,
      decision: 'approved',
      evidenceSpeakerAttributions: [
        {
          evidenceId: first.id,
          speakerResolution: 'primary_character_direct',
          reason: '主角色直接表达。',
        },
        {
          evidenceId: npc.id,
          speakerResolution: 'coauthored_multi_actor',
          reason: '这是 NPC 转述，不是主角色直接发言。',
        },
      ],
      reason: '尝试保留初审结论。',
    }],
    adjudicatedAt: 1_768_800_000_500,
  }),
  /claimed direct speaker ownership|independently confirmed direct character speech/,
  'an NPC retelling cannot self-report primary-character ownership',
);

const invalidReview = (
  finding: HistoryCompanionAnalysisFinding,
  pattern: RegExp,
): void => {
  const review: HistoryCompanionAnalysisReview = {
    ...sourceReview,
    analysisRunId: `invalid-${finding.id}`,
    findings: [finding],
  };
  assert.match(validateHistoryCompanionAnalysisReview(packets, review).join('\n'), pattern);
};

const shortNaturalRewrite: HistoryCompanionAnalysisReview = {
  ...sourceReview,
  analysisRunId: 'short-natural-rewrite',
  findings: [{
    ...stable,
    id: 'short-natural-rewrite',
    evidenceIds: [short.id, first.id],
    guidance: '遇到紧张时可以先让互动慢下来，再根据现场决定后续方向。',
  }],
};
assert.deepEqual(
  validateHistoryCompanionAnalysisReview(packets, shortNaturalRewrite),
  [],
  'a common two-character source phrase must not poison natural rewritten guidance',
);

invalidReview({
  ...stable,
  id: 'short-exact-copy',
  evidenceIds: [short.id, first.id],
  guidance: '可以',
}, /overlaps source text/);

invalidReview({
  ...voice,
  id: 'unselected-copy',
  guidance: '表达方向可以概括成 ABC安静地站在门边，再补充自己的判断。',
}, /overlaps source text/);

invalidReview({
  ...voice,
  id: 'zero-width-replay',
  guidance: 'Ａ\u200BＢ\u200CＣ安\u2060静地站在门边',
}, /overlaps source text/);

console.log(`history companion independent adjudication: green candidates=${materialPass.candidates.length}`);
