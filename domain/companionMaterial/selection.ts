import {
  assertValidCompanionMaterialSelectionRequest,
  companionMaterialOwnerScopeMatches,
  materialRequiresRouteContext,
} from './contract.ts';
import {
  companionMaterialLexicalSimilarity,
  queryFeaturesForCompanionMaterialRequest,
  tokenizeCompanionMaterialText,
  type CompanionMaterialQueryFeatures,
} from './retrieval.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryItem,
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialRecord,
  type CompanionMaterialRetrievalHints,
  type CompanionMaterialSelection,
  type CompanionMaterialSelectionRequest,
  type CompanionMaterialSlotLimits,
  type CompanionMaterialSlot,
} from './types.ts';

const SLOT_LIMITS: Record<CompanionMaterialSlot, number> = {
  stable_character_voice: 2,
  stable_base: 1,
  relevant_stable_details: 1,
  motive_candidates: 2,
  opening_recipes: 1,
  proactive_seeds: 1,
  scene_affordances: 2,
};

const relationshipStageRank: Record<CompanionMaterialSelectionRequest['relationshipStage'], number> = {
  unknown: 0,
  new: 1,
  familiar: 2,
  close: 3,
};

const normalize = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeGuidanceForExactDedupe = (value: string): string => (
  value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
);

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const stableNoise = (requestId: string, materialId: string): number => {
  const hash = Number.parseInt(hashText(`${requestId}:${materialId}`), 36);
  return Number.isFinite(hash) ? (hash % 997) / 9970 : 0;
};

const sourceRevisionFingerprint = (records: readonly CompanionMaterialRecord[]): string => hashText(
  records
    .map(record => `${record.id}:${record.revision}:${record.sourceRefs.map(ref => ref.sourceFingerprint).join(',')}`)
    .sort()
    .join('|'),
);

const exactOwnerScopeKey = (record: CompanionMaterialRecord): string => (
  record.ownerScope.kind === 'character'
    ? `character:${record.ownerScope.charId}`
    : [
        'relationship',
        record.ownerScope.scope.progressBundleId,
        record.ownerScope.scope.personaMaskId,
        record.ownerScope.scope.charId,
      ].join(':')
);

const equivalentEvidenceKey = (record: CompanionMaterialRecord): string => (
  record.sourceRefs
    .map(sourceRef => {
      const locator = normalize(sourceRef.sourceLocator).replace(/^\d+\/\d+:/, '');
      return locator
        ? `${sourceRef.storeFamily}:locator:${locator}`
        : [
            sourceRef.storeFamily,
            sourceRef.recordId,
            sourceRef.revision,
            sourceRef.sourceFingerprint,
          ].join(':');
    })
    .sort()
    .join('|')
);

/**
 * This is deliberately narrower than semantic similarity. It removes only a
 * mirrored asset from the same exact owner scope, slot, evidence and runtime
 * use. Re-analysis may still keep a different interpretation, branch/scene
 * affordance, or eligible purpose over the same historical span.
 */
const exactTurnDuplicateKey = (record: CompanionMaterialRecord): string => [
  exactOwnerScopeKey(record),
  record.slot,
  record.kind,
  normalizeGuidanceForExactDedupe(record.guidance),
  equivalentEvidenceKey(record),
  record.renderPolicy,
  record.continuity,
  record.routeId || '',
  record.branchId || '',
  record.sceneId || '',
  [...record.eligibleModes].sort().join(','),
  [...record.eligiblePurposes].sort().join(','),
].join('::');

const routeMatches = (
  record: CompanionMaterialRecord,
  request: CompanionMaterialSelectionRequest,
): boolean => {
  if (!materialRequiresRouteContext(record)) return true;
  if (!request.routeRef) return false;
  if (record.routeId && record.routeId !== request.routeRef.routeId) return false;
  if (record.branchId && record.branchId !== request.routeRef.branchId) return false;
  if (record.continuity === 'scene_only' && record.sceneId !== request.routeRef.sceneId) return false;
  return true;
};

