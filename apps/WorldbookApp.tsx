import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Books,
  CaretDown,
  ClockCounterClockwise,
  DotsSixVertical,
  Eye,
  EyeSlash,
  FolderOpen,
  PencilSimple,
  Plus,
  Copy,
  PushPin,
  Sparkle,
  Trash,
  UsersThree,
} from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import type { Worldbook, WorldbookGroupAssignment, WorldGrowthCandidate } from '../types';
import AppHeader, { AppHeaderAddButton, AppHeaderIconButton } from '../components/shell/AppHeader';
import Modal from '../components/os/Modal';
import WorldbookEntryEditor, {
  type WorldbookEditableDraft,
} from '../components/worldbook/WorldbookEntryEditor';
import WorldbookImportScreen from '../components/worldbook/WorldbookImportScreen';
import WorldbookSmartInputScreen from '../components/worldbook/WorldbookSmartInputScreen';
import WorldGrowthReviewScreen from '../components/worldbook/WorldGrowthReviewScreen';
import WorldbookVersionHistoryScreen from '../components/worldbook/WorldbookVersionHistoryScreen';
import WorldbookGroupPicker from '../components/worldbook/WorldbookGroupPicker';
import {
  buildBuiltInWorldbookLibraryLayout,
  buildWorldbookGroupIndex,
  createWorldbookGroupAssignment,
  isBuiltInWorldbook,
  normalizeWorldbookCategory,
  worldbookGroupDisplayName,
  worldbookGroupOwnerLabel,
} from '../utils/worldbookGroups';
import {
  isWorldbookVisibleInPlayerLibrary,
  resolveWorldbookSupplementLinks,
  splitWorldbookWorkspace,
  worldbookMountedCharacterNames,
  worldbookMountCount,
  worldGrowthBatchKey,
  worldGrowthSourceLabel,
} from '../utils/worldbookPlayerView';
import { resolveAiTaskRoute } from '../utils/aiRuntime';

const BUILT_IN_ROOT_KEY = 'built-in-root';
const UNIVERSAL_ROOT_KEY = 'universal-root';
const builtInCategoryKey = (category: string) => `built-in:${category}`;
const builtInCharacterKey = (characterId: string) => `built-in-character:${characterId}`;
const builtInCharacterLaneKey = (characterId: string, laneKind: string) => `built-in-character:${characterId}:${laneKind}`;
const customCategoryKey = (category: string) => `custom:${category}`;

const builtInBookDisplayTitle = (
  book: Worldbook,
  characterName?: string,
  laneKind?: string,
) => {
  if (!characterName) return book.title;
  if (book.title === `${characterName}剧情增强`) return '剧情资料总览';
  let title = book.title;
  const characterPrefix = `${characterName}·`;
  if (title.startsWith(characterPrefix)) title = title.slice(characterPrefix.length);
  if (laneKind === 'expansion_play' && title.startsWith('拓展玩法·')) {
    title = title.slice('拓展玩法·'.length);
  }
  return title;
};

type EditorState =
  | { kind: 'create' }
  | { kind: 'edit'; book: Worldbook }
  | { kind: 'supplement'; builtIn: Worldbook };

type ArchivedDeleteTarget = {
  kind: 'entry' | 'group';
  entries: Worldbook[];
  groupId?: string;
  label: string;
};

