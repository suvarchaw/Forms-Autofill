/// <reference types="vite/client" />
import { expect, test, vi } from 'vitest';
import { collectQuiz, showSuggestions } from '../src/content/suggest';
import html from './fixtures/quiz.html?raw';

// Suggest Paris for the MC question and Mars for the dropdown.
const setup = () => {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const clicks: string[] = [];
  for (const el of document.querySelectorAll('[role="radio"], [role="option"], [role="listbox"], [role="checkbox"]')) {
    el.addEventListener('click', () => clicks.push(`${el.getAttribute('role')}:${el.getAttribute('data-value') ?? ''}`));
  }
  const { items, questions } = collectQuiz(document);
  showSuggestions(items, [
    { questionIndex: 0, optionIndex: 1 },
    { questionIndex: 1, optionIndex: 1 },
  ]);
  const chips = [...document.querySelectorAll<HTMLElement>('[data-fa-chip]')];
  // Chips render in a shadow root; tests reach in through it.
  const btn = (chip: HTMLElement, action: 'Accept' | 'Dismiss') => chip.shadowRoot!.querySelector<HTMLButtonElement>(`button[aria-label^="${action} AI pick"]`)!;
  return { clicks, questions, chips, btn };
};

test('collects only multiple-choice and dropdown questions', () => {
  expect(setup().questions.map((q) => q.text)).toEqual([
    'What is the capital of France?',
    'Which planet is known as the Red Planet?',
  ]);
});

test('suggestions add chips but select nothing', () => {
  const { clicks, chips } = setup();
  expect(chips.map((c) => c.shadowRoot!.querySelector('.label')!.textContent)).toEqual(['AI pick: Paris', 'AI pick: Mars']);
  expect(clicks).toEqual([]);
  expect(document.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
  const buttons = chips.flatMap((c) => [...c.shadowRoot!.querySelectorAll('button')]);
  expect(buttons).toHaveLength(4);
  for (const b of buttons) expect(b.type).toBe('button');
});

const settle = () => new Promise((r) => setTimeout(r, 10));

test('chip buttons are focusable and say what they do', () => {
  const { chips } = setup();
  const labels = chips.map((c) => [...c.shadowRoot!.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')));
  expect(labels).toEqual([
    ['Accept AI pick: Paris', 'Dismiss AI pick: Paris'],
    ['Accept AI pick: Mars', 'Dismiss AI pick: Mars'],
  ]);
  const b = chips[0].shadowRoot!.querySelector('button')!;
  b.focus();
  expect(document.activeElement).toBe(chips[0]); // the page sees the host...
  expect(chips[0].shadowRoot!.activeElement).toBe(b); // ...the button inside has focus
  // The focus outline lives inside each chip's shadow root; none of our CSS lands in the page.
  for (const c of chips) expect(c.shadowRoot!.querySelector('style')!.textContent).toContain('button:focus-visible');
  expect([...document.querySelectorAll('style')].filter((s) => s.textContent!.includes('focus-visible'))).toHaveLength(0);
});

test('✓ on MC clicks exactly the suggested radio', async () => {
  const { clicks, chips, btn } = setup();
  btn(chips[0], 'Accept').click();
  await settle();
  expect(clicks).toEqual(['radio:Paris']);
  expect(document.querySelectorAll('[data-fa-chip]')).toHaveLength(1);
});

// Mimics the live form (verified in the browser): clicks on the listbox itself are ignored,
// a click on an option opens it asynchronously, and while open an option click selects it and closes.
const fakeGoogleDropdown = (listbox: Element) => {
  for (const o of listbox.querySelectorAll('[role="option"]')) {
    o.addEventListener('click', () => {
      if (listbox.getAttribute('aria-expanded') !== 'true') {
        setTimeout(() => listbox.setAttribute('aria-expanded', 'true'), 0);
        return;
      }
      for (const x of listbox.querySelectorAll('[role="option"]')) x.setAttribute('aria-selected', String(x === o));
      listbox.setAttribute('aria-expanded', 'false');
    });
  }
};

test('✓ on dropdown opens it via the selected option, then selects the suggested one', async () => {
  const { clicks, chips, btn } = setup();
  const listbox = document.querySelectorAll('[role="listbox"]')[0];
  fakeGoogleDropdown(listbox);

  btn(chips[1], 'Accept').click();
  await settle();

  expect(listbox.querySelector('[aria-selected="true"]')!.getAttribute('data-value')).toBe('Mars');
  // Option clicks bubble to the listbox, hence each listbox entry.
  expect(clicks).toEqual(['option:', 'listbox:', 'option:Mars', 'listbox:']);
  expect(document.querySelectorAll('[data-fa-chip]')).toHaveLength(1);
});

test('✓ on dropdown that never opens clicks no option and keeps the chip', async () => {
  vi.useFakeTimers();
  const { clicks, chips, btn } = setup();
  btn(chips[1], 'Accept').click();
  await vi.advanceTimersByTimeAsync(2000);
  vi.useRealTimers();

  expect(clicks).toEqual(['option:', 'listbox:']); // only the attempt to open
  expect(document.querySelectorAll('[data-fa-chip]')).toHaveLength(2);
});

test('✕ removes chip and outline without clicking anything', () => {
  const { clicks, chips, btn } = setup();
  btn(chips[0], 'Dismiss').click();
  expect(clicks).toEqual([]);
  expect(document.querySelectorAll('[data-fa-chip]')).toHaveLength(1);
  expect([...document.querySelectorAll<HTMLElement>('*')].filter((el) => el.style.outline)).toHaveLength(1);
});

test('suggesting twice leaves no duplicate chips', () => {
  const { chips } = setup();
  const { items } = collectQuiz(document);
  showSuggestions(items, [{ questionIndex: 0, optionIndex: 1 }]);
  expect(chips[0].isConnected).toBe(false);
  expect(document.querySelectorAll('[data-fa-chip]')).toHaveLength(1);
});
