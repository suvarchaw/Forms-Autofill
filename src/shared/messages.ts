// Messages between popup, content script and service worker. Add variants per milestone.
import type { Answer, QuizQuestion } from '../../shared/quiz';
export type { Answer, QuizQuestion };

// Popup → content script. No payload: the content script reads what it needs itself.
export type Message = { type: 'fillDetails' } | { type: 'suggest' };

// Content script → service worker. Only question text and options, never the profile.
// nanoOnly: Auto mode's page-load suggestions, which must never reach the proxy.
export type GetAnswersMessage = { type: 'getAnswers'; questions: QuizQuestion[]; nanoOnly?: true };
// Content script → service worker. The cross-page "fill this form" flag lives in storage.session,
// which content scripts can't read, so they ask. shouldFill replies with a boolean.
export type WorkerMessage =
  | GetAnswersMessage
  | { type: 'rememberFill'; formId: string }
  | { type: 'forgetFill'; formId: string }
  | { type: 'shouldFill'; formId: string };

// Content script → popup, via sendResponse.
export type FillResult = { filled: number; skipped: number };

export type AiError = 'limit' | 'unreachable' | 'no_answer' | 'nano_unavailable';
// Service worker → content script.
export type AnswersResult = { answers: Answer[] } | { error: AiError };
// Content script → popup.
export type SuggestResult = { count: number } | { error: AiError };
