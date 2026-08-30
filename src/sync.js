// Cloud sync — Supabase auth + completed-session backup.
//
// Local-first: localStorage stays the write path and the app works signed-out
// exactly as before. Signing in adds a background push/pull of COMPLETED
// sessions only. Completed sessions are immutable in the app, so sync is a
// union by id — no conflict resolution, same semantics as import (merge).
// The in-progress session never leaves the device.

import * as store from './store.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

let client = null;
let lastError = null;
let syncing = false;
let lastSync = null;      // ISO string, this page load only
const listeners = new Set();

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }

/** The vendored UMD bundle defines window.supabase. If it failed to load,
 *  every entry point below degrades to "sync unavailable" instead of throwing. */
export function available() { return typeof window.supabase?.createClient === 'function'; }

export function init() {
  if (client || !available()) return;
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,   // completes the magic-link redirect
      flowType: 'pkce'
    }
  });

  client.auth.onAuthStateChange((event, session) => {
    emit();
    // SIGNED_IN fires when the magic link lands; INITIAL_SESSION on every later
    // page load of an already-signed-in device. Both should sync — otherwise a
    // device only picks up other devices' sessions after finishing a workout.
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
      syncNow().catch(() => {});
    }
  });

  // Push when a session completes. Fire-and-forget: a failure leaves the data
  // safely in localStorage and the next sync picks it up.
  store.subscribe((_state, reason) => {
    if (reason === 'session-finish' || reason === 'session-delete') syncNow().catch(() => {});
  });
}

/** The current access token, for authing calls to our own Worker. Null if
 *  signed out or the client didn't load. */
export async function accessToken() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function user() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

export function status() {
  return { available: available(), syncing, lastSync, lastError };
}

export async function signIn(email) {
  if (!client) throw new Error('Sync is unavailable — the client library did not load.');
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname }
  });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  if (!client) return;
  await client.auth.signOut();
  emit();
}

/** Push completed local sessions, pull everything, merge by id. */
export async function syncNow() {
  if (!client || syncing) return null;
  const u = await user();
  if (!u) return null;

  syncing = true; lastError = null; emit();
  try {
    // --- tombstones first. Sync is union-by-id and never removes, so a delete
    //     only sticks if it propagates: pull remote tombstones (purging any
    //     local copy), push ours, then hard-delete the actual cloud rows so a
    //     re-pull can't hand them back. Best-effort — if the deleted_sessions
    //     table isn't there yet (pre-migration), don't let it break the core
    //     session backup below; the delete is already applied locally and will
    //     propagate on a later sync once the table exists. ---
    try {
      const { data: remoteTombs, error: tSelErr } = await client
        .from('deleted_sessions').select('session_id');
      if (tSelErr) throw new Error(tSelErr.message);
      store.mergeTombstones((remoteTombs ?? []).map(r => r.session_id));

      const tombIds = store.getDeletedIds();
      if (tombIds.length) {
        const trows = tombIds.map(id => ({ user_id: u.id, session_id: id }));
        const { error: tUpErr } = await client.from('deleted_sessions')
          .upsert(trows, { onConflict: 'user_id,session_id', ignoreDuplicates: true });
        if (tUpErr) throw new Error(tUpErr.message);
        const { error: delErr } = await client.from('sessions')
          .delete().eq('user_id', u.id).in('id', tombIds);
        if (delErr) throw new Error(delErr.message);
      }
    } catch (err) {
      console.warn('Tombstone sync skipped:', err.message);
    }

    // --- push completed local sessions, minus anything tombstoned ---
    const tombSet = new Set(store.getDeletedIds());
    const completed = store.getSessions().filter(s => s.completedAt && !tombSet.has(s.id));
    if (completed.length) {
      const rows = completed.map(s => ({ user_id: u.id, id: s.id, payload: s }));
      const { error: upErr } = await client.from('sessions')
        .upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true });
      if (upErr) throw new Error(upErr.message);
    }

    const { data, error: selErr } = await client.from('sessions').select('payload');
    if (selErr) throw new Error(selErr.message);

    const result = store.mergeSessions((data ?? []).map(r => r.payload));
    lastSync = new Date().toISOString();
    return { pushed: completed.length, pulled: data?.length ?? 0, added: result.added };
  } catch (err) {
    lastError = err.message;
    throw err;
  } finally {
    syncing = false; emit();
  }
}
