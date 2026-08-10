export const NARRATIVE_SCENE_SHELL_PROPOSAL_SCHEMA_VERSION = 1 as const;
export const NARRATIVE_SCENE_RECEIPT_PROPOSAL_SCHEMA_VERSION = 1 as const;

/** Model-authored, player-reviewable fields only. It is not an accepted scene shell. */
export interface NarrativeSceneShellProposal {
  schemaVersion: typeof NARRATIVE_SCENE_SHELL_PROPOSAL_SCHEMA_VERSION;
  sourceFingerprint: string;
  title: string;
  location?: string;
  objective?: string;
  constraints: readonly string[];
  participantIds: readonly string[];
}

/** Draft receipt prose only. Confirmation and canonical receipt creation stay player-owned. */
export interface NarrativeSceneReceiptProposal {
  schemaVersion: typeof NARRATIVE_SCENE_RECEIPT_PROPOSAL_SCHEMA_VERSION;
  sourceFingerprint: string;
  summary: string;
  acceptedFacts: readonly string[];
  rejectedOrEditedFacts?: readonly string[];
}
