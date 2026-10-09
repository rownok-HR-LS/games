// Per-level brick materials, matched to each level's soundtrack. Painted procedurally once per
// (level theme, brick type, colour, variant, scale) into an offscreen canvas, then blitted.

export type Theme = "magma" | "glass" | "bone" | "argent" | "stone" | "velvet" | "obsidian" | "gem" | "iron" | "judgment";

// Level index → material (same order as the levels and their tracks).
export const LEVEL_THEMES: Theme[] = ["magma", "glass", "bone", "argent", "stone", "velvet", "obsidian", "gem", "iron", "judgment"];

export type SkinType = "normal" | "strong" | "metal" | "explosive" | "mystery";

// Strong (multi-hit) bricks take a colour that suits each material instead of plain grey.
const STRONG: Record<Theme, string> = {
  magma: "#ffb347",
  glass: "#b9c8ff",
  bone: "#d6c3a0",
  argent: "#ff4a2a",
  stone: "#a39a90",
  velvet: "#9a1a2c",
  obsidian: "#ff2a6a",
  gem: "#e8f4ff",
  iron: "#c9cdd6",
  judgment: "#ff3b1f",
};

/** Extra room around the brick for glows, in logical units. */
export const SKIN_PAD = 4;

type Ctx = CanvasRenderingContext2D;

