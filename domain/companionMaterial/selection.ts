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
  type CompanionMaterialSemanticRank,
  type CompanionMaterialSemanticRankAuthority,
  type CompanionMaterialSelection,
  type CompanionMaterialSelectionRequest,
  type CompanionMaterialSlotLimits,
  type CompanionMaterialSlot,
} from './types.ts';
import { createHistoryScopeKey } from '../historyImport/contract.ts';

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

export const companionMaterialSetFingerprint = (
  records: readonly CompanionMaterialRecord[],
): string => `material-set-v1:${hashText(JSON.stringify(
  records
    .map(record => ({
      id: record.id,
      revision: record.revision,
      ownerScope: record.ownerScope,
      charId: record.charId,
      kind: record.kind,
      slot: record.slot,
      guidance: normalizeGuidanceForExactDedupe(record.guidance),
      renderPolicy: record.renderPolicy,
      knowledge: record.knowledge,
      continuity: record.continuity,
      status: record.status,
      routeId: record.routeId || '',
      branchId: record.branchId || '',
      sceneId: record.sceneId || '',
      eligibleModes: [...record.eligibleModes].sort(),
      eligiblePurposes: [...record.eligiblePurposes].sort(),
      tags: [...record.tags].sort(),
      retrievalHints: record.retrievalHints
        ? {
            activationPolicy: record.retrievalHints.activationPolicy,
            positiveSignals: [...record.retrievalHints.positiveSignals].sort(),
            suppressSignals: [...(record.retrievalHints.suppressSignals || [])].sort(),
            variationGroup: record.retrievalHints.variationGroup || '',
            fallbackPriority: record.retrievalHints.fallbackPriority ?? null,
          }
        : null,
      relationshipFloor: record.relationshipFloor || '',
      cooldownMs: record.cooldownMs ?? null,
      maxDeliveries: record.maxDeliveries ?? null,
      sourceRefs: record.sourceRefs
        .map(ref => ({
          storeFamily: ref.storeFamily,
          recordId: ref.recordId,
          revision: ref.revision,
          sourceFingerprint: ref.sourceFingerprint,
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
))}`;

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

const sameUsageClass = (
  receipt: CompanionMaterialDeliveryReceipt,
  request: CompanionMaterialSelectionRequest,
): boolean => (
  receipt.surface === request.surface
  && receipt.mode === request.mode
  && receipt.purpose === request.purpose
);

const wasDelivered = (
  record: CompanionMaterialRecord,
  receipts: readonly CompanionMaterialDeliveryReceipt[],
  request?: CompanionMaterialSelectionRequest,
): CompanionMaterialDeliveryReceipt[] => receipts.filter(receipt => (
  receipt.status === 'delivered'
  && (!request || sameUsageClass(receipt, request))
  && receipt.delivered.some(item => (
    item.materialId === record.id
    && item.materialRevision === record.revision
  ))
));

const materialAvailable = (params: {
  record: CompanionMaterialRecord;
  request: CompanionMaterialSelectionRequest;
  receipts: readonly CompanionMaterialDeliveryReceipt[];
}): { available: boolean; reason?: string } => {
  const {
    record,
    request,
    receipts,
  } = params;
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

  const allUsagePast = wasDelivered(record, receipts);
  if (record.maxDeliveries !== undefined && allUsagePast.length >= record.maxDeliveries) {
    return { available: false, reason: 'duplicate' };
  }
  const sameUsagePast = wasDelivered(record, receipts, request);
  if (
    record.cooldownMs
    && sameUsagePast.some(receipt => request.now - receipt.occurredAt < record.cooldownMs!)
  ) {
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
      ...record.tags,
      ...record.retrievalHints.positiveSignals,
    ].map(normalize).filter(Boolean))],
    suppressSignals: [...new Set((record.retrievalHints.suppressSignals || []).map(normalize).filter(Boolean))],
  };
};

const semanticScoreFor = (
  record: CompanionMaterialRecord,
  request: CompanionMaterialSelectionRequest,
  usable: boolean,
): number => (
  usable ? request.semanticRank?.scores.find(item => item.materialId === record.id)?.score || 0 : 0
);

