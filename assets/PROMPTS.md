# Image generation prompts

For generating the exercise and muscle art with Nano Banana (Gemini image model).

**47 images:** 27 exercises + 20 muscles.

---

## How to use this

### 1. Generate ONE reference image first

Nano Banana is an image *editing* model, not just a text-to-image model. The way
to get 47 images that look like one set is:

1. Generate `machine-chest-press` (below). Iterate until the style is right —
   the figure, the lighting, the equipment finish, the background.
2. For every subsequent image, **attach that first image as input** and prompt
   *"Same figure, same style, same lighting and background. Now show him doing
   …"*.

Style consistency comes from the reference image, not from repeating adjectives.
Prompting all 47 from text alone will give you 47 different-looking people.

### 2. Paste the style block before every prompt

Even with a reference image, keep the style block. It's the second half of the
consistency mechanism.

### 3. Aspect ratios

- **Exercises: 3:2 landscape.** The app renders them at 78×52 in a row and
  full-size in a lightbox. Non-3:2 will crop badly.
- **Muscles: 1:1 square** (front and back figure side by side).

### 4. Save and install

Filenames below are exact — they match the ids in `exercises.json` and
`muscles.json`.

```bash
# exercises → assets/exercises/<exercise-id>.jpg
sips -Z 420 assets/exercises/*.jpg      # shrink; every use is a thumbnail

# muscles → assets/muscles/<muscle-id>.jpg
sips -Z 320 assets/muscles/*.jpg
```

Then set `"image": "assets/exercises/<id>.jpg"` on each exercise. The 19 stock
photos currently in place will be replaced — including the leg press, which
right now has **no** photo precisely because every stock option violated the
90° depth limit. A generated one can get it right.

---

## THE STYLE BLOCK

Paste this before every prompt.

> Clean semi-realistic 3D render, matte finish, no photorealistic skin pores.
> A single athletic adult man, mid-30s, short dark hair, plain charcoal athletic
> t-shirt and shorts, no logos or text on clothing. Gym equipment in desaturated
> mid-grey brushed steel with matte black padding. Seamless dark charcoal
> background, colour #1C1F27 — no floor line, no room, no windows, no other
> people, no gym clutter, no weight plates lying around. Soft broad key light
> from the upper left, gentle rim light on the far edge, no harsh shadows.
> The working muscle glows softly in translucent lime green #D3F26A beneath the
> skin, like an anatomical overlay. Absolutely no text, numbers, logos,
> watermarks, arrows or labels anywhere in the image.

**Why the lime overlay:** it's the app's accent colour, and it makes each image
do double duty — you learn the machine *and* what it trains from one picture.
This is the thing you liked about Deltabolic's posts.

> [!IMPORTANT]
> Every position below is written to match the L5-S1 constraints in
> `data/constraints.json`. Don't loosen them for a better-looking image — a
> picture of the banned position is worse than no picture, because it looks
> authoritative. The leg press depth and the "seated, not standing" details are
> the ones that matter most.

---

## EXERCISES (27) — 3:2 landscape

### Chest

**`machine-chest-press.jpg`** ← generate this one FIRST as your style reference
> Three-quarter side view. He is seated in a chest press machine with his back
> flat against a tall vertical backrest, pressing two horizontal handles forward
> to almost-straight arms, elbows drawing together at the end of the press.
> Feet flat on the floor. Mid-chest glowing lime.

**`incline-db-press.jpg`**
> Side view. He lies on a bench set to a shallow 30-degree incline — clearly
> closer to flat than to upright — pressing two dumbbells up and slightly
> together. Glutes and lower back flat on the pad, no arch. Elbows tucked at
> roughly 45 degrees from the torso. Upper chest glowing lime.

**`incline-smith-press.jpg`**
> Side view. He lies on a 30-degree incline bench inside a Smith machine, hands
> on the fixed barbell that runs on two vertical steel rails either side.
> Bar lowered to upper-chest level. Back flat on the pad. Upper chest glowing lime.

**`flat-bench-press.jpg`**
> Side view. He lies on a flat bench pressing a barbell, glutes firmly on the
> bench, lower back flat with no arch at all, feet planted. Bar at mid-chest.
> Mid and lower chest glowing lime.

**`pec-deck-fly.jpg`**
> Front three-quarter view. He is seated in a pec deck machine, back against the
> vertical pad, forearms against two tall vertical pads, bringing them together
> in front of his chest with elbows slightly bent. Mid-chest glowing lime.

### Shoulders

**`machine-shoulder-press.jpg`**
> Side view. He is seated in a shoulder press machine with a tall backrest
> supporting his whole spine, pressing two handles vertically overhead. Torso
> upright and still, not leaning back. Front deltoids glowing lime.

