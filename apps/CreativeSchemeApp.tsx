import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  CaretRight,
  Check,
  Copy,
  DotsSixVertical,
  MagicWand,
  PencilSimple,
  Plus,
  PushPin,
  ShieldCheck,
  Trash,
} from '@phosphor-icons/react';
import AppHeader, { AppHeaderAddButton, AppHeaderIconButton } from '../components/shell/AppHeader';
import Modal from '../components/os/Modal';
import ConfirmDialog from '../components/os/ConfirmDialog';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import {
  BUILT_IN_DREAMWORLD,
  CREATIVE_SCHEME_CATEGORIES,
  DREAMWORLD_SCHEME_ID,
  categoryDescription,
  createCreativeScheme,
  createDefaultCreativeSchemeSettings,
  detachCreativeSchemeFromSettings,
  getActiveCreativeSchemeRevision,
  importCreativeSchemeJson,
  isCreativeSchemeArchived,
  reorderCreativeSchemeModules,
  reviseCreativeScheme,
  toggleCreativeSchemePinned,
  updateCreativeSchemeLibraryOrder,
  type CreativeScheme,
  type CreativeSchemeCategory,
  type CreativeSchemeModule,
  type CreativeSchemeSettings,
} from '../domain/creativeScheme';

type SchemeView = {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  modules: readonly CreativeSchemeModule[];
};

const moduleDraft = (): CreativeSchemeModule => ({
  id: `creative-module:${Date.now()}`,
  title: '',
  description: '',
  content: '',
  category: '演绎准则',
  enabled: true,
  order: Date.now(),
  surfaces: ['all'],
});

