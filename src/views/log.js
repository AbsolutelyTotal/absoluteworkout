// Log — the mid-workout view. Optimised for one-handed use on a phone between
// sets: big tap targets, numeric keypads, last session's numbers visible so you
// know what to beat. Every keystroke persists; there is no save button.

import { html, mount, fmt, CHECK_SVG } from '../ui.js';
import { dayOf, prescriptionsOf } from '../data.js';
import { equipmentIcon } from '../icons/equipment.js';
import { openPicker } from './picker.js';
import * as store from '../store.js';

export function render(root, db, { onFinish }) {
  const session = store.activeSession();
  const settings = store.getSettings();
  // Structural changes (+set, swap) re-render; typing and ticking are patched
  // in place so an input never loses focus mid-set.
  const rerender = () => {
    const y = window.scrollY;
    render(root, db, { onFinish });
    window.scrollTo({ top: y });
  };

  if (!session) {
    mount(root, html`<div class="empty">
      No session in progress.
      <div class="hint">Start one from the Plan tab.</div>
    </div>`);
    return;
  }

  const split = db.splitById[session.splitId];
  const day = split ? dayOf(split, session.dayId) : null;

  // The split or day this session was started from no longer exists. Offer a way
  // out rather than rendering a session that can't be completed coherently.
  if (!day) {
    mount(root, html`<div class="stack">
      <div class="banner warn">
        <span class="icon">!</span>
        <div>
          <strong>This session references a plan that's changed.</strong>
          It was started from <code>${session.splitId}</code> / <code>${session.dayId}</code>,
          which is no longer in <code>data/splits.json</code>.
          Finish it to keep the sets you logged, or discard it.
        </div>
      </div>
      <div class="card row">
        <button class="btn primary" data-action="finish">Finish and keep sets</button>
        <button class="btn danger" data-action="discard">Discard</button>
      </div>
    </div>`);
    root.querySelector('[data-action="finish"]').addEventListener('click', () => {
      store.finishSession(session.id);
      onFinish();
    });
    root.querySelector('[data-action="discard"]').addEventListener('click', () => {
      if (confirm('Discard this session? Logged sets will be lost.')) {
        store.discardSession(session.id);
        onFinish();
      }
    });
    return;
  }

  const prescriptions = prescriptionsOf(day);
  const byId = Object.fromEntries(prescriptions.map(p => [p.exerciseId, p]));

  const totalSets = session.entries.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = session.entries.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);

  mount(root, html`
    <div class="stack">
      <div class="card">
        <div class="spread">
          <div>
            <h2>${day?.name ?? session.dayId}</h2>
            <div class="ex-sub">${`${split?.name ?? session.splitId} · started ${startedAt(session)}`}</div>
          </div>
          <span class="badge" data-role="counter">${`${doneSets}/${totalSets} sets`}</span>
        </div>
      </div>

      ${session.entries.map(entry => entryCard(db, session, entry, byId[entry.substitutedFor ?? entry.exerciseId], settings))}

      <button class="btn add-exercise" type="button" data-action="add-exercise">
        + Add an exercise
      </button>

      <div class="card">
        <div class="section-label">Finish</div>
        <div class="row" style="margin-top:10px">
          <input class="bw field" type="number" inputmode="decimal" step="0.1"
                 placeholder="${`Bodyweight (${settings.unit})`}"
                 value="${session.bodyweight ?? ''}" style="flex:1 1 140px">
        </div>
        <div class="row" style="margin-top:8px">
          <input class="notes field" type="text" placeholder="Session notes (optional)"
                 value="${session.notes ?? ''}" style="flex:1 1 100%">
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" data-action="finish" ${doneSets === 0 ? 'disabled' : ''}>
            Finish session
          </button>
          <button class="btn danger" data-action="discard">Discard</button>
        </div>
        ${doneSets === 0
          ? html`<div class="ex-sub" style="margin-top:8px">Tick at least one set to finish.</div>`
          : html`<div class="ex-sub" style="margin-top:8px">Unticked sets are dropped on finish.</div>`}
      </div>
    </div>
  `);

  wire(root, db, session, onFinish, rerender);
}

/** Repaints only the bits that depend on how many sets are done. */
function syncChrome(root, session) {
  const total = session.entries.reduce((a, e) => a + e.sets.length, 0);
  const done = session.entries.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);

  const counter = root.querySelector('[data-role="counter"]');
  if (counter) counter.textContent = `${done}/${total} sets`;

  const finish = root.querySelector('[data-action="finish"]');
  if (finish) finish.disabled = done === 0;
}

