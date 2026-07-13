
import React, { useState, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { processImage } from '../utils/file';
import AppHeader from '../components/shell/AppHeader';
import { CALL_PORTRAIT_UPLOAD_HELP, SUPPORTED_UPLOAD_IMAGE_ACCEPT } from '../utils/uploadGuidance';
import { DEEPSPACE_IDENTITY_MODE_DESCRIPTIONS, DEEPSPACE_IDENTITY_MODE_LABELS, DEFAULT_DEEPSPACE_USER_IDENTITY_MODE, resolveDeepSpaceIdentityMode } from '../utils/deepspaceIdentity';
import type { UserDeepSpaceIdentityMode } from '../types';

const DEEPSPACE_IDENTITY_OPTIONS: UserDeepSpaceIdentityMode[] = [
    'custom_non_hunter',
    'custom_hunter',
    'canon_hunter',
];

const UserApp: React.FC = () => {
    const { closeApp, userProfile, updateUserProfile, addToast } = useOS();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const callPortraitInputRef = useRef<HTMLInputElement>(null);
    const deepspaceIdentityMode = resolveDeepSpaceIdentityMode(userProfile);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await processImage(file);
                updateUserProfile({ avatar: base64 });
                addToast('头像已更新', 'success');
            } catch (err: any) {
                addToast(err.message, 'error');
            }
        }
    };

    const handleCallPortraitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await processImage(file);
                updateUserProfile({ callPortrait: base64 });
                addToast('通话立绘已更新', 'success');
            } catch (err: any) {
                addToast(err.message, 'error');
            } finally {
                if (callPortraitInputRef.current) callPortraitInputRef.current.value = '';
            }
        }
    };

    const clearCallPortrait = () => {
        updateUserProfile({ callPortrait: undefined });
        addToast('通话立绘已跟随头像', 'info');
    };

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col animate-fade-in">
            <AppHeader title="个人档案" onBack={closeApp} />

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-3xl bg-white shadow-sm border border-slate-100 p-4 cursor-pointer group relative active:scale-[0.99] transition"
                    >
                        <div className="mx-auto w-20 h-20 rounded-full bg-slate-100 p-1 shadow-inner">
                            <img src={userProfile.avatar} className="w-full h-full rounded-full object-cover group-hover:opacity-80 transition-opacity" />
                        </div>
                        <div className="mt-3 text-center">
                            <div className="text-sm font-bold text-slate-700">头像</div>
                            <div className="mt-1 text-[11px] text-slate-400">更换</div>
                        </div>
                    </div>
                    <div
                        onClick={() => callPortraitInputRef.current?.click()}
                        className="rounded-3xl bg-white shadow-sm border border-slate-100 p-4 cursor-pointer group relative overflow-hidden active:scale-[0.99] transition"
                    >
                        <div className="mx-auto w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden p-1 shadow-inner">
                            <img src={userProfile.callPortrait || userProfile.avatar} className="w-full h-full rounded-[1rem] object-cover group-hover:opacity-80 transition-opacity" />
                        </div>
                        <div className="mt-3 text-center">
                            <div className="text-sm font-bold text-slate-700">通话立绘</div>
                            <div className="mt-1 text-[11px] text-slate-400">{userProfile.callPortrait ? '已设置' : '跟随头像'}</div>
                        </div>
                        {userProfile.callPortrait && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearCallPortrait();
                                }}
                                className="absolute right-2 top-2 rounded-full bg-slate-900/70 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm"
                            >
                                跟随头像
                            </button>
                        )}
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT} onChange={handleAvatarChange} />
                    <input type="file" ref={callPortraitInputRef} className="hidden" accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT} onChange={handleCallPortraitChange} />
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white/75 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500 shadow-sm">
                    {CALL_PORTRAIT_UPLOAD_HELP}
                </div>

                {/* Info Form */}
                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">你的名字</label>
                        <input 
                            value={userProfile.name}
                            onChange={(e) => updateUserProfile({ name: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base font-semibold text-slate-700 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">深空身份模式</label>
                        <p className="text-[10px] text-slate-400 mb-3">
                            这只决定系统是否自动套用“原作主控/灵空猎人”身份。非猎人自设不会把深空角色赶出世界，他们仍可随着剧情进入你的关系网。
                        </p>
                        <div className="space-y-2">
                            {DEEPSPACE_IDENTITY_OPTIONS.map(mode => {
                                const active = deepspaceIdentityMode === mode;
                                return (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => updateUserProfile({ deepspaceIdentityMode: mode })}
                                        className={`w-full text-left rounded-2xl border p-3 transition-all active:scale-[0.99] ${
                                            active
                                                ? 'border-rose-200 bg-rose-50/70 shadow-sm'
                                                : 'border-slate-100 bg-white hover:border-rose-100'
                                        }`}
                                    >
                                        <div className={`text-sm font-bold ${active ? 'text-rose-600' : 'text-slate-700'}`}>
                                            {DEEPSPACE_IDENTITY_MODE_LABELS[mode]}
                                            {mode === DEFAULT_DEEPSPACE_USER_IDENTITY_MODE && (
                                                <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold text-slate-400">默认</span>
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
                            value={userProfile.deepspaceIdentityNote || ''}
                            onChange={(e) => updateUserProfile({ deepspaceIdentityNote: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                            placeholder="例如：临空大学学生、画廊策展人、普通市民、医生、记者……"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">关于我 / 设定</label>
                        <p className="text-[10px] text-slate-400 mb-2">这些信息会发送给 AI，让它知道你是谁 (例如：大学生、喜欢吃辣、性格内向)。</p>
                        <textarea 
                            value={userProfile.bio}
                            onChange={(e) => updateUserProfile({ bio: e.target.value })}
                            className="w-full h-40 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed resize-none focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                            placeholder="描述你自己..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserApp;