**`seated-db-lateral-raise.jpg`**
> Front view. He sits upright on the end of a bench, torso perfectly vertical
> and motionless, raising two dumbbells out sideways to exactly shoulder height,
> leading with the elbows, arms slightly bent, shoulders down not shrugged.
> Side deltoids glowing lime.

**`cable-lateral-raise.jpg`**
> Front three-quarter view. He sits upright on a bench beside a cable tower,
> one arm raising a single low-pulley cable handle out sideways to shoulder
> height across his body. Torso vertical and still. Side deltoid of the working
> arm glowing lime.

**`chest-supported-rear-delt-fly.jpg`**
> Side three-quarter view. He lies chest-down on a bench inclined at about 40
> degrees, chest and stomach fully supported on the pad, head above the top of
> the bench, raising two dumbbells out sideways and slightly up with bent arms.
> Rear deltoids glowing lime. His torso must be clearly resting on the pad —
> never hinged over unsupported.

**`reverse-pec-deck.jpg`**
> Side three-quarter view. He sits facing into a reverse pec deck machine with
> his chest against the front pad, sweeping two handles backwards and outwards.
> Rear deltoids glowing lime.

### Triceps

**`overhead-rope-extension.jpg`**
> Side view. He is seated on a bench with a **tall high backrest**, back flat
> against it, holding a rope attachment overhead behind his head and extending
> his arms forward and up. Elbows tucked close to the head. The high backrest
> must be clearly visible and clearly supporting his lower back. Triceps glowing
> lime.

**`tricep-pushdown.jpg`**
> Side view. He stands upright and braced at a cable tower, elbows pinned to his
> sides, pushing a straight bar attachment straight down to full extension.
> Torso vertical, no forward lean. Triceps glowing lime.

### Back

**`lat-pulldown.jpg`**
> Front three-quarter view. He is seated at a lat pulldown machine with his
> thighs secured under a padded restraint, pulling a wide bar down toward his
> upper chest, elbows driving down toward his ribs. Chest tall, minimal lean.
> Lats glowing lime.

**`assisted-pullup.jpg`**
> Front view. He hangs from a pull-up bar on an assisted pull-up machine, knees
> resting on a padded platform that counterbalances him, pulling his chest up
> toward the bar. Lats glowing lime.

**`chest-supported-row.jpg`**
> Side three-quarter view. He lies chest-down on a bench inclined at about 40
> degrees with his chest fully on the pad, rowing two dumbbells up and back,
> driving the elbows past his ribs and squeezing the shoulder blades. Upper back
> and lats glowing lime. The chest must be visibly in contact with the pad.

**`straight-arm-cable-pushdown.jpg`**
> Side view. He stands upright and braced facing a high cable pulley, arms
> almost straight, sweeping a straight bar down in an arc from head height to
> his thighs, hinging only at the shoulders. Ribs down, torso rigid. Lats and
> abdominals both glowing lime.

### Biceps

**`incline-db-curl.jpg`**
> Side view. He sits back on a bench inclined at about 50 degrees, arms hanging
> straight down and slightly behind the line of his torso, curling two dumbbells
> up. Biceps glowing lime.

**`cable-curl.jpg`**
> Side view. He stands upright at a low cable pulley, elbows tucked at his
> sides, curling a straight bar attachment up. Torso vertical and still. Biceps
> glowing lime.

### Legs

**`seated-horizontal-leg-press.jpg`** ← the safety-critical one
> Side view. He is seated in a **horizontal** seated leg press — the type where
> the seat is upright with a tall backrest and the foot platform is directly in
> front at roughly hip height, **not** a 45-degree angled sled. His back is flat
> against the backrest and his **knees are bent to exactly 90 degrees, no
> deeper** — thighs and shins forming a clean right angle, hips staying square
> against the seat. Quads and glutes glowing lime.
>
> Reject any result where the knees come closer to the chest than 90 degrees, or
> where the machine is an inclined sled. Deeper flexion rounds the lower spine,
> which is the single riskiest thing in this whole plan.

**`leg-extension.jpg`**
> Side view. He is seated in a leg extension machine, back against a tall
> backrest, shins behind a padded roller, extending both legs out to straight
> without locking the knees hard. Quads glowing lime.

**`seated-hamstring-curl.jpg`**
> Side view. He is seated in a seated hamstring curl machine with a tall
> backrest and a thigh restraint pad, pulling his heels down and back under the
> seat against a padded roller. Hamstrings glowing lime.

**`single-leg-glute-bridge.jpg`**
> Side view. He lies face-up on the floor on an exercise mat, one knee bent with
> that foot flat on the floor, the other leg extended straight out. He drives
> his hips up so his torso and extended leg form a straight line, ribs down, no
> lower-back arch. Glutes glowing lime.

