import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { sameEvidenceScope } from '../../domain/interactionEvidence/index.ts';
import {
  MEMORY_INTERPRETATION_SCHEMA_VERSION,
  assertMemoryExtractionClaim,
  assertMemoryExtractionReceipt,
  assertMemoryExtractionRequest,
  assertMemoryInterpretationPass,
  createMemoryExtractionClaimId,
  type MemoryDMExtractionReceipt,
  type MemoryDMExtractionRequest,
  type MemoryExtractionClaim,
  type MemoryInterpretationPass,
  type MemoryInterpretationStorePort,
} from '../../domain/memoryInterpretation/index.ts';
import { DB } from '../db.ts';

const MEMORY_INTERPRETATION_ASSET_ID = 'memory_interpretation_store_v1';
const PENDING_CLAIM_LEASE_MS = 15 * 60 * 1000;

interface StoredMemoryInterpretations {
  schemaVersion: 1;
  claims: MemoryExtractionClaim[];
  passes: MemoryInterpretationPass[];
  receipts: MemoryDMExtractionReceipt[];
}

const emptyStore = (): StoredMemoryInterpretations => ({
  schemaVersion: 1,
  claims: [],
  passes: [],
  receipts: [],
});

const parseStore = (raw: string | null): StoredMemoryInterpretations => {
  if (!raw) return emptyStore();
  const parsed = JSON.parse(raw) as StoredMemoryInterpretations;
  if (
    parsed?.schemaVersion !== 1
    || !Array.isArray(parsed.claims)
    || !Array.isArray(parsed.passes)
    || !Array.isArray(parsed.receipts)
  ) throw new Error('Memory interpretation store 格式无效。');
  parsed.claims.forEach(assertMemoryExtractionClaim);
  parsed.passes.forEach(assertMemoryInterpretationPass);
  parsed.receipts.forEach(assertMemoryExtractionReceipt);
  return parsed;
};

const readStore = async (): Promise<StoredMemoryInterpretations> => (
  parseStore(await DB.getAsset(MEMORY_INTERPRETATION_ASSET_ID))
);

const mutateStore = async <T>(
  mutate: (store: StoredMemoryInterpretations) => { store: StoredMemoryInterpretations; result: T },
): Promise<T> => DB.updateAsset(MEMORY_INTERPRETATION_ASSET_ID, current => {
  const next = mutate(parseStore(current));
  return { data: JSON.stringify(next.store), result: next.result };
});

const appendImmutable = <T extends { id: string }>(rows: T[], incoming: T, label: string): T[] => {
  const existing = rows.find(row => row.id === incoming.id);
  if (!existing) return [...rows, incoming];
  if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
    throw new Error(`${label} ${incoming.id} 已存在不同内容。`);
  }
  return rows;
};

const sameEvidenceSpan = (
  left: MemoryInterpretationPass['evidenceSpan'],
  right: MemoryDMExtractionReceipt['evidenceSpan'],
): boolean => (
  left.sourceRevisionFingerprint === right.sourceRevisionFingerprint
  && left.evidenceIds.length === right.evidenceIds.length
  && left.evidenceIds.every((id, index) => id === right.evidenceIds[index])
  && sameEvidenceScope(left.scope, right.scope)
);

const assertCompletedPair = (
  pass: MemoryInterpretationPass,
  receipt: MemoryDMExtractionReceipt,
): void => {
  assertMemoryInterpretationPass(pass);
  assertMemoryExtractionReceipt(receipt);
  if (
    receipt.passId !== pass.id
    || receipt.requestId !== pass.requestId
    || receipt.analysisRunId !== pass.analysisRunId
    || !sameEvidenceScope(receipt.scope, pass.scope)
    || !sameEvidenceSpan(pass.evidenceSpan, receipt.evidenceSpan)
    || receipt.extractor !== pass.extractor
    || receipt.promptVersion !== pass.promptVersion
    || receipt.outputSchemaVersion !== pass.outputSchemaVersion
    || receipt.candidateIds.length !== pass.candidates.length
    || receipt.candidateIds.some((id, index) => id !== pass.candidates[index].id)
  ) throw new Error('Memory extraction pass 与 receipt 归属不一致。');
};

