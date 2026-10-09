// Per-level ball looks, matched to each level's bricks and soundtrack. Visual only: the
// physics radius never changes. Glows use radial gradients (not shadowBlur) so 12 balls stay cheap.
import type { Theme } from "./brickskins";

export type BallLook = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  trail: { x: number; y: number }[];
  time: number;
  fire: boolean;
  /** Fast-ball (bad) power: red afterimages, speed lines and a shock bow. */
  fast: boolean;
  reduced: boolean;
  /** Stable per-ball seed so multi-balls don't spin in lockstep. */
  seed: number;
};

type G = CanvasRenderingContext2D;

function halo(g: G, x: number, y: number, r: number, color: string, alpha: number) {
  const h = g.createRadialGradient(x, y, r * 0.3, x, y, r);
  h.addColorStop(0, color.replace("ALPHA", String(alpha)));
  h.addColorStop(1, color.replace("ALPHA", "0"));
  g.fillStyle = h;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function disc(g: G, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}

// ── Trails ──────────────────────────────────────────────────────────────────────────
type TrailStyle = { kind: "flame" | "spark" | "wisp" | "shard" | "drip" | "ribbon"; inner: string; outer: string };

function drawTrail(g: G, b: BallLook, s: TrailStyle) {
  const n = b.trail.length;
  if (!n) return;
  const r = b.r;
  if (s.kind === "wisp" || s.kind === "ribbon") {
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let i = 1; i < n; i++) {
      const a = i / n;
      g.strokeStyle = s.outer.replace("ALPHA", (a * (s.kind === "wisp" ? 0.35 : 0.5)).toFixed(3));
      g.lineWidth = r * 2 * a;
      g.beginPath();
      g.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
      g.lineTo(b.trail[i].x, b.trail[i].y);
      g.stroke();
      g.strokeStyle = s.inner.replace("ALPHA", (a * 0.8).toFixed(3));
      g.lineWidth = r * 0.7 * a;
      g.stroke();
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = (i + 1) / n;
    const t = b.trail[i];
    // Deterministic jitter per trail slot, animated with time.
    const jx = Math.sin(b.time * 23 + i * 2.1 + b.seed) * r * 0.45 * (1 - a);
    const jy = Math.cos(b.time * 19 + i * 1.7 + b.seed) * r * 0.45 * (1 - a);
    if (s.kind === "flame") {
      const fr = r * (0.35 + 0.95 * a);
      const f = g.createRadialGradient(t.x + jx, t.y + jy, 0, t.x + jx, t.y + jy, fr);
      f.addColorStop(0, s.inner.replace("ALPHA", (a * 0.85).toFixed(3)));
      f.addColorStop(1, s.outer.replace("ALPHA", "0"));
      g.fillStyle = f;
      disc(g, t.x + jx, t.y + jy, fr);
      g.fill();
    } else if (s.kind === "spark") {
      g.fillStyle = (i % 2 ? s.inner : s.outer).replace("ALPHA", a.toFixed(3));
      const sz = r * 0.35 * a + 0.6;
      g.fillRect(t.x + jx * 2, t.y + jy * 2, sz, sz);
    } else if (s.kind === "shard") {
      g.save();
      g.translate(t.x + jx * 1.5, t.y + jy * 1.5);
      g.rotate(b.time * 6 + i);
      g.fillStyle = `hsla(${(b.time * 120 + i * 36) % 360},90%,70%,${(a * 0.8).toFixed(3)})`;
      const sz = r * 0.55 * a + 0.8;
      g.beginPath();
      g.moveTo(0, -sz);
      g.lineTo(sz * 0.6, sz * 0.6);
      g.lineTo(-sz * 0.6, sz * 0.6);
      g.closePath();
      g.fill();
      g.restore();
    } else if (s.kind === "drip") {
      g.fillStyle = s.outer.replace("ALPHA", (a * 0.75).toFixed(3));
      const dr = r * 0.45 * a + 0.5;
      const dy = (1 - a) * r * 1.2; // drops sag as they fall behind
      g.beginPath();
      g.arc(t.x + jx * 0.5, t.y + dy, dr, 0, Math.PI);
      g.lineTo(t.x + jx * 0.5, t.y + dy - dr * 2.2);
      g.closePath();
      g.fill();
    }
  }
}

// ── Bodies ──────────────────────────────────────────────────────────────────────────
function skull(g: G, b: BallLook, demon: boolean) {
  const { x, y, r } = b;
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(b.time * 9 + b.seed) * 0.25 + Math.max(-0.5, Math.min(0.5, b.vx / 900)));
  // Horns (demon only).
  if (demon) {
    for (const s of [-1, 1]) {
      const hg = g.createLinearGradient(s * r * 0.5, -r * 0.4, s * r * 1.3, -r * 1.5);
      hg.addColorStop(0, "#2a0d0a");
      hg.addColorStop(1, "#ff4a1f");
      g.fillStyle = hg;
      g.beginPath();
      g.moveTo(s * r * 0.35, -r * 0.6);
      g.quadraticCurveTo(s * r * 1.3, -r * 0.7, s * r * 1.35, -r * 1.55);
      g.quadraticCurveTo(s * r * 0.95, -r * 0.95, s * r * 0.75, -r * 0.3);
      g.closePath();
      g.fill();
    }
  }
  // Cranium + jaw.
  const bone = g.createRadialGradient(-r * 0.3, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
  bone.addColorStop(0, demon ? "#ffd9c2" : "#fbf4e0");
  bone.addColorStop(0.6, demon ? "#b8644a" : "#d8ccab");
  bone.addColorStop(1, demon ? "#4a140c" : "#7d7056");
  g.fillStyle = bone;
  disc(g, 0, -r * 0.12, r * 0.92);
  g.fill();
  g.beginPath();
  g.roundRect(-r * 0.55, r * 0.35, r * 1.1, r * 0.6, r * 0.18);
  g.fill();
  // Eye sockets with glowing pupils.
  const eye = demon ? "255,60,20" : "130,255,190";
  for (const s of [-1, 1]) {
    g.fillStyle = "#0b0505";
    g.beginPath();
    g.ellipse(s * r * 0.36, -r * 0.05, r * 0.28, r * 0.24, s * (demon ? -0.5 : 0.2), 0, Math.PI * 2);
    g.fill();
    const p = g.createRadialGradient(s * r * 0.36, -r * 0.05, 0, s * r * 0.36, -r * 0.05, r * 0.28);
    p.addColorStop(0, `rgba(${eye},1)`);
    p.addColorStop(1, `rgba(${eye},0)`);
    g.fillStyle = p;
    disc(g, s * r * 0.36, -r * 0.05, r * 0.28);
    g.fill();
  }
  // Nose and teeth.
  g.fillStyle = "#1a0d0a";
  g.beginPath();
  g.moveTo(0, r * 0.15);
  g.lineTo(-r * 0.1, r * 0.35);
  g.lineTo(r * 0.1, r * 0.35);
  g.closePath();
  g.fill();
  g.strokeStyle = "#2a1a12";
  g.lineWidth = Math.max(0.5, r * 0.07);
  g.beginPath();
  g.moveTo(-r * 0.5, r * 0.62);
  g.lineTo(r * 0.5, r * 0.62);
  for (let k = -2; k <= 2; k++) {
    g.moveTo(k * r * 0.18, r * 0.42);
    g.lineTo(k * r * 0.18, r * 0.9);
  }
  g.stroke();
  g.restore();
}

function body(g: G, theme: Theme, b: BallLook) {
  const { x, y, r, time } = b;
  const spin = time * 7 + b.seed;
  switch (theme) {
    case "magma": {
      halo(g, x, y, r * 2.6, "rgba(255,110,30,ALPHA)", 0.45);
      const crust = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      crust.addColorStop(0, "#5a2a18");
      crust.addColorStop(1, "#140603");
      g.fillStyle = crust;
      disc(g, x, y, r);
      g.fill();
      g.save();
      g.translate(x, y);
      g.rotate(spin * 0.6);
      g.strokeStyle = "#ffb347";
      g.lineWidth = r * 0.22;
      g.lineCap = "round";
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        g.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15);
        g.lineTo(Math.cos(a + 0.4) * r * 0.55, Math.sin(a + 0.4) * r * 0.55);
        g.lineTo(Math.cos(a + 0.1) * r * 0.95, Math.sin(a + 0.1) * r * 0.95);
      }
      g.stroke();
      g.strokeStyle = "#fff1b0";
      g.lineWidth = r * 0.08;
      g.stroke();
      g.restore();
      break;
    }
    case "glass": {
      halo(g, x, y, r * 2.6, "rgba(255,240,200,ALPHA)", 0.4);
      const hue = (time * 90 + b.seed * 40) % 360;
      const orb = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
      orb.addColorStop(0, "#ffffff");
      orb.addColorStop(0.5, `hsl(${hue},90%,65%)`);
      orb.addColorStop(1, `hsl(${(hue + 60) % 360},80%,30%)`);
      g.fillStyle = orb;
      disc(g, x, y, r);
      g.fill();
      // Rotating leaded facets.
      g.save();
      g.translate(x, y);
      g.rotate(spin * 0.5);
      g.strokeStyle = "rgba(30,20,25,0.75)";
      g.lineWidth = r * 0.12;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.stroke();
      g.restore();
      g.fillStyle = "rgba(255,255,255,0.9)";
      disc(g, x - r * 0.35, y - r * 0.4, r * 0.18);
      g.fill();
      break;
    }
    case "bone":
      halo(g, x, y, r * 2.4, "rgba(130,255,190,ALPHA)", 0.3);
      skull(g, b, false);
      break;
    case "argent": {
      halo(g, x, y, r * 2.8, "rgba(255,70,30,ALPHA)", 0.5);
      const core = g.createRadialGradient(x, y, 0, x, y, r);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.35, "#ffd0a0");
      core.addColorStop(0.7, "#ff4a1f");
      core.addColorStop(1, "#7a0a04");
      g.fillStyle = core;
      disc(g, x, y, r);
      g.fill();
      // Crackling arcs around the core.
      g.strokeStyle = "rgba(255,200,150,0.9)";
      g.lineWidth = Math.max(0.6, r * 0.12);
      for (let k = 0; k < 3; k++) {
        const a0 = spin * 1.3 + (k / 3) * Math.PI * 2;
        g.beginPath();
        for (let s = 0; s <= 5; s++) {
          const a = a0 + s * 0.28;
          const rr = r * (1.25 + Math.sin(time * 40 + s * 3 + k) * 0.18);
          if (s) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.stroke();
      }
      break;
    }
    case "stone": {
      halo(g, x, y, r * 2.2, "rgba(255,140,60,ALPHA)", 0.25);
      g.save();
      g.translate(x, y);
      g.rotate(spin);
      g.fillStyle = "#3a3d44";
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a - 0.22) * r * 0.85, Math.sin(a - 0.22) * r * 0.85);
        g.lineTo(Math.cos(a) * r * 1.55, Math.sin(a) * r * 1.55);
        g.lineTo(Math.cos(a + 0.22) * r * 0.85, Math.sin(a + 0.22) * r * 0.85);
        g.fill();
      }
      g.restore();
      const iron = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      iron.addColorStop(0, "#b8bcc6");
      iron.addColorStop(0.5, "#4a4e58");
      iron.addColorStop(1, "#15171b");
      g.fillStyle = iron;
      disc(g, x, y, r);
      g.fill();
      break;
    }
    case "velvet": {
      halo(g, x, y, r * 2.4, "rgba(220,20,50,ALPHA)", 0.4);
      // Gold ring behind, then the blood orb, then the ring's front half.
      const tilt = Math.sin(time * 2 + b.seed) * 0.5;
      g.save();
      g.translate(x, y);
      g.rotate(tilt);
      g.strokeStyle = "#c8932f";
      g.lineWidth = r * 0.22;
      g.beginPath();
      g.ellipse(0, 0, r * 1.6, r * 0.45, 0, Math.PI, Math.PI * 2);
      g.stroke();
      g.restore();
      const orb = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
      orb.addColorStop(0, "#ff8a9a");
      orb.addColorStop(0.35, "#c4102a");
      orb.addColorStop(1, "#3a0008");
      g.fillStyle = orb;
      disc(g, x, y, r);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.85)";
      disc(g, x - r * 0.35, y - r * 0.4, r * 0.2);
      g.fill();
      g.save();
      g.translate(x, y);
      g.rotate(tilt);
      g.strokeStyle = "#ffd77a";
      g.lineWidth = r * 0.22;
      g.beginPath();
      g.ellipse(0, 0, r * 1.6, r * 0.45, 0, 0, Math.PI);
      g.stroke();
      g.restore();
      break;
    }
    case "obsidian": {
      halo(g, x, y, r * 2.6, "rgba(80,255,120,ALPHA)", 0.45);
      const sclera = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      sclera.addColorStop(0, "#f4ffb0");
      sclera.addColorStop(0.7, "#9be03a");
      sclera.addColorStop(1, "#1f4a08");
      g.fillStyle = sclera;
      disc(g, x, y, r);
      g.fill();
      // Blood veins.
      g.strokeStyle = "rgba(160,20,10,0.6)";
      g.lineWidth = Math.max(0.4, r * 0.06);
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + b.seed;
        g.moveTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
        g.lineTo(x + Math.cos(a + 0.3) * r * 0.6, y + Math.sin(a + 0.3) * r * 0.6);
      }
      g.stroke();
      // The eye looks where it's flying.
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const px = x + (b.vx / sp) * r * 0.35;
      const py = y + (b.vy / sp) * r * 0.35;
      g.fillStyle = "#0e2a06";
      disc(g, px, py, r * 0.5);
      g.fill();
      g.fillStyle = "#000";
      g.beginPath();
      g.ellipse(px, py, r * 0.12, r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.8)";
      disc(g, px - r * 0.2, py - r * 0.25, r * 0.1);
      g.fill();
      break;
    }
    case "gem": {
      halo(g, x, y, r * 2.4, "rgba(150,230,255,ALPHA)", 0.4);
      g.save();
      g.translate(x, y);
      g.rotate(spin * 0.4);
      const sides = 8;
      for (let k = 0; k < sides; k++) {
        const a0 = (k / sides) * Math.PI * 2;
        const a1 = ((k + 1) / sides) * Math.PI * 2;
        g.fillStyle = `hsl(195,85%,${45 + ((k * 37) % 40)}%)`;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a0) * r * 1.1, Math.sin(a0) * r * 1.1);
        g.lineTo(Math.cos(a1) * r * 1.1, Math.sin(a1) * r * 1.1);
        g.closePath();
        g.fill();
      }
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.beginPath();
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        if (k) g.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
        else g.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      }
      g.closePath();
      g.fill();
      g.restore();
      // Star sparkle.
      const tw = 0.6 + 0.4 * Math.sin(time * 10 + b.seed);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(x - r * 0.4, y - r * 0.4 - r * 0.7 * tw);
      g.lineTo(x - r * 0.3, y - r * 0.5);
      g.lineTo(x - r * 0.4 + r * 0.7 * tw, y - r * 0.4);
      g.lineTo(x - r * 0.3, y - r * 0.3);
      g.lineTo(x - r * 0.4, y - r * 0.4 + r * 0.7 * tw);
      g.lineTo(x - r * 0.5, y - r * 0.3);
      g.lineTo(x - r * 0.4 - r * 0.7 * tw, y - r * 0.4);
      g.lineTo(x - r * 0.5, y - r * 0.5);
      g.closePath();
      g.fill();
      break;
    }
    case "iron": {
      halo(g, x, y, r * 2.2, "rgba(255,200,90,ALPHA)", 0.3);
      g.save();
      g.translate(x, y);
      g.rotate(time * 25 + b.seed);
      const teeth = 12;
      g.fillStyle = "#c9ced8";
      g.beginPath();
      for (let k = 0; k < teeth; k++) {
        const a = (k / teeth) * Math.PI * 2;
        const a2 = a + Math.PI / teeth;
        g.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35);
        g.lineTo(Math.cos(a2) * r * 0.95, Math.sin(a2) * r * 0.95);
      }
      g.closePath();
      g.fill();
      const steel = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      steel.addColorStop(0, "#f0f2f6");
      steel.addColorStop(0.6, "#7d828d");
      steel.addColorStop(1, "#3a3d44");
      g.fillStyle = steel;
      disc(g, 0, 0, r * 0.95);
      g.fill();
      // Motion streaks on the disc and a hub bolt.
      g.strokeStyle = "rgba(255,255,255,0.45)";
      g.lineWidth = r * 0.1;
      g.beginPath();
      g.arc(0, 0, r * 0.65, 0, 1.4);
      g.moveTo(r * -0.65, 0);
      g.arc(0, 0, r * 0.65, Math.PI, Math.PI + 1.4);
      g.stroke();
      g.fillStyle = "#c62a1a";
      disc(g, 0, 0, r * 0.28);
      g.fill();
      g.restore();
      break;
    }
    case "judgment":
      halo(g, x, y, r * 3, "rgba(255,60,20,ALPHA)", 0.55);
      skull(g, b, true);
      break;
  }
}

