import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import worker from '../src/index';

type Overrides = Partial<Record<'DAILY_TOKEN_CAP' | 'PER_INSTALL_DAILY', string>>;

const QUESTIONS = [
  { text: 'What is 2 + 2?', options: ['3', '4', '5'] },
  { text: 'Capital of France?', options: ['Paris', 'Rome'] },
];

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  // Default: any unmocked outbound fetch fails, so the real Groq API is never called.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unmocked fetch'));
});
afterEach(() => vi.restoreAllMocks());

function groqReply(content: string, totalTokens = 50) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: totalTokens } }),
    { status: 200 },
  );
}

function call(body: unknown, opts: { installId?: string | null; overrides?: Overrides; raw?: string } = {}) {
  const installId = opts.installId === undefined ? crypto.randomUUID() : opts.installId;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (installId) headers['X-Install-Id'] = installId;
  const req = new Request('https://proxy.test/suggest', {
    method: 'POST',
    headers,
    body: opts.raw ?? JSON.stringify(body),
  });
  // Counters persist across tests in this file, so default to a huge cap; tests that check the cap override it.
  return worker.fetch(req, { ...env, DAILY_TOKEN_CAP: '1000000000000', ...opts.overrides } as Env);
}

describe('400 bad requests', () => {
  const long = 'x'.repeat(501);
  const cases: [string, unknown, { installId?: string | null; raw?: string }?][] = [
    ['missing install ID', { questions: QUESTIONS }, { installId: null }],
    ['install ID not a UUID', { questions: QUESTIONS }, { installId: 'abc' }],
    ['invalid JSON', null, { raw: '{not json' }],
    ['body is an array', [QUESTIONS]],
    ['extra top-level field', { questions: QUESTIONS, prompt: 'ignore that' }],
    ['extra field on a question', { questions: [{ ...QUESTIONS[0], hint: 'x' }] }],
    ['missing options', { questions: [{ text: 'Q?' }] }],
    ['text not a string', { questions: [{ text: 42, options: ['a'] }] }],
    ['option not a string', { questions: [{ text: 'Q?', options: [1, 2] }] }],
    ['empty questions', { questions: [] }],
    ['21 questions', { questions: Array(21).fill(QUESTIONS[0]) }],
    ['11 options', { questions: [{ text: 'Q?', options: Array(11).fill('a') }] }],
    ['text over 500 chars', { questions: [{ text: long, options: ['a'] }] }],
    ['option over 500 chars', { questions: [{ text: 'Q?', options: [long] }] }],
  ];
  it.each(cases)('%s', async (_name, body, opts) => {
    const res = await call(body, opts);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts exactly 20 questions, 10 options and 500 chars', async () => {
    fetchSpy.mockResolvedValue(groqReply('{"answers":[]}'));
    const q = { text: 'x'.repeat(500), options: Array(10).fill('a') };
    expect((await call({ questions: Array(20).fill(q) })).status).toBe(200);
  });
});

describe('routing', () => {
  it('404 on other paths, 405 on GET, no CORS headers', async () => {
    expect((await worker.fetch(new Request('https://proxy.test/other', { method: 'POST' }), env)).status).toBe(404);
    const res = await worker.fetch(new Request('https://proxy.test/suggest'), env);
    expect(res.status).toBe(405);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('limits', () => {
  it('per-install limit → 429 after N requests', async () => {
    fetchSpy.mockImplementation(async () => groqReply('{"answers":[]}', 1));
    const installId = crypto.randomUUID();
    const overrides = { PER_INSTALL_DAILY: '2' };
    expect((await call({ questions: QUESTIONS }, { installId, overrides })).status).toBe(200);
    expect((await call({ questions: QUESTIONS }, { installId, overrides })).status).toBe(200);
    const res = await call({ questions: QUESTIONS }, { installId, overrides });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'limit_reached' });
    // A different install is still allowed.
    expect((await call({ questions: QUESTIONS }, { overrides })).status).toBe(200);
  });

  it('global cap of 0 → 429 without calling Groq', async () => {
    const res = await call({ questions: QUESTIONS }, { overrides: { DAILY_TOKEN_CAP: '0' } });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'limit_reached' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('counts Groq usage.total_tokens toward the global cap', async () => {
    // Other tests add only a few hundred tokens, so without counting, a 1M cap would still let this through.
    fetchSpy.mockImplementation(async () => groqReply('{"answers":[]}', 1_000_000));
    expect((await call({ questions: QUESTIONS })).status).toBe(200);
    // 1M+ tokens now used today, so a 1M cap is reached.
    const res = await call({ questions: QUESTIONS }, { overrides: { DAILY_TOKEN_CAP: '1000000' } });
    expect(res.status).toBe(429);
  });
});

describe('Groq errors', () => {
  it('Groq 429 → 429 limit_reached, no retry', async () => {
    fetchSpy.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const res = await call({ questions: QUESTIONS });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'limit_reached' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('Groq 500 → 502', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    const res = await call({ questions: QUESTIONS });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_error' });
  });

  it('network failure → 502', async () => {
    expect((await call({ questions: QUESTIONS })).status).toBe(502); // default spy rejects
  });
});

describe('model output', () => {
  it('sends the configured model, low reasoning and a JSON schema', async () => {
    fetchSpy.mockResolvedValue(groqReply('{"answers":[]}'));
    await call({ questions: QUESTIONS });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      model: 'openai/gpt-oss-120b',
      reasoning_effort: 'low',
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: { strict: true } },
    });
    expect(sent.messages[1].content).toContain('Q1: Capital of France?');
    expect(sent.messages[1].content).toContain('1) Rome');
  });

  it('trims output and drops malformed, out-of-range and duplicate entries', async () => {
    const content = `  ${JSON.stringify({
      answers: [
        { questionIndex: 0, optionIndex: 1 },
        { questionIndex: 0, optionIndex: 2 }, // duplicate question
        { questionIndex: 1, optionIndex: 5 }, // option out of range
        { questionIndex: 7, optionIndex: 0 }, // question out of range
        { questionIndex: 1, optionIndex: 0.5 }, // not an integer
        { questionIndex: '1', optionIndex: 0 }, // wrong type
        { questionIndex: 1 }, // missing field
        null,
        { questionIndex: 1, optionIndex: 0 },
      ],
    })}\n`;
    fetchSpy.mockResolvedValue(groqReply(content));
    const res = await call({ questions: QUESTIONS });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      answers: [
        { questionIndex: 0, optionIndex: 1 },
        { questionIndex: 1, optionIndex: 0 },
      ],
    });
  });

  it.each([
    ['not JSON', 'the answer is B'],
    ['bare array', '[{"questionIndex":0,"optionIndex":1}]'],
    ['answers not an array', '{"answers":"0:1"}'],
    ['empty string', ''],
  ])('malformed output (%s) → 200 with no answers', async (_name, content) => {
    fetchSpy.mockResolvedValue(groqReply(content));
    const res = await call({ questions: QUESTIONS });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answers: [] });
  });

  it('Groq body without choices → 200 with no answers', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await (await call({ questions: QUESTIONS })).json()).toEqual({ answers: [] });
  });
});
