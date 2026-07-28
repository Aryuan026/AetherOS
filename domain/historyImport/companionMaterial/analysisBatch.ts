import {
  canonicalHistoryCompanionAuthorityJson,
  HISTORY_COMPANION_ANALYSIS_PACKET_SET_SCHEMA_VERSION,
  sha256HistoryCompanionAuthority,
  validateHistoryCompanionAnalysisPacket,
  validateHistoryCompanionAnalysisPacketSet,
  type HistoryCompanionAnalysisLane,
  type HistoryCompanionAnalysisPacket,
  type HistoryCompanionAnalysisPacketSetManifest,
} from './analysisPacket.ts';
import { createHistoryScopeKey, validateHistoryScope } from '../contract.ts';
import type { HistoryScope } from '../types.ts';

export const HISTORY_COMPANION_ANALYSIS_BATCH_PLAN_SCHEMA_VERSION = 1 as const;
export const HISTORY_COMPANION_ANALYSIS_BATCH_MANIFEST_SCHEMA_VERSION = 1 as const;
export const HISTORY_COMPANION_ANALYSIS_BATCH_DRAFT_RECEIPT_SCHEMA_VERSION = 1 as const;
export const HISTORY_COMPANION_ANALYSIS_COVERAGE_RECEIPT_SCHEMA_VERSION = 1 as const;
export const HISTORY_COMPANION_ANALYSIS_SYNTHESIS_ENVELOPE_SCHEMA_VERSION = 1 as const;

export interface HistoryCompanionAnalysisPacketAuthorityDescriptor {
  id: string;
  packetOrdinal: number;
  packetEvidenceDigest: string;
}

export interface HistoryCompanionAnalysisBatchManifest {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_BATCH_MANIFEST_SCHEMA_VERSION;
  id: string;
  planId: string;
  packetSetId: string;
  batchOrdinal: number;
  batchCount: number;
  packetIds: readonly string[];
  packetOrdinals: readonly number[];
  packetEvidenceDigests: readonly string[];
  maxPromptChars: number;
  rawRetention: 'ephemeral_not_persisted';
}

/**
 * Safe planning metadata. It contains no evidence text and carries no runtime
 * material authority.
 */
export interface HistoryCompanionAnalysisBatchPlan {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_BATCH_PLAN_SCHEMA_VERSION;
  id: string;
  packetSet: HistoryCompanionAnalysisPacketSetManifest;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  canonicalLaneSet: readonly HistoryCompanionAnalysisLane[];
  packets: readonly HistoryCompanionAnalysisPacketAuthorityDescriptor[];
  batches: readonly HistoryCompanionAnalysisBatchManifest[];
  maxPromptChars: number;
  runtimeAuthority: 'none';
  rawRetention: 'ephemeral_not_persisted';
  createdAt: number;
}

export interface HistoryCompanionAnalysisBoundedBatch {
  plan: HistoryCompanionAnalysisBatchPlan;
  manifest: HistoryCompanionAnalysisBatchManifest;
  /** Raw text remains only inside these ephemeral packets. */
  packets: readonly HistoryCompanionAnalysisPacket[];
}

export interface HistoryCompanionAnalysisBatchDraftReceipt {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_BATCH_DRAFT_RECEIPT_SCHEMA_VERSION;
  id: string;
  planId: string;
  batchId: string;
  packetSetId: string;
  batchOrdinal: number;
  packetIds: readonly string[];
  draftFingerprint: string;
  disposition: 'non_authoritative_analysis_draft';
  runtimeAuthority: 'none';
  truthEffect: 'none';
  rawRetention: 'ephemeral_not_persisted';
  completedAt: number;
}

export interface HistoryCompanionAnalysisEphemeralBatchDraft {
  receipt: HistoryCompanionAnalysisBatchDraftReceipt;
  /** Non-verbatim draft text; consumed for synthesis and never copied into receipts/envelopes. */
  ephemeralDraft: string;
}

export interface HistoryCompanionAnalysisCoverageReceipt {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_COVERAGE_RECEIPT_SCHEMA_VERSION;
  id: string;
  planId: string;
  packetSetId: string;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  canonicalLaneSet: readonly HistoryCompanionAnalysisLane[];
  packetIds: readonly string[];
  batchIds: readonly string[];
  batchDraftReceiptIds: readonly string[];
  batchDraftFingerprints: readonly string[];
  coverage: 'all_packets_exactly_once';
  runtimeAuthority: 'none';
  truthEffect: 'none';
  createdAt: number;
}

export interface HistoryCompanionAnalysisSynthesisEnvelope {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_SYNTHESIS_ENVELOPE_SCHEMA_VERSION;
  id: string;
  planId: string;
  coverageReceiptId: string;
  packetSetId: string;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  canonicalLaneSet: readonly HistoryCompanionAnalysisLane[];
  synthesisInputDigest: string;
  synthesisDraftFingerprint: string;
  disposition: 'non_authoritative_synthesis_draft';
  requiresIndependentAdjudication: true;
  runtimeAuthority: 'none';
  truthEffect: 'none';
  rawRetention: 'ephemeral_not_persisted';
  createdAt: number;
}

