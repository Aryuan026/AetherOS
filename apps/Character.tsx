
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { AppID, AvatarFramePreset, CharacterProfile, CharacterExportData, UserImpression, MemoryFragment, Worldbook } from '../types';
import { SlidersHorizontal, SpeakerHigh, Books, BookOpen, CaretDown, Heart } from '@phosphor-icons/react';
import Modal from '../components/os/Modal';
import { processImage } from '../utils/file';
import { CALL_PORTRAIT_UPLOAD_HELP, SUPPORTED_UPLOAD_IMAGE_ACCEPT } from '../utils/uploadGuidance';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { DB } from '../utils/db';
import { ContextBuilder } from '../utils/context';
import { formatLifeSimResetCardForContext } from '../utils/lifeSimChatCard';
import { DEFAULT_ARCHIVE_PROMPTS } from '../components/chat/ChatConstants';
import ImpressionPanel from '../components/character/ImpressionPanel';
import MemoryArchivist from '../components/character/MemoryArchivist';
import BehaviorBoundaryPanel from '../components/character/BehaviorBoundaryPanel';
import AvatarWithFrame from '../components/common/AvatarWithFrame';
import { safeResponseJson } from '../utils/safeApi';
import { fetchMiniMaxVoices, MiniMaxVoiceItem } from '../utils/minimaxVoice';
import { resolveMiniMaxApiKey } from '../utils/minimaxApiKey';
import { normalizeUserImpression } from '../utils/impression';
import { formatBondTimeLabelFromMessages } from '../utils/bondTime';
import AppHeader, { AppHeaderAddButton, AppHeaderIconButton } from '../components/shell/AppHeader';
import { resolveAvatarFramePreset } from '../utils/avatarFrames';
import { getDeepSpaceWorldbookIdentityNotice } from '../utils/deepspaceIdentity';
import {
    linkCharacterToActivePersonaMask,
    resolvePersonaRouteScope,
    unlinkCharacterFromActivePersonaMask,
} from '../utils/personaRouteScope';
import { strictRelationshipScopeForProfile } from '../utils/messageContext';
import type { MemoryProjectionPatch, MemoryProjectionView } from '../domain/memoryProjection';
import {
    listMemoryProjectionViews,
    resolveMemoryProjectionSourceDate,
    reviseMemoryProjectionView,
} from '../utils/memoryCore/memoryProjection';
import { queueDailyArchiveNavigation } from '../utils/dailyArchive/navigation';
import { currentMountedWorldbooks } from '../utils/worldbookMounts';
import { resolveAiTaskRoute } from '../utils/aiRuntime';
import {
    compilePlayerCharacterBehaviorBoundary,
    integrateCompiledCharacterBehaviorRule,
} from '../utils/characterBehaviorBoundary';
import { getActiveWorldbookRevision, isWorldbookPublished } from '../domain/worldbook';
import {
    listPlayerVisibleWorldbooks,
} from '../utils/worldbookPlayerView';
import {
    extractTavernCharacterCardFromPng,
    isTavernCharacterCardDocument,
    parseTavernCharacterCard,
} from '../utils/tavernImport';
import {
    buildWorldbookGroupIndex,
    createWorldbookGroupAssignment,
    isBuiltInWorldbook,
} from '../utils/worldbookGroups';
import { BUILT_IN_DEEPSPACE_STORY_ENTRY_IDS } from '../domain/deepspaceStoryEnhancement';

const DEFAULT_WORLDBOOK_CATEGORY = '未分类设定 (General)';
const OPTIONAL_BUILT_IN_WORLDBOOK_IDS = new Set([
    'builtin-deepspace-optional-male-leads-npc-index',
    'builtin-deepspace-user-circle',
    'builtin-deepspace-optional-hunter-npc-index',
    'builtin-deepspace-story-zayne',
    'builtin-deepspace-story-qiyu',
    'builtin-deepspace-story-sylus',
    'builtin-deepspace-story-caleb',
    'builtin-deepspace-story-crossover',
    ...BUILT_IN_DEEPSPACE_STORY_ENTRY_IDS,
]);
const BUILT_IN_WORLDBOOK_DISPLAY_ORDER = new Map([
    ['builtin-deepspace-optional-male-leads-npc-index', 10],
    ['builtin-deepspace-story-crossover', 11],
    ['builtin-deepspace-user-circle', 20],
    ['builtin-deepspace-optional-hunter-npc-index', 30],
]);
const worldbookCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

const isOptionalBuiltInWorldbook = (id?: string) => Boolean(id && OPTIONAL_BUILT_IN_WORLDBOOK_IDS.has(id));
const isWorldbookVisibleForCharacter = (wb: { visibleToCharacterIds?: string[] }, charId?: string) => (
    !wb.visibleToCharacterIds?.length || Boolean(charId && wb.visibleToCharacterIds.includes(charId))
);

const compareWorldbookEntries = <T extends { id: string; title: string }>(a: T, b: T) => {
    const orderA = BUILT_IN_WORLDBOOK_DISPLAY_ORDER.get(a.id) ?? 1000;
    const orderB = BUILT_IN_WORLDBOOK_DISPLAY_ORDER.get(b.id) ?? 1000;
    return (
        orderA - orderB ||
        worldbookCollator.compare(a.title, b.title) ||
        worldbookCollator.compare(a.id, b.id)
    );
};

const compareWorldbookCategories = (a: string, b: string) => {
    if (a === '深空世界书' && b !== '深空世界书') return -1;
    if (b === '深空世界书' && a !== '深空世界书') return 1;
    return worldbookCollator.compare(a, b);
};

