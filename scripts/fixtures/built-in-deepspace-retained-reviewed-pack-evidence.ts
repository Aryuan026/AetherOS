import {
  REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION,
  createReviewedPackTerminalReceipt,
  type ReviewedPackConservationExpectation,
  type ReviewedPackEvidenceClass,
  type ReviewedPackEvidenceRecord,
  type ReviewedPackEvaluationRole,
  type ReviewedPackTerminalReceipt,
} from '../../domain/reviewedPackEvidence/index.ts';
import {
  BUILT_IN_DEEPSPACE_RETAINED_SOURCE_MANIFEST,
} from './built-in-deepspace-four-lane-source-audit.ts';

/**
 * Exact opaque fixture derived from the public retained-source manifest.
 *
 * It expands the real 493 reviewed source fingerprints while retaining no
 * source dialogue, title, URL or private path.
 */
export const BUILT_IN_RETAINED_REVIEWED_PACK_ID = (
  'lysk-reviewed-four-lane-retained-evidence-v1'
);
export const BUILT_IN_RETAINED_REVIEWED_PACK_REVISION = 1;
export const BUILT_IN_RETAINED_REVIEWED_PACK_DIGEST = (
  'sha256:4789f715978424d8f37e1f3a6b54023c63cfe42cd030ae36f8f5a59782e400b0'
);

interface LeadCountSpec {
  leadId: string;
  charId: string;
  canonReviewInput: number;
  canonHoldout: number;
  relationshipReviewInput: number;
  relationshipHoldout: number;
  withheldReinforcement: number;
}

/**
 * review + holdout:
 * - canon/worldview: 198 + 47 = 245
 * - relationship/private plot: 190 + 51 = 241
 * - insufficient/shared reinforcement: 7
 */
export const BUILT_IN_RETAINED_EVIDENCE_COUNTS_BY_LEAD: readonly LeadCountSpec[] = [
  {
    leadId: 'lishen',
    charId: 'builtin-zayne',
    canonReviewInput: 36,
    canonHoldout: 10,
    relationshipReviewInput: 40,
    relationshipHoldout: 16,
    withheldReinforcement: 6,
  },
  {
    leadId: 'qiyu',
    charId: 'builtin-daily-companion',
    canonReviewInput: 41,
    canonHoldout: 7,
    relationshipReviewInput: 35,
    relationshipHoldout: 10,
    withheldReinforcement: 0,
  },
  {
    leadId: 'qinche',
    charId: 'builtin-sylus',
    canonReviewInput: 48,
    canonHoldout: 9,
    relationshipReviewInput: 29,
    relationshipHoldout: 6,
    withheldReinforcement: 0,
  },
  {
    leadId: 'shenxinghui',
    charId: 'builtin-xavier',
    canonReviewInput: 52,
    canonHoldout: 14,
    relationshipReviewInput: 60,
    relationshipHoldout: 12,
    withheldReinforcement: 1,
  },
  {
    leadId: 'xiayizhou',
    charId: 'builtin-caleb',
    canonReviewInput: 21,
    canonHoldout: 7,
    relationshipReviewInput: 26,
    relationshipHoldout: 7,
    withheldReinforcement: 0,
  },
] as const;

export const BUILT_IN_RETAINED_EVIDENCE_EXPECTATION: ReviewedPackConservationExpectation = {
  total: 493,
  reviewInput: 388,
  blindHoldout: 98,
  characterCanonCandidate: 245,
  relationshipPlotCandidate: 241,
  withheldReinforcement: 7,
};

const CHAR_ID_BY_LEAD: Readonly<Record<string, string>> = Object.fromEntries(
  BUILT_IN_RETAINED_EVIDENCE_COUNTS_BY_LEAD.map(spec => [spec.leadId, spec.charId]),
);

const evidenceClassFor = (
  supportedReviewedAssetIds: readonly string[],
): ReviewedPackEvidenceClass => {
  if (supportedReviewedAssetIds.some(id => id.includes('scene_scoped_canon_context'))) {
    return 'character_canon_candidate';
  }
  if (supportedReviewedAssetIds.some(id => id.includes('scene_scoped_relationship_context'))) {
    return 'relationship_plot_candidate';
  }
  return 'withheld_reinforcement';
};

