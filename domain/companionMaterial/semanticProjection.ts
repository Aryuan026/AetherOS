import type {
  CompanionMaterialDeliveryItem,
  CompanionMaterialMode,
  CompanionMaterialPurpose,
  CompanionMaterialRouteRef,
  CompanionMaterialSelection,
  CompanionMaterialSurface,
} from './types.ts';
import type { HistoryScope } from '../historyImport/types.ts';

/**
 * A slot-shaped view for the future Context Compiler. It is intentionally a
 * projection of selected material, not a mutable world-state object: in
 * particular it has no `currentMotives` field. Director/ScenePlan owns that
 * field after weighing current route, life, and confirmed relationship facts.
 */
export interface CompanionMaterialSemanticProjection {
  schemaVersion: CompanionMaterialSelection['schemaVersion'];
  selectionId: string;
  requestId: string;
  scope: HistoryScope;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  routeRef?: CompanionMaterialRouteRef;
  sourceRevisionFingerprint: string;
  budgetChars: number;
  stableCharacterVoice: readonly CompanionMaterialDeliveryItem[];
  stableBase: {
    characterCanon: readonly CompanionMaterialDeliveryItem[];
    agencyDrives: readonly CompanionMaterialDeliveryItem[];
  };
  surfaceMaterial: {
    openingRecipes: readonly CompanionMaterialDeliveryItem[];
    relevantStableDetails: readonly CompanionMaterialDeliveryItem[];
    sceneAffordances: readonly CompanionMaterialDeliveryItem[];
    motiveCandidates: readonly CompanionMaterialDeliveryItem[];
    proactiveSeeds: readonly CompanionMaterialDeliveryItem[];
  };
  selectedMaterialIds: readonly string[];
  warnings: readonly string[];
}

export const projectCompanionMaterialSelection = (
  selection: CompanionMaterialSelection,
): CompanionMaterialSemanticProjection => {
  const stableBase = selection.items.filter(item => item.slot === 'stable_base');
  return {
    schemaVersion: selection.schemaVersion,
    selectionId: selection.selectionId,
    requestId: selection.requestId,
    scope: { ...selection.scope },
    surface: selection.surface,
    mode: selection.mode,
    purpose: selection.purpose,
    routeRef: selection.routeRef ? { ...selection.routeRef } : undefined,
    sourceRevisionFingerprint: selection.sourceRevisionFingerprint,
    budgetChars: selection.budgetChars,
    stableCharacterVoice: selection.items.filter(item => item.slot === 'stable_character_voice'),
    stableBase: {
      characterCanon: stableBase.filter(item => item.kind === 'stable_detail'),
      agencyDrives: stableBase.filter(item => item.kind === 'initiative_motive'),
    },
    surfaceMaterial: {
      openingRecipes: selection.items.filter(item => item.slot === 'opening_recipes'),
      relevantStableDetails: selection.items.filter(item => item.slot === 'relevant_stable_details'),
      sceneAffordances: selection.items.filter(item => item.slot === 'scene_affordances'),
      motiveCandidates: selection.items.filter(item => item.slot === 'motive_candidates'),
      proactiveSeeds: selection.items.filter(item => item.slot === 'proactive_seeds'),
    },
    selectedMaterialIds: selection.selectedMaterialIds,
    warnings: selection.warnings,
  };
};
