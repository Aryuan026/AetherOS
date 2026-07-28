import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryItem,
  type CompanionMaterialKind,
  type CompanionMaterialMode,
  type CompanionMaterialPurpose,
  type CompanionMaterialSelection,
  type CompanionMaterialSlot,
  type CompanionMaterialSurface,
} from './types.ts';
import type { CompanionMaterialSemanticProjection } from './semanticProjection.ts';

/**
 * A deliberately small, pure hand-off from selected non-verbatim material to
 * a future Context Compiler. It cannot read stores, issue calls, decide which
 * tools exist, or turn candidate material into world state.
 */
export interface CompanionMaterialPromptProjectionInput {
  /** Only an existing selector result or its slot-shaped semantic projection. */
  source: CompanionMaterialSelection | CompanionMaterialSemanticProjection;
  /** Repeated explicitly so a caller cannot silently reclassify a selection. */
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  /** A compiler may reserve a smaller budget, never enlarge the selection budget. */
  budgetChars: number;
}

export interface CompanionMaterialPromptFragment {
  materialId: string;
  slot: CompanionMaterialSlot;
  kind: CompanionMaterialKind;
  /** Non-verbatim semantic prompt guidance only; no source pointer is exposed. */
  text: string;
  renderedHash: string;
  charCount: number;
}

export interface CompanionMaterialPromptProjectionDrop {
  materialId: string;
  slot: CompanionMaterialSlot;
  reason: 'not_selected' | 'surface_ineligible' | 'duplicate' | 'budget';
}

