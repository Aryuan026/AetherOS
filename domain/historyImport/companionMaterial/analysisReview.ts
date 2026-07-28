import { createHistoryScopeKey, validateHistoryScope } from '../contract.ts';
import type {
  CompanionMaterialGroundingPolicy,
  CompanionMaterialKind,
  CompanionMaterialMode,
  CompanionMaterialPurpose,
  CompanionMaterialRenderPolicy,
  CompanionMaterialSlot,
} from '../../companionMaterial/types.ts';
import {
  HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION,
  type HistoryCompanionMaterialCandidate,
  type HistoryCompanionMaterialGroundingClass,
  type HistoryCompanionMaterialPass,
  type HistoryCompanionMaterialTag,
} from './types.ts';
import {
  HISTORY_COMPANION_ANALYSIS_PACKET_SCHEMA_VERSION,
  canonicalHistoryCompanionAuthorityJson,
  getHistoryCompanionAnalysisEvidenceLaneGrant,
  sha256HistoryCompanionAuthority,
  validateHistoryCompanionAnalysisPacket,
  validateHistoryCompanionAnalysisPacketSet,
  type HistoryCompanionAnalysisEvidence,
  type HistoryCompanionAnalysisLane,
  type HistoryCompanionAnalysisPacket,
} from './analysisPacket.ts';
import {
  validateHistoryCompanionAnalysisBatchPlan,
  validateHistoryCompanionAnalysisCoverageReceipt,
  validateHistoryCompanionAnalysisSynthesisEnvelope,
  type HistoryCompanionAnalysisBatchDraftReceipt,
  type HistoryCompanionAnalysisBatchPlan,
  type HistoryCompanionAnalysisCoverageReceipt,
  type HistoryCompanionAnalysisSynthesisEnvelope,
} from './analysisBatch.ts';
import {
  buildHistoryCompanionAnalysisPrompt,
} from './analysisPrompt.ts';
import type { HistoryScope } from '../types.ts';
import type { HistorySourceSpan } from '../analysis/types.ts';
import {
  appendCanonicalHistoryCompanionActivationReceipt,
  createHistoryCompanionAnalysisAuthority,
  historyCompanionExecutionPrincipalKey,
  validateHistoryCompanionAnalysisAuthorityEnvelope,
  validateHistoryCompanionExecutionPrincipal,
  type HistoryCompanionActivationReceiptLedgerEntry,
  type HistoryCompanionAnalysisFinalization,
  type HistoryCompanionExecutionPrincipal,
} from './analysisAuthority.ts';

export {
  validateHistoryCompanionActivationReceiptLedger,
  validateHistoryCompanionActivationReceiptShape,
} from './analysisAuthority.ts';
export type {
  HistoryCompanionActivationReceipt,
  HistoryCompanionActivationReceiptLedgerEntry,
  HistoryCompanionActivationReceiptStore,
  HistoryCompanionAnalysisFinalization,
  HistoryCompanionAuthorityEnvelope,
  HistoryCompanionExecutionPrincipal,
} from './analysisAuthority.ts';

export const HISTORY_COMPANION_ANALYSIS_REVIEW_SCHEMA_VERSION = 3 as const;
export const HISTORY_COMPANION_ANALYSIS_ADJUDICATION_SCHEMA_VERSION = 1 as const;
export const HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION = 'history-companion-finalizer-v4' as const;

export type HistoryCompanionAnalysisReviewerKind =
  | 'model_semantic_draft'
  | 'model_semantic_review'
  | 'same_model_second_pass'
  | 'independent_model_adjudication'
  | 'human_semantic_review'
  | 'human_model_adjudication';

export type HistoryCompanionAnalysisAdjudicatorKind = Extract<
  HistoryCompanionAnalysisReviewerKind,
  | 'same_model_second_pass'
  | 'independent_model_adjudication'
  | 'human_semantic_review'
  | 'human_model_adjudication'
>;

export type HistoryCompanionFindingDecision =
  | 'accepted'
  | 'withheld'
  | 'rejected';

export type HistoryCompanionSpeakerResolution =
  | 'primary_character_direct'
  | 'coauthored_multi_actor'
  | 'user'
  | 'unknown';

export interface HistoryCompanionBehaviorBoundary {
  variationPreserved: boolean;
  fixedReplyTemplate: false;
  currentStateEffect: 'none';
  toolPolicyEffect: 'none';
}

export interface HistoryCompanionVoiceDiagnostics {
  nameBlindStatus: 'passed' | 'weak' | 'pending';
  commonGoodBehaviorStatus: 'passed' | 'failed' | 'pending';
  attentionLanding: string;
  responseRhythm: string;
  mouthShapes: readonly string[];
  expressionRange: string;
  independentLifePosture: string;
}

export interface HistoryCompanionAnalysisFinding {
  id: string;
  lane: HistoryCompanionAnalysisLane;
  decision: HistoryCompanionFindingDecision;
  evidenceIds: readonly string[];
  confidence: number;
  /** Non-verbatim, generative guidance. It must not contain source dialogue. */
  guidance: string;
  tags: readonly HistoryCompanionMaterialTag[];
  speakerResolution: HistoryCompanionSpeakerResolution;
  /**
   * Only opening_proactive needs a subtype. Other lanes are mapped by code and
   * cannot ask the model to choose its own runtime slot.
   */
  materialKind?: Extract<
    CompanionMaterialKind,
    'opening_recipe' | 'proactive_seed' | 'initiative_motive'
  >;
  /**
   * Reviewed evidence requirement. Code maps this closed value to selector
   * grounding and never renders it as a behavior instruction.
   */
  groundingClass: HistoryCompanionMaterialGroundingClass;
  behaviorBoundary?: HistoryCompanionBehaviorBoundary;
  voiceDiagnostics?: HistoryCompanionVoiceDiagnostics;
  reviewReason: string;
  uncertaintyOrConflict: string;
}

export interface HistoryCompanionAnalysisReview {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_REVIEW_SCHEMA_VERSION;
  packetSchemaVersion: typeof HISTORY_COMPANION_ANALYSIS_PACKET_SCHEMA_VERSION;
  /** One bounded packet or a deliberately selected cross-packet evidence set. */
  packetIds: readonly string[];
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  analysisRunId: string;
  extractorVersion: string;
  analyzerPrincipal: HistoryCompanionExecutionPrincipal;
  method: {
    name: string;
    version: string;
    reviewerKind: HistoryCompanionAnalysisReviewerKind;
  };
  /**
   * Direct reviews must fit one canonical prompt. Large histories can only
   * enter through an exact-once bounded synthesis authority bundle.
   */
  analysisPath:
    | { kind: 'direct_packet_set' }
    | {
      kind: 'bounded_synthesis';
      plan: HistoryCompanionAnalysisBatchPlan;
      coverageReceipt: HistoryCompanionAnalysisCoverageReceipt;
      batchDraftReceipts: readonly HistoryCompanionAnalysisBatchDraftReceipt[];
      synthesisEnvelope: HistoryCompanionAnalysisSynthesisEnvelope;
    };
  status: 'completed';
  /**
   * A semantic result is never runtime authority by itself. It remains pending
   * until a separately captured adjudication receipt approves individual
   * findings.
   */
  activationStatus: 'pending_adjudication';
  findings: readonly HistoryCompanionAnalysisFinding[];
  reviewedAt: number;
}

