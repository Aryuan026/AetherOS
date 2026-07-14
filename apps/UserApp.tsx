import React, { useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { processImage } from '../utils/file';
import AppHeader from '../components/shell/AppHeader';
import { CALL_PORTRAIT_UPLOAD_HELP, SUPPORTED_UPLOAD_IMAGE_ACCEPT } from '../utils/uploadGuidance';
import {
    DEEPSPACE_IDENTITY_MODE_DESCRIPTIONS,
    DEEPSPACE_IDENTITY_MODE_LABELS,
    DEFAULT_DEEPSPACE_USER_IDENTITY_MODE,
    resolveDeepSpaceIdentityMode,
} from '../utils/deepspaceIdentity';
import {
    createProgressBundleForMask,
    createUserPersonaMaskFromProfile,
    getActivePersonaMask,
    normalizeUserPersonaProfile,
    switchUserPersonaMask,
} from '../utils/userPersonaMasks';
import type { UserDeepSpaceIdentityMode, UserPersonaMask } from '../types';

const IDENTITY_OPTIONS: UserDeepSpaceIdentityMode[] = [
    'custom_world',
    'custom_non_hunter',
    'custom_hunter',
    'canon_hunter',
];

const cloneMaskForDraft = (mask: UserPersonaMask): UserPersonaMask => ({
    ...mask,
    linkedCharacterIds: [...(mask.linkedCharacterIds || [])],
});

const formatMaskTime = (timestamp?: number): string => {
    if (!timestamp) return '尚未使用';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return '刚刚使用';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

const UserApp: React.FC = () => {
    const { closeApp, userProfile, updateUserProfile, addToast, characters } = useOS();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const callPortraitInputRef = useRef<HTMLInputElement>(null);

    const [view, setView] = useState<'list' | 'detail'>('list');
    const [editingMaskId, setEditingMaskId] = useState<string | null>(null);
    const [draftMask, setDraftMask] = useState<UserPersonaMask | null>(null);

    const personaProfile = normalizeUserPersonaProfile(userProfile);
    const personaMasks = personaProfile.personaMasks || [];
    const progressBundles = personaProfile.progressBundles || [];
    const activeMask = getActivePersonaMask(personaProfile);

    const linkedCharactersFor = (mask: UserPersonaMask) => {
        const ids = new Set(mask.linkedCharacterIds || []);
        return characters.filter(char => ids.has(char.id));
    };

    const openMaskDetail = (mask: UserPersonaMask) => {
        setEditingMaskId(mask.id);
        setDraftMask(cloneMaskForDraft(mask));
        setView('detail');
    };

    const handleSwitchMask = (maskId: string) => {
        const next = switchUserPersonaMask(personaProfile, maskId);
        updateUserProfile(next);
        const target = next.personaMasks?.find(mask => mask.id === maskId);
        addToast(`已切换到 ${target?.label || '面具'}`, 'success');
    };

    const handleCreateMask = () => {
        const newMask = createUserPersonaMaskFromProfile(personaProfile, {
            label: `面具 ${personaMasks.length + 1}`,
            copyCurrent: true,
        });
        const newBundle = createProgressBundleForMask(newMask);
        updateUserProfile({
            name: newMask.name,
            avatar: newMask.avatar,
            avatarFramePresetId: newMask.avatarFramePresetId,
            callPortrait: newMask.callPortrait,
            bio: newMask.bio,
            deepspaceIdentityMode: newMask.deepspaceIdentityMode,
            deepspaceIdentityNote: newMask.deepspaceIdentityNote,
            personaMasks: [...personaMasks, newMask],
            progressBundles: [...progressBundles, newBundle],
            activePersonaMaskId: newMask.id,
            activeProgressBundleId: newMask.progressBundleId,
        });
        setEditingMaskId(newMask.id);
        setDraftMask(cloneMaskForDraft(newMask));
        setView('detail');
        addToast('已新建面具，请设置后保存', 'success');
    };

    const handleDeleteMask = (maskId: string) => {
        if (personaMasks.length <= 1) {
            addToast('至少保留一个身份面具', 'info');
            return;
        }
        const target = personaMasks.find(mask => mask.id === maskId);
        if (!target) return;
        const ok = window.confirm(`删除「${target.label}」？这只会删除面具入口，不会清空聊天或角色数据。`);
        if (!ok) return;

        const remainingMasks = personaMasks.filter(mask => mask.id !== maskId);
        const remainingBundles = progressBundles.filter(bundle => (
            bundle.maskId !== maskId && bundle.id !== target.progressBundleId
        ));
        const deletingActive = activeMask?.id === maskId;
        const nextActive = deletingActive ? remainingMasks[0] : activeMask;

        if (deletingActive && nextActive) {
            updateUserProfile({
                name: nextActive.name,
                avatar: nextActive.avatar,
                avatarFramePresetId: nextActive.avatarFramePresetId,
                callPortrait: nextActive.callPortrait,
                bio: nextActive.bio,
                deepspaceIdentityMode: nextActive.deepspaceIdentityMode,
                deepspaceIdentityNote: nextActive.deepspaceIdentityNote,
                personaMasks: remainingMasks,
                progressBundles: remainingBundles,
                activePersonaMaskId: nextActive.id,
                activeProgressBundleId: nextActive.progressBundleId,
            });
        } else {
            updateUserProfile({
                personaMasks: remainingMasks,
                progressBundles: remainingBundles,
            });
        }

        if (editingMaskId === maskId) {
            setView('list');
            setEditingMaskId(null);
            setDraftMask(null);
        }
        addToast('面具已删除', 'success');
    };

    const updateDraft = (updates: Partial<UserPersonaMask>) => {
        setDraftMask(prev => prev ? { ...prev, ...updates } : prev);
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !draftMask) return;
        try {
            const base64 = await processImage(file);
            updateDraft({ avatar: base64 });
            addToast('头像已放入草稿，保存后生效', 'info');
        } catch (err: any) {
            addToast(err.message, 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleCallPortraitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !draftMask) return;
        try {
            const base64 = await processImage(file);
            updateDraft({ callPortrait: base64 });
            addToast('通话立绘已放入草稿，保存后生效', 'info');
        } catch (err: any) {
            addToast(err.message, 'error');
        } finally {
            if (callPortraitInputRef.current) callPortraitInputRef.current.value = '';
        }
    };

    const toggleLinkedCharacter = (charId: string) => {
        if (!draftMask) return;
        const current = new Set(draftMask.linkedCharacterIds || []);
        if (current.has(charId)) current.delete(charId);
        else current.add(charId);
        updateDraft({ linkedCharacterIds: [...current] });
    };

    const handleSaveDraft = () => {
        if (!draftMask) return;
        const normalizedName = draftMask.name.trim() || 'User';
        const normalizedLabel = draftMask.label.trim() || normalizedName || '未命名面具';
        const validCharIds = new Set(characters.map(char => char.id));
        const now = Date.now();
        const updatedMask: UserPersonaMask = {
            ...draftMask,
            name: normalizedName,
            label: normalizedLabel,
            bio: draftMask.bio || '',
            deepspaceIdentityMode: draftMask.deepspaceIdentityMode || DEFAULT_DEEPSPACE_USER_IDENTITY_MODE,
            deepspaceIdentityNote: draftMask.deepspaceIdentityNote || '',
            linkedCharacterIds: [...new Set((draftMask.linkedCharacterIds || []).filter(id => validCharIds.has(id)))],
            updatedAt: now,
        };

        const updatedMasks = personaMasks.map(mask => (
            mask.id === updatedMask.id ? updatedMask : mask
        ));
        const updatedBundles = progressBundles.map(bundle => (
            bundle.id === updatedMask.progressBundleId
                ? { ...bundle, label: `${updatedMask.label}进度套组`, updatedAt: now }
                : bundle
        ));
        const editingActive = activeMask?.id === updatedMask.id;

        if (editingActive) {
            updateUserProfile({
                name: updatedMask.name,
                avatar: updatedMask.avatar,
                avatarFramePresetId: updatedMask.avatarFramePresetId,
                callPortrait: updatedMask.callPortrait,
                bio: updatedMask.bio,
                deepspaceIdentityMode: updatedMask.deepspaceIdentityMode,
                deepspaceIdentityNote: updatedMask.deepspaceIdentityNote,
                personaMasks: updatedMasks,
                progressBundles: updatedBundles,
                activePersonaMaskId: updatedMask.id,
                activeProgressBundleId: updatedMask.progressBundleId,
            });
        } else {
            updateUserProfile({
                personaMasks: updatedMasks,
                progressBundles: updatedBundles,
            });
        }

        setDraftMask(cloneMaskForDraft(updatedMask));
        addToast('面具设置已保存', 'success');
        setView('list');
    };

    if (view === 'detail' && draftMask) {
        const draftIdentityMode = draftMask.deepspaceIdentityMode || DEFAULT_DEEPSPACE_USER_IDENTITY_MODE;
        const linkedIds = new Set(draftMask.linkedCharacterIds || []);

        return (
            <div className="h-full w-full bg-slate-50 flex flex-col animate-fade-in">
                <AppHeader title="面具设置" onBack={() => setView('list')} />

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <section className="rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-sm">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">面具名称</label>
                        <input
                            value={draftMask.label}
                            onChange={(e) => updateDraft({ label: e.target.value })}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-100"
                            placeholder="例如：非猎人自设线"
                        />
                    </section>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-3xl bg-white shadow-sm border border-slate-100 p-4 cursor-pointer group relative active:scale-[0.99] transition"
                        >
                            <div className="mx-auto w-20 h-20 rounded-full bg-slate-100 p-1 shadow-inner">
                                <img src={draftMask.avatar} className="w-full h-full rounded-full object-cover group-hover:opacity-80 transition-opacity" />
                            </div>
                            <div className="mt-3 text-center">
                                <div className="text-sm font-bold text-slate-700">头像</div>
                                <div className="mt-1 text-[11px] text-slate-400">保存后生效</div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => callPortraitInputRef.current?.click()}
                            className="rounded-3xl bg-white shadow-sm border border-slate-100 p-4 cursor-pointer group relative overflow-hidden active:scale-[0.99] transition"
                        >
                            <div className="mx-auto w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden p-1 shadow-inner">
                                <img src={draftMask.callPortrait || draftMask.avatar} className="w-full h-full rounded-[1rem] object-cover group-hover:opacity-80 transition-opacity" />
                            </div>
                            <div className="mt-3 text-center">
                                <div className="text-sm font-bold text-slate-700">通话立绘</div>
                                <div className="mt-1 text-[11px] text-slate-400">{draftMask.callPortrait ? '已设置' : '跟随头像'}</div>
                            </div>
                            {draftMask.callPortrait && (
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateDraft({ callPortrait: undefined });
                                    }}
                                    className="absolute right-2 top-2 rounded-full bg-slate-900/70 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm"
                                >
                                    跟随头像
                                </span>
                            )}
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT} onChange={handleAvatarChange} />
                        <input type="file" ref={callPortraitInputRef} className="hidden" accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT} onChange={handleCallPortraitChange} />
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white/75 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500 shadow-sm">
                        {CALL_PORTRAIT_UPLOAD_HELP}
                    </div>

                    <section className="space-y-5 rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-sm">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">user 名字</label>
                            <input
                                value={draftMask.name}
                                onChange={(e) => updateDraft({ name: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base font-semibold text-slate-700 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                                placeholder="这个面具下，角色怎么称呼你"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">世界 / 身份模式</label>
                            <p className="text-[10px] text-slate-400 mb-3">
                                如果是原创世界或全新角色卡，选「通用自设」。如果是深空路线，再选择非猎人、猎人或原作主控。
                            </p>
                            <div className="space-y-2">
                                {IDENTITY_OPTIONS.map(mode => {
                                    const active = draftIdentityMode === mode;
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => updateDraft({ deepspaceIdentityMode: mode })}
                                            className={`w-full text-left rounded-2xl border p-3 transition-all active:scale-[0.99] ${
                                                active
                                                    ? 'border-indigo-200 bg-indigo-50/80 shadow-sm'
                                                    : 'border-slate-100 bg-white hover:border-indigo-100'
                                            }`}
                                        >
                                            <div className={`text-sm font-bold ${active ? 'text-indigo-700' : 'text-slate-700'}`}>
                                                {DEEPSPACE_IDENTITY_MODE_LABELS[mode]}
                                                {mode === DEFAULT_DEEPSPACE_USER_IDENTITY_MODE && (
                                                    <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold text-slate-400">深空默认</span>
                                                )}
                                            </div>
                                            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                                {DEEPSPACE_IDENTITY_MODE_DESCRIPTIONS[mode]}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">身份补充 / 职业</label>
                            <input
                                value={draftMask.deepspaceIdentityNote || ''}
                                onChange={(e) => updateDraft({ deepspaceIdentityNote: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                                placeholder="例如：临空大学学生、原创世界的药剂师、记者、普通市民……"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">关于我 / 设定</label>
                            <p className="text-[10px] text-slate-400 mb-2">保存后会进入当前面具，并同步给聊天、电话、见面等 prompt。</p>
                            <textarea
                                value={draftMask.bio}
                                onChange={(e) => updateDraft({ bio: e.target.value })}
                                className="w-full h-36 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed resize-none focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                                placeholder="描述这个面具下的你..."
                            />
                        </div>
                    </section>

                    <section className="rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-extrabold text-slate-800">建立链接的角色</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                                    这是切换面具时的识别标记，也会作为后续剧情/约会套组接入的候选关系网。
                                </p>
                            </div>
                            <div className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400">
                                {linkedIds.size} 个
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {characters.map(char => {
                                const active = linkedIds.has(char.id);
                                return (
                                    <button
                                        key={char.id}
                                        type="button"
                                        onClick={() => toggleLinkedCharacter(char.id)}
                                        className={`flex items-center gap-2 rounded-2xl border p-2 text-left transition-all active:scale-[0.98] ${
                                            active
                                                ? 'border-indigo-200 bg-indigo-50'
                                                : 'border-slate-100 bg-slate-50/70'
                                        }`}
                                    >
                                        <img src={char.avatar} className="h-8 w-8 rounded-full object-cover ring-2 ring-white" />
                                        <div className="min-w-0">
                                            <div className={`truncate text-xs font-bold ${active ? 'text-indigo-700' : 'text-slate-600'}`}>{char.name}</div>
                                            <div className="text-[9px] text-slate-400">{active ? '已链接' : '可链接'}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white/90 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        className="w-full rounded-2xl bg-indigo-600 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-indigo-200 active:scale-[0.99]"
                    >
                        保存面具设置
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col animate-fade-in">
            <AppHeader title="身份面具" onBack={closeApp} />

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <section className="rounded-[1.75rem] border border-indigo-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-extrabold text-slate-800">选择当前 user 身份</div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                                这里像存档槽：先选面具，再进入聊天、见面、剧情或社交。设置细节请点每条右侧的「设置」。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleCreateMask}
                            className="shrink-0 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-600 active:scale-95"
                        >
                            + 新建
                        </button>
                    </div>
                </section>

                <div className="space-y-3">
                    {personaMasks.map(mask => {
                        const active = activeMask?.id === mask.id;
                        const linkedChars = linkedCharactersFor(mask);
                        return (
                            <article
                                key={mask.id}
                                className={`rounded-[1.5rem] border bg-white p-4 shadow-sm transition-all ${
                                    active ? 'border-indigo-200 ring-2 ring-indigo-50' : 'border-slate-100'
                                }`}
                            >
                                <div className="flex gap-3">
                                    <img src={mask.avatar} className="h-12 w-12 rounded-2xl object-cover ring-2 ring-slate-50" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="truncate text-sm font-extrabold text-slate-800">{mask.label}</h3>
                                            {active && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600">使用中</span>}
                                        </div>
                                        <div className="mt-1 truncate text-xs font-semibold text-slate-500">
                                            user：{mask.name || '未命名'}
                                        </div>
                                        <div className="mt-1 text-[10px] text-slate-400">
                                            最近使用：{formatMaskTime(mask.lastUsedAt || mask.updatedAt)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50/80 px-3 py-2">
                                    <div className="flex -space-x-2">
                                        {linkedChars.slice(0, 5).map(char => (
                                            <img key={char.id} src={char.avatar} className="h-6 w-6 rounded-full border-2 border-white object-cover" title={char.name} />
                                        ))}
                                        {linkedChars.length > 5 && (
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[9px] font-bold text-slate-500">
                                                +{linkedChars.length - 5}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1 truncate text-[10px] text-slate-400">
                                        {linkedChars.length > 0
                                            ? `链接：${linkedChars.map(char => char.name).join('、')}`
                                            : '尚未建立角色链接'}
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        disabled={active}
                                        onClick={() => handleSwitchMask(mask.id)}
                                        className={`rounded-xl px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${
                                            active
                                                ? 'bg-slate-100 text-slate-400'
                                                : 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                                        }`}
                                    >
                                        {active ? '当前' : '切换'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openMaskDetail(mask)}
                                        className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition active:scale-[0.98]"
                                    >
                                        设置
                                    </button>
                                    <button
                                        type="button"
                                        disabled={personaMasks.length <= 1}
                                        onClick={() => handleDeleteMask(mask.id)}
                                        className={`rounded-xl px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${
                                            personaMasks.length <= 1
                                                ? 'bg-slate-100 text-slate-300'
                                                : 'bg-rose-50 text-rose-500'
                                        }`}
                                    >
                                        删除
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default UserApp;