export interface CompanionMaterialPromptProjection {
  selectionId: string;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  budgetChars: number;
  usedChars: number;
  fragments: readonly CompanionMaterialPromptFragment[];
  dropped: readonly CompanionMaterialPromptProjectionDrop[];
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const isSelection = (
  source: CompanionMaterialSelection | CompanionMaterialSemanticProjection,
): source is CompanionMaterialSelection => 'items' in source;

const itemsFromSource = (
  source: CompanionMaterialSelection | CompanionMaterialSemanticProjection,
): readonly CompanionMaterialDeliveryItem[] => {
  if (isSelection(source)) return source.items;
  return [
    ...source.stableCharacterVoice,
    ...source.stableBase.characterCanon,
    ...source.stableBase.agencyDrives,
    ...source.surfaceMaterial.relevantStableDetails,
    ...source.surfaceMaterial.openingRecipes,
    ...source.surfaceMaterial.proactiveSeeds,
    ...source.surfaceMaterial.motiveCandidates,
    ...source.surfaceMaterial.sceneAffordances,
  ];
};

const isOpeningSurface = (surface: CompanionMaterialSurface, mode: CompanionMaterialMode): boolean => (
  (surface === 'proactive_letter' && mode === 'proactive_letter')
  || (surface === 'call' && mode === 'call')
  || (surface === 'meet_scene' && mode === 'meet_scene')
  || (surface === 'date' && mode === 'date_scene')
  || (surface === 'storydesk' && mode === 'story_scene')
);

const isStoryPlanningSurface = (surface: CompanionMaterialSurface, mode: CompanionMaterialMode): boolean => (
  surface === 'storydesk' && (mode === 'story_planning' || mode === 'story_scene')
);

/**
 * Surface gating keeps proactive and scene material from quietly becoming a
 * permanent normal-chat instruction. Stable identity material remains
 * available as optional context, while situational material stays situational.
 */
const slotCanReachSurface = (params: {
  slot: CompanionMaterialSlot;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
}): boolean => {
  const { slot, surface, mode, purpose } = params;
  if (
    slot === 'stable_character_voice'
    || slot === 'stable_base'
    || slot === 'relevant_stable_details'
  ) return true;
  if (slot === 'opening_recipes') {
    return isOpeningSurface(surface, mode) && (purpose === 'opening' || purpose === 'proactive_intent');
  }
  if (slot === 'proactive_seeds') {
    return surface === 'proactive_letter' && mode === 'proactive_letter' && purpose === 'proactive_intent';
  }
  if (slot === 'motive_candidates') {
    return (
      (surface === 'proactive_letter' && mode === 'proactive_letter' && purpose === 'proactive_intent')
      || (isStoryPlanningSurface(surface, mode) && purpose === 'scene_planning')
    );
  }
  if (slot === 'scene_affordances') {
    return isStoryPlanningSurface(surface, mode) && purpose === 'scene_planning';
  }
  return false;
};

const renderGuidance = (item: CompanionMaterialDeliveryItem): string => {
  const guidance = normalize(item.guidance);
  if (item.slot === 'stable_character_voice') {
    return `- 表达方向：${guidance}`;
  }
  if (item.slot === 'stable_base' && item.kind === 'initiative_motive') {
    return `- 长期行动倾向：${guidance}`;
  }
  if (item.slot === 'stable_base') {
    return `- 稳定身份参考：${guidance}`;
  }
  if (item.slot === 'relevant_stable_details') {
    return `- 相关生活触点：${guidance}`;
  }
  if (item.slot === 'opening_recipes') {
    return `- 开场生成方向：${guidance}`;
  }
  if (item.slot === 'proactive_seeds') {
    return `- 主动联系线索：${guidance}`;
  }
  if (item.slot === 'motive_candidates') {
    return `- 行动线索候选：${guidance}`;
  }
  return `- 场景可能性：${guidance}`;
};

const assertCompatibleInput = (input: CompanionMaterialPromptProjectionInput): void => {
  const { source } = input;
  if (source.schemaVersion !== COMPANION_MATERIAL_SCHEMA_VERSION) {
    throw new Error('Unsupported companion material prompt projection schemaVersion');
  }
  if (!Number.isFinite(input.budgetChars) || input.budgetChars < 0) {
    throw new Error('Companion material prompt projection budgetChars must be non-negative and finite');
  }
  if (
    source.surface !== input.surface
    || source.mode !== input.mode
    || source.purpose !== input.purpose
  ) {
    throw new Error('Companion material prompt projection context must match its selected source');
  }
};

/**
 * Renders already-selected, non-verbatim semantic material into individually
 * auditable compiler fragments. This is intentionally side-effect free: the
 * caller may later create a receipt after genuine Context Compiler/ScenePlan
 * consumption, but this function never records one itself.
 */
export const projectCompanionMaterialPrompt = (
  input: CompanionMaterialPromptProjectionInput,
): CompanionMaterialPromptProjection => {
  assertCompatibleInput(input);
  const source = input.source;
  const budgetChars = Math.min(input.budgetChars, source.budgetChars);
  const selectedIds = new Set(source.selectedMaterialIds);
  const seen = new Set<string>();
  const fragments: CompanionMaterialPromptFragment[] = [];
  const dropped: CompanionMaterialPromptProjectionDrop[] = [];
  let usedChars = 0;

  for (const item of itemsFromSource(source)) {
    if (!selectedIds.has(item.materialId)) {
      dropped.push({ materialId: item.materialId, slot: item.slot, reason: 'not_selected' });
      continue;
    }
    if (seen.has(item.materialId)) {
      dropped.push({ materialId: item.materialId, slot: item.slot, reason: 'duplicate' });
      continue;
    }
    seen.add(item.materialId);
    if (!slotCanReachSurface({
      slot: item.slot,
      surface: input.surface,
      mode: input.mode,
      purpose: input.purpose,
    })) {
      dropped.push({ materialId: item.materialId, slot: item.slot, reason: 'surface_ineligible' });
      continue;
    }
    const text = renderGuidance(item);
    const charCount = text.length;
    if (usedChars + charCount > budgetChars) {
      dropped.push({ materialId: item.materialId, slot: item.slot, reason: 'budget' });
      continue;
    }
    fragments.push({
      materialId: item.materialId,
      slot: item.slot,
      kind: item.kind,
      text,
      renderedHash: hashText(`${source.selectionId}:${item.materialId}:${text}`),
      charCount,
    });
    usedChars += charCount;
  }

  return {
    selectionId: source.selectionId,
    surface: input.surface,
    mode: input.mode,
    purpose: input.purpose,
    budgetChars,
    usedChars,
    fragments,
    dropped,
  };
};
