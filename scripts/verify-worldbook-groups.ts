import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Worldbook } from '../types.ts';
import {
    buildWorldbookGroupIndex,
    DEFAULT_WORLDBOOK_CATEGORY,
    listCustomWorldbookCategories,
    normalizeWorldbookCategory,
} from '../utils/worldbookGroups.ts';
import { synchronizeMountedWorldbooks } from '../utils/worldbookMounts.ts';

const now = Date.now();
const book = (id: string, patch: Partial<Worldbook> = {}): Worldbook => ({
    id,
    title: id,
    content: `${id} content`,
    category: DEFAULT_WORLDBOOK_CATEGORY,
    createdAt: now,
    updatedAt: now,
    ...patch,
});

const fixture = [
    book('builtin-foundation', {
        title: '01 基础世界观',
        category: '深空世界书',
        isBuiltIn: true,
        lockEditing: true,
    }),
    book('builtin-route', {
        title: '剧情增强',
        category: '深空剧情增强',
        isBuiltIn: true,
        lockEditing: true,
    }),
    book('custom-z', { title: '住处', category: '生活资料' }),
    book('custom-a', { title: '饮食', category: '生活资料' }),
    book('custom-plot', { title: '主线', category: '剧情主线' }),
    book('custom-name-collision', { title: '我的深空补充', category: '深空世界书' }),
];

const index = buildWorldbookGroupIndex(fixture);
assert.equal(index.builtInCount, 2);
assert.equal(index.customCount, 4);
assert.deepEqual(index.builtInGroups.map(group => group.category), ['深空世界书', '深空剧情增强']);
assert.deepEqual(
    index.customGroups.find(group => group.category === '生活资料')?.books.map(item => item.title),
    ['饮食', '住处'],
    'custom entries should keep stable human/numeric title order inside their group',
);
assert.equal(
    index.customGroups.find(group => group.category === '深空世界书')?.books[0].id,
    'custom-name-collision',
    'a custom entry must not become read-only merely because its category name matches a built-in category',
);
assert.deepEqual(listCustomWorldbookCategories(fixture), ['深空世界书', '剧情主线', '生活资料']);
assert.equal(normalizeWorldbookCategory('  自建分组  '), '自建分组');
assert.equal(normalizeWorldbookCategory('   '), DEFAULT_WORLDBOOK_CATEGORY);

const staleMount = {
    id: 'custom-z',
    title: '旧标题',
    content: '旧正文',
    category: '旧分组',
};
const synchronizedMount = synchronizeMountedWorldbooks([staleMount], fixture);
assert.equal(synchronizedMount.changed, true);
assert.deepEqual(synchronizedMount.mountedWorldbooks[0], {
    id: 'custom-z',
    title: '住处',
    content: 'custom-z content',
    category: '生活资料',
});

const missingLibraryMount = synchronizeMountedWorldbooks([{
    id: 'portable-only',
    title: '随角色卡导入的资料',
    content: '没有单独资料库记录时仍需保留',
    category: '导入',
}], fixture);
assert.equal(missingLibraryMount.changed, false);
assert.equal(missingLibraryMount.mountedWorldbooks[0].content, '没有单独资料库记录时仍需保留');

const appSource = readFileSync(new URL('../apps/WorldbookApp.tsx', import.meta.url), 'utf8');
assert.match(appSource, /data-worldbook-built-in-drawer/);
assert.match(appSource, /data-worldbook-custom-groups/);
assert.match(appSource, /data-worldbook-category-options/);
assert.match(appSource, /新建分组/);
assert.match(appSource, /点一下就能沿用，不用重复输入/);
assert.doesNotMatch(appSource, /<datalist|list="category-suggestions"/);

const characterSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
assert.match(characterSource, /expandedWorldbookCategories/);
assert.match(characterSource, /aria-expanded=\{expandedWorldbookCategories\.has\(category\)\}/);
assert.match(characterSource, /currentMountedWorldbooks\(formData\.mountedWorldbooks, worldbooks\)/);

const contextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
assert.match(contextSource, /synchronizeMountedWorldbooks\(char\.mountedWorldbooks, nextLibrary\)/);
assert.doesNotMatch(contextSource, /let fullUpdatedWb: Worldbook \| undefined/);

console.log('worldbook folding, custom group, and live mount contract: OK');
