import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CharacterProfile, Worldbook } from '../types.ts';
import {
    buildWorldbookGroupIndex,
    createWorldbookGroupAssignment,
    DEFAULT_WORLDBOOK_CATEGORY,
    isWorldbookGroupEnabledForCharacter,
    listCustomWorldbookCategories,
    normalizeWorldbookCategory,
} from '../utils/worldbookGroups.ts';
import { synchronizeMountedWorldbooks } from '../utils/worldbookMounts.ts';

const now = Date.now();
const roleGroup = createWorldbookGroupAssignment({
    id: 'group:char-a:life',
    name: '生活资料',
    owner: { kind: 'character', charId: 'char-a' },
});
const plotGroup = createWorldbookGroupAssignment({
    id: 'group:char-a:plot',
    name: '剧情主线',
    owner: { kind: 'character', charId: 'char-a' },
});
const collisionGroup = createWorldbookGroupAssignment({
    id: 'group:char-a:deep-space-name',
    name: '深空世界书',
    owner: { kind: 'character', charId: 'char-a' },
});
const emptyGroup = createWorldbookGroupAssignment({
    id: 'group:char-a:empty',
    name: '空白实验组',
    owner: { kind: 'character', charId: 'char-a' },
});
const pinnedGroup = createWorldbookGroupAssignment({
    id: 'group:char-a:pinned',
    name: '置顶资料',
    owner: { kind: 'character', charId: 'char-a' },
    pinned: true,
    sortOrder: 99,
});
const firstOrderedGroup = createWorldbookGroupAssignment({
    id: 'group:char-a:first',
    name: '后排第一',
    owner: { kind: 'character', charId: 'char-a' },
    sortOrder: 0,
});
const universalGroup = createWorldbookGroupAssignment({
    id: 'group:universal:ancient',
    name: '古代书',
    owner: { kind: 'universal' },
});
const secondUniversalGroup = createWorldbookGroupAssignment({
    id: 'group:universal:modern',
    name: '现代书',
    owner: { kind: 'universal' },
});
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
    book('custom-z', { title: '住处', category: roleGroup.name, group: roleGroup }),
    book('custom-a', { title: '饮食', category: roleGroup.name, group: roleGroup }),
    book('custom-plot', { title: '主线', category: plotGroup.name, group: plotGroup }),
    book('custom-name-collision', { title: '我的深空补充', category: collisionGroup.name, group: collisionGroup }),
];

const index = buildWorldbookGroupIndex(fixture, [roleGroup, plotGroup, collisionGroup, emptyGroup, universalGroup, secondUniversalGroup, firstOrderedGroup, pinnedGroup]);
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
assert.ok(index.customGroups.some(group => group.id === emptyGroup.id && group.books.length === 0));
assert.ok(index.customGroups.some(group => group.id === universalGroup.id && group.category === '古代书' && group.books.length === 0));
assert.ok(index.customGroups.some(group => group.id === secondUniversalGroup.id && group.category === '现代书' && group.books.length === 0));
assert.notEqual(universalGroup.id, secondUniversalGroup.id, 'named universal groups must remain independent groups');
assert.equal(index.customGroups[0].id, pinnedGroup.id, 'pinned groups must stay above the ordinary order');
assert.equal(index.customGroups[1].id, firstOrderedGroup.id, 'explicit order must win over name sorting');
assert.deepEqual(listCustomWorldbookCategories(fixture), ['深空世界书', '剧情主线', '生活资料']);
assert.equal(normalizeWorldbookCategory('  自建分组  '), '自建分组');
assert.equal(normalizeWorldbookCategory('   '), DEFAULT_WORLDBOOK_CATEGORY);
const charA = {
    id: 'char-a',
    mountedWorldbookGroupIds: [roleGroup.id, universalGroup.id],
} as CharacterProfile;
const charB = {
    id: 'char-b',
    mountedWorldbookGroupIds: [roleGroup.id],
} as CharacterProfile;
assert.equal(isWorldbookGroupEnabledForCharacter(roleGroup, charA), true);
assert.equal(
    isWorldbookGroupEnabledForCharacter(roleGroup, charB),
    false,
    'putting another role group id into a character record must not bypass ownership',
);
assert.equal(isWorldbookGroupEnabledForCharacter(universalGroup, charA), true);
assert.equal(isWorldbookGroupEnabledForCharacter(universalGroup, charB), false);
assert.equal(isWorldbookGroupEnabledForCharacter(secondUniversalGroup, charA), false);
assert.equal(isWorldbookGroupEnabledForCharacter(undefined, charA), false);

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
    publicationStatus: 'published',
    legacyPromptEligibility: 'public_global',
    knowledgePolicy: { kind: 'public' },
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
const editorSource = readFileSync(new URL('../components/worldbook/WorldbookEntryEditor.tsx', import.meta.url), 'utf8');
const pickerSource = readFileSync(new URL('../components/worldbook/WorldbookGroupPicker.tsx', import.meta.url), 'utf8');
assert.match(appSource, /data-worldbook-built-in-drawer/);
assert.match(appSource, /data-worldbook-custom-groups/);
assert.match(appSource, /data-worldbook-universal-drawer/);
assert.match(appSource, /data-worldbook-group-access/);
assert.doesNotMatch(appSource, /data-worldbook-empty-group-creator|新建空分组/);
assert.match(appSource, /DotsSixVertical/);
assert.match(appSource, /togglePinnedGroup/);
assert.match(appSource, /hideBuiltInWorldbooks/);
assert.match(appSource, /pinBuiltInWorldbooks/);
assert.match(appSource, /data-worldbook-unassigned-repair/);
assert.match(appSource, /archiveWorldbookGroup/);
assert.match(appSource, /删除空分组/);
assert.match(editorSource, /WorldbookGroupPicker/);
assert.match(pickerSource, /新建分组/);
assert.match(editorSource, /要复用到别处/);
assert.doesNotMatch(`${appSource}\n${editorSource}\n${pickerSource}`, /<datalist|list="category-suggestions"/);

const characterSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
assert.match(characterSource, /expandedWorldbookCategories/);
assert.match(characterSource, /aria-expanded=\{expandedWorldbookCategories\.has\(category\)\}/);
assert.match(characterSource, /currentMountedWorldbooks\(formData\.mountedWorldbooks, playerVisibleWorldbooks\)/);
assert.match(characterSource, /listPlayerVisibleWorldbooks\(worldbooks\)/);
assert.match(characterSource, /已归档 · 保留挂载记录/);
assert.match(characterSource, /mountedWorldbookGroupIds/);
assert.match(characterSource, /停用整组/);

const contextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
assert.match(
    contextSource,
    /DB\.saveWorldbookRevision\(groupedUpdatedWb, previousRevisionId\)/,
    'Worldbook revisions and mounted portability caches must use the atomic persistence path',
);
assert.doesNotMatch(contextSource, /let fullUpdatedWb: Worldbook \| undefined/);
assert.doesNotMatch(
    contextSource,
    /updatedChars\.map\(char => DB\.saveCharacter/,
    'Worldbook edit must not split library and portability-cache writes across transactions',
);

console.log('worldbook folding, custom group, and live mount contract: OK');
