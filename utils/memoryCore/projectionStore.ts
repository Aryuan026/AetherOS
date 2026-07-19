import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { sameEvidenceScope } from '../../domain/interactionEvidence/index.ts';
import {
  assertMemoryProjectionReceipt,
  type MemoryProjectionCommitResult,
  type MemoryProjectionReceipt,
  type MemoryProjectionStorePort,
} from '../../domain/memoryProjection/index.ts';
import { DB } from '../db.ts';

export const MEMORY_PROJECTION_ASSET_ID = 'memory_projection_corrections_v1';

interface StoredMemoryProjectionCorrections {
  schemaVersion: 1;
  receipts: MemoryProjectionReceipt[];
}

const emptyStore = (): StoredMemoryProjectionCorrections => ({ schemaVersion: 1, receipts: [] });

const parseStore = (raw: string | null): StoredMemoryProjectionCorrections => {
  if (!raw) return emptyStore();
  const parsed = JSON.parse(raw) as StoredMemoryProjectionCorrections;
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.receipts)) {
    throw new Error('Memory projection correction store 格式无效。');
  }
  parsed.receipts.forEach(receipt => assertMemoryProjectionReceipt(receipt));
  if (new Set(parsed.receipts.map(receipt => receipt.id)).size !== parsed.receipts.length) {
    throw new Error('Memory projection receipt id 重复。');
  }
  if (new Set(parsed.receipts.map(receipt => receipt.commandId)).size !== parsed.receipts.length) {
    throw new Error('Memory projection command receipt 重复。');
  }
  return parsed;
};

export const memoryProjectionStore: MemoryProjectionStorePort = {
  listReceipts: async (scope: HistoryScope): Promise<MemoryProjectionReceipt[]> => {
    const store = parseStore(await DB.getAsset(MEMORY_PROJECTION_ASSET_ID));
    return store.receipts.filter(receipt => sameEvidenceScope(receipt.scope, scope));
  },
  commit: async (receipt: MemoryProjectionReceipt): Promise<MemoryProjectionCommitResult> => {
    assertMemoryProjectionReceipt(receipt);
    return DB.updateAsset<MemoryProjectionCommitResult>(MEMORY_PROJECTION_ASSET_ID, raw => {
      const store = parseStore(raw);
      const existing = store.receipts.find(row => row.commandId === receipt.commandId);
      if (existing) {
        return { data: JSON.stringify(store), result: { outcome: 'existing_command', receipt: existing } };
      }
      if (receipt.status === 'applied') {
        const currentRevision = store.receipts
          .filter(row => row.targetRecordId === receipt.targetRecordId && row.status === 'applied')
          .reduce((highest, row) => Math.max(highest, row.revision || 0), 0);
        if (receipt.revision !== currentRevision + 1) {
          throw new Error('Memory projection revision conflict。');
        }
      }
      const next = { ...store, receipts: [...store.receipts, receipt] };
      return { data: JSON.stringify(next), result: { outcome: 'committed', receipt } };
    });
  },
};
