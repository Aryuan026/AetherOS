# AetherOS Public Sticker Schema

## Dual AI Runtime Routing

The current dialogue `APIConfig` remains the foreground connection. The second
ordinary model role stores only a reference to the existing preset catalog:

```ts
type AiProviderBinding =
  | { mode: 'inherit_dialogue' }
  | { mode: 'preset'; presetId: string };

interface AiRuntimeRoutingV1 {
  version: 1;
  systemDirector: AiProviderBinding;
}
```

The local storage key is `os_ai_runtime_routing_v1`. Text and full device
backups include `aiRuntimeRouting`; media-only backups do not.

Every consumer resolves a typed `AiTaskId` through the shared registry. Provider
refs and future receipts may contain role, binding, preset ID/name, base URL and
model, but never the API key. `system_director` task definitions currently have
`truthEffect: "none"`. Relationship-memory write tasks remain owned by
`dialogue` even when a separate system-director preset is selected.

Deleting an explicitly selected preset does not authorize an implicit provider
change. Resolution returns `system_director_preset_missing` until the player
chooses a new binding.

## Character Chat Appearance And Transient Header State

Chat appearance has a global detail store plus a character-owned preset choice:

```ts
interface CharacterProfile {
  chatAppearancePreset?: 'deep-space' | 'minimal' | 'wechat' | 'custom';
  chatPresenceStatus?: CharacterLivePresence;
  chatLiveStateEvaluation?: CharacterLiveStateEvaluation;
  activeBuffs?: CharacterBuff[];
}
```

An absent character preset resolves to `deep-space` for built-in characters and
`minimal` for every other source. Explicit character choice wins. Chat and Call
must use `resolveCharacterChatAppearanceTheme`; the legacy `bubbleStyle` field
is only a custom-card theme hint.

Header state is not a durable signature:

```ts
interface CharacterLivePresence {
  text: string;                // <= 14 visible graphemes
  stateKey: string;
  updatedAt: number;
  expiresAt: number;
  remainingTurns: number;
  source: 'system-director' | 'dialogue-ai' | 'seed' | 'history-import';
}

interface CharacterBuff {
  label: string;               // <= 8 visible graphemes when shown as mood
  updatedAt?: number;
  expiresAt?: number;
  remainingTurns?: number;
  stateKey?: string;
  source?: 'system-director' | 'dialogue-ai' | 'seed' | 'history-import';
}
```

Both a valid future `expiresAt` and a positive `remainingTurns` are required.
Read projection and prompt injection fail closed when either is absent,
malformed or exhausted. One completed live dialogue turn decrements both state
types. `emotion_background_evaluation` owns the low-frequency refresh cursor;
history-import messages are excluded from its evidence.

## Character Date Presentation

The default opening surface is a character-owned preference, while the active
or resumed session keeps its own presentation state:

```ts
type DatePresentationPreference = 'auto' | 'visual' | 'reading';
type DatePresentationMode = 'visual' | 'reading';

interface CharacterProfile {
  datePresentationPreference?: DatePresentationPreference; // absent = auto
  dateLightReading?: boolean; // reading palette only
  savedDateState?: DateState;
}

interface DateState {
  isNovelMode: boolean; // true = reading, false = visual
}
```

`auto` and explicit `visual` resolve to `visual` only when
`resolveDateDefaultPortrait` reports a dedicated date portrait; otherwise they
resolve to `reading`. This resolution applies to new sessions only.
`savedDateState.isNovelMode` is authoritative when resuming an unfinished
session. The visual and reading model-output contracts are selected from the
current session mode for both send and reroll; `dateLightReading` never changes
that contract.

### Character behavior compilation

Player-authored behavior requirements are character-owned. Compilation may
carry an exact relationship scope when invoked from Chat, but the character
panel can compile before a persona relationship is linked.

