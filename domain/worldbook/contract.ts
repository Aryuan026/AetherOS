import type { Worldbook } from '../../types.ts';
import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import {
  WORLD_GROWTH_CANDIDATE_SCHEMA_VERSION,
  WORLDBOOK_LIVE_SCHEMA_VERSION,
  type WorldbookBinding,
  type WorldbookGroupAssignment,
  type WorldbookKnowledgePolicy,
  type WorldbookKnowledgeSubjectRef,
  type WorldbookRevisionSnapshot,
  type WorldbookRevisionSourceRef,
  type WorldGrowthCandidate,
  type WorldGrowthCandidateDraft,
  type WorldGrowthCandidatePlayerReview,
} from './types.ts';

const nonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

export const validateWorldbookGroupAssignment = (
  group: WorldbookGroupAssignment | undefined,
  label = 'group',
): string[] => {
  if (!group) return [];
  const errors: string[] = [];
  if (!nonEmpty(group.id)) errors.push(`${label}.id is required`);
  if (!nonEmpty(group.name)) errors.push(`${label}.name is required`);
  if (
    group.sortOrder !== undefined
    && (!Number.isInteger(group.sortOrder) || group.sortOrder < 0)
  ) {
    errors.push(`${label}.sortOrder must be a non-negative integer`);
  }
  if (group.pinned !== undefined && typeof group.pinned !== 'boolean') {
    errors.push(`${label}.pinned must be boolean`);
  }
  if (group.owner?.kind === 'character') {
    if (!nonEmpty(group.owner.charId)) errors.push(`${label}.owner.charId is required`);
  } else if (group.owner?.kind !== 'universal') {
    errors.push(`${label}.owner is invalid`);
  }
  return errors;
};

const uniqueStrings = (values: readonly string[] = []): string[] => (
  [...new Set(values.map(value => value.trim()).filter(Boolean))]
);

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

export const hashWorldbookText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const cloneScope = (scope: HistoryScope): HistoryScope => ({ ...scope });

const cloneSubject = (
  subject: WorldbookKnowledgeSubjectRef,
): WorldbookKnowledgeSubjectRef => ({ ...subject });

const cloneKnowledgePolicy = (
  policy: WorldbookKnowledgePolicy,
): WorldbookKnowledgePolicy => (
  policy.kind === 'entities'
    ? { kind: 'entities', subjects: policy.subjects.map(cloneSubject) }
    : { kind: policy.kind }
);

const cloneBinding = (binding: WorldbookBinding): WorldbookBinding => {
  if (binding.kind === 'global') return { ...binding };
  return { ...binding, scope: cloneScope(binding.scope) };
};

const cloneRevision = (revision: WorldbookRevisionSnapshot): WorldbookRevisionSnapshot => ({
  ...revision,
  aliases: [...revision.aliases],
  bindings: revision.bindings.map(cloneBinding),
  knowledgePolicy: cloneKnowledgePolicy(revision.knowledgePolicy),
  supplementsEntryIds: [...revision.supplementsEntryIds],
  sourceRefs: revision.sourceRefs.map(ref => ({ ...ref })),
});

