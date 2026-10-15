// The four weapons. Each one is a set of moves (combo, dash attack, special) built from the same
// SlashDef data the katana uses, plus its stance, look and sound. See anims.ts for the katana itself.
import * as THREE from "three";
import { COMBO, IDLE, RIFT, RUN_UPPER, SPECIAL, type SlashDef } from "./anims";
import { mirror, type Pose } from "./rig";

const PI = Math.PI;

export type WeaponId = "katana" | "scythes" | "gauntlets" | "glaive";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  /** One line under the name at the weapon rack. */
  blurb: string;
  /** Default colour of the swing trail. */
  trail: THREE.Color;
  combo: SlashDef[];
  dash: SlashDef;
  special: SlashDef;
  specialCd: number;
  idle: Pose;
  runUpper: Pose;
  /** Hit sound family. */
  sound: "blade" | "punch" | "chain";
};

// ── Shared legs ──
const LUNGE: Pose = { thighL: [-0.85, 0, 0.12], shinL: [0.95, 0, 0], thighR: [0.55, 0, -0.12], shinR: [0.2, 0, 0] };
const WIDE: Pose = { thighL: [-0.5, 0, 0.3], shinL: [0.8, 0, 0], thighR: [0.5, 0, -0.3], shinR: [0.7, 0, 0] };
const CROUCH: Pose = { thighL: [-1.1, 0, 0.15], shinL: [1.6, 0, 0], thighR: [-0.4, 0, -0.15], shinR: [1.3, 0, 0] };

// ── Twin Scythes ─────────────────────────────────────────────────────────────────────
const SC_IDLE: Pose = {
  ...IDLE,
  armR: [-0.35, 0, -0.45],
  foreR: [-0.6, 0, 0],
  handR: [1.9, 0, 0],
  armL: [-0.35, 0, 0.45],
  foreL: [-0.6, 0, 0],
  handL: [1.9, 0, 0],
};
const SC_RUN: Pose = { ...RUN_UPPER, handR: [2.6, 0, 0], handL: [2.6, 0, 0] };
const SCR_A: Pose = {
  y: -0.12,
  hips: [0, -0.45, 0],
  spine: [0.2, -0.6, 0],
  armR: [-1.3, 0, -1.3],
  foreR: [-0.2, 0, 0],
  handR: [1.4, 0, 0],
  armL: [-0.3, 0, 0.5],
  foreL: [-0.6, 0, 0],
  handL: [1.9, 0, 0],
  ...WIDE,
};
const SCR_B: Pose = {
  y: -0.2,
  hips: [0, 0.45, 0],
  spine: [0.25, 0.7, 0],
  armR: [-1.4, 0, 1.0],
  foreR: [-0.1, 0, 0],
  handR: [1.45, 0, 0],
  armL: [0.3, 0, 0.5],
  foreL: [-0.4, 0, 0],
  handL: [2.2, 0, 0],
  ...LUNGE,
};
const X_A: Pose = {
  y: -0.05,
  spine: [-0.1, 0, 0],
  armR: [-2.5, 0, -0.55],
  foreR: [-0.25, 0, 0],
  handR: [1.3, 0, 0],
  armL: [-2.5, 0, 0.55],
  foreL: [-0.25, 0, 0],
  handL: [1.3, 0, 0],
  ...WIDE,
};
const X_B: Pose = {
  y: -0.32,
  spine: [0.6, 0, 0],
  armR: [-0.8, 0, 0.85],
  foreR: [-0.1, 0, 0],
  handR: [1.5, 0, 0],
  armL: [-0.8, 0, -0.85],
  foreL: [-0.1, 0, 0],
  handL: [1.5, 0, 0],
  ...LUNGE,
};
const SPIN_OUT: Pose = {
  y: -0.28,
  spine: [0.3, 0, 0],
  armR: [-0.25, 0, -1.5],
  foreR: [0, 0, 0],
  handR: [1.57, 0, 0],
  armL: [-0.25, 0, 1.5],
  foreL: [0, 0, 0],
  handL: [1.57, 0, 0],
  ...WIDE,
};

