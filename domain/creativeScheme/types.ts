export const CREATIVE_SCHEME_SCHEMA_VERSION = 1 as const;

export type CreativeSchemeCategory =
  | '创作框架'
  | '叙事机制'
  | '文体表达'
  | '演绎准则'
  | '内容边界'
  | '输出规范'
  | '模型适配'
  | '上下文编排';

export type CreativeSchemeSurface =
  | 'all'
  | 'plain_novel'
  | 'chat'
  | 'date'
  | 'story_mainline'
  | 'story_if';

export interface CreativeSchemeModule {
  id: string;
  title: string;
  description?: string;
  content: string;
  category: CreativeSchemeCategory;
  enabled: boolean;
  order: number;
  surfaces: CreativeSchemeSurface[];
  sourceIdentifier?: string;
}

export interface CreativeSchemeModelHints {
  temperature?: number;
  topP?: number;
}

export interface CreativeSchemeRevision {
  id: string;
  createdAt: number;
  modules: CreativeSchemeModule[];
  modelHints?: CreativeSchemeModelHints;
}

export interface CreativeScheme {
  kind: 'scheme';
  schemaVersion: typeof CREATIVE_SCHEME_SCHEMA_VERSION;
  id: string;
  name: string;
  description: string;
  source: 'player' | 'imported';
  /** Missing only on records created before lifecycle governance; reads treat it as active. */
  lifecycle?: 'active' | 'archived';
  archivedAt?: number;
  activeRevisionId: string;
  revisions: CreativeSchemeRevision[];
  createdAt: number;
  updatedAt: number;
  importedFrom?: string;
}

export interface CreativeSchemeSettings {
  kind: 'settings';
  schemaVersion: typeof CREATIVE_SCHEME_SCHEMA_VERSION;
  id: 'creative-scheme-settings';
  defaultSchemeId: string;
  characterSchemeIds: Record<string, string>;
  schemeOrderIds?: string[];
  pinnedSchemeIds?: string[];
  updatedAt: number;
}

export type CreativeSchemeStoreRecord = CreativeScheme | CreativeSchemeSettings;

export interface PreparedCreativeScheme {
  schemeId: string;
  schemeName: string;
  revisionId: string;
  moduleIds: string[];
  renderedHash: string;
  markdown: string;
  modelHints?: CreativeSchemeModelHints;
}

export interface CreativeSchemeDeliveryRef {
  schemeId: string;
  revisionId: string;
  moduleIds: string[];
  renderedHash: string;
}
