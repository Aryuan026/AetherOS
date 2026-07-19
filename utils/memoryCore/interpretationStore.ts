import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { sameEvidenceScope } from '../../domain/interactionEvidence/index.ts';
import {
  assertMemoryExtractionReceipt,
  assertMemoryInterpretationPass,
  type MemoryDMExtractionReceipt,
  type MemoryInterpretationPass,
  type MemoryInterpretationStorePort,
} from '../../domain/memoryInterpretation/index.ts';
import { DB } from '../db.ts';

const MEMORY_INTERPRETATION_ASSET_ID = 'memory_interpretation_store_v1';

interface StoredMemoryInterpretations {
  schemaVersion: 1;
  passes: MemoryInterpretationPass[];
  receipts: MemoryDMExtractionReceipt[];
}

const emptyStore = (): StoredMemoryInterpretations => ({
  schemaVersion: 1,
  passes: [],
  receipts: [],
});

const readStore = async (): Promise<StoredMemoryInterpretations> => {
  const raw = await DB.getAsset(MEMORY_INTERPRETATION_ASSET_ID);
  if (!raw) return emptyStore();
  const parsed = JSON.parse(raw) as StoredMemoryInterpretations;
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.passes) || !Array.isArray(parsed.receipts)) {
    throw new Error('Memory interpretation store 格式无效。');
  }
  parsed.passes.forEach(assertMemoryInterpretationPass);
  parsed.receipts.forEach(assertMemoryExtractionReceipt);
  return parsed;
};

const writeStore = async (store: StoredMemoryInterpretations): Promise<void> => {
  await DB.saveAsset(MEMORY_INTERPRETATION_ASSET_ID, JSON.stringify(store));
};

let mutationQueue: Promise<void> = Promise.resolve();

const enqueueMutation = async (operation: () => Promise<void>): Promise<void> => {
  const next = mutationQueue.then(operation, operation);
  mutationQueue = next.catch(() => undefined);
  await next;
};

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

export const memoryInterpretationStore: MemoryInterpretationStorePort = {
  listPasses: async (scope: HistoryScope): Promise<MemoryInterpretationPass[]> => (
    (await readStore()).passes.filter(pass => sameEvidenceScope(pass.scope, scope))
  ),
  listReceipts: async (scope: HistoryScope): Promise<MemoryDMExtractionReceipt[]> => (
    (await readStore()).receipts.filter(receipt => sameEvidenceScope(receipt.scope, scope))
  ),
  appendPass: async (pass: MemoryInterpretationPass): Promise<void> => {
    assertMemoryInterpretationPass(pass);
    await enqueueMutation(async () => {
      const store = await readStore();
      await writeStore({ ...store, passes: appendImmutable(store.passes, pass, 'MemoryInterpretationPass') });
    });
  },
  appendReceipt: async (receipt: MemoryDMExtractionReceipt): Promise<void> => {
    assertMemoryExtractionReceipt(receipt);
    await enqueueMutation(async () => {
      const store = await readStore();
      await writeStore({ ...store, receipts: appendImmutable(store.receipts, receipt, 'MemoryDMExtractionReceipt') });
    });
  },
  appendCompleted: async (
    pass: MemoryInterpretationPass,
    receipt: MemoryDMExtractionReceipt,
  ): Promise<void> => {
    assertMemoryInterpretationPass(pass);
    assertMemoryExtractionReceipt(receipt);
    if (
      receipt.passId !== pass.id
      || receipt.requestId !== pass.requestId
      || !sameEvidenceScope(receipt.scope, pass.scope)
      || !sameEvidenceSpan(pass.evidenceSpan, receipt.evidenceSpan)
      || receipt.candidateIds.length !== pass.candidates.length
      || receipt.candidateIds.some((id, index) => id !== pass.candidates[index].id)
    ) {
      throw new Error('Memory extraction pass 与 receipt 归属不一致。');
    }
    await enqueueMutation(async () => {
      const store = await readStore();
      await writeStore({
        ...store,
        passes: appendImmutable(store.passes, pass, 'MemoryInterpretationPass'),
        receipts: appendImmutable(store.receipts, receipt, 'MemoryDMExtractionReceipt'),
      });
    });
  },
};
