// Procedural level layouts, used for the campaign's generated levels (fixed seeds, so they're
// the same for everyone) and for every level of a roguelite run. Layouts are mirrored left↔right
// so they always look designed.
//
// Output uses the same legend as levels.ts, plus the new brick types:
//   <  sliding brick (its whole row glides side to side)
//   R  regenerating brick (grows back a few seconds after breaking)
//   S  shooter (fires slow bolts at the paddle)
//   O  portal (the two portals swap the ball between them; unbreakable, not needed to clear)

import { COLS } from "./levels";

export type Feature = "strong" | "metal" | "explosive" | "mystery" | "mover" | "regen" | "shooter" | "portal";

export function seeded(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const HALF = COLS / 2; // 7
const COLORS = "roygcbpw";

type Mask = number[][]; // rows × HALF (left half), 0 = empty, n = colour band

const SKULL = [
  "..xxxxx",
  ".xxxxxx",
  "xxxxxxx",
  "xx..xxx",
  "xx..xxx",
  "xxxxxxx",
  ".xxxx.x",
  "..xxxxx",
  "..x.x.x",
];

const MOTIFS: ((rows: number, rnd: () => number) => Mask)[] = [
  // Horizontal bands.
  (rows) => grid(rows, (r) => r + 1),
  // Pyramid.
  (rows) => grid(rows, (r, c) => (HALF - 1 - c <= r ? r + 1 : 0)),
  // Diamond with concentric colours.
  (rows) =>
    grid(rows, (r, c) => {
      const d = Math.abs(HALF - 0.5 - c) / HALF + Math.abs(r - (rows - 1) / 2) / ((rows + 1) / 2);
      return d <= 1 ? 1 + Math.floor(d * 4) : 0;
    }),
  // Hollow frame with a core.
  (rows) =>
    grid(rows, (r, c) => {
      const edge = r === 0 || r === rows - 1 || c === 0;
      const core = r >= 2 && r <= rows - 3 && c >= HALF - 2;
      return edge ? 1 : core ? 3 : 0;
    }),
  // Checkerboard.
  (rows) => grid(rows, (r, c) => ((r + c) % 2 === 0 ? (r % 3) + 1 : 0)),
  // Waves.
  (rows, rnd) => {
    const ph = rnd() * 6;
    return grid(rows, (r, c) => {
      const y = (Math.sin(c * 0.9 + ph) * 0.5 + 0.5) * (rows - 3);
      return Math.abs(r - y) < 1.6 || r === rows - 1 ? (c % 4) + 1 : 0;
    });
  },
  // Gothic arch window.
  (rows) =>
    grid(rows, (r, c) => {
      const cx = HALF - 0.5;
      const archTop = Math.max(0, 3 - Math.abs(cx - c) * 0.9);
      const inside = r >= archTop && c >= 1;
      const frame = inside && (c === 1 || r === rows - 1 || r < archTop + 1.2);
      return frame ? 1 : inside && (r + c) % 3 !== 0 ? 2 + (r % 3) : 0;
    }),
  // Skull.
  (rows) => grid(rows, (r, c) => (SKULL[r]?.[c] === "x" ? (r < 3 ? 1 : r < 6 ? 2 : 3) : 0)),
  // Cross.
  (rows) => grid(rows, (r, c) => (c >= HALF - 2 || (r >= rows / 2 - 1 && r <= rows / 2) ? 1 + (Math.abs(r - rows / 2) < 2 ? 1 : 0) : 0)),
  // Pillars.
  (rows) => grid(rows, (r, c) => (c % 3 !== 2 ? 1 + (r % 2) : r === 0 ? 3 : 0)),
  // Chevrons.
  (rows) => grid(rows, (r, c) => ((r + (HALF - 1 - c)) % 4 < 2 ? 1 + ((r + c) % 3) : 0)),
  // Fortress: walls, battlements and a keep.
  (rows) =>
    grid(rows, (r, c) => {
      if (r === 0) return c % 2 === 0 ? 1 : 0;
      if (c === 0 || r === rows - 1) return 1;
      if (c >= HALF - 2 && r >= 2) return 2;
      return r >= rows - 3 ? 3 : 0;
    }),
  // Organic blob (cellular noise).
  (rows, rnd) => {
    let m = grid(rows, () => (rnd() < 0.55 ? 1 : 0));
    for (let it = 0; it < 2; it++) {
      m = m.map((row, r) =>
        row.map((_, c) => {
          let n = 0;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr;
              const cc = c + dc > HALF - 1 ? HALF - 1 - (c + dc - HALF) : c + dc;
              if (rr >= 0 && rr < rows && cc >= 0) n += m[rr][cc] ? 1 : 0;
            }
          return n >= 5 ? 1 + (r % 4) : 0;
        }),
      );
    }
    return m;
  },
];

