# Narrative Experience Boundaries

Last updated: 2026-07-13

This note audits the current “见面 / 攻略本 / 特别时光 / 剧情推演 / 咨询台”
shape and records the boundary needed before the main plot simulator grows.

## Intent

AetherOS should feel like the character is living with the user across several
media, not like every surface is writing into the same notebook.

The safe shape is:

```text
咨询台 / 资讯灵感
  → user 采纳
  → 悬挂待激活剧情指令
  → 剧情推演 / 见面 / 约会中游玩
  → user 存档确认
  → 主记忆 / 时光簿 / 关系回声
```

IF lines are different:

```text
IF 线
  → 不进入主仓
  → 可作为角色梦境、错觉、创作余波或潜意识材料递送
```

## Current module audit

### 见面 (`DateApp`)

Current state:

- Uses `selectWorldlineMemoryContext()` with `meet_scene` for entry/peek.
- Uses `date_scene` for in-session replies.
- Adds an explicit daily/light-plot prompt boundary so the model does not
  escalate ordinary meetings into mainline crisis.
- Keeps the daily/light-plot prompt boundary in `utils/dateExperience.ts`; the
  selection-page intro and character cards live under `components/date/`.
- Saves date messages with `metadata.source = "date"`.
- Keeps resumable `savedDateState` on the character profile.

Assessment:

- Usable as the embodied “go play this scene” surface.
- It already reads relationship/worldline memory well enough for the first
  plot pipeline.
- The product label “见面” should stay low-pressure: daily companionship,
  short visits, light roleplay, and relationship warmth.
- It should not automatically promote every date message to mainline canon.

Recommended boundary:

- Lane: `date_experience`
- Memory policy: `relationship_echo`
- Heavy plot, long timelines, and mainline pressure should move to the future
  “世界旅行 / 剧情推演” surface instead of living inside 见面.
- After play, emit a user-reviewable experience summary. Only confirmed
  summaries should become mainline or timebook entries.

### 攻略本 (`GuidebookApp`)

Current state:

- Runs a reverse galgame where the character tries to understand/攻略 the user.
- Saves `GuidebookSession`.
- Persists `charNewInsight` into `character.guidebookInsights`.
- Can send a score-card message to chat.

Assessment:

- Best treated as character-private understanding of the user.
- It can improve char experience and tone, but should not rewrite world facts.

Recommended boundary:

- Lane: `user_insight`
- Memory policy: `character_private`
- Keep it as relationship/user-understanding material, not a main plot source
  unless the user explicitly converts a session into a plot hook.

### 特别时光 (`SpecialMomentsApp`, Valentine, White Day)

Current state:

- Stores per-character `specialMomentRecords`.
- Valentine writes date-source messages with event metadata.
- White Day stores event/result cards and may send a score card to chat.
- The SpecialMoments lobby now explains the calendar/timebook/keepsake role
  and uses the active persona mask linked-character scope for event selection.
- Shared keepsake prompt boundaries live in `utils/specialMoments.ts`; the lobby
  intro, event cards, and delete dialog live under
  `components/special-moments/`.

Assessment:

- Best treated as sealed keepsake events.
- Should eventually be character-initiated from calendar, timebook, birthday,
  anniversary, first-meeting, saved places, and user story preferences.
- The code is usable for seasonal capsules, but the individual event flows are
  still separate and should eventually share a common event contract.

Recommended boundary:

- Lane: `keepsake_event`
- Memory policy: `local_keepsake`
- Default output is a keepsake capsule. It may become a timebook row, plot hook,
  or future date seed only after explicit user confirmation.
- User can promote an event into 时光簿 or a future plot hook. Automatic mainline
  promotion should stay off.

### 剧情推演 / 小说生成 (`NovelApp`)

Current state:

- `NovelBook` is a co-writing project with world setting, collaborators,
  protagonists, and segments.
- Prompting uses role context and writer persona.
- It does not yet have a user-facing pending directive queue.

Assessment:

- Good base for prose generation and long-form plot material.
- Not yet a full play/archive loop because it cannot distinguish “draft text”,
  “pending experience”, “played scene”, and “confirmed canon” in UI.

Recommended boundary:

- Lane: `mainline` when writing confirmed plot.
- Lane: `pending_mainline` for user-accepted but not yet played hooks.
- Lane: `if_line` for alternate branches that can only become dream material.
- `NovelBook.directives` is now available as the first optional storage slot for
  pending/IF directives. Existing books remain compatible because the field is
  optional.

### 咨询台

Current state:

- No dedicated app exists yet.
- `CheckPhone` is not the same concept: it generates character-phone evidence
  and writes some generated records into system messages.

Assessment:

- Do not reuse `CheckPhone` as the consultation desk.
- A future “剧情咨询台 / Story Desk” should be a distinct module or a child
  surface of `NovelApp`.

Recommended boundary:

- Lane: `pending_mainline`
- Memory policy: `manual_promotion`
- Output should be `NarrativeDirective`, not chat messages or phone evidence.

### TRPG (`GameApp`)

Current state:

- Has useful adventure/session structure, logs, options, and summaries.
- On archive, it currently writes a memory fragment to participating characters.

Assessment:

- Useful reference for action choices and post-session summaries.
- Not safe for IF lines without a memory-policy gate, because current archive
  behavior writes directly to `char.memories`.

Recommended boundary:

- Keep as `sandbox` / HOLD for main plot.
- If reused for IF, archive must tag the result as `dream_material` or keep it
  out of main memory.

### 都市人生 (`LifeSimApp`)

Current state:

- Independent city/NPC simulation with a “主线编剧室” concept and drama feed.

Assessment:

- Interesting reference for NPC/event feeds.
- Too independent to become the fixed-background main plot surface directly.

Recommended boundary:

- Keep as `sandbox`.
- Borrow ideas only after the main plot/IF/date boundaries are stable.

## Char-experience rule

From the character’s perspective:

- Mainline is lived continuity.
- Pending directives are not memories yet; they are stage directions waiting to
  become an experience.
- IF lines are dreams, uneasy possible futures, wrong-route echoes, or creative
  branch residue.
- Guidebook is private learning about the user.
- Special moments are keepsakes.
- Check-phone evidence is “something seen on the character’s phone,” not a
  writer’s planning room.

## Code contract added

- `types.ts`
  - `NarrativeSurfaceId`
  - `NarrativeLane`
  - `NarrativeMemoryPolicy`
  - `NarrativeDirective`
  - optional `NovelBook.directives`
- `utils/narrativeBoundaries.ts`
  - surface boundary map
  - lane → memory policy mapping
  - pending mainline directive builder
  - IF dream directive builder
  - Novel prompt formatter for directives
- `utils/novelUtils.ts`
  - Novel prompt now includes relevant pending directives when present.

## Next implementation slice

Do not add a big simulator yet. The next small slice should be:

1. Add a `StoryDesk` / `剧情咨询台` surface.
2. Let it turn user-approved ideas into `NarrativeDirective` rows.
3. Show pending directives inside `NovelApp`.
4. Add an “activate / played / archive” loop.
5. Only after that, connect date/meeting completion summaries to mainline or
   dream-material delivery.
