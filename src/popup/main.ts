import type { FillResult, Message } from '../shared/messages';
import type { Profile, ProfileKey } from '../shared/types';

const form = document.querySelector<HTMLFormElement>('#profile')!;
const customList = document.querySelector<HTMLDivElement>('#custom')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const KEYS: ProfileKey[] = ['name', 'email', 'phone', 'college', 'rollNo', 'department', 'year', 'section'];

function addRow(label = '', value = '') {
  const row = document.createElement('div');
  row.innerHTML = `<input aria-label="Label" placeholder="Label"><input aria-label="Value" placeholder="Value"><button type="button" aria-label="Remove">✕</button>`;
  const [labelInput, valueInput] = row.querySelectorAll('input');
  labelInput.value = label;
  valueInput.value = value;
  row.querySelector('button')!.onclick = () => {
    row.remove();
    save();
  };
  customList.append(row);
}

function readForm(): Profile {
  const profile: Profile = {};
  for (const key of KEYS) profile[key] = (form.elements.namedItem(key) as HTMLInputElement).value.trim();
  profile.custom = [...customList.children]
    .map((row) => {
      const [label, value] = row.querySelectorAll('input');
      return { label: label.value.trim(), value: value.value.trim() };
    })
    .filter((c) => c.label);
  return profile;
}

const save = () => chrome.storage.local.set({ profile: readForm() });

chrome.storage.local.get('profile').then(({ profile }) => {
  const p = (profile as Profile | undefined) ?? {};
  for (const key of KEYS) (form.elements.namedItem(key) as HTMLInputElement).value = p[key] ?? '';
  for (const c of p.custom ?? []) addRow(c.label, c.value);
});

form.addEventListener('input', save);
document.querySelector('#add')!.addEventListener('click', () => addRow());

document.querySelector('#fill')!.addEventListener('click', async () => {
  await save();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Rejects when no content script is listening, i.e. the tab isn't a Google Form.
    const res = await chrome.tabs.sendMessage<Message, FillResult>(tab.id!, { type: 'fillDetails' });
    status.textContent = `Filled ${res.filled}, skipped ${res.skipped}`;
  } catch {
    status.textContent = 'Open a Google Form first';
  }
});
