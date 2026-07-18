# Historical Reuse Surface Audit

Status: code-grounded planning contract; runtime wiring HOLD

Last audited: 2026-07-18

## Decision

Imported history is not a new organ owned by Contact memory, Timebook, or
StoryDesk. It is relationship-scoped evidence that existing AetherOS surfaces
may read through one shared delivery boundary.

The product needs two different maps:

- **visible correction homes** let a person inspect and repair durable
  interpretations;
- **runtime consumers** receive a small surface-appropriate packet without
  duplicating the interpreted history into each App's store.

The same source may support several routes. That many-to-many fact remains in
the binding model, but the ordinary UI must not show `同时属于 N 条线`, route
counts, or a multi-membership badge. A source simply appears where it is
relevant. Advanced edit actions may add or remove one route association without
changing the source or any sibling association.

## Current Code Facts

### Existing history projection is narrow

- `utils/historyImport/analysis/readAdapters.ts` currently projects one active
  snapshot into Contact-memory rows, Timebook rows, and one narrative profile.
- `domain/narrative/directorContext.ts` already consumes the narrative profile
  behind a full `progressBundleId + personaMaskId + charId` read-only boundary.
- No other runtime selector currently reads this projection.

### The common dynamic selector is still character-only

- `utils/memoryCore/selector.ts` selects from `char.memories`, anniversaries,
  first-contact assets, recent live messages, hot state, and voice core.
- Its input currently carries `char + user + mode`; it does not require a full
  relationship scope and does not read historical-analysis results.
- Its current modes cover remote Chat, meeting, date, proactive letter,
  Timebook, and Call only.

This selector is the correct architectural seam, but its scope and surface
contract must be upgraded before imported history is attached.

### Current prompt consumers are split

Already using `selectWorldlineMemoryContext()`:

- Chat through `hooks/useChatAI.ts`;
- proactive letters through `hooks/useCompanionWakeupRuntime.ts` and
  `utils/activeMsgClient.ts`;
- Call through `apps/CallApp.tsx`;
- meeting/date through `apps/DateApp.tsx`;
- per-member Group Chat through `apps/GroupChat.tsx`.

Using `ContextBuilder` or locally assembled recent messages without the shared
dynamic selector:

- Contact relationship impression and memory tools;
- Exchange Diary;
- Moments / News;
- Companion Plan;
- Study;
- Guidebook;
- Check Phone;
- Room;
- TRPG;
- LifeSim;
- Special Moments;
- Novel manuscript generation;
- Songwriting;
- Bank character scenes.

Some of these surfaces should consume historical relationship evidence; some
must explicitly stay shared or isolated. Their current lack of one selector
cannot be treated as an implied permission to inject history.

### Persona-scope coverage is also incomplete

`utils/userPersonaMasks.ts` currently declares mask-scoped policy for Chat,
Group Chat, Call, Date, Social, Novel, Guidebook, Special Moments, and Timebook.
It declares Study and Worldbook shared, and TRPG/LifeSim HOLD. Several other
Apps are not yet represented in `UserProgressSurface`.

`utils/personaRouteScope.ts` is actively used by Date, Call, Group Chat, Social,
Special Moments, Character, and Novel workspace selection. This is useful, but
it is not yet whole-phone memory isolation.

## Existing Visible Interaction Surfaces

These surfaces already show some form of interaction history. They do not all
need a copy of the imported transcript:

| Surface | What it visibly owns | Imported-history role |
| --- | --- | --- |
| Dialogue Calendar | immutable per-day source, search, source jump, clipping | canonical raw evidence browser |
| Chat | bounded imported-history container plus live messages | reconnect view; not a full archive mirror |
| Contact `记忆` | editable relationship-memory shelf and monthly refinement | durable interpreted relationship memories |
| Contact `关系印象` | character-private reading of the user/relationship | explicit later re-interpretation from resolved evidence; never silent overwrite |
| Timebook | dates, first-contact anchor, keepsake notes | durable timeline/keepsake interpretation |
| StoryDesk | historical routes, NPCs, relationship stages, unresolved threads | narrative interpretation and source jump; not played truth |
| Conversation clipping library | selected original lines for later voice work | source-only language-fingerprint material |
| Settings `记忆回声` | delivery receipts | proves which surface received a packet; not a memory shelf |
| Call / Date / Group Chat / Diary / TRPG / Special Moments | each surface's own live interaction archive | future consumers or new-evidence producers, not mirrors of imported raw history |

This separation keeps the phone legible. A person sees raw history in Calendar,
relationship interpretation in existing relationship surfaces, and continuity
through behavior in the Apps where they interact.

## Required Shared Read Boundary

Before Calendar model execution is enabled, introduce one full-scope read
contract under `memoryCore` (name provisional):

