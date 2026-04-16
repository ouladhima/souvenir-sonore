# AGENTS.md

## Project identity
Brand name: Maison des mémoires

This project is a Shopify storefront built on a modified Dawn theme.
Primary product: personalized audio cassette keepsake.
Primary business goal: direct conversion.

## Brand positioning
The storefront must feel:
- premium
- emotional
- gift-oriented
- luxurious
- custom-made

Avoid anything that feels:
- dropshipping-like
- cheap
- noisy
- gimmicky
- unnecessarily complex

## Language rules
- All storefront copy must be in French.
- Internal reasoning, implementation notes, comments, and technical wording may be in English when it improves efficiency.
- Prefer the language that maximizes execution quality and speed.

## Technical context
- Theme architecture: Shopify classic Liquid theme
- Base theme: modified Dawn
- Main directories include: assets, config, layout, locales, sections, snippets, templates
- Shopify CLI is used locally
- Development environment is Windows native
- A separate HTML/CSS homepage exists outside the theme and may be integrated later
- An additional Shopify AI agent / toolkit may be connected later

## Core implementation principles
- Mobile-first by default
- Optimize for conversion first
- Prefer simple, robust, maintainable implementations
- Prefer small targeted edits over broad refactors
- Plan first, then execute
- Preserve theme stability and long-term maintainability
- Build as if the site is meant to stay in production permanently

## Shopify-specific rules
- Respect Shopify theme architecture and Dawn conventions
- Prefer additive edits over destructive rewrites
- Keep compatibility with Theme Editor whenever possible
- Do not break section settings or schema without a clear reason
- Do not introduce external JavaScript libraries
- Minimize custom JavaScript
- Use native Liquid / HTML / CSS / small JS enhancements first
- Keep locale friendliness in mind when adding customer-facing text

## UX and conversion rules
- Prioritize clarity, emotional value, and purchase confidence
- Every section should serve a purpose
- Avoid decorative sections with weak conversion value
- Favor streamlined flows and friction reduction
- Keep copy elegant and concise
- Favor storytelling around memory, emotion, gift, and tailored creation
- Do not use wording that suggests generic dropshipping

## Design direction
Target palette:
- #F7F3EC
- #FEFAF3
- #F7EEE2

Design intent:
- soft luxury
- warm minimalism
- generous spacing
- clean hierarchy
- premium restraint

Avoid:
- flashy promo styling
- aggressive sales language
- clutter
- unnecessary badges or blocks
- visual noise

## Working style
For each non-trivial task:
1. Briefly inspect the relevant files
2. Produce a short implementation plan
3. Execute the change
4. Mention any important risks or assumptions
5. Suggest concrete improvement ideas when relevant

Do not spend time listing touched files unless explicitly asked.

## Commands and tooling
You may suggest and run relevant development commands when helpful, including:
- Shopify CLI commands
- theme validation commands
- local dev commands
- search / read / inspection commands

Assume the user is comfortable with a relatively permissive workflow.

## Guardrails
- Never add a JS dependency or third-party front-end library without explicit justification
- Never create large architectural rewrites for small requests
- Never add sections or content blocks with weak strategic value
- Never make the storefront tone sound mass-market or low-end
- Never over-engineer simple UX needs

## Preferred output style
When implementing:
- be direct
- be efficient
- make the smallest correct change
- optimize for production durability
- suggest better alternatives when a requested approach is fragile