import assert from 'node:assert/strict';
import {
  assertValidCompanionMaterialDeliveryReceipt,
  assertValidCompanionMaterialRecord,
} from '../domain/companionMaterial/contract.ts';
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
import { projectCompanionMaterialSelection } from '../domain/companionMaterial/semanticProjection.ts';
import { createHistoryScopeKey } from '../domain/historyImport/contract.ts';

const T0 = 1_700_000_000_000;
const scope = {
  progressBundleId: 'bundle-a',
  personaMaskId: 'mask-a',
  charId: 'char-a',
};

const request = (overrides: Partial<CompanionMaterialSelectionRequest> = {}): CompanionMaterialSelectionRequest => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  requestId: 'request-a',
  scope,
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  contextTags: ['care'],
  relationshipStage: 'unknown',
  budgetChars: 240,
  maxItems: 5,
  now: T0,
  ...overrides,
});

const material = (overrides: Partial<CompanionMaterialRecord> = {}): CompanionMaterialRecord => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  id: 'material-voice',
  ownerScope: { kind: 'character', charId: 'char-a' },
  charId: 'char-a',
  kind: 'language_fingerprint',
  slot: 'stable_character_voice',
  guidance: '短句回应，先观察再轻轻关照；不复述任何参考台词。',
  renderPolicy: 'style_only',
  knowledge: 'char_private',
  continuity: 'canon',
  eligibleModes: ['remote_chat', 'call'],
  eligiblePurposes: ['stable_context'],
  tags: ['care'],
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-voice-a',
    revision: 1,
    sourceFingerprint: 'voice-fp-a',
  }],
  status: 'active',
  createdAt: T0 - 1,
  updatedAt: T0 - 1,
  revision: 1,
  ...overrides,
});

const semanticRankFor = (
  records: readonly CompanionMaterialRecord[],
  scores: CompanionMaterialSemanticRank['scores'],
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
});

const semanticAuthorityFor = (
  records: readonly CompanionMaterialRecord[],
): CompanionMaterialSemanticRankAuthority => {
  const { scores: _scores, ...binding } = semanticRankFor(records, []);
  return {
    ...binding,
    authority: 'trusted_local_index_manifest',
  };
};

const voice = material();
const opening = material({
  id: 'material-opening',
  kind: 'opening_recipe',
  slot: 'opening_recipes',
  guidance: '从一个具体小发现落第一拍，再留一个可拒绝的轻问。',
  renderPolicy: 'transform_required',
  eligibleModes: ['proactive_letter', 'meet_scene', 'story_scene'],
  eligiblePurposes: ['opening', 'proactive_intent'],
  tags: ['care', 'opening'],
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-opening-a',
    revision: 1,
    sourceFingerprint: 'opening-fp-a',
  }],
});
const relationshipMotive = material({
  id: 'material-motive',
  ownerScope: { kind: 'relationship', scope },
  kind: 'initiative_motive',
  slot: 'motive_candidates',
  guidance: '这次联系只为轻轻确认近况，不把用户的沉默解释为拒绝。',
  renderPolicy: 'decision_context',
  knowledge: 'relationship_private',
  continuity: 'relationship',
  eligibleModes: ['proactive_letter', 'story_scene'],
  eligiblePurposes: ['proactive_intent', 'scene_planning'],
  tags: ['care'],
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-motive-a',
    revision: 1,
    sourceFingerprint: 'motive-fp-a',
  }],
});
const sceneOnly = material({
  id: 'material-scene',
  ownerScope: { kind: 'relationship', scope },
  kind: 'initiative_motive',
  slot: 'motive_candidates',
  guidance: '当前场景里，角色想确认那条尚未解决的线索是否仍安全。',
  renderPolicy: 'decision_context',
  knowledge: 'relationship_private',
  continuity: 'scene_only',
  routeId: 'route-a',
  branchId: 'branch-a',
  sceneId: 'scene-a',
  eligibleModes: ['story_scene'],
  eligiblePurposes: ['scene_planning'],
  tags: ['clue'],
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-scene-a',
    revision: 1,
    sourceFingerprint: 'scene-fp-a',
  }],
});

[voice, opening, relationshipMotive, sceneOnly].forEach(assertValidCompanionMaterialRecord);

