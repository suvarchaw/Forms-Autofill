import type { GetAnswersMessage } from '../shared/messages';
import { getAnswers } from './ai';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[forms-autofill] installed', details.reason);
});

chrome.runtime.onMessage.addListener((msg: GetAnswersMessage, _sender, sendResponse) => {
  if (msg.type !== 'getAnswers') return;
  getAnswers(msg.questions).then(sendResponse);
  return true; // async response
});
