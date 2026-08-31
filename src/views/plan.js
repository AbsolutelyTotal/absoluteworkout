// Plan — pick a split, pick a day, read the prescription. No state written here
// beyond the active-split setting; starting a session hands off to the Log view.

import { html, mount, chip, prescriptionLine, fmt } from '../ui.js';
import { prescriptionsOf, dayOf, plannedWeeklySets, byGroup, suggestNextDay, profileOfSplit, withUserPlans } from '../data.js';
import { equipmentIcon } from '../icons/equipment.js';
import { openEditor } from './plan-editor.js';
import * as store from '../store.js';

const isUserPlan = (id) => store.getPlans().some(p => p.id === id && !p.deleted);

let selectedDayId = null;

export function render(root, db, handlers) {
  const { onStartSession, onProfileChange } = handlers;
  const settings = store.getSettings();
  const split = db.splitById[settings.activeSplitId] ?? db.splits[0];
  const suggested = suggestNextDay(split, store.getSessions());
  const dayId = selectedDayId && dayOf(split, selectedDayId) ? selectedDayId : suggested;
  const day = dayOf(split, dayId);
  const profile = profileOfSplit(db, split);

  const planned = byGroup(db, plannedWeeklySets(db, split));
  const totalSets = Object.values(planned).reduce((a, b) => a + b, 0);

  mount(root, html`
    <div class="stack">
      <div class="card">
        <div class="section-label">Split</div>
        <div class="row" style="margin-top:8px" data-role="split-picker">
          ${db.splits.map(s => chip(s.name, {
            pressed: s.id === split.id,
            value: s.id,
            count: s.daysPerWeek
          }))}
        </div>
        ${split.description ? html`<div class="note" style="padding:10px 0 0">${split.description}</div>` : ''}
        <div class="ex-sub" style="margin-top:6px">
          ${`${split.cycle.length}-day rotation · ${fmt.sets(totalSets)} planned sets/week`}
        </div>
        ${profile ? html`<div class="support-tag" style="margin-top:4px">
          ${`constraints: ${profile.name}`}
        </div>` : ''}
        <div class="row plan-actions" style="margin-top:12px">
          <button class="btn sm" type="button" data-action="plan-new">＋ New plan</button>
          <button class="btn sm" type="button" data-action="plan-duplicate">Duplicate</button>
          ${isUserPlan(split.id) ? html`
            <button class="btn sm" type="button" data-action="plan-edit">Edit</button>
            <button class="btn sm danger" type="button" data-action="plan-delete">Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="section-label">Day</div>
        <div class="row" style="margin-top:8px" data-role="day-picker">
          ${split.cycle.map(id => {
            const d = dayOf(split, id);
            return d ? chip((d.shortName ?? d.name) + (id === suggested ? ' ·' : ''), {
              pressed: id === dayId,
              value: id
            }) : '';
          })}
        </div>
        ${dayId === suggested
          ? html`<div class="ex-sub" style="margin-top:8px">· next in the rotation</div>`
          : ''}
      </div>

      ${day ? dayCard(db, split, day) : html`<div class="empty">No day selected.</div>`}
    </div>
  `);

  root.querySelector('[data-role="split-picker"]')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    store.updateSettings({ activeSplitId: btn.dataset.value });
    selectedDayId = null;
    // A split on another profile permits a different exercise library, so the
    // data must be reloaded before rendering against it.
    if (onProfileChange && await onProfileChange(btn.dataset.value)) return;
    render(root, db, handlers);
  });

  root.querySelector('[data-role="day-picker"]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    selectedDayId = btn.dataset.value;
    render(root, db, handlers);
  });

  root.querySelector('[data-action="start"]')?.addEventListener('click', () => {
    onStartSession(split.id, dayId, prescriptionsOf(day));
  });

  // Re-merge the (possibly changed) plans into db and repaint the Plan view.
  const reopen = () => {
    withUserPlans(db, store.getLivePlans());
    render(root, db, handlers);
  };
  root.querySelector('[data-action="plan-new"]')?.addEventListener('click', () => {
    openEditor(root, db, { mode: 'new', onDone: reopen });
  });
  root.querySelector('[data-action="plan-duplicate"]')?.addEventListener('click', () => {
    openEditor(root, db, { mode: 'fork', source: split, onDone: reopen });
  });
  root.querySelector('[data-action="plan-edit"]')?.addEventListener('click', () => {
    openEditor(root, db, { mode: 'edit', source: split, onDone: reopen });
  });
  root.querySelector('[data-action="plan-delete"]')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${split.name}"? This removes it from your plans on all your devices.`)) return;
    store.deletePlan(split.id);
    selectedDayId = null;
    if (settings.activeSplitId === split.id) {
      // Fall back to a built-in; switch profile if the fallback differs.
      const fallback = db.builtinSplits?.[0]?.id ?? db.splits[0].id;
      store.updateSettings({ activeSplitId: fallback });
      if (onProfileChange && await onProfileChange(fallback)) return;   // it repaints
    }
    reopen();
  });
}