export interface CreateHistoryCompanionAnalysisReviewInput {
  packets: readonly HistoryCompanionAnalysisPacket[];
  analysisRunId: string;
  extractorVersion: string;
  /**
   * Required at runtime. Optional only while existing call sites migrate; the
   * factory rejects absence instead of inventing a model-owned identity.
   */
  analyzerPrincipal?: HistoryCompanionExecutionPrincipal;
  method: HistoryCompanionAnalysisReview['method'];
  findings: readonly HistoryCompanionAnalysisFinding[];
  reviewedAt?: number;
}

export interface CreateHistoryCompanionAnalysisReviewFromSynthesisInput
  extends CreateHistoryCompanionAnalysisReviewInput {
  plan: HistoryCompanionAnalysisBatchPlan;
  coverageReceipt: HistoryCompanionAnalysisCoverageReceipt;
  batchDraftReceipts: readonly HistoryCompanionAnalysisBatchDraftReceipt[];
  synthesisEnvelope: HistoryCompanionAnalysisSynthesisEnvelope;
}

export interface HistoryCompanionEvidenceSpeakerAttribution {
  evidenceId: string;
  speakerResolution: HistoryCompanionSpeakerResolution;
  reason: string;
}

export interface HistoryCompanionFindingAdjudication {
  findingId: string;
  decision: 'approved' | 'withheld' | 'rejected';
  evidenceSpeakerAttributions: readonly HistoryCompanionEvidenceSpeakerAttribution[];
  reason: string;
}

/**
 * Code-owned receipt for a second-pass review. The method records whether it
 * reused the analyzer model or came from a genuinely distinct model/human.
 * The semantic model never gets to manufacture this authority envelope inside
 * its own JSON response.
 */
export interface HistoryCompanionAnalysisAdjudicationReceipt {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_ADJUDICATION_SCHEMA_VERSION;
  packetIds: readonly string[];
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  sourceAnalysisRunId: string;
  adjudicationRunId: string;
  adjudicatorPrincipal: HistoryCompanionExecutionPrincipal;
  method: {
    name: string;
    version: string;
    reviewerKind: HistoryCompanionAnalysisAdjudicatorKind;
  };
  status: 'completed';
  findings: readonly HistoryCompanionFindingAdjudication[];
  adjudicatedAt: number;
}

export interface CreateHistoryCompanionAnalysisAdjudicationInput {
  packets: readonly HistoryCompanionAnalysisPacket[];
  review: HistoryCompanionAnalysisReview;
  adjudicationRunId: string;
  /**
   * Required at runtime and captured by the executor, not read from model JSON.
   */
  adjudicatorPrincipal?: HistoryCompanionExecutionPrincipal;
  method: HistoryCompanionAnalysisAdjudicationReceipt['method'];
  findings: readonly HistoryCompanionFindingAdjudication[];
  adjudicatedAt?: number;
}

const REVIEWER_KINDS = new Set<HistoryCompanionAnalysisReviewerKind>([
  'model_semantic_draft',
  'model_semantic_review',
  'same_model_second_pass',
  'independent_model_adjudication',
  'human_semantic_review',
  'human_model_adjudication',
]);

const ADJUDICATOR_KINDS = new Set<HistoryCompanionAnalysisAdjudicatorKind>([
  'same_model_second_pass',
  'independent_model_adjudication',
  'human_semantic_review',
  'human_model_adjudication',
]);

const ADJUDICATION_DECISIONS = new Set<HistoryCompanionFindingAdjudication['decision']>([
  'approved',
  'withheld',
  'rejected',
]);

const FINDING_DECISIONS = new Set<HistoryCompanionFindingDecision>([
  'accepted',
  'withheld',
  'rejected',
]);

const SPEAKER_RESOLUTIONS = new Set<HistoryCompanionSpeakerResolution>([
  'primary_character_direct',
  'coauthored_multi_actor',
  'user',
  'unknown',
]);

const TAGS_BY_LANE: Record<HistoryCompanionAnalysisLane, ReadonlySet<HistoryCompanionMaterialTag>> = {
  language_fingerprint: new Set([
    'speech_rhythm',
    'care_style',
    'humor_style',
    'conflict_style',
    'repair_style',
    'initiative_style',
    'boundary_style',
    'affection_style',
  ]),
  stable_detail: new Set([
    'stable_habit',
    'world_detail',
    'relationship_detail',
  ]),
  opening_proactive: new Set([
    'opening_shape',
    'fact_free_opening',
    'proactive_intent',
    'initiative_style',
    'repair_style',
  ]),
  scene_texture: new Set([
    'scene_permission',
    'world_detail',
    'relationship_detail',
  ]),
};

const FORBIDDEN_RESPONSE_FIELDS = new Set([
  'activeBuffs',
  'allowedTools',
  'currentCondition',
  'currentLocation',
  'currentMood',
  'currentMotives',
  'disabledTools',
  'lifeState',
  'rawText',
  'sourceText',
  'systemPrompt',
  'toolAllowlist',
  'toolDenylist',
  'transcript',
]);