```ts
interface CharacterBehaviorCompilationReceipt {
  schemaVersion: 1;
  id: string;
  requestId: string;
  taskId: 'behavior_boundary_compilation';
  charId: string;
  relationshipScope?: HistoryScope;
  source: 'character_panel' | 'chat_reroll';
  provider: AiTaskProviderRef;
  inputHash: string;
  outputHash: string;
  ruleId?: string;
  status: 'compiled' | 'no_stable_rule';
  truthEffect: 'none';
  memoryEffect: 'none';
  currentStateEffect: 'none';
  createdAt: number;
}
```

The receipt never stores the raw player complaint, rejected reply, generated
prompt, or API key. A compiled rule is editable player guidance and remains
parallel to character canon, relationship memory, Character Life, narrative
truth, and tool policy.

## Companion Material Retrieval

Character material keeps reviewed semantic guidance separate from raw evidence:

```ts
interface CompanionMaterialRecord {
  ownerScope:
    | { kind: 'character'; charId: string }
    | { kind: 'relationship'; scope: HistoryScope };
  charId: string;
  kind: 'language_fingerprint' | 'stable_detail' | 'initiative_motive'
    | 'opening_recipe' | 'proactive_seed' | 'scene_affordance';
  slot: 'stable_character_voice' | 'stable_base'
    | 'relevant_stable_details' | 'motive_candidates'
    | 'opening_recipes' | 'proactive_seeds' | 'scene_affordances';
  guidance: string; // reviewed and non-verbatim
  retrievalHints?: {
    activationPolicy: 'voice_fallback' | 'relevance_required';
    positiveSignals: string[];
    suppressSignals?: string[];
    variationGroup?: string;
    fallbackPriority?: number;
  };
  sourceRefs: CompanionMaterialSourceRef[]; // no raw transcript
  routeLane?: 'mainline' | 'if_line'; // exact Director lane when route-bound
}
```

Reviewed source-derived possibilities that still need character canon, an exact
thread/artifact, or Director authority are not `CompanionMaterialRecord` rows:

```ts
interface ReviewedCompanionMaterialCandidate {
  id: string;
  charId: string;
  materialLane:
    | 'stable_detail_claim'
    | 'opening_recipe'
    | 'proactive_seed'
    | 'motive_candidate'
    | 'scene_affordance';
  activationAuthority:
    | 'character_canon_review'
    | 'canonical_thread_or_artifact'
    | 'director_motive'
    | 'director_scene_plan';
  runtimeDelivery: 'forbidden_until_authorized_promotion';
  truthEffect: 'none';
}
```

The current draft compiler never publishes availability: it returns only a
disabled, non-persistable draft plus
`publicationEffect: 'canonical_publisher_required'`. Generic material storage
rejects `promotionAuthority` rows on both read and write. A future publisher
must own an independent canonical registry and recheck exact receipt id,
revision, digest, issuer, HistoryScope, route and lane. The current build has no
such publisher and therefore exposes zero candidate records at runtime.

An optional semantic rank is a disposable index result, not durable truth:

```ts
interface CompanionMaterialSemanticRank {
  manifestId: string;
  manifestDigest: string;
  backend: 'embedding';
  modelId: string;
  modelArtifactDigest: string;
  dimensions: number;
  metric: 'cosine' | 'dot_product';
  normalized: boolean;
  projectionVersion: string;
  calibrationRevision: string;
  strongThreshold: number;
  indexRevision: string;
  scopeKey: string;
  materialSetFingerprint: string;
  scores: { materialId: string; score: number }[];
}

interface CompanionMaterialSemanticRankAuthority {
  authority: 'trusted_local_index_manifest';
  // Same binding fields as CompanionMaterialSemanticRank, without scores.
}
```

