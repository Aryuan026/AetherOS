
import React from 'react';
import { AppConfig } from '../../types';
import { Icons } from '../../constants';
import { useOS } from '../../context/OSContext';

interface AppIconProps {
  app: AppConfig;
  onClick: () => void;
  size?: 'md' | 'lg';
  hideLabel?: boolean;
  variant?: 'default' | 'minimal' | 'dock';
}

const AppIcon: React.FC<AppIconProps> = React.memo(({ app, onClick, size = 'md', hideLabel = false, variant = 'default' }) => {
  const { customIcons, theme } = useOS();
  const IconComponent = Icons[app.icon] || Icons.Settings;
  const customIconUrl = customIcons[app.id];
  const contentColor = theme.contentColor || '#ffffff';

  // Standard sizes
  const sizeClasses = size === 'lg' ? 'w-[4.5rem] h-[4.5rem]' : 'w-[4rem] h-[4rem]';
  const toneMap: Record<string, string> = {
    indigo: '#4f46e5',
    green: '#16a34a',
    emerald: '#059669',
    violet: '#7c3aed',
    rose: '#e11d48',
    slate: '#475569',
    pink: '#db2777',
    blue: '#2563eb',
    lime: '#65a30d',
    cyan: '#0891b2',
    amber: '#d97706',
    red: '#dc2626',
    orange: '#ea580c',
    fuchsia: '#c026d3',
    purple: '#9333ea',
  };
  const iconColor = toneMap[app.color] || '#475569';
  const labelColor = contentColor.toLowerCase() === '#ffffff' ? '#334155' : contentColor;

  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center gap-2 group relative active:scale-95 transition-transform duration-200"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Container: Glass Prism with internal glow */}
      <div className={`${sizeClasses} relative flex items-center justify-center
        bg-white/[0.78] backdrop-blur-xl rounded-[1.25rem]
        border border-white/[0.88]
        shadow-[0_8px_22px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.65)]
        transition-all duration-300 ease-out
        group-hover:bg-white/[0.92] group-hover:shadow-[0_10px_26px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.8)] group-hover:border-white
      `}>
        
        {/* Shine effect - Optimized: Only show on hover/active to save GPU on mobile idle */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent rounded-[1.2rem] opacity-0 group-hover:opacity-100 transition-opacity"></div>

        {customIconUrl ? (
            <img src={customIconUrl} className="w-full h-full object-cover rounded-[1.2rem]" alt={app.name} loading="lazy" />
        ) : (
            <div 
                className="w-[50%] h-[50%] drop-shadow-[0_2px_5px_rgba(255,255,255,0.8)] opacity-95"
                style={{ color: iconColor }}
            >
                 <IconComponent className="w-full h-full" />
            </div>
        )}
      </div>
      
      {!hideLabel && (
        <span 
            className={`text-[10px] font-bold tracking-normal opacity-90 transition-opacity px-1 text-center leading-tight max-w-[4.75rem] break-words ${variant === 'dock' ? 'hidden' : 'block'}`}
            style={{ color: labelColor }}
        >
          {app.name}
        </span>
      )}
    </button>
  );
}, (prev, next) => {
    // Custom comparison to prevent re-render unless specific props change
    // We don't check 'onClick' deeply assuming it's stable or we want to ignore function ref changes
    return prev.app.id === next.app.id && 
           prev.size === next.size && 
           prev.hideLabel === next.hideLabel &&
           prev.variant === next.variant;
});

export default AppIcon;
