// absoluteworkout — data schema
//
// Reference documentation, not compiled. The JSON files are the source of truth.
//
// Three files, each a flat array:
//   muscles.json    — anatomy. Stable; you shouldn't need to touch it.
//   exercises.json  — the exercise library. One entry per movement, reused across splits.
//   splits.json     — the programs. Prescriptions reference exercises by id.
//
// Rule: exercises.json describes *what a movement is*; splits.json describes
// *how you're training it right now*. Sets/reps/rest never live on an Exercise —
// the same bench press is 5x5 on one split and 3x12 on another.

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

export interface Exercise {
  id: string;                   // slug, e.g. "barbell-bench-press"
  name: string;                 // display, e.g. "Barbell Bench Press"
  aliases?: string[];           // searchable alternates, e.g. ["flat bench"]

  pattern: MovementPattern;
  equipment: Equipment[];       // more than one when a variation is allowed

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
  demoUrl?: string;             // link to a form demo
}

// ---------------------------------------------------------------------------
// splits.json
// ---------------------------------------------------------------------------

export interface Split {
  id: string;                   // slug, e.g. "ppl-3"
  name: string;                 // display, e.g. "Push / Pull / Legs"
  daysPerWeek: number;          // 3 or 4 today; the schema doesn't care
  description?: string;         // one line, shown under the split picker

  /** Ordered day ids forming the rotation. May repeat a day id if the cycle
   *  hits it twice. The "next session" suggestion walks this list. */
  cycle: string[];

  days: Day[];
}

export interface Day {
  id: string;                   // slug, unique within the split, e.g. "push"
  name: string;                 // display, e.g. "Push"
  focus: MuscleGroup[];         // headline muscle groups, shown as badges
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
  sets: LoggedSet[];
}

export interface LoggedSet {
  weight: number | null;        // in Settings.unit
  reps: number | null;
  rir?: number;
  done: boolean;                // only done sets count toward volume
}
