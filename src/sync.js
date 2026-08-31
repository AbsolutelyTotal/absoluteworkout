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
    if (reason === 'session-finish' || reason === 'session-delete' || reason === 'plan-change') {
      syncNow().catch(() => {});
    }
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

let userProfileId = null;   // authoritative constraint profile, once fetched
export function cachedProfileId() { return userProfileId; }

/** Set the user's constraint profile (their own choice). Upserts the row with a
 *  fresh updated_at (LWW) and mirrors it locally. Adding restriction is always
 *  the safe direction; only the user can loosen their own. */
export async function setProfile(profileId) {
  if (!client) throw new Error('Sync is unavailable.');
  const u = await user();
  if (!u) throw new Error('Sign in to change this.');
  const { error } = await client.from('profiles')
    .upsert({ user_id: u.id, profile_id: profileId, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  userProfileId = profileId;
  store.updateSettings({ profileId });
}

/** Fetch (or create) the signed-in user's constraint profile row and mirror it
 *  into local settings for offline boot. Returns the profile_id, or null if it
 *  couldn't be determined (caller stays on the fail-closed restrictive default).
 *  New users get 'unrestricted'; existing users were backfilled to l5s1 in the
 *  0003 migration, so this NEVER downgrades a restricted user. */
export async function loadUserProfile() {
  if (!client) return null;
  const u = await user();
  if (!u) return null;
  try {
    const { data, error } = await client.from('profiles')
      .select('profile_id, starters_seeded').eq('user_id', u.id).maybeSingle();
    if (error) throw new Error(error.message);
    let pid = data?.profile_id;
    if (!pid) {                                   // genuinely new user → create the row
      pid = 'unrestricted';
      const { error: insErr } = await client.from('profiles')
        .insert({ user_id: u.id, profile_id: pid, updated_at: new Date().toISOString() });
      if (insErr) throw new Error(insErr.message);
    }
    userProfileId = pid;
    store.updateSettings({ profileId: pid });     // mirror for offline/next boot
    return pid;
  } catch (err) {
    console.warn('Profile load skipped:', err.message);
    return null;
  }
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

    // --- plans: mutable, so last-write-wins by updatedAt. Pull first (the merge
    //     makes local the newest per id), then push local so remote converges
    //     too. A soft-deleted plan (deleted:true, newer updatedAt) rides along
    //     and propagates the removal. Best-effort like the tombstones, so a
    //     missing table can't break the core session backup below. ---
    try {
      const { data: remotePlans, error: pSelErr } = await client
        .from('custom_plans').select('payload');
      if (pSelErr) throw new Error(pSelErr.message);
      store.mergePlans((remotePlans ?? []).map(r => r.payload));

      const localPlans = store.getPlans();
      if (localPlans.length) {
        const prows = localPlans.map(p => ({
          user_id: u.id, id: p.id, payload: p,
          updated_at: p.updatedAt, deleted: !!p.deleted
        }));
        const { error: pUpErr } = await client.from('custom_plans')
          .upsert(prows, { onConflict: 'user_id,id' });   // replace on conflict = LWW push
        if (pUpErr) throw new Error(pUpErr.message);
      }
    } catch (err) {
      console.warn('Plan sync skipped:', err.message);
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
