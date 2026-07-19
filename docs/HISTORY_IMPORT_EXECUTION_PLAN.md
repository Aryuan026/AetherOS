# AetherOS Historical Conversation Import

Status: v2 clean transport implemented; historical-analysis foundation active, model execution HOLD

Last updated: 2026-07-18

## Product Intent

The import path should feel like bringing a companion home, not filling out a
forensics form:

1. choose an existing or placeholder mask/character relationship;
2. choose a TXT or DOCX file;
3. archive the original conversation locally;
4. open Chat and continue.

Import is transport. It does not ask the user to classify every line, decide
whether the source is companion chat or roleplay, interpret virtual time, or
approve model-generated relationship conclusions.

## Raw Evidence Contract

The parser recognizes only export-author channels that are explicit in the
source:

- `user:` -> `authorChannel: "user"`;
- `assistant:` or `char:` -> `authorChannel: "char"`;
- non-empty text without one of those markers -> `source_fragment` with no
  author channel.

An author channel is not an in-world speaker label. One exported user turn may
contain the user's narration, several NPCs, and stage directions; one exported
assistant turn may do the same. The transport layer must not pretend that
per-line character attribution can solve co-authored roleplay.

Each accepted source record preserves:

- raw text and display content;
- source order;
- source locator;
- source timestamp text and available precision;
- selected relationship scope;
- source fingerprint and immutable record id.

Empty paragraphs, separators, and orphan timestamp rows are skipped. Repeated
non-empty rows are preserved. There is no import-time dedupe or merge.

## Local Storage

The intake workspace uses `AetherOS_HistoryIntake:v2` and writes rows in chunks.
The formal archive uses `AetherOS_HistoryArchive:v2:<slot>` and contains exactly
four store families:

- `history_import_batches`;
- `history_source_messages`;
- `history_jobs`;
- `history_backup_receipts`.

The daily archive uses the clean `AetherOS_DailyArchive:v3` schema. Exact-file
batch identity uses relationship scope plus source-file SHA-256, not parser
version, so upgrading parsing code cannot duplicate an already imported file.

These are clean pre-product breaks. There is no reader, compatibility field, or
migration for the deleted review workspace or speculative derived stores.

The existing encrypted rescue implementation remains available for later
whole-device backup integration. The operator server hosts code only and is not
assumed to retain user history.

## Surface Projections

Raw history is medium-neutral evidence. Each product surface must make its own
explicit projection:

### Chat

- Show imported history as a past archive container, not current WeChat bubbles.
- On the first successful continuation only, the main chat request may receive
  up to 24 explicit user/char historical turns.
- Mark every imported turn `temporalClass: "historical"` and
  `source: "history_import_tail"`.
- Exclude historical turns from current emotion, care, open-thread, hot-state,
  story-signal, Character Life, schedule, receipt, and memory writes.
- Tell the model that the current surface is remote text. Historical actions,
  positions, environments, and stage directions do not continue unless the
  current user explicitly reopens a scene.

### Date / Meeting

- Do not read or auto-resume the Chat history tail.
- A later Date-specific bridge must be designed explicitly if historical scene
  evidence is ever useful there.

### Dialogue Calendar

- Browse imported and live records by relationship and source day.
- Render missing author channels as `原文片段`.
- Keep full local keyword search and source jump available.
- Permit clipping only from explicit user/char export channels.

## Historical Analysis Foundation

The first consuming-module audit authorized three durable projection families
over the same evidence: relationship memories, timebook nodes, and a narrative
profile. These are not the only runtime consumers. The foundation therefore
provides:

- full `progressBundleId + personaMaskId + charId` scope in every stable key,
  archive index, cursor, analysis pass, workspace, binding, overlay, and derived
  result;
- token/call preflight for `quick_merge` and `deep_daily` plans;
- real timestamp days as the only visible source boundary;
- hidden, bounded deep-analysis packets that do not become another review UI;
- immutable completed `HistoryAnalysisPass` records containing source-linked
  relationship memories, timebook nodes, and `HistoricalNarrativeProfile`;
- one relationship interpretation workspace plus additive evidence bindings and
  append-only human correction overlays;
- explicit continuity, interaction surface, memory policy, temporal class, and
  authority axes rather than one companion/roleplay enum;
- atomic pass/binding publication and optimistic workspace revision checks in a
  clean relationship-scoped v2 analysis DB;
- pure relationship-scoped read projections for future Contact, Timebook, and
  narrative-director consumers, with a shared `memoryCore` delivery adapter
  still required before the rest of the phone may safely use them.

