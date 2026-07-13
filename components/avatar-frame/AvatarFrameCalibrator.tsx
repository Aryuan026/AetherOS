import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, SlidersHorizontal, Trash, UploadSimple, UserCircle } from '@phosphor-icons/react';
import { AvatarFrameCalibration, AvatarFramePreset, CharacterProfile, OSTheme, Toast, UserProfile } from '../../types';
import { processImage } from '../../utils/file';
import {
  DEFAULT_AVATAR_FRAME_CALIBRATION,
  mergeAvatarFramePresets,
  normalizeAvatarFrameCalibration,
} from '../../utils/avatarFrames';
import AvatarWithFrame from '../common/AvatarWithFrame';

type TargetKind = 'character' | 'user';

interface AvatarFrameCalibratorProps {
  theme: OSTheme;
  updateTheme: (updates: Partial<OSTheme>) => void;
  characters: CharacterProfile[];
  userProfile: UserProfile;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  updateCharacter: (id: string, updates: Partial<CharacterProfile>) => void;
  addToast: (message: string, type?: Toast['type']) => void;
}

const builtInFrameMap: Record<string, string> = {
  'builtin-xavier': 'builtin-frame-xavier',
  'builtin-zayne': 'builtin-frame-zayne',
  'builtin-daily-companion': 'builtin-frame-qiyu',
  'builtin-sylus': 'builtin-frame-sylus',
  'builtin-caleb': 'builtin-frame-caleb',
};

const USER_FRAME_OWNER_ID = 'user';
const MAX_AVATAR_FRAME_FILE_BYTES = 8 * 1024 * 1024;
const AVATAR_FRAME_PERSIST_DEBOUNCE_MS = 250;
const rangeClass = 'w-full accent-primary';

const getDisplayName = (fileName: string) => {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base || '自定义头像框';
};

const sliderMeta: Array<{
  key: keyof AvatarFrameCalibration;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}> = [
  { key: 'frameScale', label: '框大小', min: 0.7, max: 1.45, step: 0.01 },
  { key: 'frameX', label: '框左右', min: -35, max: 35, step: 1, suffix: '%' },
  { key: 'frameY', label: '框上下', min: -35, max: 35, step: 1, suffix: '%' },
];