const FORBIDDEN_GUIDANCE = /currentMotives|toolAllowlist|toolDenylist|工具白名单|工具黑名单|固定回复|照抄|逐字复述/;
const PROMPT_INJECTION_GUIDANCE = /(?:^|\n)\s*(?:system|assistant|user)\s*:|```|###|忽略(?:以上|前文|此前)指令|系统提示|\[\[(?:ACTION|RECALL|SEND_EMOJI)|<\s*(?:system|assistant|user)\b/iu;
const NEGATIVE_GUIDANCE_CLAUSE = /(?:不要|不能|不必|不得|不许|严禁|避免)/gu;

const isNonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const packetAuthorityDescriptors = (
  packets: readonly HistoryCompanionAnalysisPacket[],
) => packets.map(packet => ({
  id: packet.id,
  packetOrdinal: packet.packetOrdinal,
  packetEvidenceDigest: packet.packetEvidenceDigest,
}));

const authorityId = (value: unknown): string => sha256HistoryCompanionAuthority(
  canonicalHistoryCompanionAuthorityJson(value),
);

const normalizedComparable = (value: string): string => (
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Cf}]+/gu, '')
    .replace(/[\p{White_Space}\p{Punctuation}]+/gu, '')
);

const longestCommonContiguousSpan = (
  left: readonly string[],
  right: readonly string[],
): number => {
  if (!left.length || !right.length) return 0;
  let previous = new Uint16Array(right.length + 1);
  let longest = 0;
  left.forEach(leftChar => {
    const current = new Uint16Array(right.length + 1);
    right.forEach((rightChar, rightIndex) => {
      if (leftChar !== rightChar) return;
      current[rightIndex + 1] = previous[rightIndex] + 1;
      longest = Math.max(longest, current[rightIndex + 1]);
    });
    previous = current;
  });
  return longest;
};

const hasSourceOverlap = (
  guidance: string,
  evidence: readonly HistoryCompanionAnalysisEvidence[],
): boolean => {
  const normalizedGuidance = normalizedComparable(guidance);
  if (!normalizedGuidance) return false;
  const guidanceChars = [...normalizedGuidance];
  return evidence.some(item => {
    const normalizedSource = normalizedComparable(item.ephemeralText);
    if (!normalizedSource) return false;
    const sourceChars = [...normalizedSource];
    if (normalizedGuidance === normalizedSource) return true;

    const overlap = longestCommonContiguousSpan(guidanceChars, sourceChars);
    const sourceCoverage = overlap / sourceChars.length;
    const guidanceCoverage = overlap / guidanceChars.length;
    /*
     * A common two-character phrase such as “可以” is not evidence of copying.
     * Reject either a long literal span, or a medium span that covers most of
     * one side and a meaningful share of the other. Removing default-ignorable
     * characters above means zero-width insertion cannot evade this gate.
     */
    return (
      overlap >= 12
      || (
        overlap >= 6
        && Math.max(sourceCoverage, guidanceCoverage) >= 0.8
        && Math.min(sourceCoverage, guidanceCoverage) >= 0.18
      )
    );
  });
};

const findForbiddenFields = (value: unknown, path = 'review'): string[] => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenFields(item, `${path}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(FORBIDDEN_RESPONSE_FIELDS.has(key) ? [`${path}.${key} is forbidden`] : []),
    ...findForbiddenFields(child, `${path}.${key}`),
  ]);
};

const acceptedFindingMaterial = (
  finding: HistoryCompanionAnalysisFinding,
): {
  kind: CompanionMaterialKind;
  slot: CompanionMaterialSlot;
  renderPolicy: CompanionMaterialRenderPolicy;
  eligibleModes: readonly CompanionMaterialMode[];
  eligiblePurposes: readonly CompanionMaterialPurpose[];
  requiredTag?: HistoryCompanionMaterialTag;
} => {
  if (finding.lane === 'language_fingerprint') {
    return {
      kind: 'language_fingerprint',
      slot: 'stable_character_voice',
      renderPolicy: 'style_only',
      eligibleModes: [
        'remote_chat',
        'call',
        'meet_scene',
        'date_scene',
        'proactive_letter',
        'group_chat',
        'social',
        'story_scene',
      ],
      eligiblePurposes: ['stable_context'],
    };
  }
  if (finding.lane === 'stable_detail') {
    return {
      kind: 'stable_detail',
      slot: 'relevant_stable_details',
      renderPolicy: 'fact_reference',
      eligibleModes: [
        'remote_chat',
        'call',
        'meet_scene',
        'date_scene',
        'proactive_letter',
        'group_chat',
        'social',
        'story_planning',
        'story_scene',
      ],
      eligiblePurposes: ['stable_context'],
    };
  }
  if (finding.lane === 'scene_texture') {
    return {
      kind: 'scene_affordance',
      slot: 'scene_affordances',
      renderPolicy: 'decision_context',
      eligibleModes: ['meet_scene', 'date_scene', 'story_planning', 'story_scene'],
      eligiblePurposes: ['scene_planning'],
      requiredTag: 'scene_permission',
    };
  }
  if (finding.materialKind === 'opening_recipe') {
    return {
      kind: 'opening_recipe',
      slot: 'opening_recipes',
      renderPolicy: 'transform_required',
      eligibleModes: ['call', 'meet_scene', 'date_scene', 'proactive_letter', 'story_scene'],
      eligiblePurposes: ['opening'],
      requiredTag: 'opening_shape',
    };
  }
  if (finding.materialKind === 'proactive_seed') {
    return {
      kind: 'proactive_seed',
      slot: 'proactive_seeds',
      renderPolicy: 'transform_required',
      eligibleModes: ['call', 'proactive_letter', 'social'],
      eligiblePurposes: ['proactive_intent'],
      requiredTag: 'proactive_intent',
    };
  }
  return {
    kind: 'initiative_motive',
    slot: 'motive_candidates',
    renderPolicy: 'decision_context',
    eligibleModes: ['meet_scene', 'date_scene', 'story_planning', 'story_scene'],
    eligiblePurposes: ['scene_planning'],
    requiredTag: 'proactive_intent',
  };
};

const GROUNDING_CLASSES = new Set<HistoryCompanionMaterialGroundingClass>([
  'none',
  'live_semantic_anchor',
  'confirmed_thread',
  'character_life',
  'confirmed_user_state',
  'scene_context',
]);

const CLAIM_KEYS_BY_HISTORY_TAG: Record<
  HistoryCompanionMaterialTag,
  readonly string[]
> = {
  speech_rhythm: ['ordinary_share', 'observation'],
  care_style: ['care_needed', 'mild_discomfort'],
  humor_style: ['humor', 'light_scene'],
  conflict_style: ['emotional_weight', 'refusal'],
  repair_style: ['reentry', 'emotional_weight'],
  initiative_style: ['character_self_share', 'independent_life'],
  boundary_style: ['refusal'],
  affection_style: ['affection_style'],
  stable_habit: ['independent_life'],
  world_detail: ['observation', 'sensory_detail', 'light_scene'],
  relationship_detail: ['relationship_detail'],
  opening_shape: ['opening'],
  fact_free_opening: ['fact_free_opening'],
  scene_permission: ['light_scene', 'scene_planning'],
  proactive_intent: ['proactive_intent', 'character_self_share'],
};

const claimKeysForFinding = (
  finding: HistoryCompanionAnalysisFinding,
): string[] => [...new Set(
  finding.tags.flatMap(tag => CLAIM_KEYS_BY_HISTORY_TAG[tag] || []),
)];

