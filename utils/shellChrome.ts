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

export type ShellChromeRuntimeEnvironment = {
    standalone?: boolean;
    ios?: boolean;
    native?: boolean;
};

export const shouldCondenseStandaloneTop = (
    environment: ShellChromeRuntimeEnvironment = {},
): boolean => !!(
    environment.standalone && !environment.ios && !environment.native
);

export const resolveShellSafeAreaTop = (
    environment: ShellChromeRuntimeEnvironment = {},
): string => (
    shouldCondenseStandaloneTop(environment)
        ? '0px'
        : 'env(safe-area-inset-top, 0px)'
);

export const buildShellChromeStyle = (
    mode: ShellChromeMode,
    environment: ShellChromeRuntimeEnvironment = {},
): ShellChromeStyle => {
    const condenseStandaloneTop = shouldCondenseStandaloneTop(environment);
    const worldStripHeight = mode === 'virtual_city' ? '34px' : '0px';
    const headerBreathingSpace = condenseStandaloneTop ? '0px' : '0.5rem';
    // Global notices need a small visual margin even when the installed Android
    // header itself is condensed to the top edge.
    const overlayBreathingSpace = '0.5rem';
    const nonPhoneHeaderHeight = condenseStandaloneTop ? '3rem' : '3.5rem';
    const topInset = mode === 'simulated_phone'
        ? 'calc(max(12px, var(--shell-safe-area-top)) + 20px)'
        : mode === 'virtual_city'
            ? 'calc(var(--shell-safe-area-top) + 34px)'
            : 'var(--shell-safe-area-top)';
    return {
        '--shell-safe-area-top': resolveShellSafeAreaTop(environment),
        '--shell-world-strip-height': worldStripHeight,
        '--shell-top-strip-height': mode === 'software' ? '0px' : topInset,
        '--shell-top-inset': topInset,
        '--shell-header-content-top': mode === 'simulated_phone'
            ? 'var(--shell-top-inset)'
            : `calc(var(--shell-top-inset) + ${headerBreathingSpace})`,
        '--shell-header-height': mode === 'simulated_phone'
            ? 'calc(var(--shell-top-inset) + 3rem)'
            : `calc(var(--shell-top-inset) + ${nonPhoneHeaderHeight})`,
        '--shell-chat-header-extra-top': condenseStandaloneTop ? '0px' : '5px',
        '--shell-chat-header-row-height': condenseStandaloneTop ? '42px' : '48px',
        '--shell-overlay-top': `calc(var(--shell-top-inset) + ${overlayBreathingSpace})`,
    };
};
