
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NovelBook, NovelSegment, CharacterProfile, UserProfile } from '../../types';
import {
    NOVEL_THEMES, buildPlainNovelPrompt
} from '../../utils/novelUtils';
import Modal from '../os/Modal';
import ConfirmDialog from '../os/ConfirmDialog';
import { useOS } from '../../context/OSContext';
import { safeResponseJson } from '../../utils/safeApi';
import { strictRelationshipScopeForProfile } from '../../utils/messageContext';
import {
    prepareWorldbookRuntimeProjection,
    recordWorldbookRuntimeProjectionDelivery,
    type PreparedWorldbookRuntimeProjection,
} from '../../utils/worldbookRuntime';
import type { WorldbookContinuityRef, WorldbookProjectionConsumerRef } from '../../domain/worldbook';
import { preparePlainNovelCreativeScheme } from '../../utils/creativeSchemeRuntime';
import type { PreparedCreativeScheme } from '../../domain/creativeScheme';

interface NovelWriterProps {
    activeBook: NovelBook;
    updateNovel: (id: string, updates: Partial<NovelBook>) => Promise<void>;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: any;
    onBack: () => void;
    materialCharacters: CharacterProfile[];
    targetCharId: string | null;
    onMaterialCharacterChange: (id: string) => void;
    onOpenSettings: () => void;
    activeNarrativeScene?: {
        id: string;
        title: string;
        location?: string;
        objective?: string;
        constraints: string[];
    };
    activeNarrativeContinuity?: WorldbookContinuityRef;
    lockedNarrativeSceneIds?: readonly string[];
    onOpenStoryDesk?: () => void;
    onTypingStateChange?: (isTyping: boolean) => void;
}

