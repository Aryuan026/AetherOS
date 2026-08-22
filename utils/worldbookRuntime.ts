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
import {
  builtInStoryEnhancementPackForEntry,
  directorReferenceEntryIdsForMountedStoryEntries,
  storyEnhancementPackAllowsRuntime,
  type DeepspaceStoryRuntimeContext,
} from '../domain/deepspaceStoryEnhancement/index.ts';

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
  storyContext?: DeepspaceStoryRuntimeContext;
  budget: WorldbookRuntimeBudget;
}

export interface PreparedWorldbookRuntimeProjection {
  projection: WorldbookProjectionResult;
  markdown: string;
}

const WORLDBOOK_FOLLOW_UP_CUES = [
  /^(?:那|这个|那个|这些|那些|这件事|那件事|刚才|所以|然后|后来|还有|至于|关于)/,
  /(?:呢|又|还|当时|后来|为什么|怎么|是谁|谁|哪里|什么时候|中文|英文|名字|目标)[呀啊嘛吗呢吧？?!！。\s]*$/,
];

/**
 * Worldbook selection normally follows the current message only. A short,
 * clearly referential follow-up may borrow the immediately previous user turn
 * so “那中文名呢？” does not lose the topic that named the relevant archive.
 * This string is selector-only: it is never rendered into the model prompt.
 */
export const buildWorldbookRecallQuery = (input: {
  query: string;
  previousQuery?: string;
}): string => {
  const query = input.query.replace(/\s+/g, ' ').trim();
  const previousQuery = (input.previousQuery || '').replace(/\s+/g, ' ').trim();
  const isReferentialFollowUp = Boolean(
    previousQuery
    && query
    && query.length <= 64
    && WORLDBOOK_FOLLOW_UP_CUES.some(pattern => pattern.test(query)),
  );
  if (!isReferentialFollowUp) return query;
  return `${previousQuery.slice(-260)}\n${query.slice(0, 180)}`;
};

const mountedEntryIdsFor = (
  input: Pick<PrepareWorldbookRuntimeProjectionInput, 'character' | 'library' | 'consumer' | 'continuity' | 'storyContext'>,
): string[] => {
  const explicitlyMountedBuiltInIds = (input.character.mountedWorldbooks || [])
    .map(mounted => mounted.id?.trim())
    .filter((id): id is string => Boolean(id))
    .filter(id => isBuiltInWorldbook(input.library.find(entry => entry.id === id)))
    .filter(id => {
      const pack = builtInStoryEnhancementPackForEntry(id);
      return !pack || storyEnhancementPackAllowsRuntime({
        pack,
        charId: input.character.id,
        consumer: input.consumer.kind,
        continuity: input.continuity,
        context: input.storyContext,
      });
    });
  const directorReferenceIds = input.consumer.kind === 'world_director'
    ? directorReferenceEntryIdsForMountedStoryEntries(explicitlyMountedBuiltInIds)
      .filter(id => isBuiltInWorldbook(input.library.find(entry => entry.id === id)))
      .filter(id => {
        const pack = builtInStoryEnhancementPackForEntry(id);
        return Boolean(pack && storyEnhancementPackAllowsRuntime({
          pack,
          charId: input.character.id,
          consumer: input.consumer.kind,
          continuity: input.continuity,
          context: input.storyContext,
        }));
      })
    : [];
  const enabledPlayerEntryIds = input.library
    .filter(entry => (
      !isBuiltInWorldbook(entry)
      && isWorldbookGroupEnabledForCharacter(entry.group, input.character)
    ))
    .map(entry => entry.id);
  return [...new Set([
    ...explicitlyMountedBuiltInIds,
    ...directorReferenceIds,
    ...enabledPlayerEntryIds,
  ])];
};

/**
 * Render only the already-gated projection. Empty selections deliberately
 * render nothing so a low-signal turn adds no Worldbook heading or placeholder.
 */
export const formatWorldbookRuntimeProjection = (
  projection: WorldbookProjectionResult,
): string => {
  if (!projection.items.length) return '';
  const entries = projection.items.map(item => [
    `#### ${item.title}`,
    item.excerpt,
  ].join('\n')).join('\n\n');
  return `### 当前可参考的世界信息
以下内容可能描述公共背景、过去经历或一条明确的世界线。只在与眼前话题有关时自然使用，不必逐条复述；过去不等于此刻，世界背景也不会自动改变人物关系、当前动机或已经发生的经历。

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
