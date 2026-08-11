# Long Plot And Character Life Simulation Contract

Status: confirmed contract; read-only Narrative Director context implemented, playable scenes and character-life pending
Last updated: 2026-07-18

This document defines two connected but non-identical systems:

1. a playable long-plot loop for AetherOS; and
2. a character virtual-life layer that keeps every surface consistent, even
   when the player never uses long plot.

The second system is not subordinate to the first. A peaceful player who only
chats, calls, or goes on dates still needs the character to have one coherent
condition, availability, and sense of time.

## Product Map

The target experience is one relationship save line shown through several
surfaces:

- `剧情咨询台 / StoryDesk` prepares and approves plot directions;
- `剧情推演 / 世界旅行` plays routes and scenes;
- `小说生成` edits, reads, and archives prose produced from a run;
- `见面`, Chat, Call, Social, and proactive letters show other moments in the
  same relationship;
- `角色生活` is the shared state layer underneath all of them.

The visible names remain provisional. The data boundary is not provisional:
planning, playing, archiving, and living state must not collapse into one text
log.

## Implemented Foundation Slice — 2026-07-15

The first sealed code slice establishes long-plot truth without exposing a new
screen or writing memory:

- the existing directive type family was extracted from the root `types.ts`
  into `domain/narrative/types.ts` before it was extended;
- old directives remain readable, while optional progress-bundle, route,
  branch, parent, and activation scope can now be attached;
- `NovelBook.narrative` can carry versioned runs, scenes, beats, and confirmed
  experience receipts while remaining optional for old books;
- `domain/narrative/state.ts` owns pure immutable creation, safe normalization,
  scene activation, beat append, played, discarded, and user-confirmed
  transitions;
- one book state permits only one selected active run and one active scene;
  imported duplicate actives are reconciled without advancing fictional time;
- receipt confirmation validates progress bundle, run, scene, lane,
  participants, timestamps, and memory policy. IF receipts cannot use a main
  memory policy, and duplicate confirmation is idempotent;
- the existing Novel store and text/full backup paths already serialize whole
  `NovelBook` records, so the optional nested carrier round-trips without a new
  DB or OS-context write path.

`npm run verify:narrative` exercises legacy reads, immutable transitions,
mainline/IF isolation, confirmation gates, malformed-import repair, and whole
book JSON round trips.

HOLD after this slice: StoryDesk UI, scene player, DM/Character generation,
route mutation proposals, memory promotion, life-event application, and
Character Virtual Life. No function in the foundation calls an API, IndexedDB,
character memory, or a background clock.

## Implemented Read-Only StoryDesk Slice — 2026-07-15

The first visible slice is deliberately an inspector rather than a generator:

- `NovelApp` now keeps `activeBookId` and derives the current book from the OS
  `novels` collection, so child views do not keep reading a stale book object
  after a save;
- the previous direct `NovelWriter` mount was first extracted without behavior
  changes into `components/novel/NovelWorkspace.tsx` and sealed separately;
- the workspace now exposes peer `手稿 / 剧情台` panels while keeping the old
  manuscript editor, generation, settings, history, and archive behavior under
  `NovelWriter`;
- `domain/narrative/inspection.ts` normalizes imported state and returns only
  directives, runs, scenes, and receipts belonging to the active progress
  bundle. Other bundles expose counts only; unscoped legacy directives remain
  visible as locked migration material;
- `StoryDeskInspector` shows pending direction, route continuity, active scene,
  and user-confirmed receipts without offering activate, generate, play,
  confirm, promote, or memory-write actions;
- internal hardware back now returns StoryDesk -> Manuscript -> Shelf before
  allowing the OS to close the app.

The deterministic narrative fixture now covers inspection isolation with two
progress bundles and one unscoped legacy directive. The phone UI was checked at
430x932 through the real Launcher entry (`AppID.Novel` is labelled
`手稿`, while `书房` is the separate Study app), including manuscript open,
StoryDesk empty state, semantic renderer output, return-to-shelf, and cleanup of
the temporary book.

HOLD after this slice: directive authoring/activation, route creation, scene
generation/player, receipt review actions, memory promotion, Character Virtual
Life, and launcher renaming. The inspector performs no persistence mutation.

## Implemented Manual Story Direction Slice — 2026-07-17

StoryDesk now permits one bounded mutation before any route can start:

- `domain/narrative/directives.ts` owns pure immutable create, append, revise,
  and discard transitions for manual StoryDesk directions;
- a new direction requires a non-empty active `progressBundleId`, one or more
  participants available to the active persona scope, a title, a summary, and
  an explicit `主线候选 / IF 支线` lane;
- new records are always `pending`, `activationMode: manual`, and carry source
  references back to the current book. Mainline candidates use
  `manual_promotion`; IF candidates use `dream_material`;
- editing and discarding are limited to still-pending manual StoryDesk records
  in the same progress bundle. An `updatedAt` review token prevents an older
  review screen from silently overwriting a newer edit;
