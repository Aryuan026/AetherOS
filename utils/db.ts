


import {
    CharacterProfile, ChatTheme, Message, UserProfile,
    Task, Anniversary, DiaryEntry, RoomTodo, RoomNote,
    GalleryImage, FullBackupData, GroupProfile, SocialPost, StudyCourse, GameSession, Worldbook, NovelBook, Emoji, EmojiCategory,
    BankTransaction, SavingsGoal, BankFullState, DollhouseState, SongSheet, QuizSession, GuidebookSession,
    LifeSimState, CompanionWakeupRule, CompanionWakeupLog, MessageType,
    WorldGrowthCandidate, WorldbookGroupAssignment, WorldbookProjectionDeliveryReceipt, WorldGrowthCandidatePlayerReview
} from '../types';
import {
    archiveWorldbookEntry,
    acceptWorldGrowthCandidate,
    getActiveWorldbookRevision,
    normalizeWorldbookEntry,
    reviseWorldbookEntry,
    validateWorldbookGroupAssignment,
    validateWorldGrowthCandidate,
} from '../domain/worldbook/contract';
import { assertWorldbookProjectionDeliveryReceipt } from '../domain/worldbook/projection';
import { normalizeUserPersonaProfile } from './userPersonaMasks';
import { archiveLiveMessage } from './dailyArchive/liveSync';
import {
    archiveDiaryEvidence,
    archiveSocialPostEvidence,
} from './dailyArchive/lifeSurfaceSync';

const DB_NAME = 'AetherOS_Data';
const DB_VERSION = 43; // Player-owned Worldbook group registry

const STORE_CHARACTERS = 'characters';
const STORE_MESSAGES = 'messages';
const STORE_EMOJIS = 'emojis';
const STORE_EMOJI_CATEGORIES = 'emoji_categories'; 
const STORE_THEMES = 'themes';
const STORE_ASSETS = 'assets'; 
const STORE_SCHEDULED = 'scheduled_messages'; 
const STORE_GALLERY = 'gallery';
const STORE_USER = 'user_profile'; 
const STORE_DIARIES = 'diaries';
const STORE_TASKS = 'tasks'; 
const STORE_ANNIVERSARIES = 'anniversaries';
const STORE_ROOM_TODOS = 'room_todos'; 
const STORE_ROOM_NOTES = 'room_notes'; 
const STORE_GROUPS = 'groups'; 
const STORE_JOURNAL_STICKERS = 'journal_stickers';
const STORE_SOCIAL_POSTS = 'social_posts';
const STORE_COURSES = 'courses';
const STORE_GAMES = 'games';
const STORE_WORLDBOOKS = 'worldbooks'; 
const STORE_WORLDBOOK_GROUPS = 'worldbook_groups';
const STORE_WORLDBOOK_GROWTH_CANDIDATES = 'worldbook_growth_candidates';
const STORE_WORLDBOOK_PROJECTION_RECEIPTS = 'worldbook_projection_receipts';
const STORE_NOVELS = 'novels'; 
const STORE_BANK_TX = 'bank_transactions';
const STORE_BANK_DATA = 'bank_data';
const STORE_SONGS = 'songs';
const STORE_QUIZZES = 'quizzes';
const STORE_GUIDEBOOK = 'guidebook';
const STORE_LIFE_SIM = 'life_sim';
const STORE_COMPANION_WAKEUPS = 'companion_wakeups';
const STORE_COMPANION_WAKEUP_LOGS = 'companion_wakeup_logs';

export interface ScheduledMessage {
    id: string;
    charId: string;
    content: string;
    dueAt: number;
    createdAt: number;
    messageType?: MessageType;
    metadata?: Record<string, unknown>;
    notificationPreview?: string;
    deliveryPolicy?: 'fixed' | 'quiet_today';
}

type PublicEmojiSticker = {
    sticker_id?: string;
    id?: string;
    name?: string;
    label?: string;
    display_name?: string;
    asset_file?: string;
    asset_path?: string;
    url?: string;
    tags?: string[];
    desc?: string;
    meaning?: string;
    use_when?: string[];
    avoid_when?: string[];
    status?: string;
};

type PublicEmojiPack = {
    id: string;
    name: string;
    categoryId?: string;
    assetBase?: string;
    visibilityDefault?: 'disabled' | 'all' | 'allowlist';
    defaultAllowedCharacterIds?: string[];
    allowedCharacterIds?: string[];
    stickers?: PublicEmojiSticker[] | Record<string, PublicEmojiSticker>;
};

type PublicEmojiCatalog = {
    schema?: string;
    version?: string;
    assetBase?: string;
    packs?: PublicEmojiPack[];
    stickers?: PublicEmojiSticker[] | Record<string, PublicEmojiSticker>;
};

const PUBLIC_EMOJI_CATALOG_VERSION_KEY = 'aetheros_public_emoji_catalog_version';

const getPublicEmojiCatalogUrl = (): string | null => {
    if (typeof window === 'undefined') return null;
    const base = import.meta.env.BASE_URL || './';
    return new URL('stickers/catalog.json', new URL(base, window.location.href)).toString();
};

const normalizePublicPackId = (id: string): string => id.trim().replace(/[^a-z0-9_-]/gi, '_');

const getPublicCategoryId = (pack: PublicEmojiPack): string => (
    pack.categoryId || `cat_public_${normalizePublicPackId(pack.id)}`
);

const normalizeStickerList = (
    stickers: PublicEmojiPack['stickers'] | PublicEmojiCatalog['stickers'] | undefined,
): PublicEmojiSticker[] => {
    if (!stickers) return [];
    if (Array.isArray(stickers)) return stickers;
    return Object.entries(stickers).map(([id, sticker]) => ({
        ...sticker,
        sticker_id: sticker.sticker_id || sticker.id || id,
    }));
};

const normalizePublicPacks = (catalog: PublicEmojiCatalog): PublicEmojiPack[] => {
    if (Array.isArray(catalog.packs) && catalog.packs.length > 0) {
        return catalog.packs.filter(pack => !!pack.id && !!pack.name);
    }

    const looseStickers = normalizeStickerList(catalog.stickers);
    if (looseStickers.length === 0) return [];

    return [{
        id: 'public-default',
        name: '内置默认表情包',
        visibilityDefault: 'disabled',
        stickers: looseStickers,
    }];
};

const resolveStickerUrl = (
    sticker: PublicEmojiSticker,
    pack: PublicEmojiPack,
    catalog: PublicEmojiCatalog,
    catalogUrl: string,
): string => {
    const directUrl = sticker.url || '';
    if (/^(https?:|data:|blob:)/i.test(directUrl)) return directUrl;
    if (directUrl) return new URL(directUrl, new URL('./', catalogUrl)).toString();

    const assetPath = sticker.asset_path || '';
    if (/^(https?:|data:|blob:)/i.test(assetPath)) return assetPath;
    if (assetPath) return new URL(assetPath, new URL('./', catalogUrl)).toString();

    const assetFile = sticker.asset_file || '';
    if (!assetFile) return '';

    const assetBase = pack.assetBase || catalog.assetBase || 'assets/';
    const normalizedAssetBase = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
    return new URL(assetFile, new URL(normalizedAssetBase, new URL('./', catalogUrl))).toString();
};

const isActivePublicSticker = (sticker: PublicEmojiSticker): boolean => {
    const status = (sticker.status || 'active').toLowerCase();
    return !['deleted', 'inactive', 'unsupported'].includes(status);
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
        console.error("DB Open Error:", request.error);
        reject(request.error);
    };
    
    request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      const createStore = (name: string, options?: IDBObjectStoreParameters) => {
          if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, options);
          }
      };

      createStore(STORE_CHARACTERS, { keyPath: 'id' });
      
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id', autoIncrement: true });
        msgStore.createIndex('charId', 'charId', { unique: false });
        msgStore.createIndex('groupId', 'groupId', { unique: false }); 
      } else {
          const msgStore = (event.target as IDBOpenDBRequest).transaction?.objectStore(STORE_MESSAGES);
          if (msgStore && !msgStore.indexNames.contains(STORE_MESSAGES) && !msgStore.indexNames.contains('groupId')) {
              try {
                  msgStore.createIndex('groupId', 'groupId', { unique: false });
              } catch (e) { console.log('Index already exists'); }
          }
      }
      
      createStore(STORE_EMOJIS, { keyPath: 'name' });
      createStore(STORE_EMOJI_CATEGORIES, { keyPath: 'id' });

      createStore(STORE_THEMES, { keyPath: 'id' });
      createStore(STORE_ASSETS, { keyPath: 'id' });
      
      if (!db.objectStoreNames.contains(STORE_SCHEDULED)) {
        const schedStore = db.createObjectStore(STORE_SCHEDULED, { keyPath: 'id' });
        schedStore.createIndex('charId', 'charId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_GALLERY)) {
          const galleryStore = db.createObjectStore(STORE_GALLERY, { keyPath: 'id' });
          galleryStore.createIndex('charId', 'charId', { unique: false });
      }

      createStore(STORE_USER, { keyPath: 'id' });
      
      if (!db.objectStoreNames.contains(STORE_DIARIES)) {
          const diaryStore = db.createObjectStore(STORE_DIARIES, { keyPath: 'id' });
          diaryStore.createIndex('charId', 'charId', { unique: false });
      }
      
      createStore(STORE_TASKS, { keyPath: 'id' });
      createStore(STORE_ANNIVERSARIES, { keyPath: 'id' });

      if (!db.objectStoreNames.contains(STORE_ROOM_TODOS)) {
          db.createObjectStore(STORE_ROOM_TODOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ROOM_NOTES)) {
          const notesStore = db.createObjectStore(STORE_ROOM_NOTES, { keyPath: 'id' });
          notesStore.createIndex('charId', 'charId', { unique: false });
      }

      createStore(STORE_GROUPS, { keyPath: 'id' });
      createStore(STORE_JOURNAL_STICKERS, { keyPath: 'name' });
      createStore(STORE_SOCIAL_POSTS, { keyPath: 'id' });
      createStore(STORE_COURSES, { keyPath: 'id' });
      createStore(STORE_GAMES, { keyPath: 'id' }); 
      createStore(STORE_WORLDBOOKS, { keyPath: 'id' }); 
      createStore(STORE_WORLDBOOK_GROUPS, { keyPath: 'id' });
      createStore(STORE_WORLDBOOK_GROWTH_CANDIDATES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_WORLDBOOK_PROJECTION_RECEIPTS)) {
          const receiptStore = db.createObjectStore(STORE_WORLDBOOK_PROJECTION_RECEIPTS, { keyPath: 'id' });
          receiptStore.createIndex('scopeKey', 'scopeKey', { unique: false });
      } else {
          const receiptStore = (event.target as IDBOpenDBRequest).transaction
              ?.objectStore(STORE_WORLDBOOK_PROJECTION_RECEIPTS);
          if (receiptStore && !receiptStore.indexNames.contains('scopeKey')) {
              receiptStore.createIndex('scopeKey', 'scopeKey', { unique: false });
          }
      }
      createStore(STORE_NOVELS, { keyPath: 'id' });
      
      createStore(STORE_BANK_TX, { keyPath: 'id' });
      createStore(STORE_BANK_DATA, { keyPath: 'id' });
      createStore(STORE_SONGS, { keyPath: 'id' });
      createStore(STORE_QUIZZES, { keyPath: 'id' });
      createStore(STORE_GUIDEBOOK, { keyPath: 'id' });
      createStore(STORE_LIFE_SIM, { keyPath: 'id' });

      if (!db.objectStoreNames.contains(STORE_COMPANION_WAKEUPS)) {
          const wakeStore = db.createObjectStore(STORE_COMPANION_WAKEUPS, { keyPath: 'id' });
          wakeStore.createIndex('charId', 'charId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_COMPANION_WAKEUP_LOGS)) {
          const wakeLogStore = db.createObjectStore(STORE_COMPANION_WAKEUP_LOGS, { keyPath: 'id' });
          wakeLogStore.createIndex('charId', 'charId', { unique: false });
          wakeLogStore.createIndex('ruleId', 'ruleId', { unique: false });
      }
    };
  });
};

const nextDailyArchiveRevision = (message: Message): Message => ({
    ...message,
    metadata: {
        ...(message.metadata || {}),
        dailyArchiveRevision: Number(message.metadata?.dailyArchiveRevision || 1) + 1,
    },
});

const reconcileLiveMessageWithDailyArchive = async (
    message: Message | undefined,
    status: 'active' | 'tombstoned',
): Promise<void> => {
    if (!message) return;
    try {
        await archiveLiveMessage({ message, status });
    } catch (error) {
        // Chat storage is authoritative for the live write. The daily archive is
        // independently repairable and must never make edit/delete unusable.
        console.warn(`Daily archive ${status} reconciliation failed`, error);
    }
};

const asError = (value: unknown, fallback: string): Error => (
    value instanceof Error ? value : new Error(fallback)
);

const refreshMountedWorldbookCache = (
    character: CharacterProfile,
    entry: Worldbook,
): CharacterProfile | null => {
    if (!character.mountedWorldbooks?.some(mounted => mounted.id === entry.id)) return null;
    const publicationStatus = getActiveWorldbookRevision(entry).publicationStatus;
    const mountedWorldbooks = character.mountedWorldbooks.map(mounted => (
        mounted.id === entry.id
            ? {
                id: entry.id,
                title: entry.title,
                content: entry.content,
                category: entry.category,
                publicationStatus,
            }
            : mounted
    ));
    return { ...character, mountedWorldbooks };
};

/**
 * Commits one Worldbook revision and every affected portability cache in the
 * same IndexedDB transaction. Mount membership itself is never changed here.
 */
const persistWorldbookWithMountedCaches = async (
    rawEntry: Worldbook,
    expectedActiveRevisionId: string | null,
): Promise<CharacterProfile[]> => {
    const entry = normalizeWorldbookEntry(rawEntry);
    const db = await openDB();
    const transaction = db.transaction([STORE_WORLDBOOKS, STORE_CHARACTERS], 'readwrite');
    const worldbookStore = transaction.objectStore(STORE_WORLDBOOKS);
    const characterStore = transaction.objectStore(STORE_CHARACTERS);
    const entryRequest = worldbookStore.get(entry.id);
    const characterRequest = characterStore.getAll();

    return new Promise((resolve, reject) => {
        let existingLoaded = false;
        let charactersLoaded = false;
        let existing: Worldbook | undefined;
        let characters: CharacterProfile[] = [];
        let changedCharacters: CharacterProfile[] = [];
        let failure: Error | undefined;
        let writesQueued = false;

        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try {
                transaction.abort();
            } catch {
                reject(failure);
            }
        };

        const queueWrites = () => {
            if (writesQueued || !existingLoaded || !charactersLoaded) return;
            writesQueued = true;
            try {
                if (expectedActiveRevisionId === null && existing) {
                    throw new Error(`Worldbook ${entry.id} already exists`);
                }
                if (typeof expectedActiveRevisionId === 'string') {
                    if (!existing) throw new Error(`Worldbook ${entry.id} is missing`);
                    const current = normalizeWorldbookEntry(existing);
                    if (current.activeRevisionId !== expectedActiveRevisionId) {
                        throw new Error(`Worldbook ${entry.id} active revision is stale`);
                    }
                }
                changedCharacters = characters
                    .map(character => refreshMountedWorldbookCache(character, entry))
                    .filter((character): character is CharacterProfile => Boolean(character));
                worldbookStore.put(entry);
                changedCharacters.forEach(character => characterStore.put(character));
            } catch (error) {
                abortWith(error, `Worldbook ${entry.id} transaction failed`);
            }
        };

        entryRequest.onsuccess = () => {
            existing = entryRequest.result as Worldbook | undefined;
            existingLoaded = true;
            queueWrites();
        };
        entryRequest.onerror = () => abortWith(entryRequest.error, 'Worldbook lookup failed');
        characterRequest.onsuccess = () => {
            characters = (characterRequest.result || []) as CharacterProfile[];
            charactersLoaded = true;
            queueWrites();
        };
        characterRequest.onerror = () => abortWith(characterRequest.error, 'Character cache lookup failed');
        transaction.oncomplete = () => resolve(changedCharacters);
        transaction.onerror = () => {
            failure ??= asError(transaction.error, `Worldbook ${entry.id} transaction failed`);
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, `Worldbook ${entry.id} transaction aborted`),
        );
    });
};

