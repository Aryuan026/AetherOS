import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractTavernCharacterCardFromPng,
  parseTavernCharacterCard,
  parseTavernStandaloneWorldbook,
} from '../utils/tavernImport.ts';
import { parseWorldbookImport } from '../utils/worldbookImport.ts';

const embeddedEntries = [
  {
    id: 1,
    comment: '城市规则',
    content: '夜间列车只停靠一次。',
    enabled: true,
    constant: true,
    keys: [],
    secondary_keys: [],
  },
  {
    id: 2,
    comment: '旧车站',
    content: '旧车站位于北区。',
    enabled: false,
    constant: false,
    keys: ['车站'],
    secondary_keys: ['北区'],
  },
];

const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: '测试角色',
    description: '沉静，但会主动观察周围变化。',
    personality: '',
    scenario: '',
    first_mes: '你来了。',
    mes_example: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: ['今天比昨天安静。'],
    character_book: { name: '城市档案', entries: embeddedEntries },
    extensions: { regex_scripts: [{ script_name: 'fixture' }] },
  },
};

const parsedCard = parseTavernCharacterCard(card);
assert.equal(parsedCard.name, '测试角色');
assert.equal(parsedCard.systemPrompt, card.data.description);
assert.equal(parsedCard.worldbooks.length, 2);
assert.equal(parsedCard.worldbooks[0].publicationStatus, 'published');
assert.equal(parsedCard.worldbooks[1].publicationStatus, 'archived');
assert.deepEqual(parsedCard.worldbooks.map(entry => entry.category), ['城市档案', '城市档案']);
assert.deepEqual(parsedCard.worldbooks[1].aliases, ['车站', '北区']);
assert.equal(parsedCard.alternateGreetingsCount, 1);
assert.equal(parsedCard.regexScriptCount, 1);

const standalone = {
  entries: {
    1: {
      uid: 1,
      comment: '城市规则',
      content: '夜间列车只停靠一次。',
      disable: false,
      constant: true,
      key: [],
      keysecondary: [],
      group: '城市',
    },
    2: {
      uid: 2,
      comment: '旧车站',
      content: '旧车站位于北区。',
      disable: true,
      constant: false,
      key: ['车站'],
      keysecondary: ['北区'],
      group: '地点',
    },
  },
};
const parsedStandalone = parseTavernStandaloneWorldbook(standalone, { defaultCategory: '独立城市书' });
assert.equal(parsedStandalone.length, 2);
assert.deepEqual(parsedStandalone.map(entry => entry.category), ['独立城市书', '独立城市书']);
assert.equal(parsedStandalone[1].publicationStatus, 'archived');

assert.equal(parseWorldbookImport({
  source: JSON.stringify(card),
  fileName: 'card.json',
}).length, 2);
const standaloneImport = parseWorldbookImport({
  source: JSON.stringify(standalone),
  fileName: '海港设定.json',
});
assert.equal(standaloneImport.length, 2);
assert.deepEqual(standaloneImport.map(entry => entry.category), ['海港设定', '海港设定']);

const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const chunk = new Uint8Array(12 + data.length);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  return chunk;
};
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const metadata = new TextEncoder().encode(`ccv3\0${Buffer.from(JSON.stringify(card)).toString('base64')}`);
const png = new Uint8Array(signature.length + 12 + metadata.length + 12);
png.set(signature, 0);
png.set(pngChunk('tEXt', metadata), signature.length);
png.set(pngChunk('IEND', new Uint8Array()), signature.length + 12 + metadata.length);
assert.equal(parseTavernCharacterCard(extractTavernCharacterCardFromPng(png)).name, '测试角色');

const plainPng = new Uint8Array(signature.length + 12);
plainPng.set(signature, 0);
plainPng.set(pngChunk('IEND', new Uint8Array()), signature.length);
assert.throws(
  () => extractTavernCharacterCardFromPng(plainPng),
  /只有图片，没有酒馆角色卡资料/,
);

const characterSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
const worldbookScreenSource = readFileSync(new URL('../components/worldbook/WorldbookImportScreen.tsx', import.meta.url), 'utf8');
assert.match(characterSource, /accept="\.json,\.png,application\/json,image\/png"/);
assert.match(characterSource, /extractTavernCharacterCardFromPng/);
assert.match(characterSource, /addImportedWorldbooks/);
assert.match(characterSource, /name: card\.name/);
assert.match(characterSource, /owner: \{ kind: 'character', charId: newCharacterId \}/);
assert.match(characterSource, /mountedWorldbookGroupIds: mountedLibrary\.length \? \[importedGroup\.id\] : \[\]/);
assert.match(characterSource, /mountedWorldbooks: \[\]/);
assert.match(characterSource, /ensureCharacterLinkedToActiveMask\(newChar/);
assert.match(worldbookScreenSource, /选择 JSON、PNG 或 TXT/);
assert.match(worldbookScreenSource, /支持酒馆独立世界书与角色卡内嵌世界书/);
assert.match(worldbookScreenSource, /识别后自动收进一个新分组/);

console.log('Tavern JSON/PNG character card and standalone/embedded Worldbook import: OK');