- the mobile composer separates drafting from a second review step that states
  plainly that save does not start a route, advance character time, or write
  character memory;
- discard is an auditable status transition, not physical deletion. Directives
  from other bundles, unscoped legacy records, and non-manual sources are
  preserved and cannot be changed through this panel;
- writes replace only the book's full directive array through the existing
  `updateNovel` seam, preserving hidden directives that belong to other persona
  bundles.

`npm run verify:narrative` now fixtures creation gates, participant
normalization, mainline/IF memory policies, duplicate IDs, immutable edit and
discard, cross-bundle rejection, stale-review rejection, and terminal status
protection.

HOLD after this slice: directive activation, route creation, AI direction
generation, historical-material adoption, scene generation/player, receipt
review actions, memory promotion, Character Virtual Life, and launcher
renaming. No new function calls an AI API, history search, daily archive,
character memory, or a background clock.

## Implemented Draft Route Activation Slice — 2026-07-17

StoryDesk now supports one explicit transition after manual direction review:

- `domain/narrative/activation.ts` owns the atomic pure transaction that marks
  one pending manual direction `activated` and creates exactly one
  `NarrativeRun` with `status: draft`;
- the transaction revalidates the current progress bundle, StoryDesk book
  source reference, review timestamp, playable lane, and that every participant
  remains available to the active persona scope;
- run, route, and root-branch IDs derive stably from the directive ID. A retry
  or inconsistent partial record collides closed instead of creating a second
  route for the same intention;
- mainline candidates create `mainline / branch-main`; IF directions create
  `if_line / branch-if-root`. The directive stores the same route and branch
  identity, while the run retains the source directive ID;
- one existing `updateNovel` call persists both the complete directive array
  and narrative state. Hidden directives and runs belonging to other persona
  bundles remain preserved;
- the activation review states what will and will not happen. A draft route has
  zero scenes, zero receipts, no active run selection, no played timestamp, and
  no character-time or memory mutation;
- StoryDesk displays the resulting zero-scene route as a `线路草稿`, making the
  created container visible without presenting it as active play.

The narrative fixture covers mainline and IF mapping, immutable atomic output,
stable identities, stale review, cross-bundle/book/persona rejection,
non-manual-source rejection, duplicate-route collision, terminal-status
protection, and preservation of other-bundle directives and runs.

HOLD after this slice: selecting/starting an active run, scene planning or
generation, in-world action input, DM/Character turns, played/confirmed receipt
review, historical-material adoption, memory promotion, life-event application,
Character Virtual Life, and launcher renaming. Activation calls no AI API,
history/archive service, character store, memory service, or clock.

## Implemented Draft Run Start Slice — 2026-07-18

StoryDesk can now explicitly select one reviewed, empty draft as the book's
current run without pretending that play has begun:

- `domain/narrative/runLifecycle.ts` owns the pure `draft -> active`
  transaction and revalidates book, progress bundle, run identity, status, and
  the `updatedAt` review token;
- the selected draft must have zero scenes, zero receipts, and no active scene;
  starting it changes only run status, active-run selection, and timestamps;
- a book still permits only one active run. When another run is active, the
  transaction fails closed instead of silently pausing or switching it;
- runs from other progress bundles remain preserved but cannot be selected
  through the current StoryDesk scope;
- the phone UI uses a second confirmation step which states that starting does
  not generate a scene, call AI, record an experience, write memory, or change
  Character Life;
- an active zero-scene route remains visibly empty, so "current route" cannot
  be mistaken for an event that already happened.

The narrative fixture covers immutable start, book/bundle/stale-review gates,
terminal-status rejection, single-active-run enforcement, zero-scene and
zero-receipt output, non-empty draft rejection, and preservation of another
bundle.

HOLD after this slice: scene planning/generation, Narrative Director context
assembly, historical profile adapters, active-run switching or pause/resume,
in-world action input, DM/Character turns, played/confirmed receipt review,
memory promotion, life-event application, Character Virtual Life, and launcher
renaming. The lifecycle module imports no history schema or store and performs
no AI, memory, Character, archive, or clock write.

## Implemented Read-Only Narrative Director Context — 2026-07-18

The narrative lane can now read current truth and the history lane's soft map
without collapsing them into one store or granting either side write authority:

- `domain/narrative/directorContext.ts` owns the complete
  `progressBundleId + personaMaskId + charId` context boundary;
- current active run/scene and user-confirmed experiences are projected from
  `NovelBook.narrative` as cloned, frozen truth. Draft and unconfirmed material
  remain outside the context;
- an optional history-owned `HistoricalNarrativeProjection` is accepted only
  when its actor refs, neutral events, event-route bindings, routes, NPCs,
  relationship stages, and open threads match the complete relationship scope
  and remain visible historical material;
