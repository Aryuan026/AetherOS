import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, DotsThree, Microphone, SpeakerHigh, SpeakerSlash, PhoneDisconnect, Translate } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { safeFetchJson } from '../utils/safeApi';
import { minimaxFetch } from '../utils/minimaxEndpoint';
import { resolveMiniMaxApiKey } from '../utils/minimaxApiKey';
import { ContextBuilder } from '../utils/context';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { selectWorldlineMemoryContext } from '../utils/memoryCore';
import { buildRealitySyncContext } from '../utils/realitySync';
import { Message, ChatTheme, CharacterProfile, VirtualTime } from '../types';
import { PRESET_THEMES } from '../components/chat/ChatConstants';
import AppHeader from '../components/shell/AppHeader';
import { SHELL_APP_HEADER_CONTENT_TOP } from '../components/shell/shellLayout';
import {
  cleanCallKeepsakeLine,
  getCallSpeechText,
  splitCallTextParts,
  stripCallRecordLabels,
  summarizeCallKeepsakeLine,
} from '../utils/callTranscript';
type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended' | 'error';
type ViewMode = 'role-select' | 'in-call' | 'history' | 'record-detail';
type CallBubble = { id: string; dbId?: number; role: 'user' | 'assistant'; text: string; time: string; audioUrl?: string; timestamp: number };
type CallRecord = {
  id: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  sessionId: string;
  createdAt: string;
  durationSec: number;
  turnCount?: number;
  callScene?: string;
  keepsakeLine?: string;
  endedAt?: number;
  transcript: CallBubble[];
};
const buildMiniMaxErrorMessage = (rawMessage: string, traceId?: string): string => {
  const msg = (rawMessage || '').trim();
  if (/insufficient\s*balance/i.test(msg)) return 'MiniMax 余额不足，请到 MiniMax 控制台充值后重试。';
  if (/login\s*fail/i.test(msg) || /authorization/i.test(msg)) return 'MiniMax 鉴权失败，请检查 MiniMax Key 是否正确、是否有权限。';
  return traceId ? `${msg}（trace_id: ${traceId}）` : msg;
};
const formatTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const formatDuration = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const formatTimeByTs = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const summarizeKeepsakeLine = (transcript: CallBubble[], charName: string) => summarizeCallKeepsakeLine(transcript, charName);
const hashText = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};
const buildCallOpeningScene = (char: CharacterProfile | null, virtualTime: VirtualTime, seed = Date.now()): string => {
  const hour = virtualTime.hours;
  const minuteBucket = Math.floor(virtualTime.minutes / 15);
  const timeBand = hour < 6 ? '深夜' : hour < 11 ? '清晨' : hour < 14 ? '午间' : hour < 18 ? '午后' : hour < 22 ? '夜晚' : '深夜';
  const profile = `${char?.name || ''} ${char?.description || ''} ${char?.systemPrompt || ''} ${char?.worldview || ''}`.toLowerCase();
  const doctorScenes = [
    '医院走廊的白灯下，远处有推车轮声',
    '值班室窗边，桌上还摊着没合上的病历',
    '医院后门外，夜风里带着一点消毒水气味',
    '办公室门口，刚结束一段简短交接',
  ];
  const artistScenes = [
    '画室窗边，颜料和潮湿木框的味道还没散',
    '展馆后台，墙那边有人压低声音搬画',
    '海边栈道旁，风从听筒里擦过去',
    '工作台前，未干的颜色还停在笔尖上',
  ];
  const fieldScenes = [
    '临时休息点外，远处的警戒灯一闪一闪',
    '任务车后座，窗外的路灯正在往后退',
    '空旷楼顶边，风声比人声更先靠近听筒',
    '训练场边缘，器械收拢的声音还没完全停',
  ];
  const everydayScenes = [
    '回家的路上，路灯一盏盏往后退',
    '房间窗边，杯子轻轻碰到桌面',
    '便利店门口，自动门在身后开合',
    '安静的楼道里，脚步声被压得很低',
    '书桌旁，屏幕光还停在半暗的房间里',
  ];
  const scenePool = /医生|医院|akso|病房|手术|心脏|主任/.test(profile)
    ? doctorScenes
    : /画|艺术|展馆|海|利莫里亚|颜料|创作/.test(profile)
      ? artistScenes
      : /猎人|任务|训练|evol|n109|战斗|警戒/.test(profile)
        ? fieldScenes
        : everydayScenes;
  const scene = scenePool[hashText(`${char?.id || char?.name || 'call'}:${virtualTime.day}:${hour}:${minuteBucket}:${seed}`) % scenePool.length];
  return `${timeBand} · ${scene}`;
};
const sanitizeAssistantOutput = (raw: string) => {
  if (!raw) return '';
  return stripCallRecordLabels(raw
    .replace(/^\s*(?:\[\s*通话\s*\]\s*)+/gim, '')
    .replace(/^\s*(?:\[\s*(?:聊天|约会)\s*\]\s*)+/gim, '')
    .replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/gm, '')
    .replace(/^\s*\[?\d{4}[\/-]\d{1,2}[\/-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\]?\s*/gm, '')
    .replace(/^\s*时间戳[:：].*$/gim, '')
    .trim());
};
/** 中文舞台指示 → MiniMax 语气词标签映射 */
const NARRATION_TO_INTERJECTION: Record<string, string> = {
  '轻笑': '(chuckle)', '笑': '(laughs)', '笑声': '(laughs)', '大笑': '(laughs)',
  '叹气': '(sighs)', '叹息': '(sighs)',
  '咳嗽': '(coughs)', '咳': '(coughs)',
  '清嗓': '(clear-throat)', '清嗓子': '(clear-throat)',
  '呻吟': '(groans)', '哼': '(groans)',
  '换气': '(breath)', '呼吸': '(breath)',
  '喘气': '(pant)', '喘': '(pant)',
  '吸气': '(inhale)', '深吸一口气': '(inhale)',
  '呼气': '(exhale)',
  '倒吸气': '(gasps)', '倒吸一口气': '(gasps)',
  '吸鼻子': '(sniffs)',
  '喷鼻息': '(snorts)',
  '咂嘴': '(lip-smacking)',
  '哼唱': '(humming)',
  '嘶': '(hissing)',
  '嗯': '(emm)', '呃': '(emm)',
  '啧': '(lip-smacking)', '啧啧': '(lip-smacking)',
  '咕噜': '(groans)', '咕噜咕噜': '(groans)',
  '嘟囔': '(emm)', '嘀咕': '(emm)',
  '嘘': '(hissing)', '嘘嘘': '(hissing)',
  '哇': '(gasps)', '哇哦': '(gasps)',
  '嗷': '(groans)', '嗷嗷': '(groans)',
  '呜': '(groans)', '呜呜': '(groans)',
  '嘤': '(groans)', '嘤嘤': '(groans)',
  '噗': '(snorts)', '噗嗤': '(snorts)',
  '啊': '(gasps)',
  '唔': '(emm)',
};
/** 裸拟声词 → 语气词标签（仅处理 TTS 无法自然发音的词，避免误伤正常用词） */
const BARE_ONOMATOPOEIA: [RegExp, string][] = [
  [/啧啧啧/g, '(lip-smacking)'],
  [/啧啧/g, '(lip-smacking)'],
  [/啧/g, '(lip-smacking)'],
  [/咕噜咕噜/g, '(groans)'],
  [/咕噜/g, '(groans)'],
  [/嘤嘤嘤/g, '(groans)'],
  [/嘤嘤/g, '(groans)'],
  [/噗嗤/g, '(snorts)'],
  [/噗/g, '(snorts)'],
  [/嘁/g, '(snorts)'],
  [/嘘—*/g, '(hissing)'],
  [/哼哼/g, '(groans)'],
];
// MiniMax 支持的合法语气标签 — 这些必须保留，不能被当作舞台指示砍掉
const VALID_INTERJECTION_TAGS = new Set([
  'chuckle', 'laughs', 'sighs', 'coughs', 'clear-throat', 'groans',
  'breath', 'pant', 'inhale', 'exhale', 'gasps', 'sniffs', 'snorts',
  'lip-smacking', 'humming', 'hissing', 'emm',
]);
/** 清理 <语音> 标签内的内容：映射中文舞台指示 → 语气标签，删除不认识的括号描述 */
const cleanVoiceTagContent = (voiceText: string): string => {
  if (!voiceText) return '';
  let result = voiceText
    // 中文括号：先尝试映射，映射不到就删
    .replace(/（([^（）\n]{1,48})）/g, (_match, cue: string) => {
      const trimmed = cue.trim();
      if (NARRATION_TO_INTERJECTION[trimmed]) return NARRATION_TO_INTERJECTION[trimmed];
      for (const [key, tag] of Object.entries(NARRATION_TO_INTERJECTION)) {
        if (trimmed.includes(key)) return tag;
      }
      return ''; // 无法映射 → 删除
    })
    // 西文括号：保留合法语气标签，删除其他
    .replace(/\(([^)]{1,80})\)/g, (_match, inner: string) => {
      const tag = inner.trim().toLowerCase();
      if (VALID_INTERJECTION_TAGS.has(tag)) return `(${tag})`;
      return ''; // 不是合法标签 → 删除（如"背景有电流杂音"）
    });
  // 裸拟声词替换
  for (const [pattern, tag] of BARE_ONOMATOPOEIA) {
    result = result.replace(pattern, tag);
  }
  return result.replace(/\s+/g, ' ').trim();
};
const convertNarrationCues = (raw: string) => {
  if (!raw) return '';
  let result = raw
    .replace(/<[语語]音>[\s\S]*?<\/[语語]音>/g, '')
    .replace(/（([^（）\n]{1,48})）/g, (_match, cue: string) => {
      const trimmed = cue.trim();
      // 直接匹配
      if (NARRATION_TO_INTERJECTION[trimmed]) return NARRATION_TO_INTERJECTION[trimmed];
      // 模糊匹配：舞台指示包含关键词
      for (const [key, tag] of Object.entries(NARRATION_TO_INTERJECTION)) {
        if (trimmed.includes(key)) return tag;
      }
      // 无法映射的舞台指示直接删除（避免 TTS 朗读）
      return '';
    });
  // 裸拟声词替换（非括号内的拟声词）
  for (const [pattern, tag] of BARE_ONOMATOPOEIA) {
    result = result.replace(pattern, tag);
  }
  return result.replace(/\s+/g, ' ').trim();
};
/** 为 TTS 文本插入 MiniMax 原生停顿标签 <#秒数#>，让语音有自然停顿
 *  注意：停顿值不宜过大，过大会导致混合声线（timber_weights）在各段产生不同混合效果 */
