import type { HistoryScope } from '../historyImport/types.ts';

export const COMPANION_MATERIAL_SCHEMA_VERSION = 1 as const;

/**
 * A material may be reusable for one character, or tied to one exact
 * progress-bundle/persona/character relationship. Selection always uses the
 * latter scope, even when the stored material is character-owned.
 */
export type CompanionMaterialOwnerScope =
  | {
      kind: 'character';
      charId: string;
    }
  | {
      kind: 'relationship';
      scope: HistoryScope;
    };

export type CompanionMaterialKind =
  | 'language_fingerprint'
  | 'stable_detail'
  | 'initiative_motive'
  | 'opening_recipe'
  | 'proactive_seed'
  | 'scene_affordance';

export type CompanionMaterialSlot =
  | 'stable_character_voice'
  | 'stable_base'
  | 'relevant_stable_details'
  | 'motive_candidates'
  | 'opening_recipes'
  | 'proactive_seeds'
  | 'scene_affordances';

export type CompanionMaterialRenderPolicy =
  | 'style_only'
  | 'fact_reference'
  | 'decision_context'
  | 'transform_required';

export type CompanionMaterialKnowledge =
  | 'char_private'
  | 'user_private'
  | 'relationship_private'
  | 'shared'
  | 'public_safe'
  | 'unknown_to_char'
  | 'unknown_to_user';

export type CompanionMaterialContinuity =
  | 'canon'
  | 'relationship'
  | 'branch'
  | 'scene_only';

/**
 * This mirrors the AI-facing modes, without making a private material pack
 * responsible for provider ordering or the CreativeScheme.
 */
export type CompanionMaterialMode =
  | 'remote_chat'
  | 'call'
  | 'meet_scene'
  | 'date_scene'
  | 'proactive_letter'
  | 'group_chat'
  | 'social'
  | 'story_planning'
  | 'story_scene';

export type CompanionMaterialPurpose =
  | 'stable_context'
  | 'opening'
  | 'proactive_intent'
  | 'scene_planning';

export type CompanionMaterialSurface =
  | 'chat'
  | 'call'
  | 'date'
  | 'proactive_letter'
  | 'storydesk'
  | CompanionMaterialMode;

export type CompanionRelationshipFloor = 'new' | 'familiar' | 'close';
export type CompanionMaterialRelationshipStage = 'unknown' | CompanionRelationshipFloor;

/**
 * Retrieval policy is metadata for choosing material, never an instruction
 * rendered into the model prompt.
 *
 * - voice_fallback: may provide one light character-specific direction when
 *   the turn itself is low-signal.
 * - relevance_required: must earn its place from lexical/semantic evidence.
 */
export type CompanionMaterialActivationPolicy = 'voice_fallback' | 'relevance_required';

export interface CompanionMaterialRetrievalHints {
  activationPolicy: CompanionMaterialActivationPolicy;
  positiveSignals: readonly string[];
  suppressSignals?: readonly string[];
  variationGroup?: string;
  /** A small deterministic tie-breaker, not a permanent relevance override. */
  fallbackPriority?: number;
}

/**
 * Optional semantic scores are an upgrade seam only. Scope, surface,
 * continuity, knowledge, cooldown and diversity gates remain code-owned.
 * Query and indexed vectors must have been produced by the same named index.
 */
export interface CompanionMaterialSemanticRank {
  backend: 'embedding';
  modelId: string;
  indexRevision: string;
  scores: readonly {
    materialId: string;
    score: number;
  }[];
}

export interface CompanionMaterialSlotLimits {
  voice: number;
  canon: number;
  agency: number;
  opening: number;
  details: number;
  affordances: number;
  motives: number;
}

/**
 * A private pointer only. It intentionally has no raw text, source URL, or
 * public title field, so compiled runtime records cannot become a raw-dialogue
 * side channel.
 */
export interface CompanionMaterialSourceRef {
  storeFamily: string;
  recordId: string;
  revision: number;
  sourceFingerprint: string;
  sourcePackId?: string;
  sourceLocator?: string;
}

export interface CompanionMaterialRecord {
  schemaVersion: typeof COMPANION_MATERIAL_SCHEMA_VERSION;
  id: string;
  ownerScope: CompanionMaterialOwnerScope;
  charId: string;
  kind: CompanionMaterialKind;
  slot: CompanionMaterialSlot;

  /** A reviewed, non-verbatim semantic instruction. Never source dialogue. */
  guidance: string;
  renderPolicy: CompanionMaterialRenderPolicy;

