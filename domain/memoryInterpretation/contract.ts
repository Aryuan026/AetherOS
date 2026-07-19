import { assertEvidenceScope, assertEvidenceSpan, sameEvidenceScope } from '../interactionEvidence/contract.ts';
import {
    MEMORY_INTERPRETATION_SCHEMA_VERSION,
    type MemoryCandidate,
    type MemoryDMExtractionReceipt,
    type MemoryDMExtractionRequest,
    type MemoryInterpretationPass,
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
const RECEIPT_STATUSES = new Set(['completed', 'failed', 'rejected']);

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
    requiredString(receipt.promptVersion, 'receipt.promptVersion');
    requiredString(receipt.outputSchemaVersion, 'receipt.outputSchemaVersion');
    if (!RECEIPT_STATUSES.has(receipt.status)) throw new Error('MemoryDMExtractionReceipt status 无效。');
    if (!EXTRACTORS.has(receipt.extractor)) throw new Error('MemoryDMExtractionReceipt extractor 无效。');
    assertEvidenceSpan(receipt.evidenceSpan);
    if (!sameEvidenceScope(receipt.scope, receipt.evidenceSpan.scope)) throw new Error('MemoryDMExtractionReceipt evidence span 跨越关系范围。');
    if (receipt.truthEffect !== 'none') throw new Error('提取回执不能产生真相写入。');
    if (receipt.id !== createMemoryExtractionReceiptId(receipt.requestId)) throw new Error('MemoryDMExtractionReceipt id 与 requestId 不一致。');
    if (receipt.status === 'completed' && !receipt.passId) throw new Error('完成回执必须引用 interpretation pass。');
    if (receipt.status !== 'completed' && (receipt.passId || receipt.candidateIds.length > 0)) {
        throw new Error('未完成回执不能声明 pass 或候选。');
    }
    if (new Set(receipt.candidateIds).size !== receipt.candidateIds.length) throw new Error('提取回执 candidate id 重复。');
    if (!Number.isSafeInteger(receipt.rejectedCandidateCount) || receipt.rejectedCandidateCount < 0) throw new Error('rejectedCandidateCount 无效。');
    if (!Number.isSafeInteger(receipt.usage.evidenceCount) || receipt.usage.evidenceCount < 1) throw new Error('receipt evidenceCount 无效。');
    if (!Number.isSafeInteger(receipt.usage.inputCharCount) || receipt.usage.inputCharCount < 0) throw new Error('receipt inputCharCount 无效。');
    return receipt;
};
