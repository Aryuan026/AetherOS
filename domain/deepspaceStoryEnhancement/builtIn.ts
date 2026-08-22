import type { DeepspaceStoryEnhancementPack } from './types.ts';
import { XAVIER_REVIEWED_STORY_ENHANCEMENT_PACKS } from './xavierReviewed.ts';

/**
 * Filled only with reviewed built-in packages. Player-visible route packages
 * and Director-only source-ending references share the same delivery contract,
 * while the latter never enter the player library or ordinary role context.
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
  'builtin-deepspace-expansion-xavier-fate-worldlines',
  'builtin-deepspace-expansion-xavier-anomaly-governance',
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

const DIRECTOR_REFERENCE_IDS_BY_VISIBLE_ROUTE_ID = new Map<string, readonly string[]>([
  [
    'builtin-deepspace-story-xavier-ember-city-if',
    ['builtin-deepspace-story-xavier-ember-city-ending-reference'],
  ],
  [
    'builtin-deepspace-story-xavier-philos-prince-knight-if',
    ['builtin-deepspace-story-xavier-philos-ending-reference'],
  ],
]);

/**
 * Source endings are an authoring lens attached to an explicitly mounted IF
 * premise. They are not independently mountable player books and may only be
 * considered by a world_director consumer after this derivation step.
 */
export const directorReferenceEntryIdsForMountedStoryEntries = (
  mountedEntryIds: readonly string[],
): string[] => [...new Set(
  mountedEntryIds.flatMap(entryId => DIRECTOR_REFERENCE_IDS_BY_VISIBLE_ROUTE_ID.get(entryId) || []),
)];
