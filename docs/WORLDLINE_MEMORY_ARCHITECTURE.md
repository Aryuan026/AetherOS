# Worldline Memory Architecture

This document defines the fork's memory direction before the code grows a
larger storage layer. It is intentionally product-facing and code-facing at the
same time: every UI surface should be able to ask the same memory core for the
right slice of context.

## Product Model

AetherOS should not treat chat, meeting scenes, dates, timebook rows, proactive
letters, and canon story as separate worlds. For an otome companion, they are
different meeting media inside one relationship:

- the character has their own life line
- the user has their own life line
- canon story gives the world floor
- generated scenes and dates are branches
- chat is remote companionship
- meeting mode is face-to-face companionship
- timebook keeps selected shared moments

The stable memory object is therefore not "a chat summary". It is a worldline
intersection: a moment where character life, user life, canon setting, and the
relationship touched.

## Core Axes

Every future durable memory row should be able to answer four questions.

### Origin

Where did this memory come from?

- `daily_chat`: phone messages / remote companionship
- `meet_scene`: face-to-face meeting mode
- `canon_story`: original plot or fixed canon material
- `date_scene`: user-generated date or story branch
- `calendar`: manual or AI-added reminder/date
- `timebook`: saved relationship keepsake
- `diary`: character or user diary
- `proactive_letter`: active message / 惦念
- `system_import`: imported historical material

### Continuity

How widely should it be allowed to affect future scenes?

- `canon`: fixed source/canon; do not rewrite lightly
- `relationship`: shared relationship line between current user and character
- `branch`: a generated scenario or date branch
- `scene_only`: a transient scene fact

### Knowledge Scope

Who knows it inside the fiction?

- `char_private`
- `user_private`
- `shared`
- `unknown_to_char`
- `unknown_to_user`

### Status

How settled is it?

- `draft`: candidate extracted from recent play
- `soft_canon`: plausible relationship truth, waiting for repeated acceptance
- `confirmed`: accepted as relationship memory
- `archived`: available for cold recall, not frontstage by default
- `discarded`: should not be delivered

## Prompt Delivery Principle

Do not inject every saved memory into every prompt. Each request should select a
small context packet for the current surface:

```text
current surface + current worldline + current medium
-> select relevant intersections
-> format tiny prompt block
-> append to the existing role/user/worldbook context
```

The first implementation should be read-only and adapter-based. It may reuse
existing stores such as `messages`, `anniversaries`, and `assets`, but it should
not immediately bump IndexedDB or migrate user data.

## First Implementation Slice

Create `utils/memoryCore/` with:

- shared types for origin / continuity / knowledge / status
- a selector that can read current legacy data and produce a small prompt block
- a formatter for prompt injection
- adapters for chat, meeting/date, proactive letter, and timebook-related hints

The first selector is deliberately modest:

- use the first-contact anchor from `assets`
- use selected anniversaries from `anniversaries`
- use a tiny recent slice of `char.memories` for role-private remembered moments
- use a tiny recent transcript scan for open promises or scene continuation
- keep `ContextBuilder.buildCoreContext()` synchronous and DB-free

## Visible Receipts

The product also needs a visible "yes, it remembered" signal. Without that,
users can only trust the memory system by feeling, and maintainers cannot test
flow until many days of conversation have accumulated.

The first visibility layer is therefore a local delivery receipt, not a durable
memory store:

```text
selector runs
-> tiny worldline context is selected
-> prompt receives the context
-> Settings / 最近记住 shows the receipt
```

Receipt rows answer:

- which surface asked for context: chat, meeting, date, proactive letter, or
  timebook
- which character received it
- how many candidates and open threads were delivered
- which titles were involved
- whether any legacy source failed to read

This is intentionally placed in system settings as a verification surface. The
immersive frontstage still belongs to diary, timebook, album, social posts, and
future relationship keepsakes.

## Automatic Interpretation

The current layer is deliberately extraction-only. It turns exact-scope active
source evidence into auditable candidates without quietly changing any durable
relationship or world truth.

Current rules:

- local transcript-spliced daily chat sediment is disabled because it risks
  replaying ordinary chat instead of preserving moments the character would
  truly care about;
- `char.memories` remains on higher-quality paths for now: model archive, diary
  archive, imports, or later reviewed refinement;
- timebook-worthy nodes become source-linked proposals only;
- the deterministic `时光簿` candidate rule is strict by default and keeps only stronger first-time,
  appointment, gift, meal, illness, meeting, missing-you, or reminder signals;
- ordinary affectionate observations may become relationship-memory candidates
  when the user enables quiet turn-interval sorting. The current UI exposes
  20/40/60/80/100 user turns and defaults to 60;
- MemoryDM uses the same foreground chat API and returns structured candidates.
  All targets remain candidates in this phase; extraction writes no
  `char.memories`, anniversaries, wakeups, Narrative, or Character Life state;
- the app must not ask the player "is this an anniversary?" or "should I
  remember this?" during immersive play;
- wrong candidates are handled by future destination review/correction after a
  separate promotion decision, not by frontstage interruption;
- `char.impression` is presented as `关系印象` and remains manual/review-first
  because it is injected into every prompt and can change the whole role feel if
  overwritten badly. Every extraction prompt for this layer must be audited for
  role-internal private-note perspective before automation.

The UI distinction is:

- `最近候选`: source-linked interpretation proposals, not durable memory facts.
- `记忆回声`: selector delivery receipts showing what context entered a prompt.

This layer is not a replacement for later vector / Hippocove cold-tree work. It
is a traceable product bridge so future retrieval tuning has versioned
evidence, repeatable interpretation, explicit promotion gates, and a local
debug ledger.

## Later Durable Stores

After the selector proves useful, add dedicated stores:

```ts
interface WorldlineMemoryEvent {
  id: string;
  charId: string;
  userId?: string;
  origin: MemoryOrigin;
  continuity: ContinuityScope;
  knowledge: KnowledgeScope;
  status: MemoryStatus;
  title: string;
  summary: string;
  happenedAt?: string;
  branchId?: string;
  sourceRefs?: SourceRef[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}
```

Likely stores:

- `worldline_events`
- `worldline_threads`
- `relationship_bonds`
- `memory_delivery_receipts`

This comes after the UI and prompt behavior are reviewed, not before.

## Compatibility With Upstream Memory Palace

The upstream SullyOS Memory Palace is a real retrieval system with extraction,
vectors, BM25, rooms, links, event boxes, and background processing. This fork
should not copy it wholesale into the current product state.

Useful parts to borrow later:

- EventBox-style grouping for repeated scene facts
- hybrid retrieval for cold archive
- high-water processing once message volume is large
- recall receipts to debug what entered the prompt

Parts to avoid in the first slice:

- required embedding setup before the product shape is stable
- many visible memory-management controls
- runtime prompt injection stored directly on the character profile
- automatic archive/hide behavior before users understand it

## UI Rule

The memory core should exist before broad UI. UI surfaces should display or
edit slices of the same structure:

- `时光簿`: selected shared keepsakes
- `同行计划`: active goals and check-ins, optionally exportable later
- `聊天`: remote companionship context
- `见面`: face-to-face scene context and branch continuity
- `主动来信`: same relationship context, with remote-message constraints
- future story/canon surfaces: canon and branch selectors

This prevents the fork from building beautiful screens that cannot share memory.
