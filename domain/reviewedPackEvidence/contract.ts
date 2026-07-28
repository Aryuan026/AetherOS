import {
  validateHistoryScope,
} from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import {
  REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION,
  type ReviewedPackConservationExpectation,
  type ReviewedPackConservationSummary,
  type ReviewedPackEvidenceRecord,
  type ReviewedPackEvidenceSink,
  type ReviewedPackReviewRequest,
  type ReviewedPackResidualDisposition,
  type ReviewedPackSourceRef,
  type ReviewedPackTerminalDisposition,
  type ReviewedPackTerminalReceipt,
} from './types.ts';

const PACK_DIGEST = /^sha256:[a-f0-9]{64}$/u;
const EVIDENCE_CLASSES = new Set([
  'character_canon_candidate',
  'relationship_plot_candidate',
  'withheld_reinforcement',
]);
const EVALUATION_ROLES = new Set(['review_input', 'blind_holdout']);
const EVIDENCE_STATUSES = new Set(['retained', 'superseded', 'rejected']);
const RESIDUAL_DISPOSITIONS = new Set<ReviewedPackResidualDisposition>([
  'duplicate_reinforcement',
  'exact_scope_evidence',
  'holdout',
  'isolated_or_insufficient',
  'promotion_to_non_verbatim_asset',
  'promotion_to_scope_gated_non_verbatim_asset',
  'retained_unclassified',
]);
const TERMINAL_DISPOSITIONS = new Set<ReviewedPackTerminalDisposition>([
  'retained_pending_review',
  'retained_pending_scope',
  'retained_insufficient_evidence',
  'review_rejected',
  'holdout_evaluated',
  'adjudicated_character_canon_evidence',
  'adjudicated_relationship_evidence',
  'adjudicated_scene_candidate_evidence',
  'adjudicated_nonruntime_material_candidate',
]);
const SINKS = new Set<ReviewedPackEvidenceSink>([
  'review_ledger_only',
  'holdout_evaluation_only',
  'character_canon_evidence',
  'relationship_evidence',
  'scene_plan_candidate_evidence',
  'companion_material_candidate_registry',
]);

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  left.progressBundleId === right.progressBundleId
  && left.personaMaskId === right.personaMaskId
  && left.charId === right.charId
);

const cloneSourceRef = (sourceRef: ReviewedPackSourceRef): ReviewedPackSourceRef => ({
  ...sourceRef,
});

export const validateReviewedPackSourceRef = (
  sourceRef: ReviewedPackSourceRef,
  label = 'sourceRef',
): string[] => {
  const errors: string[] = [];
  if (sourceRef?.storeFamily !== 'reviewed_pack') {
    errors.push(`${label}.storeFamily must be reviewed_pack`);
  }
  if (!nonEmpty(sourceRef?.packId)) errors.push(`${label}.packId is required`);
  if (!Number.isInteger(sourceRef?.packRevision) || sourceRef.packRevision < 1) {
    errors.push(`${label}.packRevision must be a positive integer`);
  }
  if (!PACK_DIGEST.test(sourceRef?.packDigest || '')) {
    errors.push(`${label}.packDigest must be a sha256 digest`);
  }
  if (!nonEmpty(sourceRef?.sourceFingerprint)) {
    errors.push(`${label}.sourceFingerprint is required`);
  }
  if (
    sourceRef?.sourceGroupFingerprint !== undefined
    && !nonEmpty(sourceRef.sourceGroupFingerprint)
  ) {
    errors.push(`${label}.sourceGroupFingerprint cannot be empty`);
  }
  return errors;
};

