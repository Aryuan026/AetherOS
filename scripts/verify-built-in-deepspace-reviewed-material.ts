import assert from 'node:assert/strict';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
  BUILT_IN_LISHEN_REVIEWED_MATERIAL,
  BUILT_IN_QINCHE_REVIEWED_MATERIAL,
  BUILT_IN_QIYU_REVIEWED_MATERIAL,
  BUILT_IN_SHENXINGHUI_REVIEWED_MATERIAL,
  BUILT_IN_XIAYIZHOU_REVIEWED_MATERIAL,
  reviewedBuiltInDeepspaceMaterialForCharacter,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';
import { assertValidCompanionMaterialRecord } from '../domain/companionMaterial/contract.ts';
import {
  BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL,
} from '../domain/companionMaterial/builtInDeepspaceFourLaneReviewed.ts';
import {
  BUILT_IN_DEEPSPACE_SURFACE_PROJECTIONS,
} from '../domain/companionMaterial/builtInDeepspaceSurfaceProjections.ts';
import {
  BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_AUDIT,
  BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_CONSERVATION,
  BUILT_IN_DEEPSPACE_RETAINED_SOURCE_MANIFEST,
} from './fixtures/built-in-deepspace-four-lane-source-audit.ts';
import { selectCompanionMaterialFromRecords } from '../domain/companionMaterial/selection.ts';
import { COMPANION_MATERIAL_SCHEMA_VERSION, type CompanionMaterialRecord, type CompanionMaterialSelectionRequest } from '../domain/companionMaterial/types.ts';

const T0 = 1_700_000_000_000;

const slotCounts = (records: readonly CompanionMaterialRecord[]): Record<string, number> => records.reduce((counts, record) => ({
  ...counts,
  [record.slot]: (counts[record.slot] || 0) + 1,
}), {} as Record<string, number>);

const request = (charId: string, overrides: Partial<CompanionMaterialSelectionRequest> = {}): CompanionMaterialSelectionRequest => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  requestId: `builtin-review-${charId}`,
  scope: { progressBundleId: 'builtin-calibration', personaMaskId: 'blind-test', charId },
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  relationshipStage: 'unknown',
  semanticTags: ['observation', 'care', 'independent_life'],
  budgetChars: 220,
  maxItems: 5,
  now: T0,
  ...overrides,
});

assert.equal(BUILT_IN_QIYU_REVIEWED_MATERIAL.length, 10);
assert.equal(BUILT_IN_LISHEN_REVIEWED_MATERIAL.length, 10);
assert.equal(BUILT_IN_SHENXINGHUI_REVIEWED_MATERIAL.length, 1);
assert.equal(BUILT_IN_QINCHE_REVIEWED_MATERIAL.length, 1);
assert.equal(BUILT_IN_XIAYIZHOU_REVIEWED_MATERIAL.length, 1);
assert.equal(BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL.length, 37);
assert.equal(BUILT_IN_DEEPSPACE_SURFACE_PROJECTIONS.length, 15);
assert.equal(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.length, 56);
assert.equal(BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_AUDIT.length, 37);
assert.equal(
  BUILT_IN_DEEPSPACE_RETAINED_SOURCE_MANIFEST.length,
  BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_CONSERVATION.retainedManifestGroups,
);
const {
  retainedManifestGroups,
  ...sourceConservationWithoutGeneratedGroupCount
} = BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_CONSERVATION;
assert.ok(retainedManifestGroups > 0);
assert.deepEqual(sourceConservationWithoutGeneratedGroupCount, {
  totalReviewedSources: 909,
  sourcesSupportingActiveLibrary: 416,
  directLibrarySupportSources: 327,
  holdoutEvaluationSourcesSupportingActiveLibrary: 89,
  sourcesRetainedOutsideActiveLibrary: 493,
  activeSupportByLead: {
    qiyu: 94,
    lishen: 91,
    shenxinghui: 82,
    qinche: 74,
    xiayizhou: 75,
  },
});

