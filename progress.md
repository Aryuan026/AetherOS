# AetherOS Progress

## 2026-08-01 Compact System Notice Overlay

- done:
  - Kept the real-device-approved Android installed Chat header unchanged.
    Global success/info/error notices no longer inherit the condensed header's
    zero top breathing room; the overlay stack keeps an independent 8 px inset
    below the real device status bar.
  - Reduced the shared toast from `px-4 py-3 / rounded-2xl / gap-3` to
    `px-3.5 py-2 / rounded-xl / gap-2`, with an 8 px status dot and lighter
    shadow. This applies to every `addToast` caller rather than special-casing
    the Chat auto-reply confirmation.

- verification and deployment:
  - Full `npm run verify:health` is Green. The shell gate fixes the independent
    overlay inset and rejects restoring the old `py-3` toast on the canonical
    `data-shell-toast` projection.
  - Deployed public `main@e101791` with build ID
    `aetheros-2.0.0-d257e3c5ab063aa6`: 261 regular files and 94 verified gzip
    sidecars. Local/server `index.html` SHA-256 is
    `3897e09e9a21bd01af49c7ba47308fa72ec5625084f1ebc0d6086551d165043d`;
    the public online-first verifier is Green.
  - Public GET is 200, POST is 403 and retired `/sullyos/` remains 410. Nginx
    stayed PID `226154` and Bridge stayed PID `344776`; neither was restarted
    or reloaded.
  - Rollback is
    `/srv/asherie/backups/aetheros-toast-e101791-20260801T092912Z/aetheros-static.previous`.
  - Final visual density remains an owner-device checkpoint; deployment Green
    proves the shared style is public, not that the physical toast has already
    received device acceptance.

## 2026-08-01 Android PWA Header Real-device Correction

- corrected after device evidence:
  - The first standalone trim at `b063523` was contract-Green but did not make
    a visible enough difference on the owner's Android PWA. That deployment is
    retained as history, not treated as final visual acceptance.
  - Installed-surface detection now covers `standalone`, `fullscreen`,
    `minimal-ui`, iOS standalone and Android App referrers. The live shell also
    exposes a non-user-facing `data-shell-runtime-surface` marker so a future
    device report can distinguish browser, installed Android, installed iOS and
    native projections without adding a settings/test control.
  - Android installed Chat removes the remaining 4 px shell breathing space,
    2 px Chat-only offset and 6 px of the stacked title row. This is 12 px
    shorter than the first attempted fix and 19 px shorter than ordinary web;
    ordinary browsers and iOS/native safe-area policy remain unchanged.
  - Explicit update no longer performs a blind `reload()`. It must first fetch
    the canonical release descriptor and a cache-busted HTML shell, then gives
    the online-first worker a bounded update check before navigating. If the
    public route is unreachable, the current page remains mounted and Settings
    shows a retryable message.

- verification and deployment:
  - Full `npm run verify:health` is Green, including shell chrome, transient
    Chat header, TypeScript, production build, relocatable online-first release
    and PWA runtime gates. The release identity is
    `aetheros-2.0.0-511547ff0d4121b0`.
  - Deployed public `main@9d1679d`: 261 regular files and 94 verified gzip
    sidecars. Local and server `index.html` SHA-256 is
    `b0d1bf36b9ccb0a362541aea56e4124e4dee7f745b5c65c3eae4960d09e56be6`;
    the public online-first verifier is Green for the real HTML, startup assets,
    manifest, descriptor and worker.
  - A cache-busted cold browser reached the real AetherOS lock screen after the
    truthful slow-network state. Public GET is 200, POST is 403 and retired
    `/sullyos/` remains 410. Nginx stayed PID `226154` and Bridge stayed PID
    `344776`; neither was restarted or reloaded.
  - Rollback is
    `/srv/asherie/backups/aetheros-pwa-real-device-9d1679d-20260801T090428Z/aetheros-static.previous`.
  - Final Android installed-App visual acceptance remains an owner-device
    checkpoint. Deployment Green proves the intended code is public, not that
    the vendor status-bar composition has already been visually accepted.

## 2026-08-01 Android PWA Header Balance

- done:
  - Split top-spacing policy by runtime surface instead of shrinking every App
    header. Ordinary browsers keep the reviewed breathing room; iOS retains its
    notch safe area; Capacitor keeps its native boundary.
  - Android standalone PWA now treats the visible system status bar as already
    reserved, removes a duplicate top safe-area, changes the shared header
    breathing space from 8 px to 4 px and the Chat-only vertical offset from
    5 px to 2 px. The Chat title area is therefore about 7 px shorter without
    returning the ordinary browser layout to its earlier cramped state.
  - Kept feature Apps lazy-loaded. First open may download one App chunk; later
    opens reuse normal browser HTTP cache. No offline shell or eager all-App
    startup bundle was added just to conceal the first-open cost.

- verification and deployment:
  - Full `npm run verify:health` is Green. The shell gate explicitly covers
    normal web, Android standalone, iOS standalone and future native runtime
    projections; ordinary browser Chat kept its existing 5 px offset and
    rendered with a clean console.
  - Deployed `main@b063523` with build ID
    `aetheros-2.0.0-9e6999ca79b3d59f`: 261 regular files and 94 verified gzip
    sidecars. Public online-first verification and a real browser startup are
    Green.
  - Public GET is 200, POST is 403 and retired `/sullyos/` remains 410. Home
    stayed PID `368299`, Bridge PID `344776` and Nginx PID `226154`; all remain
    active with `NRestarts=0`. No service reload or restart ran.
  - Rollback is
    `/srv/asherie/backups/aetheros-pwa-header-b063523-20260801T083925Z/aetheros-static.previous`.
  - Final visual acceptance of the condensed Android standalone header remains
    a real-device checkpoint because desktop browser emulation cannot reproduce
    the phone vendor's external status-bar composition exactly.

## 2026-08-01 Settings Action-Only Refinement

- done:
  - `桌面 App / 恢复默认布局` remains the independent rescue path required by
    the launcher contract, but Settings now shows it only after App visibility
    or ordering differs from the current default layout.
  - The PWA row is action-only. A real update still takes priority, Android /
    desktop install prompts and iOS manual installation remain supported, while
    standalone launch, same-session install success and browsers without an
    available install action no longer leave a permanent status card.
  - Normalized `保存并启用当前填写` to the Settings control scale at 11 px.

- verification and deployment:
  - Full `npm run verify:health` is Green, including launcher layout, TypeScript,
    production build, online-first release and PWA runtime gates. The runtime
    presentation fixture covers update, install, iOS, standalone, installed,
    unavailable and Capacitor states.
  - Deployed `main@eebf909` with build ID
    `aetheros-2.0.0-b1a9a2a0f3c9b260`: 261 regular files and 94 verified gzip
    sidecars. Local, staging and public release checks are Green.
  - A real public browser observed `新版本可用`, completed the explicit update,
    then reopened Settings with neither an install-status placeholder nor the
    default-layout recovery card. The API save button rendered at 11 px and the
    browser console remained clean.
  - Public GET is 200, POST is 403 and retired `/sullyos/` remains 410. Home
    stayed PID `368299`, Bridge PID `344776` and Nginx PID `226154`; all remain
    active with `NRestarts=0`. No service reload or restart ran.
  - Rollback is
    `/srv/asherie/backups/aetheros-settings-eebf909-20260801T081215Z/aetheros-static.previous`.

## 2026-08-01 Online-First Desktop Install And Backup Gate

- done:
  - Added a Settings-owned `添加到桌面` surface over one shared PWA runtime.
    Android/desktop browsers may use the captured install prompt; iOS receives
    the manual Safari home-screen steps. Installed state is observed rather
    than fabricated.
  - Kept the product explicitly online-first. The release descriptor records
    `shellMode: "online-first"` and `offlineShell: false`; neither the worker nor
    the update path creates or reads a static CacheStorage shell.
  - Added startup, focus and visible-state release probes. They may expose an
    available version, but only the explicit human update action reloads the
    page; worker activation itself does not start a reload loop.
  - Kept browser storage origin-bound. The lab origin and GitHub Pages origin
    do not share IndexedDB, and neither one can automatically transfer its data
    into a future Capacitor APK container.
  - Fixed whole-device export so `companion_wakeups` and
    `companion_wakeup_logs` map to `companionWakeupRules` and
    `companionWakeupLogs`, matching the existing import contract.
  - Registered all 29 `AetherOS_Data` stores in one backup contract. The new
    gate compares that registry with concrete `STORE_*` declarations, so a new
    store without an explicit backup decision fails verification.

- verified locally:
  - `node --import tsx scripts/verify-whole-device-backup-roundtrip.ts` writes,
    exports, clears and restores companion wakeup rules/logs through the real
    IndexedDB adapter, and verifies the 29-store registry.
  - `node --import tsx scripts/verify-online-first-release.ts` verifies
    relocatable `/aetheros/` resources, local manifest MIME, one current worker,
    no CacheStorage path, no startup data deletion and no automatic reload.
  - Typecheck, production build, public-release sanitization and the shared PWA
    runtime contract are Green. The current local release descriptor and worker
    share the same reproducible build ID.

- deployment: accepted on the public lab
  - Deployed public `main@b7a594e` with build ID
    `aetheros-2.0.0-c248111ec384cb03`: 261 regular files plus 94 valid gzip
    sidecars. Local/staging/server/public `index.html` SHA-256 is
    `b1073566f412a5d20a3894965da9832aa13e564ea66e6eb411206877af3ea831`.
  - The exact manifest route now returns `application/manifest+json` with the
    required revalidation policy, and `verify-deployed-online-first.mjs` is
    Green for public HTML/assets, manifest/SW release identity and the
    online-first storage-safety boundary.
  - Public GET is 200, POST is 403 and retired `/sullyos/` remains 410. A real
    public browser first detected the new release; after the human clicked
    update, the Settings row settled to the `browser-menu` state with zero
    console errors or warnings.
  - Rollback is
    `/srv/asherie/backups/aetheros-pwa-b7a594e-20260801T070603Z/aetheros-static.previous`;
    the Nginx backup is in the same backup directory under `nginx/`.
  - Only Nginx was reloaded. Home remained PID `361070`, `NRestarts=0`, and
    Bridge remained PID `344776`, `NRestarts=0`.

- boundary:
  - Data remains in the current browser container. Adding AetherOS to the
    desktop changes its launch surface, not its storage origin.
  - Browser/PWA to APK continuity is not automatic and is not Green yet. A
    future APK release must pass an explicit whole-device backup export -> APK
    restore acceptance before the lab origin can retire.

## 2026-08-01 Subpath Startup Repair

- cause:
  - The isolated `/aetheros/` server received an ordinary Vite build whose
    generated entrypoints were root-absolute `/assets/*` URLs. The static files
    existed under `/aetheros/assets/*`, but the browser's real requests received
    404 and the app never mounted.
  - The 12-second boot timer also treated slow transfer as a crash. On the
    observed public route the compressed 335 KB entry bundle took about 40
    seconds, so a valid but slow load could display a false failure state.

- done:
  - Made every production build relocatable with `base: './'`; GitHub Pages,
    `/aetheros/`, Capacitor and other static directories now use the same
    subpath-safe artifact contract.
  - Changed the timer-only boot state to “network is slow, still opening”. Only
    a real resource/runtime error marks startup failed.
  - Added public-release guards against restoring the conditional root-absolute
    build and against timeout-only failure.

- acceptance:
  - The built HTML must reference `./assets/*`; the exact URLs extracted from
    the deployed HTML must return 200 before the server swap is accepted.
  - Browser acceptance must prove the boot fallback is removed by the real App,
    with no console error. Checking that files merely exist on disk is not
    sufficient.

- deployment:
  - Public `Aryuan026/AetherOS main@3763965`; GitHub Pages run `30685029793`
    completed successfully.
  - The release contains 260 regular files and 93 valid gzip sidecars. Local,
    staging, server and public-lab `index.html` SHA-256 is
    `1651618b4d8e5dd02677ca919ef55436aa2d290df3b6466c64708bd6120be2e3`.
  - Only `/srv/asherie/sites/science-demos/aetheros` was atomically replaced.
    Rollback is
    `/srv/asherie/backups/aetheros-subpath-3763965-20260801T050210Z/aetheros-static.previous`.
  - The URLs extracted verbatim from public HTML resolve under `/aetheros/`:
    the main JS and CSS both returned 200. Public GET is 200, POST is 403 and
    retired `/sullyos/` remains 410.
  - A cold public browser showed the slow-loading state after 12 seconds, then
    reached the real AetherOS lock screen with zero console errors. Nginx, Home
    and Bridge remained active with unchanged PID/restart counters; no service
    reload or restart ran.

- remaining performance note:
  - The corrected main bundle is about 335 KB compressed and took roughly 29.5
    seconds on the observed route. Startup is correct and no longer lies about
    a crash, but route speed and bundle splitting remain separate performance
    work rather than part of this availability repair.

## 2026-07-30 Character Chat Appearance And Transient Header State

- done:
  - Integrated the shared elastic Chat header and 46px composer-control
    baseline. The centered title, optional status lane and right action rail now
    have independent layout space, so a short-lived status does not push the
    character name upward or collide with controls.
  - Made Chat appearance a per-character setting shared by Chat and Call.
    Built-in Deep Space characters default to `deep-space`; newly created,
    character-card and historical-import characters default to `minimal`.
    An explicit player choice remains authoritative.
  - Replaced the permanent `ONLINE`/signature header fallback with typed
    short-lived mood and presence state. A role without an active state renders
    only its name.
  - Added dual expiry by wall-clock time and remaining live-conversation turns.
    Missing or malformed expiry data fails closed, and expired state cannot
    enter the header or prompt context.
  - Reused the existing emotion-background evaluation route at low frequency.
    It prefers the configured system-director AI and falls back to the dialogue
    AI; failure never blocks the foreground reply. Generated acting undertone
    is bounded and cannot prescribe exact dialogue, affection, plot outcomes or
    tool use.
  - Seeded each built-in role with one bounded initial presence while allowing
    custom blank roles to remain visually quiet. Persistent activity still
    belongs to Life/Social evidence rather than the Chat header.

- verified:
  - Complete `npm run verify:health` is Green, including public-release,
    history import, Companion Material, behavior boundaries, daily archive,
    narrative, memory, Chat header/live-state fixtures, typecheck and production
    build.
  - Canonical 5174 browser acceptance at 390 x 844 shows the role name centered,
    the transient presence in its own lane and all three composer controls at
    46px. There is no horizontal overflow and no console error.
  - The same resolver is covered for built-in, new, imported, explicitly
    overridden and legacy-custom characters across both Chat and Call.

- deployment:
  - Feature payload `549afb0` is on public `Aryuan026/AetherOS main`; GitHub
    Pages run `30560899069` completed successfully.
  - The isolated static build contains 260 regular files and 93 valid gzip
    sidecars. Local, staging, server and public-lab `index.html` SHA-256 is
    `556705c03bc5778c02a6926bc6678d6138d3bded877bd890368b8b66601c26b4`.
  - Only `/srv/asherie/sites/science-demos/aetheros` was atomically replaced.
    Rollback is
    `/srv/asherie/backups/aetheros-live-header-549afb0-20260730T162230Z/aetheros-static.previous`.
  - Public GET is 200, POST is 403, retired `/sullyos/` remains 410 and the
    hashed main asset is gzip + immutable. Nginx, Home and Bridge stayed active
    with unchanged PID/restart counters; no service or Nginx reload ran.

