# AetherOS Public Sticker Schema

## Shell Chrome And Virtual World Clock

The global appearance preference is intentionally separate from relationship
world facts:

```ts
type ShellChromeMode = 'simulated_phone' | 'software' | 'virtual_city';

interface OSTheme {
  shellChromeMode?: ShellChromeMode;
  /** deprecated migration input only */
  hideStatusBar?: boolean;
}
```

`software` is the new-config default. `simulated_phone` restores the former
reality clock / Wi-Fi / battery presentation without changing any record time.
A `virtual_city` request renders only when the active relationship resolves to a
valid scoped config; otherwise it fails closed to software chrome.

Legacy migration preserves user intent:

```text
hideStatusBar=true   -> software
hideStatusBar=false  -> simulated_phone
legacy field omitted -> simulated_phone (the former visible default)
```

Virtual-city config lives in the existing local `assets` store:

```text
virtual_world_clock_v1:${progressBundleId}:${personaMaskId}
```

```ts
interface VirtualWorldClockConfigV1 {
  version: 1;
  progressBundleId: string;
  personaMaskId: string;
  locationLabel: string;
  eraLabel?: string;
  timeZoneMode: 'iana' | 'fixed_offset';
  timeZoneId?: string;
  utcOffsetMinutes?: number; // -840..840
  yearOffset: number;        // display only, -3000..3000
  weatherMode: 'manual' | 'seasonal_sim';
  weather: {
    condition: string;
    temperatureLabel?: string;
    icon?: string;
  };
  updatedAt: number;         // config metadata, not world/message time
}
```

The active scope is valid only when the selected persona mask points to the
selected progress bundle and that bundle points back to the same mask.

Consumers receive a projection rather than mutable story state:

```ts
interface VirtualWorldContext {
  source: 'virtual_world_clock_v1';
  readOnly: true;
  scope: { progressBundleId: string; personaMaskId: string };
  storageKey: string;
  locationLabel: string;
  eraLabel?: string;
  clock: {
    year: number; month: number; day: number; weekday: string;
    hour: number; minute: number; dateLabel: string; timeLabel: string;
  };
  weather: {
    source: 'manual' | 'seasonal_sim';
    condition: string; temperatureLabel?: string; icon?: string;
  };
}
```

This context has no message timestamp field and is not a persistence shape for
history, daily archives, current story state, tasks, receipts, buffs, or memory.

## Shared Appearance Preset File

Appearance exchange uses one versioned file envelope rather than assigning
untrusted JSON directly into `OSTheme`:

```ts
interface AppearancePresetFileV1 {
  type: 'aether_appearance_preset';
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  theme: OSTheme;
  customIcons?: Record<string, string>;
  chatThemes?: ChatTheme[];
  chatLayout?: ChatLayoutPreset; // legacy compatibility input
}
```

Import validates the envelope and complete core theme before it adds a fresh
local preset ID. It allowlists current shell/chat/desktop fields, sanitizes
custom icons/decorations/chat themes, maps bounded legacy `chatLayout` values,
and ignores unknown injected theme keys. Import does not activate the preset;
the existing explicit `应用` action owns that local state change. The legacy
`hideStatusBar` input remains migration-only and is normalized by the shell
chrome migration when the preset is applied.

## User DeepSpace Identity

`UserProfile` may persist a structured DeepSpace identity mode in addition to
free-form `bio`:

```ts
type UserDeepSpaceIdentityMode =
  | 'custom_non_hunter'
  | 'custom_hunter'
  | 'canon_hunter';

interface UserProfile {
  name: string;
  avatar: string;
  avatarFramePresetId?: string;
  callPortrait?: string;
  bio: string;
  deepspaceIdentityMode?: UserDeepSpaceIdentityMode;
  deepspaceIdentityNote?: string;
}
```

Missing `deepspaceIdentityMode` resolves to `custom_non_hunter`. This mode means
the app must not automatically treat the user as the original protagonist,
Lingkong hunter, Zhang Su's granddaughter, Caleb's sister, Zayne's childhood
friend/patient, or an aether-core vessel.

