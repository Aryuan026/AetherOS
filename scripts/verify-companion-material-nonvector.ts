import assert from 'node:assert/strict';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialRecord,
  type CompanionMaterialSelectionRequest,
} from '../domain/companionMaterial/types.ts';
import { selectCompanionMaterialFromRecords } from '../domain/companionMaterial/selection.ts';

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

const ordinaryVoice = material('ordinary-voice');
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

const records = [ordinaryVoice, careVoice, refusalVoice, secondObservation, relevantDetail];

const lowSignal = selectCompanionMaterialFromRecords({
  request: request('在吗'),
  records,
});
assert.equal(lowSignal.items.length, 1, 'low-signal chat keeps one legal voice fallback');
assert.equal(lowSignal.items[0].slot, 'stable_character_voice');

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

const refusal = selectCompanionMaterialFromRecords({
  request: request('今天不去了，下次吧'),
  records,
});
assert.ok(refusal.selectedMaterialIds.includes(refusalVoice.id));
assert.equal(refusal.selectedMaterialIds.includes(careVoice.id), false);

const recentReceipt: CompanionMaterialDeliveryReceipt = {
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  id: 'receipt-recent-observation',
  selectionId: 'selection-recent-observation',
  consumerRef: { kind: 'prompt', id: 'prompt-recent', revision: '1' },
  scope,
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  sourceRevisionFingerprint: 'fixture',
  delivered: [{
    materialId: ordinaryVoice.id,
    slot: ordinaryVoice.slot,
    promptCharCount: ordinaryVoice.guidance.length,
    renderedHash: 'rendered-recent',
  }],
  selectedMaterialIds: [ordinaryVoice.id],
  dropped: [],
  budgetChars: 520,
  selectedChars: ordinaryVoice.guidance.length,
  status: 'delivered',
  truthEffect: 'none',
  occurredAt: T0 - 1000,
};
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
    semanticRank: {
      backend: 'embedding',
      modelId: 'fixture-embedding',
      indexRevision: 'fixture-index-v1',
      scores: [
        { materialId: wrongScope.id, score: 0.99 },
        { materialId: ordinaryVoice.id, score: 0.72 },
      ],
    },
  }),
  records: [wrongScope, ordinaryVoice],
});
assert.deepEqual(vectorAdvisory.selectedMaterialIds, [ordinaryVoice.id]);
assert.ok(vectorAdvisory.warnings.includes('retrieval_backend:hybrid_embedding'));

console.log('companion material non-vector retrieval and vector seam: green');
