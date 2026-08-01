
import React, { useState, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { safeResponseJson } from '../utils/safeApi';
import Modal from '../components/os/Modal';
import { CheckCircle, CopySimple, Notebook, Sun } from '@phosphor-icons/react';
import AppHeader from '../components/shell/AppHeader';
import {
  CompanionWakeupSettings,
  loadCompanionWakeupSettings,
  saveCompanionWakeupSettings,
} from '../utils/companionWakeups';
import type { RealtimeConfig } from '../types';
import { syncBuiltInCareForActiveCharacters } from '../utils/companionWakeupRules';
import {
  AUTO_MEMORY_UPDATED_EVENT,
  MEMORY_DM_TURN_MAX,
  MEMORY_DM_TURN_MIN,
  MEMORY_DM_TURN_STEP,
  MEMORY_DM_UPDATED_EVENT,
  WORLDLINE_MEMORY_RECEIPTS_UPDATED_EVENT,
  clearAutoMemoryLedger,
  clearWorldlineMemoryReceipts,
  loadAutoMemoryLedger,
  loadAutoMemorySettings,
  loadMemoryDMSettings,
  loadWorldlineMemoryReceiptSettings,
  loadWorldlineMemoryReceipts,
  runAutoMemoryPass,
  saveAutoMemorySettings,
  saveMemoryDMSettings,
  saveWorldlineMemoryReceiptSettings,
} from '../utils/memoryCore';
import type { AutoMemoryLedgerEntry, MemoryDMSettings, WorldlineMemoryReceipt } from '../utils/memoryCore';
import { createDefaultLauncherLayout } from '../utils/launcherLayout';
import PwaInstallRow from '../components/settings/PwaInstallRow';

const memoryReceiptModeLabel = (mode: WorldlineMemoryReceipt['mode']): string => {
  if (mode === 'remote_chat') return '聊天';
  if (mode === 'meet_scene') return '见面';
  if (mode === 'date_scene') return '约会';
  if (mode === 'proactive_letter') return '惦念';
  if (mode === 'call') return '电话';
  return '时光簿';
};

const memoryReceiptSurfaceLabel = (surface: WorldlineMemoryReceipt['surface']): string => {
  if (surface === 'chat') return '聊天';
  if (surface === 'proactive_letter') return '主动来信';
  if (surface === 'group_chat') return '群聊';
  if (surface === 'call') return '通话';
  if (surface === 'date') return '见面';
  if (surface === 'storydesk') return '剧情主持';
  if (surface === 'contact_impression') return '通讯录印象';
  return surface;
};

const memoryReceiptAuthorityLabel = (authority: WorldlineMemoryReceipt['historicalAuthorities'][number]): string => {
  if (authority === 'user_confirmed') return '你确认过';
  if (authority === 'source_explicit') return '原文明示';
  if (authority === 'source_inferred') return '从原文推得';
  return '模型重建';
};

const memoryReceiptTierLabel = (tier?: WorldlineMemoryReceipt['deliveryTier']): string => {
  if (tier === 'heartbeat_lite') return '轻触';
  if (tier === 'affective_warm') return '陪伴';
  if (tier === 'focused_recall') return '追忆';
  if (tier === 'story_branch') return '剧情';
  if (tier === 'full_diagnostic') return '复核';
  return '常驻';
};

const formatMemoryReceiptTime = (timestamp: number): string => (
  new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
);

const getMemoryReceiptTitles = (receipt: WorldlineMemoryReceipt): string[] => (
  [...receipt.candidateTitles, ...receipt.openThreadTitles].slice(0, 5)
);

const autoMemoryKindLabel = (kind: AutoMemoryLedgerEntry['kind']): string => (
  kind === 'timebook_candidate' ? '时光簿' : '沉淀'
);

const realityModeLabel: Record<NonNullable<RealtimeConfig['realitySyncMode']>, string> = {
  real_anchor: '现实锚定',
  rhythm_weather: '昼夜同频',
  fiction_free: '剧情自由',
};

const weatherScopeLabel: Record<NonNullable<RealtimeConfig['weatherScope']>, string> = {
  user_only: '只看你这边',
  shared_echo: '共享回声',
  off: '不接天气',
};

type WeatherScopeChoice = Exclude<NonNullable<RealtimeConfig['weatherScope']>, 'off'>;

const normalizeWeatherScopeChoice = (scope?: RealtimeConfig['weatherScope']): WeatherScopeChoice => (
  scope === 'shared_echo' ? 'shared_echo' : 'user_only'
);

const careBoundaryLabel: Record<NonNullable<RealtimeConfig['careBoundary']>, string> = {
  soft: '轻声照看',
  direct: '明确提醒',
  off: '不主动管',
};

const Settings: React.FC = () => {
  const {
      apiConfig, updateApiConfig, closeApp, availableModels, setAvailableModels,
      exportSystem, importSystem, addToast, resetSystem,
      apiPresets, activeApiPresetId, addApiPreset, removeApiPreset, activateApiPreset,
      aiRuntimeRouting, updateAiRuntimeRouting,
      sysOperation, // Get progress state
      realtimeConfig, updateRealtimeConfig, // 实时感知配置
      characters, userProfile, updateTheme
  } = useOS();
  
  const [localKey, setLocalKey] = useState(apiConfig.apiKey);
  const [localUrl, setLocalUrl] = useState(apiConfig.baseUrl);
  const [localModel, setLocalModel] = useState(apiConfig.model);
  const [localMiniMaxKey, setLocalMiniMaxKey] = useState(apiConfig.minimaxApiKey || '');
  const [localMiniMaxGroupId, setLocalMiniMaxGroupId] = useState(apiConfig.minimaxGroupId || '');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  
  // UI States
  const [showModelModal, setShowModelModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false); // Used for completion now
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showRealtimeModal, setShowRealtimeModal] = useState(false);

  // 主动来信配置
  const [wakeupSettings, setWakeupSettings] = useState<CompanionWakeupSettings>(() => loadCompanionWakeupSettings());
  const [memoryReceipts, setMemoryReceipts] = useState<WorldlineMemoryReceipt[]>(() => loadWorldlineMemoryReceipts());
  const [memoryReceiptSettings, setMemoryReceiptSettings] = useState(() => loadWorldlineMemoryReceiptSettings());
  const [autoMemorySettings, setAutoMemorySettings] = useState(() => loadAutoMemorySettings());
  const [memoryDMSettings, setMemoryDMSettings] = useState<MemoryDMSettings>(() => loadMemoryDMSettings());
  const [autoMemoryLedger, setAutoMemoryLedger] = useState<AutoMemoryLedgerEntry[]>(() => loadAutoMemoryLedger());
  const [isRunningAutoMemory, setIsRunningAutoMemory] = useState(false);

  // 实时感知配置的本地状态
  const [rtWeatherEnabled, setRtWeatherEnabled] = useState(realtimeConfig.weatherEnabled);
  const [rtWeatherKey, setRtWeatherKey] = useState(realtimeConfig.weatherApiKey);
  const [rtWeatherCity, setRtWeatherCity] = useState(realtimeConfig.weatherCity);
  const [rtRealityMode, setRtRealityMode] = useState<NonNullable<RealtimeConfig['realitySyncMode']>>(realtimeConfig.realitySyncMode || 'real_anchor');
  const [rtWeatherScope, setRtWeatherScope] = useState<WeatherScopeChoice>(normalizeWeatherScopeChoice(realtimeConfig.weatherScope));
  const [rtCareBoundary, setRtCareBoundary] = useState<NonNullable<RealtimeConfig['careBoundary']>>(realtimeConfig.careBoundary || 'soft');
  const [rtTestStatus, setRtTestStatus] = useState('');
  
  // For web download link
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  
  const [statusMsg, setStatusMsg] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  // Auto-save draft configs locally to prevent loss during typing
  useEffect(() => {
      setLocalUrl(apiConfig.baseUrl);
      setLocalKey(apiConfig.apiKey);
      setLocalModel(apiConfig.model);
      setLocalMiniMaxKey(apiConfig.minimaxApiKey || '');
      setLocalMiniMaxGroupId(apiConfig.minimaxGroupId || '');
  }, [apiConfig]);

  useEffect(() => {
      setRtWeatherEnabled(realtimeConfig.weatherEnabled);
      setRtWeatherKey(realtimeConfig.weatherApiKey);
      setRtWeatherCity(realtimeConfig.weatherCity);
      setRtRealityMode(realtimeConfig.realitySyncMode || 'real_anchor');
      setRtWeatherScope(normalizeWeatherScopeChoice(realtimeConfig.weatherScope));
      setRtCareBoundary(realtimeConfig.careBoundary || 'soft');
  }, [realtimeConfig]);

  const loadPreset = (preset: typeof apiPresets[0]) => {
      setLocalUrl(preset.config.baseUrl);
      setLocalKey(preset.config.apiKey);
      setLocalModel(preset.config.model);
      // MiniMax settings are NOT overwritten by presets — typically one user has
      // only one MiniMax account regardless of which LLM API preset they use.
      addToast(`“${preset.name}”已放入编辑区，还没有启用`, 'info');
  };

  const copyText = async (value: string, label: string) => {
      if (!value.trim()) return;
      try {
          await navigator.clipboard.writeText(value);
          addToast(`已复制${label}：${value}`, 'success');
      } catch {
          addToast('复制失败，请长按文字复制', 'error');
      }
  };

  const copyPresetName = (name: string) => copyText(name, '预设名');

  const handleActivatePreset = (preset: typeof apiPresets[0]) => {
      if (!activateApiPreset(preset.id)) {
          addToast('没有找到这份预设', 'error');
          return;
      }
      addToast(`已启用：${preset.name}`, 'success');
  };

  const handleSavePreset = () => {
      if (!newPresetName.trim()) {
          addToast('请输入预设名称', 'error');
          return;
      }
      addApiPreset(newPresetName, {
        baseUrl: localUrl,
        apiKey: localKey,
        model: localModel,
      });
      setNewPresetName('');
      setShowPresetModal(false);
      addToast('预设已保存', 'success');
  };

  const handleSaveApi = () => {
    updateApiConfig({ 
      apiKey: localKey, 
      minimaxApiKey: localMiniMaxKey,
      minimaxGroupId: localMiniMaxGroupId,
      baseUrl: localUrl, 
      model: localModel
    });
    setStatusMsg('配置已保存');
    setTimeout(() => setStatusMsg(''), 2000);
  };

  const updateWakeupSettings = (updates: Partial<CompanionWakeupSettings>) => {
      const next = saveCompanionWakeupSettings(updates);
      setWakeupSettings(next);
      if (Object.prototype.hasOwnProperty.call(updates, 'aiCareWindowsEnabled')) {
          void syncBuiltInCareForActiveCharacters(characters, next.aiCareWindowsEnabled, next)
              .then(count => {
                  if (count > 0) {
                      addToast(next.aiCareWindowsEnabled ? '生活照看已同步' : '生活照看已暂停', 'success');
                  }
              })
              .catch(() => addToast('生活照看同步失败', 'error'));
      }
      addToast('惦念已收好', 'success');
  };

  useEffect(() => {
      const handleMemoryReceiptUpdate = () => {
          setMemoryReceipts(loadWorldlineMemoryReceipts());
          setMemoryReceiptSettings(loadWorldlineMemoryReceiptSettings());
      };

      window.addEventListener(WORLDLINE_MEMORY_RECEIPTS_UPDATED_EVENT, handleMemoryReceiptUpdate);
      return () => window.removeEventListener(WORLDLINE_MEMORY_RECEIPTS_UPDATED_EVENT, handleMemoryReceiptUpdate);
  }, []);

  useEffect(() => {
      const handleAutoMemoryUpdate = () => {
          setAutoMemorySettings(loadAutoMemorySettings());
          setAutoMemoryLedger(loadAutoMemoryLedger());
      };

      window.addEventListener(AUTO_MEMORY_UPDATED_EVENT, handleAutoMemoryUpdate);
      return () => window.removeEventListener(AUTO_MEMORY_UPDATED_EVENT, handleAutoMemoryUpdate);
  }, []);

  useEffect(() => {
      const handleMemoryDMUpdate = () => {
          setMemoryDMSettings(loadMemoryDMSettings());
      };

      window.addEventListener(MEMORY_DM_UPDATED_EVENT, handleMemoryDMUpdate);
      return () => window.removeEventListener(MEMORY_DM_UPDATED_EVENT, handleMemoryDMUpdate);
  }, []);

  const updateAutoMemorySettings = (updates: Partial<typeof autoMemorySettings>) => {
      const next = saveAutoMemorySettings(updates);
      setAutoMemorySettings(next);
      addToast('候选整理规则已收好', 'success');
  };

  const updateMemoryDMSettings = (updates: Partial<MemoryDMSettings>) => {
      const next = saveMemoryDMSettings(updates);
      setMemoryDMSettings(next);
      addToast('记忆候选规则已收好', 'success');
  };

  const handleRunAutoMemoryOnce = async () => {
      if (isRunningAutoMemory) return;
      setIsRunningAutoMemory(true);
      try {
          const result = await runAutoMemoryPass({
              characters,
              userProfile,
              trigger: 'manual',
              includeToday: true,
              settings: { ...loadAutoMemorySettings(), dailyChatMode: 'off' },
          });
          setAutoMemoryLedger(loadAutoMemoryLedger());
          const total = result.candidateCount;
          addToast(total > 0 ? `整理了 ${total} 个候选` : '这次没有新的候选', total > 0 ? 'success' : 'info');
      } catch (error: any) {
          addToast(`补记失败: ${error.message || 'unknown'}`, 'error');
      } finally {
          setIsRunningAutoMemory(false);
      }
  };

  const updateMemoryReceiptSettings = (enabled: boolean) => {
      const next = saveWorldlineMemoryReceiptSettings({ enabled });
      setMemoryReceiptSettings(next);
      addToast(enabled ? '回声记录已开启' : '回声记录已暂停', 'info');
  };

  const refreshMemoryReceipts = () => {
      setMemoryReceipts(loadWorldlineMemoryReceipts());
      setMemoryReceiptSettings(loadWorldlineMemoryReceiptSettings());
      addToast('记忆记录已刷新', 'info');
  };

  const handleClearMemoryReceipts = () => {
      clearWorldlineMemoryReceipts();
      setMemoryReceipts([]);
      addToast('记忆记录已清空', 'info');
  };

  const handleClearAutoMemoryLedger = () => {
      clearAutoMemoryLedger();
      setAutoMemoryLedger([]);
      addToast('沉淀记录已清空', 'info');
  };

  const fetchModels = async () => {
    if (!localUrl) { setStatusMsg('请先填写 URL'); return; }
    setIsLoadingModels(true);
    setStatusMsg('正在连接...');
    try {
        const baseUrl = localUrl.replace(/\/+$/, '');
        const response = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localKey}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const data = await safeResponseJson(response);
        // Support various API response formats
        const list = data.data || data.models || [];
        if (Array.isArray(list)) {
            const models = list.map((m: any) => m.id || m);
            setAvailableModels(models);
            if (models.length > 0 && !models.includes(localModel)) setLocalModel(models[0]);
            setStatusMsg(`获取到 ${models.length} 个模型`);
            setShowModelModal(true); // Open selector immediately
        } else { setStatusMsg('格式不兼容'); }
    } catch (error: any) {
        console.error(error);
        setStatusMsg('连接失败');
    } finally {
        setIsLoadingModels(false);
    }
  };

  const handleExport = async (mode: 'text_only' | 'media_only' | 'full') => {
      try {
          // Trigger export (Context handles loading state UI)
          const blob = await exportSystem(mode);
          
          if (Capacitor.isNativePlatform()) {
              // Convert Blob to Base64 for Native Write
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = async () => {
                  const base64data = String(reader.result);
                  const fileName = `AetherOS_Backup_${mode}_${Date.now()}.zip`;
                  
                  try {
                      await Filesystem.writeFile({
                          path: fileName,
                          data: base64data, // Filesystem accepts data urls? Or need strip prefix
                          directory: Directory.Cache,
                      });
                      const uriResult = await Filesystem.getUri({
                          directory: Directory.Cache,
                          path: fileName,
                      });
                      await Share.share({
                          title: `AetherOS Backup`,
                          files: [uriResult.uri],
                      });
                  } catch (e) {
                      console.error("Native write failed", e);
                      addToast("保存文件失败", "error");
                  }
              };
          } else {
              // Web Download
              const url = URL.createObjectURL(blob);
              setDownloadUrl(url);
              setShowExportModal(true);
              
              // Auto click
              const a = document.createElement('a');
              a.href = url;
              a.download = `AetherOS_Backup_${mode}_${new Date().toISOString().slice(0,10)}.zip`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
          }
      } catch (e: any) {
          addToast(e.message, 'error');
      }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Pass the File object directly to importSystem
      importSystem(file).catch(err => {
          console.error(err);
          addToast(err.message || '恢复失败', 'error');
      });
      
      if (importInputRef.current) importInputRef.current.value = '';
  };

  const confirmReset = () => {
      resetSystem();
      setShowResetConfirm(false);
  };

  const restoreDefaultLauncherLayout = () => {
      updateTheme({ launcherLayout: createDefaultLauncherLayout() });
      addToast('桌面 App 已全部恢复，并回到默认顺序', 'success');
  };

  // 保存实时感知配置
  const handleSaveRealtimeConfig = () => {
      updateRealtimeConfig({
          realitySyncMode: rtRealityMode,
          weatherScope: rtWeatherScope,
          careBoundary: rtCareBoundary,
          weatherEnabled: rtWeatherEnabled,
          weatherApiKey: rtWeatherKey,
          weatherCity: rtWeatherCity,
          cacheMinutes: realtimeConfig.cacheMinutes ?? 30,
      });
      addToast('实时感知配置已保存', 'success');
      setShowRealtimeModal(false);
  };

  // 测试天气API连接
  const testWeatherApi = async () => {
      if (!rtWeatherKey) {
          setRtTestStatus('请先填写 API Key');
          return;
      }
      setRtTestStatus('正在测试...');
      try {
          const url = `https://api.openweathermap.org/data/2.5/weather?q=${rtWeatherCity}&appid=${rtWeatherKey}&units=metric&lang=zh_cn`;
          const res = await fetch(url);
          if (res.ok) {
              const data = await safeResponseJson(res);
              setRtTestStatus(`连接成功！${data.name}: ${data.weather[0]?.description}, ${Math.round(data.main.temp)}°C`);
          } else {
              setRtTestStatus(`连接失败: HTTP ${res.status}`);
          }
      } catch (e: any) {
          setRtTestStatus(`网络错误: ${e.message}`);
      }
  };

  const latestMemoryReceipt = memoryReceipts[0];
  const olderMemoryReceipts = memoryReceipts.slice(1, 6);
  const latestAutoMemory = autoMemoryLedger[0];
  const olderAutoMemories = autoMemoryLedger.slice(1, 5);
  const systemDirectorBinding = aiRuntimeRouting.systemDirector;
  const selectedSystemDirectorPreset = systemDirectorBinding.mode === 'preset'
      ? apiPresets.find(preset => preset.id === systemDirectorBinding.presetId)
      : undefined;
  const systemDirectorPresetMissing = (
      systemDirectorBinding.mode === 'preset'
      && !selectedSystemDirectorPreset
  );

  return (
    <div className="h-full w-full bg-slate-50/50 flex flex-col font-light relative">

      {/* GLOBAL PROGRESS OVERLAY */}
      {sysOperation.status === 'processing' && (
          <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
              <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 w-64">
                  <div className="w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                  <div className="text-sm font-bold text-slate-700">{sysOperation.message}</div>
                  {sysOperation.progress > 0 && (
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${sysOperation.progress}%` }}></div>
                      </div>
                  )}
              </div>
          </div>
      )}

      <AppHeader title="系统设置" onBack={closeApp} />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 no-scrollbar pb-20">

        {/* Settings is normalization-locked into the Dock, so this recovery
            action remains reachable even if Appearance or other apps are hidden. */}
        <section data-launcher-layout-recovery className="order-first rounded-3xl border border-violet-100 bg-violet-50/70 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-[13px] font-semibold text-slate-600">桌面 App</h2>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">如果隐藏后找不到入口，可以在这里恢复全部 App 与默认顺序。</p>
                </div>
                <button
                    type="button"
                    onClick={restoreDefaultLauncherLayout}
                    className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-[10px] font-semibold text-violet-600 transition active:scale-95"
                >
                    恢复默认布局
                </button>
            </div>
        </section>

        <PwaInstallRow />
        
        {/* 数据备份区域 */}
        <section className="order-10 bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
                </div>
                <h2 className="text-sm font-semibold text-slate-600 tracking-wider">整机备份与恢复</h2>
            </div>

            <p className="mb-3 rounded-xl bg-blue-50/70 px-3 py-2 text-[10px] leading-relaxed text-blue-600">
                普通 ZIP 不需要密码，也不会自动上传；下载后放在你自己的设备里即可。
            </p>
            
            <div className="mb-3">
                <button onClick={() => handleExport('full')} className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 border border-violet-300 rounded-xl text-xs font-bold text-white shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 relative overflow-hidden mb-3">
                    <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-white/20 text-[9px] text-white rounded-bl-lg font-bold">完整</div>
                    <div className="p-2 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg></div>
                    <span>普通整机导出（文字+媒体）</span>
                </button>
            </div>

            <p className="text-[10px] text-slate-400 px-1 mb-3 text-center">以下为分步导出，适合低配设备分次备份</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={() => handleExport('text_only')} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 relative overflow-hidden">
                    <div className="p-2 bg-blue-50 rounded-full text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>
                    <span>纯文字备份</span>
                </button>
                 <button onClick={() => handleExport('media_only')} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2">
                    <div className="p-2 bg-pink-50 rounded-full text-pink-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg></div>
                    <span>媒体与美化素材</span>
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-4">
                 <div onClick={() => importInputRef.current?.click()} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 cursor-pointer hover:bg-emerald-50 hover:border-emerald-200">
                    <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg></div>
                    <span>导入备份 (.zip / .json)</span>
                </div>
                <input type="file" ref={importInputRef} className="hidden" accept=".json,.zip" onChange={handleImport} />
            </div>
            
            <p className="text-[10px] text-slate-400 px-1 mb-4 leading-relaxed">
                • <b>整合导出</b>: 一次性导出所有数据（文字+媒体），适合设备性能充足的用户。<br/>
                • <b>纯文字备份</b>: 包含所有聊天记录、角色设定、剧情数据。所有图片会被移除（减小体积）。<br/>
                • <b>媒体与美化素材</b>: 导出相册、表情包、聊天图片、头像、主题气泡、壁纸、图标等图片资源和外观配置。<br/>
                • 兼容旧版 JSON 备份文件的导入。
            </p>
            
            <button onClick={() => setShowResetConfirm(true)} className="w-full py-3 bg-red-50 border border-red-100 text-red-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                格式化系统 (出厂设置)
            </button>
        </section>

        {/* AI 连接设置区域 */}
        <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100/50 rounded-xl text-emerald-600">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                        </svg>
                    </div>
                    <h2 className="text-sm font-semibold text-slate-600 tracking-wider">对话 AI</h2>
                </div>
                <button onClick={() => setShowPresetModal(true)} className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform">
                    保存为新预设
                </button>
            </div>

            {/* Presets List */}
            {apiPresets.length > 0 && (
                <div className="mb-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block pl-1">我的预设</label>
                    <div className="space-y-2">
                        {apiPresets.map(preset => (
                            <div key={preset.id} className={`flex items-center gap-2 bg-white border rounded-xl pl-3 pr-2 py-2 shadow-sm ${activeApiPresetId === preset.id ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                                <button onClick={() => loadPreset(preset)} className="min-w-0 flex-1 text-left">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                        {activeApiPresetId === preset.id && <CheckCircle size={14} weight="fill" className="text-emerald-500 shrink-0" />}
                                        <span className="truncate">{preset.name}</span>
                                    </span>
                                    <span className="block truncate text-[10px] text-slate-400 mt-0.5">{preset.config.model || '未填写模型'} · 点这里放入编辑区</span>
                                </button>
                                <button onClick={() => void copyPresetName(preset.name)} aria-label={`复制${preset.name}`} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-primary transition-colors">
                                    <CopySimple size={14} />
                                </button>
                                <button onClick={() => handleActivatePreset(preset)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${activeApiPresetId === preset.id ? 'bg-emerald-50 text-emerald-600' : 'bg-primary/10 text-primary'}`}>
                                    {activeApiPresetId === preset.id ? '使用中' : '使用'}
                                </button>
                                <button onClick={() => removeApiPreset(preset.id)} aria-label={`删除${preset.name}`} className="p-1 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="space-y-4">
                <div className="group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">URL</label>
                    <input type="text" value={localUrl} onChange={(e) => setLocalUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                </div>

                <div className="group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Key</label>
                    <input type="password" value={localKey} onChange={(e) => setLocalKey(e.target.value)} placeholder="sk-..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                </div>

                <div className="group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">MiniMax Key (可选)</label>
                    <input type="password" value={localMiniMaxKey} onChange={(e) => setLocalMiniMaxKey(e.target.value)} placeholder="MiniMax API Secret（留空则复用 Key）" className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                    <p className="text-[11px] text-slate-400 mt-1 pl-1">电话 / 音色查询优先使用这个 Key，空着时回退通用 Key。</p>
                </div>

                <div className="group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">MiniMax Group ID (可选)</label>
                    <input type="text" value={localMiniMaxGroupId} onChange={(e) => setLocalMiniMaxGroupId(e.target.value)} placeholder="group_id（部分账号/模型需要）" className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                    <p className="text-[11px] text-slate-400 mt-1 pl-1">如控制台给了 group_id，请填这里；会透传到 TTS 请求体和代理日志。</p>
                </div>

                <div className="pt-2">
                     <div className="flex justify-between items-center mb-1.5 pl-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model</label>
                        <button onClick={fetchModels} disabled={isLoadingModels} className="text-[10px] text-primary font-bold">{isLoadingModels ? 'Fetching...' : '刷新模型列表'}</button>
                    </div>
                    
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowModelModal(true)}
                            className="min-w-0 flex-1 bg-white/50 border border-slate-200/60 rounded-xl px-4 py-3 text-sm text-slate-700 flex justify-between items-center active:bg-white transition-all shadow-sm"
                        >
                            <span className="truncate font-mono">{localModel || 'Select Model...'}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                        </button>
                        <button
                            type="button"
                            disabled={!localModel.trim()}
                            onClick={() => void copyText(localModel, '模型名')}
                            aria-label="复制当前模型名"
                            className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/60 bg-white/50 text-slate-400 shadow-sm active:scale-95 disabled:opacity-35"
                        >
                            <CopySimple size={17} />
                        </button>
                    </div>
                </div>
                
                <button onClick={handleSaveApi} className="w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-primary/20 bg-primary active:scale-95 transition-all mt-2">
                    {statusMsg || '保存并启用当前填写'}
                </button>
                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                    点预设名称只会放进编辑区；点“使用”或上方按钮，才会真正切换对话连接。
                </p>
            </div>
        </section>

        {/* System director reuses the saved preset catalog. Apps must resolve
            structured-analysis tasks through the shared task router instead
            of growing their own raw URL/key/model forms. */}
        <section
            data-ai-runtime-routing
            className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50"
        >
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100/70 text-violet-600">
                    <Notebook size={18} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold tracking-wider text-slate-600">系统主持 AI</h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        负责旧记录整理、情绪判断和剧情结构分析；不会替角色说话，也不直接写两个人的关系记忆。
                    </p>
                </div>
            </div>

            <div className="mt-4 space-y-2">
                <button
                    type="button"
                    onClick={() => updateAiRuntimeRouting({
                        version: 1,
                        systemDirector: { mode: 'inherit_dialogue' },
                    })}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${
                        aiRuntimeRouting.systemDirector.mode === 'inherit_dialogue'
                            ? 'border-violet-300 bg-violet-50 text-violet-700'
                            : 'border-slate-100 bg-white/80 text-slate-600'
                    }`}
                >
                    <span className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold">跟随对话 AI</span>
                        {aiRuntimeRouting.systemDirector.mode === 'inherit_dialogue' && (
                            <CheckCircle size={16} weight="fill" className="text-violet-500" />
                        )}
                    </span>
                    <span className="mt-1 block truncate text-[10px] opacity-65">
                        {apiConfig.model || '尚未启用对话模型'}
                    </span>
                </button>

                {apiPresets.map(preset => {
                    const selected = (
                        aiRuntimeRouting.systemDirector.mode === 'preset'
                        && aiRuntimeRouting.systemDirector.presetId === preset.id
                    );
                    return (
                        <button
                            type="button"
                            key={`system-director-${preset.id}`}
                            onClick={() => updateAiRuntimeRouting({
                                version: 1,
                                systemDirector: { mode: 'preset', presetId: preset.id },
                            })}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${
                                selected
                                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                                    : 'border-slate-100 bg-white/80 text-slate-600'
                            }`}
                        >
                            <span className="flex items-center justify-between gap-3">
                                <span className="min-w-0 truncate text-xs font-bold">{preset.name}</span>
                                {selected && <CheckCircle size={16} weight="fill" className="shrink-0 text-violet-500" />}
                            </span>
                            <span className="mt-1 block truncate text-[10px] opacity-65">
                                {preset.config.model || '未填写模型'}
                            </span>
                        </button>
                    );
                })}
            </div>

            {apiPresets.length === 0 && (
                <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
                    暂时没有其他预设；系统主持会直接跟随上方的对话 AI。
                </p>
            )}
            {systemDirectorPresetMissing && (
                <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-[10px] leading-relaxed text-rose-600">
                    原先选择的系统主持预设已经不存在。涉及整理或分析时会明确停下，不会偷偷改用别的模型。
                </p>
            )}
        </section>

        {/* 主动来信设置区域 */}
        <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-100/70 rounded-xl text-amber-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0l-7.5-4.615a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-600 tracking-wider">主动来信</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">自然惦念和生活照看</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="bg-white/70 border border-slate-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                            <div className="text-sm font-bold text-slate-700">自然惦念</div>
                        </div>
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 whitespace-nowrap shrink-0">聊天页开启</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => updateWakeupSettings({ hiddenWordsEnabled: !wakeupSettings.hiddenWordsEnabled })}
                            className={`py-2.5 rounded-xl text-xs font-bold leading-tight transition-all ${wakeupSettings.hiddenWordsEnabled ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}
                        >
                            藏好的话
                        </button>
                        <button
                            onClick={() => updateWakeupSettings({ momentWordsEnabled: !wakeupSettings.momentWordsEnabled })}
                            className={`py-2.5 rounded-xl text-xs font-bold leading-tight transition-all ${wakeupSettings.momentWordsEnabled ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}
                        >
                            此刻的话
                        </button>
                    </div>
                </div>

                <div className="bg-white/70 border border-slate-100 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-bold text-slate-700">生活照看</div>
                        </div>
                        <button
                            onClick={() => updateWakeupSettings({ aiCareWindowsEnabled: !wakeupSettings.aiCareWindowsEnabled })}
                            className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${wakeupSettings.aiCareWindowsEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${wakeupSettings.aiCareWindowsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
            </div>
        </section>

        {/* 自动记忆 */}
        <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-2">
                    <div className="p-2 bg-rose-100/70 rounded-xl text-rose-600">
                        <Notebook size={18} weight="fill" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-600 tracking-wider">自动记忆</h2>
                    </div>
                </div>
                <button
                    onClick={() => updateMemoryReceiptSettings(!memoryReceiptSettings.enabled)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${memoryReceiptSettings.enabled ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}`}
                >
                    {memoryReceiptSettings.enabled ? '回声记录中' : '回声已暂停'}
                </button>
            </div>

            <div className="mb-3 rounded-2xl border border-rose-100/70 bg-white/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-slate-700">时光簿</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                            {autoMemorySettings.timebookCandidateMode === 'silent' ? '节点候选整理' : '手动整理'}
                        </div>
                    </div>
                    <button
                        onClick={handleRunAutoMemoryOnce}
                        disabled={isRunningAutoMemory}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
                    >
                        {isRunningAutoMemory ? '整理中' : '整理一次'}
                    </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-3 py-2">
                    <div>
                        <div className="text-xs font-bold text-slate-600">节点候选</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                            {autoMemorySettings.timebookCandidateMode === 'silent' ? '自动整理' : '关闭'}
                        </div>
                    </div>
                    <button
                        onClick={() => updateAutoMemorySettings({
                            timebookCandidateMode: autoMemorySettings.timebookCandidateMode === 'silent' ? 'off' : 'silent'
                        })}
                        className={`h-6 w-11 shrink-0 rounded-full relative transition-colors ${autoMemorySettings.timebookCandidateMode === 'silent' ? 'bg-rose-500' : 'bg-slate-300'}`}
                    >
                        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoMemorySettings.timebookCandidateMode === 'silent' ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-3 py-2">
                    <div>
                        <div className="text-xs font-bold text-slate-600">角色记忆</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                            {memoryDMSettings.enabled ? `每 ${memoryDMSettings.turnsPerPass} 轮整理` : '手动归档'}
                        </div>
                    </div>
                    <button
                        onClick={() => updateMemoryDMSettings({ enabled: !memoryDMSettings.enabled })}
                        className={`h-6 w-11 shrink-0 rounded-full relative transition-colors ${memoryDMSettings.enabled ? 'bg-rose-500' : 'bg-slate-300'}`}
                    >
                        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${memoryDMSettings.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="mt-3 rounded-2xl bg-slate-50/80 px-3 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-xs font-bold text-slate-600">整理间隔</div>
                        <div className="text-[11px] font-bold text-rose-500">{memoryDMSettings.turnsPerPass} 轮</div>
                    </div>
                    <input
                        type="range"
                        min={MEMORY_DM_TURN_MIN}
                        max={MEMORY_DM_TURN_MAX}
                        step={MEMORY_DM_TURN_STEP}
                        value={memoryDMSettings.turnsPerPass}
                        onChange={(event) => updateMemoryDMSettings({ turnsPerPass: Number(event.target.value) })}
                        className="h-2 w-full cursor-pointer accent-rose-500"
                    />
                    <div className="mt-1 flex justify-between text-[9px] font-bold text-slate-300">
                        <span>{MEMORY_DM_TURN_MIN}</span>
                        <span>60</span>
                        <span>{MEMORY_DM_TURN_MAX}</span>
                    </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-700">最近候选</div>
                        <button
                            onClick={handleClearAutoMemoryLedger}
                            className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 transition active:scale-95"
                        >
                            清空
                        </button>
                    </div>
                    {!latestAutoMemory ? (
                        <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
                            还没有整理候选。
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-rose-600">
                                        {autoMemoryKindLabel(latestAutoMemory.kind)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        {formatMemoryReceiptTime(latestAutoMemory.at)}
                                    </span>
                                </div>
                                <div className="text-xs font-bold text-slate-700">{latestAutoMemory.title}</div>
                                {latestAutoMemory.summary && (
                                    <div className="mt-1 max-h-10 overflow-hidden text-[11px] leading-relaxed text-slate-500">
                                        {latestAutoMemory.summary}
                                    </div>
                                )}
                            </div>
                            {olderAutoMemories.length > 0 && (
                                <details className="rounded-xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
                                    <summary className="cursor-pointer font-bold text-slate-400">更早沉淀</summary>
                                    <div className="mt-2 space-y-1.5">
                                        {olderAutoMemories.map(entry => (
                                            <div key={entry.id} className="flex items-center justify-between gap-2">
                                                <span className="truncate">{autoMemoryKindLabel(entry.kind)} · {entry.charName}</span>
                                                <span className="shrink-0 text-slate-400">{entry.sourceDate || '刚刚'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-sm font-bold text-slate-700">记忆回声</div>
                    {latestMemoryReceipt && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400 whitespace-nowrap">
                            {formatMemoryReceiptTime(latestMemoryReceipt.at)}
                        </span>
                    )}
                </div>

                <div className="flex gap-2 mb-3">
                    <button onClick={refreshMemoryReceipts} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold active:scale-95 transition-transform">
                        刷新
                    </button>
                    <button onClick={handleClearMemoryReceipts} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold active:scale-95 transition-transform">
                        清空记录
                    </button>
                </div>

                {!latestMemoryReceipt ? (
                    <div className="rounded-2xl bg-slate-50/80 border border-slate-100 px-4 py-5 text-center">
                        <div className="text-sm font-bold text-slate-500 mb-1">还没有回声</div>
                        <div className="text-[11px] text-slate-400 leading-relaxed">
                            去聊天或见面里说一句，再回来刷新。
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 shrink-0">
                                        {memoryReceiptModeLabel(latestMemoryReceipt.mode)}
                                    </span>
                                    <span className="text-xs font-bold text-slate-700 truncate">
                                        {latestMemoryReceipt.personaMaskLabel} × {latestMemoryReceipt.charName}
                                    </span>
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                        {memoryReceiptSurfaceLabel(latestMemoryReceipt.surface)}
                                    </span>
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                    {latestMemoryReceipt.delivered ? `${latestMemoryReceipt.candidateCount} 条线索` : '未命中'}
                                </span>
                            </div>

                            <div className="text-[11px] text-slate-500 leading-relaxed">
                                {latestMemoryReceipt.delivered
                                    ? `递入 ${latestMemoryReceipt.candidateCount} 条线索，${latestMemoryReceipt.openThreadCount} 个回响。`
                                    : '这次没有可递入的线索。'}
                            </div>

                            {latestMemoryReceipt.delivered && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-500 border border-slate-100">
                                        {memoryReceiptTierLabel(latestMemoryReceipt.deliveryTier)}
                                    </span>
                                    {latestMemoryReceipt.hotStateDelivered && (
                                        <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-500 border border-slate-100">
                                            近况
                                        </span>
                                    )}
                                    {!!latestMemoryReceipt.voiceFingerprintCount && (
                                        <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-500 border border-slate-100">
                                            语气 {latestMemoryReceipt.voiceFingerprintCount}
                                        </span>
                                    )}
                                    {latestMemoryReceipt.historicalCandidateCount > 0 && (
                                        <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] text-violet-600 border border-violet-100">
                                            历史回声 {latestMemoryReceipt.historicalCandidateCount}
                                        </span>
                                    )}
                                    {latestMemoryReceipt.historicalSourceKinds.map(sourceKind => (
                                        <span key={`${latestMemoryReceipt.id}-${sourceKind}`} className="rounded-full bg-violet-50 px-2 py-1 text-[10px] text-violet-600 border border-violet-100">
                                            {sourceKind === 'history_analysis' ? '旧日分析' : sourceKind}
                                        </span>
                                    ))}
                                    {latestMemoryReceipt.historicalAuthorities.map(authority => (
                                        <span key={`${latestMemoryReceipt.id}-${authority}`} className="rounded-full bg-violet-50 px-2 py-1 text-[10px] text-violet-600 border border-violet-100">
                                            {memoryReceiptAuthorityLabel(authority)}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {getMemoryReceiptTitles(latestMemoryReceipt).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {getMemoryReceiptTitles(latestMemoryReceipt).map((title, index) => (
                                        <span key={`${latestMemoryReceipt.id}-${title}-${index}`} className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-500 border border-slate-100">
                                            {title}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {latestMemoryReceipt.warnings.length > 0 && (
                                <div className="mt-2 text-[10px] text-amber-600 bg-amber-50 rounded-xl px-2 py-1">
                                    {latestMemoryReceipt.warnings.length} 条读取提醒
                                </div>
                            )}
                        </div>

                        {olderMemoryReceipts.length > 0 && (
                            <details className="rounded-2xl bg-slate-50/80 border border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                                <summary className="cursor-pointer font-bold text-slate-400">过往回声</summary>
                                <div className="mt-2 space-y-1.5">
                                    {olderMemoryReceipts.map(receipt => (
                                        <div key={receipt.id} className="flex items-center justify-between gap-2">
                                            <span className="truncate">{memoryReceiptModeLabel(receipt.mode)} · {receipt.charName}</span>
                                            <span className="shrink-0 text-slate-400">{receipt.delivered ? `${receipt.candidateCount} 条` : '未命中'}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}
            </div>
        </section>

        {/* 实时感知配置区域 */}
        <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-violet-100/50 rounded-xl text-violet-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                        </svg>
                    </div>
                    <h2 className="text-sm font-semibold text-slate-600 tracking-wider">实时感知</h2>
                </div>
                <button onClick={() => setShowRealtimeModal(true)} className="text-[10px] bg-violet-100 text-violet-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform">
                    配置
                </button>
            </div>

            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                {realityModeLabel[rtRealityMode]} · {rtWeatherEnabled ? weatherScopeLabel[rtWeatherScope] : '不接天气'} · {careBoundaryLabel[rtCareBoundary]}
            </p>

            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="py-3 rounded-xl text-xs font-bold bg-violet-50 text-violet-600">
                    <div className="text-lg mb-1"><img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f310.png" className="w-5 h-5 inline" alt="" /></div>
                    同频
                </div>
                <div className="py-3 rounded-xl text-xs font-bold bg-violet-50 text-violet-600">
                    <div className="text-lg mb-1"><img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/23f0.png" className="w-5 h-5 inline" alt="" /></div>
                    时间
                </div>
                <div className={`py-3 rounded-xl text-xs font-bold ${rtWeatherEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <div className="text-lg mb-1">{rtWeatherEnabled ? <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2600.png" className="w-5 h-5 inline" alt="" /> : <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f32b.png" className="w-5 h-5 inline" alt="" />}</div>
                    天气
                </div>
            </div>
        </section>

        <div className="order-11 text-center text-[10px] text-slate-300 pb-8 font-mono tracking-widest uppercase">
            v2.2 (Realtime Awareness)
        </div>
      </div>

      {/* 模型选择 Modal */}
      <Modal isOpen={showModelModal} title="选择模型" onClose={() => setShowModelModal(false)}>
        <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-2 p-1">
            {availableModels.length > 0 ? availableModels.map(m => (
                <div key={m} className={`flex items-center gap-2 rounded-xl px-2 ${m === localModel ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'bg-slate-50 text-slate-600'}`}>
                    <button onClick={() => { setLocalModel(m); setShowModelModal(false); }} className="min-w-0 flex-1 px-2 py-3 text-left text-sm font-mono flex justify-between items-center">
                        <span className="truncate">{m}</span>
                        {m === localModel && <div className="w-2 h-2 rounded-full bg-primary"></div>}
                    </button>
                    <button type="button" onClick={() => void copyText(m, '模型名')} aria-label={`复制模型名${m}`} className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-white/70 hover:text-primary">
                        <CopySimple size={15} />
                    </button>
                </div>
            )) : <div className="text-center text-slate-400 py-8 text-xs">列表为空，请先点击“刷新模型列表”</div>}
        </div>
      </Modal>

      {/* Preset Name Modal */}
      <Modal isOpen={showPresetModal} title="保存预设" onClose={() => setShowPresetModal(false)} footer={<button onClick={handleSavePreset} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存</button>}>
          <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">预设名称 (例如: DeepSeek)</label>
              <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)} className="w-full bg-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-primary" autoFocus placeholder="Name..." />
          </div>
      </Modal>

      {/* 强制导出 Modal */}
      <Modal isOpen={showExportModal} title="备份下载" onClose={() => setShowExportModal(false)} footer={
          <div className="flex gap-2 w-full">
               <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">关闭</button>
          </div>
      }>
          <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              </div>
              <p className="text-sm font-bold text-slate-700">备份文件已生成！</p>
              <p className="text-xs text-slate-500">如果浏览器没有自动下载，请点击下方链接。</p>
              {downloadUrl && <a href={downloadUrl} download="AetherOS_Backup.zip" className="text-primary text-sm underline block py-2">点击手动下载 .zip</a>}
          </div>
      </Modal>

      {/* 实时感知配置 Modal */}
      <Modal
          isOpen={showRealtimeModal}
          title="实时感知配置"
          onClose={() => setShowRealtimeModal(false)}
          footer={<button onClick={handleSaveRealtimeConfig} className="w-full py-3 bg-violet-500 text-white font-bold rounded-2xl shadow-lg">保存配置</button>}
      >
          <div className="space-y-5 max-h-[60vh] overflow-y-auto no-scrollbar">
              <div className="bg-violet-50/60 p-4 rounded-2xl space-y-3">
                  <div className="text-sm font-bold text-violet-700">现实同频</div>
                  <div className="grid grid-cols-3 gap-2">
                      {([
                          ['real_anchor', '现实锚定'],
                          ['rhythm_weather', '昼夜同频'],
                          ['fiction_free', '剧情自由'],
                      ] as const).map(([mode, label]) => (
                          <button
                              key={mode}
                              onClick={() => setRtRealityMode(mode)}
                              className={`rounded-xl px-2 py-2.5 text-[11px] font-bold transition-colors ${rtRealityMode === mode ? 'bg-violet-500 text-white shadow-sm' : 'bg-white/80 text-violet-400'}`}
                          >
                              {label}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="bg-white/70 p-4 rounded-2xl space-y-3 border border-slate-100">
                  <div className="text-sm font-bold text-slate-700">照看分寸</div>
                  <div className="grid grid-cols-3 gap-2">
                      {([
                          ['soft', '轻声照看'],
                          ['direct', '明确提醒'],
                          ['off', '不主动管'],
                      ] as const).map(([boundary, label]) => (
                          <button
                              key={boundary}
                              onClick={() => setRtCareBoundary(boundary)}
                              className={`rounded-xl px-2 py-2.5 text-[11px] font-bold transition-colors ${rtCareBoundary === boundary ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-50 text-slate-400'}`}
                          >
                              {label}
                          </button>
                      ))}
                  </div>
              </div>

              {/* 天气配置 */}
              <div className="bg-emerald-50/50 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                          <Sun size={20} weight="fill" />
                          <span className="text-sm font-bold text-emerald-700">天气感知</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={rtWeatherEnabled} onChange={e => setRtWeatherEnabled(e.target.checked)} className="sr-only peer" />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                  </div>
                  {rtWeatherEnabled && (
                      <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                              {([
                                  ['user_only', '只看你这边'],
                                  ['shared_echo', '共享回声'],
                              ] as const).map(([scope, label]) => (
                                  <button
                                      key={scope}
                                      onClick={() => setRtWeatherScope(scope)}
                                      className={`rounded-xl px-2 py-2.5 text-[11px] font-bold transition-colors ${rtWeatherScope === scope ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white/80 text-emerald-500'}`}
                                  >
                                      {label}
                                  </button>
                              ))}
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">OpenWeatherMap API Key</label>
                              <input type="password" value={rtWeatherKey} onChange={e => setRtWeatherKey(e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: openweathermap.org" />
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">城市 (英文)</label>
                              <input type="text" value={rtWeatherCity} onChange={e => setRtWeatherCity(e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm" placeholder="Beijing, Shanghai, etc." />
                          </div>
                          <button onClick={testWeatherApi} className="w-full py-2 bg-emerald-100 text-emerald-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试天气API</button>
                      </div>
                  )}
              </div>

              {/* 测试状态 */}
              {rtTestStatus && (
                  <div className={`p-3 rounded-xl text-xs font-medium text-center ${rtTestStatus.includes('成功') ? 'bg-emerald-100 text-emerald-700' : rtTestStatus.includes('失败') || rtTestStatus.includes('错误') ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                      {rtTestStatus}
                  </div>
              )}
          </div>
      </Modal>

      <Modal
          isOpen={showResetConfirm}
          title="系统警告"
          onClose={() => setShowResetConfirm(false)}
          footer={
              <div className="flex gap-2 w-full">
                  <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">取消</button>
                  <button onClick={confirmReset} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">确认格式化</button>
              </div>
          }
      >
          <div className="flex flex-col items-center gap-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-red-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              <p className="text-center text-sm text-slate-600 font-medium">
                  这将<span className="text-red-500 font-bold">永久删除</span>所有角色、聊天记录和设置，且无法恢复！
              </p>
          </div>
      </Modal>

    </div>
  );
};

export default Settings;
