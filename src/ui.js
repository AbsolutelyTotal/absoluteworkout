// Render helpers.
//
// XSS invariant: markup is only ever built with the `html` tagged template
// below, which escapes every interpolated value. Raw markup has to be opted
// into explicitly via `raw()`, and `raw()` is only ever applied to literals in
// this file — never to data. That matters because two inputs here are not
// trustworthy by construction: the JSON in data/ (hand-edited, and rendered
// verbatim) and an imported backup file, which is arbitrary user-supplied JSON.
//
// `mount` prefers the built-in Sanitizer (setHTML) where the browser has it,
// which strips scripts and event-handler attributes as a second layer.

const RAW = Symbol('raw');

const escapeText = (s) =>
  String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

/** Mark a string as already-safe markup. Literals only — never data. */
export const raw = (s) => ({ [RAW]: String(s) });

/**
 * A same-origin RELATIVE image path, or '' if the value isn't one. The `image`
 * field comes from JSON (ours today, a synced/imported payload tomorrow), and
 * four render sites drop it into an <img src>. Rejects anything that could reach
 * off-origin or up the tree: a leading "/" (root or protocol-relative "//host"),
 * any ":" (scheme), ".." traversal, or characters outside a safe path set.
 * README and types.ts promise this is enforced "at render time" — this is it.
 */
export function safeImagePath(value) {
  const v = String(value ?? '');
  if (!v || v.startsWith('/') || v.includes(':') || v.includes('..')) return '';
  return /^[\w.\-/]+$/.test(v) ? v : '';
}

function resolve(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(resolve).join('');
  if (typeof v === 'object' && RAW in v) return v[RAW];
  return escapeText(v);
}

/**
 * Auto-escaping template tag. Nested `html` results and arrays of them compose
 * without double-escaping; everything else is escaped as text.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += resolve(values[i]) + strings[i + 1];
  return { [RAW]: out };
}

/** Strips anything executable. Belt-and-braces: `html` already escapes data, so
 *  nothing here should ever fire — it's the second layer, not the first. */
function scrub(root) {
  for (const el of root.querySelectorAll('script, iframe, object, embed')) el.remove();
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      // Block javascript:/data:/vbscript: URLs in href/src/xlink:href. The URL
      // parser ignores ASCII whitespace and C0 controls ANYWHERE in the scheme,
      // so "java&Tab;script:" runs — collapse those chars before testing, don't
      // just anchor on leading \s.
      if (/^(href|src|xlink:href)$/.test(name)) {
        const scheme = attr.value.replace(/[\u0000-\u0020]+/g, '');
        if (/^(javascript|data|vbscript):/i.test(scheme)) el.removeAttribute(attr.name);
      }
    }
  }
  return root;
}

/**
 * Replace a node's children with rendered markup.
 *
 * Deliberately never assigns innerHTML: parses through DOMParser, which (unlike
 * innerHTML) does not execute scripts at parse time, then scrubs before adopting.
 *
 * Not using the built-in `Element.setHTML()` even where it exists — shipping
 * implementations disagree wildly on the default policy. Chrome 141's strips
 * every attribute including `class`, and drops `<button>` outright, which
 * silently renders this app as unstyled text. `scrub()` below is narrower but
 * predictable, and it's the layer we actually depend on.
 */
export function mount(node, tpl) {
  const markup = resolve(tpl);
  const parsed = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');
  node.replaceChildren(...scrub(parsed.body).childNodes);
  return node;
}

export const fmt = {
  /** Half-sets are real (secondary muscles count 0.5) but more than one decimal
   *  reads as false precision. */
  sets: (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)),
  tonnage: (n, unit) => (n >= 1000 ? `${(n / 1000).toFixed(1)}t` : `${Math.round(n)}${unit}`),
  rest: (s) => (s == null ? '' : s >= 60 ? `${Math.round(s / 60)}m rest` : `${s}s rest`),
  date: (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
};

export const CHECK_SVG = raw(
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 5"/></svg>'
);

export function chip(label, { pressed = false, value = '', count } = {}) {
  return html`<button class="chip" type="button" aria-pressed="${String(pressed)}" data-value="${value}">
    ${label}${count != null ? html`<span class="badge">${count}</span>` : ''}
  </button>`;
}

export function tile(label, value, { unit, sub, action } = {}) {
  const body = html`
    <div class="label">${label}</div>
    <div class="value">${value}${unit ? html`<span class="unit">${unit}</span>` : ''}</div>
    ${sub ? html`<div class="sub">${sub}</div>` : ''}
    ${action ? html`<div class="tile-more">tap for detail</div>` : ''}`;

  return action
    ? html`<button type="button" class="tile tappable" data-action="${action}">${body}</button>`
    : html`<div class="tile">${body}</div>`;
}

