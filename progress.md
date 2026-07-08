# AetherOS Progress

## 2026-07-08 Runtime Test Follow-Up

- done:
  - Confirmed local API and built-in sticker packs can be used in the current
    test flow.
  - Loosened consecutive assistant/char bubble spacing so stacked replies are
    less cramped without changing user-bubble rhythm.
  - Added chat-side visibility for the current character's `主动来信` heartbeat:
    the reply-mode panel now shows the next scheduled wakeup time and includes a
    local `试亮一次` probe that writes a visible companion-wakeup message without
    changing the formal schedule.
  - Tightened automatic timebook candidate detection so casual lines like
    `你喜欢就好` no longer become relationship timeline nodes by keyword alone.
  - Added MemoryDM routing guidance for phone calls: call atmosphere and
    background sounds are call texture, not timebook nodes unless the call is
    itself a relationship milestone.
  - Kept the phone-call scene text model-generated, while adding an anti-repeat
    instruction so opening ambience should vary by time/place/mood instead of
    fossilizing into one fixed water-sound scene.
  - Made `记忆回声` receipt previews shorter and renamed the raw fragment area to
    `递送摘记` for human-facing inspection.
  - Expanded default natural wakeup coverage beyond afternoon/night by adding a
    daytime `09:30-12:00` heartbeat window while preserving old heartbeat IDs.
  - Added built-in care-window syncing: when `生活照看` is on and a character's
    `主动来信` is enabled, lunch/dinner/sleep windows are materialized as real
    companion-wakeup rules; turning care off pauses those built-in care rules
    for active characters.
  - Made `主动来信` act as a real acceptance boundary: enabling it also restores
    auto reply for that character, and disabling it pauses that character's
    heartbeat/window wakeup rules.
  - Added live sync for already-enabled `主动来信` rules so open test windows pick
    up newly added default daytime/care windows without requiring a manual
    off/on cycle.
  - Hardened chat output cleanup against fake image/history logs such as
    `[你 发送了一张图片：...]`; these are now blocked in the prompt and stripped
    before message chunking if the model still leaks them.
  - Made user replies auto-trigger while `主动来信` is active even if the older
    per-character `autoReplyEnabled` flag has not refreshed yet.
  - Added the first Reality Sync implementation:
    `real_anchor`, `rhythm_weather`, and `fiction_free` modes; user-only vs
    shared-echo weather boundaries; and soft/direct/off care boundaries.
  - Added a shared `realitySync` prompt layer that sits after character/memory
    context and before app-format rules, so time/weather are interpreted as
    world rules rather than loose chat facts.
  - Added lightweight weather-suspension state in localStorage. Weather changes
    now become short-lived prompt hooks only when weather type changes or
    temperature shifts noticeably, with cooldown to avoid weather-broadcast
    repetition.
  - Wired Reality Sync into chat, AI-rendered proactive letters, and phone calls.
  - Updated Settings and README with the new Reality Sync controls/feature note.

- pending:
  - Observe a real scheduled `主动来信` after the next heartbeat window and user
    cooldown. Current runtime still skips heartbeat if the user has sent a real
    message within the recent quiet window.
  - Add a clearer distinction between "memory was written" and "memory was
    delivered to this prompt"; delivery receipts are visible, but MemoryDM
    candidate/apply records still need their own friendly inspector.
  - After this testing round, remove/quarantine remaining ActiveMsg2/Rei client,
    Netlify function, package, type, and OSContext listener remnants before the
    next public push.

- verified:
  - `npm exec tsc -- --noEmit` passed.
  - `npm run build` passed. Vite still reports the existing large-bundle warning.
  - `git diff --check` passed.

## 2026-07-07 Memory Delivery Contract

- done:
  - Added `docs/MEMORY_DELIVERY_CONTRACT.md` as the next memory-system
    implementation contract before adding more code.
  - Defined how stable base context, character voice core, worldline hot state,
    relationship memory, story material, calendar care, and retrieval packets
    should be combined per AI-facing surface.
  - Recorded the planned `藏好的话` warehouse as three separate classes:
    directly-sendable proactive lines, rewrite seeds, and non-quoted language
    fingerprints for role voice/personality calibration.
  - Recorded the need for a short-lived per-character worldline hot-state layer
    so chat, proactive letters, calls, and meeting scenes can reflect the
    character's ongoing parallel-world life.
  - Updated `PLAN.md` and `SCHEMA.md` so future implementation can be checked
    against the same delivery contract.
  - Added the first code slice for the contract:
    `deliveryProfile`, `voiceCore`, and `hotState` modules under
    `utils/memoryCore/`.
  - Upgraded `selectWorldlineMemoryContext()` to classify delivery depth,
    score candidates with query terms, dedupe results, apply surface budgets,
    and include voice fingerprints / hot-state packets in the prompt block.
  - Added local asset readers for `aetheros_voice_core_${charId}` and
    `aetheros_worldline_hot_state_${charId}`, with compatibility fallbacks for
    earlier planning keys.
  - Wired the new memory delivery pipeline into calendar wakeup rendering and
    the phone-call surface. Chat, proactive letters, and meeting/date already
    use the shared selector and now receive the upgraded packets automatically.
  - Extended `记忆回声` receipts with delivery tier, hot-state presence, and
    voice-fingerprint count so runtime tests can verify what entered the prompt.
  - Updated the first-run open-source notice and README wording so user-facing
    attribution no longer implies ReiStandard / Active Message 2.0 is the
    current proactive-letter main path. The current visible path is AetherOS
    `companion_wakeups` plus the memory delivery chain.

