import assert from 'node:assert/strict';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialRecord,
  type CompanionMaterialSemanticRank,
  type CompanionMaterialSemanticRankAuthority,
  type CompanionMaterialSelectionRequest,
} from '../domain/companionMaterial/types.ts';
import { createCompanionMaterialDeliveryReceipt } from '../domain/companionMaterial/deliveryReceipt.ts';
import {
  companionMaterialSetFingerprint,
  selectCompanionMaterialFromRecords,
} from '../domain/companionMaterial/selection.ts';
import { createHistoryScopeKey } from '../domain/historyImport/contract.ts';

const T0 = 1_800_000_000_000;
const scope = {
  progressBundleId: 'bundle-nonvector',
  personaMaskId: 'mask-nonvector',
  charId: 'char-nonvector',
};

const request = (
  query: string,
  overrides: Partial<CompanionMaterialSelectionRequest> = {},
): CompanionMaterialSelectionRequest => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  requestId: `request:${query}`,
  scope,
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  query,
  relationshipStage: 'unknown',
  budgetChars: 520,
  maxItems: 3,
  now: T0,
  ...overrides,
});

const material = (
  id: string,
  overrides: Partial<CompanionMaterialRecord> = {},
): CompanionMaterialRecord => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  id,
  ownerScope: { kind: 'character', charId: scope.charId },
  charId: scope.charId,
  kind: 'language_fingerprint',
  slot: 'stable_character_voice',
  guidance: '从当下可观察的细节起念，保留自己的判断与生活节奏。',
  renderPolicy: 'style_only',
  knowledge: 'char_private',
  continuity: 'canon',
  eligibleModes: ['remote_chat'],
  eligiblePurposes: ['stable_context'],
  tags: ['observation'],
  retrievalHints: {
    activationPolicy: 'voice_fallback',
    positiveSignals: ['ordinary_share', 'observation'],
    suppressSignals: ['mild_discomfort'],
    variationGroup: 'observant_entry',
    fallbackPriority: 20,
  },
  sourceRefs: [{
    storeFamily: 'fixture',
    recordId: `source-${id}`,
    revision: 1,
    sourceFingerprint: `fingerprint-${id}`,
  }],
  status: 'active',
  createdAt: T0 - 100,
  updatedAt: T0 - 100,
  revision: 1,
  ...overrides,
});

const semanticRankFor = (
  records: readonly CompanionMaterialRecord[],
  scores: CompanionMaterialSemanticRank['scores'],
  overrides: Partial<CompanionMaterialSemanticRank> = {},
): CompanionMaterialSemanticRank => ({
  manifestId: 'fixture-index-manifest',
  manifestDigest: 'sha256:fixture-index-manifest',
  backend: 'embedding',
  modelId: 'fixture-embedding',
  modelArtifactDigest: 'sha256:fixture-model-artifact',
  dimensions: 384,
  metric: 'cosine',
  normalized: true,
  projectionVersion: 'fixture-guidance-v1',
  calibrationRevision: 'fixture-calibration-v1',
  strongThreshold: 0.5,
  indexRevision: 'fixture-index-v1',
  scopeKey: createHistoryScopeKey(scope),
  materialSetFingerprint: companionMaterialSetFingerprint(records),
  scores,
  ...overrides,
});

const semanticAuthorityFor = (
  records: readonly CompanionMaterialRecord[],
  overrides: Partial<CompanionMaterialSemanticRankAuthority> = {},
): CompanionMaterialSemanticRankAuthority => {
  const { scores: _scores, ...binding } = semanticRankFor(records, []);
  return {
    ...binding,
    authority: 'trusted_local_index_manifest',
    ...overrides,
  };
};

