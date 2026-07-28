import {
  compileCompanionMaterialContextSlice,
} from '../contextCompiler/companionMaterialContext.ts';
import {
  createCompanionMaterialDeliveryReceipt,
} from '../companionMaterial/deliveryReceipt.ts';
import type {
  CompanionMaterialDeliveryReceipt,
  CompanionMaterialKind,
  CompanionMaterialRouteRef,
  CompanionMaterialSelection,
  CompanionMaterialSlot,
} from '../companionMaterial/types.ts';
import type {
  CompanionMaterialPromptProjection,
  CompanionMaterialPromptProjectionDrop,
} from '../companionMaterial/promptProjection.ts';
import {
  validateHistoryScope,
} from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import type {
  NarrativeDirectorContext,
  NarrativeDirectorReadOnly,
} from './directorContext.ts';

export const SCENE_PLAN_SCHEMA_VERSION = 1 as const;

export type ScenePlanStatus = 'proposed' | 'accepted';
export type ScenePlanTargetSurface = 'storydesk' | 'date' | 'meet';

/**
 * A plan may describe no event, a current situation backed by canonical
 * evidence, or an explicitly future proposal. None of the three is a played
 * NarrativeScene or an experience receipt.
 */
export type ScenePlanTemporalClaim =
  | 'non_event'
  | 'grounded_current'
  | 'proposed_future';

/**
 * These are references into code-owned evidence families. Stable identity,
 * worldbook prose, and companion material are intentionally absent.
 */
export type ScenePlanCanonicalEvidenceKind =
  | 'live_interaction_fact'
  | 'character_life_fact'
  | 'active_narrative_fact'
  | 'confirmed_experience_fact'
  | 'accepted_surface_proposal';

export interface ScenePlanCanonicalEvidenceRef {
  readonly id: string;
  readonly scope: Readonly<HistoryScope>;
  readonly kind: ScenePlanCanonicalEvidenceKind;
  readonly canonicalFactRef: string;
  readonly revision: number;
  readonly observedAt: number;
}

/**
 * The verifier is injected by the owner of the canonical evidence family.
 * ScenePlan cannot self-authorize a model-written reference. The verifier must
 * also reject stale revisions.
 */
export interface ScenePlanCanonicalEvidenceVerifier {
  verify(input: {
    readonly ref: Readonly<ScenePlanCanonicalEvidenceRef>;
    readonly scope: Readonly<HistoryScope>;
    readonly targetSurface: ScenePlanTargetSurface;
    readonly routeRef?: Readonly<CompanionMaterialRouteRef>;
  }): boolean;
}

export interface ScenePlanCharacterLifeSnapshotRef {
  readonly evidenceRefId: string;
  readonly snapshotId: string;
  readonly revision: number;
  readonly asOf: number;
}

/**
 * Entering/accepting a Date or Meet proposal is planning evidence only. It
 * still is not proof that the embodied scene was played.
 */
export interface ScenePlanSurfaceProposalRef {
  readonly evidenceRefId: string;
  readonly surface: 'date' | 'meet';
  readonly sessionId: string;
  readonly proposalId: string;
  readonly revision: number;
  readonly acceptedAt: number;
}

export interface ScenePlanCurrentMotive {
  readonly id: string;
  readonly summary: string;
  /** Every current motive needs one or more verifier-approved canonical facts. */
  readonly evidenceRefIds: readonly string[];
  /**
   * Optional material rationale. These ids must point to delivered and adopted
   * motive_candidates; material can shape a decision but never prove it.
   */
  readonly rationaleMaterialIds: readonly string[];
}

export interface ScenePlanMaterialSelectionRef {
  readonly selectionId: string;
  readonly requestId: string;
  readonly scope: Readonly<HistoryScope>;
  readonly surface: 'storydesk';
  readonly mode: 'story_planning' | 'story_scene';
  readonly purpose: 'scene_planning';
  readonly routeRef?: Readonly<CompanionMaterialRouteRef>;
  readonly sourceRevisionFingerprint: string;
  readonly selectionBudgetChars: number;
  readonly projectionBudgetChars: number;
  readonly projectionUsedChars: number;
}

