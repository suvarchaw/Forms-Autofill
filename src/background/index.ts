import type { WorkerMessage } from '../shared/messages';
import { getAnswers, warmNano } from './ai';
import { forgetFill, noteOnce, rememberFill, shouldFill } from './fillFlag';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[forms-autofill] installed', details.reason);
});

chrome.runtime.onMessage.addListener((msg: WorkerMessage, sender, sendResponse) => {
  if (msg.type === 'getAnswers') getAnswers(msg.questions, msg.nanoOnly).then(sendResponse);
  else if (msg.type === 'rememberFill' && typeof msg.formId === 'string') rememberFill(msg.formId).then(() => sendResponse());
  else if (msg.type === 'forgetFill' && typeof msg.formId === 'string') forgetFill(msg.formId).then(() => sendResponse());
  else if (msg.type === 'shouldFill' && typeof msg.formId === 'string') shouldFill(msg.formId).then(sendResponse);
  else if (msg.type === 'noteOnce' && typeof msg.error === 'string' && sender.tab?.id !== undefined) noteOnce(sender.tab.id, msg.error).then(sendResponse);
  else if (msg.type === 'warmNano') warmNano().then(() => sendResponse());
  else return;
  return true; // async response
});
