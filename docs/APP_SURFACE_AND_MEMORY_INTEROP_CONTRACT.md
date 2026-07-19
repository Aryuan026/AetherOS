# App Surface And Memory Interoperability Contract

Status: cross-thread reviewed product direction; staged implementation contract

Last updated: 2026-07-19

This document defines how AetherOS virtual Apps share relationship, memory,
time, location, narrative, and appearance information without becoming one
large page-specific codebase.

It is the central routing contract. Detailed behavior remains in:

- `docs/MEMORY_DELIVERY_CONTRACT.md`
- `docs/WORLDLINE_MEMORY_ARCHITECTURE.md`
- `docs/LONG_PLOT_AND_CHARACTER_LIFE_CONTRACT.md`
- `docs/NARRATIVE_EXPERIENCE_BOUNDARIES.md`
- `SCHEMA.md`

Morveil is a deeper architectural reference, not a runtime dependency. AetherOS
keeps the same useful principle — pages do not own shared truth — while using
small browser-local TypeScript projections and commands that fit the current
codebase.

## One Sentence Rule

**An App is a way to experience or manage the relationship; it is not the owner
of every fact it displays. Shared domains own truth, Apps read projections and
submit commands, and every meaningful mutation returns a receipt.**

The practical consequences are:

- no App reads another App's private store directly;
- no new App copies historical or relationship memory into a private cache just
  to make its own prompt work;
- no model output becomes lived truth merely because it was generated;
- no historical item becomes current merely because it appears near the end of
  an array;
- every relationship-private read uses the exact
  `progressBundleId + personaMaskId + charId` scope;
- global appearance, time, location, and memory rules are reused rather than
  reimplemented per page.

## Vocabulary

### Surface

A visible App or a child panel inside an App. A surface owns interaction and
presentation. It may own records that are unique to that interaction, such as a
draft chat message or a StoryDesk directive, but it does not automatically own
the relationship facts derived from those records.

### Domain authority

The module that owns one class of truth and its lifecycle. Examples:

- History Import owns raw intake/batch identity; Daily Archive owns the derived
  day documents, stable source references, and human curation revisions.
- History Analysis owns immutable passes, evidence bindings, and user overlays.
- Narrative owns directives, runs, scenes, and experience receipts.
- Character Life will own current condition, whereabouts, availability,
  commitments, and their append-only change evidence.
- Worldbook owns canon/source material, not lived events.

### Projection

A scoped, read-only view prepared for one consumer. A projection may omit data
because of knowledge, authority, temporal, token, or surface policy. It is not a
second source of truth.

### Command

An explicit request to the domain owner, such as `continue historical route`,
`confirm played scene`, `lock archive day`, or `mount worldbook`. Commands may be
rejected by scope, revision, authority, or lifecycle checks.

### Receipt

The durable or diagnostic result of a command or delivery. A receipt says what
was read, written, played, confirmed, or rejected. A delivery receipt is not a
memory fact. An experience receipt is not automatically a current-state patch.

Receipts have explicit truth effect rather than relying on their name:

- `delivery_receipt`: context was delivered; `truthEffect: 'none'`;
- `operation_receipt`: a command or storage mutation completed;
  `truthEffect: 'none'`;
- `experience_receipt`: an interaction was played and may be confirmed;
  `truthEffect: 'played' | 'confirmed'`;
- `life_transition_receipt`: current Life state changed through validated
  evidence or deterministic policy; `truthEffect: 'applied'` and
  `confirmedBy: 'user' | 'policy'`.

## The Authority Ladder

The central rule for old history, new interaction, and future long plot is:

```text
source evidence
  -> versioned interpretation candidate
  -> typed promotion proposal

ordinary live lane:
  -> memory policy gate
  -> memory promotion receipt

narrative lane:
  -> non-exclusive route / entity association
  -> explicit directive or draft
  -> played interaction
  -> confirmed experience receipt
  -> memory promotion and/or Character Life transition proposal
```

Each arrow is a real gate. Nothing may skip directly from source evidence or
model prose to current state.

