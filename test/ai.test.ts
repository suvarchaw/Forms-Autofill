/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildPrompt, cleanAnswers } from '../shared/quiz';
import { getAnswers } from '../src/background/ai';
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

  const stubNano = (availability: string) => {
    create = vi.fn(async () => ({ prompt: vi.fn(async () => nanoReply), destroy: vi.fn() }));
    vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => availability), create });
  };

  beforeEach(() => {
    store = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
        },
      },
    });
    fetchMock = vi.fn(async () => Response.json({ answers: [{ questionIndex: 1, optionIndex: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  test('available → Nano, no network', async () => {
    stubNano('available');
    expect(await getAnswers(questions)).toEqual({ answers: [{ questionIndex: 0, optionIndex: 1 }] });
    expect(create).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(['downloadable', 'downloading', 'unavailable'])('%s → proxy', async (availability) => {
    stubNano(availability);
    expect(await getAnswers(questions)).toEqual({ answers: [{ questionIndex: 1, optionIndex: 1 }] });
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('forceProxy skips an available Nano', async () => {
    stubNano('available');
    store.forceProxy = true;
    await getAnswers(questions);
    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('no LanguageModel at all → proxy', async () => {
    await getAnswers(questions);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('proxy request sends only questions + a stable install ID', async () => {
    await getAnswers(questions);
    await getAnswers(questions);
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
    expect(await getAnswers(questions)).toEqual({ error: 'limit' });
  });

  test('network failure → unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await getAnswers(questions)).toEqual({ error: 'unreachable' });
  });

  test('no usable answers → no_answer', async () => {
    fetchMock.mockResolvedValue(Response.json({ answers: [{ questionIndex: 9, optionIndex: 0 }] }));
    expect(await getAnswers(questions)).toEqual({ error: 'no_answer' });
  });
});