/**
 * This ref proves which rendered guidance reached the plan. It deliberately
 * contains no private sourceRefs, guidance text, or raw historical dialogue.
 */
export interface ScenePlanMaterialRef {
  readonly materialId: string;
  readonly materialRevision: number;
  readonly slot: CompanionMaterialSlot;
  readonly kind: CompanionMaterialKind;
  readonly renderedHash: string;
  readonly promptCharCount: number;
}

export interface ScenePlanCompanionMaterialInput {
  readonly selection: CompanionMaterialSelection;
  readonly projection: CompanionMaterialPromptProjection;
  /** Rendered fragments actually exposed to this ScenePlan revision. */
  readonly deliveredMaterialIds: readonly string[];
  /** A non-exclusive subset actually adopted as planning rationale. */
  readonly rationaleMaterialIds: readonly string[];
}

export interface ScenePlan {
  readonly schemaVersion: typeof SCENE_PLAN_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly scope: Readonly<HistoryScope>;
  readonly targetSurface: ScenePlanTargetSurface;
  readonly status: ScenePlanStatus;
  readonly temporalClaim: ScenePlanTemporalClaim;
  readonly summary: string;
  readonly routeRef?: Readonly<CompanionMaterialRouteRef>;
  readonly evidenceRefs: readonly ScenePlanCanonicalEvidenceRef[];
  readonly lifeSnapshotRef?: ScenePlanCharacterLifeSnapshotRef;
  readonly surfaceProposalRef?: ScenePlanSurfaceProposalRef;
  readonly currentMotives: readonly ScenePlanCurrentMotive[];
  readonly materialSelectionRef?: ScenePlanMaterialSelectionRef;
  readonly deliveredMaterialRefs: readonly ScenePlanMaterialRef[];
  readonly rationaleMaterialRefs: readonly ScenePlanMaterialRef[];
  /**
   * Acceptance means the plan revision may be consumed. It never promotes the
   * plan to world truth, Character Life, or played narrative experience.
   */
  readonly truthEffect: 'none';
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly acceptedAt?: number;
}

export interface CreateScenePlanInput {
  readonly id: string;
  readonly scope: HistoryScope;
  readonly targetSurface: ScenePlanTargetSurface;
  readonly temporalClaim: ScenePlanTemporalClaim;
  readonly summary: string;
  readonly routeRef?: CompanionMaterialRouteRef;
  readonly evidenceRefs?: readonly ScenePlanCanonicalEvidenceRef[];
  readonly lifeSnapshotRef?: ScenePlanCharacterLifeSnapshotRef;
  readonly surfaceProposalRef?: ScenePlanSurfaceProposalRef;
  readonly currentMotives?: readonly ScenePlanCurrentMotive[];
  readonly companionMaterial?: ScenePlanCompanionMaterialInput;
  readonly directorContext: NarrativeDirectorContext;
  readonly evidenceVerifier?: ScenePlanCanonicalEvidenceVerifier;
}

export interface AcceptScenePlanInput {
  readonly plan: ScenePlan;
  readonly expectedRevision: number;
  readonly directorContext: NarrativeDirectorContext;
  readonly evidenceVerifier?: ScenePlanCanonicalEvidenceVerifier;
  /**
   * Required again when the proposal used material, so acceptance rechecks the
   * exact active revisions and rendered hashes instead of trusting saved ids.
   */
  readonly companionMaterial?: Pick<
    ScenePlanCompanionMaterialInput,
    'selection' | 'projection'
  >;
}

type MaterialSnapshot = Pick<
  ScenePlan,
  'materialSelectionRef' | 'deliveredMaterialRefs' | 'rationaleMaterialRefs'
>;

const reject = (diagnostic: string): never => {
  throw new Error(`ScenePlan rejected: ${diagnostic}`);
};
const isNonEmpty = (value: string): boolean => value.trim().length > 0;

const unique = (values: readonly string[]): boolean => (
  new Set(values).size === values.length
);

const sameScope = (
  left: Readonly<HistoryScope>,
  right: Readonly<HistoryScope>,
): boolean => (
  left.progressBundleId === right.progressBundleId
  && left.personaMaskId === right.personaMaskId
  && left.charId === right.charId
);