The two lanes prevent opposite mistakes:

- a player does not have to confirm every Chat, Call, diary, or Social message
  they personally participated in; eligible live evidence may be promoted by a
  user-enabled MemoryDM policy after scope, provenance, duplicate, and target
  checks;
- generated plot plans, unplayed scenes, NPC proposals, and offscreen world
  changes do require the narrative lifecycle and may not disguise themselves as
  ordinary chat memory.

Automatic memory promotion still does not authorize a mainline event or a
Character Life mutation. Those targets keep their own receipts and validation.

The following axes remain separate in storage and policy. A single status enum
must not collapse them:

```text
authority          who or what may support the claim
temporalClass      historical, live, planned, or current
knowledge          who is allowed to know it
continuity         mainline, IF, date line, scene-only, or shared evidence
experienceStatus   proposed, played, confirmed, rejected
currentness        whether it is true now
```

### 1. Source evidence

Examples: imported Word/TXT turns, daily JSON documents, live Chat messages,
Call messages, Date beats, Social posts, and user edits.

- Source evidence remains source evidence even when visible in another App.
- Imported raw source is immutable. Daily Archive owns a revisioned curation
  projection over source identity; it does not become the owner of the original
  Word/TXT file merely because the player corrected or locked a day.
- Live Chat/Call/Date evidence currently permits overwrite-style edits. A
  queryable live-evidence revision ledger is a future strengthening, not a
  property this contract pretends already exists.
- Export-channel roles are transport roles, not guaranteed in-world actors.
- Historical source timestamps remain real archive boundaries. Virtual-world
  time does not rewrite them.

### 2. Interpretation candidate

Examples: historical relationship memories, historical Timebook nodes,
historical routes/NPCs/events, and MemoryDM candidates.

- Model passes are immutable and repeatable.
- Human correction is a versioned overlay, not an edit to raw evidence.
- Exact duplicate visible candidates may coalesce while retaining provenance.
- Mutually exclusive facts may remain parallel candidates.
- Historical candidates always retain `temporalClass: 'historical'`.

### 3. Typed promotion proposal

A candidate names its source, temporal class, knowledge class, confidence,
intended target, and exact relationship scope. It is still not durable truth.

- Ordinary live interaction may proceed directly to a memory policy gate.
- Historical and narrative candidates may additionally enter non-exclusive
  route, entity, or event association.
- A proposal for current Life state is evaluated only from an authority-eligible
  live interaction or confirmed experience receipt.

### 4. Association and planning

One source span may support mainline, IF, date, scene-only, or several routes at
the same time. Bindings are additive and non-exclusive. Removing one binding
does not move or delete the source or a sibling binding.

A StoryDesk directive or draft run is planning state. It is not memory and did
not happen to the character.

### 5. Played experience

The user and model may produce prose, dialogue, actions, NPC turns, choices, and
state proposals. Played output is evidence of interaction, but it is not
confirmed durable truth until the owning lifecycle accepts it.

### 6. Confirmed experience receipt

Only a scope-valid receipt linked to the exact run and scene may promote a
played narrative experience. Mainline, IF, date, keepsake, and character-private
policies remain distinct.

Confirmation authorizes evaluation for downstream promotion. It does not force
every accepted fact into every memory store.

### 7. Memory and current state

Memory answers “what remains meaningful or retrievable?” Character Life answers
“what is true now?” These are neighboring domains, not one table.

- relationship memory, Timebook, character-private insight, dream material, and
  mainline story memory are separate promotion targets;
- Character Life alone owns current condition, location, availability,
  commitment, recovery, and route locks;
- a confirmed experience may emit both a memory-promotion proposal and a
  Character Life event, but each owner validates and records its own result;
- `WorldlineHotState` is a prompt projection, not durable current truth.

## Relationship And Knowledge Scope

Relationship-private operations require:

```ts
interface RelationshipScope {
  progressBundleId: string;
  personaMaskId: string;
  charId: string;
}
```

