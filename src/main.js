// Bootstrap: load data, wire the tabs, own the backup dialog.

import { loadData, withUserPlans } from './data.js';
import { html, mount, issuesBanner, safeImagePath } from './ui.js';
import * as store from './store.js';
import * as plan from './views/plan.js';
import * as log from './views/log.js';
import * as history from './views/history.js';
import * as library from './views/library.js';
import { initPicker } from './views/picker.js';
import { initExerciseDetail } from './views/exercise-detail.js';
import { initChatBubble } from './views/chat-bubble.js';
import * as sync from './sync.js';

const VIEWS = {
  plan: (root, db) => plan.render(root, db, { onStartSession: startSession }),
  log: (root, db) => log.render(root, db, { onFinish: () => show('history') }),
  history: (root, db) => history.render(root, db),
  library: (root, db) => library.render(root, db)
};

let db = null;
let current = 'plan';

const tabsEl = document.getElementById('tabs');
const viewEl = document.getElementById('view');
const bannerEl = document.getElementById('banner');

let appStarted = false;
async function startApp() {
  if (appStarted) return;
  appStarted = true;
  document.body.classList.remove('gated');
  try {
    // Boot fail-closed on the mirrored per-user profile (defaults to the
    // restrictive l5s1 until the authoritative value is confirmed below), so a
    // restricted user never briefly loads the extended library.
    db = await loadData(store.getSettings().profileId);
    // Fold in the user's own plans (validated, non-deleted) so they show and
    // behave like the built-in splits.
    db = withUserPlans(db, store.getLivePlans());
  } catch (err) {
    mount(viewEl, html`<div class="banner warn">
      <span class="icon">!</span>
      <div>
        <strong>Couldn't load the data files.</strong>
        This page has to be served over HTTP — ES modules and fetch both refuse
        <code>file://</code>. From the project root run
        <code>python3 -m http.server 8080</code> and open
        <code>http://localhost:8080</code>.
        <div style="margin-top:6px;opacity:0.8">${String(err.message ?? err)}</div>
      </div>
    </div>`);
    return;
  }

  mount(bannerEl, issuesBanner(db.issues));

  store.subscribe((_state, reason) => {
    if (reason === 'save-failed') {
      alert('Could not save to this browser\'s storage. Export your log from the ⋯ menu before continuing.');
    }
    // Re-render the set counter in the tab strip without rebuilding the view,
    // so typing in an input doesn't lose focus.
    renderTabs();
  });

  // Wire the chrome — export/import above all — BEFORE the first view render.
  // If a view ever throws while rendering (e.g. a malformed session that got
  // past the guards), the export dialog must still be reachable so the log can
  // be rescued. Wiring after render was how a bad session bricked the app.
  renderTabs();
  wireBackup();
  wireAccount();
  wirePhotoLightbox();
  wireImageFallback();
  initPicker();
  initExerciseDetail();
  // Global chat bubble — reads the live current tab + db at send time, so each
  // question carries context for whatever screen the user is on.
  initChatBubble({ getView: () => current, getDb: () => db });
  sync.init();
  // Confirm the authoritative per-user constraint profile and reload the library
  // if it differs from the fail-closed boot assumption.
  resolveUserProfile();

  // Land on the session if one is open — that's where you'd want to be.
  if (store.activeSession()) current = 'log';
  try {
    show(current);
  } catch (err) {
    console.error('View render failed', err);
    mount(viewEl, html`<div class="banner warn">
      <span class="icon">!</span>
      <div>
        <strong>Something went wrong rendering this view.</strong>
        Your log is safe — open the ⤓ menu to export a backup, then reload.
        <div style="margin-top:6px;opacity:0.8">${String(err.message ?? err)}</div>
      </div>
    </div>`);
  }
}

/**
 * An `image` path that 404s must not leave a broken-image glyph in the row.
 * Falls the whole photo button back to nothing, so the layout stays clean and
 * the exercise still reads by name.
 *
 * Uses a capture-phase listener rather than an inline onerror: `error` does not
 * bubble, and ui.js's scrub() strips on* attributes by design.
 */
function wireImageFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.dataset.failed) return;
    img.dataset.failed = '1';
    const holder = img.closest('.ex-photo');
    if (holder) {
      holder.remove();
      console.warn(`Missing image, falling back: ${img.getAttribute('src')}`);
    }
  }, true);
}

