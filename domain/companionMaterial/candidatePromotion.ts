import {
  assertValidCompanionMaterialRecord,
} from './contract.ts';
import {
  validateReviewedCompanionMaterialCandidate,
  type ReviewedCompanionMaterialCandidate,
  type ReviewedCompanionMaterialCandidateAuthority,
} from './reviewedCandidate.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialMode,
  type CompanionMaterialRecord,
  type CompanionMaterialRouteRef,
} from './types.ts';
import {
  validateHistoryScope,
  type HistoryScope,
} from '../historyImport/index.ts';

export const REVIEWED_CANDIDATE_PROMOTION_SCHEMA_VERSION = 1 as const;

type CanonPromotionAuthority = {
  kind: 'character_canon_review';
  charId: string;
  authorityReceiptRef: ReviewedCandidateAuthorityReceiptRef;
  eligibleModes: readonly CompanionMaterialMode[];
};

type OpeningPromotionAuthority = {
  kind: 'canonical_thread_or_artifact';
  scope: HistoryScope;
  authorityReceiptRef: ReviewedCandidateAuthorityReceiptRef;
  eligibleMode: 'call' | 'meet_scene' | 'date_scene' | 'proactive_letter';
  eligibleSurface: 'call' | 'meet_scene' | 'date_scene' | 'proactive_letter';
};

type DirectorPromotionAuthority = {
  kind: 'director_scene_plan' | 'director_motive';
  scope: HistoryScope;
  routeRef: CompanionMaterialRouteRef;
  authorityReceiptRef: ReviewedCandidateAuthorityReceiptRef;
};

export type ReviewedCandidatePromotionAuthority =
  | CanonPromotionAuthority
  | OpeningPromotionAuthority
  | DirectorPromotionAuthority;

export interface ReviewedCandidateAuthorityReceiptRef {
  id: string;
  revision: number;
  digest: string;
}

export interface ReviewedCandidateCanonicalAuthorityReceipt {
  schemaVersion: 1;
  id: string;
  revision: number;
  digest: string;
  issuerId: string;
  authorityKind: ReviewedCompanionMaterialCandidateAuthority;
  groundingKind:
    | 'character_canon_evidence'
    | 'canonical_thread_receipt'
    | 'external_artifact_receipt'
    | 'scene_plan';
  claimKey: string;
  charId: string;
  scope: HistoryScope;
  routeRef?: CompanionMaterialRouteRef;
  status: 'canonical';
  occurredAt: number;
  validUntil?: number;
}

/**
 * The registry owner resolves the exact current canonical receipt revision.
 * Promotion code never accepts a caller-authored receipt object as authority.
 */
export interface ReviewedCandidateAuthorityResolver {
  resolve(
    ref: Readonly<ReviewedCandidateAuthorityReceiptRef>,
  ): Readonly<ReviewedCandidateCanonicalAuthorityReceipt> | undefined;
}

export interface ReviewedCandidatePromotionRequest {
  schemaVersion: typeof REVIEWED_CANDIDATE_PROMOTION_SCHEMA_VERSION;
  id: string;
  recordId: string;
  candidateId: string;
  candidateRevision: number;
  authority: ReviewedCandidatePromotionAuthority;
  positiveSignals: readonly string[];
  reviewerVersion: string;
  approvedAt: number;
}

export interface ReviewedCandidatePromotionDraftReceipt {
  schemaVersion: typeof REVIEWED_CANDIDATE_PROMOTION_SCHEMA_VERSION;
  id: string;
  requestId: string;
  candidateId: string;
  candidateRevision: number;
  authorityKind: ReviewedCompanionMaterialCandidateAuthority;
  authorityRefId: string;
  authorityRevision: number;
  authorityDigest: string;
  authorityIssuerId: string;
  promotedRecordId: string;
  promotedRecordRevision: number;
  scope?: HistoryScope;
  routeRef?: CompanionMaterialRouteRef;
  /**
   * A review draft cannot publish availability. A future canonical publisher
   * must resolve the authority again from its own registry and persist through
   * a dedicated publisher.
   */
  availabilityEffect: 'none';
  publicationEffect: 'canonical_publisher_required';
  deliveryEffect: 'none';
  truthEffect: 'none';
  relationshipMemoryEffect: 'none';
  currentMotiveEffect: 'none';
  reviewerVersion: string;
  occurredAt: number;
}

