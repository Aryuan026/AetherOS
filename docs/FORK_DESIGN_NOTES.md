# AetherOS Fork Design Notes

This file records the maintained fork's product direction and code-level deltas
from the original SullyOS source. Keep it short enough to become future GitHub
README / release-note material.

## Design Direction

This fork treats AetherOS less as a flat feature collection and more as a
companion-oriented virtual phone.

- Companion layer: daily presence, chat, calls, album, study, diary, calendar,
  social presence, profile, and personal media.
- Story-play layer: meeting mode, phone inspection, character autonomous day,
  guidebook mini-game, life simulation, TRPG, worldbook, and special events.
- Creation / setup layer: chat appearance, system appearance, room experiments,
  writing tools, publishing assets, utility apps, help, and system settings.

Design principle: the first screen should answer "where do I go to be with the
character?" before it exposes toys, utilities, or experimental systems.

## Difference Log

### 2026-07-05: Automatic Memory Sediment

Files:

- `utils/memoryCore/autoMemory.ts`
- `utils/memoryCore/index.ts`
- `context/OSContext.tsx`
- `apps/Settings.tsx`
- `apps/ScheduleApp.tsx`
- `docs/WORLDLINE_MEMORY_ARCHITECTURE.md`
- `PLAN.md`
- `REQUIREMENTS.md`
- `SCHEMA.md`

Original local behavior:

- `char.memories` could be filled by explicit archive buttons, diary archive,
  study/game/group flows, or manual imports.
- `时光簿` could display and delete saved anniversary rows, but saved rows did
  not have a simple correction path for title/date/note.
- `记忆回声` showed prompt-delivery receipts, but there was no separate visible
  signal for actual memory rows being written.
- The discussed automatic daily chat, important-node, and impression update
  paths were not implemented as one closed loop.

Fork behavior:

- Added an automatic sediment controller under `utils/memoryCore/autoMemory.ts`.
- Settings exposes `时光簿`, a manual `拾取一次` action, a compact `角色记忆`
  status row, and a `最近沉淀` ledger.
- Added `memoryDm` as the first LLM-driven memory/DM layer. It uses the same
  foreground chat API, runs only when enabled, and can sort recent conversation
  into `character_memory`, `timebook_node`, `calendar_reminder`,
  `relationship_impression`, `story_seed`, or discard candidates.
- MemoryDM's Settings control is intentionally quiet: a 20/40/60/80/100-turn
  slider with a 60-turn default. Old local 12/16/24-turn values are treated as
  the new default on load.
- The OS shell runs a quiet background pass after load, on a 30-minute interval,
  and when the app returns to the foreground.
- Local transcript-spliced daily chat sediment was deliberately disabled after
  product review: in a companion sim, low-cost replay of recent chat is weaker
  than preserving moments the character would actually keep.
- Silent timebook candidates write ordinary `Anniversary` rows; no immersive
  confirmation prompt is shown.
- `时光簿` rows can now be edited after the fact, including title, date, and page
  note, so silent candidates have a player correction path.
- `char.impression` remains manual/review-first and is deliberately not
  auto-overwritten in this block.

Design principle:

- The companion should feel like it quietly remembers, not like it is asking the
  player to operate a memory form.
- `时光簿` auto-write is for relationship nodes. Low-drama affectionate
  observations belong to `char.memories` / `角色记忆`, not to the timebook writer.
- `char.memories` should not be polluted by mechanical transcript snippets. It
  is now eligible for MemoryDM sorting only after the user enables the quiet
  turn-interval pass; the writer checks near-duplicates before applying.
- The worldline selector now reads a tiny recent slice of `char.memories`, so
  auto-applied `角色记忆` can actually return to chat, meeting, and proactive
  prompts without forcing the whole memory archive into every call.
- Legacy manual archive and feature-specific writers still append directly and
  should be normalized behind the same duplicate gate after prompt review.
- 朋友圈 / 资讯站 UI is intentionally not touched in this block. MemoryDM only
  reserves `story_seed` candidates for the later `剧情生成仓` bridge.
- `关系印象` is identity-shaping prompt material, so any extraction/update prompt
  must be audited for role-internal private-note perspective before automation.

Verification:

- `npm run build` passed after this block.

### 2026-07-05: Visible Memory Receipts

Files:

- `utils/memoryCore/types.ts`
- `utils/memoryCore/receipts.ts`
- `utils/memoryCore/selector.ts`
- `utils/memoryCore/index.ts`
- `apps/Settings.tsx`
- `docs/WORLDLINE_MEMORY_ARCHITECTURE.md`
- `REQUIREMENTS.md`
- `SCHEMA.md`

Original local behavior:

- The worldline selector could feed context into chat, meeting/date mode, and
  active messages, but the user had no visible way to confirm that memory
  context was actually being selected.
- Verification depended on long conversations and subjective model behavior.

Fork behavior:

- Added local memory delivery receipts under `utils/memoryCore/receipts.ts`.
- Each selector call can record which character and surface received context,
  how many memory candidates / open threads were delivered, and a short preview.
- Added a `系统设置 / 自动记忆 / 记忆回声` card that exposes the latest receipt,
  folded recent history, refresh, clear, and a local receipt-record toggle.
- Confirmed the existing `通讯录` detail page already owns visible long-memory
  shelves: `记忆` for daily/imported/monthly-refined memory, and `印象` for the
  character's private user impression and relationship reading.

Design principle:

- Settings can carry the trust-building verification surface, while diary,
  `时光簿`, album, and future social posts stay as immersive memory expressions.
- A delivery receipt is not a durable relationship fact; it proves that the
  prompt had memory context before the later long-term store is introduced.
- Keep Settings copy thin. The receipt should feel like a quiet signal, not a
  feature manual.

### 2026-07-04: Worldline Memory First Slice

Files:

- `docs/WORLDLINE_MEMORY_ARCHITECTURE.md`
- `utils/memoryCore/types.ts`
- `utils/memoryCore/selector.ts`
- `utils/memoryCore/promptFormatter.ts`
- `utils/chatPrompts.ts`
- `hooks/useChatAI.ts`
- `apps/DateApp.tsx`
- `utils/activeMsgClient.ts`
- `README.md`
- `PLAN.md`
- `REQUIREMENTS.md`
- `SCHEMA.md`

Original local behavior:

- `ContextBuilder.buildCoreContext()` was treated as the only long-context
  route, and README still implied that any saved database data would
  automatically enter prompts.
- Chat, date/meeting scenes, proactive messages, and timebook planning were
  conceptually related but had no shared memory interface.
- `时光簿` had a future adapter plan, but the broader otome worldline model was
  not yet represented in code.

Fork behavior:

- Added a worldline-memory architecture document for the otome model: character
  life line, user life line, canon floor, generated branches, and shared
  intersections.
- Added `utils/memoryCore/` with shared origin / continuity / knowledge / status
  types and a read-only selector.
- The first selector reuses existing stores only: recent `messages`,
  `anniversaries`, and `assets/timebook_first_contact_${charId}`.
- `ChatPrompts.buildSystemPrompt()` accepts an optional worldline-memory block.
- Chat, `见面` / date mode, and active-message generation now ask the same
  selector for a tiny prompt block before calling the model.

Design principle:

- AetherOS memory is not just chat summarization. It is a relationship archive
  where remote messages, face-to-face scenes, generated dates, canon material,
  and keepsakes can share one underlying contract without collapsing into one
  untyped prompt pile.

Verification:

- `npm run build` passed after this block.

### 2026-07-04: Launcher Information Architecture

Files:

- `constants.tsx`
- `apps/Launcher.tsx`

Original local sample behavior:

- Desktop apps were ordered mostly by implementation history.
- Dock apps were `Message`, `群聊`, `朋友圈`, and `设置`.
- Launcher pages were produced by slicing every 8 non-dock apps, so unrelated
  features could appear together.
- Utility / experimental entries such as `存钱罐` could appear before the user
  had a clear sense of companion or story flow.

Fork behavior:

