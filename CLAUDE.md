# CLAUDE.md

Chrome MV3 extension for Google Forms: profile autofill (no AI) + AI quiz suggestions the user confirms. Scope and per-milestone acceptance: `SPEC.md`. Architecture decisions and proxy rules: `docs/handoff.md`.

## Commands
- `npm run dev` — watch build; load `dist/` unpacked, reload the extension by hand
- `npm run build` — typecheck + both Vite builds
- `npm test` — Vitest + jsdom; single file: `npx vitest run test/smoke.test.ts`, single test: `-t "<name>"`
- `npm run typecheck`

## Architecture
- Two Vite builds into `dist/`: `vite.config.ts` (popup + ES-module service worker) and `vite.content.config.ts` (content script as one IIFE file; a plugin fails the build on any import or extra chunk). Never set `emptyOutDir: true` — the builds would wipe each other.
- `src/content/` parses + fills forms; `src/background/` does all network/AI calls; `src/popup/` holds profile, trigger mode, Nano download (needs user activation); `src/shared/messages.ts` types every message between them. `public/manifest.json` is copied to `dist/`.
- Parser is a pure `parseForm(root: ParentNode)`, tested against saved HTML fixtures in `test/fixtures/` (scripts stripped, dummy data only — repo is public).

## Rules
- ARIA-role selectors only, never class names (no `.freebird`/`class=` in `src/`)
- Text fields: set value, dispatch `input` + `change`. Radio/checkbox: `.click()`
- Never auto-submit; never auto-select AI answers
- Profile stays in `chrome.storage.local`, never sent anywhere. API keys only as Worker secrets; never commit `.env`/`.dev.vars`
- IMPORTANT: ask before adding a manifest permission or a dependency
- Don't run git commit; I commit myself

## Working with me (I'm learning)
- After each task, summarize changes and why in ≤5 bullets; explain any new Chrome API
- Run tests/build and show the output before saying something works
- I check Chrome behaviour myself; tell me exactly what to check
