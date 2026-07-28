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
import type { HistoryScope } from '../../../domain/historyImport/types.ts';

export const HISTORY_COMPANION_MATERIAL_DB_NAME = 'AetherOS_HistoryCompanionMaterial:v1' as const;
export const HISTORY_COMPANION_MATERIAL_DB_VERSION = 1 as const;
export const HISTORY_COMPANION_MATERIAL_PASS_STORE = 'history_companion_material_passes' as const;
export const HISTORY_COMPANION_MATERIAL_SCOPE_CREATED_INDEX = 'scope_created' as const;

const getIndexedDbFactory = (factory?: IDBFactory): IDBFactory => {
  const resolved = factory ?? globalThis.indexedDB;
  if (!resolved) throw new Error('IndexedDB is unavailable in this environment');
  return resolved;
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
});

const transactionAsPromise = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
});

const settleAbort = async (
  transaction: IDBTransaction,
  settled: Promise<void>,
): Promise<void> => {
  try {
    transaction.abort();
  } catch {
    // The transaction may already be settled.
  }
  try {
    await settled;
  } catch {
    // The caller receives the more specific contract/concurrency error.
  }
};

const scopeRange = (scope: HistoryScope): IDBKeyRange => IDBKeyRange.bound(
  [scope.progressBundleId, scope.personaMaskId, scope.charId, 0],
  [scope.progressBundleId, scope.personaMaskId, scope.charId, Number.MAX_SAFE_INTEGER],
);

const samePassIdentity = (
  left: HistoryCompanionMaterialPass,
  right: HistoryCompanionMaterialPass,
): boolean => (
  createHistoryScopeKey(left.scope) === createHistoryScopeKey(right.scope)
  && left.sourceRevisionFingerprint === right.sourceRevisionFingerprint
  && left.analysisRunId === right.analysisRunId
  && left.extractorVersion === right.extractorVersion
  && left.analysisSnapshotId === right.analysisSnapshotId
  && left.createdAt === right.createdAt
);

export const openHistoryCompanionMaterialDatabase = async (
  factory?: IDBFactory,
): Promise<IDBDatabase> => {
  const request = getIndexedDbFactory(factory).open(
    HISTORY_COMPANION_MATERIAL_DB_NAME,
    HISTORY_COMPANION_MATERIAL_DB_VERSION,
  );
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore(HISTORY_COMPANION_MATERIAL_PASS_STORE, {
      keyPath: 'id',
    });
    store.createIndex(
      HISTORY_COMPANION_MATERIAL_SCOPE_CREATED_INDEX,
      [
        'scope.progressBundleId',
        'scope.personaMaskId',
        'scope.charId',
        'createdAt',
      ],
      { unique: false },
    );
    store.createIndex('analysis_run_id', 'analysisRunId', { unique: true });
  };
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('history companion material database open failed'));
    request.onblocked = () => reject(new Error('opening history companion material database was blocked'));
  });
  database.onversionchange = () => database.close();
  return database;
};

export const getHistoryCompanionMaterialPass = async (input: {
  passId: string;
  factory?: IDBFactory;
}): Promise<HistoryCompanionMaterialPass | null> => {
  const database = await openHistoryCompanionMaterialDatabase(input.factory);
  try {
    const transaction = database.transaction(HISTORY_COMPANION_MATERIAL_PASS_STORE, 'readonly');
    const stored = await requestAsPromise(
      transaction.objectStore(HISTORY_COMPANION_MATERIAL_PASS_STORE).get(input.passId),
    );
    if (stored === undefined) return null;
    const pass = stored as HistoryCompanionMaterialPass;
    assertValidHistoryCompanionMaterialPass(pass);
    return pass;
  } finally {
    database.close();
  }
};

/**
 * Preserve every interpretation pass as evidence. Re-running the same source
 * may create another pass, while edits to one pass must advance its revision
 * and keep its identity fields stable.
 */
export const saveHistoryCompanionMaterialPass = async (input: {
  pass: HistoryCompanionMaterialPass;
  expectedRevision?: number;
  factory?: IDBFactory;
}): Promise<HistoryCompanionMaterialPass> => {
  assertValidHistoryCompanionMaterialPass(input.pass);
  const database = await openHistoryCompanionMaterialDatabase(input.factory);
  const transaction = database.transaction(HISTORY_COMPANION_MATERIAL_PASS_STORE, 'readwrite', {
    durability: 'strict',
  });
  const settled = transactionAsPromise(transaction);
  try {
    const store = transaction.objectStore(HISTORY_COMPANION_MATERIAL_PASS_STORE);
    const raw = await requestAsPromise(store.get(input.pass.id));
    if (raw === undefined) {
      if (input.expectedRevision !== undefined) {
        throw new Error('history companion material pass no longer exists');
      }
      await requestAsPromise(store.add(input.pass));
      await settled;
      return input.pass;
    }

    const existing = raw as HistoryCompanionMaterialPass;
    assertValidHistoryCompanionMaterialPass(existing);
    if (JSON.stringify(existing) === JSON.stringify(input.pass)) {
      if (input.expectedRevision !== undefined && input.expectedRevision !== existing.revision) {
        throw new Error('history companion material pass changed before save');
      }
      await settled;
      return existing;
    }
    if (input.expectedRevision !== existing.revision) {
      throw new Error('history companion material pass changed before save');
    }
    if (!samePassIdentity(existing, input.pass)) {
      throw new Error('history companion material pass identity fields cannot change');
    }
    if (input.pass.revision !== existing.revision + 1) {
      throw new Error('history companion material pass revision must advance by one');
    }
    await requestAsPromise(store.put(input.pass));
    await settled;
    return input.pass;
  } catch (error) {
    await settleAbort(transaction, settled);
    throw error;
  } finally {
    database.close();
  }
};

export const listHistoryCompanionMaterialPasses = async (input: {
  scope: HistoryScope;
  factory?: IDBFactory;
}): Promise<HistoryCompanionMaterialPass[]> => {
  const scopeErrors = validateHistoryScope(input.scope);
  if (scopeErrors.length > 0) throw new Error(scopeErrors.join('; '));
  const database = await openHistoryCompanionMaterialDatabase(input.factory);
  try {
    const transaction = database.transaction(HISTORY_COMPANION_MATERIAL_PASS_STORE, 'readonly');
    const index = transaction
      .objectStore(HISTORY_COMPANION_MATERIAL_PASS_STORE)
      .index(HISTORY_COMPANION_MATERIAL_SCOPE_CREATED_INDEX);
    const passes = await requestAsPromise(index.getAll(scopeRange(input.scope)));
    return (passes as HistoryCompanionMaterialPass[])
      .map(pass => {
        assertValidHistoryCompanionMaterialPass(pass);
        return pass;
      })
      .sort((left, right) => right.createdAt - left.createdAt);
  } finally {
    database.close();
  }
};
