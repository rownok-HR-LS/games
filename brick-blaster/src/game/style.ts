// Style meter: chain hits without the ball touching the paddle to climb from D to SSS.
// The rank multiplies your score; it decays over time and drops when you get hurt.

export type Rank = { letter: string; name: string; color: string; mult: number };

export const RANKS: Rank[] = [
  { letter: "D", name: "Damned", color: "#b8aca6", mult: 1 },
  { letter: "C", name: "Cruel", color: "#6fa8ff", mult: 1.2 },
  { letter: "B", name: "Brutal", color: "#58d68d", mult: 1.5 },
  { letter: "A", name: "Abyssal", color: "#ffd84a", mult: 2 },
  { letter: "S", name: "Slaughter", color: "#ff9a2a", mult: 3 },
  { letter: "SS", name: "Sinful Storm", color: "#ff4a3a", mult: 4 },
  { letter: "SSS", name: "Supreme Sovereign", color: "#ff2a8a", mult: 5 },
];

const PER_RANK = 100;
const MAX = RANKS.length * PER_RANK - 1;

export type StyleEvent = "hit" | "destroy" | "boss" | "blast" | "power" | "shot";

const POINTS: Record<StyleEvent, number> = { hit: 9, destroy: 20, boss: 34, blast: 8, power: 14, shot: 12 };

export class StyleMeter {
  value = 0;
  rank = 0;
  peak = 0;
  /** Hits since the ball last touched the paddle. */
  air = 0;
  /** 1 → 0 animation after a rank change. */
  pop = 0;
  lastUp = true;
  /** Upgrades can slow the decay. */
  decayMul = 1;
  onRank?: (rank: number, up: boolean) => void;

  reset() {
    this.value = 0;
    this.rank = 0;
    this.air = 0;
    this.pop = 0;
  }

  /** Something stylish happened; airborne chains are worth more. */
  add(ev: StyleEvent) {
    const chain = 1 + Math.min(this.air, 24) * 0.1;
    this.value = Math.min(MAX, this.value + POINTS[ev] * chain);
    if (ev === "hit" || ev === "destroy" || ev === "boss") this.air++;
    this.refresh();
  }

  /** Ball touched the paddle: the chain ends; a pointless bounce costs a little. */
  paddle() {
    if (this.air === 0) this.value = Math.max(0, this.value - 12);
    this.air = 0;
    this.refresh();
  }

  /** Got hurt (lost a ball, stunned): drop whole ranks. */
  damage(ranks: number) {
    this.value = Math.max(0, Math.floor(this.value / PER_RANK - ranks) * PER_RANK);
    this.air = 0;
    this.refresh();
  }

  update(dt: number) {
    const decay = (3 + this.rank * 4.5) * this.decayMul;
    this.value = Math.max(0, this.value - decay * dt);
    this.pop = Math.max(0, this.pop - dt * 2.5);
    this.refresh();
  }

  get gauge() {
    return (this.value % PER_RANK) / PER_RANK;
  }

  get mult() {
    return RANKS[this.rank].mult;
  }

  private refresh() {
    const r = Math.min(RANKS.length - 1, Math.floor(this.value / PER_RANK));
    if (r !== this.rank) {
      this.lastUp = r > this.rank;
      this.rank = r;
      this.peak = Math.max(this.peak, r);
      this.pop = 1;
      this.onRank?.(r, this.lastUp);
    }
  }
}
