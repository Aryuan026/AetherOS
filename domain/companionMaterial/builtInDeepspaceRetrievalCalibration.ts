import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL,
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
  | 'independent_life'
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
    suppressSignals: ['low_signal', 'refusal'],
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
    positiveSignals: ['observation', 'light_scene', 'character_self_share'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal'],
    variationGroup: 'curious_opening',
    fallbackPriority: 0,
  },
  'builtin-qiyu-opening-reentry-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['reentry', 'independent_life'],
    suppressSignals: [],
    variationGroup: 'reentry_opening',
    fallbackPriority: 0,
  },
  'builtin-qiyu-proactive-own-thread-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['character_self_share', 'independent_life'],
    suppressSignals: ['mild_discomfort', 'care_needed'],
    variationGroup: 'independent_proactive',
    fallbackPriority: 0,
  },
  'builtin-qiyu-proactive-optional-care-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['mild_discomfort', 'care_needed'],
    suppressSignals: ['low_signal', 'refusal'],
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
    suppressSignals: ['low_signal', 'refusal'],
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
    suppressSignals: ['low_signal', 'refusal'],
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
    positiveSignals: ['observation', 'light_scene', 'character_self_share'],
    suppressSignals: ['mild_discomfort', 'care_needed', 'refusal'],
    variationGroup: 'observed_opening',
    fallbackPriority: 0,
  },
  'builtin-lishen-proactive-own-thread-v1': {
    activationPolicy: 'relevance_required',
    positiveSignals: ['character_self_share', 'independent_life'],
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
      const retrievalHints = builtInDeepspaceRetrievalCalibrationFor(record.id);
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
  const calibrationIds = Object.keys(BUILT_IN_DEEPSPACE_RETRIEVAL_CALIBRATION_BY_MATERIAL_ID);

  calibrationIds.forEach(materialId => {
    if (!reviewedIds.has(materialId)) errors.push(`unknown calibrated material: ${materialId}`);
  });
  reviewedIds.forEach(materialId => {
    if (!builtInDeepspaceRetrievalCalibrationFor(materialId)) errors.push(`missing calibration: ${materialId}`);
  });

  const signalPattern = /^[a-z]+(?:_[a-z]+)*$/;
  Object.entries(BUILT_IN_DEEPSPACE_RETRIEVAL_CALIBRATION_BY_MATERIAL_ID).forEach(([materialId, calibration]) => {
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

  const recordsByCharacter = [BUILT_IN_DEEPSPACE_QIYU_ID, BUILT_IN_DEEPSPACE_LISHEN_ID]
    .map(charId => ({
      charId,
      records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
    }));

  recordsByCharacter.forEach(({ charId, records }) => {
    const fallbackCount = records.filter(record => record.retrievalHints?.activationPolicy === 'voice_fallback').length;
    if (fallbackCount < 1 || fallbackCount > 2) {
      errors.push(`fallback count outside 1-2: ${charId}:${fallbackCount}`);
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
