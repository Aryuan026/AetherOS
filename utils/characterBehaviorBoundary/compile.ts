import type {
  APIConfig,
  CharacterProfile,
} from '../../types.ts';
import type { AiTaskProviderRef } from '../../domain/aiRuntime/types.ts';
import type { HistoryScope } from '../../domain/historyImport/types.ts';
import {
  CHARACTER_BEHAVIOR_COMPILATION_RECEIPT_VERSION,
  createPlayerCharacterBehaviorBoundaryRule,
  revisePlayerCharacterBehaviorBoundaryRule,
  type CharacterBehaviorCompilationCandidate,
  type CharacterBehaviorCompilationResult,
  type CharacterBehaviorCompilationSource,
  type CharacterBehaviorBoundaryRule,
} from '../../domain/characterBehaviorBoundary/index.ts';
import {
  extractContent,
  extractJson,
  safeFetchJson,
} from '../safeApi.ts';

const compact = (value: unknown, maxLength: number): string => (
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
);

const uniqueStrings = (
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.map(item => compact(item, maxLength)).filter(Boolean),
  )].slice(0, maxItems);
};

export const hashCharacterBehaviorCompilationText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeCandidate = (value: unknown): CharacterBehaviorCompilationCandidate => {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const createRule = source.createRule === true;
  const preferredAlternatives = uniqueStrings(
    source.preferredAlternatives,
    3,
    180,
  );
  const mismatchPattern = compact(source.mismatchPattern, 220);
  if (createRule && (!mismatchPattern || preferredAlternatives.length === 0)) {
    throw new Error('系统主持没有返回完整的行为要求，可以稍后重试。');
  }
  return {
    createRule,
    trigger: compact(source.trigger, 180),
    mismatchPattern,
    preferredAlternatives,
    exceptions: uniqueStrings(source.exceptions, 3, 160),
    activation: source.activation === 'resident'
      ? 'resident'
      : 'relevance_required',
    diagnostic: compact(source.diagnostic, 160) || undefined,
  };
};

const buildCompilerPrompt = (input: {
  char: CharacterProfile;
  playerNote: string;
  currentUserTurn?: string;
  rejectedReply?: string;
}): string => {
  const roleContext = [
    input.char.description,
    input.char.systemPrompt,
    input.char.worldview,
  ].filter(Boolean).join('\n').slice(0, 5_000);
  const currentTurn = compact(input.currentUserTurn, 800) || '（未提供）';
  const rejectedReply = compact(input.rejectedReply, 1_200) || '（未提供）';
  return `你是 AetherOS 的系统主持 AI。玩家正在指出一次角色扮演中不满意的行为。

你的任务不是替角色回复，也不是评判玩家，而是把这句自然语言整理成一条轻量、可复用、可编辑的“角色行为要求”候选。

## 角色资料（只用于判断怎样保留角色自身的处理空间）
角色：${input.char.name}
${roleContext || '（没有额外角色资料）'}

## 玩家写下的不满意原因
${input.playerNote}

## 当时的用户消息
${currentTurn}

## 被放弃的回复
${rejectedReply}

## 编译原则
1. 保留玩家的真实意图，不替玩家增加新的价值要求、关系阶段或剧情事实。
2. mismatchPattern 只描述需要避免反复出现的模式；不要写成对角色人格的诊断。
3. preferredAlternatives 给 1–3 个“处理方向”，不能写固定台词、固定动作或唯一情绪。角色仍应保留自己的判断、自驱力、文风和现场发挥。
4. 只有真正跨场景都应遵守的边界才用 resident；厨房、拒绝、争执、亲密推进等有触发条件的要求用 relevance_required。
5. 一次偶然的事实错误、纯粹“这次没意思”、含义不足的“别这样”，若无法形成稳定规则，createRule=false。不要硬编。
6. 不得把这条候选写成记忆、当前心情、当前动机、工具权限或已经发生的剧情。
7. 只输出 JSON，不要解释，不要 Markdown。

输出格式：
{
  "createRule": true,
  "trigger": "什么时候相关；可以为空",
  "mismatchPattern": "需要避免重复出现的行为模式",
  "preferredAlternatives": ["保留角色主动性的处理方向"],
  "exceptions": [],
  "activation": "resident 或 relevance_required",
  "diagnostic": "createRule=false 时用一句话说明为何没有形成长期要求"
}`;
};

