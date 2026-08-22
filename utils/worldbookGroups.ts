import type {
    CharacterProfile,
    Worldbook,
    WorldbookGroupAssignment,
    WorldbookGroupOwner,
} from '../types.ts';
import { builtInStoryEnhancementPackForEntry } from '../domain/deepspaceStoryEnhancement/index.ts';

export const DEFAULT_WORLDBOOK_CATEGORY = '未分类设定 (General)';
export const UNIVERSAL_WORLDBOOK_GROUP_NAME = '通用资料';
export const LEGACY_UNIVERSAL_WORLDBOOK_GROUP_NAME = '通用区';
export const UNIVERSAL_WORLDBOOK_GROUP_ID = 'worldbook-group:universal';
export const UNASSIGNED_WORLDBOOK_GROUP_NAME = '待归组';

const worldbookCollator = new Intl.Collator('zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base',
});

export const isBuiltInWorldbook = (book?: Pick<Worldbook, 'isBuiltIn' | 'lockEditing'> | null) => (
    Boolean(book?.isBuiltIn || book?.lockEditing)
);

export const normalizeWorldbookCategory = (value?: string) => (
    value?.trim() || DEFAULT_WORLDBOOK_CATEGORY
);

export const compareWorldbooks = (a: Pick<Worldbook, 'title' | 'id'>, b: Pick<Worldbook, 'title' | 'id'>) => (
    worldbookCollator.compare(a.title, b.title)
    || worldbookCollator.compare(a.id, b.id)
);

export const compareWorldbookCategories = (a: string, b: string) => {
    if (a === '深空世界书' && b !== '深空世界书') return -1;
    if (b === '深空世界书' && a !== '深空世界书') return 1;
    return worldbookCollator.compare(a, b);
};

export interface WorldbookCategoryGroup {
    id: string;
    category: string;
    books: Worldbook[];
    owner?: WorldbookGroupOwner;
    sortOrder?: number;
    pinned?: boolean;
    requiresAssignment?: boolean;
}

export interface WorldbookGroupIndex {
    builtInGroups: WorldbookCategoryGroup[];
    customGroups: WorldbookCategoryGroup[];
    builtInCount: number;
    customCount: number;
}

export type BuiltInCharacterWorldbookLaneKind =
    | 'canonical_chronology'
    | 'playable_if'
    | 'story_enhancement'
    | 'expansion_play';

export interface BuiltInCharacterWorldbookLane {
    id: string;
    kind: BuiltInCharacterWorldbookLaneKind;
    label: string;
    books: Worldbook[];
}

export interface BuiltInCharacterWorldbookShelf {
    id: string;
    characterId: string;
    characterName: string;
    booksCount: number;
    lanes: BuiltInCharacterWorldbookLane[];
}

export interface BuiltInWorldbookLibraryLayout {
    characterShelves: BuiltInCharacterWorldbookShelf[];
    remainingGroups: WorldbookCategoryGroup[];
}

const compareBuiltInLaneBooks = (
    kind: BuiltInCharacterWorldbookLaneKind,
    a: Worldbook,
    b: Worldbook,
) => {
    if (kind === 'canonical_chronology') {
        const orderA = builtInStoryEnhancementPackForEntry(a.id)?.chronologyOrder;
        const orderB = builtInStoryEnhancementPackForEntry(b.id)?.chronologyOrder;
        if (orderA !== undefined || orderB !== undefined) {
            return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER)
                || compareWorldbooks(a, b);
        }
    }
    return compareWorldbooks(a, b);
};

const resolveBuiltInCharacterLaneKind = (
    category: string,
): BuiltInCharacterWorldbookLaneKind | null => {
    if (category.endsWith('现世履历')) return 'canonical_chronology';
    if (category.endsWith('IF世界')) return 'playable_if';
    if (category.endsWith('剧情增强')) return 'story_enhancement';
    if (category.endsWith('拓展玩法')) return 'expansion_play';
    return null;
};

/**
 * Player-facing projection only. Runtime categories and knowledge policies stay untouched.
 * Character-owned optional material is shown as character → lane → entry, while public
 * foundations and cross-character packages remain in their ordinary built-in groups.
 */
