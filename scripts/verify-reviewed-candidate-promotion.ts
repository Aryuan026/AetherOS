import assert from 'node:assert/strict';
import {
  BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES,
} from '../domain/companionMaterial/builtInDeepspaceScopedCandidates.ts';
import {
  REVIEWED_CANDIDATE_PROMOTION_SCHEMA_VERSION,
  prepareReviewedCompanionMaterialPromotionDraft,
  type ReviewedCandidateAuthorityResolver,
  type ReviewedCandidateCanonicalAuthorityReceipt,
  type ReviewedCandidatePromotionAuthority,
  type ReviewedCandidatePromotionRequest,
} from '../domain/companionMaterial/candidatePromotion.ts';
import {
  selectCompanionMaterialFromRecords,
} from '../domain/companionMaterial/selection.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialGroundingRef,
  type CompanionMaterialRouteRef,
} from '../domain/companionMaterial/types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';

const T0 = Date.UTC(2026, 6, 29, 12, 0, 0);
const DIGEST = 'a'.repeat(64);
const scopeFor = (charId: string): HistoryScope => ({
  progressBundleId: `promotion-bundle:${charId}`,
  personaMaskId: `promotion-mask:${charId}`,
  charId,
});
const routeRef: CompanionMaterialRouteRef = {
  routeId: 'promotion-route',
  branchId: 'promotion-branch',
  sceneId: 'promotion-scene',
  lane: 'mainline',
};

type Candidate = (typeof BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES)[number];

const canonicalReceiptFor = (
  candidate: Candidate,
): ReviewedCandidateCanonicalAuthorityReceipt => {
  const scope = scopeFor(candidate.charId);
  const common = {
    schemaVersion: 1 as const,
    id: `canonical-authority:${candidate.id}`,
    revision: 3,
    digest: DIGEST,
    issuerId: 'aetheros-canonical-authority-registry',
    authorityKind: candidate.activationAuthority,
    claimKey: `candidate_${candidate.materialLane}`,
    charId: candidate.charId,
    scope,
    status: 'canonical' as const,
    occurredAt: T0 - 1_000,
    validUntil: T0 + 60_000,
  };
  if (candidate.activationAuthority === 'character_canon_review') {
    return {
      ...common,
      groundingKind: 'character_canon_evidence',
    };
  }
  if (candidate.activationAuthority === 'canonical_thread_or_artifact') {
    return {
      ...common,
      groundingKind: 'external_artifact_receipt',
    };
  }
  return {
    ...common,
    groundingKind: 'scene_plan',
    routeRef,
  };
};

const receipts = new Map(
  BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES.map(candidate => {
    const receipt = canonicalReceiptFor(candidate);
    return [receipt.id, receipt] as const;
  }),
);
const resolver: ReviewedCandidateAuthorityResolver = {
  resolve(ref) {
    const receipt = receipts.get(ref.id);
    if (
      !receipt
      || receipt.revision !== ref.revision
      || receipt.digest !== ref.digest
    ) return undefined;
    return receipt;
  },
};

const authorityFor = (
  candidate: Candidate,
): ReviewedCandidatePromotionAuthority => {
  const scope = scopeFor(candidate.charId);
  const receipt = canonicalReceiptFor(candidate);
  const authorityReceiptRef = {
    id: receipt.id,
    revision: receipt.revision,
    digest: receipt.digest,
  };
  if (candidate.activationAuthority === 'character_canon_review') {
    return {
      kind: 'character_canon_review',
      charId: candidate.charId,
      authorityReceiptRef,
      eligibleModes: ['meet_scene'],
    };
  }
  if (candidate.activationAuthority === 'canonical_thread_or_artifact') {
    return {
      kind: 'canonical_thread_or_artifact',
      scope,
      authorityReceiptRef,
      eligibleMode: 'call',
      eligibleSurface: 'call',
    };
  }
  return {
    kind: candidate.activationAuthority,
    scope,
    routeRef,
    authorityReceiptRef,
  };
};

const requestFor = (
  candidate: Candidate,
): ReviewedCandidatePromotionRequest => ({
  schemaVersion: REVIEWED_CANDIDATE_PROMOTION_SCHEMA_VERSION,
  id: `promotion:${candidate.id}`,
  recordId: `${candidate.id}:authorized`,
  candidateId: candidate.id,
  candidateRevision: candidate.revision,
  authority: authorityFor(candidate),
  positiveSignals: [`candidate_${candidate.materialLane}`, candidate.route],
  reviewerVersion: 'candidate-promotion-verifier-v2',
  approvedAt: T0,
});

