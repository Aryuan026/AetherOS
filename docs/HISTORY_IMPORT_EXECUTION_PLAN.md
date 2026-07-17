# AetherOS Historical Conversation Import

Status: v2 clean transport implemented; Calendar AI extraction HOLD

Last updated: 2026-07-17

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

The daily archive uses `AetherOS_DailyArchive:v2`.

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

## Calendar AI Base — HOLD

The only implemented analysis object is a source handoff:

- relationship scope;
- source document ids;
- source revision fingerprint;
- requested question;
- creation time.

`createHeldDailyArchiveAnalysisRun` always returns:

- `status: "hold"`;
- `holdReason: "module_fit_unverified"`;
- `output: null`.

It does not call a model. It does not name or persist persona, relationship,
plot, event, language-fingerprint, tag, vector, memory-card, or narrative-run
outputs.

Before lifting HOLD, audit every possible consumer independently:

- what question that module needs history to answer;
- which source granularity is safe;
- whether the result is evidence, a proposal, or current state;
- whether human visibility, correction, expiry, and deletion are required;
- how the result remains source-linked and cannot become “recently happened.”

Only after that audit may a derived schema or store be introduced.

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
- Calendar AI HOLD with no output.

## Explicit Holds

- Calendar AI extraction categories and prompts;
- companion/persona/relationship inference;
- plot/mainline/NPC/time-conversion analysis;
- language fingerprints and tag governance;
- vectorization and semantic retrieval;
- Date-specific historical-scene handoff;
- automatic memory, NarrativeRun, ExperienceReceipt, Character Life, or current
  state writes from imported evidence;
- cross-device/cloud backup UX and native APK filesystem adapters.