/**
 * Creates one import batch in a single transaction. These are new, unmounted
 * library entries, so no character portability cache is eligible to change.
 */
const persistNewWorldbookEntriesAtomically = async (
    rawEntries: readonly Worldbook[],
): Promise<void> => {
    if (!rawEntries.length) throw new Error('Worldbook batch creation requires at least one entry');
    const entries = rawEntries.map(normalizeWorldbookEntry);
    const entryIds = entries.map(entry => entry.id);
    if (new Set(entryIds).size !== entryIds.length) {
        throw new Error('Worldbook batch contains duplicate entry ids');
    }

    const db = await openDB();
    const transaction = db.transaction(STORE_WORLDBOOKS, 'readwrite');
    const store = transaction.objectStore(STORE_WORLDBOOKS);
    const existingRequest = store.getAllKeys();

    return new Promise((resolve, reject) => {
        let failure: Error | undefined;
        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try {
                transaction.abort();
            } catch {
                reject(failure);
            }
        };

        existingRequest.onsuccess = () => {
            try {
                const existingIds = new Set(existingRequest.result.map(String));
                const collision = entryIds.find(id => existingIds.has(id));
                if (collision) throw new Error(`Worldbook ${collision} already exists`);
                entries.forEach(entry => store.put(entry));
            } catch (error) {
                abortWith(error, 'Worldbook batch creation failed');
            }
        };
        existingRequest.onerror = () => abortWith(
            existingRequest.error,
            'Worldbook batch collision check failed',
        );
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'Worldbook batch creation failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'Worldbook batch creation aborted'),
        );
    });
};

const persistCharacterDeletionWithOwnedWorldbookArchive = async (input: {
    charId: string;
    groups: readonly WorldbookGroupAssignment[];
    entries: readonly {
        entry: Worldbook;
        expectedActiveRevisionId: string;
    }[];
}): Promise<void> => {
    const groups = input.groups.map(group => {
        const normalized = {
            ...group,
            id: group.id.trim(),
            name: group.name.trim(),
            owner: group.owner.kind === 'character'
                ? { kind: 'character' as const, charId: group.owner.charId.trim() }
                : { kind: 'universal' as const },
        };
        const errors = validateWorldbookGroupAssignment(normalized);
        if (errors.length) throw new Error(`Worldbook group rejected: ${errors.join('; ')}`);
        if (normalized.owner.kind !== 'character' || normalized.owner.charId !== input.charId) {
            throw new Error(`Worldbook group ${normalized.id} is not owned by character ${input.charId}`);
        }
        return normalized;
    });
    const entries = input.entries.map(item => ({
        entry: normalizeWorldbookEntry(item.entry),
        expectedActiveRevisionId: item.expectedActiveRevisionId,
    }));
    entries.forEach(({ entry }) => {
        if (entry.group?.owner.kind !== 'character' || entry.group.owner.charId !== input.charId) {
            throw new Error(`Worldbook ${entry.id} is not owned by character ${input.charId}`);
        }
        if (getActiveWorldbookRevision(entry).publicationStatus !== 'archived') {
            throw new Error(`Worldbook ${entry.id} must be archived before character deletion`);
        }
    });

    const db = await openDB();
    const transaction = db.transaction([
        STORE_CHARACTERS,
        STORE_WORLDBOOKS,
        STORE_WORLDBOOK_GROUPS,
    ], 'readwrite');
    const characterStore = transaction.objectStore(STORE_CHARACTERS);
    const worldbookStore = transaction.objectStore(STORE_WORLDBOOKS);
    const groupStore = transaction.objectStore(STORE_WORLDBOOK_GROUPS);

    return new Promise((resolve, reject) => {
        let failure: Error | undefined;
        let loaded = 0;
        let writesQueued = false;
        const existingById = new Map<string, Worldbook | undefined>();
        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try {
                transaction.abort();
            } catch {
                reject(failure);
            }
        };
        const queueWrites = () => {
            if (writesQueued || loaded !== entries.length) return;
            writesQueued = true;
            try {
                entries.forEach(({ entry, expectedActiveRevisionId }) => {
                    const existing = existingById.get(entry.id);
                    if (!existing) throw new Error(`Worldbook ${entry.id} is missing`);
                    if (normalizeWorldbookEntry(existing).activeRevisionId !== expectedActiveRevisionId) {
                        throw new Error(`Worldbook ${entry.id} changed before character deletion`);
                    }
                    worldbookStore.put(entry);
                });
                groups.forEach(group => groupStore.delete(group.id));
                characterStore.delete(input.charId);
            } catch (error) {
                abortWith(error, 'Character Worldbook cleanup failed');
            }
        };
        if (!entries.length) queueWrites();
        entries.forEach(({ entry }) => {
            const request = worldbookStore.get(entry.id);
            request.onsuccess = () => {
                existingById.set(entry.id, request.result as Worldbook | undefined);
                loaded += 1;
                queueWrites();
            };
            request.onerror = () => abortWith(request.error, `Worldbook ${entry.id} lookup failed`);
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'Character Worldbook cleanup failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'Character Worldbook cleanup aborted'),
        );
    });
};

const persistWorldbookGroupArchive = async (input: {
    group: WorldbookGroupAssignment;
    entries: readonly {
        entry: Worldbook;
        expectedActiveRevisionId: string;
    }[];
}): Promise<CharacterProfile[]> => {
    const group: WorldbookGroupAssignment = {
        ...input.group,
        id: input.group.id.trim(),
        name: input.group.name.trim(),
        owner: input.group.owner.kind === 'character'
            ? { kind: 'character', charId: input.group.owner.charId.trim() }
            : { kind: 'universal' },
    };
    const groupErrors = validateWorldbookGroupAssignment(group);
    if (groupErrors.length) throw new Error(`Worldbook group rejected: ${groupErrors.join('; ')}`);
    if (group.owner.kind !== 'character') {
        throw new Error('通用区不能整组归档，请单独整理其中的条目');
    }
    const ownerCharId = group.owner.charId;
    const entries = input.entries.map(item => ({
        entry: normalizeWorldbookEntry(item.entry),
        expectedActiveRevisionId: item.expectedActiveRevisionId,
    }));
    if (new Set(entries.map(item => item.entry.id)).size !== entries.length) {
        throw new Error('Worldbook group archive contains duplicate entries');
    }
    entries.forEach(({ entry }) => {
        if (entry.group?.id !== group.id) {
            throw new Error(`Worldbook ${entry.id} does not belong to group ${group.id}`);
        }
        if (getActiveWorldbookRevision(entry).publicationStatus !== 'archived') {
            throw new Error(`Worldbook ${entry.id} must be archived before group removal`);
        }
    });

    const db = await openDB();
    const transaction = db.transaction([
        STORE_WORLDBOOKS,
        STORE_WORLDBOOK_GROUPS,
        STORE_CHARACTERS,
    ], 'readwrite');
    const worldbookStore = transaction.objectStore(STORE_WORLDBOOKS);
    const groupStore = transaction.objectStore(STORE_WORLDBOOK_GROUPS);
    const characterStore = transaction.objectStore(STORE_CHARACTERS);
    const storedGroupRequest = groupStore.get(group.id);
    const storedEntriesRequest = worldbookStore.getAll();
    const charactersRequest = characterStore.getAll();

    return new Promise((resolve, reject) => {
        let loaded = 0;
        let writesQueued = false;
        let failure: Error | undefined;
        let storedGroup: WorldbookGroupAssignment | undefined;
        let storedEntries: Worldbook[] = [];
        let characters: CharacterProfile[] = [];
        let changedCharacters: CharacterProfile[] = [];
        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try { transaction.abort(); } catch { reject(failure); }
        };
        const markLoaded = () => {
            loaded += 1;
            if (loaded !== 3 || writesQueued) return;
            writesQueued = true;
            try {
                if (!storedGroup) throw new Error('这个分组已经不存在');
                const sameOwner = storedGroup.owner.kind === 'character'
                    && storedGroup.owner.charId === ownerCharId;
                if (storedGroup.name.trim() !== group.name || !sameOwner) {
                    throw new Error('这个分组已经发生变化，请刷新后再试');
                }
                const storedInGroup = storedEntries
                    .filter(entry => entry.group?.id === group.id)
                    .map(normalizeWorldbookEntry);
                const publishedIds = storedInGroup
                    .filter(entry => getActiveWorldbookRevision(entry).publicationStatus === 'published')
                    .map(entry => entry.id)
                    .sort();
                const incomingIds = entries.map(item => item.entry.id).sort();
                if (JSON.stringify(publishedIds) !== JSON.stringify(incomingIds)) {
                    throw new Error('分组内容已经发生变化，请刷新后再试');
                }
                const storedById = new Map(storedInGroup.map(entry => [entry.id, entry]));
                entries.forEach(({ entry, expectedActiveRevisionId }) => {
                    const stored = storedById.get(entry.id);
                    if (!stored || stored.activeRevisionId !== expectedActiveRevisionId) {
                        throw new Error(`Worldbook ${entry.id} changed before group archive`);
                    }
                    worldbookStore.put(entry);
                });
                changedCharacters = characters
                    .filter(character => character.mountedWorldbookGroupIds?.includes(group.id))
                    .map(character => ({
                        ...character,
                        mountedWorldbookGroupIds: (character.mountedWorldbookGroupIds || [])
                            .filter(groupId => groupId !== group.id),
                    }));
                changedCharacters.forEach(character => characterStore.put(character));
                groupStore.delete(group.id);
            } catch (error) {
                abortWith(error, 'Worldbook group archive failed');
            }
        };
        storedGroupRequest.onsuccess = () => {
            storedGroup = storedGroupRequest.result as WorldbookGroupAssignment | undefined;
            markLoaded();
        };
        storedGroupRequest.onerror = () => abortWith(storedGroupRequest.error, 'Worldbook group lookup failed');
        storedEntriesRequest.onsuccess = () => {
            storedEntries = (storedEntriesRequest.result || []) as Worldbook[];
            markLoaded();
        };
        storedEntriesRequest.onerror = () => abortWith(storedEntriesRequest.error, 'Worldbook group entries lookup failed');
        charactersRequest.onsuccess = () => {
            characters = (charactersRequest.result || []) as CharacterProfile[];
            markLoaded();
        };
        charactersRequest.onerror = () => abortWith(charactersRequest.error, 'Worldbook group characters lookup failed');
        transaction.oncomplete = () => resolve(changedCharacters);
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'Worldbook group archive failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'Worldbook group archive aborted'),
        );
    });
};

const persistWorldbookGroupRestore = async (input: {
    group: WorldbookGroupAssignment;
    entries: readonly {
        entry: Worldbook;
        expectedActiveRevisionId: string;
    }[];
}): Promise<CharacterProfile[]> => {
    const group: WorldbookGroupAssignment = {
        ...input.group,
        id: input.group.id.trim(),
        name: input.group.name.trim(),
        owner: input.group.owner.kind === 'character'
            ? { kind: 'character', charId: input.group.owner.charId.trim() }
            : { kind: 'universal' },
    };
    const groupErrors = validateWorldbookGroupAssignment(group);
    if (groupErrors.length) throw new Error(`Worldbook group rejected: ${groupErrors.join('; ')}`);
    if (group.owner.kind !== 'character') {
        throw new Error('只有角色分组可以整组恢复');
    }
    if (!input.entries.length) throw new Error('这个归档分组里已经没有可恢复的资料');
    const ownerCharId = group.owner.charId;
    const entries = input.entries.map(item => ({
        entry: normalizeWorldbookEntry(item.entry),
        expectedActiveRevisionId: item.expectedActiveRevisionId,
    }));
    if (new Set(entries.map(item => item.entry.id)).size !== entries.length) {
        throw new Error('Worldbook group restore contains duplicate entries');
    }
    entries.forEach(({ entry, expectedActiveRevisionId }) => {
        const entryGroup = entry.group;
        const sameOwner = entryGroup?.owner.kind === 'character'
            && entryGroup.owner.charId === ownerCharId;
        if (entryGroup?.id !== group.id || entryGroup.name !== group.name || !sameOwner) {
            throw new Error(`Worldbook ${entry.id} does not belong to group ${group.id}`);
        }
        const active = getActiveWorldbookRevision(entry);
        const previous = entry.revisionSnapshots?.find(revision => revision.id === expectedActiveRevisionId);
        if (
            active.publicationStatus !== 'published'
            || !active.sourceRefs.some(source => source.kind === 'revision_restore')
            || !previous
            || active.revision !== previous.revision + 1
        ) {
            throw new Error(`Worldbook ${entry.id} is not a valid restored revision`);
        }
    });

    const db = await openDB();
    const transaction = db.transaction([
        STORE_WORLDBOOKS,
        STORE_WORLDBOOK_GROUPS,
        STORE_CHARACTERS,
    ], 'readwrite');
    const worldbookStore = transaction.objectStore(STORE_WORLDBOOKS);
    const groupStore = transaction.objectStore(STORE_WORLDBOOK_GROUPS);
    const characterStore = transaction.objectStore(STORE_CHARACTERS);
    const storedGroupRequest = groupStore.get(group.id);
    const storedEntriesRequest = worldbookStore.getAll();
    const charactersRequest = characterStore.getAll();

    return new Promise((resolve, reject) => {
        let loaded = 0;
        let writesQueued = false;
        let failure: Error | undefined;
        let storedGroup: WorldbookGroupAssignment | undefined;
        let storedEntries: Worldbook[] = [];
        let characters: CharacterProfile[] = [];
        let changedCharacters: CharacterProfile[] = [];
        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try { transaction.abort(); } catch { reject(failure); }
        };
        const markLoaded = () => {
            loaded += 1;
            if (loaded !== 3 || writesQueued) return;
            writesQueued = true;
            try {
                if (!characters.some(character => character.id === ownerCharId)) {
                    throw new Error('原角色已经不存在，暂时不能恢复这组世界书');
                }
                if (storedGroup) {
                    const sameOwner = storedGroup.owner.kind === 'character'
                        && storedGroup.owner.charId === ownerCharId;
                    if (storedGroup.name.trim() !== group.name || !sameOwner) {
                        throw new Error('这个分组名称已经被其他资料使用，请刷新后再试');
                    }
                }
                const storedInGroup = storedEntries
                    .filter(entry => entry.group?.id === group.id)
                    .map(normalizeWorldbookEntry);
                const archivedIds = storedInGroup
                    .filter(entry => getActiveWorldbookRevision(entry).publicationStatus === 'archived')
                    .map(entry => entry.id)
                    .sort();
                const incomingIds = entries.map(item => item.entry.id).sort();
                if (JSON.stringify(archivedIds) !== JSON.stringify(incomingIds)) {
                    throw new Error('归档分组的内容已经发生变化，请刷新后再试');
                }
                const storedById = new Map(storedInGroup.map(entry => [entry.id, entry]));
                entries.forEach(({ entry, expectedActiveRevisionId }) => {
                    const stored = storedById.get(entry.id);
                    if (!stored || stored.activeRevisionId !== expectedActiveRevisionId) {
                        throw new Error(`Worldbook ${entry.id} changed before group restore`);
                    }
                });

                groupStore.put(group);
                entries.forEach(({ entry }) => worldbookStore.put(entry));
                changedCharacters = characters.flatMap(character => {
                    let next = character;
                    let changed = false;
                    entries.forEach(({ entry }) => {
                        const refreshed = refreshMountedWorldbookCache(next, entry);
                        if (!refreshed) return;
                        next = refreshed;
                        changed = true;
                    });
                    return changed ? [next] : [];
                });
                changedCharacters.forEach(character => characterStore.put(character));
            } catch (error) {
                abortWith(error, 'Worldbook group restore failed');
            }
        };
        storedGroupRequest.onsuccess = () => {
            storedGroup = storedGroupRequest.result as WorldbookGroupAssignment | undefined;
            markLoaded();
        };
        storedGroupRequest.onerror = () => abortWith(storedGroupRequest.error, 'Worldbook group lookup failed');
        storedEntriesRequest.onsuccess = () => {
            storedEntries = (storedEntriesRequest.result || []) as Worldbook[];
            markLoaded();
        };
        storedEntriesRequest.onerror = () => abortWith(storedEntriesRequest.error, 'Worldbook group entries lookup failed');
        charactersRequest.onsuccess = () => {
            characters = (charactersRequest.result || []) as CharacterProfile[];
            markLoaded();
        };
        charactersRequest.onerror = () => abortWith(charactersRequest.error, 'Worldbook group characters lookup failed');
        transaction.oncomplete = () => resolve(changedCharacters);
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'Worldbook group restore failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'Worldbook group restore aborted'),
        );
    });
};

