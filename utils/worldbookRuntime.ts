import type { CharacterProfile, Worldbook } from '../types.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import {
  WORLDBOOK_PROJECTION_SCHEMA_VERSION,
  projectWorldbook,
  type WorldbookContinuityRef,
  type WorldbookKnowledgeSubjectRef,
  type WorldbookProjectionConsumerRef,
  type WorldbookProjectionExplicitRef,
  type WorldbookProjectionResult,
} from '../domain/worldbook/index.ts';
import { indexedDbWorldbookPersistence } from './worldbookPersistence.ts';
import {
  isBuiltInWorldbook,
  isWorldbookGroupEnabledForCharacter,
} from './worldbookGroups.ts';

export interface WorldbookRuntimeBudget {
  maxTotalChars: number;
  maxEntries: number;
  maxEntryChars: number;
}

export interface PrepareWorldbookRuntimeProjectionInput {
  requestId: string;
  library: readonly Worldbook[];
  character: Pick<CharacterProfile, 'id' | 'mountedWorldbooks' | 'mountedWorldbookGroupIds'>;
  scope: HistoryScope;
  consumer: WorldbookProjectionConsumerRef;
  knowledgeSubjects: readonly WorldbookKnowledgeSubjectRef[];
  continuity?: WorldbookContinuityRef;
  query: string;
  explicitRefs?: readonly WorldbookProjectionExplicitRef[];
  budget: WorldbookRuntimeBudget;
}

export interface PreparedWorldbookRuntimeProjection {
  projection: WorldbookProjectionResult;
  markdown: string;
}

const mountedEntryIdsFor = (
  input: Pick<PrepareWorldbookRuntimeProjectionInput, 'character' | 'library'>,
): string[] => [...new Set(
  [
    ...(input.character.mountedWorldbooks || [])
      .map(mounted => mounted.id?.trim())
      .filter((id): id is string => Boolean(id))
      .filter(id => isBuiltInWorldbook(input.library.find(entry => entry.id === id))),
    ...input.library
      .filter(entry => (
        !isBuiltInWorldbook(entry)
        && isWorldbookGroupEnabledForCharacter(entry.group, input.character)
      ))
      .map(entry => entry.id),
  ],
)];

/**
 * Render only the already-gated projection. Empty selections deliberately
 * render nothing so a low-signal turn adds no Worldbook heading or placeholder.
 */
export const formatWorldbookRuntimeProjection = (
  projection: WorldbookProjectionResult,
): string => {
  if (!projection.items.length) return '';
  const entries = projection.items.map(item => [
    `#### ${item.title}${item.category ? ` · ${item.category}` : ''}`,
    item.excerpt,
  ].join('\n')).join('\n\n');
  return `### 本轮相关世界资料
这些片段已通过当前角色挂载、关系归属、线路与知情范围检查。把它们当作可自然吸收的背景，不必逐条复述，也不要仅为了提到设定而改变角色原本的判断与表达。

${entries}`;
};

/**
 * Pure preparation seam. It never reads character-card cache prose and never
 * writes a delivery receipt; the provider consumer owns that later decision.
 */
export const prepareWorldbookRuntimeProjection = (
  input: PrepareWorldbookRuntimeProjectionInput,
): PreparedWorldbookRuntimeProjection => {
  if (input.character.id !== input.scope.charId) {
    throw new Error('Worldbook runtime character does not match exact HistoryScope');
  }
  const projection = projectWorldbook({
    schemaVersion: WORLDBOOK_PROJECTION_SCHEMA_VERSION,
    requestId: input.requestId,
    scope: input.scope,
    consumer: input.consumer,
    continuity: input.continuity,
    library: input.library,
    mountedEntryIds: mountedEntryIdsFor(input),
    knowledgeSubjects: input.knowledgeSubjects,
    query: input.query,
    explicitRefs: input.explicitRefs,
    budgetChars: input.budget.maxTotalChars,
    maxEntries: input.budget.maxEntries,
    maxCharsPerEntry: input.budget.maxEntryChars,
  });
  return {
    projection,
    markdown: formatWorldbookRuntimeProjection(projection),
  };
};

/**
 * Called only after the exact prepared projection entered a provider prompt and
 * the existing consumer accepted a usable model result. Persistence failure is
 * intentionally reported to the caller instead of changing the model result.
 */
export const recordWorldbookRuntimeProjectionDelivery = async (input: {
  prepared: PreparedWorldbookRuntimeProjection;
  consumer: WorldbookProjectionConsumerRef;
  deliveredAt?: number;
}) => indexedDbWorldbookPersistence.recordProjectionDeliveryReceipt({
  projection: input.prepared.projection,
  consumer: input.consumer,
  deliveredAt: input.deliveredAt,
});