const sameRouteRef = (
  left?: Readonly<CompanionMaterialRouteRef>,
  right?: Readonly<CompanionMaterialRouteRef>,
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

const assertScope = (
  actual: Readonly<HistoryScope>,
  expected: Readonly<HistoryScope>,
  label: string,
): void => {
  const scopeErrors = validateHistoryScope(actual);
  if (scopeErrors.length) reject(`${label} has invalid HistoryScope: ${scopeErrors.join('; ')}`);
  if (!sameScope(actual, expected)) reject(`${label} crosses exact HistoryScope`);
};

const assertRouteRef = (
  routeRef: Readonly<CompanionMaterialRouteRef> | undefined,
  label: string,
): void => {
  if (!routeRef) return;
  if (!isNonEmpty(routeRef.routeId) || !isNonEmpty(routeRef.branchId)) {
    reject(`${label} requires routeId and branchId`);
  }
  if (!['mainline', 'if_line'].includes(routeRef.lane)) {
    reject(`${label}.lane is invalid`);
  }
  if (routeRef.sceneId !== undefined && !isNonEmpty(routeRef.sceneId)) {
    reject(`${label}.sceneId must not be empty`);
  }
};

const assertDirectorContext = (
  context: NarrativeDirectorContext,
  scope: Readonly<HistoryScope>,
  routeRef: Readonly<CompanionMaterialRouteRef> | undefined,
  temporalClaim: ScenePlanTemporalClaim,
): void => {
  assertScope(context.scope, scope, 'directorContext.scope');
  assertScope(context.currentTruth.scope, scope, 'directorContext.currentTruth.scope');

  if (temporalClaim !== 'grounded_current' || !routeRef) return;

  const activeRun = context.currentTruth.activeRun
    ?? reject('grounded_current routeRef requires an active NarrativeRun');
  if (
    activeRun.routeId !== routeRef.routeId
    || activeRun.branchId !== routeRef.branchId
    || activeRun.lane !== routeRef.lane
  ) {
    reject('grounded_current routeRef does not match the active NarrativeRun');
  }

  if (routeRef.sceneId) {
    const activeScene = context.currentTruth.activeScene;
    if (
      !activeScene
      || activeScene.id !== routeRef.sceneId
      || activeScene.runId !== activeRun.id
    ) {
      reject('grounded_current sceneId does not match the active NarrativeScene');
    }
  }
};

const assertFiniteTimestamp = (value: number, label: string): void => {
  if (!Number.isFinite(value)) reject(`${label} must be finite`);
};

const assertEvidence = (params: {
  scope: Readonly<HistoryScope>;
  targetSurface: ScenePlanTargetSurface;
  routeRef?: Readonly<CompanionMaterialRouteRef>;
  temporalClaim: ScenePlanTemporalClaim;
  evidenceRefs: readonly ScenePlanCanonicalEvidenceRef[];
  lifeSnapshotRef?: ScenePlanCharacterLifeSnapshotRef;
  surfaceProposalRef?: ScenePlanSurfaceProposalRef;
  currentMotives: readonly ScenePlanCurrentMotive[];
  verifier?: ScenePlanCanonicalEvidenceVerifier;
}): void => {
  const {
    scope,
    targetSurface,
    routeRef,
    temporalClaim,
    evidenceRefs,
    lifeSnapshotRef,
    surfaceProposalRef,
    currentMotives,
    verifier,
  } = params;

  const evidenceIds = evidenceRefs.map(ref => ref.id);
  if (!unique(evidenceIds)) reject('evidenceRefs ids must be unique');

  const evidenceById = new Map<string, ScenePlanCanonicalEvidenceRef>();
  if (evidenceRefs.length && !verifier) {
    reject('canonical evidence requires an injected verifier');
  }
  evidenceRefs.forEach((ref, index) => {
    if (!isNonEmpty(ref.id)) reject(`evidenceRefs[${index}].id is required`);
    if (!isNonEmpty(ref.canonicalFactRef)) {
      reject(`evidenceRefs[${index}].canonicalFactRef is required`);
    }
    if (![
      'live_interaction_fact',
      'character_life_fact',
      'active_narrative_fact',
      'confirmed_experience_fact',
      'accepted_surface_proposal',
    ].includes(ref.kind)) {
      reject(`evidenceRefs[${index}].kind is not a canonical ScenePlan evidence kind`);
    }
    if (!Number.isInteger(ref.revision) || ref.revision < 1) {
      reject(`evidenceRefs[${index}].revision must be a positive integer`);
    }
    assertFiniteTimestamp(ref.observedAt, `evidenceRefs[${index}].observedAt`);
    assertScope(ref.scope, scope, `evidenceRefs[${index}].scope`);
    if (!verifier?.verify({ ref, scope, targetSurface, routeRef })) {
      reject(`evidenceRefs[${index}] is not an active canonical revision`);
    }
    evidenceById.set(ref.id, ref);
  });

  if (temporalClaim === 'grounded_current' && evidenceRefs.length === 0) {
    reject('grounded_current requires canonical evidence');
  }
  if (temporalClaim !== 'grounded_current' && currentMotives.length > 0) {
    reject('currentMotives are allowed only for grounded_current plans');
  }

  if (lifeSnapshotRef) {
    if (!isNonEmpty(lifeSnapshotRef.snapshotId)) reject('lifeSnapshotRef.snapshotId is required');
    if (!Number.isInteger(lifeSnapshotRef.revision) || lifeSnapshotRef.revision < 1) {
      reject('lifeSnapshotRef.revision must be a positive integer');
    }
    assertFiniteTimestamp(lifeSnapshotRef.asOf, 'lifeSnapshotRef.asOf');
    const evidence = evidenceById.get(lifeSnapshotRef.evidenceRefId);
    if (
      !evidence
      || evidence.kind !== 'character_life_fact'
      || evidence.canonicalFactRef !== lifeSnapshotRef.snapshotId
      || evidence.revision !== lifeSnapshotRef.revision
    ) {
      reject('lifeSnapshotRef must bind one verified character_life_fact revision');
    }
  }

  if (surfaceProposalRef) {
    if (surfaceProposalRef.surface !== targetSurface) {
      reject('surfaceProposalRef.surface must match the ScenePlan targetSurface');
    }
    if (!isNonEmpty(surfaceProposalRef.sessionId) || !isNonEmpty(surfaceProposalRef.proposalId)) {
      reject('surfaceProposalRef requires sessionId and proposalId');
    }
    if (!Number.isInteger(surfaceProposalRef.revision) || surfaceProposalRef.revision < 1) {
      reject('surfaceProposalRef.revision must be a positive integer');
    }
    assertFiniteTimestamp(surfaceProposalRef.acceptedAt, 'surfaceProposalRef.acceptedAt');
    const evidence = evidenceById.get(surfaceProposalRef.evidenceRefId);
    if (
      !evidence
      || evidence.kind !== 'accepted_surface_proposal'
      || evidence.canonicalFactRef !== surfaceProposalRef.proposalId
      || evidence.revision !== surfaceProposalRef.revision
    ) {
      reject('surfaceProposalRef must bind one verified accepted_surface_proposal revision');
    }
  }

  const motiveIds = currentMotives.map(motive => motive.id);
  if (!unique(motiveIds)) reject('currentMotives ids must be unique');
  currentMotives.forEach((motive, index) => {
    if (!isNonEmpty(motive.id) || !isNonEmpty(motive.summary)) {
      reject(`currentMotives[${index}] requires id and summary`);
    }
    if (!motive.evidenceRefIds.length || !unique(motive.evidenceRefIds)) {
      reject(`currentMotives[${index}] requires unique canonical evidenceRefIds`);
    }
    motive.evidenceRefIds.forEach(refId => {
      if (!evidenceById.has(refId)) {
        reject(`currentMotives[${index}] references missing canonical evidence ${refId}`);
      }
    });
    if (!unique(motive.rationaleMaterialIds)) {
      reject(`currentMotives[${index}].rationaleMaterialIds must be unique`);
    }
  });
};

const projectionDropReason = (
  reason: CompanionMaterialPromptProjectionDrop['reason'],
): CompanionMaterialDeliveryReceipt['dropped'][number]['reason'] => {
  if (reason === 'budget') return 'budget';
  if (reason === 'duplicate') return 'duplicate';
  return 'compiler_policy';
};

const buildMaterialSnapshot = (params: {
  scope: Readonly<HistoryScope>;
  routeRef?: Readonly<CompanionMaterialRouteRef>;
  input?: ScenePlanCompanionMaterialInput;
}): MaterialSnapshot => {
  const { input } = params;
  if (!input) {
    return {
      materialSelectionRef: undefined,
      deliveredMaterialRefs: [],
      rationaleMaterialRefs: [],
    };
  }

  const { selection, projection } = input;
  compileCompanionMaterialContextSlice({ selection, projection });

  assertScope(selection.scope, params.scope, 'companionMaterial.selection.scope');
  if (
    selection.surface !== 'storydesk'
    || !['story_planning', 'story_scene'].includes(selection.mode)
    || selection.purpose !== 'scene_planning'
  ) {
    reject('ScenePlan material must come from storydesk scene_planning selection');
  }
  if (!sameRouteRef(selection.routeRef, params.routeRef)) {
    reject('companion material routeRef does not match ScenePlan routeRef');
  }

  assertRouteRef(selection.routeRef, 'companionMaterial.selection.routeRef');
  if (!unique(input.deliveredMaterialIds)) {
    reject('deliveredMaterialIds must be unique');
  }
  if (!unique(input.rationaleMaterialIds)) {
    reject('rationaleMaterialIds must be unique');
  }

  const projectionById = new Map(
    projection.fragments.map(fragment => [fragment.materialId, fragment]),
  );
  const selectedById = new Map(
    selection.items.map(item => [item.materialId, item]),
  );

  const materialRef = (materialId: string, label: string): ScenePlanMaterialRef => {
    const fragment = projectionById.get(materialId)
      ?? reject(`${label} references material not rendered for this selection`);
    const selected = selectedById.get(materialId)
      ?? reject(`${label} references unselected material`);
    if (
      (selected.routeId && selected.routeId !== params.routeRef?.routeId)
      || (selected.branchId && selected.branchId !== params.routeRef?.branchId)
      || (selected.sceneId && selected.sceneId !== params.routeRef?.sceneId)
    ) {
      reject(`${label} crosses the ScenePlan routeRef`);
    }
    return {
      materialId,
      materialRevision: selected.materialRevision,
      slot: selected.slot,
      kind: selected.kind,
      renderedHash: fragment.renderedHash,
      promptCharCount: fragment.charCount,
    };
  };

  const deliveredMaterialRefs = input.deliveredMaterialIds.map((materialId, index) => (
    materialRef(materialId, `deliveredMaterialIds[${index}]`)
  ));
  const deliveredIds = new Set(input.deliveredMaterialIds);
  const rationaleMaterialRefs = input.rationaleMaterialIds.map((materialId, index) => {
    if (!deliveredIds.has(materialId)) {
      reject(`rationaleMaterialIds[${index}] was not delivered to this ScenePlan`);
    }
    return materialRef(materialId, `rationaleMaterialIds[${index}]`);
  });

  return {
    materialSelectionRef: {
      selectionId: selection.selectionId,
      requestId: selection.requestId,
      scope: { ...selection.scope },
      surface: 'storydesk',
      mode: selection.mode as 'story_planning' | 'story_scene',
      purpose: 'scene_planning',
      routeRef: selection.routeRef ? { ...selection.routeRef } : undefined,
      sourceRevisionFingerprint: selection.sourceRevisionFingerprint,
      selectionBudgetChars: selection.budgetChars,
      projectionBudgetChars: projection.budgetChars,
      projectionUsedChars: projection.usedChars,
    },
    deliveredMaterialRefs,
    rationaleMaterialRefs,
  };
};

const assertMotiveMaterialAuthority = (params: {
  currentMotives: readonly ScenePlanCurrentMotive[];
  rationaleMaterialRefs: readonly ScenePlanMaterialRef[];
}): void => {
  const rationaleById = new Map(
    params.rationaleMaterialRefs.map(ref => [ref.materialId, ref]),
  );
  params.currentMotives.forEach((motive, index) => {
    motive.rationaleMaterialIds.forEach(materialId => {
      const ref = rationaleById.get(materialId);
      if (!ref || ref.slot !== 'motive_candidates') {
        reject(
          `currentMotives[${index}] material ${materialId} must be an adopted motive_candidate`,
        );
      }
    });
  });
};

const sameMaterialRef = (
  left: Readonly<ScenePlanMaterialRef>,
  right: Readonly<ScenePlanMaterialRef>,
): boolean => (
  left.materialId === right.materialId
  && left.materialRevision === right.materialRevision
  && left.slot === right.slot
  && left.kind === right.kind
  && left.renderedHash === right.renderedHash
  && left.promptCharCount === right.promptCharCount
);

const assertMaterialSnapshotMatchesPlan = (
  plan: ScenePlan,
  snapshot: MaterialSnapshot,
): void => {
  const expectedRef = plan.materialSelectionRef;
  const actualRef = snapshot.materialSelectionRef;
  if (
    Boolean(expectedRef) !== Boolean(actualRef)
    || (
      expectedRef
      && actualRef
      && (
        expectedRef.selectionId !== actualRef.selectionId
        || expectedRef.requestId !== actualRef.requestId
        || !sameScope(expectedRef.scope, actualRef.scope)
        || expectedRef.surface !== actualRef.surface
        || expectedRef.mode !== actualRef.mode
        || expectedRef.purpose !== actualRef.purpose
        || !sameRouteRef(expectedRef.routeRef, actualRef.routeRef)
        || expectedRef.sourceRevisionFingerprint !== actualRef.sourceRevisionFingerprint
        || expectedRef.selectionBudgetChars !== actualRef.selectionBudgetChars
        || expectedRef.projectionBudgetChars !== actualRef.projectionBudgetChars
        || expectedRef.projectionUsedChars !== actualRef.projectionUsedChars
      )
    )
  ) {
    reject('companion material selection/projection changed before ScenePlan acceptance');
  }

  if (
    plan.deliveredMaterialRefs.length !== snapshot.deliveredMaterialRefs.length
    || plan.deliveredMaterialRefs.some((ref, index) => (
      !sameMaterialRef(ref, snapshot.deliveredMaterialRefs[index])
    ))
  ) {
    reject('delivered material revisions or rendered hashes changed before acceptance');
  }
  if (
    plan.rationaleMaterialRefs.length !== snapshot.rationaleMaterialRefs.length
    || plan.rationaleMaterialRefs.some((ref, index) => (
      !sameMaterialRef(ref, snapshot.rationaleMaterialRefs[index])
    ))
  ) {
    reject('rationale material refs changed before ScenePlan acceptance');
  }
};

const assertPlanCore = (params: {
  id: string;
  scope: Readonly<HistoryScope>;
  targetSurface: ScenePlanTargetSurface;
  temporalClaim: ScenePlanTemporalClaim;
  summary: string;
  routeRef?: Readonly<CompanionMaterialRouteRef>;
  evidenceRefs: readonly ScenePlanCanonicalEvidenceRef[];
  lifeSnapshotRef?: ScenePlanCharacterLifeSnapshotRef;
  surfaceProposalRef?: ScenePlanSurfaceProposalRef;
  currentMotives: readonly ScenePlanCurrentMotive[];
  directorContext: NarrativeDirectorContext;
  evidenceVerifier?: ScenePlanCanonicalEvidenceVerifier;
  materialSnapshot: MaterialSnapshot;
}): void => {
  if (!isNonEmpty(params.id)) reject('id is required');
  if (!isNonEmpty(params.summary)) reject('summary is required');
  if (!['storydesk', 'date', 'meet'].includes(params.targetSurface)) {
    reject('targetSurface is invalid');
  }
  if (!['non_event', 'grounded_current', 'proposed_future'].includes(params.temporalClaim)) {
    reject('temporalClaim is invalid');
  }
  const scopeErrors = validateHistoryScope(params.scope);
  if (scopeErrors.length) reject(`invalid exact HistoryScope: ${scopeErrors.join('; ')}`);
  assertRouteRef(params.routeRef, 'routeRef');
  assertDirectorContext(
    params.directorContext,
    params.scope,
    params.routeRef,
    params.temporalClaim,
  );
  assertEvidence({
    scope: params.scope,
    targetSurface: params.targetSurface,
    routeRef: params.routeRef,
    temporalClaim: params.temporalClaim,
    evidenceRefs: params.evidenceRefs,
    lifeSnapshotRef: params.lifeSnapshotRef,
    surfaceProposalRef: params.surfaceProposalRef,
    currentMotives: params.currentMotives,
    verifier: params.evidenceVerifier,
  });
  assertMotiveMaterialAuthority({
    currentMotives: params.currentMotives,
    rationaleMaterialRefs: params.materialSnapshot.rationaleMaterialRefs,
  });
};

const clone = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const deepFreeze = <T>(value: T): NarrativeDirectorReadOnly<T> => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as NarrativeDirectorReadOnly<T>;
  }
  Object.values(value as Record<string, unknown>).forEach(entry => deepFreeze(entry));
  return Object.freeze(value) as NarrativeDirectorReadOnly<T>;
};

