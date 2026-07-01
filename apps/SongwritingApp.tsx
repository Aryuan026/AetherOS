
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { SongSheet, SongLine, SongComment, SongMood, SongGenre } from '../types';
import { SONG_GENRES, SONG_MOODS, SECTION_LABELS, COVER_STYLES, SongPrompts } from '../utils/songPrompts';
import { ContextBuilder } from '../utils/context';
import { safeResponseJson, extractJson } from '../utils/safeApi';
import { DB } from '../utils/db';
import Modal from '../components/os/Modal';
import ConfirmDialog from '../components/os/ConfirmDialog';
import { Check, PencilSimple } from '@phosphor-icons/react';

// --- Helper Components ---

const SectionBadge: React.FC<{ section: string; small?: boolean }> = ({ section, small }) => {
    const info = SECTION_LABELS[section] || { label: section, color: 'bg-stone-200/60 text-stone-600' };
    return (
        <span className={`${info.color} ${small ? 'text-[8px] px-1.5 py-0.5 tracking-wider' : 'text-[9px] px-2 py-0.5 tracking-wider'} rounded font-medium uppercase`}>
            {info.label}
        </span>
    );
};

type TimelineItem = { kind: 'line'; data: SongLine } | { kind: 'feedback'; data: { id: string; timestamp: number; reaction?: SongComment; details: SongComment[] } } | { kind: 'pending'; data: SongLine };

function mkLineItem(l: SongLine): TimelineItem { return { kind: 'line', data: l }; }
function mkLineItem2(group: { id: string; timestamp: number; reaction?: SongComment; details: SongComment[] }): TimelineItem { return { kind: 'feedback', data: group }; }
function mkPendingItem(l: SongLine): TimelineItem { return { kind: 'pending', data: l }; }

// --- Main App ---