This is a role-default guard, not an appearance ban. DeepSpace canon characters
and NPCs may still exist in the world and enter the user's relationship network
through explicit user settings, current plot, mounted worldbooks, encounters, or
gradual roleplay development.

## Timebook And Companion Planning

Current persisted relationship-date shape:

```ts
interface Anniversary {
  id: string;
  title: string;
  date: string;
  charId: string;
  aiThought?: string;
  lastThoughtGeneratedAt?: number;
}
```

`Anniversary.aiThought` is treated as a stable keepsake paragraph. It should be
generated when a memory row is opened and the field is missing, not refreshed
automatically on a timer.

The current visible `时光簿` filters rows by the global active character id. That
id is also changed by the `见面` character selection flow, so the timebook follows
the character the user most recently chose to meet.

When a selected character has no saved `Anniversary` rows, the UI may render a
virtual first-meeting row from built-in copy. This row is display-only and is not
persisted to the `anniversaries` store.

The first-meeting anchor is stored separately from anniversaries in the generic
`assets` store:

```ts
type FirstContactSetting = {
  title: string;
  date: string;
  note: string;
  source: 'inferred' | 'manual' | 'ai_assisted';
  updatedAt?: number;
}
```

Asset key format:

```text
timebook_first_contact_${charId}
```

## Study Room

Current persisted study-course shape:

```ts
interface StudyChapter {
  id: string;
  title: string;
  summary: string;
  difficulty: 'easy' | 'normal' | 'hard';
  isCompleted: boolean;
  rawContentRange?: { start: number; end: number };
  content?: string;
}

interface StudyCourse {
  id: string;
  title: string;
  rawText: string;
  chapters: StudyChapter[];
  currentChapterIndex: number;
  createdAt: number;
  coverStyle: string;
  totalProgress: number;
  preference?: string;
}
```

`StudyChapter.rawContentRange` is the local source anchor for chapter teaching.
It is currently generated from proportional PDF text ranges, but it is the field
future co-reading imports can replace with real chapter or segment boundaries.

Study settings are still browser-local:

```text
localStorage.study_api_config
localStorage.study_tutor_presets
```

Future co-reading should add a sibling reading/book model instead of overloading
`StudyCourse`. The AsherieSystem mobile reference keeps reading context
structured as shelf/current-book/current-chapter metadata rather than prepending
it to user-authored chat text.

If no asset exists, `时光簿` infers the first-contact date from the selected
character's earliest imported anniversary, then earliest message, then today.
Once a user saves a first-contact asset, that manual relationship anchor wins
over later imported anniversaries. AI-assisted note filling is explicit and
stores back into this same asset only after the user saves.

Existing `Task` rows remain in IndexedDB for compatibility, but the visible
`时光簿` app no longer owns task UI or task completion logic. The standalone
`同行计划` surface owns stage goals and progress checks.

Extended companion-plan task shape:

```ts
interface Task {
  id: string;
  title: string;
  supervisorId: string;
  tone: 'gentle' | 'strict' | 'tsundere';
  deadline?: string;
  isCompleted: boolean;
  completedAt?: number;
  createdAt: number;
  kind?: 'legacy' | 'companion_plan';
  description?: string;
  target?: string;
  cadence?: 'daily' | 'weekly' | 'flex';
  checkIns?: CompanionPlanCheckIn[];
  milestoneNote?: string;
  milestoneGeneratedAt?: number;
  lastCheckInAt?: number;
}

interface CompanionPlanCheckIn {
  id: string;
  at: number;
  status: 'done' | 'stalled' | 'adjusted';
  note?: string;
}
```

Legacy task rows without `kind` should be displayed by `同行计划` so old local
data is not orphaned.

Future retrievable relationship-memory rows can be introduced as
`timebook_entries` beside the existing `anniversaries` store. See
`docs/TIMEBOOK_CONTEXT_PLAN.md` for the proposed entry shape and retrieval
contract.

Context delivery rule:

- `ContextBuilder.buildCoreContext()` stays synchronous and DB-free.
- Future timebook delivery should use an async selector such as
  `selectTimebookContext()` before chat prompt assembly.
