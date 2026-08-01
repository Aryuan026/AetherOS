import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';
import {
  buildCompanionInteractionQualityProjection,
  builtInCompanionInteractionQualityRealizations,
  COMPANION_INTERACTION_QUALITY_PRINCIPLES,
  type CompanionInteractionQualityId,
} from '../domain/companionMaterial/interactionQuality.ts';
import { analyzeCompanionMaterialQuery } from '../domain/companionMaterial/retrieval.ts';
import {
  buildCallModelFacingMessages,
  buildCallPrompt,
} from '../utils/callModelMessages.ts';
import { buildCompanionWakeupModelMessages } from '../utils/companionWakeupModelMessages.ts';
import { buildDateSessionOutputContract } from '../utils/datePresentation.ts';

const CHARACTERS = [
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
] as const;

const CASES: readonly {
  query: string;
  expected: CompanionInteractionQualityId;
}[] = [
  { query: '这次我不想去，也不用劝我。', expected: 'agency_and_refusal' },
  { query: '今天有点头疼，但我还能聊。', expected: 'care_without_control' },
  { query: '先不说了，换个话题吧。', expected: 'pause_and_reentry' },
  { query: '我回来了，刚才去做了点别的。', expected: 'pause_and_reentry' },
  { query: '我只想聊聊天，不要给我建议。', expected: 'agency_and_refusal' },
] as const;

const projections = CHARACTERS.flatMap(charId => CASES.map(fixture => {
  const projection = buildCompanionInteractionQualityProjection({
    charId,
    query: fixture.query,
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
  });
  assert.ok(projection, `${charId}:${fixture.expected} must project`);
  assert.equal(projection.qualityId, fixture.expected);
  assert.equal(projection.truthEffect, 'none');
  assert.equal(projection.currentStateEffect, 'none');
  assert.equal(projection.toolPolicyEffect, 'none');
  assert.ok(projection.characterRealizationId, `${charId} must use reviewed realization`);
  assert.equal(
    /sourceRefs|sourceFingerprint|currentMotives|必须|严禁|绝不|不是|不必|不把|不凭空|不预设|不需要|不得|不能/u.test(projection.markdown),
    false,
    `${charId}:${fixture.expected} must stay positive and private-ref free`,
  );
  assert.equal(
    projection.markdown.split(projection.sharedPrinciple).length - 1,
    1,
    `${charId}:${fixture.expected} must render the shared baseline once`,
  );
  assert.equal(
    /共同底色：|角色落法：/u.test(projection.markdown),
    false,
    `${charId}:${fixture.expected} must not induce a shared-then-role response sequence`,
  );
  return projection;
}));

assert.equal(COMPANION_INTERACTION_QUALITY_PRINCIPLES.length, 3);
assert.equal(builtInCompanionInteractionQualityRealizations().length, 5);
assert.equal(
  new Set(builtInCompanionInteractionQualityRealizations()
    .map(item => item.byQualityId.agency_and_refusal)).size,
  5,
  'the five leads must realize the shared baseline differently',
);
for (const realization of builtInCompanionInteractionQualityRealizations()) {
  for (const [qualityId, text] of Object.entries(realization.byQualityId)) {
    assert.ok(
      (text.match(/[、，；或]/gu) || []).length >= 2,
      `${realization.charId}:${qualityId} must preserve several legal response actions`,
    );
  }
}

assert.equal(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    query: '今天看到一盏灯很好看。',
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
  }),
  null,
  'ordinary chat must not carry a permanent quality lecture',
);

const noAdviceWinsCare = buildCompanionInteractionQualityProjection({
  charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
  query: '我有点头疼，但只想聊聊，不要建议。',
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
});
assert.equal(noAdviceWinsCare?.qualityId, 'agency_and_refusal');

const customRole = buildCompanionInteractionQualityProjection({
  charId: 'custom-role',
  query: '这次我不想去。',
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
});
assert.ok(customRole);
assert.equal(customRole.characterRealizationId, undefined);
assert.match(customRole.characterRealization || '', /角色卡/u);