- pending:
  - Add a user-facing/local import path for real `藏好的话` voice packs after the
    voice data format from the companion scraping window settles.
  - Add a visible editor or passive inspector for saved worldline hot state if
    real testing shows the derived fallback is too opaque.
  - Surface MemoryDM candidate/apply records beside delivery receipts so users
    can distinguish "it remembered" from "it used this memory".
  - Audit and remove or quarantine remaining ActiveMsg2/Rei client, Netlify
    function, package, type, and OSContext listener remnants before the next
    public push if they are no longer part of the AetherOS runtime.
  - Keep vector recall as a later optional augmentation after scoped keyword
    delivery is testable.

- verified:
  - `npm run build` passed. Vite still reports the existing large-bundle warning.
  - `git diff --check` passed.

## 2026-07-06 AetherOS Naming / Health Check

- done:
  - Removed no-longer-needed compatibility naming for the old social surface:
    `星动圈` / Spark storage and backup fields now use `朋友圈` / moments naming.
  - Renamed fork-owned card, appearance, sticker, memory, event, disclaimer,
    mock-server, and catalog keys to AetherOS naming where no old-data migration
    is needed.
  - Removed the old default-character lookup from `存钱罐`, 情人节, and
    白色情人节 flows; these now use the current/default character instead of
    searching for an upstream sample character.
  - Kept upstream SullyOS wording only in source attribution, public-release
    checklist notes, and upstream-reference documentation.

- verified:
  - `npm exec tsc -- --noEmit` passed.
  - `npm run build` passed; Vite still reports the existing large-bundle warning.
  - `git diff --check` passed.
  - Residual active-code scan found no `星动圈`, Spark storage, old Sully bubble
    class/card/preset names, XHS app names, or `sullyos_` local-storage keys.

## 2026-07-06 Public Worker / External Channel Cleanup

- done:
  - Removed the inherited Cloudflare worker proxy entry (`worker/index.js`) and
    local XHS bridge/proxy scripts from the deployable work copy.
  - Removed XHS app surfaces, XHS client utilities, per-character/chat toggles,
    XHS chat-card rendering, XHS DB stores, backup/export paths, and prompt
    instructions.
  - Rebuilt realtime context as local-first time/date context plus optional
    weather only. It no longer includes news search, Notion, Feishu, Brave, XHS,
    or inherited worker-domain calls.
  - Removed Notion, Feishu, Brave Search, and XHS controls from Settings.
  - Removed Brave real-search configuration and XHS shortcut/special mode from
    the browser app; the browser now stays as an AI-simulated in-phone toy.
  - Deleted the XHS debug guide and removed XHS acknowledgement text that no
    longer applies to this fork.
  - Detached the legacy Netlify emergency popup from `App.tsx` so the runtime no
    longer points users toward the upstream SullyOS fallback page.

- kept:
  - `worker/sw-keep-alive.ts` and `public/sw-keep-alive.js`, because those are
    local service-worker keep-alive helpers, not external Cloudflare workers.
  - Upstream copyright and attribution records in `NOTICE.md` / `README.md`,
    because the public fork still needs a clean origin trail.

- verified:
  - Residual scan found no active code/UI references to XHS, Brave, Notion,
    Feishu, inherited worker domains, or old XHS scripts.
  - `npm run build` passed. Vite still reports the existing large-bundle warning.

## 2026-07-05 朋友圈 / 资讯站 UI First Pass

- done:
  - Removed the top-right `我的 / 管理` controls from 朋友圈; personal/profile access now stays on the bottom user icon, with account management inside the profile page.
  - Reworked the social surface into `朋友圈 / 资讯站` tabs with non-persistent demo placeholder posts when the local feed is empty.
  - Replaced the old masonry card feed with deep-space-style vertical lists:朋友圈 status rows with comment previews, and 资讯站 media rows with capped horizontal cover slots.
  - Added a 朋友圈 top cover upload area using the existing local profile background asset path.
  - Repositioned the 朋友圈 cover/avatar layout so the user avatar straddles the lower cover divider like a social profile header, widened the cover image area slightly, and added a local delete-cover action.
  - Reduced the `朋友圈 / 资讯站` tab scale and tightened the refresh strip so `刷新` behaves like a light inline action instead of a full content block.
  - Removed visible `预览` labels and stopped treating stickers/AI emoji placeholders as large media previews; only real image assets render as cover images.
  - Tightened 朋友圈 / 资讯站 detail pages so empty media placeholders no longer expand into full-screen hero blocks.
  - Lowered and reduced the bottom `+` publish button so it sits inside the bottom island instead of floating into content.
  - Rebuilt the publish-status page with the shared shell header safe area and bottom sticker rail.

- pending:
  - Add real built-in media cover images once assets are provided. Recommended cover ratio is about `2.05:1`, e.g. `1080x520`.
  - Revisit 朋友圈 / 资讯站 memory routing after the memory-window design is settled.

- verified:
  - `npm run build` passed.
  - Follow-up build passed after the 20-100-turn slider and `char.memories`
    selector readback patch.
  - Follow-up build passed after connecting MemoryDM `calendar_reminder`
    candidates to `companion_wakeups`.
  - Targeted `git diff --check` passed for the memory/settings/doc files touched
    in this block; local dev server at `http://127.0.0.1:5174/` returned `200`.
  - `git diff --check -- apps/SocialApp.tsx` passed.

