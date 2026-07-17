# AetherOS Historical Conversation Import — Execution Plan

Status: working execution baseline; Stage 1.7 daily archive implemented

Last updated: 2026-07-16

Working branch: `codex/aetheros-history-memory-import`

This plan turns the confirmed historical-conversation direction into reversible
implementation slices. It is intentionally separate from the repository root
`PLAN.md`, `REQUIREMENTS.md`, and `SCHEMA.md` because those files currently own
other active work and have unrelated local edits.

Acceptance evidence and release gates live in
`docs/HISTORY_IMPORT_ACCEPTANCE.md`.

## Product Outcome

A user can choose or create a persona mask and character, import a TXT or DOCX
conversation archive, inspect uncertain speaker/time parsing, store the accepted
history locally, browse it as an older part of the relationship, search and jump
to source messages, and continue chatting without loading the archive into every
model call.

AetherOS may later derive two independent, source-linked projections from the
same neutral evidence:

- a usually denser companion / inner-view projection; and
- a deliberately sparse plot projection that is allowed to produce nothing.

The operator cloud hosts application code and updates only. It is not assumed to
retain user chat or long-memory records.

## Public Release Cut Line

The first releasable history-import version includes Stages 0-3:

1. durable copy-on-write local storage, with backup/export kept as a separate
   optional system capability;
2. TXT/DOCX preview-first import into a scoped archive;
3. paged timeline browsing, human search, source jump, and a small lexical key-
   event recall packet for ordinary chat.

Companion/plot enrichment is a later review-first beta. Vector retrieval is an
upgrade lane, not a first-release blocker. Its storage slots and stable ids are
still designed in Stage 0 so backfill never requires reparsing the source file.

## Implemented Stage 0.1 Slice — 2026-07-16

The first contract-only code slice is now present:

- `domain/historyImport/types.ts` defines scoped batch, source-message, neutral
  event, companion projection, plot projection, job, controlled-tag, embedding,
  backup-receipt, paging, and read/write repository contracts;
- `domain/historyImport/contract.ts` declares eight sidecar store families,
  explicit durability/backup/prompt policies, the credential-safe encrypted
  rescue contract, and pure scope/source/plot contract validators;
- every mask-sensitive single-record read, stale operation, and cascade delete
  requires an explicit `HistoryScope`; two progress bundles sharing one
  character cannot rely on id-only access;
- raw source messages are contractually archive-only: no allowed prompt surface,
  no recall, and no initiative;
- `fixtures/history-import/manifest.ts` lists 19 synthetic-only fixtures across
  G0-G5. The DOCX fixture remains `awaiting_sanitized_shape`; no friend export or
  private conversation is committed;
- `npm run verify:history-import` runs the deterministic Stage 0.1 verifier.

Verified on 2026-07-16: `npm run verify:history-import` and
`npm run verify:health` pass. The existing informational large-chunk warning
remains unrelated. No parser, IndexedDB migration/store, rescue implementation,
UI, prompt delivery, or real-history write was added.

## Implemented Stage 0.2 Slice — 2026-07-16

The second slice stays deliberately below the storage and UI boundaries:

- `domain/historyImport/jobState.ts` implements immutable create, start, chunk
  commit, pause, resume, failure, retry, completion, and cancellation
  transitions;
- chunk commits carry an idempotency key plus from/to counts and a checkpoint
  hash. An exact replay is a no-op, a conflicting replay is rejected, and
  processed/source cursors cannot move backwards;
- failed jobs preserve their last durable cursor. Retrying queues the same job,
  and a new attempt is counted only when execution actually starts;
- `fixtures/history-import/generators.ts` provides deterministic, synthetic-only
  batches and normalized messages. The 50,000-message fixture is iterable and
  does not require materializing the whole archive;
- only `txt_basic_zh` and `large_50k_text` are marked `generator_ready`.
  Ambiguous text remains parser work and `docx_export_like` still waits for a
  sanitized structural description;
- `npm run verify:history-import` now aggregates the contract verifier and the
  Stage 0.2 job/generator verifier.

Verified on 2026-07-16: the verifier generated and validated 50,000 unique
stable message ids, exercised lossless paused-job serialization, and passed
pause/resume/retry/cancel/idempotency conflicts. `npm run verify:health` also
passes with only the pre-existing large-chunk warning.

This does **not** yet prove crash-safe browser recovery: no IndexedDB
transaction, persisted checkpoint, quota interruption, storage-health API, or
rescue file exists. Those remain Stage 0.3-0.4 work.

## Implemented Stage 0.3 Headless Slice — 2026-07-16

The storage-health foundation is now present without mounting UI or writing
history rows:

- `domain/historyImport/storageHealth.ts` defines truthful persistence states
  (`unsupported`, `unknown`, `best_effort`, `persistent`), estimate states,
  normalized-size projection, reserved-headroom preflight, durability levels,
  and write-failure recovery actions;
- the provisional sizing policy is explicit and versioned: normalized content
  is projected at 1.5x plus 256 bytes per record and 2 MiB fixed overhead, while
  preflight reserves the greater of 20% quota or 64 MiB. These are conservative
  starting values, not universal browser facts, and require device/browser
  calibration before release;
- source-file bytes remain visible in the report but are not counted as a
  durable duplicate because the raw DOCX/TXT file is not retained by default;
- `utils/historyImport/storage/storageHealth.ts` reads
  `navigator.storage.persisted()` and `estimate()` behind an injectable adapter.
  `persist()` cannot be called through this boundary unless the caller confirms
  a user gesture, and an explicitly inactive `navigator.userActivation` is
  rejected;
- preflight distinguishes ready, warning, blocked, and unknown. Missing quota
  evidence never becomes a fabricated zero-usage success; best-effort storage
  may proceed only as an acknowledged warning when measured headroom is enough;
- durability remains three visibly distinct levels: local only, persistent
  local, and externally saved **and restore-verified** rescue. A native/browser
  temporary Cache handoff never counts as external rescue;
- `QuotaExceededError` is normalized to a recovery contract that forbids
  completed-batch status, preserves the durable cursor, and exposes
  retry/export/cancel actions.

The verifier covers unsupported/best-effort/persistent APIs, failed and partial
estimates, granted/denied/failed persistence requests, missing user gestures,
ready/warning/blocked/unknown preflight, rescue-level resolution, and quota
classification. `npm run verify:history-import` and `npm run verify:health`
pass.

This is still a headless contract, not the whole G0 persistence gate. There is
no storage-health screen, real IndexedDB write transaction, injected rollback,
persisted job checkpoint, or encrypted rescue/restore implementation. The
`quota_interrupt` fixture therefore remains planned rather than falsely marked
ready.

