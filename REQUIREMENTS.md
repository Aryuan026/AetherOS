# SullyOS Requirements

## Timebook And Study Naming

- The app formerly visible as `时光契约` should be named `时光簿`.
- `时光簿` should read as a keepsake / relationship memory surface, not as an
  active task or reminder setup panel.
- The visible `时光簿` page should focus on anniversaries and shared experiences.
- The visible `时光簿` layout should read as a keepsake paper page on a desk:
  full-screen background image, translucent/milk-white paper card, companion-day
  count at the top, and a scrollable list of small memory entries.
- The visible `时光簿` should follow the global active character selected by
  `见面` / other character-picking surfaces, instead of mixing every character's
  entries into one page.
- If the selected character has no saved memory entries yet, the page should show
  a virtual first-meeting entry for that character. This default row is display
  data only and should not be written into IndexedDB until the user explicitly
  saves a real entry.
- The first-meeting row should remain visible as the top relationship anchor for
  the selected character, even when other imported memories exist.
- Users should be able to manually edit the first-meeting title, date, and note.
  Once edited by the user, that first day should not be overwritten by later
  imports or background AI generation.
- AI may help rewrite the first-meeting note from imported memories only through
  an explicit user action, not automatically.
- The `时光簿` page should not show an avatar, a visible "timeline" heading, or
  old cyber/theme-switch UI.
- Each memory row should show date / distance plus one short title, and tapping
  it should expand a small character-written retrospective paragraph.
- Task panels, task completion actions, and completed-task history should not be
  shown inside `时光簿`.
- Existing `Task` data should not be deleted during this split; it should be
  owned by the standalone `同行计划` surface.
- `同行计划` should live on the first launcher page in the companion layer.
- `同行计划` should support stage goals, target notes, optional deadlines,
  check-in cadence, current progress records, and completion notes.
- `同行计划` completion notes may later be exported into `时光簿`, but they should
  stay inside `同行计划` until that export path is explicit.
- Anniversary AI text should be generated when a memory is opened and the text
  is missing, then kept stable unless the user explicitly changes it later.
- The app formerly visible as `自习室` should be named `书房`.
- `书房` should keep the current PDF import, course generation, lecture, and
  quiz flows for now.
- Future co-reading/book-club behavior can grow from `书房`, but should not
  disrupt the current study-tool flow before it is deliberately designed.

## Timebook Context Delivery

- `时光簿` entries should become future retrievable relationship context.
- Timebook context should be selected sparsely, with a small budget, not injected
  wholesale into every chat turn.
- `ContextBuilder.buildCoreContext()` should stay a synchronous role/user context
  builder and should not directly query IndexedDB for timebook rows.
- A future async retrieval adapter should select relevant timebook entries before
  chat prompt assembly appends them.
- Proactive-message settings and timebook context rules should remain separate.

## Worldline Memory

- Chat, meeting scenes, generated dates, canon-story material, proactive letters,
  and timebook entries should share one memory architecture instead of each page
  owning a separate hidden prompt path.
- Memory rows and candidates should describe their `origin`, `continuity`,
  `knowledge`, and `status` so original canon, relationship truth, generated
  branches, and scene-only facts do not overwrite each other.
- `ContextBuilder.buildCoreContext()` should remain DB-free and should not
  become the place where every future memory source is queried.
- Prompt assembly should be able to append a small worldline-memory block after
  base role context is built.
- The worldline selector should include a tiny, budgeted slice of recent
  `char.memories` so newly written `角色记忆` can flow back into chat, meeting,
  and proactive-letter prompts without requiring the user to manually activate a
  month.
- The first implementation should be read-only, use existing stores, and avoid
  IndexedDB migrations until the prompt behavior has been reviewed.
- Chat should receive worldline context as remote companionship.
- `见面` / date mode should receive worldline context as face-to-face scene
  continuity.
- Active/proactive letters should receive the same relationship context while
  still obeying remote-message constraints.
- Future UI surfaces must not be built as empty shells; they should call the
  same memory selector or an adapter under it.
- The user must have a low-friction way to confirm that memory context is
  flowing. System settings should expose recent delivery receipts showing which
  surface delivered relationship context to which character.
- The visible receipt surface should stay separate from immersive memory
  expressions. Diary, `时光簿`, album, and future social posts remain the places
  where memories feel like part of the relationship.
- Automatic memory must be optional by layer, not a single opaque master switch.
- Local transcript-spliced daily chat sediment is disabled. `char.memories`
  should be written by model archive, diary archive, study/game/group flows,
  imports, or later reviewed refinement, not by replaying ordinary chat snippets.
- Important-node / timebook candidates should be collected silently. The product
  must not show immersive-breaking prompts such as "要不要记一下" or "这是纪念日吗".
- The Settings label for automatic timebook writing should be `时光簿`, because
  this switch controls whether relationship nodes are written into that surface.
- Silent `时光簿` candidates should stay node-like: first times, appointments,
  gifts, meals, illness, meeting, missing-you, reminders, or comparable
  relationship markers.
