import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';
import { createPlayerCharacterBehaviorBoundaryRule } from '../domain/characterBehaviorBoundary/playerRule.ts';
import { prepareCharacterBehaviorBoundaryProjection } from '../utils/characterBehaviorBoundary/runtime.ts';
import { buildDateOpeningModelMessages } from '../utils/dateOpeningModelMessages.ts';

const NOW = Date.UTC(2026, 6, 30, 10, 0, 0);
const OUTPUT = process.env.AETHEROS_BEHAVIOR_CONTEXT_AUDIT
  || '/tmp/aetheros-character-behavior-provider-view.json';

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
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async () => {
    throw new Error('provider-view verification must not call a provider');
  },
});

const osModule = await import('../context/OSContext.tsx') as unknown as {
  getDefaultBuiltInCharacter: (charId: string) => Record<string, unknown> | undefined;
};
const chatModule = await import('../utils/chatPrompts.ts') as unknown as {
  ChatPrompts: {
    buildSystemPrompt: (...args: unknown[]) => Promise<string>;
  };
};
const contextModule = await import('../utils/context.ts') as unknown as {
  ContextBuilder: {
    buildCoreContext: (
      char: Record<string, unknown>,
      user: Record<string, unknown>,
      includeDetailedMemories?: boolean,
    ) => string;
  };
};
const dateExperienceModule = await import('../utils/dateExperience.ts') as unknown as {
  DATE_EXPERIENCE_BOUNDARY: string;
};

const userProfile = {
  id: 'behavior-provider-user',
  name: 'User',
  avatar: '',
  bio: '普通自设身份；没有额外关系事实。',
  personaMasks: [],
  activePersonaMaskId: '',
  progressBundles: [],
};
const scope = (charId: string) => ({
  progressBundleId: 'behavior-provider-bundle',
  personaMaskId: 'behavior-provider-mask',
  charId,
});

const CASES = [
  {
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    name: '祁煜',
    sceneQuery: '我们走进画室，画布边还放着没收起的颜料。',
    expectedMicro: 'micro-qiyu-material-led-creative-handling-v1',
  },
  {
    charId: BUILT_IN_DEEPSPACE_LISHEN_ID,
    name: '黎深',
    sceneQuery: '我们到了研究室，工作台上摊着一份记录。',
    expectedMicro: 'micro-lishen-notation-and-record-routine-v1',
  },
] as const;

