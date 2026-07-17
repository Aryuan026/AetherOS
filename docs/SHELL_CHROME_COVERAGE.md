# AetherOS Shell Chrome Coverage

- lifecycle: `active`
- baseline: `07cd335`
- audited: `2026-07-17`
- owner branch: `codex/aetheros-virtual-city-shell`

## Intent

The old `hideStatusBar` switch only stopped rendering the simulated device
status row. Page headers, immersive controls, and global overlays still used
coordinates that reserved the same row. The shell migration therefore owns one
top coordinate system for every surface:

```text
safe area
  + optional classic-phone status strip OR virtual-city world strip
  + app header / immersive controls / global overlays
```

`software` is the new-config default and has no simulated clock, signal, Wi-Fi,
or battery. `simulated_phone` is the explicit original-look option and restores
the familiar reality clock / Wi-Fi / battery row. `virtual_city` adds a compact
world-information strip, but it is not a device status bar.

## Shared Header Coverage

These surfaces already render `components/shell/AppHeader.tsx`; changing the
shared shell variables moves their full header rather than hiding a child row.

| surface | first-level / expanded coverage |
| --- | --- |
| Settings / Appearance / User / ThemeMaker / Widget | first-level settings, persona list/detail, appearance editors |
| HistoryImport | import identity/file/review/completion shell |
| DailyArchive | calendar/list, day reader, clipping library |
| Character / Gallery / CompanionPlan | list and supported detail/editor shells |
| Date | role selection, records, scene settings |
| Call | role selection, call history, record detail |
| Room | room/character selection |
| Social | main feed shell where `AppHeader` is used |
| Study / Journal / GroupChat | first-level and supported secondary shells |
| CheckPhone / SpecialMoments | outer selection/lobby shells |
| Valentine / WhiteDay | event shells that use the shared header |

## Hand-Written Top Chrome Exceptions

These paths must consume the same variables explicitly. A fixed `h-20`,
`pt-12`, `top-7`, or `top-12` is not an accepted shell boundary.

| surface | code owner | exception |
| --- | --- | --- |
| Launcher / lock screen | `apps/Launcher.tsx`, `components/PhoneShell.tsx` | reality clock only in classic mode, world clock only in virtual mode, software identity card otherwise |
| Chat | `components/chat/ChatHeaderShell.tsx` | variable-density sticky header |
| GroupChat | `apps/GroupChat.tsx` | inner conversation header uses shared shell height/content variables |
| Schedule / Timebook | `apps/ScheduleApp.tsx` | back/add controls float over the paper scene |
| Date | `apps/DateApp.tsx`, `components/date/DateSession.tsx` | approach card, visual-scene controls, long-text reader gutter/scrim |
| Call | `apps/CallApp.tsx` | dialing/in-call controls and suspended-call return path |
| Social | `apps/SocialApp.tsx` | publish, detail, and profile subpages use custom top rows; the shared Moments/News detail row has a deliberate `+3px` optical offset |
| Room | `apps/RoomApp.tsx` | immersive room controls float over the room scene |
| Gallery / Study | `apps/Gallery.tsx`, `apps/StudyApp.tsx` | full-screen viewer/reader controls |
| Message reader | `components/chat/MessageItem.tsx` | detail/keepsake readers use their own safe-area padding |
| Game / FAQ / Worldbook | `apps/GameApp.tsx`, `apps/FAQApp.tsx`, `apps/WorldbookApp.tsx` | legacy 64/80px sticky headers |
| Novel / Songwriting / Browser | `apps/NovelApp.tsx`, `apps/SongwritingApp.tsx`, `apps/BrowserApp.tsx` | workspace, shelf, cover/editor and browser headers |
| Journal expanded page | `apps/JournalApp.tsx` | calendar and dark secondary headers use shared shell content/height variables |
| Bank | `apps/BankApp.tsx` | explicit `env(safe-area-inset-top)` header padding |
| LifeSim | `apps/LifeSimApp.tsx` | local `topSafePadding` coordinate |

## Global Overlay Anchors

