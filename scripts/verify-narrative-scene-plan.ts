import assert from 'node:assert/strict';
import {
  projectCompanionMaterialPrompt,
  type CompanionMaterialPromptProjection,
} from '../domain/companionMaterial/promptProjection.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryItem,
  type CompanionMaterialSelection,
} from '../domain/companionMaterial/types.ts';
import {
  createNarrativeDirectorContext,
  type NarrativeDirectorContext,
} from '../domain/narrative/directorContext.ts';
import {
  acceptScenePlan,
  createAcceptedScenePlanCompanionMaterialReceipt,
  createScenePlan,
  type ScenePlanCanonicalEvidenceRef,
  type ScenePlanCanonicalEvidenceVerifier,
  type ScenePlanCompanionMaterialInput,
} from '../domain/narrative/scenePlan.ts';
import type {
  NarrativeRun,
  NarrativeScene,
} from '../domain/narrative/types.ts';

const T0 = 1_700_000_000_000;
const scope = {
  progressBundleId: 'scene-plan-bundle',
  personaMaskId: 'scene-plan-mask',
  charId: 'scene-plan-char',
};
const routeRef = {
  routeId: 'route-main',
  branchId: 'branch-main',
  sceneId: 'scene-live',
  lane: 'mainline' as const,
};

const item = (
  overrides: Partial<CompanionMaterialDeliveryItem>,
): CompanionMaterialDeliveryItem => {
  const guidance = overrides.guidance || '只作为场景判断候选，不把可能性写成已经发生。';
  return {
    materialId: 'material-fixture',
    materialRevision: 1,
    slot: 'scene_affordances',
    kind: 'scene_affordance',
    guidance,
    renderPolicy: 'decision_context',
    knowledge: 'relationship_private',
    continuity: 'scene_only',
    routeId: routeRef.routeId,
    branchId: routeRef.branchId,
    sceneId: routeRef.sceneId,
    sourceRefs: [{
      storeFamily: 'private_companion_material',
      recordId: 'private-record-must-not-leak',
      revision: 7,
      sourceFingerprint: 'private-fingerprint-must-not-leak',
      sourceLocator: 'private-source-locator-must-not-leak',
    }],
    selectionReasons: ['fixture'],
    estimatedChars: guidance.length,
    ...overrides,
  };
};

const motive = item({
  materialId: 'material-motive',
  materialRevision: 3,
  slot: 'motive_candidates',
  kind: 'initiative_motive',
  guidance: '可以考虑先确认现场是否安全，但不能仅凭这条素材声称角色此刻就有该动机。',
});
const affordance = item({
  materialId: 'material-affordance',
  materialRevision: 2,
  slot: 'scene_affordances',
  kind: 'scene_affordance',
  guidance: '门廊的新痕迹让“先观察再靠近”成为可展开的场景可能性。',
});

