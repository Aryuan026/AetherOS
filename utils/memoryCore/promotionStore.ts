import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { sameEvidenceScope } from '../../domain/interactionEvidence/index.ts';
import {
  assertMemoryPromotionReceipt,
  assertPromotedMemoryRecord,
  type MemoryPromotionCommitResult,
  type MemoryPromotionReceipt,
  type MemoryPromotionStorePort,
  type PromotedMemoryRecord,
  type PromotedRelationshipMemory,
  type PromotedTimebookEntry,
} from '../../domain/memoryInterpretation/index.ts';
import { DB } from '../db.ts';

export const MEMORY_PROMOTION_ASSET_ID = 'memory_promotion_store_v1';

interface StoredMemoryPromotions {
  schemaVersion: 1;
  relationshipMemories: PromotedRelationshipMemory[];
  timebookEntries: PromotedTimebookEntry[];
  receipts: MemoryPromotionReceipt[];
}

const emptyStore = (): StoredMemoryPromotions => ({
  schemaVersion: 1,
  relationshipMemories: [],
  timebookEntries: [],
  receipts: [],
});

const parseStore = (raw: string | null): StoredMemoryPromotions => {
  if (!raw) return emptyStore();
  const parsed = JSON.parse(raw) as StoredMemoryPromotions;
  if (
    parsed?.schemaVersion !== 1
    || !Array.isArray(parsed.relationshipMemories)
    || !Array.isArray(parsed.timebookEntries)
    || !Array.isArray(parsed.receipts)
  ) throw new Error('Memory promotion store 格式无效。');
  parsed.relationshipMemories.forEach(assertPromotedMemoryRecord);
  parsed.timebookEntries.forEach(assertPromotedMemoryRecord);
  parsed.receipts.forEach(assertMemoryPromotionReceipt);
  const targets = [...parsed.relationshipMemories, ...parsed.timebookEntries];
  if (new Set(targets.map(record => record.id)).size !== targets.length) {
    throw new Error('Memory promotion target id 重复。');
  }
  if (new Set(parsed.receipts.map(receipt => receipt.commandId)).size !== parsed.receipts.length) {
    throw new Error('Memory promotion command receipt 重复。');
  }
  targets.forEach(target => {
    const receipt = parsed.receipts.find(row => row.id === target.promotionReceiptId);
    if (!receipt) throw new Error('Promoted memory target 缺少应用回执。');
    assertAppliedPair(receipt, target);
  });
  parsed.receipts.filter(receipt => receipt.status === 'applied').forEach(receipt => {
    const target = targets.find(record => record.id === receipt.targetRecordId);
    if (!target) throw new Error('Memory promotion applied receipt 缺少目标记录。');
    assertAppliedPair(receipt, target);
  });
  parsed.receipts.filter(receipt => receipt.status === 'duplicate').forEach(receipt => {
    const target = targets.find(record => record.id === receipt.duplicateOfTargetRecordId);
    const originalReceipt = parsed.receipts.find(row => row.id === receipt.duplicateOfReceiptId);
    if (!target || !originalReceipt) throw new Error('Memory promotion duplicate receipt 缺少原始目标或回执。');
    assertAppliedPair(originalReceipt, target);
    assertDuplicatePair(receipt, originalReceipt, target);
  });
  return parsed;
};

const listTargets = (store: StoredMemoryPromotions): PromotedMemoryRecord[] => [
  ...store.relationshipMemories,
  ...store.timebookEntries,
];

const targetForReceipt = (
  store: StoredMemoryPromotions,
  receipt: MemoryPromotionReceipt,
): PromotedMemoryRecord | undefined => (
  receipt.targetRecordId
    ? listTargets(store).find(record => record.id === receipt.targetRecordId)
    : undefined
);

function assertAppliedPair(
  receipt: MemoryPromotionReceipt,
  targetRecord: PromotedMemoryRecord,
): void {
  assertMemoryPromotionReceipt(receipt);
  assertPromotedMemoryRecord(targetRecord);
  if (
    receipt.status !== 'applied'
    || receipt.truthEffect !== targetRecord.target
    || receipt.targetRecordId !== targetRecord.id
    || targetRecord.promotionReceiptId !== receipt.id
    || receipt.passId !== targetRecord.source.passId
    || receipt.candidateId !== targetRecord.source.candidateId
    || receipt.expectedSourceRevisionFingerprint !== targetRecord.source.evidenceSpan.sourceRevisionFingerprint
    || receipt.trigger !== targetRecord.promotionTrigger
    || receipt.candidateDecision?.target !== targetRecord.target
    || receipt.candidateDecision?.knowledge !== targetRecord.knowledge
    || receipt.candidateDecision?.temporalClass !== targetRecord.temporalClass
    || receipt.candidateDecision?.interpretationAuthority !== targetRecord.interpretationAuthority
    || receipt.candidateDecision?.claimClass !== targetRecord.claimClass
    || receipt.candidateDecision?.sourceEvidenceIds.length !== targetRecord.source.sourceEvidenceIds.length
    || receipt.candidateDecision?.sourceEvidenceIds.some((id, index) => id !== targetRecord.source.sourceEvidenceIds[index])
    || JSON.stringify(receipt.sourceAssessment) !== JSON.stringify(targetRecord.sourceAssessment)
    || JSON.stringify(receipt.manualDecision) !== JSON.stringify(targetRecord.manualDecision)
    || JSON.stringify(receipt.experienceRef) !== JSON.stringify(targetRecord.experienceRef)
    || !sameEvidenceScope(receipt.scope, targetRecord.scope)
  ) throw new Error('Memory promotion target 与 receipt 归属不一致。');
}