export interface CreateHistoryCompanionAnalysisBatchPlanInput {
  packets: readonly HistoryCompanionAnalysisPacket[];
  packetGroups: readonly (readonly HistoryCompanionAnalysisPacket[])[];
  maxPromptChars: number;
  createdAt?: number;
}

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const unique = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

const authorityFingerprint = (value: unknown): string => (
  `sha256:${sha256HistoryCompanionAuthority(canonicalHistoryCompanionAuthorityJson(value))}`
);

const planAuthorityShape = (input: {
  packetSet: HistoryCompanionAnalysisPacketSetManifest;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  canonicalLaneSet: readonly HistoryCompanionAnalysisLane[];
  packets: readonly HistoryCompanionAnalysisPacketAuthorityDescriptor[];
  packetGroups: readonly (readonly string[])[];
  maxPromptChars: number;
}) => ({
  packetSet: input.packetSet,
  scope: input.scope,
  sourceRevisionFingerprint: input.sourceRevisionFingerprint,
  canonicalLaneSet: input.canonicalLaneSet,
  packets: input.packets,
  packetGroups: input.packetGroups,
  maxPromptChars: input.maxPromptChars,
});

const planId = (shape: ReturnType<typeof planAuthorityShape>): string => (
  `history-companion-analysis-plan-${sha256HistoryCompanionAuthority(
    canonicalHistoryCompanionAuthorityJson(shape),
  )}`
);

const batchId = (input: {
  planId: string;
  packetSetId: string;
  batchOrdinal: number;
  batchCount: number;
  packetIds: readonly string[];
  packetOrdinals: readonly number[];
  packetEvidenceDigests: readonly string[];
  maxPromptChars: number;
}): string => `history-companion-analysis-batch-${sha256HistoryCompanionAuthority(
  canonicalHistoryCompanionAuthorityJson(input),
)}`;

const describePacket = (
  packet: HistoryCompanionAnalysisPacket,
): HistoryCompanionAnalysisPacketAuthorityDescriptor => ({
  id: packet.id,
  packetOrdinal: packet.packetOrdinal,
  packetEvidenceDigest: packet.packetEvidenceDigest,
});

const manifestAuthorityShape = (
  manifest: Omit<HistoryCompanionAnalysisBatchManifest, 'id' | 'schemaVersion' | 'rawRetention'>,
) => ({
  planId: manifest.planId,
  packetSetId: manifest.packetSetId,
  batchOrdinal: manifest.batchOrdinal,
  batchCount: manifest.batchCount,
  packetIds: manifest.packetIds,
  packetOrdinals: manifest.packetOrdinals,
  packetEvidenceDigests: manifest.packetEvidenceDigests,
  maxPromptChars: manifest.maxPromptChars,
});

export const createHistoryCompanionAnalysisBatchPlan = (
  input: CreateHistoryCompanionAnalysisBatchPlanInput,
): HistoryCompanionAnalysisBatchPlan => {
  const packetSetErrors = validateHistoryCompanionAnalysisPacketSet(input.packets);
  if (packetSetErrors.length) {
    throw new Error(`Invalid analysis packet set: ${packetSetErrors.join('; ')}`);
  }
  if (!input.packetGroups.length) throw new Error('analysis batch plan requires packet groups');
  if (!Number.isInteger(input.maxPromptChars) || input.maxPromptChars < 1) {
    throw new Error('analysis batch maxPromptChars must be a positive integer');
  }
  input.packetGroups.forEach((group, index) => {
    if (!group.length) throw new Error(`analysis batch group[${index}] must not be empty`);
    group.forEach(packet => {
      const errors = validateHistoryCompanionAnalysisPacket(packet);
      if (errors.length) {
        throw new Error(`Invalid analysis batch packet ${packet.id}: ${errors.join('; ')}`);
      }
    });
  });
  const flattened = input.packetGroups.flat();
  const expectedIds = input.packets.map(packet => packet.id);
  const actualIds = flattened.map(packet => packet.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error('analysis batch groups must cover every packet exactly once in canonical order');
  }

  const [first] = input.packets;
  const packetDescriptors = input.packets.map(describePacket);
  const authorityShape = planAuthorityShape({
    packetSet: first.packetSet,
    scope: first.scope,
    sourceRevisionFingerprint: first.sourceRevisionFingerprint,
    canonicalLaneSet: first.packetSet.canonicalLaneSet,
    packets: packetDescriptors,
    packetGroups: input.packetGroups.map(group => group.map(packet => packet.id)),
    maxPromptChars: input.maxPromptChars,
  });
  const id = planId(authorityShape);
  const batchCount = input.packetGroups.length;
  const batches = input.packetGroups.map((group, batchOrdinal) => {
    const partial = {
      planId: id,
      packetSetId: first.packetSet.packetSetId,
      batchOrdinal,
      batchCount,
      packetIds: group.map(packet => packet.id),
      packetOrdinals: group.map(packet => packet.packetOrdinal),
      packetEvidenceDigests: group.map(packet => packet.packetEvidenceDigest),
      maxPromptChars: input.maxPromptChars,
    };
    return {
      schemaVersion: HISTORY_COMPANION_ANALYSIS_BATCH_MANIFEST_SCHEMA_VERSION,
      id: batchId(partial),
      ...partial,
      rawRetention: 'ephemeral_not_persisted' as const,
    };
  });
  const plan: HistoryCompanionAnalysisBatchPlan = {
    schemaVersion: HISTORY_COMPANION_ANALYSIS_BATCH_PLAN_SCHEMA_VERSION,
    id,
    packetSet: {
      ...first.packetSet,
      sourceDocuments: first.packetSet.sourceDocuments.map(document => ({ ...document })),
      canonicalLaneSet: [...first.packetSet.canonicalLaneSet],
    },
    scope: { ...first.scope },
    sourceRevisionFingerprint: first.sourceRevisionFingerprint,
    canonicalLaneSet: [...first.packetSet.canonicalLaneSet],
    packets: packetDescriptors,
    batches,
    maxPromptChars: input.maxPromptChars,
    runtimeAuthority: 'none',
    rawRetention: 'ephemeral_not_persisted',
    createdAt: input.createdAt ?? Date.now(),
  };
  const errors = validateHistoryCompanionAnalysisBatchPlan(plan);
  if (errors.length) throw new Error(`Invalid generated analysis batch plan: ${errors.join('; ')}`);
  return plan;
};

