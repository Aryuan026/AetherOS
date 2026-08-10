import type { Worldbook } from '../../types.ts';
import { createHistoryScopeKey, validateHistoryScope } from '../historyImport/contract.ts';
import type { HistoryScope } from '../historyImport/types.ts';
import {
  getActiveWorldbookRevision,
  hashWorldbookText,
  normalizeWorldbookEntry,
  validateWorldbookBinding,
} from './contract.ts';
import {
  WORLDBOOK_PROJECTION_SCHEMA_VERSION,
  type WorldbookBinding,
  type WorldbookContinuityRef,
  type WorldbookKnowledgePolicy,
  type WorldbookKnowledgeSubjectRef,
  type WorldbookProjectionConsumerRef,
  type WorldbookProjectionDeliveryReceipt,
  type WorldbookProjectionDrop,
  type WorldbookProjectionExplicitRef,
  type WorldbookProjectionItem,
  type WorldbookProjectionRequest,
  type WorldbookProjectionResult,
  type WorldbookRevisionSnapshot,
} from './types.ts';

const LOW_SIGNAL_QUERIES = new Set([
  '你好', '嗨', '哈喽', 'hello', 'hi', '在吗', '早', '早安', '晚安',
  '嗯', '哦', '啊', '哈哈', '谢谢', '谢谢你', '好', '好的',
]);

const compact = (value: string): string => value.replace(/\s+/gu, ' ').trim();
const normalized = (value: string): string => compact(value).toLocaleLowerCase();

const lowSignalOnly = (query: string): boolean => {
  const value = normalized(query).replace(/[，。！？；、,.!?;:：~～…\s]/gu, '');
  return !value
    || LOW_SIGNAL_QUERIES.has(value)
    || /^[嗯哦啊哈诶欸呃唔]+$/u.test(value);
};

/** Chinese-friendly deterministic tokens. A future vector ranker may replace only this scorer. */
export const tokenizeWorldbookQuery = (query: string): string[] => {
  if (lowSignalOnly(query)) return [];
  const value = normalized(query);
  const tokens = new Set<string>();
  for (const match of value.matchAll(/[\p{Script=Han}]+|[a-z0-9_-]{2,}/gu)) {
    const segment = match[0];
    if (/^[\p{Script=Han}]+$/u.test(segment)) {
      if (segment.length <= 6) tokens.add(segment);
      for (let index = 0; index < segment.length - 1; index += 1) {
        tokens.add(segment.slice(index, index + 2));
      }
      for (let index = 0; index < segment.length - 2; index += 1) {
        tokens.add(segment.slice(index, index + 3));
      }
    } else {
      tokens.add(segment);
    }
  }
  return [...tokens].filter(token => token.length > 1);
};

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const bindingMatches = (
  binding: WorldbookBinding,
  scope: HistoryScope,
  continuity?: WorldbookContinuityRef,
): boolean => {
  if (binding.kind === 'global') return true;
  if (!sameScope(binding.scope, scope)) return false;
  if (binding.kind === 'relationship') return true;
  if (binding.kind === 'mainline') {
    return continuity?.lane === 'mainline'
      && (!binding.routeId || binding.routeId === continuity.routeId);
  }
  if (binding.kind === 'if_branch') {
    return continuity?.lane === 'if_line'
      && binding.routeId === continuity.routeId
      && binding.branchId === continuity.branchId;
  }
  return binding.lane === continuity?.lane
    && binding.routeId === continuity.routeId
    && (!binding.branchId || binding.branchId === continuity.branchId);
};

const subjectIdentity = (subject: WorldbookKnowledgeSubjectRef): string => (
  `${subject.kind}:${subject.id}`
);

const knowledgeAllows = (
  policy: WorldbookKnowledgePolicy,
  consumer: WorldbookProjectionConsumerRef,
  subjects: readonly WorldbookKnowledgeSubjectRef[],
): boolean => {
  if (policy.kind === 'public') return true;
  if (policy.kind === 'director_only') return consumer.kind === 'world_director';
  const requested = new Set(subjects.map(subjectIdentity));
  return policy.subjects.some(subject => requested.has(subjectIdentity(subject)));
};