const SCYTHES: WeaponDef = {
  id: "scythes",
  name: "Twin Scythes",
  blurb: "Fast, wide reaping spins. Shred crowds and keep your style meter burning.",
  trail: new THREE.Color(0.75, 0.12, 0.16),
  sound: "blade",
  idle: SC_IDLE,
  runUpper: SC_RUN,
  specialCd: 7,
  combo: [
    {
      id: "reap1",
      dur: 0.26,
      hitAt: 0.07,
      cancelAt: 0.12,
      dmg: 9,
      range: 2.8,
      cone: 1.35,
      lunge: 0.9,
      knock: 2,
      keys: [
        { t: 0, pose: SCR_A },
        { t: 0.04, pose: SCR_A },
        { t: 0.1, pose: SCR_B, ease: "out" },
        { t: 0.26, pose: SCR_B },
      ],
      fx: { roll: 0.15, left: true, sweep: 2.9, radius: 2.5, height: 1.15, width: 0.6 },
    },
    {
      id: "reap2",
      dur: 0.26,
      hitAt: 0.07,
      cancelAt: 0.12,
      dmg: 9,
      range: 2.8,
      cone: 1.35,
      lunge: 0.9,
      knock: 2,
      keys: [
        { t: 0, pose: mirror(SCR_A) },
        { t: 0.04, pose: mirror(SCR_A) },
        { t: 0.1, pose: mirror(SCR_B), ease: "out" },
        { t: 0.26, pose: mirror(SCR_B) },
      ],
      fx: { roll: -0.15, left: false, sweep: 2.9, radius: 2.5, height: 1.15, width: 0.6 },
    },
    {
      id: "cross",
      dur: 0.32,
      hitAt: 0.09,
      cancelAt: 0.16,
      dmg: 10,
      range: 2.6,
      cone: 1.0,
      lunge: 1.0,
      knock: 3,
      hits: 2,
      span: 0.05,
      keys: [
        { t: 0, pose: X_A },
        { t: 0.06, pose: X_A },
        { t: 0.13, pose: X_B, ease: "out" },
        { t: 0.32, pose: X_B },
      ],
      fx: { roll: -1.0, left: true, sweep: 2.4, radius: 2.3, height: 1.2, width: 0.5 },
      fx2: { roll: 1.0, left: false, sweep: 2.4, radius: 2.3, height: 1.2, width: 0.5 },
    },
    {
      id: "spinreap",
      dur: 0.4,
      hitAt: 0.08,
      cancelAt: 0.26,
      dmg: 8,
      range: 3.2,
      cone: PI,
      lunge: 0.8,
      knock: 3,
      hits: 2,
      span: 0.16,
      spin: PI * 2,
      keys: [
        { t: 0, pose: SPIN_OUT },
        { t: 0.4, pose: SPIN_OUT },
      ],
      fx: { roll: 0, left: true, sweep: PI * 2, radius: 3.0, height: 1.05, width: 0.7 },
    },
    {
      id: "whirl",
      dur: 0.6,
      hitAt: 0.1,
      cancelAt: 0.48,
      dmg: 9,
      range: 3.6,
      cone: PI,
      lunge: 1.2,
      knock: 8,
      heavy: true,
      hits: 4,
      span: 0.32,
      spin: PI * 4,
      keys: [
        { t: 0, pose: SPIN_OUT },
        { t: 0.45, pose: { ...SPIN_OUT, y: -0.4, spine: [0.5, 0, 0] } },
        { t: 0.6, pose: SCR_B },
      ],
      fx: { roll: 0, left: true, sweep: PI * 2, radius: 3.4, height: 1.0, width: 0.9 },
    },
  ],
  dash: {
    id: "reaperdash",
    dur: 0.42,
    hitAt: 0.04,
    cancelAt: 0.3,
    dmg: 20,
    range: 1.7,
    cone: PI,
    lunge: 5.5,
    knock: 4,
    heavy: true,
    spin: PI * 2,
    keys: [
      { t: 0, pose: SPIN_OUT },
      { t: 0.42, pose: SCR_B },
    ],
    fx: { roll: 0, left: true, sweep: PI * 2, radius: 2.2, height: 1.05, width: 0.5 },
  },
  special: {
    id: "whirlwind",
    dur: 1.1,
    hitAt: 0.08,
    cancelAt: 1.1,
    dmg: 10,
    range: 3.3,
    cone: PI,
    lunge: 0,
    travel: 6.5,
    knock: 5,
    heavy: true,
    hits: 7,
    span: 0.92,
    spin: PI * 10,
    keys: [
      { t: 0, pose: SPIN_OUT },
      { t: 0.9, pose: { ...SPIN_OUT, y: -0.36 } },
      { t: 1.1, pose: SC_IDLE },
    ],
    fx: { roll: 0, left: true, sweep: PI * 2, radius: 3.2, height: 1.0, width: 1.0 },
    repeatFx: true,
  },
};

