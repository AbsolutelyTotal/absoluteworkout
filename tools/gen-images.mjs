#!/usr/bin/env node
// Generate the exercise and muscle art with the Gemini image model ("Nano Banana").
//
//   export GEMINI_API_KEY=...          # session only — see the note below
//   node tools/gen-images.mjs --dry-run
//   node tools/gen-images.mjs --only machine-chest-press
//   node tools/gen-images.mjs --kind exercise
//   node tools/gen-images.mjs                       # everything still missing
//
// Consistency: every image after the first is generated WITH the reference image
// attached as input, because this model edits as much as it generates. That is
// what keeps 47 renders looking like one set. The reference is generated first
// (or reused if it already exists on disk).
//
// Credential handling: the key is read from the environment only. It is never
// written to disk, never logged, and never placed in a file — this repo is
// public, so a key committed here would be public too. Set it for the session:
//
//   read -rs GEMINI_API_KEY && export GEMINI_API_KEY
//
// Rotate the key at https://aistudio.google.com/apikey if it is ever exposed.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG = path.join(ROOT, 'tools/image-prompts.json');
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;   // --only accepts a comma-separated list
};

const DRY = flag('dry-run');
const FORCE = flag('force');
const ONLY = value('only');
const KIND = value('kind');
const DELAY_MS = Number(value('delay') ?? 4000);
const REF_OVERRIDE = value('reference');
const MODEL_OVERRIDE = value('model');
const NO_REFERENCE = flag('no-reference');   // starting a NEW style, don't inherit the old one
const STYLE_KEY = value('style');            // pick an alternate style block from the config
const SUFFIX = value('suffix');              // write to <id>.<suffix>.jpg, leaving the original alone

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function apiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) {
    console.error(
      'GEMINI_API_KEY is not set.\n\n' +
      'Set it for this shell session only (not in .zshrc, not in a file — this repo is public):\n' +
      '  read -rs GEMINI_API_KEY && export GEMINI_API_KEY\n'
    );
    process.exit(1);
  }
  return k;
}

/** Build the full prompt: style block + the item's specifics. */
function fullPrompt(cfg, item, refs) {
  const style = cfg.style[STYLE_KEY ?? item.kind];
  const roles = (refs ?? []).map(r => r.role);
  let lead = '';
  if (roles.includes('form') && roles.includes('style')) {
    lead =
      'TWO images are attached and they serve DIFFERENT purposes. Do not blend them.\n' +
      'The FORM reference shows only WHAT THE MACHINE IS and HOW THE BODY SITS ON IT — ' +
      'the geometry, the pads, the contact points, the joint angles. Copy that arrangement.\n' +
      'The STYLE reference shows only HOW TO DRAW — palette, line weight, framing, background. ' +
      'Copy that rendering.\n' +
      'Take NOTHING else from the form reference: not its colours, not its shading, not its ' +
      'realism, not its background, and no text or watermark. The output must look exactly like ' +
      'the style reference and be posed exactly like the form reference.\n\n';
  } else if (roles.length) {
    lead =
      'Use the attached image as the exact style reference. Same figure, same body, ' +
      'same lighting, same background, same equipment finish and the same framing. ' +
      'Change only the exercise being performed.\n\n';
  }
  return `${lead}${style}\n\n${item.prompt}`;
}

/** Pull the useful line out of a Google API error body. */
function summariseQuota(body) {
  try {
    const j = JSON.parse(body);
    const err = j.error ?? {};
    const bits = [err.message];
    for (const d of err.details ?? []) {
      for (const v of d.violations ?? []) {
        bits.push(`quota: ${v.quotaId ?? v.subject ?? '?'}${v.quotaValue !== undefined ? ` (limit ${v.quotaValue})` : ''}`);
      }
      if (d.retryDelay) bits.push(`retry after ${d.retryDelay}`);
    }
    return bits.filter(Boolean).join(' | ').slice(0, 500);
  } catch {
    return body.replace(/\s+/g, ' ').slice(0, 300);
  }
}

/** Node reports every transport failure as the useless "fetch failed". The
 *  actionable detail is on err.cause. */
