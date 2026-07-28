import assert from 'node:assert/strict';
import {
  REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION,
  assertReviewedPackReviewRequest,
  createReviewedPackTerminalReceipt,
  summarizeReviewedPackEvidence,
  validateReviewedPackConservation,
  validateReviewedPackReviewRequest,
  validateReviewedPackTerminalLedger,
  validateReviewedPackTerminalReceipt,
  type ReviewedPackEvidenceRecord,
  type ReviewedPackReviewRequest,
  type ReviewedPackTerminalReceipt,
} from '../domain/reviewedPackEvidence/index.ts';
import {
  BUILT_IN_RETAINED_EVIDENCE_EXPECTATION,
  BUILT_IN_RETAINED_REVIEWED_PACK_DIGEST,
  BUILT_IN_RETAINED_REVIEWED_PACK_ID,
  BUILT_IN_RETAINED_REVIEWED_PACK_REVISION,
  buildBuiltInRetainedReviewedPackEvidenceFixture,
  buildBuiltInRetainedReviewedPackTerminalFixture,
} from './fixtures/built-in-deepspace-retained-reviewed-pack-evidence.ts';
import {
  BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES,
} from '../domain/companionMaterial/builtInDeepspaceScopedCandidates.ts';

const T0 = Date.UTC(2026, 6, 29, 10, 0, 0);
const scope = {
  progressBundleId: 'bundle-reviewed-pack',
  personaMaskId: 'mask-reviewed-pack',
  charId: 'builtin-zayne',
};

const fixture = buildBuiltInRetainedReviewedPackEvidenceFixture();
assert.deepEqual(
  validateReviewedPackConservation(fixture, BUILT_IN_RETAINED_EVIDENCE_EXPECTATION),
  [],
);
assert.deepEqual(summarizeReviewedPackEvidence(fixture), {
  ...BUILT_IN_RETAINED_EVIDENCE_EXPECTATION,
  uniqueEvidenceIds: 493,
  uniqueSourceFingerprints: 493,
});
assert.equal(
  fixture.every(record => record.sourceRef.sourceFingerprint.startsWith('lysk-src-')),
  true,
  'the terminal fixture must expand the real opaque retained-source manifest',
);
assert.equal(
  fixture.some(record => record.sourceRef.sourceFingerprint.startsWith('opaque-fixture:')),
  false,
  'synthetic count-only fingerprints cannot prove real retained-source terminal coverage',
);

const reviewInputs = fixture.filter(record => (
  record.evaluationRole === 'review_input'
  && record.evidenceClass !== 'withheld_reinforcement'
));
const holdouts = fixture.filter(record => record.evaluationRole === 'blind_holdout');
const withheld = fixture.filter(record => record.evidenceClass === 'withheld_reinforcement');
assert.equal(reviewInputs.length, 388);
assert.equal(holdouts.length, 98);
assert.equal(withheld.length, 7);
assert.equal(reviewInputs.length + holdouts.length + withheld.length, 493);
assert.equal(
  fixture.some(record => 'guidance' in record || 'renderPolicy' in record || 'promptSlot' in record),
  false,
  'reviewed pack evidence must not have a directly deliverable prompt shape',
);

const terminal = buildBuiltInRetainedReviewedPackTerminalFixture(fixture, T0);
assert.equal(terminal.length, 493);
assert.deepEqual(validateReviewedPackTerminalLedger(fixture, terminal), []);
assert.equal(terminal.every(receipt => receipt.truthEffect === 'none'), true);
assert.equal(terminal.every(receipt => receipt.relationshipMemoryEffect === 'none'), true);
assert.equal(terminal.every(receipt => receipt.runtimeDelivery === 'forbidden'), true);
assert.equal(
  terminal.filter(receipt => receipt.disposition === 'holdout_evaluated').length,
  98,
);
assert.equal(
  terminal.filter(receipt => (
    receipt.disposition === 'adjudicated_nonruntime_material_candidate'
  )).length,
  66,
);
const allCandidateSourceFingerprints = new Set(
  BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES.flatMap(candidate => (
    candidate.sourceRefs.map(ref => ref.sourceFingerprint)
  )),
);
const retainedCandidateSourceFingerprints = new Set(
  fixture
    .filter(record => record.reviewedCandidateIds?.length)
    .map(record => record.sourceRef.sourceFingerprint),
);
assert.equal(allCandidateSourceFingerprints.size, 66);
assert.equal(retainedCandidateSourceFingerprints.size, 66);
assert.equal(
  [...retainedCandidateSourceFingerprints]
    .every(fingerprint => allCandidateSourceFingerprints.has(fingerprint)),
  true,
);
assert.equal(allCandidateSourceFingerprints.size - retainedCandidateSourceFingerprints.size, 0);
const expectedCandidateIdsByFingerprint = new Map<string, string[]>();
BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES.forEach(candidate => {
  candidate.sourceRefs.forEach(ref => {
    const ids = expectedCandidateIdsByFingerprint.get(ref.sourceFingerprint) || [];
    ids.push(candidate.id);
    expectedCandidateIdsByFingerprint.set(ref.sourceFingerprint, ids);
  });
});
fixture
  .filter(record => record.reviewedCandidateIds?.length)
  .forEach(record => {
    assert.deepEqual(
      [...(record.reviewedCandidateIds || [])].sort(),
      [...(expectedCandidateIdsByFingerprint.get(record.sourceRef.sourceFingerprint) || [])].sort(),
      `source ${record.sourceRef.sourceFingerprint} must map to its exact reviewed candidate ids`,
    );
  });