/**
 * The constraint profile is per-USER now (Supabase profiles.profile_id), not
 * per-split. Boot loads the library fail-closed on the mirrored profile; this
 * confirms the authoritative one and, only if it differs, reloads the correct
 * library. The generation guard means a slow reload can't land after a newer
 * one — loading the extended set under a restricted profile is the one unsafe
 * direction the whole model exists to prevent.
 */
let loadSeq = 0;
async function resolveUserProfile() {
  const wanted = await sync.loadUserProfile();
  if (!wanted || wanted === db.profile?.id) return;   // unknown → keep restrictive; already correct → nothing to do
  const seq = ++loadSeq;
  let next;
  try {
    next = await loadData(wanted);
  } catch {
    return;   // couldn't reload — stay on the fail-closed library already in memory
  }
  if (seq !== loadSeq) return;
  db = withUserPlans(next, store.getLivePlans());
  mount(bannerEl, issuesBanner(db.issues));
  show(current);   // repaint with the confirmed library
}

// Delegated so it survives every re-render, in any view.
function wirePhotoLightbox() {
  const dialog = document.getElementById('photo-dialog');
  const img = dialog.querySelector('img');
  const name = dialog.querySelector('[data-role="name"]');

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-photo]');
    if (btn) {
      const path = safeImagePath(btn.dataset.photo);
      if (!path) return;                 // never fetch an off-origin/rejected path
      img.src = path;
      name.textContent = btn.dataset.photoName ?? '';
      dialog.showModal();
      return;
    }
    // Click anywhere outside the figure closes it.
    if (dialog.open && e.target === dialog) dialog.close();
  });
}

function renderTabs() {
  const active = store.activeSession();
  const tabs = [
    ['plan', 'Plan'],
    ['log', active ? 'Log ●' : 'Log'],
    ['history', 'History'],
    ['library', 'Library']
  ];
  mount(tabsEl, html`${tabs.map(([id, label]) =>
    html`<button type="button" data-tab="${id}" role="tab"
                 aria-selected="${String(id === current)}">${label}</button>`
  )}`);
}

function show(name) {
  current = name;
  renderTabs();
  VIEWS[name](viewEl, db);
  window.scrollTo({ top: 0 });
}

function startSession(splitId, dayId, prescriptions) {
  store.startSession(splitId, dayId, prescriptions);
  show('log');
}

tabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) show(btn.dataset.tab);
});

// --- Backup ---------------------------------------------------------------
// localStorage is one cleared-cache from gone, and the log is the only data
// here that can't be regenerated from data/.

function wireBackup() {
  const dialog = document.getElementById('backup-dialog');
  const textarea = dialog.querySelector('textarea');

  document.getElementById('backup-btn').addEventListener('click', () => {
    textarea.value = store.exportJSON();
    dialog.showModal();
    // showModal autofocuses the textarea, and focus puts the caret at the end
    // of its value — so the dialog opened scrolled to the tail of the JSON.
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
  });

  dialog.querySelector('[data-action="download"]').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `absoluteworkout-${store.localDate()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  dialog.querySelector('[data-action="import"]').addEventListener('click', () => {
    try {
      const { added, skipped } = store.importJSON(textarea.value, { merge: true });
      alert(`Imported ${added} session${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} already present` : ''}.`);
      dialog.close();
      show(current);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());
}

// --- Account: app-bar chip + its own dialog ---------------------------------
// The chip's dot mirrors auth/sync state at a glance; the words live in the
// dialog. Sign-out stays here too — rare actions don't earn app-bar space.

