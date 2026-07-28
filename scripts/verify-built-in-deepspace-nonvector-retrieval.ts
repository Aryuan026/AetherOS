import assert from 'node:assert/strict';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';
import {
  BUILT_IN_DEEPSPACE_RETRIEVAL_CALIBRATION_BY_MATERIAL_ID,
  builtInDeepspaceRetrievalCalibrationFor,
  builtInDeepspaceRetrievalCalibrationForCharacter,
  validateBuiltInDeepspaceRetrievalCalibration,
  type BuiltInDeepspaceRetrievalCalibration,
  type BuiltInDeepspaceRetrievalSignal,
} from '../domain/companionMaterial/builtInDeepspaceRetrievalCalibration.ts';
import { analyzeCompanionMaterialQuery } from '../domain/companionMaterial/retrieval.ts';
import { selectCompanionMaterialFromRecords } from '../domain/companionMaterial/selection.ts';
import { createCompanionMaterialDeliveryReceipt } from '../domain/companionMaterial/deliveryReceipt.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialMode,
  type CompanionMaterialPurpose,
  type CompanionMaterialRecord,
} from '../domain/companionMaterial/types.ts';

type CharacterExpectation = {
  expectedIds: readonly string[];
  expectedVariationGroups: readonly string[];
  forbiddenIds: readonly string[];
};

type BlindRetrievalScenario = {
  id: string;
  /** Human-facing input only; it is never a character answer template. */
  userOpening: string;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  signals: readonly BuiltInDeepspaceRetrievalSignal[];
  expectations: Readonly<Record<string, CharacterExpectation>>;
};

const recordById = new Map(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.map(record => [record.id, record]));

const calibrationFor = (record: CompanionMaterialRecord): BuiltInDeepspaceRetrievalCalibration => {
  const calibration = builtInDeepspaceRetrievalCalibrationFor(record.id);
  assert.ok(calibration, `missing calibration for ${record.id}`);
  return calibration;
};

const selectWithoutVectors = (input: {
  charId: string;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  signals: readonly BuiltInDeepspaceRetrievalSignal[];
  maxItems?: number;
}): readonly CompanionMaterialRecord[] => {
  const signals = new Set(input.signals);
  const maxItems = input.maxItems ?? 3;
  const eligible = BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL
    .filter(record => (
      record.charId === input.charId
      && record.eligibleModes.includes(input.mode)
      && record.eligiblePurposes.includes(input.purpose)
    ))
    .flatMap(record => {
      const calibration = calibrationFor(record);
      if (calibration.suppressSignals.some(signal => signals.has(signal))) return [];
      const matchedSignals = calibration.positiveSignals.filter(signal => signals.has(signal));
      return [{
        record,
        calibration,
        matchedSignals,
        score: matchedSignals.length * 100 + calibration.fallbackPriority,
      }];
    });

  const positiveMatches = eligible.filter(candidate => candidate.matchedSignals.length > 0);
  const candidates = positiveMatches.length > 0
    ? positiveMatches
    : eligible.filter(candidate => candidate.calibration.activationPolicy === 'voice_fallback');
  const usedVariationGroups = new Set<string>();

  return candidates
    .sort((left, right) => (
      right.score - left.score
      || right.calibration.fallbackPriority - left.calibration.fallbackPriority
      || left.record.id.localeCompare(right.record.id)
    ))
    .flatMap(candidate => {
      if (usedVariationGroups.has(candidate.calibration.variationGroup)) return [];
      usedVariationGroups.add(candidate.calibration.variationGroup);
      return [candidate.record];
    })
    .slice(0, maxItems);
};

const qiyuCareIds = [
  'builtin-qiyu-voice-playful-care-v1',
  'builtin-qiyu-proactive-optional-care-v1',
];
const lishenCareIds = ['builtin-lishen-voice-practical-care-v1'];

