// Client side of the AI chat. Talks only to our own Cloudflare Worker (worker/),
// which holds the model key and injects the safety constraints — nothing here
// knows about any LLM. Fails closed: no configured URL, or signed out, and the
// caller simply doesn't show the chat.
//
// The chat is a global bubble available on every tab, so the context sent with
// each question is built for whatever screen the user is on (contextFor).

import { WORKOUT_CHAT_URL } from './supabase-config.js';
import { accessToken } from './sync.js';
import * as store from './store.js';
import { suggestNextDay, dayOf, prescriptionsOf, personalRecords, weekStreak } from './data.js';

export function chatConfigured() {
  return typeof WORKOUT_CHAT_URL === 'string' && WORKOUT_CHAT_URL.length > 0;
}

const nameOf = (db, id) => db.exerciseById[id]?.name ?? id;
const musclesOf = (db, id) => (db.exerciseById[id]?.primaryMuscles ?? []).map(m => db.muscleById[m]?.name ?? m);

/** The permitted (already constraint-filtered) library. A substitute must come
 *  from here — that's what keeps swaps safe AND muscle-matched. */
const permittedLibrary = (db) => (db.exercises ?? []).map(e => ({
  name: e.name,
  muscles: (e.primaryMuscles ?? []).map(m => db.muscleById[m]?.name ?? m),
  equipment: e.equipment ?? []
}));

/** Compact the in-progress session into the few-KB context the Worker expects. */
export function workoutContext(db, session) {
  const split = db.splitById[session.splitId];
  const day = (split?.days ?? []).find(d => d.id === session.dayId);
  return {
    split: split?.name ?? session.splitId,
    day: day?.name ?? session.dayId,
    constraintsProfile: db.profile?.name ?? db.profile?.id,
    // Today's exercises WITH the muscles they train — so a swap question is
    // answered by matching muscles, not by grabbing another same-day row.
    exercises: (session.entries ?? []).map(e => {
      const id = e.substitutedFor ?? e.exerciseId;
      return { name: nameOf(db, id), muscles: musclesOf(db, id),
               sets: (e.sets ?? []).map(s => ({ weight: s.weight, reps: s.reps, done: s.done })) };
    }),
    permittedLibrary: permittedLibrary(db)
  };
}

/** Today's plan for the active split (next day in the rotation). */
function planContext(db) {
  const split = db.splitById[store.getSettings().activeSplitId] ?? db.splits[0];
  const day = dayOf(split, suggestNextDay(split, store.getSessions()));
  return {
    split: split?.name,
    day: day?.name,
    exercises: (day ? prescriptionsOf(day) : []).map(p => ({
      name: nameOf(db, p.exerciseId), muscles: musclesOf(db, p.exerciseId),
      sets: p.sets, reps: p.reps
    }))
  };
}

/** A compact training-history summary — aggregates, never raw sessions, so it
 *  stays well under the Worker's context cap. */
function historyContext(db) {
  const sessions = store.getSessions().filter(s => s.completedAt);
  const startsOn = store.getSettings().weekStartsOn ?? 0;
  return {
    totalSessions: sessions.length,
    weekStreak: weekStreak(sessions, startsOn),
    recent: sessions.slice(-8).map(s => ({
      date: s.date,
      day: db.splitById[s.splitId]?.days.find(d => d.id === s.dayId)?.name ?? s.dayId,
      sets: (s.entries ?? []).reduce((a, e) => a + (e.sets?.length ?? 0), 0)
    })),
    // personalRecords returns an object keyed by exerciseId — take entries.
    prs: Object.entries(personalRecords(sessions)).slice(0, 12).map(([id, pr]) => ({
      exercise: nameOf(db, id), e1rm: Math.round(pr.e1rm)
    }))
  };
}

/** Build the context for whichever tab the user is on. Every view carries the
 *  permitted library (swaps/recommendations are useful everywhere). */
export function contextFor(view, db) {
  if (view === 'log') {
    const s = store.activeSession();
    if (s) return { view, ...workoutContext(db, s) };
  }
  const base = { view, constraintsProfile: db.profile?.name ?? db.profile?.id, permittedLibrary: permittedLibrary(db) };
  if (view === 'plan') return { ...base, plan: planContext(db) };
  if (view === 'history') return { ...base, history: historyContext(db) };
  return base;   // library (and anything else): view + permitted library
}

/** Ask the Worker. Throws with a human-readable message on any failure. */
export async function askChat({ question, context, profileId, history, signal }) {
  if (!chatConfigured()) throw new Error("Chat isn't set up yet.");
  const token = await accessToken();
  if (!token) throw new Error('Sign in to use chat.');

  let r;
  try {
    r = await fetch(WORKOUT_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question, context, profileId, history }),
      signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;   // caller ignores aborted requests
    throw new Error('Could not reach the chat service.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Chat error (${r.status}).`);
  return (data.answer || '').trim();
}