const chatSelection = selectCompanionMaterialFromRecords({
  request: request(),
  records: [voice, opening, relationshipMotive, sceneOnly],
});
assert.deepEqual(chatSelection.items.map(item => item.materialId), ['material-voice']);
assert.equal(chatSelection.items[0].renderPolicy, 'style_only');
assert.equal(chatSelection.items[0].guidance.includes('台词。'), true);

const proactiveSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-proactive',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
  }),
  records: [voice, opening, relationshipMotive],
});
assert.deepEqual(
  proactiveSelection.items.map(item => item.materialId).sort(),
  ['material-motive', 'material-opening'],
  'proactive material and a relationship-scoped motive may enter together',
);
const proactiveProjection = projectCompanionMaterialSelection(proactiveSelection);
assert.deepEqual(proactiveProjection.surfaceMaterial.openingRecipes.map(item => item.materialId), ['material-opening']);
assert.deepEqual(proactiveProjection.surfaceMaterial.motiveCandidates.map(item => item.materialId), ['material-motive']);
assert.equal('currentMotives' in proactiveProjection, false, 'material candidates must not impersonate Director current motives');

const wrongScopeSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-other-mask',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    scope: { ...scope, personaMaskId: 'mask-b' },
  }),
  records: [opening, relationshipMotive],
});
assert.deepEqual(wrongScopeSelection.items.map(item => item.materialId), ['material-opening']);
assert.ok(wrongScopeSelection.warnings.some(item => item === 'excluded_scope:1'));

const closeOnly = material({
  id: 'material-close-only',
  relationshipFloor: 'close',
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-close-a',
    revision: 1,
    sourceFingerprint: 'close-fp-a',
  }],
});
const earlyRelationshipSelection = selectCompanionMaterialFromRecords({
  request: request({ relationshipStage: 'new' }),
  records: [closeOnly],
});
assert.equal(earlyRelationshipSelection.items.length, 0);
assert.ok(earlyRelationshipSelection.warnings.some(item => item === 'excluded_relationship_floor:1'));

const groundedOwnThread = material({
  id: 'material-grounded-own-thread',
  kind: 'proactive_seed',
  slot: 'proactive_seeds',
  guidance: '只从已经有权读取的生活事项起念；若没有这样的事项，就不制造角色刚刚经历了什么。',
  renderPolicy: 'transform_required',
  eligibleModes: ['proactive_letter'],
  eligiblePurposes: ['proactive_intent'],
  tags: ['proactive', 'independent_life'],
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['proactive_intent', 'independent_life'],
  },
  groundingPolicy: {
    allOf: [{ kind: 'character_life_receipt', claimKey: 'self_life_thread' }],
  },
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-grounded-own-thread',
    revision: 1,
    sourceFingerprint: 'grounded-own-thread-fp',
  }],
});
assertValidCompanionMaterialRecord(groundedOwnThread);
const ungroundedOwnThreadSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-own-thread-without-grounding',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    semanticTags: ['proactive_intent', 'independent_life'],
  }),
  records: [groundedOwnThread],
});
assert.deepEqual(ungroundedOwnThreadSelection.items, []);
assert.ok(ungroundedOwnThreadSelection.warnings.includes('excluded_grounding:1'));

const expiredGroundingSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-own-thread-expired-grounding',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    semanticTags: ['proactive_intent', 'independent_life'],
    groundingRefs: [{
      kind: 'character_life_receipt',
      claimKey: 'self_life_thread',
      refId: 'character-life-a',
      revision: 1,
      scope,
      occurredAt: T0 - 10_000,
      validUntil: T0 - 1,
    }],
  }),
  records: [groundedOwnThread],
});
assert.deepEqual(expiredGroundingSelection.items, []);
assert.ok(expiredGroundingSelection.warnings.includes('excluded_grounding:1'));

const wrongAuthorityGroundingSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-own-thread-wrong-authority',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    semanticTags: ['proactive_intent', 'independent_life'],
    groundingRefs: [{
      kind: 'wakeup_rule',
      claimKey: 'self_life_thread',
      refId: 'wakeup-rule-cannot-prove-life',
      revision: 1,
      scope,
      occurredAt: T0,
      validUntil: T0 + 60_000,
    }],
  }),
  records: [groundedOwnThread],
});
assert.deepEqual(wrongAuthorityGroundingSelection.items, []);
assert.ok(wrongAuthorityGroundingSelection.warnings.includes('excluded_grounding:1'));

const wrongClaimGroundingSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-own-thread-wrong-claim',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    semanticTags: ['proactive_intent', 'independent_life'],
    groundingRefs: [{
      kind: 'character_life_receipt',
      claimKey: 'unrelated_life_claim',
      refId: 'character-life-unrelated',
      revision: 1,
      scope,
      occurredAt: T0,
      validUntil: T0 + 60_000,
    }],
  }),
  records: [groundedOwnThread],
});
assert.deepEqual(wrongClaimGroundingSelection.items, []);
assert.ok(wrongClaimGroundingSelection.warnings.includes('excluded_grounding:1'));

const groundedOwnThreadSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-own-thread-grounded',
    surface: 'proactive_letter',
    mode: 'proactive_letter',
    purpose: 'proactive_intent',
    semanticTags: ['proactive_intent', 'independent_life'],
    groundingRefs: [{
      kind: 'character_life_receipt',
      claimKey: 'self_life_thread',
      refId: 'character-life-a',
      revision: 1,
      scope,
      occurredAt: T0 - 10_000,
      validUntil: T0 + 60_000,
    }],
  }),
  records: [groundedOwnThread],
});
assert.deepEqual(groundedOwnThreadSelection.selectedMaterialIds, [groundedOwnThread.id]);
assert.ok(groundedOwnThreadSelection.items[0].selectionReasons.includes('grounding_match'));

assert.throws(
  () => selectCompanionMaterialFromRecords({
    request: request({
      requestId: 'request-own-thread-wrong-grounding-scope',
      surface: 'proactive_letter',
      mode: 'proactive_letter',
      purpose: 'proactive_intent',
      groundingRefs: [{
        kind: 'character_life_receipt',
        claimKey: 'self_life_thread',
        refId: 'character-life-b',
        revision: 1,
        scope: { ...scope, personaMaskId: 'mask-b' },
        occurredAt: T0,
      }],
    }),
    records: [groundedOwnThread],
  }),
  /groundingRefs\[0\] must match request scope/,
);

const noRouteSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-no-route',
    surface: 'storydesk',
    mode: 'story_scene',
    purpose: 'scene_planning',
  }),
  records: [sceneOnly],
});
assert.equal(noRouteSelection.items.length, 0);
assert.ok(noRouteSelection.warnings.some(item => item === 'excluded_continuity:1'));

const sceneSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-scene',
    surface: 'storydesk',
    mode: 'story_scene',
    purpose: 'scene_planning',
    routeRef: {
      routeId: 'route-a',
      branchId: 'branch-a',
      sceneId: 'scene-a',
      lane: 'mainline',
    },
  }),
  records: [sceneOnly],
});
assert.deepEqual(sceneSelection.items.map(item => item.materialId), ['material-scene']);
assert.deepEqual(sceneSelection.routeRef, {
  routeId: 'route-a',
  branchId: 'branch-a',
  sceneId: 'scene-a',
  lane: 'mainline',
});
assert.equal(sceneSelection.items[0].routeId, 'route-a');
assert.equal(sceneSelection.items[0].branchId, 'branch-a');
assert.equal(sceneSelection.items[0].sceneId, 'scene-a');

assert.throws(
  () => assertValidCompanionMaterialRecord(material({
    id: 'invalid-current-motive',
    kind: 'initiative_motive',
    slot: 'relevant_stable_details',
    renderPolicy: 'decision_context',
    eligibleModes: ['proactive_letter'],
    eligiblePurposes: ['proactive_intent'],
  })),
  /kind, slot, and renderPolicy are incompatible/,
);

