import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
} from './builtInDeepspaceReviewed.ts';
import type { CompanionMaterialRecord } from './types.ts';

/**
 * Signals are deliberately small, stable categories that a non-vector query
 * analyser can produce. They describe the immediate conversational shape,
 * never a character, a relationship fact, or a required line of dialogue.
 */
export type BuiltInDeepspaceRetrievalSignal =
  | 'ordinary_share'
  | 'mild_discomfort'
  | 'refusal'
  | 'reentry'
  | 'light_scene'
  | 'character_self_share'
  | 'care_needed'
  | 'observation'
  | 'humor'
  | 'practical_next_step'
  | 'playful_premise'
  | 'choice_tradeoff'
  | 'independent_life'
  | 'opening'
  | 'proactive_intent'
  | 'no_advice_chat'
  | 'low_signal';

export type BuiltInDeepspaceActivationPolicy =
  | 'voice_fallback'
  | 'relevance_required';

/**
 * Retrieval metadata only. It does not become prompt text, a current motive,
 * a relationship assertion, or a tool policy. `variationGroup` gives a later
 * selector a rotation boundary for similarly-shaped material.
 */
export interface BuiltInDeepspaceRetrievalCalibration {
  activationPolicy: BuiltInDeepspaceActivationPolicy;
  positiveSignals: readonly BuiltInDeepspaceRetrievalSignal[];
  suppressSignals: readonly BuiltInDeepspaceRetrievalSignal[];
  variationGroup: string;
  fallbackPriority: number;
}

