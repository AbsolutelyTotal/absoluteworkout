// Library — the terroir-style two-sided cross-reference. Pick a muscle to see
// what trains it and how many sets each split gives it; pick an exercise to see
// what it works and which days it appears on.

import { html, mount, chip, fmt, prescriptionLine } from '../ui.js';
import { exercisesForMuscle, daysTraining, plannedWeeklySets } from '../data.js';

let mode = 'muscle';        // 'muscle' | 'exercise'
let selectedId = null;
let query = '';

export function render(root, db) {
  const list = mode === 'muscle' ? db.muscles : filterExercises(db, query);
  const selected = mode === 'muscle' ? db.muscleById[selectedId] : db.exerciseById[selectedId];

  mount(root, html`
    <div class="stack">
      <div class="card">
        <div class="row" data-role="mode">
          ${chip('By muscle', { pressed: mode === 'muscle', value: 'muscle' })}
          ${chip('By exercise', { pressed: mode === 'exercise', value: 'exercise' })}
        </div>
        ${mode === 'exercise' ? html`
          <input data-role="search" type="search" placeholder="Filter exercises…" value="${query}"
                 style="width:100%;margin-top:10px;padding:9px 11px;border-radius:6px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text);font:inherit">
        ` : ''}
      </div>

      <div class="lib-grid">
        <div class="card">
          <div class="section-label">${mode === 'muscle' ? 'Muscles' : `Exercises (${list.length})`}</div>
          <div class="lib-list" style="margin-top:8px" data-role="list">
            ${list.map(item => listItem(db, item))}
          </div>
        </div>
        <div class="card">
          ${selected
            ? (mode === 'muscle' ? muscleDetail(db, selected) : exerciseDetail(db, selected))
            : html`<div class="empty" style="border:none;background:none;padding:28px 8px">
                ${mode === 'muscle' ? 'Pick a muscle.' : 'Pick an exercise.'}
                <div class="hint">
                  ${mode === 'muscle'
                    ? 'See what trains it and how many sets each split gives it.'
                    : 'See what it works and which days program it.'}
                </div>
              </div>`}
        </div>
      </div>
    </div>
  `);

  root.querySelector('[data-role="mode"]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    mode = btn.dataset.value;
    selectedId = null;
    render(root, db);
  });

  root.querySelector('[data-role="list"]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.lib-item');
    if (!btn) return;
    selectedId = btn.dataset.id;
    render(root, db);
  });

  const search = root.querySelector('[data-role="search"]');
  if (search) {
    search.addEventListener('input', () => {
      query = search.value;
      const pos = search.selectionStart;
      render(root, db);
      const next = root.querySelector('[data-role="search"]');
      next?.focus();
      next?.setSelectionRange(pos, pos);
    });
  }
}

function filterExercises(db, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return db.exercises;
  return db.exercises.filter(e =>
    e.name.toLowerCase().includes(needle) ||
    (e.aliases ?? []).some(a => a.toLowerCase().includes(needle)) ||
    (e.primaryMuscles ?? []).some(id => (db.muscleById[id]?.name ?? '').toLowerCase().includes(needle))
  );
}

function listItem(db, item) {
  const isMuscle = 'group' in item;
  let meta;
  if (isMuscle) {
    const { primary, secondary } = exercisesForMuscle(db, item.id);
    // Some muscles (lower back, obliques, adductors) are only ever secondary.
    // Reporting "0 exercises" for those reads as a data bug rather than a fact
    // about the library, so fall back to the indirect count.
    meta = primary.length
      ? `${primary.length} direct`
      : secondary.length ? `${secondary.length} indirect only` : 'not trained';
  } else {
    meta = (item.primaryMuscles ?? []).map(id => db.muscleById[id]?.name ?? id).join(', ');
  }

  return html`<button class="lib-item" type="button" data-id="${item.id}"
                      aria-pressed="${String(item.id === selectedId)}">
    <span class="n">${item.name}</span>
    <span class="m">${meta}</span>
  </button>`;
}