- Dock apps are now `Message`, `电话`, `相册`, and `设置`.
- Launcher pages are explicit internal groups instead of raw 8-app chunks, but
  the group names are not rendered on the phone desktop:
  - `日常陪伴`: `通讯录`, `同行计划`, `时光簿`, `朋友圈`, `交换日记`, `书房`, `群聊`, `档案`.
  - `剧情游玩`: `见面`, `查手机`, `攻略本`, `都市人生`, `TRPG`, `世界书`, `特别时光`.
  - `创作整理`: `聊天装扮`, `外观`, `小组件`, `小小窝`, `笔友会`, `写歌`, `存钱罐`, `使用帮助`.
- Any app not assigned to a group falls into a generated `更多` page, so future
  additions do not silently disappear.
- The desktop keeps the visual calm: no visible section labels such as
  `日常陪伴`, `剧情游玩`, or `创作整理`.

Design principle:

- Companion actions should be the default path.
- Album is dock-level because curated images are more stable and emotionally
  important than immature room simulation.
- Room remains available but is treated as a creation / setup experiment until
  its interaction loop matures.
- Story-play tools should sit together because they share the same mental mode:
  "enter a scenario and play".
- Visual customization and export / utility tools should not compete with core
  companion access on the first screen.

Verification:

- `npm run build` passed after this block.

### 2026-07-04: Companion Plan App

Files:

- `types.ts`
- `constants.tsx`
- `components/PhoneShell.tsx`
- `apps/CompanionPlanApp.tsx`
- `README.md`
- `PLAN.md`
- `REQUIREMENTS.md`
- `SCHEMA.md`
- `docs/TIMEBOOK_CONTEXT_PLAN.md`

Original local behavior:

- Stage tasks lived inside `ScheduleApp`, beside anniversaries.
- Task completion could generate a character response and save a system message,
  but the task data had no dedicated companion-planning surface.
- Completed tasks could appear in the old schedule/timeline page, which blurred
  the line between active support and relationship keepsakes.

Fork behavior:

- Added visible `同行计划` on the first launcher page in the companion layer.
- `同行计划` reads/writes the existing `tasks` store so old task data is still
  reachable.
- New plan rows can store a target, description, optional deadline, cadence,
  check-in records, and a completion note.
- Users can mark today's progress, record being stuck, and complete a stage.
- Stage completion can optionally ask the supervising character for one short
  milestone note, saved on the plan rather than automatically exported to
  `时光簿`.

Design principle:

- `同行计划` is the active support surface: planning, checking, adjusting, and
  finishing.
- `时光簿` is the memory surface: only selected relationship-worthy milestones
  should later enter it through an explicit export path.
- The first implementation reuses the existing `Task` store to avoid a risky DB
  migration before the UI and product shape are reviewed.

Verification:

- `npm run build` passed after this block.

### 2026-07-04: Timebook Boundary

Files:

- `constants.tsx`
- `apps/ScheduleApp.tsx`
- `apps/StudyApp.tsx`
- `utils/timebook.ts`
- `docs/TIMEBOOK_CONTEXT_PLAN.md`
- `README.md`

Original local behavior:

- `ScheduleApp` appeared as `时光契约`.
- The page mixed active tasks, completed task history, and anniversaries in one
  surface.
- Its default visual style was the black/cyber theme.
- Anniversary AI text could refresh after a 24-hour cache window.
- `自习室` was named as a study-room task surface even though its code already
  behaves more like a PDF/course/quiz learning space.

Fork behavior:

- The visible app is now `时光簿`.
- The visible timebook page defaults to a softer keepsake style and shows shared
  dates/anniversaries instead of task panels.
- Completed tasks are no longer presented as timebook history.
- Anniversary `aiThought` is generated only when missing, so written keepsake
  text is not repeatedly rewritten in the background.
- Reusable anniversary/date prompt helpers live in `utils/timebook.ts`.
- `自习室` is renamed to `书房` while keeping the existing PDF/course/quiz
  function intact.
- `docs/TIMEBOOK_CONTEXT_PLAN.md` defines the future retrieval path for
  timebook context and keeps it separate from proactive messages and the future
  `同行计划`.

Design principle:

- `时光簿` is a relationship keepsake and future retrievable context source.
- `同行计划` should own stage goals and progress checking.
- `书房` can later grow toward co-reading, but the current study-tool code should
  stay stable until that direction is implemented deliberately.

Verification:

- `npm run build` passed after this block.

