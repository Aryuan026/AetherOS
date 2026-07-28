import {
  selectCompanionMaterialFromRecords,
} from '../../domain/companionMaterial/selection.ts';
import type {
  CompanionMaterialDeliveryReceipt,
  CompanionMaterialSelection,
  CompanionMaterialSelectionRequest,
} from '../../domain/companionMaterial/types.ts';
import { loadCompanionMaterialRecords } from './store.ts';

export { selectCompanionMaterialFromRecords } from '../../domain/companionMaterial/selection.ts';

/** Runtime adapter only: private storage in, pure selection contract out. */
export const selectCompanionMaterial = async (
  request: CompanionMaterialSelectionRequest,
  receipts: readonly CompanionMaterialDeliveryReceipt[] = [],
): Promise<CompanionMaterialSelection> => {
  const records = await loadCompanionMaterialRecords(request.scope);
  return selectCompanionMaterialFromRecords({ request, records, receipts });
};
