chrome.runtime.onInstalled.addListener((details) => {
  console.log('[forms-autofill] installed', details.reason);
});
