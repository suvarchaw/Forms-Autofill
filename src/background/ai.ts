import { ANSWER_SCHEMA, SYSTEM_PROMPT, buildPrompt, cleanAnswers, type QuizQuestion } from '../../shared/quiz';
import type { AnswersResult } from '../shared/messages';

// The only place the extension talks to the network. Must match host_permissions in manifest.json.
const WORKER_URL = 'https://forms-autofill-proxy.formsautofill.workers.dev';

// The docs say to pass availability() the same options as create().
export const NANO_OPTS: LanguageModelOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

// Nano if it's ready on this device, else the proxy. forceProxy is a dev-only switch to test the fallback.
export async function getAnswers(questions: QuizQuestion[]): Promise<AnswersResult> {
  const { forceProxy } = await chrome.storage.local.get('forceProxy');
  const useNano =
    !forceProxy && typeof LanguageModel !== 'undefined' && (await LanguageModel.availability(NANO_OPTS)) === 'available';

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
      res = await fetch(`${WORKER_URL}/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Install-Id': await getInstallId() },
        body: JSON.stringify({ questions }),
      });
    } catch {
      return { error: 'unreachable' };
    }
    if (res.status === 429) return { error: 'limit' };
    if (!res.ok) return { error: 'unreachable' };
    raw = await res.json().catch(() => null);
  }

  // Proxy answers are re-checked too: the extension trusts neither backend's output.
  const answers = cleanAnswers(raw, questions);
  return answers.length ? { answers } : { error: 'no_answer' };
}

async function askNano(questions: QuizQuestion[]): Promise<string> {
  const session = await LanguageModel.create({
    ...NANO_OPTS,
    initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
  });
  try {
    return await session.prompt(buildPrompt(questions), { responseConstraint: ANSWER_SCHEMA });
  } finally {
    session.destroy();
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
