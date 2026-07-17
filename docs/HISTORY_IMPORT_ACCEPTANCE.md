# AetherOS Historical Conversation Import — Acceptance Contract

Status: working acceptance baseline; Stage 1.4 direct local activation implemented

Last updated: 2026-07-16

Execution plan: `docs/HISTORY_IMPORT_EXECUTION_PLAN.md`

This contract defines the evidence required to move historical-conversation
import from one implementation stage to the next. A feature is not accepted
because a happy-path demo worked once. It is accepted when its deterministic
tests, browser behavior, privacy boundary, recovery path, and visible user state
agree.

## Acceptance Principles

1. Correctness, scope isolation, privacy, and recoverability are hard gates.
   Performance or model quality cannot trade them away.
2. “No result” is valid for uncertain parsing, unrelated recall, and plot
   extraction. Forced output is a failure.
3. A backup claiming verified recoverability is not valid until a restore is
   verified; making such a backup is not a prerequisite for ordinary import.
4. A model proposal is not durable truth until deterministic validation and the
   required review/apply gate pass.
5. The committed test corpus is synthetic and non-personal. Real exports remain
   local and are reduced to structural synthetic fixtures before repository use.
6. Initial performance budgets are measured on a named reference browser/device.
   They may be recalibrated after the first benchmark, but correctness gates may
   not be silently weakened.

## Required Evidence Bundle Per Gate

Every gate closure records:

- exact commit or working-tree patch scope;
- schema/archive/extractor version under test;
- deterministic verifier command and output;
- fixture manifest and expected counts;
- canonical-browser result at `http://127.0.0.1:5174/`;
- screenshots or trace for user-facing flows when applicable;
- storage usage and timing summary for large-fixture gates;
- backup/restore receipt when a backup or restore path is under test, not for an
  ordinary copy-on-write import;
- known limitations and explicit HOLD items;
- dated `progress.md` entry.

Planned verifier commands:

```bash
npm run verify:history-import
npm run verify:history-memory
npm run verify:health
```