| overlay | baseline owner | required result |
| --- | --- | --- |
| classic simulated status | `components/os/SimulatedPhoneStatusBar.tsx` | render reality clock, Wi-Fi and battery only when `simulated_phone` is selected |
| system error indicator | formerly inside `StatusBar.tsx` | preserve as an independent overlay anchored to shell variables |
| suspended call | `components/PhoneShell.tsx` (`top-7`) | anchor below the active world strip/safe area without covering page controls |
| toast stack | `components/PhoneShell.tsx` (`top-12`) | anchor below suspended-call/world-strip stack through the same coordinate source |
| modal / reader portals | `components/os/Modal.tsx` and feature portals | no synthetic status-row spacer; real safe area remains respected |

## Phase 1 Acceptance Matrix

The browser pass must check both `390px` and `430px` widths.

| route family | ordinary | expanded / immersive | overlay collision |
| --- | --- | --- | --- |
| Launcher | first launcher page | additional launcher pages / lock screen | toast |
| Chat | chat thread | selection mode / message reader | toast + error |
| HistoryImport | import entry/review | completion | toast + error |
| DailyArchive | calendar/list | reader + clipping library | toast + error |
| Appearance / Settings | first-level | modal/editor child pages | toast + error |
| Date | role selection/history | approach, scene, long-text reader, settings | toast + error |
| Call | picker/history | dialing, active call, call detail | suspended call + toast |
| Social | feed | post detail, publisher, profile | toast + error |
| Room | selector | immersive room | toast + error |
| Schedule | paper list | memory detail/editor | toast + error |

## Phase 2 / 3 Boundaries

- The shell mode is a global appearance preference.
- Classic-phone display facts are presentation only and cannot become record or
  narrative time.
- Virtual-city facts are keyed by `progressBundleId + personaMaskId`.
- Missing or inconsistent scope fails closed and renders `software` chrome.
- Virtual time is display/environment context only. It cannot replace message,
  import, daily-archive, backup, audit, or source timestamps.
- Weather and historical archive tails cannot directly create current state,
  buffs, tasks, narrative runs, receipts, or memory rows.

## Verified Result

- `simulated_phone`: status strip `32px`, shared header `80px`, compact Chat
  header `83px`, overlay stack top `40px` at a zero CSS safe-area inset.
- `software`: world strip `0px`, shared header `56px`, compact Chat header
  `51px`, overlay stack top `8px`.
- `virtual_city`: world strip `34px`, shared header `90px`, compact Chat header
  `85px`, overlay stack top `42px`.
- 390 × 844 and 430 × 932 browser checks had no horizontal overflow across the
  required ordinary and immersive route families.
- The added Appearance pass verified all three radio cards at both phone widths,
  conditional city-editor expansion, classic launcher clock, classic shared and
  Chat header geometry, and transitions back to the unchanged software / virtual
  dimensions.
- The follow-up Appearance information-architecture pass verified the
  `16/12/13/11/10/9` type scale, top-mode-first visual order, `屏幕观感 / 桌面布置`
  grouping, four-column icon grid, and preset cards at 390 × 844 and 430 × 932.
  No tab produced horizontal overflow, and the redundant `原样` badge is absent.
- The final optical pass keeps Chat's content/message origin `5px` below its
  earlier compact value. The fourth launcher page begins its calendar at `56px`
  and keeps `Upcoming` in the same upper group with a protected Dock reserve at
  both phone widths.
- A real browser shared-file pass imported, listed, and explicitly applied the
  versioned appearance fixture, then confirmed its complete current chat field
  set plus custom chat theme in local storage / IndexedDB.
- Expanded evidence includes Date presence/approach, active Call, Social post
  detail, Room interior, and expanded Schedule memory. The Date probe had no API
  configured and intentionally exercised the captured error-indicator path;
  geometry remained stable.
- In virtual mode, suspended call / toast / error rows stack below the strip at
  `42px`, then advance by row height plus the shared `8px` gap.
- `VirtualWorldContext` is implemented as a read-only, source/scope-labelled
  projection. Delivery into Date/Call/current-state algorithms remains `HOLD`.
