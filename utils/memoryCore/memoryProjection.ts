import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { sameEvidenceScope } from '../../domain/interactionEvidence/index.ts';
import type { MemoryDMEvidenceReadPort, MemoryPromotionStorePort, PromotedMemoryRecord } from '../../domain/memoryInterpretation/index.ts';
import {
  MEMORY_PROJECTION_SCHEMA_VERSION,
  assertMemoryProjectionCommand,
  createMemoryProjectionCommandId,
  createMemoryProjectionReceiptId,
  type MemoryProjectionCommand,
  type MemoryProjectionReceipt,
  type MemoryProjectionResult,
  type MemoryProjectionStorePort,
  type MemoryProjectionView,
} from '../../domain/memoryProjection/index.ts';
import { dailyArchiveEvidenceReadPort } from './evidencePort.ts';
import { listFreshPromotedMemoryRecords } from './memoryPromotion.ts';
import { memoryPromotionStore } from './promotionStore.ts';
import { memoryProjectionStore } from './projectionStore.ts';

const projectRecord = (
  record: PromotedMemoryRecord,
  receipts: MemoryProjectionReceipt[],
): MemoryProjectionView => {
  const applied = receipts
    .filter(receipt => (
      receipt.status === 'applied'
      && receipt.targetRecordId === record.id
      && receipt.expectedSourceRevisionFingerprint === record.source.evidenceSpan.sourceRevisionFingerprint
      && sameEvidenceScope(receipt.scope, record.scope)
    ))
    .sort((left, right) => (left.revision || 0) - (right.revision || 0));
  const display = {
    title: record.title,
    summary: record.summary,
    happenedAt: record.happenedAt,
    mood: record.mood,
  };
  let hidden = false;
  for (const receipt of applied) {
    if (receipt.action === 'edit' && receipt.patch) {
      if (receipt.patch.title !== undefined) display.title = receipt.patch.title.trim();
      if (receipt.patch.summary !== undefined) display.summary = receipt.patch.summary.trim();
      if (receipt.patch.happenedAt !== undefined) display.happenedAt = receipt.patch.happenedAt;
      if (receipt.patch.mood !== undefined) display.mood = receipt.patch.mood?.trim() || undefined;
    } else if (receipt.action === 'hide') {
      hidden = true;
    } else if (receipt.action === 'restore') {
      hidden = false;
    }
  }
  const last = applied[applied.length - 1];
  return {
    record,
    display,
    hidden,
    revision: last?.revision || 0,
    lastReceiptId: last?.id,
  };
};

export const listMemoryProjectionViews = async (input: {
  scope: HistoryScope;
  target?: PromotedMemoryRecord['target'];
  promotionStore?: MemoryPromotionStorePort;
  evidencePort?: MemoryDMEvidenceReadPort;
  projectionStore?: MemoryProjectionStorePort;
}): Promise<{ views: MemoryProjectionView[]; staleRecordIds: string[]; warnings: string[] }> => {
  const promotions = await listFreshPromotedMemoryRecords({
    scope: input.scope,
    promotionStore: input.promotionStore,
    evidencePort: input.evidencePort,
  });
  const corrections = await (input.projectionStore ?? memoryProjectionStore).listReceipts(input.scope);
  const records = input.target
    ? promotions.records.filter(record => record.target === input.target)
    : promotions.records;
  return {
    views: records.map(record => projectRecord(record, corrections)),
    staleRecordIds: promotions.staleRecordIds,
    warnings: promotions.warnings,
  };
};

