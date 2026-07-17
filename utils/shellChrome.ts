import type { CSSProperties } from 'react';
import type { OSTheme, ShellChromeMode } from '../types';

export const DEFAULT_SHELL_CHROME_MODE: ShellChromeMode = 'software';

export const isShellChromeMode = (value: unknown): value is ShellChromeMode => (
    value === 'simulated_phone' || value === 'software' || value === 'virtual_city'
);

export const resolveShellChromeMode = (
    theme: Pick<OSTheme, 'shellChromeMode' | 'hideStatusBar'> | null | undefined,
): ShellChromeMode => (
    isShellChromeMode(theme?.shellChromeMode)
        ? theme.shellChromeMode
        : DEFAULT_SHELL_CHROME_MODE
);

/**
 * `hideStatusBar` used to control the classic simulated-phone row. Preserve the
 * old meaning on read: hidden becomes software chrome, while visible (including
 * legacy themes that never stored the default `false`) becomes simulated phone.
 */
export const migrateStoredShellChromeTheme = (
    stored: Partial<OSTheme> | null | undefined,
): Partial<OSTheme> => {
    const { hideStatusBar: _legacyHideStatusBar, ...rest } = stored || {};
    return {
        ...rest,
        shellChromeMode: isShellChromeMode(rest.shellChromeMode)
            ? rest.shellChromeMode
            : stored
                ? (_legacyHideStatusBar === true ? 'software' : 'simulated_phone')
                : DEFAULT_SHELL_CHROME_MODE,
    };
};

export type ShellChromeStyle = CSSProperties & Record<`--shell-${string}`, string>;

export const buildShellChromeStyle = (mode: ShellChromeMode): ShellChromeStyle => {
    const worldStripHeight = mode === 'virtual_city' ? '34px' : '0px';
    const topInset = mode === 'simulated_phone'
        ? 'calc(max(12px, var(--shell-safe-area-top)) + 20px)'
        : mode === 'virtual_city'
            ? 'calc(var(--shell-safe-area-top) + 34px)'
            : 'var(--shell-safe-area-top)';
    return {
        '--shell-safe-area-top': 'env(safe-area-inset-top, 0px)',
        '--shell-world-strip-height': worldStripHeight,
        '--shell-top-strip-height': mode === 'software' ? '0px' : topInset,
        '--shell-top-inset': topInset,
        '--shell-header-content-top': mode === 'simulated_phone'
            ? 'var(--shell-top-inset)'
            : 'calc(var(--shell-top-inset) + 0.5rem)',
        '--shell-header-height': mode === 'simulated_phone'
            ? 'calc(var(--shell-top-inset) + 3rem)'
            : 'calc(var(--shell-top-inset) + 3.5rem)',
        '--shell-overlay-top': 'calc(var(--shell-top-inset) + 0.5rem)',
    };
};