const semanticRankMatchesAuthority = (
  rank: CompanionMaterialSemanticRank,
  authority: CompanionMaterialSemanticRankAuthority,
): boolean => (
  authority.authority === 'trusted_local_index_manifest'
  && rank.manifestId === authority.manifestId
  && rank.manifestDigest === authority.manifestDigest
  && rank.backend === authority.backend
  && rank.modelId === authority.modelId
  && rank.modelArtifactDigest === authority.modelArtifactDigest
  && rank.dimensions === authority.dimensions
  && rank.metric === authority.metric
  && rank.normalized === authority.normalized
  && rank.projectionVersion === authority.projectionVersion
  && rank.calibrationRevision === authority.calibrationRevision
  && rank.strongThreshold === authority.strongThreshold
  && rank.indexRevision === authority.indexRevision
  && rank.scopeKey === authority.scopeKey
  && rank.materialSetFingerprint === authority.materialSetFingerprint
);

const deliveryPenalty = (
  record: CompanionMaterialRecord,
  request: CompanionMaterialSelectionRequest,
  receipts: readonly CompanionMaterialDeliveryReceipt[],
): { score: number; reasons: string[] } => {
  const past = wasDelivered(record, receipts, request);
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

// A surface saying "I am opening" is transport metadata, not evidence that
// every opening recipe is semantically relevant. Specific topic/state signals
// (or a future semantic rank) must still earn situational material.
const NON_DISCRIMINATING_SIGNALS = new Set(['ordinary_share', 'opening']);
const LOW_SIGNAL_VOICE_FALLBACK_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const scopesMatch = (
  left: CompanionMaterialSelectionRequest['scope'],
  right: CompanionMaterialSelectionRequest['scope'],
): boolean => (
  left.progressBundleId === right.progressBundleId
  && left.personaMaskId === right.personaMaskId
  && left.charId === right.charId
);

const deliveredMaterialIds = (
  request: CompanionMaterialSelectionRequest,
  receipts: readonly CompanionMaterialDeliveryReceipt[],
  recordsById: ReadonlyMap<string, CompanionMaterialRecord>,
): readonly { materialId: string; occurredAt: number }[] => receipts.flatMap(receipt => (
  receipt.status === 'delivered'
    && scopesMatch(receipt.scope, request.scope)
    && sameUsageClass(receipt, request)
    ? receipt.delivered.flatMap(item => {
        const current = recordsById.get(item.materialId);
        return current && current.revision === item.materialRevision
          ? [{ materialId: item.materialId, occurredAt: receipt.occurredAt }]
          : [];
      })
    : []
));

const variationGroupDeliveries = (params: {
  record: CompanionMaterialRecord;
  request: CompanionMaterialSelectionRequest;
  receipts: readonly CompanionMaterialDeliveryReceipt[];
  recordsById: ReadonlyMap<string, CompanionMaterialRecord>;
}): readonly { materialId: string; occurredAt: number }[] => {
  const candidateGroup = retrievalHintsFor(params.record).variationGroup || params.record.id;
  return deliveredMaterialIds(params.request, params.receipts, params.recordsById).filter(delivery => {
    if (delivery.materialId === params.record.id) return false;
    const deliveredRecord = params.recordsById.get(delivery.materialId);
    if (!deliveredRecord) return false;
    const deliveredGroup = retrievalHintsFor(deliveredRecord).variationGroup || deliveredRecord.id;
    return deliveredGroup === candidateGroup;
  });
};

const scoreMaterial = (params: {
  record: CompanionMaterialRecord;
  request: CompanionMaterialSelectionRequest;
  features: CompanionMaterialQueryFeatures;
  receipts: readonly CompanionMaterialDeliveryReceipt[];
  recordsById: ReadonlyMap<string, CompanionMaterialRecord>;
  semanticRankUsable: boolean;
}): RankedMaterial | null => {
  const {
    record,
    request,
    features,
    receipts,
    recordsById,
    semanticRankUsable,
  } = params;
  const hints = retrievalHintsFor(record);
  const querySignals = new Set(features.signals.map(normalize));
  const positiveSignals = new Set(hints.positiveSignals.map(normalize));
  const suppressSignals = new Set((hints.suppressSignals || []).map(normalize));
  const signalHits = [...positiveSignals].filter(signal => querySignals.has(signal));
  const discriminatingSignalHits = signalHits.filter(signal => !NON_DISCRIMINATING_SIGNALS.has(signal));
  const suppressionHits = [...suppressSignals].filter(signal => querySignals.has(signal));
  if (suppressionHits.length) return null;

  const lexical = companionMaterialLexicalSimilarity(features, record);
  const semantic = semanticScoreFor(record, request, semanticRankUsable);
  const semanticEvidenceBlocked = (
    querySignals.has('low_signal')
    || querySignals.has('tool_request')
    || querySignals.has('no_advice_chat')
  );
  const semanticEvidence = semanticEvidenceBlocked ? 0 : semantic;
  const strongThreshold = semanticRankUsable ? request.semanticRank!.strongThreshold : 1;
  const semanticStrong = (
    semanticRankUsable
    && semanticEvidence > 0
    && semanticEvidence >= strongThreshold
  );
  const strong = (
    discriminatingSignalHits.length > 0
    || lexical >= 0.08
    || semanticStrong
  );
  if (hints.activationPolicy === 'relevance_required' && !strong) return null;

  const relationshipBoost = record.ownerScope.kind === 'relationship' ? 0.25 : 0;
  const novelty = deliveryPenalty(record, request, receipts);
  const groupDeliveries = variationGroupDeliveries({
    record,
    request,
    receipts,
    recordsById,
  });
  const latestGroupDeliveryAt = groupDeliveries.length
    ? Math.max(...groupDeliveries.map(delivery => delivery.occurredAt))
    : 0;
  const groupAge = latestGroupDeliveryAt ? Math.max(0, request.now - latestGroupDeliveryAt) : Number.POSITIVE_INFINITY;
  const groupPenalty = groupAge < 12 * 60 * 60 * 1000
    ? 2
    : groupAge < 7 * 24 * 60 * 60 * 1000
      ? 0.6
      : 0;
  const fallback = hints.activationPolicy === 'voice_fallback' && !strong;
  const reasons = ['scope_match', 'surface_match', 'purpose_match'];
  if (discriminatingSignalHits.length) reasons.push(`semantic_signals:${discriminatingSignalHits.join(',')}`);
  if (lexical > 0) reasons.push(`lexical:${lexical.toFixed(3)}`);
  if (semanticEvidence > 0) {
    reasons.push(`embedding:${semanticEvidence.toFixed(3)}@${request.semanticRank?.indexRevision}`);
  }
  if (semantic > 0 && semanticEvidenceBlocked) reasons.push('embedding_suppressed:low_authority_query');
  if (fallback) reasons.push('voice_fallback');
  if (relationshipBoost) reasons.push('relationship_specific');
  if (groupDeliveries.length) reasons.push(`variation_group_delivery_count:${groupDeliveries.length}`);
  if (groupPenalty) reasons.push('recent_variation_group_penalty');
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
      + semanticEvidence * 7
      + relationshipBoost
      + (hints.fallbackPriority || 0) * 0.02
      + stableNoise(request.requestId, record.id)
      - novelty.score
      - Math.min(1.2, groupDeliveries.length * 0.2)
      - groupPenalty
    ),
  };
};