/**
 * The six shared blind prompts record only a human opening, lightweight
 * analyser signals, and retrieval expectations. No standard-answer dialogue
 * is stored here, so a reply model cannot learn a fixed performance from it.
 */
const BLIND_SCENARIOS: readonly BlindRetrievalScenario[] = [
  {
    id: 'ordinary_share',
    userOpening: '今天遇到了一件普通的小事，想和你说说。',
    mode: 'remote_chat',
    purpose: 'stable_context',
    signals: ['ordinary_share'],
    expectations: {
      [BUILT_IN_DEEPSPACE_QIYU_ID]: {
        expectedIds: [
          'builtin-qiyu-voice-observed-entry-v1',
          'builtin-qiyu-agency-share-observation-v1',
          'builtin-qiyu-voice-playful-turn-v1',
        ],
        expectedVariationGroups: ['observation_entry', 'collaborative_initiative', 'light_turn'],
        forbiddenIds: qiyuCareIds,
      },
      [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
        expectedIds: [
          'builtin-lishen-voice-concrete-entry-v1',
          'builtin-lishen-voice-calm-confirmation-v1',
        ],
        expectedVariationGroups: ['observation_entry', 'calm_response'],
        forbiddenIds: lishenCareIds,
      },
    },
  },
  {
    id: 'mild_discomfort',
    userOpening: '我有点不舒服，但还在照常做事。',
    mode: 'remote_chat',
    purpose: 'stable_context',
    signals: ['mild_discomfort', 'care_needed', 'practical_next_step'],
    expectations: {
      [BUILT_IN_DEEPSPACE_QIYU_ID]: {
        expectedIds: ['builtin-qiyu-voice-playful-care-v1'],
        expectedVariationGroups: ['optional_care'],
        forbiddenIds: ['builtin-qiyu-voice-observed-entry-v1'],
      },
      [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
        expectedIds: [
          'builtin-lishen-voice-practical-care-v1',
          'builtin-lishen-agency-next-step-v1',
        ],
        expectedVariationGroups: ['optional_care', 'practical_agency'],
        forbiddenIds: ['builtin-lishen-voice-concrete-entry-v1'],
      },
    },
  },
  {
    id: 'refusal',
    userOpening: '谢谢你的邀请，不过这次我想自己待一会儿。',
    mode: 'remote_chat',
    purpose: 'stable_context',
    signals: ['refusal', 'independent_life'],
    expectations: {
      [BUILT_IN_DEEPSPACE_QIYU_ID]: {
        expectedIds: ['builtin-qiyu-voice-own-rhythm-v1'],
        expectedVariationGroups: ['independent_life'],
        forbiddenIds: qiyuCareIds,
      },
      [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
        expectedIds: [
          'builtin-lishen-voice-calm-confirmation-v1',
          'builtin-lishen-voice-own-perspective-v1',
        ],
        expectedVariationGroups: ['calm_response', 'independent_life'],
        forbiddenIds: lishenCareIds,
      },
    },
  },
  {
    id: 'reentry',
    userOpening: '这几天没怎么出现，我现在回来了。',
    mode: 'remote_chat',
    purpose: 'stable_context',
    signals: ['reentry', 'independent_life'],
    expectations: {
      [BUILT_IN_DEEPSPACE_QIYU_ID]: {
        expectedIds: ['builtin-qiyu-voice-own-rhythm-v1'],
        expectedVariationGroups: ['independent_life'],
        forbiddenIds: qiyuCareIds,
      },
      [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
        expectedIds: [
          'builtin-lishen-voice-own-perspective-v1',
          'builtin-lishen-voice-calm-confirmation-v1',
        ],
        expectedVariationGroups: ['independent_life', 'calm_response'],
        forbiddenIds: lishenCareIds,
      },
    },
  },
  {
    id: 'light_scene',
    userOpening: '（路边有个小状况，气氛有点好笑。）',
    mode: 'meet_scene',
    purpose: 'stable_context',
    signals: ['light_scene', 'humor'],
    expectations: {
      [BUILT_IN_DEEPSPACE_QIYU_ID]: {
        expectedIds: [
          'builtin-qiyu-voice-playful-turn-v1',
          'builtin-qiyu-voice-observed-entry-v1',
          'builtin-qiyu-agency-share-observation-v1',
        ],
        expectedVariationGroups: ['light_turn', 'observation_entry', 'collaborative_initiative'],
        forbiddenIds: qiyuCareIds,
      },
      [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
        expectedIds: [
          'builtin-lishen-voice-concrete-entry-v1',
          'builtin-lishen-detail-routine-texture-v1',
        ],
        expectedVariationGroups: ['observation_entry', 'situated_detail'],
        forbiddenIds: lishenCareIds,
      },
    },
  },
  {
    id: 'character_self_share',
    userOpening: '如果你刚好有近况想分享，也可以说一点。',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    signals: ['character_self_share', 'independent_life'],
    expectations: {
      [BUILT_IN_DEEPSPACE_QIYU_ID]: {
        expectedIds: [
          'builtin-qiyu-proactive-own-thread-v1',
          'builtin-qiyu-opening-curious-hook-v1',
        ],
        expectedVariationGroups: ['independent_proactive', 'curious_opening'],
        forbiddenIds: ['builtin-qiyu-proactive-optional-care-v1'],
      },
      [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
        expectedIds: [
          'builtin-lishen-proactive-own-thread-v1',
          'builtin-lishen-opening-observed-detail-v1',
        ],
        expectedVariationGroups: ['independent_proactive', 'observed_opening'],
        forbiddenIds: ['builtin-lishen-voice-practical-care-v1'],
      },
    },
  },
];

