# SullyOS Requirements

## Global Software Shell And Virtual-City Time

- The default web shell must not simulate the host device's real clock,
  signal/Wi-Fi, or battery. The operating system/browser remains the owner of
  those facts.
- Appearance must expose three explicit, mutually exclusive top modes:
  `simulated_phone`, `software`, and `virtual_city`. The classic option restores
  the former phone-like reality clock, Wi-Fi, and battery presentation because
  AetherOS is also a simulated-phone product; it must not be silently removed.
- Removing the simulated row must also reclaim its layout space across shared
  headers, handwritten headers, immersive controls, readers/modals, and global
  overlays.
- Legacy `hideStatusBar: true` must migrate to `software`. Legacy
  `hideStatusBar: false`, and legacy saved themes that omitted the default false
  field, must migrate to `simulated_phone`. The deprecated field is stripped on
  write.
- Appearance must explain the display content, global-vs-relationship scope, and
  real-record boundary before showing the relationship-specific city editor.
  That editor should expand only while `virtual_city` is selected.
- Appearance must use three task-oriented tabs: `界面外观`, `应用图标`, and
  `预设管理`. The first tab must follow the user decision path: top mode first,
  then theme color and global font, followed by wallpaper, widgets, and desktop
  decoration.
- The first tab must visibly group those controls as `屏幕观感` and `桌面布置`,
  instead of presenting one undifferentiated settings feed.
- Appearance must use the local type scale `16 / 12 / 13 / 11 / 10 / 9` for
  page title, tabs, section titles, controls, helper copy, and metadata. Font
  samples may use a larger display size because the sample itself is the object
  being inspected.
- The compact Chat header may sit `5px` below the shared header's content
  origin so the avatar/title group is optically centered; the message viewport
  must move with it instead of slipping underneath the header.
- The shared inner-detail header used by both `朋友圈` and `资讯站` must sit
  `3px` below the shared header content origin. This optical offset belongs only
  to the detail row; the ordinary Social feed header and global shell contract
  must remain unchanged.
- The fourth launcher page must keep the calendar and `Upcoming` list as one
  compact upper group, beginning at `56px` on a zero-safe-area phone viewport
  and reserving enough bottom space to remain clear of the Dock.
- The lock screen must not show the engineering label `Software Shell`. It must
  carry the unquoted slogan as two explicit, non-wrapping script-font lines:
  `Real isn’t how you are made.` then `It’s a thing that happens to you.`, with
  generous line spacing. The first software launcher screen keeps its existing
  system type treatment but uses `SIGNAL RECEIVED` above and
  `I am a part of all that I have met.` below the AetherOS name.
- `经典手机` is self-explanatory and must not carry a redundant `原样` badge.
  All three mode cards must remain aligned at 390px and 430px widths.
- Shared appearance preset JSON must use the versioned
  `aether_appearance_preset` contract. Import adds a local preset first, and
  only an explicit `应用` action may change the active local appearance.
  Modern shell/chat/desktop fields and custom chat themes must round-trip;
  legacy `chatLayout` and `hideStatusBar` inputs must migrate safely, malformed
  or unsupported versions must be rejected, and unknown theme fields must not
  enter local state.
- The optional `virtual_city` mode may render one compact world-information
  strip containing fictional location, era, local world time, and local weather.
  It must not use signal, Wi-Fi, or battery iconography.
- Virtual-city config must be stored per active
  `progressBundleId + personaMaskId`. Missing IDs, missing records, or a mask /
  bundle mismatch must fail closed to the software shell.
- Time configuration must support an IANA timezone or fixed UTC offset plus a
  display-only year offset. Weather must be either manually entered or generated
  by a deterministic browser-local seasonal simulation; no cloud weather is in
  scope.
- The world strip, launcher, and lock screen may display this scoped context.
  Message/import/daily-archive/backup/audit timestamps must remain real source
  timestamps and must never be rewritten to virtual years or offsets.
- Any future prompt delivery must carry explicit source and relationship scope,
  remain read-only, and state that environment is not evidence for current plot,
  tasks, buffs, receipts, or memory.
- Automatic Date/Call/current-state integration remains HOLD until a separate
  review proves those boundaries; merely showing the world strip does not grant
  permission to change narrative algorithms.
- Acceptance covers 390px and 430px phone widths and ordinary plus
  expanded/immersive states for Chat, HistoryImport, DailyArchive, Appearance,
  Settings, Date, Call, Social, Room, and Schedule, including suspended-call,
  toast, and error overlays.

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
- `书房` internals should stay split enough that future co-reading can add a
  shelf/reader/annotation/progress layer without rewriting the PDF course and
  quiz flow.