- authority is ordered `active/confirmed truth > user-confirmed history > soft
  historical > reconstructed`. Historical `status`, source authority,
  continuity, surface, and memory policy remain independent axes; the history
  domain's reconstructed/inferred/explicit/user-confirmed order is retained
  inside those narrative tiers;
- `utils/narrative/historyAnalysisProjectionProvider.ts` adapts the existing
  history read projection behind a narrative-owned provider interface. The
  reader is injectable, so domain fixtures and non-browser runtimes do not
  depend on IndexedDB;
- the context carries an explicit all-false read-only policy for model calls,
  run/scene/receipt mutation, memory write, Character Life write, and current
  state write.

`npm run verify:narrative` now also covers triple-scope fail-closed behavior,
nested-profile isolation, independent authority mapping, immutable current and
historical inputs, provider scope forwarding, frozen output, and zero write
capability.

The projection is not a `NarrativeScene`: one historical event can keep
simultaneous mainline and IF bindings, unresolved actor aliases remain
unresolved, and no route becomes active merely because it is readable.

HOLD after this slice: StoryDesk/history UI wiring, automatic historical route
adoption, “continue this line” conversion, scene planning/generation, model
calls, active-run switching, receipt creation, memory/life/current-state writes,
and Character Virtual Life. A historical profile remains background material;
it is never evidence that a run or scene has been played in this App.

## Confirmed Non-Exclusive Historical Evidence Contract — 2026-07-18

Historical evidence is reusable material, not a card that can belong to only
one route. Future history and scene-planning work must preserve these rules:

- the same Calendar source span may be analyzed repeatedly. Each pass keeps an
  independent request/run identity, source revision, extractor version, output,
  and provenance. Selecting a newer interpretation as the current view may
  supersede an older view, but must not overwrite the source or silently erase
  the older interpretation;
- source spans and historical results/routes form a many-to-many relationship.
  One span may support a mainline, an IF line, a date/meeting line, and another
  historical route at the same time. “放进另一条线” adds a binding; it never
  moves evidence out of an existing line. Removing an association removes only
  that binding;
- `sourceRefs[]` remains evidence provenance, but it is not sufficient as the
  future editable association record. The history-owned schema should later
  introduce stable, scoped, versioned evidence-binding identities so additions,
  removals, restoration, origin, and analysis-run provenance are auditable
  without duplicating or mutating the Calendar source;
- many-to-many membership is not a player-facing statistic. StoryDesk must not
  show `同时属于 N 条线`, membership counts, or a multi-route badge. The same
  source may appear naturally in each route that reads it, while an advanced
  edit action changes only one binding;
- people correct interpretations where the result is used: Contact memories,
  Timebook nodes, and StoryDesk historical-route cards. Those surfaces may add,
  edit, hide, and restore derived records while retaining a jump back to the
  source span. Import and per-message Calendar reading must not become a review
  worksheet;
- a human edit is a versioned overlay with user-confirmed historical authority.
  It does not rewrite the model pass or chat source and does not become
  active/confirmed current truth. “继续此线” remains a separate explicit
  Directive -> draft-run action;
- exact duplicate candidates may merge automatically into one visible entity,
  while keeping all source, pass, and binding provenance. Multi-route membership
  is not a conflict. Only mutually exclusive facts should expose an entity-level
  “有两种整理” state; there is no per-message adjudication queue.

Scene planning must therefore query a selected run/route through non-exclusive
bindings. It may rank relevant evidence for the selected scene, but it must not
claim that the evidence belongs exclusively to that route, delete another
route's binding, or promote a historical overlay into played truth. The
`continuity`, interaction `surface`, memory policy, authority, temporal class,
route, and branch axes remain independent.

Planning HOLD: do not change the history store/schema, Calendar/result UI,
Director provider, or scene types in this documentation-only slice. The history
lane owns the future analysis-pass, overlay, and evidence-binding persistence;
the narrative lane consumes a scoped read projection and keeps “continue this
line” and scene play behind later explicit transitions.

## Code-Grounded Starting Point

AetherOS already has useful pieces:

- `NarrativeDirective` and `NovelBook.directives` can carry approved seeds;
- Novel can continue chapters and retain chapter summaries;
- persona masks already own `activeProgressBundleId`;
- `memoryCore` can select worldline memory and produce delivery receipts;
- `WorldlineHotState` can project short-lived whereabouts, mood, pressure, and
  open threads;
- Realtime can provide real-world time/weather boundaries;
- `见面` has a playable visual-scene loop and resumable local state.

Beyond the implemented domain foundation, it does not yet have:

- a StoryDesk queue or user-facing activate -> play -> confirm loop;
- DM/Character generation or deterministic route-state mutation application;
- separate composer controls for out-of-world instruction and in-world action;
- a resumable scene-player UI wired to the bundle-scoped domain state;
- a durable character clock, condition, availability, recovery, or travel
  state shared by every surface;
