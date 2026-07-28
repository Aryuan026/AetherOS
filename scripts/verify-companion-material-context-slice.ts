import assert from 'node:assert/strict';
import {
  compileCompanionMaterialContextSlice,
} from '../domain/contextCompiler/companionMaterialContext.ts';
import {
  projectCompanionMaterialPrompt,
  type CompanionMaterialPromptProjection,
} from '../domain/companionMaterial/promptProjection.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryItem,
  type CompanionMaterialSelection,
} from '../domain/companionMaterial/types.ts';

const T0 = 1_700_000_000_000;
const scope = {
  progressBundleId: 'context-slice-bundle',
  personaMaskId: 'context-slice-mask',
  charId: 'context-slice-char',
};

const item = (
  overrides: Partial<CompanionMaterialDeliveryItem> = {},
): CompanionMaterialDeliveryItem => {
  const guidance = overrides.guidance
    || '回应时保持角色自己的观察与节奏，再给出具体而留有余地的关照。';
  return {
    materialId: 'voice-a',
    slot: 'stable_character_voice',
    kind: 'language_fingerprint',
    renderPolicy: 'style_only',
    knowledge: 'relationship_private',
    continuity: 'relationship',
    sourceRefs: [{
      storeFamily: 'history_companion_material',
      recordId: 'private-source-record-must-not-leak',
      revision: 1,
      sourceFingerprint: 'private-source-fingerprint-must-not-leak',
      sourceLocator: 'private-source-locator-must-not-leak',
    }],
    selectionReasons: ['fixture'],
    ...overrides,
    guidance,
    estimatedChars: overrides.estimatedChars ?? guidance.length,
  };
};

const voice = item();
const canon = item({
  materialId: 'canon-a',
  slot: 'stable_base',
  kind: 'stable_detail',
  guidance: '角色长期保留一枚磨旧的银色书签，习惯把它夹在正在读的那一页。',
  renderPolicy: 'fact_reference',
});
const detail = item({
  materialId: 'detail-a',
  slot: 'relevant_stable_details',
  kind: 'stable_detail',
  guidance: '谈到阅读时，可以自然想起那枚银色书签，但不必每次都提。',
  renderPolicy: 'fact_reference',
});
const motive = item({
  materialId: 'motive-a',
  slot: 'motive_candidates',
  kind: 'initiative_motive',
  guidance: '可以考虑确认那条悬而未决的线索是否仍需要照看。',
  renderPolicy: 'decision_context',
});
const affordance = item({
  materialId: 'affordance-a',
  slot: 'scene_affordances',
  kind: 'scene_affordance',
  guidance: '场景允许角色先观察门廊留下的新痕迹，再决定是否靠近。',
  renderPolicy: 'decision_context',
  continuity: 'scene_only',
  branchId: 'branch-a',
});

const selection = (
  overrides: Partial<CompanionMaterialSelection> = {},
): CompanionMaterialSelection => {
  const items = overrides.items || [voice, canon, detail];
  return {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    selectionId: 'context-selection-a',
    requestId: 'context-request-a',
    scope,
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
    sourceRevisionFingerprint: 'context-source-revision-a',
    budgetChars: 4_000,
    warnings: [],
    selectedAt: T0,
    ...overrides,
    items,
    selectedMaterialIds: overrides.selectedMaterialIds
      || items.map(entry => entry.materialId),
  };
};

const projectionFor = (
  selected: CompanionMaterialSelection,
): CompanionMaterialPromptProjection => projectCompanionMaterialPrompt({
  source: selected,
  surface: selected.surface,
  mode: selected.mode,
  purpose: selected.purpose,
  budgetChars: selected.budgetChars,
});

const chatSelection = selection();
const chatProjection = projectionFor(chatSelection);
const chatSlice = compileCompanionMaterialContextSlice({
  selection: chatSelection,
  projection: chatProjection,
});

assert.ok(chatSlice.stableCharacterVoice.length > 0, 'normal Chat keeps a non-empty stable voice slice');
assert.deepEqual(chatSlice.stableBase.characterCanon.map(entry => entry.materialId), ['canon-a']);
assert.deepEqual(chatSlice.surfaceMaterial.relevantStableDetails.map(entry => entry.materialId), ['detail-a']);
assert.deepEqual(chatSlice.surfaceMaterial.openingRecipes, []);
assert.deepEqual(chatSlice.surfaceMaterial.proactiveSeeds, []);
assert.deepEqual(chatSlice.surfaceMaterial.motiveCandidates, []);
assert.deepEqual(chatSlice.surfaceMaterial.sceneAffordances, []);
assert.deepEqual(chatSlice.sourceSelectionRef.scope, scope);
assert.equal(
  chatSlice.sourceSelectionRef.scopeKey,
  'context-slice-bundle::context-slice-mask::context-slice-char',
);

