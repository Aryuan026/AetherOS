import assert from 'node:assert/strict';
import { projectCompanionMaterialPrompt } from '../domain/companionMaterial/promptProjection.ts';
import { projectCompanionMaterialSelection } from '../domain/companionMaterial/semanticProjection.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryItem,
  type CompanionMaterialSelection,
} from '../domain/companionMaterial/types.ts';

const T0 = 1_700_000_000_000;
const scope = {
  progressBundleId: 'prompt-projection-bundle',
  personaMaskId: 'prompt-projection-mask',
  charId: 'prompt-projection-char',
};

const item = (overrides: Partial<CompanionMaterialDeliveryItem> = {}): CompanionMaterialDeliveryItem => ({
  materialId: 'voice-a',
  slot: 'stable_character_voice',
  kind: 'language_fingerprint',
  guidance: '回应时先保留观察，再以角色自己的节奏给出具体而轻的关照。',
  renderPolicy: 'style_only',
  knowledge: 'char_private',
  continuity: 'canon',
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'private-only-reference',
    revision: 1,
    sourceFingerprint: 'private-only-fingerprint',
  }],
  selectionReasons: ['fixture'],
  estimatedChars: 30,
  ...overrides,
});

const voice = item();
const agency = item({
  materialId: 'agency-a',
  slot: 'stable_base',
  kind: 'initiative_motive',
  guidance: '长期倾向于在看见需要时主动提供可拒绝的支持。',
  renderPolicy: 'decision_context',
});
const opening = item({
  materialId: 'opening-a',
  slot: 'opening_recipes',
  kind: 'opening_recipe',
  guidance: '以一处具体观察起步，再留出对方自然回应或暂不回应的空间。',
  renderPolicy: 'transform_required',
});
const proactive = item({
  materialId: 'proactive-a',
  slot: 'proactive_seeds',
  kind: 'proactive_seed',
  guidance: '可从一条轻微但真实的近况线索发起联系。',
  renderPolicy: 'transform_required',
});
const motive = item({
  materialId: 'motive-a',
  slot: 'motive_candidates',
  kind: 'initiative_motive',
  guidance: '可以考虑确认一件仍悬而未决的小事是否需要被照看。',
  renderPolicy: 'decision_context',
  continuity: 'relationship',
});
const affordance = item({
  materialId: 'affordance-a',
  slot: 'scene_affordances',
  kind: 'scene_affordance',
  guidance: '场景允许角色先观察环境变化，再决定是否靠近线索。',
  renderPolicy: 'decision_context',
  continuity: 'scene_only',
});

const selection = (overrides: Partial<CompanionMaterialSelection> = {}): CompanionMaterialSelection => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  selectionId: 'prompt-selection-a',
  requestId: 'prompt-request-a',
  scope,
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  sourceRevisionFingerprint: 'fixture-revision',
  budgetChars: 1_600,
  items: [voice, agency, opening, proactive, motive, affordance],
  selectedMaterialIds: [voice, agency, opening, proactive, motive, affordance].map(entry => entry.materialId),
  warnings: [],
  selectedAt: T0,
  ...overrides,
});

