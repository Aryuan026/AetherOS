import {
  analyzeCompanionMaterialQuery,
  tokenizeCompanionMaterialText,
} from '../companionMaterial/retrieval.ts';
import type { CharacterBehaviorBoundaryRetrievalHints } from './types.ts';

const GENERIC_SIGNALS = new Set([
  'ordinary_share',
  'low_signal',
  'technical_meta',
  'tool_request',
  'chat',
  'call',
  'date',
  'proactive_letter',
  'stable_context',
]);

const normalizeSignal = (value: string): string => value.trim().toLowerCase();

export const derivePlayerBehaviorBoundaryRetrievalHints = (input: {
  directInstruction?: string;
  trigger: string;
  mismatchPattern: string;
  preferredAlternatives: readonly string[];
  resident?: boolean;
}): CharacterBehaviorBoundaryRetrievalHints => {
  const source = [
    input.directInstruction || '',
    input.trigger,
    input.mismatchPattern,
    ...input.preferredAlternatives,
  ].join(' ');
  // A written trigger is the narrowest player-confirmed answer to “when is
  // this relevant?”. Do not let generic words from the explanatory mismatch
  // (for example “回复” or “角色反应”) wake an unrelated rule. Direct expert
  // instructions have no separate trigger field, so they remain their own
  // retrieval source; mismatch is only the final fallback.
  const keywordSource = (
    input.trigger.trim()
    || input.directInstruction?.trim()
    || input.mismatchPattern.trim()
  );
  const features = analyzeCompanionMaterialQuery({ query: source });
  return {
    activationPolicy: input.resident ? 'resident' : 'relevance_required',
    positiveSignals: features.signals
      .map(normalizeSignal)
      .filter(signal => !GENERIC_SIGNALS.has(signal)),
    triggerKeywords: tokenizeCompanionMaterialText(keywordSource)
      .filter(term => term.length >= 2)
      .slice(0, 24),
    suppressSignals: [],
    priority: input.resident ? 40 : 20,
  };
};
