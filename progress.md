# SullyOS Progress

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
