import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    buildShellChromeStyle,
    migrateStoredShellChromeTheme,
    resolveShellSafeAreaTop,
    resolveShellChromeMode,
    shouldCondenseStandaloneTop,
} from '../utils/shellChrome';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

assert.equal(resolveShellChromeMode(undefined), 'software');
assert.equal(resolveShellChromeMode({}), 'software');
assert.equal(resolveShellChromeMode({ hideStatusBar: true }), 'software');
assert.equal(resolveShellChromeMode({ hideStatusBar: false }), 'software');
assert.equal(resolveShellChromeMode({ shellChromeMode: 'simulated_phone' }), 'simulated_phone');
assert.equal(resolveShellChromeMode({ shellChromeMode: 'virtual_city' }), 'virtual_city');

const migratedHidden = migrateStoredShellChromeTheme({ hideStatusBar: true, hue: 20 });
const migratedVisible = migrateStoredShellChromeTheme({ hideStatusBar: false, hue: 40 });
const migratedLegacyDefault = migrateStoredShellChromeTheme({ hue: 60 });
assert.equal(migratedHidden.shellChromeMode, 'software');
assert.equal(migratedVisible.shellChromeMode, 'simulated_phone');
assert.equal(migratedLegacyDefault.shellChromeMode, 'simulated_phone');
assert.equal('hideStatusBar' in migratedHidden, false);
assert.equal('hideStatusBar' in migratedVisible, false);
assert.equal(migratedHidden.hue, 20);
assert.equal(migratedVisible.hue, 40);

const preservedVirtual = migrateStoredShellChromeTheme({
    shellChromeMode: 'virtual_city',
    hideStatusBar: false,
});
assert.equal(preservedVirtual.shellChromeMode, 'virtual_city');
assert.equal('hideStatusBar' in preservedVirtual, false);