const wasDelivered = (
  materialId: string,
  receipts: readonly CompanionMaterialDeliveryReceipt[],
): CompanionMaterialDeliveryReceipt[] => receipts.filter(receipt => (
  receipt.status === 'delivered'
  && receipt.delivered.some(item => item.materialId === materialId)
));

const materialAvailable = (params: {
  record: CompanionMaterialRecord;
  request: CompanionMaterialSelectionRequest;
  receipts: readonly CompanionMaterialDeliveryReceipt[];
}): { available: boolean; reason?: string } => {
  const { record, request, receipts } = params;
  if (record.status !== 'active') return { available: false, reason: 'disabled' };
  if (record.knowledge === 'unknown_to_char') return { available: false, reason: 'knowledge' };
  if (!companionMaterialOwnerScopeMatches(record, request.scope)) return { available: false, reason: 'scope' };
  if (!record.eligibleModes.includes(request.mode) || !record.eligiblePurposes.includes(request.purpose)) {
    return { available: false, reason: 'not_relevant' };
  }
  if (!routeMatches(record, request)) return { available: false, reason: 'continuity' };
  if (
    record.relationshipFloor
    && relationshipStageRank[request.relationshipStage] < relationshipStageRank[record.relationshipFloor]
  ) return { available: false, reason: 'relationship_floor' };

  const past = wasDelivered(record.id, receipts);
  if (record.maxDeliveries !== undefined && past.length >= record.maxDeliveries) {
    return { available: false, reason: 'duplicate' };
  }
  if (record.cooldownMs && past.some(receipt => request.now - receipt.occurredAt < record.cooldownMs!)) {
    return { available: false, reason: 'cooldown' };
  }
  return { available: true };
};

const implicitSignalsForSlot = (slot: CompanionMaterialSlot): readonly string[] => {
  if (slot === 'opening_recipes') return ['opening', 'proactive_intent'];
  if (slot === 'proactive_seeds') return ['proactive', 'proactive_intent'];
  if (slot === 'motive_candidates') return ['proactive_intent', 'scene_planning'];
  if (slot === 'scene_affordances') return ['scene_planning'];
  return [];
};

const defaultRetrievalHints = (record: CompanionMaterialRecord): CompanionMaterialRetrievalHints => ({
  activationPolicy: record.slot === 'stable_character_voice' ? 'voice_fallback' : 'relevance_required',
  positiveSignals: [...new Set([...record.tags, ...implicitSignalsForSlot(record.slot)].map(normalize).filter(Boolean))],
  variationGroup: `${record.slot}:${record.kind}:${record.id}`,
  fallbackPriority: 0,
});

const retrievalHintsFor = (record: CompanionMaterialRecord): CompanionMaterialRetrievalHints => {
  const defaults = defaultRetrievalHints(record);
  if (!record.retrievalHints) return defaults;
  return {
    ...defaults,
    ...record.retrievalHints,
    positiveSignals: [...new Set([
      ...defaults.positiveSignals,
      ...record.retrievalHints.positiveSignals,
    ].map(normalize).filter(Boolean))],
    suppressSignals: [...new Set((record.retrievalHints.suppressSignals || []).map(normalize).filter(Boolean))],
  };
};

const semanticScoreFor = (
  record: CompanionMaterialRecord,
  request: CompanionMaterialSelectionRequest,
): number => (
  request.semanticRank?.scores.find(item => item.materialId === record.id)?.score || 0
);

const deliveryPenalty = (
  record: CompanionMaterialRecord,
  request: CompanionMaterialSelectionRequest,
  receipts: readonly CompanionMaterialDeliveryReceipt[],
): { score: number; reasons: string[] } => {
  const past = wasDelivered(record.id, receipts);
  if (!past.length) return { score: 0, reasons: ['novel_material'] };
  const latest = Math.max(...past.map(receipt => receipt.occurredAt));
  const age = Math.max(0, request.now - latest);
  const recentPenalty = age < 12 * 60 * 60 * 1000
    ? 2.5
    : age < 7 * 24 * 60 * 60 * 1000
      ? 0.8
      : 0;
  return {
    score: Math.min(2, past.length * 0.35) + recentPenalty,
    reasons: [`delivery_count:${past.length}`, ...(recentPenalty ? ['recent_delivery_penalty'] : [])],
  };
};

