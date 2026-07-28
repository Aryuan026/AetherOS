# Historical Record Analyzer Specification

This is a source-agnostic review method for turning a character-attributed
history into four kinds of non-verbatim material: language fingerprint,
stable detail claims, opening/proactive candidates, and scene texture. It is
not a runtime integration, character card, memory writer, or a prompt copied
from any one source system.

Its language-fingerprint lane is derived from the useful core of DriftStone:
rank evidence before synthesis, organize it by real interaction scene, keep
the speaker's temperature and response shape visible, and reject phrases that
could be swapped to another character unchanged. The adaptation is deliberate:
short official messages and long player histories need different batching,
evidence windows, and privacy boundaries.

## Input boundary

The analyzer accepts a private sequence of attributed record units. A unit may
carry message text, speaker attribution, timestamp/order, thread/group key,
and local source metadata. Text stays in the private analysis pass.

The public or reviewed output may contain only:

- character scope;
- opaque evidence and source-group fingerprints;
- non-verbatim guidance or claim;
- scene, temperature, and response-shape annotations;
- support count, review status, conflict/revision key, and surface boundary.

It must not contain quoted text, source title, URL, local path, relationship
memory, present-tense motive, tool policy, or a claimed event truth.

## Four material lanes

| Lane | What is retained | Where it may later be considered | What it must never become |
| --- | --- | --- | --- |
| Language fingerprint | Attention landing point, pacing, temperature range, response mouth shape, optional initiative/boundary posture | Stable voice calibration across relevant surfaces | Catchphrase list, verbatim imitation, compulsory affection, fixed reply container |
| Stable detail claim | Cross-supported character-level detail phrased as a relevance-gated claim | Relevant topic/scene retrieval | Relationship memory, a fabricated shared experience, always-on lore dump |
| Opening/proactive candidate | A possible way to initiate, return, or offer a self-life thread; a motive remains only a candidate | Proactive letter, call connection, scene opening, later Director decision | Current motive, ordinary Chat default, obligation to contact |
| Scene texture | What a future scene can afford: sensory texture, choice, pacing, local tension, or play | Meet/date/story planning candidate surface | An event that already happened or a relationship conclusion |

## DriftStone baseline, then the necessary adaptation

| Retained mechanism | Why the original baseline is not sufficient alone | Adaptation here | Fixture / gate |
| --- | --- | --- | --- |
| Evidence scoring before synthesis | SMS units are often very short; long histories contain repetitive stretches | Score annotated evidence families using cross-source support, scene breadth, temperature breadth, mouth-shape clarity, and penalties for generic or single-event evidence | `scoreVoiceEvidence` ranks supported situated evidence above generic one-off material |
| Candidate pool, not whole-corpus prompt stuffing | A 909-page corpus cannot safely become one enormous voice prompt | Build a small review pool per character from opaque evidence families; preserve every source in the private ledger as support, holdout, scoped context, or unresolved work | Candidate-pool fixture retains multiple registers and a legal low-signal path |
| Scene-first organization | Functional labels alone flatten a voice into “caring” or “funny” | Annotate `sceneAnchor`, `temperature`, and `mouthShape`: e.g. ordinary share / reentry / light scene; even / playful / firm; concrete notice / side-step / acknowledge-and-release | Fixture requires distinct scenes, temperatures, and mouth shapes |
| Preserve mouth shape | Official text may be copied too closely if the analysis chases wording | The private pass may inspect wording, but it exports only a response tendency such as “notice then leave space,” never a phrase | `assertPublicVoicePacket` rejects raw fields |
| Anti-generic name-swap self-check | A generic kindness statement can rank highly by frequency | Explicit `genericSwapRisk` is a penalty and a reviewer question: could another character own this unchanged? | Interchangeable, event-bound candidate is omitted from selected review pool |
| Do not force a complete profile from thin evidence | A single event can look dramatic but is not stable behavior | `singleEventRisk`, cross-source thresholds, disabled scoped assets, and unresolved status stay visible | Stable active clusters require multiple non-holdout sources |

This is inherited method, not copied wording: the helper script contains a
transparent scoring function and data schema rather than DriftStone's prompt
text. A source adapter supplies language-specific annotation; the core itself
does not assume a game, a character name, Chinese SMS, or a particular UI.

## Private analysis pass

1. Normalize records into speaker-attributed units and compute an opaque
   source fingerprint plus an opaque source-group fingerprint.
2. Classify each source into one primary contribution and zero or more
   secondary supports. Repetition increases a cluster's support; it is not a
   reason to delete the source.
3. For possible voice evidence, annotate privately:
   `sceneAnchor`, `temperature`, `mouthShape`, stability risk, generic-swap
   risk, and relationship/event scope.
4. Build candidate families from the non-holdout groups. Use source text only
   inside this step and the private reviewer prompt; do not serialize it into
   the material output.
5. A small local model may first organize private evidence into an explicit
   `model_semantic_draft`. That draft is always `unresolved`: it can bind a
   bounded batch and flag uncertainty, but cannot approve an asset by itself.