// ── Iron Gauntlets ───────────────────────────────────────────────────────────────────
const GUARD: Pose = {
  y: -0.1,
  hips: [0, 0.3, 0],
  spine: [0.25, -0.25, 0],
  head: [-0.1, 0.2, 0],
  armR: [-0.95, 0, -0.1],
  foreR: [-1.95, 0, 0],
  handR: [0, 0, 0],
  armL: [-1.1, 0, 0.1],
  foreL: [-1.85, 0, 0],
  handL: [0, 0, 0],
  thighL: [-0.42, 0, 0.14],
  shinL: [0.45, 0, 0],
  thighR: [0.34, 0, -0.16],
  shinR: [0.42, 0, 0],
};
const GUARD_RUN: Pose = { armR: GUARD.armR, foreR: GUARD.foreR, handR: [0, 0, 0], armL: GUARD.armL, foreL: GUARD.foreL, handL: [0, 0, 0] };
const JAB_R: Pose = {
  ...GUARD,
  y: -0.16,
  hips: [0, 0.1, 0],
  spine: [0.3, 0.45, 0],
  armR: [-1.55, 0, 0.12],
  foreR: [-0.05, 0, 0],
  ...LUNGE,
};
const HOOK_A: Pose = { ...GUARD, spine: [0.3, -0.55, 0], armR: [-1.35, 0, -1.0], foreR: [-1.3, 0, 0] };
const HOOK_B: Pose = { ...GUARD, y: -0.18, spine: [0.35, 0.75, 0], armR: [-1.45, 0, 0.75], foreR: [-1.2, 0, 0], ...LUNGE };
const UPPER_A: Pose = { ...GUARD, y: -0.36, spine: [0.55, -0.25, 0], armR: [0.25, 0, -0.3], foreR: [-1.7, 0, 0], ...CROUCH };
const UPPER_B: Pose = { ...GUARD, y: 0.06, spine: [-0.25, 0.3, 0], head: [-0.3, 0, 0], armR: [-2.75, 0, 0.1], foreR: [-0.45, 0, 0], thighL: [-0.3, 0, 0.1], shinL: [0.2, 0, 0], thighR: [0.2, 0, -0.1], shinR: [0.5, 0, 0] };
const SLAM_A: Pose = { ...GUARD, y: 0.08, spine: [-0.2, 0, 0], armR: [-2.95, 0, -0.35], foreR: [-0.4, 0, 0], armL: [-2.95, 0, 0.35], foreL: [-0.4, 0, 0], ...WIDE };
const SLAM_B: Pose = { ...GUARD, y: -0.55, spine: [0.95, 0, 0], head: [-0.6, 0, 0], armR: [-0.55, 0, 0.25], foreR: [-0.15, 0, 0], armL: [-0.55, 0, -0.25], foreL: [-0.15, 0, 0], ...CROUCH };
const CHARGE_P: Pose = { ...GUARD, y: -0.2, spine: [0.6, -0.75, 0], head: [-0.3, 0.6, 0], armL: [-0.5, 0, 0.55], foreL: [-1.7, 0, 0], ...LUNGE };
const LEAP: Pose = { ...SLAM_A, y: 0.9, thighL: [-1.0, 0, 0.2], shinL: [1.6, 0, 0], thighR: [-0.6, 0, -0.2], shinR: [1.4, 0, 0] };