const adjacentRepeat = buildCompanionInteractionQualityProjection({
  charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
  query: '我还是不想去。',
  previousQuery: '这次我不想去。',
  surface: 'chat',
  mode: 'remote_chat',
  purpose: 'stable_context',
  occurredAt: 20 * 60 * 1000,
  previousOccurredAt: 10 * 60 * 1000,
});
assert.equal(adjacentRepeat, null, 'adjacent same-quality turns must rely on the live user text instead of repeating the system block');
for (const surface of ['call', 'date'] as const) {
  assert.equal(
    buildCompanionInteractionQualityProjection({
      charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
      query: '我还是不想去。',
      previousQuery: '这次我不想去。',
      surface,
      mode: surface === 'call' ? 'call' : 'date_scene',
      purpose: 'stable_context',
      occurredAt: 20 * 60 * 1000,
      previousOccurredAt: 10 * 60 * 1000,
    }),
    null,
    `${surface} must also suppress an adjacent repeat`,
  );
}
assert.ok(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
    query: '我回来了。',
    previousQuery: '让我静一静。',
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
    occurredAt: 20 * 60 * 1000,
    previousOccurredAt: 10 * 60 * 1000,
  }),
  'pause and reentry share a principle but are different live signals',
);
assert.ok(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
    query: '我还是不想去。',
    previousQuery: '这次我不想去。',
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
    occurredAt: 2 * 60 * 60 * 1000,
    previousOccurredAt: 0,
  }),
  'a long-gap boundary must not be suppressed as an adjacent repeat',
);

const pauseFeatures = analyzeCompanionMaterialQuery({ query: '先别问了，我们聊点别的。' });
assert.ok(pauseFeatures.signals.includes('pause_or_redirect'));
assert.ok(analyzeCompanionMaterialQuery({ query: '算了。' }).signals.includes('pause_or_redirect'));

for (const query of [
  '这个技术痛点怎么处理？',
  '我有点困惑这个 bug。',
  '他痛快地答应了。',
  '累积数据已经更新。',
  '我觉得 B 不想去。',
  '我说过 B 不方便去。',
  '我写的角色受伤了。',
  '我看 A 头疼得厉害。',
  '头疼的是世界书该怎么拆。',
]) {
  assert.equal(
    buildCompanionInteractionQualityProjection({
      charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
      query,
      surface: 'chat',
      mode: 'remote_chat',
      purpose: 'stable_context',
    }),
    null,
    `technical or compound-language fixture must not become care: ${query}`,
  );
}
assert.equal(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    query: '（看向 B）我不想去。',
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
  })?.qualityId,
  'agency_and_refusal',
  'a co-writing action wrapper must not hide the player’s own first-person boundary',
);
assert.equal(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    query: '我真的好累啊。',
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
  })?.qualityId,
  'care_without_control',
  'an explicit first-person discomfort must remain eligible',
);
for (const [query, qualityId] of [
  ['我跟你说，我不想去。', 'agency_and_refusal'],
  ['我告诉你，我头疼。', 'care_without_control'],
] as const) {
  assert.equal(
    buildCompanionInteractionQualityProjection({
      charId: BUILT_IN_DEEPSPACE_QIYU_ID,
      query,
      surface: 'chat',
      mode: 'remote_chat',
      purpose: 'stable_context',
    })?.qualityId,
    qualityId,
    `the nearest first-person clause must own its live signal: ${query}`,
  );
}
assert.equal(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
    query: 'B 不想去，A 说算了吧。',
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
  }),
  null,
  'multi-NPC co-writing text must not become the player boundary without first-person/direct evidence',
);

assert.equal(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
    query: '我不想去。',
    surface: 'storydesk',
    mode: 'story_planning',
    purpose: 'scene_planning',
  }),
  null,
  'future StoryDesk delivery remains HOLD until a real consumer exists',
);
assert.equal(
  buildCompanionInteractionQualityProjection({
    charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
    query: '今天有点头疼，但我还能聊。',
    surface: 'chat',
    mode: 'remote_chat',
    purpose: 'stable_context',
  })?.qualityId,
  'care_without_control',
  'a direct user discomfort signal must remain a valid positive path',
);

const careWakeup = buildCompanionInteractionQualityProjection({
  charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
  query: '午饭提醒',
  surface: 'proactive_letter',
  mode: 'proactive_letter',
  purpose: 'proactive_intent',
  explicitSignals: ['care_needed'],
});
assert.equal(careWakeup?.qualityId, 'care_without_control');

const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
    removeItem: (key: string) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    get length() {
      return memoryStorage.size;
    },
  },
});

