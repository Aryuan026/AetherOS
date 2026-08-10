import React, { useState } from 'react';
import { Sparkle, TextT } from '@phosphor-icons/react';
import type { CharacterProfile, WorldbookGroupAssignment } from '../../types';
import type { ResolvedAiTaskRoute } from '../../utils/aiRuntime';
import {
  analyzeWorldbookInput,
  type WorldbookInputAnalysisMode,
} from '../../utils/worldbookInputAnalysis';
import type { WorldbookImportDraft } from '../../utils/worldbookImport';
import { createWorldbookGroupAssignment } from '../../utils/worldbookGroups';
import AppHeader from '../shell/AppHeader';
import WorldbookGroupPicker from './WorldbookGroupPicker';

interface Props {
  characters: readonly Pick<CharacterProfile, 'id' | 'name'>[];
  groupOptions: readonly WorldbookGroupAssignment[];
  initialGroup: WorldbookGroupAssignment;
  route: ResolvedAiTaskRoute;
  onClose: () => void;
  onCommit: (drafts: WorldbookImportDraft[], group: WorldbookGroupAssignment) => Promise<void>;
}

const WorldbookSmartInputScreen: React.FC<Props> = ({
  characters,
  groupOptions,
  initialGroup,
  route,
  onClose,
  onCommit,
}) => {
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<WorldbookInputAnalysisMode>('single');
  const [drafts, setDrafts] = useState<WorldbookImportDraft[] | null>(null);
  const [group, setGroup] = useState(initialGroup);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const analyze = async () => {
    if (!route.ok) {
      setError(route.message);
      return;
    }
    setWorking(true);
    setError('');
    try {
      const result = await analyzeWorldbookInput({
        source,
        mode,
        apiConfig: route.config,
        provider: route.provider,
      });
      setDrafts(result.drafts);
      if (mode === 'group') {
        setGroup(createWorldbookGroupAssignment({
          name: result.suggestedGroupName,
          owner: group.owner,
        }));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '这次没有整理成功，请再试一次。');
    } finally {
      setWorking(false);
    }
  };

  const updateDraft = (clientId: string, patch: Partial<WorldbookImportDraft>) => {
    setDrafts(previous => previous?.map(draft => (
      draft.clientId === clientId ? { ...draft, ...patch } : draft
    )) || null);
  };

  const save = async () => {
    if (!drafts?.length) return;
    if (!group.name.trim()) {
      setError('还需要选择或新建一个分组。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const savedGroup = { ...group, name: group.name.trim() };
      await onCommit(drafts.map(draft => ({
        ...draft,
        title: draft.title.trim(),
        content: draft.content.trim(),
        category: savedGroup.name,
      })), savedGroup);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有保存成功，请再试一次。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans" data-worldbook-smart-input-screen>
      <AppHeader
        title={drafts ? `整理出 ${drafts.length} 条` : '智能整理'}
        subtitle={drafts ? '确认后才会进入世界书' : '把已有资料变成一条或一组设定'}
        onBack={drafts ? () => setDrafts(null) : onClose}
        className="border-b border-slate-200 bg-white/90 backdrop-blur-xl"
        right={drafts ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50"
          >
            {saving ? '保存中' : '保存'}
          </button>
        ) : undefined}
      />

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5 no-scrollbar">
        {!drafts ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['single', '整理成一条', '保留为一份完整设定'],
                ['group', '拆成一组', '按人物、地点或规则分开'],
              ] as const).map(([value, title, description]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setMode(value)}
                  className={`rounded-[22px] border p-4 text-left ${mode === value ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  <strong className="block text-sm">{title}</strong>
                  <span className="mt-1 block text-[10px] leading-4 opacity-70">{description}</span>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-400"><TextT size={16} /> 想整理的资料</span>
              <textarea
                value={source}
                onChange={event => { setSource(event.target.value); setError(''); }}
                placeholder="粘贴你的设定、灵感或别人整理好的文字……"
                className="min-h-[46vh] w-full resize-y rounded-[24px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={working || !source.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-4 text-sm font-bold text-white shadow-lg disabled:opacity-40"
            >
              <Sparkle size={17} weight="fill" /> {working ? '正在整理…' : '开始整理'}
            </button>
          </>
        ) : (
          <>
            <section className="rounded-[26px] border border-violet-100 bg-white/80 p-4 shadow-sm">
              <WorldbookGroupPicker
                characters={characters}
                groups={groupOptions}
                value={group}
                onChange={setGroup}
              />
            </section>
            {drafts.map((draft, index) => (
              <section key={draft.clientId} className="space-y-4 rounded-[26px] border border-white bg-white/80 p-4 shadow-sm">
                <div className="text-[10px] font-bold tracking-[0.18em] text-violet-400">第 {index + 1} 条 · 保存前可修改</div>
                <input
                  value={draft.title}
                  onChange={event => updateDraft(draft.clientId, { title: event.target.value })}
                  placeholder="标题"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-violet-400"
                />
                <textarea
                  value={draft.content}
                  onChange={event => updateDraft(draft.clientId, { content: event.target.value })}
                  placeholder="设定正文"
                  className="min-h-48 w-full resize-y rounded-2xl border border-slate-200 p-4 text-sm leading-7 text-slate-700 outline-none focus:border-violet-400"
                />
              </section>
            ))}
          </>
        )}

        {error && (
          <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-red-600">{error}</div>
        )}
      </div>
    </div>
  );
};

export default WorldbookSmartInputScreen;
