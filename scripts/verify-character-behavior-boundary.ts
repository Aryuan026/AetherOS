import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_DEEPSPACE_QINCHE_ID,
  BUILT_IN_DEEPSPACE_QIYU_ID,
} from '../domain/companionMaterial/builtInDeepspaceReviewed.ts';
import {
  BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES,
  createPlayerCharacterBehaviorBoundaryRule,
  projectCharacterBehaviorBoundaries,
  selectCharacterBehaviorBoundaries,
  validateCharacterBehaviorBoundaryRule,
} from '../domain/characterBehaviorBoundary/index.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import type { CharacterProfile } from '../types.ts';
import { prepareCharacterBehaviorBoundaryProjection } from '../utils/characterBehaviorBoundary/runtime.ts';
import {
  buildCallModelFacingMessages,
  buildCallPrompt,
} from '../utils/callModelMessages.ts';
import { buildCompanionWakeupModelMessages } from '../utils/companionWakeupModelMessages.ts';
import { buildDateOpeningModelMessages } from '../utils/dateOpeningModelMessages.ts';

const scopeFor = (charId: string): HistoryScope => ({
  progressBundleId: 'bundle-behavior',
  personaMaskId: 'mask-behavior',
  charId,
});

assert.equal(BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES.length, 8);
assert.ok(BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES.every(rule => (
  rule.visibility === 'runtime_internal'
  && rule.source.authority === 'built_in_source_review'
  && rule.retrieval.activationPolicy === 'relevance_required'
  && validateCharacterBehaviorBoundaryRule(rule).length === 0
)));
assert.ok(
  BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES.every(rule => (
    !rule.surfaces.includes('chat')
    && !rule.surfaces.includes('call')
    && !rule.surfaces.includes('proactive_letter')
  )),
  'reviewed micro anchors must remain scene-only',
);
assert.ok(
  !BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES.some(rule => (
    /围裙/u.test(`${rule.title}${rule.trigger}${rule.mismatchPattern}${rule.preferredAlternatives.join('')}`)
  )),
  'owner-reported Qinche apron probe has no reviewed evidence and must stay out of runtime',
);

const qincheScene = selectCharacterBehaviorBoundaries({
  requestId: 'qinche-underground-scene',
  charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
  scope: scopeFor(BUILT_IN_DEEPSPACE_QINCHE_ID),
  surface: 'date_scene',
  query: '我们进入 N109 的地下据点，桌边正在谈判筹码。',
  maxItems: 2,
  budgetChars: 900,
}, BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES);
assert.ok(qincheScene.selected.length >= 1);
assert.ok(qincheScene.selected.some(item => item.rule.id === 'micro-qinche-underground-space-posture-v1'));
assert.ok(!qincheScene.selected.some(item => item.rule.charId !== BUILT_IN_DEEPSPACE_QINCHE_ID));

const noKitchenApronRule = selectCharacterBehaviorBoundaries({
  requestId: 'qinche-kitchen',
  charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
  scope: scopeFor(BUILT_IN_DEEPSPACE_QINCHE_ID),
  surface: 'date_scene',
  query: '我们走进厨房准备做饭。',
}, BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES);
assert.equal(noKitchenApronRule.selected.length, 0);

const noMicroInChat = selectCharacterBehaviorBoundaries({
  requestId: 'qiyu-chat',
  charId: BUILT_IN_DEEPSPACE_QIYU_ID,
  scope: scopeFor(BUILT_IN_DEEPSPACE_QIYU_ID),
  surface: 'chat',
  query: '我刚刚路过你的画室。',
}, BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES);
assert.equal(noMicroInChat.selected.length, 0);

const playerRule = createPlayerCharacterBehaviorBoundaryRule({
  id: 'player-qiyu-refusal',
  charId: BUILT_IN_DEEPSPACE_QIYU_ID,
  inputMode: 'guided',
  kind: 'interaction_pattern',
  trigger: '当我明确拒绝一个提议时',
  mismatchPattern: '连续追问或把拒绝重新包装成同一个邀请',
  preferredAlternatives: [
    '承认这个选择，同时保留角色自己的看法',
    '换到一件真正不同的事情或让话题停在这里',
  ],
  now: 100,
});
assert.equal(playerRule.visibility, 'player_authored');
assert.equal(playerRule.source.authority, 'player_authored');
assert.equal(playerRule.source.sourceRefs, undefined);

