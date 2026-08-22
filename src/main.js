// Bootstrap: load data, wire the tabs, own the backup dialog.

import { loadData } from './data.js';
import { html, mount, issuesBanner } from './ui.js';
import * as store from './store.js';
import * as plan from './views/plan.js';
import * as log from './views/log.js';
import * as history from './views/history.js';
import * as library from './views/library.js';

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

async function init() {
  try {
    db = await loadData();
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