const directSupportFingerprints = new Set<string>(
  BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_AUDIT.flatMap(
    item => item.directSupportSourceFingerprints,
  ),
);
const holdoutEvaluationFingerprints = new Set<string>(
  BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_AUDIT.flatMap(
    item => item.holdoutEvaluationSourceFingerprints,
  ),
);
assert.equal(directSupportFingerprints.size, 327);
assert.equal(holdoutEvaluationFingerprints.size, 89);
assert.equal(
  [...directSupportFingerprints].some(fingerprint => (
    holdoutEvaluationFingerprints.has(fingerprint)
  )),
  false,
  'blind holdout sources must never leak into direct library support',
);
assert.equal(
  new Set([...directSupportFingerprints, ...holdoutEvaluationFingerprints]).size,
  416,
  'the complete active-library support network must stay conserved',
);
const retainedFingerprints = new Set(
  BUILT_IN_DEEPSPACE_RETAINED_SOURCE_MANIFEST.flatMap(
    group => group.sourceFingerprints,
  ),
);
assert.equal(retainedFingerprints.size, 493);
assert.equal(
  [...retainedFingerprints].some(fingerprint => (
    directSupportFingerprints.has(fingerprint)
    || holdoutEvaluationFingerprints.has(fingerprint)
  )),
  false,
  'retained-outside-active sources must remain disjoint from active-library support',
);
assert.equal(
  new Set([
    ...directSupportFingerprints,
    ...holdoutEvaluationFingerprints,
    ...retainedFingerprints,
  ]).size,
  909,
  'all 909 source fingerprints must be independently conserved',
);
assert.equal(
  BUILT_IN_DEEPSPACE_RETAINED_SOURCE_MANIFEST.every(source => (
    source.sourceFingerprints.every(fingerprint => fingerprint.startsWith('lysk-src-'))
    && Boolean(source.leadId)
    && Boolean(source.sourceRole)
    && Boolean(source.primaryRoute)
    && source.supportedReviewedAssetIds.length > 0
    && Array.isArray(source.reviewedCandidateIds)
    && Boolean(source.residualDisposition)
    && Array.isArray(source.residualReviewedAssetIds)
  )),
  true,
  'retained sources must keep an opaque reviewed destination rather than a count-only placeholder',
);

const auditByMaterialId = new Map<string, (typeof BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_AUDIT)[number]>(
  BUILT_IN_DEEPSPACE_FOUR_LANE_SOURCE_AUDIT.map(item => [item.materialId, item]),
);
for (const record of BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL) {
  const audit = auditByMaterialId.get(record.id);
  assert.ok(audit, `${record.id} needs a source-conservation audit entry`);
  assert.equal(audit.charId, record.charId);
  const directForMaterial = new Set<string>(audit.directSupportSourceFingerprints);
  assert.equal(
    record.sourceRefs.every(ref => directForMaterial.has(ref.sourceFingerprint)),
    true,
    `${record.id} runtime evidence must be a direct-support subset, never holdout`,
  );
}
assert.deepEqual(slotCounts(BUILT_IN_QIYU_REVIEWED_MATERIAL), {
  stable_character_voice: 4,
  stable_base: 1,
  relevant_stable_details: 1,
  opening_recipes: 2,
  proactive_seeds: 2,
});
assert.deepEqual(slotCounts(BUILT_IN_LISHEN_REVIEWED_MATERIAL), {
  stable_character_voice: 5,
  stable_base: 1,
  relevant_stable_details: 1,
  opening_recipes: 1,
  proactive_seeds: 2,
});
assert.notDeepEqual(slotCounts(BUILT_IN_QIYU_REVIEWED_MATERIAL), slotCounts(BUILT_IN_LISHEN_REVIEWED_MATERIAL));
assert.deepEqual(
  [
    BUILT_IN_DEEPSPACE_QIYU_ID,
    BUILT_IN_DEEPSPACE_LISHEN_ID,
    BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
    BUILT_IN_DEEPSPACE_QINCHE_ID,
    BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
  ].map(charId => reviewedBuiltInDeepspaceMaterialForCharacter(charId).length),
  [11, 11, 11, 12, 11],
);

for (const record of BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL) {
  assertValidCompanionMaterialRecord(record);
  assert.equal(record.ownerScope.kind, 'character');
  assert.equal(record.ownerScope.charId, record.charId);
  assert.equal(record.sourceRefs.some(ref => !ref.sourcePackId), false);
  assert.equal(record.sourceRefs.some(ref => /[^a-z0-9_-]/i.test(ref.recordId)), false, 'source ids must be opaque');
  assert.equal(record.sourceRefs.some(ref => 'sourceTitle' in ref || 'sourceUrl' in ref || 'rawText' in ref), false);
  assert.doesNotMatch(record.guidance, /currentMotives|allowlist|denylist|工具|必须爱|固定称呼|每轮|恋人|亲密关系|共同经历/);
}
assert.equal(
  BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL
    .every(record => record.sourceRefs.every(ref => ref.sourcePackId === 'lysk-all-leads-four-lane-v1')),
  true,
);
assert.equal(
  BUILT_IN_DEEPSPACE_FOUR_LANE_REVIEWED_MATERIAL
    .every(record => record.retrievalHints?.activationPolicy === 'relevance_required'),
  true,
);