export const compilePlayerCharacterBehaviorBoundary = async (input: {
  requestId: string;
  char: CharacterProfile;
  source: CharacterBehaviorCompilationSource;
  playerNote: string;
  currentUserTurn?: string;
  rejectedReply?: string;
  relationshipScope?: HistoryScope;
  apiConfig: APIConfig;
  provider: AiTaskProviderRef;
  now?: number;
}): Promise<CharacterBehaviorCompilationResult> => {
  const playerNote = compact(input.playerNote, 1_200);
  if (!playerNote) throw new Error('先写下这次哪里让你不满意。');
  if (input.relationshipScope?.charId && input.relationshipScope.charId !== input.char.id) {
    throw new Error('行为要求编译不能跨角色关系。');
  }
  const prompt = buildCompilerPrompt({
    char: input.char,
    playerNote,
    currentUserTurn: input.currentUserTurn,
    rejectedReply: input.rejectedReply,
  });
  const baseUrl = input.apiConfig.baseUrl.replace(/\/+$/, '');
  const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiConfig.apiKey || 'sk-none'}`,
    },
    body: JSON.stringify({
      model: input.apiConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 700,
      stream: false,
    }),
    aetherHandledFailure: true,
  });
  const raw = extractContent(data);
  const candidate = normalizeCandidate(extractJson(raw));
  const now = input.now ?? Date.now();
  const rule = candidate.createRule
    ? createPlayerCharacterBehaviorBoundaryRule({
        id: `player-boundary-compiled-${input.char.id}-${now.toString(36)}`,
        charId: input.char.id,
        inputMode: 'guided',
        trigger: candidate.trigger,
        mismatchPattern: candidate.mismatchPattern,
        preferredAlternatives: candidate.preferredAlternatives,
        exceptions: candidate.exceptions,
        resident: candidate.activation === 'resident',
        now,
      })
    : null;
  const outputHash = hashCharacterBehaviorCompilationText(JSON.stringify(candidate));
  return {
    candidate,
    rule,
    receipt: {
      schemaVersion: CHARACTER_BEHAVIOR_COMPILATION_RECEIPT_VERSION,
      id: `behavior-compile-receipt-${input.char.id}-${now.toString(36)}`,
      requestId: input.requestId,
      taskId: 'behavior_boundary_compilation',
      charId: input.char.id,
      relationshipScope: input.relationshipScope
        ? { ...input.relationshipScope }
        : undefined,
      source: input.source,
      provider: { ...input.provider },
      inputHash: hashCharacterBehaviorCompilationText([
        input.char.id,
        playerNote,
        compact(input.currentUserTurn, 800),
        compact(input.rejectedReply, 1_200),
      ].join('\n')),
      outputHash,
      ruleId: rule?.id,
      status: rule ? 'compiled' : 'no_stable_rule',
      truthEffect: 'none',
      memoryEffect: 'none',
      currentStateEffect: 'none',
      createdAt: now,
    },
  };
};

const ruleSignature = (rule: CharacterBehaviorBoundaryRule): string => (
  [
    rule.source.playerInputMode,
    compact(rule.trigger, 180).toLowerCase(),
    compact(rule.mismatchPattern, 220).toLowerCase(),
  ].join('::')
);

/**
 * Exact-signature repeats revise the existing player rule instead of growing
 * a duplicate pile. Similar-but-not-identical rules remain separate and
 * editable; semantic merging belongs to a later explicit review pass.
 */
export const integrateCompiledCharacterBehaviorRule = (input: {
  records: readonly CharacterBehaviorBoundaryRule[];
  candidate: CharacterBehaviorBoundaryRule;
  now?: number;
}): {
  records: CharacterBehaviorBoundaryRule[];
  acceptedRule: CharacterBehaviorBoundaryRule;
  revisedExisting: boolean;
} => {
  const signature = ruleSignature(input.candidate);
  const previous = input.records.find(rule => (
    rule.source.authority === 'player_authored'
    && ruleSignature(rule) === signature
  ));
  if (!previous) {
    return {
      records: [...input.records, input.candidate],
      acceptedRule: input.candidate,
      revisedExisting: false,
    };
  }
  const acceptedRule = revisePlayerCharacterBehaviorBoundaryRule(previous, {
    inputMode: 'guided',
    trigger: input.candidate.trigger,
    mismatchPattern: input.candidate.mismatchPattern,
    preferredAlternatives: input.candidate.preferredAlternatives,
    exceptions: input.candidate.exceptions,
    resident: input.candidate.retrieval.activationPolicy === 'resident',
  }, input.now);
  return {
    records: input.records.map(rule => (
      rule.id === previous.id ? acceptedRule : rule
    )),
    acceptedRule,
    revisedExisting: true,
  };
};