- boundary:
  - Mood and presence are atmosphere, not memory truth or a permanent role
    trait. This change does not auto-publish Social posts or mutate the
    character card.
  - Production build still reports the pre-existing stale Browserslist-data and
    over-500KB chunk warnings. They are follow-up dependency/code-splitting
    work, not regressions introduced by this feature.

## 2026-07-30 Exact Persona Chat Routing And Shell Position

- done:
  - Removed Chat's silent fallback from an unavailable requested character to
    the first linked character. A stale or unlinked target now fails closed
    under its own name instead of opening somebody else's conversation.
  - Explicit `发消息` and `设为想见` actions in Contacts now link that exact
    character to the active persona mask before changing the active character.
    Chat's switcher and character-aware modals receive only the active mask's
    linked character set.
  - Changed the non-scrolling phone compositor from `overflow:hidden` to
    `overflow:clip`. Bringing a lower switcher item into view can no longer
    programmatically scroll the whole virtual phone and leave every app header
    above the viewport.
  - Chat character names now use a safe Chinese line height and bounded
    truncation in both centered and avatar header layouts.

- verified:
  - Complete `npm run verify:health`, including history import, companion
    material, memory, daily archive, narrative, shell chrome, persona scope,
    typecheck and production build, is Green.
  - Canonical 5174 browser path reproduced the original error first: opening
    unlinked 黎深 entered 沈星回. After the fix, the same action entered 黎深
    and linked him to the active mask.
  - Switching from 黎深 to long-name `资讯站测试·星河` kept phone shell
    `scrollTop=0`, header top at `0`, and the character name fully inside the
    header.

- deployment:
  - Public `Aryuan026/AetherOS main@5657896`; GitHub Pages run `30514723935`
    completed successfully.
  - The isolated static build contains 258 regular files and 91 valid gzip
    sidecars. Local, staging, server and public-lab `index.html` SHA-256 is
    `da1003ac8a2594ea4360d857919a77535866a531bfe9e658a5e5f41c7eee02fd`.
  - Only `/srv/asherie/sites/science-demos/aetheros` was atomically replaced.
    Rollback is
    `/srv/asherie/backups/aetheros-identity-routing-5657896-20260730T044558Z/aetheros-static.previous`.
  - Public GET is 200, POST is 403, retired `/sullyos/` remains 410 and the
    hashed main asset is gzip + immutable. Nginx, Home and Bridge stayed active
    with unchanged PID/restart counters; no service or Nginx reload ran.

- boundary:
  - The public lab is healthy rather than crashed, but a read-only transfer
    probe observed the compressed 324 KB main bundle arriving at roughly
    8.7 KB/s on this route. That slow network transfer is recorded separately
    from the fixed role-routing and compositor defects.

## 2026-07-29 Historical Fingerprint Reinforcement And Identity Reuse

- done:
  - Added a read-time Companion Material resolution layer. Runtime-equivalent
    directions from separate immutable history passes now collapse to one
    prompt candidate while retaining every source reference; the original pass
    records remain untouched and queryable.
  - Kept the coalescing key deliberately strict. Different route, purpose,
    grounding, relationship floor, retrieval policy, tags, or guidance remains
    a separate interpretation, so multi-source analysis cannot flatten a
    character's expressive range or silently choose between conflicting
    readings.
  - When a new import placeholder uses the exact display name of an existing
    character, the identity step now offers one-tap reuse of that character.
    It never auto-links by name and never blocks a genuinely distinct same-name
    role from being created.
  - Replaced model-review implementation language in the Calendar analysis
    sheet and progress state with short player-facing cost and two-pass
    explanations. The external-API disclosure remains visible.

- verified:
  - `npm run verify:companion-material`
  - `npm run verify:history-import`
  - `npm run typecheck`
  - Canonical 5174 browser flow: ordinary new-role entry remains unchanged;
    entering an existing name shows the reuse card; choosing it selects the
    existing character without writing an import.

- boundary:
  - This is exact runtime-meaning reinforcement, not lossy semantic rewriting.
    Similar but non-identical directions continue through relevance, variation,
    cooldown and diversity selection until a future evidence-backed semantic
    consolidation policy exists.
  - No character card, raw archive, immutable analysis pass, current state,
    memory truth, narrative run or server deployment was changed.

## 2026-07-28 Companion Material Non-Vector Retrieval And Calendar Analysis

- done:
  - Added a character/relationship-scoped Companion Material contract for
    non-verbatim language fingerprints, stable character behavior, relevant
    details, opening recipes, proactive seeds, motive candidates and scene
    affordances.
  - Published historical analysis passes into an independent relationship
    material library while preserving immutable evidence refs, alternate
    analysis passes and `truthEffect: none` delivery receipts.
  - Connected the reviewed stable layer to Chat, proactive wakeups, Call and
    Date. Each consumer captures the exact relationship scope before work
    starts, receives only its legal surface/purpose projection, and writes a
    receipt only after the provider result has survived surface normalization
    and is non-empty.
  - Implemented the default no-vector retriever using bounded scenario signals,
    CJK n-gram/token overlap, exact scope/surface/route gates, recent-delivery
    rotation, variation groups and prompt budgets.
  - Mapped historical `speech_rhythm / care_style / boundary_style /
    repair_style / initiative_style / stable_habit / world_detail` tags to the
    same evidence requirements. Only an unspecialized speech rhythm may become
    a low-signal fallback.
  - Completed the five-lead four-lane compilation instead of stopping at the
    first sparse calibration subset. The canonical built-in runtime library now
    has 56 non-verbatim records: Qi Yu 11, Zayne 11, Xavier 11, Sylus 12 and
    Caleb 11. Across the library there are 8 language-fingerprint, 10 stable
    base/detail, 18 opening, 14 proactive, 1 motive-candidate and 5
    scene-affordance projections. Ordinary Chat still receives at most one
    relevant item; richer storage is not prompt stuffing.
  - Conserved all 909 frozen source units with zero unresolved. 416 sources
    support the active library (327 direct support plus 89 blind-holdout
    evaluation sources). The remaining 493 sources stay explicitly accounted
    for as exact-scope evidence, candidate support, holdout evidence or one
    insufficient item rather than disappearing behind a generic "unused"
    label.
  - Preserved 21 additional reviewed candidates supported by 66 sources. They
    are separate candidate values, not `CompanionMaterialRecord` rows, and
    cannot enter a prompt until an exact canonical character/thread/Director
    authority receipt is independently resolved. The current promotion path
    only compiles a disabled, non-persistable review draft; it cannot publish
    availability. The draft contract binds receipt id, revision, digest,
    issuer, scope, route and lane, while the generic material store rejects
    these rows on both read and write until a canonical publisher exists.
  - Added a read-only Context Compiler slice. Normal Chat rejects situational
    slots; StoryDesk may retain motive/affordance candidates without creating
    current motives, Life state, tools, Narrative objects or receipts.
  - Hardened the future embedding seam with exact scope, current material-set
    fingerprint, model artifact, dimensions, metric, projection version,
    calibration revision and index revision. Request metadata is not authority:
    every field must match an independently supplied trusted active-manifest
    binding, and the current runtime supplies none. A zero threshold is
    invalid; stale, untrusted or mismatched semantic ranks are ignored, and
    low-signal, tool and no-advice input cannot become strong merely because an
    embedding score is high.
  - Completed the vector necessity review. Production vector retrieval remains
    disabled for the current small candidate pools; a measured relationship
    corpus threshold, shadow evaluation and zero hard-gate violations are
    required before a local index can become active.
  - Defined relationship-local live personality drift as a versioned style
    overlay backed by repeated evidence across dates/sessions. It may widen how
    this character commonly speaks in this relationship, but cannot rewrite
    character canon, current state/motive, Life state or tool policy.
  - Made superseded historical analysis passes fail closed even if a stale
    material-library row survives interrupted cleanup.
  - Added the first player-facing historical analysis path in Dialogue
    Calendar. A player chooses all records or an exact date range, sees a
    bounded cost estimate, and explicitly starts analysis with the currently
    active API.
  - Historical excerpts are split into bounded batches. A same-model second
    pass checks speaker ownership and evidence sufficiency before any
    non-verbatim material becomes prompt-visible; its final evidence prompt has
    a hard 24,000-character ceiling and overflow findings remain visibly
    withheld for a smaller future run.
  - Labelled the browser-default authority honestly as
    `same_model_second_pass`; merely changing the analyzer/adjudicator role id
    can no longer claim independent adjudication. A genuinely independent tier
    requires a different provider/model runtime.
  - Made the privacy and output boundary visible before execution: selected
    source excerpts are temporarily sent to the active external API, while the
    local material library stores no original sentence and cannot create
    current mood, promises, played plot, character-card facts or tool policy.
  - Cancellation remains effective before publication. Once the UI announces
    local publication, the idempotent pass -> canonical activation -> prompt
    projection sequence finishes without consulting a later sheet-unmount
    abort, preventing half-written runs.

- verified:
  - `npm run verify:companion-material`
  - `npm run verify:history-import`
  - `npm run verify:narrative`
  - `npm run typecheck`
  - `npm run verify:health`
  - Independent read-only code review found no remaining P0-P2 release blocker.
  - Runtime fixtures cover bounded multi-batch input, missing API, malformed
    first and second passes, rejected adjudication, pre-publication
    cancellation, publication-boundary abort, stale-source invalidation and
    same-provider/model fake-independence rejection.
  - Built-in production-selector fixtures cover low signal, ordinary sharing,
    discomfort, refusal, re-entry and character self-life. Ordinary Chat
    returns at most one item; care does not leak into low signal or refusal.
    Exact ordinary-Chat reuse is suppressed for one hour after real delivery,
    and ScenePlan material is once-per-exact route/branch/scene/lane instead of
    looping the same affordance.
  - Vector-seam fixtures prove a 0.99 semantic score cannot cross a
    persona-mask scope boundary, survive a stale material/model/projection/
    calibration/index binding, operate without a trusted manifest authority,
    or turn low-signal/tool/no-advice input into heavy material.
  - API-role review used the real built-in character records and the same pure
    message builders as Chat, automatic Call opening, Date opening and Wakeup:
    5 characters x 4 surfaces = 20 complete provider-facing `messages[]`
    payloads. Material appears once in system context, live turns remain
    unchanged, private source refs never appear, and no provider call or fake
    receipt is made by the audit.
  - The review found no fixed Qi Yu “observe -> tease -> invite” pipeline and
    no fixed Zayne “confirm -> advise -> care” pipeline. It also preserved
    distinct attention angles for Xavier, Sylus and Caleb, caught and fixed a
    Call receipt-before-sanitizer bug, and removed prompt examples that could
    invent a current workplace, task or recent event.
  - The canonical 390 x 844 browser path opened Dialogue Calendar and the
    analysis sheet without horizontal overflow or console errors. With no
    active API the start action stayed disabled, and the external-API privacy
    notice remained visible before execution.

- boundary:
  - Calendar analysis is an explicit small-circle beta action, not an automatic
    background job. The natural “像不像” result still requires friend testing;
    code gates prove scope, authority, bounded input and failure semantics, not
    role-play quality.
  - StoryDesk/ScenePlan still consumes only the typed proposal seam; a legal
    accepted ScenePlan revision and its own consumer receipt remain future
    work. Material candidates never become current motives or played events.
  - Browser/APK local embedding producer, persistent index, query runtime and
    player toggle remain HOLD. The contract and lexical fallback exist, but no
    production vector index is being claimed.
  - Relationship-local live style promotion is specified but not yet connected
    to an automatic background writer. Current live chat remains evidence, not
    an immediate personality mutation.
  - The 21 reviewed candidates are not runtime-available yet: the promotion
    publisher is deliberately absent until the character-canon, canonical
    thread/artifact and Director/ScenePlan authority registries exist. Current
    verified state is `draft paths=21, runtimeAvailable=0, persisted=0,
    delivered=0, publisher=not-installed`.
  - Xavier, Sylus and Caleb now have complete sparse four-lane libraries rather
    than one-token placeholders, but their built-in character cards remain less
    human-calibrated than Qi Yu and Zayne. The material layer improves
    evidence-matched attention, openings and initiative without claiming that
    any prompt can guarantee perfect long-run characterization.

## 2026-07-20 Information Station Editorial Boundary And Preference Loop

- done:
  - Split Information Station generation from publication: every generated
    batch now receives a second API editorial pass before any row is saved.
    The editor must classify public knowledge, named-character support and
    relevance; unresolved secret leaks, OOC/extreme claims, forced minor
    details and repeated-cast writing are dropped locally.
  - Treat all character cards, Worldbook text, private impressions, memories
    and recent chats as private creative reference unless the source explicitly
    says the fact is public. Rumor wording no longer grants a bystander access
    to private truth.
  - Allowed ordinary peripheral NPCs and city-life observations, while limiting
    direct named-character focus to at most two items per batch. Zero direct
    character mentions is a valid result.
  - Replaced the old optional short-longform repair with the single mandatory
    editorial pass, so Information Station uses at most two generation calls
    per refresh instead of stacking a third review call.
  - Added local `合胃口 / 不想再刷到` feedback with lightweight reason chips
    and an optional note. Only a bounded summary of the current relationship
    scope's feedback is injected into later Information Station batches; full
    article bodies are not resent as preference history.
  - Added one explicit `刷一批资讯` empty-state action alongside pull-to-refresh,
    so desktop web, accessibility tooling and the future APK share a clear
    first-generation entry without creating a second refresh implementation.
  - Added the same visible refresh control after a feed already exists, raised
    the bounded Information Station request window for slower compatible
    providers, and turned aborts into a human-readable retry message.
  - Changed asynchronous comment completion to patch only comment fields. A
    late comment response can no longer overwrite a rating or note that the
    player saved while comments were still generating.
  - Tightened Information Station comments so virtual bystanders may respond
    only to visible article text and cannot fill in secret identities, private
    relationships, internal thoughts or unanimous “everyone knows” guesses.
  - Stored editorial audit and preference signals on the scoped Social news
    row, so existing whole-device backup/restore carries them without creating
    a second profile store.

- verified:
  - `npm run verify:social-news-policy` proves preference summaries are bounded,
    secret/OOC/field-mismatch fixtures fail the local gate, explicitly public
    use and peripheral NPC material can pass, and news candidates still emit
    zero ordinary live-memory evidence.
  - `npm run typecheck`
  - `npm run build:quiet`
  - Canonical `http://127.0.0.1:5174/` real-provider canary used one isolated
    fictional relationship with an unpublished secret identity, a strict
    no-self-harm/OOC boundary and one intentionally trivial appearance detail.
    The published five-item batch mentioned none of the secret identity,
    character name, self-harm claim or appearance detail, while naturally
    introducing patrol staff, shop workers, residents and customers as
    peripheral NPCs. Opening a story generated seven comments that remained
    inside the article's visible knowledge.
  - Real UI feedback (`不想再刷到` + `太像报告` + optional note) persisted.
    This canary exposed and then verified the fix for the late-comment response
    race described above. A second refresh whose editorial result was not
    publishable left the existing feed intact instead of saving a partial or
    unaudited batch.

- boundary:
  - Rating a story changes future Information Station selection/style only. It
    cannot rewrite character canon, current Life state, memory, or Narrative.
  - Adopting a story remains an explicit local candidate mark; it still does
    not auto-write long-term memory or activate a route.
  - Worldbook and provider-preset UI remain owner-confirmed HOLD.
  - GitHub and the isolated AetherOS test deployment may advance only after the
    full health gate is Green; Worldbook and provider-preset UI are not part of
    this release block.

