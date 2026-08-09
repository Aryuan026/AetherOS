# Provider Prompt Cache Plan

## Product Order

AetherOS follows `usable -> stable -> cheaper`.

The current runtime has usable foreground continuity, but it does not claim
provider prompt-cache support. Cache work must not block character-material
curation, story-writing fixtures, or the long-narrative App contracts.

This plan adapts the useful boundary from the private Cove prompt-cache notes:
cache stable prompt bytes, keep current state fresh, and trust provider usage
rather than a visual “cache enabled” badge.

## What Is And Is Not Cached

Provider prompt cache reuses repeated input prefixes. It is not a local reply
cache and never stores a model answer as the next answer.

Future model requests should compile into four explicit segments:

1. `stable_role`: role identity, reviewed character base, mounted canon/worldbook
   projection and stable player relationship definitions;
2. `stable_surface`: the App's output contract, stable capability description and
   stable tool schemas;
3. `dynamic_context`: current time/location, Character Life, selected memory,
   behavior-boundary matches, foreground continuity and ScenePlan state;
4. `recent_turns`: the current App's latest source turns and new player input.

Only the first two segments are cache candidates. Current time, location,
retrieval results, mood, continuity capsules, ScenePlan state and recent messages
must remain outside an explicit cache block.

## Provider Capability Boundary

- Anthropic Messages or a provider that explicitly documents compatible
  `cache_control` semantics may receive cache breakpoints.
- Generic OpenAI Chat Completions endpoints must not be sent Anthropic fields.
  Stable-prefix ordering may still help a provider with automatic caching, but
  AetherOS will not claim a hit without provider-reported usage.
- A provider preset must declare its cache capability. No endpoint-name guessing
  and no automatic mutation of a user's API preset.
- Cache reuse never crosses provider, base endpoint, model, exact relationship
  scope or generation surface. Changing any of them starts another lane.

For Claude Code-shaped providers, a deterministic session id belongs to the
cache lane, not to a user-facing character setting. The lane key is derived from
provider preset identity, model, exact
`progressBundleId + personaMaskId + charId`, surface and stable revision. Moving
from one reseller/preset to another creates a new cache because the remote cache
cannot be shared anyway; the player does not need to configure or remember it.

## App Lanes

Each generation surface owns its cache lane:

| Surface | Stable candidate | Always dynamic |
| --- | --- | --- |
| Chat | role base, Chat output contract, stable tools | continuity capsule, selected memory/Life, recent turns |
| Proactive letter | role base, proactive output contract | current availability, selected opening seed, remote-thread handoff |
| Call | role base, call speech/tool contract | current availability and call transcript |
| Date / 见面 | role base, Date prose/presentation contract | route, world state, scene resume and local turns |
| Mainline / IF / bounded scene | canon compiler rules, route-class output contract, stable tools | branch, Director/ScenePlan projection, manuscript tail |

Switching Apps may cold-start another lane. It must not create one giant shared
prompt or overwrite the still-valid Chat lane.

## Cache-off Requests

The first implementation should not attach explicit cache controls to:

- tool-result follow-ups;
- forced `tool_choice` requests;
- media-heavy image/audio/video inputs;
- safety- or confirmation-sensitive executor handoffs whose payload shape is
  intentionally one-off.

This is a request-shape boundary, not a restriction on the role's expression or
tool autonomy.

## Local Observation

Local diagnostics may record only metadata:

- provider preset id, model, surface and anonymized lane id;
- cache segment path, character count, stable revision and content hash;
- provider-reported input, cache creation, cache read and output tokens;
- unsupported or stripped-cache response status.

Raw prompts, messages, API keys and private memory must not enter cache logs.
The UI should show cache savings only when the provider returns meaningful cache
usage fields. “Breakpoint attached” and “cache read observed” are different
states.

## Later Implementation Checkpoints

1. Introduce a provider-neutral `PromptEnvelope` that preserves the four segment
   order without changing model-visible text.
2. Move current time, location, memory retrieval and foreground continuity out
   of the stable prefix; guard the resulting provider view with fixtures.
3. Add explicit cache capability to provider adapters and implement Anthropic
   breakpoints only in the supporting adapter.
4. Keep deterministic lane/session identity internal.
5. Add metadata-only request and usage diagnostics.
6. Run three consecutive requests in one lane: first creation may be nonzero;
   later requests must show provider-reported cache reads while dynamic context
   remains fresh.
7. Repeat across an App switch and return to Chat, then across a model/provider
   switch. A cache miss is acceptable; context contamination is not.

No implementation checkpoint is Green merely because `cache_control` appears in
a payload. Green requires an unchanged model-facing contract, fresh dynamic
state, provider-observed cache read where supported, and identical normal
behavior when caching is unsupported.