export interface ReviewedCandidatePromotionDraftResult {
  recordDraft: CompanionMaterialRecord;
  receipt: ReviewedCandidatePromotionDraftReceipt;
}

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isSha256 = (value: unknown): value is string => (
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
);

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  left.progressBundleId === right.progressBundleId
  && left.personaMaskId === right.personaMaskId
  && left.charId === right.charId
);

const resolveGroundingAuthority = (input: {
  resolver: ReviewedCandidateAuthorityResolver;
  ref: ReviewedCandidateAuthorityReceiptRef;
  expectedKind: ReviewedCompanionMaterialCandidateAuthority;
  charId: string;
  approvedAt: number;
  scope?: HistoryScope;
  routeRef?: CompanionMaterialRouteRef;
}): ReviewedCandidateCanonicalAuthorityReceipt => {
  const {
    resolver,
    ref,
    expectedKind,
    charId,
    approvedAt,
    scope,
    routeRef,
  } = input;
  if (!nonEmpty(ref.id) || !Number.isInteger(ref.revision) || ref.revision < 1) {
    throw new Error('promotion authority receipt ref is invalid');
  }
  if (!isSha256(ref.digest)) throw new Error('promotion authority receipt digest is invalid');
  const receipt = resolver.resolve(ref);
  if (!receipt) throw new Error('promotion authority receipt is not canonical');
  if (
    receipt.id !== ref.id
    || receipt.revision !== ref.revision
    || receipt.digest !== ref.digest
  ) {
    throw new Error('promotion authority receipt revision or digest is stale');
  }
  if (
    receipt.schemaVersion !== 1
    || receipt.status !== 'canonical'
    || receipt.authorityKind !== expectedKind
  ) {
    throw new Error('promotion authority receipt kind is invalid');
  }
  if (!nonEmpty(receipt.issuerId) || !nonEmpty(receipt.claimKey)) {
    throw new Error('promotion authority receipt issuer or claim is invalid');
  }
  if (!Number.isFinite(receipt.occurredAt) || receipt.occurredAt > approvedAt) {
    throw new Error('promotion authority receipt time is invalid');
  }
  if (receipt.validUntil !== undefined && receipt.validUntil < approvedAt) {
    throw new Error('promotion authority receipt is expired');
  }
  if (
    validateHistoryScope(receipt.scope).length
    || receipt.charId !== charId
    || receipt.scope.charId !== charId
  ) {
    throw new Error('promotion authority receipt crosses character');
  }
  if (scope && !sameScope(receipt.scope, scope)) {
    throw new Error('promotion authority receipt crosses exact HistoryScope');
  }
  const sameRoute = (
    (!routeRef && !receipt.routeRef)
    || Boolean(
      routeRef
      && receipt.routeRef
      && routeRef.routeId === receipt.routeRef.routeId
      && routeRef.branchId === receipt.routeRef.branchId
      && routeRef.sceneId === receipt.routeRef.sceneId
      && routeRef.lane === receipt.routeRef.lane
    )
  );
  if (routeRef && !sameRoute) {
    throw new Error('promotion authority receipt crosses exact route');
  }
  return { ...receipt, scope: { ...receipt.scope } };
};

const assertCommonPromotion = (
  candidate: ReviewedCompanionMaterialCandidate,
  request: ReviewedCandidatePromotionRequest,
): void => {
  const candidateErrors = validateReviewedCompanionMaterialCandidate(candidate);
  if (candidateErrors.length) {
    throw new Error(`invalid reviewed candidate: ${candidateErrors.join('; ')}`);
  }
  if (request.schemaVersion !== REVIEWED_CANDIDATE_PROMOTION_SCHEMA_VERSION) {
    throw new Error('promotion schemaVersion is unsupported');
  }
  if (!nonEmpty(request.id) || !nonEmpty(request.recordId)) {
    throw new Error('promotion id and recordId are required');
  }
  if (
    request.candidateId !== candidate.id
    || request.candidateRevision !== candidate.revision
  ) {
    throw new Error('promotion candidate id or revision is stale');
  }
  if (request.authority.kind !== candidate.activationAuthority) {
    throw new Error('promotion authority does not match candidate requirement');
  }
  if (!request.positiveSignals.length || request.positiveSignals.some(tag => !nonEmpty(tag))) {
    throw new Error('promotion requires reviewed positiveSignals');
  }
  if (new Set(request.positiveSignals).size !== request.positiveSignals.length) {
    throw new Error('promotion positiveSignals must be unique');
  }
  if (!nonEmpty(request.reviewerVersion) || !Number.isFinite(request.approvedAt)) {
    throw new Error('promotion reviewerVersion and approvedAt are required');
  }
};

