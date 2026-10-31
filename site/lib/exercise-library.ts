import type { Exercise, MetricKey, Modality } from "./training";

/**
 * The built-in S&C library, in code like the test catalogue: the same in demo
 * mode and in production, versioned with the app, and never seeded into the
 * database. Team-made exercises live in the `exercises` table instead.
 *
 * Keys are permanent. Logged sets point at them, so an exercise is renamed
 * here freely but never deleted or re-keyed.
 */

/** `easier` / `harder` are keys of other entries: the ladder a variant is suggested from. */
type Entry = [key: string, name: string, metrics: MetricKey[], options?: { unilateral?: boolean; velocity?: "mean" | "peak"; cue?: string; easier?: string; harder?: string }];

const barbell: MetricKey[] = ["reps", "load", "velocity", "rpe"];
const explosive: MetricKey[] = ["reps", "load", "velocity", "power"];

const catalogue: Record<Modality, Entry[]> = {
  strength: [
    ["goblet_squat", "Goblet squat", ["reps", "load", "rpe"], { cue: "Weight held at the chest, elbows inside the knees.", harder: "back_squat" }],
    ["back_squat", "Back squat", barbell, { velocity: "mean", cue: "Push the floor away, chest up.", easier: "goblet_squat", harder: "front_squat" }],
    ["front_squat", "Front squat", barbell, { velocity: "mean", cue: "Elbows high, torso upright.", easier: "back_squat" }],
    ["trap_bar_deadlift", "Trap bar deadlift", barbell, { velocity: "mean", cue: "Drive with the legs, bar close to the body." }],
    ["romanian_deadlift", "Romanian deadlift", ["reps", "load", "rpe"], { cue: "Hips back, soft knees, flat back." }],
    ["bw_split_squat", "Bodyweight split squat", ["reps", "rpe"], { unilateral: true, cue: "Back knee straight down to the floor, slow tempo.", harder: "rfe_split_squat" }],
    ["ssb_split_squat", "Safety bar split squat", barbell, { unilateral: true, velocity: "mean", cue: "Ballou's favourite: it shows fast who lacks control on one leg.", easier: "rfe_split_squat" }],
    ["rfe_split_squat", "Rear-foot elevated split squat", ["reps", "load", "rpe"], { unilateral: true, cue: "Knee over the toes, controlled on the way down.", easier: "bw_split_squat", harder: "ssb_split_squat" }],
    ["step_up", "Step-up", ["reps", "load", "height", "rpe"], { unilateral: true, cue: "Whole foot on the box, no push from the back leg." }],
    ["hip_thrust", "Hip thrust", ["reps", "load", "rpe"], { cue: "Chin tucked, full hip extension at the top." }],
    ["band_nordic", "Band-assisted Nordic", ["reps", "rpe"], { cue: "The band takes the top of the load — brake all the way down.", harder: "nordic_curl" }],
    ["nordic_curl", "Nordic hamstring curl", ["reps", "rpe"], { cue: "Brake as long as you can, straight line from knee to shoulder.", easier: "band_nordic" }],
    ["push_up", "Push-up", ["reps", "rpe"], { cue: "Straight body from heel to head, chest to a fist from the floor.", harder: "db_bench_press" }],
    ["bench_press", "Bench press", barbell, { velocity: "mean", cue: "Shoulders back and down, feet on the floor.", easier: "db_bench_press" }],
    ["db_bench_press", "Dumbbell bench press", ["reps", "load", "rpe"], { cue: "Controlled down, press together up.", easier: "push_up", harder: "bench_press" }],
    ["band_pull_up", "Band-assisted pull-up", ["reps", "rpe"], { cue: "Pick the band that gives clean reps.", harder: "pull_up" }],
    ["pull_up", "Pull-up", ["reps", "load", "rpe"], { cue: "From straight arms to chin over the bar.", easier: "band_pull_up" }],
    ["db_row", "One-arm dumbbell row", ["reps", "load", "rpe"], { unilateral: true, cue: "Elbow to the hip, don't twist the torso." }],
    ["landmine_press", "Landmine press", ["reps", "load", "rpe"], { unilateral: true, cue: "Press up and forward, brace the trunk." }],
  ],
  power: [
    ["speed_squat", "Speed squat", explosive, { velocity: "mean", cue: "Hamstrings to parallel, then up as fast as you can." }],
    ["trap_bar_jump", "Trap bar jump", explosive, { velocity: "peak", cue: "Short dip, explode up, soft landing." }],
    ["squat_jump", "Squat jump", explosive, { velocity: "peak", cue: "Light bar, maximum height every rep." }],
    ["split_squat_jump", "Split squat jump", explosive, { unilateral: true, velocity: "peak", cue: "Switch legs in the air, land in the same stance." }],
    ["push_press", "Push press", explosive, { velocity: "peak", cue: "Short dip with the legs, drive the bar up." }],
    ["speed_bench", "Speed bench", explosive, { velocity: "mean", cue: "Controlled down, explosive up." }],
  ],
  olympic: [
    ["hang_high_pull", "Hang high pull", explosive, { velocity: "peak", cue: "Hips through, elbows high — without catching the bar.", harder: "hang_power_clean" }],
    ["hang_power_clean", "Hang power clean", explosive, { velocity: "peak", cue: "From above the knee: hips through, pull yourself under the bar.", easier: "hang_high_pull", harder: "power_clean" }],
    ["power_clean", "Power clean", explosive, { velocity: "peak", cue: "Patient off the floor, accelerate past the knees.", easier: "hang_power_clean" }],
    ["hang_snatch", "Hang snatch", explosive, { velocity: "peak", cue: "Wide grip, bar close, get under fast." }],
  ],
  plyometric: [
    ["pogo_jump", "Pogo jumps", ["contacts", "rpe"], { cue: "Stiff ankles, short ground contact.", harder: "hurdle_hop" }],
    ["box_jump", "Box jump", ["contacts", "height"], { cue: "Land soft and quiet, step down — don't jump down.", harder: "drop_jump" }],
    ["drop_jump", "Drop jump", ["contacts", "height"], { cue: "Drop, shortest possible contact, as high as possible.", easier: "box_jump" }],
    ["hurdle_hop", "Hurdle hops", ["contacts", "height"], { cue: "Quick, stiff hops, knees up.", easier: "pogo_jump" }],
    ["single_leg_hop", "Single-leg hops", ["contacts", "distance"], { unilateral: true, cue: "Hold each landing for two seconds before the next." }],
    ["lateral_bound", "Lateral bounds", ["contacts", "distance"], { unilateral: true, cue: "From one leg to the other, stable landing." }],
  ],
  sprint: [
    ["acceleration_10", "Acceleration sprint", ["distance", "time"], { cue: "Low start, powerful pushes in the first steps." }],
    ["flying_10", "Flying 10 m", ["distance", "time"], { cue: "20 m run-up, top speed through the timing gates." }],
    ["sled_sprint", "Sled sprint", ["distance", "time", "load"], { cue: "Lean forward, short powerful steps." }],
    ["cod_505", "505 change of direction", ["distance", "time"], { cue: "Lower the centre of mass before the turn, explode out." }],
  ],
  "med-ball": [
    ["mb_chest_pass", "Med ball chest pass", ["reps", "load", "distance"], { cue: "From the chest, the whole body behind the throw." }],
    ["mb_rotational_throw", "Rotational med ball throw", ["reps", "load", "distance"], { unilateral: true, cue: "Power from the hips, the arms follow." }],
    ["mb_overhead_throw", "Overhead med ball throw", ["reps", "load", "distance"], { cue: "Reach long, throw through the ball — like a shot." }],
    ["mb_slam", "Med ball slam", ["reps", "load"], { cue: "Reach up, slam down with the whole body." }],
  ],
  conditioning: [
    ["run_intervals", "Running intervals", ["time", "distance", "rpe"], { cue: "Even pace through every rep." }],
    ["shuttle_runs", "Shuttle runs", ["time", "distance", "rpe"], { cue: "Low turn, fast out again." }],
    ["bike_intervals", "Bike intervals", ["time", "rpe"], { cue: "Hard in the work, easy in the rest." }],
  ],
  prep: [
    ["skadefri_warmup", "Injury-prevention warm-up", ["time"], { cue: "The whole programme (Skadefri, FIFA 11+ or similar), before every session." }],
    ["mobility_flow", "Mobility", ["time"], { cue: "Slow and controlled through the full range." }],
    ["activation", "Activation", ["time", "reps"], { cue: "Wake up the hips, shoulders and ankles." }],
  ],
  isometric: [
    ["imtp", "Isometric mid-thigh pull", ["time", "reps"], { cue: "Maximum intent from the first second." }],
    ["copenhagen_short", "Short-lever Copenhagen plank", ["time"], { unilateral: true, cue: "Knee on the bench — the same straight line, a shorter lever.", harder: "copenhagen_plank" }],
    ["copenhagen_plank", "Copenhagen plank", ["time"], { unilateral: true, cue: "Straight line from shoulder to foot.", easier: "copenhagen_short" }],
    ["iso_split_squat", "Isometric split squat", ["time", "load"], { unilateral: true, cue: "Hold the angle, push hard into the floor." }],
  ],
};

