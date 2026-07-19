import { assertEvidenceScope, assertEvidenceSpan, sameEvidenceScope } from '../interactionEvidence/contract.ts';
import {
    MEMORY_INTERPRETATION_SCHEMA_VERSION,
    type MemoryCandidate,
    type MemoryDMExtractionReceipt,
    type MemoryDMExtractionRequest,
    type MemoryExtractionClaim,
    type MemoryInterpretationPass,
    type MemoryPromotionCommand,
    type MemoryPromotionExperienceRef,
    type MemoryPromotionManualDecision,
    type MemoryPromotionReceipt,
    type MemoryPromotionSourceAssessment,
    type PromotedMemoryRecord,
} from './types.ts';

const requiredString = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空。`);
    return value.trim();
};

const scopeToken = (scope: ReturnType<typeof assertEvidenceScope>): string => [
    scope.progressBundleId,
    scope.personaMaskId,
    scope.charId,
].map(encodeURIComponent).join('::');

const EXTRACTION_TRIGGERS = new Set(['auto', 'idle', 'manual']);
const EXTRACTORS = new Set(['model', 'deterministic_heuristic']);
const CANDIDATE_TARGETS = new Set([
    'relationship_memory', 'timebook', 'scheduler_proposal',
    'narrative_proposal', 'character_life_proposal', 'discard',
]);
const CANDIDATE_KNOWLEDGE = new Set([
    'character_private', 'user_private', 'relationship_private', 'shared',
    'public_safe', 'unknown_to_char', 'unknown_to_user',
]);
const TEMPORAL_CLASSES = new Set(['historical', 'live', 'mixed']);
const CANDIDATE_AUTHORITIES = new Set(['model_interpretation', 'deterministic_heuristic']);
const CANDIDATE_STATUSES = new Set(['proposed', 'discarded']);
const CANDIDATE_CLAIM_CLASSES = new Set([
    'conversation_fact', 'shared_experience', 'world_state_change', 'relationship_stage_change',
]);
const RECEIPT_STATUSES = new Set(['completed', 'failed', 'rejected']);
const CLAIM_STATUSES = new Set(['pending', 'completed', 'failed']);
const PROMOTION_TRIGGERS = new Set(['manual', 'automatic_policy']);
const PROMOTION_MANUAL_DECISIONS = new Set([
    'remember_historical', 'remember_relationship', 'confirm_played_experience',
]);
const PROMOTION_RECEIPT_STATUSES = new Set(['applied', 'rejected', 'stale', 'duplicate']);
const PROMOTION_TRUTH_EFFECTS = new Set(['none', 'relationship_memory', 'timebook']);
const PROMOTION_SOURCE_CLASSES = new Set([
    'historical_material',
    'embodied_interaction',
    'user_remote_statement',
    'two_party_remote_exchange',
    'model_or_system_generated',
    'manual_material',
    'unclassified',
]);
const INTERACTION_SURFACES = new Set([
    'history_import', 'chat', 'date', 'call', 'social', 'group_chat', 'journal', 'proactive', 'other',
]);
const INTERACTION_MEDIA = new Set([
    'remote_text', 'mixed_text', 'embodied_scene', 'voice_call', 'social', 'diary', 'other',
]);
const INTERACTION_PRODUCERS = new Set(['user', 'model', 'system', 'import', 'manual']);
const INTERACTION_TRANSPORT_ROLES = new Set([
    'user_channel', 'assistant_channel', 'system_channel', 'unknown',
]);
export const MEMORY_PROMOTION_POLICY_VERSION = 'memory-promotion-policy-v1' as const;

export const createMemoryExtractionRequestId = (input: {
    scope: ReturnType<typeof assertEvidenceScope>;
    analysisRunId: string;
}): string => `memory-extraction:v1:${scopeToken(assertEvidenceScope(input.scope))}:${encodeURIComponent(requiredString(input.analysisRunId, 'analysisRunId'))}`;

export const createMemoryInterpretationPassId = (
    request: Pick<MemoryDMExtractionRequest, 'scope' | 'analysisRunId'>,
): string => (
    `memory-pass:v1:${scopeToken(assertEvidenceScope(request.scope))}:${encodeURIComponent(request.analysisRunId)}`
);

export const createMemoryCandidateId = (passId: string, index: number): string => {
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('candidate index 必须是非负整数。');
    return `${requiredString(passId, 'passId')}:candidate:${index}`;
};

export const createMemoryExtractionReceiptId = (requestId: string): string => (
    `memory-extraction-receipt:v1:${encodeURIComponent(requiredString(requestId, 'requestId'))}`
);

export const createMemoryExtractionClaimId = (
    request: Pick<MemoryDMExtractionRequest, 'scope' | 'extractor' | 'promptVersion' | 'outputSchemaVersion'> & {
        evidenceSpan: Pick<MemoryDMExtractionRequest['evidenceSpan'], 'sourceRevisionFingerprint'>;
    },
): string => [
    'memory-extraction-claim:v1',
    scopeToken(assertEvidenceScope(request.scope)),
    encodeURIComponent(request.extractor),
    encodeURIComponent(requiredString(request.promptVersion, 'promptVersion')),
    encodeURIComponent(requiredString(request.outputSchemaVersion, 'outputSchemaVersion')),
    encodeURIComponent(requiredString(request.evidenceSpan.sourceRevisionFingerprint, 'sourceRevisionFingerprint')),
].join(':');

export const createMemoryPromotionCommandId = (input: Omit<MemoryPromotionCommand, 'id'>): string => [
    'memory-promotion-command:v1',
    scopeToken(assertEvidenceScope(input.scope)),
    encodeURIComponent(requiredString(input.passId, 'passId')),
    encodeURIComponent(requiredString(input.candidateId, 'candidateId')),
    encodeURIComponent(requiredString(input.expectedSourceRevisionFingerprint, 'expectedSourceRevisionFingerprint')),
    encodeURIComponent(input.trigger),
    encodeURIComponent(input.policyVersion),
    input.manualDecision
        ? encodeURIComponent(`${input.manualDecision.id}::${input.manualDecision.decision}::${input.manualDecision.confirmedAt}`)
        : 'no-manual-decision',
    input.experienceRef
        ? encodeURIComponent(`${input.experienceRef.receiptId}::${input.experienceRef.acceptedFactRefs.join('::')}`)
        : 'no-experience-ref',
    String(input.requestedAt),
].join(':');

export const createMemoryPromotionReceiptId = (commandId: string): string => (
    `memory-promotion-receipt:v1:${encodeURIComponent(requiredString(commandId, 'commandId'))}`
);

export const createPromotedMemoryRecordId = (input: {
    scope: MemoryPromotionCommand['scope'];
    passId: string;
    candidateId: string;
    target: 'relationship_memory' | 'timebook';
}): string => [
    `promoted-${input.target}:v1`,
    scopeToken(assertEvidenceScope(input.scope)),
    encodeURIComponent(requiredString(input.passId, 'passId')),
    encodeURIComponent(requiredString(input.candidateId, 'candidateId')),
].join(':');

export const assertMemoryCandidate = (
    candidate: MemoryCandidate,
    pass?: MemoryInterpretationPass,
): MemoryCandidate => {
    if (candidate.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('MemoryCandidate schemaVersion 无效。');
    assertEvidenceScope(candidate.scope);
    requiredString(candidate.id, 'candidate.id');
    requiredString(candidate.passId, 'candidate.passId');
    requiredString(candidate.title, 'candidate.title');
    requiredString(candidate.summary, 'candidate.summary');
    if (!CANDIDATE_TARGETS.has(candidate.target)) throw new Error('MemoryCandidate target 无效。');
    if (!CANDIDATE_KNOWLEDGE.has(candidate.knowledge)) throw new Error('MemoryCandidate knowledge 无效。');
    if (!TEMPORAL_CLASSES.has(candidate.temporalClass)) throw new Error('MemoryCandidate temporalClass 无效。');
    if (!CANDIDATE_AUTHORITIES.has(candidate.authority)) throw new Error('MemoryCandidate authority 无效。');
    if (!CANDIDATE_CLAIM_CLASSES.has(candidate.claimClass)) throw new Error('MemoryCandidate claimClass 无效。');
    if (!CANDIDATE_STATUSES.has(candidate.status)) throw new Error('MemoryCandidate status 无效。');
    if ((candidate.target === 'discard') !== (candidate.status === 'discarded')) {
        throw new Error('MemoryCandidate discard target 与 status 必须一致。');
    }
    if (!candidate.sourceEvidenceIds.length || new Set(candidate.sourceEvidenceIds).size !== candidate.sourceEvidenceIds.length) {
        throw new Error('MemoryCandidate 必须引用至少一条且不重复的来源证据。');
    }
    if (candidate.confidence !== undefined && (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1)) {
        throw new Error('MemoryCandidate confidence 必须位于 0 到 1。');
    }
    if (pass) {
        if (candidate.passId !== pass.id || !sameEvidenceScope(candidate.scope, pass.scope)) {
            throw new Error('MemoryCandidate 与 interpretation pass 归属不一致。');
        }
        const allowedEvidence = new Set(pass.evidenceSpan.evidenceIds);
        if (candidate.sourceEvidenceIds.some(id => !allowedEvidence.has(id))) {
            throw new Error('MemoryCandidate 引用了 pass 之外的证据。');
        }
    }
    return candidate;
};

export const assertMemoryExtractionRequest = (
    request: MemoryDMExtractionRequest,
): MemoryDMExtractionRequest => {
    if (request.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('MemoryDMExtractionRequest schemaVersion 无效。');
    const scope = assertEvidenceScope(request.scope);
    requiredString(request.id, 'request.id');
    requiredString(request.analysisRunId, 'request.analysisRunId');
    requiredString(request.promptVersion, 'request.promptVersion');
    requiredString(request.outputSchemaVersion, 'request.outputSchemaVersion');
    if (!EXTRACTION_TRIGGERS.has(request.trigger)) throw new Error('MemoryDMExtractionRequest trigger 无效。');
    if (!EXTRACTORS.has(request.extractor)) throw new Error('MemoryDMExtractionRequest extractor 无效。');
    assertEvidenceSpan(request.evidenceSpan);
    if (!sameEvidenceScope(scope, request.evidenceSpan.scope)) throw new Error('MemoryDMExtractionRequest evidence span 跨越关系范围。');
    if (request.id !== createMemoryExtractionRequestId({ scope, analysisRunId: request.analysisRunId })) {
        throw new Error('MemoryDMExtractionRequest id 与运行归属不一致。');
    }
    if (!Number.isFinite(request.requestedAt)) throw new Error('MemoryDMExtractionRequest requestedAt 无效。');
    return request;
};

export const assertMemoryInterpretationPass = (
    pass: MemoryInterpretationPass,
): MemoryInterpretationPass => {
    if (pass.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('MemoryInterpretationPass schemaVersion 无效。');
    const scope = assertEvidenceScope(pass.scope);
    requiredString(pass.id, 'pass.id');
    requiredString(pass.requestId, 'pass.requestId');
    requiredString(pass.analysisRunId, 'pass.analysisRunId');
    requiredString(pass.promptVersion, 'pass.promptVersion');
    requiredString(pass.outputSchemaVersion, 'pass.outputSchemaVersion');
    if (!EXTRACTORS.has(pass.extractor)) throw new Error('MemoryInterpretationPass extractor 无效。');
    assertEvidenceSpan(pass.evidenceSpan);
    if (!sameEvidenceScope(pass.scope, pass.evidenceSpan.scope)) throw new Error('MemoryInterpretationPass evidence span 跨越关系范围。');
    const expectedRequestId = createMemoryExtractionRequestId({ scope, analysisRunId: pass.analysisRunId });
    if (pass.requestId !== expectedRequestId) throw new Error('MemoryInterpretationPass requestId 与运行归属不一致。');
    if (pass.id !== createMemoryInterpretationPassId(pass)) throw new Error('MemoryInterpretationPass id 与运行归属不一致。');
    if (pass.truthEffect !== 'none' || pass.status !== 'completed') throw new Error('MemoryInterpretationPass 只能是无真相写入的完成记录。');
    if (pass.completedAt < pass.startedAt) throw new Error('MemoryInterpretationPass 时间顺序无效。');
    if (new Set(pass.candidates.map(candidate => candidate.id)).size !== pass.candidates.length) throw new Error('MemoryInterpretationPass candidate id 重复。');
    pass.candidates.forEach((candidate, index) => {
        assertMemoryCandidate(candidate, pass);
        const expectedAuthority = pass.extractor === 'model'
            ? 'model_interpretation'
            : 'deterministic_heuristic';
        if (candidate.authority !== expectedAuthority) {
            throw new Error('MemoryCandidate authority 不能脱离 interpretation pass extractor。');
        }
        if (candidate.id !== createMemoryCandidateId(pass.id, index)) {
            throw new Error('MemoryCandidate id 与 pass 内顺序不一致。');
        }
    });
    return pass;
};

export const assertMemoryExtractionReceipt = (
    receipt: MemoryDMExtractionReceipt,
): MemoryDMExtractionReceipt => {
    if (receipt.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('MemoryDMExtractionReceipt schemaVersion 无效。');
    assertEvidenceScope(receipt.scope);
    requiredString(receipt.id, 'receipt.id');
    requiredString(receipt.requestId, 'receipt.requestId');
    requiredString(receipt.analysisRunId, 'receipt.analysisRunId');
    requiredString(receipt.promptVersion, 'receipt.promptVersion');
    requiredString(receipt.outputSchemaVersion, 'receipt.outputSchemaVersion');
    if (!RECEIPT_STATUSES.has(receipt.status)) throw new Error('MemoryDMExtractionReceipt status 无效。');
    if (!EXTRACTORS.has(receipt.extractor)) throw new Error('MemoryDMExtractionReceipt extractor 无效。');
    assertEvidenceSpan(receipt.evidenceSpan);
    if (!sameEvidenceScope(receipt.scope, receipt.evidenceSpan.scope)) throw new Error('MemoryDMExtractionReceipt evidence span 跨越关系范围。');
    if (receipt.truthEffect !== 'none') throw new Error('提取回执不能产生真相写入。');
    const expectedRequestId = createMemoryExtractionRequestId({
        scope: receipt.scope,
        analysisRunId: receipt.analysisRunId,
    });
    if (receipt.requestId !== expectedRequestId) throw new Error('MemoryDMExtractionReceipt requestId 与运行归属不一致。');
    if (receipt.id !== createMemoryExtractionReceiptId(receipt.requestId)) throw new Error('MemoryDMExtractionReceipt id 与 requestId 不一致。');
    if (receipt.status === 'completed' && !receipt.passId) throw new Error('完成回执必须引用 interpretation pass。');
    if (receipt.status !== 'completed' && (receipt.passId || receipt.candidateIds.length > 0)) {
        throw new Error('未完成回执不能声明 pass 或候选。');
    }
    if (new Set(receipt.candidateIds).size !== receipt.candidateIds.length) throw new Error('提取回执 candidate id 重复。');
    if (!Number.isSafeInteger(receipt.rejectedCandidateCount) || receipt.rejectedCandidateCount < 0) throw new Error('rejectedCandidateCount 无效。');
    if (!Number.isSafeInteger(receipt.usage.evidenceCount) || receipt.usage.evidenceCount < 1) throw new Error('receipt evidenceCount 无效。');
    if (!Number.isSafeInteger(receipt.usage.inputCharCount) || receipt.usage.inputCharCount < 0) throw new Error('receipt inputCharCount 无效。');
    if (receipt.usage.promptCharCount !== undefined && (!Number.isSafeInteger(receipt.usage.promptCharCount) || receipt.usage.promptCharCount < 0)) {
        throw new Error('receipt promptCharCount 无效。');
    }
    if (receipt.usage.estimatedInputTokens !== undefined && (!Number.isSafeInteger(receipt.usage.estimatedInputTokens) || receipt.usage.estimatedInputTokens < 0)) {
        throw new Error('receipt estimatedInputTokens 无效。');
    }
    if (receipt.usage.estimatedInputTokens !== undefined && receipt.usage.estimatorId !== 'unicode_chars_div_3_v1') {
        throw new Error('估算 token 必须记录 estimatorId。');
    }
    return receipt;
};

export const assertMemoryExtractionClaim = (
    claim: MemoryExtractionClaim,
): MemoryExtractionClaim => {
    if (claim.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('MemoryExtractionClaim schemaVersion 无效。');
    assertEvidenceScope(claim.scope);
    requiredString(claim.id, 'claim.id');
    requiredString(claim.requestId, 'claim.requestId');
    requiredString(claim.sourceRevisionFingerprint, 'claim.sourceRevisionFingerprint');
    requiredString(claim.promptVersion, 'claim.promptVersion');
    requiredString(claim.outputSchemaVersion, 'claim.outputSchemaVersion');
    if (!EXTRACTORS.has(claim.extractor)) throw new Error('MemoryExtractionClaim extractor 无效。');
    if (!CLAIM_STATUSES.has(claim.status)) throw new Error('MemoryExtractionClaim status 无效。');
    if (!Number.isFinite(claim.createdAt) || !Number.isFinite(claim.updatedAt) || claim.updatedAt < claim.createdAt) {
        throw new Error('MemoryExtractionClaim 时间无效。');
    }
    const expectedId = createMemoryExtractionClaimId({
        scope: claim.scope,
        extractor: claim.extractor,
        promptVersion: claim.promptVersion,
        outputSchemaVersion: claim.outputSchemaVersion,
        evidenceSpan: { sourceRevisionFingerprint: claim.sourceRevisionFingerprint },
    });
    if (claim.id !== expectedId) throw new Error('MemoryExtractionClaim id 与来源归属不一致。');
    return claim;
};

export const assertMemoryPromotionCommand = (
    command: MemoryPromotionCommand,
): MemoryPromotionCommand => {
    if (command.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('MemoryPromotionCommand schemaVersion 无效。');
    assertEvidenceScope(command.scope);
    requiredString(command.id, 'command.id');
    requiredString(command.passId, 'command.passId');
    requiredString(command.candidateId, 'command.candidateId');
    requiredString(command.expectedSourceRevisionFingerprint, 'expectedSourceRevisionFingerprint');
    if (!/^sha256:[a-f0-9]{64}$/u.test(command.expectedSourceRevisionFingerprint)) {
        throw new Error('MemoryPromotionCommand source revision fingerprint 无效。');
    }
    if (!PROMOTION_TRIGGERS.has(command.trigger)) throw new Error('MemoryPromotionCommand trigger 无效。');
    if (command.policyVersion !== MEMORY_PROMOTION_POLICY_VERSION) throw new Error('MemoryPromotionCommand policyVersion 无效。');
    if (command.trigger === 'manual') {
        if (!command.manualDecision) throw new Error('manual MemoryPromotionCommand 缺少用户决策。');
        assertMemoryPromotionManualDecision(command.manualDecision, command.scope, command.candidateId);
        if (command.manualDecision.confirmedAt > command.requestedAt) {
            throw new Error('MemoryPromotion manual decision 不能晚于命令请求。');
        }
    } else if (command.manualDecision) {
        throw new Error('automatic MemoryPromotionCommand 不能伪装成人工决策。');
    }
    if (command.experienceRef) assertMemoryPromotionExperienceRef(command.experienceRef, command.scope);
    if (!Number.isFinite(command.requestedAt)) throw new Error('MemoryPromotionCommand requestedAt 无效。');
    if (command.id !== createMemoryPromotionCommandId(command)) {
        throw new Error('MemoryPromotionCommand id 与候选归属不一致。');
    }
    return command;
};

export const assertMemoryPromotionManualDecision = (
    decision: MemoryPromotionManualDecision,
    expectedScope?: MemoryPromotionCommand['scope'],
    expectedCandidateId?: string,
): MemoryPromotionManualDecision => {
    requiredString(decision.id, 'manualDecision.id');
    assertEvidenceScope(decision.scope);
    requiredString(decision.candidateId, 'manualDecision.candidateId');
    if (!PROMOTION_MANUAL_DECISIONS.has(decision.decision)) throw new Error('MemoryPromotion manual decision 无效。');
    if (!Number.isFinite(decision.confirmedAt)) throw new Error('MemoryPromotion manual decision confirmedAt 无效。');
    if (expectedScope && !sameEvidenceScope(decision.scope, expectedScope)) {
        throw new Error('MemoryPromotion manual decision 跨越关系范围。');
    }
    if (expectedCandidateId && decision.candidateId !== expectedCandidateId) {
        throw new Error('MemoryPromotion manual decision 与候选不一致。');
    }
    return decision;
};

export const assertMemoryPromotionExperienceRef = (
    ref: MemoryPromotionExperienceRef,
    expectedScope?: MemoryPromotionCommand['scope'],
): MemoryPromotionExperienceRef => {
    if (ref.kind !== 'scoped_experience_receipt') throw new Error('MemoryPromotion experience ref kind 无效。');
    assertEvidenceScope(ref.scope);
    requiredString(ref.receiptId, 'experienceRef.receiptId');
    if (!ref.acceptedFactRefs.length || new Set(ref.acceptedFactRefs).size !== ref.acceptedFactRefs.length) {
        throw new Error('experienceRef 必须引用至少一条且不重复的 accepted fact。');
    }
    ref.acceptedFactRefs.forEach((factRef, index) => requiredString(factRef, `experienceRef.acceptedFactRefs[${index}]`));
    if (expectedScope && !sameEvidenceScope(ref.scope, expectedScope)) {
        throw new Error('experienceRef 跨越关系范围。');
    }
    return ref;
};

export const assertMemoryPromotionReceipt = (
    receipt: MemoryPromotionReceipt,
): MemoryPromotionReceipt => {
    if (receipt.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('MemoryPromotionReceipt schemaVersion 无效。');
    assertEvidenceScope(receipt.scope);
    requiredString(receipt.id, 'receipt.id');
    requiredString(receipt.commandId, 'receipt.commandId');
    requiredString(receipt.passId, 'receipt.passId');
    requiredString(receipt.candidateId, 'receipt.candidateId');
    requiredString(receipt.expectedSourceRevisionFingerprint, 'expectedSourceRevisionFingerprint');
    if (!/^sha256:[a-f0-9]{64}$/u.test(receipt.expectedSourceRevisionFingerprint)) {
        throw new Error('MemoryPromotionReceipt source revision fingerprint 无效。');
    }
    if (!PROMOTION_TRIGGERS.has(receipt.trigger)) throw new Error('MemoryPromotionReceipt trigger 无效。');
    if (receipt.policyVersion !== MEMORY_PROMOTION_POLICY_VERSION) throw new Error('MemoryPromotionReceipt policyVersion 无效。');
    if (receipt.manualDecision) {
        assertMemoryPromotionManualDecision(receipt.manualDecision, receipt.scope, receipt.candidateId);
    }
    if (receipt.trigger === 'manual' && !receipt.manualDecision) throw new Error('manual MemoryPromotionReceipt 缺少用户决策。');
    if (receipt.trigger === 'automatic_policy' && receipt.manualDecision) throw new Error('automatic MemoryPromotionReceipt 不能携带人工决策。');
    if (receipt.experienceRef) assertMemoryPromotionExperienceRef(receipt.experienceRef, receipt.scope);
    if (receipt.candidateDecision) {
        const decision = receipt.candidateDecision;
        if (!CANDIDATE_TARGETS.has(decision.target)) throw new Error('MemoryPromotionReceipt candidate target 无效。');
        if (!CANDIDATE_KNOWLEDGE.has(decision.knowledge)) throw new Error('MemoryPromotionReceipt candidate knowledge 无效。');
        if (!TEMPORAL_CLASSES.has(decision.temporalClass)) throw new Error('MemoryPromotionReceipt candidate temporalClass 无效。');
        if (!CANDIDATE_AUTHORITIES.has(decision.interpretationAuthority)) throw new Error('MemoryPromotionReceipt candidate authority 无效。');
        if (!CANDIDATE_CLAIM_CLASSES.has(decision.claimClass)) throw new Error('MemoryPromotionReceipt candidate claimClass 无效。');
        if (!decision.sourceEvidenceIds.length || new Set(decision.sourceEvidenceIds).size !== decision.sourceEvidenceIds.length) {
            throw new Error('MemoryPromotionReceipt candidate evidence 无效。');
        }
    }
    if (receipt.sourceAssessment) assertMemoryPromotionSourceAssessment(receipt.sourceAssessment);
    if (
        receipt.candidateDecision
        && receipt.sourceAssessment
        && (
            receipt.candidateDecision.sourceEvidenceIds.length !== receipt.sourceAssessment.evidenceIds.length
            || receipt.candidateDecision.sourceEvidenceIds.some((id, index) => id !== receipt.sourceAssessment!.evidenceIds[index])
        )
    ) throw new Error('MemoryPromotionReceipt 来源判级与候选证据不一致。');
    if (!PROMOTION_RECEIPT_STATUSES.has(receipt.status)) throw new Error('MemoryPromotionReceipt status 无效。');
    if (!PROMOTION_TRUTH_EFFECTS.has(receipt.truthEffect)) throw new Error('MemoryPromotionReceipt truthEffect 无效。');
    if (!Number.isFinite(receipt.createdAt)) throw new Error('MemoryPromotionReceipt createdAt 无效。');
    if (receipt.id !== createMemoryPromotionReceiptId(receipt.commandId)) {
        throw new Error('MemoryPromotionReceipt id 与 commandId 不一致。');
    }
    if (receipt.status === 'applied') {
        if (!receipt.candidateDecision) throw new Error('已应用的 MemoryPromotionReceipt 缺少候选决策快照。');
        if (!receipt.sourceAssessment) throw new Error('已应用的 MemoryPromotionReceipt 缺少来源判级快照。');
        if (receipt.truthEffect === 'none' || typeof receipt.targetRecordId !== 'string' || !receipt.targetRecordId.trim()) {
            throw new Error('已应用的 MemoryPromotionReceipt 必须声明目标真相写入。');
        }
        if (receipt.duplicateOfTargetRecordId || receipt.duplicateOfReceiptId) {
            throw new Error('已应用的 MemoryPromotionReceipt 不能伪装成重复尝试。');
        }
    } else if (receipt.status === 'duplicate') {
        if (!receipt.candidateDecision || !receipt.sourceAssessment) {
            throw new Error('重复 MemoryPromotionReceipt 缺少决策或来源判级快照。');
        }
        requiredString(receipt.duplicateOfTargetRecordId, 'duplicateOfTargetRecordId');
        requiredString(receipt.duplicateOfReceiptId, 'duplicateOfReceiptId');
        if (receipt.truthEffect !== 'none' || receipt.targetRecordId) {
            throw new Error('重复 MemoryPromotionReceipt 不能声明新的真相写入。');
        }
    } else if (receipt.truthEffect !== 'none' || receipt.targetRecordId) {
        throw new Error('未应用的 MemoryPromotionReceipt 不能声明目标真相写入。');
    } else if (receipt.duplicateOfTargetRecordId || receipt.duplicateOfReceiptId) {
        throw new Error('非重复 MemoryPromotionReceipt 不能引用重复目标。');
    }
    return receipt;
};

export const assertMemoryPromotionSourceAssessment = (
    assessment: MemoryPromotionSourceAssessment,
): MemoryPromotionSourceAssessment => {
    if (assessment.classifierVersion !== 'interaction-provenance-v1') {
        throw new Error('MemoryPromotion source classifier version 无效。');
    }
    if (!PROMOTION_SOURCE_CLASSES.has(assessment.sourceClass)) {
        throw new Error('MemoryPromotion source class 无效。');
    }
    if (!assessment.evidenceIds.length || new Set(assessment.evidenceIds).size !== assessment.evidenceIds.length) {
        throw new Error('MemoryPromotion source assessment evidence 无效。');
    }
    const enumLists: Array<[string, string[], Set<string>]> = [
        ['surfaces', assessment.surfaces, INTERACTION_SURFACES],
        ['media', assessment.media, INTERACTION_MEDIA],
        ['producers', assessment.producers, INTERACTION_PRODUCERS],
        ['transportRoles', assessment.transportRoles, INTERACTION_TRANSPORT_ROLES],
    ];
    for (const [key, values, allowed] of enumLists) {
        if (!Array.isArray(values) || values.length < 1 || values.some(value => !allowed.has(value))) {
            throw new Error(`MemoryPromotion source assessment ${key} 无效。`);
        }
    }
    return assessment;
};

export const assertPromotedMemoryRecord = (
    record: PromotedMemoryRecord,
): PromotedMemoryRecord => {
    if (record.schemaVersion !== MEMORY_INTERPRETATION_SCHEMA_VERSION) throw new Error('PromotedMemoryRecord schemaVersion 无效。');
    assertEvidenceScope(record.scope);
    requiredString(record.id, 'record.id');
    requiredString(record.title, 'record.title');
    requiredString(record.summary, 'record.summary');
    requiredString(record.promotionReceiptId, 'promotionReceiptId');
    requiredString(record.source.passId, 'source.passId');
    requiredString(record.source.candidateId, 'source.candidateId');
    assertEvidenceSpan(record.source.evidenceSpan);
    if (!sameEvidenceScope(record.scope, record.source.evidenceSpan.scope)) {
        throw new Error('PromotedMemoryRecord evidence span 跨越关系范围。');
    }
    if (!record.source.sourceEvidenceIds.length || new Set(record.source.sourceEvidenceIds).size !== record.source.sourceEvidenceIds.length) {
        throw new Error('PromotedMemoryRecord 必须引用至少一条且不重复的候选证据。');
    }
    const spanIds = new Set(record.source.evidenceSpan.evidenceIds);
    if (record.source.sourceEvidenceIds.some(id => !spanIds.has(id))) {
        throw new Error('PromotedMemoryRecord 引用了 evidence span 之外的来源。');
    }
    if (!CANDIDATE_KNOWLEDGE.has(record.knowledge)) throw new Error('PromotedMemoryRecord knowledge 无效。');
    if (!TEMPORAL_CLASSES.has(record.temporalClass)) throw new Error('PromotedMemoryRecord temporalClass 无效。');
    if (!CANDIDATE_AUTHORITIES.has(record.interpretationAuthority)) throw new Error('PromotedMemoryRecord authority 无效。');
    if (!CANDIDATE_CLAIM_CLASSES.has(record.claimClass)) throw new Error('PromotedMemoryRecord claimClass 无效。');
    assertMemoryPromotionSourceAssessment(record.sourceAssessment);
    if (
        record.source.sourceEvidenceIds.length !== record.sourceAssessment.evidenceIds.length
        || record.source.sourceEvidenceIds.some((id, index) => id !== record.sourceAssessment.evidenceIds[index])
    ) throw new Error('PromotedMemoryRecord 来源判级与候选证据不一致。');
    if (!PROMOTION_TRIGGERS.has(record.promotionTrigger)) throw new Error('PromotedMemoryRecord promotion trigger 无效。');
    if (record.manualDecision) {
        assertMemoryPromotionManualDecision(record.manualDecision, record.scope, record.source.candidateId);
    }
    if (record.promotionTrigger === 'manual' && !record.manualDecision) throw new Error('manual PromotedMemoryRecord 缺少用户决策。');
    if (record.promotionTrigger === 'automatic_policy' && record.manualDecision) throw new Error('automatic PromotedMemoryRecord 不能携带人工决策。');
    if (record.experienceRef) assertMemoryPromotionExperienceRef(record.experienceRef, record.scope);
    if (!Number.isFinite(record.createdAt)) throw new Error('PromotedMemoryRecord createdAt 无效。');
    if (record.confidence !== undefined && (!Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1)) {
        throw new Error('PromotedMemoryRecord confidence 必须位于 0 到 1。');
    }
    if (record.target === 'timebook') {
        requiredString(record.happenedAt, 'timebook happenedAt');
        if (Number.isNaN(Date.parse(record.happenedAt))) throw new Error('timebook happenedAt 必须是有效时间。');
    }
    const expectedId = createPromotedMemoryRecordId({
        scope: record.scope,
        passId: record.source.passId,
        candidateId: record.source.candidateId,
        target: record.target,
    });
    if (record.id !== expectedId) throw new Error('PromotedMemoryRecord id 与来源候选不一致。');
    return record;
};