interface RankedMaterial {
  record: CompanionMaterialRecord;
  hints: CompanionMaterialRetrievalHints;
  score: number;
  strong: boolean;
  fallback: boolean;
  reasons: string[];
}

const NON_DISCRIMINATING_SIGNALS = new Set(['ordinary_share']);

const scoreMaterial = (params: {
  record: CompanionMaterialRecord;
  request: CompanionMaterialSelectionRequest;
  features: CompanionMaterialQueryFeatures;
  receipts: readonly CompanionMaterialDeliveryReceipt[];
}): RankedMaterial | null => {
  const { record, request, features, receipts } = params;
  const hints = retrievalHintsFor(record);
  const querySignals = new Set(features.signals.map(normalize));
  const positiveSignals = new Set(hints.positiveSignals.map(normalize));
  const suppressSignals = new Set((hints.suppressSignals || []).map(normalize));
  const signalHits = [...positiveSignals].filter(signal => querySignals.has(signal));
  const discriminatingSignalHits = signalHits.filter(signal => !NON_DISCRIMINATING_SIGNALS.has(signal));
  const suppressionHits = [...suppressSignals].filter(signal => querySignals.has(signal));
  if (suppressionHits.length) return null;

  const lexical = companionMaterialLexicalSimilarity(features, record);
  const semantic = semanticScoreFor(record, request);
  const strong = discriminatingSignalHits.length > 0 || lexical >= 0.08 || semantic >= 0.5;
  if (hints.activationPolicy === 'relevance_required' && !strong) return null;

  const relationshipBoost = record.ownerScope.kind === 'relationship' ? 0.25 : 0;
  const novelty = deliveryPenalty(record, request, receipts);
  const fallback = hints.activationPolicy === 'voice_fallback' && !strong;
  const reasons = ['scope_match', 'surface_match', 'purpose_match'];
  if (discriminatingSignalHits.length) reasons.push(`semantic_signals:${discriminatingSignalHits.join(',')}`);
  if (lexical > 0) reasons.push(`lexical:${lexical.toFixed(3)}`);
  if (semantic > 0) reasons.push(`embedding:${semantic.toFixed(3)}@${request.semanticRank?.indexRevision}`);
  if (fallback) reasons.push('voice_fallback');
  if (relationshipBoost) reasons.push('relationship_specific');
  reasons.push(...novelty.reasons);

  return {
    record,
    hints,
    strong,
    fallback,
    reasons,
    score: (
      discriminatingSignalHits.length * 6
      + lexical * 8
      + semantic * 7
      + relationshipBoost
      + (hints.fallbackPriority || 0) * 0.02
      + stableNoise(request.requestId, record.id)
      - novelty.score
    ),
  };
};

const toDeliveryItem = (
  record: CompanionMaterialRecord,
  selectionReasons: string[],
): CompanionMaterialDeliveryItem => ({
  materialId: record.id,
  slot: record.slot,
  kind: record.kind,
  guidance: record.guidance,
  renderPolicy: record.renderPolicy,
  knowledge: record.knowledge,
  continuity: record.continuity,
  branchId: record.branchId,
  sourceRefs: record.sourceRefs,
  selectionReasons,
  estimatedChars: record.guidance.length,
});