- The selector should return a tiny markdown block, not raw full history.

## Worldline Memory Core

The first worldline-memory slice is code-only and read-only. It introduces
shared TypeScript contracts under `utils/memoryCore/` without adding new
IndexedDB stores yet.

`docs/MEMORY_DELIVERY_CONTRACT.md` is the current product/code contract for how
AI-facing surfaces should combine stable base context, character voice,
short-lived worldline state, relationship memory, calendar state, and story
material. The contract is intentionally written before the next code slice so
new features can be checked against the same delivery map instead of adding
surface-specific prompt shortcuts.

Current core enums:

```ts
type MemoryOrigin =
  | 'daily_chat'
  | 'meet_scene'
  | 'canon_story'
  | 'date_scene'
  | 'calendar'
  | 'timebook'
  | 'diary'
  | 'proactive_letter'
  | 'system_import';

type ContinuityScope = 'canon' | 'relationship' | 'branch' | 'scene_only';

type KnowledgeScope =
  | 'char_private'
  | 'user_private'
  | 'shared'
  | 'unknown_to_char'
  | 'unknown_to_user';

type MemoryStatus = 'draft' | 'soft_canon' | 'confirmed' | 'archived' | 'discarded';
```

First selector:

```ts
selectWorldlineMemoryContext({
  char,
  user,
  mode: 'remote_chat' | 'meet_scene' | 'date_scene' | 'proactive_letter' | 'timebook',
  currentMessages,
  query,
  budgetChars,
})
```

Group chat uses the selector as a per-member prompt supplement, not as a shared
group memory blob. The AI director should build each member's base context with
`ContextBuilder.buildCoreContext(member, userProfile, true)`, then append a
budgeted `selectWorldlineMemoryContext()` result for that same member. The
selector receives the member's recent private messages as `currentMessages` and
the recent group topic as `query`, so private relationship memory can shape how
the character acts in public without being exposed as a literal transcript.

The selector currently reuses:

- `messages` for recent intersections and open threads.
- `anniversaries` for confirmed shared dates.
- `assets/timebook_first_contact_${charId}` for the first-contact anchor.
- a tiny recent slice of `char.memories` for role-private remembered moments.

It returns a tiny markdown block plus structured candidates. Future durable
stores can be added later after UI and prompt behavior are stable:

Future character voice imports should keep three voice-line classes separate:

```ts
type VoiceLineKind =
  | 'direct_message'
  | 'rewrite_seed'
  | 'language_fingerprint';

interface CharacterVoiceLine {
  id: string;
  charId: string;
  kind: VoiceLineKind;
  text: string;
  tags?: string[];
  source?: 'user_import' | 'built_in' | 'manual';
  createdAt: number;
  updatedAt: number;
}
```

`direct_message` rows can feed proactive-letter direct mode. `rewrite_seed`
rows guide model-written messages or scenes. `language_fingerprint` rows should
not be sent as quotes; they are compact role-voice calibration notes covering
habits, boundaries, care style, humor, attitude, and non-negotiable personality
points. Current code reads this from `assets/aetheros_voice_core_${charId}` and
also accepts `assets/character_voice_core_${charId}` as a compatibility key.

Future hot-state rows should be short-lived and per character:

```ts
interface WorldlineHotState {
  charId: string;
  currentWhereabouts?: string;
  currentMood?: string;
  currentPressure?: string;
  activeThreads: string[];
  storySignals: string[];
  pendingCare: string[];
  recentlyMentionedPeople?: string[];
  sourceRefs?: Array<{ kind: string; id: string }>;
  updatedAt: number;
  expiresAt?: number;
}
```

Hot state is not a keepsake memory. It is the "what is going on with him
lately" packet for chat, proactive letters, calls, meeting scenes, and social
surfaces. Current code reads this from `assets/aetheros_worldline_hot_state_${charId}`
and also accepts `assets/worldline_hot_state_${charId}` as a compatibility key.
If no saved hot state exists, the selector derives a tiny temporary state from
recent promises, phone/date echoes, and care signals.

