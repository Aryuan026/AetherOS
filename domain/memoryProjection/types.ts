import type { HistoryScope } from '../historyImport/types.ts';
import type { PromotedMemoryRecord } from '../memoryInterpretation/types.ts';

export const MEMORY_PROJECTION_SCHEMA_VERSION = 1 as const;

export type MemoryProjectionAction = 'edit' | 'hide' | 'restore';

export interface MemoryProjectionPatch {
    title?: string;
    summary?: string;
    happenedAt?: string;
    mood?: string | null;
}
export interface MemoryProjectionCommand {
    schemaVersion: typeof MEMORY_PROJECTION_SCHEMA_VERSION;
    id: string;
    scope: HistoryScope;
    targetRecordId: string;
    expectedSourceRevisionFingerprint: string;
    action: MemoryProjectionAction;
    patch?: MemoryProjectionPatch;
    requestedAt: number;
}

export interface MemoryProjectionReceipt {
    schemaVersion: typeof MEMORY_PROJECTION_SCHEMA_VERSION;
    id: string;
    commandId: string;
    scope: HistoryScope;
    targetRecordId: string;
    expectedSourceRevisionFingerprint: string;
    action: MemoryProjectionAction;
    patch?: MemoryProjectionPatch;
    status: 'applied' | 'rejected';
    /** Projection corrections never rewrite source evidence or promoted truth. */
    truthEffect: 'none';
    revision?: number;
    reason?: string;
    createdAt: number;
}

export interface MemoryProjectionView<TRecord extends PromotedMemoryRecord = PromotedMemoryRecord> {
    record: TRecord;
    display: {
        title: string;
        summary: string;
        happenedAt?: string;
        mood?: string;
    };
    hidden: boolean;
    revision: number;
    lastReceiptId?: string;
}

export interface MemoryProjectionCommitResult {
    outcome: 'committed' | 'existing_command';
    receipt: MemoryProjectionReceipt;
}

export interface MemoryProjectionStorePort {
    listReceipts(scope: HistoryScope): Promise<MemoryProjectionReceipt[]>;
    commit(receipt: MemoryProjectionReceipt): Promise<MemoryProjectionCommitResult>;
}

export interface MemoryProjectionResult {
    outcome: 'applied' | 'rejected' | 'duplicate';
    receipt: MemoryProjectionReceipt;
    view?: MemoryProjectionView;
}
