// Machine / equipment icons, keyed by the `icon` field in exercises.json.
//
// Hand-authored schematic line art on a 24x24 grid, stroke-based so they inherit
// currentColor. Deliberately side-on views of the actual station — the point is
// to recognise the machine on the gym floor, not to look anatomical.
//
// Adding an exercise with an unknown icon key falls back to its equipment type,
// then to a generic dot, so a missing icon never breaks a render.

import { raw } from '../ui.js';

const svg = (body) =>
  `<svg class="icon-eq" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  // Inclined bench with a dumbbell above it.
  'incline-bench': svg(`
    <path d="M3 19h11"/><path d="M5 19l8-8"/><path d="M13 11l3-3"/>
    <path d="M17 5v5"/><path d="M15.5 5.5v4"/><path d="M18.5 5.5v4"/>`),

  // Flat bench, barbell racked above.
  'barbell-bench': svg(`
    <path d="M3 18h13"/><path d="M5 18v-3h9v3"/>
    <path d="M4 8h16"/><path d="M7 6v4"/><path d="M17 6v4"/>`),

  // High-back seat, horizontal press handles.
  'chest-press': svg(`
    <path d="M6 20v-6"/><path d="M6 14h6"/><path d="M6 14V5"/>
    <path d="M12 9h6"/><path d="M18 6v6"/><path d="M12 12h6"/>`),

  // High-back seat, vertical press handles overhead.
  'shoulder-press': svg(`
    <path d="M6 20v-6"/><path d="M6 14h6"/><path d="M6 14V7"/>
    <path d="M11 7V4"/><path d="M17 7V4"/><path d="M9 4h10"/>`),

  // Vertical rails with a bar sliding on them.
  'smith-machine': svg(`
    <path d="M6 3v18"/><path d="M18 3v18"/>
    <path d="M4 10h16"/><path d="M8 8v4"/><path d="M16 8v4"/>`),

  // Seat with two arms sweeping inward.
  'pec-deck': svg(`
    <path d="M12 21v-6"/><path d="M9 15h6"/>
    <path d="M6 5a7 7 0 0 0 4 8"/><path d="M18 5a7 7 0 0 1-4 8"/>
    <circle cx="6" cy="4" r="1.4"/><circle cx="18" cy="4" r="1.4"/>`),

  // Weight stack tower with a cable and handle.
  'cable-stack': svg(`
    <rect x="3" y="4" width="6" height="16" rx="1"/>
    <path d="M4.5 8h3"/><path d="M4.5 11h3"/><path d="M4.5 14h3"/>
    <path d="M6 4V3h11v9"/><path d="M17 12v4"/><path d="M15 16h4"/>`),

  // Overhead pulley, wide bar, seat with thigh pad.
  'lat-pulldown': svg(`
    <path d="M4 3h16"/><path d="M12 3v4"/>
    <path d="M7 7h10"/><path d="M9 6v2"/><path d="M15 6v2"/>
    <path d="M8 20v-4h8"/><path d="M16 16v3"/>`),

  // Bar with a hanging figure.
  'pullup-bar': svg(`
    <path d="M4 4h16"/><path d="M9 4v3"/><path d="M15 4v3"/>
    <circle cx="12" cy="10" r="2"/>
    <path d="M12 12v5"/><path d="M10 20l2-3 2 3"/>`),

  // Inclined chest pad with elbows driving back.
  'chest-supported-row': svg(`
    <path d="M3 20h10"/><path d="M5 20l7-9"/>
    <path d="M12 11l4 2"/><path d="M16 13l3-3"/>
    <path d="M19 7v4h-4"/>`),

  // Seat, legs extending forward against a pad.
  'leg-extension': svg(`
    <path d="M5 20v-8"/><path d="M5 12h5"/><path d="M5 12V5"/>
    <path d="M10 12l7 3"/><path d="M17 15v4"/><path d="M15 19h4"/>`),

  // Seat, heels curling back under.
  'hamstring-curl': svg(`
    <path d="M5 19v-7"/><path d="M5 12h6"/><path d="M5 12V5"/>
    <path d="M11 12h5"/><path d="M16 12a3 3 0 0 1 0 6h-2"/>`),

  // Seat with a foot platform being pushed away.
  'leg-press': svg(`
    <path d="M4 19v-8"/><path d="M4 11h5"/><path d="M4 11V4"/>
    <path d="M9 12l6 4"/><path d="M17 8v10"/><path d="M15 16l2-2"/>`),

  // Supine figure, hips driven up.
  'glute-bridge': svg(`
    <path d="M3 19h18"/>
    <circle cx="6" cy="15" r="1.6"/>
    <path d="M7.5 15.5c3 0 4-4 6.5-4"/>
    <path d="M14 11.5l3 4"/><path d="M17 15.5v3.5"/>`),

  // Seated, ball of foot on a step.
  'calf-raise': svg(`
    <path d="M5 19v-7"/><path d="M5 12h6"/><path d="M5 12V6"/>
    <path d="M11 12l4 3"/><path d="M15 15v2"/>
    <path d="M13 20h7"/><path d="M17 20v-3h3"/>`),

  // Forearm plank silhouette.
  plank: svg(`
    <path d="M3 20h18"/>
    <circle cx="6" cy="11" r="1.6"/>
    <path d="M7.5 11.5h8l4 4"/>
    <path d="M8 12v8"/><path d="M19 16v4"/>`),

  // Free-weight fallbacks.
  dumbbell: svg(`
    <path d="M7 12h10"/>
    <path d="M5 8v8"/><path d="M7.5 6.5v11"/>
    <path d="M19 8v8"/><path d="M16.5 6.5v11"/>`),
  barbell: svg(`
    <path d="M3 12h18"/>
    <path d="M6 8v8"/><path d="M8 6v12"/>
    <path d="M18 8v8"/><path d="M16 6v12"/>`),
  machine: svg(`<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8"/><path d="M8 13h5"/>`),
  bodyweight: svg(`
    <circle cx="12" cy="5" r="2"/>
    <path d="M12 7v6"/><path d="M8 9h8"/><path d="M12 13l-3 7"/><path d="M12 13l3 7"/>`)
};