## 2026-07-05 Automatic Memory Sediment

- done:
  - Added `utils/memoryCore/autoMemory.ts` for automatic memory settings,
    cursors, local ledger rows, and one-shot/background sediment passes.
  - Retracted local transcript-spliced daily chat sediment from the active
    automatic path; `char.memories` stays on model archive, diary, import, or
    later reviewed refinement paths.
  - Added silent timebook candidate clipping into the existing `anniversaries`
    store, without immersive prompts asking whether something is a memory.
  - Wired a quiet OS-level background pass after load, every 30 minutes, and on
    return-to-foreground.
  - Revised Settings controls to separate `时光簿` node writing from `角色记忆`
    status. Removed the misleading threshold pair from the timebook writer.
  - Added `utils/memoryCore/memoryDm.ts` as the first LLM-driven memory/DM pass:
    it uses the foreground chat API, can run after configured user turns, stores
    candidate records in `assets`, and applies duplicate-gated `char.memories`
    / `时光簿` rows only for lower-risk categories.
  - Added Settings controls for `角色记忆` quiet turn-interval sorting without
    adding a second API configuration.
  - Replaced the dense 12/16/24-turn MemoryDM buttons with a sparse 20-100-turn
    slider, defaulting to 60 turns. Legacy stored values below 20 now migrate to
    the new default instead of staying dense.
  - Added a small `char.memories` readback path to `selectWorldlineMemoryContext()`,
    so MemoryDM-applied `角色记忆` can flow back into chat, meeting/date, and
    proactive-letter prompts without requiring manual active-month toggles.
  - Connected MemoryDM `calendar_reminder` candidates to the existing
    `companion_wakeups` runtime as `ai_calendar` / `calendar` priority rules,
    including optional one-time `targetDate` and windowed trigger scheduling.
  - Added `docs/PUBLIC_RELEASE_CHECKLIST.md` to track unfinished memory/calendar
    code, screenshot-related worker/channel audit results, current Git remote
    state, English README requirements, and the 2026-07-03/04/05 work timeline
    before the public AetherOS push.
  - Kept `记忆回声` as prompt-delivery receipt UI and separated it from actual
    auto-written sediment.
  - Added edit support for `时光簿` saved rows so silent candidates can be
    corrected later by title, date, and page note.
  - Renamed the visible `char.impression` shelf to `关系印象` and recorded
    automatic overwrite as a hold until extraction prompts are audited for
    role-internal perspective.

- pending:
  - List every memory/impression extraction prompt and audit it against the
    Driftstone-style role-internal private-note standard before changing
    `关系印象` automation.
  - Audit the MemoryDM extraction prompt against the Driftstone-style
    role-internal private-note standard.
  - Normalize legacy `char.memories` writers after prompt audit. The new
    MemoryDM writer has duplicate gates, but older manual archive, group,
    study/novel/game writers still append directly.
  - Surface MemoryDM candidate/apply records in `最近沉淀`. The records are stored
    in `assets/memory_dm_candidate_records_v1`, but the current Settings card
    still only shows the `autoMemory` ledger.
  - Add a richer calendar inspection/edit surface if `ai_calendar` wakeup rules
    need user-facing correction beyond the current wakeup settings/logs.
  - Connect approved 朋友圈 / 资讯站 posts into `story_seed` / 剧情生成仓 after the
    separate social-feed pass settles.
  - Later replace or augment the current timebook node signal matching with
    vector/Hippocove cold recall once the local sediment chain has enough real
    data.

- verified:
  - `npm run build` passed.

## 2026-07-05 Visible Memory Receipts

- done:
  - Added local worldline memory delivery receipts in `utils/memoryCore/receipts.ts`.
  - The shared memory selector now records a small receipt after selecting prompt
    context for chat, `见面`, date mode, proactive letters, or timebook calls.
  - Added `系统设置 / 自动记忆 / 记忆回声` so users can see recent memory context
    flow without opening a technical database screen.
  - Trimmed Settings copy so the memory surface behaves like a quiet receipt,
    not an explanation panel.
  - Confirmed `通讯录` already has visible long-memory shelves: daily/imported
    memories, monthly refined memories, active detailed recall, and user
    impression.
  - Added refresh, clear, folded history, and receipt-record controls for the
    local receipt log.
  - Updated memory architecture, requirements, schema, and fork design notes to
    distinguish delivery receipts from future durable relationship memory.

- pending:
  - Add the durable `worldline_events` write path after receipt behavior is
    reviewed in real conversation and scene flows.

- verified:
  - `npm run build` passed.
  - `git diff --check` passed for the memory receipt files and touched docs.

## 2026-07-04 Worldline Memory First Slice

- done:
  - Added `docs/WORLDLINE_MEMORY_ARCHITECTURE.md` to lock the otome memory model:
    character life line, user life line, canon floor, generated branches, and
    shared worldline intersections.
  - Added `utils/memoryCore/` with shared memory axes for origin, continuity,
    knowledge scope, and status.
  - Added a read-only `selectWorldlineMemoryContext()` selector that reuses
    existing `messages`, `anniversaries`, and first-contact `assets` without a
    DB migration.
  - Added a prompt formatter for tiny `世界线交汇记忆` / `未完成的回响` blocks.
  - Let `ChatPrompts.buildSystemPrompt()` accept an optional worldline-memory
    block instead of forcing `ContextBuilder` to query IndexedDB.
  - Wired the first selector into chat, `见面` / date mode, and active-message
    generation so later UI has real code interfaces behind it.
  - Updated README, plan, requirements, schema, and fork design notes to record
    the fork difference and the new memory principle.

