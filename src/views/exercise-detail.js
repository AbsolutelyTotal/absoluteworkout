// Exercise detail sheet — the big picture plus the cues, opened from the Log
// view by tapping an exercise name.
//
// This exists because mid-session is exactly when you need the setup reminder,
// and the Log view is deliberately stripped down to sets and numbers. Rather
// than crowd every card with cues, they live one tap away.

import { html, mount } from '../ui.js';

export function initExerciseDetail() {
  const d = document.getElementById('exercise-dialog');
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-action="close-detail"]')) d.close();
  });
}

export function openExerciseDetail(ex, db) {
  if (!ex) return;
  const d = document.getElementById('exercise-dialog');
  const muscleName = (id) => db.muscleById[id]?.name ?? id;

  mount(d.querySelector('[data-role="body"]'), html`
    <div class="spread" style="align-items:flex-start">
      <div style="min-width:0">
        <h3>${ex.name}</h3>
        <div class="ex-sub">
          ${(ex.primaryMuscles ?? []).map(muscleName).join(', ')}${ex.unilateral ? ' · per side' : ''}
        </div>
        ${ex.support ? html`<div class="support-tag">${`support: ${ex.support.replace(/-/g, ' ')}`}</div>` : ''}
      </div>
      <button class="tool-btn" type="button" data-action="close-detail" aria-label="Close">×</button>
    </div>

    ${ex.image
      ? html`<img class="detail-photo" src="${ex.image}" alt="${ex.name}" loading="lazy">`
      : ''}

    ${ex.formLimit ? html`<div class="limit" style="margin:10px 0 0">${`⚠ ${ex.formLimit}`}</div>` : ''}

    ${ex.cues?.length ? html`
      <div class="section-label" style="margin-top:14px">Cues</div>
      <ul class="cues" style="padding:6px 0 0 20px">${ex.cues.map(c => html`<li>${c}</li>`)}</ul>` : ''}

    ${ex.setupNotes ? html`
      <div class="section-label" style="margin-top:14px">Setup</div>
      <div class="note" style="padding:4px 0 0">${ex.setupNotes}</div>` : ''}

    ${(ex.secondaryMuscles ?? []).length ? html`
      <div class="section-label" style="margin-top:14px">Also works</div>
      <div class="row" style="margin-top:6px">
        ${ex.secondaryMuscles.map(id => html`<span class="badge">${muscleName(id)}</span>`)}
      </div>` : ''}

    ${ex.demoUrl
      ? html`<div style="margin-top:14px">
          <a class="demo-link" href="${ex.demoUrl}" target="_blank" rel="noopener">▶ form demo</a>
        </div>`
      : ''}
  `);

  if (!d.open) d.showModal();
}