const groundingPolicyForFinding = (
  finding: HistoryCompanionAnalysisFinding,
): CompanionMaterialGroundingPolicy | undefined => {
  if (finding.groundingClass === 'none') return undefined;
  const claimKeys = claimKeysForFinding(finding);
  if (finding.groundingClass === 'live_semantic_anchor') {
    return {
      anyOf: claimKeys.map(claimKey => ({ kind: 'live_user_turn', claimKey })),
    };
  }
  if (finding.groundingClass === 'confirmed_thread') {
    return {
      allOf: [{ kind: 'canonical_thread_receipt', claimKey: 'reentry_thread' }],
    };
  }
  if (finding.groundingClass === 'character_life') {
    return {
      allOf: [{ kind: 'character_life_receipt', claimKey: 'self_life_thread' }],
    };
  }
  if (finding.groundingClass === 'confirmed_user_state') {
    return {
      allOf: [{ kind: 'confirmed_user_state', claimKey: 'care_relevant_state' }],
    };
  }
  return {
    anyOf: claimKeys.map(claimKey => ({ kind: 'scene_context', claimKey })),
  };
};

const groundingClassAllowedForFinding = (
  finding: HistoryCompanionAnalysisFinding,
): boolean => {
  if (finding.lane === 'language_fingerprint') return finding.groundingClass === 'none';
  if (finding.lane === 'stable_detail') return finding.groundingClass === 'live_semantic_anchor';
  if (finding.lane === 'scene_texture') return finding.groundingClass === 'scene_context';
  if (finding.materialKind === 'opening_recipe') {
    return (
      (
        finding.groundingClass === 'none'
        && finding.tags.includes('fact_free_opening')
      )
      || finding.groundingClass === 'live_semantic_anchor'
      || finding.groundingClass === 'confirmed_thread'
      || finding.groundingClass === 'scene_context'
    );
  }
  if (finding.materialKind === 'proactive_seed') {
    return (
      finding.groundingClass === 'none'
      || finding.groundingClass === 'confirmed_thread'
      || finding.groundingClass === 'character_life'
      || finding.groundingClass === 'confirmed_user_state'
    );
  }
  return finding.materialKind === 'initiative_motive'
    && finding.groundingClass === 'scene_context';
};

const sourceSpanKey = (span: HistorySourceSpan): string => (
  `${span.documentId}@${span.documentRevision}:${span.startMessageOffset}-${span.endMessageOffset}`
);

const selectedEvidenceForFinding = (
  finding: HistoryCompanionAnalysisFinding,
  packets: readonly HistoryCompanionAnalysisPacket[],
): HistoryCompanionAnalysisEvidence[] => {
  const evidenceById = new Map(packets.flatMap(packet => packet.evidence).map(item => [item.id, item]));
  return (Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [])
    .map(id => evidenceById.get(id))
    .filter((item): item is HistoryCompanionAnalysisEvidence => Boolean(item));
};

const validateFinding = (
  finding: HistoryCompanionAnalysisFinding,
  packets: readonly HistoryCompanionAnalysisPacket[],
  index: number,
): string[] => {
  const label = `findings[${index}]`;
  const errors: string[] = [];
  if (!finding || typeof finding !== 'object') return [`${label} must be an object`];
  const evidenceIds = Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [];
  const tags: readonly HistoryCompanionMaterialTag[] = Array.isArray(finding.tags)
    ? finding.tags
    : [];
  if (!isNonEmpty(finding.id)) errors.push(`${label}.id is required`);
  if (!packets.some(packet => packet.requestedLanes.includes(finding.lane))) {
    errors.push(`${label}.lane was not requested by the packet`);
  }
  if (!FINDING_DECISIONS.has(finding.decision)) errors.push(`${label}.decision is invalid`);
  if (!unique(evidenceIds)) errors.push(`${label}.evidenceIds must be unique`);
  if (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) {
    errors.push(`${label}.confidence must be between 0 and 1`);
  }
  if (!SPEAKER_RESOLUTIONS.has(finding.speakerResolution)) {
    errors.push(`${label}.speakerResolution is invalid`);
  }
  if (!GROUNDING_CLASSES.has(finding.groundingClass)) {
    errors.push(`${label}.groundingClass is invalid`);
  }
  if (!unique(tags) || tags.length > 6) {
    errors.push(`${label}.tags must be at most six unique controlled values`);
  }
  if (tags.some(tag => !TAGS_BY_LANE[finding.lane]?.has(tag))) {
    errors.push(`${label}.tags cross the lane vocabulary`);
  }
  if (
    finding.decision === 'accepted'
    &&
    finding.groundingClass !== 'none'
    && finding.groundingClass !== 'confirmed_thread'
    && finding.groundingClass !== 'character_life'
    && finding.groundingClass !== 'confirmed_user_state'
    && tags.flatMap(tag => CLAIM_KEYS_BY_HISTORY_TAG[tag] || []).length === 0
  ) {
    errors.push(`${label}.groundingClass requires at least one claim-bearing tag`);
  }
  if (!isNonEmpty(finding.reviewReason)) errors.push(`${label}.reviewReason is required`);
  if (!isNonEmpty(finding.uncertaintyOrConflict)) {
    errors.push(`${label}.uncertaintyOrConflict is required`);
  }
  const packetEvidenceIds = new Set(packets.flatMap(packet => packet.evidence).map(item => item.id));
  evidenceIds.forEach(id => {
    if (!packetEvidenceIds.has(id)) errors.push(`${label} cites evidence outside the packet: ${id}`);
    const ownerPacket = packets.find(packet => packet.evidence.some(item => item.id === id));
    if (
      ownerPacket
      && !getHistoryCompanionAnalysisEvidenceLaneGrant(ownerPacket, id).allowedLanes.includes(finding.lane)
    ) {
      errors.push(`${label} cites evidence without a ${finding.lane} lane grant: ${id}`);
    }
  });
  const selectedEvidence = selectedEvidenceForFinding(finding, packets);

  if (finding.lane === 'opening_proactive') {
    if (!['opening_recipe', 'proactive_seed', 'initiative_motive'].includes(finding.materialKind || '')) {
      errors.push(`${label}.materialKind is required for opening_proactive`);
    }
  } else if (finding.materialKind !== undefined) {
    errors.push(`${label}.materialKind is only legal for opening_proactive`);
  }

  if (finding.decision === 'accepted') {
    if (!groundingClassAllowedForFinding(finding)) {
      errors.push(
        `${label}.groundingClass is incompatible with ${finding.lane}/${finding.materialKind || 'default'}`,
      );
    }
    if (
      finding.materialKind === 'opening_recipe'
      && finding.groundingClass === 'none'
      && (
        !tags.includes('fact_free_opening')
        || tags.includes('relationship_detail')
      )
    ) {
      errors.push(
        `${label}.fact-free opening requires fact_free_opening and may not carry relationship_detail`,
      );
    }
    if (!evidenceIds.length) errors.push(`${label} requires evidence`);
    if (
      !finding.behaviorBoundary
      || finding.behaviorBoundary.variationPreserved !== true
      || finding.behaviorBoundary.fixedReplyTemplate !== false
      || finding.behaviorBoundary.currentStateEffect !== 'none'
      || finding.behaviorBoundary.toolPolicyEffect !== 'none'
    ) {
      errors.push(`${label}.behaviorBoundary must preserve variation, current-state, and tool autonomy`);
    }
    if (!isNonEmpty(finding.guidance)) errors.push(`${label}.guidance is required when accepted`);
    if (finding.guidance.length > 360) errors.push(`${label}.guidance exceeds 360 characters`);
    if (FORBIDDEN_GUIDANCE.test(finding.guidance)) {
      errors.push(`${label}.guidance crosses current-state, tool, or verbatim boundaries`);
    }
    if ((finding.guidance.match(NEGATIVE_GUIDANCE_CLAUSE) || []).length > 1) {
      errors.push(`${label}.guidance must stay generative; put truth boundaries in grounding metadata`);
    }
    if (PROMPT_INJECTION_GUIDANCE.test(finding.guidance)) {
      errors.push(`${label}.guidance contains prompt-control syntax`);
    }
    if (hasSourceOverlap(finding.guidance, packets.flatMap(packet => packet.evidence))) {
      errors.push(`${label}.guidance overlaps source text from the reviewed packet set`);
    }

    const sourceGroupCount = new Set(selectedEvidence.map(item => item.sourceGroupId)).size;
    const material = acceptedFindingMaterial(finding);
    if (material.requiredTag && !tags.includes(material.requiredTag) && tags.length >= 6) {
      errors.push(`${label}.tags leave no room for required ${material.requiredTag}`);
    }
    const requiredEvidenceCount = finding.lane === 'scene_texture' ? 1 : 2;
    if (selectedEvidence.length < requiredEvidenceCount) {
      errors.push(`${label} needs at least ${requiredEvidenceCount} evidence items`);
    }
    if (
      (finding.lane === 'language_fingerprint' || finding.lane === 'stable_detail')
      && sourceGroupCount < 2
    ) {
      errors.push(`${label} needs evidence from at least two source groups`);
    }
    if (finding.lane === 'language_fingerprint') {
      if (selectedEvidence.some(item => item.authorChannel !== 'character')) {
        errors.push(`${label} language fingerprint may only cite character-channel evidence`);
      }
      if (finding.speakerResolution !== 'primary_character_direct') {
        errors.push(`${label} language fingerprint needs direct primary-character ownership`);
      }
      const voice = finding.voiceDiagnostics;
      if (
        !voice
        || voice.nameBlindStatus !== 'passed'
        || voice.commonGoodBehaviorStatus !== 'passed'
        || !voice.mouthShapes?.length
        || !isNonEmpty(voice.attentionLanding)
        || !isNonEmpty(voice.responseRhythm)
        || !isNonEmpty(voice.expressionRange)
        || !isNonEmpty(voice.independentLifePosture)
      ) {
        errors.push(`${label} language fingerprint needs passed anti-generic voice diagnostics`);
      }
    }
  }

  return errors;
};

