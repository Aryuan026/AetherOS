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
  builtInDeepspaceRetrievalCalibrationForCharacter,
  validateBuiltInDeepspaceRetrievalCalibration,
} from '../domain/companionMaterial/builtInDeepspaceRetrievalCalibration.ts';
import { analyzeCompanionMaterialQuery } from '../domain/companionMaterial/retrieval.ts';
import { selectCompanionMaterialFromRecords } from '../domain/companionMaterial/selection.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialGroundingKind,
  type CompanionMaterialSelection,
  type CompanionMaterialSelectionRequest,
} from '../domain/companionMaterial/types.ts';

const NOW = 1_800_000_000_000;
const CHAR_IDS = [
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
] as const;

const scope = (charId: string) => ({
  progressBundleId: 'runtime-bundle',
  personaMaskId: 'runtime-mask',
  charId,
});

const request = (
  charId: string,
  input: Pick<
    CompanionMaterialSelectionRequest,
    'requestId' | 'surface' | 'mode' | 'purpose' | 'query'
  > & Partial<CompanionMaterialSelectionRequest>,
): CompanionMaterialSelectionRequest => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  scope: scope(charId),
  relationshipStage: 'unknown',
  budgetChars: 640,
  maxItems: 3,
  now: NOW,
  ...input,
});

const grounding = (
  charId: string,
  kind: CompanionMaterialGroundingKind,
  claimKey: string,
) => [{
  kind,
  claimKey,
  refId: `${kind}:${claimKey}:${charId}`,
  revision: 1,
  scope: scope(charId),
  occurredAt: NOW,
  validUntil: NOW + 60_000,
}];

const select = (
  charId: string,
  selectionRequest: CompanionMaterialSelectionRequest,
  receipts: readonly CompanionMaterialDeliveryReceipt[] = [],
) => selectCompanionMaterialFromRecords({
  request: selectionRequest,
  records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
  receipts,
});

const receiptFor = (
  selection: CompanionMaterialSelection,
  occurredAt: number,
  consumerKind: CompanionMaterialDeliveryReceipt['consumerRef']['kind'] = 'prompt',
): CompanionMaterialDeliveryReceipt => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  id: `receipt:${selection.selectionId}:${occurredAt}`,
  selectionId: selection.selectionId,
  consumerRef: {
    kind: consumerKind,
    id: `consumer:${selection.requestId}`,
    revision: '1',
  },
  scope: selection.scope,
  surface: selection.surface,
  mode: selection.mode,
  purpose: selection.purpose,
  routeRef: selection.routeRef,
  sourceRevisionFingerprint: selection.sourceRevisionFingerprint,
  delivered: selection.items.map(item => ({
    materialId: item.materialId,
    materialRevision: item.materialRevision,
    slot: item.slot,
    promptCharCount: item.estimatedChars,
    renderedHash: `fixture:${item.materialId}:${item.materialRevision}`,
  })),
  selectedMaterialIds: selection.selectedMaterialIds,
  dropped: [],
  budgetChars: selection.budgetChars,
  selectedChars: selection.items.reduce((total, item) => total + item.estimatedChars, 0),
  status: selection.items.length ? 'delivered' : 'skipped',
  truthEffect: 'none',
  occurredAt,
});

assert.deepEqual(validateBuiltInDeepspaceRetrievalCalibration(), []);
assert.equal(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.length, 56);
assert.deepEqual(
  CHAR_IDS.map(charId => builtInDeepspaceRetrievalCalibrationForCharacter(charId).length),
  [11, 11, 11, 12, 11],
);

const CHAT_CASES = [
  {
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    query: '这盏灯照在杯子上有一层彩色反光。',
    claimKey: 'observation',
  },
  {
    charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
    query: '两个安排有点冲突，你帮我看看先做哪个？',
    claimKey: 'practical_next_step',
  },
  {
    charId: BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
    query: '我们假装这把伞有一个奇怪的规则。',
    claimKey: 'playful_premise',
  },
  {
    charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
    query: '两个方案二选一，代价也不一样。',
    claimKey: 'choice_tradeoff',
  },
  {
    charId: BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
    query: '来打个赌，输的人负责买甜点。',
    claimKey: 'playful_premise',
  },
] as const;

for (const fixture of CHAT_CASES) {
  const features = analyzeCompanionMaterialQuery({ query: fixture.query });
  assert.ok(features.signals.includes(fixture.claimKey), `${fixture.charId} query lacks ${fixture.claimKey}`);
  const withoutGrounding = select(fixture.charId, request(fixture.charId, {
    requestId: `chat-without-grounding:${fixture.charId}`,
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
    query: fixture.query,
    semanticTags: [fixture.claimKey],
    maxItems: 1,
  }));
  assert.equal(
    withoutGrounding.items.some(item => item.materialId.startsWith('reviewed-')),
    false,
    `${fixture.charId} reviewed library must fail closed without exact live evidence`,
  );

  const selected = select(fixture.charId, request(fixture.charId, {
    requestId: `chat-grounded:${fixture.charId}`,
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
    query: fixture.query,
    semanticTags: [fixture.claimKey],
    groundingRefs: grounding(fixture.charId, 'live_user_turn', fixture.claimKey),
    maxItems: 1,
  }));
  assert.equal(
    selected.items.length,
    1,
    `${fixture.charId} ordinary Chat must stay at one material direction`,
  );
  assert.equal(
    selected.items.some(item => item.materialId.startsWith('reviewed-')),
    true,
    `${fixture.charId} grounded concrete turn needs a real reviewed positive path`,
  );
  assert.equal(
    selected.items.every(item => (
      item.slot === 'stable_character_voice'
      || item.slot === 'stable_base'
      || item.slot === 'relevant_stable_details'
    )),
    true,
  );
}