/** Creates one non-truth proposal. It performs no store or receipt write. */
export const createScenePlan = (
  input: CreateScenePlanInput,
  createdAt = Date.now(),
): ScenePlan => {
  assertFiniteTimestamp(createdAt, 'createdAt');
  const evidenceRefs = input.evidenceRefs ?? [];
  const currentMotives = input.currentMotives ?? [];
  const materialSnapshot = buildMaterialSnapshot({
    scope: input.scope,
    routeRef: input.routeRef,
    input: input.companionMaterial,
  });

  assertPlanCore({
    ...input,
    evidenceRefs,
    currentMotives,
    materialSnapshot,
  });

  return deepFreeze(clone({
    schemaVersion: SCENE_PLAN_SCHEMA_VERSION,
    id: input.id,
    revision: 1,
    scope: { ...input.scope },
    targetSurface: input.targetSurface,
    status: 'proposed' as const,
    temporalClaim: input.temporalClaim,
    summary: input.summary,
    routeRef: input.routeRef ? { ...input.routeRef } : undefined,
    evidenceRefs,
    lifeSnapshotRef: input.lifeSnapshotRef,
    surfaceProposalRef: input.surfaceProposalRef,
    currentMotives,
    materialSelectionRef: materialSnapshot.materialSelectionRef,
    deliveredMaterialRefs: materialSnapshot.deliveredMaterialRefs,
    rationaleMaterialRefs: materialSnapshot.rationaleMaterialRefs,
    truthEffect: 'none' as const,
    createdAt,
    updatedAt: createdAt,
  })) as ScenePlan;
};

