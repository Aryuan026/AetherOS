import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import {
  projectCompanionMaterialPrompt,
  type CompanionMaterialPromptFragment,
  type CompanionMaterialPromptProjection,
} from '../companionMaterial/promptProjection.ts';
import type {
  CompanionMaterialDeliveryItem,
  CompanionMaterialKind,
  CompanionMaterialMode,
  CompanionMaterialPurpose,
  CompanionMaterialRouteRef,
  CompanionMaterialSelection,
  CompanionMaterialSurface,
} from '../companionMaterial/types.ts';

export interface CompanionMaterialContextFragment {
  readonly materialId: string;
  readonly kind: CompanionMaterialKind;
  /** Rendered, non-verbatim semantic guidance. Never source dialogue. */
  readonly text: string;
  readonly renderedHash: string;
  readonly charCount: number;
}

export interface CompanionMaterialContextSelectionRef {
  readonly selectionId: string;
  readonly requestId: string;
  readonly scope: Readonly<HistoryScope>;
  readonly scopeKey: string;
  readonly surface: CompanionMaterialSurface;
  readonly mode: CompanionMaterialMode;
  readonly purpose: CompanionMaterialPurpose;
  readonly routeRef?: Readonly<CompanionMaterialRouteRef>;
  readonly sourceRevisionFingerprint: string;
  readonly budgetChars: number;
  readonly selectedMaterialIds: readonly string[];
}

export interface CompanionMaterialContextProjectionRef {
  readonly selectionId: string;
  readonly requestId: string;
  readonly scope: Readonly<HistoryScope>;
  readonly scopeKey: string;
  readonly surface: CompanionMaterialSurface;
  readonly mode: CompanionMaterialMode;
  readonly purpose: CompanionMaterialPurpose;
  readonly routeRef?: Readonly<CompanionMaterialRouteRef>;
  readonly sourceRevisionFingerprint: string;
  readonly budgetChars: number;
  readonly usedChars: number;
  readonly renderedHashes: readonly {
    readonly materialId: string;
    readonly renderedHash: string;
  }[];
}

/**
 * A read-only material slice for a future Context Compiler.
 *
 * It deliberately has no current-motive, current-state, Character Life,
 * tool-policy, Narrative lifecycle, experience, or receipt field.
 */
export interface CompanionMaterialContextSlice {
  readonly stableCharacterVoice: readonly CompanionMaterialContextFragment[];
  readonly stableBase: {
    readonly characterCanon: readonly CompanionMaterialContextFragment[];
    readonly agencyDrives: readonly CompanionMaterialContextFragment[];
  };
  readonly surfaceMaterial: {
    readonly relevantStableDetails: readonly CompanionMaterialContextFragment[];
    readonly openingRecipes: readonly CompanionMaterialContextFragment[];
    readonly proactiveSeeds: readonly CompanionMaterialContextFragment[];
    readonly motiveCandidates: readonly CompanionMaterialContextFragment[];
    readonly sceneAffordances: readonly CompanionMaterialContextFragment[];
  };
  readonly sourceSelectionRef: CompanionMaterialContextSelectionRef;
  readonly sourceProjectionRef: CompanionMaterialContextProjectionRef;
}

export interface CompileCompanionMaterialContextSliceInput {
  readonly selection: CompanionMaterialSelection;
  readonly projection: CompanionMaterialPromptProjection;
}

const reject = (diagnostic: string): never => {
  throw new Error(`Companion material context slice rejected: ${diagnostic}`);
};

const isNonEmpty = (value: string): boolean => value.trim().length > 0;

const unique = (values: readonly string[]): boolean => (
  new Set(values).size === values.length
);

