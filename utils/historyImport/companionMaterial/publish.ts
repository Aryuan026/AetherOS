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
  createHistoryScopeKey,
} from '../../../domain/historyImport/contract.ts';
import {
  loadCompanionMaterialLibrary,
  saveCompanionMaterialLibrary,
} from '../../companionMaterial/store.ts';
import {
  getHistoryCompanionMaterialPass,
  saveHistoryCompanionMaterialPass,
} from './indexedDbPasses.ts';
import {
  assertCurrentHistoryCompanionMaterialActivation,
} from './sourceAuthority.ts';

const belongsToPass = (
  record: CompanionMaterialRecord,
  passId: string,
): boolean => record.sourceRefs.some(sourceRef => (
  sourceRef.storeFamily === 'history_companion_material'
  && sourceRef.sourcePackId === passId
));

const sameScope = (
  left: HistoryCompanionMaterialPass['scope'],
  right: HistoryCompanionMaterialPass['scope'],
): boolean => createHistoryScopeKey(left) === createHistoryScopeKey(right);

/**
 * Publish is idempotent per pass id and preserves unrelated character/private
 * packs plus other historical analyses. A different pass over the same source
 * may coexist, which keeps alternate interpretations and plot-line reuse
 * possible. Only pass ids explicitly named in supersedePassIds are retired.
 *
 * The caller supplies only an opaque canonical activation receipt id. Publish
 * reloads that append-only receipt, recomputes the pass digest, and reads the
 * current Daily Archive head again. Direct fingerprints and receipt objects
 * are deliberately not accepted as source authority.
 */
export const publishHistoryCompanionMaterialPass = async (input: {
  pass: HistoryCompanionMaterialPass;
  activationReceiptId: string;
  supersedePassIds?: readonly string[];
  expectedPassRevision?: number;
  publishedAt?: number;
}): Promise<HistoryCompanionMaterialPublication> => {
  assertValidHistoryCompanionMaterialPass(input.pass);
  if (input.pass.status !== 'active') {
    throw new Error('only an active history companion material pass can be published');
  }
  if (!input.activationReceiptId?.trim()) {
    throw new Error('canonical activationReceiptId is required to publish history companion material');
  }
  await assertCurrentHistoryCompanionMaterialActivation({
    pass: input.pass,
    activationReceiptId: input.activationReceiptId,
  });

  const projected = projectHistoryCompanionMaterialPass(input.pass);
  if (projected.length < 1) {
    throw new Error('active history companion material pass requires at least one active candidate');
  }

  const supersedePassIds = [...new Set(input.supersedePassIds || [])];
  if (supersedePassIds.some(passId => !passId.trim())) {
    throw new Error('supersedePassIds must contain non-empty pass ids');
  }
  if (supersedePassIds.includes(input.pass.id)) {
    throw new Error('history companion material pass cannot supersede itself');
  }
  const supersededPasses = await Promise.all(supersedePassIds.map(async passId => {
    const pass = await getHistoryCompanionMaterialPass({ passId });
    if (!pass) throw new Error(`history companion material supersession target ${passId} does not exist`);
    if (!sameScope(pass.scope, input.pass.scope)) {
      throw new Error(`history companion material supersession target ${passId} crosses scope`);
    }
    if (pass.status === 'archived') {
      throw new Error(`archived history companion material pass ${passId} cannot be superseded`);
    }
    return pass;
  }));

  // Evidence is durable before its prompt-facing projection becomes visible.
  // If the second write fails, retrying the same pass is idempotent.
  await saveHistoryCompanionMaterialPass({
    pass: input.pass,
    expectedRevision: input.expectedPassRevision,
  });

  const publishedAt = input.publishedAt ?? Date.now();
  for (const pass of supersededPasses) {
    if (pass.status === 'superseded') continue;
    await saveHistoryCompanionMaterialPass({
      pass: {
        ...pass,
        status: 'superseded',
        updatedAt: Math.max(publishedAt, pass.updatedAt),
        revision: pass.revision + 1,
      },
      expectedRevision: pass.revision,
    });
  }

  const ownerScope = {
    kind: 'relationship' as const,
    scope: { ...input.pass.scope },
  };
  const existing = await loadCompanionMaterialLibrary(ownerScope);
  const replacedPassIds = new Set([input.pass.id, ...supersedePassIds]);
  const preserved = (existing?.records || []).filter(record => (
    ![...replacedPassIds].some(passId => belongsToPass(record, passId))
  ));
  const preservedIds = new Set(preserved.map(record => record.id));
  projected.forEach(record => {
    if (preservedIds.has(record.id)) {
      throw new Error(`history companion material id collision for ${record.id}`);
    }
  });

  await saveCompanionMaterialLibrary({
    ownerScope,
    records: [...preserved, ...projected],
    revision: (existing?.revision || 0) + 1,
    updatedAt: publishedAt,
  });

  return {
    passId: input.pass.id,
    activationReceiptId: input.activationReceiptId,
    scope: { ...input.pass.scope },
    sourceRevisionFingerprint: input.pass.sourceRevisionFingerprint,
    materialIds: projected.map(record => record.id),
    activeCount: projected.length,
    disabledCount: input.pass.candidates.filter(candidate => candidate.status !== 'active').length,
    publishedAt,
  };
};
