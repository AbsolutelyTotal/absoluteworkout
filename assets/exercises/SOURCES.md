# Exercise and muscle image sources

All 47 images (27 exercises, 20 muscles) are **generated**, not photographed:
`gemini-3-pro-image` for the two style references, `gemini-3.1-flash-image` for
the rest. Prompts and the generator live in `tools/`.

Regenerate any single one:

```bash
export NODE_EXTRA_CA_CERTS="$HOME/.certs/checkpoint-harmony-sase.pem"   # Harmony SASE TLS interception
read -rs GEMINI_API_KEY && export GEMINI_API_KEY                        # session only, never a file
node tools/gen-images.mjs --only <id> --force
```

## Why generated rather than stock

An earlier pass used [Free Exercise DB](https://github.com/yuhonas/free-exercise-db)
(public domain). It was dropped because a generic library cannot respect the
L5-S1 constraints in `data/constraints.json`:

- Its leg press showed a 45-degree sled with the knees well past 90 degrees —
  the exact position `formLimit` forbids. An authoritative-looking photo of a
  banned position is worse than no photo.
- Its overhead extension was standing and hinged forward, where the plan
  requires a seated high backrest.
- Its rows had unsupported torsos where the plan requires chest support.
- It had nothing for the constraint-driven substitutions (single-leg glute
  bridge, knee-modified side plank, bear plank, half-kneeling Pallof).

Generated art fixes this: the prompt states the safe position.

## Style consistency

These models edit as much as they generate, so consistency comes from a
reference image, not from repeated adjectives. `machine-chest-press.jpg` and
`muscles/lats.jpg` are the references; every other prompt attaches one as
input. `tools/gen-images.mjs` refuses to regenerate a reference without
`--regen-reference`, because replacing one silently restyles the other 45.

## Known imperfections

Reviewed and accepted rather than re-rolled. Worth fixing if you regenerate:

| Image | Issue |
| --- | --- |
| `muscles/lower-back.jpg` | Highlights the upper/mid back, not the lumbar erectors. Factually wrong. Lowest-impact of the set, since `lower-back` is deliberately untargeted. |
| `muscles/obliques.jpg` | Highlights the front abdominal wall rather than the flanks. |
| `exercises/seated-horizontal-leg-press.jpg` | Only one leg on the platform, and caught near lockout so the 90-degree stop is not depicted. The machine type and flat spine are correct. |
| Upper-body exercise glow | The highlight covers most of the torso rather than one muscle — the prompt over-corrected away from an earlier too-small blob. The muscle images carry precise anatomy instead. |
