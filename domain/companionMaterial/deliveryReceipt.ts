import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialSelection,
} from './types.ts';
import { assertValidCompanionMaterialDeliveryReceipt } from './contract.ts';

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const createCompanionMaterialDeliveryReceipt = (params: {
  selection: CompanionMaterialSelection;
  consumerRef: CompanionMaterialDeliveryReceipt['consumerRef'];
  delivered: readonly { materialId: string; promptCharCount: number; renderedHash?: string }[];
  dropped?: CompanionMaterialDeliveryReceipt['dropped'];
  status?: CompanionMaterialDeliveryReceipt['status'];
  occurredAt?: number;
}): CompanionMaterialDeliveryReceipt => {
  const { selection } = params;
  const selectedById = new Map(selection.items.map(item => [item.materialId, item]));
  const delivered = params.delivered.map(item => {
    const selected = selectedById.get(item.materialId);
    if (!selected) throw new Error(`Delivery receipt references unselected material ${item.materialId}`);
    return {
      materialId: item.materialId,
      slot: selected.slot,
      promptCharCount: Math.max(0, Math.floor(item.promptCharCount)),
      renderedHash: item.renderedHash || hashText(`${selection.selectionId}:${item.materialId}`),
    };
  });
  const occurredAt = params.occurredAt || Date.now();
  const status = params.status || (delivered.length ? 'delivered' : 'skipped');
  const selectedChars = delivered.reduce((sum, item) => sum + item.promptCharCount, 0);
  const receipt: CompanionMaterialDeliveryReceipt = {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    id: `material-delivery-${hashText(`${selection.selectionId}:${params.consumerRef.kind}:${params.consumerRef.id}:${occurredAt}`)}`,
    selectionId: selection.selectionId,
    consumerRef: { ...params.consumerRef },
    scope: { ...selection.scope },
    surface: selection.surface,
    mode: selection.mode,
    purpose: selection.purpose,
    sourceRevisionFingerprint: selection.sourceRevisionFingerprint,
    delivered,
    selectedMaterialIds: selection.selectedMaterialIds,
    dropped: params.dropped || [],
    budgetChars: selection.budgetChars,
    selectedChars,
    status,
    truthEffect: 'none',
    occurredAt,
  };
  assertValidCompanionMaterialDeliveryReceipt(receipt);
  return receipt;
};