export const BUILT_IN_DEEPSPACE_RETRIEVAL_CALIBRATION_BY_MATERIAL_ID = {
  'builtin-qiyu-voice-observed-entry-v1': {
    activationPolicy: 'voice_fallback',
    positiveSignals: ['ordinary_share', 'observation', 'light_scene'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal', 'reentry'],
    variationGroup: 'observation_entry',
    fallbackPriority: 20,
  },
  'builtin-qiyu-voice-playful-turn-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['ordinary_share', 'light_scene', 'humor'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal', 'reentry'],
    variationGroup: 'light_turn',
    fallbackPriority: 0,
  },
  'builtin-qiyu-voice-playful-care-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['mild_discomfort', 'care_needed'],
    suppressSignals: ['low_signal', 'refusal', 'no_advice_chat'],
    variationGroup: 'optional_care',
    fallbackPriority: 0,
  },
  'builtin-qiyu-voice-own-rhythm-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['reentry', 'character_self_share', 'independent_life', 'refusal'],
    suppressSignals: [],
    variationGroup: 'independent_life',
    fallbackPriority: 0,
  },
  'builtin-qiyu-agency-share-observation-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['ordinary_share', 'observation', 'light_scene'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal', 'reentry'],
    variationGroup: 'collaborative_initiative',
    fallbackPriority: 0,
  },
  'builtin-qiyu-detail-living-texture-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['observation', 'light_scene'],
    suppressSignals: ['low_signal', 'mild_discomfort', 'care_needed'],
    variationGroup: 'situated_detail',
    fallbackPriority: 0,
  },
  'builtin-qiyu-opening-curious-hook-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['opening', 'observation', 'light_scene', 'character_self_share'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal'],
    variationGroup: 'curious_opening',
    fallbackPriority: 0,
  },
  'builtin-qiyu-opening-reentry-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['reentry'],
    suppressSignals: [],
    variationGroup: 'reentry_opening',
    fallbackPriority: 0,
  },
  'builtin-qiyu-proactive-own-thread-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['proactive_intent', 'character_self_share', 'independent_life'],
    suppressSignals: ['mild_discomfort', 'care_needed'],
    variationGroup: 'independent_proactive',
    fallbackPriority: 0,
  },
  'builtin-qiyu-proactive-optional-care-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['mild_discomfort', 'care_needed'],
    suppressSignals: ['low_signal', 'refusal', 'no_advice_chat'],
    variationGroup: 'optional_care',
    fallbackPriority: 0,
  },
  'builtin-lishen-voice-concrete-entry-v1': {
    activationPolicy: 'voice_fallback',
    positiveSignals: ['ordinary_share', 'observation', 'light_scene'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal', 'reentry'],
    variationGroup: 'observation_entry',
    fallbackPriority: 20,
  },
  'builtin-lishen-voice-calm-confirmation-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['ordinary_share', 'refusal', 'reentry'],
    suppressSignals: ['care_needed'],
    variationGroup: 'calm_response',
    fallbackPriority: 0,
  },
  'builtin-lishen-voice-practical-care-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['mild_discomfort', 'care_needed', 'practical_next_step'],
    suppressSignals: ['low_signal', 'refusal', 'no_advice_chat'],
    variationGroup: 'optional_care',
    fallbackPriority: 0,
  },
  'builtin-lishen-voice-own-perspective-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['character_self_share', 'independent_life', 'reentry'],
    suppressSignals: [],
    variationGroup: 'independent_life',
    fallbackPriority: 0,
  },
  'builtin-lishen-voice-ask-before-concluding-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['practical_next_step'],
    suppressSignals: ['low_signal', 'mild_discomfort', 'care_needed'],
    variationGroup: 'paced_judgment',
    fallbackPriority: 0,
  },
  'builtin-lishen-agency-next-step-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['care_needed', 'practical_next_step'],
    suppressSignals: ['low_signal', 'refusal', 'no_advice_chat'],
    variationGroup: 'practical_agency',
    fallbackPriority: 0,
  },
  'builtin-lishen-detail-routine-texture-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['observation', 'light_scene', 'character_self_share'],
    suppressSignals: ['low_signal', 'mild_discomfort', 'care_needed'],
    variationGroup: 'situated_detail',
    fallbackPriority: 0,
  },
  'builtin-lishen-opening-observed-detail-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['opening', 'observation', 'light_scene', 'character_self_share'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal'],
    variationGroup: 'observed_opening',
    fallbackPriority: 0,
  },
  'builtin-lishen-proactive-own-thread-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['proactive_intent', 'character_self_share', 'independent_life'],
    suppressSignals: ['mild_discomfort', 'care_needed'],
    variationGroup: 'independent_proactive',
    fallbackPriority: 0,
  },
  'builtin-lishen-proactive-calm-reentry-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['reentry'],
    suppressSignals: [],
    variationGroup: 'reentry_proactive',
    fallbackPriority: 0,
  },
  'builtin-shenxinghui-voice-even-playful-premise-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['playful_premise'],
    suppressSignals: [
      'low_signal',
      'mild_discomfort',
      'care_needed',
      'refusal',
      'reentry',
      'character_self_share',
      'independent_life',
      'no_advice_chat',
    ],
    variationGroup: 'even_playful_premise',
    fallbackPriority: 0,
  },
  'builtin-qinche-voice-criterion-led-reframe-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['choice_tradeoff', 'playful_premise'],
    suppressSignals: [
      'low_signal',
      'mild_discomfort',
      'care_needed',
      'refusal',
      'reentry',
      'character_self_share',
      'independent_life',
      'no_advice_chat',
    ],
    variationGroup: 'criterion_led_reframe',
    fallbackPriority: 0,
  },
  'builtin-xiayizhou-voice-warm-playful-continuation-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['playful_premise'],
    suppressSignals: [
      'low_signal',
      'mild_discomfort',
      'care_needed',
      'refusal',
      'reentry',
      'character_self_share',
      'independent_life',
      'no_advice_chat',
    ],
    variationGroup: 'warm_playful_continuation',
    fallbackPriority: 0,
  },
} as const satisfies Readonly<Record<string, BuiltInDeepspaceRetrievalCalibration>>;

export type BuiltInDeepspaceCalibratedMaterialId = keyof typeof BUILT_IN_DEEPSPACE_RETRIEVAL_CALIBRATION_BY_MATERIAL_ID;

