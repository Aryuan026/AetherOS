


import React, { Suspense, useState, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import SystemErrorIndicator from './os/SystemErrorIndicator';
import SimulatedPhoneStatusBar from './os/SimulatedPhoneStatusBar';
import Launcher from '../apps/Launcher';
import { ValentineController, shouldShowValentinePopup } from './ValentineEvent';
import { SpecialMomentsApp } from './special-moments/SpecialMomentsApp';
import { WhiteDayController, shouldShowWhiteDayPopup, isWhiteDay } from './WhiteDayEvent';
import { AppID } from '../types';
import { App as CapApp } from '@capacitor/app';
import { StatusBar as CapStatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { isIOSDevice, isIOSStandaloneWebApp, isStandaloneDisplayMode } from '../utils/iosStandalone';
import AppErrorBoundary from './os/AppErrorBoundary';
import { publicAsset } from '../utils/publicAssets';
import { buildShellChromeStyle, resolveShellChromeMode } from '../utils/shellChrome';
import { SHELL_OVERLAY_TOP } from './shell/shellLayout';
import VirtualCityStrip from './shell/VirtualCityStrip';
import { useVirtualWorldClock } from '../hooks/useVirtualWorldClock';

const AETHEROS_BRAND_ICON = publicAsset('brand/aetheros-starcore.jpg');
const LOCK_SCREEN_SLOGAN_LINES = [
  'Real isn’t how you are made.',
  'It’s a thing that happens to you.',
] as const;
const LOCK_SCREEN_SCRIPT_FONT = '"Snell Roundhand", "Apple Chancery", "URW Chancery L", cursive';

// Keep the launcher and global controllers eager, but load feature apps only when
// opened. This prevents every large app module from occupying the initial tab and
// Vite HMR graph at once.
const Settings = React.lazy(() => import('../apps/Settings'));
const Character = React.lazy(() => import('../apps/Character'));
const Chat = React.lazy(() => import('../apps/Chat'));
const GroupChat = React.lazy(() => import('../apps/GroupChat'));
const ThemeMaker = React.lazy(() => import('../apps/ThemeMaker'));
const Appearance = React.lazy(() => import('../apps/Appearance'));
const Gallery = React.lazy(() => import('../apps/Gallery'));
const DateApp = React.lazy(() => import('../apps/DateApp'));
const UserApp = React.lazy(() => import('../apps/UserApp'));
const JournalApp = React.lazy(() => import('../apps/JournalApp'));
const ScheduleApp = React.lazy(() => import('../apps/ScheduleApp'));
const CompanionPlanApp = React.lazy(() => import('../apps/CompanionPlanApp'));
const RoomApp = React.lazy(() => import('../apps/RoomApp'));
const CheckPhone = React.lazy(() => import('../apps/CheckPhone'));
const SocialApp = React.lazy(() => import('../apps/SocialApp'));
const StudyApp = React.lazy(() => import('../apps/StudyApp'));
const FAQApp = React.lazy(() => import('../apps/FAQApp'));
const GameApp = React.lazy(() => import('../apps/GameApp'));
const WorldbookApp = React.lazy(() => import('../apps/WorldbookApp'));
const NovelApp = React.lazy(() => import('../apps/NovelApp'));
const CreativeSchemeApp = React.lazy(() => import('../apps/CreativeSchemeApp'));
const BankApp = React.lazy(() => import('../apps/BankApp'));
const BrowserApp = React.lazy(() => import('../apps/BrowserApp'));
const SongwritingApp = React.lazy(() => import('../apps/SongwritingApp'));
const CallApp = React.lazy(() => import('../apps/CallApp'));
const VoiceDesignerApp = React.lazy(() => import('../apps/VoiceDesignerApp'));
const GuidebookApp = React.lazy(() => import('../apps/GuidebookApp'));
const LifeSimApp = React.lazy(() => import('../apps/LifeSimApp'));
const WidgetApp = React.lazy(() => import('../apps/WidgetApp'));
const HistoryImportApp = React.lazy(() => import('../apps/HistoryImportApp'));
const DailyArchiveApp = React.lazy(() => import('../apps/DailyArchiveApp'));

const AppChunkFallback = () => (
  <div className="flex h-full w-full items-center justify-center bg-white/45 text-xs font-semibold text-slate-400">
    正在打开…
  </div>
);

/*
// Internal Error Boundary Component
class AppErrorBoundary extends Component<{ children: React.ReactNode, onCloseApp: () => void, resetKey: string }, { hasError: boolean, error: Error | null, copyLabel: string }> {
    private copyLabelTimer: number | null = null;

    constructor(props: { children: React.ReactNode, onCloseApp: () => void, resetKey: string }) {
        super(props);
        this.state = { hasError: false, error: null, copyLabel: '复制报错信息' };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("App Crash:", error, errorInfo);
    }

    // Reset error state only when the active app changes.
    componentDidUpdate(prevProps: { children: React.ReactNode, onCloseApp: () => void, resetKey: string }) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false, error: null, copyLabel: '复制报错信息' });
        }
    }

    componentWillUnmount() {
        if (this.copyLabelTimer) window.clearTimeout(this.copyLabelTimer);
    }

    private updateCopyLabel = (label: string) => {
        if (this.copyLabelTimer) window.clearTimeout(this.copyLabelTimer);
        this.setState({ copyLabel: label });
        this.copyLabelTimer = window.setTimeout(() => {
            this.setState({ copyLabel: '复制报错信息' });
            this.copyLabelTimer = null;
        }, 1800);
    };

    private handleCopy = async () => {
        const errText = this.state.error?.stack || this.state.error?.message || 'Unknown Error';

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(errText);
                this.updateCopyLabel('已复制');
                return;
            }
        } catch {
            // Fall through to legacy copy path.
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = errText;
            textarea.setAttribute('readonly', 'true');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const copied = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (copied) {
                this.updateCopyLabel('已复制');
                return;
            }
        } catch {
            // Fall through to prompt fallback.
        }

        window.prompt('请手动复制报错信息', errText);
        this.updateCopyLabel('请手动复制');
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center space-y-4">
                    <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f635.png" alt="error" className="w-10 h-10" />
                    <h2 className="text-lg font-bold">应用运行错误</h2>
                    <p className="text-xs text-slate-400 font-mono bg-black/30 p-3 rounded max-w-full overflow-auto max-h-40 select-text break-all whitespace-pre-wrap">
                        {this.state.error?.message || 'Unknown Error'}
                    </p>
                    <button
                        onClick={() => {
                            const errText = this.state.error?.message || 'Unknown Error';
                            navigator.clipboard?.writeText(errText).then(() => {}).catch(() => {});
                        }}
                        className="px-4 py-2 bg-slate-700 rounded-full text-xs active:scale-95 transition-transform"
                    >
                        复制错误信息
                    </button>
                    <button
                        onClick={() => { this.setState({ hasError: false }); this.props.onCloseApp(); }}
                        className="px-6 py-3 bg-red-600 rounded-full font-bold text-sm shadow-lg active:scale-95 transition-transform"
                    >
                        返回桌面
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
*/

const DISCLAIMER_KEY = 'aetheros_disclaimer_accepted';

const DisclaimerPopup: React.FC<{ onAccept: () => void }> = ({ onAccept }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-5 animate-fade-in">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
    <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="pt-7 pb-3 px-6 text-center">
        <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4e2.png" alt="announcement" className="w-8 h-8 mb-2" />
        <h2 className="text-lg font-extrabold text-slate-800">开源说明与免责声明</h2>
        <p className="text-[11px] text-slate-400 mt-1">Open Source Notice · 手抓糯米机 (SullyOS)</p>
      </div>

      {/* Content */}
      <div className="px-6 pb-4 max-h-[55vh] overflow-y-auto no-scrollbar space-y-3">
        <p className="text-[13px] text-slate-600 leading-relaxed">
          本站是基于开源项目「手抓糯米机 (SullyOS)」的<strong className="text-slate-800">非商业自用版本</strong>，用于少量朋友之间测试角色卡与聊天体验。
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-[12px] text-slate-600 leading-relaxed space-y-1.5">
          <p><strong className="text-slate-800">原项目：</strong>手抓糯米机 (SullyOS)</p>
          <p><strong className="text-slate-800">原作者署名：</strong>NMJ（SullyOS / 手抓糯米机）；Copyright (c) 2024-2026 NMJ (SullyOS / 手抓糯米机)。</p>
          <p><strong className="text-slate-800">本版本维护：</strong>A-Yuan / Asherie。</p>
        </div>
        <ul className="text-[12px] text-slate-500 leading-relaxed space-y-1.5 list-none">
          <li className="flex gap-2"><span className="shrink-0">•</span><span>内置角色/预设可能包含同人化整理与再创作，不代表原作品官方立场；相关权利归原权利方所有。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>禁止出售、转卖、付费分发、付费定制、商业平台运营、引流变现，或伪装为官方/授权内容。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>感谢原 SullyOS 项目提供的开源基础；本版本的主动来信、记忆递送与界面改造由 AetherOS 分支维护。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>本软件不提供任何明示或暗示的担保，原作者与改造维护者均不对使用本软件产生的任何后果承担责任。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>用户应自行承担使用本软件的一切风险，包括但不限于数据丢失、设备损坏等。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>本软件生成的任何 AI 内容均不代表作者立场，用户需自行判断内容的准确性与合规性。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>禁止将本软件用于任何违反当地法律法规的用途。</span></li>
        </ul>

        {/* Highlighted warning */}
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mt-3">
          <p className="text-[13px] font-bold text-red-600 text-center leading-relaxed">
            本程序完全免费！<br />
            如果您是通过<span className="underline decoration-2 decoration-red-400">付费购买</span>获得此程序的，说明您已被倒卖欺骗。<br />
            请向售卖者维权追责！
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-7 pt-2">
        <button
          onClick={onAccept}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform text-sm"
        >
          我已知悉，继续使用
        </button>
      </div>
    </div>
  </div>
);

const PhoneShell: React.FC = () => {
  const {
    theme,
    virtualTime,
    isLocked,
    unlock,
    activeApp,
    closeApp,
    isDataLoaded,
    toasts,
    unreadMessages,
    characters,
    handleBack,
    suspendedCall,
    resumeCall,
    activeCharacterId,
    userProfile,
    shellStatusBarVariantOverride,
  } = useOS();
  const useIOSStandaloneLayout = isIOSStandaloneWebApp();
  const virtualWorld = useVirtualWorldClock(userProfile);

  // Disclaimer popup for first-time users
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try {
      return !localStorage.getItem(DISCLAIMER_KEY);
    } catch {
      return true;
    }
  });

  const handleAcceptDisclaimer = () => {
    try {
      localStorage.setItem(DISCLAIMER_KEY, Date.now().toString());
    } catch { /* ignore */ }
    setShowDisclaimer(false);
  };

  // Valentine's Day popup (only on 2026-02-14, first visit)
  const [showValentine, setShowValentine] = useState(() => {
    try {
      // Only show after disclaimer is accepted
      return !!(localStorage.getItem(DISCLAIMER_KEY)) && shouldShowValentinePopup();
    } catch { return false; }
  });

  // Re-check valentine popup after disclaimer is accepted
  useEffect(() => {
    if (!showDisclaimer && !showValentine) {
      if (shouldShowValentinePopup()) {
        setShowValentine(true);
      }
    }
  }, [showDisclaimer]);

  // White Day popup (only on 2026-03-14, first visit)
  const [showWhiteDay, setShowWhiteDay] = useState(() => {
    try {
      return !!(localStorage.getItem(DISCLAIMER_KEY)) && shouldShowWhiteDayPopup();
    } catch { return false; }
  });

  // Re-check after disclaimer
  useEffect(() => {
    if (!showDisclaimer && !showWhiteDay) {
      if (shouldShowWhiteDayPopup()) {
        setShowWhiteDay(true);
      }
    }
  }, [showDisclaimer]);

  // Capacitor Native Handling
  useEffect(() => {
    const initNative = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await CapStatusBar.setOverlaysWebView({ overlay: true });
                await CapStatusBar.hide();
                await CapStatusBar.setStyle({ style: StatusBarStyle.Dark });

                const permStatus = await LocalNotifications.checkPermissions();
                if (permStatus.display !== 'granted') {
                    await LocalNotifications.requestPermissions();
                }

                // 白色情人节原生推送（不依赖活动完成状态）
                try {
                    const now = new Date();
                    const whiteDayDate = new Date(2026, 2, 14, 10, 0, 0);
                    const WHITEDAY_NOTIF_ID = 31400;
                    if (isWhiteDay() && !localStorage.getItem('aetheros_whiteday_native_notif_sent')) {
                        await LocalNotifications.schedule({ notifications: [{ title: '白色情人节快乐 💌', body: '今天是特别的日子，有人准备了专属惊喜等你来发现...', id: WHITEDAY_NOTIF_ID, schedule: { at: new Date(Date.now() + 1000) }, smallIcon: 'ic_stat_icon_config_sample' }] });
                        localStorage.setItem('aetheros_whiteday_native_notif_sent', '1');
                    } else if (now < whiteDayDate && !localStorage.getItem('aetheros_whiteday_notif_scheduled')) {
                        await LocalNotifications.schedule({ notifications: [{ title: '白色情人节快乐 💌', body: '今天是特别的日子，有人准备了专属惊喜等你来发现...', id: WHITEDAY_NOTIF_ID, schedule: { at: whiteDayDate }, smallIcon: 'ic_stat_icon_config_sample' }] });
                        localStorage.setItem('aetheros_whiteday_notif_scheduled', '1');
                    }
                } catch { /* native notification skipped */ }
            } catch (e) {
                console.error("Native init failed", e);
            }
        }
    };
    initNative();

    // Handle Android Hardware Back Button
    const setupBackButton = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await CapApp.removeAllListeners();
                CapApp.addListener('backButton', ({ canGoBack }) => {
                    if (isLocked) {
                        CapApp.exitApp();
                    } else {
                        handleBack(); // Delegate to OSContext logic
                    }
                });
            } catch (e) { console.log('Back button listener setup failed'); }
        }
    };

    setupBackButton();

    return () => {
        if (Capacitor.isNativePlatform()) {
            CapApp.removeAllListeners().catch(() => {});
        }
    };
  }, [activeApp, isLocked, closeApp, handleBack]);

  // Force scroll to top when app changes to prevent "push up" glitches on iOS
  useEffect(() => {
      window.scrollTo(0, 0);
  }, [activeApp]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const wallpaper = theme.wallpaper;
    const backgroundValue = !wallpaper
      ? '#0f1115'
      : (wallpaper.startsWith('http') || wallpaper.startsWith('data:') || wallpaper.startsWith('blob:'))
        ? `url(${wallpaper})`
        : wallpaper;

    [document.documentElement, document.body].forEach((element) => {
      element.style.background = backgroundValue;
      element.style.backgroundPosition = 'center';
      element.style.backgroundSize = 'cover';
      element.style.backgroundRepeat = 'no-repeat';
    });
  }, [theme.wallpaper]);

  if (!isDataLoaded) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-[#080719] text-white">
        <img
          src={AETHEROS_BRAND_ICON}
          alt="AetherOS"
          className="h-24 w-24 rounded-[1.8rem] shadow-[0_0_44px_rgba(155,126,255,0.42)]"
        />
        <div className="h-1 w-20 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-300/80" />
        </div>
      </div>
    );
  }

  const getBgStyle = (wp: string) => {
      const isUrl = wp.startsWith('http') || wp.startsWith('data:') || wp.startsWith('blob:');
      return isUrl ? `url(${wp})` : wp;
  };

  const bgImageValue = getBgStyle(theme.wallpaper);
  const contentColor = theme.contentColor || '#ffffff';
  const requestedShellChromeMode = resolveShellChromeMode(theme);
  // A virtual-city request without a valid scoped config fails closed to the
  // software shell, so a stale/mismatched relationship never leaves a blank bar.
  // Classic simulated-phone chrome does not depend on relationship scope.
  const shellChromeMode = requestedShellChromeMode === 'virtual_city'
    ? (virtualWorld.context ? 'virtual_city' : 'software')
    : requestedShellChromeMode;
  const shellIsStandalone = isStandaloneDisplayMode();
  const shellIsIOS = isIOSDevice();
  const shellIsNative = Capacitor.isNativePlatform();
  const shellRuntimeSurface = shellIsNative
    ? 'native'
    : shellIsStandalone
      ? (shellIsIOS ? 'ios-installed' : 'android-installed')
      : 'browser';
  const shellChromeStyle = buildShellChromeStyle(shellChromeMode, {
    standalone: shellIsStandalone,
    ios: shellIsIOS,
    native: shellIsNative,
  });
  const baseShellTone = activeApp === AppID.Launcher
    ? 'launcher'
    : activeApp === AppID.Call || activeApp === AppID.CheckPhone
      ? 'dark'
      : 'app';
  const shellTone = shellStatusBarVariantOverride || baseShellTone;

  if (isLocked) {
    const unreadCount = Object.values(unreadMessages).reduce((a,b) => a+b, 0);
    const unreadCharId = Object.keys(unreadMessages)[0];
    const unreadChar = unreadCharId ? characters.find(c => c.id === unreadCharId) : null;

        return (
      <div 
        onClick={() => {
            // Only ask once when permission is still undecided; don't keep poking blocked/denied browsers.
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
            unlock();
        }}
        className="relative w-full h-full bg-cover bg-center cursor-pointer overflow-hidden group font-light select-none overscroll-none"
        data-shell-chrome-mode={shellChromeMode}
        data-shell-runtime-surface={shellRuntimeSurface}
        style={{ ...shellChromeStyle, backgroundImage: bgImageValue, color: contentColor }}
      >
        <div className="absolute inset-0 bg-black/5 transition-colors duration-700 group-hover:bg-transparent" />
        {shellChromeMode === 'virtual_city' && virtualWorld.context && (
          <VirtualCityStrip context={virtualWorld.context} tone="dark" />
        )}
        {shellChromeMode === 'simulated_phone' && <SimulatedPhoneStatusBar tone="dark" />}
        
        <div className="absolute top-24 z-10 w-full text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
           {shellChromeMode === 'virtual_city' && virtualWorld.context ? (
             <>
               <div className="text-6xl tracking-[0.04em] opacity-95 font-bold">{virtualWorld.context.clock.timeLabel}</div>
               <div className="mt-3 text-xs font-bold tracking-[0.22em] opacity-80">
                 {virtualWorld.context.locationLabel} · {virtualWorld.context.clock.dateLabel}
               </div>
             </>
           ) : shellChromeMode === 'simulated_phone' ? (
             <>
               <div className="text-8xl font-bold tracking-tighter opacity-95">
                 {virtualTime.hours.toString().padStart(2, '0')}<span className="animate-pulse">:</span>{virtualTime.minutes.toString().padStart(2, '0')}
               </div>
               <div className="mt-2 text-xs font-bold uppercase tracking-widest opacity-90">AetherOS Simulation</div>
             </>
           ) : (
             <div className="text-5xl tracking-[0.08em] opacity-95 font-bold">AetherOS</div>
           )}
           <p
             data-lock-screen-slogan
             className="mx-auto mt-7 max-w-[22rem] px-3 text-[20px] leading-[1.9] tracking-[0.01em] opacity-90"
             style={{ fontFamily: LOCK_SCREEN_SCRIPT_FONT, fontWeight: 500 }}
           >
             {LOCK_SCREEN_SLOGAN_LINES.map(line => (
               <span key={line} className="block whitespace-nowrap">{line}</span>
             ))}
           </p>
        </div>

        {unreadCount > 0 && (
            <div className="absolute top-[40%] left-4 right-4 animate-slide-up">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 shadow-lg border border-white/10 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z" clipRule="evenodd" /></svg>
                    </div>
                    <div className="flex-1 min-w-0 text-white text-left">
                        <div className="font-bold text-sm flex justify-between">
                            <span>{unreadChar ? unreadChar.name : 'Message'}</span>
                            <span className="text-[10px] opacity-70">刚刚</span>
                        </div>
                        <div className="text-xs opacity-90 truncate">
                            {unreadCount > 1 ? `收到 ${unreadCount} 条新消息` : '发来了一条新消息'}
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="absolute bottom-12 z-10 w-full flex flex-col items-center gap-3 animate-pulse opacity-80 drop-shadow-md">
          <div className="w-1 h-8 rounded-full bg-gradient-to-b from-transparent to-current"></div>
          <span className="text-[10px] tracking-widest uppercase font-semibold">Tap to Unlock</span>
        </div>
      </div>
    );
  }

  const renderApp = () => {
    switch (activeApp) {
      case AppID.Settings: return <Settings />;
      case AppID.Character: return <Character />;
      case AppID.Chat: return <Chat />;
      case AppID.GroupChat: return <GroupChat />; 
      case AppID.ThemeMaker: return <ThemeMaker />;
      case AppID.Appearance: return <Appearance />;
      case AppID.Gallery: return <Gallery />;
      case AppID.Date: return <DateApp />; 
      case AppID.User: return <UserApp />;
      case AppID.Journal: return <JournalApp />; 
      case AppID.CompanionPlan: return <CompanionPlanApp />;
      case AppID.Schedule: return <ScheduleApp />;
      case AppID.Room: return <RoomApp />; 
      case AppID.CheckPhone: return <CheckPhone />;
      case AppID.Social: return <SocialApp />;
      case AppID.Study: return <StudyApp />; 
      case AppID.FAQ: return <FAQApp />; 
      case AppID.Game: return <GameApp />; 
      case AppID.Worldbook: return <WorldbookApp />;
      case AppID.Novel: return <NovelApp />; 
      case AppID.CreativeScheme: return <CreativeSchemeApp />;
      case AppID.Bank: return <BankApp />;
      case AppID.Browser: return <BrowserApp />;
      case AppID.Songwriting: return <SongwritingApp />;
      case AppID.Call: return <CallApp />;
      case AppID.VoiceDesigner: return <VoiceDesignerApp />;
      case AppID.Guidebook: return <GuidebookApp />;
      case AppID.LifeSim: return <LifeSimApp />;
      case AppID.Widget: return <WidgetApp />;
      case AppID.HistoryImport: return <HistoryImportApp />;
      case AppID.DailyArchive: return <DailyArchiveApp />;
      case AppID.SpecialMoments: return <SpecialMomentsApp />;
      case AppID.Launcher:
      default: return <Launcher />;
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-clip bg-gradient-to-br from-pink-200 via-purple-200 to-indigo-200 text-slate-900 font-sans select-none overscroll-none"
      data-shell-chrome-mode={shellChromeMode}
      data-shell-runtime-surface={shellRuntimeSurface}
      style={shellChromeStyle}
    >
       {/* Optimized Background Layer */}
       <div 
         className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
         style={{ 
             backgroundImage: bgImageValue,
             transform: activeApp !== AppID.Launcher ? 'scale(1.1)' : 'scale(1)',
             filter: activeApp !== AppID.Launcher ? 'blur(10px)' : 'none',
             opacity: activeApp !== AppID.Launcher ? 0.6 : 1,
             backfaceVisibility: 'hidden',
             contain: useIOSStandaloneLayout ? undefined : 'strict'
         }}
       />
       
       <div className={`absolute inset-0 transition-all duration-500 ${activeApp === AppID.Launcher ? 'bg-transparent' : 'bg-white/50 backdrop-blur-3xl'}`} />
       
       {/* 
          CRITICAL FIX: 
          Using 'absolute inset-0' prevents layout collapse.
          REMOVED 'flex flex-col' to fix layout issues in CheckPhone (gap) and SocialApp (jumping).
          Now it acts as a pure container for full-screen apps.
       */}
      <div 
  className="absolute inset-0 z-10 w-full h-full overflow-hidden bg-transparent overscroll-none flex flex-col"
  style={{ 
      paddingBottom: activeApp !== AppID.Launcher ? 'env(safe-area-inset-bottom)' : 0
  }}
> 
          {shellChromeMode === 'virtual_city' && virtualWorld.context && (
            <VirtualCityStrip context={virtualWorld.context} tone={shellTone} />
          )}
          {shellChromeMode === 'simulated_phone' && (
            <SimulatedPhoneStatusBar tone={shellTone} />
          )}
          {/* App Container */}
         <div className="flex-1 relative overflow-hidden" style={{ contain: useIOSStandaloneLayout ? undefined : 'layout style paint' }}>
    <AppErrorBoundary onCloseApp={closeApp} resetKey={`${activeApp}:${activeCharacterId || 'none'}`}>
        <Suspense fallback={<AppChunkFallback />}>
            {renderApp()}
        </Suspense>
    </AppErrorBoundary>
</div>

          {/* One top coordinate source for suspended calls, errors, and toasts. */}
          <div
            data-shell-overlay-stack
            className="pointer-events-none absolute inset-x-0 z-[60] flex flex-col items-stretch gap-2"
            style={{ top: SHELL_OVERLAY_TOP }}
          >
              {suspendedCall && activeApp !== AppID.Call && (
                <button
                  type="button"
                  onClick={resumeCall}
                  className="pointer-events-auto flex w-full cursor-pointer items-center justify-center gap-2 bg-emerald-500 py-1.5 text-xs font-bold text-white transition-colors animate-pulse active:bg-emerald-600"
                >
                  <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                  <span>通话中 · {suspendedCall.charName}</span>
                  <span className="opacity-70">点击返回</span>
                </button>
              )}
              <SystemErrorIndicator />
              {toasts.map(toast => (
                 <div key={toast.id} data-shell-toast className="self-center animate-fade-in bg-white/95 backdrop-blur-xl px-3.5 py-2 rounded-xl shadow-lg border border-black/5 flex items-center gap-2 max-w-[85%] ring-1 ring-white/20">
                     {toast.type === 'success' && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>}
                     {toast.type === 'error' && <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>}
                     {toast.type === 'info' && <div className="w-2 h-2 rounded-full bg-primary shrink-0"></div>}
                     <span className="text-xs font-bold text-slate-800 truncate leading-none">{toast.message}</span>
                 </div>
              ))}
          </div>
       </div>

       {/* First-time disclaimer popup */}
       {showDisclaimer && <DisclaimerPopup onAccept={handleAcceptDisclaimer} />}

       {/* Valentine's Day popup (2026-02-14) */}
       {!showDisclaimer && showValentine && <ValentineController onClose={() => setShowValentine(false)} />}

       {/* White Day popup (2026-03-14) */}
       {!showDisclaimer && !showValentine && showWhiteDay && <WhiteDayController onClose={() => setShowWhiteDay(false)} />}
    </div>
  );
};

export default PhoneShell;