The first visibility layer uses localStorage only and does not bump IndexedDB:

```ts
interface WorldlineMemoryReceipt {
  id: string;
  at: number;
  charId: string;
  charName: string;
  mode: 'remote_chat' | 'meet_scene' | 'date_scene' | 'proactive_letter' | 'timebook';
  origin: MemoryOrigin;
  delivered: boolean;
  candidateCount: number;
  openThreadCount: number;
  candidateTitles: string[];
  openThreadTitles: string[];
  markdownPreview: string;
  budgetChars: number;
  warnings: string[];
}
```

Receipts are stored under
`aetheros_worldline_memory_receipts_v1` and are capped locally. They prove that
context was selected and delivered to prompt assembly; they are not durable
relationship facts.

The first automatic sediment layer also uses localStorage bookkeeping and
existing stores, so it does not bump IndexedDB yet:

```ts
type AutoMemoryDailyMode = 'off' | 'auto' | 'manual';
type AutoTimebookCandidateMode = 'silent' | 'off';

interface AutoMemorySettings {
  dailyChatMode: AutoMemoryDailyMode;
  timebookCandidateMode: AutoTimebookCandidateMode;
  keepTrivialMoments: boolean;
  minMessagesPerDailyMemory: number;
  quietMinutesBeforeTodayArchive: number;
}

interface AutoMemoryLedgerEntry {
  id: string;
  at: number;
  charId: string;
  charName: string;
  kind: 'daily_chat' | 'timebook_candidate';
  status: 'saved' | 'skipped' | 'failed';
  title: string;
  summary?: string;
  sourceDate?: string;
  messageCount?: number;
  targetId?: string;
  reason?: string;
  trigger: 'auto' | 'manual';
}
```

MemoryDM uses localStorage for scheduling and the existing `assets` store for
candidate records. It deliberately reuses the foreground chat API instead of
introducing a second memory API config.

```ts
interface MemoryDMSettings {
  enabled: boolean;
  turnsPerPass: number;
  idleHoursBeforePass: number;
  idlePassEnabled: boolean;
  autoApplyCharacterMemories: boolean;
  autoApplyTimebookNodes: boolean;
  autoApplyCalendarReminders: boolean;
}

type MemoryDMCandidateKind =
  | 'character_memory'
  | 'timebook_node'
  | 'calendar_reminder'
  | 'relationship_impression'
  | 'story_seed'
  | 'discard';

interface MemoryDMCandidate {
  id: string;
  kind: MemoryDMCandidateKind;
  title: string;
  summary: string;
  date?: string;
  mood?: string;
  confidence?: number;
  sourceMessageIds?: number[];
  tags?: string[];
}
```

`turnsPerPass` defaults to `60` and is clamped to `20-100` in sparse `20`-turn
steps in Settings. Legacy local values below `20` are treated as the new default
instead of preserving the old dense 12/16/24-turn behavior.

MemoryDM storage keys:

```text
aetheros_memory_dm_settings_v1
aetheros_memory_dm_cursor_v1
assets/memory_dm_candidate_records_v1
```

Applied `calendar_reminder` candidates reuse the existing `companion_wakeups`
store instead of adding a separate calendar table:

```ts
interface CompanionWakeupRule {
  source?: 'user' | 'built_in' | 'ai_calendar' | 'migration';
  priority?: 'heartbeat' | 'care' | 'calendar';
  repeat: 'once' | 'daily';
  targetDate?: string; // YYYY-MM-DD for one-time reminders
  windowStart: string;
  windowEnd: string;
}
```

Storage keys:

```text
aetheros_auto_memory_settings_v1
aetheros_auto_memory_cursor_v1
aetheros_auto_memory_ledger_v1
```

Current write targets:

- local transcript-spliced daily chat sediment is disabled. `dailyChatMode` is
  forced to `off` as a compatibility field for older local settings, and the
  current automatic pass does not write `auto_daily` memory rows;
- silent `时光簿` candidates write ordinary `Anniversary` rows into the existing
  `anniversaries` store;
