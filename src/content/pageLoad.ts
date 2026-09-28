import type { AnswersResult, SuggestResult, WorkerMessage } from '../shared/messages';
import type { Profile } from '../shared/types';
import { fillForm } from './fill';
import { collectQuiz, showSuggestions } from './suggest';

// Same ID on /viewform and on /formResponse (the URL after "Next"). Signed in, Next adds /u/<n>/ (verified live).
export const formIdFrom = (url: string) => url.match(/\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?([\w-]+)/)?.[1] ?? null;

const REAPPLY_MS = 10_000;

export async function suggest(root: ParentNode, nanoOnly = false): Promise<SuggestResult> {
  const { items, questions } = collectQuiz(root);
  if (!questions.length) return { count: 0 };
  // Network and AI calls happen in the service worker; this sends only question text and options.
  const msg: WorkerMessage = nanoOnly ? { type: 'getAnswers', questions, nanoOnly } : { type: 'getAnswers', questions };
  const res = await chrome.runtime.sendMessage<WorkerMessage, AnswersResult>(msg);
  if ('error' in res) return res;
  let shown = showSuggestions(items, res.answers);
  // Verified live (signed in): Google re-renders inside the listitems after load and drops our chips.
  // For 10s, redraw the picks the user hasn't resolved from these cached answers: no new AI call.
  const observer = new MutationObserver(() => {
    const open = shown.filter((s) => !s.cleared);
    if (!open.some((s) => !s.chip.isConnected || !s.outlined.isConnected)) return;
    shown = showSuggestions(items, open.map((s) => s.answer));
  });
  observer.observe(root as Node, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), REAPPLY_MS);
  return { count: res.answers.length };
}

// Every form page is a full load, so this runs once per page. Safe to run twice:
// fillForm never overwrites and dedupes badges, showSuggestions replaces earlier chips.
export async function onPageLoad(doc: Document, url: string) {
  const formId = formIdFrom(url);
  if (formId && new URL(url).pathname.endsWith('/viewform')) {
    // Verified live: Next and Back load /formResponse; first open, reload and "Clear form" load /viewform.
    // A /viewform load is a fresh start, so the flag is dropped and later pages don't refill.
    await chrome.runtime.sendMessage<WorkerMessage>({ type: 'forgetFill', formId });
  } else if (formId && (await chrome.runtime.sendMessage<WorkerMessage, boolean>({ type: 'shouldFill', formId }))) {
    const { profile } = await chrome.storage.local.get('profile');
    fillForm(doc, (profile as Profile | undefined) ?? {});
  }
  const { triggerMode } = await chrome.storage.local.get('triggerMode');
  if (triggerMode === 'auto') await suggest(doc, true); // errors stay silent until v0.4 part 2
}