`verify:history-import` covers the Stage 0.1 contract and manifest invariants,
Stage 0.2 immutable job transitions/checkpoint idempotency, lossless paused-job
serialization, deterministic normalized fixture generation, and a streamed
50,000-message uniqueness/validity pass. The Stage 0.3 headless extension verifies
truthful Storage API capability/grant states, user-gesture-only persistence
requests, versioned size projection, reserved headroom, ready/warning/blocked/
unknown preflight, durability-level separation, and quota-error recovery shape.
The Stage 0.4 headless extension now verifies an explicit eight-store encrypted
carrier, recursive provider-credential exclusion, omission of rebuildable
vectors, independently authenticated at-most-500-record AES-GCM chunks,
per-section/chunk counts/hashes/stable ids, cross-store references,
wrong-secret/tamper rejection, and an exact two-phase temporary-restore
comparison. It still does not claim external file
save, native share completion, actual temporary IndexedDB writes, or live-
database rollback. The Stage 0.5 extension adds a static isolated-DB contract to
that command plus a reusable real-Chromium harness: 1,201 rows commit as
`500 + 500 + 201`; quota/abort/conflict paths roll back rows and cursor; reload
resumes from durable cursor 500; cursor pages stay within 137; wrong-secret and
incomplete real temporary restores reject; a second temporary DB restores and
verifies exactly 1,201 records while the synthetic live digest remains unchanged.
It still does not claim external file save, native share completion, production
database migration/switch, or the G2 50,000-row browser/device budget.
The Stage 0.6 extension adds immutable delivery/secret/restore receipt
transitions, browser picker/download adapters, a pinned Capacitor Cache-share-
delete adapter, and a synthetic browser/native cancellation fixture. A closed
file-picker write can confirm a user file; anchor download and resolved share
remain confirmation-required; cancellation/failure cannot create an external
copy; clipboard success cannot claim the recovery secret is safely held; and
restore verification requires the confirmed copy plus user-confirmed secret.
Real Chromium captured a successful synthetic `.aetherrescue` download event
while the app correctly returned `confirmation_required` and reported zero
console errors. Native-device UI/runtime evidence is still pending.
The Stage 0.8 extension adds a visible empty-carrier rehearsal. It presents the
secret once, requires explicit external-save confirmation, then requires the
same downloaded file to be selected back into the app before an isolated
temporary restore may promote the receipt. The deterministic verifier also
rejects a different rehearsal file and a wrong secret. This is product-UI
evidence for truthful state transitions, not evidence that real history is
already exportable or that a controlled production database switch exists.
The Stage 1.0 extension adds bounded built-in TXT and DOCX adapters plus one
shared read-only preview model. Generic synthetic paragraph/table DOCX and TXT
normalize to the same semantic rows; repeated parses are deterministic; the
browser displays counts, speakers, issues, original text, and line/paragraph/
table-cell locators without a network or durable write path. Real exporter
shapes still require local calibration, and mapping/correction controls remain
open.
The Stage 1.1 extension adds one review contract and surface shared by TXT and
DOCX. It requires explicit speaker mappings and metadata confirmation, exposes
pending/all/included/excluded filters, permits row correction/exclusion, allows
wrapped-line merge only after an explicit click to the validated preceding
source row, and freezes a deterministic deeply immutable decision. Replacing
the source file clears that decision. The decision is still page-memory-only;
truncated input is labeled `materialized_prefix`, not whole-file authority.
The visible shell was subsequently corrected to match human import order:
identity -> file -> review. Identity confirmation and the following file action
both fit the first 430x932 viewport; parsed rows appear only in the review
surface; persistence is a collapsed, non-blocking explanation; G0 diagnostics
and rescue rehearsal are absent from the primary route; and no disabled fake
import button is shown. The unfinished durable-write boundary is disclosed
before the user starts, not after several screens.
The Stage 1.2 extension replaces the route's prefix-only review with a
disposable two-store IndexedDB workspace. All normalized rows persist in strict
500-row chunks; UI pages read ten rows; mappings and row decisions survive
refresh; and full completion hashes every row in deterministic 500-row decision
chunks while remaining `productionWriteAllowed=false`. A 1,201-row fixture
survived paging, OS refresh, App reopen, and three-chunk freeze in canonical
Chromium. A separate 50,000-row / 2.9 MiB capacity run persisted exactly 50,000
rows, rendered ten cards, used about 52 MiB JS heap after completion, and left
the fresh origin at about 46.5 MiB usage. Lower-end phone evidence and the
broader ambiguity/export fixture matrix remain open.
The Stage 1.3 extension adds the first real-history activation path. Accepted
review rows commit to an inactive eight-store candidate in at-most-500-message
transactions; an encrypted rescue with a user-held, non-persisted secret must be
downloaded and selected back; a distinct restore slot must reproduce the
manifest/counts before the active pointer may change. Canonical Chromium proved
both a four-message round trip and a second 1,201-message round trip. The final
active image held exactly 1,205 messages / two batches / two completed jobs,
retained the prior active restore slot, rejected active-slot deletion, and
restored the duplicate state after refresh. Timeline/search and the remaining
G2 lifecycle/performance rows are still open.
The Stage 1.4 correction separates that proven backup machinery from intake.
The import UI now count-verifies and activates its inactive local candidate
directly, with no recovery secret, encrypted download, or immediate restore
rehearsal. The encrypted coordinator remains tested under `utils/systemBackup/`
for a later optional backup/export phase. Existing ordinary Settings ZIP export
remains password-free and local; cloud sync and device-recognized encrypted
restore are explicitly outside the current input gate.
Canonical 430x932 Chromium then imported three accepted messages without any
secret or file handoff. The control record used `activationKind=import_commit`,
contained no backup receipt, and survived a full reload/App reopen as an
explicit already-imported state. The Settings surface separately stated that
ordinary whole-device ZIP needs no password and is not automatically uploaded.
`verify:history-memory` remains planned for later retrieval and projection
fixtures. No gate may cite an ad-hoc console check as their permanent
replacement.