- `keepTrivialMoments` is forced to `false` for now. The current timebook writer
  only keeps rows that match stronger signals such as first time, appointment,
  gift, meal, illness, meeting, missing-you, or reminders;
- small affectionate everyday observations should be handled by future
  `char.memories` automation after prompt and duplicate-policy review, not by
  the timebook writer;
- `char.impression` is visible as `关系印象` and is not auto-written by this layer.

```ts
interface WorldlineMemoryEvent {
  id: string;
  charId: string;
  userId?: string;
  origin: MemoryOrigin;
  continuity: ContinuityScope;
  knowledge: KnowledgeScope;
  status: MemoryStatus;
  title: string;
  summary: string;
  happenedAt?: string;
  branchId?: string;
  sourceRefs?: SourceRef[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}
```

## Social Moments Reply Contract

Persisted user `朋友圈` rows use the existing `SocialPost` store and add a
lightweight reply queue. This does not require an IndexedDB version bump because
the fields live on the stored object:

```ts
{
  kind: 'moment';
  sourceType: 'user';
  replyState: 'none' | 'pending' | 'generated';
  replyDueAt?: number;
  replyAudienceCharIds?: string[];
  replyRemainingCharIds?: string[];
  replyLastGeneratedAt?: number;
}
```

`replyAudienceCharIds` records the eligible activated characters selected when
the user publishes the post. `replyRemainingCharIds` is consumed one character
at a time. Each successful generated reply appends a `SocialComment` with
`charId`, updates `replyLastGeneratedAt`, and schedules the next `replyDueAt`
when more eligible characters remain.

The social participant pool is scoped by the active character's worldbooks. If
the active built-in male lead has not mounted the five-lead crossover package,
other built-in male leads are excluded from post, comment, and delayed-reply
generation. Related native NPCs and plot-added NPCs may still appear as NPC
commenters, but they are not treated as installed male-lead accounts.

## Social News Generation Contract

Persisted social rows continue to use `SocialPost`. News rows are identified by:

```ts
{
  kind: 'news';
  sourceType: 'news';
  newsCategory: 'mainline' | 'sidequest' | 'date' | 'daily';
  newsChannel: string;
  storyLineStatus: 'candidate' | 'active' | 'closed' | 'archived';
  storySeedStatus: 'candidate' | 'adopted';
}
```

Long-form channels are `野史不歪`, `诡秘谈`, `恋爱出走指南`, and
`两个人的地图`. Their acceptance gate is:

```text
content.replace(/\s/g, '').length >= 500
```

The first generation call returns 5-6 complete media rows. Only long-form rows
below the gate enter one bounded repair call. Repair rows bind back to their
original batch position through `repairIndex`; the repair may replace `content`
but does not change category, channel, title, or the candidate-truth boundary.
Rows still below the gate after repair are not persisted.

The browser-local placeholder-dismissal key is:

```text
aetheros_social_demo_dismissed_tabs_v1
```

It contains `moments` and/or `news`. Clearing news deletes only news rows from
the existing `social_posts` IndexedDB store and records `news` in this key so
demo rows do not reappear after reload.

## Chat Appearance Theme

`OSTheme.chatAppearancePreset` controls the high-level chat appearance contract.
`OSTheme.chatBubbleStyle` has a separate `deep-space` variant so the default
deep-space bubble can keep its avatar-facing upper sharp corner without reusing
the WeChat side-tail renderer.

Current values:

```text
deep-space
minimal
wechat
custom
```

`deep-space` resolves to the fixed concentrated chat layout, circular avatars, white character
bubbles, light-yellow user bubbles, and a sharp upper bubble corner facing the
avatar. It must not render a side tail or side arrow.

Visible theme cards should stay limited to `深空`, `极简`, `微信`, and `自定义`.
Only `custom` should enable granular free-form bubble geometry controls.

`minimal` replaces the earlier `月白` direction and uses soft rectangular
iMessage-like bubbles. `wechat` uses low-radius square bubbles, green user
bubbles, and plain white character bubbles.

