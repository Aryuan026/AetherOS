# AetherOS Work Plan

## Current Goal

Make AetherOS usable as a small public static web app while keeping personal data browser-local.

## Active Block

Live Worldbook foundation and first runtime bridge:

- Keep CreativeScheme as the versioned owner of writing method, never character,
  relationship, Worldbook, current-story or system-policy truth. Ship read-only
  `梦世界`, per-module copy, player/imported revisions, one default plus per-character
  selection, whole-group archive/restore/delete, whole-device backup and exact delivery
  refs. One scheme is one group and its modules are the entries; do not add an empty
  grouping layer above schemes. Keep the player library aligned with Worldbook's
  vertical drawers, quiet import control, persistent pinning and drag order so a large
  imported library does not collapse into a two-column card grid.
- Use Pen Pal `plain_novel` as the first CreativeScheme consumer. Compile the scheme
  before dynamic Worldbook/story/recent prose, use scheme model hints instead of
  character traits for pure-novel sampling, and record the exact scheme revision only
  after usable prose is durably saved. Keep Chat, Date, mainline, IF and Little Attic
  CreativeScheme delivery as explicit later boxes.

- Keep the existing Worldbook App as the human-maintained long-term world
  knowledge view. Sources may be built-in, player-authored, reviewed imports,
  or future confirmed narrative promotions; generated prose never writes final
  world truth by itself.
- Preserve legacy title/content/category data while adding immutable active
  revisions, archive lifecycle, non-exclusive exact bindings, explicit
  knowledge subjects, growth candidates, and whole-device backup.
- Treat custom Worldbook group IDs as the only player-controlled per-character
  enablement truth. One character may enable only its own whole groups; cross-role
  reuse creates an independent copy. Shared material lives in multiple named groups
  under the universal library drawer, and each group is explicitly enabled for one
  or more characters. Built-in entries retain their separate code-owned mount
  contract. Binding and knowledge policy may narrow an eligible entry, never
  enable one.
- Make Worldbook revision plus every mounted portability cache atomic, and make
  accepted candidate plus its new revision atomic.
- Deliver only a scoped, knowledge-safe, relevance/budgeted typed projection;
  ordinary greetings may select NONE. Chat and Call are the first two runtime
  consumers: both use their request-start relationship scope and write a
  metadata-only receipt only after a usable provider reply.
- Keep the existing Worldbook App as the player control surface: imports commit
  atomically after local parsing and owner choice, story-growth candidates stay non-authoritative until
  review, built-ins are read-only and traceable through player supplements, and
  archive/restore preserves the revision chain while explaining retained mounts.
- Project confirmed Narrative Director state into a read-only backend status,
  and let a confirmed played scene create only a reviewable new-entry growth
  candidate. Do not auto-copy receipt facts, accept, mount, or expose backend
  NPC knowledge to Chat or the player.
- Pen Pal manuscripts now provide two explicit paths: `plain_novel` renders only
  continuous prose and uses a typed `world_director` Worldbook projection;
  `character_collaboration` keeps the existing role-authored co-writing surface
  and uses a character-safe projection. In both paths the request-start scope is
  frozen and a Worldbook delivery receipt is written only after usable prose is
  durably persisted.
- Keep Date, Social, News, proactive messages, broader World Director/DM
  execution, broader CreativeScheme compilation, worldbook generator, player-safe story-status
  projection, and vector ranking as later blocks.
- Keep one named legacy compatibility wrapper for unmigrated Apps, but expose
  through it only caches explicitly mirrored as public + global. Scoped,
  entity-private, and director-only entries fail closed until those Apps gain a
  typed consumer.

Companion material and historical voice reuse:

- Keep the default path fully local and non-vector: deterministic scene
  signals, CJK n-gram/token overlap, delivery-receipt rotation, diversity and
  a sparse per-surface budget. Ordinary Chat is capped at one item; legal
  opening/proactive/scene consumers may use 1–3.
- Treat the 909-source review as complete only when every source has an
  auditable destination. The current five-character runtime library has 56
  non-verbatim records; 21 additional reviewed candidates stay runtime
  forbidden until a future canonical publisher exists.
- Let only a reviewed general speech-rhythm voice become a low-signal
  fallback. Care, boundary, repair, affection, stable-detail, opening,
  proactive and scene material must earn relevance from the current turn.
- Publish historical analysis into an exact relationship-scoped material
  library without copying transcript text. Selection and prompt delivery keep
  separate receipts; both have `truthEffect: none`.
