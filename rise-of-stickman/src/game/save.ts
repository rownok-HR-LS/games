// Progress kept between runs (browser storage): banked souls, Embers and Grave Wine, unlocked aspects,
// the last weapon and the aspect chosen for each weapon, Altar of Scars ranks, keepsakes, prophecies
// and how far each hub NPC's story has gone.
import type { AspectId } from "./aspects";
import type { Element } from "./boons";
import type { WeaponId } from "./weapons";

export type LastRun = { result: "dead" | "won"; by: string; room: number; weapon: WeaponId };

export type SaveData = {
  souls: number;
  unlocked: AspectId[];
  weapon: WeaponId;
  aspect: Partial<Record<WeaponId, AspectId>>;
  /** Altar of Scars currency. */
  embers: number;
  /** Gift currency for keepsakes. */
  wine: number;
  runs: number;
  deaths: number;
  wins: number;
  /** Altar slot id → ranks bought for side A and side B. */
  altar: Record<string, [number, number]>;
  /** Altar slot id → the active side (0 = A, 1 = B). */
  altarSide: Record<string, 0 | 1>;
  keepsakes: string[];
  keepsake: string | null;
  /** NPCs (and Lords) already given a bottle. */
  gifted: string[];
  lordsMet: Element[];
  /** Prophecy progress: counters and one-off flags. */
  counts: Record<string, number>;
  flags: string[];
  claimed: string[];
  /** Prophecies already announced as fulfilled. */
  told: string[];
  /** Story lines heard per NPC, and the run number of the last talk. */
  talk: Record<string, number>;
  talkRun: Record<string, number>;
  last: LastRun | null;
};

const KEY = "ros.save";
const BASE: AspectId[] = ["horseman", "reaper", "brawler", "warden"];

function fresh(): SaveData {
  return {
    souls: 0,
    unlocked: [...BASE],
    weapon: "katana",
    aspect: {},
    embers: 0,
    wine: 0,
    runs: 0,
    deaths: 0,
    wins: 0,
    altar: {},
    altarSide: {},
    keepsakes: [],
    keepsake: null,
    gifted: [],
    lordsMet: [],
    counts: {},
    flags: [],
    claimed: [],
    told: [],
    talk: {},
    talkRun: {},
    last: null,
  };
}

export function loadSave(): SaveData {
  const d = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(d, JSON.parse(raw));
    else {
      // Older saves only kept the weapon.
      const w = localStorage.getItem("ros.weapon");
      if (w) d.weapon = w as WeaponId;
    }
  } catch {
    /* storage unavailable */
  }
  for (const b of BASE) if (!d.unlocked.includes(b)) d.unlocked.push(b);
  return d;
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable */
  }
}
