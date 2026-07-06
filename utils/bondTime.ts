import { Message } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const isConversationMessage = (message: Message) => (
  !message.groupId &&
  message.role !== 'system' &&
  Number.isFinite(message.timestamp) &&
  message.timestamp > 0
);

export const getConversationStartedAt = (messages: Message[]): number | null => {
  const timestamps = messages
    .filter(isConversationMessage)
    .map(message => message.timestamp);

  if (timestamps.length === 0) return null;
  return Math.min(...timestamps);
};

export const getBondDaysFromStartedAt = (startedAt: number | null, now = Date.now()) => {
  if (!startedAt) return 0;
  const elapsed = Math.max(0, now - startedAt);
  return Math.max(1, Math.floor(elapsed / DAY_MS) + 1);
};

export const getBondDaysFromMessages = (messages: Message[], now = Date.now()) => (
  getBondDaysFromStartedAt(getConversationStartedAt(messages), now)
);

export const formatBondTimeLabelFromMessages = (messages: Message[], now = Date.now()) => (
  `牵绊时间 ${getBondDaysFromMessages(messages, now)} 天`
);
