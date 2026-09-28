import type { Message, WorkerMessage } from '../shared/messages';
import type { Profile } from '../shared/types';
import { fillForm } from './fill';
import { formIdFrom, onPageLoad, suggest } from './pageLoad';

// Verified live (signed in): at 'interactive' Google still re-renders the questions, so wait for 'complete'.
if (document.readyState === 'complete') onPageLoad(document, location.href);
else addEventListener('load', () => onPageLoad(document, location.href), { once: true });

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'fillDetails') {
    chrome.storage.local.get('profile').then(async ({ profile }) => {
      const result = fillForm(document, (profile as Profile | undefined) ?? {});
      const formId = formIdFrom(location.href);
      // Later pages of this form then fill on load (see onPageLoad).
      if (formId) await chrome.runtime.sendMessage<WorkerMessage>({ type: 'rememberFill', formId });
      sendResponse(result);
    });
    return true; // keep the channel open: sendResponse runs after the async storage read
  }
  if (msg.type === 'suggest') {
    suggest(document).then(sendResponse);
    return true;
  }
});
