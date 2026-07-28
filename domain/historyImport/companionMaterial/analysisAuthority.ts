import {
  canonicalHistoryCompanionAuthorityJson,
  sha256HistoryCompanionAuthority,
  type HistoryCompanionAnalysisPacket,
} from './analysisPacket.ts';
import type {
  HistoryCompanionAnalysisAdjudicationReceipt,
  HistoryCompanionAnalysisReview,
} from './analysisReview.ts';
import type { HistoryCompanionMaterialPass } from './types.ts';
import type { HistoryScope } from '../types.ts';

export const HISTORY_COMPANION_ACTIVATION_RECEIPT_SCHEMA_VERSION = 1 as const;
export const HISTORY_COMPANION_AUTHORITY_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const HISTORY_COMPANION_RECEIPT_LEDGER_SCHEMA_VERSION = 1 as const;

export type HistoryCompanionAdjudicationAuthority =
  | 'same_model_second_pass'
  | 'independent_adjudication';

/**
 * Opaque, code-captured executor identity. `principalId` must be a stable
 * runtime/session handle, never an API key and never a name emitted by a model.
 */
export interface HistoryCompanionExecutionPrincipal {
  kind: 'model_runtime' | 'human_session';
  principalId: string;
  provider: string;
  modelOrActor: string;
  capturedBy: 'authenticated_runtime' | 'local_owner_session';
}

export interface HistoryCompanionActivationSourceDocument {
  documentId: string;
  documentRevision: number;
}

export interface HistoryCompanionActivationReceipt {
  schemaVersion: typeof HISTORY_COMPANION_ACTIVATION_RECEIPT_SCHEMA_VERSION;
  id: string;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  /** Every Daily Archive document represented by the canonical packet set, including zero-finding days. */
  sourceDocuments: readonly HistoryCompanionActivationSourceDocument[];
  packetSetDigest: string;
  reviewRunId: string;
  reviewDigest: string;
  adjudicationRunId: string;
  adjudicationDigest: string;
  approvedFindingDigest: string;
  passId: string;
  passDigest: string;
  candidateDigest: string;
  adjudicationAuthority: HistoryCompanionAdjudicationAuthority;
  analyzerPrincipal: HistoryCompanionExecutionPrincipal;
  adjudicatorPrincipal: HistoryCompanionExecutionPrincipal;
  finalizerVersion: string;
  activatedAt: number;
  receiptDigest: string;
}

export interface HistoryCompanionAuthorityEnvelope {
  schemaVersion: typeof HISTORY_COMPANION_AUTHORITY_ENVELOPE_SCHEMA_VERSION;
  authority:
    | 'same_model_second_pass_history_companion_material'
    | 'independent_adjudicated_history_companion_material';
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  passId: string;
  activationReceiptId: string;
  activationReceiptDigest: string;
  packetSetDigest: string;
  approvedFindingDigest: string;
  candidateDigest: string;
  envelopeDigest: string;
}

export interface HistoryCompanionAnalysisFinalization {
  pass: HistoryCompanionMaterialPass;
  activationReceipt: HistoryCompanionActivationReceipt;
  authorityEnvelope: HistoryCompanionAuthorityEnvelope;
}

export interface HistoryCompanionActivationReceiptLedgerEntry {
  schemaVersion: typeof HISTORY_COMPANION_RECEIPT_LEDGER_SCHEMA_VERSION;
  sequence: number;
  previousEntryDigest: string | null;
  receipt: HistoryCompanionActivationReceipt;
  entryDigest: string;
}

/**
 * Storage seam only. IndexedDB or APK persistence implements this later; the
 * domain layer owns canonical entry construction and chain validation.
 */
export interface HistoryCompanionActivationReceiptStore {
  read(scope: HistoryScope): Promise<readonly HistoryCompanionActivationReceiptLedgerEntry[]>;
  append(
    entry: HistoryCompanionActivationReceiptLedgerEntry,
    expectedPreviousEntryDigest: string | null,
  ): Promise<void>;
}

const isNonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const sha256 = (value: unknown): string => (
  `sha256:${sha256HistoryCompanionAuthority(canonicalHistoryCompanionAuthorityJson(value))}`
);

