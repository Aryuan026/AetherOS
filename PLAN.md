# SullyOS Work Plan

## Current Goal

Make SullyOS usable as a small public static web app while keeping personal data browser-local.

## Active Block

Public default sticker packs:

- Keep sticker assets on the server as static files.
- Sync a versioned public sticker catalog into each browser.
- Let users enable a public pack per character.
- Keep disabled packs out of the emoji picker and out of AI prompt context.
- Start with an empty `a 组表情包` pack so images can be added later.

## Holds

- No server-side accounts or shared chat history.
- No paid/public multi-tenant service behavior.
- No backend sticker database for this block.
- Advanced memory and non-chat app behavior stay out of scope unless a real runtime bug appears.
