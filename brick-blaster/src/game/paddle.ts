// The paddle: a hell-forged blade whose look changes with every active power-up and
// reverts when the power runs out. Pure drawing; the engine owns the state.
import type { PowerKind } from "./engine";

export type PaddleLook = {
  x: number; // centre
  y: number; // top edge
  w: number;
  h: number;
  time: number;
  timers: Partial<Record<PowerKind, number>>;
  /** 0..1 burst when a power is gained or lost. */
  flash: number;
  flashColor: string;
  /** 0..1 right after the laser fires. */
  muzzle: number;
  shield: boolean;
  reduced: boolean;
};

// Core colour by priority (strongest effect wins).
const CORE: [PowerKind | "base", string][] = [
  ["fire", "#ff8a1f"],
  ["laser", "#ff3fa4"],
  ["catch", "#3fe07a"],
  ["slow", "#4fe3ff"],
  ["fast", "#ff2a1a"],
  ["expand", "#4f9bff"],
  ["shrink", "#ff4a3a"],
  ["base", "#ff3b1f"],
];

/** Fade parts of an expiring power: steady, then blinking in the last 2 seconds. */
function presence(t: number | undefined, time: number) {
  if (t === undefined) return 0;
  if (t > 2) return 1;
  return 0.35 + 0.65 * (Math.sin(time * (14 + (2 - t) * 10)) > 0 ? 1 : 0);
}

function bladePath(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, h: number) {
  // Long hexagonal blade with pointed ends and an angled underside.
  g.beginPath();
  g.moveTo(x0 + 7, y);
  g.lineTo(x1 - 7, y);
  g.lineTo(x1 + 5, y + h * 0.45);
  g.lineTo(x1 - 3, y + h);
  g.lineTo(x0 + 3, y + h);
  g.lineTo(x0 - 5, y + h * 0.45);
  g.closePath();
}

