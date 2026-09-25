## v0.1
basically v0.1 parses and detects questions from the google form. like it normalizes the questions. it was also done by taking 3 test google forms. we used aria roles because they are consistent even if the code changes(for screen readers) so it helps with inconsistency. same with data-value
why didn't you save the parser's own output as the expected test answer?
because then the questions will be checked against the .gs script which is the pasers own answers and therefore it will be deemed correct making it prone to errors.
fixtures- we didnt use html bcs that means that if anything changes it will be the code. using a live form means if anything changes then it will be the google form. basically for unknown form layout errror handling
iife- content scripts load as plain scripts therefore the import makes them crash at runtime. so we used vite to split the content script into multiple files joined by imports 
next reloads- we tested window test makrer which came out as undefined. pressing next reloads the entire page so reload wipes the page's memory but past memory will be stored in chrome.storage.session

## v0.2

**messaging** – when i click "Fill my details", the popup only sends a tiny message saying "fill". the content script reads my profile from chrome.storage.local itself and sends back how many it filled and skipped. so my profile never travels in a message, which is safer. if the tab isn't a google form, nothing is listening, so the message fails and the popup says "Open a Google Form first". getting the tab's id doesn't need the "tabs" permission, only its url would.

**events** – just setting input.value only changes what you see on screen. google's form code keeps its own copy of the answers and only updates it when it hears "input" and "change" events. without them the field looks filled but the response sheet would be blank. that's why we submitted the form and checked the responses.

**matching** – questions are matched to profile fields by whole words. the longest match wins, so "Name of college" goes to college, not name. "College email" goes to email because "college email" is one of email's words. if a question has words like father, mother, parent or guardian, it's skipped so my details don't go into someone else's field. if two fields tie, it's skipped too. one field can fill more than one question (like "Email" and "Email address").

**email field** – when a form collects emails, google adds an "Email" field at the top that is an input with type="email", not type="text". the parser had to learn to count it as a short answer.

**storage** – chrome.storage.local saves to disk, so my profile is still there after closing chrome.

**badge bug** – the "not filled" badge was added at the bottom of each question's box, so it sat right above the next question's title and looked like it belonged to that one. the code was right but the page was misleading, and users read the page, not the code. fixed by putting the badge next to the question's own title. i checked which question each badge really belonged to with a console command instead of guessing.

**fixture** – my first capture saved the terminal command instead of the page, because my clipboard had the command in it. the parser found 0 questions and the tests failed straight away, so the tests caught it. the second, real capture passed, which proved claude's rebuilt fixture was accurate. i checked it instead of just trusting it.

## nano spike
we tested where gemini nano can run by putting the same test in 4 places: service worker, popup, offscreen page and content script. it worked in all 4. so the AI can live in the service worker like we planned, and we don't need an offscreen page or its extra permission. the first download has to start from a click in the popup. the reply sometimes had a newline at the end ("4\n"), so we need to trim it. we did this on a separate git branch so the test code never touched main — only what we learned comes back.
## v0.3 part 1 – the proxy
the extension never holds the groq key. it talks to my cloudflare worker, and only the worker has the key, saved as a cloudflare secret (typed into the terminal myself, never in code, git, or claude). the worker only accepts questions + options, builds the prompt itself, and checks every request. limits live in one durable object (a single tiny server-side object that counts exactly): a global daily token cap under groq's free limit, and 10 requests a day per install. tokens were the real limit, not requests, because groq allows 1k requests but only 200k tokens a day. the per-install limit can be dodged by making up new ids, so the global cap is what actually protects me. no CORS headers, so websites can't call the worker from a browser. tests fake groq's replies so they never cost anything. i also blocked claude code from reading my secret files with .claude/settings.json.
## v0.3 part 2 – quiz suggestions
"suggest answers" collects the multiple-choice and dropdown questions, the service worker picks the AI (gemini nano if it's available on my laptop, otherwise my proxy), and the page shows an "AI pick ✓ / ✕" chip. nothing is selected until i click ✓, and nothing is ever submitted.

**one source of truth** – the prompt, the answer format and the answer checker live in one shared file used by both the worker and the extension, so they can't drift apart.

**no silent fallback** – if nano fails, it shows an error instead of quietly sending my questions to the proxy, because someone with nano expects their questions to stay on their laptop.

**type="button"** – the chip sits inside google's form, and a normal button inside a form submits it. type="button" stops that.

**forceProxy** – my mac has nano, so i'd never see the fallback working. a hidden flag in storage forces the proxy so i could test it.

**the dropdown bug** – tests passed but the real dropdown didn't pick mars. the test only checked that .click() was called, not that google's dropdown reacted. claude reproduced it, logged every event, and found two things: clicking the dropdown box does nothing (you have to click the currently selected option to open it), and the mars click fired before it finished opening. the fix waits for aria-expanded="true" with a MutationObserver, then clicks. if it never opens, the chip stays so the failure is visible. lesson: passing tests ≠ working in the real browser, and a test that copies google's behaviour breaks silently if google changes.
## v0.3 part 2 – quiz suggestions
"suggest answers" collects the multiple-choice and dropdown questions, the service worker picks the AI (gemini nano if it's available on my laptop, otherwise my proxy), and the page shows an "AI pick ✓ / ✕" chip. nothing is selected until i click ✓, and nothing is ever submitted.

**one source of truth** – the prompt, the answer format and the answer checker live in one shared file used by both the worker and the extension, so they can't drift apart.

**no silent fallback** – if nano fails, it shows an error instead of quietly sending my questions to the proxy, because someone with nano expects their questions to stay on their laptop.

**type="button"** – the chip sits inside google's form, and a normal button inside a form submits it. type="button" stops that.

**forceProxy** – my mac has nano, so i'd never see the fallback working. a hidden flag in storage forces the proxy so i could test it.

**the dropdown bug** – tests passed but the real dropdown didn't pick mars. the test only checked that .click() was called, not that google's dropdown reacted. claude reproduced it, logged every event, and found two things: clicking the dropdown box does nothing (you have to click the currently selected option to open it), and the mars click fired before it finished opening. the fix waits for aria-expanded="true" with a MutationObserver, then clicks. if it never opens, the chip stays so the failure is visible. lesson: passing tests ≠ working in the real browser, and a test that copies google's behaviour breaks silently if google changes.