export const validateReviewedPackEvidenceRecord = (
  record: ReviewedPackEvidenceRecord,
): string[] => {
  const errors: string[] = [];
  if (record?.schemaVersion !== REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION) {
    errors.push('schemaVersion is unsupported');
  }
  if (!nonEmpty(record?.id)) errors.push('id is required');
  if (!nonEmpty(record?.leadId)) errors.push('leadId is required');
  if (!nonEmpty(record?.charId)) errors.push('charId is required');
  if (!EVIDENCE_CLASSES.has(record?.evidenceClass)) errors.push('evidenceClass is invalid');
  if (!EVALUATION_ROLES.has(record?.evaluationRole)) errors.push('evaluationRole is invalid');
  if (!EVIDENCE_STATUSES.has(record?.status)) errors.push('status is invalid');
  if (!Number.isInteger(record?.revision) || record.revision < 1) {
    errors.push('revision must be a positive integer');
  }
  errors.push(...validateReviewedPackSourceRef(record?.sourceRef, 'sourceRef'));
  if (record?.targetScope) {
    errors.push(...validateHistoryScope(record.targetScope).map(error => `targetScope: ${error}`));
    if (record.targetScope.charId !== record.charId) {
      errors.push('targetScope.charId must match evidence charId');
    }
  }
  if (record?.routeRef) {
    for (const [key, value] of Object.entries(record.routeRef)) {
      if (value !== undefined && !nonEmpty(value)) errors.push(`routeRef.${key} cannot be empty`);
    }
  }
  if (record?.reviewedCandidateIds) {
    if (!record.reviewedCandidateIds.length) {
      errors.push('reviewedCandidateIds cannot be empty');
    }
    if (
      new Set(record.reviewedCandidateIds).size
      !== record.reviewedCandidateIds.length
    ) {
      errors.push('reviewedCandidateIds must be unique');
    }
    if (record.reviewedCandidateIds.some(id => !nonEmpty(id))) {
      errors.push('reviewedCandidateIds cannot contain empty ids');
    }
    if (record.evaluationRole === 'blind_holdout') {
      errors.push('blind holdout cannot reference reviewed candidates');
    }
  }
  if (!RESIDUAL_DISPOSITIONS.has(record?.residualDisposition)) {
    errors.push('residualDisposition is invalid');
  }
  if (!Array.isArray(record?.residualReviewedAssetIds)) {
    errors.push('residualReviewedAssetIds are required');
  } else {
    if (
      new Set(record.residualReviewedAssetIds).size
      !== record.residualReviewedAssetIds.length
    ) {
      errors.push('residualReviewedAssetIds must be unique');
    }
    if (record.residualReviewedAssetIds.some(id => !nonEmpty(id))) {
      errors.push('residualReviewedAssetIds cannot contain empty ids');
    }
  }
  if (
    record?.reviewedCandidateIds?.length
    && record.residualDisposition !== 'exact_scope_evidence'
  ) {
    errors.push('reviewed candidates must preserve exact_scope_evidence as residual');
  }
  if (
    record?.reviewedCandidateIds?.length
    && record.residualReviewedAssetIds.length === 0
  ) {
    errors.push('reviewed candidates must preserve at least one residual reviewed asset');
  }
  if (
    record?.evidenceClass === 'withheld_reinforcement'
    && record.evaluationRole === 'blind_holdout'
  ) {
    errors.push('withheld reinforcement cannot be a blind holdout');
  }
  return errors;
};

export const assertReviewedPackEvidenceRecord = (
  record: ReviewedPackEvidenceRecord,
): ReviewedPackEvidenceRecord => {
  const errors = validateReviewedPackEvidenceRecord(record);
  if (errors.length) throw new Error(`Invalid ReviewedPackEvidenceRecord: ${errors.join('; ')}`);
  return record;
};

export const summarizeReviewedPackEvidence = (
  records: readonly ReviewedPackEvidenceRecord[],
): ReviewedPackConservationSummary => ({
  total: records.length,
  reviewInput: records.filter(record => (
    record.evaluationRole === 'review_input'
    && record.evidenceClass !== 'withheld_reinforcement'
  )).length,
  blindHoldout: records.filter(record => record.evaluationRole === 'blind_holdout').length,
  characterCanonCandidate: records.filter(
    record => record.evidenceClass === 'character_canon_candidate',
  ).length,
  relationshipPlotCandidate: records.filter(
    record => record.evidenceClass === 'relationship_plot_candidate',
  ).length,
  withheldReinforcement: records.filter(
    record => record.evidenceClass === 'withheld_reinforcement',
  ).length,
  uniqueEvidenceIds: new Set(records.map(record => record.id)).size,
  uniqueSourceFingerprints: new Set(
    records.map(record => record.sourceRef.sourceFingerprint),
  ).size,
});

