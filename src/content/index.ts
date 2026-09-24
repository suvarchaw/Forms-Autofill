import type { Message } from '../shared/messages';
import type { Profile } from '../shared/types';
import { fillForm } from './fill';
import { parseForm } from './parseForm';

console.log('[forms-autofill]', parseForm(document));

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type !== 'fillDetails') return;
  chrome.storage.local.get('profile').then(({ profile }) => {
    sendResponse(fillForm(document, (profile as Profile | undefined) ?? {}));
  });
  return true; // keep the channel open: sendResponse runs after the async storage read
});
