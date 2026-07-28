import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createCompanionMaterialDeliveryReceipt } from '../domain/companionMaterial/deliveryReceipt.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialRecord,
  type CompanionMaterialSelection,
} from '../domain/companionMaterial/types.ts';
import {
  companionMaterialStorageKey,
  loadCompanionMaterialRecords,
  saveCompanionMaterialLibrary,
} from '../utils/companionMaterial/store.ts';
import { DB } from '../utils/db.ts';
import {
  loadCompanionMaterialDeliveryReceipts,
  recordCompanionMaterialDeliveryReceipt,
} from '../utils/companionMaterial/receipts.ts';

const T0 = 1_700_000_000_000;
const scope = {
  progressBundleId: 'bundle-storage',
  personaMaskId: 'mask-storage',
  charId: 'char-storage',
};

const characterRecord: CompanionMaterialRecord = {
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  id: 'storage-character-voice',
  ownerScope: { kind: 'character', charId: scope.charId },
  charId: scope.charId,
  kind: 'language_fingerprint',
  slot: 'stable_character_voice',
  guidance: '以简短、克制的方式接住对方的情绪，不照抄任何参考文本。',
  renderPolicy: 'style_only',
  knowledge: 'char_private',
  continuity: 'canon',
  eligibleModes: ['remote_chat'],
  eligiblePurposes: ['stable_context'],
  tags: ['care'],
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'private-record-a',
    revision: 1,
    sourceFingerprint: 'private-fingerprint-a',
  }],
  status: 'active',
  createdAt: T0,
  updatedAt: T0,
  revision: 1,
};

const relationshipRecord: CompanionMaterialRecord = {
  ...characterRecord,
  id: 'storage-relationship-opening',
  ownerScope: { kind: 'relationship', scope },
  kind: 'opening_recipe',
  slot: 'opening_recipes',
  guidance: '先从具体观察起笔，再给对方留下自然退出的空间。',
  renderPolicy: 'transform_required',
  knowledge: 'relationship_private',
  continuity: 'relationship',
  eligibleModes: ['proactive_letter'],
  eligiblePurposes: ['opening'],
  sourceRefs: [{
    storeFamily: 'private_review',
    recordId: 'private-record-b',
    revision: 1,
    sourceFingerprint: 'private-fingerprint-b',
  }],
};

await saveCompanionMaterialLibrary({
  ownerScope: characterRecord.ownerScope,
  records: [characterRecord],
  revision: 3,
  updatedAt: T0,
});
await saveCompanionMaterialLibrary({
  ownerScope: relationshipRecord.ownerScope,
  records: [relationshipRecord],
  revision: 4,
  updatedAt: T0 + 1,
});

const loaded = await loadCompanionMaterialRecords(scope);
assert.deepEqual(loaded.map(record => record.id).sort(), [characterRecord.id, relationshipRecord.id].sort());
assert.equal('rawText' in loaded[0], false, 'runtime library records must not expose raw text');

const rawPromotionRecord: CompanionMaterialRecord = {
  ...characterRecord,
  id: 'raw-promotion-record',
  promotionAuthority: {
    authorityKind: 'character_canon_review',
    receiptId: 'raw-authority-receipt',
    receiptRevision: 1,
    receiptDigest: 'a'.repeat(64),
    issuerId: 'raw-authority-issuer',
  },
  groundingPolicy: {
    allOf: [{
      kind: 'character_canon_evidence',
      claimKey: 'raw_candidate_claim',
      refId: 'raw-authority-receipt',
      revision: 1,
      issuerId: 'raw-authority-issuer',
      authorityDigest: 'a'.repeat(64),
    }],
  },
};
await assert.rejects(
  () => saveCompanionMaterialLibrary({
    ownerScope: characterRecord.ownerScope,
    records: [rawPromotionRecord],
  }),
  /canonical reviewed-candidate promotion publisher/u,
);
await DB.saveAssetRaw(companionMaterialStorageKey(characterRecord.ownerScope), {
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  ownerScope: characterRecord.ownerScope,
  charId: scope.charId,
  records: [rawPromotionRecord],
  revision: 99,
  updatedAt: T0 + 1,
});
const loadedAfterRawBypassAttempt = await loadCompanionMaterialRecords(scope);
assert.equal(
  loadedAfterRawBypassAttempt.some(record => record.id === rawPromotionRecord.id),
  false,
  'raw assets and old backups must not bypass candidate-promotion publication',
);

const selection: CompanionMaterialSelection = {
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  selectionId: 'storage-selection-a',
  requestId: 'storage-request-a',
  scope,
  surface: 'proactive_letter',
  mode: 'proactive_letter',
  purpose: 'opening',
  sourceRevisionFingerprint: 'storage-library-rev',
  budgetChars: 200,
  items: [{
    materialId: relationshipRecord.id,
    materialRevision: relationshipRecord.revision,
    slot: relationshipRecord.slot,
    kind: relationshipRecord.kind,
    guidance: relationshipRecord.guidance,
    renderPolicy: relationshipRecord.renderPolicy,
    knowledge: relationshipRecord.knowledge,
    continuity: relationshipRecord.continuity,
    sourceRefs: relationshipRecord.sourceRefs,
    selectionReasons: ['scope_match'],
    estimatedChars: relationshipRecord.guidance.length,
  }],
  selectedMaterialIds: [relationshipRecord.id],
  warnings: [],
  selectedAt: T0 + 2,
};
const receipt = createCompanionMaterialDeliveryReceipt({
  selection,
  consumerRef: { kind: 'prompt', id: 'prompt-storage-a', revision: '1' },
  delivered: [{ materialId: relationshipRecord.id, promptCharCount: relationshipRecord.guidance.length }],
  occurredAt: T0 + 3,
});
await recordCompanionMaterialDeliveryReceipt(receipt);
await recordCompanionMaterialDeliveryReceipt(receipt);
const receipts = await loadCompanionMaterialDeliveryReceipts(scope);
assert.equal(receipts.length, 1, 'delivery receipts must be idempotent');
assert.equal(receipts[0].truthEffect, 'none');
assert.equal(receipts[0].consumerRef.kind, 'prompt');

console.log('companion material storage: green');
