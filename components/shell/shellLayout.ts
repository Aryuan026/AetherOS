export const SHELL_SAFE_AREA_TOP = 'var(--shell-safe-area-top, env(safe-area-inset-top, 0px))';
export const SHELL_WORLD_STRIP_HEIGHT = 'var(--shell-world-strip-height, 0px)';
export const SHELL_TOP_STRIP_HEIGHT = 'var(--shell-top-strip-height, 0px)';
export const SHELL_TOP_INSET = `var(--shell-top-inset, calc(${SHELL_SAFE_AREA_TOP} + ${SHELL_WORLD_STRIP_HEIGHT}))`;

export const SHELL_APP_HEADER_HEIGHT = `var(--shell-header-height, calc(${SHELL_TOP_INSET} + 3.5rem))`;
export const SHELL_APP_HEADER_CONTENT_TOP = `var(--shell-header-content-top, calc(${SHELL_TOP_INSET} + 0.5rem))`;
export const SHELL_APP_HEADER_ROW_HEIGHT = '3rem';
export const SHELL_CHAT_HEADER_EXTRA_TOP = 'var(--shell-chat-header-extra-top, 5px)';
export const SHELL_OVERLAY_TOP = `var(--shell-overlay-top, calc(${SHELL_TOP_INSET} + 0.5rem))`;

export const APP_HEADER_BASE_CLASS =
  'bg-white/80 backdrop-blur-xl border-b border-white/50 shadow-[0_1px_0_rgba(148,163,184,0.12)]';