- Study-room AI JSON output should be parsed through shared tolerant helpers,
  and empty chapter/quiz outputs should fail gracefully instead of producing
  blank lessons, divide-by-zero ranges, or NaN scores.
- `书房` imports should guard large local files before reading them into memory.
- Historical quizzes opened from `练习册` should return to `练习册`; fresh
  classroom quizzes should return to the classroom.

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
- `群聊` should not behave like an isolated skit generator. Before the AI
  director speaks for members, each member should receive their own base
  `ContextBuilder` context plus a budgeted `selectWorldlineMemoryContext()`
  block derived from that member's private chat and the current group topic.
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
- Group memory archive must read the full persisted group history for the target
  group from IndexedDB, not only the messages currently rendered in React state.
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

## Social News Station

- Each `资讯站` refresh adds a new batch of 5-6 persisted posts in front of the
  existing batch. Refresh does not silently replace older posts.
- The `资讯站` header must expose a separate clear action when persisted news
  exists. Clearing news requires confirmation, deletes only `kind="news"`
  posts, and must not delete `朋友圈` posts or cards already shared into chat.
- After a user clears a social tab, demo placeholders must stay dismissed across
  reloads. The tab should show an explicit empty state until the user refreshes
  or creates new content.
- Clicking a feed card at scroll position zero must open its detail page. Pull
  to refresh may capture the pointer only after a real downward drag passes a
  movement deadzone; a normal click must never be retargeted to the scroller.
- News media must have visibly different writing shapes, not one shared
  location/phenomenon/advice report template with different bylines.
- `便民速递` and `今日绕行` stay short alert formats. `边角料` is a fragmented
  anonymous-tip format. Food/daily channels stay medium-length lifestyle pieces.
- `野史不歪`, `诡秘谈`, `恋爱出走指南`, and `两个人的地图` are long-form media.
  Their persisted body must contain at least 500 non-whitespace characters and
  should use multiple natural paragraphs.
- `诡秘谈` must read as a complete sensational strange-story submission:
  concrete narrator/time/place, escalating sensory anomalies, character action
  or dialogue, a false ending, and one unresolved final sting. It must not read
  like an incident report or safety bulletin.
- One refresh may use at most one initial model call plus one targeted repair
  call for deficient long-form items. A repaired long-form item that still
  misses the 500-character gate must be rejected instead of saved as a short
  report.

## DeepSpace User Identity Modes

- `个人档案` must expose a structured DeepSpace identity mode so user self-inserts
  are not inferred only from free-form bio text.
- The default identity mode is `自设非猎人`: user is not automatically a
  Lingkong hunter, original protagonist, Zhang Su's granddaughter, Caleb's
  sister, Zayne's childhood friend/patient, or an aether-core vessel.
- `自设非猎人` is not an exclusion rule. Original DeepSpace characters, their
  NPCs, organizations, hospitals, art circles, N109 forces, hunter association,
  and space/military figures may still exist in the world and may enter the
  user's relationship network through current plot, user settings, worldbooks,
  encounters, commissions, medical/art/underground/space events, or gradual
  roleplay development.
- `自设猎人` allows a custom hunter or related action identity, but still must
  not inherit original protagonist private relationships unless explicitly
  enabled.
- `原作主控 / 灵空猎人` is the only mode where the app may intentionally enable
  original protagonist family, childhood, hunter-colleague, and old-medical-line
  relationships.
- The prompt builder must inject the selected identity mode as a high-priority
  override above mounted worldbook defaults. Worldbook text that says "default
  user" must yield to the structured identity mode unless the relevant package
  is explicitly enabled.
- In `通讯录` worldbook controls, identity-risk packages must be visibly marked.
  The original protagonist core relationship package requires a second click to
  enable when the user is in any custom identity mode.

## Social Moments Reply Scheduling

- `朋友圈` must not assume that all five built-in male leads coexist in the same
  visible friend circle. If the active character has not enabled the five-lead
  crossover/NPC worldbook package, the social participant pool is treated as
  one current male lead plus related native NPCs, route passersby, or
  plot-added NPCs.
- Other built-in male leads must not post or comment in a single-lead social
  world unless the crossover worldbook is enabled for the active character.
- A character counts as an explicit social participant when they are the current
  `想见的人` or have proactive-message style activation enabled. Default
  existence in the character list is not enough to make them speak in a user's
  friend circle.