The three parts are inseparable. A missing or mismatched part fails closed.
There is no fallback to the current character, first character, all characters,
or a similarly named persona.

Multi-character surfaces such as Group Chat resolve one exact relationship
scope per character. They do not merge several private memory shelves into one
public blob. Knowledge policy is checked after relationship scope and before
prompt formatting.

Shared libraries such as Worldbook and Study may be device-wide, but this does
not grant them automatic access to mask-private history.

## Target App Capability Manifest

`INSTALLED_APPS` is currently the single launcher/appearance catalog but does
not yet describe domain authority. Implementation should evolve one canonical
App registry that exports both launcher metadata and behavioral manifests,
without importing App components. Do not create a sibling per-App inventory
that can drift from the launcher catalog.

```ts
type AppSurfaceKind =
  | 'management'
  | 'life'
  | 'evidence'
  | 'creative'
  | 'utility';

type AppLifecycle = 'core' | 'supported' | 'experimental' | 'hold';

interface AppCapabilityManifest {
  schemaVersion: 1;
  appId: AppID;
  surfaceKind: AppSurfaceKind;
  lifecycle: AppLifecycle;
  ports: readonly AppCapabilityPort[];
}

interface AppCapabilityPort {
  id: string;
  scopeKind: 'device' | 'persona' | 'relationship';
  provides: readonly string[];
  reads: readonly string[];
  commands: readonly string[];
  receipts: readonly string[];
  ownedDataFamilies: readonly OwnedDataFamily[];
  historyPolicy: HistoricalSurfaceDisposition | 'not_applicable';
}

interface OwnedDataFamily {
  id: string;
  ownerDomain: string;
  backup: 'required' | 'derived_only' | 'none';
  retention: 'user_owned' | 'durable' | 'rebuildable' | 'ephemeral';
  migrationTarget?: string;
  deleteImpact: string;
}
```

The manifest is documentation and validation metadata. It must not become a
service locator with hidden write authority.

One App may expose several ports. Contacts has device-level identity management
and relationship-level panels; Worldbook has a device library and scoped mount
projections; Social has a persona feed plus per-character knowledge-filtered
reads. Scope, backup, history policy, and deletion impact therefore belong to
the port/data family rather than one coarse App-wide flag.

Concrete code keeps simple names:

```text
readXProjection(input) -> Promise<Readonly<XProjection>>
selectXContext(input)   -> Promise<XDeliveryPacket>
executeXCommand(input)  -> Promise<XReceipt>
```

App components call these ports. They do not inspect another domain's IndexedDB
tables or reconstruct scope rules themselves.

The shared layer is a set of typed ports, not one omniscient global object. A
minimal cross-domain envelope should keep identity and revision visible:

```ts
type AppDataScope =
  | { kind: 'device' }
  | {
      kind: 'persona';
      progressBundleId: string;
      personaMaskId: string;
    }
  | ({ kind: 'relationship' } & RelationshipScope);

interface ScopedProjection<T> {
  schemaVersion: number;
  producer: string;
  scope: AppDataScope;
  revision: string;
  asOf: string;
  sourceRefs: readonly SourceRef[];
  data: Readonly<T>;
}

interface DomainCommand<T> {
  commandId: string;
  issuer: string;
  scope: AppDataScope;
  expectedRevision?: string;
  idempotencyKey: string;
  sourceRefs: readonly SourceRef[];
  payload: T;
}

interface DomainReceipt<T> {
  receiptId: string;
  kind:
    | 'delivery_receipt'
    | 'operation_receipt'
    | 'experience_receipt'
    | 'life_transition_receipt';
  commandId?: string;
  producer: string;
  scope: AppDataScope;
  status: 'accepted' | 'applied' | 'rejected' | 'noop';
  truthEffect: 'none' | 'played' | 'confirmed' | 'applied';
  confirmedBy?: 'user' | 'policy';
  revision?: string;
  inputRefs: readonly SourceRef[];
  outputRefs: readonly SourceRef[];
  result?: Readonly<T>;
  reasonCode?: string;
  occurredAt: string;
}
```

