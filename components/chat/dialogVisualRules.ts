export const DIALOG_VISUAL_RULES = {
  avatarSizeClass: 'w-10 h-10',
  avatarSizePx: 40,
  avatarBubbleGapClass: 'gap-2.5',
  rowGutterClass: 'px-4',
  bubbleMaxWidthClass: 'max-w-[74%]',
  bubbleMinHeightClass: 'min-h-[40px]',
  bubblePaddingClass: 'px-3.5 py-2.5',
  bubbleTextClass: 'text-[14px] leading-[1.5]',
  nameTextClass: 'text-[10px]',
  timestampTextClass: 'text-[9px]',
} as const;

export type DialogVisualRuleKey = keyof typeof DIALOG_VISUAL_RULES;
