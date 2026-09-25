import type { AnswersResult, GetAnswersMessage, Message, SuggestResult } from '../shared/messages';
import type { Profile } from '../shared/types';
import { fillForm } from './fill';
import { parseForm } from './parseForm';
import { collectQuiz, showSuggestions } from './suggest';

console.log('[forms-autofill]', parseForm(document));

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'fillDetails') {
    chrome.storage.local.get('profile').then(({ profile }) => {
      sendResponse(fillForm(document, (profile as Profile | undefined) ?? {}));
    });
    return true; // keep the channel open: sendResponse runs after the async storage read
  }
  if (msg.type === 'suggest') {
    suggest().then(sendResponse);
    return true;
  }
});

async function suggest(): Promise<SuggestResult> {
  const { items, questions } = collectQuiz(document);
  if (!questions.length) return { count: 0 };
  // Network and AI calls happen in the service worker; this sends only question text and options.
  const res = await chrome.runtime.sendMessage<GetAnswersMessage, AnswersResult>({ type: 'getAnswers', questions });
  if ('error' in res) return res;
  showSuggestions(items, res.answers);
  return { count: res.answers.length };
}
