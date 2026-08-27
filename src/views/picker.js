// Shared exercise picker. Used for both "swap this exercise" and "add an
// exercise", because they're the same question with a different starting filter.
//
// Safety note: the candidate list is always drawn from db.exercises, which only
// contains movements permitted under data/constraints.json. That's what makes
// mid-session improvisation safe — there is nothing contraindicated to pick.

import { html, mount } from '../ui.js';
import { equipmentIcon } from '../icons/equipment.js';

let onPickCb = null;
let state = { group: 'all', query: '', exclude: [], db: null };

function dialog() {
  return document.getElementById('picker-dialog');
}

/**
 * @param {object} opts
 * @param {object} opts.db
 * @param {string} opts.title
 * @param {string} [opts.group]      pre-selected muscle group, or 'all'
 * @param {string[]} [opts.exclude]  exercise ids to hide (already in the session)
 * @param {function} opts.onPick     called with the chosen exercise id
 */
export function openPicker({ db, title, group = 'all', exclude = [], onPick }) {
  state = { db, group, query: '', exclude };
  onPickCb = onPick;
  const d = dialog();
  d.querySelector('[data-role="title"]').textContent = title;
  renderBody();
  if (!d.open) d.showModal();
}

function groupsOf(db) {
  // Only groups that actually have a permitted exercise behind them.
  const set = new Set();
  for (const ex of db.exercises) {
    for (const id of ex.primaryMuscles ?? []) {
      const g = db.muscleById[id]?.group;
      if (g) set.add(g);
    }
  }
  return [...set].sort();
}

function matches(db, ex) {
  if (state.exclude.includes(ex.id)) return false;

  if (state.group !== 'all') {
    const inGroup = (ex.primaryMuscles ?? [])
      .some(id => db.muscleById[id]?.group === state.group);
    if (!inGroup) return false;
  }

  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return ex.name.toLowerCase().includes(q)
    || (ex.aliases ?? []).some(a => a.toLowerCase().includes(q));
}

function renderBody(caret = null) {
  const db = state.db;
  const list = db.exercises.filter(ex => matches(db, ex));
  const body = dialog().querySelector('[data-role="body"]');

  mount(body, html`
    <div class="picker-filters" data-role="groups">
      <button class="chip" type="button" data-group="all"
              aria-pressed="${String(state.group === 'all')}">All</button>
      ${groupsOf(db).map(g => html`<button class="chip" type="button" data-group="${g}"
              aria-pressed="${String(state.group === g)}">${g}</button>`)}
    </div>

    <input class="field" data-role="search" type="search" autocomplete="off"
           placeholder="Search exercises…" value="${state.query}" style="margin:10px 0">

    ${list.length
      ? html`<div class="picker-list">
          ${list.map(ex => html`<button class="picker-item" type="button" data-pick="${ex.id}">
            ${equipmentIcon(ex, { interactive: false })}
            <span class="pi-text">
              <span class="pi-name">${ex.name}</span>
              <span class="pi-meta">
                ${(ex.primaryMuscles ?? []).map(id => db.muscleById[id]?.name ?? id).join(', ')}
                ${ex.support ? ` · ${ex.support.replace(/-/g, ' ')}` : ''}
              </span>
            </span>
          </button>`)}
        </div>`
      : html`<div class="empty" style="padding:24px">
          Nothing matches.
          <div class="hint">Every option here is permitted under your constraints — if a movement is missing, it was excluded on purpose.</div>
        </div>`}
  `);

  const search = body.querySelector('[data-role="search"]');
  if (caret != null) { search.focus(); search.setSelectionRange(caret, caret); }
}

// Wired once; the dialog markup lives in index.html.
export function initPicker() {
  const d = dialog();

  d.addEventListener('click', (e) => {
    if (e.target === d) { d.close(); return; }          // backdrop

    const g = e.target.closest('[data-group]');
    if (g) { state.group = g.dataset.group; renderBody(); return; }

    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const id = pick.dataset.pick;
      d.close();
      onPickCb?.(id);
      return;
    }

    if (e.target.closest('[data-action="picker-close"]')) d.close();
  });

  d.addEventListener('input', (e) => {
    const s = e.target.closest('[data-role="search"]');
    if (!s) return;
    const caret = s.selectionStart;   // from the CURRENT input, before mount replaces it
    state.query = s.value;
    renderBody(caret);
  });
}