const LOW_SIGNAL_GREETING: BlindRetrievalScenario = {
  id: 'low_signal_greeting',
  userOpening: '嗨。',
  mode: 'remote_chat',
  purpose: 'stable_context',
  signals: ['low_signal'],
  expectations: {
    [BUILT_IN_DEEPSPACE_QIYU_ID]: {
      expectedIds: ['builtin-qiyu-voice-observed-entry-v1'],
      expectedVariationGroups: ['observation_entry'],
      forbiddenIds: qiyuCareIds,
    },
    [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
      expectedIds: ['builtin-lishen-voice-concrete-entry-v1'],
      expectedVariationGroups: ['observation_entry'],
      forbiddenIds: lishenCareIds,
    },
  },
};

assert.deepEqual(validateBuiltInDeepspaceRetrievalCalibration(), []);
assert.equal(Object.keys(BUILT_IN_DEEPSPACE_RETRIEVAL_CALIBRATION_BY_MATERIAL_ID).length, 23);
assert.equal(recordById.size, 23);
assert.ok(
  analyzeCompanionMaterialQuery({ query: LOW_SIGNAL_GREETING.userOpening }).signals.includes('low_signal'),
  'the existing lightweight analyser must expose the legal low-signal fallback path',
);

for (const record of BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL) {
  const calibration = calibrationFor(record);
  assert.deepEqual(
    Object.keys(calibration).sort(),
    ['activationPolicy', 'fallbackPriority', 'positiveSignals', 'suppressSignals', 'variationGroup'],
    `${record.id} must remain retrieval metadata rather than prompt or source data`,
  );
  assert.equal(record.slot === 'relevant_stable_details' && calibration.activationPolicy !== 'relevance_required', false);
  assert.equal(record.tags.includes('care') && calibration.activationPolicy !== 'relevance_required', false);
}

for (const charId of [BUILT_IN_DEEPSPACE_QIYU_ID, BUILT_IN_DEEPSPACE_LISHEN_ID]) {
  const fallbackRecords = BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.filter(record => (
    record.charId === charId && calibrationFor(record).activationPolicy === 'voice_fallback'
  ));
  assert.ok(fallbackRecords.length >= 1 && fallbackRecords.length <= 2, `${charId} keeps 1-2 voice fallbacks`);
  assert.equal(fallbackRecords.some(record => record.tags.includes('care')), false, `${charId} fallback cannot become default care`);
}

