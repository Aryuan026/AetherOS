import { createHistoryScopeKey, validateHistoryScope } from '../contract.ts';
import type { HistoryAuthorChannel, HistoryScope } from '../types.ts';
import {
    validateHistoryAnalysisPass,
    validateHistoryAnalysisRequest,
    validateHistoryEvidenceBinding,
    validateHistorySourceSpan,
} from './contract.ts';
import type {
    HistoryAnalysisPass,
    HistoryAnalysisRequest,
    HistoryEvidenceBinding,
    HistorySourceSpan,
} from './types.ts';

export const HISTORICAL_NARRATIVE_EXTRACTION_SCHEMA_VERSION = 1 as const;

export interface HistoricalSourceTurn {
    sourceMessageId: string;
    /** Export transport role only; in-world actors are resolved separately. */
    transportChannel: HistoryAuthorChannel | 'unknown';
    content: string;
}

/** Hidden model packet; Calendar remains the only human-facing segmentation. */
export interface HistoricalNarrativeSourcePacket {
    id: string;
    scope: HistoryScope;
    sourceRefs: HistorySourceSpan[];
    turns: HistoricalSourceTurn[];
    inputCharCount: number;
}

export interface HistoricalNarrativeExtractionUsage {
    packetCount: number;
    sourceTurnCount: number;
    inputCharCount: number;
    estimatedInputTokens: number;
    estimatorId: 'unicode_chars_div_3_v1';
    providerPromptTokens?: number;
    providerCompletionTokens?: number;
    providerTotalTokens?: number;
    latencyMs?: number;
}

export interface HistoricalNarrativeExtractionReceipt {
    schemaVersion: typeof HISTORICAL_NARRATIVE_EXTRACTION_SCHEMA_VERSION;
    id: string;
    requestId: string;
    analysisRunId: string;
    scope: HistoryScope;
    sourceRevisionFingerprint: string;
    status: 'completed' | 'failed';
    truthEffect: 'none';
    passId?: string;
    bindingIds: string[];
    extractorVersion: string;
    promptVersion: string;
    outputSchemaVersion: string;
    usage: HistoricalNarrativeExtractionUsage;
    reason?: string;
    createdAt: number;
}

export type HistoricalNarrativeExtractionResult =
    | {
        status: 'completed';
        pass: HistoryAnalysisPass;
        bindings: HistoryEvidenceBinding[];
        receipt: HistoricalNarrativeExtractionReceipt;
    }
    | {
        status: 'failed';
        receipt: HistoricalNarrativeExtractionReceipt;
    };

/**
 * History-owned model boundary. It may return immutable historical material;
 * it has no port for Narrative, Memory Promotion, Scheduler, or Character Life.
 */
export interface HistoricalNarrativeExtractionPort {
    extract(input: {
        request: HistoryAnalysisRequest;
        packets: HistoricalNarrativeSourcePacket[];
        promptVersion: string;
        outputSchemaVersion: string;
    }): Promise<HistoricalNarrativeExtractionResult>;
}

export const HISTORICAL_NARRATIVE_EXTRACTION_TRUTH_POLICY = {
    relationshipMemoryWrite: false,
    timebookWrite: false,
    narrativeRunWrite: false,
    narrativeSceneWrite: false,
    experienceReceiptWrite: false,
    schedulerWrite: false,
    characterLifeWrite: false,
    currentStateWrite: false,
} as const;

const required = (value: string | undefined, label: string): string[] => (
    value?.trim() ? [] : [`${label} is required`]
);