const sameMembers = (left: readonly string[], right: readonly string[]): boolean => (
  left.length === right.length
  && left.every(value => right.includes(value))
);

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const sameRouteRef = (
  left?: CompanionMaterialRouteRef,
  right?: CompanionMaterialRouteRef,
): boolean => (
  (!left && !right)
  || Boolean(
    left
    && right
    && left.routeId === right.routeId
    && left.branchId === right.branchId
    && left.sceneId === right.sceneId
    && left.lane === right.lane,
  )
);

const assertSelectionIntegrity = (selection: CompanionMaterialSelection): void => {
  const scopeErrors = validateHistoryScope(selection.scope);
  if (scopeErrors.length) {
    reject(`invalid exact HistoryScope: ${scopeErrors.join('; ')}`);
  }
  if (!isNonEmpty(selection.selectionId)) reject('selectionId is required');
  if (!isNonEmpty(selection.requestId)) reject('requestId is required');
  if (!isNonEmpty(selection.sourceRevisionFingerprint)) {
    reject('sourceRevisionFingerprint is required');
  }
  if (!Number.isFinite(selection.budgetChars) || selection.budgetChars < 0) {
    reject('selection budgetChars must be non-negative and finite');
  }
  if (!unique(selection.selectedMaterialIds)) {
    reject('selectedMaterialIds must be unique');
  }

  const itemIds = selection.items.map(item => item.materialId);
  if (!unique(itemIds)) reject('selection items must have unique materialIds');
  if (!sameMembers(itemIds, selection.selectedMaterialIds)) {
    reject('selection items must exactly match selectedMaterialIds');
  }

  let selectedChars = 0;
  selection.items.forEach((item, index) => {
    if (!isNonEmpty(item.materialId)) reject(`selection items[${index}].materialId is required`);
    if (!Number.isInteger(item.materialRevision) || item.materialRevision < 1) {
      reject(`selection items[${index}].materialRevision must be a positive integer`);
    }
    if (!Number.isFinite(item.estimatedChars) || item.estimatedChars < 0) {
      reject(`selection items[${index}].estimatedChars must be non-negative and finite`);
    }
    if (item.estimatedChars !== item.guidance.length) {
      reject(`selection items[${index}].estimatedChars must equal guidance length`);
    }
    selectedChars += item.estimatedChars;
  });
  if (selectedChars > selection.budgetChars) {
    reject('selected material character total exceeds selection budgetChars');
  }
};

const REMOTE_CHAT_STABLE_SLOTS = new Set<CompanionMaterialDeliveryItem['slot']>([
  'stable_character_voice',
  'stable_base',
  'relevant_stable_details',
]);

const assertNormalChatPolicy = (selection: CompanionMaterialSelection): void => {
  if (
    selection.surface !== 'chat'
    || selection.mode !== 'remote_chat'
    || selection.purpose !== 'stable_context'
  ) return;

  const situational = selection.items.filter(item => !REMOTE_CHAT_STABLE_SLOTS.has(item.slot));
  if (!situational.length) return;
  reject(
    `normal Chat selection contains situational material: ${situational
      .map(item => `${item.materialId}:${item.slot}`)
      .join(', ')}`,
  );
};

