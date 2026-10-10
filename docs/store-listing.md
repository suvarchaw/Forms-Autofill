# Chrome Web Store submission — copy-paste sheet

Everything the developer dashboard asks for, in dashboard order. Keep the wording honest:
the reviewer reads this next to the code, and a listing that undersells the AI feature is
worse for you than one that states it plainly.

## Store listing tab

**Name:** Forms Autofill

**Summary** (max 132 chars):
> Fill Google Forms from your saved details in one click, and get AI answer suggestions you confirm one by one.

**Category:** Productivity → Workflow & Planning (or Tools)
**Language:** English

**Description:**

> Fill in college and event Google Forms in one click. For college students 18 and over.
>
> Save your details once — name, email, phone, college, roll number, department, year, section, plus any custom fields like "Register number" or "Hostel". Click **Fill my details** and Forms Autofill types them into the matching questions. It understands different wordings ("Name of student", "Mobile no.", "Reg. No.") and skips questions it isn't sure about, like "Father's name", marking them "Not filled" so you can check.
>
> **AI answer suggestions (optional).** For multiple-choice and dropdown questions, click **Suggest answers** and the AI outlines the option it would pick. Nothing is selected until you click ✓ on each suggestion — you stay in control and can ignore any of them. Suggestions can be wrong, especially for maths and course-specific questions.
>
> **What it never does**
> • Never submits a form
> • Never selects an AI answer for you
> • Never overwrites something you've already typed
>
> **Privacy**
> • Your saved details stay in Chrome on your device and are never sent anywhere.
> • AI suggestions run on your device with Chrome's built-in AI when available. Otherwise, only after you click "Suggest answers", the question text and options are sent to our server to get a suggestion. Nothing else is sent.
>
> Fills short-answer and paragraph questions and suggests answers for multiple-choice and dropdown questions, including on multi-page forms. Checkbox and other question types are left alone.
>
> Open source: https://github.com/suvarchaw/Forms-Autofill
> Not affiliated with or endorsed by Google.

**Graphic assets**
- [ ] Icon 128×128 — `public/icons/icon128.png` (already in the build)
- [ ] At least 1 screenshot, 1280×800 or 640×400, PNG/JPEG. Suggested set (use dummy data only):
  1. Popup with a saved profile, next to a Google Form
  2. A form after "Fill my details": filled fields + one "Not filled" badge
  3. A quiz question with the "AI pick" chip and ✓ / ✕
  4. The details editor with a custom field
- [ ] Small promo tile 440×280 (required to be featured, optional to publish)

## Privacy practices tab

**Single purpose:**
> Help users fill in Google Forms faster: it fills text questions from details the user saved, and suggests answers to multiple-choice questions that the user confirms one by one. It never submits a form or selects an answer on its own.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's profile details and settings locally (`chrome.storage.local`), and a short-lived "fill later pages of this form" flag (`chrome.storage.session`). |
| Host permission `https://forms-autofill-proxy.formsautofill.workers.dev/*` | The extension's own server. Used only when the user clicks "Suggest answers" and on-device AI is unavailable, to send the question text and options and receive suggested option numbers. |
| Content script on `https://docs.google.com/forms/*` | Reads the questions on Google Forms pages and fills the ones the user asks it to. It runs on no other site. |

**Remote code:** No, I am not using remote code. (All JS ships in the package; the server returns JSON only.)

**Data usage — what to tick.** When unsure, over-declare: an under-declared listing gets rejected or taken down.
- [x] **Personally identifiable information** — the user's name, email, phone etc. (stored locally and entered into forms the user chooses)
- [x] **Website content** — question text and options sent for AI suggestions
- [ ] Everything else (health, financial, authentication, location, web history, user activity, personal communications) — not collected

Then tick all three certifications (not sold to third parties; not used for unrelated purposes; not used for creditworthiness).

**Privacy policy URL:** `https://suvarchaw.github.io/Forms-Autofill/privacy` (after enabling GitHub Pages — see below)

## Before you submit

- [ ] **Groq terms:** confirm Groq's terms allow serving other people's requests through your one API key (flagged in `docs/handoff.md`, still open).
- [ ] **Deploy the Worker** with the new per-IP limit: `cd worker && npx wrangler deploy`.
- [ ] **GitHub Pages:** repo Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/docs`. Then open the privacy URL above and check it loads.
- [ ] **Developer account:** register at https://chrome.google.com/webstore/devconsole (one-time fee; Google requires 2-Step Verification on the account).
- [ ] **Build the zip from `dist/`** (`npm run build`, then zip the *contents* of `dist/`, not the folder) and upload it.
- [ ] **Bump the version** in `public/manifest.json` and `package.json` for every new upload — the store rejects a repeated version number.
