// absoluteworkout — data schema
//
// Reference documentation, not compiled. The JSON files are the source of truth.
//
// Five files, each a flat array:
//   profiles.json            — constraint profiles. Each split belongs to one.
//   muscles.json             — anatomy. Stable; you shouldn't need to touch it.
//   exercises.json           — the constraint-safe library. Always loaded.
//   exercises-extended.json  — movements only unrestricted profiles may use.
//   splits.json              — the programs. Prescriptions reference exercises by id.
//
// Rule: exercises.json describes *what a movement is*; splits.json describes
// *how you're training it right now*. Sets/reps/rest never live on an Exercise —
// the same bench press is 5x5 on one split and 3x12 on another.

// ---------------------------------------------------------------------------
// profiles.json
// ---------------------------------------------------------------------------
//
// A constraint profile. Each Split belongs to exactly one, via Split.profileId.
//
// SAFETY MODEL — read before changing this. Restriction works by *loading*, not
// by filtering: `data/exercises-extended.json` (squats, deadlifts, RDLs,
// standing presses, bent-over rows, crunches, carries) is fetched ONLY when the
// active profile sets allowExtendedLibrary: true. For a restricted profile those
// exercises never enter memory, so the picker, `alternatives` and the swap flow
// are safe without knowing profiles exist.
//
// The tempting alternative — one library, each exercise tagged, filtered at
// render time — inverts the guarantee. Safety would then depend on every call
// site filtering correctly, and one missed site offers a banned movement. Here a
// bug can only ever hide an exercise, never surface a contraindicated one.
//
// A Split with no profileId, or an unknown one, resolves to the most restrictive
// profile. Fail closed.

export interface Profile {
  id: string;                    // slug, e.g. "l5s1"
  name: string;                  // shown in the Plan view: "constraints: <name>"
  summary?: string;              // one line
  constraintsRef?: string;       // path to the full rule document
  allowExtendedLibrary: boolean; // true only for profiles with no exclusions
}

// ---------------------------------------------------------------------------
// muscles.json
// ---------------------------------------------------------------------------

/** Roll-up bucket for weekly volume accounting. */
export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms";

export interface Muscle {
  id: string;                 // slug, e.g. "lats"
  name: string;               // display, e.g. "Lats"
  group: MuscleGroup;         // volume roll-up bucket
  region: "upper" | "lower" | "core";

  /** Weekly working-set target range, [min, max]. Drives the target band in the
   *  history chart. Omit for muscles you don't track a target for. */
  weeklySetTarget?: [number, number];
}

// ---------------------------------------------------------------------------
// exercises.json
// ---------------------------------------------------------------------------

export type MovementPattern =
  | "horizontal-push"
  | "vertical-push"
  | "horizontal-pull"
  | "vertical-pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "carry"
  | "isolation"
  | "core";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "smith"
  | "bodyweight"
  | "kettlebell"
  | "band";

/** How the spine is supported during the movement. Central to this plan: the
 *  L5-S1 constraints in constraints.json require a pad or backrest for all
 *  upper-body pressing and pulling. */
export type Support =
  | "chest-supported"
  | "high-back-seat"
  | "incline-bench"
  | "supine-bench"
  | "supine-floor"
  | "seated-thigh-pad"
  | "seated-upright"
  | "half-kneeling"
  | "side-lying"
  | "quadruped"
  | "standing-braced"
  | "hanging";

export interface Exercise {
  id: string;                   // slug, e.g. "incline-db-press"
  name: string;                 // display, e.g. "Incline Dumbbell Press"
  aliases?: string[];           // searchable alternates, e.g. ["30 degree db press"]

  pattern: MovementPattern;
  equipment: Equipment[];       // more than one when a variation is allowed

  /** Key into the machine icon set in src/icons/equipment.js. Falls back to the
   *  first `equipment` entry, then a generic glyph — a missing key never breaks
   *  a render. */
  icon?: string;

  /** Self-hosted photo or illustration of the station, e.g.
   *  "assets/exercises/leg-press.webp". Takes precedence over `icon`. Must be a
   *  relative same-origin path — absolute URLs are rejected at render time.
   *  This is the upgrade path from the placeholder line art. */
  image?: string;

  /** External form-demo video. Rendered as a "▶ form demo" link, not embedded,
   *  so no third-party script or tracker loads on the page. */
  demoUrl?: string;

  support?: Support;

  /** Hard execution limit shown as a warning pill in the UI, e.g.
   *  "Max 90° knee flexion" on the leg press. Use only for real safety stops,
   *  not general form advice — that belongs in `cues`. */
  formLimit?: string;

