import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialKind,
  type CompanionMaterialGroundingKind,
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialRecord,
  type CompanionMaterialRenderPolicy,
  type CompanionMaterialSelectionRequest,
  type CompanionMaterialSlot,
} from './types.ts';

const isNonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const normalizedSignal = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const isSignal = (value: unknown): value is string => (
  /^[a-z0-9][a-z0-9_:-]{0,63}$/.test(normalizedSignal(value))
);

const isSha256 = (value: unknown): value is string => (
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
);

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const GROUNDING_KINDS = new Set<CompanionMaterialGroundingKind>([
  'live_user_turn',
  'call_session',
  'observed_time_gap',
  'canonical_thread_receipt',
  'external_artifact_receipt',
  'character_canon_evidence',
  'wakeup_rule',
  'character_life_receipt',
  'confirmed_user_state',
  'scene_context',
  'scene_plan',
]);

export const COMPANION_MATERIAL_SLOT_POLICY: Record<
  CompanionMaterialKind,
  ReadonlyArray<{ slot: CompanionMaterialSlot; renderPolicy: CompanionMaterialRenderPolicy }>
> = {
  language_fingerprint: [{ slot: 'stable_character_voice', renderPolicy: 'style_only' }],
  stable_detail: [
    { slot: 'stable_base', renderPolicy: 'fact_reference' },
    { slot: 'relevant_stable_details', renderPolicy: 'fact_reference' },
  ],
  initiative_motive: [
    { slot: 'stable_base', renderPolicy: 'decision_context' },
    { slot: 'motive_candidates', renderPolicy: 'decision_context' },
  ],
  opening_recipe: [{ slot: 'opening_recipes', renderPolicy: 'transform_required' }],
  proactive_seed: [{ slot: 'proactive_seeds', renderPolicy: 'transform_required' }],
  scene_affordance: [{ slot: 'scene_affordances', renderPolicy: 'decision_context' }],
};

export const companionMaterialOwnerScopeMatches = (
  record: Pick<CompanionMaterialRecord, 'ownerScope' | 'charId'>,
  requestScope: HistoryScope,
): boolean => {
  if (record.charId !== requestScope.charId) return false;
  if (record.ownerScope.kind === 'character') return record.ownerScope.charId === requestScope.charId;
  return sameScope(record.ownerScope.scope, requestScope);
};

export const materialRequiresRouteContext = (
  record: Pick<CompanionMaterialRecord, 'continuity'>,
): boolean => record.continuity === 'branch' || record.continuity === 'scene_only';

