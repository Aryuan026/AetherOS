import type { CharacterProfile, Message, UserProfile } from '../../types';

export type MemoryOrigin =
  | 'daily_chat'
  | 'meet_scene'
  | 'canon_story'
  | 'date_scene'
  | 'calendar'
  | 'timebook'
  | 'diary'
  | 'proactive_letter'
  | 'system_import';

export type ContinuityScope =
  | 'canon'
  | 'relationship'
  | 'branch'
  | 'scene_only';

export type KnowledgeScope =
  | 'char_private'
  | 'user_private'
  | 'shared'
  | 'unknown_to_char'
  | 'unknown_to_user';

export type MemoryStatus =
  | 'draft'
  | 'soft_canon'
  | 'confirmed'
  | 'archived'
  | 'discarded';

export type WorldlinePromptMode =
  | 'remote_chat'
  | 'meet_scene'
  | 'date_scene'
  | 'proactive_letter'
  | 'timebook'
  | 'call';

export type WorldlineDeliveryTier =
  | 'resident_only'
  | 'heartbeat_lite'
  | 'affective_warm'
  | 'focused_recall'
  | 'story_branch'
  | 'full_diagnostic';

export interface WorldlineDeliveryProfile {
  tier: WorldlineDeliveryTier;
  reasons: string[];
  budgetChars: number;
  candidateLimit: number;
  openThreadLimit: number;
  includeHotState: boolean;
  includeVoiceFingerprint: boolean;
  includeRewriteSeeds: boolean;
  includeDirectLines: boolean;
  includeStorySeeds: boolean;
}

export type VoiceLineKind =
  | 'direct_message'
  | 'rewrite_seed'
  | 'language_fingerprint';

export interface CharacterVoiceLine {
  id: string;
  charId: string;
  kind: VoiceLineKind;
  text: string;
  tags?: string[];
  source?: 'user_import' | 'built_in' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface CharacterVoiceCore {
  charId: string;
  lines: CharacterVoiceLine[];
  updatedAt?: number;
}

export interface WorldlineHotState {
  charId: string;
  currentWhereabouts?: string;
  currentMood?: string;
  currentPressure?: string;
  activeThreads: string[];
  storySignals: string[];
  pendingCare: string[];
  recentlyMentionedPeople?: string[];
  sourceRefs?: SourceRef[];
  updatedAt: number;
  expiresAt?: number;
}

export interface SourceRef {
  kind: string;
  id: string | number;
  label?: string;
}

export interface WorldlineMemoryCandidate {
  id: string;
  charId: string;
  origin: MemoryOrigin;
  continuity: ContinuityScope;
  knowledge: KnowledgeScope;
  status: MemoryStatus;
  title: string;
  summary: string;
  happenedAt?: string;
  branchId?: string;
  sourceRefs?: SourceRef[];
  tags?: string[];
  weight: number;
}

export interface WorldlineOpenThread {
  id: string;
  title: string;
  hint: string;
  origin: MemoryOrigin;
  continuity: ContinuityScope;
  sourceRefs?: SourceRef[];
  weight: number;
}

export interface WorldlineSelectorInput {
  char: CharacterProfile;
  user: UserProfile;
  mode: WorldlinePromptMode;
  origin?: MemoryOrigin;
  currentMessages?: Message[];
  query?: string;
  now?: Date;
  budgetChars?: number;
}

export interface WorldlinePromptContext {
  markdown: string;
  candidates: WorldlineMemoryCandidate[];
  openThreads: WorldlineOpenThread[];
  budgetChars: number;
  warnings: string[];
  deliveryProfile?: WorldlineDeliveryProfile;
  hotState?: WorldlineHotState | null;
  voiceLineTitles?: string[];
}

export interface WorldlineMemoryReceipt {
  id: string;
  at: number;
  charId: string;
  charName: string;
  mode: WorldlinePromptMode;
  origin: MemoryOrigin;
  delivered: boolean;
  candidateCount: number;
  openThreadCount: number;
  candidateTitles: string[];
  openThreadTitles: string[];
  markdownPreview: string;
  budgetChars: number;
  warnings: string[];
  deliveryTier?: WorldlineDeliveryTier;
  hotStateDelivered?: boolean;
  voiceFingerprintCount?: number;
}

export interface WorldlineMemoryReceiptSettings {
  enabled: boolean;
}
