import {
  type CompanionMaterialGroundingRef,
  type CompanionMaterialSelectionRequest,
} from '../../domain/companionMaterial/types.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { buildLiveUserTurnGroundingRefs } from './grounding.ts';

type RuntimeRequest = Omit<CompanionMaterialSelectionRequest, 'schemaVersion'>;

const base = (input: Omit<RuntimeRequest, 'relationshipStage'>): RuntimeRequest => ({
  ...input,
  relationshipStage: 'unknown',
});

export const buildChatCompanionMaterialRequest = (input: {
  requestId: string;
  scope: HistoryScope;
  refId: string;
  query: string;
  previousQuery?: string;
  occurredAt: number;
  allowGrounding?: boolean;
}): RuntimeRequest => base({
  requestId: input.requestId,
  scope: input.scope,
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  query: input.query,
  previousQuery: input.previousQuery,
  groundingRefs: input.allowGrounding === false
    ? undefined
    : buildLiveUserTurnGroundingRefs({
        scope: input.scope,
        refId: input.refId,
        query: input.query,
        previousQuery: input.previousQuery,
        surface: 'chat',
        mode: 'remote_chat',
        purpose: 'stable_context',
        occurredAt: input.occurredAt,
      }),
  budgetChars: 360,
  maxItems: 1,
  now: input.occurredAt,
});

export const buildCallCompanionMaterialRequest = (input: {
  requestId: string;
  scope: HistoryScope;
  refId: string;
  query: string;
  occurredAt: number;
  opening: boolean;
  automaticOpening: boolean;
}): RuntimeRequest => {
  const purpose = input.opening ? 'opening' : 'stable_context';
  const groundingRefs: CompanionMaterialGroundingRef[] = input.automaticOpening
    ? [{
        kind: 'call_session',
        claimKey: 'opened',
        refId: input.refId,
        revision: 1,
        scope: { ...input.scope },
        occurredAt: input.occurredAt,
        validUntil: input.occurredAt + (5 * 60 * 1000),
      }]
    : buildLiveUserTurnGroundingRefs({
        scope: input.scope,
        refId: input.refId,
        query: input.query,
        surface: 'call',
        mode: 'call',
        purpose,
        occurredAt: input.occurredAt,
      });
  return base({
    requestId: input.requestId,
    scope: input.scope,
    surface: 'call',
    mode: 'call',
    purpose,
    query: input.query,
    semanticTags: input.automaticOpening
      ? ['opening', 'call_session_open', 'fact_free_opening']
      : input.opening
        ? ['opening', 'call']
        : ['stable_voice', 'call'],
    groundingRefs,
    budgetChars: input.opening ? 520 : 360,
    maxItems: input.opening ? 2 : 1,
    now: input.occurredAt,
  });
};

export const buildDateOpeningCompanionMaterialRequest = (input: {
  requestId: string;
  scope: HistoryScope;
  sceneRefId: string;
  occurredAt: number;
  observedGap?: {
    claimKey: string;
    refId: string;
  };
}): RuntimeRequest => base({
  requestId: input.requestId,
  scope: input.scope,
  surface: 'meet_scene',
  mode: 'meet_scene',
  purpose: 'opening',
  query: '用户正准备进入见面场景。',
  semanticTags: ['opening', 'meet_scene', 'light_scene', 'fact_free_opening'],
  groundingRefs: [
    {
      kind: 'scene_context',
      claimKey: 'light_scene',
      refId: input.sceneRefId,
      revision: 1,
      scope: { ...input.scope },
      occurredAt: input.occurredAt,
      validUntil: input.occurredAt + (5 * 60 * 1000),
    },
    ...(input.observedGap ? [{
      kind: 'observed_time_gap' as const,
      claimKey: input.observedGap.claimKey,
      refId: input.observedGap.refId,
      revision: 1,
      scope: { ...input.scope },
      occurredAt: input.occurredAt,
      validUntil: input.occurredAt + (5 * 60 * 1000),
    }] : []),
  ],
  budgetChars: 560,
  maxItems: 2,
  now: input.occurredAt,
});

export const buildWakeupCompanionMaterialRequest = (input: {
  requestId: string;
  scope: HistoryScope;
  ruleRefId: string;
  query: string;
  occurredAt: number;
  carePriority: boolean;
  ruleKind: string;
  hiddenWordsEnabled?: boolean;
}): RuntimeRequest => base({
  requestId: input.requestId,
  scope: input.scope,
  surface: 'proactive_letter',
  mode: 'proactive_letter',
  purpose: 'proactive_intent',
  query: input.query,
  semanticTags: input.carePriority
    ? ['proactive_intent', 'care_needed', 'proactive_care', input.ruleKind]
    : ['proactive_intent', 'opening', input.ruleKind],
  groundingRefs: [
    {
      kind: 'wakeup_rule',
      claimKey: 'proactive_intent',
      refId: input.ruleRefId,
      revision: 1,
      scope: { ...input.scope },
      occurredAt: input.occurredAt,
      validUntil: input.occurredAt + (5 * 60 * 1000),
    },
    ...(input.hiddenWordsEnabled ? [{
      kind: 'wakeup_rule' as const,
      claimKey: 'hidden_words_enabled',
      refId: `${input.ruleRefId}:hidden-words`,
      revision: 1,
      scope: { ...input.scope },
      occurredAt: input.occurredAt,
      validUntil: input.occurredAt + (5 * 60 * 1000),
    }] : []),
  ],
  budgetChars: 600,
  maxItems: 2,
  now: input.occurredAt,
});