const assertProjectionContext = (
  selection: CompanionMaterialSelection,
  projection: CompanionMaterialPromptProjection,
): void => {
  if (projection.selectionId !== selection.selectionId) {
    reject('projection selectionId does not match selection');
  }
  if (projection.requestId !== selection.requestId) {
    reject('projection requestId does not match selection');
  }
  if (!sameScope(projection.scope, selection.scope)) {
    reject('projection scope does not match selection');
  }
  if (projection.surface !== selection.surface) {
    reject('projection surface does not match selection');
  }
  if (projection.mode !== selection.mode) {
    reject('projection mode does not match selection');
  }
  if (projection.purpose !== selection.purpose) {
    reject('projection purpose does not match selection');
  }
  if (!sameRouteRef(projection.routeRef, selection.routeRef)) {
    reject('projection routeRef does not match selection');
  }
  if (projection.sourceRevisionFingerprint !== selection.sourceRevisionFingerprint) {
    reject('projection sourceRevisionFingerprint does not match selection');
  }
  if (!Number.isFinite(projection.budgetChars) || projection.budgetChars < 0) {
    reject('projection budgetChars must be non-negative and finite');
  }
  if (projection.budgetChars > selection.budgetChars) {
    reject('projection budgetChars exceeds selection budgetChars');
  }
  if (!Number.isFinite(projection.usedChars) || projection.usedChars < 0) {
    reject('projection usedChars must be non-negative and finite');
  }
  if (projection.usedChars > projection.budgetChars) {
    reject('projection usedChars exceeds projection budgetChars');
  }

  const fragmentIds = projection.fragments.map(fragment => fragment.materialId);
  const droppedIds = projection.dropped.map(drop => drop.materialId);
  if (!unique(fragmentIds)) reject('projection fragments must have unique materialIds');
  if (!unique(droppedIds)) reject('projection drops must have unique materialIds');
  if (fragmentIds.some(materialId => droppedIds.includes(materialId))) {
    reject('projection cannot both render and drop one material');
  }
  if (!sameMembers([...fragmentIds, ...droppedIds], selection.selectedMaterialIds)) {
    reject('projection must account for every selected material exactly once');
  }

  const selectedById = new Map(selection.items.map(item => [item.materialId, item]));
  projection.fragments.forEach((fragment, index) => {
    const selected = selectedById.get(fragment.materialId)
      ?? reject(`projection fragments[${index}] references unselected material`);
    if (fragment.slot !== selected.slot || fragment.kind !== selected.kind) {
      reject(`projection fragments[${index}] slot/kind does not match selected material`);
    }
    if (fragment.charCount !== fragment.text.length) {
      reject(`projection fragments[${index}] charCount does not match rendered text`);
    }
    if (!isNonEmpty(fragment.renderedHash)) {
      reject(`projection fragments[${index}] renderedHash is required`);
    }
  });

  const usedChars = projection.fragments.reduce((sum, fragment) => sum + fragment.charCount, 0);
  if (projection.usedChars !== usedChars) {
    reject('projection usedChars does not match rendered fragment total');
  }
};

const assertExpectedProjection = (
  selection: CompanionMaterialSelection,
  projection: CompanionMaterialPromptProjection,
): void => {
  const expected = projectCompanionMaterialPrompt({
    source: selection,
    surface: selection.surface,
    mode: selection.mode,
    purpose: selection.purpose,
    budgetChars: projection.budgetChars,
  });

  if (expected.fragments.length !== projection.fragments.length) {
    reject('projection fragments do not match the selected material projection');
  }
  expected.fragments.forEach((expectedFragment, index) => {
    const actual = projection.fragments[index];
    if (
      actual.materialId !== expectedFragment.materialId
      || actual.slot !== expectedFragment.slot
      || actual.kind !== expectedFragment.kind
      || actual.text !== expectedFragment.text
      || actual.charCount !== expectedFragment.charCount
    ) {
      reject(`projection fragments[${index}] does not match the selected material rendering`);
    }
    if (actual.renderedHash !== expectedFragment.renderedHash) {
      reject(`projection fragments[${index}] renderedHash does not match selected material`);
    }
  });

  if (expected.dropped.length !== projection.dropped.length) {
    reject('projection drops do not match the selected material projection');
  }
  expected.dropped.forEach((expectedDrop, index) => {
    const actual = projection.dropped[index];
    if (
      actual.materialId !== expectedDrop.materialId
      || actual.slot !== expectedDrop.slot
      || actual.reason !== expectedDrop.reason
    ) {
      reject(`projection drops[${index}] does not match the selected material projection`);
    }
  });
  if (expected.usedChars !== projection.usedChars) {
    reject('projection usedChars does not match the selected material projection');
  }
};