export const validateHistoryCompanionAnalysisBatchPlan = (
  plan: HistoryCompanionAnalysisBatchPlan,
): string[] => {
  const errors = validateHistoryScope(plan.scope);
  if (plan.schemaVersion !== HISTORY_COMPANION_ANALYSIS_BATCH_PLAN_SCHEMA_VERSION) {
    errors.push('unsupported analysis batch plan schemaVersion');
  }
  if (plan.runtimeAuthority !== 'none') errors.push('analysis batch plan runtimeAuthority must be none');
  if (plan.rawRetention !== 'ephemeral_not_persisted') {
    errors.push('analysis batch plan rawRetention must remain ephemeral_not_persisted');
  }
  if (!Number.isInteger(plan.maxPromptChars) || plan.maxPromptChars < 1) {
    errors.push('analysis batch plan maxPromptChars must be positive');
  }
  if (!Number.isFinite(plan.createdAt)) errors.push('analysis batch plan createdAt must be finite');
  if (plan.packetSet.packetSetId !== plan.batches[0]?.packetSetId) {
    errors.push('analysis batch plan packetSetId does not match batches');
  }
  if (plan.packetSet.packetCount !== plan.packets.length) {
    errors.push('analysis batch plan packet descriptors do not match packetCount');
  }
  if (JSON.stringify(plan.canonicalLaneSet) !== JSON.stringify(plan.packetSet.canonicalLaneSet)) {
    errors.push('analysis batch plan canonicalLaneSet does not match packet set');
  }
  if (plan.packetSet.schemaVersion !== HISTORY_COMPANION_ANALYSIS_PACKET_SET_SCHEMA_VERSION) {
    errors.push('analysis batch plan packet set schemaVersion is unsupported');
  }
  if (!/^history-companion-analysis-set-[a-f0-9]{64}$/u.test(plan.packetSet.packetSetId)) {
    errors.push('analysis batch plan packetSetId must use canonical SHA-256');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(plan.packetSet.orderedEvidenceDigest)) {
    errors.push('analysis batch plan orderedEvidenceDigest must use canonical SHA-256');
  }
  if (!plan.sourceRevisionFingerprint.trim()) {
    errors.push('analysis batch plan sourceRevisionFingerprint is required');
  }
  if (!unique(plan.packets.map(packet => packet.id))) {
    errors.push('analysis batch plan packet ids must be unique');
  }
  if (!unique(plan.packets.map(packet => packet.packetOrdinal))) {
    errors.push('analysis batch plan packet ordinals must be unique');
  }
  plan.packets.forEach((packet, index) => {
    if (!/^history-companion-analysis-[a-f0-9]{64}$/u.test(packet.id)) {
      errors.push(`analysis batch plan packet[${index}] id must use canonical SHA-256`);
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(packet.packetEvidenceDigest)) {
      errors.push(`analysis batch plan packet[${index}] evidence digest must use canonical SHA-256`);
    }
    if (packet.packetOrdinal !== index) {
      errors.push('analysis batch plan packet ordinals must be contiguous from zero');
    }
  });
  if (!plan.batches.length) errors.push('analysis batch plan requires batches');
  const batchPacketIds = plan.batches.flatMap(batch => batch.packetIds);
  if (JSON.stringify(batchPacketIds) !== JSON.stringify(plan.packets.map(packet => packet.id))) {
    errors.push('analysis batch plan batches must cover every packet exactly once');
  }
  if (!unique(plan.batches.map(batch => batch.id))) {
    errors.push('analysis batch plan batch ids must be unique');
  }
  plan.batches.forEach((manifest, index) => {
    if (manifest.schemaVersion !== HISTORY_COMPANION_ANALYSIS_BATCH_MANIFEST_SCHEMA_VERSION) {
      errors.push(`analysis batch manifest[${index}] schemaVersion is unsupported`);
    }
    if (manifest.planId !== plan.id) errors.push(`analysis batch manifest[${index}] planId mismatch`);
    if (manifest.packetSetId !== plan.packetSet.packetSetId) {
      errors.push(`analysis batch manifest[${index}] packetSetId mismatch`);
    }
    if (manifest.batchOrdinal !== index || manifest.batchCount !== plan.batches.length) {
      errors.push(`analysis batch manifest[${index}] ordinal/count mismatch`);
    }
    if (
      manifest.packetIds.length !== manifest.packetOrdinals.length
      || manifest.packetIds.length !== manifest.packetEvidenceDigests.length
      || !manifest.packetIds.length
    ) {
      errors.push(`analysis batch manifest[${index}] packet descriptors are incomplete`);
    }
    if (manifest.maxPromptChars !== plan.maxPromptChars) {
      errors.push(`analysis batch manifest[${index}] maxPromptChars mismatch`);
    }
    if (manifest.rawRetention !== 'ephemeral_not_persisted') {
      errors.push(`analysis batch manifest[${index}] rawRetention must remain ephemeral`);
    }
    if (manifest.id !== batchId(manifestAuthorityShape(manifest))) {
      errors.push(`analysis batch manifest[${index}] id does not match authority fields`);
    }
    const expectedDescriptors = manifest.packetIds.map(id => (
      plan.packets.find(packet => packet.id === id)
    ));
    if (expectedDescriptors.some(item => !item)) {
      errors.push(`analysis batch manifest[${index}] references a packet outside the plan`);
    } else {
      if (
        JSON.stringify(manifest.packetOrdinals)
        !== JSON.stringify(expectedDescriptors.map(item => item!.packetOrdinal))
      ) {
        errors.push(`analysis batch manifest[${index}] packet ordinals mismatch plan descriptors`);
      }
      if (
        JSON.stringify(manifest.packetEvidenceDigests)
        !== JSON.stringify(expectedDescriptors.map(item => item!.packetEvidenceDigest))
      ) {
        errors.push(`analysis batch manifest[${index}] packet digests mismatch plan descriptors`);
      }
    }
  });
  const shape = planAuthorityShape({
    packetSet: plan.packetSet,
    scope: plan.scope,
    sourceRevisionFingerprint: plan.sourceRevisionFingerprint,
    canonicalLaneSet: plan.canonicalLaneSet,
    packets: plan.packets,
    packetGroups: plan.batches.map(batch => [...batch.packetIds]),
    maxPromptChars: plan.maxPromptChars,
  });
  if (plan.id !== planId(shape)) errors.push('analysis batch plan id does not match authority fields');
  return errors;
};