This is a typed future seam, not a currently implemented local index. Changing
the embedding model creates/rebuilds an index revision. Exact
relationship scope, surface, continuity, knowledge, cooldown, diversity and
budget remain code-owned gates. Scores are usable only when every binding
field matches a code-owned active-manifest authority; a stale scope,
material-set, model, projection, calibration or index binding is ignored and
falls back to the non-vector selector. Low-signal,
tool-intent and no-advice inputs cannot be promoted by an embedding score.
The future local producer must build this object from its active manifest;
imports, provider output and ordinary UI parameters are not semantic-rank
authorities. The current runtime adapter supplies no authority. Until that
producer/store exists, handwritten scores are ignored outside contract
fixtures and do not represent an enabled capability.

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

Player-authored Worldbooks use a persisted canonical group registry:

```ts
type WorldbookGroupOwner =
  | { kind: 'character'; charId: string }
  | { kind: 'universal' };

interface WorldbookGroupAssignment {
  id: string;
  name: string;
  owner: WorldbookGroupOwner;
  sortOrder?: number;
  pinned?: boolean;
}
```

The `worldbook_groups` IndexedDB store preserves empty groups independently from
entries. Each custom `Worldbook.group` contains the same canonical assignment,
and its legacy `category` mirror must equal `group.name`. The UI builds two
independent projections:

```text
built-in groups = books where isBuiltIn || lockEditing
custom groups   = all remaining books
```

The group owner is an authority boundary; category text is not. A custom book
named under `深空世界书` remains custom and editable. Custom legacy records with
no group are shown in `待归组` and are runtime-ineligible until repaired.
The repair bucket is a derived view, not a `worldbook_groups` record. Its entries
may be batch-assigned to one canonical group or batch-archived atomically.
`sortOrder` and `pinned` are library presentation metadata only. They can be
updated atomically for a set of groups, but cannot change group ID, name, owner,
mount authority, entry revisions or prompt priority. The built-in-library hidden
preference lives in `OSTheme.hideBuiltInWorldbooks`; it is a reversible UI
preference and is not a second enablement truth. `OSTheme.pinBuiltInWorldbooks`
only moves the visible built-in drawer above the player library.

Archiving a character-owned group is an atomic cross-store command:

```text
published entries in group -> archived N+1 revisions
worldbook_groups[groupId]  -> removed
characters[*].mountedWorldbookGroupIds -> groupId removed
```

The entry snapshots retain their original `group` assignment, so an explicit
later whole-group restore can use that identity without a second archive record:

```text
archived entries sharing groupId -> published N+1 restore revisions
worldbook_groups[groupId]        -> recreated from retained assignment
characters[*].mountedWorldbookGroupIds -> unchanged
```

An imported entry whose first and only revision was already archived restores
from that active archived snapshot as a new published N+1 revision; it does not
need a fictional earlier published revision.

The group and every restored entry commit in one transaction. A stale active
revision aborts the whole restore, and restoring the library never silently
re-enables the old character mount. The fixed universal group is not eligible
for whole-group removal.

Permanent deletion is a distinct archive-only transaction, not another
revision transition:

```text
selected archived entry records + all revisionSnapshots -> deleted
growth candidates targeting those entries/revisions      -> deleted
delivery receipts containing those entries                -> deleted
characters[*].mountedWorldbooks portability cache         -> pruned
empty selected worldbook_groups record + stale group mount -> deleted
```

The transaction rejects built-in or published entries. Whole-group deletion
also compares the supplied entry IDs with the exact archived membership of the
group, so a stale archive screen cannot partially erase a changed group.

### Mounted Worldbook Resolution

For custom entries, `CharacterProfile.mountedWorldbookGroupIds[]` is the sole
player-controlled enablement key:

```text
character-owned group + same owner + group ID enabled -> eligible candidate
universal group                                      -> eligible candidate
foreign group / groupless legacy entry               -> ineligible
```

Eligibility is only the first gate. Binding, knowledge subject, current query and
character budget still decide whether an entry reaches one provider request.
Built-in entries remain on the separate code-owned `mountedWorldbooks` package
contract. Startup strips legacy custom per-entry cache mounts so they cannot
silently bypass group ownership.

