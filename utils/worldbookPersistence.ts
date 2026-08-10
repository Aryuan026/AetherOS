import type { WorldbookPersistencePort } from '../domain/worldbook/ports.ts';
import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../domain/historyImport/contract.ts';
import {
  getActiveWorldbookRevision,
  normalizeWorldbookEntry,
  validateWorldGrowthCandidate,
} from '../domain/worldbook/contract.ts';
import {
  assertWorldbookProjectionDeliveryReceipt,
  createWorldbookProjectionDeliveryReceipt,
} from '../domain/worldbook/projection.ts';
import { DB } from './db.ts';

const persistRevision = async (
  entry: Parameters<WorldbookPersistencePort['updateEntry']>[0],
  expectedActiveRevisionId: string | null,
): Promise<void> => {
  await DB.saveWorldbookRevision(
    normalizeWorldbookEntry(entry),
    expectedActiveRevisionId,
  );
};

const normalizeInitialEntry = (
  entry: Parameters<WorldbookPersistencePort['createEntry']>[0],
) => {
  const normalized = normalizeWorldbookEntry(entry);
  const active = getActiveWorldbookRevision(normalized);
  if (active.revision !== 1 || normalized.revisionSnapshots?.length !== 1) {
    throw new Error('Worldbook creation requires exactly one initial revision');
  }
  return normalized;
};

const assertNextRevision = (
  entry: Parameters<WorldbookPersistencePort['updateEntry']>[0],
  expectedActiveRevisionId: string,
) => {
  const normalized = normalizeWorldbookEntry(entry);
  const previous = normalized.revisionSnapshots?.find(
    revision => revision.id === expectedActiveRevisionId,
  );
  const active = getActiveWorldbookRevision(normalized);
  if (!previous || active.revision !== previous.revision + 1) {
    throw new Error('Worldbook persistence requires one N+1 revision over the expected base');
  }
  return { normalized, active };
};

export const indexedDbWorldbookPersistence: WorldbookPersistencePort = {
  listEntries: () => DB.getAllWorldbooks(),

  createEntry: async entry => {
    const normalized = normalizeInitialEntry(entry);
    await persistRevision(normalized, null);
  },

  createEntries: async entries => {
    if (!entries.length) throw new Error('Worldbook batch creation requires at least one entry');
    const normalized = entries.map(normalizeInitialEntry);
    await DB.saveWorldbookEntriesAtomically(normalized);
  },

  updateEntry: async (entry, expectedActiveRevisionId) => {
    const { normalized } = assertNextRevision(entry, expectedActiveRevisionId);
    await persistRevision(normalized, expectedActiveRevisionId);
  },

  archiveEntry: async (entry, expectedActiveRevisionId) => {
    const { normalized, active } = assertNextRevision(entry, expectedActiveRevisionId);
    if (active.publicationStatus !== 'archived') {
      throw new Error('Worldbook archive port requires an archived active revision');
    }
    await persistRevision(normalized, expectedActiveRevisionId);
  },

  restoreRevision: async (entry, expectedActiveRevisionId) => {
    const { normalized, active } = assertNextRevision(entry, expectedActiveRevisionId);
    if (
      active.publicationStatus !== 'published'
      || !active.sourceRefs.some(source => source.kind === 'revision_restore')
    ) {
      throw new Error('Worldbook restore port requires a published revision_restore snapshot');
    }
    await persistRevision(normalized, expectedActiveRevisionId);
  },

  listGrowthCandidates: () => DB.getAllWorldGrowthCandidates(),

  saveGrowthCandidate: async candidate => {
    const errors = validateWorldGrowthCandidate(candidate);
    if (errors.length) throw new Error(`World growth candidate rejected: ${errors.join('; ')}`);
    await DB.saveWorldGrowthCandidate(candidate);
  },

  saveGrowthCandidatesAtomically: async candidates => {
    if (!candidates.length) throw new Error('World growth candidate batch must not be empty');
    const errors = candidates.flatMap((candidate, index) => (
      validateWorldGrowthCandidate(candidate).map(error => `candidates[${index}] ${error}`)
    ));
    if (errors.length) throw new Error(`World growth candidate batch rejected: ${errors.join('; ')}`);
    await DB.saveWorldGrowthCandidatesAtomically(candidates);
  },

  commitAcceptedCandidate: async input => {
    await DB.commitAcceptedWorldGrowthCandidate(input);
  },

  listProjectionDeliveryReceipts: async scope => {
    const errors = validateHistoryScope(scope);
    if (errors.length) throw new Error(`Worldbook receipt scope rejected: ${errors.join('; ')}`);
    return DB.getWorldbookProjectionDeliveryReceipts(createHistoryScopeKey(scope));
  },

  recordProjectionDeliveryReceipt: async input => {
    const receipt = createWorldbookProjectionDeliveryReceipt(input);
    assertWorldbookProjectionDeliveryReceipt(receipt);
    await DB.saveWorldbookProjectionDeliveryReceipt(receipt);
    return receipt;
  },
};
