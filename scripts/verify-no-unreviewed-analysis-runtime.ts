import assert from 'node:assert/strict';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';

const permittedCharacterIds = new Set([
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_LISHEN_ID,
]);

assert.equal(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.length, 20, 'runtime export must remain the public 20-record baseline');
for (const record of BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL) {
  assert.ok(permittedCharacterIds.has(record.charId), `unreviewed character asset entered runtime: ${record.id}`);
  assert.equal(record.id.includes('analysis'), false, `analysis material entered runtime: ${record.id}`);
  record.sourceRefs.forEach(ref => {
    assert.equal(ref.sourcePackId, 'lysk-reviewed-sms-calibration-v1', `non-baseline provenance entered runtime: ${record.id}`);
  });
}

console.log(JSON.stringify({
  status: 'green',
  runtimeRecords: BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.length,
  characters: [...permittedCharacterIds].length,
}));