for (const record of [...BUILT_IN_QIYU_REVIEWED_MATERIAL, ...BUILT_IN_LISHEN_REVIEWED_MATERIAL]) {
  if (record.slot === 'stable_character_voice') {
    assert.ok(record.sourceRefs.length >= 2, `${record.id} needs cross-source support`);
  }
}

for (const record of [
  ...BUILT_IN_SHENXINGHUI_REVIEWED_MATERIAL,
  ...BUILT_IN_QINCHE_REVIEWED_MATERIAL,
  ...BUILT_IN_XIAYIZHOU_REVIEWED_MATERIAL,
]) {
  assert.equal(record.slot, 'stable_character_voice');
  assert.ok(record.sourceRefs.length >= 3, `${record.id} needs a reviewed cross-source subset`);
  assert.equal(record.retrievalHints, undefined, 'retrieval metadata stays in the calibration module');
}

const qiyuChat = selectCompanionMaterialFromRecords({
  request: request(BUILT_IN_DEEPSPACE_QIYU_ID),
  records: BUILT_IN_QIYU_REVIEWED_MATERIAL,
});
const lishenChat = selectCompanionMaterialFromRecords({
  request: request(BUILT_IN_DEEPSPACE_LISHEN_ID),
  records: BUILT_IN_LISHEN_REVIEWED_MATERIAL,
});
for (const selection of [qiyuChat, lishenChat]) {
  assert.ok(selection.items.some(item => item.slot === 'stable_character_voice'), 'a constrained normal-chat budget retains a positive voice path');
  assert.equal(selection.items.some(item => item.slot === 'opening_recipes' || item.slot === 'proactive_seeds'), false, 'normal chat must not consume opening/proactive material');
  assert.equal(selection.items.every(item => item.slot === 'stable_character_voice' || item.slot === 'stable_base' || item.slot === 'relevant_stable_details'), true);
  assert.ok(selection.items.reduce((count, item) => count + item.estimatedChars, 0) <= selection.budgetChars);
}
assert.notDeepEqual(
  qiyuChat.items.map(item => item.guidance),
  lishenChat.items.map(item => item.guidance),
  'the two character paths must remain distinguishable under the same blind-test tags',
);

const otherLeadQueries = [
  {
    charId: BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
    records: BUILT_IN_SHENXINGHUI_REVIEWED_MATERIAL,
    query: '我们假装这是一个小游戏，定个奇怪规则。',
    expectedId: 'builtin-shenxinghui-voice-even-playful-premise-v1',
  },
  {
    charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
    records: BUILT_IN_QINCHE_REVIEWED_MATERIAL,
    query: '两个方案二选一，你觉得哪个更好？',
    expectedId: 'builtin-qinche-voice-criterion-led-reframe-v1',
  },
  {
    charId: BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
    records: BUILT_IN_XIAYIZHOU_REVIEWED_MATERIAL,
    query: '来打个赌，输的人负责买甜点。',
    expectedId: 'builtin-xiayizhou-voice-warm-playful-continuation-v1',
  },
] as const;
otherLeadQueries.forEach(fixture => {
  const selection = selectCompanionMaterialFromRecords({
    request: request(fixture.charId, {
      requestId: `other-lead:${fixture.charId}`,
      query: fixture.query,
      semanticTags: fixture.charId === BUILT_IN_DEEPSPACE_QINCHE_ID
        ? ['choice_tradeoff']
        : ['playful_premise'],
      maxItems: 1,
    }),
    records: fixture.records.map(record => ({
      ...record,
      retrievalHints: {
        activationPolicy: 'relevance_required',
        positiveSignals: fixture.charId === BUILT_IN_DEEPSPACE_QINCHE_ID
          ? ['choice_tradeoff']
          : ['playful_premise'],
        variationGroup: `fixture_${fixture.charId.replace(/[^a-z0-9]+/gi, '_')}`,
      },
    })),
  });
  assert.deepEqual(selection.selectedMaterialIds, [fixture.expectedId]);
});

const qiyuOpening = selectCompanionMaterialFromRecords({
  request: request(BUILT_IN_DEEPSPACE_QIYU_ID, {
    requestId: 'qiyu-opening',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    budgetChars: 500,
  }),
  records: BUILT_IN_QIYU_REVIEWED_MATERIAL,
});
assert.ok(qiyuOpening.items.some(item => item.slot === 'opening_recipes' || item.slot === 'proactive_seeds'));

console.log('built-in deepspace reviewed material: green');
