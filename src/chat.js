// Client side of the in-gym AI chat. Talks only to our own Cloudflare Worker
// (worker/), which holds the model key and injects the safety constraints —
// nothing here knows about any LLM. Fails closed: no configured URL, or signed
// out, and the caller simply doesn't show the chat bar.

import { WORKOUT_CHAT_URL } from './supabase-config.js';
import { accessToken } from './sync.js';

export function chatConfigured() {
  return typeof WORKOUT_CHAT_URL === 'string' && WORKOUT_CHAT_URL.length > 0;
}

/** Compact the session into the few-KB context the Worker expects. Only what's
 *  useful for a question — not the whole app state. */
export function workoutContext(db, session) {
  const nameOf = (id) => db.exerciseById[id]?.name ?? id;
  const split = db.splitById[session.splitId];
  const day = (split?.days ?? []).find(d => d.id === session.dayId);
  return {
    split: split?.name ?? session.splitId,
    day: day?.name ?? session.dayId,
    constraintsProfile: db.profile?.name ?? db.profile?.id,
    exercises: (session.entries ?? []).map(e => ({
      name: nameOf(e.substitutedFor ?? e.exerciseId),
      sets: (e.sets ?? []).map(s => ({ weight: s.weight, reps: s.reps, done: s.done }))
    }))
  };
}

/** Ask the Worker. Throws with a human-readable message on any failure. */
export async function askWorkoutChat({ question, workout, profileId, signal }) {
  if (!chatConfigured()) throw new Error("Chat isn't set up yet.");
  const token = await accessToken();
  if (!token) throw new Error('Sign in (⤓ menu) to use chat.');

  let r;
  try {
    r = await fetch(WORKOUT_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ question, workout, profileId }),
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