export const validateHistoryCompanionAnalysisBoundedBatch = (
  batch: HistoryCompanionAnalysisBoundedBatch,
): string[] => {
  const errors = validateHistoryCompanionAnalysisBatchPlan(batch.plan);
  const manifest = batch.manifest;
  const canonicalManifest = batch.plan.batches[manifest.batchOrdinal];
  if (!canonicalManifest || JSON.stringify(canonicalManifest) !== JSON.stringify(manifest)) {
    errors.push('bounded analysis batch manifest does not belong to plan');
  }
  batch.packets.forEach((packet, index) => {
    validateHistoryCompanionAnalysisPacket(packet).forEach(error => (
      errors.push(`bounded packet[${index}]: ${error}`)
    ));
  });
  if (JSON.stringify(batch.packets.map(packet => packet.id)) !== JSON.stringify(manifest.packetIds)) {
    errors.push('bounded analysis batch packet ids do not match manifest');
  }
  if (
    JSON.stringify(batch.packets.map(packet => packet.packetOrdinal))
    !== JSON.stringify(manifest.packetOrdinals)
  ) {
    errors.push('bounded analysis batch packet ordinals do not match manifest');
  }
  if (
    JSON.stringify(batch.packets.map(packet => packet.packetEvidenceDigest))
    !== JSON.stringify(manifest.packetEvidenceDigests)
  ) {
    errors.push('bounded analysis batch packet digests do not match manifest');
  }
  batch.packets.forEach(packet => {
    if (packet.packetSet.packetSetId !== batch.plan.packetSet.packetSetId) {
      errors.push('bounded analysis batch mixes another packet set');
    }
    if (!sameScope(packet.scope, batch.plan.scope)) {
      errors.push('bounded analysis batch crosses scope');
    }
    if (packet.sourceRevisionFingerprint !== batch.plan.sourceRevisionFingerprint) {
      errors.push('bounded analysis batch crosses source revision');
    }
    if (
      JSON.stringify(packet.requestedLanes)
      !== JSON.stringify(batch.plan.canonicalLaneSet)
    ) {
      errors.push('bounded analysis batch crosses canonical lane set');
    }
  });
  return errors;
};