const scoreRevision = (
  revision: WorldbookRevisionSnapshot,
  tokens: readonly string[],
): number => {
  const title = normalized(revision.title);
  const aliases = normalized(revision.aliases.join(' '));
  const category = normalized(revision.category);
  const hint = normalized(revision.activationHint || '');
  const content = normalized(revision.content);
  return tokens.reduce((score, token) => (
    score
    + (title.includes(token) ? 14 : 0)
    + (aliases.includes(token) ? 12 : 0)
    + (category.includes(token) ? 7 : 0)
    + (hint.includes(token) ? 6 : 0)
    + (content.includes(token) ? 2 : 0)
  ), 0);
};

const excerptFor = (
  content: string,
  tokens: readonly string[],
  limit: number,
): string => {
  const clean = compact(content);
  if (!clean || limit <= 0) return '';
  if (clean.length <= limit) return clean;
  const lower = clean.toLocaleLowerCase();
  const hit = tokens
    .map(token => lower.indexOf(token))
    .filter(index => index >= 0)
    .sort((left, right) => left - right)[0];
  const center = hit ?? 0;
  const start = Math.max(0, Math.min(center - Math.floor(limit / 3), clean.length - limit));
  const prefix = start > 0 ? '…' : '';
  const suffix = start + limit < clean.length ? '…' : '';
  const bodyLimit = Math.max(0, limit - prefix.length - suffix.length);
  return `${prefix}${clean.slice(start, start + bodyLimit)}${suffix}`;
};

const requireConsumer = (consumer: WorldbookProjectionConsumerRef): void => {
  if (!consumer?.id.trim() || !consumer?.revision.trim()) {
    throw new Error('Worldbook projection consumer id and revision are required');
  }
  if (![
    'chat', 'call', 'date', 'story_mainline', 'story_if',
    'world_director', 'worldbook_preview', 'other',
  ].includes(consumer.kind)) {
    throw new Error('Worldbook projection consumer kind is invalid');
  }
};

const requireKnowledgeSubjects = (
  subjects: readonly WorldbookKnowledgeSubjectRef[],
): void => {
  const identities = new Set<string>();
  subjects.forEach((subject, index) => {
    if (!['user', 'character', 'npc', 'organization', 'narrator'].includes(subject?.kind)) {
      throw new Error(`Worldbook projection knowledgeSubjects[${index}].kind is invalid`);
    }
    if (!subject?.id?.trim()) {
      throw new Error(`Worldbook projection knowledgeSubjects[${index}].id is required`);
    }
    const identity = subjectIdentity(subject);
    if (identities.has(identity)) {
      throw new Error('Worldbook projection knowledgeSubjects must be unique');
    }
    identities.add(identity);
  });
};

const requireContinuity = (
  consumer: WorldbookProjectionConsumerRef,
  continuity?: WorldbookContinuityRef,
): void => {
  if (consumer.kind === 'story_mainline' && continuity?.lane !== 'mainline') {
    throw new Error('Mainline Worldbook projection requires mainline continuity');
  }
  if (
    consumer.kind === 'story_if'
    && (continuity?.lane !== 'if_line' || !continuity.routeId?.trim() || !continuity.branchId?.trim())
  ) {
    throw new Error('IF Worldbook projection requires exact route and branch continuity');
  }
  if (continuity?.routeId !== undefined && !continuity.routeId.trim()) {
    throw new Error('Worldbook projection routeId must not be blank');
  }
  if (continuity?.branchId !== undefined && !continuity.branchId.trim()) {
    throw new Error('Worldbook projection branchId must not be blank');
  }
};