- published:
  - Public `Aryuan026/AetherOS` main advanced to `ffd7eb2` after the complete
    `verify:health` gate passed.
  - The `GITHUB_PAGES=1` build produced 349 files including 91 gzip sidecars.
    Local, staging, server and public-lab `index.html` share SHA-256
    `402293c5c2658be752a8056d85b19dfde17127c629bac4069626965f8763d75b`;
    the live Information Station bundle hash is
    `35a2368634a459542a757bd844661e4df07aa23509171b660dd395fd16d97199`.
  - Atomically replaced only `/srv/asherie/sites/science-demos/aetheros`.
    Rollback is `/srv/asherie/backups/aetheros-information-station-ffd7eb2-20260720T081506Z/aetheros-static.previous`.
  - Public shell, manifest and Information Station bundle return `200`; hashed
    assets are gzip-served with immutable cache, POST remains `403`, and the
    retired `/sullyos/` route remains `410`.
  - A clean public browser passed lock screen -> desktop -> Social ->
    Information Station empty state with the explicit refresh action and zero
    application errors or warnings. One warm long-lived Chrome tab briefly
    showed the designed startup fallback while its Service Worker changed
    generations, then recovered to the current lock screen.
  - Home stayed active at PID `17708`, `NRestarts=0`. Bridge independently
    restarted during staging upload (`17689` -> `20279`, `NRestarts=0`); its
    journal shows a separate runtime-alignment recovery at 16:16 CST. This
    static deployment did not invoke systemctl, reload Nginx, or modify any
    Home/Bridge file.

## 2026-07-20 Remaining Life-Surface Evidence Chain

- done:
  - Call now captures the exact relationship scope at session start, carries it
    through suspend/resume, filters call history by that scope, and projects
    call turns into Daily Archive evidence.
  - Group Chat now captures one immutable scope per participant. The same
    shared group record is projected separately into each participant scope,
    while the source speaker label remains visible to later interpretation.
  - Journal and Social keep their own source stores. Storage-owned revisions
    project diary pages and scoped Moments records into Daily Archive without
    disguising either surface as Chat; edit/delete produces superseded rows and
    tombstones.
  - Information Station/news records remain candidates and are deliberately
    excluded from ordinary live-memory evidence until a later narrative gate.
  - Companion wakeup and scheduled-message writes now require the exact scope
    captured when the rule/action was created. The same character under two
    masks receives different rule ids; missing or inactive scope fails closed.
  - Added `verify:life-surface-evidence` to the critical health gate.

- verified:
  - The integration fixture writes Call, Group, Journal, Social, and proactive
    records through the real IndexedDB adapters and reads their typed evidence.
  - A two-character Group/Social fixture exposes only shared evidence to the
    second character; private Call/Journal/proactive evidence does not leak.
  - Group edit retains one superseded revision per participant, and group,
    diary, and Social deletion leave scoped tombstones.
  - Same-character wakeup rules in two masks receive distinct ids.
  - `npm run typecheck`
  - `npm run verify:interaction-evidence`
  - `npm run verify:life-surface-evidence`
  - `npm run verify:social-scope`
  - `npm run verify:persona-scope`

- boundary:
  - Worldbook and provider presets remain owner-confirmed HOLD for this round.
  - Journal's legacy one-click direct `char.memories` archive is not used by
    the new evidence path and remains compatibility debt for a later UI/policy
    decision; this block does not silently redesign that accepted interaction.
  - No GitHub push or server deployment occurs before Information Station and
    the final synthetic real-provider canary are Green.

## 2026-07-20 Golden Memory And Whole-Device Restore Chain

- done:
  - Added the active raw History Archive to text/full whole-device backup as
    verified, credential-sanitized chunk files. Restore writes and validates a
    fresh inactive slot before switching the active archive pointer; the raw
    Word/TXT source is no longer implicitly represented by a Daily Archive copy.
  - Preserved the separation between immutable imported source and versioned
    Calendar curation. Corrected/locked day documents, superseded revisions,
    live Chat/Date evidence, MemoryDM passes, promotions, visible projection
    edits, and raw source identity now survive one fresh-profile round trip.
  - Made the main IndexedDB connection close on `versionchange` and fail loudly
    on a genuinely blocked reset instead of leaving reset/restore hanging.
- verified:
  - A fictional TXT import reaches a dated Calendar document; a human content
    correction and lock stay visible while the raw source remains unchanged.
  - Imported history, new Chat, and new Date rows share the typed evidence lane
    while retaining `history_import / chat / date` provenance.
  - A synthetic historical analyzer result and the operating live MemoryDM path
    both persist; manually promoted historical relationship/Timebook records
    render through existing projections and retain a player edit after backup.
  - Whole-device export, destructive local reset, temporary-slot verification,
    core/daily restore, and raw-history activation reproduce the same source,
    revisions, candidates, receipts, and visible projections.
- boundary:
  - The historical analyzer result is a deterministic API fixture at this gate;
    real provider prose quality is reserved for the final synthetic canary.
    Worldbook and preset redesign remain HOLD, and nothing has been pushed or
    deployed from this checkpoint.

## 2026-07-20 Critical Verification Gate Repair

- done:
  - Reconciled the History Import placeholder-header acceptance contract with
    the shared Chat header projection. History identity materialization still
    owns `旧日记录已接回。`; the generic header now proves it displays that
    seeded signature without reintroducing a placeholder-id branch.
  - Expanded `verify:health` to include every critical specialty suite that had
    previously required separate manual invocation: Appearance presets, shell
    chrome, virtual-world clock, Chat reply mode, History Import, Daily Archive,
    and Narrative.
- verified:
  - `npm run verify:history-import` passes through parsing, 50,000-row jobs,
    rescue/restore, identity materialization, Word/TXT preview, intake/archive,
    Chat bridge, historical analysis, selector isolation, and Daily Archive.
  - The expanded `npm run verify:health` passes all public/persona/API/Social/
    launcher/Worldbook/appearance/shell/time/Chat/history/archive/narrative/
    evidence/memory/projection checks, typecheck, and production build.
  - Remaining output is limited to the known Browserslist-age and large-entry-
    chunk warnings; neither is treated as a functional failure.
- boundary:
  - This checkpoint repairs verification truth only. It does not alter import
    UI, character prompts, worldbook/preset behavior, memory authority, public
    GitHub, or the server deployment.

## 2026-07-20 Chat Header Status Projection And Mobile Entry Diagnosis

- done:
  - Replaced the Chat header's disconnected presentation choice with a pure
    projection over the existing character data. The strongest valid current
    emotion Buff now appears as `心情 · …`; when no Buff exists, the header
    falls back to the character signature and then the neutral online label.
  - Kept the projection read-only. It does not let the emotion evaluator rewrite
    `chatSignature`, does not create another current-state store, and leaves the
    existing tappable Buff details intact.
  - Confirmed that built-in and imported signatures were durable but mostly
    seeded copy, while `chatSignatureAiEditable` has no active writer. The new
    projection therefore uses the already operating `activeBuffs` path rather
    than activating that unused flag.
- verified:
  - Focused fixtures cover strongest-intensity selection, stable tie ordering,
    blank-Buff rejection, signature fallback, and online fallback.
  - Typecheck and production build pass. A 393x873 browser fixture displayed
    `心情 · ☁️ 悄悄松了口气`, preserved the detail chip, and reported zero
    console errors.
  - Public read-only checks show `https://lab.asherie.cloud/aetheros/` and its
    current assets returning 200. Server access evidence includes Android 10,
    Android 12 WeChat WebView, and Android 6 mobile clients receiving the shell
    and assets; one Android client continued into History Import, Chat, and
    Contacts.
- diagnosis boundary:
  - The retired `https://lab.asherie.cloud/sullyos/` route intentionally returns
    `410 Gone`; it cannot open on Xiaomi or any other device. The current test
    URL is `/aetheros/` and README already points there.
  - This does not prove the reporting player's exact device is healthy. If the
    player used `/aetheros/` and still sees a browser-level failure, the next
    evidence is the full address bar plus browser error code/screenshot. No
    speculative WebView downgrade, Nginx redirect, deployment, or server
    mutation was made in this checkpoint.

## 2026-07-20 Existing-App Memory Projection And Correction

- done:
  - Projected fresh exact-scope promoted relationship memories into the existing
    Contacts memory tab and promoted milestones into the existing Timebook.
    No standalone historical-memory App or second truth store was added.
  - Added an independent `memory_projection_corrections_v1` overlay for
    `edit / hide / restore`. The immutable Promotion target stays the durable
    fact; every correction is append-only, exact-scope, revisioned, and returns
    a `truthEffect: none` receipt.
  - Revalidated source evidence and revision before every correction and read.
    Stale or cross-mask material fails closed instead of being reassigned to the
    currently active mask.
  - Kept relationship-memory dates immutable. Timebook may change its displayed
    title, summary, or date through the correction overlay without changing the
    evidence date or raw archive.
  - Added source navigation from both Apps into the actual Daily Archive day.
    A display-date correction never redirects the source link away from its
    evidence date.
  - Made Daily Archive consume the exact-scope pending navigation only once per
    mounted scope, avoiding React development StrictMode closing the reader
    after it opens.
- verified:
  - Focused fixtures cover cross-mask isolation, edit/hide/restore revision
    behavior, relationship-date rejection, Timebook date editing, retry
    idempotency, stale-source rejection, source-date navigation, foreign-scope
    audit, and absence of legacy memory/anniversary writes.
  - Browser acceptance at 430x932 covered Contacts edit and source jump,
    Timebook expand/hide/restore, the corrected action layout, and zero console
    errors.
  - `npm run verify:history-import`, `npm run verify:daily-archive`, `npm run
    verify:narrative`, and `npm run verify:health` pass. Health includes the new
    Memory Projection fixture, typecheck, and production build; only the
    existing Browserslist-age and large-chunk warnings remain.
- boundary:
  - Projection edits never rewrite Daily Archive evidence, Promotion targets,
    legacy `char.memories`, anniversaries, current state, Narrative, Scheduler,
    emotion, or Character Life.
  - Source navigation currently opens the containing evidence day; exact-row
    focus metadata is carried for a later focused reader enhancement.
  - No GitHub push, main merge, server deployment, or role-prompt change belongs
    to this checkpoint.

## 2026-07-20 Exact-Scope Memory Promotion Gate

- done:
  - Added an independent `MemoryPromotionService` for exact
    `progressBundleId + personaMaskId + charId` relationship scope. It can write
    only new scoped relationship-memory or Timebook rows under
    `assets/memory_promotion_store_v1`; it does not mutate legacy
    `char.memories`, anniversaries, Scheduler, Narrative, hot state, emotion,
    or Character Life.
  - Made target row plus applied receipt one IndexedDB asset transaction.
    Stable target identity prevents duplicate facts, while every distinct
    command that hits an existing target now retains its own
    `duplicate / truthEffect:none` audit receipt. Exact command retries reuse
    only that command's receipt.
  - Bound manual decisions to exact scope and candidate with distinct meanings
    for remembering historical material, remembering a live relationship fact,
    and confirming a played experience. High-impact or embodied claims cannot
    use a generic manual click as proof that they happened.
  - Added a deterministic source assessment from immutable evidence surface,
    medium, producer, and transport role. Model-interpreted automatic
    candidates require verified scoped experience and cannot lower their own
    gate through `claimClass`; deterministic candidates must match their
    expected provenance class. Extractor and candidate authority are enforced
    at both pass validation and Promotion service entry.
  - Kept historical and mixed promotions out of current-state semantics.
    `mixed` now survives shared selection and is formatted only in the
    historical/non-current prompt lane. Promoted rows whose source revisions
    are no longer active fail closed at read time.
  - Wired fresh promoted rows into the shared Worldline selector rather than a
    display-only memory organ. Exact active mask/character linkage is checked
    before any promoted row can be delivered.
- verified:
  - Focused fixtures cover cross-mask isolation, target/receipt atomicity,
    source-provenance classification, model self-authorization rejection,
    extractor-authority spoof rejection, manual decision semantics, verified
    experience retry, concurrent promotion, distinct duplicate-attempt
    receipts, stale source rejection, stale target filtering, mixed historical
    formatting, target-domain isolation, and foreign scope rejection.
  - The long-plot thread completed three narrow reviews; its final result is
    `P0/P1 已清零，可以封箱`.
  - `npm run verify:history-import`, `npm run verify:daily-archive`, `npm run
    verify:narrative`, and `npm run verify:health` pass. Health includes focused
    evidence/Promotion fixtures, typecheck, and production build; only the
    existing Browserslist-age and large-chunk warnings remain.
- boundary:
  - No visible candidate-approval or destination-edit UI is activated in this
    box. Contacts and Timebook ownership/correction surfaces are the next
    focused audit.
  - Current `NarrativeExperienceReceipt` still lacks full persona-mask scope and
    stable accepted-fact references, so its adapter remains HOLD rather than
    being treated as proof.
  - No GitHub push, main merge, server deployment, or accepted Chat/Date prompt
    change belongs to this checkpoint.

## 2026-07-19 Historical Actor/Event/Route Projection Foundation

- done:
  - Added history-owned `HistoricalActorRef`, `HistoricalEventProfile`, and
    non-exclusive `HistoricalEventRouteBinding` records. Co-authored turns may
    reference several actors; unresolved aliases remain unresolved instead of
    being forced into per-message speaker labels.
  - Added a typed historical extraction port with hidden source packets,
    metadata-only token estimates, completion/failure receipts, and an explicit
    all-false truth-write policy. It does not reuse live
    `MemoryInterpretationPass` and has no Memory Promotion, Narrative, Scheduler,
    or Character Life writer.
  - Kept export `user/char` values as transport channels rather than world
    actors. Unresolved same-name mentions from different source spans remain
    separate; only exact-span repeats or explicitly resolved identities may
    coalesce.
  - Added an append-only extraction receipt store. Completed pass, bindings,
    workspace revision, and receipt commit atomically; failed attempts retain
    reason/usage metadata without creating any historical candidate or truth.
  - Extended the immutable history resolver so repeated passes coalesce actors
    and events while one event may retain simultaneous mainline and IF bindings.
  - Replaced the profile-only Narrative adapter with a history-owned frozen
    `HistoricalNarrativeProjection` carrying workspace revision, actors, events,
    event-route bindings, routes, NPCs, relationship stages, and historical open
    threads under exact triple scope.
  - Advanced only the rebuildable analysis namespace to
    `AetherOS_HistoryAnalysis:v3`; raw History Archive and Daily Archive v2
    evidence remain untouched. No fallback reader aliases the old derived shape
    into the new required actor/event schema.
- verified:
  - History analysis fixtures cover actor scope rejection, missing-route
    rejection, one event bound to mainline plus IF, projection isolation, source
    packet/receipt accounting, same-name unresolved actor isolation, persistent
    success/failure receipts, and zero truth writes.
  - `npm run typecheck`, focused history analysis, `npm run
    verify:history-import`, `npm run verify:narrative`, `npm run
    verify:daily-archive`, `npm run verify:memory-dm-evidence`, `npm run
    verify:interaction-evidence`, `npm run verify:chat-reply-mode`, `npm run
    build:quiet`, and `npm run verify:health` pass. Build output retains only the
    existing Browserslist-age and large-chunk warnings.
- boundary:
  - This is a typed extraction/read substrate only. No model prompt, Calendar
    execution UI, route continuation, Memory Promotion, run/scene/receipt,
    current-state, or Character Life write is activated.