function grid(rows: number, f: (r: number, c: number) => number): Mask {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: HALF }, (_, c) => f(r, c)));
}

export type GenOptions = {
  /** 0 (gentle) … ~20 (brutal). */
  difficulty: number;
  features: Feature[];
  /** Force a motif (index into the list); otherwise random. */
  motif?: number;
};

export function motifCount() {
  return MOTIFS.length;
}

/** Build a 14-column layout. Deterministic for a given seed and options. */
export function generateLevel(seed: number, opts: GenOptions): string[] {
  const rnd = seeded(seed);
  const has = (f: Feature) => opts.features.includes(f);
  const d = opts.difficulty;
  const rows = Math.min(10, 6 + Math.floor(rnd() * 3) + Math.floor(d / 6));
  const motif = MOTIFS[opts.motif ?? Math.floor(rnd() * MOTIFS.length)];
  let mask = motif(rows, rnd);
  // Never too sparse: top up with a bottom band if needed.
  const filled = () => mask.flat().filter(Boolean).length;
  if (filled() < 18) mask = mask.map((row, r) => (r >= rows - 2 ? row.map((v) => v || 1) : row));

  // Colour bands → palette letters, rotated per seed.
  const shift = Math.floor(rnd() * COLORS.length);
  const half: string[][] = mask.map((row) => row.map((v) => (v ? COLORS[(v - 1 + shift) % COLORS.length] : ".")));

  const cells: [number, number][] = [];
  half.forEach((row, r) => row.forEach((ch, c) => ch !== "." && cells.push([r, c])));
  const pick = () => cells[Math.floor(rnd() * cells.length)];
  const put = (n: number, ch: string, filter: (r: number, c: number) => boolean = () => true) => {
    for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
      const [r, c] = pick();
      if (!filter(r, c) || !/[a-z]/.test(half[r][c])) continue;
      half[r][c] = ch;
      k++;
    }
  };

  if (has("strong")) {
    const p = Math.min(0.45, 0.05 + d * 0.025);
    for (const [r, c] of cells) if (rnd() < p) half[r][c] = rnd() < d * 0.03 ? "3" : "2";
  }
  if (has("metal") && d >= 3) put(1 + Math.floor(rnd() * Math.min(3, d / 4)), "M", (r) => r > 0 && r < rows - 1);
  if (has("explosive")) put(1 + Math.floor(rnd() * 2), "X");
  if (has("regen")) put(2 + Math.floor(rnd() * 2), "R");
  if (has("shooter")) put(1, "S", (r) => r >= rows - 3);
  if (has("mystery")) put(1 + Math.floor(rnd() * 2), "?");

  let out = half.map((row) => {
    const left = row.join("");
    return left + [...left].reverse().join("");
  });

  // A sliding row: every other cell of one middle row, all gliding together.
  if (has("mover")) {
    const r = Math.max(1, Math.floor(rows / 2) - 1 + Math.floor(rnd() * 2));
    out[r] = ".<.<.<..<.<.<.";
  }
  // A portal pair, mirrored, in an empty-ish spot below the bricks' middle.
  if (has("portal")) {
    let r = Math.min(rows - 1, Math.floor(rows * 0.6));
    if (out[r].includes("<")) r = Math.min(rows - 1, r + 1);
    const c = 1 + Math.floor(rnd() * 3);
    const row = [...out[r]];
    row[c] = "O";
    row[COLS - 1 - c] = "O";
    out[r] = row.join("");
  }
  // Leave a little air above the bricks on short layouts.
  if (rows <= 7) out = ["..............", ...out];
  return out;
}
