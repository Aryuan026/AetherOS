import assert from 'node:assert/strict';
import {
  assertValidCompanionMaterialDeliveryReceipt,
  assertValidCompanionMaterialRecord,
} from '../domain/companionMaterial/contract.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialRecord,
  type CompanionMaterialSelectionRequest,
} from '../domain/companionMaterial/types.ts';
import { createCompanionMaterialDeliveryReceipt } from '../domain/companionMaterial/deliveryReceipt.ts';
import { selectCompanionMaterialFromRecords } from '../domain/companionMaterial/selection.ts';
import { projectCompanionMaterialSelection } from '../domain/companionMaterial/semanticProjection.ts';

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

console.log('companion material contract: green');