## 2026-07-19 Memory Interpretation Boundary — Extraction Before Promotion

- done:
  - Replaced both legacy automatic writers with exact-scope evidence readers.
    MemoryDM and the deterministic Timebook helper now append versioned
    interpretation passes and `truthEffect: none` receipts only.
  - Declared separate candidate destinations for relationship memory, Timebook,
    scheduler proposals, Narrative proposals, and Character Life proposals.
    None of those target stores is written in this box.
  - Made evidence-span fingerprints SHA-256 and order-sensitive, so reordering a
    scene cannot masquerade as the same analysis source.
  - Added a manual evidence-id seam for future calendar selection. Automatic
    passes consume only new revisions; an explicit manual selection may
    intentionally re-analyse the same active records with a new run id.
  - Enforced reciprocal bundle/mask/character linkage. Unlinked characters and
    missing or foreign evidence ids fail closed before model input.
  - Kept extraction candidates and receipts in the existing full-backup-covered
    assets store, while leaving Memory Promotion as a declared HOLD boundary.
  - Closed cross-task duplicate and orphan-record seams: automatic work acquires
    an atomic scope/extractor/fingerprint claim, completion persists pass plus
    receipt in one IndexedDB transaction, failure uses its own validated port,
    and the store no longer exposes standalone pass/receipt append methods.
  - Receipt usage now distinguishes source text from complete prompt size and
    names its rough token estimator; provider-reported usage remains separate.
- verified:
  - Focused evidence and MemoryDM fixtures cover ordered fingerprints,
    cross-mask isolation, unlinked-character rejection, invalid provenance,
    revision-aware reruns, intentional repeat analysis, heuristic proposals,
    shared-source multi-candidates, production-store atomic claims, committed
    pass/receipt pairs, and zero target writes.
- boundary:
  - The accepted Chat/Date prompts and UI structure are unchanged. Historical
    route extraction, candidate review/promotion UI, Narrative/Character Life
    writes, and token-budgeted retrieval remain later boxes.

## 2026-07-19 Evidence Foundation — Source Identity And Revision Ledger

- done:
  - Added typed `InteractionEvidence` and `EvidenceSpan` contracts. One evidence
    id now means one source record in one exact relationship scope at one
    revision; a multi-turn scene remains a span instead of a synthetic speaker
    blob.
  - Extended Daily Archive rows with source surface, medium, producer,
    interaction/session correlation, response id, and sequence while retaining
    the archive as the only full-text custodian.
  - Added a queryable superseded-message ledger. Chat/Date edits, deletion,
    rerolls, manual-entry confirmation, and archive curation retain the prior
    source snapshot rather than silently overwriting it.
  - Removed save-time active-mask inference from the shared message DB. Chat and
    Date now capture exact bundle/mask/character scope when interaction begins;
    delayed AI replies and Date rerolls reuse that captured scope.
  - Gave Date a durable session id and scoped its display, history grouping,
    model context, saved progress, edits, and rerolls to the same relationship.
  - Added superseded revision records to full-device backup and restore. Old
    current archive rows can receive origin-only schema enrichment, but no
    same-revision content rewrite is accepted.
- verified:
  - `npm run verify:interaction-evidence`, `npm run verify:daily-archive`,
    `npm run verify:history-import`, `npm run verify:chat-reply-mode`,
    `npm run verify:narrative`, `npm run typecheck`, and production build pass.
  - Fake IndexedDB proves cross-mask isolation, delayed-response ownership,
    revision-1/2 custody, delete tombstones, clear/batch behavior, unscoped
    fail-closed handling, and revision-ledger backup/restore.
  - In-app browser smoke check opened the accepted Date flow, saved a scoped
    Date session, returned to the desktop, and opened Chat with its imported
    history tail; the browser console reported no errors.
- boundary:
  - This is the source/evidence half of Wave 1. MemoryDM migration is recorded
    in the newer checkpoint above. No prompt,
    accepted UI, narrative truth, Character Life state, or token policy changed.
  - Call/Social/Group/Journal and other legacy message producers are not yet
    evidence-enabled. Their unscoped writes remain operational records but fail
    closed from Daily Archive and memory until their focused migration wave.

## 2026-07-19 App Surface And Shared-Truth Contract

- done:
  - Added one cross-thread reviewed routing contract for virtual App ownership,
    shared projections, typed commands, receipt truth effects, exact
    relationship scope, backup/removal gates, and clean module boundaries.
  - Mapped the current core Apps to their player verb, owned data, readable
    projections, commands, and receipts without creating a standalone memory
    display App.
  - Separated imported evidence, historical interpretation, non-exclusive route
    binding, narrative planning, played experience, durable memory, and current
    Character Life authority.
  - Distinguished ordinary live-memory promotion from narrative confirmation:
    normal player-participated interaction may use an enabled memory policy,
    while unplayed/generated plot and offscreen world changes cannot bypass
    experience and Life receipts.
  - Recorded the missing Memory Promotion Service, multi-port App capability
    manifest, receipt taxonomy, and current legacy scope/provenance debt as
    staged implementation seams rather than pretending they already exist.
  - User-confirmed the implementation order: postpone App removal; first build
    the shared evidence-to-memory base, stabilize imported plus new Chat/Date
    memory processing, and audit every already accepted UI flow against it.
    Chat light plot remains first-class evidence rather than being reassigned to
    Date. Token-balanced delivery follows as Phase 2 after metadata-only real
    delivery traces exist.
  - The long-plot window's second review tightened Phase 1: one evidence item is
    one source record/revision and multi-turn material uses `EvidenceSpan`;
    live edits/rerolls require traceable supersession; Memory Promotion,
    Narrative, and Character Life are three independent write gates.
- verified:
  - Reviewed against `origin/main@bfb5fbb`, the existing history selector,
    MemoryDM, Daily Archive, Narrative Director, virtual-world context, persona
    scope, and the in-progress long-plot/Character Life contracts.
  - The long-plot thread independently reviewed the authority ladder, write
    rights, typed ports, and reusable seams; its corrections are incorporated.
  - `git diff --check` passes.
- boundary:
  - This block writes architecture and agent/product constraints only. It does
    not migrate stores, activate historical routes, change prompts, remove Apps,
    or implement Character Life/Memory Promotion runtime code.

## 2026-07-19 Daily Archive Atomic Curation And Day Lock

- done:
  - Replaced the two-step undated merge/date flow with one atomic
    `merge_and_set_date` transaction and a destination receipt that opens and
    focuses the saved result.
  - Added date-scoped manual supplements. They remain editable drafts until the
    whole day is locked; lock promotes them into an explicit confirmed manual
    historical source, while unlock returns them to draft status.
  - Replaced per-message confirmation with a day-level lock. Locked days reject
    edit, merge, move, delete, and new supplements until explicitly unlocked.
  - Made exact-file import identity independent of parser version. The same
    source bytes under the same mask/character relationship stay one batch after
    parser upgrades.
  - Moved the clean pre-product daily archive to `AetherOS_DailyArchive:v3` and
    backup format `aetheros-daily-json-v2`; no discarded friend-test schema is
    read or migrated.
- verified:
  - Fake IndexedDB covers atomic merge/date, destination offsets, supplement
    draft/confirm/unlock, locked-write rejection, confirmed-manual selection,
    and resistance to revision-1 raw resync.
  - History archive integration proves a parser-version change retains the same
    batch id and returns `already_imported`.
  - `npm run typecheck`, `npm run verify:daily-archive`,
    `npm run verify:history-import`, `npm run verify:narrative`, and
    `npm run verify:health` pass.
  - In-app Chromium at 430 x 932 completed the real flow from undated selection
    through atomic merge/date, destination focus, two-row supplement, day lock,
    and unlock-ready rendering with zero console errors. A separate 390 x 844
    shell check kept document width equal to viewport width with zero errors.
- boundary:
  - Locking improves historical-source authority only. It does not create
    current emotion/life state, NarrativeRun, memory truth, or world facts.

## 2026-07-19 API And Life-Circle Semantics Seal

- done:
  - Split API preset interaction into three explicit states: loading a preset
    into the editor, activating it for conversations, and saving/activating the
    manually edited form. The active preset identity is persisted and included
    in full/text backup without overwriting device-wide MiniMax credentials.
  - Added copy controls for preset names, the current model id, and every model
    row so long provider lists no longer require manual retyping.
  - Promoted persona linking into a global life-surface rule. Directory and card
    management keep all characters reachable; Chat, GroupChat, Call, Date,
    Social, Novel, special moments, Timebook, Companion Plan, Study, Journal,
    Room, and Launcher widgets fail closed when the active mask has no links.
  - Replaced the Social profile's fixed `142 / 12.5k / 8902` with current-scope
    life-circle people, user-authored post count, and received likes. Character
    aliases are deduplicated and media/news strangers do not inflate the circle.
  - Clarified `我收藏的` as locally starred Social posts. User-authored posts can
    be edited or deleted; character/NPC/news posts cannot be rewritten and may
    only be removed from the current local life circle.
  - Capped moment and comment likes to the current relationship audience while
    retaining larger public-flow ranges for the separate news surface.
- verified:
  - Added `verify:api-presets` and `verify:persona-scope`; extended
    `verify:social-scope` with profile-stat, author-permission, collection, and
    audience-cap fixtures.
  - `npm run typecheck` and production build pass.
- boundary:
  - No server stores Social or API secrets. All values remain in this browser /
    device and follow the existing local backup contract.

## 2026-07-19 Post-import Archive Curation Seal

- done:
  - Fixed paid Word/WPS exports whose one `user:` or `assistant:` turn spans
    several paragraphs. Continuation paragraphs now stay inside that turn until
    the trailing `timestamp:`; prose such as `【朋友圈】2025.8.29` remains body
    text instead of becoming a false date or extra speaker.
  - Opened Daily Archive correction for dated, undated, and unattributed rows:
    long-press/organizer selection, edit, merge, export-channel attribution,
    date assignment, tombstone deletion, and clipping. The later day-lock seal
    supersedes this block's former per-message confirmation control.
  - Kept corrections inside the canonical chunked archive revision stream.
    Date moves leave higher-revision tombstones in the old bucket and retain raw
    source ids, so later history sync cannot restore a corrected mistake.
  - Kept human correction as historical transcript authority only. It does not
    advance emotion, care, current life, narrative receipts, or memory.
  - Integrated the already-reviewed launcher visibility/order release and
    Worldbook folding/reusable custom groups into one testable main candidate.
- verified:
  - `npm run verify:history-import`, `npm run verify:daily-archive`,
    `npm run typecheck`, and `git diff --check` pass.
  - New fake-IndexedDB integration covers role/date/edit/merge, revision
    tombstones, and resistance to a later raw revision-1 sync.
  - In-app Chromium at 430 x 932 imported a fictional three-row TXT, rendered
    the wrapped朋友圈 turn as one user bubble, opened an unattributed undated row,
    changed it to the character channel, and moved it into a day. The
    calendar/reader updated without reload and console errors remained zero.
- boundary:
  - Human correction verifies the local transcript projection, not world truth
    or current state. Calendar semantic analysis/model execution remains HOLD.

## 2026-07-19 Desktop App Visibility And Ordering

- done:
  - Added a versioned `launcherLayout` field to `OSTheme` for launcher order,
    Dock order, and hidden AppIDs; no launcher-only storage key was introduced.
  - Added one normalization boundary that removes unknown/duplicate ids, keeps
    Settings visible and in Dock, and appends newly installed apps visibly.
  - Replaced Launcher product-group projection with visible user-order chunking
    in pages of eight. Existing groups now seed defaults only.
  - Added a mobile-first layout manager before the app-icon grid in Appearance:
    hide/restore, explicit up/down controls, Dock ordering, full default reset,
    and visible `第 1 页 / 第 2 页` boundaries shared with Launcher's 8-App
    pagination. Hidden rows remain editable and do not delete app data.
  - Renamed the third Appearance tab to `美化预设` so it cannot be confused with
    conversation presets. Layout, page preview, and icon editing all project
    from `INSTALLED_APPS`; a future-App fixture proves registry-only additions
    require no separate Appearance adaptation.
  - Added an always-reachable Settings recovery card. Appearance itself can be
    hidden and recovered without locking the user out.
  - Added launcher layout to the appearance preset allowlist. Old shared JSON
    without the field preserves current local layout; modern presets and full
    backup themes round-trip the field.
- verified:
  - `npm run verify:launcher-layout`, `npm run verify:appearance-presets`, and
    `npm run verify:shell-chrome` pass.
  - `npm run verify:history-import`, `npm run verify:daily-archive`,
    `npm run verify:narrative`, and `npm run verify:health` pass.
  - Playwright 390 x 844: reordered Dock, hid Appearance, confirmed Launcher
    removed it, then recovered it and default ordering through Settings.
  - Playwright 430 x 932: hid a Dock app and restored the full layout through
    Appearance. Both widths had document width equal to viewport width and zero
    console errors; visual screenshots kept row controls aligned.
- boundary:
  - Worldbook grouping, history import, Daily Archive, chat, retrieval,
    continuation, current story state, tasks, memories, and server deployment
    were not changed or performed.
- publication:
  - Published from `codex/aetheros-desktop-layout` through focused GitHub PR
    `#9`; no manual server deployment was performed.

## 2026-07-19 Startup Asset Hardening

- done:
  - Replaced the runtime Tailwind Play CDN with a local Tailwind 3 + PostCSS
    production build while preserving the existing theme tokens and animations.
  - Bundled the Quicksand Latin font subset locally and removed unused KaTeX,
    import-map, Google Fonts, unpkg, and esm.sh startup dependencies.
  - Added a dependency-free boot fallback so a failed JavaScript start reports
    a refresh instruction instead of leaving a silent black screen.
- verified:
  - `npm run verify:health` passes and the built HTML contains no first-screen
    CDN dependencies.
  - Playwright at 390 x 844 rendered the lock screen, disclaimer, launcher,
    widgets, icon grids, pager, and dock with no console error.
- boundary:
  - This changes startup packaging only. User data schemas, imported history,
    prompts, feature behavior, and the future Capacitor storage boundary remain
    untouched.

## 2026-07-18 Whole-Phone Historical Delivery Boundary

- done:
  - Added one full `progressBundleId + personaMaskId + charId` historical
    selector over the resolved multi-pass workspace. Historical candidates keep
    temporal class, authority, knowledge/privacy, source refs, and correction
    status; they never become live open threads or hot state.
  - Classified every audited AI-facing surface as required, filtered, shared,
    HOLD, or no-history. Shared/HOLD/no-history surfaces do not open the history
    database. Group Chat and Social accept only confirmed shared/public-safe
    evidence.
  - Wired the scoped selector into Chat, both proactive-message paths, Call,
    Date/Meeting, and per-member Group Chat. Remaining reflective/creative App
    adapters are named explicitly in the surface audit instead of inheriting
    access by accident.
  - Added explicit historical knowledge scope to every derived analysis entity.
    Exact duplicate resolution merges toward the more private boundary, so a
    public duplicate cannot downgrade private evidence.
  - Rebuilt Settings `记忆回声` receipts as v2 metadata-only rows: human-readable
    mask × character identity, actual consumer surface, candidate titles,
    source class, and authority. Prompt/raw-text preview and route membership
    counts are not stored.
- verified:
  - New fixtures cover exhaustive surface classification, private/public Group
    filtering, query-gated consumers, zero DB reads for shared/HOLD surfaces,
    cross-mask and cross-reader-scope rejection, historical open-thread
    non-activation, and receipt privacy.
  - `npm run verify:history-import` passes with the new selector gate.