### Live Worldbook W1

The existing `worldbooks` record remains the one library record. W1 adds an
append-only snapshot chain to it instead of creating a second library:

```ts
interface Worldbook {
  // legacy title/content/category fields mirror the active revision
  worldbookSchemaVersion?: 1;
  activeRevisionId?: string;
  revisionSnapshots?: WorldbookRevisionSnapshot[];
}

interface WorldbookRevisionSnapshot {
  id: string;
  entryId: string;
  revision: number;
  title: string;
  content: string;
  category: string;
  aliases: readonly string[];
  activationHint?: string;
  publicationStatus: 'published' | 'archived';
  bindings: readonly WorldbookBinding[];
  knowledgePolicy: WorldbookKnowledgePolicy;
  supplementsEntryIds: readonly string[];
  sourceRefs: readonly WorldbookRevisionSourceRef[];
  contentHash: string;
  createdAt: number;
}
```

`publicationStatus` is library lifecycle only. It never means that a character
enabled the entry. For custom records, canonical group eligibility resolves to
candidate entry IDs before projection checks binding, relevance and budget.
Bindings can be global, exact
relationship, mainline, IF branch, or route-local and may coexist on one
revision. They narrow access and never auto-enable an entry.

The portable character-card cache mirrors `publicationStatus` only so legacy
prompt builders can omit an archived book while the mount ID remains intact.
That mirror cannot mount, unmount, or publish anything; the library active
revision wins whenever it exists.

For the temporary unmigrated-App prompt wrapper, the portability cache also
mirrors a code-owned `legacyPromptEligibility` plus the active
`knowledgePolicy`. Only an explicitly `public_global` + `public` cache may enter
that wrapper. Relationship/route-bound, entity-private, director-only, missing,
or stale compatibility metadata fails closed. This marker is not a second
enablement flag; the mount ID remains the only enablement truth.

Legacy `visibleToCharacterIds` remains Character-UI visibility/mountability.
Normalization preserves the legacy text and maps its knowledge policy to
`public`; it must never reinterpret those IDs as in-world secret knowers or
silently assign the entry to the currently active mask.

Knowledge filtering uses explicit request subjects:

```ts
type WorldbookKnowledgeSubjectRef = {
  kind: 'user' | 'character' | 'npc' | 'organization' | 'narrator';
  id: string;
};

type WorldbookKnowledgePolicy =
  | { kind: 'public' }
  | { kind: 'entities'; subjects: readonly WorldbookKnowledgeSubjectRef[] }
  | { kind: 'director_only' };
```

The consumer ID is never treated as a knower. An `entities` entry fails closed
when the request has no matching subject. `director_only` requires the explicit
World Director consumer kind.

Projection order is fixed:

```text
valid active revision
-> mounted entry ID
-> legacy Character-UI visibility
-> published library lifecycle
-> exact binding/scope/continuity
-> explicit knowledge subject/director gate
-> explicit entry/revision refs
-> Chinese title/alias/category/hint/body lexical relevance
-> entry and total character budgets
```

An ordinary low-signal greeting selects `NONE` unless the caller supplies an
explicit current revision ref. Results carry entry/revision/hash, scope,
consumer, knowledge-subject snapshot, selected/drop reason, and used budget.
Delivery receipts are metadata-only and always `truthEffect: none`. A future
vector ranker may replace only lexical scoring, not any preceding gate.

World growth proposals live in the separate
`worldbook_growth_candidates` store. They remain `truthEffect: none` in
`pending`, `deferred`, `ignored`, and `accepted` audit states. Acceptance writes
the accepted candidate plus the new Worldbook revision in one transaction; an
abort leaves both unchanged. Candidate drafts never enter runtime projection.

