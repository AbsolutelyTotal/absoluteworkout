# Exercise and muscle image sources

All 52 images (31 exercises, 21 muscles) are **generated illustrations**, produced
with `gemini-3.1-flash-image`. Prompts and the generator live in `tools/`.

Regenerate one:

```bash
export NODE_EXTRA_CA_CERTS="$HOME/.certs/checkpoint-harmony-sase.pem"   # Harmony SASE TLS interception
read -rs GEMINI_API_KEY && export GEMINI_API_KEY                        # session only, never a file
node tools/gen-images.mjs --only <id> --style illustrated --no-reference --force \
  --model gemini-3.1-flash-image
```

Muscles use `--style muscle-illustrated`. `--suffix <s>` writes to `<id>.<s>.jpg`
so a trial never overwrites a good image.

## Style

Four colours, no more: navy `#2B2C6B` outlines, butter `#FBD96B` equipment,
vermilion `#EF4A1F` for the target muscle, blush cream `#FDF2EA` ground. Heavy
poster-weight line work. Matches the koi-derived UI direction.

There is **no style reference image**. The style block is prescriptive enough on
its own, which avoids the failure mode where regenerating a reference silently
restyles everything downstream.

## Verifying a batch

`mocks/hue.html` samples pixel hues across all 52 and reports any image
containing green, or any exercise with no highlighted muscle at all. Run it after
every batch — a thumbnail scan will not catch either.

## What went wrong, kept as notes

Every one of these cost a re-run. The pattern throughout: **naming the failure
mode explicitly beats describing the desired outcome.**

- **Say where a mechanism pivots from.** "Chest press, not a pec deck" failed
  three times. "The lever arms pivot from a low point near the base and rise up
  and forward to the handles" worked first time. Expect the same for any machine
  with a distinctive arm path.
- **Ban the wrong colour, don't just name the right one.** Five exercises came
  out green even after every prompt said vermilion — green is the conventional
  colour for muscle diagrams. Only "there must be NO GREEN ANYWHERE, green is
  wrong here" fixed it.
- **Colour and treatment belong to the style block, never the item prompt.**
  Thirty item prompts still said "glow lime" from the 3D era, directly
  contradicting the style block. The item prompt wins. Item prompts name the
  muscle; the style block owns how it is rendered.
- **State that an unhighlighted image is invalid.** One exercise came back with
  no highlight at all — visually clean, silently useless.
- **Specify line weight.** Hairlines vanish at the 88px row size. "Thick, heavy
  outlines, like a silkscreen poster; must read at postage-stamp size."
- **Degrees are ignored.** "30-degree incline" gave 45. Describe the body instead:
  "torso much closer to horizontal than vertical, head barely above the hips".
- **Don't over-correct framing.** "Better to crop the machine off than leave empty
  space" cropped the machine out entirely. A medium shot with the whole subject
  visible is the target.
- **Say "exactly one piece of equipment"** or a second cable tower appears behind
  the figure. Exception: a cable crossover legitimately has two columns.

