import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LEGACY_PRIVATE_CHARACTER_IDS,
    isLegacyPrivateCharacterId,
    isLegacyPrivateEmojiCategoryId,
    isLegacyPrivateEmojiRecord,
    isLegacyUpstreamAssetUrl,
} from '../utils/publicReleaseSanitization.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

assert.equal(
    isLegacyPrivateCharacterId('preset-sully-v2'),
    true,
    'the upstream Sully preset must stay on the runtime removal list',
);
assert.equal(
    LEGACY_PRIVATE_CHARACTER_IDS.includes('builtin-card-tester'),
    true,
    'the retired card tester must stay on the runtime removal list',
);
assert.equal(
    isLegacyUpstreamAssetUrl('https://sharkpan.xyz/f/5n1gSj/bg.png'),
    true,
    'legacy upstream-hosted art must be recognized for local-data migration',
);
assert.equal(
    isLegacyUpstreamAssetUrl('https://sharkpan.xyz/f/user-owned/asset.png'),
    false,
    'unrelated user-provided assets on the same host must not be removed',
);
assert.equal(
    isLegacyPrivateEmojiCategoryId('cat_sully_exclusive'),
    true,
    'the retired private sticker category must stay on the removal list',
);
assert.equal(
    isLegacyPrivateEmojiRecord({ packId: 'sully', url: 'data:image/png;base64,user-copy' }),
    true,
    'orphaned stickers from the retired private pack must be removed',
);

const publicRuntimeFiles = [
    'README.md',
    'capacitor.config.json',
    'apps/BankApp.tsx',
    'apps/RoomApp.tsx',
    'components/ValentineEvent.tsx',
    'components/WhiteDayEvent.tsx',
    'components/bank/BankGameConstants.tsx',
    'context/OSContext.tsx',
    'utils/db.ts',
    'utils/publicReleaseSanitization.ts',
];
const forbiddenRuntimeMarkers = [
    'sharkpan.xyz',
    'skin_sully',
    'Sully床',
    'Sully电脑桌',
    'Sully垃圾桶',
    'Sully洞洞板',
    'Sully书柜',
    '系统正在哈我',
    '数据库在咕咕叫',
    '残余语料堆砌',
];

for (const path of publicRuntimeFiles) {
    const content = read(path);
    for (const marker of forbiddenRuntimeMarkers) {
        assert.equal(
            content.includes(marker),
            false,
            `${path} must not contain retired upstream-private marker: ${marker}`,
        );
    }
}

const capacitorConfig = JSON.parse(read('capacitor.config.json')) as { appName?: string };
assert.equal(capacitorConfig.appName, 'AetherOS', 'native package display name must be AetherOS');

const packageManifest = JSON.parse(read('package.json')) as { version?: string };
assert.equal(packageManifest.version, '2.0.0', 'first device-test release must carry the 2.0.0 major version');
assert.match(read('README.md'), /第一次实机测试/, 'README must record the first real-device test milestone');

const startupHtml = read('index.html');
for (const forbiddenStartupDependency of [
    'cdn.tailwindcss.com',
    'fonts.googleapis.com',
    'unpkg.com/katex',
    'type="importmap"',
]) {
    assert.equal(
        startupHtml.includes(forbiddenStartupDependency),
        false,
        `startup HTML must not depend on ${forbiddenStartupDependency}`,
    );
}
assert.match(read('styles.css'), /@tailwind utilities;/, 'Tailwind must be compiled into the release CSS');
assert.match(startupHtml, /id="aetheros-boot"/, 'startup HTML must retain a visible failure fallback');

const optimizedAssets = [
    ['public/brand/aetheros-starcore.jpg', 400_000],
    ['public/icons/icon-512.png', 500_000],
    ['public/icons/icon-192.png', 100_000],
    ['public/icons/apple-touch-icon.png', 100_000],
    ['public/assets/aetheros/timebook-desk-bg.jpg', 400_000],
    ['public/assets/aetheros/date-backgrounds/cafe-dawn.jpg', 450_000],
    ['public/assets/aetheros/date-backgrounds/cafe-day.jpg', 450_000],
    ['public/assets/aetheros/date-backgrounds/cafe-dusk.jpg', 450_000],
    ['public/assets/aetheros/date-backgrounds/lounge-night.jpg', 450_000],
] as const;

for (const [path, maxBytes] of optimizedAssets) {
    const absolutePath = resolve(root, path);
    assert.equal(existsSync(absolutePath), true, `${path} must exist`);
    assert.ok(statSync(absolutePath).size <= maxBytes, `${path} must stay under ${maxBytes} bytes`);
}

for (const retiredPath of [
    'public/assets/aetheros/timebook-desk-bg.png',
    'public/assets/aetheros/date-backgrounds/cafe-dawn.png',
    'public/assets/aetheros/date-backgrounds/cafe-day.png',
    'public/assets/aetheros/date-backgrounds/cafe-dusk.png',
    'public/assets/aetheros/date-backgrounds/lounge-night.png',
]) {
    assert.equal(existsSync(resolve(root, retiredPath)), false, `${retiredPath} must stay retired`);
}

console.log('public-release sanitization and asset budget verification passed');
