import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    buildHistoryIdentityBindingDraft,
    findHistoryCharacterNameMatches,
    HISTORY_IDENTITY_BINDING_VERSION,
} from '../domain/historyImport/identityBinding.ts';

const seed = 'fixture-binding-001';
const existingMask = {
    id: 'mask-alice',
    label: '现实中的我',
    progressBundleId: 'progress-alice',
};
const existingCharacter = {
    id: 'char-rice',
    label: '糯米',
};

const existingDraft = buildHistoryIdentityBindingDraft({
    draftSeed: seed,
    mask: existingMask,
    character: existingCharacter,
});
assert.equal(existingDraft.schemaVersion, HISTORY_IDENTITY_BINDING_VERSION);
assert.deepEqual(existingDraft.scope, {
    personaMaskId: existingMask.id,
    progressBundleId: existingMask.progressBundleId,
    charId: existingCharacter.id,
});
assert.equal(existingDraft.mask.kind, 'existing');
assert.equal(existingDraft.character.kind, 'existing');
assert.equal(existingDraft.previewReady, true);
assert.equal(existingDraft.persistence, 'memory_only');
assert.equal(existingDraft.productionWriteAllowed, false);

const emptyDraft = buildHistoryIdentityBindingDraft({ draftSeed: seed });
const repeatedEmptyDraft = buildHistoryIdentityBindingDraft({ draftSeed: seed });
assert.deepEqual(repeatedEmptyDraft, emptyDraft, 'same draft seed must preserve placeholder ids');
assert.equal(emptyDraft.mask.kind, 'placeholder');
assert.equal(emptyDraft.character.kind, 'placeholder');
assert.match(emptyDraft.scope.personaMaskId, /^history-placeholder-mask-/);
assert.match(emptyDraft.scope.progressBundleId, /^history-placeholder-progress-/);
assert.match(emptyDraft.scope.charId, /^history-placeholder-char-/);
assert.equal(emptyDraft.mask.label, '旧日面具');
assert.equal(emptyDraft.character.label, '旧日角色');

const namedPlaceholderDraft = buildHistoryIdentityBindingDraft({
    draftSeed: seed,
    placeholderMaskLabel: '我的旧日线',
    placeholderCharacterLabel: '糯米',
});
assert.equal(namedPlaceholderDraft.mask.label, '我的旧日线');
assert.equal(namedPlaceholderDraft.character.label, '糯米');
assert.deepEqual(
    findHistoryCharacterNameMatches('  糯米  ', [
        existingCharacter,
        { id: 'char-other', label: '别人' },
    ]),
    [existingCharacter],
    'placeholder names should offer an existing exact-name role without silently reusing it',
);
assert.deepEqual(
    findHistoryCharacterNameMatches('新角色', [existingCharacter]),
    [],
    'a genuinely new role should stay on the no-question fast path',
);

const otherEmptyDraft = buildHistoryIdentityBindingDraft({ draftSeed: 'fixture-binding-002' });
assert.notEqual(otherEmptyDraft.scope.personaMaskId, emptyDraft.scope.personaMaskId);
assert.notEqual(otherEmptyDraft.scope.progressBundleId, emptyDraft.scope.progressBundleId);
assert.notEqual(otherEmptyDraft.scope.charId, emptyDraft.scope.charId);

const emptyMaskDraft = buildHistoryIdentityBindingDraft({
    draftSeed: seed,
    character: existingCharacter,
});
assert.equal(emptyMaskDraft.mask.kind, 'placeholder');
assert.equal(emptyMaskDraft.character.kind, 'existing');
assert.equal(emptyMaskDraft.scope.charId, existingCharacter.id);

const emptyCharacterDraft = buildHistoryIdentityBindingDraft({
    draftSeed: seed,
    mask: existingMask,
});
assert.equal(emptyCharacterDraft.mask.kind, 'existing');
assert.equal(emptyCharacterDraft.character.kind, 'placeholder');
assert.equal(emptyCharacterDraft.scope.progressBundleId, existingMask.progressBundleId);

assert.throws(
    () => buildHistoryIdentityBindingDraft({ draftSeed: '***' }),
    /stable seed/,
);
assert.throws(
    () => buildHistoryIdentityBindingDraft({
        draftSeed: seed,
        mask: { ...existingMask, id: ' ' },
    }),
    /mask requires a stable id/,
);

const componentSource = readFileSync(
    new URL('../components/history-import/HistoryIdentityBinding.tsx', import.meta.url),
    'utf8',
);
for (const forbidden of [
    'updateUserProfile',
    'updateCharacter',
    'addCharacter',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'type="file"',
]) {
    assert.equal(
        componentSource.includes(forbidden),
        false,
        `identity shell must remain read-only: ${forbidden}`,
    );
}

console.log(
    `history identity binding OK: existing=${existingDraft.mask.kind}/${existingDraft.character.kind} placeholder=${emptyDraft.mask.kind}/${emptyDraft.character.kind} duplicate-name=offered write=${emptyDraft.productionWriteAllowed}`,
);
