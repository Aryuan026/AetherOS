
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { OSTheme, DesktopDecoration, AppearancePreset, ShellChromeMode, Toast } from '../types';
import { INSTALLED_APPS, Icons } from '../constants';
import { processImage } from '../utils/file';
import { Sparkle } from '@phosphor-icons/react';
import AppHeader from '../components/shell/AppHeader';
import { useVirtualWorldClock } from '../hooks/useVirtualWorldClock';
import {
  VirtualWorldClockConfigV1,
  createDefaultVirtualWorldClockConfig,
} from '../utils/virtualWorldClock';
import { resolveShellChromeMode } from '../utils/shellChrome';

const TwemojiImg: React.FC<{ code: string; alt?: string; className?: string }> = ({ code, alt, className = 'w-4 h-4 inline-block' }) => (
  <img src={`https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${code}.png`} alt={alt || ''} className={className} draggable={false} />
);

const CATEGORY_LABELS: Record<string, { code: string; label: string }> = {
  'stars': { code: '2728', label: '星光' },
  'hearts': { code: '1f496', label: '爱心' },
  'flowers': { code: '1f338', label: '花与叶' },
  'ribbons': { code: '1f380', label: '丝带' },
  'animals': { code: '1f431', label: '小动物' },
  'shapes': { code: '1f52e', label: '形状' },
  'badges': { code: '1f3f7', label: '文字牌' },
};

const SHELL_MODE_COPY: Record<ShellChromeMode, { title: string; summary: string }> = {
  simulated_phone: {
    title: '经典手机',
    summary: '恢复原来的现实时间、Wi-Fi 与电量状态栏。',
  },
  software: {
    title: '纯软件界面',
    summary: '不显示顶部信息带，页面收回这块空间。',
  },
  virtual_city: {
    title: '虚拟城区',
    summary: '显示当前关系世界里的地点、时间与天气。',
  },
};

// Appearance type scale: page 16 / tabs 12 / sections 13 / controls 11 / helpers 10 / metadata 9.
const APPEARANCE_CARD_CLASS = 'rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)]';

