
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { CharacterProfile, SocialPost, SocialComment, SubAccount, SocialAppProfile, SocialNewsCategory, SocialRelationshipScope } from '../types';
import { ContextBuilder } from '../utils/context';
import { processImage } from '../utils/file';
import Modal from '../components/os/Modal';
import { safeResponseJson } from '../utils/safeApi';
import { DotsThreeVertical, House, Package, ShareNetwork, TrashSimple, User, Warning } from '@phosphor-icons/react';
import AppHeader from '../components/shell/AppHeader';
import { SHELL_APP_HEADER_CONTENT_TOP } from '../components/shell/shellLayout';
import { Capacitor } from '@capacitor/core';
import {
    buildPersonaScopePromptNote,
    filterCharactersForPersonaSurface,
    resolvePersonaRouteScope,
} from '../utils/personaRouteScope';
import {
    activeSocialRelationshipScope,
    inferLegacySocialPostScope,
    socialPostMatchesScope,
    socialScopesMatch,
} from '../utils/socialScope';

const TWEMOJI_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72';
const twemojiUrl = (codepoint: string) => `${TWEMOJI_BASE}/${codepoint}.png`;
const SOCIAL_DETAIL_HEADER_VERTICAL_OFFSET_PX = 3;

const STICKER_OPTIONS = [
    { code: '2728', label: 'sparkles' },
    { code: '1f388', label: 'balloon' },
    { code: '1f3a8', label: 'palette' },
    { code: '1f4f7', label: 'camera' },
    { code: '1f3b5', label: 'music' },
    { code: '1f3ae', label: 'game' },
    { code: '1f354', label: 'burger' },
    { code: '1f3d6-fe0f', label: 'beach' },
    { code: '1f4a4', label: 'sleep' },
    { code: '1f4a1', label: 'idea' },
];

// --- Constants & Styles ---
const BRAND_COLOR = '#ff2442'; // Premium Red
const PULL_REFRESH_THRESHOLD = 72;
const MOMENTS_USER_ID_KEY = 'moments_user_id';
const MOMENTS_USER_COVER_ASSET_ID = 'moments_user_cover';
const MOMENTS_PROFILE_ASSET_ID = 'moments_profile';
const MOMENTS_CHAR_HANDLES_KEY = 'moments_char_handles';
const NEWS_LONGFORM_MIN_CHARS = 500;
const POINTER_PULL_DEADZONE_PX = 8;
const DEEPSPACE_MALE_LEAD_IDS = new Set([
    'builtin-xavier',
    'builtin-zayne',
    'builtin-daily-companion',
    'builtin-sylus',
    'builtin-caleb',
]);
const DEEPSPACE_CROSS_WORLDBOOK_IDS = new Set([
    'builtin-deepspace-optional-male-leads-npc-index',
    'builtin-deepspace-story-crossover',
]);
const USER_POST_FIRST_REPLY_DELAY_MS = 75_000;
const USER_POST_REPLY_RETRY_MS = 5 * 60_000;
const USER_POST_REPLY_STAGGER_MIN_MS = 55_000;
const USER_POST_REPLY_STAGGER_MAX_MS = 150_000;

// Advanced Gradients for "Image" backgrounds
const POST_STYLES = [
    { name: 'Sunset', bg: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 99%, #FECFEF 100%)', text: '#fff' },
    { name: 'Ocean', bg: 'linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)', text: '#fff' },
    { name: 'Peach', bg: 'linear-gradient(to top, #fff1eb 0%, #ace0f9 100%)', text: '#555' },
    { name: 'Night', bg: 'linear-gradient(to top, #30cfd0 0%, #330867 100%)', text: '#fff' },
    { name: 'Love', bg: 'linear-gradient(to top, #f43b47 0%, #453a94 100%)', text: '#fff' },
    { name: 'Fresh', bg: 'linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)', text: '#444' },
    { name: 'Lemon', bg: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)', text: '#fff' },
    { name: 'Plum', bg: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)', text: '#fff' },
];

const NEWS_CHANNELS: Array<{
    category: SocialNewsCategory;
    label: string;
    names: string[];
    prompt: string;
    titleLength: string;
    contentLength: string;
    tags: string[];
}> = [
    {
        category: 'mainline',
        label: '主线异常',
        names: ['便民速递', '今日绕行'],
        prompt: '准确、短、克制，像便民提醒或绕行提示；给现象、地点和建议，但不要把传闻盖章成事实。',
        titleLength: '12-22字',
        contentLength: '35-70字',
        tags: ['主线异常', '便民预警'],
    },
    {
        category: 'sidequest',
        label: '小道消息',
        names: ['边角料', '野史不歪', '诡秘谈'],
        prompt: '按媒体号拆分成短八卦、浮夸野史或完整怪谈；可以离谱但必须像传闻，适合任务支线、NPC扩张、城市怪事。',
        titleLength: '12-26字',
        contentLength: '按媒体号为220-900字，其中长篇媒体正文不得少于500字',
        tags: ['小道消息', '支线钩子'],
    },
    {
        category: 'date',
        label: '约会出行',
        names: ['今天想见你', '恋爱出走指南', '两个人的地图'],
        prompt: '按媒体号拆分成轻短邀约、长篇出走故事或路线散文；粉红但不限定暧昧期，要有氛围、路线、天气、并肩和等待。',
        titleLength: '10-24字',
        contentLength: '按媒体号为220-800字，其中长篇媒体正文不得少于500字',
        tags: ['约会灵感', '出行种草'],
    },
    {
        category: 'daily',
        label: '吃喝日常',
        names: ['今天吃点什么', '便利店观察员', '微醺菜单'],
        prompt: '轻软、生活化，适合分享进聊天或被主动来信引用；不要写成长篇测评。',
        titleLength: '8-18字',
        contentLength: '35-80字',
        tags: ['日常陪伴', '吃喝小报'],
    },
];

const NEWS_CHANNEL_BY_CATEGORY = NEWS_CHANNELS.reduce((acc, item) => {
    acc[item.category] = item;
    return acc;
}, {} as Record<SocialNewsCategory, (typeof NEWS_CHANNELS)[number]>);
const NEWS_CHANNEL_NAMES = new Set(NEWS_CHANNELS.flatMap(item => item.names));
const DEFAULT_NEWS_CATEGORY: SocialNewsCategory = 'sidequest';
const NEWS_CHANNEL_STYLE_NOTES: Record<string, string> = {
    便民速递: '短讯体，90-160字。开头直接报地点和现象，接影响范围与建议；准确、冷静、少形容词，不讲完整故事。',
    今日绕行: '现场绕行体，100-180字。用“几点—哪里—看见什么—怎么绕”的顺序，像滚动更新的避险提示。',
    边角料: '碎片投稿体，220-360字。用匿名爆料、聊天截句、围观反应拼出八卦，信息碎、语气欠、结尾留钩子。',
    野史不歪: '浮夸小报长文，520-800字。先下爆炸性标题式判断，再写三段“据说/有人翻到/更离谱的是”，混入旧记录、旁证、反驳和自相矛盾的细节；抓眼球但不盖章事实。',
    诡秘谈: '怪谈投稿长篇，650-950字。必须是故事而非报告：从投稿人身份和具体时刻切入，写场景、气味/声音、人物对话、异常逐级升级、一次似乎结束的假收束，再用最后一个无法解释的细节扎尾。允许浮夸、发散、吊胃口，正文至少500字。',
    今天想见你: '轻粉红邀约体，220-360字。像一封忍不住转发的小邀请，有天气、见面借口和一句克制的煽动。',
    恋爱出走指南: '约会叙事长篇，520-800字。以“如果从某个时间出发”为开头，沿路线写三到四个停靠点、两人的小动作、意外和回程余韵；像可照着走的故事，正文至少500字。',
    两个人的地图: '路线散文长篇，500-760字。用地图坐标/路标串联散步、等待、坐下、走错路和回程，把地点写成人与人距离的变化，正文至少500字。',
    今天吃点什么: '日常安利体，180-280字。从一道食物切入，写口感、适合的时刻和一句可直接拿去问候人的话。',
    便利店观察员: '货架观察体，200-320字。新品、货架、小票、夜班店员和深夜灯光都可以，像带吐槽的生活切片，不写成长测评。',
    微醺菜单: '夜间菜单体，240-380字。用杯沿、冰块、灯色、音乐和散场时间组织段落，保持陪伴感，不写成酒评。',
};
const NEWS_LONGFORM_CHANNELS = new Set(['野史不歪', '诡秘谈', '恋爱出走指南', '两个人的地图']);

const getRandomStyle = () => POST_STYLES[Math.floor(Math.random() * POST_STYLES.length)];
type SocialTab = 'moments' | 'news' | 'me';
const getPostKind = (post: SocialPost) => post.kind || 'moment';
const isNewsCategory = (value?: string): value is SocialNewsCategory => (
    value === 'mainline' || value === 'sidequest' || value === 'date' || value === 'daily'
);
const pickFrom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const uniqueById = <T extends { id: string }>(items: T[]): T[] => Array.from(new Map(items.map(item => [item.id, item])).values());
const randomReplyDelayMs = () => USER_POST_REPLY_STAGGER_MIN_MS + Math.floor(Math.random() * (USER_POST_REPLY_STAGGER_MAX_MS - USER_POST_REPLY_STAGGER_MIN_MS + 1));
const normalizeNewsCategory = (value?: string): SocialNewsCategory => (
    isNewsCategory(value) ? value : DEFAULT_NEWS_CATEGORY
);
const normalizeNewsChannel = (rawName: string | undefined, category: SocialNewsCategory): string => {
    const trimmed = rawName?.trim();
    if (trimmed && NEWS_CHANNEL_NAMES.has(trimmed)) return trimmed;
    return pickFrom(NEWS_CHANNEL_BY_CATEGORY[category].names);
};
const newsPromptTable = () => NEWS_CHANNELS.map(item => (
    `- category="${item.category}"｜${item.label}｜媒体号只能从：${item.names.join('、')}｜标题${item.titleLength}｜正文${item.contentLength}｜${item.prompt}`
)).join('\n');
const newsChannelStyleTable = () => Object.entries(NEWS_CHANNEL_STYLE_NOTES)
    .map(([name, note]) => `- ${name}: ${note}`)
    .join('\n');
const countNewsContentChars = (content?: string) => String(content || '').replace(/\s/g, '').length;
const isLongformNewsChannel = (channel?: string) => !!channel && NEWS_LONGFORM_CHANNELS.has(channel);
const normalizeGeneratedNewsItem = (item: any) => {
    const category = normalizeNewsCategory(item?.newsCategory || item?.category || item?.channelCategory);
    const channel = normalizeNewsChannel(item?.newsChannel || item?.sourceName || item?.authorName, category);
    return {
        ...item,
        category,
        newsCategory: category,
        sourceName: channel,
        authorName: channel,
        newsChannel: channel,
        content: String(item?.content || item?.summary || '').trim(),
    };
};
const isCodepointSticker = (token?: string) => !!token && /^[0-9a-f]+(?:-[0-9a-f]+)*(?:-fe0f)?$/i.test(token);
const isImageAsset = (token?: string) => !!token && (/^(data:image|blob:|https?:\/\/|\/)/i.test(token));
const renderPostSticker = (token?: string, className = 'w-16 h-16') => {
    if (!token) return <img src={twemojiUrl('2728')} alt="sparkles" className={className} />;
    if (isCodepointSticker(token)) return <img src={twemojiUrl(token)} alt="" className={className} />;
    return <span>{token}</span>;
};
const isInteractiveTarget = (target: EventTarget | null) => (
    target instanceof Element &&
    !!target.closest('button, input, textarea, select, a, label, [role="button"]')
);
const scopedSocialStorageKey = (base: string, scope?: SocialRelationshipScope) => (
    scope ? `${base}:v2:${scope.progressBundleId}:${scope.personaMaskId}` : base
);

// --- Robust JSON Parser ---
const safeParseJSON = (input: string) => {
    const clean = input.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        const parsed = JSON.parse(clean);
        if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed);
            if (keys.length === 1 && Array.isArray(parsed[keys[0]])) {
                return parsed[keys[0]];
            }
        }
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        try {
            const start = clean.indexOf('[');
            if (start === -1) return [];
            let end = clean.lastIndexOf('}');
            while (end > start) {
                const attempt = clean.substring(start, end + 1) + ']';
                try {
                    const result = JSON.parse(attempt);
                    if (Array.isArray(result)) return result;
                } catch (err) {}
                end = clean.lastIndexOf('}', end - 1);
            }
            return [];
        } catch (e2) {
            return [];
        }
    }
};

// --- Icons ---