export const validateHistoryCompanionAnalysisReview = (
  packets: readonly HistoryCompanionAnalysisPacket[],
  review: HistoryCompanionAnalysisReview,
): string[] => {
  const errors = validateHistoryScope(review.scope);
  errors.push(...validateHistoryCompanionAnalysisPacketSet(packets));
  packets.forEach((packet, index) => {
    errors.push(...validateHistoryCompanionAnalysisPacket(packet).map(error => `packets[${index}]: ${error}`));
  });
  if (!packets.length) errors.push('analysis review requires at least one packet');
  if (review.schemaVersion !== HISTORY_COMPANION_ANALYSIS_REVIEW_SCHEMA_VERSION) {
    errors.push('unsupported history companion analysis review schemaVersion');
  }
  if (packets.some(packet => review.packetSchemaVersion !== packet.schemaVersion)) {
    errors.push('analysis review packetSchemaVersion does not match packet');
  }
  const packetIds = Array.isArray(review.packetIds) ? review.packetIds : [];
  if (!unique(packetIds) || !packetIds.length) {
    errors.push('analysis review packetIds must be a non-empty unique list');
  }
  if (!unique(packets.map(packet => packet.id))) errors.push('analysis review supplied packet ids must be unique');
  const expectedPacketIds = packets.map(packet => packet.id).sort();
  if (JSON.stringify([...packetIds].sort()) !== JSON.stringify(expectedPacketIds)) {
    errors.push('analysis review packetIds do not match supplied packets');
  }
  if (packets.some(packet => !sameScope(review.scope, packet.scope))) {
    errors.push('analysis review crosses packet scope');
  }
  if (packets.some(packet => review.sourceRevisionFingerprint !== packet.sourceRevisionFingerprint)) {
    errors.push('analysis review sourceRevisionFingerprint does not match packet');
  }
  const evidenceIds = packets.flatMap(packet => packet.evidence.map(item => item.id));
  if (!unique(evidenceIds)) errors.push('analysis review supplied packets contain duplicate evidence ids');
  if (!isNonEmpty(review.analysisRunId)) errors.push('analysis review analysisRunId is required');
  if (!isNonEmpty(review.extractorVersion)) errors.push('analysis review extractorVersion is required');
  errors.push(...validateHistoryCompanionExecutionPrincipal(
    review.analyzerPrincipal,
    'analysis review analyzer principal',
  ));
  if (
    !review.method
    || !isNonEmpty(review.method.name)
    || !isNonEmpty(review.method.version)
    || !REVIEWER_KINDS.has(review.method.reviewerKind)
  ) {
    errors.push('analysis review requires a structured review method');
  }
  if (!review.analysisPath || typeof review.analysisPath !== 'object') {
    errors.push('analysis review requires a canonical analysisPath');
  } else if (review.analysisPath.kind === 'direct_packet_set') {
    try {
      buildHistoryCompanionAnalysisPrompt({ packets });
    } catch (error) {
      errors.push(
        `direct analysis review exceeds one canonical prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else if (review.analysisPath.kind === 'bounded_synthesis') {
    const { plan, coverageReceipt, batchDraftReceipts, synthesisEnvelope } = review.analysisPath;
    errors.push(...validateHistoryCompanionAnalysisBatchPlan(plan)
      .map(error => `bounded analysis path plan: ${error}`));
    if (
      canonicalHistoryCompanionAuthorityJson(plan.packets)
      !== canonicalHistoryCompanionAuthorityJson(packetAuthorityDescriptors(packets))
    ) {
      errors.push('bounded analysis path plan does not match the reviewed packet set');
    }
    errors.push(...validateHistoryCompanionAnalysisCoverageReceipt(
      plan,
      batchDraftReceipts,
      coverageReceipt,
    ).map(error => `bounded analysis path coverage: ${error}`));
    errors.push(...validateHistoryCompanionAnalysisSynthesisEnvelope(
      plan,
      coverageReceipt,
      batchDraftReceipts,
      synthesisEnvelope,
    ).map(error => `bounded analysis path synthesis: ${error}`));
  } else {
    errors.push('analysis review analysisPath kind is unsupported');
  }
  if (review.status !== 'completed') errors.push('analysis review status must be completed');
  if (review.activationStatus !== 'pending_adjudication') {
    errors.push('analysis review activationStatus must remain pending_adjudication');
  }
  if (!Number.isFinite(review.reviewedAt)) errors.push('analysis review reviewedAt must be finite');
  const findings = Array.isArray(review.findings) ? review.findings : [];
  if (findings.length > 12) errors.push('analysis review may contain at most 12 findings');
  if (!unique(findings.map(item => item?.id))) errors.push('analysis review finding ids must be unique');
  findings.forEach((finding, index) => {
    errors.push(...validateFinding(finding, packets, index));
  });
  errors.push(...findForbiddenFields(review));
  return errors;
};

/**
 * The model returns findings only. Scope, packet set, source revision and
 * reviewer identity are captured by the caller so prompt text cannot rewrite
 * the authority envelope.
 */
const createHistoryCompanionAnalysisReviewWithPath = (
  input: CreateHistoryCompanionAnalysisReviewInput,
  analysisPath: HistoryCompanionAnalysisReview['analysisPath'],
): HistoryCompanionAnalysisReview => {
  if (!input.packets.length) throw new Error('history companion analysis review requires packets');
  input.packets.forEach((packet, index) => {
    const errors = validateHistoryCompanionAnalysisPacket(packet);
    if (errors.length) throw new Error(`Invalid analysis packet[${index}]: ${errors.join('; ')}`);
  });
  const [first] = input.packets;
  if (input.packets.some(packet => !sameScope(packet.scope, first.scope))) {
    throw new Error('history companion analysis review packets cross scope');
  }
  if (input.packets.some(packet => packet.sourceRevisionFingerprint !== first.sourceRevisionFingerprint)) {
    throw new Error('history companion analysis review packets cross source revision');
  }
  const principalErrors = validateHistoryCompanionExecutionPrincipal(
    input.analyzerPrincipal,
    'analysis review analyzer principal',
  );
  if (principalErrors.length) {
    throw new Error(`Invalid history companion analysis review: ${principalErrors.join('; ')}`);
  }
  const review: HistoryCompanionAnalysisReview = {
    schemaVersion: HISTORY_COMPANION_ANALYSIS_REVIEW_SCHEMA_VERSION,
    packetSchemaVersion: first.schemaVersion,
    packetIds: input.packets.map(packet => packet.id).sort(),
    scope: { ...first.scope },
    sourceRevisionFingerprint: first.sourceRevisionFingerprint,
    analysisRunId: input.analysisRunId,
    extractorVersion: input.extractorVersion,
    analyzerPrincipal: { ...input.analyzerPrincipal! },
    method: { ...input.method },
    analysisPath,
    status: 'completed',
    activationStatus: 'pending_adjudication',
    findings: [...input.findings],
    reviewedAt: input.reviewedAt ?? Date.now(),
  };
  const errors = validateHistoryCompanionAnalysisReview(input.packets, review);
  if (errors.length) throw new Error(`Invalid history companion analysis review: ${errors.join('; ')}`);
  return review;
};

export const createHistoryCompanionAnalysisReview = (
  input: CreateHistoryCompanionAnalysisReviewInput,
): HistoryCompanionAnalysisReview => {
  // This is the only legal direct path. Large packet sets must use the
  // bounded-synthesis factory below instead of bypassing prompt coverage.
  buildHistoryCompanionAnalysisPrompt({ packets: input.packets });
  return createHistoryCompanionAnalysisReviewWithPath(input, {
    kind: 'direct_packet_set',
  });
};

export const createHistoryCompanionAnalysisReviewFromSynthesis = (
  input: CreateHistoryCompanionAnalysisReviewFromSynthesisInput,
): HistoryCompanionAnalysisReview => {
  const planErrors = validateHistoryCompanionAnalysisBatchPlan(input.plan);
  if (planErrors.length) {
    throw new Error(`Invalid bounded analysis plan: ${planErrors.join('; ')}`);
  }
  if (
    canonicalHistoryCompanionAuthorityJson(input.plan.packets)
    !== canonicalHistoryCompanionAuthorityJson(packetAuthorityDescriptors(input.packets))
  ) {
    throw new Error('bounded analysis plan does not match the reviewed packet set');
  }
  const coverageErrors = validateHistoryCompanionAnalysisCoverageReceipt(
    input.plan,
    input.batchDraftReceipts,
    input.coverageReceipt,
  );
  if (coverageErrors.length) {
    throw new Error(`Invalid bounded analysis coverage: ${coverageErrors.join('; ')}`);
  }
  const synthesisErrors = validateHistoryCompanionAnalysisSynthesisEnvelope(
    input.plan,
    input.coverageReceipt,
    input.batchDraftReceipts,
    input.synthesisEnvelope,
  );
  if (synthesisErrors.length) {
    throw new Error(`Invalid bounded analysis synthesis: ${synthesisErrors.join('; ')}`);
  }
  return createHistoryCompanionAnalysisReviewWithPath(input, {
    kind: 'bounded_synthesis',
    plan: input.plan,
    coverageReceipt: input.coverageReceipt,
    batchDraftReceipts: [...input.batchDraftReceipts],
    synthesisEnvelope: input.synthesisEnvelope,
  });
};

const sameStringSet = (
  left: readonly string[],
  right: readonly string[],
): boolean => (
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
);

export const validateHistoryCompanionAnalysisAdjudication = (
  packets: readonly HistoryCompanionAnalysisPacket[],
  review: HistoryCompanionAnalysisReview,
  receipt: HistoryCompanionAnalysisAdjudicationReceipt,
): string[] => {
  const errors = validateHistoryCompanionAnalysisReview(packets, review)
    .map(error => `source review: ${error}`);
  if (!receipt || typeof receipt !== 'object') {
    return [...errors, 'analysis adjudication receipt must be an object'];
  }
  errors.push(...validateHistoryScope(receipt.scope));
  if (receipt.schemaVersion !== HISTORY_COMPANION_ANALYSIS_ADJUDICATION_SCHEMA_VERSION) {
    errors.push('unsupported history companion analysis adjudication schemaVersion');
  }
  const packetIds = Array.isArray(receipt.packetIds) ? receipt.packetIds : [];
  if (!packetIds.length || !unique(packetIds) || !sameStringSet(packetIds, review.packetIds)) {
    errors.push('analysis adjudication packetIds do not match the source review');
  }
  if (!sameScope(receipt.scope, review.scope)) {
    errors.push('analysis adjudication crosses source review scope');
  }
  if (receipt.sourceRevisionFingerprint !== review.sourceRevisionFingerprint) {
    errors.push('analysis adjudication sourceRevisionFingerprint does not match the source review');
  }
  if (receipt.sourceAnalysisRunId !== review.analysisRunId) {
    errors.push('analysis adjudication sourceAnalysisRunId does not match the source review');
  }
  if (!isNonEmpty(receipt.adjudicationRunId)) {
    errors.push('analysis adjudication adjudicationRunId is required');
  } else if (receipt.adjudicationRunId === review.analysisRunId) {
    errors.push('analysis adjudication must use a different run identity');
  }
  errors.push(...validateHistoryCompanionExecutionPrincipal(
    receipt.adjudicatorPrincipal,
    'analysis adjudication principal',
  ));
  if (
    !receipt.method
    || !isNonEmpty(receipt.method.name)
    || !isNonEmpty(receipt.method.version)
    || !ADJUDICATOR_KINDS.has(receipt.method.reviewerKind)
  ) {
    errors.push('analysis adjudication requires a supported second-pass or independent method');
  } else if (receipt.adjudicatorPrincipal && review.analyzerPrincipal) {
    const samePrincipal = (
      historyCompanionExecutionPrincipalKey(receipt.adjudicatorPrincipal)
      === historyCompanionExecutionPrincipalKey(review.analyzerPrincipal)
    );
    const sameModelRuntime = (
      receipt.adjudicatorPrincipal.kind === 'model_runtime'
      && review.analyzerPrincipal.kind === 'model_runtime'
      && receipt.adjudicatorPrincipal.provider === review.analyzerPrincipal.provider
      && receipt.adjudicatorPrincipal.modelOrActor === review.analyzerPrincipal.modelOrActor
    );
    if (receipt.method.reviewerKind === 'same_model_second_pass') {
      if (!sameModelRuntime) {
        errors.push('same-model second pass must use the analyzer provider and model');
      }
    } else {
      if (samePrincipal) {
        errors.push('independent adjudication must use a different execution principal');
      }
      if (
        receipt.method.reviewerKind === 'independent_model_adjudication'
        && sameModelRuntime
      ) {
        errors.push('independent model adjudication cannot reuse the analyzer provider and model');
      }
    }
  }
  if (receipt.status !== 'completed') errors.push('analysis adjudication status must be completed');
  if (!Number.isFinite(receipt.adjudicatedAt)) {
    errors.push('analysis adjudication adjudicatedAt must be finite');
  }

  const sourceFindings = review.findings.filter(finding => finding.decision === 'accepted');
  const adjudications = Array.isArray(receipt.findings) ? receipt.findings : [];
  if (!unique(adjudications.map(item => item?.findingId))) {
    errors.push('analysis adjudication finding ids must be unique');
  }
  if (!sameStringSet(
    adjudications.map(item => item?.findingId),
    sourceFindings.map(item => item.id),
  )) {
    errors.push('analysis adjudication must resolve every accepted source finding exactly once');
  }

  const sourceFindingById = new Map(sourceFindings.map(finding => [finding.id, finding]));
  const evidenceById = new Map(
    packets.flatMap(packet => packet.evidence).map(evidence => [evidence.id, evidence]),
  );
  adjudications.forEach((adjudication, index) => {
    const label = `adjudication.findings[${index}]`;
    if (!adjudication || typeof adjudication !== 'object') {
      errors.push(`${label} must be an object`);
      return;
    }
    const sourceFinding = sourceFindingById.get(adjudication.findingId);
    if (!sourceFinding) {
      errors.push(`${label}.findingId does not name an accepted source finding`);
      return;
    }
    if (!ADJUDICATION_DECISIONS.has(adjudication.decision)) {
      errors.push(`${label}.decision is invalid`);
    }
    if (!isNonEmpty(adjudication.reason)) errors.push(`${label}.reason is required`);
    const attributions: readonly HistoryCompanionEvidenceSpeakerAttribution[] = Array.isArray(
      adjudication.evidenceSpeakerAttributions,
    )
      ? adjudication.evidenceSpeakerAttributions as readonly HistoryCompanionEvidenceSpeakerAttribution[]
      : [];
    if (!unique(attributions.map(item => item?.evidenceId))) {
      errors.push(`${label}.evidence speaker attributions must be unique`);
    }
    if (!sameStringSet(
      attributions.map(item => item?.evidenceId),
      sourceFinding.evidenceIds,
    )) {
      errors.push(`${label} must attribute every cited evidence item exactly once`);
    }
    attributions.forEach((attribution, attributionIndex) => {
      const attributionLabel = `${label}.evidenceSpeakerAttributions[${attributionIndex}]`;
      if (!attribution || typeof attribution !== 'object') {
        errors.push(`${attributionLabel} must be an object`);
        return;
      }
      const evidence = evidenceById.get(attribution.evidenceId);
      if (!evidence) errors.push(`${attributionLabel}.evidenceId is outside the packet set`);
      if (!SPEAKER_RESOLUTIONS.has(attribution.speakerResolution)) {
        errors.push(`${attributionLabel}.speakerResolution is invalid`);
      }
      if (!isNonEmpty(attribution.reason)) errors.push(`${attributionLabel}.reason is required`);
      if (
        evidence?.authorChannel === 'user'
        && attribution.speakerResolution === 'primary_character_direct'
      ) {
        errors.push(`${attributionLabel} cannot attribute a user-channel item to the primary character`);
      }
    });

    if (adjudication.decision === 'approved') {
      if (
        sourceFinding.speakerResolution === 'primary_character_direct'
        && attributions.some(item => item.speakerResolution !== 'primary_character_direct')
      ) {
        errors.push(`${label} contradicts the source finding's claimed direct speaker ownership`);
      }
      if (
        sourceFinding.lane === 'language_fingerprint'
        && attributions.some(item => item.speakerResolution !== 'primary_character_direct')
      ) {
        errors.push(`${label} language fingerprint requires independently confirmed direct character speech`);
      }
    }
  });

  errors.push(...findForbiddenFields(receipt, 'adjudication'));
  return errors;
};