function assertDuplicatePair(
  receipt: MemoryPromotionReceipt,
  originalReceipt: MemoryPromotionReceipt,
  targetRecord: PromotedMemoryRecord,
): void {
  assertMemoryPromotionReceipt(receipt);
  assertAppliedPair(originalReceipt, targetRecord);
  if (
    receipt.status !== 'duplicate'
    || receipt.truthEffect !== 'none'
    || receipt.duplicateOfTargetRecordId !== targetRecord.id
    || receipt.duplicateOfReceiptId !== originalReceipt.id
    || receipt.passId !== targetRecord.source.passId
    || receipt.candidateId !== targetRecord.source.candidateId
    || receipt.expectedSourceRevisionFingerprint !== targetRecord.source.evidenceSpan.sourceRevisionFingerprint
    || receipt.candidateDecision?.target !== targetRecord.target
    || receipt.candidateDecision?.knowledge !== targetRecord.knowledge
    || receipt.candidateDecision?.temporalClass !== targetRecord.temporalClass
    || receipt.candidateDecision?.interpretationAuthority !== targetRecord.interpretationAuthority
    || receipt.candidateDecision?.claimClass !== targetRecord.claimClass
    || receipt.candidateDecision?.sourceEvidenceIds.length !== targetRecord.source.sourceEvidenceIds.length
    || receipt.candidateDecision?.sourceEvidenceIds.some((id, index) => id !== targetRecord.source.sourceEvidenceIds[index])
    || JSON.stringify(receipt.sourceAssessment) !== JSON.stringify(targetRecord.sourceAssessment)
    || !sameEvidenceScope(receipt.scope, targetRecord.scope)
  ) throw new Error('Memory promotion duplicate receipt 与原始目标归属不一致。');
}

const commitResult = (
  outcome: MemoryPromotionCommitResult['outcome'],
  receipt: MemoryPromotionReceipt,
  targetRecord?: PromotedMemoryRecord,
): MemoryPromotionCommitResult => ({ outcome, receipt, targetRecord });

export const memoryPromotionStore: MemoryPromotionStorePort = {
  listRelationshipMemories: async (scope: HistoryScope): Promise<PromotedRelationshipMemory[]> => {
    const store = parseStore(await DB.getAsset(MEMORY_PROMOTION_ASSET_ID));
    return store.relationshipMemories.filter(record => sameEvidenceScope(record.scope, scope));
  },
  listTimebookEntries: async (scope: HistoryScope): Promise<PromotedTimebookEntry[]> => {
    const store = parseStore(await DB.getAsset(MEMORY_PROMOTION_ASSET_ID));
    return store.timebookEntries.filter(record => sameEvidenceScope(record.scope, scope));
  },
  listReceipts: async (scope: HistoryScope): Promise<MemoryPromotionReceipt[]> => {
    const store = parseStore(await DB.getAsset(MEMORY_PROMOTION_ASSET_ID));
    return store.receipts.filter(receipt => sameEvidenceScope(receipt.scope, scope));
  },
  commit: async ({ receipt, targetRecord }): Promise<MemoryPromotionCommitResult> => {
    assertMemoryPromotionReceipt(receipt);
    if (targetRecord) assertAppliedPair(receipt, targetRecord);
    if (!targetRecord && receipt.status === 'applied') {
      throw new Error('已应用的 Memory promotion receipt 缺少目标记录。');
    }
    return DB.updateAsset(MEMORY_PROMOTION_ASSET_ID, raw => {
      const store = parseStore(raw);
      const existingReceipt = store.receipts.find(row => row.commandId === receipt.commandId);
      if (existingReceipt) {
        return {
          data: JSON.stringify(store),
          result: commitResult(
            'existing_command',
            existingReceipt,
            targetForReceipt(store, existingReceipt),
          ),
        };
      }

      if (targetRecord) {
        const existingTarget = listTargets(store).find(row => (
          row.source.passId === targetRecord.source.passId
          && row.source.candidateId === targetRecord.source.candidateId
          && sameEvidenceScope(row.scope, targetRecord.scope)
        ));
        if (existingTarget) {
          const appliedReceipt = store.receipts.find(row => row.id === existingTarget.promotionReceiptId);
          if (!appliedReceipt) throw new Error('已存在的 promoted target 缺少原始回执。');
          const duplicateReceipt: MemoryPromotionReceipt = {
            ...receipt,
            status: 'duplicate',
            truthEffect: 'none',
            targetRecordId: undefined,
            duplicateOfTargetRecordId: existingTarget.id,
            duplicateOfReceiptId: appliedReceipt.id,
            reason: 'existing_target_no_truth_change',
          };
          assertMemoryPromotionReceipt(duplicateReceipt);
          assertDuplicatePair(duplicateReceipt, appliedReceipt, existingTarget);
          const next = {
            ...store,
            receipts: [...store.receipts, duplicateReceipt],
          };
          return {
            data: JSON.stringify(next),
            result: commitResult('existing_target', duplicateReceipt, existingTarget),
          };
        }
      }

      const next: StoredMemoryPromotions = {
        ...store,
        relationshipMemories: targetRecord?.target === 'relationship_memory'
          ? [...store.relationshipMemories, targetRecord]
          : store.relationshipMemories,
        timebookEntries: targetRecord?.target === 'timebook'
          ? [...store.timebookEntries, targetRecord]
          : store.timebookEntries,
        receipts: [...store.receipts, receipt],
      };
      return {
        data: JSON.stringify(next),
        result: commitResult('committed', receipt, targetRecord),
      };
    });
  },
};