const modesForCanon = (
  _candidate: ReviewedCompanionMaterialCandidate,
  authority: CanonPromotionAuthority,
): readonly CompanionMaterialMode[] => {
  const modes = [...new Set(authority.eligibleModes)];
  if (!modes.length) throw new Error('canon promotion requires eligibleModes');
  return modes;
};

/**
 * Compile a fail-closed promotion draft for review and contract verification.
 *
 * The supplied lookup is intentionally not runtime authority. Therefore this
 * function can only produce a disabled, non-persistable draft and a
 * no-availability receipt. Installing a real canonical publisher is separate
 * future work and must resolve the receipt again from its own trusted registry.
 */
export const prepareReviewedCompanionMaterialPromotionDraft = (
  candidate: ReviewedCompanionMaterialCandidate,
  request: ReviewedCandidatePromotionRequest,
  authorityResolver: ReviewedCandidateAuthorityResolver,
): ReviewedCandidatePromotionDraftResult => {
  assertCommonPromotion(candidate, request);
  const resolvedAuthority = resolveGroundingAuthority({
    resolver: authorityResolver,
    ref: request.authority.authorityReceiptRef,
    expectedKind: request.authority.kind,
    charId: candidate.charId,
    approvedAt: request.approvedAt,
    scope: request.authority.kind === 'character_canon_review'
      ? undefined
      : request.authority.scope,
    routeRef: (
      request.authority.kind === 'director_scene_plan'
      || request.authority.kind === 'director_motive'
    ) ? request.authority.routeRef : undefined,
  });
  const exactGroundingRequirement = {
    kind: resolvedAuthority.groundingKind,
    claimKey: resolvedAuthority.claimKey,
    refId: resolvedAuthority.id,
    revision: resolvedAuthority.revision,
    issuerId: resolvedAuthority.issuerId,
    authorityDigest: resolvedAuthority.digest,
  } as const;

  const common = {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    id: request.recordId,
    charId: candidate.charId,
    guidance: candidate.guidance,
    knowledge: 'char_private' as const,
    tags: [...request.positiveSignals],
    retrievalHints: {
      activationPolicy: 'relevance_required' as const,
      positiveSignals: [...request.positiveSignals],
      suppressSignals: ['low_signal', 'technical_meta', 'tool_request'],
      variationGroup: `${candidate.charId}_${candidate.materialLane}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '_')
        .replace(/^_+|_+$/gu, '')
        .slice(0, 64),
      fallbackPriority: 0,
    },
    sourceRefs: candidate.sourceRefs.map(ref => ({ ...ref })),
    promotionAuthority: {
      authorityKind: request.authority.kind,
      receiptId: resolvedAuthority.id,
      receiptRevision: resolvedAuthority.revision,
      receiptDigest: resolvedAuthority.digest,
      issuerId: resolvedAuthority.issuerId,
    },
    status: 'disabled' as const,
    createdAt: request.approvedAt,
    updatedAt: request.approvedAt,
    revision: 1,
  };

  let record: CompanionMaterialRecord;
  let scope: HistoryScope | undefined;
  let routeRef: CompanionMaterialRouteRef | undefined;

  if (request.authority.kind === 'character_canon_review') {
    const authority = request.authority;
    if (candidate.category !== 'A' || candidate.materialLane !== 'stable_detail_claim') {
      throw new Error('character canon authority may only promote A stable details');
    }
    if (authority.charId !== candidate.charId) {
      throw new Error('character canon promotion crosses character');
    }
    if (resolvedAuthority.groundingKind !== 'character_canon_evidence') {
      throw new Error('character canon promotion has the wrong grounding kind');
    }
    record = {
      ...common,
      ownerScope: { kind: 'character', charId: candidate.charId },
      kind: 'stable_detail',
      slot: 'relevant_stable_details',
      renderPolicy: 'fact_reference',
      continuity: 'canon',
      eligibleModes: modesForCanon(candidate, authority),
      eligiblePurposes: ['stable_context'],
      groundingPolicy: {
        allOf: [exactGroundingRequirement],
      },
    };
  } else if (request.authority.kind === 'canonical_thread_or_artifact') {
    const authority = request.authority;
    if (
      candidate.category !== 'B'
      || !['opening_recipe', 'proactive_seed'].includes(candidate.materialLane)
    ) {
      throw new Error('thread/artifact authority may only promote B opening material');
    }
    if (
      !candidate.eligibleSurfaces.includes(authority.eligibleSurface)
      || authority.eligibleMode !== authority.eligibleSurface
    ) {
      throw new Error('opening promotion surface exceeds reviewed candidate surface');
    }
    if (!['canonical_thread_receipt', 'external_artifact_receipt'].includes(
      resolvedAuthority.groundingKind,
    )) {
      throw new Error('opening promotion has the wrong grounding kind');
    }
    scope = { ...authority.scope };
    record = {
      ...common,
      ownerScope: { kind: 'relationship', scope },
      kind: candidate.materialLane === 'proactive_seed' ? 'proactive_seed' : 'opening_recipe',
      slot: candidate.materialLane === 'proactive_seed' ? 'proactive_seeds' : 'opening_recipes',
      renderPolicy: 'transform_required',
      continuity: 'relationship',
      eligibleModes: [authority.eligibleMode],
      eligiblePurposes: candidate.materialLane === 'proactive_seed'
        ? ['proactive_intent']
        : ['opening'],
      groundingPolicy: {
        allOf: [exactGroundingRequirement],
      },
    };
  } else {
    const authority = request.authority;
    const expectedLane = authority.kind === 'director_motive'
      ? 'motive_candidate'
      : 'scene_affordance';
    if (candidate.materialLane !== expectedLane) {
      throw new Error('Director authority does not match candidate lane');
    }
    if (resolvedAuthority.groundingKind !== 'scene_plan') {
      throw new Error('Director promotion has the wrong grounding kind');
    }
    scope = { ...authority.scope };
    routeRef = { ...authority.routeRef };
    record = {
      ...common,
      ownerScope: { kind: 'relationship', scope },
      kind: expectedLane === 'motive_candidate' ? 'initiative_motive' : 'scene_affordance',
      slot: expectedLane === 'motive_candidate' ? 'motive_candidates' : 'scene_affordances',
      renderPolicy: 'decision_context',
      continuity: routeRef.sceneId ? 'scene_only' : 'branch',
      routeId: routeRef.routeId,
      branchId: routeRef.branchId,
      sceneId: routeRef.sceneId,
      routeLane: routeRef.lane,
      eligibleModes: ['story_planning'],
      eligiblePurposes: ['scene_planning'],
      groundingPolicy: {
        allOf: [exactGroundingRequirement],
      },
    };
  }

  assertValidCompanionMaterialRecord(record);
  const receipt: ReviewedCandidatePromotionDraftReceipt = {
    schemaVersion: REVIEWED_CANDIDATE_PROMOTION_SCHEMA_VERSION,
    id: `promotion-receipt:${request.id}`,
    requestId: request.id,
    candidateId: candidate.id,
    candidateRevision: candidate.revision,
    authorityKind: request.authority.kind,
    authorityRefId: resolvedAuthority.id,
    authorityRevision: resolvedAuthority.revision,
    authorityDigest: resolvedAuthority.digest,
    authorityIssuerId: resolvedAuthority.issuerId,
    promotedRecordId: record.id,
    promotedRecordRevision: record.revision,
    scope,
    routeRef,
    availabilityEffect: 'none',
    publicationEffect: 'canonical_publisher_required',
    deliveryEffect: 'none',
    truthEffect: 'none',
    relationshipMemoryEffect: 'none',
    currentMotiveEffect: 'none',
    reviewerVersion: request.reviewerVersion,
    occurredAt: request.approvedAt,
  };
  return { recordDraft: record, receipt };
};
