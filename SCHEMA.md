# AetherOS Public Sticker Schema

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