export const createMemoryProjectionService = (dependencies: {
  promotionStore?: MemoryPromotionStorePort;
  evidencePort?: MemoryDMEvidenceReadPort;
  projectionStore?: MemoryProjectionStorePort;
  now?: () => number;
} = {}) => {
  const promotions = dependencies.promotionStore ?? memoryPromotionStore;
  const evidence = dependencies.evidencePort ?? dailyArchiveEvidenceReadPort;
  const corrections = dependencies.projectionStore ?? memoryProjectionStore;
  const now = dependencies.now ?? Date.now;

  const commitRejected = async (command: MemoryProjectionCommand, reason: string): Promise<MemoryProjectionResult> => {
    const receipt: MemoryProjectionReceipt = {
      schemaVersion: MEMORY_PROJECTION_SCHEMA_VERSION,
      id: createMemoryProjectionReceiptId(command.id),
      commandId: command.id,
      scope: { ...command.scope },
      targetRecordId: command.targetRecordId,
      expectedSourceRevisionFingerprint: command.expectedSourceRevisionFingerprint,
      action: command.action,
      patch: command.patch ? { ...command.patch } : undefined,
      status: 'rejected',
      truthEffect: 'none',
      reason,
      createdAt: now(),
    };
    const committed = await corrections.commit(receipt);
    return {
      outcome: committed.outcome === 'existing_command' ? 'duplicate' : 'rejected',
      receipt: committed.receipt,
    };
  };

  return {
    revise: async (command: MemoryProjectionCommand): Promise<MemoryProjectionResult> => {
      assertMemoryProjectionCommand(command);
      const [relationship, timebook, existingReceipts] = await Promise.all([
        promotions.listRelationshipMemories(command.scope),
        promotions.listTimebookEntries(command.scope),
        corrections.listReceipts(command.scope),
      ]);
      const record = [...relationship, ...timebook].find(item => item.id === command.targetRecordId);
      if (!record || !sameEvidenceScope(record.scope, command.scope)) {
        return commitRejected(command, 'target_not_found_in_exact_scope');
      }
      if (record.source.evidenceSpan.sourceRevisionFingerprint !== command.expectedSourceRevisionFingerprint) {
        return commitRejected(command, 'source_revision_mismatch');
      }
      if (command.patch?.happenedAt !== undefined && record.target !== 'timebook') {
        return commitRejected(command, 'relationship_memory_cannot_change_happened_at');
      }
      const fresh = await listFreshPromotedMemoryRecords({
        scope: command.scope,
        promotionStore: promotions,
        evidencePort: evidence,
      });
      if (!fresh.records.some(item => item.id === record.id)) {
        return commitRejected(command, 'source_is_stale');
      }
      const currentView = projectRecord(record, existingReceipts);
      if (command.action === 'hide' && currentView.hidden) return commitRejected(command, 'already_hidden');
      if (command.action === 'restore' && !currentView.hidden) return commitRejected(command, 'not_hidden');
      const nextRevision = existingReceipts
        .filter(receipt => receipt.targetRecordId === record.id && receipt.status === 'applied')
        .reduce((highest, receipt) => Math.max(highest, receipt.revision || 0), 0) + 1;
      const receipt: MemoryProjectionReceipt = {
        schemaVersion: MEMORY_PROJECTION_SCHEMA_VERSION,
        id: createMemoryProjectionReceiptId(command.id),
        commandId: command.id,
        scope: { ...command.scope },
        targetRecordId: command.targetRecordId,
        expectedSourceRevisionFingerprint: command.expectedSourceRevisionFingerprint,
        action: command.action,
        patch: command.patch ? { ...command.patch } : undefined,
        status: 'applied',
        truthEffect: 'none',
        revision: nextRevision,
        createdAt: now(),
      };
      const committed = await corrections.commit(receipt);
      if (committed.outcome === 'existing_command') {
        return { outcome: 'duplicate', receipt: committed.receipt };
      }
      return {
        outcome: 'applied',
        receipt: committed.receipt,
        view: projectRecord(record, [...existingReceipts, committed.receipt]),
      };
    },
  };
};

export const memoryProjectionService = createMemoryProjectionService();

export const reviseMemoryProjectionView = async (input: {
  view: MemoryProjectionView;
  action: MemoryProjectionCommand['action'];
  patch?: MemoryProjectionCommand['patch'];
  requestedAt?: number;
}): Promise<MemoryProjectionResult> => {
  const requestedAt = input.requestedAt ?? Date.now();
  const base: Omit<MemoryProjectionCommand, 'id'> = {
    schemaVersion: MEMORY_PROJECTION_SCHEMA_VERSION,
    scope: { ...input.view.record.scope },
    targetRecordId: input.view.record.id,
    expectedSourceRevisionFingerprint: input.view.record.source.evidenceSpan.sourceRevisionFingerprint,
    action: input.action,
    patch: input.patch ? { ...input.patch } : undefined,
    requestedAt,
  };
  return memoryProjectionService.revise({ ...base, id: createMemoryProjectionCommandId(base) });
};

export const resolveMemoryProjectionSourceDate = async (input: {
  view: MemoryProjectionView;
  evidencePort?: MemoryDMEvidenceReadPort;
}): Promise<string | undefined> => {
  const rows = await (input.evidencePort ?? dailyArchiveEvidenceReadPort).listActiveEvidence({
    scope: input.view.record.scope,
  });
  const selected = new Set(input.view.record.source.sourceEvidenceIds);
  const dates = rows
    .filter(row => selected.has(row.evidence.evidenceId))
    .map(row => row.evidence.time.occurredAt || row.evidence.time.recordedAt)
    .filter(Boolean)
    .sort();
  const sourceTime = dates[0];
  if (!sourceTime) return undefined;
  const direct = sourceTime.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1];
  if (direct) return direct;
  const parsed = new Date(sourceTime);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};
