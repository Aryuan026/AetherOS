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