const ordinaryVoice = material('ordinary-voice');
assert.notEqual(
  companionMaterialSetFingerprint([ordinaryVoice]),
  companionMaterialSetFingerprint([{ ...ordinaryVoice, status: 'disabled' }]),
  'material activation changes must invalidate an embedding index binding',
);
assert.notEqual(
  companionMaterialSetFingerprint([ordinaryVoice]),
  companionMaterialSetFingerprint([{
    ...ordinaryVoice,
    retrievalHints: {
      ...ordinaryVoice.retrievalHints!,
      suppressSignals: ['mild_discomfort', 'refusal'],
    },
  }]),
  'retrieval-policy changes must invalidate an embedding index binding',
);
const careVoice = material('care-voice', {
  guidance: '需要照看时，把关心落成可实行且可拒绝的一小步。',
  tags: ['care', 'practicality'],
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['care_needed', 'mild_discomfort'],
    suppressSignals: ['refusal', 'low_signal'],
    variationGroup: 'practical_care',
  },
});
const refusalVoice = material('refusal-voice', {
  guidance: '对方拒绝时先尊重选择，再从角色自己的视角自然承接。',
  tags: ['choice', 'agency'],
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['refusal'],
    variationGroup: 'respect_choice',
  },
});
const secondObservation = material('second-observation', {
  guidance: '可以抓住一处小反差展开，但让话题保留转向空间。',
  retrievalHints: {
    activationPolicy: 'voice_fallback',
    positiveSignals: ['ordinary_share', 'observation'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal'],
    variationGroup: 'playful_observation',
    fallbackPriority: 10,
  },
});
const relevantDetail = material('relevant-detail', {
  kind: 'stable_detail',
  slot: 'relevant_stable_details',
  guidance: '谈到下雨与光线时，可以取一处真正相关的生活细节。',
  renderPolicy: 'fact_reference',
  tags: ['rain', 'light'],
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['sensory_detail'],
    variationGroup: 'weather_texture',
  },
});
const genericOrdinaryRequired = material('generic-ordinary-required', {
  guidance: '这条只声明 ordinary share，不能因此被当成真正相关。',
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['ordinary_share'],
    variationGroup: 'generic_ordinary',
  },
});
const selfLifeVoice = material('self-life-voice', {
  guidance: '被问到自己的今天时，可以从已获准的当下生活事实自然起话。',
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['character_self_share', 'independent_life'],
    variationGroup: 'self_life_share',
  },
});

const records = [
  ordinaryVoice,
  careVoice,
  refusalVoice,
  secondObservation,
  relevantDetail,
  genericOrdinaryRequired,
  selfLifeVoice,
];

const lowSignal = selectCompanionMaterialFromRecords({
  request: request('在吗'),
  records,
});
assert.equal(lowSignal.items.length, 1, 'low-signal chat keeps one legal voice fallback');
assert.equal(lowSignal.items[0].slot, 'stable_character_voice');

const genericOrdinary = selectCompanionMaterialFromRecords({
  request: request('今天想聊点事情'),
  records,
});
assert.equal(
  genericOrdinary.selectedMaterialIds.includes(genericOrdinaryRequired.id),
  false,
  'ordinary_share alone is not a discriminating relevance signal',
);
assert.equal(genericOrdinary.items.length, 1, 'generic chat keeps one fallback instead of stacking material');

const ordinary = selectCompanionMaterialFromRecords({
  request: request('我刚刚看到一朵很像水母的云'),
  records,
});
assert.ok(ordinary.items.length >= 1 && ordinary.items.length <= 3);
assert.equal(ordinary.selectedMaterialIds.includes(careVoice.id), false, 'ordinary sharing does not resident-load care');
assert.ok(ordinary.selectedMaterialIds.some(id => id === ordinaryVoice.id || id === secondObservation.id));

const discomfort = selectCompanionMaterialFromRecords({
  request: request('我今天胃有点不舒服'),
  records,
});
assert.deepEqual(discomfort.selectedMaterialIds, [careVoice.id]);

const noAdviceChat = selectCompanionMaterialFromRecords({
  request: request('我今天胃有点不舒服，但不要给我建议，我只想聊聊'),
  records,
});
assert.deepEqual(noAdviceChat.selectedMaterialIds, []);
assert.ok(noAdviceChat.warnings.includes('material_bypass:no_advice_chat'));

const askCharacterToShare = selectCompanionMaterialFromRecords({
  request: request('我不想听建议，只想听你说说你今天'),
  records,
});
assert.equal(
  askCharacterToShare.warnings.includes('material_bypass:no_advice_chat'),
  false,
  'an explicit request for the character to share their life is not a no-advice bypass',
);
assert.ok(askCharacterToShare.selectedMaterialIds.includes(selfLifeVoice.id));

const noAdviceOutsideOrdinaryChat = selectCompanionMaterialFromRecords({
  request: request('不用分析，只想聊聊', { surface: 'call' }),
  records,
});
assert.equal(
  noAdviceOutsideOrdinaryChat.warnings.includes('material_bypass:no_advice_chat'),
  false,
  'the ordinary Chat bypass does not silently govern another surface',
);

const toolRequest = selectCompanionMaterialFromRecords({
  request: request('明天下午三点提醒我交材料'),
  records,
});
assert.deepEqual(toolRequest.selectedMaterialIds, []);
assert.ok(toolRequest.warnings.includes('material_bypass:tool_request'));

