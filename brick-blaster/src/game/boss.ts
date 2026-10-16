// Boss artwork: one demon lord per world, drawn procedurally. Pure drawing; the engine owns
// movement, attacks and hit points.

export type BossLook = {
  world: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  hp: number;
  maxHp: number;
  phase: number; // 1..3
  /** 0..1 white flash after taking damage. */
  flash: number;
  /** Weak point open (shield ring broken). */
  exposed: boolean;
  /** 0..1 mouth open (attacking). */
  mouth: number;
  /** Where the eyes look (usually the paddle). */
  lookX: number;
  time: number;
  /** 0..1 during the death sequence. */
  dying: number;
  reduced: boolean;
};

type Palette = { base: string; mid: string; rim: string; accent: string; eye: string; gold: string };

const PALETTES: Palette[] = [
  { base: "#2a0c06", mid: "#5a1a0c", rim: "#ff7a2a", accent: "#ff5a1f", eye: "255,170,40", gold: "#ffb347" }, // Infernal Warden
  { base: "#140a24", mid: "#2e1a4a", rim: "#d9a8ff", accent: "#ffc85a", eye: "255,220,120", gold: "#ffd27a" }, // Stained Bishop
  { base: "#4a4432", mid: "#c8bc98", rim: "#f4ecd2", accent: "#7affa8", eye: "130,255,180", gold: "#d8c8a0" }, // Bone Colossus
  { base: "#121316", mid: "#3a3d46", rim: "#aab0bc", accent: "#ff8a2a", eye: "255,140,40", gold: "#c87a3a" }, // Iron Tyrant
  { base: "#08040a", mid: "#2a0a10", rim: "#ffcf5a", accent: "#ff3b1f", eye: "255,60,30", gold: "#ffc040" }, // The Judge
];