Domain-specific types narrow these envelopes. They do not pass untyped prompt
blobs or expose storage handles to a consumer App.

## Shared Global Contracts

Every core App may consume only the relevant subset of these shared contracts.

| Contract | Current or planned owner | Rule |
| --- | --- | --- |
| App catalog/layout | `INSTALLED_APPS`, `launcherLayout` | One catalog; user order/hide state is presentation, not capability authority. |
| Shell/appearance | shared shell layout and appearance preset | Header geometry, chrome mode, theme, and App icon rules stay global. |
| Persona life scope | `personaRouteScope` | Management surfaces keep all roles reachable; life/generation surfaces use linked roles and fail closed. |
| Relationship scope | message/history scope helpers | Private reads and writes use the exact triple scope. |
| Virtual city context | `VirtualWorldContext` | Read-only location/era/time/weather projection; never rewrites source timestamps, plot, tasks, or memory. |
| Historical retrieval | `selectHistoricalRelationshipCandidates` | Exhaustive surface policy, knowledge gate, token budget, no direct archive reads. |
| General memory delivery | target memory projection port; current `selectWorldlineMemoryContext` compatibility adapter | Stable base plus small surface-specific packet and delivery receipt. Legacy char-scoped sources are not yet fully fail-closed. |
| Narrative context | `NarrativeDirectorContext` | Frozen current truth plus historical candidate projection; no implicit writes. |
| Character Life | planned life state/event owner | Sole current-state authority; all life surfaces read the same projection. |
| Backup/export | whole-device backup contract | User-owned source, settings, receipts, and durable domain data survive code updates. |

## Source And Promotion Matrix

| Source | Starts as | May feed | Must not do directly |
| --- | --- | --- | --- |
| Imported Word/TXT | immutable historical evidence | History Analysis, Calendar search, bounded Chat reconnection | current emotion, reminders, current Life state, active run |
| Daily Archive correction | higher source revision / human curation | historical analysis and source navigation | rewrite imported raw file or become memory solely because a day is locked |
| Historical analysis | versioned historical candidates | Contacts, Timebook, StoryDesk, policy-eligible App selectors | create active scene, live open thread, current condition, memory write |
| New Chat/Call/Social interaction | live source evidence | recent context, MemoryDM candidate extraction, archive projection | auto-become mainline plot, current Life truth, or permanent memory without policy/receipt |
| New Date/scene play | played interaction evidence | experience receipt review, narrative continuity | claim confirmed route truth before confirmation |
| Historical mainline/IF/date route | historical route candidate and bindings | StoryDesk background or explicit “continue this line” | activate itself because it is recent or user-edited |
| Narrative directive | planning state | draft run activation | memory/current-state write |
| Confirmed Narrative receipt | lived scoped experience | memory promotion and Character Life event proposals | bypass target-domain validation |
| Worldbook entry | canon/source material | prompt base, world/NPC constraints, plot planning | claim that an event happened or a relationship changed |
| Character Life event | append-only current-state evidence | shared life projection, hot-state prompt adapter | rewrite historical evidence or relationship keepsakes |

## Core App Capability Map

This table states the intended ownership seam. “Provides” means a typed
projection or receipt, not permission for other Apps to read its store.

