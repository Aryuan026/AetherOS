import type { CharacterProfile } from '../../types.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import type { CompanionMaterialSurface } from '../../domain/companionMaterial/types.ts';
import {
  BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES,
  projectCharacterBehaviorBoundaries,
  selectCharacterBehaviorBoundaries,
  validateCharacterBehaviorBoundaryRule,
  type CharacterBehaviorBoundaryProjection,
} from '../../domain/characterBehaviorBoundary/index.ts';

export interface PrepareCharacterBehaviorBoundaryInput {
  requestId: string;
  char: CharacterProfile;
  scope: HistoryScope;
  surface: CompanionMaterialSurface;
  query?: string;
  previousQuery?: string;
  semanticSignals?: readonly string[];
  routeId?: string;
  routeKind?: 'canon' | 'if' | 'alternate';
  maxResidentDirectives?: number;
  maxItems?: number;
  budgetChars?: number;
}

export const prepareCharacterBehaviorBoundaryProjection = (
  input: PrepareCharacterBehaviorBoundaryInput,
): CharacterBehaviorBoundaryProjection | null => {
  const availableRecords = [
    ...BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES,
    ...(input.char.behaviorBoundaryRules || []),
  ];
  const records = availableRecords.filter(record => (
    validateCharacterBehaviorBoundaryRule(record).length === 0
  ));
  if (records.length !== availableRecords.length) {
    console.warn(
      '[character-behavior-boundary] ignored invalid stored records',
      availableRecords.length - records.length,
    );
  }
  if (!records.length) return null;
  const selection = selectCharacterBehaviorBoundaries({
    requestId: input.requestId,
    charId: input.char.id,
    scope: input.scope,
    surface: input.surface,
    query: input.query,
    previousQuery: input.previousQuery,
    semanticSignals: input.semanticSignals,
    routeId: input.routeId,
    routeKind: input.routeKind,
    maxResidentDirectives: input.maxResidentDirectives,
    maxItems: input.maxItems,
    budgetChars: input.budgetChars,
  }, records);
  return projectCharacterBehaviorBoundaries(selection);
};