for (const [fingerprint, candidateIds] of expectedCandidateIdsByFingerprint.entries()) {
  const evidence = fixture.find(record => record.sourceRef.sourceFingerprint === fingerprint);
  assert.ok(evidence, `candidate source ${fingerprint} must exist in retained evidence`);
  assert.deepEqual(
    [...(evidence.reviewedCandidateIds || [])].sort(),
    [...candidateIds].sort(),
    `candidate ${candidateIds.join(',')} must crosswalk to the correct retained source`,
  );
}
assert.equal(
  fixture
    .filter(record => record.reviewedCandidateIds?.length)
    .every(record => (
      record.residualDisposition === 'exact_scope_evidence'
      && record.residualReviewedAssetIds.length > 0
    )),
  true,
  'candidate promotion must not consume the source residual exact-scope evidence',
);
assert.equal(
  terminal
    .filter(receipt => receipt.disposition === 'adjudicated_nonruntime_material_candidate')
    .every(receipt => (
      receipt.residualDisposition === 'exact_scope_evidence'
      && receipt.residualReviewedAssetIds.length > 0
    )),
  true,
  'terminal candidate receipts must preserve the residual evidence destination',
);
assert.equal(
  terminal.filter(receipt => receipt.disposition === 'retained_pending_scope').length
  + terminal.filter(receipt => (
    receipt.disposition === 'adjudicated_nonruntime_material_candidate'
    && fixture.find(record => record.id === receipt.evidenceId)
      ?.evidenceClass === 'relationship_plot_candidate'
  )).length,
  190,
);
assert.equal(
  terminal.filter(receipt => receipt.disposition === 'retained_pending_review').length
  + terminal.filter(receipt => (
    receipt.disposition === 'adjudicated_nonruntime_material_candidate'
    && fixture.find(record => record.id === receipt.evidenceId)
      ?.evidenceClass === 'character_canon_candidate'
  )).length,
  198,
);
assert.equal(
  terminal.filter(receipt => receipt.disposition === 'retained_insufficient_evidence').length
  + terminal.filter(receipt => (
    receipt.disposition === 'adjudicated_nonruntime_material_candidate'
    && fixture.find(record => record.id === receipt.evidenceId)
      ?.evidenceClass === 'withheld_reinforcement'
  )).length,
  7,
);

const requestFor = (
  evidenceIds: readonly string[],
  target: ReviewedPackReviewRequest['target'],
): ReviewedPackReviewRequest => ({
  schemaVersion: REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION,
  id: `review-request:${target.kind}`,
  packId: BUILT_IN_RETAINED_REVIEWED_PACK_ID,
  packRevision: BUILT_IN_RETAINED_REVIEWED_PACK_REVISION,
  packDigest: BUILT_IN_RETAINED_REVIEWED_PACK_DIGEST,
  evidenceIds,
  target,
  reviewerVersion: 'reviewed-pack-verifier-v1',
});

const zayneCanon = fixture.find(record => (
  record.charId === scope.charId
  && record.evidenceClass === 'character_canon_candidate'
  && record.evaluationRole === 'review_input'
))!;
assertReviewedPackReviewRequest(
  requestFor([zayneCanon.id], {
    kind: 'character_canon_evidence',
    charId: scope.charId,
  }),
  fixture,
);
const canonReceipt = createReviewedPackTerminalReceipt(zayneCanon, {
  id: 'terminal:canon-positive',
  disposition: 'adjudicated_character_canon_evidence',
  derivedRecordIds: ['character-canon-evidence:reviewed-zayne-1'],
  reviewerVersion: 'reviewed-pack-verifier-v1',
  createdAt: T0,
});
assert.equal(canonReceipt.sink, 'character_canon_evidence');
assert.equal(canonReceipt.relationshipMemoryEffect, 'none');
assert.equal(canonReceipt.runtimeDelivery, 'forbidden');

