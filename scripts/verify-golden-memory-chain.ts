import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import type { CharacterProfile, FullBackupData, UserProfile } from '../types.ts';
import { buildHistoryIdentityBindingDraft } from '../domain/historyImport/identityBinding.ts';
import { createEvidenceSpan } from '../domain/interactionEvidence/index.ts';
import {
  MEMORY_INTERPRETATION_SCHEMA_VERSION,
  MEMORY_PROMOTION_POLICY_VERSION,
  assertMemoryExtractionReceipt,
  assertMemoryInterpretationPass,
  createMemoryCandidateId,
  createMemoryExtractionReceiptId,
  createMemoryExtractionRequestId,
  createMemoryInterpretationPassId,
  createMemoryPromotionCommandId,
  type MemoryCandidate,
  type MemoryDMModelPort,
  type MemoryPromotionCommand,
} from '../domain/memoryInterpretation/index.ts';
import {
  activatePreparedHistoryArchiveCandidate,
  prepareHistoryArchiveCandidateFromWorkspace,
} from '../utils/historyImport/archive/importCandidate.ts';
import { pageActiveHistoryChatTimeline } from '../utils/historyImport/archive/chatTimeline.ts';
import { createHistoryIntakeWorkspaceFromSource } from '../utils/historyImport/storage/intakeWorkspace.ts';
import {
  HISTORY_ARCHIVE_CONTROL_DB_NAME,
  getActiveHistoryArchive,
} from '../utils/historyImport/storage/indexedDbArchive.ts';
import { syncActiveHistoryToDailyArchive } from '../utils/dailyArchive/historySync.ts';
import {
  buildDailyArchiveBackupFiles,
  confirmDailyArchiveDay,
  curateDailyArchiveMessages,
  deleteDailyArchiveDatabase,
  getDailyArchiveDocument,
  listAllConversationClippings,
  listAllDailyArchiveDocuments,
  listAllDailyArchiveMessageRevisions,
  replaceConversationClippings,
  replaceDailyArchiveDocuments,
  verifyDailyArchiveBackupFiles,
} from '../utils/dailyArchive/storage.ts';
import { DB } from '../utils/db.ts';
import { dailyArchiveEvidenceReadPort } from '../utils/memoryCore/evidencePort.ts';
import { memoryInterpretationStore } from '../utils/memoryCore/interpretationStore.ts';
import { runMemoryDMPass } from '../utils/memoryCore/memoryDm.ts';
import { listMemoryProjectionViews, reviseMemoryProjectionView } from '../utils/memoryCore/memoryProjection.ts';
import { memoryPromotionService } from '../utils/memoryCore/memoryPromotion.ts';
import {
  activatePreparedHistoryArchiveSystemRestore,
  buildHistoryArchiveSystemBackupFiles,
  prepareHistoryArchiveSystemRestore,
} from '../utils/systemBackup/historyArchiveSnapshot.ts';

const at = (value: string): number => Date.parse(value);
const scope = {
  progressBundleId: 'golden-chain-progress',
  personaMaskId: 'golden-chain-mask',
  charId: 'golden-chain-char',
};
const character: CharacterProfile = {
  id: scope.charId,
  name: '星河',
  avatar: '',
  description: '虚构验收角色',
  systemPrompt: '',
  memories: [],
};
const userProfile: UserProfile = {
  name: '旅人',
  avatar: '',
  bio: '',
  activePersonaMaskId: scope.personaMaskId,
  activeProgressBundleId: scope.progressBundleId,
  personaMasks: [{
    id: scope.personaMaskId,
    label: '旅人',
    name: '旅人',
    avatar: '',
    bio: '',
    linkedCharacterIds: [scope.charId],
    progressBundleId: scope.progressBundleId,
    createdAt: at('2026-07-20T08:00:00+08:00'),
    updatedAt: at('2026-07-20T08:00:00+08:00'),
  }],
  progressBundles: [{
    id: scope.progressBundleId,
    maskId: scope.personaMaskId,
    label: '旅人 × 星河',
    surfacePolicy: {},
    createdAt: at('2026-07-20T08:00:00+08:00'),
    updatedAt: at('2026-07-20T08:00:00+08:00'),
  }],
};
await DB.saveCharacter(character);
await DB.saveUserProfile(userProfile);

