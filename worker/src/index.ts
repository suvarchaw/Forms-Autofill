export { Limiter } from './limiter';
import { ANSWER_SCHEMA, SYSTEM_PROMPT, buildPrompt, cleanAnswers, type QuizQuestion as Question } from '../../shared/quiz';

// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see this one.
declare global {
  interface Env { GROQ_API_KEY: string }
  namespace Cloudflare { interface Env { GROQ_API_KEY: string } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 10;
const MAX_CHARS = 500;

// No CORS headers on purpose: the extension's service worker doesn't need them, and browsers on other sites get blocked.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const hasExactKeys = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));

const isShortString = (v: unknown, allowEmpty: boolean) =>
  typeof v === 'string' && v.length <= MAX_CHARS && (allowEmpty || v.trim() !== '');

// Returns the questions if the body is exactly { questions: [{ text, options }] } within limits, else null.
export function validate(body: unknown): Question[] | null {
  if (!hasExactKeys(body, ['questions'])) return null;
  const qs = body.questions;
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > MAX_QUESTIONS) return null;
  for (const q of qs) {
    if (!hasExactKeys(q, ['text', 'options']) || !isShortString(q.text, false)) return null;
    const opts = q.options;
    if (!Array.isArray(opts) || opts.length < 1 || opts.length > MAX_OPTIONS) return null;
    if (!opts.every((o) => isShortString(o, true))) return null;
  }
  return qs as Question[];
}

async function suggest(request: Request, env: Env): Promise<Response> {
  const installId = request.headers.get('X-Install-Id');
  if (!installId || !UUID.test(installId)) return json(400, { error: 'bad_request' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const questions = validate(body);
  if (!questions) return json(400, { error: 'bad_request' });

  const limiter = env.LIMITER.get(env.LIMITER.idFromName('global'));
  if (!(await limiter.reserve(installId, Number(env.PER_INSTALL_DAILY), Number(env.DAILY_TOKEN_CAP)))) {
    return json(429, { error: 'limit_reached' });
  }

  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(questions) },
        ],
        temperature: 0.2,
        reasoning_effort: 'low',
        include_reasoning: false,
        max_completion_tokens: 2048,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'quiz_answers', strict: true, schema: ANSWER_SCHEMA },
        },
      }),
    });
  } catch {
    return json(502, { error: 'upstream_error' });
  }
  console.log(JSON.stringify({ questions: questions.length, groqStatus: res.status }));
  if (res.status === 429) return json(429, { error: 'limit_reached' }); // no retry
  if (!res.ok) return json(502, { error: 'upstream_error' });

  const data = (await res.json().catch(() => null)) as {
    usage?: { total_tokens?: number };
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const tokens = data?.usage?.total_tokens;
  if (Number.isInteger(tokens) && tokens! > 0) await limiter.addTokens(tokens!);

  return json(200, { answers: cleanAnswers(data?.choices?.[0]?.message?.content, questions) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let res: Response;
    if (url.pathname !== '/suggest') res = json(404, { error: 'not_found' });
    else if (request.method !== 'POST') res = json(405, { error: 'method_not_allowed' });
    else res = await suggest(request, env);
    // Counts and status only — never question text, options or the install ID.
    console.log(JSON.stringify({ path: url.pathname, status: res.status }));
    return res;
  },
} satisfies ExportedHandler<Env>;
