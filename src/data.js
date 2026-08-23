// Loads the JSON files, indexes them, and derives the cross-references the
// views need. All read-only — nothing here touches stored state.

/**
 * Loads the data set for one constraint profile.
 *
 * Safety design: this filters by *loading*, not by filtering. The extended
 * library — squats, deadlifts, RDLs, standing presses, anything a restricted
 * profile bans — is only fetched when the profile explicitly allows it. So for
 * the l5s1 profile those exercises never enter memory at all, and every
 * downstream consumer (picker, alternatives, swap, Library) is safe without
 * knowing profiles exist.
 *
 * A tagged single library filtered at render time would be the obvious
 * alternative, but it inverts the guarantee: safety would depend on the filter
 * being correct everywhere, and one missed call site offers you an RDL. This
 * way the worst case of a bug is a missing exercise, not a contraindicated one.
 */
export async function loadData(profileId) {
  const noCache = { cache: 'no-store' };
  const get = (path) => fetch(path, noCache).then(r => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  });

  const [muscles, baseExercises, splits, profiles] = await Promise.all([
    get('data/muscles.json'),
    get('data/exercises.json'),
    get('data/splits.json'),
    get('data/profiles.json')
  ]);

  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]));
  const requested = profileId ?? splits[0]?.profileId;
  const profile = profileById[requested] ?? profiles[0] ?? null;

  // Absent or unknown profile => most restrictive. Never open by default.
  let exercises = baseExercises;
  if (profile?.allowExtendedLibrary === true) {
    const extended = await get('data/exercises-extended.json').catch(() => []);
    const seen = new Set(baseExercises.map(e => e.id));
    exercises = [...baseExercises, ...extended.filter(e => !seen.has(e.id))];
  }

  const db = {
    muscles,
    exercises,
    splits,
    profiles,
    profile,
    profileById,
    muscleById: Object.fromEntries(muscles.map(m => [m.id, m])),
    exerciseById: Object.fromEntries(exercises.map(e => [e.id, e])),
    splitById: Object.fromEntries(splits.map(s => [s.id, s]))
  };

  db.issues = validate(db);
  return db;
}

/** The profile a split runs under, defaulting to the most restrictive. */
export function profileOfSplit(db, split) {
  return db.profileById[split?.profileId] ?? db.profiles?.[0] ?? null;
}

/** Splits visible under a profile — a split belongs to exactly one. */
export function splitsForProfile(db, profileId) {
  return db.splits.filter(s => (s.profileId ?? db.profiles?.[0]?.id) === profileId);
}

/** Dangling ids are the failure mode of hand-curated cross-referenced JSON.
 *  Surfaced in the UI rather than thrown, so a typo doesn't blank the app. */
function validate(db) {
  const issues = [];

  for (const ex of db.exercises) {
    for (const id of [...(ex.primaryMuscles ?? []), ...(ex.secondaryMuscles ?? [])]) {
      if (!db.muscleById[id]) issues.push(`exercise "${ex.id}" → unknown muscle "${id}"`);
    }
    for (const id of ex.alternatives ?? []) {
      if (!db.exerciseById[id]) issues.push(`exercise "${ex.id}" → unknown alternative "${id}"`);
    }
    if (!ex.primaryMuscles?.length) issues.push(`exercise "${ex.id}" has no primaryMuscles`);
  }

  const norm = (t) => (t ?? '').toLowerCase().split(/\s+/).join(' ').replace(/\.$/, '');

  for (const split of db.splits) {
    if (split.profileId && !db.profileById?.[split.profileId]) {
      issues.push(`split "${split.id}" → unknown profileId "${split.profileId}"`);
    }
    const dayIds = new Set(split.days.map(d => d.id));
    for (const id of split.cycle) {
      if (!dayIds.has(id)) issues.push(`split "${split.id}" cycle → unknown day "${id}"`);
    }
    for (const day of split.days) {
      for (const p of prescriptionsOf(day)) {
        if (!db.exerciseById[p.exerciseId]) {
          issues.push(`split "${split.id}"/${day.id} → unknown exercise "${p.exerciseId}"`);
        }
        if (p.supersetWith && !db.exerciseById[p.supersetWith]) {
          issues.push(`split "${split.id}"/${day.id} → unknown supersetWith "${p.supersetWith}"`);
        }
        // A prescription note repeating the exercise's own setupNotes or a cue
        // renders the same sentence twice in the session view.
        const ex = db.exerciseById[p.exerciseId];
        if (p.notes && ex) {
          const n = norm(p.notes);
          if (n === norm(ex.setupNotes) || (ex.cues ?? []).some(c => norm(c) === n)) {
            issues.push(
              `split "${split.id}"/${day.id} → note on "${p.exerciseId}" duplicates its own text`
            );
          }
        }
      }
    }
  }
  return issues;
}

/** Flattens a day's blocks into a single ordered prescription list. */
export function prescriptionsOf(day) {
  return (day.blocks ?? []).flatMap(b => b.items ?? []);
}

export function dayOf(split, dayId) {
  return split.days.find(d => d.id === dayId) ?? null;
}

