import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import {
  BUILT_IN_DEEPSPACE_LISHEN_ID,
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
  BUILT_IN_DEEPSPACE_SHENXINGHUI_ID,
  BUILT_IN_DEEPSPACE_XIAYIZHOU_ID,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';
import {
  builtInDeepspaceRetrievalCalibrationForCharacter,
} from '../domain/companionMaterial/builtInDeepspaceRetrievalCalibration.ts';
import {
  formatCompanionMaterialPromptMarkdown,
  projectCompanionMaterialPrompt,
} from '../domain/companionMaterial/promptProjection.ts';
import {
  selectCompanionMaterialFromRecords,
} from '../domain/companionMaterial/selection.ts';
import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialSelectionRequest,
} from '../domain/companionMaterial/types.ts';
import {
  buildCallCompanionMaterialRequest,
  buildChatCompanionMaterialRequest,
  buildDateOpeningCompanionMaterialRequest,
  buildWakeupCompanionMaterialRequest,
} from '../utils/companionMaterial/requestBuilders.ts';
import {
  buildCompanionInteractionQualityProjection,
} from '../domain/companionMaterial/interactionQuality.ts';
import {
  buildCallModelFacingMessages,
  buildCallPrompt,
} from '../utils/callModelMessages.ts';
import {
  buildCompanionWakeupModelMessages,
} from '../utils/companionWakeupModelMessages.ts';
import {
  buildDateOpeningModelMessages,
} from '../utils/dateOpeningModelMessages.ts';

const NOW = Date.UTC(2026, 6, 30, 9, 0, 0);
const OUTPUT = process.env.AETHEROS_MODEL_CONTEXT_AUDIT
  || '/tmp/aetheros-built-in-model-facing-messages.json';
const CHARACTERS = [
  { charId: BUILT_IN_DEEPSPACE_QIYU_ID, name: '祁煜', query: '这盏灯落在杯子上的反光很好看。' },
  { charId: BUILT_IN_DEEPSPACE_LISHEN_ID, name: '黎深', query: '两个安排撞在一起了，我想先理清条件。' },
  { charId: BUILT_IN_DEEPSPACE_SHENXINGHUI_ID, name: '沈星回', query: '我们假装这把伞有一条奇怪规则。' },
  { charId: BUILT_IN_DEEPSPACE_QINCHE_ID, name: '秦彻', query: '两个方案都能走，只是代价不一样。' },
  { charId: BUILT_IN_DEEPSPACE_XIAYIZHOU_ID, name: '夏以昼', query: '来打个赌，输的人负责买甜点。' },
] as const;
const QUALITY_CASES = [
  { id: 'agency_and_refusal', query: '这次我不想去，也不用劝我。' },
  { id: 'care_without_control', query: '今天有点头疼，但我还能聊。' },
  { id: 'pause_and_reentry', query: '先不说了，我们换个话题。' },
] as const;

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
    throw new Error('model-facing payload verification must not call a provider');
  },
});