- pending:
  - Decide whether the next block should add durable `worldline_events` stores
    or keep iterating on selector quality with existing data.

- verified:
  - `npm run build` passed.
  - `git diff --check` passed for the worldline-memory files and touched docs.

## 2026-07-04 Shell Status Bar / App Header Pass

- done:
  - Added shared shell layout constants and reusable `AppHeader` for app pages
    that should reserve the same top status-bar area.
  - Updated `StatusBar` to support launcher/app/dark variants instead of every
    page relying on ad hoc text color.
  - Routed `PhoneShell` status-bar variants so launcher keeps launcher color,
    dark phone surfaces use light status text, and regular app pages use dark
    status text.
  - Connected the unified app header to Settings, Appearance, User/档案,
    ThemeMaker/聊天装扮, Widget, CompanionPlan, Gallery, Call outer pages,
    CheckPhone target selection, and ChatHeaderShell.
  - Kept the in-call screen immersive, but moved its top controls below the
    shared shell safe area.
  - Connected the unified app header to 小小窝 selection, 见面 selection/history,
    and 见面 scene settings.
  - Added a shell status-bar override hook so mixed apps like 见面 can switch
    between regular app status text and dark immersive status text by mode.
  - Moved 小小窝 and 见面沉浸层 top controls onto the shared shell safe-area
    constant instead of fixed `pt-12`.
  - Replaced the unsupported `bg-white/76` app-header opacity class with
    `bg-white/80`, so the shared header background is actually generated.

- verified:
  - `npm run build` passed.
  - Browser checks confirmed launcher, 朋友圈/设置, 通讯录/书房/时光簿,
    电话选人/通话记录, 聊天页, and 查手机外层选择页 expose stable shell header/status
    metrics without covering the system time.
  - Follow-up browser check confirmed 查手机 dark header uses light status text.
  - Follow-up browser checks confirmed 见面 and 小小窝 selection pages both render
    `80px` shared app headers and `32px` status bars with dark app text.

## 2026-07-04 Chat Outfit Bubble Linkage Fix

- done:
  - Renamed visible `对话美化` entry points to `聊天装扮`.
  - Recorded the bubble linkage root cause: the previous deep-space baseline reused
    `chatBubbleStyle: "wechat"` only as a concentrated-layout marker, but the
    newer WeChat pass treated that same value as permission to render WeChat side
    tails.
  - Split deep-space into its own `chatBubbleStyle: "deep-space"` variant.
  - Restored deep-space bubbles to the avatar-facing upper sharp corner with no
    side tail or arrow.
  - Kept the WeChat side-tail renderer scoped to the WeChat bubble variant.
  - Updated the chat outfit live preview to use the same split, so preview and
    real chat do not drift again.

- verified:
  - `npm run build` passed.
  - In-browser chat outfit preview check confirmed deep-space character bubbles
    have `border-top-left-radius: 2px`, user bubbles have
    `border-top-right-radius: 2px`, and no side-tail nodes render.
  - The same preview check confirmed WeChat bubbles keep their 7px rounded
    rectangle shape and one side-tail node per bubble.

## 2026-07-04 Timebook Paper Keepsake UI

- done:
  - Rebuilt `apps/ScheduleApp.tsx` as a desk-and-paper keepsake page instead of
    the old schedule/timeline visual shell.
  - Added `public/assets/aetheros/timebook-desk-bg.png` from the generated
    wood-table / flowers / pen background.
  - Removed the visible avatar, timeline heading, theme switcher, hero card, and
    old cyber/schedule chrome from the timebook page.
  - Added a central translucent paper card with `相伴 N 天` at the top and a
    scrollable memory-entry list inside.
  - Changed rows to show date / distance plus a short title, with tap-to-expand
    retrospective text.
  - Changed timebook text generation to on-demand expansion with a short
    paragraph prompt instead of page-load background generation.
  - Follow-up aligned the page to the `见面` selected character by filtering
    timebook rows with the global active character id.
  - Added a first-meeting relationship anchor row for the selected character,
    stored separately in `assets` under `timebook_first_contact_${charId}` when
    manually edited.
  - Supports manual first-meeting title/date/note editing, plus an explicit
    AI-assisted note-fill button that can reference imported memories.
  - Changed the desk background to a ratio-preserving layer after measuring the
    screenshot/background aspect mismatch.
  - Shortened the paper/content layer, reduced row typography, and changed the
    companion-day header into one line: `相伴 N 天`.
  - Follow-up measured the user's red-box target (`820x1312` image, red box at
    `134,280,724,1043`) and set the frosted panel to matching proportions:
    `left=16.4%`, `right=11.7%`, `top=21.3%`, `bottom=20.5%`.
  - Follow-up matched the target red-box image against the original desk asset
    and replaced the over-zoomed `112% auto` background with
    `background-size=101% auto` and `background-position=72% 46%`.
  - Follow-up thinned the frosted paper overlay so background details, including
    the lower-right flower mark, remain visible: card opacity, grid opacity,
    border, shadow, and top white haze were all reduced.
  - Follow-up fixed the over-transparent top color band by removing the separate
    top white-haze gradient entirely and making the frosted overlay uniformly
    thinner.
  - Updated requirements, schema, and fork design notes for the paper-keepsake
    behavior.

