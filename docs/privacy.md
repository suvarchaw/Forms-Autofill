# Forms Autofill — Privacy Policy

Last updated: 10 October 2026

Forms Autofill is a Chrome extension that helps you fill in Google Forms: it fills text questions from details you save, and it can suggest answers to multiple-choice and dropdown questions, which you confirm one by one. It never submits a form and never selects an answer for you.

This page explains exactly what data the extension handles and where it goes.

## Data that stays on your device

- **Your saved details** (name, email, phone, college, roll number, department, year, section and any custom fields you add) are stored in Chrome's local extension storage (`chrome.storage.local`) on your computer. They are **never sent** to the developer, the AI service, or anyone else. They are only typed into Google Forms you choose to fill.
- **Settings**: your quiz-suggestion mode (Off / On click / Auto).
- **A random install ID** (a UUID with no personal information), used only for rate limits (see below).
- **Short-lived form state**: a note that you clicked "Fill" on a form, so its later pages fill too. It is kept in session storage (together with one-time flags that stop an on-device-AI notice repeating in a tab) and expires after 30 minutes; it is also cleared when you close Chrome.

You can delete all of this at any time by removing the extension.

## Data sent off your device: AI answer suggestions only

When you ask for answer suggestions:

1. **If Chrome's on-device AI (Gemini Nano) is available**, the question is answered on your computer. Nothing leaves your device.
2. **Otherwise, only after you click "Suggest answers"**, the extension sends the following to our server (a Cloudflare Worker), which forwards it to an AI provider (Groq) to get a suggestion:
   - the **text of the multiple-choice and dropdown questions** on the page and their **answer options**;
   - the **random install ID** (in a request header).

Your saved details, your name, your email, the form's URL and your answers to other questions are **never** sent. "Auto" mode only uses on-device AI and never contacts the server.

### What the server keeps

- The server **does not store or log question text or options.** It logs only the request path, status codes (its own and the AI provider's) and the number of questions.
- For daily rate limits it keeps, for the current day (UTC):
  - a count of requests per install ID;
  - a count of requests per IP address. The raw IP address is **not stored**: only a SHA-256 hash of it combined with a random value (a "salt") generated for that day;
  - the total number of AI tokens used that day, across all users.
- All of these, including the salt, are deleted the first time the server handles a request after the day ends. Once the salt is gone, the hashes can no longer be matched back to an IP address.

### Service providers

- **Cloudflare** runs the server and, like any web host, receives your IP address with each request. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).
- **Groq** receives the question text and options to produce a suggestion. It does not receive your IP address, install ID or any of your saved details. Under Groq's terms, the questions you send are not used to train AI models. See [Groq's privacy policy](https://groq.com/privacy-policy/).

## What we don't do

- We don't sell, rent or share your data with anyone other than the service providers above, and only for the purpose described.
- We don't use your data for advertising, profiling, credit decisions or any purpose unrelated to the extension's single purpose of helping you fill in Google Forms.
- We don't use analytics or tracking.
- The extension complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/), including its Limited Use requirements.

## Where data is processed

Requests to the server are processed in the United States (Cloudflare and Groq).

## Legal basis

The rate-limit data (install ID and IP counters) is processed on the basis of our legitimate interest in preventing abuse of the free AI service.

## Your rights

You can ask for access to, or deletion of, data we hold about you by emailing the address below. Most data deletes itself within a day (see "What the server keeps"); your saved details exist only on your device and are removed by removing the extension.

## Age

The extension is intended for users 18 and over.

## Changes

If this policy changes, the new version will be posted on this page with a new "Last updated" date.

## Contact

Responsible person: Suvarcha Wadhwa

Email: suvarchaw@gmail.com

You can also open an issue at <https://github.com/suvarchaw/Forms-Autofill/issues>.

Forms Autofill is not affiliated with or endorsed by Google.