The ordinary library delete action is archive-only: it creates an N+1 revision,
leaving the complete snapshot chain intact. Restoring an older revision also
creates N+1 and never overwrites an old snapshot. A later player-facing archive
extension adds the explicitly confirmed permanent-delete transaction documented
under Worldbook Group Projection; it is never reachable from a published card.

`worldbooks`, `worldbook_growth_candidates`, and the metadata-only
`worldbook_projection_receipts` are registered in the whole-device backup
contract. A receipt is written only after a consumer accepts the projection;
it stores scope/knowledge subjects/consumer/revision hashes/budget, never the
selected excerpts. The current capability ladder is:

```text
available: contract, normalization, revision/candidate persistence, projection,
           delivery receipt, backup roundtrip
delivered: existing Worldbook create/edit/archive UI uses versioned atomic writes;
           Chat and Call prepare a typed projection from the canonical library
selected/requested: Chat/Call use exact captured relationship scope, the current
           character as explicit knower, no story continuity, and small budgets
executor_started: the projection is actually included in the provider prompt
canonical_receipt: written only after a sanitized, non-empty provider reply;
           provider failure, empty output, or local fallback writes none
visible_projection: world facts affect the model reply but have no standalone UI
           panel; Date/Story/Social/proactive and growth review remain HOLD
```

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

- `ContextBuilder.buildCanonicalCoreContext()` stays synchronous and DB-free.
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
group memory blob. The AI director should temporarily build each member's base
context with
`ContextBuilder.buildLegacyCoreContextWithMountedWorldbooks(member, userProfile, true)`,
then append a budgeted `selectWorldlineMemoryContext()` result for that same member. The
selector receives the member's recent private messages as `currentMessages` and
the recent group topic as `query`. Imported-history delivery is stricter:
Group Chat may receive only `shared` or `public_safe` confirmed candidates;
private relationship evidence is not opened for a public group prompt.

The selector currently reuses:

- `messages` for recent intersections and open threads.
- `anniversaries` for confirmed shared dates.
- `assets/timebook_first_contact_${charId}` for the first-contact anchor.
- a tiny recent slice of `char.memories` for role-private remembered moments.
- resolved `AetherOS_HistoryAnalysis:v3` interpretations through a full-scope,
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
  cooldownMs?: number;
  maxDeliveries?: number;
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

Reviewed built-in idle openers use two deliberately separate runtime ports:

- finished `direct_message` lines enter only the direct wakeup warehouse. They
  are one-shot per exact `progressBundleId + personaMaskId + charId` scope and
  are not inserted as repeated examples in ordinary model prompts;
- non-verbatim `rewrite_seed` guidance enters the typed companion-material
  selector only for `proactive_letter / proactive_intent`. A successful model
  result writes the normal delivery receipt and spends that seed's cooldown;
  failed or empty generation does not.

Both ports require the relationship's `藏好的话` switch. The rewrite port uses
an opaque, short-lived `wakeup_rule / hidden_words_enabled` grounding ref so
keeping `此刻的话` enabled cannot silently re-enable the reviewed warehouse.

The public runtime pack contains no reviewed source dialogue, title, URL, local
path or private evidence pointer. Its compiler rejects review prose and empty
placeholders before a generated pack can enter verification.

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

The current automatic interpretation layer uses localStorage only for quiet-run
settings and a small human-readable ledger. It does not write relationship
memory, Timebook, scheduler, Narrative, or Character Life truth:

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
  status: 'proposed' | 'skipped' | 'failed';
  title: string;
  summary?: string;
  sourceDate?: string;
  messageCount?: number;
  targetId?: string;
  reason?: string;
  trigger: 'auto' | 'manual';
}
```

MemoryDM reuses the foreground chat API, reads exact-scope active live
`InteractionEvidence`, and appends immutable interpretation passes plus
extraction receipts into the existing `assets` store.

```ts
interface MemoryDMSettings {
  enabled: boolean;
  turnsPerPass: number;
  idleHoursBeforePass: number;
  idlePassEnabled: boolean;
}

