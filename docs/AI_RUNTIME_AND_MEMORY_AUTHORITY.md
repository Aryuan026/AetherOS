# AI Runtime And Memory Authority

Status: second runtime slice implemented locally

Last updated: 2026-07-30

## Why This Exists

AetherOS has many virtual Apps, but it must not grow one hidden API form and one
fallback rule per App. The product has two ordinary model roles:

- `dialogue`: speaks as the character and writes character-authored
  relationship memory;
- `system_director`: performs structured analysis, editorial review and
  third-person planning without speaking as the character.

These roles describe responsibility, not model brands. Both can use the same
saved API preset. When the player leaves the system-director route at
`inherit_dialogue`, it intentionally follows the current dialogue AI.

## Configuration Contract

The dialogue connection remains the active `APIConfig`.

The system director stores only one binding:

```ts
type AiProviderBinding =
  | { mode: 'inherit_dialogue' }
  | { mode: 'preset'; presetId: string };
```

It does not copy URL, key or model fields into every App. Removing an explicitly
selected preset leaves a visible broken binding until the player chooses again.
Runtime calls must not silently change providers.

The binding is browser-local, included in text/full device backups, and restored
with the saved preset catalog.

## Authority Boundary

The shortest reliable rule is:

```text
What can be extracted or planned -> system_director
How the character remembers and expresses the relationship -> dialogue
```

`system_director` currently owns:

- historical language-fingerprint / stable-detail / opening / scene-material
  analysis;
- current emotion-background classification;
- behavior-boundary compilation and reroll-reason interpretation;
- future Info Station generation/editorial review;
- future narrative-history, ScenePlan and separated world/DM planning.

`dialogue` continues to own:

- visible Chat, Call, Date and proactive character expression;
- MemoryDM and relationship-memory prose;
- character-authored impressions, diary/Timebook notes and comparable
  relationship writing.

Every system-director task has `truthEffect: 'none'`. Its output cannot directly
become current Character Life, current motives, tool permission, played plot or
durable relationship truth. Each target domain keeps its existing promotion or
experience gate.

## Runtime Contract

Task ownership lives in:

- `domain/aiRuntime/types.ts`
- `domain/aiRuntime/registry.ts`

Provider resolution lives in:

- `utils/aiRuntime/routing.ts`

Apps request a typed `AiTaskId`; they do not decide the role themselves. The
first migrated consumers are:

- `history_companion_material_analysis`
- `emotion_background_evaluation`
- `behavior_boundary_compilation`

The behavior compiler is one shared consumer reached from two player surfaces:

- the character card's low-floor `帮我整理` path;
- Chat reroll's optional `重来并记住` reason.

Direct expert instructions do not need a provider and retain the player's exact
wording. Compiled notes become editable advisory rules, not character memory.
The compiler receipt stores provider/scope/hashes/status but neither the raw
complaint nor the rejected reply. A newly accepted reroll rule may be delivered
to that same reroll through a bounded transient projection; compiler failure
must not block the ordinary reroll.

Mixed calls must be split before migration. A helper or App named “Director”
does not prove it is a system task: Group Chat currently emits character speech,
TRPG combines GM state with companion dialogue, and Social mixes public-news
editing with character-authored posts.

## Migration Order

1. Keep configuration, routing, backup and visible failure Green.
2. Migrate high-confidence structured analysis and behavior compilation.
3. Keep relationship memory on dialogue AI and verify its existing receipts.
4. Split mixed generation calls by responsibility.
5. Only then repair or expand entertainment Apps through the same router.

MiniMax TTS, image services and tool transports are adapters, not a third
ordinary model role.