export const projectWorldbook = (input: WorldbookProjectionRequest & {
  library: readonly Worldbook[];
}): WorldbookProjectionResult => {
  if (input.schemaVersion !== WORLDBOOK_PROJECTION_SCHEMA_VERSION) {
    throw new Error('Worldbook projection schemaVersion is unsupported');
  }
  const scopeErrors = validateHistoryScope(input.scope);
  if (scopeErrors.length) throw new Error(`Worldbook projection scope rejected: ${scopeErrors.join('; ')}`);
  if (!input.requestId.trim()) throw new Error('Worldbook projection requestId is required');
  requireConsumer(input.consumer);
  requireKnowledgeSubjects(input.knowledgeSubjects);
  requireContinuity(input.consumer, input.continuity);
  if (!Number.isInteger(input.budgetChars) || input.budgetChars < 0) {
    throw new Error('Worldbook projection budgetChars must be a non-negative integer');
  }
  if (!Number.isInteger(input.maxEntries) || input.maxEntries < 0) {
    throw new Error('Worldbook projection maxEntries must be a non-negative integer');
  }
  const maxCharsPerEntry = input.maxCharsPerEntry ?? input.budgetChars;
  if (!Number.isInteger(maxCharsPerEntry) || maxCharsPerEntry < 0) {
    throw new Error('Worldbook projection maxCharsPerEntry must be a non-negative integer');
  }
  if (input.mountedEntryIds.some(entryId => !entryId.trim())) {
    throw new Error('Worldbook projection mountedEntryIds must not contain blank ids');
  }
  if (new Set(input.mountedEntryIds).size !== input.mountedEntryIds.length) {
    throw new Error('Worldbook projection mountedEntryIds must be unique');
  }
  (input.explicitRefs ?? []).forEach((ref, index) => {
    if (!ref.entryId?.trim()) {
      throw new Error(`Worldbook projection explicitRefs[${index}].entryId is required`);
    }
    if (ref.revisionId !== undefined && !ref.revisionId.trim()) {
      throw new Error(`Worldbook projection explicitRefs[${index}].revisionId must not be blank`);
    }
  });
  if (
    new Set((input.explicitRefs ?? []).map(ref => ref.entryId)).size
    !== (input.explicitRefs ?? []).length
  ) {
    throw new Error('Worldbook projection explicitRefs must be unique by entryId');
  }
  if (new Set(input.library.map(entry => entry.id)).size !== input.library.length) {
    throw new Error('Worldbook projection library contains duplicate entry ids');
  }
  const mounted = new Set(input.mountedEntryIds);
  const explicitRefs = new Map((input.explicitRefs ?? []).map(ref => [ref.entryId, ref]));
  const tokens = tokenizeWorldbookQuery(input.query);
  const dropped: WorldbookProjectionDrop[] = [];
  const candidates: Array<{
    entry: Worldbook;
    revision: WorldbookRevisionSnapshot;
    matchedBindingIds: string[];
    selectedBy: WorldbookProjectionItem['selectedBy'];
    score: number;
  }> = [];

  input.library.forEach(rawEntry => {
    let entry: Worldbook;
    let revision: WorldbookRevisionSnapshot;
    try {
      entry = normalizeWorldbookEntry(rawEntry);
      revision = getActiveWorldbookRevision(entry);
    } catch {
      dropped.push({ entryId: rawEntry.id, reason: 'stale_revision' });
      return;
    }
    if (!mounted.has(entry.id)) {
      dropped.push({ entryId: entry.id, reason: 'not_mounted' });
      return;
    }
    if (
      entry.visibleToCharacterIds?.length
      && !entry.visibleToCharacterIds.includes(input.scope.charId)
    ) {
      dropped.push({ entryId: entry.id, reason: 'character_visibility' });
      return;
    }
    if (revision.publicationStatus === 'archived') {
      dropped.push({ entryId: entry.id, reason: 'archived' });
      return;
    }
    if (revision.bindings.some(binding => validateWorldbookBinding(binding).length)) {
      dropped.push({ entryId: entry.id, reason: 'scope' });
      return;
    }
    const matchedBindingIds = revision.bindings
      .filter(binding => bindingMatches(binding, input.scope, input.continuity))
      .map(binding => binding.id);
    if (!matchedBindingIds.length) {
      dropped.push({ entryId: entry.id, reason: 'scope' });
      return;
    }
    if (!knowledgeAllows(revision.knowledgePolicy, input.consumer, input.knowledgeSubjects)) {
      dropped.push({ entryId: entry.id, reason: 'knowledge' });
      return;
    }
    const explicitRef = explicitRefs.get(entry.id);
    if (explicitRef?.revisionId && explicitRef.revisionId !== revision.id) {
      dropped.push({ entryId: entry.id, reason: 'stale_revision' });
      return;
    }
    const score = explicitRef ? 10_000 : scoreRevision(revision, tokens);
    if (!explicitRef && (!tokens.length || score <= 0)) {
      dropped.push({ entryId: entry.id, reason: 'not_relevant' });
      return;
    }
    candidates.push({
      entry,
      revision,
      matchedBindingIds,
      selectedBy: explicitRef ? 'explicit_ref' : 'relevance',
      score,
    });
  });

  candidates.sort((left, right) => (
    Number(right.selectedBy === 'explicit_ref') - Number(left.selectedBy === 'explicit_ref')
    || right.score - left.score
    || right.revision.createdAt - left.revision.createdAt
    || left.entry.id.localeCompare(right.entry.id)
  ));

  const items: WorldbookProjectionItem[] = [];
  let usedChars = 0;
  candidates.forEach(candidate => {
    if (items.length >= input.maxEntries || usedChars >= input.budgetChars) {
      dropped.push({ entryId: candidate.entry.id, reason: 'budget' });
      return;
    }
    const remaining = input.budgetChars - usedChars;
    const metadataChars = [
      candidate.revision.title,
      candidate.revision.category,
      candidate.revision.aliases.join(' '),
      candidate.revision.activationHint || '',
    ].filter(Boolean).join('\n').length;
    const availableExcerptChars = Math.min(
      maxCharsPerEntry - metadataChars,
      remaining - metadataChars,
    );
    const excerpt = excerptFor(
      candidate.revision.content,
      tokens,
      availableExcerptChars,
    );
    if (!excerpt) {
      dropped.push({ entryId: candidate.entry.id, reason: 'budget' });
      return;
    }
    items.push({
      entryId: candidate.entry.id,
      revisionId: candidate.revision.id,
      revision: candidate.revision.revision,
      title: candidate.revision.title,
      category: candidate.revision.category,
      aliases: [...candidate.revision.aliases],
      activationHint: candidate.revision.activationHint,
      excerpt,
      contentHash: candidate.revision.contentHash,
      matchedBindingIds: candidate.matchedBindingIds,
      selectedBy: candidate.selectedBy,
      score: candidate.score,
      charCount: metadataChars + excerpt.length,
    });
    usedChars += metadataChars + excerpt.length;
  });

  const queryHash = hashWorldbookText(input.query);
  const selectionFingerprint = hashWorldbookText(JSON.stringify({
    requestId: input.requestId,
    scope: createHistoryScopeKey(input.scope),
    consumer: input.consumer,
    continuity: input.continuity,
    knowledgeSubjects: input.knowledgeSubjects,
    queryHash,
    items: items.map(item => [item.entryId, item.revisionId, item.contentHash]),
    budgetChars: input.budgetChars,
  }));
  return {
    schemaVersion: WORLDBOOK_PROJECTION_SCHEMA_VERSION,
    selectionId: `worldbook-selection:${selectionFingerprint.slice(selectionFingerprint.indexOf(':') + 1)}`,
    requestId: input.requestId,
    scope: { ...input.scope },
    consumer: { ...input.consumer },
    continuity: input.continuity ? { ...input.continuity } : undefined,
    knowledgeSubjects: input.knowledgeSubjects.map(subject => ({ ...subject })),
    queryHash,
    budgetChars: input.budgetChars,
    usedChars,
    items,
    dropped,
    truthEffect: 'none',
  };
};