- pending:
  - Review paper-card alignment and typography on the real phone viewport with
    the user.
  - Replace the temporary built-in first-meeting copy with user-provided fixed
    lines for each built-in character.
  - Decide whether bulk imported anniversaries should offer a guided
    first-contact extraction step or leave the first day entirely manual.
  - Decide later whether `timebook_entries` should replace the current
    anniversary-backed row shape.

- verified:
  - `npm run build` passed.
  - `git diff --check` passed for the touched timebook UI and doc files.
  - The copied background asset returned `200 OK` from the local dev server.

## 2026-07-04 Companion Plan App

- done:
  - Added standalone `同行计划` as `AppID.CompanionPlan`.
  - Registered `同行计划` in the first launcher companion page before `时光簿`.
  - Added `apps/CompanionPlanApp.tsx` with stage-goal creation, target notes,
    optional deadline, cadence, progress check-ins, stuck records, completion,
    and optional AI-generated milestone notes.
  - Extended `Task` with companion-plan optional fields while keeping the
    existing `tasks` IndexedDB store for compatibility.
  - Wired `CompanionPlanApp` into `PhoneShell`.
  - Updated README, plan, requirements, schema, timebook context plan, and fork
    design notes to describe the `同行计划 / 时光簿` split.

- pending:
  - Review and redesign the `同行计划` UI colors/layout with the user.
  - Decide whether completed companion-plan milestones should have a manual
    `写入时光簿` export action.

- verified:
  - `npm run build` passed.

## 2026-07-04 Timebook First Slice

- done:
  - Renamed the visible `时光契约` app to `时光簿`.
  - Renamed the visible `自习室` app to `书房` while keeping its existing PDF/course/quiz study behavior intact.
  - Changed `ScheduleApp` into a relationship timebook surface focused on anniversaries and shared experiences.
  - Removed task UI, task completion history, and task reward-generation logic from `ScheduleApp`.
  - Kept existing `Task` storage untouched so old data can later move into a standalone `同行计划`.
  - Changed anniversary AI text generation so `aiThought` is generated only when missing instead of being rewritten on a background interval.
  - Added `utils/timebook.ts` for timebook date helpers, upcoming anniversary selection, anniversary sorting, and the anniversary thought prompt.
  - Added `docs/TIMEBOOK_CONTEXT_PLAN.md` with the planned retrievable context-delivery boundary.
  - Updated fork design notes, requirements, schema, plan, and README wording for the new structure.

- pending:
  - Build a standalone `同行计划` app for stage goals, progress checks, and possible milestone export into `时光簿`.
  - Implement the future read-only `selectTimebookContext()` adapter before wiring timebook context into chat prompts.

- verified:
  - `npm run build` passed.

## 2026-07-04 Chat Appearance Preview Pass

- done:
  - Shrank the chat appearance live preview into a compact mini phone-like preview.
  - Changed the preview from a generic chat mock to a deep-space-specific scene with centered `祁煜` header, default chat background, round in-message avatars, white character bubbles, light-yellow user bubble, and avatar-facing upper sharp corners.
  - Removed the old inline `ChatAppearanceEditor` from `apps/Appearance.tsx`; the active chat tab now only uses `components/appearance/ChatAppearanceEditor.tsx`.
  - Removed the old free-form platform combo path after using it as reference.
  - Renamed `月白` to `极简` and added `微信` as the WeChat-like built-in direction.
  - Removed Telegram / Discord / QQ-style theme branches from the visible appearance path and from the active chat header/input style contracts.
  - Changed draft preset cards from disabled placeholders into clickable predefined theme drafts, so the chat appearance page is usable while still avoiding granular bubble controls.
  - Removed the explanatory line under `实时预览` and matched its section-title sizing to `默认背景图`.
  - Wired the real chat screen's active bubble theme to `chatAppearancePreset` instead of falling back to the per-character legacy `bubbleStyle`.
  - Added built-in chat bubble theme ids for the visible chat presets so appearance presets and message rendering share the same theme map.
  - Added `chatBubbleThemeId` as the global bubble-theme switch so the active chat bubble visual has one owner instead of the old per-character `bubbleStyle` path.
  - Moved the chat theme preset editor out of `外观` and into `对话美化`.
  - Removed the chat input panel's duplicate `气泡样式` selector so the chat page no longer has a third theme-changing entry point.
  - Unified actual bubble styling and the compact preview through a shared container-style helper; WeChat now uses green user borders and no shadow/gradient-like chrome.
  - Reordered desktop apps so core chat/role tools stay earlier, `对话美化` and `外观` sit together as visual tools, and `存钱罐` moves to the later utility/experimental area.
  - Replaced the two old visible reserved theme cards with `自定义`, leaving the four chat theme entries as `深空`, `极简`, `微信`, and `自定义`.
  - Removed per-card explanatory helper text under chat theme names.
  - Split the built-in shape contracts so `深空` keeps the upper avatar-facing sharp corner, `极简` uses soft rectangular bubbles, `微信` uses low-radius square bubbles, and only `自定义` opens granular bubble adjustment.
  - Kept legacy `soft-note` / `pixel-signal` strings only as migration fallbacks that resolve into `自定义`.
  - Follow-up refined `极简` from pill-like 24px bubbles to softer rectangular 16px bubbles.
  - Removed the peer `气泡细调` tab and changed `自定义` into a child editor opened from the `自定义` card.
  - Simplified the visible custom bubble editor to core bubble controls only: side selection, name, readability, text color, bubble color, transparency, padding, radius, and optional texture upload.
  - Moved avatar frame/accessory controls into a separate visible `头像框挂件` area.
  - Reworked the deep-space chat background so the full chat shell owns the single active background image while the header and message scroll layer stay translucent/transparent overlays, with the deep-space header divider suppressed to avoid a stitched seam.
  - Turned the chat header lightning into a reply control area: lightning still triggers an immediate reply, while the adjacent status dot opens `回复方式` for `手动接话` / `自动回复` / `主动来信`.
  - Added per-character `autoReplyEnabled` support so sending a user message can either auto-trigger AI or wait for manual lightning input.
  - Updated `使用帮助` to remove the old “must tap lightning after sending” guidance and point users to `对话美化` for chat themes.

