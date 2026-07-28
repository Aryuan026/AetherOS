import type { HistoryScope } from '../historyImport/types.ts';

export const REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION = 1 as const;

/**
 * A pointer into a separately controlled reviewed source pack.
 *
 * It deliberately cannot be substituted for HistorySourceSpan: reviewed packs
 * are not Daily Archive documents and have no message offsets.
 */
export interface ReviewedPackSourceRef {
  storeFamily: 'reviewed_pack';
  packId: string;
  packRevision: number;
  packDigest: string;
  sourceFingerprint: string;
  sourceGroupFingerprint?: string;
}

export type ReviewedPackEvidenceClass =
  | 'character_canon_candidate'
  | 'relationship_plot_candidate'
  | 'withheld_reinforcement';

export type ReviewedPackEvaluationRole =
  | 'review_input'
  | 'blind_holdout';

export type ReviewedPackEvidenceStatus =
  | 'retained'
  | 'superseded'
  | 'rejected';

export type ReviewedPackResidualDisposition =
  | 'duplicate_reinforcement'
  | 'exact_scope_evidence'
  | 'holdout'
  | 'isolated_or_insufficient'
  | 'promotion_to_non_verbatim_asset'
  | 'promotion_to_scope_gated_non_verbatim_asset'
  | 'retained_unclassified';

/**
 * Evidence may remember a proposed route location, but incomplete route data
 * remains non-projectable until an exact review supplies all three fields.
 */
export interface ReviewedPackRouteRef {
  routeId?: string;
  branchId?: string;
  sceneId?: string;
}

/**
 * Evidence-only record. It has no guidance, render policy, prompt slot or
 * runtime delivery shape and therefore cannot masquerade as companion
 * material.
 */
export interface ReviewedPackEvidenceRecord {
  schemaVersion: typeof REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION;
  id: string;
  sourceRef: ReviewedPackSourceRef;
  leadId: string;
  charId: string;
  evidenceClass: ReviewedPackEvidenceClass;
  evaluationRole: ReviewedPackEvaluationRole;
  /**
   * Opaque ids of reviewed, truth-neutral semantic candidates derived during
   * source-pack adjudication. They are not prompt material records and cannot
   * authorize delivery.
   */
  reviewedCandidateIds?: readonly string[];
  /**
   * A non-runtime candidate never consumes the source's remaining exact-scope
   * evidence. These fields keep that residual destination explicit.
   */
  residualDisposition: ReviewedPackResidualDisposition;
  residualReviewedAssetIds: readonly string[];
  targetScope?: HistoryScope;
  routeRef?: ReviewedPackRouteRef;
  status: ReviewedPackEvidenceStatus;
  revision: number;
}

export type ReviewedPackReviewTarget =
  | {
      kind: 'character_canon_evidence';
      charId: string;
    }
  | {
      kind: 'relationship_evidence';
      scope: HistoryScope;
    }
  | {
      kind: 'scene_plan_candidate_evidence';
      scope: HistoryScope;
      routeId: string;
      branchId: string;
      sceneId: string;
    };

export interface ReviewedPackReviewRequest {
  schemaVersion: typeof REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION;
  id: string;
  packId: string;
  packRevision: number;
  packDigest: string;
  evidenceIds: readonly string[];
  target: ReviewedPackReviewTarget;
  reviewerVersion: string;
}

export type ReviewedPackTerminalDisposition =
  | 'retained_pending_review'
  | 'retained_pending_scope'
  | 'retained_insufficient_evidence'
  | 'review_rejected'
  | 'holdout_evaluated'
  | 'adjudicated_character_canon_evidence'
  | 'adjudicated_relationship_evidence'
  | 'adjudicated_scene_candidate_evidence'
  | 'adjudicated_nonruntime_material_candidate';

export type ReviewedPackEvidenceSink =
  | 'review_ledger_only'
  | 'holdout_evaluation_only'
  | 'character_canon_evidence'
  | 'relationship_evidence'
  | 'scene_plan_candidate_evidence'
  | 'companion_material_candidate_registry';

/**
 * A terminal accounting receipt is still truth-neutral. Downstream domains
 * need their own authority-bearing commit before any fact can become canon,
 * relationship memory or a ScenePlan.
 */
export interface ReviewedPackTerminalReceipt {
  schemaVersion: typeof REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION;
  id: string;
  evidenceId: string;
  evidenceRevision: number;
  sourceRef: ReviewedPackSourceRef;
  disposition: ReviewedPackTerminalDisposition;
  sink: ReviewedPackEvidenceSink;
  derivedRecordIds: readonly string[];
  residualDisposition: ReviewedPackResidualDisposition;
  residualReviewedAssetIds: readonly string[];
  truthEffect: 'none';
  relationshipMemoryEffect: 'none';
  runtimeDelivery: 'forbidden';
  reviewerVersion: string;
  reason?: string;
  createdAt: number;
}

export interface ReviewedPackConservationExpectation {
  total: number;
  reviewInput: number;
  blindHoldout: number;
  characterCanonCandidate: number;
  relationshipPlotCandidate: number;
  withheldReinforcement: number;
}

export interface ReviewedPackConservationSummary extends ReviewedPackConservationExpectation {
  uniqueEvidenceIds: number;
  uniqueSourceFingerprints: number;
}