const selection = (
  overrides: Partial<CompanionMaterialSelection> = {},
): CompanionMaterialSelection => {
  const items = overrides.items ?? [motive, affordance];
  return {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    selectionId: 'scene-plan-selection',
    requestId: 'scene-plan-request',
    scope,
    surface: 'storydesk',
    mode: 'story_planning',
    purpose: 'scene_planning',
    routeRef,
    sourceRevisionFingerprint: 'scene-plan-material-set-r7',
    budgetChars: 2_000,
    items,
    selectedMaterialIds: items.map(entry => entry.materialId),
    warnings: [],
    selectedAt: T0,
    ...overrides,
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

const activeRun: NarrativeRun = {
  id: 'run-live',
  progressBundleId: scope.progressBundleId,
  routeId: routeRef.routeId,
  branchId: routeRef.branchId,
  lane: routeRef.lane,
  status: 'active',
  participantCharIds: [scope.charId],
  activeSceneId: routeRef.sceneId,
  directiveIds: [],
  routeState: {},
  npcStates: [],
  openThreads: [],
  startedAt: T0 - 10_000,
  updatedAt: T0 - 1_000,
};
const activeScene: NarrativeScene = {
  id: routeRef.sceneId,
  runId: activeRun.id,
  status: 'active',
  title: '门廊前',
  participantIds: [scope.charId],
  constraints: [],
  beats: [],
  openedAt: T0 - 5_000,
};

const directorContext = (withActiveRun: boolean): NarrativeDirectorContext => (
  createNarrativeDirectorContext({
    scope,
    currentTruth: {
      scope,
      activeRun: withActiveRun ? activeRun : null,
      activeScene: withActiveRun ? activeScene : null,
      confirmedExperiences: [],
    },
  })
);

const liveEvidence: ScenePlanCanonicalEvidenceRef = {
  id: 'evidence-live-user-turn',
  scope,
  kind: 'live_interaction_fact',
  canonicalFactRef: 'interaction-evidence:turn-42',
  revision: 4,
  observedAt: T0 - 200,
};
const lifeEvidence: ScenePlanCanonicalEvidenceRef = {
  id: 'evidence-life-snapshot',
  scope,
  kind: 'character_life_fact',
  canonicalFactRef: 'life-snapshot-9',
  revision: 9,
  observedAt: T0 - 300,
};
const verifiedEvidence = new Map([
  [liveEvidence.id, liveEvidence],
  [lifeEvidence.id, lifeEvidence],
]);
const evidenceVerifier: ScenePlanCanonicalEvidenceVerifier = {
  verify({ ref, scope: expectedScope }) {
    const canonical = verifiedEvidence.get(ref.id);
    return Boolean(
      canonical
      && canonical.revision === ref.revision
      && canonical.canonicalFactRef === ref.canonicalFactRef
      && canonical.scope.progressBundleId === expectedScope.progressBundleId
      && canonical.scope.personaMaskId === expectedScope.personaMaskId
      && canonical.scope.charId === expectedScope.charId,
    );
  },
};

const selected = selection();
const projection = projectionFor(selected);
const materialInput: ScenePlanCompanionMaterialInput = {
  selection: selected,
  projection,
  deliveredMaterialIds: ['material-motive', 'material-affordance'],
  rationaleMaterialIds: ['material-affordance'],
};

// A scene affordance can support a future proposal without becoming a current
// motive, played scene, or world-state fact.
const futureProposal = createScenePlan({
  id: 'scene-plan-future-date',
  scope,
  targetSurface: 'date',
  temporalClaim: 'proposed_future',
  summary: '如果双方愿意，下一次见面可以从门廊的新痕迹展开。',
  routeRef,
  currentMotives: [],
  companionMaterial: materialInput,
  directorContext: directorContext(false),
}, T0);

assert.equal(futureProposal.status, 'proposed');
assert.equal(futureProposal.truthEffect, 'none');
assert.deepEqual(futureProposal.routeRef, routeRef);
assert.deepEqual(
  futureProposal.deliveredMaterialRefs.map(ref => [ref.materialId, ref.materialRevision]),
  [
    ['material-motive', 3],
    ['material-affordance', 2],
  ],
);
assert.deepEqual(
  futureProposal.rationaleMaterialRefs.map(ref => ref.materialId),
  ['material-affordance'],
);
assert.deepEqual(futureProposal.currentMotives, []);
assert.equal(Object.isFrozen(futureProposal), true);

assert.throws(
  () => createAcceptedScenePlanCompanionMaterialReceipt({
    plan: futureProposal,
    selection: selected,
    projection,
    occurredAt: T0 + 1,
  }),
  /requires an accepted ScenePlan/,
  'material receipt cannot precede acceptance',
);
assert.throws(
  () => acceptScenePlan({
    plan: futureProposal,
    expectedRevision: 1,
    directorContext: directorContext(false),
  }, T0 + 999),
  /requires the original selection and projection/,
  'acceptance rechecks the material revision instead of trusting saved ids',
);

const acceptedFuture = acceptScenePlan({
  plan: futureProposal,
  expectedRevision: 1,
  directorContext: directorContext(false),
  companionMaterial: { selection: selected, projection },
}, T0 + 1_000);

assert.equal(acceptedFuture.status, 'accepted');
assert.equal(acceptedFuture.revision, 2);
assert.equal(acceptedFuture.truthEffect, 'none');
assert.equal('narrativeScene' in acceptedFuture, false);
assert.equal('experienceReceipt' in acceptedFuture, false);

const deliveryReceipt = createAcceptedScenePlanCompanionMaterialReceipt({
  plan: acceptedFuture,
  selection: selected,
  projection,
  occurredAt: T0 + 1_001,
});
assert.deepEqual(deliveryReceipt.scope, scope);
assert.deepEqual(deliveryReceipt.routeRef, routeRef);
assert.deepEqual(deliveryReceipt.consumerRef, {
  kind: 'scene_plan',
  id: acceptedFuture.id,
  revision: '2',
});
assert.deepEqual(
  deliveryReceipt.delivered.map(ref => [ref.materialId, ref.materialRevision, ref.renderedHash]),
  acceptedFuture.deliveredMaterialRefs.map(ref => [
    ref.materialId,
    ref.materialRevision,
    ref.renderedHash,
  ]),
);
assert.equal(deliveryReceipt.truthEffect, 'none');
assert.equal(deliveryReceipt.occurredAt! >= acceptedFuture.acceptedAt!, true);

// A current motive is legal only when a code-owned evidence provider verifies
// the exact scope and active revision. Material remains rationale, not proof.
const groundedProposal = createScenePlan({
  id: 'scene-plan-grounded',
  scope,
  targetSurface: 'storydesk',
  temporalClaim: 'grounded_current',
  summary: '依据用户刚确认的现场信息，角色当前先检查安全边界。',
  routeRef,
  evidenceRefs: [liveEvidence, lifeEvidence],
  lifeSnapshotRef: {
    evidenceRefId: lifeEvidence.id,
    snapshotId: lifeEvidence.canonicalFactRef,
    revision: lifeEvidence.revision,
    asOf: lifeEvidence.observedAt,
  },
  currentMotives: [{
    id: 'motive-check-safety',
    summary: '先确认现场是否安全。',
    evidenceRefIds: [liveEvidence.id],
    rationaleMaterialIds: ['material-motive'],
  }],
  companionMaterial: {
    ...materialInput,
    rationaleMaterialIds: ['material-motive'],
  },
  directorContext: directorContext(true),
  evidenceVerifier,
}, T0);

const acceptedGrounded = acceptScenePlan({
  plan: groundedProposal,
  expectedRevision: 1,
  directorContext: directorContext(true),
  evidenceVerifier,
  companionMaterial: { selection: selected, projection },
}, T0 + 2_000);
assert.equal(acceptedGrounded.currentMotives.length, 1);
assert.deepEqual(
  acceptedGrounded.currentMotives[0].evidenceRefIds,
  [liveEvidence.id],
);
assert.equal(acceptedGrounded.truthEffect, 'none');

// Material NONE is a valid plan outcome. Because no material was delivered,
// there is deliberately no material receipt to construct or persist.
const noneProposal = createScenePlan({
  id: 'scene-plan-material-none',
  scope,
  targetSurface: 'meet',
  temporalClaim: 'non_event',
  summary: '本轮没有足够相关素材，保留为空的非事件计划。',
  directorContext: directorContext(false),
}, T0);
const acceptedNone = acceptScenePlan({
  plan: noneProposal,
  expectedRevision: 1,
  directorContext: directorContext(false),
}, T0 + 3_000);
assert.equal(acceptedNone.status, 'accepted');
assert.deepEqual(acceptedNone.deliveredMaterialRefs, []);
assert.throws(
  () => createAcceptedScenePlanCompanionMaterialReceipt({
    plan: acceptedNone,
    selection: selected,
    projection,
  }),
  /material-NONE ScenePlan has no companion material delivery/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-cross-scope',
    scope: { ...scope, personaMaskId: 'other-mask' },
    targetSurface: 'storydesk',
    temporalClaim: 'non_event',
    summary: '不应跨面具。',
    directorContext: directorContext(false),
  }, T0),
  /crosses exact HistoryScope/,
);

