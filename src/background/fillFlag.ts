// "The user clicked Fill on this form" flag, so later pages of the same form fill on load.
// storage.session already dies with the browser; the TTL also covers people who never close it,
// since daily forms (attendance) reuse the same form ID. Each auto-filled page resets the clock.
const TTL_MS = 30 * 60 * 1000;
const key = (formId: string) => `fill:${formId}`;

export async function rememberFill(formId: string, now = Date.now()) {
  await chrome.storage.session.set({ [key(formId)]: now });
}

export async function forgetFill(formId: string) {
  await chrome.storage.session.remove(key(formId));
}

export async function shouldFill(formId: string, now = Date.now()): Promise<boolean> {
  const { [key(formId)]: setAt } = await chrome.storage.session.get(key(formId));
  if (typeof setAt !== 'number') return false;
  if (now - setAt >= TTL_MS) {
    await forgetFill(formId);
    return false;
  }
  await rememberFill(formId, now);
  return true;
}
