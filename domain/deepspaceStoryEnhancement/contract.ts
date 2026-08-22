import {
  DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION,
  type DeepspaceStoryEnhancementPack,
  type DeepspaceStoryRuntimeContext,
} from './types.ts';
import type {
  WorldbookContinuityRef,
  WorldbookProjectionConsumerKind,
} from '../worldbook/types.ts';

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && Boolean(value.trim())
);

const uniqueNonEmpty = (values: readonly string[] | undefined): boolean => (
  Array.isArray(values)
  && values.every(nonEmpty)
  && new Set(values).size === values.length
);

const CONSUMERS = new Set<WorldbookProjectionConsumerKind>([
  'chat',
  'call',
  'date',
  'story_mainline',
  'story_if',
  'world_director',
  'worldbook_preview',
  'other',
]);

export const validateDeepspaceStoryEnhancementPack = (
  pack: DeepspaceStoryEnhancementPack,
): string[] => {
  const errors: string[] = [];
  if (pack.schemaVersion !== DEEPSPACE_STORY_ENHANCEMENT_SCHEMA_VERSION) {
    errors.push('schemaVersion is unsupported');
  }
  ['id', 'worldbookEntryId', 'charId', 'worldlineId', 'routeStage'].forEach(field => {
    if (!nonEmpty(pack[field as keyof DeepspaceStoryEnhancementPack])) {
      errors.push(`${field} is required`);
    }
  });
  if (!uniqueNonEmpty(pack.runtimeGate?.allowedConsumers)) {
    errors.push('runtimeGate.allowedConsumers must be a non-empty unique list');
  } else if (pack.runtimeGate.allowedConsumers.some(consumer => !CONSUMERS.has(consumer))) {
    errors.push('runtimeGate.allowedConsumers contains an invalid consumer');
  }
  if (
    pack.runtimeGate.identityModes !== undefined
    && !uniqueNonEmpty(pack.runtimeGate.identityModes)
  ) {
    errors.push('runtimeGate.identityModes must be a unique non-empty list when present');
  }
  if (
    pack.runtimeGate.relationshipStageIds !== undefined
    && !uniqueNonEmpty(pack.runtimeGate.relationshipStageIds)
  ) {
    errors.push('runtimeGate.relationshipStageIds must be a unique non-empty list when present');
  }
  if (pack.activation !== 'explicit_opt_in') errors.push('activation must be explicit_opt_in');
  if (pack.defaultMounted !== false) errors.push('defaultMounted must be false');
  if (pack.truthEffect !== 'none') errors.push('truthEffect must be none');
  if (pack.mergePolicy !== 'additive_not_rewrite') errors.push('mergePolicy must be additive_not_rewrite');
  if (!uniqueNonEmpty(pack.prohibitedInferences)) errors.push('prohibitedInferences are required');
  if (!Array.isArray(pack.unresolvedClaims) || !pack.unresolvedClaims.every(nonEmpty)) {
    errors.push('unresolvedClaims must contain only non-empty text');
  }
  if (!uniqueNonEmpty(pack.sourceRefIds)) errors.push('sourceRefIds are required');
  return errors;
};

export const storyEnhancementPackAllowsRuntime = (input: {
  pack: DeepspaceStoryEnhancementPack;
  charId: string;
  consumer: WorldbookProjectionConsumerKind;
  continuity?: WorldbookContinuityRef;
  context?: DeepspaceStoryRuntimeContext;
}): boolean => {
  if (validateDeepspaceStoryEnhancementPack(input.pack).length) return false;
  if (input.pack.charId !== input.charId) return false;
  if (!input.pack.runtimeGate.allowedConsumers.includes(input.consumer)) return false;
  if (input.pack.sourceLane === 'mainline' && input.continuity?.lane !== 'mainline') {
    return false;
  }
  if (input.pack.sourceLane === 'if_line' && input.continuity?.lane !== 'if_line') {
    return false;
  }
  const identityModes = input.pack.runtimeGate.identityModes;
  if (identityModes?.length && (
    !input.context?.identityMode
    || !identityModes.includes(input.context.identityMode)
  )) return false;
  const requiredStages = input.pack.runtimeGate.relationshipStageIds;
  if (requiredStages?.length) {
    const activeStages = new Set(input.context?.relationshipStageIds || []);
    if (!requiredStages.some(stageId => activeStages.has(stageId))) return false;
  }
  return true;
};
