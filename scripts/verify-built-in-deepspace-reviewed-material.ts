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
assert.equal(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.length, 23);
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
assert.deepEqual(reviewedBuiltInDeepspaceMaterialForCharacter(BUILT_IN_DEEPSPACE_QIYU_ID), BUILT_IN_QIYU_REVIEWED_MATERIAL);
assert.deepEqual(reviewedBuiltInDeepspaceMaterialForCharacter(BUILT_IN_DEEPSPACE_LISHEN_ID), BUILT_IN_LISHEN_REVIEWED_MATERIAL);
assert.deepEqual(
  reviewedBuiltInDeepspaceMaterialForCharacter(BUILT_IN_DEEPSPACE_SHENXINGHUI_ID),
  BUILT_IN_SHENXINGHUI_REVIEWED_MATERIAL,
);
assert.deepEqual(
  reviewedBuiltInDeepspaceMaterialForCharacter(BUILT_IN_DEEPSPACE_QINCHE_ID),
  BUILT_IN_QINCHE_REVIEWED_MATERIAL,
);
assert.deepEqual(
  reviewedBuiltInDeepspaceMaterialForCharacter(BUILT_IN_DEEPSPACE_XIAYIZHOU_ID),
  BUILT_IN_XIAYIZHOU_REVIEWED_MATERIAL,
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