The `custom` preset is the only preset that opens the bubble adjustment child
editor. Avatar frame/accessory controls are separate from bubble adjustment.

The default `ChatTheme` entry is named `深空` and supplies the bubble colors used
by the deep-space chat appearance.

## Dialog Visual Rules

Shared avatar-and-bubble dialogue sizing lives in:

```text
components/chat/dialogVisualRules.ts
```

Current baseline tokens:

```ts
avatarSizePx = 40
bubbleMaxWidth = '74%'
bubbleText = '14px / 1.5'
avatarBubbleGap = '10px'
rowGutter = '16px'
metadata = '10px speaker name / 9px timestamp'
```

One-to-one chat and group chat should consume these tokens instead of inventing
separate avatar, bubble, and body-text scales. Future plot-simulation long-text
pages that use avatar + bubble narration should also start from these tokens and
only add paragraph spacing or card chrome when needed.

## Call Transcript Utilities

Shared phone-call transcript cleanup lives in:

```text
utils/callTranscript.ts
```

It owns:

- stripping exact system record labels such as `（通话记录）`;
- splitting call text into `speech` and `cue` parts for review UI rendering;
- extracting speech-only text for future call context;
- selecting a clean keepsake line from the full call transcript for the
  post-call chat card.

Call history, in-call display, and the normal-chat call summary card should use
these utilities instead of rendering raw assistant text directly.

Phone-call end messages use `metadata.source = 'call-end-popup'`. Their metadata
may include:

```ts
callScene?: string
keepsakeLine?: string
durationSec?: number
turnCount?: number
```

`callScene` is the per-session opening scene anchor. It is generated separately
from dialogue, displayed as a small "所在" chip during the call, and persisted
into call history. It should not be injected as visible spoken text.

## Narrative Experience Directives

Narrative boundaries are declared in:

```text
utils/narrativeBoundaries.ts
```

The shared type is:

```ts
type NarrativeSurfaceId =
  | "consult_desk"
  | "novel"
  | "date"
  | "guidebook"
  | "special_moments"
  | "check_phone"
  | "game"
  | "lifesim"
  | "timebook"
  | "chat"
  | "social_feed";

type NarrativeLane =
  | "mainline"
  | "pending_mainline"
  | "if_line"
  | "date_experience"
  | "keepsake_event"
  | "user_insight"
  | "supporting_evidence"
  | "sandbox"
  | "draft";

type NarrativeMemoryPolicy =
  | "main_vault"
  | "manual_promotion"
  | "relationship_echo"
  | "character_private"
  | "dream_material"
  | "excluded_from_main_vault"
  | "local_keepsake"
  | "system_trace";
```

`NarrativeDirective` is the planned bridge between consultation/story seeds and
playable plot generation:

```ts
interface NarrativeDirective {
  id: string;
  title: string;
  summary: string;
  lane: NarrativeLane;
  status: "pending" | "activated" | "played" | "archived" | "discarded";
  sourceSurface: NarrativeSurfaceId;
  targetSurface?: NarrativeSurfaceId;
  charIds: string[];
  npcNames?: string[];
  tags?: string[];
  constraints?: string[];
  activationHint?: string;
  memoryPolicy: NarrativeMemoryPolicy;
  sourceRefs?: { surface: NarrativeSurfaceId; id?: string; label?: string }[];
  createdAt: number;
  updatedAt: number;
  playedAt?: number;
  dreamDelivery?: {
    charId: string;
    tone?: "soft" | "uneasy" | "romantic" | "ominous" | "playful";
    instruction: string;
    deliveredAt?: number;
  };
}
```

`NovelBook` may carry optional directives:

```ts
interface NovelBook {
  // existing fields...
  directives?: NarrativeDirective[];
}
```

Compatibility:

- No IndexedDB migration is required for this first slice because
  `NovelBook.directives` is optional.
- Existing novel records without `directives` remain valid.
- Future `咨询台` work may either store accepted directives inside a target
  `NovelBook` or add a dedicated object store after the UX is confirmed.
