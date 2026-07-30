import type { CompanionMaterialSurface } from '../companionMaterial/types.ts';
import { assertValidCharacterBehaviorBoundaryRule } from './contract.ts';
import { derivePlayerBehaviorBoundaryRetrievalHints } from './retrieval.ts';
import {
  CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION,
  type CharacterBehaviorBoundaryKind,
  type CharacterBehaviorBoundaryPlayerInputMode,
  type CharacterBehaviorBoundaryRule,
} from './types.ts';

const INTERACTION_SURFACES: readonly CompanionMaterialSurface[] = [
  'chat',
  'call',
  'date',
  'proactive_letter',
  'storydesk',
  'remote_chat',
  'date_scene',
  'story_scene',
];

const SCENE_SURFACES: readonly CompanionMaterialSurface[] = [
  'date',
  'storydesk',
  'meet_scene',
  'date_scene',
  'story_planning',
  'story_scene',
];

const compact = (value: string): string => value.replace(/\s+/g, ' ').trim();

const uniqueNonEmpty = (values: readonly string[]): string[] => (
  [...new Set(values.map(compact).filter(Boolean))]
);

export interface CreatePlayerCharacterBehaviorBoundaryRuleInput {
  id?: string;
  charId: string;
  inputMode: CharacterBehaviorBoundaryPlayerInputMode;
  /**
   * Internal routing hint. The player UI never asks the human to classify a
   * rule; omitted values are inferred from the written scenario.
   */
  kind?: CharacterBehaviorBoundaryKind;
  directInstruction?: string;
  trigger?: string;
  mismatchPattern?: string;
  preferredAlternatives?: readonly string[];
  exceptions?: readonly string[];
  resident?: boolean;
  now?: number;
}

const includesAny = (value: string, patterns: readonly RegExp[]): boolean => (
  patterns.some(pattern => pattern.test(value))
);

export const inferPlayerCharacterBehaviorBoundaryKind = (input: {
  directInstruction?: string;
  trigger?: string;
  mismatchPattern?: string;
  preferredAlternatives?: readonly string[];
}): CharacterBehaviorBoundaryKind => {
  const text = compact([
    input.directInstruction || '',
    input.trigger || '',
    input.mismatchPattern || '',
    ...(input.preferredAlternatives || []),
  ].join(' '));
  if (includesAny(text, [
    /口癖|语气|措辞|回复|回话|说话方式|表达方式|霸总|替玩家|代替玩家|替我决定|代替我决定|替我发言|代替我发言|下结论|羞辱|居高临下/u,
  ])) return 'interaction_pattern';
  if (includesAny(text, [
    /围裙|衣着|衣服|服装|制服|外套|衬衫|鞋子|眼镜|首饰|饰品|项链|手套|帽子|道具|物件|佩戴|穿着|换衣|随身物/u,
  ])) return 'wardrobe_or_prop';
  if (includesAny(text, [
    /动作|姿势|站姿|坐姿|距离感|触碰|拥抱|牵手|靠近|后退|表情|眼神|肢体|俯身|抬手/u,
  ])) return 'embodied_habit';
  if (includesAny(text, [
    /厨房|客厅|卧室|房间|家里|工作室|画室|办公室|医院|诊室|研究所|公共场合|据点|地点|场所|空间/u,
  ])) return 'space_behavior';
  if (includesAny(text, [
    /平时|日常|习惯|总是|经常|通常|起床|睡觉|吃饭|作息|休息|记录习惯/u,
  ])) return 'routine_detail';
  return 'interaction_pattern';
};

export const createPlayerCharacterBehaviorBoundaryRule = (
  input: CreatePlayerCharacterBehaviorBoundaryRuleInput,
): CharacterBehaviorBoundaryRule => {
  const now = input.now ?? Date.now();
  const directInstruction = input.inputMode === 'direct_instruction'
    ? (input.directInstruction || '').trim()
    : undefined;
  const trigger = compact(input.trigger || '');
  const mismatchPattern = compact(input.mismatchPattern || '');
  const preferredAlternatives = uniqueNonEmpty(input.preferredAlternatives || []);
  const exceptions = uniqueNonEmpty(input.exceptions || []);
  const kind = input.kind || inferPlayerCharacterBehaviorBoundaryKind({
    directInstruction,
    trigger,
    mismatchPattern,
    preferredAlternatives,
  });
  const sceneOnly = (
    kind === 'embodied_habit'
    || kind === 'wardrobe_or_prop'
    || kind === 'space_behavior'
  );
  const titleSeed = directInstruction || trigger || mismatchPattern || '行为校准';
  const resident = input.resident ?? input.inputMode === 'direct_instruction';
  const rule: CharacterBehaviorBoundaryRule = {
    schemaVersion: CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION,
    id: input.id || `player-boundary-${input.charId}-${now.toString(36)}`,
    charId: input.charId,
    ownerScope: { kind: 'character', charId: input.charId },
    visibility: 'player_authored',
    source: {
      authority: 'player_authored',
      playerInputMode: input.inputMode,
      evidenceStrength: 'player_confirmed',
    },
    kind,
    enabled: true,
    revision: 1,
    title: titleSeed.slice(0, 32),
    directInstruction,
    trigger,
    mismatchPattern,
    preferredAlternatives,
    exceptions,
    surfaces: sceneOnly ? SCENE_SURFACES : INTERACTION_SURFACES,
    routePolicy: { kind: 'all_routes' },
    strength: input.inputMode === 'direct_instruction' ? 'firm' : 'soft',
    retrieval: derivePlayerBehaviorBoundaryRetrievalHints({
      directInstruction,
      trigger,
      mismatchPattern,
      preferredAlternatives,
      resident,
    }),
    createdAt: now,
    updatedAt: now,
  };
  assertValidCharacterBehaviorBoundaryRule(rule);
  return rule;
};

export const revisePlayerCharacterBehaviorBoundaryRule = (
  previous: CharacterBehaviorBoundaryRule,
  input: Omit<CreatePlayerCharacterBehaviorBoundaryRuleInput, 'id' | 'charId' | 'now'>,
  now = Date.now(),
): CharacterBehaviorBoundaryRule => {
  if (previous.source.authority !== 'player_authored') {
    throw new Error('Built-in source boundaries cannot be revised from the player UI');
  }
  const next = createPlayerCharacterBehaviorBoundaryRule({
    ...input,
    id: previous.id,
    charId: previous.charId,
    now: previous.createdAt,
  });
  const revised: CharacterBehaviorBoundaryRule = {
    ...next,
    enabled: previous.enabled,
    revision: previous.revision + 1,
    createdAt: previous.createdAt,
    updatedAt: now,
  };
  assertValidCharacterBehaviorBoundaryRule(revised);
  return revised;
};