const toolTopicWithoutRequest = selectCompanionMaterialFromRecords({
  request: request('我今天日程很乱，想跟你吐槽一下'),
  records,
});
assert.equal(
  toolTopicWithoutRequest.warnings.some(warning => warning === 'material_bypass:tool_request'),
  false,
  'mentioning a schedule is not itself a tool request',
);
assert.equal(toolTopicWithoutRequest.items.length, 1, 'ordinary schedule talk still has a legal fallback path');

for (const ordinaryCreativeRequest of [
  '帮我安排一下这段剧情',
  '帮我记一下你刚才讲的故事',
  '帮我加一下这段对白的氛围',
  '帮我设想一下我们在海边会发生什么',
]) {
  const selection = selectCompanionMaterialFromRecords({
    request: request(ordinaryCreativeRequest),
    records,
  });
  assert.equal(
    selection.warnings.includes('material_bypass:tool_request'),
    false,
    `creative conversation must not masquerade as a tool request: ${ordinaryCreativeRequest}`,
  );
}

const explicitNamedToolRequest = selectCompanionMaterialFromRecords({
  request: request('明天下午三点帮我设个提醒'),
  records,
});
assert.deepEqual(explicitNamedToolRequest.selectedMaterialIds, []);
assert.ok(explicitNamedToolRequest.warnings.includes('material_bypass:tool_request'));

const refusal = selectCompanionMaterialFromRecords({
  request: request('今天不去了，下次吧'),
  records,
});
assert.ok(refusal.selectedMaterialIds.includes(refusalVoice.id));
assert.equal(refusal.selectedMaterialIds.includes(careVoice.id), false);

const recentSelection = selectCompanionMaterialFromRecords({
  request: request('我又看到一片很奇怪的云', {
    requestId: 'recent-observation-selection',
    maxItems: 1,
    semanticRank: semanticRankFor(
      [ordinaryVoice, secondObservation],
      [
        { materialId: ordinaryVoice.id, score: 0.99 },
        { materialId: secondObservation.id, score: 0.1 },
      ],
    ),
  }),
  records: [ordinaryVoice, secondObservation],
  semanticRankAuthority: semanticAuthorityFor([ordinaryVoice, secondObservation]),
});
assert.deepEqual(recentSelection.selectedMaterialIds, [ordinaryVoice.id]);
const recentReceipt = createCompanionMaterialDeliveryReceipt({
  selection: recentSelection,
  consumerRef: { kind: 'prompt', id: 'prompt-recent', revision: '1' },
  delivered: recentSelection.items.map(item => ({
    materialId: item.materialId,
    promptCharCount: item.estimatedChars,
  })),
  occurredAt: T0 - 1000,
});
const rotated = selectCompanionMaterialFromRecords({
  request: request('我又看到一片很奇怪的云', { requestId: 'rotation-request' }),
  records: [ordinaryVoice, secondObservation],
  receipts: [recentReceipt],
});
assert.equal(rotated.selectedMaterialIds[0], secondObservation.id, 'recent receipt rotates an equally relevant voice');

const wrongScope = material('wrong-scope', {
  ownerScope: {
    kind: 'relationship',
    scope: { ...scope, personaMaskId: 'other-mask' },
  },
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['ordinary_share'],
    variationGroup: 'wrong_scope',
  },
});
const vectorAdvisory = selectCompanionMaterialFromRecords({
  request: request('我今天遇到一件小事', {
    semanticRank: semanticRankFor(
      [wrongScope, ordinaryVoice],
      [
        { materialId: wrongScope.id, score: 0.99 },
        { materialId: ordinaryVoice.id, score: 0.72 },
      ],
    ),
  }),
  records: [wrongScope, ordinaryVoice],
  semanticRankAuthority: semanticAuthorityFor([wrongScope, ordinaryVoice]),
});
assert.deepEqual(vectorAdvisory.selectedMaterialIds, [ordinaryVoice.id]);
assert.ok(vectorAdvisory.warnings.includes('retrieval_backend:hybrid_embedding'));

const staleVectorAdvisory = selectCompanionMaterialFromRecords({
  request: request('我今天遇到一件小事', {
    semanticRank: semanticRankFor(
      [ordinaryVoice],
      [{ materialId: ordinaryVoice.id, score: 0.99 }],
      { materialSetFingerprint: 'material-set-v1:stale' },
    ),
  }),
  records: [ordinaryVoice],
  semanticRankAuthority: semanticAuthorityFor([ordinaryVoice]),
});
assert.ok(staleVectorAdvisory.warnings.includes('retrieval_backend:lexical_v1'));
assert.ok(staleVectorAdvisory.warnings.includes('semantic_rank_ignored:untrusted_or_binding_mismatch'));