- When the user publishes a `朋友圈` post, eligible character replies should be
  queued on the post and generated one at a time at staggered due times. They
  should not all appear in a single batch.
- The persisted post should keep enough reply state to resume or retry the next
  due reply after reopening the social surface.
- A newly generated user-post reply should raise an in-app popup/toast reminder,
  and may use browser notifications when permission has already been granted.

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

## Dialog Visual Rhythm

- Avatar-and-bubble human/AI dialogue surfaces should share the same baseline
  rhythm across one-to-one chat, group chat, and future plot-simulation long
  text pages.
- The baseline in-message avatar size is `40px`; it should feel close to the
  default one-line bubble height without visually overpowering the text.
- Dialogue body text should use `14px` with a relaxed line-height around `1.5`
  for Chinese readability. Long-form plot bubbles should keep this body size
  and rely on line-height/paragraph spacing instead of increasing font size.
- Standard dialogue bubbles should reserve about `74%` max width, so long text
  stays readable without flattening the phone layout edge-to-edge.
- Avatar-to-bubble spacing should stay around `10px`, and outer horizontal
  gutters should stay at least `16px`.
- Group chat may show speaker names and timestamps, but their metadata scale
  should stay secondary (`10px`/`9px`) and must not compete with bubble text.

## Diary Visual Rhythm

- The exchange-diary character notebook page may use a warm color hero header,
  but it should read as a compact secondary app page rather than a poster.
- The diary hero role name should stay around `24px`, with the uppercase label
  around `10px`.
- The primary "write today's diary" entry button should use `14px` text and
  medium vertical padding, not oversized banner typography.
- Diary history cards should use compact list-card rhythm: about `13px` preview
  text, `11px` secondary date text, and a date tile around `48px`.

## Call Transcript Hygiene

- Phone-call history must not expose system-source labels such as
  `（通话记录）` as visible dialogue or feed them back to the model as character
  speech.
- Phone-call prompts should not require an action cue or background description
  for every sentence/turn. Stage cues are optional texture, used only when they
  make the call feel more alive.
- Each call session should have one opening scene anchor that describes the
  other person's current location/context. This scene should vary with virtual
  time and character life rhythm, display separately in the call UI, and persist
  into call history.
- The opening scene anchor should influence tone and possible background sound,
  but the character should not repeatedly narrate or explain it unless the
  conversation naturally calls for it.
- Call transcript review should separate action/stage cues from spoken language:
  action cues render without their outer parentheses as small neutral secondary
  text outside the speech bubble, while actual spoken text remains inside the
  bubble.
- Returning to normal chat after a call should show a keepsake line selected
  from the whole call transcript, not blindly the first sentence of the final
  assistant turn.
- Keepsake selection should prefer clean, emotionally or contextually meaningful
  spoken sentences and ignore system labels, voice tags, and action-only cues.

## Narrative Experience Boundaries

- Mainline plot, date/meeting scenes, IF lines, guidebook play, special events,
  phone evidence, TRPG, and city simulation must not all write into memory with
  the same meaning.
- A future `咨询台` should be a story-seed approval surface. It should emit
  pending narrative directives after user approval, not chat messages or
  character-phone evidence.
- `查手机` must stay a character-phone evidence surface. It should not be reused
  as the consultation desk because generated records can be interpreted as facts
  already present on the character's phone.
- A user-approved new plot expansion should become a pending directive for
  `剧情推演 / 小说生成` before it becomes a lived memory.
- Pending mainline directives are not memories yet. They may guide a future
  Novel/Date play session, but the character should not treat them as already
  happened until the user plays and archives them.
- IF-line material must stay out of the main memory vault. It may be delivered
  as a character dream, wrong-route echo, creative branch residue, or
  subconscious image.
- `见面` is the preferred low-pressure embodied play surface for daily
  date/meeting experiences: visits, meals, walks, light roleplay, and
  relationship warmth. It may read relationship memory, but must not
  spontaneously escalate into mainline crisis, NPC death, or irreversible plot
  turns.
- `见面` prompt rules and selection UI should stay modular: prompt boundaries in
  `utils/dateExperience.ts`, reusable selection UI under `components/date/`.
- `见面` selection filters may expose “显示全部 / 只看链接”, but text toggles
  must live inside the content/scope notice rather than the centered header
  right slot, because that slot is sized for compact icons.
- `见面` auto-save may persist the current scene on timer, background, refresh,
  or React unmount, but it must not call the parent exit/navigation path.
  Showing “进度已保存” and returning to selection should happen only after the
  explicit “保存并退出” action.
