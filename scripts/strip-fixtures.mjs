// Removes <script>, <style> and <noscript> from saved form fixtures, in place.
// Usage: node scripts/strip-fixtures.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dir = new URL('../test/fixtures/', import.meta.url);
for (const name of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  const file = new URL(name, dir);
  const dom = new JSDOM(readFileSync(file, 'utf8'));
  dom.window.document.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  writeFileSync(file, dom.serialize());
  console.log(`stripped ${name}`);
}
