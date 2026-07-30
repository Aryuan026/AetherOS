import { createHistoryScopeKey, validateHistoryScope } from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import {
  CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION,
  type CharacterBehaviorBoundaryRule,
} from './types.ts';

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const unique = (values: readonly string[]): boolean => (
  new Set(values).size === values.length
);

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

export const characterBehaviorBoundaryBelongsToScope = (
  rule: CharacterBehaviorBoundaryRule,
  scope: HistoryScope,
): boolean => {
  if (rule.charId !== scope.charId) return false;
  if (rule.ownerScope.kind === 'character') {
    return rule.ownerScope.charId === scope.charId;
  }
  return sameScope(rule.ownerScope.scope, scope);
};

export const validateCharacterBehaviorBoundaryRule = (
  rule: CharacterBehaviorBoundaryRule,
): string[] => {
  const errors: string[] = [];
  if (rule.schemaVersion !== CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION) {
    errors.push('unsupported behavior boundary schemaVersion');
  }
  if (!nonEmpty(rule.id)) errors.push('id is required');
  if (!nonEmpty(rule.charId)) errors.push('charId is required');
  if (!nonEmpty(rule.title)) errors.push('title is required');
  if (!Number.isInteger(rule.revision) || rule.revision < 1) {
    errors.push('revision must be a positive integer');
  }
  if (!Number.isFinite(rule.createdAt) || !Number.isFinite(rule.updatedAt)) {
    errors.push('createdAt and updatedAt must be finite');
  }
  if (rule.updatedAt < rule.createdAt) errors.push('updatedAt cannot precede createdAt');
  if (rule.ownerScope.kind === 'character') {
    if (rule.ownerScope.charId !== rule.charId) errors.push('character owner scope crosses charId');
  } else {
    errors.push(...validateHistoryScope(rule.ownerScope.scope).map(error => `owner scope: ${error}`));
    if (rule.ownerScope.scope.charId !== rule.charId) errors.push('relationship owner scope crosses charId');
  }
  if (!rule.surfaces.length || !unique(rule.surfaces)) {
    errors.push('surfaces must be non-empty and unique');
  }
  if (
    rule.routePolicy.kind === 'route_allowlist'
    && (
      !rule.routePolicy.routeIds.length
      || !unique(rule.routePolicy.routeIds)
      || rule.routePolicy.routeIds.some(routeId => !nonEmpty(routeId))
    )
  ) errors.push('route allowlist must contain unique non-empty routeIds');
  const alternatives = rule.preferredAlternatives.map(value => value.trim()).filter(Boolean);
  if (!unique(alternatives)) errors.push('preferredAlternatives must be unique');
  if (!unique(rule.exceptions.map(value => value.trim()).filter(Boolean))) {
    errors.push('exceptions must be unique');
  }
  if (!unique(rule.retrieval.positiveSignals)) errors.push('positiveSignals must be unique');
  if (!unique(rule.retrieval.triggerKeywords)) errors.push('triggerKeywords must be unique');
  if (!unique(rule.retrieval.suppressSignals || [])) errors.push('suppressSignals must be unique');

  if (rule.source.authority === 'built_in_source_review') {
    if (rule.source.playerInputMode) {
      errors.push('built-in source boundary cannot declare playerInputMode');
    }
    if (rule.directInstruction) {
      errors.push('built-in source boundary cannot carry directInstruction');
    }
    if (!nonEmpty(rule.trigger)) errors.push('built-in source boundary requires trigger');
    if (!nonEmpty(rule.mismatchPattern)) errors.push('built-in source boundary requires mismatchPattern');
    if (alternatives.length < 1) {
      errors.push(`${rule.kind} requires at least 1 preferredAlternatives`);
    }
    if (rule.visibility !== 'runtime_internal') {
      errors.push('built-in source boundary must remain runtime_internal');
    }
    if (!nonEmpty(rule.source.sourcePackId)) errors.push('built-in source boundary requires sourcePackId');
    if (!rule.source.sourceRefs?.length || rule.source.sourceRefs.some(ref => !nonEmpty(ref))) {
      errors.push('built-in source boundary requires opaque sourceRefs');
    }
  } else {
    if (rule.visibility !== 'player_authored') {
      errors.push('player-authored boundary must remain player_authored');
    }
    if (rule.source.sourcePackId || rule.source.sourceRefs?.length) {
      errors.push('player-authored boundary may not claim private source evidence');
    }
    if (rule.source.playerInputMode === 'direct_instruction') {
      if (!nonEmpty(rule.directInstruction)) {
        errors.push('direct player boundary requires directInstruction');
      }
      if (rule.strength !== 'firm') {
        errors.push('direct player boundary must preserve firm player authority');
      }
    } else if (rule.source.playerInputMode === 'guided') {
      if (rule.directInstruction) {
        errors.push('guided player boundary cannot carry directInstruction');
      }
      if (!nonEmpty(rule.mismatchPattern)) {
        errors.push('guided player boundary requires mismatchPattern');
      }
      if (alternatives.length < 1) {
        errors.push('guided player boundary requires at least 1 preferredAlternatives');
      }
    } else {
      errors.push('player-authored boundary requires playerInputMode');
    }
  }
  const sceneOnlyKinds = new Set([
    'embodied_habit',
    'wardrobe_or_prop',
    'space_behavior',
  ]);
  if (
    sceneOnlyKinds.has(rule.kind)
    && rule.surfaces.some(surface => (
      surface === 'chat'
      || surface === 'call'
      || surface === 'proactive_letter'
      || surface === 'remote_chat'
    ))
  ) {
    errors.push(`${rule.kind} may only enter scene-capable surfaces`);
  }
  return errors;
};

export const assertValidCharacterBehaviorBoundaryRule = (
  rule: CharacterBehaviorBoundaryRule,
): void => {
  const errors = validateCharacterBehaviorBoundaryRule(rule);
  if (errors.length) {
    throw new Error(`Character behavior boundary rejected: ${errors.join('; ')}`);
  }
};
