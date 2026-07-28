import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialRecord,
  type CompanionMaterialRetrievalHints,
  type CompanionMaterialSourceRef,
} from '../../companionMaterial/types.ts';
import { assertValidHistoryCompanionMaterialPass } from './contract.ts';
import type {
  HistoryCompanionMaterialCandidate,
  HistoryCompanionMaterialPass,
} from './types.ts';

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const safeLocator = (candidate: HistoryCompanionMaterialCandidate): string => (
  candidate.sourceRefs
    .map(sourceRef => (
      `${sourceRef.documentId}@${sourceRef.documentRevision}`
      + `:${sourceRef.startMessageOffset}-${sourceRef.endMessageOffset}`
    ))
    .join('|')
    .slice(0, 180)
);

const sourceRefsForCandidate = (
  pass: HistoryCompanionMaterialPass,
  candidate: HistoryCompanionMaterialCandidate,
): CompanionMaterialSourceRef[] => candidate.sourceRefs.map((sourceRef, index) => ({
  storeFamily: 'history_companion_material',
  recordId: candidate.id,
  revision: candidate.revision,
  sourceFingerprint: hashText([
    pass.sourceRevisionFingerprint,
    candidate.id,
    candidate.revision,
    sourceRef.documentId,
    sourceRef.documentRevision,
    sourceRef.startMessageOffset,
    sourceRef.endMessageOffset,
  ].join(':')),
  sourcePackId: pass.id,
  sourceLocator: `${index + 1}/${candidate.sourceRefs.length}:${safeLocator({
    ...candidate,
    sourceRefs: [sourceRef],
  })}`,
}));

const SIGNALS_BY_HISTORY_TAG = {
  speech_rhythm: ['ordinary_share', 'observation', 'light_scene'],
  care_style: ['mild_discomfort', 'care_needed'],
  humor_style: ['humor', 'light_scene'],
  conflict_style: ['emotional_weight', 'refusal'],
  repair_style: ['reentry', 'emotional_weight'],
  initiative_style: ['character_self_share', 'independent_life', 'observation'],
  boundary_style: ['refusal'],
  affection_style: ['affection_style'],
  stable_habit: ['character_self_share', 'independent_life'],
  world_detail: ['observation', 'sensory_detail', 'light_scene'],
  relationship_detail: ['relationship_detail'],
  opening_shape: ['opening', 'proactive_intent'],
  scene_permission: ['light_scene', 'scene_planning'],
  proactive_intent: ['character_self_share', 'independent_life', 'proactive_intent'],
} as const satisfies Record<HistoryCompanionMaterialCandidate['tags'][number], readonly string[]>;

const retrievalHintsForCandidate = (
  candidate: HistoryCompanionMaterialCandidate,
): CompanionMaterialRetrievalHints => {
  const tags = [...candidate.tags];
  const voiceFallback = (
    candidate.kind === 'language_fingerprint'
    && tags.includes('speech_rhythm')
    && !tags.some(tag => (
      tag === 'care_style'
      || tag === 'conflict_style'
      || tag === 'repair_style'
      || tag === 'boundary_style'
      || tag === 'affection_style'
    ))
  );
  const positiveSignals = [...new Set(tags.flatMap(tag => SIGNALS_BY_HISTORY_TAG[tag]))];
  const suppressSignals = new Set<string>();
  if (!voiceFallback) suppressSignals.add('low_signal');
  if (tags.includes('care_style')) suppressSignals.add('refusal');
  const primaryTag = tags[0] || candidate.kind;
  return {
    activationPolicy: voiceFallback ? 'voice_fallback' : 'relevance_required',
    positiveSignals,
    suppressSignals: [...suppressSignals],
    variationGroup: `history_${primaryTag}`,
    fallbackPriority: voiceFallback ? 5 : 0,
  };
};

export const historyCompanionMaterialRecordId = (
  passId: string,
  candidate: Pick<HistoryCompanionMaterialCandidate, 'id'>,
): string => `history-material-${hashText(`${passId}:${candidate.id}`)}`;

/**
 * Projection is intentionally mechanical. It does not elevate confidence,
 * invent tags, decide current motives, or copy source dialogue.
 */
export const projectHistoryCompanionMaterialPass = (
  pass: HistoryCompanionMaterialPass,
): CompanionMaterialRecord[] => {
  assertValidHistoryCompanionMaterialPass(pass);
  if (pass.status !== 'active') return [];

  return pass.candidates
    .filter(candidate => candidate.status === 'active')
    .map(candidate => ({
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      id: historyCompanionMaterialRecordId(pass.id, candidate),
      ownerScope: {
        kind: 'relationship' as const,
        scope: { ...pass.scope },
      },
      charId: pass.scope.charId,
      kind: candidate.kind,
      slot: candidate.slot,
      guidance: candidate.guidance.trim(),
      renderPolicy: candidate.renderPolicy,
      knowledge: candidate.knowledge,
      continuity: candidate.continuity,
      routeId: candidate.routeId,
      branchId: candidate.branchId,
      sceneId: candidate.sceneId,
      eligibleModes: [...candidate.eligibleModes],
      eligiblePurposes: [...candidate.eligiblePurposes],
      tags: [...candidate.tags],
      retrievalHints: retrievalHintsForCandidate(candidate),
      relationshipFloor: candidate.relationshipFloor,
      cooldownMs: candidate.cooldownMs,
      maxDeliveries: candidate.maxDeliveries,
      sourceRefs: sourceRefsForCandidate(pass, candidate),
      status: 'active' as const,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      revision: candidate.revision,
    }));
};