export const validateCompanionMaterialRecord = (record: CompanionMaterialRecord): string[] => {
  const errors: string[] = [];
  if (record.schemaVersion !== COMPANION_MATERIAL_SCHEMA_VERSION) errors.push('unsupported material schemaVersion');
  if (!isNonEmpty(record.id)) errors.push('material id is required');
  if (!isNonEmpty(record.charId)) errors.push('material charId is required');
  if (!isNonEmpty(record.guidance)) errors.push('material guidance is required');
  if (record.guidance.length > 360) errors.push('material guidance exceeds 360 characters');
  if (!record.eligibleModes.length) errors.push('material requires one eligible mode');
  if (!record.eligiblePurposes.length) errors.push('material requires one eligible purpose');
  if (!unique(record.eligibleModes)) errors.push('material eligibleModes must be unique');
  if (!unique(record.eligiblePurposes)) errors.push('material eligiblePurposes must be unique');
  if (!unique(record.tags)) errors.push('material tags must be unique');
  if (record.retrievalHints) {
    const hints = record.retrievalHints;
    if (!['voice_fallback', 'relevance_required'].includes(hints.activationPolicy)) {
      errors.push('material retrievalHints.activationPolicy is invalid');
    }
    if (!hints.positiveSignals.length) errors.push('material retrievalHints requires positiveSignals');
    if (!unique(hints.positiveSignals)) errors.push('material retrievalHints.positiveSignals must be unique');
    if (!hints.positiveSignals.every(isSignal)) {
      errors.push('material retrievalHints.positiveSignals must be normalized signals');
    }
    if (hints.suppressSignals && !unique(hints.suppressSignals)) {
      errors.push('material retrievalHints.suppressSignals must be unique');
    }
    if (hints.suppressSignals && !hints.suppressSignals.every(isSignal)) {
      errors.push('material retrievalHints.suppressSignals must be normalized signals');
    }
    if (hints.variationGroup !== undefined && !isSignal(hints.variationGroup)) {
      errors.push('material retrievalHints.variationGroup must be a normalized signal');
    }
    if (
      hints.fallbackPriority !== undefined
      && (!Number.isFinite(hints.fallbackPriority) || hints.fallbackPriority < 0 || hints.fallbackPriority > 100)
    ) {
      errors.push('material retrievalHints.fallbackPriority must be between 0 and 100');
    }
  }
  if (record.groundingPolicy) {
    const { allOf = [], anyOf = [] } = record.groundingPolicy;
    if (!allOf.length && !anyOf.length) {
      errors.push('material groundingPolicy requires allOf or anyOf');
    }
    const requirementKey = (item: typeof allOf[number]): string => [
      item.kind,
      normalizedSignal(item.claimKey),
      item.refId || '',
      item.revision || '',
      item.issuerId || '',
      item.authorityDigest || '',
    ].join(':');
    const allOfKeys = allOf.map(requirementKey);
    const anyOfKeys = anyOf.map(requirementKey);
    if (!unique(allOfKeys)) errors.push('material groundingPolicy.allOf must be unique');
    if (!unique(anyOfKeys)) errors.push('material groundingPolicy.anyOf must be unique');
    if (!allOf.every(item => GROUNDING_KINDS.has(item.kind) && isSignal(item.claimKey))) {
      errors.push('material groundingPolicy.allOf contains an invalid kind');
    }
    if (!anyOf.every(item => GROUNDING_KINDS.has(item.kind) && isSignal(item.claimKey))) {
      errors.push('material groundingPolicy.anyOf contains an invalid kind');
    }
    if (new Set(anyOf.map(item => item.kind)).size > 1) {
      errors.push('material groundingPolicy.anyOf cannot mix authority kinds');
    }
    [...allOf, ...anyOf].forEach((item, index) => {
      const exactFields = [
        item.refId,
        item.revision,
        item.issuerId,
        item.authorityDigest,
      ];
      const exactCount = exactFields.filter(value => value !== undefined).length;
      if (exactCount !== 0 && exactCount !== exactFields.length) {
        errors.push(`material groundingPolicy requirement[${index}] exact authority binding is incomplete`);
      }
      if (item.refId !== undefined && !isNonEmpty(item.refId)) {
        errors.push(`material groundingPolicy requirement[${index}].refId is invalid`);
      }
      if (item.revision !== undefined && (!Number.isInteger(item.revision) || item.revision < 1)) {
        errors.push(`material groundingPolicy requirement[${index}].revision is invalid`);
      }
      if (item.issuerId !== undefined && !isNonEmpty(item.issuerId)) {
        errors.push(`material groundingPolicy requirement[${index}].issuerId is invalid`);
      }
      if (item.authorityDigest !== undefined && !isSha256(item.authorityDigest)) {
        errors.push(`material groundingPolicy requirement[${index}].authorityDigest is invalid`);
      }
    });
  }
  if (record.promotionAuthority) {
    const binding = record.promotionAuthority;
    if (![
      'character_canon_review',
      'canonical_thread_or_artifact',
      'director_scene_plan',
      'director_motive',
    ].includes(binding.authorityKind)) {
      errors.push('material promotionAuthority.authorityKind is invalid');
    }
    if (!isNonEmpty(binding.receiptId)) errors.push('material promotionAuthority.receiptId is required');
    if (!Number.isInteger(binding.receiptRevision) || binding.receiptRevision < 1) {
      errors.push('material promotionAuthority.receiptRevision is invalid');
    }
    if (!isSha256(binding.receiptDigest)) {
      errors.push('material promotionAuthority.receiptDigest is invalid');
    }
    if (!isNonEmpty(binding.issuerId)) errors.push('material promotionAuthority.issuerId is required');
    const exactRequirements = [
      ...(record.groundingPolicy?.allOf || []),
      ...(record.groundingPolicy?.anyOf || []),
    ].filter(item => (
      item.refId === binding.receiptId
      && item.revision === binding.receiptRevision
      && item.issuerId === binding.issuerId
      && item.authorityDigest === binding.receiptDigest
    ));
    if (exactRequirements.length !== 1) {
      errors.push('material promotionAuthority must bind exactly one grounding requirement');
    }
  }
  if (!record.sourceRefs.length) errors.push('material requires a private source reference');
  if (!Number.isInteger(record.revision) || record.revision < 1) errors.push('material revision must be a positive integer');
  if (!Number.isFinite(record.createdAt) || !Number.isFinite(record.updatedAt)) errors.push('material timestamps must be finite');
  if (record.cooldownMs !== undefined && (!Number.isFinite(record.cooldownMs) || record.cooldownMs < 0)) {
    errors.push('material cooldownMs must be a non-negative finite number');
  }
  if (record.maxDeliveries !== undefined && (!Number.isInteger(record.maxDeliveries) || record.maxDeliveries < 1)) {
    errors.push('material maxDeliveries must be a positive integer');
  }

  if (record.ownerScope.kind === 'character') {
    if (record.ownerScope.charId !== record.charId) errors.push('character-owned material must match record charId');
  } else {
    errors.push(...validateHistoryScope(record.ownerScope.scope).map(error => `owner scope: ${error}`));
    if (record.ownerScope.scope.charId !== record.charId) errors.push('relationship-owned material must match scoped charId');
  }

  const permitted = COMPANION_MATERIAL_SLOT_POLICY[record.kind] || [];
  if (!permitted.some(item => item.slot === record.slot && item.renderPolicy === record.renderPolicy)) {
    errors.push('material kind, slot, and renderPolicy are incompatible');
  }
  if (record.continuity === 'branch' && !isNonEmpty(record.branchId)) errors.push('branch material requires branchId');
  if (record.routeLane !== undefined && !['mainline', 'if_line'].includes(record.routeLane)) {
    errors.push('material routeLane is invalid');
  }
  if (
    record.routeLane !== undefined
    && (!isNonEmpty(record.routeId) || !isNonEmpty(record.branchId))
  ) {
    errors.push('material routeLane requires routeId and branchId');
  }
  if (record.continuity === 'scene_only' && (!isNonEmpty(record.branchId) || !isNonEmpty(record.sceneId))) {
    errors.push('scene-only material requires branchId and sceneId');
  }

  record.sourceRefs.forEach((sourceRef, index) => {
    if (!isNonEmpty(sourceRef.storeFamily)) errors.push(`sourceRefs[${index}].storeFamily is required`);
    if (!isNonEmpty(sourceRef.recordId)) errors.push(`sourceRefs[${index}].recordId is required`);
    if (!Number.isInteger(sourceRef.revision) || sourceRef.revision < 1) errors.push(`sourceRefs[${index}].revision is invalid`);
    if (!isNonEmpty(sourceRef.sourceFingerprint)) errors.push(`sourceRefs[${index}].sourceFingerprint is required`);
    if (sourceRef.sourceLocator && sourceRef.sourceLocator.length > 180) errors.push(`sourceRefs[${index}].sourceLocator is too long`);
  });

  return errors;
};

