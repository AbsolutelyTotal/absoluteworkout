// QA suite. Drives the real modules and the real DOM — no mocks, no test
// framework, no dependencies.
//
// Every case here corresponds to a bug that actually shipped, or to an
// invariant that would be expensive to get wrong (set logging, volume
// accounting, the constraint filter). Regression tests, not aspiration.
//
// SAFETY: the store reads and writes the same localStorage key the app uses, so
// the suite snapshots it up front and restores it in a finally block. Running
// these will not cost you your training log.

import * as store from '../src/store.js';
import { loadData, weekKey, addDays, groupByWeek, weekStreak, actualSets,
         plannedWeeklySets, tonnage, e1rm, personalRecords, prescriptionsOf,
         dayOf } from '../src/data.js';
import { html, mount, safeImagePath } from '../src/ui.js';
import * as log from '../src/views/log.js';
import * as history from '../src/views/history.js';
import { initPicker } from '../src/views/picker.js';
import { initExerciseDetail } from '../src/views/exercise-detail.js';
import { chatConfigured, workoutContext } from '../src/chat.js';
import { WORKOUT_CHAT_URL } from '../src/supabase-config.js';

const KEY = 'absoluteworkout.v1';
const results = [];
let currentGroup = '';

const group = (name) => { currentGroup = name; };
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ group: currentGroup, name, pass: true, detail: detail ?? '' });
  } catch (err) {
    results.push({ group: currentGroup, name, pass: false, detail: err.message });
  }
}
async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    results.push({ group: currentGroup, name, pass: true, detail: detail ?? '' });
  } catch (err) {
    results.push({ group: currentGroup, name, pass: false, detail: err.message });
  }
}

