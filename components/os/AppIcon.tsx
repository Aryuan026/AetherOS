
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

  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 group relative active:scale-95 transition-transform duration-200"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Container: Glass Prism with internal glow */}
      <div className={`${sizeClasses} relative flex items-center justify-center
        bg-white/[0.08] backdrop-blur-2xl rounded-[1.25rem]
        border border-white/[0.15]
        shadow-[0_8px_24px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]
        transition-all duration-300 ease-out
        group-hover:bg-white/[0.15] group-hover:shadow-[0_4px_30px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.2)] group-hover:border-white/30
      `}>
        
        {/* Shine effect - Optimized: Only show on hover/active to save GPU on mobile idle */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent rounded-[1.2rem] opacity-0 group-hover:opacity-100 transition-opacity"></div>

        {customIconUrl ? (
            <img src={customIconUrl} className="w-full h-full object-cover rounded-[1.2rem]" alt={app.name} loading="lazy" />
        ) : (
            <div 
                className="w-[50%] h-[50%] drop-shadow-[0_2px_5px_rgba(0,0,0,0.3)] opacity-90"
                style={{ color: contentColor }}
            >
                 <IconComponent className="w-full h-full" />
            </div>
        )}
      </div>
      
      {!hideLabel && (
        <span 
            className={`text-[10px] font-bold tracking-widest uppercase opacity-80 text-shadow-md transition-opacity ${variant === 'dock' ? 'hidden' : 'block'}`}
            style={{ color: contentColor }}
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
