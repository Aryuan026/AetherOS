# AetherOS Public Release Checklist

This file tracks blockers and handoff notes for publishing the fork as
`AetherOS`.

## Current Git State

- Local branch: `main`.
- Current remote: `git@github.com:Aryuan026/AetherOS.git`.
- Remote tracking status before the July UI/memory work: `main` was up to date
  with `origin/main`.
- Last pushed commit at the time of this note:
  `911bb67 Prepare private noncommercial fork`.
- Public release target name: `AetherOS`.
- GitHub repository was renamed and made public on 2026-07-06.

## Release Timeline Notes

- 2026-07-03: began the AetherOS visual fork pass; deep-space chat preset and
  chat appearance direction started.
- 2026-07-04: completed the first-screen UI grouping direction and the first
  code split for `时光簿`, `同行计划`, `书房`, shared shell headers, and chat
  appearance ownership.
- 2026-07-05: built the original memory architecture slice. Its MemoryDM direct
  writers were retired by the 2026-07-19 extraction-only boundary.

## Memory / Calendar Code Still Open

- Add a visible `最近候选` projection over
  `assets/memory_interpretation_store_v1`; do not describe candidates as saved
  memories or mix them with prompt-delivery receipts.
- Normalize legacy `char.memories` writers behind a shared duplicate gate after
  prompt audit. Current legacy appenders include manual chat archive, group
  archive, study, novel, and game flows.
- Audit every durable-memory and `关系印象` extraction prompt for role-internal
  private-note perspective before enabling any automatic impression overwrite.
- Connect approved 朋友圈 / 资讯站 material into the future `narrative_proposal` /
  `剧情生成仓` path after the separate social-feed pass settles.
- Add a richer calendar inspection/edit surface if `ai_calendar` wakeup rules
  need user-facing correction beyond the current wakeup settings/logs.
- Consider migrating from the current wakeup-rule calendar bridge to an
  AsherieHome-style calendar store later, with explicit item upsert, completion,
  mark-notified, and source-context fields.

## Worker / External Channel Audit

Screenshot-listed files that are not present in this working copy:

- `utils/proxyWorkers.ts`
- `utils/proactivePushConfig.ts`
- `utils/vrWorld/postOffice.ts`
- `context/MusicContext.tsx`
- `worker/proactive-push/`
- `worker/post-office/`

External-channel cleanup completed on 2026-07-06:

- Removed `worker/index.js` and local XHS bridge/proxy scripts.
- Removed XHS apps, XHS client utilities, chat XHS action handling, and XHS
  card UI.
- Rebuilt `utils/realtimeContext.ts` as a local-first time/date + optional
  weather helper with no inherited worker domain.
- Removed Notion, Feishu, Brave Search, and XHS configuration surfaces from
  settings.
- Removed Brave real-search configuration from the browser app; it now remains
  an AI-simulated in-phone browser.

Policy for public release:

- Do not ship author-owned worker routes, hard-coded worker domains, or bundled
  proxy deployment code.
- If a feature needs an external service later, it must be user-configured and
  documented as optional, without inherited private worker endpoints.

## README / Attribution

- Rewrite the project README in English before the public push.
- The README should briefly explain:
  - what AetherOS is;
  - that it is an authorized second-development fork inspired by / derived from
    SullyOS;
  - upstream source and thanks;
  - copyright / license notice inherited from the upstream notice;
  - that this repository is not the official SullyOS upstream.
- Keep the detailed internal progress notes in `progress.md` and this checklist,
  not in the public-facing README.