const providerProjection = projections.find(item => (
  item.charId === BUILT_IN_DEEPSPACE_LISHEN_ID
  && item.qualityId === 'agency_and_refusal'
));
assert.ok(providerProjection);
const chatModule = await import('../utils/chatPrompts.ts');
const chatLiveMessage = {
  id: 1,
  charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
  role: 'user',
  type: 'text',
  content: '这次我不想去，也不用劝我。',
  timestamp: Date.UTC(2026, 6, 29, 12, 0, 0),
  metadata: { source: 'chat', temporalClass: 'live' },
};
const chatSystem = await chatModule.ChatPrompts.buildSystemPrompt(
  {
    id: BUILT_IN_DEEPSPACE_LISHEN_ID,
    name: '黎深',
    systemPrompt: '保持独立判断。',
    avatar: '',
    status: 'online',
  } as never,
  {
    id: 'user',
    name: 'User',
    avatar: '',
    personaMasks: [],
    progressBundles: [],
  } as never,
  [],
  [],
  [],
  [chatLiveMessage] as never,
  undefined,
  '',
  {
    replyMode: 'preserve',
    delivery: 'interactive',
    interactionQualityContext: providerProjection.markdown,
  },
);
const chatMessages = chatModule.ChatPrompts.buildModelFacingMessages({
  systemPrompt: chatSystem,
  apiMessages: [{ role: 'user', content: chatLiveMessage.content }],
}).messages;
assert.equal(String(chatMessages[0]?.content).includes(providerProjection.markdown), true);
assert.equal(String(chatMessages[1]?.content), chatLiveMessage.content);

const callMessages = buildCallModelFacingMessages({
  systemPrompt: buildCallPrompt({
    userName: 'User',
    charName: '黎深',
    coreContext: '### 你的身份 (Character)\n黎深',
    interactionQualityContext: providerProjection.markdown,
  }),
  historyMessages: [{ role: 'user', content: '这次我不想去，也不用劝我。' }],
});
assert.equal(String(callMessages[0]?.content).includes(providerProjection.markdown), true);
assert.equal(String(callMessages[1]?.content), '这次我不想去，也不用劝我。');

const wakeupMessages = buildCompanionWakeupModelMessages({
  coreContext: '### 你的身份 (Character)\n秦彻',
  interactionQualityContext: careWakeup?.markdown,
  timeText: '2026-07-29 12:00',
  userName: 'User',
  ruleTitle: '午饭提醒',
  visibleRecent: 'User: 今天有点忙。',
});
assert.equal(String(wakeupMessages[0]?.content).includes(careWakeup?.markdown || ''), true);
assert.equal(String(wakeupMessages[1]?.content).includes('今天有点忙'), true);

const dateVisualContract = buildDateSessionOutputContract('visual', ['normal', 'happy']);
const dateReadingContract = buildDateSessionOutputContract('reading');
for (const contract of [dateVisualContract, dateReadingContract]) {
  assert.match(contract.systemPrompt, /动作与叙述是可选的/u);
  assert.equal(
    /不要整段只用一个情绪|每一行动作\/叙述都应该|让每一行都有|每轮都必须写动作/u.test(contract.systemPrompt),
    false,
    `${contract.mode} date contract keeps scene detail optional rather than procedural`,
  );
}
const wakeupRuntimeSource = readFileSync(new URL('../hooks/useCompanionWakeupRuntime.ts', import.meta.url), 'utf8');
assert.match(
  wakeupRuntimeSource,
  /getRecentMessagesByCharId\(char\.id, 80\)\)\s*\.filter\(message => messageMatchesRelationshipScope\(message, relationshipScope\)\)/u,
);
assert.match(wakeupRuntimeSource, /filterCurrentStateMessages\(recent\)/u);
assert.match(wakeupRuntimeSource, /latestSentWakeupAt\(rule\.charId, relationshipScope\)/u);
assert.match(wakeupRuntimeSource, /latestRealUserMessageAt\(rule\.charId, relationshipScope\)/u);
const callAppSource = readFileSync(new URL('../apps/CallApp.tsx', import.meta.url), 'utf8');
assert.match(callAppSource, /qualityPreviousUserOverride/u);
assert.match(callAppSource, /bubbles\.slice\(0, idx - 1\)/u);

console.log(
  `companion interaction quality: green projections=${projections.length} shared=3 realizations=5 provider-consumers=chat,call,date-turn,wakeup storydesk=HOLD`,
);
