import React, { useState } from 'react';
import AppHeader from '../shell/AppHeader';
import type { CharacterProfile, WorldbookGroupAssignment } from '../../types';
import WorldbookGroupPicker from './WorldbookGroupPicker';

export interface WorldbookEditableDraft {
  title: string;
  content: string;
  category: string;
  group: WorldbookGroupAssignment;
}

interface Props {
  heading: string;
  initial: WorldbookEditableDraft;
  characters: readonly Pick<CharacterProfile, 'id' | 'name'>[];
  groupOptions: readonly WorldbookGroupAssignment[];
  lockGroup?: boolean;
  note?: string;
  onCancel: () => void;
  onSave: (draft: WorldbookEditableDraft) => Promise<void>;
}

const WorldbookEntryEditor: React.FC<Props> = ({
  heading,
  initial,
  characters,
  groupOptions,
  lockGroup = false,
  note,
  onCancel,
  onSave,
}) => {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.title.trim()) {
      setError('还需要一个标题。');
      return;
    }
    if (!draft.group.name.trim()) {
      setError('还需要选择或新建一个分组。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: draft.title.trim(),
        content: draft.content,
        category: draft.group.name.trim(),
        group: { ...draft.group, name: draft.group.name.trim() },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有保存成功，请再试一次。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans" data-worldbook-fullscreen-editor>
      <AppHeader
        title={heading}
        onBack={onCancel}
        className="border-b border-slate-200 bg-white/90 backdrop-blur-xl"
        right={(
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50"
          >
            {saving ? '保存中' : '保存'}
          </button>
        )}
      />

      <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5 no-scrollbar">
        {note && (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs leading-5 text-indigo-600">
            {note}
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-xs font-bold tracking-wider text-slate-400">标题</span>
          <input
            value={draft.title}
            onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))}
            placeholder="例如：雾港的潮汐规则"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        {lockGroup ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] font-bold tracking-wider text-slate-400">所在分组</div>
            <div className="mt-1 text-sm font-bold text-slate-700">{draft.group.name}</div>
            <div className="mt-1 text-[10px] text-slate-400">要复用到别处，请在条目卡片里选择“复制到”。</div>
          </div>
        ) : (
          <WorldbookGroupPicker
            characters={characters}
            groups={groupOptions}
            value={draft.group}
            onChange={group => setDraft(previous => ({
              ...previous,
              group,
              category: group.name,
            }))}
          />
        )}

        <label className="block">
          <span className="mb-2 block text-xs font-bold tracking-wider text-slate-400">设定内容</span>
          <textarea
            value={draft.content}
            onChange={event => setDraft(previous => ({ ...previous, content: event.target.value }))}
            placeholder="在这里写下世界设定……"
            className="min-h-[46vh] w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        {error && (
          <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-red-600">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorldbookEntryEditor;