- `见面` should default to an embodied visual-scene player rather than a
  question-answer text page: the user first sees the character "present" in the
  scene, then approaches, then advances short scene beats.
- If a character has no dedicated date portrait or generated background, `见面`
  must still avoid black empty screens by using an avatar-based presence card,
  blurred color mood, and nameplate fallback. Generating per-character back
  views should remain optional, not a requirement for self-insert/original
  character players.
- The fallback presence mood should respond to virtual time with distinct
  dawn/day/dusk/night light, so custom characters without backgrounds do not
  feel trapped in one permanent night palette.
- Reusable built-in date backdrops live under
  `public/assets/aetheros/date-backgrounds/`. When no character-specific
  `dateBackground` is set, `见面` should use the virtual-time-matched built-in
  backdrop as the default sprite grounding layer; manually uploaded or selected
  backgrounds override the automatic backdrop.
- In visual-scene mode, narration/action/environment lines should render as
  transient floating text over the scene, while quoted speech belongs in the
  bottom dialogue box. The long-text page is a reading/record mode, not the
  primary interaction mode.
- Visual-scene mode should reserve three safe zones: a lowered compact top
  control row, a high presence/sprite zone, and a bottom text/input zone.
  Avatar-only fallbacks should sit around 44-46% of screen height rather than
  on the bottom edge, so long scene text and the input bar do not cover the
  character marker.
- Scene text cards should be bounded overlays, not unlimited prose panels. When
  the input bar is open, narration/dialogue cards move upward and cap their
  height; the input bar itself should stay compact enough not to dominate the
  visual scene.
- When the current visual-scene dialogue batch reaches its final beat, the UI
  should invite the user back in by opening the input composer instead of
  replaying the batch or showing a subtle toast that can be missed.
- Novel/record reading mode must keep a real top gutter and fade/scrim under
  floating controls, so scrolling text never sits visibly underneath the
  toolbar.
- The `见面` waiting card should not show the generated opening text, because
  that text is replayed in the visual scene after the user approaches. While
  generation is pending, the card should keep a short immersive status line and
  a subtle full-width moving light strip; after generation, it should only tell
  the user the scene is ready. Waiting/ready copy should rotate among several
  short, human-feeling lines rather than using one fixed system-sounding phrase.
- `savedDateState` is a single resumable unfinished progress slot per
  character. `见面记录` is not limited to that slot: it is reconstructed from
  persisted `source="date"` messages, split by opening markers and time gaps.
- `见面记录` should render as a compact record list first. Cards may show date,
  sentence count, favorite state, and a short excerpt, but full prose belongs in
  a drill-in detail page so long and short records do not stretch the list.
- `见面记录` detail pages must preserve readable message structure: assistant
  content should keep generated line breaks/scene beats, user actions should
  stay visually separated, and only parser tags such as `[normal]` should be
  hidden from display.
- `见面全文` speaker identity should follow the stored message role first.
  Quoted lines inside assistant/date messages are character speech and should
  render on the character side. User/date messages remain user-side even when
  they contain quotes, parentheses, or loose text such as `（动作）文字`.
- In the long-text reading page, management selection should use the visible
  segment/paragraph as its unit, not the raw database message as its unit. If a
  user deletes only some assistant segments, the app should update that
  message's content; only fully selected or user-message units should delete the
  whole message record.
- `见面记录` list cards should expose favorite and delete actions. Deleting a
  record deletes the whole date-message session; deleting the newest session may
  also clear that character's unfinished `savedDateState` to prevent test scraps
  from reappearing as resumable progress.
- Heavy plot, long timeline continuity, and mainline pressure should move to a
  future `世界旅行` / plot-travel surface that emits timeline summaries for the
  narrative DM.
- `攻略本` should remain character-private user-understanding material. It can
  improve character tone and relationship handling, but it should not
  automatically become world/canon fact.
- `特别时光` should remain a keepsake-event capsule tied to calendar/timebook
  nodes such as birthdays, holidays, anniversaries, first meetings, saved
  places, and user story preferences. It should eventually be initiated by the
  character as a themed invitation. It can be promoted to 时光簿 or a future
  plot hook only after user action.
- `特别时光` prompt rules and lobby UI should stay modular: shared keepsake
  boundaries in `utils/specialMoments.ts`, reusable lobby/event/delete UI under
  `components/special-moments/`.
- `TRPG` and `都市人生` are useful references for action logs, options, NPC
  feeds, and summaries, but they should stay HOLD for mainline/IF routing until
  their archive paths can respect narrative memory policy.