const TRAILS: Record<Theme, TrailStyle> = {
  magma: { kind: "flame", inner: "rgba(255,220,120,ALPHA)", outer: "rgba(255,70,20,ALPHA)" },
  glass: { kind: "shard", inner: "", outer: "" },
  bone: { kind: "wisp", inner: "rgba(220,255,235,ALPHA)", outer: "rgba(120,255,190,ALPHA)" },
  argent: { kind: "ribbon", inner: "rgba(255,230,200,ALPHA)", outer: "rgba(255,60,20,ALPHA)" },
  stone: { kind: "spark", inner: "rgba(255,230,140,ALPHA)", outer: "rgba(255,120,40,ALPHA)" },
  velvet: { kind: "drip", inner: "", outer: "rgba(170,8,30,ALPHA)" },
  obsidian: { kind: "flame", inner: "rgba(220,255,150,ALPHA)", outer: "rgba(40,200,60,ALPHA)" },
  gem: { kind: "spark", inner: "rgba(255,255,255,ALPHA)", outer: "rgba(130,220,255,ALPHA)" },
  iron: { kind: "spark", inner: "rgba(255,240,170,ALPHA)", outer: "rgba(255,150,40,ALPHA)" },
  judgment: { kind: "flame", inner: "rgba(255,210,110,ALPHA)", outer: "rgba(220,20,10,ALPHA)" },
};

