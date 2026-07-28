import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  buildHistoryCompanionAnalysisPackets,
  type HistoryCompanionAnalysisFinding,
} from '../domain/historyImport/companionMaterial/index.ts';
import type { HistoryScope } from '../domain/historyImport/types.ts';
import type { DailyArchiveMessage } from '../domain/dailyArchive/types.ts';
import { DAILY_ARCHIVE_SCHEMA_VERSION } from '../domain/dailyArchive/types.ts';
import {
  getDailyArchiveDocument,
  upsertDailyArchiveMessages,
} from '../utils/dailyArchive/storage.ts';
import { loadCompanionMaterialRecords } from '../utils/companionMaterial/store.ts';
import {
  loadHistoryCompanionAnalysisPreview,
  runHistoryCompanionAnalysis,
} from '../utils/historyImport/companionMaterial/runtimeAnalysis.ts';
import {
  loadHistoryCompanionMaterialActivationReceipt,
} from '../utils/historyImport/companionMaterial/sourceAuthority.ts';

const T0 = 1_785_300_000_000;
const apiConfig = {
  baseUrl: 'https://fixture.invalid/v1',
  apiKey: 'fixture-key',
  model: 'fixture-model',
};

const scopeFor = (suffix: string): HistoryScope => ({
  progressBundleId: `bundle-runtime-${suffix}`,
  personaMaskId: `mask-runtime-${suffix}`,
  charId: `char-runtime-${suffix}`,
});

const archiveMessage = (input: {
  scope: HistoryScope;
  id: string;
  dateKey: string;
  content: string;
  revision?: number;
}): DailyArchiveMessage => ({
  schemaVersion: DAILY_ARCHIVE_SCHEMA_VERSION,
  id: input.id,
  scope: { ...input.scope },
  source: 'history_import',
  sourceRecordId: input.id,
  sourceBatchId: `batch-${input.scope.charId}`,
  sourceOrder: 0,
  role: 'character',
  kind: 'text',
  content: input.content,
  time: {
    dateKey: input.dateKey,
    iso: `${input.dateKey}T10:00:00.000Z`,
    epochMs: Date.parse(`${input.dateKey}T10:00:00.000Z`),
    precision: 'exact',
  },
  status: 'active',
  recordedAt: T0,
  revision: input.revision ?? 1,
});

const seedTwoDays = async (scope: HistoryScope): Promise<void> => {
  await upsertDailyArchiveMessages({
    messages: [
      archiveMessage({
        scope,
        id: `${scope.charId}:day-1`,
        dateKey: '2026-07-18',
        content: '角色在结束一段工作后，会顺手整理刚刚使用过的工具，再开始谈别的事。',
      }),
      archiveMessage({
        scope,
        id: `${scope.charId}:day-2`,
        dateKey: '2026-07-20',
        content: '另一次聊天里，角色也先把手边物件归位，之后才自然换到新的话题。',
      }),
    ],
    now: T0,
  });
};