const contextFragment = (
  fragment: CompanionMaterialPromptFragment,
): CompanionMaterialContextFragment => ({
  materialId: fragment.materialId,
  kind: fragment.kind,
  text: fragment.text,
  renderedHash: fragment.renderedHash,
  charCount: fragment.charCount,
});

/**
 * Compiles one side-effect-free material slice. Recording a delivery remains
 * the responsibility of the existing receipt port after a real consumer uses
 * the returned fragments.
 */
export const compileCompanionMaterialContextSlice = (
  input: CompileCompanionMaterialContextSliceInput,
): CompanionMaterialContextSlice => {
  const { selection, projection } = input;
  assertSelectionIntegrity(selection);
  assertNormalChatPolicy(selection);
  assertProjectionContext(selection, projection);
  assertExpectedProjection(selection, projection);

  const stableCharacterVoice: CompanionMaterialContextFragment[] = [];
  const characterCanon: CompanionMaterialContextFragment[] = [];
  const agencyDrives: CompanionMaterialContextFragment[] = [];
  const relevantStableDetails: CompanionMaterialContextFragment[] = [];
  const openingRecipes: CompanionMaterialContextFragment[] = [];
  const proactiveSeeds: CompanionMaterialContextFragment[] = [];
  const motiveCandidates: CompanionMaterialContextFragment[] = [];
  const sceneAffordances: CompanionMaterialContextFragment[] = [];

  projection.fragments.forEach(fragment => {
    const compiled = contextFragment(fragment);
    if (fragment.slot === 'stable_character_voice') stableCharacterVoice.push(compiled);
    else if (fragment.slot === 'stable_base' && fragment.kind === 'stable_detail') {
      characterCanon.push(compiled);
    } else if (fragment.slot === 'stable_base' && fragment.kind === 'initiative_motive') {
      agencyDrives.push(compiled);
    } else if (fragment.slot === 'stable_base') {
      reject(`stable_base material ${fragment.materialId} has unsupported kind ${fragment.kind}`);
    } else if (fragment.slot === 'relevant_stable_details') relevantStableDetails.push(compiled);
    else if (fragment.slot === 'opening_recipes') openingRecipes.push(compiled);
    else if (fragment.slot === 'proactive_seeds') proactiveSeeds.push(compiled);
    else if (fragment.slot === 'motive_candidates') motiveCandidates.push(compiled);
    else if (fragment.slot === 'scene_affordances') sceneAffordances.push(compiled);
  });

  return {
    stableCharacterVoice,
    stableBase: {
      characterCanon,
      agencyDrives,
    },
    surfaceMaterial: {
      relevantStableDetails,
      openingRecipes,
      proactiveSeeds,
      motiveCandidates,
      sceneAffordances,
    },
    sourceSelectionRef: {
      selectionId: selection.selectionId,
      requestId: selection.requestId,
      scope: { ...selection.scope },
      scopeKey: createHistoryScopeKey(selection.scope),
      surface: selection.surface,
      mode: selection.mode,
      purpose: selection.purpose,
      routeRef: selection.routeRef ? { ...selection.routeRef } : undefined,
      sourceRevisionFingerprint: selection.sourceRevisionFingerprint,
      budgetChars: selection.budgetChars,
      selectedMaterialIds: [...selection.selectedMaterialIds],
    },
    sourceProjectionRef: {
      selectionId: projection.selectionId,
      requestId: projection.requestId,
      scope: { ...projection.scope },
      scopeKey: createHistoryScopeKey(projection.scope),
      surface: projection.surface,
      mode: projection.mode,
      purpose: projection.purpose,
      routeRef: projection.routeRef ? { ...projection.routeRef } : undefined,
      sourceRevisionFingerprint: projection.sourceRevisionFingerprint,
      budgetChars: projection.budgetChars,
      usedChars: projection.usedChars,
      renderedHashes: projection.fragments.map(fragment => ({
        materialId: fragment.materialId,
        renderedHash: fragment.renderedHash,
      })),
    },
  };
};