const createImportedCharacterAvatar = (name: string): string => {
    const letter = (name.trim().charAt(0) || '?').replace(/[<>&'\"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#c7d2fe"/><text x="50" y="55" font-family="sans-serif" font-weight="700" font-size="46" text-anchor="middle" dy=".3em" fill="white">${letter}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const CharacterCard: React.FC<{
    char: CharacterProfile;
    subtitle?: string;
    isActive: boolean;
    onClick: () => void;
    onSetWanted: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    isLinkedToMask?: boolean;
    onLinkToMask?: (e: React.MouseEvent) => void;
    onUnlinkFromMask?: (e: React.MouseEvent) => void;
    avatarFramePreset?: AvatarFramePreset;
}> = ({ char, subtitle, isActive, onClick, onSetWanted, onDelete, isLinkedToMask, onLinkToMask, onUnlinkFromMask, avatarFramePreset }) => {
    const isLockedBuiltIn = Boolean(char.isBuiltIn && char.lockPromptEditing);

    return (
    <div
        onClick={onClick}
        className="relative p-3.5 rounded-3xl border bg-white/40 border-white/40 hover:bg-white/60 hover:scale-[1.01] transition-all duration-300 cursor-pointer group shadow-sm shrink-0"
    >
        <div className="flex items-center gap-3.5">
            <AvatarWithFrame
                src={char.avatar}
                framePreset={avatarFramePreset}
                className="w-12 h-12"
                roundedClassName="rounded-full"
                imageClassName="shadow-inner"
                alt={char.name}
            />
            <div className="flex-1 min-w-0 pt-1">
                <h3 className="font-semibold truncate text-slate-700 leading-tight">
                    {char.name}
                    {isLockedBuiltIn && <span className="ml-2 align-middle text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">内置</span>}
                </h3>
                <p className="text-xs text-slate-400 truncate mt-1 font-light">
                    {subtitle || char.description || '暂无描述'}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                    {isLinkedToMask && onUnlinkFromMask ? (
                        <button
                            onClick={onUnlinkFromMask}
                            className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-500 hover:bg-slate-100 hover:text-slate-500 active:scale-95"
                        >
                            收进角色库
                        </button>
                    ) : onLinkToMask ? (
                        <button
                            onClick={onLinkToMask}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-500 active:scale-95"
                        >
                            加入当前生活
                        </button>
                    ) : null}
                </div>
            </div>
            <button
                onClick={onSetWanted}
                className={`shrink-0 h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                    isActive
                        ? 'bg-rose-500 text-white shadow-sm shadow-rose-200'
                        : 'bg-white/70 text-slate-500 border border-white/70 hover:bg-white hover:text-rose-500'
                }`}
                title={isActive ? '当前首屏想见的人' : '设为首屏想见的人'}
            >
                <Heart size={13} weight={isActive ? 'fill' : 'bold'} />
                {isActive ? '想见的人' : '设为想见'}
            </button>
        </div>
        {!isLockedBuiltIn && (
            <button
                onClick={onDelete}
                className="absolute -top-1 -right-1 p-1.5 rounded-full bg-white/80 text-slate-300 hover:bg-red-50 hover:text-red-400 active:bg-red-100 active:text-red-500 transition-all z-10 shadow-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
            </button>
        )}
    </div>
    );
};

const Character: React.FC = () => {
  const {
      closeApp,
      openApp,
      characters,
      activeCharacterId,
      setActiveCharacterId,
      addCharacter,
      addPreparedCharacter,
      updateCharacter,
      deleteCharacter,
      apiConfig,
      apiPresets,
      aiRuntimeRouting,
      addToast,
      userProfile,
      updateUserProfile,
      customThemes,
      addCustomTheme,
      worldbooks,
      worldbookGroups,
      addImportedWorldbooks,
      lastMsgTimestamp,
      theme,
  } = useOS();
  const behaviorCompilationRoute = useMemo(() => resolveAiTaskRoute({
      taskId: 'behavior_boundary_compilation',
      dialogueConfig: apiConfig,
      apiPresets,
      routing: aiRuntimeRouting,
  }), [aiRuntimeRouting, apiConfig, apiPresets]);
  const playerVisibleWorldbooks = useMemo(
      () => listPlayerVisibleWorldbooks(worldbooks),
      [worldbooks],
  );
  const playerVisibleWorldbookIds = useMemo(
      () => new Set(playerVisibleWorldbooks.map(book => book.id)),
      [playerVisibleWorldbooks],
  );
  const customWorldbookGroups = useMemo(
      () => buildWorldbookGroupIndex(playerVisibleWorldbooks, worldbookGroups).customGroups,
      [playerVisibleWorldbooks, worldbookGroups],
  );
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailTab, setDetailTab] = useState<'identity' | 'boundary' | 'memory' | 'impression'>('identity');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CharacterProfile | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isCallPortraitCompressing, setIsCallPortraitCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const callPortraitInputRef = useRef<HTMLInputElement>(null);
  const cardImportRef = useRef<HTMLInputElement>(null);
  
  // Race Condition Guards
  const editingIdRef = useRef<string | null>(null);
  
  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false); 
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<string | null>(null);
  const [showWorldbookModal, setShowWorldbookModal] = useState(false); // New Modal
  const [viewingWorldbook, setViewingWorldbook] = useState<NonNullable<CharacterProfile['mountedWorldbooks']>[number] | null>(null);
  const [identityRiskConfirmBookId, setIdentityRiskConfirmBookId] = useState<string | null>(null);
  const [expandedWorldbookCategories, setExpandedWorldbookCategories] = useState<Set<string>>(() => new Set());

  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [isProcessingMemory, setIsProcessingMemory] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  // Batch Summarize State
  const [batchRange, setBatchRange] = useState({ start: '', end: '' });
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');

  // Archive Prompts State (shared with ChatApp)
  const [archivePrompts, setArchivePrompts] = useState<{id: string, name: string, content: string}[]>(DEFAULT_ARCHIVE_PROMPTS);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('preset_rational');
  const [editingPrompt, setEditingPrompt] = useState<{id: string, name: string, content: string} | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // Impression State
  const [isGeneratingImpression, setIsGeneratingImpression] = useState(false);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<Record<'system' | 'voice_cloning' | 'voice_generation', MiniMaxVoiceItem[]>>({
      system: [],
      voice_cloning: [],
      voice_generation: [],
  });
  const [bondTimeLabels, setBondTimeLabels] = useState<Record<string, string>>({});
  const availableCustomWorldbookGroups = useMemo(() => (
      formData
          ? customWorldbookGroups.filter(group => (
              group.owner?.kind === 'universal'
              || (group.owner?.kind === 'character' && group.owner.charId === formData.id)
          ))
          : []
  ), [customWorldbookGroups, formData?.id]);
  const activeCustomWorldbookGroups = useMemo(() => (
      availableCustomWorldbookGroups.filter(group => (
          formData?.mountedWorldbookGroupIds?.includes(group.id)
      ))
  ), [availableCustomWorldbookGroups, formData?.mountedWorldbookGroupIds]);
  const [promotedMemoryViews, setPromotedMemoryViews] = useState<MemoryProjectionView[]>([]);
  const builtInCharacterIdsKey = characters.filter(char => char.isBuiltIn).map(char => char.id).join('|');
  const personaScope = useMemo(() => (
      resolvePersonaRouteScope(userProfile, characters, activeCharacterId)
  ), [userProfile, characters, activeCharacterId]);
  const linkedCharacterIdSet = useMemo(() => new Set(personaScope.linkedCharacterIds), [personaScope.linkedCharacterIds]);
  const directoryCharacters = useMemo(() => (
      [...characters].sort((a, b) => {
          const aLinked = linkedCharacterIdSet.has(a.id) ? 1 : 0;
          const bLinked = linkedCharacterIdSet.has(b.id) ? 1 : 0;
          if (aLinked !== bLinked) return bLinked - aLinked;
          if (a.id === activeCharacterId) return -1;
          if (b.id === activeCharacterId) return 1;
          return a.name.localeCompare(b.name, 'zh-CN');
      })
  ), [characters, linkedCharacterIdSet, activeCharacterId]);
  const linkedDirectoryCharacters = useMemo(
      () => directoryCharacters.filter(char => linkedCharacterIdSet.has(char.id)),
      [directoryCharacters, linkedCharacterIdSet],
  );
  const libraryCharacters = useMemo(
      () => directoryCharacters.filter(char => !linkedCharacterIdSet.has(char.id)),
      [directoryCharacters, linkedCharacterIdSet],
  );
  const promotedMemoryScope = useMemo(() => {
      if (!formData || !linkedCharacterIdSet.has(formData.id)) return undefined;
      return strictRelationshipScopeForProfile(formData.id, userProfile);
  }, [formData?.id, linkedCharacterIdSet, userProfile]);

  const loadPromotedMemoryViews = useCallback(async () => {
      if (!promotedMemoryScope) {
          setPromotedMemoryViews([]);
          return;
      }
      try {
          const result = await listMemoryProjectionViews({
              scope: promotedMemoryScope,
              target: 'relationship_memory',
          });
          setPromotedMemoryViews(result.views);
      } catch (error) {
          console.warn('[Character] failed to load promoted relationship memories', error);
          setPromotedMemoryViews([]);
      }
  }, [promotedMemoryScope?.progressBundleId, promotedMemoryScope?.personaMaskId, promotedMemoryScope?.charId]);

  useEffect(() => {
      void loadPromotedMemoryViews();
  }, [loadPromotedMemoryViews]);

  const applyPromotedMemoryChange = async (
      view: MemoryProjectionView,
      action: 'edit' | 'hide' | 'restore',
      patch?: MemoryProjectionPatch,
  ): Promise<boolean> => {
      const result = await reviseMemoryProjectionView({ view, action, patch });
      if (result.outcome === 'rejected') {
          addToast('这条整理结果的来源已经变化，请回到日历重新整理。', 'error');
          return false;
      }
      await loadPromotedMemoryViews();
      return true;
  };

  const openPromotedMemorySource = async (view: MemoryProjectionView) => {
      const dateKey = await resolveMemoryProjectionSourceDate({ view });
      if (!dateKey) {
          addToast('这条记录暂时找不到可打开的原文日期。', 'info');
          return;
      }
      queueDailyArchiveNavigation({
          scope: { ...view.record.scope },
          dateKey,
          sourceEvidenceIds: [...view.record.source.sourceEvidenceIds],
          createdAt: Date.now(),
      });
      setActiveCharacterId(view.record.scope.charId);
      openApp(AppID.DailyArchive);
  };

  const ensureCharacterLinkedToActiveMask = (
      char: CharacterProfile,
      options: { announceExisting?: boolean; announceLinked?: boolean } = {},
  ): boolean => {
      const result = linkCharacterToActivePersonaMask(userProfile, char.id);
      if (result.status === 'rejected') {
          addToast('请先在个人档案中建立一个身份面具', 'info');
          return false;
      }
      if (result.status === 'linked') {
          updateUserProfile({ personaMasks: result.profile.personaMasks });
          if (options.announceLinked !== false) {
              addToast(`${char.name} 已加入当前面具关系网`, 'success');
          }
      } else if (options.announceExisting) {
          addToast(`${char.name} 已经链接到当前面具`, 'info');
      }
      return true;
  };

  const handleLinkCharacterToActiveMask = (char: CharacterProfile, e?: React.MouseEvent) => {
      e?.stopPropagation();
      ensureCharacterLinkedToActiveMask(char, {
          announceExisting: true,
          announceLinked: true,
      });
  };

  const handleUnlinkCharacterFromActiveMask = (char: CharacterProfile, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const result = unlinkCharacterFromActivePersonaMask(userProfile, char.id);
      if (result.status === 'rejected') {
          addToast('当前没有可调整的身份面具', 'info');
          return;
      }
      if (result.status === 'already_unlinked') {
          addToast(`${char.name} 已经在角色库里`, 'info');
          return;
      }
      updateUserProfile({ personaMasks: result.profile.personaMasks });
      if (activeCharacterId === char.id) {
          const nextLinkedId = result.profile.personaMasks
              ?.find(mask => mask.id === result.activeMaskId)
              ?.linkedCharacterIds
              ?.find(id => characters.some(candidate => candidate.id === id));
          setActiveCharacterId(nextLinkedId || '');
      }
      addToast(`${char.name} 已收进角色库，聊天和资料都还在`, 'success');
  };

  const handleSetWantedCharacter = (char: CharacterProfile) => {
      if (!ensureCharacterLinkedToActiveMask(char, { announceLinked: false })) return;
      if (activeCharacterId === char.id) {
          addToast(`${char.name} 已经是首屏想见的人`, 'info');
          return;
      }
      setActiveCharacterId(char.id);
      addToast(`首屏想见的人已切换为 ${char.name}`, 'success');
  };

  const handleOpenChatForCharacter = (char: CharacterProfile) => {
      if (!ensureCharacterLinkedToActiveMask(char, { announceLinked: false })) return;
      setActiveCharacterId(char.id);
      openApp(AppID.Chat);
  };

  const handleLoadMiniMaxVoices = async () => {
      const minimaxApiKey = resolveMiniMaxApiKey(apiConfig);
      if (!minimaxApiKey) {
          addToast('请先在设置中填入 MiniMax API Key（未填写时会回退使用通用 API Key）', 'error');
          return;
      }

      setIsLoadingVoices(true);
      try {
          const result = await fetchMiniMaxVoices(minimaxApiKey, 'all');
          setVoiceOptions({
              system: result.system_voice,
              voice_cloning: result.voice_cloning,
              voice_generation: result.voice_generation,
          });
          addToast(`已拉取音色：系统 ${result.system_voice.length} / 复刻 ${result.voice_cloning.length} / 文生 ${result.voice_generation.length}`, 'success');
      } catch (e: any) {
          console.error('[MiniMax Voice] load failed', e);
          addToast(e?.message || '拉取 MiniMax 音色失败', 'error');
      } finally {
          setIsLoadingVoices(false);
      }
  };

  const applyVoiceToCharacter = (voice: MiniMaxVoiceItem, source: 'system' | 'voice_cloning' | 'voice_generation') => {
      if (!formData) return;
      handleChange('voiceProfile', {
          provider: 'minimax',
          voiceId: voice.voice_id,
          voiceName: voice.voice_name || '',
          source,
          model: formData.voiceProfile?.model || 'speech-2.8-hd',
          notes: formData.voiceProfile?.notes || '',
      });
      addToast(`已应用音色：${voice.voice_name || voice.voice_id}`, 'success');
  };

  // Load archive prompts from localStorage (shared with ChatApp)
  useEffect(() => {
      const savedPrompts = localStorage.getItem('chat_archive_prompts');
      if (savedPrompts) {
          try {
              const parsed = JSON.parse(savedPrompts);
              const merged = [...DEFAULT_ARCHIVE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('preset_'))];
              setArchivePrompts(merged);
          } catch(e) {}
      }
      const savedId = localStorage.getItem('chat_active_archive_prompt_id');
      if (savedId) setSelectedPromptId(savedId);
  }, []);

  useEffect(() => {
      let cancelled = false;
      const loadBondTimeLabels = async () => {
          const builtInChars = characters.filter(char => char.isBuiltIn);
          if (builtInChars.length === 0) {
              if (!cancelled) setBondTimeLabels({});
              return;
          }

          const entries = await Promise.all(builtInChars.map(async (char) => {
              try {
                  const messages = await DB.getMessagesByCharId(char.id);
                  return [char.id, formatBondTimeLabelFromMessages(messages)] as const;
              } catch (error) {
                  console.error('[Character] failed to load bond time', char.id, error);
                  return [char.id, '牵绊时间 0 天'] as const;
              }
          }));

          if (!cancelled) setBondTimeLabels(Object.fromEntries(entries));
      };

      loadBondTimeLabels();
      return () => { cancelled = true; };
  }, [builtInCharacterIdsKey, lastMsgTimestamp]);

  // Sync Ref with State
  useEffect(() => {
      editingIdRef.current = editingId;
  }, [editingId]);

  // CRITICAL FIX: Breaking the render loop.
  // We only sync from global 'characters' to local 'formData' when:
  // 1. We enter edit mode (view becomes detail)
  // 2. We switch character IDs
  useEffect(() => {
    if (editingId && view === 'detail') {
        // Only if formData is not set OR the ID doesn't match
        if (!formData || formData.id !== editingId) {
            const target = characters.find(c => c.id === editingId);
            if (target) setFormData(target);
        }
    }
  }, [editingId, view]); 

  // Worldbook IDs are the mount relationship. Keep an open character detail
  // view projected from the current library instead of showing a stale copy.
  useEffect(() => {
      if (!editingId || view !== 'detail') return;
      setFormData(previous => {
          if (!previous || previous.id !== editingId) return previous;
          const mountedWorldbooks = currentMountedWorldbooks(previous.mountedWorldbooks, worldbooks);
          const isCurrent = mountedWorldbooks.length === (previous.mountedWorldbooks?.length || 0) &&
              mountedWorldbooks.every((book, index) => book === previous.mountedWorldbooks?.[index]);
          return isCurrent ? previous : { ...previous, mountedWorldbooks };
      });
  }, [editingId, view, worldbooks]);
  
  // Auto-save Effect with Safety Guard
  useEffect(() => {
    if (formData && editingId) {
        // SAFETY GUARD: Only save if the formData ID matches the currently active editing ID.
        // This prevents overwriting Character B with Character A's data if a delayed async call updates formData.
        if (formData.id === editingId) {
            updateCharacter(editingId, formData);
        } else {
            console.warn(`Race condition prevented: Tried to save data for ${formData.id} into slot ${editingId}`);
        }
    }
  }, [formData]);

  const handleBack = () => {
      if (view === 'detail') {
          setView('list');
          setEditingId(null);
      } else closeApp();
  };

  const handleChange = (field: keyof CharacterProfile, value: any) => {
      // Functional update to prevent stale state issues in simple closures
      setFormData(prev => {
          if (!prev) return null;
          return { ...prev, [field]: value };
      });
  };

  const handleCompileBehaviorNote = useCallback(async (note: string) => {
      if (!formData) throw new Error('请先打开一张角色卡。');
      if (!behaviorCompilationRoute.ok) {
          throw new Error(behaviorCompilationRoute.message);
      }
      const now = Date.now();
      const relationshipScope = strictRelationshipScopeForProfile(
          formData.id,
          userProfile,
      );
      const result = await compilePlayerCharacterBehaviorBoundary({
          requestId: `character-panel-behavior:${formData.id}:${now.toString(36)}`,
          char: formData,
          source: 'character_panel',
          playerNote: note,
          relationshipScope,
          apiConfig: behaviorCompilationRoute.config,
          provider: behaviorCompilationRoute.provider,
          now,
      });
      let acceptedRule = result.rule;
      setFormData(previous => {
          if (!previous || previous.id !== formData.id) return previous;
          const receipts = [
              ...(previous.behaviorBoundaryCompilationReceipts || []),
          ];
          let behaviorBoundaryRules = previous.behaviorBoundaryRules || [];
          let receipt = result.receipt;
          if (result.rule) {
              const integrated = integrateCompiledCharacterBehaviorRule({
                  records: behaviorBoundaryRules,
                  candidate: result.rule,
                  now,
              });
              behaviorBoundaryRules = integrated.records;
              acceptedRule = integrated.acceptedRule;
              receipt = {
                  ...receipt,
                  ruleId: integrated.acceptedRule.id,
              };
          }
          return {
              ...previous,
              behaviorBoundaryRules,
              behaviorBoundaryCompilationReceipts: [
                  ...receipts,
                  receipt,
              ].slice(-100),
          };
      });
      return {
          created: Boolean(acceptedRule),
          diagnostic: result.candidate.diagnostic,
      };
  }, [
      behaviorCompilationRoute,
      formData,
      userProfile,
  ]);

  const isPromptLocked = Boolean(formData?.isBuiltIn && formData.lockPromptEditing);
  const canConfigureWorldbooks = Boolean(formData && (!isPromptLocked || formData.isBuiltIn));
  const formBondTimeLabel = formData?.isBuiltIn ? (bondTimeLabels[formData.id] || '牵绊时间 0 天') : '';
  const getCharacterSubtitle = (char: CharacterProfile) => (
      char.isBuiltIn ? (bondTimeLabels[char.id] || '牵绊时间 0 天') : undefined
  );
  const getLibraryWorldbook = (bookId?: string) => playerVisibleWorldbooks.find(book => book.id === bookId);
  const isBuiltInLibraryWorldbook = (bookId?: string) => Boolean(getLibraryWorldbook(bookId)?.isBuiltIn);
  const canToggleWorldbook = (bookId?: string) => {
      if (!bookId) return false;
      if (!isPromptLocked) return true;
      return isOptionalBuiltInWorldbook(bookId);
  };
  const isFixedBuiltInWorldbook = (bookId?: string) => (
      Boolean(formData?.isBuiltIn) &&
      Boolean(bookId) &&
      !isOptionalBuiltInWorldbook(bookId)
  );
  const toMountedWorldbookEntry = (book: Worldbook) => ({
      id: book.id,
      title: book.title,
      content: book.content,
      category: book.category,
      publicationStatus: getActiveWorldbookRevision(book).publicationStatus,
  });

  // Worldbook Logic
  const mountWorldbook = (bookId: string) => {
      if (!formData) return;
      if (!canToggleWorldbook(bookId)) {
          addToast('内置基础世界书固定启用，可选资料包可单独切换', 'info');
          return;
      }
      const book = playerVisibleWorldbooks.find(b => b.id === bookId);
      if (!book) return;

      const identityNotice = getDeepSpaceWorldbookIdentityNotice(book, userProfile);
      if (identityNotice?.requiresConfirm && identityRiskConfirmBookId !== bookId) {
          setIdentityRiskConfirmBookId(bookId);
          addToast('这本会覆盖 user 身份；再次点击确认启用', 'info');
          return;
      }

      const currentBooks = formData.mountedWorldbooks || [];
      if (currentBooks.some(b => b.id === book.id)) {
          addToast('已启用该资料包', 'info');
          return;
      }

      const newBookEntry = toMountedWorldbookEntry(book);
      handleChange('mountedWorldbooks', [...currentBooks, newBookEntry]);
      setIdentityRiskConfirmBookId(null);
      addToast(`已启用: ${book.title}`, 'success');
  };

  const mountWorldbookGroup = (groupId: string) => {
      if (!formData) return;
      const group = customWorldbookGroups.find(item => item.id === groupId);
      if (
          !group?.owner
          || (
              group.owner.kind === 'character'
              && group.owner.charId !== formData.id
          )
      ) {
          addToast('这组世界书不属于当前角色', 'error');
          return;
      }
      const current = formData.mountedWorldbookGroupIds || [];
      if (current.includes(groupId)) {
          addToast('这组已经启用', 'info');
          return;
      }
      handleChange('mountedWorldbookGroupIds', [...current, groupId]);
      addToast(`已启用“${group.category}”整组`, 'success');
  };

  const unmountWorldbookGroup = (groupId: string) => {
      if (!formData) return;
      handleChange(
          'mountedWorldbookGroupIds',
          (formData.mountedWorldbookGroupIds || []).filter(id => id !== groupId),
      );
      const group = customWorldbookGroups.find(item => item.id === groupId);
      addToast(`已停用“${group?.category || '这组世界书'}”`, 'success');
  };

  const unmountWorldbook = (bookId: string) => {
      if (!formData) return;
      if (!canToggleWorldbook(bookId)) {
          addToast('内置基础世界书固定启用，不能停用', 'info');
          return;
      }
      const currentBooks = formData.mountedWorldbooks || [];
      handleChange('mountedWorldbooks', currentBooks.filter(b => b.id !== bookId));
      setIdentityRiskConfirmBookId(null);
      const book = getLibraryWorldbook(bookId);
      addToast(`已停用: ${book?.title || '资料包'}`, 'success');
  };

  const copyWorldbookContent = async () => {
      if (!viewingWorldbook) return;
      try {
          await navigator.clipboard.writeText(viewingWorldbook.content || '');
          addToast('世界书内容已复制', 'success');
      } catch {
          addToast('复制失败，请手动选中文本', 'error');
      }
  };

  // ... (Other handlers unchanged)
  const handleToggleActiveMonth = (year: string, month: string) => {
      if (!formData) return;
      const key = `${year}-${month}`;
      const current = formData.activeMemoryMonths || [];
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      handleChange('activeMemoryMonths', next);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              setIsCompressing(true);
              const processedBase64 = await processImage(file);
              handleChange('avatar', processedBase64);
              addToast('头像上传成功', 'success');
          } catch (error: any) { 
              addToast(error.message || '图片处理失败', 'error'); 
          } finally {
              setIsCompressing(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      }
  };

  const handleCallPortraitFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              setIsCallPortraitCompressing(true);
              const processedBase64 = await processImage(file);
              handleChange('callPortrait', processedBase64);
              addToast('通话立绘上传成功', 'success');
          } catch (error: any) {
              addToast(error.message || '图片处理失败', 'error');
          } finally {
              setIsCallPortraitCompressing(false);
              if (callPortraitInputRef.current) callPortraitInputRef.current.value = '';
          }
      }
  };

  const clearCallPortrait = () => {
      handleChange('callPortrait', undefined);
      addToast('通话立绘已改为跟随角色头像/皮肤', 'info');
  };
  
  const handleRefineMonth = async (year: string, month: string, rawText: string, formattedPrompt?: string) => {
      if (!apiConfig.apiKey) { addToast('请先配置 API Key', 'error'); return; }
      if (!formData) return;

      const targetId = formData.id; // LOCK ID

      // Build lightweight character identity context (no memories - we're generating those)
      let identityContext = `[角色身份]\n名字: ${formData.name}\n`;
      if (formData.systemPrompt) identityContext += `核心性格/指令:\n${formData.systemPrompt}\n`;
      if (formData.worldview?.trim()) identityContext += `世界观设定: ${formData.worldview}\n`;
      identityContext += `互动对象: ${userProfile.name}`;
      if (userProfile.bio) identityContext += ` (${userProfile.bio})`;
      identityContext += '\n\n';

      const prompt = identityContext + (formattedPrompt || `Task: Summarize the following logs (${year}-${month}) into a concise memory. Language: Same as logs (Chinese). ${rawText}`);

      try {
          const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
              body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.3 })
          });
          if (!response.ok) throw new Error('API Request failed');
          const data = await safeResponseJson(response);
          const summary = data.choices[0].message.content.trim();
          const key = `${year}-${month}`;
          
          // CHECK IF USER SWITCHED
          if (editingIdRef.current === targetId) {
              // Still on same page
              handleChange('refinedMemories', { ...(formData.refinedMemories || {}), [key]: summary });
              addToast(`${year}年${month}月记忆精炼完成`, 'success');
          } else {
              // Switched page - Save to DB directly
              const currentRefined = characters.find(c => c.id === targetId)?.refinedMemories || {};
              updateCharacter(targetId, { refinedMemories: { ...currentRefined, [key]: summary } });
              addToast('后台任务完成：记忆已保存到原角色', 'success');
          }
      } catch (e: any) { addToast(`精炼失败: ${e.message}`, 'error'); }
  };

  const handleDeleteMemories = (ids: string[]) => { if (!formData) return; handleChange('memories', (formData.memories || []).filter(m => !ids.includes(m.id))); addToast(`已删除 ${ids.length} 条记忆`, 'success'); };
  const handleUpdateMemory = (id: string, newSummary: string) => { if (!formData) return; handleChange('memories', (formData.memories || []).map(m => m.id === id ? { ...m, summary: newSummary } : m)); addToast('记忆已更新', 'success'); };
  
  // NEW: Core Memory Handlers
  const handleUpdateRefinedMemory = (year: string, month: string, newContent: string) => {
      if (!formData) return;
      const key = `${year}-${month}`;
      handleChange('refinedMemories', { ...(formData.refinedMemories || {}), [key]: newContent });
      addToast('核心记忆已更新', 'success');
  };

  const handleDeleteRefinedMemory = (year: string, month: string) => {
      if (!formData || !formData.refinedMemories) return;
      const key = `${year}-${month}`;
      const newRefined = { ...formData.refinedMemories };
      delete newRefined[key];
      handleChange('refinedMemories', newRefined);
      addToast('核心记忆已删除', 'success');
  };

  const handleExportPreview = () => { if (!formData) return; const mems = formData.memories as any[]; if (!mems || mems.length === 0) { addToast('暂无记忆数据可导出', 'info'); return; } const sortedMemories = [...mems].sort((a, b) => a.date.localeCompare(b.date)); let text = `【角色档案】\nName: ${formData.name}\nExported: ${new Date().toLocaleString()}\n\n`; if (formData.refinedMemories) { text += `=== 核心记忆 ===\n`; Object.entries(formData.refinedMemories).sort().forEach(([k, v]) => { text += `[${k}]: ${v}\n`; }); text += `\n=== 详细日志 ===\n`; } let currentYear = '', currentMonth = ''; sortedMemories.forEach(mem => { const match = mem.date.match(/(\d{4})[-/年](\d{1,2})/); if (match) { const y = match[1], m = match[2]; if (y !== currentYear) { text += `\n[ ${y}年 ]\n`; currentYear = y; currentMonth = ''; } if (m !== currentMonth) { text += `\n-- ${parseInt(m)}月 --\n\n`; currentMonth = m; } } text += `${mem.date} ${mem.mood ? `(#${mem.mood})` : ''}\n${mem.summary}\n\n--------------------------\n\n`; }); setExportText(text); setShowExportModal(true); navigator.clipboard.writeText(text).then(() => addToast('内容已自动复制到剪贴板', 'info')).catch(() => {}); };
  const handleNativeShare = async () => { if(!exportText) return; if (Capacitor.isNativePlatform()) { try { const fileName = `${formData?.name || 'character'}_memories.txt`; await Filesystem.writeFile({ path: fileName, data: exportText, directory: Directory.Cache, encoding: Encoding.UTF8 }); const uri = await Filesystem.getUri({ directory: Directory.Cache, path: fileName }); await Share.share({ title: '记忆档案', files: [uri.uri] }); } catch(e: any) { console.error("Native share failed", e); addToast('分享组件调起失败，请直接复制文本', 'error'); } } };
  const handleWebFileDownload = () => { const fileName = `${formData?.name || 'character'}_memories.txt`; const blob = new Blob([exportText], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); addToast('已触发浏览器下载', 'success'); };
  
  const handleImportMemories = async () => { 
      if (!importText.trim() || !apiConfig.apiKey) { addToast('请检查输入内容或 API 设置', 'error'); return; } 
      if (!formData) return;
      
      const targetId = formData.id; // LOCK ID
      setIsProcessingMemory(true); 
      setImportStatus('正在链接神经云端进行清洗...'); 
      
      try { 
          const prompt = `Task: Convert this text log into a JSON array. Format: [{ "date": "YYYY-MM-DD", "summary": "...", "mood": "..." }] Text: ${importText.substring(0, 8000)}`; 
          const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` }, body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.1 }) }); 
          if (!response.ok) throw new Error(`HTTP Error: ${response.status}`); 
          const data = await safeResponseJson(response); 
          let content = data.choices?.[0]?.message?.content || ''; 
          content = content.replace(/```json/g, '').replace(/```/g, '').trim(); 
          const firstBracket = content.indexOf('['); 
          const lastBracket = content.lastIndexOf(']'); 
          if (firstBracket !== -1 && lastBracket !== -1) { content = content.substring(firstBracket, lastBracket + 1); } 
          let parsed; try { parsed = JSON.parse(content); } catch (e) { throw new Error('解析返回数据失败'); } 
          let targetArray = Array.isArray(parsed) ? parsed : (parsed.memories || parsed.data); 
          
          if (Array.isArray(targetArray)) { 
              const newMems = targetArray.map((m: any) => ({ id: `mem-${Date.now()}-${Math.random()}`, date: m.date || '未知', summary: m.summary || '无内容', mood: m.mood || '记录' })); 
              
              if (editingIdRef.current === targetId) {
                  handleChange('memories', [...(formData.memories || []), ...newMems]); 
                  setShowImportModal(false); 
                  addToast(`成功导入 ${newMems.length} 条记忆`, 'success'); 
              } else {
                  // Background update
                  const currentMems = characters.find(c => c.id === targetId)?.memories || [];
                  updateCharacter(targetId, { memories: [...currentMems, ...newMems] });
                  addToast('后台任务完成：导入记忆已保存', 'success');
              }
          } else { throw new Error('结构错误'); } 
      } catch (e: any) { setImportStatus(`错误: ${e.message || '未知错误'}`); addToast('记忆清洗失败', 'error'); } finally { setIsProcessingMemory(false); } 
  };
  
  const handleBatchSummarize = async () => {
        if (!apiConfig.apiKey || !formData) return;
        
        const targetId = formData.id; // LOCK ID
        setIsBatchProcessing(true);
        setBatchProgress('Initializing...');
        
        try {
            const msgs = await DB.getMessagesByCharId(targetId);
            const validMsgs = msgs.filter(m => !formData.hideBeforeMessageId || m.id >= formData.hideBeforeMessageId);
            const msgsByDate: Record<string, any[]> = {};
            
            msgs.forEach(m => {
                const d = new Date(m.timestamp);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                if (batchRange.start && dateStr < batchRange.start) return;
                if (batchRange.end && dateStr > batchRange.end) return;
                
                if (!msgsByDate[dateStr]) msgsByDate[dateStr] = [];
                msgsByDate[dateStr].push(m);
            });

            const dates = Object.keys(msgsByDate).sort();
            const newMemories: MemoryFragment[] = [];

            const baseContext = ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(formData, userProfile);

            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                setBatchProgress(`Processing ${date} (${i+1}/${dates.length})`);
                
                const dayMsgs = msgsByDate[date];
                const rawLog = dayMsgs.map(m => {
                    const time = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
                    const sender = m.role === 'user' ? userProfile.name : (m.role === 'system' ? '[系统]' : formData.name);
                    let content = m.content;
                    if (m.type === 'image') content = '[图片/Image]';
                    else if (m.type === 'emoji') content = `[表情包: ${m.content.split('/').pop() || 'sticker'}]`;
                    else if ((m.type as string) === 'score_card') {
                        try {
                            const card = m.metadata?.scoreCard || JSON.parse(m.content);
                            if (card?.type === 'lifesim_reset_card') {
                                content = formatLifeSimResetCardForContext(card, formData.name);
                            } else if (card?.type === 'guidebook_card') {
                                const diff = (card.finalAffinity ?? 0) - (card.initialAffinity ?? 0);
                                content = `[攻略本游戏结算] ${formData.name}和${userProfile.name}玩了一局"攻略本"恋爱小游戏（${card.rounds || '?'}回合）。结局：「${card.title || '???'}」 好感度变化：${card.initialAffinity} → ${card.finalAffinity}（${diff >= 0 ? '+' : ''}${diff}） ${formData.name}的评语：${card.charVerdict || '无'} ${formData.name}对${userProfile.name}的新发现：${card.charNewInsight || '无'}`;
                            } else if (card?.type === 'whiteday_card') {
                                const letterTitle = card.letterTitle || '心契留信';
                                const letterBody = card.letterBody || card.chocolateDialogue || card.finalDialogue || '';
                                const scoreNote = Number.isFinite(card.score) && Number.isFinite(card.total)
                                    ? `合拍值 ${card.score}/${card.total}。`
                                    : '';
                                const profileNote = Array.isArray(card.profileInsights) && card.profileInsights.length > 0
                                    ? `侧写线索：${card.profileInsights.join('；')}`
                                    : card.profileSummary ? `侧写线索：${card.profileSummary}` : '';
                                content = `[心契] ${userProfile.name}完成了与${formData.name}的双人互动游戏，收到一封「${letterTitle}」。${scoreNote}${letterBody ? `信件内容：${letterBody}` : ''}${profileNote}`;
                            } else {
                                content = '[系统卡片]';
                            }
                        } catch { content = '[系统卡片]'; }
                    }
                    else if (m.type === 'interaction') content = `[系统: ${userProfile.name}戳了${formData.name}一下]`;
                    else if (m.type === 'transfer') content = `[系统: ${userProfile.name}转账 ${m.metadata?.amount}]`;

                    return `[${time}] ${sender}: ${content}`;
                }).join('\n');

                // Use selected template (same as ChatApp) with variable substitution
                const templateObj = archivePrompts.find(p => p.id === selectedPromptId) || DEFAULT_ARCHIVE_PROMPTS[0];
                let prompt = baseContext + '\n\n' + templateObj.content;
                prompt = prompt.replace(/\$\{dateStr\}/g, date);
                prompt = prompt.replace(/\$\{char\.name\}/g, formData.name);
                prompt = prompt.replace(/\$\{userProfile\.name\}/g, userProfile.name);
                prompt = prompt.replace(/\$\{rawLog.*?\}/g, rawLog.substring(0, 200000));

                const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 8000, 
                        temperature: 0.5
                    })
                });

                if (response.ok) {
                    const data = await safeResponseJson(response);
                    let summary = data.choices?.[0]?.message?.content || '';
                    summary = summary.replace(/^["']|["']$/g, '').trim(); 
                    
                    if (summary) {
                        newMemories.push({
                            id: `mem-${Date.now()}-${Math.random()}`,
                            date: date,
                            summary: summary,
                            mood: 'auto'
                        });
                    }
                }
                await new Promise(r => setTimeout(r, 500));
            }

            if (editingIdRef.current === targetId) {
                handleChange('memories', [...(formData.memories || []), ...newMemories]);
                setBatchProgress('Done!');
                setTimeout(() => {
                    setIsBatchProcessing(false);
                    setShowBatchModal(false);
                    addToast(`Processed ${newMemories.length} days`, 'success');
                }, 1000);
            } else {
                // Background update
                const currentMems = characters.find(c => c.id === targetId)?.memories || [];
                updateCharacter(targetId, { memories: [...currentMems, ...newMemories] });
                
                // Cleanup UI state since we are elsewhere
                setIsBatchProcessing(false);
                setShowBatchModal(false); // Modal is on current view, but we are likely on another view. 
                // Since this component is unmounted when view changes, this code block might not even run if unmounted.
                // However, if we switched from Detail to List view, Character.tsx might still be mounted but hidden? 
                // Actually Character.tsx unmounts detail view content if view changes.
                // If view changed, this function probably aborted or memory leaked.
                // Assuming component is still mounted (e.g. switched to Memory tab of another character in same app instance - wait, Character app only shows one at a time).
                addToast(`后台任务完成：为 ${formData.name} 生成了 ${newMemories.length} 条记忆`, 'success');
            }

        } catch (e: any) {
            setBatchProgress(`Error: ${e.message}`);
            setIsBatchProcessing(false);
        }
    };

  const handleGenerateImpression = async (type: 'initial' | 'update') => {
      if (!formData || !apiConfig.apiKey) {
          addToast('请先配置 API Key', 'error');
          return;
      }
      
      const targetId = formData.id; // LOCK ID
      setIsGeneratingImpression(true);
      try {
          const charName = formData.name;
          const boundUser = userProfile;

          // 构建完整角色上下文（包含人设、世界观、用户档案、精炼记忆等宏观信息）
          const fullContext = ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(formData, userProfile);

          let messagesToAnalyze = "";

          // 第一层：完整上下文 —— 宏观人格分析的基石
          messagesToAnalyze += `\n【完整角色上下文 (Full Context - 宏观分析的基石)】:\n${fullContext}\n`;

          // 第二层：最近聊天 —— 仅用于检测近期变化
          // 记忆部分已包含在 buildCoreContext 中（精炼月度总结 + 点亮月份的详细记忆），
          // 与聊天时角色能看到的记忆完全一致，不再额外抓取。
          // 重置模式下大幅减少近期聊天的数量，避免近因偏差
          const recentMsgs = await DB.getRecentMessagesByCharId(targetId, type === 'initial' ? 15 : 50);
          const msgText = recentMsgs.map(m => {
              let content = m.content;
              if (m.type === 'image') content = '[图片]';
              else if (m.type === 'emoji') content = '[表情包]';
              else if (m.type === 'interaction') content = `[戳了一下]`;
              else if (m.type === 'transfer') content = `[转账 ${m.metadata?.amount ?? ''}]`;
              else if ((m.type as string) === 'score_card') {
                  try {
                      const card = m.metadata?.scoreCard || JSON.parse(m.content);
                      if (card?.type === 'lifesim_reset_card') {
                          content = formatLifeSimResetCardForContext(card, charName);
                      } else if (card?.type === 'guidebook_card') {
                          const diff = (card.finalAffinity ?? 0) - (card.initialAffinity ?? 0);
                          content = `[攻略本结算] 结局「${card.title || '???'}」好感${diff >= 0 ? '+' : ''}${diff}`;
                      } else if (card?.type === 'whiteday_card') {
                          content = `[心契] 「${card.letterTitle || '心契留信'}」`;
                      } else {
                          content = '[系统卡片]';
                      }
                  } catch { content = '[系统卡片]'; }
              }
              return `${m.role === 'user' ? boundUser.name : charName}: ${content}`;
          }).join('\n');

          if (msgText) messagesToAnalyze += `\n【最近的聊天记录 (Recent Chats - 仅用于检测近期变化)】:\n${msgText}\n`;

          // 重置时不传旧印象，避免模型锚定在旧内容上
          const normalizedCurrentImpression = normalizeUserImpression(formData.impression);
          const currentProfileJSON = (type === 'initial') ? "null" : (normalizedCurrentImpression ? JSON.stringify(normalizedCurrentImpression, null, 2) : "null");
          const isInitialGeneration = type === 'initial' || !normalizedCurrentImpression;
          
          const summaryInstruction = isInitialGeneration 
              ? "用一段话（100字以内）概括你对TA的【宏观整体印象】。不要局限于最近的对话，而是定义TA本质上是个什么样的人，以及TA对你意味着什么。必须第一人称。"
              : "基于旧的总结，结合新发现，更新你对TA的【宏观整体印象】。请保持长期视角的连贯性，除非发生了重大转折，否则不要因为一两句闲聊就彻底推翻对TA的本质判断。必须第一人称。";
              
          const listInstruction = isInitialGeneration ? `"项目1", "项目2"` : `"保留旧项目", "新项目"`;
          const changesInstruction = isInitialGeneration ? "" : `"描述变化1", "描述变化2"`;

          const prompt = `
当前档案（你过去的观察）
\`\`\`json
${currentProfileJSON}
\`\`\`
${messagesToAnalyze}

【重要：语气与视角】
你【就是】"${charName}"。这份档案是你写的【私人笔记】。
因此，所有总结性的字段（如 \`core_values\`, \`summary\`, \`emotion_summary\` 等），【必须】使用你的第一人称（"我"）视角来撰写。

【核心指令：数据层级与权重分配】
1. **完整角色上下文 (Full Context)**: 这是你【最重要的分析基础】。它包含了你的人设、世界观、用户档案、以及你的全部记忆（月度核心总结 + 激活月份的每日详细回忆）。你对TA的核心性格、核心价值观、互动模式、人格特质的判断，必须主要基于这些跨越完整时间线的宏观数据。你必须【平等对待】早期记忆和近期记忆，从整段关系的完整弧线中提炼人格特征。
2. **近期聊天 (Recent Chats)**: 这【仅仅】代表TA当下的状态切片。它的作用【严格限定】在更新 [behavior_profile.emotion_summary] 和 [observed_changes] 两个字段。除非发生了重大事件（如价值观冲突、人生转折），否则【绝对不要】因为最近几次聊天的情绪波动就改变对TA本质人格的判断。
${isInitialGeneration ? `
【重置模式特别指令 - CRITICAL】
这是一次【完全重置】，你需要从零开始，基于所有可用的宏观数据重新构建对TA的完整认知。
- 你的分析必须覆盖从最早记忆到最新记忆的【完整时间跨度】
- 早期记忆和近期记忆拥有【相同的权重】——不要因为某些记忆发生得更近就赋予它们更大的影响
- personality_core、value_map、emotion_schema 必须反映TA在【整段关系中】展现出的稳定特征，而非仅仅是近期状态
- 如果早期记忆和近期记忆中TA的表现有差异，请在 observed_changes 中记录这种演变，但 personality_core 应反映最持久稳定的特质
` : ''}
【反面教材 - 严禁出现】
- ❌ 仅根据最近聊天就总结"TA是一个喜欢讨论XX话题的人" —— 这是把近期话题当成了人格特质
- ❌ personality_core.summary 里出现"最近"、"这几天"等时间限定词 —— summary 应该是跨越所有记忆的宏观总结
- ✅ 正确做法：personality_core 基于完整上下文和长期记忆，observed_changes 基于近期聊天与长期印象的对比

分析指令：五维画像更新 (第一人称视角)
根据【强制对比协议】和你自己的视角，分析新消息，并${isInitialGeneration ? '【生成】' : '【增量更新】'}以下JSON结构。

输出JSON结构v3.0（严格遵守, 不要用markdown代码块包裹，直接返回JSON）
{
  "version": 3.0,
  "lastUpdated": ${Date.now()},
  "value_map": {
    "likes": [${listInstruction}],
    "dislikes": [${listInstruction}],
    "core_values": "..."
  },
  "behavior_profile": {
    "tone_style": "...",
    "emotion_summary": "...",
    "response_patterns": "..."
  },
  "emotion_schema": {
    "triggers": { 
        "positive": [${listInstruction}],
        "negative": [${listInstruction}]
    },
    "comfort_zone": "...",
    "stress_signals": [${listInstruction}]
  },
  "personality_core": {
    "observed_traits": [${listInstruction}],
    "interaction_style": "...",
    "summary": "..."
  },
  "mbti_analysis": {
    "type": "XXXX",
    "reasoning": "...",
    "dimensions": {
        "e_i": 50,
        "s_n": 50,
        "t_f": 50,
        "j_p": 50
    }
  },
  "observed_changes": [
    ${changesInstruction}
  ]
}
注意：observed_changes 的每一项必须是纯字符串（string），例如 ["最近变得更开朗了", "开始主动分享日常"]。严禁使用对象格式如 {"period": "...", "description": "..."}。`;

          const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
              body: JSON.stringify({
                  model: apiConfig.model,
                  messages: [{ role: "user", content: prompt }],
                  max_tokens: 8000, 
                  temperature: 0.5
              })
          });

          if (!response.ok) throw new Error('API Request Failed');
          const data = await safeResponseJson(response);
          let content = data.choices[0].message.content;
          
          content = content.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = normalizeUserImpression(JSON.parse(content));
          if (!parsed) throw new Error('关系印象生成结果不完整');

          if (editingIdRef.current === targetId) {
              handleChange('impression', parsed);
              addToast(isInitialGeneration ? '关系印象已生成' : '关系印象已更新', 'success');
          } else {
              updateCharacter(targetId, { impression: parsed });
              addToast('后台任务完成：关系印象已更新到原角色', 'success');
          }

      } catch (e: any) {
          console.error(e);
          addToast(`生成失败: ${e.message}`, 'error');
      } finally {
          setIsGeneratingImpression(false);
      }
  };

  const confirmDeleteCharacter = async () => {
      if (deleteConfirmTarget) {
          try {
              await deleteCharacter(deleteConfirmTarget);
              setDeleteConfirmTarget(null);
              addToast('角色与其专属世界书组已一起收好', 'success');
          } catch (error) {
              addToast(error instanceof Error ? error.message : '没有删除成功', 'error');
          }
      }
  };

  const handleExportCard = async () => {
      if (!formData) return;
      if (formData.isBuiltIn && formData.lockPromptEditing) {
          addToast('内置角色卡不可导出', 'info');
          return;
      }
      
      const {
          id, memories, refinedMemories, activeMemoryMonths, impression, guidebookInsights,
          ...cardProps
      } = formData;

      const exportData: CharacterExportData = {
          ...cardProps,
          version: 1,
          type: 'aether_character_card'
      };

      if (formData.bubbleStyle) {
          const customTheme = customThemes.find(t => t.id === formData.bubbleStyle);
          if (customTheme) {
              exportData.embeddedTheme = customTheme;
          }
      }

      const json = JSON.stringify(exportData, null, 2);
      const fileName = `${formData.name || 'Character'}_Card.json`;
      
      if (Capacitor.isNativePlatform()) {
          try {
              await Filesystem.writeFile({
                  path: fileName,
                  data: json,
                  directory: Directory.Cache,
                  encoding: Encoding.UTF8,
              });
              const uriResult = await Filesystem.getUri({
                  directory: Directory.Cache,
                  path: fileName,
              });
              await Share.share({
                  title: '导出角色卡',
                  files: [uriResult.uri],
              });
              addToast('已调起分享', 'success');
              return;
          } catch (e: any) {
              console.error("Native Export Error", e);
              addToast('原生分享失败，尝试浏览器分享/下载', 'info');
          }
      }

      try {
          // Align with Settings export fallback logic for wrapped webviews:
          // try Web Share first, then fallback to download.
          const file = new File([json], fileName, { type: 'application/json' });
          const canShareFile = typeof navigator !== 'undefined'
              && typeof navigator.share === 'function'
              && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));

          if (canShareFile) {
              await navigator.share({
                  title: '导出角色卡',
                  files: [file],
              });
              addToast('已调起分享', 'success');
              return;
          }
      } catch (e: any) {
          // User cancellation and unsupported cases should continue to download fallback.
          if (e?.name !== 'AbortError') {
              console.error('Web Share Export Error', e);
          }
      }

          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          addToast('角色卡已生成并下载', 'success');
  };

  const handleImportCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const extension = file.name.split('.').pop()?.toLocaleLowerCase();
          const document = extension === 'png'
              ? extractTavernCharacterCardFromPng(await file.arrayBuffer())
              : JSON.parse(await file.text());

          if (isTavernCharacterCardDocument(document)) {
              const card = parseTavernCharacterCard(document);
              const newCharacterId = `char-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
              const importedGroup = createWorldbookGroupAssignment({
                  name: card.name,
                  owner: { kind: 'character', charId: newCharacterId },
              });
              const importedWorldbooks = card.worldbooks.length
                  ? await addImportedWorldbooks(card.worldbooks.map((draft, index) => ({
                      clientId: `tavern-card-${index + 1}`,
                      ...draft,
                  })), importedGroup)
                  : [];
              const mountedLibrary = importedWorldbooks.filter(isWorldbookPublished);
              const avatar = extension === 'png'
                  ? await processImage(file, { maxWidth: 1200, quality: 0.85 })
                  : createImportedCharacterAvatar(card.name);
              const newChar: CharacterProfile = {
                  id: newCharacterId,
                  name: card.name,
                  avatar,
                  description: '',
                  systemPrompt: card.systemPrompt,
                  mountedWorldbooks: [],
                  mountedWorldbookGroupIds: mountedLibrary.length ? [importedGroup.id] : [],
                  chatAppearancePreset: 'minimal',
                  emotionConfig: { enabled: true },
                  memories: [],
                  refinedMemories: {},
                  activeMemoryMonths: [],
                  contextLimit: 500,
              };
              await addPreparedCharacter(newChar);
              if (ensureCharacterLinkedToActiveMask(newChar, { announceLinked: false })) {
                  setActiveCharacterId(newChar.id);
              }
              addToast(`已导入 ${card.name} 和 ${mountedLibrary.length} 条启用世界书`, 'success');
              const heldCount = card.worldbooks.length - mountedLibrary.length;
              const openingCount = card.alternateGreetingsCount + (card.firstMessage ? 1 : 0);
              const importNotes = [
                  heldCount ? `已归档 ${heldCount} 条原文件停用世界书` : '',
                  openingCount ? `${openingCount} 条开场暂不导入` : '',
                  card.regexScriptCount ? `${card.regexScriptCount} 条酒馆正则暂不导入` : '',
              ].filter(Boolean);
              if (importNotes.length) {
                  addToast(importNotes.join('；'), 'info');
              }
              return;
          }

          const data = document as CharacterExportData;
          if (data.type !== 'aether_character_card') throw new Error('这不是可识别的角色卡文件。');
          if (data.embeddedTheme && !customThemes.some(theme => theme.id === data.embeddedTheme!.id)) {
              addCustomTheme(data.embeddedTheme);
          }
          const newChar: CharacterProfile = {
              ...data,
              id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              chatAppearancePreset: data.chatAppearancePreset || (
                  data.bubbleStyle && data.bubbleStyle !== 'default' ? 'custom' : 'minimal'
              ),
              emotionConfig: data.emotionConfig || { enabled: true },
              memories: [],
              refinedMemories: {},
              activeMemoryMonths: [],
              embeddedTheme: undefined,
          } as CharacterProfile;
          await addPreparedCharacter(newChar);
          if (ensureCharacterLinkedToActiveMask(newChar, { announceLinked: false })) {
              setActiveCharacterId(newChar.id);
          }
          addToast(`角色 ${newChar.name} 导入成功`, 'success');
      } catch (err: any) {
          console.error(err);
          addToast(err.message || '导入失败', 'error');
      } finally {
          if (cardImportRef.current) cardImportRef.current.value = '';
      }
  };

  return (
    <div className="h-full w-full bg-slate-50/30 font-light relative">
       {view === 'list' ? (
           <div className="flex flex-col h-full animate-fade-in">
               <AppHeader
                   title="通讯录"
                   subtitle={`当前生活 ${personaScope.linkedCharacters.length} 位 · 角色库 ${libraryCharacters.length} 位`}
                   onBack={closeApp}
                   className="bg-white/60 border-white/40"
                   titleClassName="truncate text-xl font-light tracking-tight text-slate-800"
                   subtitleClassName="mt-0.5 truncate text-xs font-normal text-slate-400"
                   right={(
                       <div className="flex items-center gap-2">
                       <AppHeaderIconButton onClick={() => cardImportRef.current?.click()} className="bg-white/60 hover:bg-white/90 text-slate-600" title="导入角色卡">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 7.5 12 12m0 0 4.5-4.5M12 12V3" />
                           </svg>
                       </AppHeaderIconButton>
                       <AppHeaderAddButton onClick={addCharacter} className="bg-rose-500 text-white hover:bg-rose-400 shadow-sm shadow-rose-200" title="新建角色" />
                       </div>
                   )}
               />
               <input type="file" ref={cardImportRef} className="hidden" accept=".json,.png,application/json,image/png" onChange={handleImportCard} />
               <div className="flex-1 overflow-y-auto px-5 pt-3 pb-20 no-scrollbar flex flex-col gap-3">
                   <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[11px] leading-relaxed text-indigo-500">
                       「当前生活」会参与聊天、来电、朋友圈和故事生成；「角色库」只保存资料，不会自己进入这个面具的生活。
                   </div>
                   <section className="flex flex-col gap-3">
                       <div className="flex items-center justify-between px-1 pt-1">
                           <h2 className="text-xs font-bold tracking-wide text-slate-600">当前生活</h2>
                           <span className="text-[10px] text-slate-400">{personaScope.activeMaskLabel || '当前面具'} · {linkedDirectoryCharacters.length} 位</span>
                       </div>
                       {linkedDirectoryCharacters.length === 0 ? (
                           <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 px-4 py-5 text-center text-xs text-slate-400">
                               从下方角色库加入一位，才会出现在生活类 App 里。
                           </div>
                       ) : linkedDirectoryCharacters.map(char => (
                           <CharacterCard
                               key={char.id}
                               char={char}
                               avatarFramePreset={resolveAvatarFramePreset(theme, char.avatarFramePresetId)}
                               subtitle={getCharacterSubtitle(char)}
                               isActive={char.id === activeCharacterId}
                               isLinkedToMask
                               onUnlinkFromMask={(e) => handleUnlinkCharacterFromActiveMask(char, e)}
                               onClick={() => { setEditingId(char.id); setView('detail'); }}
                               onSetWanted={(e) => {
                                   e.stopPropagation();
                                   handleSetWantedCharacter(char);
                               }}
                               onDelete={(e) => {
                                   e.stopPropagation();
                                   setDeleteConfirmTarget(char.id);
                               }}
                           />
                       ))}
                   </section>
                   <section className="mt-2 flex flex-col gap-3">
                       <div className="flex items-center justify-between px-1 pt-1">
                           <h2 className="text-xs font-bold tracking-wide text-slate-600">角色库</h2>
                           <span className="text-[10px] text-slate-400">资料仍完整保存 · {libraryCharacters.length} 位</span>
                       </div>
                       {libraryCharacters.length === 0 ? (
                           <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 px-4 py-5 text-center text-xs text-slate-400">
                               暂时没有收起的角色。
                           </div>
                       ) : libraryCharacters.map(char => (
                           <CharacterCard
                               key={char.id}
                               char={char}
                               avatarFramePreset={resolveAvatarFramePreset(theme, char.avatarFramePresetId)}
                               subtitle={getCharacterSubtitle(char)}
                               isActive={false}
                               isLinkedToMask={false}
                               onLinkToMask={(e) => handleLinkCharacterToActiveMask(char, e)}
                               onClick={() => { setEditingId(char.id); setView('detail'); }}
                               onSetWanted={(e) => {
                                   e.stopPropagation();
                                   handleSetWantedCharacter(char);
                               }}
                               onDelete={(e) => {
                                   e.stopPropagation();
                                   setDeleteConfirmTarget(char.id);
                               }}
                           />
                       ))}
                   </section>
               </div>
           </div>
       ) : formData && (
           <div className="flex flex-col h-full animate-fade-in bg-slate-50/50 relative">
               <AppHeader
                   title={formData.name || '角色档案'}
                   onBack={handleBack}
                   className="bg-white/70 border-white/45"
                   titleClassName="truncate text-lg font-semibold tracking-wide text-slate-800"
                   right={(
                       <div className="flex items-center gap-2">
                           <button
                               onClick={() => handleSetWantedCharacter(formData)}
                               className={`text-xs px-3 py-1.5 rounded-full font-bold shadow-sm flex items-center gap-1 active:scale-95 transition-all ${
                                   formData.id === activeCharacterId
                                       ? 'bg-rose-500 text-white shadow-rose-200'
                                       : 'bg-white/70 text-slate-500 border border-white/80 hover:text-rose-500'
                               }`}
                           >
                               <Heart size={13} weight={formData.id === activeCharacterId ? 'fill' : 'bold'} />
                               {formData.id === activeCharacterId ? '想见' : '设为想见'}
                           </button>
                           <button onClick={() => handleOpenChatForCharacter(formData)} className="text-xs px-3 py-1.5 bg-primary text-white rounded-full font-bold shadow-sm shadow-primary/30 flex items-center gap-1 active:scale-95 transition-transform"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926H16.5a.75.75 0 0 1 0 1.5H3.693l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" /></svg>发消息</button>
                       </div>
                   )}
               />
               <div className="shrink-0 z-30 bg-white/58 backdrop-blur-md px-5 pt-1 border-b border-white/40">
                   <div className="flex gap-4 text-xs font-medium text-slate-400 pl-1">
                       <button onClick={() => setDetailTab('identity')} className={`pb-2 transition-colors relative ${detailTab === 'identity' ? 'text-slate-800' : ''}`}>设定{detailTab === 'identity' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}</button>
                       <button onClick={() => setDetailTab('boundary')} className={`pb-2 transition-colors relative ${detailTab === 'boundary' ? 'text-slate-800' : ''}`}>行为边界{detailTab === 'boundary' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}</button>
                       <button onClick={() => setDetailTab('memory')} className={`pb-2 transition-colors relative ${detailTab === 'memory' ? 'text-slate-800' : ''}`}>记忆 ({(formData.memories || []).length + promotedMemoryViews.filter(item => !item.hidden).length}){detailTab === 'memory' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}</button>
                       <button onClick={() => setDetailTab('impression')} className={`pb-2 transition-colors relative ${detailTab === 'impression' ? 'text-slate-800' : ''}`}>关系印象{detailTab === 'impression' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}</button>
                   </div>
               </div>
               <div className="flex-1 overflow-y-auto p-5 no-scrollbar pb-10">
                   {detailTab === 'identity' && (
                       <div className="space-y-6 animate-fade-in">
                           <div className="grid grid-cols-[6rem_6rem_minmax(0,1fr)] items-start gap-3">
                               <div className="relative group cursor-pointer w-24 shrink-0" onClick={() => fileInputRef.current?.click()}>
                                   <div className="w-24 h-24 relative overflow-visible rounded-[2rem] shadow-md bg-white border-4 border-white">
                                       <AvatarWithFrame
                                           src={formData.avatar}
                                           framePreset={resolveAvatarFramePreset(theme, formData.avatarFramePresetId)}
                                           className="w-full h-full"
                                           roundedClassName="rounded-[1.5rem]"
                                           imageClassName={isCompressing ? 'opacity-50 blur-sm' : ''}
                                           alt="A"
                                       />
                                   </div>
                                   <div className="mt-2 text-center text-[11px] font-semibold text-slate-500">头像</div>
                                   <input type="file" ref={fileInputRef} className="hidden" accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT} onChange={handleFileChange} />
                               </div>
                               <div className="relative group cursor-pointer w-24 shrink-0" onClick={() => callPortraitInputRef.current?.click()}>
                                   <div className="w-24 h-24 rounded-[2rem] shadow-md bg-white border-4 border-white overflow-hidden relative">
                                       <img
                                           src={formData.callPortrait || formData.avatar}
                                           className={`w-full h-full object-cover ${isCallPortraitCompressing ? 'opacity-50 blur-sm' : ''}`}
                                           alt="通话立绘"
                                       />
                                       {formData.callPortrait && (
                                           <button
                                               type="button"
                                               onClick={(e) => {
                                                   e.stopPropagation();
                                                   clearCallPortrait();
                                               }}
                                               className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm"
                                           >
                                               清除
                                           </button>
                                       )}
                                   </div>
                                   <div className="mt-2 text-center text-[11px] font-semibold text-slate-500">通话立绘</div>
                                   <input type="file" ref={callPortraitInputRef} className="hidden" accept={SUPPORTED_UPLOAD_IMAGE_ACCEPT} onChange={handleCallPortraitFileChange} />
                               </div>
                               <div className="min-w-0 space-y-3 pt-1">
                                   <input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full bg-transparent py-1 text-xl font-medium text-slate-800 border-b border-slate-200" placeholder="名称" />
                                   {formData.isBuiltIn ? (
                                       <div className="w-full py-1 text-sm text-slate-500 border-b border-slate-200">
                                           {formBondTimeLabel}
                                       </div>
                                   ) : (
                                       <input value={formData.description} onChange={(e) => handleChange('description', e.target.value)} className="w-full bg-transparent py-1 text-sm text-slate-500 border-b border-slate-200" placeholder="描述" />
                                   )}
                               </div>
                           </div>
                           <div className="rounded-2xl border border-white/70 bg-white/62 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500 shadow-sm">
                               {CALL_PORTRAIT_UPLOAD_HELP}
                           </div>
                           
                           {!isPromptLocked && (
                               <>
                                   <div>
                                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">核心指令 (System Prompt)</label>
                                       <textarea value={formData.systemPrompt} onChange={(e) => handleChange('systemPrompt', e.target.value)} className="w-full h-40 bg-white rounded-3xl p-5 text-sm shadow-sm resize-none focus:ring-1 focus:ring-primary/20 transition-all" placeholder="设定..." />
                                   </div>

                                   <div>
                                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">世界观 / 设定补充 (Worldview & Lore)</label>
                                       <textarea
                                            value={formData.worldview || ''}
                                            onChange={(e) => handleChange('worldview', e.target.value)}
                                            className="w-full h-24 bg-white rounded-3xl p-5 text-sm shadow-sm resize-none focus:ring-1 focus:ring-primary/20 transition-all"
                                            placeholder="在这个世界里，魔法是存在的..."
                                        />
                                   </div>
                               </>
                           )}

                           <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-3">
                               <div className="flex items-center justify-between">
                                   <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1"><SpeakerHigh size={12} /> MiniMax 音色设定</label>
                                   <div className="flex gap-1.5">
                                       <button
                                           onClick={() => { setActiveCharacterId(formData.id); openApp(AppID.VoiceDesigner); }}
                                           className="text-[10px] bg-violet-50 text-violet-700 px-2 py-1 rounded font-bold hover:bg-violet-100 flex items-center gap-0.5"
                                       >
                                           <SlidersHorizontal size={10} weight="bold" /> 捏声音
                                       </button>
                                       <button
                                           onClick={handleLoadMiniMaxVoices}
                                           className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-bold hover:bg-emerald-100 disabled:opacity-60"
                                           disabled={isLoadingVoices}
                                       >
                                           {isLoadingVoices ? '拉取中...' : '拉取可用音色'}
                                       </button>
                                   </div>
                               </div>
                               <p className="text-[11px] text-slate-500">已有 voice_id 可直接填，不依赖查询。聊天角色配置后，后续接 TTS 可直接读取。</p>

                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                   <input
                                       value={formData.voiceProfile?.voiceId || ''}
                                       onChange={(e) => handleChange('voiceProfile', {
                                           provider: 'minimax',
                                           voiceId: e.target.value,
                                           voiceName: formData.voiceProfile?.voiceName || '',
                                           source: formData.voiceProfile?.source || 'custom',
                                           model: formData.voiceProfile?.model || 'speech-2.8-hd',
                                           notes: formData.voiceProfile?.notes || '',
                                       })}
                                       className="w-full bg-slate-50 rounded-2xl px-3 py-2 text-xs border border-slate-200"
                                       placeholder="voice_id（可直接贴）"
                                   />
                                   <input
                                       value={formData.voiceProfile?.model || 'speech-2.8-hd'}
                                       onChange={(e) => handleChange('voiceProfile', {
                                           provider: 'minimax',
                                           voiceId: formData.voiceProfile?.voiceId || '',
                                           voiceName: formData.voiceProfile?.voiceName || '',
                                           source: formData.voiceProfile?.source || 'custom',
                                           model: e.target.value,
                                           notes: formData.voiceProfile?.notes || '',
                                       })}
                                       className="w-full bg-slate-50 rounded-2xl px-3 py-2 text-xs border border-slate-200"
                                       placeholder="TTS 模型（默认 speech-2.8-hd）"
                                   />
                               </div>

                               {(voiceOptions.system.length + voiceOptions.voice_cloning.length + voiceOptions.voice_generation.length) > 0 && (
                                   <div className="space-y-2 pt-1">
                                       {([
                                           ['system', '系统音色'],
                                           ['voice_cloning', '复刻音色'],
                                           ['voice_generation', '文生音色'],
                                       ] as const).map(([source, label]) => {
                                           const list = voiceOptions[source];
                                           if (!list.length) return null;
                                           return (
                                               <div key={source}>
                                                   <div className="text-[10px] text-slate-400 mb-1">{label}</div>
                                                   <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                                                       {list.slice(0, 50).map((v) => (
                                                           <button
                                                               key={`${source}-${v.voice_id}`}
                                                               onClick={() => applyVoiceToCharacter(v, source)}
                                                               className="w-full text-left px-2 py-1 rounded-xl text-xs border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/40"
                                                           >
                                                               <div className="font-medium text-slate-700 truncate">{v.voice_name || '未命名音色'}</div>
                                                               <div className="text-[10px] text-slate-400 truncate">{v.voice_id}</div>
                                                           </button>
                                                       ))}
                                                   </div>
                                               </div>
                                           );
                                       })}
                                   </div>
                               )}
                           </div>

	                           <div>
	                               <div className="flex justify-between items-center mb-2 px-1">
	                                   <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block flex items-center gap-1"><Books size={12} /> 扩展设定 (Worldbooks)</label>
	                                   {canConfigureWorldbooks && (
	                                       <button onClick={() => setShowWorldbookModal(true)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-100">
	                                           {isPromptLocked ? '资料包开关' : '+ 挂载'}
	                                       </button>
	                                   )}
	                                </div>
	                                <div className="space-y-2">
                                   {activeCustomWorldbookGroups.map(group => (
	                                   <div key={group.id} className="flex items-center justify-between rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-sm">
	                                       <div className="min-w-0">
	                                           <div className="truncate text-sm font-bold text-slate-700">{group.category}</div>
	                                           <div className="mt-1 text-[9px] text-slate-400">
                                                   {group.owner?.kind === 'universal' ? `通用资料 · ${group.books.length} 条` : `${group.books.length} 条 · 整组启用`}
                                               </div>
	                                       </div>
                                           <button onClick={() => unmountWorldbookGroup(group.id)} className="ml-2 p-1 text-slate-300 hover:text-red-400">×</button>
	                                   </div>
                                   ))}
                                   {formData.mountedWorldbooks && formData.mountedWorldbooks.length > 0 && (
                                       currentMountedWorldbooks(formData.mountedWorldbooks, playerVisibleWorldbooks)
                                           .filter(wb => isBuiltInWorldbook(getLibraryWorldbook(wb.id)))
                                           .filter(wb => playerVisibleWorldbookIds.has(wb.id))
                                           .map(wb => {
                                               const identityNotice = getDeepSpaceWorldbookIdentityNotice(wb, userProfile);
                                               const lifecycleLabel = wb.publicationStatus === 'archived'
                                                   ? '已归档 · 保留挂载记录'
                                                   : isFixedBuiltInWorldbook(wb.id) ? '默认启用' : '已启用';
                                               return (
	                                           <div key={wb.id} className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-indigo-50 shadow-sm group">
                                               <button
                                                   onClick={() => setViewingWorldbook(wb)}
                                                   className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                               >
	                                                   <BookOpen size={20} className="shrink-0 text-indigo-400" />
	                                                   <div className="flex flex-col min-w-0">
	                                                       <span className="text-sm font-bold text-slate-700 truncate">{wb.title}</span>
	                                                       <span className={`text-[9px] truncate ${identityNotice?.tone === 'danger' ? 'text-rose-500' : identityNotice ? 'text-amber-500' : 'text-slate-400'}`}>
                                                               {wb.category || '未分类'} · {lifecycleLabel} · {identityNotice ? identityNotice.title : '点击查看内容'}
                                                           </span>
	                                                   </div>
	                                               </button>
	                                               {canToggleWorldbook(wb.id) && (
	                                                   <button onClick={() => unmountWorldbook(wb.id)} className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 ml-2">×</button>
	                                               )}
	                                           </div>
                                               );
                                           })
                                   )}
                                   {activeCustomWorldbookGroups.length === 0 && (!formData.mountedWorldbooks || formData.mountedWorldbooks.length === 0) && (
                                       <div className="text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                                           暂未挂载任何世界书
                                       </div>
                                   )}
                               </div>
                           </div>

                           {!isPromptLocked && (
                               <div className="pt-4">
                                   <button
                                       onClick={handleExportCard}
                                       className="w-full py-4 bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all"
                                   >
                                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                           <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                       </svg>
                                       分享 / 导出角色卡
                                   </button>
                                   <p className="text-[10px] text-slate-400 text-center mt-2">导出内容不包含记忆库和聊天记录</p>
                               </div>
                           )}
                       </div>
                   )}

                   {detailTab === 'boundary' && (
                       <BehaviorBoundaryPanel
                           charId={formData.id}
                           rules={formData.behaviorBoundaryRules || []}
                           onChange={rules => handleChange('behaviorBoundaryRules', rules)}
                           onNotify={addToast}
                           onCompileGuidedNote={handleCompileBehaviorNote}
                       />
                   )}
                   
                   {detailTab === 'memory' && (
                       <div className="space-y-4 animate-fade-in">
                           <div className="flex justify-center gap-2 mb-4">
                               <button onClick={() => setShowBatchModal(true)} className="px-4 py-2 bg-white rounded-full text-xs font-semibold text-slate-500 shadow-sm border border-slate-100">批量总结（可指定日期）</button>
                               <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-white rounded-full text-xs font-semibold text-slate-500 shadow-sm border border-slate-100">导入/清洗</button>
                               <button onClick={handleExportPreview} className="px-4 py-2 bg-white rounded-full text-xs font-semibold text-slate-500 shadow-sm border border-slate-100">备份</button>
                           </div>
                           <MemoryArchivist
                               memories={formData.memories || []}
                               refinedMemories={formData.refinedMemories || {}}
                               activeMemoryMonths={formData.activeMemoryMonths || []}
                               charName={formData.name || ''}
                               userName={userProfile.name}
                               onRefine={handleRefineMonth}
                               onDeleteMemories={handleDeleteMemories}
                               onUpdateMemory={handleUpdateMemory}
                               onToggleActiveMonth={handleToggleActiveMonth}
                               onUpdateRefinedMemory={handleUpdateRefinedMemory}
                               onDeleteRefinedMemory={handleDeleteRefinedMemory}
                               promotedMemories={promotedMemoryViews}
                               onUpdatePromotedMemory={async (memory, patch) => {
                                   if (await applyPromotedMemoryChange(memory, 'edit', patch)) addToast('旧日整理已经改好了。', 'success');
                               }}
                               onHidePromotedMemory={async memory => {
                                   if (await applyPromotedMemoryChange(memory, 'hide')) addToast('已从角色记忆中移出，原对话仍留在日历。', 'success');
                               }}
                               onRestorePromotedMemory={async memory => {
                                   if (await applyPromotedMemoryChange(memory, 'restore')) addToast('这条旧日记忆已经恢复。', 'success');
                               }}
                               onOpenPromotedSource={openPromotedMemorySource}
                           />
                       </div>
                   )}

                   {detailTab === 'impression' && (
                       <ImpressionPanel
                           impression={formData.impression}
                           isGenerating={isGeneratingImpression}
                           onGenerate={handleGenerateImpression}
                           onUpdateImpression={(newImp) => handleChange('impression', newImp)}
                           onDelete={() => handleChange('impression', undefined)}
                       />
                   )}
               </div>
           </div>
       )}
       
       {/* Modals ... */}
       <Modal isOpen={showImportModal} title="记忆导入/清洗" onClose={() => setShowImportModal(false)} footer={<><button onClick={() => setShowImportModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl">取消</button><button onClick={handleImportMemories} disabled={isProcessingMemory} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center gap-2">{isProcessingMemory && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}{isProcessingMemory ? '处理中...' : '开始执行'}</button></>}>
           <div className="space-y-3"><div className="text-xs text-slate-400 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">AI 将自动整理乱序文本为记忆档案。</div>{importStatus && <div className="text-xs text-primary font-medium">{importStatus}</div>}<textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="在此粘贴文本..." className="w-full h-32 bg-slate-100 border-none rounded-2xl px-4 py-3 text-sm text-slate-700 resize-none focus:ring-2 focus:ring-primary/20 transition-all"/></div>
       </Modal>

       <Modal isOpen={showBatchModal} title="批量记忆总结" onClose={() => { setShowBatchModal(false); setShowPromptEditor(false); }} footer={
           isBatchProcessing ?
           <div className="w-full py-3 bg-slate-100 text-primary font-bold rounded-2xl text-center flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>{batchProgress}</div> :
           <button onClick={handleBatchSummarize} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">开始生成</button>
       }>
           <div className="space-y-3">
               <p className="text-xs text-slate-400">将遍历所有聊天记录，按天使用所选提示词模板生成记忆总结。</p>
               {/* Prompt Selection */}
               <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                   <label className="text-[10px] font-bold text-indigo-400 uppercase mb-2 block">选择提示词模板</label>
                   <div className="flex flex-col gap-2">
                       {archivePrompts.map(p => (
                           <div key={p.id} onClick={() => { setSelectedPromptId(p.id); localStorage.setItem('chat_active_archive_prompt_id', p.id); }} className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between ${selectedPromptId === p.id ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500' : 'bg-white/50 border-indigo-200 hover:bg-white'}`}>
                               <span className={`text-xs font-bold ${selectedPromptId === p.id ? 'text-indigo-700' : 'text-slate-600'}`}>{p.name}</span>
                               <div className="flex gap-1.5">
                                   <button onClick={(e) => { e.stopPropagation(); setEditingPrompt(p); setShowPromptEditor(true); }} className="text-[10px] text-slate-400 hover:text-indigo-500 px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50">查看</button>
                                   {!p.id.startsWith('preset_') && (
                                       <button onClick={(e) => { e.stopPropagation(); const next = archivePrompts.filter(ap => ap.id !== p.id); setArchivePrompts(next); localStorage.setItem('chat_archive_prompts', JSON.stringify(next.filter(ap => !ap.id.startsWith('preset_')))); if (selectedPromptId === p.id) setSelectedPromptId('preset_rational'); }} className="text-[10px] text-red-300 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50">x</button>
                                   )}
                               </div>
                           </div>
                       ))}
                   </div>
                   <button onClick={() => { const newP = { id: `custom_${Date.now()}`, name: '新自定义模板', content: DEFAULT_ARCHIVE_PROMPTS[0].content }; setEditingPrompt(newP); setShowPromptEditor(true); }} className="mt-2 w-full py-1.5 text-xs font-bold text-indigo-500 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-100">+ 新建自定义提示词</button>
               </div>
               {/* Date Range */}
               <div className="flex gap-2">
                   <div className="flex-1"><label className="text-[10px] uppercase text-slate-400 font-bold">开始日期 (可选)</label><input type="date" value={batchRange.start} onChange={e => setBatchRange({...batchRange, start: e.target.value})} className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs" /></div>
                   <div className="flex-1"><label className="text-[10px] uppercase text-slate-400 font-bold">结束日期 (可选)</label><input type="date" value={batchRange.end} onChange={e => setBatchRange({...batchRange, end: e.target.value})} className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs" /></div>
               </div>
               <div className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-xl leading-relaxed">
                   支持变量: <code>{'${dateStr}'}</code>, <code>{'${char.name}'}</code>, <code>{'${userProfile.name}'}</code>, <code>{'${rawLog}'}</code>
               </div>
           </div>
       </Modal>

       {/* Prompt Editor Modal */}
       <Modal isOpen={showPromptEditor} title="编辑提示词" onClose={() => setShowPromptEditor(false)} footer={<button onClick={() => {
           if (!editingPrompt) return;
           const isNew = !archivePrompts.some(p => p.id === editingPrompt.id);
           const next = isNew ? [...archivePrompts, editingPrompt] : archivePrompts.map(p => p.id === editingPrompt.id ? editingPrompt : p);
           setArchivePrompts(next);
           setSelectedPromptId(editingPrompt.id);
           localStorage.setItem('chat_archive_prompts', JSON.stringify(next.filter(p => !p.id.startsWith('preset_'))));
           localStorage.setItem('chat_active_archive_prompt_id', editingPrompt.id);
           setShowPromptEditor(false);
           addToast('提示词已保存', 'success');
       }} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存</button>}>
           <div className="space-y-3">
               <input
                   value={editingPrompt?.name || ''}
                   onChange={e => setEditingPrompt(prev => prev ? {...prev, name: e.target.value} : null)}
                   placeholder="预设名称"
                   className="w-full px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                   readOnly={editingPrompt?.id.startsWith('preset_')}
               />
               <textarea
                   value={editingPrompt?.content || ''}
                   onChange={e => setEditingPrompt(prev => prev ? {...prev, content: e.target.value} : null)}
                   className="w-full h-64 bg-slate-100 rounded-xl p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                   placeholder="输入提示词内容..."
                   readOnly={editingPrompt?.id.startsWith('preset_')}
               />
               {editingPrompt?.id.startsWith('preset_') && (
                   <p className="text-[10px] text-slate-400 text-center">预设模板不可编辑（仅查看）</p>
               )}
           </div>
       </Modal>

       <Modal isOpen={showExportModal} title="导出文本" onClose={() => setShowExportModal(false)} footer={<div className="flex gap-2 w-full"><button onClick={() => { navigator.clipboard.writeText(exportText); addToast('已复制', 'success'); }} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">复制全文</button>{Capacitor.isNativePlatform() ? (<button onClick={handleNativeShare} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>文件分享</button>) : (<button onClick={handleWebFileDownload} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>下载文本</button>)}</div>}>
           <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2"><div className="text-[10px] text-slate-400">已自动复制到剪贴板。如果分享失败，请直接手动复制。</div><textarea value={exportText} readOnly className="w-full h-40 bg-transparent border-none text-[10px] font-mono text-slate-600 resize-none focus:ring-0 leading-relaxed select-all" onClick={(e) => e.currentTarget.select()}/></div>
       </Modal>

       <Modal
           isOpen={!!viewingWorldbook}
           title={viewingWorldbook?.title || '世界书内容'}
           onClose={() => setViewingWorldbook(null)}
           footer={
               <div className="flex gap-2 w-full">
                   <button onClick={copyWorldbookContent} className="flex-1 py-3 bg-indigo-50 text-indigo-600 font-bold rounded-2xl">复制全文</button>
                   <button onClick={() => setViewingWorldbook(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl">关闭</button>
               </div>
           }
       >
           <div className="space-y-3">
               <div className="text-[10px] text-slate-400 text-center">
                   {viewingWorldbook?.category || '未分类'} · 只读查看
               </div>
               <textarea
                   value={viewingWorldbook?.content || ''}
                   readOnly
                   className="w-full h-72 bg-slate-50 rounded-2xl border border-slate-100 p-4 text-xs text-slate-700 resize-none focus:ring-0 leading-relaxed"
                   onClick={(e) => e.currentTarget.select()}
               />
           </div>
       </Modal>

	        {/* Worldbook Select Modal */}
	        <Modal
	            isOpen={showWorldbookModal && canConfigureWorldbooks}
	            title={isPromptLocked ? '资料包开关' : '挂载世界书'}
	            onClose={() => { setShowWorldbookModal(false); setIdentityRiskConfirmBookId(null); }}
	        >
	            <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-4 p-1">
	                {(() => {
	                    if (!isPromptLocked) {
	                        if (availableCustomWorldbookGroups.length === 0) {
	                            return (
	                                <div className="py-8 text-center text-xs text-slate-400">
	                                    这个角色还没有自己的世界书组；可以去【世界书】App 新建或复制一组。
	                                </div>
	                            );
	                        }
	                        return availableCustomWorldbookGroups.map(group => {
	                            const universal = group.owner?.kind === 'universal';
	                            const enabled = Boolean(formData?.mountedWorldbookGroupIds?.includes(group.id));
	                            return (
	                                <div key={group.id} className={`rounded-2xl border p-4 ${enabled ? 'border-violet-200 bg-violet-50/60' : 'border-slate-100 bg-white'}`} data-worldbook-group-mount>
	                                    <div className="flex items-start justify-between gap-3">
	                                        <div className="min-w-0">
	                                            <div className="truncate text-sm font-bold text-slate-700">{group.category}</div>
	                                            <div className="mt-1 text-[10px] text-slate-400">
	                                                {universal ? `${group.books.length} 条 · 可供多位角色使用` : `${group.books.length} 条 · 只归属当前角色`}
	                                            </div>
	                                        </div>
	                                        <button
	                                                type="button"
	                                                onClick={() => enabled ? unmountWorldbookGroup(group.id) : mountWorldbookGroup(group.id)}
	                                                className={`rounded-xl px-3 py-1.5 text-[10px] font-bold ${enabled ? 'bg-white text-red-400' : 'bg-violet-600 text-white'}`}
	                                            >
	                                                {enabled ? '停用整组' : '启用整组'}
	                                            </button>
	                                    </div>
	                                    <div className="mt-3 space-y-1.5 border-t border-white/80 pt-3">
	                                        {group.books.map(book => (
	                                            <button
	                                                type="button"
	                                                key={book.id}
	                                                onClick={() => setViewingWorldbook(toMountedWorldbookEntry(book))}
	                                                className="flex w-full items-center justify-between gap-2 text-left text-[11px] text-slate-500"
	                                            >
	                                                <span className="truncate">{book.title}</span>
	                                                <span className="shrink-0 text-[9px] text-slate-300">查看</span>
	                                            </button>
	                                        ))}
	                                    </div>
	                                </div>
	                            );
	                        });
	                    }
	                    const availableWorldbooks = isPromptLocked
	                        ? playerVisibleWorldbooks.filter(wb => wb.isBuiltIn && isOptionalBuiltInWorldbook(wb.id) && isWorldbookVisibleForCharacter(wb, formData?.id))
	                        : playerVisibleWorldbooks;

	                    if (availableWorldbooks.length === 0) {
	                        return (
	                            <div className="text-center text-slate-400 text-xs py-8">
	                                {isPromptLocked ? '暂无可选资料包' : '还没有世界书，请去桌面【世界书】App 创建。'}
	                            </div>
	                        );
	                    }

	                    return Object.entries(availableWorldbooks.reduce((acc, wb) => {
	                        const cat = wb.category || DEFAULT_WORLDBOOK_CATEGORY;
	                        if (!acc[cat]) acc[cat] = [];
	                        acc[cat].push(wb);
	                        return acc;
	                    }, {} as Record<string, typeof availableWorldbooks>))
	                        .sort(([categoryA], [categoryB]) => compareWorldbookCategories(categoryA, categoryB))
	                        .map(([category, books]) => {
	                            const sortedBooks = [...books].sort(compareWorldbookEntries);

	                            return (
	                        <div key={category} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70">
	                            <div className="flex items-center justify-between gap-2 px-3 py-3">
	                                <button
	                                    type="button"
	                                    onClick={() => setExpandedWorldbookCategories(previous => {
	                                        const next = new Set(previous);
	                                        if (next.has(category)) next.delete(category);
	                                        else next.add(category);
	                                        return next;
	                                    })}
	                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
	                                    aria-expanded={expandedWorldbookCategories.has(category)}
	                                >
	                                    <CaretDown
	                                        size={14}
	                                        weight="bold"
	                                        className={`shrink-0 text-indigo-300 transition-transform ${expandedWorldbookCategories.has(category) ? 'rotate-180' : ''}`}
	                                    />
	                                    <h4 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-slate-500">{category}</h4>
	                                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-slate-400">{sortedBooks.length}</span>
	                                </button>
	                            </div>
	                            {expandedWorldbookCategories.has(category) && (
	                            <div className="space-y-2 border-t border-slate-100 p-2">
	                            {sortedBooks.map(wb => {
	                                const isMounted = formData?.mountedWorldbooks?.some(m => m.id === wb.id);
	                                const isOptional = isOptionalBuiltInWorldbook(wb.id);
	                                const canToggle = canToggleWorldbook(wb.id);
                                    const identityNotice = getDeepSpaceWorldbookIdentityNotice(wb, userProfile);
                                    const isPendingRiskConfirm = identityRiskConfirmBookId === wb.id;
	                                return (
	                                    <div
	                                        key={wb.id}
	                                        className={`w-full p-4 rounded-xl border text-left transition-all ${isMounted ? 'bg-indigo-50/50 border-indigo-100' : identityNotice?.tone === 'danger' ? 'bg-rose-50/50 border-rose-100 shadow-sm' : 'bg-white border-indigo-100 shadow-sm'}`}
	                                    >
	                                        <div className="flex items-start justify-between gap-3">
	                                            <div className="min-w-0">
	                                                <div className="font-bold text-slate-700 text-sm leading-snug">{wb.title}</div>
	                                                <div className={`text-[10px] mt-1 ${isMounted ? 'text-indigo-500' : isOptional ? 'text-amber-500' : 'text-slate-400'}`}>
	                                                    {isMounted ? '已启用' : isOptional ? '可启用' : '未启用'}
	                                                </div>
	                                                {wb.activationHint && (
	                                                    <div className="text-[10px] text-slate-500 leading-relaxed mt-2">
	                                                        {wb.activationHint}
	                                                    </div>
	                                                )}
                                                    {identityNotice && (
                                                        <div className={`mt-2 rounded-xl px-3 py-2 text-[10px] leading-relaxed ${
                                                            identityNotice.tone === 'danger'
                                                                ? 'bg-rose-100/70 text-rose-600'
                                                                : identityNotice.tone === 'warning'
                                                                    ? 'bg-amber-50 text-amber-600'
                                                                    : 'bg-sky-50 text-sky-600'
                                                        }`}>
                                                            <div className="font-bold">{identityNotice.title}</div>
                                                            <div>{identityNotice.body}</div>
                                                        </div>
                                                    )}
	                                            </div>
	                                            <div className="flex shrink-0 gap-1">
	                                                <button
	                                                    onClick={() => setViewingWorldbook(toMountedWorldbookEntry(wb))}
	                                                    className="px-2 py-1 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold hover:bg-slate-200"
	                                                >
	                                                    查看
	                                                </button>
	                                                {canToggle && (
	                                                    <button
	                                                        onClick={() => isMounted ? unmountWorldbook(wb.id) : mountWorldbook(wb.id)}
	                                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold ${isMounted ? 'bg-white text-red-400 hover:bg-red-50' : isPendingRiskConfirm ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
	                                                    >
	                                                        {isMounted ? '停用' : isPendingRiskConfirm ? '确认启用' : '启用'}
	                                                    </button>
	                                                )}
	                                            </div>
	                                        </div>
	                                    </div>
	                                );
	                            })}
	                            </div>
	                            )}
	                        </div>
	                            );
	                        })
	                })()}
	            </div>
	        </Modal>

        <Modal 
            isOpen={!!deleteConfirmTarget} 
            title="断开连接" 
            onClose={() => setDeleteConfirmTarget(null)} 
            footer={<div className="flex gap-2 w-full"><button onClick={() => setDeleteConfirmTarget(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-bold">保留</button><button onClick={confirmDeleteCharacter} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">确认断开</button></div>}
        >
            <div className="flex flex-col items-center gap-3 py-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                <p className="text-sm text-slate-600 text-center leading-relaxed">
                    确定要删除这位角色吗？<br/>
                    <span className="text-xs text-red-400 font-bold">角色资料会移除；他的专属世界书组会收进归档。</span><br/>
                    <span className="text-[10px] text-slate-400">通用资料，以及已经复制到其他分组的副本，不会受影响。</span>
                </p>
            </div>
        </Modal>
    </div>
  );
};
export default Character;
