# SullyOS Progress

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