export const assertValidCompanionMaterialRecord = (record: CompanionMaterialRecord): void => {
  const errors = validateCompanionMaterialRecord(record);
  if (errors.length) throw new Error(`Invalid companion material ${record.id || '(unknown)'}: ${errors.join('; ')}`);
};

export const validateCompanionMaterialSelectionRequest = (
  request: CompanionMaterialSelectionRequest,
): string[] => {
  const errors = [...validateHistoryScope(request.scope)];
  if (request.schemaVersion !== COMPANION_MATERIAL_SCHEMA_VERSION) errors.push('unsupported material selection schemaVersion');
  if (!isNonEmpty(request.requestId)) errors.push('material selection requestId is required');
  if (!Number.isFinite(request.now)) errors.push('material selection now must be finite');
  if (!Number.isInteger(request.maxItems) || request.maxItems < 1) errors.push('material selection maxItems must be a positive integer');
  if (!Number.isFinite(request.budgetChars) || request.budgetChars < 0) errors.push('material selection budgetChars must be non-negative');
  if (!['unknown', 'new', 'familiar', 'close'].includes(request.relationshipStage)) {
    errors.push('material selection relationshipStage is invalid');
  }
  if (request.routeRef && (!isNonEmpty(request.routeRef.routeId) || !isNonEmpty(request.routeRef.branchId))) {
    errors.push('material routeRef requires routeId and branchId');
  }
  if (request.routeRef && !['mainline', 'if_line'].includes(request.routeRef.lane)) {
    errors.push('material routeRef lane is invalid');
  }
  if (request.semanticTags && (!unique(request.semanticTags) || !request.semanticTags.every(isSignal))) {
    errors.push('material selection semanticTags must be unique normalized signals');
  }
  if (request.contextTags && (!unique(request.contextTags) || !request.contextTags.every(isSignal))) {
    errors.push('material selection contextTags must be unique normalized signals');
  }
  if (request.groundingRefs) {
    const groundingKeys = request.groundingRefs.map(ref => (
      `${ref.kind}:${normalizedSignal(ref.claimKey)}:${ref.refId}:${ref.revision}`
    ));
    if (!unique(groundingKeys)) errors.push('material selection groundingRefs must be unique');
    request.groundingRefs.forEach((ref, index) => {
      if (!GROUNDING_KINDS.has(ref.kind)) {
        errors.push(`material selection groundingRefs[${index}].kind is invalid`);
      }
      if (!isSignal(ref.claimKey)) {
        errors.push(`material selection groundingRefs[${index}].claimKey is invalid`);
      }
      if (!isNonEmpty(ref.refId)) {
        errors.push(`material selection groundingRefs[${index}].refId is required`);
      }
      if (!Number.isInteger(ref.revision) || ref.revision < 1) {
        errors.push(`material selection groundingRefs[${index}].revision must be a positive integer`);
      }
      if (ref.issuerId !== undefined && !isNonEmpty(ref.issuerId)) {
        errors.push(`material selection groundingRefs[${index}].issuerId is invalid`);
      }
      if (ref.authorityDigest !== undefined && !isSha256(ref.authorityDigest)) {
        errors.push(`material selection groundingRefs[${index}].authorityDigest is invalid`);
      }
      if ((ref.issuerId === undefined) !== (ref.authorityDigest === undefined)) {
        errors.push(`material selection groundingRefs[${index}] authority binding is incomplete`);
      }
      errors.push(...validateHistoryScope(ref.scope).map(error => (
        `material selection groundingRefs[${index}].scope: ${error}`
      )));
      if (!sameScope(ref.scope, request.scope)) {
        errors.push(`material selection groundingRefs[${index}] must match request scope`);
      }
      if (!Number.isFinite(ref.occurredAt)) {
        errors.push(`material selection groundingRefs[${index}].occurredAt must be finite`);
      }
      if (Number.isFinite(ref.occurredAt) && ref.occurredAt > request.now) {
        errors.push(`material selection groundingRefs[${index}].occurredAt is in the future`);
      }
      if (ref.validUntil !== undefined && !Number.isFinite(ref.validUntil)) {
        errors.push(`material selection groundingRefs[${index}].validUntil must be finite`);
      }
      if (ref.validUntil !== undefined && ref.validUntil < ref.occurredAt) {
        errors.push(`material selection groundingRefs[${index}].validUntil precedes occurredAt`);
      }
    });
  }
  if (request.semanticRank) {
    if (!isNonEmpty(request.semanticRank.manifestId)) errors.push('material semanticRank manifestId is required');
    if (!isNonEmpty(request.semanticRank.manifestDigest)) errors.push('material semanticRank manifestDigest is required');
    if (request.semanticRank.backend !== 'embedding') errors.push('material semanticRank backend is invalid');
    if (!isNonEmpty(request.semanticRank.modelId)) errors.push('material semanticRank modelId is required');
    if (!isNonEmpty(request.semanticRank.modelArtifactDigest)) errors.push('material semanticRank modelArtifactDigest is required');
    if (!Number.isInteger(request.semanticRank.dimensions) || request.semanticRank.dimensions < 1) {
      errors.push('material semanticRank dimensions must be a positive integer');
    }
    if (!['cosine', 'dot_product'].includes(request.semanticRank.metric)) {
      errors.push('material semanticRank metric is invalid');
    }
    if (typeof request.semanticRank.normalized !== 'boolean') {
      errors.push('material semanticRank normalized is required');
    }
    if (!isNonEmpty(request.semanticRank.projectionVersion)) errors.push('material semanticRank projectionVersion is required');
    if (!isNonEmpty(request.semanticRank.calibrationRevision)) errors.push('material semanticRank calibrationRevision is required');
    if (
      !Number.isFinite(request.semanticRank.strongThreshold)
      || request.semanticRank.strongThreshold <= 0
      || request.semanticRank.strongThreshold > 1
    ) {
      errors.push('material semanticRank strongThreshold must be greater than 0 and at most 1');
    }
    if (!isNonEmpty(request.semanticRank.indexRevision)) errors.push('material semanticRank indexRevision is required');
    if (!isNonEmpty(request.semanticRank.scopeKey)) errors.push('material semanticRank scopeKey is required');
    if (!isNonEmpty(request.semanticRank.materialSetFingerprint)) {
      errors.push('material semanticRank materialSetFingerprint is required');
    }
    const ids = request.semanticRank.scores.map(item => item.materialId);
    if (!unique(ids)) errors.push('material semanticRank material ids must be unique');
    request.semanticRank.scores.forEach((item, index) => {
      if (!isNonEmpty(item.materialId)) errors.push(`material semanticRank.scores[${index}].materialId is required`);
      if (!Number.isFinite(item.score) || item.score < 0 || item.score > 1) {
        errors.push(`material semanticRank.scores[${index}].score must be between 0 and 1`);
      }
    });
  }
  return errors;
};