/**
 * Accepts one exact proposal revision. Acceptance still creates no scene,
 * run, experience receipt, memory, Character Life state, or material receipt.
 */
export const acceptScenePlan = (
  input: AcceptScenePlanInput,
  acceptedAt = Date.now(),
): ScenePlan => {
  const { plan } = input;
  assertFiniteTimestamp(acceptedAt, 'acceptedAt');
  if (plan.schemaVersion !== SCENE_PLAN_SCHEMA_VERSION) {
    reject('unsupported schemaVersion');
  }
  if (plan.status !== 'proposed') reject('only a proposed ScenePlan can be accepted');
  if (plan.truthEffect !== 'none') reject('ScenePlan truthEffect must remain none');
  if (!Number.isInteger(plan.revision) || plan.revision < 1) {
    reject('ScenePlan revision must be a positive integer');
  }
  assertFiniteTimestamp(plan.createdAt, 'plan.createdAt');
  assertFiniteTimestamp(plan.updatedAt, 'plan.updatedAt');
  if (plan.updatedAt < plan.createdAt) reject('plan.updatedAt cannot precede createdAt');
  if (plan.acceptedAt !== undefined) reject('proposed ScenePlan cannot already have acceptedAt');
  if (plan.revision !== input.expectedRevision) {
    reject('expectedRevision does not match the proposed ScenePlan');
  }
  if (acceptedAt < plan.createdAt) reject('acceptedAt cannot precede createdAt');
  if (plan.materialSelectionRef && !input.companionMaterial) {
    reject('material-backed ScenePlan acceptance requires the original selection and projection');
  }

  const materialSnapshot = buildMaterialSnapshot({
    scope: plan.scope,
    routeRef: plan.routeRef,
    input: plan.materialSelectionRef
      ? {
          ...input.companionMaterial!,
          deliveredMaterialIds: plan.deliveredMaterialRefs.map(ref => ref.materialId),
          rationaleMaterialIds: plan.rationaleMaterialRefs.map(ref => ref.materialId),
        }
      : undefined,
  });
  if (!plan.materialSelectionRef && input.companionMaterial) {
    reject('acceptance cannot add companion material to an existing ScenePlan revision');
  }
  assertMaterialSnapshotMatchesPlan(plan, materialSnapshot);

  assertPlanCore({
    id: plan.id,
    scope: plan.scope,
    targetSurface: plan.targetSurface,
    temporalClaim: plan.temporalClaim,
    summary: plan.summary,
    routeRef: plan.routeRef,
    evidenceRefs: plan.evidenceRefs,
    lifeSnapshotRef: plan.lifeSnapshotRef,
    surfaceProposalRef: plan.surfaceProposalRef,
    currentMotives: plan.currentMotives,
    directorContext: input.directorContext,
    evidenceVerifier: input.evidenceVerifier,
    materialSnapshot,
  });

  return deepFreeze(clone({
    ...plan,
    revision: plan.revision + 1,
    status: 'accepted' as const,
    truthEffect: 'none' as const,
    updatedAt: acceptedAt,
    acceptedAt,
  })) as ScenePlan;
};