const playerSelection = selectCharacterBehaviorBoundaries({
  requestId: 'player-refusal-right-model',
  charId: BUILT_IN_DEEPSPACE_QIYU_ID,
  scope: scopeFor(BUILT_IN_DEEPSPACE_QIYU_ID),
  surface: 'chat',
  query: '我不想去，也不用再劝我。',
}, [playerRule]);
assert.equal(playerSelection.selected.length, 1);

const projected = projectCharacterBehaviorBoundaries(playerSelection);
assert.ok(projected);
assert.equal(projected.semanticSlot, 'behavior_calibration');
assert.equal(projected.containsPlayerAuthored, true);
assert.equal(projected.containsPlayerAuthoredInteractionPattern, true);
assert.equal(projected.containsBuiltInSource, false);
assert.equal(projected.truthEffect, 'none');
assert.equal(projected.currentStateEffect, 'none');
assert.equal(projected.memoryEffect, 'none');
assert.equal(projected.toolPolicyEffect, 'none');
assert.doesNotMatch(projected.markdown, /sourceRef|lysk-src/u);
assert.match(projected.markdown, /避免把角色反应固定成“连续追问或把拒绝重新包装成同一个邀请”/u);
assert.match(projected.markdown, /承认这个选择，同时保留角色自己的看法/u);
assert.match(projected.markdown, /主动展开|现场判断|其他同样符合角色的出口/u);
assert.match(projected.markdown, /当我明确拒绝一个提议时，/u);
assert.doesNotMatch(projected.markdown, /当当|时时/u);

const playerSceneRule = createPlayerCharacterBehaviorBoundaryRule({
  id: 'player-qinche-kitchen-clothing',
  charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
  inputMode: 'guided',
  trigger: '厨房做饭时',
  mismatchPattern: '默认添加围裙',
  preferredAlternatives: ['延续当前衣着，不主动添加围裙'],
  now: 100,
});
assert.equal(playerSceneRule.kind, 'wardrobe_or_prop');
const playerSceneProjection = projectCharacterBehaviorBoundaries(
  selectCharacterBehaviorBoundaries({
    requestId: 'player-qinche-kitchen-clothing',
    charId: BUILT_IN_DEEPSPACE_QINCHE_ID,
    scope: scopeFor(BUILT_IN_DEEPSPACE_QINCHE_ID),
    surface: 'date_scene',
    query: '我们在厨房做饭，我不想继续讨论刚才的建议。',
  }, [playerSceneRule]),
);
assert.ok(playerSceneProjection);
assert.equal(playerSceneProjection.containsPlayerAuthored, true);
assert.equal(playerSceneProjection.containsPlayerAuthoredInteractionPattern, false);
assert.match(playerSceneProjection.markdown, /厨房做饭时，/u);
assert.doesNotMatch(playerSceneProjection.markdown, /当厨房做饭时时/u);

const directInstructions = [
  '不要使用霸总式口癖，也不要用“你成功引起了我的注意”一类表达。',
  '不要替玩家决定感受、动作或没有说出口的想法。',
  '角色可以拒绝玩家，但不要用羞辱或居高临下的方式处理分歧。',
].map((directInstruction, index) => (
  createPlayerCharacterBehaviorBoundaryRule({
    id: `player-direct-${index + 1}`,
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    inputMode: 'direct_instruction',
    directInstruction,
    now: 110 + index,
  })
));
assert.ok(directInstructions.every(rule => (
  rule.source.playerInputMode === 'direct_instruction'
  && rule.directInstruction
  && rule.retrieval.activationPolicy === 'resident'
  && rule.strength === 'firm'
)));
const directProjection = projectCharacterBehaviorBoundaries(
  selectCharacterBehaviorBoundaries({
    requestId: 'player-direct-resident-bundle',
    charId: BUILT_IN_DEEPSPACE_QIYU_ID,
    scope: scopeFor(BUILT_IN_DEEPSPACE_QIYU_ID),
    surface: 'chat',
    query: '普通问候',
    maxItems: 0,
    budgetChars: 900,
  }, directInstructions),
);
assert.ok(directProjection);
assert.equal(directProjection.selectedRuleIds.length, directInstructions.length);
for (const rule of directInstructions) {
  assert.ok(directProjection.markdown.includes(rule.directInstruction || ''));
}
assert.doesNotMatch(directProjection.markdown, /可让角色从这些方向里自然选择/u);