## Synthetic Fixture Matrix

| Fixture id | Shape | Primary risk covered |
| --- | --- | --- |
| `txt_basic_zh` | alternating user/character lines with exact timestamps | baseline normalization |
| `txt_ambiguous_zh` | wrapped lines, missing speakers/times, emoji, OOC notes | uncertainty preservation |
| `docx_export_like` | synthetic paragraphs matching the sanitized friend-export shape | DOCX adapter fidelity |
| `ordering_old_plus_live` | old imported turns plus newer live turns | source time vs insertion time |
| `two_masks_same_character` | same `charId`, two progress bundles, overlapping names/dates | scope isolation |
| `duplicate_and_overlap` | exact duplicate file plus partially overlapping export | idempotency and review |
| `large_50k_text` | generated 50,000-turn text archive with varied lengths | paging, memory pressure, resume |
| `quota_interrupt` | injected quota/write failure after a known chunk | rollback and retry |
| `reload_mid_import` | app reload during parsing/write/digest stages | durable cursor semantics |
| `branch_ooc_reality_mix` | relationship chat, roleplay, IF branch, OOC and reality claims | continuity separation |
| `private_surface_secret` | private event forbidden in group/public surfaces | hard delivery policy |
| `contradiction_over_time` | an old preference/state later revoked or replaced | temporal supersession |
| `companionship_no_plot` | routine affection and daily companionship without state delta | false plot prevention |
| `relationship_milestone` | evidenced relationship-state transition | milestone extraction |
| `plot_positive` | goal, obstacle, choice, consequence and open thread | true plot extraction |
| `missing_media` | image/voice/sticker placeholders without payload | no invented attachment content |
| `backup_all_history_stores` | every new record family, tombstone, review and tag alias | backup completeness |
| `corrupt_rescue_archive` | changed section hash and broken reference | non-destructive restore rejection |
| `rescue_delivery_cancel` | picker/download/native success, cancellation and Cache cleanup | truthful external-save receipt |
| `vector_backfill` | events with no vectors, stale vectors and mixed versions | stable-id rebuild |

The first friend-provided DOCX is not itself a committed fixture. Acceptance
records only the structural properties needed to make `docx_export_like`
representative.

## Global Hard Gates

The following conditions apply to every stage after their data exists:

| Gate | Required result |
| --- | --- |
| scope | zero reads, writes, search hits, prompt cards, deletion effects, or restore merges across `progressBundleId + charId` |
| provenance | every event/projection hit can resolve to existing source message ids/spans or is visibly stale/discarded |
| privacy | zero raw or derived forbidden content appears in a disallowed surface prompt |
| recoverability | exact irreplaceable-record counts and stable ids survive verified restore |
| secrets | default rescue archive contains no API key, token, database URL, auth secret, or provider credential |
| encryption | private history payload is not readable from the rescue file without the user-held recovery secret |
| bounded delivery | raw archive is never injected wholesale; every AI packet declares a budget and receipt |
| legacy safety | old records remain readable and are not silently assigned to a new mask or deleted |

Any failure above reopens the current gate regardless of UI polish.

## G0 — Contract And Durability Acceptance

G0 must pass before real historical rows may be durably imported.

### Typed contract

- [x] All planned record families have explicit TypeScript types and version
      fields where their interpretation may evolve.
- [x] Scope, stable ids, source time/order, import time, time precision, source
      mode, continuity/branch, knowledge/sensitivity, and review state are not
      hidden inside free-form tags.
- [x] Companion and plot projections are separately nullable and share stable
      source/event references.