export const materializeHistoryCompanionAnalysisBatches = (
  plan: HistoryCompanionAnalysisBatchPlan,
  packets: readonly HistoryCompanionAnalysisPacket[],
): HistoryCompanionAnalysisBoundedBatch[] => {
  const planErrors = validateHistoryCompanionAnalysisBatchPlan(plan);
  if (planErrors.length) throw new Error(`Invalid analysis batch plan: ${planErrors.join('; ')}`);
  const packetSetErrors = validateHistoryCompanionAnalysisPacketSet(packets);
  if (packetSetErrors.length) {
    throw new Error(`Invalid analysis packet set: ${packetSetErrors.join('; ')}`);
  }
  if (JSON.stringify(packets.map(describePacket)) !== JSON.stringify(plan.packets)) {
    throw new Error('analysis packet set does not match batch plan authority descriptors');
  }
  const byId = new Map(packets.map(packet => [packet.id, packet]));
  return plan.batches.map(manifest => {
    const batch: HistoryCompanionAnalysisBoundedBatch = {
      plan,
      manifest,
      packets: manifest.packetIds.map(id => {
        const packet = byId.get(id);
        if (!packet) throw new Error(`analysis batch packet ${id} is missing`);
        return packet;
      }),
    };
    const errors = validateHistoryCompanionAnalysisBoundedBatch(batch);
    if (errors.length) throw new Error(`Invalid materialized analysis batch: ${errors.join('; ')}`);
    return batch;
  });
};

export const createHistoryCompanionAnalysisBatchDraftReceipt = (input: {
  batch: HistoryCompanionAnalysisBoundedBatch;
  /** Non-verbatim model output held only long enough to synthesize and hash. */
  ephemeralDraft: string;
  completedAt?: number;
}): HistoryCompanionAnalysisBatchDraftReceipt => {
  const errors = validateHistoryCompanionAnalysisBoundedBatch(input.batch);
  if (errors.length) throw new Error(`Invalid bounded analysis batch: ${errors.join('; ')}`);
  if (!input.ephemeralDraft.trim()) throw new Error('analysis batch draft must not be empty');
  const draftFingerprint = authorityFingerprint({ draft: input.ephemeralDraft });
  const completedAt = input.completedAt ?? Date.now();
  const shape = {
    planId: input.batch.plan.id,
    batchId: input.batch.manifest.id,
    packetSetId: input.batch.plan.packetSet.packetSetId,
    batchOrdinal: input.batch.manifest.batchOrdinal,
    packetIds: input.batch.manifest.packetIds,
    draftFingerprint,
    completedAt,
  };
  return {
    schemaVersion: HISTORY_COMPANION_ANALYSIS_BATCH_DRAFT_RECEIPT_SCHEMA_VERSION,
    id: `history-companion-analysis-draft-${sha256HistoryCompanionAuthority(
      canonicalHistoryCompanionAuthorityJson(shape),
    )}`,
    ...shape,
    disposition: 'non_authoritative_analysis_draft',
    runtimeAuthority: 'none',
    truthEffect: 'none',
    rawRetention: 'ephemeral_not_persisted',
  };
};

export const validateHistoryCompanionAnalysisBatchDraftReceipt = (
  plan: HistoryCompanionAnalysisBatchPlan,
  receipt: HistoryCompanionAnalysisBatchDraftReceipt,
): string[] => {
  const errors = validateHistoryCompanionAnalysisBatchPlan(plan);
  const manifest = plan.batches.find(batch => batch.id === receipt.batchId);
  if (!manifest) errors.push('analysis batch draft receipt references a batch outside the plan');
  if (receipt.schemaVersion !== HISTORY_COMPANION_ANALYSIS_BATCH_DRAFT_RECEIPT_SCHEMA_VERSION) {
    errors.push('unsupported analysis batch draft receipt schemaVersion');
  }
  if (receipt.planId !== plan.id) errors.push('analysis batch draft receipt planId mismatch');
  if (receipt.packetSetId !== plan.packetSet.packetSetId) {
    errors.push('analysis batch draft receipt packetSetId mismatch');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(receipt.draftFingerprint)) {
    errors.push('analysis batch draft fingerprint must use SHA-256');
  }
  if (
    receipt.disposition !== 'non_authoritative_analysis_draft'
    || receipt.runtimeAuthority !== 'none'
    || receipt.truthEffect !== 'none'
  ) {
    errors.push('analysis batch draft receipt must remain non-authoritative');
  }
  if (receipt.rawRetention !== 'ephemeral_not_persisted') {
    errors.push('analysis batch draft receipt rawRetention must remain ephemeral');
  }
  if (!Number.isFinite(receipt.completedAt)) {
    errors.push('analysis batch draft receipt completedAt must be finite');
  }
  if (manifest) {
    if (receipt.batchOrdinal !== manifest.batchOrdinal) {
      errors.push('analysis batch draft receipt batchOrdinal mismatch');
    }
    if (JSON.stringify(receipt.packetIds) !== JSON.stringify(manifest.packetIds)) {
      errors.push('analysis batch draft receipt packetIds mismatch');
    }
  }
  const shape = {
    planId: receipt.planId,
    batchId: receipt.batchId,
    packetSetId: receipt.packetSetId,
    batchOrdinal: receipt.batchOrdinal,
    packetIds: receipt.packetIds,
    draftFingerprint: receipt.draftFingerprint,
    completedAt: receipt.completedAt,
  };
  const expectedId = `history-companion-analysis-draft-${sha256HistoryCompanionAuthority(
    canonicalHistoryCompanionAuthorityJson(shape),
  )}`;
  if (receipt.id !== expectedId) errors.push('analysis batch draft receipt id mismatch');
  return errors;
};