  /** Muscle ids. Primary counts 1.0 toward weekly set volume, secondary 0.5 —
   *  the standard hypertrophy accounting. Every id must exist in muscles.json. */
  primaryMuscles: string[];
  secondaryMuscles?: string[];

  /** true when sets are performed per-side. The logger prompts per side and
   *  volume counts the set once, not twice. */
  unilateral?: boolean;

  cues?: string[];              // 1-3 short execution cues, shown in the session view
  setupNotes?: string;          // rig/pin/seat settings worth remembering
  alternatives?: string[];      // exercise ids — swap when the station is taken
}

// ---------------------------------------------------------------------------
// splits.json
// ---------------------------------------------------------------------------

export interface Split {
  id: string;                   // slug, e.g. "core-3"
  name: string;                 // display, e.g. "3-Day Core Split"

  /** Which Profile's constraints this split runs under. Absent or unknown =>
   *  the most restrictive profile. See the safety note above profiles.json. */
  profileId?: string;

  daysPerWeek: number;          // 3 or 4 today; the schema doesn't care
  description?: string;         // one line, shown under the split picker
  defaultTempo?: string;        // e.g. "3:1:2:1" — applies unless a Prescription overrides

  /** Ordered day ids forming the rotation. May repeat a day id if the cycle
   *  hits it twice. The "next session" suggestion walks this list. */
  cycle: string[];

  days: Day[];
}

export interface Day {
  id: string;                   // slug, unique within the split, e.g. "push"
  name: string;                 // display, e.g. "Push & Anti-Rotation Core"
  shortName?: string;           // for the day chips, e.g. "Push"
  focus: string[];              // headline muscle groups, shown as badges
  notes?: string;               // warm-up protocol, session intent

  /** Optional grouping — "Main", "Accessory", "Finisher". Use a single
   *  unnamed block if you don't want the sub-headings. */
  blocks: Block[];
}

export interface Block {
  name?: string;
  items: Prescription[];
}

/** How one exercise is trained on one day of one split. */
export interface Prescription {
  exerciseId: string;           // must exist in exercises.json
  sets: number;
  reps: string;                 // "8-10" | "12" | "AMRAP" | "30s"

  /** Pick whichever you actually program against; all are optional. */
  intensity?: {
    rir?: string;               // reps in reserve, e.g. "1-2"
    rpe?: string;               // e.g. "8"
    percent1RM?: string;        // e.g. "75%"
  };

  restSeconds?: number;
  tempo?: string;               // e.g. "3-1-1-0" (ecc-pause-con-pause)
  notes?: string;

  /** exerciseId to superset with. Both entries should point at each other;
   *  the session view renders them as A1 / A2. */
  supersetWith?: string;

  /** Progression rule in plain words, e.g.
   *  "+2.5kg when you hit the top of the range on all sets". */
  progression?: string;
}

// ---------------------------------------------------------------------------
// localStorage (written by the app, never checked into git)
// ---------------------------------------------------------------------------
//
// Key: "absoluteworkout.v1". `version` gates migrations — bump it and add a
// migration in store.js rather than silently reinterpreting old shapes.
// Logged data is the one thing here that can't be regenerated, so the app
// ships JSON export/import; treat that file as a backup.

export interface PersistedState {
  version: 1;
  settings: Settings;
  sessions: LoggedSession[];
}

export interface Settings {
  activeSplitId: string;
  unit: "kg" | "lb";
  /** Weekly set target band drawn on the volume chart, when a muscle has no
   *  explicit weeklySetTarget. */
  defaultSetTarget: [number, number];
}

export interface LoggedSession {
  id: string;                   // "<iso timestamp>-<dayId>"
  date: string;                 // "YYYY-MM-DD" (local date, for weekly bucketing)
  splitId: string;
  dayId: string;
  startedAt: string;            // ISO 8601
  completedAt?: string;         // absent while in progress
  entries: LoggedEntry[];
  bodyweight?: number;
  notes?: string;
}

export interface LoggedEntry {
  exerciseId: string;
  /** Set when this exercise stood in for the prescribed one, so history still
   *  attributes the volume correctly. */
  substitutedFor?: string;
  /** Added mid-session via the picker rather than coming from the split. Only
   *  these can be removed again — a prescribed exercise stays on the list even
   *  if you skip it, so the plan is still visible. */
  addedDuringSession?: boolean;
  sets: LoggedSet[];
}

export interface LoggedSet {
  weight: number | null;        // in Settings.unit
  reps: number | null;
  rir?: number;
  done: boolean;                // only done sets count toward volume
}
