/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildPrompt, cleanAnswers } from '../shared/quiz';
import { collectQuiz } from '../src/content/suggest';
import quiz from './fixtures/quiz.html?raw';

const { questions } = collectQuiz(new DOMParser().parseFromString(quiz, 'text/html'));

test('buildPrompt numbers questions and options from the quiz fixture', () => {
  expect(buildPrompt(questions)).toBe(
    'Q0: What is the capital of France?\n  0) Berlin\n  1) Paris\n  2) Madrid\n  3) Rome\n\n' +
      'Q1: Which planet is known as the Red Planet?\n  0) Earth\n  1) Mars\n  2) Venus\n  3) Jupiter',
  );
});

describe('cleanAnswers', () => {
  const ok = [
    { questionIndex: 0, optionIndex: 1 },
    { questionIndex: 1, optionIndex: 1 },
  ];
  test('valid JSON string', () => expect(cleanAnswers(JSON.stringify({ answers: ok }), questions)).toEqual(ok));
  test('trims surrounding whitespace ("4\\n"-style)', () =>
    expect(cleanAnswers(` ${JSON.stringify({ answers: ok })}\n`, questions)).toEqual(ok));
  test('already-parsed object (proxy response)', () => expect(cleanAnswers({ answers: ok }, questions)).toEqual(ok));
  test.each([['{"answers": ['], ['4\n'], ['null'], ['[]'], ['{"answers": "x"}'], [42], [null], [undefined]])(
    'malformed %j → []',
    (raw) => expect(cleanAnswers(raw, questions)).toEqual([]),
  );
  test('drops out-of-range, negative, non-integer and duplicate entries', () => {
    const answers = [
      { questionIndex: 2, optionIndex: 0 },
      { questionIndex: 0, optionIndex: 4 },
      { questionIndex: -1, optionIndex: 0 },
      { questionIndex: 0, optionIndex: 1.5 },
      { questionIndex: '1', optionIndex: 1 },
      { questionIndex: 0, optionIndex: 2 },
      { questionIndex: 0, optionIndex: 3 }, // second answer for Q0: ignored
      null,
    ];
    expect(cleanAnswers({ answers }, questions)).toEqual([{ questionIndex: 0, optionIndex: 2 }]);
  });
});

