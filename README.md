# Forms Autofill

A Chrome (Manifest V3) extension for Google Forms that does two things:

1. **Profile autofill, no AI.** Fill name, email, phone, college, roll no. and your own custom fields from a profile saved in the browser.
2. **AI quiz suggestions you confirm.** Multiple-choice and dropdown questions get an outlined "AI pick" with a ✓ / ✕ chip. Nothing is selected until you click ✓.

It never submits a form and never selects an AI answer for you.

## How it works

- **Autofill** matches each text question to a profile field by whole-word synonyms (longest match wins; ambiguous or "father/mother/guardian…" questions are skipped and badged "not filled"). Fields that already have a value are never overwritten.
- **Quiz suggestions** use Gemini Nano (Chrome's on-device Prompt API) when available, so nothing leaves your device. Otherwise, only after you click **Suggest answers**, the question text and options go through a Cloudflare Worker proxy to an LLM provider. The proxy accepts only `{questions, options}` and enforces a global daily cap plus a per-install limit.
- **Trigger modes** (popup): Off / On click (default) / Auto. Auto suggests on page load using Nano only, never the proxy.
- **Multi-page forms** work because "Next"/"Back" are full page loads; the content script re-runs on each page.

## Privacy

- Your profile lives in `chrome.storage.local` and is never sent anywhere.
- Quiz text leaves the device only when Nano is unavailable *and* you click "Suggest answers".
- The install ID is a random UUID with no personal data.

## Supported

Short answer, paragraph, multiple choice, checkboxes, dropdown. Everything else (grids, dates, file upload, scales) is left untouched.

## Install

Not on the Chrome Web Store yet. Install from a GitHub release:

1. Download `forms-autofill-<version>.zip` from [Releases](https://github.com/suvarchaw/Forms-Autofill/releases) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

This is an unreviewed download. Read the source before you install it.

## Develop

```bash
npm install
npm run dev        # watch build into dist/
npm run build      # typecheck + both Vite builds
npm test           # Vitest + jsdom
npm run typecheck
```

Load it: `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`. After a rebuild, reload the extension by hand.

The proxy lives in [`worker/`](worker) (`npm run dev` / `npm test` inside it). The AI key is a Worker secret; never commit `.env` or `.dev.vars`.

## Layout

| Path | Role |
|---|---|
| `src/content/` | Parses and fills the form; draws chips/badges in a Shadow DOM (`ui.ts`) |
| `src/background/` | Service worker: all network and AI calls |
| `src/popup/` | Profile, trigger mode, Nano download (needs a user click) |
| `src/shared/` | Typed messages, types, design tokens |
| `worker/` | Cloudflare Worker proxy and rate limiter |
| `test/fixtures/` | Saved Google Forms HTML (scripts stripped, dummy data only) |

Two Vite builds write into `dist/`: popup + ES-module service worker, and the content script as a single IIFE (MV3 content scripts can't use imports).

## More

- [`SPEC.md`](SPEC.md): scope and acceptance per milestone
- [`docs/handoff.md`](docs/handoff.md): architecture decisions and proxy rules
- [`LEARNINGS.md`](LEARNINGS.md): notes per milestone

Status: v0.4. Not affiliated with Google.