const punch = (id: string, a: Pose, b: Pose, dmg: number, hand: "R" | "L", o: Partial<SlashDef> = {}): SlashDef => ({
  id,
  dur: 0.2,
  hitAt: 0.05,
  cancelAt: 0.09,
  dmg,
  range: 2.0,
  cone: 0.85,
  lunge: 0.7,
  knock: 2.5,
  style: "punch",
  hand,
  keys: [
    { t: 0, pose: a },
    { t: 0.05, pose: b, ease: "out" },
    { t: 0.2, pose: b },
  ],
  fx: { roll: hand === "R" ? 0.2 : -0.2, left: hand === "R", sweep: 0.7, radius: 1.9, height: 1.25, width: 0.3 },
  ...o,
});

const GAUNTLETS: WeaponDef = {
  id: "gauntlets",
  name: "Iron Gauntlets",
  blurb: "Lightning-fast fists. Launch with the uppercut, juggle, then slam them down.",
  trail: new THREE.Color(0.85, 0.42, 0.12),
  sound: "punch",
  idle: GUARD,
  runUpper: GUARD_RUN,
  specialCd: 7,
  combo: [
    punch("jab1", GUARD, JAB_R, 10, "R"),
    punch("jab2", GUARD, mirror(JAB_R), 10, "L"),
    punch("hook", HOOK_A, HOOK_B, 12, "R", { dur: 0.26, hitAt: 0.08, cancelAt: 0.13, cone: 1.2, keys: [{ t: 0, pose: HOOK_A }, { t: 0.08, pose: HOOK_B, ease: "out" }, { t: 0.26, pose: HOOK_B }], fx: { roll: 0.1, left: true, sweep: 1.6, radius: 2.0, height: 1.3, width: 0.35 } }),
    punch("uppercut", UPPER_A, UPPER_B, 15, "R", {
      dur: 0.38,
      hitAt: 0.11,
      cancelAt: 0.2,
      launch: 9,
      knock: 1.2,
      keys: [
        { t: 0, pose: UPPER_A },
        { t: 0.06, pose: UPPER_A },
        { t: 0.13, pose: UPPER_B, ease: "out" },
        { t: 0.38, pose: UPPER_B },
      ],
      fx: { roll: -1.45, left: false, sweep: 1.8, radius: 1.9, height: 0.9, width: 0.35 },
    }),
    {
      id: "slam",
      dur: 0.5,
      hitAt: 0.2,
      cancelAt: 0.42,
      dmg: 22,
      range: 2.7,
      cone: PI,
      lunge: 0.6,
      knock: 6,
      heavy: true,
      style: "slam",
      airBonus: 1.6,
      keys: [
        { t: 0, pose: SLAM_A },
        { t: 0.12, pose: SLAM_A },
        { t: 0.2, pose: SLAM_B, ease: "out" },
        { t: 0.5, pose: SLAM_B },
      ],
      fx: { roll: 0, left: true, sweep: 0.1, radius: 1, height: 0.1 },
    },
  ],
  dash: {
    id: "shoulder",
    dur: 0.38,
    hitAt: 0.03,
    cancelAt: 0.28,
    dmg: 22,
    range: 1.5,
    cone: PI,
    lunge: 5.2,
    knock: 11,
    heavy: true,
    style: "punch",
    hand: "L",
    keys: [
      { t: 0, pose: CHARGE_P },
      { t: 0.38, pose: CHARGE_P },
    ],
    fx: { roll: 0, left: true, sweep: 1.2, radius: 1.6, height: 1.2, width: 0.3 },
  },
  special: {
    id: "meteor",
    dur: 0.8,
    hitAt: 0.5,
    cancelAt: 0.8,
    dmg: 42,
    range: 3.8,
    cone: PI,
    lunge: 3.0,
    knock: 10,
    heavy: true,
    style: "slam",
    airBonus: 1.3,
    keys: [
      { t: 0, pose: { ...SLAM_B, y: -0.4 } },
      { t: 0.12, pose: { ...SLAM_B, y: -0.4 } },
      { t: 0.32, pose: LEAP, ease: "out" },
      { t: 0.5, pose: SLAM_B, ease: "in" },
      { t: 0.8, pose: SLAM_B },
    ],
    fx: { roll: 0, left: true, sweep: 0.1, radius: 1, height: 0.1 },
  },
};

