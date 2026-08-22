// History — did the plan actually happen, and is the volume landing where it
// should? Planned volume is what the split prescribes; actual is what got ticked.

import { html, mount, tile, fmt, volumeRow, trendChart } from '../ui.js';
import {
  actualSets, plannedWeeklySets, groupByWeek, weekKey, tonnage,
  personalRecords, weekStreak
} from '../data.js';
import * as store from '../store.js';

const WEEKS_SHOWN = 12;

export function render(root, db) {
  const settings = store.getSettings();
  const sessions = store.getSessions().filter(s => s.completedAt);

  if (!sessions.length) {
    mount(root, html`<div class="empty">
      No completed sessions yet.
      <div class="hint">Volume, trend and PRs appear here once you finish a session.</div>
    </div>`);
    return;
  }

  const weeks = groupByWeek(sessions);
  const thisWeek = weeks.get(weekKey(store.localDate())) ?? [];
  const split = db.splitById[settings.activeSplitId] ?? db.splits[0];

  mount(root, html`
    <div class="stack">
      ${tiles(db, sessions, thisWeek, settings)}
      ${volumeCard(db, split, thisWeek, settings)}
      ${trendCard(weeks)}
      ${prCard(db, sessions, settings)}
      ${sessionsCard(db, sessions)}
    </div>
  `);
}

function tiles(db, sessions, thisWeek, settings) {
  const done = thisWeek.reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.length, 0), 0);
  const bw = [...sessions].reverse().find(s => s.bodyweight != null);

  return html`<div class="tiles">
    ${tile('Sessions this week', String(thisWeek.length), { sub: `${done} sets logged` })}
    ${tile('Week streak', String(weekStreak(sessions)), { sub: 'consecutive weeks trained' })}
    ${tile('Volume this week', fmt.tonnage(tonnage(thisWeek), settings.unit), { sub: 'weight x reps' })}
    ${tile('Total sessions', String(sessions.length), {
      sub: bw ? `bodyweight ${bw.bodyweight}${settings.unit}` : 'all time'
    })}
  </div>`;
}

/**
 * Weekly sets per muscle, actual against the target band. One hue; the band and
 * the text label carry whether you're under, on, or over — see ui.js volumeRow
 * for why state isn't colour-coded.
 */
function volumeCard(db, split, thisWeek, settings) {
  const actual = actualSets(db, thisWeek);
  const planned = plannedWeeklySets(db, split);

  // Show every muscle the split intends to train, even at zero — a muscle
  // missing from the list is the thing you most want to notice.
  const ids = [...new Set([...Object.keys(planned), ...Object.keys(actual)])]
    .filter(id => db.muscleById[id])
    .sort((a, b) => (actual[b] ?? 0) - (actual[a] ?? 0));

  if (!ids.length) return '';

  // `null` is meaningful (deliberately untargeted); only `undefined` falls back.
  const targets = Object.fromEntries(ids.map(id => {
    const t = db.muscleById[id].weeklySetTarget;
    return [id, t === undefined ? settings.defaultSetTarget : t];
  }));
  const scaleMax = Math.max(
    ...ids.map(id => Math.max(actual[id] ?? 0, targets[id] ? targets[id][1] : 0)), 1
  ) * 1.05;

  return html`<div class="card">
    <div class="spread">
      <h3>Sets this week, by muscle</h3>
      <span class="badge">${`target band = ${split.name}`}</span>
    </div>
    <div class="ex-sub" style="margin-bottom:10px">
      Primary movers count as one set, secondary as a half. Shaded band is the weekly target range.
    </div>
    ${ids.map(id => volumeRow(db.muscleById[id].name, actual[id] ?? 0, targets[id], scaleMax))}
  </div>`;
}

function trendCard(weeks) {
  const keys = [...weeks.keys()].sort();
  if (keys.length < 2) return '';

  // Fill gaps so a skipped week reads as a gap, not as a missing bar.
  const span = fillWeeks(keys[0], weekKey(store.localDate()));
  const points = span.slice(-WEEKS_SHOWN).map(k => {
    const ss = weeks.get(k) ?? [];
    const sets = ss.reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.length, 0), 0);
    return { label: k, short: k.slice(-3).replace('W', 'w'), value: sets };
  });

  return html`<div class="card">
    <h3>Sets per week</h3>
    <div class="ex-sub" style="margin-bottom:4px">${`Last ${points.length} weeks. Hover a bar for the count.`}</div>
    ${trendChart(points)}
  </div>`;
}

/** Walks ISO week keys from `from` to `to` inclusive. */
function fillWeeks(from, to) {
  const out = [];
  const cursor = mondayOf(from);
  const end = mondayOf(to);
  let guard = 0;
  while (cursor <= end && guard++ < 520) {
    out.push(weekKey(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    ));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

function mondayOf(key) {
  const [year, week] = key.split('-W').map(Number);
  const jan4 = new Date(year, 0, 4);
  const day = (jan4.getDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - day + (week - 1) * 7);
  return monday;
}

function prCard(db, sessions, settings) {
  const prs = personalRecords(sessions);
  const rows = Object.entries(prs)
    .map(([id, r]) => ({ name: db.exerciseById[id]?.name ?? id, ...r }))
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, 12);

  if (!rows.length) return '';

  return html`<div class="card">
    <h3>Best sets</h3>
    <div class="ex-sub" style="margin-bottom:8px">
      Estimated 1RM (Epley). Reliable in the 1–12 rep range; above that it overstates.
    </div>
    <table class="data">
      <thead><tr><th>Exercise</th><th>Best set</th><th>Est. 1RM</th><th>When</th></tr></thead>
      <tbody>
        ${rows.map(r => html`<tr>
          <td class="name">${r.name}</td>
          <td>${`${r.weight}${settings.unit} x ${r.reps}`}</td>
          <td>${`${Math.round(r.e1rm)}${settings.unit}`}</td>
          <td>${fmt.date(r.date)}</td>
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

function sessionsCard(db, sessions) {
  const rows = [...sessions].reverse().slice(0, 15);
  return html`<div class="card">
    <h3>Recent sessions</h3>
    <table class="data" style="margin-top:8px">
      <thead><tr><th>Date</th><th>Day</th><th>Sets</th><th>Notes</th></tr></thead>
      <tbody>
        ${rows.map(s => {
          const split = db.splitById[s.splitId];
          const day = split?.days.find(d => d.id === s.dayId);
          const sets = s.entries.reduce((a, e) => a + e.sets.length, 0);
          return html`<tr>
            <td>${fmt.date(s.date)}</td>
            <td class="name">${day?.name ?? s.dayId}</td>
            <td>${sets}</td>
            <td class="name">${s.notes ?? ''}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}
