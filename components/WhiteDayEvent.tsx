/**
 * WhiteDayEvent.tsx
 * 心契玩法（兼容白色情人节 2026 记录）
 *
 * 独立模块，不修改任何已有结构。
 * - 弹窗提示 → 相性挑战
 * - Q&A 7题，用轻松题目照出互动偏好
 * - 角色逐题回应，并沉淀用户侧写线索
 * - 结束后把信件记入队列，在当天安静时段送进聊天
 * - 降级入口：桌面"特别时光" app
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { ContextBuilder } from '../utils/context';
import { safeFetchJson, safeResponseJson } from '../utils/safeApi';
import { CharacterProfile, MemoryFragment } from '../types';
import { SPECIAL_MOMENT_PROMPT_BOUNDARY } from '../utils/specialMoments';
import AppHeader from './shell/AppHeader';

// ============================================================
// localStorage keys
// ============================================================
const WHITEDAY_DISMISSED_KEY = 'aetheros_whiteday_2026_dismissed';
const WHITEDAY_COMPLETED_KEY = 'aetheros_whiteday_2026_completed';
export const WHITEDAY_RECORD_KEY = 'whiteday_2026';
const QUIZ_PASS_SCORE = 5;
const QUIZ_TOTAL = 7;
const HEART_LETTER_MIN_DELAY_MS = 12 * 60 * 1000;
const HEART_LETTER_DELAY_RANGE_MS = 16 * 60 * 1000;

const hashText = (value: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

export const resolveHeartLetterDueAt = (charId: string, now = Date.now()): number => {
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 50, 0, 0);
    const remainingToday = endOfToday.getTime() - now;
    if (remainingToday <= 2 * 60 * 1000) return now + 2 * 60 * 1000;
    const offset = hashText(`${charId}:${new Date(now).toDateString()}`) % HEART_LETTER_DELAY_RANGE_MS;
    return Math.min(now + HEART_LETTER_MIN_DELAY_MS + offset, endOfToday.getTime());
};

// ============================================================
// Types
// ============================================================
interface WhiteDayQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    correctThought: string;
    wrongThought: string;
    insightTarget?: string;
    optionProfiles?: string[];
}

interface WhiteDayQuizData {
    intro: string;
    questions: WhiteDayQuestion[];
}

interface ReviewLine {
    questionIndex: number; // -1 = 最终评语
    isCorrect: boolean;
    emotion: string;
    dialogue: string;
    isFinal?: boolean;
    isChocolate?: boolean;
}

interface WhiteDayReviewData {
    reviews: { questionIndex: number; isCorrect: boolean; emotion: string; dialogue: string }[];
    finalScore: number;
    finalEmotion: string;
    finalDialogue: string;
    chocolateDialogue?: string;
    letterTitle?: string;
    letterBody?: string;
    profileSummary?: string;
    profileInsights?: string[];
}

type Phase =
    | 'select'
    | 'loading_quiz'
    | 'quiz'
    | 'loading_review'
    | 'reviewing'
    | 'letter_sent'
    | 'retry'
    | 'view_result'; // 查看已完成的结果（重新进入时）

// ============================================================
// 工具函数
// ============================================================
export const isWhiteDay = (): boolean => {
    const now = new Date();
    return now.getFullYear() === 2026 && now.getMonth() === 2 && now.getDate() === 14;
};

export const shouldShowWhiteDayPopup = (): boolean => {
    if (!isWhiteDay()) return false;
    try {
        if (localStorage.getItem(WHITEDAY_DISMISSED_KEY)) return false;
        if (localStorage.getItem(WHITEDAY_COMPLETED_KEY)) return false;
    } catch { /* ignore */ }
    return true;
};

export const isWhiteDayEventAvailable = (): boolean => {
    const now = new Date();
    return now.getFullYear() === 2026 && now.getMonth() === 2;
};

// 非情绪的 sprite key，不应作为可用情绪标签
const NON_EMOTION_KEYS = new Set(['chibi', 'default', 'thumbnail', 'icon', 'avatar']);

const getActiveSprites = (char: CharacterProfile): Record<string, string> => {
    // 优先使用当前激活的皮肤组，否则回退到默认立绘
    if (char.activeSkinSetId && char.dateSkinSets) {
        const skin = char.dateSkinSets.find(s => s.id === char.activeSkinSetId);
        if (skin) return skin.sprites;
    }
    return char.sprites || {};
};

const getAvailableEmotions = (char: CharacterProfile): string[] => {
    const sprites = getActiveSprites(char);
    const keys = Object.keys(sprites).filter(k => !NON_EMOTION_KEYS.has(k));
    return keys.length > 0 ? keys : ['normal', 'happy', 'sad', 'shy', 'angry'];
};

const extractJSON = (text: string): any => {
    try {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced) return JSON.parse(fenced[1]);
        const brace = text.match(/(\{[\s\S]*\})/);
        if (brace) return JSON.parse(brace[1]);
        return JSON.parse(text);
    } catch {
        return null;
    }
};

// ============================================================
// 初始弹窗（风格与情人节弹窗一致）
// ============================================================
interface WhiteDayPopupProps {
    onView: () => void;
    onDismiss: () => void;
    onCheckApi: () => void;
    targetName?: string;
}