const bindingDraft = buildHistoryIdentityBindingDraft({
  draftSeed: 'golden-chain-history',
  mask: { id: scope.personaMaskId, label: '旅人', progressBundleId: scope.progressBundleId },
  character: { id: scope.charId, label: '星河' },
});
const workspace = await createHistoryIntakeWorkspaceFromSource({
  bindingDraft,
  now: at('2026-07-20T08:05:00+08:00'),
  source: {
    name: 'golden-chain-fiction.txt',
    mimeType: 'text/plain',
    bytes: new TextEncoder().encode([
      'user:我们第一次在玻璃花房里听雨。',
      'timestamp:2024-05-01 08:00:00',
      'assistant:我把那天折成一枚纸星星收好了。',
      'timestamp:2024-05-01 08:01:00',
    ].join('\n')),
  },
});
const importCandidate = await prepareHistoryArchiveCandidateFromWorkspace({
  manifest: workspace,
  now: at('2026-07-20T08:06:00+08:00'),
});
assert.equal(importCandidate.status, 'candidate_ready');
if (importCandidate.status !== 'candidate_ready') throw new Error('golden history candidate was not prepared');
await activatePreparedHistoryArchiveCandidate({
  candidate: importCandidate,
  activatedAt: at('2026-07-20T08:07:00+08:00'),
});
assert.equal((await syncActiveHistoryToDailyArchive({ scope })).matchedCount, 2);

const importedDay = await getDailyArchiveDocument({ scope, dateKey: '2024-05-01' });
assert.ok(importedDay);
const importedUserLine = importedDay!.messages.find(message => message.role === 'user')!;
await curateDailyArchiveMessages({
  scope,
  messages: [importedUserLine],
  operation: { kind: 'edit_content', content: '我们第一次在玻璃花房外听雨。' },
  now: at('2026-07-20T08:08:00+08:00'),
});
await confirmDailyArchiveDay({
  scope,
  dateKey: '2024-05-01',
  now: at('2026-07-20T08:09:00+08:00'),
});
const correctedDay = await getDailyArchiveDocument({ scope, dateKey: '2024-05-01' });
assert.equal(correctedDay?.dayConfirmation?.status, 'confirmed');
assert.equal(correctedDay?.messages.find(message => message.id === importedUserLine.id)?.revision, 2);
assert.equal(
  correctedDay?.messages.find(message => message.id === importedUserLine.id)?.content,
  '我们第一次在玻璃花房外听雨。',
);

const liveMetadata = (source: 'chat' | 'date', interactionId: string) => ({
  source,
  temporalClass: 'live' as const,
  relationshipScope: scope,
  interactionId,
});
await DB.saveMessage({
  charId: scope.charId,
  role: 'user',
  type: 'text',
  content: '今晚还想听一会儿雨。',
  timestamp: at('2026-07-20T20:00:00+08:00'),
  metadata: liveMetadata('chat', 'golden-chat-turn'),
});
await DB.saveMessage({
  charId: scope.charId,
  role: 'assistant',
  type: 'text',
  content: '那就把窗留一条缝。',
  timestamp: at('2026-07-20T20:00:05+08:00'),
  metadata: liveMetadata('chat', 'golden-chat-turn'),
});
await DB.saveMessage({
  charId: scope.charId,
  role: 'user',
  type: 'text',
  content: '（把纸星星放回他掌心）这次别弄丢。',
  timestamp: at('2026-07-20T20:10:00+08:00'),
  metadata: liveMetadata('date', 'golden-date-scene'),
});

const evidence = await dailyArchiveEvidenceReadPort.listActiveEvidence({ scope });
assert.deepEqual(
  [...new Set(evidence.map(record => record.evidence.source.surface))].sort(),
  ['chat', 'date', 'history_import'],
  'old history, Chat, and Date must share one typed evidence lane without losing their source surface',
);
const historicalEvidence = evidence.filter(record => record.evidence.temporalClass === 'historical');
const liveEvidence = evidence.filter(record => record.evidence.temporalClass === 'live');