const zayneCandidate = fixture.find(record => (
  record.charId === scope.charId
  && record.reviewedCandidateIds?.length
))!;
const candidateReceipt = createReviewedPackTerminalReceipt(zayneCandidate, {
  id: 'terminal:reviewed-nonruntime-candidate',
  disposition: 'adjudicated_nonruntime_material_candidate',
  derivedRecordIds: zayneCandidate.reviewedCandidateIds!,
  reviewerVersion: 'reviewed-pack-verifier-v2',
  createdAt: T0,
});
assert.equal(candidateReceipt.sink, 'companion_material_candidate_registry');
assert.equal(candidateReceipt.truthEffect, 'none');
assert.equal(candidateReceipt.relationshipMemoryEffect, 'none');
assert.equal(candidateReceipt.runtimeDelivery, 'forbidden');
assert.throws(
  () => createReviewedPackTerminalReceipt(zayneCandidate, {
    id: 'terminal:reviewed-nonruntime-candidate-tampered',
    disposition: 'adjudicated_nonruntime_material_candidate',
    derivedRecordIds: ['wrong-candidate-id'],
    reviewerVersion: 'reviewed-pack-verifier-v2',
    createdAt: T0,
  }),
  /exact reviewedCandidateIds/u,
);

const zayneHoldout = holdouts.find(record => record.charId === scope.charId)!;
const holdoutRequestErrors = validateReviewedPackReviewRequest(
  requestFor([zayneHoldout.id], {
    kind: 'character_canon_evidence',
    charId: scope.charId,
  }),
  fixture,
);
assert.equal(
  holdoutRequestErrors.some(error => error.includes('blind holdout')),
  true,
  'blind holdout must never become review input',
);
assert.throws(
  () => createReviewedPackTerminalReceipt(zayneHoldout, {
    id: 'terminal:holdout-runtime-attempt',
    disposition: 'adjudicated_character_canon_evidence',
    derivedRecordIds: ['should-not-exist'],
    reviewerVersion: 'reviewed-pack-verifier-v1',
    createdAt: T0,
  }),
  /blind holdout may only receive a holdout_evaluated receipt/u,
);

const zayneRelationshipPending = fixture.find(record => (
  record.charId === scope.charId
  && record.evidenceClass === 'relationship_plot_candidate'
  && record.evaluationRole === 'review_input'
))!;
const missingScopeErrors = validateReviewedPackReviewRequest(
  requestFor([zayneRelationshipPending.id], {
    kind: 'relationship_evidence',
    scope,
  }),
  fixture,
);
assert.equal(
  missingScopeErrors.some(error => error.includes('lacks exact relationship scope')),
  true,
  'relationship evidence without the complete mask/bundle/character scope must fail closed',
);
assert.throws(
  () => createReviewedPackTerminalReceipt(zayneRelationshipPending, {
    id: 'terminal:relationship-missing-scope',
    disposition: 'adjudicated_relationship_evidence',
    derivedRecordIds: ['should-not-exist'],
    reviewerVersion: 'reviewed-pack-verifier-v1',
    createdAt: T0,
  }),
  /relationship evidence requires exact HistoryScope/u,
);

const scopedRelationship: ReviewedPackEvidenceRecord = {
  ...zayneRelationshipPending,
  id: `${zayneRelationshipPending.id}:scoped`,
  sourceRef: {
    ...zayneRelationshipPending.sourceRef,
    sourceFingerprint: `${zayneRelationshipPending.sourceRef.sourceFingerprint}:scoped`,
  },
  targetScope: { ...scope },
  revision: 2,
};
assertReviewedPackReviewRequest(
  requestFor([scopedRelationship.id], {
    kind: 'relationship_evidence',
    scope,
  }),
  [...fixture, scopedRelationship],
);
const relationshipReceipt = createReviewedPackTerminalReceipt(scopedRelationship, {
  id: 'terminal:relationship-positive',
  disposition: 'adjudicated_relationship_evidence',
  derivedRecordIds: ['relationship-evidence:reviewed-zayne-1'],
  reviewerVersion: 'reviewed-pack-verifier-v1',
  createdAt: T0,
});
assert.equal(relationshipReceipt.sink, 'relationship_evidence');
assert.equal(relationshipReceipt.relationshipMemoryEffect, 'none');

