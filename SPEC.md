# SPEC: Forms Autofill (Chrome MV3 extension)

Architecture, proxy rules and learning checkpoints live in `docs/handoff.md`. This spec covers what gets built and how each milestone is judged done.

## Goal
A Chrome extension for Google Forms that (1) fills personal details from a saved profile without AI, and
(2) suggests quiz answers with AI that the user confirms one at a time. It never auto-submits.

## Users
- Primary: college students filling repetitive Google Forms (attendance, registrations, quizzes).
- Secondary: the developer, as a portfolio piece; every design choice must be explainable in an interview.
- Constraint: many users have 8 GB laptops that can't run Gemini Nano, so the proxy fallback is required.

## Tooling
- **TypeScript**, with `@types/chrome`. Message payloads between popup, content script and service worker are typed.
- **Vite, multi-entry** (popup, content, background) with no extension plugin. `manifest.json` is copied to `dist/`.
  `npm run dev` = `vite build --watch`; load `dist/` unpacked and reload the extension by hand.
- The content script is built as a **separate single-file IIFE bundle**, because MV3 content scripts declared in the
  manifest can't use ES module imports. The service worker is declared with `"type": "module"`.
- **Vitest + jsdom** for tests.

## Features by milestone

### v0.1: Detect and parse questions
- The content script on `docs.google.com/forms/*` finds every `[role="listitem"]` question and extracts
  `{ text, type, options[], required }`, then logs the list to the console.
- Supported types: **short answer, paragraph, multiple choice, checkboxes, dropdown**.
- Any other type (grids, date, time, file upload, linear scale, etc.) is logged as `type: "unsupported"` and never touched.
- Question text is normalized: trimmed, with the trailing required `*` removed.
- The parser is a pure function `parseForm(root: ParentNode)` so it can be tested without Chrome.

**Acceptance**
- 3 saved HTML fixtures of the developer's own forms are in `test/fixtures/`: (1) a details form with text fields,
  (2) a quiz with all 5 supported types plus at least 1 unsupported type, (3) page 2 of a multi-page form.
- `npm test` passes. For each fixture, the parsed question count, types, texts and option lists equal
  a hand-written expected JSON.
- Fixtures are captured from the live DOM, with `<script>` tags stripped and dummy data only, because the repo will be public.
- Loading the unpacked extension on a live form logs the same structure in DevTools.
- The code uses no class-name selectors (grep for `class=`/`.freebird` returns nothing in `src/`).

### v0.2: Profile and personal-details autofill
- **Popup profile form** with these fields: name, email, phone, college, roll no., department/branch, year, section,
  plus **custom key-value pairs** (the user adds a label and a value).
- Saved to `chrome.storage.local`. Never sent anywhere.
- A **"Fill my details" button** in the popup sends a message to the content script on the active tab.
- **Matching**: each field has a synonym list (e.g. name: `name, full name, student name, name of student`;
  email also includes `college email, college mail`). Question text is lowercased and stripped of punctuation, then
  checked for each synonym on **whole words only**. A custom field's label is its synonym.
  - **Exclusion list**: if the question contains father, mother, parent, guardian, emergency, mentor, faculty, teacher,
    or teammate, it is skipped and gets the "not filled" badge.
  - **Longest matching synonym wins** ("Name of college" → college, not name).
  - If two different fields tie, or nothing matches, the question is skipped and gets a small "not filled" badge.
- Only **text questions** (short answer, paragraph) are filled. **Fields that already have a value are never overwritten.**
- Filling a text field: set the value, then dispatch `input` and `change`.
- The popup shows a result: "Filled 5, skipped 2".

**Acceptance**
- Unit tests for the matcher cover: an exact synonym, a phrase containing a synonym, the longest-match tie-break,
  a tie that gets skipped, no match, and a custom field. They also cover "Father's name" → skipped,
  "College email" → email, and "Username" → no match.
- Unit test (jsdom): filling a fixture text field sets its value and fires `input` and `change`, and a pre-filled field is unchanged.
- Manual: on fixture form 1 opened live, clicking "Fill my details" fills every matched field. After submitting, the
  response sheet shows the values (proof that Google registered them).
- Manual: profile data survives closing the browser.

### v0.3: Quiz suggestions on click (Nano, then proxy)
- The popup has a trigger mode setting: **Off / On click (default) / Auto** (Auto is enabled in v0.4).
- "Suggest answers" batches all **multiple-choice and dropdown** questions on the page into one request. The
  response is a JSON array of `{ questionIndex, optionIndex }`.
