// Pose library. See rig.ts for the rotation conventions. Handy rule for the katana (blade = hand +Z):
// with no sideways rotation, the blade points along (0, −sin φ, cos φ) where φ = arm.x + fore.x + hand.x
// (φ 0 = forward, −π/2 = up, π/2 = down, π = back); hand.x = π/2 lines the blade up with the forearm.
import type { Key, Pose } from "./rig";

const PI = Math.PI;

// ── Procedural locomotion ─────────────────────────────────────────────────────────────
export type GaitStyle = { lean: number; armSwing: number; stride: number; bounce: number; knee: number };
export const GAIT_HERO: GaitStyle = { lean: 0.45, armSwing: 0.15, stride: 1.0, bounce: 0.06, knee: 1.4 };

/** Legs, bob and arm swing for a run cycle at `phase`, blended by speed (0..1). */
export function gait(phase: number, k: number, g: GaitStyle): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const amp = 0.95 * g.stride * k;
  return {
    y: -g.bounce * k - g.bounce * k * Math.cos(phase * 2),
    spine: [g.lean * k, s * 0.12 * k, 0],
    head: [-g.lean * 0.7 * k, -s * 0.1 * k, 0],
    thighR: [-s * amp, 0, -0.03],
    shinR: [0.15 + Math.max(0, c) * g.knee * k, 0, 0],
    thighL: [s * amp, 0, 0.03],
    shinL: [0.15 + Math.max(0, -c) * g.knee * k, 0, 0],
    armR: [s * g.armSwing * k, 0, -0.15],
    foreR: [-0.5 - Math.max(0, s) * 0.5 * k, 0, 0],
    armL: [-s * g.armSwing * k, 0, 0.15],
    foreL: [-0.5 - Math.max(0, -s) * 0.5 * k, 0, 0],
  };
}

// ── Hero ──────────────────────────────────────────────────────────────────────────────
export const IDLE: Pose = {
  y: -0.08,
  hips: [0, 0.35, 0],
  spine: [0.14, -0.3, 0],
  head: [-0.06, -0.1, 0],
  thighL: [-0.38, 0, 0.12],
  shinL: [0.42, 0, 0],
  thighR: [0.32, 0, -0.14],
  shinR: [0.38, 0, 0],
  armR: [-0.55, 0, -0.25],
  foreR: [-0.75, 0, 0],
  handR: [0.5, 0, 0],
  armL: [-0.15, 0, 0.4],
  foreL: [-0.6, 0, 0],
};

/** Upper body while running with the katana: arms swept back, blade trailing (ninja run). */
export const RUN_UPPER: Pose = {
  armR: [0.95, 0, -0.35],
  foreR: [-0.3, 0, 0],
  handR: [2.5, 0, 0],
  armL: [0.95, 0, 0.35],
  foreL: [-0.3, 0, 0],
};

export const AIM: Pose = {
  y: -0.06,
  spine: [0.06, 0, 0],
  head: [0, 0, 0],
  armR: [-1.48, 0, 0.1],
  foreR: [-0.04, 0, 0],
  armL: [-1.48, 0, -0.1],
  foreL: [-0.04, 0, 0],
  thighL: [-0.3, 0, 0.12],
  shinL: [0.3, 0, 0],
  thighR: [0.25, 0, -0.12],
  shinR: [0.3, 0, 0],
};

/** Arms for aiming while moving (legs come from the gait). */
export const AIM_UPPER: Pose = {
  armR: [-1.48, 0, 0.1],
  foreR: [-0.04, 0, 0],
  armL: [-1.48, 0, -0.1],
  foreL: [-0.04, 0, 0],
};

export const RELOAD_UPPER: Pose = {
  armR: [-0.55, 0, -0.45],
  foreR: [-1.25, 0, 0],
  armL: [-0.55, 0, 0.45],
  foreL: [-1.25, 0, 0],
  head: [0.35, 0, 0],
};

const LUNGE_LEGS: Pose = {
  thighL: [-0.75, 0, 0.12],
  shinL: [0.85, 0, 0],
  thighR: [0.6, 0, -0.12],
  shinR: [0.25, 0, 0],
};

