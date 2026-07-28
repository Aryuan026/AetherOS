# AetherOS Work Plan

## Current Goal

Make AetherOS usable as a small public static web app while keeping personal data browser-local.

## Active Block

Companion material and historical voice reuse:

- Keep the default path fully local and non-vector: deterministic scene
  signals, CJK n-gram/token overlap, delivery-receipt rotation, diversity and
  a 1–3 item Chat budget.
- Let only a reviewed general speech-rhythm voice become a low-signal
  fallback. Care, boundary, repair, affection, stable-detail, opening,
  proactive and scene material must earn relevance from the current turn.
- Publish historical analysis into an exact relationship-scoped material
  library without copying transcript text. Selection and prompt delivery keep
  separate receipts; both have `truthEffect: none`.
- Keep normal Chat limited to stable voice/base/relevant detail. Director and
  ScenePlan remain the only future owners that may turn a motive candidate into
  a current motive.
- Preserve an optional embedding rank seam identified by model and index
  revision. A new model rebuilds the disposable index; vectors never replace
  scope, surface, continuity, knowledge, cooldown or budget gates.
- Open Calendar model analysis as an opt-in small-circle beta: selected excerpts
  temporarily go to the player's current API, the same model performs a bounded
  second-pass review, and receipts truthfully record the lower
  `same_model_second_pass` authority. Keep browser/APK vector-index settings
  HOLD until this non-vector real-chat calibration is observed in player use.

Desktop application visibility and ordering:

- Keep launcher order, hidden ids, and Dock order in the versioned `OSTheme`
  appearance contract instead of a launcher-only localStorage key.
- Let Appearance hide/restore apps and reorder both launcher pages and Dock with
  explicit mobile-safe move controls; provide one full default reset.
- Project visible apps in user order and repaginate in groups of eight. Use
  `LAUNCHER_APP_GROUPS` only to seed defaults, never to overwrite saved order.
- Keep Settings visible and present in Dock after every normalization, with a
  second recovery action inside Settings so Appearance may be hidden safely.
- Ignore unknown imported AppIDs, append newly installed apps visibly, and let
  old appearance JSON without layout data preserve the recipient's current
  desktop.
- Keep Worldbook grouping, history import, chat, narrative state, and server
  deployment outside this block.

Global software shell and virtual-city time:

- Keep three explicit top appearances in `Appearance`: classic simulated phone,
  pure software, and scoped virtual city. Pure software remains the new-config
  default; classic restores the product's original phone-simulation posture when
  the user chooses it.
- Keep Appearance organized by user intent: `界面外观 / 应用图标 / 美化预设`,
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
- Keep raw Calendar evidence immutable. The v2 analysis foundation stores
  immutable completed passes beside one editable relationship interpretation
  workspace. Re-running the same source span creates another pass and never
  erases an earlier interpretation.
- Treat storyline membership as many-to-many evidence binding. One source span
  may support mainline, IF, meeting/date, or another historical route at the
  same time. `放进另一条线` adds a binding; it never moves or deletes the first.
- Use Contact memory, Timebook, and StoryDesk as visible correction homes, not as
  the only consumers. Add/edit/hide/restore actions create a versioned user
  overlay with `user_confirmed` historical authority, preserve a source jump
  when present, and never rewrite transcript text or model-pass output.
- Deliver the resolved relationship interpretation to every appropriate
  AI-facing surface through one full-scope async selector under `memoryCore`.
  Do not copy history into per-App stores. Classify every App as required,
  filtered, shared, HOLD, or no-history before Calendar model execution ships.
- Keep many-to-many route membership invisible in ordinary UI. Do not show
  `同时属于 N 条线`, membership counts, or multi-route badges. An advanced edit
  action may add/remove one association without affecting the source or sibling
  bindings.
- Automatically coalesce exact duplicate visible candidates, but preserve every
  analysis pass for provenance and rollback. Multiple route memberships are not
  conflicts; only mutually exclusive factual interpretations receive a compact
  entity-level `有两种整理` notice. Never reopen per-message review.
- Historical results remain historical. Editing a route or memory does not
  create a NarrativeRun, scene, receipt, Character Life state, reminder, or
  current condition. `继续这条线` stays a separate explicit narrative action.
- Keep model execution, prompts, destination-surface UI/wiring, contradiction
  review, full-phone selector delivery, and vector retrieval HOLD until their
  own boxes are implemented and verified. Correction-overlay storage itself is
  now implemented in the v2 foundation.
- Treat `docs/HISTORY_REUSE_SURFACE_AUDIT.md` as the coverage map for historical
  input. Shared tools and isolated sandboxes must fail closed instead of
  inheriting one mask's relationship history.
- Use clean v2 local namespaces with no legacy review reader or migration.

App surfaces and shared truth:

- Use `docs/APP_SURFACE_AND_MEMORY_INTEROP_CONTRACT.md` as the central routing
  contract before adding, splitting, wiring, or removing a virtual App.
- Keep one canonical App registry and declare behavioral capabilities per port;
  one App may expose device-, persona-, and relationship-scoped ports.