const osModule = await import('../context/OSContext.tsx') as unknown as {
    getDefaultBuiltInCharacter: (charId: string) => Record<string, unknown> | undefined;
};
const chatModule = await import('../utils/chatPrompts.ts') as unknown as {
    ChatPrompts: {
      buildSystemPrompt: (...args: unknown[]) => Promise<string>;
      buildMessageHistory: (...args: unknown[]) => {
        apiMessages: readonly { role: string; content: unknown }[];
      };
      buildModelFacingMessages: (input: {
        systemPrompt: string;
        apiMessages: readonly { role: string; content: unknown }[];
        bilingualActive?: boolean;
      }) => {
        messages: readonly { role: string; content: unknown }[];
      };
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
    id: 'model-context-user',
    name: 'User',
    avatar: '',
    bio: '普通自设身份；没有额外关系事实。',
    personaMasks: [],
    activePersonaMaskId: '',
    progressBundles: [],
  };
  const scope = (charId: string) => ({
    progressBundleId: 'model-context-bundle',
    personaMaskId: 'model-context-mask',
    charId,
  });
  const select = (
    charId: string,
    request: Omit<CompanionMaterialSelectionRequest, 'schemaVersion'>,
  ) => {
    const selection = selectCompanionMaterialFromRecords({
      records: builtInDeepspaceRetrievalCalibrationForCharacter(charId),
      receipts: [],
      request: {
        ...request,
        schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      },
    });
    const projection = projectCompanionMaterialPrompt({
      source: selection,
      surface: request.surface,
      mode: request.mode,
      purpose: request.purpose,
      budgetChars: request.budgetChars,
    });
    return {
      selection,
      markdown: formatCompanionMaterialPromptMarkdown(projection),
    };
  };
  const countOccurrences = (haystack: string, needle: string): number => (
    needle ? haystack.split(needle).length - 1 : 0
  );
  const stripMaterial = (system: string, markdown: string): string => (
    system.replace(markdown, '').replace(/\n{3,}/g, '\n\n').trim()
  );
  const assertPair = (input: {
    label: string;
    material: string;
    withMaterial: readonly { role: string; content: unknown }[];
    withoutMaterial: readonly { role: string; content: unknown }[];
    liveNeedle: string;
  }) => {
    assert.ok(input.material, `${input.label} must carry one bounded context block`);
    assert.equal(input.withMaterial.length, input.withoutMaterial.length);
    assert.deepEqual(
      input.withMaterial.slice(1),
      input.withoutMaterial.slice(1),
      `${input.label} material must not rewrite live/history messages`,
    );
    const withSystem = String(input.withMaterial[0]?.content || '');
    const withoutSystem = String(input.withoutMaterial[0]?.content || '');
    assert.equal(countOccurrences(withSystem, input.material), 1);
    assert.equal(withoutSystem.includes(input.material), false);
    assert.equal(
      stripMaterial(withSystem, input.material),
      stripMaterial(withoutSystem, ''),
      `${input.label} system delta must be exactly one material block`,
    );
    assert.equal(withSystem.includes('### 你的身份 (Character)'), true);
    assert.equal(
      input.withMaterial.slice(1).some(message => (
        String(message.content || '').includes(input.liveNeedle)
      )),
      true,
      `${input.label} must preserve the live turn or trigger`,
    );
    assert.equal(
      /sourceRefs|sourceFingerprint|sourcePackId|currentMotives|固定回复|照着说/u
        .test(withSystem),
      false,
      `${input.label} must not leak private refs or rigid reply instructions`,
    );
  };

  const snapshots: unknown[] = [];
  for (const character of CHARACTERS) {
    const char = osModule.getDefaultBuiltInCharacter(character.charId);
    assert.ok(char, `missing built-in character ${character.charId}`);
    const coreContext = contextModule.ContextBuilder.buildCoreContext(
      char,
      userProfile,
      false,
    );
    const chatRequest = buildChatCompanionMaterialRequest({
      requestId: `model-facing:chat:${character.charId}`,
      scope: scope(character.charId),
      refId: `live-turn:${character.charId}`,
      query: character.query,
      occurredAt: NOW,
    });
    const chatMaterial = select(character.charId, chatRequest);
    const liveMessages = [{
      id: 1,
      charId: character.charId,
      role: 'user',
      type: 'text',
      content: character.query,
      timestamp: NOW,
      metadata: { source: 'chat', temporalClass: 'live' },
    }];
    const chatHistory = chatModule.ChatPrompts.buildMessageHistory(
      liveMessages,
      20,
      char,
      userProfile,
      [],
    ).apiMessages;
    const chatSystemWithout = await chatModule.ChatPrompts.buildSystemPrompt(
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
    const chatSystemWith = await chatModule.ChatPrompts.buildSystemPrompt(
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
        companionMaterialContext: chatMaterial.markdown,
      },
    );
    const chatWithout = chatModule.ChatPrompts.buildModelFacingMessages({
      systemPrompt: chatSystemWithout,
      apiMessages: chatHistory,
    }).messages;
    const chatWith = chatModule.ChatPrompts.buildModelFacingMessages({
      systemPrompt: chatSystemWith,
      apiMessages: chatHistory,
    }).messages;
    assertPair({
      label: `${character.name}:chat`,
      material: chatMaterial.markdown,
      withMaterial: chatWith,
      withoutMaterial: chatWithout,
      liveNeedle: character.query,
    });
    const qualitySnapshots = [];
    for (const qualityCase of QUALITY_CASES) {
      const quality = buildCompanionInteractionQualityProjection({
        charId: character.charId,
        query: qualityCase.query,
        surface: 'chat',
        mode: 'remote_chat',
        purpose: 'stable_context',
      });
      assert.ok(quality, `${character.name}:${qualityCase.id} must project`);
      assert.equal(quality.qualityId, qualityCase.id);
      const qualityLiveMessages = [{
        id: 2,
        charId: character.charId,
        role: 'user',
        type: 'text',
        content: qualityCase.query,
        timestamp: NOW + 1,
        metadata: { source: 'chat', temporalClass: 'live' },
      }];
      const qualityHistory = chatModule.ChatPrompts.buildMessageHistory(
        qualityLiveMessages,
        20,
        char,
        userProfile,
        [],
      ).apiMessages;
      const qualitySystemWithout = await chatModule.ChatPrompts.buildSystemPrompt(
        char,
        userProfile,
        [],
        [],
        [],
        qualityLiveMessages,
        undefined,
        '',
        { replyMode: 'preserve', delivery: 'interactive' },
      );
      const qualitySystemWith = await chatModule.ChatPrompts.buildSystemPrompt(
        char,
        userProfile,
        [],
        [],
        [],
        qualityLiveMessages,
        undefined,
        '',
        {
          replyMode: 'preserve',
          delivery: 'interactive',
          interactionQualityContext: quality.markdown,
        },
      );
      const qualityWithout = chatModule.ChatPrompts.buildModelFacingMessages({
        systemPrompt: qualitySystemWithout,
        apiMessages: qualityHistory,
      }).messages;
      const qualityWith = chatModule.ChatPrompts.buildModelFacingMessages({
        systemPrompt: qualitySystemWith,
        apiMessages: qualityHistory,
      }).messages;
      assertPair({
        label: `${character.name}:quality:${qualityCase.id}`,
        material: quality.markdown,
        withMaterial: qualityWith,
        withoutMaterial: qualityWithout,
        liveNeedle: qualityCase.query,
      });
      assert.equal(/共同底色：|角色落法：/u.test(quality.markdown), false);
      qualitySnapshots.push({
        qualityId: quality.qualityId,
        renderedHash: quality.renderedHash,
        withQuality: qualityWith,
        withoutQuality: qualityWithout,
      });
    }

    const callRequest = buildCallCompanionMaterialRequest({
      requestId: `model-facing:call:${character.charId}`,
      scope: scope(character.charId),
      refId: `call:${character.charId}`,
      query: '',
      occurredAt: NOW,
      opening: true,
      automaticOpening: true,
    });
    const callMaterial = select(character.charId, callRequest);
    const callHistory = [{ role: 'user', content: '通话刚接通，请先开口。' }];
    const callWithout = buildCallModelFacingMessages({
      systemPrompt: buildCallPrompt({
        userName: 'User',
        charName: character.name,
        coreContext,
        callScene: '清晨 · 通话已接通',
      }),
      historyMessages: callHistory,
    });
    const callWith = buildCallModelFacingMessages({
      systemPrompt: buildCallPrompt({
        userName: 'User',
        charName: character.name,
        coreContext: `${coreContext}\n${callMaterial.markdown}`,
        callScene: '清晨 · 通话已接通',
      }),
      historyMessages: callHistory,
    });
    assertPair({
      label: `${character.name}:call-opening`,
      material: callMaterial.markdown,
      withMaterial: callWith,
      withoutMaterial: callWithout,
      liveNeedle: '通话刚接通',
    });

    const dateRequest = buildDateOpeningCompanionMaterialRequest({
      requestId: `model-facing:date:${character.charId}`,
      scope: scope(character.charId),
      sceneRefId: `date:${character.charId}`,
      occurredAt: NOW,
    });
    const dateMaterial = select(character.charId, dateRequest);
    const dateBase = {
      characterName: character.name,
      coreContext,
      recentContext: 'user: 我到了。',
      timeText: 'Fri 09:00',
      experienceBoundary: dateExperienceModule.DATE_EXPERIENCE_BOUNDARY,
    };
    const dateWithout = buildDateOpeningModelMessages(dateBase);
    const dateWith = buildDateOpeningModelMessages({
      ...dateBase,
      companionMaterialContext: dateMaterial.markdown,
    });
    assertPair({
      label: `${character.name}:date-opening`,
      material: dateMaterial.markdown,
      withMaterial: dateWith,
      withoutMaterial: dateWithout,
      liveNeedle: '我到了',
    });

    const wakeupRequest = buildWakeupCompanionMaterialRequest({
      requestId: `model-facing:wakeup:${character.charId}`,
      scope: scope(character.charId),
      ruleRefId: `wakeup:${character.charId}`,
      query: '想到一个轻松的话题，主动发一条消息。',
      occurredAt: NOW,
      carePriority: false,
      ruleKind: 'natural',
    });
    const wakeupMaterial = select(character.charId, wakeupRequest);
    const wakeupBase = {
      coreContext,
      timeText: '2026-07-30 09:00',
      userName: 'User',
      ruleTitle: '自然想起',
      ruleValue: '想到一个轻松的话题',
      visibleRecent: 'User: 今天阳光很好。',
    };
    const wakeupWithout = buildCompanionWakeupModelMessages(wakeupBase);
    const wakeupWith = buildCompanionWakeupModelMessages({
      ...wakeupBase,
      companionMaterialContext: wakeupMaterial.markdown,
    });
    assertPair({
      label: `${character.name}:wakeup`,
      material: wakeupMaterial.markdown,
      withMaterial: wakeupWith,
      withoutMaterial: wakeupWithout,
      liveNeedle: '今天阳光很好',
    });

    snapshots.push({
      character: character.name,
      charId: character.charId,
      cases: {
        chat: {
          selectedMaterialIds: chatMaterial.selection.selectedMaterialIds,
          withMaterial: chatWith,
          withoutMaterial: chatWithout,
        },
        interactionQuality: qualitySnapshots,
        callOpening: {
          selectedMaterialIds: callMaterial.selection.selectedMaterialIds,
          withMaterial: callWith,
          withoutMaterial: callWithout,
        },
        dateOpening: {
          selectedMaterialIds: dateMaterial.selection.selectedMaterialIds,
          withMaterial: dateWith,
          withoutMaterial: dateWithout,
        },
        wakeup: {
          selectedMaterialIds: wakeupMaterial.selection.selectedMaterialIds,
          withMaterial: wakeupWith,
          withoutMaterial: wakeupWithout,
        },
      },
    });
  }

  await writeFile(OUTPUT, `${JSON.stringify({
    generatedAt: new Date(NOW).toISOString(),
    capability: 'request_ready_model_facing_payload',
    providerCalled: false,
    receiptWritten: false,
    cases: snapshots,
  }, null, 2)}\n`, 'utf8');
console.log(
  `built-in model-facing messages: green cases=35 provider=not-called receipt=none output=${OUTPUT}`,
);
