import { BUILT_IN_DREAMWORLD } from './builtInDreamworld';
import {
  DREAMWORLD_SCHEME_ID,
  getActiveCreativeSchemeRevision,
  isCreativeSchemeArchived,
} from './contract';
import type {
  CreativeScheme,
  CreativeSchemeSettings,
  CreativeSchemeSurface,
  PreparedCreativeScheme,
} from './types';

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const moduleFits = (surfaces: readonly CreativeSchemeSurface[], surface: CreativeSchemeSurface): boolean => (
  surfaces.includes('all') || surfaces.includes(surface)
);

export const resolveCreativeSchemeId = (input: {
  settings: CreativeSchemeSettings;
  characterId?: string;
}): string => (
  (input.characterId ? input.settings.characterSchemeIds[input.characterId] : undefined)
  || input.settings.defaultSchemeId
);

export const prepareCreativeScheme = (input: {
  schemes: readonly CreativeScheme[];
  settings: CreativeSchemeSettings;
  characterId?: string;
  surface: CreativeSchemeSurface;
}): PreparedCreativeScheme => {
  const schemeId = resolveCreativeSchemeId(input);
  const source = schemeId === DREAMWORLD_SCHEME_ID
    ? {
        name: BUILT_IN_DREAMWORLD.name,
        revisionId: BUILT_IN_DREAMWORLD.revisionId,
        modules: BUILT_IN_DREAMWORLD.modules,
        modelHints: BUILT_IN_DREAMWORLD.modelHints,
      }
    : (() => {
        const scheme = input.schemes.find(item => item.id === schemeId);
        if (!scheme) throw new Error('已选择的创作方案不存在，请在“创作方案”里重新指定。');
        if (isCreativeSchemeArchived(scheme)) {
          throw new Error(`创作方案“${scheme.name}”已经归档，请重新指定后再继续。`);
        }
        const revision = getActiveCreativeSchemeRevision(scheme);
        return {
          name: scheme.name,
          revisionId: revision.id,
          modules: revision.modules,
          modelHints: revision.modelHints,
        };
      })();
  const modules = source.modules
    .filter(module => module.enabled && moduleFits(module.surfaces, input.surface))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  if (!modules.length) throw new Error(`创作方案“${source.name}”没有适用于当前入口的条目。`);
  const markdown = [
    `【创作方案：${source.name}】`,
    '这部分只负责创作方法与交付姿态，不提供人物事实、世界事实或当前剧情结果。',
    ...modules.map(module => `### ${module.title}\n${module.content.trim()}`),
  ].join('\n\n');
  return {
    schemeId,
    schemeName: source.name,
    revisionId: source.revisionId,
    moduleIds: modules.map(module => module.id),
    renderedHash: hashText(`${schemeId}:${source.revisionId}:${markdown}`),
    markdown,
    modelHints: source.modelHints ? { ...source.modelHints } : undefined,
  };
};