/** Prescription summary, e.g. "4 x 6-8 @ 1-2 RIR". */
export function prescriptionLine(p) {
  const parts = [`${p.sets} x ${p.reps}`];
  const i = p.intensity ?? {};
  if (i.rir) parts.push(`@ ${i.rir} RIR`);
  else if (i.rpe) parts.push(`@ RPE ${i.rpe}`);
  else if (i.percent1RM) parts.push(`@ ${i.percent1RM}`);
  if (p.tempo) parts.push(`tempo ${p.tempo}`);
  return parts.join(' ');
}

/**
 * One volume row: bar length is what you actually did, and a vertical marker
 * sits at what the plan prescribed.
 *
 * The band this replaced compared actual volume against generic
 * hypertrophy-literature ranges, which flagged 16 of 20 muscles as "under" on a
 * deliberately compact 3-day plan — a metric that fires on almost everything
 * tells you nothing. Comparing against the plan's own prescription answers the
 * question actually worth asking mid-week: did I do the work?
 *
 * Colour never carries the verdict — status-good vs status-critical is ΔE 4.1
 * under deuteranopia, so a red/green done-vs-short indicator would be
 * unreadable for a red-green colourblind reader. The marker position and the
 * text label say it instead.
 */
export function volumeRow(name, actual, planned, scaleMax) {
  const pct = (v) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  // Not prescribed by this split at all — show what was done, but don't imply a
  // shortfall against a target that doesn't exist.
  if (!planned) {
    return html`<div class="vol-row">
      <div class="vol-name">${name}</div>
      <div class="vol-track" role="img"
           aria-label="${`${name}: ${fmt.sets(actual)} sets, not in this split's plan`}">
        <div class="vol-bar" style="width:${pct(actual)}"></div>
      </div>
      <div class="vol-meta">
        <span class="sets">${fmt.sets(actual)}</span>
        <span class="state">${actual > 0 ? 'extra' : 'not planned'}</span>
      </div>
    </div>`;
  }

  const short = planned - actual;
  let state;
  if (actual === 0) state = 'not done';
  else if (short > 0.4) state = `${fmt.sets(short)} short`;
  else if (actual - planned > 0.4) state = `✓ +${fmt.sets(actual - planned)}`;
  else state = '✓ done';

  return html`<div class="vol-row">
    <div class="vol-name">${name}</div>
    <div class="vol-track" role="img"
         aria-label="${`${name}: ${fmt.sets(actual)} of ${fmt.sets(planned)} planned sets, ${state}`}">
      <div class="vol-bar${actual >= planned - 0.4 ? ' met' : ''}" style="width:${pct(actual)}"></div>
      <div class="vol-target" style="left:${pct(planned)}"
           title="${`planned: ${fmt.sets(planned)} sets`}"></div>
    </div>
    <div class="vol-meta">
      <span class="sets">${`${fmt.sets(actual)}/${fmt.sets(planned)}`}</span>
      <span class="state">${state}</span>
    </div>
  </div>`;
}

/**
 * Single-series weekly trend. One hue, no legend — the heading names the series.
 * Hover gives the value instead of labelling every bar.
 */
export function trendChart(points, { label = 'sets' } = {}) {
  if (!points.length) return '';
  const max = Math.max(...points.map(p => p.value), 1);
  const bars = points.map(p => {
    const h = Math.max((p.value / max) * 100, 1.5);
    return html`<div class="trend-col" title="${`${p.label}: ${fmt.sets(p.value)} ${label}`}">
      <div class="trend-bar${p.value === 0 ? ' zero' : ''}" style="height:${`${h}%`}"></div>
    </div>`;
  });
  const axis = points.map(p => html`<span>${p.short ?? ''}</span>`);
  return html`<div class="trend">${bars}</div><div class="trend-axis">${axis}</div>`;
}

export function issuesBanner(issues) {
  if (!issues.length) return '';
  const shown = issues.slice(0, 8);
  return html`<div class="banner warn">
    <span class="icon">!</span>
    <div>
      <strong>${issues.length} data ${issues.length === 1 ? 'issue' : 'issues'}</strong>
      — dangling ids in <code>data/</code>.
      <ul>${shown.map(i => html`<li>${i}</li>`)}</ul>
      ${issues.length > shown.length ? html`<div>…and ${issues.length - shown.length} more.</div>` : ''}
    </div>
  </div>`;
}
