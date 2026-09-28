// Messages between popup, content script and service worker. Add variants per milestone.
import type { Answer, QuizQuestion } from '../../shared/quiz';
export type { Answer, QuizQuestion };

// Popup → content script. No payload: the content script reads what it needs itself.
export type Message = { type: 'fillDetails' } | { type: 'suggest' };

// Content script → service worker. Only question text and options, never the profile.
// nanoOnly: Auto mode's page-load suggestions, which must never reach the proxy.
export type GetAnswersMessage = { type: 'getAnswers'; questions: QuizQuestion[]; nanoOnly?: true };
// Content script → service worker. The cross-page "fill this form" flag lives in storage.session,
// which content scripts can't read, so they ask. shouldFill and noteOnce reply with a boolean.
// Popup → service worker: warmNano builds the Nano base session while the user reads the popup.
export type WorkerMessage =
  | GetAnswersMessage
  | { type: 'rememberFill'; formId: string }
  | { type: 'forgetFill'; formId: string }
  | { type: 'shouldFill'; formId: string }
  | { type: 'noteOnce'; error: AiError }
  | { type: 'warmNano' };

export type AiError = 'offline' | 'unreachable' | 'limit' | 'no_answer' | 'nano_unavailable' | 'nano_downloading';
// Content script → popup when the page is a form but the parser finds no questions (Google changed the layout).
export type LayoutError = { error: 'layout' };

// Content script → popup, via sendResponse.
export type FillResult = { filled: number; skipped: number } | LayoutError;
// Service worker → content script.
export type AnswersResult = { answers: Answer[] } | { error: AiError };
// Content script → popup.
export type SuggestResult = { count: number } | { error: AiError } | LayoutError;

// Shown in the popup status and in Auto's page note.
export const ERRORS: Record<AiError | 'layout', string> = {
  offline: "You're offline — connect and try again",
  unreachable: "Couldn't reach the AI service — try again later",
  limit: 'Daily AI limit reached — try again tomorrow',
  no_answer: "AI didn't return a usable answer — try again",
  nano_unavailable: 'Auto needs on-device AI — use Suggest answers instead',
  nano_downloading: 'On-device AI is still downloading — try again later',
  layout: 'Form layout not recognized — no questions found',
};