// ── Colour helpers ──────────────────────────────────────────────────────────────────
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mix a colour towards white (t > 0) or black (t < 0). */
function shade(hex: string, t: number, alpha = 1) {
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const [r, g, b] = rgb(hex).map((v) => Math.round(v + (to - v) * k));
  return `rgba(${r},${g},${b},${alpha})`;
}
function blend(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function seeded(key: string) {
  let s = 0;
  for (let i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) | 0;
  s = (Math.abs(s) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function speckle(g: Ctx, w: number, h: number, rnd: () => number, n: number, light: string, dark: string) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? light : dark;
    const s = 0.5 + rnd() * 1.2;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}
function bevel(g: Ctx, w: number, h: number, r: number, top = 0.35, bottom = 0.45) {
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, `rgba(255,255,255,${top})`);
  lg.addColorStop(0.18, "rgba(255,255,255,0)");
  lg.addColorStop(0.75, "rgba(0,0,0,0)");
  lg.addColorStop(1, `rgba(0,0,0,${bottom})`);
  g.fillStyle = lg;
  rr(g, 0, 0, w, h, r);
  g.fill();
}
function rivet(g: Ctx, x: number, y: number, r: number, metal = "#c9a14a") {
  const rg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.2, x, y, r);
  rg.addColorStop(0, shade(metal, 0.7));
  rg.addColorStop(0.6, metal);
  rg.addColorStop(1, shade(metal, -0.6));
  g.fillStyle = rg;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// Small engraved rune glyphs (strokes in a 10×10 box).
const RUNES: number[][][] = [
  [[5, 0, 5, 10], [5, 3, 9, 0], [5, 3, 1, 0]],
  [[2, 0, 2, 10], [2, 2, 8, 5], [8, 5, 2, 8]],
  [[1, 10, 5, 0], [5, 0, 9, 10], [3, 5, 7, 5]],
  [[5, 0, 5, 10], [1, 4, 9, 4], [2, 9, 8, 9]],
  [[1, 1, 9, 9], [9, 1, 1, 9], [5, 0, 5, 10]],
  [[2, 0, 2, 10], [8, 0, 8, 10], [2, 5, 8, 2], [2, 8, 8, 5]],
];
function rune(g: Ctx, cx: number, cy: number, size: number, idx: number) {
  const k = size / 10;
  g.beginPath();
  for (const [x1, y1, x2, y2] of RUNES[idx % RUNES.length]) {
    g.moveTo(cx + (x1 - 5) * k, cy + (y1 - 5) * k);
    g.lineTo(cx + (x2 - 5) * k, cy + (y2 - 5) * k);
  }
  g.stroke();
}

// ── Materials ───────────────────────────────────────────────────────────────────────
// Each draws a brick of size w×h at the origin. `c` is the level colour for this brick.
const MATERIALS: Record<Theme, (g: Ctx, w: number, h: number, c: string, rnd: () => number, v: number) => void> = {
  // Molten basalt: dark rock, magma glowing through branching cracks.
  magma(g, w, h, c, rnd) {
    // Molten slab: cooled basalt crust along the top and bottom, a jagged seam of magma
    // glowing in the row's heat colour through the middle.
    const face = g.createLinearGradient(0, 0, 0, h);
    face.addColorStop(0, c);
    face.addColorStop(0.42, shade(c, 0.12));
    face.addColorStop(0.5, shade(c, 0.32));
    face.addColorStop(0.58, shade(c, 0.12));
    face.addColorStop(1, c);
    g.fillStyle = face;
    rr(g, 0, 0, w, h, 3);
    g.fill();
    g.save();
    rr(g, 0, 0, w, h, 3);
    g.clip();
    const crustBand = (top: boolean) => {
      const base = top ? h * (0.34 + rnd() * 0.08) : h * (0.66 - rnd() * 0.08);
      g.beginPath();
      g.moveTo(-1, top ? -1 : h + 1);
      let x = -1;
      g.lineTo(x, base);
      while (x < w + 1) {
        x += 3 + rnd() * 5;
        g.lineTo(x, base + (rnd() - 0.5) * 5 + (top ? -1 : 1));
      }
      g.lineTo(w + 1, top ? -1 : h + 1);
      g.closePath();
      const crust = g.createLinearGradient(0, top ? 0 : h, 0, base);
      crust.addColorStop(0, "#3e241e");
      crust.addColorStop(0.7, "#1e0d09");
      crust.addColorStop(1, shade(c, -0.55));
      g.fillStyle = crust;
      g.fill();
      g.strokeStyle = shade(c, 0.35, 0.9);
      g.lineWidth = 0.9;
      g.stroke();
    };
    crustBand(true);
    crustBand(false);
    // A couple of hairline cracks in the crust that glow faintly.
    g.strokeStyle = shade(c, 0.1, 0.55);
    g.lineWidth = 0.6;
    for (let k = 0; k < 2; k++) {
      const x0 = 6 + rnd() * (w - 12);
      const top = rnd() < 0.5;
      g.beginPath();
      g.moveTo(x0, top ? 0 : h);
      g.lineTo(x0 + (rnd() - 0.5) * 6, top ? h * 0.3 : h * 0.7);
      g.stroke();
    }
    speckle(g, w, h, rnd, 14, "rgba(255,200,160,0.10)", "rgba(0,0,0,0.25)");
    g.restore();
    g.strokeStyle = "rgba(20,6,4,0.9)";
    g.lineWidth = 1.4;
    rr(g, 0.7, 0.7, w - 1.4, h - 1.4, 3);
    g.stroke();
    bevel(g, w, h, 3, 0.25, 0.3);
  },

  // Gothic stained glass: jewel panes in a lead frame with a pointed arch.
  glass(g, w, h, c, rnd) {
    g.fillStyle = "#151012";
    rr(g, 0, 0, w, h, 2);
    g.fill();
    const panes = [
      [2.2, 2.2, w / 2 - 3.2, h - 4.4],
      [w / 2 + 1, 2.2, w / 2 - 3.2, h - 4.4],
    ];
    panes.forEach(([x, y, pw, ph], i) => {
      const hue = i ? shade(c, -0.12) : shade(c, 0.05);
      const rg = g.createRadialGradient(x + pw * 0.4, y + ph * 0.35, 1, x + pw / 2, y + ph / 2, pw * 0.8);
      rg.addColorStop(0, shade(c, 0.55));
      rg.addColorStop(0.5, hue);
      rg.addColorStop(1, shade(c, -0.45));
      g.fillStyle = rg;
      g.fillRect(x, y, pw, ph);
      // Glass ripples.
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.12})`;
        g.beginPath();
        g.ellipse(x + rnd() * pw, y + rnd() * ph, 1 + rnd() * 3, 0.6 + rnd() * 1.2, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    });
    // Lead came: frame, centre mullion and a pointed arch tracery.
    g.strokeStyle = "#2a2124";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(w / 2, 1.5);
    g.lineTo(w / 2, h - 1.5);
    g.moveTo(5, h - 2);
    g.quadraticCurveTo(5, 4, w / 4 + 1, 3);
    g.quadraticCurveTo(w / 2 - 4, 4, w / 2 - 4, h - 2);
    g.moveTo(w / 2 + 4, h - 2);
    g.quadraticCurveTo(w / 2 + 4, 4, (3 * w) / 4 - 1, 3);
    g.quadraticCurveTo(w - 5, 4, w - 5, h - 2);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 0.6;
    g.stroke();
    g.lineWidth = 2.2;
    g.strokeStyle = "#0d0a0b";
    rr(g, 1.1, 1.1, w - 2.2, h - 2.2, 2);
    g.stroke();
    // Light streak across the glass.
    const streak = g.createLinearGradient(0, 0, w, h);
    streak.addColorStop(0.25, "rgba(255,255,255,0)");
    streak.addColorStop(0.35, "rgba(255,255,255,0.18)");
    streak.addColorStop(0.45, "rgba(255,255,255,0)");
    g.fillStyle = streak;
    rr(g, 0, 0, w, h, 2);
    g.fill();
  },

  // Carved bone reliquary tile: ivory, engraved border and rune, brass rivets.
  bone(g, w, h, c, rnd, v) {
    const ivory = blend("#e9dcc0", c, 0.28);
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, shade(ivory, 0.25));
    base.addColorStop(0.55, ivory);
    base.addColorStop(1, shade(ivory, -0.35));
    g.fillStyle = base;
    rr(g, 0, 0, w, h, 4);
    g.fill();
    speckle(g, w, h, rnd, 30, "rgba(255,255,255,0.18)", "rgba(80,50,30,0.18)");
    g.strokeStyle = shade(ivory, -0.45, 0.8);
    g.lineWidth = 0.9;
    rr(g, 3.5, 3, w - 7, h - 6, 2.5);
    g.stroke();
    g.strokeStyle = shade(ivory, -0.55, 0.9);
    g.lineWidth = 1.3;
    g.lineCap = "round";
    rune(g, w / 2, h / 2, 9, v);
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 0.5;
    g.save();
    g.translate(0.5, 0.6);
    rune(g, w / 2, h / 2, 9, v);
    g.restore();
    for (const x of [6.5, w - 6.5]) rivet(g, x, h / 2, 1.8);
    bevel(g, w, h, 4, 0.3, 0.4);
  },

  // Argent-tech gunmetal plate with a glowing energy core.
  argent(g, w, h, c) {
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#4a505a");
    base.addColorStop(0.5, "#2a2e35");
    base.addColorStop(1, "#15171b");
    g.fillStyle = base;
    g.beginPath();
    g.moveTo(4, 0);
    g.lineTo(w - 4, 0);
    g.lineTo(w, 4);
    g.lineTo(w, h - 4);
    g.lineTo(w - 4, h);
    g.lineTo(4, h);
    g.lineTo(0, h - 4);
    g.lineTo(0, 4);
    g.closePath();
    g.fill();
    // Panel seams and vents.
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(9, 2);
    g.lineTo(9, h - 2);
    g.moveTo(w - 9, 2);
    g.lineTo(w - 9, h - 2);
    g.stroke();
    g.fillStyle = "rgba(0,0,0,0.5)";
    for (let k = 0; k < 3; k++) {
      g.fillRect(3, 6 + k * 3.5, 4, 1.2);
      g.fillRect(w - 7, 6 + k * 3.5, 4, 1.2);
    }
    // Glowing core slot.
    const glow = shade(c, 0.15);
    g.fillStyle = "#07080a";
    rr(g, 12, h / 2 - 3.6, w - 24, 7.2, 3.6);
    g.fill();
    g.shadowColor = glow;
    g.shadowBlur = 9;
    const core = g.createLinearGradient(0, h / 2 - 3, 0, h / 2 + 3);
    core.addColorStop(0, shade(c, 0.75));
    core.addColorStop(0.5, glow);
    core.addColorStop(1, shade(c, -0.3));
    g.fillStyle = core;
    rr(g, 13, h / 2 - 2.4, w - 26, 4.8, 2.4);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillRect(15, h / 2 - 1.4, w - 30, 0.9);
    // Top edge highlight.
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.fillRect(4, 0.6, w - 8, 1);
  },

  // Chiselled castle stone block.
  stone(g, w, h, c, rnd) {
    const tone = blend("#7b7268", c, 0.22);
    g.beginPath();
    const j = () => (rnd() - 0.5) * 1.6;
    g.moveTo(1 + j(), 1 + j());
    g.lineTo(w * 0.5 + j(), 0.5 + j());
    g.lineTo(w - 1 + j(), 1 + j());
    g.lineTo(w - 0.5 + j(), h * 0.5);
    g.lineTo(w - 1 + j(), h - 1 + j());
    g.lineTo(w * 0.5 + j(), h - 0.5 + j());
    g.lineTo(1 + j(), h - 1 + j());
    g.lineTo(0.5 + j(), h * 0.5);
    g.closePath();
    const base = g.createLinearGradient(0, 0, w * 0.3, h);
    base.addColorStop(0, shade(tone, 0.25));
    base.addColorStop(0.6, tone);
    base.addColorStop(1, shade(tone, -0.45));
    g.fillStyle = base;
    g.fill();
    g.save();
    g.clip();
    speckle(g, w, h, rnd, 60, "rgba(255,255,255,0.12)", "rgba(0,0,0,0.22)");
    // Chisel marks and a hairline crack.
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 0.6;
    for (let k = 0; k < 4; k++) {
      const x = rnd() * w;
      g.beginPath();
      g.moveTo(x, 2);
      g.lineTo(x + 2, 6);
      g.stroke();
    }
    g.beginPath();
    let x = w * (0.2 + rnd() * 0.6);
    let y = 0;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) g.lineTo((x += (rnd() - 0.5) * 6), (y += h / 4));
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.stroke();
    // Torch-light warmth from below.
    const warm = g.createLinearGradient(0, h, 0, 0);
    warm.addColorStop(0, "rgba(255,120,40,0.22)");
    warm.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = warm;
    g.fillRect(0, 0, w, h);
    g.restore();
    bevel(g, w, h, 2, 0.3, 0.5);
  },

  // Gothic velvet tile with gold filigree.
  velvet(g, w, h, c, rnd, v) {
    const deep = shade(c, -0.35);
    const base = g.createRadialGradient(w * 0.45, h * 0.35, 1, w / 2, h / 2, w * 0.6);
    base.addColorStop(0, shade(c, 0.1));
    base.addColorStop(0.6, deep);
    base.addColorStop(1, shade(c, -0.7));
    g.fillStyle = base;
    rr(g, 0, 0, w, h, 3);
    g.fill();
    speckle(g, w, h, rnd, 40, shade(c, 0.4, 0.12), "rgba(0,0,0,0.15)");
    const gold = g.createLinearGradient(0, 0, 0, h);
    gold.addColorStop(0, "#ffe3a0");
    gold.addColorStop(0.5, "#c8932f");
    gold.addColorStop(1, "#7a5214");
    g.strokeStyle = gold;
    g.lineWidth = 1.3;
    rr(g, 1.2, 1.2, w - 2.4, h - 2.4, 2.6);
    g.stroke();
    g.lineWidth = 0.6;
    rr(g, 3.4, 3.4, w - 6.8, h - 6.8, 1.5);
    g.stroke();
    // Centre ornament: a small gold lozenge or rose, scrolls either side.
    g.fillStyle = gold;
    const cx = w / 2;
    const cy = h / 2;
    g.beginPath();
    if (v % 2) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        g.moveTo(cx, cy);
        g.ellipse(cx + Math.cos(a) * 1.8, cy + Math.sin(a) * 1.8, 1.8, 1.1, a, 0, Math.PI * 2);
      }
    } else {
      g.moveTo(cx, cy - 4);
      g.lineTo(cx + 3.2, cy);
      g.lineTo(cx, cy + 4);
      g.lineTo(cx - 3.2, cy);
      g.closePath();
    }
    g.fill();
    g.lineWidth = 0.8;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * 6, cy);
      g.bezierCurveTo(cx + s * 9, cy - 4, cx + s * 13, cy + 4, cx + s * 16, cy);
      g.stroke();
    }
    bevel(g, w, h, 3, 0.15, 0.4);
  },

  // Black obsidian with glowing demonic veins.
  obsidian(g, w, h, c, rnd) {
    const base = g.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, blend("#2a2630", c, 0.22));
    base.addColorStop(0.5, blend("#0d0b10", c, 0.1));
    base.addColorStop(1, "#050407");
    g.fillStyle = base;
    rr(g, 0, 0, w, h, 2.5);
    g.fill();
    g.save();
    rr(g, 0, 0, w, h, 2.5);
    g.clip();
    // Branching veins that taper: a trunk with a few forks, glow then a hot core.
    const glow = shade(c, 0.05);
    const veins: [number, number, number][][] = [];
    const grow = (x: number, y: number, dir: number, len: number, width: number, depth: number) => {
      const pts: [number, number, number][] = [[x, y, width]];
      for (let s = 0; s < len; s++) {
        dir += (rnd() - 0.5) * 0.9;
        x += Math.cos(dir) * 3.2;
        y += Math.sin(dir) * 3.2;
        width *= 0.86;
        pts.push([x, y, width]);
        if (depth < 2 && rnd() < 0.22) grow(x, y, dir + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.5), len - s - 1, width * 0.8, depth + 1);
      }
      veins.push(pts);
    };
    grow(-1, h * (0.3 + rnd() * 0.4), (rnd() - 0.5) * 0.6, 17, 3.2, 0);
    grow(w + 1, h * (0.3 + rnd() * 0.4), Math.PI + (rnd() - 0.5) * 0.6, 8, 1.8, 1);
    g.lineCap = "round";
    for (const pass of [0, 1]) {
      g.shadowColor = glow;
      g.shadowBlur = pass ? 2 : 9;
      g.strokeStyle = pass ? shade(c, 0.7) : glow;
      for (const pts of veins) {
        for (let i = 1; i < pts.length; i++) {
          g.lineWidth = pass ? pts[i][2] * 0.45 : pts[i][2] * 1.15;
          g.beginPath();
          g.moveTo(pts[i - 1][0], pts[i - 1][1]);
          g.lineTo(pts[i][0], pts[i][1]);
          g.stroke();
        }
      }
    }
    g.shadowBlur = 0;
    // Glassy reflection.
    const sheen = g.createLinearGradient(0, 0, w * 0.6, h);
    sheen.addColorStop(0, "rgba(255,255,255,0.26)");
    sheen.addColorStop(0.35, "rgba(255,255,255,0.04)");
    sheen.addColorStop(0.36, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 0.7;
    rr(g, 0.4, 0.4, w - 0.8, h - 0.8, 2.5);
    g.stroke();
  },

  // Faceted cut gemstone with a sparkle.
  gem(g, w, h, c, rnd) {
    const inset = 5;
    const T = [inset + 3, 4, w - inset - 3, h - 4]; // table (top facet)
    const facet = (pts: number[], fill: string | CanvasGradient) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath();
      g.fill();
    };
    facet([0, 0, w, 0, T[2], T[1], T[0], T[1]], shade(c, 0.45)); // top
    facet([w, 0, w, h, T[2], T[3], T[2], T[1]], shade(c, -0.25)); // right
    facet([0, h, w, h, T[2], T[3], T[0], T[3]], shade(c, -0.5)); // bottom
    facet([0, 0, 0, h, T[0], T[3], T[0], T[1]], shade(c, 0.1)); // left
    const table = g.createLinearGradient(T[0], T[1], T[2], T[3]);
    table.addColorStop(0, shade(c, 0.35));
    table.addColorStop(0.5, c);
    table.addColorStop(1, shade(c, -0.2));
    facet([T[0], T[1], T[2], T[1], T[2], T[3], T[0], T[3]], table);
    // Inner table facets.
    g.strokeStyle = shade(c, 0.6, 0.5);
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(T[0], T[1]);
    g.lineTo(w / 2, h / 2);
    g.lineTo(T[2], T[1]);
    g.moveTo(T[0], T[3]);
    g.lineTo(w / 2, h / 2);
    g.lineTo(T[2], T[3]);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 0.7;
    g.strokeRect(0.4, 0.4, w - 0.8, h - 0.8);
    // Sparkle.
    const sx = T[0] + 4 + rnd() * 8;
    const sy = T[1] + 2.5;
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.moveTo(sx, sy - 3.2);
    g.lineTo(sx + 0.7, sy - 0.7);
    g.lineTo(sx + 3.2, sy);
    g.lineTo(sx + 0.7, sy + 0.7);
    g.lineTo(sx, sy + 3.2);
    g.lineTo(sx - 0.7, sy + 0.7);
    g.lineTo(sx - 3.2, sy);
    g.lineTo(sx - 0.7, sy - 0.7);
    g.closePath();
    g.fill();
  },

  // Riveted iron plate: brushed steel, painted band, rust.
  iron(g, w, h, c, rnd) {
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#8a8e96");
    base.addColorStop(0.5, "#5a5e66");
    base.addColorStop(1, "#33363c");
    g.fillStyle = base;
    rr(g, 0, 0, w, h, 1.5);
    g.fill();
    // Brushed lines.
    for (let y = 1; y < h; y += 1.4) {
      g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`;
      g.fillRect(1, y, w - 2, 0.5);
    }
    // Chipped painted band in the level colour.
    g.fillStyle = shade(c, -0.1, 0.9);
    g.fillRect(2, 4, w - 4, h - 11);
    g.fillStyle = shade(c, 0.35, 0.5);
    g.fillRect(2, 4, w - 4, 1.2);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = "rgba(90,94,102,0.95)";
      g.beginPath();
      g.ellipse(2 + rnd() * (w - 4), 4 + rnd() * (h - 11), 0.8 + rnd() * 2, 0.6 + rnd(), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Rust streaks.
    for (let k = 0; k < 4; k++) {
      const x = 4 + rnd() * (w - 8);
      const rg = g.createLinearGradient(0, h - 7, 0, h);
      rg.addColorStop(0, "rgba(140,60,20,0.7)");
      rg.addColorStop(1, "rgba(140,60,20,0)");
      g.fillStyle = rg;
      g.fillRect(x, h - 7, 1 + rnd() * 2.5, 7);
    }
    for (const [x, y] of [
      [3.5, 3.2],
      [w - 3.5, 3.2],
      [3.5, h - 3.2],
      [w - 3.5, h - 3.2],
    ])
      rivet(g, x, y, 1.6, "#9aa0aa");
    bevel(g, w, h, 1.5, 0.35, 0.45);
  },

  // Boss: obsidian slab with a burning rune and gold trim.
  judgment(g, w, h, c, rnd, v) {
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, blend("#2e1a1c", c, 0.32));
    base.addColorStop(1, blend("#0a0506", c, 0.12));
    g.fillStyle = base;
    rr(g, 0, 0, w, h, 2);
    g.fill();
    speckle(g, w, h, rnd, 20, "rgba(255,180,160,0.08)", "rgba(0,0,0,0.3)");
    const gold = g.createLinearGradient(0, 0, 0, h);
    gold.addColorStop(0, "#ffe7a6");
    gold.addColorStop(0.5, "#b8832a");
    gold.addColorStop(1, "#5e3c0c");
    g.strokeStyle = gold;
    g.lineWidth = 1.4;
    rr(g, 0.9, 0.9, w - 1.8, h - 1.8, 2);
    g.stroke();
    // Gold corner spikes.
    g.fillStyle = gold;
    for (const [x, y, sx, sy] of [
      [0, 0, 1, 1],
      [w, 0, -1, 1],
      [0, h, 1, -1],
      [w, h, -1, -1],
    ]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + sx * 6, y);
      g.lineTo(x, y + sy * 6);
      g.closePath();
      g.fill();
    }
    // Burning rune in the level colour.
    const glow = shade(blend(c, "#ff3b1f", 0.3), 0.15);
    g.strokeStyle = shade(glow, 0.2);
    g.lineWidth = 1.8;
    g.lineCap = "round";
    g.shadowColor = glow;
    g.shadowBlur = 8;
    rune(g, w / 2, h / 2, 11, v + 2);
    g.strokeStyle = shade(glow, 0.75);
    g.lineWidth = 0.7;
    g.shadowBlur = 0;
    rune(g, w / 2, h / 2, 11, v + 2);
    g.strokeStyle = shade(glow, 0.2);
    g.lineWidth = 1.8;
    g.shadowBlur = 8;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(w / 2 + s * 9, h / 2);
      g.lineTo(w / 2 + s * 16, h / 2);
      g.stroke();
    }
    g.shadowBlur = 0;
    bevel(g, w, h, 2, 0.2, 0.45);
  },
};

