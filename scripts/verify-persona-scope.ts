import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CharacterProfile, UserProfile } from '../types.ts';
import {
    buildPersonaScopePromptNote,
    filterCharactersForPersonaSurface,
    linkCharacterToActivePersonaMask,
    resolvePersonaRouteScope,
} from '../utils/personaRouteScope.ts';

const characters = [
    { id: 'linked', name: '已链接', avatar: '', description: '', systemPrompt: '', memories: [] },
    { id: 'unlinked', name: '未链接', avatar: '', description: '', systemPrompt: '', memories: [] },
] satisfies CharacterProfile[];
const profile = (linkedCharacterIds: string[]): UserProfile => ({
    name: 'User',
    avatar: '',
    bio: '',
    activePersonaMaskId: 'mask-a',
    activeProgressBundleId: 'progress-a',
    personaMasks: [{
        id: 'mask-a',
        label: '面具 A',
        name: 'User',
        avatar: '',
        bio: '',
        linkedCharacterIds,
        progressBundleId: 'progress-a',
        createdAt: 1,
        updatedAt: 1,
    }],
    progressBundles: [{
        id: 'progress-a',
        maskId: 'mask-a',
        label: '进度 A',
        surfacePolicy: {},
        createdAt: 1,
        updatedAt: 1,
    }],
});

const linkedScope = resolvePersonaRouteScope(profile(['linked']), characters, 'unlinked');
assert.equal(linkedScope.preferredActiveCharacter?.id, 'linked', 'an unlinked active character must not leak into a life surface');
assert.deepEqual(filterCharactersForPersonaSurface(characters, linkedScope, { surface: 'chat' }).map(item => item.id), ['linked']);
assert.deepEqual(filterCharactersForPersonaSurface(characters, linkedScope, { surface: 'directory' }).map(item => item.id), ['linked', 'unlinked']);

const linkedExplicitly = linkCharacterToActivePersonaMask(profile(['linked']), 'unlinked', 123);
assert.equal(linkedExplicitly.status, 'linked');
assert.deepEqual(
    linkedExplicitly.profile.personaMasks?.[0]?.linkedCharacterIds,
    ['linked', 'unlinked'],
    'an explicit directory action must link the exact target to the active mask',
);
assert.equal(linkedExplicitly.profile.personaMasks?.[0]?.updatedAt, 123);
assert.equal(linkCharacterToActivePersonaMask(linkedExplicitly.profile, 'unlinked').status, 'already_linked');

const emptyScope = resolvePersonaRouteScope(profile([]), characters, 'unlinked');
for (const surface of ['chat', 'group_chat', 'call', 'date', 'social', 'novel', 'guidebook', 'special_moments', 'timebook', 'companion_plan', 'study', 'journal', 'room', 'launcher'] as const) {
    assert.deepEqual(filterCharactersForPersonaSurface(characters, emptyScope, { surface }), [], `${surface} must fail closed without links`);
}
assert.match(buildPersonaScopePromptNote(emptyScope, '测试页'), /不得从系统角色库自动挑选参与者/);

const sourceContracts: Array<[string, RegExp[]]> = [
    ['../apps/Chat.tsx', [/chatScopedCharacters/, /当前面具还没有生活圈联系人/]],
    ['../apps/CallApp.tsx', [/callScopedCharacters/, /当前面具还没有链接角色/]],
    ['../apps/DateApp.tsx', [/dateScopedCharacters/, /当前面具还没有链接角色/]],
    ['../apps/GroupChat.tsx', [/groupScopedCharacters/, /当前面具还没有链接角色/]],
    ['../apps/NovelApp.tsx', [/novelScopedCharacters/]],
    ['../apps/ScheduleApp.tsx', [/timebookCharacters/]],
    ['../apps/CompanionPlanApp.tsx', [/companionCharacters/]],
    ['../apps/StudyApp.tsx', [/studyCharacters/]],
    ['../apps/JournalApp.tsx', [/journalCharacters/]],
    ['../apps/RoomApp.tsx', [/roomCharacters/]],
    ['../apps/Launcher.tsx', [/launcherCharacters/]],
];
sourceContracts.forEach(([path, patterns]) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    patterns.forEach(pattern => assert.match(source, pattern));
    assert.doesNotMatch(source, /showAll(?:Date|Call|Group)Characters|setShowAllGroupCandidates/);
    assert.doesNotMatch(source, /\|\|\s*characters\[0\]/);
});

const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(
    chatSource,
    /chatScopedCharacters\.find\([^;]+\)\s*\|\|\s*chatScopedCharacters\[0\]/s,
    'chat must never replace an unavailable requested character with another linked character',
);
assert.match(chatSource, /characters=\{chatScopedCharacters\}\s+activeCharacterId=/);
assert.match(chatSource, /allCharacters=\{chatScopedCharacters\}/);

const characterSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
assert.match(characterSource, /handleOpenChatForCharacter/);
assert.match(characterSource, /linkCharacterToActivePersonaMask/);
assert.doesNotMatch(
    characterSource,
    /setActiveCharacterId\(formData\.id\);\s*openApp\(AppID\.Chat\)/,
    'the directory chat entry must link the exact target before opening Chat',
);

const chatHeaderSource = readFileSync(new URL('../components/chat/ChatHeaderShell.tsx', import.meta.url), 'utf8');
assert.match(chatHeaderSource, /w-full truncate px-1 font-bold leading-\[1\.25\]/);

const phoneShellSource = readFileSync(new URL('../components/PhoneShell.tsx', import.meta.url), 'utf8');
assert.match(
    phoneShellSource,
    /relative w-full h-full overflow-clip/,
    'the phone shell itself must not become a scroll container when a character switch item is brought into view',
);

console.log('persona life-surface fail-closed contract: OK');
