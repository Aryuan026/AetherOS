# SullyOS Requirements

## Public Sticker Packs

- A public sticker pack can be shipped with the static web app.
- A public pack can be empty without rendering broken images.
- Public packs default to disabled unless the catalog says otherwise.
- A user can enable or disable a public pack for the current character.
- Disabled packs must not appear in the emoji picker for that character.
- Disabled packs must not be included in private chat AI prompt context.
- Disabled packs must not be included in group chat prompt context except for members that can use them.
- If a group-chat AI tries to send a hidden sticker anyway, execution must re-check target-character visibility before saving the emoji message.
- Public sticker rows should be treated as server-catalog managed, not locally deletable from the picker.
- Public pack IDs must stay stable after release because browser-local role enablement references the pack/category.
- Sticker display names must be short, globally unique, and suitable for AI invocation.
- Character-specific suitability should be represented as metadata/tags or separate packs, not by changing local role-enable storage.

## Image Intake

- Raw downloaded images may be large or irregular.
- Raw images should be processed before deployment.
- Processed assets should use URL-safe ASCII file names.
- Processed assets should normally be web-ready `webp`, `png`, or animated `gif`.
- The catalog should keep semantic metadata separate from technical file names.

## Storage Boundary

- Static sticker files are shared by everyone who can access the deployed app.
- Character-pack enablement is browser-local and not shared across users/devices.
- Chat records, API settings, and imported local stickers stay browser-local.