// ── Special bricks (same look on every level, tinted to fit) ─────────────────────────
function metal(g: Ctx, w: number, h: number) {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#5b5f69");
  base.addColorStop(0.45, "#2b2e35");
  base.addColorStop(0.55, "#1b1d22");
  base.addColorStop(1, "#0e0f12");
  g.fillStyle = base;
  rr(g, 0, 0, w, h, 2);
  g.fill();
  // Diagonal steel sheen and gold rivets: unbreakable.
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.beginPath();
  g.moveTo(w * 0.2, 0);
  g.lineTo(w * 0.38, 0);
  g.lineTo(w * 0.24, h);
  g.lineTo(w * 0.06, h);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 0.8;
  g.strokeRect(5, 4, w - 10, h - 8);
  for (const [x, y] of [
    [3, 3],
    [w - 3, 3],
    [3, h - 3],
    [w - 3, h - 3],
  ])
    rivet(g, x, y, 1.5);
  bevel(g, w, h, 2, 0.35, 0.5);
}

/** Armour brackets on strong bricks (drawn over the level material). */
function armour(g: Ctx, w: number, h: number) {
  const steel = g.createLinearGradient(0, 0, 0, h);
  steel.addColorStop(0, "#d6d9e0");
  steel.addColorStop(0.5, "#7d828d");
  steel.addColorStop(1, "#3c4048");
  g.fillStyle = steel;
  for (const x of [0, w - 7]) {
    g.beginPath();
    g.roundRect(x, 0, 7, h, x ? [0, 2, 2, 0] : [2, 0, 0, 2]);
    g.fill();
  }
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(6.4, 0, 0.8, h);
  g.fillRect(w - 7.2, 0, 0.8, h);
  for (const x of [3.5, w - 3.5]) {
    rivet(g, x, 4.5, 1.3, "#aab0bb");
    rivet(g, x, h - 4.5, 1.3, "#aab0bb");
  }
}

