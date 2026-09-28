import { ERRORS, type FillResult, type Message, type SuggestResult, type WorkerMessage } from '../shared/messages';
import { NANO_OPTS } from '../background/ai';
import type { Profile, ProfileKey } from '../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const form = $<HTMLFormElement>('#profile');
const customList = $('#custom');
const fillBtn = $<HTMLButtonElement>('#fill');
const fillHint = $('#fill-hint');
const fillStatus = $('#fill-status');
const notForm = $('#not-form');
const KEYS: ProfileKey[] = ['name', 'email', 'phone', 'college', 'rollNo', 'department', 'year', 'section'];
const NOT_FORM = 'Open a Google Form first';

// Status lines are plain text; data-tone picks the look (see index.html). Empty text hides them.
type Tone = '' | 'ok' | 'info' | 'warn' | 'error' | 'busy';
const setStatus = (el: HTMLElement, text: string, tone: Tone = '') => {
  el.textContent = text;
  el.dataset.tone = tone;
};
// Temporary limits get the warning look; anything that failed gets the error look.
const errorTone = (e: keyof typeof ERRORS): Tone => (e === 'limit' || e.startsWith('nano_') ? 'warn' : 'error');

// Two views in one page: Edit shows the profile form, Back returns. Focus follows so keyboard users aren't lost.
const showDetails = (details: boolean) => {
  $('#main-view').hidden = details;
  $('#details-view').hidden = !details;
  $(details ? '#back' : '#edit').focus();
};
$('#edit').addEventListener('click', () => showDetails(true));
$('#back').addEventListener('click', () => showDetails(false));

$('#version').textContent = `v${chrome.runtime.getManifest().version}`;

function addRow(label = '', value = '') {
  const row = document.createElement('div');
  row.innerHTML = `<input aria-label="Label" placeholder="Label"><input aria-label="Value" placeholder="Value"><button type="button" class="icon-btn" aria-label="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>`;
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

// Summary card, and nothing to fill with: say so instead of reporting "Filled 0".
function render(profile: Profile) {
  const n = KEYS.filter((k) => profile[k]).length + (profile.custom ?? []).filter((c) => c.value).length;
  fillBtn.disabled = !n;
  fillHint.hidden = !!n;
  // A hidden element still describes the button, so only point at the hint while it shows.
  if (n) fillBtn.removeAttribute('aria-describedby');
  else fillBtn.setAttribute('aria-describedby', 'fill-hint');
  $('#summary').hidden = !n;
  const name = profile.name ?? '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase());
  $('#initials').textContent = initials.join('') || '?';
  $('#summary-name').textContent = name || 'No name added';
  $('#summary-count').textContent = `${n} ${n === 1 ? 'detail' : 'details'} saved on this device`;
}

const save = () => {
  const profile = readForm();
  render(profile);
  return chrome.storage.local.set({ profile });
};

chrome.storage.local.get('profile').then(({ profile }) => {
  const p = (profile as Profile | undefined) ?? {};
  for (const key of KEYS) (form.elements.namedItem(key) as HTMLInputElement).value = p[key] ?? '';
  for (const c of p.custom ?? []) addRow(c.label, c.value);
  render(readForm());
});

form.addEventListener('input', save);
$('#add').addEventListener('click', () => addRow());

fillBtn.addEventListener('click', async () => {
  await save();
  setStatus(notForm, '');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Rejects when no content script is listening, i.e. the tab isn't a Google Form.
    const res = await chrome.tabs.sendMessage<Message, FillResult>(tab.id!, { type: 'fillDetails' });
    if ('error' in res) setStatus(fillStatus, ERRORS[res.error], 'error');
    else setStatus(fillStatus, `Filled ${res.filled} · skipped ${res.skipped}`, 'ok');
  } catch {
    setStatus(fillStatus, '');
    setStatus(notForm, NOT_FORM, 'info');
  }
});

// Quiz suggestions: trigger mode, "Suggest answers", and the one-time Nano download.
const suggestBtn = $<HTMLButtonElement>('#suggest');
const suggestLabel = $('#suggest-label');
const quizStatus = $('#quiz-status');
const downloadBtn = $<HTMLButtonElement>('#download');
const aiStatus = $('#ai-status');
const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="triggerMode"]');

const applyMode = async (mode: string) => {
  for (const input of modeInputs) input.checked = input.value === mode;
  suggestBtn.disabled = mode === 'off';
  // Auto never uses the proxy (the service worker enforces it), so without Nano it does nothing.
  const nano = typeof LanguageModel !== 'undefined' && (await LanguageModel.availability(NANO_OPTS)) === 'available';
  if (mode === 'auto' && !nano) setStatus(quizStatus, ERRORS.nano_unavailable, 'warn');
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
  setStatus(notForm, '');
  setStatus(quizStatus, 'Thinking…', 'busy'); // visually hidden: the button shows it; this is for screen readers
  suggestBtn.disabled = true;
  suggestBtn.setAttribute('aria-busy', 'true');
  suggestLabel.textContent = 'Thinking…';
  let res: SuggestResult;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    res = await chrome.tabs.sendMessage<Message, SuggestResult>(tab.id!, { type: 'suggest' });
  } catch {
    setStatus(quizStatus, '');
    setStatus(notForm, NOT_FORM, 'info');
    return;
  } finally {
    // The user may have picked Off while waiting.
    suggestBtn.disabled = [...modeInputs].some((i) => i.checked && i.value === 'off');
    suggestBtn.removeAttribute('aria-busy');
    suggestLabel.textContent = 'Suggest answers';
  }
  if ('error' in res) setStatus(quizStatus, ERRORS[res.error], errorTone(res.error));
  else if (!res.count) setStatus(quizStatus, 'No multiple-choice or dropdown questions found');
  else setStatus(quizStatus, `Suggested ${res.count} answers — confirm each with ✓`);
});

// Footer: on-device AI state. The download button shows only when the model can be downloaded;
// the download must start from a click (user activation), which the service worker never has.
if (typeof LanguageModel !== 'undefined') {
  LanguageModel.availability(NANO_OPTS).then((a) => {
    downloadBtn.hidden = a !== 'downloadable';
    // Progress is only reported to the create() call that started the download, so none here.
    if (a === 'downloading') setStatus(aiStatus, 'On-device AI is downloading…', 'busy');
    else if (a === 'available') setStatus(aiStatus, 'On-device AI ready', 'ok');
    else if (a === 'unavailable') setStatus(aiStatus, 'On-device AI not available');
  });
} else setStatus(aiStatus, 'On-device AI not available');

downloadBtn.addEventListener('click', async () => {
  downloadBtn.hidden = true; // the footer has room for the progress or the button, not both
  try {
    const session = await LanguageModel.create({
      ...NANO_OPTS,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          setStatus(aiStatus, `Downloading on-device AI… ${Math.round((e as ProgressEvent).loaded * 100)}%`, 'busy');
        });
      },
    });
    session.destroy();
    setStatus(aiStatus, 'On-device AI ready', 'ok');
  } catch {
    downloadBtn.hidden = false;
    setStatus(aiStatus, 'Download failed — try again', 'error');
  }
});