const receipt = createCompanionMaterialDeliveryReceipt({
  selection: proactiveSelection,
  consumerRef: { kind: 'prompt', id: 'compiler-a', revision: '1' },
  delivered: proactiveSelection.items.map(item => ({
    materialId: item.materialId,
    promptCharCount: item.estimatedChars,
  })),
  occurredAt: T0 + 10,
});
assert.equal(receipt.truthEffect, 'none');
assert.equal(receipt.status, 'delivered');
assert.equal(receipt.delivered.length, proactiveSelection.items.length);
assert.ok(receipt.delivered.every(item => item.materialRevision === 1));
assert.throws(
  () => assertValidCompanionMaterialDeliveryReceipt({
    ...receipt,
    status: 'skipped',
  }),
  /skipped or rejected receipt cannot contain delivered material/,
);
assert.throws(
  () => createCompanionMaterialDeliveryReceipt({
    selection: proactiveSelection,
    consumerRef: { kind: 'prompt', id: 'compiler-b', revision: '1' },
    delivered: [{ materialId: 'unselected', promptCharCount: 10 }],
    occurredAt: T0 + 11,
  }),
  /unselected material/,
);

const lowSignalVoice = material({
  id: 'material-low-signal-voice',
  tags: ['ordinary'],
  retrievalHints: {
    activationPolicy: 'voice_fallback',
    positiveSignals: ['observation'],
    variationGroup: 'low_signal_voice',
    fallbackPriority: 10,
  },
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-low-signal-voice',
    revision: 1,
    sourceFingerprint: 'low-signal-voice-fp',
  }],
});
const firstLowSignalSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-low-signal-first',
    query: '嗨。',
    contextTags: [],
    maxItems: 1,
  }),
  records: [lowSignalVoice],
});
assert.deepEqual(
  firstLowSignalSelection.items.map(item => item.materialId),
  ['material-low-signal-voice'],
  'a fresh low-signal turn keeps a positive optional voice path',
);
const firstLowSignalReceipt = createCompanionMaterialDeliveryReceipt({
  selection: firstLowSignalSelection,
  consumerRef: { kind: 'prompt', id: 'low-signal-first', revision: '1' },
  delivered: firstLowSignalSelection.items.map(item => ({
    materialId: item.materialId,
    promptCharCount: item.estimatedChars,
  })),
  occurredAt: T0,
});
const repeatedLowSignalSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-low-signal-repeat',
    query: '在吗。',
    contextTags: [],
    maxItems: 1,
    now: T0 + 60_000,
  }),
  records: [lowSignalVoice],
  receipts: [firstLowSignalReceipt],
});
assert.deepEqual(
  repeatedLowSignalSelection.items,
  [],
  'a repeated low-signal turn may rely on the role card instead of replaying the same fallback shape',
);
const cooledLowSignalSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-low-signal-after-cooldown',
    query: '嗨。',
    contextTags: [],
    maxItems: 1,
    now: T0 + 7 * 60 * 60 * 1000,
  }),
  records: [lowSignalVoice],
  receipts: [firstLowSignalReceipt],
});
assert.deepEqual(
  cooledLowSignalSelection.items.map(item => item.materialId),
  ['material-low-signal-voice'],
  'the low-signal positive path returns after its short anti-repetition window',
);

const priorGroupVoice = material({
  id: 'material-prior-group-voice',
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['care'],
    variationGroup: 'shared_response_shape',
  },
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-prior-group-voice',
    revision: 1,
    sourceFingerprint: 'prior-group-voice-fp',
  }],
});
const sameGroupVoice = material({
  id: 'material-same-group-voice',
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['care'],
    variationGroup: 'shared_response_shape',
  },
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-same-group-voice',
    revision: 1,
    sourceFingerprint: 'same-group-voice-fp',
  }],
});
const freshGroupVoice = material({
  id: 'material-fresh-group-voice',
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['care'],
    variationGroup: 'fresh_response_shape',
  },
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-fresh-group-voice',
    revision: 1,
    sourceFingerprint: 'fresh-group-voice-fp',
  }],
});
const priorGroupSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-prior-group',
    maxItems: 1,
    semanticRank: semanticRankFor(
      [priorGroupVoice, sameGroupVoice, freshGroupVoice],
      [
        { materialId: priorGroupVoice.id, score: 0.99 },
        { materialId: sameGroupVoice.id, score: 0.1 },
        { materialId: freshGroupVoice.id, score: 0.1 },
      ],
    ),
  }),
  records: [priorGroupVoice, sameGroupVoice, freshGroupVoice],
  semanticRankAuthority: semanticAuthorityFor([priorGroupVoice, sameGroupVoice, freshGroupVoice]),
});
const priorGroupReceipt = createCompanionMaterialDeliveryReceipt({
  selection: priorGroupSelection,
  consumerRef: { kind: 'prompt', id: 'prior-group', revision: '1' },
  delivered: priorGroupSelection.items.map(item => ({
    materialId: item.materialId,
    promptCharCount: item.estimatedChars,
  })),
  occurredAt: T0,
});
const rotatedGroupSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-rotate-group',
    maxItems: 1,
    now: T0 + 60_000,
  }),
  records: [priorGroupVoice, sameGroupVoice, freshGroupVoice],
  receipts: [priorGroupReceipt],
});
assert.deepEqual(
  rotatedGroupSelection.items.map(item => item.materialId),
  ['material-fresh-group-voice'],
  'recent delivery of a sibling material should rotate to a different response-shape group',
);