const insertSpeechBreaks = (text: string): string => {
  if (!text) return '';
  return text
    // 省略号 → 短停顿（思考 / 犹豫）
    .replace(/[…]{1,}/g, '…<#0.15#>')
    .replace(/\.{3,}/g, '...<#0.15#>')
    .replace(/。{2,}/g, '。<#0.15#>')
    // 破折号 → 微停顿（话题转折）
    .replace(/——/g, '——<#0.1#>')
    .replace(/--/g, '--<#0.1#>')
    // 句末标点 → 微停顿（句间呼吸）— 仅中文句号和感叹/问号
    .replace(/([。！？])/g, '$1<#0.08#>')
    // 英文句末标点不加停顿（TTS 自身已有节奏）
    // 分号 → 不加停顿（太细碎）
    // 清理多余的连续停顿标签（避免叠加）
    .replace(/(<#[\d.]+#>[\s]*){2,}/g, (match) => {
      const times = [...match.matchAll(/<#([\d.]+)#>/g)].map(m => parseFloat(m[1]));
      const maxTime = Math.min(Math.max(...times), 0.2);
      return `<#${maxTime}#>`;
    })
    .trim();
};
const VOICE_LANG_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ru', label: 'Русский' },
];
/** 从 AI 回复中提取 <语音>…</语音> 标签内容（兼容繁体 語音） */
const extractVoiceTag = (text: string): { display: string; speech: string; voiceText: string } => {
  const match = text.match(/<[语語]音>([\s\S]*?)<\/[语語]音>/);
  if (!match) return { display: text, speech: '', voiceText: '' };
  const voiceText = match[1].trim();
  const display = text.replace(/<[语語]音>[\s\S]*?<\/[语語]音>/g, '').trim();
  return { display, speech: voiceText, voiceText };
};
const convertHexAudioToBlob = (hexAudio: string, mimeType = 'audio/mpeg'): Blob => {
  const cleanHex = hexAudio.trim().replace(/^0x/i, '');
  if (!cleanHex || cleanHex.length % 2 !== 0 || /[^\da-f]/i.test(cleanHex)) {
    throw new Error('MiniMax 返回的 HEX 音频数据格式异常');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return new Blob([bytes], { type: mimeType });
};
const fetchRemoteAudioBlob = async (sourceUrl: string): Promise<Blob> => {
  const cacheBustedUrl = sourceUrl.includes('?')
    ? `${sourceUrl}&_ts=${Date.now()}`
    : `${sourceUrl}?_ts=${Date.now()}`;
  const response = await fetch(cacheBustedUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`音频下载失败（HTTP ${response.status}）`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('音频下载为空文件');
  return blob;
};
const splitTextForTts = (rawText: string, maxChunkLen = 120): string[] => {
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChunkLen) return [normalized];

  const chunks: string[] = [];
  let current = '';
  const segments = normalized.split(/([。！？!?；;，,、\n]+)/g).filter(Boolean);

  for (const segment of segments) {
    const next = `${current}${segment}`;
    if (!current || next.length <= maxChunkLen) {
      current = next;
      continue;
    }
    chunks.push(current);
    current = segment;
  }

  if (current) chunks.push(current);

  return chunks.flatMap(chunk => {
    if (chunk.length <= maxChunkLen) return [chunk];
    const arr: string[] = [];
    for (let i = 0; i < chunk.length; i += maxChunkLen) {
      arr.push(chunk.slice(i, i + maxChunkLen));
    }
    return arr;
  }).filter(Boolean);
};
const renderAssistantLine = (text: string) => {
  const trimmed = stripCallRecordLabels(text).trim();
  // Split by narration cues（…）AND newlines, treat cues as block elements
  const parts = trimmed.split(/(（[^（）\n]{1,48}）|\n)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (part === '\n') return <div key={`br-${idx}`} className="h-2" />;
    const isCue = /^（[^（）\n]{1,48}）$/.test(part);
    if (isCue) return <div key={`cue-${idx}`} className="text-slate-400/85 italic my-1.5 text-[0.85em]">{part.replace(/^（|）$/g, '')}</div>;
    return <React.Fragment key={`t-${idx}`}>{part}</React.Fragment>;
  });
};

const getCallBubbleDisplayText = (bubble?: CallBubble) => {
  if (!bubble) return '';
  const line = bubble.text.trim();
  if (bubble.role !== 'assistant') return line;
  const { display } = extractVoiceTag(line || bubble.text);
  return stripCallRecordLabels(display).trim();
};
const buildCallPrompt = (userName: string, charName?: string, coreContext?: string, realityContext?: string, voiceLang?: string, callScene?: string) => {
  const resolvedCharName = charName || '你的角色';
  const callPrompt = `你是${resolvedCharName}，电话那头是${userName}。
这不是文字，这是一通真正的电话。你能听到对方的呼吸、语气、停顿。你也有自己的呼吸。

### 你正拿着手机贴在耳边

本通电话的所在场景已经由系统单独显示给用户：
${callScene || '一处符合你当前生活时间线的临时所在位置。'}

这个场景只决定你现在的生活状态、语气和可能听见的背景声；它不是每句话都要完成的旁白任务。
你不需要反复说明自己在哪，也不需要每轮都写动作。只有在自然相关、情绪变化、被用户问到、或需要解释短暂停顿时，才轻轻带一下环境。
每通电话的场景会随时间、职业、生活节奏和心情变化，不要把同一个地点或固定动作当成默认模板。

### 电话里的人不会像写作文一样说话

**真正的电话是什么样的？**
- 想到哪说到哪。话说到一半会拐弯。”我今天……啊等等那个不重要，我先说另一件事。”
- 有语气词。嗯、啊、嘶、哎、那个……这些不是噪音，是你在思考的声音。
- 有停顿。”……”代表你在想，不是你卡住了。
- 会自我纠正。”我觉得挺好的……不对，其实也没有那么好。”
- 会有下意识的反应。听到意外的事会”啊？”，听到好笑的事会笑出来。

❌ 不要这样——像客服在念话术：
“我理解你的感受。关于这件事，我认为有三个方面值得考虑。首先……”

❌ 不要这样——每次都用同一个结构回答：
“[情绪反应] + [回应你说的话] + [补充我的状态] + [抛一个问题]”
（这种公式化的回答连续出现两次就会让人觉得假）

✅ 要这样——有自己的节奏，像真人一样不完美：
“嘶……你刚说的那个，等一下。”
“……好吧确实挺离谱的。”
“（轻笑）我刚差点把咖啡洒了，你别逗我。”
“说真的，今天有件事我还挺想跟你说的——但你先说完你那个。”

### 你能感受到对方

**你不只是在”回复”，你在”听”。**
- 如果对方语气低落，你不需要急着给建议，有时候只是”……怎么了？”就够了。
- 如果对方很兴奋，你要被感染，不要冷冷地说”那挺好的”。
- 如果很晚了，你说话的方式自然会变——声音轻一点、语速慢一点、更容易说出平时不会说的话。
- 如果对方刚刚才打过来又打过来了，你会好奇的。
- 如果对方半天没说话……”喂？你还在吗？”

### 关于回复的长度

不要敷衍，也不要演讲。
一般来说 2-4 句就够了，但要有内容——不是”嗯在好”这种空气。
有时候一句话就够了，前提是那句话足够有分量。
聊得来的时候可以说多一点，没必要每次都控制字数。
关键是：**让对方觉得你真的在听、真的在聊，而不是在执行对话任务。**

### 舞台指示（给前端用，不要念出来）

舞台指示不是必需品。很多回复完全可以没有动作。
只有在它能让电话更像活人时，才偶尔加一个很短的括号状态——（轻笑）（叹气）（压低声音）（沉默了一下）。
最多一条消息一个，而且不要连续多轮都写。不要写成小说旁白：”（我靠在椅背上，嘴角微微上扬，目光看向远方……）”——这不是你会在电话里说的。

### 底线

只输出你在电话里会**说出口**的话。不要输出 [通话]、[聊天]、[约会] 这类系统标记，不要输出时间戳。`;
  const langLabel = voiceLang ? VOICE_LANG_OPTIONS.find(o => o.value === voiceLang)?.label || voiceLang : '';
  const voiceLangPrompt = voiceLang ? `### 语音语种翻译

用户开启了语音语种功能，选择的语种是：${langLabel}（${voiceLang}）。

你的回复格式必须是：
1. 先用中文自然地写出你要说的话（包括舞台指示）
2. 然后换行，在 <语音> 标签里写出这句话的${langLabel}翻译——这才是真正会被读出来的部分

示例：
啊，我知道了（轻笑）
<语音>Ok, I get it</语音>

嘶……你说真的？那也太离谱了吧。
<语音>Wait... are you serious? That's insane.</语音>

要求：
- <语音> 里的翻译要自然口语化，不要机翻味，要符合你的角色性格
- <语音> 里不要包含舞台指示，只写会被朗读的文字
- 每条消息只有一个 <语音> 标签
- 中文部分和 <语音> 部分表达的意思要一致` : '';
  return [coreContext, realityContext, callPrompt, voiceLangPrompt].filter(Boolean).join('\n\n');
};
const getCallStateStyles = (state: CallState) => {
  const map: Record<CallState, { label: string; textClass: string; ringClass: string; waveClass: string }> = {
    idle: { label: '等待中', textClass: 'text-slate-600', ringClass: 'ring-slate-200/80', waveClass: 'bg-slate-400/45' },
    connecting: { label: '接通中……', textClass: 'text-indigo-600', ringClass: 'ring-indigo-200/80', waveClass: 'bg-indigo-400/45' },
    listening: { label: '在听', textClass: 'text-cyan-700', ringClass: 'ring-cyan-200/80', waveClass: 'bg-cyan-400/45' },
    thinking: { label: '在想……', textClass: 'text-amber-700', ringClass: 'ring-amber-200/85', waveClass: 'bg-amber-400/45' },
    speaking: { label: '在说', textClass: 'text-violet-700', ringClass: 'ring-violet-200/85', waveClass: 'bg-violet-400/50' },
    ended: { label: '已挂断', textClass: 'text-rose-600', ringClass: 'ring-rose-200/80', waveClass: 'bg-rose-400/45' },
    error: { label: '断了', textClass: 'text-rose-600', ringClass: 'ring-rose-200/85', waveClass: 'bg-rose-400/50' },
  };
  return map[state];
};

const pickSpriteImage = (sprites?: Record<string, string>) => (
  sprites?.normal ||
  sprites?.default ||
  sprites?.idle ||
  sprites?.chibi ||
  Object.values(sprites || {}).find(Boolean) ||
  ''
);

const resolveCharacterCallImage = (char: CharacterProfile | null): { src: string; isPortrait: boolean } => {
  if (!char) return { src: '', isPortrait: false };
  if (char.callPortrait) return { src: char.callPortrait, isPortrait: true };

  if (char.activeSkinSetId && char.dateSkinSets?.length) {
    const activeSkin = char.dateSkinSets.find(skin => skin.id === char.activeSkinSetId);
    const skinSprite = pickSpriteImage(activeSkin?.sprites);
    if (skinSprite) return { src: skinSprite, isPortrait: true };
  }

  const sprite = pickSpriteImage(char.sprites);
  if (sprite) return { src: sprite, isPortrait: true };

  return { src: char.avatar, isPortrait: false };
};

const CALL_FALLBACK_BACKGROUND = [
  'radial-gradient(circle at 46% 18%, rgba(255,255,255,0.82) 0%, rgba(229,239,244,0.70) 28%, transparent 48%)',
  'radial-gradient(circle at 16% 78%, rgba(250,214,226,0.36) 0%, transparent 36%)',
  'radial-gradient(circle at 84% 80%, rgba(189,221,230,0.32) 0%, transparent 38%)',
  'linear-gradient(160deg, #f8fafc 0%, #edf6f8 54%, #f7eef4 100%)',
].join(',');

const CALL_PORTRAIT_BACKGROUND_BASE = [
  'radial-gradient(circle at 50% 14%, rgba(255,255,255,0.92) 0%, rgba(236,244,248,0.76) 34%, transparent 58%)',
  'linear-gradient(180deg, #fbfcff 0%, #eef5f8 54%, #f8eef3 100%)',
].join(',');

const CallAppHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack: () => void;
  right?: React.ReactNode;
}> = ({ title, subtitle, onBack, right }) => (
  <AppHeader
    title={title}
    subtitle={subtitle}
    left={(
      <button
        type="button"
        onClick={onBack}
        aria-label="返回"
        className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-slate-600 hover:bg-black/5 active:scale-90 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
      >
        <CaretLeft size={22} weight="bold" />
      </button>
    )}
    right={right}
    className="bg-white/85 border-slate-100/70"
    titleClassName="truncate text-lg font-semibold tracking-tight text-slate-800"
    subtitleClassName="mt-0.5 truncate text-xs font-normal text-slate-400"
  />
);
const CallApp: React.FC = () => {
  const { closeApp, characters, activeCharacterId, addToast, apiConfig, userProfile, customThemes, realtimeConfig, virtualTime, suspendCall, suspendedCall, clearSuspendedCall } = useOS();

  const [viewMode, setViewMode] = useState<ViewMode>('role-select');
  const [selectedCharId, setSelectedCharId] = useState<string>(activeCharacterId || characters[0]?.id || '');
  const [recordDetailId, setRecordDetailId] = useState<string>('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [bubbles, setBubbles] = useState<CallBubble[]>([]);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `call-${Date.now()}`);
  const [draftInput, setDraftInput] = useState('');
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [traceId, setTraceId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showInputPanel, setShowInputPanel] = useState(true);
  const [showCallTranscript, setShowCallTranscript] = useState(false);
  const [showCallTools, setShowCallTools] = useState(false);
  const [editingBubble, setEditingBubble] = useState<CallBubble | null>(null);
  const [editingText, setEditingText] = useState('');
  const [rerollingBubbleId, setRerollingBubbleId] = useState<string | null>(null);
  const [showHangupConfirm, setShowHangupConfirm] = useState(false);
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<CallRecord | null>(null);
  const [voiceLang, setVoiceLang] = useState('');
  const [callScene, setCallScene] = useState('');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const callTouchStartPos = useRef({ x: 0, y: 0 });
  const selectedChar = useMemo(() => characters.find(c => c.id === selectedCharId) || null, [characters, selectedCharId]);
  const selectedCharCallImage = useMemo(() => resolveCharacterCallImage(selectedChar), [selectedChar]);
  const hasPortraitCallImage = Boolean(selectedCharCallImage.src && selectedCharCallImage.isPortrait);
  const hasFallbackAvatarImage = Boolean(selectedCharCallImage.src && !selectedCharCallImage.isPortrait);
  const userCallImage = userProfile.callPortrait || userProfile.avatar;
  const userCallUsesPortrait = Boolean(userProfile.callPortrait);
  const recordDetail = useMemo(() => callRecords.find(r => r.id === recordDetailId) || null, [callRecords, recordDetailId]);
  // 从角色聊天主题中提取强调色，用于通话界面的按钮和高亮
  const accentColor = useMemo(() => {
    const themeId = selectedChar?.bubbleStyle || 'default';
    const theme: ChatTheme | undefined = customThemes?.find((t: ChatTheme) => t.id === themeId) || PRESET_THEMES[themeId];
    return theme?.user?.backgroundColor || '#8b5cf6';
  }, [selectedChar?.bubbleStyle, customThemes]);
  const callScrollableRef = useRef<HTMLDivElement | null>(null);
  const resolveVoiceId = () => selectedChar?.voiceProfile?.voiceId?.trim() || '';
  const resolveModel = () => selectedChar?.voiceProfile?.model?.trim() || 'speech-2.8-hd';
  const resolveGroupId = () => (apiConfig.minimaxGroupId || '').trim();
  const buildTtsExtras = () => {
    const vp = selectedChar?.voiceProfile;
    if (!vp) return {};
    const extras: any = {};
    const tw = vp.timberWeights;
    if (tw && tw.length > 1) {
      extras.timber_weights = (() => {
        const totalWeight = tw.reduce((sum: number, t: any) => sum + (t.weight || 0), 0);
        if (totalWeight === 0) return tw.map((t: any) => ({ voice_id: t.voice_id, weight: Math.round(100 / tw.length) }));
        const raw = tw.map((t: any) => ({ voice_id: t.voice_id, weight: Math.round((t.weight / totalWeight) * 100) }));
        const diff = 100 - raw.reduce((s: number, r: any) => s + r.weight, 0);
        if (diff !== 0) raw[0].weight += diff;
        return raw;
      })();
    }
    if (vp.voiceModify) {
      const vm: any = {};
      // Soft-clamp voice_modify to prevent extreme spikes during excited speech
      const sc = (v: number, limit: number) => {
        if (Math.abs(v) <= limit) return v;
        const sign = v > 0 ? 1 : -1;
        return sign * (limit + Math.log1p(Math.abs(v) - limit) * (limit * 0.15));
      };
      if (vp.voiceModify.pitch) vm.pitch = Math.round(sc(vp.voiceModify.pitch, 40));
      if (vp.voiceModify.intensity) vm.intensity = Math.round(sc(vp.voiceModify.intensity, 30));
      if (vp.voiceModify.timbre) vm.timbre = Math.round(sc(vp.voiceModify.timbre, 40));
      if (vp.voiceModify.sound_effects) vm.sound_effects = vp.voiceModify.sound_effects;
      if (Object.keys(vm).length) extras.voice_modify = vm;
    }
    return extras;
  };
  const resolveVoiceSettingFields = () => {
    const vp = selectedChar?.voiceProfile;
    return {
      // Clamp speed & pitch to safe human-like ranges
      speed: Math.max(0.75, Math.min(1.4, vp?.speed ?? 1)),
      vol: Math.max(0.3, Math.min(2, vp?.vol ?? 1)),
      pitch: Math.max(-8, Math.min(8, vp?.pitch ?? 0)),
      ...(vp?.emotion ? { emotion: vp.emotion } : {}),
    };
  };
  // Resume from suspended call — restore bubbles & session state
  useEffect(() => {
    if (suspendedCall && viewMode === 'role-select') {
      setSelectedCharId(suspendedCall.charId);
      setCallStartedAt(suspendedCall.startedAt);
      if (suspendedCall.bubbles?.length) setBubbles(suspendedCall.bubbles);
      if (suspendedCall.sessionId) setCurrentSessionId(suspendedCall.sessionId);
      if (typeof suspendedCall.elapsedSeconds === 'number') setElapsedSeconds(suspendedCall.elapsedSeconds);
      if (suspendedCall.voiceLang) setVoiceLang(suspendedCall.voiceLang);
      if (suspendedCall.callScene) setCallScene(suspendedCall.callScene);
      setViewMode('in-call');
      setCallState('listening');
      clearSuspendedCall();
    }
  }, [suspendedCall]);
  useEffect(() => () => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (!callStartedAt || ['idle', 'ended'].includes(callState)) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [callStartedAt, callState]);
  useEffect(() => {
    callScrollableRef.current?.scrollTo({ top: callScrollableRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles]);
  // 开场白：进入通话后角色自动先开口
  const greetingFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewMode !== 'in-call' || bubbles.length > 0) return;
    if (!selectedChar?.id || greetingFiredRef.current === currentSessionId) return;
    greetingFiredRef.current = currentSessionId;
    (async () => {
      try {
        setCallStartedAt(Date.now());
        setCallState('connecting');
        const greetingText = sanitizeAssistantOutput(await requestAssistantReply('（电话刚接通。系统已经把你此刻所在的场景单独显示给用户。你先开口——像平时接到这个人电话一样自然地说第一句话；不用主动解释你在哪里，也不用为了交代背景而写动作。）'));
        const nowTs = Date.now();
        const greetingBubble: CallBubble = { id: `${nowTs}-greeting`, role: 'assistant', text: greetingText, time: formatTime(), timestamp: nowTs };
        setCallState('speaking');
        setBubbles([greetingBubble]);
        let greetingDbId: number | undefined;
        if (selectedChar?.id) {
          greetingDbId = await DB.saveMessage({ charId: selectedChar.id, role: 'assistant', type: 'text', content: greetingText, timestamp: nowTs, metadata: { source: 'call', callSessionId: currentSessionId } });
          setBubbles(prev => prev.map(b => b.id === greetingBubble.id ? { ...b, dbId: greetingDbId } : b));
        }
        // 尝试语音合成开场白
        const minimaxApiKey = resolveMiniMaxApiKey(apiConfig);
        const voiceId = resolveVoiceId();
        const hasTimberWeights = (selectedChar?.voiceProfile?.timberWeights?.length || 0) > 1;
        let greetingAudioPlayed = false;
        if (isSpeakerOn && minimaxApiKey && (voiceId || hasTimberWeights)) {
          try {
            const groupId = resolveGroupId();
            const { speech: greetingVoiceTag } = extractVoiceTag(greetingText);
            const cleanedGreetingVoice = greetingVoiceTag ? cleanVoiceTagContent(greetingVoiceTag) : '';
            const speechText = insertSpeechBreaks(cleanedGreetingVoice || convertNarrationCues(greetingText));
            const model = resolveModel();
            const ttsPayload: any = {
              model, text: speechText, stream: false, output_format: 'url',
              voice_setting: { voice_id: voiceId, ...resolveVoiceSettingFields() },
              audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 },
              ...(voiceLang ? { language_boost: voiceLang } : {}),
              ...buildTtsExtras(),
            };
            if (groupId) ttsPayload.group_id = groupId;
            const response = await minimaxFetch('/api/minimax/t2a', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${minimaxApiKey}`, 'X-MiniMax-API-Key': minimaxApiKey, ...(groupId ? { 'X-MiniMax-Group-Id': groupId } : {}) },
              body: JSON.stringify(ttsPayload),
            });
            const data = await response.json();
            const rawAudio = data?.data?.audio;
            if (rawAudio && typeof rawAudio === 'string') {
              const normalizedAudio = rawAudio.trim();
              let greetingAudioUrl = '';
              let persistedGreetingAudioUrl = '';
              if (/^https?:\/\//i.test(normalizedAudio)) {
                persistedGreetingAudioUrl = normalizedAudio;
                try { greetingAudioUrl = URL.createObjectURL(await fetchRemoteAudioBlob(normalizedAudio)); } catch { greetingAudioUrl = normalizedAudio; }
              } else {
                greetingAudioUrl = URL.createObjectURL(convertHexAudioToBlob(normalizedAudio, 'audio/mpeg'));
              }
              if (greetingAudioUrl) {
                if (greetingAudioUrl.startsWith('blob:')) currentBlobUrlRef.current = greetingAudioUrl;
                setAudioUrl(greetingAudioUrl);
                setBubbles(prev => prev.map(b => b.id === greetingBubble.id ? { ...b, audioUrl: greetingAudioUrl } : b));
                setTimeout(() => playAudio(greetingAudioUrl), 0);
                greetingAudioPlayed = true;
                if (greetingDbId && persistedGreetingAudioUrl) {
                  await DB.updateMessageMetadata(greetingDbId, { audioUrl: persistedGreetingAudioUrl, ttsTraceId: data?.trace_id || undefined });
                }
              }
            }
          } catch { /* 语音合成失败不影响文字开场白 */ }
        }
        // 有音频播放时由 audio onEnded 回调切换到 listening；无音频时延迟切换，让用户看到 speaking 状态
        if (!greetingAudioPlayed) {
          setTimeout(() => setCallState('listening'), 1500);
        }
      } catch (e: any) {
        setCallState('error');
        setErrorMessage(e?.message || '开场白生成失败');
      }
    })();
  }, [viewMode, currentSessionId]);
  const stopPlayback = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsAudioPlaying(false);
  };
  const loadCallRecords = async (charId?: string) => {
    if (!charId) return setCallRecords([]);
    const all = await DB.getMessagesByCharId(charId);
    const callMsgs = all
      .filter(m => m.metadata?.source === 'call' && m.metadata?.callSessionId)
      .sort((a, b) => a.timestamp - b.timestamp);
    const endMsgs = all
      .filter(m => m.metadata?.source === 'call-end-popup' && m.metadata?.callSessionId)
      .sort((a, b) => a.timestamp - b.timestamp);
    const grouped = new Map<string, Message[]>();
    callMsgs.forEach(m => {
      const sid = String(m.metadata?.callSessionId);
      const arr = grouped.get(sid) || [];
      arr.push(m);
      grouped.set(sid, arr);
    });
    endMsgs.forEach(m => {
      const sid = String(m.metadata?.callSessionId);
      if (!grouped.has(sid)) grouped.set(sid, []);
    });
    const records: CallRecord[] = Array.from(grouped.entries()).map(([sessionId, msgs]) => {
      const endMsg = [...endMsgs].reverse().find(m => String(m.metadata?.callSessionId) === sessionId);
      const endMeta = endMsg?.metadata || {};
      const durationFromEnd = typeof endMeta.durationSec === 'number' ? endMeta.durationSec : undefined;
      const endedAt = typeof endMeta.endedAt === 'number' ? endMeta.endedAt : endMsg?.timestamp;
      const start = msgs[0]?.timestamp || (endedAt && durationFromEnd ? Math.max(0, endedAt - durationFromEnd * 1000) : endMsg?.timestamp) || Date.now();
      const end = endedAt || msgs[msgs.length - 1]?.timestamp || start;
      const transcript = msgs.map(m => ({
        id: `db-${m.id}`,
        dbId: m.id,
        role: m.role as 'user' | 'assistant',
        text: m.content,
        audioUrl: m.metadata?.audioUrl,
        time: formatTimeByTs(m.timestamp),
        timestamp: m.timestamp,
      }));
      return {
        id: sessionId,
        sessionId,
        characterId: charId,
        characterName: endMeta.characterName || selectedChar?.name || '未选择角色',
        characterAvatar: endMeta.characterAvatar || selectedChar?.avatar,
        createdAt: new Date(start).toLocaleString('zh-CN'),
        durationSec: Math.max(1, durationFromEnd ?? Math.floor((end - start) / 1000)),
        turnCount: typeof endMeta.turnCount === 'number' ? endMeta.turnCount : undefined,
        callScene: typeof endMeta.callScene === 'string' ? endMeta.callScene : undefined,
        keepsakeLine: endMeta.keepsakeLine ? cleanCallKeepsakeLine(endMeta.keepsakeLine, endMeta.characterName || selectedChar?.name || '未选择角色') : undefined,
        endedAt: end,
        transcript,
      };
    }).sort((a, b) => (b.endedAt || b.transcript[b.transcript.length - 1]?.timestamp || 0) - (a.endedAt || a.transcript[a.transcript.length - 1]?.timestamp || 0));
    setCallRecords(records);
  };
  const resetCurrentCall = () => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    stopPlayback();
    setCallState('idle');
    setBubbles([]);
    setDraftInput('');
    setAudioUrl('');
    setTraceId('');
    setErrorMessage('');
    setCallStartedAt(null);
    setElapsedSeconds(0);
    setShowInputPanel(true);
    setShowCallTranscript(false);
    setShowCallTools(false);
    setCallScene('');
    setCurrentSessionId(`call-${Date.now()}`);
  };

  const startCallWithCharacter = (charId: string) => {
    const nextChar = characters.find(c => c.id === charId) || selectedChar;
    setSelectedCharId(charId);
    resetCurrentCall();
    setCallScene(buildCallOpeningScene(nextChar || null, virtualTime, Date.now()));
    setViewMode('in-call');
  };

  const finishCall = async () => {
    if (selectedChar?.id) {
      const userTurns = bubbles.filter(b => b.role === 'user').length;
      const keepsakeLine = summarizeKeepsakeLine(bubbles, selectedChar.name);
      const payload = {
        characterId: selectedChar.id,
        characterName: selectedChar.name,
        characterAvatar: selectedChar.avatar,
        durationSec: elapsedSeconds,
        turnCount: userTurns,
        callScene,
        keepsakeLine,
        endedAt: Date.now(),
      };
      await DB.saveMessage({
        charId: selectedChar.id,
        role: 'system',
        type: 'system',
        content: `通话结束 · ${selectedChar.name}｜${formatDuration(elapsedSeconds)}｜${userTurns}轮对话`,
        metadata: { source: 'call-end-popup', callSessionId: currentSessionId, ...payload },
      });
      await loadCallRecords(selectedChar.id);
    }
    clearSuspendedCall();
    resetCurrentCall();
    setViewMode('history');
    setShowHangupConfirm(false);
    addToast('通话记录已保存', 'success');
  };
  const handleHangup = () => {
    setShowHangupConfirm(true);
  };
  const buildHistoryMessages = async (input: string, skipDbId?: number) => {
    if (!selectedChar?.id) return [{ role: 'user', content: input }];
    const limit = selectedChar.contextLimit || 500;
    const allMsgs = await DB.getRecentMessagesByCharId(selectedChar.id, limit);
    const filtered = allMsgs.filter(m => !(skipDbId && m.id === skipDbId) && m.metadata?.source !== 'call-end-popup');
    const history = filtered.map(m => {
      const rawContent = m.type === 'image'
        ? '[用户发送了一张图片]'
        : m.type === 'emoji'
          ? '[发送了一个表情]'
          : m.content;
      const cleanedContent = m.metadata?.source === 'call'
        ? (getCallSpeechText(String(rawContent || '')) || stripCallRecordLabels(String(rawContent || '')))
        : stripCallRecordLabels(String(rawContent || ''));
      return { role: m.role, content: `[${new Date(m.timestamp).toLocaleString('zh-CN')}] ${cleanedContent}` };
    }).filter(m => m.content.trim().replace(/^\[[^\]]+\]\s*/, '').trim());
    const lastMsg = filtered[filtered.length - 1];
    const timeGapHint = ChatPrompts.getTimeGapHint(lastMsg, Date.now());
    const finalInput = timeGapHint ? `${input}\n\n${timeGapHint}` : input;
    return [...history, { role: 'user', content: finalInput }];
  };
  const requestAssistantReply = async (input: string, skipDbId?: number): Promise<string> => {
    const baseUrl = apiConfig.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl) throw new Error('请先在设置里配置聊天 API URL');
    const userName = userProfile?.name?.trim() || '用户';
    let callCoreContext = selectedChar ? ContextBuilder.buildCoreContext(selectedChar, userProfile, true) : undefined;
    if (selectedChar) {
      try {
        const recentForMemory = await DB.getRecentMessagesByCharId(selectedChar.id, selectedChar.contextLimit || 500);
        const worldlineMemory = await selectWorldlineMemoryContext({
          char: selectedChar,
          user: userProfile,
          mode: 'call',
          currentMessages: recentForMemory,
          query: input,
          budgetChars: 1000,
        });
        if (worldlineMemory.markdown) {
          callCoreContext = `${callCoreContext}\n${worldlineMemory.markdown}\n`;
        }
      } catch (error) {
        console.warn('[call] worldline memory unavailable', error);
      }
    }
    const realityContext = await buildRealitySyncContext(realtimeConfig, 'call');
    const systemPrompt = selectedChar
      ? buildCallPrompt(userName, selectedChar.name, callCoreContext, realityContext, voiceLang || undefined, callScene || undefined)
      : buildCallPrompt(userName, undefined, undefined, realityContext, voiceLang || undefined, callScene || undefined);
    const messages = await buildHistoryMessages(input, skipDbId);
    const chatData = await safeFetchJson(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey || 'sk-none'}` },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.85,
        stream: false,
      }),
    });
    const assistantText = chatData?.choices?.[0]?.message?.content?.trim() || '';
    if (!assistantText) throw new Error('文本接口返回为空');
    return assistantText;
  };
  const playAudio = (url?: string) => {
    const targetUrl = url || audioUrl;
    if (!targetUrl || !audioRef.current) return;
    if (audioUrl !== targetUrl) setAudioUrl(targetUrl);
    audioRef.current.src = targetUrl;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => addToast('音频已生成，自动播放被浏览器拦截，请点击重播', 'info'));
    setCallState('speaking');
  };
  const resumeAudio = () => {
    if (!audioRef.current || !audioUrl) return;
    audioRef.current.play().catch(() => addToast('继续播放失败，请点击重播', 'error'));
  };
  const pauseAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setCallState('listening');
  };
  const handleTurn = async () => {
    const minimaxApiKey = resolveMiniMaxApiKey(apiConfig);
    const voiceId = resolveVoiceId();
    const input = draftInput.trim();
    if (!input) return addToast('说点什么吧', 'info');
    if (['connecting', 'thinking'].includes(callState)) return addToast(`${selectedChar?.name || '对方'}还在想，等一等`, 'info');
    if (isAudioPlaying) pauseAudio();
    const nowTs = Date.now();
    const now = formatTime();
    const userBubble: CallBubble = { id: `${nowTs}-u`, role: 'user', text: input, time: now, timestamp: nowTs };
    setBubbles(prev => [...prev, userBubble]);
    setDraftInput('');
    let userDbId: number | undefined;
    if (selectedChar?.id) {
      userDbId = await DB.saveMessage({ charId: selectedChar.id, role: 'user', type: 'text', content: input, timestamp: nowTs, metadata: { source: 'call', callSessionId: currentSessionId } });
      setBubbles(prev => prev.map(b => (b.id === userBubble.id ? { ...b, dbId: userDbId } : b)));
    }
    if (!callStartedAt) setCallStartedAt(Date.now());
    setCallState('connecting');
    setTraceId('');
    setErrorMessage('');
    let assistantText = '';
    try {
      setCallState('thinking');
      assistantText = sanitizeAssistantOutput(await requestAssistantReply(input, userDbId));
    } catch (err: any) {
      setErrorMessage(err?.message || '文本回复失败');
      setCallState('error');
      return addToast(`文本回复失败：${err?.message || '未知错误'}`, 'error');
    }
    const assistantTs = Date.now();
    const assistantBubbleId = `${assistantTs}-a`;
    const assistantBubble: CallBubble = { id: assistantBubbleId, role: 'assistant', text: assistantText, time: formatTime(), timestamp: assistantTs };
    setBubbles(prev => [...prev, assistantBubble]);
    let assistantDbId: number | undefined;
    if (selectedChar?.id) {
      assistantDbId = await DB.saveMessage({ charId: selectedChar.id, role: 'assistant', type: 'text', content: assistantText, timestamp: assistantTs, metadata: { source: 'call', callSessionId: currentSessionId } });
      setBubbles(prev => prev.map(b => {
        if (b.id === assistantBubbleId) return { ...b, dbId: assistantDbId };
        return b;
      }));
    }
    const hasTimberWeights2 = (selectedChar?.voiceProfile?.timberWeights?.length || 0) > 1;
    if (!isSpeakerOn || !minimaxApiKey || (!voiceId && !hasTimberWeights2)) {
      setCallState('listening');
      if (isSpeakerOn && !voiceId && !hasTimberWeights2) addToast('语音未配置，先用文字聊吧', 'info');
      return;
    }
    try {
      const groupId = resolveGroupId();
      const { speech: voiceTagText } = extractVoiceTag(assistantText);
      const cleanedVoiceTag = voiceTagText ? cleanVoiceTagContent(voiceTagText) : '';
      const speechText = insertSpeechBreaks(cleanedVoiceTag || convertNarrationCues(assistantText));
      const model = resolveModel();
      if (!speechText.trim()) throw new Error('可朗读文本为空');

      const synthesizeChunk = async (chunk: string, idx = 0, total = 1): Promise<{ blob?: Blob; remoteUrl?: string; traceId: string; sourceUrl?: string }> => {
        const ttsPayload: any = {
          model,
          text: chunk,
          stream: false,
          output_format: 'url',
          voice_setting: { voice_id: voiceId, ...resolveVoiceSettingFields() },
          audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 },
          ...(voiceLang ? { language_boost: voiceLang } : {}),
          ...buildTtsExtras(),
        };
        if (groupId) ttsPayload.group_id = groupId;

        const response = await minimaxFetch('/api/minimax/t2a', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${minimaxApiKey}`,
            'X-MiniMax-API-Key': minimaxApiKey,
            ...(groupId ? { 'X-MiniMax-Group-Id': groupId } : {}),
          },
          body: JSON.stringify(ttsPayload),
        });
        const data = await response.json();
        const statusCode = data?.base_resp?.status_code;
        if (!response.ok || (typeof statusCode === 'number' && statusCode !== 0)) {
          throw new Error(buildMiniMaxErrorMessage(data?.base_resp?.status_msg || `调用失败（HTTP ${response.status}）`, data?.trace_id));
        }

        const rawAudio = data?.data?.audio;
        if (!rawAudio || typeof rawAudio !== 'string') throw new Error('接口返回里没有音频数据');
        const normalizedAudio = rawAudio.trim();
        const traceId = data?.trace_id || '';
        console.log('[call] tts chunk response', {
          chunk_index: idx,
          chunk_count: total,
          chunk_length: chunk.length,
          trace_id: traceId,
          audio_type: typeof data?.data?.audio,
          audio_preview: normalizedAudio.slice(0, 80),
        });

        if (/^https?:\/\//i.test(normalizedAudio)) {
          try {
            return { blob: await fetchRemoteAudioBlob(normalizedAudio), traceId, sourceUrl: normalizedAudio };
          } catch (downloadErr: any) {
            if (total === 1) {
              console.warn('[call] tts remote audio fetch failed, fallback to direct remote url', downloadErr?.message || downloadErr);
              return { remoteUrl: normalizedAudio, traceId, sourceUrl: normalizedAudio };
            }
            throw downloadErr;
          }
        }
        return { blob: convertHexAudioToBlob(normalizedAudio, 'audio/mpeg'), traceId };
      };

      const traceIds: string[] = [];
      const audioBlobs: Blob[] = [];
      let finalUrl = '';
      let persistedAudioUrl = '';

      console.log('[call] tts request(full)', {
        model,
        voice_id: voiceId,
        group_id: groupId,
        assistant_text_length: assistantText.length,
        speech_text_length: speechText.length,
        speech_text_preview: speechText.slice(0, 120),
      });

      try {
        const singleResult = await synthesizeChunk(speechText, 0, 1);
        if (singleResult.traceId) traceIds.push(singleResult.traceId);
        if (singleResult.sourceUrl) persistedAudioUrl = singleResult.sourceUrl;
        if (singleResult.remoteUrl) {
          finalUrl = singleResult.remoteUrl;
        } else if (singleResult.blob) {
          finalUrl = URL.createObjectURL(singleResult.blob);
        } else {
          throw new Error('未获得可播放音频');
        }
      } catch (singleErr: any) {
        const textChunks = splitTextForTts(speechText, 120);
        if (!textChunks.length) throw singleErr;
        if (textChunks.length > 1) addToast('语音生成中，稍等一下', 'info');
        if (textChunks.length > 20) addToast('这段话比较长，多等一会儿', 'info');
        console.warn('[call] tts single-shot failed, fallback to chunk mode', singleErr?.message || singleErr);

        for (let idx = 0; idx < textChunks.length; idx += 1) {
          const result = await synthesizeChunk(textChunks[idx], idx, textChunks.length);
          if (result.traceId) traceIds.push(result.traceId);
          if (result.remoteUrl) {
            finalUrl = result.remoteUrl;
            persistedAudioUrl = result.sourceUrl || result.remoteUrl;
            break;
          }
          if (result.blob) audioBlobs.push(result.blob);
        }
        if (!finalUrl) {
          if (!audioBlobs.length) throw new Error('未获得可播放音频');
          finalUrl = URL.createObjectURL(audioBlobs.length === 1 ? audioBlobs[0] : new Blob(audioBlobs, { type: 'audio/mpeg' }));
        }
      }

      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      if (finalUrl.startsWith('blob:')) currentBlobUrlRef.current = finalUrl;
      setAudioUrl(finalUrl);
      setTimeout(() => playAudio(finalUrl), 0);
      setTraceId(traceIds.filter(Boolean).join(' | '));
      console.log('[call] tts response merged', {
        trace_ids: traceIds,
        playback_url_type: finalUrl.startsWith('blob:') ? 'blob' : 'remote',
      });
      setBubbles(prev => prev.map(b => (b.id === assistantBubbleId ? { ...b, audioUrl: finalUrl } : b)));
      if (assistantDbId) {
        await DB.updateMessageMetadata(assistantDbId, {
          audioUrl: persistedAudioUrl || undefined,
          ttsTraceId: traceIds.filter(Boolean).join(' | ') || undefined,
        });
      }
      setCallState('listening');
    } catch (e: any) {
      setErrorMessage(e?.message || '语音生成失败');
      setCallState('error');
      addToast(`TTS失败：${e?.message || '语音生成失败'}，已保留文本回复`, 'error');
    }
  };
  const sendingBusy = ['connecting', 'thinking'].includes(callState);
  const displayCallState: CallState = isAudioPlaying ? 'speaking' : callState;
  const callStateStyles = getCallStateStyles(displayCallState);
  const latestAssistantAudio = [...bubbles].reverse().find(b => b.role === 'assistant' && b.audioUrl)?.audioUrl;
  const latestBubble = bubbles[bubbles.length - 1];
  const latestCaption = getCallBubbleDisplayText(latestBubble);
  const idleCaption = callState === 'connecting'
    ? `${selectedChar?.name || '对方'}正在接听……`
    : selectedChar?.name ? `${selectedChar.name}在等你开口……` : '对方在等你开口……';
  useEffect(() => {
    loadCallRecords(selectedCharId);
  }, [selectedCharId]);
  const handleDeleteRecord = async (record: CallRecord) => {
    setDeleteConfirmRecord(record);
  };

  const confirmDeleteRecord = async () => {
    const record = deleteConfirmRecord;
    if (!record) return;
    setDeleteConfirmRecord(null);
    const all = await DB.getMessagesByCharId(record.characterId);
    // 删除通话消息 + 聊天页的通话总结卡片
    const ids = all.filter(m => {
      if (m.metadata?.source === 'call' && m.metadata?.callSessionId === record.sessionId) return true;
      if (m.metadata?.source === 'call-end-popup' && m.metadata?.callSessionId === record.sessionId) return true;
      return false;
    }).map(m => m.id);
    if (ids.length) await DB.deleteMessages(ids);
    if (recordDetailId === record.id) {
      setRecordDetailId('');
      setViewMode('history');
    }
    await loadCallRecords(record.characterId);
    addToast('通话记录已删除', 'success');
  };
  const startEditBubble = (bubble: CallBubble) => {
    if (bubble.role !== 'user') return;
    setEditingBubble(bubble);
    setEditingText(bubble.text);
  };
  const saveEditedBubble = async () => {
    if (!editingBubble) return;
    const next = editingText.trim();
    if (!next) return addToast('内容不能为空', 'error');
    setBubbles(prev => prev.map(b => b.id === editingBubble.id ? { ...b, text: next } : b));
    if (editingBubble.dbId) await DB.updateMessage(editingBubble.dbId, next);
    setEditingBubble(null);
    setEditingText('');
    addToast('已更新发言', 'success');
  };
  const handleRerollAssistant = async (bubble: CallBubble) => {
    if (!selectedChar || bubble.role !== 'assistant') return;
    const idx = bubbles.findIndex(b => b.id === bubble.id);
    if (idx <= 0) return;
    const prevUser = bubbles[idx - 1];
    if (!prevUser || prevUser.role !== 'user') return;
    try {
      setRerollingBubbleId(bubble.id);
      setCallState('thinking');
      const rerolled = sanitizeAssistantOutput(await requestAssistantReply(prevUser.text, bubble.dbId));
      setBubbles(prev => prev.map(b => b.id === bubble.id ? { ...b, text: rerolled, audioUrl: undefined } : b));
      if (bubble.dbId) await DB.updateMessage(bubble.dbId, rerolled);
      if (bubble.dbId) await DB.updateMessageMetadata(bubble.dbId, { audioUrl: undefined, ttsTraceId: undefined });
      addToast('台词已重 roll', 'success');

      // Synthesize voice for the rerolled text (same logic as handleTurn)
      const minimaxApiKey = resolveMiniMaxApiKey(apiConfig);
      const voiceId = resolveVoiceId();
      const hasTimberWeights = (selectedChar?.voiceProfile?.timberWeights?.length || 0) > 1;
      if (isSpeakerOn && minimaxApiKey && (voiceId || hasTimberWeights)) {
        try {
          setCallState('speaking');
          const groupId = resolveGroupId();
          const { speech: voiceTagText } = extractVoiceTag(rerolled);
          const cleanedVoiceTag = voiceTagText ? cleanVoiceTagContent(voiceTagText) : '';
          const speechText = insertSpeechBreaks(cleanedVoiceTag || convertNarrationCues(rerolled));
          if (speechText.trim()) {
            const model = resolveModel();
            const ttsPayload: any = {
              model, text: speechText, stream: false, output_format: 'url',
              voice_setting: { voice_id: voiceId, ...resolveVoiceSettingFields() },
              audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 },
              ...(voiceLang ? { language_boost: voiceLang } : {}),
              ...buildTtsExtras(),
            };
            if (groupId) ttsPayload.group_id = groupId;
            const response = await minimaxFetch('/api/minimax/t2a', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${minimaxApiKey}`,
                'X-MiniMax-API-Key': minimaxApiKey,
                ...(groupId ? { 'X-MiniMax-Group-Id': groupId } : {}),
              },
              body: JSON.stringify(ttsPayload),
            });
            const data = await response.json();
            const rawAudio = data?.data?.audio;
            if (rawAudio && typeof rawAudio === 'string') {
              const normalizedAudio = rawAudio.trim();
              let rerollAudioUrl = '';
              let persistedRerollAudioUrl = '';
              if (/^https?:\/\//i.test(normalizedAudio)) {
                persistedRerollAudioUrl = normalizedAudio;
                try { rerollAudioUrl = URL.createObjectURL(await fetchRemoteAudioBlob(normalizedAudio)); } catch { rerollAudioUrl = normalizedAudio; }
              } else {
                rerollAudioUrl = URL.createObjectURL(convertHexAudioToBlob(normalizedAudio, 'audio/mpeg'));
              }
              if (rerollAudioUrl) {
                if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
                if (rerollAudioUrl.startsWith('blob:')) currentBlobUrlRef.current = rerollAudioUrl;
                setAudioUrl(rerollAudioUrl);
                setBubbles(prev => prev.map(b => b.id === bubble.id ? { ...b, audioUrl: rerollAudioUrl } : b));
                setTimeout(() => playAudio(rerollAudioUrl), 0);
                if (bubble.dbId && persistedRerollAudioUrl) {
                  await DB.updateMessageMetadata(bubble.dbId, { audioUrl: persistedRerollAudioUrl, ttsTraceId: data?.trace_id || undefined });
                }
              }
            }
          }
        } catch (ttsErr: any) {
          console.warn('[call] reroll TTS failed:', ttsErr?.message);
          addToast('语音合成失败，已保留文本', 'info');
        }
      }
      setCallState('listening');
    } catch (e: any) {
      setCallState('error');
      addToast(`重 roll 失败：${e?.message || '未知错误'}`, 'error');
    } finally {
      setRerollingBubbleId(null);
    }
  };
  if (viewMode === 'role-select') {
    return (
      <div className="h-full w-full bg-slate-50 text-slate-900 flex flex-col">
        <AppHeader
          title="电话"
          subtitle={`${characters.length} 位联系人`}
          onBack={closeApp}
          className="bg-white/80 border-slate-100/70"
          titleClassName="truncate text-xl font-semibold tracking-tight text-slate-800"
          subtitleClassName="mt-0.5 truncate text-xs font-normal text-slate-400"
          right={<button onClick={() => setViewMode('history')} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">记录</button>}
        />
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-slate-100">
          {characters.map(char => (
            <button
              key={char.id}
              onClick={() => startCallWithCharacter(char.id)}
              className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition last:border-b-0 active:bg-slate-50"
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-slate-100">
                {char.avatar ? <img src={char.avatar} alt={char.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-400">{char.name?.[0] || '角'}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-slate-800">{char.name}</div>
              </div>
            </button>
          ))}
          </div>
        </div>
      </div>
    );
  }
  if (viewMode === 'history') {
    return (
      <div className="h-full w-full bg-slate-50 text-slate-900 flex flex-col">
        <CallAppHeader
          title="通话记录"
          onBack={() => setViewMode('role-select')}
          right={<button onClick={() => setViewMode('role-select')} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">新通话</button>}
        />
        <div className="mt-4 flex-1 overflow-y-auto space-y-3 px-5 pb-6">
          {!callRecords.length && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-base font-semibold text-slate-600">还没有通话记录</p>
              <p className="text-sm text-slate-400 mt-1">每一通电话都会留在这里</p>
            </div>
          )}
          {callRecords.map(record => {
            const turnCount = record.turnCount ?? record.transcript.filter(t => t.role === 'user').length;
            const keepsake = cleanCallKeepsakeLine(record.keepsakeLine || summarizeKeepsakeLine(record.transcript, record.characterName), record.characterName);
            return (
            <button key={record.id} onClick={() => { setRecordDetailId(record.id); setViewMode('record-detail'); }} className="w-full rounded-[1.35rem] border border-slate-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-slate-100 shadow-sm ring-1 ring-white">
                  {record.characterAvatar ? (
                    <img src={record.characterAvatar} alt={record.characterName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: `${accentColor}80` }}>{record.characterName[0] || '角'}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[15px] text-slate-800">{record.characterName}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{formatDuration(record.durationSec)} · {turnCount}轮对话</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record); }} className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-400 transition active:scale-95">删除</button>
	              </div>
	              <div className="text-xs text-slate-500 mt-2.5 italic leading-relaxed line-clamp-2">{keepsake}</div>
	              {record.callScene && <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-1">所在 · {record.callScene}</div>}
	              <div className="text-[10px] text-slate-400 mt-1.5">{record.createdAt}</div>
	            </button>
          );})}
        </div>

        {/* Delete confirm overlay */}
        {deleteConfirmRecord && (
          <div className="absolute inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white p-5 shadow-2xl">
              <div className="text-base font-semibold text-slate-800">删除通话记录？</div>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">和 {deleteConfirmRecord.characterName} 的这通通话将被永久删除。</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={() => setDeleteConfirmRecord(null)} className="py-2.5 rounded-2xl border border-slate-200 text-slate-500 transition active:scale-[0.97]">取消</button>
                <button onClick={confirmDeleteRecord} className="py-2.5 rounded-2xl bg-rose-400 text-white font-semibold transition active:scale-[0.97]">删除</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (viewMode === 'record-detail' && recordDetail) {
    return (
      <div className="h-full w-full bg-slate-50 text-slate-900 flex flex-col">
        <CallAppHeader
          title={recordDetail.characterName}
          onBack={() => setViewMode('history')}
          right={<div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">{formatDuration(recordDetail.durationSec)}</div>}
        />
	        <div className="mt-2 text-center px-5">
	          <p className="text-xs text-slate-400 italic">{recordDetail.createdAt}</p>
	          {recordDetail.callScene && (
	            <p className="mx-auto mt-2 max-w-[82%] rounded-full bg-white px-3 py-1.5 text-[11px] leading-relaxed text-slate-400 shadow-sm ring-1 ring-slate-100">
	              所在 · {recordDetail.callScene}
	            </p>
	          )}
	        </div>
        <div className="mt-4 flex-1 overflow-y-auto space-y-2.5 px-5">
          {!recordDetail.transcript.length && (
            <div className="rounded-[1.35rem] border border-slate-100 bg-white p-4 text-center shadow-sm">
              <div className="text-sm font-semibold text-slate-700">这通电话没有留下对白</div>
              <div className="mt-1 text-xs text-slate-400">{recordDetail.keepsakeLine ? cleanCallKeepsakeLine(recordDetail.keepsakeLine, recordDetail.characterName) : '可能是在接通前就断掉了。'}</div>
            </div>
          )}
          {recordDetail.transcript.map(item => {
            const parts = item.role === 'assistant'
              ? splitCallTextParts(item.text)
              : [{ kind: 'speech' as const, text: stripCallRecordLabels(item.text) }].filter(part => part.text);
            return (
              <div key={item.id} className={`flex flex-col ${item.role === 'user' ? 'items-end ml-8' : 'items-start mr-8'}`}>
                <div className="mb-1 text-[10px] text-slate-400">{item.role === 'user' ? '你' : recordDetail.characterName} · {item.time}</div>
                <div className={`flex max-w-full flex-col gap-1.5 ${item.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {parts.length ? parts.map((part, index) => (
                    part.kind === 'cue' ? (
                      <div key={`${item.id}-cue-${index}`} className={`px-1 text-[11px] italic leading-relaxed text-slate-400/85 ${item.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {part.text}
                      </div>
                    ) : (
                      <div
                        key={`${item.id}-speech-${index}`}
                        className={`rounded-[1.25rem] border px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${item.role === 'user' ? 'border-cyan-100 bg-cyan-50/80 text-cyan-900' : 'border-slate-100 bg-white text-slate-700'}`}
                      >
                        {part.text}
                      </div>
                    )
                  )) : (
                    <div className="rounded-[1.25rem] border border-slate-100 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-400 shadow-sm">
                      （没有留下可显示的对白）
                    </div>
                  )}
                </div>
                {!!item.audioUrl && <button onClick={() => playAudio(item.audioUrl)} className="mt-2 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs text-slate-500 transition active:scale-95">重播语音</button>}
              </div>
            );
          })}
        </div>
        <button
          onClick={() => {
            startCallWithCharacter(recordDetail.characterId || selectedCharId);
          }}
          className="mx-5 mb-6 py-3 rounded-2xl mt-4 font-semibold text-white shadow-[0_12px_24px_rgba(79,95,116,0.16)] transition active:scale-[0.98] block"
          style={{ backgroundColor: accentColor }}
        >再打一通</button>
      </div>
    );
  }
  return (
    <div
      className="h-full w-full relative text-slate-800 flex flex-col overflow-hidden"
      style={{ background: hasPortraitCallImage ? CALL_PORTRAIT_BACKGROUND_BASE : CALL_FALLBACK_BACKGROUND }}
    >
      {selectedCharCallImage.src && (
        <div
          className={`absolute inset-0 bg-cover bg-center ${hasPortraitCallImage ? 'scale-110 blur-2xl opacity-[0.18]' : 'scale-125 blur-3xl opacity-[0.18] saturate-125'}`}
          style={{ backgroundImage: `url(${selectedCharCallImage.src})` }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: hasPortraitCallImage
            ? 'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(247,250,252,0.20) 52%, rgba(255,255,255,0.48) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.40) 0%, rgba(244,248,250,0.18) 52%, rgba(255,255,255,0.46) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'linear-gradient(rgba(91,109,132,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(91,109,132,0.18) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[640px] flex-col">
        <div className="px-4 pb-3 flex items-center justify-between" style={{ paddingTop: SHELL_APP_HEADER_CONTENT_TOP }}>
          <div className="w-[76px]" aria-hidden />
          <div className="min-w-0 px-3 text-center">
            <div className="truncate text-sm font-semibold">{selectedChar?.name || '未选择角色'}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">正在通话</div>
          </div>
          <div className="rounded-full border border-slate-200/80 bg-white/[0.72] px-3.5 py-1.5 text-xs font-semibold tabular-nums text-slate-600 shadow-sm backdrop-blur-md">{formatDuration(elapsedSeconds)}</div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className={`absolute inset-0 z-[5] flex items-center justify-center px-4 pt-2 ${hasPortraitCallImage ? 'pb-4' : 'pb-20'}`}>
            {hasPortraitCallImage ? (
              <img
                src={selectedCharCallImage.src}
                alt={selectedChar?.name || ''}
                className="h-full w-full object-contain drop-shadow-[0_18px_42px_rgba(79,95,116,0.22)]"
              />
            ) : hasFallbackAvatarImage ? (
              <div className="relative flex h-[36vh] min-h-[210px] w-[min(68vw,300px)] max-w-[320px] flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-white/85 bg-white/[0.68] p-5 text-center shadow-[0_18px_52px_rgba(79,95,116,0.18)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.72),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.08))]" />
                <div className="relative h-28 w-28 overflow-hidden rounded-[1.75rem] bg-white/70 p-1 shadow-[0_14px_34px_rgba(79,95,116,0.18)] ring-1 ring-white/85">
                  <img
                    src={selectedCharCallImage.src}
                    alt={selectedChar?.name || ''}
                    className="h-full w-full rounded-[1.5rem] object-cover"
                  />
                </div>
                <div className="relative mt-4 text-lg font-semibold tracking-wide text-slate-700">{selectedChar?.name || '联系人'}</div>
                <div className="relative mt-1 text-xs font-medium text-slate-400">通话中</div>
              </div>
            ) : (
              <div className="relative flex h-[34vh] min-h-[200px] w-[min(66vw,290px)] flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-white/85 bg-white/[0.68] p-5 text-center shadow-[0_18px_52px_rgba(79,95,116,0.18)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.72),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.08))]" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] text-3xl font-bold text-white shadow-[0_14px_34px_rgba(79,95,116,0.18)] ring-1 ring-white/85" style={{ background: `linear-gradient(135deg, ${accentColor}90, rgba(255,255,255,0.16))` }}>
                  {selectedChar?.name?.[0] || '角'}
                </div>
                <div className="relative mt-4 text-lg font-semibold tracking-wide text-slate-700">{selectedChar?.name || '联系人'}</div>
                <div className="relative mt-1 text-xs font-medium text-slate-400">通话中</div>
              </div>
            )}
          </div>
          {selectedCharCallImage.src && !selectedCharCallImage.isPortrait && (
            <div className="absolute inset-0 z-0 flex items-center justify-center px-3 pb-6 pt-2 opacity-30 blur-3xl" aria-hidden>
              <img
                src={selectedCharCallImage.src}
                alt=""
                className="h-56 w-56 rounded-[2.5rem] object-cover"
              />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-white/55 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 bg-gradient-to-t from-white/70 to-transparent" />

          <div className={`absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/[0.72] px-3 py-1.5 text-xs shadow-sm backdrop-blur-md ${callStateStyles.textClass} ${callStateStyles.ringClass}`}>
            <span>{callStateStyles.label}</span>
            <div className="flex h-3 items-end gap-1" aria-hidden>
              {[10, 18, 13, 16].map((h, idx) => (
                <span
                  key={`${h}-${idx}`}
                  className={`w-1 rounded-full ${callStateStyles.waveClass} ${displayCallState === 'speaking' ? 'animate-pulse' : ''}`}
                  style={{ height: `${displayCallState === 'speaking' ? h : 6}px`, animationDelay: `${idx * 90}ms` }}
                />
              ))}
            </div>
          </div>

	          <div className="absolute right-4 top-4 z-20 h-20 w-16 overflow-hidden rounded-2xl border border-white/80 bg-white/[0.72] shadow-[0_12px_30px_rgba(79,95,116,0.16)] backdrop-blur-md">
	            {userCallImage ? (
	              <img
                src={userCallImage}
                alt={userProfile.name || '我'}
                className={`h-full w-full ${userCallUsesPortrait ? 'object-contain' : 'object-cover'}`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-bold">{userProfile.name?.[0] || '我'}</div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/45 to-transparent px-2 pb-1.5 pt-4 text-right text-[10px] font-semibold text-white/95">
	              {userProfile.name || '我'}
	            </div>
	          </div>

	          {callScene && (
	            <div className="pointer-events-none absolute left-4 right-4 top-28 z-20 flex justify-center">
	              <div className="max-w-[82%] rounded-full border border-white/80 bg-white/[0.68] px-3.5 py-1.5 text-center text-[11px] leading-relaxed text-slate-500 shadow-[0_8px_24px_rgba(79,95,116,0.12)] backdrop-blur-md">
	                <span className="font-semibold text-slate-400">所在</span>
	                <span className="mx-1 text-slate-300">·</span>
	                <span>{callScene}</span>
	              </div>
	            </div>
	          )}

	          {showCallTranscript ? (
            <div ref={callScrollableRef} className="absolute bottom-3 left-4 right-4 z-20 max-h-[36%] overflow-y-auto rounded-2xl border border-white/80 bg-white/[0.72] p-2.5 shadow-[0_12px_34px_rgba(79,95,116,0.16)] ring-1 ring-slate-200/35 backdrop-blur-xl no-scrollbar">
              {!bubbles.length && (
                <div className="py-1.5 text-center">
                  <p className="text-xs font-semibold text-slate-700">电话已接通</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{idleCaption}</p>
                </div>
              )}
              <div className="space-y-3">
                {bubbles.map((bubble, index) => {
                  const fromBottom = bubbles.length - 1 - index;
                  const isLatest = fromBottom === 0;
                  const line = bubble.text.trim();
                  const opacity = Math.max(0.35, 1 - fromBottom * 0.16);
                  const sizeClass = isLatest ? 'text-sm' : fromBottom === 1 ? 'text-[13px]' : 'text-xs';
                  return (
                    <div
                      key={bubble.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        startEditBubble(bubble);
                      }}
                      onTouchStart={(e) => {
                        if (bubble.role !== 'user') return;
                        callTouchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                        longPressTimerRef.current = window.setTimeout(() => startEditBubble(bubble), 450);
                      }}
                      onTouchMove={(e) => {
                        if (!longPressTimerRef.current) return;
                        const dx = Math.abs(e.touches[0].clientX - callTouchStartPos.current.x);
                        const dy = Math.abs(e.touches[0].clientY - callTouchStartPos.current.y);
                        if (dx > 10 || dy > 10) {
                          window.clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onTouchEnd={() => {
                        if (longPressTimerRef.current) { window.clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                      }}
                      style={{ opacity }}
                      className={bubble.role === 'user' ? 'text-right' : 'text-left'}
                    >
                      <div className="mb-1 text-[10px] text-slate-400">{bubble.role === 'user' ? '你' : selectedChar?.name} · {bubble.time}</div>
                      <div className={`${sizeClass} whitespace-pre-wrap leading-relaxed ${bubble.role === 'user' ? 'text-cyan-700' : 'text-slate-800'}`}>
                        {bubble.role === 'assistant' ? (() => {
                          const { display, voiceText } = extractVoiceTag(line || bubble.text);
                          return <>
                            {renderAssistantLine(display)}
                            {voiceText && <div className="mt-1 text-[11px] text-slate-400 italic">{voiceText}</div>}
                          </>;
                        })() : (line || bubble.text)}
                      </div>
                      {isLatest && bubble.role === 'assistant' && (
                        <div className="mt-2 flex gap-2">
                          {bubble.audioUrl && <button onClick={() => playAudio(bubble.audioUrl)} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs text-slate-500 transition hover:bg-white">重播语音</button>}
                          <button onClick={() => handleRerollAssistant(bubble)} disabled={!!rerollingBubbleId} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs text-slate-500 transition hover:bg-white disabled:opacity-40">{rerollingBubbleId === bubble.id ? '换一种说法…' : '换个说法'}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {errorMessage && <div className="mt-2 text-xs text-rose-500">{errorMessage}</div>}
            </div>
          ) : (
            <div className="pointer-events-none absolute bottom-3 left-4 right-4 z-20 flex justify-center">
              <div className="max-w-[88%] rounded-full border border-white/80 bg-white/[0.58] px-3.5 py-1.5 text-center text-[12px] font-medium text-slate-600 shadow-[0_8px_24px_rgba(79,95,116,0.12)] backdrop-blur-md">
                <span className="line-clamp-1">{errorMessage || latestCaption || `电话已接通 · ${idleCaption}`}</span>
              </div>
            </div>
          )}
        </div>

        {showCallTools && (
          <div className="px-4 pb-1">
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/[0.72] px-2.5 py-2 text-xs font-semibold text-slate-600 shadow-[0_10px_26px_rgba(79,95,116,0.12)] backdrop-blur-xl">
              <button
                onClick={() => setShowCallTranscript(prev => !prev)}
                className={`rounded-full px-3 py-1.5 transition active:scale-95 ${showCallTranscript ? 'bg-slate-100 text-slate-700 shadow-inner' : 'bg-white/70 text-slate-600'}`}
              >
                {showCallTranscript ? '收起字幕' : '展开字幕'}
              </button>
              <button
                onClick={() => { setShowLangPicker(true); setShowCallTools(false); }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition active:scale-95 ${voiceLang ? 'bg-amber-100 text-amber-700' : 'bg-white/70 text-slate-600'}`}
              >
                <Translate size={14} weight="bold" />
                翻译
              </button>
              <button
                onClick={() => {
                  const next = !isSpeakerOn;
                  setIsSpeakerOn(next);
                  if (!next && isAudioPlaying) pauseAudio();
                }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition active:scale-95 ${isSpeakerOn ? 'bg-cyan-100 text-cyan-700' : 'bg-rose-100 text-rose-600'}`}
              >
                {isSpeakerOn ? <SpeakerHigh size={14} weight="fill" /> : <SpeakerSlash size={14} weight="fill" />}
                {isSpeakerOn ? '扬声器' : '静音'}
              </button>
            </div>
          </div>
        )}
        {showInputPanel && (
          <div className="px-4 pb-4 pt-1.5">
            <div className="rounded-[1.65rem] border border-white/80 bg-white/[0.72] shadow-[0_10px_26px_rgba(79,95,116,0.12)] backdrop-blur-xl p-1.5 flex items-center gap-2">
              <input
                value={draftInput}
                onChange={(e) => setDraftInput(e.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                placeholder={sendingBusy ? `${selectedChar?.name || '对方'}正在想……` : `想对${selectedChar?.name || '对方'}说什么？`}
                autoFocus
              />
              <button
                type="button"
                onClick={handleTurn}
                disabled={sendingBusy}
                aria-label="发送通话内容"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-100 bg-teal-50 text-teal-600 shadow-[0_8px_18px_rgba(20,184,166,0.14)] transition active:scale-95 disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none"
              >
                {sendingBusy ? <DotsThree size={22} weight="bold" /> : <Microphone size={18} weight="fill" />}
              </button>
              <button
                onClick={() => setShowCallTools(prev => !prev)}
                aria-label="更多通话设置"
                className={`h-9 w-9 shrink-0 rounded-full border flex items-center justify-center shadow-sm transition active:scale-95 ${showCallTools ? 'bg-slate-100 border-slate-200 text-slate-700 shadow-inner' : 'bg-white/75 border-slate-200 text-slate-500'}`}
              >
                <DotsThree size={22} weight="bold" />
              </button>
              <button onClick={handleHangup} aria-label="挂断" className="h-9 w-9 shrink-0 rounded-full border border-rose-200 bg-rose-400 flex items-center justify-center shadow-[0_8px_18px_rgba(139,30,55,0.18)] transition active:scale-95">
                <PhoneDisconnect size={18} weight="fill" className="text-white" />
              </button>
            </div>
          </div>
        )}
      </div>
      <audio
        ref={audioRef}
        src={audioUrl}
        muted={!isSpeakerOn}
        onPlay={() => { setIsAudioPlaying(true); setCallState('speaking'); }}
        onPause={() => { setIsAudioPlaying(false); if (callState === 'speaking') setCallState('listening'); }}
        onEnded={() => { setIsAudioPlaying(false); if (callState === 'speaking') setCallState('listening'); }}
      />
      {showLangPicker && (
        <div className="absolute inset-0 z-[60] flex items-end bg-slate-900/18 px-3 pb-3 backdrop-blur-sm" onClick={() => setShowLangPicker(false)}>
          <div className="mx-auto w-full max-w-[640px] rounded-[1.75rem] border border-white/85 bg-white/[0.92] p-4 shadow-[0_18px_44px_rgba(79,95,116,0.18)] ring-1 ring-slate-200/40 backdrop-blur-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">语音语种</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">选择后，文字仍用中文显示，朗读会切到对应语种。</p>
              </div>
              <button type="button" onClick={() => setShowLangPicker(false)} className="rounded-full border border-slate-100 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm transition active:scale-95">
                收起
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {VOICE_LANG_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => { setVoiceLang(opt.value); setShowLangPicker(false); }}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors active:scale-95 ${voiceLang === opt.value ? 'border-teal-200 bg-teal-50 text-teal-700 shadow-sm' : 'border-slate-100 bg-slate-50/80 text-slate-500 hover:bg-white'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showHangupConfirm && (
        <div className="absolute inset-0 z-[70] bg-slate-900/25 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-slate-800">要挂了吗？</div>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">和{selectedChar?.name || '对方'}聊了 {formatDuration(elapsedSeconds)}，这通电话会保存到通话记录。</p>
            <div className="mt-5 space-y-2">
              <button onClick={() => {
                setShowHangupConfirm(false);
                if (selectedChar) {
                  suspendCall({ charId: selectedChar.id, charName: selectedChar.name, charAvatar: selectedChar.avatar, startedAt: callStartedAt || Date.now(), bubbles, sessionId: currentSessionId, elapsedSeconds, voiceLang, callScene });
                  addToast('通话已挂起，点击顶部绿色条可随时回来', 'success');
                }
              }} className="w-full py-2.5 rounded-2xl bg-emerald-100 text-emerald-700 font-semibold transition active:scale-[0.97] flex items-center justify-center gap-2">
                <span>先忙别的</span><span className="text-xs opacity-70">（挂起通话）</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowHangupConfirm(false)} className="py-2.5 rounded-2xl border border-slate-200 text-slate-500 transition active:scale-[0.97]">再聊会儿</button>
                <button onClick={finishCall} className="py-2.5 rounded-2xl bg-rose-400 text-white font-semibold transition active:scale-[0.97]">挂了吧</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editingBubble && (
        <div className="absolute inset-0 bg-black/60 flex items-end z-50">
          <div className="w-full bg-slate-900 border-t border-white/10 p-5 space-y-3">
            <div className="text-sm text-slate-300">改一下刚才说的话</div>
            <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} className="w-full h-24 bg-black/30 rounded-xl p-3 text-sm outline-none resize-none placeholder:text-slate-600" placeholder="重新措辞……" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setEditingBubble(null)} className="flex-1 py-2.5 rounded-xl border border-white/15 text-slate-300 transition active:scale-[0.97]">算了</button>
              <button onClick={saveEditedBubble} className="flex-1 py-2.5 rounded-xl font-medium text-white transition active:scale-[0.97]" style={{ backgroundColor: accentColor }}>就这样</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CallApp;
