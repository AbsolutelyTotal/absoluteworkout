# Exercise and muscle image sources

All 50 images (29 exercises, 21 muscles) are **generated**, not photographed:
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

Reviewed and accepted rather than re-rolled further. Fix these if you regenerate.

| Image | Issue |
| --- | --- |
| `pallof-press`, `half-kneeling-pallof-press` | The glow covers the whole midsection instead of just the flanks. Three phrasings were tried; the obliques sit directly beside the abs and the model does not reliably separate adjacent muscles in the same region. Position and machine are correct, which is what matters mid-workout. |
| `muscles/obliques.jpg` | Same adjacency problem — also tints the lower back. |
| `high-low-cable-fly` | The glow covers both pectorals in full rather than just the lower border. Same adjacency limit as the obliques: upper and lower chest are one muscle, and the model will not split it. Machine and position are correct. |
| `muscles/abductors.jpg` | Highlights the gluteus maximus instead of the medius/minimus, so it is currently indistinguishable from `glutes.jpg`. The prompt has been sharpened; regenerate with `--only abductors --force`. |
| `seated-horizontal-leg-press` | Shows a mid-to-extended knee angle, not the 90-degree stop. This is deliberate: asking for "the bottom of the press" made the model put both feet on the floor instead of the platform. The `formLimit` warning pill in the UI carries the 90-degree rule far more reliably than a rendered joint angle ever could. The image's job is machine recognition. |

## What went wrong along the way

Kept as notes for whoever regenerates these:

- **Degrees are ignored.** "30-degree incline" produced 45. Describing geometry
  against landmarks works — "about one third of the way up from flat to vertical".
- **Say what must NOT glow.** Naming only the target muscle produced a green wash
  over the whole torso. Adding "every other muscle stays in normal matte skin
  tone, no green spill" fixed it in one pass.
- **Say where the cable comes from.** Unspecified pulley height gave a tricep
  pushdown wired to a low pulley, which is not the exercise. Every cable
  movement now states pulley height and attachment.
- **Say "exactly one piece of equipment".** Renders kept adding a second cable
  tower behind the figure.
- **Lead with the body, not the rig.** The overhead extension resolved to a
  pulldown until the prompt described hand and elbow position first.
- **Never regenerate a style reference casually.** Doing so restyles all 45
  downstream images. `gen-images.mjs` now requires `--regen-reference`.