const AppearanceSectionHeader: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  className?: string;
}> = ({ title, description, aside, className = '' }) => (
  <div className={`mb-3 flex items-start justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      <h2 className="text-[13px] font-semibold leading-5 tracking-[0.02em] text-slate-700">{title}</h2>
      {description && <p className="mt-1 text-[10px] leading-[1.55] text-slate-400">{description}</p>}
    </div>
    {aside}
  </div>
);

const AppearanceGroupLabel: React.FC<{ title: string; description: string; className?: string }> = ({
  title,
  description,
  className = '',
}) => (
  <div className={`flex items-end justify-between gap-3 px-1 pt-1 ${className}`}>
    <div>
      <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500">{title}</div>
      <div className="mt-0.5 text-[9px] leading-4 text-slate-400">{description}</div>
    </div>
    <div className="mb-1 h-px min-w-8 flex-1 bg-slate-200/80" aria-hidden="true" />
  </div>
);

// --- Preset Manager Component ---
interface PresetManagerProps {
    presets: AppearancePreset[];
    onSave: (name: string) => void;
    onApply: (id: string) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onExport: (id: string) => Promise<Blob>;
    onImport: (file: File) => Promise<void>;
    addToast: (msg: string, type?: Toast['type']) => void;
    currentTheme: OSTheme;
}

const PresetManager: React.FC<PresetManagerProps> = ({ presets, onSave, onApply, onDelete, onRename, onExport, onImport, addToast, currentTheme }) => {
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    const handleSave = () => {
        const name = newName.trim() || `预设 ${new Date().toLocaleDateString('zh-CN')}`;
        onSave(name);
        setNewName('');
    };

    const handleExport = async (id: string) => {
        try {
            const blob = await onExport(id);
            const preset = presets.find(p => p.id === id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `appearance_${preset?.name || 'preset'}.json`;
            a.click();
            URL.revokeObjectURL(url);
            addToast('预设已导出', 'success');
        } catch (e: any) {
            addToast(e.message || '导出失败', 'error');
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await onImport(file);
        } catch (err: any) {
            addToast(err.message || '导入失败', 'error');
        }
        if (importRef.current) importRef.current.value = '';
    };

    const handleRename = (id: string) => {
        if (editName.trim()) {
            onRename(id, editName.trim());
        }
        setEditingId(null);
        setEditName('');
    };

    return (
        <div className="space-y-4">
            {/* Save Current */}
            <section className={APPEARANCE_CARD_CLASS}>
                <AppearanceSectionHeader
                  title="保存当前外观"
                  description="把当前顶部样式、主题色、字体、壁纸、图标和装饰收成一套。"
                />
                <div className="flex gap-2">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="预设名称（可选）"
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] outline-none transition-all focus:border-primary"
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                    <button onClick={handleSave}
                        className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-[11px] font-semibold text-white shadow-sm transition-transform active:scale-95">
                        保存
                    </button>
                </div>
            </section>

            {/* Import */}
            <section className={APPEARANCE_CARD_CLASS}>
                <AppearanceSectionHeader
                  title="导入预设"
                  description="读取别人分享的 .json 外观文件并加入列表；点“应用”后才会修改本机外观。"
                />
                <input type="file" ref={importRef} className="hidden" accept=".json" onChange={handleImport} />
                <button onClick={() => importRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 py-2.5 text-[11px] font-semibold text-blue-500 transition-transform active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    选择文件导入
                </button>
            </section>

            {/* Preset List */}
            <section className={APPEARANCE_CARD_CLASS}>
                <AppearanceSectionHeader title={`已保存预设 · ${presets.length}`} />
                {presets.length === 0 ? (
                    <div className="py-7 text-center">
                        <div className="mb-2 opacity-40">
                            <Sparkle size={36} weight="fill" className="mx-auto text-slate-300" />
                        </div>
                        <p className="text-[11px] font-medium text-slate-400">还没有外观预设</p>
                        <p className="text-[10px] text-slate-300 mt-1">保存当前外观或导入预设文件开始使用</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {presets.map(preset => (
                            <div key={preset.id} className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                                {/* Preview bar */}
                                <div className="h-14 relative overflow-hidden"
                                    style={{
                                        background: preset.theme.wallpaper && preset.theme.wallpaper.startsWith('data:')
                                            ? `url(${preset.theme.wallpaper}) center/cover`
                                            : preset.theme.wallpaper && preset.theme.wallpaper.startsWith('linear')
                                            ? preset.theme.wallpaper
                                            : `linear-gradient(135deg, hsl(${preset.theme.hue}, ${preset.theme.saturation}%, ${preset.theme.lightness}%), hsl(${preset.theme.hue + 30}, ${preset.theme.saturation}%, ${Math.max(preset.theme.lightness - 15, 10)}%))`,
                                    }}>
                                    <div className="absolute inset-0 bg-black/10" />
                                    <div className="absolute bottom-1.5 left-3 flex gap-1">
                                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: `hsl(${preset.theme.hue}, ${preset.theme.saturation}%, ${preset.theme.lightness}%)` }} />
                                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.theme.contentColor || '#fff' }} />
                                    </div>
                                    {preset.theme.desktopDecorations && preset.theme.desktopDecorations.length > 0 && (
                                        <div className="absolute bottom-1.5 right-3 text-[8px] text-white/80 bg-black/30 px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                                            {preset.theme.desktopDecorations.length} 装饰
                                        </div>
                                    )}
                                </div>

                                {/* Info & actions */}
                                <div className="p-3">
                                    {editingId === preset.id ? (
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] outline-none focus:border-primary"
                                                autoFocus
                                                onKeyDown={e => { if (e.key === 'Enter') handleRename(preset.id); if (e.key === 'Escape') setEditingId(null); }}
                                            />
                                            <button onClick={() => handleRename(preset.id)} className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded-lg">确定</button>
                                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg">取消</button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <div className="text-[11px] font-semibold text-slate-700">{preset.name}</div>
                                                <div className="text-[9px] text-slate-400">{new Date(preset.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-1.5 flex-wrap">
                                        <button onClick={() => onApply(preset.id)}
                                            className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded-lg active:scale-95 transition-transform shadow-sm">
                                            应用
                                        </button>
                                        <button onClick={() => handleExport(preset.id)}
                                            className="px-3 py-1.5 bg-green-50 text-green-600 text-[10px] font-bold rounded-lg border border-green-200 active:scale-95 transition-transform">
                                            导出
                                        </button>
                                        <button onClick={() => { setEditingId(preset.id); setEditName(preset.name); }}
                                            className="px-3 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg border border-slate-200 active:scale-95 transition-transform">
                                            重命名
                                        </button>
                                        {confirmDeleteId === preset.id ? (
                                            <div className="flex gap-1">
                                                <button onClick={() => { onDelete(preset.id); setConfirmDeleteId(null); }}
                                                    className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-bold rounded-lg active:scale-95 transition-transform">
                                                    确认删除
                                                </button>
                                                <button onClick={() => setConfirmDeleteId(null)}
                                                    className="px-3 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg active:scale-95 transition-transform">
                                                    取消
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmDeleteId(preset.id)}
                                                className="px-3 py-1.5 bg-red-50 text-red-400 text-[10px] font-bold rounded-lg border border-red-200 active:scale-95 transition-transform">
                                                删除
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <div className="px-4 pb-3 text-center text-[10px] leading-[1.55] text-slate-400">
                外观预设既可以单独导入/导出，也会随系统整合备份一起保存。你可以保存多个预设并随时切换。
            </div>
        </div>
    );
};

const Appearance: React.FC = () => {
  const { theme, updateTheme, closeApp, setCustomIcon, customIcons, addToast, appearancePresets, saveAppearancePreset, applyAppearancePreset, deleteAppearancePreset, renameAppearancePreset, exportAppearancePreset, importAppearancePreset, userProfile } = useOS();
  const [activeTab, setActiveTab] = useState<'theme' | 'icons' | 'presets'>('theme');
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const widgetInputRef = useRef<HTMLInputElement>(null);
  const [activeWidgetSlot, setActiveWidgetSlot] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  
  // Font State
  const [fontMode, setFontMode] = useState<'local' | 'web'>('local');
  const [webFontUrl, setWebFontUrl] = useState('');

  // Desktop Decoration DIY State
  const decoInputRef = useRef<HTMLInputElement>(null);
  const [editingDecoId, setEditingDecoId] = useState<string | null>(null);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const virtualWorld = useVirtualWorldClock(userProfile);
  const [worldDraft, setWorldDraft] = useState<VirtualWorldClockConfigV1 | null>(null);
  const shellChromeMode = resolveShellChromeMode(theme);

  useEffect(() => {
    if (!virtualWorld.scope) {
      setWorldDraft(null);
      return;
    }
    setWorldDraft(virtualWorld.config || createDefaultVirtualWorldClockConfig(virtualWorld.scope));
  }, [
    virtualWorld.scope?.progressBundleId,
    virtualWorld.scope?.personaMaskId,
    virtualWorld.config?.updatedAt,
  ]);

  const updateWorldDraft = (updates: Partial<VirtualWorldClockConfigV1>) => {
    setWorldDraft(previous => previous ? { ...previous, ...updates } : previous);
  };

  const handleShellModeChange = async (mode: ShellChromeMode) => {
    if (mode !== 'virtual_city') {
      updateTheme({ shellChromeMode: mode });
      return;
    }
    if (!virtualWorld.scope || !worldDraft) {
      addToast('当前关系作用域不完整，仍保持纯软件界面。', 'error');
      return;
    }
    try {
      await virtualWorld.saveConfig(worldDraft);
      updateTheme({ shellChromeMode: 'virtual_city' });
      addToast('虚拟城区信息带已开启。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '虚拟城区没有保存。', 'error');
    }
  };

  const handleSaveVirtualWorld = async () => {
    if (!worldDraft) return;
    try {
      await virtualWorld.saveConfig(worldDraft);
      updateTheme({ shellChromeMode: 'virtual_city' });
      addToast('这条关系的城区时间与天气已保存。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '虚拟城区没有保存。', 'error');
    }
  };

  const decorations = theme.desktopDecorations || [];
  const editingDeco = editingDecoId ? decorations.find(d => d.id === editingDecoId) : null;
  const wallpaperIsImage = /^(?:https?:|data:|blob:)/.test(theme.wallpaper || '');
  const wallpaperPreviewStyle: React.CSSProperties = wallpaperIsImage
    ? { backgroundImage: `url(${theme.wallpaper})`, backgroundPosition: 'center', backgroundSize: 'cover' }
    : { background: theme.wallpaper };

  // Preset decoration SVGs (cute decorative elements)
  const PRESET_DECOS: { name: string; content: string; category: string }[] = [
    // Stars & Sparkles
    { name: '闪光', category: 'stars', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 L58 38 L95 50 L58 62 L50 95 L42 62 L5 50 L42 38Z" fill="#FFD700" opacity="0.9"/><path d="M50 20 L54 42 L78 50 L54 58 L50 80 L46 58 L22 50 L46 42Z" fill="#FFF8DC"/></svg>')}` },
    { name: '星星', category: 'stars', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 63,35 95,40 72,62 78,95 50,78 22,95 28,62 5,40 37,35" fill="#FF69B4"/><polygon points="50,20 58,38 78,42 64,55 67,78 50,68 33,78 36,55 22,42 42,38" fill="#FFB6C1" opacity="0.7"/></svg>')}` },
    { name: '小星', category: 'stars', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,10 61,40 95,40 68,60 78,90 50,72 22,90 32,60 5,40 39,40" fill="#B19CD9" opacity="0.85"/></svg>')}` },
    // Hearts
    { name: '爱心', category: 'hearts', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 88 C25 65 5 50 5 30 C5 15 17 5 30 5 C38 5 46 10 50 18 C54 10 62 5 70 5 C83 5 95 15 95 30 C95 50 75 65 50 88Z" fill="#FF6B9D"/><path d="M50 78 C30 60 15 48 15 33 C15 22 23 15 33 15 C39 15 45 18 50 25 C55 18 61 15 67 15 C77 15 85 22 85 33 C85 48 70 60 50 78Z" fill="#FF8FB1" opacity="0.6"/></svg>')}` },
    { name: '双心', category: 'hearts', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M35 70 C18 52 3 42 3 27 C3 16 12 8 22 8 C28 8 33 11 35 16 C37 11 42 8 48 8 C58 8 67 16 67 27 C67 42 52 52 35 70Z" fill="#FF69B4" opacity="0.8"/><path d="M65 80 C48 62 33 52 33 37 C33 26 42 18 52 18 C58 18 63 21 65 26 C67 21 72 18 78 18 C88 18 97 26 97 37 C97 52 82 62 65 80Z" fill="#FF1493" opacity="0.7"/></svg>')}` },
    // Flowers & Nature
    { name: '花朵', category: 'flowers', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="30" r="18" fill="#FFB7D5" opacity="0.8"/><circle cx="30" cy="50" r="18" fill="#FFB7D5" opacity="0.8"/><circle cx="70" cy="50" r="18" fill="#FFB7D5" opacity="0.8"/><circle cx="38" cy="70" r="18" fill="#FFB7D5" opacity="0.8"/><circle cx="62" cy="70" r="18" fill="#FFB7D5" opacity="0.8"/><circle cx="50" cy="50" r="12" fill="#FFE4B5"/></svg>')}` },
    { name: '樱花', category: 'flowers', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(50,50)"><g fill="#FFB7C5" opacity="0.85"><ellipse rx="12" ry="22" transform="rotate(0) translate(0,-20)"/><ellipse rx="12" ry="22" transform="rotate(72) translate(0,-20)"/><ellipse rx="12" ry="22" transform="rotate(144) translate(0,-20)"/><ellipse rx="12" ry="22" transform="rotate(216) translate(0,-20)"/><ellipse rx="12" ry="22" transform="rotate(288) translate(0,-20)"/></g><circle r="8" fill="#FF69B4"/></g></svg>')}` },
    { name: '叶子', category: 'flowers', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 10 Q80 30 85 60 Q85 90 50 95 Q15 90 15 60 Q20 30 50 10Z" fill="#90EE90" opacity="0.8"/><path d="M50 20 L50 85" stroke="#228B22" stroke-width="2" fill="none" opacity="0.5"/><path d="M50 40 Q65 35 70 45" stroke="#228B22" stroke-width="1.5" fill="none" opacity="0.4"/><path d="M50 55 Q35 50 30 60" stroke="#228B22" stroke-width="1.5" fill="none" opacity="0.4"/></svg>')}` },
    // Ribbons & Bows
    { name: '蝴蝶结', category: 'ribbons', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 45 Q20 20 10 35 Q5 50 25 55 Q35 57 50 50Z" fill="#FF69B4"/><path d="M50 45 Q80 20 90 35 Q95 50 75 55 Q65 57 50 50Z" fill="#FF69B4"/><circle cx="50" cy="48" r="6" fill="#FF1493"/><path d="M45 54 Q42 75 38 90" stroke="#FF69B4" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M55 54 Q58 75 62 90" stroke="#FF69B4" stroke-width="4" fill="none" stroke-linecap="round"/></svg>')}` },
    { name: '丝带', category: 'ribbons', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 30 Q30 20 50 30 Q70 40 90 30 L90 50 Q70 40 50 50 Q30 60 10 50Z" fill="#DDA0DD" opacity="0.85"/><path d="M10 50 Q30 40 50 50 Q70 60 90 50 L90 70 Q70 60 50 70 Q30 80 10 70Z" fill="#BA55D3" opacity="0.7"/></svg>')}` },
    // Cute Animals
    { name: '猫耳', category: 'animals', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M15 65 L5 15 L40 45Z" fill="#333" opacity="0.9"/><path d="M85 65 L95 15 L60 45Z" fill="#333" opacity="0.9"/><path d="M18 60 L12 22 L38 46Z" fill="#FFB6C1" opacity="0.6"/><path d="M82 60 L88 22 L62 46Z" fill="#FFB6C1" opacity="0.6"/></svg>')}` },
    { name: '猫爪', category: 'animals', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="50" cy="62" rx="22" ry="20" fill="#FFB6C1" opacity="0.85"/><circle cx="35" cy="38" r="10" fill="#FFB6C1" opacity="0.85"/><circle cx="65" cy="38" r="10" fill="#FFB6C1" opacity="0.85"/><circle cx="22" cy="50" r="9" fill="#FFB6C1" opacity="0.85"/><circle cx="78" cy="50" r="9" fill="#FFB6C1" opacity="0.85"/></svg>')}` },
    // Geometric / Shapes
    { name: '月亮', category: 'shapes', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M60 10 A40 40 0 1 0 60 90 A30 30 0 1 1 60 10Z" fill="#FFD700" opacity="0.8"/></svg>')}` },
    { name: '钻石', category: 'shapes', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 85,35 50,95 15,35" fill="#87CEEB" opacity="0.8"/><polygon points="50,5 65,35 50,95" fill="#ADD8E6" opacity="0.5"/><polygon points="15,35 85,35 50,5" fill="#B0E0E6" opacity="0.6"/></svg>')}` },
    { name: '泡泡', category: 'shapes', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="35" fill="none" stroke="#87CEEB" stroke-width="2" opacity="0.6"/><circle cx="50" cy="50" r="35" fill="#E0F0FF" opacity="0.2"/><ellipse cx="38" cy="38" rx="12" ry="8" fill="white" opacity="0.5" transform="rotate(-30 38 38)"/></svg>')}` },
    // Text Badges
    { name: 'LOVE', category: 'badges', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 50"><rect x="2" y="2" width="116" height="46" rx="23" fill="#FF69B4" opacity="0.85"/><text x="60" y="33" text-anchor="middle" fill="white" font-size="22" font-weight="bold" font-family="sans-serif">LOVE</text></svg>')}` },
    { name: 'CUTE', category: 'badges', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 50"><rect x="2" y="2" width="116" height="46" rx="23" fill="#DDA0DD" opacity="0.85"/><text x="60" y="33" text-anchor="middle" fill="white" font-size="22" font-weight="bold" font-family="sans-serif">CUTE</text></svg>')}` },
    { name: 'MY♡', category: 'badges', content: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 50"><rect x="2" y="2" width="116" height="46" rx="10" fill="none" stroke="#FF69B4" stroke-width="3" opacity="0.8"/><text x="60" y="34" text-anchor="middle" fill="#FF69B4" font-size="20" font-weight="bold" font-family="sans-serif">MY♡</text></svg>')}` },
  ];

  const addDecoration = useCallback((content: string, type: 'image' | 'preset') => {
    const newDeco: DesktopDecoration = {
      id: `deco-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60,
      scale: 1,
      rotation: 0,
      opacity: 1,
      zIndex: decorations.length + 1,
    };
    const next = [...decorations, newDeco];
    updateTheme({ desktopDecorations: next });
    setEditingDecoId(newDeco.id);
    setShowPresetPicker(false);
  }, [decorations, updateTheme]);

  const updateDecoration = useCallback((id: string, updates: Partial<DesktopDecoration>) => {
    const next = decorations.map(d => d.id === id ? { ...d, ...updates } : d);
    updateTheme({ desktopDecorations: next });
  }, [decorations, updateTheme]);

  const removeDecoration = useCallback((id: string) => {
    const next = decorations.filter(d => d.id !== id);
    updateTheme({ desktopDecorations: next });
    if (editingDecoId === id) setEditingDecoId(null);
  }, [decorations, updateTheme, editingDecoId]);

  const handleDecoUpload = async (file: File) => {
    try {
      const dataUrl = await processImage(file, { maxWidth: 400, quality: 0.85 });
      addDecoration(dataUrl, 'image');
      addToast('装饰已添加', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const THEME_PRESETS: { name: string, config: Partial<OSTheme>, color: string }[] = [
      { name: 'Indigo', config: { hue: 245, saturation: 25, lightness: 65, contentColor: '#ffffff' }, color: 'hsl(245, 25%, 65%)' },
      { name: 'Sakura', config: { hue: 350, saturation: 70, lightness: 80, contentColor: '#334155' }, color: 'hsl(350, 70%, 80%)' },
      { name: 'Cyber', config: { hue: 170, saturation: 100, lightness: 45, contentColor: '#ffffff' }, color: 'hsl(170, 100%, 45%)' },
      { name: 'Noir', config: { hue: 0, saturation: 0, lightness: 20, contentColor: '#ffffff' }, color: 'hsl(0, 0%, 20%)' },
      { name: 'Sunset', config: { hue: 20, saturation: 90, lightness: 60, contentColor: '#ffffff' }, color: 'hsl(20, 90%, 60%)' },
  ];

  const handleWallpaperUpload = async (file: File) => {
      try {
          addToast('正在处理壁纸 (原画质)...', 'info');
          // Use skipCompression to keep original quality
          const dataUrl = await processImage(file, { skipCompression: true });
          updateTheme({ wallpaper: dataUrl });
          addToast('壁纸更新成功', 'success');
      } catch (e: any) {
          addToast(e.message, 'error');
      }
  };

  const handleWidgetUpload = async (file: File) => {
      if (!activeWidgetSlot) return;
      try {
          const maxW = activeWidgetSlot === 'wide' ? 800 : 500;
          const dataUrl = await processImage(file, { maxWidth: maxW, quality: 0.9 });
          const current = theme.launcherWidgets || {};
          updateTheme({ launcherWidgets: { ...current, [activeWidgetSlot]: dataUrl } });
          addToast('小组件已更新', 'success');
      } catch (e: any) {
          addToast(e.message, 'error');
      }
  };

  const removeWidget = (slot: string) => {
      const current = { ...(theme.launcherWidgets || {}) };
      delete current[slot];
      updateTheme({ launcherWidgets: Object.keys(current).length > 0 ? current : undefined });
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const allowedExts = ['.ttf', '.otf', '.woff', '.woff2'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      
      if (!allowedExts.includes(ext)) {
          addToast('仅支持 ttf/otf/woff/woff2 格式', 'error');
          return;
      }

      addToast('正在处理字体文件...', 'info');
      
      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const dataUrl = ev.target?.result as string;
              updateTheme({ customFont: dataUrl });
              addToast('系统字体已更新', 'success');
          } catch(err) {
              addToast('字体加载失败', 'error');
          }
      };
      reader.onerror = () => addToast('读取失败', 'error');
      reader.readAsDataURL(file);
      
      // Clear input
      if (fontInputRef.current) fontInputRef.current.value = '';
  };

  const applyWebFont = () => {
      if (!webFontUrl.trim()) return;
      updateTheme({ customFont: webFontUrl.trim() });
      setWebFontUrl('');
      addToast('网络字体已应用', 'success');
  };

  const handleIconUpload = async (file: File) => {
      if (!selectedAppId) return;
      try {
          const dataUrl = await processImage(file);
          setCustomIcon(selectedAppId, dataUrl);
          addToast('应用图标已更新', 'success');
      } catch (e: any) {
          addToast(e.message, 'error');
      }
  };

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col font-normal text-slate-700">
      <AppHeader
        title="外观"
        subtitle="界面、图标与预设"
        onBack={closeApp}
        titleClassName="truncate text-[16px] font-semibold tracking-[0.02em] text-slate-800"
        subtitleClassName="mt-0.5 truncate text-[9px] font-medium tracking-[0.08em] text-slate-400"
      />

      <div className="z-20 flex shrink-0 border-b border-slate-200/80 bg-white px-3">
          <button onClick={() => setActiveTab('theme')} className={`flex-1 border-b-2 py-2.5 text-[12px] font-medium transition-colors ${activeTab === 'theme' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>界面外观</button>
          <button onClick={() => setActiveTab('icons')} className={`flex-1 border-b-2 py-2.5 text-[12px] font-medium transition-colors ${activeTab === 'icons' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>应用图标</button>
          <button onClick={() => setActiveTab('presets')} className={`flex-1 border-b-2 py-2.5 text-[12px] font-medium transition-colors ${activeTab === 'presets' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>预设管理</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 no-scrollbar">
        {activeTab === 'theme' ? (
            <div className="flex flex-col gap-4">
                <AppearanceGroupLabel
                  title="屏幕观感"
                  description="先定界面方式，再调整颜色与文字。"
                  className="order-1"
                />

                <section className={`${APPEARANCE_CARD_CLASS} order-3`}>
                    <AppearanceSectionHeader
                      title="主题色"
                      description="先选一个基础气质，再微调主色与桌面文字颜色。"
                    />
                    <div className="mb-5 flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                        {THEME_PRESETS.map(preset => (
                            <button 
                                key={preset.name}
                                onClick={() => updateTheme(preset.config)}
                                className="flex flex-col items-center gap-1.5 shrink-0 group"
                            >
                                <div className="h-9 w-9 rounded-full border-2 border-white shadow-sm ring-1 ring-black/5 transition-transform group-active:scale-95" style={{ backgroundColor: preset.color }}></div>
                                <span className="text-[9px] font-medium text-slate-500">{preset.name}</span>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 flex justify-between text-[11px] font-medium text-slate-500">
                                <span>色相</span><span className="font-mono text-[10px] text-slate-400">{theme.hue}°</span>
                            </div>
                            <input type="range" min="0" max="360" value={theme.hue} onChange={(e) => updateTheme({ hue: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                            <div className="h-2 w-full rounded-full mt-3 opacity-50" style={{ background: `linear-gradient(to right, hsl(0, 50%, 80%), hsl(60, 50%, 80%), hsl(120, 50%, 80%), hsl(180, 50%, 80%), hsl(240, 50%, 80%), hsl(300, 50%, 80%), hsl(360, 50%, 80%))`}}></div>
                        </div>
                        <div>
                            <div className="mb-2 flex justify-between text-[11px] font-medium text-slate-500">
                                <span>饱和度</span><span className="font-mono text-[10px] text-slate-400">{theme.saturation}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={theme.saturation} onChange={(e) => updateTheme({ saturation: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                        </div>
                        <div>
                            <div className="mb-2 flex justify-between text-[11px] font-medium text-slate-500">
                                <span>明度</span><span className="font-mono text-[10px] text-slate-400">{theme.lightness}%</span>
                            </div>
                            <input type="range" min="10" max="95" value={theme.lightness} onChange={(e) => updateTheme({ lightness: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                        </div>
                        <div>
                            <div className="mb-2 flex justify-between text-[11px] font-medium text-slate-500">
                                <span>桌面文字颜色</span>
                            </div>
                            <div className="flex gap-4 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <div 
                                    onClick={() => updateTheme({ contentColor: '#ffffff' })}
                                    className={`w-8 h-8 rounded-full border-2 cursor-pointer shadow-sm ${theme.contentColor === '#ffffff' ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200'}`} 
                                    style={{ backgroundColor: '#ffffff' }}
                                />
                                <div 
                                    onClick={() => updateTheme({ contentColor: '#334155' })} // Slate-700
                                    className={`w-8 h-8 rounded-full border-2 cursor-pointer shadow-sm ${theme.contentColor === '#334155' ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200'}`} 
                                    style={{ backgroundColor: '#334155' }}
                                />
                                <div className="h-6 w-px bg-slate-200 mx-1"></div>
                                <input 
                                    type="color" 
                                    value={theme.contentColor || '#ffffff'} 
                                    onChange={(e) => updateTheme({ contentColor: e.target.value })}
                                    className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent p-0" 
                                />
                                <span className="font-mono text-[10px] text-slate-400">{theme.contentColor}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Global Font Section */}
                <section className={`${APPEARANCE_CARD_CLASS} order-4`}>
                    <AppearanceSectionHeader
                      title="全局字体"
                      description="统一系统里的主要文字；聊天内容仍会尊重各自的装扮设置。"
                    />
                    
                    <div className="mb-3 flex rounded-xl bg-slate-100 p-1">
                        <button onClick={() => setFontMode('local')} className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-all ${fontMode === 'local' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}>本地文件</button>
                        <button onClick={() => setFontMode('web')} className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-all ${fontMode === 'web' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}>网络链接</button>
                    </div>

                    {fontMode === 'local' ? (
                        <>
                            <div 
                                className="group relative mb-2 flex h-20 w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50 shadow-inner hover:border-primary/50"
                                onClick={() => fontInputRef.current?.click()}
                            >
                                {theme.customFont && theme.customFont.startsWith('data:') ? (
                                    <>
                                        <span className="text-[15px] font-semibold text-slate-700">Abc 字体预览</span>
                                        <span className="text-[10px] text-slate-400">已应用本地字体</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[18px] text-slate-400">Aa</span>
                                        <span className="text-[10px] text-slate-400">上传字体文件（.ttf / .otf）</span>
                                    </>
                                )}
                                <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="rounded-full bg-black/40 px-3 py-1 text-[10px] font-semibold text-white backdrop-blur-md">更换字体</span>
                                </div>
                            </div>
                            <input type="file" ref={fontInputRef} className="hidden" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} />
                        </>
                    ) : (
                        <div className="space-y-2">
                            <input 
                                value={webFontUrl} 
                                onChange={e => setWebFontUrl(e.target.value)} 
                                placeholder="输入字体文件 URL (https://...)" 
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] outline-none transition-all focus:border-primary"
                            />
                            <button onClick={applyWebFont} className="w-full rounded-xl bg-primary py-2 text-[11px] font-semibold text-white shadow-sm transition-transform active:scale-95">
                                应用网络字体
                            </button>
                            <div className="text-[10px] text-slate-400 px-1">
                                {theme.customFont && theme.customFont.startsWith('http') ? (
                                    <span className="text-green-500">当前使用: {theme.customFont}</span>
                                ) : '提示: 请确保链接直通字体文件 (.ttf/.woff)'}
                            </div>
                        </div>
                    )}

                    {theme.customFont && (
                        <button onClick={() => updateTheme({ customFont: undefined })} className="mt-2 w-full rounded-xl bg-red-50 py-2 text-[11px] font-semibold text-red-400 hover:bg-red-100">恢复默认字体</button>
                    )}
                </section>

                {/* Global top appearance / scoped virtual city */}
                <section className={`${APPEARANCE_CARD_CLASS} order-2`}>
                    <AppearanceSectionHeader
                      title="顶部样式"
                      description="先决定屏幕顶部显示什么。三种模式只改变界面，不改变消息和档案里的真实时间。"
                    />

                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="界面顶部样式">
                        <button
                            type="button"
                            role="radio"
                            onClick={() => void handleShellModeChange('simulated_phone')}
                            aria-checked={shellChromeMode === 'simulated_phone'}
                            className={`min-h-[82px] rounded-2xl border p-2.5 text-left transition active:scale-[0.98] ${
                                shellChromeMode === 'simulated_phone'
                                    ? 'border-slate-400 bg-slate-100 text-slate-800 shadow-sm'
                                    : 'border-slate-100 bg-slate-50 text-slate-500'
                            }`}
                        >
                            <div className="text-[11px] font-semibold">经典手机</div>
                            <div className="mt-1.5 text-[9px] leading-[1.45] opacity-70">现实时间、Wi-Fi 与电量</div>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => void handleShellModeChange('software')}
                            aria-checked={shellChromeMode === 'software'}
                            className={`min-h-[82px] rounded-2xl border p-2.5 text-left transition active:scale-[0.98] ${
                                shellChromeMode === 'software'
                                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                                    : 'border-slate-100 bg-slate-50 text-slate-500'
                            }`}
                        >
                            <div className="text-[11px] font-semibold">纯软件界面</div>
                            <div className="mt-1.5 text-[9px] leading-[1.45] opacity-70">无信息带，完整收回顶部</div>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => void handleShellModeChange('virtual_city')}
                            aria-checked={shellChromeMode === 'virtual_city'}
                            disabled={!virtualWorld.scope || virtualWorld.loading}
                            className={`min-h-[82px] rounded-2xl border p-2.5 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
                                shellChromeMode === 'virtual_city'
                                    ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                                    : 'border-slate-100 bg-slate-50 text-slate-500'
                            }`}
                        >
                            <div className="text-[11px] font-semibold">虚拟城区</div>
                            <div className="mt-1.5 text-[9px] leading-[1.45] opacity-70">关系世界的地点、时间与天气</div>
                        </button>
                    </div>

                    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] text-slate-400">当前</span>
                            <span className="text-[11px] font-semibold text-slate-700">{SHELL_MODE_COPY[shellChromeMode].title}</span>
                            <span className="ml-auto shrink-0 text-[9px] font-medium text-slate-400">全局保存</span>
                        </div>
                        <p className="mt-1.5 border-t border-slate-200/70 pt-2 text-[10px] leading-[1.55] text-slate-400">
                            {SHELL_MODE_COPY[shellChromeMode].summary}
                            {shellChromeMode === 'virtual_city' && ' 城区资料仅按当前面具 × 进度套组保存在本机。'}
                        </p>
                    </div>

                    {shellChromeMode === 'virtual_city' && (virtualWorld.scope && worldDraft ? (
                        <div className="mt-3 space-y-3 rounded-2xl border border-cyan-100 bg-cyan-50/45 p-3.5">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <div className="text-[11px] font-semibold text-slate-700">这条关系的城区</div>
                                    <div className="mt-0.5 max-w-[250px] truncate font-mono text-[8px] text-slate-400">
                                        {virtualWorld.scope.progressBundleId} · {virtualWorld.scope.personaMaskId}
                                    </div>
                                </div>
                                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-cyan-600 shadow-sm">仅本机</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] font-semibold text-slate-500">
                                    地点
                                    <input
                                        aria-label="虚拟城区地点"
                                        value={worldDraft.locationLabel}
                                        onChange={event => updateWorldDraft({ locationLabel: event.target.value })}
                                        className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none focus:border-cyan-300"
                                        placeholder="雾港"
                                    />
                                </label>
                                <label className="text-[10px] font-semibold text-slate-500">
                                    年代 / 世界纪年
                                    <input
                                        aria-label="虚拟城区年代"
                                        value={worldDraft.eraLabel || ''}
                                        onChange={event => updateWorldDraft({ eraLabel: event.target.value })}
                                        className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none focus:border-cyan-300"
                                        placeholder="新历 47 年"
                                    />
                                </label>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] font-semibold text-slate-500">
                                    时区方式
                                    <select
                                        aria-label="虚拟城区时区方式"
                                        value={worldDraft.timeZoneMode}
                                        onChange={event => updateWorldDraft({ timeZoneMode: event.target.value as VirtualWorldClockConfigV1['timeZoneMode'] })}
                                        className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none"
                                    >
                                        <option value="iana">城市时区</option>
                                        <option value="fixed_offset">固定偏移</option>
                                    </select>
                                </label>
                                {worldDraft.timeZoneMode === 'iana' ? (
                                    <label className="text-[10px] font-semibold text-slate-500">
                                        IANA 时区
                                        <input
                                            aria-label="虚拟城区 IANA 时区"
                                            value={worldDraft.timeZoneId || ''}
                                            onChange={event => updateWorldDraft({ timeZoneId: event.target.value })}
                                            className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none focus:border-cyan-300"
                                            placeholder="Asia/Shanghai"
                                        />
                                    </label>
                                ) : (
                                    <label className="text-[10px] font-semibold text-slate-500">
                                        UTC 偏移（分钟）
                                        <input
                                            aria-label="虚拟城区 UTC 偏移分钟"
                                            type="number"
                                            min={-840}
                                            max={840}
                                            value={worldDraft.utcOffsetMinutes ?? 0}
                                            onChange={event => updateWorldDraft({ utcOffsetMinutes: Number(event.target.value) })}
                                            className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none focus:border-cyan-300"
                                        />
                                    </label>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] font-semibold text-slate-500">
                                    年份偏移
                                    <input
                                        aria-label="虚拟城区年份偏移"
                                        type="number"
                                        min={-3000}
                                        max={3000}
                                        value={worldDraft.yearOffset}
                                        onChange={event => updateWorldDraft({ yearOffset: Number(event.target.value) })}
                                        className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none focus:border-cyan-300"
                                    />
                                </label>
                                <label className="text-[10px] font-semibold text-slate-500">
                                    天气来源
                                    <select
                                        aria-label="虚拟城区天气来源"
                                        value={worldDraft.weatherMode}
                                        onChange={event => updateWorldDraft({ weatherMode: event.target.value as VirtualWorldClockConfigV1['weatherMode'] })}
                                        className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none"
                                    >
                                        <option value="manual">手动设定</option>
                                        <option value="seasonal_sim">本地季节模拟</option>
                                    </select>
                                </label>
                            </div>

                            {worldDraft.weatherMode === 'manual' && (
                                <div className="grid grid-cols-[1fr_1fr_64px] gap-2">
                                    <label className="text-[10px] font-semibold text-slate-500">
                                        天气
                                        <input
                                            aria-label="虚拟城区天气"
                                            value={worldDraft.weather.condition}
                                            onChange={event => updateWorldDraft({ weather: { ...worldDraft.weather, condition: event.target.value } })}
                                            className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none"
                                        />
                                    </label>
                                    <label className="text-[10px] font-semibold text-slate-500">
                                        温度
                                        <input
                                            aria-label="虚拟城区温度"
                                            value={worldDraft.weather.temperatureLabel || ''}
                                            onChange={event => updateWorldDraft({ weather: { ...worldDraft.weather, temperatureLabel: event.target.value } })}
                                            className="mt-1 w-full rounded-xl border border-white bg-white/85 px-3 py-2 text-[11px] font-normal text-slate-700 outline-none"
                                        />
                                    </label>
                                    <label className="text-[10px] font-semibold text-slate-500">
                                        图标
                                        <input
                                            aria-label="虚拟城区天气图标"
                                            value={worldDraft.weather.icon || ''}
                                            onChange={event => updateWorldDraft({ weather: { ...worldDraft.weather, icon: event.target.value } })}
                                            className="mt-1 w-full rounded-xl border border-white bg-white/85 px-2 py-2 text-center text-[11px] font-normal text-slate-700 outline-none"
                                        />
                                    </label>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() => void handleSaveVirtualWorld()}
                                className="w-full rounded-xl bg-cyan-600 py-2.5 text-[11px] font-semibold text-white shadow-sm transition active:scale-[0.98]"
                            >
                                保存并显示这座城区
                            </button>
                            <p className="text-[9px] leading-relaxed text-slate-400">
                                这里只生成只读环境信息；不会改写消息、旧日迁入、对话日历，也不会自动变成剧情、任务或记忆。
                            </p>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-700">
                            当前面具与进度套组没有形成一致作用域，虚拟城区保持关闭。
                        </div>
                    ))}
                </section>

                <AppearanceGroupLabel
                  title="桌面布置"
                  description="再处理壁纸、小组件与第二页装饰。"
                  className="order-5"
                />

                {/* Wallpaper Section */}
                <section className={`${APPEARANCE_CARD_CLASS} order-6`}>
                    <AppearanceSectionHeader
                      title="壁纸"
                      description="同时用于锁屏与桌面背景；这里展示的是裁切后的手机比例预览。"
                    />
                    <div
                      className="group relative mx-auto mb-3 aspect-[9/16] w-[44%] max-w-[150px] cursor-pointer overflow-hidden rounded-2xl bg-slate-100 shadow-inner ring-1 ring-slate-200/70"
                      style={wallpaperPreviewStyle}
                      onClick={() => wallpaperInputRef.current?.click()}
                    >
                         <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <span className="rounded-full bg-black/30 px-3 py-1 text-[10px] font-semibold text-white backdrop-blur-md">更换壁纸</span>
                         </div>
                    </div>
                    <input type="file" ref={wallpaperInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleWallpaperUpload(e.target.files[0])} />
                    <p className="text-center text-[10px] leading-4 text-slate-400">点击预览图更换，支持保留原画质。</p>
                </section>

                {/* Page 2 Widget Images */}
                <section className={`${APPEARANCE_CARD_CLASS} order-7`}>
                    <AppearanceSectionHeader
                      title="桌面小组件"
                      description="设置桌面第二页的两张方形图与一张横幅；长按已有图片可移除。"
                    />
                    <input type="file" ref={widgetInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleWidgetUpload(e.target.files[0])} />
                    <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div className="flex gap-2">
                            {['tl', 'tr'].map(slot => {
                                const img = (theme.launcherWidgets || {})[slot];
                                return (
                                    <div key={slot} className={`flex-1 aspect-square rounded-xl overflow-hidden relative cursor-pointer transition-transform active:scale-95 ${img ? 'shadow-sm' : 'border-2 border-dashed border-slate-200 bg-white flex items-center justify-center'}`}
                                        onClick={() => { setActiveWidgetSlot(slot); widgetInputRef.current?.click(); }}
                                        onContextMenu={(e) => { e.preventDefault(); if (img) removeWidget(slot); }}>
                                        {img ? (
                                            <>
                                                <img src={img} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                                                    <span className="text-white text-[10px] font-bold bg-black/40 px-2 py-0.5 rounded-full">更换</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-slate-300 text-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mx-auto mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                                <span className="text-[9px]">图片</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {(() => {
                            const slot = 'wide';
                            const img = (theme.launcherWidgets || {})[slot];
                            return (
                                <div className={`w-full h-20 rounded-xl overflow-hidden relative cursor-pointer transition-transform active:scale-[0.98] ${img ? 'shadow-sm' : 'border-2 border-dashed border-slate-200 bg-white flex items-center justify-center'}`}
                                    onClick={() => { setActiveWidgetSlot(slot); widgetInputRef.current?.click(); }}
                                    onContextMenu={(e) => { e.preventDefault(); if (img) removeWidget(slot); }}>
                                    {img ? (
                                        <>
                                            <img src={img} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                                                <span className="text-white text-[10px] font-bold bg-black/40 px-2 py-0.5 rounded-full">更换</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-slate-300 text-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mx-auto mb-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                            <span className="text-[9px]">横幅</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                    {/* Legacy bl/br cleanup for old users */}
                    {((theme.launcherWidgets || {})['bl'] || (theme.launcherWidgets || {})['br'] || theme.launcherWidgetImage) && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                            <div className="flex items-center gap-2 mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-amber-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                                <span className="text-[10px] font-bold text-amber-600">检测到旧版小组件数据</span>
                            </div>
                            <p className="text-[10px] text-amber-500 mb-2">旧版底部小组件已升级为自由装饰系统，点击清除旧数据释放空间。</p>
                            <button onClick={() => {
                                const current = { ...(theme.launcherWidgets || {}) };
                                delete current['bl'];
                                delete current['br'];
                                updateTheme({
                                    launcherWidgets: Object.keys(current).length > 0 ? current : undefined,
                                    launcherWidgetImage: undefined
                                });
                                addToast('旧版数据已清除', 'success');
                            }} className="w-full py-1.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-lg active:scale-95 transition-transform">
                                清除旧版小组件数据
                            </button>
                        </div>
                    )}
                </section>

                {/* Desktop Decoration DIY Section */}
                <section className={`${APPEARANCE_CARD_CLASS} order-8`}>
                    <AppearanceSectionHeader
                      title="桌面装饰"
                      description="在桌面第二页叠加贴纸，并调整位置、大小、旋转与透明度。"
                      aside={<span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-400">第二页</span>}
                    />
                    <input type="file" ref={decoInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleDecoUpload(e.target.files[0]); e.target.value = ''; }} />

                    {/* Live Preview */}
                    <div
                      className="relative mb-4 aspect-[9/16] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner"
                      style={wallpaperPreviewStyle}
                    >
                        <div className="absolute inset-0 bg-black/10"></div>
                        {/* Render widget previews */}
                        <div className="absolute top-[12%] left-4 right-4 space-y-1.5 pointer-events-none">
                            {(() => {
                                const w = theme.launcherWidgets || {};
                                return (
                                    <>
                                        {(w['tl'] || w['tr']) && (
                                            <div className="flex gap-1.5">
                                                {['tl', 'tr'].map(k => w[k] ? (
                                                    <div key={k} className="flex-1 aspect-square rounded-lg overflow-hidden opacity-70"><img src={w[k]} className="w-full h-full object-cover" /></div>
                                                ) : <div key={k} className="flex-1" />)}
                                            </div>
                                        )}
                                        {w['wide'] && (
                                            <div className="w-full h-8 rounded-lg overflow-hidden opacity-70"><img src={w['wide']} className="w-full h-full object-cover" /></div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        {/* Render decorations in preview */}
                        {decorations.map(deco => (
                            <div key={deco.id}
                                className={`absolute cursor-pointer transition-all duration-100 ${editingDecoId === deco.id ? 'ring-2 ring-pink-400 ring-offset-1' : ''}`}
                                style={{
                                    left: `${deco.x}%`, top: `${deco.y}%`,
                                    transform: `translate(-50%, -50%) scale(${deco.scale * 0.4}) rotate(${deco.rotation}deg)${deco.flip ? ' scaleX(-1)' : ''}`,
                                    opacity: deco.opacity, zIndex: deco.zIndex,
                                }}
                                onClick={() => setEditingDecoId(editingDecoId === deco.id ? null : deco.id)}>
                                <img src={deco.content} className="w-16 h-16 object-contain pointer-events-none select-none" draggable={false} />
                            </div>
                        ))}
                        {decorations.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-center text-white/40">
                                    <Sparkle size={36} weight="fill" className="mb-2 text-white/60" />
                                    <div className="text-[10px] font-medium">添加装饰开始布置</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Add Decoration Buttons */}
                    <div className="mb-3 flex justify-center gap-2">
                        <button
                            onClick={() => setShowPresetPicker(!showPresetPicker)}
                            aria-expanded={showPresetPicker}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 px-3.5 py-2 text-[10px] font-semibold text-pink-500 transition-transform active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>
                            预设贴纸
                        </button>
                        <button
                            onClick={() => decoInputRef.current?.click()}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-[10px] font-semibold text-blue-500 transition-transform active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                            上传自定义
                        </button>
                    </div>

                    {/* Preset Picker */}
                    {showPresetPicker && (
                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 mb-4 animate-fade-in">
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-3">选择预设装饰</div>
                            {['stars', 'hearts', 'flowers', 'ribbons', 'animals', 'shapes', 'badges'].map(cat => {
                                const items = PRESET_DECOS.filter(p => p.category === cat);
                                if (items.length === 0) return null;
                                const catInfo = CATEGORY_LABELS[cat];
                                return (
                                    <div key={cat} className="mb-3">
                                        <div className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">{catInfo && <TwemojiImg code={catInfo.code} className="w-3.5 h-3.5 inline-block" />} {catInfo?.label || cat}</div>
                                        <div className="flex gap-2 flex-wrap">
                                            {items.map(preset => (
                                                <button key={preset.name} onClick={() => addDecoration(preset.content, 'preset')}
                                                    className="w-14 h-14 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-0.5 hover:border-pink-300 hover:shadow-sm active:scale-90 transition-all group">
                                                    <img src={preset.content} className="w-8 h-8 object-contain group-hover:scale-110 transition-transform" />
                                                    <span className="text-[8px] text-slate-400">{preset.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Decoration List & Editor */}
                    {decorations.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">已添加装饰 ({decorations.length})</div>
                            {decorations.map((deco, idx) => (
                                <div key={deco.id} className={`bg-slate-50 rounded-xl border transition-all ${editingDecoId === deco.id ? 'border-pink-300 shadow-md' : 'border-slate-100'}`}>
                                    {/* Decoration header row */}
                                    <div className="flex items-center gap-2 p-2.5 cursor-pointer" onClick={() => setEditingDecoId(editingDecoId === deco.id ? null : deco.id)}>
                                        <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                            <img src={deco.content} className="w-8 h-8 object-contain" style={{ transform: deco.flip ? 'scaleX(-1)' : undefined }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-semibold text-slate-600">装饰 #{idx + 1}</div>
                                            <div className="text-[9px] text-slate-400">位置 ({Math.round(deco.x)}, {Math.round(deco.y)}) · {deco.scale}x · {deco.rotation}°</div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); removeDecoration(deco.id); }} className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                        </button>
                                        <div className={`w-5 h-5 flex items-center justify-center transition-transform ${editingDecoId === deco.id ? 'rotate-180' : ''}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                                        </div>
                                    </div>

                                    {/* Expanded edit controls */}
                                    {editingDecoId === deco.id && (
                                        <div className="px-3 pb-3 space-y-4 animate-fade-in border-t border-slate-100 pt-3">
                                            {/* Position X */}
                                            <div>
                                                <div className="flex justify-between mb-1.5">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">水平位置 X</label>
                                                    <span className="text-[10px] text-slate-500 font-mono">{Math.round(deco.x)}%</span>
                                                </div>
                                                <input type="range" min="0" max="100" value={deco.x} onChange={(e) => updateDecoration(deco.id, { x: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-pink-400" />
                                            </div>
                                            {/* Position Y */}
                                            <div>
                                                <div className="flex justify-between mb-1.5">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">垂直位置 Y</label>
                                                    <span className="text-[10px] text-slate-500 font-mono">{Math.round(deco.y)}%</span>
                                                </div>
                                                <input type="range" min="0" max="100" value={deco.y} onChange={(e) => updateDecoration(deco.id, { y: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-pink-400" />
                                            </div>
                                            {/* Scale & Rotation */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <div className="flex justify-between mb-1.5">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">缩放</label>
                                                        <span className="text-[10px] text-slate-500 font-mono">{deco.scale}x</span>
                                                    </div>
                                                    <input type="range" min="0.2" max="3" step="0.1" value={deco.scale} onChange={(e) => updateDecoration(deco.id, { scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-purple-400" />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between mb-1.5">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">旋转</label>
                                                        <span className="text-[10px] text-slate-500 font-mono">{deco.rotation}°</span>
                                                    </div>
                                                    <input type="range" min="-180" max="180" value={deco.rotation} onChange={(e) => updateDecoration(deco.id, { rotation: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-purple-400" />
                                                </div>
                                            </div>
                                            {/* Opacity */}
                                            <div>
                                                <div className="flex justify-between mb-1.5">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">透明度</label>
                                                    <span className="text-[10px] text-slate-500 font-mono">{Math.round(deco.opacity * 100)}%</span>
                                                </div>
                                                <input type="range" min="0.1" max="1" step="0.05" value={deco.opacity} onChange={(e) => updateDecoration(deco.id, { opacity: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-400" />
                                            </div>
                                            {/* Quick Actions */}
                                            <div className="flex gap-2 flex-wrap">
                                                <button onClick={() => updateDecoration(deco.id, { flip: !deco.flip })}
                                                    className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all active:scale-95 ${deco.flip ? 'bg-pink-50 text-pink-500 border-pink-200' : 'bg-white text-slate-400 border-slate-200'}`}>
                                                    镜像翻转
                                                </button>
                                                <button onClick={() => updateDecoration(deco.id, { rotation: 0, scale: 1, opacity: 1, flip: false })}
                                                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white text-slate-400 border border-slate-200 active:scale-95 transition-all">
                                                    重置参数
                                                </button>
                                                <button onClick={() => {
                                                    const dup: DesktopDecoration = { ...deco, id: `deco-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, x: Math.min(deco.x + 8, 95), y: Math.min(deco.y + 8, 95) };
                                                    const next = [...decorations, dup];
                                                    updateTheme({ desktopDecorations: next });
                                                    setEditingDecoId(dup.id);
                                                }}
                                                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white text-slate-400 border border-slate-200 active:scale-95 transition-all">
                                                    复制一个
                                                </button>
                                                {/* Layer controls */}
                                                <button onClick={() => {
                                                    const maxZ = Math.max(...decorations.map(d => d.zIndex), 0);
                                                    updateDecoration(deco.id, { zIndex: maxZ + 1 });
                                                }}
                                                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white text-slate-400 border border-slate-200 active:scale-95 transition-all">
                                                    置顶
                                                </button>
                                                <button onClick={() => updateDecoration(deco.id, { zIndex: 0 })}
                                                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white text-slate-400 border border-slate-200 active:scale-95 transition-all">
                                                    置底
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {/* Clear all button */}
                            <button onClick={() => { updateTheme({ desktopDecorations: [] }); setEditingDecoId(null); }}
                                className="mt-2 w-full rounded-xl bg-red-50 py-2 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-100">
                                清空所有装饰
                            </button>
                        </div>
                    )}
                    <div className="mt-3 px-1 text-[10px] leading-[1.55] text-slate-400">装饰只显示在桌面第二页，可使用预设贴纸或上传自己的图片。</div>
                </section>
            </div>
        ) : activeTab === 'icons' ? (
            <section className={APPEARANCE_CARD_CLASS}>
                <AppearanceSectionHeader
                  title="应用图标"
                  description="点击一个图标上传替换图片；已有自定义图标可以单独恢复默认。"
                />
                <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                    {INSTALLED_APPS.map(app => {
                        const Icon = Icons[app.icon];
                        const customUrl = customIcons[app.id];
                        return (
                            <div key={app.id} className="flex min-w-0 flex-col items-center gap-1.5">
                                 <button
                                    type="button"
                                    aria-label={`更换${app.name}图标`}
                                    className="group relative h-14 w-14 cursor-pointer overflow-hidden rounded-[18px] bg-slate-200 shadow-sm transition-transform active:scale-95"
                                    onClick={() => { setSelectedAppId(app.id); iconInputRef.current?.click(); }}
                                 >
                                     {customUrl ? (
                                         <img src={customUrl} alt="" className="h-full w-full object-cover" />
                                     ) : (
                                         <div className={`flex h-full w-full items-center justify-center text-white ${app.color}`}>
                                             <Icon className="h-7 w-7" />
                                         </div>
                                     )}
                                     <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                                     </div>
                                 </button>
                                 <span className="max-w-full truncate text-[9px] font-medium text-slate-500">{app.name}</span>
                                 {customUrl && (
                                     <button onClick={() => setCustomIcon(app.id, undefined)} className="text-[9px] text-red-400">恢复</button>
                                 )}
                            </div>
                        );
                    })}
                    <input type="file" ref={iconInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleIconUpload(e.target.files[0])} />
                </div>
            </section>
        ) : activeTab === 'presets' ? (
            <PresetManager
                presets={appearancePresets}
                onSave={saveAppearancePreset}
                onApply={applyAppearancePreset}
                onDelete={deleteAppearancePreset}
                onRename={renameAppearancePreset}
                onExport={exportAppearancePreset}
                onImport={importAppearancePreset}
                addToast={addToast}
                currentTheme={theme}
            />
        ) : null}
      </div>
    </div>
  );
};

export default Appearance;