**`seated-calf-raise.jpg`**
> Side view. He is seated upright in a seated calf raise machine, a padded bar
> across his thighs, the balls of his feet on a small platform, heels pressed up
> at the top of the movement. Calves glowing lime.

### Core

**`pallof-press.jpg`**
> Front three-quarter view. He stands upright and braced side-on to a cable
> stack set at chest height, both hands pressing a single handle straight out in
> front of his sternum, resisting the cable's pull to twist him. Torso square
> and unrotated, ribs down. Obliques and abdominals glowing lime.

**`half-kneeling-pallof-press.jpg`**
> Front three-quarter view. He is in a half-kneeling position — one knee down on
> a mat, the other foot forward and flat, torso tall and vertical — side-on to a
> chest-height cable stack, pressing a handle straight out in front of his
> sternum with both hands. Torso square and unrotated. Obliques and abdominals
> glowing lime.

**`side-plank-knee-modified.jpg`**
> Side view slightly above. He holds a side plank on a mat, supported on one
> forearm with the elbow under the shoulder and **both knees bent and resting on
> the mat**, forming a straight line from knee to shoulder. Hips lifted and
> stacked, not sagging. Obliques glowing lime.

**`bear-plank.jpg`**
> Side view slightly above. He is on a mat on hands and toes with knees bent at
> 90 degrees and hovering roughly an inch off the floor, back completely flat
> and level, ribs down. Abdominals glowing lime.

---

## MUSCLES (20) — 1:1 square

These replace the schematic SVG body map in the Library. Same style block, plus:

> **Muscle-image variant of the style block:** Two views of the same standing
> figure side by side in one square image — anterior (front) view on the left,
> posterior (back) view on the right. Neutral standing pose, arms hanging
> slightly away from the body, feet shoulder-width. Both figures the same size,
> aligned, evenly lit. The whole body in matte neutral grey-tan; **only the named
> muscle** rendered in bright lime green #D3F26A. Every other muscle stays
> neutral. No text, no labels, no leader lines.

Generate one of these first too — `lats.jpg` is a good reference since it's
clearly visible and unambiguous — then use it as the input image for the other 19
so the figure and framing stay identical.

| Filename | Highlight | Visible on |
| --- | --- | --- |
| `upper-chest.jpg` | Clavicular pectoralis, upper chest just below the collarbones | front |
| `mid-chest.jpg` | Main body of the pectoralis major, mid chest | front |
| `lower-chest.jpg` | Lower border of the pectoralis, just above the ribs | front |
| `lats.jpg` | Latissimus dorsi, the broad wings down the sides of the back | back |
| `upper-back.jpg` | Rhomboids and mid-trapezius between the shoulder blades | back |
| `traps.jpg` | Trapezius, the diamond from neck to mid-back | back (and top of front) |
| `lower-back.jpg` | Erector spinae, the columns either side of the lower spine | back |
| `front-delts.jpg` | Anterior deltoid, front of both shoulders | front |
| `side-delts.jpg` | Lateral deltoid, the outer cap of both shoulders | both |
| `rear-delts.jpg` | Posterior deltoid, rear of both shoulders | back |
| `biceps.jpg` | Biceps brachii, front of both upper arms | front |
| `triceps.jpg` | Triceps brachii, back of both upper arms | back |
| `forearms.jpg` | Forearm flexors and extensors, both lower arms | both |
| `quads.jpg` | Quadriceps, front of both thighs | front |
| `hamstrings.jpg` | Hamstrings, back of both thighs | back |
| `glutes.jpg` | Gluteus maximus, both buttocks | back |
| `adductors.jpg` | Adductors, inner thighs | front |
| `calves.jpg` | Gastrocnemius and soleus, back of both lower legs | back (and sides of front) |
| `abs.jpg` | Rectus abdominis, the central abdominal column | front |
| `obliques.jpg` | Obliques, the sides of the waist | front |

For a muscle listed as visible on one view only, leave the other view entirely
neutral — that contrast is informative, it tells you which side of the body the
muscle is on.

---

## Checklist before you commit them

- [ ] All 47 look like the same figure in the same room
- [ ] Exercises are 3:2, muscles are 1:1
- [ ] No text, logos or watermarks crept in (image models love adding gym signage)
- [ ] **Leg press knees are at 90°, and it's a horizontal press not a 45° sled**
- [ ] Lateral raises, shoulder press and overhead extension are all clearly *seated*
- [ ] Chest-supported row and rear delt fly show the chest *on the pad*
- [ ] Resized (`sips -Z 420` exercises, `sips -Z 320` muscles)
- [ ] Filenames match the ids exactly, no spaces or capitals