## Implemented Stage 0.4 Headless Slice — 2026-07-16

The first credential-safe rescue carrier and restore-validation boundary are
now present:

- `domain/historyImport/rescue.ts` defines an explicit eight-store carrier,
  versioned manifest, per-section counts/byte lengths/SHA-256 hashes/stable-id
  checksums, encrypted envelope, and two-phase temporary-restore records;
- `utils/historyImport/backup/rescueArchive.ts` removes known provider/database
  credential fields recursively, omits rebuildable factual/inner-view embedding
  vectors, then partitions each store into at most 500-record canonical chunks.
  The encrypted manifest binds chunk ids to stores/order; input
  objects are not mutated;
- the v1 envelope encrypts the manifest and every chunk independently with Web
  Crypto AES-256-GCM, a unique random IV, and a 128-bit tag. Every part
  authenticates the common outer header plus its part id as additional data.
  Its Web Crypto-compatible key
  derivation is PBKDF2-HMAC-SHA-256 with a random 16-byte salt and 600,000
  iterations; a generated recovery secret uses 32 random bytes. The archive
  records its crypto profile so a later version can migrate rather than silently
  changing interpretation;
- this profile follows the current OWASP PBKDF2-HMAC-SHA-256 work-factor
  baseline while acknowledging that OWASP prefers Argon2id when an appropriate
  implementation is available. Browser support comes from the standardized Web
  Crypto AES-GCM/PBKDF2 primitives. The work factor still requires mobile-device
  timing before release: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
  [W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/);
- the public envelope exposes only format/version, archive identity/time,
  authenticated crypto parameters, encrypted-chunk count, encrypted parts, and
  manifest checksum. Source device id, record counts, history text, and the full
  section/chunk manifests remain encrypted;
- restore verifies section hashes/counts/stable ids, credential exclusion, and
  cross-store references: messages -> batches, events -> batches/source turns/
  tags, companion/plot projections -> events/source turns, and jobs -> batches;
- decryption produces a plan for a distinct temporary database with both switch
  preconditions and live-database mutation set to false. A second comparison of
  the observed temporary sections is required before switch preconditions become
  true; even then this module has no authority to mutate the live database;
- the all-store rescue fixture is now `generator_ready`. Wrong secret, ciphertext
  tamper, authenticated-header tamper, internal section-hash corruption,
  dangling references, same-live/temp target, and changed temporary content all
  fail before any switch abstraction. A 501-record boundary fixture proves a
  deterministic `500 + 1` split;

`npm run verify:history-import` and `npm run verify:health` pass. The verifier
removes three synthetic credential fields and two rebuildable vector arrays from
an eight-store fixture, then proves exact temporary-restore counts.

This remains headless. Crypto work is bounded by record chunks, but the current
API still receives section arrays and the JSON serializer assembles the final
file string in memory. It does not yet page directly from IndexedDB, stream to an
external file, persist the recovery secret, write a temporary IndexedDB,
preserve a real old database image, perform a live switch, or prove native share
completion.
The generated archive is therefore not yet an externally verified backup, and
`corrupt_rescue_archive` remains planned for the real database rollback harness.

## Implemented Stage 0.5 Isolated IndexedDB Slice — 2026-07-16

The storage boundary now has real-browser evidence without creating or opening
the production `AetherOS_Data` database:

- `utils/historyImport/storage/indexedDbLab.ts` rejects every database id that
  does not start with the dedicated `AetherOS_HistoryImport_Lab:` prefix. It
  creates exactly the eight explicit history stores with stable `id` primary
  keys and no hidden ninth metadata store;
- batch state, source-message rows, and the matching durable job checkpoint are
  committed in one strict-durability transaction. Chunks are capped at 500,
  exact replays are no-ops, conflicting stable ids abort, and a separate final
  transaction refuses to mark the batch imported until row count, committed
  count, and job cursor all agree;
- every all-store read uses bounded primary-key cursors. Restore readback may use
  the decrypted plan only to reconstruct manifest order; missing or extra ids
  still fail the Stage 0.4 count/hash/id/reference verifier;
- an encrypted restore plan can write only to a distinct lab-prefixed temporary
  database. The writer has no live-switch function or live-mutation authority;
- `scripts/browser/verify-history-import-indexeddb.ts` is a reusable Chromium
  harness. It writes 1,201 synthetic messages as `500 + 500 + 201`, injects a
  `QuotaExceededError` after 17 tentative writes and an abort after 9, rejects a
  stable-id conflict, closes/reopens the database at durable cursor 500, then
  finishes with exactly 1,201 rows;
- the same harness pages the result in windows of 137, rejects premature
  completion and a wrong recovery secret, interrupts a real temporary restore,
  proves the synthetic live logical digest is unchanged, and finally restores
  all 1,201 messages into a second temporary database that passes the Stage 0.4
  verifier. Verified restore still reports `liveDatabaseMutationAllowed=false`;
- `scripts/verify-history-import-indexeddb-contract.ts` keeps the lab prefix,
  exact store set, 500-record bounds, stable keys, strict transaction boundary,
  cursor-only reads, and absence of a production DB adapter import under the
  normal deterministic verifier.

Verified on the canonical `http://127.0.0.1:5174/` Chromium surface: zero console
errors; the only warning is the repository's existing Tailwind CDN warning.
`quota_interrupt` and `corrupt_rescue_archive` are now `generator_ready`.
`reload_mid_import` remains planned until its final uninterrupted-vs-resumed
hash equivalence is recorded, rather than treating cursor survival alone as the
whole fixture.

This is still an isolated lab, not a production migration. The current rescue
builder and readback ultimately materialize section arrays, and the browser run
is 1,201 rows rather than the G2 50,000-row device benchmark. External file
save, recovery-secret handoff, native share cancellation, a verified receipt,
controlled live switch/rollback, parser, UI, retrieval, and real-history writes
remain absent.

## Implemented Stage 0.6 Rescue Handoff Slice — 2026-07-16

The generated archive can now move through truthful delivery states without a
download/share request being confused with a durable rescue copy:

- `domain/historyImport/backupReceipt.ts` owns immutable receipt transitions.
  A receipt begins at `generated_memory`, records delivery attempts separately,
  reaches `external_save_confirmed` only through a closed file-picker write or
  explicit user attestation, and reaches `restore_verified` only when archive
  id, manifest checksum, all-store counts, a confirmed external copy, and a
  user-held recovery-secret state agree;