- typed text/full backup carriers for future Character Virtual Life records.

`WorldlineHotState` is therefore a useful prompt projection, not the durable
source of truth for character life. `RealtimeConfig.realitySyncMode` controls
how reality is referenced; it must not be overloaded to mean whether the
character's own time advances.

## Code-Grounded UI Ownership

The existing app names are not used as architecture evidence. The decision
below comes from reading their actual view state, persistence, prompt, resume,
and back-navigation logic.

### Long Plot Lives Under `NovelApp`

Keep the stable program ID `AppID.Novel`. `NovelApp` is the long-plot owner
because it already owns the durable work list, book creation/settings,
world-setting import, collaborators, protagonists, and a delegated child
writer. It can become a relationship-worldline workspace without moving old
novel records to a different app or store.

The target child structure is:

```text
NovelApp (book / route workspace owner)
├── Shelf
├── StoryDesk
├── NarrativeScenePlayer
├── Manuscript (existing NovelWriter)
└── Settings / Character Library
```

`NovelWriter` remains the manuscript/co-writing surface. It must not become the
route player. Its current composer stores user text as story prose, and its
chapter archive writes generic collaborator memories. Long-plot instruction,
in-world action, played fact, generated prose, and confirmed memory therefore
need separate records before this UI is expanded.

The launcher may later move the existing stable `AppID.Novel` entry from
`创作整理` to `剧情游玩` and change its visible label. That presentation change
must not rename the program ID or force a storage migration.

### Existing Apps Are Donors, Not Owners

- `Date / 见面` is the presentation donor: visual/reading modes, dialogue-beat
  playback, background/sprite fallbacks, exit confirmation, resumable save, and
  hardware-back handling. Its one-character `savedDateState` and ordinary
  date-message storage are too narrow to own multi-route plot truth.
- `Game / TRPG` is an interaction-pattern donor: action log, suggested actions,
  reroll, leave/resume, and GM/character visual separation. HP, SAN, gold, D20,
  and game-over semantics remain outside the long-plot domain.
- `LifeSim` is only an engine-pattern donor: deterministic transitions,
  pending effects, and recovery from interrupted turns. Its global singleton,
  NPC-city chaos, and random-drama semantics must not become Character Virtual
  Life.
- `Guidebook` and `Special Moments` remain bounded relationship game/event
  surfaces. They may consume confirmed route or life projections later, but
  they do not own the route.

Reuse should happen through newly typed, decoupled components and services.
Do not import an entire donor component with its old storage and prompt
assumptions attached.

### Character Virtual Life Uses Split Ownership

The primary user-facing entry belongs in `Character` detail as a fourth peer
section beside `设定`, `记忆`, and `关系印象`. Its working visible label may be
`此刻` or `生活`; the label is provisional, while the placement is confirmed.

That panel shows and controls the selected character's current life projection:

- `角色时间会自己走`;
- current location, activity, availability, and conditions;
- commitments, recovery, and the next bounded transition;
- the last applied event and source;
- pause, time calibration, and explicit correction controls.

The panel must not write through Character's current `formData ->
CharacterProfile` auto-save path. Its data owner is the separate
`progressBundleId + charId` life service/store, so two user masks cannot share
injury, availability, travel, or recovery by accident.

Ownership remains deliberately split:

| Concern | Owner |
| --- | --- |
| per-character life status and toggle UI | Character detail / life panel |
| durable life state | bundle-scoped character-life service/store |
| active identity and relationship scope | User persona mask + progress bundle |
| new-character global defaults and explanation | Settings |
| compact state display | Chat, Date, Call, Social, proactive rail, long plot |

Settings may define the default clock mode for newly initialized character
life records. It must not be the only place to inspect or change one
character's current clock. Consumer surfaces may show a read-only status chip
or offer a compatible alternative, but they must not grow parallel life-state
owners.

### Structural Repairs Before New UI

1. Replace `NovelApp`'s long-lived local `activeBook` object with an
   `activeBookId` and derive the current book from the OS `novels` collection.
   New sibling views must not read a stale book after another view saves.
2. Add internal hardware-back handling to `NovelApp` and Character detail.
   The current OS has one app-level back handler; without registration, a
   nested route or life panel can be closed as if the whole app were closed.
3. Stamp new long-plot work with the active `progressBundleId` and default
   participant selection to the active mask's linked characters before any
   route state is created.
4. Build `NarrativeScenePlayer` as a new decoupled component inspired by Date's
   presentation contract, not as a renamed `DateSession`.
5. Disable direct generic character-memory writes from long-plot chapter
   archival. Confirmed experience receipts become the only promotion gate.

## Core Invariants

1. Every narrative and life record is scoped by `progressBundleId` before it is
   scoped by character. Two persona masks must not share injuries, routes,
   commitments, or relationship progression by accident.
2. An approved plot idea is not a lived event.
3. Generated prose is not automatically canon.
4. Only played and user-confirmed experience receipts can promote route events
   into relationship/canon memory.
5. Mainline and IF runs never write to the same memory lane silently.
6. Every surface reads the same character-life projection before proposing an
   invitation, activity, scene, or proactive message.
7. Model output may propose a state mutation; deterministic code validates and
   applies it.
8. Background time may advance low-impact life, but it may not silently create
   irreversible high-impact facts.
9. A current condition must have a believable transition before an incompatible
   activity. A recently injured and still-unavailable character cannot invite
   the user dancing merely because another surface generated fresh prose.
10. Reality sync, story progression, and character-life time are three separate
    controls. Enabling one does not implicitly enable the others.

## Long-Plot Runtime Contract

### 1. Narrative Directive

Keep the existing `NarrativeDirective` as an approved intention, then extend it
compatibly with optional route scope:

```ts
interface NarrativeDirective {
  // existing fields remain readable
  progressBundleId?: string;
  routeId?: string;
  branchId?: string;
  parentDirectiveId?: string;
  activationMode?: 'manual' | 'after_scene' | 'after_condition';
  activationCondition?: string;
}
```

A directive may be pending or activated, but it is never proof that its content
happened.

### 2. Narrative Run

```ts
type NarrativeRunLane = 'mainline' | 'if_line';
type NarrativeRunStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'abandoned';