{
  const fixture = CHAT_CASES[0];
  const receipts: CompanionMaterialDeliveryReceipt[] = [];
  const requestAt = (now: number, requestId: string) => request(fixture.charId, {
    requestId,
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
    query: fixture.query,
    semanticTags: [fixture.claimKey],
    groundingRefs: grounding(fixture.charId, 'live_user_turn', fixture.claimKey).map(ref => ({
      ...ref,
      occurredAt: now,
      validUntil: now + 60_000,
    })),
    maxItems: 1,
    now,
  });
  const first = select(fixture.charId, requestAt(NOW, 'chat-cooldown:first'), receipts);
  assert.equal(first.items.length, 1);
  receipts.push(receiptFor(first, NOW));
  const firstRecord = builtInDeepspaceRetrievalCalibrationForCharacter(fixture.charId)
    .find(record => record.id === first.selectedMaterialIds[0]);
  assert.ok(firstRecord);
  const exactBlocked = selectCompanionMaterialFromRecords({
    request: requestAt(NOW + 1_000, 'chat-cooldown:exact-blocked'),
    records: [firstRecord],
    receipts,
  });
  assert.equal(
    exactBlocked.items.length,
    0,
    'ordinary Chat must allow NONE while the exact delivered calibration is cooling down',
  );
  const second = select(
    fixture.charId,
    requestAt(NOW + 1_000, 'chat-cooldown:second'),
    receipts,
  );
  assert.equal(
    second.selectedMaterialIds.includes(first.selectedMaterialIds[0]),
    false,
    'ordinary Chat must not immediately repeat the exact delivered calibration',
  );
  const recovered = selectCompanionMaterialFromRecords({
    request: requestAt(NOW + (6 * 60 * 60 * 1000) + 1, 'chat-cooldown:recovered'),
    records: [firstRecord],
    receipts,
  });
  assert.equal(
    recovered.selectedMaterialIds.includes(first.selectedMaterialIds[0]),
    true,
    'ordinary Chat calibration may return after its effective reuse window',
  );
}

for (const charId of CHAR_IDS) {
  const generic = select(charId, request(charId, {
    requestId: `generic:${charId}`,
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
    query: '在吗',
    semanticTags: ['low_signal'],
    maxItems: 1,
  }));
  assert.ok(generic.items.length <= 1, `${charId} generic greeting cannot stack material`);
  assert.equal(
    generic.items.some(item => (
      item.slot === 'opening_recipes'
      || item.slot === 'proactive_seeds'
      || item.slot === 'scene_affordances'
      || item.slot === 'motive_candidates'
    )),
    false,
  );
}

{
  const charId = BUILT_IN_DEEPSPACE_QIYU_ID;
  const routeRef = {
    routeId: 'route-once',
    branchId: 'branch-once',
    sceneId: 'scene-once',
    lane: 'mainline' as const,
  };
  const sceneRequest = request(charId, {
    requestId: 'scene-once:first',
    surface: 'storydesk',
    mode: 'story_planning',
    purpose: 'scene_planning',
    query: '根据已有现场线索规划一个仍可改变的轻场景。',
    semanticTags: ['scene_planning', 'light_scene'],
    groundingRefs: grounding(charId, 'scene_context', 'scene_planning'),
    routeRef,
    maxItems: 3,
  });
  const first = select(charId, sceneRequest);
  assert.equal(first.items.some(item => item.slot === 'scene_affordances'), true);
  const consumed = [receiptFor(first, NOW, 'scene_plan')];
  const repeated = select(charId, {
    ...sceneRequest,
    requestId: 'scene-once:repeat',
    now: NOW + 1_000,
  }, consumed);
  assert.equal(
    repeated.items.some(item => item.slot === 'scene_affordances'),
    false,
    'one exact ScenePlan route must not consume the same affordance twice',
  );
  const nextScene = select(charId, {
    ...sceneRequest,
    requestId: 'scene-once:next-scene',
    routeRef: { ...routeRef, sceneId: 'scene-next' },
    now: NOW + 2_000,
  }, consumed);
  assert.equal(
    nextScene.items.some(item => item.slot === 'scene_affordances'),
    true,
    'a different exact scene may reuse the character affordance',
  );
}