6. A human semantic review, human-model adjudication, or independently-run
   model adjudication may then synthesize non-verbatim guidance. It must name
   a range of character-owned choices, not a mandatory line, action, or
   feeling. An adjudicator must select its actual support subset rather than
   treating the whole cluster's intake count as proof.
7. Run the gates below. Approved material can be marked active in the private
   workbench; delivery and runtime selection remain a separate system.

For ordinary player history, the same steps apply. The adapter changes:
timestamps and threads can supply source groups; long sessions should be
windowed before scoring; speaker attribution may be uncertain and should
lower confidence rather than be invented; no official role or message format
is assumed.

## Reviewer prompt contract

The private prompt input is a bounded batch, not a whole raw archive:

```text
characterScope + surface purpose
candidate evidence table:
  opaque evidence id + private excerpt + scene + temperature + mouth shape
  + support count + event/relationship risk
requested output:
  1–N non-verbatim guidance families
  each: attention landing point, pacing/turn, optional initiative or boundary,
  evidence ids, stability confidence, generic-swap self-check, exclusions
```

The reviewer must answer these questions before an item can be active:

1. Does it have support across distinct records rather than one heightened
   scene?
2. Could another character keep the guidance unchanged? If yes, sharpen from
   evidence or leave unresolved.
3. Does it cover an additional scene/temperature/mouth shape, or merely
   duplicate an existing register?
4. Is the guidance a range of expression rather than an instruction to love,
   comfort, ask, joke, or perform every turn?
5. Has any private wording, source title, URL, current motive, relationship
   fact, or tool policy leaked into the output?
6. Is this merely a rewrite of the static intake hypothesis? A high
   candidate-guidance echo risk is withheld for evidence-first regeneration.
7. In care or mild-discomfort scenes, does the anonymous voice retain a
   distinct attention landing point, pace, and independent-life posture rather
   than only decorating the same generic optional-care solution?

## Holdout and blind evaluation

Reserve opaque source groups before the language-fingerprint candidate pool is
constructed. The group—not an individual isolated sentence—is the unit of
holdout, preventing near-duplicate leakage.

The blind render request gives the generator the same neutral user inputs for
five anonymous subjects, each subject's non-verbatim selected voice guidance,
and a requirement to produce two variants. It withholds character names and
all source excerpts. An independent rater receives shuffled anonymous outputs
and records:

- whether anonymous voices remain distinguishable after names are removed;
- whether two variants retain the same attention/pacing/boundary tendency
  without becoming near-identical;
- whether an output sounds like source replay or like a generic interchangeable
  reply.

`verify-lysk-sms-voice-holdout.mjs` has two stages: without a response artifact
it confirms a valid, non-empty plan; with private generated responses plus the
private source input, it checks coverage, variation, and direct held-out phrase
replay. Identity distinguishability is deliberately recorded by an independent
rater rather than faked by a string heuristic.

Care/discomfort is a high-risk slice of this evaluation. Respecting a refusal,
offering rest, or leaving a choice open are good shared interaction behaviors;
they cannot by themselves certify persona. A voice asset that covers this
slice needs a separate cross-character check that clears a shared-solution
skeletal response before it can be active.

## Quality gates and non-goals

- Stable voice and stable details need cross-source support. A single event
  remains scene-scoped or unresolved.
- A `model_semantic_draft` can never be active. An active asset needs a
  controlled independent adjudication or human review, exact scope/route
  agreement, and its own actual evidence subset.
- A low-signal ordinary Chat path must be positive and non-compulsory; zero
  candidates is not success.
- Opening, proactive, motive, and scene material are surface-gated by their
  receiving system. This analyzer does not write them into ordinary Chat.
- A motive candidate is not `currentMotive`; a stable detail claim is not a
  relationship memory; scene texture is not played truth.
- Language fingerprint adds expressive range. It does not forbid independent
  initiative, later tool use, a new emotional direction, or a future character
  card correction.
- A future human-reviewed role card has higher authority and must supersede a
  conflicting material by explicit revision, never by silently piling two
  incompatible directions together.

## Executable fixtures

- `scripts/historical-record-analyzer-core.mjs` — source-agnostic pool and
  privacy helpers.
- `scripts/verify-historical-record-analyzer-fixtures.mjs` — proves varied
  scenes/temperatures/mouth shapes, generic-event rejection, low-signal path,
  and no raw-field leakage.
- `scripts/build-lysk-sms-material-analysis.mjs` — private SMS adapter that
  emits only ignored workbench artifacts.
- `scripts/verify-lysk-sms-material-analysis.mjs` — source conservation,
  route/status/surface data, voice candidate pool, and source-group holdout
  gates.
- `scripts/verify-lysk-sms-voice-holdout.mjs` — blind-plan readiness and,
  when supplied separately, generated-response checks.
- `scripts/semantic-review-contract.mjs` and
  `scripts/verify-semantic-review-backfill-fixtures.mjs` — exact scope,
  controlled reviewer kind, evidence-subset, name-blind, common-good-behavior,
  and care/discomfort differentiation gates.
- `scripts/draft-lysk-semantic-reviews-with-ollama.mjs` — resumable local-only
  model drafting into an ignored directory; it has no runtime export path.
