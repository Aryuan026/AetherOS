# Conversation Continuity Contract

## Purpose

Conversation continuity is the foreground handoff between a surface's older
source transcript and its next model request. It keeps a role from abruptly
losing the current topic when raw messages leave the prompt.

It is not durable memory, current Character Life, a narrative event, a behavior
rule, or a replacement for the Daily Archive. Raw messages remain authoritative
and the capsule is always rebuildable from them.

## Chat Runtime

Chat now uses three separate layers:

1. the exact relationship's complete source messages remain in IndexedDB and
   the Daily Archive;
2. the latest ten complete user-led turns remain verbatim in the model request;
3. older live turns become one relationship-scoped continuity capsule.

One turn begins with a user message and includes the assistant/system messages
that follow it until the next user message. Split assistant bubbles therefore
leave the prompt together. Historical-import tail messages remain a separate,
bounded first-continuation source and never enter the live capsule.

Compaction begins when either:

- the player-facing Chat message ceiling is crossed; or
- `aetheros-cjk-latin-v1` estimates more than 12,000 input tokens for the current
  non-history prompt plus live messages.

The estimator is explicitly approximate and its id must accompany diagnostics.
It does not claim provider tokenizer identity. Provider-reported usage remains
the final observation when available.

The current dialogue API updates the capsule only when new turns are about to
leave the raw tail. It merges the previous capsule with the newly compacted
turns in bounded batches; it does not summarize the whole relationship every
round. A failed summary never deletes or rewrites source messages. Chat then
uses the last valid capsule plus its unsummarized delta, or the pre-existing
bounded raw tail when no valid capsule exists.

Capsules are stored as local derived assets under an exact
`progressBundleId + personaMaskId + charId` scope. They travel in whole-device
backup through the existing asset store, but source fingerprints invalidate and
rebuild them after a summarized message is edited, deleted, restored, or moved.

## Model-facing Position

The Chat request order is:

1. character identity, mounted canon, relationship memory and current trusted
   projections;
2. the foreground continuity capsule, explicitly labeled as non-memory and
   non-current truth;
3. the latest ten complete turns and the current user message.

Recent raw messages override the capsule. The capsule cannot create reminders,
tool authority, current motives, Character Life, Narrative runs, relationship
promotion, or permanent memory.

## Cross-App Handoff Slots

These are the fixed integration seams. Only Chat is wired in this checkpoint;
the remaining rows define where later runtime work must connect without reading
another App's private store or moving whole transcripts between surfaces.
The same positions are compiled as
`CONVERSATION_CONTINUITY_SURFACE_CONTRACTS`; changing a row requires changing
and verifying the typed contract rather than quietly choosing a new insertion
point inside an App.

| Surface | Continuity input position | Surface-owned continuation | Write-back boundary | Status |
| --- | --- | --- | --- | --- |
| Chat | after trusted stable/current projections, before recent raw turns | Chat capsule + latest ten complete turns | live messages remain source evidence; MemoryDM/Dreaming decide later promotion | implemented |
| Proactive message | after current Life/availability and scoped memory, before one opening seed | a tiny remote-thread handoff; no raw Chat dump | successful message becomes scoped live evidence, not a capsule rewrite | slot fixed, runtime HOLD |
| Call | once at call start, after role base and current availability, before call transcript | call session transcript and a call-session keepsake | saved call evidence may be seen by later Chat selection; the call never edits the Chat capsule | slot fixed, runtime HOLD |
| Date / 见面 | once when a new/resumed scene is compiled, after current Life and route context, before scene-local recent turns | resumable Date session state | played Date evidence enters Daily Archive/MemoryDM; it does not become remote-chat current truth | slot fixed, runtime HOLD |
| Story mainline | after canon, route and current Director/ScenePlan projections, before manuscript tail | route-scoped scene/run recap | only played/confirmed experience receipts may promote | slot fixed, runtime HOLD |
| Story IF | after canon and explicit branch identity, before branch manuscript tail | branch-scoped recap isolated from mainline | never writes mainline truth without an explicit merge command | slot fixed, runtime HOLD |
| Bounded scene / 小剧场 | after selected premise and cast, before local scene tail | disposable or explicitly saved scene recap | no relationship/narrative promotion unless the player saves and the normal receipt path accepts it | slot fixed, runtime HOLD |

Group Chat must not receive one merged private relationship capsule. Social,
资讯站, Timebook and Calendar browsing do not receive foreground Chat continuity.
Journal may request ordinary scoped memory but not silently import the live Chat
capsule. These exclusions prevent an unrelated App from turning private,
temporary conversation state into public or durable truth.

## Prompt-cache Boundary

Continuity and provider prompt caching are separate. Each generation surface
will later own a cache lane keyed by provider, model, exact role/scope, surface
and stable revision. Switching Apps may cold-start another lane; it must not
force one giant shared prompt or erase Chat continuity. Provider-specific cache
annotations and cached-input telemetry remain a later adapter checkpoint.
The deferred implementation order and provider boundaries are recorded in
`docs/PROMPT_CACHE_PLAN.md`.
