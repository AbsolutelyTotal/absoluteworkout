// Muscle body map — front and back schematic figures with a highlightable
// region per muscle.
//
// This exists because muscle names alone are hard to hold in your head: seeing
// "lats" lit up on a back view teaches the name far faster than reading it. Used
// small beside exercise names and large in the Library.
//
// Deliberately geometric rather than anatomical. At 30px tall, an accurate
// rendering of the serratus is mud; a blocky region that's unmistakably
// "outer mid-back" is not.

import { raw } from '../ui.js';

// Which view each muscle is visible on. Some appear on both.
const FRONT = new Set([
  'upper-chest', 'mid-chest', 'lower-chest', 'front-delts', 'side-delts',
  'biceps', 'forearms', 'abs', 'obliques', 'quads', 'adductors', 'calves', 'traps'
]);
const BACK = new Set([
  'traps', 'upper-back', 'lats', 'lower-back', 'rear-delts', 'triceps',
  'forearms', 'glutes', 'hamstrings', 'calves'
]);

// Region shapes, keyed by muscle id, per view. Coordinates share a 64x150 grid.
const REGIONS = {
  front: {
    traps: '<path d="M23 25h-6l-2 5 8-1zM41 25h6l2 5-8-1z"/>',
    'front-delts': '<ellipse cx="17" cy="34" rx="5.5" ry="6"/><ellipse cx="47" cy="34" rx="5.5" ry="6"/>',
    'side-delts': '<path d="M11.5 31a6 6 0 0 0 0 11z"/><path d="M52.5 31a6 6 0 0 1 0 11z"/>',
    'upper-chest': '<path d="M22 31h9v8h-9zM33 31h9v8h-9z"/>',
    'mid-chest': '<path d="M22 39.5h9v7h-9zM33 39.5h9v7h-9z"/>',
    'lower-chest': '<path d="M23 47h8v6h-8zM33 47h8v6h-8z"/>',
    abs: '<rect x="26" y="55" width="12" height="21" rx="2"/>',
    obliques: '<path d="M20 55h5v21h-3zM44 55h-5v21h3z"/>',
    biceps: '<ellipse cx="15" cy="49" rx="4" ry="9"/><ellipse cx="49" cy="49" rx="4" ry="9"/>',
    forearms: '<ellipse cx="13" cy="70" rx="3.5" ry="11"/><ellipse cx="51" cy="70" rx="3.5" ry="11"/>',
    quads: '<path d="M23 84h9v28h-9zM32 84h9v28h-9z"/>',
    adductors: '<path d="M30 85h4v20h-4z"/>',
    calves: '<ellipse cx="27" cy="127" rx="4.5" ry="13"/><ellipse cx="37" cy="127" rx="4.5" ry="13"/>'
  },
  back: {
    traps: '<path d="M32 24l-14 6 3 12h22l3-12z"/>',
    'rear-delts': '<ellipse cx="17" cy="34" rx="5.5" ry="6"/><ellipse cx="47" cy="34" rx="5.5" ry="6"/>',
    'upper-back': '<path d="M22 36h20v9H22z"/>',
    lats: '<path d="M21 44l-2 18 8-2 1-16zM43 44l2 18-8-2-1-16z"/>',
    'lower-back': '<rect x="26" y="62" width="12" height="14" rx="2"/>',
    triceps: '<ellipse cx="15" cy="49" rx="4" ry="9"/><ellipse cx="49" cy="49" rx="4" ry="9"/>',
    forearms: '<ellipse cx="13" cy="70" rx="3.5" ry="11"/><ellipse cx="51" cy="70" rx="3.5" ry="11"/>',
    glutes: '<path d="M22 78h10v14H22zM32 78h10v14H32z"/>',
    hamstrings: '<path d="M23 93h9v22h-9zM32 93h9v22h-9z"/>',
    calves: '<ellipse cx="27" cy="127" rx="4.5" ry="13"/><ellipse cx="37" cy="127" rx="4.5" ry="13"/>'
  }
};

// Body outline, drawn under the regions.
const OUTLINE = `
  <circle cx="32" cy="13" r="8"/>
  <path d="M27 21h10l12 7 4 16-4 2-3-12v14l-3 16H21l-3-16V32l-3 12-4-2 4-16z"/>
  <path d="M13 44l-3 24 3 14 4-1-2-13 3-22z"/>
  <path d="M51 44l3 24-3 14-4-1 2-13-3-22z"/>
  <path d="M22 77h20l-1 38-4 26h-6l-1-26-2 26h-6l-1-26z"/>
`;

/**
 * @param {object} opts
 * @param {string[]} opts.primary    muscle ids to highlight strongly
 * @param {string[]} opts.secondary  muscle ids to highlight faintly
 * @param {'front'|'back'|'auto'|'both'} opts.view
 * @param {number} opts.height       px
 */
export function bodyMap({ primary = [], secondary = [], view = 'auto', height = 46 } = {}) {
  const chosen = view === 'auto' ? pickView(primary) : view;
  if (chosen === 'both') {
    return raw(
      `<span class="bodymap-pair">${figure('front', primary, secondary, height)}` +
      `${figure('back', primary, secondary, height)}</span>`
    );
  }
  return raw(figure(chosen, primary, secondary, height));
}

/** The view showing most of the primary muscles; ties go to front. */
function pickView(primary) {
  const front = primary.filter(id => FRONT.has(id)).length;
  const back = primary.filter(id => BACK.has(id)).length;
  return back > front ? 'back' : 'front';
}

function figure(view, primary, secondary, height) {
  const shapes = REGIONS[view] ?? {};
  const prim = new Set(primary);
  const sec = new Set(secondary);

  const painted = Object.entries(shapes)
    .filter(([id]) => prim.has(id) || sec.has(id))
    .map(([id, d]) => `<g class="${prim.has(id) ? 'r-on' : 'r-sec'}">${d}</g>`)
    .join('');

  const label = [...prim].join(', ') || 'no target';

  return `<svg class="bodymap" viewBox="0 0 64 150" height="${height}" role="img"
    aria-label="${escapeAttr(`${view} view, highlighting ${label}`)}">
    <g class="bm-outline">${OUTLINE}</g>
    ${painted}
  </svg>`;
}

// Only ever receives muscle ids from our own JSON, but this is markup assembled
// outside the `html` tag, so escape rather than trust.
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