const WorldbookApp: React.FC = () => {
  const {
    closeApp,
    worldbooks,
    worldbookGroups,
    theme,
    updateTheme,
    characters,
    activeCharacterId,
    addWorldbook,
    updateWorldbookGroupLayout,
    reassignWorldbookGroup,
    setUniversalWorldbookGroupCharacters,
    addImportedWorldbooks,
    addPlayerWorldbooks,
    addWorldbookSupplement,
    copyWorldbookToGroup,
    updateWorldbook,
    archiveWorldbook,
    archiveWorldbookGroup,
    assignUnassignedWorldbooks,
    archiveUnassignedWorldbooks,
    deleteArchivedWorldbooks,
    restoreWorldbookGroup,
    loadWorldbookWorkspace,
    restoreWorldbookVersion,
    acceptWorldGrowthCandidateReview,
    setWorldGrowthCandidateDisposition,
    apiConfig,
    apiPresets,
    aiRuntimeRouting,
    addToast,
  } = useOS();

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showSmartInput, setShowSmartInput] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const initializedCustomCategories = useRef(new Set<string>());
  const [previewBookId, setPreviewBookId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Worldbook | null>(null);
  const [archiveGroupTarget, setArchiveGroupTarget] = useState<WorldbookGroupAssignment | null>(null);
  const [unassignedRepair, setUnassignedRepair] = useState<{
    entryIds: string[];
    group: WorldbookGroupAssignment;
  } | null>(null);
  const [unassignedArchiveIds, setUnassignedArchiveIds] = useState<string[] | null>(null);
  const [archivedEntries, setArchivedEntries] = useState<Worldbook[]>([]);
  const [growthCandidates, setGrowthCandidates] = useState<WorldGrowthCandidate[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [expandedArchivedGroupIds, setExpandedArchivedGroupIds] = useState<Set<string>>(() => new Set());
  const [archivedDeleteTarget, setArchivedDeleteTarget] = useState<ArchivedDeleteTarget | null>(null);
  const [historyEntry, setHistoryEntry] = useState<Worldbook | null>(null);
  const [selectedGrowthBatchKey, setSelectedGrowthBatchKey] = useState<string | null>(null);
  const [copyTarget, setCopyTarget] = useState<Worldbook | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null);
  const [managedGroup, setManagedGroup] = useState<WorldbookGroupAssignment | null>(null);
  const [managedCharacterIds, setManagedCharacterIds] = useState<string[]>([]);
  const [savingManagedGroup, setSavingManagedGroup] = useState(false);
  const dragOrderRef = useRef<string[] | null>(null);

  const visiblePublished = useMemo(
    () => worldbooks.filter(isWorldbookVisibleInPlayerLibrary),
    [worldbooks],
  );
  const archiveGroupHasLiveEntries = Boolean(archiveGroupTarget && worldbooks.some(entry => (
    !isBuiltInWorldbook(entry) && entry.group?.id === archiveGroupTarget.id
  )));
  const groupIndex = useMemo(
    () => buildWorldbookGroupIndex(visiblePublished, worldbookGroups),
    [visiblePublished, worldbookGroups],
  );
  const builtInLibraryLayout = useMemo(
    () => buildBuiltInWorldbookLibraryLayout(groupIndex.builtInGroups, characters),
    [characters, groupIndex.builtInGroups],
  );
  const groupOptions = worldbookGroups;
  const smartInputRoute = useMemo(() => resolveAiTaskRoute({
    taskId: 'worldbook_input_analysis',
    dialogueConfig: apiConfig,
    apiPresets,
    routing: aiRuntimeRouting,
  }), [aiRuntimeRouting, apiConfig, apiPresets]);
  const defaultGroup = useMemo(() => {
    const activeOwned = groupOptions.find(group => (
      group.owner.kind === 'character' && group.owner.charId === activeCharacterId
    ));
    if (activeOwned) return activeOwned;
    const activeCharacter = characters.find(character => character.id === activeCharacterId) || characters[0];
    if (activeCharacter) {
      return createWorldbookGroupAssignment({
        name: activeCharacter.name,
        owner: { kind: 'character', charId: activeCharacter.id },
      });
    }
    return createWorldbookGroupAssignment({ name: '新分组', owner: { kind: 'universal' } });
  }, [activeCharacterId, characters, groupOptions]);
  const [copyGroup, setCopyGroup] = useState<WorldbookGroupAssignment | null>(null);
  const supplementLinksByEntryId = useMemo(() => new Map(
    visiblePublished
      .filter(book => !isBuiltInWorldbook(book))
      .map(book => [book.id, resolveWorldbookSupplementLinks(book, visiblePublished)]),
  ), [visiblePublished]);
  const supplementsByBuiltInId = useMemo(() => {
    const result = new Map<string, Worldbook[]>();
    visiblePublished
      .filter(book => !isBuiltInWorldbook(book))
      .forEach(book => {
        const link = supplementLinksByEntryId.get(book.id);
        if (link?.status !== 'linked') return;
        link.parents.forEach(parent => {
          result.set(parent.id, [...(result.get(parent.id) || []), book]);
        });
      });
    return result;
  }, [supplementLinksByEntryId, visiblePublished]);
  const growthBatches = useMemo(() => {
    const byKey = new Map<string, WorldGrowthCandidate[]>();
    growthCandidates.forEach(candidate => {
      const key = worldGrowthBatchKey(candidate);
      byKey.set(key, [...(byKey.get(key) || []), candidate]);
    });
    return [...byKey.entries()].map(([key, candidates]) => ({ key, candidates }));
  }, [growthCandidates]);
  const archivedLibrary = useMemo(() => {
    const grouped = new Map<string, { group: WorldbookGroupAssignment; entries: Worldbook[] }>();
    const loose: Worldbook[] = [];
    archivedEntries.forEach(entry => {
      const group = entry.group;
      if (!group) {
        loose.push(entry);
        return;
      }
      const current = grouped.get(group.id);
      if (current) current.entries.push(entry);
      else grouped.set(group.id, { group, entries: [entry] });
    });
    return { groups: [...grouped.values()], loose };
  }, [archivedEntries]);
  const selectedGrowthCandidates = useMemo(
    () => growthBatches.find(batch => batch.key === selectedGrowthBatchKey)?.candidates || [],
    [growthBatches, selectedGrowthBatchKey],
  );

  const refreshWorkspace = useCallback(async () => {
    const snapshot = await loadWorldbookWorkspace();
    const visible = splitWorldbookWorkspace(snapshot);
    setArchivedEntries(visible.archived);
    setGrowthCandidates(visible.growthCandidates);
  }, [loadWorldbookWorkspace]);

  useEffect(() => {
    void refreshWorkspace().catch(error => {
      console.warn('Worldbook workspace refresh failed', error);
      addToast('世界书没有刷新完整，请重新打开再试', 'error');
    });
  }, [addToast, refreshWorkspace]);

  useEffect(() => {
    const newKeys = groupIndex.customGroups
      .map(group => group.id)
      .filter(groupId => !initializedCustomCategories.current.has(groupId))
      .map(customCategoryKey);
    if (!newKeys.length) return;
    groupIndex.customGroups.forEach(group => initializedCustomCategories.current.add(group.id));
    setExpandedSections(previous => new Set([...previous, ...newKeys]));
  }, [groupIndex.customGroups]);

  useEffect(() => {
    if (selectedGrowthBatchKey && !selectedGrowthCandidates.length) {
      setSelectedGrowthBatchKey(null);
    }
  }, [selectedGrowthBatchKey, selectedGrowthCandidates.length]);

  const toggleSection = (key: string) => {
    setExpandedSections(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const orderedCustomGroups = useMemo(() => {
    if (!dragOrderIds) return groupIndex.customGroups;
    const byId = new Map(groupIndex.customGroups.map(group => [group.id, group]));
    return [
      ...dragOrderIds.map(id => byId.get(id)).filter(Boolean),
      ...groupIndex.customGroups.filter(group => !dragOrderIds.includes(group.id)),
    ] as typeof groupIndex.customGroups;
  }, [dragOrderIds, groupIndex.customGroups]);
  const orderedUniversalGroups = useMemo(
    () => orderedCustomGroups.filter(group => group.owner?.kind === 'universal'),
    [orderedCustomGroups],
  );
  const orderedCharacterGroups = useMemo(
    () => orderedCustomGroups.filter(group => group.owner?.kind !== 'universal'),
    [orderedCustomGroups],
  );

  const openGroupManagement = (group: WorldbookGroupAssignment) => {
    setManagedGroup(group);
    setManagedCharacterIds(group.owner.kind === 'universal'
      ? characters
        .filter(character => character.mountedWorldbookGroupIds?.includes(group.id))
        .map(character => character.id)
      : [group.owner.charId]);
  };

  const saveGroupManagement = async () => {
    if (!managedGroup || savingManagedGroup) return;
    setSavingManagedGroup(true);
    try {
      if (managedGroup.owner.kind === 'universal') {
        await setUniversalWorldbookGroupCharacters(managedGroup.id, managedCharacterIds);
        addToast('这组通用资料的使用对象已更新', 'success');
      } else {
        const nextOwnerCharId = managedCharacterIds[0];
        if (!nextOwnerCharId) throw new Error('请选择这组资料属于哪位角色');
        if (nextOwnerCharId !== managedGroup.owner.charId) {
          await reassignWorldbookGroup(managedGroup.id, nextOwnerCharId);
          addToast('这组世界书已经换到新的角色名下', 'success');
        }
      }
      setManagedGroup(null);
      await refreshWorkspace();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '这组资料没有保存成功', 'error');
    } finally {
      setSavingManagedGroup(false);
    }
  };

  const beginGroupDrag = (event: React.PointerEvent<HTMLButtonElement>, groupId: string) => {
    if (!worldbookGroups.some(group => group.id === groupId)) return;
    const order = orderedCustomGroups.map(group => group.id);
    dragOrderRef.current = order;
    setDragOrderIds(order);
    setDraggedGroupId(groupId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveGroupDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggedGroupId || !dragOrderRef.current) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-worldbook-group-id]')
      ?.dataset.worldbookGroupId;
    if (!target || target === draggedGroupId) return;
    const current = dragOrderRef.current;
    const from = current.indexOf(draggedGroupId);
    const to = current.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = [...current];
    next.splice(to, 0, next.splice(from, 1)[0]);
    dragOrderRef.current = next;
    setDragOrderIds(next);
  };

  const finishGroupDrag = async () => {
    const order = dragOrderRef.current;
    dragOrderRef.current = null;
    setDraggedGroupId(null);
    if (!order) return;
    const byId = new Map(worldbookGroups.map(group => [group.id, group]));
    const updates = order
      .flatMap((id, index): WorldbookGroupAssignment[] => {
        const group = byId.get(id);
        return group ? [{ ...group, sortOrder: index }] : [];
      });
    try {
      await updateWorldbookGroupLayout(updates);
    } catch (error) {
      setDragOrderIds(null);
      addToast(error instanceof Error ? error.message : '分组顺序没有保存成功', 'error');
    }
  };

  const togglePinnedGroup = async (assignment: WorldbookGroupAssignment) => {
    try {
      await updateWorldbookGroupLayout([{ ...assignment, pinned: !assignment.pinned }]);
      setDragOrderIds(null);
    } catch (error) {
      addToast(error instanceof Error ? error.message : '没有保存置顶状态', 'error');
    }
  };

  const openCreate = () => {
    setShowAddMenu(false);
    setEditorState({ kind: 'create' });
  };

  const openImport = () => {
    setShowAddMenu(false);
    setShowImport(true);
  };

  const openSmartInput = () => {
    setShowAddMenu(false);
    setShowSmartInput(true);
  };

  const editorInitial = (state: EditorState): WorldbookEditableDraft => {
    if (state.kind === 'edit') {
      return {
        title: state.book.title,
        content: state.book.content,
        category: normalizeWorldbookCategory(state.book.category),
        group: state.book.group || defaultGroup,
      };
    }
    if (state.kind === 'supplement') {
      return {
        title: `补充：${state.builtIn.title}`,
        content: '',
        category: normalizeWorldbookCategory(state.builtIn.category),
        group: defaultGroup,
      };
    }
    return { title: '', content: '', category: defaultGroup.name, group: defaultGroup };
  };

  const saveEditor = async (draft: WorldbookEditableDraft) => {
    if (!editorState) return;
    if (editorState.kind === 'edit') {
      await updateWorldbook(editorState.book.id, draft);
      addToast('已保存，并同步到正在使用它的角色', 'success');
    } else if (editorState.kind === 'supplement') {
      await addWorldbookSupplement(editorState.builtIn.id, draft, draft.group);
      addToast('补充已经放进我的世界书', 'success');
    } else {
      const now = Date.now();
      await addWorldbook({
        id: `wb-${now}`,
        ...draft,
        createdAt: now,
        updatedAt: now,
      }, draft.group);
      addToast('新世界书已创建', 'success');
    }
    setExpandedSections(previous => new Set(previous).add(customCategoryKey(draft.group.id)));
    setEditorState(null);
    await refreshWorkspace();
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveWorldbook(archiveTarget.id);
      setArchiveTarget(null);
      setPreviewBookId(null);
      await refreshWorkspace();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '没有归档成功', 'error');
    }
  };

  const confirmArchiveGroup = async () => {
    if (!archiveGroupTarget) return;
    try {
      await archiveWorldbookGroup(archiveGroupTarget.id);
      setArchiveGroupTarget(null);
      setPreviewBookId(null);
      await refreshWorkspace();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '没有归档成功', 'error');
    }
  };

  const confirmUnassignedRepair = async () => {
    if (!unassignedRepair) return;
    try {
      await assignUnassignedWorldbooks(unassignedRepair.entryIds, unassignedRepair.group);
      setUnassignedRepair(null);
      await refreshWorkspace();
      addToast(`已将 ${unassignedRepair.entryIds.length} 条资料归入“${unassignedRepair.group.name}”`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '待归组内容没有整理成功', 'error');
    }
  };

  const confirmUnassignedArchive = async () => {
    if (!unassignedArchiveIds) return;
    try {
      await archiveUnassignedWorldbooks(unassignedArchiveIds);
      setUnassignedArchiveIds(null);
      await refreshWorkspace();
      addToast(`已归档 ${unassignedArchiveIds.length} 条待归组资料`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '待归组内容没有归档成功', 'error');
    }
  };

  const restoreVersion = async (entry: Worldbook, revisionId: string) => {
    await restoreWorldbookVersion(entry.id, revisionId);
    await refreshWorkspace();
    setHistoryEntry(null);
    addToast('已恢复为新版本', 'success');
  };

  const restoreArchivedGroup = async (groupId: string) => {
    try {
      await restoreWorldbookGroup(groupId);
      await refreshWorkspace();
      setExpandedArchivedGroupIds(previous => {
        const next = new Set(previous);
        next.delete(groupId);
        return next;
      });
    } catch (error) {
      addToast(error instanceof Error ? error.message : '这组世界书没有恢复成功', 'error');
    }
  };

  const confirmArchivedDeletion = async () => {
    if (!archivedDeleteTarget) return;
    try {
      await deleteArchivedWorldbooks(
        archivedDeleteTarget.entries.map(entry => entry.id),
        archivedDeleteTarget.groupId,
      );
      setArchivedDeleteTarget(null);
      await refreshWorkspace();
      addToast(
        archivedDeleteTarget.kind === 'group'
          ? `已彻底删除“${archivedDeleteTarget.label}”的归档资料`
          : `已彻底删除“${archivedDeleteTarget.label}”`,
        'success',
      );
    } catch (error) {
      addToast(error instanceof Error ? error.message : '归档资料没有彻底删除成功', 'error');
    }
  };

  const renderBook = (
    book: Worldbook,
    options?: { characterName?: string; laneKind?: string },
  ) => {
    const builtIn = isBuiltInWorldbook(book);
    const mountedCharacterNames = builtIn ? [] : worldbookMountedCharacterNames(book, characters);
    const mountLabel = mountedCharacterNames.length === 0
      ? '尚未给角色使用'
      : mountedCharacterNames.length === 1
        ? `${mountedCharacterNames[0]}正在使用`
        : `${mountedCharacterNames.slice(0, 2).join('、')}${mountedCharacterNames.length > 2 ? `等 ${mountedCharacterNames.length} 位` : ''}正在使用`;
    const ownerLabel = builtIn ? '' : worldbookGroupOwnerLabel(book.group, characters);
    const supplementLink = builtIn ? undefined : supplementLinksByEntryId.get(book.id);
    const relatedSupplements = builtIn ? supplementsByBuiltInId.get(book.id) || [] : [];
    const expanded = previewBookId === book.id;
    return (
      <div
        key={book.id}
        data-worldbook-id={book.id}
        className="group overflow-hidden rounded-[18px] border border-white/70 bg-white/75 shadow-sm backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => setPreviewBookId(previous => previous === book.id ? null : book.id)}
          className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
          aria-expanded={expanded}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${expanded ? 'bg-indigo-400' : 'bg-slate-300'}`} />
              <h4 className={`truncate text-[13px] font-semibold leading-5 ${expanded ? 'text-indigo-700' : 'text-slate-700'}`}>
                {builtInBookDisplayTitle(book, options?.characterName, options?.laneKind)}
              </h4>
            </div>
            <div className="mt-1 pl-3.5 text-[10px] text-slate-400">
              {builtIn
                ? '系统只读 · 点击查看内容'
                : `${ownerLabel} · ${mountLabel}`}
            </div>
            {supplementLink?.status === 'linked' && (
              <div className="mt-1 truncate pl-3.5 text-[10px] font-medium text-indigo-500" data-worldbook-supplement-parent>
                补充自：{supplementLink.parents.map(parent => parent.title).join('、')}
              </div>
            )}
            {supplementLink?.status === 'needs_repair' && (
              <div className="mt-1 pl-3.5 text-[10px] font-medium text-amber-600" data-worldbook-supplement-needs-repair>
                补充关系待修复
              </div>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${builtIn ? 'bg-indigo-50 text-indigo-500' : 'bg-slate-50 text-slate-400'}`}>
            {builtIn ? '内置' : `v${book.revisionSnapshots?.length || 1}`}
          </span>
        </button>

        {expanded && (
          <div className="space-y-3 px-3 pb-3">
            <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <p className="whitespace-pre-wrap text-[13px] font-normal leading-6 text-slate-600">
              {book.content || <span className="italic text-slate-400">暂无内容……</span>}
            </p>
            {builtIn && book.activationHint && (
              <div className="rounded-xl bg-indigo-50/70 px-3 py-2.5" data-worldbook-activation-hint>
                <div className="text-[10px] font-semibold text-indigo-500">适合什么时候启用</div>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{book.activationHint}</p>
              </div>
            )}
            {builtIn ? (
              <div className="space-y-3">
                {relatedSupplements.length > 0 && (
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-3" data-worldbook-related-supplements>
                    <div className="text-[10px] font-bold text-indigo-500">我的关联补充</div>
                    <div className="mt-2 space-y-1.5">
                      {relatedSupplements.map(supplement => (
                        <div key={supplement.id} className="truncate text-xs text-slate-600">{supplement.title}</div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEditorState({ kind: 'supplement', builtIn: book })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 py-2.5 text-[11px] font-semibold text-indigo-600"
                >
                  <Plus size={15} weight="bold" /> 添加我的补充
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCopyTarget(book);
                    setCopyGroup(defaultGroup);
                  }}
                  className="flex items-center justify-center gap-1 rounded-2xl bg-violet-50 py-2.5 text-[10px] font-bold text-violet-600"
                >
                  <Copy size={14} /> 复制到
                </button>
                <button
                  type="button"
                  onClick={() => setEditorState({ kind: 'edit', book })}
                  className="flex items-center justify-center gap-1 rounded-2xl bg-indigo-50 py-2.5 text-[10px] font-bold text-indigo-600"
                >
                  <PencilSimple size={14} /> 编辑
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryEntry(book)}
                  className="flex items-center justify-center gap-1 rounded-2xl bg-slate-100 py-2.5 text-[10px] font-bold text-slate-600"
                >
                  <ClockCounterClockwise size={14} /> 版本
                </button>
                <button
                  type="button"
                  onClick={() => setArchiveTarget(book)}
                  className="flex items-center justify-center gap-1 rounded-2xl bg-red-50 py-2.5 text-[10px] font-bold text-red-500"
                >
                  <Archive size={14} /> 归档
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCustomGroup = (group: (typeof groupIndex.customGroups)[number]) => {
    const key = customCategoryKey(group.id);
    const expanded = expandedSections.has(key);
    const assignment = group.owner ? {
      id: group.id,
      name: group.category,
      owner: group.owner,
      sortOrder: group.sortOrder,
      pinned: group.pinned,
    } satisfies WorldbookGroupAssignment : undefined;
    const displayName = assignment ? worldbookGroupDisplayName(assignment) : group.category;
    const mountedNames = assignment
      ? characters
        .filter(character => character.mountedWorldbookGroupIds?.includes(assignment.id))
        .map(character => character.name)
      : [];
    const statusLabel = group.requiresAssignment
      ? '旧版或早期导入中缺少归属 · 暂不参与运行'
      : assignment?.owner.kind === 'universal'
        ? mountedNames.length
          ? `${mountedNames.slice(0, 2).join('、')}${mountedNames.length > 2 ? `等 ${mountedNames.length} 位` : ''}正在使用`
          : '尚未给角色使用'
        : worldbookGroupOwnerLabel(assignment, characters);
    return (
      <div
        key={group.id}
        data-worldbook-group-id={group.id}
        className={`overflow-hidden rounded-[24px] border bg-white/50 shadow-sm backdrop-blur-md transition ${draggedGroupId === group.id ? 'scale-[1.01] border-violet-300 shadow-md' : 'border-white/70'}`}
      >
        <div className="flex items-center pr-2">
          <button type="button" onClick={() => toggleSection(key)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
            <CaretDown className={`shrink-0 text-violet-400 transition-transform ${expanded ? 'rotate-180' : ''}`} size={16} weight="bold" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold text-slate-600">{displayName}</span>
                {group.pinned && <PushPin size={12} weight="fill" className="shrink-0 text-violet-500" />}
              </span>
              <span className="mt-0.5 block truncate text-[9px] text-slate-400">{statusLabel}</span>
            </span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold text-slate-400">{group.books.length}</span>
          </button>
          {assignment && (
            <>
              <button
                type="button"
                onClick={() => openGroupManagement(assignment)}
                aria-label={assignment.owner.kind === 'universal' ? `选择${displayName}给谁使用` : `修改${displayName}的角色归属`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 active:bg-violet-50 active:text-violet-500"
                data-worldbook-group-access
              >
                <UsersThree size={16} weight="duotone" />
              </button>
              <button
                type="button"
                onClick={() => void togglePinnedGroup(assignment)}
                aria-label={group.pinned ? `取消置顶${displayName}` : `置顶${displayName}`}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${group.pinned ? 'bg-violet-100 text-violet-600' : 'text-slate-300'}`}
              >
                <PushPin size={15} weight={group.pinned ? 'fill' : 'regular'} />
              </button>
              {expanded && (
                <button
                  type="button"
                  onClick={() => setArchiveGroupTarget(assignment)}
                  aria-label={group.books.length ? `归档分组${displayName}` : `删除分组${displayName}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 active:bg-red-50 active:text-red-500"
                >
                  <Archive size={15} />
                </button>
              )}
              <button
                type="button"
                aria-label={`拖动${displayName}`}
                onPointerDown={event => beginGroupDrag(event, group.id)}
                onPointerMove={moveGroupDrag}
                onPointerUp={() => void finishGroupDrag()}
                onPointerCancel={() => { dragOrderRef.current = null; setDragOrderIds(null); setDraggedGroupId(null); }}
                className="flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-full text-slate-300 active:bg-violet-50 active:text-violet-500"
              >
                <DotsSixVertical size={18} weight="bold" />
              </button>
            </>
          )}
          {group.requiresAssignment && (
            <>
              <button
                type="button"
                onClick={() => setUnassignedRepair({
                  entryIds: group.books.map(book => book.id),
                  group: defaultGroup,
                })}
                aria-label="整理待归组资料"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-violet-500 active:bg-violet-50"
                data-worldbook-unassigned-repair
              >
                <FolderOpen size={16} weight="duotone" />
              </button>
              <button
                type="button"
                onClick={() => setUnassignedArchiveIds(group.books.map(book => book.id))}
                aria-label="归档全部待归组资料"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 active:bg-red-50 active:text-red-500"
                data-worldbook-unassigned-archive
              >
                <Archive size={15} />
              </button>
            </>
          )}
        </div>
        {expanded && (
          <div className="space-y-2.5 px-3 pb-3 pt-0">
            {group.books.length
              ? group.books.map(book => renderBook(book))
              : <div className="rounded-2xl border border-dashed border-violet-100 py-4 text-center text-[10px] text-slate-400">这组还是空的，可以把新条目或副本放进来。</div>}
          </div>
        )}
      </div>
    );
  };

  if (editorState) {
    return (
      <WorldbookEntryEditor
        key={editorState.kind === 'edit' ? editorState.book.id : editorState.kind === 'supplement' ? editorState.builtIn.id : 'new'}
        heading={editorState.kind === 'edit' ? '编辑条目' : editorState.kind === 'supplement' ? '添加我的补充' : '写一条设定'}
        initial={editorInitial(editorState)}
        characters={characters}
        groupOptions={groupOptions}
        lockGroup={editorState.kind === 'edit' && Boolean(editorState.book.group)}
        note={editorState.kind === 'supplement' ? `这会新建一条与“${editorState.builtIn.title}”关联的个人补充，不会修改内置正文。` : undefined}
        onCancel={() => setEditorState(null)}
        onSave={saveEditor}
      />
    );
  }

  if (showImport) {
    return (
      <WorldbookImportScreen
        characters={characters}
        groupOptions={groupOptions}
        initialGroup={defaultGroup}
        onClose={() => setShowImport(false)}
        onCommit={async (drafts, group) => {
          await addImportedWorldbooks(drafts, group);
          initializedCustomCategories.current.delete(group.id);
          setShowImport(false);
          await refreshWorkspace();
          addToast(`已导入 ${drafts.length} 条世界书`, 'success');
        }}
      />
    );
  }

  if (showSmartInput) {
    return (
      <WorldbookSmartInputScreen
        characters={characters}
        groupOptions={groupOptions}
        initialGroup={defaultGroup}
        route={smartInputRoute}
        onClose={() => setShowSmartInput(false)}
        onCommit={async (drafts, group) => {
          await addPlayerWorldbooks(drafts, group);
          initializedCustomCategories.current.delete(group.id);
          setShowSmartInput(false);
          await refreshWorkspace();
          addToast(`已保存 ${drafts.length} 条世界设定`, 'success');
        }}
      />
    );
  }

  if (selectedGrowthBatchKey && selectedGrowthCandidates.length) {
    return (
      <WorldGrowthReviewScreen
        candidates={selectedGrowthCandidates}
        characters={characters}
        groupOptions={groupOptions}
        defaultGroup={defaultGroup}
        targetGroupsByEntryId={Object.fromEntries(
          visiblePublished.map(entry => [entry.id, entry.group]),
        )}
        onClose={() => setSelectedGrowthBatchKey(null)}
        onAccept={async (candidateId, review) => {
          await acceptWorldGrowthCandidateReview(candidateId, review);
          await refreshWorkspace();
          addToast('已保存到我的世界书', 'success');
        }}
        onDefer={async candidateId => {
          await setWorldGrowthCandidateDisposition(candidateId, 'deferred');
          await refreshWorkspace();
          addToast('已经留到以后再整理', 'success');
        }}
        onIgnore={async candidateId => {
          await setWorldGrowthCandidateDisposition(candidateId, 'ignored');
          await refreshWorkspace();
          addToast('已忽略这条建议，其他候选不受影响', 'success');
        }}
      />
    );
  }

  if (historyEntry) {
    return (
      <WorldbookVersionHistoryScreen
        entry={historyEntry}
        reenabledCharacterCount={worldbookMountCount(historyEntry, characters)}
        onClose={() => setHistoryEntry(null)}
        onRestore={revisionId => restoreVersion(historyEntry, revisionId)}
      />
    );
  }

  if (showArchive) {
    return (
      <div className="flex h-full w-full flex-col bg-slate-50 font-sans" data-worldbook-archive-screen>
        <AppHeader
          title="归档"
          subtitle={`${archivedEntries.length} 条世界书`}
          onBack={() => setShowArchive(false)}
          className="border-b border-slate-200 bg-white/90 backdrop-blur-xl"
        />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5 no-scrollbar">
          {archivedLibrary.groups.map(({ group, entries }) => {
            const expanded = expandedArchivedGroupIds.has(group.id);
            return (
              <section key={group.id} className="overflow-hidden rounded-[24px] border border-white bg-white/85 shadow-sm" data-worldbook-archived-group>
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => setExpandedArchivedGroupIds(previous => {
                      const next = new Set(previous);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-expanded={expanded}
                  >
                    <Archive size={20} className="shrink-0 text-violet-400" />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-slate-700">{group.name}</strong>
                      <span className="mt-1 block text-[10px] text-slate-400">{entries.length} 条 · 恢复时一起回来</span>
                    </span>
                    <CaretDown size={15} className={`shrink-0 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void restoreArchivedGroup(group.id)}
                    className="shrink-0 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-600"
                  >
                    恢复整组
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchivedDeleteTarget({
                      kind: 'group',
                      entries,
                      groupId: group.id,
                      label: group.name,
                    })}
                    aria-label={`彻底删除${group.name}的归档资料`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500"
                    data-worldbook-delete-archived-group
                  >
                    <Trash size={15} />
                  </button>
                </div>
                {expanded && (
                  <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
                    {entries.map(entry => (
                      <div key={entry.id} className="flex items-center gap-2 rounded-2xl bg-slate-50/80 pr-2">
                        <button
                          type="button"
                          onClick={() => setHistoryEntry(entry)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-xs text-slate-600">{entry.title}</strong>
                            <span className="mt-1 block text-[9px] text-slate-400">已归档 · 查看版本</span>
                          </span>
                          <span className="text-slate-300">›</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setArchivedDeleteTarget({ kind: 'entry', entries: [entry], label: entry.title })}
                          aria-label={`彻底删除${entry.title}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-300 active:bg-red-50 active:text-red-500"
                          data-worldbook-delete-archived-entry
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {archivedLibrary.loose.map(entry => (
            <div key={entry.id} className="flex items-center gap-2 rounded-[24px] border border-white bg-white/85 pr-3 shadow-sm">
              <button
                type="button"
                onClick={() => setHistoryEntry(entry)}
                className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
              >
                <Archive size={20} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-slate-700">{entry.title}</strong>
                  <span className="mt-1 block text-[10px] text-slate-400">单条归档 · 查看版本</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setArchivedDeleteTarget({ kind: 'entry', entries: [entry], label: entry.title })}
                aria-label={`彻底删除${entry.title}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 active:bg-red-50 active:text-red-500"
                data-worldbook-delete-archived-entry
              >
                <Trash size={15} />
              </button>
            </div>
          ))}
          {!archivedEntries.length && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-slate-400">
              <Archive size={36} weight="duotone" />
              <div className="text-sm font-bold text-slate-500">归档里还没有内容</div>
            </div>
          )}
        </div>
        <Modal
          isOpen={Boolean(archivedDeleteTarget)}
          title="彻底删除？"
          onClose={() => setArchivedDeleteTarget(null)}
          footer={archivedDeleteTarget ? (
            <div className="flex w-full gap-3">
              <button type="button" onClick={() => setArchivedDeleteTarget(null)} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600">取消</button>
              <button type="button" onClick={() => void confirmArchivedDeletion()} className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white">彻底删除</button>
            </div>
          ) : undefined}
        >
          <div className="space-y-3 py-2 text-center text-sm leading-6 text-slate-600" data-worldbook-permanent-delete-confirm>
            <div>
              {archivedDeleteTarget?.kind === 'group'
                ? `“${archivedDeleteTarget.label}”归档中的 ${archivedDeleteTarget.entries.length} 条资料会被永久删除。`
                : `“${archivedDeleteTarget?.label}”及它的全部历史版本会被永久删除。`}
            </div>
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold text-red-600">删除后不能恢复。</div>
          </div>
        </Modal>
      </div>
    );
  }

  const builtInRootExpanded = expandedSections.has(BUILT_IN_ROOT_KEY);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-slate-100 font-sans">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50 via-slate-100 to-violet-50" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-200/20 blur-3xl" />
      <AppHeader
        title="世界书"
        subtitle={`${groupIndex.customCount} 条我的设定`}
        onBack={closeApp}
        center
        centerSideClassName="w-[76px]"
        className="border-b border-white/50 bg-white/75 shadow-sm backdrop-blur-xl"
        right={(
          <div className="flex items-center gap-2">
            <AppHeaderIconButton
              onClick={openImport}
              title="导入资料"
              className="bg-white/60 text-slate-600 hover:bg-white/90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-[18px] w-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 7.5 12 12m0 0 4.5-4.5M12 12V3" />
              </svg>
            </AppHeaderIconButton>
            <AppHeaderAddButton
              onClick={() => setShowAddMenu(true)}
              title="添加世界书"
              className="bg-indigo-500 text-white shadow-md shadow-indigo-100"
            />
          </div>
        )}
      />

      <div className="relative z-0 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-[max(6rem,env(safe-area-inset-bottom))] no-scrollbar">
        {growthBatches.length > 0 && (
          <section className="shrink-0" data-world-growth-inbox>
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700"><Sparkle size={18} className="text-violet-500" weight="fill" /> 故事生长</h2>
                <p className="mt-1 text-[10px] text-slate-400">保存前都只是整理建议</p>
              </div>
              <span className="text-[10px] text-violet-500">{growthCandidates.length} 条待整理</span>
            </div>
            <div className="space-y-3">
              {growthBatches.map(batch => (
                <button
                  type="button"
                  key={batch.key}
                  onClick={() => setSelectedGrowthBatchKey(batch.key)}
                  className="flex w-full items-center gap-4 rounded-[26px] border border-violet-100 bg-white/75 p-4 text-left shadow-sm"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><Sparkle size={20} weight="fill" /></span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-slate-700">这段故事长出了 {batch.candidates.length} 条资料</strong>
                    <span className="mt-1 block text-[10px] text-slate-400">来自 {worldGrowthSourceLabel(batch.candidates[0])}</span>
                  </span>
                  <span className="text-violet-400">›</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="order-2 shrink-0" data-worldbook-player-library>
          <div className="mb-3 flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700"><FolderOpen size={18} className="text-violet-500" weight="duotone" /> 我的世界书</h2>
              <p className="mt-1 text-[10px] text-slate-400">手写、导入和故事生长都收在这里</p>
            </div>
            {archivedEntries.length > 0 && (
              <button type="button" onClick={() => setShowArchive(true)} className="rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-bold text-slate-500">
                归档 {archivedEntries.length}
              </button>
            )}
          </div>

          {groupIndex.customGroups.length > 0 ? (
            <div className="space-y-3" data-worldbook-custom-groups>
              {orderedUniversalGroups.length > 0 && (
                <section className="overflow-hidden rounded-[26px] border border-violet-100/80 bg-white/45 shadow-sm backdrop-blur-xl" data-worldbook-universal-drawer>
                  <button
                    type="button"
                    onClick={() => toggleSection(UNIVERSAL_ROOT_KEY)}
                    className="flex w-full items-center gap-3 px-4 py-4 text-left"
                    aria-expanded={expandedSections.has(UNIVERSAL_ROOT_KEY)}
                  >
                    <CaretDown className={`shrink-0 text-violet-500 transition-transform ${expandedSections.has(UNIVERSAL_ROOT_KEY) ? 'rotate-180' : ''}`} size={17} weight="bold" />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-slate-700">通用资料</strong>
                      <span className="mt-1 block text-[10px] text-slate-400">{orderedUniversalGroups.length} 组 · 每组可以给多位角色使用</span>
                    </span>
                    <UsersThree size={19} className="text-violet-400" weight="duotone" />
                  </button>
                  {expandedSections.has(UNIVERSAL_ROOT_KEY) && (
                    <div className="space-y-3 border-t border-white/70 px-3 pb-3 pt-3">
                      {orderedUniversalGroups.map(renderCustomGroup)}
                    </div>
                  )}
                </section>
              )}
              {orderedCharacterGroups.map(renderCustomGroup)}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-violet-200 bg-white/45 px-5 py-8 text-center">
              <BookOpen size={38} className="mx-auto text-violet-300" weight="duotone" />
              <div className="mt-3 text-sm font-bold text-slate-600">还没有自己的世界书</div>
              <div className="mt-1 text-[10px] leading-5 text-slate-400">先写一条，或把已有资料带进来。</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={openCreate} className="rounded-2xl bg-violet-600 py-3 text-xs font-bold text-white">写下第一条设定</button>
                <button type="button" onClick={openImport} className="rounded-2xl bg-white py-3 text-xs font-bold text-violet-600 shadow-sm">导入已有资料</button>
              </div>
            </div>
          )}
        </section>

        {groupIndex.builtInCount > 0 && theme.hideBuiltInWorldbooks && (
          <button
            type="button"
            onClick={() => updateTheme({ hideBuiltInWorldbooks: false })}
            className={`flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/35 py-3 text-[10px] font-bold text-slate-400 ${theme.pinBuiltInWorldbooks ? 'order-1' : 'order-3'}`}
            data-worldbook-show-built-in
          >
            <Eye size={15} /> 显示内置世界书
          </button>
        )}

        {groupIndex.builtInCount > 0 && !theme.hideBuiltInWorldbooks && (
          <section className={`shrink-0 overflow-hidden rounded-[26px] border border-indigo-100/80 bg-white/55 shadow-sm backdrop-blur-xl ${theme.pinBuiltInWorldbooks ? 'order-1' : 'order-3'}`} data-worldbook-built-in-drawer>
            <div className="flex items-center pr-2">
              <button type="button" onClick={() => toggleSection(BUILT_IN_ROOT_KEY)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left" aria-expanded={builtInRootExpanded}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100/70 text-indigo-500"><Books size={21} weight="duotone" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-700">内置世界书</h2>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-500">{groupIndex.builtInCount} 条</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">系统资料只读，默认收起</p>
                </div>
                <CaretDown className={`shrink-0 text-slate-400 transition-transform ${builtInRootExpanded ? 'rotate-180' : ''}`} size={18} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => updateTheme({ pinBuiltInWorldbooks: !theme.pinBuiltInWorldbooks })}
                aria-label={theme.pinBuiltInWorldbooks ? '取消置顶内置世界书' : '置顶内置世界书'}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${theme.pinBuiltInWorldbooks ? 'bg-indigo-100 text-indigo-600' : 'text-slate-300'} active:bg-white/70`}
                data-worldbook-pin-built-in
              >
                <PushPin size={16} weight={theme.pinBuiltInWorldbooks ? 'fill' : 'regular'} />
              </button>
              <button
                type="button"
                onClick={() => updateTheme({ hideBuiltInWorldbooks: true })}
                aria-label="隐藏内置世界书"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 active:bg-white/70"
              >
                <EyeSlash size={17} />
              </button>
            </div>
            {builtInRootExpanded && (
              <div className="space-y-2 border-t border-indigo-100/60 px-3 pb-3 pt-3">
                {builtInLibraryLayout.remainingGroups.map(group => {
                  const key = builtInCategoryKey(group.category);
                  const expanded = expandedSections.has(key);
                  return (
                    <div key={group.category} className="overflow-hidden rounded-[18px] border border-white/80 bg-white/55">
                      <button type="button" onClick={() => toggleSection(key)} className="flex w-full items-center gap-2 px-3 py-3 text-left" aria-expanded={expanded}>
                        <CaretDown className={`shrink-0 text-indigo-300 transition-transform ${expanded ? 'rotate-180' : ''}`} size={14} weight="bold" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-600">{group.category}</span>
                        <span className="text-[10px] text-slate-400">{group.books.length}</span>
                      </button>
                      {expanded && <div className="space-y-2 px-2 pb-2">{group.books.map(book => renderBook(book))}</div>}
                    </div>
                  );
                })}
                {builtInLibraryLayout.characterShelves.map(shelf => {
                  const characterKey = builtInCharacterKey(shelf.characterId);
                  const characterExpanded = expandedSections.has(characterKey);
                  return (
                    <div
                      key={shelf.id}
                      className="overflow-hidden rounded-[18px] border border-white/80 bg-white/55"
                      data-worldbook-character-shelf={shelf.characterId}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(characterKey)}
                        className="flex w-full items-center gap-2.5 px-3 py-3 text-left"
                        aria-expanded={characterExpanded}
                      >
                        <CaretDown className={`shrink-0 text-indigo-300 transition-transform ${characterExpanded ? 'rotate-180' : ''}`} size={14} weight="bold" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700">{shelf.characterName}</span>
                        <span className="text-[10px] text-slate-400">{shelf.booksCount}</span>
                      </button>
                      {characterExpanded && (
                        <div className="space-y-2 border-t border-white/80 px-2 pb-2 pt-2">
                          {shelf.lanes.map(lane => {
                            const laneKey = builtInCharacterLaneKey(shelf.characterId, lane.kind);
                            const laneExpanded = expandedSections.has(laneKey);
                            return (
                              <div
                                key={lane.id}
                                className="overflow-hidden rounded-2xl bg-indigo-50/45"
                                data-worldbook-character-lane={lane.kind}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleSection(laneKey)}
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                                  aria-expanded={laneExpanded}
                                >
                                  <CaretDown className={`shrink-0 text-indigo-300 transition-transform ${laneExpanded ? 'rotate-180' : ''}`} size={12} weight="bold" />
                                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-indigo-600">{lane.label}</span>
                                  <span className="text-[9px] text-slate-400">{lane.books.length}</span>
                                </button>
                                {laneExpanded && (
                                  <div className="space-y-2 px-2 pb-2">
                                    {lane.books.map(book => renderBook(book, {
                                      characterName: shelf.characterName,
                                      laneKind: lane.kind,
                                    }))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      <Modal isOpen={showAddMenu} title="添加世界书" onClose={() => setShowAddMenu(false)}>
        <div className="space-y-3" data-worldbook-add-menu>
          <button type="button" onClick={openCreate} className="flex w-full items-center gap-3 rounded-2xl bg-indigo-50 p-4 text-left text-indigo-700">
            <PencilSimple size={20} /> <span><strong className="block text-sm">手写一条</strong><span className="text-[10px] text-indigo-400">自己写内容，也能在这里新建分组</span></span>
          </button>
          <button type="button" onClick={openSmartInput} className="flex w-full items-center gap-3 rounded-2xl bg-violet-50 p-4 text-left text-violet-700">
            <Sparkle size={20} weight="fill" /> <span><strong className="block text-sm">AI 智能整理</strong><span className="text-[10px] text-violet-400">把已有文字整理成一条或一组</span></span>
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(managedGroup)}
        title={managedGroup?.owner.kind === 'universal' ? '选择使用这组资料的角色' : '修改分组归属'}
        onClose={() => { if (!savingManagedGroup) setManagedGroup(null); }}
        footer={managedGroup ? (
          <div className="flex w-full gap-3">
            <button type="button" onClick={() => setManagedGroup(null)} disabled={savingManagedGroup} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 disabled:opacity-50">取消</button>
            <button type="button" onClick={() => void saveGroupManagement()} disabled={savingManagedGroup} className="flex-1 rounded-2xl bg-violet-600 py-3 text-sm font-bold text-white disabled:opacity-50">
              {savingManagedGroup ? '保存中' : '保存'}
            </button>
          </div>
        ) : undefined}
      >
        {managedGroup && (
          <div className="space-y-4 py-2" data-worldbook-group-access-modal>
            <div className="rounded-2xl bg-violet-50 px-4 py-3 text-xs leading-5 text-violet-700">
              <strong className="block">{worldbookGroupDisplayName(managedGroup)}</strong>
              <span className="mt-1 block text-violet-500">
                {managedGroup.owner.kind === 'universal'
                  ? '可以同时给多位角色使用；未选中的角色不会读取这一组。'
                  : '角色分组只归属一位角色，换人后会连同整组资料一起移动。'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {characters.map(character => {
                const selected = managedCharacterIds.includes(character.id);
                return (
                  <button
                    type="button"
                    key={character.id}
                    onClick={() => setManagedCharacterIds(current => (
                      managedGroup.owner.kind === 'universal'
                        ? selected
                          ? current.filter(id => id !== character.id)
                          : [...current, character.id]
                        : [character.id]
                    ))}
                    className={`rounded-2xl border px-3 py-3 text-xs font-bold ${selected ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500'}`}
                  >
                    {character.name}
                  </button>
                );
              })}
            </div>
            {characters.length === 0 && (
              <div className="py-5 text-center text-xs text-slate-400">通讯录里还没有可以选择的角色。</div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(archiveTarget)}
        title="归档这条世界书？"
        onClose={() => setArchiveTarget(null)}
        footer={(
          <div className="flex w-full gap-3">
            <button type="button" onClick={() => setArchiveTarget(null)} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600">先留着</button>
            <button type="button" onClick={() => void confirmArchive()} className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white">确认归档</button>
          </div>
        )}
      >
        <div className="py-3 text-center text-sm leading-6 text-slate-600">
          “{archiveTarget?.title}”会离开当前书架并停止参与运行，版本记录仍会保留。
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(archiveGroupTarget)}
        title={archiveGroupHasLiveEntries ? '归档整组？' : '删除空分组？'}
        onClose={() => setArchiveGroupTarget(null)}
        footer={archiveGroupTarget ? (
          <div className="flex w-full gap-3">
            <button type="button" onClick={() => setArchiveGroupTarget(null)} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600">先留着</button>
            <button type="button" onClick={() => void confirmArchiveGroup()} className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white">
              {archiveGroupHasLiveEntries ? '归档整组' : '删除分组'}
            </button>
          </div>
        ) : undefined}
      >
        {archiveGroupTarget && (
          <div className="py-3 text-center text-sm leading-6 text-slate-600">
            {archiveGroupHasLiveEntries
              ? `“${archiveGroupTarget.name}”里的资料会一起离开当前书架，原有版本仍保留在归档中。`
              : `“${archiveGroupTarget.name}”里还没有资料，删除后不会影响其他分组。`}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(unassignedRepair)}
        title="整理待归组资料"
        onClose={() => setUnassignedRepair(null)}
        footer={unassignedRepair ? (
          <div className="flex w-full gap-3">
            <button type="button" onClick={() => setUnassignedRepair(null)} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600">先留着</button>
            <button type="button" onClick={() => void confirmUnassignedRepair()} className="flex-1 rounded-2xl bg-violet-600 py-3 text-sm font-bold text-white">归入这一组</button>
          </div>
        ) : undefined}
      >
        {unassignedRepair && (
          <div className="space-y-4 py-2" data-worldbook-unassigned-repair-modal>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
              这里是以前导入或旧版本留下、还没有角色归属的世界书，不是记忆。整理后才会参与对应角色的运行。
            </div>
            <WorldbookGroupPicker
              characters={characters}
              groups={groupOptions}
              value={unassignedRepair.group}
              onChange={group => setUnassignedRepair(current => current ? { ...current, group } : null)}
            />
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(unassignedArchiveIds)}
        title="归档这些待归组资料？"
        onClose={() => setUnassignedArchiveIds(null)}
        footer={unassignedArchiveIds ? (
          <div className="flex w-full gap-3">
            <button type="button" onClick={() => setUnassignedArchiveIds(null)} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600">先留着</button>
            <button type="button" onClick={() => void confirmUnassignedArchive()} className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white">归档全部</button>
          </div>
        ) : undefined}
      >
        <div className="py-3 text-center text-sm leading-6 text-slate-600">
          这些资料会离开当前书架并停止参与运行，版本记录仍会保留。
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(copyTarget && copyGroup)}
        title="复制到其他分组"
        onClose={() => { setCopyTarget(null); setCopyGroup(null); }}
        footer={copyTarget && copyGroup ? (
          <button
            type="button"
            onClick={() => void (async () => {
              if (copyTarget.group?.id === copyGroup.id) {
                addToast('请选择另一个分组；原分组里已经有这条资料', 'info');
                return;
              }
              await copyWorldbookToGroup(copyTarget.id, copyGroup);
              addToast(`已复制到“${copyGroup.name}”`, 'success');
              setCopyTarget(null);
              setCopyGroup(null);
              await refreshWorkspace();
            })()}
            className="w-full rounded-2xl bg-violet-600 py-3 text-sm font-bold text-white"
          >
            复制一份
          </button>
        ) : undefined}
      >
        {copyTarget && copyGroup && (
          <div className="space-y-4 py-2">
            <div className="text-xs leading-5 text-slate-500">“{copyTarget.title}”会成为独立副本，之后两边修改互不影响。</div>
            <WorldbookGroupPicker
              characters={characters}
              groups={groupOptions}
              value={copyGroup}
              onChange={setCopyGroup}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WorldbookApp;
