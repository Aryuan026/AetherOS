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

## Optional Earlier Verbatim Quotes

Chat may additionally expose the per-character setting `参考更早的聊天原话`
(`earlierQuoteRecallEnabled`) and its human-visible `回看范围`
(`earlierQuoteRecallWeeks`). The switch is off by default. The range is one,
two or three weeks only; missing/legacy values read as one week and runtime
normalization clamps abnormal values to 1..3. The range travels with the
Character record and whole-device backup.

When on, one bounded reverse scan (newest message to oldest, existing IndexedDB
reverse-cursor pattern) feeds the selector. The read stops at the earliest
allowed time, the hard raw cursor-visit cap, the hard raw text-character cap, or
the candidate budgets, whichever comes first. Candidate budgets are charged only
for rows that pass the exact-scope/exclusion filter: the read rejects hidden,
historical-import, proactive, Date/Call, `hideBeforeMessageId` and other-scope
rows before they can consume the 900-message / 32,000-character candidate
window. Rejected rows therefore cannot starve older relevant rows merely by
exhausting that candidate window. Raw scan work is separately hard-capped at
1,800 cursor visits and 64,000 text characters; reaching either cap ends the read with a
`visit_budget` / `raw_char_budget` diagnostic instead of paging further or
falling back to `getAll`. Diagnostics report the weeks, raw rows/text characters
visited, admitted exact-scope rows/text characters, and the truncation reason.
These bounds are internal safety limits, not a product-visible range, and may be
recalibrated by the owner.

The candidate message budget is calibrated against the character budget rather
than an arbitrary page: 900 admitted messages at 32,000 admitted characters is
about 35 characters per message. A six-day-old target behind 150 later complete
short turns is therefore scanned, while the read still cannot exceed the
explicit 900-message / 32,000-character candidate budgets, 1,800 raw cursor
visits or 64,000 raw text characters. The 150-turn case is the failing
short-message fixture this calibration must keep Green; the 140-turn case is its
non-regression neighbour.

Selection is local, deterministic and selector-specific. It never depends on
sentence-final punctuation. The intent gate accepts only a true question, question
particle, confirmation, recall structure or predicate-free noun fragment.
Query normalization removes only bounded question
and recall scaffolds; it preserves proper names, ordinals and entity-internal
characters. `当时` is an ordinary recall frame; a leading `那/这 + common
measure` is stripped only as an outer phrase. The current/action gate runs
before the noun-run fallback, so a current purchase or update cannot open recall.

Each ask goes through one anchored boundary parser: it strips only leading or
trailing recall/question scaffolds, then cuts at explicit relation or question
boundaries; short predicate-free noun fragments use the same path. There is no
second global deletion grammar. The resulting entity must be an exact
continuous string in one candidate clause. Exact wins. If exact
fails, one insertion variant is allowed in that clause: query prefix at least
two characters, query suffix at least one, ordered non-overlapping, raw gap at
most four characters, content gap after removing `的/之` at most two. The query
must be fully covered by prefix plus suffix; no query-middle character may be omitted.
A gap containing punctuation, a coordinator, a pronoun, or a relationship/
spatial word is rejected. The matcher returns the match span and scans every
occurrence, so a later valid occurrence is not lost after a rejected prefix.
Exact receives a higher score than variant. `靛蓝雨伞 -> 靛蓝色的伞` is a known
lexical-variant abstain because it drops the query character `雨`.

The match span is the only proof anchor. Details, location/time/owner/quantity
relationships and the answer value must be directly attached to that span in
the same clause/local fact; the answer may be before or after the span but must
be a concrete value or relation. Another subject in the same punctuation-free sentence cannot
lend its slot or value: the gap between the span and the answer must contain no
other content. A location answer needs an explicit storage/movement relation or
an explicit spatial ending, not bare `在`, `来` or `留`. An owner answer needs a
`是/属于/归 ... 的/开的/经营的/创办的` relation, not bare `老板` or `开`. Age
needs a numeric answer `岁` value, not the word `年龄`; price needs the entity's own
currency value, not an aggregate; the quantity unit is captured from the query
and must match. Proper names and ordinals are never collapsed by normalization,
and the selector no longer takes an unused search-term list. Common numeric entity suffixes such as `-5` do not defeat the
gap.

There is no message-level fallback, no cross-clause or cross-message slot
binding, no location continuation, no clause bag, and no unordered character
bag. The following are explicitly `known_local_cross_clause_abstain`: umbrella
and place clauses, rain and place clauses, cake and cafe clauses, luggage and
storage clauses, the natural near wording `旧天文台那次下雨...`, and any other
positive that only a cross-clause relation could prove. They are not claimed as
covered by continuity or Hippocove; those remain a separate follow-up validation
surface. Deep synonym-only paraphrases and category paraphrases may also
honestly abstain. There is no document-frequency threshold, no topic/synonym
dictionary, no private-topic list, and no domain blacklist.

The admitted candidate window is filtered to the exact relationship scope and
still excludes hidden, historical-import, proactive, Date/Call and
`hideBeforeMessageId` evidence, non-quotable message types, the latest ten
complete turns and already-delivered raw messages. Scan truncation drops a
leading partial turn. A selected turn is never clipped by the 1,200-character
delivery budget; an over-budget turn is skipped whole. At most three complete
turns are delivered with the fixed safety boundary text, after the continuity
capsule and before recent raw turns. The block is explicitly labeled as earlier
chat wording for concrete detail only, never durable memory, current Character
Life, narrative truth, behavior requirements or tool permission, and may not be
written back as memory truth. Other surfaces remain HOLD and must not borrow
this Chat-only block.

The selector never fetches, persists, summarizes, writes memory or promotes
anything. Disabled, unmatched, over-budget and local failure paths return an
empty quote block and leave the existing capsule/fallback path intact. With
the setting off there is no new bounded recall read; with it on there is at
most one bounded local read and no extra network fetch.

This bounded recall does not replace or repair Chat continuity's existing
`fullHistory`/`getAll` long-history path. That debt, the capsule/fingerprint
semantics and the summary protocol are unchanged; only the additional
earlier-quote lookback is bounded in this checkpoint.

## Model-facing Position

When the optional earlier-quote setting is on, the Chat request order is:

1. character identity, mounted canon, relationship memory and current trusted
   projections;
2. the foreground continuity capsule, explicitly labeled as non-memory and
   non-current truth;
3. the bounded earlier verbatim quote block, explicitly labeled as detail-only;
4. the latest ten complete turns and the current user message.

With the setting off, the order is unchanged from the original capsule plus
recent-turn contract.

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