- IF-line directives must use `memoryPolicy: "dream_material"` and must not be
  promoted into `char.memories` or timebook rows without an explicit user
  conversion.

## User Persona Masks

The personal profile is still stored in IndexedDB store `user_profile` under key
`me`, but it now contains optional multi-mask fields.

```ts
interface UserProfile {
  name: string;
  avatar: string;
  avatarFramePresetId?: string;
  callPortrait?: string;
  bio: string;
  deepspaceIdentityMode?: UserDeepSpaceIdentityMode;
  deepspaceIdentityNote?: string;
  activePersonaMaskId?: string;
  activeProgressBundleId?: string;
  personaMasks?: UserPersonaMask[];
  progressBundles?: UserProgressBundle[];
}

interface UserPersonaMask {
  id: string;
  label: string;
  name: string;
  avatar: string;
  avatarFramePresetId?: string;
  callPortrait?: string;
  bio: string;
  deepspaceIdentityMode?: UserDeepSpaceIdentityMode;
  deepspaceIdentityNote?: string;
  linkedCharacterIds?: string[];
  progressBundleId: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

interface UserProgressBundle {
  id: string;
  maskId: string;
  label: string;
  description?: string;
  surfacePolicy: Partial<Record<UserProgressSurface, UserProgressSurfacePolicy>>;
  createdAt: number;
  updatedAt: number;
}
```

Compatibility:

- `utils/userPersonaMasks.ts` normalizes legacy profiles into one default mask.
- The active mask is mirrored onto top-level `UserProfile` fields before prompts
  read it.
- No DB version bump is required because the existing `user_profile` record is
  extended in place.
- Full backup/export must keep the complete `UserProfile`; do not truncate it
  to only `name`, `avatar`, `callPortrait`, and `bio`.
- Future route-specific records should use `activeProgressBundleId` as the
  join key instead of copying the whole mask into each record.
- `lastUsedAt` is display metadata for the mask switcher.
- `linkedCharacterIds` is a lightweight UI/route marker. It does not yet filter
  messages or memories by itself.
- Route surfaces should resolve linked-character behavior through
  `utils/personaRouteScope.ts` rather than open-coding their own filters. This
  keeps directory behavior (`linked first, all reachable`) separate from
  generation behavior (`linked only when links exist`).
- When adding another surface, treat the helper as the boundary contract:
  directory/contact pages may expose all characters after prioritizing links;
  experience/generation pages should use linked-only pools when a mask has links
  and show an explicit all-character escape hatch when useful.
- Current connected surfaces are SocialApp generation, Character directory,
  Date picker, Call picker, and GroupChat member creation.
- `deepspaceIdentityMode: "custom_world"` means the profile is not using a
  DeepSpace default identity frame; prompts should follow imported character
  cards, mounted worldbooks, and local plot facts.

## Catalog

Path:

```text
public/stickers/catalog.json
```

Shape:

```json
{
  "schema": "aetheros.public-emoji-packs.v1",
  "version": "2026-07-01-blank",
  "assetBase": "assets/",
  "packs": [
    {
      "id": "pack-a",
      "name": "a 组表情包",
      "visibilityDefault": "disabled",
      "assetBase": "assets/pack-a/",
      "stickers": []
    }
  ]
}
```

## Sticker Entry

Recommended shape when images are ready:

```json
{
  "sticker_id": "a_001",
  "name": "A组-开心",
  "asset_file": "a_001.png",
  "tags": ["开心"],
  "desc": "简短画面描述",
  "meaning": "适合表达的语气",
  "use_when": ["想轻快回应时"],
  "avoid_when": ["严肃告别时"],
  "status": "active"
}
```

`asset_file` resolves against the pack `assetBase`, so the example above loads:

```text
public/stickers/assets/pack-a/a_001.png
```

## Naming Rules

There are three separate naming layers. Do not collapse them into one name.

### 1. Pack ID

`pack.id` is the stable permission bundle used by browser-local character enablement.

- Use ASCII lowercase kebab-case.
- Keep it stable after release.
- One pack should match one enablement decision, such as a theme series or a character-specific collection.
- Do not put temporary upload dates or image counts into the pack ID.

