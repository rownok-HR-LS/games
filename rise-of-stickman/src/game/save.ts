// Progress kept between runs (browser storage): banked souls, unlocked aspects, the last weapon and
// the aspect chosen for each weapon.
import type { AspectId } from "./aspects";
import type { WeaponId } from "./weapons";

export type SaveData = {
  souls: number;
  unlocked: AspectId[];
  weapon: WeaponId;
  aspect: Partial<Record<WeaponId, AspectId>>;
};

const KEY = "ros.save";
const BASE: AspectId[] = ["horseman", "reaper", "brawler", "warden"];

export function loadSave(): SaveData {
  const d: SaveData = { souls: 0, unlocked: [...BASE], weapon: "katana", aspect: {} };
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
