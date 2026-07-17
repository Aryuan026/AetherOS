import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, PencilSimple, UserCircle } from '@phosphor-icons/react';
import type { CharacterProfile, UserProfile } from '../../types';
import {
  buildHistoryIdentityBindingDraft,
  HISTORY_IDENTITY_PLACEHOLDER_CHOICE,
  type HistoryCharacterBindingCandidate,
  type HistoryIdentityBindingDraft,
  type HistoryMaskBindingCandidate,
} from '../../domain/historyImport/identityBinding';
import { normalizeUserPersonaProfile } from '../../utils/userPersonaMasks';

interface HistoryIdentityBindingProps {
  userProfile: UserProfile;
  characters: CharacterProfile[];
  activeCharacterId?: string;
  onLockChange?: (draft: HistoryIdentityBindingDraft, locked: boolean) => void;
}

const createDraftSeed = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const HistoryIdentityBinding: React.FC<HistoryIdentityBindingProps> = ({
  userProfile,
  characters,
  activeCharacterId,
  onLockChange,
}) => {
  const normalizedProfile = useMemo(
    () => normalizeUserPersonaProfile(userProfile),
    [userProfile],
  );
  const masks = normalizedProfile.personaMasks || [];
  const [draftSeed] = useState(createDraftSeed);
  const [selectedMaskId, setSelectedMaskId] = useState(
    normalizedProfile.activePersonaMaskId || masks[0]?.id || HISTORY_IDENTITY_PLACEHOLDER_CHOICE,
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState(
    characters.some(character => character.id === activeCharacterId)
      ? activeCharacterId!
      : characters[0]?.id || HISTORY_IDENTITY_PLACEHOLDER_CHOICE,
  );
  const [newMaskLabel, setNewMaskLabel] = useState('旧日面具');
  const [newCharacterName, setNewCharacterName] = useState('旧日角色');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (
      selectedMaskId !== HISTORY_IDENTITY_PLACEHOLDER_CHOICE
      && !masks.some(mask => mask.id === selectedMaskId)
    ) {
      setSelectedMaskId(HISTORY_IDENTITY_PLACEHOLDER_CHOICE);
      setLocked(false);
    }
  }, [masks, selectedMaskId]);

  useEffect(() => {
    if (
      selectedCharacterId !== HISTORY_IDENTITY_PLACEHOLDER_CHOICE
      && !characters.some(character => character.id === selectedCharacterId)
    ) {
      setSelectedCharacterId(HISTORY_IDENTITY_PLACEHOLDER_CHOICE);
      setLocked(false);
    }
  }, [characters, selectedCharacterId]);

  const selectedMask = masks.find(mask => mask.id === selectedMaskId);
  const selectedCharacter = characters.find(character => character.id === selectedCharacterId);

  const maskCandidate = useMemo<HistoryMaskBindingCandidate | null>(() => (
    selectedMask
      ? {
          id: selectedMask.id,
          label: selectedMask.label,
          progressBundleId: selectedMask.progressBundleId,
        }
      : null
  ), [selectedMask]);

  const characterCandidate = useMemo<HistoryCharacterBindingCandidate | null>(() => (
    selectedCharacter
      ? { id: selectedCharacter.id, label: selectedCharacter.name }
      : null
  ), [selectedCharacter]);

  const draft = useMemo(() => buildHistoryIdentityBindingDraft({
    draftSeed,
    mask: maskCandidate,
    character: characterCandidate,
    placeholderMaskLabel: newMaskLabel,
    placeholderCharacterLabel: newCharacterName,
  }), [characterCandidate, draftSeed, maskCandidate, newCharacterName, newMaskLabel]);

  useEffect(() => {
    onLockChange?.(draft, locked);
  }, [draft, locked, onLockChange]);

  const chooseMask = (id: string) => {
    setSelectedMaskId(id);
    setLocked(false);
  };

  const chooseCharacter = (id: string) => {
    setSelectedCharacterId(id);
    setLocked(false);
  };

  if (locked) {
    return (
      <section
        data-history-identity-binding="locked"
        className="mt-4 rounded-[1.5rem] border border-emerald-100 bg-white/85 p-4 shadow-[0_12px_34px_rgba(16,185,129,0.08)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <CheckCircle size={21} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black text-emerald-600">第 1 步完成</div>
            <h2 className="mt-0.5 truncate text-sm font-black text-slate-800">
              {draft.mask.label} × {draft.character.label}
            </h2>
            <p className="mt-0.5 text-[10px] text-slate-500">接下来选择聊天记录文件。</p>
          </div>
          <button
            type="button"
            onClick={() => setLocked(false)}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-black text-slate-600"
          >
            <PencilSimple size={12} />
            修改
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      data-history-identity-binding="draft"
      className="mt-4 rounded-[1.75rem] border border-indigo-100/90 bg-white/85 p-4 shadow-[0_16px_45px_rgba(99,102,241,0.09)] backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <UserCircle size={22} weight="duotone" />
        </span>
        <div>
          <div className="text-[10px] font-black text-indigo-500">第 1 步</div>
          <h2 className="mt-0.5 text-lg font-black text-slate-800">这是谁和谁的对话？</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            可以接到现有身份，也可以让这份记录自己新建面具和角色。
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <label className="text-[10px] font-black text-slate-600">
          我使用的面具
          <select
            value={selectedMaskId}
            onChange={event => chooseMask(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-300"
          >
            <option value={HISTORY_IDENTITY_PLACEHOLDER_CHOICE}>＋ 随导入新建</option>
            {masks.map(mask => (
              <option key={mask.id} value={mask.id}>{mask.label}</option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-black text-slate-600">
          对话角色
          <select
            value={selectedCharacterId}
            onChange={event => chooseCharacter(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-300"
          >
            <option value={HISTORY_IDENTITY_PLACEHOLDER_CHOICE}>＋ 随导入新建</option>
            {characters.map(character => (
              <option key={character.id} value={character.id}>{character.name}</option>
            ))}
          </select>
        </label>
      </div>

      {(selectedMaskId === HISTORY_IDENTITY_PLACEHOLDER_CHOICE
        || selectedCharacterId === HISTORY_IDENTITY_PLACEHOLDER_CHOICE) && (
        <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/55 p-3">
          <div className="text-[9px] font-black text-indigo-600">导入完成时再正式创建</div>
          <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
            读文件和校对时只用占位；没有点最终导入，就不会留下空角色。
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {selectedMaskId === HISTORY_IDENTITY_PLACEHOLDER_CHOICE && (
              <label className="text-[9px] font-black text-slate-600">
                新面具名称
                <input
                  value={newMaskLabel}
                  onChange={event => {
                    setNewMaskLabel(event.target.value);
                    setLocked(false);
                  }}
                  placeholder="例如：旧日线"
                  className="mt-1.5 w-full rounded-xl border border-white bg-white px-2.5 py-2.5 text-[10px] font-bold text-slate-700 outline-none focus:border-indigo-300"
                />
              </label>
            )}
            {selectedCharacterId === HISTORY_IDENTITY_PLACEHOLDER_CHOICE && (
              <label className="text-[9px] font-black text-slate-600">
                新角色名称
                <input
                  value={newCharacterName}
                  onChange={event => {
                    setNewCharacterName(event.target.value);
                    setLocked(false);
                  }}
                  placeholder="例如：糯米"
                  className="mt-1.5 w-full rounded-xl border border-white bg-white px-2.5 py-2.5 text-[10px] font-bold text-slate-700 outline-none focus:border-indigo-300"
                />
              </label>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setLocked(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-200/55"
      >
        确认，去选聊天记录
        <ArrowRight size={15} weight="bold" />
      </button>

      <p className="mt-2 text-center text-[9px] leading-relaxed text-slate-400">
        选现有身份只做归类；选新建时，最终导入才会落成真正入口。
      </p>
    </section>
  );
};

export default HistoryIdentityBinding;