type MemoryCandidateTarget =
  | 'relationship_memory'
  | 'timebook'
  | 'scheduler_proposal'
  | 'narrative_proposal'
  | 'character_life_proposal'
  | 'discard';

interface MemoryCandidate {
  schemaVersion: 1;
  id: string;
  passId: string;
  scope: HistoryScope;
  sourceEvidenceIds: string[];
  target: MemoryCandidateTarget;
  knowledge: MemoryCandidateKnowledge;
  temporalClass: 'historical' | 'live' | 'mixed';
  authority: 'model_interpretation' | 'deterministic_heuristic';
  claimClass:
    | 'conversation_fact'
    | 'shared_experience'
    | 'world_state_change'
    | 'relationship_stage_change';
  status: 'proposed' | 'discarded';
  title: string;
  summary: string;
}

interface MemoryInterpretationPass {
  schemaVersion: 1;
  id: string;
  requestId: string;
  analysisRunId: string;
  scope: HistoryScope;
  evidenceSpan: EvidenceSpan;
  extractor: 'model' | 'deterministic_heuristic';
  status: 'completed';
  truthEffect: 'none';
  candidates: MemoryCandidate[];
  startedAt: number;
  completedAt: number;
}

interface MemoryDMExtractionReceipt {
  schemaVersion: 1;
  id: string;
  requestId: string;
  analysisRunId: string;
  passId?: string;
  scope: HistoryScope;
  evidenceSpan: EvidenceSpan;
  status: 'completed' | 'failed' | 'rejected';
  truthEffect: 'none';
  candidateIds: string[];
  rejectedCandidateCount: number;
  usage: MemoryExtractionUsage;
  createdAt: number;
}