// ── Chain Glaive ─────────────────────────────────────────────────────────────────────
const GL_IDLE: Pose = { ...IDLE, armR: [-0.55, 0, -0.35], foreR: [-0.7, 0, 0], handR: [0, 0, 0], armL: [-0.7, 0, 0.3], foreL: [-1.2, 0, 0] };
const GL_RUN: Pose = { armR: [0.5, 0, -0.4], foreR: [-0.6, 0, 0], handR: [0, 0, 0], armL: [0.8, 0, 0.35], foreL: [-0.4, 0, 0] };
const WHIP_A: Pose = { y: -0.1, hips: [0, -0.5, 0], spine: [0.15, -0.7, 0], head: [0, 0.6, 0], armR: [-1.2, 0, -1.45], foreR: [-0.15, 0, 0], handR: [0, 0, 0], armL: [-0.6, 0, 0.6], foreL: [-1.1, 0, 0], ...WIDE };
const WHIP_B: Pose = { y: -0.18, hips: [0, 0.5, 0], spine: [0.2, 0.8, 0], head: [0, -0.7, 0], armR: [-1.45, 0, 1.0], foreR: [-0.1, 0, 0], handR: [0, 0, 0], armL: [0.3, 0, 0.5], foreL: [-0.5, 0, 0], ...LUNGE };
const LASH_A: Pose = { y: 0, spine: [-0.25, 0, 0], armR: [-2.85, 0, -0.25], foreR: [-0.5, 0, 0], handR: [0, 0, 0], armL: [-0.4, 0, 0.5], foreL: [-0.8, 0, 0], ...WIDE };
const LASH_B: Pose = { y: -0.22, spine: [0.45, 0, 0], armR: [-1.55, 0, 0.05], foreR: [0, 0, 0], handR: [0, 0, 0], armL: [0.4, 0, 0.5], foreL: [-0.4, 0, 0], ...LUNGE };
const GL_SPIN: Pose = { y: -0.25, spine: [0.25, 0, 0], armR: [-0.3, 0, -1.5], foreR: [0, 0, 0], handR: [0, 0, 0], armL: [-0.6, 0, 0.9], foreL: [-1.0, 0, 0], ...WIDE };

