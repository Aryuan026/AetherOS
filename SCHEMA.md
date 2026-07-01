# SullyOS Public Sticker Schema

## Catalog

Path:

```text
public/stickers/catalog.json
```

Shape:

```json
{
  "schema": "sullyos.public-emoji-packs.v1",
  "version": "2026-07-01-blank",
  "assetBase": "assets/",
  "packs": [
    {
      "id": "pack-a",
      "name": "a 组表情包",
      "visibilityDefault": "disabled",
      "assetBase": "assets/pack-a/",
      "stickers": []
    }
  ]
}
```

## Sticker Entry

Recommended shape when images are ready:

```json
{
  "sticker_id": "a_001",
  "name": "A组-开心",
  "asset_file": "a_001.png",
  "tags": ["开心"],
  "desc": "简短画面描述",
  "meaning": "适合表达的语气",
  "use_when": ["想轻快回应时"],
  "avoid_when": ["严肃告别时"],
  "status": "active"
}
```

`asset_file` resolves against the pack `assetBase`, so the example above loads:

```text
public/stickers/assets/pack-a/a_001.png
```

## Naming Rules

There are three separate naming layers. Do not collapse them into one name.

### 1. Pack ID

`pack.id` is the stable permission bundle used by browser-local character enablement.

- Use ASCII lowercase kebab-case.
- Keep it stable after release.
- One pack should match one enablement decision, such as a theme series or a character-specific collection.
- Do not put temporary upload dates or image counts into the pack ID.

Examples:

```text
theme-soft-reaction
theme-sleepy-night
char-sully-daily
char-rikka-private
meme-lab-reaction
```

`pack-a` is only the first placeholder pack. Before a real image batch is published, it can either stay as the stable first pack or be renamed once to a meaningful ID.

### 2. Sticker ID And Asset File

`sticker_id` and `asset_file` are technical stable names.

- Use ASCII lowercase, numbers, and underscores.
- Recommended format: `<pack-short>_<3-digit-number>`.
- `asset_file` should match `sticker_id` plus the final processed extension.
- Do not use Chinese characters, spaces, emojis, or punctuation in file names.

Examples:

```text
soft_001.webp
soft_002.webp
sully_001.png
rikka_001.webp
```

### 3. Display Name

`name` is the human/AI invocation name. This name appears in the AI prompt and is used by `[[SEND_EMOJI: name]]`.

- Use short Chinese names.
- Keep each name globally unique inside SullyOS, because current IndexedDB stores emojis by `name`.
- Prefer `<短包名>-<情绪/动作>` instead of a bare emotion word.
- Avoid many stickers all named `开心`, `可爱`, or `无语`.

Examples:

```text
软软-探头
软软-委屈
晚安-缩被窝
Sully-敲桌
Rikka-冷脸
```

## Tagging Rules

Tags are search/selection hints, not permission controls.

- Theme tags describe visual or emotional series: `软软`, `夜晚`, `吐槽`, `安慰`.
- Character tags describe intended fit: `适合Sully`, `适合Rikka`.
- Action tags describe visible behavior: `探头`, `挥手`, `抱抱`, `拍桌`.
- Tone tags describe conversational use: `撒娇`, `拒绝`, `鼓励`, `尴尬`.

Character access must still be controlled by pack enablement in the app, not by tags.

## Image Processing Rules

Incoming images may be large, irregular, or not designed as standard stickers. Keep raw files separate from served assets.

- Source images can be placed in an untracked inbox while processing.
- Served assets should live under `public/stickers/assets/<pack-id>/`.
- Prefer `.webp` for ordinary static stickers.
- Keep `.png` when transparency quality matters or webp conversion looks bad.
- Keep `.gif` only for animated stickers that should stay animated.
- Target display assets should normally fit within `512x512` or below.
- Preserve transparent background when it exists.
- Crop only when the subject clearly has empty margins; do not crop away meaningful context.

Processing output should update `asset_file`, `desc`, `meaning`, `tags`, `use_when`, and `avoid_when` in the catalog.

## Browser Storage

Synced public packs are stored in IndexedDB:

- `emoji_categories`
  - `source: "public"`
  - `packId`
  - `visibilityMode: "allowlist"` for default-hidden packs
  - `allowedCharacterIds` controls which local characters can read/select the pack
- `emojis`
  - `source: "public"`
  - `packId`
  - `stickerId`
  - `assetFile`
  - semantic fields copied from the catalog

Chat history and per-character enablement remain local to each browser.