interface MemoryExtractionClaim {
  schemaVersion: 1;
  id: string; // scope + extractor + schema/prompt + ordered source fingerprint
  requestId: string;
  scope: HistoryScope;
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}
```

`turnsPerPass` defaults to `60` and is clamped to `20-100` in sparse `20`-turn
steps in Settings. Legacy local values below `20` are treated as the new default
instead of preserving the old dense 12/16/24-turn behavior.

MemoryDM storage keys:

```text
aetheros_memory_dm_settings_v2
assets/memory_interpretation_store_v1
```

Memory Promotion is an independent target-domain gate. It does not mutate an
interpretation pass and it has no Character, Anniversary, Scheduler, Narrative,
hot-state, emotion, or Character Life writer.

```ts
interface MemoryPromotionCommand {
  schemaVersion: 1;
  id: string;
  scope: HistoryScope;
  candidateId: string;
  passId: string;
  expectedSourceRevisionFingerprint: string;
  trigger: 'manual' | 'automatic_policy';
  policyVersion: 'memory-promotion-policy-v1';
  manualDecision?: {
    id: string;
    scope: HistoryScope;
    candidateId: string;
    decision:
      | 'remember_historical'
      | 'remember_relationship'
      | 'confirm_played_experience';
    confirmedAt: number;
  };
  experienceRef?: {
    kind: 'scoped_experience_receipt';
    scope: HistoryScope;
    receiptId: string;
    acceptedFactRefs: string[];
  };
  requestedAt: number;
}
```

Successful promotion atomically appends one immutable target row and one
`MemoryPromotionReceipt` under the same asset transaction. Target identity is
stable by exact scope + pass + candidate, so concurrent/manual retries cannot
create duplicate durable rows. A new command that reaches an existing target
appends its own `status: duplicate`, `truthEffect: none` receipt referencing the
original target and applied receipt; an exact retry of the same command reuses
that command's receipt. Rejected and stale attempts also append zero-write
receipts. Full source `EvidenceSpan`, candidate evidence ids, interpretation
authority, claim class, deterministic interaction-provenance assessment,
knowledge, temporal class, trigger, and optional scoped experience reference
remain auditable on the row/receipt pair.

The provenance assessment is computed from source surface, medium, producer,
and transport role, never from model output. Its v1 classes are historical
material, embodied interaction, user remote statement, two-party remote
exchange, model/system-generated, manual material, and unclassified. Unknown
combinations fail closed.

Storage key:

```text
assets/memory_promotion_store_v1
```

Automatic policy rules:

- only `live` candidates may enter automatic promotion;
- `historical` / `mixed` candidates require an explicit manual path and remain
  non-current historical material;
- `manual` is not a magic bypass string: its command must carry an exact-scope,
  candidate-bound user decision. Remembering a relationship fact is distinct
  from confirming that a high-impact or embodied event was actually played;
- conversational facts need user-channel evidence;
- shared experiences need two-party source evidence;
- model-interpreted candidates cannot automatically authorize themselves by
  choosing a low-impact `claimClass`; they need verified scoped experience.
  Deterministic candidates must additionally match the provenance class
  required by their claim;
- a pass with `extractor: model` can contain only `model_interpretation`
  candidates, while a deterministic pass can contain only
  `deterministic_heuristic` candidates. Promotion repeats this check even when
  its store port is replaced;
- embodied scenes, world-state changes, and relationship-stage changes require
  a verified full-scope experience receipt;
- current `NarrativeExperienceReceipt` lacks `personaMaskId`, so it is not
  accepted directly. A future adapter must expose a verified scoped receipt and
  stable accepted-fact refs;
- source revision changes make the candidate stale. Existing promoted rows are
  also filtered at selector read time if their source span is no longer active.
- promoted `mixed` material remains `mixed` in the shared selector and is
  formatted with historical evidence, never with live/current-state memory.

Storage keys:

```text
aetheros_auto_memory_settings_v2
aetheros_auto_memory_ledger_v2
```

Current write targets:

- interpretation pass and extraction receipt: yes, append-only in
  `assets/memory_interpretation_store_v1` and included by full-device backup;
- scoped promoted relationship-memory rows: yes, in
  `assets/memory_promotion_store_v1`; legacy `char.memories` remains untouched;
- scoped promoted Timebook-entry rows: yes, in the same promotion store; legacy
  `anniversaries` remains untouched;
- scheduler / `companion_wakeups`: no;
- Narrative and Character Life: no;
- explicit manual re-analysis may reuse selected active evidence ids with a new
  run id; automatic passes consume only previously uninterpreted revisions.
- automatic requests first acquire an atomic source-fingerprint claim in the
  same asset transaction; manual re-analysis intentionally bypasses this claim.

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
  writingMode?: "plain_novel" | "character_collaboration";
  directives?: NarrativeDirective[];
}
```

Compatibility:

- No IndexedDB migration is required for this first slice because
  `NovelBook.directives` is optional.
- Existing novel records without `directives` remain valid.
- Existing novel records without `writingMode` are interpreted as
  `character_collaboration`; newly created books default to `plain_novel`.
- In `plain_novel`, player input is a transient generation instruction. Only
  accepted provider prose is appended as a `NovelSegment` with
  `authorId: "system"`. A typed Worldbook delivery receipt may be written only
  after those segments have been persisted.
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

Whole-device text/full backup carries the active raw History Archive as chunked
`history-archive/*.json` files plus
`FullBackupData.historyArchiveManifest`. The manifest reuses the credential-
excluding rescue payload checksums, but does not require a separate recovery
secret: optional encryption belongs to the outer whole-device package. Restore
validates every chunk and all cross-store references into a new temporary
archive slot before atomically switching the active History Archive pointer.
The original source rows remain immutable; Daily Archive corrections and
superseded revisions travel through their own backup records.

Daily archive search renders source fragments as `原文片段`. Voice clipping is
limited to explicit user/char export channels.