const evaluationRoleFor = (
  sourceRole: string,
): ReviewedPackEvaluationRole => (
  sourceRole === 'holdout_evaluation_only' ? 'blind_holdout' : 'review_input'
);

export const buildBuiltInRetainedReviewedPackEvidenceFixture = (
): ReviewedPackEvidenceRecord[] => BUILT_IN_DEEPSPACE_RETAINED_SOURCE_MANIFEST.flatMap(group => {
  const charId = CHAR_ID_BY_LEAD[group.leadId];
  if (!charId) throw new Error(`Missing built-in charId for retained lead ${group.leadId}`);
  const evidenceClass = evidenceClassFor(group.supportedReviewedAssetIds);
  const evaluationRole = evaluationRoleFor(group.sourceRole);
  const reviewedCandidateIds = [...group.reviewedCandidateIds];
  return group.sourceFingerprints.map(sourceFingerprint => ({
    schemaVersion: REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION,
    id: `reviewed-pack-evidence:${sourceFingerprint}`,
    sourceRef: {
      storeFamily: 'reviewed_pack' as const,
      packId: BUILT_IN_RETAINED_REVIEWED_PACK_ID,
      packRevision: BUILT_IN_RETAINED_REVIEWED_PACK_REVISION,
      packDigest: BUILT_IN_RETAINED_REVIEWED_PACK_DIGEST,
      sourceFingerprint,
    },
    leadId: group.leadId,
    charId,
    evidenceClass,
    evaluationRole,
    ...(reviewedCandidateIds.length ? { reviewedCandidateIds } : {}),
    residualDisposition: group.residualDisposition,
    residualReviewedAssetIds: [...group.residualReviewedAssetIds],
    status: 'retained' as const,
    revision: 1,
  }));
});

export const buildBuiltInRetainedReviewedPackTerminalFixture = (
  records: readonly ReviewedPackEvidenceRecord[],
  createdAt = Date.UTC(2026, 6, 29),
): ReviewedPackTerminalReceipt[] => records.map((record, index) => {
  if (record.evaluationRole === 'blind_holdout') {
    return createReviewedPackTerminalReceipt(record, {
      id: `reviewed-pack-terminal:${index + 1}`,
      disposition: 'holdout_evaluated',
      reviewerVersion: 'reviewed-pack-fixture-v1',
      reason: 'blind holdout evaluated without becoming review input or runtime material',
      createdAt,
    });
  }
  if (record.reviewedCandidateIds?.length) {
    return createReviewedPackTerminalReceipt(record, {
      id: `reviewed-pack-terminal:${index + 1}`,
      disposition: 'adjudicated_nonruntime_material_candidate',
      derivedRecordIds: record.reviewedCandidateIds,
      reviewerVersion: 'reviewed-pack-fixture-v2',
      createdAt,
    });
  }
  if (record.evidenceClass === 'withheld_reinforcement') {
    return createReviewedPackTerminalReceipt(record, {
      id: `reviewed-pack-terminal:${index + 1}`,
      disposition: 'retained_insufficient_evidence',
      reviewerVersion: 'reviewed-pack-fixture-v1',
      reason: 'insufficient or shared behavior remains in the review ledger',
      createdAt,
    });
  }
  if (record.evidenceClass === 'relationship_plot_candidate') {
    return createReviewedPackTerminalReceipt(record, {
      id: `reviewed-pack-terminal:${index + 1}`,
      disposition: 'retained_pending_scope',
      reviewerVersion: 'reviewed-pack-fixture-v1',
      reason: 'relationship evidence has no exact player relationship scope yet',
      createdAt,
    });
  }
  return createReviewedPackTerminalReceipt(record, {
    id: `reviewed-pack-terminal:${index + 1}`,
    disposition: 'retained_pending_review',
    reviewerVersion: 'reviewed-pack-fixture-v1',
    reason: 'character canon evidence awaits an authority-bearing canon review',
    createdAt,
  });
});