- verified:
  - `npm run build` passed.
  - Local Chrome visual check confirmed the `外观 -> 聊天界面` preview renders as a smaller deep-space preview.
  - Playwright CLI check opened the app, entered `外观定制 -> 聊天界面`, clicked the then-visible theme cards, and confirmed the selected card becomes active.
  - Playwright snapshot confirmed the `实时预览` helper sentence is gone and every theme card has pointer/clickable semantics.
  - Playwright confirmed the actual chat page follows the selected preset: `微信` rendered green user bubbles / white character bubbles, then switching to `极简` rendered blue user bubbles / gray character bubbles.
  - Follow-up Playwright check confirmed `外观` no longer shows `聊天界面`, `对话美化` contains the chat theme path, and selecting `微信` yields real chat bubbles with green user border, gray character border, and `box-shadow: none`.
  - Follow-up build passed after limiting bubble fine adjustment to the `自定义` preset.
  - Browser check confirmed `对话美化` now shows the four theme cards plus a separate `头像框挂件` entry, `极简` preview bubbles render at 16px radius, `自定义` opens a child editor without CSS/sticker/voice/A-B controls, and `头像框挂件` opens its own page.
  - Browser check confirmed the deep-space live preview and real chat share a single outer `chat-default-bg.jpg` background; their header/scroll layers no longer compute a duplicate image and the header bottom border is transparent.
  - Browser check confirmed the chat header exposes `立即接话` plus `回复方式：自动回复`, the reply-mode modal opens with the three intended modes, manual mode changes the status label, and auto mode can be restored.
  - Browser check confirmed `使用帮助` no longer contains the old “must tap lightning” guidance and now mentions `回复方式` / `自动回复` / `对话美化`.

## 2026-07-03 Deep-Space Chat Appearance Preset

- done:
  - Added `chatAppearancePreset` to the OS theme contract.
  - Made `深空` the default active chat appearance preset.
  - Resolved old/free-form chat appearance settings back into the deep-space layout when no explicit preset exists.
  - Locked deep-space chat to circular in-message avatars, centered no-avatar mobile header, fixed WeChat-like bubbles, white character bubbles, and light-yellow user bubbles.
  - Changed the bubble shape contract to a sharp upper corner facing each avatar, without any side tail.
  - Simplified the chat appearance editor so it exposes built-in preset cards and background controls instead of granular bubble height/shape controls.
  - Reserved future built-in preset slots before the preset list was later tightened into the current four-entry contract.

- verified:
  - `npm run build` passed.
  - Local Chrome visual check confirmed the mobile chat header, circular avatars, white character bubbles, yellow user bubbles, and bubble corners render in the chat screen.
  - Follow-up Chrome visual re-check confirmed the top header is centered without a header avatar, the side tail is gone, bubbles use only the avatar-facing upper sharp corner, and avatar-bubble spacing is wider.
  - Follow-up sizing pass made deep-space message avatars match the default one-line bubble height.
  - Reference-image pass reduced the centered header name/status block to a compact 18px / 11px hierarchy.
  - Follow-up spacing pass reduced the signed chat header container from 96px to 78px and tightened deep-space avatar-bubble spacing from 16px to 10px.

- next:
  - Refine the draft preset visuals one by one, especially full iMessage parity for `极简` and full WeChat parity for `微信`.
  - If the public deployment should receive this pass, run the GitHub Pages build and server sync workflow separately.

## 2026-07-02 Private Fork Packaging Notice

- done:
  - Expanded `NOTICE.md` with the concise reason for removing the upstream Sully default character from this deployment fork: this build should not redistribute Sully as a packaged character.
  - Added a short fan-content boundary for built-in characters and presets: they may contain fan-made organization or reinterpretation, are not official, and should be replaced before broad publication.
  - Added an explicit no-commercial-use boundary covering resale, paid distribution, paid customization, paid-platform operation, monetization, and fake official/authorized presentation.
  - Folded the same boundary into the README and first-run disclaimer without making the opening popup overly long.

- verified:
  - Pending build and whitespace check before committing to the private GitHub repository.

## 2026-07-02 Built-In Starter Roles

