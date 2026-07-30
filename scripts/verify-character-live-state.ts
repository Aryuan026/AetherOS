import assert from 'node:assert/strict';
import type { CharacterProfile, Message } from '../types.ts';
import {
    advanceCharacterLiveState,
    countVisibleGraphemes,
    createCharacterLivePresence,
    createCharacterMoodBuff,
    isActiveCharacterPresence,
    shouldEvaluateCharacterLiveState,
} from '../utils/characterLiveState.ts';

const now = Date.UTC(2026, 6, 30, 13, 0, 0);
assert.equal(countVisibleGraphemes('🌙'), 1);
assert.equal(countVisibleGraphemes('刚结束巡航'), 5);

const mood = createCharacterMoodBuff({
    name: 'quiet_relief',
    label: '悄悄松口气',
    intensity: 2,
    remainingTurns: 2,
    ttlMinutes: 60,
}, { now, source: 'system-director' });
assert.ok(mood);
assert.equal(mood.remainingTurns, 2);
assert.equal(
    createCharacterMoodBuff({
        name: 'invalid',
        label: '这一条情绪标题已经远远超过八个字',
    }, { now, source: 'system-director' }),
    undefined,
);

const presence = createCharacterLivePresence({
    text: '刚结束巡航',
    stateKey: 'post_patrol',
    remainingTurns: 2,
    ttlMinutes: 60,
}, { now, source: 'seed' });
assert.ok(presence);
assert.equal(isActiveCharacterPresence(presence, now), true);
assert.equal(isActiveCharacterPresence({ ...presence, expiresAt: Number.NaN }, now), false);

const baseCharacter: CharacterProfile = {
    id: 'char-live-state',
    name: '角色',
    avatar: '',
    description: '',
    systemPrompt: '',
    memories: [],
    activeBuffs: mood ? [mood] : [],
    chatPresenceStatus: presence,
};
const once = advanceCharacterLiveState(baseCharacter, now);
assert.equal(once.activeBuffs?.[0]?.remainingTurns, 1);
assert.equal(once.chatPresenceStatus?.remainingTurns, 1);
const twice = advanceCharacterLiveState({ ...baseCharacter, ...once }, now);
assert.deepEqual(twice.activeBuffs, []);
assert.equal(twice.chatPresenceStatus, undefined);

const message = (
    id: number,
    role: Message['role'],
    content: string,
    timestamp: number,
    temporalClass: 'live' | 'historical' = 'live',
): Message => ({
    id,
    charId: baseCharacter.id,
    role,
    type: 'text',
    content,
    timestamp,
    metadata: { temporalClass },
});
const firstFour = [
    message(1, 'user', '早上好', now - 4000),
    message(2, 'assistant', '早', now - 3000),
    message(3, 'user', '今天有点忙', now - 2000),
    message(4, 'assistant', '那先忙你的', now - 1000),
];
assert.equal(shouldEvaluateCharacterLiveState(baseCharacter, firstFour, now), true);

const evaluated: CharacterProfile = {
    ...baseCharacter,
    chatLiveStateEvaluation: {
        lastEvaluatedAt: now,
        lastEvaluatedMessageId: 4,
        lastEvaluatedMessageTimestamp: now - 1000,
    },
};
assert.equal(shouldEvaluateCharacterLiveState(evaluated, firstFour, now), false);
assert.equal(shouldEvaluateCharacterLiveState(evaluated, [
    ...firstFour,
    message(5, 'user', '普通补一句', now + 1000),
    message(6, 'assistant', '接住', now + 2000),
], now + 3000), false);
assert.equal(shouldEvaluateCharacterLiveState(evaluated, [
    ...firstFour,
    message(5, 'user', '我刚结束手术，有点不舒服', now + 1000),
    message(6, 'assistant', '先坐一会儿', now + 2000),
], now + 3000), true);
assert.equal(shouldEvaluateCharacterLiveState(evaluated, [
    ...firstFour,
    message(5, 'user', '旧日里我受伤了', now + 1000, 'historical'),
    message(6, 'assistant', '旧日回应', now + 2000, 'historical'),
], now + 3000), false);

console.log('character live-state TTL + low-frequency gate: OK');
