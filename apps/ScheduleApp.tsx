import React, { useEffect, useMemo, useState } from 'react';
import { CaretLeft, CaretRight, PencilSimple, Sparkle, Trash } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { Anniversary } from '../types';
import Modal from '../components/os/Modal';
import AppHeader, { AppHeaderAddButton } from '../components/shell/AppHeader';
import { ContextBuilder } from '../utils/context';
import { safeResponseJson } from '../utils/safeApi';
import { SHELL_APP_HEADER_CONTENT_TOP } from '../components/shell/shellLayout';
import {
    buildAnniversaryThoughtPrompt,
    getDaysUntilTimebookDate,
    sortTimebookAnniversaries,
} from '../utils/timebook';
import { publicAsset } from '../utils/publicAssets';
import { filterCharactersForPersonaSurface, resolvePersonaRouteScope } from '../utils/personaRouteScope';

const TIMEBOOK_BACKGROUND = publicAsset('assets/aetheros/timebook-desk-bg.jpg');
const DAY_MS = 24 * 60 * 60 * 1000;

type TimebookMemoryRow = Anniversary & {
    isDefaultFirstMemory?: boolean;
};

type FirstContactSetting = {
    title: string;
    date: string;
    note: string;
    source: 'inferred' | 'manual' | 'ai_assisted';
    updatedAt?: number;
};

const toLocalDateInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const BUILT_IN_FIRST_MEMORY_COPY: Record<string, { title: string; note: string }> = {
    沈星回: {
        title: '和沈星回相识的那天',
        note: '这一页先记下开始。后来那些安静经过的夜晚、任务间隙和没说出口的惦念，都可以慢慢写到这里。',
    },
    黎深: {
        title: '和黎深相识的那天',
        note: '这一页先记下开始。后来那些被认真提醒过的休息、错过又补上的问候，都可以慢慢写到这里。',
    },
    祁煜: {
        title: '和祁煜相识的那天',
        note: '这一页先记下开始。后来那些颜色、潮声、玩笑和忽然被他记住的小事，都可以慢慢写到这里。',
    },
    秦彻: {
        title: '和秦彻相识的那天',
        note: '这一页先记下开始。后来那些不动声色的靠近、危险边缘的照看，都可以慢慢写到这里。',
    },
    夏以昼: {
        title: '和夏以昼相识的那天',
        note: '这一页先记下开始。后来那些回家、返航、等你抬头看见他的时刻，都可以慢慢写到这里。',
    },
};

const getFirstMemoryCopy = (charName?: string) => (
    charName && BUILT_IN_FIRST_MEMORY_COPY[charName]
        ? BUILT_IN_FIRST_MEMORY_COPY[charName]
        : {
            title: charName ? `和${charName}相识的那天` : '相识的那天',
            note: '这一页先记下开始。后来那些很小、很日常、却被认真放在心上的片刻，都会慢慢写到这里。',
        }
);

const getFirstContactAssetId = (charId: string) => `timebook_first_contact_${charId}`;

const parseLocalDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const date = new Date(`${dateStr}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateLabel = (dateStr: string): string => {
    const date = parseLocalDate(dateStr);
    if (!date) return dateStr;
    const year = date.getFullYear();
    const todayYear = new Date().getFullYear();
    const prefix = year === todayYear ? '' : `${year}年`;
    return `${prefix}${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatMemoryDistance = (dateStr: string): string => {
    const daysDiff = getDaysUntilTimebookDate(dateStr);
    if (daysDiff > 0) return `还有${daysDiff}天`;
    if (daysDiff === 0) return '今天';
    const daysAgo = Math.abs(daysDiff);
    if (daysAgo >= 365) return `${Math.floor(daysAgo / 365)}年前`;
    return `${daysAgo}天前`;
};

const getTogetherDays = (startDate: string): number => {
    const startTime = parseLocalDate(startDate)?.getTime() || new Date().setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((today.getTime() - startTime) / DAY_MS) + 1);
};

const ScheduleApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, apiConfig, addToast, userProfile } = useOS();
    const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
    const [firstContact, setFirstContact] = useState<FirstContactSetting>(() => ({
        ...getFirstMemoryCopy(),
        date: toLocalDateInput(new Date()),
        source: 'inferred',
    }));
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const [showAnniModal, setShowAnniModal] = useState(false);
    const [showFirstContactModal, setShowFirstContactModal] = useState(false);
    const [editingMemory, setEditingMemory] = useState<Anniversary | null>(null);
    const [isGeneratingFirstContactNote, setIsGeneratingFirstContactNote] = useState(false);
    const [draftFirstContactTitle, setDraftFirstContactTitle] = useState('');
    const [draftFirstContactDate, setDraftFirstContactDate] = useState('');
    const [draftFirstContactNote, setDraftFirstContactNote] = useState('');
    const [draftMemoryTitle, setDraftMemoryTitle] = useState('');
    const [draftMemoryDate, setDraftMemoryDate] = useState('');
    const [draftMemoryThought, setDraftMemoryThought] = useState('');
    const [newAnniTitle, setNewAnniTitle] = useState('');
    const [newAnniDate, setNewAnniDate] = useState('');
    const [newAnniChar, setNewAnniChar] = useState<string>(activeCharacterId || '');

    const personaScope = useMemo(() => (
        resolvePersonaRouteScope(userProfile, characters, activeCharacterId)
    ), [userProfile, characters, activeCharacterId]);
    const timebookCharacters = useMemo(() => (
        filterCharactersForPersonaSurface(characters, personaScope, { surface: 'timebook' })
    ), [characters, personaScope]);

    const activeCharacter = useMemo(
        () => timebookCharacters.find(c => c.id === activeCharacterId) || timebookCharacters[0],
        [activeCharacterId, timebookCharacters]
    );
    const activeTimebookCharId = activeCharacter?.id || '';

    useEffect(() => {
        loadData();
    }, [activeTimebookCharId]);

    useEffect(() => {
        if (activeTimebookCharId) {
            setNewAnniChar(activeTimebookCharId);
        }
    }, [activeTimebookCharId]);

    const loadData = async () => {
        const savedAnniversaries = await DB.getAllAnniversaries();
        setAnniversaries(sortTimebookAnniversaries(savedAnniversaries));

        if (!activeTimebookCharId) {
            const fallbackCopy = getFirstMemoryCopy(activeCharacter?.name);
            setFirstContact({ ...fallbackCopy, date: toLocalDateInput(new Date()), source: 'inferred' });
            return;
        }

        const charAnniversaries = savedAnniversaries.filter(memory => memory.charId === activeTimebookCharId);
        const earliestAnniversary = sortTimebookAnniversaries(charAnniversaries)[0];
        const messages = await DB.getMessagesByCharId(activeTimebookCharId);
        const firstMessage = messages
            .filter(m => typeof m.timestamp === 'number')
            .sort((a, b) => a.timestamp - b.timestamp)[0];
        const inferredDate = earliestAnniversary?.date
            || (firstMessage ? toLocalDateInput(new Date(firstMessage.timestamp)) : toLocalDateInput(new Date()));
        const copy = getFirstMemoryCopy(activeCharacter?.name);
        const savedSetting = await DB.getAssetRaw(getFirstContactAssetId(activeTimebookCharId)) as Partial<FirstContactSetting> | null;
        const nextFirstContact: FirstContactSetting = {
            title: savedSetting?.title || copy.title,
            date: savedSetting?.date || inferredDate,
            note: savedSetting?.note || copy.note,
            source: savedSetting?.source || 'inferred',
            updatedAt: savedSetting?.updatedAt,
        };
        setFirstContact(nextFirstContact);
        setDraftFirstContactTitle(nextFirstContact.title);
        setDraftFirstContactDate(nextFirstContact.date);
        setDraftFirstContactNote(nextFirstContact.note);
    };

    const characterMemories = useMemo(() => (
        activeTimebookCharId
            ? anniversaries.filter(memory => memory.charId === activeTimebookCharId)
            : anniversaries
    ), [activeTimebookCharId, anniversaries]);

    const sortedMemories = useMemo<TimebookMemoryRow[]>(() => {
        const sorted = sortTimebookAnniversaries(characterMemories).reverse();
        const firstRow: TimebookMemoryRow = {
            id: `default-first-memory-${activeTimebookCharId || 'character'}`,
            title: firstContact.title,
            date: firstContact.date,
            charId: activeTimebookCharId,
            aiThought: firstContact.note,
            isDefaultFirstMemory: true,
        };
        return [firstRow, ...sorted];
    }, [activeTimebookCharId, characterMemories, firstContact]);

    const togetherDays = useMemo(
        () => getTogetherDays(firstContact.date),
        [firstContact.date]
    );

    const generateAnniversaryThought = async (anni: Anniversary) => {
        const char = timebookCharacters.find(c => c.id === anni.charId);
        if (!char || !apiConfig.apiKey || anni.aiThought) return;

        const baseContext = ContextBuilder.buildCoreContext(char, userProfile);
        const messages = [
            { role: 'system', content: baseContext },
            { role: 'user', content: buildAnniversaryThoughtPrompt(anni) },
        ];

        try {
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages,
                    temperature: 0.75,
                    max_tokens: 360,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error ${response.status}: ${errorText.slice(0, 80)}`);
            }

            const data = await safeResponseJson(response);
            const text = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');

            if (text) {
                const updatedAnni = { ...anni, aiThought: text, lastThoughtGeneratedAt: Date.now() };
                await DB.saveAnniversary(updatedAnni);
                setAnniversaries(prev => prev.map(a => a.id === anni.id ? updatedAnni : a));
            }
        } catch (error) {
            console.warn('Timebook thought generation failed:', error);
        }
    };

    const handleToggleMemory = (anni: TimebookMemoryRow) => {
        const shouldOpen = expandedId !== anni.id;
        setExpandedId(shouldOpen ? anni.id : null);
        if (shouldOpen && !anni.aiThought && !anni.isDefaultFirstMemory) {
            generateAnniversaryThought(anni);
        }
    };

    const handleAddAnni = async () => {
        if (!newAnniTitle.trim() || !newAnniDate) return;

        const selectedCharId = timebookCharacters.some(char => char.id === newAnniChar)
            ? newAnniChar
            : activeCharacter?.id;
        if (!selectedCharId) {
            addToast('先在通讯录里把角色链接到当前面具', 'info');
            return;
        }
        const anni: Anniversary = {
            id: `anni-${Date.now()}`,
            title: newAnniTitle.trim(),
            date: newAnniDate,
            charId: selectedCharId,
        };

        await DB.saveAnniversary(anni);
        setAnniversaries(prev => sortTimebookAnniversaries([...prev, anni]));
        setExpandedId(anni.id);
        setShowAnniModal(false);
        setNewAnniTitle('');
        setNewAnniDate('');
        addToast('这一页已经夹进时光簿。', 'success');
    };

    const openFirstContactEditor = () => {
        setDraftFirstContactTitle(firstContact.title);
        setDraftFirstContactDate(firstContact.date);
        setDraftFirstContactNote(firstContact.note);
        setShowFirstContactModal(true);
    };

    const handleSaveFirstContact = async (source: FirstContactSetting['source'] = 'manual') => {
        if (!activeTimebookCharId || !draftFirstContactTitle.trim() || !draftFirstContactDate) return;

        const nextSetting: FirstContactSetting = {
            title: draftFirstContactTitle.trim(),
            date: draftFirstContactDate,
            note: draftFirstContactNote.trim() || getFirstMemoryCopy(activeCharacter?.name).note,
            source,
            updatedAt: Date.now(),
        };

        await DB.saveAssetRaw(getFirstContactAssetId(activeTimebookCharId), nextSetting);
        setFirstContact(nextSetting);
        setShowFirstContactModal(false);
        addToast('初识这一页已经改好了。', 'success');
    };

    const handleGenerateFirstContactNote = async () => {
        if (!activeCharacter || !apiConfig.apiKey || isGeneratingFirstContactNote) return;

        setIsGeneratingFirstContactNote(true);
        try {
            const memoryHints = sortTimebookAnniversaries(characterMemories)
                .slice(0, 10)
                .map(memory => `- ${memory.date}: ${memory.title}${memory.aiThought ? `｜${memory.aiThought}` : ''}`)
                .join('\n') || '- 暂时没有导入的旧纪念日。';
            const baseContext = ContextBuilder.buildCoreContext(activeCharacter, userProfile);
            const messages = [
                { role: 'system', content: baseContext },
                {
                    role: 'user',
                    content: `### 场景：时光簿初识页\n角色: ${activeCharacter.name}\n初识日期: ${draftFirstContactDate || firstContact.date}\n标题: ${draftFirstContactTitle || firstContact.title}\n已导入的旧回忆:\n${memoryHints}\n\n请根据你的人设和已有回忆，为“初识这一页”补一段很短的页边注。不要替用户决定感受，不要写成总结报告。\n输出要求:\n- 2 到 3 个短句，80 字以内。\n- 只输出正文。\n- 使用用户常用语言。`,
                },
            ];

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages,
                    temperature: 0.72,
                    max_tokens: 260,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error ${response.status}: ${errorText.slice(0, 80)}`);
            }

            const data = await safeResponseJson(response);
            const text = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
            if (text) {
                setDraftFirstContactNote(text);
            }
        } catch (error) {
            console.warn('First contact note generation failed:', error);
            addToast('暂时没补写成功，可以先手动写。', 'error');
        } finally {
            setIsGeneratingFirstContactNote(false);
        }
    };

    const handleDeleteAnni = async (id: string) => {
        await DB.deleteAnniversary(id);
        setAnniversaries(prev => prev.filter(a => a.id !== id));
        if (expandedId === id) setExpandedId(null);
    };

    const openMemoryEditor = (memory: Anniversary) => {
        setEditingMemory(memory);
        setDraftMemoryTitle(memory.title);
        setDraftMemoryDate(memory.date);
        setDraftMemoryThought(memory.aiThought || '');
    };

    const handleSaveMemoryEdit = async () => {
        if (!editingMemory || !draftMemoryTitle.trim() || !draftMemoryDate) return;

        const updated: Anniversary = {
            ...editingMemory,
            title: draftMemoryTitle.trim(),
            date: draftMemoryDate,
            aiThought: draftMemoryThought.trim() || undefined,
            lastThoughtGeneratedAt: draftMemoryThought.trim()
                ? (editingMemory.lastThoughtGeneratedAt || Date.now())
                : undefined,
        };

        await DB.saveAnniversary(updated);
        setAnniversaries(prev => sortTimebookAnniversaries(prev.map(item => item.id === updated.id ? updated : item)));
        setEditingMemory(null);
        addToast('这一页已经改好了。', 'success');
    };

    if (!activeCharacter) {
        return (
            <div className="flex h-full w-full flex-col bg-[#fff8ef]">
                <AppHeader title="时光簿" onBack={closeApp} center />
                <div className="flex flex-1 items-center justify-center px-8 text-center text-sm leading-7 text-[#9b8378]">
                    先在通讯录里把角色链接到当前面具，再一起留下时间页。
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#d4ad7a] text-[#4b3d35]">
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: `url(${TIMEBOOK_BACKGROUND})`,
                    backgroundPosition: '72% 46%',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '101% auto',
                }}
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(80,45,22,0.10))]" />

            <button
                onClick={closeApp}
                className="absolute left-5 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/30 text-[#5d544b] shadow-sm backdrop-blur-md transition active:scale-95"
                style={{ top: SHELL_APP_HEADER_CONTENT_TOP }}
                aria-label="返回"
            >
                <CaretLeft size={23} weight="bold" />
            </button>

            <AppHeaderAddButton
                onClick={() => setShowAnniModal(true)}
                className="absolute right-5 z-30 bg-[#fff8ed]/62 text-[#9a6a53] shadow-sm backdrop-blur-md"
                style={{ top: SHELL_APP_HEADER_CONTENT_TOP }}
                title="添加回忆"
            />

            <main
                className="absolute z-20 overflow-hidden rounded-[18px] border border-white/28 bg-[#fffaf0]/26 shadow-[0_10px_22px_rgba(74,48,28,0.055)] backdrop-blur-[0.75px]"
                style={{
                    left: '16.4%',
                    right: '11.7%',
                    top: '21.3%',
                    bottom: '20.5%',
                }}
            >
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.065]"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(184,151,121,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(184,151,121,0.42) 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />
                <section className="relative z-10 flex h-full flex-col px-5 pb-5 pt-5">
                    <header className="flex shrink-0 items-baseline gap-2 pb-3">
                        <span className="text-[13px] font-semibold tracking-[0.2em] text-[#8b6d62]">相伴</span>
                        <span className="font-serif text-[31px] font-semibold leading-none text-[#a75f56]">{togetherDays}</span>
                        <span className="text-[16px] font-semibold text-[#584940]">天</span>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto pr-1 no-scrollbar">
                        <div className="space-y-1 pb-4">
                            {sortedMemories.map(memory => {
                                const expanded = expandedId === memory.id;
                                const character = timebookCharacters.find(c => c.id === memory.charId);
                                const writerName = character?.name || '他';

                                return (
                                    <article key={memory.id} className="border-b border-[#e5d6c8]/70 last:border-b-0">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleMemory(memory)}
                                            className="grid w-full grid-cols-[11px_1fr_19px] gap-3 py-3 text-left transition active:scale-[0.99]"
                                        >
                                            <span className="mt-[8px] h-2 w-2 rounded-full bg-[#d46d74] shadow-[0_0_0_4px_rgba(212,109,116,0.12)]" />
                                            <span className="min-w-0">
                                                <span className="block text-[11px] font-medium leading-none text-[#a58d82]">
                                                    {formatDateLabel(memory.date)} · {formatMemoryDistance(memory.date)}
                                                </span>
                                                <span className="mt-1 block truncate text-[15px] font-semibold leading-6 text-[#514640]">
                                                    {memory.title}
                                                </span>
                                            </span>
                                            <CaretRight
                                                size={17}
                                                weight="bold"
                                                className={`mt-3 text-[#cf6b72] transition-transform ${expanded ? 'rotate-90' : ''}`}
                                            />
                                        </button>

                                        {expanded && (
                                            <div className="ml-5 -mt-1 mb-3 rounded-[18px] border border-white/60 bg-white/48 px-3.5 py-3 shadow-sm">
                                                <p className="whitespace-pre-wrap text-[12px] leading-6 text-[#6d5d54]">
                                                    {memory.aiThought || `${writerName}还没有把这一页写完，但这一天已经先被他夹在纸里。`}
                                                </p>
                                                <div className="mt-2.5 flex items-center justify-between text-[10px] text-[#a68c7f]">
                                                    <span>{writerName}写下的页边注</span>
                                                    {memory.isDefaultFirstMemory ? (
                                                        <button
                                                            type="button"
                                                            onClick={openFirstContactEditor}
                                                            className="flex items-center gap-1 rounded-full px-2 py-1 text-[#a06b64] transition hover:bg-white/50 active:scale-95"
                                                        >
                                                            <PencilSimple size={12} weight="bold" />
                                                            修改初识
                                                        </button>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => openMemoryEditor(memory)}
                                                                className="flex items-center gap-1 rounded-full px-2 py-1 text-[#a06b64] transition hover:bg-white/50 active:scale-95"
                                                            >
                                                                <PencilSimple size={12} weight="bold" />
                                                                修改
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteAnni(memory.id)}
                                                                className="flex items-center gap-1 rounded-full px-2 py-1 text-[#a06b64] transition hover:bg-white/50 active:scale-95"
                                                            >
                                                                <Trash size={12} weight="bold" />
                                                                删除
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </main>

            <Modal
                isOpen={showFirstContactModal}
                title="初识这一页"
                onClose={() => setShowFirstContactModal(false)}
                footer={
                    <button
                        onClick={() => handleSaveFirstContact('manual')}
                        className="w-full rounded-2xl bg-[#9d675c] py-3 text-sm font-bold text-white shadow-lg shadow-[#9d675c]/20 transition active:scale-[0.98]"
                    >
                        保存初识
                    </button>
                }
            >
                <div className="space-y-4">
                    <input
                        value={draftFirstContactTitle}
                        onChange={e => setDraftFirstContactTitle(e.target.value)}
                        placeholder="比如：和他相识的那天"
                        className="w-full rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#594a42] outline-none placeholder:text-[#b9a49a] focus:border-[#cfa696]"
                    />
                    <input
                        type="date"
                        value={draftFirstContactDate}
                        onChange={e => setDraftFirstContactDate(e.target.value)}
                        className="w-full rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#594a42] outline-none focus:border-[#cfa696]"
                    />
                    <textarea
                        value={draftFirstContactNote}
                        onChange={e => setDraftFirstContactNote(e.target.value)}
                        placeholder="写给这一页的页边注"
                        className="h-28 w-full resize-none rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm leading-6 text-[#594a42] outline-none placeholder:text-[#b9a49a] focus:border-[#cfa696]"
                    />
                    <button
                        type="button"
                        onClick={handleGenerateFirstContactNote}
                        disabled={isGeneratingFirstContactNote || !apiConfig.apiKey}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#eadbcf] bg-white/70 py-3 text-[12px] font-bold text-[#8f675f] transition active:scale-[0.98] disabled:opacity-45"
                    >
                        <Sparkle size={15} weight="bold" />
                        {isGeneratingFirstContactNote ? '正在补写...' : '按已有回忆补一句'}
                    </button>
                </div>
            </Modal>

            <Modal
                isOpen={!!editingMemory}
                title="修改这一页"
                onClose={() => setEditingMemory(null)}
                footer={
                    <button
                        onClick={handleSaveMemoryEdit}
                        className="w-full rounded-2xl bg-[#9d675c] py-3 text-sm font-bold text-white shadow-lg shadow-[#9d675c]/20 transition active:scale-[0.98]"
                    >
                        保存修改
                    </button>
                }
            >
                <div className="space-y-4">
                    <input
                        value={draftMemoryTitle}
                        onChange={e => setDraftMemoryTitle(e.target.value)}
                        placeholder="这一页的标题"
                        className="w-full rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#594a42] outline-none placeholder:text-[#b9a49a] focus:border-[#cfa696]"
                    />
                    <input
                        type="date"
                        value={draftMemoryDate}
                        onChange={e => setDraftMemoryDate(e.target.value)}
                        className="w-full rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#594a42] outline-none focus:border-[#cfa696]"
                    />
                    <textarea
                        value={draftMemoryThought}
                        onChange={e => setDraftMemoryThought(e.target.value)}
                        placeholder="页边注可以留空，打开时再由他补写。"
                        className="h-28 w-full resize-none rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm leading-6 text-[#594a42] outline-none placeholder:text-[#b9a49a] focus:border-[#cfa696]"
                    />
                </div>
            </Modal>

            <Modal
                isOpen={showAnniModal}
                title="留下这一天"
                onClose={() => setShowAnniModal(false)}
                footer={
                    <button
                        onClick={handleAddAnni}
                        className="w-full rounded-2xl bg-[#9d675c] py-3 text-sm font-bold text-white shadow-lg shadow-[#9d675c]/20 transition active:scale-[0.98]"
                    >
                        写进时光簿
                    </button>
                }
            >
                <div className="space-y-4">
                    <input
                        value={newAnniTitle}
                        onChange={e => setNewAnniTitle(e.target.value)}
                        placeholder="比如：消失的蛋糕在哪里"
                        className="w-full rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#594a42] outline-none placeholder:text-[#b9a49a] focus:border-[#cfa696]"
                    />
                    <input
                        type="date"
                        value={newAnniDate}
                        onChange={e => setNewAnniDate(e.target.value)}
                        className="w-full rounded-2xl border border-[#eadbcf] bg-[#fffaf5] px-4 py-3 text-sm text-[#594a42] outline-none focus:border-[#cfa696]"
                    />

                    <div>
                        <label className="mb-2 block text-[12px] font-semibold text-[#9b8378]">由谁记下</label>
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                            {timebookCharacters.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setNewAnniChar(c.id)}
                                    className={`shrink-0 rounded-full border px-4 py-2 text-[12px] font-semibold transition active:scale-95 ${
                                        (newAnniChar || activeCharacterId) === c.id
                                            ? 'border-[#bd7d72] bg-[#fff2ea] text-[#8f5d55]'
                                            : 'border-[#eadbcf] bg-white/60 text-[#9b8378]'
                                    }`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ScheduleApp;