Every automatic result begins as `soft_canon` and remains correctable. The
historical profile is read-only background for a future narrative director. It
is not an active run, scene, experience receipt, or current Character Life
state.

Model execution, prompts, Calendar UI, Contact/Timebook surface wiring, narrative
director route continuation, vectorization, and whole-device backup inclusion
remain HOLD as separate implementation boxes. The read-only Director context is
now connected; it still has no mutation authority.

## Re-analysis And Human Correction UI — Planned Next Box

The human-facing flow should stay short:

1. From Calendar, choose a day range or the currently selected source passage
   and tap `整理这段历史`.
   A passage selection uses two contiguous endpoints (`从这里` / `到这里`), not
   dozens of message checkboxes, and is independent of clipping-size limits.
2. Show approximate token/call cost and the existing quick/deep plans. If this
   source was analyzed before, say `可以再次整理，上次结果会保留`; do not block
   or introduce another analysis-mode questionnaire.
3. When complete, show one small delivery receipt with direct destinations:
   `去看记忆 / 去看时光簿 / 去看剧情线 / 去聊天`. Do not create a permanent
   fourth result app.
4. Edit results in place. Every destination card exposes a compact edit action
   and a source jump. List headers and empty states expose `手动补一条`.
5. StoryDesk shows source evidence naturally inside each relevant route. It does
   not show membership counts, `同时属于 N 条线`, or a multi-route badge. A
   compact edit sheet may add an association to another route or remove one
   association; every other binding and the Calendar source remain intact.

The data layer already separates immutable `HistoryAnalysisPass` output from the
editable `HistoricalInterpretationWorkspace`. Manual changes are versioned
overlays with `user_confirmed` historical authority. Exact duplicates merge in
the resolved view while pass history remains available for a future collapsed
`整理记录`. Multiple route bindings are normal. The destination UI and the
entity-level `有两种整理` notice for genuinely contradictory facts remain to be
implemented.

Destination responsibilities:

- Contact memory: edit/add/hide relationship memories and return to source;
- Timebook: edit/add/hide title, date certainty, and page summary;
- StoryDesk: rename historical routes, add NPC/stage/open-thread notes, and bind
  one source passage to several routes;
- Calendar: preserve and render source only; never accept edits to transcript
  text from the analysis result flow.

These destinations are correction homes, not an exhaustive consumer list.
Chat, Call, proactive letters, Group Chat, Date, Special Moments, Diary,
Guidebook, Social, and selected creative surfaces must read appropriate slices
through the same full-scope historical selector. Shared and HOLD surfaces must
receive none. See `docs/HISTORY_REUSE_SURFACE_AUDIT.md`.

Editing historical material is not route activation. `继续这条线` remains a
separate explicit narrative action and still cannot skip scene play and receipt
confirmation.

## Verification Gates

The current implementation must keep these commands green:

```bash
npm run verify:history-import
npm run verify:daily-archive
npm run verify:narrative
npm run verify:health
```

The deterministic history suite covers:

- TXT/DOCX parsing, including WPS/mobile self-closing paragraphs;
- multiple marked turns inside one Word paragraph;
- 50,000 generated source messages and chunk checkpoints;
- 1,201-row resumable intake;
- four-store archive/rescue/restore integrity;
- immutable relationship scopes and delayed AI replies;
- Chat historical-state isolation;
- Date non-consumption of the history tail;
- relationship-isolated analysis preflight and atomic multi-pass publication;
- repeated same-source passes, exact-card coalescing with provenance,
  many-to-many route bindings, isolated binding removal, user overlay
  edit/create/hide/restore, re-analysis survival, and cross-mask rejection.

The deterministic G6 foundation fixtures now cover:

- repeated analysis of the same source preserving both pass records;
- one source span bound to two routes simultaneously, with one binding removable
  without touching the other;
- user overlays surviving re-analysis without mutating pass output or source;
- source-free manual additions rendering as user-attested, never extracted;
- exact duplicate coalescing without deleting pass provenance.

Entity-level contradiction detection and every visible correction control remain
in the next UI/model box; they are not claimed by the storage fixtures.

## Explicit Holds

- model extraction prompts and runtime calls;
- Contact-memory and Timebook surface wiring;
- full-phone historical selector and consumer coverage;
- Calendar multi-pass runtime and destination correction UI;
- explicit historical route continuation;
- time-conversion analysis;
- language fingerprints and tag governance;
- vectorization and semantic retrieval;
- Date-specific historical-scene handoff;
- automatic memory, NarrativeRun, ExperienceReceipt, Character Life, or current
  state writes from imported evidence;
- cross-device/cloud backup UX and native APK filesystem adapters.
