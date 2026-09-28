import { beforeEach, expect, test, vi } from 'vitest';
import { rememberFill, shouldFill } from '../src/background/fillFlag';
import { formIdFrom } from '../src/content/pageLoad';

let store: Record<string, unknown>;
beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      session: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
        remove: vi.fn(async (key: string) => delete store[key]),
      },
    },
  });
});

const MIN = 60 * 1000;

test('fresh flag → true, and each use resets the 30-minute clock', async () => {
  await rememberFill('abc', 0);
  expect(await shouldFill('abc', 29 * MIN)).toBe(true);
  expect(store['fill:abc']).toBe(29 * MIN);
  expect(await shouldFill('abc', 58 * MIN)).toBe(true); // 29 min after the last use
});

test('stale flag → false and removed', async () => {
  await rememberFill('abc', 0);
  expect(await shouldFill('abc', 30 * MIN)).toBe(false);
  expect(store).toEqual({});
});

test('another form or no flag → false', async () => {
  await rememberFill('abc', 0);
  expect(await shouldFill('xyz', 1)).toBe(false);
});

test('formIdFrom', () => {
  expect(formIdFrom('https://docs.google.com/forms/d/e/1FAI-pQ_x/viewform?usp=sf_link')).toBe('1FAI-pQ_x');
  expect(formIdFrom('https://docs.google.com/forms/d/e/1FAI-pQ_x/formResponse')).toBe('1FAI-pQ_x');
  expect(formIdFrom('https://docs.google.com/forms/d/1abc/viewform')).toBe('1abc');
  expect(formIdFrom('https://docs.google.com/forms/u/0/')).toBeNull();
});

// Signed in, Next adds /u/<n>/ (verified live): the old regex gave null here.
test.each(['0', '1'])('formIdFrom with /u/%s/ on viewform and formResponse', (n) => {
  for (const page of ['viewform', 'formResponse']) {
    expect(formIdFrom(`https://docs.google.com/forms/u/${n}/d/e/1FAI-pQ_x/${page}`)).toBe('1FAI-pQ_x');
  }
});