type UnassignedWorldbookBatchEntry = {
    entryId: string;
    expectedActiveRevisionId: string;
};

const persistUnassignedWorldbookBatch = async (input: {
    action: 'assign' | 'archive';
    entries: readonly UnassignedWorldbookBatchEntry[];
    changedAt: number;
    group?: WorldbookGroupAssignment;
}): Promise<CharacterProfile[]> => {
    if (!input.entries.length) throw new Error('待归组里已经没有可整理的内容');
    if (new Set(input.entries.map(item => item.entryId)).size !== input.entries.length) {
        throw new Error('待归组整理包含重复条目');
    }
    const group = input.group ? {
        ...input.group,
        id: input.group.id.trim(),
        name: input.group.name.trim(),
        owner: input.group.owner.kind === 'character'
            ? { kind: 'character' as const, charId: input.group.owner.charId.trim() }
            : { kind: 'universal' as const },
    } : undefined;
    if (input.action === 'assign') {
        if (!group) throw new Error('请选择待归组资料要去的分组');
        const errors = validateWorldbookGroupAssignment(group);
        if (errors.length) throw new Error(`Worldbook group rejected: ${errors.join('; ')}`);
    } else if (group) {
        throw new Error('归档待归组资料时不能修改它们的归属');
    }

    const db = await openDB();
    const transaction = db.transaction([
        STORE_WORLDBOOKS,
        STORE_WORLDBOOK_GROUPS,
        STORE_CHARACTERS,
    ], 'readwrite');
    const worldbookStore = transaction.objectStore(STORE_WORLDBOOKS);
    const groupStore = transaction.objectStore(STORE_WORLDBOOK_GROUPS);
    const characterStore = transaction.objectStore(STORE_CHARACTERS);
    const storedEntriesRequest = worldbookStore.getAll();
    const storedGroupsRequest = groupStore.getAll();
    const charactersRequest = characterStore.getAll();

    return new Promise((resolve, reject) => {
        let loaded = 0;
        let writesQueued = false;
        let failure: Error | undefined;
        let storedEntries: Worldbook[] = [];
        let storedGroups: WorldbookGroupAssignment[] = [];
        let characters: CharacterProfile[] = [];
        let changedCharacters: CharacterProfile[] = [];
        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try { transaction.abort(); } catch { reject(failure); }
        };
        const markLoaded = () => {
            loaded += 1;
            if (loaded !== 3 || writesQueued) return;
            writesQueued = true;
            try {
                if (group?.owner.kind === 'character' && !characters.some(character => character.id === group.owner.charId)) {
                    throw new Error('目标角色已经不存在，请重新选择分组');
                }
                if (group) {
                    const storedGroup = storedGroups.find(item => item.id === group.id);
                    if (storedGroup) {
                        const sameOwner = storedGroup.owner.kind === group.owner.kind && (
                            storedGroup.owner.kind === 'universal'
                            || (group.owner.kind === 'character' && storedGroup.owner.charId === group.owner.charId)
                        );
                        if (storedGroup.name.trim() !== group.name || !sameOwner) {
                            throw new Error('目标分组已经发生变化，请刷新后再试');
                        }
                    }
                }
                const storedById = new Map(
                    storedEntries.map(entry => {
                        const normalized = normalizeWorldbookEntry(entry);
                        return [normalized.id, normalized] as const;
                    }),
                );
                const nextEntries = input.entries.map((item, index) => {
                    const stored = storedById.get(item.entryId);
                    if (!stored || stored.activeRevisionId !== item.expectedActiveRevisionId) {
                        throw new Error(`Worldbook ${item.entryId} changed before unassigned repair`);
                    }
                    if (stored.group || stored.isBuiltIn || stored.lockEditing) {
                        throw new Error('待归组内容已经有了归属，请刷新后再试');
                    }
                    if (getActiveWorldbookRevision(stored).publicationStatus !== 'published') {
                        throw new Error('待归组内容已经离开当前书架，请刷新后再试');
                    }
                    const changedAt = Math.max(input.changedAt + index, stored.updatedAt + 1);
                    if (input.action === 'archive') {
                        return archiveWorldbookEntry({
                            current: stored,
                            sourceRef: { kind: 'player', refId: `worldbook-unassigned-archive:${changedAt}:${index}` },
                            archivedAt: changedAt,
                        });
                    }
                    const revised = reviseWorldbookEntry({
                        current: stored,
                        patch: { category: group!.name },
                        sourceRef: { kind: 'player', refId: `worldbook-unassigned-assign:${group!.id}:${changedAt}:${index}` },
                        updatedAt: changedAt,
                    });
                    return { ...revised, category: group!.name, group };
                });
                if (group) groupStore.put(group);
                nextEntries.forEach(entry => worldbookStore.put(entry));
                changedCharacters = characters.flatMap(character => {
                    let next = character;
                    let changed = false;
                    nextEntries.forEach(entry => {
                        const refreshed = refreshMountedWorldbookCache(next, entry);
                        if (!refreshed) return;
                        next = refreshed;
                        changed = true;
                    });
                    return changed ? [next] : [];
                });
                changedCharacters.forEach(character => characterStore.put(character));
            } catch (error) {
                abortWith(error, '待归组内容没有整理成功');
            }
        };
        storedEntriesRequest.onsuccess = () => {
            storedEntries = (storedEntriesRequest.result || []) as Worldbook[];
            markLoaded();
        };
        storedEntriesRequest.onerror = () => abortWith(storedEntriesRequest.error, '待归组内容读取失败');
        storedGroupsRequest.onsuccess = () => {
            storedGroups = (storedGroupsRequest.result || []) as WorldbookGroupAssignment[];
            markLoaded();
        };
        storedGroupsRequest.onerror = () => abortWith(storedGroupsRequest.error, '世界书分组读取失败');
        charactersRequest.onsuccess = () => {
            characters = (charactersRequest.result || []) as CharacterProfile[];
            markLoaded();
        };
        charactersRequest.onerror = () => abortWith(charactersRequest.error, '角色资料读取失败');
        transaction.oncomplete = () => resolve(changedCharacters);
        transaction.onerror = () => {
            failure ??= asError(transaction.error, '待归组内容没有整理成功');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, '待归组整理已取消'),
        );
    });
};

const persistArchivedWorldbookDeletion = async (input: {
    entryIds: readonly string[];
    groupId?: string;
}): Promise<CharacterProfile[]> => {
    const entryIds = [...new Set(input.entryIds)];
    if (!entryIds.length || entryIds.length !== input.entryIds.length) {
        throw new Error('请选择要彻底删除的归档资料');
    }
    const selectedIds = new Set(entryIds);
    const db = await openDB();
    const transaction = db.transaction([
        STORE_WORLDBOOKS,
        STORE_WORLDBOOK_GROUPS,
        STORE_WORLDBOOK_GROWTH_CANDIDATES,
        STORE_WORLDBOOK_PROJECTION_RECEIPTS,
        STORE_CHARACTERS,
    ], 'readwrite');
    const worldbookStore = transaction.objectStore(STORE_WORLDBOOKS);
    const groupStore = transaction.objectStore(STORE_WORLDBOOK_GROUPS);
    const candidateStore = transaction.objectStore(STORE_WORLDBOOK_GROWTH_CANDIDATES);
    const receiptStore = transaction.objectStore(STORE_WORLDBOOK_PROJECTION_RECEIPTS);
    const characterStore = transaction.objectStore(STORE_CHARACTERS);
    const entriesRequest = worldbookStore.getAll();
    const candidatesRequest = candidateStore.getAll();
    const receiptsRequest = receiptStore.getAll();
    const charactersRequest = characterStore.getAll();

    return new Promise((resolve, reject) => {
        let loaded = 0;
        let writesQueued = false;
        let failure: Error | undefined;
        let entries: Worldbook[] = [];
        let candidates: WorldGrowthCandidate[] = [];
        let receipts: WorldbookProjectionDeliveryReceipt[] = [];
        let characters: CharacterProfile[] = [];
        let changedCharacters: CharacterProfile[] = [];
        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try { transaction.abort(); } catch { reject(failure); }
        };
        const markLoaded = () => {
            loaded += 1;
            if (loaded !== 4 || writesQueued) return;
            writesQueued = true;
            try {
                const normalized = entries.map(normalizeWorldbookEntry);
                const selected = normalized.filter(entry => selectedIds.has(entry.id));
                if (selected.length !== selectedIds.size) {
                    throw new Error('归档内容已经发生变化，请刷新后再试');
                }
                selected.forEach(entry => {
                    if (entry.isBuiltIn || entry.lockEditing) {
                        throw new Error('内置世界书不能被彻底删除');
                    }
                    if (getActiveWorldbookRevision(entry).publicationStatus !== 'archived') {
                        throw new Error('只有归档中的世界书才能被彻底删除');
                    }
                    if (input.groupId && entry.group?.id !== input.groupId) {
                        throw new Error('归档分组内容已经发生变化，请刷新后再试');
                    }
                });
                if (input.groupId) {
                    const archivedIdsInGroup = normalized
                        .filter(entry => (
                            entry.group?.id === input.groupId
                            && getActiveWorldbookRevision(entry).publicationStatus === 'archived'
                        ))
                        .map(entry => entry.id)
                        .sort();
                    if (JSON.stringify(archivedIdsInGroup) !== JSON.stringify([...entryIds].sort())) {
                        throw new Error('归档分组内容已经发生变化，请刷新后再试');
                    }
                }
                const deletedRevisionIds = new Set(selected.flatMap(entry => (
                    entry.revisionSnapshots || []
                ).map(revision => revision.id)));
                entryIds.forEach(entryId => worldbookStore.delete(entryId));
                candidates
                    .filter(candidate => (
                        Boolean(candidate.targetEntryId && selectedIds.has(candidate.targetEntryId))
                        || Boolean(candidate.acceptedRevisionId && deletedRevisionIds.has(candidate.acceptedRevisionId))
                    ))
                    .forEach(candidate => candidateStore.delete(candidate.id));
                receipts
                    .filter(receipt => receipt.delivered.some(item => selectedIds.has(item.entryId)))
                    .forEach(receipt => receiptStore.delete(receipt.id));

                const remainingInGroup = input.groupId
                    ? normalized.some(entry => entry.group?.id === input.groupId && !selectedIds.has(entry.id))
                    : true;
                if (input.groupId && !remainingInGroup) groupStore.delete(input.groupId);
                changedCharacters = characters.flatMap(character => {
                    const mountedWorldbooks = (character.mountedWorldbooks || [])
                        .filter(entry => !selectedIds.has(entry.id));
                    const mountedWorldbookGroupIds = input.groupId && !remainingInGroup
                        ? (character.mountedWorldbookGroupIds || []).filter(groupId => groupId !== input.groupId)
                        : character.mountedWorldbookGroupIds;
                    if (
                        mountedWorldbooks.length === (character.mountedWorldbooks || []).length
                        && mountedWorldbookGroupIds?.length === character.mountedWorldbookGroupIds?.length
                    ) return [];
                    return [{ ...character, mountedWorldbooks, mountedWorldbookGroupIds }];
                });
                changedCharacters.forEach(character => characterStore.put(character));
            } catch (error) {
                abortWith(error, '归档资料没有彻底删除成功');
            }
        };
        entriesRequest.onsuccess = () => { entries = (entriesRequest.result || []) as Worldbook[]; markLoaded(); };
        entriesRequest.onerror = () => abortWith(entriesRequest.error, '归档资料读取失败');
        candidatesRequest.onsuccess = () => { candidates = (candidatesRequest.result || []) as WorldGrowthCandidate[]; markLoaded(); };
        candidatesRequest.onerror = () => abortWith(candidatesRequest.error, '世界书整理记录读取失败');
        receiptsRequest.onsuccess = () => { receipts = (receiptsRequest.result || []) as WorldbookProjectionDeliveryReceipt[]; markLoaded(); };
        receiptsRequest.onerror = () => abortWith(receiptsRequest.error, '世界书递送记录读取失败');
        charactersRequest.onsuccess = () => { characters = (charactersRequest.result || []) as CharacterProfile[]; markLoaded(); };
        charactersRequest.onerror = () => abortWith(charactersRequest.error, '角色挂载读取失败');
        transaction.oncomplete = () => resolve(changedCharacters);
        transaction.onerror = () => { failure ??= asError(transaction.error, '归档资料没有彻底删除成功'); };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, '归档资料彻底删除已取消'),
        );
    });
};