export const DASH: Pose = {
  y: -0.22,
  spine: [0.95, 0, 0],
  head: [-0.8, 0, 0],
  armR: [1.2, 0, -0.3],
  foreR: [-0.2, 0, 0],
  handR: [2.4, 0, 0],
  armL: [1.2, 0, 0.3],
  foreL: [-0.2, 0, 0],
  thighL: [-1.0, 0, 0.1],
  shinL: [1.2, 0, 0],
  thighR: [0.9, 0, -0.1],
  shinR: [0.6, 0, 0],
};

export const PARRY: Pose = {
  y: -0.16,
  hips: [0, 0.2, 0],
  spine: [0.05, -0.2, 0],
  head: [0.15, 0, 0],
  armR: [-1.25, 0, -0.35],
  foreR: [-1.0, 0, 0],
  handR: [0, 1.57, 0],
  armL: [-1.3, 0, 0.5],
  foreL: [-1.2, 0, 0],
  thighL: [-0.5, 0, 0.15],
  shinL: [0.6, 0, 0],
  thighR: [0.4, 0, -0.2],
  shinR: [0.5, 0, 0],
};

export const HURT: Pose = {
  y: -0.05,
  spine: [-0.4, 0.2, 0],
  head: [-0.45, 0, 0],
  armR: [-0.6, 0, -0.8],
  foreR: [-0.4, 0, 0],
  handR: [0.5, 0, 0],
  armL: [-0.6, 0, 0.8],
  foreL: [-0.4, 0, 0],
  thighL: [-0.2, 0, 0.1],
  shinL: [0.3, 0, 0],
  thighR: [0.3, 0, -0.1],
  shinR: [0.2, 0, 0],
};

/** Lying-on-the-ground limbs (used with the whole body rotated flat). */
export const DEAD: Pose = {
  y: 0,
  spine: [0, 0, 0],
  head: [-0.3, 0.5, 0],
  armR: [-0.4, 0, -1.3],
  foreR: [-0.3, 0, 0],
  armL: [-0.2, 0, 1.1],
  foreL: [-0.6, 0, 0],
  thighL: [-0.2, 0, 0.3],
  shinL: [0.4, 0, 0],
  thighR: [0.1, 0, -0.25],
  shinR: [0.1, 0, 0],
};

export const WRATH_ROAR: Pose = {
  y: -0.2,
  spine: [-0.35, 0, 0],
  head: [-0.6, 0, 0],
  armR: [-0.4, 0, -1.3],
  foreR: [-0.9, 0, 0],
  handR: [1.2, 0, 0],
  armL: [-0.4, 0, 1.3],
  foreL: [-0.9, 0, 0],
  thighL: [-0.3, 0, 0.35],
  shinL: [0.6, 0, 0],
  thighR: [0.3, 0, -0.35],
  shinR: [0.6, 0, 0],
};

export const CHARGE: Pose = {
  y: -0.3,
  hips: [0, -0.6, 0],
  spine: [0.35, -0.7, 0],
  head: [-0.2, 0.6, 0],
  armR: [0.5, 0, -0.5],
  foreR: [-0.4, 0, 0],
  handR: [2.3, 0, 0],
  armL: [-1.2, 0, 0.6],
  foreL: [-0.4, 0, 0],
  ...LUNGE_LEGS,
};

// ── Katana combo ──────────────────────────────────────────────────────────────────────
export type SlashFx = {
  /** Roll of the swing plane around the facing axis (0 = horizontal, ±π/2 = vertical). */
  roll: number;
  /** false = sweeps toward the hero's right, true = toward the left. */
  left: boolean;
  sweep: number;
  radius: number;
  height: number;
  /** Rotates the arc's centre away from the facing direction (radians, + = left). */
  offset?: number;
  width?: number;
};

export type SlashDef = {
  id: string;
  dur: number;
  hitAt: number;
  /** From here a buffered attack chains into the next step. */
  cancelAt: number;
  dmg: number;
  range: number;
  /** Half-angle of the hit cone. */
  cone: number;
  lunge: number;
  knock: number;
  launch?: number;
  heavy?: boolean;
  /** Number of hits (multi-hit spins), spread over [hitAt, hitAt + span]. */
  hits?: number;
  span?: number;
  spin?: number;
  keys: Key[];
  fx: SlashFx;
  /** Second arc drawn with the first (crossing cuts). */
  fx2?: SlashFx;
  /** Draw the arc on every hit of a multi-hit move, not just the first. */
  repeatFx?: boolean;
  /** How the move looks and hits: arc (blade swing), punch, slam (ground shockwave), chain/lash (glaive disc on its chain), throw (glaive ricochet). */
  style?: "arc" | "punch" | "slam" | "chain" | "lash" | "throw";
  /** Fist that lands the punch. */
  hand?: "R" | "L";
  /** Damage multiplier against airborne (juggled) enemies. */
  airBonus?: number;
  /** Keep moving forward at this speed for the whole move (steerable). */
  travel?: number;
};