function startedAt(session) {
  return new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function entryCard(db, session, entry, prescription, settings) {
  const ex = db.exerciseById[entry.exerciseId];
  const name = ex?.name ?? entry.exerciseId;
  const last = store.lastPerformance(entry.exerciseId);

  // The exercise was removed from the library after this session started —
  // usually because it was edited out of exercises.json. Never present it as
  // loggable: under a constraint-driven plan, a deleted movement may have been
  // deleted precisely because it isn't safe to perform.
  if (!ex) {
    return html`<div class="ex" data-exercise="${entry.exerciseId}">
      <div class="ex-head">
        <div style="flex:1 1 auto;min-width:0">
          <div class="ex-name">${entry.exerciseId}</div>
          <div class="ex-sub">No longer in the exercise library.</div>
        </div>
      </div>
      <div class="banner warn" style="margin:0 14px 14px">
        <span class="icon">!</span>
        <div>
          Removed from <code>data/exercises.json</code> since this session started.
          Existing sets are kept for history, but you can't log more here.
        </div>
      </div>
    </div>`;
  }

  return html`<div class="ex" data-exercise="${entry.exerciseId}">
    <div class="ex-head">
      <div class="ex-icons">
        ${equipmentIcon(ex)}
      </div>
      <div style="flex:1 1 auto;min-width:0">
        <div class="ex-name">${name}</div>
        <div class="ex-sub">
          ${prescription ? `${prescription.sets} x ${prescription.reps}` : 'added'}
          ${prescription?.tempo ? ` · ${prescription.tempo}` : ''}
          ${ex?.unilateral ? ' · per side' : ''}
        </div>
        ${entry.substitutedFor
          ? html`<div class="ex-sub">${`swapped in for ${db.exerciseById[entry.substitutedFor]?.name ?? entry.substitutedFor}`}</div>`
          : ''}
        ${last ? html`<div class="ex-sub">${lastLine(last, settings.unit)}</div>` : ''}
        ${entry.addedDuringSession ? html`<div class="ex-sub">added this session</div>` : ''}
        ${ex?.demoUrl
          ? html`<a class="demo-link" href="${ex.demoUrl}" target="_blank" rel="noopener">▶ form demo</a>`
          : ''}
        ${ex?.formLimit ? html`<div class="limit" style="margin:6px 0 0">${`⚠ ${ex.formLimit}`}</div>` : ''}
      </div>
      <span class="ex-tools">
        <button class="tool-btn" type="button" data-action="swap" title="Swap this exercise"
                aria-label="${`Swap ${name}`}">⇄</button>
        ${entry.addedDuringSession ? html`
          <button class="tool-btn danger" type="button" data-action="remove"
                  title="Remove this exercise" aria-label="${`Remove ${name}`}">×</button>` : ''}
      </span>
    </div>

    <div class="sets-grid">
      <div></div>
      <div class="col-label">${settings.unit}</div>
      <div class="col-label">reps</div>
      <div></div>
      ${entry.sets.map((set, i) => html`
        <div class="idx">${i + 1}</div>
        <input type="number" inputmode="decimal" step="0.5" data-field="weight" data-set="${i}"
               class="${set.done ? 'logged' : ''}"
               value="${set.weight ?? ''}" placeholder="${placeholderFor(last, i, 'weight')}"
               aria-label="${`Set ${i + 1} weight`}">
        <input type="number" inputmode="numeric" step="1" data-field="reps" data-set="${i}"
               class="${set.done ? 'logged' : ''}"
               value="${set.reps ?? ''}" placeholder="${placeholderFor(last, i, 'reps')}"
               aria-label="${`Set ${i + 1} reps`}">
        <button class="set-done" type="button" data-action="done" data-set="${i}"
                aria-pressed="${String(set.done)}" aria-label="${`Mark set ${i + 1} done`}">
          ${CHECK_SVG}
        </button>
      `)}
    </div>

    <div style="padding:0 14px 12px">
      <button class="btn sm" data-action="add-set">+ set</button>
    </div>
  </div>`;
}

/** Last session's numbers become the placeholder, so repeating a load is one tap. */
function placeholderFor(last, i, field) {
  const set = last?.sets?.[i];
  return set?.[field] != null ? String(set[field]) : '';
}

function lastLine(last, unit) {
  const summary = last.sets
    .map(s => (s.weight != null && s.reps != null ? `${s.weight}${unit}x${s.reps}` : '—'))
    .join('  ');
  return `last ${fmt.date(last.date)}: ${summary}`;
}

function wire(root, db, session, onFinish, rerender) {
  // Persist on input rather than on blur — a phone that sleeps mid-set must not
  // lose the number that was just typed.
  root.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-field]');
    if (input) {
      const exerciseId = input.closest('[data-exercise]').dataset.exercise;
      const raw = input.value.trim();
      const value = raw === '' ? null : Number(raw);
      if (raw !== '' && !Number.isFinite(value)) return;
      store.updateSet(session.id, exerciseId, Number(input.dataset.set), { [input.dataset.field]: value });
      return;
    }
    const bw = e.target.closest('input.bw');
    if (bw) { session.bodyweight = bw.value === '' ? undefined : Number(bw.value); return; }
    const notes = e.target.closest('input.notes');
    if (notes) session.notes = notes.value;
  });

  root.addEventListener('click', (e) => {
    const doneBtn = e.target.closest('[data-action="done"]');
    if (doneBtn) {
      const card = doneBtn.closest('[data-exercise]');
      const exerciseId = card.dataset.exercise;
      const i = Number(doneBtn.dataset.set);
      const entry = session.entries.find(x => x.exerciseId === exerciseId);
      const next = !entry.sets[i].done;

      // Ticking a set with an empty weight is normal for bodyweight work, but an
      // empty rep count means nothing was recorded — fill it from the placeholder.
      const patch = { done: next };
      if (next && entry.sets[i].reps == null) {
        const ph = card.querySelector(`input[data-field="reps"][data-set="${i}"]`)?.placeholder;
        if (ph) patch.reps = Number(ph);
      }
      if (next && entry.sets[i].weight == null) {
        const ph = card.querySelector(`input[data-field="weight"][data-set="${i}"]`)?.placeholder;
        if (ph) patch.weight = Number(ph);
      }
      store.updateSet(session.id, exerciseId, i, patch);

      // Reflect it immediately — the store notify only refreshes the tab strip,
      // so without this a tap gives no feedback at all.
      doneBtn.setAttribute('aria-pressed', String(next));
      for (const field of ['weight', 'reps']) {
        const input = card.querySelector(`input[data-field="${field}"][data-set="${i}"]`);
        if (!input) continue;
        if (patch[field] != null) input.value = String(patch[field]);
        input.classList.toggle('logged', next);
      }
      syncChrome(root, session);
      return;
    }

    const addBtn = e.target.closest('[data-action="add-set"]');
    if (addBtn) {
      store.addSet(session.id, addBtn.closest('[data-exercise]').dataset.exercise);
      rerender();
      return;
    }

    if (e.target.closest('[data-action="finish"]')) {
      store.finishSession(session.id, { notes: session.notes, bodyweight: session.bodyweight });
      onFinish();
      return;
    }

    if (e.target.closest('[data-action="discard"]')) {
      if (confirm('Discard this session? Logged sets will be lost.')) {
        store.discardSession(session.id);
        onFinish();
      }
    }
  });

  root.addEventListener('click', (e) => {
    const swapBtn = e.target.closest('[data-action="swap"]');
    if (swapBtn) {
      const fromId = swapBtn.closest('[data-exercise]').dataset.exercise;
      const ex = db.exerciseById[fromId];
      // Default the filter to what this exercise actually trains, so the first
      // thing you see is a like-for-like replacement rather than the whole library.
      const group = db.muscleById[(ex?.primaryMuscles ?? [])[0]]?.group ?? 'all';
      openPicker({
        db,
        title: `Swap ${ex?.name ?? fromId}`,
        group,
        exclude: session.entries.map(x => x.exerciseId),
        onPick: (toId) => {
          const logged = session.entries
            .find(x => x.exerciseId === fromId)?.sets.some(sx => sx.done);
          if (logged && !confirm(
            'You have already logged sets here. Swapping re-attributes them to the new exercise. Continue?'
          )) return;
          store.substitute(session.id, fromId, toId);
          rerender();
        }
      });
      return;
    }

    const addBtn = e.target.closest('[data-action="add-exercise"]');
    if (addBtn) {
      openPicker({
        db,
        title: 'Add an exercise',
        group: 'all',
        exclude: session.entries.map(x => x.exerciseId),
        onPick: (id) => { store.addExercise(session.id, id, 3); rerender(); }
      });
      return;
    }

    const removeBtn = e.target.closest('[data-action="remove"]');
    if (removeBtn) {
      const id = removeBtn.closest('[data-exercise]').dataset.exercise;
      const res = store.removeExercise(session.id, id);
      if (!res.removed && res.reason === 'has-logged-sets') {
        alert('This exercise has logged sets. Untick them first if you really want it gone.');
        return;
      }
      rerender();
    }
  });
}