const CreativeSchemeApp: React.FC = () => {
  const { closeApp, characters, addToast } = useOS();
  const fileRef = useRef<HTMLInputElement>(null);
  const [schemes, setSchemes] = useState<CreativeScheme[]>([]);
  const [settings, setSettings] = useState<CreativeSchemeSettings>(createDefaultCreativeSchemeSettings());
  const [selectedId, setSelectedId] = useState<string>(DREAMWORLD_SCHEME_ID);
  const [loading, setLoading] = useState(true);
  const [newSchemeName, setNewSchemeName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingModule, setEditingModule] = useState<CreativeSchemeModule | null>(null);
  const [copyingModule, setCopyingModule] = useState<CreativeSchemeModule | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveScheme, setArchiveScheme] = useState<CreativeScheme | null>(null);
  const [deleteScheme, setDeleteScheme] = useState<CreativeScheme | null>(null);
  const [expandedSchemeIds, setExpandedSchemeIds] = useState<Set<string>>(
    () => new Set([DREAMWORLD_SCHEME_ID]),
  );
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(() => new Set());
  const [draggedSchemeId, setDraggedSchemeId] = useState<string | null>(null);
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null);
  const dragOrderRef = useRef<string[] | null>(null);
  const [draggedModule, setDraggedModule] = useState<{
    schemeId: string;
    category: CreativeSchemeCategory;
    moduleId: string;
  } | null>(null);
  const [moduleDragOrderIds, setModuleDragOrderIds] = useState<string[] | null>(null);
  const moduleDragOrderRef = useRef<string[] | null>(null);

  const refresh = async () => {
    const records = await DB.getAllCreativeSchemeRecords();
    setSchemes(records.filter((record): record is CreativeScheme => record.kind === 'scheme'));
    setSettings(records.find((record): record is CreativeSchemeSettings => record.kind === 'settings')
      || createDefaultCreativeSchemeSettings());
    setLoading(false);
  };

  useEffect(() => {
    refresh().catch(reason => {
      setLoading(false);
      addToast(reason instanceof Error ? reason.message : '创作方案没有读取成功', 'error');
    });
  }, []);

  const activeSchemes = useMemo(
    () => schemes.filter(scheme => !isCreativeSchemeArchived(scheme)),
    [schemes],
  );
  const archivedSchemes = useMemo(
    () => schemes.filter(isCreativeSchemeArchived),
    [schemes],
  );

  const views = useMemo<SchemeView[]>(() => {
    const base: SchemeView[] = [
      {
        id: DREAMWORLD_SCHEME_ID,
        name: BUILT_IN_DREAMWORLD.name,
        description: BUILT_IN_DREAMWORLD.description,
        builtIn: true,
        modules: BUILT_IN_DREAMWORLD.modules,
      },
      ...activeSchemes.map(scheme => ({
        id: scheme.id,
        name: scheme.name,
        description: scheme.description,
        builtIn: false,
        modules: getActiveCreativeSchemeRevision(scheme).modules,
      })),
    ];
    const pinned = new Set(settings.pinnedSchemeIds || []);
    const order = new Map((settings.schemeOrderIds || []).map((id, index) => [id, index]));
    const fallback = new Map(base.map((item, index) => [item.id, index]));
    return base.sort((left, right) => (
      Number(pinned.has(right.id)) - Number(pinned.has(left.id))
      || (order.get(left.id) ?? fallback.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(right.id) ?? fallback.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
  }, [activeSchemes, settings.pinnedSchemeIds, settings.schemeOrderIds]);

  const orderedViews = useMemo(() => {
    if (!dragOrderIds) return views;
    const byId = new Map(views.map(item => [item.id, item]));
    return [
      ...dragOrderIds.map(id => byId.get(id)).filter((item): item is SchemeView => Boolean(item)),
      ...views.filter(item => !dragOrderIds.includes(item.id)),
    ];
  }, [dragOrderIds, views]);

  const selected = views.find(item => item.id === selectedId) || views[0];
  const selectedScheme = schemes.find(item => item.id === selected?.id);
  const saveSettings = async (next: CreativeSchemeSettings) => {
    await DB.saveCreativeSchemeRecord(next);
    setSettings(next);
  };

  const setAsDefault = async (item: SchemeView) => {
    if (!item.modules.some(module => module.enabled)) {
      addToast('先添加并启用至少一条内容，再把这组用于创作', 'error');
      return;
    }
    const next = { ...settings, defaultSchemeId: item.id, updatedAt: Date.now() };
    await saveSettings(next);
    addToast(`“${item.name}”已成为默认方案`, 'success');
  };

  const toggleCharacter = async (charId: string, item: SchemeView) => {
    const nextMap = { ...settings.characterSchemeIds };
    if (nextMap[charId] === item.id) {
      delete nextMap[charId];
    } else {
      if (!item.modules.some(module => module.enabled)) {
        addToast('先添加并启用至少一条内容，再指定给角色', 'error');
        return;
      }
      nextMap[charId] = item.id;
    }
    await saveSettings({ ...settings, characterSchemeIds: nextMap, updatedAt: Date.now() });
  };

  const toggleSchemeSection = (id: string) => {
    setSelectedId(id);
    setExpandedSchemeIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModuleSection = (moduleKey: string) => {
    setExpandedModuleIds(previous => {
      const next = new Set(previous);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  };

  const beginSchemeDrag = (event: React.PointerEvent<HTMLButtonElement>, schemeId: string) => {
    const order = orderedViews.map(item => item.id);
    dragOrderRef.current = order;
    setDragOrderIds(order);
    setDraggedSchemeId(schemeId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSchemeDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggedSchemeId || !dragOrderRef.current) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-creative-scheme-group-id]')
      ?.dataset.creativeSchemeGroupId;
    if (!target || target === draggedSchemeId) return;
    const current = dragOrderRef.current;
    const from = current.indexOf(draggedSchemeId);
    const to = current.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = [...current];
    next.splice(to, 0, next.splice(from, 1)[0]);
    dragOrderRef.current = next;
    setDragOrderIds(next);
  };

  const finishSchemeDrag = async () => {
    const order = dragOrderRef.current;
    dragOrderRef.current = null;
    setDraggedSchemeId(null);
    if (!order) return;
    try {
      await saveSettings(updateCreativeSchemeLibraryOrder({ settings, schemeOrderIds: order }));
      setDragOrderIds(null);
    } catch (reason) {
      setDragOrderIds(null);
      addToast(reason instanceof Error ? reason.message : '方案顺序没有保存成功', 'error');
    }
  };

  const togglePinnedScheme = async (schemeId: string) => {
    try {
      await saveSettings(toggleCreativeSchemePinned({ settings, schemeId }));
      setDragOrderIds(null);
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '置顶状态没有保存成功', 'error');
    }
  };

  const beginModuleDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    scheme: CreativeScheme,
    category: CreativeSchemeCategory,
  ) => {
    const revision = getActiveCreativeSchemeRevision(scheme);
    const order = revision.modules
      .filter(module => module.category === category)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(module => module.id);
    const moduleId = event.currentTarget.dataset.moduleId;
    if (!moduleId) return;
    moduleDragOrderRef.current = order;
    setModuleDragOrderIds(order);
    setDraggedModule({ schemeId: scheme.id, category, moduleId });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveModuleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggedModule || !moduleDragOrderRef.current) return;
    const targetElement = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-creative-scheme-module-id]');
    const targetId = targetElement?.dataset.creativeSchemeModuleId;
    if (
      !targetId
      || targetId === draggedModule.moduleId
      || targetElement?.dataset.creativeSchemeId !== draggedModule.schemeId
      || targetElement?.dataset.creativeSchemeCategory !== draggedModule.category
    ) return;
    const current = moduleDragOrderRef.current;
    const from = current.indexOf(draggedModule.moduleId);
    const to = current.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...current];
    next.splice(to, 0, next.splice(from, 1)[0]);
    moduleDragOrderRef.current = next;
    setModuleDragOrderIds(next);
  };

  const cancelModuleDrag = () => {
    moduleDragOrderRef.current = null;
    setModuleDragOrderIds(null);
    setDraggedModule(null);
  };

  const finishModuleDrag = async () => {
    const state = draggedModule;
    const order = moduleDragOrderRef.current;
    moduleDragOrderRef.current = null;
    setDraggedModule(null);
    if (!state || !order) {
      setModuleDragOrderIds(null);
      return;
    }
    const scheme = schemes.find(item => item.id === state.schemeId);
    if (!scheme) {
      setModuleDragOrderIds(null);
      return;
    }
    const revision = getActiveCreativeSchemeRevision(scheme);
    try {
      await DB.saveCreativeSchemeRecord(reviseCreativeScheme({
        scheme,
        modules: reorderCreativeSchemeModules({
          modules: revision.modules,
          category: state.category,
          orderedModuleIds: order,
        }),
        modelHints: revision.modelHints,
      }));
      setModuleDragOrderIds(null);
      await refresh();
    } catch (reason) {
      setModuleDragOrderIds(null);
      addToast(reason instanceof Error ? reason.message : '条目顺序没有保存成功', 'error');
    }
  };

  const createOwnedScheme = async (name: string, modules: CreativeSchemeModule[] = []) => {
    const now = Date.now();
    const scheme = createCreativeScheme({
      id: `creative-scheme:${now}`,
      name,
      description: '属于你的创作方案，可逐条增删和修改。',
      source: 'player',
      modules,
      now,
    });
      await DB.saveCreativeSchemeRecord(scheme);
      await refresh();
      setSelectedId(scheme.id);
      setExpandedSchemeIds(previous => new Set(previous).add(scheme.id));
      return scheme;
  };

  const handleCreate = async () => {
    const name = newSchemeName.trim();
    if (!name) return;
    try {
      await createOwnedScheme(name);
      setNewSchemeName('');
      setShowCreate(false);
      addToast('新方案已经准备好', 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '没有创建成功', 'error');
    }
  };

  const saveModule = async () => {
    if (!selectedScheme || !editingModule) return;
    if (!editingModule.title.trim() || !editingModule.content.trim()) {
      addToast('条目需要标题和内容', 'error');
      return;
    }
    const revision = getActiveCreativeSchemeRevision(selectedScheme);
    const exists = revision.modules.some(module => module.id === editingModule.id);
    const modules = exists
      ? revision.modules.map(module => module.id === editingModule.id ? editingModule : module)
      : [...revision.modules, editingModule];
    try {
      await DB.saveCreativeSchemeRecord(reviseCreativeScheme({
        scheme: selectedScheme,
        modules,
        modelHints: revision.modelHints,
      }));
      await refresh();
      setEditingModule(null);
      addToast('条目已保存', 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '条目没有保存成功', 'error');
    }
  };

  const toggleModule = async (scheme: CreativeScheme, module: CreativeSchemeModule) => {
    const revision = getActiveCreativeSchemeRevision(scheme);
    await DB.saveCreativeSchemeRecord(reviseCreativeScheme({
      scheme,
      modules: revision.modules.map(item => item.id === module.id
        ? { ...item, enabled: !item.enabled }
        : item),
      modelHints: revision.modelHints,
    }));
    await refresh();
  };

  const copyModuleTo = async (target?: CreativeScheme) => {
    if (!copyingModule) return;
    try {
      const copied = {
        ...copyingModule,
        id: `creative-module:copy:${Date.now()}`,
        order: Date.now(),
        sourceIdentifier: copyingModule.id,
      };
      if (!target) {
        await createOwnedScheme('我的梦世界', [copied]);
      } else {
        const revision = getActiveCreativeSchemeRevision(target);
        await DB.saveCreativeSchemeRecord(reviseCreativeScheme({
          scheme: target,
          modules: [...revision.modules, copied],
          modelHints: revision.modelHints,
        }));
        await refresh();
        setSelectedId(target.id);
      }
      setCopyingModule(null);
      addToast('已抄到你的方案里，可以继续修改', 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '这条没有复制成功', 'error');
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const scheme = importCreativeSchemeJson({
        json: await file.text(),
        fileName: file.name,
      });
      await DB.saveCreativeSchemeRecord(scheme);
      await refresh();
      setSelectedId(scheme.id);
      setExpandedSchemeIds(previous => new Set(previous).add(scheme.id));
      addToast(`已导入“${scheme.name}”`, 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '这个文件没有导入成功', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmArchive = async () => {
    if (!archiveScheme) return;
    const nextSettings = detachCreativeSchemeFromSettings({
      settings,
      schemeId: archiveScheme.id,
    });
    try {
      await DB.archiveCreativeScheme(archiveScheme.id, nextSettings);
      setSettings(nextSettings);
      setArchiveScheme(null);
      setSelectedId(DREAMWORLD_SCHEME_ID);
      await refresh();
      addToast('方案组已归档，原有作品不受影响', 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '方案没有归档成功', 'error');
    }
  };

  const handleRestore = async (scheme: CreativeScheme) => {
    try {
      await DB.restoreCreativeScheme(scheme.id);
      await refresh();
      setShowArchive(false);
      setSelectedId(scheme.id);
      addToast('方案组已回到方案库，需要时再重新启用', 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '方案没有恢复成功', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteScheme) return;
    try {
      await DB.deleteCreativeScheme(deleteScheme.id);
      setDeleteScheme(null);
      await refresh();
      addToast('归档方案已彻底删除', 'success');
    } catch (reason) {
      addToast(reason instanceof Error ? reason.message : '方案没有删除成功', 'error');
    }
  };

  if (showArchive) {
    return (
      <div className="flex h-full w-full flex-col bg-gradient-to-b from-slate-50 via-white to-violet-50/40 text-slate-800">
        <AppHeader
          title="方案归档"
          subtitle={`${archivedSchemes.length} 组创作方案`}
          onBack={() => setShowArchive(false)}
        />
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10 pt-5">
          <div className="mx-auto max-w-2xl space-y-3">
            {archivedSchemes.map(scheme => {
              const revision = getActiveCreativeSchemeRevision(scheme);
              return (
                <article key={scheme.id} className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-semibold text-slate-800">{scheme.name}</h2>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">
                        {revision.modules.length} 条 · {scheme.source === 'imported' ? '导入方案' : '我的方案'}
                      </p>
                      {scheme.description && <p className="mt-2 text-[12px] leading-5 text-slate-500">{scheme.description}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-semibold text-slate-500">已归档</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRestore(scheme)}
                      className="min-h-10 flex-1 rounded-2xl bg-violet-50 px-4 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    >
                      <ArrowCounterClockwise className="mr-1 inline" size={15} />恢复整组
                    </button>
                    <button
                      type="button"
                      title="彻底删除"
                      aria-label={`彻底删除“${scheme.name}”`}
                      onClick={() => setDeleteScheme(scheme)}
                      className="min-h-10 min-w-10 rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <Trash className="mx-auto" size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
            {!archivedSchemes.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-5 py-12 text-center">
                <Archive className="mx-auto text-slate-300" size={28} weight="duotone" />
                <div className="mt-3 text-[13px] font-semibold text-slate-500">归档里还没有方案</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">暂时不用的整组方案会收在这里。</p>
              </div>
            )}
          </div>
        </div>
        {deleteScheme && (
          <ConfirmDialog
            isOpen
            title="彻底删除？"
            message={`“${deleteScheme.name}”及它的全部历史版本会被永久删除，已经生成的作品仍会保留当时的版本回执。`}
            variant="danger"
            confirmText="彻底删除"
            onConfirm={confirmDelete}
            onCancel={() => setDeleteScheme(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-violet-50/55 via-slate-50 to-white text-slate-800">
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={event => handleImport(event.target.files?.[0])} />
      <AppHeader
        title="创作方案"
        subtitle={`${activeSchemes.length} 组我的方案`}
        onBack={closeApp}
        center
        centerSideClassName="w-[76px]"
        className="border-b border-white/50 bg-white/75 shadow-sm backdrop-blur-xl"
        right={(
          <div className="flex items-center gap-2">
            <AppHeaderIconButton onClick={() => fileRef.current?.click()} title="导入方案" className="bg-white/60 text-slate-600 hover:bg-white/90">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-[18px] w-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 7.5 12 12m0 0 4.5-4.5M12 12V3" />
              </svg>
            </AppHeaderIconButton>
            <AppHeaderAddButton onClick={() => setShowCreate(true)} title="新建方案" className="bg-indigo-500 text-white shadow-md shadow-indigo-100" />
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5">
        <div className="mx-auto max-w-2xl space-y-5">
          <section>
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-sm font-bold text-slate-700">创作方案</h2>
                <p className="mt-1 text-[10px] text-slate-400">每组可以展开、置顶和调整顺序</p>
              </div>
              {archivedSchemes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchive(true)}
                  className="rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-bold text-slate-500"
                >
                  归档 {archivedSchemes.length}
                </button>
              )}
            </div>
            <div className="space-y-3">
              {orderedViews.map(item => {
                const expanded = expandedSchemeIds.has(item.id);
                const pinned = (settings.pinnedSchemeIds || []).includes(item.id);
                const itemIsDefault = settings.defaultSchemeId === item.id;
                const itemCanRun = item.modules.some(module => module.enabled);
                const itemScheme = schemes.find(scheme => scheme.id === item.id);
                const assignedNames = characters
                  .filter(character => settings.characterSchemeIds[character.id] === item.id)
                  .map(character => character.name);
                const status = [
                  item.builtIn ? '系统内置' : itemScheme?.source === 'imported' ? '导入方案' : '我的方案',
                  itemIsDefault ? '所有角色默认使用' : '',
                  assignedNames.length ? `${assignedNames.slice(0, 2).join('、')}${assignedNames.length > 2 ? `等 ${assignedNames.length} 位` : ''}单独使用` : '',
                ].filter(Boolean).join(' · ');
                const globallyOrderedModules = [...item.modules]
                  .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
                const deliveryPosition = new Map(
                  globallyOrderedModules.map((module, index) => [module.id, index + 1]),
                );
                const itemGroups = CREATIVE_SCHEME_CATEGORIES
                  .map(category => {
                    const modules = item.modules
                      .filter(module => module.category === category.id)
                      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
                    if (
                      draggedModule?.schemeId === item.id
                      && draggedModule.category === category.id
                      && moduleDragOrderIds
                    ) {
                      const byId = new Map(modules.map(module => [module.id, module]));
                      return {
                        ...category,
                        modules: moduleDragOrderIds
                          .map(id => byId.get(id))
                          .filter((module): module is CreativeSchemeModule => Boolean(module)),
                      };
                    }
                    return { ...category, modules };
                  })
                  .filter(group => group.modules.length > 0);
                return (
                  <div
                    key={item.id}
                    data-creative-scheme-group-id={item.id}
                    className={`overflow-hidden rounded-[24px] border bg-white/55 shadow-sm backdrop-blur-md transition ${draggedSchemeId === item.id ? 'scale-[1.01] border-violet-300 shadow-md' : 'border-white/80'}`}
                  >
                    <div className="flex items-center pr-2">
                      <button type="button" onClick={() => toggleSchemeSection(item.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
                        <CaretDown className={`shrink-0 text-violet-400 transition-transform ${expanded ? 'rotate-180' : ''}`} size={16} weight="bold" />
                        {item.builtIn && <MagicWand size={16} className="shrink-0 text-amber-500" weight="duotone" />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-slate-700">{item.name}</span>
                            {pinned && <PushPin size={12} weight="fill" className="shrink-0 text-violet-500" />}
                          </span>
                          <span className="mt-0.5 block truncate text-[9px] text-slate-400">{status}</span>
                        </span>
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold text-slate-400">{item.modules.length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePinnedScheme(item.id)}
                        aria-label={pinned ? `取消置顶${item.name}` : `置顶${item.name}`}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${pinned ? 'bg-violet-100 text-violet-600' : 'text-slate-300'}`}
                      >
                        <PushPin size={15} weight={pinned ? 'fill' : 'regular'} />
                      </button>
                      {expanded && itemScheme && (
                        <button
                          type="button"
                          onClick={() => setArchiveScheme(itemScheme)}
                          aria-label={`归档分组${item.name}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 active:bg-red-50 active:text-red-500"
                        >
                          <Archive size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`拖动${item.name}`}
                        onPointerDown={event => beginSchemeDrag(event, item.id)}
                        onPointerMove={moveSchemeDrag}
                        onPointerUp={() => void finishSchemeDrag()}
                        onPointerCancel={() => { dragOrderRef.current = null; setDragOrderIds(null); setDraggedSchemeId(null); }}
                        className="flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-full text-slate-300 active:bg-violet-50 active:text-violet-500"
                      >
                        <DotsSixVertical size={18} weight="bold" />
                      </button>
                    </div>

                    {expanded && (
                      <div className="space-y-4 border-t border-white/80 px-3 pb-3 pt-3">
                        <div className="rounded-2xl bg-white/70 p-3.5">
                          <p className="text-[12px] leading-5 text-slate-500">{item.description}</p>
                          <div className="mt-3 text-[11px] font-semibold text-slate-600">通用方案</div>
                          {itemIsDefault ? (
                            <div className="mt-2 flex min-h-12 items-center gap-2.5 rounded-2xl border border-violet-200 bg-violet-50 px-3.5 text-violet-700">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white"><Check size={12} weight="bold" /></span>
                              <span className="min-w-0">
                                <span className="block text-[11px] font-semibold">所有角色默认使用</span>
                                <span className="mt-0.5 block text-[9px] text-violet-500">没有单独选择的角色，会使用这一组</span>
                              </span>
                            </div>
                          ) : (
                            <button type="button" onClick={() => void setAsDefault(item)} className="mt-2 flex min-h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3.5 text-left transition active:border-violet-300 active:bg-violet-50">
                              <span>
                                <span className="block text-[11px] font-semibold text-slate-700">设为所有角色默认</span>
                                <span className="mt-0.5 block text-[9px] text-slate-400">会替换当前的通用方案</span>
                              </span>
                              <CaretRight size={14} className="text-slate-300" weight="bold" />
                            </button>
                          )}
                          <div className="mt-4 text-[11px] font-semibold text-slate-600">只给这些角色使用</div>
                          <p className="mt-1 text-[9px] leading-4 text-slate-400">点亮后，该角色会改用这一组；取消后回到通用方案。</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {characters.length ? characters.map(character => {
                              const selectedForChar = settings.characterSchemeIds[character.id] === item.id;
                              return (
                                <button
                                  key={character.id}
                                  type="button"
                                  onClick={() => void toggleCharacter(character.id, item)}
                                  aria-pressed={selectedForChar}
                                  className={`min-h-9 flex items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium ${selectedForChar ? 'border-violet-400 bg-violet-100 text-violet-700' : 'border-slate-200 bg-white text-slate-500'}`}
                                >
                                  {selectedForChar && <Check size={11} weight="bold" />}{character.name}
                                </button>
                              );
                            }) : <span className="text-[10px] text-slate-400">通讯录里还没有角色</span>}
                          </div>
                        </div>

                        {itemScheme && (
                          <div>
                            <button type="button" onClick={() => { setSelectedId(item.id); setEditingModule(moduleDraft()); }} className="min-h-10 w-full rounded-2xl bg-violet-50 px-4 text-xs font-semibold text-violet-700"><Plus className="mr-1 inline" size={14} />添加条目</button>
                            {!itemCanRun && <p className="mt-2 text-[10px] leading-4 text-amber-600">这组还没有启用中的条目，暂时不会用于生成。</p>}
                            <p className="mt-2 px-1 text-[9px] leading-4 text-slate-400">大栏只帮助整理；条目前的次序是实际递送顺序，拖动同一栏的手柄会保存新的顺序。</p>
                          </div>
                        )}

                        {itemGroups.map(group => (
                          <section key={group.id} className="space-y-2.5">
                            <div className="px-1">
                              <h3 className="text-[12px] font-semibold text-slate-700">{group.id}</h3>
                              <p className="mt-1 text-[10px] leading-4 text-slate-400">{group.description}</p>
                            </div>
                            {group.modules.map(module => {
                              const moduleKey = `${item.id}:${module.id}`;
                              const moduleExpanded = expandedModuleIds.has(moduleKey);
                              const moduleDragging = draggedModule?.moduleId === module.id;
                              return (
                                <article
                                  key={module.id}
                                  data-creative-scheme-module-id={module.id}
                                  data-creative-scheme-id={item.id}
                                  data-creative-scheme-category={group.id}
                                  className={`rounded-2xl border border-white/90 bg-white/85 shadow-sm transition ${module.enabled ? '' : 'opacity-55'} ${moduleDragging ? 'scale-[1.01] border-violet-300 shadow-md' : ''}`}
                                >
                                  <div className="flex min-h-12 items-center gap-1 px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleModuleSection(moduleKey)}
                                      aria-expanded={moduleExpanded}
                                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    >
                                      <CaretDown className={`shrink-0 text-violet-400 transition-transform ${moduleExpanded ? 'rotate-180' : ''}`} size={13} weight="bold" />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[12px] font-semibold text-slate-700">{module.title}</span>
                                        {module.description && <span className="mt-0.5 block truncate text-[9px] text-violet-500">{module.description}</span>}
                                      </span>
                                      <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[8px] font-semibold text-slate-400">{deliveryPosition.get(module.id)}</span>
                                    </button>
                                    {item.builtIn ? (
                                      <button type="button" onClick={() => setCopyingModule({ ...module, surfaces: [...module.surfaces] })} title="复制这条" aria-label={`复制“${module.title}”`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-violet-500"><Copy size={14} /></button>
                                    ) : itemScheme ? (
                                      <>
                                        <button type="button" onClick={() => void toggleModule(itemScheme, module)} aria-pressed={module.enabled} aria-label={`${module.enabled ? '停用' : '启用'}“${module.title}”`} className={`min-h-7 shrink-0 rounded-full px-2 text-[9px] font-semibold ${module.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{module.enabled ? '启用' : '停用'}</button>
                                        <button type="button" onClick={() => { setSelectedId(item.id); setEditingModule({ ...module, surfaces: [...module.surfaces] }); }} title="编辑" aria-label={`编辑“${module.title}”`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500"><PencilSimple size={14} /></button>
                                        <button
                                          type="button"
                                          data-module-id={module.id}
                                          aria-label={`拖动“${module.title}”`}
                                          onPointerDown={event => beginModuleDrag(event, itemScheme, group.id)}
                                          onPointerMove={moveModuleDrag}
                                          onPointerUp={() => void finishModuleDrag()}
                                          onPointerCancel={cancelModuleDrag}
                                          className="flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-full text-slate-300 active:bg-violet-50 active:text-violet-500"
                                        >
                                          <DotsSixVertical size={16} weight="bold" />
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                  {moduleExpanded && (
                                    <div className="border-t border-slate-100/80 px-4 pb-3 pt-2.5">
                                      <p className="whitespace-pre-wrap break-words text-[11px] leading-[1.72] text-slate-600 [overflow-wrap:anywhere]">{module.content}</p>
                                    </div>
                                  )}
                                </article>
                              );
                            })}
                          </section>
                        ))}
                        {!item.modules.length && <div className="rounded-2xl border border-dashed border-violet-100 py-4 text-center text-[10px] text-slate-400">这组还是空的，可以添加自己的写作条目。</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-white p-2 text-sky-600 shadow-sm"><ShieldCheck size={18} weight="fill" /></div>
              <div>
                <h3 className="text-[13px] font-semibold text-sky-900">系统边界</h3>
                <p className="mt-1 text-[11px] leading-5 text-sky-800/70">负责确认当前任务、保护本机数据与工具权限，并区分作品情节和现实中的求助。它不属于任何创作方案，导入的方案也不会覆盖这里。</p>
              </div>
            </div>
          </section>

          {loading && <div className="py-8 text-center text-xs text-slate-400">正在读取创作方案…</div>}
        </div>
      </div>

      <Modal
        isOpen={showCreate}
        title="新建创作方案"
        onClose={() => setShowCreate(false)}
        footer={(
          <>
            <button type="button" onClick={() => setShowCreate(false)} className="min-h-11 flex-1 rounded-2xl bg-slate-100 px-3 text-xs font-semibold text-slate-500 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">取消</button>
            <button type="button" onClick={handleCreate} className="min-h-11 flex-1 rounded-2xl bg-violet-600 px-3 text-xs font-semibold text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">创建</button>
          </>
        )}
      >
        <label className="text-[11px] font-semibold text-slate-500">方案名称</label>
        <input value={newSchemeName} onChange={event => setNewSchemeName(event.target.value)} autoFocus className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" placeholder="例如：悬疑短篇" />
      </Modal>

      <Modal
        isOpen={Boolean(editingModule)}
        title={editingModule && selectedScheme && getActiveCreativeSchemeRevision(selectedScheme).modules.some(item => item.id === editingModule.id) ? '修改条目' : '添加条目'}
        onClose={() => setEditingModule(null)}
        footer={(
          <>
            <button type="button" onClick={() => setEditingModule(null)} className="min-h-11 flex-1 rounded-2xl bg-slate-100 px-3 text-xs font-semibold text-slate-500 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">取消</button>
            <button type="button" onClick={saveModule} className="min-h-11 flex-1 rounded-2xl bg-violet-600 px-3 text-xs font-semibold text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">保存</button>
          </>
        )}
      >
        {editingModule && (
          <div className="space-y-4">
            <div><label className="text-[11px] font-semibold text-slate-500">标题</label><input value={editingModule.title} onChange={event => setEditingModule({ ...editingModule, title: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></div>
            <div><label className="text-[11px] font-semibold text-slate-500">放在哪一栏</label><select value={editingModule.category} onChange={event => setEditingModule({ ...editingModule, category: event.target.value as CreativeSchemeCategory })} className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100">{CREATIVE_SCHEME_CATEGORIES.map(category => <option key={category.id}>{category.id}</option>)}</select></div>
            <div><label className="text-[11px] font-semibold text-slate-500">给模型的内容</label><textarea value={editingModule.content} onChange={event => setEditingModule({ ...editingModule, content: event.target.value })} className="mt-1.5 min-h-40 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-[12px] leading-5 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(copyingModule)} title="复制到我的方案" onClose={() => setCopyingModule(null)}>
        <div className="space-y-2">
          {activeSchemes.map(scheme => <button key={scheme.id} type="button" onClick={() => copyModuleTo(scheme)} className="min-h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-left text-xs font-semibold text-slate-700 transition hover:border-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{scheme.name}</button>)}
          <button type="button" onClick={() => copyModuleTo()} className="min-h-11 w-full rounded-2xl border border-dashed border-violet-300 bg-violet-50 px-4 text-left text-xs font-semibold text-violet-700 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">新建“我的梦世界”并放进去</button>
        </div>
      </Modal>

      {archiveScheme && (
        <ConfirmDialog
          isOpen
          title="归档整组？"
          message={`“${archiveScheme.name}”会离开当前方案组，并取消默认和角色指定；版本记录与已经生成的作品仍会保留。`}
          confirmText="归档整组"
          onConfirm={confirmArchive}
          onCancel={() => setArchiveScheme(null)}
        />
      )}
    </div>
  );
};

export default CreativeSchemeApp;