function muscleDetail(db, muscle) {
  const { primary, secondary } = exercisesForMuscle(db, muscle.id);
  const target = muscle.weeklySetTarget;

  // Planned weekly sets per split — the question this view exists to answer.
  const perSplit = db.splits.map(s => ({
    split: s,
    sets: plannedWeeklySets(db, s)[muscle.id] ?? 0
  }));

  return html`
    <div class="spread">
      <div>
        <h3>${muscle.name}</h3>
        <div class="ex-sub">${`${muscle.group} · ${muscle.region} body`}</div>
      </div>
      ${target ? html`<span class="badge">${`target ${target[0]}–${target[1]}/wk`}</span>` : ''}
    </div>

    <div class="section-label" style="margin-top:16px">Planned sets per week</div>
    <table class="data" style="margin-top:6px">
      <tbody>
        ${perSplit.map(({ split, sets }) => {
          let state = '—';
          if (target) state = sets < target[0] ? '↓ under' : sets > target[1] ? '↑ over' : '✓ on target';
          return html`<tr>
            <td class="name">${split.name}</td>
            <td>${`${fmt.sets(sets)} sets`}</td>
            <td>${state}</td>
          </tr>`;
        })}
      </tbody>
    </table>

    ${exerciseListSection('Primary mover in', primary)}
    ${exerciseListSection('Worked indirectly by', secondary)}
  `;
}

function exerciseListSection(label, exercises) {
  if (!exercises.length) return '';
  return html`
    <div class="section-label" style="margin-top:16px">${`${label} (${exercises.length})`}</div>
    <div class="row" style="margin-top:6px">
      ${exercises.map(e => html`<span class="badge">${e.name}</span>`)}
    </div>
  `;
}

function exerciseDetail(db, ex) {
  const name = (id) => db.muscleById[id]?.name ?? id;
  const days = daysTraining(db, ex.id);

  return html`
    <div>
      <h3>${ex.name}</h3>
      <div class="ex-sub">
        ${`${ex.pattern} · ${(ex.equipment ?? []).join(' / ')}`}${ex.unilateral ? ' · unilateral' : ''}
      </div>
      ${ex.aliases?.length ? html`<div class="ex-sub">${`also: ${ex.aliases.join(', ')}`}</div>` : ''}
    </div>

    <div class="section-label" style="margin-top:16px">Primary</div>
    <div class="row" style="margin-top:6px">
      ${(ex.primaryMuscles ?? []).map(id => html`<span class="badge">${name(id)}</span>`)}
    </div>

    ${ex.secondaryMuscles?.length ? html`
      <div class="section-label" style="margin-top:12px">Secondary</div>
      <div class="row" style="margin-top:6px">
        ${ex.secondaryMuscles.map(id => html`<span class="badge">${name(id)}</span>`)}
      </div>` : ''}

    ${ex.cues?.length ? html`
      <div class="section-label" style="margin-top:16px">Cues</div>
      <ul class="cues" style="padding:6px 0 0 20px">${ex.cues.map(c => html`<li>${c}</li>`)}</ul>` : ''}

    ${ex.setupNotes ? html`<div class="note" style="padding:10px 0 0">${ex.setupNotes}</div>` : ''}

    ${days.length ? html`
      <div class="section-label" style="margin-top:16px">Programmed on</div>
      <table class="data" style="margin-top:6px">
        <tbody>
          ${days.map(({ split, day, prescription }) => html`<tr>
            <td class="name">${`${split.name} · ${day.name}`}</td>
            <td>${prescriptionLine(prescription)}</td>
          </tr>`)}
        </tbody>
      </table>` : html`<div class="note" style="padding:12px 0 0">Not in any split yet.</div>`}

    ${ex.alternatives?.length ? html`
      <div class="section-label" style="margin-top:16px">Swaps</div>
      <div class="row" style="margin-top:6px">
        ${ex.alternatives.map(id => html`<span class="badge">${db.exerciseById[id]?.name ?? id}</span>`)}
      </div>` : ''}
  `;
}
