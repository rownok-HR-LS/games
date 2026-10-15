// Weapon Aspects: three takes on each weapon. Aspect I is the weapon as designed; II and III are bought
// with banked souls at the armoury. An aspect reshapes the weapon's moves (speed, damage, knockback,
// replaced moves) and may switch on a behaviour the player code checks by id.
import { RIFT, type SlashDef } from "./anims";
import { WEAPONS, type WeaponDef, type WeaponId } from "./weapons";


export type AspectId =
  | "horseman"
  | "ronin"
  | "butcher"
  | "reaper"
  | "harvest"
  | "grave"
  | "brawler"
  | "titan"
  | "phoenix"
  | "warden"
  | "hunter"
  | "serpent";

export type AspectDef = {
  id: AspectId;
  weapon: WeaponId;
  name: string;
  text: string;
  cost: number;
  /** Attack speed multiplier (1.25 = 25% faster). */
  speed?: number;
  dmg?: number;
  knock?: number;
  /** Range multiplier for lash moves (glaive). */
  lashReach?: number;
  /** Replace the last combo hit / the special. */
  finisher?: SlashDef;
  special?: SlashDef;
  /** Extra special duration (scales time and hit count). */
  specialLength?: number;
};

/** Ronin finisher: vanish and reappear through the enemy line. */
const PHANTOM_CUT: SlashDef = { ...RIFT, id: "phantomcut", dmg: 24, lunge: 6.5, path: true, cancelAt: 0.32 };

/** Butcher special: one huge overhead cleave. */
const CLEAVE: SlashDef = {
  id: "cleave",
  dur: 0.9,
  hitAt: 0.42,
  cancelAt: 0.9,
  dmg: 40,
  range: 4.6,
  cone: 0.55,
  lunge: 1.2,
  knock: 13,
  heavy: true,
  keys: [
    { t: 0, pose: { y: 0.05, spine: [-0.35, 0, 0], head: [-0.3, 0, 0], armR: [-3.0, 0, 0.1], foreR: [-0.3, 0, 0], handR: [0.6, 0, 0], armL: [-2.9, 0, -0.2], foreL: [-0.4, 0, 0], thighL: [-0.4, 0, 0.2], shinL: [0.5, 0, 0], thighR: [0.3, 0, -0.2], shinR: [0.6, 0, 0] } },
    { t: 0.34, pose: { y: 0.1, spine: [-0.45, 0, 0], head: [-0.4, 0, 0], armR: [-3.1, 0, 0.1], foreR: [-0.2, 0, 0], handR: [0.5, 0, 0], armL: [-3.0, 0, -0.2], foreL: [-0.3, 0, 0], thighL: [-0.4, 0, 0.2], shinL: [0.5, 0, 0], thighR: [0.3, 0, -0.2], shinR: [0.6, 0, 0] } },
    { t: 0.46, pose: { y: -0.45, spine: [0.95, 0, 0], head: [-0.6, 0, 0], armR: [-0.9, 0, 0.1], foreR: [0, 0, 0], handR: [1.6, 0, 0], armL: [-0.9, 0, -0.2], foreL: [-0.1, 0, 0], thighL: [-1.0, 0, 0.15], shinL: [1.3, 0, 0], thighR: [0.6, 0, -0.15], shinR: [0.4, 0, 0] }, ease: "out" },
    { t: 0.9, pose: { y: -0.45, spine: [0.95, 0, 0], head: [-0.6, 0, 0], armR: [-0.9, 0, 0.1], foreR: [0, 0, 0], handR: [1.6, 0, 0], armL: [-0.9, 0, -0.2], foreL: [-0.1, 0, 0], thighL: [-1.0, 0, 0.15], shinL: [1.3, 0, 0], thighR: [0.6, 0, -0.15], shinR: [0.4, 0, 0] } },
  ],
  fx: { roll: -1.5, left: false, sweep: 1.9, radius: 4.2, height: 0.9, width: 1.0 },
};