The independent `AetherOS_HistoryAnalysis:v3` foundation has five stores:

- `history_analysis_passes` — immutable completed model results;
- `historical_interpretation_workspaces` — one editable map per relationship;
- `history_evidence_bindings` — additive many-to-many source associations;
- `historical_user_overlays` — append-only correction revisions;
- `historical_narrative_extraction_receipts` — immutable completed/failed
  attempt metadata with `truthEffect: "none"`.

Every index and record uses the full
`progressBundleId + personaMaskId + charId` scope. The pre-product v2 derived
analysis database is not read or migrated into the required actor/event shape.
This is an explicit clean break made before product release: derived analysis is
rebuildable, while raw History Archive and Daily Archive v2 documents remain
untouched as the durable evidence source.

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
  schemaVersion: 3;
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
  schemaVersion: 3;
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
  schemaVersion: 3;
  id: string;
  scope: HistoryScope;
  sourceRef: HistorySourceSpan;
  targetKind: 'relationship_memory' | 'timebook_node' | 'actor_ref' | 'event' |
    'event_route_binding' | 'route' | 'npc' | 'relationship_stage' |
    'open_thread';
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
  schemaVersion: 3;
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

`HistoricalNarrativeProfile` now contains three neutral structures before the
Narrative lifecycle:

```ts
interface HistoricalActorRef extends HistoricalDerivedBase {
  kind: 'actor_ref';
  actorClass: 'user' | 'character' | 'npc' | 'unknown';
  mention: string;
  aliases: string[];
  resolution: 'resolved' | 'ambiguous' | 'unresolved';
  resolvedNpcProfileId?: string;
  asOf?: HistorySourceTime;
}

interface HistoricalEventProfile extends HistoricalDerivedBase {
  kind: 'event';
  eventId: string;
  title: string;
  summary: string;
  actorRefIds: string[];
  startedAt?: HistorySourceTime;
  endedAt?: HistorySourceTime;
  surfaces: HistoricalInteractionSurface[];
  location?: string;
  topic?: string;
  objective?: string;
  outcome?: string;
}

interface HistoricalEventRouteBinding extends HistoricalDerivedBase {
  kind: 'event_route_binding';
  eventProfileId: string; // HistoricalEventProfile.id
  routeProfileId: string; // HistoricalRouteProfile.id
  continuity: HistoricalContinuity;
  branchId?: string;
}
```

These are immutable historical interpretations, not per-turn speaker labels or
played scenes. The history-owned `HistoricalNarrativeProjection` exposes them
to Narrative with workspace revision and exact relationship scope; its provider
has no run, scene, receipt, Memory Promotion, Scheduler, or Character Life
writer.

Hidden extraction packets retain only the export transport role
`user | char | unknown`. This role never names an in-world actor; actor identity
is represented only by evidence-linked `HistoricalActorRef` records. Ambiguous
or unresolved aliases from different source spans are kept separate. They may
coalesce automatically only when a repeated pass points to the exact same source
span, or after an explicit resolved identity is available.

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

Publishing an extracted pass, its analysis-owned bindings, its workspace
revision, and its completed extraction receipt is one strict IndexedDB
transaction. A failed attempt writes only an immutable zero-truth receipt with
its reason and usage metadata. Binding status updates and overlay appends use optimistic workspace
revision checks. Overlay revisions preserve target identity through
`seriesId + previousOverlayId`; add, edit, hide, and restore never rewrite an
earlier revision.

The resolved workspace is also the input to one future full-scope historical
selector under `memoryCore`. Contact memory, Timebook, and StoryDesk remain
visible correction projections; Chat, Call, proactive, Group Chat, Date, Diary,
Social, Guidebook, Special Moments, and other approved consumers receive
budgeted read projections rather than duplicated durable rows. Shared/HOLD
surfaces fail closed. See `docs/HISTORY_REUSE_SURFACE_AUDIT.md`.
