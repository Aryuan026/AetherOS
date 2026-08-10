import type { WorldbookKnowledgePolicy } from './types.ts';

export const NARRATIVE_WORLD_GROWTH_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type NarrativeWorldGrowthEvidenceKind =
  | 'receipt_summary'
  | 'accepted_fact'
  | 'confirmed_excerpt';

export interface NarrativeWorldGrowthEvidenceItem {
  id: string;
  kind: NarrativeWorldGrowthEvidenceKind;
  text: string;
}

export interface NarrativeWorldGrowthModelProposal {
  proposalId: string;
  title: string;
  content: string;
  category: string;
  aliases?: readonly string[];
  activationHint?: string;
  /** First runtime box deliberately excludes director_only proposals. */
  knowledgePolicy: Exclude<WorldbookKnowledgePolicy, { kind: 'director_only' }>;
  supplementsEntryIds?: readonly string[];
  evidenceRefs: readonly string[];
}

export interface NarrativeWorldGrowthModelResponse {
  schemaVersion: typeof NARRATIVE_WORLD_GROWTH_PROPOSAL_SCHEMA_VERSION;
  sourceFingerprint: string;
  proposals: readonly NarrativeWorldGrowthModelProposal[];
  noProposalReason?: string;
}
