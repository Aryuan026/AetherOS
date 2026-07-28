import {
  type HistoryCompanionAnalysisFinalization,
  type HistoryCompanionActivationReceipt,
  validateHistoryCompanionActivationReceiptShape,
} from '../../../domain/historyImport/companionMaterial/analysisAuthority.ts';
import {
  HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  type HistoryCompanionAnalysisAdjudicationReceipt,
  type HistoryCompanionAnalysisReview,
  validateHistoryCompanionAnalysisFinalization,
} from '../../../domain/historyImport/companionMaterial/analysisReview.ts';
import {
  canonicalHistoryCompanionAuthorityJson,
  historyCompanionSourceRevisionFingerprintFromDocuments,
  sha256HistoryCompanionAuthority,
  type HistoryCompanionAnalysisPacket,
  type HistoryCompanionSourceDocumentHead,
} from '../../../domain/historyImport/companionMaterial/analysisPacket.ts';
import {
  assertValidHistoryCompanionMaterialPass,
} from '../../../domain/historyImport/companionMaterial/contract.ts';
import type {
  HistoryCompanionMaterialPass,
} from '../../../domain/historyImport/companionMaterial/types.ts';
import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../../../domain/historyImport/contract.ts';
import type {
  HistoryScope,
} from '../../../domain/historyImport/types.ts';
import type { DailyArchiveDocument } from '../../../domain/dailyArchive/types.ts';
import {
  listDailyArchiveDocumentsForScope,
} from '../../dailyArchive/storage.ts';

export const HISTORY_COMPANION_MATERIAL_ACTIVATION_DB_NAME = (
  'AetherOS_HistoryCompanionMaterialActivation:v1'
) as const;
export const HISTORY_COMPANION_MATERIAL_ACTIVATION_DB_VERSION = 1 as const;
export const HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE = (
  'history_companion_material_activation_receipts'
) as const;

export type HistoryCompanionMaterialSourceDocumentHead = HistoryCompanionSourceDocumentHead;

const getFactory = (factory?: IDBFactory): IDBFactory => {
  const resolved = factory ?? globalThis.indexedDB;
  if (!resolved) throw new Error('IndexedDB is unavailable for history companion material activation');
  return resolved;
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('activation receipt IndexedDB request failed'));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('activation receipt transaction failed'));
  transaction.onabort = () => reject(transaction.error ?? new DOMException('activation receipt transaction aborted'));
});

const authorityDigest = (value: unknown): string => (
  `sha256:${sha256HistoryCompanionAuthority(canonicalHistoryCompanionAuthorityJson(value))}`
);

const scopesMatch = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const sourceDocumentRevisionsForReceipt = (
  receipt: HistoryCompanionActivationReceipt,
): Map<string, number> => {
  const revisions = new Map<string, number>();
  receipt.sourceDocuments.forEach(sourceDocument => {
    const existing = revisions.get(sourceDocument.documentId);
    if (existing !== undefined && existing !== sourceDocument.documentRevision) {
      throw new Error(
        `activation receipt references conflicting revisions for ${sourceDocument.documentId}`,
      );
    }
    revisions.set(sourceDocument.documentId, sourceDocument.documentRevision);
  });
  if (revisions.size < 1) {
    throw new Error('activation receipt has no canonical Daily Archive source documents');
  }
  return revisions;
};

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

/** Must stay byte-compatible with the domain finalizer's passDigest. */
export const historyCompanionMaterialPassDigest = (
  pass: HistoryCompanionMaterialPass,
): string => {
  assertValidHistoryCompanionMaterialPass(pass);
  return authorityDigest(canonicalPass(pass));
};

export const resolveCurrentHistoryCompanionMaterialSourceHead = async (input: {
  scope: HistoryScope;
  documentIds: readonly string[];
  factory?: IDBFactory;
}): Promise<{
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  sourceDocumentHeads: HistoryCompanionMaterialSourceDocumentHead[];
}> => {
  const scopeErrors = validateHistoryScope(input.scope);
  if (scopeErrors.length > 0) throw new Error(scopeErrors.join('; '));
  const documentIds = [...new Set(input.documentIds.map(item => item.trim()).filter(Boolean))].sort();
  if (documentIds.length < 1) throw new Error('canonical source authority requires at least one document id');

  const currentDocuments = await listDailyArchiveDocumentsForScope({
    scope: input.scope,
    factory: input.factory,
  });
  const byId = new Map(currentDocuments.map(document => [document.id, document]));
  const selectedDocuments: DailyArchiveDocument[] = [];
  for (const documentId of documentIds) {
    const document = byId.get(documentId);
    if (!document) throw new Error(`canonical Daily Archive document ${documentId} is missing`);
    if (!scopesMatch(document.scope, input.scope)) {
      throw new Error(`canonical Daily Archive document ${documentId} crosses scope`);
    }
    selectedDocuments.push(document);
  }
  const {
    sourceRevisionFingerprint,
    sourceDocumentHeads,
  } = historyCompanionSourceRevisionFingerprintFromDocuments({
    scope: input.scope,
    documents: selectedDocuments,
  });

  return {
    scope: { ...input.scope },
    sourceRevisionFingerprint,
    sourceDocumentHeads,
  };
};

