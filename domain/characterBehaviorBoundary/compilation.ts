import type { AiTaskProviderRef } from '../aiRuntime/types.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import type { CharacterBehaviorBoundaryRule } from './types.ts';

export const CHARACTER_BEHAVIOR_COMPILATION_RECEIPT_VERSION = 1 as const;

export type CharacterBehaviorCompilationSource =
  | 'character_panel'
  | 'chat_reroll';

export interface CharacterBehaviorCompilationCandidate {
  createRule: boolean;
  trigger: string;
  mismatchPattern: string;
  preferredAlternatives: readonly string[];
  exceptions: readonly string[];
  activation: 'resident' | 'relevance_required';
  diagnostic?: string;
}

/**
 * Proves which model compiled a player note and which local rule was accepted.
 * It deliberately keeps neither the note nor the rejected reply.
 */
export interface CharacterBehaviorCompilationReceipt {
  schemaVersion: typeof CHARACTER_BEHAVIOR_COMPILATION_RECEIPT_VERSION;
  id: string;
  requestId: string;
  taskId: 'behavior_boundary_compilation';
  charId: string;
  relationshipScope?: Readonly<HistoryScope>;
  source: CharacterBehaviorCompilationSource;
  provider: AiTaskProviderRef;
  inputHash: string;
  outputHash: string;
  ruleId?: string;
  status: 'compiled' | 'no_stable_rule';
  truthEffect: 'none';
  memoryEffect: 'none';
  currentStateEffect: 'none';
  createdAt: number;
}

export interface CharacterBehaviorCompilationResult {
  candidate: CharacterBehaviorCompilationCandidate;
  rule: CharacterBehaviorBoundaryRule | null;
  receipt: CharacterBehaviorCompilationReceipt;
}
