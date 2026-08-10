import { normalizeWorldbookCategory } from './worldbookGroups.ts';

type JsonObject = Record<string, unknown>;

export interface TavernWorldbookDraft {
  title: string;
  content: string;
  category: string;
  aliases: string[];
  activationHint?: string;
  publicationStatus: 'published' | 'archived';
  sourceLabel: string;
}

export interface TavernCharacterCardImport {
  name: string;
  systemPrompt: string;
  firstMessage?: string;
  alternateGreetingsCount: number;
  regexScriptCount: number;
  worldbooks: TavernWorldbookDraft[];
}

const objectValue = (value: unknown): JsonObject | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null
);

const cleanText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const textList = (value: unknown): string[] => (
  Array.isArray(value)
    ? [...new Set(value.map(cleanText).filter(Boolean))]
    : []
);

const entryList = (value: unknown): JsonObject[] => {
  if (Array.isArray(value)) return value.map(objectValue).filter(Boolean) as JsonObject[];
  const record = objectValue(value);
  return record ? Object.values(record).map(objectValue).filter(Boolean) as JsonObject[] : [];
};

const parseTavernWorldbookEntries = (
  value: unknown,
  defaultCategory: string,
): TavernWorldbookDraft[] => (
  entryList(value).map((entry, index) => {
    const content = cleanText(entry.content);
    if (!content) throw new Error(`酒馆世界书第 ${index + 1} 条没有正文。`);
    const identity = cleanText(entry.comment)
      || cleanText(entry.title)
      || cleanText(entry.id)
      || cleanText(entry.uid)
      || String(index + 1);
    const aliases = [...new Set([
      ...textList(entry.keys),
      ...textList(entry.key),
      ...textList(entry.secondary_keys),
      ...textList(entry.keysecondary),
    ])];
    const disabled = entry.enabled === false || entry.disable === true;
    const constant = entry.constant === true;
    const sourceMode = constant ? '原文件常驻' : aliases.length ? '原文件关键词触发' : '原文件按内容读取';
    return {
      title: identity,
      content,
      // SillyTavern's entry.group controls activation competition; it is not a
      // visible library folder. AetherOS groups the imported entries by their
      // source book so the whole book can be mounted as one unit.
      category: normalizeWorldbookCategory(defaultCategory),
      aliases,
      activationHint: aliases.length ? aliases.join(' / ') : undefined,
      publicationStatus: disabled ? 'archived' : 'published',
      sourceLabel: `${sourceMode} · ${disabled ? '停用，导入后归档' : '已启用'}`,
    };
  })
);

const cardData = (document: JsonObject): JsonObject | null => {
  const data = objectValue(document.data);
  if (data) return data;
  return cleanText(document.name) ? document : null;
};

export const isTavernCharacterCardDocument = (value: unknown): boolean => {
  const document = objectValue(value);
  if (!document) return false;
  const spec = cleanText(document.spec);
  if (spec === 'chara_card_v2' || spec === 'chara_card_v3') return true;
  const data = cardData(document);
  return Boolean(data && cleanText(data.name) && (
    typeof data.description === 'string'
    || typeof data.first_mes === 'string'
    || objectValue(data.character_book)
  ));
};

export const parseTavernCharacterCard = (value: unknown): TavernCharacterCardImport => {
  const document = objectValue(value);
  if (!document || !isTavernCharacterCardDocument(document)) {
    throw new Error('这不是可识别的酒馆角色卡。');
  }
  const data = cardData(document)!;
  const name = cleanText(data.name);
  if (!name) throw new Error('这张酒馆角色卡没有角色名。');

  const promptParts = [
    ['系统要求', cleanText(data.system_prompt)],
    ['角色设定', cleanText(data.description)],
    ['性格补充', cleanText(data.personality)],
    ['场景设定', cleanText(data.scenario)],
    ['对话示例', cleanText(data.mes_example)],
    ['后续要求', cleanText(data.post_history_instructions)],
  ].filter((part): part is [string, string] => Boolean(part[1]));
  const systemPrompt = promptParts.length === 1
    ? promptParts[0][1]
    : promptParts.map(([label, content]) => `### ${label}\n${content}`).join('\n\n');
  if (!systemPrompt) throw new Error('这张酒馆角色卡没有可用的角色设定。');

  const characterBook = objectValue(data.character_book);
  const extensions = objectValue(data.extensions);
  const worldbookName = cleanText(characterBook?.name) || `${name}世界书`;
  return {
    name,
    systemPrompt,
    firstMessage: cleanText(data.first_mes) || undefined,
    alternateGreetingsCount: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.length : 0,
    regexScriptCount: Array.isArray(extensions?.regex_scripts) ? extensions.regex_scripts.length : 0,
    worldbooks: parseTavernWorldbookEntries(characterBook?.entries, worldbookName),
  };
};

export const parseTavernStandaloneWorldbook = (
  value: unknown,
  options: { defaultCategory?: string } = {},
): TavernWorldbookDraft[] => {
  const document = objectValue(value);
  if (!document || !document.entries || isTavernCharacterCardDocument(document)) {
    throw new Error('这不是可识别的酒馆独立世界书。');
  }
  const bookName = cleanText(document.name)
    || cleanText(document.book_name)
    || cleanText(options.defaultCategory)
    || '酒馆世界书';
  const entries = parseTavernWorldbookEntries(document.entries, bookName);
  if (!entries.length) throw new Error('这份酒馆世界书里没有条目。');
  return entries;
};

const readUint32 = (bytes: Uint8Array, offset: number): number => (
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
);

const decodeBase64Json = (payload: string): unknown => {
  try {
    const binary = atob(payload.trim());
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('PNG 里的角色卡资料没有读完整。');
  }
};

/** Reads the standard SillyTavern `chara` / `ccv3` PNG text chunk. */
export const extractTavernCharacterCardFromPng = (input: ArrayBuffer | Uint8Array): unknown => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 20 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error('这不是完整的 PNG 文件。');
  }
  let offset = 8;
  let legacyPayload: string | undefined;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('PNG 文件结构不完整。');
    const type = new TextDecoder('latin1').decode(bytes.subarray(offset + 4, offset + 8));
    if (type === 'tEXt') {
      const data = bytes.subarray(dataStart, dataEnd);
      const separator = data.indexOf(0);
      if (separator > 0) {
        const keyword = new TextDecoder('latin1').decode(data.subarray(0, separator));
        const payload = new TextDecoder('latin1').decode(data.subarray(separator + 1));
        if (keyword === 'ccv3') return decodeBase64Json(payload);
        if (keyword === 'chara') legacyPayload = payload;
      }
    }
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  if (legacyPayload) return decodeBase64Json(legacyPayload);
  throw new Error('这张 PNG 只有图片，没有酒馆角色卡资料。请使用原始角色卡 PNG 或 JSON。');
};
