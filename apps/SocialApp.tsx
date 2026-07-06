
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { CharacterProfile, SocialPost, SocialComment, SubAccount, SocialAppProfile } from '../types';
import { ContextBuilder } from '../utils/context';
import { processImage } from '../utils/file';
import Modal from '../components/os/Modal';
import { safeResponseJson } from '../utils/safeApi';
import { House, User, Package, Warning } from '@phosphor-icons/react';
import AppHeader from '../components/shell/AppHeader';
import { SHELL_APP_HEADER_CONTENT_TOP } from '../components/shell/shellLayout';

const TWEMOJI_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72';
const twemojiUrl = (codepoint: string) => `${TWEMOJI_BASE}/${codepoint}.png`;

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

const getRandomStyle = () => POST_STYLES[Math.floor(Math.random() * POST_STYLES.length)];
type SocialTab = 'moments' | 'news' | 'me';
const getPostKind = (post: SocialPost) => post.kind || 'moment';
const isCodepointSticker = (token?: string) => !!token && /^[0-9a-f]+(?:-[0-9a-f]+)*(?:-fe0f)?$/i.test(token);
const isImageAsset = (token?: string) => !!token && (/^(data:image|blob:|https?:\/\/|\/)/i.test(token));
const renderPostSticker = (token?: string, className = 'w-16 h-16') => {
    if (!token) return <img src={twemojiUrl('2728')} alt="sparkles" className={className} />;
    if (isCodepointSticker(token)) return <img src={twemojiUrl(token)} alt="" className={className} />;
    return <span>{token}</span>;
};
const isDemoPost = (post: SocialPost) => post.id.startsWith('demo-');
const isInteractiveTarget = (target: EventTarget | null) => (
    target instanceof Element &&
    !!target.closest('button, input, textarea, select, a, label, [role="button"]')
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
    const { closeApp, characters, updateCharacter, apiConfig, addToast, userProfile, groups } = useOS();
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

    // Refs
    const commentsEndRef = useRef<HTMLDivElement>(null);
    const detailScrollRef = useRef<HTMLDivElement>(null);
    const prevCommentCountRef = useRef(0); // Track comment count to prevent initial jump
    const pendingReplyRef = useRef<Set<string>>(new Set());
    const [pullDistance, setPullDistance] = useState(0);

    const visibleFeed = useMemo(() => {
        return feed.filter(post => activeTab === 'news' ? getPostKind(post) === 'news' : getPostKind(post) !== 'news');
    }, [feed, activeTab]);

    const placeholderFeed = useMemo<SocialPost[]>(() => {
        const now = Date.now();
        const findChar = (keyword: string) => characters.find(c => c.name.includes(keyword));
        const shen = findChar('沈星回') || characters[0];
        const qin = findChar('秦彻') || characters[1] || shen;
        const xia = findChar('夏以昼') || characters[2] || shen;
        const qi = findChar('祁煜') || characters[3] || shen;
        const avatarFor = (seed: string) => `https://api.dicebear.com/7.x/icons/svg?seed=${encodeURIComponent(seed)}`;
        const comment = (authorName: string, authorAvatar: string | undefined, content: string): SocialComment => ({
            id: `demo-comment-${authorName}-${content}`,
            authorName,
            authorAvatar,
            content,
            likes: 0,
            isCharacter: !!authorAvatar
        });

        return [
            {
                id: 'demo-moment-user-1',
                kind: 'moment',
                sourceType: 'user',
                charId: null,
                authorName: socialProfile.name || '我',
                authorAvatar: socialProfile.avatar,
                title: '今天的状态',
                content: '把手机放在窗边，结果光斑正好落在桌面上。感觉今天适合发生一点小事。',
                images: [],
                likes: 18,
                isCollected: false,
                isLiked: false,
                comments: [
                    shen && comment(shen.name, shen.avatar, '看见了。那束光很适合你。'),
                    qin && comment(qin.name, qin.avatar, '小事也行，大事也行。别忘了叫我。')
                ].filter(Boolean) as SocialComment[],
                timestamp: now - 1000 * 60 * 15,
                tags: ['朋友圈'],
                bgStyle: 'linear-gradient(135deg, #fff5f8 0%, #eef8ff 100%)',
                storySeedStatus: 'none',
                replyState: 'generated'
            },
            {
                id: 'demo-moment-char-1',
                kind: 'moment',
                sourceType: 'character',
                charId: shen?.id || null,
                authorName: shen?.name || '沈星回',
                authorAvatar: shen?.avatar || avatarFor('shen-xinghui'),
                title: '晚风',
                content: '路过便利店的时候，货架上的猫粮又换了位置。',
                images: [],
                likes: 126,
                isCollected: false,
                isLiked: false,
                comments: [
                    comment(socialProfile.name || '我', socialProfile.avatar, '你怎么每次都能注意到这种细节。'),
                    qi && comment(qi.name, qi.avatar, '这不就是很明显吗？')
                ].filter(Boolean) as SocialComment[],
                timestamp: now - 1000 * 60 * 48,
                tags: ['朋友圈'],
                bgStyle: 'linear-gradient(135deg, #eef2ff 0%, #fff7ed 100%)',
                storySeedStatus: 'none',
                replyState: 'none'
            },
            {
                id: 'demo-news-1',
                kind: 'news',
                sourceType: 'news',
                charId: null,
                authorName: '影视前线资讯站',
                authorAvatar: avatarFor('影视前线资讯站'),
                title: '一线制片人血泪经验大公开——新手入门 Q&A…',
                content: '匿名剧组成员投稿称，某片场最近出现了“每晚自动补满的热饮”。目前没有人承认，但值夜班的人都说味道不错。',
                images: [],
                likes: 2048,
                isCollected: false,
                isLiked: false,
                comments: [],
                timestamp: now - 1000 * 60 * 80,
                tags: ['影视', '传闻'],
                bgStyle: 'linear-gradient(135deg, rgba(93,123,154,0.72) 0%, rgba(228,215,200,0.86) 100%)',
                storySeedStatus: 'candidate',
                replyState: 'none'
            },
            {
                id: 'demo-news-2',
                kind: 'news',
                sourceType: 'news',
                charId: null,
                authorName: '诡语人',
                authorAvatar: avatarFor('诡语人'),
                title: '都市传说投稿：电影院怪谈',
                content: '临空市旧影院的第三排座位总会多出一张票。票根背面写着同一句话：请不要回头。',
                images: [],
                likes: 767,
                isCollected: false,
                isLiked: false,
                comments: [],
                timestamp: now - 1000 * 60 * 120,
                tags: ['都市传说', '剧情种子'],
                bgStyle: 'linear-gradient(135deg, rgba(31,41,55,0.72) 0%, rgba(148,163,184,0.78) 100%)',
                storySeedStatus: 'candidate',
                replyState: 'none'
            },
            {
                id: 'demo-news-3',
                kind: 'news',
                sourceType: 'news',
                charId: null,
                authorName: 'Twinkle潮玩社',
                authorAvatar: avatarFor('Twinkle潮玩社'),
                title: '一封来自玩偶剧团的宣传信，Twinkle 奇妙夜…',
                content: '本周主题活动将开放“会自己换座位”的玩偶展区。主办方提醒：若听见它叫你的名字，请先确认身后是否有人。',
                images: [],
                likes: 5312,
                isCollected: false,
                isLiked: false,
                comments: [],
                timestamp: now - 1000 * 60 * 180,
                tags: ['潮玩', '活动'],
                bgStyle: 'linear-gradient(135deg, rgba(244,114,182,0.62) 0%, rgba(253,224,71,0.45) 100%)',
                storySeedStatus: 'candidate',
                replyState: 'none'
            },
            {
                id: 'demo-news-4',
                kind: 'news',
                sourceType: 'news',
                charId: null,
                authorName: '深空时代',
                authorAvatar: avatarFor('深空时代'),
                title: '临空市异常天气观测：今晚或出现短时星砂雨',
                content: '气象站称该现象不会影响出行，但夜间外出者请留意通讯设备短暂失灵。',
                images: [],
                likes: 991,
                isCollected: false,
                isLiked: false,
                comments: [],
                timestamp: now - 1000 * 60 * 240,
                tags: ['临空市', '天气'],
                bgStyle: 'linear-gradient(135deg, rgba(59,130,246,0.60) 0%, rgba(236,253,245,0.88) 100%)',
                storySeedStatus: 'candidate',
                replyState: 'none'
            }
        ];
    }, [characters, socialProfile.name, socialProfile.avatar]);

    const displayFeed = useMemo(() => {
        if (visibleFeed.length > 0) return visibleFeed;
        return placeholderFeed.filter(post => activeTab === 'news' ? getPostKind(post) === 'news' : getPostKind(post) !== 'news');
    }, [visibleFeed, placeholderFeed, activeTab]);

    useEffect(() => {
        DB.getSocialPosts().then(posts => {
            if (posts.length > 0) {
                setFeed(posts.sort((a,b) => b.timestamp - a.timestamp));
            }
        });
        
        // Load user config and profile assets for the Moments surface.
        const loadAssets = async () => {
            const savedUserId = localStorage.getItem(MOMENTS_USER_ID_KEY);
            const dbBg = await DB.getAsset(MOMENTS_USER_COVER_ASSET_ID);
            const dbProfileStr = await DB.getAsset(MOMENTS_PROFILE_ASSET_ID);

            if (savedUserId) setUserMomentsId(savedUserId);
            
            if (dbBg) {
                setUserBgImage(dbBg);
            }
            
            let loadedProfile = null;
            if (dbProfileStr) {
                try { loadedProfile = JSON.parse(dbProfileStr); } catch(e) {}
            }

            if (loadedProfile) {
                setSocialProfile(loadedProfile);
            } else {
                // Initial fallback to global user profile only once
                setSocialProfile({
                    name: userProfile.name,
                    avatar: userProfile.avatar,
                    bio: userProfile.bio || '这个人很懒，什么都没写。'
                });
            }
        };
        loadAssets();

        // Load Handles
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
            const currentCount = selectedPost.comments.length;
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
    }, [selectedPost?.comments.length]);

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
                // Save to DB Assets
                await DB.saveAsset(MOMENTS_USER_COVER_ASSET_ID, base64);
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
            await DB.deleteAsset(MOMENTS_USER_COVER_ASSET_ID);
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
        localStorage.setItem(MOMENTS_USER_ID_KEY, userMomentsId);
        await DB.saveAsset(MOMENTS_PROFILE_ASSET_ID, JSON.stringify(socialProfile));
        setIsEditingId(false);
        addToast('主页资料已保存（仅在朋友圈生效）', 'success');
    };

    const persistFeed = (newFeed: SocialPost[]) => {
        setFeed(newFeed);
        Promise.all(newFeed.map(p => DB.saveSocialPost(p))).catch(console.error);
    };

    const updatePostInFeed = (post: SocialPost) => {
        setFeed(prev => {
            const next = prev.map(p => p.id === post.id ? post : p);
            DB.saveSocialPost(post);
            return next;
        });
        setSelectedPost(current => (current?.id === post.id ? post : current));
    };

    const removePostFromFeed = (postId: string) => {
        setFeed(prev => {
            const next = prev.filter(p => p.id !== postId);
            DB.deleteSocialPost(postId);
            return next;
        });
        setSelectedPost(current => (current?.id === postId ? null : current));
    };

    const buildPostShell = (item: any, kind: 'moment' | 'news'): SocialPost => {
        let avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${item.authorName || item.sourceName || 'news'}`;
        let sourceType: SocialPost['sourceType'] = kind === 'news' ? 'news' : (item.isCharacter ? 'character' : 'npc');
        let charId: string | null = item.charId || null;

        if (item.isCharacter || item.charId) {
            const c = characters.find(char => char.id === item.charId) || characters.find(char => {
                const handles = characterHandles[char.id] || [];
                return handles.some(h => h.handle === item.authorName);
            });
            if (c) {
                avatar = c.avatar;
                charId = c.id;
                sourceType = 'character';
            }
        } else if (kind === 'news') {
            avatar = `https://api.dicebear.com/7.x/icons/svg?seed=${item.authorName || item.sourceName || item.title || 'aether-news'}`;
        } else {
            const seeds = ['micah', 'avataaars', 'bottts', 'notionists'];
            avatar = `https://api.dicebear.com/7.x/${seeds[Math.floor(Math.random() * seeds.length)]}/svg?seed=${(item.authorName || 'NPC') + Math.random()}`;
        }

        return {
            id: `${kind}-${Date.now()}-${Math.random()}`,
            kind,
            sourceType,
            charId,
            authorName: item.authorName || item.sourceName || (kind === 'news' ? '深空资讯站' : 'Unknown'),
            authorAvatar: avatar,
            title: item.title || (kind === 'news' ? '未命名传闻' : '无标题'),
            content: item.content || item.summary || '...',
            images: item.images || [],
            likes: item.likes || 0,
            isCollected: false,
            isLiked: false,
            comments: [],
            timestamp: Date.now(),
            tags: item.tags || (kind === 'news' ? ['资讯站', '剧情种子'] : ['朋友圈']),
            bgStyle: getRandomStyle().bg,
            storySeedStatus: kind === 'news' ? 'candidate' : 'none',
            replyState: 'none'
        };
    };

    // --- AI Logic (Updated for Multi-Handle) ---
    const handleRefresh = async (targetTab: SocialTab = activeTab) => {
        if (!apiConfig.apiKey) { addToast('请配置 API Key', 'error'); return; }
        setIsRefreshing(true);
        try {
            const shuffledChars = [...characters].sort(() => 0.5 - Math.random());
            const selectedChars = shuffledChars.slice(0, Math.min(3, characters.length));
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

            const prompt = kind === 'news' ? `### 任务: 生成 AetherOS「朋友圈 · 资讯站」
你需要生成 5-7 条深空世界观里的资讯、都市传闻、奇葩小道消息。

### 内容方向
1. 世界内部媒体：影视前线、深空时代、Twinkle潮玩社、匿名爆料站、都市传闻账号。
2. 内容可以好笑、离谱、暧昧、有剧情钩子，但不要直接替用户决定主线事实。
3. 生成内容只是「候选剧情引导」，必须等用户采纳后，后续才可以进入剧情上下文。
4. 可参考当前内置角色和最近私聊状态，但不要把未发生的关系写成既成事实。

### 关联角色参考
${selectedChars.map(c => c.name).join('、')}

### 输入上下文
${charContexts}

### 输出格式 (JSON Array)
[
  {
    "sourceName": "媒体/账号名",
    "authorName": "媒体/账号名",
    "title": "新闻或传闻标题",
    "content": "正文摘要，像社交媒体资讯流，不要太长",
    "tags": ["影视", "传闻"],
    "likes": 随机数 (0 - 10000)
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

### 身份配置
${identityMap}

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
    "likes": 随机数 (0 - 10000)
  },
  ...
]`;
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.95, max_tokens: 8000 })
            });
            if (!response.ok) throw new Error('API Error');
            const data = await safeResponseJson(response);
            const json = safeParseJSON(data.choices[0].message.content);
            if (!Array.isArray(json)) throw new Error('Parsed data is not an array');
            
            const newPosts: SocialPost[] = json.map((item: any) => buildPostShell(item, kind));
            const updatedFeed = [...newPosts, ...feed];
            persistFeed(updatedFeed);
            addToast(kind === 'news' ? '资讯站已刷新' : '朋友圈已刷新', 'success');
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
        if (pointerStartedAtTopRef.current) e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerPullMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'touch' || pointerPullStartYRef.current === null || !pointerStartedAtTopRef.current || isRefreshing) return;
        if (e.buttons !== 1) {
            handlePointerPullEnd();
            return;
        }
        const scroller = feedScrollRef.current;
        if (scroller && scroller.scrollTop > 4 && pullDistance <= 0) return;
        const delta = e.clientY - pointerPullStartYRef.current;
        setPullDistance(delta > 0 ? Math.min(104, delta * 0.48) : 0);
    };

    const handlePointerPullEnd = () => {
        const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD && !isRefreshing && activeTab !== 'me';
        pointerPullStartYRef.current = null;
        pointerStartedAtTopRef.current = false;
        setPullDistance(0);
        if (shouldRefresh) void handleRefresh(activeTab);
    };

    const generateComments = async (post: SocialPost, options: { force?: boolean; replyToUserPost?: boolean } = {}) => {
        if (!post || (!options.force && post.comments.length > 0) || !apiConfig.apiKey) return;
        setLoadingComments(true);
        try {
            const shuffledChars = [...characters].sort(() => 0.5 - Math.random());
            const selectedChars = shuffledChars.slice(0, 2);
            
            let identityMap = "";
            for (const char of selectedChars) {
                const handles = characterHandles[char.id] || [];
                const hList = handles.map(h => `"${h.handle}" (${h.note})`).join(', ');
                identityMap += `- 角色 ${char.name} 可用身份: ${hList}\n`;
            }

            let contextPrompt = "";
            for (const char of selectedChars) { contextPrompt += `\n<<< 评论者角色: ${char.name} >>>\n${ContextBuilder.buildCoreContext(char, userProfile, false)}\n`; }
            
            let authorType = "Stranger";
            if (post.authorName === socialProfile.name) authorType = "User";
            else { 
                const c = characters.find(ch => {
                    const handles = characterHandles[ch.id] || [];
                    return handles.some(h => h.handle === post.authorName);
                });
                if (c) authorType = `Character "${c.name}"`; 
            }

            const prompt = `### 任务: 模拟朋友圈评论区
**帖子来源**: "${getPostKind(post) === 'news' ? '资讯站' : '朋友圈'}"
**楼主**: "${post.authorName}" (${authorType})
**帖子**: "${post.title}"
**正文**: "${post.content}"

${options.replyToUserPost ? '这是用户刚发的朋友圈动态。请生成 2-4 条来自男主、关联 NPC 或朋友的自然回复，语气像朋友圈评论，不要太像系统总结。' : '请生成 4-6 条评论。混合使用 **选定角色** 和 **随机路人**。'}
角色评论时，请选择一个符合语境的账号昵称。

### 角色身份库
${identityMap}

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
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.8 })
            });
            if (response.ok) {
                const data = await safeResponseJson(response);
                const json = safeParseJSON(data.choices[0].message.content);
                if (Array.isArray(json)) {
                    const comments: SocialComment[] = json.map((c: any) => {
                        const authorName = c.author || c.authorName || 'Unknown';
                        let avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${authorName}`;
                        
                        // Check if char
                        const char = characters.find(ch => {
                            const handles = characterHandles[ch.id] || [];
                            return handles.some(h => h.handle === authorName);
                        });

                        if (char) avatar = char.avatar;
                        return { id: `cmt-${Math.random()}`, authorName: authorName, authorAvatar: avatar, content: c.content || '...', likes: Math.floor(Math.random() * 100), isCharacter: !!char };
                    });
                    updatePostInFeed({ ...post, comments, replyState: post.replyState === 'pending' ? 'generated' : post.replyState });
                }
            }
        } catch (e: any) { addToast("评论加载失败", "error"); } finally { setLoadingComments(false); }
    };

    useEffect(() => {
        if (!apiConfig.apiKey) return;
        const timer = window.setInterval(() => {
            const duePost = feed.find(post =>
                getPostKind(post) === 'moment' &&
                post.sourceType === 'user' &&
                post.replyState === 'pending' &&
                !!post.replyDueAt &&
                post.replyDueAt <= Date.now() &&
                !pendingReplyRef.current.has(post.id)
            );
            if (duePost) {
                pendingReplyRef.current.add(duePost.id);
                generateComments(duePost, { force: true, replyToUserPost: true });
            }
        }, 15000);
        return () => window.clearInterval(timer);
    }, [feed, apiConfig.apiKey, characters.length, socialProfile.name]);

    const generateRepliesToUser = async (post: SocialPost, userContent: string) => {
        if (!apiConfig.apiKey) return;
        setIsReplyingToUser(true);
        try {
            // Simplified handle map for replies
            let identityMap = "";
            characters.forEach(char => {
                const handles = characterHandles[char.id] || [];
                const hList = handles.map(h => `"${h.handle}"`).join(', ');
                identityMap += `- ${char.name}: ${hList}\n`;
            });

            const prompt = `### 任务: 回复用户的评论
**场景**: 用户 "${socialProfile.name}" 在帖子下发了一条评论: "${userContent}"。
**帖子**: "${post.title}"
请生成 1-3 条对用户评论的回复。
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
                if (Array.isArray(json)) {
                    const newReplies: SocialComment[] = json.map((c: any) => {
                        const authorName = c.author || c.authorName || 'Unknown';
                        let avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${authorName}`;
                        
                        const char = characters.find(ch => {
                            const handles = characterHandles[ch.id] || [];
                            return handles.some(h => h.handle === authorName);
                        });

                        if (char) avatar = char.avatar;
                        return { id: `cmt-reply-${Date.now()}-${Math.random()}`, authorName: authorName, authorAvatar: avatar, content: `回复 @${socialProfile.name}: ${c.content}`, likes: Math.floor(Math.random() * 10) };
                    });
                    if (newReplies.length > 0) {
                        updatePostInFeed({ ...post, comments: [...(post.comments || []), ...newReplies] });
                        addToast(`收到 ${newReplies.length} 条新回复`, 'info');
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
            replyState: apiConfig.apiKey ? 'pending' : 'none',
            replyDueAt: apiConfig.apiKey ? Date.now() + 90000 : undefined
        };
        persistFeed([post, ...feed]);
        setNewPostContent(''); setNewPostTitle(''); 
        setIsCreateOpen(false); // Close Modal
        setActiveTab('moments');
        addToast(apiConfig.apiKey ? '已发布，稍后会有人来回复' : '发布成功', 'success');
    };

    const handleDeletePost = (postId: string) => { removePostFromFeed(postId); addToast('帖子已删除', 'success'); };
    const handleLike = (e: any, post: SocialPost) => {
        e.stopPropagation();
        const nextPost = { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 };
        if (isDemoPost(post)) {
            setSelectedPost(current => current?.id === post.id ? nextPost : current);
            return;
        }
        updatePostInFeed(nextPost);
    };
    const handleAdoptStorySeed = (post: SocialPost) => {
        if (isDemoPost(post)) {
            setSelectedPost(current => current?.id === post.id ? { ...post, storySeedStatus: 'adopted', adoptedAt: Date.now() } : current);
            addToast('占位内容仅用于查看布局，真实资讯刷新后才会保存', 'info');
            return;
        }
        updatePostInFeed({ ...post, storySeedStatus: 'adopted', adoptedAt: Date.now() });
        addToast('已标记为剧情引导，不会自动写入记忆', 'success');
    };
    
    const handleSendComment = async () => { 
        if (!selectedPost || !commentInput.trim()) return; 
        
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
    
    const handleClearFeed = () => { DB.clearSocialPosts(); setFeed([]); setShowSettings(false); addToast('朋友圈内容已清空', 'success'); };

    // --- Renderers ---

    const openPost = (post: SocialPost) => {
        setSelectedPost(post);
        if (!isDemoPost(post)) generateComments(post);
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
                            <span>{post.comments.length} 评论</span>
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
                    <div className="flex items-center justify-between px-4 bg-white/80 backdrop-blur-xl border-b border-white/40 shrink-0 relative z-20" style={{ paddingTop: SHELL_APP_HEADER_CONTENT_TOP, paddingBottom: '10px' }}>
                        <button onClick={() => setSelectedPost(null)} className="p-2 -m-2 active:opacity-60"><Icons.Back onClick={() => setSelectedPost(null)} /></button>
                        <div className="flex items-center gap-2">
                            <img src={selectedPost.authorAvatar} className="w-8 h-8 rounded-full object-cover border border-white/50" />
                            <span className="text-sm font-bold text-slate-800">{selectedPost.authorName}</span>
                        </div>
                        <button onClick={() => setShowShareModal(true)} className="p-2 -m-2 active:opacity-60"><Icons.Share onClick={() => setShowShareModal(true)} className="w-6 h-6 text-slate-800 cursor-pointer hover:text-[#ff2442]" /></button>
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
                                {selectedPost.tags.map(t => <span key={t} className="text-xs font-bold text-blue-600 bg-blue-50/50 backdrop-blur-sm border border-blue-100 px-2.5 py-1 rounded-full">#{t}</span>)}
                            </div>
                            <div className="text-xs text-slate-400 font-medium border-b border-slate-100/50 pb-6">{new Date(selectedPost.timestamp).toLocaleDateString()}</div>
                        </div>

                        {/* Comments Section */}
                        <div className="px-6 pb-6">
                            <div className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <span>共 {selectedPost.comments.length} 条评论</span>
                                {(loadingComments || isReplyingToUser) && <div className="w-3 h-3 border-2 border-slate-300 border-t-[#ff2442] rounded-full animate-spin"></div>}
                            </div>
                            
                            <div className="space-y-6">
                                {selectedPost.comments.length === 0 && !loadingComments && <div className="text-center text-slate-300 text-xs py-10">快来抢沙发...</div>}
                                {selectedPost.comments.map(c => (
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
                        {characters.map(c => (
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
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={handleClearFeed} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl text-xs active:bg-slate-50">清空朋友圈</button>
                        <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-[#ff2442] text-white font-bold rounded-xl text-xs shadow-lg shadow-red-200 active:scale-95 transition-transform">完成</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={showShareModal} title="分享帖子" onClose={() => setShowShareModal(false)}>
                <div className="grid grid-cols-4 gap-4 p-2">
                    {characters.slice(0, 8).map(c => (
                        <button key={c.id} onClick={() => handleShare(c.id, false)} className="flex flex-col items-center gap-2 group">
                            <img src={c.avatar} className="w-12 h-12 rounded-full object-cover border border-slate-100 group-active:scale-90 transition-transform" />
                            <span className="text-[10px] text-slate-600 truncate w-full text-center">{c.name}</span>
                        </button>
                    ))}
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
                                {displayFeed.map(post => renderFeedItem(post))}
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
                                    {feed.filter(p => profileTab === 'notes' ? p.authorName === socialProfile.name : p.isCollected).map(post => (
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
                                {feed.filter(p => profileTab === 'notes' ? p.authorName === socialProfile.name : p.isCollected).length === 0 && (
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