/** Dark socket behind the pulsing core of explosive bricks / the sigil of mystery bricks. */
function socket(g: Ctx, w: number, h: number, ring: string) {
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.arc(w / 2, h / 2, 7.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ring;
  g.lineWidth = 1.2;
  g.stroke();
}

// ── Cache ───────────────────────────────────────────────────────────────────────────
export class BrickSkins {
  private cache = new Map<string, HTMLCanvasElement>();
  private scale = 0;

  get(theme: Theme, type: SkinType, color: string, variant: number, w: number, h: number, scale: number) {
    if (scale !== this.scale) {
      this.cache.clear();
      this.scale = scale;
    }
    const key = `${theme}|${type}|${color}|${variant}`;
    let c = this.cache.get(key);
    if (!c) {
      c = this.paint(theme, type, color, variant, w, h, scale, key);
      this.cache.set(key, c);
    }
    return c;
  }

  private paint(theme: Theme, type: SkinType, color: string, variant: number, w: number, h: number, scale: number, key: string) {
    const c = document.createElement("canvas");
    c.width = Math.ceil((w + SKIN_PAD * 2) * scale);
    c.height = Math.ceil((h + SKIN_PAD * 2) * scale);
    const g = c.getContext("2d")!;
    g.scale(scale, scale);
    g.translate(SKIN_PAD, SKIN_PAD);
    const rnd = seeded(key);
    // Soft drop shadow under every brick for depth against the backdrop.
    g.save();
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 4;
    g.shadowOffsetY = 1.5;
    g.fillStyle = "rgba(0,0,0,0.6)";
    rr(g, 0.5, 0.5, w - 1, h - 1, 2);
    g.fill();
    g.restore();
    if (type === "metal") {
      metal(g, w, h);
      return c;
    }
    // Strong bricks: themed colour, a shade deeper for the 3-hit kind.
    const tint = type === "strong" ? (color === "#9aa3b8" ? blend(STRONG[theme], "#000000", 0.25) : STRONG[theme]) : color;
    MATERIALS[theme](g, w, h, tint, rnd, variant);
    if (type === "strong") armour(g, w, h);
    if (type === "explosive") socket(g, w, h, "rgba(255,120,40,0.8)");
    if (type === "mystery") socket(g, w, h, "rgba(255,210,110,0.85)");
    return c;
  }
}