const remoteSelection = selection();
const remoteProjection = projectCompanionMaterialPrompt({
  source: remoteSelection,
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  budgetChars: 1_000,
});
assert.deepEqual(remoteProjection.fragments.map(fragment => fragment.materialId), ['voice-a', 'agency-a']);
assert.deepEqual(
  remoteProjection.dropped
    .filter(drop => drop.reason === 'surface_ineligible')
    .map(drop => drop.materialId)
    .sort(),
  ['affordance-a', 'motive-a', 'opening-a', 'proactive-a'],
  'scene and proactive material must not become resident normal-chat context',
);
const remoteText = remoteProjection.fragments.map(fragment => fragment.text).join('\n');
assert.match(remoteText, /表达方向/);
assert.match(remoteText, /长期行动倾向/);
assert.doesNotMatch(remoteText, /currentMotives|固定动作|必须爱|[“”]/);
assert.equal(remoteProjection.usedChars <= remoteProjection.budgetChars, true);
remoteProjection.fragments.forEach(fragment => {
  assert.equal(fragment.charCount, fragment.text.length);
  assert.ok(fragment.renderedHash.length > 0);
});
const serialisedRemote = JSON.stringify(remoteProjection);
assert.equal(serialisedRemote.includes('sourceRefs'), false, 'prompt projection must never expose source pointers');
assert.equal(serialisedRemote.includes('private-only-reference'), false, 'prompt projection must never expose private source ids');
assert.equal(serialisedRemote.includes('allowlist'), false, 'material projection must not decide tool availability');
assert.equal(serialisedRemote.includes('denylist'), false, 'material projection must not decide tool availability');

const proactiveSelection = selection({
  selectionId: 'prompt-selection-proactive',
  surface: 'proactive_letter',
  mode: 'proactive_letter',
  purpose: 'proactive_intent',
  items: [voice, opening, proactive, motive],
  selectedMaterialIds: [voice, opening, proactive, motive].map(entry => entry.materialId),
});
const proactiveSemanticProjection = projectCompanionMaterialSelection(proactiveSelection);
const proactiveProjection = projectCompanionMaterialPrompt({
  source: proactiveSemanticProjection,
  surface: 'proactive_letter',
  mode: 'proactive_letter',
  purpose: 'proactive_intent',
  budgetChars: 1_000,
});
assert.deepEqual(
  proactiveProjection.fragments.map(fragment => fragment.materialId).sort(),
  ['motive-a', 'opening-a', 'proactive-a', 'voice-a'],
  'proactive material remains optional and only reaches its matching surface',
);
const proactiveText = proactiveProjection.fragments.map(fragment => fragment.text).join('\n');
assert.match(proactiveText, /开场生成方向/);
assert.match(proactiveText, /主动联系线索/);
assert.match(proactiveText, /行动线索候选/);
assert.doesNotMatch(proactiveText, /currentMotives|现在必须|固定动作/);

const sceneSelection = selection({
  selectionId: 'prompt-selection-scene',
  surface: 'storydesk',
  mode: 'story_scene',
  purpose: 'scene_planning',
  items: [voice, motive, affordance],
  selectedMaterialIds: [voice, motive, affordance].map(entry => entry.materialId),
});
const sceneProjection = projectCompanionMaterialPrompt({
  source: sceneSelection,
  surface: 'storydesk',
  mode: 'story_scene',
  purpose: 'scene_planning',
  budgetChars: 1_000,
});
assert.deepEqual(sceneProjection.fragments.map(fragment => fragment.materialId).sort(), ['affordance-a', 'motive-a', 'voice-a']);

const fullBudget = projectCompanionMaterialPrompt({
  source: selection({ items: [voice, agency], selectedMaterialIds: [voice.materialId, agency.materialId] }),
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  budgetChars: 1_000,
});
const limitedBudget = projectCompanionMaterialPrompt({
  source: selection({ items: [voice, agency], selectedMaterialIds: [voice.materialId, agency.materialId] }),
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  budgetChars: fullBudget.fragments[0].charCount,
});
assert.equal(limitedBudget.fragments.length, 1);
assert.equal(limitedBudget.dropped.some(drop => drop.reason === 'budget'), true);
assert.equal(limitedBudget.usedChars <= limitedBudget.budgetChars, true);

assert.throws(
  () => projectCompanionMaterialPrompt({
    source: remoteSelection,
    surface: 'storydesk',
    mode: 'story_scene',
    purpose: 'scene_planning',
    budgetChars: 100,
  }),
  /context must match its selected source/,
  'a caller cannot reclassify normal-chat material as scene material',
);

console.log('companion material prompt projection: green');
