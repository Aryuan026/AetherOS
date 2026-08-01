import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES,
  BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL,
} from '../domain/companionMaterial/builtInDeepspaceIdleOpeners.ts';
import { assertValidCompanionMaterialRecord } from '../domain/companionMaterial/contract.ts';
import { createCompanionMaterialDeliveryReceipt } from '../domain/companionMaterial/deliveryReceipt.ts';
import { selectCompanionMaterialFromRecords } from '../domain/companionMaterial/selection.ts';
import { COMPANION_MATERIAL_SCHEMA_VERSION } from '../domain/companionMaterial/types.ts';
import type { CharacterProfile, CompanionWakeupRule, UserProfile } from '../types.ts';
import {
  prepareCompanionMaterialPrompt,
  recordPreparedCompanionMaterialPromptDelivery,
} from '../utils/companionMaterial/promptConsumer.ts';
import { buildWakeupCompanionMaterialRequest } from '../utils/companionMaterial/requestBuilders.ts';
import { loadCompanionMaterialRecords } from '../utils/companionMaterial/store.ts';
import {
  loadCharacterDirectWakeupCore,
  loadCharacterVoiceCore,
  pickVoiceDirectWakeupCandidateFromCore,
} from '../utils/memoryCore/voiceCore.ts';
import type { CharacterVoiceCore } from '../utils/memoryCore/types.ts';

