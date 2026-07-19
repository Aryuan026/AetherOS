import React, { useMemo, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { INSTALLED_APPS } from '../constants';
import AppIcon from '../components/os/AppIcon';
import { DB } from '../utils/db';
import { CharacterProfile, Anniversary, AppID } from '../types';
import { formatBondTimeLabelFromMessages } from '../utils/bondTime';
import { getMessagePreview } from '../utils/messagePreview';
import CharacterWidget from '../components/launcher/CharacterWidget';
import {
  CharacterWidgetImage,
  EMPTY_WIDGET_IMAGES,
  getEnabledWidgetImagesForCharacter,
  loadCharacterWidgetConfig,
  loadCustomWidgetStore,
} from '../utils/characterWidgets';
import { resolveShellChromeMode } from '../utils/shellChrome';
import { useVirtualWorldClock } from '../hooks/useVirtualWorldClock';
import { normalizeLauncherLayout, paginateLauncherAppIds } from '../utils/launcherLayout';
import { filterCharactersForPersonaSurface, resolvePersonaRouteScope } from '../utils/personaRouteScope';

const DESKTOP_SIGNAL_LABEL = 'SIGNAL RECEIVED';
const DESKTOP_SLOGAN = 'I am a part of all that I have met.';

// --- Isolated Components to prevent full re-renders ---

// 1. Desktop identity/world card. Reality time appears only in the explicitly
// selected classic simulated-phone mode; software and virtual-city stay distinct.
const DesktopClock = React.memo(() => {
    const { theme, userProfile, virtualTime } = useOS();
    const virtualWorld = useVirtualWorldClock(userProfile);
    const contentColor = (theme.contentColor || '#334155').toLowerCase() === '#ffffff' ? '#334155' : (theme.contentColor || '#334155');
    const requestedShellChromeMode = resolveShellChromeMode(theme);
    const shellChromeMode = requestedShellChromeMode === 'virtual_city'
      ? (virtualWorld.context ? 'virtual_city' : 'software')
      : requestedShellChromeMode;
    const now = new Date();
    const dayName = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];
    const monthName = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][now.getMonth()];
    const dateNum = now.getDate().toString().padStart(2, '0');

    return (
        <div className="flex flex-col mb-5 mt-4 relative animate-fade-in" style={{ color: contentColor }}>
             <div className="absolute -top-6 left-1 flex items-center gap-2">
                 <div className="bg-white/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border border-white/70 shadow-sm">
                     {DESKTOP_SIGNAL_LABEL}
                 </div>
                 <div className="h-[1px] w-20 bg-gradient-to-r from-current to-transparent opacity-40"></div>
             </div>

             <div className="flex items-end gap-4">
                 {shellChromeMode === 'virtual_city' ? (
                    <>
                      <div className="text-[5.25rem] leading-[0.9] font-bold tracking-normal drop-shadow-[0_8px_24px_rgba(255,255,255,0.65)] font-sans">
                          {virtualWorld.context!.clock.timeLabel}
                      </div>
                      <div className="flex flex-col justify-end pb-3 opacity-90">
                          <div className="text-2xl font-bold tracking-tight">{virtualWorld.context!.locationLabel}</div>
                          <div className="text-sm font-medium opacity-80 tracking-wider">
                            {virtualWorld.context!.eraLabel || virtualWorld.context!.clock.dateLabel}
                          </div>
                      </div>
                    </>
                 ) : shellChromeMode === 'simulated_phone' ? (
                    <>
                      <div className="text-[5.25rem] leading-[0.9] font-bold tracking-normal drop-shadow-[0_8px_24px_rgba(255,255,255,0.65)] font-sans">
                        {virtualTime.hours.toString().padStart(2, '0')}
                        <span className="mx-1 font-light opacity-40">:</span>
                        {virtualTime.minutes.toString().padStart(2, '0')}
                      </div>
                      <div className="flex flex-col justify-end pb-3 opacity-90">
                        <div className="text-3xl font-bold tracking-tight">{dayName}</div>
                        <div className="text-sm font-medium tracking-widest opacity-80">{monthName} . {dateNum}</div>
                      </div>
                    </>
                 ) : (
                    <div className="py-3">
                      <div className="text-4xl font-black tracking-[0.08em]">AetherOS</div>
                      <div data-desktop-slogan className="mt-2 text-[11px] font-bold tracking-[0.14em] opacity-55">{DESKTOP_SLOGAN}</div>
                    </div>
                 )}
             </div>
        </div>
    );
});