const AvatarFrameCalibrator: React.FC<AvatarFrameCalibratorProps> = ({
  theme,
  updateTheme,
  characters,
  userProfile,
  updateUserProfile,
  updateCharacter,
  addToast,
}) => {
  const uploadRef = useRef<HTMLInputElement>(null);
  const sourcePresets = useMemo(() => mergeAvatarFramePresets(theme.avatarFramePresets), [theme.avatarFramePresets]);
  const [presets, setPresets] = useState(sourcePresets);
  const persistTimerRef = useRef<number | null>(null);
  const pendingPresetsRef = useRef<AvatarFramePreset[] | null>(null);
  const updateThemeRef = useRef(updateTheme);
  updateThemeRef.current = updateTheme;
  const [targetKind, setTargetKind] = useState<TargetKind>('character');
  const [selectedCharId, setSelectedCharId] = useState(() => characters[0]?.id || '');
  const [selectedPresetId, setSelectedPresetId] = useState(() => presets[0]?.id || '');
  const selectedChar = characters.find(char => char.id === selectedCharId) || characters[0];
  const targetOwnerType: AvatarFramePreset['ownerType'] = targetKind === 'user' ? 'user' : 'character';
  const targetOwnerId = targetKind === 'user' ? USER_FRAME_OWNER_ID : (selectedChar?.id || '');
  const targetPresets = useMemo(
    () => presets.filter(preset => preset.ownerType === targetOwnerType && preset.ownerId === targetOwnerId),
    [presets, targetOwnerId, targetOwnerType]
  );
  const currentTargetPresetId = targetKind === 'user'
    ? userProfile.avatarFramePresetId
    : selectedChar?.avatarFramePresetId;
  const currentTargetPreset = targetPresets.find(preset => preset.id === currentTargetPresetId);
  const selectedPreset = targetPresets.find(preset => preset.id === selectedPresetId);
  const targetAvatar = targetKind === 'user'
    ? userProfile.avatar
    : (selectedChar?.avatar || userProfile.avatar);
  const targetName = targetKind === 'user'
    ? userProfile.name
    : (selectedChar?.name || '角色');
  const targetDefaultFrameId = targetKind === 'character' ? builtInFrameMap[selectedChar?.id || ''] : undefined;
  const calibration = normalizeAvatarFrameCalibration(selectedPreset?.calibration);

  useEffect(() => {
    if (!selectedCharId && characters[0]?.id) {
      setSelectedCharId(characters[0].id);
    }
  }, [characters, selectedCharId]);

  useEffect(() => {
    if (!pendingPresetsRef.current) {
      setPresets(sourcePresets);
    }
  }, [sourcePresets]);

  useEffect(() => () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    if (pendingPresetsRef.current) {
      updateThemeRef.current({ avatarFramePresets: pendingPresetsRef.current });
      pendingPresetsRef.current = null;
    }
  }, []);

  useEffect(() => {
    const selectedStillAvailable = selectedPresetId && targetPresets.some(preset => preset.id === selectedPresetId);
    const currentStillAvailable = currentTargetPresetId && targetPresets.some(preset => preset.id === currentTargetPresetId);
    const nextId = currentStillAvailable
      ? currentTargetPresetId
      : selectedStillAvailable
        ? selectedPresetId
        : targetPresets[0]?.id || '';
    if (selectedPresetId !== nextId) {
      setSelectedPresetId(nextId);
    }
  }, [currentTargetPresetId, selectedPresetId, targetPresets]);

  const writePresets = (nextPresets: AvatarFramePreset[], deferPersist = false) => {
    const merged = mergeAvatarFramePresets(nextPresets);
    setPresets(merged);

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    if (!deferPersist) {
      pendingPresetsRef.current = null;
      updateTheme({ avatarFramePresets: merged });
      return;
    }

    pendingPresetsRef.current = merged;
    persistTimerRef.current = window.setTimeout(() => {
      const pending = pendingPresetsRef.current;
      pendingPresetsRef.current = null;
      persistTimerRef.current = null;
      if (pending) updateThemeRef.current({ avatarFramePresets: pending });
    }, AVATAR_FRAME_PERSIST_DEBOUNCE_MS);
  };

  const updateSelectedPreset = (
    patch: Omit<Partial<AvatarFramePreset>, 'calibration'> & { calibration?: Partial<AvatarFrameCalibration> }
  ) => {
    if (!selectedPreset) return;
    const now = Date.now();
    const nextPresets = presets.map(preset => {
      if (preset.id !== selectedPreset.id) return preset;
      return {
        ...preset,
        ...patch,
        calibration: normalizeAvatarFrameCalibration({
          ...preset.calibration,
          ...(patch.calibration || {}),
        }),
        updatedAt: now,
      };
    });
    writePresets(nextPresets, true);
  };

  const applyPresetToTarget = (presetId: string | undefined) => {
    if (targetKind === 'user') {
      updateUserProfile({ avatarFramePresetId: presetId });
      addToast(presetId ? '已应用到用户头像' : '用户头像已不挂框', 'success');
      return;
    }
    if (!selectedChar) return;
    updateCharacter(selectedChar.id, { avatarFramePresetId: presetId });
    addToast(presetId ? `已应用到 ${selectedChar.name}` : `${selectedChar.name} 已不挂框`, 'success');
  };

  const applyDefaultForTarget = () => {
    if (!selectedChar || !targetDefaultFrameId) return;
    updateCharacter(selectedChar.id, { avatarFramePresetId: targetDefaultFrameId });
    addToast(`已给 ${selectedChar.name} 应用默认头像框`, 'success');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_FRAME_FILE_BYTES) {
      addToast('头像框图片过大，请控制在 8MB 内', 'error');
      if (uploadRef.current) uploadRef.current.value = '';
      return;
    }
    try {
      const src = await processImage(file, { maxWidth: 1024, quality: 0.9 });
      const id = `custom-frame-${Date.now()}`;
      const nextPreset: AvatarFramePreset = {
        id,
        name: getDisplayName(file.name),
        src,
        calibration: { ...DEFAULT_AVATAR_FRAME_CALIBRATION },
        ownerType: targetOwnerType,
        ownerId: targetOwnerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      writePresets([...presets, nextPreset]);
      setSelectedPresetId(id);
      addToast(`头像框已加入 ${targetName} 的框库`, 'success');
    } catch (error: any) {
      addToast(error?.message || '头像框上传失败', 'error');
    } finally {
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const deleteSelectedPreset = () => {
    if (!selectedPreset || selectedPreset.isBuiltIn) return;
    const nextPresets = presets.filter(preset => preset.id !== selectedPreset.id);
    writePresets(nextPresets);
    characters
      .filter(char => char.avatarFramePresetId === selectedPreset.id)
      .forEach(char => updateCharacter(char.id, { avatarFramePresetId: undefined }));
    if (userProfile.avatarFramePresetId === selectedPreset.id) {
      updateUserProfile({ avatarFramePresetId: undefined });
    }
    const nextTargetPreset = nextPresets.find(
      preset => preset.ownerType === targetOwnerType && preset.ownerId === targetOwnerId
    );
    setSelectedPresetId(nextTargetPreset?.id || '');
    addToast('已删除自定义头像框', 'success');
  };

  const resetCalibration = () => {
    updateSelectedPreset({ calibration: { ...DEFAULT_AVATAR_FRAME_CALIBRATION } });
    addToast('已重置当前头像框参数', 'success');
  };

  const renderPreview = (
    sizeClass: string,
    label: string,
    framePreset?: AvatarFramePreset,
    roundedClassName = 'rounded-full'
  ) => (
    <div className="flex flex-col items-center gap-2">
      <div className={`${sizeClass} rounded-full bg-white shadow-inner ring-1 ring-slate-100 flex items-center justify-center`}>
        {framePreset ? (
          <AvatarWithFrame
            src={targetAvatar}
            framePreset={framePreset}
            className="w-full h-full"
            roundedClassName={roundedClassName}
            alt={targetName}
            loading="eager"
          />
        ) : (
          <AvatarWithFrame
            src={targetAvatar}
            className="w-full h-full"
            roundedClassName={roundedClassName}
            alt={targetName}
            loading="eager"
          />
        )}
      </div>
      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
    </div>
  );

  return (
    <div className="space-y-4 pb-20">
      <section className="rounded-3xl border border-white/70 bg-white/72 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <SlidersHorizontal size={17} weight="bold" />
              头像框校准器
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              每个角色只看到自己的头像框；框参数随头像框保存。
            </p>
          </div>
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm active:scale-95"
          >
            <UploadSimple size={14} className="mr-1 inline" />
            上传框
          </button>
          <input ref={uploadRef} type="file" accept="image/png,image/webp,image/gif,image/*" className="hidden" onChange={handleUpload} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/70 p-1">
          {(['character', 'user'] as TargetKind[]).map(kind => (
            <button
              key={kind}
              type="button"
              onClick={() => setTargetKind(kind)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                targetKind === kind ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
              }`}
            >
              {kind === 'character' ? '角色头像' : '用户头像'}
            </button>
          ))}
        </div>

        {targetKind === 'character' && (
          <select
            value={selectedChar?.id || ''}
            onChange={(e) => setSelectedCharId(e.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
          >
            {characters.map(char => (
              <option key={char.id} value={char.id}>{char.name}</option>
            ))}
          </select>
        )}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/72 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800">{targetName}</div>
            <div className="text-[11px] text-slate-400">
              {currentTargetPresetId
                ? `当前挂框：${currentTargetPreset?.name || '未找到'}`
                : '当前不挂头像框'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => applyPresetToTarget(undefined)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 active:scale-95"
          >
            不挂框
          </button>
        </div>

        <div className="mt-4 flex items-end justify-around rounded-3xl bg-slate-50/90 px-4 py-5">
          {renderPreview('h-24 w-24', '大头像', currentTargetPreset)}
          {renderPreview('h-14 w-14', '聊天', currentTargetPreset)}
          {renderPreview('h-12 w-12', '列表', currentTargetPreset)}
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/72 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-slate-800">头像框库</div>
            <div className="text-[11px] text-slate-400">可用头像框 {targetPresets.length} 个</div>
          </div>
          {targetDefaultFrameId && (
            <button
              type="button"
              onClick={applyDefaultForTarget}
              className="rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-500 active:scale-95"
            >
              应用默认
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => applyPresetToTarget(undefined)}
            className={`relative rounded-2xl border bg-white p-2 text-left transition-all ${
              !currentTargetPresetId ? 'border-primary shadow-sm ring-2 ring-primary/15' : 'border-slate-100'
            }`}
          >
            <div className="mx-auto h-14 w-14">
              <AvatarWithFrame
                src={targetAvatar}
                className="h-full w-full"
                alt={`${targetName} 不挂框`}
                loading="lazy"
              />
            </div>
            <div className="mt-2 truncate text-[10px] font-bold text-slate-600">不挂框</div>
            <div className="text-[9px] text-slate-400">原头像</div>
            {!currentTargetPresetId && (
              <span className="absolute right-2 top-2 rounded-full bg-emerald-500 p-0.5 text-white">
                <Check size={10} weight="bold" />
              </span>
            )}
          </button>
          {targetPresets.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelectedPresetId(preset.id)}
              className={`relative rounded-2xl border bg-white p-2 text-left transition-all ${
                selectedPresetId === preset.id ? 'border-primary shadow-sm ring-2 ring-primary/15' : 'border-slate-100'
              }`}
            >
              <div className="mx-auto h-14 w-14">
                <AvatarWithFrame
                  src={targetAvatar}
                  framePreset={preset}
                  className="h-full w-full"
                  alt={preset.name}
                  loading="lazy"
                />
              </div>
              <div className="mt-2 truncate text-[10px] font-bold text-slate-600">{preset.name}</div>
              <div className="text-[9px] text-slate-400">{preset.isBuiltIn ? '内置' : '自定义'}</div>
              {currentTargetPresetId === preset.id && (
                <span className="absolute right-2 top-2 rounded-full bg-emerald-500 p-0.5 text-white">
                  <Check size={10} weight="bold" />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {selectedPreset && (
        <section className="rounded-3xl border border-white/70 bg-white/72 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-800">{selectedPreset.name}</div>
              <div className="text-[11px] text-slate-400">调整会直接保存到这个头像框。</div>
            </div>
            <div className="flex shrink-0 gap-2">
              {!selectedPreset.isBuiltIn && (
                <button
                  type="button"
                  onClick={deleteSelectedPreset}
                  className="rounded-full bg-rose-50 p-2 text-rose-500 active:scale-95"
                  title="删除自定义头像框"
                >
                  <Trash size={15} weight="bold" />
                </button>
              )}
              <button
                type="button"
                onClick={() => applyPresetToTarget(selectedPreset.id)}
                className="rounded-full bg-primary px-3 py-2 text-[11px] font-bold text-white shadow-sm active:scale-95"
              >
                应用此框
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-end justify-around rounded-3xl bg-slate-50/90 px-4 py-4">
            {renderPreview('h-20 w-20', '圆形头像', selectedPreset)}
            {renderPreview('h-16 w-16', '聊天头像', selectedPreset)}
            {renderPreview('h-16 w-16', '微信头像', selectedPreset, 'rounded-2xl')}
          </div>

          <div className="space-y-3">
            {sliderMeta.map(item => (
              <label key={item.key} className="block rounded-2xl bg-slate-50/80 px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span>{item.label}</span>
                  <span className="tabular-nums text-slate-400">
                    {Number(calibration[item.key]).toFixed(item.step < 1 ? 2 : 0)}{item.suffix || ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={calibration[item.key]}
                  onChange={(e) => updateSelectedPreset({ calibration: { [item.key]: Number(e.target.value) } })}
                  className={rangeClass}
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={resetCalibration}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 active:scale-95"
            >
              重置参数
            </button>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
              <UserCircle size={14} />
              参数随头像框保存
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default AvatarFrameCalibrator;