- Shared domains own durable truth. Apps read typed projections, submit scoped
  commands, and render receipts with explicit truth effect; they do not read
  another App's private store.
- Keep the implemented Memory Promotion gate limited to exact-scope durable
  relationship-memory and Timebook rows instead of extending MemoryDM side
  effects. Add Scheduler through its own target-domain gate later. Character
  Life remains the sole current-life owner and Narrative Director remains a
  proposal-only reader.
- Automatic promotion must intersect the model candidate with a deterministic
  interaction-provenance assessment. Model interpretation cannot authorize
  itself from `claimClass`; without a verified scoped experience reference it
  fails closed. A new command that hits an existing target writes a
  no-truth-change duplicate receipt instead of hiding the attempt.
- Migrate legacy scope and store access block by block. Do not remove Apps or
  rewrite stores as part of the documentation seal.
- Treat App removal as a later audit, not the current objective. Existing Apps
  may keep their player verb while changing presentation or becoming a child
  surface.
- Phase 1 is the evidence-to-memory foundation: stabilize imported history and
  new Chat/Date interaction evidence, then audit every already accepted UI flow
  for exact scope, source revision, interpretation, promotion receipt, selector,
  current-state isolation, and backup. Chat can carry actions, NPCs, scene
  changes, and light plot; Date is an embodied medium, not the only plot source.
- Move the remaining accepted Apps onto the same base in focused waves without
  redesigning their confirmed UI: Contacts/Timebook/StoryDesk/Life, then
  Call/Social/Group/Journal/proactive, then supporting Apps.
- Phase 2 is token-balanced delivery. Phase 1 records metadata-only delivery
  budgets, per-layer candidate/selection/drop counts, overlap/compression,
  provider token usage when available, latency, and fallback reasons. Do not
  hard-code a universal prompt budget before those real delivery traces exist.

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
- Keep Chat formatting separate from character voice: relationship-scoped
  `preserve/texting` settings control both the allowed text structure and its
  bubble rendering. `preserve` follows only the player's current structural form
  (plain dialogue / parenthesized action / narration mixture / paragraphing),
  never the player's tone, wording, syntax, rhythm, or verbal habits, and renders
  one model reply as one text bubble. `texting` uses strict remote-IM prose and
  newline-based bubble splitting. Neither mode classifies scene turns, mutates
  user messages, or overrides the character card.
- Keep relationship progression in the character card and reliable context.
  Common Chat prompts must not supply a default romance stage or mandatory
  action pose. Proactive letters always resolve to texting.
- Default fresh and field-less installations to the `minimal` / `简约` chat
  appearance. Never overwrite an explicitly saved appearance when a character
  is created or history is imported, because chat appearance is global today.
- Add an extraction-only memory interpretation layer before any durable target writer:
  - local transcript-spliced daily summaries stay disabled;
  - Chat/Date live rows are read only through exact-scope active `InteractionEvidence`;
  - the deterministic timebook helper and LLM MemoryDM both append versioned candidates plus `truthEffect: none` extraction receipts;
  - the Settings slider spans 20/40/60/80/100 user turns and defaults to 60, but reaching the interval authorizes extraction only;
  - relationship-memory, Timebook, scheduler, narrative, and Character Life targets remain independent proposal destinations and receive zero writes in this box;
  - Memory Promotion validates scope, source revisions, policy, authority,
  claim class, deterministic source provenance, duplicates, and required
  full-scope experience receipts before any durable write;
  - interpretation pass extractor and candidate authority are bound at both
    contract and promotion-service boundaries; `mixed` promoted material stays
    in the historical prompt lane rather than falling through as live state;
  - the app must never ask immersive prompts like "is this an anniversary?" or "should I remember this?";
  - if a silent timebook candidate is wrong, the player edits or deletes the visible row later.
- Keep `char.impression` visible as `关系印象` and keep automatic overwrite on hold. It is injected into every prompt by `ContextBuilder`, so every extraction prompt must be audited for role-internal perspective before any background replacement.
- Keep delivery receipts, extraction candidates, and durable memory facts separate in UI and code: `记忆回声` shows prompt delivery, `最近候选` shows source-linked proposals, and promoted target rows will remain owned by their destination surfaces.

Deep-space chat appearance preset:

- Make `简约` the default chat appearance preset for fresh or field-less local data.
- Keep avatars circular in chat.
- Use the fixed WeChat-like concentrated bubble layout for `深空`.
- Keep character bubbles white.
- Keep user bubbles light yellow with a slightly deeper yellow edge.
- Make the bubble's upper corner facing the avatar sharp; do not add a side tail.
- Keep detailed bubble sizing/height controls out of the visible editor for `深空`.
- Keep four visible chat theme entries: `深空`, `简约`, `微信`, and `自定义`.
- Use the four entries mainly as bubble-shape contracts: upper avatar-facing sharp corner for `深空`, soft rectangular corners for `简约`, low-radius square bubbles for `微信`, and free adjustment only for `自定义`.
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
