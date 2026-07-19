# Memory Delivery Contract

This document defines how AetherOS should decide which memory and character
state enters each AI request. It is a design contract for implementation and
review, not a finished retrieval engine.

## Core Principle

The old context path and the new memory path should complement each other.

- `ContextBuilder` remains the stable base-context builder: character identity,
  user profile, worldview, mounted worldbooks, relationship impression, and
  long-lived core memories.
- `memoryCore` owns dynamic delivery: current surface, current message, recent
  worldline state, sparse memory retrieval, receipts, and later hybrid
  keyword/vector recall.
- Imported history enters this same dynamic delivery path through a resolved,
  full-relationship-scope projection. It must not create a second selector or
  one private memory copy per App.

AetherOS should not treat the character as a reply generator. The character has
their own parallel life line; the chat page is a phone channel into that life.
Every AI request should therefore be assembled from a small contract:

```text
surface mode
-> stable base
-> character voice core
-> worldline hot state
-> relevant memory / story / calendar packet
-> clipped prompt block + delivery receipt
```

## Memory Layers

### Stable Base

Stable base is the lowest-frequency layer. It should change only when the user
edits character settings, imports material, or approves a higher-level update.

Sources:

- character identity and system prompt
- canon/worldview floor
- user profile and relationship basics
- `char.impression` / `关系印象`, while automatic overwrite stays on hold
- refined long-term memories
- character voice core, including language fingerprints

Token rule: keep this layer compact and reusable. It can be present in most
requests because it defines who is speaking, not what just happened.

### Character Voice Core

The planned `藏好的话` warehouse belongs to stable base, but its three classes
must be used differently.

```ts
type VoiceLineKind =
  | 'direct_message'
  | 'rewrite_seed'
  | 'language_fingerprint';
```

- `direct_message`: ready-to-send short active messages. These do not depend on
  the player's previous line and may be used by proactive-letter/direct mode
  after calendar, quiet-hour, relationship, and duplicate checks.
- `rewrite_seed`: canonical-feeling seeds. These should not be sent raw unless
  marked safe; the model rewrites them against current relationship, time,
  worldline hot state, and recent mood.
- `language_fingerprint`: not directly sent. This is a compact personality and
  speech guide: habitual phrasing, joking style, care style, boundaries,
  non-negotiable attitudes, personal habits, and how the character faces
  conflict or tenderness.

Public-repo rule: keep the code schema and tiny synthetic examples in git. Do
not commit large copyrighted source-line collections or scraped canon dialogue
data into the public repository. Real voice packs should be imported locally or
provided by the user.

Usage rule: voice material needs cooldown and retirement. A small 20-40 line
slice is only a smoke-test set, not the storage ceiling. Direct messages should
record use count, last-used time, rendered text hash, and candidate id so exact
lines do not loop. Rewrite seeds may be reused with longer spacing and fresh
rendering. Language fingerprints are compact durable traits and should be
sampled sparsely instead of injected wholesale.

Mode rule: `藏好的话`, `此刻的话`, and `生活照看` are parallel layers. The current
legacy `defaultMode` setting makes hidden/canon-like lines and AI-rendered
moments mutually exclusive; the target model is separate booleans plus a
selector that decides by availability, cooldown, relationship gate, and current
scene density.

### Worldline Hot State

Hot state is the character's short-lived "what is going on with him lately"
layer. It is not a durable keepsake and not a replacement for memories.

Suggested shape:

```ts
interface WorldlineHotState {
  charId: string;
  currentWhereabouts?: string;
  currentMood?: string;
  currentPressure?: string;
  activeThreads: string[];
  storySignals: string[];
  pendingCare: string[];
  recentlyMentionedPeople?: string[];
  sourceRefs?: Array<{ kind: string; id: string }>;
  updatedAt: number;
  expiresAt?: number;
}
```

Examples:

- he has a mission/report/performance/class/rehearsal thread today
- he is tired, distracted, relieved, teasing, or holding something back
- he has an unresolved promise to the user
- he has a private clue for a future meeting scene
- he is likely to check in about meals, sleep, stress, or a calendar item