const WhiteDayPopup: React.FC<WhiteDayPopupProps> = ({ onView, onDismiss, onCheckApi, targetName }) => {
    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
            <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-amber-200/50 overflow-hidden animate-slide-up">
                {/* 装饰性背景 */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-100/60 to-transparent rounded-bl-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-orange-50/40 to-transparent rounded-tr-full pointer-events-none" />

                {/* Header */}
                <div className="pt-8 pb-4 px-6 text-center relative">
                    <div className="text-4xl mb-3 animate-bounce">💌</div>
                    <h2 className="text-lg font-extrabold text-slate-800">{targetName || '想见的人'}好像有事找你？</h2>
                    <p className="text-[11px] text-amber-400 mt-1.5 font-medium">2026 White Day Special</p>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">想和其他角色玩？可以在桌面「特别时光」中找到</p>
                </div>

                {/* Buttons */}
                <div className="px-6 pb-8 pt-2 space-y-3 relative">
                    <button
                        onClick={onView}
                        className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-amber-200 active:scale-95 transition-transform text-sm flex items-center justify-center gap-2"
                    >
                        <span>查看</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" /></svg>
                    </button>

                    <button
                        onClick={onCheckApi}
                        className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl active:scale-95 transition-transform text-sm"
                    >
                        我先切换API！
                    </button>

                    <button
                        onClick={onDismiss}
                        className="w-full py-2.5 text-slate-400 text-xs font-medium active:scale-95 transition-transform"
                    >
                        没兴趣
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// API 配置内联组件（白色情人节版）
// ============================================================
const WhiteDayApiSetup: React.FC<{ onDone: () => void; onBack: () => void }> = ({ onDone, onBack }) => {
    const { apiConfig, updateApiConfig, addToast, availableModels, setAvailableModels } = useOS();

    const [localUrl, setLocalUrl] = useState(apiConfig.baseUrl);
    const [localKey, setLocalKey] = useState(apiConfig.apiKey);
    const [localModel, setLocalModel] = useState(apiConfig.model);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [showModelList, setShowModelList] = useState(false);

    const handleSave = () => {
        updateApiConfig({ baseUrl: localUrl, apiKey: localKey, model: localModel });
        setStatusMsg('配置已保存');
        addToast('API 配置已保存', 'success');
        setTimeout(() => setStatusMsg(''), 2000);
    };

    const fetchModels = async () => {
        if (!localUrl) { setStatusMsg('请先填写 URL'); return; }
        setIsLoadingModels(true);
        setStatusMsg('正在连接...');
        try {
            const baseUrl = localUrl.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${localKey}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const data = await safeResponseJson(response);
            const list = data.data || data.models || [];
            if (Array.isArray(list)) {
                const models = list.map((m: any) => m.id || m);
                setAvailableModels(models);
                if (models.length > 0 && !models.includes(localModel)) setLocalModel(models[0]);
                setStatusMsg(`获取到 ${models.length} 个模型`);
                setShowModelList(true);
            } else { setStatusMsg('格式不兼容'); }
        } catch (error: any) {
            setStatusMsg('连接失败');
        } finally {
            setIsLoadingModels(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
            <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up max-h-[85vh] flex flex-col">
                <div className="px-6 pt-6 pb-2 text-center shrink-0">
                    <div className="text-2xl mb-1">🔧</div>
                    <h3 className="text-lg font-bold text-slate-800">API 配置</h3>
                    <p className="text-[11px] text-slate-400 mt-1">配置完成后即可开始心契</p>
                </div>

                <div className="px-6 py-4 space-y-4 overflow-y-auto no-scrollbar flex-1">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">URL</label>
                        <input type="text" value={localUrl} onChange={(e) => setLocalUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Key</label>
                        <input type="password" value={localKey} onChange={(e) => setLocalKey(e.target.value)} placeholder="sk-..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1.5 pl-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model</label>
                            <button onClick={fetchModels} disabled={isLoadingModels} className="text-[10px] text-primary font-bold">{isLoadingModels ? 'Fetching...' : '刷新模型列表'}</button>
                        </div>
                        <input type="text" value={localModel} onChange={(e) => setLocalModel(e.target.value)} placeholder="gpt-4o-mini" className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />

                        {showModelList && availableModels.length > 0 && (
                            <div className="mt-2 max-h-32 overflow-y-auto no-scrollbar bg-slate-50 rounded-xl border border-slate-200/60 p-1">
                                {availableModels.map(m => (
                                    <button key={m} onClick={() => { setLocalModel(m); setShowModelList(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono ${m === localModel ? 'bg-primary/10 text-primary font-bold' : 'text-slate-600 hover:bg-slate-100'}`}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button onClick={handleSave} className="w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-primary/20 bg-primary active:scale-95 transition-all">
                        {statusMsg || '保存配置'}
                    </button>
                </div>

                <div className="px-6 pb-6 pt-2 flex gap-3 shrink-0">
                    <button onClick={onBack} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform text-sm">
                        返回
                    </button>
                    <button onClick={onDone} className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-amber-200 active:scale-95 transition-transform text-sm">
                        开始心契 💌
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// 主体：白色情人节体验
// ============================================================
interface WhiteDaySessionProps {
    charId?: string;
    onClose: () => void;
    occasion?: 'evergreen' | 'white_day';
}

const HeartSessionHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
    <div onClick={event => event.stopPropagation()}>
        <AppHeader
            title={title}
            onBack={onBack}
            center
            className="border-amber-100/80 bg-white/85 backdrop-blur-xl"
            titleClassName="truncate text-base font-bold tracking-tight text-amber-900"
        />
    </div>
);

export const WhiteDaySession: React.FC<WhiteDaySessionProps> = ({ charId, onClose, occasion = 'evergreen' }) => {
    const { characters, activeCharacterId, apiConfig, userProfile, updateCharacter } = useOS();

    const [selectedCharId, setSelectedCharId] = useState<string>(charId || activeCharacterId || '');

    // 如果已有完成记录，直接进入查看结果界面
    const getInitialPhase = (): Phase => {
        if (!charId) return 'select';
        const char = characters.find(c => c.id === charId);
        if (char?.specialMomentRecords?.[WHITEDAY_RECORD_KEY]) return 'view_result';
        return 'loading_quiz';
    };
    const [phase, setPhase] = useState<Phase>(getInitialPhase);

    // Quiz
    const [quizData, setQuizData] = useState<WhiteDayQuizData | null>(null);
    const [userAnswers, setUserAnswers] = useState<number[]>([]);

    // Review
    const [reviewData, setReviewData] = useState<WhiteDayReviewData | null>(null);
    const [reviewLineIndex, setReviewLineIndex] = useState(0);
    const [displayedText, setDisplayedText] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);

    const [errorMsg, setErrorMsg] = useState('');

    const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const quizRequestRef = useRef<string | null>(null);
    const reviewRequestRef = useRef(false);

    const char = characters.find(c => c.id === selectedCharId);

    // 展开所有相性回应行（reviews + final）
    // 用数组顺序索引而非 AI 返回的 questionIndex，防止评价和题目对不上
    const allReviewLines: ReviewLine[] = useMemo(() => {
        if (!reviewData) return [];
        const lines: ReviewLine[] = reviewData.reviews.map((r, idx) => ({
            questionIndex: idx,
            isCorrect: r.isCorrect,
            emotion: r.emotion,
            dialogue: r.dialogue,
        }));
        lines.push({
            questionIndex: -1,
            isCorrect: true,
            emotion: reviewData.finalEmotion,
            dialogue: reviewData.finalDialogue,
            isFinal: true,
        });
        return lines;
    }, [reviewData]);

    // 初始化加载
    useEffect(() => {
        if (phase === 'loading_quiz' && selectedCharId) {
            if (quizRequestRef.current === selectedCharId) return;
            quizRequestRef.current = selectedCharId;
            void generateQuiz(selectedCharId).finally(() => {
                if (quizRequestRef.current === selectedCharId) quizRequestRef.current = null;
            });
        }
    }, [phase, selectedCharId]);

    // 相性回应阶段打字机动画
    useEffect(() => {
        if (phase !== 'reviewing' || allReviewLines.length === 0) return;
        const line = allReviewLines[reviewLineIndex];
        if (!line) return;

        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        setDisplayedText('');
        setIsAnimating(true);

        let i = 0;
        const tick = () => {
            i++;
            setDisplayedText(line.dialogue.slice(0, i));
            if (i < line.dialogue.length) {
                animTimerRef.current = setTimeout(tick, 28);
            } else {
                setIsAnimating(false);
            }
        };
        animTimerRef.current = setTimeout(tick, 28);
        return () => { if (animTimerRef.current) clearTimeout(animTimerRef.current); };
    }, [reviewLineIndex, phase, allReviewLines]);

    useEffect(() => {
        const testWindow = window as typeof window & { render_game_to_text?: () => string };
        const previousRenderer = testWindow.render_game_to_text;
        testWindow.render_game_to_text = () => JSON.stringify({
            surface: 'heart_session',
            phase,
            occasion,
            characterId: selectedCharId || null,
            questionCount: quizData?.questions.length || 0,
            answeredCount: userAnswers.filter(answer => answer >= 0).length,
            reviewLineIndex: phase === 'reviewing' ? reviewLineIndex : null,
            reviewLineCount: allReviewLines.length,
            letterQueued: phase === 'reviewing' || phase === 'letter_sent' || phase === 'view_result',
            error: errorMsg || null,
        });
        return () => {
            if (previousRenderer) testWindow.render_game_to_text = previousRenderer;
            else delete testWindow.render_game_to_text;
        };
    }, [allReviewLines.length, errorMsg, occasion, phase, quizData?.questions.length, reviewLineIndex, selectedCharId, userAnswers]);

    // ============================================================
    // API 调用 1：生成题目
    // ============================================================
    const generateQuiz = async (cId: string) => {
        setErrorMsg('');
        const c = characters.find(ch => ch.id === cId);
        if (!c || !apiConfig) {
            setErrorMsg('找不到角色或 API 未配置');
            setPhase('select');
            return;
        }
        try {
            const msgs = await DB.getMessagesByCharId(cId);
            const limit = c.contextLimit || 500;
            const recentMsgs = msgs
                .slice(-limit)
                .map(m => `${m.role}: ${m.type === 'image' ? '[图片]' : m.content}`)
                .join('\n');

            const baseContext = ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(c, userProfile, true);
            const availableEmotions = getAvailableEmotions(c);
            const occasionBoundary = occasion === 'white_day'
                ? SPECIAL_MOMENT_PROMPT_BOUNDARY
                : `### 场景边界
这是随时都能玩的日常双人互动。本轮以当下关系与日常相处为场景锚点。
最近记录中的节日卡片属于过去的共同经历；开场、题面和回应聚焦此刻的普通一天。`;

            const prompt = `### 双人玩法：心契

你要和 ${userProfile.name} 玩一轮“心契”。
这是一轮轻松的双人选择游戏。你们借七次选择互相试探：可能合拍，可能不同，也可能只是觉得对方的答案很有意思。

${occasionBoundary}

### 人设优先级（最高）
- 角色卡、既有记忆、当前关系阶段和角色平时的表达方式，高于下面所有风格示例。
- 温柔、平静、好奇、吐槽、嘴硬或轻微冲突都是可用反应；每次选择都由角色本人、关系阶段和具体题境共同决定。
- 七题的表达保持角色一贯的生命力与自然起伏。题目与选项应像这个角色此刻真的会拿来玩的东西。

你的任务是设计 7 道符合这个角色的相性选择：
- 题面先做到好玩、好代入，像亲密关系里的胡闹、赌一把、故意为难和真心话，让用户感到自己正在和角色互动。
- 后台为每题保留 insightTarget 和 optionProfiles，供系统低调沉淀关系线索；用户看到的题面始终采用生活化、情境化的说法。
- 选项先写成四种真实可选的反应，再让关系差异自然映射在后台字段里。
- correctIndex 代表这个角色本人最喜欢的答案。角色可以偏心，也可以对其它选择保留自己的态度。

### 游戏规则（回应时用到）
- 共 ${QUIZ_TOTAL} 轮选择，撞中你最心动答案越多，合拍值越高
- 每一种选择都有效；合拍值只记录彼此偏好相遇的次数
- 没撞中代表答案不同。请按人设和具体题境自然回应，让态度落在这件小事上，并始终尊重彼此人格与安全边界
- 挑战结束后你会把一封信留到稍晚的聊天里；游戏页面先保留“已经记下”的余韵，信件正文在聊天中出现

### 七层递进结构（按此顺序出题）

**第1题——轻松破冰**
用一个有趣但不空洞的情境破冰，看 ${userProfile.name} 的第一反应：直球表达、恶作剧、照顾你、还是跟着你一起发疯。

**第2题——生活默契**
设计一个日常但有趣的小场景，让不同生活节奏通过人物行动自然撞在一起。

**第3题——被哄方式**
题目要能看出 ${userProfile.name} 被安抚、被逗笑、被认真对待时更吃哪一套。

**第4题——浪漫口味**
用一个夸张的纪念日/约会/礼物场景，看 TA 更喜欢仪式感、实用照顾、暧昧拉扯、还是奇怪但独属于你们的东西。

**第5题——关系安全感**
题目要能看出 TA 在亲密关系里更需要被确认、被陪伴、被信任、还是被自由地理解。

**第6题——心里话包装成玩笑**
题目表面可以很好笑，但里面藏一点你想说的话。四个选项都可以可爱，预设答案是你最想听到的回应。

**第7题——最后一道，也是真心话**
最后一题负责收束关系感。角色可以克制、认真、别扭、好笑或坦率；核心是让人感觉你们愿意继续了解彼此。

### 重要要求
- **可以从你拥有的记忆中汲取灵感**。记忆作为调味，题目聚焦两个人此刻的互动与选择
- 每道题都要有你这个角色专属的气质：你的说话方式、小性子、温度和独有表达
- 题目要像亲密关系里会互相转发的小游戏；暧昧、嘴欠、离谱或轻微冒犯只有在符合当前角色与关系时才使用
- 四个选项都具有真实吸引力与代价；按题境选用自私、耍赖、装傻、逃跑、争抢等有生命力且尊重边界的反应
- 至少两题让不同答案拥有真正的分歧空间，给角色留下自然反应与继续了解彼此的余地
- 题型混用疑问、陈述、感叹、假设、怪问题或一句心里话

**emotion 从这些标签中选择**: ${availableEmotions.join(', ')}

仅输出以下 JSON 对象：
{
  "intro": "开场白（1-2句，用角色自己的方式把 ${userProfile.name} 拉进心契，直接进入互动；${occasion === 'evergreen' ? '以普通一天的当下关系开场' : '以角色口吻自然承接白色情人节'}）",
  "questions": [
    {
      "question": "题目（45字内，好玩、好代入，采用生活化情境表达）",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctIndex": 0,
      "insightTarget": "这题想观察的用户侧写目标，例如：被安抚方式 / 浪漫口味 / 安全感来源",
      "optionProfiles": ["A选项代表的用户倾向", "B选项代表的用户倾向", "C选项代表的用户倾向", "D选项代表的用户倾向"],
      "correctThought": "撞上你最心动答案时你说的话（1-2句，符合性格）",
      "wrongThought": "没撞上时你对差异的自然回应（1-2句，符合性格）"
    }
  ]
}`;

            const data = await safeFetchJson(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                aetherHandledFailure: true,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [
                        { role: 'system', content: baseContext },
                        { role: 'user', content: `[最近记录]:\n${recentMsgs}\n\n---\n\n${prompt}` },
                    ],
                    temperature: 0.85,
                }),
            }, 1);
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error('AI 返回为空');

            const parsed = extractJSON(content) as WhiteDayQuizData;
            if (!parsed?.questions || parsed.questions.length === 0) throw new Error('题目解析失败，请重试');

            setQuizData(parsed);
            setUserAnswers(new Array(parsed.questions.length).fill(-1));
            setErrorMsg('');
            setPhase('quiz');
        } catch (e: any) {
            console.info('[Heart] quiz request paused:', e);
            setErrorMsg(e.message === 'Failed to fetch' ? '连接刚刚断了一下，请重试' : (e.message || '生成题目失败'));
        }
    };

    // ============================================================
    // 把心契信记入等待队列；同一角色只保留一封尚未送达的心契信。
    // ============================================================
    const scheduleQuizCardForChat = async (reviewResult: WhiteDayReviewData, quizQuestions: WhiteDayQuestion[], answers: number[]) => {
        if (!char || !selectedCharId) return null;
        const labels = ['A', 'B', 'C', 'D'];
        const cardData = {
            type: 'whiteday_card',
            charName: char.name,
            charAvatar: char.avatar,
            score: reviewResult.finalScore,
            total: QUIZ_TOTAL,
            passScore: QUIZ_PASS_SCORE,
            passed: reviewResult.finalScore >= QUIZ_PASS_SCORE,
            letterTitle: reviewResult.letterTitle || `${char.name}留给你的心契信`,
            letterBody: reviewResult.letterBody || reviewResult.finalDialogue,
            profileSummary: reviewResult.profileSummary || '',
            profileInsights: reviewResult.profileInsights || [],
            questions: quizQuestions.map((q, i) => ({
                question: q.question,
                options: q.options,
                insightTarget: q.insightTarget || '',
                optionProfiles: q.optionProfiles || [],
                correctIndex: q.correctIndex,
                userAnswerIndex: answers[i],
                userAnswer: answers[i] >= 0 ? `${labels[answers[i]]}. ${q.options[answers[i]]}` : '未作答',
                correctAnswer: `${labels[q.correctIndex]}. ${q.options[q.correctIndex]}`,
                isCorrect: reviewResult.reviews[i]?.isCorrect ?? (answers[i] === q.correctIndex),
                review: reviewResult.reviews[i]?.dialogue || '',
            })),
            finalDialogue: reviewResult.finalDialogue,
        };
        const createdAt = Date.now();
        const dueAt = resolveHeartLetterDueAt(selectedCharId, createdAt);
        const id = `heart-letter-${selectedCharId}-${WHITEDAY_RECORD_KEY}`;
        await DB.saveScheduledMessage({
            id,
            charId: selectedCharId,
            content: JSON.stringify(cardData),
            messageType: 'score_card',
            metadata: {
                scoreCard: cardData,
                source: 'heart_letter',
                proactiveHeartLetter: true,
            },
            notificationPreview: `${char.name} 发来了一封心契留信`,
            deliveryPolicy: 'quiet_today',
            createdAt,
            dueAt,
        });
        return { id, dueAt, status: 'scheduled' as const };
    };

    // ============================================================
    // API 调用 2：相性挑战回应与侧写
    // ============================================================
    const generateReview = async () => {
        if (!char || !quizData || !apiConfig || reviewRequestRef.current) return;
        reviewRequestRef.current = true;
        setErrorMsg('');
        setPhase('loading_review');
        try {
            const baseContext = ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(char, userProfile, true);
            const availableEmotions = getAvailableEmotions(char);

            const answerSummary = quizData.questions.map((q, i) => {
                const ua = userAnswers[i];
                const labels = ['A', 'B', 'C', 'D'];
                return [
                    `第${i + 1}题: ${q.question}`,
                    q.insightTarget ? `  侧写目标: ${q.insightTarget}` : '',
                    q.options.map((o, oi) => `  ${labels[oi]}. ${o}`).join('\n'),
                    q.optionProfiles?.length ? `  选项侧写: ${q.optionProfiles.map((p, oi) => `${labels[oi]}=${p}`).join('；')}` : '',
                    `  你预设的最相性答案: ${labels[q.correctIndex]}. ${q.options[q.correctIndex]}`,
                    `  ${userProfile.name}选择: ${ua >= 0 ? `${labels[ua]}. ${q.options[ua]}` : '未作答'}`,
                    `  是否撞上相性点: ${ua === q.correctIndex ? '是' : '否'}`,
                ].filter(Boolean).join('\n');
            }).join('\n\n');

            const prompt = `### 心契回应环节

${userProfile.name} 完成了这轮心契，以下是选择情况：

${answerSummary}

### 规则提醒
- 每种答案都有效，这轮体验的价值在于看见彼此偏好的相遇与差异
- finalScore 表示“合拍值”，范围 0-${QUIZ_TOTAL}；撞上你最心动答案越多，数值越高
- 没撞上答案代表答案不同。先判断角色本人对这件具体小事的真实态度，再自然回应
- 挑战结束后会在稍晚的安静时段把信发进聊天；当前页面保留“已经记下”的余韵，信件正文在聊天中出现

### 人设优先级（最高）
- 以角色卡、既有记忆、当前关系阶段和角色一贯的表达方式决定每一题的态度与措辞。
- 温柔、平静、好奇、沉默、不在意、嫌弃、嘴硬、争抢和轻微冲突都属于可用反应；具体选择来自人设与题境。
- 七条回应可以同调，也可以变化；所有起伏都从角色与题境自然生长。

### 你的任务
**按照第1题到第${QUIZ_TOTAL}题的顺序**逐题回应，并提炼侧写线索。注意：
- reviews 数组与题目逐项一一对应（第1题对应 questionIndex:0，第2题对应 questionIndex:1，以此类推）
- 每条 dialogue 围绕当前题目的具体内容回应，并自然带出题目关键词
- isCorrect 只记录“是否撞上你最心动/最相性的答案”
- 评语像两个人玩完一题后的即时反应：先写这个角色对此事最自然的态度，再组织措辞。可以赞同、疑惑、无所谓、逗弄、认真、嫌弃或反驳，始终保持人物之间的真实对话感
- 每条 dialogue 控制在 12-45 字，聚焦角色自己的反应与当前题境
- finalDialogue 是心契结束时这个角色最自然的当面一句话，可以提合拍值，以角色当下真实的关系温度收束
- profileInsights 从 ${userProfile.name} 的选择中提炼 3-5 条低置信侧写线索，每条 18-45 字，使用“可能/似乎/更倾向于”等开放措辞
- profileInsights 聚焦亲密互动方式、浪漫口味、被安抚方式、幽默边界、安全感来源与陪伴节奏
- profileSummary 用 60-100 字形成低置信后台观察；dialogue 与 finalDialogue 始终只呈现角色当面的自然反应
- **emotion 从这些标签中选择**: ${availableEmotions.join(', ')}

仅输出以下 JSON 对象：
{
  "reviews": [
    {
      "questionIndex": 0,
      "isCorrect": true,
      "emotion": "happy",
      "dialogue": "你对这道题的回应（1-2句，严格符合人设、关系阶段和这一题的具体情境）"
    }
  ],
  "finalScore": 5,
  "finalEmotion": "happy",
  "finalDialogue": "结束时当面对 ${userProfile.name} 说的一句话。选择角色此刻最自然的语气，以两个人当下的关系收束。",
  "letterTitle": "一封适合显示在聊天卡片封面上的信件标题（14字以内，像真正会寄出的信）",
  "letterBody": "写给 ${userProfile.name} 的心契留信。基于这轮选择里体现出的了解、误会、心动点和你们的关系写 250-450 字，采用连贯的书信表达，语气延续角色一贯说话方式，保留这一轮整体的关系余味。",
  "profileSummary": "这次心契折射出的用户侧写摘要（60-100字，低置信、克制、可供后续互动参考）",
  "profileInsights": [
    "用户似乎更吃……这类互动",
    "用户在被安抚时可能更需要……"
  ]
}`;

            const data = await safeFetchJson(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                aetherHandledFailure: true,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [
                        { role: 'system', content: baseContext },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.82,
                }),
            }, 1);
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error('AI 返回为空');

            const parsed = extractJSON(content) as WhiteDayReviewData;
            if (!parsed?.reviews) throw new Error('相性回应解析失败');

            const letterDelivery = await scheduleQuizCardForChat(parsed, quizData.questions, userAnswers);

            setReviewData(parsed);
            setReviewLineIndex(0);
            setErrorMsg('');
            setPhase('reviewing');
            // 保存挑战数据到角色记录，并将用户侧写作为低置信记忆线索沉淀
            if (char) {
                const prev = char.specialMomentRecords || {};
                const insightLines = [
                    ...(parsed.profileSummary ? [parsed.profileSummary] : []),
                    ...((parsed.profileInsights || []).filter(Boolean)),
                ];
                const profileMemory: MemoryFragment | null = insightLines.length > 0 ? {
                    id: `mem-whiteday-affinity-${Date.now()}`,
                    date: new Date().toLocaleDateString(),
                    summary: `[心契侧写] ${insightLines.join('；')}`,
                    mood: 'affinity_challenge',
                } : null;
                const nextMemories = profileMemory
                    ? [...(char.memories || []), profileMemory]
                    : char.memories;
                updateCharacter(char.id, {
                    ...(profileMemory ? { memories: nextMemories } : {}),
                    specialMomentRecords: {
                        ...prev,
                        [WHITEDAY_RECORD_KEY]: {
                            content: JSON.stringify({
                                score: parsed.finalScore,
                                quizData: quizData,
                                userAnswers: userAnswers,
                                reviewData: parsed,
                                letterDelivery,
                            }),
                            timestamp: Date.now(),
                            source: 'generated',
                        },
                    },
                });
            }
            // 标记为已完成，避免重新打开 App 时再次弹出活动弹窗
            try { localStorage.setItem(WHITEDAY_COMPLETED_KEY, Date.now().toString()); } catch { /* */ }
        } catch (e: any) {
            console.info('[Heart] review request paused:', e);
            setErrorMsg(e.message === 'Failed to fetch' ? '连接刚刚断了一下，请重试' : (e.message || '相性回应失败，请重试'));
            setPhase('quiz');
        } finally {
            reviewRequestRef.current = false;
        }
    };

    // ============================================================
    // 相性回应推进
    // ============================================================
    const handleReviewClick = () => {
        if (isAnimating) {
            if (animTimerRef.current) clearTimeout(animTimerRef.current);
            setDisplayedText(allReviewLines[reviewLineIndex]?.dialogue || '');
            setIsAnimating(false);
            return;
        }
        const nextIndex = reviewLineIndex + 1;
        if (nextIndex < allReviewLines.length) {
            setReviewLineIndex(nextIndex);
        } else {
            // 心契结束：信件已记入静默投递队列，停在轻量结果页。
            setPhase('letter_sent');
        }
    };

    // ============================================================
    // RENDER
    // ============================================================

    // 角色选择
    if (phase === 'select') {
        return (
            <div className="fixed inset-0 z-[9997] bg-gradient-to-b from-amber-50 via-white to-orange-50 flex flex-col animate-fade-in">
                <HeartSessionHeader title="心契" onBack={onClose} />
                <div className="flex-1 overflow-y-auto p-6">
                    <p className="text-sm text-amber-600 text-center mb-6">选择一个人，一起走过七轮小小选择</p>
                    <div className="grid grid-cols-3 gap-3">
                        {characters.map(c => (
                            <button
                                key={c.id}
                                onClick={() => { setSelectedCharId(c.id); setPhase('loading_quiz'); }}
                                className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-amber-100 shadow-sm active:scale-95 transition-transform"
                            >
                                <img src={c.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-amber-200" alt={c.name} />
                                <span className="text-xs font-bold text-slate-700 truncate w-full text-center">{c.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // 加载中
    if (phase === 'loading_quiz' || phase === 'loading_review') {
        const loadingText =
            phase === 'loading_quiz' ? '正在摆好这次心契…' : 'TA 正在慢慢看你的选择…';
        return (
            <div className="fixed inset-0 z-[9997] flex flex-col bg-gradient-to-b from-amber-50 to-white">
                <HeartSessionHeader title="心契" onBack={onClose} />
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16">
                    {!errorMsg && <div className="h-11 w-11 animate-spin rounded-full border-4 border-amber-300 border-t-amber-600" />}
                    <p className={`text-sm ${errorMsg ? 'text-rose-500' : 'text-amber-700'}`}>{errorMsg || loadingText}</p>
                    {errorMsg && phase === 'loading_quiz' && (
                        <button
                            type="button"
                            onClick={() => {
                                setErrorMsg('');
                                if (!selectedCharId || quizRequestRef.current) return;
                                quizRequestRef.current = selectedCharId;
                                void generateQuiz(selectedCharId).finally(() => {
                                    if (quizRequestRef.current === selectedCharId) quizRequestRef.current = null;
                                });
                            }}
                            className="rounded-full bg-amber-500 px-6 py-2 text-sm font-bold text-white active:scale-95"
                        >
                            再试一次
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // 答题界面
    if (phase === 'quiz') {
        const allAnswered = userAnswers.length > 0 && userAnswers.every(a => a >= 0);
        return (
            <div className="fixed inset-0 z-[9997] bg-gradient-to-b from-amber-50 via-white to-orange-50 flex flex-col animate-fade-in">
                <HeartSessionHeader title="心契" onBack={onClose} />

                <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
                    {/* 角色开场白 */}
                    {quizData?.intro && (
                        <div className="mb-3 flex items-start gap-3 bg-amber-50 rounded-2xl p-3 border border-amber-100">
                            {char && (
                                <img src={char.avatar} className="w-9 h-9 rounded-full shrink-0 object-cover border-2 border-amber-200" alt="" />
                            )}
                            <p className="text-[13px] text-amber-900 leading-relaxed">{quizData.intro}</p>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-center text-[11px] text-rose-500">
                            {errorMsg}
                        </div>
                    )}

                    {quizData?.questions.map((q, qi) => (
                        <div key={qi} className="mb-4 rounded-[22px] border border-amber-100 bg-white/80 p-3 shadow-sm">
                            <p className="mb-2 text-[13px] font-bold leading-5 text-slate-700">
                                <span className="text-amber-500">{String(qi + 1).padStart(2, '0')} · </span>{q.question}
                            </p>
                            <div className="flex flex-col gap-2">
                                {q.options.map((opt, oi) => (
                                    <button
                                        key={oi}
                                        onClick={() => {
                                            const next = [...userAnswers];
                                            next[qi] = oi;
                                            setUserAnswers(next);
                                        }}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] border transition-all ${
                                            userAnswers[qi] === oi
                                                ? 'border-amber-400 bg-amber-50 text-amber-800 font-bold'
                                                : 'border-slate-100 bg-white text-slate-600'
                                        }`}
                                    >
                                        <span className="text-amber-400 font-bold mr-2">{['A', 'B', 'C', 'D'][oi]}.</span>
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 bg-white/90 backdrop-blur-sm border-t border-amber-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
                    <button
                        onClick={generateReview}
                        disabled={!allAnswered}
                        className={`w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all ${
                            allAnswered ? 'bg-amber-500 shadow-md active:scale-95' : 'bg-amber-200 cursor-not-allowed'
                        }`}
                    >
                        {allAnswered
                            ? '让 TA 说说看 →'
                            : `还有 ${userAnswers.filter(a => a < 0).length} 轮没选`}
                    </button>
                </div>
            </div>
        );
    }

    // 相性回应界面
    if (phase === 'reviewing') {
        if (!reviewData || allReviewLines.length === 0) return null;
        const line = allReviewLines[reviewLineIndex];
        const progress = Math.min(reviewLineIndex, reviewData.reviews.length);
        const isResultLine = line?.isFinal;
        const questionText = !isResultLine && quizData && line
            ? quizData.questions[line.questionIndex]?.question
            : undefined;
        return (
            <div
                className="fixed inset-0 z-[9997] bg-gradient-to-b from-amber-50 via-white to-rose-50 flex flex-col animate-fade-in"
                onClick={handleReviewClick}
            >
                <HeartSessionHeader title="TA 的回音" onBack={onClose} />

                <div className="flex-1 overflow-y-auto px-4 pb-8 pt-7">
                    <div className="mx-auto max-w-sm rounded-[28px] border border-amber-100 bg-white/90 p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-3">
                            {char && <img src={char.avatar} className="h-11 w-11 rounded-2xl object-cover ring-2 ring-amber-100" alt="" />}
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400">
                                    {isResultLine ? '最后一句' : `第 ${reviewLineIndex + 1} 轮`}
                                </div>
                                <div className="truncate text-sm font-black text-slate-800">{char?.name || 'TA'}</div>
                            </div>
                            {!isResultLine && line && (
                                <div className={`flex h-9 w-9 items-center justify-center rounded-2xl text-xl font-black ${line.isCorrect ? 'bg-rose-50 text-rose-400' : 'bg-amber-50 text-amber-400'}`}>
                                    {line.isCorrect ? '♥' : '✦'}
                                </div>
                            )}
                        </div>

                        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-amber-50">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-300 transition-all"
                                style={{ width: `${Math.max(8, Math.min(100, (progress / Math.max(1, reviewData.reviews.length)) * 100))}%` }}
                            />
                        </div>

                        {questionText && (
                            <div className="mb-3 rounded-2xl bg-amber-50/80 px-3 py-2.5">
                                <p className="text-[12px] font-bold leading-5 text-amber-950">{questionText}</p>
                            </div>
                        )}

                        <div className="rounded-[22px] bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                            {displayedText}
                            {isAnimating && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle bg-slate-400" />}
                        </div>

                        <div className="mt-4 text-center text-[10px] font-bold text-slate-300">
                            {isAnimating ? '点一下显示完整回应' : '点一下继续'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 正式结束点：只告诉用户“已经记下”，不在游戏页提前展示信件。
    if (phase === 'letter_sent') {
        return (
            <div className="fixed inset-0 z-[9997] flex flex-col bg-gradient-to-b from-amber-50 via-white to-rose-50 animate-fade-in">
                <HeartSessionHeader title="心契已记下" onBack={onClose} />
                <div className="flex flex-1 items-start justify-center px-5 pt-10">
                    <div className="w-full max-w-sm rounded-[30px] border border-amber-100 bg-white/90 px-6 py-7 text-center shadow-sm">
                        {char && <img src={char.avatar} className="mx-auto h-14 w-14 rounded-[20px] object-cover ring-2 ring-amber-100" alt={char.name} />}
                        <h2 className="mt-4 text-lg font-black text-slate-800">这一轮，先收到这里</h2>
                        <p className="mt-2 text-[13px] leading-6 text-slate-500">
                            {char?.name || 'TA'} 把那封信记下了。等今天安静一点，它会自己出现在对话里。
                        </p>
                        <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-500">
                            七次选择 · 合拍值 {reviewData?.finalScore ?? 0}/{QUIZ_TOTAL}
                        </div>
                    </div>
                </div>
                <div className="shrink-0 border-t border-amber-100 bg-white/85 px-4 pt-3 backdrop-blur-sm" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="mx-auto block w-full max-w-sm rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-bold text-white shadow-md active:scale-95"
                    >
                        回到特别时光
                    </button>
                </div>
            </div>
        );
    }

    // 旧流程兜底：现在相性挑战没有失败门槛，保留这个界面仅用于兼容异常状态
    if (phase === 'retry') {
        const score = reviewData?.finalScore ?? 0;
        return (
            <div className="fixed inset-0 z-[9997] bg-gradient-to-b from-amber-50 to-white flex flex-col items-center justify-center p-6 animate-fade-in">
                <div className="text-5xl mb-4">💌</div>
                <h2 className="text-xl font-bold text-amber-800 mb-2">合拍值 {score}/{QUIZ_TOTAL}</h2>
                <p className="text-sm text-amber-600 text-center mb-8">
                    没有什么失败啦，只是这一轮发现了你们奇怪又可爱的不同步。
                </p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                        onClick={() => {
                            setUserAnswers(new Array(quizData!.questions.length).fill(-1));
                            setReviewData(null);
                            setReviewLineIndex(0);
                            setPhase('quiz');
                        }}
                        className="w-full py-3.5 rounded-2xl bg-amber-500 text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
                    >
                        再来一轮
                    </button>
                    <button onClick={() => setPhase('letter_sent')} className="w-full py-2.5 rounded-2xl text-amber-500 text-sm border border-amber-200 bg-white">
                        先收好
                    </button>
                </div>
            </div>
        );
    }

    // 重新进入时只显示留存状态；信件正文只在聊天里出现。
    if (phase === 'view_result') {
        const record = char?.specialMomentRecords?.[WHITEDAY_RECORD_KEY];
        let savedData: any = {};
        try { savedData = record?.content ? JSON.parse(record.content) : {}; } catch { /* */ }
        const savedReviewData: WhiteDayReviewData | null = savedData.reviewData || null;
        const savedScore: number = savedData.score ?? savedReviewData?.finalScore ?? 0;

        return (
            <div className="fixed inset-0 z-[9997] flex flex-col bg-gradient-to-b from-amber-50 via-white to-orange-50 animate-fade-in">
                <HeartSessionHeader title="心契留存" onBack={onClose} />
                <div className="flex flex-1 items-start justify-center px-5 pt-10">
                    <div className="w-full max-w-sm rounded-[30px] border border-amber-100 bg-white/90 px-6 py-7 text-center shadow-sm">
                        {char && <img src={char.avatar} className="mx-auto h-14 w-14 rounded-[20px] object-cover ring-2 ring-amber-100" alt={char.name} />}
                        <h2 className="mt-4 text-lg font-black text-slate-800">这轮心契已经留存</h2>
                        <p className="mt-2 text-[13px] leading-6 text-slate-500">
                            信件只会出现在聊天里，这里不提前剧透。
                        </p>
                        <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-500">
                            七次选择 · 合拍值 {savedScore}/{QUIZ_TOTAL}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setUserAnswers([]);
                                setQuizData(null);
                                setReviewData(null);
                                setReviewLineIndex(0);
                                setErrorMsg('');
                                if (char) {
                                    const prev = char.specialMomentRecords || {};
                                    const updated = { ...prev };
                                    delete updated[WHITEDAY_RECORD_KEY];
                                    updateCharacter(char.id, { specialMomentRecords: updated });
                                }
                                try { localStorage.removeItem(WHITEDAY_COMPLETED_KEY); } catch { /* */ }
                                setPhase('loading_quiz');
                            }}
                            className="mt-5 w-full rounded-2xl border border-amber-200 bg-white py-3 text-sm font-bold text-amber-600 active:scale-95"
                        >
                            再来一轮
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

// ============================================================
// Controller（状态机）
// ============================================================
interface WhiteDayControllerProps {
    onClose: () => void;
}

export const WhiteDayController: React.FC<WhiteDayControllerProps> = ({ onClose }) => {
    const { characters } = useOS();
    const [stage, setStage] = useState<'popup' | 'api' | 'session'>('popup');

    const targetChar = characters[0];
    const targetId = targetChar?.id || '';

    const handleDismiss = () => {
        try { localStorage.setItem(WHITEDAY_DISMISSED_KEY, Date.now().toString()); } catch { /* */ }
        onClose();
    };

    if (stage === 'popup') {
        return (
            <WhiteDayPopup
                onView={() => setStage('session')}
                onDismiss={handleDismiss}
                onCheckApi={() => setStage('api')}
                targetName={targetChar?.name}
            />
        );
    }

    if (stage === 'api') {
        return (
            <WhiteDayApiSetup
                onDone={() => setStage('session')}
                onBack={() => setStage('popup')}
            />
        );
    }

    // 从弹窗进入时，直接给默认角色的 charId，跳过角色选择
    return <WhiteDaySession charId={targetId} onClose={onClose} occasion="white_day" />;
};
