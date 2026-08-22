import type { DeepspaceStoryEnhancementPack } from './types.ts';
import { XAVIER_REVIEWED_STORY_ENHANCEMENT_PACKS } from './xavierReviewed.ts';

/**
 * Filled only with reviewed, player-visible built-in packages. Keeping the
 * registry here lets all five leads share one delivery contract while their
 * source review can finish independently.
 */
export const BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS: readonly DeepspaceStoryEnhancementPack[] = [
  ...XAVIER_REVIEWED_STORY_ENHANCEMENT_PACKS,
];

/**
 * Old code-owned aggregate books retired as leads move to independent routes.
 * These IDs are migration inputs only: they must never be treated as aliases
 * for every replacement route or auto-mount the new packages.
 */
export const DEPRECATED_BUILT_IN_DEEPSPACE_STORY_ENTRY_IDS = [
  'builtin-deepspace-story-xavier',
] as const;

export const BUILT_IN_DEEPSPACE_STORY_ENTRY_IDS = new Set(
  BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.map(pack => pack.worldbookEntryId),
);

const packByEntryId = new Map(
  BUILT_IN_DEEPSPACE_STORY_ENHANCEMENT_PACKS.map(pack => [pack.worldbookEntryId, pack]),
);

export const builtInStoryEnhancementPackForEntry = (
  worldbookEntryId: string,
): DeepspaceStoryEnhancementPack | undefined => packByEntryId.get(worldbookEntryId);
