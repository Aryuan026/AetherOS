import type {
  CompanionMaterialGroundingRef,
  CompanionMaterialPurpose,
  CompanionMaterialSelectionRequest,
} from '../../domain/companionMaterial/types.ts';
import { analyzeCompanionMaterialQuery } from '../../domain/companionMaterial/retrieval.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';

const NON_CLAIM_SIGNALS = new Set([
  'low_signal',
  'technical_meta',
  'no_advice_chat',
  'tool_request',
  'chat',
  'call',
  'date',
  'remote_chat',
  'meet_scene',
  'date_scene',
  'proactive_letter',
  'story_planning',
  'story_scene',
  'stable_context',
  'opening',
  'scene_planning',
]);

export const buildLiveUserTurnGroundingRefs = (input: {
  scope: HistoryScope;
  refId: string;
  query: string;
  previousQuery?: string;
  semanticTags?: readonly string[];
  surface: CompanionMaterialSelectionRequest['surface'];
  mode: CompanionMaterialSelectionRequest['mode'];
  purpose: CompanionMaterialPurpose;
  occurredAt: number;
  validForMs?: number;
}): CompanionMaterialGroundingRef[] => {
  const features = analyzeCompanionMaterialQuery({
    query: input.query,
    previousQuery: input.previousQuery,
    // Grounding is authority derived from the live text itself. Caller-owned
    // ranking tags may improve retrieval elsewhere, but must never mint a
    // `live_user_turn` claim that the user did not actually express.
    surface: input.surface,
    mode: input.mode,
    purpose: input.purpose,
  });
  const validUntil = input.occurredAt + (input.validForMs ?? 5 * 60 * 1000);
  return [...new Set(features.signals)]
    .filter(claimKey => !NON_CLAIM_SIGNALS.has(claimKey))
    .map(claimKey => ({
      kind: 'live_user_turn' as const,
      claimKey,
      refId: `${input.refId}:${claimKey}`,
      revision: 1,
      scope: { ...input.scope },
      occurredAt: input.occurredAt,
      validUntil,
    }));
};