- [x] Factual and inner-view embedding slots are optional and versioned.
- [ ] Cascade/stale/rebuild/tombstone behavior exists for message edits, mapping
      corrections, batch deletion, character deletion, and tag merges.
- [ ] Legacy char-only messages have an explicit unscoped policy; migration does
      not silently attach them to the active mask.

### Persistence and quota

- [x] The app reports `best effort`, `persistent`, and unsupported storage states
      truthfully.
- [x] Persistence request is triggered by a user gesture and denial remains a
      usable but visibly less-protected state.
- [ ] Usage/quota estimate and projected import size appear before final import.
- [ ] Injected `QuotaExceededError` leaves no completed batch with missing rows
      and offers retry/export/cancel recovery.

Headless evidence exists for the state model/browser API adapter, and the real
Chromium lab proves that injected quota and abort failures roll back a bounded
IndexedDB transaction. The virtual app now exposes actual quota/persistence
state and a truthful denied-permission outcome. Projected file size and
retry/export/cancel recovery remain open because file parsing and production
writes are still deliberately disconnected.

### Optional encrypted backup/export archive — not an import prerequisite

- [x] Every new history store is included by an explicit typed carrier, not only
      by a generic store sweep.
- [x] Default rescue export excludes `apiConfig.apiKey`, MiniMax keys, database
      URLs, tenant/auth tokens, and equivalent provider secrets.
- [x] Private history sections are encrypted on device before the archive leaves
      the app; plaintext source messages are not recoverable by inspecting the
      generated file.
- [x] The recovery secret is exportable/user-held and does not exist only in the
      same IndexedDB whose loss the archive is meant to survive.
- [x] Manifest contains archive/schema version, created time, source device id,
      record-family counts, stable-id summary, and integrity hashes.
- [x] A wrong or missing recovery secret rejects restore before the current live
      database is cleared or mutated.
- [x] A modified section hash is rejected before the current live database is
      cleared or mutated.
- [x] Restore writes to a temporary/new database, validates counts, ids,
      references, hashes, and tombstones, then switches.
- [x] Existing synthetic lab database remains available and byte-logically
      unchanged after a simulated failed migration.
- [x] Native share cancellation does not mark a rescue archive as externally
      saved merely because a Cache file was produced.
- [x] A visible receipt distinguishes `generated`, `saved outside app`, and
      `restore verified`.

The carrier, encryption, manifest, secret/tamper rejection, credential/reference
scans, real temporary IndexedDB restore, non-destructive failure, and truthful
delivery state machine retain real-history evidence as a future backup/export
capability. Stage 1.4 removes this machinery from the ordinary import gate:
download/reselection and a user-held secret are required only when that optional
encrypted backup path is deliberately used. Native-device instrumentation and
whole-device integration remain pending.

### Additional encrypted-backup evidence

- deterministic contract verifier passes;
- text/full rescue round-trip fixture passes;
- corrupt archive leaves the current DB logically unchanged and preserves the
  previous storage image for rollback;
- encrypted archive decrypt/restore succeeds with the correct recovery secret
  and fails non-destructively with a wrong one;
- secret scanner finds zero forbidden fields in default rescue output;
- `npm run verify:health` passes.

## G1 — Parser And Preview Acceptance

### Normalization correctness

- [x] TXT and DOCX adapters emit the same normalized preview shape.
- [x] Source paragraph/line locators and original text are preserved.
- [x] Source order is stable across repeated parses.
- [x] Exact timestamps round-trip without timezone drift.
- [ ] Partial/missing/ambiguous times retain precision and original text instead
      of receiving invented exact times.
- [ ] Wrapped lines, empty paragraphs, separators, emoji, and Unicode names do
      not silently change speaker ownership.
- [ ] Missing images, voice messages, and stickers become explicit placeholders;
      their content is not guessed.
- [ ] OOC/system/roleplay candidates remain reviewable and are not silently
      promoted to relationship truth.

### Preview interaction

