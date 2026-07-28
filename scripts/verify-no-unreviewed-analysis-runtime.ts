import assert from 'node:assert/strict';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';

const permittedCharacterIds = new Set([
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
]);

assert.equal(BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.length, 56, 'runtime export must include reviewed semantic assets and their fact-free surface projections');
for (const record of BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL) {
  assert.ok(permittedCharacterIds.has(record.charId), `unreviewed character asset entered runtime: ${record.id}`);
  assert.equal(record.id.includes('analysis'), false, `analysis material entered runtime: ${record.id}`);
  record.sourceRefs.forEach(ref => {
    assert.ok(
      ref.sourcePackId === 'lysk-reviewed-sms-calibration-v1'
      || ref.sourcePackId === 'lysk-all-leads-four-lane-v1',
      `unknown reviewed provenance entered runtime: ${record.id}`,
    );
  });
}

console.log(JSON.stringify({
  status: 'green',
  runtimeRecords: BUILT_IN_DEEPSPACE_REVIEWED_MATERIAL.length,
  characters: [...permittedCharacterIds].length,
}));