export const validateReviewedPackConservation = (
  records: readonly ReviewedPackEvidenceRecord[],
  expected: ReviewedPackConservationExpectation,
): string[] => {
  const errors = records.flatMap((record, index) => (
    validateReviewedPackEvidenceRecord(record).map(error => `records[${index}]: ${error}`)
  ));
  const summary = summarizeReviewedPackEvidence(records);
  for (const key of [
    'total',
    'reviewInput',
    'blindHoldout',
    'characterCanonCandidate',
    'relationshipPlotCandidate',
    'withheldReinforcement',
  ] as const) {
    if (summary[key] !== expected[key]) {
      errors.push(`${key} expected ${expected[key]}, received ${summary[key]}`);
    }
  }
  if (summary.uniqueEvidenceIds !== summary.total) errors.push('evidence ids must be unique');
  if (summary.uniqueSourceFingerprints !== summary.total) {
    errors.push('source fingerprints must be unique');
  }
  return errors;
};

const recordsForRequest = (
  request: ReviewedPackReviewRequest,
  records: readonly ReviewedPackEvidenceRecord[],
): {
  selected: ReviewedPackEvidenceRecord[];
  errors: string[];
} => {
  const errors: string[] = [];
  const byId = new Map(records.map(record => [record.id, record]));
  const selected = request.evidenceIds.flatMap(id => {
    const record = byId.get(id);
    if (!record) {
      errors.push(`evidence ${id} is missing`);
      return [];
    }
    return [record];
  });
  return { selected, errors };
};

export const validateReviewedPackReviewRequest = (
  request: ReviewedPackReviewRequest,
  records: readonly ReviewedPackEvidenceRecord[],
): string[] => {
  const errors: string[] = records.flatMap((record, index) => (
    validateReviewedPackEvidenceRecord(record).map(error => `records[${index}]: ${error}`)
  ));
  if (new Set(records.map(record => record.id)).size !== records.length) {
    errors.push('review source evidence ids must be unique');
  }
  if (request?.schemaVersion !== REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION) {
    errors.push('review request schemaVersion is unsupported');
  }
  if (!nonEmpty(request?.id)) errors.push('review request id is required');
  if (!nonEmpty(request?.packId)) errors.push('review request packId is required');
  if (!Number.isInteger(request?.packRevision) || request.packRevision < 1) {
    errors.push('review request packRevision must be a positive integer');
  }
  if (!PACK_DIGEST.test(request?.packDigest || '')) {
    errors.push('review request packDigest must be a sha256 digest');
  }
  if (!request?.evidenceIds?.length) errors.push('review request needs evidenceIds');
  if (new Set(request?.evidenceIds || []).size !== (request?.evidenceIds || []).length) {
    errors.push('review request evidenceIds must be unique');
  }
  if (!nonEmpty(request?.reviewerVersion)) errors.push('reviewerVersion is required');
  const { selected, errors: selectionErrors } = recordsForRequest(request, records);
  errors.push(...selectionErrors);

  selected.forEach(record => {
    if (record.status !== 'retained') errors.push(`${record.id} is not retained`);
    if (record.evaluationRole === 'blind_holdout') {
      errors.push(`${record.id} is blind holdout and cannot become review input`);
    }
    if (record.evidenceClass === 'withheld_reinforcement') {
      errors.push(`${record.id} is withheld reinforcement and cannot become review input`);
    }
    if (
      record.sourceRef.packId !== request.packId
      || record.sourceRef.packRevision !== request.packRevision
      || record.sourceRef.packDigest !== request.packDigest
    ) {
      errors.push(`${record.id} crosses reviewed source pack authority`);
    }
  });

  if (request?.target?.kind === 'character_canon_evidence') {
    const target = request.target;
    if (!nonEmpty(target.charId)) errors.push('character canon target charId is required');
    selected.forEach(record => {
      if (record.charId !== target.charId) errors.push(`${record.id} crosses character`);
      if (record.evidenceClass !== 'character_canon_candidate') {
        errors.push(`${record.id} cannot become character canon evidence`);
      }
    });
  } else if (request?.target?.kind === 'relationship_evidence') {
    const target = request.target;
    errors.push(...validateHistoryScope(target.scope).map(error => `target scope: ${error}`));
    selected.forEach(record => {
      if (record.evidenceClass !== 'relationship_plot_candidate') {
        errors.push(`${record.id} cannot become relationship evidence`);
      }
      if (!record.targetScope) {
        errors.push(`${record.id} lacks exact relationship scope`);
      } else if (!sameScope(record.targetScope, target.scope)) {
        errors.push(`${record.id} crosses exact relationship scope`);
      }
    });
  } else if (request?.target?.kind === 'scene_plan_candidate_evidence') {
    const target = request.target;
    errors.push(...validateHistoryScope(target.scope).map(error => `target scope: ${error}`));
    for (const key of ['routeId', 'branchId', 'sceneId'] as const) {
      if (!nonEmpty(target[key])) errors.push(`scene target ${key} is required`);
    }
    selected.forEach(record => {
      if (!record.targetScope) {
        errors.push(`${record.id} lacks exact scene scope`);
      } else if (!sameScope(record.targetScope, target.scope)) {
        errors.push(`${record.id} crosses exact scene scope`);
      }
      if (
        !record.routeRef?.routeId
        || !record.routeRef.branchId
        || !record.routeRef.sceneId
      ) {
        errors.push(`${record.id} lacks complete route, branch, and scene refs`);
      } else if (
        record.routeRef.routeId !== target.routeId
        || record.routeRef.branchId !== target.branchId
        || record.routeRef.sceneId !== target.sceneId
      ) {
        errors.push(`${record.id} crosses scene route authority`);
      }
    });
  } else {
    errors.push('review request target is invalid');
  }
  return errors;
};

