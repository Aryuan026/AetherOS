# SullyOS Progress

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

- next:
  - Install dependencies in this clean work copy.
  - Run build verification.
  - Build and sync the new `dist/` to the server static path.

- risk:
  - Public pack enablement is intentionally browser-local. Different users and devices can choose different role-pack mappings.
  - Existing legacy TypeScript debt may still make `tsc --noEmit` noisy even when Vite build succeeds.

## 2026-07-01 Naming Contract

- done:
  - Locked public sticker naming into three layers: stable pack ID, technical sticker/asset file ID, and human/AI display name.
  - Documented that tags are selection hints, not access control.
  - Documented image intake rules for large/non-standard downloaded images.
  - Added ignored intake paths so raw source images do not get committed accidentally.

- next:
  - Build and inspect the bundled `dist/stickers/` output before server sync.
  - Ask for human review of display names after the first in-app sticker selection test.
