# Project handoff: Google Forms autofill Chrome extension

## About me
- Third-year engineering student (SRM University). Resume project with real users; I need to be able to explain every architecture choice and tradeoff in interviews.
- Learning goals: Claude Code, Chrome extensions (MV3), Git, debugging, testing.
- Claude Pro, used only for Claude Code. Budget: ₹0.

## How we work
- **Claude (chat)** writes my Claude Code prompts, reviews what comes back, and guides me through each step and learning checkpoint. It explains the *why* before I run anything.
- **I** run the prompts in Claude Code, read the diffs, and paste back plans, test output, errors, and files for review.
- One step at a time. I don't move on until the step's checkpoint (below) is met.

## The product
A Manifest V3 extension for Google Forms:
1. **Personal-details autofill** (name, email, phone, college, roll no.) from a saved profile. No AI; matches question text to profile fields.
2. **Quiz answering with AI**, in suggest mode by default: highlight the AI's pick, the user confirms.

Chosen over dev-tool ideas despite known concerns (academic-integrity perception, Chrome Web Store policy risk, competitors).

## Architecture decisions
- Claude Pro is a dev tool only. It can't power AI inside the extension.
- **AI layer 1: Gemini Nano** (Chrome's built-in Prompt API, `LanguageModel`). Free and on-device. Needs Windows 10/11, macOS 13+, or Linux; 22 GB free storage; and either a GPU with >4 GB VRAM or 16 GB RAM with 4+ cores. Many 8 GB student laptops won't qualify.
  - The first model download needs a user click (user activation), which a service worker never has. Start the download from the popup.
  - **Unverified:** whether `LanguageModel` inference works in the extension service worker. Spike this on a throwaway branch before planning v0.3. If it doesn't work there, run Nano in an offscreen document or the popup and keep the proxy calls in the service worker.
- **AI layer 2: my own key behind a Cloudflare Worker proxy** (free tier). Groq is the candidate. Read Groq's terms on serving other users' requests through one key before shipping.
- Batch all questions on a page into one request that returns a JSON array of answers.
- Quiz trigger modes in the popup: Off / On click (default) / Auto. Never auto-submit.

## Proxy rules
- Key stored as a Worker secret. Never in extension code, never in Git (`.env` and `.dev.vars` are gitignored).
- The Worker accepts only `{questions, options}` and builds the prompt server-side, so it can't be used as a general-purpose LLM endpoint.
- **The global daily cap is the real safeguard.** The Worker URL is public and install IDs are self-generated, so anyone can bypass a per-install limit. Keep the per-install limit (a random ID in `chrome.storage`) only as a fairness measure for honest users.
- Don't store counters in KV: the free tier allows only 1,000 writes per day. Use Cloudflare's rate-limiting binding or a Durable Object. Decide during v0.3 planning.
- Friendly "limit reached" message when the cap is hit. Never enable billing on the account.

## Technical rules
- Select Forms elements by ARIA role (`[role="listitem"]`, `[role="radio"]`, `[role="checkbox"]`, `[role="listbox"]`), never by obfuscated class names.
- Text fields: set the value, then dispatch `input` and `change`. Radios and checkboxes: `.click()`.
- Content script on `docs.google.com/forms/*`. A `MutationObserver` handles multi-page forms.
- Network calls go through the service worker, never the content script. Worker/API URLs go in `host_permissions`.
- Check `LanguageModel.availability()` first; fall back to the proxy.
- Profile data stays in `chrome.storage.local` and is never sent to any API.

## Known limits
- The answer key isn't in the page (Google grades server-side), so the AI can only reason about each question.
- Locked-mode quizzes on managed Chromebooks disable all extensions.
- Text-only questions first; images later, if at all.
- Accuracy is weak on math and course-specific questions.

## Milestones
Each one is done when: the feature works, tests pass, `LEARNINGS.md` has an entry, and I can explain the listed topics without notes.

| Version | Build | I can explain |
|---|---|---|
| v0.1 | Detect questions (text, type, options), log them; parser tests pass on saved HTML fixtures of my own forms | Content scripts, ARIA selectors, why fixture tests, Vitest + jsdom |
| v0.2 | Popup profile + personal-details autofill | Popup ↔ content script messaging, `chrome.storage`, why events must be dispatched |
| v0.3 | Quiz answers, on click only (Nano, then proxy) | Service worker lifecycle, host permissions, Worker secrets, rate-limit bypass and the global cap |
| v0.4 | Auto mode, multi-page forms, error states, polish | `MutationObserver`, failure modes, what I'd change at scale |

## Claude Code workflow
1. Stay in the permission mode that asks before each edit while learning (Shift+Tab cycles modes; check the indicator below the input box).
2. `SPEC.md` via an interview (AskUserQuestion). After the skeleton exists, run `/init`, trim `CLAUDE.md` to about 30 lines, and check with `/context`.
3. Plan mode for each milestone (Ctrl+G edits the plan). Skip planning for one-line changes.
4. Review each plan for: minimal permissions, where data goes, ARIA selectors, how it's verified, and whether I can explain it.
5. Implement with a runnable check and have Claude show the test output. Esc stops Claude mid-action.
6. Review: `git diff`, side questions with `/btw`, `/code-review`, notes in `LEARNINGS.md`. Don't commit what I can't explain.
7. Commit after every small working step; push to GitHub.
8. Undo Claude's edits with `/rewind` (Esc Esc); use Git for real safety (`git restore .`, feature branches for risky work). After two failed corrections, `/clear` and write a better prompt.
9. After v0.2, add MCP: browser access (Claude in Chrome or a DevTools/Playwright server) and a docs server. Prefer the `gh` CLI over a GitHub MCP. Manage with `/mcp`; disable unused servers.
- Pro usage: one task per session (`/clear`), reference files with `@`, check `/usage` and `/context` often. `/remote-control` for monitoring from my phone.

## Draft CLAUDE.md
```
# Forms Autofill — Chrome extension (MV3)
## Commands
- npm run dev — watch build; load dist/ unpacked
- npm test — Vitest
## Architecture
- src/content/ (find + fill), src/background/ (network + AI calls),
  src/popup/ (profile, mode toggle, Nano download), worker/ (Cloudflare proxy)
## Rules
- ARIA-role selectors only; dispatch input/change for text; .click() for radio/checkbox
- IMPORTANT: never put API keys in extension code; never commit .env or .dev.vars
- Profile data stays in chrome.storage.local; never auto-submit
- Ask before adding manifest permissions
## Working with me (I'm learning)
- After each task, summarize changes and why in ≤5 bullets; explain new Chrome APIs
```

## Publishing
Chrome Web Store: one-time $5 fee. Free alternatives: Edge Add-ons (believed free; Chrome extensions usually run unchanged), Firefox Add-ons (small tweaks), GitHub releases.

## Status
No code yet.

**First week:** (1) SPEC interview → (2) skeleton + `/init` + trimmed CLAUDE.md → (3) v0.1 + fixture tests → (4) v0.2 autofill → (5) practice recovery (break something, then rewind/restore) → (6) add one MCP server.