// ---------------------------------------------------------------------------
// Volume accounting
// ---------------------------------------------------------------------------

// Primary movers get a full set, secondary a half — the conventional way to
// count indirect work without ignoring it.
const PRIMARY_WEIGHT = 1.0;
const SECONDARY_WEIGHT = 0.5;

/** Planned weekly sets per muscle id for a split, assuming the full cycle is
 *  completed once per week. Answers "does this split actually hit rear delts?". */
export function plannedWeeklySets(db, split) {
  const totals = {};
  for (const dayId of split.cycle) {
    const day = dayOf(split, dayId);
    if (!day) continue;
    for (const p of prescriptionsOf(day)) {
      addSetsToMuscles(db, totals, p.exerciseId, p.sets);
    }
  }
  return totals;
}

/** Completed sets per muscle id across the given sessions. */
export function actualSets(db, sessions) {
  const totals = {};
  for (const session of sessions) {
    for (const entry of session.entries) {
      const done = entry.sets.filter(s => s.done).length;
      if (done) addSetsToMuscles(db, totals, entry.exerciseId, done);
    }
  }
  return totals;
}

function addSetsToMuscles(db, totals, exerciseId, sets) {
  const ex = db.exerciseById[exerciseId];
  if (!ex) return;
  for (const id of ex.primaryMuscles ?? []) {
    totals[id] = (totals[id] ?? 0) + sets * PRIMARY_WEIGHT;
  }
  for (const id of ex.secondaryMuscles ?? []) {
    totals[id] = (totals[id] ?? 0) + sets * SECONDARY_WEIGHT;
  }
}

/** Rolls muscle-level totals up to MuscleGroup level. */
export function byGroup(db, perMuscle) {
  const totals = {};
  for (const [id, sets] of Object.entries(perMuscle)) {
    const group = db.muscleById[id]?.group;
    if (group) totals[group] = (totals[group] ?? 0) + sets;
  }
  return totals;
}

/** Which days of which splits train this exercise — the reverse cross-reference. */
export function daysTraining(db, exerciseId) {
  const out = [];
  for (const split of db.splits) {
    for (const day of split.days) {
      const p = prescriptionsOf(day).find(x => x.exerciseId === exerciseId);
      if (p) out.push({ split, day, prescription: p });
    }
  }
  return out;
}

/** Which exercises hit this muscle, split by primary vs secondary. */
export function exercisesForMuscle(db, muscleId) {
  return {
    primary: db.exercises.filter(e => e.primaryMuscles?.includes(muscleId)),
    secondary: db.exercises.filter(e => e.secondaryMuscles?.includes(muscleId))
  };
}

// ---------------------------------------------------------------------------
// Weeks, tonnage, PRs
// ---------------------------------------------------------------------------

/** ISO week key, e.g. "2026-W34". Monday-based, matching how weekly volume
 *  targets are conventionally read. */
export function weekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = (d.getDay() + 6) % 7;          // Mon = 0
  d.setDate(d.getDate() - day + 3);          // nearest Thursday
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const fday = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fday + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function groupByWeek(sessions) {
  const weeks = new Map();
  for (const s of sessions) {
    const k = weekKey(s.date);
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k).push(s);
  }
  return weeks;
}

/** Sum of weight x reps over completed sets. Unit-agnostic — it's whatever
 *  Settings.unit says, so never mix a kg log with an lb one. */
export function tonnage(sessions) {
  let total = 0;
  for (const s of sessions) {
    for (const e of s.entries) {
      for (const set of e.sets) {
        if (set.done && set.weight && set.reps) total += set.weight * set.reps;
      }
    }
  }
  return total;
}

/** Epley estimate. Only meaningful in the 1-12 rep range; above that it
 *  overstates, so the UI labels it an estimate. */
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Best e1RM per exercise, with the set that produced it. */
export function personalRecords(sessions) {
  const best = {};
  for (const s of sessions) {
    if (!s.completedAt) continue;
    for (const e of s.entries) {
      for (const set of e.sets) {
        if (!set.done || !set.weight || !set.reps) continue;
        const est = e1rm(set.weight, set.reps);
        if (!best[e.exerciseId] || est > best[e.exerciseId].e1rm) {
          best[e.exerciseId] = { e1rm: est, weight: set.weight, reps: set.reps, date: s.date };
        }
      }
    }
  }
  return best;
}

/** Consecutive weeks (ending with the current one) containing >= 1 session. */
export function weekStreak(sessions) {
  const weeks = new Set([...groupByWeek(sessions.filter(s => s.completedAt)).keys()]);
  if (!weeks.size) return 0;
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const k = weekKey(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    );
    if (!weeks.has(k)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/** Next day in the rotation after the last completed session. */
export function suggestNextDay(split, sessions) {
  const last = [...sessions].reverse().find(s => s.completedAt && s.splitId === split.id);
  if (!last) return split.cycle[0];
  const i = split.cycle.indexOf(last.dayId);
  return split.cycle[(i + 1) % split.cycle.length];
}
