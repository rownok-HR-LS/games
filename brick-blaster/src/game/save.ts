// Progress and settings, kept in localStorage (wrapped so private mode or blocked storage
// never breaks the game).

export type Settings = {
  music: number; // 0..1
  sfx: number; // 0..1
  shake: boolean;
  effects: "full" | "reduced";
  /** Touch drag sensitivity. */
  touchGain: number;
  /** Bricks pulse to the beat. */
  beatPulse: boolean;
};

export type SaveData = {
  v: 1;
  /** Highest campaign stage index unlocked (0-based). */
  unlocked: number;
  /** Stars per campaign stage (0–3). */
  stars: number[];
  /** Best score per campaign stage. */
  best: number[];
  highScore: number;
  runBestDepth: number;
  runBestScore: number;
  runs: number;
  settings: Settings;
};

const KEY = "brick-blaster-save-v1";
const LEGACY_BEST = "brick-blaster-best";

export const DEFAULT_SETTINGS: Settings = { music: 0.8, sfx: 0.9, shake: true, effects: "full", touchGain: 1.35, beatPulse: true };

function fresh(): SaveData {
  return { v: 1, unlocked: 0, stars: [], best: [], highScore: 0, runBestDepth: 0, runBestScore: 0, runs: 0, settings: { ...DEFAULT_SETTINGS } };
}

export function loadSave(): SaveData {
  const data = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      Object.assign(data, parsed);
      data.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    }
    const legacy = Number(localStorage.getItem(LEGACY_BEST));
    if (legacy > data.highScore) data.highScore = legacy;
  } catch {}
  return data;
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
