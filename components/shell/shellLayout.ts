export const SHELL_STATUS_BAR_TOP = 'max(12px, env(safe-area-inset-top))';
export const SHELL_STATUS_BAR_HEIGHT = '20px';
export const SHELL_STATUS_BAR_RESERVED_HEIGHT = `calc(${SHELL_STATUS_BAR_TOP} + ${SHELL_STATUS_BAR_HEIGHT})`;

export const SHELL_APP_HEADER_HEIGHT = `calc(${SHELL_STATUS_BAR_TOP} + 4.25rem)`;
export const SHELL_APP_HEADER_CONTENT_TOP = `calc(${SHELL_STATUS_BAR_TOP} + 1.25rem)`;
export const SHELL_APP_HEADER_ROW_HEIGHT = '3rem';

export const APP_HEADER_BASE_CLASS =
  'bg-white/80 backdrop-blur-xl border-b border-white/50 shadow-[0_1px_0_rgba(148,163,184,0.12)]';
