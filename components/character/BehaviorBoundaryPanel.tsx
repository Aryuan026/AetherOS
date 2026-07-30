import React, { useMemo, useState } from 'react';
import {
  Check,
  CaretDown,
  NotePencil,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react';
import type { CharacterBehaviorBoundaryRule } from '../../domain/characterBehaviorBoundary/types';
import {
  createPlayerCharacterBehaviorBoundaryRule,
  revisePlayerCharacterBehaviorBoundaryRule,
} from '../../domain/characterBehaviorBoundary/playerRule';

interface BoundaryDraft {
  inputMode: 'direct_instruction' | 'guided';
  guidedNote: string;
  directInstruction: string;
  trigger: string;
  mismatchPattern: string;
  alternativesText: string;
  exceptionsText: string;
  resident: boolean;
}

const emptyDraft = (): BoundaryDraft => ({
  inputMode: 'direct_instruction',
  guidedNote: '',
  directInstruction: '',
  trigger: '',
  mismatchPattern: '',
  alternativesText: '',
  exceptionsText: '',
  resident: true,
});

const lines = (value: string): string[] => (
  value.split('\n').map(item => item.trim()).filter(Boolean)
);

const draftForRule = (rule: CharacterBehaviorBoundaryRule): BoundaryDraft => ({
  inputMode: rule.source.playerInputMode === 'direct_instruction'
    ? 'direct_instruction'
    : 'guided',
  guidedNote: '',
  directInstruction: rule.directInstruction || '',
  trigger: rule.trigger,
  mismatchPattern: rule.mismatchPattern,
  alternativesText: rule.preferredAlternatives.join('\n'),
  exceptionsText: rule.exceptions.join('\n'),
  resident: rule.retrieval.activationPolicy === 'resident',
});

export interface BehaviorBoundaryPanelProps {
  charId: string;
  rules: readonly CharacterBehaviorBoundaryRule[];
  onChange: (rules: CharacterBehaviorBoundaryRule[]) => void;
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
  onCompileGuidedNote?: (note: string) => Promise<{
    created: boolean;
    diagnostic?: string;
  }>;
}

const BehaviorBoundaryPanel: React.FC<BehaviorBoundaryPanelProps> = ({
  charId,
  rules,
  onChange,
  onNotify,
  onCompileGuidedNote,
}) => {
  const playerRules = useMemo(() => (
    rules.filter(rule => (
      rule.charId === charId
      && rule.source.authority === 'player_authored'
      && rule.visibility === 'player_authored'
    ))
  ), [charId, rules]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BoundaryDraft | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setShowAdvanced(false);
  };

  const openEdit = (rule: CharacterBehaviorBoundaryRule) => {
    setEditingId(rule.id);
    setDraft(draftForRule(rule));
    setShowAdvanced(
      rule.retrieval.activationPolicy === 'resident',
    );
  };

  const closeEditor = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const preferredAlternatives = lines(draft.alternativesText);
    if (
      draft.inputMode === 'direct_instruction'
      && !draft.directInstruction.trim()
    ) {
      onNotify('写下一条希望角色遵守的要求。', 'info');
      return;
    }
    if (draft.inputMode === 'guided') {
      if (!draft.mismatchPattern.trim()) {
        onNotify('写下哪里会让你觉得不像他。', 'info');
        return;
      }
      if (preferredAlternatives.length < 1) {
        onNotify('请写一条更像他的处理方向。', 'info');
        return;
      }
    }
    try {
      const previous = editingId
        ? playerRules.find(rule => rule.id === editingId)
        : undefined;
      const common = {
        inputMode: draft.inputMode,
        directInstruction: draft.inputMode === 'direct_instruction'
          ? draft.directInstruction
          : undefined,
        trigger: draft.trigger,
        mismatchPattern: draft.mismatchPattern,
        preferredAlternatives,
        exceptions: lines(draft.exceptionsText),
        resident: draft.resident,
      };
      const nextRule = previous
        ? revisePlayerCharacterBehaviorBoundaryRule(previous, common)
        : createPlayerCharacterBehaviorBoundaryRule({
            ...common,
            charId,
          });
      const next = previous
        ? rules.map(rule => rule.id === previous.id ? nextRule : rule)
        : [...rules, nextRule];
      onChange([...next]);
      onNotify(previous ? '这条行为要求已经更新。' : '这条行为要求已经记下。', 'success');
      closeEditor();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '这条要求暂时无法保存。', 'error');
    }
  };

  const compileGuidedNote = async () => {
    if (!draft || draft.inputMode !== 'guided' || editingId) return;
    if (!draft.guidedNote.trim()) {
      onNotify('先用平常说法写下这次哪里让你不满意。', 'info');
      return;
    }
    if (!onCompileGuidedNote) {
      onNotify('系统主持暂时不能整理这条要求。', 'error');
      return;
    }
    setIsCompiling(true);
    try {
      const result = await onCompileGuidedNote(draft.guidedNote.trim());
      if (result.created) {
        onNotify('已经整理成可编辑的行为要求。', 'success');
        closeEditor();
      } else {
        onNotify(
          result.diagnostic || '这句话还不足以形成长期要求，可以再说具体一点。',
          'info',
        );
      }
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : '系统主持暂时没能整理这条要求。',
        'error',
      );
    } finally {
      setIsCompiling(false);
    }
  };

  const toggleRule = (rule: CharacterBehaviorBoundaryRule) => {
    const now = Date.now();
    onChange(rules.map(item => item.id === rule.id ? {
      ...item,
      enabled: !item.enabled,
      revision: item.revision + 1,
      updatedAt: now,
    } : item));
  };

  const deleteRule = (rule: CharacterBehaviorBoundaryRule) => {
    onChange(rules.filter(item => item.id !== rule.id));
    if (editingId === rule.id) closeEditor();
    onNotify('这条行为要求已经删除。', 'success');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {!draft && (
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 py-3 text-xs font-bold text-violet-600 active:scale-[0.99]"
        >
          <Plus size={15} weight="bold" />
          添加一条行为要求
        </button>
      )}

      {draft && (
        <div className="space-y-4 rounded-3xl border border-violet-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              {editingId ? '修改行为要求' : '新的行为要求'}
            </div>
            <button type="button" onClick={closeEditor} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50">
              <X size={16} weight="bold" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setDraft(previous => previous ? {
                ...previous,
                inputMode: 'direct_instruction',
                resident: previous.inputMode === 'guided' ? true : previous.resident,
              } : previous)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                draft.inputMode === 'direct_instruction'
                  ? 'bg-white text-violet-600 shadow-sm'
                  : 'text-slate-400'
              }`}
            >
              直接写要求
            </button>
            <button
              type="button"
              onClick={() => setDraft(previous => previous ? {
                ...previous,
                inputMode: 'guided',
                resident: previous.inputMode === 'direct_instruction' ? false : previous.resident,
              } : previous)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                draft.inputMode === 'guided'
                  ? 'bg-white text-violet-600 shadow-sm'
                  : 'text-slate-400'
              }`}
            >
              帮我整理
            </button>
          </div>

          {draft.inputMode === 'direct_instruction' ? (
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-slate-400">角色行为要求</span>
              <textarea
                value={draft.directInstruction}
                onChange={event => setDraft(previous => previous ? {
                  ...previous,
                  directInstruction: event.target.value,
                } : previous)}
                placeholder={'例如：保持角色自己的判断和行动意愿；不要替玩家决定尚未表达的感受、动作或选择。\n也可以直接粘贴你已经写好的单条提示词。'}
                className="h-36 w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:ring-2 focus:ring-violet-100"
              />
            </label>
          ) : !editingId ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-slate-400">
                  用平常说法写下哪里不满意
                </span>
                <textarea
                  value={draft.guidedNote}
                  onChange={event => setDraft(previous => previous ? {
                    ...previous,
                    guidedNote: event.target.value,
                  } : previous)}
                  placeholder="例如：他不能每次我一生气就立刻哭着道歉；或者：他在厨房不会穿围裙。"
                  className="h-32 w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:ring-2 focus:ring-violet-100"
                />
              </label>
              <div className="rounded-2xl bg-violet-50/70 px-4 py-3 text-[11px] leading-relaxed text-violet-600">
                系统主持只会整理行为模式和更合适的处理方向，不替角色回复，也不会把它写成记忆或剧情事实。
              </div>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-slate-400">什么时候需要提醒（可不填）</span>
                <textarea
                  value={draft.trigger}
                  onChange={event => setDraft(previous => previous ? { ...previous, trigger: event.target.value } : previous)}
                  placeholder="例如：我明确拒绝、厨房做饭、关系还没有发展到很亲密时"
                  className="h-20 w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-slate-400">哪里会让你觉得不像他</span>
                <textarea
                  value={draft.mismatchPattern}
                  onChange={event => setDraft(previous => previous ? { ...previous, mismatchPattern: event.target.value } : previous)}
                  placeholder="照平常说话就好，不必写成提示词"
                  className="h-20 w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-slate-400">更像他的处理方向</span>
                <textarea
                  value={draft.alternativesText}
                  onChange={event => setDraft(previous => previous ? { ...previous, alternativesText: event.target.value } : previous)}
                  placeholder="写一条就能保存；想到几种也可以分行写\n例如：保留自己的看法，但停下施压"
                  className="h-28 w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-violet-100"
                />
              </label>
            </>
          )}

          {(draft.inputMode === 'direct_instruction' || editingId) && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setDraft(previous => previous ? { ...previous, resident: true } : previous)}
                className={`rounded-xl px-3 py-2 text-[11px] font-bold transition-colors ${
                  draft.resident
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-slate-400'
                }`}
              >
                每次都遵守
              </button>
              <button
                type="button"
                onClick={() => setDraft(previous => previous ? { ...previous, resident: false } : previous)}
                className={`rounded-xl px-3 py-2 text-[11px] font-bold transition-colors ${
                  !draft.resident
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-slate-400'
                }`}
              >
                内容相关时提醒
              </button>
            </div>
          )}

          {(draft.inputMode === 'direct_instruction' || editingId) && (
            <button
              type="button"
              onClick={() => setShowAdvanced(value => !value)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500"
            >
              <span>例外情况</span>
              <CaretDown
                size={14}
                className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>
          )}

          {showAdvanced && (draft.inputMode === 'direct_instruction' || editingId) && (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-slate-400">有例外时（可不填）</span>
                <textarea
                  value={draft.exceptionsText}
                  onChange={event => setDraft(previous => previous ? { ...previous, exceptionsText: event.target.value } : previous)}
                  placeholder="例如：明确进入恶作剧 IF 线时"
                  className="h-20 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-violet-100"
                />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={
              draft.inputMode === 'guided' && !editingId
                ? compileGuidedNote
                : saveDraft
            }
            disabled={isCompiling}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 py-3 text-xs font-bold text-white shadow-sm shadow-violet-200 active:scale-[0.99]"
          >
            <Check size={15} weight="bold" />
            {isCompiling
              ? '正在整理…'
              : draft.inputMode === 'guided' && !editingId
                ? '帮我整理并记下'
                : '保存这条要求'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {playerRules.map(rule => (
            <div
              key={rule.id}
              className={`rounded-3xl border p-4 shadow-sm transition-opacity ${
                rule.enabled
                  ? 'border-white/80 bg-white/75'
                  : 'border-slate-100 bg-white/45 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rule.retrieval.activationPolicy === 'resident' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-500">每次遵守</span>
                    )}
                  </div>
                  {rule.source.playerInputMode === 'direct_instruction' ? (
                    <div className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">
                      {rule.directInstruction}
                    </div>
                  ) : (
                    <>
                      {rule.trigger && (
                        <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{rule.trigger}</div>
                      )}
                      <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{rule.mismatchPattern}</div>
                      <div className="mt-3 space-y-1.5">
                        {rule.preferredAlternatives.map((alternative, index) => (
                          <div key={`${rule.id}-alternative-${index}`} className="rounded-xl bg-violet-50/60 px-3 py-2 text-[11px] leading-relaxed text-violet-700">
                            {alternative}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleRule(rule)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    rule.enabled ? 'bg-violet-500' : 'bg-slate-200'
                  }`}
                  aria-label={rule.enabled ? '停用这条要求' : '启用这条要求'}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    rule.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
              <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => openEdit(rule)}
                  className="flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-500"
                >
                  <NotePencil size={12} />
                  修改
                </button>
                <button
                  type="button"
                  onClick={() => deleteRule(rule)}
                  className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-bold text-rose-500"
                >
                  <Trash size={12} />
                  删除
                </button>
              </div>
            </div>
        ))}
        {!playerRules.length && !draft && (
          <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400">
            还没有你添加的行为要求。
          </div>
        )}
      </div>
    </div>
  );
};

export default BehaviorBoundaryPanel;
