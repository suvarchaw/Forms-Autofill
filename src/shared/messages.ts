// Messages between popup, content script and service worker. Add variants per milestone.
import type { Answer, QuizQuestion } from '../../shared/quiz';
export type { Answer, QuizQuestion };

// Popup → content script. No payload: the content script reads what it needs itself.
export type Message = { type: 'fillDetails' } | { type: 'suggest' };

// Content script → service worker. Only question text and options, never the profile.
export type GetAnswersMessage = { type: 'getAnswers'; questions: QuizQuestion[] };

// Content script → popup, via sendResponse.
export type FillResult = { filled: number; skipped: number };

export type AiError = 'limit' | 'unreachable' | 'no_answer';
// Service worker → content script.
export type AnswersResult = { answers: Answer[] } | { error: AiError };
// Content script → popup.
export type SuggestResult = { count: number } | { error: AiError };