- recovery-secret handoff is independent of archive delivery:
  `not_presented -> presented_once -> copied_to_clipboard? -> user_confirmed`.
  Clipboard success is optional convenience, not durable proof. Receipts contain
  only the handoff state and never the secret itself;
- `utils/historyImport/backup/rescueDelivery.ts` supports a user-gesture-gated
  browser file picker, a conservative anchor-download fallback, native
  Cache-to-share handoff, and clipboard copy behind injected adapters;
- closing a browser file-picker writable is machine evidence for an external
  file. Picker `AbortError` is cancellation and any other write/open error is a
  failure. A normal anchor download remains `confirmation_required` even when a
  browser download event fires, because the app cannot prove where the browser
  retained it;
- `utils/historyImport/backup/capacitorRescueShare.ts` writes only a temporary
  `Directory.Cache` file, invokes the pinned Capacitor Share plugin, and deletes
  the Cache handoff in `finally`. A resolved share is still
  `confirmation_required`: Web Share is fire-and-forget, and a receiving app is
  not proof of a durable rescue copy;
- native cancel/failure never confirms an external copy. A later cancelled save
  attempt also does not erase an already confirmed earlier external copy;
- the fixture manifest now has 20 synthetic cases; `rescue_delivery_cancel` is
  generator-ready and covers picker/download/native success, cancellation,
  failure, Cache cleanup, secret non-leakage, and restore prerequisites.

The deterministic verifier passes picker confirmed/cancelled/failed, download
attestation, native handoff/cancel/cleanup failure, recovery-secret progression,
and restore receipt promotion. Real Chromium additionally confirms picker
semantics, user-gesture refusal, secret-copy non-leakage, and a real synthetic
`.aetherrescue` download event whose code result remains
`confirmation_required`. Browser console errors remain zero.