export function drawPaddle(g: CanvasRenderingContext2D, L: PaddleLook) {
  const { x, y, w, h, time, timers } = L;
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const coreColor = CORE.find(([k]) => k === "base" || timers[k as PowerKind] !== undefined)![1];
  const pulse = L.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(time * 6);
  const shrink = presence(timers.shrink, time);
  const fast = presence(timers.fast, time);
  // Bad powers make the core sputter.
  const sputter = shrink || fast ? (Math.random() < 0.18 ? 0.25 : 1) : 1;

  g.save();

  // ── Aura under the blade ──
  g.shadowColor = coreColor;
  g.shadowBlur = 16 + pulse * 10;
  g.fillStyle = "rgba(0,0,0,0.01)";
  bladePath(g, x0, x1, y, h);
  g.fill();
  g.shadowBlur = 0;

  // ── Frost (slow): icy crystals hanging under and around the blade ──
  const frost = presence(timers.slow, time);
  if (frost) {
    g.globalAlpha = frost;
    g.fillStyle = "rgba(170,240,255,0.85)";
    for (let i = 0; i < Math.floor(w / 9); i++) {
      const fx = x0 + 6 + i * 9 + ((i * 37) % 5);
      const len = 4 + ((i * 53) % 6);
      g.beginPath();
      g.moveTo(fx - 2, y + h - 1);
      g.lineTo(fx, y + h + len);
      g.lineTo(fx + 2, y + h - 1);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // ── Expand: armour extensions at both ends ──
  const ext = presence(timers.expand, time);
  if (ext) {
    g.globalAlpha = ext;
    for (const s of [-1, 1]) {
      const ex = s < 0 ? x0 - 2 : x1 + 2;
      g.fillStyle = "#2a3a5a";
      g.beginPath();
      g.moveTo(ex, y + 2);
      g.lineTo(ex + s * 9, y + h * 0.45);
      g.lineTo(ex, y + h - 2);
      g.closePath();
      g.fill();
      g.strokeStyle = "#7fb6ff";
      g.lineWidth = 1.4;
      g.stroke();
      // Chevrons along the blade pointing outward.
      g.strokeStyle = `rgba(127,182,255,${0.5 + 0.5 * pulse})`;
      g.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        const cx = (s < 0 ? x0 + 14 : x1 - 14) - s * k * 6;
        g.beginPath();
        g.moveTo(cx - s * 2, y + 3.5);
        g.lineTo(cx + s * 2, y + h / 2);
        g.lineTo(cx - s * 2, y + h - 3.5);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  // ── Horns: curved demon horns rising from each end ──
  for (const s of [-1, 1]) {
    const hx = s < 0 ? x0 + 3 : x1 - 3;
    const horn = g.createLinearGradient(hx, y, hx + s * 8, y - 11);
    horn.addColorStop(0, "#3a3d46");
    horn.addColorStop(0.65, "#17181c");
    horn.addColorStop(1, coreColor);
    g.fillStyle = horn;
    g.beginPath();
    g.moveTo(hx - s * 3, y + 1);
    g.quadraticCurveTo(hx + s * 2, y - 4, hx + s * 9, y - 11);
    g.quadraticCurveTo(hx + s * 4, y - 3, hx + s * 6, y + 2);
    g.closePath();
    g.fill();
  }

  // ── Blade body: forged gunmetal ──
  const body = g.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, "#8d929e");
  body.addColorStop(0.25, "#4c505a");
  body.addColorStop(0.6, "#22242a");
  body.addColorStop(1, "#0d0e11");
  g.fillStyle = body;
  bladePath(g, x0, x1, y, h);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.8)";
  g.lineWidth = 1;
  g.stroke();
  // Sharp top edge highlight.
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.fillRect(x0 + 7, y + 0.6, w - 14, 0.9);

  // Serrated teeth along the underside.
  g.fillStyle = "#1a1b20";
  for (let tx = x0 + 10; tx < x1 - 10; tx += 7) {
    g.beginPath();
    g.moveTo(tx, y + h - 0.5);
    g.lineTo(tx + 2.5, y + h + 3);
    g.lineTo(tx + 5, y + h - 0.5);
    g.fill();
  }

  // ── Molten core slot ──
  const cx0 = x0 + 12;
  const cw = w - 24;
  const cy = y + h * 0.42;
  g.fillStyle = "#050505";
  g.beginPath();
  g.roundRect(cx0 - 1, cy - 3.2, cw + 2, 6.4, 3.2);
  g.fill();
  g.globalAlpha = sputter;
  g.shadowColor = coreColor;
  g.shadowBlur = 10 + pulse * 8;
  const core = g.createLinearGradient(0, cy - 2.4, 0, cy + 2.4);
  core.addColorStop(0, "#fff3d6");
  core.addColorStop(0.35, coreColor);
  core.addColorStop(1, "#3a0602");
  g.fillStyle = core;
  g.beginPath();
  g.roundRect(cx0, cy - 2.4, cw, 4.8, 2.4);
  g.fill();
  g.shadowBlur = 0;
  // Energy pulses travelling along the core.
  if (!L.reduced) {
    for (let k = 0; k < 3; k++) {
      const px = cx0 + (((time * 90 + k * (cw / 3)) % cw) + cw) % cw;
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillRect(px, cy - 1.2, 3, 2.4);
    }
  }
  g.globalAlpha = 1;

  // Claw-slash vents with ember glow, and rivets.
  g.strokeStyle = `rgba(255,${90 + Math.round(pulse * 60)},30,${0.6 + 0.4 * pulse})`;
  g.lineWidth = 1.3;
  g.lineCap = "round";
  for (const s of [-1, 1]) {
    const vx = s < 0 ? x0 + 3.5 : x1 - 3.5;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const ox = vx - s * k * 2.6;
      g.moveTo(ox, y + 3.5);
      g.lineTo(ox - s * 2.2, y + h - 3.5);
    }
    g.stroke();
  }
  for (const rx of [x0 + 9.5, x1 - 9.5]) {
    g.fillStyle = "#c9a14a";
    g.beginPath();
    g.arc(rx, y + h - 3.2, 1.1, 0, Math.PI * 2);
    g.fill();
  }

  // ── Shrink: cracked plating ──
  if (shrink) {
    g.globalAlpha = shrink;
    g.strokeStyle = "rgba(0,0,0,0.9)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - w * 0.15, y);
    g.lineTo(x - w * 0.05, y + h * 0.5);
    g.lineTo(x - w * 0.12, y + h);
    g.moveTo(x + w * 0.2, y);
    g.lineTo(x + w * 0.12, y + h * 0.6);
    g.stroke();
    g.globalAlpha = 1;
  }

  // ── Fast: overheating, red-hot edges and heat haze ──
  if (fast) {
    g.globalAlpha = fast * (0.5 + 0.5 * pulse);
    const hot = g.createLinearGradient(0, y, 0, y + h);
    hot.addColorStop(0, "rgba(255,80,30,0.55)");
    hot.addColorStop(1, "rgba(255,30,10,0)");
    g.fillStyle = hot;
    bladePath(g, x0, x1, y, h);
    g.fill();
    g.strokeStyle = "rgba(255,160,120,0.35)";
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const hx = x0 + w * (0.2 + k * 0.2);
      g.beginPath();
      for (let s = 0; s <= 6; s++) {
        const yy = y - 2 - s * 2.4;
        const xx = hx + Math.sin(time * 9 + s + k) * 1.6;
        if (s) g.lineTo(xx, yy);
        else g.moveTo(xx, yy);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // ── Laser: twin cannons ──
  const laser = presence(timers.laser, time);
  if (laser) {
    g.globalAlpha = laser;
    for (const lx of [x0 + 8, x1 - 8]) {
      const barrel = g.createLinearGradient(lx - 3, 0, lx + 3, 0);
      barrel.addColorStop(0, "#1c1d22");
      barrel.addColorStop(0.5, "#8a8f9a");
      barrel.addColorStop(1, "#1c1d22");
      g.fillStyle = barrel;
      g.fillRect(lx - 3, y - 9, 6, 10);
      g.fillStyle = "#2a2c33";
      g.fillRect(lx - 4.5, y - 2, 9, 3);
      g.fillStyle = "#ff3fa4";
      g.shadowColor = "#ff3fa4";
      g.shadowBlur = 8 + L.muzzle * 14;
      g.fillRect(lx - 2, y - 10, 4, 2);
      if (L.muzzle > 0) {
        g.globalAlpha = laser * L.muzzle;
        g.fillStyle = "#ffd1ec";
        g.beginPath();
        g.arc(lx, y - 12, 2 + L.muzzle * 4, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = laser;
      }
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }

  // ── Catch: electromagnet coils and arcing field ──
  const mag = presence(timers.catch, time);
  if (mag) {
    g.globalAlpha = mag;
    g.fillStyle = "#b07a2a";
    for (let cxx = x0 + 14; cxx < x1 - 14; cxx += 5) g.fillRect(cxx, y - 2.5, 3, 2.5);
    g.strokeStyle = `rgba(90,255,150,${0.45 + 0.4 * pulse})`;
    g.lineWidth = 1.2;
    g.shadowColor = "#3fe07a";
    g.shadowBlur = 8;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let s = 0; s <= 12; s++) {
        const xx = x0 + 12 + ((w - 24) * s) / 12;
        const yy = y - 6 - k * 4 + Math.sin(time * 12 + s * 1.3 + k * 2) * 2.2;
        if (s) g.lineTo(xx, yy);
        else g.moveTo(xx, yy);
      }
      g.stroke();
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  // ── Fire: flames licking off the top ──
  const fire = presence(timers.fire, time);
  if (fire) {
    g.globalAlpha = fire;
    const n = Math.max(4, Math.floor(w / 12));
    for (let k = 0; k < n; k++) {
      const fx = x0 + 10 + ((w - 20) * (k + 0.5)) / n;
      const fl = 8 + 6 * (0.5 + 0.5 * Math.sin(time * 11 + k * 1.7));
      const sway = Math.sin(time * 7 + k) * 2.5;
      const flame = g.createLinearGradient(0, y, 0, y - fl);
      flame.addColorStop(0, "rgba(255,240,170,0.95)");
      flame.addColorStop(0.4, "rgba(255,140,30,0.85)");
      flame.addColorStop(1, "rgba(200,30,10,0)");
      g.fillStyle = flame;
      g.beginPath();
      g.moveTo(fx - 4, y + 1);
      g.quadraticCurveTo(fx - 4, y - fl * 0.5, fx + sway, y - fl);
      g.quadraticCurveTo(fx + 4, y - fl * 0.5, fx + 4, y + 1);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // ── Shield link: faint blue aura while the floor shield is up ──
  if (L.shield) {
    g.strokeStyle = `rgba(109,167,236,${0.25 + 0.2 * pulse})`;
    g.lineWidth = 1.5;
    bladePath(g, x0 - 2, x1 + 2, y - 2, h + 4);
    g.stroke();
  }

  // ── Power-up / power-down burst ──
  if (L.flash > 0) {
    g.globalAlpha = L.flash;
    g.fillStyle = L.flashColor;
    g.shadowColor = L.flashColor;
    g.shadowBlur = 20;
    bladePath(g, x0, x1, y, h);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = L.flashColor;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x, y + h / 2, w / 2 + (1 - L.flash) * 30, h / 2 + (1 - L.flash) * 14, 0, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }

  g.restore();
}