describe('backend choice', () => {
  const nanoReply = ' {"answers":[{"questionIndex":0,"optionIndex":1}]}\n';
  let store: Record<string, unknown>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let clones: { prompt: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[];
  let baseSession: { clone: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  // Fresh module per test: the Nano base session is module state.
  let ai: typeof import('../src/background/ai');

  const stubNano = (availability: string) => {
    clones = [];
    baseSession = {
      clone: vi.fn(async () => {
        const c = { prompt: vi.fn(async () => nanoReply), destroy: vi.fn() };
        clones.push(c);
        return c;
      }),
      destroy: vi.fn(),
    };
    create = vi.fn(async () => baseSession);
    vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => availability), create });
  };

  beforeEach(async () => {
    store = {};
    const pick = (keys: string | string[]) =>
      Object.fromEntries([keys].flat().filter((k) => k in store).map((k) => [k, store[k]]));
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => pick(keys)),
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
        },
      },
    });
    fetchMock = vi.fn(async () => Response.json({ answers: [{ questionIndex: 1, optionIndex: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    ai = await import('../src/background/ai');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('available → Nano, no network', async () => {
    stubNano('available');
    expect(await ai.getAnswers(questions)).toEqual({ answers: [{ questionIndex: 0, optionIndex: 1 }] });
    expect(create).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(['downloadable', 'downloading', 'unavailable'])('%s → proxy', async (availability) => {
    stubNano(availability);
    expect(await ai.getAnswers(questions)).toEqual({ answers: [{ questionIndex: 1, optionIndex: 1 }] });
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('forceProxy skips an available Nano', async () => {
    stubNano('available');
    store.forceProxy = true;
    await ai.getAnswers(questions);
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // Auto mode: without a ready Nano, nothing is created and nothing leaves the device.
  test.each([
    ['downloadable', false, 'nano_unavailable'],
    ['unavailable', false, 'nano_unavailable'],
    ['downloading', false, 'nano_downloading'],
    ['available', true, 'nano_unavailable'], // forceProxy set
  ])('nanoOnly with Nano %s (forceProxy %s) → %s, no network', async (availability, forceProxy, error) => {
    stubNano(availability);
    store.forceProxy = forceProxy;
    expect(await ai.getAnswers(questions, true)).toEqual({ error });
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('no LanguageModel at all → proxy', async () => {
    await ai.getAnswers(questions);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('no LanguageModel, nanoOnly → nano_unavailable', async () => {
    expect(await ai.getAnswers(questions, true)).toEqual({ error: 'nano_unavailable' });
  });

  describe('Nano session reuse', () => {
    test('one base session; each request prompts its own clone, then destroys it', async () => {
      stubNano('available');
      await ai.getAnswers(questions);
      await ai.getAnswers(questions);
      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0][0].initialPrompts[0].role).toBe('system');
      expect(baseSession.clone).toHaveBeenCalledTimes(2);
      expect(clones.map((c) => c.prompt.mock.calls.length)).toEqual([1, 1]);
      expect(clones.every((c) => c.destroy.mock.calls.length === 1)).toBe(true);
      expect(baseSession.destroy).not.toHaveBeenCalled();
    });

    test('a failed clone → no_answer, and the next request builds a new base', async () => {
      stubNano('available');
      baseSession.clone.mockRejectedValueOnce(new Error('session gone'));
      expect(await ai.getAnswers(questions)).toEqual({ error: 'no_answer' });
      expect(await ai.getAnswers(questions)).toEqual({ answers: [{ questionIndex: 0, optionIndex: 1 }] });
      expect(create).toHaveBeenCalledTimes(2);
      expect(fetchMock).not.toHaveBeenCalled(); // no silent proxy fallback
    });

    test('warmNano builds the base, so the next request only clones', async () => {
      stubNano('available');
      await ai.warmNano();
      expect(create).toHaveBeenCalledOnce();
      await ai.getAnswers(questions);
      expect(create).toHaveBeenCalledOnce();
      expect(baseSession.clone).toHaveBeenCalledOnce();
    });

    test('warmNano does nothing unless Nano is available', async () => {
      stubNano('downloadable');
      await ai.warmNano();
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('debug timing logs', () => {
    const logged = (log: { mock: { calls: unknown[][] } }) => log.mock.calls.map(([line]) => String(line).replace(/\d+ms$/, 'Nms'));

    test('debug on, Nano: availability, create, clone, prompt, total', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      stubNano('available');
      store.debug = true;
      await ai.getAnswers(questions);
      expect(logged(log)).toEqual([
        '[forms-autofill] availability Nms',
        '[forms-autofill] nano create Nms',
        '[forms-autofill] nano clone Nms',
        '[forms-autofill] nano prompt Nms',
        '[forms-autofill] total Nms',
      ]);
    });

    test('debug on, proxy: availability, proxy fetch, total', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      stubNano('unavailable');
      store.debug = true;
      await ai.getAnswers(questions);
      expect(logged(log)).toEqual([
        '[forms-autofill] availability Nms',
        '[forms-autofill] proxy fetch Nms',
        '[forms-autofill] total Nms',
      ]);
    });

    test('debug off: no logs', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      stubNano('available');
      await ai.getAnswers(questions);
      expect(log).not.toHaveBeenCalled();
    });
  });

  test('proxy request sends only questions + a stable install ID', async () => {
    await ai.getAnswers(questions);
    await ai.getAnswers(questions);
    const [[url, init], [, init2]] = fetchMock.mock.calls;
    expect(url).toBe('https://forms-autofill-proxy.formsautofill.workers.dev/suggest');
    expect(JSON.parse(init.body)).toEqual({
      questions: [
        { text: 'What is the capital of France?', options: ['Berlin', 'Paris', 'Madrid', 'Rome'] },
        { text: 'Which planet is known as the Red Planet?', options: ['Earth', 'Mars', 'Venus', 'Jupiter'] },
      ],
    });
    expect(init.headers['X-Install-Id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(init2.headers['X-Install-Id']).toBe(init.headers['X-Install-Id']);
  });

  test('429 → limit', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'limit_reached' }, { status: 429 }));
    expect(await ai.getAnswers(questions)).toEqual({ error: 'limit' });
  });

  test('network failure while online → unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await ai.getAnswers(questions)).toEqual({ error: 'unreachable' });
  });

  test('proxy 5xx → unreachable', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 502 }));
    expect(await ai.getAnswers(questions)).toEqual({ error: 'unreachable' });
  });

  test('network failure while offline → offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await ai.getAnswers(questions)).toEqual({ error: 'offline' });
  });

  test('no usable answers → no_answer', async () => {
    fetchMock.mockResolvedValue(Response.json({ answers: [{ questionIndex: 9, optionIndex: 0 }] }));
    expect(await ai.getAnswers(questions)).toEqual({ error: 'no_answer' });
  });

  test('Nano returns junk → no_answer, no proxy', async () => {
    stubNano('available');
    baseSession.clone.mockResolvedValueOnce({ prompt: vi.fn(async () => 'Paris'), destroy: vi.fn() });
    expect(await ai.getAnswers(questions)).toEqual({ error: 'no_answer' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
