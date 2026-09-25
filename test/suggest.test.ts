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
  const btn = (chip: HTMLElement, label: string) => chip.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
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
  expect(chips.map((c) => c.firstChild!.textContent)).toEqual(['AI pick: Paris ', 'AI pick: Mars ']);
  expect(clicks).toEqual([]);
  expect(document.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
  for (const b of document.querySelectorAll('[data-fa-chip] button')) expect((b as HTMLButtonElement).type).toBe('button');
});

const settle = () => new Promise((r) => setTimeout(r, 10));

test('✓ on MC clicks exactly the suggested radio', async () => {
  const { clicks, chips, btn } = setup();
  btn(chips[0], 'Use AI pick').click();
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

  btn(chips[1], 'Use AI pick').click();
  await settle();

  expect(listbox.querySelector('[aria-selected="true"]')!.getAttribute('data-value')).toBe('Mars');
  // Option clicks bubble to the listbox, hence each listbox entry.
  expect(clicks).toEqual(['option:', 'listbox:', 'option:Mars', 'listbox:']);
  expect(document.querySelectorAll('[data-fa-chip]')).toHaveLength(1);
});

test('✓ on dropdown that never opens clicks no option and keeps the chip', async () => {
  vi.useFakeTimers();
  const { clicks, chips, btn } = setup();
  btn(chips[1], 'Use AI pick').click();
  await vi.advanceTimersByTimeAsync(2000);
  vi.useRealTimers();

  expect(clicks).toEqual(['option:', 'listbox:']); // only the attempt to open
  expect(document.querySelectorAll('[data-fa-chip]')).toHaveLength(2);
});

test('✕ removes chip and outline without clicking anything', () => {
  const { clicks, chips, btn } = setup();
  btn(chips[0], 'Dismiss AI pick').click();
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