const OTHER_LEAD_RUNTIME_CASES = [
  {
    charId: BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
    expectedId: 'builtin-shenxinghui-voice-even-playful-premise-v1',
    positiveQuery: '我们假装这是一个小游戏，定个奇怪规则。',
    positiveSignal: 'playful_premise',
  },
  {
    charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
    expectedId: 'builtin-qinche-voice-criterion-led-reframe-v1',
    positiveQuery: '两个方案二选一，你觉得哪个更好？',
    positiveSignal: 'choice_tradeoff',
  },
  {
    charId: BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
    expectedId: 'builtin-xiayizhou-voice-warm-playful-continuation-v1',
    positiveQuery: '来打个赌，输的人负责买甜点。',
    positiveSignal: 'playful_premise',
  },
] as const;

for (const fixture of OTHER_LEAD_RUNTIME_CASES) {
  const records = builtInDeepspaceRetrievalCalibrationForCharacter(fixture.charId);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.retrievalHints?.activationPolicy, 'relevance_required');
  assert.ok(
    analyzeCompanionMaterialQuery({ query: fixture.positiveQuery }).signals.includes(fixture.positiveSignal),
    `${fixture.charId} positive query must expose its non-vector signal`,
  );

  const select = (
    query: string,
    now = 1_800_000_000_000,
    receipts: readonly CompanionMaterialDeliveryReceipt[] = [],
  ) => selectCompanionMaterialFromRecords({
    request: {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      requestId: `other-lead:${fixture.charId}:${query}`,
      scope: {
        progressBundleId: 'runtime-bundle',
        personaMaskId: 'runtime-mask',
        charId: fixture.charId,
      },
      surface: 'chat',
      mode: 'remote_chat',
      purpose: 'stable_context',
      query,
      relationshipStage: 'unknown',
      budgetChars: 360,
      maxItems: 1,
      now,
    },
    records,
    receipts,
  });

  const firstSelection = select(fixture.positiveQuery);
  assert.deepEqual(firstSelection.selectedMaterialIds, [fixture.expectedId]);
  const firstReceipt = createCompanionMaterialDeliveryReceipt({
    selection: firstSelection,
    consumerRef: { kind: 'prompt', id: `other-lead:${fixture.charId}:first`, revision: '1' },
    delivered: firstSelection.items.map(item => ({
      materialId: item.materialId,
      promptCharCount: item.estimatedChars,
    })),
    occurredAt: 1_800_000_000_000,
  });
  assert.deepEqual(
    select(fixture.positiveQuery, 1_800_000_001_000, [firstReceipt]).selectedMaterialIds,
    [],
    `${fixture.charId} must not repeat its only narrow operator on adjacent turns`,
  );
  for (const negativeQuery of [
    '在吗',
    '我今天胃有点不舒服',
    '不了，我想一个人待着',
    '这几天没怎么出现，我回来了',
    '你今天都做了什么？',
    '提醒我晚上十点睡觉',
    '我把钥匙忘在家里了，怎么办？',
    '（我在雨里拉住你的袖口）',
    '（我安静地坐在你旁边）',
    '（我低头擦掉眼泪）',
  ]) {
    assert.deepEqual(
      select(negativeQuery).selectedMaterialIds,
      [],
      `${fixture.charId} must not turn one narrow character operator into a default response path`,
    );
  }
}

