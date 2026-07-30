import type { CompanionMaterialSurface } from '../companionMaterial/types.ts';
import type { HistoryScope } from '../historyImport/types.ts';

export const CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION = 1 as const;

export type CharacterBehaviorBoundaryAuthority =
  | 'built_in_source_review'
  | 'player_authored';

export type CharacterBehaviorBoundaryPlayerInputMode =
  | 'direct_instruction'
  | 'guided';

export type CharacterBehaviorBoundaryVisibility =
  | 'runtime_internal'
  | 'player_authored';

export type CharacterBehaviorBoundaryStrength = 'soft' | 'firm';

export type CharacterBehaviorBoundaryKind =
  | 'interaction_pattern'
  | 'embodied_habit'
  | 'wardrobe_or_prop'
  | 'space_behavior'
  | 'routine_detail'
  | 'route_stage';

export type CharacterBehaviorBoundaryActivation =
  | 'relevance_required'
  | 'resident';

export type CharacterBehaviorBoundaryRoutePolicy =
  | { kind: 'all_routes' }
  | { kind: 'canon_only' }
  | { kind: 'route_allowlist'; routeIds: readonly string[] };

export type CharacterBehaviorBoundaryOwnerScope =
  | { kind: 'character'; charId: string }
  | { kind: 'relationship'; scope: Readonly<HistoryScope> };

export interface CharacterBehaviorBoundarySource {
  authority: CharacterBehaviorBoundaryAuthority;
  /**
   * How a player-authored rule entered the system. Direct instructions remain
   * verbatim; guided notes are projected from the structured human fields.
   */
  playerInputMode?: CharacterBehaviorBoundaryPlayerInputMode;
  /** Human-authored records never carry private evidence references. */
  sourcePackId?: string;
  sourceRefs?: readonly string[];
  evidenceStrength?: 'repeated_reviewed' | 'cross_source_reviewed' | 'player_confirmed';
}

export interface CharacterBehaviorBoundaryRetrievalHints {
  activationPolicy: CharacterBehaviorBoundaryActivation;
  positiveSignals: readonly string[];
  triggerKeywords: readonly string[];
  suppressSignals?: readonly string[];
  priority?: number;
}

/**
 * One lightweight character-behavior calibration.
 *
 * It is not a memory, current state, relationship fact, tool policy, fixed
 * reply template, or a raw negative-prompt fragment.
 */
export interface CharacterBehaviorBoundaryRule {
  schemaVersion: typeof CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION;
  id: string;
  charId: string;
  ownerScope: CharacterBehaviorBoundaryOwnerScope;
  visibility: CharacterBehaviorBoundaryVisibility;
  source: CharacterBehaviorBoundarySource;
  kind: CharacterBehaviorBoundaryKind;
  enabled: boolean;
  revision: number;
  title: string;
  /**
   * Exact player-authored instruction. Present only for direct_instruction
   * records and never rewritten by the behavior-boundary pipeline.
   */
  directInstruction?: string;
  trigger: string;
  /** A concise mismatch pattern. Runtime never renders this by itself. */
  mismatchPattern: string;
  /**
   * Interaction rules need multiple exits. Scene-specific micro boundaries may
   * carry one continuity anchor because the rest of the scene stays free.
   */
  preferredAlternatives: readonly string[];
  exceptions: readonly string[];
  surfaces: readonly CompanionMaterialSurface[];
  routePolicy: CharacterBehaviorBoundaryRoutePolicy;
  strength: CharacterBehaviorBoundaryStrength;
  retrieval: CharacterBehaviorBoundaryRetrievalHints;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterBehaviorBoundarySelectionRequest {
  requestId: string;
  charId: string;
  scope: Readonly<HistoryScope>;
  surface: CompanionMaterialSurface;
  query?: string;
  previousQuery?: string;
  semanticSignals?: readonly string[];
  routeId?: string;
  routeKind?: 'canon' | 'if' | 'alternate';
  /**
   * Direct resident instructions have their own small quota so they are not
   * silently displaced by the contextual 1–2 item calibration budget.
   */
  maxResidentDirectives?: number;
  maxItems?: number;
  budgetChars?: number;
}

export interface CharacterBehaviorBoundarySelectionItem {
  rule: CharacterBehaviorBoundaryRule;
  matchedSignals: readonly string[];
  matchedKeywords: readonly string[];
  score: number;
  estimatedChars: number;
}

export interface CharacterBehaviorBoundarySelection {
  requestId: string;
  scope: Readonly<HistoryScope>;
  charId: string;
  surface: CompanionMaterialSurface;
  selected: readonly CharacterBehaviorBoundarySelectionItem[];
  droppedRuleIds: readonly string[];
  usedChars: number;
  budgetChars: number;
}

export interface CharacterBehaviorBoundaryProjection {
  schemaVersion: typeof CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION;
  /** Parallel advisory slot; never merged into memory, state, motive, or tools. */
  semanticSlot: 'behavior_calibration';
  requestId: string;
  scope: Readonly<HistoryScope>;
  charId: string;
  surface: CompanionMaterialSurface;
  selectedRuleIds: readonly string[];
  containsPlayerAuthored: boolean;
  /**
   * Only a player-authored interaction rule may replace the generic
   * interaction-quality hint. A scene micro detail (for example clothing)
   * must not silence an unrelated refusal/care boundary.
   */
  containsPlayerAuthoredInteractionPattern: boolean;
  containsBuiltInSource: boolean;
  renderedHash: string;
  markdown: string;
  charCount: number;
  truthEffect: 'none';
  currentStateEffect: 'none';
  memoryEffect: 'none';
  toolPolicyEffect: 'none';
  expressionEffect: 'advisory';
}
