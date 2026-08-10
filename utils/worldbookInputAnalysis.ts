import type { APIConfig } from '../types.ts';
import type { AiTaskProviderRef } from '../domain/aiRuntime/types.ts';
import type { WorldbookImportDraft } from './worldbookImport.ts';
import { extractContent, extractJson, safeFetchJson } from './safeApi.ts';

export type WorldbookInputAnalysisMode = 'single' | 'group';

export interface WorldbookInputAnalysisResult {
  suggestedGroupName: string;
  drafts: WorldbookImportDraft[];
}

const compact = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, maxLength) : ''
);

const normalizeResult = (
  value: unknown,
  mode: WorldbookInputAnalysisMode,
): WorldbookInputAnalysisResult => {
  if (!value || typeof value !== 'object') throw new Error('系统主持没有返回可用的世界书结构。');
  const source = value as { suggestedGroupName?: unknown; entries?: unknown };
  if (!Array.isArray(source.entries)) throw new Error('系统主持没有返回世界书条目。');
  const maxItems = mode === 'single' ? 1 : 16;
  const entries = source.entries.slice(0, maxItems).map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`第 ${index + 1} 条整理结果不完整。`);
    const record = entry as Record<string, unknown>;
    const title = compact(record.title, 120);
    const content = typeof record.content === 'string' ? record.content.trim().slice(0, 8_000) : '';
    if (!title || !content) throw new Error(`第 ${index + 1} 条整理结果缺少标题或正文。`);
    const activationHint = compact(record.activationHint, 240);
    const aliases = Array.isArray(record.aliases)
      ? [...new Set(record.aliases.map(item => compact(item, 60)).filter(Boolean))].slice(0, 10)
      : [];
    return {
      clientId: `worldbook-ai-${index + 1}`,
      title,
      content,
      category: '',
      activationHint: activationHint || undefined,
      aliases: aliases.length ? aliases : undefined,
      publicationStatus: 'published' as const,
      sourceLabel: 'AI 整理 · 保存前可修改',
    };
  });
  if (!entries.length) throw new Error('这段文字暂时没有整理出世界书条目。');
  if (mode === 'single' && entries.length !== 1) throw new Error('系统主持没有按“一条”模式返回结果。');
  return {
    suggestedGroupName: compact(source.suggestedGroupName, 80) || entries[0].title,
    drafts: entries,
  };
};

const buildPrompt = (source: string, mode: WorldbookInputAnalysisMode): string => `你是 AetherOS 的世界书整理助手。请把玩家提供的文本整理成${mode === 'single' ? '一条完整世界书条目' : '一组互相独立、便于按话题取用的世界书条目'}。

整理原则：
1. 只整理玩家提供的资料，不自行续写剧情、不补充训练知识、不把推测当事实。
2. 保留专有名词、条件、例外、秘密的知情边界和因果关系；不要为了简短而改变含义。
3. 正文写成模型容易准确引用的自然说明，不加入命令模型表演的格式要求。
4. activationHint 只写这条资料何时相关的简短线索；aliases 只收真正可检索的别称。
5. ${mode === 'single' ? 'entries 必须且只能有 1 条。' : 'entries 最多 16 条；不要把一句话机械拆成很多碎片。'}
6. suggestedGroupName 是人类能看懂的短分组名。
7. 只输出 JSON，不要 Markdown 或解释。

输出格式：
{
  "suggestedGroupName": "分组名",
  "entries": [
    { "title": "标题", "content": "正文", "activationHint": "相关话题", "aliases": ["别称"] }
  ]
}

玩家提供的资料：
${source}`;

export const analyzeWorldbookInput = async (input: {
  source: string;
  mode: WorldbookInputAnalysisMode;
  apiConfig: APIConfig;
  provider: AiTaskProviderRef;
}): Promise<WorldbookInputAnalysisResult> => {
  const source = input.source.trim();
  if (!source) throw new Error('先放进想整理的设定资料。');
  if (source.length > 24_000) throw new Error('这次文字有点长，请分成几批整理。');
  if (input.provider.role !== 'system_director') throw new Error('世界书整理必须由系统主持处理。');
  const baseUrl = input.apiConfig.baseUrl.replace(/\/+$/u, '');
  const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiConfig.apiKey || 'sk-none'}`,
    },
    body: JSON.stringify({
      model: input.apiConfig.model,
      messages: [{ role: 'user', content: buildPrompt(source, input.mode) }],
      temperature: 0.2,
      max_tokens: input.mode === 'single' ? 1_200 : 4_000,
      stream: false,
    }),
    aetherHandledFailure: true,
  });
  return normalizeResult(extractJson(extractContent(data)), input.mode);
};
