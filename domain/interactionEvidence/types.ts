import type { HistoryScope } from '../historyImport/types.ts';

export const INTERACTION_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type InteractionSurface =
    | 'history_import'
    | 'chat'
    | 'date'
    | 'call'
    | 'social'
    | 'group_chat'
    | 'journal'
    | 'proactive'
    | 'other';

export type InteractionMedium =
    | 'remote_text'
    | 'mixed_text'
    | 'embodied_scene'
    | 'voice_call'
    | 'social'
    | 'diary'
    | 'other';

export type InteractionProducer = 'user' | 'model' | 'system' | 'import' | 'manual';

export type InteractionTransportRole =
    | 'user_channel'
    | 'assistant_channel'
    | 'system_channel'
    | 'unknown';

export type InteractionEvidenceStatus = 'active' | 'superseded' | 'tombstoned';

export interface InteractionSourceRef {
    storeFamily: string;
    recordId: string;
    revision: number;
}

export interface InteractionEvidence {
    schemaVersion: typeof INTERACTION_EVIDENCE_SCHEMA_VERSION;
    evidenceId: string;
    scope: HistoryScope;
    temporalClass: 'historical' | 'live';
    source: {
        surface: InteractionSurface;
        medium: InteractionMedium;
        storeFamily: string;
        recordId: string;
        revision: number;
        status: InteractionEvidenceStatus;
        previousRevisionRef?: InteractionSourceRef;
    };
    /** Transport channel only. In-world NPC identity belongs to interpretation. */
    transportRole: InteractionTransportRole;
    producer: InteractionProducer;
    content: {
        kind: 'text' | 'image' | 'audio' | 'interaction' | 'mixed';
        ref: InteractionSourceRef;
        hash?: string;
        charCount?: number;
    };
    time: {
        recordedAt: string;
        occurredAt?: string;
        virtualTimeRef?: InteractionSourceRef;
    };
    correlation: {
        interactionId: string;
        turnId?: string;
        responseId?: string;
        parentEvidenceIds?: readonly string[];
        sequence: number;
    };
}

/** A multi-record analysis unit. Source records and revisions remain atomic. */
export interface EvidenceSpan {
    schemaVersion: typeof INTERACTION_EVIDENCE_SCHEMA_VERSION;
    scope: HistoryScope;
    evidenceIds: readonly string[];
    sourceRevisionFingerprint: string;
}
