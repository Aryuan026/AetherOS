import type { Worldbook } from '../../types.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import type {
  WorldbookProjectionDeliveryReceipt,
  WorldbookProjectionConsumerRef,
  WorldbookProjectionResult,
  WorldGrowthCandidate,
  WorldGrowthCandidatePlayerReview,
} from './types.ts';

export interface WorldbookPersistencePort {
  listEntries(): Promise<Worldbook[]>;
  createEntry(entry: Worldbook): Promise<void>;
  createEntries(entries: readonly Worldbook[]): Promise<void>;
  updateEntry(entry: Worldbook, expectedActiveRevisionId: string): Promise<void>;
  archiveEntry(entry: Worldbook, expectedActiveRevisionId: string): Promise<void>;
  restoreRevision(entry: Worldbook, expectedActiveRevisionId: string): Promise<void>;
  listGrowthCandidates(): Promise<WorldGrowthCandidate[]>;
  saveGrowthCandidate(candidate: WorldGrowthCandidate): Promise<void>;
  saveGrowthCandidatesAtomically(candidates: readonly WorldGrowthCandidate[]): Promise<void>;
  commitAcceptedCandidate(input: {
    entry: Worldbook;
    candidate: WorldGrowthCandidate;
    reviewedDraft?: WorldGrowthCandidatePlayerReview;
    expectedBaseRevisionId: string | null;
    expectedCandidateUpdatedAt: number;
  }): Promise<void>;
  listProjectionDeliveryReceipts(scope: HistoryScope): Promise<WorldbookProjectionDeliveryReceipt[]>;
  recordProjectionDeliveryReceipt(input: {
    projection: WorldbookProjectionResult;
    consumer: WorldbookProjectionConsumerRef;
    deliveredAt?: number;
  }): Promise<WorldbookProjectionDeliveryReceipt>;
}