- [x] Mask and character may be selected or created as stable placeholders.
- [x] The initial mobile viewport exposes the first identity action; after one
      confirmation, the real TXT/Word chooser is visible without crossing a
      storage, backup, or architecture explanation screen.
- [x] Storage persistence is optional and non-blocking; no quota dashboard,
      empty rescue rehearsal, or disabled fake import action appears in the
      primary import path.
- [x] Speaker mapping is editable before import.
- [x] Uncertain rows are filterable and individually correctable/excludable.
- [x] Wrapped lines merge only after explicit user confirmation to a validated
      preceding source row.
- [x] Source mode and timezone interpretation are separately reviewable and do
      not silently invent plot, relationship, or exact-time facts.
- [x] A completed page review freezes to a deterministic immutable decision;
      replacing the file clears it and writes no production row.
- [x] Preview shows accepted, skipped, uncertain, and duplicate estimates.
- [x] Closing or changing the preview writes no source message or event row.
- [x] Reopening the same file produces the same preview fingerprint.

Stage 0.9 supplied the read-only front half of the first item. Stage 1.2 now
persists the selected existing or placeholder scope in the durable review
workspace, so reopening the App restores the exact scope without creating or
mutating a real mask or character card.

Stage 1.0 closes format parity and read-only preview mechanics using synthetic
sources only. Stage 1.1 closes the common mapping/filter/edit/exclude/merge
interactions. Stage 1.2 closes full-file paging, durable review resume,
placeholder-scope handoff, and whole-file decision authority beyond 500 rows.
G1 remains open for broader partial-time/media/export-shape fixtures and
lower-end device evidence; production archive writes remain blocked by G0.

### G1 pass evidence

- expected normalized rows equal actual rows for all parser fixtures;
- every intentionally ambiguous fixture row remains flagged;
- parser output is deterministic across at least three repeated runs;
- canonical-browser preview flow completes without console errors.

## G2 — Import, Archive, And Timeline Acceptance

### Import correctness and idempotency

- [x] Accepted preview count equals committed source-message count.
- [x] Batch manifest exists before its first source-message chunk.
- [x] Progress is monotonic and never reports complete before final validation.
- [ ] Pause/resume and reload/resume produce the same final ids, counts, hashes,
      and ordering as uninterrupted import.
- [ ] Retrying a committed chunk creates zero duplicate source-message ids.
- [x] Re-importing the exact same source creates zero silent new messages and
      shows an explicit duplicate/rebuild decision.
- [ ] Partial-overlap import identifies exact overlaps while leaving uncertain
      near matches for review.
- [ ] Live MemoryDM and auto-memory cursors do not advance during archive import.

### Scope and time

- [ ] `two_masks_same_character` shows only the active bundle's imported rows.
- [ ] Search, delete, rebuild, export, and restore preserve the same isolation.
- [ ] `ordering_old_plus_live` places old rows in source history and the live turn
      at the current end without changing the old source timestamp.
- [ ] Unknown-time rows keep deterministic source order and a visible unknown-
      time state.
- [ ] Imported history does not create unread/new-message/proactive effects.

### Paging and responsiveness

- [ ] Initial timeline open does not call `getAll()` for the complete imported
      archive.
- [ ] A page query returns no more than its declared page/window size.
- [ ] Jump-to-source restores a stable anchor without rendering all prior rows.
- [ ] On the named reference device/browser, `large_50k_text` completes without
      crash, tab reload, or unbounded-memory growth.
- [ ] During the large import, progress continues and pause/cancel acknowledgement
      occurs within 1 second after the current bounded transaction completes.
- [ ] Initial warm timeline view is usable within 2 seconds on the recorded
      reference profile.
- [ ] Main-thread long tasks above 100ms are absent from the steady import loop;
      any parser startup exception is measured and documented.

### Lifecycle

