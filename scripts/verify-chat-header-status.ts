import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CharacterBuff } from '../types.ts';
import {
    createCharacterLivePresence,
    createCharacterMoodBuff,
} from '../utils/characterLiveState.ts';
import { resolveChatHeaderStatus } from '../utils/chatHeaderStatus.ts';

const now = Date.UTC(2026, 6, 30, 12, 0, 0);
const buff = (label: string, intensity: 1 | 2 | 3, emoji?: string): CharacterBuff => ({
    id: `buff-${label || 'blank'}-${intensity}`,
    name: `fixture_${label || intensity}`,
    label,
    intensity,
    emoji,
    updatedAt: now,
    expiresAt: now + 60_000,
    remainingTurns: 3,
    stateKey: `fixture:${label}`,
    source: 'system-director',
});

assert.deepEqual(
    resolveChatHeaderStatus({
        activeBuffs: [buff('轻轻期待', 1, '🌱'), buff('终于安心', 3, '☁️')],
    }, now),
    { kind: 'mood', text: '心情 · ☁️ 终于安心' },
    'current emotion projects above every other transient header state',
);

assert.deepEqual(
    resolveChatHeaderStatus({
        activeBuffs: [buff('先出现', 2), buff('后出现', 2)],
    }, now),
    { kind: 'mood', text: '心情 · 先出现' },
    'equal intensity keeps stable source order',
);

const presence = createCharacterLivePresence({
    text: '刚结束巡航',
    stateKey: 'post_patrol',
    ttlMinutes: 60,
    remainingTurns: 3,
}, { now, source: 'seed' });
assert.ok(presence);
assert.deepEqual(
    resolveChatHeaderStatus({ activeBuffs: [], chatPresenceStatus: presence }, now),
    { kind: 'presence', text: '近况 · 刚结束巡航' },
);

assert.deepEqual(
    resolveChatHeaderStatus({
        activeBuffs: [{ ...buff('已过期', 3), expiresAt: now - 1 }],
        chatPresenceStatus: presence,
    }, now),
    { kind: 'presence', text: '近况 · 刚结束巡航' },
    'expired mood cannot masquerade as current state',
);
assert.deepEqual(resolveChatHeaderStatus({ activeBuffs: [] }, now), { kind: 'none', text: '' });
assert.deepEqual(
    resolveChatHeaderStatus({
        activeBuffs: [],
        chatPresenceStatus: { ...presence, remainingTurns: 0 },
    }, now),
    { kind: 'none', text: '' },
    'missing turn lifetime fails closed instead of showing online or a durable signature',
);

assert.equal(
    createCharacterMoodBuff({
        name: 'too_long',
        label: '这个情绪名字已经明显超过八个字',
        intensity: 2,
    }, { now, source: 'system-director' }),
    undefined,
    'overlong mood is rejected rather than mechanically truncating a sentence',
);

const headerSource = readFileSync(new URL('../components/chat/ChatHeaderShell.tsx', import.meta.url), 'utf8');
assert.match(headerSource, /resolveChatHeaderStatus\(activeCharacter\)/u);
assert.match(headerSource, /data-chat-header-status/u);
assert.match(headerSource, /CENTERED_HEADER_ACTION_RAIL_PX = 96/u);
assert.match(headerSource, /CENTERED_HEADER_SIDE_RESERVE_PX = CENTERED_HEADER_ACTION_RAIL_PX \+ 4/u);
assert.match(headerSource, /CENTERED_MOOD_VERTICAL_OFFSET_PX = 3/u);
assert.match(headerSource, /CENTERED_MOOD_STATUS_PULL_UP_PX = 9/u);
assert.match(headerSource, /SHELL_CHAT_HEADER_ROW_HEIGHT/u);
assert.match(headerSource, /SHELL_CHAT_HEADER_EMPTY_TITLE_OFFSET/u);
assert.match(headerSource, /style=\{\{ height: SHELL_CHAT_HEADER_ROW_HEIGHT \}\}/u);
assert.match(headerSource, /const hasCenteredStatus = headerStatus\.kind !== 'none'/u);
assert.match(headerSource, /useStackedCenteredHeader = !selectionMode && useCenteredLayout && hasCenteredStatus/u);
assert.match(headerSource, /useCenteredEmptyHeader = !selectionMode && useCenteredLayout && !hasCenteredStatus/u);
assert.match(headerSource, /data-chat-header-layout=\{useStackedCenteredHeader \? 'mood' : 'compact'\}/u);
assert.match(headerSource, /data-chat-header-actions/u);
assert.match(headerSource, /data-chat-header-center/u);
assert.match(headerSource, /\{onlineStatusNode \? \(/u);
assert.match(headerSource, /marginTop: useCenteredEmptyHeader \? SHELL_CHAT_HEADER_EMPTY_TITLE_OFFSET : undefined/u);
assert.match(headerSource, /marginTop: -CENTERED_MOOD_STATUS_PULL_UP_PX/u);
assert.match(headerSource, /data-chat-header-status-lane/u);
assert.match(headerSource, /h-\[22px\] w-\[22px\]/u);
assert.doesNotMatch(headerSource, /activeCharacter\.(?:isBuiltIn|sourceType)/u);
assert.doesNotMatch(headerSource, />在线</u);

const centeredStatusLaneSource = headerSource.slice(
    headerSource.indexOf('data-chat-header-status-lane'),
    headerSource.indexOf('data-chat-header-status-lane') + 700,
);
assert.match(centeredStatusLaneSource, /whitespace-nowrap/u);
assert.match(centeredStatusLaneSource, /\{headerStatus\.text\}/u);
assert.doesNotMatch(centeredStatusLaneSource, /truncate/u);
assert.doesNotMatch(centeredStatusLaneSource, /overflow-hidden/u);
assert.doesNotMatch(centeredStatusLaneSource, /renderBuffRow/u);

const composerSource = readFileSync(new URL('../components/chat/ChatInputArea.tsx', import.meta.url), 'utf8');
assert.match(composerSource, /compactControlHeightClass = 'h-\[46px\]'/u);
assert.match(composerSource, /data-chat-composer-control="actions"/u);
assert.match(composerSource, /data-chat-composer-control="input"/u);
assert.match(composerSource, /data-chat-composer-control="send"/u);

console.log('chat header transient state + elastic layout: OK');
