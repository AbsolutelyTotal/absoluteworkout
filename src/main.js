// Bootstrap: load data, wire the tabs, own the backup dialog.

import { loadData } from './data.js';
import { html, mount, issuesBanner } from './ui.js';
import * as store from './store.js';
import * as plan from './views/plan.js';
import * as log from './views/log.js';
import * as history from './views/history.js';
import * as library from './views/library.js';
import { initPicker } from './views/picker.js';
import { initExerciseDetail } from './views/exercise-detail.js';

const VIEWS = {
  plan: (root, db) => plan.render(root, db, {
    onStartSession: startSession,
    onProfileChange: async (splitId) => {
      const changed = await ensureProfileFor(splitId);
      if (changed) show('plan');
      return changed;
    }
  }),
  log: (root, db) => log.render(root, db, { onFinish: () => show('history') }),
  history: (root, db) => history.render(root, db),
  library: (root, db) => library.render(root, db)
};

let db = null;
let current = 'plan';

const tabsEl = document.getElementById('tabs');
const viewEl = document.getElementById('view');
const bannerEl = document.getElementById('banner');

async function init() {
  try {
    // Boot on the profile of the remembered split, so the correct exercise
    // library is loaded before anything renders.
    db = await loadData(await profileIdForSplit(store.getSettings().activeSplitId));
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

  // Land on the session if one is open — that's where you'd want to be.
  if (store.activeSession()) current = 'log';
  show(current);

  store.subscribe((_state, reason) => {
    if (reason === 'save-failed') {
      alert('Could not save to this browser\'s storage. Export your log from the ⋯ menu before continuing.');
    }
    // Re-render the set counter in the tab strip without rebuilding the view,
    // so typing in an input doesn't lose focus.
    renderTabs();
  });

  renderTabs();
  wireBackup();
  wirePhotoLightbox();
  wireImageFallback();
  initPicker();
  initExerciseDetail();
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

/** Peek at splits.json for a remembered split's profile, before the full load
 *  decides which exercise library is permitted. */
async function profileIdForSplit(splitId) {
  try {
    const splits = await fetch('data/splits.json', { cache: 'no-store' }).then(r => r.json());
    return splits.find(s => s.id === splitId)?.profileId;
  } catch {
    return undefined;              // loadData then picks the most restrictive
  }
}

/**
 * A split on another profile permits a different exercise library, so switching
 * to one requires reloading the data — re-rendering alone would leave the old
 * library in memory, which for a restricted profile is the unsafe direction.
 */
async function ensureProfileFor(splitId) {
  const wanted = db.splitById[splitId]?.profileId;
  if (!wanted || wanted === db.profile?.id) return false;
  db = await loadData(wanted);
  mount(bannerEl, issuesBanner(db.issues));
  return true;
}

// Delegated so it survives every re-render, in any view.
function wirePhotoLightbox() {
  const dialog = document.getElementById('photo-dialog');
  const img = dialog.querySelector('img');
  const name = dialog.querySelector('[data-role="name"]');

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-photo]');
    if (btn) {
      img.src = btn.dataset.photo;
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

init();
