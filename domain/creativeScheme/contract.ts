import {
  CREATIVE_SCHEME_SCHEMA_VERSION,
  type CreativeScheme,
  type CreativeSchemeCategory,
  type CreativeSchemeModule,
  type CreativeSchemeRevision,
  type CreativeSchemeSettings,
  type CreativeSchemeStoreRecord,
} from './types';

export const CREATIVE_SCHEME_SETTINGS_ID = 'creative-scheme-settings' as const;
export const DREAMWORLD_SCHEME_ID = 'builtin:dreamworld' as const;

export const isCreativeSchemeArchived = (scheme: CreativeScheme): boolean => (
  scheme.lifecycle === 'archived'
);

export const CREATIVE_SCHEME_CATEGORIES: readonly {
  id: CreativeSchemeCategory;
  description: string;
}[] = [
  { id: '创作框架', description: '说明这一次创作在做什么，以及作品如何成立。' },
  { id: '叙事机制', description: '安排选择、后果、推进与悬念的运行方式。' },
  { id: '文体表达', description: '管理笔触、节奏、视角与语言质感。' },
  { id: '演绎准则', description: '帮助人物保持主动、立场与关系中的真实反应。' },
  { id: '内容边界', description: '说明题材范围与当前作品愿意触及的方向。' },
  { id: '输出规范', description: '约定本轮交付的形态，减少无关说明。' },
  { id: '模型适配', description: '保存对生成模型的轻量参数建议。' },
  { id: '上下文编排', description: '规定各类背景资料进入上下文时的职责顺序。' },
] as const;

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const cloneModule = (module: CreativeSchemeModule): CreativeSchemeModule => ({
  ...module,
  surfaces: [...module.surfaces],
});

export const getActiveCreativeSchemeRevision = (
  scheme: CreativeScheme,
): CreativeSchemeRevision => {
  const revision = scheme.revisions.find(item => item.id === scheme.activeRevisionId);
  if (!revision) throw new Error(`创作方案“${scheme.name}”缺少当前版本。`);
  return revision;
};

export const createCreativeScheme = (input: {
  id: string;
  name: string;
  description?: string;
  source: CreativeScheme['source'];
  modules: CreativeSchemeModule[];
  modelHints?: CreativeSchemeRevision['modelHints'];
  importedFrom?: string;
  now?: number;
}): CreativeScheme => {
  const now = input.now ?? Date.now();
  if (!nonEmpty(input.id) || !nonEmpty(input.name)) throw new Error('创作方案需要名称。');
  const revisionId = `${input.id}:revision:${now}`;
  return {
    kind: 'scheme',
    schemaVersion: CREATIVE_SCHEME_SCHEMA_VERSION,
    id: input.id,
    name: input.name.trim(),
    description: input.description?.trim() || '',
    source: input.source,
    lifecycle: 'active',
    activeRevisionId: revisionId,
    revisions: [{
      id: revisionId,
      createdAt: now,
      modules: input.modules.map(cloneModule),
      modelHints: input.modelHints ? { ...input.modelHints } : undefined,
    }],
    createdAt: now,
    updatedAt: now,
    importedFrom: input.importedFrom,
  };
};

export const archiveCreativeScheme = (
  scheme: CreativeScheme,
  now = Date.now(),
): CreativeScheme => ({
  ...scheme,
  lifecycle: 'archived',
  archivedAt: now,
  updatedAt: now,
});

export const restoreCreativeScheme = (
  scheme: CreativeScheme,
  now = Date.now(),
): CreativeScheme => {
  const { archivedAt: _archivedAt, ...rest } = scheme;
  return {
    ...rest,
    lifecycle: 'active',
    updatedAt: now,
  };
};

export const detachCreativeSchemeFromSettings = (input: {
  settings: CreativeSchemeSettings;
  schemeId: string;
  now?: number;
}): CreativeSchemeSettings => ({
  ...input.settings,
  defaultSchemeId: input.settings.defaultSchemeId === input.schemeId
    ? DREAMWORLD_SCHEME_ID
    : input.settings.defaultSchemeId,
  characterSchemeIds: Object.fromEntries(
    Object.entries(input.settings.characterSchemeIds)
      .filter(([, schemeId]) => schemeId !== input.schemeId),
  ),
  updatedAt: input.now ?? Date.now(),
});

export const reviseCreativeScheme = (input: {
  scheme: CreativeScheme;
  modules: CreativeSchemeModule[];
  name?: string;
  description?: string;
  modelHints?: CreativeSchemeRevision['modelHints'];
  now?: number;
}): CreativeScheme => {
  const now = input.now ?? Date.now();
  const revisionId = `${input.scheme.id}:revision:${now}`;
  return {
    ...input.scheme,
    name: input.name?.trim() || input.scheme.name,
    description: input.description === undefined
      ? input.scheme.description
      : input.description.trim(),
    activeRevisionId: revisionId,
    revisions: [
      ...input.scheme.revisions,
      {
        id: revisionId,
        createdAt: now,
        modules: input.modules.map(cloneModule),
        modelHints: input.modelHints ? { ...input.modelHints } : undefined,
      },
    ],
    updatedAt: now,
  };
};