const canonicalScope = (scope: HistoryScope): HistoryScope => ({
  progressBundleId: scope.progressBundleId,
  personaMaskId: scope.personaMaskId,
  charId: scope.charId,
});

const adjudicationAuthorityFromReceipt = (
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt,
): HistoryCompanionAdjudicationAuthority => (
  adjudication.method.reviewerKind === 'same_model_second_pass'
    ? 'same_model_second_pass'
    : 'independent_adjudication'
);

const authorityEnvelopeKind = (
  authority: HistoryCompanionAdjudicationAuthority,
): HistoryCompanionAuthorityEnvelope['authority'] => (
  authority === 'same_model_second_pass'
    ? 'same_model_second_pass_history_companion_material'
    : 'independent_adjudicated_history_companion_material'
);

export const historyCompanionExecutionPrincipalKey = (
  principal: HistoryCompanionExecutionPrincipal,
): string => [
  principal.kind,
  principal.provider,
  principal.principalId,
].join(':');

export const validateHistoryCompanionExecutionPrincipal = (
  principal: HistoryCompanionExecutionPrincipal | undefined,
  label = 'execution principal',
): string[] => {
  if (!principal || typeof principal !== 'object') return [`${label} is required`];
  const errors: string[] = [];
  if (!['model_runtime', 'human_session'].includes(principal.kind)) {
    errors.push(`${label}.kind is invalid`);
  }
  if (!isNonEmpty(principal.principalId)) errors.push(`${label}.principalId is required`);
  if (!isNonEmpty(principal.provider)) errors.push(`${label}.provider is required`);
  if (!isNonEmpty(principal.modelOrActor)) errors.push(`${label}.modelOrActor is required`);
  if (!['authenticated_runtime', 'local_owner_session'].includes(principal.capturedBy)) {
    errors.push(`${label}.capturedBy is invalid`);
  }
  return errors;
};

