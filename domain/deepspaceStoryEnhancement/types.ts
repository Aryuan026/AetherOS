import type { UserDeepSpaceIdentityMode } from '../../types.ts';
import type { WorldbookProjectionConsumerKind } from '../worldbook/types.ts';

export const DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION = 1 as const;

export type DeepspaceStorySourceLane =
  | 'mainline'
  | 'if_line'
  | 'card_story'
  | 'anecdote'
  | 'event'
  | 'world_expansion';

export type DeepspaceStoryContentAuthority =
  | 'human_source_compilation'
  | 'reviewed_source_projection'
  | 'human_world_expansion';

export type DeepspaceStoryEvidenceStrength =
  | 'human_authority'
  | 'reviewed_multi_source'
  | 'reviewed_single_source'
  | 'unresolved';

export interface DeepspaceStoryRuntimeGate {
  /** Provider surfaces that may receive this mounted Worldbook entry. */
  allowedConsumers: readonly WorldbookProjectionConsumerKind[];
  /** Missing identity context fails closed when this list is present. */
  identityModes?: readonly UserDeepSpaceIdentityMode[];
  /** Missing relationship-stage evidence fails closed when this list is present. */
  relationshipStageIds?: readonly string[];
}

/**
 * Code-owned delivery policy for one built-in story Worldbook.
 *
 * The Worldbook revision remains the only prose/fact owner. This record only
 * describes where an explicitly mounted package is eligible to travel; it is
 * not a second story database and never turns source material into current
 * state, motive, memory, or a player-lived experience.
 */
export interface DeepspaceStoryEnhancementPack {
  schemaVersion: typeof DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION;
  id: string;
  worldbookEntryId: string;
  charId: string;
  sourceLane: DeepspaceStorySourceLane;
  worldlineId: string;
  routeStage: string;
  contentAuthority: DeepspaceStoryContentAuthority;
  evidenceStrength: DeepspaceStoryEvidenceStrength;
  runtimeGate: DeepspaceStoryRuntimeGate;
  activation: 'explicit_opt_in';
  defaultMounted: false;
  truthEffect: 'none';
  mergePolicy: 'additive_not_rewrite';
  prohibitedInferences: readonly string[];
  unresolvedClaims: readonly string[];
  sourceRefIds: readonly string[];
}

export interface DeepspaceStoryRuntimeContext {
  identityMode?: UserDeepSpaceIdentityMode;
  relationshipStageIds?: readonly string[];
}