const FIRE_TRAIL: TrailStyle = { kind: "flame", inner: "rgba(255,230,140,ALPHA)", outer: "rgba(255,90,20,ALPHA)" };

function speedFx(g: G, b: BallLook) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const dx = b.vx / sp;
  const dy = b.vy / sp;
  const r = b.r;
  // Red afterimages strung out behind the ball.
  const n = b.trail.length;
  for (let k = 1; k <= 3; k++) {
    const t = b.trail[n - 1 - k * 3];
    if (!t) break;
    const a = 0.45 - k * 0.12;
    const gh = g.createRadialGradient(t.x, t.y, 0, t.x, t.y, r * 1.1);
    gh.addColorStop(0, `rgba(255,120,100,${a})`);
    gh.addColorStop(1, "rgba(255,30,20,0)");
    g.fillStyle = gh;
    disc(g, t.x, t.y, r * 1.1);
    g.fill();
  }
  // Speed lines.
  g.strokeStyle = "rgba(255,230,220,0.55)";
  g.lineWidth = Math.max(0.6, r * 0.12);
  g.lineCap = "round";
  for (const off of [-0.9, -0.35, 0.35, 0.9]) {
    const ox = b.x - dy * r * off;
    const oy = b.y + dx * r * off;
    const len = r * (3 + 1.5 * Math.abs(Math.sin(b.time * 30 + off * 7)));
    g.beginPath();
    g.moveTo(ox - dx * r * 1.2, oy - dy * r * 1.2);
    g.lineTo(ox - dx * (r * 1.2 + len), oy - dy * (r * 1.2 + len));
    g.stroke();
  }
  // Shock bow ahead of the ball.
  g.strokeStyle = "rgba(255,140,120,0.7)";
  g.lineWidth = Math.max(0.8, r * 0.18);
  const ang = Math.atan2(dy, dx);
  g.beginPath();
  g.arc(b.x, b.y, r * 1.45, ang - 1.1, ang + 1.1);
  g.stroke();
}

