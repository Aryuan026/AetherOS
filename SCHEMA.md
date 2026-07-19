# AetherOS Public Sticker Schema

## Daily Archive Human Curation

Imported and live source rows keep their stable archive ids. Post-import
correction is stored on the next `DailyArchiveMessage.revision`, never in a
second display-only database:

```ts
interface DailyArchiveHumanCuration {
  sourceMessageIds: string[]; // all raw rows represented by a merged bubble
  correctedAt: number;
  authority: 'human_corrected';
}

interface DailyArchiveManualEntry {
  status: 'draft' | 'confirmed';
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
}

interface DailyArchiveDayConfirmation {
  status: 'open' | 'confirmed';
  revision: number;
  updatedAt: number;
  confirmedAt?: number;
  activeMessageCount: number;
  manualEntryCount: number;
}
```

Content, export-channel role, date, merge, and delete operations
all preserve `sourceRecordId`. Moving a message writes a higher-revision
tombstone to the old bucket and an active projection with the same stable id to
the target day. Therefore a later raw-history sync at revision 1 cannot revive
the old date or overwrite the corrected projection. Empty visible day buckets
remain internally available for tombstone protection but are excluded from
calendar and coverage projections.

`merge_and_set_date` tombstones every selected source row and writes one merged
active row to the target date in the same IndexedDB transaction. The receipt
returns the destination date, stable primary message id, and destination offset
so the UI can jump to the saved result.

Manual supplements use `source: 'manual_entry'` and start as `draft`. Locking a
dated document confirms the whole visible day and promotes its active manual
entries to `confirmed`; unlocking returns them to drafts. Only
`listConfirmedManualDailyArchiveMessages()` exposes them to future retrieval
adapters. Imported Word/TXT source rows are never mutated. A day lock does not
change `temporalClass`, establish real-world truth, update current state, or
authorize direct memory writes. The clean schema uses
`AetherOS_DailyArchive:v3` and backup format `aetheros-daily-json-v2`.

## Worldbook Group Projection

Worldbook grouping reuses the existing `Worldbook.category` field. There is no
separate group store and no database migration:

```ts
interface WorldbookGroupProjection {
  category: string;
  books: Worldbook[];
}
```

At read time, every category is trimmed and blank values normalize to
`未分类设定 (General)`. The UI builds two independent projections:

```text
built-in groups = books where isBuiltIn || lockEditing
custom groups   = all remaining books
```

Category text is not an authority boundary. A custom book named under
`深空世界书` remains custom and editable; it must never inherit read-only status
from that label. Existing character mounts, local persistence and backup files
continue to store ordinary `Worldbook` records, so grouping is a presentation
and selection contract rather than a second source of truth.

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

## Launcher Layout

Desktop projection is a small versioned field inside `OSTheme`, so appearance
presets and full backups use the same source of truth:

```ts
interface LauncherLayoutV1 {
  version: 1;
  appOrder: AppID[];      // non-Dock launcher order
  dockAppIds: AppID[];    // Dock order
  hiddenAppIds: AppID[];  // installed but not projected
}

interface OSTheme {
  launcherLayout?: LauncherLayoutV1;
}
```

Normalization resolves all ids against current `INSTALLED_APPS`. Unknown and
duplicate ids are discarded. Missing current grid/Dock ids are appended from
the current defaults, which makes newly shipped apps visible even when the
saved layout predates them. `settings` is removed from `hiddenAppIds` and added
back to the Dock when absent.

`LAUNCHER_APP_GROUPS` contributes only the default `appOrder`. Runtime pages
chunk the normalized visible order directly and do not reconstruct product
groups. Missing `launcherLayout` means current defaults for normal rendering;
when an old appearance preset omits the field, partial theme application keeps
the recipient's existing layout.

Launcher and Appearance consume the same `paginateLauncherAppIds` projection
(`8` visible Apps per page). The current catalog is derived from
`INSTALLED_APPS`; ids added there but absent from an older saved layout are
appended visibly without changing the Appearance component.
The final `WidgetsPage` remains fixed outside this App-page projection.

Imported appearance JSON accepts only nested layout version `1`, sanitizes it
through the same normalizer, and ignores invalid/unknown nested contracts. No
separate launcher localStorage key exists.

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
  | 'relationship_private'
  | 'shared'
  | 'public_safe'
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
  surface,
  relationshipScope: { progressBundleId, personaMaskId, charId },
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
the recent group topic as `query`. Imported-history delivery is stricter:
Group Chat may receive only `shared` or `public_safe` confirmed candidates;
private relationship evidence is not opened for a public group prompt.

The selector currently reuses:

- `messages` for recent intersections and open threads.
- `anniversaries` for confirmed shared dates.
- `assets/timebook_first_contact_${charId}` for the first-contact anchor.
- a tiny recent slice of `char.memories` for role-private remembered moments.
- resolved `AetherOS_HistoryAnalysis:v2` interpretations through a full-scope,
  exhaustively classified surface adapter.

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
  surface: HistoricalConsumerSurface;
  relationshipScope: HistoryScope;
  personaMaskLabel: string;
  progressBundleLabel: string;
  origin: MemoryOrigin;
  delivered: boolean;
  candidateCount: number;
  openThreadCount: number;
  candidateTitles: string[];
  openThreadTitles: string[];
  budgetChars: number;
  warnings: string[];
  historicalCandidateCount: number;
  historicalCandidateTitles: string[];
  historicalSourceKinds: string[];
  historicalAuthorities: HistoricalAuthority[];
  historicalDisposition: 'required' | 'filtered' | 'shared' | 'hold' | 'no_history';
}
```

Receipts are stored under
`aetheros_worldline_memory_receipts_v2` and are capped locally. They prove that
context was selected and delivered to prompt assembly; they are not durable
relationship facts. Receipts keep titles, source class, authority, scope, and
surface only. They do not persist prompt/raw-text previews or route-membership
counts.

## Relationship-scoped Chat reply presentation

Chat keeps one expandable settings surface. Its first durable row is stored in
the existing IndexedDB asset store, so it follows full-device backup without
adding fields to the global character card:

```ts
type ChatReplyMode = 'preserve' | 'texting';

interface ChatRelationshipSettingsV1 {
  version: 1;
  scope: {
    progressBundleId: string;
    personaMaskId: string;
    charId: string;
  };
  replyMode: ChatReplyMode;
  updatedAt: number;
}
```

Asset ids use
`aetheros_chat_relationship_settings_v1:<bundle>:<mask>:<char>`. `preserve` is the
internal value for the visible `跟随玩家格式` mode. Its generation contract may
follow only the player's current structural form (plain dialogue, parenthesized
action, narration/dialogue mixture, and paragraph boundaries); it must not copy
tone, wording, syntax, sentence length, rhythm, or verbal habits. Its presentation
contract keeps one ordinary assistant response as one text message with natural
internal paragraphs. It does not classify scene content or change the character
card. Real emoji/voice/App actions remain separate records. `texting` applies
remote-message prompting, asks the model to separate independently sendable
messages with newlines, and invokes the existing newline/chunk bubble splitter.
Proactive delivery always forces `texting`.

Every new interactive assistant run freezes one `metadata.assistantResponseId`
across all records emitted by that provider response. Presentation may use a
runtime-only `metadata.presentationSourceMessageIds` list when several stored text
rows are shown as one preserve-mode bubble. Switching modes never rewrites those
source rows. Legacy rows without a response id merge only when they are adjacent
live assistant text, share relationship scope, have no external source/proactive
marker, and are at most eight seconds apart. Explicit edit/delete of a merged
bubble intentionally applies to all listed source rows.

Chat appearance remains global in `OSTheme`. The default theme now spreads
`MINIMAL_CHAT_APPEARANCE`; field-less stored themes receive the same default,
while explicit stored presets remain untouched.

The expanded Chat composer adds no persisted schema. It is a full-app editing
surface over the same in-memory `input` draft and calls the same text-send path
as the compact composer. Closing preserves that draft for the current Chat
session; sending creates only the existing message records and then clears it.

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
interface SocialRelationshipScope {
  progressBundleId: string;
  personaMaskId: string;
}

{
  kind: 'moment';
  sourceType: 'user';
  socialScope: SocialRelationshipScope;
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

`socialScope` is immutable ownership, not a display filter inferred from the
currently active mask. The same scope gates the feed, profile grids, settings,
share targets, generated batches, comments, delayed replies, notifications,
single deletion, and scoped clear operations. Switching masks cannot redirect
an in-flight reply. Unscoped legacy rows migrate only when one mask is the sole
valid owner or all referenced character ids resolve to one mask; ambiguous rows
remain stored and fail closed. Social does not synthesize fallback demo rows.

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

Social no longer persists or renders persona-bearing placeholder/demo feed rows.

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

Visible theme cards should stay limited to `深空`, `简约`, `微信`, and `自定义`.
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

## History Import V2 Raw Contract

`history-intake-v4` is a transport parser shared by TXT and DOCX:

- an explicit `user:` marker creates author channel `user`;
- an explicit `assistant:` or `char:` marker creates author channel `char`;
- those channels describe the export envelope, not the in-world speaker of each
  roleplay sentence;
- following wrapped lines stay attached until the next explicit channel marker;
- a trailing `timestamp:` line is preserved as source-time evidence;
- empty content, separators, and orphan timestamp units are skipped;
- every other non-empty unit becomes a `source_fragment` with no author channel.

The intake manifest owns only scope, placeholder/existing identity, parser and
source-file descriptors, row counts, row records, and a fingerprint. It has no
speaker mapping, review decision, source mode, continuity, branch, timezone
policy, companion/plot classification, or dedupe field.

The formal history archive has exactly four store families:

- `history_import_batches`;
- `history_source_messages`;
- `history_jobs`;
- `history_backup_receipts`.

There are no event, companion projection, plot projection, tag-registry, or
embedding stores in v2. The archive database uses the
`AetherOS_HistoryArchive:v2:` namespace; the intake workspace and daily archive
likewise use v2 namespaces and do not read pre-product review databases.

Daily archive search renders source fragments as `原文片段`. Voice clipping is
limited to explicit user/char export channels.

The independent `AetherOS_HistoryAnalysis:v2` foundation has four stores:

- `history_analysis_passes` — immutable completed model results;
- `historical_interpretation_workspaces` — one editable map per relationship;
- `history_evidence_bindings` — additive many-to-many source associations;
- `historical_user_overlays` — append-only correction revisions.

Every index and record uses the full
`progressBundleId + personaMaskId + charId` scope. The pre-product v1 analysis
database is not read or migrated. Derived analysis is rebuildable; raw Daily
Archive documents remain the durable evidence source.

Every historical derived entity also owns an explicit knowledge boundary:

```ts
type HistoricalKnowledgeScope =
  | 'relationship_private'
  | 'char_private'
  | 'user_private'
  | 'shared'
  | 'public_safe';