const storySelection = selection({
  selectionId: 'context-selection-story',
  requestId: 'context-request-story',
  surface: 'storydesk',
  mode: 'story_planning',
  purpose: 'scene_planning',
  items: [motive, affordance],
});
const storySlice = compileCompanionMaterialContextSlice({
  selection: storySelection,
  projection: projectionFor(storySelection),
});
assert.deepEqual(storySlice.surfaceMaterial.motiveCandidates.map(entry => entry.materialId), ['motive-a']);
assert.deepEqual(storySlice.surfaceMaterial.sceneAffordances.map(entry => entry.materialId), ['affordance-a']);

const forbiddenKeys = [
  'currentMotives',
  'currentState',
  'characterLife',
  'toolAllowlist',
  'directive',
  'narrativeRun',
  'narrativeScene',
  'experienceReceipt',
  'deliveryReceipt',
  'truthEffect',
  'sourceRefs',
  'rawText',
];
const serializedStory = JSON.stringify(storySlice);
forbiddenKeys.forEach(key => {
  assert.equal(serializedStory.includes(key), false, `compiled slice must not expose ${key}`);
});
assert.equal(serializedStory.includes('private-source-record-must-not-leak'), false);
assert.equal(serializedStory.includes('private-source-fingerprint-must-not-leak'), false);
assert.equal(serializedStory.includes('private-source-locator-must-not-leak'), false);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: selection({
      scope: { ...scope, personaMaskId: '' },
    }),
    projection: chatProjection,
  }),
  /invalid exact HistoryScope/,
);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: chatSelection,
    projection: { ...chatProjection, selectionId: 'wrong-selection' },
  }),
  /selectionId does not match/,
);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: chatSelection,
    projection: { ...chatProjection, surface: 'storydesk' },
  }),
  /surface does not match/,
);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: chatSelection,
    projection: { ...chatProjection, mode: 'story_scene' },
  }),
  /mode does not match/,
);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: chatSelection,
    projection: { ...chatProjection, purpose: 'scene_planning' },
  }),
  /purpose does not match/,
);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: chatSelection,
    projection: {
      ...chatProjection,
      budgetChars: chatSelection.budgetChars + 1,
    },
  }),
  /budgetChars exceeds selection budgetChars/,
);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: chatSelection,
    projection: {
      ...chatProjection,
      fragments: chatProjection.fragments.map((fragment, index) => (
        index === 0 ? { ...fragment, renderedHash: 'tampered-hash' } : fragment
      )),
    },
  }),
  /renderedHash does not match/,
);

assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: {
      ...chatSelection,
      selectedMaterialIds: ['voice-a', 'canon-a'],
    },
    projection: chatProjection,
  }),
  /exactly match selectedMaterialIds/,
);

const maliciousChatSelection = selection({
  selectionId: 'context-selection-malicious-chat',
  requestId: 'context-request-malicious-chat',
  items: [voice, motive],
});
assert.throws(
  () => compileCompanionMaterialContextSlice({
    selection: maliciousChatSelection,
    projection: projectionFor(maliciousChatSelection),
  }),
  /normal Chat selection contains situational material: motive-a:motive_candidates/,
);

const frozenSelection = Object.freeze({
  ...storySelection,
  scope: Object.freeze({ ...storySelection.scope }),
  items: Object.freeze([...storySelection.items]),
  selectedMaterialIds: Object.freeze([...storySelection.selectedMaterialIds]),
});
const frozenProjection = Object.freeze({
  ...projectionFor(storySelection),
  fragments: Object.freeze([...projectionFor(storySelection).fragments]),
  dropped: Object.freeze([...projectionFor(storySelection).dropped]),
});
const frozenBefore = JSON.stringify({ frozenSelection, frozenProjection });
compileCompanionMaterialContextSlice({
  selection: frozenSelection,
  projection: frozenProjection,
});
assert.equal(
  JSON.stringify({ frozenSelection, frozenProjection }),
  frozenBefore,
  'compile must not mutate selection or projection and cannot write a receipt',
);

console.log('companion material context slice: green');
