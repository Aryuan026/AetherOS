import type { HistoryScope } from '../historyImport/types.ts';
import {
    INTERACTION_EVIDENCE_SCHEMA_VERSION,
    type EvidenceSpan,
    type InteractionEvidence,
    type InteractionEvidenceStatus,
    type InteractionMedium,
    type InteractionProducer,
    type InteractionSourceRef,
    type InteractionSurface,
    type InteractionTransportRole,
} from './types.ts';

const SURFACES = new Set<InteractionSurface>([
    'history_import', 'chat', 'date', 'call', 'social', 'group_chat', 'journal', 'proactive', 'other',
]);
const MEDIA = new Set<InteractionMedium>([
    'remote_text', 'mixed_text', 'embodied_scene', 'voice_call', 'social', 'diary', 'other',
]);
const PRODUCERS = new Set<InteractionProducer>(['user', 'model', 'system', 'import', 'manual']);
const TRANSPORT_ROLES = new Set<InteractionTransportRole>([
    'user_channel', 'assistant_channel', 'system_channel', 'unknown',
]);
const STATUSES = new Set<InteractionEvidenceStatus>(['active', 'superseded', 'tombstoned']);
const CONTENT_KINDS = new Set<InteractionEvidence['content']['kind']>([
    'text', 'image', 'audio', 'interaction', 'mixed',
]);

const requiredString = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空。`);
    return value.trim();
};

const requiredRevision = (value: unknown, label: string): number => {
    if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} 必须是正整数。`);
    return Number(value);
};

export const assertEvidenceScope = (scope: HistoryScope): HistoryScope => ({
    progressBundleId: requiredString(scope?.progressBundleId, 'progressBundleId'),
    personaMaskId: requiredString(scope?.personaMaskId, 'personaMaskId'),
    charId: requiredString(scope?.charId, 'charId'),
});

export const sameEvidenceScope = (left: HistoryScope, right: HistoryScope): boolean => (
    left.progressBundleId === right.progressBundleId
    && left.personaMaskId === right.personaMaskId
    && left.charId === right.charId
);

export const assertInteractionSourceRef = (
    ref: InteractionSourceRef,
    label = 'sourceRef',
): InteractionSourceRef => ({
    storeFamily: requiredString(ref?.storeFamily, `${label}.storeFamily`),
    recordId: requiredString(ref?.recordId, `${label}.recordId`),
    revision: requiredRevision(ref?.revision, `${label}.revision`),
});

const encodedScope = (scope: HistoryScope): string => [
    scope.progressBundleId,
    scope.personaMaskId,
    scope.charId,
].map(value => encodeURIComponent(value)).join('::');

export const createInteractionEvidenceId = (input: {
    scope: HistoryScope;
    source: InteractionSourceRef;
}): string => {
    const scope = assertEvidenceScope(input.scope);
    const source = assertInteractionSourceRef(input.source);
    return [
        'interaction-evidence:v1',
        encodedScope(scope),
        encodeURIComponent(source.storeFamily),
        encodeURIComponent(source.recordId),
        `r${source.revision}`,
    ].join(':');
};

export const assertInteractionEvidence = (evidence: InteractionEvidence): InteractionEvidence => {
    if (evidence?.schemaVersion !== INTERACTION_EVIDENCE_SCHEMA_VERSION) {
        throw new Error('InteractionEvidence schemaVersion 不受支持。');
    }
    const scope = assertEvidenceScope(evidence.scope);
    const sourceRef = assertInteractionSourceRef(evidence.source, 'source');
    if (!SURFACES.has(evidence.source.surface)) throw new Error('InteractionEvidence surface 无效。');
    if (!MEDIA.has(evidence.source.medium)) throw new Error('InteractionEvidence medium 无效。');
    if (!STATUSES.has(evidence.source.status)) throw new Error('InteractionEvidence status 无效。');
    if (!TRANSPORT_ROLES.has(evidence.transportRole)) throw new Error('InteractionEvidence transportRole 无效。');
    if (!PRODUCERS.has(evidence.producer)) throw new Error('InteractionEvidence producer 无效。');
    if (!CONTENT_KINDS.has(evidence.content.kind)) throw new Error('InteractionEvidence content.kind 无效。');
    const contentRef = assertInteractionSourceRef(evidence.content.ref, 'content.ref');
    if (
        contentRef.storeFamily !== sourceRef.storeFamily
        || contentRef.recordId !== sourceRef.recordId
        || contentRef.revision !== sourceRef.revision
    ) throw new Error('InteractionEvidence content.ref 必须指向同一来源版本。');
    if (evidence.source.previousRevisionRef) {
        const previous = assertInteractionSourceRef(evidence.source.previousRevisionRef, 'previousRevisionRef');
        if (
            previous.storeFamily !== sourceRef.storeFamily
            || previous.recordId !== sourceRef.recordId
            || previous.revision >= sourceRef.revision
        ) throw new Error('previousRevisionRef 必须指向同一记录的更早版本。');
    }
    requiredString(evidence.evidenceId, 'evidenceId');
    const expectedEvidenceId = createInteractionEvidenceId({ scope, source: sourceRef });
    if (evidence.evidenceId !== expectedEvidenceId) throw new Error('InteractionEvidence evidenceId 与来源版本不一致。');
    requiredString(evidence.time.recordedAt, 'recordedAt');
    if (Number.isNaN(Date.parse(evidence.time.recordedAt))) throw new Error('recordedAt 必须是有效时间。');
    if (evidence.time.occurredAt && Number.isNaN(Date.parse(evidence.time.occurredAt))) {
        throw new Error('occurredAt 必须是有效时间。');
    }
    requiredString(evidence.correlation.interactionId, 'interactionId');
    if (!Number.isSafeInteger(evidence.correlation.sequence) || evidence.correlation.sequence < 0) {
        throw new Error('InteractionEvidence sequence 必须是非负整数。');
    }
    const parents = evidence.correlation.parentEvidenceIds || [];
    if (parents.some(parent => typeof parent !== 'string' || !parent.trim())) {
        throw new Error('parentEvidenceIds 不能包含空编号。');
    }
    if (new Set(parents).size !== parents.length) throw new Error('parentEvidenceIds 不能重复。');
    return evidence;
};

const fnv1a = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
};

export const createEvidenceSpan = (input: {
    scope: HistoryScope;
    evidence: readonly InteractionEvidence[];
}): EvidenceSpan => {
    const scope = assertEvidenceScope(input.scope);
    if (!input.evidence.length) throw new Error('EvidenceSpan 至少需要一条证据。');
    input.evidence.forEach(item => {
        assertInteractionEvidence(item);
        if (!sameEvidenceScope(scope, item.scope)) throw new Error('EvidenceSpan 不能跨关系范围。');
    });
    const evidenceIds = input.evidence.map(item => item.evidenceId);
    if (new Set(evidenceIds).size !== evidenceIds.length) throw new Error('EvidenceSpan 不能重复引用同一证据版本。');
    const fingerprintInput = input.evidence
        .map(item => `${item.evidenceId}@${item.source.revision}`)
        .sort()
        .join('|');
    return {
        schemaVersion: INTERACTION_EVIDENCE_SCHEMA_VERSION,
        scope,
        evidenceIds,
        sourceRevisionFingerprint: `fnv1a32:${fnv1a(fingerprintInput)}`,
    };
};
