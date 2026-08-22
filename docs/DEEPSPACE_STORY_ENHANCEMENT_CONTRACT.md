# DeepSpace Character And Story Enhancement Contract

This contract keeps a built-in character's everyday performance, native story
evidence and player-created expansions from becoming one undifferentiated
prompt. Xavier is the first runtime implementation; the remaining four leads
must use the same schema and gates rather than inventing one book per lead.

This file defines route ownership and runtime gates. The separate
[`DEEPSPACE_WORLDBOOK_AUTHORING_AND_ADMISSION_STANDARD.md`](./DEEPSPACE_WORLDBOOK_AUTHORING_AND_ADMISSION_STANDARD.md)
defines source completion, de-duplication and model-facing prose quality. A
runtime-capable built-in book is not automatically source-complete or closed.

## Ownership layers

1. **Human performance control** stays in the stable character prompt. Evidence
   may check or route it, but never silently rewrites the human-authored
   expression, initiative, temperature or relationship-tension guidance.
2. **Cross-route stable facts** may enter the stable card only after review.
   Xavier currently keeps only the light-based Evol and general sword/firearm
   foundation there.
3. **Native route facts** live in separate optional Worldbooks, but source lane
   is not continuity. Special Police 013, Light Hunter and the resident-hunter
   mainline are ordered stages of Xavier's same present-world history; disabling
   one only withholds its details from this request and never erases that past.
4. **Relationship facts** require a real relationship-stage owner before they
   may affect runtime. A source relationship is not the current player's lived
   history.
5. **Optional world expansions** are separate additive packages. They may
   bridge new play modes but cannot rewrite native DeepSpace terms, histories,
   organizations or abilities.
6. **Calibration examples and review scaffolding** remain private test inputs;
   they are not runtime prose.

## Xavier checkpoint

Xavier now has one reviewed stable character prompt, one ordered present-world
history split into four readable books and two open IF premises. Two
additional expansions are universal rather than Xavier-owned:

- Philos prince / knight IF
- Ember City IF
- Special Police 013 → present-day Light Hunter → Restricted Zone 42 → resident hunter / N109
- universal multi-worldline compatibility expansion
- universal modern anomaly-governance expansion

Eight books are player-visible, read-only built-ins. Both expansion books
can be assigned to any character rather than being owned by Xavier. They are present in
the library but are **not mounted by default**. The retired aggregate Xavier
story book is removed atomically on startup without mounting any replacement.

The two source endings are separate Director-only references. They do not
appear in the player library and cannot be mounted on their own. Explicitly
mounting the matching Philos or Ember premise makes its paired ending eligible
only for an IF `world_director` request, where it serves as comparison material
instead of prophecy, character knowledge or a required result.

## Runtime gates

Every built-in story package records character or universal applicability,
source lane, continuity class, worldline,
review/evidence status, allowed consumers and explicit activation. Runtime also
requires:

- the exact character for character-owned material, or universal applicability;
- an explicit mount;
- an allowed surface;
- mainline / IF continuity when the source lane requires it;
- the active DeepSpace identity mode when the package declares one;
- normal Worldbook knowledge, relevance and character-budget checks.

Package existence and package delivery both have `truthEffect:none`. They never
create current state, motive, memory, completed experience or relationship
stage. A route book may reach Chat or Call only when the player explicitly
mounted it, the live topic is relevant, the identity/continuity gates pass and
the normal character budget selects it. Plain-novel prose, scene planning and
narrative growth pass the active identity context to the same selector.

## Capability truth

- **available:** the reviewed built-in package exists in the local library;
- **selected:** the player explicitly mounts the exact book;
- **delivered:** a matching story consumer projects it within budget and later
records the normal Worldbook delivery receipt;
- **happened:** never inferred from the package; only confirmed narrative or
  memory owners may establish this.

For canonical chronology, “not selected” means **not delivered in this
request**, not “did not happen”. For a playable IF, the book provides a world,
factions, NPCs and open conflicts; a source ending belongs in a separate ending
reference and must not prewrite the player's result. The existing references
are `director_only`, automatically paired with an explicitly mounted matching
premise, and never enter Chat, Call, Date or the player's Worldbook DOM.

Unresolved source details stay labeled unresolved. Thin evidence is a reason to
withhold a claim from stable canon, not a reason to delete the route or rewrite
human performance controls.

## Rollout rule for all five leads

Each lead must close against the same coordinates:

`character × source lane × worldline × route stage × relationship stage`

No later lead may copy Xavier's conclusions by analogy. Qi Yu and Zayne's old
aggregate enhancement books remain migration work until their own route-level
review is complete.
