import { ANSWER_SCHEMA, SYSTEM_PROMPT, buildPrompt, cleanAnswers, type QuizQuestion } from '../../shared/quiz';
import type { AnswersResult } from '../shared/messages';

// The only place the extension talks to the network. Must match host_permissions in manifest.json.
const WORKER_URL = 'https://forms-autofill-proxy.formsautofill.workers.dev';

// The docs say to pass availability() the same options as create().
export const NANO_OPTS: LanguageModelOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

// Set { debug: true } in chrome.storage.local to log timings in the service worker console.
let debug = false;
async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    if (debug) console.log(`[forms-autofill] ${label} ${Math.round(performance.now() - start)}ms`);
  }
}

const nanoState = async () =>
  typeof LanguageModel === 'undefined' ? 'unavailable' : await time('availability', () => LanguageModel.availability(NANO_OPTS));

// Nano if it's ready on this device, else the proxy. forceProxy is a dev-only switch to test the fallback.
// nanoOnly (Auto mode): never the proxy; questions only leave the device after a user click.
export async function getAnswers(questions: QuizQuestion[], nanoOnly = false): Promise<AnswersResult> {
  const store = await chrome.storage.local.get(['forceProxy', 'debug']);
  debug = !!store.debug;
  return time('total', async () => {
    const state = store.forceProxy ? 'unavailable' : await nanoState();
    const useNano = state === 'available';

    if (nanoOnly && !useNano) return { error: state === 'downloading' ? 'nano_downloading' : 'nano_unavailable' };

    let raw: unknown;
    if (useNano) {
      try {
        raw = await askNano(questions);
      } catch {
        // No proxy fallback: with Nano ready, questions shouldn't silently leave the device.
        return { error: 'no_answer' };
      }
    } else {
      let res: Response;
      try {
        const installId = await getInstallId();
        res = await time('proxy fetch', () =>
          fetch(`${WORKER_URL}/suggest`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'X-Install-Id': installId },
            body: JSON.stringify({ questions }),
          }),
        );
      } catch {
        return { error: navigator.onLine ? 'unreachable' : 'offline' };
      }
      if (res.status === 429) return { error: 'limit' };
      if (!res.ok) return { error: 'unreachable' };
      raw = await res.json().catch(() => null);
    }

    // Proxy answers are re-checked too: the extension trusts neither backend's output.
    const answers = cleanAnswers(raw, questions);
    return answers.length ? { answers } : { error: 'no_answer' };
  });
}

// The base session holds only the system prompt and is never prompted itself: a session keeps
// every prompt in its history, so each request prompts a fresh clone of it instead.
// ponytail: the base dies with the service worker (~30s idle); warmNano rebuilds it when the popup opens.
let base: Promise<LanguageModelSession> | null = null;

const getBase = () =>
  (base ??= time('nano create', () =>
    LanguageModel.create({ ...NANO_OPTS, initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }] }),
  ));

// Popup opened: build the base now so the Suggest click only pays for clone + prompt.
export async function warmNano() {
  debug = !!(await chrome.storage.local.get('debug')).debug;
  if ((await nanoState()) === 'available') await getBase().catch(() => (base = null));
}

async function askNano(questions: QuizQuestion[]): Promise<string> {
  try {
    const b = await getBase();
    const session = await time('nano clone', () => b.clone());
    try {
      return await time('nano prompt', () => session.prompt(buildPrompt(questions), { responseConstraint: ANSWER_SCHEMA }));
    } finally {
      session.destroy();
    }
  } catch (e) {
    base = null; // rebuild next time instead of reusing a broken session
    throw e;
  }
}

// Random, created once. Only used by the Worker for per-install fairness limits.
async function getInstallId(): Promise<string> {
  const { installId } = await chrome.storage.local.get('installId');
  if (typeof installId === 'string') return installId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ installId: id });
  return id;
}