const lowSignalHeavy = material('low-signal-heavy', {
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['agency'],
    variationGroup: 'heavy_agency',
  },
});
const untrustedVector = selectCompanionMaterialFromRecords({
  request: request('今天想聊点别的', {
    semanticRank: semanticRankFor(
      [lowSignalHeavy],
      [{ materialId: lowSignalHeavy.id, score: 0.99 }],
    ),
  }),
  records: [lowSignalHeavy],
});
assert.deepEqual(
  untrustedVector.selectedMaterialIds,
  [],
  'a self-reported semantic rank without trusted manifest authority must not influence selection',
);
assert.ok(untrustedVector.warnings.includes('retrieval_backend:lexical_v1'));
assert.ok(untrustedVector.warnings.includes('semantic_rank_ignored:untrusted_or_binding_mismatch'));

const lowSignalVector = selectCompanionMaterialFromRecords({
  request: request('在吗', {
    semanticRank: semanticRankFor(
      [ordinaryVoice, lowSignalHeavy],
      [
        { materialId: lowSignalHeavy.id, score: 0.99 },
        { materialId: ordinaryVoice.id, score: 0.1 },
      ],
    ),
  }),
  records: [ordinaryVoice, lowSignalHeavy],
  semanticRankAuthority: semanticAuthorityFor([ordinaryVoice, lowSignalHeavy]),
});
assert.deepEqual(
  lowSignalVector.selectedMaterialIds,
  [ordinaryVoice.id],
  'embedding score cannot wake a relevance-required agency/detail record for a low-signal greeting',
);

assert.throws(
  () => selectCompanionMaterialFromRecords({
    request: request('在吗', {
      semanticRank: semanticRankFor(
        [ordinaryVoice, lowSignalHeavy],
        [{ materialId: lowSignalHeavy.id, score: 0.99 }],
        { strongThreshold: 0 },
      ),
    }),
    records: [ordinaryVoice, lowSignalHeavy],
    semanticRankAuthority: semanticAuthorityFor([ordinaryVoice, lowSignalHeavy]),
  }),
  /strongThreshold must be greater than 0/,
  'zero semantic threshold must be rejected instead of turning zero evidence into relevance',
);

for (const [label, rankOverrides] of [
  ['wrong scope', { scopeKey: createHistoryScopeKey({ ...scope, personaMaskId: 'other-mask' }) }],
  ['stale model artifact', { modelArtifactDigest: 'sha256:stale-model-artifact' }],
  ['stale projection', { projectionVersion: 'fixture-guidance-stale' }],
  ['stale calibration', { calibrationRevision: 'fixture-calibration-stale' }],
  ['stale index', { indexRevision: 'fixture-index-stale' }],
] as const) {
  const ignoredRank = selectCompanionMaterialFromRecords({
    request: request('在吗', {
      requestId: `ignored-rank:${label}`,
      semanticRank: semanticRankFor(
        [ordinaryVoice, lowSignalHeavy],
        [{ materialId: lowSignalHeavy.id, score: 0.99 }],
        rankOverrides,
      ),
    }),
    records: [ordinaryVoice, lowSignalHeavy],
    semanticRankAuthority: semanticAuthorityFor([ordinaryVoice, lowSignalHeavy]),
  });
  assert.equal(
    ignoredRank.selectedMaterialIds.includes(lowSignalHeavy.id),
    false,
    `${label} semantic rank must not wake a relevance-required record`,
  );
  assert.ok(ignoredRank.warnings.includes('retrieval_backend:lexical_v1'));
  assert.ok(ignoredRank.warnings.includes('semantic_rank_ignored:untrusted_or_binding_mismatch'));
}

for (const query of [
  '明天下午三点帮我设个提醒',
  '我只是说说，不要建议也不要替我解决',
]) {
  const hardBypassWithVector = selectCompanionMaterialFromRecords({
    request: request(query, {
      requestId: `hard-bypass:${query}`,
      semanticRank: semanticRankFor(
        [ordinaryVoice, lowSignalHeavy],
        [{ materialId: lowSignalHeavy.id, score: 0.99 }],
      ),
    }),
    records: [ordinaryVoice, lowSignalHeavy],
    semanticRankAuthority: semanticAuthorityFor([ordinaryVoice, lowSignalHeavy]),
  });
  assert.deepEqual(
    hardBypassWithVector.selectedMaterialIds,
    [],
    'trusted semantic rank still cannot cross tool/no-advice hard bypass',
  );
}

console.log('companion material non-vector retrieval and vector seam: green');
