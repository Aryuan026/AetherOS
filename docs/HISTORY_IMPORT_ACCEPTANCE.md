# Historical Conversation Import Acceptance

Status: v2 transport accepted; historical-analysis contract/storage accepted, model execution out of scope

Last updated: 2026-07-18

## G0 — Product Flow

- [x] The user can choose an existing or placeholder relationship.
- [x] TXT and DOCX use the same import route.
- [x] The primary route is relationship -> file -> archive -> Chat.
- [x] Import completion does not require per-row edits, speaker quizzes,
      conversation type, timezone, virtual-time, or companion/plot choices.
- [x] The completion action creates missing placeholder identity records
      idempotently and activates the selected relationship.

## G1 — Parser And Evidence

- [x] Explicit `user:` maps to export channel `user`.
- [x] Explicit `assistant:` and `char:` map to export channel `char`.
- [x] Multiple marked turns inside one TXT line group or DOCX paragraph split
      into ordered records.
- [x] Wrapped content remains attached until the next explicit channel marker.
- [x] Timestamps are preserved as source evidence and are not interpreted as
      virtual-world time.
- [x] Empty paragraphs, separators, and timestamp-only rows are skipped.
- [x] Every other non-empty row is preserved as an unattributed source fragment.
- [x] Duplicate source rows are not silently removed or merged.
- [x] WPS/mobile self-closing DOCX paragraphs are accepted while genuinely
      incomplete `document.xml` paragraph structure is rejected.
- [x] No private real-world conversation fixture is committed.

## G2 — Clean Local Storage

- [x] Intake rows persist in `AetherOS_HistoryIntake:v2` in bounded chunks.
- [x] The formal archive uses `AetherOS_HistoryArchive:v2:` slots.
- [x] The formal archive contains exactly batches, source messages, jobs, and
      backup receipts.
- [x] The daily archive uses `AetherOS_DailyArchive:v2` and current chunk stores.
- [x] There is no legacy review reader, compatibility field, or migration.
- [x] There is no active event, companion projection, plot projection,
      tag-registry, or embedding store.
- [x] A 50,000-message synthetic run keeps ids stable and checkpoints monotonic.
- [x] A 1,201-row intake resumes and pages without materializing every row in UI.
- [x] Encrypted rescue validates all four stores, credential exclusion, chunk
      integrity, temporary restore, and switch preconditions.

## G3 — Relationship And Daily Archive Isolation

- [x] Stable history scope keys, archive indexes, timeline cursors, and analysis
      indexes include progress bundle, persona mask, and character.
- [x] Opening an older v2 archive DB rebuilds the incomplete relationship
      indexes in place without deleting source records.
- [x] Every newly created one-to-one message freezes progress bundle, mask, and
      character scope in message metadata.
- [x] A delayed AI reply keeps the scope captured when the request started.
- [x] Edit, delete, batch delete, and clear write revisions/tombstones to each
      message's own scope.
- [x] An old message without scope fails closed and cannot pollute the active mask.
- [x] The same character under two masks produces isolated daily archives.

## G4 — Surface Boundaries

### Chat

- [x] Imported history renders as a past archive container.
- [x] The first successful continuation may carry at most 24 explicit user/char
      historical turns; source fragments do not become prompt roles.
- [x] Historical turns remain visible to the main chat request.
- [x] Historical turns are excluded from current emotion, care, open threads,
      hot state, story signal, Character Life, and memory/narrative writes.
- [x] The prompt declares remote text as the current medium and prevents old
      actions, positions, environments, and stage directions from auto-continuing.

### Date / Meeting

- [x] Date does not read `history_import_tail` or `HistorySourceMessage`.
- [x] Imported history alone cannot reopen a physical meeting scene.

### Dialogue Calendar

- [x] Records are visible by relationship/day with bounded page rendering.
- [x] Full relationship-local keyword search includes unattributed source fragments.
- [x] Unattributed rows render as `原文片段`, never as the current user.
- [x] Clippings preserve original text and source; they do not auto-write persona,
      memory, relationship, or prompt changes.

## G5 — Historical Analysis Foundation

- [x] Preflight freezes the full relationship scope, source documents, source
      revisions, source fingerprint, approximate tokens, and calls.
- [x] Quick merge and day-by-day deep analysis remain separate processing plans,
      not companion/roleplay labels.
- [x] Real timestamp days remain the only human-visible segmentation.
- [x] One atomic snapshot holds source-linked relationship memories, timebook
      nodes, routes, NPCs, relationship stages, and unresolved threads.
- [x] Continuity, interaction surface, memory policy, temporal class, and
      authority are independent fields.
- [x] Automatic results default to soft/correctable historical material.
- [x] Same-character analysis under two persona masks remains isolated.
- [x] Rerun publication uses optimistic concurrency and exposes no partial
      memory/timebook/profile state.
- [x] Runtime validation rejects current-state, active-run, scene, and receipt
      fields in historical snapshots.
- [x] Pure read projections return only the active relationship's visible
      memory/timebook rows and historical narrative profile.
- [ ] Calendar model prompts and execution are implemented.
- [ ] Contact-memory and Timebook surfaces merge the new read projections.
- [ ] Narrative Director consumes a historical profile.
- [ ] Analysis snapshots are included in whole-device backup/restore.

The unchecked items are explicit next boxes, not claims hidden behind the new
schema.

## Verification Commands

```bash
npm run verify:history-import
npm run verify:daily-archive
npm run verify:narrative
npm run verify:health
git diff --check
```

All implementation claims above must be backed by these deterministic suites or
a documented real-browser test. The current v2 contract does not claim semantic
or vector retrieval readiness merely because keyword search is available.
