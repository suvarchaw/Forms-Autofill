import { expect, test } from 'vitest';

test('jsdom provides a document', () => {
  expect(document.body).toBeTruthy();
});
