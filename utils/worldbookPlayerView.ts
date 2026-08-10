import type { CharacterProfile, Worldbook, WorldGrowthCandidate } from '../types.ts';
import { getActiveWorldbookRevision, isWorldbookPublished } from '../domain/worldbook/index.ts';
import { isBuiltInWorldbook, isWorldbookGroupEnabledForCharacter } from './worldbookGroups.ts';

/** Author UI deliberately excludes Director-only material from DOM, counts, and search. */
export const isWorldbookVisibleInPlayerLibrary = (entry: Worldbook): boolean => (
  getActiveWorldbookRevision(entry).knowledgePolicy.kind !== 'director_only'
);

export const listPlayerVisibleWorldbooks = (
  entries: readonly Worldbook[],
): Worldbook[] => entries.filter(isWorldbookVisibleInPlayerLibrary);

export type WorldbookSupplementLinkView =
  | { status: 'none'; parents: []; invalidParentIds: [] }
  | { status: 'linked'; parents: Worldbook[]; invalidParentIds: [] }
  | { status: 'needs_repair'; parents: []; invalidParentIds: string[] };

/**
 * Supplement links are explicit entry IDs. Missing IDs and links to another
 * player entry fail closed so the author UI never guesses a replacement.
 */
export const resolveWorldbookSupplementLinks = (
  entry: Worldbook,
  playerVisibleLibrary: readonly Worldbook[],
): WorldbookSupplementLinkView => {
  const parentIds = [...new Set(
    getActiveWorldbookRevision(entry).supplementsEntryIds || [],
  )];
  if (!parentIds.length) return { status: 'none', parents: [], invalidParentIds: [] };

  const byId = new Map(playerVisibleLibrary.map(book => [book.id, book]));
  const parents = parentIds.map(parentId => byId.get(parentId));
  const invalidParentIds = parentIds.filter((parentId, index) => {
    const parent = parents[index];
    return !parent || !(parent.isBuiltIn || parent.lockEditing);
  });
  if (invalidParentIds.length) {
    return { status: 'needs_repair', parents: [], invalidParentIds };
  }
  return {
    status: 'linked',
    parents: parents as Worldbook[],
    invalidParentIds: [],
  };
};

export const isGrowthCandidateVisibleToPlayer = (candidate: WorldGrowthCandidate): boolean => (
  ['pending', 'deferred'].includes(candidate.status)
  && candidate.draft.knowledgePolicy.kind !== 'director_only'
);

export const splitWorldbookWorkspace = (input: {
  entries: readonly Worldbook[];
  candidates: readonly WorldGrowthCandidate[];
}) => ({
  published: input.entries.filter(entry => (
    isWorldbookPublished(entry) && isWorldbookVisibleInPlayerLibrary(entry)
  )),
  archived: input.entries.filter(entry => (
    !isWorldbookPublished(entry) && isWorldbookVisibleInPlayerLibrary(entry)
  )),
  growthCandidates: input.candidates.filter(isGrowthCandidateVisibleToPlayer),
});

export const worldbookMountedCharacterNames = (
  entry: Worldbook,
  characters: readonly CharacterProfile[],
): string[] => characters
  .filter(character => (
    isBuiltInWorldbook(entry)
      ? character.mountedWorldbooks?.some(mounted => mounted.id === entry.id)
      : isWorldbookGroupEnabledForCharacter(entry.group, character)
  ))
  .map(character => character.name.trim())
  .filter(Boolean);

export const worldbookMountCount = (
  entry: Worldbook,
  characters: readonly CharacterProfile[],
): number => worldbookMountedCharacterNames(entry, characters).length;

export const worldGrowthSourceLabel = (candidate: WorldGrowthCandidate): string => {
  if (candidate.source.kind === 'narrative') {
    return candidate.source.lane === 'mainline'
      ? '主线故事'
      : 'IF 线故事';
  }
  return candidate.source.kind === 'import' ? '导入资料' : '我的补充';
};

export const worldGrowthBatchKey = (candidate: WorldGrowthCandidate): string => {
  if (candidate.source.kind === 'narrative') {
    return `${candidate.source.lane}:${candidate.source.routeId}:${candidate.source.branchId || ''}:${candidate.source.refId}`;
  }
  return `${candidate.source.kind}:${candidate.source.refId}`;
};
