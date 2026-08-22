# DeepSpace Character And Story Enhancement Contract

This contract keeps a built-in character's everyday performance, native story
evidence and player-created expansions from becoming one undifferentiated
prompt. Xavier is the first completed implementation; the remaining four leads
must use the same schema and gates rather than inventing one book per lead.

## Ownership layers

1. **Human performance control** stays in the stable character prompt. Evidence
   may check or route it, but never silently rewrites the human-authored
   expression, initiative, temperature or relationship-tension guidance.
2. **Cross-route stable facts** may enter the stable card only after review.
   Xavier currently keeps only the light-based Evol and general sword/firearm
   foundation there.
3. **Native route facts** live in separate optional Worldbooks. Mainline, IF,
   card story, anecdote and event lanes never become one aggregate book.
4. **Relationship facts** require a real relationship-stage owner before they
   may affect runtime. A source relationship is not the current player's lived
   history.
5. **Optional world expansions** are separate additive packages. They may
   bridge new play modes but cannot rewrite native DeepSpace terms, histories,
   organizations or abilities.
6. **Calibration examples and review scaffolding** remain private test inputs;
   they are not runtime prose.

## Xavier checkpoint

Xavier now has one reviewed stable character prompt, five independent native
route books and two independent expansion books:

- Philos prince / knight IF
- Ember City IF
- Special Police 013 anecdote
- present-day Light Hunter card line
- present-day hunter / N109 mainline
- multi-worldline compatibility expansion
- modern anomaly-governance expansion

All seven books are player-visible, read-only built-ins. They are present in
the library but are **not mounted by default**. The retired aggregate Xavier
story book is removed atomically on startup without mounting any replacement.

## Runtime gates

Every built-in story package records character, source lane, worldline,
review/evidence status, allowed consumers and explicit activation. Runtime also
requires:

- the exact character;
- an explicit mount;
- an allowed surface;
- mainline / IF continuity when the source lane requires it;
- the active DeepSpace identity mode when the package declares one;
- normal Worldbook knowledge, relevance and character-budget checks.

Package existence and package delivery both have `truthEffect:none`. They never
create current state, motive, memory, completed experience or relationship
stage. Chat and Call are not allowed consumers for Xavier's route and expansion
books. Plain-novel prose, scene planning and narrative growth pass the active
identity context to the same selector.

## Capability truth

- **available:** the reviewed built-in package exists in the local library;
- **selected:** the player explicitly mounts the exact book;
- **delivered:** a matching story consumer projects it within budget and later
  records the normal Worldbook delivery receipt;
- **happened:** never inferred from the package; only confirmed narrative or
  memory owners may establish this.

Unresolved source details stay labeled unresolved. Thin evidence is a reason to
withhold a claim from stable canon, not a reason to delete the route or rewrite
human performance controls.

## Rollout rule for all five leads

Each lead must close against the same coordinates:

`character × source lane × worldline × route stage × relationship stage`

No later lead may copy Xavier's conclusions by analogy. Qi Yu and Zayne's old
aggregate enhancement books remain migration work until their own route-level
review is complete.