- done:
  - Replaced the startup auto-seed path so new/local-empty browsers receive deployment-owned starter roles instead of the legacy Sully preset.
  - Filtered the legacy `preset-sully-v2` role out of the runtime character list so it no longer appears as the public default role.
  - Removed the unused legacy Sully preset data block from `OSContext`.
  - Removed Sully-only furniture presets, room reset controls, and room initialization branches from `RoomApp`.
  - Added built-in character metadata and locked built-in starter prompts behind the UI.
  - Hid delete controls for locked built-in characters.
  - Updated README default-role wording to match the deployment fork.
  - Added deployment fork maintainer credit as `A-Yuan / Asherie` while keeping upstream NMJ attribution and PolyForm Noncommercial boundary visible.

- pending:
  - Replace the temporary generic starter roles with the user's final packaged example characters when those cards/prompts are ready.

## 2026-07-02 Open Source Notice

- done:
  - Checked the maintained work copy and original sample for `LICENSE`, `NOTICE`, README license text, package metadata, and git remotes.
  - Found no standalone `LICENSE` file in the distributed local sample.
  - Found the current public upstream repository: `https://github.com/qegj567-cloud/SullyOS`.
  - Confirmed the public upstream GitHub owner is `qegj567-cloud`, profile name `NMJ`.
  - Confirmed the current upstream README requires `Copyright (c) 2024-2026 NMJ (SullyOS / 手抓糯米机)`.
  - Confirmed the current upstream README states PolyForm Noncommercial 1.0.0, superseding the older local sample README's MIT note for this deployment boundary.
  - Added `NOTICE.md` to document upstream attribution, local modifications, and non-commercial use boundary.
  - Set package metadata to `SEE LICENSE IN NOTICE.md`.
  - Updated the first-run opening popup to show open-source attribution, credits, PolyForm Noncommercial boundary, and disclaimer before use.
  - Kept the user's privately confirmed Xiaohongshu identity out of public attribution because the GitHub upstream identity is sufficient and less invasive.

- verified:
  - Local source inspection confirmed the original sample has the older README MIT statement and no declared author/remote.
  - GitHub API returned public upstream repo metadata for `qegj567-cloud/SullyOS`.
  - GitHub API README decode found the PolyForm Noncommercial section and Required Notice.

## 2026-07-02 Launcher UI Pass

- done:
  - Improved Launcher readability on the default pastel wallpaper by switching the default content color to slate.
  - Gave app icons solid light surfaces and per-app icon colors so clickable areas are clearer.
  - Added a translucent launcher app panel to separate the desktop grid from the background.
  - Moved the default Dock to phone/message/date/settings: `电话`, `Message`, `见面`, `设置`.
  - Increased the vertical gap between the page indicator and bottom Dock so the indicator no longer feels blocked.
  - Fixed duplicate React keys in the calendar weekday row.

- verified:
  - `npm run build` passed.
  - Local Playwright smoke opened the Launcher at desktop and 390x844 mobile viewport.
  - Mobile screenshot confirmed the bottom Dock no longer covers the page indicator.

## 2026-07-02 Sun Fruit Pack

- done:
  - Added public pack `theme-sun-fruit` / `太阳果`.
  - Copied 25 original GIF assets into `public/stickers/assets/theme-sun-fruit/`.
  - Filled `public/stickers/catalog.json` with stable `sunfruit_001` through `sunfruit_025` entries and `太阳果-*` display names.
  - Added `恋与深空` as a source/context tag for this pack's sticker entries.
  - Kept the pack default-disabled so each browser/user must enable it per local character.

- next:
  - Have one fresh browser/user enable `太阳果` for a test character and confirm the sticker appears in the picker.

- verified:
  - Local catalog parse found all five public packs, `125` total sticker entries, and `0` missing assets.
  - `GITHUB_PAGES=1 npm run build` passed for `/sullyos/` subpath deployment.
  - Server synced `dist/` to `/srv/asherie/sites/science-demos/sullyos`.
  - Server backup before sync: `/srv/asherie/backups/sullyos-sun-fruit-20260702T075358Z`.
  - Public catalog `https://lab.asherie.cloud/sullyos/stickers/catalog.json` returned version `2026-07-02-sun-fruit-v1`.
  - Public sticker `sunfruit_001.gif` returned `200 OK`.
  - Playwright browser smoke mounted the SullyOS lock screen with `0` console errors and the known Tailwind CDN warning.

## 2026-07-02 Haoqi Crow Pack

- done:
  - Added public pack `theme-haoqi-crow` / `好气鸦`.
  - Copied 25 original GIF assets into `public/stickers/assets/theme-haoqi-crow/`.
  - Filled `public/stickers/catalog.json` with stable `haoqiya_001` through `haoqiya_025` entries and `好气鸦-*` display names.
  - Kept the pack default-disabled so each browser/user must enable it per local character.

- next:
  - Have one fresh browser/user enable `好气鸦` for a test character and confirm the sticker appears in the picker.

- verified:
  - Local catalog parse found all four public packs, `100` total sticker entries, and `0` missing assets.
  - `GITHUB_PAGES=1 npm run build` passed for `/sullyos/` subpath deployment.
  - Server synced `dist/` to `/srv/asherie/sites/science-demos/sullyos`.
  - Server backup before sync: `/srv/asherie/backups/sullyos-haoqi-crow-20260702T074343Z`.
  - Public catalog `https://lab.asherie.cloud/sullyos/stickers/catalog.json` returned version `2026-07-02-haoqi-crow-v1`.
  - Public sticker `haoqiya_001.gif` returned `200 OK`.
  - Playwright browser smoke mounted the SullyOS lock screen with `0` console errors and the known Tailwind CDN warning.