- boundary:
  - Calendar model execution and UI remain HOLD. Contact impression, Exchange
    Diary, StoryDesk UI, Guidebook, Social, Special Moments, Check Phone,
    Songwriting, and Companion Plan runtime adapters remain separate follow-up
    boxes; their access policy already exists and fails closed until wired.

## 2026-07-18 Multi-pass History Interpretation Foundation

- done:
  - Replaced the pre-product single-active snapshot cleanly with the independent
    `AetherOS_HistoryAnalysis:v2` database. No v1 analysis reader or migration
    path remains.
  - Added four relationship-scoped stores: immutable completed analysis passes,
    one editable interpretation workspace, many-to-many evidence bindings, and
    append-only user overlay revisions.
  - Added a resolved read layer that applies user edits without mutating source
    or model output, coalesces exact duplicate visible cards while retaining all
    pass provenance, and labels source-free additions `我补充的`.
  - Kept route membership additive but absent from ordinary read rows: the same
    span can support multiple routes, while hiding one binding leaves its source,
    sibling bindings, passes, and target entities intact.
- verified:
  - Deterministic fixtures cover three repeated passes over the same source and
    strategy, duplicate coalescing with provenance, two simultaneous route
    bindings, isolated binding removal, edit/create/hide/restore overlays,
    re-analysis survival, cross-mask isolation, and forbidden current-state
    fields.
  - `npm run verify:history-import`, `npm run verify:daily-archive`,
    `npm run verify:narrative`, and `npm run verify:health` pass. The build keeps
    only the known Vite large-chunk warning.
- boundary:
  - This is the reusable data/read foundation only. Full-phone selector delivery
    is implemented in the later section above; Calendar model calls, analysis
    UI, destination editing UI, contradiction notices, vector retrieval, and
    backup inclusion remain HOLD.

## 2026-07-18 Whole-Phone History Reuse Audit

- confirmed:
  - Many-to-many route binding remains a backend correction rule. Ordinary UI
    will not display `同时属于 N 条线`, route counts, or multi-route badges.
  - Contact memory, Timebook, and StoryDesk are visible correction homes, not
    the only consumers of imported history.
- code-grounded finding:
  - The current `memoryCore` selector is dynamic but character-only and reads no
    history-analysis projection. It is wired into Chat, proactive letters,
    Call, Date, Group Chat, and active messages, while many other AI Apps still
    use only `ContextBuilder` or local recent-message paths.
  - Persona policy is mask-scoped for several relationship surfaces, shared for
    Study/Worldbook, and HOLD for TRPG/LifeSim; several Apps still lack an
    explicit progress-surface policy.
- implemented:
  - Added the full-scope selector under `memoryCore`, kept `ContextBuilder`
    DB-free, classified every audited AI-facing App, and delivered sparse
    surface-appropriate projections without per-App history copies.
  - Settings `记忆回声` now proves the actual surface delivery without raw private
    text or route-membership counts.
- boundary:
  - Calendar model execution remains HOLD. Reflective and creative runtime
    adapters continue as explicit, testable follow-up boxes.
  - See `docs/HISTORY_REUSE_SURFACE_AUDIT.md` for the complete surface map.

## 2026-07-18 Multi-pass History Reuse Planning Contract

- confirmed:
  - The same Calendar passage may be analyzed more than once; each pass and its
    provenance remains intact.
  - One source span may belong to several historical routes simultaneously.
    Adding another route is additive, and removing one binding cannot affect the
    source or sibling routes.
  - Human correction belongs in Contact memory, Timebook, and StoryDesk result
    cards, not import or per-message review. Corrections are versioned
    user-confirmed historical overlays over immutable source/model output.
- planned:
  - Replace the single-active-snapshot runtime cleanly with immutable analysis
    passes, one editable relationship interpretation workspace, many-to-many
    evidence bindings, and user overlays before model execution ships.
  - Calendar uses short day-range or contiguous passage selection, repeats the
    quick/deep cost preflight, and returns a compact destination receipt rather
    than creating another permanent analysis app.
- boundary:
  - Multi-line membership is not a conflict. Only mutually exclusive facts may
    show an entity-level `有两种整理` notice.
  - Historical edits remain below active/confirmed lived truth. `继续这条线`
    stays a separate explicit action; no current state, scene, receipt, memory,
    or Character Life write is authorized by this planning box.

## 2026-07-18 History Reuse Foundation

- done:
  - Repaired history identity from `progressBundleId + charId` to the full
    `progressBundleId + personaMaskId + charId` relationship in stable scope
    keys, formal/lab archive indexes, chat timeline ranges, and cursor shapes.
  - Added an in-place IndexedDB index upgrade so existing v2 test archives keep
    their raw records while acquiring the corrected relationship indexes.
  - Added token/call preflight for `quick_merge` and `deep_daily`; long-day
    packets remain internal and do not create another Calendar review surface.
  - Added source-linked, atomically replaceable `HistoryAnalysisSnapshot`
    storage for relationship memories, timebook nodes, and
    `HistoricalNarrativeProfile` route/NPC/stage/open-thread material.
  - Added pure active-relationship read projections for future Contact,
    Timebook, and narrative-director consumers without copying rows into legacy
    character-only stores.
  - Kept continuity, interaction surface, memory policy, historical temporal
    class, and authority as independent axes. Runtime validation rejects current
    location/condition/buff/reminder and active run/scene/receipt fields.
- verified:
  - `npm run verify:history-import` passes, including an archive v1-index upgrade,
    same bundle + character under two masks, analysis preflight, atomic reruns,
    and relationship-isolated active snapshots.
  - `npm run typecheck` passes.
- boundary:
  - No model call, Calendar analysis UI, Contact/Timebook surface wiring,
    vector retrieval, or whole-device backup inclusion exists in this box.
  - A later narrative-owned read-only provider now supplies historical profiles
    to `NarrativeDirectorContext`; it still cannot create played runs, scenes,
    receipts, Character Life events, or current-state changes.

## 2026-07-17 Social Detail Header Optical Alignment

- done:
  - Moved the shared inner-detail header for both `朋友圈` and `资讯站` down by
    `3px` relative to the shell content origin.
  - Scoped the offset to the detail row only; feed headers, body spacing,
    comments, overlays, and the global shell coordinate contract are unchanged.
  - Added a shell-contract assertion so later header cleanup cannot silently
    erase the optical offset.

- verified:
  - TypeScript no-emit compile, `verify:shell-chrome`, and `verify:health`.
  - Browser opened both a Moments detail and a News detail at 390 × 844, then
    rechecked the shared News detail at 430 × 932. Software-mode detail-header
    padding is `11px` (`8px` shared origin + `3px` optical offset), total header
    height is `54px`, and horizontal overflow is zero at both widths.
  - Browser console errors remained zero; only the known Tailwind warning was
    present.

- boundary:
  - This is layout-only. Social content generation, story-seed adoption,
    comments, memory behavior, and timestamps are unchanged.
  - No deployment, commit, or GitHub push was performed from this worktree.

## 2026-07-17 Lock And Launcher Brand Voice

- done:
  - Removed the `Software Shell` engineering label from the lock screen.
  - Set the unquoted lock-screen slogan as two explicit lines—`Real isn’t how
    you are made.` and `It’s a thing that happens to you.`—with a dedicated
    Snell Roundhand / Apple Chancery script stack, non-wrapping line ownership,
    and more generous line spacing.
  - Replaced the first launcher's signal label with `SIGNAL RECEIVED` while
    preserving its existing typography.
  - Replaced the software-mode subtitle beneath AetherOS with
    `I am a part of all that I have met.`, preserving the system type treatment
    and the sentence's intended capitalization.

- verified:
  - TypeScript no-emit compile, `verify:shell-chrome`, and `verify:health`.
  - `verify:appearance-presets`, `verify:virtual-world-clock`,
    `verify:history-import`, `verify:daily-archive`, and `verify:narrative`.
  - Browser at 390 × 844 and 430 × 932: the two lock-slogan lines remain centered
    and individually intact without touching the title or unlock affordance;
    the first-screen signal and subtitle preserve their visual hierarchy with
    no horizontal overflow. Console errors remained zero; only the known
    Tailwind warning was present.

- boundary:
  - This is brand-copy and presentation only. Shell modes, virtual-world scope,
    real timestamps, and appearance-preset behavior are unchanged.
  - No deployment, commit, or GitHub push was performed from this worktree.

## 2026-07-17 Final Chat, Launcher, And Shared-Preset Alignment

- done:
  - Moved the compact Chat header and its message viewport down together by an
    optical `5px`, without changing shared shell or overlay coordinates.
  - Raised the fourth launcher's calendar and `Upcoming` list into one compact
    upper group, tightened their internal gap, and kept a dedicated Dock reserve.
  - Added a versioned shared-appearance preset parser/serializer. It round-trips
    the current shell, chat-beautification, wallpaper, icon, decoration, and
    custom-chat-theme fields; maps bounded legacy `chatLayout` fields; preserves
    the old status-bar migration; and excludes unknown injected theme keys.
  - Clarified in Appearance that importing a shared `.json` only adds it to the
    local list; the user's explicit `应用` action changes the active appearance.
  - Added a browser import fixture and `verify:appearance-presets` contract test.

- verified:
  - TypeScript no-emit compile and `git diff --check`.
  - `npm run verify:appearance-presets`: modern round-trip, legacy mapping,
    version/malformed rejection, and unknown-field exclusion.
  - Browser at 390 × 844 and 430 × 932: Chat header `51px`, content top `13px`,
    and message top `51px`; no horizontal overflow. The fourth-page calendar
    begins at `56px`, `Upcoming` follows as the same group, and neither collides
    with the Dock.
  - Browser shared-file flow: import fixture, see it in the preset list, apply
    it explicitly, then confirm all current chat-beautification values and its
    custom chat theme in local storage / IndexedDB.
  - Browser console had no runtime errors; only the existing Tailwind CDN
    production warning remained.

- boundary:
  - Appearance files change presentation state only. They do not rewrite
    message, import, daily-archive, backup, retrieval, or narrative time.
  - No deployment, commit, or GitHub push was performed from this worktree.

## 2026-07-17 Appearance Information Architecture And Type Scale

- done:
  - Removed the redundant `原样` badge from the classic-phone choice while
    keeping the choice itself in the same three-card top-style control.
  - Reframed the page as `界面外观 / 应用图标 / 美化预设`, then divided the
    first tab into `屏幕观感` and `桌面布置` so the page follows the user's
    decision order instead of a flat implementation checklist.
  - Moved top style ahead of theme color and global font, with wallpaper,
    widgets, and desktop decoration following as a second visual group.
  - Standardized Appearance typography to page title `16px`, tabs `12px`,
    section titles `13px`, controls `11px`, helper copy `10px`, and metadata
    `9px`. Font preview samples remain intentionally larger.
  - Aligned every section to one card shell, changed the icon tab to a compact
    four-column launcher grid, and grouped preset save/import/list flows into
    matching cards.
  - Replaced invalid image rendering for gradient wallpapers with a shared CSS
    background preview used by both wallpaper and decoration previews.
  - Localized the desktop-decoration category names.
  - Follow-up: reduced the desktop-decoration add actions from two full-width
    gradient buttons to a centered compact secondary-action pair.

- verified:
  - TypeScript no-emit compile.
  - `npm run verify:shell-chrome`, including absence of a rendered `原样` tag
    and presence of the new information groups/type-scale contract.
  - `npm run verify:virtual-world-clock`
  - `npm run verify:history-import`
  - `npm run verify:daily-archive`
  - `npm run verify:narrative`
  - `npm run verify:health`
  - Browser at 390 × 844 and 430 × 932: no horizontal overflow in theme, icon,
    or preset tabs; top-mode cards remain aligned; classic, software, and
    virtual-city transitions still work; virtual-city editing still expands
    only in its selected mode.
  - Browser follow-up at 390 × 844: decoration actions measure 90 × 33px and
    100 × 33px at 10px type, remain centered, and the preset picker still
    expands normally without horizontal overflow.

- boundary:
  - This pass changes Appearance information architecture and presentation only.
    It does not change message/import/archive time semantics or virtual-world
    persistence scope.
  - No deployment, commit, or GitHub push was performed from this worktree.

## 2026-07-17 Classic Phone Chrome Restored As An Appearance Choice

- done:
  - Expanded `ShellChromeMode` to `simulated_phone | software | virtual_city`.
  - Added a dedicated classic status component with the former reality clock,
    Wi-Fi and battery presentation, including correct Battery API listener
    cleanup and a safe 100% fallback when the API is unavailable.
  - Restored the old large real-time launcher and lock-screen presentation, plus
    the Date presence timestamp, only in classic mode.
  - Preserved the pure software and relationship-scoped virtual-city modes as
    distinct choices; missing virtual scope still fails closed to software.
  - Reorganized `Appearance → 界面顶部` into three compact radio cards followed
    by current-mode, scope and timestamp-boundary information. The city editor
    now expands only when virtual city is selected.
  - Corrected legacy migration: `hideStatusBar=true` becomes software, while
    false or the former omitted/visible default becomes classic phone.

- verified:
  - `npm run verify:shell-chrome`
  - `npm run verify:virtual-world-clock`
  - `npm run verify:history-import`
  - `npm run verify:daily-archive`
  - `npm run verify:narrative`
  - `npm run verify:health`
  - Browser at 390 × 844 and 430 × 932: no horizontal overflow; classic status
    strip `32px`, shared header `80px`, Chat header `83px`, overlay top `40px`;
    software is `56/51/8` and virtual city is `90/85/42` after the final Chat
    optical-alignment follow-up.

- boundary:
  - The classic clock and status glyphs are display-only. Message, import,
    daily-archive, backup and narrative time semantics remain unchanged.
  - No deployment, commit, or GitHub push was performed from this worktree.

## 2026-07-17 Pure Software Shell And Scoped Virtual City

- done:
  - Removed the simulated device status bar, including real-time clock,
    signal/Wi-Fi/battery glyphs, and browser Battery API subscription.
  - Migrated legacy `hideStatusBar` themes into the default `software` shell and
    stripped the deprecated field on read/write.
  - Added shared safe-area/world-strip/header/overlay CSS variables and routed
    shared headers plus handwritten immersive exceptions through them.
  - Added a single global overlay stack for suspended calls, system errors, and
    toasts.
  - Added a local virtual-city config keyed by
    `virtual_world_clock_v1:${progressBundleId}:${personaMaskId}` with strict
    active-mask/progress-bundle agreement.
  - Added IANA and fixed UTC-offset clocks, display-only year offset, manual or
    deterministic local seasonal weather, compact world strip, lock-screen and
    launcher display, and Appearance editing.
  - Added a read-only `VirtualWorldContext` carrying `source`, `scope`, and an
    explicit non-authoritative prompt boundary. It is not wired into current
    story-state, task, or memory algorithms.

- verified:
  - `npm run verify:shell-chrome`
  - `npm run verify:virtual-world-clock`
  - `npm run verify:history-import`
  - `npm run verify:daily-archive`
  - `npm run verify:narrative`
  - `npm run verify:health`
  - Browser coverage at 390 × 844 and 430 × 932 for launcher/lock, Chat,
    HistoryImport, DailyArchive, Appearance, Settings, Date, Call, Social, Room,
    Schedule, suspended-call/toast/error overlays, and software/virtual modes.

