import {
  assertValidCompanionMaterialRecord,
  companionMaterialScopeKey,
} from '../../domain/companionMaterial/contract.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialOwnerScope,
  type CompanionMaterialRecord,
} from '../../domain/companionMaterial/types.ts';
import {
  builtInDeepspaceRetrievalCalibrationForCharacter,
} from '../../domain/companionMaterial/builtInDeepspaceRetrievalCalibration.ts';
import {
  getHistoryCompanionMaterialPass,
} from '../historyImport/companionMaterial/indexedDbPasses.ts';
import {
  loadCurrentHistoryCompanionMaterialActivationReceiptForPass,
} from '../historyImport/companionMaterial/sourceAuthority.ts';
import { DB } from '../db';

const STORAGE_PREFIX = 'aetheros_companion_material_v1';

interface CompanionMaterialLibrary {
  schemaVersion: typeof COMPANION_MATERIAL_SCHEMA_VERSION;
  ownerScope: CompanionMaterialOwnerScope;
  charId: string;
  records: CompanionMaterialRecord[];
  revision: number;
  updatedAt: number;
}

const normalize = (value: unknown): string => String(value || '').trim();

const clone = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const ownerScopeKey = (ownerScope: CompanionMaterialOwnerScope): string => (
  ownerScope.kind === 'character'
    ? `character::${encodeURIComponent(ownerScope.charId)}`
    : `relationship::${companionMaterialScopeKey(ownerScope.scope)}`
);

export const companionMaterialStorageKey = (ownerScope: CompanionMaterialOwnerScope): string => (
  `${STORAGE_PREFIX}::${ownerScopeKey(ownerScope)}`
);

const ownerScopesMatch = (left: CompanionMaterialOwnerScope, right: CompanionMaterialOwnerScope): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'character' && right.kind === 'character') return left.charId === right.charId;
  if (left.kind === 'relationship' && right.kind === 'relationship') {
    return companionMaterialScopeKey(left.scope) === companionMaterialScopeKey(right.scope);
  }
  return false;
};

const normalizeLibrary = (
  ownerScope: CompanionMaterialOwnerScope,
  raw: unknown,
): CompanionMaterialLibrary | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<CompanionMaterialLibrary>;
  if (data.schemaVersion !== COMPANION_MATERIAL_SCHEMA_VERSION || !Array.isArray(data.records)) return null;
  if (!data.ownerScope || !ownerScopesMatch(ownerScope, data.ownerScope)) return null;
  const expectedCharId = ownerScope.kind === 'character' ? ownerScope.charId : ownerScope.scope.charId;
  if (normalize(data.charId) !== expectedCharId) return null;

  const records = data.records.filter((record): record is CompanionMaterialRecord => {
    try {
      assertValidCompanionMaterialRecord(record);
      // Candidate-promotion records require a future canonical publisher.
      // Reject them on read as well as write so raw assets, legacy backups, or
      // interrupted old builds cannot bypass the fail-closed boundary.
      if (record.promotionAuthority) return false;
      return ownerScopesMatch(record.ownerScope, ownerScope);
    } catch {
      return false;
    }
  });

  return {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    ownerScope: clone(ownerScope),
    charId: expectedCharId,
    records: clone(records),
    revision: Math.max(1, Number(data.revision) || 1),
    updatedAt: Number(data.updatedAt) || Date.now(),
  };
};

export const loadCompanionMaterialLibrary = async (
  ownerScope: CompanionMaterialOwnerScope,
): Promise<CompanionMaterialLibrary | null> => {
  try {
    const raw = await DB.getAssetRaw(companionMaterialStorageKey(ownerScope));
    return normalizeLibrary(ownerScope, raw);
  } catch {
    return null;
  }
};

export const loadCompanionMaterialRecords = async (scope: {
  progressBundleId: string;
  personaMaskId: string;
  charId: string;
}): Promise<CompanionMaterialRecord[]> => {
  const [characterLibrary, relationshipLibrary] = await Promise.all([
    loadCompanionMaterialLibrary({ kind: 'character', charId: scope.charId }),
    loadCompanionMaterialLibrary({ kind: 'relationship', scope }),
  ]);
  const records = new Map<string, CompanionMaterialRecord>();
  builtInDeepspaceRetrievalCalibrationForCharacter(scope.charId).forEach(record => {
    records.set(record.id, clone(record));
  });
  (characterLibrary?.records || []).forEach(record => {
    records.set(record.id, clone(record));
  });
  const relationshipRecords = relationshipLibrary?.records || [];
  const historyPassIds = new Set(
    relationshipRecords.flatMap(record => record.sourceRefs
      .filter(sourceRef => sourceRef.storeFamily === 'history_companion_material')
      .map(sourceRef => normalize(sourceRef.sourcePackId))
      .filter(Boolean)),
  );
  const currentHistoryPassIds = new Set<string>();
  await Promise.all([...historyPassIds].map(async passId => {
    try {
      const pass = await getHistoryCompanionMaterialPass({ passId });
      if (
        !pass
        || pass.status !== 'active'
        || companionMaterialScopeKey(pass.scope) !== companionMaterialScopeKey(scope)
      ) return;
      const receipt = await loadCurrentHistoryCompanionMaterialActivationReceiptForPass({ pass });
      if (receipt) currentHistoryPassIds.add(passId);
    } catch {
      // Historical material fails closed when its pass, receipt, or current
      // Daily Archive source head cannot be verified.
    }
  }));
  relationshipRecords.forEach(record => {
    const recordHistoryPassIds = record.sourceRefs
      .filter(sourceRef => sourceRef.storeFamily === 'history_companion_material')
      .map(sourceRef => normalize(sourceRef.sourcePackId));
    if (
      recordHistoryPassIds.length > 0
      && (
        recordHistoryPassIds.some(passId => !passId)
        || recordHistoryPassIds.some(passId => !currentHistoryPassIds.has(passId))
      )
    ) return;
    records.set(record.id, clone(record));
  });
  return [...records.values()];
};

export const saveCompanionMaterialLibrary = async (params: {
  ownerScope: CompanionMaterialOwnerScope;
  records: readonly CompanionMaterialRecord[];
  revision?: number;
  updatedAt?: number;
}): Promise<void> => {
  const expectedCharId = params.ownerScope.kind === 'character'
    ? params.ownerScope.charId
    : params.ownerScope.scope.charId;
  const ids = new Set<string>();
  const records = params.records.map(record => {
    assertValidCompanionMaterialRecord(record);
    if (record.promotionAuthority) {
      throw new Error(
        `Material ${record.id} requires the canonical reviewed-candidate promotion publisher`,
      );
    }
    if (!ownerScopesMatch(record.ownerScope, params.ownerScope)) {
      throw new Error(`Material ${record.id} does not belong to this library scope`);
    }
    if (record.charId !== expectedCharId) throw new Error(`Material ${record.id} has the wrong character`);
    if (ids.has(record.id)) throw new Error(`Duplicate material id ${record.id}`);
    ids.add(record.id);
    return clone(record);
  });

  const now = params.updatedAt || Date.now();
  const library: CompanionMaterialLibrary = {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    ownerScope: clone(params.ownerScope),
    charId: expectedCharId,
    records,
    revision: Math.max(1, params.revision || 1),
    updatedAt: now,
  };
  await DB.saveAssetRaw(companionMaterialStorageKey(params.ownerScope), library);
};
