import type { HistoryScope } from '../../domain/historyImport/types.ts';
import {
  assertInteractionEvidence,
  sameEvidenceScope,
} from '../../domain/interactionEvidence/index.ts';
import type {
  MemoryDMEvidenceReadPort,
  MemoryDMEvidenceRecord,
} from '../../domain/memoryInterpretation/index.ts';
import { dailyArchiveMessageToInteractionEvidence } from '../../domain/dailyArchive/contract.ts';
import { listAllDailyArchiveDocuments } from '../dailyArchive/storage.ts';

const sortValue = (record: MemoryDMEvidenceRecord): number => {
  const occurredAt = record.evidence.time.occurredAt;
  if (occurredAt) {
    const parsed = Date.parse(occurredAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const recordedAt = Date.parse(record.evidence.time.recordedAt);
  return Number.isFinite(recordedAt) ? recordedAt : 0;
};

export const createDailyArchiveEvidenceReadPort = (): MemoryDMEvidenceReadPort => ({
  listActiveEvidence: async (input: {
    scope: HistoryScope;
    temporalClass?: 'historical' | 'live';
  }): Promise<MemoryDMEvidenceRecord[]> => {
    const documents = await listAllDailyArchiveDocuments();
    const records: MemoryDMEvidenceRecord[] = [];
    documents
      .filter(document => sameEvidenceScope(document.scope, input.scope))
      .forEach(document => document.messages.forEach(message => {
        if (message.status !== 'active' || !sameEvidenceScope(message.scope, input.scope)) return;
        // Imported/manual provenance is reconstructable. Legacy live rows without
        // origin cannot prove their surface or correlation and therefore fail closed.
        if (!message.origin && message.source === 'live_chat') return;
        const evidence = assertInteractionEvidence(dailyArchiveMessageToInteractionEvidence(message));
        if (input.temporalClass && evidence.temporalClass !== input.temporalClass) return;
        records.push({ evidence, content: message.content });
      }));
    return records.sort((left, right) => (
      sortValue(left) - sortValue(right)
      || left.evidence.correlation.sequence - right.evidence.correlation.sequence
      || left.evidence.evidenceId.localeCompare(right.evidence.evidenceId)
    ));
  },
});

export const dailyArchiveEvidenceReadPort = createDailyArchiveEvidenceReadPort();