const responseFor = (content: unknown): Response => new Response(JSON.stringify({
  choices: [{
    message: {
      content: JSON.stringify(content),
    },
  }],
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const originalFetch = globalThis.fetch;

try {
  const successScope = scopeFor('success');
  await seedTwoDays(successScope);
  const successDocuments = (await Promise.all([
    getDailyArchiveDocument({ scope: successScope, dateKey: '2026-07-18' }),
    getDailyArchiveDocument({ scope: successScope, dateKey: '2026-07-20' }),
  ])).filter((document): document is NonNullable<typeof document> => Boolean(document));
  const packets = buildHistoryCompanionAnalysisPackets({
    scope: successScope,
    documents: successDocuments,
  });
  const characterEvidence = packets
    .flatMap(packet => packet.evidence)
    .filter(evidence => evidence.authorChannel === 'character');
  assert.equal(characterEvidence.length, 2);
  assert.equal(new Set(characterEvidence.map(evidence => evidence.sourceGroupId)).size, 2);

  const finding: HistoryCompanionAnalysisFinding = {
    id: 'runtime-stable-detail-1',
    lane: 'stable_detail',
    decision: 'accepted',
    evidenceIds: characterEvidence.map(evidence => evidence.id),
    confidence: 0.86,
    guidance: '在确实聊到收尾习惯或工作物件时，可参考角色倾向先整理手边工具再转入新话题；不要主动重复提起。',
    tags: ['stable_habit'],
    groundingClass: 'live_semantic_anchor',
    speakerResolution: 'primary_character_direct',
    behaviorBoundary: {
      variationPreserved: true,
      fixedReplyTemplate: false,
      currentStateEffect: 'none',
      toolPolicyEffect: 'none',
    },
    reviewReason: '两个不同日期的角色通道都支持同一个长期习惯，而且不依赖一次事件。',
    uncertaintyOrConflict: '只在相关语境按需取用，不代表角色此刻正在工作或整理物件。',
  };
  let successCalls = 0;
  globalThis.fetch = (async (_url, init) => {
    successCalls += 1;
    const body = JSON.parse(String(init?.body || '{}')) as {
      messages?: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages?.find(message => message.role === 'system')?.content || '';
    if (systemPrompt.includes('同一个模型执行第二遍证据核对')) {
      return responseFor({
        findings: [{
          findingId: finding.id,
          decision: 'approved',
          evidenceSpeakerAttributions: finding.evidenceIds.map(evidenceId => ({
            evidenceId,
            speakerResolution: 'primary_character_direct',
            reason: '证据属于角色直接表达，未混入玩家或多人共创台词。',
          })),
          reason: '跨日期重复支持同一稳定细节，且不会建立当前状态。',
        }],
      });
    }
    return responseFor({ findings: [finding] });
  }) as typeof fetch;

  const allPreview = await loadHistoryCompanionAnalysisPreview({
    scope: successScope,
    range: { kind: 'all' },
  });
  assert.equal(allPreview.executable, true);
  assert.equal(allPreview.documentCount, 2);
  assert.equal(allPreview.messageCount, 2);
  assert.equal(allPreview.estimatedCalls, 2);
  const rangePreview = await loadHistoryCompanionAnalysisPreview({
    scope: successScope,
    range: {
      kind: 'date_range',
      startDateKey: '2026-07-20',
      endDateKey: '2026-07-20',
    },
  });
  assert.equal(rangePreview.documentCount, 1, 'human-selected ranges work across real daily documents');

  const success = await runHistoryCompanionAnalysis({
    scope: successScope,
    range: { kind: 'all' },
    apiConfig,
  });
  assert.equal(success.status, 'published');
  assert.equal(successCalls, 2, 'successful publication requires analysis plus a same-model second pass');
  assert.equal(success.approvedMaterialCount, 1);
  const activation = await loadHistoryCompanionMaterialActivationReceipt({
    receiptId: success.activationReceiptId!,
  });
  assert.ok(activation);
  assert.equal(activation.adjudicationAuthority, 'same_model_second_pass');
  assert.notEqual(
    activation.analyzerPrincipal.principalId,
    activation.adjudicatorPrincipal.principalId,
  );
  assert.match(activation.analyzerPrincipal.principalId, /:analyzer:/);
  assert.match(activation.adjudicatorPrincipal.principalId, /:adjudicator:/);
  assert.equal(activation.analyzerPrincipal.provider, activation.adjudicatorPrincipal.provider);
  assert.equal(activation.analyzerPrincipal.modelOrActor, activation.adjudicatorPrincipal.modelOrActor);
  assert.equal(
    activation.analyzerPrincipal.principalId.includes(apiConfig.apiKey),
    false,
    'captured runtime principals never contain credentials',
  );
  assert.equal((await loadCompanionMaterialRecords(successScope)).length, 1);

  await upsertDailyArchiveMessages({
    messages: [archiveMessage({
      scope: successScope,
      id: `${successScope.charId}:day-1`,
      dateKey: '2026-07-18',
      content: '玩家校正后，这一天的角色原文发生了变化。',
      revision: 2,
    })],
    now: T0 + 100,
  });
  assert.equal(
    (await loadCompanionMaterialRecords(successScope)).length,
    0,
    'published history material fails closed as soon as a source document changes',
  );

  const emptyScope = scopeFor('empty');
  await seedTwoDays(emptyScope);
  let emptyCalls = 0;
  globalThis.fetch = (async () => {
    emptyCalls += 1;
    return responseFor({ findings: [] });
  }) as typeof fetch;
  const empty = await runHistoryCompanionAnalysis({
    scope: emptyScope,
    range: { kind: 'all' },
    apiConfig,
  });
  assert.equal(empty.status, 'no_reliable_material');
  assert.equal(emptyCalls, 1, 'an empty first review does not spend an adjudication call');
  assert.equal((await loadCompanionMaterialRecords(emptyScope)).length, 0);

  const budgetScope = scopeFor('second-pass-budget');
  await seedTwoDays(budgetScope);
  const budgetDocuments = (await Promise.all([
    getDailyArchiveDocument({ scope: budgetScope, dateKey: '2026-07-18' }),
    getDailyArchiveDocument({ scope: budgetScope, dateKey: '2026-07-20' }),
  ])).filter((document): document is NonNullable<typeof document> => Boolean(document));
  const budgetEvidence = buildHistoryCompanionAnalysisPackets({
    scope: budgetScope,
    documents: budgetDocuments,
  }).flatMap(packet => packet.evidence);
  const budgetFinding: HistoryCompanionAnalysisFinding = {
    ...finding,
    id: 'runtime-budget-withheld',
    evidenceIds: budgetEvidence.map(evidence => evidence.id),
  };
  let budgetCalls = 0;
  globalThis.fetch = (async () => {
    budgetCalls += 1;
    return responseFor({ findings: [budgetFinding] });
  }) as typeof fetch;
  const budgetResult = await runHistoryCompanionAnalysis({
    scope: budgetScope,
    range: { kind: 'all' },
    apiConfig,
    maxSecondPassPromptChars: 1,
  });
  assert.equal(budgetResult.status, 'no_reliable_material');
  assert.equal(budgetResult.budgetWithheldFindingCount, 1);
  assert.equal(
    budgetCalls,
    1,
    'findings that cannot fit the second-pass evidence budget are withheld before another API call',
  );
  assert.equal((await loadCompanionMaterialRecords(budgetScope)).length, 0);

  const boundedScope = scopeFor('bounded-runtime');
  await upsertDailyArchiveMessages({
    messages: Array.from({ length: 10 }, (_, index) => (
      archiveMessage({
        scope: boundedScope,
        id: `${boundedScope.charId}:long-${index}`,
        dateKey: `2026-07-${String(index + 1).padStart(2, '0')}`,
        content: `第${index + 1}天角色先整理桌面再聊近况。`.repeat(220),
      })
    )),
    now: T0,
  });
  const boundedPreview = await loadHistoryCompanionAnalysisPreview({
    scope: boundedScope,
    range: { kind: 'all' },
  });
  assert.equal(boundedPreview.executable, true);
  assert.ok(boundedPreview.batchCount > 1, 'large runtime input uses the bounded batch path');
  let boundedCalls = 0;
  globalThis.fetch = (async () => {
    boundedCalls += 1;
    return responseFor({ findings: [] });
  }) as typeof fetch;
  const bounded = await runHistoryCompanionAnalysis({
    scope: boundedScope,
    range: { kind: 'all' },
    apiConfig,
  });
  assert.equal(bounded.status, 'no_reliable_material');
  assert.equal(
    boundedCalls,
    boundedPreview.batchCount + 1,
    'bounded runtime calls every batch plus one synthesis and skips second pass for empty findings',
  );

  const noApiScope = scopeFor('missing-api');
  await seedTwoDays(noApiScope);
  let noApiCalls = 0;
  globalThis.fetch = (async () => {
    noApiCalls += 1;
    return responseFor({ findings: [] });
  }) as typeof fetch;
  await assert.rejects(
    () => runHistoryCompanionAnalysis({
      scope: noApiScope,
      range: { kind: 'all' },
      apiConfig: { ...apiConfig, baseUrl: '', model: '' },
    }),
    /启用一个可用的 API 配置/,
  );
  assert.equal(noApiCalls, 0, 'missing API configuration fails before external fetch');

  const failureScope = scopeFor('failure');
  await seedTwoDays(failureScope);
  globalThis.fetch = (async () => responseFor({ wrongShape: true })) as typeof fetch;
  await assert.rejects(
    () => runHistoryCompanionAnalysis({
      scope: failureScope,
      range: { kind: 'all' },
      apiConfig,
    }),
    /findings/,
  );
  assert.equal(
    (await loadCompanionMaterialRecords(failureScope)).length,
    0,
    'an API contract failure never exposes partial prompt material',
  );

  const malformedSecondPassScope = scopeFor('malformed-second-pass');
  await seedTwoDays(malformedSecondPassScope);
  const malformedSecondPassDocuments = (await Promise.all([
    getDailyArchiveDocument({ scope: malformedSecondPassScope, dateKey: '2026-07-18' }),
    getDailyArchiveDocument({ scope: malformedSecondPassScope, dateKey: '2026-07-20' }),
  ])).filter((document): document is NonNullable<typeof document> => Boolean(document));
  const malformedSecondPassEvidence = buildHistoryCompanionAnalysisPackets({
    scope: malformedSecondPassScope,
    documents: malformedSecondPassDocuments,
  }).flatMap(packet => packet.evidence);
  const malformedSecondPassFinding: HistoryCompanionAnalysisFinding = {
    ...finding,
    id: 'runtime-malformed-second-pass',
    evidenceIds: malformedSecondPassEvidence.map(evidence => evidence.id),
  };
  let malformedSecondPassCalls = 0;
  globalThis.fetch = (async () => {
    malformedSecondPassCalls += 1;
    return responseFor(
      malformedSecondPassCalls === 1
        ? { findings: [malformedSecondPassFinding] }
        : { wrongShape: true },
    );
  }) as typeof fetch;
  await assert.rejects(
    () => runHistoryCompanionAnalysis({
      scope: malformedSecondPassScope,
      range: { kind: 'all' },
      apiConfig,
    }),
    /第二遍复核返回缺少 findings/,
  );
  assert.equal(malformedSecondPassCalls, 2);
  assert.equal((await loadCompanionMaterialRecords(malformedSecondPassScope)).length, 0);

  const rejectedScope = scopeFor('rejected-second-pass');
  await seedTwoDays(rejectedScope);
  const rejectedDocuments = (await Promise.all([
    getDailyArchiveDocument({ scope: rejectedScope, dateKey: '2026-07-18' }),
    getDailyArchiveDocument({ scope: rejectedScope, dateKey: '2026-07-20' }),
  ])).filter((document): document is NonNullable<typeof document> => Boolean(document));
  const rejectedEvidence = buildHistoryCompanionAnalysisPackets({
    scope: rejectedScope,
    documents: rejectedDocuments,
  }).flatMap(packet => packet.evidence);
  const rejectedFinding: HistoryCompanionAnalysisFinding = {
    ...finding,
    id: 'runtime-rejected-second-pass',
    evidenceIds: rejectedEvidence.map(evidence => evidence.id),
  };
  let rejectedCalls = 0;
  globalThis.fetch = (async () => {
    rejectedCalls += 1;
    if (rejectedCalls === 1) return responseFor({ findings: [rejectedFinding] });
    return responseFor({
      findings: [{
        findingId: rejectedFinding.id,
        decision: 'rejected',
        evidenceSpeakerAttributions: rejectedFinding.evidenceIds.map(evidenceId => ({
          evidenceId,
          speakerResolution: 'primary_character_direct',
          reason: '句内角色归属可确认。',
        })),
        reason: '两条证据仍不足以支持可复用的稳定结论。',
      }],
    });
  }) as typeof fetch;
  const rejected = await runHistoryCompanionAnalysis({
    scope: rejectedScope,
    range: { kind: 'all' },
    apiConfig,
  });
  assert.equal(rejected.status, 'no_reliable_material');
  assert.equal(rejectedCalls, 2);
  assert.equal((await loadCompanionMaterialRecords(rejectedScope)).length, 0);

  const cancelledScope = scopeFor('cancelled');
  await seedTwoDays(cancelledScope);
  const cancelledDocuments = (await Promise.all([
    getDailyArchiveDocument({ scope: cancelledScope, dateKey: '2026-07-18' }),
    getDailyArchiveDocument({ scope: cancelledScope, dateKey: '2026-07-20' }),
  ])).filter((document): document is NonNullable<typeof document> => Boolean(document));
  const cancelledEvidence = buildHistoryCompanionAnalysisPackets({
    scope: cancelledScope,
    documents: cancelledDocuments,
  }).flatMap(packet => packet.evidence);
  const cancelledFinding: HistoryCompanionAnalysisFinding = {
    ...finding,
    id: 'runtime-cancelled-detail',
    evidenceIds: cancelledEvidence.map(evidence => evidence.id),
  };
  const controller = new AbortController();
  globalThis.fetch = (async () => {
    controller.abort(new DOMException('cancelled by fixture', 'AbortError'));
    return responseFor({ findings: [cancelledFinding] });
  }) as typeof fetch;
  await assert.rejects(
    () => runHistoryCompanionAnalysis({
      scope: cancelledScope,
      range: { kind: 'all' },
      apiConfig,
      signal: controller.signal,
    }),
    /cancelled by fixture/,
  );
  assert.equal(
    (await loadCompanionMaterialRecords(cancelledScope)).length,
    0,
    'cancellation before publication never exposes prompt material',
  );

  const publishingAbortScope = scopeFor('publishing-abort');
  await seedTwoDays(publishingAbortScope);
  const publishingAbortDocuments = (await Promise.all([
    getDailyArchiveDocument({ scope: publishingAbortScope, dateKey: '2026-07-18' }),
    getDailyArchiveDocument({ scope: publishingAbortScope, dateKey: '2026-07-20' }),
  ])).filter((document): document is NonNullable<typeof document> => Boolean(document));
  const publishingAbortEvidence = buildHistoryCompanionAnalysisPackets({
    scope: publishingAbortScope,
    documents: publishingAbortDocuments,
  }).flatMap(packet => packet.evidence);
  const publishingAbortFinding: HistoryCompanionAnalysisFinding = {
    ...finding,
    id: 'runtime-publishing-abort-detail',
    evidenceIds: publishingAbortEvidence.map(evidence => evidence.id),
  };
  let publishingAbortCalls = 0;
  globalThis.fetch = (async () => {
    publishingAbortCalls += 1;
    if (publishingAbortCalls === 1) {
      return responseFor({ findings: [publishingAbortFinding] });
    }
    return responseFor({
      findings: [{
        findingId: publishingAbortFinding.id,
        decision: 'approved',
        evidenceSpeakerAttributions: publishingAbortFinding.evidenceIds.map(evidenceId => ({
          evidenceId,
          speakerResolution: 'primary_character_direct',
          reason: '证据属于角色直接表达。',
        })),
        reason: '跨日期证据足够支持这一低风险稳定细节。',
      }],
    });
  }) as typeof fetch;
  const publishingAbortController = new AbortController();
  const publishingAbortResult = await runHistoryCompanionAnalysis({
    scope: publishingAbortScope,
    range: { kind: 'all' },
    apiConfig,
    signal: publishingAbortController.signal,
    onProgress: progress => {
      if (progress.stage === 'publishing') {
        publishingAbortController.abort(new DOMException('sheet closed during publishing', 'AbortError'));
      }
    },
  });
  assert.equal(publishingAbortResult.status, 'published');
  assert.equal(publishingAbortCalls, 2);
  assert.equal(
    (await loadCompanionMaterialRecords(publishingAbortScope)).length,
    1,
    'once publishing begins, later aborts cannot leave a half-written run',
  );
  assert.ok(
    await loadHistoryCompanionMaterialActivationReceipt({
      receiptId: publishingAbortResult.activationReceiptId!,
    }),
    'publishing completion keeps the canonical activation receipt with its prompt projection',
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('history companion browser runtime analysis OK');
