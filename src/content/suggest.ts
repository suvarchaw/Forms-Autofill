import type { Answer, QuizQuestion } from '../shared/messages';
import { parseItem } from './parseForm';

// The Worker rejects a whole batch past these limits, so leave such questions out.
const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 10;
const MAX_CHARS = 500;

// Multiple-choice and dropdown questions, plus their listitems so answer indexes map back to the DOM.
export function collectQuiz(root: ParentNode): { items: Element[]; questions: QuizQuestion[] } {
  const items: Element[] = [];
  const questions: QuizQuestion[] = [];
  for (const item of root.querySelectorAll('[role="listitem"]')) {
    const q = parseItem(item);
    if (q?.type !== 'multiple_choice' && q?.type !== 'dropdown') continue;
    if (q.text.length > MAX_CHARS || q.options.length > MAX_OPTIONS || q.options.some((o) => o.length > MAX_CHARS)) continue;
    if (questions.length === MAX_QUESTIONS) break; // ponytail: later questions get no suggestion; batch in chunks if forms get that long
    items.push(item);
    questions.push({ text: q.text, options: q.options });
  }
  return { items, questions };
}

let clearAll: (() => void)[] = [];

// cleared: removed by us (✓, ✕, or replaced by a newer showSuggestions), as opposed to by Google's re-render.
export type Shown = { answer: Answer; chip: HTMLElement; outlined: HTMLElement; cleared: boolean };

// Outlines each pick and adds an "AI pick" chip. Selects nothing: only the user's ✓ does.
export function showSuggestions(items: Element[], answers: Answer[]): Shown[] {
  addFocusStyle();
  for (const clear of clearAll) clear();
  clearAll = [];
  const shown: Shown[] = [];

  for (const { questionIndex, optionIndex } of answers) {
    const item = items[questionIndex];
    const listbox = item.querySelector<HTMLElement>('[role="listbox"]');
    let label: string, outlined: HTMLElement, select: () => void | Promise<boolean | void>;
    if (listbox) {
      const option = listbox.querySelectorAll('[role="option"]:not([data-value=""])')[optionIndex];
      const value = option.getAttribute('data-value')!;
      label = (option.textContent ?? '').trim();
      outlined = listbox; // the option itself is hidden while the dropdown is closed
      // Verified live: Google ignores script clicks on the listbox itself, but a click on the
      // currently selected option opens it (~125ms, up to ~900ms right after it closed), and
      // option clicks only select while it's open. Needs page focus, which the ✓ click gives.
      select = async () => {
        listbox.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.click();
        if (!(await expanded(listbox))) return false;
        [...listbox.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.getAttribute('data-value') === value)?.click();
      };
    } else {
      const radio = item.querySelectorAll<HTMLElement>('[role="radio"]')[optionIndex];
      label = radio.getAttribute('aria-label') ?? '';
      outlined = radio.closest('label') ?? radio;
      select = () => radio.click();
    }

    outlined.style.outline = '2px solid #1a73e8';
    const chip = document.createElement('span');
    chip.dataset.faChip = '';
    chip.textContent = `AI pick: ${label} `;
    chip.style.cssText = 'display:inline-block;margin:4px 0;padding:1px 6px;border-radius:8px;font:12px sans-serif;background:#e8f0fe;color:#174ea6';
    const entry: Shown = { answer: { questionIndex, optionIndex }, chip, outlined, cleared: false };
    const clear = () => {
      entry.cleared = true;
      outlined.style.outline = '';
      chip.remove();
    };
    chip.append(
      button('✓', `Accept AI pick: ${label}`, async () => {
        // Keep the chip if the dropdown never opened, so the user sees nothing was picked.
        if ((await select()) !== false) clear();
      }),
      button('✕', `Dismiss AI pick: ${label}`, clear),
    );
    // Next to the heading, not inside it: the heading's text is the question the parser reads.
    item.querySelector('[role="heading"][aria-level="3"]')!.after(chip);
    clearAll.push(clear);
    shown.push(entry);
  }
  return shown;
}

// True once the listbox reports aria-expanded="true"; false after 2s so ✓ never hangs.
function expanded(listbox: Element): Promise<boolean> {
  return new Promise((resolve) => {
    if (listbox.getAttribute('aria-expanded') === 'true') return resolve(true);
    const done = (open: boolean) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(open);
    };
    const observer = new MutationObserver(() => listbox.getAttribute('aria-expanded') === 'true' && done(true));
    observer.observe(listbox, { attributes: true, attributeFilter: ['aria-expanded'] });
    const timer = setTimeout(() => done(false), 2000);
  });
}

function button(text: string, ariaLabel: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button'; // the chip sits inside Google's <form>; a default button would submit it
  b.textContent = text;
  b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

// Inline styles can't target :focus-visible, so one <style> for keyboard focus on the chip buttons.
// !important: Google's own CSS may remove button outlines.
function addFocusStyle() {
  if (document.querySelector('style[data-fa-style]')) return;
  const style = document.createElement('style');
  style.dataset.faStyle = '';
  style.textContent = '[data-fa-chip] button:focus-visible{outline:2px solid #174ea6 !important;outline-offset:2px}';
  document.head.append(style);
}

// A small note in the page corner for Auto mode: "AI thinking…" and errors. Not clickable,
// so it never gets in the way of the form. Replaces any earlier note.
export function showNote(text: string, ms?: number): HTMLElement {
  document.querySelector('[data-fa-note]')?.remove();
  const note = document.createElement('div');
  note.dataset.faNote = '';
  note.setAttribute('role', 'status');
  note.textContent = text;
  note.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none;padding:6px 10px;border-radius:8px;font:13px sans-serif;background:#e8f0fe;color:#174ea6;box-shadow:0 1px 3px rgba(0,0,0,.3)';
  document.body.append(note);
  if (ms) setTimeout(() => note.remove(), ms);
  return note;
}