export const buildBuiltInWorldbookLibraryLayout = (
    groups: readonly WorldbookCategoryGroup[],
    characters: readonly Pick<CharacterProfile, 'id' | 'name'>[],
): BuiltInWorldbookLibraryLayout => {
    const charactersById = new Map(characters.map(character => [character.id, character]));
    const shelfBooks = new Map<string, Map<BuiltInCharacterWorldbookLaneKind, Worldbook[]>>();
    const classifiedBookIds = new Set<string>();

    groups.forEach(group => {
        const kind = resolveBuiltInCharacterLaneKind(group.category);
        if (!kind) return;
        group.books.forEach(book => {
            const visibleIds = book.visibleToCharacterIds || [];
            if (visibleIds.length !== 1 || !charactersById.has(visibleIds[0])) return;
            const characterId = visibleIds[0];
            const lanes = shelfBooks.get(characterId) || new Map<BuiltInCharacterWorldbookLaneKind, Worldbook[]>();
            lanes.set(kind, [...(lanes.get(kind) || []), book]);
            shelfBooks.set(characterId, lanes);
            classifiedBookIds.add(book.id);
        });
    });

    const laneOrder: readonly BuiltInCharacterWorldbookLaneKind[] = [
        'canonical_chronology',
        'playable_if',
        'story_enhancement',
        'expansion_play',
    ];
    const laneLabel: Record<BuiltInCharacterWorldbookLaneKind, string> = {
        canonical_chronology: '现世履历',
        playable_if: 'IF 世界',
        story_enhancement: '剧情增强',
        expansion_play: '拓展玩法',
    };
    const characterShelves = characters.flatMap(character => {
        const lanes = shelfBooks.get(character.id);
        if (!lanes) return [];
        const projectedLanes = laneOrder.flatMap(kind => {
            const books = lanes.get(kind);
            if (!books?.length) return [];
            return [{
                id: `built-in-character:${character.id}:${kind}`,
                kind,
                label: laneLabel[kind],
                books: [...books].sort((a, b) => compareBuiltInLaneBooks(kind, a, b)),
            } satisfies BuiltInCharacterWorldbookLane];
        });
        return [{
            id: `built-in-character:${character.id}`,
            characterId: character.id,
            characterName: character.name,
            booksCount: projectedLanes.reduce((total, lane) => total + lane.books.length, 0),
            lanes: projectedLanes,
        } satisfies BuiltInCharacterWorldbookShelf];
    });

    const remainingGroups = groups.flatMap(group => {
        const books = group.books.filter(book => !classifiedBookIds.has(book.id));
        return books.length ? [{ ...group, books }] : [];
    });

    return { characterShelves, remainingGroups };
};

const groupBuiltInBooks = (books: Worldbook[]): WorldbookCategoryGroup[] => {
    const grouped = new Map<string, Worldbook[]>();
    books.forEach(book => {
        const category = normalizeWorldbookCategory(book.category);
        grouped.set(category, [...(grouped.get(category) || []), book]);
    });
    return Array.from(grouped.entries())
        .sort(([categoryA], [categoryB]) => compareWorldbookCategories(categoryA, categoryB))
        .map(([category, categoryBooks]) => ({
            id: `built-in:${category}`,
            category,
            books: [...categoryBooks].sort(compareWorldbooks),
        }));
};

const groupCustomBooks = (
    books: Worldbook[],
    assignments: readonly WorldbookGroupAssignment[],
): WorldbookCategoryGroup[] => {
    const grouped = new Map<string, WorldbookCategoryGroup>();
    assignments.forEach(assignment => {
        grouped.set(assignment.id, {
            id: assignment.id,
            category: assignment.name,
            owner: assignment.owner,
            sortOrder: assignment.sortOrder,
            pinned: assignment.pinned,
            books: [],
        });
    });
    books.forEach(book => {
        const assignment = book.group;
        const key = assignment?.id || 'unassigned:legacy';
        const existing = grouped.get(key);
        if (existing) {
            existing.books.push(book);
            return;
        }
        grouped.set(key, {
            id: key,
            category: assignment?.name || UNASSIGNED_WORLDBOOK_GROUP_NAME,
            owner: assignment?.owner,
            requiresAssignment: !assignment,
            books: [book],
        });
    });
    return [...grouped.values()]
        .sort((a, b) => (
            Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
            || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
            || compareWorldbookCategories(a.category, b.category)
        ))
        .map(group => ({ ...group, books: [...group.books].sort(compareWorldbooks) }));
};

