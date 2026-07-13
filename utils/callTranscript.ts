export type CallTranscriptLine = {
  role: 'user' | 'assistant';
  text: string;
};

export type CallTextPart = {
  kind: 'speech' | 'cue';
  text: string;
};

const RECORD_LABEL_PATTERN = /[（(]\s*(?:通话|电话|聊天|约会|对话)\s*记录\s*[）)]/gi;

export const stripCallRecordLabels = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(RECORD_LABEL_PATTERN, '')
    .replace(/^\s*(?:\[\s*(?:通话|电话|聊天|约会|对话)\s*\]\s*)+/gim, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const removeVoiceTag = (raw: string): string => (
  raw.replace(/<[语語]音>[\s\S]*?<\/[语語]音>/g, '').trim()
);

const isCueToken = (part: string): boolean => (
  /^（[^（）\n]{1,48}）$/.test(part) || /^\([^()\n]{1,48}\)$/.test(part)
);

const unwrapCueText = (raw: string): string => (
  raw.replace(/^（|）$/g, '').replace(/^\(|\)$/g, '').trim()
);

export const splitCallTextParts = (raw: string): CallTextPart[] => {
  const display = stripCallRecordLabels(removeVoiceTag(raw || ''));
  if (!display) return [];

  const parts = display.split(/(（[^（）\n]{1,48}）|\([^()\n]{1,48}\)|\n+)/g).filter(Boolean);
  const result: CallTextPart[] = [];

  parts.forEach(part => {
    if (/^\n+$/.test(part)) return;
    const text = stripCallRecordLabels(part).trim();
    if (!text) return;
    if (isCueToken(text)) {
      result.push({ kind: 'cue', text: unwrapCueText(text) });
      return;
    }
    result.push({ kind: 'speech', text });
  });

  return result;
};

export const getCallSpeechText = (raw: string): string => (
  splitCallTextParts(raw)
    .filter(part => part.kind === 'speech')
    .map(part => part.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const splitSentences = (raw: string): string[] => {
  const normalized = stripCallRecordLabels(raw).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  return (normalized.match(/[^。！？!?…]+[。！？!?…]?/g) || [normalized])
    .map(sentence => sentence.trim())
    .filter(Boolean);
};

const normalizeSentence = (raw: string): string => (
  stripCallRecordLabels(raw)
    .replace(/^[“"'「『\s]+|[”"'」』\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const scoreKeepsakeSentence = (sentence: string, order: number): number => {
  const clean = normalizeSentence(sentence);
  if (!clean) return -999;
  if (/^(嗯+|啊+|哦+|喂+|好+|行+|不是+|……+|[.。…]+)$/i.test(clean)) return -60;

  let score = Math.min(order, 20) * 0.18;
  const len = clean.length;
  if (len >= 8 && len <= 42) score += 8;
  if (len > 42 && len <= 70) score += 4;
  if (len < 5) score -= 10;
  if (len > 86) score -= 8;
  if (/想你|喜欢|担心|记得|等你|下次|刚才|电话|晚安|辛苦|加油|别太累|别累|我也|你/.test(clean)) score += 8;
  if (/吗[？?]?$|呢[？?]?$|吧[？?]?$/.test(clean)) score += 1.5;
  if (/挂了|拜拜|再见|先忙|去忙/.test(clean)) score -= 1.5;
  if (/测试|信号|你好你好/.test(clean)) score -= 5;
  return score;
};

export const summarizeCallKeepsakeLine = (transcript: CallTranscriptLine[], charName: string): string => {
  const candidates: Array<{ text: string; score: number }> = [];

  transcript.forEach((line, index) => {
    if (line.role !== 'assistant') return;
    const speech = getCallSpeechText(line.text);
    splitSentences(speech).forEach(sentence => {
      const text = normalizeSentence(sentence);
      if (!text) return;
      candidates.push({ text, score: scoreKeepsakeSentence(text, index) });
    });
  });

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) return `这通电话我会悄悄收藏，下次也记得来找我。 —— ${charName}`;
  const clipped = best.text.length > 48 ? `${best.text.slice(0, 48)}…` : best.text;
  return `“${clipped}” —— ${charName}`;
};

export const cleanCallKeepsakeLine = (raw: unknown, charName: string): string => {
  const cleaned = stripCallRecordLabels(String(raw || ''))
    .replace(/\s+/g, ' ')
    .replace(/“\s*”\s*——\s*[^，。]+$/g, '')
    .trim();
  if (!cleaned || !/[一-龥A-Za-z0-9]/.test(cleaned.replace(/——.*$/, ''))) {
    return `这通电话我会悄悄收藏，下次也记得来找我。 —— ${charName}`;
  }
  return cleaned;
};
