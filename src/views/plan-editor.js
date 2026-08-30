// Plan editor — create, fork, or edit a user plan. Mounts into the view root;
// Save writes via store.savePlan and calls done(), Cancel discards and calls
// done(). Exercises are added only through the shared picker, whose list is the
// constraint-permitted library, so a plan can never contain an unsafe movement.
//
// Editing model: the working copy is a flat plan (each day = one ordered list of
// exercises, stored under a single unnamed block). Text/number inputs update the
// working copy in place WITHOUT re-rendering (so typing never loses the caret);
// only structural actions (add/remove/reorder) re-render.

import { html, mount } from '../ui.js';
import { openPicker } from './picker.js';
import { equipmentIcon } from '../icons/equipment.js';
import * as store from '../store.js';

let db = null, root = null, done = null;
let plan = null;            // working copy
let activeDayId = null;
let wiring = null;

const uid = (n = 8) => crypto.randomUUID().replace(/-/g, '').slice(0, n);
const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** @param {'new'|'fork'|'edit'} mode  @param {object|null} source split/plan */
export function openEditor(rootEl, database, { source = null, mode = 'new', onDone }) {
  db = database; root = rootEl; done = onDone;
  plan = build(source, mode);
  activeDayId = plan.days[0]?.id ?? null;
  renderEditor();
}

function build(source, mode) {
  if (source && mode === 'edit') return normalize(source, source.id);
  if (source) return { ...normalize(source, uid(12)), name: `${source.name ?? 'Plan'} (copy)` };
  const dayId = uid();
  return {
    id: uid(12), profileId: db.profile?.id, name: 'New plan',
    days: [{ id: dayId, name: 'Day 1', items: [] }]
  };
}

/** Coerce any split/plan into the flat editor shape (day.items, no blocks). */
function normalize(s, id) {
  return {
    id, profileId: db.profile?.id, name: s.name ?? 'Plan',
    days: (s.days ?? []).map(d => ({
      id: d.id || uid(), name: d.name ?? 'Day',
      items: (d.blocks ?? []).flatMap(b => b.items ?? []).map(it => ({
        exerciseId: it.exerciseId,
        sets: it.sets ?? 3, reps: it.reps ?? '8-10', restSeconds: it.restSeconds ?? 120,
        ...(it.tempo ? { tempo: it.tempo } : {})
      }))
    }))
  };
}

const curDay = () => plan.days.find(d => d.id === activeDayId) ?? plan.days[0];

function renderEditor() {
  const day = curDay();
  mount(root, html`
    <div class="stack plan-editor">
      <div class="card">
        <div class="section-label">Plan name</div>
        <input class="field" data-role="name" value="${plan.name}" maxlength="60" style="margin-top:8px">
        <div class="support-tag" style="margin-top:6px">${`constraints: ${db.profile?.name ?? '—'}`}</div>
      </div>

      <div class="card">
        <div class="spread">
          <div class="section-label">Days</div>
          <button class="btn sm" type="button" data-action="day-add">＋ Day</button>
        </div>
        <div class="row" style="margin-top:8px">
          ${plan.days.map(d => html`<button class="chip" type="button" data-day="${d.id}"
              aria-pressed="${String(d.id === day?.id)}">${d.name || 'Day'}</button>`)}
        </div>
      </div>

      ${day ? dayEditor(day) : html`<div class="empty">Add a day to begin.</div>`}

      <div class="dialog-actions" style="justify-content:flex-end">
        <button class="btn" type="button" data-action="cancel">Cancel</button>
        <button class="btn primary" type="button" data-action="save">Save plan</button>
      </div>
    </div>
  `);
  wire();
}

function dayEditor(day) {
  const i = plan.days.indexOf(day);
  return html`
    <div class="card">
      <div class="spread">
        <input class="field" data-role="day-name" value="${day.name}" maxlength="40" style="max-width:58%">
        <div class="row">
          <button class="btn sm" type="button" data-action="day-up" ${i <= 0 ? 'disabled' : ''}>↑</button>
          <button class="btn sm" type="button" data-action="day-down" ${i >= plan.days.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn sm danger" type="button" data-action="day-remove" ${plan.days.length <= 1 ? 'disabled' : ''}>Remove</button>
        </div>
      </div>

      ${day.items.length
        ? day.items.map((it, idx) => exItem(it, idx, day.items.length))
        : html`<div class="ex-sub" style="margin-top:10px">No exercises yet — add one below.</div>`}

      <button class="btn add-exercise" type="button" data-action="ex-add" style="margin-top:10px">＋ Add exercise</button>
    </div>
  `;
}