const historicalEvidenceSpan = await createEvidenceSpan({
  scope,
  evidence: historicalEvidence.map(record => record.evidence),
});
const historicalAnalysisRunId = 'golden-historical-pass';
const historicalRequestId = createMemoryExtractionRequestId({
  scope,
  analysisRunId: historicalAnalysisRunId,
});
const historicalPassId = createMemoryInterpretationPassId({
  scope,
  analysisRunId: historicalAnalysisRunId,
});
const historicalCandidates: MemoryCandidate[] = [
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(historicalPassId, 0),
    passId: historicalPassId,
    scope,
    sourceEvidenceIds: [...historicalEvidenceSpan.evidenceIds],
    target: 'relationship_memory',
    knowledge: 'shared',
    temporalClass: 'historical',
    authority: 'model_interpretation',
    claimClass: 'shared_experience',
    status: 'proposed',
    title: '玻璃花房外的雨',
    summary: '两个人曾在玻璃花房外一起听雨。',
    happenedAt: '2024-05-01',
  },
  {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    id: createMemoryCandidateId(historicalPassId, 1),
    passId: historicalPassId,
    scope,
    sourceEvidenceIds: [...historicalEvidenceSpan.evidenceIds],
    target: 'timebook',
    knowledge: 'shared',
    temporalClass: 'historical',
    authority: 'model_interpretation',
    claimClass: 'shared_experience',
    status: 'proposed',
    title: '第一次一起听雨',
    summary: '一枚纸星星留下了那天的回声。',
    happenedAt: '2024-05-01',
  },
];
const historicalPass = assertMemoryInterpretationPass({
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  id: historicalPassId,
  requestId: historicalRequestId,
  analysisRunId: historicalAnalysisRunId,
  scope,
  evidenceSpan: historicalEvidenceSpan,
  extractor: 'model',
  promptVersion: 'golden-history-fixture-v1',
  outputSchemaVersion: 'memory-candidates-v1',
  status: 'completed',
  truthEffect: 'none',
  candidates: historicalCandidates,
  startedAt: at('2026-07-20T20:20:00+08:00'),
  completedAt: at('2026-07-20T20:20:01+08:00'),
});
const historicalReceipt = assertMemoryExtractionReceipt({
  schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
  id: createMemoryExtractionReceiptId(historicalRequestId),
  requestId: historicalRequestId,
  analysisRunId: historicalAnalysisRunId,
  passId: historicalPassId,
  scope,
  evidenceSpan: historicalEvidenceSpan,
  status: 'completed',
  truthEffect: 'none',
  candidateIds: historicalCandidates.map(candidate => candidate.id),
  rejectedCandidateCount: 0,
  extractor: 'model',
  modelId: 'golden-fixture-model',
  promptVersion: 'golden-history-fixture-v1',
  outputSchemaVersion: 'memory-candidates-v1',
  usage: {
    evidenceCount: historicalEvidence.length,
    inputCharCount: historicalEvidence.reduce((sum, record) => sum + record.content.length, 0),
    promptCharCount: 180,
    estimatedInputTokens: 60,
    estimatorId: 'unicode_chars_div_3_v1',
  },
  createdAt: at('2026-07-20T20:20:01+08:00'),
});
await memoryInterpretationStore.appendCompleted(historicalPass, historicalReceipt);

const promoteHistorical = async (candidate: MemoryCandidate) => {
  const base: Omit<MemoryPromotionCommand, 'id'> = {
    schemaVersion: MEMORY_INTERPRETATION_SCHEMA_VERSION,
    scope,
    candidateId: candidate.id,
    passId: candidate.passId,
    expectedSourceRevisionFingerprint: historicalPass.evidenceSpan.sourceRevisionFingerprint,
    trigger: 'manual',
    policyVersion: MEMORY_PROMOTION_POLICY_VERSION,
    manualDecision: {
      id: `golden-decision:${candidate.id}`,
      scope,
      candidateId: candidate.id,
      decision: 'remember_historical',
      confirmedAt: at('2026-07-20T20:21:00+08:00'),
    },
    requestedAt: at('2026-07-20T20:21:00+08:00'),
  };
  return memoryPromotionService.promote({ ...base, id: createMemoryPromotionCommandId(base) });
};
for (const candidate of historicalPass.candidates) {
  assert.equal((await promoteHistorical(candidate)).outcome, 'applied');
}

const liveModel: MemoryDMModelPort = {
  run: async ({ request }) => ({
    modelId: 'golden-fixture-model',
    text: JSON.stringify({
      candidates: [{
        target: 'relationship_memory',
        claimClass: 'conversation_fact',
        title: '今晚听雨',
        summary: '今晚的聊天与见面片段进入同一证据基座，仍保留各自表面来源。',
        knowledge: 'shared',
        temporalClass: 'live',
        sourceEvidenceIds: request.evidenceSpan.evidenceIds,
      }],
    }),
  }),
};
const livePass = await runMemoryDMPass({
  char: character,
  userProfile,
  relationshipScope: scope,
  apiConfig: { baseUrl: 'https://fixture.invalid', apiKey: 'fixture', model: 'golden-fixture' },
  trigger: 'manual',
  evidenceIds: liveEvidence.map(record => record.evidence.evidenceId),
  modelPort: liveModel,
  analysisRunId: 'golden-live-pass',
  now: at('2026-07-20T20:22:00+08:00'),
});
assert.equal(livePass.ran, true);

