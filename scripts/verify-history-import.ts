export {};

const verificationModules = [
    './verify-history-import-contract.ts',
    './verify-history-import-jobs.ts',
    './verify-history-import-storage-health.ts',
    './verify-history-import-rescue.ts',
    './verify-history-import-indexeddb-contract.ts',
    './verify-history-import-delivery.ts',
    './verify-history-import-rehearsal.ts',
    './verify-history-import-identity.ts',
    './verify-history-import-preview.ts',
    './verify-history-import-intake-workspace.ts',
    './verify-history-import-archive.ts',
    './verify-history-import-chat.ts',
    './verify-history-analysis-foundation.ts',
    './verify-history-companion-analysis-packets.ts',
    './verify-history-companion-packet-authority.ts',
    './verify-history-companion-analysis-prompt.ts',
    './verify-history-companion-bounded-batches.ts',
    './verify-history-companion-analysis-review.ts',
    './verify-history-companion-independent-adjudication.ts',
    './verify-history-companion-activation-authority.ts',
    './verify-history-companion-material.ts',
    './verify-history-companion-publish-freshness.ts',
    './verify-history-companion-runtime-analysis.ts',
    './verify-historical-reuse-selector.ts',
    './verify-daily-archive.ts',
] as const;

for (const verificationModule of verificationModules) {
    await import(verificationModule);
}

console.log('history import v2 clean intake and local activation contract OK');