const GLAIVE: WeaponDef = {
  id: "glaive",
  name: "Chain Glaive",
  blurb: "A bladed disc on a chain. Strike from long range, then throw it to ricochet.",
  trail: new THREE.Color(0.55, 0.62, 0.72),
  sound: "chain",
  idle: GL_IDLE,
  runUpper: GL_RUN,
  specialCd: 6,
  combo: [
    {
      id: "whip1",
      dur: 0.42,
      hitAt: 0.15,
      cancelAt: 0.24,
      dmg: 13,
      range: 4.7,
      cone: 1.15,
      lunge: 0.3,
      knock: 3,
      style: "chain",
      keys: [
        { t: 0, pose: WHIP_A },
        { t: 0.08, pose: WHIP_A },
        { t: 0.18, pose: WHIP_B, ease: "out" },
        { t: 0.42, pose: WHIP_B },
      ],
      fx: { roll: 0.08, left: true, sweep: 2.4, radius: 4.4, height: 1.1, width: 0.22 },
    },
    {
      id: "whip2",
      dur: 0.42,
      hitAt: 0.15,
      cancelAt: 0.24,
      dmg: 13,
      range: 4.7,
      cone: 1.15,
      lunge: 0.3,
      knock: 3,
      style: "chain",
      keys: [
        { t: 0, pose: WHIP_B },
        { t: 0.08, pose: WHIP_B },
        { t: 0.18, pose: WHIP_A, ease: "out" },
        { t: 0.42, pose: WHIP_A },
      ],
      fx: { roll: -0.08, left: false, sweep: 2.4, radius: 4.4, height: 1.1, width: 0.22 },
    },
    {
      id: "lash",
      dur: 0.46,
      hitAt: 0.17,
      cancelAt: 0.28,
      dmg: 18,
      range: 5.8,
      cone: 0.32,
      lunge: 0.4,
      knock: 6,
      heavy: true,
      style: "lash",
      keys: [
        { t: 0, pose: LASH_A },
        { t: 0.1, pose: LASH_A },
        { t: 0.18, pose: LASH_B, ease: "out" },
        { t: 0.46, pose: LASH_B },
      ],
      fx: { roll: 0, left: true, sweep: 0.1, radius: 5.6, height: 1.1, width: 0.2 },
    },
    {
      id: "chainspin",
      dur: 0.6,
      hitAt: 0.12,
      cancelAt: 0.48,
      dmg: 13,
      range: 4.4,
      cone: PI,
      lunge: 0.4,
      knock: 7,
      heavy: true,
      hits: 2,
      span: 0.3,
      spin: PI * 2,
      style: "chain",
      keys: [
        { t: 0, pose: GL_SPIN },
        { t: 0.6, pose: GL_SPIN },
      ],
      fx: { roll: 0, left: true, sweep: PI * 2, radius: 4.2, height: 1.05, width: 0.25 },
    },
  ],
  dash: {
    id: "chainlash",
    dur: 0.4,
    hitAt: 0.08,
    cancelAt: 0.28,
    dmg: 20,
    range: 5.6,
    cone: 0.3,
    lunge: 2.0,
    knock: 6,
    heavy: true,
    style: "lash",
    keys: [
      { t: 0, pose: LASH_A },
      { t: 0.08, pose: LASH_B, ease: "out" },
      { t: 0.4, pose: LASH_B },
    ],
    fx: { roll: 0, left: true, sweep: 0.1, radius: 5.4, height: 1.1, width: 0.2 },
  },
  special: {
    id: "ricochet",
    dur: 0.32,
    hitAt: 0.1,
    cancelAt: 0.32,
    dmg: 18,
    range: 0,
    cone: 0,
    lunge: 0,
    knock: 5,
    heavy: true,
    style: "throw",
    keys: [
      { t: 0, pose: LASH_A },
      { t: 0.1, pose: LASH_B, ease: "out" },
      { t: 0.32, pose: LASH_B },
    ],
    fx: { roll: 0, left: true, sweep: 0.1, radius: 1, height: 1.1 },
  },
};

const KATANA: WeaponDef = {
  id: "katana",
  name: "Katana",
  blurb: "The Horseman's blade. Balanced cuts, a rising launcher and the Crimson Cyclone.",
  trail: new THREE.Color(0.38, 0.45, 0.7),
  sound: "blade",
  idle: IDLE,
  runUpper: RUN_UPPER,
  specialCd: 7,
  combo: COMBO,
  dash: RIFT,
  special: SPECIAL,
};

export const WEAPONS: Record<WeaponId, WeaponDef> = { katana: KATANA, scythes: SCYTHES, gauntlets: GAUNTLETS, glaive: GLAIVE };
export const WEAPON_ORDER: WeaponId[] = ["katana", "scythes", "gauntlets", "glaive"];
