# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read [AGENTS.md](AGENTS.md) first** — it holds the brand, tone, language, design and Shopify guardrails for this project (French storefront copy, premium/soft-luxury tone, no external JS libs, additive Dawn-compatible edits, mobile-first, conversion-first). Everything below is complementary.

## Repository layout

Two separate things live here:

- `theme_export__maison-memoires-dawn/` — **the production Shopify theme** (modified Dawn, classic Liquid / OS 2.0 JSON templates). Almost all real work happens here.
- Repo root (`index.html`, `assets/app.js`, `assets/styles.css`, `img/`, `frames-desktop-webp/`) — a **standalone static HTML prototype** of the homepage. It is not deployed. Its design and copy were ported into the theme as the `maison-homepage` section. `docs/homepage-deliverable.md` is the UX/copy/SEO spec behind it.

Note the root `assets/` is the prototype's folder, not the theme's.

## Commands

No build step, package manager, or test suite. Run Shopify CLI from inside the theme folder (or pass `--path`):

```sh
shopify theme dev --path theme_export__maison-memoires-dawn     # local preview with hot reload
shopify theme check --path theme_export__maison-memoires-dawn   # Liquid/theme linting
shopify theme push --path theme_export__maison-memoires-dawn --unpublished   # push as new theme
shopify theme pull --path theme_export__maison-memoires-dawn    # pull Theme Editor changes back
```

Settings changed in the Theme Editor live in `config/settings_data.json` and `templates/*.json`; pull before editing those files to avoid overwriting merchant changes.

## Store and live theme

- Store: `nahrna-8s.myshopify.com`, public domain `maisonmemoire.fr`.
- **The live theme is shown as "Horizon" (`#201863069960`) in the admin, but it IS this repo's theme** (Dawn 15.4.1 base, `settings_schema.json` says "Dawn"). It is not Shopify's Horizon theme, only renamed. Other themes listed (`Development (...)`) are temporary `theme dev` previews.
- Product: single product `ecrin-sonore-cassette-audio-personnalisee`, template `product.audio-keepsake`. Options: `Type audio` × `Coffret` (`Coffret standard`, `Coffret premium`, `Coffret premium personnalisé`) × `Durée` (`30 secondes`, `5 minutes`). Every variant has a featured image. Public product data: `https://maisonmemoire.fr/products.json`.
- Deploy workflow agreed with the owner: push the changed files to live first, then commit/push to GitHub only after the owner confirms.

```sh
# Push only what changed, so Theme Editor settings on live are never overwritten
shopify theme push --path theme_export__maison-memoires-dawn --theme 201863069960 --allow-live --only <file> [--only <file> ...]
# Check drift before editing JSON: pull live into a scratch folder and diff
shopify theme pull --theme 201863069960 --path <absolute scratch dir>
```

JSON files pulled from Shopify start with an auto-generated `/* IMPORTANT: ... */` comment. It is expected; keep it (local copies were synced with live on 2026-09-28).

The prototype is opened directly in a browser (`index.html`), no server required.

## Theme architecture: the audio keepsake flow

The product is a personalized cassette sold as a single product with variants. The custom purchase flow spans several files and is driven by **global theme settings** (`config/settings_schema.json`, "audio keepsake" group):

- `audio_keepsake_product_handle` (empty in the live settings; code falls back to the real handle `ecrin-sonore-cassette-audio-personnalisee`) — the main product. `snippets/audio-keepsake-product-url.liquid` resolves its URL with fallbacks and is used by the header, homepage, cart and 404 for CTAs.
- `audio_option_name` / `duration_option_name` / `packaging_option_name` — the variant option **names** (e.g. `Type audio`, `Durée`, `Coffret`).
- `voice_audio_value` / `ai_audio_value` / `voice_music_value` — the exact option **values** that map to the three audio modes `voice`, `ai`, `voice_music`. Liquid compares these (stripped/downcased) against variant option values, so renaming a variant option in the Shopify admin requires updating these settings too.
- `cloudinary_cloud_name` / `cloudinary_upload_preset` — unsigned Cloudinary upload for customer audio files.

