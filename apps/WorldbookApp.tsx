import React, { useMemo, useState } from 'react';
import {
    BookOpen,
    Books,
    CaretDown,
    DiamondsFour,
    FolderOpen,
    Plus,
} from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import type { Worldbook } from '../types';
import Modal from '../components/os/Modal';
import { SHELL_APP_HEADER_CONTENT_TOP, SHELL_APP_HEADER_HEIGHT } from '../components/shell/shellLayout';
import {
    buildWorldbookGroupIndex,
    isBuiltInWorldbook,
    normalizeWorldbookCategory,
} from '../utils/worldbookGroups';

const BUILT_IN_ROOT_KEY = 'built-in-root';
const builtInCategoryKey = (category: string) => `built-in:${category}`;
const customCategoryKey = (category: string) => `custom:${category}`;

const WorldbookApp: React.FC = () => {
    const {
        closeApp,
        worldbooks,
        addWorldbook,
        updateWorldbook,
        deleteWorldbook,
        addToast,
    } = useOS();

    const [isEditing, setIsEditing] = useState(false);
    const [editingBook, setEditingBook] = useState<Worldbook | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
    const [previewBookId, setPreviewBookId] = useState<string | null>(null);
    const [tempTitle, setTempTitle] = useState('');
    const [tempContent, setTempContent] = useState('');
    const [tempCategory, setTempCategory] = useState('');
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const groupIndex = useMemo(() => buildWorldbookGroupIndex(worldbooks), [worldbooks]);
    const customCategoryNames = useMemo(
        () => groupIndex.customGroups.map(group => group.category),
        [groupIndex.customGroups],
    );

    const toggleSection = (key: string) => {
        setExpandedSections(previous => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleCreate = () => {
        setEditingBook(null);
        setTempTitle('');
        setTempContent('');
        setTempCategory('');
        setIsCreatingCategory(customCategoryNames.length === 0);
        setIsEditing(true);
    };

    const handleEdit = (book: Worldbook) => {
        if (isBuiltInWorldbook(book)) {
            setPreviewBookId(book.id);
            addToast('内置世界书只读，可查看内容', 'info');
            return;
        }
        setEditingBook(book);
        setTempTitle(book.title);
        setTempContent(book.content);
        setTempCategory(normalizeWorldbookCategory(book.category));
        setIsCreatingCategory(false);
        setIsEditing(true);
    };

    const selectCategory = (category: string) => {
        setTempCategory(category);
        setIsCreatingCategory(false);
    };

    const startNewCategory = () => {
        setTempCategory('');
        setIsCreatingCategory(true);
    };

    const handleSave = async () => {
        const title = tempTitle.trim();
        if (!title) {
            addToast('请输入标题', 'error');
            return;
        }

        const category = normalizeWorldbookCategory(tempCategory);
        if (editingBook) {
            if (isBuiltInWorldbook(editingBook)) {
                addToast('内置世界书只读，不能编辑', 'info');
                setIsEditing(false);
                return;
            }
            await updateWorldbook(editingBook.id, {
                title,
                content: tempContent,
                category,
            });
            addToast('已保存，并同步到相关角色', 'success');
        } else {
            const now = Date.now();
            await addWorldbook({
                id: `wb-${now}`,
                title,
                content: tempContent,
                category,
                createdAt: now,
                updatedAt: now,
            });
            addToast('新世界书已创建', 'success');
        }
        setExpandedSections(previous => new Set(previous).add(customCategoryKey(category)));
        setIsEditing(false);
    };

    const requestDelete = (event: React.MouseEvent, book: Worldbook) => {
        event.stopPropagation();
        if (isBuiltInWorldbook(book)) {
            addToast('内置世界书只读，不能删除', 'info');
            return;
        }
        setEditingBook(book);
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        if (!editingBook) return;
        await deleteWorldbook(editingBook.id);
        setShowDeleteConfirm(false);
        setEditingBook(null);
        setIsEditing(false);
    };

    const togglePreview = (id: string) => {
        setPreviewBookId(previous => previous === id ? null : id);
    };

    const renderBook = (book: Worldbook) => {
        const builtIn = isBuiltInWorldbook(book);
        return (
            <div
                key={book.id}
                data-worldbook-id={book.id}
                className="group relative overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-sm backdrop-blur-md transition-all hover:shadow-md"
            >
                <div
                    onClick={() => togglePreview(book.id)}
                    className="flex cursor-pointer items-start justify-between gap-3 p-4"
                >
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 rounded-full ${previewBookId === book.id ? 'bg-indigo-400' : 'bg-slate-300'}`} />
                            <h4 className={`truncate text-sm font-bold transition-colors ${previewBookId === book.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {book.title}
                            </h4>
                        </div>
                        <div className="pl-3.5 text-[10px] text-slate-400">
                            {builtIn ? '系统只读 · 点击查看内容' : `更新于 ${new Date(book.updatedAt).toLocaleDateString()}`}
                        </div>
                    </div>

                    {builtIn ? (
                        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-500">内置</span>
                    ) : (
                        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            <button
                                type="button"
                                onClick={event => {
                                    event.stopPropagation();
                                    handleEdit(book);
                                }}
                                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-indigo-600"
                                aria-label={`编辑 ${book.title}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                            </button>
                            <button
                                type="button"
                                onClick={event => requestDelete(event, book)}
                                className="rounded-full p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                                aria-label={`删除 ${book.title}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                            </button>
                        </div>
                    )}
                </div>

                {previewBookId === book.id && (
                    <div className="animate-fade-in px-4 pb-4 pt-0">
                        <div className="mb-3 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                        <p className="whitespace-pre-wrap text-xs font-light leading-relaxed text-slate-600 selection:bg-indigo-100">
                            {book.content || <span className="italic text-slate-400">暂无内容……</span>}
                        </p>
                    </div>
                )}
            </div>
        );
    };

    if (isEditing) {
        return (
            <div className="flex h-full w-full animate-fade-in flex-col bg-slate-50 font-sans">
                <div
                    className="z-20 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md"
                    style={{ height: SHELL_APP_HEADER_HEIGHT, paddingTop: SHELL_APP_HEADER_CONTENT_TOP }}
                >
                    <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1 text-sm font-bold text-slate-500">取消</button>
                    <span className="font-bold text-slate-800">{editingBook ? '编辑条目' : '新建条目'}</span>
                    <button type="button" onClick={() => void handleSave()} className="rounded-full bg-indigo-500 px-4 py-1.5 text-xs font-bold text-white shadow-md transition-transform active:scale-95">保存</button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">标题</label>
                        <input
                            value={tempTitle}
                            onChange={event => setTempTitle(event.target.value)}
                            placeholder="例如：魔法体系、公司背景……"
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg font-bold text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">我的分组</label>
                            <span className="text-[10px] text-slate-400">点一下就能沿用，不用重复输入</span>
                        </div>
                        <div className="flex flex-wrap gap-2" data-worldbook-category-options>
                            {customCategoryNames.map(category => (
                                <button
                                    type="button"
                                    key={category}
                                    onClick={() => selectCategory(category)}
                                    className={`rounded-full border px-3 py-2 text-xs font-bold transition-all ${!isCreatingCategory && tempCategory === category ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500'}`}
                                >
                                    {category}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={startNewCategory}
                                className={`flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-bold transition-all ${isCreatingCategory ? 'border-violet-400 bg-violet-50 text-violet-600' : 'border-dashed border-slate-300 bg-white/70 text-slate-500'}`}
                            >
                                <Plus size={13} weight="bold" /> 新建分组
                            </button>
                        </div>
                        {isCreatingCategory && (
                            <input
                                autoFocus
                                value={tempCategory}
                                onChange={event => setTempCategory(event.target.value)}
                                placeholder="给这个新分组起个名字"
                                className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                            />
                        )}
                        {!isCreatingCategory && !tempCategory && (
                            <p className="mt-2 text-[10px] text-slate-400">未选择时会放进“未分类设定”。</p>
                        )}
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">设定内容</label>
                        <textarea
                            value={tempContent}
                            onChange={event => setTempContent(event.target.value)}
                            placeholder="在这里写设定内容，支持 Markdown……"
                            className="h-80 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-relaxed text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>
                </div>
            </div>
        );
    }

    const builtInRootExpanded = expandedSections.has(BUILT_IN_ROOT_KEY);

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-slate-100 font-sans">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50 via-slate-100 to-violet-50" />
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-200/20 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 z-10 h-32 w-full bg-gradient-to-t from-white/80 to-transparent" />

            <div
                className="sticky top-0 z-20 flex shrink-0 items-center border-b border-white/40 bg-white/70 px-6 shadow-sm backdrop-blur-xl"
                style={{ height: SHELL_APP_HEADER_HEIGHT, paddingTop: SHELL_APP_HEADER_CONTENT_TOP }}
            >
                <div className="flex w-full items-center justify-between">
                    <button type="button" onClick={closeApp} className="-ml-2 rounded-full p-2 transition-transform active:scale-90">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="flex items-center gap-2 text-lg font-bold tracking-wide text-slate-700">
                        <DiamondsFour size={18} className="text-indigo-500" /> 世界书
                    </span>
                    <button type="button" onClick={handleCreate} aria-label="新建世界书" className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-200 transition-transform active:scale-90">
                        <Plus size={19} weight="bold" />
                    </button>
                </div>
            </div>

            <div className="relative z-0 flex-1 space-y-5 overflow-y-auto p-5 pb-24 no-scrollbar">
                {groupIndex.builtInCount > 0 && (
                    <section className="overflow-hidden rounded-[26px] border border-indigo-100/80 bg-white/55 shadow-sm backdrop-blur-xl" data-worldbook-built-in-drawer>
                        <button
                            type="button"
                            onClick={() => toggleSection(BUILT_IN_ROOT_KEY)}
                            className="flex w-full items-center gap-3 px-4 py-4 text-left"
                            aria-expanded={builtInRootExpanded}
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100/70 text-indigo-500">
                                <Books size={21} weight="duotone" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold text-slate-700">内置世界书</h2>
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-500">{groupIndex.builtInCount} 条</span>
                                </div>
                                <p className="mt-1 text-[10px] text-slate-400">系统资料默认收起，只读，不占满你的书架</p>
                            </div>
                            <CaretDown className={`shrink-0 text-slate-400 transition-transform ${builtInRootExpanded ? 'rotate-180' : ''}`} size={18} weight="bold" />
                        </button>

                        {builtInRootExpanded && (
                            <div className="space-y-3 border-t border-indigo-100/60 px-3 pb-3 pt-3">
                                {groupIndex.builtInGroups.map(group => {
                                    const key = builtInCategoryKey(group.category);
                                    const expanded = expandedSections.has(key);
                                    return (
                                        <div key={group.category} className="overflow-hidden rounded-2xl border border-white/80 bg-white/55">
                                            <button
                                                type="button"
                                                onClick={() => toggleSection(key)}
                                                className="flex w-full items-center gap-2 px-3 py-3 text-left"
                                                aria-expanded={expanded}
                                            >
                                                <CaretDown className={`shrink-0 text-indigo-300 transition-transform ${expanded ? 'rotate-180' : ''}`} size={14} weight="bold" />
                                                <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-600">{group.category}</span>
                                                <span className="text-[9px] text-slate-400">{group.books.length}</span>
                                            </button>
                                            {expanded && <div className="space-y-3 px-2 pb-2">{group.books.map(renderBook)}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                <section>
                    <div className="mb-3 flex items-end justify-between gap-3 px-1">
                        <div>
                            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700"><FolderOpen size={18} className="text-violet-500" weight="duotone" /> 我的分组</h2>
                            <p className="mt-1 text-[10px] text-slate-400">新建条目时可以直接选择已有分组</p>
                        </div>
                        <span className="text-[10px] text-slate-400">{groupIndex.customCount} 条</span>
                    </div>

                    {groupIndex.customGroups.length > 0 ? (
                        <div className="space-y-3" data-worldbook-custom-groups>
                            {groupIndex.customGroups.map(group => {
                                const key = customCategoryKey(group.category);
                                const expanded = expandedSections.has(key);
                                return (
                                    <div key={group.category} className="overflow-hidden rounded-[24px] border border-white/70 bg-white/48 shadow-sm backdrop-blur-md">
                                        <button
                                            type="button"
                                            onClick={() => toggleSection(key)}
                                            className="flex w-full items-center gap-3 px-4 py-4 text-left"
                                            aria-expanded={expanded}
                                        >
                                            <CaretDown className={`shrink-0 text-violet-400 transition-transform ${expanded ? 'rotate-180' : ''}`} size={16} weight="bold" />
                                            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-600">{group.category}</span>
                                            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold text-slate-400">{group.books.length}</span>
                                        </button>
                                        {expanded && <div className="space-y-3 border-t border-white/70 px-3 pb-3 pt-3">{group.books.map(renderBook)}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCreate}
                            className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-[26px] border border-dashed border-violet-200 bg-white/45 px-6 text-center text-slate-400"
                        >
                            <BookOpen size={38} className="text-violet-300" weight="duotone" />
                            <span className="text-xs font-bold text-slate-500">还没有自己的世界书</span>
                            <span className="text-[10px] leading-5">创建第一条时，可以顺手建立你的第一个分组。</span>
                        </button>
                    )}
                </section>
            </div>

            <Modal
                isOpen={showDeleteConfirm}
                title="删除这条世界书？"
                onClose={() => setShowDeleteConfirm(false)}
                footer={(
                    <div className="flex w-full gap-3">
                        <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-600">先留着</button>
                        <button type="button" onClick={() => void confirmDelete()} className="flex-1 rounded-2xl bg-red-500 py-3 font-bold text-white shadow-lg shadow-red-200">确认删除</button>
                    </div>
                )}
            >
                <div className="py-4 text-center text-sm text-slate-600">
                    删除 <span className="font-bold text-slate-900">“{editingBook?.title}”</span> 后，会同步从已挂载角色中移除。
                </div>
            </Modal>
        </div>
    );
};

export default WorldbookApp;