- [ ] Deleting one batch removes/invalidates only its source rows, derived events,
      projections, jobs, indexes, vectors, and receipts.
- [ ] Editing speaker mapping or source content marks dependent outputs stale and
      rebuilds them without changing unrelated stable ids.
- [ ] Rescue export/restore after the large import preserves exact irreplaceable
      counts and stable ids.

### G2 pass evidence

- all import fixtures pass deterministic count/hash comparison;
- large-fixture timing/storage report is attached;
- scope/recency leak count is zero;
- browser timeline, pause/resume, reload, delete, export, and restore flow passes;
- `npm run verify:health` passes.

## G3 — Event, Search, And Ordinary-Chat Recall Acceptance

### Neutral evidence ledger

- [ ] Every accepted event has at least one valid source span.
- [ ] Event fact text does not contain unsupported off-screen action or inferred
      inner monologue.
- [ ] Time, entities, source, importance, sensitivity, relationship delta, and
      recall policy remain structured fields rather than uncontrolled tags.
- [ ] Contradictory later evidence can supersede or conflict with older state
      without deleting historical truth.
- [ ] Re-running the same digest version is idempotent.
- [ ] Interrupted/retried digest jobs resume without skipping earlier chunks.

### Controlled tags

- [ ] Extractor-proposed terms resolve to canonical id, registered alias, or an
      unresolved review queue.
- [ ] Unknown terms do not silently create permanent tags.
- [ ] Per-event tag budgets are enforced.
- [ ] Alias merge/deprecation does not rewrite source/event ids.
- [ ] A wrong/missing tag cannot make an explicit exact/date/entity query
      permanently invisible.

### Human search

- [ ] Exact names, dates, distinctive phrases, aliases, and event titles return
      expected scoped hits.
- [ ] Results can jump to the original source bubbles.
- [ ] Unknown-time and missing-media states remain visible after the jump.
- [ ] Unrelated scope and discarded events return zero hits.

### AI recall

- [ ] Candidate collection is not truncated to only recent memories before
      relevance matching.
- [ ] Exact/date/entity tests return the expected source-linked event within the
      bounded top results.
- [ ] Unrelated queries deliver zero history cards.
- [ ] One evidence family contributes at most one selected representation to a
      prompt unless an explicit reason is recorded.
- [ ] Prompt packets stay within declared item and character budgets.
- [ ] Delivery receipt records selected event ids, source ids, policy mode,
      warnings, and budget without copying the entire private source text.

### Privacy/surface policy

- [ ] `private_surface_secret` produces zero forbidden source or derived text in
      group/public prompt capture.
- [ ] Sensitivity and allowed-surface filters run before formatter/model code.
- [ ] `unknown_to_char` evidence is not delivered as character knowledge.
- [ ] Branch/scene-only material does not enter relationship/mainline recall
      without an explicit compatible mode.
- [ ] Imported history remains unable to trigger proactive messages, current
      reminders, tasks, or hot-state changes.

### G3 pass evidence

- search gold set passes with source-jump evidence;
- recall gold set passes exact-match and unrelated-query cases;
- zero forbidden prompt-capture occurrences across surface fixtures;
- bounded-packet and evidence-family dedupe tests pass;
- ordinary chat browser flow displays a truthful delivery receipt;
- `npm run verify:health` passes.

G3 closes the first public-release functionality cut.

## G4 — Companion And Plot Projection Acceptance

### Companion projection

- [ ] Every projection declares `source_explicit`, `source_inferred`, or
      `model_reconstructed` derivation.
- [ ] Inferred/reconstructed statements carry confidence, review state, and
      source evidence.
- [ ] One source scene cannot silently establish a permanent persona pattern.
- [ ] Relationship phases preserve historical change rather than flattening all
      years into one current impression.
- [ ] No proposal silently overwrites character prompt, user profile,
      `char.impression`, or global character memory.

### Plot gate

- [ ] Every source window receives an explicit disposition, including successful
      `no_plot`.