const S1A: Pose = {
  y: -0.12,
  hips: [0, -0.5, 0],
  spine: [0.15, -0.65, 0],
  head: [0, 0.6, 0],
  armR: [-1.35, 0, -1.25],
  foreR: [-0.25, 0, 0],
  handR: [1.35, 0, 0],
  armL: [-0.6, 0, 0.6],
  foreL: [-0.8, 0, 0],
  thighL: [-0.45, 0, 0.12],
  shinL: [0.5, 0, 0],
  thighR: [0.4, 0, -0.15],
  shinR: [0.4, 0, 0],
};
const S1B: Pose = {
  y: -0.2,
  hips: [0, 0.45, 0],
  spine: [0.25, 0.75, 0],
  head: [0, -0.7, 0],
  armR: [-1.45, 0, 1.05],
  foreR: [-0.1, 0, 0],
  handR: [1.45, 0, 0],
  armL: [0.45, 0, 0.55],
  foreL: [-0.4, 0, 0],
  ...LUNGE_LEGS,
};
const S2A: Pose = { ...S1B, y: -0.16, armR: [-1.6, 0, 1.25], handR: [1.3, 0, 0] };
const S2B: Pose = {
  y: -0.22,
  hips: [0, -0.55, 0],
  spine: [0.3, -0.8, 0],
  head: [0, 0.75, 0],
  armR: [-1.35, 0, -1.45],
  foreR: [-0.05, 0, 0],
  handR: [1.5, 0, 0],
  armL: [-0.2, 0, 0.9],
  foreL: [-0.5, 0, 0],
  thighL: [-0.85, 0, 0.12],
  shinL: [0.95, 0, 0],
  thighR: [0.55, 0, -0.12],
  shinR: [0.2, 0, 0],
};
const S3A: Pose = {
  y: -0.32,
  hips: [0, -0.3, 0],
  spine: [0.55, -0.3, 0],
  head: [-0.4, 0.3, 0],
  armR: [0.35, 0, -0.45],
  foreR: [-0.2, 0, 0],
  handR: [2.0, 0, 0],
  armL: [-0.4, 0, 0.6],
  foreL: [-0.6, 0, 0],
  thighL: [-0.9, 0, 0.12],
  shinL: [1.2, 0, 0],
  thighR: [0.6, 0, -0.12],
  shinR: [0.9, 0, 0],
};
const S3B: Pose = {
  y: 0.04,
  hips: [0, 0.15, 0],
  spine: [-0.25, 0.2, 0],
  head: [-0.35, 0, 0],
  armR: [-2.75, 0, 0.15],
  foreR: [-0.05, 0, 0],
  handR: [0.4, 0, 0],
  armL: [0.6, 0, 0.5],
  foreL: [-0.3, 0, 0],
  thighL: [-0.3, 0, 0.1],
  shinL: [0.2, 0, 0],
  thighR: [0.2, 0, -0.1],
  shinR: [0.5, 0, 0],
};
/** Spin finisher: blade held straight out to the right while the body turns. */
const S4A: Pose = {
  y: -0.3,
  spine: [0.3, 0.6, 0],
  head: [0, -0.4, 0],
  armR: [-0.2, 0, -1.5],
  foreR: [0, 0, 0],
  handR: [1.57, 0, 0],
  armL: [-0.3, 0, 1.2],
  foreL: [-0.5, 0, 0],
  thighL: [-0.6, 0, 0.3],
  shinL: [0.8, 0, 0],
  thighR: [0.5, 0, -0.3],
  shinR: [0.7, 0, 0],
};
const S4B: Pose = { ...S4A, y: -0.38, spine: [0.45, 0, 0], armR: [-0.1, 0, -1.55] };

