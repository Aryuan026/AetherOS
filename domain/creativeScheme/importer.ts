import { createCreativeScheme, CREATIVE_SCHEME_CATEGORIES } from './contract';
import type {
  CreativeScheme,
  CreativeSchemeCategory,
  CreativeSchemeModule,
  CreativeSchemeSurface,
} from './types';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
);

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const inferCategory = (name: string, content: string): CreativeSchemeCategory => {
  const value = `${name}\n${content}`.toLowerCase();
  if (/输出|格式|json|markdown|字数|回复结构/u.test(value)) return '输出规范';
  if (/顺序|位置|注入|context|上下文|depth|order/u.test(value)) return '上下文编排';
  if (/文风|语言|笔触|句式|节奏|视角|style/u.test(value)) return '文体表达';
  if (/安全|边界|合规|内容范围|成人|nsfw|r18/u.test(value)) return '内容边界';
  if (/温度|temperature|top.p|模型|claude|gemini|gpt/u.test(value)) return '模型适配';
  if (/剧情|因果|推进|悬念|事件|叙事/u.test(value)) return '叙事机制';
  if (/角色|扮演|关系|行为|人物|对白/u.test(value)) return '演绎准则';
  return '创作框架';
};

const inferSurfaces = (name: string, content: string): CreativeSchemeSurface[] => {
  const value = `${name}\n${content}`.toLowerCase();
  if (/小说|正文|叙事|writer|novel/u.test(value)) return ['plain_novel', 'story_mainline', 'story_if'];
  if (/聊天|短信|微信|chat/u.test(value)) return ['chat'];
  if (/见面|约会|date/u.test(value)) return ['date'];
  return ['all'];
};

const promptOrder = (source: UnknownRecord): Map<string, { enabled: boolean; order: number }> => {
  const orders = Array.isArray(source.prompt_order) ? source.prompt_order : [];
  const order = orders
    .map(asRecord)
    .filter((item): item is UnknownRecord => Boolean(item))
    .map(item => Array.isArray(item.order) ? item.order : [])
    .find(items => items.length > 0) || [];
  return new Map(order.map((item, index) => {
    const record = asRecord(item) || {};
    return [text(record.identifier), { enabled: record.enabled !== false, order: index }];
  }).filter(([identifier]) => Boolean(identifier)) as [string, { enabled: boolean; order: number }][]);
};

export const importCreativeSchemeJson = (input: {
  json: string;
  fileName: string;
  now?: number;
}): CreativeScheme => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.json);
  } catch {
    throw new Error('这个文件不是有效的 JSON。');
  }
  const source = asRecord(parsed);
  const prompts = source && Array.isArray(source.prompts) ? source.prompts : [];
  if (!source || !prompts.length) {
    throw new Error('这不是可导入的创作方案：没有找到提示词条目。');
  }
  const orderById = promptOrder(source);
  const modules: CreativeSchemeModule[] = [];
  prompts.forEach((item, index) => {
    const prompt = asRecord(item);
    if (!prompt) return;
    const content = text(prompt.content);
    if (!content) return;
    const identifier = text(prompt.identifier) || `prompt-${index + 1}`;
    const name = text(prompt.name) || identifier;
    const ordered = orderById.get(identifier);
    const markerOnly = prompt.marker === true && content.length < 8;
    if (markerOnly) return;
    modules.push({
      id: `imported-module-${index + 1}-${identifier.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)}`,
      title: name,
      description: text(prompt.description),
      content,
      category: inferCategory(name, content),
      enabled: ordered?.enabled ?? prompt.enabled !== false,
      order: ordered?.order ?? index,
      surfaces: inferSurfaces(name, content),
      sourceIdentifier: identifier,
    });
  });
  if (!modules.length) throw new Error('这个方案里没有可读取的文字条目。');
  const now = input.now ?? Date.now();
  const fileBase = input.fileName.replace(/\.json$/iu, '').trim() || '导入方案';
  const temperatureValue = Number(source.temperature);
  const topPValue = Number(source.top_p);
  return createCreativeScheme({
    id: `creative-scheme:${now}`,
    name: text(source.name) || fileBase,
    description: `从“${input.fileName}”导入，可逐条检查与修改。`,
    source: 'imported',
    modules,
    modelHints: {
      temperature: Number.isFinite(temperatureValue) ? Math.min(2, Math.max(0, temperatureValue)) : undefined,
      topP: Number.isFinite(topPValue) ? Math.min(1, Math.max(0, topPValue)) : undefined,
    },
    importedFrom: input.fileName,
    now,
  });
};

export const categoryDescription = (category: CreativeSchemeCategory): string => (
  CREATIVE_SCHEME_CATEGORIES.find(item => item.id === category)?.description || ''
);
