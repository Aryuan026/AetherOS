# AGENTS.md

This is the maintained SullyOS work copy for A-Yuan.

## Boundary

- Source reference stays at `/Users/mac/Documents/Codex/samples/SullyOS-master`.
- This directory, `/Users/mac/Documents/Codex/0-github/SullyOS`, is the editable and deployable work copy.
- Do not copy runtime output from the sample back into this repo. Keep `node_modules/`, `.npm-cache/`, `.playwright-cli/`, `dist/`, logs, local auth, API keys, and browser data out of git.

## Sticker Packs

- Public default sticker packs live in `public/stickers/catalog.json`.
- Image files should live under `public/stickers/assets/<pack-id>/`.
- Public packs are synced into browser IndexedDB on app load.
- Per-character pack enablement stays local to each browser via `EmojiCategory.allowedCharacterIds`.
- A public pack should default to `visibilityDefault: "disabled"` when it must not be readable/selectable until the user enables it for a character.

## Verification

- Prefer `npm run build` for deploy readiness.
- `npm exec tsc -- --noEmit` may surface broad pre-existing TypeScript debt; do not treat unrelated legacy TS errors as part of a narrow sticker-pack patch unless the touched code caused them.