const SongwritingApp: React.FC = () => {
    const { closeApp, songs, addSong, updateSong, deleteSong, characters, apiConfig, addToast, userProfile } = useOS();

    // Navigation
    const [view, setView] = useState<'shelf' | 'create' | 'write' | 'preview'>('shelf');
    const [activeSong, setActiveSong] = useState<SongSheet | null>(null);

    // Create Form State
    const [tempTitle, setTempTitle] = useState('');
    const [tempSubtitle, setTempSubtitle] = useState('');
    const [tempGenre, setTempGenre] = useState<SongGenre>('pop');
    const [tempMood, setTempMood] = useState<SongMood>('happy');
    const [tempCollaboratorId, setTempCollaboratorId] = useState('');
    const [tempCoverStyle, setTempCoverStyle] = useState(COVER_STYLES[0]?.id || 'dawn-blush');
    const [customCoverFrom, setCustomCoverFrom] = useState('#FB7185');
    const [customCoverVia, setCustomCoverVia] = useState('#A855F7');
    const [customCoverTo, setCustomCoverTo] = useState('#2563EB');

    // Write View State
    const [inputText, setInputText] = useState('');
    const [currentSection, setCurrentSection] = useState<string>('verse');
    const [isTyping, setIsTyping] = useState(false);
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    const [showStructureGuide, setShowStructureGuide] = useState(false);
    const [expandedFeedbackIds, setExpandedFeedbackIds] = useState<Record<string, boolean>>({});

    // Pending candidate lines (not yet committed to song)
    const [pendingLines, setPendingLines] = useState<SongLine[]>([]);

    // Modals
    const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info'; confirmText?: string; onConfirm: () => void } | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [completionReview, setCompletionReview] = useState('');
    const [isCompleting, setIsCompleting] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareTargetCharId, setShareTargetCharId] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);

    // Long press for mobile delete
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartPos = useRef({ x: 0, y: 0 });
    const [longPressLineId, setLongPressLineId] = useState<string | null>(null);

    const handleLineTouchStart = useCallback((e: React.TouchEvent, lineId: string) => {
        touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        longPressTimerRef.current = setTimeout(() => {
            setLongPressLineId(lineId);
        }, 500);
    }, []);

    const handleLineTouchMove = useCallback((e: React.TouchEvent) => {
        if (!longPressTimerRef.current) return;
        const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
        const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
        if (dx > 10 || dy > 10) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handleLineTouchEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    // Computed
    const collaborator = useMemo(() => {
        if (!activeSong) return null;
        return characters.find(c => c.id === activeSong.collaboratorId) || null;
    }, [activeSong, characters]);

    const getCoverStyle = (styleId: string) => COVER_STYLES.find(s => s.id === styleId) || COVER_STYLES[0];

    const isCustomCoverStyle = (styleId: string) => styleId.startsWith('custom:');

    const buildCustomCoverStyleId = (from: string = customCoverFrom, via: string = customCoverVia, to: string = customCoverTo) => `custom:${from}-${via}-${to}`;

    const updateCustomCoverColor = (position: 'from' | 'via' | 'to', color: string) => {
        const nextFrom = position === 'from' ? color : customCoverFrom;
        const nextVia = position === 'via' ? color : customCoverVia;
        const nextTo = position === 'to' ? color : customCoverTo;

        if (position === 'from') setCustomCoverFrom(color);
        if (position === 'via') setCustomCoverVia(color);
        if (position === 'to') setCustomCoverTo(color);

        setTempCoverStyle(buildCustomCoverStyleId(nextFrom, nextVia, nextTo));
    };

    const getCoverVisual = (styleId: string): { textClass: string; className: string; style: React.CSSProperties } => {
        if (!isCustomCoverStyle(styleId)) {
            const preset = getCoverStyle(styleId);
            return { textClass: preset.text, className: `bg-gradient-to-br ${preset.gradient}`, style: {} };
        }

        const [, palette = ''] = styleId.split(':');
        const [from = '#FB7185', via = '#A855F7', to = '#2563EB'] = palette.split('-');
        return {
            textClass: 'text-white',
            className: '',
            style: {
                backgroundImage: `linear-gradient(135deg, ${from} 0%, ${via} 50%, ${to} 100%)`,
                backgroundColor: from,
            }
        };
    };

    const feedbackGroups = useMemo(() => {
        if (!activeSong) return [] as { id: string; timestamp: number; reaction?: SongComment; details: SongComment[] }[];
        const groups = new Map<string, { id: string; timestamp: number; reaction?: SongComment; details: SongComment[] }>();
        activeSong.comments.forEach((comment) => {
            const match = comment.id.match(/^cmt-(\d+)-/);
            const key = match?.[1] || comment.id;
            if (!groups.has(key)) groups.set(key, { id: key, timestamp: Number(key) || comment.timestamp, details: [] });
            const group = groups.get(key)!;
            if (comment.type === 'reaction' && !group.reaction) {
                group.reaction = comment;
            } else {
                group.details.push(comment);
            }
        });
        return [...groups.values()].sort((a, b) => a.timestamp - b.timestamp);
    }, [activeSong]);

    const toggleFeedback = (id: string) => {
        setExpandedFeedbackIds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeSong?.lines, activeSong?.comments, pendingLines, isTyping]);

    // --- CRUD ---

    const handleCreate = () => {
        if (!tempTitle.trim()) { addToast('请给歌曲起个名字', 'error'); return; }
        if (!tempCollaboratorId) { addToast('请选择一个角色作为创作伙伴', 'error'); return; }

        const newSong: SongSheet = {
            id: `song-${Date.now()}`,
            title: tempTitle,
            subtitle: tempSubtitle || undefined,
            genre: tempGenre,
            mood: tempMood,
            collaboratorId: tempCollaboratorId,
            lines: [],
            comments: [],
            status: 'draft',
            coverStyle: tempCoverStyle,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
        };
        addSong(newSong);
        setActiveSong(newSong);
        setView('write');
        resetTempState();
    };

    const resetTempState = () => {
        setTempTitle(''); setTempSubtitle(''); setTempGenre('pop'); setTempMood('happy');
        setTempCollaboratorId(''); setTempCoverStyle(COVER_STYLES[0]?.id || 'dawn-blush');
        setCustomCoverFrom('#FB7185'); setCustomCoverVia('#A855F7'); setCustomCoverTo('#2563EB');
    };

    const handleDeleteSong = (id: string) => {
        setConfirmDialog({
            isOpen: true, title: '删除歌曲', message: '确定要删除这首歌吗？删除后无法恢复。', variant: 'danger',
            onConfirm: () => {
                deleteSong(id);
                if (activeSong?.id === id) { setActiveSong(null); setView('shelf'); }
                setConfirmDialog(null);
                addToast('已删除', 'success');
            }
        });
    };

    // --- AI Interaction ---

    const handleSendToAI = async (userMessage: string, addAsLine: boolean = false, requestedType?: 'inspiration' | 'discussion' | 'feedback') => {
        if (!activeSong || !collaborator) return;
        setIsTyping(true);
        setLastTokenUsage(null);

        let updatedSong = { ...activeSong };

        // If user wrote lyrics, add as a pending candidate (not committed yet)
        if (addAsLine && userMessage.trim()) {
            const newLine: SongLine = {
                id: `line-${Date.now()}`,
                authorId: 'user',
                content: userMessage.trim(),
                section: currentSection,
                timestamp: Date.now(),
            };
            setPendingLines(prev => [...prev, newLine]);
        }

        try {
            // Fetch recent 200 messages for context
            const recentMessages = await DB.getRecentMessagesByCharId(collaborator.id, 200);
            const msgContext = recentMessages.slice(-20).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content
            }));

            const systemPrompt = SongPrompts.buildMentorSystemPrompt(collaborator, userProfile, updatedSong, msgContext);
            let userPrompt = SongPrompts.buildUserMessage(updatedSong, userMessage, currentSection);
            if (requestedType) {
                const typeHints: Record<string, string> = {
                    inspiration: '\n\n【请求类型】: inspiration — 请用 inspiration 格式回复，提供示范歌词和创作技巧解释。',
                    discussion: '\n\n【请求类型】: discussion — 请用 discussion 格式回复，讨论创作方向和结构，不要提供示范歌词。',
                    feedback: '\n\n【请求类型】: feedback — 请用 feedback 格式回复，评价用户写的歌词。',
                };
                userPrompt += typeHints[requestedType] || '';
            }

            // Build messages array with recent chat context
            const apiMessages: { role: string; content: string }[] = [
                { role: 'system', content: systemPrompt },
            ];

            // Include last few song comments as conversation history
            const recentSongComments = updatedSong.comments.slice(-6);
            for (const c of recentSongComments) {
                apiMessages.push({ role: 'assistant', content: JSON.stringify({ type: 'feedback', reaction: c.content.substring(0, 50), feedback: c.content }) });
            }

            apiMessages.push({ role: 'user', content: userPrompt });

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: apiMessages, temperature: 0.8, max_tokens: 2000 })
            });

            if (response.ok) {
                const data = await safeResponseJson(response);
                if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);

                const rawContent = data.choices[0].message.content.trim();
                const parsed = extractJson(rawContent);

                const newComments: SongComment[] = [];
                const baseTime = Date.now();

                if (parsed) {
                    // Add reaction as a comment
                    if (parsed.reaction) {
                        newComments.push({
                            id: `cmt-${baseTime}-r`,
                            authorId: collaborator.id,
                            type: 'reaction',
                            content: parsed.reaction,
                            timestamp: baseTime,
                        });
                    }

                    // Type-specific handling
                    if (parsed.type === 'feedback') {
                        if (parsed.feedback) {
                            newComments.push({
                                id: `cmt-${baseTime}-f`,
                                authorId: collaborator.id,
                                type: 'suggestion',
                                content: parsed.feedback,
                                timestamp: baseTime + 1,
                            });
                        }
                        if (parsed.teaching) {
                            newComments.push({
                                id: `cmt-${baseTime}-t`,
                                authorId: collaborator.id,
                                type: 'teaching',
                                content: parsed.teaching,
                                timestamp: baseTime + 2,
                            });
                        }
                        if (parsed.suggestion) {
                            newComments.push({
                                id: `cmt-${baseTime}-s`,
                                authorId: collaborator.id,
                                type: 'guidance',
                                content: parsed.suggestion,
                                timestamp: baseTime + 3,
                            });
                        }
                        if (parsed.encouragement) {
                            newComments.push({
                                id: `cmt-${baseTime}-e`,
                                authorId: collaborator.id,
                                type: 'praise',
                                content: parsed.encouragement,
                                timestamp: baseTime + 4,
                            });
                        }
                    } else if (parsed.type === 'inspiration') {
                        if (parsed.example_lines && Array.isArray(parsed.example_lines)) {
                            const exampleCandidates: SongLine[] = [];
                            for (let i = 0; i < parsed.example_lines.length; i++) {
                                exampleCandidates.push({
                                    id: `line-${baseTime}-ex${i}`,
                                    authorId: collaborator.id,
                                    content: parsed.example_lines[i],
                                    section: currentSection,
                                    annotation: '示范参考',
                                    timestamp: baseTime + 10 + i,
                                });
                            }
                            setPendingLines(prev => [...prev, ...exampleCandidates]);
                        }
                        if (parsed.explanation) {
                            newComments.push({
                                id: `cmt-${baseTime}-exp`,
                                authorId: collaborator.id,
                                type: 'teaching',
                                content: parsed.explanation,
                                timestamp: baseTime + 5,
                            });
                        }
                        if (parsed.challenge) {
                            newComments.push({
                                id: `cmt-${baseTime}-ch`,
                                authorId: collaborator.id,
                                type: 'guidance',
                                content: parsed.challenge,
                                timestamp: baseTime + 6,
                            });
                        }
                    } else if (parsed.type === 'discussion') {
                        if (parsed.content) {
                            newComments.push({
                                id: `cmt-${baseTime}-d`,
                                authorId: collaborator.id,
                                type: 'guidance',
                                content: parsed.content,
                                timestamp: baseTime + 1,
                            });
                        }
                        if (parsed.question) {
                            newComments.push({
                                id: `cmt-${baseTime}-q`,
                                authorId: collaborator.id,
                                type: 'guidance',
                                content: parsed.question,
                                timestamp: baseTime + 2,
                            });
                        }
                    }
                } else {
                    // Fallback: treat raw text as general feedback
                    newComments.push({
                        id: `cmt-${baseTime}-raw`,
                        authorId: collaborator.id,
                        type: 'suggestion',
                        content: rawContent,
                        timestamp: baseTime,
                    });
                }

                const finalSong = {
                    ...updatedSong,
                    comments: [...updatedSong.comments, ...newComments],
                };
                setActiveSong(finalSong);
                await updateSong(finalSong.id, { comments: finalSong.comments });
            } else {
                throw new Error(`API Error: ${response.status}`);
            }
        } catch (e: any) {
            addToast('请求失败: ' + e.message, 'error');
        } finally {
            setIsTyping(false);
        }
    };

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text) return;
        setInputText('');
        await handleSendToAI(text, true, 'feedback');
    };

    const handleAskForHelp = async () => {
        setInputText('');
        await handleSendToAI('我不知道怎么写，能给我一些灵感和示范吗？', false, 'inspiration');
    };

    const handleDiscuss = async () => {
        const text = inputText.trim();
        if (!text) {
            await handleSendToAI('我想讨论一下接下来怎么写，有什么建议吗？', false, 'discussion');
        } else {
            setInputText('');
            await handleSendToAI(text, false, 'discussion');
        }
    };

    // --- Delete Line ---
    const handleDeleteLine = (lineId: string) => {
        if (!activeSong) return;
        const newLines = activeSong.lines.filter(l => l.id !== lineId);
        const updated = { ...activeSong, lines: newLines };
        setActiveSong(updated);
        updateSong(updated.id, { lines: newLines });
    };

    // --- Delete Feedback Group (comments) ---
    const handleDeleteFeedback = (groupId: string) => {
        if (!activeSong) return;
        // Remove all comments whose id starts with `cmt-{groupId}-`
        const newComments = activeSong.comments.filter(c => {
            const match = c.id.match(/^cmt-(\d+)-/);
            const key = match?.[1] || c.id;
            return key !== groupId;
        });
        const updated = { ...activeSong, comments: newComments };
        setActiveSong(updated);
        updateSong(updated.id, { comments: newComments });
    };

    // --- Accept / Dismiss Pending Lines ---
    const handleAcceptPending = (lineId: string) => {
        if (!activeSong) return;
        const line = pendingLines.find(l => l.id === lineId);
        if (!line) return;
        const newLines = [...activeSong.lines, line];
        const updated = { ...activeSong, lines: newLines };
        setActiveSong(updated);
        updateSong(updated.id, { lines: newLines });
        setPendingLines(prev => prev.filter(l => l.id !== lineId));
    };

    const handleDismissPending = (lineId: string) => {
        if (!activeSong) { setPendingLines(prev => prev.filter(l => l.id !== lineId)); return; }
        const line = pendingLines.find(l => l.id === lineId);
        if (!line) return;
        // Save as draft instead of discarding — it stays in the record, just not as a final lyric
        const draftLine: SongLine = { ...line, isDraft: true };
        const newLines = [...activeSong.lines, draftLine];
        const updated = { ...activeSong, lines: newLines };
        setActiveSong(updated);
        updateSong(updated.id, { lines: newLines });
        setPendingLines(prev => prev.filter(l => l.id !== lineId));
    };

    // --- Restore Draft Line to Active ---
    const handleRestoreDraft = (lineId: string) => {
        if (!activeSong) return;
        const newLines = activeSong.lines.map(l => l.id === lineId ? { ...l, isDraft: false } : l);
        const updated = { ...activeSong, lines: newLines };
        setActiveSong(updated);
        updateSong(updated.id, { lines: newLines });
    };

    // --- Edit Line ---
    const [editingLineId, setEditingLineId] = useState<string | null>(null);
    const [editLineContent, setEditLineContent] = useState('');

    const startEditLine = (line: SongLine) => {
        setEditingLineId(line.id);
        setEditLineContent(line.content);
    };

    const saveEditLine = () => {
        if (!activeSong || !editingLineId) return;
        const newLines = activeSong.lines.map(l => l.id === editingLineId ? { ...l, content: editLineContent } : l);
        const updated = { ...activeSong, lines: newLines };
        setActiveSong(updated);
        updateSong(updated.id, { lines: newLines });
        setEditingLineId(null);
    };

    // --- Completion ---
    const handleComplete = async () => {
        if (!activeSong || !collaborator) return;
        if (activeSong.lines.filter(l => !l.isDraft).length === 0) { addToast('歌曲还没有任何歌词', 'error'); return; }

        setIsCompleting(true);
        setShowPreviewModal(true);
        setCompletionReview('正在让导师评价...');

        try {
            const prompt = SongPrompts.buildCompletionPrompt(collaborator, userProfile, activeSong);
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 500 })
            });

            if (response.ok) {
                const data = await safeResponseJson(response);
                setCompletionReview(data.choices[0].message.content.trim());
            } else {
                setCompletionReview('(评价生成失败，但不影响保存)');
            }
        } catch {
            setCompletionReview('(网络错误，但不影响保存)');
        } finally {
            setIsCompleting(false);
        }
    };

    const confirmComplete = async () => {
        if (!activeSong || !collaborator) return;
        const completed: SongSheet = {
            ...activeSong,
            status: 'completed',
            completedAt: Date.now(),
        };
        setActiveSong(completed);
        await updateSong(completed.id, { status: 'completed', completedAt: completed.completedAt });

        // Send system message to chat
        const genreInfo = SONG_GENRES.find(g => g.id === completed.genre);
        await DB.saveMessage({
            charId: collaborator.id,
            role: 'system',
            type: 'text',
            content: `[系统: ${userProfile.name} 和 ${collaborator.name} 一起完成了歌曲创作《${completed.title}》(${genreInfo?.label || completed.genre})]`,
        });

        setShowPreviewModal(false);
        addToast('歌曲已完成！乐谱已保存', 'success');
        setView('shelf');
    };

    // --- Share to Chat as Card ---
    const handleShareToChat = async (charId: string) => {
        if (!activeSong) return;

        // Build lyrics text (exclude draft lines)
        let lyrics = '';
        let currentSec = '';
        for (const line of activeSong.lines.filter(l => !l.isDraft)) {
            if (line.section !== currentSec) {
                currentSec = line.section;
                const secInfo = SECTION_LABELS[currentSec];
                lyrics += `\n[${secInfo?.label || currentSec}]\n`;
            }
            lyrics += `${line.content}\n`;
        }

        const genreInfo = SONG_GENRES.find(g => g.id === activeSong.genre);
        const moodInfo = SONG_MOODS.find(m => m.id === activeSong.mood);

        const cardData = {
            songId: activeSong.id,
            title: activeSong.title,
            subtitle: activeSong.subtitle,
            genre: genreInfo?.label || activeSong.genre,
            genreIcon: genreInfo?.icon || '',
            mood: moodInfo?.label || activeSong.mood,
            moodIcon: moodInfo?.icon || '',
            coverStyle: activeSong.coverStyle,
            lyrics: lyrics.trim(),
            lineCount: activeSong.lines.filter(l => !l.isDraft).length,
            status: activeSong.status,
            completedAt: activeSong.completedAt,
        };

        await DB.saveMessage({
            charId,
            role: 'user',
            type: 'score_card',
            content: JSON.stringify(cardData),
            metadata: { scoreCard: cardData },
        });

        setShowShareModal(false);
        addToast('乐谱已分享到聊天', 'success');
    };

    // --- Pause (just go back) ---
    const handlePause = () => {
        setView('shelf');
        setActiveSong(null);
        setPendingLines([]);
    };

    // ==================== RENDER ====================

    // --- Shelf View ---
    if (view === 'shelf') {
        const drafts = songs.filter(s => s.status === 'draft');
        const completed = songs.filter(s => s.status === 'completed');

        return (
            <div className="h-full w-full bg-[#F5F0E8] flex flex-col font-sans relative overflow-hidden">
                {/* Header */}
                <div className="h-24 flex items-end pb-4 px-6 border-b border-stone-200/80 shrink-0 z-10 bg-[#F5F0E8]">
                    <div className="flex justify-between items-center w-full">
                        <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-stone-200/50 active:scale-95 transition-transform text-stone-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="text-center">
                            <h1 className="text-[11px] tracking-[0.35em] text-stone-400 uppercase">Lyric</h1>
                            <p className="text-lg font-semibold text-stone-700 -mt-0.5" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>歌词手帖</p>
                        </div>
                        <button onClick={() => setView('create')} className="p-2 rounded-full hover:bg-stone-200/50 active:scale-95 transition-transform text-stone-500" title="新建歌词本">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8 space-y-7 no-scrollbar z-10">
                    {songs.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                            <div className="w-20 h-[2px] bg-stone-300/60 mb-8" />
                            <p className="text-base text-stone-500 leading-8" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>
                                还没有写过歌
                            </p>
                            <p className="text-xs text-stone-400 mt-3 leading-6">
                                点击右上角的 +，开始第一本歌词手帖
                            </p>
                            <div className="w-20 h-[2px] bg-stone-300/60 mt-8" />
                            <button onClick={() => setView('create')} className="mt-8 px-6 py-2.5 border border-stone-300 rounded text-sm text-stone-600 hover:bg-stone-100 active:scale-[0.98] transition-all">
                                开始写歌
                            </button>
                        </div>
                    )}

                    {/* Drafts */}
                    {drafts.length > 0 && (
                        <div>
                            <div className="flex items-center gap-3 mb-4 px-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <h2 className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.2em]">草稿</h2>
                                <div className="flex-1 h-[1px] bg-stone-200/80" />
                            </div>
                            <div className="space-y-3">
                                {drafts.sort((a, b) => b.lastActiveAt - a.lastActiveAt).map(song => {
                                    const style = getCoverVisual(song.coverStyle);
                                    const char = characters.find(c => c.id === song.collaboratorId);
                                    const genreInfo = SONG_GENRES.find(g => g.id === song.genre);
                                    return (
                                        <div key={song.id} className="relative group">
                                            <div
                                                onClick={() => { setActiveSong(song); setView('write'); }}
                                                className="flex items-stretch cursor-pointer active:scale-[0.99] transition-transform rounded-lg overflow-hidden border border-stone-200/80 bg-white shadow-sm"
                                            >
                                                {/* Mini cover spine */}
                                                <div className={`w-16 shrink-0 ${style.className} flex items-center justify-center`} style={style.style}>
                                                    <span className={`text-lg ${style.textClass}`}>{genreInfo?.icon || '♪'}</span>
                                                </div>
                                                <div className="flex-1 p-3.5 min-w-0">
                                                    <h3 className="font-semibold text-sm text-stone-700 truncate" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{song.title}</h3>
                                                    {song.subtitle && <p className="text-[11px] text-stone-400 truncate mt-0.5 italic">{song.subtitle}</p>}
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-[10px] text-stone-400">{genreInfo?.label}</span>
                                                        <span className="text-stone-300">·</span>
                                                        <span className="text-[10px] text-stone-400">{song.lines.filter(l => !l.isDraft).length} 行</span>
                                                        {song.lines.some(l => l.isDraft) && (
                                                            <span className="text-[10px] text-stone-300">{song.lines.filter(l => l.isDraft).length} 草稿</span>
                                                        )}
                                                        {char && (
                                                            <>
                                                                <span className="text-stone-300">·</span>
                                                                <span className="text-[10px] text-stone-400">与 {char.name}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteSong(song.id); }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-stone-100 text-stone-400 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-opacity hover:bg-red-50 hover:text-red-400">×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Completed */}
                    {completed.length > 0 && (
                        <div>
                            <div className="flex items-center gap-3 mb-4 px-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                                <h2 className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.2em]">已完成</h2>
                                <div className="flex-1 h-[1px] bg-stone-200/80" />
                            </div>
                            <div className="space-y-3">
                                {completed.sort((a, b) => (b.completedAt || b.lastActiveAt) - (a.completedAt || a.lastActiveAt)).map(song => {
                                    const style = getCoverVisual(song.coverStyle);
                                    const char = characters.find(c => c.id === song.collaboratorId);
                                    const genreInfo = SONG_GENRES.find(g => g.id === song.genre);
                                    const moodInfo = SONG_MOODS.find(m => m.id === song.mood);
                                    return (
                                        <div key={song.id} className="relative group">
                                            <div
                                                onClick={() => { setActiveSong(song); setView('preview'); }}
                                                className="flex items-stretch cursor-pointer active:scale-[0.99] transition-transform rounded-lg overflow-hidden border border-stone-200/80 bg-white shadow-sm"
                                            >
                                                <div className={`w-16 shrink-0 ${style.className} flex items-center justify-center`} style={style.style}>
                                                    <span className={`text-lg ${style.textClass}`}>{genreInfo?.icon || '♪'}</span>
                                                </div>
                                                <div className="flex-1 p-3.5 min-w-0">
                                                    <h3 className="font-semibold text-sm text-stone-700 truncate" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{song.title}</h3>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <span className="text-[10px] text-stone-400">{genreInfo?.label}</span>
                                                        <span className="text-stone-300">·</span>
                                                        <span className="text-[10px] text-stone-400">{moodInfo?.icon} {moodInfo?.label}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {char && <img src={char.avatar} className="w-4 h-4 rounded-full object-cover" />}
                                                        <span className="text-[10px] text-stone-400">与 {char?.name} 创作</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveSong(song); setShowShareModal(true); }}
                                                    className="p-3 text-stone-400 hover:text-stone-600 self-center transition-colors"
                                                    title="分享"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
                                                </button>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteSong(song.id); }} className="absolute top-2 right-12 opacity-0 group-hover:opacity-100 bg-stone-100 text-stone-400 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-opacity hover:bg-red-50 hover:text-red-400">×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Share Modal */}
                <Modal isOpen={showShareModal} title="分享乐谱" onClose={() => setShowShareModal(false)}>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        <p className="text-xs text-stone-500 mb-3">选择一个角色，以卡片形式把乐谱分享到聊天</p>
                        {characters.map(c => (
                            <button key={c.id} onClick={() => handleShareToChat(c.id)} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-stone-50 border border-stone-100 transition-colors">
                                <img src={c.avatar} className="w-10 h-10 rounded-full object-cover" />
                                <span className="font-medium text-sm text-stone-700">{c.name}</span>
                            </button>
                        ))}
                    </div>
                </Modal>

                <ConfirmDialog isOpen={!!confirmDialog} title={confirmDialog?.title || ''} message={confirmDialog?.message || ''} variant={confirmDialog?.variant} confirmText={confirmDialog?.confirmText} onConfirm={confirmDialog?.onConfirm || (() => {})} onCancel={() => setConfirmDialog(null)} />
            </div>
        );
    }

    // --- Create View ---
    if (view === 'create') {
        return (
            <div className="h-full w-full bg-[#F5F0E8] flex flex-col font-sans relative overflow-hidden">
                <div className="h-14 flex items-center px-4 border-b border-stone-200/80 shrink-0 bg-[#F5F0E8] z-10">
                    <button onClick={() => setView('shelf')} className="p-2 -ml-2 rounded-full hover:bg-stone-200/50 active:scale-95 transition-transform text-stone-500">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <h2 className="font-medium text-stone-600 ml-2 text-sm">新建手帖</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar pb-28 z-10">
                    {/* Title */}
                    <div>
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.15em]">歌名</label>
                        <input value={tempTitle} onChange={e => setTempTitle(e.target.value)} placeholder="给这本歌词手帖起个名字" className="w-full mt-2 bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none focus:border-stone-400 transition-colors" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }} />
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.15em]">副标题</label>
                        <input value={tempSubtitle} onChange={e => setTempSubtitle(e.target.value)} placeholder="这首歌想说什么" className="w-full mt-2 bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none focus:border-stone-400 transition-colors italic" />
                    </div>

                    {/* Genre */}
                    <div>
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.15em]">风格</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {SONG_GENRES.map(g => (
                                <button key={g.id} onClick={() => setTempGenre(g.id)} className={`px-3 py-1.5 rounded text-xs transition-all ${tempGenre === g.id ? 'bg-stone-700 text-stone-50' : 'bg-white text-stone-500 border border-stone-200 hover:border-stone-300'}`}>
                                    {g.icon} {g.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Mood */}
                    <div>
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.15em]">情绪</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {SONG_MOODS.map(m => (
                                <button key={m.id} onClick={() => setTempMood(m.id)} className={`px-3 py-1.5 rounded text-xs transition-all ${tempMood === m.id ? 'bg-stone-700 text-stone-50' : 'bg-white text-stone-500 border border-stone-200 hover:border-stone-300'}`}>
                                    {m.icon} {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Collaborator */}
                    <div>
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.15em]">创作伙伴</label>
                        <p className="text-[10px] text-stone-400 mt-0.5 mb-2">选一个角色，陪你一起写</p>
                        <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                            {characters.map(c => (
                                <button key={c.id} onClick={() => setTempCollaboratorId(c.id)} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${tempCollaboratorId === c.id ? 'bg-white border-2 border-stone-400' : 'bg-white border border-stone-200 hover:border-stone-300'}`}>
                                    <img src={c.avatar} className="w-9 h-9 rounded-full object-cover" />
                                    <div className="text-left flex-1 min-w-0">
                                        <div className="font-medium text-sm text-stone-700">{c.name}</div>
                                        <div className="text-[10px] text-stone-400 truncate">{c.description || '将作为你的音乐导师'}</div>
                                    </div>
                                    {tempCollaboratorId === c.id && <div className="w-4 h-4 bg-stone-700 rounded-full flex items-center justify-center text-white"><Check size={10} weight="bold" /></div>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cover Style */}
                    <div>
                        <label className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.15em]">纸张色调</label>
                        <div className="flex gap-2.5 mt-2 overflow-x-auto no-scrollbar">
                            {COVER_STYLES.map(s => (
                                <div key={s.id} className="flex flex-col items-center gap-1 shrink-0">
                                    <button onClick={() => setTempCoverStyle(s.id)} className={`w-11 h-11 rounded-lg bg-gradient-to-br ${s.gradient} shrink-0 transition-all border ${tempCoverStyle === s.id ? 'border-stone-500 ring-1 ring-stone-400 ring-offset-1' : 'border-stone-200 opacity-75 hover:opacity-100'}`} title={s.label} />
                                    <span className="text-[8px] text-stone-400">{s.label}</span>
                                </div>
                            ))}
                            <div className="flex flex-col items-center gap-1 shrink-0">
                                <button
                                    onClick={() => setTempCoverStyle(buildCustomCoverStyleId())}
                                    className={`w-11 h-11 rounded-lg shrink-0 transition-all border ${isCustomCoverStyle(tempCoverStyle) ? 'border-stone-500 ring-1 ring-stone-400 ring-offset-1' : 'border-stone-200 opacity-75 hover:opacity-100'}`}
                                    style={{ backgroundImage: `linear-gradient(135deg, ${customCoverFrom} 0%, ${customCoverVia} 50%, ${customCoverTo} 100%)` }}
                                    title="自定义"
                                />
                                <span className="text-[8px] text-stone-400">自定义</span>
                            </div>
                        </div>
                        <div className="mt-3 rounded-lg bg-white border border-stone-200 p-3">
                            <div className="text-[10px] text-stone-400 mb-2">自定义色调</div>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: '起点', color: customCoverFrom, position: 'from' },
                                    { label: '中间', color: customCoverVia, position: 'via' },
                                    { label: '终点', color: customCoverTo, position: 'to' }
                                ].map(item => (
                                    <label key={item.label} className="text-[10px] text-stone-400 space-y-1">
                                        <span className="block">{item.label}</span>
                                        <input
                                            type="color"
                                            value={item.color}
                                            onChange={(e) => updateCustomCoverColor(item.position, e.target.value)}
                                            className="w-full h-8 rounded cursor-pointer border border-stone-200 bg-white p-0.5"
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Create Button */}
                <div className="absolute bottom-0 w-full p-4 bg-[#F5F0E8]/90 border-t border-stone-200/80 pb-safe backdrop-blur-sm z-20">
                    <button onClick={handleCreate} className="w-full py-3 bg-stone-700 text-stone-50 font-medium rounded-lg active:scale-[0.98] transition-transform text-sm">
                        翻开新的一页
                    </button>
                </div>
            </div>
        );
    }

    // --- Preview View (completed songs) ---
    if (view === 'preview' && activeSong) {
        const style = getCoverVisual(activeSong.coverStyle);
        const genreInfo = SONG_GENRES.find(g => g.id === activeSong.genre);
        const moodInfo = SONG_MOODS.find(m => m.id === activeSong.mood);

        let currentSec = '';
        return (
            <div className="h-full w-full bg-[#F5F0E8] flex flex-col font-sans relative overflow-hidden">
                {/* Cover / Title Page */}
                <div className={`${style.className} ${style.textClass} relative shrink-0`} style={{ ...style.style, minHeight: '220px' }}>
                    <button onClick={() => { setView('shelf'); setActiveSong(null); }} className="absolute top-4 left-4 p-2 rounded-full bg-black/10 hover:bg-black/20 transition-colors z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <button onClick={() => { setShowShareModal(true); }} className="absolute top-4 right-4 p-2 rounded-full bg-black/10 hover:bg-black/20 transition-colors z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
                    </button>
                    {/* Album-style title layout */}
                    <div className="flex flex-col items-center justify-end h-full px-8 pb-8 pt-16">
                        <div className="w-12 h-[1px] bg-current opacity-20 mb-5" />
                        <h1 className="text-2xl font-semibold text-center leading-tight" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{activeSong.title}</h1>
                        {activeSong.subtitle && <p className="text-sm opacity-60 mt-2 italic text-center">{activeSong.subtitle}</p>}
                        <div className="flex items-center gap-3 mt-4 text-[11px] opacity-50">
                            <span>{genreInfo?.label}</span>
                            <span>·</span>
                            <span>{moodInfo?.label}</span>
                        </div>
                        {collaborator && (
                            <div className="flex items-center gap-2 mt-3 opacity-50">
                                <img src={collaborator.avatar} className="w-5 h-5 rounded-full object-cover" />
                                <span className="text-[11px]">与 {collaborator.name} 创作</span>
                            </div>
                        )}
                        <div className="w-12 h-[1px] bg-current opacity-20 mt-5" />
                    </div>
                </div>

                {/* Lyrics body — like a booklet page (draft lines excluded) */}
                <div className="flex-1 overflow-y-auto px-8 py-8 no-scrollbar relative z-10">
                    {activeSong.lines.filter(l => !l.isDraft).map(line => {
                        const showSection = line.section !== currentSec;
                        if (showSection) currentSec = line.section;
                        return (
                            <div key={line.id}>
                                {showSection && (
                                    <div className="mt-8 mb-4 first:mt-0 flex items-center gap-3">
                                        <div className="w-6 h-[1px] bg-stone-300" />
                                        <span className="text-[9px] text-stone-400 uppercase tracking-[0.2em] font-medium">{SECTION_LABELS[line.section]?.label || line.section}</span>
                                        <div className="flex-1 h-[1px] bg-stone-200/60" />
                                    </div>
                                )}
                                <p className="text-[15px] text-stone-600 leading-[2.2] py-0" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{line.content}</p>
                            </div>
                        );
                    })}
                    {/* End mark */}
                    <div className="flex justify-center mt-10 mb-4">
                        <div className="w-8 h-[1px] bg-stone-300" />
                    </div>
                </div>

                {/* Share Modal */}
                <Modal isOpen={showShareModal} title="分享乐谱" onClose={() => setShowShareModal(false)}>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        <p className="text-xs text-stone-500 mb-3">选择一个角色，把乐谱卡片发送到聊天</p>
                        {characters.map(c => (
                            <button key={c.id} onClick={() => handleShareToChat(c.id)} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-stone-50 border border-stone-100 transition-colors">
                                <img src={c.avatar} className="w-10 h-10 rounded-full object-cover" />
                                <span className="font-medium text-sm text-stone-700">{c.name}</span>
                            </button>
                        ))}
                    </div>
                </Modal>
            </div>
        );
    }

    // --- Write View ---
    if (view === 'write' && activeSong) {
        const genreInfo = SONG_GENRES.find(g => g.id === activeSong.genre);

        // Interleave lines, feedback groups, and pending candidates by timestamp for display
        const lineItems = activeSong.lines.map(mkLineItem);
        const fbItems = feedbackGroups.map(mkLineItem2);
        const pendingItems = pendingLines.map(mkPendingItem);
        const timeline = [...lineItems, ...fbItems, ...pendingItems].sort((a, b) => a.data.timestamp - b.data.timestamp);

        return (
            <div className="h-full w-full bg-[#F5F0E8] flex flex-col font-sans relative overflow-hidden">
                <ConfirmDialog isOpen={!!confirmDialog} title={confirmDialog?.title || ''} message={confirmDialog?.message || ''} variant={confirmDialog?.variant} confirmText={confirmDialog?.confirmText} onConfirm={confirmDialog?.onConfirm || (() => {})} onCancel={() => setConfirmDialog(null)} />

                {/* Header */}
                <div className="border-b border-stone-200/80 shrink-0 z-20 bg-[#F5F0E8]">
                    <div className="h-12 flex items-center justify-between px-4">
                        <button onClick={handlePause} className="p-2 -ml-2 rounded-full hover:bg-stone-200/50 text-stone-500 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="text-center">
                            <div className="font-medium text-sm text-stone-700 truncate max-w-[160px]" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{activeSong.title}</div>
                            <div className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                                {genreInfo?.label}
                                {lastTokenUsage && <span className="ml-1 opacity-50">· {lastTokenUsage}t</span>}
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setShowStructureGuide(!showStructureGuide)} className={`p-2 rounded-full transition-colors ${showStructureGuide ? 'bg-stone-200 text-stone-600' : 'text-stone-400 hover:bg-stone-200/50'}`} title="结构指南">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" /></svg>
                            </button>
                            <button onClick={handleComplete} className="p-2 rounded-full text-stone-500 hover:bg-stone-200/50 transition-colors" title="完成">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Collaborator bar */}
                    {collaborator && (
                        <div className="px-4 pb-2 flex items-center gap-2">
                            <img src={collaborator.avatar} className="w-6 h-6 rounded-full object-cover" />
                            <span className="text-[11px] text-stone-400">{collaborator.name} 共写中</span>
                        </div>
                    )}
                </div>

                {/* Structure Guide (collapsible) */}
                {showStructureGuide && (
                    <div className="bg-white border-b border-stone-200/80 p-4 z-10">
                        <h3 className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.15em] mb-2">歌曲结构</h3>
                        <div className="space-y-1.5">
                            {Object.entries(SECTION_LABELS).map(([key, info]) => (
                                <div key={key} className="flex items-center gap-2">
                                    <SectionBadge section={key} small />
                                    <span className="text-[10px] text-stone-400">{info.desc}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-stone-400 mt-2 border-t border-stone-100 pt-2">
                            常见结构：主歌 → 导歌 → 副歌 → 主歌 → 导歌 → 副歌 → 桥段 → 副歌
                        </p>
                    </div>
                )}

                {/* Timeline Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 no-scrollbar pb-48 relative z-10" ref={scrollRef} onClick={() => longPressLineId && setLongPressLineId(null)}>
                    {timeline.length === 0 && (
                        <div className="text-center py-20">
                            <div className="w-12 h-[1px] bg-stone-300 mx-auto mb-6" />
                            <p className="text-sm text-stone-500" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>写下第一句</p>
                            <p className="text-xs text-stone-400 mt-2">像在纸上慢慢落笔</p>
                            <div className="w-12 h-[1px] bg-stone-300 mx-auto mt-6" />
                        </div>
                    )}

                    {timeline.map(item => {
                        if (item.kind === 'line') {
                            const line = item.data;
                            const isUser = line.authorId === 'user';
                            const author = isUser ? null : characters.find(c => c.id === line.authorId);

                            // --- Draft line rendering ---
                            if (line.isDraft) {
                                return (
                                    <div key={line.id} className="group relative opacity-60 hover:opacity-80 transition-opacity">
                                        <div className="p-3 rounded-lg bg-stone-100/60 border border-stone-200 border-dashed">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <SectionBadge section={line.section} small />
                                                <span className="text-[9px] text-stone-400 tracking-wider">
                                                    {isUser ? '我' : author?.name}
                                                </span>
                                                <span className="text-[9px] bg-stone-200 text-stone-500 px-1.5 rounded">草稿</span>
                                                {line.annotation && (
                                                    <span className="text-[9px] bg-stone-100 text-stone-400 px-1.5 rounded">{line.annotation}</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-stone-400 leading-relaxed" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{line.content}</p>
                                            <div className="flex gap-2 mt-2 pt-1.5 border-t border-stone-200/60">
                                                <button
                                                    onClick={() => handleRestoreDraft(line.id)}
                                                    className="flex-1 py-1 text-[10px] text-stone-600 bg-white border border-stone-200 rounded hover:bg-stone-50 active:scale-[0.98] transition-all"
                                                >
                                                    恢复为歌词
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteLine(line.id)}
                                                    className="px-3 py-1 text-[10px] text-stone-400 hover:text-red-400 transition-colors"
                                                >
                                                    删除
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            if (editingLineId === line.id) {
                                return (
                                    <div key={line.id} className="bg-white p-3 rounded-lg border border-stone-300">
                                        <div className="flex items-center gap-2 mb-2">
                                            <SectionBadge section={line.section} small />
                                            <span className="text-[10px] text-stone-400">编辑中</span>
                                        </div>
                                        <textarea value={editLineContent} onChange={e => setEditLineContent(e.target.value)} className="w-full bg-stone-50 rounded p-2 text-sm resize-none focus:outline-none text-stone-700 border border-stone-200" rows={2} style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }} />
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={saveEditLine} className="px-3 py-1 bg-stone-700 text-stone-50 text-xs rounded font-medium">保存</button>
                                            <button onClick={() => setEditingLineId(null)} className="px-3 py-1 bg-stone-100 text-stone-500 text-xs rounded">取消</button>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={line.id} className="group relative"
                                    onTouchStart={(e) => handleLineTouchStart(e, line.id)}
                                    onTouchMove={handleLineTouchMove}
                                    onTouchEnd={handleLineTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); setLongPressLineId(line.id); }}
                                >
                                    <div className={`p-3 rounded-lg ${isUser ? 'bg-white border border-stone-200' : 'bg-amber-50/50 border border-amber-100/80'}`}>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <SectionBadge section={line.section} small />
                                            <span className="text-[9px] text-stone-400 tracking-wider">
                                                {isUser ? '我' : author?.name}
                                            </span>
                                            {line.annotation && (
                                                <span className="text-[9px] bg-stone-100 text-stone-500 px-1.5 rounded">{line.annotation}</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-stone-600 leading-relaxed" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{line.content}</p>
                                    </div>
                                    {/* Hover actions (desktop) */}
                                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                                        <button onClick={() => startEditLine(line)} className="p-1 bg-white rounded text-stone-400 hover:text-stone-600 border border-stone-200"><PencilSimple size={12} /></button>
                                        <button onClick={() => handleDeleteLine(line.id)} className="p-1 bg-white rounded text-stone-400 hover:text-red-400 text-[10px] border border-stone-200">×</button>
                                    </div>
                                    {/* Long press context menu (mobile) */}
                                    {longPressLineId === line.id && (
                                        <div className="absolute top-0 right-0 z-20 bg-white rounded-lg shadow-lg border border-stone-200 py-1 min-w-[100px]">
                                            <button onClick={() => { startEditLine(line); setLongPressLineId(null); }} className="w-full text-left px-3 py-2 text-xs text-stone-600 hover:bg-stone-50 active:bg-stone-100">编辑</button>
                                            <button onClick={() => { handleDeleteLine(line.id); setLongPressLineId(null); }} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 active:bg-red-100">删除</button>
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // Pending candidate line
                        if (item.kind === 'pending') {
                            const line = item.data;
                            const isUser = line.authorId === 'user';
                            const author = isUser ? null : characters.find(c => c.id === line.authorId);

                            return (
                                <div key={line.id} className="relative">
                                    <div className={`p-3 rounded-lg border-2 border-dashed ${isUser ? 'border-amber-300 bg-amber-50/30' : 'border-violet-300 bg-violet-50/30'}`}>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <SectionBadge section={line.section} small />
                                            <span className="text-[9px] text-stone-400 tracking-wider">
                                                {isUser ? '我' : author?.name}
                                            </span>
                                            <span className={`text-[9px] px-1.5 rounded ${isUser ? 'bg-amber-100 text-amber-600' : 'bg-violet-100 text-violet-600'}`}>
                                                {isUser ? '待确认' : '示范参考'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-stone-600 leading-relaxed" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>{line.content}</p>
                                        <div className="flex gap-2 mt-2.5 pt-2 border-t border-stone-200/60">
                                            <button
                                                onClick={() => handleAcceptPending(line.id)}
                                                className="flex-1 py-1.5 bg-stone-700 text-stone-50 text-xs rounded font-medium active:scale-[0.98] transition-transform"
                                            >
                                                收录
                                            </button>
                                            <button
                                                onClick={() => handleDismissPending(line.id)}
                                                className="flex-1 py-1.5 bg-stone-100 text-stone-500 text-xs rounded active:scale-[0.98] transition-transform"
                                            >
                                                不要
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Feedback Card
                        const feedback = item.data as { id: string; timestamp: number; reaction?: SongComment; details: SongComment[] };
                        const lead = feedback.reaction || feedback.details[0];
                        const commentAuthor = characters.find(c => c.id === lead?.authorId);
                        const isExpanded = !!expandedFeedbackIds[feedback.id];
                        const detailMeta: Record<string, { label: string }> = {
                            guidance: { label: '引导' },
                            teaching: { label: '拆解' },
                            suggestion: { label: '建议' },
                            praise: { label: '鼓励' },
                        };

                        return (
                            <div key={feedback.id} className="mx-2 group/fb relative">
                                <div className="rounded-lg bg-white border border-stone-200 p-3.5">
                                    <div className="flex items-start gap-2.5">
                                        {commentAuthor && <img src={commentAuthor.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" />}
                                        <div className="flex-1">
                                            <p className="text-[10px] text-stone-400 mb-1">{commentAuthor?.name || '搭档'} 说</p>
                                            <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{lead?.content || '我在这里，陪你一起把下一句写出来。'}</p>
                                        </div>
                                    </div>
                                    {/* Delete feedback button */}
                                    <button
                                        onClick={() => handleDeleteFeedback(feedback.id)}
                                        className="absolute top-2 right-2 opacity-0 group-hover/fb:opacity-100 p-1 bg-white rounded text-stone-400 hover:text-red-400 text-[10px] border border-stone-200 transition-opacity"
                                        title="删除这条反馈"
                                    >×</button>
                                    {feedback.details.length > 0 && (
                                        <div className="mt-3">
                                            <button onClick={() => toggleFeedback(feedback.id)} className="text-[10px] text-stone-400 border border-stone-200 px-2.5 py-0.5 rounded hover:bg-stone-50 transition-colors">
                                                {isExpanded ? '收起' : '展开细节'}
                                            </button>
                                            {isExpanded && (
                                                <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                                                    {feedback.details.map(detail => {
                                                        const meta = detailMeta[detail.type] || { label: '补充' };
                                                        return (
                                                            <div key={detail.id} className="bg-stone-50 rounded p-2.5">
                                                                <p className="text-[9px] text-stone-400 mb-1 uppercase tracking-wider">{meta.label}</p>
                                                                <p className="text-xs text-stone-500 leading-6 whitespace-pre-wrap">{detail.content}</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {isTyping && (
                        <div className="flex gap-2 items-center">
                            {collaborator && <img src={collaborator.avatar} className="w-6 h-6 rounded-full object-cover" />}
                            <div className="flex gap-1.5 py-2.5 px-4 bg-white rounded-lg border border-stone-200">
                                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" />
                                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '75ms' }} />
                                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="absolute bottom-0 w-full bg-[#F5F0E8]/95 backdrop-blur-sm border-t border-stone-200/80 z-30 pb-safe">
                    {/* Section Selector */}
                    <div className="flex gap-1.5 px-4 py-2 overflow-x-auto no-scrollbar border-b border-stone-200/60">
                        {Object.entries(SECTION_LABELS).map(([key, info]) => (
                            <button key={key} onClick={() => setCurrentSection(key)} className={`px-2.5 py-1 rounded text-[10px] whitespace-nowrap transition-all ${currentSection === key ? 'bg-stone-700 text-stone-50 font-medium' : 'text-stone-400 hover:bg-stone-200/50'}`}>
                                {info.label}
                            </button>
                        ))}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-2 px-4 py-1.5 border-b border-stone-200/60 items-center">
                        <button onClick={handleAskForHelp} disabled={isTyping} className="px-2.5 py-1 rounded text-[10px] text-stone-500 hover:bg-stone-200/50 disabled:opacity-40 transition-colors">
                            求灵感
                        </button>
                        <button
                            onClick={handleDiscuss}
                            disabled={isTyping}
                            className={`px-2.5 py-1 rounded text-[10px] disabled:opacity-40 transition-all ${inputText.trim() ? 'text-blue-600 bg-blue-50 hover:bg-blue-100 font-medium' : 'text-stone-500 hover:bg-stone-200/50'}`}
                            title={inputText.trim() ? '把输入框的内容作为讨论发送（不计入歌词）' : '开始讨论创作方向'}
                        >
                            {inputText.trim() ? '仅聊聊' : '聊聊'}
                        </button>
                        {inputText.trim() && (
                            <span className="text-[9px] text-stone-400 ml-auto pr-1">发送→歌词 · 仅聊聊→讨论</span>
                        )}
                    </div>

                    {/* Text Input */}
                    <div className="p-3 flex gap-2 items-end">
                        <textarea
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            placeholder="写下一句词，或直接点「聊聊」聊创作……"
                            className="flex-1 bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-stone-700 outline-none resize-none max-h-32 placeholder:text-stone-300 focus:border-stone-400 transition-colors"
                            rows={1}
                            style={{ minHeight: '44px', fontFamily: 'Georgia, "Noto Serif SC", serif' }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isTyping || !inputText.trim()}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-all shrink-0 ${inputText.trim() ? 'bg-stone-700 text-stone-50' : 'bg-stone-200 text-stone-400'}`}
                            title="发送为歌词"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
                        </button>
                    </div>
                </div>

                {/* Completion Preview Modal */}
                <Modal isOpen={showPreviewModal} title="完成创作" onClose={() => setShowPreviewModal(false)}>
                    <div className="space-y-4">
                        <div className="bg-stone-50 border border-stone-200 p-4 rounded-lg">
                            <h3 className="text-sm font-medium text-stone-600 mb-2">搭档评语</h3>
                            <p className="text-sm text-stone-500 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>
                                {isCompleting ? '正在思考……' : completionReview}
                            </p>
                        </div>
                        <p className="text-[11px] text-stone-400 leading-5">完成后歌曲将存为乐谱，同时在聊天中发送通知。你也可以随时把乐谱分享给其他角色。</p>
                        {!isCompleting && (
                            <button onClick={confirmComplete} className="w-full py-3 bg-stone-700 text-stone-50 font-medium rounded-lg text-sm">
                                完成并收录
                            </button>
                        )}
                    </div>
                </Modal>
            </div>
        );
    }


    return null;
};

export default SongwritingApp;
