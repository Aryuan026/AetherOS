import React, { useEffect, useMemo, useState } from 'react';
import { CharacterProfile } from '../../types';
import { CharacterWidgetImage } from '../../utils/characterWidgets';
import AvatarWithFrame from '../common/AvatarWithFrame';

const WIDGET_CAROUSEL_INTERVAL_MS = 6500;

const CharacterWidget: React.FC<{
    char: CharacterProfile | null;
    unreadCount: number;
    lastMessage: string;
    onClick: () => void;
    contentColor: string;
    widgetImages: CharacterWidgetImage[];
}> = React.memo(({
    char,
    unreadCount,
    lastMessage,
    onClick,
    contentColor,
    widgetImages,
}) => {
    const resolvedContentColor = contentColor || '#334155';
    const labelColor = resolvedContentColor.toLowerCase() === '#ffffff' ? '#334155' : resolvedContentColor;
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const activeWidgetImages = useMemo(() => widgetImages || [], [widgetImages]);

    useEffect(() => {
        setActiveImageIndex(0);
        if (activeWidgetImages.length <= 1) return;

        const timer = window.setInterval(() => {
            setActiveImageIndex(index => (index + 1) % activeWidgetImages.length);
        }, WIDGET_CAROUSEL_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [char?.id, activeWidgetImages.length]);

    if (char && activeWidgetImages.length > 0) {
        return (
            <div className="mb-4 group animate-fade-in">
                <div
                    className="relative h-[8.25rem] w-full overflow-hidden rounded-[1.5rem] bg-[#f5e9f8] border border-white/[0.92] shadow-[0_10px_30px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.72)] transition-all duration-300 active:scale-[0.98] cursor-pointer"
                    onClick={onClick}
                >
                    {activeWidgetImages.map((image, index) => {
                        const isActive = index === activeImageIndex;
                        const imageKey = image.id || image.src;
                        const foregroundClass = image.fit === 'contain'
                            ? 'absolute inset-0 z-20 h-full w-full object-contain transition-opacity duration-700'
                            : 'absolute inset-y-0 left-1/2 z-20 h-full w-auto max-w-none -translate-x-1/2 transition-opacity duration-700';
                        return (
                            <React.Fragment key={imageKey}>
                                {image.fillLeftSrc && (
                                    <img
                                        src={image.fillLeftSrc}
                                        alt=""
                                        aria-hidden="true"
                                        loading={index === 0 ? 'eager' : 'lazy'}
                                        className={`absolute inset-y-0 left-0 z-0 h-full w-1/2 object-fill transition-opacity duration-700 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                                    />
                                )}
                                {image.fillRightSrc && (
                                    <img
                                        src={image.fillRightSrc}
                                        alt=""
                                        aria-hidden="true"
                                        loading={index === 0 ? 'eager' : 'lazy'}
                                        className={`absolute inset-y-0 right-0 z-0 h-full w-1/2 object-fill transition-opacity duration-700 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                                    />
                                )}
                                {image.backgroundSrc && (
                                    <img
                                        src={image.backgroundSrc}
                                        alt=""
                                        aria-hidden="true"
                                        loading={index === 0 ? 'eager' : 'lazy'}
                                        className={`absolute inset-y-0 left-1/2 z-10 h-full w-auto max-w-none -translate-x-1/2 transition-opacity duration-700 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                                    />
                                )}
                                <img
                                    src={image.src}
                                    alt={`${char.name} 小组件 ${index + 1}`}
                                    loading={index === 0 ? 'eager' : 'lazy'}
                                    className={`${foregroundClass} ${isActive ? 'opacity-100' : 'opacity-0'}`}
                                    style={{
                                        WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 3px, #000 calc(100% - 3px), transparent 100%)',
                                        maskImage: 'linear-gradient(to right, transparent 0, #000 3px, #000 calc(100% - 3px), transparent 100%)',
                                    }}
                                />
                            </React.Fragment>
                        );
                    })}

                    <div className="absolute inset-0 z-30 pointer-events-none ring-1 ring-inset ring-white/65 rounded-[1.5rem]"></div>

                    {unreadCount > 0 && (
                        <div className="absolute top-3 right-3 z-40 min-w-5 h-5 px-1.5 rounded-full bg-red-500 border-2 border-white shadow-sm flex items-center justify-center text-[9px] font-bold text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </div>
                    )}

                    <div className="absolute left-3 bottom-3 z-40 max-w-[70%] rounded-full bg-white/76 backdrop-blur-sm border border-white/80 px-3 py-1 shadow-sm">
                        <div className="text-[10px] font-bold tracking-wide text-slate-700 truncate">{char.name}</div>
                    </div>

                    {activeWidgetImages.length > 1 && (
                        <div className="absolute bottom-4 right-4 z-40 flex gap-1.5">
                            {activeWidgetImages.map((image, index) => (
                                <span
                                    key={`${image.id || image.src}-dot`}
                                    className={`h-1.5 rounded-full bg-white shadow-sm transition-all duration-300 ${index === activeImageIndex ? 'w-4 opacity-95' : 'w-1.5 opacity-55'}`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="mb-4 group animate-fade-in">
            <div
                className="relative h-28 w-full overflow-hidden rounded-[1.5rem] bg-white/[0.66] backdrop-blur-2xl border border-white/[0.85] shadow-[0_10px_30px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.55)] transition-all duration-300 active:scale-[0.98] cursor-pointer"
                onClick={onClick}
            >
                <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-white/50 to-transparent skew-x-12 pointer-events-none"></div>
                <div className="absolute inset-0 flex items-center p-4 gap-4">
                    <div className="w-20 h-20 shrink-0 relative overflow-visible rounded-2xl shadow-lg border-2 border-white/80 bg-slate-800">
                        {char ? (
                            <AvatarWithFrame
                                src={char.avatar}
                                className="w-full h-full"
                                roundedClassName="rounded-2xl"
                                alt="char"
                                loading="lazy"
                            />
                        ) : <div className="w-full h-full bg-white/10 animate-pulse"></div>}
                        {unreadCount > 0 ? (
                            <div className="absolute bottom-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white">
                                {unreadCount}
                            </div>
                        ) : (
                            <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-black/20 shadow-sm"></div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold tracking-wide drop-shadow-md truncate" style={{ color: contentColor }}>
                                {char?.name || 'NO SIGNAL'}
                            </h3>
                            <div className="px-1.5 py-0.5 bg-slate-900/5 rounded text-[9px] font-bold uppercase tracking-wider" style={{ color: labelColor }}>
                                {unreadCount > 0 ? 'NEW MESSAGE' : 'Active'}
                            </div>
                        </div>

                        <div className="relative">
                            <div className="text-xs line-clamp-2 font-medium leading-relaxed opacity-90" style={{ color: labelColor }}>
                                <span className="opacity-40 mr-1 text-[10px]">▶</span>
                                {lastMessage}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

CharacterWidget.displayName = 'CharacterWidget';

export default CharacterWidget;
