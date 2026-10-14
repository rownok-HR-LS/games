// The style rank meter (D → SSS). Variety pays: repeating the same move earns less and less,
// getting hit drops two ranks, and the meter drains faster the higher it climbs.

export const RANKS = [
  { letter: "D", name: "Dull", at: 0, color: "#8f8a86" },
  { letter: "C", name: "Cutthroat", at: 100, color: "#6fd0ff" },
  { letter: "B", name: "Bloodthirsty", at: 230, color: "#6dff9c" },
  { letter: "A", name: "Annihilator", at: 400, color: "#ffd84a" },
  { letter: "S", name: "Savage", at: 610, color: "#ff8a2a" },
  { letter: "SS", name: "Soulreaper", at: 860, color: "#ff3b3b" },
  { letter: "SSS", name: "Stickman Supreme", at: 1150, color: "#ff2a8a" },
] as const;
const CAP = 1450;

/** Soul multiplier per rank. */
export const SOUL_MUL = [1, 1.2, 1.4, 1.7, 2, 2.5, 3];

export class StyleMeter {
  points = 0;
  rank = 0;
  best = 0;
  private recent: string[] = [];
  private idle = 0;
  /** Set by relics. */
  mul = 1;
  onRank: ((rank: number, up: boolean) => void) | null = null;

  /** Award points for a move; repetition decays the reward. */
  add(move: string, pts: number) {
    const reps = this.recent.filter((m) => m === move).length;
    const fresh = reps === 0 ? 1.25 : reps === 1 ? 0.8 : reps === 2 ? 0.45 : 0.2;
    this.points = Math.min(CAP, this.points + pts * fresh * this.mul);
    this.recent.push(move);
    if (this.recent.length > 6) this.recent.shift();
    this.idle = 0;
    this.sync();
  }

  hit() {
    // Drop two ranks.
    const target = Math.max(0, this.rank - 2);
    this.points = Math.min(this.points, RANKS[target].at + 10);
    this.recent.length = 0;
    this.sync();
  }

  reset() {
    this.points = 0;
    this.recent.length = 0;
    this.sync();
  }

  update(dt: number, inCombat: boolean) {
    this.idle += dt;
    if (!inCombat) return;
    const drain = (12 + this.rank * 9) * (this.idle > 2 ? 2 : 1);
    this.points = Math.max(0, this.points - drain * dt);
    this.sync();
  }

  /** Progress within the current rank, 0..1. */
  get frac() {
    const lo = RANKS[this.rank].at;
    const hi = this.rank + 1 < RANKS.length ? RANKS[this.rank + 1].at : CAP;
    return Math.max(0, Math.min(1, (this.points - lo) / (hi - lo)));
  }

  private sync() {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (this.points >= RANKS[i].at) r = i;
    if (r !== this.rank) {
      const up = r > this.rank;
      this.rank = r;
      this.best = Math.max(this.best, r);
      this.onRank?.(r, up);
    }
  }
}