## 2026-07-02 Smiling Snowman Pack

- done:
  - Added public pack `theme-smiling-snowman` / `微笑雪人系列`.
  - Copied 25 original GIF assets into `public/stickers/assets/theme-smiling-snowman/`.
  - Filled `public/stickers/catalog.json` with stable `snowman_001` through `snowman_025` entries and `雪人-*` display names.
  - Kept the pack default-disabled so each browser/user must enable it per local character.

- next:
  - Have one fresh browser/user enable `微笑雪人系列` for a test character and confirm the sticker appears in the picker.

- verified:
  - Local catalog parse found all three public packs, `75` total sticker entries, and `0` missing assets.
  - `GITHUB_PAGES=1 npm run build` passed for `/sullyos/` subpath deployment.
  - Server synced `dist/` to `/srv/asherie/sites/science-demos/sullyos`.
  - Server backup before sync: `/srv/asherie/backups/sullyos-smiling-snowman-20260702T072819Z`.
  - Public catalog `https://lab.asherie.cloud/sullyos/stickers/catalog.json` returned version `2026-07-02-smiling-snowman-v1`.
  - Public sticker `snowman_001.gif` returned `200 OK`.
  - Playwright browser smoke mounted the SullyOS lock screen with `0` console errors and the known Tailwind CDN warning.

## 2026-07-01

- done:
  - Copied editable work tree from `samples/SullyOS-master` to `0-github/SullyOS`.
  - Excluded `node_modules`, `dist`, `.npm-cache`, `.playwright-cli`, and `.DS_Store` from the copy.
  - Added a public sticker catalog at `public/stickers/catalog.json` with an empty `a 组表情包` pack.
  - Added category visibility mode support so an empty allowlist can mean "visible to nobody" for public packs.
  - Added shared emoji visibility helpers for private chat, group chat, and active messages.
  - Added a chat emoji-panel management entry for enabling/disabling public packs for the current character.
  - Imported the `theme-starry-baby` public sticker pack with 25 GIF assets under `public/stickers/assets/theme-starry-baby/`.
  - Filled `public/stickers/catalog.json` with stable `starbaby_001` through `starbaby_025` entries and `星宝-*` display names.
  - Imported the `theme-doodle-ji` public sticker pack with 25 GIF assets under `public/stickers/assets/theme-doodle-ji/`.
  - Filled `public/stickers/catalog.json` with stable `doodleji_001` through `doodleji_025` entries and `涂鸦叽-*` display names.

- next:
  - Ask for human review of display names after the first in-app sticker selection test.
  - Have one fresh browser/user enable `星际小宝系列` for a test character and confirm the sticker appears in the picker.

- risk:
  - Public pack enablement is intentionally browser-local. Different users and devices can choose different role-pack mappings.
  - Existing legacy TypeScript debt may still make `tsc --noEmit` noisy even when Vite build succeeds.

- verified:
  - `GITHUB_PAGES=1 npm run build` passed for `/sullyos/` subpath deployment.
  - Server synced `dist/` to `/srv/asherie/sites/science-demos/sullyos`.
  - Server backup before sync: `/srv/asherie/backups/sullyos-starry-baby-20260701T1530Z`.
  - Public URL `https://lab.asherie.cloud/sullyos/` returned `200 OK`.
  - Public catalog `https://lab.asherie.cloud/sullyos/stickers/catalog.json` returned version `2026-07-01-starry-baby-v1`.
  - Public sticker `starbaby_025.gif` returned `200 OK`.
  - Playwright browser smoke mounted the SullyOS lock screen with `0` console errors and the known Tailwind CDN warning.

## 2026-07-01 Doodle Ji Pack

- done:
  - Added public pack `theme-doodle-ji` / `涂鸦叽系列`.
  - Copied 25 original `150x150` GIF assets into `public/stickers/assets/theme-doodle-ji/`.
  - Kept the pack default-disabled so each browser/user must enable it per local character.

- verified:
  - Local catalog parse found both public packs, `50` total sticker entries, and `0` missing assets.
  - `GITHUB_PAGES=1 npm run build` passed for `/sullyos/` subpath deployment.
  - Server synced `dist/` to `/srv/asherie/sites/science-demos/sullyos`.
  - Server backup before sync: `/srv/asherie/backups/sullyos-doodle-ji-20260701T1600Z`.
  - Public URL `https://lab.asherie.cloud/sullyos/` returned `200 OK`.
  - Public catalog `https://lab.asherie.cloud/sullyos/stickers/catalog.json` returned version `2026-07-01-doodle-ji-v1`.
  - Public sticker `doodleji_025.gif` returned `200 OK`.
  - Playwright browser smoke mounted the SullyOS lock screen with `0` console errors and the known Tailwind CDN warning.

- next:
  - Have one fresh browser/user enable `涂鸦叽系列` for a test character and confirm the sticker appears in the picker.
  - Ask for human review of `涂鸦叽-*` display names after the first in-app sticker selection test.

## 2026-07-01 Naming Contract

- done:
  - Locked public sticker naming into three layers: stable pack ID, technical sticker/asset file ID, and human/AI display name.
  - Documented that tags are selection hints, not access control.
  - Documented image intake rules for large/non-standard downloaded images.
  - Added ignored intake paths so raw source images do not get committed accidentally.

- next:
  - Build and inspect the bundled `dist/stickers/` output before server sync.
  - Ask for human review of display names after the first in-app sticker selection test.