export const createWorldbookProjectionDeliveryReceipt = (input: {
  projection: WorldbookProjectionResult;
  consumer: WorldbookProjectionConsumerRef;
  deliveredAt?: number;
}): WorldbookProjectionDeliveryReceipt => {
  requireConsumer(input.consumer);
  if (input.projection.schemaVersion !== WORLDBOOK_PROJECTION_SCHEMA_VERSION) {
    throw new Error('Worldbook delivery projection schemaVersion is unsupported');
  }
  const scopeErrors = validateHistoryScope(input.projection.scope);
  if (scopeErrors.length) {
    throw new Error(`Worldbook delivery scope rejected: ${scopeErrors.join('; ')}`);
  }
  if (!input.projection.selectionId.trim() || !input.projection.requestId.trim()) {
    throw new Error('Worldbook delivery projection references are required');
  }
  requireKnowledgeSubjects(input.projection.knowledgeSubjects);
  if (
    !Number.isInteger(input.projection.budgetChars)
    || !Number.isInteger(input.projection.usedChars)
    || input.projection.usedChars < 0
    || input.projection.usedChars > input.projection.budgetChars
  ) {
    throw new Error('Worldbook delivery projection budget is invalid');
  }
  if (
    input.projection.items.reduce((total, item) => total + item.charCount, 0)
    !== input.projection.usedChars
  ) {
    throw new Error('Worldbook delivery projection usedChars does not match its items');
  }
  if (new Set(input.projection.items.map(item => item.entryId)).size !== input.projection.items.length) {
    throw new Error('Worldbook delivery projection contains duplicate entries');
  }
  if (
    input.projection.consumer.kind !== input.consumer.kind
    || input.projection.consumer.id !== input.consumer.id
    || input.projection.consumer.revision !== input.consumer.revision
  ) {
    throw new Error('Worldbook delivery consumer does not match the prepared projection');
  }
  if (input.projection.truthEffect !== 'none') {
    throw new Error('Worldbook projection cannot create truth through delivery');
  }
  const deliveredAt = input.deliveredAt ?? Date.now();
  if (!Number.isFinite(deliveredAt) || deliveredAt < 0) {
    throw new Error('Worldbook delivery timestamp is invalid');
  }
  const identity = hashWorldbookText(JSON.stringify({
    selectionId: input.projection.selectionId,
    consumer: input.consumer,
    deliveredAt,
  }));
  return {
    schemaVersion: WORLDBOOK_PROJECTION_SCHEMA_VERSION,
    id: `worldbook-delivery:${identity.slice(identity.indexOf(':') + 1)}`,
    selectionId: input.projection.selectionId,
    requestId: input.projection.requestId,
    scope: { ...input.projection.scope },
    scopeKey: createHistoryScopeKey(input.projection.scope),
    consumer: { ...input.consumer },
    knowledgeSubjects: input.projection.knowledgeSubjects.map(subject => ({ ...subject })),
    delivered: input.projection.items.map(item => ({
      entryId: item.entryId,
      revisionId: item.revisionId,
      contentHash: item.contentHash,
      charCount: item.charCount,
    })),
    budgetChars: input.projection.budgetChars,
    usedChars: input.projection.usedChars,
    status: 'delivered',
    truthEffect: 'none',
    deliveredAt,
  };
};

