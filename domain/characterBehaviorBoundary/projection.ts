import type {
  CharacterBehaviorBoundaryProjection,
  CharacterBehaviorBoundarySelection,
} from './types.ts';
import { CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION } from './types.ts';

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const renderCondition = (trigger: string): string => {
  const normalized = trigger.trim().replace(/[，。；、]+$/u, '');
  if (!normalized) return '本轮涉及这项要求时';
  if (
    /^(当|每当|在|如果|若|一旦)/u.test(normalized)
    || /(时|时候|情况下|场景中|场景里)$/u.test(normalized)
  ) {
    return normalized;
  }
  return `当${normalized}时`;
};

export const projectCharacterBehaviorBoundaries = (
  selection: CharacterBehaviorBoundarySelection,
): CharacterBehaviorBoundaryProjection | null => {
  if (!selection.selected.length) return null;
  const items = selection.selected.map(({ rule }, index) => {
    if (
      rule.source.authority === 'player_authored'
      && rule.source.playerInputMode === 'direct_instruction'
      && rule.directInstruction
    ) {
      return `${index + 1}. ${rule.directInstruction}`;
    }
    const alternatives = rule.preferredAlternatives
      .map(value => value.trim())
      .filter(Boolean)
      .join('；');
    const playerGuidedMismatch = (
      rule.source.authority === 'player_authored'
      && rule.source.playerInputMode === 'guided'
      && rule.mismatchPattern.trim()
    )
      ? `避免把角色反应固定成“${rule.mismatchPattern.trim()}”；`
      : '';
    const exception = rule.source.authority === 'player_authored' && rule.exceptions.length
      ? `玩家补充的例外：${rule.exceptions.join('；')}。例外已经由现场明确建立时，以现场为准。`
      : '';
    const sceneMicroBoundary = (
      rule.kind === 'embodied_habit'
      || rule.kind === 'wardrobe_or_prop'
      || rule.kind === 'space_behavior'
      || rule.kind === 'routine_detail'
    );
    if (sceneMicroBoundary) {
      const condition = renderCondition(rule.trigger);
      return `${index + 1}. ${condition}，${playerGuidedMismatch}可保持这项角色连续性：${alternatives}。场景中的其他动作、物件与表达继续依角色卡和眼前事实自由生成。${exception}`;
    }
    const condition = renderCondition(rule.trigger);
    return `${index + 1}. ${condition}，${playerGuidedMismatch}可让角色从这些方向里自然选择：${alternatives}。${exception}`;
  });
  const containsDirectInstruction = selection.selected.some(item => (
    item.rule.source.authority === 'player_authored'
    && item.rule.source.playerInputMode === 'direct_instruction'
  ));
  const markdown = [
    '### 本轮角色行为参考',
    containsDirectInstruction
      ? '玩家直接写下的要求保持原文；其余条目是与当前情境相关的轻量校准。'
      : '以下只提供与当前情境相关的轻量校准，可像灵感一样融进回应；回复结构、情绪和行动节奏继续服从角色与现场。',
    ...items,
    containsDirectInstruction
      ? '直接要求只约束其中写明的行为或表达，不替代角色卡、现场事实、关系、记忆与工具边界；未写明之处仍由角色自然判断和主动展开。'
      : '本轮只采用最自然的一种处理；角色也可以走向其他同样符合人设的出口。角色保留自己的立场、主动展开、表达变化与现场判断。当前事实、关系、记忆和工具能力仍由它们各自的可靠来源决定。',
  ].join('\n');
  return {
    schemaVersion: CHARACTER_BEHAVIOR_BOUNDARY_SCHEMA_VERSION,
    semanticSlot: 'behavior_calibration',
    requestId: selection.requestId,
    scope: { ...selection.scope },
    charId: selection.charId,
    surface: selection.surface,
    selectedRuleIds: selection.selected.map(item => item.rule.id),
    containsPlayerAuthored: selection.selected.some(item => (
      item.rule.source.authority === 'player_authored'
    )),
    containsPlayerAuthoredInteractionPattern: selection.selected.some(item => (
      item.rule.source.authority === 'player_authored'
      && item.rule.kind === 'interaction_pattern'
    )),
    containsBuiltInSource: selection.selected.some(item => (
      item.rule.source.authority === 'built_in_source_review'
    )),
    renderedHash: hashText(`${selection.requestId}:${markdown}`),
    markdown,
    charCount: markdown.length,
    truthEffect: 'none',
    currentStateEffect: 'none',
    memoryEffect: 'none',
    toolPolicyEffect: 'none',
    expressionEffect: 'advisory',
  };
};