const scopesMatch = (left: HistoryScope, right: HistoryScope): boolean => (
    createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const passEntityIds = (pass: HistoryAnalysisPass): Set<string> => new Set([
    ...pass.relationshipMemories.map(item => item.id),
    ...pass.timebookNodes.map(item => item.id),
    ...pass.narrativeProfile.actors.map(item => item.id),
    ...pass.narrativeProfile.events.map(item => item.id),
    ...pass.narrativeProfile.eventRouteBindings.map(item => item.id),
    ...pass.narrativeProfile.routes.map(item => item.id),
    ...pass.narrativeProfile.npcs.map(item => item.id),
    ...pass.narrativeProfile.relationshipStages.map(item => item.id),
    ...pass.narrativeProfile.openThreads.map(item => item.id),
]);

const passDerivedEntities = (pass: HistoryAnalysisPass) => [
    ...pass.relationshipMemories,
    ...pass.timebookNodes,
    pass.narrativeProfile,
    ...pass.narrativeProfile.actors,
    ...pass.narrativeProfile.events,
    ...pass.narrativeProfile.eventRouteBindings,
    ...pass.narrativeProfile.routes,
    ...pass.narrativeProfile.npcs,
    ...pass.narrativeProfile.relationshipStages,
    ...pass.narrativeProfile.openThreads,
];

const sourceRefContains = (container: HistorySourceSpan, child: HistorySourceSpan): boolean => {
    if (
        container.documentId !== child.documentId
        || container.documentRevision !== child.documentRevision
        || container.startMessageOffset > child.startMessageOffset
        || container.endMessageOffset < child.endMessageOffset
    ) return false;
    if (!child.messageIds?.length || !container.messageIds?.length) return true;
    const allowed = new Set(container.messageIds);
    return child.messageIds.every(id => allowed.has(id));
};

const passSourceRefs = (pass: HistoryAnalysisPass): HistorySourceSpan[] => [
    ...pass.sourceRefs,
    ...pass.relationshipMemories.flatMap(item => item.sourceRefs),
    ...pass.timebookNodes.flatMap(item => item.sourceRefs),
    ...pass.narrativeProfile.actors.flatMap(item => item.sourceRefs),
    ...pass.narrativeProfile.events.flatMap(item => item.sourceRefs),
    ...pass.narrativeProfile.eventRouteBindings.flatMap(item => item.sourceRefs),
    ...pass.narrativeProfile.routes.flatMap(item => item.sourceRefs),
    ...pass.narrativeProfile.npcs.flatMap(item => item.sourceRefs),
    ...pass.narrativeProfile.relationshipStages.flatMap(item => item.sourceRefs),
    ...pass.narrativeProfile.openThreads.flatMap(item => item.sourceRefs),
];

export const validateHistoricalNarrativeSourcePacket = (
    packet: HistoricalNarrativeSourcePacket,
    expectedScope: HistoryScope,
): string[] => {
    const errors = required(packet.id, 'source packet id');
    if (!scopesMatch(packet.scope, expectedScope)) errors.push('source packet crosses extraction scope');
    if (packet.sourceRefs.length < 1) errors.push('source packet needs at least one sourceRef');
    packet.sourceRefs.forEach((sourceRef, index) => {
        errors.push(...validateHistorySourceSpan(sourceRef, `sourcePacket.sourceRefs[${index}]`));
    });
    if (packet.turns.length < 1) errors.push('source packet needs at least one source turn');
    const explicitMessageIds = new Set(packet.sourceRefs.flatMap(sourceRef => sourceRef.messageIds ?? []));
    packet.turns.forEach((turn, index) => {
        errors.push(...required(turn.sourceMessageId, `sourcePacket.turns[${index}].sourceMessageId`));
        errors.push(...required(turn.content, `sourcePacket.turns[${index}].content`));
        if (!['user', 'char', 'unknown'].includes(turn.transportChannel)) {
            errors.push(`sourcePacket.turns[${index}].transportChannel is invalid`);
        }
        if (explicitMessageIds.size > 0 && !explicitMessageIds.has(turn.sourceMessageId)) {
            errors.push(`sourcePacket.turns[${index}] is outside packet sourceRefs`);
        }
    });
    const inputCharCount = packet.turns.reduce((total, turn) => total + turn.content.length, 0);
    if (packet.inputCharCount !== inputCharCount) errors.push('source packet inputCharCount mismatch');
    return errors;
};

/** Intrinsic receipt checks used when reading the append-only receipt store. */
export const validateHistoricalNarrativeExtractionReceipt = (
    receipt: HistoricalNarrativeExtractionReceipt,
): string[] => {
    const errors = validateHistoryScope(receipt.scope);
    if (receipt.schemaVersion !== HISTORICAL_NARRATIVE_EXTRACTION_SCHEMA_VERSION) {
        errors.push('unsupported historical narrative extraction receipt schemaVersion');
    }
    errors.push(...required(receipt.id, 'extraction receipt id'));
    errors.push(...required(receipt.requestId, 'extraction receipt requestId'));
    errors.push(...required(receipt.analysisRunId, 'extraction receipt analysisRunId'));
    errors.push(...required(receipt.sourceRevisionFingerprint, 'extraction receipt sourceRevisionFingerprint'));
    errors.push(...required(receipt.extractorVersion, 'extraction receipt extractorVersion'));
    errors.push(...required(receipt.promptVersion, 'extraction receipt promptVersion'));
    errors.push(...required(receipt.outputSchemaVersion, 'extraction receipt outputSchemaVersion'));
    if (receipt.status !== 'completed' && receipt.status !== 'failed') {
        errors.push('extraction receipt status is invalid');
    }
    if (receipt.truthEffect !== 'none') errors.push('historical extraction receipt must have no truth effect');
    if (!Number.isFinite(receipt.createdAt)) errors.push('extraction receipt createdAt is invalid');
    if (new Set(receipt.bindingIds).size !== receipt.bindingIds.length) {
        errors.push('extraction receipt bindingIds must be unique');
    }
    for (const field of ['packetCount', 'sourceTurnCount', 'inputCharCount', 'estimatedInputTokens'] as const) {
        if (!Number.isSafeInteger(receipt.usage[field]) || receipt.usage[field] < 0) {
            errors.push(`extraction usage ${field} is invalid`);
        }
    }
    if (receipt.usage.estimatorId !== 'unicode_chars_div_3_v1') {
        errors.push('extraction usage estimatorId is invalid');
    }
    for (const field of ['providerPromptTokens', 'providerCompletionTokens', 'providerTotalTokens', 'latencyMs'] as const) {
        const value = receipt.usage[field];
        if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
            errors.push(`extraction usage ${field} is invalid`);
        }
    }
    if (receipt.status === 'failed') {
        if (receipt.passId || receipt.bindingIds.length > 0) {
            errors.push('failed extraction must not claim pass or bindings');
        }
        if (!receipt.reason?.trim()) errors.push('failed extraction receipt requires a reason');
    } else {
        errors.push(...required(receipt.passId, 'completed extraction receipt passId'));
        if (receipt.reason) errors.push('completed extraction receipt must not claim a failure reason');
    }
    return errors;
};

