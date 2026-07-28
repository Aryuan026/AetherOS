import type { CompanionMaterialRecord } from '../../../domain/companionMaterial/types.ts';
import {
  assertValidHistoryCompanionMaterialPass,
} from '../../../domain/historyImport/companionMaterial/contract.ts';
import {
  projectHistoryCompanionMaterialPass,
} from '../../../domain/historyImport/companionMaterial/projection.ts';
import type {
  HistoryCompanionMaterialPass,
  HistoryCompanionMaterialPublication,
} from '../../../domain/historyImport/companionMaterial/types.ts';
import {
  loadCompanionMaterialLibrary,
  saveCompanionMaterialLibrary,
} from '../../companionMaterial/store.ts';
import {
  saveHistoryCompanionMaterialPass,
} from './indexedDbPasses.ts';

const belongsToPass = (
  record: CompanionMaterialRecord,
  passId: string,
): boolean => record.sourceRefs.some(sourceRef => (
  sourceRef.storeFamily === 'history_companion_material'
  && sourceRef.sourcePackId === passId
));

/**
 * Publish is idempotent per pass id and preserves unrelated character/private
 * packs plus other historical analyses. A different pass over the same source
 * may coexist, which keeps alternate interpretations and plot-line reuse
 * possible until an explicit correction disables one.
 */
export const publishHistoryCompanionMaterialPass = async (input: {
  pass: HistoryCompanionMaterialPass;
  expectedPassRevision?: number;
  publishedAt?: number;
}): Promise<HistoryCompanionMaterialPublication> => {
  assertValidHistoryCompanionMaterialPass(input.pass);
  if (input.pass.status !== 'active') {
    throw new Error('only an active history companion material pass can be published');
  }

  // Evidence is durable before its prompt-facing projection becomes visible.
  // If the second write fails, retrying the same pass is idempotent.
  await saveHistoryCompanionMaterialPass({
    pass: input.pass,
    expectedRevision: input.expectedPassRevision,
  });

  const ownerScope = {
    kind: 'relationship' as const,
    scope: { ...input.pass.scope },
  };
  const projected = projectHistoryCompanionMaterialPass(input.pass);
  const existing = await loadCompanionMaterialLibrary(ownerScope);
  const preserved = (existing?.records || []).filter(record => !belongsToPass(record, input.pass.id));
  const preservedIds = new Set(preserved.map(record => record.id));
  projected.forEach(record => {
    if (preservedIds.has(record.id)) {
      throw new Error(`history companion material id collision for ${record.id}`);
    }
  });

  const publishedAt = input.publishedAt || Date.now();
  await saveCompanionMaterialLibrary({
    ownerScope,
    records: [...preserved, ...projected],
    revision: (existing?.revision || 0) + 1,
    updatedAt: publishedAt,
  });

  return {
    passId: input.pass.id,
    scope: { ...input.pass.scope },
    sourceRevisionFingerprint: input.pass.sourceRevisionFingerprint,
    materialIds: projected.map(record => record.id),
    activeCount: projected.length,
    disabledCount: input.pass.candidates.filter(candidate => candidate.status !== 'active').length,
    publishedAt,
  };
};