for (const fixture of CHAT_CASES) {
  const opening = select(fixture.charId, request(fixture.charId, {
    requestId: `opening:${fixture.charId}`,
    surface: 'call',
    mode: 'call',
    purpose: 'opening',
    query: fixture.query,
    semanticTags: ['opening', fixture.claimKey],
    groundingRefs: grounding(fixture.charId, 'live_user_turn', fixture.claimKey),
    maxItems: 2,
  }));
  assert.equal(
    opening.items.some(item => item.slot === 'opening_recipes'),
    true,
    `${fixture.charId} concrete opening needs an opening-recipe path`,
  );
}

const CARE_CHAR_IDS = [
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
] as const;
for (const charId of CARE_CHAR_IDS) {
  const base = request(charId, {
    requestId: `care:${charId}`,
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    query: '已确认玩家有一项具体、可回应的负担。',
    semanticTags: ['proactive_intent', 'care_needed'],
    maxItems: 2,
  });
  assert.equal(select(charId, base).items.some(item => item.materialId.includes('optional_care')), false);
  assert.equal(
    select(charId, {
      ...base,
      requestId: `care-grounded:${charId}`,
      groundingRefs: grounding(charId, 'confirmed_user_state', 'care_relevant_state'),
    }).items.some(item => item.materialId.includes('optional_care')),
    true,
    `${charId} confirmed user-state path must be usable`,
  );
}

for (const charId of CHAR_IDS) {
  const base = request(charId, {
    requestId: `life:${charId}`,
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    query: '从已经确认的角色日常事项里挑一点发起联系。',
    semanticTags: ['proactive_intent', 'character_self_share', 'independent_life'],
    maxItems: 2,
  });
  assert.equal(select(charId, {
    ...base,
    requestId: `life-wakeup-only:${charId}`,
    groundingRefs: grounding(charId, 'wakeup_rule', 'proactive_intent'),
  }).items.some(item => item.materialId.includes('own_thread')), false);
  assert.equal(
    select(charId, {
      ...base,
      requestId: `life-grounded:${charId}`,
      groundingRefs: grounding(charId, 'character_life_receipt', 'self_life_thread'),
    }).items.some(item => item.materialId.includes('own_thread')),
    true,
    `${charId} canonical Life path must be usable`,
  );
}

const REENTRY_CHAR_IDS = [
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
] as const;
for (const charId of REENTRY_CHAR_IDS) {
  const base = request(charId, {
    requestId: `reentry:${charId}`,
    surface: 'call',
    mode: 'call',
    purpose: 'opening',
    query: '重新接起之前那件没有说完的小事。',
    semanticTags: ['reentry', 'opening'],
    maxItems: 2,
  });
  assert.equal(select(charId, base).items.some(item => item.materialId.includes('reentry')), false);
  assert.equal(
    select(charId, {
      ...base,
      requestId: `reentry-grounded:${charId}`,
      groundingRefs: grounding(charId, 'canonical_thread_receipt', 'reentry_thread'),
    }).items.some(item => item.materialId.includes('reentry')),
    true,
  );
}

for (const charId of CHAR_IDS) {
  const base = request(charId, {
    requestId: `scene:${charId}`,
    surface: 'storydesk',
    mode: 'story_planning',
    purpose: 'scene_planning',
    query: '根据已有现场线索规划一个仍可改变的轻场景。',
    semanticTags: ['scene_planning', 'light_scene'],
    routeRef: {
      routeId: 'fixture-route',
      branchId: 'fixture-branch',
      sceneId: `fixture-scene:${charId}`,
      lane: 'mainline',
    },
    maxItems: 3,
  });
  assert.equal(select(charId, base).items.some(item => item.slot === 'scene_affordances'), false);
  assert.equal(
    select(charId, {
      ...base,
      requestId: `scene-grounded:${charId}`,
      groundingRefs: grounding(charId, 'scene_context', 'scene_planning'),
    }).items.some(item => item.slot === 'scene_affordances'),
    true,
    `${charId} Director needs a legal scene-affordance positive path`,
  );
}

const sylusMotive = select(BUILT_IN_DEEPSPACE_QINCHE_ID, request(BUILT_IN_DEEPSPACE_QINCHE_ID, {
  requestId: 'sylus-motive',
  surface: 'storydesk',
  mode: 'story_planning',
  purpose: 'scene_planning',
  query: '比较不同选择的真实代价，寻找场景理由。',
  semanticTags: ['scene_planning', 'choice_tradeoff'],
  routeRef: {
    routeId: 'fixture-route',
    branchId: 'fixture-branch',
    sceneId: `fixture-scene:${BUILT_IN_DEEPSPACE_QINCHE_ID}`,
    lane: 'mainline',
  },
  groundingRefs: grounding(BUILT_IN_DEEPSPACE_QINCHE_ID, 'scene_context', 'choice_tradeoff'),
  maxItems: 3,
}));
assert.equal(sylusMotive.items.some(item => item.slot === 'motive_candidates'), true);
assert.equal(
  sylusMotive.items.some(item => item.guidance.includes('currentMotive')),
  false,
);

console.log('built-in deepspace non-vector retrieval calibration: green semantic=41 surface=15 sparse<=3');
