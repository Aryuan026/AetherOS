import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CharacterBuff } from '../types.ts';
import { resolveChatHeaderStatus } from '../utils/chatHeaderStatus.ts';

const buff = (label: string, intensity: 1 | 2 | 3, emoji?: string): CharacterBuff => ({
    id: `buff-${label || 'blank'}-${intensity}`,
    name: `fixture_${intensity}`,
    label,
    intensity,
    emoji,
});

assert.deepEqual(
    resolveChatHeaderStatus({
        chatSignature: '固定签名',
        activeBuffs: [buff('轻轻期待', 1, '🌱'), buff('终于安心', 3, '☁️')],
    }),
    { kind: 'mood', text: '心情 · ☁️ 终于安心' },
    'current emotion must project above a static signature',
);

assert.deepEqual(
    resolveChatHeaderStatus({
        chatSignature: '固定签名',
        activeBuffs: [buff('先出现', 2), buff('后出现', 2)],
    }),
    { kind: 'mood', text: '心情 · 先出现' },
    'equal intensity keeps stable source order',
);

assert.deepEqual(
    resolveChatHeaderStatus({ chatSignature: '  角色自己的签名  ', activeBuffs: [buff('   ', 3)] }),
    { kind: 'signature', text: '角色自己的签名' },
);
assert.deepEqual(resolveChatHeaderStatus({ chatSignature: '', activeBuffs: [] }), { kind: 'online', text: '在线' });

const headerSource = readFileSync(new URL('../components/chat/ChatHeaderShell.tsx', import.meta.url), 'utf8');
assert.match(headerSource, /resolveChatHeaderStatus\(activeCharacter\)/u);
assert.match(headerSource, /data-chat-header-status/u);
assert.doesNotMatch(headerSource, /activeCharacter\.id\.startsWith\('history-placeholder-char-'/u);

console.log('chat header status projection: OK');