// 2. Grid Page Component
const AppGridPage = React.memo(({ 
    apps, 
    openApp,
}: { 
    apps: typeof INSTALLED_APPS, 
    openApp: (id: AppID) => void,
}) => {
    return (
        <div className="animate-fade-in relative rounded-[2rem] bg-white/[0.36] backdrop-blur-xl border border-white/[0.62] px-3 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
             <div className="grid grid-cols-4 gap-y-5 gap-x-2 place-items-center">
                 {apps.map(app => (
                     <div
                        key={app.id}
                        className="relative transition-transform duration-200 active:scale-95"
                     >
                         <AppIcon
                            app={app}
                            onClick={() => openApp(app.id)}
                         />
                     </div>
                 ))}
             </div>
        </div>
    );
});

// 3. Widget Page Component (Calendar)
const WidgetsPage = React.memo(({ contentColor, openApp, anniversaries, characters }: any) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthName = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][currentMonth];
    
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
    
    const totalDays = getDaysInMonth(currentYear, currentMonth);
    const startOffset = getFirstDayOfMonth(currentYear, currentMonth);
    
    const calendarDays = Array.from({ length: totalDays }, (_, i) => i + 1);
    const paddingDays = Array.from({ length: startOffset }, () => null);

    return (
        <div className="h-full w-full flex-shrink-0 snap-center snap-always flex flex-col space-y-4 overflow-y-auto px-6 pb-[9.25rem] pt-14 no-scrollbar">
              <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-6 border border-white/20 shadow-2xl">
                  <div className="flex justify-between items-center mb-4" style={{ color: contentColor }}>
                      <h3 className="text-xl font-bold tracking-widest">{monthName} {currentYear}</h3>
                      <div onClick={() => openApp('schedule')} className="bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/40 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center mb-2">
                      {['S','M','T','W','T','F','S'].map((d, i) => <div key={`${d}-${i}`} className="text-[10px] font-bold opacity-40" style={{ color: contentColor }}>{d}</div>)}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
                      {paddingDays.map((_, i) => <div key={`pad-${i}`} />)}
                      {calendarDays.map(day => {
                          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const isToday = day === now.getDate();
                          const hasEvent = anniversaries.some((a: any) => a.date === dateStr);
                          
                          return (
                              <div key={day} className="flex flex-col items-center justify-center h-8 relative">
                                  <div 
                                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${isToday ? 'bg-white text-black font-bold shadow-lg' : 'opacity-80'}`}
                                    style={isToday ? {} : { color: contentColor }}
                                  >
                                      {day}
                                  </div>
                                  {hasEvent && <div className="w-1.5 h-1.5 bg-purple-400 rounded-full absolute bottom-0 shadow-sm border border-black/20"></div>}
                              </div>
                          );
                      })}
                  </div>
              </div>

              <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-5 border border-white/20 shadow-2xl flex-1 min-h-[200px]">
                  <h3 className="text-xs font-bold opacity-60 uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: contentColor }}>
                      <span className="w-2 h-2 bg-purple-400 rounded-full"></span> Upcoming Events
                  </h3>
                  <div className="space-y-3">
                      {anniversaries.length > 0 ? anniversaries.sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(0, 5).map((anni: any) => (
                          <div key={anni.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex flex-col items-center justify-center text-purple-200 border border-purple-500/30">
                                  <span className="text-[9px] opacity-70">{anni.date.split('-')[1]}</span>
                                  <span className="text-sm font-bold leading-none">{anni.date.split('-')[2]}</span>
                              </div>
                              <div className="flex-1">
                                  <div className="text-sm font-bold" style={{ color: contentColor }}>{anni.title}</div>
                                  <div className="text-[10px] opacity-50" style={{ color: contentColor }}>{characters.find((c: any) => c.id === anni.charId)?.name || 'Unknown'}</div>
                              </div>
                          </div>
                      )) : (
                          <div className="text-center opacity-30 text-xs py-8" style={{ color: contentColor }}>No upcoming events</div>
                      )}
                  </div>
              </div>
        </div>
    );
});

// --- Persist scroll page across remounts (e.g. returning from apps) ---
let _lastPageIndex = 0;

// --- Main Launcher ---

const Launcher: React.FC = () => {
  const { openApp, characters, activeCharacterId, theme, lastMsgTimestamp, isDataLoaded, unreadMessages, userProfile } = useOS();

  // Local state for widget data to prevent context trashing
  const [widgetChar, setWidgetChar] = useState<CharacterProfile | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [widgetImages, setWidgetImages] = useState<CharacterWidgetImage[]>(EMPTY_WIDGET_IMAGES);
  const personaScope = useMemo(() => resolvePersonaRouteScope(userProfile, characters, activeCharacterId), [userProfile, characters, activeCharacterId]);
  const launcherCharacters = useMemo(() => filterCharactersForPersonaSurface(characters, personaScope, { surface: 'launcher' }), [characters, personaScope]);

  const [activePageIndex, setActivePageIndex] = useState(_lastPageIndex);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Mouse Drag Logic refs
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragMoved = useRef(0);

  // The saved layout owns projection order. Product-intent groups only seed the
  // default layout in utils/launcherLayout and never overwrite user ordering.
  const launcherLayout = useMemo(
    () => normalizeLauncherLayout(theme.launcherLayout),
    [theme.launcherLayout],
  );
  const appById = useMemo(() => new Map(INSTALLED_APPS.map(app => [app.id, app])), []);
  const hiddenAppIds = useMemo(
    () => new Set(launcherLayout.hiddenAppIds),
    [launcherLayout.hiddenAppIds],
  );
  const dockAppsConfig = useMemo(() => launcherLayout.dockAppIds
    .filter(appId => !hiddenAppIds.has(appId))
    .map(appId => appById.get(appId))
    .filter(Boolean) as typeof INSTALLED_APPS,
  [appById, hiddenAppIds, launcherLayout.dockAppIds]);

  const appPages = useMemo(() => {
      return paginateLauncherAppIds(launcherLayout).map((pageIds, index) => ({
          title: `桌面 ${index + 1}`,
          apps: pageIds.map(appId => appById.get(appId)).filter(Boolean) as typeof INSTALLED_APPS,
      }));
  }, [appById, launcherLayout]);

  // Total pages = App Pages + 1 Widget Page
  const totalPages = appPages.length + 1;

  useEffect(() => {
      if (_lastPageIndex < totalPages) return;
      const nextPage = Math.max(0, totalPages - 1);
      _lastPageIndex = nextPage;
      setActivePageIndex(nextPage);
      requestAnimationFrame(() => {
          const el = scrollContainerRef.current;
          if (el) el.scrollLeft = el.clientWidth * nextPage;
      });
  }, [totalPages]);

  useEffect(() => {
      const loadData = async () => {
          // SAFEGUARD: If characters array is empty, reset widget char
          if (launcherCharacters.length === 0) {
              setWidgetChar(null);
              setLastMessage('No Character Connected');
              setAnniversaries([]);
              return;
          }

          const targetChar = launcherCharacters.find(c => c.id === activeCharacterId) || launcherCharacters[0];
          setWidgetChar(targetChar);

          try {
              const [msgs, annis] = await Promise.all([
                  DB.getMessagesByCharId(targetChar.id),
                  DB.getAllAnniversaries()
              ]);
              
              const fallbackStatus = targetChar.isBuiltIn
                  ? formatBondTimeLabelFromMessages(msgs)
                  : (targetChar.description || "System Ready.");

              if (msgs.length > 0) {
                  const visibleMsgs = msgs
                      .filter(m => m.role !== 'system')
                      .sort((a, b) => a.timestamp - b.timestamp);
                  if (visibleMsgs.length > 0) {
                      const last = visibleMsgs[visibleMsgs.length - 1];
                      setLastMessage(getMessagePreview(last));
                  } else {
                      setLastMessage(fallbackStatus);
                  }
              } else {
                  setLastMessage(fallbackStatus);
              }
              setAnniversaries(annis);
          } catch (e) {
              console.error(e);
          }
      };
      
      if (isDataLoaded) {
          loadData();
      }
  }, [activeCharacterId, lastMsgTimestamp, isDataLoaded, launcherCharacters]); // Trigger on scoped characters change

  useEffect(() => {
      let cancelled = false;
      if (!isDataLoaded || !widgetChar?.id) {
          setWidgetImages(EMPTY_WIDGET_IMAGES);
          return;
      }

      Promise.all([loadCustomWidgetStore(), loadCharacterWidgetConfig()]).then(([customStore, config]) => {
          if (!cancelled) setWidgetImages(getEnabledWidgetImagesForCharacter(widgetChar, customStore, config));
      });

      return () => {
          cancelled = true;
      };
  }, [isDataLoaded, widgetChar?.id]);

  // Restore scroll position BEFORE paint to avoid visible flash/slide
  useLayoutEffect(() => {
      const el = scrollContainerRef.current;
      if (el && _lastPageIndex > 0) {
          // Temporarily disable smooth scroll so jump is instant
          el.style.scrollBehavior = 'auto';
          el.scrollLeft = el.clientWidth * _lastPageIndex;
          // Re-enable on next frame
          requestAnimationFrame(() => { el.style.scrollBehavior = 'smooth'; });
      }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
      if (scrollContainerRef.current) {
          const width = scrollContainerRef.current.clientWidth;
          const scrollLeft = scrollContainerRef.current.scrollLeft;
          const index = Math.round(scrollLeft / width);
          setActivePageIndex(index);
          _lastPageIndex = index; // Persist across remounts
      }
  };

  // --- Mouse Drag Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (!scrollContainerRef.current) return;
      isDragging.current = true;
      dragMoved.current = 0;
      startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
      scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
      
      // Disable snap and smooth scroll for direct control
      scrollContainerRef.current.style.scrollBehavior = 'auto';
      scrollContainerRef.current.style.scrollSnapType = 'none';
      scrollContainerRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging.current || !scrollContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollContainerRef.current.offsetLeft;
      const walk = (x - startX.current);
      scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
      
      dragMoved.current = Math.abs(x - (startX.current + scrollContainerRef.current.offsetLeft)); 
  };

  const handleMouseUp = () => {
      if (!isDragging.current || !scrollContainerRef.current) return;
      isDragging.current = false;
      
      // Restore styles
      scrollContainerRef.current.style.scrollBehavior = 'smooth';
      scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
      scrollContainerRef.current.style.cursor = 'grab';
  };

  const handleMouseLeave = () => {
      if (isDragging.current) handleMouseUp();
  };

  const handleClickCapture = (e: React.MouseEvent) => {
      if (dragMoved.current > 5) {
          e.stopPropagation();
          e.preventDefault();
      }
  };

  const contentColor = (theme.contentColor || '#334155').toLowerCase() === '#ffffff' ? '#334155' : (theme.contentColor || '#334155');
  const launcherBottomInset = 'max(env(safe-area-inset-bottom), 0.75rem)';
  
  const totalUnread = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
  const widgetUnread = widgetChar && unreadMessages[widgetChar.id] ? unreadMessages[widgetChar.id] : 0;

  return (
    <div className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none">
      
      <div className="absolute inset-0 pointer-events-none bg-white/[0.16]"></div>
      <div className="absolute inset-x-0 bottom-0 h-56 pointer-events-none bg-gradient-to-t from-white/55 via-white/20 to-transparent"></div>

      {/* Scrollable Content Layer */}
      {/* UPDATE: Added snap-always to children to ensure one-page-at-a-time scrolling on mobile swipe */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClickCapture={handleClickCapture}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-grab active:cursor-grabbing"
        style={{ scrollBehavior: 'smooth', overscrollBehaviorX: 'contain', contain: 'layout style', transform: 'translateZ(0)' }}
      >
          {/* Render App Pages */}
          {appPages.map((pageApps, idx) => (
              <div key={idx} className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-12 pb-[9.25rem] h-full" style={{ contentVisibility: 'auto' }}>
                  {idx === 0 ? (
                      // Page 1: Clock + Widget + Apps
                      <>
                        <DesktopClock />
                        <CharacterWidget 
                            char={widgetChar} 
                            unreadCount={widgetUnread} 
                            lastMessage={lastMessage} 
                            onClick={() => openApp(AppID.Chat)}
                            contentColor={contentColor}
                            widgetImages={widgetImages}
                        />
                        <div className="flex-1">
                            <AppGridPage 
                                apps={pageApps.apps}
                                openApp={openApp}
                            />
                        </div>
                      </>
                  ) : (
                      // Page 2+: Widget Grid + Free Decorations + Apps
                          <div className="pt-10 flex-1 flex flex-col relative">
                          {idx === 1 && (() => {
                            const raw = theme.launcherWidgets || {};
                            const w = { ...raw };
                            if (!w['wide'] && theme.launcherWidgetImage) w['wide'] = theme.launcherWidgetImage;
                            const hasAny = w['tl'] || w['tr'] || w['wide'];
                            const hasTopRow = w['tl'] || w['tr'];
                            return (
                              <>
                                {hasAny && (
                                  <div className="mb-3 space-y-2 relative z-10">
                                    {hasTopRow && (
                                      <div className="flex gap-2">
                                        {['tl', 'tr'].map(key => w[key] ? (
                                          <div key={key} className="flex-1 aspect-square rounded-2xl overflow-hidden shadow-md border border-white/20">
                                            <img src={w[key]} className="w-full h-full object-cover" alt="" loading="lazy" />
                                          </div>
                                        ) : <div key={key} className="flex-1"></div>)}
                                      </div>
                                    )}
                                    {w['wide'] && (
                                      <div className="w-full h-32 rounded-2xl overflow-hidden shadow-md border border-white/20">
                                        <img src={w['wide']} className="w-full h-full object-cover" alt="" loading="lazy" />
                                      </div>
                                    )}
                                  </div>
                                )}
                                {/* Free-positioned Desktop Decorations (z-20 to float above widgets z-10) */}
                                {theme.desktopDecorations && theme.desktopDecorations.length > 0 && (
                                  <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
                                    {theme.desktopDecorations.map(deco => (
                                      <img
                                        key={deco.id}
                                        src={deco.content}
                                        alt=""
                                        loading="lazy"
                                        className="absolute w-16 h-16 object-contain select-none"
                                        style={{
                                          left: `${deco.x}%`,
                                          top: `${deco.y}%`,
                                          transform: `translate(-50%, -50%) scale(${deco.scale}) rotate(${deco.rotation}deg)${deco.flip ? ' scaleX(-1)' : ''}`,
                                          opacity: deco.opacity,
                                          zIndex: deco.zIndex,
                                          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          <AppGridPage
                                apps={pageApps.apps}
                                openApp={openApp}
                          />
                          <div className="flex-1"></div>
                      </div>
                  )}
              </div>
          ))}

          {/* Final Page: Widgets */}
          <WidgetsPage 
            contentColor={contentColor} 
            openApp={openApp} 
            anniversaries={anniversaries} 
            characters={characters} 
          />

      </div>
      {/* Page Indicators */}
      <div
          className="absolute left-0 w-full flex justify-center gap-2 pointer-events-none z-20"
          style={{ bottom: `calc(${launcherBottomInset} + 7rem)` }}
      >
          {Array.from({ length: totalPages }).map((_, i) => (
              <div 
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${activePageIndex === i ? 'w-4 opacity-100' : 'w-1.5 opacity-40'}`} 
                style={{ backgroundColor: contentColor }}
              ></div>
          ))}
      </div>

      {/* Floating Dock - Updated Margin and Safe Area handling */}
      <div
           className="mt-auto flex justify-center w-full px-4 relative z-30"
           style={{ paddingBottom: launcherBottomInset }}
      >
           <div className="bg-white/[0.72] backdrop-blur-2xl rounded-[2rem] border border-white/[0.86] shadow-[0_14px_36px_rgba(15,23,42,0.13),inset_0_1px_0_rgba(255,255,255,0.65)] px-4 py-3 flex gap-3 sm:gap-5 items-center mx-auto max-w-full justify-between overflow-x-auto no-scrollbar transform-gpu">
               {dockAppsConfig.map(app => (
                   <div key={app.id} className="relative">
                        <AppIcon app={app} onClick={() => openApp(app.id)} variant="dock" size="md" />
                        {app.id === 'chat' && totalUnread > 0 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center border-2 border-white/20 shadow-sm font-bold pointer-events-none animate-pop-in">
                                {totalUnread > 9 ? '9+' : totalUnread}
                            </div>
                        )}
                   </div>
               ))}
           </div>
      </div>

    </div>
  );
};

export default Launcher;