function describeNetworkError(err) {
  const cause = err.cause ?? {};
  const code = cause.code ?? cause.errno ?? '';
  const detail = [err.message, code, cause.message].filter(Boolean).join(' | ');

  const hints = {
    ENOTFOUND: 'DNS could not resolve the host. Check your connection or DNS.',
    ECONNREFUSED: 'Connection refused — something is blocking outbound HTTPS.',
    ECONNRESET: 'Connection reset mid-request, often a proxy or firewall interrupting TLS.',
    ETIMEDOUT: 'Timed out before the server responded.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      'TLS chain not trusted. Node does NOT use the macOS keychain, so a corporate ' +
      'TLS-inspecting proxy that curl accepts will still fail here. Point Node at the ' +
      'corporate root CA: export NODE_EXTRA_CA_CERTS=/path/to/corporate-root.pem ' +
      '(do NOT disable TLS verification).',
    SELF_SIGNED_CERT_IN_CHAIN:
      'A self-signed certificate is in the chain — almost certainly a TLS-inspecting ' +
      'proxy. Set NODE_EXTRA_CA_CERTS to the corporate root CA rather than turning ' +
      'verification off.',
    DEPTH_ZERO_SELF_SIGNED_CERT:
      'Self-signed certificate. Same fix: NODE_EXTRA_CA_CERTS with the proper root CA.',
    ERR_TLS_CERT_ALTNAME_INVALID:
      'Certificate does not match the hostname — traffic is being intercepted.'
  };

  const hint = hints[code];
  return hint ? `${detail}\n       → ${hint}` : `${detail || 'unknown network failure'}`;
}

