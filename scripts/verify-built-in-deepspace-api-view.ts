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
  type CompanionMaterialGroundingKind,
  type CompanionMaterialGroundingRef,
  type CompanionMaterialMode,
  type CompanionMaterialPurpose,
  type CompanionMaterialSelectionRequest,
  type CompanionMaterialSurface,
} from '../domain/companionMaterial/types.ts';
import {
  buildCallCompanionMaterialRequest,
  buildChatCompanionMaterialRequest,
  buildDateOpeningCompanionMaterialRequest,
  buildWakeupCompanionMaterialRequest,
} from '../utils/companionMaterial/requestBuilders.ts';

const NOW = 1_800_000_000_000;
const CHARACTERS = [
  { charId: BUILT_IN_DEEPSPACE_QIYU_ID, name: '祁煜' },
  { charId: BUILT_IN_DEEPSPACE_LISHEN_ID, name: '黎深' },
  { charId: BUILT_IN_DEEPSPACE_SHENXINGHUI_ID, name: '沈星回' },
  { charId: BUILT_IN_DEEPSPACE_QINCHE_ID, name: '秦彻' },
  { charId: BUILT_IN_DEEPSPACE_XIAYIZHOU_ID, name: '夏以昼' },
] as const;

const scope = (charId: string) => ({
  progressBundleId: 'api-view-bundle',
  personaMaskId: 'api-view-mask',
  charId,
});

const grounding = (
  charId: string,
  kind: CompanionMaterialGroundingKind,
  claimKey: string,
): CompanionMaterialGroundingRef => ({
  kind,
  claimKey,
  refId: `api-view:${kind}:${claimKey}:${charId}`,
  revision: 1,
  scope: scope(charId),
  occurredAt: NOW,
  validUntil: NOW + 60_000,
});

interface Scenario {
  id: string;
  surface: CompanionMaterialSurface;
  mode: CompanionMaterialMode;
  purpose: CompanionMaterialPurpose;
  query: string;
  semanticTags: readonly string[];
  grounding: readonly {
    kind: CompanionMaterialGroundingKind;
    claimKey: string;
  }[];
  maxItems: number;
  budgetChars: number;
  expectedSlots?: readonly string[];
  allowNone?: boolean;
  routeRef?: CompanionMaterialSelectionRequest['routeRef'];
}

const chatByCharacter: Record<string, Pick<Scenario, 'query' | 'semanticTags' | 'grounding'>> = {
  [BUILT_IN_DEEPSPACE_QIYU_ID]: {
    query: '这盏灯照在杯子上有一层彩色反光。',
    semanticTags: ['observation', 'sensory_detail'],
    grounding: [{ kind: 'live_user_turn', claimKey: 'observation' }],
  },
  [BUILT_IN_DEEPSPACE_LISHEN_ID]: {
    query: '两个安排撞在一起了，我想先理清条件再决定。',
    semanticTags: ['practical_next_step', 'observation'],
    grounding: [{ kind: 'live_user_turn', claimKey: 'practical_next_step' }],
  },
  [BUILT_IN_DEEPSPACE_SHENXINGHUI_ID]: {
    query: '我们假装这把伞有一个奇怪规则。',
    semanticTags: ['playful_premise'],
    grounding: [{ kind: 'live_user_turn', claimKey: 'playful_premise' }],
  },
  [BUILT_IN_DEEPSPACE_QINCHE_ID]: {
    query: '两个方案都能走，只是代价完全不一样。',
    semanticTags: ['choice_tradeoff'],
    grounding: [{ kind: 'live_user_turn', claimKey: 'choice_tradeoff' }],
  },
  [BUILT_IN_DEEPSPACE_XIAYIZHOU_ID]: {
    query: '来打个赌，输的人负责买甜点。',
    semanticTags: ['playful_premise'],
    grounding: [{ kind: 'live_user_turn', claimKey: 'playful_premise' }],
  },
};