const NovelWriter: React.FC<NovelWriterProps> = ({ 
    activeBook, updateNovel, characters, userProfile, 
    apiConfig, onBack,
    materialCharacters, targetCharId, onMaterialCharacterChange, onOpenSettings,
    activeNarrativeScene, lockedNarrativeSceneIds = [], onOpenStoryDesk, onTypingStateChange,
    activeNarrativeContinuity,
}) => {
    const { addToast, loadWorldbookWorkspace } = useOS();
    const activeTheme = useMemo(() => NOVEL_THEMES.find(t => t.id === activeBook.coverStyle) || NOVEL_THEMES[0], [activeBook.coverStyle]);
    // State
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [segments, setSegments] = useState<NovelSegment[]>(activeBook.segments);
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);

    // Modals & Dialogs
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSegment, setEditingSegment] = useState<NovelSegment | null>(null);
    const [editSegmentContent, setEditSegmentContent] = useState('');
    const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info'; confirmText?: string; onConfirm: () => void; } | null>(null);
    
    // Summary States
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [summaryContent, setSummaryContent] = useState('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [readingChapterIndex, setReadingChapterIndex] = useState<number | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Sync local segments with book
    useEffect(() => {
        setSegments(activeBook.segments);
    }, [activeBook.segments]);

    useEffect(() => {
        onTypingStateChange?.(isTyping);
    }, [isTyping, onTypingStateChange]);

    useEffect(() => {
        if (scrollRef.current && !isEditModalOpen) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [segments, isTyping, isEditModalOpen]);

    const chapterCount = useMemo(() => segments.filter(s => s.focus === 'chapter_summary').length + 1, [segments]);
    const materialCharId = targetCharId || materialCharacters[0]?.id || null;
    const lockedSceneIds = useMemo(() => new Set(lockedNarrativeSceneIds), [lockedNarrativeSceneIds]);
    const lastSegment = segments[segments.length - 1];
    const canReroll = Boolean(
        lastSegment
        && lastSegment.authorId !== 'user'
        && (!lastSegment.meta?.narrativeSceneId || !lockedSceneIds.has(lastSegment.meta.narrativeSceneId)),
    );

    const displaySegments = useMemo(() => {
        let lastSummaryIdx = -1;
        for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].focus === 'chapter_summary') { lastSummaryIdx = i; break; }
        }
        return segments.slice(lastSummaryIdx + 1);
    }, [segments]);
    const manuscriptSegments = useMemo(() => displaySegments.filter(segment => (
        (segment.role || (segment.type === 'story' ? 'writer' : undefined)) === 'writer'
    )), [displaySegments]);

    const historicalSummaries = useMemo(() => {
        return segments.filter(s => s.focus === 'chapter_summary');
    }, [segments]);

    // Compute full chapter content list for reading mode
    const chapterContentList = useMemo(() => {
        const chapters: { title: string; segments: NovelSegment[]; summary: string }[] = [];
        const summaryIndices: number[] = [];
        segments.forEach((s, i) => { if (s.focus === 'chapter_summary') summaryIndices.push(i); });

        for (let ci = 0; ci < summaryIndices.length; ci++) {
            const start = ci === 0 ? 0 : summaryIndices[ci - 1] + 1;
            const end = summaryIndices[ci];
            const chapterSegs = segments.slice(start, end).filter(s => s.type === 'story');
            chapters.push({
                title: `第 ${ci + 1} 章`,
                segments: chapterSegs,
                summary: segments[summaryIndices[ci]].content
            });
        }
        return chapters;
    }, [segments]);

    // --- Actions ---

    const persistSegments = async (next: NovelSegment[]) => {
        await updateNovel(activeBook.id, { segments: next });
        setSegments(next);
    };

    const runGeneration = async (
        char: CharacterProfile | undefined,
        userPrompt: string,
        contextSegments: NovelSegment[],
        capturedSceneId?: string,
    ) => {
        setIsTyping(true);
        setLastTokenUsage(null);

        try {
            const allSummaries = contextSegments.filter(s => s.focus === 'chapter_summary');
            let currentChapterStart = 0;
            if (allSummaries.length > 0) {
                const lastSummary = allSummaries[allSummaries.length - 1];
                currentChapterStart = contextSegments.findIndex(s => s.id === lastSummary.id) + 1;
            }
            const currentChapterSegs = contextSegments.slice(currentChapterStart).filter(s => s.role === 'writer' || s.type === 'story');

            let storyContext = '';
            if (allSummaries.length > 0) {
                storyContext += '【前情回顾 / Chapter Recaps】\n';
                allSummaries.forEach((summary, idx) => storyContext += `\n第${idx + 1}章总结：\n${summary.content}\n`);
                storyContext += '\n---\n\n【当前章节 / Current Chapter】\n';
            } else {
                storyContext += '【当前章节 / Current Chapter】\n';
            }
            currentChapterSegs.forEach(s => {
                storyContext += `\n${s.content}\n`;
            });

            let preparedWorldbook: PreparedWorldbookRuntimeProjection | null = null;
            let worldbookConsumer: WorldbookProjectionConsumerRef | null = null;
            const preparedCreativeScheme: PreparedCreativeScheme = await preparePlainNovelCreativeScheme(char?.id);
            if (char) {
                const scope = strictRelationshipScopeForProfile(char.id, userProfile);
                if (scope) {
                    try {
                        const workspace = await loadWorldbookWorkspace();
                        worldbookConsumer = { kind: 'world_director', id: `novel-prose:${activeBook.id}`, revision: 'plain-novel-v1' };
                        preparedWorldbook = prepareWorldbookRuntimeProjection({
                            requestId: `novel-prose:${activeBook.id}:${Date.now()}`,
                            library: workspace.entries,
                            character: char,
                            scope,
                            consumer: worldbookConsumer,
                            knowledgeSubjects: [{ kind: 'narrator', id: `novel:${activeBook.id}` }, { kind: 'character', id: char.id }],
                            continuity: activeNarrativeContinuity,
                            query: [
                                activeBook.summary,
                                activeBook.worldSetting,
                                activeNarrativeScene?.title,
                                activeNarrativeScene?.objective,
                                userPrompt,
                                storyContext.slice(-4_000),
                            ].filter(Boolean).join('\n'),
                            budget: { maxTotalChars: 1_800, maxEntries: 4, maxEntryChars: 650 },
                        });
                    } catch (error) {
                        console.warn('[novel] Worldbook projection unavailable', error);
                        addToast('世界书这轮没有读取成功，手稿仍会继续写', 'info');
                    }
                }
            }

            const prompt = buildPlainNovelPrompt({
                activeBook,
                userText: userPrompt,
                storyContext,
                creativeSchemeContext: preparedCreativeScheme.markdown,
                worldbookContext: preparedWorldbook?.markdown,
                acceptedScene: activeNarrativeScene,
            });
            const temperature = preparedCreativeScheme.modelHints?.temperature ?? 0.85;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: 8000 }),
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const data = await safeResponseJson(response);
            if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
            const content = data.choices?.[0]?.message?.content?.trim() || '';
            if (!content) throw new Error('模型没有返回可写入的正文');
            const newAiSegments: NovelSegment[] = [];
            const baseTime = Date.now();
            const prose = content.replace(/^```(?:text|markdown)?\s*/iu, '').replace(/```$/u, '').trim();
            if (!prose) throw new Error('模型没有返回可写入的正文');
            newAiSegments.push({
                id: `seg-${baseTime}-w`, role: 'writer', type: 'story', authorId: 'system',
                content: prose,
                meta: {
                    narrativeSceneId: capturedSceneId,
                    creativeSchemeDelivery: {
                        schemeId: preparedCreativeScheme.schemeId,
                        revisionId: preparedCreativeScheme.revisionId,
                        moduleIds: [...preparedCreativeScheme.moduleIds],
                        renderedHash: preparedCreativeScheme.renderedHash,
                    },
                },
                timestamp: baseTime + 2,
            });
            if (!newAiSegments.length) throw new Error('模型返回的内容无法写入手稿');
            await persistSegments([...contextSegments, ...newAiSegments]);
            if (preparedWorldbook?.projection.items.length && preparedWorldbook.markdown && worldbookConsumer) {
                try {
                    await recordWorldbookRuntimeProjectionDelivery({ prepared: preparedWorldbook, consumer: worldbookConsumer });
                } catch (error) {
                    console.warn('[novel] Worldbook delivery receipt unavailable', error);
                }
            }
        } catch (e: any) {
            addToast('请求失败: ' + e.message, 'error');
        } finally {
            setIsTyping(false);
        }
    };

    const handleSend = async () => {
        const selectedChar = characters.find(c => c.id === materialCharId);

        try {
            const userPrompt = inputText;
            setInputText('');
            await runGeneration(selectedChar, userPrompt, segments, activeNarrativeScene?.id);
        } catch (reason) {
            addToast(reason instanceof Error ? reason.message : '这段手稿没有保存成功', 'error');
        }
    };

    const handleReroll = async () => {
        const selectedChar = characters.find(c => c.id === materialCharId);

        let newSegments = [...segments];
        let deletedCount = 0;
        while (newSegments.length > 0) {
            const last = newSegments[newSegments.length - 1];
            if (last.authorId !== 'user') {
                newSegments.pop();
                deletedCount++;
                break;
            } else {
                break;
            }
        }
        if (deletedCount === 0) { addToast('没有可重随的 AI 内容', 'info'); return; }
        try {
            await persistSegments(newSegments);
            addToast('正在重随...', 'info');
            await runGeneration(selectedChar, "", newSegments, activeNarrativeScene?.id);
        } catch (reason) {
            addToast(reason instanceof Error ? reason.message : '重随前的手稿没有保存成功', 'error');
        }
    };

    const handleEditSegment = (seg: NovelSegment) => {
        setEditingSegment(seg);
        setEditSegmentContent(seg.content);
        setIsEditModalOpen(true);
    };

    const saveSegmentEdit = async () => {
        if (!editingSegment) return;
        const newSegments = segments.map(s => s.id === editingSegment.id ? { ...s, content: editSegmentContent } : s);
        try {
            await persistSegments(newSegments);
            setIsEditModalOpen(false);
            setEditingSegment(null);
        } catch (reason) {
            addToast(reason instanceof Error ? reason.message : '修改没有保存成功', 'error');
        }
    };

    const handleDeleteSegment = (id: string) => {
        setConfirmDialog({
            isOpen: true,
            title: '删除段落',
            message: '确定要删除这个段落吗？',
            variant: 'danger',
            onConfirm: async () => {
                const newSegments = segments.filter(s => s.id !== id);
                try {
                    await persistSegments(newSegments);
                    setConfirmDialog(null);
                } catch (reason) {
                    addToast(reason instanceof Error ? reason.message : '这段内容没有删除成功', 'error');
                }
            }
        });
    };

    // Chapter Summary Logic
    const handleGenerateChapterSummary = async () => {
        setIsGeneratingSummary(true);
        setShowSummaryModal(true);
        setSummaryContent('正在回顾本章节内容...');
        try {
            let startIndex = 0;
            let lastSummaryIdx = -1;
            for (let i = segments.length - 1; i >= 0; i--) {
                if (segments[i].focus === 'chapter_summary') { lastSummaryIdx = i; break; }
            }
            if (lastSummaryIdx !== -1) startIndex = lastSummaryIdx + 1;
            
            const currentChapterSegs = segments.slice(startIndex).filter(s => s.type === 'story' || s.role === 'writer');
            const chapterText = currentChapterSegs.map(s => s.content).join('\n\n');

            if (!chapterText.trim()) {
                setSummaryContent('本章似乎还没有足够的内容来生成总结。');
                setIsGeneratingSummary(false);
                return;
            }

            const existingSummaries = segments.filter(s => s.focus === 'chapter_summary');
            const prevSummaryContext = existingSummaries.length > 0
                ? `\n### 前章摘要参考（保持一致性）\n${existingSummaries.map((s, i) => `第${i+1}章：${s.content.substring(0, 300)}`).join('\n')}\n`
                : '';

            const prompt = `### 任务：章节归档总结
小说：《${activeBook.title}》
世界观：${activeBook.worldSetting || '未设定'}
${prevSummaryContext}
### 当前章节正文
${chapterText.substring(0, 200000)}

### 总结要求
请为上述章节内容生成一份**高质量归档总结**，满足以下要求：

1. **剧情轨迹**：按时间顺序梳理本章发生的所有关键事件，不遗漏任何主线或支线转折点。
2. **角色动态**：记录每个出场角色的行为、态度变化、关系发展。特别注意角色之间的互动和情感变化。
3. **氛围与基调**：描述本章的整体氛围（例如：紧张、温馨、悬疑），以及氛围的转折点。
4. **重要信息**：标记所有可能影响后续剧情的伏笔、承诺、悬念、新设定等。
5. **场景与环境**：记录关键场景的地点、时间、环境特征。
6. **写作格式**：使用清晰的结构化格式（可以分段或使用标记），让后续章节的AI仅凭此总结就能无缝衔接创作。

请直接输出总结内容，不需要JSON格式。`;
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }] })
            });

            if (response.ok) {
                const data = await safeResponseJson(response);
                setSummaryContent(data.choices[0].message.content);
            } else { setSummaryContent('生成失败，请重试。'); }
        } catch (e: any) { setSummaryContent(`错误: ${e.message}`); } finally { setIsGeneratingSummary(false); }
    };

    const confirmChapterSummary = async () => {
        const summarySeg: NovelSegment = { id: `seg-summary-${Date.now()}`, role: 'analyst', type: 'analysis', authorId: 'system', content: summaryContent, focus: 'chapter_summary', timestamp: Date.now(), meta: { reaction: '本章结束', suggestion: '新章节开始' } };
        const newSegments = [...segments, summarySeg];
        await persistSegments(newSegments);
        setShowSummaryModal(false);
        setSummaryContent('');
        addToast('章节已归档在手稿中', 'success');
    };

    return (
        <div className={`h-full w-full flex flex-col font-serif ${activeTheme.bg} transition-colors duration-500 relative`}>
            <ConfirmDialog isOpen={!!confirmDialog} title={confirmDialog?.title || ''} message={confirmDialog?.message || ''} variant={confirmDialog?.variant} confirmText={confirmDialog?.confirmText || (confirmDialog?.onConfirm ? '确认' : 'OK')} onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))} onCancel={() => setConfirmDialog(null)} />

            {/* Header */}
            {/* Removed 'sticky top-0' to fix layout overlap. It is now a standard flex child. */}
            <div className={`flex flex-col border-b border-black/5 shrink-0 z-20 backdrop-blur-md ${activeTheme.bg}/90 transition-all`}>
                <div className="h-14 flex items-center justify-between px-4">
                    <button onClick={onBack} className="h-10 w-10 -ml-2 rounded-full flex items-center justify-center hover:bg-black/5 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 ${activeTheme.text}`}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    {/* Title is clickable to open settings */}
                    <div className="flex min-w-0 flex-col items-center cursor-pointer active:opacity-70 transition-opacity" onClick={onOpenSettings}>
                        <span className={`font-bold text-base ${activeTheme.text} truncate max-w-[11rem]`}>{activeBook.title}</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] opacity-60 ${activeTheme.text}`}>第 {chapterCount} 章</span>
                            {materialCharacters.length > 1 ? (
                                <select
                                    aria-label="本轮资料视角"
                                    value={materialCharId || materialCharacters[0].id}
                                    onChange={event => onMaterialCharacterChange(event.target.value)}
                                    onClick={event => event.stopPropagation()}
                                    className={`max-w-28 rounded-full border border-current bg-transparent px-1.5 py-0.5 text-[9px] opacity-65 outline-none ${activeTheme.text}`}
                                >
                                    {materialCharacters.map(character => <option key={character.id} value={character.id}>{character.name}资料</option>)}
                                </select>
                            ) : (
                                <span className={`rounded-full border border-current px-1.5 py-0.5 text-[9px] opacity-55 ${activeTheme.text}`}>{materialCharacters[0] ? `${materialCharacters[0].name}资料` : '本书设定'}</span>
                            )}
                            {lastTokenUsage && <span className={`text-[9px] px-1.5 py-0.5 rounded opacity-50 font-mono border border-current ${activeTheme.text}`}>{lastTokenUsage}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setShowHistoryModal(true)} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${activeTheme.text}`} title="历史章节"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg></button>
                        <button onClick={handleGenerateChapterSummary} disabled={isTyping} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${activeTheme.text}`} title="结束本章"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg></button>
                    </div>
                </div>
            </div>

            {activeNarrativeScene && (
                <div className="shrink-0 border-b border-emerald-100 bg-emerald-50/95 px-4 py-2.5 font-sans text-xs text-emerald-800 flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                    <div className="min-w-0 flex-1"><span className="text-emerald-600">正在写这一幕</span><div className="truncate font-bold">{activeNarrativeScene.title}</div></div>
                    {onOpenStoryDesk && <button type="button" disabled={isTyping} onClick={onOpenStoryDesk} className="shrink-0 rounded-full border border-emerald-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40">{isTyping ? '正在写' : '回故事线'}</button>}
                </div>
            )}

            {/* Content Stream */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 pb-40 no-scrollbar" ref={scrollRef}>
                <div className="mx-auto w-full max-w-3xl space-y-5">
                {manuscriptSegments.length === 0 && <div className="rounded-2xl border border-dashed border-black/10 bg-white/35 px-5 py-14 text-center opacity-65"><p className="text-sm italic font-serif">第 {chapterCount} 章<br/>提笔写下新的开始</p></div>}
                {manuscriptSegments.length > 0 && <article className={`min-h-[62vh] rounded-[1.75rem] px-6 py-8 sm:px-10 sm:py-12 shadow-sm ${activeTheme.paper} ${activeTheme.text}`}>
                {manuscriptSegments.map(seg => {
                    const isLockedSceneSegment = Boolean(seg.meta?.narrativeSceneId && lockedSceneIds.has(seg.meta.narrativeSceneId));
                    const hoverMenu = isLockedSceneSegment ? null : (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10 bg-white/80 backdrop-blur rounded-lg p-1 shadow-sm border border-slate-100">
                            <button onClick={() => handleEditSegment(seg)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /></svg></button>
                            <button onClick={() => handleDeleteSegment(seg.id)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg></button>
                        </div>
                    );

                    return (
                        <section key={seg.id} className="relative group py-3 first:pt-0 text-justify text-[16px] leading-8 sm:text-[17px]">
                            {hoverMenu}
                            <div className="whitespace-pre-wrap">{seg.content}</div>
                        </section>
                    );
                })}
                </article>}
                {isTyping && <div className="flex justify-center py-4"><div className="flex gap-2"><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce`}></div><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce delay-75`}></div><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce delay-150`}></div></div></div>}
                </div>
            </div>

            {/* Input */}
            <div className={`absolute bottom-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 z-30 transition-transform duration-300 font-sans shadow-[0_-5px_20px_rgba(0,0,0,0.05)] pb-[max(0.75rem,env(safe-area-inset-bottom))]`}>
                <div className="mx-auto w-full max-w-3xl">
                <div className="px-4 pt-2.5 flex gap-2 items-end">
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder="写本轮要求，或留空继续正文…" className="flex-1 bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-700 outline-none resize-none max-h-32 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 transition-all" rows={1} style={{ minHeight: '44px' }} />
                    {canReroll && !isTyping && !inputText.trim() && <button onClick={handleReroll} className={`w-11 h-11 rounded-full flex items-center justify-center text-slate-500 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all shrink-0`}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>}
                    <button onClick={handleSend} disabled={isTyping} className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-all shrink-0 ${activeTheme.button}`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg></button>
                </div>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isEditModalOpen} title="编辑段落" onClose={() => setIsEditModalOpen(false)} footer={<button onClick={saveSegmentEdit} className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl">保存</button>}>
                <textarea value={editSegmentContent} onChange={e => setEditSegmentContent(e.target.value)} className="w-full h-48 bg-slate-100 rounded-xl p-3 text-sm resize-none focus:outline-none leading-relaxed" />
            </Modal>
            <Modal isOpen={showSummaryModal} title="章节总结" onClose={() => setShowSummaryModal(false)} footer={isGeneratingSummary ? <div className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl text-center">AI生成中...</div> : <button onClick={confirmChapterSummary} className="w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow-lg">确认归档并开启新章</button>}>
                <textarea value={summaryContent} onChange={e => setSummaryContent(e.target.value)} className="w-full h-64 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none leading-relaxed" placeholder="总结生成中..." />
            </Modal>
            <Modal isOpen={showHistoryModal} title="历史章节" onClose={() => setShowHistoryModal(false)}>
                <div className="max-h-[60vh] overflow-y-auto space-y-4 p-1">
                    {historicalSummaries.length === 0 && <div className="text-center text-slate-400 py-4 text-xs">暂无历史章节</div>}
                    {historicalSummaries.map((s, i) => (
                        <div key={s.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                                <div className="font-bold text-sm text-slate-700">第 {i + 1} 章</div>
                                <button onClick={() => { setReadingChapterIndex(i); setShowHistoryModal(false); }} className="text-[10px] bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg font-bold hover:bg-indigo-100 border border-indigo-100 transition-colors">阅读原文</button>
                            </div>
                            <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap line-clamp-4">{s.content}</div>
                        </div>
                    ))}
                </div>
            </Modal>

            {/* Chapter Reading Mode */}
            <Modal isOpen={readingChapterIndex !== null} title={chapterContentList[readingChapterIndex ?? 0]?.title || ''} onClose={() => setReadingChapterIndex(null)}>
                <div className="max-h-[70vh] overflow-y-auto p-1">
                    {readingChapterIndex !== null && chapterContentList[readingChapterIndex] && (
                        <>
                            <article className={`${activeTheme.paper} ${activeTheme.text} rounded-2xl px-5 py-6 shadow-sm`}>
                                {chapterContentList[readingChapterIndex].segments.map(seg => (
                                    <section key={seg.id} className="py-2 first:pt-0 text-justify font-serif text-[15px] leading-loose whitespace-pre-wrap">{seg.content}</section>
                                ))}
                            </article>
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mt-4">
                                <div className="text-[10px] font-bold text-indigo-400 uppercase mb-2">章节总结</div>
                                <div className="text-xs text-indigo-700 leading-relaxed whitespace-pre-wrap">{chapterContentList[readingChapterIndex].summary}</div>
                            </div>
                            <div className="flex justify-between pt-2">
                                <button onClick={() => setReadingChapterIndex(Math.max(0, (readingChapterIndex ?? 0) - 1))} disabled={readingChapterIndex === 0} className="text-xs text-slate-400 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-slate-100">← 上一章</button>
                                <button onClick={() => setReadingChapterIndex(Math.min(chapterContentList.length - 1, (readingChapterIndex ?? 0) + 1))} disabled={readingChapterIndex === chapterContentList.length - 1} className="text-xs text-slate-400 disabled:opacity-30 px-3 py-1.5 rounded-lg hover:bg-slate-100">下一章 →</button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default NovelWriter;
