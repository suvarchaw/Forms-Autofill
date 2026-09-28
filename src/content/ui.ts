/// <reference types="vite/client" />
import tokens from '../shared/tokens.css?raw';

// Everything we draw on Google's page lives in a shadow root: Google's CSS can't restyle it and ours
// can't leak out. This is the only content file allowed to use class names (our own, never Google's).

const icon = (paths: string, size = 14, stroke = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const SPARK = icon('<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z"/>');
const CHECK = icon('<path d="M5 12l5 5 9-10"/>', 13, 3);
const CROSS = icon('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', 13, 2.4);
const MINUS = icon('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>', 12, 2.2);
const SPINNER = `<svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="var(--input-border)"/><path d="M12 4a8 8 0 0 1 8 8" stroke="var(--ai)"/></svg>`;

const CSS = `
*{box-sizing:border-box}
svg{flex:none}
.chip,.badge,.note{display:inline-flex;align-items:center;font:500 13px/1.3 var(--font);border-radius:var(--radius-pill)}
.chip{gap:8px;height:32px;padding:0 3px 0 10px;border:1px solid var(--ai-border);background:var(--ai-tint);color:var(--ai-text)}
.chip>svg{color:var(--ai)}
.divider{width:1px;height:16px;background:var(--ai-border)}
button{width:26px;height:26px;margin:0;padding:0;border:0;border-radius:var(--radius-pill);display:flex;align-items:center;justify-content:center;background:transparent;color:var(--ai-text);cursor:pointer}
button:hover{background:var(--ai-border)}
.accept{background:var(--ai);color:#fff}
.accept:hover{background:var(--ai-text)}
button:focus-visible{outline:2px solid var(--ai);outline-offset:2px}
.badge{gap:5px;height:22px;padding:0 8px;background:var(--track);color:var(--secondary);font-size:12px}
.note{gap:8px;padding:8px 12px;border:1px solid var(--border);background:var(--surface);color:var(--secondary);box-shadow:0 2px 8px rgba(31,31,30,.16)}
.note.error{border-color:var(--error-border);background:var(--error-bg);color:var(--error-text)}
.spin{animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spin{animation:none}}
`;

// Host styles go inline: page CSS beats :host rules, but not inline styles.
function mount(tag: 'div' | 'span', attr: string, hostStyle: string, html: string) {
  const host = document.createElement(tag);
  host.setAttribute(attr, '');
  host.style.cssText = `all:initial;${hostStyle}`;
  const root = host.attachShadow({ mode: 'open' });
  // Static markup only: text from the form (option labels) is set with textContent below.
  root.innerHTML = `<style>${tokens}${CSS}</style>${html}`;
  return { host, root };
}

// "AI pick: X" with ✓ and ✕. Selects nothing itself: the caller decides what ✓ does.
export function chip(label: string, onAccept: () => void, onDismiss: () => void): HTMLElement {
  const { host, root } = mount(
    'div',
    'data-fa-chip',
    'display:block;margin:8px 0',
    `<span class="chip">${SPARK}<span class="label"></span><span class="divider"></span><button type="button" class="accept">${CHECK}</button><button type="button" class="dismiss">${CROSS}</button></span>`,
  );
  root.querySelector('.label')!.textContent = `AI pick: ${label}`;
  const [accept, dismiss] = root.querySelectorAll('button');
  accept.setAttribute('aria-label', `Accept AI pick: ${label}`);
  dismiss.setAttribute('aria-label', `Dismiss AI pick: ${label}`);
  for (const [b, onClick] of [[accept, onAccept], [dismiss, onDismiss]] as const) {
    b.addEventListener('click', (e) => {
      e.stopPropagation(); // the event still bubbles out of the shadow root to Google's handlers
      onClick();
    });
  }
  return host;
}

export const badge = () =>
  mount('span', 'data-fa-badge', 'display:inline-block;margin:4px 0', `<span class="badge">${MINUS}Not filled</span>`).host;

// A small note in the page corner for Auto mode: "AI is thinking…" and errors. Not clickable,
// so it never gets in the way of the form. Replaces any earlier note.
// Without ms it's progress (spinner) and the caller removes it; with ms it's an error that times out.
export function showNote(text: string, ms?: number): HTMLElement {
  document.querySelector('[data-fa-note]')?.remove();
  const { host, root } = mount(
    'div',
    'data-fa-note',
    'position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none',
    `<div class="note${ms ? ' error' : ''}">${ms ? '' : SPINNER}<span class="text"></span></div>`,
  );
  host.setAttribute('role', 'status');
  root.querySelector('.text')!.textContent = text;
  document.body.append(host);
  if (ms) setTimeout(() => host.remove(), ms);
  return host;
}
