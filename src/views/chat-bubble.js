// Global AI chat bubble — a floating button on every tab that opens a panel.
// One continuous conversation that follows the user across tabs; each question
// is sent with context built for whichever screen they're on right now
// (chat.js#contextFor). Replaces the old inline Log chat card.
//
// Fails closed: if chat isn't configured, nothing mounts. Mounted once at boot
// into #chat-root (a fixed sibling of the view, so tab re-renders don't touch
// it). The transcript is module-scope so opening/closing keeps the thread.

import { html, mount } from '../ui.js';
import { chatConfigured, contextFor, askChat } from '../chat.js';

let getView = null, getDb = null;
let root = null;
let open = false;
let turns = [];          // continuous [{ role:'user'|'assistant', content }]
let pending = false;
let ctrl = null;         // aborts an in-flight request if superseded

const VIEW_LABEL = { plan: 'plan', log: 'session', history: 'history', library: 'library' };
const label = (v) => VIEW_LABEL[v] ?? 'training';

/** @param {{getView:()=>string, getDb:()=>object}} opts */
export function initChatBubble(opts) {
  if (!chatConfigured()) return;
  getView = opts.getView; getDb = opts.getDb;
  root = document.getElementById('chat-root');
  if (root) render();
}

function render() {
  mount(root, html`
    <button class="chat-fab" type="button" data-action="toggle"
            aria-label="${open ? 'Close assistant' : 'Ask the training assistant'}">
      ${open ? '✕' : html`<span aria-hidden="true">💬</span>`}
    </button>
    ${open ? panel() : ''}
  `);
  wire();
  if (open) scrollBottom();
}

function panel() {
  const view = getView?.();
  return html`<div class="chat-panel" role="dialog" aria-label="Training assistant">
    <div class="chat-panel-head">
      <div>
        <div class="chat-title">Assistant</div>
        <div class="chat-context">${`asking about your ${label(view)}`}</div>
      </div>
      <button class="tool-btn" type="button" data-action="toggle" aria-label="Close">✕</button>
    </div>
    <div class="chat-scroll" data-role="scroll">
      ${turns.length
        ? turns.map(t => html`<div class="${t.role === 'user' ? 'chat-q' : 'chat-answer'}" dir="auto">${t.content}</div>`)
        : html`<div class="chat-empty">Ask about your ${label(view)} — a swap, your volume, form, anything training. Not medical advice.</div>`}
      ${pending ? html`<div class="chat-thinking">Thinking…</div>` : ''}
    </div>
    <form class="chat-form" data-role="form">
      <input class="field" data-role="input" type="text" autocomplete="off"
             placeholder="Ask…" ${pending ? 'disabled' : ''}>
      <button class="btn primary" type="submit" ${pending ? 'disabled' : ''}>Ask</button>
    </form>
  </div>`;
}

function wire() {
  root.querySelectorAll('[data-action="toggle"]').forEach(b =>
    b.addEventListener('click', () => { open = !open; render(); if (open) focusInput(); }));
  root.querySelector('[data-role="form"]')?.addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  const input = root.querySelector('[data-role="input"]');
  const q = input.value.trim();
  const db = getDb?.();
  if (!q || pending || !db) return;

  const context = contextFor(getView?.() ?? 'plan', db);
  // Send only the recent window — the worker keeps ~6 turns, so posting the
  // whole (ever-growing) transcript each time is wasted bandwidth. The full
  // thread stays on screen; only what's sent is bounded.
  const history = turns.slice(-8);
  turns.push({ role: 'user', content: q });
  pending = true;
  ctrl?.abort();
  ctrl = new AbortController();
  const sig = ctrl.signal;
  render(); focusInput();

  try {
    const answer = await askChat({ question: q, context, profileId: db.profile?.id, history, signal: sig });
    if (sig.aborted) return;
    pending = false;
    turns.push({ role: 'assistant', content: answer || 'No answer came back.' });
    render();
  } catch (err) {
    if (err?.name === 'AbortError' || sig.aborted) return;
    pending = false;
    turns.pop();                          // drop the unanswered question so a retry isn't doubled
    render();
    const scroll = root.querySelector('[data-role="scroll"]');
    if (scroll) mount(scroll, html`
      ${turns.map(t => html`<div class="${t.role === 'user' ? 'chat-q' : 'chat-answer'}" dir="auto">${t.content}</div>`)}
      <div class="chat-error">${err.message ?? String(err)}</div>`);
  }
}

function focusInput() { root.querySelector('[data-role="input"]')?.focus(); }
function scrollBottom() { const s = root.querySelector('[data-role="scroll"]'); if (s) s.scrollTop = s.scrollHeight; }