export const assertValidCompanionMaterialSelectionRequest = (
  request: CompanionMaterialSelectionRequest,
): void => {
  const errors = validateCompanionMaterialSelectionRequest(request);
  if (errors.length) throw new Error(`Invalid companion material selection: ${errors.join('; ')}`);
};

/**
 * A receipt proves only that an already-selected, non-verbatim material reached
 * a named compiler/plan/prompt consumer. It is deliberately not a send, play,
 * memory, or truth receipt.
 */
export const validateCompanionMaterialDeliveryReceipt = (
  receipt: CompanionMaterialDeliveryReceipt,
): string[] => {
  const errors = [...validateHistoryScope(receipt.scope)];
  if (receipt.schemaVersion !== COMPANION_MATERIAL_SCHEMA_VERSION) {
    errors.push('unsupported companion material delivery receipt schemaVersion');
  }
  if (!isNonEmpty(receipt.id)) errors.push('delivery receipt id is required');
  if (!isNonEmpty(receipt.selectionId)) errors.push('delivery receipt selectionId is required');
  if (!isNonEmpty(receipt.sourceRevisionFingerprint)) errors.push('delivery receipt sourceRevisionFingerprint is required');
  if (!isNonEmpty(receipt.consumerRef?.id)) errors.push('delivery receipt consumerRef.id is required');
  if (!isNonEmpty(receipt.consumerRef?.revision)) errors.push('delivery receipt consumerRef.revision is required');
  if (!['semantic_context', 'scene_plan', 'prompt'].includes(receipt.consumerRef?.kind)) {
    errors.push('delivery receipt consumerRef.kind is invalid');
  }
  if (!['delivered', 'skipped', 'rejected'].includes(receipt.status)) {
    errors.push('delivery receipt status is invalid');
  }
  if (receipt.routeRef && (!isNonEmpty(receipt.routeRef.routeId) || !isNonEmpty(receipt.routeRef.branchId))) {
    errors.push('delivery receipt routeRef requires routeId and branchId');
  }
  if (receipt.routeRef && !['mainline', 'if_line'].includes(receipt.routeRef.lane)) {
    errors.push('delivery receipt routeRef lane is invalid');
  }
  if (receipt.truthEffect !== 'none') errors.push('delivery receipt truthEffect must be none');
  if (!Number.isFinite(receipt.budgetChars) || receipt.budgetChars < 0) {
    errors.push('delivery receipt budgetChars must be non-negative and finite');
  }
  if (!Number.isFinite(receipt.selectedChars) || receipt.selectedChars < 0) {
    errors.push('delivery receipt selectedChars must be non-negative and finite');
  }
  if (receipt.selectedChars > receipt.budgetChars) {
    errors.push('delivery receipt selectedChars must not exceed budgetChars');
  }
  if (!Number.isFinite(receipt.occurredAt)) errors.push('delivery receipt occurredAt must be finite');
  if (!unique(receipt.selectedMaterialIds)) errors.push('delivery receipt selectedMaterialIds must be unique');

  const selectedIds = new Set(receipt.selectedMaterialIds);
  const deliveredIds = receipt.delivered.map(item => item.materialId);
  const droppedIds = receipt.dropped.map(item => item.materialId);
  if (!unique(deliveredIds)) errors.push('delivery receipt delivered material ids must be unique');
  if (!unique(droppedIds)) errors.push('delivery receipt dropped material ids must be unique');

  receipt.delivered.forEach((item, index) => {
    if (!selectedIds.has(item.materialId)) errors.push(`delivery receipt delivered[${index}] references unselected material`);
    if (!Number.isInteger(item.materialRevision) || item.materialRevision < 1) {
      errors.push(`delivery receipt delivered[${index}].materialRevision must be a positive integer`);
    }
    if (!isNonEmpty(item.renderedHash)) errors.push(`delivery receipt delivered[${index}].renderedHash is required`);
    if (!Number.isFinite(item.promptCharCount) || item.promptCharCount < 0) {
      errors.push(`delivery receipt delivered[${index}].promptCharCount must be non-negative and finite`);
    }
  });
  receipt.dropped.forEach((item, index) => {
    if (!selectedIds.has(item.materialId)) errors.push(`delivery receipt dropped[${index}] references unselected material`);
  });
  if (deliveredIds.some(id => droppedIds.includes(id))) {
    errors.push('delivery receipt material cannot be both delivered and dropped');
  }

  const actualSelectedChars = receipt.delivered.reduce((sum, item) => sum + item.promptCharCount, 0);
  if (actualSelectedChars !== receipt.selectedChars) {
    errors.push('delivery receipt selectedChars must equal delivered promptCharCount total');
  }
  if (receipt.status === 'delivered' && !receipt.delivered.length) {
    errors.push('delivered receipt requires at least one delivered material');
  }
  if ((receipt.status === 'skipped' || receipt.status === 'rejected') && receipt.delivered.length) {
    errors.push('skipped or rejected receipt cannot contain delivered material');
  }

  return errors;
};

export const assertValidCompanionMaterialDeliveryReceipt = (
  receipt: CompanionMaterialDeliveryReceipt,
): void => {
  const errors = validateCompanionMaterialDeliveryReceipt(receipt);
  if (errors.length) throw new Error(`Invalid companion material delivery receipt ${receipt.id || '(unknown)'}: ${errors.join('; ')}`);
};

export const companionMaterialScopeKey = (scope: HistoryScope): string => createHistoryScopeKey(scope);
