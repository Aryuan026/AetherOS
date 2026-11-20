# SullyOS Notice

This repository is a maintained deployment fork of the open-source project
`SullyOS // 手抓糯米机`.

## Upstream Attribution

- Original project name: `SullyOS // 手抓糯米机`
- Current public upstream repository found on GitHub:
  https://github.com/qegj567-cloud/SullyOS
- Upstream GitHub owner: `qegj567-cloud`, public profile name `NMJ`
- Required notice from the current upstream README:
  `Copyright (c) 2024-2026 NMJ (SullyOS / 手抓糯米机)`
- Current upstream README license statement: PolyForm Noncommercial 1.0.0
- Older distributed source copy in this workspace stated MIT in README, but the
  current public upstream README is treated as the stricter boundary for this
  deployment fork.

This fork does not claim to be the original author or official upstream project.

Deployment fork maintainer credit: A-Yuan / Asherie.

## Local Modifications

This deployment fork adds and maintains:

- Public default sticker packs for small-group character-card testing.
- Static deployment support for the `/sullyos/` public path.
- UI readability adjustments for the launcher.
- Launcher information architecture organized around companion, story-play, and
  creation / setup layers. See `docs/FORK_DESIGN_NOTES.md`.
- Built-in starter characters and presets for immediate use, with
  prompt-editing hidden for casual users.
- Removal of the upstream default Sully character from this deployment build,
  because this fork is not intended to redistribute Sully as a packaged
  character.
- Local documentation of deployment and verification state.

## Acknowledgements Preserved From The Original README

The original README thanks:

- ReiStandard / Active Message 2.0 integration:
  https://github.com/Tosd0/ReiStandard/

## Algorithmic Provenance

The optional earlier-chat-quote recall admission split was informed by
`NousResearch/hermes-agent` main snapshot
`9dd9421f1dd7be7b629873da7a42fb213d595a54` (verified 2026-11-17; source blob
`160ac306a9859c510f00539d9567fdedd50bed78`). On 2026-11-20, upstream main was
`2de9f51b8008a7d49a49221c184f2f11cbfc4af1` and still retained the relevant
mechanism. Relevant upstream implementation: `tools/session_search_tool.py` (`_DISCOVER_SCAN_LIMIT`,
demotion before dedupe, `_READ_MAX_CONTENT`) with regressions in
`tests/tools/test_session_search.py` (`TestCronDemotion` and the temporal-
narrowing test that requires the bound to apply before the scan is truncated).
Upstream rationale comments reference #19434 and #114344. Upstream is MIT licensed, Copyright (c)
2025 Nous Research. AetherOS independently implements the bounded local cursor and
candidate-admission policy in TypeScript; no upstream source code is copied, and
upstream remains the authority for its own behavior.

## Use Boundary

This deployment is intended for non-commercial personal testing with a small
group. It is provided as-is, without warranty.

The built-in characters and presets in this fork may include fan-made
organization or reinterpretation of classic anime/game characters. They are
not official, are not endorsed by the original rightsholders, and may not have
separate authorization from those rightsholders. Copyrights, trademarks, and
world settings remain with their respective owners.

Do not use this project, its character presets, prompts, configuration, or
assets for any commercial purpose. This includes selling, resale, paid
distribution, paid customization, paid-platform operation, advertising or
course/community monetization, or presenting the project as an official product,
official character card, or authorized release.

Anyone who violates this notice, the upstream license, or third-party rights is
responsible for the resulting legal risk. The deployment maintainer is not
responsible for unauthorized or non-compliant use by others.

If you plan to publish this fork broadly or use it beyond a small personal test
group, replace all built-in character content with original or properly
authorized characters. Keep the upstream notice and license boundary when
redistributing modified builds.