export const resolveCurrentHistoryCompanionMaterialActivationSourceHead = async (input: {
  pass: HistoryCompanionMaterialPass;
  receipt: HistoryCompanionActivationReceipt;
  factory?: IDBFactory;
}): Promise<{
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  sourceDocumentHeads: HistoryCompanionMaterialSourceDocumentHead[];
}> => {
  assertValidHistoryCompanionMaterialPass(input.pass);
  const receiptErrors = validateHistoryCompanionActivationReceiptShape(input.receipt);
  if (receiptErrors.length) {
    throw new Error(`invalid activation receipt: ${receiptErrors.join('; ')}`);
  }
  if (!scopesMatch(input.receipt.scope, input.pass.scope) || input.receipt.passId !== input.pass.id) {
    throw new Error('activation receipt does not belong to the history companion material pass');
  }
  const sourceRevisions = sourceDocumentRevisionsForReceipt(input.receipt);
  const head = await resolveCurrentHistoryCompanionMaterialSourceHead({
    scope: input.pass.scope,
    documentIds: [...sourceRevisions.keys()],
    factory: input.factory,
  });
  head.sourceDocumentHeads.forEach(document => {
    if (sourceRevisions.get(document.documentId) !== document.revision) {
      throw new Error(`stale Daily Archive document revision for ${document.documentId}`);
    }
  });
  return head;
};

export const openHistoryCompanionMaterialActivationDatabase = async (
  factory?: IDBFactory,
): Promise<IDBDatabase> => {
  const request = getFactory(factory).open(
    HISTORY_COMPANION_MATERIAL_ACTIVATION_DB_NAME,
    HISTORY_COMPANION_MATERIAL_ACTIVATION_DB_VERSION,
  );
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore(
      HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE,
      { keyPath: 'id' },
    );
    store.createIndex('pass_id', 'passId', { unique: false });
  };
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('activation receipt database open failed'));
    request.onblocked = () => reject(new Error('activation receipt database open was blocked'));
  });
  database.onversionchange = () => database.close();
  return database;
};

export const loadHistoryCompanionMaterialActivationReceipt = async (input: {
  receiptId: string;
  factory?: IDBFactory;
}): Promise<HistoryCompanionActivationReceipt | null> => {
  if (!input.receiptId?.trim()) throw new Error('activationReceiptId is required');
  const database = await openHistoryCompanionMaterialActivationDatabase(input.factory);
  try {
    const transaction = database.transaction(
      HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE,
      'readonly',
    );
    const raw = await requestAsPromise(
      transaction.objectStore(HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE).get(input.receiptId),
    );
    if (raw === undefined) return null;
    const receipt = raw as HistoryCompanionActivationReceipt;
    const errors = validateHistoryCompanionActivationReceiptShape(receipt);
    if (errors.length > 0) throw new Error(`invalid stored activation receipt: ${errors.join('; ')}`);
    return receipt;
  } finally {
    database.close();
  }
};

export const loadHistoryCompanionMaterialActivationReceiptsForPass = async (input: {
  passId: string;
  factory?: IDBFactory;
}): Promise<HistoryCompanionActivationReceipt[]> => {
  if (!input.passId?.trim()) throw new Error('passId is required');
  const database = await openHistoryCompanionMaterialActivationDatabase(input.factory);
  try {
    const transaction = database.transaction(
      HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE,
      'readonly',
    );
    const index = transaction
      .objectStore(HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE)
      .index('pass_id');
    const raw = await requestAsPromise(index.getAll(input.passId));
    return (raw as HistoryCompanionActivationReceipt[]).filter(receipt => (
      validateHistoryCompanionActivationReceiptShape(receipt).length === 0
    ));
  } finally {
    database.close();
  }
};