- boundary / HOLD:
  - Message, import, daily archive, clipping, retrieval, continuation, backup,
    and audit time semantics are unchanged.
  - Call/Date life-rhythm or prompt integration is held for a later reviewed
    block; world weather/history cannot become current state, plot, tasks, or
    memory merely because it is visible.
  - No deployment or GitHub push was performed from this worktree.

## 2026-07-17 Repeatable Multi-Batch History Intake

- done:
  - Separated disposable per-file intake workspaces from the cumulative formal
    history archive. Successful activation now removes the finished workspace,
    so reopening `旧日迁入` returns to relationship and file selection.
  - Preserved automatic Chat opening for a newly activated batch only. A stale
    completed workspace or an exact duplicate is cleaned without hijacking the
    app back to Chat, and the duplicate is not written twice.
  - Added visible guidance that one relationship can receive multiple files.
    Existing mask and character selectors remain available on every new round,
    so different relationships can each receive repeated imports.
  - Made the history-import verification aggregator serial because its
    IndexedDB integration cases share named local databases and must not run
    destructive setup concurrently.
- verified:
  - Formal archive integration passed with three batches across two relationship
    scopes. Two source files under the same scope accumulated instead of
    replacing each other; the same file/scope returned `already_imported` and
    left the active archive unchanged.
  - Real Chromium on 5175 imported two synthetic two-message TXT files into the
    same relationship. The second open returned to the fresh identity selector,
    and Chat displayed all four historical records in order. Selecting the first
    file again stayed on the import entry with `没有重复写入`; console errors
    remained zero.
  - `npm run verify:history-import`, `npm run verify:daily-archive`,
    `npm run verify:health`, and `git diff --check` pass. The only build note is
    the existing Vite large-chunk warning.
- boundary:
  - Intake remains one file per round; this change enables repeated rounds and
    does not add a multi-file picker or server upload.
  - Calendar semantic extraction and every history-to-memory interpretation stay
    HOLD pending the consuming-module audit.

## 2026-07-17 History Import V2 Clean Transport

- done:
  - Deleted the import-time paged review UI, review decisions, speaker mapping,
    conversation-type/time questions, and their persistence layer. The route is
    now relationship -> file -> local archive -> Chat.
  - Added `history-intake-v4`: explicit `user` and `assistant/char` markers are
    treated only as export-author channels. Wrapped content and multiple turns
    in one DOCX paragraph remain supported; empty/separator/timestamp-only rows
    are skipped and every other non-empty unit is preserved as `原文片段`.
  - Preserved duplicates, raw text, source order, locator, and timestamp without
    import-time dedupe, virtual-time conversion, or companion/plot inference.
  - Replaced the old eight-store speculative sidecar with four raw/operational
    stores: batches, source messages, jobs, and backup receipts. Event,
    companion, plot, tag, and embedding contracts were removed rather than kept
    as dormant compatibility fields.
  - Moved intake, formal archive, and daily archive onto clean v2 IndexedDB
    namespaces. No pre-product review database reader or migration remains.
  - Kept raw history medium-neutral. Chat receives at most one historical tail
    under a remote-text boundary; Date does not read it or resume old physical
    staging.
  - Added a Calendar AI source handoff base with immutable scope/document
    revisions, but every run is `hold/module_fit_unverified` with `output: null`.
- boundary:
  - Calendar AI does not call a model and does not define personality, plot,
    relationship, language-fingerprint, tag, vector, or memory outputs. Those
    remain HOLD until the historical-evidence fit of each consuming module is
    audited.
  - Imported evidence cannot independently change current emotion, care state,
    open threads, Character Life, NarrativeRun, ExperienceReceipt, or memory.
- verified:
  - `npm run verify:history-import`, `npm run verify:daily-archive`,
    `npm run verify:narrative`, and `npm run verify:health` pass. History import
    covers 50,000 generated rows, a 1,201-row intake workspace, WPS/DOCX shapes,
    four-store encrypted rescue, Chat/Date medium boundaries, and Calendar HOLD.
  - A 430 x 932 real Chromium flow on temporary port 5175 imported a synthetic
    DOCX as four records without a review/type/time question, opened Chat in one
    action, rendered the archive apart from live messages, and showed the same
    evidence in Dialogue Calendar as three dated plus one undated record.
  - Browser acceptance exposed one missing neutral label in the single-day
    reader. Non-speaker rows now visibly render as `原文片段` (system notes as
    `来源说明`); the hot-reloaded page passed with zero console errors. The
    temporary browser and server were closed after verification.
  - The only build note is the existing Vite large-chunk warning.

## 2026-07-17 WPS/Mobile Word Self-Closing Paragraph Compatibility

- done:
  - Diagnosed the real-device import failure before speaker/timestamp parsing:
    valid OpenXML `<w:p/>` empty paragraphs were treated as opened but never
    closed, so a trailing WPS/mobile Word spacer falsely triggered the
    `document.xml 段落结构不完整` safety gate.
  - Unified paragraph finalization in the DOCX adapter. Paired paragraphs and
    self-closing empty paragraphs now produce the same bounded source-unit
    contract; empty spacers remain visible to normalization as skipped rows.
  - Added a synthetic paid-export DOCX with a trailing self-closing paragraph
    and proved its three meaningful `user/assistant + timestamp` turns are
    unchanged. Added a separate truly unfinished paragraph fixture so the
    corruption guard remains active.
- boundary:
  - No private friend export was copied, stored, or committed. The regression is
    represented only by fictional in-memory OpenXML fixtures.
  - ZIP CRC, entry count, uncompressed-size, UTF-8, legacy `.doc`, and genuinely
    truncated paragraph protections remain unchanged.
- verified:
  - `npm run verify:history-import`, `npm run verify:daily-archive`,
    `npm run verify:narrative`, `npm run verify:health`, and `git diff --check`
    pass. The only build note is the existing Vite large-chunk warning.
- next:
  - Build the subpath-safe static bundle and replace only the isolated AetherOS
    lab directory with an atomic rollback point.

## 2026-07-17 AetherOS 2.0 First Device-Test Release

- done:
  - Promoted the project to `2.0.0` for its first small real-phone browser test.
  - Added the generated AetherOS star-core brand emblem and derived 512 px,
    192 px, and Apple touch icons for PWA and mobile installation surfaces.
  - Replaced the plain loading spinner with the star-core boot mark and added a
    restrained lock-screen brand placement; internal feature apps keep their
    simpler line icons for readability.
  - Added the first-device-test milestone, live lab link, and GitHub Pages link
    to the README.
  - Extended the public-release guard with version, milestone-copy, logo, and
    icon size budgets.
  - Replaced the legacy private-asset URL migration table with one-way numeric
    fingerprints, retaining exact old-data cleanup without distributing the
    retired source URLs in the production JavaScript bundle.

- release intent:
  - Publish the same reviewed static build to GitHub Pages and the isolated
    `/aetheros/` lab route. Do not add a backend or restart the main gateway.

## 2026-07-17 Public Release Sanitization And Asset Budget

- done:
  - Restored the retired `preset-sully-v2` ID to the startup migration filter,
    so an IndexedDB database created by the former `/sullyos/` route cannot
    make the upstream private character preset reappear under `/aetheros/`.
  - Added cleanup for the legacy Sully-only emoji category and orphaned sticker
    records while preserving user chat messages and unrelated user assets.
  - Replaced remaining runtime references to upstream-hosted private artwork in
    the café and Valentine surfaces with neutral local defaults.
  - Added a public-release regression check covering retired IDs, sticker data,
    forbidden runtime markers, native app naming, and large-asset budgets.
  - Changed the native display name to `AetherOS`.
  - Re-encoded the Timebook desk and four built-in date backgrounds as
    same-resolution JPEGs, reducing their combined size from about 9.6 MB to
    about 1.5 MB without changing layout dimensions.

- boundary:
  - This block changes the local release candidate only. The existing public
    static deployment and gateway configuration remain untouched.
  - User-authored chat messages are not deleted when the retired character card
    is removed.

## 2026-07-13 User Persona Mask Frame

- done:
  - Held the narrative experience UI work before adding the StoryDesk, because
    multi-save identity routing must exist first.
  - Added mask-aware user profile types: `UserPersonaMask`,
    `UserProgressBundle`, progress-surface policy, active mask ID, and active
    progress-bundle ID.
  - Added `utils/userPersonaMasks.ts` to migrate legacy single user profiles
    into a default mask, switch masks, mirror the active mask onto legacy
    top-level `userProfile` fields, and keep edits synchronized back into the
    active mask.
  - Updated `OSContext` so loading, importing, and editing the user profile all
    normalize through the mask layer.
  - Updated IndexedDB user-profile save/load/export/import so DeepSpace
    identity fields, persona masks, and progress bundles are preserved.
  - Reworked `个人档案` into a two-page mask flow: the first page lists masks for
    create/switch/delete, and the second page edits one mask with an explicit
    save button.
  - Mask rows now show the mask label, user name, recent-use time, and linked
    character avatars/names as switching context.
  - Added `linkedCharacterIds` and `lastUsedAt` to user persona masks for route
    identification and future story/date/social scoping.
  - Added `custom_world` as a non-DeepSpace identity mode so users importing
    unrelated worldbooks or original character cards do not get forced into
    DeepSpace hunter/protagonist assumptions.
  - Added `utils/personaRouteScope.ts` as the shared linked-character scope
    helper for route-focused surfaces.
  - Connected SocialApp to the active mask's linked-character scope, so
    generated social participants, comments, and delayed user-post replies use
    linked characters when the mask has them.
  - Connected Character directory to the same scope as a linked-first management
    surface, including an “add to current mask” action for unlinked characters.
  - Connected Date and Call role pickers to linked-only-by-default filtering
    with visible show-all toggles.
  - Connected GroupChat creation to linked-only-by-default member candidates
    with a visible show-all toggle.
  - Updated `见面` UI and prompts to present it as daily companionship /
    light-plot meeting, with explicit guardrails against surprise mainline
    escalation.
  - Updated `特别时光` lobby to present it as calendar/timebook keepsake
    capsules, and scoped event character selection through the active persona
    mask linked-character network.
  - Extracted the newly touched `见面` and `特别时光` rules/UI into规范模块:
    `utils/dateExperience.ts`, `components/date/DateSelectIntro.tsx`,
    `components/date/DateCharacterSelectCard.tsx`,
    `utils/specialMoments.ts`, and `components/special-moments/*`.
  - Fixed the `见面` linked-scope toggle placement by moving “显示全部 /
    只看链接” from the centered header right slot into the content notice, so it
    no longer collapses vertically beside the title.
  - Fixed `见面` scene auto-save so implicit unmount/background saves persist to
    IndexedDB without calling the explicit exit route, avoiding the “走过去 →
    进度已保存 → 返回选择页” failure path.
  - Reworded the `见面` intro copy away from meta product labels and toward a
    softer daily-date invitation.
  - Reworked the `见面` approach flow from a black “正在感知” page into a
    presence-first waiting scene: when a portrait/background exists it is shown
    immediately, and self-insert/original characters without date assets fall
    back to an avatar-based mood card rather than a black screen.
  - Raised the avatar fallback placement so the character presence reads as
    standing in the scene rather than being hidden behind the action card.
  - Added dawn/day/dusk/night virtual-time lighting palettes for the no-asset
    presence fallback, so custom characters do not stay in one permanent night
    ambience.
  - Promoted the generated cafe/lounge background set into built-in date
    grounding assets under `public/assets/aetheros/date-backgrounds/`, and wired
    `见面` to use the time-matched built-in backdrop automatically when a
    character has no custom `dateBackground`.
  - Added built-in backdrop selection to `场景布置`: users can fix one backdrop
    manually or return to “按时间自动”.
  - Tuned the `见面` waiting card so generated opening prose no longer appears
    before approach; the card keeps a short immersive status line and a
    full-width moving light strip while generation is pending.
  - Split `见面` visual playback semantics so narration/action/environment beats
    render as floating scene text, while quoted speech renders in the bottom
    character dialogue box.
  - Repositioned visual narration beats to the same lower golden-area card
    rhythm as the waiting scene.
  - Tightened `见面` visual-scene safe zones: lowered and compacted the floating
    control row, moved avatar-only presence fallback to a high golden-ratio
    position, capped scene text cards, and made them lift when the input bar is
    open.
  - Downgraded the long-text date page into a reading/record mode by preventing
    full-page taps from opening the input box, and softened the input copy from
    Q&A language to “写下动作或轻声回应”.
  - Reduced the long-text reading page typography and increased its top
    breathing room so it no longer crowds the status/header controls; added a
    top scrim so text no longer scrolls visibly underneath the toolbar.
  - Slimmed the `见面` input bar and send button so the composition stays closer
    to a visual scene than a chat composer.
  - Changed visual-scene playback completion from the old replay/toast behavior
    to automatically opening the compact input bar, making the end of a beat
    read as “轮到用户回应”.
  - Restored `见面全文` readability by preserving assistant line breaks/scene
    beats in the detail page while still hiding parser emotion tags.
  - Fixed `见面全文` speaker formatting so quoted assistant lines render as
    character speech, while user messages such as `（动作）文字` remain user-side
    action/reply entries even without strict quote syntax.
  - Removed the explanatory “适合吃饭、散步……” product copy from the `见面`
    intro card.
  - Replaced fixed waiting/ready text in the `见面` approach card with rotating
    short presence lines, reducing repeated system-like phrasing.
  - Tightened `场景布置` typography for save/add/create/URL controls so the
    settings page follows the newer compact UI rhythm.
  - Reworked the long-text page `管理` action from raw message-level selection
    into visible segment-level selection. Assistant paragraphs can now be
    deleted by updating the stored message content; fully selected/user units
    still delete the whole message record.
  - Reworked `见面记录` from full-text waterfall cards into a compact record
    list with drill-in detail pages, plus list-level favorite/delete actions for
    cleaning short test sessions.
  - Documented the distinction between directory surfaces (linked first, all
    reachable) and experience/generation surfaces (linked-only by default).
  - Documented the code and product contract in
    `docs/USER_PERSONA_MASKS.md`, `REQUIREMENTS.md`, and `SCHEMA.md`.

- next:
  - Attach future narrative directives to `activeProgressBundleId`.
  - Make Novel/StoryDesk filter pending directives by progress bundle before
    building mainline/IF UI.
  - Split heavy mainline travel into a future `世界旅行` surface with timeline
    summaries, rather than continuing to overload `见面`.
  - Later, add bundle metadata to date summaries, guidebook insights, special
    moments, and social posts one surface at a time.
  - Keep chat history migration/filtering as a later explicit slice; do not
    silently move old messages when switching masks.

- verified:
  - `git diff --check` passed.
  - `npm run verify:health` passed.
  - Confirmed the canonical verification frontend still responds at
    `http://127.0.0.1:5174/`; it was not restarted or stopped during publish
    prep.

## 2026-07-13 Narrative Experience Boundary Audit