const beforeProjection = await listMemoryProjectionViews({ scope });
assert.equal(beforeProjection.views.length, 2);
const timebookView = beforeProjection.views.find(view => view.record.target === 'timebook')!;
assert.equal((await reviseMemoryProjectionView({
  view: timebookView,
  action: 'edit',
  patch: { summary: '玩家确认：纸星星是这一天最重要的纪念。' },
  requestedAt: at('2026-07-20T20:23:00+08:00'),
})).outcome, 'applied');

const rawHistoryBackup = await buildHistoryArchiveSystemBackupFiles({
  generatedAt: at('2026-07-20T20:30:00+08:00'),
  sourceDeviceId: 'golden-chain-device',
});
assert.ok(rawHistoryBackup);
const dailyDocuments = await listAllDailyArchiveDocuments();
const dailyBackup = await buildDailyArchiveBackupFiles({
  documents: dailyDocuments,
  generatedAt: at('2026-07-20T20:30:00+08:00'),
});
const fullBackup: FullBackupData = {
  timestamp: at('2026-07-20T20:30:00+08:00'),
  version: 5,
  ...(await DB.exportFullData()),
  historyArchiveManifest: rawHistoryBackup!.manifest,
  dailyArchiveManifest: dailyBackup.manifest,
  dailyArchiveMessageRevisions: await listAllDailyArchiveMessageRevisions(),
  conversationClippings: await listAllConversationClippings(),
};

const activeBeforeReset = await getActiveHistoryArchive();
assert.ok(activeBeforeReset);
await DB.deleteDB();
await deleteDailyArchiveDatabase();
const deleteIndexedDb = (name: string): Promise<void> => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error(`deleting ${name} was blocked`));
});
await deleteIndexedDb(activeBeforeReset!.activeDatabaseId);
await deleteIndexedDb(HISTORY_ARCHIVE_CONTROL_DB_NAME);
assert.equal(await getActiveHistoryArchive(), null);

const preparedRawHistory = await prepareHistoryArchiveSystemRestore({
  manifest: fullBackup.historyArchiveManifest!,
  files: rawHistoryBackup!.files,
});
const restoredDailyDocuments = await verifyDailyArchiveBackupFiles({
  manifest: fullBackup.dailyArchiveManifest!,
  files: dailyBackup.files,
});
await DB.importFullData(fullBackup);
await replaceDailyArchiveDocuments({
  documents: restoredDailyDocuments,
  revisions: fullBackup.dailyArchiveMessageRevisions || [],
});
await replaceConversationClippings({ clippings: fullBackup.conversationClippings || [] });
await activatePreparedHistoryArchiveSystemRestore({
  prepared: preparedRawHistory,
  activatedAt: at('2026-07-20T20:31:00+08:00'),
});

const rawAfterRestore = await pageActiveHistoryChatTimeline({ scope, limit: 20 });
assert.equal(rawAfterRestore.total, 2);
assert.equal(rawAfterRestore.items[0].content, '我们第一次在玻璃花房里听雨。');
const dayAfterRestore = await getDailyArchiveDocument({ scope, dateKey: '2024-05-01' });
assert.equal(dayAfterRestore?.dayConfirmation?.status, 'confirmed');
assert.equal(
  dayAfterRestore?.messages.find(message => message.id === importedUserLine.id)?.content,
  '我们第一次在玻璃花房外听雨。',
);
assert.ok((await listAllDailyArchiveMessageRevisions()).length > 0);
assert.equal((await DB.getMessagesByCharId(scope.charId)).length, 3);
assert.equal((await memoryInterpretationStore.listPasses(scope)).length, 2);
const afterProjection = await listMemoryProjectionViews({ scope });
assert.equal(afterProjection.views.length, 2);
assert.equal(
  afterProjection.views.find(view => view.record.target === 'timebook')?.display.summary,
  '玩家确认：纸星星是这一天最重要的纪念。',
);
assert.deepEqual(
  [...new Set((await dailyArchiveEvidenceReadPort.listActiveEvidence({ scope }))
    .map(record => record.evidence.source.surface))].sort(),
  ['chat', 'date', 'history_import'],
);

console.log('golden memory chain OK: import, correction, mixed evidence, interpretation, projection, backup and fresh restore');