export const createHistoryCompanionAnalysisAdjudicationReceipt = (
  input: CreateHistoryCompanionAnalysisAdjudicationInput,
): HistoryCompanionAnalysisAdjudicationReceipt => {
  const principalErrors = validateHistoryCompanionExecutionPrincipal(
    input.adjudicatorPrincipal,
    'analysis adjudication principal',
  );
  if (principalErrors.length) {
    throw new Error(`Invalid history companion analysis adjudication: ${principalErrors.join('; ')}`);
  }
  const receipt: HistoryCompanionAnalysisAdjudicationReceipt = {
    schemaVersion: HISTORY_COMPANION_ANALYSIS_ADJUDICATION_SCHEMA_VERSION,
    packetIds: [...input.review.packetIds].sort(),
    scope: { ...input.review.scope },
    sourceRevisionFingerprint: input.review.sourceRevisionFingerprint,
    sourceAnalysisRunId: input.review.analysisRunId,
    adjudicationRunId: input.adjudicationRunId,
    adjudicatorPrincipal: { ...input.adjudicatorPrincipal! },
    method: { ...input.method },
    status: 'completed',
    findings: [...input.findings],
    adjudicatedAt: input.adjudicatedAt ?? Date.now(),
  };
  const errors = validateHistoryCompanionAnalysisAdjudication(
    input.packets,
    input.review,
    receipt,
  );
  if (errors.length) {
    throw new Error(`Invalid history companion analysis adjudication: ${errors.join('; ')}`);
  }
  return receipt;
};

