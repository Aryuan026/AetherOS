import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorldbookEntry } from '../domain/worldbook/contract.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import type { CharacterProfile, NovelBook, Worldbook } from '../types.ts';
import { buildPlainNovelPrompt } from '../utils/novelUtils.ts';
import { prepareWorldbookRuntimeProjection } from '../utils/worldbookRuntime.ts';
import { createWorldbookGroupAssignment } from '../utils/worldbookGroups.ts';
import {
  BUILT_IN_DREAMWORLD,
  createDefaultCreativeSchemeSettings,
  prepareCreativeScheme,
} from '../domain/creativeScheme/index.ts';

const scope: HistoryScope = {
  progressBundleId: 'bundle-a',
  personaMaskId: 'mask-a',
  charId: 'char-a',
};
const group = createWorldbookGroupAssignment({
  id: 'worldbook-group:char-a:plain-novel',
  name: '测试资料',
  owner: { kind: 'character', charId: 'char-a' },
});
const createEntry = (id: string, title: string, content: string, activationHint: string): Worldbook => createWorldbookEntry({
  book: {
    id,
    title,
    content,
    category: group.name,
    group,
    activationHint,
    createdAt: 1,
    updatedAt: 1,
  },
  bindings: [{ id: `${id}:scope`, kind: 'relationship', scope }],
  knowledgePolicy: { kind: 'public' },
  sourceRef: { kind: 'player', refId: `fixture:${id}` },
});
const relevant = createEntry('tide-clock', '雾港潮汐钟', '北门开启时，潮汐钟会先响三次。', '雾港、北门、潮汐钟');
const irrelevant = createEntry('orchard', '山城果园', '果园只在冬季开放。', '果园、冬季');
const character: CharacterProfile = {
  id: 'char-a',
  name: '测试角色',
  avatar: '',
  description: '',
  systemPrompt: '',
  memories: [],
  contextLimit: 500,
  mountedWorldbooks: [],
  mountedWorldbookGroupIds: [group.id],
};
const prepared = prepareWorldbookRuntimeProjection({
  requestId: 'plain-novel:fixture',
  library: [relevant, irrelevant],
  character,
  scope,
  consumer: { kind: 'world_director', id: 'novel-prose:fixture', revision: 'plain-novel-v1' },
  knowledgeSubjects: [{ kind: 'narrator', id: 'novel:fixture' }, { kind: 'character', id: scope.charId }],
  query: '从雾港北门的潮汐钟响起后继续写',
  budget: { maxTotalChars: 900, maxEntries: 2, maxEntryChars: 500 },
});
assert.deepEqual(prepared.projection.items.map(item => item.entryId), ['tide-clock']);

const book: NovelBook = {
  id: 'novel-a',
  title: '雾港来信',
  summary: '有人在潮汐钟响起后失踪。',
  coverStyle: 'paper',
  worldSetting: '故事发生在沿海旧城。',
  collaboratorIds: [character.id],
  protagonists: [{ id: 'p1', name: '林霁', role: '主角', description: '谨慎的修表师' }],
  segments: [],
  writingMode: 'plain_novel',
  createdAt: 1,
  lastActiveAt: 1,
};
const prompt = buildPlainNovelPrompt({
  activeBook: book,
  userText: '从钟声之后继续',
  storyContext: '【当前章节】\n林霁把手放在生锈的门栓上。',
  creativeSchemeContext: prepareCreativeScheme({
    schemes: [],
    settings: createDefaultCreativeSchemeSettings(1),
    surface: 'plain_novel',
  }).markdown,
  worldbookContext: prepared.markdown,
});
assert.match(prompt, /雾港潮汐钟/u);
assert.match(prompt, /林霁/u);
assert.doesNotMatch(prompt, /山城果园/u);
assert.doesNotMatch(prompt, /小说共创|你的身份|反趋同协议|绝对禁止/u);
assert.match(prompt, /直接交付可以接进手稿的中文小说正文/u);
assert.match(prompt, new RegExp(BUILT_IN_DREAMWORLD.name, 'u'));

const writerSource = readFileSync(join(process.cwd(), 'components/novel/NovelWriter.tsx'), 'utf8');
assert.ok(writerSource.includes("activeBook.writingMode === 'plain_novel'"));
assert.ok(writerSource.includes("authorId: 'system'"));
assert.ok(writerSource.includes('creativeSchemeDelivery'));
assert.ok(writerSource.includes('preparePlainNovelCreativeScheme'));
assert.ok(writerSource.includes("consumer: worldbookConsumer"));
assert.ok(writerSource.indexOf('await persistSegments([...contextSegments, ...newAiSegments])') < writerSource.lastIndexOf('await recordWorldbookRuntimeProjectionDelivery'));
assert.ok(writerSource.includes("if (!isPlainNovel && inputText.trim())"), 'plain-novel instructions must not be stored as manuscript prose');

console.log('plain novel prose + typed Worldbook runtime: OK');