const slotLimitFor = (
  record: CompanionMaterialRecord,
  limits: Partial<CompanionMaterialSlotLimits> | undefined,
): number => {
  if (!limits) return SLOT_LIMITS[record.slot];
  if (record.slot === 'stable_character_voice') return limits.voice ?? SLOT_LIMITS[record.slot];
  if (record.slot === 'stable_base') {
    return (record.kind === 'initiative_motive' ? limits.agency : limits.canon) ?? SLOT_LIMITS[record.slot];
  }
  if (record.slot === 'relevant_stable_details') return limits.details ?? SLOT_LIMITS[record.slot];
  if (record.slot === 'opening_recipes') return limits.opening ?? SLOT_LIMITS[record.slot];
  if (record.slot === 'scene_affordances') return limits.affordances ?? SLOT_LIMITS[record.slot];
  if (record.slot === 'motive_candidates' || record.slot === 'proactive_seeds') {
    return limits.motives ?? SLOT_LIMITS[record.slot];
  }
  return SLOT_LIMITS[record.slot];
};

const materialSimilarity = (left: CompanionMaterialRecord, right: CompanionMaterialRecord): number => {
  const leftTerms = new Set(tokenizeCompanionMaterialText(`${left.guidance} ${left.tags.join(' ')}`));
  const rightTerms = new Set(tokenizeCompanionMaterialText(`${right.guidance} ${right.tags.join(' ')}`));
  if (!leftTerms.size || !rightTerms.size) return 0;
  let hits = 0;
  leftTerms.forEach(term => {
    if (rightTerms.has(term)) hits += 1;
  });
  return hits / Math.max(leftTerms.size, rightTerms.size);
};

const chooseDiverse = (params: {
  candidates: readonly RankedMaterial[];
  request: CompanionMaterialSelectionRequest;
  warnings: string[];
  requireVoiceFallback?: RankedMaterial;
}): CompanionMaterialDeliveryItem[] => {
  const { request, warnings } = params;
  const remaining = [...params.candidates];
  const selected: RankedMaterial[] = [];
  const usedSlots = new Map<CompanionMaterialSlot, number>();
  const usedGroups = new Set<string>();
  let usedChars = 0;

  const canFit = (candidate: RankedMaterial): boolean => {
    const slotCount = usedSlots.get(candidate.record.slot) || 0;
    if (slotCount >= slotLimitFor(candidate.record, request.limits)) return false;
    return usedChars + candidate.record.guidance.length <= request.budgetChars;
  };

  while (remaining.length && selected.length < request.maxItems) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (!canFit(candidate)) continue;
      const group = candidate.hints.variationGroup || candidate.record.id;
      const groupPenalty = usedGroups.has(group) ? 4 : 0;
      const similarityPenalty = selected.length
        ? Math.max(...selected.map(item => materialSimilarity(candidate.record, item.record))) * 3
        : 0;
      const adjusted = candidate.score - groupPenalty - similarityPenalty;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    const [picked] = remaining.splice(bestIndex, 1);
    selected.push(picked);
    usedSlots.set(picked.record.slot, (usedSlots.get(picked.record.slot) || 0) + 1);
    usedGroups.add(picked.hints.variationGroup || picked.record.id);
    usedChars += picked.record.guidance.length;
  }

  const requiredVoice = params.requireVoiceFallback;
  if (
    requiredVoice
    && selected.length < request.maxItems
    && !selected.some(item => item.record.slot === 'stable_character_voice')
    && canFit(requiredVoice)
  ) {
    selected.push(requiredVoice);
  }

  if (selected.length < Math.min(request.maxItems, params.candidates.length)) {
    warnings.push('diversity_or_budget_reduced_selection');
  }
  return selected.map(candidate => toDeliveryItem(candidate.record, candidate.reasons));
};

