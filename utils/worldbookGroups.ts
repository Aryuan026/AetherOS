import type {
    CharacterProfile,
    Worldbook,
    WorldbookGroupAssignment,
    WorldbookGroupOwner,
} from '../types.ts';

export const DEFAULT_WORLDBOOK_CATEGORY = '未分类设定 (General)';
export const UNIVERSAL_WORLDBOOK_GROUP_NAME = '通用区';
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
    if (input.owner.kind === 'universal') {
        return {
            id: UNIVERSAL_WORLDBOOK_GROUP_ID,
            name: UNIVERSAL_WORLDBOOK_GROUP_NAME,
            owner: { kind: 'universal' },
            sortOrder: input.sortOrder,
            pinned: input.pinned,
        };
    }
    const name = normalizeWorldbookCategory(input.name);
    const ownerKey = `character:${input.owner.charId}`;
    return {
        id: input.id || `worldbook-group:${ownerKey}:${input.now ?? Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
        name,
        owner: { kind: 'character', charId: input.owner.charId },
        sortOrder: input.sortOrder,
        pinned: input.pinned,
    };
};

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
): boolean => Boolean(group && (
    group.owner.kind === 'universal'
    || (
        group.owner.charId === character.id
        && character.mountedWorldbookGroupIds?.includes(group.id)
    )
));

export const worldbookGroupOwnerLabel = (
    group: WorldbookGroupAssignment | undefined,
    characters: readonly Pick<CharacterProfile, 'id' | 'name'>[],
): string => {
    if (!group) return UNASSIGNED_WORLDBOOK_GROUP_NAME;
    if (group.owner.kind === 'universal') return UNIVERSAL_WORLDBOOK_GROUP_NAME;
    const ownerCharId = group.owner.charId;
    return characters.find(character => character.id === ownerCharId)?.name || '已删除角色';
};
