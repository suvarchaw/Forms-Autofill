/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AnswersResult, WorkerMessage } from '../src/shared/messages';
import { onPageLoad, suggest } from '../src/content/pageLoad';
import html from './fixtures/multipage-p2.html?raw';

const URL = 'https://docs.google.com/forms/d/e/FORM3/formResponse';

// Page 2 of the multi-page fixture: one MC question and "Roll number".
const setup = (opts: { flag: boolean; mode: string; answers: AnswersResult | Promise<AnswersResult>; noteOnce?: boolean }) => {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const local: Record<string, unknown> = { profile: { rollNo: 'RA0001' }, triggerMode: opts.mode };
  const sent: WorkerMessage[] = [];
  vi.stubGlobal('chrome', {
    storage: { local: { get: vi.fn(async (key: string) => ({ [key]: local[key] })) } },
    runtime: {
      sendMessage: vi.fn(async (msg: WorkerMessage) => {
        sent.push(msg);
        if (msg.type === 'noteOnce') return opts.noteOnce ?? true;
        return msg.type === 'shouldFill' ? opts.flag : opts.answers;
      }),
    },
  });
  const rollNo = () => document.querySelector<HTMLInputElement>('input[type="text"]')!;
  return { sent, rollNo };
};
afterEach(() => vi.unstubAllGlobals());

const count = (sel: string) => document.querySelectorAll(sel).length;
const outlines = () => [...document.querySelectorAll<HTMLElement>('*')].filter((el) => el.style.outline).length;

test('running twice: fills once, one chip and one outline, no duplicates', async () => {
  const { rollNo } = setup({ flag: true, mode: 'auto', answers: { answers: [{ questionIndex: 0, optionIndex: 1 }] } });
  const events: string[] = [];
  rollNo().addEventListener('input', () => events.push('input'));

  await onPageLoad(document, URL);
  await onPageLoad(document, URL);

  expect(rollNo().value).toBe('RA0001');
  expect(events).toEqual(['input']); // second run saw the value and left it alone
  expect(count('[data-fa-chip]')).toBe(1);
  expect(outlines()).toBe(1);
  expect(count('[data-fa-badge]')).toBe(0);
  expect(count('[aria-checked="true"]')).toBe(0); // chips only; nothing selected
});

test('Auto without Nano: asks nano-only, no chips, and no note once this tab has seen it', async () => {
  const { sent } = setup({ flag: false, mode: 'auto', answers: { error: 'nano_unavailable' }, noteOnce: false });
  await onPageLoad(document, URL);
  expect(sent.find((m) => m.type === 'getAnswers')).toMatchObject({ nanoOnly: true });
  expect(sent).toContainEqual({ type: 'noteOnce', error: 'nano_unavailable' });
  expect(count('[data-fa-chip]')).toBe(0);
  expect(outlines()).toBe(0);
  expect(count('[data-fa-note]')).toBe(0);
});