- [ ] `companionship_no_plot` stores zero accepted plot events/open threads after
      deterministic gating.
- [ ] `plot_positive` stores only nodes with source span plus a concrete
      before/after goal, obstacle, choice, consequence, open-thread, world-state,
      or relationship-state delta.
- [ ] Generic “spent a beautiful day together” endings and invented off-screen
      actions are rejected.
- [ ] Branch/IF plot never mutates relationship/mainline truth.
- [ ] Model candidate proposal rate and final accepted rate are reported
      separately; deterministic rejection is not hidden as extractor success.

### Review/apply

- [ ] Persona, relationship, arc, and language-fingerprint proposals show diffs
      and source evidence.
- [ ] Reject, edit, accept, and revert operations leave receipts.
- [ ] Applying a historical task/arc does not create a current task or reminder.
- [ ] Language fingerprints remain speaker-separated and are not quoted as
      historical dialogue when they are synthesized patterns.

### G4 pass evidence

- accepted unsupported plot node count is zero across the gold fixtures;
- companionship texture remains available through companion projection even
  when plot output is empty;
- all applied proposals have reversible, source-linked receipts;
- browser review/apply/revert flow passes;
- `npm run verify:health` passes.

## G5 — Vector Upgrade Acceptance

- [ ] Existing source/event/projection ids remain unchanged after backfill.
- [ ] Factual and inner-view embeddings have separate version/status/checksum.
- [ ] Missing, stale, failed, and current embedding states are distinguishable.
- [ ] Rebuild works from stored normalized/event text without reparsing DOCX/TXT.
- [ ] Scope/privacy policy executes before vector candidate delivery.
- [ ] Hybrid retrieval does not regress exact name/date/phrase gold cases.
- [ ] Paraphrase gold cases improve or match lexical-only baseline.
- [ ] Wrong-tag cases remain recoverable through a bounded scoped fallback.
- [ ] Vector results remain source-linked, deduplicated, and prompt-budgeted.
- [ ] Turning vectors off leaves a functional lexical/tag retriever.

### G5 pass evidence

- before/after retrieval benchmark is attached;
- exact-match regression count is zero;
- cross-scope leak count is zero;
- stable-id diff is empty;
- stale/rebuild/retry fixtures pass;
- `npm run verify:health` passes.

## Release And Migration Acceptance

Before a public build that contains any history-import stage:

- [ ] Existing browser with legacy messages opens without destructive migration.
- [ ] Existing text-only and full backups remain importable or receive a clear,
      non-destructive incompatibility message.
- [ ] New rescue archive round-trips every shipped history store.
- [ ] Service/app update does not clear IndexedDB or mark unverified data as
      migrated.
- [ ] Failed migration keeps the previous database selectable for rollback.
- [ ] UI truthfully displays archive readiness: imported, indexed, digested,
      vectorized, stale, failed, or review pending.
- [ ] Help/release notes explain that records are local-first, what persistent
      storage can and cannot protect, and how to keep an external rescue copy.
- [ ] No real chat export, generated private memory, API key, backup archive,
      database dump, or runtime log exists in the git patch.

## Definition Of Done By Release Layer

### Archive MVP

G0-G2 pass. Users can safely import, browse, continue, back up, restore, and
delete history. AI does not use imported memory yet.

### Recall MVP / first public history release

G0-G3 pass. Users can search/jump and ordinary chat can receive bounded,
source-linked key-event recall with hard privacy gates.

### Enrichment beta

G4 passes in addition to G0-G3. Companion and plot proposals are reviewable and
false plot creation is deterministically blocked.

### Vector upgrade

G5 passes in addition to all earlier gates. Vector retrieval remains optional,
rebuildable, and compatible with the lexical/tag fallback.

No layer may advertise “the AI remembers all imported history” merely because
the raw file was stored. UI and release notes must state the actual readiness
level reached by the verified pipeline.
