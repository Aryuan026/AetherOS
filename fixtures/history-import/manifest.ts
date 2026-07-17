export const HISTORY_IMPORT_FIXTURE_MANIFEST_VERSION = 1 as const;

export type HistoryImportAcceptanceGate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
export type HistoryImportFixtureKind =
    | 'source_text'
    | 'source_docx'
    | 'state'
    | 'scale'
    | 'failure'
    | 'memory_quality'
    | 'backup'
    | 'vector';
export type HistoryImportFixtureAvailability =
    | 'contract_ready'
    | 'generator_ready'
    | 'generator_planned'
    | 'awaiting_sanitized_shape';

export interface HistoryImportFixtureDefinition {
    id: string;
    gate: HistoryImportAcceptanceGate;
    kind: HistoryImportFixtureKind;
    description: string;
    targetRecordCount?: number;
    requiredAssertions: string[];
    availability: HistoryImportFixtureAvailability;
    containsPersonalData: false;
    commitPolicy: 'synthetic_only';
}

export const HISTORY_IMPORT_FIXTURE_MANIFEST: HistoryImportFixtureDefinition[] = [
    {
        id: 'txt_basic_zh',
        gate: 'G1',
        kind: 'source_text',
        description: 'Alternating synthetic user/character lines with exact timestamps.',
        requiredAssertions: ['deterministic_order', 'speaker_mapping', 'exact_time_round_trip'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'txt_ambiguous_zh',
        gate: 'G1',
        kind: 'source_text',
        description: 'Wrapped lines, missing speakers/times, emoji, and synthetic OOC notes.',
        requiredAssertions: ['uncertainty_preserved', 'no_forced_speaker', 'no_invented_time'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'docx_export_like',
        gate: 'G1',
        kind: 'source_docx',
        description: 'Synthetic DOCX paragraphs/table plus paid-export-like assistant/user blocks followed by timestamp metadata; no real source file is committed.',
        requiredAssertions: ['paragraph_locator', 'format_adapter_parity', 'timestamp_metadata_attached', 'no_private_source_commit'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'ordering_old_plus_live',
        gate: 'G2',
        kind: 'state',
        description: 'Old imported turns and a later live turn with deliberately inverted insertion times.',
        requiredAssertions: ['source_time_wins', 'live_tail_preserved', 'no_false_unread'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'two_masks_same_character',
        gate: 'G0',
        kind: 'state',
        description: 'Two progress bundles point to one character id and must remain isolated.',
        requiredAssertions: ['scope_key_differs', 'zero_cross_scope_reads', 'zero_cross_scope_deletes'],
        availability: 'contract_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'duplicate_and_overlap',
        gate: 'G2',
        kind: 'state',
        description: 'One exact duplicate batch and one partially overlapping synthetic export.',
        requiredAssertions: ['exact_duplicate_idempotent', 'near_match_reviewed', 'stable_ids'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'large_50k_text',
        gate: 'G2',
        kind: 'scale',
        description: 'Generated 50,000-turn text archive with varied synthetic message lengths.',
        targetRecordCount: 50_000,
        requiredAssertions: ['bounded_transactions', 'cursor_paging', 'pause_within_budget'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'quota_interrupt',
        gate: 'G0',
        kind: 'failure',
        description: 'Injected quota/write failure after a deterministic chunk boundary.',
        requiredAssertions: ['no_partial_complete_batch', 'retry_available', 'cursor_consistent'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'reload_mid_import',
        gate: 'G2',
        kind: 'failure',
        description: 'Synthetic app reload during import and digest checkpoints.',
        requiredAssertions: ['resume_idempotent', 'monotonic_progress', 'same_final_hash'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'branch_ooc_reality_mix',
        gate: 'G3',
        kind: 'memory_quality',
        description: 'Synthetic relationship, roleplay, IF, OOC, and reality claims in one source.',
        requiredAssertions: ['continuity_separated', 'branch_isolated', 'ooc_not_relationship_truth'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'private_surface_secret',
        gate: 'G3',
        kind: 'memory_quality',
        description: 'Synthetic private event that is forbidden from group/public surfaces.',
        requiredAssertions: ['policy_before_prompt', 'zero_forbidden_prompt_text', 'receipt_has_no_raw_secret'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'contradiction_over_time',
        gate: 'G3',
        kind: 'memory_quality',
        description: 'Synthetic earlier preference or state later revoked and replaced.',
        requiredAssertions: ['history_preserved', 'supersession_linked', 'current_state_selected'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'companionship_no_plot',
        gate: 'G4',
        kind: 'memory_quality',
        description: 'Routine affection and companionship with no evidenced narrative delta.',
        requiredAssertions: ['no_plot_success', 'zero_accepted_plot_delta', 'companion_texture_allowed'],
        availability: 'contract_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'relationship_milestone',
        gate: 'G4',
        kind: 'memory_quality',
        description: 'Synthetic, evidenced relationship-state transition.',
        requiredAssertions: ['before_after_required', 'source_span_required', 'review_required'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'plot_positive',
        gate: 'G4',
        kind: 'memory_quality',
        description: 'Synthetic goal, obstacle, choice, consequence, and open-thread sequence.',
        requiredAssertions: ['evidenced_delta', 'no_offscreen_invention', 'branch_scope_preserved'],
        availability: 'contract_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'missing_media',
        gate: 'G1',
        kind: 'source_text',
        description: 'Synthetic image, voice, and sticker placeholders without payload.',
        requiredAssertions: ['placeholder_preserved', 'no_media_invention', 'source_label_retained'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'backup_all_history_stores',
        gate: 'G0',
        kind: 'backup',
        description: 'Every irreplaceable history family, tag alias, correction, and tombstone.',
        requiredAssertions: ['credential_exclusion', 'encrypted_payload', 'exact_restore_counts'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'corrupt_rescue_archive',
        gate: 'G0',
        kind: 'backup',
        description: 'Synthetic changed section hash, broken reference, and wrong recovery secret.',
        requiredAssertions: ['reject_before_switch', 'live_db_unchanged', 'rollback_preserved'],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'rescue_delivery_cancel',
        gate: 'G0',
        kind: 'backup',
        description: 'Synthetic browser picker/download and native Cache-share success, cancellation, and failure.',
        requiredAssertions: [
            'cache_not_external_copy',
            'cancel_not_saved',
            'secret_not_in_receipt',
            'restore_requires_secret_handoff',
        ],
        availability: 'generator_ready',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
    {
        id: 'vector_backfill',
        gate: 'G5',
        kind: 'vector',
        description: 'Synthetic missing, stale, failed, and mixed-version embedding slots.',
        requiredAssertions: ['stable_ids', 'no_reparse', 'lexical_fallback'],
        availability: 'generator_planned',
        containsPersonalData: false,
        commitPolicy: 'synthetic_only',
    },
];