export const assertReviewedPackReviewRequest = (
  request: ReviewedPackReviewRequest,
  records: readonly ReviewedPackEvidenceRecord[],
): ReviewedPackReviewRequest => {
  const errors = validateReviewedPackReviewRequest(request, records);
  if (errors.length) throw new Error(`Invalid ReviewedPackReviewRequest: ${errors.join('; ')}`);
  return request;
};

const receiptShapeForDisposition = (
  disposition: ReviewedPackTerminalDisposition,
): {
  sink: ReviewedPackEvidenceSink;
  derived: boolean;
} => {
  if (disposition === 'holdout_evaluated') {
    return { sink: 'holdout_evaluation_only', derived: false };
  }
  if (disposition === 'adjudicated_character_canon_evidence') {
    return { sink: 'character_canon_evidence', derived: true };
  }
  if (disposition === 'adjudicated_relationship_evidence') {
    return { sink: 'relationship_evidence', derived: true };
  }
  if (disposition === 'adjudicated_scene_candidate_evidence') {
    return { sink: 'scene_plan_candidate_evidence', derived: true };
  }
  if (disposition === 'adjudicated_nonruntime_material_candidate') {
    return { sink: 'companion_material_candidate_registry', derived: true };
  }
  return { sink: 'review_ledger_only', derived: false };
};