Token rule: this should be short, usually 300-600 Chinese characters after
formatting. It gives presence, not biography.

### Relationship Memory

Relationship memory is what should survive beyond the current week.

Current sources:

- `char.memories`: character-private remembered moments, small habits, private
  observations, and emotionally sticky details.
- `anniversaries` / `时光簿`: confirmed shared dates and keepsake moments.
- `timebook_first_contact_${charId}`: first-contact anchor.
- `companion_wakeups`: care reminders and calendar-linked wakeup windows.
- future durable `worldline_events`: cross-surface relationship intersections.

Token rule: retrieve sparsely. Do not inject the whole memory shelf into every
message.

### Story Material

Story material is useful for future generated plots but should not be treated as
confirmed relationship truth by default.

Sources:

- approved 朋友圈 / 资讯站 posts
- `narrative_proposal` candidates from MemoryDM
- generated date branches
- canon-story hints
- future writing/plot-bank surfaces

Token rule: deliver only to story, meeting, date, social, or explicit plot
requests. Keep it out of ordinary affectionate phone chat unless it has become
relationship memory.

## Surface Delivery Matrix

| Surface | Stable base | Hot state | Retrieval packet | Voice-line use | Avoid |
| --- | --- | --- | --- | --- | --- |
| Chat / 对话 | identity, user, worldview, voice fingerprint | current mood, whereabouts, open promises, pending care | relevant `char.memories`, first-contact, near anniversaries, recent open threads | fingerprint only; no raw proactive direct lines | full timebook, full chat history, story seeds unless relevant |
| Proactive letters / 惦念 | identity, voice fingerprint, relationship basics | current day state, care intent, calendar window, unresolved concern | calendar reminders, small private memories, pending threads | direct message or rewrite seed; fingerprint always | relying on user's last line; large history |
| Call / 电话 | identity, voice fingerprint, relationship basics | current emotional state and interruption context | recent chat tail, strong private memory, active promise | fingerprint; occasional rewrite seed | long timebook packets |
| Meeting / 见面 | identity, worldview, relationship basics | where he came from, why this scene opens now | timebook anchors, branch/canon hints, relevant memories | fingerprint and rewrite seed | calendar-care chatter unless scene-relevant |
| Date scene / 约会 | identity, worldview, relationship stage | scene mood, branch state | relationship milestones, branch facts, selected story seeds | fingerprint and rewrite seed | unrelated daily-care reminders |
| Timebook / 时光簿 | identity and relationship basics | normally none; hot state only when opening a newly generated note needs tone | confirmed dates, first-contact, selected keepsakes | fingerprint for prose style | treating reminders as memories; constant rewrites |
| Calendar / 日历 | relationship basics, care style | upcoming day/week state | calendar rules, wake windows, anniversaries | direct line or rewrite seed when generating messages | making the user approve immersive memories in chat |
| Moments / 朋友圈 | public-facing character state and social persona | character's day, public hints, side characters | approved posts, story seeds, canon/social hints | fingerprint for public tone | private user memories unless shared and suitable |
| Consulting / 资讯站 | world/canon/social rumor state | current public events | story seeds, side plots, non-private materials | fingerprint for article/comment tone | relationship secrets |
| Companion plan / 同行计划 | relationship basics and care style | user's current goal state | plan milestones, check-ins, procrastination patterns | fingerprint for encouragement | turning goal review into timebook automatically |
| Study / 书房 | role style and user learning prefs | current study session | uploaded material summaries, study records | fingerprint for tutoring tone | relationship memory unless user seeks comfort |
| Diary / 日记 | identity and relationship perspective | day ending state | selected daily memory and emotional residue | fingerprint for private prose | sending diary memory into every chat turn |

## Delivery Pipeline

Every AI-facing feature should eventually use the same pipeline.

1. Resolve active character, user, and surface mode.
2. Build stable base through `ContextBuilder`.
3. Attach a compact character voice core.
4. Resolve `WorldlineHotState` for the active character and surface.
5. Classify the request into a delivery tier:
   - resident only
   - heartbeat lite
   - affective warm
   - focused recall
   - story/branch
   - full diagnostic