export const builtInDeepspaceRetrievalCalibrationFor = (
  materialId: string,
): BuiltInDeepspaceRetrievalCalibration | undefined => (
  BUILT_IN_DEEPSPACE_RETRIEVAL_CALIBRATION_BY_MATERIAL_ID[materialId as BuiltInDeepspaceCalibratedMaterialId]
);

export const builtInDeepspaceRetrievalCalibrationForCharacter = (
  charId: string,
): readonly CompanionMaterialRecord[] => (
  BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL
    .filter(record => record.charId === charId)
    .flatMap(record => {
      const retrievalHints = record.retrievalHints
        || builtInDeepspaceRetrievalCalibrationFor(record.id);
      return retrievalHints ? [{ ...record, retrievalHints }] : [];
    })
);

/**
 * Keep the calibration data independently checkable before a future selector
 * consumes it. The return value is intentionally diagnostic rather than a
 * policy decision: callers retain ownership of selection and delivery.
 */
export const validateBuiltInDeepspaceRetrievalCalibration = (): readonly string[] => {
  const errors: string[] = [];
  const reviewedIds = new Set(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.map(record => record.id));

  // The map retains dormant baseline calibrations for audit/revision history.
  // Only records in the reviewed export are loadable at runtime.
  reviewedIds.forEach(materialId => {
    const record = BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.find(item => item.id === materialId);
    if (!record?.retrievalHints && !builtInDeepspaceRetrievalCalibrationFor(materialId)) {
      errors.push(`missing calibration: ${materialId}`);
    }
  });

  const signalPattern = /^[a-z]+(?:_[a-z]+)*$/;
  const effectiveCalibrations = BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL
    .map(record => [
      record.id,
      record.retrievalHints || builtInDeepspaceRetrievalCalibrationFor(record.id),
    ] as const)
    .filter((entry): entry is readonly [string, BuiltInDeepspaceRetrievalCalibration] => Boolean(entry[1]));
  effectiveCalibrations.forEach(([materialId, calibration]) => {
    if (!calibration.variationGroup || !signalPattern.test(calibration.variationGroup)) {
      errors.push(`invalid variation group: ${materialId}`);
    }
    if (!Number.isFinite(calibration.fallbackPriority) || calibration.fallbackPriority < 0) {
      errors.push(`invalid fallback priority: ${materialId}`);
    }
    [...calibration.positiveSignals, ...calibration.suppressSignals].forEach(signal => {
      if (!signalPattern.test(signal)) errors.push(`invalid retrieval signal: ${materialId}:${signal}`);
    });
  });

  const recordsByCharacter = [
    BUILT_IN_DEEPSPACE_QIYU_ID,
    BUILT_IN_DEEPSPACE_LISHEN_ID,
    BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
    BUILT_IN_DEEPSPACE_QINCHE_ID,
    BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
  ]
    .map(charId => ({
      charId,
      records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
    }));

  recordsByCharacter.forEach(({ charId, records }) => {
    const fallbackCount = records.filter(record => record.retrievalHints?.activationPolicy === 'voice_fallback').length;
    const allowsFallback = (
      charId === BUILT_IN_DEEPSPACE_QIYU_ID
      || charId === BUILT_IN_DEEPSPACE_LISHEN_ID
    );
    if (fallbackCount > 2 || (!allowsFallback && fallbackCount !== 0)) {
      errors.push(`fallback count is invalid: ${charId}:${fallbackCount}`);
    }
    records
      .filter(record => record.slot === 'relevant_stable_details')
      .forEach(record => {
        if (record.retrievalHints?.activationPolicy !== 'relevance_required') {
          errors.push(`stable detail must require relevance: ${record.id}`);
        }
      });
    records
      .filter(record => record.tags.includes('care'))
      .forEach(record => {
        if (record.retrievalHints?.activationPolicy !== 'relevance_required') {
          errors.push(`care must require relevance: ${record.id}`);
        }
      });
  });

  return errors;
};