const promoted = BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES.map(candidate => (
  prepareReviewedCompanionMaterialPromotionDraft(candidate, requestFor(candidate), resolver)
));
assert.equal(promoted.length, 21);
assert.equal(
  promoted.every(result => (
    result.recordDraft.status === 'disabled'
    && result.receipt.availabilityEffect === 'none'
    && result.receipt.publicationEffect === 'canonical_publisher_required'
  )),
  true,
  'caller-provided review lookup must never produce runtime availability',
);
assert.equal(
  promoted.every(result => (
    result.receipt.deliveryEffect === 'none'
    && result.receipt.truthEffect === 'none'
    && result.receipt.relationshipMemoryEffect === 'none'
    && result.receipt.currentMotiveEffect === 'none'
    && result.recordDraft.promotionAuthority?.receiptId === result.receipt.authorityRefId
    && result.recordDraft.promotionAuthority?.receiptRevision === result.receipt.authorityRevision
    && result.recordDraft.promotionAuthority?.receiptDigest === result.receipt.authorityDigest
  )),
  true,
);
assert.equal(
  promoted.every(result => {
    const requirement = result.recordDraft.groundingPolicy?.allOf?.[0];
    return (
      requirement?.refId === result.receipt.authorityRefId
      && requirement?.revision === result.receipt.authorityRevision
      && requirement?.issuerId === result.receipt.authorityIssuerId
      && requirement?.authorityDigest === result.receipt.authorityDigest
    );
  }),
  true,
  'every promoted record must bind the exact canonical receipt revision',
);

const first = BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES[0];
assert.throws(
  () => prepareReviewedCompanionMaterialPromotionDraft(first, {
    ...requestFor(first),
    candidateRevision: first.revision + 1,
  }, resolver),
  /stale/u,
);
assert.throws(
  () => prepareReviewedCompanionMaterialPromotionDraft(first, {
    ...requestFor(first),
    authority: {
      ...authorityFor(first),
      authorityReceiptRef: {
        ...authorityFor(first).authorityReceiptRef,
        id: 'caller-invented-authority',
      },
    },
  }, resolver),
  /not canonical/u,
);
assert.throws(
  () => prepareReviewedCompanionMaterialPromotionDraft(first, {
    ...requestFor(first),
    authority: {
      ...authorityFor(first),
      authorityReceiptRef: {
        ...authorityFor(first).authorityReceiptRef,
        digest: 'b'.repeat(64),
      },
    },
  }, resolver),
  /not canonical/u,
);

const directorCandidate = BUILT_IN_DEEPSPACE_SCOPED_REVIEWED_CANDIDATES.find(
  candidate => candidate.activationAuthority === 'director_scene_plan',
)!;
const directorDraft = promoted.find(
  result => result.receipt.candidateId === directorCandidate.id,
)!;
assert.equal(
  directorDraft.recordDraft.routeLane,
  routeRef.lane,
  'Director lane must survive draft compilation',
);
const directorAuthority = authorityFor(directorCandidate);
assert.equal(directorAuthority.kind, 'director_scene_plan');
assert.throws(
  () => prepareReviewedCompanionMaterialPromotionDraft(directorCandidate, {
    ...requestFor(directorCandidate),
    authority: {
      ...(directorAuthority as ReviewedCandidatePromotionAuthority & {
        kind: 'director_scene_plan';
        scope: HistoryScope;
        routeRef: CompanionMaterialRouteRef;
      }),
      routeRef: {
        ...routeRef,
        branchId: 'wrong-branch',
      },
    },
  }, resolver),
  /exact route/u,
);