export function drawBall(g: G, theme: Theme, b: BallLook) {
  g.save();
  drawTrail(g, b, b.fire ? FIRE_TRAIL : TRAILS[theme]);
  if (b.fast) speedFx(g, b);
  body(g, theme, b);
  // Fireball power: flames wrap the ball, streaming away from its direction of travel.
  if (b.fire) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const bx = -b.vx / sp;
    const by = -b.vy / sp;
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * 0.45;
      const len = b.r * (2.4 + 0.8 * Math.sin(b.time * 18 + k * 1.9)) * (k === 2 ? 1.3 : 1);
      const ax = Math.cos(Math.atan2(by, bx) + off);
      const ay = Math.sin(Math.atan2(by, bx) + off);
      const fl = g.createRadialGradient(b.x, b.y, b.r * 0.6, b.x + ax * len, b.y + ay * len, b.r * 0.2);
      fl.addColorStop(0, "rgba(255,240,170,0.9)");
      fl.addColorStop(1, "rgba(255,80,20,0)");
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(b.x - ay * b.r * 0.7, b.y + ax * b.r * 0.7);
      g.quadraticCurveTo(b.x + ax * len * 0.6, b.y + ay * len * 0.6, b.x + ax * len, b.y + ay * len);
      g.quadraticCurveTo(b.x + ax * len * 0.6, b.y + ay * len * 0.6, b.x + ay * b.r * 0.7, b.y - ax * b.r * 0.7);
      g.closePath();
      g.fill();
    }
    halo(g, b.x, b.y, b.r * 2.4, "rgba(255,120,30,ALPHA)", 0.5);
  }
  g.restore();
}