const softwareStyle = buildShellChromeStyle('software');
const simulatedStyle = buildShellChromeStyle('simulated_phone');
const virtualStyle = buildShellChromeStyle('virtual_city');
const androidStandaloneStyle = buildShellChromeStyle('software', {
    standalone: true,
    ios: false,
    native: false,
});
const iosStandaloneStyle = buildShellChromeStyle('software', {
    standalone: true,
    ios: true,
    native: false,
});
const nativeStandaloneStyle = buildShellChromeStyle('software', {
    standalone: true,
    ios: false,
    native: true,
});
assert.equal(softwareStyle['--shell-world-strip-height'], '0px');
assert.equal(simulatedStyle['--shell-world-strip-height'], '0px');
assert.equal(virtualStyle['--shell-world-strip-height'], '34px');
assert.equal(softwareStyle['--shell-top-strip-height'], '0px');
assert.match(simulatedStyle['--shell-top-strip-height'], /max\(12px/);
assert.match(simulatedStyle['--shell-header-content-top'], /--shell-top-inset/);
assert.match(softwareStyle['--shell-header-content-top'], /--shell-top-inset/);
assert.match(softwareStyle['--shell-overlay-top'], /--shell-top-inset/);
assert.equal(resolveShellSafeAreaTop(), 'env(safe-area-inset-top, 0px)');
assert.equal(androidStandaloneStyle['--shell-safe-area-top'], '0px');
assert.equal(iosStandaloneStyle['--shell-safe-area-top'], 'env(safe-area-inset-top, 0px)');
assert.equal(nativeStandaloneStyle['--shell-safe-area-top'], 'env(safe-area-inset-top, 0px)');
assert.equal(shouldCondenseStandaloneTop({ standalone: true, ios: false, native: false }), true);
assert.equal(shouldCondenseStandaloneTop({ standalone: true, ios: true, native: false }), false);
assert.equal(androidStandaloneStyle['--shell-header-content-top'], 'calc(var(--shell-top-inset) + 0px)');
assert.equal(androidStandaloneStyle['--shell-header-height'], 'calc(var(--shell-top-inset) + 3rem)');
assert.equal(androidStandaloneStyle['--shell-chat-header-extra-top'], '0px');
assert.equal(androidStandaloneStyle['--shell-chat-header-row-height'], '42px');
assert.equal(androidStandaloneStyle['--shell-chat-header-empty-title-offset'], '2.5px');
assert.equal(softwareStyle['--shell-chat-header-row-height'], '48px');
assert.equal(softwareStyle['--shell-chat-header-extra-top'], '5px');
assert.equal(softwareStyle['--shell-chat-header-empty-title-offset'], '-4px');
assert.equal(androidStandaloneStyle['--shell-overlay-top'], 'calc(var(--shell-top-inset) + 0.5rem)');

const phoneShell = read('components/PhoneShell.tsx');
const appearance = read('apps/Appearance.tsx');
const launcher = read('apps/Launcher.tsx');
const socialApp = read('apps/SocialApp.tsx');
const scheduleApp = read('apps/ScheduleApp.tsx');
const chatHeaderShell = read('components/chat/ChatHeaderShell.tsx');
const shellLayout = read('components/shell/shellLayout.ts');
const simulatedStatusBar = read('components/os/SimulatedPhoneStatusBar.tsx');

assert.doesNotMatch(phoneShell, /theme\.hideStatusBar|top-7\b|top-12\b/);
assert.doesNotMatch(appearance, /hideStatusBar|隐藏顶部时间栏|状态栏 \(Status Bar\)/);
assert.match(phoneShell, /data-shell-chrome-mode/);
assert.match(phoneShell, /data-shell-runtime-surface/);
assert.match(phoneShell, /data-shell-overlay-stack/);
assert.match(phoneShell, /data-shell-toast/);
assert.match(phoneShell, /px-3\.5 py-2 rounded-xl/);
assert.doesNotMatch(phoneShell, /data-shell-toast[^\n]+py-3/);
assert.match(phoneShell, /const shellIsStandalone = isStandaloneDisplayMode\(\)/);
assert.match(phoneShell, /const shellIsIOS = isIOSDevice\(\)/);
assert.match(phoneShell, /const shellIsNative = Capacitor\.isNativePlatform\(\)/);
assert.match(phoneShell, /standalone:\s*shellIsStandalone/);
assert.match(phoneShell, /ios:\s*shellIsIOS/);
assert.match(phoneShell, /native:\s*shellIsNative/);
assert.match(phoneShell, /<SystemErrorIndicator/);
assert.match(phoneShell, /<SimulatedPhoneStatusBar/);
assert.match(phoneShell, /<VirtualCityStrip/);
assert.match(simulatedStatusBar, /data-simulated-phone-status-bar/);
assert.match(simulatedStatusBar, /getBattery/);
assert.match(appearance, /经典手机/);
assert.match(appearance, /纯软件界面/);
assert.match(appearance, /虚拟城区/);
assert.doesNotMatch(appearance, />\s*原样\s*</);
assert.match(appearance, /title="屏幕观感"/);
assert.match(appearance, /title="桌面布置"/);
assert.match(appearance, /page 16 \/ tabs 12 \/ sections 13 \/ controls 11 \/ helpers 10 \/ metadata 9/);
assert.match(chatHeaderShell, /SHELL_CHAT_HEADER_EXTRA_TOP/);
assert.match(chatHeaderShell, /SHELL_CHAT_HEADER_ROW_HEIGHT/);
assert.match(chatHeaderShell, /headerBodyHeightPx}px \+ \$\{SHELL_CHAT_HEADER_EXTRA_TOP\}/);
assert.match(launcher, /pb-\[9\.25rem\] pt-14/);
assert.match(phoneShell, /'Real isn’t how you are made\.'/);
assert.match(phoneShell, /'It’s a thing that happens to you\.'/);
assert.match(phoneShell, /Snell Roundhand/);
assert.match(phoneShell, /leading-\[1\.9\]/);
assert.match(phoneShell, /block whitespace-nowrap/);
assert.doesNotMatch(phoneShell, /Software Shell/);
assert.match(launcher, /SIGNAL RECEIVED/);
assert.match(launcher, /I am a part of all that I have met\./);
assert.doesNotMatch(launcher, /AetherOS LINK READY|Local First · Software Shell/);
assert.match(socialApp, /SOCIAL_DETAIL_HEADER_VERTICAL_OFFSET_PX = 3/);
assert.match(socialApp, /SHELL_APP_HEADER_CONTENT_TOP} \+ \${SOCIAL_DETAIL_HEADER_VERTICAL_OFFSET_PX}px/);
assert.match(shellLayout, /--shell-header-content-top/);
assert.match(shellLayout, /--shell-chat-header-extra-top/);
assert.match(shellLayout, /--shell-chat-header-empty-title-offset/);
assert.match(shellLayout, /--shell-overlay-top/);
assert.match(scheduleApp, /SHELL_OVERLAY_TOP/);
assert.match(
    scheduleApp,
    /className="[^"]*h-10 w-10[^"]*"[\s\S]*?style=\{\{ top: SHELL_OVERLAY_TOP \}\}[\s\S]*?data-timebook-top-control="back"/,
);
assert.match(
    scheduleApp,
    /className="[^"]*h-10 w-10[^"]*"[\s\S]*?style=\{\{ top: SHELL_OVERLAY_TOP \}\}[\s\S]*?data-timebook-top-control="add"/,
);

const requiredVariableConsumers = [
    'components/shell/AppHeader.tsx',
    'components/chat/ChatHeaderShell.tsx',
    'components/date/DateSession.tsx',
    'apps/DateApp.tsx',
    'apps/CallApp.tsx',
    'apps/RoomApp.tsx',
    'apps/ScheduleApp.tsx',
    'apps/SocialApp.tsx',
    'apps/GroupChat.tsx',
    'apps/JournalApp.tsx',
    'apps/Gallery.tsx',
    'apps/StudyApp.tsx',
    'apps/GameApp.tsx',
    'apps/FAQApp.tsx',
    'apps/WorldbookApp.tsx',
    'apps/NovelApp.tsx',
    'apps/SongwritingApp.tsx',
    'apps/BrowserApp.tsx',
    'apps/BankApp.tsx',
    'apps/LifeSimApp.tsx',
    'components/chat/MessageItem.tsx',
];

requiredVariableConsumers.forEach((path) => {
    assert.match(
        read(path),
        /SHELL_APP_HEADER_(?:CONTENT_TOP|HEIGHT)|SHELL_TOP_INSET|SHELL_OVERLAY_TOP/,
        `${path} must consume the shared top coordinate source`,
    );
});

console.log('shell chrome contract: OK');