export const validateHistoricalNarrativeExtractionResult = (input: {
    request: HistoryAnalysisRequest;
    packets: HistoricalNarrativeSourcePacket[];
    promptVersion: string;
    outputSchemaVersion: string;
    result: HistoricalNarrativeExtractionResult;
}): string[] => {
    const errors = validateHistoryAnalysisRequest(input.request);
    if (input.packets.length < 1) errors.push('historical narrative extraction needs at least one source packet');
    input.packets.forEach(packet => {
        errors.push(...validateHistoricalNarrativeSourcePacket(packet, input.request.scope));
    });
    const { receipt } = input.result;
    errors.push(...validateHistoricalNarrativeExtractionReceipt(receipt));
    if (receipt.promptVersion !== input.promptVersion) errors.push('extraction receipt promptVersion mismatch');
    if (receipt.outputSchemaVersion !== input.outputSchemaVersion) {
        errors.push('extraction receipt outputSchemaVersion mismatch');
    }
    if (receipt.requestId !== input.request.id) errors.push('extraction receipt requestId mismatch');
    if (!scopesMatch(receipt.scope, input.request.scope)) errors.push('extraction receipt crosses request scope');
    if (receipt.sourceRevisionFingerprint !== input.request.sourceRevisionFingerprint) {
        errors.push('extraction receipt source revision fingerprint mismatch');
    }
    if (receipt.status !== input.result.status) errors.push('extraction receipt status mismatch');
    const packetTurnCount = input.packets.reduce((total, packet) => total + packet.turns.length, 0);
    const packetCharCount = input.packets.reduce((total, packet) => total + packet.inputCharCount, 0);
    if (receipt.usage.packetCount !== input.packets.length) errors.push('extraction usage packetCount mismatch');
    if (receipt.usage.sourceTurnCount !== packetTurnCount) errors.push('extraction usage sourceTurnCount mismatch');
    if (receipt.usage.inputCharCount !== packetCharCount) errors.push('extraction usage inputCharCount mismatch');

    if (input.result.status === 'failed') {
        return errors;
    }

    const { pass, bindings } = input.result;
    errors.push(...validateHistoryAnalysisPass(pass));
    if (pass.requestId !== input.request.id) errors.push('extraction pass requestId mismatch');
    if (!scopesMatch(pass.scope, input.request.scope)) errors.push('extraction pass crosses request scope');
    if (pass.sourceRevisionFingerprint !== input.request.sourceRevisionFingerprint) {
        errors.push('extraction pass source revision fingerprint mismatch');
    }
    if (receipt.passId !== pass.id) errors.push('completed extraction receipt passId mismatch');
    if (receipt.analysisRunId !== pass.analysisRunId) errors.push('extraction receipt analysisRunId mismatch');
    passDerivedEntities(pass).forEach(entity => {
        if (entity.extractorVersion !== receipt.extractorVersion) {
            errors.push(`extraction receipt extractorVersion mismatch for ${entity.id}`);
        }
    });
    const packetSourceRefs = input.packets.flatMap(packet => packet.sourceRefs);
    passSourceRefs(pass).forEach((sourceRef, index) => {
        if (!packetSourceRefs.some(packetRef => sourceRefContains(packetRef, sourceRef))) {
            errors.push(`extraction pass sourceRef[${index}] is outside selected packets`);
        }
    });
    const entityIds = passEntityIds(pass);
    bindings.forEach(binding => {
        errors.push(...validateHistoryEvidenceBinding(binding));
        if (!scopesMatch(binding.scope, input.request.scope)) errors.push(`binding ${binding.id} crosses request scope`);
        if (binding.origin !== 'analysis' || binding.analysisPassId !== pass.id) {
            errors.push(`binding ${binding.id} must belong to the completed analysis pass`);
        }
        if (!entityIds.has(binding.targetId)) errors.push(`binding ${binding.id} points outside completed pass`);
        if (!packetSourceRefs.some(packetRef => sourceRefContains(packetRef, binding.sourceRef))) {
            errors.push(`binding ${binding.id} sourceRef is outside selected packets`);
        }
    });
    const bindingIds = bindings.map(binding => binding.id).sort();
    if (JSON.stringify([...receipt.bindingIds].sort()) !== JSON.stringify(bindingIds)) {
        errors.push('completed extraction receipt bindingIds mismatch');
    }
    return errors;
};
