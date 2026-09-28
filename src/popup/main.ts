import { ERRORS, type FillResult, type Message, type SuggestResult, type WorkerMessage } from '../shared/messages';
import { NANO_OPTS } from '../background/ai';
import type { Profile, ProfileKey } from '../shared/types';

const form = document.querySelector<HTMLFormElement>('#profile')!;
const customList = document.querySelector<HTMLDivElement>('#custom')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const fillBtn = document.querySelector<HTMLButtonElement>('#fill')!;
const fillHint = document.querySelector<HTMLParagraphElement>('#fill-hint')!;
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

// Nothing to fill with: say so instead of reporting "Filled 0".
function updateFill(profile: Profile) {
  const empty = KEYS.every((k) => !profile[k]) && !profile.custom?.some((c) => c.value);
  fillBtn.disabled = empty;
  fillHint.hidden = !empty;
}

const save = () => {
  const profile = readForm();
  updateFill(profile);
  return chrome.storage.local.set({ profile });
};

chrome.storage.local.get('profile').then(({ profile }) => {
  const p = (profile as Profile | undefined) ?? {};
  for (const key of KEYS) (form.elements.namedItem(key) as HTMLInputElement).value = p[key] ?? '';
  for (const c of p.custom ?? []) addRow(c.label, c.value);
  updateFill(readForm());
});

form.addEventListener('input', save);
document.querySelector('#add')!.addEventListener('click', () => addRow());

fillBtn.addEventListener('click', async () => {
  await save();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Rejects when no content script is listening, i.e. the tab isn't a Google Form.
    const res = await chrome.tabs.sendMessage<Message, FillResult>(tab.id!, { type: 'fillDetails' });
    status.textContent = 'error' in res ? ERRORS[res.error] : `Filled ${res.filled}, skipped ${res.skipped}`;
  } catch {
    status.textContent = 'Open a Google Form first';
  }
});

// Quiz suggestions: trigger mode, "Suggest answers", and the one-time Nano download.
const suggestBtn = document.querySelector<HTMLButtonElement>('#suggest')!;
const downloadBtn = document.querySelector<HTMLButtonElement>('#download')!;
const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="triggerMode"]');

const applyMode = async (mode: string) => {
  for (const input of modeInputs) input.checked = input.value === mode;
  suggestBtn.disabled = mode === 'off';
  // Auto never uses the proxy (the service worker enforces it), so without Nano it does nothing.
  const nano = typeof LanguageModel !== 'undefined' && (await LanguageModel.availability(NANO_OPTS)) === 'available';
  if (mode === 'auto' && !nano) status.textContent = ERRORS.nano_unavailable;
};
chrome.storage.local.get('triggerMode').then(({ triggerMode }) => {
  const mode = (triggerMode as string | undefined) ?? 'click';
  applyMode(mode);
  // Build Nano's session while the user reads the popup, so Suggest only waits for the answer.
  if (mode !== 'off') chrome.runtime.sendMessage<WorkerMessage>({ type: 'warmNano' }).catch(() => {});
});
for (const input of modeInputs) {
  input.addEventListener('change', () => {
    applyMode(input.value);
    chrome.storage.local.set({ triggerMode: input.value });
  });
}

suggestBtn.addEventListener('click', async () => {
  status.textContent = 'Thinking…';
  suggestBtn.disabled = true;
  let res: SuggestResult;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    res = await chrome.tabs.sendMessage<Message, SuggestResult>(tab.id!, { type: 'suggest' });
  } catch {
    status.textContent = 'Open a Google Form first';
    return;
  } finally {
    // The user may have picked Off while waiting.
    suggestBtn.disabled = [...modeInputs].some((i) => i.checked && i.value === 'off');
  }
  if ('error' in res) status.textContent = ERRORS[res.error];
  else if (!res.count) status.textContent = 'No multiple-choice or dropdown questions found';
  else status.textContent = `Suggested ${res.count} answers — confirm each with ✓`;
});

// Shown only when the model can be downloaded. The download must start from a click (user activation),
// which the service worker never has.
if (typeof LanguageModel !== 'undefined') {
  LanguageModel.availability(NANO_OPTS).then((a) => {
    downloadBtn.hidden = a !== 'downloadable';
    // Progress is only reported to the create() call that started the download, so none here.
    if (a === 'downloading') status.textContent = 'On-device AI is downloading…';
  });
}
downloadBtn.addEventListener('click', async () => {
  downloadBtn.disabled = true;
  try {
    const session = await LanguageModel.create({
      ...NANO_OPTS,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          status.textContent = `Downloading on-device AI… ${Math.round((e as ProgressEvent).loaded * 100)}%`;
        });
      },
    });
    session.destroy();
    downloadBtn.hidden = true;
    status.textContent = 'On-device AI ready';
  } catch {
    downloadBtn.disabled = false;
    status.textContent = 'Download failed — try again';
  }
});