const canonToRelationshipErrors = validateReviewedPackReviewRequest(
  requestFor([zayneCanon.id], {
    kind: 'relationship_evidence',
    scope,
  }),
  fixture,
);
assert.equal(
  canonToRelationshipErrors.some(error => error.includes('cannot become relationship evidence')),
  true,
  'character canon candidate must never be written as relationship memory/evidence',
);
assert.throws(
  () => createReviewedPackTerminalReceipt(zayneCanon, {
    id: 'terminal:canon-to-relationship-attempt',
    disposition: 'adjudicated_relationship_evidence',
    derivedRecordIds: ['should-not-exist'],
    reviewerVersion: 'reviewed-pack-verifier-v1',
    createdAt: T0,
  }),
  /only relationship plot candidate can reach relationship evidence/u,
);

const incompleteScene: ReviewedPackEvidenceRecord = {
  ...scopedRelationship,
  id: `${scopedRelationship.id}:incomplete-scene`,
  sourceRef: {
    ...scopedRelationship.sourceRef,
    sourceFingerprint: `${scopedRelationship.sourceRef.sourceFingerprint}:incomplete-scene`,
  },
  routeRef: {
    routeId: 'route-main',
    branchId: 'branch-main',
  },
  revision: 3,
};
const incompleteSceneErrors = validateReviewedPackReviewRequest(
  requestFor([incompleteScene.id], {
    kind: 'scene_plan_candidate_evidence',
    scope,
    routeId: 'route-main',
    branchId: 'branch-main',
    sceneId: 'scene-rain',
  }),
  [...fixture, incompleteScene],
);
assert.equal(
  incompleteSceneErrors.some(error => error.includes('lacks complete route, branch, and scene refs')),
  true,
  'scene evidence without route/branch/scene must not project toward ScenePlan',
);
assert.throws(
  () => createReviewedPackTerminalReceipt(incompleteScene, {
    id: 'terminal:scene-incomplete-attempt',
    disposition: 'adjudicated_scene_candidate_evidence',
    derivedRecordIds: ['should-not-exist'],
    reviewerVersion: 'reviewed-pack-verifier-v1',
    createdAt: T0,
  }),
  /scene candidate evidence requires routeId, branchId, and sceneId/u,
);

const completeScene: ReviewedPackEvidenceRecord = {
  ...incompleteScene,
  id: `${scopedRelationship.id}:complete-scene`,
  sourceRef: {
    ...incompleteScene.sourceRef,
    sourceFingerprint: `${scopedRelationship.sourceRef.sourceFingerprint}:complete-scene`,
  },
  routeRef: {
    routeId: 'route-main',
    branchId: 'branch-main',
    sceneId: 'scene-rain',
  },
  revision: 4,
};
assertReviewedPackReviewRequest(
  requestFor([completeScene.id], {
    kind: 'scene_plan_candidate_evidence',
    scope,
    routeId: 'route-main',
    branchId: 'branch-main',
    sceneId: 'scene-rain',
  }),
  [...fixture, completeScene],
);
const sceneReceipt = createReviewedPackTerminalReceipt(completeScene, {
  id: 'terminal:scene-positive',
  disposition: 'adjudicated_scene_candidate_evidence',
  derivedRecordIds: ['scene-candidate-evidence:reviewed-zayne-1'],
  reviewerVersion: 'reviewed-pack-verifier-v1',
  createdAt: T0,
});
assert.equal(sceneReceipt.sink, 'scene_plan_candidate_evidence');
assert.equal(sceneReceipt.truthEffect, 'none');
assert.equal(sceneReceipt.runtimeDelivery, 'forbidden');

const tamperedRuntimeReceipt: ReviewedPackTerminalReceipt = {
  ...canonReceipt,
  runtimeDelivery: 'allowed' as never,
};
assert.equal(
  validateReviewedPackTerminalReceipt(tamperedRuntimeReceipt, zayneCanon)
    .some(error => error.includes('cannot authorize runtime delivery')),
  true,
);

const tamperedMemoryReceipt: ReviewedPackTerminalReceipt = {
  ...canonReceipt,
  relationshipMemoryEffect: 'relationship_memory' as never,
};
assert.equal(
  validateReviewedPackTerminalReceipt(tamperedMemoryReceipt, zayneCanon)
    .some(error => error.includes('cannot write relationship memory')),
  true,
);

console.log(
  'reviewed pack evidence: green '
  + 'total=493 review=388 holdout=98 withheld=7 reviewedCandidates=66 '
  + 'runtime=forbidden truth=none',
);