export const reorderCreativeSchemeModules = (input: {
  modules: CreativeSchemeModule[];
  category: CreativeSchemeCategory;
  orderedModuleIds: string[];
}): CreativeSchemeModule[] => {
  const orderedIds = [...new Set(input.orderedModuleIds)];
  const current = [...input.modules]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const categoryModules = current.filter(module => module.category === input.category);
  const categoryIds = categoryModules.map(module => module.id);
  if (
    orderedIds.length !== categoryIds.length
    || orderedIds.some(id => !categoryIds.includes(id))
  ) {
    throw new Error('只能调整同一栏内的完整条目顺序。');
  }
  const byId = new Map(categoryModules.map(module => [module.id, module]));
  let categoryIndex = 0;
  return current
    .map(module => (
      module.category === input.category
        ? byId.get(orderedIds[categoryIndex++]) as CreativeSchemeModule
        : module
    ))
    .map((module, order) => ({ ...module, order }));
};

export const createDefaultCreativeSchemeSettings = (now = Date.now()): CreativeSchemeSettings => ({
  kind: 'settings',
  schemaVersion: CREATIVE_SCHEME_SCHEMA_VERSION,
  id: CREATIVE_SCHEME_SETTINGS_ID,
  defaultSchemeId: DREAMWORLD_SCHEME_ID,
  characterSchemeIds: {},
  schemeOrderIds: [DREAMWORLD_SCHEME_ID],
  pinnedSchemeIds: [],
  updatedAt: now,
});

export const updateCreativeSchemeLibraryOrder = (input: {
  settings: CreativeSchemeSettings;
  schemeOrderIds: string[];
  now?: number;
}): CreativeSchemeSettings => ({
  ...input.settings,
  schemeOrderIds: [...new Set(input.schemeOrderIds.filter(nonEmpty))],
  updatedAt: input.now ?? Date.now(),
});

export const toggleCreativeSchemePinned = (input: {
  settings: CreativeSchemeSettings;
  schemeId: string;
  now?: number;
}): CreativeSchemeSettings => {
  const pinned = new Set(input.settings.pinnedSchemeIds || []);
  if (pinned.has(input.schemeId)) pinned.delete(input.schemeId);
  else pinned.add(input.schemeId);
  return {
    ...input.settings,
    pinnedSchemeIds: [...pinned],
    updatedAt: input.now ?? Date.now(),
  };
};

export const validateCreativeSchemeStoreRecord = (
  record: CreativeSchemeStoreRecord,
): string[] => {
  const errors: string[] = [];
  if (record.schemaVersion !== CREATIVE_SCHEME_SCHEMA_VERSION) errors.push('schemaVersion 不受支持');
  if (record.kind === 'settings') {
    if (record.id !== CREATIVE_SCHEME_SETTINGS_ID) errors.push('设置记录 id 不正确');
    if (!nonEmpty(record.defaultSchemeId)) errors.push('默认方案不能为空');
    if (record.schemeOrderIds !== undefined && !record.schemeOrderIds.every(nonEmpty)) {
      errors.push('方案排序含有无效 id');
    }
    if (record.pinnedSchemeIds !== undefined && !record.pinnedSchemeIds.every(nonEmpty)) {
      errors.push('方案置顶含有无效 id');
    }
    return errors;
  }
  if (!nonEmpty(record.id) || !nonEmpty(record.name)) errors.push('方案 id 和名称不能为空');
  if (record.lifecycle !== undefined && !['active', 'archived'].includes(record.lifecycle)) {
    errors.push('方案生命周期不受支持');
  }
  if (record.lifecycle === 'archived' && !Number.isFinite(record.archivedAt)) {
    errors.push('归档方案缺少归档时间');
  }
  if (!record.revisions.length) errors.push('方案至少需要一个版本');
  const active = record.revisions.find(item => item.id === record.activeRevisionId);
  if (!active) errors.push('方案缺少当前版本');
  record.revisions.forEach(revision => {
    revision.modules.forEach(module => {
      if (!nonEmpty(module.id) || !nonEmpty(module.title) || !nonEmpty(module.content)) {
        errors.push('方案条目需要 id、标题与正文');
      }
      if (!CREATIVE_SCHEME_CATEGORIES.some(category => category.id === module.category)) {
        errors.push(`未知分类：${module.category}`);
      }
      if (!module.surfaces.length) errors.push(`条目“${module.title}”缺少适用入口`);
    });
  });
  return errors;
};