function dayCard(db, split, day) {
  const items = prescriptionsOf(day);
  const sets = items.reduce((a, p) => a + p.sets, 0);
  const active = store.activeSession();

  return html`
    <div class="card">
      <div class="spread">
        <div>
          <h2>${day.name}</h2>
          <div class="ex-sub">${`${items.length} exercises · ${sets} sets`}</div>
        </div>
        <button class="btn primary" data-action="start" ${active ? 'disabled' : ''}>
          ${active ? 'Session in progress' : 'Start session'}
        </button>
      </div>
      <div class="row" style="margin-top:10px">
        ${(day.focus ?? []).map(g => html`<span class="badge">${g}</span>`)}
      </div>
      ${day.notes ? html`<div class="note">${day.notes}</div>` : ''}
    </div>

    ${(day.blocks ?? []).map(block => html`
      <div class="block">
        ${block.name ? html`<div class="block-name">${block.name}</div>` : ''}
        ${(block.items ?? []).map(p => exerciseRow(db, p))}
      </div>
    `)}
  `;
}

function exerciseRow(db, p) {
  const ex = db.exerciseById[p.exerciseId];
  if (!ex) {
    return html`<div class="ex"><div class="ex-head">
      <div><div class="ex-name">Unknown exercise</div>
      <div class="ex-sub">${`id "${p.exerciseId}" is not in exercises.json`}</div></div>
    </div></div>`;
  }

  const muscles = (ex.primaryMuscles ?? [])
    .map(id => db.muscleById[id]?.name ?? id)
    .join(', ');
  const superset = p.supersetWith ? db.exerciseById[p.supersetWith]?.name : null;

  return html`<div class="ex">
    <div class="ex-head">
      <div class="ex-icons">
        ${equipmentIcon(ex)}
      </div>
      <div class="ex-titles">
        <div class="ex-name">${ex.name}</div>
        <div class="ex-sub">${muscles}${ex.unilateral ? ' · per side' : ''}</div>
        ${ex.support ? html`<div class="support-tag">${`support: ${ex.support.replace(/-/g, ' ')}`}</div>` : ''}
        ${superset ? html`<div class="ex-sub">${`superset with ${superset}`}</div>` : ''}
        ${ex.demoUrl
          ? html`<a class="demo-link" href="${ex.demoUrl}" target="_blank" rel="noopener">▶ form demo</a>`
          : ''}
      </div>
      <div class="ex-pres">
        <div class="sets">${prescriptionLine(p)}</div>
        <div class="rest">${fmt.rest(p.restSeconds)}</div>
      </div>
    </div>
    ${ex.formLimit ? html`<div class="limit">${`⚠ ${ex.formLimit}`}</div>` : ''}
    ${ex.cues?.length ? html`<ul class="cues">${ex.cues.map(c => html`<li>${c}</li>`)}</ul>` : ''}
    ${ex.setupNotes ? html`<div class="note">${ex.setupNotes}</div>` : ''}
    ${p.notes ? html`<div class="note">${p.notes}</div>` : ''}
  </div>`;
}
