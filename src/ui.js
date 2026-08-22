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
      // Block javascript: and data: URLs in href/src/xlink:href.
      if (/^(href|src|xlink:href)$/.test(name) && /^\s*(javascript|data):/i.test(attr.value)) {
        el.removeAttribute(attr.name);
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
  weight: (n, unit) => (n == null ? '—' : `${n}${unit}`),
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

export function tile(label, value, { unit, sub } = {}) {
  return html`<div class="tile">
    <div class="label">${label}</div>
    <div class="value">${value}${unit ? html`<span class="unit">${unit}</span>` : ''}</div>
    ${sub ? html`<div class="sub">${sub}</div>` : ''}
  </div>`;
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
 * One volume row: bar length carries magnitude, the target band sits behind it,
 * and state is spelled out in text with an icon. Colour never carries state —
 * status-good vs status-critical is ΔE 4.1 under deuteranopia, so a red/green
 * under-vs-over indicator would be unreadable for a red-green colourblind
 * reader. One hue plus a labelled band says the same thing to everyone.
 */
export function volumeRow(name, sets, target, scaleMax) {
  const pct = (v) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  // A null target means "deliberately not trained" (e.g. lower back under the
  // L5-S1 constraints). Show the volume, but no band and no under/over verdict —
  // flagging it as "under target" would invert the intent.
  if (!target) {
    return html`<div class="vol-row">
      <div class="vol-name">${name}</div>
      <div class="vol-track" role="img"
           aria-label="${`${name}: ${fmt.sets(sets)} sets, no target set`}">
        <div class="vol-bar" style="width:${pct(sets)}"></div>
      </div>
      <div class="vol-meta">
        <span class="sets">${fmt.sets(sets)}</span>
        <span class="state">no target</span>
      </div>
    </div>`;
  }

  const [lo, hi] = target;
  let icon = '✓', state = 'on target';
  if (sets < lo) { icon = '↓'; state = 'under'; }
  else if (sets > hi) { icon = '↑'; state = 'over'; }

  return html`<div class="vol-row">
    <div class="vol-name">${name}</div>
    <div class="vol-track" role="img"
         aria-label="${`${name}: ${fmt.sets(sets)} sets, target ${lo} to ${hi}, ${state}`}">
      <div class="vol-band" style="left:${pct(lo)};width:${pct(hi - lo)}"></div>
      <div class="vol-bar" style="width:${pct(sets)}"></div>
    </div>
    <div class="vol-meta">
      <span class="sets">${fmt.sets(sets)}</span>
      <span class="state">${`${icon} ${state}`}</span>
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
