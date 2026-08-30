// History — did the plan actually happen, and is the volume landing where it
// should? Planned volume is what the split prescribes; actual is what got ticked.

import { html, mount, tile, fmt, volumeRow, trendChart } from '../ui.js';
import {
  actualSets, plannedWeeklySets, groupByWeek, weekKey, addDays, tonnage,
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

  const startsOn = settings.weekStartsOn ?? 0;
  const weeks = groupByWeek(sessions, startsOn);
  const thisWeekKey = weekKey(store.localDate(), startsOn);
  const thisWeek = weeks.get(thisWeekKey) ?? [];
  const split = db.splitById[settings.activeSplitId] ?? db.splits[0];

  mount(root, html`
    <div class="stack">
      ${tiles(db, sessions, thisWeek, settings, startsOn, thisWeekKey)}
      ${weekDetail(db, thisWeek, settings, thisWeekKey)}
      ${volumeCard(db, split, thisWeek, settings)}
      ${trendCard(weeks, thisWeekKey)}
      ${prCard(db, sessions, settings)}
      ${sessionsCard(db, sessions)}
    </div>
  `);

  root.addEventListener('click', (e) => {
    const del = e.target.closest('[data-action="delete-session"]');
    if (del) {
      const id = del.getAttribute('data-id');
      const label = del.getAttribute('data-label') || 'this session';
      if (confirm(`Delete ${label}? This removes it from this device and the cloud — on all your devices — and can't be undone.`)) {
        store.deleteSession(id);   // sync (remote delete) fires on the notify
        render(root, db);
      }
      return;
    }
    if (e.target.closest('[data-action="show-week"]')) {
      expanded = !expanded;
      render(root, db);
    }
  }, { signal: (wiring?.abort(), wiring = new AbortController()).signal });
}

let expanded = false;
let wiring = null;

/** This week's sessions, exercise by exercise. Opened from the tile. */
function weekDetail(db, thisWeek, settings, thisWeekKey) {
  if (!expanded) return '';
  if (!thisWeek.length) {
    return html`<div class="card"><div class="ex-sub">Nothing logged this week yet.</div></div>`;
  }
  const dayName = (s) => db.splitById[s.splitId]?.days.find(d => d.id === s.dayId)?.name ?? s.dayId;

  return html`<div class="card">
    <div class="spread">
      <h3>${`This week — ${fmt.date(thisWeekKey)} to ${fmt.date(addDays(thisWeekKey, 6))}`}</h3>
      <button class="btn sm" type="button" data-action="show-week">Hide</button>
    </div>
    ${[...thisWeek].reverse().map(s => html`
      <div class="block" style="margin-top:12px">
        <div class="block-name">
          ${`${new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })} ${fmt.date(s.date)} · ${dayName(s)}`}
        </div>
        <table class="data">
          <tbody>
            ${s.entries.map(en => html`<tr>
              <td class="name">${db.exerciseById[en.exerciseId]?.name ?? en.exerciseId}</td>
              <td>${en.sets.map(x => `${x.weight ?? '—'}${settings.unit}x${x.reps ?? '—'}`).join('  ')}</td>
            </tr>`)}
          </tbody>
        </table>
      </div>`)}
  </div>`;
}

function tiles(db, sessions, thisWeek, settings, startsOn, thisWeekKey) {
  const done = thisWeek.reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.length, 0), 0);
  const bw = [...sessions].reverse().find(s => s.bodyweight != null);
  const weekLabel = `${fmt.date(thisWeekKey)} – ${fmt.date(addDays(thisWeekKey, 6))}`;

  return html`<div class="tiles">
    ${tile('Sessions this week', String(thisWeek.length), {
      sub: `${done} sets · ${weekLabel}`,
      action: 'show-week'
    })}
    ${tile('Week streak', String(weekStreak(sessions, startsOn)), { sub: 'consecutive weeks trained' })}
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
    .sort((a, b) => {
      // Biggest shortfall first: that's the actionable end of the list.
      const gapA = (planned[a] ?? 0) - (actual[a] ?? 0);
      const gapB = (planned[b] ?? 0) - (actual[b] ?? 0);
      if (gapB !== gapA) return gapB - gapA;
      return (actual[b] ?? 0) - (actual[a] ?? 0);
    });

  if (!ids.length) return '';

  const scaleMax = Math.max(
    ...ids.map(id => Math.max(actual[id] ?? 0, planned[id] ?? 0)), 1
  ) * 1.08;

  const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);
  const totalActual = ids.reduce((a, id) => a + (actual[id] ?? 0), 0);

  return html`<div class="card">
    <div class="spread">
      <h3>This week against the plan</h3>
      <span class="badge">${`${fmt.sets(totalActual)} / ${fmt.sets(totalPlanned)} sets`}</span>
    </div>
    <div class="ex-sub" style="margin-bottom:10px">
      Bar is what you did; the marker is what ${split.name} prescribes for a full
      week. Primary movers count as one set, secondary as a half.
    </div>
    ${ids.map(id => volumeRow(db.muscleById[id].name, actual[id] ?? 0, planned[id] ?? 0, scaleMax))}
  </div>`;
}

function trendCard(weeks, thisWeekKey) {
  const keys = [...weeks.keys()].sort();
  if (keys.length < 2) return '';

  // Fill gaps so a skipped week reads as a gap, not as a missing bar.
  const span = fillWeeks(keys[0], thisWeekKey);
  const points = span.slice(-WEEKS_SHOWN).map(k => {
    const ss = weeks.get(k) ?? [];
    const sets = ss.reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.length, 0), 0);
    return { label: `week of ${fmt.date(k)}`, short: fmt.date(k).replace(/ /g, '\u00a0'), value: sets };
  });

  return html`<div class="card">
    <h3>Sets per week</h3>
    <div class="ex-sub" style="margin-bottom:4px">${`Last ${points.length} weeks. Hover a bar for the count.`}</div>
    ${trendChart(points)}
  </div>`;
}

/** Walks week-start keys from `from` to `to` inclusive, in 7-day steps. */
function fillWeeks(from, to) {
  const out = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard++ < 520) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
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
      <thead><tr><th>Date</th><th>Day</th><th>Sets</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${rows.map(s => {
          const split = db.splitById[s.splitId];
          const day = split?.days.find(d => d.id === s.dayId);
          const sets = s.entries.reduce((a, e) => a + e.sets.length, 0);
          const label = `${day?.name ?? s.dayId} on ${fmt.date(s.date)}`;
          return html`<tr>
            <td>${fmt.date(s.date)}</td>
            <td class="name">${day?.name ?? s.dayId}</td>
            <td>${sets}</td>
            <td class="name">${s.notes ?? ''}</td>
            <td><button class="btn sm danger" type="button" data-action="delete-session"
              data-id="${s.id}" data-label="${label}" title="Delete session"
              aria-label="Delete ${label}">Delete</button></td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}
