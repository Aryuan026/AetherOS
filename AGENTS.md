# AGENTS.md

This is the maintained AetherOS work copy for A-Yuan.

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
- Prefer `npm run verify:health` during long Codex sessions. It type-checks and builds without printing the full chunk table into the session.
- `npm exec tsc -- --noEmit` may surface broad pre-existing TypeScript debt; do not treat unrelated legacy TS errors as part of a narrow sticker-pack patch unless the touched code caused them.

## Resource Health

- Keep exactly one canonical human-verification frontend at `http://127.0.0.1:5174/`. At the start of every window, run `npm run frontstage:status`; reuse it when healthy and start it only when absent. Do not stop it when a task ends unless the user explicitly asks or it must be replaced.
- Use `npm run frontstage:start|status|stop` instead of launching ad-hoc Vite processes. The controller refuses to start a second server when port 5174 already responds.
- Close temporary Playwright and browser-automation sessions after verification. They are test tools, not the canonical frontend.
- Keep feature apps lazy-loaded from `components/PhoneShell.tsx`; adding a new app must not pull every feature into the initial bundle.
- Large user images belong in IndexedDB, not localStorage. UI sliders may update preview state immediately, but persistence must be debounced and must not scan/rewrite all binary assets per input event.
- Keep custom avatar-frame uploads at or below the UI limit and resize static images before persistence.
- During code inspection, search targeted paths first. Do not scan `node_modules/`, `.playwright-cli/`, `dist/`, or raw research material unless the task explicitly needs that runtime evidence.
- See `docs/RESOURCE_HEALTH.md` for the verified baseline and regression checks.