Flow:

1. **Product page** — `templates/product.audio-keepsake.json` uses `main-product` with a `buy_buttons` block setting `enable_audio_keepsake_experience`. When on, `snippets/buy-buttons.liquid` disables dynamic checkout and renders `snippets/audio-keepsake-personalization.liquid`, enhanced by the `<audio-keepsake-form>` custom element in `assets/audio-keepsake-product.js` (syncs a summary from Dawn's `product-info` change events). Styles: `assets/component-audio-keepsake.css`.
2. **Cart** — personalization is collected *after* add-to-cart. `sections/main-cart-items.liquid` renders `snippets/audio-keepsake-cart-panel.liquid` per audio line item; `<audio-keepsake-cart-panel>` in `assets/audio-keepsake-cart.js` uploads the audio file to Cloudinary, then writes line item properties via `routes.cart_change_url`. Mode decides what is required: `voice` → file, `ai` → brief, `voice_music` → both.
3. **Line item property keys** are French and shared between Liquid and JS: `Fichier audio`, `Brief créatif`, `Notes complémentaires`. Keep them in sync in both places.
4. The cart panel locks the `#checkout` button while uploads/saves are in progress and shows `[data-audio-checkout-note]` when an item is incomplete.

Other custom pieces:

- `sections/maison-homepage.liquid` (+ `section-maison-homepage.css/.js`) — the whole homepage as one section (`templates/index.json`). Includes a canvas scroll-driven image sequence built from `assets/maison-home-frame-0001…0120.webp`; the frame count (120) is hard-coded in the Liquid loop.
- The hero plays a 5 s intro once per page load (`HeroIntro` in the same JS): `assets/maison-intro-d-0001…0120.webp` (desktop, 24 fps) / `maison-intro-m-0001…0060.webp` (mobile ≤749px, 12 fps), then swaps to `maison-intro-final-d/m.webp` behind the title. Frames are keyed from `img/cassette-components-assembling.mp4` onto **white** and shown with `mix-blend-mode: multiply`, so no ancestor of `.maison-homepage__hero-stage` inside `.maison-homepage` may create a stacking context (opacity, transform, z-index…), or the white shows. Frame counts are hard-coded in the Liquid loops.
- `sections/cassette-*.liquid`, `audio-preview.liquid`, `audio-cassette-carousel.liquid` — PDP storytelling/SEO sections below the main product.
- `templates/page.cadeau-*.json` (+ `page.cadeau-personnalise-couple.json`) — SEO landing page templates. As of 2026-09-28 the matching pages were **not created in the Shopify admin** (all return 404), so they are not live yet.
- Page `<title>`/description overrides for home, product and landing pages are in `layout/theme.liquid`. The shop name is « Maison Mémoire » while copy says « Maison des mémoires »; the title logic treats both as the brand so it is not repeated.
- `snippets/maison-legal-links.liquid` — legal links shown near purchase.

## Gotchas

- Windows PowerShell 5.1 `Get-Content` reads UTF-8 files without BOM as ANSI, so French accents display as `Ã©`. The files are fine — don't "fix" them. When writing files from PowerShell use `-Encoding utf8`; prefer the Edit/Write tools.
- The storefront never mentions AI: the composed-music option is presented as « composée par nos soins » (cart brief, next-step messages, FAQ). The internal `ai` mode / `ai_audio_value` names are code only.
- Coffret picker (`snippets/audio-keepsake-coffret-picker.liquid`): sold-out coffrets stay selectable on purpose (photos visible, band « Bientôt de retour », add to cart becomes « Épuisé », inline preview on mobile <750px). Don't re-add `disabled`.
- `theme_export__maison-memoires-dawn/.agents/skills/` contains vendored Shopify agent skills; it is not theme code. The CLI only syncs the standard theme folders, so it is never pushed.
