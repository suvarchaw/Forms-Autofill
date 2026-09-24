import type { FillResult } from '../shared/messages';
import type { Profile, ProfileKey } from '../shared/types';
import { matchField } from './match';
import { parseItem, TEXT_INPUT } from './parseForm';

// Fills short-answer and paragraph questions from the profile. Never overwrites
// an existing answer. Never logs values.
export function fillForm(root: ParentNode, profile: Profile): FillResult {
  const custom = (profile.custom ?? []).filter((c) => c.label.trim());
  const result: FillResult = { filled: 0, skipped: 0 };

  for (const item of root.querySelectorAll('[role="listitem"]')) {
    const q = parseItem(item);
    if (q?.type !== 'short_answer' && q?.type !== 'paragraph') continue;
    const input = item.querySelector<HTMLInputElement | HTMLTextAreaElement>(`textarea, ${TEXT_INPUT}`)!;
    if (input.value) {
      result.skipped++;
      continue;
    }

    const id = matchField(q.text, custom.map((c) => c.label));
    // Custom first, so a custom label like "custom" never reads a non-field key of profile.
    const value = id && (custom.find((c) => c.label === id)?.value ?? profile[id as ProfileKey]);
    if (!value) {
      result.skipped++;
      addBadge(item);
      continue;
    }

    input.value = value;
    // Google's own listeners only notice the change through these events.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    result.filled++;
  }
  return result;
}

function addBadge(item: Element) {
  if (item.querySelector('[data-fa-badge]')) return;
  const badge = document.createElement('span');
  badge.dataset.faBadge = '';
  badge.textContent = 'not filled';
  badge.style.cssText = 'display:inline-block;margin:4px 0;padding:1px 6px;border-radius:8px;font:12px sans-serif;background:#fde7e9;color:#a50e0e';
  item.append(badge);
}