const updatedClaim = (
  claims: MemoryExtractionClaim[],
  requestId: string,
  status: 'completed' | 'failed',
  updatedAt: number,
): MemoryExtractionClaim[] => claims.map(claim => (
  claim.requestId === requestId ? { ...claim, status, updatedAt: Math.max(updatedAt, claim.createdAt) } : claim
));

export const memoryInterpretationStore: MemoryInterpretationStorePort = {
  listPasses: async (scope: HistoryScope): Promise<MemoryInterpretationPass[]> => (
    (await readStore()).passes.filter(pass => sameEvidenceScope(pass.scope, scope))
  ),
  listReceipts: async (scope: HistoryScope): Promise<MemoryDMExtractionReceipt[]> => (
    (await readStore()).receipts.filter(receipt => sameEvidenceScope(receipt.scope, scope))
  ),
  claimRequest: async (request: MemoryDMExtractionRequest): Promise<boolean> => {
    assertMemoryExtractionRequest(request);
    const claimId = createMemoryExtractionClaimId(request);
    return mutateStore(store => {
      const now = Date.now();
      const existing = store.claims.find(claim => claim.id === claimId);
      const pendingIsStale = existing?.status === 'pending' && now - existing.updatedAt >= PENDING_CLAIM_LEASE_MS;
      if (existing?.status === 'completed' || (existing?.status === 'pending' && !pendingIsStale)) {
        return { store, result: false };
      }
      const claim = assertMemoryExtractionClaim({
        schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
        id: claimId,
        requestId: request.id,
        scope: { ...request.scope },
        extractor: request.extractor,
        sourceRevisionFingerprint: request.evidenceSpan.sourceRevisionFingerprint,
        promptVersion: request.promptVersion,
        outputSchemaVersion: request.outputSchemaVersion,
        status: 'pending',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return {
        store: {
          ...store,
          claims: existing
            ? store.claims.map(row => row.id === claimId ? claim : row)
            : [...store.claims, claim],
        },
        result: true,
      };
    });
  },
  appendCompleted: async (
    pass: MemoryInterpretationPass,
    receipt: MemoryDMExtractionReceipt,
  ): Promise<void> => {
    assertCompletedPair(pass, receipt);
    await mutateStore(store => ({
      store: {
        ...store,
        claims: updatedClaim(store.claims, pass.requestId, 'completed', receipt.createdAt),
        passes: appendImmutable(store.passes, pass, 'MemoryInterpretationPass'),
        receipts: appendImmutable(store.receipts, receipt, 'MemoryDMExtractionReceipt'),
      },
      result: undefined,
    }));
  },
  appendFailure: async (
    request: MemoryDMExtractionRequest,
    receipt: MemoryDMExtractionReceipt,
  ): Promise<void> => {
    assertMemoryExtractionRequest(request);
    assertMemoryExtractionReceipt(receipt);
    if (
      receipt.status === 'completed'
      || receipt.requestId !== request.id
      || receipt.analysisRunId !== request.analysisRunId
      || !sameEvidenceScope(receipt.scope, request.scope)
      || receipt.evidenceSpan.sourceRevisionFingerprint !== request.evidenceSpan.sourceRevisionFingerprint
      || receipt.extractor !== request.extractor
      || receipt.promptVersion !== request.promptVersion
      || receipt.outputSchemaVersion !== request.outputSchemaVersion
    ) throw new Error('Memory extraction failure receipt 与 request 归属不一致。');
    await mutateStore(store => ({
      store: {
        ...store,
        claims: updatedClaim(store.claims, request.id, 'failed', receipt.createdAt),
        receipts: appendImmutable(store.receipts, receipt, 'MemoryDMExtractionReceipt'),
      },
      result: undefined,
    }));
  },
};