async function generate(cfg, item, references, key, model) {
  const refs = references ?? [];
  const parts = [{ text: fullPrompt(cfg, item, refs) }];
  // Each image is preceded by a text part naming its role. Without the label the
  // model has no way to tell a form reference from a style reference, and it
  // averages them — which is how a chest-press style ref pulled the pose wrong.
  for (const r of refs) {
    if (r.label) parts.push({ text: r.label });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: r.bytes.toString('base64') } });
  }

  const aspectRatio = cfg.aspect[item.kind];
  const contents = [{ parts }];

  // Not every model accepts every imageConfig field. Degrade one field at a
  // time rather than dropping the whole block — the aspect ratio matters more
  // than the size hint.
  const variants = [
    { contents, generationConfig: { imageConfig: { aspectRatio, ...(cfg.imageSize ? { imageSize: cfg.imageSize } : {}) } } },
    { contents, generationConfig: { imageConfig: { aspectRatio } } },
    { contents }
  ];

  for (const attemptBody of variants) {
    let res;
    try {
      res = await fetch(`${ENDPOINT}/${cfg.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(attemptBody),
        signal: AbortSignal.timeout(120000)
      });
    } catch (err) {
      throw new Error(describeNetworkError(err));
    }

    if (res.status === 429 || res.status >= 500) {
      const detail = await res.text().catch(() => '');
      const retryAfter = Number(res.headers.get('retry-after') ?? 0) * 1000;

      // A 429 is only worth retrying when it's a per-minute throttle. A daily
      // cap, or a quota whose limit is 0 (the model isn't on your tier), will
      // never clear by waiting — fail fast and say why.
      const hardQuota = /PerDay|"limit"\s*:\s*"?0"?|limit:\s*0|billing|not supported|does not have access/i
        .test(detail);

      throw Object.assign(
        new Error(`HTTP ${res.status}${detail ? ` — ${summariseQuota(detail)}` : ''}`),
        { retryable: res.status !== 429 || !hardQuota, retryAfter }
      );
    }

    if (!res.ok) {
      const text = await res.text();
      if (attemptBody.generationConfig &&
          /imageConfig|aspectRatio|imageSize|Unknown name|Invalid JSON payload/i.test(text)) {
        continue;                                   // drop a hint and retry
      }
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    }

    const json = await res.json();
    const cand = json.candidates?.[0];
    const inline = cand?.content?.parts?.find(p => p.inlineData ?? p.inline_data);
    if (!inline) {
      const reason = cand?.finishReason ?? 'no image in response';
      const text = cand?.content?.parts?.find(p => p.text)?.text;
      throw new Error(`${reason}${text ? ` — model said: ${text.slice(0, 200)}` : ''}`);
    }
    const data = inline.inlineData ?? inline.inline_data;
    return { bytes: Buffer.from(data.data, 'base64'), mime: data.mimeType ?? data.mime_type ?? 'image/png' };
  }
  throw new Error('exhausted request variants');
}

/** Save, convert to JPEG and resize with sips (macOS, no dependencies). */
async function save(bytes, mime, outPath, maxPx, quality = 84) {
  await mkdir(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.raw${mime.includes('png') ? '.png' : '.jpg'}`;
  await writeFile(tmp, bytes);
  // -Z only shrinks; it never upscales, so a smaller model output is left alone.
  await run('sips', [
    '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality),
    '-Z', String(maxPx), tmp, '--out', outPath
  ]);
  await run('rm', ['-f', tmp]);
}

async function withRetries(fn, label, tries = 4) {
  let wait = 8000;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (err) {
      const last = i === tries;
      if (!err.retryable || last) throw err;
      const pause = err.retryAfter || wait;
      console.log(`    rate limited, waiting ${Math.round(pause / 1000)}s (attempt ${i}/${tries})`);
      await sleep(pause);
      wait *= 2;
    }
  }
}

async function main() {
  const cfg = JSON.parse(await readFile(CONFIG, 'utf8'));

  let items = cfg.items;
  if (KIND) items = items.filter(i => i.kind === KIND);
  if (ONLY) {
    const wanted = new Set(ONLY.split(',').map(x => x.trim()).filter(Boolean));
    const unknown = [...wanted].filter(id => !cfg.items.some(i => i.id === id));
    if (unknown.length) {
      console.error(`Unknown id(s): ${unknown.join(', ')}`);
      process.exit(1);
    }
    items = items.filter(i => wanted.has(i.id));
  }
  if (!items.length) { console.error('Nothing matched those filters.'); process.exit(1); }

  // References first, so later items can attach them.
  const refIds = new Set(Object.values(cfg.reference).map(p => path.basename(p, '.jpg')));
  items = [...items].sort((a, b) => (refIds.has(b.id) ? 1 : 0) - (refIds.has(a.id) ? 1 : 0));

  if (STYLE_KEY && !cfg.style[STYLE_KEY]) {
    console.error(`Unknown style "${STYLE_KEY}". Available: ${Object.keys(cfg.style).join(', ')}`);
    process.exit(1);
  }
  const key = DRY ? null : apiKey();
  const refCache = {};
  let made = 0, skipped = 0, failed = 0;

  console.log(
    `${items.length} item(s) · batch ${MODEL_OVERRIDE ?? cfg.model}` +
    `${cfg.referenceModel && !MODEL_OVERRIDE ? ` · references ${cfg.referenceModel}` : ''}` +
    `${DRY ? ' · DRY RUN' : ''}`
  );
  if (!FORCE) {
    console.log('Existing files are skipped. Use --force to replace the stock photos.');
  }
  console.log(
    'Reminder: the style reference must be YOUR generated image. If ' +
    `${cfg.reference.exercise} is still a stock photo, every render will inherit that look.\n`
  );

  const SLUG = /^[a-z0-9][a-z0-9-]*$/i;
  if (SUFFIX != null && !SLUG.test(SUFFIX)) {
    console.error(`Refusing --suffix "${SUFFIX}": use a plain slug (letters, digits, hyphens).`);
    process.exit(1);
  }

  for (const item of items) {
    if (!SLUG.test(item.id)) {
      console.error(`Refusing item id "${item.id}": ids must be plain slugs — a "/" or ".." would write outside the assets dir.`);
      process.exit(1);
    }
    const outPath = path.join(ROOT, cfg.outDir[item.kind],
      SUFFIX ? `${item.id}.${SUFFIX}.jpg` : `${item.id}.jpg`);
    const rel = path.relative(ROOT, outPath);

    if (!FORCE && await exists(outPath)) {
      console.log(`skip   ${rel}  (exists — use --force to regenerate)`);
      skipped++;
      // Still usable as the style reference.
      if (refIds.has(item.id) && !refCache[item.kind]) refCache[item.kind] = await readFile(outPath);
      continue;
    }

    const isRef = refIds.has(item.id);
    if (isRef && !NO_REFERENCE && !SUFFIX && !flag('regen-reference')) {
      // Two very different situations, and the earlier version conflated them:
      // an existing reference should just be left alone (skip, keep going),
      // while a MISSING one genuinely blocks everything downstream.
      if (await exists(outPath)) {
        console.log(`keep   ${rel}  (existing style reference — --regen-reference to replace)`);
        skipped++;
        refCache[item.kind] = await readFile(outPath);
        continue;
      }
      console.log(
        `\nNo style reference at ${rel}, and --regen-reference was not passed.\n` +
        'Every other image inherits its look, so generating them without one would\n' +
        'produce an inconsistent set. Put an image at that path, or re-run with\n' +
        '--regen-reference to roll one.\n'
      );
      failed++;
      break;
    }
    const reference = (isRef || NO_REFERENCE)
      ? null
      : refCache[item.kind] ?? await loadReferences(cfg, item.kind);

    if (DRY) {
      console.log(`would  ${rel}${reference ? '  (+reference)' : '  (REFERENCE IMAGE)'}`);
      console.log(`       ${fullPrompt(cfg, item, reference).replace(/\s+/g, ' ').slice(0, 150)}…\n`);
      continue;
    }

    try {
      const modelLabel = MODEL_OVERRIDE ?? (isRef ? (cfg.referenceModel ?? cfg.model) : cfg.model);
      process.stdout.write(`gen    ${rel}${isRef ? '  (reference)' : ''}  [${modelLabel}] … `);
      const model = MODEL_OVERRIDE
        ?? (isRef ? (cfg.referenceModel ?? cfg.model) : cfg.model);
      const { bytes, mime } = await withRetries(
        () => generate(cfg, item, reference, key, model), item.id
      );
      await save(bytes, mime, outPath, cfg.resize[item.kind], cfg.quality ?? 84);
      console.log('ok');
      made++;
      if (isRef) refCache[item.kind] = await readFile(outPath);
      await sleep(DELAY_MS);                        // stay under the RPM limit
    } catch (err) {
      console.log('FAILED');
      console.log(`       ${err.message}`);
      if (err.cause && !/\|/.test(err.message)) {
        console.log(`       cause: ${err.cause.code ?? err.cause.message ?? err.cause}`);
      }
      failed++;
      if (isRef) {
        console.error('\nThe reference image failed, so everything else would be inconsistent. Stopping.');
        break;
      }
    }
  }

  console.log(`\ndone — ${made} generated, ${skipped} skipped, ${failed} failed`);
  if (failed) {
    console.log('Re-run to retry only the missing ones (existing files are skipped).');
    process.exitCode = 1;
  }
}

// Order matters as much as wording: this model tends to EDIT THE LAST IMAGE it is
// given. Pass the style reference first and the form reference last, so the thing
// being redrawn is the form. Passing style last made it reproduce the style
// image's exercise verbatim and ignore the form entirely.
const LABELS = {
  style: 'STYLE REFERENCE — PALETTE AND DRAWING TECHNIQUE ONLY. This image shows a COMPLETELY ' +
         'DIFFERENT exercise. DO NOT COPY IT. Do not copy its machine, its pose, its arm position or ' +
         'its exercise. Take from it ONLY the colours, the line weight and the background:',
  form: 'FORM REFERENCE — THIS IS THE PICTURE TO REDRAW. Reproduce this machine, this body position ' +
        'and these joint angles exactly, but re-render them in the flat style of the style ' +
        'reference. Take none of this image\'s grey colours, shading, realism or background:'
};

/** --reference accepts "a.jpg" or a role-tagged list: "form=a.jpg,style=b.jpg". */
async function loadReferences(cfg, kind) {
  const spec = REF_OVERRIDE ?? cfg.reference[kind];
  const entries = spec.split(',').map(chunk => {
    const [a, b] = chunk.split('=');
    return b ? { role: a.trim(), relPath: b.trim() } : { role: 'style', relPath: a.trim() };
  });

  const out = [];
  for (const { role, relPath } of entries) {
    // A form reference is usually a photo living OUTSIDE this repo — this repo is
    // public, so third-party images must not be copied into it. path.join would
    // graft an absolute path onto ROOT, so resolve it instead.
    const p = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
    if (!await exists(p)) {
      console.log(`  note: no reference at ${relPath} yet — skipping it.`);
      continue;
    }
    if (!announced.has(relPath)) {
      console.log(`  ${role} reference for ${kind}s: ${relPath}`);
      announced.add(relPath);
    }
    out.push({ role, label: LABELS[role] ?? null, bytes: await readFile(p) });
  }
  return out.length ? out : null;
}

const announced = new Set();

main().catch(err => { console.error(err); process.exit(1); });
