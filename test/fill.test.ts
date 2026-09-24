/// <reference types="vite/client" />
import { expect, test } from 'vitest';
import { fillForm } from '../src/content/fill';
import html from './fixtures/details-email.html?raw';

// Dummy data only.
const profile = {
  name: 'Test Student',
  email: 'test@example.com',
  phone: '1234567890',
  college: 'Test College',
  rollNo: 'RA0001',
};

const load = () => new DOMParser().parseFromString(html, 'text/html');
const item = (doc: Document, heading: string) =>
  [...doc.querySelectorAll('[role="listitem"]')].find(
    (li) => li.querySelector('[role="heading"]')?.textContent?.replace(/\s*\*$/, '') === heading,
  )!;
const input = (doc: Document, heading: string) =>
  item(doc, heading).querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea')!;

test('fills matched text fields, fires input + change, leaves pre-filled fields alone', () => {
  const doc = load();
  input(doc, 'Phone number').value = '999';
  const events: string[] = [];
  for (const type of ['input', 'change']) input(doc, 'Full name').addEventListener(type, () => events.push(type));

  const result = fillForm(doc, profile);

  expect(input(doc, 'Email').type).toBe('email'); // the email-collection field
  expect(input(doc, 'Email').value).toBe('test@example.com');
  expect(input(doc, 'Email address').value).toBe('test@example.com');
  expect(input(doc, 'College email').value).toBe('test@example.com');
  expect(input(doc, 'Full name').value).toBe('Test Student');
  expect(input(doc, 'Name of college').value).toBe('Test College');
  expect(events).toEqual(['input', 'change']);
  expect(input(doc, 'Phone number').value).toBe('999');
  expect(input(doc, "Father's name").value).toBe('');

  for (const h of ["Father's name", 'Username', 'Why do you want to join?']) {
    const badge = item(doc, h).querySelector('[data-fa-badge]');
    expect(badge?.previousElementSibling?.getAttribute('role')).toBe('heading');
  }
  expect(item(doc, 'Phone number').querySelector('[data-fa-badge]')).toBeNull();
  expect(result).toEqual({ filled: 7, skipped: 4 });
});

test('running twice adds no duplicate badges', () => {
  const doc = load();
  fillForm(doc, profile);
  fillForm(doc, profile);
  expect(doc.querySelectorAll('[data-fa-badge]')).toHaveLength(3);
});