  knowledge: CompanionMaterialKnowledge;
  continuity: CompanionMaterialContinuity;
  routeId?: string;
  branchId?: string;
  sceneId?: string;

  eligibleModes: readonly CompanionMaterialMode[];
  eligiblePurposes: readonly CompanionMaterialPurpose[];
  tags: readonly string[];
  retrievalHints?: CompanionMaterialRetrievalHints;
  relationshipFloor?: CompanionRelationshipFloor;
  cooldownMs?: number;
  maxDeliveries?: number;

  sourceRefs: readonly CompanionMaterialSourceRef[];
  status: 'active' | 'disabled';
  createdAt: number;
  updatedAt: number;
  revision: number;
}

export interface CompanionMaterialRouteRef {
  routeId: string;
  branchId: string;
  sceneId?: string;
  lane: 'mainline' | 'if_line';
}

export interface CompanionMaterialSelectionRequest {
  schemaVersion: typeof COMPANION_MATERIAL_SCHEMA_VERSION;
  requestId: string;
  scope: HistoryScope;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  routeRef?: CompanionMaterialRouteRef;
  /** Used to rank; must not be copied into a delivery receipt. */
  query?: string;
  /** One earlier live user turn, used only when the current turn is elliptical. */
  previousQuery?: string;
  /** Preferred Context Compiler name for already-normalized semantic tags. */
  semanticTags?: readonly string[];
  /** Compatibility alias for the current material-review callers. */
  contextTags?: readonly string[];
  relationshipStage: CompanionMaterialRelationshipStage;
  semanticRank?: CompanionMaterialSemanticRank;
  /** Optional per-slot ceilings supplied by a future Context Compiler. */
  limits?: Partial<CompanionMaterialSlotLimits>;
  budgetChars: number;
  maxItems: number;
  now: number;
}

export interface CompanionMaterialDeliveryItem {
  materialId: string;
  slot: CompanionMaterialSlot;
  kind: CompanionMaterialKind;
  /** The only material content that a future Context Compiler may receive. */
  guidance: string;
  renderPolicy: CompanionMaterialRenderPolicy;
  knowledge: CompanionMaterialKnowledge;
  continuity: CompanionMaterialContinuity;
  branchId?: string;
  sourceRefs: readonly CompanionMaterialSourceRef[];
  selectionReasons: readonly string[];
  estimatedChars: number;
}

export interface CompanionMaterialSelection {
  schemaVersion: typeof COMPANION_MATERIAL_SCHEMA_VERSION;
  selectionId: string;
  requestId: string;
  scope: HistoryScope;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  sourceRevisionFingerprint: string;
  budgetChars: number;
  items: readonly CompanionMaterialDeliveryItem[];
  selectedMaterialIds: readonly string[];
  warnings: readonly string[];
  selectedAt: number;
}

export interface CompanionMaterialDeliveryReceipt {
  schemaVersion: typeof COMPANION_MATERIAL_SCHEMA_VERSION;
  id: string;
  selectionId: string;
  consumerRef: {
    kind: 'semantic_context' | 'scene_plan' | 'prompt';
    id: string;
    revision: string;
  };
  scope: HistoryScope;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  sourceRevisionFingerprint: string;
  delivered: readonly {
    materialId: string;
    slot: CompanionMaterialSlot;
    promptCharCount: number;
    /** Hash only; it never stores the private prompt fragment itself. */
    renderedHash: string;
  }[];
  selectedMaterialIds: readonly string[];
  dropped: readonly {
    materialId: string;
    reason:
      | 'budget'
      | 'scope'
      | 'knowledge'
      | 'continuity'
      | 'cooldown'
      | 'duplicate'
      | 'not_relevant'
      | 'compiler_policy';
  }[];
  budgetChars: number;
  selectedChars: number;
  status: 'delivered' | 'skipped' | 'rejected';
  /** Delivery proves context use only, never sending, play, or truth change. */
  truthEffect: 'none';
  occurredAt: number;
}

export interface CompanionMaterialSelectionPort {
  select(request: CompanionMaterialSelectionRequest): Promise<CompanionMaterialSelection>;
}

export interface CompanionMaterialReceiptPort {
  recordDelivery(receipt: CompanionMaterialDeliveryReceipt): Promise<void>;
}

/** The only two ports a Context Compiler or ScenePlan should need. */
export interface CompanionMaterialPort extends CompanionMaterialSelectionPort, CompanionMaterialReceiptPort {}