This stage follows the [File System Access draft](https://wicg.github.io/file-system-access/)
rule that dismissing the picker rejects with `AbortError`, and the
[W3C Web Share API](https://www.w3.org/TR/web-share/) rule that success may mean
only transmission to the OS/share target rather than target-side durable
retention. The first API is still an incubator draft, so unsupported browsers
keep the conservative download-plus-user-confirmation fallback.

Still absent: visible receipt/recovery-secret UI, native-device instrumentation,
stream-to-file encryption, production sidecar migration/switch/rollback,
storage-health UI, parser, retrieval, and real-history writes. The existing
global Settings ZIP exporter is unchanged and is not upgraded by this isolated
history-rescue module.

## Implemented Stage 0.7 Virtual App Safety Shell — 2026-07-16

The history-import product now has its own independently lazy-loaded virtual app
rather than extending the legacy Character cleaner or root application:

- `AppID.HistoryImport`, launcher registration, and the `PhoneShell` switch form
  the only main-shell integration. `App.tsx` remains unchanged;
- `apps/HistoryImportApp.tsx` owns the workflow shell, while
  `components/history-import/HistoryImportSafetyGate.tsx` renders the visible G0
  state. Neither module imports a parser, production database, or chat writer;
- a generated local 512px app icon is shipped through the public asset pipeline.
  The new optional built-in image-icon seam preserves user custom-icon priority
  and normalizes the Vite/GitHub Pages base path;
- the safety gate reads the browser's actual origin estimate and persistence
  state, requests persistence only from an explicit click, and keeps origin
  capacity, persistent-local protection, and external rescue as separate rungs;
- mask/character binding, Word/TXT parsing, digestion, search, and file choice
  remain visibly disabled instead of being represented as working.

Typecheck, the complete history-import verifier, production health build, and
`git diff --check` pass. Real Chromium opened the desktop icon with zero console
errors, reported `288 KB / 6.0 GB` and `best_effort`, then denied the persistence
request. The app stayed at the less-protected state and explicitly required a
future rescue copy instead of displaying a false green result.

Still absent: one-time recovery-secret presentation, live receipt-transition
rehearsal, native-device instrumentation, stream-to-file encryption, production
sidecar migration/switch/rollback, parser, retrieval, and real-history writes.

## Implemented Stage 0.8 Lab-Safe Rescue Rehearsal — 2026-07-16

The visible G0 shell now exercises the existing rescue and receipt contracts
without pretending that production history has been backed up:

- `utils/historyImport/backup/rescueRehearsal.ts` builds an encrypted synthetic
  archive with exactly the eight declared history stores and zero records. Live
  and temporary database ids are restricted to the isolated lab prefix, and the
  module neither imports nor opens the production database;
- `components/history-import/HistoryRescueRehearsal.tsx` presents the recovery
  secret once, treats clipboard copy as convenience only, and requires explicit
  confirmation that the secret is held outside the app. Plaintext exists only
  in a short-lived in-memory reference and never enters receipt or IndexedDB
  state;
- browser download remains `confirmation_required` until the user confirms an
  external copy. That confirmation still does not prove restorability;
- restore verification requires the user to re-select the downloaded
  `.aetherrescue` file. The app parses that external file, requires an exact
  archive-id/manifest-checksum/version match, rejects non-empty input in this
  rehearsal, decrypts with the user-held secret, restores into a new isolated
  temporary lab database, verifies the readback, and deletes the temporary
  database before advancing the receipt;
- the visible three-rung receipt therefore distinguishes generated, saved
  outside the app, and restore verified without using an in-memory archive as a
  substitute for the external copy;
- `scripts/verify-history-import-rehearsal.ts` proves the empty-carrier shape,
  source/static lab guards, mismatched external-file and wrong-secret rejection,
  truthful download state, secret non-leakage, and verified temporary restore.

`npm run verify:history-import`, `npm run verify:health`, and
`git diff --check` pass. Real Chromium completed the same external-download,
re-selection, temporary-restore, and cleanup path with zero console errors.

This remains synthetic rehearsal evidence. It does not close production
recovery-secret, real-history rescue, controlled database switch/rollback,
native-device, streaming-encryption, parser, retrieval, or ingestion gates.

## Implemented Stage 0.9 Read-Only Identity Binding — 2026-07-16

The first G1 surface now prepares an explicit scope without gaining card,
archive, or parser write authority:

- `domain/historyImport/identityBinding.ts` defines a versioned page-memory
  draft. Existing choices retain the real `personaMaskId`, `progressBundleId`,
  and `charId`; missing choices receive draft-seed-specific placeholder ids;
- the same seed and selections reproduce the same draft ids, while another seed
  cannot collide with those placeholders. The contract exposes
  `previewReady=true`, `persistence=memory_only`, and the literal
  `productionWriteAllowed=false`;
- `components/history-import/HistoryIdentityBinding.tsx` reads normalized masks
  and current characters, prefers active choices, allows mask and character to
  be left empty independently, and locks/unlocks the page draft without calling
  profile or character mutation APIs;
- the component contains no local/session storage, IndexedDB, file input,
  parser, or production-history dependency. Refresh intentionally starts a new
  draft because no persistent import batch exists yet;
- the app route now reports G1 identity-draft state. Locking changes only the
  visible route marker; Word/TXT remains a disabled next stage;
- `scripts/verify-history-import-identity.ts` covers existing/mixed/empty
  bindings, deterministic placeholder identity, cross-draft separation,
  malformed ids, no-write authority, and static UI boundary guards.

`npm run verify:history-import`, `npm run verify:health`, and
`git diff --check` pass. Real Chromium at 430x932 locked an empty-mask plus
empty-character draft, disabled the choices, and advanced only the route marker
with zero console errors.

This does not yet satisfy durable placeholder acceptance. No file has been
opened, no preview fingerprint exists, and no identity draft survives reload or
enters a production import job.

## Implemented Stage 1.0 Built-In TXT/DOCX Preview — 2026-07-16

TXT and Word now share one real preview path rather than leaving DOCX as a
future adapter label:

- `domain/historyImport/preview.ts` defines the common read-only row, issue,
  speaker-candidate, count, source-file, and preview fingerprint contract;
- `utils/historyImport/parsers/txt.ts` decodes UTF-8/BOM, UTF-16 LE/BE, and
  GB18030 with explicit warnings/failures and line locators;
- `utils/historyImport/parsers/docx.ts` validates the OpenXML ZIP carrier,
  bounds entry/document size, reads `word/document.xml`, and preserves paragraph
  or table-cell position while extracting Word text runs, tabs, and breaks. It
  accepts valid self-closing empty paragraphs emitted by WPS/mobile Word while
  still rejecting a genuinely unfinished paragraph at the end of truncated XML;
- `utils/historyImport/parsers/sourcePreview.ts` applies the same conservative
  turn cleanup to both sources. It keeps missing speaker/time uncertain, does
  not attach a wrapped line to the previous turn, preserves missing media as an
  unavailable placeholder, marks OOC/system candidates, and reports exact
  within-file duplicates;
- preview input is capped at 64 MiB and 100,000 source units. DOCX adds a 2,048
  ZIP-entry and 128 MiB uncompressed-main-document guard. Only 500 rows are
  materialized into preview state and 30 are rendered at once;
- `components/history-import/HistorySourceIntake.tsx` exposes the real local
  file chooser after identity lock and shows format/encoding/fingerprint,
  accepted/uncertain/duplicate/skipped counts, speaker candidates, source
  locators, original text, and issue labels;
- `.doc` is rejected with a truthful save-as-`.docx` instruction. Raw file bytes
  are not retained, no network/storage/card API is called, and changing identity
  clears the in-memory preview;
- `scripts/verify-history-import-preview.ts` and the reusable browser-fixture
  generator cover generic synthetic TXT and DOCX paragraph/table input. A real
  friend export remains local calibration evidence, not a committed fixture.

`npm run verify:history-import`, `npm run verify:health`, and
`git diff --check` pass. Real Chromium at 430x932 selected both generated files,
showed identical semantic counts, preserved the DOCX table-cell locator, and
cleared the preview after identity unlock with zero console errors.

At the Stage 1.0 checkpoint, G1 was still open because source-speaker mapping,
uncertain-row filters/corrections, wrapped-line merge, timezone/source-mode
review, and preview decisions were not implemented. Stage 1.1 below closes the
page-memory review controls, but no batch or source-message row can be written.

## Implemented Stage 1.1 Shared Review And Freeze — 2026-07-16

TXT and Word now enter one human-review layer without mutating the parser's
source preview:

- `domain/historyImport/previewReview.ts` defines editable row decisions,
  review assessment, normalized speaker targets, full-vs-prefix coverage, and a
  deeply frozen deterministic decision carrying its own SHA-256 fingerprint;
- every source speaker must be explicitly mapped to user, character, system, or
  confirmed unknown. Rows without a speaker label require a per-row role when
  kept, while excluded and explicitly merged rows do not invent one;
- ready rows begin accepted, duplicate/separator rows begin excluded, and every
  uncertain row remains pending until kept, corrected, excluded, or merged;
- a wrapped line may merge only when the parser already marked
  `possible_continuation`, its target is the preceding meaningful row, and the
  user presses the explicit merge control. Invalid/forged rows, wrong merge
  targets, excluded targets, missing mappings, invalid timezone input, and
  unconfirmed metadata all prevent freeze;
- `components/history-import/HistoryPreviewReview.tsx` provides materialized-row
  paging, pending/all/included/excluded filters, content correction, exclusion,
  speaker mapping, source-mode and timezone controls, visible blockers, and a
  frozen receipt. Reopening creates a new editable page version rather than
  mutating the frozen object;
- the frozen decision remains `memory_only` and
  `productionWriteAllowed=false`. It cannot create a batch, write source rows,
  upload content, or enable retrieval;
- a preview truncated at 500 rows freezes only a `materialized_prefix`, and the
  receipt explicitly refuses to call that whole-file authority.

The deterministic verifier produces a stable 4-included / 2-excluded /
1-merged decision, proves nested immutability and changed fingerprints after a
real edit, and rejects incomplete/forged/invalid review states. Real Chromium at
430x932 completed and froze the TXT review, then replaced it with the same
semantic DOCX. The old decision cleared, Word opened the same controls, its
table-cell locator survived, and editing changed only the review layer. Console
errors were zero; the known Tailwind CDN development warning remained.

G1 is not fully closed. Full-file review beyond the current 500 materialized
rows, resumed large-review equivalence, broader partial-time/media fixtures, and
durable placeholder/preview handoff remain unproved. No production batch or
source-message row can be written yet.

## Human-Flow Correction After Stage 1.1 — 2026-07-16

The engineering safety shell was useful for proving G0 contracts, but it was
not a valid import product flow. The visible app has therefore been corrected
without weakening any storage or review invariant:

- the launcher uses the repository's normal Phosphor line icon instead of a
  glossy generated bitmap;
- the primary route is now identity -> file -> review, with compact completed
  states and no duplicate row preview;
- the G0 storage dashboard and empty rescue rehearsal no longer render in the
  import route. Their code and deterministic verifiers remain available as
  engineering evidence;
- browser persistence is a collapsed, optional explanation after file intake.
  It says that clearing site data can remove records and accurately describes
  `navigator.storage.persist()` as an eviction-resistance request, not file-
  system read permission;
- backup/export remains a distinct later data-management/post-import action;
- the disabled fake production-write button was removed. Until G1.2 full-file
  coverage and the G2 production sidecar commit exist, the current development
  boundary is disclosed before identity selection.

Canonical Chromium at 430x932 now exposes the first identity CTA in the initial
viewport and the real TXT/Word chooser in that same viewport after one click.
A synthetic TXT reaches the shared review surface immediately after its compact
file summary. This UX correction does not change the HOLD on production rows.

## Implemented Stage 1.2 Durable Full-File Review — 2026-07-16

The corrected human flow now has a whole-file review engine behind it rather
than returning to the old 500-row prefix limitation:

- full normalization may cover up to the existing 100,000-source-unit safety
  cap, while the ordinary preview API remains capped at 500 materialized rows;
- `AetherOS_HistoryImport_Workspace` is a disposable two-store IndexedDB used
  only for review manifests and normalized row drafts. It is separate from the
  eight-store history archive, legacy messages, cards, memory delivery, tags,
  vectors, and network code;
- normalized rows commit to the workspace in strict 500-row transactions and
  the React page reads only ten records at a time through bounded IndexedDB
  cursors. Speaker mappings, metadata choices, exclusions, edits, and merges
  survive page refresh and App reopen;
- final review authority iterates the entire durable row set in source order,
  validates every merge and attention flag, and hashes fixed 500-row chunks.
  A 1,201-row decision therefore freezes as `500 + 500 + 201`, independent of
  the visible page or a refresh boundary;
- the frozen manifest deliberately remains
  `productionWriteAllowed=false`. Completing review does not create a batch,
  source message, event, projection, tag, vector, or live-chat row.

The deterministic verifier proves that a 1,201-row full review produces the
same decision id, fingerprint, counts, and three chunk digests when consumed in
one pass or in serialized 137-row resume windows. It rejects pending rows and
out-of-order input. Canonical Chromium at 430x932 uploaded the same 1,201-row
fixture, paged from rows 1-10 to 11-20, reloaded the whole OS, restored the
speaker/metadata decisions after reopening the App, and froze 1,201 included
rows into three chunks. Direct IndexedDB inspection found exactly 1,201 rows and
the same frozen manifest; console errors were zero.

A second canonical-browser capacity run wrote a 2.9 MiB / 50,000-row synthetic
TXT into the review workspace. IndexedDB reported exactly 50,000 durable rows,
the review surface rendered ten row cards, JS heap was about 52 MiB after the
run, and the fresh browser profile reported about 46.5 MiB origin usage against
a roughly 6.49 GB quota. These are reference-Mac/Chromium observations, not a
promise for every phone; parsing still temporarily materializes the normalized
file before chunked persistence and requires a lower-end mobile benchmark.

G1 remains open only for the broader partial-time/media/export-shape fixture
matrix and lower-end device evidence. The next production-write slice remains
HOLD behind the real-history rescue/switch requirements in G0; the visible App
must not replace that gate with a decorative import button.

## Implemented Stage 1.3 Verified Local Archive Activation — 2026-07-16

The visible `安全导入` action is now backed by the real rescue gate rather than a
decorative or direct-to-live write:

- reviewed rows translate into stable, scoped source messages while preserving
  merged-row locators and original-text hashes. Excluded rows stay absent and
  raw history remains archive-only / prompt-ineligible;
- formal archives use eight exact IndexedDB stores in versioned
  `AetherOS_HistoryArchive:v1:*` slots. `AetherOS_Data` remains untouched. A
  separate control database owns the active pointer;
- imports are copy-on-write: the active slot is read, an inactive candidate is
  built in strict at-most-500-message commits, and no active pointer changes
  during candidate preparation;
- an encrypted rescue is generated from that candidate with a recovery secret
  that is shown to the user but never persisted. Download alone is not enough:
  the selected external file must match, decrypt into a different restore slot,
  and reproduce the manifest/counts before activation;
- activation changes only the control pointer, stores the verified receipt in
  that control record, and retains the previous active database. The verified
  restore database is not modified after count/hash validation;
- exact same-source/same-review import is visible as already imported. A
  different review that resolves to the same stable batch id is blocked behind
  a future explicit rebuild flow rather than silently replacing history.

Canonical Chromium first activated four messages and restored the explicit
already-imported state after a full refresh/App reopen. A second 1,201-message
run crossed three durable chunks and produced an active archive with 1,205
source messages, two batches, and two completed jobs. The first restore slot
remained present in `retainedPreviousDatabaseIds`; the current candidate also
remained present; the control receipt was `restore_verified`; neither recovery
secret was persisted; and direct active-slot deletion rejected. Console errors
were zero.

This was not full G2/timeline completion at Stage 1.3. Stage 1.6 below adds the
basic scoped chat timeline and continuation seam. Partial-overlap decisions,
explicit rebuild/delete, production pause/resume and injected quota recovery,
cross-mask query evidence, archive search/source jump, semantic recall, derived
projections, and formal 50,000-row low-end-device rescue timing remain HOLD.

## Implemented Stage 1.4 Import/Backup Boundary Correction — 2026-07-16

Stage 1.3 proved the encryption and temporary-restore machinery, but attached it
to the wrong human action. Historical TXT/DOCX intake now ends after the
copy-on-write candidate is count-verified and atomically selected as the active
local archive. The source file is already user-held plaintext; import neither
encrypts it nor requires a recovery secret, download, or file reselection.

The encrypted rescue coordinator was retained under
`utils/systemBackup/historyArchiveRescue.ts` as a later backup/export seam.
Settings continues to offer ordinary password-free ZIP export and restore; it
does not imply cloud use. Optional whole-device encryption, cloud transport,
device-recognized encrypted packages, and multi-device key ownership are a
future system-backup phase, not prerequisites for finishing history input.

The safety properties that belong to input remain: strict chunks of at most 500
messages, inactive candidate construction, store-count validation, compare-and-
switch of the active pointer, retained previous slots, duplicate detection, and
active-slot deletion rejection. Encrypted rescue tests remain valuable backup
evidence but no longer define whether an import may complete.

## Implemented Stage 1.5 Paid-Export Adapter Calibration — 2026-07-16

The first exporter-specific adapter was derived only from a structural visual
description, then tested with wholly fictional text. No friend conversation or
original export file was copied into the workspace or repository.

The shared TXT/DOCX preview parser now recognizes paragraphs or lines shaped as
`assistant: content` / `user: content` followed by a standalone
`timestamp:YYYY-MM-DD HH:mm:ss`. The timestamp line is attached to the preceding
paid-export turn instead of being exposed as a third speaker. ASCII/full-width
colons are accepted, empty paragraphs may sit between blocks, and a separator
or another meaningful row ends the attachment window. An orphan timestamp stays
uncertain and unowned instead of being silently assigned.

Parser version `history-preview-v2` invalidates stale preview fingerprints. The
synthetic TXT and synthetic DOCX forms normalize identically; a separately
generated client-ready Word example contains six fictional turns and is kept in
ignored `output/doc/` for manual intake checks. The real generated DOCX parses as
six accepted messages, two speaker candidates, six exact source timestamps,
zero uncertain rows, and zero `timestamp` speaker candidates.

## Implemented Stage 1.6 Identity Materialization + Chat Continuation — 2026-07-16

The final import action now closes the user-visible loop. `随导入新建` keeps
stable placeholder ids through parsing and review, then idempotently creates the
matching persona mask, progress bundle, and character only after archive
activation. Existing selected identities are linked without duplicate cards.
The success state says which entities were created and offers a direct
`去聊天里看看` action that activates the matching pair.

Chat reads the active sidecar through the version-2 `scope_imported_order`
index. It initially renders the newest 30 archived rows, can page older rows,
keeps them read-only above the legacy live timeline, and preserves new sends in
`AetherOS_Data.messages`. AI continuation receives at most the latest 24
user/character archive turns as transient context. System/unknown imported rows
are never promoted into system-prompt authority, and the full archive is never
loaded into each request.

The first real full-flow browser run exposed a v1 compatibility bug: paid-export
timestamps such as `2025-07-16 12:04:35` had exact precision but no timezone,
epoch, or ISO field, so formal import rejected them. Parser v2 now stores a
timezone-free local ISO wall clock, and archive mapping backfills the same value
for already-persisted review workspaces without inventing an epoch.

Canonical Chromium at 430x932 completed a fictional six-turn DOCX import into
new `雨夜面具 × 糯米` identities, opened the matching Chat timeline, sent
`我们从这里继续吧` as a normal live message beneath the archive divider,
then reloaded and recovered the new character, live turn, and all six archived
turns. Console errors were zero.

## Non-Negotiable Invariants

1. Every new historical record is scoped by `progressBundleId + charId` before
   it is usable by a surface or prompt.
2. Persona masks and character cards may begin as empty stable placeholders.
3. Imported source time/order, import time, and live-message insertion order are
   separate fields. Old history must never masquerade as a new live turn.
4. Bulk historical rows do not run through the current live MemoryDM cursor.
5. Imported rows do not enter `char.memories`, `refinedMemories`, impressions,
   anniversaries, hot state, wakeups, tasks, or current reminders automatically.
6. A neutral source/event ledger is the evidence owner. Companion and plot
   projections are nullable views over that evidence, not alternate truth stores.
7. `no_plot` is a successful result. Affection, volume, and a pleasant day do
   not prove narrative progress.
8. Private or sensitive material is filtered by deterministic scope/surface
   policy before prompt construction; model instructions are not the privacy
   boundary.
9. A model-reconstructed inner view is labeled as inference, not presented as
   something the historical character explicitly said or felt.
10. Stable source ids survive retry, duplicate import, backup/restore, later
    embedding backfill, and taxonomy changes.
11. Ordinary history intake is non-destructive and copy-on-write; destructive
    schema migration remains a separate operation that requires an explicit
    rollback plan.
12. When a backup is intentionally encrypted, encryption happens on device
    before that backup leaves the app and provider credentials are excluded by
    default. Plain local ZIP export remains a valid user choice.
13. Real private chat exports, raw DOCX files, credentials, runtime databases,
    and generated personal memory must never be committed to the repository.

## Ownership And Module Boundary

Historical import grows as an independently lazy-loaded virtual app. The root
shell only registers and opens it.

Planned ownership:

```text
apps/HistoryImportApp.tsx                 thin app route / page state
components/history-import/               preview, mapping, progress, archive UI
domain/historyImport/                     types, normalization, pure transitions
utils/historyImport/parsers/              TXT and DOCX adapters
utils/historyImport/storage/              scoped reads/writes and cursor paging
utils/historyImport/jobs/                 resumable import/digest/backfill jobs
utils/historyImport/retrieval/            search, policy gate, lexical/vector seam
utils/historyImport/backup/               typed history carrier/integrity primitives
utils/systemBackup/                       optional encrypted backup/export coordinator
scripts/verify-history-import.ts          Stage 0 verifier entry point
scripts/verify-history-import-contract.ts deterministic contract verifier
scripts/verify-history-import-jobs.ts     pure job and scale-fixture verifier
scripts/verify-history-import-storage-health.ts preflight/API-adapter verifier
scripts/verify-history-import-rescue.ts   encrypted carrier/restore verifier
scripts/verify-history-memory-quality.ts  retrieval/projection fixture verifier
```

`components/PhoneShell.tsx` must keep the app behind its existing lazy-feature
boundary. Parsing, storage, extraction, and backup logic must not move into
`App.tsx`, `PhoneShell`, `OSContext`, `Chat`, or `Character` merely because those
surfaces expose an entry or consume a result.

The working visible label is `历史导入`; final naming is not an implementation
blocker. A stable internal app id must be chosen once and not renamed with copy.

## Storage Direction To Prove In Stage 0

Do not bulk-insert historical rows into the current legacy `messages` store.
That path is character-only, auto-increment ordered, fully materialized by common
queries, and already consumed by private/group prompt paths.

The working direction is a scoped sidecar archive plus a logical timeline
adapter:

| Planned record family | Responsibility |
| --- | --- |
| `history_import_batches` | file fingerprint, scope, mapping, counts, cursor, status |
| `history_source_messages` | normalized source turns, stable ids, source order/time |
| `history_events` | neutral, source-linked key events and episode evidence |
| `history_companion_projections` | optional inner-view / relationship residues |
| `history_plot_projections` | optional sparse plot deltas and open threads |
| `history_jobs` | resumable import, digestion, rebuild, and vector backfill jobs |
| `memory_tag_registry` | canonical tag ids, aliases, merge/deprecation state |
| `history_backup_receipts` | rescue archive and restore verification receipts |

The Stage 0 data contract may consolidate stores where measured IndexedDB
behavior justifies it, but it may not weaken scope, provenance, invalidation,
backup, or independent projection boundaries.

`ConversationTimelineRepository` is the planned read seam for combining scoped
history with compatible live messages. It must page both sources, preserve
source-time ordering, keep legacy unscoped rows explicit, and avoid turning
history import into an implicit migration of every existing chat.

## Stage And Gate Map

| Stage | User-visible capability | Gate before proceeding |
| --- | --- | --- |
| 0 | storage health and recovery foundation | G0 durability + schema contract |
| 1 | file preview and mapping | G1 parser correctness |
| 2 | local archive and timeline | G2 import/archive correctness |
| 3 | search, event ledger, ordinary-chat recall | G3 retrieval/privacy |
| 4 | companion and sparse plot proposals | G4 memory-quality review |
| 5 | optional hybrid vector retrieval | G5 vector lifecycle |

No later stage may be used to excuse a failed earlier gate.

## Stage 0 — Contract, Durability, And Test Harness

### 0.1 Freeze the typed contract

Produce a dedicated data/read-write contract covering:

- stable ids and scope keys;
- source order, timestamp precision, timezone, and missing-time behavior;
- import batch and job state machines;
- source spans and evidence-family identity;
- continuity, branch, source mode, knowledge, sensitivity, and allowed surfaces;
- event, companion, plot, conflict/supersession, and review state;
- controlled tags and optional factual/inner-view embedding slots;
- cascade, stale, rebuild, tombstone, and deletion behavior;
- backup manifest, archive version, checksums, and restore receipts.

### 0.2 Build the fixture harness before UI

Add synthetic, non-personal fixtures and pure normalization/state tests. The
friend-supplied DOCX example is inspected locally only. Once its structural
shape is understood, commit a tiny synthetic equivalent rather than the real
conversation.

### 0.3 Add storage health

- report `navigator.storage.persisted()` state;
- request persistence from a user gesture before large import;
- estimate usage/quota and projected normalized size;
- reserve headroom and handle `QuotaExceededError` without partial truth;
- show `only local`, `persistent local`, and `external rescue verified` as
  distinct states.

### 0.4 Replace “download exists” with a recovery contract

- extend backup coverage explicitly for every new history store;
- exclude API keys and other credentials from the default rescue archive;
- encrypt private archive sections on device with a user-held passphrase or
  recovery secret that does not exist solely in the source IndexedDB;
- write a versioned manifest and per-section integrity hashes;
- export after the first successful import and before destructive migrations;
- on native builds, use Cache only as a temporary share handoff, never as the
  durable destination;
- restore into a temporary/new database, validate, then switch;
- retain the old database until the new database has a verified restore receipt.

### 0.5 Prove the database boundary in isolation

- create a synthetic-only sidecar IndexedDB lab with the eight explicit stores;
- page/write the same at-most-500-record rescue chunks and durable job
  checkpoints without materializing the whole history or touching the current
  production AetherOS database;
- inject quota/abort/reload failures and verify incomplete batches never become
  complete;
- restore the encrypted fixture into a separate temporary database, read it back,
  and pass the Stage 0.4 counts/hashes/ids/references verifier;
- preserve a byte/logical snapshot of the pre-test live database and prove every
  rejected restore leaves it unchanged;
- add no switch or production migration until these checks pass.

### G0 exit

No historical write code may ship until the G0 rows in the acceptance contract
pass. Stage 0 may add schema, fixtures, storage-health UI, and rescue/restore
code, but it must not ingest a real archive yet.

## Stage 1 — TXT/DOCX Parse And Preview

### 1.1 Parser adapters

Both adapters emit the same normalized preview records. DOCX extraction remains
local and treats Word XML/layout handling as an input adapter, not the memory
architecture.

The preview must preserve:

- original text and line/paragraph locator;
- proposed speaker and normalized role;
- source order and parsed time with precision/confidence;
- OOC/system/roleplay classification candidates;
- missing attachment placeholders;
- warnings for ambiguous speaker, wrapped lines, malformed dates, and content
  that was not interpreted.

Regex is appropriate for format cleanup after text extraction. It must not
silently force uncertain speaker or time mappings.

### 1.2 Mapping UI

The app requires explicit scope selection before final import:

- persona mask / progress bundle;
- character card;
- source speaker -> user/character/system mapping;
- timezone or “unknown”;
- relationship/canon/branch/scene-only source mode where known.

The user may keep placeholder identities, exclude rows, merge wrapped lines,
or leave uncertain metadata unresolved. The preview shows accepted, skipped,
uncertain, and duplicate estimates before any durable write.

### G1 exit

TXT and synthetic DOCX fixtures normalize deterministically, uncertain content
remains visible, and no preview action mutates the durable archive.

## Stage 2 — Resumable Archive And Timeline

### 2.1 Import job

- create the batch manifest before source messages;
- write bounded chunks with a durable cursor and monotonic progress;
- support pause, resume, cancel, retry, and safe app reload;
- use stable content/source fingerprints for idempotency;
- make a second import of the same batch a visible duplicate decision, not a
  second silent copy;
- keep the live MemoryDM/auto-memory cursors untouched.

### 2.2 Timeline repository and chat presentation

- query by `progressBundleId + charId` with cursor paging;
- sort historical rows by source time/order and live rows by their own timeline
  contract;
- render only a bounded window and preserve a jump anchor;
- mark imported-history boundaries without making every bubble visually alien;
- allow continuation after the archive without treating the final imported row
  as newly received today;
- keep group chat, proactive, call, and date prompts unable to read this archive
  until Stage 3 policy gates are active.

### 2.3 Batch lifecycle

Users can inspect a batch, export a rescue archive, correct mapping, rebuild
derived material, or delete the batch. Deletion must invalidate/cascade its
events, projections, indexes, and embeddings without touching unrelated masks
or live conversation.

### G2 exit

The large archive fixture imports, pauses/resumes, reloads, paginates, exports,
restores, and deletes with exact counts and no cross-scope or recency leakage.

## Stage 3 — Neutral Event Ledger, Search, And Recall

### 3.1 Independent digestion lane

Create resumable `history_digest` jobs with bounded overlapping windows. The
job records source ids, prompt/extractor version, attempts, errors, cost/token
estimates where available, and a stable output checksum. Re-running the same
version is idempotent.

### 3.2 Neutral evidence first

Persist factual/source event cards before any companion or plot projection.
Each accepted event includes source spans, time precision, entities/aliases,
controlled tag ids, importance, knowledge/sensitivity policy, review state, and
conflict/supersession links where applicable.

### 3.3 Two recall mouths

1. Human archive search returns event/message hits and jumps to original bubbles.
2. Ordinary chat retrieval returns only a few source-linked cards through the
   existing worldline-memory seam.

First release uses controlled tags plus lexical/date/entity matching. It does
not pre-truncate the candidate pool by recency, requires a relevance threshold,
deduplicates evidence families, and may correctly deliver nothing.

### 3.4 Hard delivery policy

Before formatting any prompt packet:

```text
scope -> continuity/branch -> knowledge/sensitivity -> allowed surface
      -> recall/initiative policy -> retrieval -> dedupe -> prompt budget
```

Imported private text must not be passed to a disallowed surface and then
“protected” only by an instruction telling the model not to quote it.

### G3 exit

Human search/source jump and ordinary-chat recall pass relevance, zero-leak,
bounded-prompt, unrelated-query, and visible-receipt acceptance rows.

Stages 0-3 are the first public release cut.

## Stage 4 — Companion And Plot Enrichment

### 4.1 Companion projection

Generate optional inner-view/relationship residues with derivation authority:

- `source_explicit`;
- `source_inferred`;
- `model_reconstructed`.

Every inference remains source-linked and reviewable. Repeated independent
evidence may propose a persona pattern; one scene may not silently become
permanent identity truth.

### 4.2 Plot disposition before extraction

Classify each source window as one of:

- `no_plot`;
- `atmosphere_only`;
- `relationship_maintenance`;
- `milestone_candidate`;
- `plot_event`;
- `open_thread`.

Only gated windows enter plot extraction. Stored plot nodes require an evidenced
before/after delta in goal, obstacle, choice, consequence, open thread,
world-state, or relationship state. Generic romantic closure and invented
off-screen action are rejected.

### 4.3 Review-first enhancement

Persona/card completion, relationship phases, task/story arcs, and language
fingerprints appear as diffs with source evidence. They do not silently mutate
`systemPrompt`, user profile truth, `char.impression`, current tasks, reminders,
or mainline canon.

### G4 exit

Companion-heavy fixtures retain texture while accepted plot false positives are
zero after deterministic gating. All applied enrichment has a review/apply
receipt and reversible source linkage.

## Stage 5 — Optional Vector Upgrade

- backfill factual and inner-view embeddings independently;
- record model, dimension, checksum, version, generated time, and status;
- never change source/event ids during backfill;
- keep exact/date/entity and controlled-tag retrieval beside vectors;
- apply scope/privacy gates before semantic search;
- rebuild missing or stale embeddings without reparsing DOCX/TXT;
- do not delete raw source or neutral event truth because vectors exist.

### G5 exit

Hybrid retrieval improves paraphrase recall without reducing exact-name/date
recall, leaking across scopes, or changing prompt budgets and source receipts.

## Bug Fix Timing

Fix before Stage 0/G0:

- backup secret leakage and explicit new-store coverage;
- stable scope/id/time contracts;
- recovery-safe migration and restore validation;
- deletion/invalidation rules.

Fix while Stage 1-2 are built:

- bounded import transactions and resumable cursors;
- timeline paging and source-time ordering;
- duplicate batch behavior and quota failure UX.

Fix before Stage 3 is enabled:

- deterministic surface/privacy filters;
- evidence-family dedupe and relevance thresholds;
- unbounded `refinedMemories`/legacy-context interactions for imported material;
- group/private prompt isolation for imported history.

Fix with Stage 4-5:

- plot false positives and inner-view authority;
- contradiction/supersession review;
- embedding lifecycle and semantic fallback tuning.

This schedule does not excuse existing privacy bugs. It prevents them from
blocking a parser-only slice while forbidding imported history from reaching
the affected prompt path before the hard gate exists.

## Explicit Holds

Until the relevant gate passes, do not add:

- external DriftStone, AsherieSystem, Hippocove, or other heavy runtime services;
- server-side plaintext history storage or mandatory accounts;
- automatic persona/system-prompt overwrite;
- automatic current tasks, reminders, wakeups, or hot-state activation from old
  history;
- automatic mainline-canon promotion;
- mandatory vector database dependency;
- full raw archive injection into model context;
- destructive migration or cleanup of legacy messages.

## Handoff And Progress Discipline

Each stage closes only when all of the following agree:

1. typed contract and project docs;
2. implementation and migrations;
3. deterministic verifier output;
4. browser acceptance evidence at the canonical 5174 frontend;
5. backup/restore or rollback evidence where data changed;
6. a dated `progress.md` entry describing what passed and what remains HOLD.

The next code action is G2 archive usability and failure recovery: add a scoped
paged search/source-jump seam plus explicit quota/retry and rebuild/delete states.
The transcript calendar and whole-device daily JSON coverage are complete and
must not be rebuilt by copying raw history into legacy messages. Prompt
retrieval, companion/plot digestion, vectors, server-side plaintext storage,
native APK file-adapter/update acceptance, and any destructive legacy migration
remain out of scope until their own gates pass.

## Implemented Stage 1.7 Daily Archive + Independent Calendar — 2026-07-16

- Added schema-v1 daily JSON documents scoped by progress bundle, persona mask,
  character, and source day, plus a body-free summary index for bounded month and
  coverage reads. Untrustworthy dates stay in explicit undated buckets.
- Final history activation backfills the active sidecar in 500-row pages and
  records an idempotent receipt. Ordinary one-to-one message saves append to the
  same repository; edits advance revisions and deletes/clear operations write
  tombstones without allowing a secondary-archive error to block live chat.
- Added the independent `对话日历` App. It is not `时光簿`: the calendar shows
  source bubbles read-only by day, opens the newest available day, and renders
  at most 80 additional rows per visible block.
- Extended password-free whole-device backup to version 4. Each daily document
  is emitted as its own JSON file with a stable path, byte length, SHA-256 hash,
  and manifest entry; restore verifies the full set before daily-DB replacement.
- Locked the code/data lifecycle: browser uses a dedicated IndexedDB adapter;
  the later APK must reuse the JSON contract in app-private persistent storage.
  Remote/signed APK updates may replace code and assets, never chats, generated
  memories, daily archives, identity data, media, or appearance/settings.
- Deterministic daily-contract tests and TypeScript checks pass. Real 430x932
  Chromium imported six synthetic Word turns, opened them by date, appended a
  seventh live turn on the current date, reloaded/unlocked, and recovered both
  years of coverage and the current-day bubble with zero console errors.

HOLD: APK filesystem adapter/signing/update rehearsal, human search/source jump,
daily-to-memory-card generation, semantic/vector recall, cloud transport, and
device-recognized encrypted packages.
