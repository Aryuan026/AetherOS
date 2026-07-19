import type { Worldbook } from '../types.ts';

export const DEFAULT_WORLDBOOK_CATEGORY = '未分类设定 (General)';

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
    category: string;
    books: Worldbook[];
}

export interface WorldbookGroupIndex {
    builtInGroups: WorldbookCategoryGroup[];
    customGroups: WorldbookCategoryGroup[];
    builtInCount: number;
    customCount: number;
}

const groupBooks = (books: Worldbook[]): WorldbookCategoryGroup[] => {
    const grouped = new Map<string, Worldbook[]>();
    books.forEach(book => {
        const category = normalizeWorldbookCategory(book.category);
        grouped.set(category, [...(grouped.get(category) || []), book]);
    });
    return Array.from(grouped.entries())
        .sort(([categoryA], [categoryB]) => compareWorldbookCategories(categoryA, categoryB))
        .map(([category, categoryBooks]) => ({
            category,
            books: [...categoryBooks].sort(compareWorldbooks),
        }));
};

export const buildWorldbookGroupIndex = (worldbooks: Worldbook[]): WorldbookGroupIndex => {
    const builtIn = worldbooks.filter(isBuiltInWorldbook);
    const custom = worldbooks.filter(book => !isBuiltInWorldbook(book));
    return {
        builtInGroups: groupBooks(builtIn),
        customGroups: groupBooks(custom),
        builtInCount: builtIn.length,
        customCount: custom.length,
    };
};

export const listCustomWorldbookCategories = (worldbooks: Worldbook[]) => (
    buildWorldbookGroupIndex(worldbooks).customGroups.map(group => group.category)
);
