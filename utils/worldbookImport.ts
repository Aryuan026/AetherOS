import { normalizeWorldbookCategory } from './worldbookGroups.ts';
import {
  isTavernCharacterCardDocument,
  parseTavernCharacterCard,
  parseTavernStandaloneWorldbook,
} from './tavernImport.ts';

export const AETHEROS_WORLDBOOK_IMPORT_SCHEMA = 'aetheros-worldbook' as const;
export const AETHEROS_WORLDBOOK_IMPORT_VERSION = 1 as const;

export interface WorldbookImportDraft {
  clientId: string;
  title: string;
  content: string;
  category: string;
  aliases?: string[];
  activationHint?: string;
  publicationStatus?: 'published' | 'archived';
  sourceLabel?: string;
}

type AetherOSWorldbookImport = {
  schema: typeof AETHEROS_WORLDBOOK_IMPORT_SCHEMA;
  version: typeof AETHEROS_WORLDBOOK_IMPORT_VERSION;
  entries: Array<{
    title: string;
    content: string;
    category?: string;
  }>;
};

export const titleFromWorldbookFileName = (fileName?: string): string => {
  const cleaned = fileName?.replace(/\.(json|png|txt)$/iu, '').trim();
  return cleaned || `导入资料 ${new Date().toLocaleDateString()}`;
};

const parseJson = (source: string, fileName?: string): WorldbookImportDraft[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('这份 JSON 没有读完整，请检查括号、引号或重新导出后再试。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('这不是 AetherOS 世界书 JSON。');
  }
  if (isTavernCharacterCardDocument(parsed)) {
    const card = parseTavernCharacterCard(parsed);
    if (!card.worldbooks.length) {
      throw new Error('这张角色卡里没有内嵌世界书；角色本体请从通讯录导入。');
    }
    return card.worldbooks.map((entry, index) => ({
      clientId: `tavern-card-${index + 1}`,
      ...entry,
    }));
  }
  const document = parsed as Partial<AetherOSWorldbookImport>;
  if (
    document.schema === AETHEROS_WORLDBOOK_IMPORT_SCHEMA
    && document.version === AETHEROS_WORLDBOOK_IMPORT_VERSION
    && Array.isArray(document.entries)
  ) {
    if (document.entries.length === 0) throw new Error('这份世界书里没有可导入的条目。');
    return document.entries.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`第 ${index + 1} 条世界书不是完整条目。`);
      }
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      if (!title) throw new Error(`第 ${index + 1} 条世界书缺少标题。`);
      if (typeof entry.content !== 'string') {
        throw new Error(`第 ${index + 1} 条世界书缺少正文。`);
      }
      return {
        clientId: `import-${index + 1}`,
        title,
        content: entry.content,
        category: normalizeWorldbookCategory(
          typeof entry.category === 'string' ? entry.category : undefined,
        ),
      };
    });
  }
  const possibleStandalone = parsed as { entries?: unknown };
  if (possibleStandalone.entries) {
    return parseTavernStandaloneWorldbook(parsed, {
      defaultCategory: fileName ? titleFromWorldbookFileName(fileName) : undefined,
    }).map((entry, index) => ({
      clientId: `tavern-worldbook-${index + 1}`,
      ...entry,
    }));
  }
  throw new Error('这份 JSON 不是可识别的 AetherOS / 酒馆世界书或角色卡。');
};

export const parseWorldbookImport = (input: {
  source: string;
  fileName?: string;
}): WorldbookImportDraft[] => {
  const source = input.source.trim();
  if (!source) throw new Error('还没有可导入的文字。');
  const extension = input.fileName?.split('.').pop()?.toLocaleLowerCase();
  if (extension && !['json', 'png', 'txt'].includes(extension)) {
    throw new Error('目前支持 AetherOS / 酒馆 JSON、PNG 和 TXT。');
  }
  if (extension === 'json' || extension === 'png' || (!extension && source.startsWith('{'))) {
    return parseJson(source, input.fileName);
  }
  return [{
    clientId: 'import-1',
    title: titleFromWorldbookFileName(input.fileName),
    content: input.source,
    category: normalizeWorldbookCategory(),
  }];
};

export const inferWorldbookImportGroupName = (input: {
  drafts: readonly WorldbookImportDraft[];
  fileName?: string;
}): string => {
  if (input.fileName) return titleFromWorldbookFileName(input.fileName);
  const meaningfulCategories = [...new Set(input.drafts
    .map(draft => normalizeWorldbookCategory(draft.category))
    .filter(category => category !== normalizeWorldbookCategory()))];
  if (meaningfulCategories.length === 1) return meaningfulCategories[0];
  return input.drafts[0]?.title.trim() || titleFromWorldbookFileName();
};