- done:
  - Audited `见面`, `攻略本`, `特别时光`, `剧情推演 / 小说生成`, `查手机`,
    `TRPG`, and `都市人生` against the planned mainline / IF-line / date
    experience workflow.
  - Confirmed `见面` already reads worldline memory through `meet_scene` and
    `date_scene`, making it the best current surface for embodied
    date/meeting play.
  - Confirmed `攻略本` is character-private user-understanding material, not a
    world/canon fact writer.
  - Confirmed `特别时光` is a keepsake-event capsule and should only promote to
    timebook/mainline after user action.
  - Confirmed `查手机` should not be reused as `咨询台` because it creates
    character-phone evidence and can write generated records into system
    messages.
  - Added `NarrativeDirective` and related lane/memory-policy types for pending
    mainline hooks, IF-line dream material, keepsakes, user insight, sandbox
    material, and supporting evidence.
  - Added `utils/narrativeBoundaries.ts` as the shared boundary map and helper
    layer for pending mainline directives, IF dream directives, and Novel prompt
    formatting.
  - Added optional `NovelBook.directives` so future accepted consultation seeds
    can be attached to a story project without an IndexedDB migration.
  - Updated the Novel prompt builder so pending directives are visible to
    writing generation when present, while IF-line directives are labeled as
    dream/branch material rather than mainline facts.
  - Added `docs/NARRATIVE_EXPERIENCE_BOUNDARIES.md` and documented the contract
    in `REQUIREMENTS.md` and `SCHEMA.md`.

- next:
  - Build a small `剧情咨询台 / StoryDesk` surface that turns user-approved
    story seeds into `NarrativeDirective` rows.
  - Show pending directives inside `NovelApp`, then add activate / played /
    archive controls before connecting Date completion summaries to mainline
    memory.
  - Gate TRPG archive behavior before reusing it for IF lines, because the
    current archive path writes directly into `char.memories`.

## 2026-07-13 Study Room Extraction Audit

- done:
  - Audited `书房` as a local PDF-to-course study surface rather than a complete
    co-reading room.
  - Added `utils/studyRoom.ts` for shared study constants, API readiness checks,
    chapter source selection, course chapter normalization, quiz normalization,
    and safe score math.
  - Added `utils/studyPrompts.ts` for curriculum, lecture, Q&A, quiz, quiz
    review, quiz follow-up, and teaching-memory prompts.
  - Replaced brittle course/quiz JSON parsing with shared tolerant JSON
    extraction.
  - Added PDF size guard, empty outline fallback, empty quiz guard, safe
    teaching-memory failure handling, and correct return routing from historical
    practice-book quizzes.
  - Added `docs/STUDY_ROOM_REVIEW.md` to record current functionality, known
    limits, and AsherieSystem mobile co-reading reference shape.
  - Documented the study-room contract in `REQUIREMENTS.md` and `SCHEMA.md`.

- next:
  - Human-check PDF import, classroom teaching, quiz generation, practice-book
    review return, and cached lesson reopening on the fixed frontend.
  - Keep EPUB/TXT shared reading, annotations, mark-read, and TTS as HOLD until
    the main plot-simulation surface is stable.

## 2026-07-13 Call Opening Scene Anchors

- done:
  - Audited the call prompt: stage cues were already phrased as optional, but
    the opening environment still lived only inside generated dialogue.
  - Relaxed the call prompt further so action/background cues are explicitly not
    required every sentence or every turn.
  - Added a per-session `callScene` opening anchor generated locally from
    virtual time, character profile keywords, and the call session seed.
  - Displayed the scene as an independent "所在" chip during the call and saved
    it into call-end metadata for call history list/detail views.
  - Preserved `callScene` across suspended calls.
  - Documented the call scene contract in `REQUIREMENTS.md` and `SCHEMA.md`.

- verified:
  - `npm run verify:health` passed.

## 2026-07-13 Call Transcript Hygiene

- done:
  - Added `utils/callTranscript.ts` for shared phone-call text cleanup,
    speech/cue splitting, speech-only extraction, and keepsake-line selection.
  - Fixed the call prompt history path so prior call messages no longer feed
    `（通话记录）` style system labels back into the model as visible speech.
  - Hardened assistant output/display cleanup so exact record labels are stripped
    from new replies and old local records.
  - Updated the call-record detail page so action cues render without outer
    parentheses as neutral small secondary text outside speech bubbles.
  - Updated the post-call normal-chat card to clean existing keepsake metadata
    and select future keepsake lines from the whole call transcript instead of
    the first sentence of the final assistant turn.
  - Documented the contract in `REQUIREMENTS.md` and `SCHEMA.md`.

- verified:
  - `npm run verify:health` passed.

## 2026-07-13 Diary Secondary Page Scale Pass

- done:
  - Tuned the exchange-diary character notebook page from poster-like scale to
    compact secondary-page scale.
  - Reduced the orange hero header padding/radius, back icon size, uppercase
    label, and character-name title size.
  - Reduced the "写今天的日记" CTA button typography/padding and tightened diary
    history list cards/date tiles.
  - Added a `Diary Visual Rhythm` requirement so future diary-like pages keep
    secondary-page proportions instead of drifting back to oversized copy.

- next:
  - Human-check the selected-character diary page on the fixed frontend and
    compare it against the dialogue rhythm pass for overall phone-shell balance.

## 2026-07-13 Dialog Visual Rhythm Standard

- done:
  - Added `components/chat/dialogVisualRules.ts` as the shared sizing contract
    for avatar-and-bubble dialogue surfaces.
  - Aligned one-to-one deep-space chat and group chat to the same baseline:
    `40px` avatars, `14px / 1.5` bubble body text, `74%` bubble max width,
    about `10px` avatar-bubble gap, and secondary `10px/9px` metadata.
  - Reduced one-to-one deep-space bubble text from the previous larger scale
    while preserving readability through line height.
  - Enlarged group chat message avatars and narrowed group bubble width so the
    group page feels less cramped and less edge-heavy.
  - Documented the rule for future plot-simulation long-text pages in
    `REQUIREMENTS.md` and `SCHEMA.md`.

- next:
  - When building the plot-simulation long-text page, reuse
    `DIALOG_VISUAL_RULES` for avatar/bubble narration and add paragraph rhythm
    locally instead of increasing the base bubble font size.

## 2026-07-13 Group Chat UI and State Sync

- done:
  - Added an `updateGroup()` OS context action so group title/avatar edits save
    to IndexedDB and the global group list state in the same path.
  - Fixed the group-title edit flow: saving changes in `群组设置` now refreshes
    both the active chat view and the `群聊列表` card instead of only persisting
    the initial create-time title.
  - Fixed group-avatar updates to use the same global sync path.
  - Compact-tuned the group chat inner header: shorter height, smaller action
    buttons/icons, tighter title typography, and participant avatars under the
    title instead of only a member count.
  - Scaled the group settings panel copy/buttons down to better match the rest
    of the phone UI while keeping the AI director history-message control.
  - Follow-up tuned the inner chat header away from the status bar by using an
    explicit top breathing layer, and rebuilt the bottom add button as a true
    centered circular control.
  - Re-confirmed the main user identity guard applies to group chat because
    member generation goes through the shared `ContextBuilder.buildCoreContext()`
    prompt path.

- verified:
  - `npm run verify:health` passed.
  - `git diff --check -- apps/GroupChat.tsx context/OSContext.tsx REQUIREMENTS.md SCHEMA.md progress.md`
    passed.

## 2026-07-13 Group Chat Memory Backend

- done:
  - Audited `群聊` generation and confirmed it already used
    `ContextBuilder.buildCoreContext(member, userProfile, true)`, so mounted
    worldbooks, relationship impression, refined memories, and activated
    detailed memories can enter member prompts.
  - Connected group AI director generation to `selectWorldlineMemoryContext()`
    per member. Each member now receives a budgeted worldline-memory supplement
    selected from their recent private chat and the current group topic.
  - Increased the private-chat snippet used by group generation from 10 very
    short lines to 12 longer lines, so recent private mood is less likely to be
    flattened into a stage-play cue.
  - Fixed group director context loading: the configured group context limit now
    pulls recent group messages from IndexedDB instead of only using currently
    rendered React state.
  - Fixed group archive input: `生成总结并同步到全员记忆` now reads full persisted
    group history for that group before writing group memories to member
    `char.memories`.
  - Updated `REQUIREMENTS.md` and `SCHEMA.md` with the group-chat memory
    inheritance contract.

- next:
  - Human-test with a small group after one member has a fresh private memory:
    trigger the director and confirm the public reply reflects private
    relationship state without quoting private chat directly.
  - Later UI pass: expose a small non-immersive indicator that group generation
    used member memory context, similar to memory delivery receipts.

## 2026-07-13 DeepSpace User Identity Guard

- done:
  - Added structured DeepSpace identity fields to `UserProfile`:
    `deepspaceIdentityMode` and `deepspaceIdentityNote`.
  - Added `个人档案` identity modes: `自设非猎人`, `自设猎人`, and
    `原作主控 / 灵空猎人`.
  - Injected a high-priority user identity override into the shared prompt
    builder so free-form user self-settings can override unintentional default
    protagonist assumptions from character cards or worldbooks.
  - Clarified that `自设非猎人` is not a character-exclusion rule: DeepSpace
    canon characters and NPCs may still exist and gradually enter the user's
    relationship network through plot, encounters, jobs, events, or explicit
    user settings.
  - Added identity-risk warnings in `通讯录` worldbook controls. The original
    protagonist core relationship package now needs a second click to enable
    when the user is in a custom identity mode.
  - Softened built-in DeepSpace copy that previously treated original
    protagonist/aether-core/old-relationship facts as unconditional defaults.
  - Updated `REQUIREMENTS.md` and `SCHEMA.md` with the identity-mode contract.

- next:
  - Human-test with `自设非猎人`: open a DeepSpace built-in character, confirm
    the worldbook modal warns on original protagonist relationship packages, and
    send a chat message that should mention the user's custom profession without
    forcing hunter identity.

## 2026-07-13 Social Moments Reply Scheduling

- done:
  - Added a scoped social participant pool for `朋友圈` generation and comments.
    When the active built-in male lead has not enabled the five-lead crossover
    worldbook package, other built-in male leads are excluded from the visible
    friend-circle actor pool.
  - User-created moment posts now persist a reply queue with
    `replyAudienceCharIds`, `replyRemainingCharIds`, and `replyDueAt` instead of
    generating all replies in one batch.
  - Due user-post replies are generated one activated related character at a
    time, then the next character is scheduled for a later staggered time.
  - Social replies now raise an in-app toast and can also use browser
    notifications when permission has already been granted.
  - Updated `REQUIREMENTS.md` and `SCHEMA.md` with the single-lead/crossover
    worldbook boundary and reply queue contract.

- next:
  - Human-test with one real provider key: publish a user moment under a
    single-lead setup, wait for staggered replies, then enable the crossover
    worldbook and confirm additional activated leads can participate.

## 2026-07-13 Canonical Verification Frontend

- done:
  - Confirmed ports 4173, 5173, and 5174 were offline and no historical
    AetherOS/SullyOS Vite or esbuild process remained.
  - Added a repository-local frontend controller with one canonical address:
    `http://127.0.0.1:5174/`.
  - Changed the handoff rule from stopping Vite after every test block to
    preserving one healthy human-verification frontend across Codex windows.
  - Added `frontstage:start`, `frontstage:status`, and `frontstage:stop` scripts;
    runtime PID/log files stay under ignored `.run/`.
  - Moved startup into a detached process session after verifying that a plain
    background child could be reaped with its originating Codex command.

- contract:
  - Every window checks status before starting anything, reuses a healthy
    server, and closes only temporary browser-automation sessions.
  - The canonical frontend remains running after task completion unless the
    user explicitly requests shutdown or replacement.

## 2026-07-11 News Station Batch / Story-Form Follow-Up

- done:
  - Reproduced the reported top-of-feed click failure in a fresh Playwright
    browser: the first news card stayed on the list while the third card opened
    after auto-scroll.
  - Moved desktop pull-to-refresh pointer capture behind an 8px downward-drag
    deadzone, so ordinary clicks at scroll position zero reach the first and
    second cards.
  - Added a `资讯站` header clear action with confirmation. It deletes only news
    rows, preserves 朋友圈 posts/shared chat cards, and leaves a persistent empty
    state instead of restoring demo placeholders.
  - Split news writing contracts by media shape. Long-form channels now include
    sensational pseudo-history, strange-story submissions, date-route stories,
    and map-like travel prose; short alert and daily formats remain distinct.
  - Raised long-form acceptance to at least 500 non-whitespace characters.
    `诡秘谈` targets 650-950 characters and requires an escalating story,
    dialogue/action, false ending, and unresolved final sting.
  - Added one bounded targeted repair pass for short long-form rows. Rows still
    below 500 characters after repair are rejected instead of persisted.
  - Added a 75-second timeout to social batch generation/repair requests.

- verified:
  - `npm run verify:health` passes; Vite retains only the known entry-chunk
    warning.
  - Fresh-browser regression confirmed both the first and second demo news cards
    open directly with zero console errors.
  - Isolated IndexedDB regression confirmed news-only clear: one persisted test
    news row was removed, the clear button disappeared, and the explicit empty
    state remained.
  - Mocked two-call generation confirmed a deliberately short `诡秘谈` draft
    was the only row repaired; the stored result contained 1,120 non-whitespace
    characters across 8 paragraphs, with 5 total news rows persisted.

- next:
  - Human-test one real provider batch for prose quality and repetition. The
    structural/length gate is verified locally, but model taste still needs a
    real reading pass.

## 2026-07-11 Resource Health Audit

- done:
  - Replaced eager imports of every feature app in `PhoneShell` with lazy app chunks while keeping the launcher and global event controllers eager.
  - Debounced avatar-frame calibration persistence so slider previews stay immediate without issuing one full theme/IndexedDB persistence pass per input event.
  - Removed the avatar-frame persistence path's per-update `getAllAssets()` scan and stopped rewriting unchanged frame binaries.
  - Limited custom avatar-frame input to 8MB and resized static uploads to a 1024px maximum edge before persistence.
  - Added a 45-second timeout and bounded five-minute retry delay to automatic social-comment requests; pending request IDs are now released in `finally`.
  - Added the development `Service-Worker-Allowed` header so the keep-alive worker can claim the app root without a console error.
  - Added `typecheck`, quiet build, and combined `verify:health` scripts plus repository resource-health guidance.

- verified:
  - `npm exec tsc -- --noEmit` passes.
  - `npm run build` passes.
  - Initial production entry chunk fell from `2,190.22 kB` (`687.57 kB` gzip) to `593.73 kB` (`213.01 kB` gzip); feature apps now emit separate on-demand chunks.
  - Fresh Playwright load and lazy opening of `聊天装扮 -> 头像框校准` completed with `0` console errors and about `48 MB` used JS heap in the observed test page.
  - A synthetic 60-event avatar-frame slider burst produced `1` `os_theme` write and `0` full IndexedDB `getAll()` calls.
  - Playwright sessions were explicitly closed after verification.

- next:
  - Keep `OSContext.tsx` startup asset hydration and the remaining roughly 594kB eager entry chunk under observation; split only when a real profile shows startup or memory pressure.
  - Use `npm run verify:health` for iterative checks and reserve full verbose `npm run build` output for release checkpoints.

