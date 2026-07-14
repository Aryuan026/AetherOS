# User Persona Masks

Last updated: 2026-07-13

This file records the outer-frame contract for multi-save / multi-identity play.

## Why this exists

The user profile used to be a single global identity. That is too narrow for
plot work:

- one user may want a non-hunter self-insert and a canon hunter route in
  parallel;
- mainline, IF line, date, social feed, and guidebook progress should not all
  assume the same user identity;
- changing identity later would otherwise require rewriting every plot module.

The new frame is “persona masks + progress bundles”.

```text
UserProfile
  ├─ activePersonaMaskId
  ├─ personaMasks[]
  │    └─ carries name / avatar / call portrait / bio / identity mode / linked chars
  ├─ activeProgressBundleId
  └─ progressBundles[]
       └─ reserves per-surface progress scope policy
```

## Compatibility rule

The currently active mask is always mirrored onto the legacy top-level
`userProfile` fields:

- `name`
- `avatar`
- `avatarFramePresetId`
- `callPortrait`
- `bio`
- `deepspaceIdentityMode`
- `deepspaceIdentityNote`

That means existing prompt paths such as `ContextBuilder.buildCoreContext()` do
not need to know about masks yet. They naturally see the active identity.

## Progress bundle rule

Every mask owns one `progressBundleId`. Future app data should use this ID when
the data belongs to a route/save rather than the whole installation.

Recommended default policy:

| Surface | Policy | Notes |
| --- | --- | --- |
| chat | `mask_scoped` | Future message filters can separate route histories. |
| group_chat | `mask_scoped` | Group tone should follow current identity. |
| call | `mask_scoped` | Call history/scene anchors should eventually separate by route. |
| date | `mask_scoped` | Meeting/route play belongs to a user identity. |
| social | `mask_scoped` | Friend-circle actor pools and user posts depend on identity. |
| novel | `mask_scoped` | Mainline/IF directives should bind to a bundle. |
| guidebook | `mask_scoped` | Character insights about user should not bleed across masks. |
| special_moments | `mask_scoped` | Event keepsakes may differ by route. |
| timebook | `mask_scoped` | Relationship keepsakes should eventually be bundle-aware. |
| worldbook | `shared` | Worldbook library is global; activation may still vary per character/route later. |
| study | `shared` | Study material is not inherently roleplay identity. |
| settings | `shared` | API keys, themes, and device settings stay global. |
| game | `hold` | TRPG archive writes memory today; gate it before route scoping. |
| lifesim | `hold` | City sim has an independent world model; do not route-scope until redesigned. |

## Linked character scope

`linkedCharacterIds` means “this mask's active relationship network.” It should
focus route experience, not delete or hide the global character library.

Recommended behavior:

- Directory/contact surfaces:
  - show linked characters first;
  - keep unlinked characters reachable so users can add/import/link them;
  - do not hard-hide the rest of the library.
- Experience surfaces such as Social, Date, Call, Novel/StoryDesk, Guidebook:
  - if the active mask has linked characters, default to linked characters only;
  - if the active mask has no linked characters, fall back to all available
    characters and guide the user to establish links;
  - offer a later “show all / add to this mask” escape hatch rather than
    silently locking the user out.
- Prompt/generation surfaces:
  - linked characters may speak, post, reply, or appear as familiar relation
    network members;
  - unlinked characters must not appear as accounts, default romance targets, or
    current user familiar contacts;
  - unlinked characters may still exist as public/background people if the
    worldbook or user explicitly mentions them.

General connection rule:

- New route surfaces must resolve scope through `utils/personaRouteScope.ts`
  instead of checking `linkedCharacterIds` inline.
- Directory-style pages should use the helper to sort linked characters first
  and provide an explicit “add to current mask” action.
- Experience-style pages should default to helper-filtered linked characters
  when the active mask has links, and keep a visible “show all” escape hatch for
  temporary cross-network play.

Connected surfaces:

- SocialApp uses the active mask's linked-character scope for participant pools,
  generated posts/comments, and delayed user-post replies.
- Character directory shows linked characters first and lets users add unlinked
  characters to the current mask.
- Date and Call role pickers default to linked characters with a visible
  “show all / only linked” toggle.
- GroupChat creation defaults to linked member candidates with a visible
  “show all / only linked” toggle.

## Current implementation

- `types.ts`
  - `UserPersonaMask`
  - `UserProgressBundle`
  - `UserProgressSurface`
  - `UserProfile.activePersonaMaskId`
  - `UserProfile.activeProgressBundleId`
  - optional `personaMasks` and `progressBundles`
- `utils/userPersonaMasks.ts`
  - migrates legacy user profile to a default mask;
  - switches active mask;
  - mirrors active mask fields to top-level `UserProfile`;
  - creates a progress bundle for every new mask;
  - synchronizes edits to mask-bound fields back into the active mask.
- `utils/personaRouteScope.ts`
  - resolves active mask linked characters;
  - filters route experience surfaces;
  - builds prompt notes that prevent unlinked characters from entering the
    current relationship network.
- `apps/UserApp.tsx`
  - uses a two-page flow:
    - page one is the mask switcher, with create / switch / delete;
    - page two is the detail editor with an explicit save button;
  - shows each mask as a row with label, user name, recent-use time, and linked
    character avatars;
  - can copy current identity into a new mask;
  - can link characters as route markers for future plot/date/social scoping.
- `utils/db.ts`
  - saves and loads normalized mask-aware user profiles;
  - exports the full user profile instead of truncating identity fields.

## Identity mode tolerance

`deepspaceIdentityMode` now has one non-DeepSpace-safe value:

```ts
"custom_world" // 通用自设 / 非深空世界
```

When this mode is active, prompt context should not assume DeepSpace hunter,
canon protagonist, aether core, Linkon City, or any original-work relationship.
The character should instead follow the current character card, mounted
worldbooks, and local plot facts. This keeps the personal profile usable for
players who import wholly unrelated worlds and original characters.

## Do not do yet

Do not immediately rewrite every store to be bundle-aware. First add the frame,
then connect surfaces one at a time.

Unsafe conversions:

- Do not silently move existing chat messages into a bundle.
- Do not delete or hide old memories when switching masks.
- Do not make `worldbook` data private to a mask yet; only future activation
  views may become route-aware.
- Do not route-scope TRPG archive until its current direct `char.memories` write
  is gated.

## Next connection order

1. Add bundle metadata to future narrative directives.
2. Make Novel/StoryDesk filter pending directives by `activeProgressBundleId`.
3. Add date completion summaries with bundle metadata.
4. Add guidebook insight bundle tags so user-understanding does not bleed across
   masks.
5. Only then consider chat/message history separation.
