# Companion Material Authority and Supersession Contract

This contract governs reviewed companion material only. It does not edit a
character card, change Chat behavior, choose a tool, create a current motive,
or promote a material into memory truth.

## Authority order

For the same character and semantic lane, sources have an explicit review
order:

1. A future, human-reviewed role-card calibration may correct or replace an
   SMS-derived material.
2. The reviewed SMS cluster pack (`lysk-sms-material-analysis-v1`) provides
   non-verbatim behavioral evidence while no higher-authority correction is
   present.
3. Import candidates and unreviewed private evidence are never runtime
   authority on their own.

Authority is scoped. A role-card revision does not erase an unrelated SMS
cluster, and it does not turn a source title, a scene event, or private dialogue
into prompt material.

## Required replacement path

When a higher-authority review disagrees with an active material, the change
must be auditable:

1. Create a new material id and revision with its own non-verbatim guidance and
   source references.
2. Add the old-id to new-id relation to
   `BUILT_IN_DEEPSPACE_MATERIAL_SUPERSESSION` in
   `domain/companionMaterial/builtInDeepspaceReviewed.ts`.
3. Disable or remove the superseded record from the active published set in the
   same reviewed change. Keep its opaque provenance available for audit.
4. Re-run material, retrieval, and surface-gating verification. A replacement
   must still demonstrate a positive legal path; a silent zero-candidate result
   is not a successful correction.

Appending a second, conflicting active record without a supersession relation
is prohibited. The purpose is to prevent a future role card and old SMS
evidence from quietly piling up into contradictory directions.

## Boundaries that survive every authority level

- Guidance is non-verbatim and never contains private source text, titles, or
  URLs.
- Stable voice/base material describes a range of character-owned tendencies;
  it is not a reply template, compulsory affection, relationship fact, or
  current motive.
- Opening, proactive, motive, and scene material remain surface-gated. They do
  not become ordinary chat context just because they share a character.
- Retrieval metadata is not prompt text and does not allow, deny, or execute
  tools.
- A delivery receipt can prove prompt delivery only. It cannot prove played
  truth, memory promotion, a changed relationship state, or a character-life
  event.