/**
 * Storage seam for a receipt already created by the analysis finalizer. The
 * receipt preserves whether review was same-model or genuinely independent;
 * storage cannot mint authority from a hand-authored active pass.
 */
export const appendHistoryCompanionAnalysisFinalizationActivation = async (input: {
  packets: readonly HistoryCompanionAnalysisPacket[];
  review: HistoryCompanionAnalysisReview;
  adjudication: HistoryCompanionAnalysisAdjudicationReceipt;
  finalization: HistoryCompanionAnalysisFinalization;
  finalizerVersion?: string;
  factory?: IDBFactory;
}): Promise<void> => {
  const authorityErrors = validateHistoryCompanionAnalysisFinalization({
    packets: input.packets,
    review: input.review,
    adjudication: input.adjudication,
    finalization: input.finalization,
    finalizerVersion: input.finalizerVersion ?? HISTORY_COMPANION_ANALYSIS_FINALIZER_VERSION,
  });
  if (authorityErrors.length) {
    throw new Error(`invalid history companion finalization: ${authorityErrors.join('; ')}`);
  }
  const pass = input.finalization.pass;
  const receipt = input.finalization.activationReceipt;
  assertValidHistoryCompanionMaterialPass(pass);
  const head = await resolveCurrentHistoryCompanionMaterialActivationSourceHead({
    pass,
    receipt,
    factory: input.factory,
  });
  if (
    receipt.sourceRevisionFingerprint !== pass.sourceRevisionFingerprint
    || receipt.sourceRevisionFingerprint !== head.sourceRevisionFingerprint
  ) {
    throw new Error('history companion material activation receipt is stale');
  }

  const database = await openHistoryCompanionMaterialActivationDatabase(input.factory);
  const transaction = database.transaction(
    HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE,
    'readwrite',
  );
  const settled = transactionAsPromise(transaction);
  try {
    const store = transaction.objectStore(HISTORY_COMPANION_MATERIAL_ACTIVATION_RECEIPT_STORE);
    const existing = await requestAsPromise(store.get(receipt.id));
    if (existing !== undefined) {
      if (
        canonicalHistoryCompanionAuthorityJson(existing)
        !== canonicalHistoryCompanionAuthorityJson(receipt)
      ) {
        throw new Error('activation receipt id already contains another immutable authorization');
      }
      await settled;
      return;
    }
    await requestAsPromise(store.add(receipt));
    await settled;
  } finally {
    database.close();
  }
};

export const assertCurrentHistoryCompanionMaterialActivation = async (input: {
  pass: HistoryCompanionMaterialPass;
  activationReceiptId: string;
  factory?: IDBFactory;
}): Promise<HistoryCompanionActivationReceipt> => {
  const receipt = await loadHistoryCompanionMaterialActivationReceipt({
    receiptId: input.activationReceiptId,
    factory: input.factory,
  });
  if (!receipt) throw new Error('canonical history companion material activation receipt does not exist');
  if (!scopesMatch(receipt.scope, input.pass.scope)) {
    throw new Error('history companion material activation receipt crosses scope');
  }
  if (
    receipt.passId !== input.pass.id
    || receipt.passDigest !== historyCompanionMaterialPassDigest(input.pass)
  ) {
    throw new Error('history companion material activation receipt targets another pass');
  }
  const head = await resolveCurrentHistoryCompanionMaterialActivationSourceHead({
    pass: input.pass,
    receipt,
    factory: input.factory,
  });
  if (
    head.sourceRevisionFingerprint !== receipt.sourceRevisionFingerprint
    || head.sourceRevisionFingerprint !== input.pass.sourceRevisionFingerprint
  ) {
    throw new Error('history companion material activation receipt is stale');
  }
  return receipt;
};

export const loadCurrentHistoryCompanionMaterialActivationReceiptForPass = async (input: {
  pass: HistoryCompanionMaterialPass;
  factory?: IDBFactory;
}): Promise<HistoryCompanionActivationReceipt | null> => {
  const receipts = await loadHistoryCompanionMaterialActivationReceiptsForPass({
    passId: input.pass.id,
    factory: input.factory,
  });
  for (const receipt of receipts) {
    try {
      return await assertCurrentHistoryCompanionMaterialActivation({
        pass: input.pass,
        activationReceiptId: receipt.id,
        factory: input.factory,
      });
    } catch {
      // A stale or mismatched receipt cannot keep already-published material
      // visible to the selector. Continue only in case another canonical
      // receipt for the same immutable pass remains current.
    }
  }
  return null;
};
