# AetherOS Work Plan

## Current Goal

Make AetherOS usable as a small public static web app while keeping personal data browser-local.

## Active Block

Global software shell and virtual-city time:

- Keep three explicit top appearances in `Appearance`: classic simulated phone,
  pure software, and scoped virtual city. Pure software remains the new-config
  default; classic restores the product's original phone-simulation posture when
  the user chooses it.
- Keep Appearance organized by user intent: `界面外观 / 应用图标 / 预设管理`,
  with screen appearance before desktop assets. Use the local type scale
  `16 / 12 / 13 / 11 / 10 / 9` for page title, tabs, section title, controls,
  helpers, and metadata.
- Keep shared appearance JSON on the versioned `aether_appearance_preset` v1
  contract: import into the preset list without auto-applying, preserve current
  chat/shell/desktop fields and custom chat themes, map bounded legacy fields,
  and discard unknown injected theme keys.
- In classic mode, show the familiar real clock, Wi-Fi and battery row and reserve
  its old geometry. In software mode, remove the row and reclaim the space fully.
- Route shared headers, immersive controls, readers, and global overlays through
  one shell coordinate contract.
- Offer an optional compact virtual-city world strip keyed by active
  `progressBundleId + personaMaskId`.
- Keep location, era, IANA/fixed-offset time, year offset, and manual/local
  seasonal weather browser-local and relationship-scoped.
- Expose world context as read-only data with explicit `source` and `scope`.
- HOLD prompt/current-state integration until each consumer proves scope
  consistency and keeps environment separate from plot, tasks, and memories.
- Never redirect message/import/daily-archive/backup timestamps into world time.

Historical conversation clean transport:

- Keep import as a zero-question path: relationship, file, archive, Chat.
- Preserve only explicit export channels (`user`, `assistant` / `char`), raw text,
  source order, source locator, and source timestamp. Export channels are not
  in-world speaker labels.
- Keep unresolved non-empty text as neutral source fragments. Do not dedupe,
  classify companion/plot semantics, interpret virtual time, or ask for per-row
  correction during intake.
- Keep raw history medium-neutral. Chat may read one historical tail under a
  remote-text boundary; Date must not auto-resume physical staging.
- Keep real timestamp days as the only visible Calendar segmentation. Historical
  analysis may offer token-visible `quick_merge` and `deep_daily` plans; the
  latter may split long days internally without creating another review UI.
- Use one atomic, relationship-scoped `HistoryAnalysisSnapshot` to hold soft,
  source-linked relationship memories, timebook nodes, and a
  `HistoricalNarrativeProfile`. It is not current state and must never create a
  NarrativeRun, scene, receipt, Character Life state, or reminder.
- Keep model execution, prompts, visible Contact/Timebook wiring, and vector
  retrieval HOLD until their own boxes are implemented and verified.
- Use clean v2 local namespaces with no legacy review reader or migration.

Timebook and companion structure:

- Rename `时光契约` to `时光簿`.
- Treat `时光簿` as a relationship keepsake surface, not a task board.
- Keep visible `时光簿` content focused on anniversaries / shared experiences.
- Remove active task and completed-task history UI from `时光簿`.
- Add standalone `同行计划` as the owner of stage goals, check-ins, and completion notes.
- Keep existing task storage intact and let `同行计划` read/write it for compatibility.
- Rename `自习室` to `书房` while keeping the current PDF/course/quiz study flow stable.
- Plan timebook context delivery through a small retrieval adapter, not by adding more logic directly to `ContextBuilder`.

Worldline memory architecture:

- Treat chat, meeting scenes, generated dates, timebook entries, proactive letters, and future canon-story surfaces as different media inside one relationship.
- Keep `ContextBuilder` as the synchronous role/user/worldbook base-context builder.
- Add `utils/memoryCore/` as the first memory bus: it selects sparse worldline intersections from existing data before prompt assembly.
- Use `docs/MEMORY_DELIVERY_CONTRACT.md` as the implementation contract before adding more memory code. Each AI-facing surface should declare which stable base, character voice core, worldline hot state, memory packet, story packet, and token budget it receives.
- Treat the planned `藏好的话` voice warehouse as part of stable character identity:
  - directly-sendable lines may feed proactive-letter direct mode;
  - rewrite seeds may guide model-written proactive messages or scenes;
  - language fingerprints are not sent raw and should calibrate role voice, boundaries, habits, care style, and non-negotiable attitudes.