```ts
interface HistoricalRelationshipDeliveryInput {
  scope: {
    progressBundleId: string;
    personaMaskId: string;
    charId: string;
  };
  surface: HistoricalConsumerSurface;
  query?: string;
  budgetChars: number;
}

interface HistoricalRelationshipDelivery {
  temporalClass: 'historical';
  relationshipMemories: HistoricalMemoryCandidate[];
  timebookAnchors: HistoricalTimebookCandidate[];
  narrative?: HistoricalNarrativeProjection;
  sourceRefs: HistorySourceSpan[];
  warnings: string[];
}
```

The resolved workspace remains the one interpretation owner. Surface adapters
filter and format it; they do not create app-specific copies. `ContextBuilder`
stays synchronous and DB-free. Prompt assembly appends the selected historical
packet after the stable base, exactly as it already appends dynamic worldline
memory.

Every returned item keeps historical temporal class, authority, continuity,
knowledge/privacy policy, correction state, and source refs. No adapter may
derive current injury, mood, location, availability, promise, reminder,
Character Life state, or open live task from historical evidence alone.

## Surface Policy

### Relationship-continuity consumers — required

| Surface | Historical packet | Boundary |
| --- | --- | --- |
| Chat | sparse relationship memories, confirmed milestones, relevant route echo | no bulk transcript; no historical current-state inference |
| Call | same relationship continuity with smaller voice-call budget | do not replay old call/action staging as current |
| Proactive letters | stable care style, preferences, confirmed long-lived facts | old `明天` / injury / unfinished talk is never a current trigger |
| Group Chat | each member's own scoped, knowledge-safe relationship packet | no private-memory or mask leakage between members |
| Date / Meeting | scene-relevant milestones and narrative background | historical scene position/action never auto-resumes |
| Special Moments | confirmed dates and keepsake-grade milestones | soft route material cannot become a celebration fact automatically |

### Reflective and creative consumers — required, non-resident

| Surface | Historical packet | Boundary |
| --- | --- | --- |
| Contact impression | resolved relationship evidence on explicit generate/update | user-confirmed edit path; never silent whole-profile replacement |
| Exchange Diary | selected day/residue or explicit old-memory query | do not inject the entire archive into today's diary |
| StoryDesk / Narrative Director | narrative profile and route-relevant bindings | many-to-many evidence is invisible by default; route use is not activation |
| Guidebook | relationship understanding and stable user preferences | no invented game score or world fact |
| Moments | public-safe shared facts and social tone only | private relationship evidence stays private |
| Check Phone | supporting background only | generated phone evidence cannot retroactively become history truth |
| Songwriting | explicit inspiration request only | no resident relationship-history packet for ordinary editing |

### Practical/shared consumers — filtered or HOLD

| Surface | Policy | Reason |
| --- | --- | --- |
| Companion Plan | stable user preference/care pattern only after scope is added | historical promises and tasks are not current commitments |
| Study | no automatic relationship-history packet while policy is `shared` | a shared study tool must not inherit one mask's private relationship |
| Worldbook | no automatic write or read | worldbook is authored/shared setting, not derived relationship truth |
| Room | HOLD until its owner and mask scope are explicit | current notes/todos/letters are not yet route-scoped |
| TRPG | HOLD for narrative facts; relationship tone may use stable base only | current sandbox archive writes generic character memory |
| LifeSim | no history delivery while policy is HOLD | independent city simulation must not become relationship truth |
| Bank scenes | low-priority explicit adapter later | finance play does not justify resident historical context |

Gallery, Launcher widgets, Appearance, Theme, Voice Designer, User profile,
Browser, FAQ, and Settings controls do not need a historical prompt packet.
Their existing visual metadata or management responsibilities remain separate.

## Delivery Receipts

`记忆回声` is the human-verifiable proof that reuse works across the phone. A
future receipt should include:

- full relationship scope identity (human UI may show mask and character names,
  not raw ids);
- consumer surface;
- candidate titles/source kind and historical authority;
- whether an item came from imported history, live memory, Timebook, or another
  source;
- no raw private text preview by default.

The receipt must not show route-membership counts. It verifies delivery, not
data-model topology.

## Implementation Gate

The multi-pass workspace/binding/overlay foundation has now replaced the
single-snapshot runtime cleanly. Calendar model execution remains HOLD until:

1. the shared historical selector requires full relationship scope and fails
   closed when scope is missing or mismatched;
2. every AI-facing App is classified as `required`, `filtered`, `shared`,
   `hold`, or `no-history`;
3. required consumers use the shared pipeline rather than direct store reads;
4. tests prove no history delivery to shared/HOLD surfaces and no cross-mask or
   cross-character leakage;
5. delivery receipts identify the actual consumer surface and imported-history
   source without exposing route counts.