export const finalizeHistoryCompanionAnalysisReview = (
  packets: readonly HistoryCompanionAnalysisPacket[],
  review: HistoryCompanionAnalysisReview,
  adjudication?: HistoryCompanionAnalysisAdjudicationReceipt,
): HistoryCompanionAnalysisFinalization => {
  const errors = validateHistoryCompanionAnalysisReview(packets, review);
  if (errors.length) {
    throw new Error(`Invalid history companion analysis review: ${errors.join('; ')}`);
  }
  if (!adjudication) {
    throw new Error('History companion analysis remains pending until a second-pass adjudication');
  }
  const adjudicationErrors = validateHistoryCompanionAnalysisAdjudication(
    packets,
    review,
    adjudication,
  );
  if (adjudicationErrors.length) {
    throw new Error(`Invalid history companion analysis adjudication: ${adjudicationErrors.join('; ')}`);
  }
  const approvedFindingIds = new Set(
    adjudication.findings
      .filter(finding => finding.decision === 'approved')
      .map(finding => finding.findingId),
  );

  const candidates: HistoryCompanionMaterialCandidate[] = review.findings
    .filter(finding => finding.decision === 'accepted' && approvedFindingIds.has(finding.id))
    .map(finding => {
      const material = acceptedFindingMaterial(finding);
      const selectedEvidence = selectedEvidenceForFinding(finding, packets);
      const sourceRefs = [...new Map(selectedEvidence.map(item => [
        sourceSpanKey(item.sourceRef),
        item.sourceRef,
      ])).values()];
      const tags = material.requiredTag && !finding.tags.includes(material.requiredTag)
        ? [...finding.tags, material.requiredTag]
        : [...finding.tags];
      return {
        schemaVersion: HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION,
        id: `history-material-candidate-${authorityId({
          packetIds: [...review.packetIds].sort(),
          reviewRunId: review.analysisRunId,
          adjudicationRunId: adjudication.adjudicationRunId,
          findingId: finding.id,
        })}`,
        scope: { ...review.scope },
        temporalClass: 'historical',
        analysisRunId: review.analysisRunId,
        extractorVersion: review.extractorVersion,
        authority: 'model_reconstructed',
        confidence: finding.confidence,
        sourceRefs,
        kind: material.kind,
        slot: material.slot,
        guidance: finding.guidance.trim(),
        renderPolicy: material.renderPolicy,
        knowledge: 'relationship_private',
        continuity: 'relationship',
        eligibleModes: [...material.eligibleModes],
        eligiblePurposes: [...material.eligiblePurposes],
        tags,
        groundingClass: finding.groundingClass,
        groundingPolicy: groundingPolicyForFinding(finding),
        status: 'active',
        createdAt: adjudication.adjudicatedAt,
        updatedAt: adjudication.adjudicatedAt,
        revision: 1,
      };
    });

  const pass: HistoryCompanionMaterialPass = {
    schemaVersion: HISTORY_COMPANION_MATERIAL_SCHEMA_VERSION,
    id: `history-material-pass-${authorityId({
      packetIds: [...review.packetIds].sort(),
      reviewRunId: review.analysisRunId,
      adjudicationRunId: adjudication.adjudicationRunId,
    })}`,
    scope: { ...review.scope },
    sourceRevisionFingerprint: review.sourceRevisionFingerprint,
    analysisSnapshotId: `history-analysis-packets-${authorityId({
      packetIds: [...review.packetIds].sort(),
    })}`,
    analysisRunId: review.analysisRunId,
    extractorVersion: review.extractorVersion,
    status: 'active',
    candidates,
    createdAt: adjudication.adjudicatedAt,
    updatedAt: adjudication.adjudicatedAt,
    revision: 1,
  };
  const authority = createHistoryCompanionAnalysisAuthority({
    packets,
    review,
    adjudication,
    pass,
    finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  });
  const finalization: HistoryCompanionAnalysisFinalization = {
    pass,
    ...authority,
  };
  const authorityErrors = validateHistoryCompanionAnalysisAuthorityEnvelope({
    packets,
    review,
    adjudication,
    finalization,
    finalizerVersion: HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  });
  if (authorityErrors.length) {
    throw new Error(`Invalid history companion analysis authority: ${authorityErrors.join('; ')}`);
  }
  return finalization;
};

