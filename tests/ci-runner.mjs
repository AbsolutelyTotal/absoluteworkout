// CI-only: run the browser QA suite headless and fail the job on any failure.
// The suite is browser-shaped (localStorage, DOMParser, ES modules), so we run
// the real thing in Chromium rather than faking a DOM. tests.html publishes the
// machine-readable result on window.__QA__ = { pass, fail, total, failures[] }.
//
// Not part of the app or its runtime — no package.json, no committed deps; the
// workflow installs playwright into an ephemeral node_modules just to run this.
import { chromium } from 'playwright';

const url = process.env.QA_URL || 'http://127.0.0.1:8541/tests.html';
const browser = await chromium.launch();
const page = await browser.newPage();

// Surface anything the page logs or throws — a module that fails to import would
// otherwise leave __QA__ unset and show up only as an opaque timeout.
page.on('console', (m) => console.log('  [page]', m.text()));
page.on('pageerror', (e) => console.error('  [page error]', e.message));

let qa;
try {
  await page.goto(url, { waitUntil: 'load' });
  qa = await page
    .waitForFunction(() => window.__QA__, null, { timeout: 120000 })
    .then((h) => h.jsonValue());
} catch (err) {
  console.error(`\nQA runner failed to get a result from ${url}: ${err.message}`);
  await browser.close();
  process.exit(1);
}
await browser.close();

console.log(`\nQA ${qa.pass}/${qa.total}`);
if (qa.fail > 0) {
  for (const f of qa.failures || []) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
