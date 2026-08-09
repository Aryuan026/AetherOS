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

## App Registry And Appearance Contract

- `INSTALLED_APPS` in `constants.tsx` is the single catalog for Launcher layout
  projection and Appearance icon/layout management. After a feature completes
  its normal AppID, config, lazy route, and `INSTALLED_APPS` registration, do not
  add a second per-App list or conditional inside Appearance or Launcher.
- `LAUNCHER_APP_GROUPS` and `DOCK_APPS` seed defaults only. Saved user order,
  visibility, and Dock order belong to the versioned `OSTheme.launcherLayout`
  contract and must pass through `normalizeLauncherLayout`.
- Keep Launcher and Appearance page boundaries on the shared
  `paginateLauncherAppIds` projection. App pages hold eight visible Apps; the
  fixed final Widgets/calendar page is outside App ordering.
- Existing users must receive newly registered Apps visibly. Ignore unknown
  shared AppIDs, preserve the recipient's current layout when old Appearance
  JSON omits `launcherLayout`, and never create a Launcher-only storage key.
- Settings must remain visible in Dock with its independent default-layout
  recovery action. Any launcher/layout change must keep
  `verify:launcher-layout`, `verify:appearance-presets`, `verify:shell-chrome`,
  and `verify:health` Green.

## App Surface And Shared-Truth Contract

- Follow `docs/APP_SURFACE_AND_MEMORY_INTEROP_CONTRACT.md` when adding,
  splitting, connecting, or removing a virtual App.
- Follow `docs/CONVERSATION_CONTINUITY_CONTRACT.md` for foreground Chat
  compaction and cross-App handoff. A continuity capsule is rebuildable prompt
  state, never memory, current Life, narrative truth or permission to read a
  different App's private store.
- An App owns its interaction and assigned records; it must not become the
  private owner of relationship, memory, world time/location, narrative, or
  current-life truth merely because it displays those facts.
- Cross-App information must use typed, scoped projections, commands, and
  receipts. Do not read another App's IndexedDB table or pass an untyped global
  prompt blob as an integration seam.
- Relationship-private reads and delayed writes require the exact captured
  `progressBundleId + personaMaskId + charId` scope and fail closed.
- Imported evidence, model interpretation, route planning, played experience,
  durable memory, and current Character Life are different authority levels.
  A new path must name which level it reads and which receipt permits promotion.
- A new core App must document its player verb, owner domain, projections,
  commands, receipts, backup behavior, and removal/migration path. A feature
  that only retrieves memory belongs in a shared selector or an existing App
  panel, not a standalone memory organ.
- Do not delete an App from the launcher until its durable data, consumers,
  backup path, deep links, and user-authored material have an explicit migration
  or preservation decision.

## Verification

- Prefer `npm run build` for deploy readiness.
- Prefer `npm run verify:health` during long Codex sessions. It type-checks and builds without printing the full chunk table into the session.
- `npm exec tsc -- --noEmit` may surface broad pre-existing TypeScript debt; do not treat unrelated legacy TS errors as part of a narrow sticker-pack patch unless the touched code caused them.

## Persona Life-Surface Contract

- `通讯录`、角色卡与面具设置是管理面：必须保留全部角色可达。
- 聊天、群聊、电话、见面、朋友圈、小说/剧情与特别时光是生活/生成面：只能使用当前面具已链接角色；没有链接时必须空态关闭，禁止静默回退到全角色或 `characters[0]`。
- 新 App 必须通过 `utils/personaRouteScope.ts` 投影参与者，不得自行复制一套 `linkedCharacterIds` 判断；相应修改必须通过 `verify:persona-scope`。

## Resource Health

- Keep exactly one canonical human-verification frontend at `http://127.0.0.1:5174/`. At the start of every window, run `npm run frontstage:status`; reuse it when healthy and start it only when absent. Do not stop it when a task ends unless the user explicitly asks or it must be replaced.
- Use `npm run frontstage:start|status|stop` instead of launching ad-hoc Vite processes. The controller refuses to start a second server when port 5174 already responds.
- Close temporary Playwright and browser-automation sessions after verification. They are test tools, not the canonical frontend.
- Keep feature apps lazy-loaded from `components/PhoneShell.tsx`; adding a new app must not pull every feature into the initial bundle.
- Large user images belong in IndexedDB, not localStorage. UI sliders may update preview state immediately, but persistence must be debounced and must not scan/rewrite all binary assets per input event.
- Keep custom avatar-frame uploads at or below the UI limit and resize static images before persistence.
- During code inspection, search targeted paths first. Do not scan `node_modules/`, `.playwright-cli/`, `dist/`, or raw research material unless the task explicitly needs that runtime evidence.
- See `docs/RESOURCE_HEALTH.md` for the verified baseline and regression checks.