function wireAccount() {
  const dialog = document.getElementById('account-dialog');
  const chip = document.getElementById('account-btn');
  const dot = chip.querySelector('[data-role="sync-dot"]');
  const accountBody = dialog.querySelector('[data-role="account-body"]');

  async function renderChip() {
    const { syncing, lastError } = sync.status();
    const u = sync.available() ? await sync.user() : null;
    dot.hidden = false;
    dot.className = 'sync-dot'
      + (u ? ' on' : '')
      + (syncing ? ' busy' : '')
      + (lastError ? ' err' : '');
    chip.title = !sync.available() ? 'Cloud sync unavailable'
      : lastError ? `Sync error — tap for details`
      : syncing ? 'Syncing…'
      : u ? `Signed in as ${u.email}`
      : 'Cloud sync — signed out';
    chip.setAttribute('aria-label', chip.title);
  }

  async function renderAccount() {
    if (!sync.available()) {
      mount(accountBody, html`<div class="note">Sync unavailable — the client library didn't load.</div>`);
      return;
    }
    const u = await sync.user();
    const { syncing, lastSync, lastError } = sync.status();

    mount(accountBody, u
      ? html`
        <div class="note">${`Signed in as ${u.email}. Completed sessions back up automatically; the in-progress session stays on this device.`}</div>
        ${lastError ? html`<div class="limit" style="margin-top:8px">${`⚠ ${lastError}`}</div>` : ''}
        ${lastSync ? html`<div class="note" style="margin-top:6px">${`Last sync ${new Date(lastSync).toLocaleTimeString()}`}</div>` : ''}
        <div class="dialog-actions" style="margin-top:10px">
          <button class="btn" data-action="signout" type="button">Sign out</button>
          <button class="btn primary" data-action="sync" type="button" ${syncing ? 'disabled' : ''}>
            ${syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>`
      : html`
        <div class="note">Optional. Sign in to back up completed sessions and share history between devices.</div>
        ${lastError ? html`<div class="limit" style="margin-top:8px">${`⚠ ${lastError}`}</div>` : ''}
        <form data-role="signin" style="margin-top:10px">
          <input class="field" name="email" type="email" required autocomplete="email"
                 placeholder="you@example.com" aria-label="Email for login link">
          <div class="dialog-actions" style="margin-top:10px">
            <button class="btn primary" type="submit">Send login link</button>
          </div>
        </form>`);

    accountBody.querySelector('[data-role="signin"]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = new FormData(e.target).get('email');
      try {
        await sync.signIn(email);
        mount(accountBody, html`<div class="note">${`Login link sent to ${email}. Open it on this device.`}</div>`);
      } catch (err) {
        alert(`Could not send the link: ${err.message}`);
      }
    });
    accountBody.querySelector('[data-action="signout"]')?.addEventListener('click', async () => {
      await sync.signOut();
      renderAccount();
    });
    accountBody.querySelector('[data-action="sync"]')?.addEventListener('click', async () => {
      try {
        const r = await sync.syncNow();
        if (r) alert(`Synced. ${r.added} new session${r.added === 1 ? '' : 's'} pulled down.`);
        show(current);
      } catch (err) {
        alert(`Sync failed: ${err.message}`);
      } finally {
        renderAccount();
      }
    });
  }

  chip.addEventListener('click', () => { renderAccount(); dialog.showModal(); });
  dialog.querySelector('[data-action="close-account"]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  sync.onChange(() => { renderChip(); if (dialog.open) renderAccount(); });
  renderChip();
}


// ---------------------------------------------------------------------------
// Login gate (soft). No session => the app isn't started; only the gate shows.
// A signed-in device keeps its session (persisted), so it still works offline —
// only signed-out/new devices hit the wall. Fails closed: if the auth library
// didn't load, stay gated with a retry rather than exposing the app.
// ---------------------------------------------------------------------------

function showGate(message) {
  const gate = document.getElementById('auth-gate');
  const statusEl = gate.querySelector('[data-role="gate-status"]');
  const form = gate.querySelector('[data-role="gate-form"]');
  document.body.classList.add('gated');
  gate.hidden = false;

  if (message) { statusEl.textContent = message; return; }

  if (!form.dataset.wired) {
    form.dataset.wired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = new FormData(form).get('email');
      statusEl.textContent = 'Sending…';
      try {
        await sync.signIn(email);
        form.hidden = true;
        statusEl.textContent = `Sign-in link sent to ${email}. Open it on this device to continue.`;
      } catch (err) {
        statusEl.textContent = `Could not send the link: ${err.message ?? err}`;
      }
    });
  }
}

// Register the service worker (offline + always-fresh-online). Independent of
// auth, best-effort: a failure just means no offline, never a broken app. We do
// NOT force a reload when a new worker takes over — a reload mid-set would lose
// the user's place; network-first already keeps content current.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

async function boot() {
  registerServiceWorker();
  sync.init();
  if (!sync.available()) {
    // Auth library failed to load — do not expose the app. Offer a reload.
    showGate('Sign-in is unavailable (the auth library did not load). Reload to try again.');
    return;
  }
  const signedIn = !!(await sync.user());
  if (signedIn) await startApp();
  else showGate();

  // React to later auth changes: a landing magic link starts the app; a
  // sign-out reloads to the gate (clean teardown of a running app).
  sync.onChange(async () => {
    const nowIn = !!(await sync.user());
    if (nowIn && !appStarted) {
      document.getElementById('auth-gate').hidden = true;
      await startApp();
    } else if (!nowIn && appStarted) {
      location.reload();
    }
  });
}

boot();
