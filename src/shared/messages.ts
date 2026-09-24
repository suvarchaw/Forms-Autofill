// Messages between popup, content script and service worker. Add variants per milestone.

// Popup → content script. No payload: the content script reads the profile from storage itself.
export type Message = { type: 'fillDetails' };

// Content script → popup, via sendResponse.
export type FillResult = { filled: number; skipped: number };