/**
 * Authority-grade validation. Unlike the digest-only envelope check, this
 * reruns every packet/review/adjudication gate and mechanically re-derives the
 * pass before comparing the whole finalization.
 */
export const validateHistoryCompanionAnalysisFinalization = (input: {
  packets: readonly HistoryCompanionAnalysisPacket[];
  review: HistoryCompanionAnalysisReview;
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt;
  finalization: HistoryCompanionAnalysisFinalization;
  finalizerVersion: string;
}): string[] => {
  if (input.finalizerVersion !== HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION) {
    return ['history companion analysis finalizerVersion is unsupported'];
  }
  let expected: HistoryCompanionAnalysisFinalization;
  try {
    expected = finalizeHistoryCompanionAnalysisReview(
      input.packets,
      input.review,
      input.adjudication,
    );
  } catch (error) {
    return [
      `history companion analysis inputs cannot produce a canonical finalization: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }
  if (
    canonicalHistoryCompanionAuthorityJson(input.finalization)
    !== canonicalHistoryCompanionAuthorityJson(expected)
  ) {
    return ['history companion finalization is not the canonical output of its validated findings'];
  }
  return [];
};

export const appendHistoryCompanionAnalysisFinalizationReceipt = (
  ledger: readonly HistoryCompanionActivationReceiptLedgerEntry[],
  input: {
    packets: readonly HistoryCompanionAnalysisPacket[];
    review: HistoryCompanionAnalysisReview;
    adjudication: HistoryCompanionAnalysisAdjudicationReceipt;
    finalization: HistoryCompanionAnalysisFinalization;
    finalizerVersion: string;
  },
): readonly HistoryCompanionActivationReceiptLedgerEntry[] => {
  const authorityErrors = validateHistoryCompanionAnalysisFinalization(input);
  if (authorityErrors.length) {
    throw new Error(`Invalid history companion finalization: ${authorityErrors.join('; ')}`);
  }
  return appendCanonicalHistoryCompanionActivationReceipt(
    ledger,
    input.finalization.activationReceipt,
  );
};
