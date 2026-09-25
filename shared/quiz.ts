// Shared by worker/ (Groq) and the extension (Nano), so both backends use the same
// prompt, schema and validator. No Cloudflare, DOM or chrome imports allowed here.

export type QuizQuestion = { text: string; options: string[] };
export type Answer = { questionIndex: number; optionIndex: number };

export const SYSTEM_PROMPT =
  'You answer multiple-choice quiz questions. For each question, pick the single best option. ' +
  'Reply with JSON: {"answers": [{"questionIndex": <question number>, "optionIndex": <option number>}]}, ' +
  'one entry per question, using the numbers shown.';

export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { questionIndex: { type: 'integer' }, optionIndex: { type: 'integer' } },
        required: ['questionIndex', 'optionIndex'],
        additionalProperties: false,
      },
    },
  },
  required: ['answers'],
  additionalProperties: false,
};

export function buildPrompt(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => [`Q${i}: ${q.text}`, ...q.options.map((o, j) => `  ${j}) ${o}`)].join('\n'))
    .join('\n\n');
}

// Keeps only well-formed, in-range answers, first one per question. Anything unparseable gives [].
// Accepts a model's raw text (trimmed first: Nano can end with "\n") or an already-parsed object (the proxy's JSON).
export function cleanAnswers(raw: unknown, questions: QuizQuestion[]): Answer[] {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      return [];
    }
  }
  const list = (parsed as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(list)) return [];
  const seen = new Set<number>();
  const out: Answer[] = [];
  for (const a of list) {
    const q = a?.questionIndex, o = a?.optionIndex;
    if (!Number.isInteger(q) || !Number.isInteger(o)) continue;
    if (q < 0 || q >= questions.length || o < 0 || o >= questions[q].options.length || seen.has(q)) continue;
    seen.add(q);
    out.push({ questionIndex: q, optionIndex: o });
  }
  return out;
}
