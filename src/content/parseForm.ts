import type { Question, QuestionType } from '../shared/types';

// Questions are listitems with a level-3 heading. This skips section headers
// (aria-level 2) and the nested listitems that wrap each checkbox option.
export function parseForm(root: ParentNode): Question[] {
  return [...root.querySelectorAll('[role="listitem"]')].flatMap((item) => parseItem(item) ?? []);
}

export function parseItem(item: Element): Question | null {
  const heading = item.querySelector('[role="heading"][aria-level="3"]');
  if (!heading) return null;
  return { ...readTitle(heading), ...detect(item) };
}

// The "Collect email addresses" field is a normal listitem whose input is type="email".
export const TEXT_INPUT = 'input[type="text"], input[type="email"]';

// Required questions end with <span aria-label="Required question"> *</span>.
// Prefer that ARIA label; fall back to a trailing " *".
function readTitle(heading: Element): { text: string; required: boolean } {
  const raw = heading.textContent ?? '';
  const required = !!heading.querySelector('[aria-label="Required question"]') || /\s\*$/.test(raw);
  return { text: raw.replace(/\s*\*$/, '').trim(), required };
}

function detect(item: Element): { type: QuestionType; options: string[] } {
  const unsupported = { type: 'unsupported' as const, options: [] };
  const radiogroups = item.querySelectorAll('[role="radiogroup"]');
  // Grids render one radiogroup per row.
  if (radiogroups.length > 1) return unsupported;

  const listbox = item.querySelector('[role="listbox"]');
  if (listbox) {
    // The "Choose" placeholder is the only option with an empty data-value.
    const opts = listbox.querySelectorAll('[role="option"]:not([data-value=""])');
    return { type: 'dropdown', options: [...opts].map((o) => (o.textContent ?? '').trim()) };
  }

  if (radiogroups.length === 1) {
    // "Clear selection" is a role=button, so reading only radios excludes it.
    const options = choiceLabels(radiogroups[0].querySelectorAll('[role="radio"]'));
    return isLinearScale(options) ? unsupported : { type: 'multiple_choice', options };
  }

  const checkboxes = item.querySelectorAll('[role="checkbox"]');
  if (checkboxes.length) return { type: 'checkboxes', options: choiceLabels(checkboxes) };
  if (item.querySelector('textarea')) return { type: 'paragraph', options: [] };
  if (item.querySelectorAll(TEXT_INPUT).length === 1) return { type: 'short_answer', options: [] };
  return unsupported;
}

// Choices carry aria-label, except "Other", whose <label> reads "Other:".
function choiceLabels(els: NodeListOf<Element>): string[] {
  return [...els].map(
    (el) => el.getAttribute('aria-label') ?? (el.closest('label')?.textContent ?? '').trim().replace(/:$/, ''),
  );
}

// ARIA can't tell a linear scale from multiple choice: both are a radiogroup of
// labelled radios. The only structural difference is that MC radios sit inside
// <label for=id>; we don't use that because it depends on Google's markup, not
// on accessibility semantics. Instead: labels that are consecutive integers
// starting at 0 or 1 are a scale. Tradeoff: an MC question whose answers are
// literally "1","2","3","4" is treated as a scale (unsupported), which fails safe.
export function isLinearScale(labels: string[]): boolean {
  if (labels.length < 2) return false;
  const start = Number(labels[0]);
  if (start !== 0 && start !== 1) return false;
  return labels.every((label, i) => label === String(start + i));
}
