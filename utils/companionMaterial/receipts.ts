import {
  createCompanionMaterialDeliveryReceipt,
} from '../../domain/companionMaterial/deliveryReceipt.ts';
import {
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialSelection,
} from '../../domain/companionMaterial/types.ts';
import {
  assertValidCompanionMaterialDeliveryReceipt,
  companionMaterialScopeKey,
} from '../../domain/companionMaterial/contract.ts';
import { DB } from '../db';

const RECEIPTS_STORAGE_PREFIX = 'aetheros_companion_material_delivery_receipts_v1';
const MAX_RECEIPTS = 160;

const receiptStorageKey = (scope: CompanionMaterialSelection['scope']): string => (
  `${RECEIPTS_STORAGE_PREFIX}::${companionMaterialScopeKey(scope)}`
);

const sameScope = (
  left: CompanionMaterialSelection['scope'],
  right: CompanionMaterialSelection['scope'],
): boolean => companionMaterialScopeKey(left) === companionMaterialScopeKey(right);

export { createCompanionMaterialDeliveryReceipt } from '../../domain/companionMaterial/deliveryReceipt.ts';

export const loadCompanionMaterialDeliveryReceipts = async (
  scope: CompanionMaterialSelection['scope'],
): Promise<CompanionMaterialDeliveryReceipt[]> => {
  try {
    const value = await DB.getAssetRaw(receiptStorageKey(scope));
    if (!Array.isArray(value)) return [];
    return value.filter((receipt): receipt is CompanionMaterialDeliveryReceipt => {
      try {
        assertValidCompanionMaterialDeliveryReceipt(receipt as CompanionMaterialDeliveryReceipt);
        return sameScope(receipt.scope, scope);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
};

export const recordCompanionMaterialDeliveryReceipt = async (
  receipt: CompanionMaterialDeliveryReceipt,
): Promise<void> => {
  assertValidCompanionMaterialDeliveryReceipt(receipt);
  const existing = await loadCompanionMaterialDeliveryReceipts(receipt.scope);
  if (existing.some(item => item.id === receipt.id)) return;
  await DB.saveAssetRaw(receiptStorageKey(receipt.scope), [receipt, ...existing].slice(0, MAX_RECEIPTS));
};