```

Duplicate interpretations merge toward the more private boundary. A public
duplicate can never downgrade a private candidate into public delivery.

### Multi-pass interpretation contract

```ts
interface HistoryAnalysisPass {
  schemaVersion: 2;
  id: string;
  scope: HistoryScope;
  requestId: string;
  analysisRunId: string;
  strategy: 'quick_merge' | 'deep_daily';
  sourceRevisionFingerprint: string;
  sourceRefs: HistorySourceSpan[];
  temporalClass: 'historical';
  status: 'completed';
  relationshipMemories: HistoricalRelationshipMemory[];
  timebookNodes: HistoricalTimebookNode[];
  narrativeProfile: HistoricalNarrativeProfile;
  createdAt: number;
  completedAt: number;
}

interface HistoricalInterpretationWorkspace {
  schemaVersion: 2;
  id: string;
  scope: HistoryScope;
  contributingPassIds: string[];
  entityIds: string[];
  bindingIds: string[];
  overlayIds: string[];
  createdAt: number;
  revision: number;
  updatedAt: number;
}

interface HistoryEvidenceBinding {
  schemaVersion: 2;
  id: string;
  scope: HistoryScope;
  sourceRef: HistorySourceSpan;
  targetKind: 'relationship_memory' | 'timebook_node' | 'route' | 'npc' |
    'relationship_stage' | 'open_thread';
  targetId: string;
  purpose: 'evidence' | 'scene' | 'turning_point' | 'relationship_change';
  origin: 'analysis' | 'user';
  analysisPassId?: string;
  status: 'active' | 'hidden';
  createdAt: number;
  updatedAt: number;
  revision: number;
}

interface HistoricalUserOverlay {
  schemaVersion: 2;
  id: string;
  seriesId: string;
  previousOverlayId?: string;
  scope: HistoryScope;
  targetKind: HistoryEvidenceBinding['targetKind'];
  targetId?: string;
  operation: 'create' | 'update' | 'hide' | 'restore';
  patch: Record<string, unknown>;
  provenance: 'source_linked' | 'user_attested';
  sourceRefs: HistorySourceSpan[];
  authority: 'user_confirmed';
  revision: number;
  createdAt: number;
}
```

`HistoryAnalysisPass` is append-only and published only when complete. Request
and running lifecycle state remains in the existing history job/request layer.
The same source and strategy may appear in multiple passes.
`HistoricalInterpretationWorkspace` is the current editable map, not another
source archive. A source span has no uniqueness constraint across bindings, so
the same dialogue may belong to several routes at once. Removing one binding
cannot remove the source, candidate, or sibling bindings.

Many-to-many membership is not a required presentation field. Ordinary UI and
delivery receipts must not render a route count or `同时属于 N 条线`; the same
source may simply resolve inside each relevant route. Association editing is an
advanced overlay/binding operation, not a source-card badge.

User overlays never mutate pass candidates. A source-free manual addition must
use `provenance: "user_attested"` and render as `我补充的`; it cannot masquerade
as extracted evidence. The resolved read projection applies authority order and
overlays, coalesces exact duplicate visible cards, retains all pass provenance,
and continues to forbid current-state and lived-experience fields.

Publishing a pass plus its analysis-owned bindings is one strict IndexedDB
transaction. Binding status updates and overlay appends use optimistic workspace
revision checks. Overlay revisions preserve target identity through
`seriesId + previousOverlayId`; add, edit, hide, and restore never rewrite an
earlier revision.

The resolved workspace is also the input to one future full-scope historical
selector under `memoryCore`. Contact memory, Timebook, and StoryDesk remain
visible correction projections; Chat, Call, proactive, Group Chat, Date, Diary,
Social, Guidebook, Special Moments, and other approved consumers receive
budgeted read projections rather than duplicated durable rows. Shared/HOLD
surfaces fail closed. See `docs/HISTORY_REUSE_SURFACE_AUDIT.md`.