- Small affectionate everyday observations belong to `char.memories` / `角色记忆`,
  not directly to `时光簿`.
- `角色记忆` auto-write should be driven by MemoryDM after a quiet configurable
  number of user turns, using the same foreground API settings as chat. The UI
  should expose 20-100 turns in sparse steps and default to 60 turns. Existing
  manual/model archive flows can keep writing `char.memories`.
- MemoryDM may also run an idle closing pass after the configured quiet window;
  background timers must not run it before the quiet window is actually due.
- MemoryDM must check for near-duplicates before writing `char.memories` or
  `时光簿` nodes.
- MemoryDM may produce `story_seed` candidates for a future `剧情生成仓`, but 朋友圈 / 资讯站
  UI remains a separate surface. Feed posts should only enter the story bank
  after a user approval/save action.
- MemoryDM `calendar_reminder` candidates may silently become `companion_wakeups`
  rules with source `ai_calendar`, priority `calendar`, an optional one-time
  `targetDate`, and a windowed trigger. They must not interrupt immersion by
  asking the player whether to save a reminder.
- `时光簿` must allow editing saved memory rows, including title, date, and page
  note, so automatic candidates have a human correction path.
- `char.impression` should not be blindly overwritten by the background loop.
  It should be presented as `关系印象`. Because it is injected into every prompt,
  automatic impression changes should
  be implemented later as reviewable candidates or a clearly separate apply
  action.
- Any prompt that extracts or rewrites `关系印象` must keep the character's
  role-internal private-note perspective, not a third-party diagnostic voice.
- Settings should distinguish actual sediment from prompt-delivery receipts:
  `最近沉淀` is about rows written into local memory surfaces, while `记忆回声`
  is about context selected for a model call.
- Every memory-system tuning pass should leave a short reason/effect record so
  a later maintainer can see why the selector, sediment rule, or UI affordance
  changed.

## Chat Appearance Presets

- The default chat appearance preset is `深空`.
- `深空` uses the existing concentrated chat layout instead of exposing free bubble height or shape controls.
- Chat avatars are circular in `深空`.
- Character bubbles are white by default.
- User bubbles are light yellow inside with a slightly deeper yellow edge.
- Each chat bubble has a sharp upper corner on the side facing its avatar.
- Chat bubbles must not render a side-pointing tail or arrow.
- The mobile chat header should be centered, with no header avatar and name/status sizing close to the screenshot reference.
- The centered mobile chat header should stay compact; the name/status block must not create excessive top or bottom whitespace.
- In deep-space chat, the round in-message avatar diameter should match the default one-line bubble height.
- The appearance editor should expose exactly four visible chat theme cards: `深空`, `极简`, `微信`, and `自定义`.
- Built-in theme cards should not show explanatory helper text under the names.
- `极简` replaces the earlier `月白` direction and should use soft rectangular iMessage-like bubbles, not pill-like bubbles.
- `微信` replaces the removed Telegram / Discord / QQ-style directions and should use low-radius square bubbles, green user bubbles, and plain white character bubbles.
- `自定义` is the only chat theme that exposes granular bubble adjustment.
- `自定义` bubble adjustment should open as a child editor from the `自定义` card, not as a peer tab beside chat themes.
- Bubble adjustment should stay focused on core bubble styling: name, user/character side, text color, bubble color, transparency, padding, corner radius, optional texture, and readability.
- Avatar frame/accessory controls should live in a separate area from bubble adjustment.
- Background image changing/restoring can stay available because it is separate from bubble geometry.
- The `实时预览` section title should match the small-title scale used by `默认背景图`, without an explanatory helper line below it.

## Public Sticker Packs

- A public sticker pack can be shipped with the static web app.
- A public pack can be empty without rendering broken images.
- Public packs default to disabled unless the catalog says otherwise.
- A user can enable or disable a public pack for the current character.
- Disabled packs must not appear in the emoji picker for that character.
- Disabled packs must not be included in private chat AI prompt context.
- Disabled packs must not be included in group chat prompt context except for members that can use them.
- If a group-chat AI tries to send a hidden sticker anyway, execution must re-check target-character visibility before saving the emoji message.
- Public sticker rows should be treated as server-catalog managed, not locally deletable from the picker.
- Public pack IDs must stay stable after release because browser-local role enablement references the pack/category.
- Sticker display names must be short, globally unique, and suitable for AI invocation.
- Character-specific suitability should be represented as metadata/tags or separate packs, not by changing local role-enable storage.

## Image Intake

- Raw downloaded images may be large or irregular.
- Raw images should be processed before deployment.
- Processed assets should use URL-safe ASCII file names.
- Processed assets should normally be web-ready `webp`, `png`, or animated `gif`.
- The catalog should keep semantic metadata separate from technical file names.

## Storage Boundary

- Static sticker files are shared by everyone who can access the deployed app.
- Character-pack enablement is browser-local and not shared across users/devices.
- Chat records, API settings, and imported local stickers stay browser-local.