/**
 * Constructs (but never persists) the material delivery receipt only after
 * the exact ScenePlan revision has been accepted. A material-NONE plan has no
 * delivery to receipt and must not call this function.
 */
export const createAcceptedScenePlanCompanionMaterialReceipt = (input: {
  readonly plan: ScenePlan;
  readonly selection: CompanionMaterialSelection;
  readonly projection: CompanionMaterialPromptProjection;
  readonly occurredAt?: number;
}): CompanionMaterialDeliveryReceipt => {
  const { plan, selection, projection } = input;
  if (plan.status !== 'accepted' || !Number.isFinite(plan.acceptedAt)) {
    reject('companion material receipt requires an accepted ScenePlan');
  }
  if (!plan.deliveredMaterialRefs.length || !plan.materialSelectionRef) {
    reject('material-NONE ScenePlan has no companion material delivery to receipt');
  }
  const occurredAt = input.occurredAt ?? Date.now();
  assertFiniteTimestamp(occurredAt, 'receipt occurredAt');
  if (occurredAt < plan.acceptedAt!) {
    reject('material receipt cannot precede ScenePlan acceptance');
  }

  const snapshot = buildMaterialSnapshot({
    scope: plan.scope,
    routeRef: plan.routeRef,
    input: {
      selection,
      projection,
      deliveredMaterialIds: plan.deliveredMaterialRefs.map(ref => ref.materialId),
      rationaleMaterialIds: plan.rationaleMaterialRefs.map(ref => ref.materialId),
    },
  });
  assertMaterialSnapshotMatchesPlan(plan, snapshot);

  const deliveredIds = new Set(plan.deliveredMaterialRefs.map(ref => ref.materialId));
  const projectionDropById = new Map(
    projection.dropped.map(drop => [drop.materialId, drop.reason]),
  );
  const dropped = selection.selectedMaterialIds.flatMap(materialId => {
    if (deliveredIds.has(materialId)) return [];
    const projectionReason = projectionDropById.get(materialId);
    return [{
      materialId,
      reason: projectionReason
        ? projectionDropReason(projectionReason)
        : 'compiler_policy' as const,
    }];
  });

  return createCompanionMaterialDeliveryReceipt({
    selection,
    consumerRef: {
      kind: 'scene_plan',
      id: plan.id,
      revision: String(plan.revision),
    },
    delivered: plan.deliveredMaterialRefs.map(ref => ({
      materialId: ref.materialId,
      promptCharCount: ref.promptCharCount,
      renderedHash: ref.renderedHash,
    })),
    dropped,
    status: 'delivered',
    occurredAt,
  });
};