export const BUILTIN_EXERCISES: readonly Exercise[] = (Object.entries(catalogue) as [Modality, Entry[]][]).flatMap(([modality, entries]) =>
  entries.map(([key, name, metrics, options = {}]) => ({
    id: `builtin:${key}`,
    name,
    modality,
    metrics,
    unilateral: options.unilateral ?? false,
    velocityMetric: options.velocity ?? null,
    cue: options.cue ?? "",
    teamId: null,
    ...(options.easier || options.harder ? { suggestedVariants: { ...(options.easier ? { easier: `builtin:${options.easier}` } : {}), ...(options.harder ? { harder: `builtin:${options.harder}` } : {}) } } : {}),
  })));

export const MODALITY_ORDER: readonly Modality[] = ["prep", "plyometric", "sprint", "med-ball", "olympic", "power", "strength", "isometric", "conditioning"];

/** Built-ins first, then the team's own, each sorted by name. */
export function exerciseIndex(custom: readonly Exercise[] = []): Map<string, Exercise> {
  return new Map([...BUILTIN_EXERCISES, ...custom].map((exercise) => [exercise.id, exercise]));
}

/** Name contains the query, ignoring case; optionally one modality. Sorted by modality, then name. */
export function searchExercises(exercises: readonly Exercise[], query: string, modality: Modality | null): Exercise[] {
  const needle = query.trim().toLocaleLowerCase("en-GB");
  return exercises
    .filter((exercise) => (!modality || exercise.modality === modality) && (!needle || exercise.name.toLocaleLowerCase("en-GB").includes(needle)))
    .sort((a, b) => MODALITY_ORDER.indexOf(a.modality) - MODALITY_ORDER.indexOf(b.modality) || a.name.localeCompare(b.name, "en-GB"));
}