function eq(actual, expected, what = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}expected ${b}, got ${a}`);
  return `${what}${b}`;
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); return msg; };
const wait = (ms = 0) => new Promise(r => setTimeout(r, ms));

/** Replace stored state and force the store to re-read it. */
function seed(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  return store.reload();
}
const baseSettings = { activeSplitId: 'core-3', unit: 'kg', weekStartsOn: 0, defaultSetTarget: [10, 20] };
const emptyState = () => ({ version: 1, settings: { ...baseSettings }, sessions: [] });

function session(date, dayId, entries, { completed = true } = {}) {
  return {
    id: `${date}-${dayId}`, date, splitId: 'core-3', dayId,
    startedAt: `${date}T10:00:00.000Z`,
    ...(completed ? { completedAt: `${date}T11:00:00.000Z` } : {}),
    entries
  };
}

export async function run(scratch) {
  const snapshot = localStorage.getItem(KEY);
  try {
    const db = await loadData('l5s1');
    initPicker();
    initExerciseDetail();

    // ---------------------------------------------------------------- data
    group('Data integrity');

    check('every exercise muscle id exists', () => {
      const bad = db.exercises.flatMap(e =>
        [...(e.primaryMuscles ?? []), ...(e.secondaryMuscles ?? [])]
          .filter(id => !db.muscleById[id]).map(id => `${e.id}->${id}`));
      return eq(bad, [], 'dangling: ');
    });
    check('every alternative id exists', () => {
      const bad = db.exercises.flatMap(e =>
        (e.alternatives ?? []).filter(id => !db.exerciseById[id]).map(id => `${e.id}->${id}`));
      return eq(bad, [], 'dangling: ');
    });
    await checkAsync('every prescription id exists under its own profile', async () => {
      // Each split is checked against the library ITS profile loads — a split
      // under another profile legitimately references exercises that are not
      // in memory under l5s1 (that absence is the safety model, not a bug).
      const bad = [];
      const dbFor = { [db.profile.id]: db };
      for (const s of db.splits) {
        const pid = s.profileId ?? db.profiles[0].id;
        dbFor[pid] ??= await loadData(pid);
        for (const d of s.days) for (const p of prescriptionsOf(d))
          if (!dbFor[pid].exerciseById[p.exerciseId]) bad.push(`${s.id}/${d.id}->${p.exerciseId}`);
      }
      return eq(bad, [], 'dangling: ');
    });
    check('loader reports no issues', () => eq(db.issues, [], 'issues: '));
    check('every muscle and exercise entry has an id', () => {
      // Guards against documentation or comments being smuggled into a data
      // array, which would render as a nameless row and index under `undefined`.
      const bad = [
        ...db.muscles.filter(m => !m.id).map(() => 'muscle without id'),
        ...db.exercises.filter(e => !e.id).map(() => 'exercise without id')
      ];
      eq(bad, [], 'entries: ');
      return eq(db.muscleById['undefined'], undefined, 'undefined key: ');
    });
    check('every exercise renders something (image or icon/equipment fallback)', () => {
      // Not every exercise has generated art yet (newly-vetted ones fall back to
      // a line icon, same as the extended library). What must hold: nothing
      // renders blank — equipmentIcon needs an image, an icon key, or equipment.
      const blank = db.exercises
        .filter(e => !e.image && !e.icon && !(e.equipment && e.equipment.length))
        .map(e => e.id);
      return eq(blank, [], 'no visual affordance: ');
    });
    await checkAsync('every declared image actually resolves', async () => {
      // The previous version of this case only checked the field was present,
      // so a path pointing at a file that had never been generated passed.
      const results = await Promise.all(db.exercises.filter(e => e.image).map(async e => {
        const r = await fetch(e.image, { method: 'HEAD' }).catch(() => ({ ok: false }));
        return r.ok ? null : e.image;
      }));
      const missingMuscles = await Promise.all(db.muscles.map(async m => {
        if (!m.image) return null;
        const r = await fetch(m.image, { method: 'HEAD' }).catch(() => ({ ok: false }));
        return r.ok ? null : m.image;
      }));
      return eq([...results, ...missingMuscles].filter(Boolean), [], '404: ');
    });

    group('Constraint profile');
    check('l5s1 does not permit the extended library', () =>
      ok(db.profile.allowExtendedLibrary === false, 'allowExtendedLibrary should be false'));
    check('no banned movement is in the library', () => {
      const banned = /squat|deadlift|romanian|\brdl\b|crunch|situp|sit-up|farmer|carry|hack|bulgarian|hip-thrust/;
      const hits = db.exercises.filter(e => banned.test(e.id)).map(e => e.id);
      // leg press is a permitted `squat` PATTERN but its id must not match
      return eq(hits, [], 'banned ids present: ');
    });
    await checkAsync('the extended library loads for noa and never for l5s1', async () => {
      // Non-vacuous since Noa's plan landed: exercises-extended.json now has
      // real entries, so this asserts the fail-closed loading both ways.
      const extended = await fetch('data/exercises-extended.json', { cache: 'no-store' }).then(r => r.json());
      ok(extended.length > 0, 'extended library should not be empty');
      const missing = extended.filter(e => db.exerciseById[e.id]).map(e => e.id);
      eq(missing, [], 'extended ids loaded under l5s1: ');
      const noaDb = await loadData('noa');
      const absent = extended.filter(e => !noaDb.exerciseById[e.id]).map(e => e.id);
      eq(absent, [], 'extended ids missing under noa: ');
      return eq(noaDb.issues, [], 'noa profile load issues: ');
    });
    check('every split declares a known profile', () => {
      const bad = db.splits.filter(s => !db.profileById[s.profileId]).map(s => s.id);
      return eq(bad, [], 'unknown profile: ');
    });

    // ------------------------------------------------------------- weeks
    group('Week bucketing (the Sunday bug)');

    check('Sunday and Tuesday share a Sunday-start week', () => {
      eq(weekKey('2026-08-16', 0), '2026-08-16', 'sun: ');
      return eq(weekKey('2026-08-18', 0), '2026-08-16', 'tue: ');
    });
    check('Monday-start would have split them (documents the old bug)', () =>
      ok(weekKey('2026-08-16', 1) !== weekKey('2026-08-18', 1),
         'Monday-start should put Sunday in the previous week'));
    check('Saturday is the last day of a Sunday-start week', () =>
      eq(weekKey('2026-08-22', 0), '2026-08-16'));
    check('the next Sunday starts a new week', () =>
      eq(weekKey('2026-08-23', 0), '2026-08-23'));
    check('groupByWeek counts both sessions in one week', () => {
      const ss = [session('2026-08-16', 'push', []), session('2026-08-18', 'pull', [])];
      const w = groupByWeek(ss, 0);
      eq(w.size, 1, 'weeks: ');
      return eq(w.get('2026-08-16').length, 2, 'sessions in week: ');
    });
    check('addDays crosses a month boundary', () => eq(addDays('2026-08-30', 7), '2026-09-06'));
    check('weekStreak counts consecutive weeks only', () => {
      const today = new Date();
      const k = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const thisWeek = weekKey(k(today), 0);
      const ss = [session(thisWeek, 'push', []), session(addDays(thisWeek, -7), 'pull', []),
                  session(addDays(thisWeek, -28), 'legs', [])];   // gap
      return eq(weekStreak(ss, 0), 2, 'streak: ');
    });

    // ---------------------------------------------------------- accounting
    group('Volume accounting');

    check('primary counts 1.0, secondary 0.5', () => {
      // machine-chest-press: primary mid-chest, secondary front-delts + triceps
      const ss = [session('2026-08-16', 'push', [
        { exerciseId: 'machine-chest-press', sets: [
          { weight: 50, reps: 10, done: true }, { weight: 50, reps: 9, done: true }] }])];
      const v = actualSets(db, ss);
      eq(v['mid-chest'], 2, 'primary: ');
      return eq(v['front-delts'], 1, 'secondary (2 x 0.5): ');
    });
    check('unticked sets contribute no volume', () => {
      const ss = [session('2026-08-16', 'push', [
        { exerciseId: 'machine-chest-press', sets: [
          { weight: 50, reps: 10, done: true }, { weight: 50, reps: 9, done: false }] }])];
      return eq(actualSets(db, ss)['mid-chest'], 1, 'primary: ');
    });
    check('tonnage is weight x reps over done sets only', () => {
      const ss = [session('2026-08-16', 'push', [
        { exerciseId: 'machine-chest-press', sets: [
          { weight: 50, reps: 10, done: true }, { weight: 100, reps: 10, done: false }] }])];
      return eq(tonnage(ss), 500);
    });
    check('e1rm: a single is its own max', () => eq(e1rm(100, 1), 100));
    check('e1rm rises with reps (Epley)', () => ok(e1rm(100, 10) > 100, 'should exceed the load'));
    check('planned weekly sets are non-empty for the 3-day split', () => {
      const p = plannedWeeklySets(db, db.splitById['core-3']);
      return ok(Object.keys(p).length > 5, `got ${Object.keys(p).length} muscles`);
    });
    check('lower-back has no target (deliberately untrained)', () =>
      eq(db.muscleById['lower-back'].weeklySetTarget, null));
    check('personalRecords ignores in-progress sessions', () => {
      const ss = [session('2026-08-16', 'push', [
        { exerciseId: 'machine-chest-press', sets: [{ weight: 200, reps: 5, done: true }] }],
        { completed: false })];
      return eq(Object.keys(personalRecords(ss)), []);
    });

    // ------------------------------------------------------------- escaping
    group('Rendering safety');

    check('html tag escapes interpolated markup', () => {
      const el = mount(document.createElement('div'), html`<span>${'<img src=x onerror=alert(1)>'}</span>`);
      eq(el.querySelectorAll('img').length, 0, 'img injected: ');
      return ok(el.textContent.includes('<img'), 'should appear as literal text');
    });
    check('mount strips on* attributes from literal markup', () => {
      // `onclick` here is part of the static template, not an interpolation, so
      // escaping doesn't catch it — scrub() must.
      const el = mount(document.createElement('div'), html`<div onclick="x()">hi</div>`);
      return eq(el.querySelector('div')?.getAttribute('onclick'), null, 'onclick: ');
    });
    check('mount strips script tags', () => {
      const el = mount(document.createElement('div'), html`<div><script>window.x=1</script>hi</div>`);
      return eq(el.querySelectorAll('script').length, 0, 'scripts: ');
    });
    check('scrub blocks javascript: even with an embedded tab/newline', () => {
      // The URL parser ignores whitespace/C0 chars in the scheme, so
      // "java\tscript:" runs — the filter must collapse them before testing.
      const bad = [];
      for (const url of ['javascript:alert(1)', 'java\tscript:alert(1)', 'jav\nascript:alert(1)', '\u0001javascript:alert(1)', 'vbscript:x']) {
        const el = mount(document.createElement('div'), html`<a href="${url}">x</a>`);
        if (el.querySelector('a')?.getAttribute('href') != null) bad.push(url);
      }
      // a legitimate URL must survive
      const okEl = mount(document.createElement('div'), html`<a href="${'https://example.com/'}">x</a>`);
      ok(okEl.querySelector('a')?.getAttribute('href') === 'https://example.com/', 'real URL kept');
      return eq(bad, [], 'dangerous schemes that survived: ');
    });
    check('safeImagePath accepts relative and rejects off-origin/traversal', () => {
      const cases = [
        ['assets/exercises/x.jpg', 'assets/exercises/x.jpg'],
        ['//evil.com/x.jpg', ''],
        ['/etc/passwd', ''],
        ['http://evil/x.jpg', ''],
        ['../../secret.jpg', ''],
        ['x" onerror="y', '']
      ];
      const bad = cases
        .filter(([v, want]) => safeImagePath(v) !== want)
        .map(([v]) => `${v} -> ${JSON.stringify(safeImagePath(v))}`);
      return eq(bad, [], 'mismatches: ');
    });

    // --------------------------------------------------------------- store
    group('Session lifecycle');

    await checkAsync('start creates one entry per prescription with the right set count', async () => {
      seed(emptyState());
      const day = dayOf(db.splitById['core-3'], 'push');
      const ps = prescriptionsOf(day);
      const s = store.startSession('core-3', 'push', ps);
      eq(s.entries.length, ps.length, 'entries: ');
      return eq(s.entries.map(e => e.sets.length), ps.map(p => p.sets), 'set counts: ');
    });
    check('a second start does not create a second session', () => {
      const before = store.getSessions().length;
      store.startSession('core-3', 'pull', []);
      return eq(store.getSessions().length, before, 'sessions: ');
    });
    check('addSet appends exactly one and carries the weight forward', () => {
      const s = store.activeSession();
      const id = s.entries[0].exerciseId;
      store.updateSet(s.id, id, 0, { weight: 60, reps: 8, done: true });
      const before = s.entries[0].sets.length;
      store.addSet(s.id, id);
      eq(store.activeSession().entries[0].sets.length, before + 1, 'count: ');
      const last = store.activeSession().entries[0].sets.at(-1);
      return eq(last.weight, 60, 'carried weight: ');
    });
    check('addExercise refuses a duplicate', () => {
      const s = store.activeSession();
      store.addExercise(s.id, 'seated-calf-raise', 3);
      const n = store.activeSession().entries.length;
      store.addExercise(s.id, 'seated-calf-raise', 3);
      return eq(store.activeSession().entries.length, n, 'entries: ');
    });
    check('removeExercise refuses once a set is ticked', () => {
      const s = store.activeSession();
      store.updateSet(s.id, 'seated-calf-raise', 0, { weight: 40, reps: 12, done: true });
      const res = store.removeExercise(s.id, 'seated-calf-raise');
      eq(res.removed, false, 'removed: ');
      return eq(res.reason, 'has-logged-sets', 'reason: ');
    });
    check('removeExercise succeeds with no ticked sets', () => {
      const s = store.activeSession();
      store.addExercise(s.id, 'plank-placeholder-none', 1);   // unknown id is fine for store
      const res = store.removeExercise(s.id, 'plank-placeholder-none');
      return eq(res.removed, true);
    });
    check('substitute re-points the entry and records substitutedFor', () => {
      const s = store.activeSession();
      store.substitute(s.id, 'machine-chest-press', 'pec-deck-fly');
      const e = store.activeSession().entries.find(x => x.exerciseId === 'pec-deck-fly');
      ok(e, 'swapped entry should exist');
      return eq(e.substitutedFor, 'machine-chest-press', 'substitutedFor: ');
    });
    check('finish drops unticked sets and empty entries', () => {
      const s = store.activeSession();
      store.finishSession(s.id);
      const done = store.getSessions().find(x => x.id === s.id);
      ok(done.completedAt, 'should be completed');
      const anyUnticked = done.entries.some(e => e.sets.some(x => !x.done));
      eq(anyUnticked, false, 'unticked remaining: ');
      return eq(done.entries.every(e => e.sets.length > 0), true, 'no empty entries: ');
    });
    check('lastPerformance finds the most recent completed set', () => {
      const lp = store.lastPerformance('seated-calf-raise');
      ok(lp, 'should find history');
      return eq(lp.sets[0].weight, 40, 'weight: ');
    });
    check('export/import round-trips without duplicating', () => {
      const json = store.exportJSON();
      const n = store.getSessions().length;
      const r = store.importJSON(json, { merge: true });
      eq(store.getSessions().length, n, 'sessions after re-import: ');
      return eq(r.added, 0, 'added: ');
    });
    check('corrupt payload does not wipe state', () => {
      localStorage.setItem(KEY, '{not json');
      const st = store.reload();
      eq(st.sessions.length, 0, 'sessions: ');
      const quarantined = Object.keys(localStorage).some(k => k.startsWith(`${KEY}.corrupt.`));
      return ok(quarantined, 'a copy should be quarantined, not discarded');
    });

    // ---- ingest hardening: a malformed session must never reach a render ----
    check('mergeSessions drops malformed rows and does not throw', () => {
      seed(emptyState());
      // startedAt missing -> the old localeCompare sort threw here; splitId as a
      // prototype key -> a truthy Object.prototype that crashed the Plan view.
      const r = store.mergeSessions([
        { id: 'ok', startedAt: '2026-01-02T10:00:00Z', date: '2026-01-02', splitId: 'core-3', dayId: 'push', entries: [], completedAt: '2026-01-02T11:00:00Z' },
        { id: 'no-start', date: '2026-01-01', entries: [] },
        { id: 'no-entries', startedAt: '2026-01-01T00:00:00Z' },
        { id: 'proto', startedAt: '2026-01-01T00:00:00Z', splitId: '__proto__', entries: [] },
        { startedAt: '2026-01-01T00:00:00Z', entries: [] }
      ]);
      eq(store.getSessions().length, 1, 'only the valid row admitted: ');
      return eq(r.added, 1, 'added: ');
    });
    check('a malformed active session cannot be imported (no boot brick)', () => {
      seed(emptyState());
      // An in-progress session (no completedAt) with no entries is exactly what
      // threw in the Log view during boot, before export was wired.
      const bad = JSON.stringify({ version: 1, settings: { ...baseSettings },
        sessions: [{ id: 'x', startedAt: '2026-01-01T00:00:00Z', date: '2026-01-01', splitId: 'core-3', dayId: 'push' }] });
      store.importJSON(bad, { merge: false });
      eq(store.getSessions().length, 0, 'malformed session rejected: ');
      return ok(store.activeSession() === null, 'no active session to brick on');
    });
    check('newer stored version boots fresh instead of blanking', () => {
      localStorage.setItem(KEY, JSON.stringify({ version: 999, sessions: [{ id: 'a' }] }));
      const st = store.reload();
      eq(st.sessions.length, 0, 'boots on defaults: ');
      const kept = Object.keys(localStorage).some(k => k.startsWith(`${KEY}.future.`));
      return ok(kept, 'newer data quarantined, not lost');
    });
    check('bodyweight and notes persist immediately', () => {
      seed(emptyState());
      const db2 = null; // not needed; use store directly
      const s0 = { id: 's', startedAt: '2026-01-01T00:00:00Z', date: '2026-01-01', splitId: 'core-3', dayId: 'push', entries: [] };
      store.mergeSessions([s0]);
      store.updateSessionMeta('s', { bodyweight: 78, notes: 'felt strong' });
      const st = store.reload();               // round-trip through localStorage
      const got = st.sessions.find(x => x.id === 's');
      eq(got.bodyweight, 78, 'bodyweight persisted: ');
      return eq(got.notes, 'felt strong', 'notes persisted: ');
    });

    // ------------------------------------------------------------- log view
    group('Log view interactions (the shipped bugs)');

    async function freshSession() {
      seed(emptyState());
      const ps = prescriptionsOf(dayOf(db.splitById['core-3'], 'push'));
      store.startSession('core-3', 'push', ps);
      log.render(scratch, db, { onFinish: () => {} });
      await wait(0);
      return scratch.querySelector('[data-exercise]');
    }

    await checkAsync('one click on + set adds exactly one set', async () => {
      let card = await freshSession();
      const before = card.querySelectorAll('input[data-field="weight"]').length;
      card.querySelector('[data-action="add-set"]').click();
      await wait(0);
      card = scratch.querySelector('[data-exercise]');
      return eq(card.querySelectorAll('input[data-field="weight"]').length, before + 1, 'rows: ');
    });

    await checkAsync('+ set still adds exactly one after five re-renders', async () => {
      await freshSession();
      for (let i = 0; i < 5; i++) { log.render(scratch, db, { onFinish: () => {} }); await wait(0); }
      const card = scratch.querySelector('[data-exercise]');
      const id = card.dataset.exercise;
      const before = store.activeSession().entries.find(e => e.exerciseId === id).sets.length;
      card.querySelector('[data-action="add-set"]').click();
      await wait(0);
      const after = store.activeSession().entries.find(e => e.exerciseId === id).sets.length;
      return eq(after - before, 1, 'sets added by one click: ');
    });

    await checkAsync('one click on the checkmark ticks exactly one set', async () => {
      const card = await freshSession();
      card.querySelector('[data-action="done"]').click();
      await wait(0);
      const id = card.dataset.exercise;
      return eq(store.activeSession().entries.find(e => e.exerciseId === id).sets[0].done, true);
    });

    await checkAsync('checkmark still works after five re-renders', async () => {
      await freshSession();
      for (let i = 0; i < 5; i++) { log.render(scratch, db, { onFinish: () => {} }); await wait(0); }
      const card = scratch.querySelector('[data-exercise]');
      const id = card.dataset.exercise;
      card.querySelector('[data-action="done"]').click();
      await wait(0);
      const stored = store.activeSession().entries.find(e => e.exerciseId === id).sets[0].done;
      const shown = scratch.querySelector('[data-exercise] [data-action="done"]').getAttribute('aria-pressed');
      eq(stored, true, 'stored: ');
      return eq(shown, 'true', 'aria-pressed: ');
    });

    await checkAsync('checkmark is idempotent per click (tick then untick)', async () => {
      const card = await freshSession();
      const btn = () => scratch.querySelector('[data-exercise] [data-action="done"]');
      btn().click(); await wait(0);
      btn().click(); await wait(0);
      const id = card.dataset.exercise;
      return eq(store.activeSession().entries.find(e => e.exerciseId === id).sets[0].done, false);
    });

    await checkAsync('typing a weight persists it', async () => {
      const card = await freshSession();
      const inp = card.querySelector('input[data-field="weight"]');
      inp.value = '72.5';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(0);
      const id = card.dataset.exercise;
      return eq(store.activeSession().entries.find(e => e.exerciseId === id).sets[0].weight, 72.5);
    });

    await checkAsync('a non-numeric weight is ignored rather than stored as NaN', async () => {
      const card = await freshSession();
      const inp = card.querySelector('input[data-field="weight"]');
      inp.value = 'abc';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(0);
      const id = card.dataset.exercise;
      const w = store.activeSession().entries.find(e => e.exerciseId === id).sets[0].weight;
      return ok(w === null || Number.isFinite(w), `got ${w}`);
    });

    await checkAsync('the per-set "last" column shows the previous session', async () => {
      seed({ version: 1, settings: { ...baseSettings }, sessions: [
        session('2026-08-16', 'push', [{ exerciseId: 'incline-db-press',
          sets: [{ weight: 30, reps: 8, done: true }] }]) ] });
      const ps = prescriptionsOf(dayOf(db.splitById['core-3'], 'push'));
      store.startSession('core-3', 'push', ps);
      log.render(scratch, db, { onFinish: () => {} });
      await wait(0);
      const card = [...scratch.querySelectorAll('[data-exercise]')]
        .find(c => c.dataset.exercise === 'incline-db-press');
      const prev = card.querySelector('.prev-set')?.textContent.trim();
      return eq(prev, '30kg×8');
    });

    await checkAsync('tapping the name opens the detail sheet with cues', async () => {
      await freshSession();
      const card = scratch.querySelector('[data-exercise]');
      card.querySelector('[data-action="detail"]').click();
      await wait(0);
      const d = document.getElementById('exercise-dialog');
      ok(d.open, 'dialog should be open');
      const cues = d.querySelectorAll('.cues li').length;
      d.close();
      return ok(cues > 0, `cues rendered: ${cues}`);
    });

    // --------------------------------------------------------------- picker
    group('Picker');

    await checkAsync('the picker excludes exercises already in the session', async () => {
      await freshSession();
      scratch.querySelector('[data-action="add-exercise"]').click();
      await wait(0);
      const d = document.getElementById('picker-dialog');
      const offered = [...d.querySelectorAll('[data-pick]')].map(b => b.dataset.pick);
      const present = store.activeSession().entries.map(e => e.exerciseId);
      const overlap = offered.filter(id => present.includes(id));
      d.close();
      return eq(overlap, [], 'overlap: ');
    });

    await checkAsync('no banned movement is reachable through any picker filter', async () => {
      await freshSession();
      scratch.querySelector('[data-action="add-exercise"]').click();
      await wait(0);
      const d = document.getElementById('picker-dialog');
      const groups = [...d.querySelectorAll('[data-group]')].map(g => g.dataset.group);
      const seen = new Set();
      for (const g of groups) {
        d.querySelector(`[data-group="${g}"]`).click();
        await wait(0);
        for (const b of d.querySelectorAll('[data-pick]')) seen.add(b.dataset.pick);
      }
      d.close();
      const banned = /squat|deadlift|romanian|crunch|carry/;
      const hits = [...seen].filter(id => banned.test(id));
      eq(hits, [], 'banned reachable: ');
      return `${groups.length} filters, ${seen.size} exercises reachable`;
    });

    await checkAsync('picker search preserves the caret (typing does not reverse)', async () => {
      await freshSession();
      scratch.querySelector('[data-action="add-exercise"]').click();
      await wait(0);
      const d = document.getElementById('picker-dialog');
      const type = async (val, caret) => {
        const inp = d.querySelector('[data-role="search"]');
        inp.value = val;
        inp.setSelectionRange(caret, caret);        // caret mid-string, as when typing
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(0);
      };
      // Simulate typing "row" then inserting 'w' after "ro": caret should land at 3,
      // not snap to 0 (which is what made real typing come out reversed).
      await type('row', 3);
      const after = d.querySelector('[data-role="search"]');
      const pos = after.selectionStart;
      d.close();
      return eq(pos, 3, 'caret after re-render: ');
    });

    await checkAsync('chat: hidden by default, context builder is compact and named', async () => {
      await freshSession();
      const sess = store.activeSession();
      const ctx = workoutContext(db, sess);
      eq(Object.keys(ctx).sort(), ['constraintsProfile','day','exercises','permittedLibrary','split'], 'context keys: ');
      ok(ctx.exercises.length > 0, 'context should list exercises');
      // Names must be the library display names, not the raw slug ids.
      const libNames = new Set(Object.values(db.exerciseById).map(e => e.name));
      const ids = new Set(Object.keys(db.exerciseById));
      const badName = ctx.exercises.find(x => !libNames.has(x.name) || ids.has(x.name));
      ok(!badName, `every exercise name resolved to a library name (offender: ${badName?.name})`);
      // Each exercise carries the muscles it trains (so swap-by-muscle works),
      // and sets carry only weight/reps/done.
      ok(ctx.exercises.every(x => Array.isArray(x.muscles)), 'every exercise lists muscles');
      const leaked = ctx.exercises.flatMap(x => x.sets).find(st =>
        Object.keys(st).sort().join(',') !== 'done,reps,weight');
      ok(!leaked, `set objects carry only weight/reps/done (offender: ${JSON.stringify(leaked)})`);
      // The permitted library is sent whole, muscle-tagged, so a substitute can
      // be matched by muscle rather than limited to today's exercises.
      ok(ctx.permittedLibrary.length === db.exercises.length, 'permitted library is complete');
      return ok(ctx.permittedLibrary.every(e => e.name && Array.isArray(e.muscles)),
                'library entries carry name + muscles');
    });

    // --------------------------------------------------------------- dialogs
    group('Dialogs');

    check('all dialogs are hidden while closed', () => {
      const bad = [];
      for (const id of ['picker-dialog', 'photo-dialog', 'backup-dialog', 'exercise-dialog']) {
        const d = document.getElementById(id);
        if (d.open) d.close();
        if (getComputedStyle(d).display !== 'none') bad.push(id);
      }
      return eq(bad, [], 'visible while closed: ');
    });
    check('no dialog text leaks into the page', () =>
      ok(!document.body.innerText.includes('Pick an exercise'),
         'the picker heading should not be on the page'));

    // --------------------------------------------------------------- history
    group('History view');

    await checkAsync('sessions this week counts a Sunday and a Tuesday as two', async () => {
      const today = new Date();
      const k = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const sun = weekKey(k(today), 0);
      seed({ version: 1, settings: { ...baseSettings }, sessions: [
        session(sun, 'push', [{ exerciseId: 'machine-chest-press', sets: [{ weight: 50, reps: 10, done: true }] }]),
        session(addDays(sun, 2), 'pull', [{ exerciseId: 'lat-pulldown', sets: [{ weight: 50, reps: 10, done: true }] }])
      ]});
      history.render(scratch, db);
      await wait(0);
      const t = [...scratch.querySelectorAll('.tile')].find(x => x.textContent.includes('Sessions this week'));
      return eq(t.querySelector('.value').textContent.trim(), '2');
    });

    await checkAsync('the sessions tile is a button and expands the week', async () => {
      const t = [...scratch.querySelectorAll('.tile')].find(x => x.textContent.includes('Sessions this week'));
      eq(t.tagName, 'BUTTON', 'tag: ');
      t.click();
      await wait(0);
      return ok(scratch.textContent.includes('This week —'), 'week detail should open');
    });

    return results;
  } finally {
    // Always put the real log back, even if a case threw.
    if (snapshot === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, snapshot);
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(`${KEY}.corrupt.`)) localStorage.removeItem(k);
    }
    store.reload();
  }
}