export function drawBoss(g: CanvasRenderingContext2D, L: BossLook) {
  const P = PALETTES[L.world % PALETTES.length];
  const { x, y, rx, ry, time } = L;
  const pulse = L.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 4);
  const rage = L.phase >= 3;
  g.save();
  // Death: shudder and fade out.
  if (L.dying > 0) {
    g.translate((Math.random() - 0.5) * 10 * L.dying, (Math.random() - 0.5) * 10 * L.dying);
    g.globalAlpha = 1 - L.dying * 0.85;
  }

  // ── Aura ──
  const auraR = rx * (1.9 + (rage ? 0.4 : 0) + pulse * 0.15);
  const aura = g.createRadialGradient(x, y, rx * 0.4, x, y, auraR);
  aura.addColorStop(0, `rgba(${rage ? "255,40,20" : P.eye},${0.35 + 0.15 * pulse})`);
  aura.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = aura;
  g.beginPath();
  g.arc(x, y, auraR, 0, Math.PI * 2);
  g.fill();

  // ── Headwear behind the head ──
  drawHeadwear(g, L, P, true);

  // ── Head ──
  const head = g.createRadialGradient(x - rx * 0.3, y - ry * 0.5, rx * 0.1, x, y, rx * 1.1);
  head.addColorStop(0, P.mid);
  head.addColorStop(0.7, P.base);
  head.addColorStop(1, "#000000");
  g.fillStyle = head;
  g.beginPath();
  // Wide brow tapering to a jaw.
  g.moveTo(x - rx, y - ry * 0.35);
  g.bezierCurveTo(x - rx, y - ry * 1.15, x + rx, y - ry * 1.15, x + rx, y - ry * 0.35);
  g.bezierCurveTo(x + rx * 0.95, y + ry * 0.45, x + rx * 0.45, y + ry * 1.05, x, y + ry * 1.1);
  g.bezierCurveTo(x - rx * 0.45, y + ry * 1.05, x - rx * 0.95, y + ry * 0.45, x - rx, y - ry * 0.35);
  g.closePath();
  g.fill();
  g.strokeStyle = P.rim;
  g.globalAlpha *= 0.55;
  g.lineWidth = 2;
  g.stroke();
  g.globalAlpha = L.dying > 0 ? 1 - L.dying * 0.85 : 1;

  // Damage cracks spread as hit points fall.
  const dmg = 1 - L.hp / L.maxHp;
  if (dmg > 0.15) {
    g.strokeStyle = `rgba(${P.eye},${0.5 + 0.3 * pulse})`;
    g.lineWidth = 1.6;
    g.beginPath();
    const cracks = Math.floor(dmg * 6);
    for (let k = 0; k < cracks; k++) {
      const a = k * 2.4 + 0.6;
      const sx = x + Math.cos(a) * rx * 0.75;
      const sy = y + Math.sin(a) * ry * 0.75;
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a + 2.4) * 12, sy + Math.sin(a + 2.4) * 10);
      g.lineTo(sx + Math.cos(a + 2) * 22, sy + Math.sin(a + 2) * 6);
    }
    g.stroke();
  }

  // ── Brow plates ──
  g.fillStyle = P.mid;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + s * rx * 0.08, y - ry * 0.32);
    g.lineTo(x + s * rx * 0.8, y - ry * 0.55);
    g.lineTo(x + s * rx * 0.72, y - ry * 0.18);
    g.closePath();
    g.fill();
  }

  // ── Eyes (track the paddle) ──
  const look = Math.max(-1, Math.min(1, (L.lookX - x) / 300));
  for (const s of [-1, 1]) {
    const ex = x + s * rx * 0.42;
    const ey = y - ry * 0.12;
    g.fillStyle = "#050202";
    g.beginPath();
    g.ellipse(ex, ey, rx * 0.22, ry * 0.15, s * -0.35, 0, Math.PI * 2);
    g.fill();
    const glow = g.createRadialGradient(ex + look * 5, ey, 0, ex + look * 5, ey, rx * 0.24);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(0.3, `rgba(${rage ? "255,50,30" : P.eye},1)`);
    glow.addColorStop(1, `rgba(${rage ? "255,50,30" : P.eye},0)`);
    g.fillStyle = glow;
    g.beginPath();
    g.ellipse(ex + look * 5, ey, rx * 0.2, ry * 0.13, s * -0.35, 0, Math.PI * 2);
    g.fill();
  }

  // ── Mouth: jagged teeth, opening to a furnace when it attacks ──
  const my = y + ry * 0.5;
  const mw = rx * 0.55;
  const open = 3 + L.mouth * ry * 0.4;
  const inner = g.createLinearGradient(0, my - open, 0, my + open);
  inner.addColorStop(0, "#1a0000");
  inner.addColorStop(0.5, `rgba(${P.eye},${0.5 + 0.5 * L.mouth})`);
  inner.addColorStop(1, "#1a0000");
  g.fillStyle = inner;
  g.beginPath();
  g.ellipse(x, my, mw, open, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = L.world === 2 ? "#f4ecd2" : "#e8dcc8";
  for (let k = -3; k <= 3; k++) {
    const tx = x + (k / 3.5) * mw;
    g.beginPath();
    g.moveTo(tx - 4, my - open);
    g.lineTo(tx, my - open + 7);
    g.lineTo(tx + 4, my - open);
    g.moveTo(tx - 4, my + open);
    g.lineTo(tx, my + open - 7);
    g.lineTo(tx + 4, my + open);
    g.fill();
  }

  // ── Weak point: a gem in the forehead, blazing when exposed ──
  const gy = y - ry * 0.62;
  g.fillStyle = "#050202";
  g.beginPath();
  g.moveTo(x, gy - 11);
  g.lineTo(x + 8, gy);
  g.lineTo(x, gy + 11);
  g.lineTo(x - 8, gy);
  g.closePath();
  g.fill();
  if (L.exposed) {
    const gem = g.createRadialGradient(x, gy, 0, x, gy, 22 + pulse * 6);
    gem.addColorStop(0, "#ffffff");
    gem.addColorStop(0.25, P.accent);
    gem.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gem;
    g.beginPath();
    g.arc(x, gy, 22 + pulse * 6, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = `rgba(${P.eye},0.35)`;
    g.lineWidth = 1.2;
    g.stroke();
  }

  // ── Headwear in front ──
  drawHeadwear(g, L, P, false);

  // ── Hit flash ──
  if (L.flash > 0) {
    g.globalCompositeOperation = "lighter";
    g.fillStyle = `rgba(255,255,255,${L.flash * 0.6})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry * 1.1, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
}

function drawHeadwear(g: CanvasRenderingContext2D, L: BossLook, P: Palette, back: boolean) {
  const { x, y, rx, ry, time } = L;
  switch (L.world % 5) {
    case 0: {
      // Curled ram horns (behind).
      if (!back) return;
      for (const s of [-1, 1]) {
        const hg = g.createLinearGradient(x + s * rx * 0.6, y - ry, x + s * rx * 1.6, y + ry * 0.2);
        hg.addColorStop(0, "#3a2016");
        hg.addColorStop(1, P.accent);
        g.strokeStyle = hg;
        g.lineCap = "round";
        g.lineWidth = 18;
        g.beginPath();
        g.moveTo(x + s * rx * 0.6, y - ry * 0.7);
        g.bezierCurveTo(x + s * rx * 1.5, y - ry * 1.6, x + s * rx * 1.9, y - ry * 0.2, x + s * rx * 1.35, y + ry * 0.15);
        g.stroke();
        g.lineWidth = 6;
        g.strokeStyle = "rgba(255,200,140,0.35)";
        g.stroke();
      }
      return;
    }
    case 1: {
      // Tall mitre with stained-glass panels (behind the head, above it).
      if (!back) return;
      const top = y - ry * 2.3;
      g.fillStyle = P.base;
      g.beginPath();
      g.moveTo(x - rx * 0.75, y - ry * 0.6);
      g.quadraticCurveTo(x - rx * 0.7, top + ry * 0.4, x, top);
      g.quadraticCurveTo(x + rx * 0.7, top + ry * 0.4, x + rx * 0.75, y - ry * 0.6);
      g.closePath();
      g.fill();
      const colors = ["#b81c34", "#2a4ab0", "#d6a426", "#1f7a52", "#6a2aa8"];
      for (let k = 0; k < 5; k++) {
        const px = x + (k - 2) * rx * 0.24;
        g.fillStyle = colors[k];
        g.globalAlpha = 0.65 + 0.3 * Math.sin(time * 2 + k);
        g.beginPath();
        g.moveTo(px - rx * 0.09, y - ry * 0.75);
        g.lineTo(px, top + ry * (0.55 + Math.abs(k - 2) * 0.25));
        g.lineTo(px + rx * 0.09, y - ry * 0.75);
        g.fill();
      }
      g.globalAlpha = 1;
      g.strokeStyle = P.gold;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, top + 4);
      g.lineTo(x, y - ry * 0.7);
      g.moveTo(x - 12, top + 22);
      g.lineTo(x + 12, top + 22);
      g.stroke();
      return;
    }
    case 2: {
      // Broken bone spikes (behind) and a jagged jaw line.
      if (!back) return;
      g.fillStyle = "#d8ccab";
      for (let k = -3; k <= 3; k++) {
        const bx = x + k * rx * 0.28;
        const len = ry * (0.9 + (k % 2 ? 0.5 : 0.2));
        g.beginPath();
        g.moveTo(bx - 7, y - ry * 0.8);
        g.lineTo(bx + (k % 2) * 4, y - ry * 0.8 - len);
        g.lineTo(bx + 7, y - ry * 0.8);
        g.fill();
      }
      return;
    }
    case 3: {
      // Iron helm with a crown of spikes and a visor bar (front).
      if (back) {
        g.fillStyle = "#2a2c33";
        for (let k = -4; k <= 4; k++) {
          const bx = x + k * rx * 0.22;
          g.beginPath();
          g.moveTo(bx - 8, y - ry * 0.75);
          g.lineTo(bx, y - ry * 1.6 + Math.abs(k) * 6);
          g.lineTo(bx + 8, y - ry * 0.75);
          g.fill();
        }
        return;
      }
      g.fillStyle = "rgba(20,21,26,0.85)";
      g.fillRect(x - rx * 0.85, y - ry * 0.32, rx * 1.7, 6);
      for (const rxp of [-0.8, -0.4, 0.4, 0.8]) {
        g.fillStyle = "#9aa0aa";
        g.beginPath();
        g.arc(x + rxp * rx, y - ry * 0.29, 3, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    default: {
      // The Judge: a halo of gold thorns turning slowly (behind).
      if (!back) return;
      g.save();
      g.translate(x, y - ry * 0.45);
      g.rotate(L.reduced ? 0 : time * 0.3);
      g.strokeStyle = P.gold;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, rx * 1.25, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = P.gold;
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a - 0.06) * rx * 1.25, Math.sin(a - 0.06) * rx * 1.25);
        g.lineTo(Math.cos(a) * rx * 1.55, Math.sin(a) * rx * 1.55);
        g.lineTo(Math.cos(a + 0.06) * rx * 1.25, Math.sin(a + 0.06) * rx * 1.25);
        g.fill();
      }
      g.restore();
    }
  }
}
