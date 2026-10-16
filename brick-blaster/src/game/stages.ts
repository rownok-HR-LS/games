// Campaign structure: 5 worlds × 10 levels. Each world has two looks (brick material, backdrop
// and track), alternating level by level, and ends in a boss. Roguelite runs use the same
// building blocks with generated layouts.
//
// Theme indices (shared by brickskins LEVEL_THEMES, levelstyle LEVEL_STYLES and music TRACKS):
//   0 magma · 1 glass · 2 bone · 3 argent · 4 stone · 5 velvet · 6 obsidian · 7 gem · 8 iron · 9 judgment

import { LEVELS } from "./levels";
import { generateLevel, seeded, type Feature } from "./levelgen";

export type Stage = {
  name: string;
  rows: string[];
  theme: number;
  track: number;
  world: number;
  /** 0-based position inside its world (campaign) or run depth (roguelite). */
  index: number;
  difficulty: number;
  /** Boss stage: index into BOSSES. */
  boss?: number;
};

export type World = { name: string; themes: [number, number]; features: Feature[]; blurb: string };

export const WORLDS: World[] = [
  { name: "Hellfire Depths", themes: [0, 3], features: ["strong", "explosive", "mystery"], blurb: "Molten rock and the foundries of hell." },
  { name: "Cathedral of Ash", themes: [1, 5], features: ["strong", "explosive", "mystery", "mover"], blurb: "Stained glass and blood-red velvet. Bricks begin to move." },
  { name: "Catacombs of Requiem", themes: [2, 4], features: ["strong", "metal", "explosive", "mystery", "mover", "regen"], blurb: "Bone and stone that grows back." },
  { name: "Iron Abyss", themes: [8, 6], features: ["strong", "metal", "explosive", "mystery", "mover", "regen", "shooter"], blurb: "Forges and obsidian. The walls shoot back." },
  { name: "Throne of Judgment", themes: [7, 9], features: ["strong", "metal", "explosive", "mystery", "mover", "regen", "shooter", "portal"], blurb: "Crystal halls, portals and the final judge." },
];

export type BossSpec = { name: string; title: string; hp: number; world: number };

export const BOSSES: BossSpec[] = [
  { name: "Infernal Warden", title: "Keeper of the Molten Gate", hp: 14, world: 0 },
  { name: "The Stained Bishop", title: "Voice of the Shattered Choir", hp: 18, world: 1 },
  { name: "Bone Colossus", title: "Sleeper Beneath the Catacombs", hp: 22, world: 2 },
  { name: "Iron Tyrant", title: "Lord of the Abyssal Forge", hp: 26, world: 3 },
  { name: "The Judge", title: "Final Arbiter of the Damned", hp: 32, world: 4 },
];

// The original ten hand-made layouts, two per world.
const HANDMADE: [number, number][][] = [
  [[0, 0], [3, 4]], // Rainbow, Chain reaction
  [[1, 0], [5, 4]], // Pyramid, Heart
  [[2, 0], [4, 4]], // Checkmate, Fortress
  [[6, 0], [8, 4]], // Invader, Steel bars
  [[7, 0], [9, 4]], // Diamond, The boss → "Last Bastion"
];

const GEN_NAMES = [
  ["Ember Fields", "Slag Rivers", "Cinder Halls", "Furnace Heart", "Ash Spires", "Lava Gates", "Brimstone"],
  ["Choir Loft", "Rose Window", "Nave of Thorns", "Reliquary", "Vespers", "Crimson Altar", "Bell Tower"],
  ["Ossuary", "Marrow Vault", "Grave Steps", "Crypt Walls", "Dust Chapel", "Rampart", "Bone Throne"],
  ["Rivet Row", "Slag Pit", "Black Glass", "Anvil Deep", "Chain Works", "Void Foundry", "Iron Lung"],
  ["Prism Halls", "Shard Garden", "Mirror Court", "Verdict", "Sapphire Gate", "Sentence", "The Scales"],
];

function campaign(): Stage[] {
  const out: Stage[] = [];
  WORLDS.forEach((world, w) => {
    let gen = 0;
    for (let i = 0; i < 10; i++) {
      const theme = world.themes[i % 2];
      const difficulty = w * 3 + i * 0.45;
      if (i === 9) {
        out.push({ name: BOSSES[w].name, rows: [], theme: world.themes[1], track: world.themes[1], world: w, index: i, difficulty, boss: w });
        continue;
      }
      const hand = HANDMADE[w].find(([, at]) => at === i);
      if (hand) {
        const lvl = LEVELS[hand[0]];
        out.push({ name: hand[0] === 9 ? "Last Bastion" : lvl.name, rows: lvl.rows, theme, track: theme, world: w, index: i, difficulty });
        continue;
      }
      const rows = generateLevel(7919 * (w + 1) + 104729 * i, { difficulty, features: world.features });
      out.push({ name: GEN_NAMES[w][gen++ % 7], rows, theme, track: theme, world: w, index: i, difficulty });
    }
  });
  return out;
}

export const CAMPAIGN: Stage[] = campaign();

/** One level of a roguelite run. Every 5th depth is a boss. */
export function runStage(runSeed: number, depth: number): Stage {
  const rnd = seeded(runSeed * 31 + depth * 977);
  const world = Math.min(4, Math.floor(depth / 5));
  const theme = WORLDS[Math.floor(rnd() * WORLDS.length)].themes[Math.floor(rnd() * 2)];
  const difficulty = 1 + depth * 0.9;
  if (depth > 0 && depth % 5 === 4) {
    const boss = Math.floor(rnd() * BOSSES.length);
    return { name: BOSSES[boss].name, rows: [], theme: WORLDS[boss].themes[1], track: WORLDS[boss].themes[1], world: boss, index: depth, difficulty, boss };
  }
  const rows = generateLevel(Math.floor(rnd() * 1e9), { difficulty, features: WORLDS[world].features });
  return { name: `Depth ${depth + 1}`, rows, theme, track: theme, world, index: depth, difficulty };
}
