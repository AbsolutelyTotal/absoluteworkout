// Persistence. Logged sessions are the only data here that can't be regenerated
// from the JSON files, so: version the shape, migrate explicitly, and always
// offer an export.

const KEY = 'absoluteworkout.v1';
const VERSION = 1;

const DEFAULTS = {
  version: VERSION,
  settings: {
    activeSplitId: 'core-3',   // must match an id in data/splits.json
    unit: 'kg',
    // 0 = Sunday. Israel and the US start the week on Sunday; ISO/Europe on
    // Monday. This drives every weekly bucket in the History view.
    weekStartsOn: 0,
    defaultSetTarget: [10, 20]
  },
  sessions: []
};

let state = load();
const listeners = new Set();

function load() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Private browsing / storage disabled. Run in-memory rather than dying.
    return structuredClone(DEFAULTS);
  }
  if (!raw) return structuredClone(DEFAULTS);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt payload. Keep a copy under a dated key instead of overwriting it —
    // the user may be able to recover sets by hand.
    try { localStorage.setItem(`${KEY}.corrupt.${Date.now()}`, raw); } catch {}
    return structuredClone(DEFAULTS);
  }
  try {
    return migrate(parsed);
  } catch {
    // migrate() refuses data from a NEWER build. Don't let that throw at module
    // scope — it would abort the whole import graph and blank the app with no
    // way to export. Preserve the newer data under a dated key and boot fresh.
    try { localStorage.setItem(`${KEY}.future.${Date.now()}`, raw); } catch {}
    return structuredClone(DEFAULTS);
  }
}

// Add a case per version bump. Never reinterpret an old shape in place.
function migrate(data) {
  const v = data?.version ?? 0;
  if (v > VERSION) {
    // Written by a newer build. Don't downgrade — refuse and keep it intact.
    throw new Error(
      `Stored data is version ${v}, this build understands ${VERSION}. ` +
      `Update the app rather than losing the log.`
    );
  }
  if (v === VERSION) {
    return { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...data.settings } };
  }
  // v === 0: no stored data worth migrating yet.
  return structuredClone(DEFAULTS);
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    // Quota exceeded or storage blocked. Surface it — silent data loss is worse.
    console.error('Could not save. Export your log as a backup.', err);
    notify('save-failed');
    return false;
  }
  return true;
}

function notify(reason) {
  for (const fn of listeners) fn(state, reason);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-read from localStorage. Exists for the QA suite, which seeds state
 *  directly and needs the module to pick it up without a page reload. */
export function reload() {
  state = load();
  notify('reload');
  return state;
}

export const getState = () => state;
export const getSettings = () => state.settings;
export const getSessions = () => state.sessions;

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
  notify('settings');
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Local calendar date, not UTC — a 9pm workout must not land on tomorrow. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function activeSession() {
  return state.sessions.find(s => !s.completedAt) ?? null;
}

export function startSession(splitId, dayId, prescriptions) {
  const existing = activeSession();
  if (existing) return existing;

  const now = new Date();
  const session = {
    id: `${now.toISOString()}-${dayId}`,
    date: localDate(now),
    splitId,
    dayId,
    startedAt: now.toISOString(),
    entries: prescriptions.map(p => ({
      exerciseId: p.exerciseId,
      sets: Array.from({ length: p.sets }, () => ({ weight: null, reps: null, done: false }))
    }))
  };
  state.sessions.push(session);
  persist();
  notify('session-start');
  return session;
}

export function updateSet(sessionId, exerciseId, setIndex, patch) {
  const session = state.sessions.find(s => s.id === sessionId);
  const entry = session?.entries.find(e => e.exerciseId === exerciseId);
  if (!entry?.sets[setIndex]) return;
  Object.assign(entry.sets[setIndex], patch);
  persist();
  notify('set');
}

export function addSet(sessionId, exerciseId) {
  const session = state.sessions.find(s => s.id === sessionId);
  const entry = session?.entries.find(e => e.exerciseId === exerciseId);
  if (!entry) return;
  // Carry the last KNOWN weight forward, not the last array slot's — adding a
  // set before every prescribed row is filled would otherwise give a blank
  // field even though you've been lifting the same load all session.
  const carried = [...entry.sets].reverse().find(s => s.weight != null)?.weight ?? null;
  entry.sets.push({ weight: carried, reps: null, done: false });
  persist();
  notify('set');
}

/** Add an exercise mid-session. Only ids from the library are accepted by the
 *  caller, which is what keeps the L5-S1 constraints intact — the library is
 *  the safety filter, so anything pickable is permitted. */
export function addExercise(sessionId, exerciseId, sets = 3) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  if (session.entries.some(e => e.exerciseId === exerciseId)) return;   // already there
  session.entries.push({
    exerciseId,
    addedDuringSession: true,
    sets: Array.from({ length: sets }, () => ({ weight: null, reps: null, done: false }))
  });
  persist();
  notify('exercise-add');
}

