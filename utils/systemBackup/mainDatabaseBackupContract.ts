import type { FullBackupData } from '../../types';

/**
 * Every durable object store in AetherOS_Data must be registered here.
 * `verify-whole-device-backup-roundtrip.ts` compares this registry with the
 * concrete STORE_* declarations in utils/db.ts, so adding a store without a
 * backup decision fails the release gate.
 */
export const MAIN_DATABASE_BACKUP_STORES = [
  'characters',
  'messages',
  'themes',
  'emojis',
  'emoji_categories',
  'assets',
  'gallery',
  'user_profile',
  'diaries',
  'tasks',
  'anniversaries',
  'room_todos',
  'room_notes',
  'groups',
  'journal_stickers',
  'social_posts',
  'courses',
  'games',
  'worldbooks',
  'novels',
  'songs',
  'bank_transactions',
  'bank_data',
  'quizzes',
  'guidebook',
  'scheduled_messages',
  'companion_wakeups',
  'companion_wakeup_logs',
  'life_sim',
] as const;

export type MainDatabaseBackupStore = typeof MAIN_DATABASE_BACKUP_STORES[number];
export type SystemBackupMode = 'text_only' | 'media_only' | 'full';

/**
 * Maps one AetherOS_Data store projection into the portable backup envelope.
 * Asset extraction and text/media filtering happen before this function.
 */
export const assignMainDatabaseBackupStore = (
  backupData: Partial<FullBackupData>,
  storeName: MainDatabaseBackupStore,
  processedData: any,
  mode: SystemBackupMode,
): void => {
  switch (storeName) {
    case 'characters':
      if (mode !== 'media_only') backupData.characters = processedData;
      break;
    case 'messages': backupData.messages = processedData; break;
    case 'themes': backupData.customThemes = processedData; break;
    case 'emojis': backupData.savedEmojis = processedData; break;
    case 'emoji_categories': backupData.emojiCategories = processedData; break;
    case 'assets': backupData.assets = processedData; break;
    case 'gallery': backupData.galleryImages = processedData; break;
    case 'user_profile':
      if (processedData[0]) backupData.userProfile = processedData[0];
      break;
    case 'diaries': backupData.diaries = processedData; break;
    case 'tasks': backupData.tasks = processedData; break;
    case 'anniversaries': backupData.anniversaries = processedData; break;
    case 'room_todos': backupData.roomTodos = processedData; break;
    case 'room_notes': backupData.roomNotes = processedData; break;
    case 'groups': backupData.groups = processedData; break;
    case 'journal_stickers': backupData.savedJournalStickers = processedData; break;
    case 'social_posts': backupData.socialPosts = processedData; break;
    case 'courses': backupData.courses = processedData; break;
    case 'games': backupData.games = processedData; break;
    case 'worldbooks': backupData.worldbooks = processedData; break;
    case 'novels': backupData.novels = processedData; break;
    case 'songs': backupData.songs = processedData; break;
    case 'bank_transactions': backupData.bankTransactions = processedData; break;
    case 'bank_data': {
      if (Array.isArray(processedData)) {
        const mainState = processedData.find((entry: any) => entry.id === 'main_state');
        const dollhouseRecord = processedData.find((entry: any) => entry.id === 'dollhouse_state');
        backupData.bankState = mainState ? { ...mainState, id: undefined } : undefined;
        backupData.bankDollhouse = dollhouseRecord?.data || undefined;
      }
      break;
    }
    case 'quizzes': backupData.quizSessions = processedData; break;
    case 'guidebook': backupData.guidebookSessions = processedData; break;
    case 'scheduled_messages': backupData.scheduledMessages = processedData; break;
    case 'companion_wakeups': backupData.companionWakeupRules = processedData; break;
    case 'companion_wakeup_logs': backupData.companionWakeupLogs = processedData; break;
    case 'life_sim':
      backupData.lifeSimState = Array.isArray(processedData)
        ? (processedData[0] || null)
        : (processedData || null);
      break;
  }
};
