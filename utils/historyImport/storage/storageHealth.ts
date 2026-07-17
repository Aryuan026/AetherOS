import type {
    HistoryStorageEstimateState,
    HistoryStorageHealthIssueCode,
    HistoryStorageHealthSnapshot,
    HistoryStoragePersistenceState,
} from '../../../domain/historyImport/storageHealth.ts';

export interface HistoryStorageEstimateLike {
    usage?: number;
    quota?: number;
}

export interface HistoryStorageManagerLike {
    persisted?: () => Promise<boolean>;
    persist?: () => Promise<boolean>;
    estimate?: () => Promise<HistoryStorageEstimateLike>;
}

export interface HistoryStorageEnvironment {
    storage?: HistoryStorageManagerLike;
    userActivation?: {
        isActive: boolean;
    };
}

export interface ReadHistoryStorageHealthOptions {
    environment?: HistoryStorageEnvironment;
    measuredAt?: number;
}

export type HistoryPersistenceRequestStatus =
    | 'granted'
    | 'denied'
    | 'unsupported'
    | 'user_gesture_required'
    | 'failed';

export interface HistoryPersistenceRequestResult {
    requestedAt: number;
    status: HistoryPersistenceRequestStatus;
    persistenceState: HistoryStoragePersistenceState;
    issueCode?: 'persistence_request_failed';
}

export interface RequestHistoryStoragePersistenceOptions {
    userGestureConfirmed: boolean;
    environment?: HistoryStorageEnvironment;
    requestedAt?: number;
}

const getDefaultEnvironment = (): HistoryStorageEnvironment | undefined => {
    if (typeof navigator === 'undefined') return undefined;
    return {
        storage: navigator.storage,
        userActivation: navigator.userActivation
            ? { isActive: navigator.userActivation.isActive }
            : undefined,
    };
};

const isValidByteCount = (value: number | undefined): value is number => (
    value !== undefined
    && Number.isSafeInteger(value)
    && value >= 0
);

export const readHistoryStorageHealth = async (
    options: ReadHistoryStorageHealthOptions = {},
): Promise<HistoryStorageHealthSnapshot> => {
    const measuredAt = options.measuredAt ?? Date.now();
    const environment = options.environment ?? getDefaultEnvironment();
    const storage = environment?.storage;
    if (!storage) {
        return {
            measuredAt,
            persistenceState: 'unsupported',
            estimateState: 'unsupported',
            issueCodes: ['storage_api_unavailable'],
        };
    }

    const issueCodes: HistoryStorageHealthIssueCode[] = [];
    let persistenceState: HistoryStoragePersistenceState = 'unsupported';
    if (storage.persisted) {
        try {
            persistenceState = await storage.persisted() ? 'persistent' : 'best_effort';
        } catch {
            persistenceState = 'unknown';
            issueCodes.push('persistence_query_failed');
        }
    }

    let estimateState: HistoryStorageEstimateState = 'unsupported';
    let usageBytes: number | undefined;
    let quotaBytes: number | undefined;
    if (!storage.estimate) {
        issueCodes.push('estimate_api_unavailable');
    } else {
        try {
            const estimate = await storage.estimate();
            if (isValidByteCount(estimate.usage) && isValidByteCount(estimate.quota)) {
                estimateState = 'available';
                usageBytes = estimate.usage;
                quotaBytes = estimate.quota;
            } else {
                estimateState = 'unavailable';
                issueCodes.push('estimate_incomplete');
            }
        } catch {
            estimateState = 'error';
            issueCodes.push('estimate_query_failed');
        }
    }

    return {
        measuredAt,
        persistenceState,
        estimateState,
        usageBytes,
        quotaBytes,
        issueCodes,
    };
};

export const requestHistoryStoragePersistence = async (
    options: RequestHistoryStoragePersistenceOptions,
): Promise<HistoryPersistenceRequestResult> => {
    const requestedAt = options.requestedAt ?? Date.now();
    const environment = options.environment ?? getDefaultEnvironment();
    const persist = environment?.storage?.persist;
    if (!persist) {
        return {
            requestedAt,
            status: 'unsupported',
            persistenceState: 'unsupported',
        };
    }
    if (!options.userGestureConfirmed || environment?.userActivation?.isActive === false) {
        return {
            requestedAt,
            status: 'user_gesture_required',
            persistenceState: 'unknown',
        };
    }
    try {
        const granted = await persist.call(environment.storage);
        return {
            requestedAt,
            status: granted ? 'granted' : 'denied',
            persistenceState: granted ? 'persistent' : 'best_effort',
        };
    } catch {
        return {
            requestedAt,
            status: 'failed',
            persistenceState: 'unknown',
            issueCode: 'persistence_request_failed',
        };
    }
};