const persistAcceptedWorldGrowthCandidate = async (input: {
    entry: Worldbook;
    candidate: WorldGrowthCandidate;
    reviewedDraft?: WorldGrowthCandidatePlayerReview;
    expectedBaseRevisionId: string | null;
    expectedCandidateUpdatedAt: number;
}): Promise<CharacterProfile[]> => {
    const entry = normalizeWorldbookEntry(input.entry);
    const candidateErrors = validateWorldGrowthCandidate(input.candidate);
    if (candidateErrors.length) {
        throw new Error(`Accepted Worldbook candidate rejected: ${candidateErrors.join('; ')}`);
    }
    if (
        input.candidate.status !== 'accepted'
        || input.candidate.acceptedRevisionId !== entry.activeRevisionId
    ) {
        throw new Error('Accepted Worldbook candidate does not reference the committed revision');
    }

    const db = await openDB();
    const transaction = db.transaction([
        STORE_WORLDBOOKS,
        STORE_WORLDBOOK_GROWTH_CANDIDATES,
        STORE_CHARACTERS,
    ], 'readwrite');
    const worldbookStore = transaction.objectStore(STORE_WORLDBOOKS);
    const candidateStore = transaction.objectStore(STORE_WORLDBOOK_GROWTH_CANDIDATES);
    const characterStore = transaction.objectStore(STORE_CHARACTERS);
    const entryRequest = worldbookStore.get(entry.id);
    const candidateRequest = candidateStore.get(input.candidate.id);
    const characterRequest = characterStore.getAll();

    return new Promise((resolve, reject) => {
        let existingEntry: Worldbook | undefined;
        let storedCandidate: WorldGrowthCandidate | undefined;
        let characters: CharacterProfile[] = [];
        let loaded = 0;
        let changedCharacters: CharacterProfile[] = [];
        let failure: Error | undefined;
        let writesQueued = false;

        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try {
                transaction.abort();
            } catch {
                reject(failure);
            }
        };

        const queueWrites = () => {
            if (writesQueued || loaded !== 3) return;
            writesQueued = true;
            try {
                if (!storedCandidate) throw new Error('World growth candidate is missing');
                if (!['pending', 'deferred'].includes(storedCandidate.status)) {
                    throw new Error(`World growth candidate cannot be accepted from ${storedCandidate.status}`);
                }
                if (storedCandidate.updatedAt !== input.expectedCandidateUpdatedAt) {
                    throw new Error('World growth candidate changed before acceptance');
                }
                if (
                    storedCandidate.targetEntryId !== input.candidate.targetEntryId
                    || storedCandidate.baseRevisionId !== input.candidate.baseRevisionId
                    || storedCandidate.createdAt !== input.candidate.createdAt
                    || JSON.stringify(storedCandidate.source) !== JSON.stringify(input.candidate.source)
                    || JSON.stringify(storedCandidate.draft) !== JSON.stringify(input.candidate.draft)
                ) {
                    throw new Error('Accepted World growth candidate does not match its stored proposal');
                }
                if ((storedCandidate.baseRevisionId ?? null) !== input.expectedBaseRevisionId) {
                    throw new Error('World growth candidate base revision does not match its stored proposal');
                }
                if (storedCandidate.targetEntryId && storedCandidate.targetEntryId !== entry.id) {
                    throw new Error('Accepted World growth candidate targets a different Worldbook');
                }
                if (input.expectedBaseRevisionId === null) {
                    if (existingEntry) throw new Error(`Worldbook ${entry.id} already exists`);
                } else {
                    if (!existingEntry) throw new Error(`Worldbook ${entry.id} is missing`);
                    if (normalizeWorldbookEntry(existingEntry).activeRevisionId !== input.expectedBaseRevisionId) {
                        throw new Error(`Worldbook ${entry.id} active revision is stale`);
                    }
                }
                const rebuilt = acceptWorldGrowthCandidate({
                    candidate: storedCandidate,
                    currentEntry: storedCandidate.targetEntryId ? existingEntry : undefined,
                    newEntryId: storedCandidate.targetEntryId ? undefined : entry.id,
                    reviewedDraft: input.reviewedDraft,
                    acceptedAt: input.candidate.updatedAt,
                });
                const rebuiltEntry = normalizeWorldbookEntry(rebuilt.entry);
                if (
                    JSON.stringify(rebuiltEntry) !== JSON.stringify(entry)
                    || JSON.stringify(rebuilt.candidate) !== JSON.stringify(input.candidate)
                ) {
                    throw new Error('Accepted World growth candidate result does not match the stored proposal');
                }
                changedCharacters = characters
                    .map(character => refreshMountedWorldbookCache(character, rebuiltEntry))
                    .filter((character): character is CharacterProfile => Boolean(character));
                worldbookStore.put(rebuiltEntry);
                candidateStore.put(rebuilt.candidate);
                changedCharacters.forEach(character => characterStore.put(character));
            } catch (error) {
                abortWith(error, 'World growth candidate transaction failed');
            }
        };

        entryRequest.onsuccess = () => {
            existingEntry = entryRequest.result as Worldbook | undefined;
            loaded += 1;
            queueWrites();
        };
        entryRequest.onerror = () => abortWith(entryRequest.error, 'Worldbook lookup failed');
        candidateRequest.onsuccess = () => {
            storedCandidate = candidateRequest.result as WorldGrowthCandidate | undefined;
            loaded += 1;
            queueWrites();
        };
        candidateRequest.onerror = () => abortWith(candidateRequest.error, 'World growth candidate lookup failed');
        characterRequest.onsuccess = () => {
            characters = (characterRequest.result || []) as CharacterProfile[];
            loaded += 1;
            queueWrites();
        };
        characterRequest.onerror = () => abortWith(characterRequest.error, 'Character cache lookup failed');
        transaction.oncomplete = () => resolve(changedCharacters);
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'World growth candidate transaction failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'World growth candidate transaction aborted'),
        );
    });
};

const persistWorldGrowthCandidateRecord = async (
    candidate: WorldGrowthCandidate,
): Promise<void> => {
    const errors = validateWorldGrowthCandidate(candidate);
    if (errors.length) throw new Error(`World growth candidate rejected: ${errors.join('; ')}`);
    if (candidate.status === 'accepted') {
        throw new Error('Accepted World growth candidates require the atomic entry commit path');
    }
    const db = await openDB();
    const transaction = db.transaction(STORE_WORLDBOOK_GROWTH_CANDIDATES, 'readwrite');
    const store = transaction.objectStore(STORE_WORLDBOOK_GROWTH_CANDIDATES);
    const request = store.get(candidate.id);
    return new Promise((resolve, reject) => {
        let failure: Error | undefined;
        const abortWith = (error: unknown) => {
            failure = asError(error, 'World growth candidate save failed');
            try {
                transaction.abort();
            } catch {
                reject(failure);
            }
        };
        request.onsuccess = () => {
            try {
                const existing = request.result as WorldGrowthCandidate | undefined;
                if (!existing) {
                    if (candidate.status !== 'pending') {
                        throw new Error('A new World growth candidate must start pending');
                    }
                    store.put(candidate);
                    return;
                }
                const existingErrors = validateWorldGrowthCandidate(existing);
                if (existingErrors.length) {
                    throw new Error(`Stored World growth candidate is invalid: ${existingErrors.join('; ')}`);
                }
                if (JSON.stringify(existing) === JSON.stringify(candidate)) return;
                if (['accepted', 'ignored'].includes(existing.status)) {
                    throw new Error(`World growth candidate cannot change from ${existing.status}`);
                }
                if (!['deferred', 'ignored'].includes(candidate.status)) {
                    throw new Error(`World growth candidate cannot change to ${candidate.status} through save`);
                }
                if (
                    existing.createdAt !== candidate.createdAt
                    || existing.targetEntryId !== candidate.targetEntryId
                    || existing.baseRevisionId !== candidate.baseRevisionId
                    || JSON.stringify(existing.scope) !== JSON.stringify(candidate.scope)
                    || JSON.stringify(existing.source) !== JSON.stringify(candidate.source)
                    || JSON.stringify(existing.draft) !== JSON.stringify(candidate.draft)
                ) {
                    throw new Error('World growth candidate proposal fields are immutable');
                }
                if (candidate.updatedAt <= existing.updatedAt) {
                    throw new Error('World growth candidate update is stale');
                }
                store.put(candidate);
            } catch (error) {
                abortWith(error);
            }
        };
        request.onerror = () => abortWith(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'World growth candidate save failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'World growth candidate save aborted'),
        );
    });
};

const persistWorldGrowthCandidatesAtomically = async (
    candidates: readonly WorldGrowthCandidate[],
): Promise<void> => {
    if (!candidates.length) throw new Error('World growth candidate batch must not be empty');
    const ids = candidates.map(candidate => candidate.id);
    if (new Set(ids).size !== ids.length) {
        throw new Error('World growth candidate batch ids must be unique');
    }
    candidates.forEach((candidate, index) => {
        const errors = validateWorldGrowthCandidate(candidate);
        if (errors.length) {
            throw new Error(`World growth candidate batch[${index}] rejected: ${errors.join('; ')}`);
        }
        if (candidate.status !== 'pending') {
            throw new Error('A new World growth candidate batch may contain only pending candidates');
        }
    });

    const db = await openDB();
    const transaction = db.transaction(STORE_WORLDBOOK_GROWTH_CANDIDATES, 'readwrite');
    const store = transaction.objectStore(STORE_WORLDBOOK_GROWTH_CANDIDATES);
    const existingRequest = store.getAll();
    return new Promise((resolve, reject) => {
        let failure: Error | undefined;
        const abortWith = (error: unknown, fallback: string) => {
            failure = asError(error, fallback);
            try {
                transaction.abort();
            } catch {
                reject(failure);
            }
        };
        existingRequest.onsuccess = () => {
            try {
                const existingById = new Map(
                    ((existingRequest.result || []) as WorldGrowthCandidate[])
                        .map(candidate => [candidate.id, candidate]),
                );
                const narrativeSources = new Map<string, Set<string>>();
                candidates.forEach(candidate => {
                    if (candidate.source.kind !== 'narrative' || !candidate.scope) return;
                    const sourceKey = [
                        candidate.scope.progressBundleId,
                        candidate.scope.personaMaskId,
                        candidate.scope.charId,
                        candidate.source.refId,
                    ].join('\u0000');
                    const idsForSource = narrativeSources.get(sourceKey) || new Set<string>();
                    idsForSource.add(candidate.id);
                    narrativeSources.set(sourceKey, idsForSource);
                });
                narrativeSources.forEach((incomingIds, sourceKey) => {
                    const existingIds = [...existingById.values()]
                        .filter(existing => (
                            existing.source.kind === 'narrative'
                            && existing.scope
                            && [
                                existing.scope.progressBundleId,
                                existing.scope.personaMaskId,
                                existing.scope.charId,
                                existing.source.refId,
                            ].join('\u0000') === sourceKey
                        ))
                        .map(existing => existing.id);
                    if (
                        existingIds.length
                        && (
                            existingIds.length !== incomingIds.size
                            || existingIds.some(id => !incomingIds.has(id))
                        )
                    ) {
                        throw new Error('This confirmed narrative receipt already has a World growth candidate batch');
                    }
                });
                candidates.forEach(candidate => {
                    const existing = existingById.get(candidate.id);
                    if (existing && JSON.stringify(existing) !== JSON.stringify(candidate)) {
                        throw new Error(`World growth candidate ${candidate.id} already exists with different content`);
                    }
                });
                candidates.forEach(candidate => {
                    if (!existingById.has(candidate.id)) store.put(candidate);
                });
            } catch (error) {
                abortWith(error, 'World growth candidate batch save failed');
            }
        };
        existingRequest.onerror = () => abortWith(
            existingRequest.error,
            'World growth candidate batch collision check failed',
        );
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'World growth candidate batch save failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'World growth candidate batch save aborted'),
        );
    });
};

const persistWorldbookProjectionDeliveryReceipt = async (
    receipt: WorldbookProjectionDeliveryReceipt,
): Promise<void> => {
    assertWorldbookProjectionDeliveryReceipt(receipt);
    const db = await openDB();
    const transaction = db.transaction(STORE_WORLDBOOK_PROJECTION_RECEIPTS, 'readwrite');
    const store = transaction.objectStore(STORE_WORLDBOOK_PROJECTION_RECEIPTS);
    const request = store.get(receipt.id);
    return new Promise((resolve, reject) => {
        let failure: Error | undefined;
        const abortWith = (error: unknown) => {
            failure = asError(error, 'Worldbook delivery receipt save failed');
            try {
                transaction.abort();
            } catch {
                reject(failure);
            }
        };
        request.onsuccess = () => {
            try {
                const existing = request.result as WorldbookProjectionDeliveryReceipt | undefined;
                if (existing && JSON.stringify(existing) !== JSON.stringify(receipt)) {
                    throw new Error('Worldbook delivery receipt id collision');
                }
                if (!existing) store.put(receipt);
            } catch (error) {
                abortWith(error);
            }
        };
        request.onerror = () => abortWith(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            failure ??= asError(transaction.error, 'Worldbook delivery receipt save failed');
        };
        transaction.onabort = () => reject(
            failure ?? asError(transaction.error, 'Worldbook delivery receipt save aborted'),
        );
    });
};