const EQUIPMENT_FALLBACK = {
  dumbbell: 'dumbbell',
  barbell: 'barbell',
  smith: 'smith-machine',
  cable: 'cable-stack',
  machine: 'machine',
  bodyweight: 'bodyweight',
  kettlebell: 'dumbbell',
  band: 'cable-stack'
};

const GENERIC = svg('<circle cx="12" cy="12" r="7"/>');

/**
 * Visual for an exercise, best available first:
 *   1. `image` — a real photo/illustration of the station (self-hosted)
 *   2. `icon` — the hand-authored line art below
 *   3. its first equipment type
 *   4. a generic glyph
 *
 * The line art is a stopgap. Several machine icons (chest press, shoulder press,
 * leg extension, hamstring curl) reduce to near-identical brackets at 26px and
 * won't teach you to recognise a station on the gym floor — that needs a real
 * image. Populating `image` in exercises.json upgrades this with no code change.
 */
/**
 * @param {object} exercise
 * @param {object} [opts]
 * @param {boolean} [opts.interactive=true] Pass false when rendering INSIDE a
 *   button. HTML forbids nested buttons and parsers hoist the inner one out of
 *   its ancestor entirely — which silently emptied every row of the Library list.
 */
export function equipmentIcon(exercise, { interactive = true } = {}) {
  if (!exercise) return raw(iconBox(GENERIC));
  const src = exercise.image ? escapeAttr(exercise.image) : '';
  if (src) {
    // Own wrapper rather than an inner <img>: a 3:2 gym photo shoved into the
    // square icon box is an unrecognisable crop.
    const name = escapeAttr2(exercise.name);
    const img = `<img src="${src}" alt="" loading="lazy" decoding="async">`;
    return raw(interactive
      ? `<button type="button" class="ex-photo" data-photo="${src}" data-photo-name="${name}" ` +
        `title="Tap to enlarge" aria-label="Show a photo of ${name}">${img}</button>`
      : `<span class="ex-photo static">${img}</span>`);
  }
  const key = exercise.icon ?? EQUIPMENT_FALLBACK[(exercise.equipment ?? [])[0]];
  return raw(iconBox(ICONS[key] ?? GENERIC));
}

const iconBox = (inner) => `<span class="icon-eq-box">${inner}</span>`;

function escapeAttr2(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// `image` comes from our own JSON, but this is markup built outside the `html`
// tag, so escape rather than trust. Also refuse anything that isn't a same-origin
// relative path — no absolute URLs, no protocol-relative, no javascript:.
function escapeAttr(s) {
  const v = String(s);
  if (!/^[\w./-]+$/.test(v) || v.includes('..')) return '';
  return v.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function iconByKey(key) {
  return raw(ICONS[key] ?? GENERIC);
}

export const ICON_KEYS = Object.keys(ICONS);