const snapshots: unknown[] = [];
for (const fixture of CASES) {
  const baseChar = osModule.getDefaultBuiltInCharacter(fixture.charId);
  assert.ok(baseChar, `missing built-in ${fixture.name}`);
  const playerRule = createPlayerCharacterBehaviorBoundaryRule({
    id: `provider-player-boundary-${fixture.charId}`,
    charId: fixture.charId,
    inputMode: 'guided',
    kind: 'interaction_pattern',
    trigger: '当我明确拒绝一个提议时',
    mismatchPattern: '把同一个提议换个说法继续推进',
    preferredAlternatives: [
      '接住选择后保留自己的看法，让话题停住',
      '可以转向一条真正不同、也符合角色兴趣的线索',
      '在现场适合时，只给一句简短回应',
    ],
    now: NOW,
  });
  const char = {
    ...baseChar,
    behaviorBoundaryRules: [playerRule],
  };

  const playerBoundary = prepareCharacterBehaviorBoundaryProjection({
    requestId: `provider-chat:${fixture.charId}`,
    char: char as never,
    scope: scope(fixture.charId),
    surface: 'chat',
    query: '这次我不想去，也不用再劝我。',
    maxItems: 2,
    budgetChars: 520,
  });
  assert.ok(playerBoundary);
  assert.equal(playerBoundary.containsPlayerAuthored, true);
  assert.equal(playerBoundary.containsBuiltInSource, false);
  assert.equal(playerBoundary.selectedRuleIds.length, 1);
  assert.doesNotMatch(playerBoundary.markdown, /也可以可以/u);

  const liveMessages = [{
    id: 1,
    charId: fixture.charId,
    role: 'user',
    type: 'text',
    content: '这次我不想去，也不用再劝我。',
    timestamp: NOW,
    metadata: { source: 'chat', temporalClass: 'live' },
  }];
  const chatWithout = await chatModule.ChatPrompts.buildSystemPrompt(
    char,
    userProfile,
    [],
    [],
    [],
    liveMessages,
    undefined,
    '',
    { replyMode: 'preserve', delivery: 'interactive' },
  );
  const chatWith = await chatModule.ChatPrompts.buildSystemPrompt(
    char,
    userProfile,
    [],
    [],
    [],
    liveMessages,
    undefined,
    '',
    {
      replyMode: 'preserve',
      delivery: 'interactive',
      characterBehaviorBoundaryContext: playerBoundary.markdown,
    },
  );
  assert.equal(chatWith.split(playerBoundary.markdown).length - 1, 1);
  assert.equal(
    chatWith.replace(playerBoundary.markdown, '').replace(/\n{3,}/g, '\n\n').trim(),
    chatWithout.replace(/\n{3,}/g, '\n\n').trim(),
  );

  const sceneBoundary = prepareCharacterBehaviorBoundaryProjection({
    requestId: `provider-date:${fixture.charId}`,
    char: char as never,
    scope: scope(fixture.charId),
    surface: 'date_scene',
    query: fixture.sceneQuery,
    maxItems: 2,
    budgetChars: 560,
  });
  assert.ok(sceneBoundary);
  assert.ok(sceneBoundary.selectedRuleIds.includes(fixture.expectedMicro));
  assert.equal(sceneBoundary.containsBuiltInSource, true);
  assert.equal(sceneBoundary.containsPlayerAuthored, false);

  for (const projection of [playerBoundary, sceneBoundary]) {
    assert.ok(projection.charCount <= 560);
    assert.equal(
      /sourceRefs|sourcePackId|lysk-src|currentMotives|toolAllowlist|toolDenylist|固定回复|照着说|必须|严禁|不得/u
        .test(projection.markdown),
      false,
      `${fixture.name} behavior delta must remain non-verbatim and non-coercive`,
    );
  }

  const coreContext = contextModule.ContextBuilder.buildCoreContext(
    char,
    userProfile,
    false,
  );
  const dateMessages = buildDateOpeningModelMessages({
    characterName: fixture.name,
    coreContext,
    characterBehaviorBoundaryContext: sceneBoundary.markdown,
    recentContext: `user: ${fixture.sceneQuery}`,
    timeText: 'Fri 10:00',
    experienceBoundary: dateExperienceModule.DATE_EXPERIENCE_BOUNDARY,
  });
  assert.equal(dateMessages[0].content.split(sceneBoundary.markdown).length - 1, 1);
  assert.ok(dateMessages[1].content.includes(fixture.sceneQuery));

  snapshots.push({
    character: fixture.name,
    charId: fixture.charId,
    chat: {
      behaviorChars: playerBoundary.charCount,
      selectedRuleIds: playerBoundary.selectedRuleIds,
      fullSystemChars: chatWith.length,
      systemPrompt: chatWith,
    },
    dateScene: {
      behaviorChars: sceneBoundary.charCount,
      selectedRuleIds: sceneBoundary.selectedRuleIds,
      messages: dateMessages,
    },
  });
}

await writeFile(OUTPUT, `${JSON.stringify({
  generatedAt: new Date(NOW).toISOString(),
  capability: 'request_ready_behavior_calibration_provider_view',
  providerCalled: false,
  receiptWritten: false,
  cases: snapshots,
}, null, 2)}\n`, 'utf8');

console.log(
  `character behavior provider view: OK cases=${CASES.length * 2} provider=not-called output=${OUTPUT}`,
);
