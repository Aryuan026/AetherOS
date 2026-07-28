import type {
  CompanionMaterialContinuity,
  CompanionMaterialGroundingPolicy,
  CompanionMaterialKind,
  CompanionMaterialKnowledge,
  CompanionMaterialMode,
  CompanionMaterialPurpose,
  CompanionMaterialRelationshipStage,
  CompanionMaterialRenderPolicy,
  CompanionMaterialSlot,
} from '../../companionMaterial/types.ts';
import type {
  HistoricalAuthority,
  HistorySourceSpan,
} from '../analysis/types.ts';
import type { HistoryScope } from '../types.ts';

export const HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION = 2 as const;

export type HistoryCompanionMaterialPassStatus =
  | 'active'
  | 'superseded'
  | 'archived';

export type HistoryCompanionMaterialCandidateStatus =
  | 'active'
  | 'disabled'
  | 'stale'
  | 'discarded';

/**
 * Code-owned evidence class for a historical finding. It describes what must
 * already be established before selection, never a prompt instruction or a
 * claim that an old event is current.
 */
export type HistoryCompanionMaterialGroundingClass =
  | 'none'
  | 'live_semantic_anchor'
  | 'confirmed_thread'
  | 'character_life'
  | 'confirmed_user_state'
  | 'scene_context';

/**
 * A deliberately small vocabulary. Query terms may still come from the user's
 * current request, but stored historical tags must not grow into an unbounded
 * second ontology.
 */
export type HistoryCompanionMaterialTag =
  | 'speech_rhythm'
  | 'care_style'
  | 'humor_style'
  | 'conflict_style'
  | 'repair_style'
  | 'initiative_style'
  | 'boundary_style'
  | 'affection_style'
  | 'stable_habit'
  | 'world_detail'
  | 'relationship_detail'
  | 'opening_shape'
  | 'fact_free_opening'
  | 'scene_permission'
  | 'proactive_intent';

/**
 * One non-verbatim interpretation candidate derived from immutable Calendar
 * evidence. It is relationship-scoped because the same character may develop
 * differently under another mask or progress bundle.
 */
export interface HistoryCompanionMaterialCandidate {
  schemaVersion: typeof HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION;
  id: string;
  scope: HistoryScope;
  temporalClass: 'historical';
  analysisRunId: string;
  extractorVersion: string;
  authority: HistoricalAuthority;
  confidence: number;
  sourceRefs: readonly HistorySourceSpan[];

  kind: CompanionMaterialKind;
  slot: CompanionMaterialSlot;
  /** Reviewed semantic guidance only. Never a copied historical utterance. */
  guidance: string;
  renderPolicy: CompanionMaterialRenderPolicy;
  knowledge: CompanionMaterialKnowledge;
  continuity: CompanionMaterialContinuity;
  routeId?: string;
  branchId?: string;
  sceneId?: string;

  eligibleModes: readonly CompanionMaterialMode[];
  eligiblePurposes: readonly CompanionMaterialPurpose[];
  tags: readonly HistoryCompanionMaterialTag[];
  groundingClass: HistoryCompanionMaterialGroundingClass;
  groundingPolicy?: CompanionMaterialGroundingPolicy;
  relationshipFloor?: Exclude<CompanionMaterialRelationshipStage, 'unknown'>;
  cooldownMs?: number;
  maxDeliveries?: number;

  status: HistoryCompanionMaterialCandidateStatus;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

/**
 * A sibling analysis product, not a field grafted onto the relationship/time
 * snapshot. Re-analysis may create another pass over the same evidence without
 * deleting earlier semantic interpretations.
 */
export interface HistoryCompanionMaterialPass {
  schemaVersion: typeof HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION;
  id: string;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  analysisSnapshotId?: string;
  analysisRunId: string;
  extractorVersion: string;
  status: HistoryCompanionMaterialPassStatus;
  candidates: readonly HistoryCompanionMaterialCandidate[];
  createdAt: number;
  updatedAt: number;
  revision: number;
}

export interface HistoryCompanionMaterialPublication {
  passId: string;
  /** Canonical authority actually consumed by this publication. */
  activationReceiptId: string;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  materialIds: readonly string[];
  activeCount: number;
  disabledCount: number;
  publishedAt: number;
}