const otherScopeSelection = selection({
  selectionId: 'selection-other-scope',
  requestId: 'request-other-scope',
  scope: { ...scope, personaMaskId: 'other-mask' },
});
assert.throws(
  () => createScenePlan({
    id: 'bad-material-scope',
    scope,
    targetSurface: 'storydesk',
    temporalClaim: 'proposed_future',
    summary: '不应消费另一面具的素材。',
    routeRef,
    companionMaterial: {
      selection: otherScopeSelection,
      projection: projectionFor(otherScopeSelection),
      deliveredMaterialIds: ['material-affordance'],
      rationaleMaterialIds: ['material-affordance'],
    },
    directorContext: directorContext(false),
  }, T0),
  /selection.scope crosses exact HistoryScope/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-material-route',
    scope,
    targetSurface: 'date',
    temporalClaim: 'proposed_future',
    summary: '不应把另一剧情线素材搬进来。',
    routeRef: { ...routeRef, branchId: 'branch-other' },
    companionMaterial: materialInput,
    directorContext: directorContext(false),
  }, T0),
  /material routeRef does not match ScenePlan routeRef/,
);

const crossRouteItemSelection = selection({
  selectionId: 'selection-cross-route-item',
  requestId: 'request-cross-route-item',
  items: [
    { ...affordance, branchId: 'branch-other' },
  ],
});
assert.throws(
  () => createScenePlan({
    id: 'bad-material-item-route',
    scope,
    targetSurface: 'date',
    temporalClaim: 'proposed_future',
    summary: 'Selection 外壳一致也不能夹带另一分支的素材项。',
    routeRef,
    companionMaterial: {
      selection: crossRouteItemSelection,
      projection: projectionFor(crossRouteItemSelection),
      deliveredMaterialIds: ['material-affordance'],
      rationaleMaterialIds: ['material-affordance'],
    },
    directorContext: directorContext(false),
  }, T0),
  /crosses the ScenePlan routeRef/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-grounded-route',
    scope,
    targetSurface: 'storydesk',
    temporalClaim: 'grounded_current',
    summary: '不能把非 active 分支说成当下。',
    routeRef: { ...routeRef, branchId: 'branch-other' },
    evidenceRefs: [liveEvidence],
    directorContext: directorContext(true),
    evidenceVerifier,
  }, T0),
  /does not match the active NarrativeRun/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-rationale-not-delivered',
    scope,
    targetSurface: 'date',
    temporalClaim: 'proposed_future',
    summary: '未递送的素材不能成为理由。',
    routeRef,
    companionMaterial: {
      selection: selected,
      projection,
      deliveredMaterialIds: ['material-affordance'],
      rationaleMaterialIds: ['material-motive'],
    },
    directorContext: directorContext(false),
  }, T0),
  /was not delivered/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-current-without-evidence',
    scope,
    targetSurface: 'storydesk',
    temporalClaim: 'grounded_current',
    summary: '素材不能自证当下动机。',
    routeRef,
    currentMotives: [{
      id: 'self-authorized-motive',
      summary: '未经证实的当前动机。',
      evidenceRefIds: [],
      rationaleMaterialIds: ['material-motive'],
    }],
    companionMaterial: {
      ...materialInput,
      rationaleMaterialIds: ['material-motive'],
    },
    directorContext: directorContext(true),
  }, T0),
  /grounded_current requires canonical evidence|requires unique canonical evidenceRefIds/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-unverified-evidence',
    scope,
    targetSurface: 'storydesk',
    temporalClaim: 'grounded_current',
    summary: '模型写出的 evidence id 不能自授权。',
    routeRef,
    evidenceRefs: [liveEvidence],
    currentMotives: [{
      id: 'unverified-motive',
      summary: '未经提供者校验的当前动机。',
      evidenceRefIds: [liveEvidence.id],
      rationaleMaterialIds: [],
    }],
    directorContext: directorContext(true),
    evidenceVerifier: { verify: () => false },
  }, T0),
  /not an active canonical revision/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-noncanonical-kind',
    scope,
    targetSurface: 'storydesk',
    temporalClaim: 'grounded_current',
    summary: '稳定身份与素材不能伪装成 canonical current evidence。',
    evidenceRefs: [{
      ...liveEvidence,
      kind: 'stable_identity',
    } as unknown as ScenePlanCanonicalEvidenceRef],
    directorContext: directorContext(true),
    evidenceVerifier: { verify: () => true },
  }, T0),
  /not a canonical ScenePlan evidence kind/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-future-current-motive',
    scope,
    targetSurface: 'date',
    temporalClaim: 'proposed_future',
    summary: '未来提案不能偷渡 currentMotives。',
    evidenceRefs: [liveEvidence],
    currentMotives: [{
      id: 'future-as-current',
      summary: '不应成立。',
      evidenceRefIds: [liveEvidence.id],
      rationaleMaterialIds: [],
    }],
    directorContext: directorContext(false),
    evidenceVerifier,
  }, T0),
  /currentMotives are allowed only for grounded_current/,
);