- risk:
  - Existing user/browser IndexedDB may already contain oversized legacy images; this patch prevents new oversized avatar-frame imports but does not rewrite user data automatically.

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
  - Fixed a real proactive-letter flood found in live testing: due wakeup rules
    are now batched per character, extra due rules are staggered instead of sent
    together, and exact recent duplicate direct lines are replaced or deferred.
  - Rebalanced proactive-letter scheduling after live testing showed a 1-minute
    repeat and stale next-time display: natural wakeups now keep a 35-minute
    per-character send gap, heartbeat only uses a short 10-minute active-chat
    guard, obsolete duplicate heartbeat rules are paused, and the chat UI uses
    recent message state when estimating the next real wakeup.
  - Rebalanced proactive-letter content selection: with both `藏好的话` and
    `此刻的话` enabled, AI-rendered messages are now the primary path; fixed
    lines are only unused fallback material, and already displayed fixed lines
    are treated as consumed instead of merely avoided for 12 hours.
  - Hardened the active-reply bridge after proactive messages: when the user
    replies, Chat now checks live companion-wakeup rules in IndexedDB as well as
    React state before deciding whether to auto-trigger the next character reply.
  - Fixed a dinner-care duplicate found in live testing: built-in lunch/dinner/
    sleep care windows now pause matching older daily care rules, calendar/care
    wakeups also obey the per-character send gap, and all wakeups wait through
    the short active-chat cooldown instead of treating the user's latest message
    as something to answer.
  - Capped one proactive wakeup render to at most two visible chat bubbles and
    tightened the AI prompt so care reminders do not expand into a mini
    back-and-forth like "我吃过了，你呢？".
  - Replaced the fixed 35-minute proactive send gap with a stable randomized
    22-52 minute range keyed by character and last wakeup timestamp, so the
    anti-spam guard no longer feels like a visible system timer.
  - Split the Reality Sync settings UI into clearer layers: world/time sync,
    care boundary, and weather signal. Weather on/off is now controlled by the
    weather switch; when weather is off, prompt construction treats weather as
    disconnected even if a legacy weather-scope value exists.
  - Cleaned up the character memory archive UX after live MemoryDM testing:
    removed the misleading month-card eye toggle, renamed "core memory" to
    `月度印象`/`月记`, renamed raw entries to `本月碎片`, and made detailed
    month delivery explicit with `只递月记` / `递入本月碎片`.

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

## 2026-07-18 Relationship-Scoped Chat Reply Presentation

- done:
  - Added one `聊天内部设置` header entry and reused the existing settings modal.
  - Added per-mask × character `跟随玩家格式` / `只发消息` reply-format settings.
  - `跟随玩家格式` only aligns plain-dialogue / parenthesized-action / narration paragraph structure, never the player's tone, wording, syntax, rhythm, or verbal habits; one ordinary model response remains one text bubble with natural internal paragraphs.
  - `只发消息` keeps strict remote-IM prose, asks the model to mark independently sendable messages with newlines, and renders those lines as separate bubbles.
  - Previously split Chat replies now re-render with the selected presentation mode without mutating their source rows. Future output carries an immutable response id; unlabeled legacy text uses a bounded same-scope eight-second reconstruction rule.
  - Grouped avatars now anchor to the first bubble instead of appearing beside the last line of an older split reply.
  - Removed the coarse scene classifier, hidden user-message route injection and mandatory action-density prompting; built-in character prompts remain untouched.
  - Kept historical-tail temporal isolation and prevented imported history from becoming new live MemoryDM input.
  - Changed fresh and field-less chat appearance defaults from `深空` to `简约` without overriding explicit saved choices.

- verified:
  - `npm run verify:chat-reply-mode`
  - `npm run verify:appearance-presets`
  - `npm run verify:history-import`
  - `npm run verify:daily-archive`
  - `npm run verify:narrative`
  - `npm run typecheck`
  - `npm run build:quiet`
  - `git diff --check`
  - Playwright on `http://127.0.0.1:5175/`: confirmed the single chat-settings entry, both reply-presentation choices, relationship-scoped persistence, one-bubble mode restoration, and the selected `简约` appearance card. Console stayed at 0 errors; only the existing Tailwind CDN warning remained.
  - Isolated 430×932 Chrome fixture: one legacy three-row reply rendered as one preserve bubble, switched to three texting rows, and restored to one bubble; avatar and bubble top positions matched exactly (`0px` delta), with zero console errors. Fixture rows were deleted before browser shutdown.

## 2026-07-19 Chat Format Boundary Correction

- corrected:
  - Renamed the visible default mode from `保留角色原文` to `跟随玩家格式` so the setting describes generation structure as well as bubble rendering.
  - Narrowed “follow” to structural form only: plain dialogue, parenthesized action, narration/dialogue mixture, and paragraph boundaries.
  - Explicitly prohibited copying the player's tone, wording, syntax, sentence length, rhythm, or verbal habits. Character voice remains owned by the character card and reliable context.
  - `跟随玩家格式` now asks for natural paragraphing and keeps one ordinary response in one bubble. `只发消息` asks the model to mark independently sendable remote-IM messages with newlines and keeps newline-based bubble splitting.

- verified:
  - `npm run verify:chat-reply-mode`
  - `npm run typecheck`
  - `npm run verify:history-import`
  - `npm run verify:narrative`
  - `git diff --check`
  - Playwright on `http://127.0.0.1:5175/`: confirmed corrected labels and boundary copy in the live chat-settings modal; console stayed at 0 errors.

- next:
  - Run a real provider conversation in both modes and compare one-bubble preservation with strict IM splitting; the pure output-contract tests are already green.
  - Keep Date/见面 as the explicit novel-style embodied carrier; do not merge its prompt contract into Chat.
  - Publish this focused block only after owner approval. No commit, push, deploy, or server change occurred here.

## 2026-07-19 Worldbook Folding And Custom Groups

- done:
  - Wrapped all built-in worldbooks in one default-collapsed, read-only library;
    built-in categories remain independently foldable inside it.
  - Split custom books into `我的分组` without changing the persisted
    `Worldbook.category` schema or mounted-worldbook records.
  - Replaced mobile `datalist` category reuse with visible named group buttons
    and an explicit `新建分组` action.
  - Collapsed category contents in the character worldbook mounting modal.
  - Kept custom records editable even when their category label matches a
    built-in category; read-only status follows record metadata only.

- verified:
  - `npm run verify:worldbook-groups`
  - `npm run typecheck`
  - Mobile browser at 390×844: built-in outer drawer and nested category
    foldouts, first custom group creation, existing-group reuse for a second
    entry, zero horizontal overflow, and zero console errors.

- boundary:
  - Empty standalone groups are intentionally not stored; a group exists while
    at least one entry uses its normalized category.
  - Desktop App hiding/reordering is delegated to the appearance task and is
    not implemented in this block.

## 2026-07-22 Worldbook Live Mount Repair

- fixed:
  - Removed the React state-updater timing dependency that could save a new
    library version while leaving character mount caches on an older version.
  - Made worldbook ID the mount relationship key and projected current library
    title/content/category into character details.
  - Generalized startup repair from built-in entries to all library entries, so
    already-stale custom mounts recover after reload.
  - Kept character-card-only embedded books intact for portable import/export.

- verified:
  - `npm run verify:worldbook-groups`
  - `npm run typecheck`
  - Playwright on `http://127.0.0.1:5174/`: created custom group A and entry B,
    mounted the group to a custom character, changed B from `旧版正文 001` to
    `新版正文 002`, reopened the character and confirmed the mounted read-only
    viewer showed the new body without remounting.

## 2026-07-28 History Companion Material Authority And Non-vector Gate (Superseded Checkpoint)

- done:
  - Closed the local history-analysis authority chain from exact-scope Daily
    Archive packets through bounded batches, non-authoritative model drafts,
    adjudication with an explicit authority tier, canonical activation receipts
    and freshness-checked publication.
  - Kept historical initiative motives candidate-only. Historical records
    cannot become current motives, current Character Life, active narrative,
    tool policy or already-played experience.
  - Tightened ordinary Chat to one sparse role-side reference with a 360-
    character material budget. `ordinary_share` alone no longer establishes
    relevance.
  - Added legal zero-material paths for explicit no-advice conversation and
    actual tool requests. Merely mentioning a schedule does not trigger the
    tool bypass. A self-life request such as asking the character to talk about
    their own day remains eligible, and the hard bypass is limited to ordinary
    Chat rather than leaking into Call/Meeting/ScenePlan surfaces.
  - Closed three authority gaps found by independent review:
    `sourceRevisionFingerprint` is now derived from exact Daily Archive message
    bodies instead of accepted from a caller; finalization authority reruns the
    complete finalizer instead of trusting a self-consistent digest; and
    already-published historical material immediately fails closed at runtime
    after any bound Daily Archive source changes.
  - Reframed the prompt projection from “本轮回应动作” to “本轮角色侧参考”.
    A selected fragment suggests what the role may notice; it is explicitly
    not a task, current motive, fact, relationship claim or tool policy.
  - Shortened the generic Chat quality tutorial to three open principles,
    neutralized the long-gap/history wording, and moved the one optional
    role-side reference to the end of the System Prompt so it remains legible
    without taking over durable context or App mechanics.
  - Ran an API-side full-prompt read with the real built-in cards and default
    mounted material: Qi Yu produced 13,347 prompt characters with 9,232
    worldbook characters; Zayne produced 12,456 with 8,446. This exposed the
    mounted worldbooks as the largest remaining density source; no worldbook
    rewrite was smuggled into this companion-material patch.
  - Reframed the earlier A/B and blind-judge runs as supporting observations,
    not mathematical acceptance. Code checks boundaries; maintainers inspect
    the complete prompt from the next-model perspective; players provide
    natural “像 / 腻 / 套路化” feedback without seeing a test UI.
  - Kept all 196 private semantic drafts non-active. The 909-source cruise is
    a source corpus for reusable language fingerprint, stable detail,
    opening/proactive and scene-affordance assets, not a 909-fragment prompt
    pack. Repeated sources may strengthen one cluster; useful material is not
    discarded merely because it did not win one offline score cell.
  - Recognized the natural self-life request “你今天都做了什么” so it now
    retrieves each role's independent-life lens instead of the generic
    low-information fallback.

- verified:
  - `npm run verify:history-import`
  - `npm run verify:companion-material`
  - `npm run verify:narrative`
  - `npm run typecheck`
  - `npm run verify:health`
  - Independent authority regression fixtures: forged self-consistent active
    pass rejected; same-revision substituted source body changes the source
    fingerprint; modified published source returns zero historical runtime
    records until explicitly re-analysed and republished.
  - Persona-cruise semantic draft verifier: 196 drafts, `active=0`
  - Persona-cruise summary: 64 clusters, 139 independent-adjudication
    candidates, 57 withheld, 5 retained parse failures
  - `git diff --check`

- boundary:
  - This earlier local-only checkpoint is superseded by the complete five-role
    four-lane release below.
  - The full-prompt read is a qualitative backend judgment, not proof that any
    provider will never go OOC. Natural multi-turn use remains necessary to
    observe tendencies, but players are not responsible for diagnosing hidden
    prompt assembly.
  - The dedicated persona-cruise workstream still owns 909-source content
    analysis and classification. This control-room patch does not re-crawl or
    replace its curation.
  - Chat, proactive messages, Call and Date now consume their legal sparse
    projections. ScenePlan remains a typed future seam and has no implemented
    runtime consumer yet.
  - Local embedding producer/store/query and automatic relationship-style
    promotion remain HOLD. Their contracts and fail-closed boundaries are
    documented; lexical selection remains the only enabled runtime.

## 2026-07-28 Browser History Companion Analysis Closed Loop

- done:
  - Added a human-visible entry in Dialogue Calendar for the exact active
    progress bundle, persona mask and character relationship.
  - Players can analyse all local archive records or a cross-month date range.
    The sheet shows message, token, bounded-batch and API-call estimates before
    any source text is sent to the configured provider.
  - Added the browser-local runtime from ephemeral Daily Archive packets through
    direct/bounded model analysis, optional synthesis, a separate adjudication
    call, canonical finalization, activation receipt and freshness-checked
    publication.
  - Corrected the default one-provider path to `same_model_second_pass`.
    Analyzer/adjudicator role ids remain useful audit labels, but cannot mint
    independent authority from one configured provider/model. True independent
    authority now rejects the same provider/model even when the role id differs.
  - Added a hard second-pass evidence budget and included a source-sized,
    hard-cap-bounded reserve in the preflight token estimate. Overflow findings
    remain withheld for a narrower retry instead of rebuilding all accepted
    excerpts into an unbounded prompt.
  - The sheet now states before execution that selected original excerpts are
    temporarily sent to the currently enabled external API; the local material
    library never stores those original sentences.
  - No-finding analysis exits without inventing material or spending an
    adjudication call. API/schema failure leaves no prompt-visible partial
    material. Any later source edit makes previously published historical
    material fail closed immediately.

- verified:
  - `node --import tsx scripts/verify-history-companion-runtime-analysis.ts`
  - `node --import tsx scripts/verify-history-import.ts`
  - `npm run typecheck`
  - Runtime fixtures cover direct publication, same-model authority, bounded
    batch + synthesis, second-pass budget withholding, missing API, cancellation,
    malformed output, no-finding exit and source freshness invalidation.
  - Real 390 × 844 browser pass on canonical port 5174: Calendar entry,
    cross-month date controls, estimates, disabled-no-API state and internal
    sheet scrolling; no console errors.

- boundary:
  - Runtime success is covered with an OpenAI-compatible mocked provider. A
    player's configured real provider and natural “像 / 不像” judgement remain
    the next small-circle test rather than a code-level claim.
  - This stage publishes companion performance material only. It does not
    mutate character cards or promote relationship, current-life or narrative
    truth.
  - Chat, proactive messages, Call and Date now consume their legal sparse
    projections. ScenePlan and optional embeddings remain HOLD; neither is
    represented as an enabled runtime capability.

## 2026-07-29 Five-role Four-lane Companion Material Release

- published:
  - Public `Aryuan026/AetherOS main@0335e21` completes the replacement for the
    earlier 23-record sparse checkpoint.
  - All 909 reviewed source units have an explicit disposition with
    `416 active-library support + 493 retained = 909` and zero unresolved.
    Raw source text and private analysis artifacts remain outside the public
    repository and runtime prompts.
  - The runtime library now contains 56 non-verbatim records across five roles
    and four use lanes. Another 21 reviewed candidates compile only to disabled
    drafts; no canonical publisher is installed, so none can be persisted,
    selected or delivered.
  - Chat, proactive wakeup, Call and Date use the same scoped selector and real
    provider-facing message builders. Receipts are written only after a
    successful non-empty provider response and always carry
    `truthEffect:none`.
  - Five real built-in cards across four surfaces produced 20 complete
    model-facing audit payloads. No source ref, raw dialogue, candidate state,
    current motive or tool strategy entered the material segment.
  - Full companion/history/narrative/daily-archive/typecheck/build/health gates,
    source conservation and independent code review are Green. No player
    testing control was added.

- deployment:
  - GitHub Pages run `30390993289` completed successfully.
  - The isolated lab build contains 258 regular files and 91 gzip sidecars.
    Local, staging, server and Pages `index.html` SHA-256 is
    `b9e6310c81e7ef8ead9ecd27a02ed8d4b7cf9aab290efa5527c1a8d9b688150a`.
  - Only `/srv/asherie/sites/science-demos/aetheros` was atomically replaced.
    Rollback is
    `/srv/asherie/backups/aetheros-companion-full-0335e21-20260728T191525Z/aetheros-static.previous`.
  - Public GET is 200, POST is 403, retired `/sullyos/` remains 410 and hashed
    assets are gzip-served with immutable caching. Nginx, Home and Bridge
    remained active; Home PID `241844` and Bridge PID `225578` stayed
    unchanged with `NRestarts=0`.

- boundary:
  - Runtime selection remains lexical and sparse. The trusted semantic-rank
    seam is present, but local embedding generation/indexing stays HOLD until
    measured misses justify its resource cost.
  - ScenePlan's pure contract is Green; StoryDesk still has no runtime ScenePlan
    consumer and must not be reported as delivered.
  - Natural multi-turn use may still expose OOC or repetition. This release
    improves the model's available character-specific footing without
    hard-coding a response template or claiming deterministic roleplay.