const T0 = 1_800_000_000_000;
const expected = {
  'builtin-daily-companion': { direct: 4, rewrite: 26 },
  'builtin-zayne': { direct: 4, rewrite: 33 },
  'builtin-sylus': { direct: 3, rewrite: 18 },
  'builtin-xavier': { direct: 4, rewrite: 35 },
  'builtin-caleb': { direct: 3, rewrite: 28 },
} as const;
const forbidden = /(https?:\/\/|\/Users\/|lysk-src-|sourceDispositions|sourceTitle|sourceUrl|localPath|PRIVATE EVIDENCE|private_review|角色：|对方：|用户：|选项：|\b(?:user|assistant|char)\s*:)/i;
const directReviewLeak = /(?:静置.{0,6}(?:六|6)小时|中文开场|单独发出|无需逐字|逐字翻译|非实时决策|测试结果|审读|候选|来源|模型生成|工具调用|调用工具|运行时|编译|API|接口|private[_ -]?(?:raw|dialogue|review)|non[- ]?verbatim)/i;
const rewritePlaceholder = /(?:private[_ -]?(?:raw|dialogue|review)|short\s+non[- ]?verbatim|semantic[_ -]?cluster|私有短信单页审读|短非(?:语句|verbatim)|仅\s*rewrite(?:_to_direct)?|无当前事实的改写方向|工具调用|调用工具|运行时|编译|API|接口)/i;
const productPromptLeak = /(?:\d+\s*(?:到|[-—~～])\s*\d+\s*字|字的消息|原创具体互动意图|^(?:直接|直发|改写|重写)\s*[：:])/i;
const directSystemAction = /(?:尝试联系(?:朋友|对方|用户)|确认(?:信息|情况)(?:是否|有无)|向(?:朋友|对方|用户)发起|系统(?:发送|生成|提醒))/i;
const inventedCurrentFact = /(?:下周末有|在(?:拍卖会|会场|现场|医院|画室|公司)(?:现场)?|你最近是不是(?:在|有)|你最近在|刚刚(?:结束|完成|到达)|昨晚(?:发生|去了|做了))/i;
const rewriteFirstPersonFact = /(?:^|[，。；：:])\s*我(?:正在|刚刚|已经|会在|下周|今天|昨晚|最近)/;
const rewriteUserDirective = /(?:让|要求|催促|命令)用户(?:去|做|回答|回复|选择|确认)/;
const genericRewriteWrapper = /^从「[^」]+」出发，?轻松地抛出一个可接可停的小互动/;
const unresolvedProductPlaceholder = /(?:自然完整中文消息|具体创作方向\s*[：:]?)/i;
const truncatedRewrite = /(?:和你|以及你|关于你|比如你|顺便你)$/;
const rewriteAssumedFact = /(?:你(?:发现|注意到|最近(?:参与|尝试|买|做|去了|开始)|给自己|给新创造的)|我们共同经历|丢失的.{0,18}找到了|分享那只.{0,12}的新生活)/;
const rewriteLooksLikeUserFacingLine = /^(?:你|我|我们|下次|回去|带上你的|找个时间|试试|提前准备|在家躺着时|挑选几个|给魔镜|去临空市)/;
const genericGuidanceStyleShell = /(?:^轻柔分享\s*[：:]|轻松互动|抛出一个可接可停的小互动|多聊聊这些.{0,32}比如你最近喜欢哪种|用户|玩家)/;
const rewriteSecondPersonPromptObject = /(?:想听你|聊聊你|分享一下你的|回忆一下.{0,24}你的)/;
const rewriteLooksLikeDialogue = /[？！?!“”‘’"']/;
const exactPlaceholder = /^(?:无|rewrite|other|其他|unknown|n\/?a)$/i;
const allowedOpenerClasses = new Set([
  'light_question',
  'small_choice',
  'low_pressure_share',
  'playful_prompt',
  'gentle_care',
  'reentry',
  'other',
]);

assert.equal(BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES.length, 18);
assert.equal(BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL.length, 140);
assert.equal(new Set(BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES.map(item => item.id)).size, 18);
assert.equal(new Set(BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL.map(item => item.id)).size, 140);

for (const [charId, counts] of Object.entries(expected)) {
  const direct = BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES.filter(item => item.charId === charId);
  const rewrite = BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL.filter(item => item.charId === charId);
  assert.equal(direct.length, counts.direct, `${charId} direct count`);
  assert.equal(rewrite.length, counts.rewrite, `${charId} rewrite count`);

  direct.forEach(item => {
    assert.ok(item.text.length > 0 && item.text.length <= 56);
    assert.equal(item.maxDeliveries, 1);
    assert.ok(item.cooldownMs >= 60 * 24 * 60 * 60 * 1000);
    assert.equal(forbidden.test(JSON.stringify(item)), false);
    assert.equal(directReviewLeak.test(item.text), false, `${item.id} leaked review prose`);
    assert.equal(productPromptLeak.test(item.text), false, `${item.id} leaked productization instructions`);
    assert.equal(unresolvedProductPlaceholder.test(item.text), false, `${item.id} contains an unresolved placeholder`);
    assert.equal(directSystemAction.test(item.text), false, `${item.id} contains a system action`);
    assert.equal(inventedCurrentFact.test(item.text), false, `${item.id} invents a current fact`);
    assert.equal(directReviewLeak.test(item.semanticCluster), false, `${item.id} has review prose tags`);
    assert.equal(rewritePlaceholder.test(item.semanticCluster), false, `${item.id} has placeholder tags`);
    assert.equal(exactPlaceholder.test(item.semanticCluster), false, `${item.id} has empty tags`);
  });
  rewrite.forEach(item => {
    assertValidCompanionMaterialRecord(item);
    assert.equal(item.kind, 'proactive_seed');
    assert.equal(item.slot, 'proactive_seeds');
    assert.deepEqual(item.eligibleModes, ['proactive_letter']);
    assert.deepEqual(item.eligiblePurposes, ['proactive_intent']);
    assert.ok((item.cooldownMs || 0) >= 120 * 24 * 60 * 60 * 1000);
    assert.equal(forbidden.test(JSON.stringify(item)), false);
    assert.equal(
      (item.tags || []).some(tag => directReviewLeak.test(tag)),
      false,
      `${item.id} has review prose tags`,
    );
    assert.equal(rewritePlaceholder.test(item.guidance), false, `${item.id} has placeholder guidance`);
    assert.equal(exactPlaceholder.test(item.guidance), false, `${item.id} has empty guidance`);
    assert.equal(productPromptLeak.test(item.guidance), false, `${item.id} leaked productization instructions`);
    assert.equal(unresolvedProductPlaceholder.test(item.guidance), false, `${item.id} contains an unresolved placeholder`);
    assert.equal(inventedCurrentFact.test(item.guidance), false, `${item.id} invents a current fact`);
    assert.equal(rewriteFirstPersonFact.test(item.guidance), false, `${item.id} prewrites a first-person fact`);
    assert.equal(rewriteUserDirective.test(item.guidance), false, `${item.id} directs the user`);
    assert.equal(genericRewriteWrapper.test(item.guidance), false, `${item.id} uses the generic rewrite shell`);
    assert.equal(truncatedRewrite.test(item.guidance), false, `${item.id} has a truncated rewrite brief`);
    assert.equal(rewriteAssumedFact.test(item.guidance), false, `${item.id} assumes an ungrounded fact`);
    assert.equal(rewriteLooksLikeUserFacingLine.test(item.guidance), false, `${item.id} is a user-facing line instead of guidance`);
    assert.equal(genericGuidanceStyleShell.test(item.guidance), false, `${item.id} uses a flattening guidance shell`);
    assert.equal(rewriteSecondPersonPromptObject.test(item.guidance), false, `${item.id} treats the player as a prompt object`);
    assert.equal(rewriteLooksLikeDialogue.test(item.guidance), false, `${item.id} prewrites dialogue instead of guidance`);
    assert.equal(
      (item.tags || []).some(tag => (
        rewritePlaceholder.test(tag)
        || (!allowedOpenerClasses.has(tag) && exactPlaceholder.test(tag))
      )),
      false,
      `${item.id} has placeholder tags`,
    );
  });

  const promptCore = await loadCharacterVoiceCore(charId);
  assert.equal(
    promptCore?.lines.some(item => item.id.startsWith('lysk-idle-')) || false,
    false,
    `${charId} direct warehouse must not become repeated render-prompt examples`,
  );
  const runtimeCore = await loadCharacterDirectWakeupCore(charId);
  assert.equal(
    runtimeCore?.lines.filter(item => item.kind === 'direct_message').length,
    counts.direct,
    `${charId} direct library must reach the voice-core runtime loader`,
  );
  const runtimeMaterial = await loadCompanionMaterialRecords({
    progressBundleId: 'idle-pack',
    personaMaskId: 'mask-a',
    charId,
  });
  const runtimeIds = new Set(runtimeMaterial.map(item => item.id));
  assert.equal(
    rewrite.every(item => runtimeIds.has(item.id)),
    true,
    `${charId} rewrite library must reach the companion-material runtime loader`,
  );
  const runtimeScope = { progressBundleId: 'idle-runtime', personaMaskId: 'mask-runtime', charId };
  const disabledPrepared = await prepareCompanionMaterialPrompt(
    buildWakeupCompanionMaterialRequest({
      requestId: `idle-runtime-disabled-${charId}`,
      scope: runtimeScope,
      ruleRefId: `idle-runtime-rule-disabled-${charId}`,
      query: '自然惦念 自由主动来信',
      occurredAt: T0 - 1,
      carePriority: false,
      ruleKind: 'heartbeat',
      hiddenWordsEnabled: false,
    }),
  );
  assert.equal(
    disabledPrepared.selection.selectedMaterialIds.some(id => rewrite.some(item => item.id === id)),
    false,
    `${charId} rewrite warehouse must respect the hidden-words switch`,
  );
  const firstPrepared = await prepareCompanionMaterialPrompt(
    buildWakeupCompanionMaterialRequest({
      requestId: `idle-runtime-first-${charId}`,
      scope: runtimeScope,
      ruleRefId: `idle-runtime-rule-first-${charId}`,
      query: '自然惦念 自由主动来信',
      occurredAt: T0,
      carePriority: false,
      ruleKind: 'heartbeat',
      hiddenWordsEnabled: true,
    }),
  );
  assert.ok(firstPrepared.projection.fragments.length > 0);
  await recordPreparedCompanionMaterialPromptDelivery({
    prepared: firstPrepared,
    consumerRef: { kind: 'prompt', id: `idle-runtime-first-${charId}`, revision: 'idle-opener-v1' },
    occurredAt: T0,
  });
  let secondPrepared: Awaited<ReturnType<typeof prepareCompanionMaterialPrompt>> | null = null;
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    const prepared = await prepareCompanionMaterialPrompt(
      buildWakeupCompanionMaterialRequest({
        requestId: `idle-runtime-rotate-${attempt}-${charId}`,
        scope: runtimeScope,
        ruleRefId: `idle-runtime-rule-rotate-${attempt}-${charId}`,
        query: '自然惦念 自由主动来信',
        occurredAt: T0 + attempt,
        carePriority: false,
        ruleKind: 'heartbeat',
        hiddenWordsEnabled: true,
      }),
    );
    if (prepared.selection.selectedMaterialIds.some(id => rewrite.some(item => item.id === id))) {
      secondPrepared = prepared;
      break;
    }
    if (prepared.projection.fragments.length) {
      await recordPreparedCompanionMaterialPromptDelivery({
        prepared,
        consumerRef: {
          kind: 'prompt',
          id: `idle-runtime-rotate-${attempt}-${charId}`,
          revision: 'idle-opener-v1',
        },
        occurredAt: T0 + attempt,
      });
    }
  }
  assert.equal(
    secondPrepared?.selection.selectedMaterialIds.some(id => rewrite.some(item => item.id === id)) || false,
    true,
    `${charId} rewrite seed must reach the real proactive prompt path during receipt rotation`,
  );
  assert.ok(secondPrepared);
  assert.equal(
    direct.some(item => secondPrepared!.markdown.includes(item.text)),
    false,
    `${charId} direct warehouse text must never leak into the model prompt`,
  );
  assert.equal(
    secondPrepared!.projection.fragments
      .filter(fragment => rewrite.some(item => item.id === fragment.materialId))
      .every(fragment => fragment.kind === 'proactive_seed' && fragment.slot === 'proactive_seeds'),
    true,
    `${charId} reviewed rewrite guidance must keep its proactive-only typed slot`,
  );

  const core: CharacterVoiceCore = {
    charId,
    lines: direct.map(item => ({
      id: item.id,
      charId,
      kind: 'direct_message',
      text: item.text,
      tags: [item.openerClass, item.semanticCluster],
      source: 'built_in',
      cooldownMs: item.cooldownMs,
      maxDeliveries: item.maxDeliveries,
      createdAt: T0,
      updatedAt: T0,
    })),
  };
  const char = { id: charId, name: charId } as CharacterProfile;
  const user = { name: 'User' } as UserProfile;
  const rule = {
    id: `wakeup-${charId}`,
    charId,
    title: '自然惦念',
    value: '自由主动来信',
  } as CompanionWakeupRule;
  const history = new Map<string, number[]>();
  const seen = new Set<string>();
  for (let index = 0; index < direct.length; index += 1) {
    const picked = pickVoiceDirectWakeupCandidateFromCore(
      core,
      rule,
      char,
      user,
      T0 + index,
      new Set(),
      history,
    );
    assert.ok(picked, `${charId} should still have an unused direct line`);
    assert.equal(seen.has(picked!.line.id), false, `${charId} direct line repeated`);
    seen.add(picked!.line.id);
    history.set(picked!.line.id, [T0 + index]);
  }
  assert.equal(
    pickVoiceDirectWakeupCandidateFromCore(core, rule, char, user, T0 + direct.length, new Set(), history),
    null,
    `${charId} must fail closed after every one-shot line is used`,
  );

  const scope = { progressBundleId: 'idle-pack', personaMaskId: 'mask-a', charId };
  const request = {
    schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
    requestId: `idle-rewrite-${charId}`,
    scope,
    surface: 'proactive_letter' as const,
    mode: 'proactive_letter' as const,
    purpose: 'proactive_intent' as const,
    semanticTags: ['proactive_intent', 'opening'],
    groundingRefs: [{
      kind: 'wakeup_rule' as const,
      claimKey: 'proactive_intent',
      refId: `wakeup-rule-${charId}`,
      revision: 1,
      scope,
      occurredAt: T0,
      validUntil: T0 + 60_000,
    }, {
      kind: 'wakeup_rule' as const,
      claimKey: 'hidden_words_enabled',
      refId: `wakeup-rule-${charId}:hidden-words`,
      revision: 1,
      scope,
      occurredAt: T0,
      validUntil: T0 + 60_000,
    }],
    relationshipStage: 'unknown' as const,
    budgetChars: 600,
    maxItems: 2,
    now: T0,
  };
  const first = selectCompanionMaterialFromRecords({ request, records: rewrite });
  assert.ok(first.items.length > 0, `${charId} rewrite seed must reach proactive selection`);
  const receipt = createCompanionMaterialDeliveryReceipt({
    selection: first,
    consumerRef: { kind: 'prompt', id: `wakeup-${charId}`, revision: 'idle-opener-v1' },
    delivered: first.items.map(item => ({
      materialId: item.materialId,
      promptCharCount: item.guidance.length,
    })),
    occurredAt: T0,
  });
  const second = selectCompanionMaterialFromRecords({
    request: { ...request, requestId: `${request.requestId}-2`, now: T0 + 1 },
    records: rewrite,
    receipts: [receipt],
  });
  assert.equal(
    second.selectedMaterialIds.some(id => first.selectedMaterialIds.includes(id)),
    false,
    `${charId} rewrite seeds must rotate during cooldown`,
  );
}

console.log(JSON.stringify({
  status: 'pass',
  sourceReviewCount: 909,
  runtime: {
    directMessage: BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES.length,
    rewriteSeed: BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL.length,
  },
  privateEvidenceIncluded: false,
}, null, 2));