const canonicalReview = (review: HistoryCompanionAnalysisReview): unknown => ({
  ...review,
  packetIds: [...review.packetIds].sort(),
  findings: [...review.findings]
    .map(finding => ({
      ...finding,
      evidenceIds: [...finding.evidenceIds].sort(),
      tags: [...finding.tags].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
});

const canonicalAdjudication = (
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt,
): unknown => ({
  ...adjudication,
  packetIds: [...adjudication.packetIds].sort(),
  findings: [...adjudication.findings]
    .map(finding => ({
      ...finding,
      evidenceSpeakerAttributions: [...finding.evidenceSpeakerAttributions]
        .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    }))
    .sort((left, right) => left.findingId.localeCompare(right.findingId)),
});

const canonicalPass = (pass: HistoryCompanionMaterialPass): unknown => ({
  ...pass,
  candidates: [...pass.candidates]
    .map(candidate => ({
      ...candidate,
      sourceRefs: [...candidate.sourceRefs].sort((left, right) => (
        canonicalHistoryCompanionAuthorityJson(left)
          .localeCompare(canonicalHistoryCompanionAuthorityJson(right))
      )),
      eligibleModes: [...candidate.eligibleModes].sort(),
      eligiblePurposes: [...candidate.eligiblePurposes].sort(),
      tags: [...candidate.tags].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
});

const candidateDigest = (pass: HistoryCompanionMaterialPass): string => sha256(
  [...pass.candidates]
    .map(candidate => ({
      ...candidate,
      sourceRefs: [...candidate.sourceRefs].sort((left, right) => (
        canonicalHistoryCompanionAuthorityJson(left)
          .localeCompare(canonicalHistoryCompanionAuthorityJson(right))
      )),
      eligibleModes: [...candidate.eligibleModes].sort(),
      eligiblePurposes: [...candidate.eligiblePurposes].sort(),
      tags: [...candidate.tags].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
);

const approvedFindingDigest = (input: {
  review: HistoryCompanionAnalysisReview;
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt;
}): string => {
  const sourceById = new Map(input.review.findings.map(finding => [finding.id, finding]));
  return sha256(
    input.adjudication.findings
      .filter(finding => finding.decision === 'approved')
      .map(finding => ({
        finding: sourceById.get(finding.findingId),
        adjudication: {
          ...finding,
          evidenceSpeakerAttributions: [...finding.evidenceSpeakerAttributions]
            .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
        },
      }))
      .sort((left, right) => (
        (left.finding?.id || '').localeCompare(right.finding?.id || '')
      )),
  );
};

const packetSetDigest = (
  packets: readonly HistoryCompanionAnalysisPacket[],
): string => sha256({
  packetSetId: packets[0]?.packetSet.packetSetId,
  orderedEvidenceDigest: packets[0]?.packetSet.orderedEvidenceDigest,
  packetIds: packets.map(packet => packet.id).sort(),
  packetEvidenceDigests: packets.map(packet => packet.packetEvidenceDigest).sort(),
});

const sourceDocumentsFromPackets = (
  packets: readonly HistoryCompanionAnalysisPacket[],
): HistoryCompanionActivationSourceDocument[] => {
  return (packets[0]?.packetSet.sourceDocuments || [])
    .map(document => ({ ...document }));
};

const activationReceiptPayload = (
  receipt: Omit<HistoryCompanionActivationReceipt, 'id' | 'receiptDigest'>,
): unknown => receipt;

const envelopePayload = (
  envelope: Omit<HistoryCompanionAuthorityEnvelope, 'envelopeDigest'>,
): unknown => envelope;

export const createHistoryCompanionAnalysisAuthority = (input: {
  packets: readonly HistoryCompanionAnalysisPacket[];
  review: HistoryCompanionAnalysisReview;
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt;
  pass: HistoryCompanionMaterialPass;
  finalizerVersion: string;
}): Pick<HistoryCompanionAnalysisFinalization, 'activationReceipt' | 'authorityEnvelope'> => {
  const reviewDigest = sha256(canonicalReview(input.review));
  const adjudicationDigest = sha256(canonicalAdjudication(input.adjudication));
  const approvedDigest = approvedFindingDigest(input);
  const materialCandidateDigest = candidateDigest(input.pass);
  const materialPassDigest = sha256(canonicalPass(input.pass));
  const setDigest = packetSetDigest(input.packets);
  const adjudicationAuthority = adjudicationAuthorityFromReceipt(input.adjudication);
  const receiptWithoutIdentity: Omit<
    HistoryCompanionActivationReceipt,
    'id' | 'receiptDigest'
  > = {
    schemaVersion: HISTORY_COMPANION_ACTIVATION_RECEIPT_SCHEMA_VERSION,
    scope: canonicalScope(input.review.scope),
    sourceRevisionFingerprint: input.review.sourceRevisionFingerprint,
    sourceDocuments: sourceDocumentsFromPackets(input.packets),
    packetSetDigest: setDigest,
    reviewRunId: input.review.analysisRunId,
    reviewDigest,
    adjudicationRunId: input.adjudication.adjudicationRunId,
    adjudicationDigest,
    approvedFindingDigest: approvedDigest,
    passId: input.pass.id,
    passDigest: materialPassDigest,
    candidateDigest: materialCandidateDigest,
    adjudicationAuthority,
    analyzerPrincipal: { ...input.review.analyzerPrincipal },
    adjudicatorPrincipal: { ...input.adjudication.adjudicatorPrincipal },
    finalizerVersion: input.finalizerVersion,
    activatedAt: input.adjudication.adjudicatedAt,
  };
  const receiptDigest = sha256(activationReceiptPayload(receiptWithoutIdentity));
  const activationReceipt: HistoryCompanionActivationReceipt = {
    ...receiptWithoutIdentity,
    id: `history-companion-activation-${receiptDigest.slice('sha256:'.length)}`,
    receiptDigest,
  };
  const envelopeWithoutDigest: Omit<HistoryCompanionAuthorityEnvelope, 'envelopeDigest'> = {
    schemaVersion: HISTORY_COMPANION_AUTHORITY_ENVELOPE_SCHEMA_VERSION,
    authority: authorityEnvelopeKind(adjudicationAuthority),
    scope: canonicalScope(input.review.scope),
    sourceRevisionFingerprint: input.review.sourceRevisionFingerprint,
    passId: input.pass.id,
    activationReceiptId: activationReceipt.id,
    activationReceiptDigest: activationReceipt.receiptDigest,
    packetSetDigest: setDigest,
    approvedFindingDigest: approvedDigest,
    candidateDigest: materialCandidateDigest,
  };
  return {
    activationReceipt,
    authorityEnvelope: {
      ...envelopeWithoutDigest,
      envelopeDigest: sha256(envelopePayload(envelopeWithoutDigest)),
    },
  };
};

/**
 * Digest/envelope consistency only. Callers that grant or persist authority
 * must use the full validator exported by analysisReview.ts, which also
 * re-derives the pass from validated review + adjudication findings.
 */
export const validateHistoryCompanionAnalysisAuthorityEnvelope = (input: {
  packets: readonly HistoryCompanionAnalysisPacket[];
  review: HistoryCompanionAnalysisReview;
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt;
  finalization: HistoryCompanionAnalysisFinalization;
  finalizerVersion: string;
}): string[] => {
  const expected = createHistoryCompanionAnalysisAuthority({
    ...input,
    pass: input.finalization.pass,
  });
  const errors: string[] = [];
  if (
    canonicalHistoryCompanionAuthorityJson(input.finalization.activationReceipt)
    !== canonicalHistoryCompanionAuthorityJson(expected.activationReceipt)
  ) {
    errors.push('activation receipt does not match packet, review, adjudication, principals, or pass');
  }
  if (
    canonicalHistoryCompanionAuthorityJson(input.finalization.authorityEnvelope)
    !== canonicalHistoryCompanionAuthorityJson(expected.authorityEnvelope)
  ) {
    errors.push('authority envelope does not match the canonical activation receipt');
  }
  return errors;
};

const receiptPayloadFromReceipt = (
  receipt: HistoryCompanionActivationReceipt,
): Omit<HistoryCompanionActivationReceipt, 'id' | 'receiptDigest'> => {
  const { id: _id, receiptDigest: _receiptDigest, ...payload } = receipt;
  return payload;
};

export const validateHistoryCompanionActivationReceiptShape = (
  receipt: HistoryCompanionActivationReceipt,
): string[] => {
  const errors: string[] = [];
  if (receipt.schemaVersion !== HISTORY_COMPANION_ACTIVATION_RECEIPT_SCHEMA_VERSION) {
    errors.push('activation receipt schemaVersion is unsupported');
  }
  const sourceDocuments = Array.isArray(receipt.sourceDocuments) ? receipt.sourceDocuments : [];
  if (sourceDocuments.length < 1) {
    errors.push('activation receipt requires canonical source documents');
  }
  const sourceDocumentIds = new Set<string>();
  sourceDocuments.forEach((document, index) => {
    if (!isNonEmpty(document?.documentId)) {
      errors.push(`activation receipt sourceDocuments[${index}].documentId is required`);
    }
    if (!Number.isInteger(document?.documentRevision) || document.documentRevision < 1) {
      errors.push(`activation receipt sourceDocuments[${index}].documentRevision must be positive`);
    }
    if (sourceDocumentIds.has(document?.documentId)) {
      errors.push('activation receipt source document ids must be unique');
    }
    sourceDocumentIds.add(document?.documentId);
  });
  if (
    canonicalHistoryCompanionAuthorityJson(sourceDocuments)
    !== canonicalHistoryCompanionAuthorityJson(
      [...sourceDocuments].sort((left, right) => left.documentId.localeCompare(right.documentId)),
    )
  ) {
    errors.push('activation receipt source documents must use canonical id order');
  }
  errors.push(...validateHistoryCompanionExecutionPrincipal(
    receipt.analyzerPrincipal,
    'activation receipt analyzer principal',
  ));
  errors.push(...validateHistoryCompanionExecutionPrincipal(
    receipt.adjudicatorPrincipal,
    'activation receipt adjudicator principal',
  ));
  if (!['same_model_second_pass', 'independent_adjudication'].includes(
    receipt.adjudicationAuthority,
  )) {
    errors.push('activation receipt adjudicationAuthority is invalid');
  }
  const samePrincipal = (
    historyCompanionExecutionPrincipalKey(receipt.analyzerPrincipal)
    === historyCompanionExecutionPrincipalKey(receipt.adjudicatorPrincipal)
  );
  const sameModelRuntime = (
    receipt.analyzerPrincipal.kind === 'model_runtime'
    && receipt.adjudicatorPrincipal.kind === 'model_runtime'
    && receipt.analyzerPrincipal.provider === receipt.adjudicatorPrincipal.provider
    && receipt.analyzerPrincipal.modelOrActor === receipt.adjudicatorPrincipal.modelOrActor
  );
  if (
    receipt.adjudicationAuthority === 'same_model_second_pass'
    && !sameModelRuntime
  ) {
    errors.push('same-model activation receipt must bind the same provider and model');
  }
  if (
    receipt.adjudicationAuthority === 'independent_adjudication'
    && (
      samePrincipal
      || sameModelRuntime
    )
  ) {
    errors.push('independent activation receipt must bind a genuinely distinct principal/model');
  }
  const expectedDigest = sha256(activationReceiptPayload(receiptPayloadFromReceipt(receipt)));
  if (receipt.receiptDigest !== expectedDigest) {
    errors.push('activation receipt digest does not match its canonical payload');
  }
  if (receipt.id !== `history-companion-activation-${expectedDigest.slice('sha256:'.length)}`) {
    errors.push('activation receipt id does not match its canonical digest');
  }
  return errors;
};

const ledgerEntryPayload = (
  entry: Omit<HistoryCompanionActivationReceiptLedgerEntry, 'entryDigest'>,
): unknown => ({
  schemaVersion: entry.schemaVersion,
  sequence: entry.sequence,
  previousEntryDigest: entry.previousEntryDigest,
  receiptId: entry.receipt.id,
  receiptDigest: entry.receipt.receiptDigest,
});

export const appendCanonicalHistoryCompanionActivationReceipt = (
  ledger: readonly HistoryCompanionActivationReceiptLedgerEntry[],
  receipt: HistoryCompanionActivationReceipt,
): readonly HistoryCompanionActivationReceiptLedgerEntry[] => {
  const ledgerErrors = validateHistoryCompanionActivationReceiptLedger(ledger);
  if (ledgerErrors.length) throw new Error(`Invalid activation receipt ledger: ${ledgerErrors.join('; ')}`);
  const receiptErrors = validateHistoryCompanionActivationReceiptShape(receipt);
  if (receiptErrors.length) throw new Error(`Invalid activation receipt: ${receiptErrors.join('; ')}`);
  if (ledger.some(entry => entry.receipt.id === receipt.id)) {
    throw new Error('Activation receipt ledger is append-only and already contains this receipt id');
  }
  const entryWithoutDigest: Omit<HistoryCompanionActivationReceiptLedgerEntry, 'entryDigest'> = {
    schemaVersion: HISTORY_COMPANION_RECEIPT_LEDGER_SCHEMA_VERSION,
    sequence: ledger.length,
    previousEntryDigest: ledger.length ? ledger[ledger.length - 1].entryDigest : null,
    receipt,
  };
  return [
    ...ledger,
    {
      ...entryWithoutDigest,
      entryDigest: sha256(ledgerEntryPayload(entryWithoutDigest)),
    },
  ];
};

export const validateHistoryCompanionActivationReceiptLedger = (
  ledger: readonly HistoryCompanionActivationReceiptLedgerEntry[],
): string[] => {
  const errors: string[] = [];
  const receiptIds = new Set<string>();
  ledger.forEach((entry, index) => {
    const label = `activation receipt ledger[${index}]`;
    if (entry.schemaVersion !== HISTORY_COMPANION_RECEIPT_LEDGER_SCHEMA_VERSION) {
      errors.push(`${label} schemaVersion is unsupported`);
    }
    if (entry.sequence !== index) errors.push(`${label} sequence is not canonical`);
    const expectedPrevious = index === 0 ? null : ledger[index - 1].entryDigest;
    if (entry.previousEntryDigest !== expectedPrevious) {
      errors.push(`${label} previousEntryDigest breaks the append-only chain`);
    }
    errors.push(...validateHistoryCompanionActivationReceiptShape(entry.receipt)
      .map(error => `${label}: ${error}`));
    if (receiptIds.has(entry.receipt.id)) errors.push(`${label} repeats a receipt id`);
    receiptIds.add(entry.receipt.id);
    const { entryDigest: _entryDigest, ...payload } = entry;
    if (entry.entryDigest !== sha256(ledgerEntryPayload(payload))) {
      errors.push(`${label} entryDigest does not match its canonical payload`);
    }
  });
  return errors;
};