| App / surface | Player verb and landing | Owns | Reads | Commands / receipts |
| --- | --- | --- | --- | --- |
| `旧日迁入` | bring an old relationship in quickly | intake batches and import progress | file parser, chosen relationship scope | import/archive command -> import receipt; never memory |
| `对话日历` | browse, search, correct, supplement, and lock source days | Daily Archive documents, revisions, curation metadata | imported/live source projections | move/merge/edit/delete/supplement/lock -> archive revision receipt |
| `通讯录` / role detail | manage role existence, mask links, and relationship-facing summaries | character identity and explicit profile edits | relationship memory/stage projections, source jump metadata | identity/link commands and historical overlay commands; no silent current-state mutation |
| `Chat` | remote companionship and mixed light roleplay | live message thread and presentation setting | stable role base, live tail, scoped memory packet, compact Life projection | send message -> live interaction receipt; MemoryDM receives evidence later |
| `电话` | synchronous remote contact | call session/message evidence | role base, recent remote context, Life availability | start/end/save call -> call interaction receipt |
| `见面` | embodied scene, date, or light roleplay | resumable scene presentation state and played evidence | memory packet, relevant route projection, Life availability, world context | play/save/confirm -> date or narrative experience receipt |
| `朋友圈` | see the linked life circle | social records and local user-authored post edits | public-safe life/memory/social projection | publish/react/remove-from-circle -> social receipt; no private-memory leak |
| `群聊` | multi-character social interaction | group thread | per-member public/shared projections | per-participant interaction receipts; never one merged private relationship scope |
| `交换日记` | reflective asynchronous exchange | diary entries | query-triggered relationship projection and compact day state | save entry -> diary evidence receipt; later memory proposal, not direct truth |
| `时光簿` | see and correct confirmed shared milestones | manual/confirmed relationship date entries | confirmed keepsake and historical correction projection | add/edit/hide/restore -> Timebook receipt |
| `笔友会 / StoryDesk` | plan, play, review, and archive long routes | directives, runs, scenes, NPC route state, experience receipts, manuscript | narrative history projection, Worldbook/canon, Character Life projection | activate/play/confirm/archive commands -> narrative receipts |
| `世界书` | edit and mount canon/source packs | worldbook entries and mounts | shared library only | create/edit/order/mount -> source-config receipt; never experience memory |
| `特别时光` | play a bounded relationship game or keepsake event | game/event run and local keepsake records | confirmed relationship and calendar projection | run/confirm/share -> keepsake or interaction receipt |
| `同行计划` | manage user goals and check-ins | plan/check-in records | explicit plan context and bounded confirmed memory | create/check-in/complete -> plan receipt; not a replacement for Character Life |
| `设置 / 外观` | manage software and inspect diagnostics | global configuration and appearance | metadata-only delivery/write receipts | config commands; no relationship or narrative truth |

Other installed Apps remain supported or experimental surfaces until a separate
capability audit proves their unique player verb, data ownership, consumers,
backup path, and removal safety. `TRPG`, `都市人生`, `查手机`, `攻略本`, `小小窝`,
`写歌`, and `存钱罐` must not be wired into mainline or relationship memory by
guessing. Their current useful mechanics may be donors to core surfaces without
making their legacy stores global authorities.

Historical Analysis is deliberately not a standalone “memory App”. Its
projections appear where the player already has a reason to act: source
correction in Daily Archive, relationship review in Contacts/Timebook, and
route continuation in StoryDesk. The analysis domain stays reusable even when
its current panel moves.

## Gameplay Landing Rules

The product should not ask the player to classify themselves as “companion” or
“roleplay” during import. The same relationship may use several modes.

### Independent daily companion

- Chat, Call, Social, Group Chat, Journal, Timebook, and proactive messages are
  the visible surfaces.
- Character Life provides the shared day/availability/condition projection.
- Worldbook provides canon/world floor.
- StoryDesk may observe long continuity but does not need to drive every day.

### Embodied or light co-authored play

- Date/见面 is the embodied scene surface.
- Chat remains valid when the fictional medium is a phone, mail, or mixed text
  exchange.
- Parentheses, narration, and NPC mentions are interaction evidence, not a
  reason to force per-line speaker homework.

### Long route and multi-NPC progression

- StoryDesk/Novel owns route planning, NPC state, scene lifecycle, and receipts.
- Date may present a bounded embodied scene, but it does not own the route.
- Historical route/event/NPC candidates remain a read-only map until the player
  explicitly continues a line.

### Emergent co-created world

- Frontstage Character and user may improvise freely in Chat or Date.
- Narrative Director defaults to archivist/continuity support.
- A user-invoked catalyst may propose the next opening when the story stalls.
- A proposal is a directive, never a silently advanced world fact.

### Existing-world daily relationship