export const DB = {
  deleteDB: async (): Promise<void> => {
      return new Promise((resolve, reject) => {
          const req = indexedDB.deleteDatabase(DB_NAME);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('Database reset is blocked by an older open connection'));
      });
  },

  getAllCharacters: async (): Promise<CharacterProfile[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CHARACTERS, 'readonly');
      const store = transaction.objectStore(STORE_CHARACTERS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  saveCharacter: async (character: CharacterProfile): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_CHARACTERS, 'readwrite');
    transaction.objectStore(STORE_CHARACTERS).put(character);
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(asError(transaction.error, 'Character save failed'));
        transaction.onabort = () => reject(asError(transaction.error, 'Character save aborted'));
    });
  },

  deleteCharacter: async (id: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_CHARACTERS, 'readwrite');
    transaction.objectStore(STORE_CHARACTERS).delete(id);
  },

  deleteCharacterAndArchiveOwnedWorldbooks: async (input: {
      charId: string;
      groups: readonly WorldbookGroupAssignment[];
      entries: readonly { entry: Worldbook; expectedActiveRevisionId: string }[];
  }): Promise<void> => {
      await persistCharacterDeletionWithOwnedWorldbookArchive(input);
  },

  archiveWorldbookGroup: async (input: {
      group: WorldbookGroupAssignment;
      entries: readonly { entry: Worldbook; expectedActiveRevisionId: string }[];
  }): Promise<CharacterProfile[]> => persistWorldbookGroupArchive(input),

  restoreWorldbookGroup: async (input: {
      group: WorldbookGroupAssignment;
      entries: readonly { entry: Worldbook; expectedActiveRevisionId: string }[];
  }): Promise<CharacterProfile[]> => persistWorldbookGroupRestore(input),

  assignUnassignedWorldbooks: async (input: {
      group: WorldbookGroupAssignment;
      entries: readonly UnassignedWorldbookBatchEntry[];
      assignedAt: number;
  }): Promise<CharacterProfile[]> => persistUnassignedWorldbookBatch({
      action: 'assign',
      group: input.group,
      entries: input.entries,
      changedAt: input.assignedAt,
  }),

  archiveUnassignedWorldbooks: async (input: {
      entries: readonly UnassignedWorldbookBatchEntry[];
      archivedAt: number;
  }): Promise<CharacterProfile[]> => persistUnassignedWorldbookBatch({
      action: 'archive',
      entries: input.entries,
      changedAt: input.archivedAt,
  }),

  deleteArchivedWorldbooks: async (input: {
      entryIds: readonly string[];
      groupId?: string;
  }): Promise<CharacterProfile[]> => persistArchivedWorldbookDeletion(input),

  getMessagesByCharId: async (charId: string): Promise<Message[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_MESSAGES, 'readonly');
      const store = transaction.objectStore(STORE_MESSAGES);
      const index = store.index('charId');
      const request = index.getAll(IDBKeyRange.only(charId));
      request.onsuccess = () => {
          const results = (request.result || []).filter((m: Message) => !m.groupId);
          resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  },

  // Performance: Load only the most recent N messages for a character
  getRecentMessagesByCharId: async (charId: string, limit: number): Promise<Message[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_MESSAGES, 'readonly');
      const store = transaction.objectStore(STORE_MESSAGES);
      const index = store.index('charId');
      // Use reverse cursor to only collect the last N messages without loading all into memory
      const collected: Message[] = [];
      const cursorReq = index.openCursor(IDBKeyRange.only(charId), 'prev');
      cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && collected.length < limit) {
              const m = cursor.value as Message;
              if (!m.groupId) collected.push(m);
              cursor.continue();
          } else {
              // Reverse to chronological order
              resolve(collected.reverse());
          }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  },

  // Same as getRecentMessagesByCharId but also returns the total count (for UI display)
  getRecentMessagesWithCount: async (charId: string, limit: number): Promise<{ messages: Message[], totalCount: number }> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_MESSAGES, 'readonly');
      const store = transaction.objectStore(STORE_MESSAGES);
      const index = store.index('charId');
      const countReq = index.count(IDBKeyRange.only(charId));
      countReq.onsuccess = () => {
          const totalCount = countReq.result;
          // Use reverse cursor to only collect the last N messages
          const collected: Message[] = [];
          const cursorReq = index.openCursor(IDBKeyRange.only(charId), 'prev');
          cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (cursor && collected.length < limit) {
                  const m = cursor.value as Message;
                  if (!m.groupId) collected.push(m);
                  cursor.continue();
              } else {
                  resolve({ messages: collected.reverse(), totalCount });
              }
          };
          cursorReq.onerror = () => reject(cursorReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  },

  // Get all messages for a character from a given message ID onward (for hideBeforeMessageId)
  getMessagesFromId: async (charId: string, fromId: number): Promise<{ messages: Message[], totalCount: number }> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_MESSAGES, 'readonly');
      const store = transaction.objectStore(STORE_MESSAGES);
      const index = store.index('charId');
      const collected: Message[] = [];
      const cursorReq = index.openCursor(IDBKeyRange.only(charId));
      cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
              const m = cursor.value as Message;
              if (!m.groupId && m.id >= fromId) {
                  collected.push(m);
              }
              cursor.continue();
          } else {
              resolve({ messages: collected, totalCount: collected.length });
          }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  },

  saveMessage: async (msg: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }): Promise<number> => {
    const db = await openDB();
    const timestamp = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
    const { timestamp: _ignored, ...inputPayload } = msg;
    let payload = inputPayload;
    const hasDeclaredRelationshipScope = Object.prototype.hasOwnProperty.call(
        inputPayload.metadata || {},
        'relationshipScope',
    );
    if (!inputPayload.groupId && !hasDeclaredRelationshipScope) {
        payload = {
            ...inputPayload,
            metadata: {
                ...(inputPayload.metadata || {}),
                temporalClass: inputPayload.metadata?.temporalClass || 'live',
                // Fail closed. The caller that starts an interaction owns scope
                // capture; save-time active-profile lookup can cross masks.
                relationshipScope: null,
            },
        };
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = transaction.objectStore(STORE_MESSAGES);
        const request = store.add({ ...payload, timestamp });
        request.onsuccess = async () => {
            const id = request.result as number;
            try {
                await archiveLiveMessage({
                    message: { ...payload, timestamp, id } as Message,
                });
            } catch (error) {
                // The operational message is already durable in AetherOS_Data.
                // The day archive can reconcile it later without breaking chat.
                console.warn('Daily archive append failed; live message remains saved', error);
            }
            resolve(id);
        };
        request.onerror = () => reject(request.error);
    });
  },

  updateMessage: async (id: number, content: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);

    return new Promise((resolve, reject) => {
        let updatedMessage: Message | undefined;
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as Message;
            if (data) {
                updatedMessage = nextDailyArchiveRevision({ ...data, content });
                store.put(updatedMessage);
            } else {
                transaction.abort();
                reject(new Error('Message not found'));
            }
        };
        req.onerror = () => reject(req.error);
        transaction.oncomplete = async () => {
            await reconcileLiveMessageWithDailyArchive(updatedMessage, 'active');
            resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('Message update failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Message update aborted'));
    });
  },

  updateMessageMetadata: async (id: number, metadataPatch: Record<string, any>): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);

    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as Message;
            if (data) {
                const nextMetadata = { ...(data.metadata || {}) };
                Object.entries(metadataPatch).forEach(([key, value]) => {
                    // Relationship ownership is write-once. Legacy migration, if
                    // introduced later, must use an explicit audited path rather
                    // than the generic metadata editor.
                    if (key === 'relationshipScope') return;
                    if (typeof value === 'undefined') {
                        delete nextMetadata[key];
                    } else {
                        nextMetadata[key] = value;
                    }
                });
                data.metadata = nextMetadata;
                store.put(data);
                resolve();
            } else {
                reject(new Error('Message not found'));
            }
        };
        req.onerror = () => reject(req.error);
    });
  },

  deleteMessage: async (id: number): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    return new Promise((resolve, reject) => {
        let deletedMessage: Message | undefined;
        const request = store.get(id);
        request.onsuccess = () => {
            const data = request.result as Message | undefined;
            if (data) deletedMessage = nextDailyArchiveRevision(data);
            store.delete(id);
        };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = async () => {
            await reconcileLiveMessageWithDailyArchive(deletedMessage, 'tombstoned');
            resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('Message delete failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Message delete aborted'));
    });
  },

  deleteMessages: async (ids: number[]): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = transaction.objectStore(STORE_MESSAGES);
      const deletedMessages: Message[] = [];
      ids.forEach(id => {
          const request = store.get(id);
          request.onsuccess = () => {
              const data = request.result as Message | undefined;
              if (data) deletedMessages.push(nextDailyArchiveRevision(data));
              store.delete(id);
          };
      });
      return new Promise((resolve, reject) => {
          transaction.oncomplete = async () => {
              await Promise.all(deletedMessages.map(message => (
                  reconcileLiveMessageWithDailyArchive(message, 'tombstoned')
              )));
              resolve();
          };
          transaction.onerror = () => reject(transaction.error ?? new Error('Messages delete failed'));
          transaction.onabort = () => reject(transaction.error ?? new Error('Messages delete aborted'));
      });
  },

  clearMessages: async (charId: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    const index = store.index('charId');
    const deletedMessages: Message[] = [];
    const request = index.openCursor(IDBKeyRange.only(charId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { 
          const m = cursor.value as Message;
          if (!m.groupId) {
              deletedMessages.push(nextDailyArchiveRevision(m));
              store.delete(cursor.primaryKey); 
          }
          cursor.continue(); 
      }
    };
    return new Promise((resolve, reject) => {
        transaction.oncomplete = async () => {
            await Promise.all(deletedMessages.map(message => (
                reconcileLiveMessageWithDailyArchive(message, 'tombstoned')
            )));
            resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('Messages clear failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Messages clear aborted'));
    });
  },

  getGroups: async (): Promise<GroupProfile[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_GROUPS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_GROUPS, 'readonly');
          const store = transaction.objectStore(STORE_GROUPS);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveGroup: async (group: GroupProfile): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GROUPS, 'readwrite');
      transaction.objectStore(STORE_GROUPS).put(group);
  },

  deleteGroup: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GROUPS, 'readwrite');
      transaction.objectStore(STORE_GROUPS).delete(id);
  },

  getGroupMessages: async (groupId: string): Promise<Message[]> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_MESSAGES, 'readonly');
          const store = transaction.objectStore(STORE_MESSAGES);
          const index = store.index('groupId');
          const request = index.getAll(IDBKeyRange.only(groupId));
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  getRecentGroupMessagesWithCount: async (groupId: string, limit: number): Promise<{ messages: Message[], totalCount: number }> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_MESSAGES, 'readonly');
          const store = transaction.objectStore(STORE_MESSAGES);
          const index = store.index('groupId');
          const countReq = index.count(IDBKeyRange.only(groupId));
          countReq.onsuccess = () => {
              const totalCount = countReq.result;
              const collected: Message[] = [];
              const cursorReq = index.openCursor(IDBKeyRange.only(groupId), 'prev');
              cursorReq.onsuccess = () => {
                  const cursor = cursorReq.result;
                  if (cursor && collected.length < limit) {
                      collected.push(cursor.value as Message);
                      cursor.continue();
                  } else {
                      resolve({ messages: collected.reverse(), totalCount });
                  }
              };
              cursorReq.onerror = () => reject(cursorReq.error);
          };
          countReq.onerror = () => reject(countReq.error);
      });
  },

  getSocialPosts: async (): Promise<SocialPost[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_SOCIAL_POSTS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_SOCIAL_POSTS, 'readonly');
          const store = transaction.objectStore(STORE_SOCIAL_POSTS);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveSocialPost: async (post: SocialPost): Promise<void> => {
      const db = await openDB();
      let storedPost: SocialPost | undefined;
      await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_SOCIAL_POSTS, 'readwrite');
          const store = transaction.objectStore(STORE_SOCIAL_POSTS);
          const request = store.get(post.id);
          request.onsuccess = () => {
              const previous = request.result as SocialPost | undefined;
              storedPost = {
                  ...post,
                  evidenceRevision: Math.max(0, previous?.evidenceRevision || 0) + 1,
              };
              store.put(storedPost);
          };
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error('Social post save aborted'));
      });
      if (storedPost) {
          try {
              await archiveSocialPostEvidence({ post: storedPost });
          } catch (error) {
              console.warn('Social evidence projection failed; source post remains saved', error);
          }
      }
  },

  deleteSocialPost: async (id: string): Promise<void> => {
      const db = await openDB();
      let deletedPost: SocialPost | undefined;
      await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_SOCIAL_POSTS, 'readwrite');
          const store = transaction.objectStore(STORE_SOCIAL_POSTS);
          const request = store.get(id);
          request.onsuccess = () => {
              const previous = request.result as SocialPost | undefined;
              deletedPost = previous ? {
                  ...previous,
                  evidenceRevision: Math.max(0, previous.evidenceRevision || 0) + 1,
              } : undefined;
              store.delete(id);
          };
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error('Social post delete aborted'));
      });
      if (deletedPost) {
          try {
              await archiveSocialPostEvidence({ post: deletedPost, status: 'tombstoned' });
          } catch (error) {
              console.warn('Social evidence tombstone failed; source post remains deleted', error);
          }
      }
  },

  clearSocialPosts: async (): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_SOCIAL_POSTS, 'readwrite');
      transaction.objectStore(STORE_SOCIAL_POSTS).clear();
  },

  getEmojis: async (): Promise<Emoji[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_EMOJIS, 'readonly');
      const store = transaction.objectStore(STORE_EMOJIS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  saveEmoji: async (name: string, url: string, categoryId?: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_EMOJIS, 'readwrite');
    transaction.objectStore(STORE_EMOJIS).put({ name, url, categoryId, source: 'user' });
  },

  saveEmojiRecord: async (emoji: Emoji): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_EMOJIS, 'readwrite');
    transaction.objectStore(STORE_EMOJIS).put(emoji);
  },

  deleteEmoji: async (name: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_EMOJIS, 'readwrite');
    transaction.objectStore(STORE_EMOJIS).delete(name);
  },

  getEmojiCategories: async (): Promise<EmojiCategory[]> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_EMOJI_CATEGORIES)) {
              resolve([]);
              return;
          }
          const transaction = db.transaction(STORE_EMOJI_CATEGORIES, 'readonly');
          const store = transaction.objectStore(STORE_EMOJI_CATEGORIES);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveEmojiCategory: async (category: EmojiCategory): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_EMOJI_CATEGORIES, 'readwrite');
      transaction.objectStore(STORE_EMOJI_CATEGORIES).put(category);
  },

  deleteEmojiCategory: async (id: string): Promise<void> => {
      const db = await openDB();
      const tx = db.transaction([STORE_EMOJI_CATEGORIES, STORE_EMOJIS], 'readwrite');
      tx.objectStore(STORE_EMOJI_CATEGORIES).delete(id);
      const emojiStore = tx.objectStore(STORE_EMOJIS);
      const request = emojiStore.getAll();
      request.onsuccess = () => {
          const allEmojis = request.result as Emoji[];
          allEmojis.forEach(e => {
              if (e.categoryId === id) {
                  emojiStore.delete(e.name);
              }
          });
      };
      return new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  },

  syncPublicEmojiPacks: async (): Promise<void> => {
      const catalogUrl = getPublicEmojiCatalogUrl();
      if (!catalogUrl) return;

      try {
          const response = await fetch(catalogUrl, { cache: 'no-cache' });
          if (!response.ok) return;

          const catalog = await response.json() as PublicEmojiCatalog;
          const catalogVersion = catalog.version || 'local';
          const packs = normalizePublicPacks(catalog);
          if (packs.length === 0) return;

          const [existingCategories, existingEmojis] = await Promise.all([
              DB.getEmojiCategories(),
              DB.getEmojis(),
          ]);
          const categoryMap = new Map(existingCategories.map(category => [category.id, category]));
          const activePackIds = new Set<string>();
          const manifestEmojiNames = new Set<string>();

          for (const pack of packs) {
              const packId = pack.id.trim();
              if (!packId) continue;

              activePackIds.add(packId);
              const categoryId = getPublicCategoryId(pack);
              const existingCategory = categoryMap.get(categoryId);
              const defaultMode = pack.visibilityDefault === 'all' ? 'all' : 'allowlist';
              const catalogDefaultAllowedIds = Array.from(new Set([
                  ...(pack.defaultAllowedCharacterIds || []),
                  ...(pack.allowedCharacterIds || []),
              ].map(id => id.trim()).filter(Boolean)));
              const existingAllowedIds = Array.isArray(existingCategory?.allowedCharacterIds)
                  ? existingCategory.allowedCharacterIds
                  : undefined;
              const shouldApplyCatalogAllowedIds = (
                  defaultMode === 'allowlist'
                  && catalogDefaultAllowedIds.length > 0
                  && (!existingCategory || existingCategory.catalogVersion !== catalogVersion)
                  && (!existingAllowedIds || existingAllowedIds.length === 0)
              );
              const nextCategory: EmojiCategory = {
                  ...existingCategory,
                  id: categoryId,
                  name: pack.name,
                  isSystem: true,
                  source: 'public',
                  packId,
                  catalogVersion,
                  visibilityMode: existingCategory?.visibilityMode || defaultMode,
                  allowedCharacterIds: shouldApplyCatalogAllowedIds ? catalogDefaultAllowedIds : (existingAllowedIds || []),
              };

              if (nextCategory.visibilityMode === 'all') {
                  delete nextCategory.allowedCharacterIds;
              }

              await DB.saveEmojiCategory(nextCategory);

              const stickers = normalizeStickerList(pack.stickers);
              for (const sticker of stickers) {
                  if (!isActivePublicSticker(sticker)) continue;

                  const url = resolveStickerUrl(sticker, pack, catalog, catalogUrl);
                  if (!url) continue;

                  const stickerId = sticker.sticker_id || sticker.id || sticker.asset_file || sticker.name || sticker.label || sticker.display_name;
                  const name = (sticker.name || sticker.label || sticker.display_name || stickerId || '').trim();
                  if (!name) continue;

                  manifestEmojiNames.add(name);
                  await DB.saveEmojiRecord({
                      name,
                      url,
                      categoryId,
                      source: 'public',
                      packId,
                      stickerId,
                      assetFile: sticker.asset_file,
                      tags: sticker.tags,
                      desc: sticker.desc,
                      meaning: sticker.meaning,
                      useWhen: sticker.use_when,
                      avoidWhen: sticker.avoid_when,
                  });
              }
          }

          const stalePublicEmojis = existingEmojis.filter(emoji => (
              emoji.source === 'public'
              && emoji.packId
              && activePackIds.has(emoji.packId)
              && !manifestEmojiNames.has(emoji.name)
          ));

          for (const emoji of stalePublicEmojis) {
              await DB.deleteEmoji(emoji.name);
          }

          localStorage.setItem(PUBLIC_EMOJI_CATALOG_VERSION_KEY, catalogVersion);
      } catch (error) {
          console.warn('Public emoji pack sync skipped:', error);
      }
  },

  initializeEmojiData: async (): Promise<void> => {
      const cats = await DB.getEmojiCategories();
      if (!cats.some(c => c.id === 'default')) {
          await DB.saveEmojiCategory({ id: 'default', name: '默认', isSystem: true, source: 'system', visibilityMode: 'all' });
      }
      await DB.syncPublicEmojiPacks();
  },

  getThemes: async (): Promise<ChatTheme[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_THEMES, 'readonly');
      const store = transaction.objectStore(STORE_THEMES);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  saveTheme: async (theme: ChatTheme): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_THEMES, 'readwrite');
    transaction.objectStore(STORE_THEMES).put(theme);
  },

  deleteTheme: async (id: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_THEMES, 'readwrite');
    transaction.objectStore(STORE_THEMES).delete(id);
  },

  getAllAssets: async (): Promise<{id: string, data: string}[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ASSETS, 'readonly');
      const store = transaction.objectStore(STORE_ASSETS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  getAsset: async (id: string): Promise<string | null> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_ASSETS, 'readonly');
          const store = transaction.objectStore(STORE_ASSETS);
          const request = store.get(id);
          request.onsuccess = () => resolve(request.result?.data || null);
          request.onerror = () => reject(request.error);
      });
  },

  saveAsset: async (id: string, data: string): Promise<void> => {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_ASSETS, 'readwrite');
      const request = transaction.objectStore(STORE_ASSETS).put({ id, data });
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new DOMException('Asset 写入事务已中止', 'AbortError'));
      transaction.oncomplete = () => resolve();
    });
  },

  updateAsset: async <T>(
    id: string,
    update: (current: string | null) => { data: string; result: T },
  ): Promise<T> => {
    const db = await openDB();
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_ASSETS, 'readwrite');
      const store = transaction.objectStore(STORE_ASSETS);
      const request = store.get(id);
      let result: T;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        try {
          const next = update(request.result?.data || null);
          result = next.result;
          store.put({ id, data: next.data });
        } catch (error) {
          transaction.abort();
          fail(error);
        }
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error ?? new DOMException('Asset 更新事务已中止', 'AbortError'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result!);
      };
    });
  },

  getAssetRaw: async (id: string): Promise<any | null> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_ASSETS, 'readonly');
          const store = transaction.objectStore(STORE_ASSETS);
          const request = store.get(id);
          request.onsuccess = () => resolve(request.result?.data ?? null);
          request.onerror = () => reject(request.error);
      });
  },

  saveAssetRaw: async (id: string, data: any): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_ASSETS, 'readwrite');
      transaction.objectStore(STORE_ASSETS).put({ id, data });
  },

  deleteAsset: async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ASSETS, 'readwrite');
      const request = transaction.objectStore(STORE_ASSETS).delete(id);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  },

  getJournalStickers: async (): Promise<{name: string, url: string}[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_JOURNAL_STICKERS)) return [];
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_JOURNAL_STICKERS, 'readonly');
      const store = transaction.objectStore(STORE_JOURNAL_STICKERS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  saveJournalSticker: async (name: string, url: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_JOURNAL_STICKERS, 'readwrite');
    transaction.objectStore(STORE_JOURNAL_STICKERS).put({ name, url });
  },

  deleteJournalSticker: async (name: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_JOURNAL_STICKERS, 'readwrite');
    transaction.objectStore(STORE_JOURNAL_STICKERS).delete(name);
  },

  saveGalleryImage: async (img: GalleryImage): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GALLERY, 'readwrite');
      transaction.objectStore(STORE_GALLERY).put(img);
  },

  getGalleryImages: async (charId?: string): Promise<GalleryImage[]> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_GALLERY, 'readonly');
          const store = transaction.objectStore(STORE_GALLERY);
          let request;
          if (charId) {
              const index = store.index('charId');
              request = index.getAll(IDBKeyRange.only(charId));
          } else {
              request = store.getAll();
          }
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  updateGalleryImageReview: async (id: string, review: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GALLERY, 'readwrite');
      const store = transaction.objectStore(STORE_GALLERY);
      return new Promise((resolve, reject) => {
          const req = store.get(id);
          req.onsuccess = () => {
              const data = req.result as GalleryImage;
              if (data) {
                  data.review = review;
                  data.reviewTimestamp = Date.now();
                  store.put(data);
                  resolve();
              } else reject(new Error('Image not found'));
          };
          req.onerror = () => reject(req.error);
      });
  },

  deleteGalleryImage: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GALLERY, 'readwrite');
      transaction.objectStore(STORE_GALLERY).delete(id);
  },

  saveScheduledMessage: async (msg: ScheduledMessage): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_SCHEDULED, 'readwrite');
      transaction.objectStore(STORE_SCHEDULED).put(msg);
  },

  getDueScheduledMessages: async (charId: string): Promise<ScheduledMessage[]> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_SCHEDULED, 'readonly');
          const store = transaction.objectStore(STORE_SCHEDULED);
          const index = store.index('charId');
          const request = index.getAll(IDBKeyRange.only(charId));
          request.onsuccess = () => {
              const all = request.result as ScheduledMessage[];
              const now = Date.now();
              const due = all.filter(m => m.dueAt <= now);
              resolve(due);
          };
          request.onerror = () => reject(request.error);
      });
  },

  deleteScheduledMessage: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_SCHEDULED, 'readwrite');
      transaction.objectStore(STORE_SCHEDULED).delete(id);
  },

  getAllCompanionWakeupRules: async (): Promise<CompanionWakeupRule[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_COMPANION_WAKEUPS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_COMPANION_WAKEUPS, 'readonly');
          const request = transaction.objectStore(STORE_COMPANION_WAKEUPS).getAll();
          request.onsuccess = () => resolve((request.result || []) as CompanionWakeupRule[]);
          request.onerror = () => reject(request.error);
      });
  },

  getCompanionWakeupRulesByCharId: async (charId: string): Promise<CompanionWakeupRule[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_COMPANION_WAKEUPS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_COMPANION_WAKEUPS, 'readonly');
          const store = transaction.objectStore(STORE_COMPANION_WAKEUPS);
          const index = store.index('charId');
          const request = index.getAll(IDBKeyRange.only(charId));
          request.onsuccess = () => resolve((request.result || []) as CompanionWakeupRule[]);
          request.onerror = () => reject(request.error);
      });
  },

  saveCompanionWakeupRule: async (rule: CompanionWakeupRule): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_COMPANION_WAKEUPS, 'readwrite');
      transaction.objectStore(STORE_COMPANION_WAKEUPS).put({ ...rule, updatedAt: Date.now() });
  },

  deleteCompanionWakeupRule: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_COMPANION_WAKEUPS, 'readwrite');
      transaction.objectStore(STORE_COMPANION_WAKEUPS).delete(id);
  },

  getDueCompanionWakeupRules: async (now = Date.now()): Promise<CompanionWakeupRule[]> => {
      const rules = await DB.getAllCompanionWakeupRules();
      return rules.filter(rule => rule.enabled && typeof rule.nextTriggerAt === 'number' && rule.nextTriggerAt <= now);
  },

  saveCompanionWakeupLog: async (log: CompanionWakeupLog): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_COMPANION_WAKEUP_LOGS, 'readwrite');
      transaction.objectStore(STORE_COMPANION_WAKEUP_LOGS).put(log);
  },

  getCompanionWakeupLogsByCharId: async (charId: string, limit?: number): Promise<CompanionWakeupLog[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_COMPANION_WAKEUP_LOGS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_COMPANION_WAKEUP_LOGS, 'readonly');
          const store = transaction.objectStore(STORE_COMPANION_WAKEUP_LOGS);
          const index = store.index('charId');
          const request = index.getAll(IDBKeyRange.only(charId));
          request.onsuccess = () => {
              let logs = ((request.result || []) as CompanionWakeupLog[]).sort((a, b) => b.triggeredAt - a.triggeredAt);
              if (limit) logs = logs.slice(0, limit);
              resolve(logs);
          };
          request.onerror = () => reject(request.error);
      });
  },

  saveUserProfile: async (profile: UserProfile): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_USER, 'readwrite');
      transaction.objectStore(STORE_USER).put({ ...normalizeUserPersonaProfile(profile), id: 'me' });
  },

  getUserProfile: async (): Promise<UserProfile | null> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_USER, 'readonly');
          const store = transaction.objectStore(STORE_USER);
          const request = store.get('me');
          request.onsuccess = () => {
              if (request.result) {
                  const { id, ...profile } = request.result;
                  resolve(normalizeUserPersonaProfile(profile as UserProfile));
              } else {
                  resolve(null);
              }
          };
          request.onerror = () => reject(request.error);
      });
  },

  getDiariesByCharId: async (charId: string): Promise<DiaryEntry[]> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_DIARIES, 'readonly');
          const store = transaction.objectStore(STORE_DIARIES);
          const index = store.index('charId');
          const request = index.getAll(IDBKeyRange.only(charId));
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveDiary: async (diary: DiaryEntry): Promise<void> => {
      const db = await openDB();
      let storedDiary: DiaryEntry | undefined;
      await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_DIARIES, 'readwrite');
          const store = transaction.objectStore(STORE_DIARIES);
          const request = store.get(diary.id);
          request.onsuccess = () => {
              const previous = request.result as DiaryEntry | undefined;
              storedDiary = {
                  ...diary,
                  evidenceRevision: Math.max(0, previous?.evidenceRevision || 0) + 1,
              };
              store.put(storedDiary);
          };
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error('Diary save aborted'));
      });
      if (storedDiary) {
          try {
              await archiveDiaryEvidence({ diary: storedDiary });
          } catch (error) {
              console.warn('Diary evidence projection failed; source diary remains saved', error);
          }
      }
  },

  deleteDiary: async (id: string): Promise<void> => {
      const db = await openDB();
      let deletedDiary: DiaryEntry | undefined;
      await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_DIARIES, 'readwrite');
          const store = transaction.objectStore(STORE_DIARIES);
          const request = store.get(id);
          request.onsuccess = () => {
              const previous = request.result as DiaryEntry | undefined;
              deletedDiary = previous ? {
                  ...previous,
                  evidenceRevision: Math.max(0, previous.evidenceRevision || 0) + 1,
              } : undefined;
              store.delete(id);
          };
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error('Diary delete aborted'));
      });
      if (deletedDiary) {
          try {
              await archiveDiaryEvidence({ diary: deletedDiary, status: 'tombstoned' });
          } catch (error) {
              console.warn('Diary evidence tombstone failed; source diary remains deleted', error);
          }
      }
  },

  getAllTasks: async (): Promise<Task[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_TASKS)) return [];
      
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_TASKS, 'readonly');
          const store = transaction.objectStore(STORE_TASKS);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveTask: async (task: Task): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_TASKS, 'readwrite');
      transaction.objectStore(STORE_TASKS).put(task);
  },

  deleteTask: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_TASKS, 'readwrite');
      transaction.objectStore(STORE_TASKS).delete(id);
  },

  getAllAnniversaries: async (): Promise<Anniversary[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_ANNIVERSARIES)) return [];

      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_ANNIVERSARIES, 'readonly');
          const store = transaction.objectStore(STORE_ANNIVERSARIES);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveAnniversary: async (anniversary: Anniversary): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_ANNIVERSARIES, 'readwrite');
      transaction.objectStore(STORE_ANNIVERSARIES).put(anniversary);
  },

  deleteAnniversary: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_ANNIVERSARIES, 'readwrite');
      transaction.objectStore(STORE_ANNIVERSARIES).delete(id);
  },

  getRoomTodo: async (charId: string, date: string): Promise<RoomTodo | null> => {
      const db = await openDB();
      const id = `${charId}_${date}`;
      return new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_ROOM_TODOS)) { resolve(null); return; }
          const transaction = db.transaction(STORE_ROOM_TODOS, 'readonly');
          const store = transaction.objectStore(STORE_ROOM_TODOS);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
      });
  },

  saveRoomTodo: async (todo: RoomTodo): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_ROOM_TODOS, 'readwrite');
      transaction.objectStore(STORE_ROOM_TODOS).put(todo);
  },

  getRoomNotes: async (charId: string): Promise<RoomNote[]> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_ROOM_NOTES)) { resolve([]); return; }
          const transaction = db.transaction(STORE_ROOM_NOTES, 'readonly');
          const store = transaction.objectStore(STORE_ROOM_NOTES);
          const index = store.index('charId');
          const request = index.getAll(IDBKeyRange.only(charId));
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveRoomNote: async (note: RoomNote): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_ROOM_NOTES, 'readwrite');
      transaction.objectStore(STORE_ROOM_NOTES).put(note);
  },

  deleteRoomNote: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_ROOM_NOTES, 'readwrite');
      transaction.objectStore(STORE_ROOM_NOTES).delete(id);
  },

  getAllCourses: async (): Promise<StudyCourse[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_COURSES)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_COURSES, 'readonly');
          const store = transaction.objectStore(STORE_COURSES);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveCourse: async (course: StudyCourse): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_COURSES, 'readwrite');
      transaction.objectStore(STORE_COURSES).put(course);
  },

  deleteCourse: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_COURSES, 'readwrite');
      transaction.objectStore(STORE_COURSES).delete(id);
  },

  // --- Quiz / Practice Book ---
  getAllQuizzes: async (): Promise<QuizSession[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_QUIZZES)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_QUIZZES, 'readonly');
          const store = transaction.objectStore(STORE_QUIZZES);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveQuiz: async (quiz: QuizSession): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_QUIZZES, 'readwrite');
      transaction.objectStore(STORE_QUIZZES).put(quiz);
  },

  deleteQuiz: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_QUIZZES, 'readwrite');
      transaction.objectStore(STORE_QUIZZES).delete(id);
  },

  getAllGames: async (): Promise<GameSession[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_GAMES)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_GAMES, 'readonly');
          const store = transaction.objectStore(STORE_GAMES);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveGame: async (game: GameSession): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GAMES, 'readwrite');
      transaction.objectStore(STORE_GAMES).put(game);
  },

  deleteGame: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GAMES, 'readwrite');
      transaction.objectStore(STORE_GAMES).delete(id);
  },

  getAllWorldbooks: async (): Promise<Worldbook[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_WORLDBOOKS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_WORLDBOOKS, 'readonly');
          const store = transaction.objectStore(STORE_WORLDBOOKS);
          const request = store.getAll();
          request.onsuccess = () => {
              try {
                  resolve(((request.result || []) as Worldbook[]).map(normalizeWorldbookEntry));
              } catch (error) {
                  reject(error);
              }
          };
          request.onerror = () => reject(request.error);
      });
  },

  getAllWorldbookGroups: async (): Promise<WorldbookGroupAssignment[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_WORLDBOOK_GROUPS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_WORLDBOOK_GROUPS, 'readonly');
          const request = transaction.objectStore(STORE_WORLDBOOK_GROUPS).getAll();
          request.onsuccess = () => {
              try {
                  const groups = ((request.result || []) as WorldbookGroupAssignment[]).map(group => ({
                      ...group,
                      id: group.id.trim(),
                      name: group.name.trim(),
                      owner: group.owner.kind === 'character'
                          ? { kind: 'character' as const, charId: group.owner.charId.trim() }
                          : { kind: 'universal' as const },
                  }));
                  const errors = groups.flatMap(group => validateWorldbookGroupAssignment(group));
                  if (errors.length) throw new Error(`Stored Worldbook groups are invalid: ${errors.join('; ')}`);
                  resolve(groups);
              } catch (error) {
                  reject(error);
              }
          };
          request.onerror = () => reject(request.error);
      });
  },

  saveWorldbookGroup: async (group: WorldbookGroupAssignment): Promise<void> => {
      const normalized: WorldbookGroupAssignment = {
          ...group,
          id: group.id.trim(),
          name: group.name.trim(),
          owner: group.owner.kind === 'character'
              ? { kind: 'character', charId: group.owner.charId.trim() }
              : { kind: 'universal' },
      };
      const errors = validateWorldbookGroupAssignment(normalized);
      if (errors.length) throw new Error(`Worldbook group rejected: ${errors.join('; ')}`);
      const db = await openDB();
      const transaction = db.transaction(STORE_WORLDBOOK_GROUPS, 'readwrite');
      const store = transaction.objectStore(STORE_WORLDBOOK_GROUPS);
      const request = store.getAll();
      return new Promise((resolve, reject) => {
          let failure: Error | undefined;
          const abortWith = (error: unknown) => {
              failure = asError(error, 'Worldbook group save failed');
              try { transaction.abort(); } catch { reject(failure); }
          };
          request.onsuccess = () => {
              try {
                  const existing = (request.result || []) as WorldbookGroupAssignment[];
                  const sameId = existing.find(item => item.id === normalized.id);
                  if (sameId) {
                      const sameOwner = sameId.owner.kind === normalized.owner.kind && (
                          sameId.owner.kind === 'universal'
                          || (
                              normalized.owner.kind === 'character'
                              && sameId.owner.charId === normalized.owner.charId
                          )
                      );
                      if (sameId.name.trim() !== normalized.name || !sameOwner) {
                          throw new Error('Worldbook group id already belongs to another group');
                      }
                  }
                  const sameOwnerAndName = existing.find(item => (
                      item.id !== normalized.id
                      && item.name.trim() === normalized.name
                      && item.owner.kind === normalized.owner.kind
                      && (
                          item.owner.kind === 'universal'
                          || (
                              normalized.owner.kind === 'character'
                              && item.owner.charId === normalized.owner.charId
                          )
                      )
                  ));
                  if (sameOwnerAndName) throw new Error('这个角色已经有同名世界书组');
                  if (!sameId || JSON.stringify(sameId) !== JSON.stringify(normalized)) {
                      store.put(normalized);
                  }
              } catch (error) {
                  abortWith(error);
              }
          };
          request.onerror = () => abortWith(request.error);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => { failure ??= asError(transaction.error, 'Worldbook group save failed'); };
          transaction.onabort = () => reject(failure ?? asError(transaction.error, 'Worldbook group save aborted'));
      });
  },

  saveWorldbookGroupLayout: async (
      groups: readonly WorldbookGroupAssignment[],
  ): Promise<void> => {
      if (!groups.length) return;
      const normalized = groups.map(group => ({
          ...group,
          id: group.id.trim(),
          name: group.name.trim(),
          owner: group.owner.kind === 'character'
              ? { kind: 'character' as const, charId: group.owner.charId.trim() }
              : { kind: 'universal' as const },
      }));
      const duplicateIds = normalized.filter((group, index) => (
          normalized.findIndex(item => item.id === group.id) !== index
      ));
      if (duplicateIds.length) throw new Error('Worldbook layout contains duplicate groups');
      const errors = normalized.flatMap(group => validateWorldbookGroupAssignment(group));
      if (errors.length) throw new Error(`Worldbook group layout rejected: ${errors.join('; ')}`);
      const db = await openDB();
      const transaction = db.transaction(STORE_WORLDBOOK_GROUPS, 'readwrite');
      const store = transaction.objectStore(STORE_WORLDBOOK_GROUPS);
      const request = store.getAll();
      return new Promise((resolve, reject) => {
          let failure: Error | undefined;
          const abortWith = (error: unknown) => {
              failure = asError(error, 'Worldbook group layout save failed');
              try { transaction.abort(); } catch { reject(failure); }
          };
          request.onsuccess = () => {
              try {
                  const existing = new Map(
                      ((request.result || []) as WorldbookGroupAssignment[])
                          .map(group => [group.id, group]),
                  );
                  normalized.forEach(group => {
                      const stored = existing.get(group.id);
                      const sameOwner = stored && stored.owner.kind === group.owner.kind && (
                          stored.owner.kind === 'universal'
                          || (group.owner.kind === 'character' && stored.owner.charId === group.owner.charId)
                      );
                      if (!stored || stored.name.trim() !== group.name || !sameOwner) {
                          throw new Error(`Worldbook group ${group.id} cannot be reordered`);
                      }
                  });
                  normalized.forEach(group => store.put(group));
              } catch (error) {
                  abortWith(error);
              }
          };
          request.onerror = () => abortWith(request.error);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => {
              failure ??= asError(transaction.error, 'Worldbook group layout save failed');
          };
          transaction.onabort = () => reject(
              failure ?? asError(transaction.error, 'Worldbook group layout save aborted'),
          );
      });
  },

  saveWorldbookRevision: async (
      book: Worldbook,
      expectedActiveRevisionId: string | null,
  ): Promise<CharacterProfile[]> => {
      return persistWorldbookWithMountedCaches(book, expectedActiveRevisionId);
  },

  saveWorldbookEntriesAtomically: async (books: readonly Worldbook[]): Promise<void> => {
      await persistNewWorldbookEntriesAtomically(books);
  },

  getAllWorldGrowthCandidates: async (): Promise<WorldGrowthCandidate[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_WORLDBOOK_GROWTH_CANDIDATES)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_WORLDBOOK_GROWTH_CANDIDATES, 'readonly');
          const request = transaction.objectStore(STORE_WORLDBOOK_GROWTH_CANDIDATES).getAll();
          request.onsuccess = () => {
              const candidates = (request.result || []) as WorldGrowthCandidate[];
              const invalid = candidates.flatMap(candidate => validateWorldGrowthCandidate(candidate));
              if (invalid.length) {
                  reject(new Error(`Stored World growth candidates are invalid: ${invalid.join('; ')}`));
                  return;
              }
              resolve(candidates);
          };
          request.onerror = () => reject(request.error);
      });
  },

  saveWorldGrowthCandidate: async (candidate: WorldGrowthCandidate): Promise<void> => {
      await persistWorldGrowthCandidateRecord(candidate);
  },

  saveWorldGrowthCandidatesAtomically: async (
      candidates: readonly WorldGrowthCandidate[],
  ): Promise<void> => {
      await persistWorldGrowthCandidatesAtomically(candidates);
  },

  commitAcceptedWorldGrowthCandidate: async (input: {
      entry: Worldbook;
      candidate: WorldGrowthCandidate;
      reviewedDraft?: WorldGrowthCandidatePlayerReview;
      expectedBaseRevisionId: string | null;
      expectedCandidateUpdatedAt: number;
  }): Promise<CharacterProfile[]> => persistAcceptedWorldGrowthCandidate(input),

  getWorldbookProjectionDeliveryReceipts: async (
      scopeKey: string,
  ): Promise<WorldbookProjectionDeliveryReceipt[]> => {
      if (!scopeKey.trim()) throw new Error('Worldbook delivery receipt scopeKey is required');
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_WORLDBOOK_PROJECTION_RECEIPTS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_WORLDBOOK_PROJECTION_RECEIPTS, 'readonly');
          const request = transaction.objectStore(STORE_WORLDBOOK_PROJECTION_RECEIPTS)
              .index('scopeKey')
              .getAll(IDBKeyRange.only(scopeKey));
          request.onsuccess = () => {
              try {
                  const receipts = (request.result || []) as WorldbookProjectionDeliveryReceipt[];
                  receipts.forEach(assertWorldbookProjectionDeliveryReceipt);
                  resolve(receipts);
              } catch (error) {
                  reject(error);
              }
          };
          request.onerror = () => reject(request.error);
      });
  },

  saveWorldbookProjectionDeliveryReceipt: async (
      receipt: WorldbookProjectionDeliveryReceipt,
  ): Promise<void> => persistWorldbookProjectionDeliveryReceipt(receipt),

  getAllNovels: async (): Promise<NovelBook[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_NOVELS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_NOVELS, 'readonly');
          const store = transaction.objectStore(STORE_NOVELS);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveNovel: async (novel: NovelBook): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_NOVELS, 'readwrite');
      const request = transaction.objectStore(STORE_NOVELS).put(novel);
      return new Promise((resolve, reject) => {
          let failure: Error | undefined;
          request.onerror = () => {
              failure = asError(request.error, 'Novel save failed');
          };
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(
              failure ?? asError(transaction.error, 'Novel save failed'),
          );
          transaction.onabort = () => reject(
              failure ?? asError(transaction.error, 'Novel save aborted'),
          );
      });
  },

  deleteNovel: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_NOVELS, 'readwrite');
      const request = transaction.objectStore(STORE_NOVELS).delete(id);
      return new Promise((resolve, reject) => {
          let failure: Error | undefined;
          request.onerror = () => {
              failure = asError(request.error, 'Novel delete failed');
          };
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(
              failure ?? asError(transaction.error, 'Novel delete failed'),
          );
          transaction.onabort = () => reject(
              failure ?? asError(transaction.error, 'Novel delete aborted'),
          );
      });
  },

  // --- BANK / PET APP LOGIC ---
  getBankState: async (): Promise<BankFullState | null> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_BANK_DATA)) { resolve(null); return; }
          const transaction = db.transaction(STORE_BANK_DATA, 'readonly');
          const store = transaction.objectStore(STORE_BANK_DATA);
          const req = store.get('main_state');
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
      });
  },

  saveBankState: async (state: BankFullState): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_BANK_DATA, 'readwrite');
      // Strip dollhouse from the main state save (dollhouse is saved separately)
      const { dollhouse: _dh, ...shopWithoutDollhouse } = (state.shop || {}) as any;
      const cleanState = { ...state, shop: shopWithoutDollhouse };
      transaction.objectStore(STORE_BANK_DATA).put({ ...cleanState, id: 'main_state' });
      return new Promise((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  },

  // Dollhouse state saved separately (same pattern as RoomApp's per-character roomConfig)
  getBankDollhouse: async (): Promise<DollhouseState | null> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_BANK_DATA)) { resolve(null); return; }
          const transaction = db.transaction(STORE_BANK_DATA, 'readonly');
          const store = transaction.objectStore(STORE_BANK_DATA);
          const req = store.get('dollhouse_state');
          req.onsuccess = () => resolve(req.result?.data || null);
          req.onerror = () => reject(req.error);
      });
  },

  saveBankDollhouse: async (state: DollhouseState): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_BANK_DATA, 'readwrite');
      transaction.objectStore(STORE_BANK_DATA).put({ id: 'dollhouse_state', data: state });
      return new Promise((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  },

  getAllTransactions: async (): Promise<BankTransaction[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_BANK_TX)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_BANK_TX, 'readonly');
          const store = transaction.objectStore(STORE_BANK_TX);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveTransaction: async (txData: BankTransaction): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_BANK_TX, 'readwrite');
      transaction.objectStore(STORE_BANK_TX).put(txData);
  },

  deleteTransaction: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_BANK_TX, 'readwrite');
      transaction.objectStore(STORE_BANK_TX).delete(id);
  },

  // --- Songs (Songwriting App) ---
  getAllSongs: async (): Promise<SongSheet[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_SONGS)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_SONGS, 'readonly');
          const store = transaction.objectStore(STORE_SONGS);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveSong: async (song: SongSheet): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_SONGS, 'readwrite');
      transaction.objectStore(STORE_SONGS).put(song);
  },

  deleteSong: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_SONGS, 'readwrite');
      transaction.objectStore(STORE_SONGS).delete(id);
  },

  // --- Guidebook (攻略本) ---
  getAllGuidebookSessions: async (): Promise<GuidebookSession[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_GUIDEBOOK)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_GUIDEBOOK, 'readonly');
          const store = transaction.objectStore(STORE_GUIDEBOOK);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  saveGuidebookSession: async (session: GuidebookSession): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GUIDEBOOK, 'readwrite');
      transaction.objectStore(STORE_GUIDEBOOK).put(session);
  },

  deleteGuidebookSession: async (id: string): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_GUIDEBOOK, 'readwrite');
      transaction.objectStore(STORE_GUIDEBOOK).delete(id);
  },

  // ── LifeSim (模拟人生) ────────────────────────────────────
  getLifeSimState: async (): Promise<LifeSimState | null> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(STORE_LIFE_SIM)) return null;
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_LIFE_SIM, 'readonly');
          const request = transaction.objectStore(STORE_LIFE_SIM).get('main');
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
      });
  },

  saveLifeSimState: async (state: LifeSimState): Promise<void> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_LIFE_SIM, 'readwrite');
          transaction.objectStore(STORE_LIFE_SIM).put({ ...state, id: 'main' });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  },

  clearLifeSimState: async (): Promise<void> => {
      const db = await openDB();
      const transaction = db.transaction(STORE_LIFE_SIM, 'readwrite');
      transaction.objectStore(STORE_LIFE_SIM).clear();
  },

  getRawStoreData: async (storeName: string): Promise<any[]> => {
      const db = await openDB();
      if (!db.objectStoreNames.contains(storeName)) return [];
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly');
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
      });
  },

  exportFullData: async (): Promise<Partial<FullBackupData>> => {
      const db = await openDB();
      
      const getAllFromStore = (storeName: string): Promise<any[]> => {
          if (!db.objectStoreNames.contains(storeName)) {
              return Promise.reject(new Error(`Whole-device backup store is missing: ${storeName}`));
          }
          return new Promise((resolve, reject) => {
              let tx: IDBTransaction;
              let req: IDBRequest<any[]>;
              try {
                  tx = db.transaction(storeName, 'readonly');
                  req = tx.objectStore(storeName).getAll();
              } catch (error) {
                  reject(asError(error, `Whole-device backup could not read ${storeName}`));
                  return;
              }
              req.onsuccess = () => resolve(req.result || []);
              req.onerror = () => reject(asError(
                  req.error,
                  `Whole-device backup could not read ${storeName}`,
              ));
              tx.onabort = () => reject(asError(
                  tx.error,
                  `Whole-device backup read aborted for ${storeName}`,
              ));
          });
      };

      const [characters, messages, themes, emojis, emojiCategories, assets, galleryImages, userProfiles, diaries, tasks, anniversaries, roomTodos, roomNotes, groups, journalStickers, socialPosts, courses, games, worldbookGroups, worldbooks, worldbookGrowthCandidates, worldbookProjectionDeliveryReceipts, novels, bankTx, bankData, songs, quizzes, guidebookSessions, scheduledMessages, companionWakeupRules, companionWakeupLogs, lifeSimStates] = await Promise.all([
          getAllFromStore(STORE_CHARACTERS),
          getAllFromStore(STORE_MESSAGES),
          getAllFromStore(STORE_THEMES),
          getAllFromStore(STORE_EMOJIS),
          getAllFromStore(STORE_EMOJI_CATEGORIES),
          getAllFromStore(STORE_ASSETS),
          getAllFromStore(STORE_GALLERY),
          getAllFromStore(STORE_USER),
          getAllFromStore(STORE_DIARIES),
          getAllFromStore(STORE_TASKS),
          getAllFromStore(STORE_ANNIVERSARIES),
          getAllFromStore(STORE_ROOM_TODOS),
          getAllFromStore(STORE_ROOM_NOTES),
          getAllFromStore(STORE_GROUPS),
          getAllFromStore(STORE_JOURNAL_STICKERS),
          getAllFromStore(STORE_SOCIAL_POSTS),
          getAllFromStore(STORE_COURSES),
          getAllFromStore(STORE_GAMES),
          getAllFromStore(STORE_WORLDBOOK_GROUPS),
          getAllFromStore(STORE_WORLDBOOKS),
          getAllFromStore(STORE_WORLDBOOK_GROWTH_CANDIDATES),
          getAllFromStore(STORE_WORLDBOOK_PROJECTION_RECEIPTS),
          getAllFromStore(STORE_NOVELS),
          getAllFromStore(STORE_BANK_TX),
          getAllFromStore(STORE_BANK_DATA),
          getAllFromStore(STORE_SONGS),
          getAllFromStore(STORE_QUIZZES),
          getAllFromStore(STORE_GUIDEBOOK),
          getAllFromStore(STORE_SCHEDULED),
          getAllFromStore(STORE_COMPANION_WAKEUPS),
          getAllFromStore(STORE_COMPANION_WAKEUP_LOGS),
          getAllFromStore(STORE_LIFE_SIM),
      ]);

      const userProfile = userProfiles.length > 0
          ? normalizeUserPersonaProfile(userProfiles[0] as UserProfile)
          : undefined;

      const mainState = bankData.find((d: any) => d.id === 'main_state');
      const dollhouseRecord = bankData.find((d: any) => d.id === 'dollhouse_state');

      return {
          characters, messages, customThemes: themes, savedEmojis: emojis, emojiCategories, assets, galleryImages, userProfile, diaries, tasks, anniversaries, roomTodos, roomNotes, groups, savedJournalStickers: journalStickers, socialPosts, courses, games, worldbookGroups, worldbooks, worldbookGrowthCandidates, worldbookProjectionDeliveryReceipts, novels,
          bankState: mainState ? { ...mainState, id: undefined } : undefined,
          bankDollhouse: dollhouseRecord?.data || undefined,
          bankTransactions: bankTx,
          songs,
          quizSessions: quizzes,
          guidebookSessions,
          scheduledMessages,
          companionWakeupRules,
          companionWakeupLogs,
          lifeSimState: lifeSimStates[0] || null
      };
  },

  importFullData: async (data: FullBackupData): Promise<void> => {
      const normalizedWorldbooks = data.worldbooks?.map(normalizeWorldbookEntry);
      const worldbookGroupErrors = (data.worldbookGroups || [])
          .flatMap(group => validateWorldbookGroupAssignment(group));
      if (worldbookGroupErrors.length) {
          throw new Error(`Worldbook group backup rejected: ${worldbookGroupErrors.join('; ')}`);
      }
      const worldGrowthCandidateErrors = (data.worldbookGrowthCandidates || [])
          .flatMap(validateWorldGrowthCandidate);
      if (worldGrowthCandidateErrors.length) {
          throw new Error(`World growth candidate backup rejected: ${worldGrowthCandidateErrors.join('; ')}`);
      }
      (data.worldbookProjectionDeliveryReceipts || [])
          .forEach(assertWorldbookProjectionDeliveryReceipt);
      const db = await openDB();
      
      const availableStores = [
          STORE_CHARACTERS, STORE_MESSAGES, STORE_THEMES, STORE_EMOJIS, STORE_EMOJI_CATEGORIES,
          STORE_ASSETS, STORE_GALLERY, STORE_USER, STORE_DIARIES,
          STORE_TASKS, STORE_ANNIVERSARIES, STORE_ROOM_TODOS, STORE_ROOM_NOTES,
          STORE_GROUPS, STORE_JOURNAL_STICKERS, STORE_SOCIAL_POSTS, STORE_COURSES, STORE_GAMES, STORE_WORLDBOOK_GROUPS, STORE_WORLDBOOKS, STORE_WORLDBOOK_GROWTH_CANDIDATES, STORE_WORLDBOOK_PROJECTION_RECEIPTS, STORE_NOVELS, STORE_SONGS,
          STORE_BANK_TX, STORE_BANK_DATA,
          STORE_QUIZZES,
          STORE_GUIDEBOOK,
          STORE_SCHEDULED,
          STORE_COMPANION_WAKEUPS,
          STORE_COMPANION_WAKEUP_LOGS,
          STORE_LIFE_SIM
      ].filter(name => db.objectStoreNames.contains(name));

      const tx = db.transaction(availableStores, 'readwrite');

      const clearAndAdd = (storeName: string, items: any[]) => {
          if (!availableStores.includes(storeName)) return;
          if (items === undefined || items === null) return;
          
          const store = tx.objectStore(storeName);
          store.clear();
          items.forEach(item => store.put(item));
      };

      const mergeStore = (storeName: string, items: any[]) => {
          if (!availableStores.includes(storeName)) return;
          if (!items || items.length === 0) return;
          
          const store = tx.objectStore(storeName);
          items.forEach(item => store.put(item));
      };

      if (data.characters) {
          if (data.mediaAssets) {
              data.characters = data.characters.map(c => {
                  const media = data.mediaAssets?.find(m => m.charId === c.id);
                  if (media) {
                      return {
                          ...c,
                          avatar: media.avatar || c.avatar, 
                          sprites: media.sprites || c.sprites,
                          chatBackground: media.backgrounds?.chat || c.chatBackground,
                          dateBackground: media.backgrounds?.date || c.dateBackground,
                          roomConfig: c.roomConfig ? {
                              ...c.roomConfig,
                              wallImage: media.backgrounds?.roomWall || c.roomConfig.wallImage,
                              floorImage: media.backgrounds?.roomFloor || c.roomConfig.floorImage,
                              items: c.roomConfig.items.map(item => {
                                  const img = media.roomItems?.[item.id];
                                  return img ? { ...item, image: img } : item;
                              })
                          } : c.roomConfig
                      } as CharacterProfile;
                  }
                  return c;
              });
          }
          clearAndAdd(STORE_CHARACTERS, data.characters);
      } else if (data.mediaAssets && availableStores.includes(STORE_CHARACTERS)) {
          const charStore = tx.objectStore(STORE_CHARACTERS);
          const request = charStore.getAll();
          request.onsuccess = () => {
              const existingChars = request.result as CharacterProfile[];
              if (existingChars && existingChars.length > 0) {
                  const updatedChars = existingChars.map(c => {
                      const media = data.mediaAssets?.find(m => m.charId === c.id);
                      if (media) {
                          return {
                              ...c,
                              avatar: media.avatar || c.avatar, 
                              sprites: media.sprites || c.sprites, 
                              chatBackground: media.backgrounds?.chat || c.chatBackground,
                              dateBackground: media.backgrounds?.date || c.dateBackground,
                              roomConfig: c.roomConfig ? {
                                  ...c.roomConfig,
                                  wallImage: media.backgrounds?.roomWall || c.roomConfig.wallImage,
                                  floorImage: media.backgrounds?.roomFloor || c.roomConfig.floorImage,
                                  items: c.roomConfig.items.map(item => {
                                      const img = media.roomItems?.[item.id];
                                      return img ? { ...item, image: img } : item;
                                  })
                              } : c.roomConfig
                          } as CharacterProfile;
                      }
                      return c;
                  });
                  updatedChars.forEach(c => charStore.put(c));
              }
          };
      }

      if (data.messages) {
           if (availableStores.includes(STORE_MESSAGES) && data.messages.length > 0) {
               const store = tx.objectStore(STORE_MESSAGES);
               const isPatchMode = !data.characters;
               if (!isPatchMode) {
                   store.clear();
               }
               data.messages.forEach(m => store.put(m)); 
           }
      }
      
      if (data.customThemes) mergeStore(STORE_THEMES, data.customThemes);
      if (data.savedEmojis) mergeStore(STORE_EMOJIS, data.savedEmojis);
      if (data.emojiCategories) mergeStore(STORE_EMOJI_CATEGORIES, data.emojiCategories); 
      if (data.assets !== undefined) clearAndAdd(STORE_ASSETS, data.assets || []);
      if (data.savedJournalStickers) mergeStore(STORE_JOURNAL_STICKERS, data.savedJournalStickers);

      if (data.galleryImages) clearAndAdd(STORE_GALLERY, data.galleryImages);
      if (data.diaries) clearAndAdd(STORE_DIARIES, data.diaries);
      if (data.tasks) clearAndAdd(STORE_TASKS, data.tasks);
      if (data.anniversaries) clearAndAdd(STORE_ANNIVERSARIES, data.anniversaries);
      if (data.roomTodos) clearAndAdd(STORE_ROOM_TODOS, data.roomTodos);
      if (data.roomNotes) clearAndAdd(STORE_ROOM_NOTES, data.roomNotes);
      if (data.groups) clearAndAdd(STORE_GROUPS, data.groups);
      if (data.socialPosts) clearAndAdd(STORE_SOCIAL_POSTS, data.socialPosts);
      if (data.courses) clearAndAdd(STORE_COURSES, data.courses);
      if (data.games) clearAndAdd(STORE_GAMES, data.games);
      if (data.worldbookGroups) clearAndAdd(STORE_WORLDBOOK_GROUPS, data.worldbookGroups);
      if (normalizedWorldbooks) clearAndAdd(STORE_WORLDBOOKS, normalizedWorldbooks);
      if (data.worldbookGrowthCandidates) {
          clearAndAdd(STORE_WORLDBOOK_GROWTH_CANDIDATES, data.worldbookGrowthCandidates);
      }
      if (data.worldbookProjectionDeliveryReceipts) {
          clearAndAdd(STORE_WORLDBOOK_PROJECTION_RECEIPTS, data.worldbookProjectionDeliveryReceipts);
      }
      if (data.novels) clearAndAdd(STORE_NOVELS, data.novels);
      if (data.songs) clearAndAdd(STORE_SONGS, data.songs);
      if (data.quizSessions) clearAndAdd(STORE_QUIZZES, data.quizSessions);
      if (data.guidebookSessions) clearAndAdd(STORE_GUIDEBOOK, data.guidebookSessions);
      if (data.scheduledMessages !== undefined && availableStores.includes(STORE_SCHEDULED)) {
          const store = tx.objectStore(STORE_SCHEDULED);
          store.clear();
          (data.scheduledMessages || []).forEach(item => store.put(item));
      }
      if (data.companionWakeupRules !== undefined) clearAndAdd(STORE_COMPANION_WAKEUPS, data.companionWakeupRules || []);
      if (data.companionWakeupLogs !== undefined) clearAndAdd(STORE_COMPANION_WAKEUP_LOGS, data.companionWakeupLogs || []);
      if (data.lifeSimState !== undefined && availableStores.includes(STORE_LIFE_SIM)) {
          const store = tx.objectStore(STORE_LIFE_SIM);
          store.clear();
          if (data.lifeSimState) {
              store.put({ ...data.lifeSimState, id: 'main' });
          }
      }
      if (data.bankTransactions) clearAndAdd(STORE_BANK_TX, data.bankTransactions);
      if (data.userProfile) {
          if (availableStores.includes(STORE_USER)) {
              const store = tx.objectStore(STORE_USER);
              store.clear();
              store.put({ ...normalizeUserPersonaProfile(data.userProfile), id: 'me' });
          }
      }

      if (data.bankState || data.bankDollhouse) {
          if (availableStores.includes(STORE_BANK_DATA)) {
              const store = tx.objectStore(STORE_BANK_DATA);
              store.clear();
              if (data.bankState) {
                  store.put({ ...data.bankState, id: 'main_state' });
              }
              if (data.bankDollhouse) {
                  store.put({ id: 'dollhouse_state', data: data.bankDollhouse });
              }
          }
      }

      return new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(asError(tx.error, 'Full data import failed'));
          tx.onabort = () => reject(asError(tx.error, 'Full data import aborted'));
      });
  }
};