Examples:

```text
theme-soft-reaction
theme-sleepy-night
char-xavier-daily
char-rikka-private
meme-lab-reaction
```

`pack-a` is only the first placeholder pack. Before a real image batch is published, it can either stay as the stable first pack or be renamed once to a meaningful ID.

### 2. Sticker ID And Asset File

`sticker_id` and `asset_file` are technical stable names.

- Use ASCII lowercase, numbers, and underscores.
- Recommended format: `<pack-short>_<3-digit-number>`.
- `asset_file` should match `sticker_id` plus the final processed extension.
- Do not use Chinese characters, spaces, emojis, or punctuation in file names.

Examples:

```text
soft_001.webp
soft_002.webp
xavier_001.png
rikka_001.webp
```

### 3. Display Name

`name` is the human/AI invocation name. This name appears in the AI prompt and is used by `[[SEND_EMOJI: name]]`.

- Use short Chinese names.
- Keep each name globally unique inside AetherOS, because current IndexedDB stores emojis by `name`.
- Prefer `<短包名>-<情绪/动作>` instead of a bare emotion word.
- Avoid many stickers all named `开心`, `可爱`, or `无语`.

Examples:

```text
软软-探头
软软-委屈
晚安-缩被窝
星回-敲桌
Rikka-冷脸
```

## Tagging Rules

Tags are search/selection hints, not permission controls.

- Theme tags describe visual or emotional series: `软软`, `夜晚`, `吐槽`, `安慰`.
- Character tags describe intended fit: `适合沈星回`, `适合祁煜`.
- Action tags describe visible behavior: `探头`, `挥手`, `抱抱`, `拍桌`.
- Tone tags describe conversational use: `撒娇`, `拒绝`, `鼓励`, `尴尬`.

Character access must still be controlled by pack enablement in the app, not by tags.

## Image Processing Rules

Incoming images may be large, irregular, or not designed as standard stickers. Keep raw files separate from served assets.

- Source images can be placed in an untracked inbox while processing.
- Served assets should live under `public/stickers/assets/<pack-id>/`.
- Prefer `.webp` for ordinary static stickers.
- Keep `.png` when transparency quality matters or webp conversion looks bad.
- Keep `.gif` only for animated stickers that should stay animated.
- Target display assets should normally fit within `512x512` or below.
- Preserve transparent background when it exists.
- Crop only when the subject clearly has empty margins; do not crop away meaningful context.

Processing output should update `asset_file`, `desc`, `meaning`, `tags`, `use_when`, and `avoid_when` in the catalog.

## Browser Storage

Synced public packs are stored in IndexedDB:

- `emoji_categories`
  - `source: "public"`
  - `packId`
  - `visibilityMode: "allowlist"` for default-hidden packs
  - `allowedCharacterIds` controls which local characters can read/select the pack
- `emojis`
  - `source: "public"`
  - `packId`
  - `stickerId`
  - `assetFile`
  - semantic fields copied from the catalog

Chat history and per-character enablement remain local to each browser.

## History Import Parser V3 And Deferred Semantics

`history-preview-v3` adds a logical segmentation layer after TXT/DOCX source
unit extraction:

- a line-start `user:` or `assistant:` marker starts a new logical message;
- following wrapped lines stay attached until the next strong marker;
- a trailing `timestamp:` line becomes source-time metadata for that message;
- empty content and orphan timestamp units normalize to `skipped`;
- non-empty content without a trustworthy label remains `unknown` evidence.

The review workspace may store automatic source-label mappings for `user` and
`assistant`. These mappings are transport hints, not user-confirmed semantic
claims. Import settlement accepts non-empty evidence, excludes skipped/empty
rows, defaults conversation semantics to `unknown`, and preserves source time.

Daily archive search accepts the full `DailyArchiveMessage.role` union. UI
consumers must render `unknown` and `system` explicitly; they must not collapse
every non-character hit into the user label. Voice clipping remains restricted
to positively identified user/character messages until a later Calendar editor
can persist explicit corrections.