- Add a short-lived per-character hot-state layer later, so chat/proactive/date/call surfaces can feel connected to the character's ongoing parallel-world life instead of only recalling archived memories.
- First slice is read-only and compatibility-first: reuse existing messages, anniversaries, first-contact assets, and a tiny recent slice of `char.memories` before adding new IndexedDB stores.
- Wire the first selector into chat, meeting/date mode, and proactive-letter generation so UI work later has real code interfaces behind it.
- Add an automatic sediment layer without broad DB migration:
  - local transcript-spliced daily summaries are disabled; `char.memories` should stay on model archive, diary, import, or later reviewed refinement paths;
  - `时光簿` node candidates can be silently clipped into `anniversaries`;
  - `时光簿` auto-write is strict by default and keeps only stronger first-time/appointment/gift/meal/missing-you style nodes;
  - `角色记忆` auto-write is handled by MemoryDM after a quiet configurable turn interval, using the same foreground chat API and a duplicate gate. The Settings slider spans 20/40/60/80/100 user turns and defaults to 60;
  - `calendar_reminder` candidates from MemoryDM can silently become existing `companion_wakeups` rules with calendar priority, so date/window care can use the current wakeup runtime before a fuller calendar store is introduced;
  - MemoryDM may store `story_seed` candidates for a future `剧情生成仓`, but 朋友圈 / 资讯站 UI and final story-bank UX are owned by the separate social-feed pass;
  - the app must never ask immersive prompts like "is this an anniversary?" or "should I remember this?";
  - if a silent timebook candidate is wrong, the player edits or deletes the visible row later.
- Keep `char.impression` visible as `关系印象` and keep automatic overwrite on hold. It is injected into every prompt by `ContextBuilder`, so every extraction prompt must be audited for role-internal perspective before any background replacement.
- Keep delivery receipts and durable memory sediment separate in UI and code: `记忆回声` shows prompt delivery, while `最近沉淀` shows actual auto-written local memory rows.

Deep-space chat appearance preset:

- Make `深空` the default chat appearance preset.
- Keep avatars circular in chat.
- Use the fixed WeChat-like concentrated bubble layout for `深空`.
- Keep character bubbles white.
- Keep user bubbles light yellow with a slightly deeper yellow edge.
- Make the bubble's upper corner facing the avatar sharp; do not add a side tail.
- Keep detailed bubble sizing/height controls out of the visible editor for `深空`.
- Keep four visible chat theme entries: `深空`, `极简`, `微信`, and `自定义`.
- Use the four entries mainly as bubble-shape contracts: upper avatar-facing sharp corner for `深空`, soft rectangular corners for `极简`, low-radius square bubbles for `微信`, and free adjustment only for `自定义`.
- Keep `自定义` bubble controls as a child editor rather than a peer tab beside chat themes.
- Keep avatar frame/accessory controls in a separate visible area, not inside bubble tuning.
- Keep Telegram / Discord / QQ-style directions out of the chat appearance preset system.

## Parallel Block

Public default sticker packs:

- Keep sticker assets on the server as static files.
- Sync a versioned public sticker catalog into each browser.
- Let users enable a public pack per character.
- Keep disabled packs out of the emoji picker and out of AI prompt context.
- Start with an empty `a 组表情包` pack so images can be added later.
- Before adding real images, choose whether `pack-a` stays as the stable first pack ID or is renamed once to a meaningful theme/character pack ID.
- Process raw image batches into URL-safe web assets and catalog metadata before deployment.

## Holds

- No server-side accounts or shared chat history.
- No paid/public multi-tenant service behavior.
- No backend sticker database for this block.
- Advanced memory and non-chat app behavior stay out of scope unless a real runtime bug appears.
