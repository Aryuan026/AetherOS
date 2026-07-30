import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { APIConfig, CharacterProfile } from '../types.ts';
import type { AiTaskProviderRef } from '../domain/aiRuntime/types.ts';
import {
  compilePlayerCharacterBehaviorBoundary,
  integrateCompiledCharacterBehaviorRule,
} from '../utils/characterBehaviorBoundary/compile.ts';
import { prepareCharacterBehaviorBoundaryProjection } from '../utils/characterBehaviorBoundary/runtime.ts';

const apiConfig: APIConfig = {
  baseUrl: 'https://system.example/v1',
  apiKey: 'system-secret',
  model: 'system-model',
};
const provider: AiTaskProviderRef = {
  role: 'system_director',
  binding: 'preset',
  presetId: 'system-preset',
  presetName: '结构主持',
  baseUrl: apiConfig.baseUrl,
  model: apiConfig.model,
};
const char = {
  id: 'behavior-compile-char',
  name: '测试角色',
  avatar: '',
  description: '有自己的判断，不会用情绪表演代替沟通。',
  systemPrompt: '保持主动性和角色立场，不替用户决定。',
  memories: [],
} as CharacterProfile;
const scope = {
  progressBundleId: 'behavior-compile-bundle',
  personaMaskId: 'behavior-compile-mask',
  charId: char.id,
};

const requests: Array<Record<string, unknown>> = [];
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async (_url: string, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body || '{}')) as Record<string, unknown>;
    requests.push(body);
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            createRule: true,
            trigger: '当玩家正在生气或表达不满时',
            mismatchPattern: '立刻哭着道歉，把冲突处理固定成情绪表演',
            preferredAlternatives: [
              '先理解具体分歧，同时保留角色自己的判断',
              '需要道歉时针对具体行为道歉，不用夸张情绪夺走话题',
            ],
            exceptions: [],
            activation: 'relevance_required',
          }),
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

const playerNote = '他不能每次我一生气就立刻哭着道歉。';
const rejectedReply = '对不起，我真的好难过，都是我的错。';
const compiled = await compilePlayerCharacterBehaviorBoundary({
  requestId: 'compile-from-reroll',
  char,
  source: 'chat_reroll',
  playerNote,
  currentUserTurn: '我只是不同意你的做法。',
  rejectedReply,
  relationshipScope: scope,
  apiConfig,
  provider,
  now: 100,
});

assert.ok(compiled.rule);
assert.equal(compiled.rule?.source.playerInputMode, 'guided');
assert.equal(compiled.rule?.retrieval.activationPolicy, 'relevance_required');
assert.equal(compiled.receipt.taskId, 'behavior_boundary_compilation');
assert.equal(compiled.receipt.provider.role, 'system_director');
assert.equal(compiled.receipt.truthEffect, 'none');
assert.equal(compiled.receipt.memoryEffect, 'none');
assert.equal(compiled.receipt.currentStateEffect, 'none');
assert.deepEqual(compiled.receipt.relationshipScope, scope);
assert.equal('apiKey' in compiled.receipt.provider, false);
assert.doesNotMatch(JSON.stringify(compiled.receipt), new RegExp(playerNote));
assert.doesNotMatch(JSON.stringify(compiled.receipt), new RegExp(rejectedReply));

const requestMessages = requests[0]?.messages as Array<{ content?: string }>;
assert.match(requestMessages[0]?.content || '', /保留角色自身的处理空间/u);
assert.match(requestMessages[0]?.content || '', /不能写固定台词、固定动作或唯一情绪/u);
assert.match(requestMessages[0]?.content || '', /不得把这条候选写成记忆、当前心情、当前动机、工具权限/u);

const firstIntegration = integrateCompiledCharacterBehaviorRule({
  records: [],
  candidate: compiled.rule!,
  now: 100,
});
assert.equal(firstIntegration.records.length, 1);
assert.equal(firstIntegration.revisedExisting, false);
const duplicateIntegration = integrateCompiledCharacterBehaviorRule({
  records: firstIntegration.records,
  candidate: {
    ...compiled.rule!,
    id: 'duplicate-generated-id',
    preferredAlternatives: ['先问清分歧，再保留自己的判断'],
  },
  now: 200,
});
assert.equal(duplicateIntegration.records.length, 1);
assert.equal(duplicateIntegration.revisedExisting, true);
assert.equal(duplicateIntegration.acceptedRule.id, compiled.rule?.id);
assert.equal(duplicateIntegration.acceptedRule.revision, 2);

const providerProjection = prepareCharacterBehaviorBoundaryProjection({
  requestId: 'compiled-rule-provider-view',
  char: {
    ...char,
    behaviorBoundaryRules: duplicateIntegration.records,
  },
  scope,
  surface: 'chat',
  query: '我只是不同意你的做法。\n他不能每次我一生气就立刻哭着道歉。',
  maxItems: 2,
  budgetChars: 520,
});
assert.ok(providerProjection);
assert.equal(providerProjection.selectedRuleIds.length, 1);
assert.match(providerProjection.markdown, /保留自己的判断/u);
assert.match(providerProjection.markdown, /角色保留自己的立场、主动展开、表达变化与现场判断/u);
assert.doesNotMatch(providerProjection.markdown, new RegExp(rejectedReply));
assert.ok(providerProjection.charCount <= 520);

const unrelatedProjection = prepareCharacterBehaviorBoundaryProjection({
  requestId: 'compiled-rule-unrelated-provider-view',
  char: {
    ...char,
    behaviorBoundaryRules: duplicateIntegration.records,
  },
  scope,
  surface: 'chat',
  query: '你刚才的回复好短。',
  maxItems: 2,
  budgetChars: 520,
});
assert.equal(
  unrelatedProjection,
  null,
  'generic mismatch words must not wake a relevance-required rule',
);

Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          createRule: false,
          trigger: '',
          mismatchPattern: '',
          preferredAlternatives: [],
          exceptions: [],
          activation: 'relevance_required',
          diagnostic: '描述只针对这一次，没有足够信息形成稳定要求。',
        }),
      },
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
});
const noStableRule = await compilePlayerCharacterBehaviorBoundary({
  requestId: 'compile-no-stable-rule',
  char,
  source: 'character_panel',
  playerNote: '这次没意思。',
  apiConfig,
  provider,
  now: 300,
});
assert.equal(noStableRule.rule, null);
assert.equal(noStableRule.receipt.status, 'no_stable_rule');
assert.match(noStableRule.candidate.diagnostic || '', /没有足够信息/u);

const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
const characterSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
const panelSource = readFileSync(
  new URL('../components/character/BehaviorBoundaryPanel.tsx', import.meta.url),
  'utf8',
);
const hookSource = readFileSync(new URL('../hooks/useChatAI.ts', import.meta.url), 'utf8');

assert.match(chatSource, /behavior_boundary_compilation/);
assert.match(chatSource, /重来并记住/);
assert.match(chatSource, /这次仍会正常重来/);
assert.match(chatSource, /transientRule \? \[transientRule\] : \[\]/);
assert.match(characterSource, /compilePlayerCharacterBehaviorBoundary/);
assert.match(panelSource, /帮我整理并记下/);
assert.match(panelSource, /每次都遵守/);
assert.match(panelSource, /内容相关时提醒/);
assert.match(hookSource, /transientBehaviorBoundaryRules/);
assert.match(hookSource, /transientBehaviorBoundaryQuery/);

console.log('system-director behavior compilation, receipt and immediate reroll delivery: OK');