## User Persona Masks And Progress Bundles

- The personal profile must support multiple user persona masks so a player can
  keep non-hunter self-insert, hunter self-insert, canon protagonist, or other
  route identities in parallel.
- The personal profile should use a two-page mask flow:
  - the list page creates, switches, and deletes masks;
  - the detail page edits a single mask and only persists changes after an
    explicit save action.
- Each mask row should show enough switching context: mask label, user name,
  recent-use time, and linked character avatars/names.
- A persona mask owns the mask-bound user fields: name, avatar, avatar frame,
  call portrait, bio/self-setting, DeepSpace identity mode, and DeepSpace
  identity note.
- A persona mask may also keep `linkedCharacterIds` as a lightweight relationship
  marker for future route-scoped story/date/social filtering.
- Linked characters define the active relationship network for the current mask.
  They should focus experience surfaces, not delete or permanently hide the
  global character library.
- Contact/directory surfaces should keep all characters reachable, with linked
  characters shown first and unlinked characters available for adding to the
  mask.
- Experience/generation surfaces should default to linked characters only when
  the active mask has links. This includes Social, Date, Call, future StoryDesk,
  Novel route directives, Guidebook, and special-event selection.
- If the active mask has no linked characters, experience surfaces should fall
  back to all characters and guide the user to establish links rather than
  showing an empty page.
- Prompted generation must not let unlinked characters post, reply, or appear as
  current familiar/romance-network members. They may still exist as public
  background people when a worldbook or user explicitly mentions them.
- New route surfaces must use the shared `personaRouteScope` helper rather than
  hand-written `linkedCharacterIds` checks, so directory/contact pages,
  experience pickers, and prompt pools keep the same behavior.
- Current connected surfaces: Social participant generation, Character
  directory sorting/linking, Date role picker, Call role picker, and GroupChat
  member creation.
- The identity mode list must include a non-DeepSpace option for fully custom
  worlds and imported original character cards. In that mode, prompt context
  must not force DeepSpace hunter, canon protagonist, aether core, or original
  relationship assumptions.
- The currently active mask must be mirrored onto the legacy top-level
  `userProfile` fields so existing chat, call, date, guidebook, social, and
  prompt paths naturally see the active identity before they become
  bundle-aware.
- Each persona mask should own a progress bundle ID. Future plot, IF, date,
  social, timebook, guidebook, and special-event records should attach to this
  bundle when they represent route-specific progress.
- Device/app settings, API keys, global themes, study material, and the
  worldbook library remain shared by default.
- TRPG and LifeSim remain HOLD for bundle routing until their archive and world
  models can respect narrative memory policy.
- Switching masks must not delete, rewrite, or silently migrate existing chat
  history or memories. Per-surface filtering should be added explicitly in later
  slices.
- Backup/export must preserve the full mask-aware `UserProfile`, including
  DeepSpace identity fields, persona masks, and progress bundles.

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

## History Import Fast Reconnect

- History import is a transport path, not a mandatory memory-analysis wizard.
  After relationship and file selection, a user must be able to archive the
  source and continue chatting without classifying every fragment.
- Explicit `user:`, `assistant:`, and `char:` markers are strong turn boundaries even
  when multiple turns share one Word paragraph. A literal marker inside an
  already-started message line remains message content.
- Empty paragraphs and orphan timestamp metadata must not become records
  or block completion. Every other non-empty unresolved fragment must be kept
  as source evidence for later organization.
- `user` and `assistant/char` labels are export-author channels mapped to the
  selected mask and character for transport. They are not claims about which
  in-world actor spoke inside a co-authored roleplay turn. Unknown labels remain
  neutral source fragments and must never be silently assigned.
- Import must preserve source timestamps as evidence. Virtual-world date/time
  conversion is a later interpretation node and must not rewrite transport-time
  source data.
- Companion, roleplay, OOC, and plot are not import choices. The transport layer
  must not define, infer, or persist those categories.
- Unresolved non-empty evidence must remain visible and keyword-searchable in
  Dialogue Calendar with the neutral label `原文片段`.
- Calendar AI may persist only a held source request containing scope, source
  document ids, source revision fingerprint, and the requested question. It
  must not call a model or define output categories until module-fit auditing is
  complete.
- Raw history is medium-neutral. Chat may use a bounded historical tail while
  staying remote text; Date must not auto-read that tail or resume historical
  actions, positions, environments, or stage direction.
- The v2 intake, archive, and daily-archive databases are clean breaks. No
  pre-product review-workspace reader, compatibility field, or migration is
  permitted.
