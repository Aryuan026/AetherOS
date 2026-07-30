
import React, { useState, useEffect } from 'react';
import Modal from '../os/Modal';
import { CharacterProfile, CharacterBuff } from '../../types';
import { activeCharacterBuffs, isActiveCharacterPresence } from '../../utils/characterLiveState';

interface EmotionSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    char: CharacterProfile;
    onSave: (config: NonNullable<CharacterProfile['emotionConfig']>) => void;
    onClearBuffs: () => void;
}

const normalizeIntensity = (n: number | undefined | null): 1 | 2 | 3 => {
    const parsed = Number.isFinite(n) ? Math.round(Number(n)) : 2;
    if (parsed <= 1) return 1;
    if (parsed >= 3) return 3;
    return 2;
};

const INTENSITY_DOTS = (n: number | undefined | null) => {
    const safe = normalizeIntensity(n);
    return '●'.repeat(safe) + '○'.repeat(3 - safe);
};

const EmotionSettingsModal: React.FC<EmotionSettingsModalProps> = ({
    isOpen, onClose, char, onSave, onClearBuffs
}) => {
    const [enabled, setEnabled] = useState(false);

    // Sync form from char whenever modal opens
    useEffect(() => {
        if (!isOpen) return;
        const s = char.emotionConfig;
        setEnabled(s?.enabled ?? true);
    }, [isOpen, char.id, char.emotionConfig]);

    const handleSave = () => {
        onSave({ enabled });
        onClose();
    };

    const buffs: CharacterBuff[] = activeCharacterBuffs(char.activeBuffs);
    const presence = isActiveCharacterPresence(char.chatPresenceStatus)
        ? char.chatPresenceStatus
        : undefined;

    return (
        <Modal isOpen={isOpen} title="情绪感知" onClose={onClose} footer={
            <>
                <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform">
                    取消
                </button>
                <button onClick={handleSave} className="flex-1 py-3 bg-pink-500 text-white font-bold rounded-2xl active:scale-95 transition-transform shadow-lg">
                    保存
                </button>
            </>
        }>
            <div className="space-y-5">
                <p className="text-xs text-slate-400 leading-relaxed">
                    开启后，系统主持会从当前对话判断情绪底色，再交给角色用于下一次回复。使用哪份模型统一在“设置 → 系统主持 AI”管理。
                </p>

                {/* Enable Toggle */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">启用情绪感知</span>
                    <button
                        onClick={() => setEnabled(!enabled)}
                        className={`w-12 h-7 rounded-full transition-colors relative ${enabled ? 'bg-pink-500' : 'bg-slate-200'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                {enabled && (
                    <>
                        {/* Current buffs */}
                        {buffs.length > 0 || presence ? (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">当前情绪状态</label>
                                    <button onClick={onClearBuffs} className="text-xs text-slate-400 hover:text-red-400 transition-colors">清除</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {presence && (
                                        <div className="flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-600">
                                            <span>近况</span>
                                            <span className="font-medium">{presence.text}</span>
                                        </div>
                                    )}
                                    {buffs.map(buff => (
                                        <div
                                            key={buff.id}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold"
                                            style={{
                                                backgroundColor: buff.color ? buff.color + '22' : '#fdf2f8',
                                                color: buff.color || '#db2777',
                                                border: `1px solid ${buff.color ? buff.color + '55' : '#fbcfe8'}`
                                            }}
                                        >
                                            {buff.emoji && <span>{buff.emoji}</span>}
                                            <span>{buff.label}</span>
                                            <span className="opacity-60">{INTENSITY_DOTS(buff.intensity)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 text-center py-2">
                                暂无短期状态 — 对话积累到合适节点后会低频更新
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default React.memo(EmotionSettingsModal);