/** Remove an exercise from the session. Refuses once sets are logged, so a
 *  mis-tap can't silently delete work. */
export function removeExercise(sessionId, exerciseId) {
  const session = state.sessions.find(s => s.id === sessionId);
  const entry = session?.entries.find(e => e.exerciseId === exerciseId);
  if (!entry) return { removed: false, reason: 'not-found' };
  if (entry.sets.some(s => s.done)) return { removed: false, reason: 'has-logged-sets' };
  session.entries = session.entries.filter(e => e !== entry);
  persist();
  notify('exercise-remove');
  return { removed: true };
}

export function substitute(sessionId, fromExerciseId, toExerciseId) {
  const session = state.sessions.find(s => s.id === sessionId);
  const entry = session?.entries.find(e => e.exerciseId === fromExerciseId);
  if (!entry) return;
  entry.substitutedFor = fromExerciseId;
  entry.exerciseId = toExerciseId;
  persist();
  notify('substitute');
}

/** Persist bodyweight / notes as they're typed. The Log view previously wrote
 *  these straight onto the session object with no persist(), so they survived
 *  only if a later set-tick happened to serialise state — losing them if the
 *  tab dropped first. Looked up by id, not a render-time capture, so it's safe
 *  after an import replaces state. */
export function updateSessionMeta(sessionId, patch) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  if ('bodyweight' in patch) session.bodyweight = patch.bodyweight;
  if ('notes' in patch) session.notes = patch.notes;
  persist();
}

export function finishSession(sessionId, { notes, bodyweight } = {}) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  session.completedAt = new Date().toISOString();
  if (notes) session.notes = notes;
  if (bodyweight != null) session.bodyweight = bodyweight;
  // Drop sets that were never performed so they don't skew volume.
  for (const entry of session.entries) {
    entry.sets = entry.sets.filter(s => s.done);
  }
  session.entries = session.entries.filter(e => e.sets.length > 0);
  persist();
  notify('session-finish');
}

export function discardSession(sessionId) {
  state.sessions = state.sessions.filter(s => s.id !== sessionId);
  persist();
  notify('session-discard');
}

/** Last completed sets for an exercise — powers the "last time" hint. */
export function lastPerformance(exerciseId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (!s.completedAt) continue;
    const entry = s.entries.find(e => e.exerciseId === exerciseId);
    if (entry?.sets.length) return { date: s.date, sets: entry.sets };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backup — localStorage is one cleared-cache away from gone
// ---------------------------------------------------------------------------

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

/**
 * A session is safe to admit only if the render paths can walk it without
 * throwing. Import files and synced jsonb rows are both attacker-shaped data
 * (a corrupt paste, or a row written by another/older client), and one bad
 * object reaching the Log view throws during boot — before the export dialog
 * is wired — which strands the log with no way out. So we validate at the door.
 *
 * `splitId`/`dayId` are checked for prototype-key strings too: `db.splitById`
 * is a plain object, so "__proto__"/"constructor" would resolve to a truthy
 * Object.prototype and then throw on `.days`.
 */
const BAD_KEY = new Set(['__proto__', 'constructor', 'prototype']);
export function isValidSession(s) {
  if (!s || typeof s !== 'object') return false;
  if (typeof s.id !== 'string' || !s.id) return false;
  if (typeof s.startedAt !== 'string' || !s.startedAt) return false;
  if (!Array.isArray(s.entries)) return false;
  for (const e of s.entries) {
    if (!e || typeof e !== 'object' || !Array.isArray(e.sets)) return false;
  }
  for (const k of ['splitId', 'dayId']) {
    if (s[k] != null && (typeof s[k] !== 'string' || BAD_KEY.has(s[k]))) return false;
  }
  return true;
}

/** Union by id — the same semantics as importJSON's merge path. Used by sync. */
export function mergeSessions(sessions) {
  const incoming = (sessions ?? []).filter(isValidSession);
  const seen = new Set(state.sessions.map(s => s.id));
  const added = incoming.filter(s => !seen.has(s.id));
  if (added.length) {
    // Plain `<` on ISO strings, not localeCompare: it sorts identically, is far
    // faster, and — unlike a method call on a field — can't throw. (Invalid
    // rows, including any without startedAt, are already filtered out above.)
    state.sessions = [...state.sessions, ...added].sort((a, b) =>
      a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0);
    persist();
    notify('import');
  }
  // skipped counts everything not added: duplicates AND malformed rows.
  return { added: added.length, skipped: (sessions?.length ?? 0) - added.length };
}

export function importJSON(text, { merge = true } = {}) {
  const incoming = migrate(JSON.parse(text));
  if (merge) return mergeSessions(incoming.sessions);
  // Replace mode: keep only sessions the app can render, so a hand-edited file
  // can't wholesale-replace the log with something that bricks on next boot.
  incoming.sessions = (incoming.sessions ?? []).filter(isValidSession);
  state = incoming;
  persist();
  notify('import');
  return { added: incoming.sessions.length, skipped: 0 };
}
