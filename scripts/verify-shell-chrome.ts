import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    buildShellChromeStyle,
    migrateStoredShellChromeTheme,
    resolveShellChromeMode,
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
assert.equal(softwareStyle['--shell-world-strip-height'], '0px');
assert.equal(simulatedStyle['--shell-world-strip-height'], '0px');
assert.equal(virtualStyle['--shell-world-strip-height'], '34px');
assert.equal(softwareStyle['--shell-top-strip-height'], '0px');
assert.match(simulatedStyle['--shell-top-strip-height'], /max\(12px/);
assert.match(simulatedStyle['--shell-header-content-top'], /--shell-top-inset/);
assert.match(softwareStyle['--shell-header-content-top'], /--shell-top-inset/);
assert.match(softwareStyle['--shell-overlay-top'], /--shell-top-inset/);

const phoneShell = read('components/PhoneShell.tsx');
const appearance = read('apps/Appearance.tsx');
const launcher = read('apps/Launcher.tsx');
const socialApp = read('apps/SocialApp.tsx');
const chatHeaderShell = read('components/chat/ChatHeaderShell.tsx');
const shellLayout = read('components/shell/shellLayout.ts');
const simulatedStatusBar = read('components/os/SimulatedPhoneStatusBar.tsx');

assert.doesNotMatch(phoneShell, /theme\.hideStatusBar|top-7\b|top-12\b/);
assert.doesNotMatch(appearance, /hideStatusBar|隐藏顶部时间栏|状态栏 \(Status Bar\)/);
assert.match(phoneShell, /data-shell-chrome-mode/);
assert.match(phoneShell, /data-shell-overlay-stack/);
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
assert.match(chatHeaderShell, /CHAT_HEADER_VERTICAL_OFFSET_PX = 5/);
assert.match(chatHeaderShell, /headerBodyHeightPx \+ CHAT_HEADER_VERTICAL_OFFSET_PX/);
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
assert.match(shellLayout, /--shell-overlay-top/);

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
        /SHELL_APP_HEADER_(?:CONTENT_TOP|HEIGHT)|SHELL_TOP_INSET/,
        `${path} must consume the shared top coordinate source`,
    );
});

console.log('shell chrome contract: OK');
