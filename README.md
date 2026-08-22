<div align="center">

# 🏋️ absoluteworkout

**Push/pull/legs planner, in-gym set tracker, and weekly volume dashboard.**

![Stack](https://img.shields.io/badge/stack-vanilla_JS-f7df1e?logo=javascript&logoColor=000)
![Modules](https://img.shields.io/badge/modules-native_ESM-blue)
![Build](https://img.shields.io/badge/build-none-555)
![Storage](https://img.shields.io/badge/storage-localStorage-d3f26a)
![Pages](https://img.shields.io/badge/hosting-GitHub_Pages-222?logo=github)

[🌐 Live](https://absolutelytotal.github.io/absoluteworkout/) · [🖼️ Icon sheet](https://absolutelytotal.github.io/absoluteworkout/icons.html)

</div>

---

Read the plan, log the sets, see whether the volume actually landed where it was
supposed to. Built around a set of **L5-S1 lumbar constraints** — every movement
is chest-supported, seated, or otherwise off the spine.

Switch between the 3-day core split and the 4-day extension; the same exercise
library feeds both, so you can compare what each one gives a muscle before
committing to it.

## ✨ Features

- 🗓 **Two splits, one library** — 3-day and 4-day rotations share `exercises.json`; prescriptions live per split.
- 🎯 **Next-day suggestion** — the rotation advances from your last completed session.
- ✅ **In-gym logging** — big tap targets, numeric keypads, last session's numbers as placeholders so repeating a load is one tap. Every keystroke persists; there's no save button.
- 🔄 **Swap mid-session** — `⇄` opens a picker pre-filtered to the muscle group that exercise trains. Volume stays correctly attributed via `substitutedFor`.
- ➕ **Add mid-session** — `+ Add an exercise`, filterable by muscle group. Everything pickable is permitted under the constraints, because the picker draws from the same library.
- 📊 **Weekly volume per muscle** — actual sets against a target band, primary movers counted 1.0 and secondary 0.5.
- 🔍 **Two-sided cross-reference** — pick a muscle to see what trains it and how many sets each split gives it; pick an exercise to see what it works and which days program it.
- 💾 **Export / import** — localStorage is one cleared cache from gone, so the log downloads as JSON and merges back in.

## 🌐 Hosting

Live at **<https://absolutelytotal.github.io/absoluteworkout/>** (GitHub Pages,
served from `main` at the repo root — no build step, no workflow).

The repo is public only because Pages won't serve a private repo on a free
plan. This isn't meant to be found: the page sends `noindex, nofollow`, and
there are no social-preview or canonical tags. `robots.txt` deliberately
*allows* crawling — a `Disallow` would stop crawlers reading the `noindex`,
which can leave the URL indexed anyway from an inbound link.

Public is not private, though: the repo contents, including
`data/constraints.json`, are readable by anyone who looks.

> [!IMPORTANT]
> Logged sets live in the browser's localStorage, so they are **per-device** and
> never leave it — nothing is uploaded and nothing is in this repo. The flip side
> is that logging on your phone and your laptop gives you two separate histories.
> Pick one primary device; use the ⤓ export/import to move data between them.

## 🚀 Run locally

No build step, but it **must** be served over HTTP — native ES modules and
`fetch` both refuse `file://`.

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## 🛠️ Stack

- **Vanilla HTML / CSS / JS**, native ES modules, no dependencies and no CDN.
- **localStorage** for logged sessions. No backend, no account, no network calls.
- **Hand-curated JSON** as the data store.

### Why modules, when terroir is a single file

[terroir](https://github.com/AbsolutelyTotal/terroir) fits in one `index.html`
because it's a reference viewer. This app has four views, a persistence layer
with migrations, and volume maths, so it's split into `src/` — still zero-build,
just not one 2,000-line file.

## 📁 Layout

```
index.html          shell: app bar, tab strip, backup dialog
app.css             all styles + the design tokens
src/
  main.js           bootstrap, tab routing, backup dialog
  data.js           load + index JSON, volume maths, PRs, week bucketing
  store.js          localStorage, migrations, export/import
  ui.js             auto-escaping template tag + render helpers
  views/            plan · log · history · library
data/               the data store (below)
```

## 📊 Data files

| File | Count | What it is |
| --- | --- | --- |
| `muscles.json` | 20 | Muscles, their roll-up group, and weekly set targets |
| `exercises.json` | 27 | The exercise library — what each movement is |
| `splits.json` | 2 | The 3-day and 4-day rotations |
| `constraints.json` | — | The L5-S1 safety rules, replacement ledger, and execution parameters |
| `types.ts` | — | Schema documentation |

`types.ts` is reference documentation, not compiled. The JSON files are the
source of truth.

## 🩺 Safety constraints

This plan is built around an **L5-S1 lumbar disc herniation**: zero axial
loading, zero lumbar flexion or shear, rigid external back support, isometric
core only. The full rule set and the replacement ledger (what was swapped out,
what replaced it, and why) live in [`data/constraints.json`](data/constraints.json).

Two consequences that are easy to undo by accident:

1. **Contraindicated movements are absent from `exercises.json`, not flagged
   in it.** Back squats, RDLs, standing overhead press, bent-over rows, crunches
   and loaded carries aren't in the library at all. If they were merely marked
   unsafe they could still surface in the swap dropdown as an "alternative" —
   which is exactly the wrong place to learn about a ban. Don't add them back to
   use them as reference data.
2. **`lower-back` has `weeklySetTarget: null`.** That means "deliberately not
   trained", and the volume chart renders it without a band or an under/over
   verdict. A numeric target would report it as chronically "under", inverting
   the intent.

`formLimit` on an exercise is a hard safety stop, shown as a warning pill
(the leg press's `Max 90° knee flexion`). General form advice belongs in `cues`.

> [!WARNING]
> Nothing here is medical advice, and the app can't enforce anything. It reflects
> constraints as recorded — verify changes against whoever is treating you.

### 🔗 The one rule

`exercises.json` describes **what a movement is** (muscles, pattern, equipment,
cues). `splits.json` describes **how you're training it right now** (sets, reps,
rest, progression). Sets and reps never live on an exercise — the same bench
press is 5x5 on one split and 3x12 on another.

Cross-references are checked at load and dangling ids are reported in a banner at
the top of the app rather than throwing, so a typo degrades instead of blanking
the page.

## 📈 Volume accounting

- A **primary** mover counts as a full set, a **secondary** as a half — the
  conventional way to credit indirect work without ignoring it.
- Only **ticked** sets count. Unticked ones are dropped when you finish.
- Targets come from `weeklySetTarget` on each muscle, falling back to
  `settings.defaultSetTarget`.
- Estimated 1RM uses Epley. It's reliable in the 1–12 rep range and overstates
  above that, which is why the UI labels it an estimate.

## 🎨 Charts

The data layer uses **one hue** (`--series-1`) plus a target band. Under / on /
over target is carried by an **icon and a text label, never by colour** — the
status-good and status-critical steps sit at ΔE 4.1 under deuteranopia, so a
red/green under-vs-over indicator would be unreadable for a red-green colourblind
reader. The ordinal ramp (`--ramp-1` … `--ramp-4`) is validated on the app
surface for monotone lightness, step separation and single hue.

The brand accent (`--accent`) is deliberately **never** used as a data colour, so
it can't be mistaken for a series or a status.

If you change these, re-validate rather than eyeballing it.

## 💾 Your data

Logged sessions live in this browser's localStorage under
`absoluteworkout.v1` — they are never uploaded anywhere. That also means
**clearing site data wipes them**. Use the ⤓ button in the app bar to download a
backup. Exported files match `absoluteworkout-*.json` and are gitignored, since
they contain bodyweight and training data.

## 🖼️ Exercise visuals

Two separate problems, with different answers.

**Muscles — solved.** `src/icons/body.js` draws a front/back schematic figure
with a highlightable region per muscle. Small beside each exercise, large in the
Library. Deliberately geometric: at 30px an anatomically accurate serratus is
mud, a blocky "outer mid-back" is not.

**Machines — placeholder.** `src/icons/equipment.js` has 17 hand-authored line
icons, and they're honestly not good enough to teach station recognition — chest
press, shoulder press, leg extension and hamstring curl all reduce to similar
brackets at 26px. The upgrade path is data, not code:

- Set `image` on an exercise (e.g. `assets/exercises/leg-press.webp`) and it
  replaces the line icon. Must be a relative same-origin path; absolute URLs are
  rejected at render time.
- Set `demoUrl` for a form video. Rendered as a link, never an embed, so no
  third-party script or tracker loads on the page.

Open [`icons.html`](icons.html) for a contact sheet of every icon and body-map
region — use it when adding an exercise, or after editing a region path.

## 🚧 Status

Working end to end on the real 3-day and 4-day plans. Body maps done; machine
imagery is the open item.

## ⚖️ License

[MIT](LICENSE).