- Keep original-source behavior baselines for built-in characters hidden and
  non-verbatim. Expose only player-authored `行为边界` before memory and
  relationship impressions. Preserve an expert `直接写要求` path verbatim and a
  low-floor `分步填写` path with optional situation; direct resident
  instructions use a separate bounded quota before at most two exact-scope,
  scene-relevant calibrations. Player requirements belong to the character and
  remain independent of provider, channel, API preset, and active model; any
  future model-family adaptation belongs to one global layer rather than this
  character surface. The parallel advisory slot cannot write facts, memories,
  current motives, or tool policy.
- Keep normal Chat limited to stable voice/base/relevant detail. Director and
  ScenePlan remain the only future owners that may turn a motive candidate into
  a current motive.
- Keep candidate compilation fail closed. A review lookup can produce only a
  disabled, non-persistable draft; generic storage rejects promotion-bound rows
  on read and write, and route-bound drafts preserve exact mainline/if-line
  identity.
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
- Keep history import, server deployment, and the later World Director/preset
  runtime outside this Worldbook foundation slice.

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
- Keep the implemented `藏好的话` idle-opener warehouse behind two separate
  proactive-letter ports:
  - reviewed direct lines are local one-shot fallbacks per exact relationship;
    they never become recurring examples in ordinary or proactive model prompts;
  - concrete non-verbatim rewrite seeds may guide only model-written proactive
    letters, rotate through canonical success receipts, and do not spend their
    cooldown when selection, provider access or normalization fails;
  - language fingerprints remain a separate stable calibration layer and are
    never reconstructed from the direct-line warehouse;
  - neither port may assert current facts, relationship truth, current motives,
    tool policy or source prose. The public pack contains no private evidence
    pointer, title, URL or local path.
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

Dual AI runtime and system-director boundary:

- Keep exactly two ordinary model roles at product level:
  - `dialogue` owns visible character voice, relationship memory writing,
    character-authored impressions, proactive contact, and emotionally situated
    companion expression;
  - `system_director` owns structured analysis, source classification, behavior
    requirement compilation, editorial/OOC review, third-person story planning,
    ScenePlan / DM decisions, and other model work that does not speak as the
    companion.
- Reuse saved API presets. `system_director` stores either
  `inherit_dialogue` or one preset ID; it must not copy another URL/key/model
  form into each App. A player who leaves it unset intentionally inherits the
  current dialogue AI.
- Resolve the model by typed task at one cross-App runtime seam. Apps submit
  purpose, exact scope, bounded input, output schema, budget, and persistence
  policy; they do not receive a raw second `APIConfig` and do not implement
  their own fallback rules.
- Inheritance applies only when the player left the system-director route unset.
  If an explicitly selected preset is missing or fails, surface that failure
  instead of silently sending the material to another provider; a visible
  retry with the dialogue AI may be offered.
- Route historical language-fingerprint / stable-detail / opening / scene
  material analysis through `system_director`. This is character-material
  compilation, not relationship-memory formation. Keep MemoryDM, daily/monthly
  relationship summaries, character-authored user impressions, Journal
  memories, Timebook notes, and other relationship-memory prose on `dialogue`.
- Route current emotion-background classification through `system_director`,
  while the next visible reply remains owned by `dialogue`. Replace the
  per-character emotion API form with the global route; the per-character
  setting retains only enablement and character-local state.
- Split mixed model calls by responsibility before migration. A helper or App
  named `Director` is not sufficient evidence: Group Chat currently renders
  character speech, Social mixes news editing with character comments, TRPG
  mixes GM state with companion dialogue and memory, LifeSim mixes world
  planning with character turns, and Novel mixes structural analysis with
  character-authored prose.
- First high-confidence system-director consumers are history companion-material
  analysis, behavior-boundary compilation / reroll-reason analysis, emotion
  background evaluation, Info Station generation and editorial review,
  narrative-history / ScenePlan analysis, and world/DM planning that has been
  separated from character rendering. Generic browser simulation, study
  structure and financial analytics may follow through the same registry.
- MiniMax TTS/voice credentials, image providers, toolbox services, and other
  non-chat media/tool transports are service adapters, not a third model role.
- Keep an optional future owner-only `codex_observer` adapter in the plan for
  the late server test phase. It may consume scoped diagnostic envelopes,
  receipts, errors, timings, schema failures and explicitly submitted excerpts
  through a read-only queued Codex CLI job. It must not be a public player API,
  receive all raw chats by default, become the real-time dialogue model, or
  write memory/current truth directly. AetherOS runtime must not depend on a
  persistent Codex thread or unstable app-server protocol.

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