interface NarrativeNpcState {
  id: string;
  name: string;
  disposition?: string;
  location?: string;
  condition?: string;
  knownFacts: string[];
  updatedAt: number;
}

interface NarrativeOpenThread {
  id: string;
  title: string;
  status: 'open' | 'resolved' | 'dormant';
  sourceSceneId?: string;
}

interface NarrativeRun {
  id: string;
  progressBundleId: string;
  bookId?: string;
  routeId: string;
  branchId: string;
  lane: NarrativeRunLane;
  status: NarrativeRunStatus;
  participantCharIds: string[];
  activeSceneId?: string;
  directiveIds: string[];
  routeSummary?: string;
  routeState: Record<string, string | number | boolean>;
  npcStates: NarrativeNpcState[];
  openThreads: NarrativeOpenThread[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}
```

One run owns route continuity. A chapter is presentation; it must not become the
only location where route truth lives.

### 3. Scene And Beat

```ts
interface NarrativeScene {
  id: string;
  runId: string;
  status: 'planned' | 'active' | 'played' | 'confirmed' | 'discarded';
  title: string;
  location?: string;
  participantIds: string[];
  objective?: string;
  constraints: string[];
  beats: NarrativeBeat[];
  openedAt?: number;
  playedAt?: number;
  confirmedAt?: number;
}

interface NarrativeBeat {
  id: string;
  kind: 'narration' | 'dialogue' | 'choice' | 'user_action' | 'system_note';
  authorId?: string;
  content: string;
  createdAt: number;
}
```

The input composer must distinguish:

- `对角色说 / 做` — in-world speech or action, stored as a played beat;
- `调整剧情` — out-of-world instruction, stored as a directive/edit and never
  quoted back as something the user did inside the scene.

### 4. Experience Receipt

```ts
interface NarrativeExperienceReceipt {
  id: string;
  progressBundleId: string;
  runId: string;
  sceneId: string;
  lane: NarrativeRunLane;
  participantCharIds: string[];
  summary: string;
  acceptedFacts: string[];
  rejectedOrEditedFacts?: string[];
  lifeEventIds?: string[];
  memoryPolicy:
    | 'main_vault'
    | 'relationship_echo'
    | 'dream_material'
    | 'excluded_from_main_vault';
  confirmedByUser: boolean;
  playedAt: number;
  confirmedAt?: number;
}
```

The archive action should show a compact review of changed route facts and life
state. Confirmation is the gate between creative generation and durable truth.

## Two-Seat Generation

Borrow the useful discipline from Morveil without introducing a runtime
dependency:

- the `DM seat` proposes scene, world, NPC, consequence, and route-state deltas;
- the `Character seat` speaks and acts only from that character's knowledge,
  personality, condition, and relationship state;
- deterministic application code owns IDs, scope, permissions, branch
  isolation, validation, and persistence.

The two seats may use one provider/model in the first implementation. Their
prompt contracts and outputs still remain separate so the character cannot
quietly rewrite world truth, and the DM cannot flatten the character into a
narrator puppet.

## Character Virtual Life

### Why It Is Separate

Character life is a cross-surface simulation block, not a long-plot feature.
Its job is continuity rather than drama:

- Where is the character?
- What are they doing?
- Are they free, busy, travelling, recovering, or inside an active scene?
- What condition or commitment constrains the next believable action?
- Which surface last changed this state, and is that change confirmed?

Chat, Date, Call, Story, Social, and proactive generation must all consult the
same answer.

### Player-Facing Control

Expose one plain setting per persona-progress bundle and character:

> 角色时间会自己走

The simple toggle maps to:

```ts
type CharacterLifeClockMode = 'interaction_only' | 'independent';
```

- `interaction_only` (default/off): no autonomous state transition. Time of day
  and weather may still color a scene, but location, condition, availability,
  recovery, and commitments only change through explicit interaction or a
  confirmed receipt.
- `independent` (on): bounded virtual time can advance routine, travel,
  recovery, and commitments between interactions. Catch-up is computed when
  the app resumes; AetherOS does not need a permanent background process.

This toggle is independent of `RealtimeConfig.realitySyncMode`.

### Intensity Is Not The Clock

Do not make independent time synonymous with surprise plot. Store a separate
policy:

```ts
type CharacterLifeIntensity = 'peaceful' | 'plot_linked';
```

- `peaceful` (default): permits ambient routine, rest, work, low-risk travel,
  ordinary busyness, and recovery. It forbids offscreen death, serious injury,
  breakup, disappearance, irreversible relationship change, and mainline
  crisis.
- `plot_linked`: permits already-approved route conditions to advance within
  their declared bounds. Plot-critical or irreversible transitions still need
  an active scene or explicit user confirmation.

The first UI may keep `peaceful` implicit and expose only the clock toggle. The
separate field is still required in the data contract so a future advanced
control does not reinterpret old saves.

### Settings

```ts
interface CharacterLifeSettings {
  schemaVersion: 1;
  progressBundleId: string;
  charId: string;
  clockMode: CharacterLifeClockMode;
  intensity: CharacterLifeIntensity;
  maxCatchUpHours: number;
  updatedAt: number;
}
```

Recommended defaults:

- `clockMode = 'interaction_only'`;
- `intensity = 'peaceful'`;
- `maxCatchUpHours = 72` for independent mode, advancing through bounded
  transitions rather than inventing three days of prose.

### Durable State

```ts
type CharacterAvailability =
  | 'free'
  | 'busy'
  | 'unavailable'
  | 'travelling'
  | 'recovering'
  | 'in_scene';

interface CharacterCommitment {
  id: string;
  label: string;
  status: 'planned' | 'active' | 'fulfilled' | 'cancelled';
  startsAt?: number;
  endsAt?: number;
  sourceRef?: NarrativeDirectiveSourceRef;
}

interface CharacterCondition {
  id: string;
  kind: 'healthy' | 'tired' | 'injured' | 'ill' | 'recovering' | 'stressed' | 'other';
  severity: 1 | 2 | 3;
  note?: string;
  startedAt: number;
  expectedUntil?: number;
  sourceRef?: NarrativeDirectiveSourceRef;
}

interface CharacterLifeState {
  schemaVersion: 1;
  progressBundleId: string;
  charId: string;
  virtualNow: number;
  clockAnchorRealAt: number;
  nextTransitionAt?: number;
  location?: string;
  activity?: string;
  availability: CharacterAvailability;
  conditions: CharacterCondition[];
  mood?: string;
  currentPressure?: string;
  activeThreads: string[];
  openCommitments: CharacterCommitment[];
  activeRunId?: string;
  activeSceneId?: string;
  routeLocks?: string[];
  lastObservedAt: number;
  updatedAt: number;
  revision: number;
}
```

`lastObservedAt` means when a surface last presented this state. `updatedAt`
means when durable state changed. A transition may also have its own
`effectiveAt`; these timestamps must not be collapsed.

In the first independent-clock version, elapsed real time advances virtual time
at 1:1 speed, capped by `maxCatchUpHours`. Later fictional calendars may add an
explicit rate/calendar adapter without reinterpreting old states.

### Append-Only Events

Keep current state as a projection and retain the reason it changed:

```ts
type CharacterLifeSurfaceId =
  | NarrativeSurfaceId
  | 'call'
  | 'proactive'
  | 'story_player';

interface CharacterLifePatch {
  virtualNow?: number;
  clockAnchorRealAt?: number;
  nextTransitionAt?: number;
  location?: string;
  activity?: string;
  availability?: CharacterAvailability;
  conditions?: CharacterCondition[];
  mood?: string;
  currentPressure?: string;
  activeThreads?: string[];
  openCommitments?: CharacterCommitment[];
  activeRunId?: string;
  activeSceneId?: string;
  routeLocks?: string[];
}

interface CharacterLifeEvent {
  id: string;
  progressBundleId: string;
  charId: string;
  kind:
    | 'routine_transition'
    | 'travel'
    | 'condition_change'
    | 'commitment_change'
    | 'scene_receipt'
    | 'manual_correction';
  status: 'proposed' | 'applied' | 'rejected' | 'superseded';
  impact: 'ambient' | 'relationship' | 'plot_critical';
  sourceSurface: CharacterLifeSurfaceId;
  sourceRef?: NarrativeDirectiveSourceRef;
  patch: CharacterLifePatch;
  effectiveAt: number;
  createdAt: number;
  appliedAt?: number;
}
```

Do not silently overwrite a condition because a new model call forgot it.
Corrections are explicit events, and stale proposals fail revision checks.

## Consistency Gate

Before any surface generates or shows an activity, it builds a
`CharacterLifeSnapshot` and validates the proposal.

Minimum validation:

1. `progressBundleId`, `charId`, and state `revision` match.
2. Active route/scene locks are respected.
3. Availability is compatible with the proposed activity.
4. Conditions are compatible with the activity intensity.
5. Existing commitments and travel time are not skipped.
6. A necessary recovery/travel/closure transition exists and has become
   effective.
7. The requested mutation is allowed by clock mode and intensity.

Example:

- state: `injured severity=2`, `availability=recovering`, expected recovery in
  two days;
- proposal: “今晚去蹦迪”;
- result: reject the activity proposal. The surface may instead offer a call,
  quiet visit, reschedule, or a validated recovery transition if enough virtual
  time has actually passed.

The fallback must remain in character and gentle; the UI need not expose a
system-error message.

## Surface Responsibilities

| Surface | Reads | May propose | May confirm/apply |
| --- | --- | --- | --- |
| StoryDesk | route + life summary | directives, constraints | directive only |
| Long-plot player | full active route + life state | scene and state deltas | after play/review |
| Novel | run/scene archive | prose edits, summaries | no new life fact by prose alone |
| Chat | compact life projection | ambient/relationship event | explicit interaction only |
| Date / 见面 | availability + condition + commitments | meeting transition | played/confirmed receipt |
| Call | whereabouts + availability | call context | low-impact interaction receipt |
| Social / proactive | safe projection | post/invitation | never plot-critical offscreen |

An active long-plot scene may temporarily own locked fields such as location or
availability. Background life progression must not bypass those locks.

## Memory Delivery And Promotion

Add `story_scene` and `story_planning` prompt modes to `WorldlinePromptMode`
before wiring the long-plot player.

The memory carrier should deliver:

- stable character/user/worldbook base;
- active progress-bundle identity;
- route and scene state;
- compact character-life snapshot;
- relevant worldline memory and open threads;
- accepted directives, never unapproved ideas as fact;
- lane policy (`mainline` or `if_line`).

After a confirmed scene:

1. apply validated route and character-life events;
2. save the experience receipt;
3. update route/scene summaries;
4. make a sparse memory-promotion proposal;
5. write main-vault memory only when the receipt and lane policy allow it.

IF experiences default to `dream_material` or
`excluded_from_main_vault`. They may leave a labeled echo but cannot rewrite
mainline state.

## Hot-State Migration

`WorldlineHotState` should become a derived prompt adapter over
`CharacterLifeState`, while preserving the existing per-character asset as a
legacy fallback.

The adapter should eventually expose:

- `progressBundleId`;
- current activity and availability;
- compact condition labels;
- active route/scene references;
- life-state revision and source refs.

Do not overwrite old `aetheros_worldline_hot_state_${charId}` values during the
first read-only migration. Prefer bundle-scoped life state when present and
fall back to legacy hot state otherwise.

## Persistence And Backup

A compatibility-first implementation may use `assets` keys internally:

```text
aetheros_character_life_settings_v1::<progressBundleId>::<charId>
aetheros_character_life_state_v1::<progressBundleId>::<charId>
aetheros_character_life_events_v1::<progressBundleId>::<charId>
```

That is not sufficient for durability because text-only backup excludes generic
assets. Before release, `FullBackupData` and import/export must carry typed
fields:

```ts
characterLifeSettings?: CharacterLifeSettings[];
characterLifeStates?: CharacterLifeState[];
characterLifeEvents?: CharacterLifeEvent[];
```

Narrative runs/scenes/receipts may live compatibly under `NovelBook` at first,
but their typed nested fields must survive both text-only and full backup. Every
import must tolerate missing fields and reconstruct safe defaults without
advancing time automatically.

## Morveil Boundary

Morveil remains a separate, more complex incubating product. AetherOS may reuse
its proven concepts:

- one relationship equals one save line;
- DM and Character have separate authority;
- Core owns truth and validation; Shell owns presentation;
- permissions and receipts are explicit.

AetherOS must not import Morveil runtime code or wait for Morveil Journey UI.
After AetherOS validates the domain contract through real play, Morveil may
adopt the contract into its own Journey Core/Shell architecture.

## Feature-Box Delivery Protocol

Long-plot and Character Virtual Life are delivered as small sealed feature
boxes. `main` contains only reviewed boxes that were selected to survive.

### Extract Before Changing Existing Behavior

Parallel AetherOS work stays on the shared local `main`. File/module ownership,
not branch switching, separates concurrent Codex windows.

Before changing an existing feature's behavior:

1. identify the smallest coherent region inside the current large app/module;
2. move that region into a dedicated component, domain module, or adapter
   without adding the new behavior yet;
3. leave the original app responsible only for state ownership, imports, and a
   thin mount/callback seam;
4. typecheck/build and inspect the extraction diff to prove behavior and
   presentation are unchanged;
5. make subsequent feature changes inside the extracted module instead of
   continuing to grow the original large file.

The behavior-preserving extraction is the visible boundary showing which code
the new lane has taken responsibility for. Parallel windows should own
different files. When a shared carrier such as `types.ts`, `utils/db.ts`, or an
app entrypoint is unavoidable, re-read its latest diff first and patch only the
smallest wiring hunk; never rewrite or normalize another window's active area.

The first verified extraction on 2026-07-15 moved Character detail's existing
three-tab rail into `components/character/CharacterDetailTabs.tsx`. It did not
add Character Life, change tab labels/styles, or touch the Special Moments
files. The future life panel now has a narrow extension seam.

### What `Sealed` Means

A box is sealed only when:

- its scope and exclusions are written;
- typecheck/build and focused automated tests pass;
- persistence, import/export, and legacy-read behavior are tested when the box
  changes durable data;
- affected mobile and desktop UI paths are inspected when the box changes UI;
- all real entry points affected by the change are fixed or explicitly marked
  `HOLD`;
- the final diff contains no unrelated dirty files or hidden runtime/private
  state;
- there is no known blocking regression inside the promised scope.

After sealing:

1. stage only the explicit box files;
2. create one intention-revealing seal commit;
3. when a shared file also contains another window's work, stage only the
   owned hunks instead of staging the whole file;
4. push the sealed `main` commit to GitHub once as the reviewable box.

Additional commits are allowed only when a real review defect is found before
acceptance. Do not mix the next feature or another window's unfinished files
into the same seal merely to reduce the number of pushes.

### Retiring Original Features

Original behavior is not kept indefinitely just because it already exists.
When a replacement is accepted and its data/backup path is proven, obsolete
behavior moves to a dedicated retirement box.

That box should remove the old launcher entry, dispatch path, prompts, writers,
and unreachable tests together. Preserve a bounded legacy reader or migration
only when old user data still needs to open or export. Do not delete the old
path before the replacement passes its acceptance scenarios; do not leave two
active truth writers after the replacement is selected.

Rejected experiments are marked `dropped` and are not merged into `main`.
Superseded shipped behavior is removed intentionally rather than hidden behind
an undocumented second route.

## Implementation Slices

### Slice 1 — Types And Read-Only Life Projection

- add life settings/state/event types and safe defaults;
- scope by active progress bundle + character;
- adapt life state into `WorldlineHotState` without changing prompts yet;
- add typed backup/export/import fixtures;
- expose no autonomous mutation.

### Slice 2 — Consistency Gate And Peaceful Toggle

- add the `角色时间会自己走` setting, default off;
- add deterministic activity/condition/availability validation;
- wire Chat, Date, Call, and proactive invitations to the same snapshot;
- independent mode advances only bounded peaceful transitions;
- add injury/recovery/travel/commitment contradiction fixtures.

### Slice 3 — StoryDesk And Directive Queue

- show pending/activated/discarded directives by progress bundle;
- support source references, constraints, lane, and target route;
- activating a directive does not write memory or life state.

### Slice 4 — Playable Route Loop

- add run/scene/beat state;
- separate `对角色说 / 做` from `调整剧情`;
- implement DM-seat and Character-seat outputs;
- review route/life deltas before confirmation;
- save receipts and resume one active scene safely.

### Slice 5 — Memory Promotion And Morveil Feedback

- promote only confirmed mainline receipts;
- deliver IF echoes through their labeled policy;
- audit all front doors: Home/launcher, Chat, Date, Call, Social, Novel, and
  proactive rail;
- extract the verified domain contract for a later Morveil Journey block.

## Acceptance Scenarios

1. With independent time off, closing the app for a week does not move the
   character from home, heal an injury, or invent activities.
2. With independent time on and peaceful intensity, a character may finish
   work, travel home, sleep, or recover within declared bounds, but cannot gain
   a severe injury or end the relationship offscreen.
3. A recovering character cannot offer an incompatible dance/date plan until a
   valid recovery transition becomes effective.
4. Chat, Date, Call, and long plot show the same availability and condition for
   the same progress bundle.
5. Switching persona masks does not leak the previous bundle's route or life
   state.
6. A pending StoryDesk directive never appears in character memory as a lived
   fact.
7. An IF run cannot mutate mainline route state or main-vault memory.
8. A user plot instruction is never rendered later as the user's in-world
   speech/action.
9. Text-only export/import preserves life settings, current state, event
   evidence, narrative run, scene, and confirmed receipt.
10. Legacy saves with only `WorldlineHotState`, `NovelBook.segments`, and
    `savedDateState` load without destructive migration or autonomous catch-up.
