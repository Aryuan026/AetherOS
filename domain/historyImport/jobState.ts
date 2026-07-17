import {
    HISTORY_IMPORT_SCHEMA_VERSION,
    validateHistoryScope,
} from './contract.ts';
import type {
    HistoryBatchId,
    HistoryJob,
    HistoryJobChunkCheckpoint,
    HistoryJobId,
    HistoryJobKind,
    HistoryScope,
} from './types.ts';

export interface CreateHistoryJobInput {
    id: HistoryJobId;
    kind: HistoryJobKind;
    scope: HistoryScope;
    batchId?: HistoryBatchId;
    totalCount: number;
    inputVersion: string;
    outputVersion: string;
}

export interface FailHistoryJobInput {
    code: string;
    message: string;
}

const isNonEmpty = (value: string | undefined): boolean => Boolean(value?.trim());

const assertTimestamp = (now: number): void => {
    if (!Number.isFinite(now) || !Number.isInteger(now) || now < 0) {
        throw new Error('history job timestamp must be a non-negative integer');
    }
};

const assertTransitionTime = (job: HistoryJob, now: number): void => {
    assertTimestamp(now);
    if (now < job.updatedAt) {
        throw new Error('history job timestamp must not move backwards');
    }
};

const assertNonNegativeInteger = (value: number, label: string): void => {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative integer`);
    }
};

const nextRevision = (job: HistoryJob, now: number): Pick<HistoryJob, 'revision' | 'updatedAt'> => ({
    revision: job.revision + 1,
    updatedAt: now,
});

const assertStatus = (job: HistoryJob, allowed: HistoryJob['status'][], action: string): void => {
    if (!allowed.includes(job.status)) {
        throw new Error(`cannot ${action} history job from ${job.status}`);
    }
};

export const createHistoryJob = (input: CreateHistoryJobInput, now: number): HistoryJob => {
    assertTimestamp(now);
    const scopeErrors = validateHistoryScope(input.scope);
    if (scopeErrors.length > 0) throw new Error(scopeErrors.join('; '));
    if (!isNonEmpty(input.id)) throw new Error('history job id is required');
    if (!isNonEmpty(input.inputVersion)) throw new Error('history job inputVersion is required');
    if (!isNonEmpty(input.outputVersion)) throw new Error('history job outputVersion is required');
    assertNonNegativeInteger(input.totalCount, 'history job totalCount');

    return {
        schemaVersion: HISTORY_IMPORT_SCHEMA_VERSION,
        id: input.id,
        kind: input.kind,
        scope: { ...input.scope },
        batchId: input.batchId,
        status: 'queued',
        cursor: {
            processedCount: 0,
            totalCount: input.totalCount,
        },
        inputVersion: input.inputVersion,
        outputVersion: input.outputVersion,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        revision: 1,
    };
};

export const startHistoryJob = (job: HistoryJob, now: number): HistoryJob => {
    assertTransitionTime(job, now);
    if (job.status === 'running') return job;
    assertStatus(job, ['queued'], 'start');
    return {
        ...job,
        status: 'running',
        attempts: job.attempts + 1,
        ...nextRevision(job, now),
    };
};

export const pauseHistoryJob = (job: HistoryJob, now: number): HistoryJob => {
    assertTransitionTime(job, now);
    if (job.status === 'paused') return job;
    assertStatus(job, ['running'], 'pause');
    return {
        ...job,
        status: 'paused',
        ...nextRevision(job, now),
    };
};

export const resumeHistoryJob = (job: HistoryJob, now: number): HistoryJob => {
    assertTransitionTime(job, now);
    if (job.status === 'running') return job;
    assertStatus(job, ['paused'], 'resume');
    return {
        ...job,
        status: 'running',
        ...nextRevision(job, now),
    };
};

const isSameCommittedCheckpoint = (
    job: HistoryJob,
    checkpoint: HistoryJobChunkCheckpoint,
): boolean => (
    job.cursor.lastChunkIdempotencyKey === checkpoint.idempotencyKey
    && job.cursor.lastChunkFromProcessedCount === checkpoint.fromProcessedCount
    && job.cursor.processedCount === checkpoint.toProcessedCount
    && job.cursor.lastSourceOrder === (checkpoint.lastSourceOrder ?? job.cursor.lastSourceOrder)
    && job.cursor.lastSourceMessageId === (checkpoint.lastSourceMessageId ?? job.cursor.lastSourceMessageId)
    && job.cursor.checkpointHash === checkpoint.checkpointHash
);

export const commitHistoryJobChunk = (
    job: HistoryJob,
    checkpoint: HistoryJobChunkCheckpoint,
    now: number,
): HistoryJob => {
    assertTransitionTime(job, now);
    assertStatus(job, ['running'], 'commit a chunk to');
    if (!isNonEmpty(checkpoint.idempotencyKey)) {
        throw new Error('history chunk idempotencyKey is required');
    }
    if (!isNonEmpty(checkpoint.checkpointHash)) {
        throw new Error('history chunk checkpointHash is required');
    }
    assertNonNegativeInteger(checkpoint.fromProcessedCount, 'history chunk fromProcessedCount');
    assertNonNegativeInteger(checkpoint.toProcessedCount, 'history chunk toProcessedCount');
    if (checkpoint.lastSourceOrder !== undefined) {
        assertNonNegativeInteger(checkpoint.lastSourceOrder, 'history chunk lastSourceOrder');
    }

    if (job.cursor.lastChunkIdempotencyKey === checkpoint.idempotencyKey) {
        if (isSameCommittedCheckpoint(job, checkpoint)) return job;
        throw new Error('history chunk idempotency conflict');
    }
    if (checkpoint.fromProcessedCount !== job.cursor.processedCount) {
        throw new Error('history chunk must continue from the durable processedCount');
    }
    if (checkpoint.toProcessedCount <= checkpoint.fromProcessedCount) {
        throw new Error('history chunk must advance processedCount');
    }
    if (checkpoint.toProcessedCount > job.cursor.totalCount) {
        throw new Error('history chunk cannot exceed totalCount');
    }
    if (
        checkpoint.lastSourceOrder !== undefined
        && job.cursor.lastSourceOrder !== undefined
        && checkpoint.lastSourceOrder < job.cursor.lastSourceOrder
    ) {
        throw new Error('history chunk lastSourceOrder must not move backwards');
    }

    return {
        ...job,
        cursor: {
            ...job.cursor,
            processedCount: checkpoint.toProcessedCount,
            lastSourceOrder: checkpoint.lastSourceOrder ?? job.cursor.lastSourceOrder,
            lastSourceMessageId: checkpoint.lastSourceMessageId ?? job.cursor.lastSourceMessageId,
            lastChunkIdempotencyKey: checkpoint.idempotencyKey,
            lastChunkFromProcessedCount: checkpoint.fromProcessedCount,
            checkpointHash: checkpoint.checkpointHash,
        },
        ...nextRevision(job, now),
    };
};

export const completeHistoryJob = (job: HistoryJob, now: number): HistoryJob => {
    assertTransitionTime(job, now);
    if (job.status === 'completed') return job;
    assertStatus(job, ['running'], 'complete');
    if (job.cursor.processedCount !== job.cursor.totalCount) {
        throw new Error('history job cannot complete before every record is processed');
    }
    return {
        ...job,
        status: 'completed',
        completedAt: now,
        ...nextRevision(job, now),
    };
};

export const failHistoryJob = (
    job: HistoryJob,
    failure: FailHistoryJobInput,
    now: number,
): HistoryJob => {
    assertTransitionTime(job, now);
    assertStatus(job, ['running'], 'fail');
    if (!isNonEmpty(failure.code)) throw new Error('history job failure code is required');
    if (!isNonEmpty(failure.message)) throw new Error('history job failure message is required');
    return {
        ...job,
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.message,
        ...nextRevision(job, now),
    };
};

export const retryHistoryJob = (job: HistoryJob, now: number): HistoryJob => {
    assertTransitionTime(job, now);
    assertStatus(job, ['failed'], 'retry');
    const {
        errorCode: _errorCode,
        errorMessage: _errorMessage,
        ...jobWithoutError
    } = job;
    return {
        ...jobWithoutError,
        status: 'queued',
        ...nextRevision(job, now),
    };
};

export const cancelHistoryJob = (job: HistoryJob, now: number): HistoryJob => {
    assertTransitionTime(job, now);
    if (job.status === 'cancelled') return job;
    assertStatus(job, ['queued', 'running', 'paused', 'failed'], 'cancel');
    return {
        ...job,
        status: 'cancelled',
        ...nextRevision(job, now),
    };
};