const requireTimestamp = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite timestamp`);
  return value;
};

const validateSubject = (
  subject: WorldbookKnowledgeSubjectRef,
  label: string,
): string[] => {
  const errors: string[] = [];
  if (!['user', 'character', 'npc', 'organization', 'narrator'].includes(subject?.kind)) {
    errors.push(`${label}.kind is invalid`);
  }
  if (!nonEmpty(subject?.id)) errors.push(`${label}.id is required`);
  return errors;
};

export const validateWorldbookKnowledgePolicy = (
  policy: WorldbookKnowledgePolicy,
  label = 'knowledgePolicy',
): string[] => {
  const errors: string[] = [];
  if (!policy || !['public', 'entities', 'director_only'].includes(policy.kind)) {
    return [`${label}.kind is invalid`];
  }
  if (policy.kind === 'entities') {
    if (!policy.subjects.length) errors.push(`${label}.subjects are required`);
    policy.subjects.forEach((subject, index) => {
      errors.push(...validateSubject(subject, `${label}.subjects[${index}]`));
    });
    const identities = policy.subjects.map(subject => `${subject.kind}:${subject.id}`);
    if (new Set(identities).size !== identities.length) {
      errors.push(`${label}.subjects must be unique`);
    }
  }
  return errors;
};

export const validateWorldbookBinding = (
  binding: WorldbookBinding,
  label = 'binding',
): string[] => {
  const errors: string[] = [];
  if (!nonEmpty(binding?.id)) errors.push(`${label}.id is required`);
  if (!['global', 'relationship', 'mainline', 'if_branch', 'route'].includes(binding?.kind)) {
    errors.push(`${label}.kind is invalid`);
    return errors;
  }
  if (binding.kind !== 'global') {
    errors.push(...validateHistoryScope(binding.scope).map(error => `${label}.scope ${error}`));
  }
  if (binding.kind === 'mainline' && binding.routeId !== undefined && !nonEmpty(binding.routeId)) {
    errors.push(`${label}.routeId must not be blank`);
  }
  if (binding.kind === 'if_branch') {
    if (!nonEmpty(binding.routeId)) errors.push(`${label}.routeId is required`);
    if (!nonEmpty(binding.branchId)) errors.push(`${label}.branchId is required`);
  }
  if (binding.kind === 'route') {
    if (!['mainline', 'if_line'].includes(binding.lane)) errors.push(`${label}.lane is invalid`);
    if (!nonEmpty(binding.routeId)) errors.push(`${label}.routeId is required`);
    if (binding.branchId !== undefined && !nonEmpty(binding.branchId)) {
      errors.push(`${label}.branchId must not be blank`);
    }
  }
  return errors;
};

const revisionContentHash = (input: {
  title: string;
  content: string;
  category: string;
  aliases: readonly string[];
  activationHint?: string;
  publicationStatus: 'published' | 'archived';
  bindings: readonly WorldbookBinding[];
  knowledgePolicy: WorldbookKnowledgePolicy;
  supplementsEntryIds: readonly string[];
}): string => hashWorldbookText(JSON.stringify(input));

const createRevisionId = (
  entryId: string,
  revision: number,
  contentHash: string,
): string => `${entryId}:revision:${revision}:${contentHash.slice(contentHash.indexOf(':') + 1)}`;

const buildRevision = (input: {
  entryId: string;
  revision: number;
  title: string;
  content: string;
  category: string;
  aliases?: readonly string[];
  activationHint?: string;
  publicationStatus?: 'published' | 'archived';
  bindings: readonly WorldbookBinding[];
  knowledgePolicy: WorldbookKnowledgePolicy;
  supplementsEntryIds?: readonly string[];
  sourceRefs: readonly WorldbookRevisionSourceRef[];
  createdAt: number;
}): WorldbookRevisionSnapshot => {
  const aliases = uniqueStrings(input.aliases);
  const supplementsEntryIds = uniqueStrings(input.supplementsEntryIds);
  const publicationStatus = input.publicationStatus ?? 'published';
  const bindings = input.bindings.map(cloneBinding);
  const knowledgePolicy = cloneKnowledgePolicy(input.knowledgePolicy);
  const contentHash = revisionContentHash({
    title: input.title,
    content: input.content,
    category: input.category,
    aliases,
    activationHint: input.activationHint,
    publicationStatus,
    bindings,
    knowledgePolicy,
    supplementsEntryIds,
  });
  return {
    schemaVersion: WORLDBOOK_LIVE_SCHEMA_VERSION,
    id: createRevisionId(input.entryId, input.revision, contentHash),
    entryId: input.entryId,
    revision: input.revision,
    title: input.title,
    content: input.content,
    category: input.category,
    aliases,
    activationHint: input.activationHint,
    publicationStatus,
    bindings,
    knowledgePolicy,
    supplementsEntryIds,
    sourceRefs: input.sourceRefs.map(ref => ({ ...ref })),
    contentHash,
    createdAt: requireTimestamp(input.createdAt, 'revision.createdAt'),
  };
};

export const validateWorldbookRevision = (
  revision: WorldbookRevisionSnapshot,
  label = 'revision',
): string[] => {
  const errors: string[] = [];
  if (revision?.schemaVersion !== WORLDBOOK_LIVE_SCHEMA_VERSION) {
    errors.push(`${label}.schemaVersion is unsupported`);
  }
  if (!nonEmpty(revision?.id)) errors.push(`${label}.id is required`);
  if (!nonEmpty(revision?.entryId)) errors.push(`${label}.entryId is required`);
  if (!Number.isInteger(revision?.revision) || revision.revision < 1) {
    errors.push(`${label}.revision must be a positive integer`);
  }
  if (typeof revision?.title !== 'string') errors.push(`${label}.title must be text`);
  if (typeof revision?.content !== 'string') errors.push(`${label}.content must be text`);
  if (typeof revision?.category !== 'string') errors.push(`${label}.category must be text`);
  if (!['published', 'archived'].includes(revision?.publicationStatus)) {
    errors.push(`${label}.publicationStatus is invalid`);
  }
  if (!Array.isArray(revision?.bindings) || !revision.bindings.length) {
    errors.push(`${label}.bindings are required`);
  } else {
    revision.bindings.forEach((binding, index) => {
      errors.push(...validateWorldbookBinding(binding, `${label}.bindings[${index}]`));
    });
    if (new Set(revision.bindings.map(binding => binding.id)).size !== revision.bindings.length) {
      errors.push(`${label}.binding ids must be unique`);
    }
  }
  errors.push(...validateWorldbookKnowledgePolicy(revision?.knowledgePolicy, `${label}.knowledgePolicy`));
  if (!Array.isArray(revision?.sourceRefs) || !revision.sourceRefs.length) {
    errors.push(`${label}.sourceRefs are required`);
  } else {
    revision.sourceRefs.forEach((ref, index) => {
      if (![
        'built_in',
        'player',
        'import',
        'narrative_promotion',
        'revision_restore',
        'legacy_normalization',
      ].includes(ref?.kind)) {
        errors.push(`${label}.sourceRefs[${index}].kind is invalid`);
      }
      if (!nonEmpty(ref?.refId)) errors.push(`${label}.sourceRefs[${index}].refId is required`);
    });
  }
  if (!Number.isFinite(revision?.createdAt) || revision.createdAt < 0) {
    errors.push(`${label}.createdAt is invalid`);
  }
  const expectedHash = revisionContentHash({
    title: revision?.title,
    content: revision?.content,
    category: revision?.category,
    aliases: revision?.aliases ?? [],
    activationHint: revision?.activationHint,
    publicationStatus: revision?.publicationStatus,
    bindings: revision?.bindings ?? [],
    knowledgePolicy: revision?.knowledgePolicy,
    supplementsEntryIds: revision?.supplementsEntryIds ?? [],
  });
  if (revision?.contentHash !== expectedHash) errors.push(`${label}.contentHash is stale`);
  if (revision?.id !== createRevisionId(revision?.entryId, revision?.revision, expectedHash)) {
    errors.push(`${label}.id does not match its content and revision`);
  }
  return errors;
};

/**
 * Legacy visibleToCharacterIds controls where a book may be shown/mounted in
 * Character UI. It never described which in-world entity knew the content.
 */
const legacyKnowledgePolicy = (): WorldbookKnowledgePolicy => ({ kind: 'public' });

const legacySourceRef = (book: Worldbook): WorldbookRevisionSourceRef => ({
  kind: book.isBuiltIn || book.lockEditing ? 'built_in' : 'legacy_normalization',
  refId: book.id,
  revision: book.builtInVersion,
});

const withActiveRevisionMirror = (
  book: Worldbook,
  revision: WorldbookRevisionSnapshot,
  revisions: readonly WorldbookRevisionSnapshot[],
): Worldbook => ({
  ...book,
  title: revision.title,
  content: revision.content,
  category: revision.category,
  activationHint: revision.activationHint,
  worldbookSchemaVersion: WORLDBOOK_LIVE_SCHEMA_VERSION,
  activeRevisionId: revision.id,
  revisionSnapshots: revisions.map(cloneRevision),
});

/**
 * Upgrades one legacy Worldbook in memory without assigning it to the active
 * persona. Its historical unscoped behavior becomes a global binding; the
 * existing character mount remains the separate consumption gate.
 */
export const normalizeWorldbookEntry = (book: Worldbook): Worldbook => {
  if (!nonEmpty(book?.id)) throw new Error('Worldbook id is required');
  if (typeof book.title !== 'string' || typeof book.content !== 'string' || typeof book.category !== 'string') {
    throw new Error(`Worldbook ${book.id} has invalid legacy text fields`);
  }
  const groupErrors = validateWorldbookGroupAssignment(book.group);
  if (groupErrors.length) throw new Error(`Worldbook ${book.id} ${groupErrors.join('; ')}`);
  if (book.group && book.category !== book.group.name) {
    throw new Error(`Worldbook ${book.id} category must match its canonical group name`);
  }
  const hasLifecycle = book.worldbookSchemaVersion !== undefined
    || book.activeRevisionId !== undefined
    || book.revisionSnapshots !== undefined;
  if (!hasLifecycle) {
    const revision = buildRevision({
      entryId: book.id,
      revision: 1,
      title: book.title,
      content: book.content,
      category: book.category,
      activationHint: book.activationHint,
      publicationStatus: 'published',
      bindings: [{ id: `${book.id}:binding:global`, kind: 'global' }],
      knowledgePolicy: legacyKnowledgePolicy(),
      sourceRefs: [legacySourceRef(book)],
      createdAt: book.updatedAt || book.createdAt || 0,
    });
    return withActiveRevisionMirror(book, revision, [revision]);
  }
  if (
    book.worldbookSchemaVersion !== WORLDBOOK_LIVE_SCHEMA_VERSION
    || !nonEmpty(book.activeRevisionId)
    || !Array.isArray(book.revisionSnapshots)
    || !book.revisionSnapshots.length
  ) {
    throw new Error(`Worldbook ${book.id} has an incomplete live-worldbook lifecycle`);
  }
  const revisions = book.revisionSnapshots.map(cloneRevision);
  revisions.forEach((revision, index) => {
    const errors = validateWorldbookRevision(revision, `Worldbook ${book.id} revision[${index}]`);
    if (errors.length) throw new Error(errors.join('; '));
    if (revision.entryId !== book.id) throw new Error(`Worldbook ${book.id} contains a foreign revision`);
  });
  if (new Set(revisions.map(revision => revision.id)).size !== revisions.length) {
    throw new Error(`Worldbook ${book.id} has duplicate revision ids`);
  }
  if (new Set(revisions.map(revision => revision.revision)).size !== revisions.length) {
    throw new Error(`Worldbook ${book.id} has duplicate revision numbers`);
  }
  const active = revisions.find(revision => revision.id === book.activeRevisionId);
  if (!active) throw new Error(`Worldbook ${book.id} active revision is missing`);
  const latestRevision = Math.max(...revisions.map(revision => revision.revision));
  if (active.revision !== latestRevision) {
    throw new Error(`Worldbook ${book.id} cannot reactivate an old revision through normalization`);
  }
  return withActiveRevisionMirror(book, active, revisions);
};

export const getActiveWorldbookRevision = (
  book: Worldbook,
): WorldbookRevisionSnapshot => {
  const normalized = normalizeWorldbookEntry(book);
  return cloneRevision(normalized.revisionSnapshots!.find(
    revision => revision.id === normalized.activeRevisionId,
  )!);
};

export const isWorldbookPublished = (book: Worldbook): boolean => (
  getActiveWorldbookRevision(book).publicationStatus === 'published'
);

export const createWorldbookEntry = (input: {
  book: Worldbook;
  aliases?: readonly string[];
  publicationStatus?: 'published' | 'archived';
  bindings?: readonly WorldbookBinding[];
  knowledgePolicy?: WorldbookKnowledgePolicy;
  supplementsEntryIds?: readonly string[];
  sourceRef?: WorldbookRevisionSourceRef;
  sourceRefs?: readonly WorldbookRevisionSourceRef[];
}): Worldbook => {
  if (input.book.worldbookSchemaVersion || input.book.revisionSnapshots || input.book.activeRevisionId) {
    throw new Error('createWorldbookEntry requires an unversioned entry');
  }
  const sourceRef = input.sourceRef ?? {
    kind: input.book.isBuiltIn || input.book.lockEditing ? 'built_in' : 'player',
    refId: input.book.id,
    revision: input.book.builtInVersion,
  };
  const revision = buildRevision({
    entryId: input.book.id,
    revision: 1,
    title: input.book.title,
    content: input.book.content,
    category: input.book.category,
    aliases: input.aliases,
    activationHint: input.book.activationHint,
    publicationStatus: input.publicationStatus,
    bindings: input.bindings ?? [{ id: `${input.book.id}:binding:global`, kind: 'global' }],
    knowledgePolicy: input.knowledgePolicy ?? legacyKnowledgePolicy(),
    supplementsEntryIds: input.supplementsEntryIds,
    sourceRefs: input.sourceRefs?.map(ref => ({ ...ref })) ?? [sourceRef],
    createdAt: input.book.updatedAt || input.book.createdAt,
  });
  const errors = validateWorldbookRevision(revision);
  if (errors.length) throw new Error(`Worldbook creation rejected: ${errors.join('; ')}`);
  return withActiveRevisionMirror(input.book, revision, [revision]);
};

export const reviseWorldbookEntry = (input: {
  current: Worldbook;
  patch: Partial<Omit<WorldGrowthCandidateDraft, 'sourceRefs'>>;
  sourceRef: WorldbookRevisionSourceRef;
  sourceRefs?: readonly WorldbookRevisionSourceRef[];
  updatedAt?: number;
}): Worldbook => {
  const current = normalizeWorldbookEntry(input.current);
  if (current.isBuiltIn || current.lockEditing) {
    throw new Error('Built-in Worldbook entries are read-only; create a related supplement instead');
  }
  const active = getActiveWorldbookRevision(current);
  const updatedAt = requireTimestamp(input.updatedAt ?? Date.now(), 'updatedAt');
  if (updatedAt < current.createdAt) throw new Error('Worldbook update cannot precede creation');
  const nextRevision = buildRevision({
    entryId: current.id,
    revision: active.revision + 1,
    title: input.patch.title ?? active.title,
    content: input.patch.content ?? active.content,
    category: input.patch.category ?? active.category,
    aliases: input.patch.aliases ?? active.aliases,
    activationHint: input.patch.activationHint ?? active.activationHint,
    publicationStatus: input.patch.publicationStatus ?? active.publicationStatus,
    bindings: input.patch.bindings ?? active.bindings,
    knowledgePolicy: input.patch.knowledgePolicy ?? active.knowledgePolicy,
    supplementsEntryIds: input.patch.supplementsEntryIds ?? active.supplementsEntryIds,
    sourceRefs: input.sourceRefs?.map(ref => ({ ...ref })) ?? [input.sourceRef],
    createdAt: updatedAt,
  });
  const errors = validateWorldbookRevision(nextRevision);
  if (errors.length) throw new Error(`Worldbook revision rejected: ${errors.join('; ')}`);
  return withActiveRevisionMirror(
    { ...current, updatedAt },
    nextRevision,
    [...current.revisionSnapshots!, nextRevision],
  );
};

export const archiveWorldbookEntry = (input: {
  current: Worldbook;
  sourceRef: WorldbookRevisionSourceRef;
  archivedAt?: number;
}): Worldbook => reviseWorldbookEntry({
  current: input.current,
  patch: { publicationStatus: 'archived' },
  sourceRef: input.sourceRef,
  updatedAt: input.archivedAt,
});

/** Restores old content as a new N+1 revision; history is never truncated. */
export const restoreWorldbookRevision = (input: {
  current: Worldbook;
  revisionId: string;
  restoredAt?: number;
}): Worldbook => {
  const current = normalizeWorldbookEntry(input.current);
  if (current.isBuiltIn || current.lockEditing) {
    throw new Error('Built-in Worldbook entries are read-only; create a related supplement instead');
  }
  const source = current.revisionSnapshots!.find(revision => revision.id === input.revisionId);
  if (!source) throw new Error('Worldbook restore source revision is missing');
  return reviseWorldbookEntry({
    current,
    patch: {
      title: source.title,
      content: source.content,
      category: source.category,
      aliases: source.aliases,
      activationHint: source.activationHint,
      publicationStatus: 'published',
      bindings: source.bindings,
      knowledgePolicy: source.knowledgePolicy,
      supplementsEntryIds: source.supplementsEntryIds,
    },
    sourceRef: { kind: 'revision_restore', refId: source.id, revision: source.revision },
    updatedAt: input.restoredAt,
  });
};

/** Code-owned refresh for an immutable built-in baseline; preserves history. */
export const refreshBuiltInWorldbookEntry = (input: {
  current: Worldbook;
  incoming: Worldbook;
  refreshedAt?: number;
}): Worldbook => {
  const current = normalizeWorldbookEntry(input.current);
  if (!current.isBuiltIn || !current.lockEditing) {
    throw new Error('Only an existing built-in Worldbook may use the built-in refresh path');
  }
  if (!input.incoming.isBuiltIn || !input.incoming.lockEditing || input.incoming.id !== current.id) {
    throw new Error('Built-in Worldbook refresh source is invalid');
  }
  const active = getActiveWorldbookRevision(current);
  const refreshedAt = requireTimestamp(input.refreshedAt ?? Date.now(), 'refreshedAt');
  const nextRevision = buildRevision({
    entryId: current.id,
    revision: active.revision + 1,
    title: input.incoming.title,
    content: input.incoming.content,
    category: input.incoming.category,
    aliases: active.aliases,
    activationHint: input.incoming.activationHint,
    publicationStatus: 'published',
    bindings: active.bindings,
    knowledgePolicy: active.knowledgePolicy,
    supplementsEntryIds: active.supplementsEntryIds,
    sourceRefs: [{
      kind: 'built_in',
      refId: input.incoming.id,
      revision: input.incoming.builtInVersion,
    }],
    createdAt: refreshedAt,
  });
  const errors = validateWorldbookRevision(nextRevision);
  if (errors.length) throw new Error(`Built-in Worldbook refresh rejected: ${errors.join('; ')}`);
  return withActiveRevisionMirror({
    ...current,
    ...input.incoming,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: refreshedAt,
  }, nextRevision, [...current.revisionSnapshots!, nextRevision]);
};

const validateCandidateDraft = (draft: WorldGrowthCandidateDraft): string[] => {
  const errors: string[] = [];
  if (!nonEmpty(draft?.title)) errors.push('draft.title is required');
  if (typeof draft?.content !== 'string') errors.push('draft.content must be text');
  if (typeof draft?.category !== 'string') errors.push('draft.category must be text');
  if (
    draft?.publicationStatus !== undefined
    && draft.publicationStatus !== 'published'
  ) {
    errors.push('draft.publicationStatus must be published');
  }
  if (!Array.isArray(draft?.bindings) || !draft.bindings.length) errors.push('draft.bindings are required');
  else draft.bindings.forEach((binding, index) => {
    errors.push(...validateWorldbookBinding(binding, `draft.bindings[${index}]`));
  });
  errors.push(...validateWorldbookKnowledgePolicy(draft?.knowledgePolicy));
  if (!Array.isArray(draft?.sourceRefs) || !draft.sourceRefs.length) {
    errors.push('draft.sourceRefs are required');
  } else {
    draft.sourceRefs.forEach((ref, index) => {
      if (![
        'built_in',
        'player',
        'import',
        'narrative_promotion',
        'revision_restore',
        'legacy_normalization',
      ].includes(ref?.kind)) {
        errors.push(`draft.sourceRefs[${index}].kind is invalid`);
      }
      if (!nonEmpty(ref?.refId)) errors.push(`draft.sourceRefs[${index}].refId is required`);
    });
  }
  return errors;
};

const narrativeBindingMatchesCandidate = (
  binding: WorldbookBinding,
  candidate: WorldGrowthCandidate,
): boolean => {
  if (candidate.source.kind !== 'narrative' || !candidate.scope) return false;
  if (binding.kind === 'global' || binding.kind === 'relationship') return false;
  if (!sameScope(binding.scope, candidate.scope)) return false;
  if (candidate.source.lane === 'mainline') {
    return (
      binding.kind === 'mainline'
      && binding.routeId === candidate.source.routeId
    ) || (
      binding.kind === 'route'
      && binding.lane === 'mainline'
      && binding.routeId === candidate.source.routeId
      && binding.branchId === undefined
    );
  }
  return (
    binding.kind === 'if_branch'
    && binding.routeId === candidate.source.routeId
    && binding.branchId === candidate.source.branchId
  ) || (
    binding.kind === 'route'
    && binding.lane === 'if_line'
    && binding.routeId === candidate.source.routeId
    && binding.branchId === candidate.source.branchId
  );
};

const candidateSourceRef = (candidate: WorldGrowthCandidate): WorldbookRevisionSourceRef => {
  if (candidate.source.kind === 'manual') {
    return { kind: 'player', refId: candidate.source.refId };
  }
  if (candidate.source.kind === 'import') {
    return { kind: 'import', refId: candidate.source.refId, revision: candidate.source.revision };
  }
  return { kind: 'narrative_promotion', refId: candidate.source.refId };
};

const sameSourceRef = (
  left: WorldbookRevisionSourceRef,
  right: WorldbookRevisionSourceRef,
): boolean => (
  left.kind === right.kind
  && left.refId === right.refId
  && left.revision === right.revision
);

export const validateWorldGrowthCandidate = (
  candidate: WorldGrowthCandidate,
): string[] => {
  const errors: string[] = [];
  if (candidate?.schemaVersion !== WORLD_GROWTH_CANDIDATE_SCHEMA_VERSION) {
    errors.push('schemaVersion is unsupported');
  }
  if (!nonEmpty(candidate?.id)) errors.push('id is required');
  if (!['pending', 'deferred', 'ignored', 'accepted'].includes(candidate?.status)) {
    errors.push('status is invalid');
  }
  if (candidate?.truthEffect !== 'none') errors.push('candidate truthEffect must remain none');
  if (!Number.isFinite(candidate?.createdAt) || !Number.isFinite(candidate?.updatedAt)) {
    errors.push('candidate timestamps are invalid');
  } else if (candidate.updatedAt < candidate.createdAt) {
    errors.push('candidate updatedAt cannot precede createdAt');
  }
  if (candidate?.targetEntryId && !candidate.baseRevisionId) {
    errors.push('an existing target requires baseRevisionId');
  }
  if (!candidate?.targetEntryId && candidate?.baseRevisionId) {
    errors.push('a new entry candidate cannot carry baseRevisionId');
  }
  if (candidate?.scope && validateHistoryScope(candidate.scope).length) {
    errors.push('candidate scope is invalid');
  }
  if (!candidate?.source || !['manual', 'import', 'narrative'].includes(candidate.source.kind)) {
    errors.push('source.kind is invalid');
  } else if (candidate.source.kind === 'manual') {
    if (!nonEmpty(candidate.source.refId)) errors.push('manual source refId is required');
  } else if (candidate.source.kind === 'import') {
    if (!nonEmpty(candidate.source.refId)) errors.push('import source refId is required');
    if (!Number.isInteger(candidate.source.revision) || candidate.source.revision < 1) {
      errors.push('import source revision must be a positive integer');
    }
  } else if (candidate.source.kind === 'narrative') {
    if (!candidate.scope || validateHistoryScope(candidate.scope).length) {
      errors.push('narrative candidate requires exact HistoryScope');
    }
    if (!['mainline', 'if_line'].includes(candidate.source.lane)) {
      errors.push('narrative source lane is invalid');
    }
    if (!nonEmpty(candidate.source.refId)) errors.push('narrative source refId is required');
    if (!nonEmpty(candidate.source.routeId)) errors.push('narrative source routeId is required');
    if (candidate.source.lane === 'if_line' && !nonEmpty(candidate.source.branchId)) {
      errors.push('IF narrative source branchId is required');
    }
    if (
      candidate.draft?.bindings?.length
      && !candidate.draft.bindings.every(binding => narrativeBindingMatchesCandidate(binding, candidate))
    ) {
      errors.push('narrative candidate bindings must stay inside its exact lane, route, branch, and scope');
    }
  }
  errors.push(...validateCandidateDraft(candidate?.draft));
  if (
    candidate?.source
    && ['manual', 'import', 'narrative'].includes(candidate.source.kind)
    && Array.isArray(candidate.draft?.sourceRefs)
  ) {
    const canonicalSource = candidateSourceRef(candidate);
    if (!candidate.draft.sourceRefs.some(source => sameSourceRef(source, canonicalSource))) {
      errors.push('candidate source must match an immutable draft sourceRef');
    }
  }
  if (candidate?.status === 'accepted' && !nonEmpty(candidate.acceptedRevisionId)) {
    errors.push('accepted candidate requires acceptedRevisionId');
  }
  if (candidate?.status !== 'accepted' && candidate?.acceptedRevisionId !== undefined) {
    errors.push('only an accepted candidate may reference an accepted revision');
  }
  return errors;
};

export const createWorldGrowthCandidate = (input: Omit<
  WorldGrowthCandidate,
  'schemaVersion' | 'status' | 'truthEffect' | 'updatedAt' | 'acceptedRevisionId'
>): WorldGrowthCandidate => {
  const candidate: WorldGrowthCandidate = {
    ...input,
    schemaVersion: WORLD_GROWTH_CANDIDATE_SCHEMA_VERSION,
    draft: {
      ...input.draft,
      aliases: input.draft.aliases ? [...input.draft.aliases] : undefined,
      bindings: input.draft.bindings.map(cloneBinding),
      knowledgePolicy: cloneKnowledgePolicy(input.draft.knowledgePolicy),
      supplementsEntryIds: input.draft.supplementsEntryIds
        ? [...input.draft.supplementsEntryIds]
        : undefined,
      sourceRefs: input.draft.sourceRefs.map(ref => ({ ...ref })),
    },
    scope: input.scope ? cloneScope(input.scope) : undefined,
    status: 'pending',
    truthEffect: 'none',
    updatedAt: input.createdAt,
  };
  const errors = validateWorldGrowthCandidate(candidate);
  if (errors.length) throw new Error(`World growth candidate rejected: ${errors.join('; ')}`);
  return candidate;
};

const acceptedCandidateSourceRefs = (
  candidate: WorldGrowthCandidate,
): WorldbookRevisionSourceRef[] => {
  const refs = [
    ...candidate.draft.sourceRefs.map(ref => ({ ...ref })),
    { kind: 'player', refId: `world-growth-accept:${candidate.id}` } as const,
  ];
  return refs.filter((ref, index) => (
    refs.findIndex(candidateRef => sameSourceRef(candidateRef, ref)) === index
  ));
};

export const acceptWorldGrowthCandidate = (input: {
  candidate: WorldGrowthCandidate;
  currentEntry?: Worldbook;
  newEntryId?: string;
  reviewedDraft?: WorldGrowthCandidatePlayerReview;
  acceptedAt?: number;
}): { entry: Worldbook; candidate: WorldGrowthCandidate } => {
  const errors = validateWorldGrowthCandidate(input.candidate);
  if (errors.length) throw new Error(`World growth candidate is invalid: ${errors.join('; ')}`);
  if (!['pending', 'deferred'].includes(input.candidate.status)) {
    throw new Error(`World growth candidate cannot be accepted from ${input.candidate.status}`);
  }
  const acceptedAt = requireTimestamp(input.acceptedAt ?? Date.now(), 'acceptedAt');
  const reviewedDraft = input.reviewedDraft ?? (input.currentEntry?.group ? {
    title: input.candidate.draft.title,
    content: input.candidate.draft.content,
    group: input.currentEntry.group,
  } : undefined);
  if (!reviewedDraft) throw new Error('New Worldbook candidate requires a player-selected group');
  if (!nonEmpty(reviewedDraft.title)) throw new Error('Reviewed Worldbook title is required');
  if (typeof reviewedDraft.content !== 'string') throw new Error('Reviewed Worldbook content must be text');
  const groupErrors = validateWorldbookGroupAssignment(reviewedDraft.group, 'reviewedDraft.group');
  if (groupErrors.length) throw new Error(groupErrors.join('; '));
  const acceptedDraft: WorldGrowthCandidateDraft = {
    ...input.candidate.draft,
    title: reviewedDraft.title.trim(),
    content: reviewedDraft.content,
    category: reviewedDraft.group.name.trim(),
    publicationStatus: 'published',
  };
  const sourceRefs = acceptedCandidateSourceRefs(input.candidate);
  let entry: Worldbook;
  if (input.candidate.targetEntryId) {
    if (!input.currentEntry || input.currentEntry.id !== input.candidate.targetEntryId) {
      throw new Error('World growth candidate target entry is missing');
    }
    const current = normalizeWorldbookEntry(input.currentEntry);
    if (current.group && JSON.stringify(current.group) !== JSON.stringify(reviewedDraft.group)) {
      throw new Error('An existing Worldbook entry cannot move across groups during review');
    }
    if (current.activeRevisionId !== input.candidate.baseRevisionId) {
      throw new Error('World growth candidate base revision is stale');
    }
    entry = {
      ...reviseWorldbookEntry({
      current,
      patch: acceptedDraft,
      sourceRef: candidateSourceRef(input.candidate),
      sourceRefs,
      updatedAt: acceptedAt,
      }),
      group: current.group || reviewedDraft.group,
    };
  } else {
    const entryId = input.newEntryId?.trim();
    if (!entryId) throw new Error('New Worldbook candidate requires a stable entry id');
    entry = createWorldbookEntry({
      book: {
        id: entryId,
        title: acceptedDraft.title,
        content: acceptedDraft.content,
        category: acceptedDraft.category,
        group: reviewedDraft.group,
        activationHint: input.candidate.draft.activationHint,
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
      },
      aliases: input.candidate.draft.aliases,
      publicationStatus: acceptedDraft.publicationStatus,
      bindings: input.candidate.draft.bindings,
      knowledgePolicy: input.candidate.draft.knowledgePolicy,
      supplementsEntryIds: input.candidate.draft.supplementsEntryIds,
      sourceRef: candidateSourceRef(input.candidate),
      sourceRefs,
    });
  }
  const candidate: WorldGrowthCandidate = {
    ...input.candidate,
    status: 'accepted',
    truthEffect: 'none',
    updatedAt: acceptedAt,
    acceptedRevisionId: entry.activeRevisionId,
  };
  return { entry, candidate };
};

export const deferOrIgnoreWorldGrowthCandidate = (input: {
  candidate: WorldGrowthCandidate;
  status: 'deferred' | 'ignored';
  updatedAt?: number;
}): WorldGrowthCandidate => {
  if (!['pending', 'deferred'].includes(input.candidate.status)) {
    throw new Error(`World growth candidate cannot change from ${input.candidate.status}`);
  }
  const candidate = {
    ...input.candidate,
    status: input.status,
    truthEffect: 'none' as const,
    updatedAt: requireTimestamp(input.updatedAt ?? Date.now(), 'updatedAt'),
  };
  const errors = validateWorldGrowthCandidate(candidate);
  if (errors.length) throw new Error(`World growth candidate update rejected: ${errors.join('; ')}`);
  return candidate;
};

export const worldbookScopesMatch = sameScope;