export const createHistoryCompanionAnalysisCoverageReceipt = (input: {
  plan: HistoryCompanionAnalysisBatchPlan;
  batchDraftReceipts: readonly HistoryCompanionAnalysisBatchDraftReceipt[];
  createdAt?: number;
}): HistoryCompanionAnalysisCoverageReceipt => {
  const planErrors = validateHistoryCompanionAnalysisBatchPlan(input.plan);
  if (planErrors.length) throw new Error(`Invalid analysis batch plan: ${planErrors.join('; ')}`);
  const receiptErrors = input.batchDraftReceipts.flatMap((receipt, index) => (
    validateHistoryCompanionAnalysisBatchDraftReceipt(input.plan, receipt)
      .map(error => `batchDraftReceipt[${index}]: ${error}`)
  ));
  if (receiptErrors.length) throw new Error(`Invalid analysis batch draft receipts: ${receiptErrors.join('; ')}`);
  const expectedBatchIds = input.plan.batches.map(batch => batch.id);
  const actualBatchIds = input.batchDraftReceipts.map(receipt => receipt.batchId);
  if (JSON.stringify(actualBatchIds) !== JSON.stringify(expectedBatchIds)) {
    throw new Error('analysis coverage requires every batch exactly once in canonical order');
  }
  if (!unique(actualBatchIds) || !unique(input.batchDraftReceipts.map(receipt => receipt.id))) {
    throw new Error('analysis coverage rejects duplicate batch receipts');
  }
  const createdAt = input.createdAt ?? Date.now();
  const base = {
    planId: input.plan.id,
    packetSetId: input.plan.packetSet.packetSetId,
    scope: input.plan.scope,
    sourceRevisionFingerprint: input.plan.sourceRevisionFingerprint,
    canonicalLaneSet: input.plan.canonicalLaneSet,
    packetIds: input.plan.packets.map(packet => packet.id),
    batchIds: expectedBatchIds,
    batchDraftReceiptIds: input.batchDraftReceipts.map(receipt => receipt.id),
    batchDraftFingerprints: input.batchDraftReceipts.map(receipt => receipt.draftFingerprint),
    coverage: 'all_packets_exactly_once' as const,
    createdAt,
  };
  const receipt: HistoryCompanionAnalysisCoverageReceipt = {
    schemaVersion: HISTORY_COMPANION_ANALYSIS_COVERAGE_RECEIPT_SCHEMA_VERSION,
    id: `history-companion-analysis-coverage-${sha256HistoryCompanionAuthority(
      canonicalHistoryCompanionAuthorityJson(base),
    )}`,
    ...base,
    scope: { ...base.scope },
    canonicalLaneSet: [...base.canonicalLaneSet],
    packetIds: [...base.packetIds],
    batchIds: [...base.batchIds],
    batchDraftReceiptIds: [...base.batchDraftReceiptIds],
    batchDraftFingerprints: [...base.batchDraftFingerprints],
    runtimeAuthority: 'none',
    truthEffect: 'none',
  };
  const errors = validateHistoryCompanionAnalysisCoverageReceipt(
    input.plan,
    input.batchDraftReceipts,
    receipt,
  );
  if (errors.length) throw new Error(`Invalid generated analysis coverage receipt: ${errors.join('; ')}`);
  return receipt;
};

