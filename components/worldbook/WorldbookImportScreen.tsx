import React, { useMemo, useRef, useState } from 'react';
import { FileArrowUp, TextT } from '@phosphor-icons/react';
import AppHeader from '../shell/AppHeader';
import type { CharacterProfile, WorldbookGroupAssignment } from '../../types';
import {
  parseWorldbookImport,
  inferWorldbookImportGroupName,
  type WorldbookImportDraft,
} from '../../utils/worldbookImport';
import { extractTavernCharacterCardFromPng } from '../../utils/tavernImport';
import {
  createWorldbookGroupAssignment,
  UNIVERSAL_WORLDBOOK_GROUP_NAME,
} from '../../utils/worldbookGroups';

interface Props {
  characters: readonly Pick<CharacterProfile, 'id' | 'name'>[];
  groupOptions: readonly WorldbookGroupAssignment[];
  initialGroup: WorldbookGroupAssignment;
  onClose: () => void;
  onCommit: (drafts: WorldbookImportDraft[], group: WorldbookGroupAssignment) => Promise<void>;
}

const WorldbookImportScreen: React.FC<Props> = ({
  characters,
  groupOptions,
  initialGroup,
  onClose,
  onCommit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [owner, setOwner] = useState<WorldbookGroupAssignment['owner']>(initialGroup.owner);

  const ownerGroups = useMemo(() => groupOptions.filter(group => (
    group.owner.kind === owner.kind
    && (owner.kind === 'universal' || (
      group.owner.kind === 'character' && group.owner.charId === owner.charId
    ))
  )), [groupOptions, owner]);

  const uniqueGroupName = (baseName: string): string => {
    if (owner.kind === 'universal') return UNIVERSAL_WORLDBOOK_GROUP_NAME;
    const names = new Set(ownerGroups.map(group => group.name.trim()));
    if (!names.has(baseName)) return baseName;
    let suffix = 2;
    while (names.has(`${baseName} ${suffix}`)) suffix += 1;
    return `${baseName} ${suffix}`;
  };

  const importSource = async (rawSource: string, fileName?: string) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const drafts = parseWorldbookImport({ source: rawSource, fileName });
      const groupName = uniqueGroupName(inferWorldbookImportGroupName({ drafts, fileName }));
      const group = createWorldbookGroupAssignment({ name: groupName, owner });
      await onCommit(drafts.map(draft => ({
        ...draft,
        title: draft.title.trim(),
        category: group.name,
      })), group);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有读懂这份资料。');
    } finally {
      setSaving(false);
    }
  };

  const selectFile = async (file?: File) => {
    if (!file) return;
    try {
      const extension = file.name.split('.').pop()?.toLocaleLowerCase();
      const rawSource = extension === 'png'
        ? JSON.stringify(extractTavernCharacterCardFromPng(await file.arrayBuffer()))
        : await file.text();
      await importSource(rawSource, file.name);
    } catch {
      setError('这个文件没有读取成功，请重新选择。');
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans" data-worldbook-import-screen>
      <AppHeader
        title="导入资料"
        subtitle="识别后自动收进一个新分组"
        onBack={onClose}
        className="border-b border-slate-200 bg-white/90 backdrop-blur-xl"
      />

      <div className="flex-1 overflow-y-auto px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5 no-scrollbar">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-violet-100 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 text-xs font-bold tracking-wider text-slate-400">这份资料属于</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOwner({ kind: 'universal' })}
                  className={`rounded-full border px-3 py-2 text-xs font-bold ${owner.kind === 'universal' ? 'border-violet-500 bg-violet-500 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
                >
                  通用区
                </button>
                {characters.map(character => (
                  <button
                    type="button"
                    key={character.id}
                    onClick={() => setOwner({ kind: 'character', charId: character.id })}
                    className={`rounded-full border px-3 py-2 text-xs font-bold ${owner.kind === 'character' && owner.charId === character.id ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
                  >
                    {character.name}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-5 text-slate-400">
                角色资料会自动建成一个新分组；通用资料会直接进入通用区。
              </p>
            </section>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.png,.txt,application/json,image/png,text/plain"
              className="hidden"
              onChange={event => void selectFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="flex w-full items-center gap-4 rounded-[24px] border border-indigo-100 bg-white p-5 text-left shadow-sm"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
                <FileArrowUp size={24} weight="duotone" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-slate-700">{saving ? '正在带进来…' : '选择 JSON、PNG 或 TXT'}</strong>
                <span className="mt-1 block truncate text-[11px] text-slate-400">支持酒馆独立世界书与角色卡内嵌世界书</span>
              </span>
            </button>

            <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] text-slate-300">
              <span className="h-px flex-1 bg-slate-200" /> 或粘贴文字 <span className="h-px flex-1 bg-slate-200" />
            </div>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-400"><TextT size={16} /> 资料内容</span>
              <textarea
                value={source}
                onChange={event => {
                  setSource(event.target.value);
                  setError('');
                }}
                placeholder="粘贴 TXT；或粘贴 AetherOS / 酒馆 JSON……"
                className="min-h-[44vh] w-full resize-y rounded-[24px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <button
              type="button"
              onClick={() => void importSource(source)}
              disabled={saving || !source.trim()}
              className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white shadow-lg disabled:opacity-40"
            >
              {saving ? '正在带进来…' : '导入这份资料'}
            </button>
          </div>

        {error && (
          <div role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-xs leading-5 text-red-600">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorldbookImportScreen;