const fallbackRecentlyDelivered = (params: {
  candidate: RankedMaterial;
  request: CompanionMaterialSelectionRequest;
  receipts: readonly CompanionMaterialDeliveryReceipt[];
  recordsById: ReadonlyMap<string, CompanionMaterialRecord>;
}): boolean => (
  params.candidate.fallback
  && deliveredMaterialIds(params.request, params.receipts, params.recordsById).some(delivery => (
    delivery.materialId === params.candidate.record.id
    && params.request.now - delivery.occurredAt < LOW_SIGNAL_VOICE_FALLBACK_COOLDOWN_MS
  ))
);

const toDeliveryItem = (
  record: CompanionMaterialRecord,
  selectionReasons: string[],
): CompanionMaterialDeliveryItem => ({
  materialId: record.id,
  materialRevision: record.revision,
  slot: record.slot,
  kind: record.kind,
  guidance: record.guidance,
  renderPolicy: record.renderPolicy,
  knowledge: record.knowledge,
  continuity: record.continuity,
  routeId: record.routeId,
  branchId: record.branchId,
  sceneId: record.sceneId,
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
  semanticRankAuthority?: CompanionMaterialSemanticRankAuthority;
}): CompanionMaterialSelection => {
  const {
    request,
    records,
    receipts = [],
    semanticRankAuthority,
  } = params;
  assertValidCompanionMaterialSelectionRequest(request);
  const warnings: string[] = [];
  const excluded = new Map<string, number>();
  const features = queryFeaturesForCompanionMaterialRequest(request);
  const ranked: RankedMaterial[] = [];
  const recordsById = new Map(records.map(record => [record.id, record]));
  const fingerprint = companionMaterialSetFingerprint(records);
  const semanticRankUsable = Boolean(
    request.semanticRank
    && semanticRankAuthority
    && semanticRankMatchesAuthority(request.semanticRank, semanticRankAuthority)
    && request.semanticRank.scopeKey === createHistoryScopeKey(request.scope)
    && request.semanticRank.materialSetFingerprint === fingerprint
  );
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
    return {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      selectionId: `material-selection-${hashText(`${request.requestId}:${fingerprint}:${request.now}`)}`,
      requestId: request.requestId,
      scope: { ...request.scope },
      surface: request.surface,
      mode: request.mode,
      purpose: request.purpose,
      routeRef: request.routeRef ? { ...request.routeRef } : undefined,
      sourceRevisionFingerprint: fingerprint,
      budgetChars: request.budgetChars,
      items: [],
      selectedMaterialIds: [],
      warnings: [
        `retrieval_backend:${semanticRankUsable ? 'hybrid_embedding' : 'lexical_v1'}`,
        `query_signals:${features.signals.join(',') || 'none'}`,
        `material_bypass:${hardBypassSignal}`,
      ],
      selectedAt: request.now,
    };
  }

  for (const record of records) {
    const availability = materialAvailable({
      record,
      request,
      receipts,
    });
    if (!availability.available) {
      const key = availability.reason || 'not_relevant';
      excluded.set(key, (excluded.get(key) || 0) + 1);
      continue;
    }
    const scored = scoreMaterial({
      record,
      request,
      features,
      receipts,
      recordsById,
      semanticRankUsable,
    });
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
  warnings.push(`retrieval_backend:${semanticRankUsable ? 'hybrid_embedding' : 'lexical_v1'}`);
  if (request.semanticRank && !semanticRankUsable) {
    warnings.push('semantic_rank_ignored:untrusted_or_binding_mismatch');
  }
  warnings.push(`query_signals:${features.signals.join(',') || 'none'}`);
  if (features.usedPreviousQuery) warnings.push('used_previous_query');

  const strong = deduplicatedRanked.filter(candidate => candidate.strong);
  const fallbackVoices = deduplicatedRanked.filter(candidate => (
    candidate.fallback
    && candidate.record.slot === 'stable_character_voice'
    && !fallbackRecentlyDelivered({
      candidate,
      request,
      receipts,
      recordsById,
    })
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

  return {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    selectionId: `material-selection-${hashText(`${request.requestId}:${fingerprint}:${request.now}`)}`,
    requestId: request.requestId,
    scope: { ...request.scope },
    surface: request.surface,
    mode: request.mode,
    purpose: request.purpose,
    routeRef: request.routeRef ? { ...request.routeRef } : undefined,
    sourceRevisionFingerprint: fingerprint,
    budgetChars: request.budgetChars,
    items,
    selectedMaterialIds: items.map(item => item.materialId),
    warnings: [...new Set(warnings)],
    selectedAt: request.now,
  };
};