export const validateHistoryCompanionAnalysisCoverageReceipt = (
  plan: HistoryCompanionAnalysisBatchPlan,
  draftReceipts: readonly HistoryCompanionAnalysisBatchDraftReceipt[],
  receipt: HistoryCompanionAnalysisCoverageReceipt,
): string[] => {
  const errors = validateHistoryCompanionAnalysisBatchPlan(plan);
  draftReceipts.forEach((draftReceipt, index) => {
    validateHistoryCompanionAnalysisBatchDraftReceipt(plan, draftReceipt).forEach(error => (
      errors.push(`batchDraftReceipt[${index}]: ${error}`)
    ));
  });
  const expectedBatchIds = plan.batches.map(batch => batch.id);
  const actualBatchIds = draftReceipts.map(draftReceipt => draftReceipt.batchId);
  if (JSON.stringify(actualBatchIds) !== JSON.stringify(expectedBatchIds)) {
    errors.push('analysis coverage requires every batch exactly once in canonical order');
  }
  if (
    !unique(actualBatchIds)
    || !unique(draftReceipts.map(draftReceipt => draftReceipt.id))
  ) {
    errors.push('analysis coverage rejects duplicate batch receipts');
  }
  if (receipt.schemaVersion !== HISTORY_COMPANION_ANALYSIS_COVERAGE_RECEIPT_SCHEMA_VERSION) {
    errors.push('unsupported analysis coverage receipt schemaVersion');
  }
  if (receipt.planId !== plan.id) errors.push('analysis coverage receipt planId mismatch');
  if (receipt.packetSetId !== plan.packetSet.packetSetId) {
    errors.push('analysis coverage receipt packetSetId mismatch');
  }
  if (!sameScope(receipt.scope, plan.scope)) errors.push('analysis coverage receipt crosses scope');
  if (receipt.sourceRevisionFingerprint !== plan.sourceRevisionFingerprint) {
    errors.push('analysis coverage receipt crosses source revision');
  }
  if (JSON.stringify(receipt.canonicalLaneSet) !== JSON.stringify(plan.canonicalLaneSet)) {
    errors.push('analysis coverage receipt crosses canonical lane set');
  }
  if (JSON.stringify(receipt.packetIds) !== JSON.stringify(plan.packets.map(packet => packet.id))) {
    errors.push('analysis coverage receipt packetIds mismatch');
  }
  if (JSON.stringify(receipt.batchIds) !== JSON.stringify(plan.batches.map(batch => batch.id))) {
    errors.push('analysis coverage receipt batchIds mismatch');
  }
  if (
    JSON.stringify(receipt.batchDraftReceiptIds)
    !== JSON.stringify(draftReceipts.map(item => item.id))
    || JSON.stringify(receipt.batchDraftFingerprints)
      !== JSON.stringify(draftReceipts.map(item => item.draftFingerprint))
  ) {
    errors.push('analysis coverage receipt draft receipts mismatch');
  }
  if (
    receipt.coverage !== 'all_packets_exactly_once'
    || receipt.runtimeAuthority !== 'none'
    || receipt.truthEffect !== 'none'
  ) {
    errors.push('analysis coverage receipt must remain exact-once and non-authoritative');
  }
  if (!Number.isFinite(receipt.createdAt)) errors.push('analysis coverage receipt createdAt must be finite');
  const base = {
    planId: receipt.planId,
    packetSetId: receipt.packetSetId,
    scope: receipt.scope,
    sourceRevisionFingerprint: receipt.sourceRevisionFingerprint,
    canonicalLaneSet: receipt.canonicalLaneSet,
    packetIds: receipt.packetIds,
    batchIds: receipt.batchIds,
    batchDraftReceiptIds: receipt.batchDraftReceiptIds,
    batchDraftFingerprints: receipt.batchDraftFingerprints,
    coverage: receipt.coverage,
    createdAt: receipt.createdAt,
  };
  const expectedId = `history-companion-analysis-coverage-${sha256HistoryCompanionAuthority(
    canonicalHistoryCompanionAuthorityJson(base),
  )}`;
  if (receipt.id !== expectedId) errors.push('analysis coverage receipt id mismatch');
  return errors;
};

export const validateHistoryCompanionAnalysisEphemeralBatchDrafts = (
  plan: HistoryCompanionAnalysisBatchPlan,
  coverageReceipt: HistoryCompanionAnalysisCoverageReceipt,
  batchDrafts: readonly HistoryCompanionAnalysisEphemeralBatchDraft[],
): string[] => {
  const receipts = batchDrafts.map(item => item.receipt);
  const errors = validateHistoryCompanionAnalysisCoverageReceipt(
    plan,
    receipts,
    coverageReceipt,
  );
  batchDrafts.forEach((item, index) => {
    if (!item.ephemeralDraft.trim()) {
      errors.push(`analysis synthesis batchDraft[${index}] must not be empty`);
      return;
    }
    const expectedFingerprint = authorityFingerprint({ draft: item.ephemeralDraft });
    if (item.receipt.draftFingerprint !== expectedFingerprint) {
      errors.push(`analysis synthesis batchDraft[${index}] does not match its receipt`);
    }
  });
  return errors;
};