export const selectCompanionMaterialFromRecords = (params: {
  request: CompanionMaterialSelectionRequest;
  records: readonly CompanionMaterialRecord[];
  receipts?: readonly CompanionMaterialDeliveryReceipt[];
}): CompanionMaterialSelection => {
  const { request, records, receipts = [] } = params;
  assertValidCompanionMaterialSelectionRequest(request);
  const warnings: string[] = [];
  const excluded = new Map<string, number>();
  const features = queryFeaturesForCompanionMaterialRequest(request);
  const ranked: RankedMaterial[] = [];
  const isOrdinaryChat = (
    request.surface === 'chat'
    && request.mode === 'remote_chat'
    && request.purpose === 'stable_context'
  );
  const selfLifeRequested = features.signals.some(signal => (
    signal === 'character_self_share' || signal === 'independent_life'
  ));
  const hardBypassSignal = !isOrdinaryChat
    ? undefined
    : features.signals.includes('tool_request')
      ? 'tool_request'
      : features.signals.includes('no_advice_chat') && !selfLifeRequested
        ? 'no_advice_chat'
        : undefined;

  if (hardBypassSignal) {
    const fingerprint = sourceRevisionFingerprint(records);
    return {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      selectionId: `material-selection-${hashText(`${request.requestId}:${fingerprint}:${request.now}`)}`,
      requestId: request.requestId,
      scope: { ...request.scope },
      surface: request.surface,
      mode: request.mode,
      purpose: request.purpose,
      sourceRevisionFingerprint: fingerprint,
      budgetChars: request.budgetChars,
      items: [],
      selectedMaterialIds: [],
      warnings: [
        `retrieval_backend:${request.semanticRank ? 'hybrid_embedding' : 'lexical_v1'}`,
        `query_signals:${features.signals.join(',') || 'none'}`,
        `material_bypass:${hardBypassSignal}`,
      ],
      selectedAt: request.now,
    };
  }

  for (const record of records) {
    const availability = materialAvailable({ record, request, receipts });
    if (!availability.available) {
      const key = availability.reason || 'not_relevant';
      excluded.set(key, (excluded.get(key) || 0) + 1);
      continue;
    }
    const scored = scoreMaterial({ record, request, features, receipts });
    if (!scored) {
      excluded.set('not_relevant', (excluded.get('not_relevant') || 0) + 1);
      continue;
    }
    ranked.push(scored);
  }

  ranked.sort((left, right) => (
    right.score - left.score
    || left.record.id.localeCompare(right.record.id)
  ));
  const exactDuplicateKeys = new Set<string>();
  const deduplicatedRanked = ranked.filter(candidate => {
    const key = exactTurnDuplicateKey(candidate.record);
    if (exactDuplicateKeys.has(key)) {
      excluded.set('exact_duplicate', (excluded.get('exact_duplicate') || 0) + 1);
      return false;
    }
    exactDuplicateKeys.add(key);
    return true;
  });
  excluded.forEach((count, reason) => warnings.push(`excluded_${reason}:${count}`));
  warnings.push(`retrieval_backend:${request.semanticRank ? 'hybrid_embedding' : 'lexical_v1'}`);
  warnings.push(`query_signals:${features.signals.join(',') || 'none'}`);
  if (features.usedPreviousQuery) warnings.push('used_previous_query');

  const strong = deduplicatedRanked.filter(candidate => candidate.strong);
  const fallbackVoices = deduplicatedRanked.filter(candidate => (
    candidate.fallback && candidate.record.slot === 'stable_character_voice'
  ));
  const candidatePool = strong.length ? strong : fallbackVoices.slice(0, 1);
  const requiredVoiceFallback = strong.length && !strong.some(item => item.record.slot === 'stable_character_voice')
    ? fallbackVoices[0]
    : undefined;
  const items = chooseDiverse({
    candidates: candidatePool,
    request,
    warnings,
    requireVoiceFallback: requiredVoiceFallback,
  });

  const fingerprint = sourceRevisionFingerprint(records);
  return {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    selectionId: `material-selection-${hashText(`${request.requestId}:${fingerprint}:${request.now}`)}`,
    requestId: request.requestId,
    scope: { ...request.scope },
    surface: request.surface,
    mode: request.mode,
    purpose: request.purpose,
    sourceRevisionFingerprint: fingerprint,
    budgetChars: request.budgetChars,
    items,
    selectedMaterialIds: items.map(item => item.materialId),
    warnings: [...new Set(warnings)],
    selectedAt: request.now,
  };
};