describe('Auto page note', () => {
  const note = () => document.querySelector<HTMLElement>('[data-fa-note]');
  afterEach(() => {
    vi.useRealTimers();
    note()?.remove(); // the note lives on <body>, which the next setup replaces anyway
  });

  test('"AI thinking…" while waiting, not clickable, gone when the answers arrive', async () => {
    let reply!: (r: AnswersResult) => void;
    setup({ flag: false, mode: 'auto', answers: new Promise((r) => (reply = r)) });
    const done = onPageLoad(document, URL);
    await vi.waitFor(() => expect(note()?.textContent).toBe('AI thinking…'));
    expect(note()!.style.pointerEvents).toBe('none');
    expect(note()!.getAttribute('role')).toBe('status');
    reply({ answers: [{ questionIndex: 0, optionIndex: 1 }] });
    await done;
    expect(note()).toBeNull();
    expect(count('[data-fa-chip]')).toBe(1);
  });

  test('"Suggest answers" (on click) shows no page note: the popup says Thinking…', async () => {
    let reply!: (r: AnswersResult) => void;
    setup({ flag: false, mode: 'click', answers: new Promise((r) => (reply = r)) });
    const done = suggest(document);
    await Promise.resolve();
    expect(note()).toBeNull();
    reply({ answers: [] });
    await done;
  });

  test.each([
    ['no_answer', "Forms Autofill: AI didn't return a usable answer — try again"],
    ['nano_unavailable', 'Forms Autofill: Auto needs on-device AI — use Suggest answers instead'],
    ['nano_downloading', 'Forms Autofill: On-device AI is still downloading — try again later'],
  ] as const)('%s → note, gone after 6s', async (error, text) => {
    vi.useFakeTimers();
    setup({ flag: false, mode: 'auto', answers: { error } });
    await onPageLoad(document, URL);
    expect(note()!.textContent).toBe(text);
    expect(count('[data-fa-note]')).toBe(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(note()).toBeNull();
  });

  test('no_answer is about this page: shown without asking noteOnce', async () => {
    const { sent } = setup({ flag: false, mode: 'auto', answers: { error: 'no_answer' }, noteOnce: false });
    await onPageLoad(document, URL);
    expect(sent.map((m) => m.type)).not.toContain('noteOnce');
    expect(note()).not.toBeNull();
  });

  test('form layout not recognized → note, no AI request', async () => {
    const { sent } = setup({ flag: false, mode: 'auto', answers: { answers: [] } });
    for (const el of document.querySelectorAll('[role="listitem"]')) el.removeAttribute('role');
    await onPageLoad(document, URL);
    expect(note()!.textContent).toBe('Forms Autofill: Form layout not recognized — no questions found');
    expect(sent.map((m) => m.type)).not.toContain('getAnswers');
  });

  test('no multiple-choice questions → silent (normal on a details form)', async () => {
    const { sent } = setup({ flag: false, mode: 'auto', answers: { answers: [] } });
    document.querySelector('[role="radiogroup"]')!.closest('[role="listitem"]')!.remove();
    await onPageLoad(document, URL);
    expect(note()).toBeNull();
    expect(sent.map((m) => m.type)).not.toContain('getAnswers');
  });
});

test('no flag, On click mode: fills nothing, asks for no answers', async () => {
  const { sent, rollNo } = setup({ flag: false, mode: 'click', answers: { answers: [] } });
  await onPageLoad(document, URL);
  expect(rollNo().value).toBe('');
  expect(sent.map((m) => m.type)).toEqual(['shouldFill']);
});

// "Clear form" reloads /viewform. So does reopening the form or a reload of page 1:
// each is a fresh start, so the fill flag is dropped instead of refilling.
test('/viewform load drops the fill flag and fills nothing', async () => {
  const { sent, rollNo } = setup({ flag: true, mode: 'click', answers: { answers: [] } });
  await onPageLoad(document, 'https://docs.google.com/forms/d/e/FORM3/viewform?usp=sf_link');
  expect(rollNo().value).toBe('');
  expect(sent).toEqual([{ type: 'forgetFill', formId: 'FORM3' }]);
});

// The /viewform vs /formResponse rule with the signed-in /u/<n>/ prefix.
test.each(['0', '1'])('/u/%s/: formResponse fills, viewform drops the flag', async (n) => {
  const base = `https://docs.google.com/forms/u/${n}/d/e/FORM3`;
  let { sent, rollNo } = setup({ flag: true, mode: 'click', answers: { answers: [] } });
  await onPageLoad(document, `${base}/formResponse`);
  expect(rollNo().value).toBe('RA0001');
  expect(sent).toEqual([{ type: 'shouldFill', formId: 'FORM3' }]);

  ({ sent, rollNo } = setup({ flag: true, mode: 'click', answers: { answers: [] } }));
  await onPageLoad(document, `${base}/viewform`);
  expect(rollNo().value).toBe('');
  expect(sent).toEqual([{ type: 'forgetFill', formId: 'FORM3' }]);
});

describe('chips removed by Google re-rendering', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0)); // MutationObserver callbacks run as microtasks
  const autoPick = () => setup({ flag: false, mode: 'auto', answers: { answers: [{ questionIndex: 0, optionIndex: 1 }] } });
  const getAnswersCalls = (sent: WorkerMessage[]) => sent.filter((m) => m.type === 'getAnswers').length;

  test('come back from the cached answers, without a second getAnswers', async () => {
    const { sent } = autoPick();
    await onPageLoad(document, URL);
    document.querySelector('[data-fa-chip]')!.remove();
    await settle();
    expect(count('[data-fa-chip]')).toBe(1);
    expect(document.querySelector('[data-fa-chip]')!.firstChild!.textContent).toBe('AI pick: JavaScript ');
    expect(outlines()).toBe(1);
    expect(getAnswersCalls(sent)).toBe(1);
  });

  test('a pick the user dismissed with ✕ stays dismissed', async () => {
    autoPick();
    await onPageLoad(document, URL);
    document.querySelector<HTMLButtonElement>('[data-fa-chip] button[aria-label="Dismiss AI pick: JavaScript"]')!.click();
    await settle();
    expect(count('[data-fa-chip]')).toBe(0);
  });

  test('after 10s, removed chips are not re-applied', async () => {
    vi.useFakeTimers();
    autoPick();
    await onPageLoad(document, URL);
    await vi.advanceTimersByTimeAsync(10_000);
    document.querySelector('[data-fa-chip]')!.remove();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    expect(count('[data-fa-chip]')).toBe(0);
  });
});