- AI path: check `LanguageModel.availability()` → use Nano if it's available → otherwise send the request through the
  service worker to the Cloudflare Worker proxy. The Nano download starts from the popup, which has user activation.
- **Suggest UI**: the suggested option gets a colored outline, and a chip under the question reads "AI pick ✓ / ✕".
  ✓ selects the option with `.click()` (dropdown: open it, then click the option). ✕ removes the suggestion.
- The Worker accepts only `{questions, options}`, builds the prompt server-side and enforces the global daily cap plus
  a per-install limit (install ID in `chrome.storage.local`). When the cap is hit, the popup shows a friendly "limit reached" message.

**Acceptance**
- The Nano service-worker spike is done on a throwaway branch and its result recorded in `LEARNINGS.md` *before* planning.
- Unit tests: prompt builder output for 2 fixture questions, and parsing of valid, malformed and out-of-range AI JSON
  (bad entries are dropped and the extension doesn't crash).
- Worker tests: a request containing anything besides `{questions, options}` → 400. The request after the cap → 429 with the limit message.
- Manual: on fixture quiz 2, "Suggest answers" outlines one option per MC/dropdown question and changes
  nothing until ✓ is clicked. Nothing is ever submitted.
- `git grep` finds no API key in the repo. The key exists only as a Worker secret.

### v0.4: Auto mode, multi-page, errors, polish
- **Auto mode = auto-suggest only**: suggestions appear on page load and on each new form page, and every pick still needs ✓.
- A `MutationObserver` detects form page changes and re-runs parsing, plus autofill if the user triggered it on page 1
  and suggestions if the mode is Auto. No duplicate chips or badges.
- Error states shown in the popup or chip: offline, proxy down, limit reached, Nano unavailable/downloading,
  AI returned nothing usable, form layout not recognized (0 questions found).
- Polish: popup layout, an empty-profile hint, and a keyboard-accessible ✓/✕ chip.

**Acceptance**
- Manual: on fixture form 3 (multi-page), going Next then Back shows suggestions/fills on each page exactly once.
- Unit test: the observer callback is idempotent. Running it twice on the same DOM adds no duplicate chips.
- Each listed error state can be triggered on purpose (DevTools offline, wrong Worker URL, cap set to 0)
  and shows its message. No uncaught errors appear in the console.

## Out of scope
- Auto-submit, ever. Auto-selecting AI answers.
- Grids, date/time, file upload, linear scale, and image-based questions.
- AI answers for checkboxes and text questions (possibly later).
- Autofilling choice questions that match profile fields (e.g. "Year" as a dropdown). Revisit after v0.3.
- Confidence scores or reasons on the AI chip.
- Fuzzy matching, learned mappings, profile sync across devices, multiple profiles.
- Non-Google forms. Locked-mode quizzes on managed Chromebooks (extensions are disabled there).
- Cross-browser builds before v0.4 (Edge/Firefox are publishing options only).

## Data & privacy
- The profile lives only in `chrome.storage.local`. It is never sent to the service worker's network calls, Nano, or the proxy.
- The only data leaving the device: quiz question text and options, sent to the proxy, and only if Nano is unavailable.
  With Nano, nothing leaves the device. When the proxy is used, question text and options are sent to the AI
  provider (Groq) and are subject to its data policy.
- The install ID is a random UUID with no personal data. It's used only for per-install fairness limits.
- The Worker must not log question content anywhere, including Cloudflare's Workers logs (it only keeps counters). The API key is a Worker secret only.
- The privacy policy (needed for the store listing) states the above.

## Manifest permissions
- `storage`: save the profile, trigger mode and install ID in `chrome.storage.local`.
- `content_scripts` matches `https://docs.google.com/forms/*`: parse and fill only on Google Forms pages.
- `host_permissions`: `https://<worker>.workers.dev/*`, so the service worker can call the proxy. Only that URL. (v0.3)
- `offscreen`: only if the spike shows `LanguageModel` can't run in the service worker. (v0.3, conditional)
- Not requested: `tabs` (getting the active tab's ID for messaging doesn't need it), `scripting`, `<all_urls>`.

## Open questions
1. Does `LanguageModel` inference work in an extension service worker? If not, which is better: an offscreen document or the popup? The popup is a poor host because closing it kills inference. (Spike before v0.3.)
2. Rate limiting: Cloudflare's rate-limiting binding or a Durable Object for the global cap? (Decide in v0.3 planning.)
3. Do Groq's terms allow serving other users' requests through one key? If not, which provider?
4. Are dropdown `role="option"` elements in the DOM before the dropdown is opened? Check this in fixture 2; it affects v0.1 parsing.