export const validateReviewedPackTerminalReceipt = (
  receipt: ReviewedPackTerminalReceipt,
  record: ReviewedPackEvidenceRecord,
): string[] => {
  const errors = validateReviewedPackEvidenceRecord(record).map(error => `record: ${error}`);
  if (receipt?.schemaVersion !== REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION) {
    errors.push('receipt schemaVersion is unsupported');
  }
  if (!nonEmpty(receipt?.id)) errors.push('receipt id is required');
  if (receipt?.evidenceId !== record.id) errors.push('receipt evidenceId does not match record');
  if (receipt?.evidenceRevision !== record.revision) {
    errors.push('receipt evidenceRevision does not match record');
  }
  errors.push(...validateReviewedPackSourceRef(receipt?.sourceRef, 'receipt.sourceRef'));
  if (
    receipt?.sourceRef?.packId !== record.sourceRef.packId
    || receipt?.sourceRef?.packRevision !== record.sourceRef.packRevision
    || receipt?.sourceRef?.packDigest !== record.sourceRef.packDigest
    || receipt?.sourceRef?.sourceFingerprint !== record.sourceRef.sourceFingerprint
    || receipt?.sourceRef?.sourceGroupFingerprint !== record.sourceRef.sourceGroupFingerprint
  ) {
    errors.push('receipt sourceRef does not match record authority');
  }
  if (!TERMINAL_DISPOSITIONS.has(receipt?.disposition)) errors.push('receipt disposition is invalid');
  if (!SINKS.has(receipt?.sink)) errors.push('receipt sink is invalid');
  if (receipt?.truthEffect !== 'none') errors.push('reviewed pack receipt cannot change truth');
  if (receipt?.relationshipMemoryEffect !== 'none') {
    errors.push('reviewed pack receipt cannot write relationship memory');
  }
  if (receipt?.runtimeDelivery !== 'forbidden') {
    errors.push('reviewed pack receipt cannot authorize runtime delivery');
  }
  if (!nonEmpty(receipt?.reviewerVersion)) errors.push('receipt reviewerVersion is required');
  if (!Number.isFinite(receipt?.createdAt)) errors.push('receipt createdAt must be finite');
  if (!Array.isArray(receipt?.derivedRecordIds)) errors.push('receipt derivedRecordIds are required');
  if (new Set(receipt?.derivedRecordIds || []).size !== (receipt?.derivedRecordIds || []).length) {
    errors.push('receipt derivedRecordIds must be unique');
  }
  if ((receipt?.derivedRecordIds || []).some(id => !nonEmpty(id))) {
    errors.push('receipt derivedRecordIds cannot contain empty ids');
  }
  if (receipt?.residualDisposition !== record.residualDisposition) {
    errors.push('receipt residualDisposition does not match record');
  }
  const actualResidualIds = [...(receipt?.residualReviewedAssetIds || [])].sort();
  const expectedResidualIds = [...record.residualReviewedAssetIds].sort();
  if (
    actualResidualIds.length !== expectedResidualIds.length
    || actualResidualIds.some((id, index) => id !== expectedResidualIds[index])
  ) {
    errors.push('receipt residualReviewedAssetIds do not match record');
  }

  const shape = receiptShapeForDisposition(receipt.disposition);
  if (receipt.sink !== shape.sink) errors.push('receipt sink does not match disposition');
  if (shape.derived !== (receipt.derivedRecordIds.length > 0)) {
    errors.push(shape.derived
      ? 'adjudicated receipt requires derivedRecordIds'
      : 'non-adjudicated receipt cannot contain derivedRecordIds');
  }
  if (!shape.derived && !nonEmpty(receipt.reason)) {
    errors.push('non-adjudicated receipt requires a reason');
  }

  if (record.evaluationRole === 'blind_holdout') {
    if (receipt.disposition !== 'holdout_evaluated') {
      errors.push('blind holdout may only receive a holdout_evaluated receipt');
    }
  } else if (receipt.disposition === 'holdout_evaluated') {
    errors.push('review input cannot masquerade as blind holdout');
  }

  if (receipt.disposition === 'adjudicated_character_canon_evidence') {
    if (record.evidenceClass !== 'character_canon_candidate') {
      errors.push('only character canon candidate can reach character canon evidence');
    }
  }
  if (receipt.disposition === 'adjudicated_relationship_evidence') {
    if (record.evidenceClass !== 'relationship_plot_candidate') {
      errors.push('only relationship plot candidate can reach relationship evidence');
    }
    if (!record.targetScope || validateHistoryScope(record.targetScope).length) {
      errors.push('relationship evidence requires exact HistoryScope');
    }
  }
  if (receipt.disposition === 'adjudicated_scene_candidate_evidence') {
    if (!record.targetScope || validateHistoryScope(record.targetScope).length) {
      errors.push('scene candidate evidence requires exact HistoryScope');
    }
    if (
      !record.routeRef?.routeId
      || !record.routeRef.branchId
      || !record.routeRef.sceneId
    ) {
      errors.push('scene candidate evidence requires routeId, branchId, and sceneId');
    }
  }
  if (receipt.disposition === 'adjudicated_nonruntime_material_candidate') {
    if (!record.reviewedCandidateIds?.length) {
      errors.push('nonruntime candidate receipt requires reviewedCandidateIds');
    } else {
      const actual = [...receipt.derivedRecordIds].sort();
      const expected = [...record.reviewedCandidateIds].sort();
      if (
        actual.length !== expected.length
        || actual.some((id, index) => id !== expected[index])
      ) {
        errors.push('nonruntime candidate receipt must name the exact reviewedCandidateIds');
      }
    }
  }
  if (
    record.evidenceClass === 'withheld_reinforcement'
    && ![
      'retained_insufficient_evidence',
      'review_rejected',
      ...(record.reviewedCandidateIds?.length
        ? ['adjudicated_nonruntime_material_candidate' as const]
        : []),
    ].includes(receipt.disposition)
  ) {
    errors.push('withheld reinforcement must remain in the review ledger');
  }
  return errors;
};