function exItem(it, i, n) {
  const ex = db.exerciseById[it.exerciseId];
  return html`<div class="pe-item" data-i="${i}">
    <div class="pe-head">
      <div class="ex-icons">${equipmentIcon(ex ?? {})}</div>
      <div class="pe-name">${ex?.name ?? it.exerciseId}</div>
      <div class="row">
        <button class="btn sm" type="button" data-action="ex-up" ${i <= 0 ? 'disabled' : ''}>↑</button>
        <button class="btn sm" type="button" data-action="ex-down" ${i >= n - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn sm danger" type="button" data-action="ex-remove" aria-label="Remove exercise">✕</button>
      </div>
    </div>
    <div class="pe-params">
      <label>sets <input class="field pe-num" type="number" inputmode="numeric" min="1" max="10" data-field="sets" value="${it.sets}"></label>
      <label>reps <input class="field pe-reps" type="text" data-field="reps" value="${it.reps}"></label>
      <label>rest <input class="field pe-num" type="number" inputmode="numeric" min="0" max="900" step="15" data-field="restSeconds" value="${it.restSeconds}"><span class="pe-unit">s</span></label>
    </div>
  </div>`;
}

// --- wiring ---------------------------------------------------------------

function wire() {
  wiring?.abort();
  wiring = new AbortController();
  const sig = { signal: wiring.signal };
  root.addEventListener('input', onInput, sig);   // model-only, no re-render
  root.addEventListener('click', onClick, sig);
}

function onInput(e) {
  const t = e.target;
  if (t.matches('[data-role="name"]')) { plan.name = t.value; return; }
  if (t.matches('[data-role="day-name"]')) { curDay().name = t.value; return; }
  const field = t.dataset.field;
  if (!field) return;
  const item = curDay().items[Number(t.closest('.pe-item')?.dataset.i)];
  if (!item) return;
  if (field === 'reps') item.reps = t.value.slice(0, 12);
  else if (field === 'sets') item.sets = clampInt(t.value, 1, 10, item.sets);
  else if (field === 'restSeconds') item.restSeconds = clampInt(t.value, 0, 900, item.restSeconds);
}

function onClick(e) {
  const dayTab = e.target.closest('[data-day]');
  if (dayTab) { activeDayId = dayTab.dataset.day; renderEditor(); return; }

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const day = curDay();
  const iOf = (el) => Number(el.closest('.pe-item')?.dataset.i);

  switch (action) {
    case 'cancel': return finish();
    case 'save': return save();
    case 'day-add': {
      const d = { id: uid(), name: `Day ${plan.days.length + 1}`, items: [] };
      plan.days.push(d); activeDayId = d.id; return renderEditor();
    }
    case 'day-remove': {
      if (plan.days.length <= 1) return;
      plan.days = plan.days.filter(d => d.id !== day.id);
      activeDayId = plan.days[0].id; return renderEditor();
    }
    case 'day-up': return moveDay(day, -1);
    case 'day-down': return moveDay(day, +1);
    case 'ex-add': return addExercise(day);
    case 'ex-remove': { day.items.splice(iOf(e.target), 1); return renderEditor(); }
    case 'ex-up': return moveItem(day, iOf(e.target), -1);
    case 'ex-down': return moveItem(day, iOf(e.target), +1);
  }
}

function moveDay(day, dir) {
  const i = plan.days.indexOf(day), j = i + dir;
  if (j < 0 || j >= plan.days.length) return;
  [plan.days[i], plan.days[j]] = [plan.days[j], plan.days[i]];
  renderEditor();
}

function moveItem(day, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= day.items.length) return;
  [day.items[i], day.items[j]] = [day.items[j], day.items[i]];
  renderEditor();
}

function addExercise(day) {
  openPicker({
    db, title: 'Add exercise',
    exclude: day.items.map(it => it.exerciseId),
    onPick: (id) => {
      day.items.push({ exerciseId: id, sets: 3, reps: '8-10', restSeconds: 120 });
      renderEditor();
    }
  });
}

function save() {
  const clean = {
    id: plan.id,
    profileId: plan.profileId,
    name: (plan.name || '').trim().slice(0, 60) || 'Untitled plan',
    daysPerWeek: plan.days.length,
    cycle: plan.days.map(d => d.id),
    days: plan.days.map(d => ({
      id: d.id, name: (d.name || 'Day').trim().slice(0, 40),
      blocks: [{ name: '', items: d.items.map(it => ({
        exerciseId: it.exerciseId, sets: it.sets, reps: it.reps, restSeconds: it.restSeconds,
        ...(it.tempo ? { tempo: it.tempo } : {})
      })) }]
    }))
  };
  store.savePlan(clean);
  store.updateSettings({ activeSplitId: clean.id });   // make the saved plan active
  finish();
}

function finish() {
  wiring?.abort(); wiring = null;
  const cb = done;
  db = root = done = plan = null; activeDayId = null;
  cb?.();
}
