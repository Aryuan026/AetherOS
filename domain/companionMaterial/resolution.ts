import type {
  CompanionMaterialRecord,
  CompanionMaterialSourceRef,
} from './types.ts';

const normalizeText = (value: unknown): string => (
  String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
);

const sorted = (values: readonly string[] | undefined): string[] => (
  [...(values || [])].map(normalizeText).filter(Boolean).sort()
);

const normalizedGroundingPolicy = (
  policy: CompanionMaterialRecord['groundingPolicy'],
): unknown => policy
  ? {
      allOf: [...(policy.allOf || [])]
        .map(item => ({
          kind: item.kind,
          claimKey: item.claimKey,
          refId: item.refId || '',
          revision: item.revision ?? null,
          issuerId: item.issuerId || '',
          authorityDigest: item.authorityDigest || '',
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      anyOf: [...(policy.anyOf || [])]
        .map(item => ({
          kind: item.kind,
          claimKey: item.claimKey,
          refId: item.refId || '',
          revision: item.revision ?? null,
          issuerId: item.issuerId || '',
          authorityDigest: item.authorityDigest || '',
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    }
  : null;

/**
 * Runtime-equivalent records may come from several immutable history passes.
 * Coalescing happens only in this read projection: source passes remain
 * untouched and every source ref stays queryable.
 *
 * The key deliberately includes every runtime gate. Similar prose with a
 * different route, purpose, grounding rule, relationship floor, or retrieval
 * policy remains a separate interpretation instead of being flattened.
 */
const runtimeMeaningKey = (record: CompanionMaterialRecord): string => JSON.stringify({
  charId: record.charId,
  kind: record.kind,
  slot: record.slot,
  guidance: normalizeText(record.guidance),
  renderPolicy: record.renderPolicy,
  knowledge: record.knowledge,
  continuity: record.continuity,
  routeId: record.routeId || '',
  branchId: record.branchId || '',
  sceneId: record.sceneId || '',
  routeLane: record.routeLane || '',
  eligibleModes: sorted(record.eligibleModes),
  eligiblePurposes: sorted(record.eligiblePurposes),
  tags: sorted(record.tags),
  retrievalHints: record.retrievalHints
    ? {
        activationPolicy: record.retrievalHints.activationPolicy,
        positiveSignals: sorted(record.retrievalHints.positiveSignals),
        suppressSignals: sorted(record.retrievalHints.suppressSignals),
        variationGroup: normalizeText(record.retrievalHints.variationGroup),
        fallbackPriority: record.retrievalHints.fallbackPriority ?? null,
      }
    : null,
  groundingPolicy: normalizedGroundingPolicy(record.groundingPolicy),
  relationshipFloor: record.relationshipFloor || '',
  cooldownMs: record.cooldownMs ?? null,
  maxDeliveries: record.maxDeliveries ?? null,
  status: record.status,
});

const sourceRefKey = (sourceRef: CompanionMaterialSourceRef): string => JSON.stringify({
  storeFamily: sourceRef.storeFamily,
  recordId: sourceRef.recordId,
  revision: sourceRef.revision,
  sourceFingerprint: sourceRef.sourceFingerprint,
  sourcePackId: sourceRef.sourcePackId || '',
  sourceLocator: sourceRef.sourceLocator || '',
});

const canonicalRecord = (
  records: readonly CompanionMaterialRecord[],
): CompanionMaterialRecord => [...records].sort((left, right) => {
  // A reviewed character-owned direction remains canonical when a relationship
  // history pass independently reaches the exact same runtime meaning.
  const ownerRank = (record: CompanionMaterialRecord): number => (
    record.ownerScope.kind === 'character' ? 0 : 1
  );
  return ownerRank(left) - ownerRank(right) || left.id.localeCompare(right.id);
})[0];

export const resolveCompanionMaterialRecordsForRuntime = (
  records: readonly CompanionMaterialRecord[],
): CompanionMaterialRecord[] => {
  const groups = new Map<string, CompanionMaterialRecord[]>();
  records.forEach(record => {
    const key = runtimeMeaningKey(record);
    groups.set(key, [...(groups.get(key) || []), record]);
  });

  return [...groups.values()]
    .map(group => {
      const canonical = canonicalRecord(group);
      if (group.length === 1) return canonical;
      const sourceRefs = new Map<string, CompanionMaterialSourceRef>();
      group.forEach(record => {
        record.sourceRefs.forEach(sourceRef => {
          sourceRefs.set(sourceRefKey(sourceRef), sourceRef);
        });
      });
      return {
        ...canonical,
        sourceRefs: [...sourceRefs.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([, sourceRef]) => ({ ...sourceRef })),
        createdAt: Math.min(...group.map(record => record.createdAt)),
        updatedAt: Math.max(...group.map(record => record.updatedAt)),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
};