for (const scenario of [...BLIND_SCENARIOS, LOW_SIGNAL_GREETING]) {
  for (const charId of [BUILT_IN_DEEPSPACE_QIYU_ID, BUILT_IN_DEEPSPACE_LISHEN_ID]) {
    const expectation = scenario.expectations[charId];
    assert.ok(expectation, `${scenario.id} is missing ${charId} expectations`);
    const selected = selectWithoutVectors({
      charId,
      mode: scenario.mode,
      purpose: scenario.purpose,
      signals: scenario.signals,
    });
    const selectedIds = selected.map(record => record.id);
    const selectedGroups = selected.map(record => calibrationFor(record).variationGroup);

    assert.ok(selected.length >= 1, `${scenario.id}:${charId} must retain a positive route`);
    assert.ok(selected.length <= 3, `${scenario.id}:${charId} must select no more than three materials`);
    assert.deepEqual(selectedIds, expectation.expectedIds, `${scenario.id}:${charId} selected unexpected material IDs`);
    assert.deepEqual(selectedGroups, expectation.expectedVariationGroups, `${scenario.id}:${charId} selected unexpected material families`);
    expectation.forbiddenIds.forEach(materialId => {
      assert.equal(selectedIds.includes(materialId), false, `${scenario.id}:${charId} must not select ${materialId}`);
    });
  }
}

for (const charId of [BUILT_IN_DEEPSPACE_QIYU_ID, BUILT_IN_DEEPSPACE_LISHEN_ID]) {
  const selected = selectWithoutVectors({
    charId,
    mode: LOW_SIGNAL_GREETING.mode,
    purpose: LOW_SIGNAL_GREETING.purpose,
    signals: LOW_SIGNAL_GREETING.signals,
  });
  assert.equal(selected.length, 1, `${charId} low-signal greeting keeps one flexible fallback`);
  assert.equal(calibrationFor(selected[0]!).activationPolicy, 'voice_fallback');
  assert.equal(selected[0]!.tags.includes('care'), false, `${charId} low-signal greeting must not default to care`);
}

const runtimeCases = [
  { id: 'low', query: '在吗' },
  { id: 'care', query: '我今天胃有点不舒服' },
  { id: 'refusal', query: '今天不去了，下次吧' },
  { id: 'reentry', query: '这几天有点忙，刚回来' },
  { id: 'character_self_share', query: '你今天在忙什么？' },
  { id: 'character_self_share_colloquial', query: '你今天都做了什么？' },
] as const;

for (const charId of [BUILT_IN_DEEPSPACE_QIYU_ID, BUILT_IN_DEEPSPACE_LISHEN_ID]) {
  for (const fixture of runtimeCases) {
    const selection = selectCompanionMaterialFromRecords({
      request: {
        schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
        requestId: `runtime:${charId}:${fixture.id}`,
        scope: {
          progressBundleId: 'runtime-bundle',
          personaMaskId: 'runtime-mask',
          charId,
        },
        surface: 'chat',
        mode: 'remote_chat',
        purpose: 'stable_context',
        query: fixture.query,
        relationshipStage: 'unknown',
        budgetChars: 520,
        maxItems: 3,
        now: 1_800_000_000_000,
      },
      records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
    });
    assert.ok(selection.items.length >= 1, `${fixture.id}:${charId} must survive the real selector`);
    assert.ok(selection.items.length <= 3, `${fixture.id}:${charId} must respect the real selector budget`);
    if (fixture.id === 'low') {
      assert.equal(selection.items.length, 1, `${charId} low signal keeps exactly one real fallback`);
      assert.equal(selection.items[0]?.selectionReasons.includes('voice_fallback'), true);
    }
    if (fixture.id === 'care') {
      assert.equal(
        selection.items.some(item => item.materialId.includes('care') || item.materialId.includes('next-step')),
        true,
        `${charId} discomfort reaches an evidence-earned care family`,
      );
    }
    if (fixture.id === 'refusal') {
      assert.equal(
        selection.items.some(item => item.materialId.includes('care')),
        false,
        `${charId} refusal does not pull care back in`,
      );
    }
    if (fixture.id === 'reentry' || fixture.id.startsWith('character_self_share')) {
      const expectedIndependentVoice = charId === BUILT_IN_DEEPSPACE_QIYU_ID
        ? 'builtin-qiyu-voice-own-rhythm-v1'
        : 'builtin-lishen-voice-own-perspective-v1';
      assert.equal(
        selection.selectedMaterialIds.includes(expectedIndependentVoice),
        true,
        `${fixture.id}:${charId} keeps the character's independent life visible`,
      );
    }
  }
}