export const createHistoryCompanionAnalysisSynthesisEnvelope = (input: {
  plan: HistoryCompanionAnalysisBatchPlan;
  coverageReceipt: HistoryCompanionAnalysisCoverageReceipt;
  batchDrafts: readonly HistoryCompanionAnalysisEphemeralBatchDraft[];
  /** Final non-verbatim synthesis, still pending semantic adjudication. */
  ephemeralSynthesisDraft: string;
  createdAt?: number;
}): HistoryCompanionAnalysisSynthesisEnvelope => {
  const batchDraftReceipts = input.batchDrafts.map(item => item.receipt);
  const coverageErrors = validateHistoryCompanionAnalysisEphemeralBatchDrafts(
    input.plan,
    input.coverageReceipt,
    input.batchDrafts,
  );
  if (coverageErrors.length) throw new Error(`Invalid analysis coverage receipt: ${coverageErrors.join('; ')}`);
  if (!input.ephemeralSynthesisDraft.trim()) throw new Error('analysis synthesis draft must not be empty');
  const createdAt = input.createdAt ?? Date.now();
  const synthesisInputDigest = authorityFingerprint({
    coverageReceiptId: input.coverageReceipt.id,
    batchDraftReceiptIds: batchDraftReceipts.map(receipt => receipt.id),
    batchDraftFingerprints: batchDraftReceipts.map(receipt => receipt.draftFingerprint),
  });
  const synthesisDraftFingerprint = authorityFingerprint({
    synthesisDraft: input.ephemeralSynthesisDraft,
  });
  const base = {
    planId: input.plan.id,
    coverageReceiptId: input.coverageReceipt.id,
    packetSetId: input.plan.packetSet.packetSetId,
    scope: input.plan.scope,
    sourceRevisionFingerprint: input.plan.sourceRevisionFingerprint,
    canonicalLaneSet: input.plan.canonicalLaneSet,
    synthesisInputDigest,
    synthesisDraftFingerprint,
    createdAt,
  };
  return {
    schemaVersion: HISTORY_COMPANION_ANALYSIS_SYNTHESIS_ENVELOPE_SCHEMA_VERSION,
    id: `history-companion-analysis-synthesis-${sha256HistoryCompanionAuthority(
      canonicalHistoryCompanionAuthorityJson(base),
    )}`,
    ...base,
    scope: { ...base.scope },
    canonicalLaneSet: [...base.canonicalLaneSet],
    disposition: 'non_authoritative_synthesis_draft',
    requiresIndependentAdjudication: true,
    runtimeAuthority: 'none',
    truthEffect: 'none',
    rawRetention: 'ephemeral_not_persisted',
  };
};

export const validateHistoryCompanionAnalysisSynthesisEnvelope = (
  plan: HistoryCompanionAnalysisBatchPlan,
  coverageReceipt: HistoryCompanionAnalysisCoverageReceipt,
  draftReceipts: readonly HistoryCompanionAnalysisBatchDraftReceipt[],
  envelope: HistoryCompanionAnalysisSynthesisEnvelope,
): string[] => {
  const errors = validateHistoryCompanionAnalysisCoverageReceipt(
    plan,
    draftReceipts,
    coverageReceipt,
  );
  if (envelope.schemaVersion !== HISTORY_COMPANION_ANALYSIS_SYNTHESIS_ENVELOPE_SCHEMA_VERSION) {
    errors.push('unsupported analysis synthesis envelope schemaVersion');
  }
  if (envelope.planId !== plan.id) errors.push('analysis synthesis envelope planId mismatch');
  if (envelope.coverageReceiptId !== coverageReceipt.id) {
    errors.push('analysis synthesis envelope coverageReceiptId mismatch');
  }
  if (envelope.packetSetId !== plan.packetSet.packetSetId) {
    errors.push('analysis synthesis envelope packetSetId mismatch');
  }
  if (!sameScope(envelope.scope, plan.scope)) errors.push('analysis synthesis envelope crosses scope');
  if (envelope.sourceRevisionFingerprint !== plan.sourceRevisionFingerprint) {
    errors.push('analysis synthesis envelope crosses source revision');
  }
  if (JSON.stringify(envelope.canonicalLaneSet) !== JSON.stringify(plan.canonicalLaneSet)) {
    errors.push('analysis synthesis envelope crosses canonical lane set');
  }
  const expectedInputDigest = authorityFingerprint({
    coverageReceiptId: coverageReceipt.id,
    batchDraftReceiptIds: draftReceipts.map(receipt => receipt.id),
    batchDraftFingerprints: draftReceipts.map(receipt => receipt.draftFingerprint),
  });
  if (envelope.synthesisInputDigest !== expectedInputDigest) {
    errors.push('analysis synthesis envelope input digest mismatch');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(envelope.synthesisDraftFingerprint)) {
    errors.push('analysis synthesis draft fingerprint must use SHA-256');
  }
  if (
    envelope.disposition !== 'non_authoritative_synthesis_draft'
    || envelope.requiresIndependentAdjudication !== true
    || envelope.runtimeAuthority !== 'none'
    || envelope.truthEffect !== 'none'
  ) {
    errors.push('analysis synthesis envelope must remain non-authoritative');
  }
  if (envelope.rawRetention !== 'ephemeral_not_persisted') {
    errors.push('analysis synthesis envelope rawRetention must remain ephemeral');
  }
  if (!Number.isFinite(envelope.createdAt)) {
    errors.push('analysis synthesis envelope createdAt must be finite');
  }
  const base = {
    planId: envelope.planId,
    coverageReceiptId: envelope.coverageReceiptId,
    packetSetId: envelope.packetSetId,
    scope: envelope.scope,
    sourceRevisionFingerprint: envelope.sourceRevisionFingerprint,
    canonicalLaneSet: envelope.canonicalLaneSet,
    synthesisInputDigest: envelope.synthesisInputDigest,
    synthesisDraftFingerprint: envelope.synthesisDraftFingerprint,
    createdAt: envelope.createdAt,
  };
  const expectedId = `history-companion-analysis-synthesis-${sha256HistoryCompanionAuthority(
    canonicalHistoryCompanionAuthorityJson(base),
  )}`;
  if (envelope.id !== expectedId) errors.push('analysis synthesis envelope id mismatch');
  return errors;
};
