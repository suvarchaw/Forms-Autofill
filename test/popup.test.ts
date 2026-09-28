/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Profile } from '../src/shared/types';
import html from '../src/popup/index.html?raw';

// Loads the real popup markup, stubs chrome, then runs main.ts fresh (it wires everything at import).
const open = async (opts: { profile?: Profile; tabReply?: (msg: { type: string }) => Promise<unknown> } = {}) => {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const local: Record<string, unknown> = { profile: opts.profile ?? { name: 'Test Student' }, triggerMode: 'click' };
  const runtimeSent: unknown[] = [];
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: local[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(local, items)),
      },
    },
    tabs: {
      query: vi.fn(async () => [{ id: 1 }]),
      sendMessage: vi.fn(opts.tabReply ?? (async () => ({ count: 0 }))),
    },
    runtime: { sendMessage: vi.fn(async (msg: unknown) => void runtimeSent.push(msg)) },
  });
  vi.resetModules();
  await import('../src/popup/main');
  await new Promise((r) => setTimeout(r, 0)); // let the storage reads settle
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  return {
    status: $('#status'),
    fill: $<HTMLButtonElement>('#fill'),
    hint: $('#fill-hint'),
    suggest: $<HTMLButtonElement>('#suggest'),
    runtimeSent,
  };
};
const settle = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.unstubAllGlobals());

describe('Suggest answers', () => {
  test('shows Thinking… and disables the button until the page replies', async () => {
    let reply!: (r: unknown) => void;
    const p = await open({ tabReply: () => new Promise((r) => (reply = r)) });
    p.suggest.click();
    expect(p.status.textContent).toBe('Thinking…');
    expect(p.suggest.disabled).toBe(true);
    await settle(); // still waiting on the page: nothing changes
    expect(p.status.textContent).toBe('Thinking…');
    expect(p.suggest.disabled).toBe(true);
    reply({ count: 2 });
    await settle();
    expect(p.status.textContent).toBe('Suggested 2 answers — confirm each with ✓');
    expect(p.suggest.disabled).toBe(false);
  });

  test('re-enabled even when the tab is not a form', async () => {
    const p = await open({ tabReply: async () => Promise.reject(new Error('no receiver')) });
    p.suggest.click();
    await settle();
    expect(p.status.textContent).toBe('Open a Google Form first');
    expect(p.suggest.disabled).toBe(false);
  });

  test.each([
    ['offline', "You're offline — connect and try again"],
    ['unreachable', "Couldn't reach the AI service — try again later"],
    ['limit', 'Daily AI limit reached — try again tomorrow'],
    ['no_answer', "AI didn't return a usable answer — try again"],
    ['nano_unavailable', 'Auto needs on-device AI — use Suggest answers instead'],
    ['nano_downloading', 'On-device AI is still downloading — try again later'],
    ['layout', 'Form layout not recognized — no questions found'],
  ])('error %s → "%s"', async (error, text) => {
    const p = await open({ tabReply: async () => ({ error }) });
    p.suggest.click();
    await settle();
    expect(p.status.textContent).toBe(text);
  });

  test('no multiple-choice questions is its own message, not "layout"', async () => {
    const p = await open({ tabReply: async () => ({ count: 0 }) });
    p.suggest.click();
    await settle();
    expect(p.status.textContent).toBe('No multiple-choice or dropdown questions found');
  });

  test('opening the popup warms Nano', async () => {
    const p = await open();
    expect(p.runtimeSent).toEqual([{ type: 'warmNano' }]);
  });
});

describe('Fill my details', () => {
  test('layout not recognized → message', async () => {
    const p = await open({ tabReply: async () => ({ error: 'layout' }) });
    p.fill.click();
    await settle();
    expect(p.status.textContent).toBe('Form layout not recognized — no questions found');
  });

  test('empty profile: Fill disabled with "Add your details first"', async () => {
    const p = await open({ profile: {} });
    expect(p.fill.disabled).toBe(true);
    expect(p.hint.hidden).toBe(false);
    expect(p.hint.textContent).toBe('Add your details first');
    expect(p.fill.getAttribute('aria-describedby')).toBe('fill-hint');
  });

  test('typing a detail enables Fill and hides the hint; clearing it disables again', async () => {
    const p = await open({ profile: {} });
    const name = document.querySelector<HTMLInputElement>('input[name="name"]')!;
    name.value = 'Test Student';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    expect(p.fill.disabled).toBe(false);
    expect(p.hint.hidden).toBe(true);
    name.value = '';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    expect(p.fill.disabled).toBe(true);
  });

  test('a custom field with a value counts; a label alone does not', async () => {
    expect((await open({ profile: { custom: [{ label: 'Club', value: '' }] } })).fill.disabled).toBe(true);
    expect((await open({ profile: { custom: [{ label: 'Club', value: 'Chess' }] } })).fill.disabled).toBe(false);
  });
});
