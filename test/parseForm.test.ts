/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest';
import { layoutNotRecognized, parseForm } from '../src/content/parseForm';
import details from './fixtures/details.html?raw';
import detailsExpected from './fixtures/details.expected.json?raw';
import quiz from './fixtures/quiz.html?raw';
import quizExpected from './fixtures/quiz.expected.json?raw';
import page2 from './fixtures/multipage-p2.html?raw';
import page2Expected from './fixtures/multipage-p2.expected.json?raw';
import detailsEmail from './fixtures/details-email.html?raw';
import detailsEmailExpected from './fixtures/details-email.expected.json?raw';

const parseHtml = (html: string) => parseForm(new DOMParser().parseFromString(html, 'text/html'));

describe('parseForm fixtures', () => {
  test.each([
    ['details', details, detailsExpected],
    ['quiz', quiz, quizExpected],
    ['multipage-p2', page2, page2Expected],
    ['details-email', detailsEmail, detailsEmailExpected],
  ])('%s', (_, html, expected) => {
    expect(parseHtml(html)).toEqual(JSON.parse(expected));
  });
});

// Hand-built radiogroup, shaped like the live form: radios carry aria-label.
const radioQuestion = (labels: string[]) => `
  <div role="listitem">
    <div role="heading" aria-level="3">Q</div>
    <div role="radiogroup">${labels.map((l) => `<div role="radio" aria-label="${l}"></div>`).join('')}</div>
  </div>`;
const typeOf = (labels: string[]) => parseHtml(radioQuestion(labels))[0].type;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

describe('linear scale vs multiple choice', () => {
  test('1–5 is a scale', () => expect(typeOf(range(1, 5))).toBe('unsupported'));
  test('0–10 is a scale', () => expect(typeOf(range(0, 10))).toBe('unsupported'));
  test('3,4,5,6 is multiple choice', () => expect(typeOf(range(3, 6))).toBe('multiple_choice'));
  // Documented tradeoff: an MC question with answers "1".."4" looks exactly like a scale.
  test('"1","2","3","4" is treated as a scale', () => expect(typeOf(['1', '2', '3', '4'])).toBe('unsupported'));
});

describe('layoutNotRecognized', () => {
  const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');
  test('a form with no listitems (Google changed the markup) → true', () => {
    const d = doc(quiz);
    for (const el of d.querySelectorAll('[role="listitem"]')) el.removeAttribute('role');
    expect(layoutNotRecognized(d)).toBe(true);
  });
  test('the quiz fixture → false', () => expect(layoutNotRecognized(doc(quiz))).toBe(false));
  // The post-submit "Your response has been recorded" page is also /formResponse.
  test('no <form> on the page → false', () =>
    expect(layoutNotRecognized(doc('<div>Your response has been recorded.</div>'))).toBe(false));
});