export const ASPECTS: Record<WeaponId, AspectDef[]> = {
  katana: [
    { id: "horseman", weapon: "katana", name: "Aspect of the Horseman", text: "The blade as you know it: balanced cuts, a rising launcher and the Crimson Cyclone.", cost: 0 },
    { id: "ronin", weapon: "katana", name: "Aspect of the Ronin", text: "Combo 25% faster. The finisher becomes a Phantom Cut that teleports through the enemy line. −15% damage.", cost: 400, speed: 1.25, dmg: 0.85, finisher: PHANTOM_CUT },
    { id: "butcher", weapon: "katana", name: "Aspect of the Butcher", text: "25% slower, +60% damage, double damage to shields. The special becomes one giant overhead Cleave.", cost: 800, speed: 0.75, dmg: 1.6, special: CLEAVE },
  ],
  scythes: [
    { id: "reaper", weapon: "scythes", name: "Aspect of the Reaper", text: "Fast reaping spins that shred crowds.", cost: 0 },
    { id: "harvest", weapon: "scythes", name: "Aspect of the Harvest", text: "Each kill while attacking adds +5% damage (up to 10 stacks). Stop attacking for 2 s and the harvest is lost.", cost: 400 },
    { id: "grave", weapon: "scythes", name: "Aspect of the Grave", text: "Spinning attacks drag enemies in like a vortex. Whirlwind lasts 50% longer. −10% damage.", cost: 800, dmg: 0.9, specialLength: 1.5 },
  ],
  gauntlets: [
    { id: "brawler", weapon: "gauntlets", name: "Aspect of the Brawler", text: "Lightning-fast fists, uppercut juggles and the Meteor Fist.", cost: 0 },
    { id: "titan", weapon: "gauntlets", name: "Aspect of the Titan", text: "20% slower punches with massive knockback: send enemies flying off the edge. Bigger slam shockwaves.", cost: 400, speed: 0.8, dmg: 1.1, knock: 2.4 },
    { id: "phoenix", weapon: "gauntlets", name: "Aspect of the Phoenix", text: "Every 5th hit erupts in a burst of fire. Meteor Fist leaves a burning crater.", cost: 800 },
  ],
  glaive: [
    { id: "warden", weapon: "glaive", name: "Aspect of the Warden", text: "Long chain sweeps and the five-bounce Ricochet.", cost: 0 },
    { id: "hunter", weapon: "glaive", name: "Aspect of the Hunter", text: "Ricochet bounces 8 times and marks every enemy it hits. Marked enemies take +30% from your sweeps.", cost: 400 },
    { id: "serpent", weapon: "glaive", name: "Aspect of the Serpent", text: "Chain sweeps hook enemies and drag them to you. The lash reaches 40% further.", cost: 800, lashReach: 1.4 },
  ],
};

export function aspectOf(id: AspectId): AspectDef {
  for (const list of Object.values(ASPECTS)) for (const a of list) if (a.id === id) return a;
  return ASPECTS.katana[0];
}

/** A move retimed and rescaled by an aspect. */
function shape(d: SlashDef, a: AspectDef): SlashDef {
  const sp = a.speed ?? 1;
  let out: SlashDef = {
    ...d,
    dur: d.dur / sp,
    hitAt: d.hitAt / sp,
    cancelAt: d.cancelAt / sp,
    span: d.span !== undefined ? d.span / sp : undefined,
    dmg: d.dmg * (a.dmg ?? 1),
    knock: d.knock * (a.knock ?? 1),
    keys: d.keys.map((k) => ({ ...k, t: k.t / sp })),
  };
  if (a.knock && a.knock > 1 && d.style === "slam") out = { ...out, range: out.range * 1.35, fx: { ...out.fx, radius: out.fx.radius * 1.35 } };
  if (a.lashReach && d.style === "lash") out = { ...out, range: out.range * a.lashReach, fx: { ...out.fx, radius: out.fx.radius * a.lashReach } };
  return out;
}

/** The weapon as played with this aspect. */
export function buildWeapon(id: WeaponId, aspect: AspectId): WeaponDef {
  const base = WEAPONS[id];
  const a = aspectOf(aspect);
  if (a.weapon !== id) return base;
  const combo = base.combo.map((d, i) => (i === base.combo.length - 1 && a.finisher ? a.finisher : d)).map((d) => shape(d, a));
  let special = shape(a.special ?? base.special, a);
  if (a.specialLength) {
    const L = a.specialLength;
    special = {
      ...special,
      dur: special.dur * L,
      span: (special.span ?? 0) * L,
      hits: Math.round((special.hits ?? 1) * L),
      spin: (special.spin ?? 0) * L,
      keys: special.keys.map((k) => ({ ...k, t: k.t * L })),
    };
  }
  return { ...base, combo, dash: shape(base.dash, a), special };
}

