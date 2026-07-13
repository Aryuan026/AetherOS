# AetherOS Resource Health

This note separates product-runtime pressure from long Codex-session pressure.
AetherOS cannot directly consume a Codex conversation context, but an eager app
graph, repeated binary persistence, verbose build output, and leftover browser
or Vite processes can make the same development window progressively heavier.

## Verified Baseline

- Repository working size during the 2026-07-11 audit was about 275MB, including
  about 187MB of `node_modules`. Repository size alone was not large enough to
  explain a frozen development session.
- Before app-level code splitting, the production entry chunk was 2,190.22kB
  minified / 687.57kB gzip.
- After lazy feature-app loading, the entry chunk is 593.73kB minified /
  213.01kB gzip. Feature apps load only when opened.
- A fresh local page that opened `聊天装扮 -> 头像框校准` used about 48MB of JS
  heap in the observed Chromium run and produced zero console errors.
- A 60-event calibration-slider burst produced one `os_theme` persistence write
  and zero full IndexedDB `getAll()` scans.

These numbers are a regression baseline, not a universal device guarantee.

## Guardrails

1. Feature apps stay behind `React.lazy()` boundaries in
   `components/PhoneShell.tsx`.
2. Slider/drag previews update in component state first. Durable writes are
   debounced and must not enumerate or rewrite unchanged binary assets.
3. Custom avatar-frame inputs are limited to 8MB. Static images are resized to a
   maximum 1024px edge before IndexedDB persistence.
4. Background network requests need a timeout, an in-flight guard, and bounded
   retry timing.
5. Service workers, intervals, observers, event listeners, animation frames, and
   Playwright/Vite processes must all have an explicit stop or cleanup path.

## Long-Session Workflow

Use the quiet combined verification during iteration:

```bash
npm run verify:health
```

Use the verbose build only when chunk details are needed:

```bash
npm run build
```

Keep one canonical human-verification frontend alive at
`http://127.0.0.1:5174/`:

```bash
npm run frontstage:status
npm run frontstage:start
```

Every window checks status first and reuses the healthy server. The local
controller refuses to start a duplicate when the canonical port already
responds. It starts Vite in a detached process session, so the page is not tied
to one Codex command lifecycle. Do not stop this frontend at task handoff; reserve
`npm run frontstage:stop` for an explicit user request or a deliberate
replacement. Browser tests may reuse it, but their temporary Playwright/browser
sessions must still be closed after verification.

Search targeted source paths; do not feed `node_modules`, `.playwright-cli`,
`dist`, or raw research material into a Codex window by default.

## Remaining Watch List

- `context/OSContext.tsx` is still a large ownership hub and hydrates many assets
  at startup. It is a future profiling target, not an automatic rewrite target.
- The eager entry chunk remains slightly above Vite's default 500kB warning. It
  is accepted for now because the dominant feature-app graph has already been
  split; further movement should follow a real startup profile.
- Existing browsers may contain oversized legacy IndexedDB assets. Do not run a
  destructive automatic migration without an export/rollback path.