const Icons = {
    Heart: ({ filled, onClick, className }: { filled?: boolean, onClick?: (e: any) => void, className?: string }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={filled ? BRAND_COLOR : "none"} stroke={filled ? BRAND_COLOR : "currentColor"} strokeWidth={2} className={`transition-transform active:scale-75 cursor-pointer ${className || "w-6 h-6"}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
    ),
    Star: ({ filled, onClick, className }: { filled?: boolean, onClick?: (e: any) => void, className?: string }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={filled ? "#fbbf24" : "none"} stroke={filled ? "#fbbf24" : "currentColor"} strokeWidth={2} className={`transition-transform active:scale-75 cursor-pointer ${className || "w-6 h-6"}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.563.563 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
    ),
    Share: ({ className, onClick }: { className?: string, onClick?: () => void }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className || "w-6 h-6"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
        </svg>
    ),
    ChatBubble: ({ className }: { className?: string }) => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className || "w-6 h-6"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
        </svg>
    ),
    Back: ({ onClick, className }: { onClick: () => void, className?: string }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className || "w-6 h-6 cursor-pointer text-slate-800"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
    ),
    Plus: ({ className }: { className?: string }) => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className || "w-6 h-6"}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
    ),
    Pencil: ({ className, onClick }: { className?: string, onClick?: () => void }) => (
        <svg onClick={onClick} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className || "w-4 h-4"}>
            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
        </svg>
    )
};

// --- Main App ---

const SocialApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, apiConfig, addToast, userProfile } = useOS();
    const [feed, setFeed] = useState<SocialPost[]>([]);
    const [activeTab, setActiveTab] = useState<SocialTab>('moments');
    const [isCreateOpen, setIsCreateOpen] = useState(false); 
    
    const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadingComments, setLoadingComments] = useState(false);
    
    // Post Creation State
    const [newPostTitle, setNewPostTitle] = useState('');
    const [newPostContent, setNewPostContent] = useState('');
    const [newPostEmoji, setNewPostEmoji] = useState('2728');

    // Comment Input State
    const [commentInput, setCommentInput] = useState('');
    const [isReplyingToUser, setIsReplyingToUser] = useState(false);

    // Settings / Handle Management
    const [showSettings, setShowSettings] = useState(false);
    const [showClearNewsConfirm, setShowClearNewsConfirm] = useState(false);
    const [showPostActions, setShowPostActions] = useState(false);
    const [showDeletePostConfirm, setShowDeletePostConfirm] = useState(false);
    const [characterHandles, setCharacterHandles] = useState<Record<string, SubAccount[]>>({});

    // Sharing State
    const [showShareModal, setShowShareModal] = useState(false);

    // Profile Sub-tab
    const [profileTab, setProfileTab] = useState<'notes' | 'collects'>('notes');

    // User Custom Profile State (Local - Decoupled from Global UserProfile)
    const [socialProfile, setSocialProfile] = useState<SocialAppProfile>({
        name: userProfile.name,
        avatar: userProfile.avatar,
        bio: '这个人很懒，什么都没写。'
    });
    const [userMomentsId, setUserMomentsId] = useState('95279527');
    const [userBgImage, setUserBgImage] = useState('');
    const [isEditingId, setIsEditingId] = useState(false);
    
    const userBgInputRef = useRef<HTMLInputElement>(null);
    const socialAvatarInputRef = useRef<HTMLInputElement>(null);
    const feedScrollRef = useRef<HTMLDivElement>(null);
    const pullStartYRef = useRef<number | null>(null);
    const pullStartedAtTopRef = useRef(false);
    const pointerPullStartYRef = useRef<number | null>(null);
    const pointerStartedAtTopRef = useRef(false);
    const pointerPullIdRef = useRef<number | null>(null);

    // Refs
    const commentsEndRef = useRef<HTMLDivElement>(null);
    const detailScrollRef = useRef<HTMLDivElement>(null);
    const prevCommentCountRef = useRef(0); // Track comment count to prevent initial jump
    const pendingReplyRef = useRef<Set<string>>(new Set());
    const deletedPostIdsRef = useRef<Set<string>>(new Set());
    const activeSocialScopeRef = useRef<SocialRelationshipScope | undefined>(undefined);
    const [pullDistance, setPullDistance] = useState(0);

    const personaScope = useMemo(() => (
        resolvePersonaRouteScope(userProfile, characters, activeCharacterId)
    ), [userProfile, characters, activeCharacterId]);
    const activeSocialScope = useMemo(() => (
        activeSocialRelationshipScope(userProfile)
    ), [userProfile]);
    activeSocialScopeRef.current = activeSocialScope;
    const socialProfileAssetId = scopedSocialStorageKey(MOMENTS_PROFILE_ASSET_ID, activeSocialScope);
    const socialCoverAssetId = scopedSocialStorageKey(MOMENTS_USER_COVER_ASSET_ID, activeSocialScope);
    const socialUserIdKey = scopedSocialStorageKey(MOMENTS_USER_ID_KEY, activeSocialScope);
    const socialScopedCharacters = useMemo(() => (
        filterCharactersForPersonaSurface(characters, personaScope, {
            surface: 'social',
            fallbackToAllWhenEmpty: false,
        })
    ), [characters, personaScope]);
    const activeCharacter = useMemo(() => (
        socialScopedCharacters.find(char => char.id === personaScope.preferredActiveCharacter?.id)
        || socialScopedCharacters.find(char => char.id === activeCharacterId)
        || socialScopedCharacters[0]
    ), [socialScopedCharacters, activeCharacterId, personaScope.preferredActiveCharacter?.id]);

    const isMaleLead = (char?: CharacterProfile | null) => Boolean(char && DEEPSPACE_MALE_LEAD_IDS.has(char.id));
    const hasMountedWorldbook = (char: CharacterProfile | undefined, ids: Set<string>) => (
        Boolean(char?.mountedWorldbooks?.some(book => ids.has(book.id)))
    );
    const allowsMaleLeadCrossover = useMemo(() => (
        hasMountedWorldbook(activeCharacter, DEEPSPACE_CROSS_WORLDBOOK_IDS)
    ), [activeCharacter]);
    const handleListForChar = (char: CharacterProfile) => {
        const handles = characterHandles[char.id] || [];
        if (handles.length > 0) return handles;
        return [{
            id: 'default',
            handle: char.socialProfile?.handle || char.name,
            note: '主账号'
        }];
    };
    const primaryHandleForChar = (char: CharacterProfile) => (
        handleListForChar(char).find(handle => handle.handle.trim())?.handle.trim() || char.name
    );
    const isExplicitSocialParticipant = (char: CharacterProfile) => (
        char.id === activeCharacter?.id ||
        char.proactiveConfig?.enabled === true ||
        char.activeMsg2Config?.enabled === true
    );
    const socialParticipants = useMemo(() => {
        const explicit = personaScope.hasLinkedFocus
            ? socialScopedCharacters
            : socialScopedCharacters.filter(isExplicitSocialParticipant);
        const fallback = activeCharacter ? [activeCharacter] : [];
        const base = uniqueById(explicit.length > 0 ? explicit : fallback);

        if (!activeCharacter || !isMaleLead(activeCharacter) || allowsMaleLeadCrossover) {
            return base.length > 0 ? base : socialScopedCharacters.slice(0, 1);
        }

        return base.filter(char => char.id === activeCharacter.id || !isMaleLead(char));
    }, [socialScopedCharacters, activeCharacter, allowsMaleLeadCrossover, personaScope.hasLinkedFocus]);
    const socialWorldScopeNote = useMemo(() => {
        const personaNote = buildPersonaScopePromptNote(personaScope, '朋友圈');
        if (!activeCharacter) return '当前没有明确激活角色；请保持朋友圈内容小范围、低交叉。';
        const prefix = `${personaNote}\n`;
        if (!isMaleLead(activeCharacter)) {
            return `${prefix}当前朋友圈以已激活角色「${activeCharacter.name}」和其相关人物为主；不要默认把未激活角色拉入同一熟人圈。`;
        }
        if (allowsMaleLeadCrossover) {
            return `${prefix}当前已启用五位男主共存/交叉资料包；可以让已激活角色因事件、地点、组织或用户行动自然交叉，但不要默认私交熟络。`;
        }
        const forbiddenNames = characters
            .filter(char => isMaleLead(char) && char.id !== activeCharacter.id)
            .map(char => char.name)
            .join('、');
        return `${prefix}当前未启用五位男主共存资料包；朋友圈只把「${activeCharacter.name}」视为当前男主。可以出现他相关的原生 NPC、路人或剧情新增 NPC，但禁止让其他男主${forbiddenNames ? `（${forbiddenNames}）` : ''}发动态、评论或被写成同一熟人圈人物。`;
    }, [activeCharacter, allowsMaleLeadCrossover, characters, personaScope]);
    const getRelatedParticipantsForPost = (post?: SocialPost | null) => {
        if (post && !socialPostMatchesScope(post, activeSocialScope)) return [];
        const postChar = post?.charId ? characters.find(char => char.id === post.charId) : undefined;
        const base = uniqueById([postChar, ...socialParticipants].filter(Boolean) as CharacterProfile[]);
        if (!activeCharacter || !isMaleLead(activeCharacter) || allowsMaleLeadCrossover) return base;
        return base.filter(char => char.id === activeCharacter.id || !isMaleLead(char));
    };
    const findAllowedCharForAuthor = (authorName: string, allowedChars: CharacterProfile[]) => (
        allowedChars.find(char => (
            char.name === authorName ||
            handleListForChar(char).some(handle => handle.handle === authorName)
        ))
    );
    const isForbiddenCrossLeadAuthor = (authorName: string, allowedChars: CharacterProfile[]) => (
        characters.some(char => (
            isMaleLead(char) &&
            !allowedChars.some(allowed => allowed.id === char.id) &&
            (char.name === authorName || handleListForChar(char).some(handle => handle.handle === authorName))
        ))
    );
    const buildUserPostReplyQueue = () => (
        socialParticipants
            .filter(char => handleListForChar(char).some(handle => handle.handle.trim()))
            .sort(() => 0.5 - Math.random())
            .slice(0, Math.min(3, Math.max(1, socialParticipants.length)))
            .map(char => char.id)
    );
    const showSocialReplyNotice = (comments: SocialComment[], post: SocialPost) => {
        if (
            comments.length === 0
            || deletedPostIdsRef.current.has(post.id)
            || !socialPostMatchesScope(post, activeSocialScopeRef.current)
        ) return;
        const first = comments[0];
        const names = Array.from(new Set(comments.map(comment => comment.authorName))).slice(0, 2);
        addToast(`${names.join('、')} 回复了你的朋友圈`, 'success');

        if (!Capacitor.isNativePlatform() && window.Notification && Notification.permission === 'granted') {
            try {
                const notif = new Notification('朋友圈有新回复', {
                    body: `${first.authorName}: ${first.content}`.slice(0, 120),
                    icon: first.authorAvatar || post.authorAvatar,
                    silent: false
                });
                notif.onclick = () => {
                    if (!socialPostMatchesScope(post, activeSocialScopeRef.current)) return;
                    window.focus();
                    setActiveTab('moments');
                    setSelectedPost(post);
                };
            } catch {}
        }
    };

    const scopedFeed = useMemo(() => (
        feed.filter(post => socialPostMatchesScope(post, activeSocialScope))
    ), [feed, activeSocialScope]);

    const visibleFeed = useMemo(() => {
        return scopedFeed.filter(post => activeTab === 'news' ? getPostKind(post) === 'news' : getPostKind(post) !== 'news');
    }, [scopedFeed, activeTab]);


    const displayFeed = visibleFeed;

    useEffect(() => {
        let cancelled = false;
        void DB.getSocialPosts().then(async posts => {
            const migrated = posts.map(post => {
                const inferredScope = inferLegacySocialPostScope(post, userProfile);
                return inferredScope && !socialScopesMatch(post.socialScope, inferredScope)
                    ? { ...post, socialScope: inferredScope }
                    : post;
            });
            const changed = migrated.filter((post, index) => post !== posts[index]);
            if (changed.length > 0) await Promise.all(changed.map(post => DB.saveSocialPost(post)));
            if (!cancelled) setFeed(migrated.sort((a, b) => b.timestamp - a.timestamp));
        }).catch(error => console.error('Failed to load Social posts:', error));
        return () => { cancelled = true; };
    }, [userProfile.personaMasks, userProfile.progressBundles]);

    useEffect(() => {
        let cancelled = false;
        const allowLegacyProfileFallback = (userProfile.personaMasks?.length || 1) === 1;
        const loadAssets = async () => {
            const scopedUserId = localStorage.getItem(socialUserIdKey);
            const legacyUserId = allowLegacyProfileFallback ? localStorage.getItem(MOMENTS_USER_ID_KEY) : null;
            const scopedBg = await DB.getAsset(socialCoverAssetId);
            const scopedProfile = await DB.getAsset(socialProfileAssetId);
            const legacyBg = !scopedBg && allowLegacyProfileFallback
                ? await DB.getAsset(MOMENTS_USER_COVER_ASSET_ID)
                : undefined;
            const legacyProfile = !scopedProfile && allowLegacyProfileFallback
                ? await DB.getAsset(MOMENTS_PROFILE_ASSET_ID)
                : undefined;
            if (cancelled) return;

            setUserMomentsId(scopedUserId || legacyUserId || '95279527');
            setUserBgImage(scopedBg || legacyBg || '');
            const rawProfile = scopedProfile || legacyProfile;
            let loadedProfile: SocialAppProfile | null = null;
            if (rawProfile) {
                try {
                    const parsed = JSON.parse(rawProfile) as Partial<SocialAppProfile>;
                    if (typeof parsed.name === 'string' && typeof parsed.avatar === 'string') {
                        loadedProfile = {
                            name: parsed.name,
                            avatar: parsed.avatar,
                            bio: typeof parsed.bio === 'string' ? parsed.bio : '',
                        };
                    }
                } catch {}
            }
            setSocialProfile(loadedProfile || {
                name: userProfile.name,
                avatar: userProfile.avatar,
                bio: userProfile.bio || '这个人很懒，什么都没写。',
            });
            setIsEditingId(false);
        };
        void loadAssets();
        return () => { cancelled = true; };
    }, [
        socialCoverAssetId,
        socialProfileAssetId,
        socialUserIdKey,
        userProfile.avatar,
        userProfile.bio,
        userProfile.name,
        userProfile.personaMasks?.length,
    ]);

    useEffect(() => {
        const savedHandles = localStorage.getItem(MOMENTS_CHAR_HANDLES_KEY);
        let initialHandles: Record<string, SubAccount[]> = {};
        if (savedHandles) {
            try { initialHandles = JSON.parse(savedHandles); } catch(e) {}
        }
        
        // Ensure every character has at least one default handle
        characters.forEach(c => {
            if (!initialHandles[c.id] || initialHandles[c.id].length === 0) {
                initialHandles[c.id] = [{ 
                    id: 'default', 
                    handle: c.socialProfile?.handle || c.name, 
                    note: '主账号' 
                }];
            }
        });
        setCharacterHandles(initialHandles);
    }, [characters.length]);

    useEffect(() => {
        if (selectedPost && !socialPostMatchesScope(selectedPost, activeSocialScope)) {
            setSelectedPost(null);
            setShowPostActions(false);
            setShowDeletePostConfirm(false);
            setShowShareModal(false);
        }
    }, [activeSocialScope, selectedPost]);

    // Save Handles to LocalStorage whenever updated
    useEffect(() => {
        if (Object.keys(characterHandles).length > 0) {
            localStorage.setItem(MOMENTS_CHAR_HANDLES_KEY, JSON.stringify(characterHandles));
        }
    }, [characterHandles]);

    // FIX: Only scroll to bottom if comment count INCREASES, not on initial load
    // This prevents the "jumping" behavior when opening a post
    useEffect(() => {
        if (selectedPost) {
            const currentCount = (selectedPost.comments || []).length;
            if (currentCount > prevCommentCountRef.current) {
                // New comment added: only scroll the internal detail panel.
                // Avoid scrollIntoView(), which can scroll outer containers and shift the whole app layout.
                const detailScroller = detailScrollRef.current;
                if (detailScroller) {
                    detailScroller.scrollTo({
                        top: detailScroller.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }
            prevCommentCountRef.current = currentCount;
        } else {
            prevCommentCountRef.current = 0; // Reset
        }
    }, [selectedPost?.comments?.length]);

    // --- Helpers ---

    const addSubAccount = (charId: string) => {
        const newAcct: SubAccount = {
            id: `sub-${Date.now()}`,
            handle: '新账号',
            note: '身份备注'
        };
        setCharacterHandles(prev => ({
            ...prev,
            [charId]: [...(prev[charId] || []), newAcct]
        }));
    };

    const updateSubAccount = (charId: string, acctId: string, field: keyof SubAccount, value: string) => {
        setCharacterHandles(prev => ({
            ...prev,
            [charId]: prev[charId].map(a => a.id === acctId ? { ...a, [field]: value } : a)
        }));
    };

    const deleteSubAccount = (charId: string, acctId: string) => {
        setCharacterHandles(prev => ({
            ...prev,
            [charId]: prev[charId].filter(a => a.id !== acctId)
        }));
    };

    const handleUserBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await processImage(file, { skipCompression: true });
                setUserBgImage(base64);
                await DB.saveAsset(socialCoverAssetId, base64);
                addToast('背景图已更新', 'success');
            } catch (err) {
                addToast('图片处理失败', 'error');
            }
        }
    };

    const handleUserBgDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            setUserBgImage('');
            if (userBgInputRef.current) userBgInputRef.current.value = '';
            await DB.deleteAsset(socialCoverAssetId);
            addToast('朋友圈封面已删除', 'success');
        } catch (err) {
            addToast('删除封面失败', 'error');
        }
    };

    const handleSocialAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await processImage(file);
                setSocialProfile(prev => ({ ...prev, avatar: base64 }));
            } catch (err: any) {
                addToast(err.message, 'error');
            }
        }
    };

    const saveUserProfileChanges = async () => {
        localStorage.setItem(socialUserIdKey, userMomentsId);
        await DB.saveAsset(socialProfileAssetId, JSON.stringify(socialProfile));
        setIsEditingId(false);
        addToast('主页资料已保存（仅在朋友圈生效）', 'success');
    };

    const persistFeed = (newFeed: SocialPost[]) => {
        setFeed(newFeed);
        Promise.all(newFeed.map(p => DB.saveSocialPost(p))).catch(console.error);
    };

    const updatePostInFeed = (post: SocialPost) => {
        if (deletedPostIdsRef.current.has(post.id)) return;
        setFeed(prev => {
            const next = prev.map(p => p.id === post.id ? post : p);
            void DB.saveSocialPost(post).catch(error => console.error('Failed to save Social post:', error));
            return next;
        });
        setSelectedPost(current => (current?.id === post.id ? post : current));
    };

    const socialCircleBudget = () => {
        const handleCount = socialScopedCharacters.reduce(
            (sum, char) => sum + (characterHandles[char.id]?.length || 0),
            0,
        );
        return Math.max(8, socialScopedCharacters.length + handleCount + 6);
    };

    const simulatedLikes = (kind: 'moment' | 'news', sourceType: SocialPost['sourceType'], category?: SocialNewsCategory, rawLikes?: unknown) => {
        const raw = typeof rawLikes === 'number' && Number.isFinite(rawLikes) ? Math.max(0, Math.round(rawLikes)) : undefined;
        if (kind === 'moment') {
            const circle = socialCircleBudget();
            const multiplier = sourceType === 'character' ? 2.4 : sourceType === 'user' ? 1.5 : 1.8;
            const cap = Math.max(6, Math.round(circle * multiplier));
            return Math.min(raw ?? Math.floor(Math.random() * (cap + 1)), cap);
        }
        const caps: Record<SocialNewsCategory, number> = {
            mainline: 260,
            sidequest: 420,
            date: 360,
            daily: 220,
        };
        const floors: Record<SocialNewsCategory, number> = {
            mainline: 18,
            sidequest: 24,
            date: 16,
            daily: 8,
        };
        const resolvedCategory = category || DEFAULT_NEWS_CATEGORY;
        const cap = caps[resolvedCategory];
        const floor = floors[resolvedCategory];
        return Math.min(raw ?? (floor + Math.floor(Math.random() * Math.max(1, cap - floor + 1))), cap);
    };

    const buildPostShell = (item: any, kind: 'moment' | 'news'): SocialPost => {
        const newsCategory = kind === 'news'
            ? normalizeNewsCategory(item.newsCategory || item.category || item.channelCategory)
            : undefined;
        const newsChannel = kind === 'news'
            ? normalizeNewsChannel(item.newsChannel || item.sourceName || item.authorName, newsCategory!)
            : undefined;
        const newsConfig = newsCategory ? NEWS_CHANNEL_BY_CATEGORY[newsCategory] : undefined;
        const normalizedAuthorName = kind === 'news'
            ? newsChannel!
            : (item.authorName || item.sourceName || 'Unknown');
        let avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${normalizedAuthorName || 'news'}`;
        let sourceType: SocialPost['sourceType'] = kind === 'news' ? 'news' : (item.isCharacter ? 'character' : 'npc');
        let charId: string | null = item.charId || null;

        if (item.isCharacter || item.charId) {
            const c = socialScopedCharacters.find(char => char.id === item.charId) || socialScopedCharacters.find(char => {
                const handles = characterHandles[char.id] || [];
                return handles.some(h => h.handle === item.authorName);
            });
            if (c) {
                avatar = c.avatar;
                charId = c.id;
                sourceType = 'character';
            }
        } else if (kind === 'news') {
            avatar = `https://api.dicebear.com/7.x/icons/svg?seed=${newsChannel || item.title || 'aether-news'}`;
        } else {
            const seeds = ['micah', 'avataaars', 'bottts', 'notionists'];
            avatar = `https://api.dicebear.com/7.x/${seeds[Math.floor(Math.random() * seeds.length)]}/svg?seed=${(item.authorName || 'NPC') + Math.random()}`;
        }

        const rawTags = Array.isArray(item.tags) ? item.tags.filter(Boolean).map(String) : [];
        const tags = kind === 'news'
            ? Array.from(new Set([...(newsConfig?.tags || []), ...rawTags, '资讯站']))
            : (rawTags.length ? rawTags : ['朋友圈']);

        return {
            id: `${kind}-${Date.now()}-${Math.random()}`,
            kind,
            sourceType,
            charId,
            authorName: normalizedAuthorName,
            authorAvatar: avatar,
            title: item.title || (kind === 'news' ? '未命名传闻' : '无标题'),
            content: item.content || item.summary || '...',
            images: item.images || [],
            likes: simulatedLikes(kind, sourceType, newsCategory, item.likes),
            isCollected: false,
            isLiked: false,
            comments: [],
            timestamp: Date.now(),
            tags,
            newsCategory,
            newsChannel,
            storyLineStatus: kind === 'news' ? 'candidate' : undefined,
            bgStyle: getRandomStyle().bg,
            storySeedStatus: kind === 'news' ? 'candidate' : 'none',
            replyState: 'none',
            socialScope: activeSocialScope,
        };
    };

    const requestSocialJsonArray = async (prompt: string, maxTokens: number, timeoutMs = 75_000): Promise<any[]> => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.95,
                    max_tokens: maxTokens,
                }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`API Error ${response.status}`);
            const data = await safeResponseJson(response);
            const json = safeParseJSON(data.choices?.[0]?.message?.content || '');
            if (!Array.isArray(json) || json.length === 0) throw new Error('模型没有返回可用的 JSON 数组');
            return json;
        } catch (error: any) {
            if (error?.name === 'AbortError') throw new Error('生成请求超时');
            throw error;
        } finally {
            window.clearTimeout(timer);
        }
    };

    // --- AI Logic (Updated for Multi-Handle) ---
    const handleRefresh = async (targetTab: SocialTab = activeTab) => {
        if (!apiConfig.apiKey) { addToast('请配置 API Key', 'error'); return; }
        if (!activeSocialScope) { addToast('当前面具还没有可用的朋友圈进度', 'error'); return; }
        if (targetTab !== 'news' && socialParticipants.length === 0) {
            addToast('先在面具里链接想出现在朋友圈的角色', 'info');
            return;
        }
        setIsRefreshing(true);
        try {
            const participantPool = socialParticipants;
            const shuffledChars = [...participantPool].sort(() => 0.5 - Math.random());
            const selectedChars = shuffledChars.slice(0, Math.min(3, Math.max(1, participantPool.length)));
            const kind = targetTab === 'news' ? 'news' : 'moment';
            
            // Build Character Map with Multiple Handles Info
            let charContexts = "";
            let identityMap = "### 角色身份表 (Identities)\n";

            for (const char of selectedChars) {
                const coreContext = ContextBuilder.buildCoreContext(char, userProfile, false);
                const msgs = await DB.getMessagesByCharId(char.id);
                const recentStatus = msgs.length > 0 ? `(最近私聊状态: 刚和用户聊过 "${msgs[msgs.length-1].content.substring(0, 20)}...")` : '(最近无私聊，生活平淡)';
                
                const handles = characterHandles[char.id] || [];
                const handleList = handles.map(h => `- 网名: "${h.handle}" (备注: ${h.note})`).join('\n');
                
                identityMap += `\n角色 [${char.name}] 可用账号:\n${handleList}\n`;
                charContexts += `\n<<< 角色档案: ${char.name} >>>\n${coreContext}\n${recentStatus}\n<<< 档案结束 >>>\n`;
            }

            const prompt = kind === 'news' ? `### 任务: 生成 AetherOS「资讯站」
你需要生成 5-6 条世界内部小报/资讯。它们可以像刷到的无良媒体、投稿号、种草号，但只是「候选素材」，不是已确认事实。

### 固定媒体池
只能使用下面这些 category 和媒体号，不允许自创媒体名：
${newsPromptTable()}

### 单个媒体号写法
${newsChannelStyleTable()}
如果 category 规则和单个媒体号写法冲突，以「单个媒体号写法」为准。不同媒体必须明显换文体，不能只换署名后继续使用同一种“地点 + 现象 + 建议”的报告模板。

### 本批固定分配
- 主线异常 mainline：1 条，来自「便民速递」或「今日绕行」。
- 小道消息 sidequest：2 条，其中必须有 1 条来自「诡秘谈」，另一条来自「边角料」或「野史不歪」。
- 约会出行 date：1-2 条，来自「今天想见你」「恋爱出走指南」「两个人的地图」，同批不要重复媒体号。
- 吃喝日常 daily：1 条，来自「今天吃点什么」「便利店观察员」「微醺菜单」。

### 长篇硬约束
1. 「野史不歪」「诡秘谈」「恋爱出走指南」「两个人的地图」属于长篇媒体，content 去掉空白后必须至少 ${NEWS_LONGFORM_MIN_CHARS} 个中文字符；不是“尽量”，少于这个长度视为不合格。
2. 长篇 content 必须是 5-9 个自然段，可以在 JSON 字符串中用 \\n\\n 分段。标题、标签、媒体名不计入 ${NEWS_LONGFORM_MIN_CHARS} 字。
3. 「诡秘谈」必须写成完整怪谈投稿：投稿人和具体时刻开场 → 异常细节逐级升级 → 人物做出反应或对话 → 看似结束 → 最后一个更怪的细节扎尾。禁止公告、调查简报、风险报告、三段式概述。
4. 长篇允许围绕一个主题充分发散：加入旁证、误导、回忆、听来的第二版本、彼此矛盾的细节；语气可以浮夸、抓眼球，但始终保留“投稿/传闻”边界。
5. 短讯媒体仍保持短，不要为了统一长度把「便民速递」「今日绕行」也写成长故事。

### 内容边界
1. 不要出现固定城市名，除非用户或角色资料里已经明确写过；用“旧街区”“东区”“海边”“车站附近”等泛化地点。
2. 内容可以好笑、离谱、暧昧、有剧情钩子，但必须保留传闻感，不要直接替用户决定主线事实。
3. 生成内容只是候选剧情引导，必须等用户采纳后，后续才可以进入剧情上下文。
4. 可参考当前角色和最近私聊状态，但不要把未发生的关系写成既成事实。
5. 标题要像会被点开的资讯流，不要像任务报告。正文不要复述标题后立刻收尾。

### 关联角色参考
${selectedChars.map(c => c.name).join('、')}

### 世界线可见范围
${socialWorldScopeNote}

### 输入上下文
${charContexts}

### 输出格式 (JSON Array)
[
  {
    "category": "mainline | sidequest | date | daily",
    "sourceName": "必须是固定媒体池里的某一个媒体号",
    "authorName": "同 sourceName",
    "title": "新闻或传闻标题",
    "content": "完整正文，严格按媒体号字数与文体规则；长篇用\\n\\n分段",
    "tags": ["可选补充标签"],
    "likes": 按媒体号热度填写：主线 18-260，小道 24-420，约会 16-360，吃喝 8-220
  }
]` : `### 任务: 生成 AetherOS「朋友圈」
你需要生成 4-6 条新的朋友圈动态。

### 内容构成
1. **角色/NPC 动态**:
   - 选中的角色: ${selectedChars.map(c => c.name).join(', ')}
   - 每个角色有可用账号，请根据语境选择合适的网名发动态。
   - 内容像朋友圈：生活碎片、吐槽、暗戳戳记录、模糊表达的想念、轻微互动钩子。
2. **关系边界**:
   - 不要扮演用户发动态。
   - 不要把尚未发生的关系写成既成事实。
   - 可以让 NPC 或路人出现，但他们只能提供氛围，不要抢主线。
3. **点赞仿真**:
   - 朋友圈是熟人圈，不是公开社媒。
   - likes 必须是 0-35 的小数字；普通 NPC 0-12，角色动态 3-30，热闹一点也不要超过 35。

### 身份配置
${identityMap}

### 世界线可见范围
${socialWorldScopeNote}

### 🚫 绝对禁令
1. **禁止扮演用户**: 绝对禁止生成作者名为 "${socialProfile.name}" (用户) 的帖子。
2. **禁止上帝视角**。

### 输入上下文
${charContexts}

### 输出格式 (JSON Array)
[
  {
    "isCharacter": true/false,
    "charId": "如果是角色填ID, 否则null", 
    "authorName": "必须填身份表中定义的【网名】",
    "title": "简短吸睛的标题",
    "content": "正文内容...",
    "likes": 0-35 的小圈层点赞数
  },
  ...
]`;
            let generatedItems = await requestSocialJsonArray(prompt, kind === 'news' ? 14_000 : 8_000);
            let rejectedLongformCount = 0;

            if (kind === 'news') {
                let normalizedItems = generatedItems.map(normalizeGeneratedNewsItem);
                const shortLongformItems = normalizedItems
                    .map((item, index) => ({ item, index }))
                    .filter(({ item }) => isLongformNewsChannel(item.newsChannel) && countNewsContentChars(item.content) < NEWS_LONGFORM_MIN_CHARS);

                if (shortLongformItems.length > 0) {
                    const repairPrompt = `### 任务: 修复 AetherOS 资讯站过短长文
下面这些长篇媒体稿件没有达到正文最低 ${NEWS_LONGFORM_MIN_CHARS} 字。请只重写 content，不改变 repairIndex、category、sourceName 和核心主题。

### 媒体写法
${newsChannelStyleTable()}

### 硬约束
- 每条 content 去掉空白后至少 ${NEWS_LONGFORM_MIN_CHARS} 个中文字符，使用 5-9 个自然段，并以 \\n\\n 分段。
- 不是扩写报告摘要，而是根据对应媒体形态补成完整故事/小报长文。
- 保留传闻边界，不把候选素材盖章为事实。
- 只输出 JSON 数组，不要解释。

### 待修稿件
${JSON.stringify(shortLongformItems.map(({ item, index }) => ({
    repairIndex: index,
    category: item.newsCategory,
    sourceName: item.newsChannel,
    title: item.title,
    currentContent: item.content,
})), null, 2)}

### 输出格式
[
  {
    "repairIndex": 0,
    "content": "达到对应媒体规则的完整分段长文"
  }
]`;

                    try {
                        const repairedItems = await requestSocialJsonArray(repairPrompt, 10_000);
                        const repairsByIndex = new Map<number, any>();
                        repairedItems.forEach(item => {
                            const repairIndex = Number(item?.repairIndex);
                            if (Number.isInteger(repairIndex)) repairsByIndex.set(repairIndex, item);
                        });
                        normalizedItems = normalizedItems.map((item, index) => {
                            const repair = repairsByIndex.get(index);
                            return repair?.content ? { ...item, content: String(repair.content).trim() } : item;
                        });
                    } catch (repairError) {
                        console.warn('Long-form news repair skipped:', repairError);
                    }
                }

                const acceptedItems = normalizedItems.filter(item => {
                    if (!item.content) return false;
                    if (!isLongformNewsChannel(item.newsChannel)) return true;
                    return countNewsContentChars(item.content) >= NEWS_LONGFORM_MIN_CHARS;
                });
                rejectedLongformCount = normalizedItems.length - acceptedItems.length;
                generatedItems = acceptedItems;
            }

            if (generatedItems.length === 0) throw new Error('本批内容未通过媒体字数与格式检查');
            const newPosts: SocialPost[] = generatedItems.map((item: any) => buildPostShell(item, kind));
            const updatedFeed = [...newPosts, ...feed];
            persistFeed(updatedFeed);
            addToast(
                kind === 'news'
                    ? `资讯站新增 ${newPosts.length} 条${rejectedLongformCount > 0 ? `，拦下 ${rejectedLongformCount} 条过短长文` : ''}`
                    : `朋友圈新增 ${newPosts.length} 条`,
                'success'
            );
        } catch (e: any) { addToast('刷新失败: ' + e.message, 'error'); } finally { setIsRefreshing(false); }
    };

    const handlePullStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (activeTab === 'me' || isRefreshing) return;
        if (isInteractiveTarget(e.target)) {
            pullStartedAtTopRef.current = false;
            pullStartYRef.current = null;
            return;
        }
        const scroller = feedScrollRef.current;
        pullStartedAtTopRef.current = !!scroller && scroller.scrollTop <= 2;
        pullStartYRef.current = e.touches[0]?.clientY ?? null;
    };

    const handlePullMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (pullStartYRef.current === null || !pullStartedAtTopRef.current || isRefreshing) return;
        const scroller = feedScrollRef.current;
        if (scroller && scroller.scrollTop > 4 && pullDistance <= 0) return;
        const currentY = e.touches[0]?.clientY ?? pullStartYRef.current;
        const delta = currentY - pullStartYRef.current;
        if (delta <= 0) {
            setPullDistance(0);
            return;
        }
        setPullDistance(Math.min(104, delta * 0.48));
    };

    const handlePullEnd = () => {
        const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD && !isRefreshing && activeTab !== 'me';
        pullStartYRef.current = null;
        pullStartedAtTopRef.current = false;
        setPullDistance(0);
        if (shouldRefresh) void handleRefresh(activeTab);
    };

    const handlePointerPullStart = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'touch' || activeTab === 'me' || isRefreshing) return;
        if (isInteractiveTarget(e.target)) {
            pointerStartedAtTopRef.current = false;
            pointerPullStartYRef.current = null;
            return;
        }
        const scroller = feedScrollRef.current;
        pointerStartedAtTopRef.current = !!scroller && scroller.scrollTop <= 2;
        pointerPullStartYRef.current = e.clientY;
        pointerPullIdRef.current = e.pointerId;
    };

    const handlePointerPullMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'touch' || pointerPullStartYRef.current === null || !pointerStartedAtTopRef.current || isRefreshing) return;
        if (e.buttons !== 1) {
            handlePointerPullEnd(e);
            return;
        }
        const scroller = feedScrollRef.current;
        if (scroller && scroller.scrollTop > 4 && pullDistance <= 0) return;
        const delta = e.clientY - pointerPullStartYRef.current;
        if (delta > POINTER_PULL_DEADZONE_PX && !e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        const dragDistance = Math.max(0, delta - POINTER_PULL_DEADZONE_PX);
        setPullDistance(Math.min(104, dragDistance * 0.48));
    };

    const handlePointerPullEnd = (e?: React.PointerEvent<HTMLDivElement>) => {
        const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD && !isRefreshing && activeTab !== 'me';
        const pointerId = e?.pointerId ?? pointerPullIdRef.current;
        if (pointerId !== null && e?.currentTarget.hasPointerCapture(pointerId)) {
            e.currentTarget.releasePointerCapture(pointerId);
        }
        pointerPullStartYRef.current = null;
        pointerStartedAtTopRef.current = false;
        pointerPullIdRef.current = null;
        setPullDistance(0);
        if (shouldRefresh) void handleRefresh(activeTab);
    };

    const generateComments = async (post: SocialPost, options: { force?: boolean; replyToUserPost?: boolean } = {}) => {
        const existingComments = post.comments || [];
        if (deletedPostIdsRef.current.has(post.id) || !socialPostMatchesScope(post, activeSocialScope)) return;
        if (post.sourceType === 'user' && post.replyState === 'pending' && !options.force) return;
        if (!post || (!options.force && existingComments.length > 0) || !apiConfig.apiKey) return;
        setLoadingComments(true);
        const controller = new AbortController();
        const requestTimer = window.setTimeout(() => controller.abort(), 45_000);
        let generated = false;
        try {
            const isNewsPost = getPostKind(post) === 'news';
            const relatedParticipants = getRelatedParticipantsForPost(post);
            const shuffledChars = [...relatedParticipants].sort(() => 0.5 - Math.random());
            const selectedChars = shuffledChars.slice(0, Math.min(2, Math.max(1, relatedParticipants.length)));
            
            let identityMap = "";
            if (!isNewsPost) {
                for (const char of selectedChars) {
                    const handles = handleListForChar(char);
                    const hList = handles.map(h => `"${h.handle}" (${h.note})`).join(', ');
                    identityMap += `- 角色 ${char.name} 可用身份: ${hList}\n`;
                }
            }

            let contextPrompt = "";
            if (!isNewsPost) {
                for (const char of selectedChars) { contextPrompt += `\n<<< 评论者角色: ${char.name} >>>\n${ContextBuilder.buildCoreContext(char, userProfile, false)}\n`; }
            }
            
            let authorType = "Stranger";
            if (post.authorName === socialProfile.name) authorType = "User";
            else { 
                const c = characters.find(ch => {
                    const handles = characterHandles[ch.id] || [];
                    return handles.some(h => h.handle === post.authorName);
                });
                if (c) authorType = `Character "${c.name}"`; 
            }

            const prompt = isNewsPost ? `### 任务: 模拟资讯站评论区
**媒体号**: "${post.newsChannel || post.authorName}"
**分类**: "${post.newsCategory || 'sidequest'}"
**标题**: "${post.title}"
**正文**: "${post.content}"

请生成 4-7 条虚构路人评论。所有评论者都必须是虚拟昵称，不能使用男主、角色、用户、真实联系人或角色账号。

### 评论气质
- 像小报/种草号下面的评论区：有人不信、有人蹲后续、有人开玩笑、有人说自己也遇到过。
- 不要把传闻盖章为事实；评论可以互相怀疑、补充、跑题。
- 约会/吃喝类可以更轻松，诡秘/小道类可以更像投稿楼。

### 禁令
- 禁止署名为 "${socialProfile.name}"。
- 禁止使用任何角色名或男主账号。
- 禁止写“某某男主回复了”。

### 输出格式 (JSON Array)
[
  { "author": "虚拟昵称", "content": "评论内容..." }
]` : `### 任务: 模拟朋友圈评论区
**帖子来源**: "${getPostKind(post) === 'news' ? '资讯站' : '朋友圈'}"
**楼主**: "${post.authorName}" (${authorType})
**帖子**: "${post.title}"
**正文**: "${post.content}"

${options.replyToUserPost ? '这是用户刚发的朋友圈动态。请生成 2-4 条来自男主、关联 NPC 或朋友的自然回复，语气像朋友圈评论，不要太像系统总结。' : '请生成 4-6 条评论。混合使用 **选定角色** 和 **随机路人**。'}
角色评论时，请选择一个符合语境的账号昵称。

### 角色身份库
${identityMap}

### 世界线可见范围
${socialWorldScopeNote}

### 调度规则
- 只有「角色身份库」里列出的角色账号可以作为角色评论者。
- 可以使用与这些角色当前世界书相关的原生 NPC、路人或剧情新增 NPC 做少量评论。
- 未列入身份库的男主禁止发言、禁止用账号名出现。

### 禁令
- **绝对禁止** 生成署名为 "${socialProfile.name}" 的评论。

### 输入上下文
${contextPrompt}

### 输出格式 (JSON Array)
[
  { "author": "网名 (Handle) 或 路人昵称", "content": "评论内容..." }
]`;
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.8 }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Comment API returned ${response.status}`);
            if (response.ok) {
                const data = await safeResponseJson(response);
                const json = safeParseJSON(data.choices[0].message.content);
                if (Array.isArray(json) && !deletedPostIdsRef.current.has(post.id)) {
                    const comments: SocialComment[] = json.map((c: any) => {
                        let authorName = c.author || c.authorName || 'Unknown';
                        if (isForbiddenCrossLeadAuthor(authorName, selectedChars)) {
                            authorName = '临空路过的人';
                        }
                        let avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${authorName}`;
                        
                        const char = isNewsPost ? undefined : characters.find(ch => {
                            if (!selectedChars.some(allowed => allowed.id === ch.id)) return false;
                            const handles = handleListForChar(ch);
                            return handles.some(h => h.handle === authorName) || ch.name === authorName;
                        });

                        if (char) avatar = char.avatar;
                        return { id: `cmt-${Math.random()}`, authorName: authorName, authorAvatar: avatar, charId: char?.id, content: c.content || '...', likes: Math.floor(Math.random() * (isNewsPost ? 18 : 36)), isCharacter: !!char };
                    });
                    updatePostInFeed({ ...post, comments, replyState: post.replyState === 'pending' ? 'generated' : post.replyState });
                    generated = true;
                }
            }
        } catch (e: any) {
            addToast(e?.name === 'AbortError' ? "评论请求超时，稍后再试" : "评论加载失败", "error");
        } finally {
            window.clearTimeout(requestTimer);
            pendingReplyRef.current.delete(post.id);
            if (!generated && options.replyToUserPost && !deletedPostIdsRef.current.has(post.id)) {
                updatePostInFeed({ ...post, replyDueAt: Date.now() + 5 * 60_000 });
            }
            setLoadingComments(false);
        }
    };

    const generateNextReplyToUserPost = async (post: SocialPost) => {
        if (
            !apiConfig.apiKey
            || post.sourceType !== 'user'
            || deletedPostIdsRef.current.has(post.id)
            || !socialPostMatchesScope(post, activeSocialScope)
        ) return;
        const eligibleIds = new Set(getRelatedParticipantsForPost(post).map(char => char.id));
        const currentQueue = (post.replyRemainingCharIds?.length ? post.replyRemainingCharIds : post.replyAudienceCharIds || [])
            .filter(charId => eligibleIds.has(charId));
        const [nextCharId, ...remainingIds] = currentQueue;
        const nextChar = nextCharId ? characters.find(char => char.id === nextCharId) : undefined;

        if (!nextChar) {
            updatePostInFeed({ ...post, replyState: 'generated', replyDueAt: undefined, replyRemainingCharIds: [] });
            return;
        }

        const handles = handleListForChar(nextChar);
        const primaryHandle = primaryHandleForChar(nextChar);
        const identityMap = handles.map(handle => `- "${handle.handle}" (${handle.note})`).join('\n');
        const coreContext = ContextBuilder.buildCoreContext(nextChar, userProfile, false);

        const prompt = `### 任务: AetherOS 朋友圈单人延迟回复
用户刚发了一条朋友圈。现在只轮到一个已激活角色回复，不要生成其他男主或未激活角色。

### 目标角色
角色: ${nextChar.name}
可用账号:
${identityMap}

### 世界线可见范围
${socialWorldScopeNote}

### 用户动态
作者: ${socialProfile.name}
标题: ${post.title}
正文: ${post.content}

### 角色上下文
${coreContext}

### 回复规则
- 只输出 1 条评论。
- author 必须使用目标角色可用账号中的一个；如果不确定，用 "${primaryHandle}"。
- 评论要像朋友圈自然回复：短、带个人口吻，可以关心、调侃、吃醋、接梗或认真回应。
- 不要替用户发言，不要写成长段总结。
- 不要让其他男主、系统、模型或旁白出现。

### 输出格式
[
  { "author": "${primaryHandle}", "content": "评论内容..." }
]`;

        try {
            const json = await requestSocialJsonArray(prompt, 1_200, 45_000);
            const first = json[0] || {};
            const rawAuthor = String(first.author || first.authorName || primaryHandle).trim();
            const allowedAuthor = handles.some(handle => handle.handle === rawAuthor) ? rawAuthor : primaryHandle;
            const content = String(first.content || '').trim();
            if (!content) throw new Error('模型没有返回评论正文');
            if (deletedPostIdsRef.current.has(post.id)) return;

            const newComment: SocialComment = {
                id: `cmt-reply-${Date.now()}-${Math.random()}`,
                authorName: allowedAuthor,
                authorAvatar: nextChar.avatar,
                charId: nextChar.id,
                content,
                likes: Math.floor(Math.random() * 8),
                isCharacter: true,
            };
            const nextPost: SocialPost = {
                ...post,
                comments: [...(post.comments || []), newComment],
                replyRemainingCharIds: remainingIds,
                replyState: remainingIds.length > 0 ? 'pending' : 'generated',
                replyDueAt: remainingIds.length > 0 ? Date.now() + randomReplyDelayMs() : undefined,
                replyLastGeneratedAt: Date.now(),
            };
            updatePostInFeed(nextPost);
            showSocialReplyNotice([newComment], nextPost);
        } catch (e) {
            if (deletedPostIdsRef.current.has(post.id)) return;
            updatePostInFeed({
                ...post,
                replyRemainingCharIds: currentQueue,
                replyState: 'pending',
                replyDueAt: Date.now() + USER_POST_REPLY_RETRY_MS,
            });
        }
    };

    useEffect(() => {
        if (!apiConfig.apiKey) return;
        const timer = window.setInterval(() => {
            const duePost = feed.find(post =>
                getPostKind(post) === 'moment' &&
                post.sourceType === 'user' &&
                socialPostMatchesScope(post, activeSocialScope) &&
                post.replyState === 'pending' &&
                !!post.replyDueAt &&
                post.replyDueAt <= Date.now() &&
                !pendingReplyRef.current.has(post.id)
            );
            if (duePost) {
                pendingReplyRef.current.add(duePost.id);
                void generateNextReplyToUserPost(duePost).finally(() => {
                    pendingReplyRef.current.delete(duePost.id);
                });
            }
        }, 15000);
        return () => window.clearInterval(timer);
    }, [feed, apiConfig.apiKey, characters.length, socialProfile.name, socialParticipants, activeSocialScope]);

    const generateRepliesToUser = async (post: SocialPost, userContent: string) => {
        if (
            !apiConfig.apiKey
            || deletedPostIdsRef.current.has(post.id)
            || !socialPostMatchesScope(post, activeSocialScope)
        ) return;
        const relatedParticipants = getRelatedParticipantsForPost(post).slice(0, 2);
        if (relatedParticipants.length === 0) return;
        setIsReplyingToUser(true);
        try {
            // Simplified handle map for replies
            let identityMap = "";
            relatedParticipants.forEach(char => {
                const handles = handleListForChar(char);
                const hList = handles.map(h => `"${h.handle}"`).join(', ');
                identityMap += `- ${char.name}: ${hList}\n`;
            });

            const prompt = `### 任务: 回复用户的评论
**场景**: 用户 "${socialProfile.name}" 在帖子下发了一条评论: "${userContent}"。
**帖子**: "${post.title}"
请生成 1-2 条对用户评论的回复。

### 世界线可见范围
${socialWorldScopeNote}

### 调度规则
- 只有下面身份表里的已激活相关角色可以回复。
- 未列入身份表的男主禁止出现。
- 回复像朋友圈楼中楼，不要像系统总结。
${identityMap}

### 输出格式 (JSON Array)
[
  { "author": "网名 (Handle)", "content": "回复内容..." }
]`;
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.9 })
            });
            if (response.ok) {
                const data = await safeResponseJson(response);
                const json = safeParseJSON(data.choices[0].message.content);
                if (Array.isArray(json) && !deletedPostIdsRef.current.has(post.id)) {
                    const newReplies: SocialComment[] = json.map((c: any) => {
                        let authorName = c.author || c.authorName || 'Unknown';
                        if (isForbiddenCrossLeadAuthor(authorName, relatedParticipants)) {
                            authorName = primaryHandleForChar(relatedParticipants[0]);
                        }
                        let avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${authorName}`;
                        
                        let char = findAllowedCharForAuthor(authorName, relatedParticipants);
                        if (!char) {
                            char = relatedParticipants[0];
                            authorName = primaryHandleForChar(char);
                        }

                        if (char) avatar = char.avatar;
                        return { id: `cmt-reply-${Date.now()}-${Math.random()}`, authorName: authorName, authorAvatar: avatar, charId: char?.id, content: `回复 @${socialProfile.name}: ${c.content}`, likes: Math.floor(Math.random() * 10), isCharacter: !!char };
                    });
                    if (newReplies.length > 0) {
                        const nextPost = { ...post, comments: [...(post.comments || []), ...newReplies] };
                        updatePostInFeed(nextPost);
                        showSocialReplyNotice(newReplies, nextPost);
                    }
                }
            }
        } catch (e) {} finally { setIsReplyingToUser(false); }
    };

    const handleShare = async (targetId: string, isGroup: boolean) => {
        if (!selectedPost) return;
        try {
            await DB.saveMessage({ charId: isGroup ? 'user' : targetId, groupId: isGroup ? targetId : undefined, role: 'user', type: 'social_card', content: '[分享帖子]', metadata: { post: selectedPost } });
            setShowShareModal(false);
            addToast('分享成功', 'success');
        } catch (e) { addToast('分享失败', 'error'); }
    };

    const handleCreatePost = () => {
        if (!newPostContent.trim()) return;
        if (!activeSocialScope) {
            addToast('当前面具还没有可用的朋友圈进度', 'error');
            return;
        }
        const replyQueue = apiConfig.apiKey ? buildUserPostReplyQueue() : [];
        const shouldScheduleReplies = replyQueue.length > 0;
        const post: SocialPost = { 
            id: `user-post-${Date.now()}`, 
            kind: 'moment',
            sourceType: 'user',
            charId: null,
            authorName: socialProfile.name, // Use Local Identity
            authorAvatar: socialProfile.avatar, // Use Local Identity
            title: newPostTitle || '无标题', 
            content: newPostContent, 
            images: newPostEmoji ? [newPostEmoji] : [],
            likes: 0, 
            isCollected: false, 
            isLiked: false, 
            comments: [], 
            timestamp: Date.now(), 
            tags: ['朋友圈'],
            bgStyle: getRandomStyle().bg,
            storySeedStatus: 'none',
            replyState: shouldScheduleReplies ? 'pending' : 'none',
            replyDueAt: shouldScheduleReplies ? Date.now() + USER_POST_FIRST_REPLY_DELAY_MS : undefined,
            replyAudienceCharIds: replyQueue,
            replyRemainingCharIds: replyQueue,
            socialScope: activeSocialScope,
        };
        persistFeed([post, ...feed]);
        setNewPostContent(''); setNewPostTitle(''); 
        setIsCreateOpen(false); // Close Modal
        setActiveTab('moments');
        addToast(shouldScheduleReplies ? '已发布，相关角色会陆续回复' : '发布成功', 'success');
    };

    const handleDeletePost = async (postId: string) => {
        deletedPostIdsRef.current.add(postId);
        pendingReplyRef.current.delete(postId);
        try {
            await DB.deleteSocialPost(postId);
            setFeed(prev => prev.filter(post => post.id !== postId));
            setSelectedPost(current => current?.id === postId ? null : current);
            setShowPostActions(false);
            setShowDeletePostConfirm(false);
            addToast('这条内容已删除', 'success');
        } catch (error) {
            deletedPostIdsRef.current.delete(postId);
            addToast('删除失败，请稍后再试', 'error');
        }
    };
    const handleLike = (e: any, post: SocialPost) => {
        e.stopPropagation();
        const nextPost = { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 };
        updatePostInFeed(nextPost);
    };
    const handleAdoptStorySeed = (post: SocialPost) => {
        updatePostInFeed({ ...post, storySeedStatus: 'adopted', adoptedAt: Date.now() });
        addToast('已标记为剧情引导，不会自动写入记忆', 'success');
    };
    
    const handleSendComment = async () => { 
        if (!selectedPost || !commentInput.trim() || !socialPostMatchesScope(selectedPost, activeSocialScope)) return;
        
        const updatedPost = { 
            ...selectedPost, 
            comments: [...(selectedPost.comments || []), { 
                id: `cmt-user-${Date.now()}`, 
                authorName: socialProfile.name, // Use Local Identity
                authorAvatar: socialProfile.avatar, // Use Local Identity
                content: commentInput.trim(), 
                likes: 0, 
                isCharacter: false 
            }] 
        }; 
        
        updatePostInFeed(updatedPost); 
        const contentToSend = commentInput; 
        setCommentInput(''); 
        await generateRepliesToUser(updatedPost, contentToSend); 
    };
    
    const clearPostsByKind = async (kind: 'moment' | 'news') => {
        const postIds = feed
            .filter(post => socialPostMatchesScope(post, activeSocialScope) && getPostKind(post) === kind)
            .map(post => post.id);
        postIds.forEach(id => {
            deletedPostIdsRef.current.add(id);
            pendingReplyRef.current.delete(id);
        });
        try {
            await Promise.all(postIds.map(id => DB.deleteSocialPost(id)));
        } catch (error) {
            postIds.forEach(id => deletedPostIdsRef.current.delete(id));
            throw error;
        }
        const deletedIds = new Set(postIds);
        setFeed(prev => prev.filter(post => !deletedIds.has(post.id)));
        setSelectedPost(current => current && deletedIds.has(current.id) ? null : current);
        return postIds.length;
    };

    const handleClearMoments = async () => {
        try {
            const count = await clearPostsByKind('moment');
            setShowSettings(false);
            addToast(count > 0 ? `已清空当前面具的 ${count} 条朋友圈动态` : '当前面具的朋友圈已经是空的', 'success');
        } catch {
            addToast('清空失败，请稍后再试', 'error');
        }
    };

    const handleClearNews = async () => {
        try {
            const count = await clearPostsByKind('news');
            setShowClearNewsConfirm(false);
            addToast(count > 0 ? `已清空当前面具的 ${count} 条资讯` : '当前面具的资讯站已经是空的', 'success');
        } catch {
            addToast('清空失败，请稍后再试', 'error');
        }
    };

    // --- Renderers ---

    const openPost = (post: SocialPost) => {
        if (!socialPostMatchesScope(post, activeSocialScope)) return;
        const normalizedPost = {
            ...post,
            comments: post.comments || [],
            tags: post.tags || [],
        };
        setSelectedPost(normalizedPost);
        generateComments(normalizedPost);
    };

    const renderPullRefreshIndicator = () => {
        if (!isRefreshing && pullDistance <= 1) return null;
        const readyToRefresh = pullDistance >= PULL_REFRESH_THRESHOLD;
        const indicatorHeight = isRefreshing ? 56 : Math.min(56, Math.max(42, pullDistance * 0.64));

        return (
            <div
                className="flex items-center justify-center transition-[height,opacity] duration-200"
                style={{
                    height: indicatorHeight,
                    opacity: isRefreshing ? 1 : Math.min(1, pullDistance / PULL_REFRESH_THRESHOLD)
                }}
            >
                <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/72 px-3 py-1.5 text-[11px] font-bold text-slate-400 shadow-sm backdrop-blur-md">
                    <div
                        className={`relative h-[18px] w-[18px] rounded-full border-2 ${
                            isRefreshing
                                ? 'animate-spin border-[#ff2442]/45'
                                : readyToRefresh
                                    ? 'border-[#ff2442]/70 bg-[#ff2442]/5'
                                    : 'border-slate-300'
                        }`}
                    >
                        {isRefreshing && (
                            <span className="absolute left-1/2 top-[-3px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[#ff2442] shadow-[0_0_6px_rgba(255,36,66,0.45)]" />
                        )}
                    </div>
                    {isRefreshing
                        ? (activeTab === 'news' ? '正在捕捉传闻...' : '正在获取新鲜事...')
                        : (readyToRefresh ? '松开刷新' : '下拉刷新')}
                </div>
            </div>
        );
    };

    const renderMomentsCover = () => (
        <section className="relative h-[284px] border-b border-white/70 bg-white/35">
            <input type="file" ref={userBgInputRef} className="hidden" accept="image/*" onChange={handleUserBgUpload} />
            <div className="absolute inset-x-0 top-0 h-[226px] overflow-hidden">
                {userBgImage ? (
                    <img src={userBgImage} className="h-full w-full object-cover" alt="" />
                ) : (
                    <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.75),transparent_32%),linear-gradient(135deg,#f8eef2_0%,#eef7fb_55%,#f7fafc_100%)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-transparent to-black/28" />
            </div>
            <div className="absolute bottom-[72px] left-6 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => userBgInputRef.current?.click()}
                    className="rounded-full border border-white/85 bg-white/68 px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm backdrop-blur-md active:scale-95"
                >
                    更换图片
                </button>
                {userBgImage && (
                    <button
                        type="button"
                        onClick={handleUserBgDelete}
                        className="rounded-full border border-white/85 bg-white/68 px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm backdrop-blur-md active:scale-95"
                    >
                        删除
                    </button>
                )}
            </div>
            <div className="absolute inset-x-0 top-[226px] h-px bg-white/80 shadow-[0_1px_0_rgba(148,163,184,0.18)]" />
            <div className="absolute right-6 top-[190px] flex items-end gap-3 text-right">
                <div className="flex flex-col items-center gap-1">
                    <img src={socialProfile.avatar} className="h-[72px] w-[72px] rounded-full border-[3px] border-white object-cover shadow-lg" />
                    <span className="max-w-28 truncate text-[12px] font-black text-slate-800 drop-shadow-sm">{socialProfile.name}</span>
                </div>
            </div>
        </section>
    );

    const renderMomentItem = (post: SocialPost) => {
        const commentSnippets = (post.comments || []).slice(0, 3);
        const media = post.images?.find(isImageAsset);
        return (
            <article
                key={post.id}
                onClick={() => openPost(post)}
                className="group cursor-pointer border-b border-slate-200/70 px-4 py-4 active:bg-white/60 transition-colors"
            >
                <div className="flex gap-3">
                    <img src={post.authorAvatar} className="mt-0.5 h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/80 shadow-sm" />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[15px] font-bold text-slate-800 leading-tight">{post.authorName}</div>
                                <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                                    {post.sourceType === 'user' ? '刚刚更新了状态' : new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                            <button onClick={(e) => handleLike(e, post)} className="shrink-0 rounded-full p-1 text-slate-400 hover:text-[#ff2442]">
                                <Icons.Heart filled={post.isLiked} className="w-[18px] h-[18px]" />
                            </button>
                        </div>
                        <p className="mt-2 text-[15px] leading-7 text-slate-700 whitespace-pre-wrap">{post.content}</p>
                        {media && (
                            <div className="mt-3 w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/80 bg-white/55 shadow-sm">
                                <img src={media} alt="" className="h-32 w-full object-cover" />
                            </div>
                        )}
                        <div className="mt-3 flex items-center gap-4 text-[12px] font-semibold text-slate-400">
                            <span>{post.likes} 赞</span>
                            <span>{(post.comments || []).length} 评论</span>
                            {post.sourceType === 'user' && post.replyState === 'pending' && (
                                <span className="text-[#ff2442]">相关角色陆续回复中</span>
                            )}
                        </div>
                        {commentSnippets.length > 0 && (
                            <div className="mt-3 rounded-xl bg-white/55 px-3 py-2 text-[13px] leading-6 text-slate-600 shadow-sm ring-1 ring-white/70">
                                {commentSnippets.map(c => (
                                    <p key={c.id} className="line-clamp-2">
                                        <span className="font-bold text-[#bb5b63]">{c.authorName}：</span>{c.content}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </article>
        );
    };

    const renderNewsItem = (post: SocialPost) => {
        const cover = post.images?.find(isImageAsset);
        return (
            <article key={post.id} onClick={() => openPost(post)} className="cursor-pointer border-b border-slate-200/70 px-5 py-4 active:bg-white/60 transition-colors">
                <div className="mb-2 flex items-center gap-2">
                    <img src={post.authorAvatar} className="h-8 w-8 rounded-full object-cover shadow-sm ring-1 ring-white/80" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-semibold tracking-wide text-slate-700">{post.authorName}</div>
                        <div className="text-[10px] font-semibold text-slate-400">{post.tags.slice(0, 2).join(' / ')}</div>
                    </div>
                    {post.storySeedStatus === 'adopted' && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">已采纳</span>}
                </div>
                <div className="relative h-[clamp(126px,20vw,178px)] w-full overflow-hidden rounded-sm bg-slate-200 shadow-[0_8px_18px_rgba(71,85,105,0.12)]" style={{ background: cover ? undefined : post.bgStyle }}>
                    {cover ? (
                        <img src={cover} className="h-full w-full object-cover" alt="" />
                    ) : (
                        <>
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.55),transparent_28%),linear-gradient(125deg,rgba(255,255,255,0.12),transparent_45%)]" />
                            <div className="absolute left-5 top-4 rounded-full bg-white/35 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-white/90 backdrop-blur-sm">MEDIA</div>
                        </>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/58 via-black/20 to-transparent px-4 pb-3 pt-10">
                        <h3 className="line-clamp-2 text-[18px] font-semibold leading-snug text-white drop-shadow">{post.title}</h3>
                    </div>
                    <span className="absolute bottom-3 right-3 h-2.5 w-2.5 rounded-full bg-[#ff2442] shadow-[0_0_10px_rgba(255,36,66,0.65)]" />
                </div>
                <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-500">{post.content}</p>
            </article>
        );
    };

    const renderFeedItem = (post: SocialPost) => getPostKind(post) === 'news' ? renderNewsItem(post) : renderMomentItem(post);

    // 2. Detail Overlay (Glassmorphism)
    // FIX: Using a fixed container for backdrop to prevent layout gaps.
    // REMOVED 'key={selectedPost.id}' to prevent re-mounting jitter.
    // SEPARATED scrollable container from animation wrapper.
    const renderDetail = () => {
        if (!selectedPost) return null;
        const selectedComments = selectedPost.comments || [];
        const selectedTags = selectedPost.tags || [];
        const detailImage = selectedPost.images?.find(isImageAsset);
        const detailSticker = selectedPost.images?.find(token => token && !isImageAsset(token));
        return (
            <div 
                className="absolute inset-0 z-[60] h-full w-full bg-white/90 backdrop-blur-xl flex flex-col"
            >
                {/* 
                   Animation Wrapper. 
                   We want the whole overlay content to slide up. 
                   We ensure this doesn't re-render on state changes like comments.
                */}
                <div className="flex-1 w-full h-full flex flex-col animate-slide-up relative overflow-hidden">
                    {/* Header - Shrink 0 to stay at top, with safe-area for notch devices */}
                    <div
                        data-social-detail-header
                        className="flex items-center justify-between px-4 bg-white/80 backdrop-blur-xl border-b border-white/40 shrink-0 relative z-20"
                        style={{
                            paddingTop: `calc(${SHELL_APP_HEADER_CONTENT_TOP} + ${SOCIAL_DETAIL_HEADER_VERTICAL_OFFSET_PX}px)`,
                            paddingBottom: '10px',
                        }}
                    >
                        <button onClick={() => setSelectedPost(null)} className="p-2 -m-2 active:opacity-60"><Icons.Back onClick={() => setSelectedPost(null)} /></button>
                        <div className="flex items-center gap-2">
                            <img src={selectedPost.authorAvatar} className="w-8 h-8 rounded-full object-cover border border-white/50" />
                            <span className="text-sm font-bold text-slate-800">{selectedPost.authorName}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowPostActions(true)}
                            aria-label="更多操作"
                            className="p-2 -m-2 text-slate-800 active:opacity-60"
                        >
                            <DotsThreeVertical size={24} weight="bold" />
                        </button>
                    </div>

                    {/* Scrollable Area */}
                    <div ref={detailScrollRef} className="flex-1 overflow-y-auto no-scrollbar pb-24">
                        {detailImage && (
                            <div className="w-full overflow-hidden bg-slate-100" style={{ height: getPostKind(selectedPost) === 'news' ? 'clamp(168px, 24vw, 240px)' : 'clamp(180px, 28vw, 260px)' }}>
                                <img src={detailImage} alt="" className="h-full w-full object-cover" />
                            </div>
                        )}

                        <div className="p-6 space-y-4">
                            <h1 className="text-2xl font-black text-slate-900 leading-snug tracking-tight">{selectedPost.title}</h1>
                            <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap font-light">{selectedPost.content}</p>
                            {!detailImage && detailSticker && (
                                <div className="inline-flex h-12 min-w-12 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 px-3 shadow-sm">
                                    {renderPostSticker(detailSticker, 'w-8 h-8')}
                                </div>
                            )}
                            {getPostKind(selectedPost) === 'news' && (
                                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
                                    <button
                                        onClick={() => handleAdoptStorySeed(selectedPost)}
                                        disabled={selectedPost.storySeedStatus === 'adopted'}
                                        className={`w-full rounded-xl py-2 text-xs font-bold transition-all ${selectedPost.storySeedStatus === 'adopted' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#ff2442] text-white shadow-sm active:scale-[0.98]'}`}
                                    >
                                        {selectedPost.storySeedStatus === 'adopted' ? '已采纳为剧情引导' : '采纳为剧情引导'}
                                    </button>
                                    <p className="mt-2 text-[10px] leading-relaxed text-slate-400">只做本地标记，不会自动写入长期记忆。</p>
                                </div>
                            )}
                            
                            <div className="flex gap-2 flex-wrap pt-2">
                                {selectedTags.map(t => <span key={t} className="text-xs font-bold text-blue-600 bg-blue-50/50 backdrop-blur-sm border border-blue-100 px-2.5 py-1 rounded-full">#{t}</span>)}
                            </div>
                            <div className="text-xs text-slate-400 font-medium border-b border-slate-100/50 pb-6">{new Date(selectedPost.timestamp).toLocaleDateString()}</div>
                        </div>

                        {/* Comments Section */}
                        <div className="px-6 pb-6">
                            <div className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <span>共 {selectedComments.length} 条评论</span>
                                {(loadingComments || isReplyingToUser) && <div className="w-3 h-3 border-2 border-slate-300 border-t-[#ff2442] rounded-full animate-spin"></div>}
                            </div>
                            {selectedPost.sourceType === 'user' && selectedPost.replyState === 'pending' && (
                                <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-[12px] font-semibold leading-5 text-rose-500">
                                    相关角色会按不同时间点陆续回复。当前世界线范围：{allowsMaleLeadCrossover ? '已允许交叉' : '单男主线'}
                                </div>
                            )}
                            
                            <div className="space-y-6">
                                {selectedComments.length === 0 && !loadingComments && <div className="text-center text-slate-300 text-xs py-10">快来抢沙发...</div>}
                                {selectedComments.map(c => (
                                    <div key={c.id} className="flex gap-3 animate-fade-in group">
                                        <img src={c.authorAvatar} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-100" />
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <span className={`text-xs font-bold ${c.isCharacter ? 'text-slate-800' : 'text-slate-500'}`}>{c.authorName}</span>
                                                <div className="flex items-center gap-1 text-slate-400 cursor-pointer hover:text-[#ff2442]">
                                                    <Icons.Heart filled={false} className="w-3.5 h-3.5" />
                                                    <span className="text-[10px]">{c.likes}</span>
                                                </div>
                                            </div>
                                            <p className="text-[13px] text-slate-700 mt-0.5 leading-normal font-light">{c.content}</p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={commentsEndRef} />
                            </div>
                        </div>
                    </div>

                    {/* Bottom Input Bar - Absolute to sit on top of scroll area at bottom */}
                    <div className="absolute bottom-0 w-full pb-[env(safe-area-inset-bottom)] z-30 pointer-events-none">
                         <div className="pointer-events-auto h-16 bg-white/80 backdrop-blur-xl border-t border-white/40 px-4 flex items-center justify-between gap-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
                            <div className="flex-1 bg-slate-100/50 rounded-full px-5 py-2.5 flex items-center gap-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-slate-200 transition-all border border-transparent focus-within:border-slate-200">
                                <input 
                                    value={commentInput}
                                    onChange={(e) => setCommentInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
                                    placeholder="说点什么..."
                                    className="bg-transparent text-sm w-full outline-none text-slate-800 placeholder:text-slate-400"
                                />
                                {commentInput.trim() && <button onClick={handleSendComment} className="text-[#ff2442] font-bold text-sm animate-fade-in">发送</button>}
                            </div>
                            <div className="flex gap-5 text-slate-600 shrink-0 items-center">
                                <div className="flex flex-col items-center gap-0.5">
                                    <Icons.Heart filled={selectedPost.isLiked} onClick={(e) => handleLike(e, selectedPost)} className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">{selectedPost.likes}</span>
                                </div>
                                <div className="flex flex-col items-center gap-0.5">
                                    <Icons.Star filled={selectedPost.isCollected} onClick={() => updatePostInFeed({...selectedPost, isCollected: !selectedPost.isCollected})} className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">{selectedPost.isCollected ? '已收藏' : '收藏'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        // Main Container with Premium Gradient Background
        <div className="h-full w-full bg-gradient-to-br from-rose-50 via-slate-50 to-teal-50 flex flex-col font-sans relative text-slate-900 overflow-hidden">
            
            {/* --- Modals (Settings, Share) --- */}
            <Modal isOpen={showSettings} title="身份管理" onClose={() => setShowSettings(false)}>
                <div className="space-y-6">
                    <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-6 px-1">
                        <p className="text-xs text-slate-400 bg-slate-50 p-2 rounded-lg">
                            为角色添加账号昵称。AI 发动态或评论时会根据内容选择合适的账号。
                        </p>
                        {socialScopedCharacters.map(c => (
                            <div key={c.id} className="space-y-3 pb-4 border-b border-slate-50">
                                <div className="flex items-center gap-2">
                                    <img src={c.avatar} className="w-6 h-6 rounded-full object-cover" />
                                    <span className="text-sm font-bold text-slate-700">{c.name}</span>
                                    <button onClick={() => addSubAccount(c.id)} className="ml-auto text-[10px] bg-[#ff2442] text-white px-2 py-1 rounded-full shadow-sm active:scale-95 transition-transform">+ 添加账号</button>
                                </div>
                                
                                <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                                    {(characterHandles[c.id] || []).map((acct) => (
                                        <div key={acct.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm space-y-2 relative group">
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <label className="text-[9px] text-slate-400 uppercase font-bold">网名 (Handle)</label>
                                                    <input 
                                                        value={acct.handle} 
                                                        onChange={(e) => updateSubAccount(c.id, acct.id, 'handle', e.target.value)} 
                                                        className="w-full text-sm font-bold text-slate-800 border-b border-dashed border-slate-200 focus:border-[#ff2442] outline-none py-1" 
                                                    />
                                                </div>
                                                <button 
                                                    onClick={() => deleteSubAccount(c.id, acct.id)}
                                                    className="text-slate-300 hover:text-red-400 p-1"
                                                    title="删除"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-400 uppercase font-bold">备注 (Context Note)</label>
                                                <input 
                                                    value={acct.note} 
                                                    onChange={(e) => updateSubAccount(c.id, acct.id, 'note', e.target.value)} 
                                                    placeholder="例如: 吐槽号 / 认真模式"
                                                    className="w-full text-xs text-slate-500 bg-slate-50 rounded px-2 py-1 focus:bg-white transition-colors outline-none" 
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {(characterHandles[c.id]?.length || 0) === 0 && (
                                        <div className="text-[10px] text-red-400 italic flex items-center gap-1"><Warning size={12} weight="bold" /> 请至少保留一个身份</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {socialScopedCharacters.length === 0 && (
                            <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-xs leading-5 text-slate-400">
                                当前面具还没有链接角色，链接后这里会出现对应账号。
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => void handleClearMoments()} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl text-xs active:bg-slate-50">清空当前朋友圈</button>
                        <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-[#ff2442] text-white font-bold rounded-xl text-xs shadow-lg shadow-red-200 active:scale-95 transition-transform">完成</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={showPostActions} title="这条内容" onClose={() => setShowPostActions(false)}>
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => {
                            setShowPostActions(false);
                            setShowShareModal(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left text-sm font-bold text-slate-700 shadow-sm active:scale-[0.99]"
                    >
                        <ShareNetwork size={20} weight="bold" />
                        分享到聊天
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setShowPostActions(false);
                            setShowDeletePostConfirm(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-left text-sm font-bold text-rose-500 active:scale-[0.99]"
                    >
                        <TrashSimple size={20} weight="bold" />
                        删除这条内容
                    </button>
                </div>
            </Modal>

            <Modal isOpen={showDeletePostConfirm} title="删除这条内容？" onClose={() => setShowDeletePostConfirm(false)}>
                <div className="space-y-4">
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
                        删除后它不会继续等待角色回复；已经分享进聊天的卡片不会一起消失。
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setShowDeletePostConfirm(false)}
                            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-xs font-bold text-slate-500"
                        >
                            先留着
                        </button>
                        <button
                            type="button"
                            disabled={!selectedPost}
                            onClick={() => selectedPost && void handleDeletePost(selectedPost.id)}
                            className="flex-1 rounded-xl bg-rose-500 py-3 text-xs font-bold text-white shadow-lg shadow-rose-100 active:scale-95 disabled:opacity-40"
                        >
                            确认删除
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={showClearNewsConfirm} title="清空资讯站" onClose={() => setShowClearNewsConfirm(false)}>
                <div className="space-y-5">
                    <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-sm leading-6 text-slate-600">
                        这会删除当前面具下已经生成并保存的全部资讯，但不会影响其他面具、朋友圈动态或已经分享进聊天的卡片。
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setShowClearNewsConfirm(false)} className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-xs font-bold text-slate-500">先留着</button>
                        <button onClick={() => void handleClearNews()} className="flex-1 rounded-xl bg-[#ff2442] py-3 text-xs font-bold text-white shadow-lg shadow-red-100 active:scale-95">确认清空</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={showShareModal} title="分享帖子" onClose={() => setShowShareModal(false)}>
                <div className="grid grid-cols-4 gap-4 p-2">
                    {socialScopedCharacters.slice(0, 8).map(c => (
                        <button key={c.id} onClick={() => handleShare(c.id, false)} className="flex flex-col items-center gap-2 group">
                            <img src={c.avatar} className="w-12 h-12 rounded-full object-cover border border-slate-100 group-active:scale-90 transition-transform" />
                            <span className="text-[10px] text-slate-600 truncate w-full text-center">{c.name}</span>
                        </button>
                    ))}
                    {socialScopedCharacters.length === 0 && (
                        <div className="col-span-4 py-6 text-center text-xs leading-5 text-slate-400">
                            当前面具还没有可分享的角色。
                        </div>
                    )}
                </div>
            </Modal>

            {/* --- Create Post Modal (Full Screen Overlay) --- */}
            {isCreateOpen && (
                <div className="absolute inset-0 z-50 bg-white flex flex-col animate-slide-up">
                    {/* Create Header */}
                    <div className="shrink-0 border-b border-slate-100 bg-white px-5" style={{ paddingTop: SHELL_APP_HEADER_CONTENT_TOP }}>
                        <div className="flex h-12 items-center justify-between">
                            <button onClick={() => setIsCreateOpen(false)} className="text-[15px] font-bold text-slate-700">取消</button>
                            <span className="text-[16px] font-black text-slate-800">发布状态</span>
                            <button
                                onClick={handleCreatePost}
                                disabled={!newPostContent.trim()}
                                className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition-all ${newPostContent.trim() ? 'bg-[#ff2442] text-white shadow-md shadow-red-100 active:scale-95' : 'bg-slate-200 text-white'}`}
                            >
                                发布
                            </button>
                        </div>
                    </div>

                    {/* Create Content */}
                    <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-8">
                        <input
                            value={newPostTitle}
                            onChange={e => setNewPostTitle(e.target.value)}
                            placeholder="填写标题会有更多赞哦~"
                            className="mb-6 w-full bg-transparent text-[25px] font-black leading-tight text-slate-800 outline-none placeholder:text-slate-300"
                        />
                        <textarea
                            value={newPostContent}
                            onChange={e => setNewPostContent(e.target.value)}
                            placeholder="分享你此刻的想法..."
                            className="min-h-[48vh] w-full resize-none bg-transparent text-[17px] font-semibold leading-8 text-slate-700 outline-none placeholder:text-slate-300"
                        />
                    </div>

                    <div className="shrink-0 border-t border-slate-100 bg-white px-6 pt-4" style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
                        <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">添加心情贴纸 (Sticker)</p>
                        <div className="flex gap-4 overflow-x-auto no-scrollbar">
                            {STICKER_OPTIONS.map(sticker => (
                                <button
                                    key={sticker.code}
                                    onClick={() => setNewPostEmoji(sticker.code)}
                                    className={`h-14 w-14 shrink-0 rounded-2xl border flex items-center justify-center transition-all ${newPostEmoji === sticker.code ? 'border-[#ff2442] bg-red-50' : 'border-slate-100 bg-white'}`}
                                >
                                    <img src={twemojiUrl(sticker.code)} alt={sticker.label} className="h-8 w-8" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* --- Main Feed View --- */}
            <div className={`flex-col h-full ${selectedPost || isCreateOpen ? 'hidden' : 'flex'}`}>
                
                <AppHeader
                    onBack={closeApp}
                    center
                    title={(
                    <div className="flex justify-center gap-7 text-[16px] font-black tracking-tight text-slate-300">
                        <button className={`${activeTab === 'moments' ? 'text-slate-800 border-b-2 border-[#ff2442] pb-0.5' : 'hover:text-slate-500'} transition-all focus:outline-none`} onClick={() => setActiveTab('moments')}>朋友圈</button>
                        <button className={`${activeTab === 'news' ? 'text-slate-800 border-b-2 border-[#ff2442] pb-0.5' : 'hover:text-slate-500'} transition-all focus:outline-none`} onClick={() => setActiveTab('news')}>资讯站</button>
                    </div>
                    )}
                    right={activeTab === 'news' && visibleFeed.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => setShowClearNewsConfirm(true)}
                            className="rounded-full border border-rose-100 bg-white/75 px-3 py-1.5 text-[11px] font-bold text-rose-500 shadow-sm active:scale-95"
                        >
                            清空
                        </button>
                    ) : undefined}
                    className="bg-white/70 border-white/40"
                />

                {/* Content Area */}
                <div
                    ref={feedScrollRef}
                    className="flex-1 overflow-y-auto no-scrollbar"
                    onTouchStart={handlePullStart}
                    onTouchMove={handlePullMove}
                    onTouchEnd={handlePullEnd}
                    onTouchCancel={handlePullEnd}
                    onPointerDown={handlePointerPullStart}
                    onPointerMove={handlePointerPullMove}
                    onPointerUp={handlePointerPullEnd}
                    onPointerCancel={handlePointerPullEnd}
                    onPointerLeave={handlePointerPullEnd}
                >
                    
                    {(activeTab === 'moments' || activeTab === 'news') && (
                        <div className="min-h-full pb-28">
                            {renderPullRefreshIndicator()}
                            {activeTab === 'moments' && renderMomentsCover()}
                            <div className="w-full overflow-hidden border-y border-white/70 bg-white/38 backdrop-blur-sm shadow-[0_16px_42px_rgba(148,163,184,0.08)]">
                                {displayFeed.length > 0 ? displayFeed.map(post => renderFeedItem(post)) : (
                                    <div className="flex min-h-52 flex-col items-center justify-center gap-2 px-8 text-center">
                                        <div className="text-sm font-bold text-slate-500">{activeTab === 'news' ? '资讯站现在是空的' : '朋友圈现在是空的'}</div>
                                        <p className="text-xs leading-5 text-slate-400">
                                            {activeTab === 'moments' && socialParticipants.length === 0
                                                ? '先在面具中链接角色；这里只有当前面具关系网里的动态。'
                                                : '下拉刷新时会新增一批内容，旧批次不会自己回来。'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'me' && (
                        <div className="min-h-full bg-white/80 backdrop-blur-xl animate-fade-in">
                            {/* Profile Header (Enhanced) */}
                            <div className="relative group">
                                <div className="h-40 w-full overflow-hidden bg-slate-200 relative cursor-pointer" onClick={() => userBgInputRef.current?.click()}>
                                    {userBgImage ? (
                                        <img src={userBgImage} className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={userProfile.avatar} className="w-full h-full object-cover blur-2xl opacity-60 scale-125" />
                                    )}
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <span className="text-white text-xs font-bold bg-black/30 px-3 py-1 rounded-full backdrop-blur-md">更换背景</span>
                                    </div>
                                    <input type="file" ref={userBgInputRef} className="hidden" accept="image/*" onChange={handleUserBgUpload} />
                                </div>
                                
                                <div className="px-6 relative -mt-12 flex justify-between items-end">
                                    {/* Social Avatar - Clickable to change */}
                                    <div className="w-24 h-24 rounded-full p-1 bg-white/90 backdrop-blur-md shadow-lg relative group cursor-pointer" onClick={() => socialAvatarInputRef.current?.click()}>
                                        <img src={socialProfile.avatar} className="w-full h-full rounded-full object-cover" />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full">
                                            <span className="text-white text-[10px] font-bold">更换</span>
                                        </div>
                                        <input type="file" ref={socialAvatarInputRef} className="hidden" accept="image/*" onChange={handleSocialAvatarUpload} />
                                    </div>

                                    <div className="flex gap-2 mb-2">
                                        <button onClick={() => { setIsEditingId(!isEditingId); if(isEditingId) saveUserProfileChanges(); }} className="px-4 py-1.5 rounded-full border border-slate-200/60 bg-white/50 backdrop-blur-sm text-xs font-bold text-slate-600 hover:bg-white transition-colors">
                                            {isEditingId ? '保存资料' : '编辑资料'}
                                        </button>
                                        <button onClick={() => setShowSettings(true)} className="rounded-full border border-slate-200/60 bg-white/50 px-4 py-1.5 text-xs font-bold text-slate-600 backdrop-blur-sm transition-colors hover:bg-white">账号管理</button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="px-6 pt-4 pb-6">
                                {isEditingId ? (
                                    <input 
                                        value={socialProfile.name} 
                                        onChange={e => setSocialProfile({...socialProfile, name: e.target.value})}
                                        className="text-2xl font-black text-slate-800 bg-slate-100/50 px-2 rounded outline-none border-b border-dashed border-slate-300 w-full mb-1"
                                    />
                                ) : (
                                    <h2 className="text-2xl font-black text-slate-800">{socialProfile.name}</h2>
                                )}

                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-slate-400 font-mono">朋友圈 ID: </span>
                                    {isEditingId ? (
                                        <input 
                                            value={userMomentsId}
                                            onChange={e => setUserMomentsId(e.target.value)}
                                            className="text-xs font-mono text-slate-600 bg-slate-100 px-1 rounded outline-none border-b border-primary w-24"
                                        />
                                    ) : (
                                        <span className="text-xs text-slate-400 font-mono">{userMomentsId}</span>
                                    )}
                                </div>
                                
                                {isEditingId ? (
                                    <textarea 
                                        value={socialProfile.bio} 
                                        onChange={e => setSocialProfile({...socialProfile, bio: e.target.value})}
                                        className="w-full mt-3 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg outline-none resize-none border border-slate-200 focus:border-primary/50"
                                        rows={3}
                                        placeholder="填写你的个人简介..."
                                    />
                                ) : (
                                    <p className="text-sm text-slate-600 mt-3 leading-relaxed font-light">{socialProfile.bio}</p>
                                )}

                                <div className="flex gap-6 mt-5 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-sm">
                                    <div className="text-center"><span className="block font-bold text-slate-800">142</span><span className="text-[10px] text-slate-400">关注</span></div>
                                    <div className="text-center"><span className="block font-bold text-slate-800">12.5k</span><span className="text-[10px] text-slate-400">粉丝</span></div>
                                    <div className="text-center"><span className="block font-bold text-slate-800">8902</span><span className="text-[10px] text-slate-400">获赞与收藏</span></div>
                                </div>
                            </div>

                            {/* Sticky Tabs */}
                            <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-slate-100 flex">
                                <button onClick={() => setProfileTab('notes')} className={`flex-1 py-3 text-sm font-bold transition-colors ${profileTab === 'notes' ? 'text-slate-900 border-b-2 border-[#ff2442]' : 'text-slate-400'}`}>笔记</button>
                                <button onClick={() => setProfileTab('collects')} className={`flex-1 py-3 text-sm font-bold transition-colors ${profileTab === 'collects' ? 'text-slate-900 border-b-2 border-[#ff2442]' : 'text-slate-400'}`}>收藏</button>
                            </div>

                            <div className="p-2 min-h-[300px] bg-slate-50/50 pb-24">
                                <div className="columns-2 gap-2 space-y-2">
                                    {scopedFeed.filter(p => profileTab === 'notes' ? p.authorName === socialProfile.name : p.isCollected).map(post => (
                                        <div key={post.id} onClick={() => { setSelectedPost(post); generateComments(post); }} className="break-inside-avoid bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer">
                                            <div className="aspect-[4/5] flex items-center justify-center text-4xl" style={{ background: post.bgStyle }}>{renderPostSticker(post.images?.[0], 'w-12 h-12')}</div>
                                            <div className="p-3">
                                                <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">{post.title}</h4>
                                                <div className="flex justify-between items-center mt-2">
                                                    <div className="flex items-center gap-1"><img src={post.authorAvatar} className="w-3 h-3 rounded-full" /><span className="text-[9px] text-slate-400 truncate w-12">{post.authorName}</span></div>
                                                    <div className="flex items-center gap-0.5 text-slate-400"><Icons.Heart filled={post.isLiked} className="w-3 h-3" /><span className="text-[9px]">{post.likes}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {scopedFeed.filter(p => profileTab === 'notes' ? p.authorName === socialProfile.name : p.isCollected).length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
                                        <Package size={48} className="text-slate-300 opacity-30" />
                                        <span className="text-xs">空空如也</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Navigation - Floating Glass Island (Only shown when not creating) */}
                <div className="absolute left-1/2 z-40 flex h-16 w-[88%] -translate-x-1/2 items-center justify-around rounded-full border border-white/70 bg-white/82 shadow-[0_10px_36px_rgba(71,85,105,0.12)] backdrop-blur-2xl" style={{ bottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                    <button onClick={() => setActiveTab('moments')} className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium transition-all ${activeTab === 'moments' ? 'text-slate-900 bg-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <House size={23} weight={activeTab === 'moments' ? 'fill' : 'regular'} />
                    </button>
                    <button onClick={() => setIsCreateOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white/75 bg-[#ff2442] text-[24px] font-light leading-none text-white shadow-[0_8px_20px_rgba(255,36,66,0.32)] transition-transform active:scale-95">+</button>
                    <button onClick={() => setActiveTab('me')} className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium transition-all ${activeTab === 'me' ? 'text-slate-900 bg-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <User size={23} />
                    </button>
                </div>
            </div>

            {selectedPost && renderDetail()}
        </div>
    );
};

export default SocialApp;
