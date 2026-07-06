import React from 'react';
import {
  APP_HEADER_BASE_CLASS,
  SHELL_APP_HEADER_CONTENT_TOP,
  SHELL_APP_HEADER_HEIGHT,
  SHELL_APP_HEADER_ROW_HEIGHT,
} from './shellLayout';

interface AppHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  center?: boolean;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

export const AppBackButton: React.FC<{ onClick: () => void; label?: string; className?: string }> = ({
  onClick,
  label = '返回',
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-slate-600 hover:bg-black/5 active:scale-90 transition-transform ${className}`}
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  </button>
);

type AppHeaderIconButtonProps = {
  onClick: () => void;
  title?: string;
  label?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export const AppHeaderIconButton: React.FC<AppHeaderIconButtonProps> = ({
  onClick,
  title,
  label,
  children,
  className = '',
  style,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={label || title}
    style={style}
    className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition-colors active:scale-95 ${className}`}
  >
    {children}
  </button>
);

type AppHeaderAddButtonProps = Omit<AppHeaderIconButtonProps, 'children'> & {
  iconClassName?: string;
};

export const AppHeaderAddButton: React.FC<AppHeaderAddButtonProps> = ({
  title = '新增',
  label,
  className,
  iconClassName = 'w-[18px] h-[18px]',
  ...props
}) => {
  const toneClassName = className ?? 'bg-slate-900 text-white hover:bg-slate-700 shadow-sm';

  return (
    <AppHeaderIconButton
      {...props}
      title={title}
      label={label || title}
      className={toneClassName}
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={iconClassName}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </AppHeaderIconButton>
  );
};

const HeaderTitle: React.FC<Pick<AppHeaderProps, 'title' | 'subtitle' | 'titleClassName' | 'subtitleClassName' | 'center'>> = ({
  title,
  subtitle,
  titleClassName,
  subtitleClassName,
  center,
}) => (
  <div className={`min-w-0 ${center ? 'text-center' : ''}`}>
    {typeof title === 'string' ? (
      <h1 className={titleClassName || 'truncate text-xl font-bold tracking-wide text-slate-800'}>{title}</h1>
    ) : (
      title
    )}
    {subtitle && (
      <div className={subtitleClassName || 'mt-0.5 truncate text-[10px] font-semibold tracking-[0.12em] text-slate-400'}>
        {subtitle}
      </div>
    )}
  </div>
);

const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  onBack,
  left,
  right,
  center = false,
  className = '',
  titleClassName,
  subtitleClassName,
}) => {
  const leftSlot = left ?? (onBack ? <AppBackButton onClick={onBack} /> : null);

  return (
    <div
      data-shell-app-header
      className={`shrink-0 sticky top-0 z-30 box-border ${APP_HEADER_BASE_CLASS} ${className}`}
      style={{ height: SHELL_APP_HEADER_HEIGHT, paddingTop: SHELL_APP_HEADER_CONTENT_TOP }}
    >
      <div className="flex items-center gap-3 px-4" style={{ height: SHELL_APP_HEADER_ROW_HEIGHT }}>
        {center ? (
          <>
            <div className="flex w-10 shrink-0 justify-start">{leftSlot}</div>
            <div className="flex-1 min-w-0">
              <HeaderTitle title={title} subtitle={subtitle} titleClassName={titleClassName} subtitleClassName={subtitleClassName} center />
            </div>
            <div className="flex w-10 shrink-0 justify-end">{right}</div>
          </>
        ) : (
          <>
            {leftSlot}
            <div className="flex-1 min-w-0">
              <HeaderTitle title={title} subtitle={subtitle} titleClassName={titleClassName} subtitleClassName={subtitleClassName} />
            </div>
            {right && <div className="shrink-0">{right}</div>}
          </>
        )}
      </div>
    </div>
  );
};

export default AppHeader;
