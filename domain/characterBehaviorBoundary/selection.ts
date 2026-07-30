import {
  analyzeCompanionMaterialQuery,
  tokenizeCompanionMaterialText,
} from '../companionMaterial/retrieval.ts';
import { validateHistoryScope } from '../historyImport/contract.ts';
import {
  assertValidCharacterBehaviorBoundaryRule,
  characterBehaviorBoundaryBelongsToScope,
} from './contract.ts';
import type {
  CharacterBehaviorBoundaryRule,
  CharacterBehaviorBoundarySelection,
  CharacterBehaviorBoundarySelectionItem,
  CharacterBehaviorBoundarySelectionRequest,
} from './types.ts';

const DEFAULT_MAX_ITEMS = 2;
const DEFAULT_MAX_RESIDENT_DIRECTIVES = 6;
const DEFAULT_BUDGET_CHARS = 520;

const routeEligible = (
  rule: CharacterBehaviorBoundaryRule,
  request: CharacterBehaviorBoundarySelectionRequest,
): boolean => {
  if (rule.routePolicy.kind === 'all_routes') return true;
  if (rule.routePolicy.kind === 'canon_only') {
    return !request.routeKind || request.routeKind === 'canon';
  }
  return Boolean(request.routeId && rule.routePolicy.routeIds.includes(request.routeId));
};

const estimateRuleChars = (rule: CharacterBehaviorBoundaryRule): number => (
  (rule.directInstruction?.length || 0)
  + rule.trigger.length
  + rule.preferredAlternatives.reduce((sum, value) => sum + value.length, 0)
  + rule.exceptions.reduce((sum, value) => sum + value.length, 0)
  + 54
);

const lexicalHits = (
  queryTerms: ReadonlySet<string>,
  rule: CharacterBehaviorBoundaryRule,
): string[] => {
  // Retrieval keywords are reviewed/derived at write time. Re-tokenizing the
  // explanatory mismatch text here makes generic words such as “场景” or
  // “约会” accidentally activate a micro boundary.
  const terms = new Set(
    rule.retrieval.triggerKeywords.flatMap(tokenizeCompanionMaterialText),
  );
  return [...queryTerms].filter(term => terms.has(term));
};

export const selectCharacterBehaviorBoundaries = (
  request: CharacterBehaviorBoundarySelectionRequest,
  records: readonly CharacterBehaviorBoundaryRule[],
): CharacterBehaviorBoundarySelection => {
  const scopeErrors = validateHistoryScope(request.scope);
  if (scopeErrors.length) {
    throw new Error(`Character behavior boundary request rejected: ${scopeErrors.join('; ')}`);
  }
  if (request.scope.charId !== request.charId) {
    throw new Error('Character behavior boundary request crosses charId');
  }
  const maxItems = Math.max(0, Math.floor(request.maxItems ?? DEFAULT_MAX_ITEMS));
  const maxResidentDirectives = Math.max(
    0,
    Math.floor(request.maxResidentDirectives ?? DEFAULT_MAX_RESIDENT_DIRECTIVES),
  );
  const budgetChars = Math.max(0, Math.floor(request.budgetChars ?? DEFAULT_BUDGET_CHARS));
  const features = analyzeCompanionMaterialQuery({
    query: request.query,
    previousQuery: request.previousQuery,
    semanticTags: request.semanticSignals,
    surface: request.surface,
  });
  const querySignals = new Set(features.signals);
  const queryTerms = new Set(features.terms);

  const candidates: CharacterBehaviorBoundarySelectionItem[] = [];
  const dropped = new Set<string>();
  records.forEach(rule => {
    assertValidCharacterBehaviorBoundaryRule(rule);
    if (
      !rule.enabled
      || !characterBehaviorBoundaryBelongsToScope(rule, request.scope)
      || !rule.surfaces.includes(request.surface)
      || !routeEligible(rule, request)
    ) {
      dropped.add(rule.id);
      return;
    }
    const suppressSignals = new Set(rule.retrieval.suppressSignals || []);
    if ([...querySignals].some(signal => suppressSignals.has(signal))) {
      dropped.add(rule.id);
      return;
    }
    const matchedSignals = rule.retrieval.positiveSignals.filter(signal => querySignals.has(signal));
    const matchedKeywords = lexicalHits(queryTerms, rule);
    const relevant = (
      rule.retrieval.activationPolicy === 'resident'
      || matchedSignals.length > 0
      || matchedKeywords.length > 0
    );
    if (!relevant) {
      dropped.add(rule.id);
      return;
    }
    const playerBoost = rule.source.authority === 'player_authored' ? 30 : 0;
    const firmBoost = rule.strength === 'firm' ? 12 : 0;
    const score = (
      (rule.retrieval.priority || 0)
      + playerBoost
      + firmBoost
      + matchedSignals.length * 18
      + matchedKeywords.length * 4
    );
    candidates.push({
      rule,
      matchedSignals,
      matchedKeywords,
      score,
      estimatedChars: estimateRuleChars(rule),
    });
  });

  candidates.sort((left, right) => (
    right.score - left.score
    || right.rule.updatedAt - left.rule.updatedAt
    || left.rule.id.localeCompare(right.rule.id)
  ));
  const selected: CharacterBehaviorBoundarySelectionItem[] = [];
  let usedChars = 0;
  const isResidentDirect = (candidate: CharacterBehaviorBoundarySelectionItem): boolean => (
    candidate.rule.source.authority === 'player_authored'
    && candidate.rule.source.playerInputMode === 'direct_instruction'
    && candidate.rule.retrieval.activationPolicy === 'resident'
  );
  let residentDirectives = 0;
  for (const candidate of candidates.filter(isResidentDirect)) {
    if (
      residentDirectives >= maxResidentDirectives
      || usedChars + candidate.estimatedChars > budgetChars
    ) {
      dropped.add(candidate.rule.id);
      continue;
    }
    selected.push(candidate);
    residentDirectives += 1;
    usedChars += candidate.estimatedChars;
  }
  let contextualItems = 0;
  for (const candidate of candidates.filter(item => !isResidentDirect(item))) {
    if (
      contextualItems >= maxItems
      || usedChars + candidate.estimatedChars > budgetChars
    ) {
      dropped.add(candidate.rule.id);
      continue;
    }
    selected.push(candidate);
    contextualItems += 1;
    usedChars += candidate.estimatedChars;
  }

  return {
    requestId: request.requestId,
    scope: { ...request.scope },
    charId: request.charId,
    surface: request.surface,
    selected,
    droppedRuleIds: [...dropped],
    usedChars,
    budgetChars,
  };
};
