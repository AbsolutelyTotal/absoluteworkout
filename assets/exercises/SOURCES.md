# Exercise image sources

## Free Exercise DB (19 images)

From [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db),
released under **The Unlicense** — public domain, no attribution required.
Credited here anyway.

Downloaded at 850x567 and resized to 420px wide (`sips -Z 420`) to keep the
repo small; every use in the app is a thumbnail.

Each file is named after its exercise id, so `exercises.json` just points at
`assets/exercises/<id>.jpg`.

### Vetted, not bulk-imported

Every image was checked against the L5-S1 constraints in
`data/constraints.json` before being included. Four candidates were **rejected**:

| Rejected | Why |
| --- | --- |
| `Leg_Press` | 45° incline press, and the model's knees are well past 90°. Directly contradicts the `Max 90° knee flexion` limit on `seated-horizontal-leg-press`. An authoritative-looking photo of the banned depth is worse than no photo. |
| `Cable_Rope_Overhead_Triceps_Extension` | Standing and hinged forward. `overhead-rope-extension` specifically requires a seated high backrest — that backrest is the whole point of the exercise. |
| `Seated_Cable_Rows` | Seated but with an unsupported torso. The plan requires chest-supported rows. |
| `Machine_Bench_Press` | Fine, but a duplicate of `Leverage_Chest_Press`, which was the better shot. |

`chest-supported-row` uses `Lying_T-Bar_Row` — a T-bar rather than a dumbbell or
leverage row, but the chest is fully on the pad, which is the constraint that
matters.

### Still on line icons (8)

`cable-lateral-raise`, `overhead-rope-extension`, `chest-supported-rear-delt-fly`,
`seated-horizontal-leg-press`, `single-leg-glute-bridge`,
`half-kneeling-pallof-press`, `side-plank-knee-modified`, `bear-plank`.

These are mostly the constraint-driven substitutions — the unusual movements a
generic exercise database doesn't carry. Photographing your own gym is the fix.

## Adding your own

1. Drop a photo at `assets/exercises/<exercise-id>.jpg`.
2. Add `"image": "assets/exercises/<exercise-id>.jpg"` to that exercise.
3. Resize first: `sips -Z 420 <file>.jpg`.

Paths must be relative and same-origin — absolute URLs are rejected at render
time (see `equipmentIcon` in `src/icons/equipment.js`).
