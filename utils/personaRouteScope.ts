import type { CharacterProfile, UserProfile } from '../types';
import { getActivePersonaMask, normalizeUserPersonaProfile } from './userPersonaMasks';

export type PersonaSurfaceKind =
    | 'directory'
    | 'chat'
    | 'group_chat'
    | 'call'
    | 'date'
    | 'social'
    | 'novel'
    | 'guidebook'
    | 'special_moments'
    | 'timebook'
    | 'companion_plan'
    | 'study'
    | 'journal'
    | 'room'
    | 'launcher';

export interface PersonaRouteScope {
    activeMaskId?: string;
    activeMaskLabel?: string;
    activeProgressBundleId?: string;
    linkedCharacterIds: string[];
    linkedCharacters: CharacterProfile[];
    hasLinkedFocus: boolean;
    preferredActiveCharacter?: CharacterProfile;
}

export const resolvePersonaRouteScope = (
    userProfile: UserProfile,
    characters: CharacterProfile[],
    activeCharacterId?: string,
): PersonaRouteScope => {
    const normalized = normalizeUserPersonaProfile(userProfile);
    const activeMask = getActivePersonaMask(normalized);
    const linkedIds = [...new Set((activeMask?.linkedCharacterIds || []).filter(Boolean))];
    const linkedIdSet = new Set(linkedIds);
    const linkedCharacters = characters.filter(char => linkedIdSet.has(char.id));
    const activeCharacter = characters.find(char => char.id === activeCharacterId);
    const preferredActiveCharacter = activeCharacter && linkedIdSet.has(activeCharacter.id)
        ? activeCharacter
        : linkedCharacters[0];

    return {
        activeMaskId: activeMask?.id,
        activeMaskLabel: activeMask?.label,
        activeProgressBundleId: normalized.activeProgressBundleId,
        linkedCharacterIds: linkedIds,
        linkedCharacters,
        hasLinkedFocus: linkedCharacters.length > 0,
        preferredActiveCharacter,
    };
};

export const isCharacterInPersonaScope = (
    char: CharacterProfile,
    scope: PersonaRouteScope,
): boolean => (
    scope.linkedCharacterIds.includes(char.id)
);

export const filterCharactersForPersonaSurface = (
    characters: CharacterProfile[],
    scope: PersonaRouteScope,
    options: {
        surface: PersonaSurfaceKind;
        includeUnlinkedForDirectory?: boolean;
    },
): CharacterProfile[] => {
    if (options.surface === 'directory' && options.includeUnlinkedForDirectory !== false) {
        return characters;
    }

    // Life/generative surfaces fail closed. An unlinked character is still
    // available in management surfaces, but does not silently enter the
    // current mask's social world, calls, meetings, chats or story runs.
    if (!scope.hasLinkedFocus) return [];

    const allowed = new Set(scope.linkedCharacterIds);
    return characters.filter(char => allowed.has(char.id));
};

export const buildPersonaScopePromptNote = (
    scope: PersonaRouteScope,
    surfaceLabel: string,
): string => {
    if (!scope.hasLinkedFocus) {
        return `当前 user 面具尚未链接任何角色；${surfaceLabel}不得从系统角色库自动挑选参与者，也不得让未链接角色作为账号、熟人、攻略对象或当前生活成员出现。只有用户明确写进当前文本的临时路人或外部人物可以作为背景证据。`;
    }

    const names = scope.linkedCharacters.map(char => char.name).join('、');
    return `当前 user 面具「${scope.activeMaskLabel || '未命名面具'}」的主关系网只链接了：${names}。${surfaceLabel}默认只允许这些已链接角色发言、生成动态、回复或作为熟人关系网成员；未链接角色不得作为账号出现，也不得被写成当前 user 的默认攻略对象。未链接角色只能作为公共背景、被用户明确提及时的路人/外部人物，或在用户之后手动加入面具链接后再进入主关系网。`;
};