export const createReviewedPackTerminalReceipt = (
  record: ReviewedPackEvidenceRecord,
  input: {
    id: string;
    disposition: ReviewedPackTerminalDisposition;
    derivedRecordIds?: readonly string[];
    reviewerVersion: string;
    reason?: string;
    createdAt: number;
  },
): ReviewedPackTerminalReceipt => {
  const shape = receiptShapeForDisposition(input.disposition);
  const receipt: ReviewedPackTerminalReceipt = {
    schemaVersion: REVIEWED_PACK_EVIDENCE_SCHEMA_VERSION,
    id: input.id,
    evidenceId: record.id,
    evidenceRevision: record.revision,
    sourceRef: cloneSourceRef(record.sourceRef),
    disposition: input.disposition,
    sink: shape.sink,
    derivedRecordIds: [...(input.derivedRecordIds || [])],
    residualDisposition: record.residualDisposition,
    residualReviewedAssetIds: [...record.residualReviewedAssetIds],
    truthEffect: 'none',
    relationshipMemoryEffect: 'none',
    runtimeDelivery: 'forbidden',
    reviewerVersion: input.reviewerVersion,
    reason: input.reason,
    createdAt: input.createdAt,
  };
  const errors = validateReviewedPackTerminalReceipt(receipt, record);
  if (errors.length) throw new Error(`Invalid ReviewedPackTerminalReceipt: ${errors.join('; ')}`);
  return receipt;
};

export const validateReviewedPackTerminalLedger = (
  records: readonly ReviewedPackEvidenceRecord[],
  receipts: readonly ReviewedPackTerminalReceipt[],
): string[] => {
  const errors: string[] = records.flatMap((record, index) => (
    validateReviewedPackEvidenceRecord(record).map(error => `records[${index}]: ${error}`)
  ));
  if (new Set(records.map(record => record.id)).size !== records.length) {
    errors.push('terminal ledger evidence ids must be unique');
  }
  const byEvidenceId = new Map<string, ReviewedPackTerminalReceipt[]>();
  receipts.forEach(receipt => {
    const entries = byEvidenceId.get(receipt.evidenceId) || [];
    entries.push(receipt);
    byEvidenceId.set(receipt.evidenceId, entries);
  });
  records.forEach(record => {
    const matches = byEvidenceId.get(record.id) || [];
    if (matches.length !== 1) {
      errors.push(`${record.id} requires exactly one terminal receipt`);
      return;
    }
    errors.push(...validateReviewedPackTerminalReceipt(matches[0], record).map(
      error => `${record.id}: ${error}`,
    ));
  });
  const knownIds = new Set(records.map(record => record.id));
  receipts.forEach(receipt => {
    if (!knownIds.has(receipt.evidenceId)) {
      errors.push(`${receipt.id} references unknown evidence ${receipt.evidenceId}`);
    }
  });
  if (new Set(receipts.map(receipt => receipt.id)).size !== receipts.length) {
    errors.push('terminal receipt ids must be unique');
  }
  return errors;
};
