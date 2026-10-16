// Roguelite upgrades ("relics"): after each cleared level in a run, pick 1 of 3.

export type Rarity = "common" | "rare" | "epic";

export type Mods = {
  paddleW: number;
  ballSpeed: number;
  extraBalls: number;
  dropChance: number;
  powerDur: number;
  styleDecay: number;
  scoreMult: number;
  pierce: number;
  chainChance: number;
  splitEvery: number;
  explodeChance: number;
  heavy: boolean;
  shieldStart: boolean;
  turret: number; // seconds between auto-shots, 0 = off
  vampire: boolean;
  secondWind: boolean;
  magnet: boolean;
  maxLives: number;
  critChance: number;
};

export const BASE_MODS: Mods = {
  paddleW: 1,
  ballSpeed: 1,
  extraBalls: 0,
  dropChance: 0.1,
  powerDur: 1,
  styleDecay: 1,
  scoreMult: 1,
  pierce: 0,
  chainChance: 0,
  splitEvery: 0,
  explodeChance: 0,
  heavy: false,
  shieldStart: false,
  turret: 0,
  vampire: false,
  secondWind: false,
  magnet: false,
  maxLives: 5,
  critChance: 0,
};

export type Upgrade = {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  max: number;
  /** A one-character sigil shown on the card. */
  sigil: string;
  apply: (m: Mods, stack: number) => void;
};

export const UPGRADES: Upgrade[] = [
  { id: "wide", name: "Broad Blade", desc: "Paddle 15% wider.", rarity: "common", max: 3, sigil: "⟷", apply: (m) => (m.paddleW *= 1.15) },
  { id: "air", name: "Heavy Air", desc: "Ball moves 8% slower.", rarity: "common", max: 2, sigil: "≈", apply: (m) => (m.ballSpeed *= 0.92) },
  { id: "loot", name: "Grave Robber", desc: "Bricks drop power-ups 6% more often.", rarity: "common", max: 3, sigil: "✚", apply: (m) => (m.dropChance += 0.06) },
  { id: "linger", name: "Lingering Curse", desc: "Power-ups last 35% longer.", rarity: "common", max: 2, sigil: "⧗", apply: (m) => (m.powerDur *= 1.35) },
  { id: "show", name: "Showman", desc: "Style rank decays 30% slower.", rarity: "common", max: 2, sigil: "★", apply: (m) => (m.styleDecay *= 0.7) },
  { id: "greed", name: "Blood Money", desc: "+25% score.", rarity: "common", max: 3, sigil: "$", apply: (m) => (m.scoreMult += 0.25) },
  { id: "magnet", name: "Lodestone", desc: "The first paddle hit of every life catches the ball.", rarity: "common", max: 1, sigil: "∩", apply: (m) => (m.magnet = true) },
  { id: "will", name: "Iron Will", desc: "+1 life now and +1 max lives.", rarity: "common", max: 3, sigil: "♥", apply: (m) => (m.maxLives += 1) },
  { id: "twin", name: "Twin Souls", desc: "Start every level with an extra ball.", rarity: "rare", max: 2, sigil: "∞", apply: (m) => (m.extraBalls += 1) },
  { id: "pierce", name: "Impaler", desc: "After each paddle hit, the ball pierces through the first brick.", rarity: "rare", max: 2, sigil: "↟", apply: (m) => (m.pierce += 1) },
  { id: "chain", name: "Chain Lightning", desc: "15% chance a destroyed brick zaps a neighbour.", rarity: "rare", max: 3, sigil: "ϟ", apply: (m) => (m.chainChance += 0.15) },
  { id: "split", name: "Splinter", desc: "Every 12th brick hit splits the ball in two.", rarity: "rare", max: 2, sigil: "⑂", apply: (m, s) => (m.splitEvery = s >= 2 ? 8 : 12) },
  { id: "volatile", name: "Volatile", desc: "8% chance any destroyed brick explodes.", rarity: "rare", max: 2, sigil: "✸", apply: (m) => (m.explodeChance += 0.08) },
  { id: "crush", name: "Crusher", desc: "Strong bricks take double damage.", rarity: "rare", max: 1, sigil: "▼", apply: (m) => (m.heavy = true) },
  { id: "aegis", name: "Aegis", desc: "Start every level with the floor shield.", rarity: "rare", max: 1, sigil: "⛨", apply: (m) => (m.shieldStart = true) },
  { id: "wrath", name: "Wrath", desc: "10% of hits deal triple damage with a burst.", rarity: "rare", max: 2, sigil: "✦", apply: (m) => (m.critChance += 0.1) },
  { id: "turret", name: "Hellturret", desc: "The paddle fires its lasers on its own every few seconds.", rarity: "epic", max: 2, sigil: "⇈", apply: (m, s) => (m.turret = s >= 2 ? 1.4 : 2.4) },
  { id: "harvest", name: "Soul Harvest", desc: "Every 60 bricks destroyed grants a life.", rarity: "epic", max: 1, sigil: "☠", apply: (m) => (m.vampire = true) },
  { id: "wind", name: "Second Wind", desc: "Once per run, come back with 1 life when you would lose.", rarity: "epic", max: 1, sigil: "↺", apply: (m) => (m.secondWind = true) },
  { id: "glass", name: "Glass Cannon", desc: "+60% score, but -1 max life.", rarity: "epic", max: 1, sigil: "◇", apply: (m) => ((m.scoreMult += 0.6), (m.maxLives -= 1)) },
];

const WEIGHT: Record<Rarity, number> = { common: 10, rare: 5, epic: 2 };

export function computeMods(stacks: Record<string, number>): Mods {
  const m: Mods = { ...BASE_MODS };
  for (const u of UPGRADES) for (let s = 1; s <= (stacks[u.id] ?? 0); s++) u.apply(m, s);
  return m;
}

/** Three distinct, not-yet-maxed upgrades, weighted by rarity. */
export function rollChoices(stacks: Record<string, number>, rnd: () => number): Upgrade[] {
  const pool = UPGRADES.filter((u) => (stacks[u.id] ?? 0) < u.max);
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length) {
    const total = pool.reduce((a, u) => a + WEIGHT[u.rarity], 0);
    let r = rnd() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) if ((r -= WEIGHT[pool[i].rarity]) <= 0) break;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
