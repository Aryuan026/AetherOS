# Timebook Context Delivery Plan

This note keeps the `时光簿` refactor separate from the monolithic chat/context
path. It is a planning document, not a finished retrieval engine.

## Current Code Facts

- `apps/ScheduleApp.tsx` originally owned both task/quest UI and anniversary UI.
- `Task` and `Anniversary` are persisted separately in IndexedDB through
  `utils/db.ts`.
- `Anniversary` currently stores:
  - `title`
  - `date`
  - `charId`
  - optional AI-written `aiThought`
  - `lastThoughtGeneratedAt`
- `ContextBuilder.buildCoreContext()` is synchronous and only builds from the
  passed `CharacterProfile` and `UserProfile`. It does not query IndexedDB.
- Legacy `scheduled_messages` and the newer `companion_wakeups` runtime are
  proactive-message systems. They should not be merged into `时光簿`.

## Product Boundary

`时光簿` should present shared relationship experiences:

- anniversaries
- important dates
- future shared-experience entries
- selected completed-plan milestones only after the plan system marks them as
  relationship-relevant

`同行计划` is the separate companion-planning feature:

- stage goals
- daily or weekly check-ins
- progress review
- procrastination / adjustment notes
- optional milestone export into `时光簿`

The two can exchange summaries, but they should not share one UI principle.
`时光簿` is a keepsake surface; `同行计划` is an active support surface.

## First Refactor Slice

- Keep `ScheduleApp` as the visible `时光簿` app for now.
- Remove task UI and task-generation logic from `ScheduleApp` so the visible
  timebook page owns only anniversaries/shared experiences.
- Keep the existing `Task` DB store and let `同行计划` own it so old user data is
  not orphaned.
- Extract reusable timebook helpers to `utils/timebook.ts`:
  - date distance calculation
  - anniversary sorting
  - upcoming anniversary selection
  - anniversary thought prompt construction
- Generate `aiThought` on demand when a memory row is opened and the field is
  empty. This keeps token use quiet and makes the entry feel like a written note
  instead of a constantly rewritten reminder.
- Present the visible timebook as a desk/paper keepsake page: background image,
  translucent paper card, companion-day count, and scrollable small-memory rows.
- Keep the selected character's first-meeting day as a separate relationship
  anchor in the `assets` store. Imports may inform the inferred date, but a
  manually saved first-contact anchor wins over imported anniversaries.

## Future Data Shape

Future `timebook_entries` can sit beside `anniversaries` instead of replacing
them immediately.

Suggested shape:

```ts
interface TimebookEntry {
  id: string;
  charId: string;
  title: string;
  happenedAt: string;
  sourceKind: 'anniversary' | 'shared_experience' | 'plan_milestone' | 'chat_capture';
  displayText: string;
  aiGenerated: boolean;
  sourceRefs?: Array<{ kind: string; id: string }>;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  lockedText?: boolean;
}
```

`lockedText` should default to `true` for AI-written keepsake text. Later edits
should be explicit, not automatic background churn.

## Retrieval Contract

Do not make `ContextBuilder.buildCoreContext()` query IndexedDB directly.

Instead, add a small async adapter later:

```ts
selectTimebookContext({
  charId,
  now,
  query,
  budgetChars,
})
```

The adapter should return a short markdown block, for example:

```md
### 关系时光簿摘记
- [2026-07-04 / 纪念日] 第一次见面：……
```

Then chat prompt assembly can append that block only when useful.

## Delivery Rules

Timebook context should be sparse and meaningful:

- Include at most 1-3 entries per reply.
- Prefer explicit user queries about old moments, anniversaries, dates, promises,
  relationship history, or "你还记得吗".
- Include near upcoming anniversaries when the date is close.
- Include plan milestones only after `同行计划` produces a completed milestone
  summary suitable for relationship memory.
- Do not inject the whole timebook every turn.
- Do not let proactive-message settings decide what counts as relationship
  memory.

## Suggested Next Implementation Blocks

1. Refine `同行计划` UI and decide which completed milestones can be exported into
   `时光簿`.
2. Add `timebook_entries` as a new optional store while keeping existing
   `anniversaries` compatible.
3. Add a read-only `selectTimebookContext()` adapter with a tiny budget.
4. Wire chat prompt assembly to call the adapter only for matching trigger
   conditions.
5. Add export/import coverage for `timebook_entries`.
