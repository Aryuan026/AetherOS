# Character Behavior Boundary Contract

## Product shape

The character page exposes one player-owned surface:

```text
设定 → 行为边界 → 记忆 → 关系印象
```

Only rules written by the player appear in `行为边界`. Reviewed source
baselines for built-in characters stay runtime-internal.

The visible flow deliberately asks no category question and has two authoring
paths inside the same editor:

- `直接写要求` is the default expert path. One already-usable instruction is
  stored and delivered verbatim. The boundary compiler may classify it for
  retrieval, but may not rewrite its wording.
- `帮我整理` is the low-floor path. The player may write one short, imperfect
  description of what feels wrong. The shared `behavior_boundary_compilation`
  task asks the configured system director to produce one bounded, editable
  candidate with an activation policy and multiple legal exits. It may return
  no stable rule rather than inventing one from an unclear one-off complaint.

`每次都遵守` and `内容相关时提醒` remain visible in the structured editor because
they materially change prompt delivery. Only optional exceptions are folded.

## Semantic placement

Behavior guidance occupies a parallel advisory slot:

```text
behavior_calibration
```

It is deliberately separate from:

- stable character voice and canon;
- current state or current motives;
- relationship facts and memories;
- Narrative / ScenePlan lifecycle;
- tool availability, choice, request, or execution.

Every projection therefore reports:

```text
truthEffect: none
currentStateEffect: none
memoryEffect: none
toolPolicyEffect: none
expressionEffect: advisory
```

## Two authorities

### Runtime-internal source review

- Evidence comes from reviewed, non-verbatim source clusters.
- Shared interaction qualities remain in
  `domain/companionMaterial/interactionQuality.ts` and are stored once.
- Reviewed source clusters back the five character realizations. An
  owner-reviewed conversation method may add a product-level shared operator,
  but it cannot masquerade as character evidence or become character truth.
- Fine-grained embodied, prop, routine, and space anchors live in
  `domain/characterBehaviorBoundary/builtInReviewed.ts`.
- Micro anchors are relevance-required and scene-only. They do not enter
  normal Chat, Call, or proactive letters.
- Withheld negative candidates and owner-reported observations with no
  reviewed evidence never enter runtime.

### Player-authored requirements

- Saved on `CharacterProfile.behaviorBoundaryRules`.
- Visible, editable, disableable, and removable by the player.
- Carry an explicit `playerInputMode`; direct instructions and guided notes are
  different authorities and are never silently converted into each other.
- Direct instructions default to resident and retain their exact text. Compiled
  notes default to relevance-required unless the system director can justify a
  truly cross-scene boundary, and keep multiple possible exits.
- Belong to the character, independent of provider, channel, API preset, and
  currently active model. Provider-specific quirks belong in a future global
  model-family adaptation layer, not in each character record.
- May be relevance-required or explicitly resident.
- When a player-authored `interaction_pattern` rule is selected, the overlapping
  shared interaction-quality block is omitted for that turn so two calibration
  lectures do not press on the same response. A clothing, prop, routine, body,
  or space detail never suppresses an unrelated refusal/care/pause boundary.

## Retrieval and delivery

- Exact character and relationship scope are checked before selection.
- Route gates are checked before relevance.
- Explicit trigger keywords drive micro-detail retrieval; explanatory mismatch
  text is never re-tokenized as retrieval input.
- Up to six short resident direct instructions may enter through their own
  bounded quota, followed by at most two relevant guided/source calibrations.
  The shared character budget is still authoritative, so a large rule list
  cannot grow without limit.
- The model never sees source dialogue or private references. Player-authored
  direct instructions and guided mismatch notes are intentional, visible
  exceptions to the no-negative-fragment rule: their wording is player
  authority, paired with at least one positive direction, and never inferred
  from private source evidence.
- Stored malformed rules fail closed and cannot block the main conversation.
- Exact repeats revise an existing compiled rule. Similar but meaningfully
  distinct requirements remain separate and editable; they are not
  semantically merged behind the player's back.

## Compilation and reroll

- Both Character and Chat resolve the typed
  `behavior_boundary_compilation` task through the global dual-AI router. They
  do not store another URL/key/model form.
- A Character-page `帮我整理` call receives bounded character context and the
  player's note. It never modifies direct expert instructions.
- Chat reroll may be used as ordinary `只重来`, or with an optional reason as
  `重来并记住`.
- When a stable rule is compiled during reroll, the accepted rule is delivered
  to that same reroll through a transient projection before later turns read it
  from the character record.
- The rejected reply and raw dissatisfaction note are compiler input only.
  They do not become relationship memory, current state, played plot, or saved
  behavior text.
- Compiler failure remains visible but does not block the visible reroll.
- A compilation receipt stores task/provider, optional exact relationship
  scope, input/output hashes, status and accepted rule ID. It stores no API key,
  raw note, or rejected reply and fixes `truthEffect`, `memoryEffect`, and
  `currentStateEffect` to `none`.

## Model-pressure rule

The behavior block must add recognizable texture without taking over the
response. A valid provider payload keeps:

- the character card as the identity base;
- reliable current context as the source of facts;
- at least one player-provided direction plus room for other legal exits;
- one optional continuity anchor for a micro scene detail;
- room for independent initiative, variable emotion, and future tool choice.

The contract is verified by:

```bash
npm run verify:character-behavior-boundary
```