export const COMBO: SlashDef[] = [
  {
    id: "slash1",
    dur: 0.34,
    hitAt: 0.09,
    cancelAt: 0.16,
    dmg: 15,
    range: 2.6,
    cone: 1.25,
    lunge: 1.1,
    knock: 3,
    keys: [
      { t: 0, pose: S1A },
      { t: 0.05, pose: S1A },
      { t: 0.13, pose: S1B, ease: "out" },
      { t: 0.34, pose: S1B },
    ],
    fx: { roll: 0.15, left: true, sweep: 2.9, radius: 2.3, height: 1.15 },
  },
  {
    id: "slash2",
    dur: 0.34,
    hitAt: 0.09,
    cancelAt: 0.16,
    dmg: 15,
    range: 2.6,
    cone: 1.25,
    lunge: 1.1,
    knock: 3,
    keys: [
      { t: 0, pose: S2A },
      { t: 0.05, pose: S2A },
      { t: 0.13, pose: S2B, ease: "out" },
      { t: 0.34, pose: S2B },
    ],
    fx: { roll: -0.25, left: false, sweep: 2.9, radius: 2.3, height: 1.25 },
  },
  {
    id: "rise",
    dur: 0.42,
    hitAt: 0.12,
    cancelAt: 0.22,
    dmg: 19,
    range: 2.4,
    cone: 0.9,
    lunge: 0.8,
    knock: 1.5,
    launch: 7.5,
    keys: [
      { t: 0, pose: S3A },
      { t: 0.07, pose: S3A },
      { t: 0.16, pose: S3B, ease: "out" },
      { t: 0.42, pose: S3B },
    ],
    fx: { roll: -1.45, left: false, sweep: 2.7, radius: 2.1, height: 1.0, width: 0.6 },
  },
  {
    id: "cyclone",
    dur: 0.62,
    hitAt: 0.14,
    cancelAt: 0.5,
    dmg: 14,
    range: 3.0,
    cone: PI,
    lunge: 1.4,
    knock: 9,
    heavy: true,
    hits: 2,
    span: 0.2,
    spin: PI * 4,
    keys: [
      { t: 0, pose: S4A },
      { t: 0.4, pose: S4B },
      { t: 0.62, pose: S1B },
    ],
    fx: { roll: 0, left: true, sweep: PI * 2, radius: 2.9, height: 1.05, width: 0.9 },
  },
];

/** Rift Cut: attack during/just after a dash — a lunging cut through everything in the way. */
export const RIFT: SlashDef = {
  id: "rift",
  dur: 0.4,
  hitAt: 0.04,
  cancelAt: 0.3,
  dmg: 28,
  range: 1.4,
  cone: PI,
  lunge: 5.5,
  knock: 4,
  heavy: true,
  keys: [
    { t: 0, pose: S2A },
    { t: 0.08, pose: S2B, ease: "out" },
    { t: 0.4, pose: S2B },
  ],
  fx: { roll: 0.05, left: false, sweep: 1.6, radius: 3.2, height: 1.1, width: 0.25 },
};

/** Crimson Cyclone (special, E): three full spins with the blade out. */
export const SPECIAL: SlashDef = {
  id: "crimson",
  dur: 0.75,
  hitAt: 0.1,
  cancelAt: 0.75,
  dmg: 16,
  range: 3.4,
  cone: PI,
  lunge: 0,
  knock: 6,
  heavy: true,
  hits: 3,
  span: 0.45,
  spin: PI * 6,
  keys: [
    { t: 0, pose: S4A },
    { t: 0.6, pose: S4B },
    { t: 0.75, pose: IDLE },
  ],
  fx: { roll: 0, left: true, sweep: PI * 2, radius: 3.3, height: 1.0, width: 1.1 },
};

/** Execution after a perfect parry: dash in, three rapid cuts. */
export const EXECUTE_KEYS: Key[] = [
  { t: 0, pose: DASH },
  { t: 0.12, pose: S1A },
  { t: 0.2, pose: S1B, ease: "out" },
  { t: 0.3, pose: S2B, ease: "out" },
  { t: 0.44, pose: S3B, ease: "out" },
  { t: 0.7, pose: S3B },
];

/** Ground Splitter release (charged attack). */
export const SPLITTER_KEYS: Key[] = [
  { t: 0, pose: S3B },
  { t: 0.1, pose: { ...S2B, y: -0.4, spine: [0.9, -0.2, 0], armR: [-0.9, 0, -0.2], handR: [1.2, 0, 0] }, ease: "out" },
  { t: 0.45, pose: { ...S2B, y: -0.4, spine: [0.9, -0.2, 0], armR: [-0.9, 0, -0.2], handR: [1.2, 0, 0] } },
];
