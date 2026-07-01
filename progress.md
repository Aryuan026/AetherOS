# SullyOS Progress

## 2026-07-01

- done:
  - Copied editable work tree from `samples/SullyOS-master` to `0-github/SullyOS`.
  - Excluded `node_modules`, `dist`, `.npm-cache`, `.playwright-cli`, and `.DS_Store` from the copy.
  - Added a public sticker catalog at `public/stickers/catalog.json` with an empty `a 组表情包` pack.
  - Added category visibility mode support so an empty allowlist can mean "visible to nobody" for public packs.
  - Added shared emoji visibility helpers for private chat, group chat, and active messages.
  - Added a chat emoji-panel management entry for enabling/disabling public packs for the current character.

- next:
  - Install dependencies in this clean work copy.
  - Run build verification.
  - After images are provided, add files under `public/stickers/assets/pack-a/` and fill the catalog sticker entries.
  - Build and sync the new `dist/` to the server static path.

- risk:
  - Public pack enablement is intentionally browser-local. Different users and devices can choose different role-pack mappings.
  - Existing legacy TypeScript debt may still make `tsc --noEmit` noisy even when Vite build succeeds.