export const assertWorldbookProjectionDeliveryReceipt = (
  receipt: WorldbookProjectionDeliveryReceipt,
): void => {
  if (receipt?.schemaVersion !== WORLDBOOK_PROJECTION_SCHEMA_VERSION) {
    throw new Error('Worldbook delivery receipt schemaVersion is unsupported');
  }
  if (!receipt.id?.trim() || !receipt.selectionId?.trim() || !receipt.requestId?.trim()) {
    throw new Error('Worldbook delivery receipt references are required');
  }
  const scopeErrors = validateHistoryScope(receipt.scope);
  if (scopeErrors.length) {
    throw new Error(`Worldbook delivery receipt scope rejected: ${scopeErrors.join('; ')}`);
  }
  if (receipt.scopeKey !== createHistoryScopeKey(receipt.scope)) {
    throw new Error('Worldbook delivery receipt scopeKey does not match scope');
  }
  requireConsumer(receipt.consumer);
  requireKnowledgeSubjects(receipt.knowledgeSubjects);
  if (receipt.status !== 'delivered' || receipt.truthEffect !== 'none') {
    throw new Error('Worldbook delivery receipt cannot create truth');
  }
  if (
    !Number.isInteger(receipt.budgetChars)
    || !Number.isInteger(receipt.usedChars)
    || receipt.usedChars < 0
    || receipt.usedChars > receipt.budgetChars
    || receipt.delivered.reduce((total, item) => total + item.charCount, 0) !== receipt.usedChars
  ) {
    throw new Error('Worldbook delivery receipt budget is invalid');
  }
  if (new Set(receipt.delivered.map(item => item.entryId)).size !== receipt.delivered.length) {
    throw new Error('Worldbook delivery receipt contains duplicate entries');
  }
  receipt.delivered.forEach((item, index) => {
    if (
      !item.entryId?.trim()
      || !item.revisionId?.trim()
      || !item.contentHash?.trim()
      || !Number.isInteger(item.charCount)
      || item.charCount < 0
    ) {
      throw new Error(`Worldbook delivery receipt delivered[${index}] is invalid`);
    }
  });
  if (!Number.isFinite(receipt.deliveredAt) || receipt.deliveredAt < 0) {
    throw new Error('Worldbook delivery receipt timestamp is invalid');
  }
};