const scenariosFor = (charId: string): Scenario[] => {
  const chat = chatByCharacter[charId];
  return [
    {
      id: 'ordinary-chat',
      surface: 'chat',
      mode: 'remote_chat',
      purpose: 'stable_context',
      query: chat.query,
      semanticTags: chat.semanticTags,
      grounding: chat.grounding,
      maxItems: 1,
      budgetChars: 360,
      expectedSlots: ['stable_character_voice', 'stable_base', 'relevant_stable_details'],
    },
    {
      id: 'automatic-call-opening',
      surface: 'call',
      mode: 'call',
      purpose: 'opening',
      query: '（电话刚接通。界面只显示连接状态与当前时间段，没有提供你的位置、工作或刚发生的事情。你先开口。）',
      semanticTags: [],
      grounding: [],
      maxItems: 2,
      budgetChars: 520,
      expectedSlots: ['opening_recipes'],
    },
    {
      id: 'date-opening',
      surface: 'meet_scene',
      mode: 'meet_scene',
      purpose: 'opening',
      query: '用户正准备进入见面场景。',
      semanticTags: [],
      grounding: [],
      maxItems: 2,
      budgetChars: 560,
      expectedSlots: ['opening_recipes'],
    },
    {
      id: 'proactive-fact-free',
      surface: 'proactive_letter',
      mode: 'proactive_letter',
      purpose: 'proactive_intent',
      query: '想到一个轻松的话题，主动发一条消息。',
      semanticTags: [],
      grounding: [],
      maxItems: 2,
      budgetChars: 600,
      expectedSlots: ['proactive_seeds'],
    },
    {
      id: 'scene-plan',
      surface: 'storydesk',
      mode: 'story_scene',
      purpose: 'scene_planning',
      query: '为一个仍可被双方改变的轻场景准备可选纹理。',
      semanticTags: ['scene_planning', 'light_scene'],
      grounding: [{ kind: 'scene_context', claimKey: 'scene_planning' }],
      maxItems: 3,
      budgetChars: 720,
      expectedSlots: ['scene_affordances'],
      routeRef: {
        routeId: 'api-view-route',
        branchId: 'api-view-branch',
        sceneId: `api-view-scene:${charId}`,
        lane: 'mainline',
      },
    },
    {
      id: 'no-advice-chat',
      surface: 'chat',
      mode: 'remote_chat',
      purpose: 'stable_context',
      query: '我只是随口说说，不用分析也不用给建议。',
      semanticTags: ['no_advice_chat', 'low_signal'],
      grounding: [],
      maxItems: 1,
      budgetChars: 360,
      allowNone: true,
    },
    {
      id: 'tool-intent',
      surface: 'chat',
      mode: 'remote_chat',
      purpose: 'stable_context',
      query: '帮我设置一个明早八点的提醒。',
      semanticTags: ['tool_request'],
      grounding: [],
      maxItems: 1,
      budgetChars: 360,
      allowNone: true,
    },
  ];
};

const forbiddenPromptLeak = /sourceFingerprint|sourceRefs|sourcePackId|currentMotives|allowlist|denylist|固定回复|照着说|逐字复述|必须爱/;
const snapshots: {
  character: string;
  charId: string;
  scenario: string;
  query: string;
  selectedMaterialIds: readonly string[];
  slots: readonly string[];
  markdown: string;
}[] = [];