- Worldbook and character canon establish the world.
- Character Life supplies the independent daily rhythm.
- Major canon conflict does not have to invade ordinary companionship unless a
  route or surface explicitly opens it.

## Write Authority Separation

### Narrative Director

May read scoped historical/narrative/life projections and propose directives,
NPC actions, scene beats, and route-state transitions.

It must not write relationship memory, Timebook, Character Life, raw history,
or Character speech directly. Accepted proposals are applied by narrative
commands; lived outcomes are represented by experience receipts.

### Narrative Application Service

Owns validated creation and lifecycle transitions for directives, draft/active
runs, scenes, and narrative experience receipts. Every truth-bearing record
must retain the full relationship scope. It rejects stale revisions, treats a
draft as unplayed, and never activates a historical route merely because the
route was retrieved or edited.

### MemoryDM

May read eligible live interaction evidence and confirmed experience receipts,
then produce typed candidates with source references, knowledge, temporal
class, confidence, and target policy.

Target direction: MemoryDM does not own final relationship truth. A promotion
port applies duplicate, authority, policy, and receipt checks before writing a
memory target. Existing direct auto-apply paths are compatibility debt to be
contained, not a pattern for new Apps.

For eligible ordinary live interaction, that promotion port may run
automatically under the user's memory setting. “Receipt” here is a system
audit/result record, not another confirmation task imposed on the player.

### Memory Promotion Service

Owns the gate from a typed candidate to relationship memory or a Timebook node.
It validates exact scope, source references, authority, target policy,
duplicates, revision, and any required experience receipt. It returns a
promotion receipt and never rewrites raw evidence or an interpretation pass.

MemoryDM proposes; the promotion service decides and writes. This separation is
required before a new App may create durable relationship memory.

### Character Life

Owns current state and append-only life events. It may accept bounded proposals
from explicit interaction, confirmed narrative receipts, and deterministic
clock progression.

It must reject historical-only input, draft narrative, incompatible scope,
unconfirmed scenes, and destructive offscreen escalation outside the selected
life policy.

Character Life may also advance an already confirmed daily state through a
deterministic clock/policy transition — for example sleeping, commuting, or
recovering — without claiming a new shared experience. That path emits a
`life_transition_receipt` with `confirmedBy: 'policy'`; it may change daily
availability but cannot invent relationship memory or played plot.

### Scheduler

Owns reminder and proactive-wakeup scheduling after receiving an explicit,
scope-valid command from the responsible plan, Life, or relationship policy.
It emits operation/delivery receipts. A schedule is not a memory fact, and
MemoryDM does not write scheduler rules as a side effect of interpretation.

### Apps

Apps own UI-local draft/presentation state and their explicitly assigned source
records. They submit commands and render projections. They never grant
themselves a cross-domain write merely because the user clicked a button on
their page.

## Clean Virtual-App Module Shape

Each completed feature block should converge on this local shape where useful:

```text
apps/FooApp.tsx                 thin App composition and navigation
components/foo/                 reusable visual pieces
domain/foo/                     types, lifecycle, validation, pure transitions
utils/foo/                      storage adapters and cross-domain ports
scripts/verify-foo.ts           deterministic contract/fixture gate
docs/...                        visible ownership and interoperability notes
```

Not every small App needs every directory. The rule is separation of concerns,
not empty scaffolding.

Shared UI geometry stays in the shell contract. Shared scope, memory, time,
location, and backup logic stays in shared modules. An App-specific file should
not become the only implementation of a global rule.

## When A New App Is Justified

A new App should have all three:

1. a player verb that is not already natural inside an existing App;
2. a distinct interaction lifecycle or durable record family;
3. a stable projection/command boundary that another App cannot express as a
   child panel without becoming confusing.

If the feature only displays another domain's data, it is usually a child panel
or projection. If it only changes global presentation, it belongs in Appearance
or Settings. If it only performs memory retrieval, it belongs in the shared
selector, not a new memory organ.

## App Removal Gate

Removing an App is a migration, not an icon deletion. An App may be removed only
after all of these are true:

- it has no unique player verb worth preserving;
- it owns no unique durable data, or that data has an explicit migration target;
- no prompt, selector, proactive runtime, backup, deep link, or other App still
  consumes its receipts or records;
- its AppID, launcher registration, lazy route, layout normalization, backup,
  and tests have a deliberate compatibility plan;
- users can still export or recover any user-authored material;
- the replacement passes the same relationship-scope and authority gates.

Hide/reorder is a presentation choice and is already supported. It is not proof
that an App is technically safe to delete.

## Current Reusable Seams

The following current code should be extended instead of duplicated:

- `INSTALLED_APPS` and `launcherLayout` for catalog and appearance projection;
- `personaRouteScope` for management vs life-surface character access;
- strict relationship-scope helpers and `message.metadata.relationshipScope`;
- `VirtualWorldContext` for read-only fictional time/location/weather;
- `selectHistoricalRelationshipCandidates` and exhaustive
  `HISTORICAL_SURFACE_POLICIES`;
- `selectWorldlineMemoryContext` and `WorldlineMemoryReceipt` as compatibility
  formatting/delivery seams while legacy char-scoped inputs are migrated;
- `NarrativeDirectorContext` for frozen historical/current narrative context;
- Daily Archive stable ids, revisions, curation receipts, and backup contract;
- Narrative directive/run/scene/receipt lifecycle.

## Known Gaps Before Full Enforcement

- `INSTALLED_APPS` describes launcher metadata, not behavior capabilities.
- Many App components still call shared DB/OSContext methods directly; migration
  should happen block by block, not as one dangerous rewrite.
- MemoryDM currently has optional direct writes to character memories,
  anniversaries, and wakeup rules without one shared promotion receipt.
- `char.memories` and anniversaries are still primarily character-scoped legacy
  stores. They cannot represent two masks' separate relationship continuity;
  new durable relationship memory must use the exact triple scope, with legacy
  adapters treated as migration-only compatibility.
- Character Life is still a contract, not the implemented current-state owner.
- Narrative directives, runs, scenes, and experience receipts do not yet all
  persist the full `progressBundleId + personaMaskId + charId` scope even though
  Director context can receive it. Truth-bearing narrative records must be
  upgraded before mask-private continuity is considered safe.
- Historical event/actor/route-binding types are planned but not yet sealed in
  the public history schema.
- Some legacy App records are scoped only by character or global store and need
  explicit bundle/mask ownership before they can join cross-App memory.
- Several live surfaces still derive relationship scope from the currently
  active profile through loose helpers or non-null assertions. Private
  cross-App reads and delayed writes must converge on strict captured scope and
  fail closed, matching the historical selector contract.
- `selectWorldlineMemoryContext` is not yet a fully strict unified selector:
  historical candidates are scope-gated, but legacy messages, anniversaries,
  character memories, hot state, and semantic dedupe still need scope and
  provenance hardening.
- Worldbook grouping exists, but dynamic injection/order/activation policy is a
  separate future contract.
- Worldbook is currently a shared library with character mounts; those mounts
  are not automatically mask-private relationship bindings. Canon access and
  lived-memory access must remain separate until mount scope is explicit.

These gaps are implementation work, not permission for new Apps to invent
private shortcuts.

## Block Completion Checklist

A feature block is not clean until reviewers can answer:

- What unique player verb lives here?
- Which domain owns each durable record?
- What exact relationship scope applies?
- Which projections are read, and through which selector/provider?
- Which commands can mutate state?
- What receipt proves each mutation or prompt delivery?
- Can historical evidence be mistaken for current state?
- Can draft/generated material be mistaken for played truth?
- Does it preserve mainline/IF/date/scene-only separation and non-exclusive
  evidence bindings?
- Is user data present in text/full backup or intentionally derived-only?
- Does the App follow shell, appearance, and persona life-surface rules?
- If the App vanished, where would its records and user actions go?

Only after those answers are explicit should the block be treated as a clean,
maintainable virtual App unit.
