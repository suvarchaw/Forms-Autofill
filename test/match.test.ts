import { expect, test } from 'vitest';
import { matchField } from '../src/content/match';

test.each([
  ['exact synonym', 'Email', 'email'],
  ['phrase containing a synonym', 'Enter your phone number', 'phone'],
  ['longest synonym wins', 'Name of college', 'college'],
  ['two fields tie → skipped', 'Name and department', null],
  ['no match', 'Why do you want to join?', null],
  ['exclusion word → skipped', "Father's name", null],
  ['exclusion plural → skipped', 'Parents contact number', null],
  ['"college email" beats "college"', 'College email', 'email'],
  ['whole words only', 'Username', null],
  ['same field, different phrasing', 'Email address', 'email'],
  ['punctuation and required star', 'Roll No. *', 'rollNo'],
])('%s: %s', (_, question, expected) => {
  expect(matchField(question)).toBe(expected);
});

test('custom field label is its synonym', () => {
  expect(matchField('LinkedIn profile', ['LinkedIn'])).toBe('LinkedIn');
});

test('custom label that ties with a built-in field → skipped', () => {
  expect(matchField('Email', ['Email'])).toBe(null);
});