for (const character of CHARACTERS) {
  const records = builtInDeepspaceRetrievalCalibrationForCharacter(character.charId);
  for (const scenario of scenariosFor(character.charId)) {
    const requestId = `api-view:${character.charId}:${scenario.id}`;
    const requestWithoutSchema = (() => {
      if (
        scenario.id === 'ordinary-chat'
        || scenario.id === 'no-advice-chat'
        || scenario.id === 'tool-intent'
      ) {
        return buildChatCompanionMaterialRequest({
          requestId,
          scope: scope(character.charId),
          refId: `api-view-turn:${character.charId}:${scenario.id}`,
          query: scenario.query,
          occurredAt: NOW,
        });
      }
      if (scenario.id === 'automatic-call-opening') {
        return buildCallCompanionMaterialRequest({
          requestId,
          scope: scope(character.charId),
          refId: `api-view-call:${character.charId}`,
          query: scenario.query,
          occurredAt: NOW,
          opening: true,
          automaticOpening: true,
        });
      }
      if (scenario.id === 'date-opening') {
        return buildDateOpeningCompanionMaterialRequest({
          requestId,
          scope: scope(character.charId),
          sceneRefId: `api-view-date:${character.charId}`,
          occurredAt: NOW,
        });
      }
      if (scenario.id === 'proactive-fact-free') {
        return buildWakeupCompanionMaterialRequest({
          requestId,
          scope: scope(character.charId),
          ruleRefId: `api-view-wakeup:${character.charId}`,
          query: scenario.query,
          occurredAt: NOW,
          carePriority: false,
          ruleKind: 'window',
        });
      }
      return {
        requestId,
        scope: scope(character.charId),
        surface: scenario.surface,
        mode: scenario.mode,
        purpose: scenario.purpose,
        routeRef: scenario.routeRef,
        query: scenario.query,
        semanticTags: scenario.semanticTags,
        groundingRefs: scenario.grounding.map(ref => (
          grounding(character.charId, ref.kind, ref.claimKey)
        )),
        relationshipStage: 'unknown' as const,
        budgetChars: scenario.budgetChars,
        maxItems: scenario.maxItems,
        now: NOW,
      };
    })();
    const request: CompanionMaterialSelectionRequest = {
      schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
      ...requestWithoutSchema,
    };
    const selection = selectCompanionMaterialFromRecords({ request, records });
    const projection = projectCompanionMaterialPrompt({
      source: selection,
      surface: scenario.surface,
      mode: scenario.mode,
      purpose: scenario.purpose,
      budgetChars: scenario.budgetChars,
    });
    const markdown = formatCompanionMaterialPromptMarkdown(projection);
    assert.ok(selection.items.length <= scenario.maxItems);
    assert.ok(projection.usedChars <= scenario.budgetChars);
    assert.doesNotMatch(markdown, forbiddenPromptLeak);
    assert.equal(
      projection.fragments.every(fragment => (
        !('sourceRefs' in fragment)
        && !('sourceFingerprint' in fragment)
      )),
      true,
    );

    if (scenario.allowNone) {
      assert.equal(
        selection.items.length,
        0,
        `${character.name}/${scenario.id} must leave the turn entirely uncalibrated`,
      );
      assert.equal(
        selection.items.some(item => (
          item.slot === 'opening_recipes'
          || item.slot === 'proactive_seeds'
          || item.slot === 'motive_candidates'
          || item.slot === 'scene_affordances'
        )),
        false,
        `${character.name}/${scenario.id} cannot force situational material`,
      );
    } else {
      assert.ok(
        selection.items.length > 0,
        `${character.name}/${scenario.id} needs a legal positive path`,
      );
      assert.equal(
        scenario.expectedSlots?.some(slot => (
          selection.items.some(item => item.slot === slot)
        )),
        true,
        `${character.name}/${scenario.id} missed its intended material lane`,
      );
    }

    if (scenario.id === 'ordinary-chat') {
      assert.ok(selection.items.length <= 1, 'ordinary Chat must remain one sparse lens');
      assert.equal(
        selection.items.every(item => (
          item.slot === 'stable_character_voice'
          || item.slot === 'stable_base'
          || item.slot === 'relevant_stable_details'
        )),
        true,
      );
    }

    snapshots.push({
      character: character.name,
      charId: character.charId,
      scenario: scenario.id,
      query: scenario.query,
      selectedMaterialIds: selection.selectedMaterialIds,
      slots: selection.items.map(item => item.slot),
      markdown,
    });
  }
}

const ordinaryChatPrompts = snapshots
  .filter(snapshot => snapshot.scenario === 'ordinary-chat')
  .map(snapshot => snapshot.markdown);
assert.equal(new Set(ordinaryChatPrompts).size, CHARACTERS.length);

const outputPath = process.env.AETHEROS_API_VIEW_OUTPUT;
if (outputPath) {
  await writeFile(outputPath, `${JSON.stringify(snapshots, null, 2)}\n`);
}

console.log(`built-in deepspace API-view prompt simulation: green cases=${snapshots.length}`);