export const buildWorldbookGroupIndex = (
    worldbooks: Worldbook[],
    assignments: readonly WorldbookGroupAssignment[] = [],
): WorldbookGroupIndex => {
    const builtIn = worldbooks.filter(isBuiltInWorldbook);
    const custom = worldbooks.filter(book => !isBuiltInWorldbook(book));
    return {
        builtInGroups: groupBuiltInBooks(builtIn),
        customGroups: groupCustomBooks(custom, assignments),
        builtInCount: builtIn.length,
        customCount: custom.length,
    };
};

export const listCustomWorldbookCategories = (worldbooks: Worldbook[]) => (
    buildWorldbookGroupIndex(worldbooks).customGroups.map(group => group.category)
);

export const listWorldbookGroupAssignments = (
    worldbooks: readonly Worldbook[],
): WorldbookGroupAssignment[] => {
    const byId = new Map<string, WorldbookGroupAssignment>();
    worldbooks.forEach(book => {
        if (book.group) byId.set(book.group.id, book.group);
    });
    return [...byId.values()].sort((a, b) => compareWorldbookCategories(a.name, b.name));
};

export const createWorldbookGroupAssignment = (input: {
    name: string;
    owner: WorldbookGroupOwner;
    id?: string;
    now?: number;
    sortOrder?: number;
    pinned?: boolean;
}): WorldbookGroupAssignment => {
    const name = normalizeWorldbookCategory(input.name);
    const ownerKey = input.owner.kind === 'universal'
        ? 'universal'
        : `character:${input.owner.charId}`;
    return {
        id: input.id || `worldbook-group:${ownerKey}:${input.now ?? Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
        name,
        owner: input.owner.kind === 'universal'
            ? { kind: 'universal' }
            : { kind: 'character', charId: input.owner.charId },
        sortOrder: input.sortOrder,
        pinned: input.pinned,
    };
};

export const worldbookGroupDisplayName = (
    group: Pick<WorldbookGroupAssignment, 'id' | 'name' | 'owner'>,
): string => (
    group.owner.kind === 'universal'
    && group.id === UNIVERSAL_WORLDBOOK_GROUP_ID
    && group.name.trim() === LEGACY_UNIVERSAL_WORLDBOOK_GROUP_NAME
        ? '未分类'
        : group.name
);

export const isWorldbookGroupOwnedByCharacter = (
    group: WorldbookGroupAssignment | undefined,
    charId: string,
): boolean => group?.owner.kind === 'character' && group.owner.charId === charId;

export const isWorldbookGroupAvailableToCharacter = (
    group: WorldbookGroupAssignment | undefined,
    charId: string,
): boolean => group?.owner.kind === 'universal' || isWorldbookGroupOwnedByCharacter(group, charId);

export const isWorldbookGroupEnabledForCharacter = (
    group: WorldbookGroupAssignment | undefined,
    character: Pick<CharacterProfile, 'id' | 'mountedWorldbookGroupIds'>,
): boolean => Boolean(group
    && isWorldbookGroupAvailableToCharacter(group, character.id)
    && character.mountedWorldbookGroupIds?.includes(group.id));

export const worldbookGroupOwnerLabel = (
    group: WorldbookGroupAssignment | undefined,
    characters: readonly Pick<CharacterProfile, 'id' | 'name'>[],
): string => {
    if (!group) return UNASSIGNED_WORLDBOOK_GROUP_NAME;
    if (group.owner.kind === 'universal') return UNIVERSAL_WORLDBOOK_GROUP_NAME;
    const ownerCharId = group.owner.charId;
    return characters.find(character => character.id === ownerCharId)?.name || '已删除角色';
};
