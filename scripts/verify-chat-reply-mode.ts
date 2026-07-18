import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import type { CharacterProfile, Message, MessageRelationshipScope, UserProfile } from '../types.ts';
import {
    buildChatReplyModePrompt,
    DEFAULT_CHAT_REPLY_MODE,
    splitChatReplyText,
} from '../utils/chatReplyMode.ts';
import {
    getChatRelationshipSettingsAssetId,
    loadChatRelationshipSettings,
    saveChatRelationshipSettings,
} from '../utils/chatReplySettings.ts';
import { ChatPrompts } from '../utils/chatPrompts.ts';
import {
    getPresentationSourceMessageIds,
    mergeAssistantRepliesForPresentation,
} from '../utils/chatPresentation.ts';

const scopeA: MessageRelationshipScope = {
    progressBundleId: 'bundle-chat-a',
    personaMaskId: 'mask-chat-a',
    charId: 'char-shared',
};
const scopeB: MessageRelationshipScope = {
    ...scopeA,
    personaMaskId: 'mask-chat-b',
};

assert.equal(DEFAULT_CHAT_REPLY_MODE, 'preserve');

const preservePrompt = buildChatReplyModePrompt('preserve');
const textingPrompt = buildChatReplyModePrompt('texting');
const proactivePrompt = buildChatReplyModePrompt('preserve', 'proactive');
assert.match(preservePrompt, /跟随玩家格式/);
assert.match(preservePrompt, /纯对白.*括号动作.*叙述/);
assert.match(preservePrompt, /按内容自然分段/);
assert.match(preservePrompt, /不要模仿玩家的语气、措辞/);
assert.match(preservePrompt, /角色卡/);
assert.doesNotMatch(preservePrompt, /模仿玩家的语言|学习玩家|必须.*动作|强制.*动作|一个完整文本气泡/);
assert.match(textingPrompt, /远程文字聊天/);
assert.match(textingPrompt, /换行分隔/);
assert.equal(proactivePrompt, textingPrompt);

const originalReply = '（抬眼看过来）先别急。\n\n窗外的雨还没停，等我把这句说完。';
assert.deepEqual(splitChatReplyText(originalReply, 'preserve'), [originalReply]);
assert.ok(splitChatReplyText('第一条\n第二条', 'texting').length >= 2);

const fixtureMessage = (
    id: number,
    role: Message['role'],
    content: string,
    timestamp: number,
    metadata: Message['metadata'] = {},
): Message => ({
    id,
    charId: scopeA.charId,
    role,
    type: 'text',
    content,
    timestamp,
    metadata,
});

const legacySplitMessages = [
    fixtureMessage(1, 'user', '宝宝你在吗', 1_000),
    fixtureMessage(2, 'assistant', '在', 2_000),
    fixtureMessage(3, 'assistant', '刚还想着你应该早睡了', 3_500),
    fixtureMessage(4, 'assistant', '结果你比我还不老实', 5_000),
];
const preservedLegacy = mergeAssistantRepliesForPresentation(legacySplitMessages, 'preserve');
assert.equal(preservedLegacy.length, 2);
assert.equal(preservedLegacy[1].content, '在\n刚还想着你应该早睡了\n结果你比我还不老实');
assert.deepEqual(getPresentationSourceMessageIds(preservedLegacy[1]), [2, 3, 4]);
assert.equal(mergeAssistantRepliesForPresentation(legacySplitMessages, 'texting').length, 4);

const explicitResponses = [
    fixtureMessage(5, 'assistant', '第一段', 10_000, { assistantResponseId: 'response-a' }),
    fixtureMessage(6, 'assistant', '第二段', 40_000, { assistantResponseId: 'response-a' }),
    fixtureMessage(7, 'assistant', '另一轮', 40_100, { assistantResponseId: 'response-b' }),
];
const preservedExplicit = mergeAssistantRepliesForPresentation(explicitResponses, 'preserve');
assert.equal(preservedExplicit.length, 2);
assert.equal(preservedExplicit[0].content, '第一段\n第二段');
assert.equal(preservedExplicit[1].content, '另一轮');

const sourcedMessages = [
    fixtureMessage(8, 'assistant', '见面结束', 50_000, { source: 'date' }),
    fixtureMessage(9, 'assistant', '回到聊天', 50_100),
];
assert.equal(mergeAssistantRepliesForPresentation(sourcedMessages, 'preserve').length, 2);

const messageItemSource = readFileSync(new URL('../components/chat/MessageItem.tsx', import.meta.url), 'utf8');
assert.match(messageItemSource, /avatarMode === 'every_message' \|\| isFirstInGroup/);
assert.doesNotMatch(messageItemSource, /avatarMode === 'every_message' \|\| isLastInGroup/);

Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
});

const char: CharacterProfile = {
    id: scopeA.charId,
    name: '测试角色',
    avatar: '',
    description: '',
    systemPrompt: '你谨慎、好奇，会根据相处过程逐渐改变看法。',
    memories: [],
};
const user: UserProfile = {
    name: '测试用户',
    avatar: '',
    bio: '',
};
const fullPreservePrompt = await ChatPrompts.buildSystemPrompt(
    char,
    user,
    [],
    [],
    [],
    [],
    undefined,
    undefined,
    { replyMode: 'preserve', delivery: 'interactive' },
);
assert.match(fullPreservePrompt, new RegExp(char.systemPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(fullPreservePrompt, /跟随玩家格式/);
assert.match(fullPreservePrompt, /只对齐玩家当前消息的文本结构/);
assert.match(fullPreservePrompt, /自然分段/);
assert.match(fullPreservePrompt, /不模仿玩家的语言风格/);
assert.doesNotMatch(fullPreservePrompt, /本轮表达路由|聊天内轻共演|攻略中、失忆、重逢|必须深爱|默认恋人/);

const fullTextingPrompt = await ChatPrompts.buildSystemPrompt(
    char,
    user,
    [],
    [],
    [],
    [],
    undefined,
    undefined,
    { replyMode: 'texting', delivery: 'interactive' },
);
assert.match(fullTextingPrompt, /只发消息/);
assert.match(fullTextingPrompt, /远程文字聊天/);

assert.notEqual(getChatRelationshipSettingsAssetId(scopeA), getChatRelationshipSettingsAssetId(scopeB));
assert.equal((await loadChatRelationshipSettings(scopeA)).replyMode, 'preserve');
await saveChatRelationshipSettings(scopeA, { replyMode: 'texting' });
assert.equal((await loadChatRelationshipSettings(scopeA)).replyMode, 'texting');
assert.equal((await loadChatRelationshipSettings(scopeB)).replyMode, 'preserve');

console.log('chat reply mode contract: OK');