for (const charId of [BUILT_IN_DEEPSPACE_QIYU_ID, BUILT_IN_DEEPSPACE_LISHEN_ID]) {
  const genericCallOpening = selectCompanionMaterialFromRecords({
    request: {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      requestId: `runtime:${charId}:call-opening`,
      scope: {
        progressBundleId: 'runtime-bundle',
        personaMaskId: 'runtime-mask',
        charId,
      },
      surface: 'call',
      mode: 'call',
      purpose: 'opening',
      query: '电话刚接通。',
      semanticTags: ['opening', 'call'],
      relationshipStage: 'unknown',
      budgetChars: 520,
      maxItems: 2,
      now: 1_800_000_000_000,
    },
    records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
  });
  assert.equal(
    genericCallOpening.items.some(item => item.slot === 'opening_recipes'),
    false,
    `${charId} generic transport metadata must not force an unrelated opening recipe`,
  );
  const relevantCallOpening = selectCompanionMaterialFromRecords({
    request: {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      requestId: `runtime:${charId}:call-opening-observation`,
      scope: {
        progressBundleId: 'runtime-bundle',
        personaMaskId: 'runtime-mask',
        charId,
      },
      surface: 'call',
      mode: 'call',
      purpose: 'opening',
      query: '电话接通时，我刚好看到窗边的雨光。',
      semanticTags: ['opening', 'call'],
      relationshipStage: 'unknown',
      budgetChars: 520,
      maxItems: 2,
      now: 1_800_000_000_000,
    },
    records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
  });
  assert.equal(
    relevantCallOpening.items.some(item => item.slot === 'opening_recipes'),
    true,
    `${charId} evidence-backed call opening may reach one legal opening recipe`,
  );

  const proactive = selectCompanionMaterialFromRecords({
    request: {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      requestId: `runtime:${charId}:proactive`,
      scope: {
        progressBundleId: 'runtime-bundle',
        personaMaskId: 'runtime-mask',
        charId,
      },
      surface: 'proactive_letter',
      mode: 'proactive_letter',
      purpose: 'proactive_intent',
      query: '自由主动来信',
      semanticTags: ['proactive_intent', 'opening'],
      relationshipStage: 'unknown',
      budgetChars: 600,
      maxItems: 2,
      now: 1_800_000_000_000,
    },
    records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
  });
  assert.equal(
    proactive.items.some(item => item.slot === 'proactive_seeds'),
    true,
    `${charId} heartbeat must reach one legal proactive seed`,
  );
  assert.equal(
    proactive.items.some(item => item.materialId.includes('reentry')),
    false,
    `${charId} generic heartbeat must not impersonate a reunion without reentry evidence`,
  );

  const selfLifeProactive = selectCompanionMaterialFromRecords({
    request: {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      requestId: `runtime:${charId}:proactive-self-life`,
      scope: {
        progressBundleId: 'runtime-bundle',
        personaMaskId: 'runtime-mask',
        charId,
      },
      surface: 'proactive_letter',
      mode: 'proactive_letter',
      purpose: 'proactive_intent',
      query: '你今天都做了什么？',
      semanticTags: ['proactive_intent', 'opening'],
      relationshipStage: 'unknown',
      budgetChars: 600,
      maxItems: 2,
      now: 1_800_000_000_000,
    },
    records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
  });
  assert.equal(
    selfLifeProactive.items.some(item => item.materialId.includes('reentry')),
    false,
    `${charId} self-life prompt must not invent a reunion interval`,
  );
}

console.log('built-in deepspace non-vector retrieval calibration: green');
