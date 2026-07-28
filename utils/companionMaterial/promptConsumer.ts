import {
  createCompanionMaterialDeliveryReceipt,
} from '../../domain/companionMaterial/deliveryReceipt.ts';
import {
  projectCompanionMaterialPrompt,
  type CompanionMaterialPromptProjection,
} from '../../domain/companionMaterial/promptProjection.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialDeliveryReceipt,
  type CompanionMaterialSelection,
  type CompanionMaterialSelectionRequest,
} from '../../domain/companionMaterial/types.ts';
import {
  loadCompanionMaterialDeliveryReceipts,
  recordCompanionMaterialDeliveryReceipt,
} from './receipts.ts';
import { selectCompanionMaterial } from './selector.ts';

export interface PreparedCompanionMaterialPrompt {
  selection: CompanionMaterialSelection;
  projection: CompanionMaterialPromptProjection;
  markdown: string;
}

const promptMarkdown = (projection: CompanionMaterialPromptProjection): string => {
  if (!projection.fragments.length) return '';
  return [
    '### 本轮角色素材',
    '让角色先依据当下证据和自身判断，选择真正相关的部分自然发展；每条只提供起念方向，表达形式、关系距离和行动仍保持开放。',
    ...projection.fragments.map(fragment => fragment.text),
  ].join('\n');
};

/**
 * Read/select/render only. Preparing a prompt does not claim that any model or
 * ScenePlan consumed it, so this function never writes a delivery receipt.
 */
export const prepareCompanionMaterialPrompt = async (
  request: Omit<CompanionMaterialSelectionRequest, 'schemaVersion'>,
): Promise<PreparedCompanionMaterialPrompt> => {
  const normalizedRequest: CompanionMaterialSelectionRequest = {
    ...request,
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  };
  const receipts = await loadCompanionMaterialDeliveryReceipts(request.scope);
  const selection = await selectCompanionMaterial(normalizedRequest, receipts);
  const projection = projectCompanionMaterialPrompt({
    source: selection,
    surface: request.surface,
    mode: request.mode,
    purpose: request.purpose,
    budgetChars: request.budgetChars,
  });
  return {
    selection,
    projection,
    markdown: promptMarkdown(projection),
  };
};

const dropReason = (
  reason: CompanionMaterialPromptProjection['dropped'][number]['reason'],
): CompanionMaterialDeliveryReceipt['dropped'][number]['reason'] => {
  if (reason === 'budget') return 'budget';
  if (reason === 'duplicate') return 'duplicate';
  if (reason === 'surface_ineligible') return 'compiler_policy';
  return 'compiler_policy';
};

/**
 * Call only after the named prompt/plan consumer actually accepted the
 * prepared fragments. Failed API attempts should not invoke this function.
 */
export const recordPreparedCompanionMaterialPromptDelivery = async (input: {
  prepared: PreparedCompanionMaterialPrompt;
  consumerRef: CompanionMaterialDeliveryReceipt['consumerRef'];
  occurredAt?: number;
}): Promise<CompanionMaterialDeliveryReceipt> => {
  const selectedIds = new Set(input.prepared.selection.selectedMaterialIds);
  const receipt = createCompanionMaterialDeliveryReceipt({
    selection: input.prepared.selection,
    consumerRef: input.consumerRef,
    delivered: input.prepared.projection.fragments.map(fragment => ({
      materialId: fragment.materialId,
      promptCharCount: fragment.charCount,
      renderedHash: fragment.renderedHash,
    })),
    dropped: input.prepared.projection.dropped
      .filter(item => selectedIds.has(item.materialId))
      .map(item => ({
        materialId: item.materialId,
        reason: dropReason(item.reason),
      })),
    status: input.prepared.projection.fragments.length ? 'delivered' : 'skipped',
    occurredAt: input.occurredAt,
  });
  await recordCompanionMaterialDeliveryReceipt(receipt);
  return receipt;
};
