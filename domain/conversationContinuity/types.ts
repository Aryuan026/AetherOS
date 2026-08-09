import type { HistoryScope } from '../historyImport/types.ts';
import type { Message } from '../../types.ts';

export type ConversationContinuitySurface =
  | 'chat'
  | 'call'
  | 'proactive_letter'
  | 'date'
  | 'story_mainline'
  | 'story_if'
  | 'story_scene';

export type ConversationContinuityRuntimeStatus = 'implemented' | 'hold';

export interface ConversationContinuitySurfaceContract {
  readonly surface: ConversationContinuitySurface;
  readonly inputSlot:
    | 'after_trusted_context_before_recent_turns'
    | 'after_life_and_memory_before_opening_seed'
    | 'after_role_and_availability_before_call_transcript'
    | 'after_life_and_route_before_scene_turns'
    | 'after_canon_route_and_scene_plan_before_manuscript_tail'
    | 'after_canon_and_branch_before_branch_tail'
    | 'after_premise_and_cast_before_scene_tail';
  readonly continuationOwner:
    | 'chat_thread'
    | 'proactive_remote_thread'
    | 'call_session'
    | 'date_session'
    | 'mainline_route'
    | 'if_branch'
    | 'bounded_scene';
  readonly runtimeStatus: ConversationContinuityRuntimeStatus;
  readonly mayReadChatCapsule: boolean;
  readonly mayPromoteDirectly: false;
}

export interface ConversationTurn {
  readonly messages: readonly Message[];
  readonly firstMessageId: number;
  readonly lastMessageId: number;
  readonly estimatedTokens: number;
}

export type ConversationContinuityTrigger =
  | 'message_limit'
  | 'estimated_token_budget'
  | 'none';

export interface ConversationContinuityPlan {
  readonly trigger: ConversationContinuityTrigger;
  readonly estimatedInputTokens: number;
  readonly turns: readonly ConversationTurn[];
  readonly compactableTurns: readonly ConversationTurn[];
  readonly recentTurns: readonly ConversationTurn[];
  readonly compactableMessages: readonly Message[];
  readonly recentMessages: readonly Message[];
}

export interface ConversationContinuityCapsule {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly scope: Readonly<HistoryScope>;
  readonly surface: ConversationContinuitySurface;
  /** Rebuildable foreground handoff. It is not durable memory or current truth. */
  readonly summary: string;
  readonly throughMessageId: number;
  readonly sourceFingerprint: string;
  readonly promptVersion: string;
  readonly updatedAt: number;
}