### 2026-07-04: Timebook Paper Keepsake UI

Files:

- `apps/ScheduleApp.tsx`
- `utils/timebook.ts`
- `public/assets/aetheros/timebook-desk-bg.png`

Original local behavior:

- The timebook page still carried old schedule-app structure: a sticky header,
  visible theme switching, a hero anniversary card, and timeline language.
- Memory rows looked like generic cards instead of a relationship keepsake.
- Expanding or viewing a row was not the central interaction.

Fork behavior:

- The page is now a full-screen desk scene using the generated wood/paper/flower
  background.
- The central interaction surface is a translucent milk-white paper card aligned
  to the background paper area.
- The paper starts with `相伴 N 天`, then shows a scrollable list of small memory
  entries.
- Rows show date / distance plus one short title; tapping a row expands a small
  character-written retrospective paragraph.
- No avatar, no visible `时光轴`/timeline heading, no theme switcher, and no old
  cyber/schedule chrome remain in the visible page.
- Missing retrospective text is generated on demand when a memory is opened,
  keeping token use calmer than page-load background generation.
- The page follows the global active character id; selecting a character in
  `见面` updates that id, so the timebook shows the same character's memories.
- The first row is a relationship anchor for the selected character's first
  meeting day. It stays separate from `anniversaries` and can be manually edited
  through a small first-contact editor.
- If the user has not set that anchor, the date is inferred from earliest
  imported anniversary, then earliest message, then today.
- A button can ask AI to help fill the first-meeting note from imported memories,
  but AI does not automatically overwrite the user's first day.
- Screenshot measurement showed the page viewport was wider than the generated
  background (`962x1638` screenshot vs `853x1844` source), so the background is
  rendered as a separate ratio-preserving layer instead of stretched with
  `100% 100%`.
- The paper/content layer was shortened to better sit on the background grid
  paper, and the companion-day header now reads on one line (`相伴 N 天`).
- Follow-up red-box measurement used the user's target markup (`820x1312` image,
  red box `x=134,y=280,w=591,h=764`, roughly `left=16.4%`,
  `top=21.3%`, `right=11.7%`, `bottom=20.5%`). The frosted panel now uses those
  proportions so it sits inside the paper's writing area instead of covering the
  whole page.
- Follow-up background matching compared the target red-box image against the
  original desk asset and found the closest transform at approximately
  `scale=0.972`, `x=-7`, `y=-202` in the target image. For the current phone
  viewport this is expressed as `background-size: 101% auto` and
  `background-position: 72% 46%`, replacing the earlier over-zoomed `112% auto`
  attempt.

Design principle:

- `时光簿` should feel like the character chose to keep relationship-worthy
  nodes, not like the user is managing a quest log.
- Small affectionate observations are still valuable, but their home is
  `char.memories` / `角色记忆`, where they can shape tone and later recall without
  turning every day into a visible anniversary row.

Verification:

- `npm run build` passed after this block.

### 2026-07-04: Gallery User Upload

Files:

- `apps/Gallery.tsx`
- `apps/Chat.tsx`
- `types.ts`

Original local behavior:

- Chat image messages were automatically saved into the current character's
  album.
- The gallery app could browse, delete, and ask the character to comment on
  saved images.
- The gallery app itself did not provide a direct local upload entry.

Fork behavior:

- A character album now has `加照片` entry points in the grid header and empty
  state.
- User-selected local image files are stored as `GalleryImage` rows with
  `source: "upload"` and the current character id.
- Chat-saved images are marked with `source: "chat"`.
- Uploaded images stay local-first in IndexedDB, matching existing gallery
  storage behavior.

Design principle:

- Otome-style albums should privilege user-curated images. The user should not
  be forced to accept AI-generated faces or images as relationship canon.
- Image source should be explicit so future export, filtering, and prompt
  behavior can distinguish chat-shared pictures from user-curated album photos.

Verification:

- `npm run build` passed after this block.

## Ongoing Recording Rule

When this fork changes user-facing behavior or product structure, add a short
entry here with:

- Files changed.
- Original behavior.
- Fork behavior.
- Design principle.
- Verification.

Do not record raw chat logs, secrets, local API settings, runtime output, or
dirty workspace dumps here.