const crossSurfaceOpening = material({
  id: 'material-cross-surface-opening',
  kind: 'opening_recipe',
  slot: 'opening_recipes',
  guidance: '从当前已经出现的一处细节落第一拍，再留下开放的回应空间。',
  renderPolicy: 'transform_required',
  eligibleModes: ['call', 'date_scene'],
  eligiblePurposes: ['opening'],
  tags: ['opening'],
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['opening', 'observation'],
    variationGroup: 'cross_surface_opening',
  },
  cooldownMs: 48 * 60 * 60 * 1000,
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'review-cross-surface-opening',
    revision: 1,
    sourceFingerprint: 'cross-surface-opening-fp-v1',
  }],
});
const firstCallOpeningSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-call-opening',
    surface: 'call',
    mode: 'call',
    purpose: 'opening',
    semanticTags: ['opening', 'observation'],
    maxItems: 1,
  }),
  records: [crossSurfaceOpening],
});
const firstCallOpeningReceipt = createCompanionMaterialDeliveryReceipt({
  selection: firstCallOpeningSelection,
  consumerRef: { kind: 'prompt', id: 'call-opening', revision: '1' },
  delivered: firstCallOpeningSelection.items.map(item => ({
    materialId: item.materialId,
    promptCharCount: item.estimatedChars,
  })),
  occurredAt: T0,
});
const repeatedCallOpeningSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-call-opening-repeat',
    surface: 'call',
    mode: 'call',
    purpose: 'opening',
    semanticTags: ['opening', 'observation'],
    maxItems: 1,
    now: T0 + 60_000,
  }),
  records: [crossSurfaceOpening],
  receipts: [firstCallOpeningReceipt],
});
assert.deepEqual(
  repeatedCallOpeningSelection.items,
  [],
  'the same material revision stays on cooldown inside one usage class',
);
const dateOpeningAfterCallSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-date-opening-after-call',
    surface: 'date',
    mode: 'date_scene',
    purpose: 'opening',
    semanticTags: ['opening', 'observation'],
    maxItems: 1,
    now: T0 + 60_000,
  }),
  records: [crossSurfaceOpening],
  receipts: [firstCallOpeningReceipt],
});
assert.deepEqual(
  dateOpeningAfterCallSelection.selectedMaterialIds,
  [crossSurfaceOpening.id],
  'a Call opening must not consume the independent Date opening cooldown',
);
const revisedCrossSurfaceOpening: CompanionMaterialRecord = {
  ...crossSurfaceOpening,
  revision: 2,
  updatedAt: T0 + 1,
  sourceRefs: [{
    ...crossSurfaceOpening.sourceRefs[0],
    revision: 2,
    sourceFingerprint: 'cross-surface-opening-fp-v2',
  }],
};
const revisedCallOpeningSelection = selectCompanionMaterialFromRecords({
  request: request({
    requestId: 'request-revised-call-opening',
    surface: 'call',
    mode: 'call',
    purpose: 'opening',
    semanticTags: ['opening', 'observation'],
    maxItems: 1,
    now: T0 + 60_000,
  }),
  records: [revisedCrossSurfaceOpening],
  receipts: [firstCallOpeningReceipt],
});
assert.deepEqual(
  revisedCallOpeningSelection.selectedMaterialIds,
  [revisedCrossSurfaceOpening.id],
  'a new material-set revision must not inherit stale cooldown from the old revision',
);

console.log('companion material contract: green');