6. Retrieve candidates from legacy stores and future vector/keyword indexes.
7. Rerank by surface, knowledge scope, continuity, recency, exact match,
   semantic match, and user-visible correction status.
8. Deduplicate and clip to the surface budget.
9. Format a tiny prompt block.
10. Store a delivery receipt.
11. After the model response, let MemoryDM append source-linked interpretation
    candidates and a `truthEffect: none` receipt. A separate future Promotion,
    Scheduler, Narrative, or Character Life command owns every target write.

## Hybrid Retrieval Position

Vector retrieval should augment the selector, not replace it.

- keyword / BM25 / n-gram recall is better for names, dates, phrases, objects,
  promises, nicknames, and Chinese short cues.
- vector recall is better for paraphrased feelings, similar scenes, and fuzzy
  emotional continuities.
- the final answer should come from reranked, scoped candidates, not raw vector
  nearest neighbors.

Low-context messages such as greetings, laughter, and simple affection should
not trigger expensive deep recall unless the surface mode or hot state requires
it.

## Historical Evidence Delivery

Contact memory, Timebook, and StoryDesk are the visible places where a person
can inspect and correct durable historical interpretations. They are not the
only memory consumers. The same resolved relationship workspace must feed the
existing delivery pipeline with:

- full `progressBundleId + personaMaskId + charId` scope;
- `temporalClass: historical` and source authority;
- continuity and knowledge/privacy policy;
- user overlay/correction state;
- source refs for audit and jump-back;
- a surface-specific character budget.

`ContextBuilder` remains synchronous and DB-free. A future async adapter under
`memoryCore` merges eligible historical candidates into the dynamic selection
stage. It does not copy records into Chat, Diary, Social, or other App stores.

Many-to-many route membership is not a prompt or UI fact by default. Selectors
may use several bindings to rank evidence, but delivery receipts and ordinary
cards do not show `同时属于 N 条线` or membership counts.

The audited whole-phone coverage and fail-closed policies live in
`docs/HISTORY_REUSE_SURFACE_AUDIT.md`. In particular, shared Study/Worldbook and
HOLD TRPG/LifeSim surfaces do not automatically receive one mask's private
historical packet.

## Reuse Of Existing Code

Keep and reuse:

- `ContextBuilder` for stable base.
- current `char.memories`, `refinedMemories`, `anniversaries`, `assets`, and
  `companion_wakeups` stores.
- current worldline delivery receipts.
- MemoryDM evidence-based extraction and immutable receipt seam. Its legacy
  direct target writers are retired; Promotion remains a separate HOLD.
- legacy message history, but later shrink it with a compactor once retrieval
  quality is high enough.

Do not merge:

- timebook keepsakes and proactive-message scheduling
- story seeds and confirmed relationship memory
- language fingerprints and directly-sendable messages
- visible memory receipts and durable memory facts

## Implementation Checkpoints

1. Done in the first code slice: add shared delivery-profile types and a
   classifier adapted for AetherOS surfaces.
2. Done in the first code slice: add character voice-core types and local
   import schema for `藏好的话`.
3. Done in the first code slice: add `WorldlineHotState` asset loading and a
   small recent-message fallback resolver.
4. Done in the first code slice: upgrade `selectWorldlineMemoryContext()` from
   recent-only selection to keyword-aware scoring, dedupe, and surface budgets.
5. Done in the first code slice: wire the same delivery pipeline into chat,
   proactive letters, meeting/date, call, and calendar wakeup rendering.
6. Next: surface write receipts and delivery receipts separately so users can see both
   "it remembered" and "it used this memory".
7. Next: add optional vector indexes only after keyword/scoped delivery is testable.

Current local asset keys:

```text
aetheros_voice_core_${charId}
aetheros_worldline_hot_state_${charId}
```

The voice-core loader also accepts the legacy planning key
`character_voice_core_${charId}`. Hot-state loading also accepts
`worldline_hot_state_${charId}`.