assert.throws(
  () => createScenePlan({
    id: 'bad-affordance-as-motive',
    scope,
    targetSurface: 'storydesk',
    temporalClaim: 'grounded_current',
    summary: '场景纹理不能伪装成动机候选。',
    routeRef,
    evidenceRefs: [liveEvidence],
    currentMotives: [{
      id: 'affordance-as-motive',
      summary: '不应成立。',
      evidenceRefIds: [liveEvidence.id],
      rationaleMaterialIds: ['material-affordance'],
    }],
    companionMaterial: materialInput,
    directorContext: directorContext(true),
    evidenceVerifier,
  }, T0),
  /must be an adopted motive_candidate/,
);

const revisedSelection = selection({
  items: [
    { ...motive, materialRevision: motive.materialRevision + 1 },
    affordance,
  ],
});
assert.throws(
  () => acceptScenePlan({
    plan: futureProposal,
    expectedRevision: 1,
    directorContext: directorContext(false),
    companionMaterial: {
      selection: revisedSelection,
      projection: projectionFor(revisedSelection),
    },
  }, T0 + 4_000),
  /material revisions or rendered hashes changed/,
);

const tamperedProjection: CompanionMaterialPromptProjection = {
  ...projection,
  fragments: projection.fragments.map((fragment, index) => (
    index === 0 ? { ...fragment, renderedHash: 'tampered-rendered-hash' } : fragment
  )),
};
assert.throws(
  () => createAcceptedScenePlanCompanionMaterialReceipt({
    plan: acceptedFuture,
    selection: selected,
    projection: tamperedProjection,
    occurredAt: T0 + 5_000,
  }),
  /renderedHash does not match selected material/,
);

const serializedPlan = JSON.stringify(acceptedGrounded);
[
  'sourceRefs',
  'rawText',
  'private-record-must-not-leak',
  'private-fingerprint-must-not-leak',
  'private-source-locator-must-not-leak',
  'narrativeRun',
  'narrativeScene',
  'experienceReceipt',
  'characterLifeState',
  'deliveryReceipt',
  'toolAllowlist',
].forEach(forbidden => {
  assert.equal(
    serializedPlan.includes(forbidden),
    false,
    `ScenePlan must not expose or create ${forbidden}`,
  );
});

console.log('Narrative ScenePlan contract verification passed.');