// Future publisher behavior is represented only by this local active clone;
// it is never persisted. The selector must still keep mainline and if_line
// isolated once a canonical publisher eventually exists.
const directorReceipt = canonicalReceiptFor(directorCandidate);
const directorGrounding: CompanionMaterialGroundingRef = {
  kind: directorReceipt.groundingKind,
  claimKey: directorReceipt.claimKey,
  refId: directorReceipt.id,
  revision: directorReceipt.revision,
  issuerId: directorReceipt.issuerId,
  authorityDigest: directorReceipt.digest,
  scope: { ...directorReceipt.scope },
  occurredAt: directorReceipt.occurredAt,
  validUntil: directorReceipt.validUntil,
};
const activeDirectorFixture = {
  ...directorDraft.recordDraft,
  status: 'active' as const,
};
const directorSelectionBase = {
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  scope: scopeFor(directorCandidate.charId),
  surface: 'storydesk' as const,
  mode: 'story_planning' as const,
  purpose: 'scene_planning' as const,
  query: directorCandidate.route,
  semanticTags: [directorCandidate.route],
  groundingRefs: [directorGrounding],
  relationshipStage: 'unknown' as const,
  budgetChars: 360,
  maxItems: 2,
  now: T0,
};
const mainlineSelection = selectCompanionMaterialFromRecords({
  records: [activeDirectorFixture],
  receipts: [],
  request: {
    ...directorSelectionBase,
    requestId: 'promotion-director-mainline',
    routeRef,
  },
});
assert.equal(mainlineSelection.selectedMaterialIds.length, 1);
const ifLineSelection = selectCompanionMaterialFromRecords({
  records: [activeDirectorFixture],
  receipts: [],
  request: {
    ...directorSelectionBase,
    requestId: 'promotion-director-if-line',
    routeRef: { ...routeRef, lane: 'if_line' },
  },
});
assert.equal(
  ifLineSelection.selectedMaterialIds.length,
  0,
  'a mainline Director draft must not cross into if_line',
);

const promotedFirst = promoted[0];
const promotedFirstReceipt = canonicalReceiptFor(first);
const exactGrounding: CompanionMaterialGroundingRef = {
  kind: promotedFirstReceipt.groundingKind,
  claimKey: promotedFirstReceipt.claimKey,
  refId: promotedFirstReceipt.id,
  revision: promotedFirstReceipt.revision,
  issuerId: promotedFirstReceipt.issuerId,
  authorityDigest: promotedFirstReceipt.digest,
  scope: { ...promotedFirstReceipt.scope },
  occurredAt: promotedFirstReceipt.occurredAt,
  validUntil: promotedFirstReceipt.validUntil,
};
const selectionBase = {
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  requestId: 'promotion-selection',
  scope: scopeFor(first.charId),
  surface: 'meet_scene' as const,
  mode: 'meet_scene' as const,
  purpose: 'stable_context' as const,
  query: first.route,
  semanticTags: [first.route],
  relationshipStage: 'unknown' as const,
  budgetChars: 360,
  maxItems: 1,
  now: T0,
};
const selectedWithExactAuthority = selectCompanionMaterialFromRecords({
  records: [promotedFirst.recordDraft],
  receipts: [],
  request: {
    ...selectionBase,
    groundingRefs: [exactGrounding],
  },
});
assert.equal(
  selectedWithExactAuthority.selectedMaterialIds.length,
  0,
  'a review draft must remain non-selectable even with a matching caller-supplied receipt',
);
const selectedWithUnrelatedAuthority = selectCompanionMaterialFromRecords({
  records: [promotedFirst.recordDraft],
  receipts: [],
  request: {
    ...selectionBase,
    requestId: 'promotion-selection-unrelated',
    groundingRefs: [{
      ...exactGrounding,
      refId: 'unrelated-authority',
    }],
  },
});
assert.equal(selectedWithUnrelatedAuthority.selectedMaterialIds.length, 0);

const invalidMatrixCandidate = {
  ...first,
  category: 'C' as const,
  activationAuthority: 'director_scene_plan' as const,
};
assert.throws(
  () => prepareReviewedCompanionMaterialPromotionDraft(
    invalidMatrixCandidate,
    {
      ...requestFor(first),
      authority: {
        kind: 'director_scene_plan',
        scope: scopeFor(first.charId),
        routeRef,
        authorityReceiptRef: authorityFor(first).authorityReceiptRef,
      },
    },
    resolver,
  ),
  /incompatible/u,
);

console.log(
  'reviewed candidate promotion draft contract: green '
  + 'paths=21 runtimeAvailable=0 persisted=0 selected=fixture-only delivered=0 '
  + 'publisher=not-installed truth=none currentMotive=none',
);