const qincheSceneProjection = projectCharacterBehaviorBoundaries(qincheScene);
assert.ok(qincheSceneProjection);
assert.equal(qincheSceneProjection.containsBuiltInSource, true);
assert.equal(qincheSceneProjection.containsPlayerAuthored, false);
assert.equal(qincheSceneProjection.containsPlayerAuthoredInteractionPattern, false);
assert.equal(
  /sourceRefs|sourcePackId|lysk-src|currentMotives|固定回复|照着说|必须|严禁|不得/u
    .test(qincheSceneProjection.markdown),
  false,
);

const invalidStored = {
  ...playerRule,
  preferredAlternatives: [],
};
const charWithInvalidStoredRule = {
  id: BUILT_IN_DEEPSPACE_QIYU_ID,
  name: '祁煜',
  avatar: '',
  description: '',
  systemPrompt: '角色卡',
  memories: [],
  behaviorBoundaryRules: [invalidStored],
} as CharacterProfile;
assert.doesNotThrow(() => {
  prepareCharacterBehaviorBoundaryProjection({
    requestId: 'invalid-stored',
    char: charWithInvalidStoredRule,
    scope: scopeFor(BUILT_IN_DEEPSPACE_QIYU_ID),
    surface: 'chat',
    query: '我不想去。',
  });
});

const boundaryContext = projected.markdown;
const callPrompt = buildCallPrompt({
  userName: '用户',
  charName: '角色',
  characterBehaviorBoundaryContext: boundaryContext,
});
const callMessages = buildCallModelFacingMessages({
  systemPrompt: callPrompt,
  historyMessages: [{ role: 'user', content: '这次我不想去。' }],
});
assert.ok(callMessages.some(message => String(message.content || '').includes(boundaryContext)));

const openingMessages = buildDateOpeningModelMessages({
  characterName: '角色',
  coreContext: 'CORE',
  characterBehaviorBoundaryContext: boundaryContext,
  recentContext: '暂无',
  timeText: '今天',
  experienceBoundary: '不代替用户发言。',
});
assert.ok(openingMessages[0].content.includes(boundaryContext));

const wakeupMessages = buildCompanionWakeupModelMessages({
  coreContext: 'CORE',
  characterBehaviorBoundaryContext: boundaryContext,
  timeText: '今天',
  userName: '用户',
  ruleTitle: '主动来信',
  visibleRecent: '暂无',
});
assert.ok(wakeupMessages[0].content.includes(boundaryContext));

for (const relativePath of [
  '../hooks/useChatAI.ts',
  '../apps/CallApp.tsx',
  '../apps/DateApp.tsx',
  '../hooks/useCompanionWakeupRuntime.ts',
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(
    source,
    /!characterBehaviorBoundary\?\.containsPlayerAuthoredInteractionPattern/u,
    `${relativePath} must avoid stacking shared interaction guidance only over a selected player interaction rule`,
  );
}

const boundaryPanelSource = readFileSync(
  new URL('../components/character/BehaviorBoundaryPanel.tsx', import.meta.url),
  'utf8',
);
assert.doesNotMatch(boundaryPanelSource, /你理解的“不 OOC”|KIND_OPTIONS|这是什么类型的小边界/u);
assert.match(boundaryPanelSource, /直接写要求|帮我整理|什么时候需要提醒（可不填）/u);
assert.doesNotMatch(boundaryPanelSource, /当前模型|API 预设|currentModelOnly|modelPresetId/u);
assert.match(boundaryPanelSource, /保持角色自己的判断和行动意愿/u);
assert.match(boundaryPanelSource, /每次都遵守/u);
assert.match(boundaryPanelSource, /内容相关时提醒/u);
assert.match(boundaryPanelSource, /例外情况/u);
assert.doesNotMatch(boundaryPanelSource, /BUILT_IN_REVIEWED_CHARACTER_BEHAVIOR_BOUNDARIES/u);
const characterAppSource = readFileSync(new URL('../apps/Character.tsx', import.meta.url), 'utf8');
const tabOrder = ['设定', '行为边界', '记忆', '关系印象'].map(label => characterAppSource.indexOf(`>${label}`));
assert.ok(tabOrder.every(index => index >= 0));
assert.deepEqual([...tabOrder].sort((left, right) => left - right), tabOrder);

console.log('character behavior boundary contract: OK');
