// Procedural canvas textures: flagstone floors with lava cracks, wall masonry, blood splats
// and the glowing reward icons that float above doors. No image files.
import * as THREE from "three";

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export type FloorTheme = { stone: [number, number, number]; grout: string; crack: string; glow: string };

/** Flagstone floor: returns colour map + emissive map (glowing cracks), both tileable. */
export function floorTextures(theme: FloorTheme, seed = 7) {
  const S = 1024;
  const r = rng(seed);
  const [c, g] = canvas(S);
  const [ec, eg] = canvas(S);
  g.fillStyle = theme.grout;
  g.fillRect(0, 0, S, S);
  eg.fillStyle = "#000";
  eg.fillRect(0, 0, S, S);
  // Rows of irregular stones.
  let y = 0;
  while (y < S) {
    const rh = 90 + Math.floor(r() * 70);
    const h = Math.min(rh, S - y);
    let x = -Math.floor(r() * 80);
    while (x < S) {
      const w = 110 + Math.floor(r() * 120);
      const [sr, sg, sb] = theme.stone;
      const v = 0.75 + r() * 0.5;
      g.fillStyle = `rgb(${sr * v | 0},${sg * v | 0},${sb * v | 0})`;
      const pad = 4 + r() * 3;
      roundRect(g, x + pad, y + pad, w - pad * 2, h - pad * 2, 10);
      g.fill();
      // Wear: darker blotches and light scratches.
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
        g.beginPath();
        g.arc(x + r() * w, y + r() * h, 6 + r() * 26, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "rgba(255,230,210,0.05)";
      g.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        const sx = x + r() * w;
        const sy = y + r() * h;
        g.moveTo(sx, sy);
        g.lineTo(sx + (r() - 0.5) * 60, sy + (r() - 0.5) * 30);
        g.stroke();
      }
      x += w;
    }
    y += rh;
  }
  // Speckle noise.
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Glowing cracks (jagged walks), drawn into both maps.
  for (let k = 0; k < 4; k++) {
    let px = r() * S;
    let py = r() * S;
    let ang = r() * Math.PI * 2;
    const len = 18 + Math.floor(r() * 30);
    const pts: [number, number][] = [[px, py]];
    for (let i = 0; i < len; i++) {
      ang += (r() - 0.5) * 1.1;
      px += Math.cos(ang) * 14;
      py += Math.sin(ang) * 14;
      pts.push([px, py]);
    }
    for (const [ctx, col, wdt, blur] of [
      [g, "#120806", 4, 0],
      [eg, theme.glow, 5, 8],
      [eg, theme.crack, 1.5, 0],
    ] as const) {
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = wdt;
      ctx.lineJoin = "round";
      ctx.shadowColor = col;
      ctx.shadowBlur = blur;
      ctx.beginPath();
      // Draw wrapped copies so the texture tiles.
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
          for (const p of pts) ctx.lineTo(p[0] + ox, p[1] + oy);
        }
      ctx.stroke();
      ctx.restore();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(ec);
  emissive.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, emissive]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, emissive };
}

/** Large dark masonry blocks for walls and pillars. */
export function wallTexture(tint: [number, number, number], seed = 3) {
  const S = 512;
  const r = rng(seed);
  const [c, g] = canvas(S);
  g.fillStyle = "#0b0807";
  g.fillRect(0, 0, S, S);
  const rows = 6;
  const rh = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -rh * 0.7 : 0;
    while (x < S) {
      const w = rh * (1.3 + r() * 0.9);
      const v = 0.7 + r() * 0.5;
      g.fillStyle = `rgb(${tint[0] * v | 0},${tint[1] * v | 0},${tint[2] * v | 0})`;
      roundRect(g, x + 3, row * rh + 3, w - 6, rh - 6, 4);
      g.fill();
      const grd = g.createLinearGradient(0, row * rh, 0, row * rh + rh);
      grd.addColorStop(0, "rgba(255,255,255,0.06)");
      grd.addColorStop(1, "rgba(0,0,0,0.35)");
      g.fillStyle = grd;
      roundRect(g, x + 3, row * rh + 3, w - 6, rh - 6, 4);
      g.fill();
      x += w;
    }
  }
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Soot streaks from the top.
  for (let i = 0; i < 18; i++) {
    const x = r() * S;
    const grd = g.createLinearGradient(0, 0, 0, S * (0.3 + r() * 0.5));
    grd.addColorStop(0, "rgba(0,0,0,0.5)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 6 + r() * 20, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let splat: THREE.Texture | null = null;
/** White irregular splat (tinted per decal instance). */
export function splatTexture() {
  if (splat) return splat;
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(99);
  g.fillStyle = "#fff";
  const blob = (x: number, y: number, rad: number) => {
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (0.75 + r() * 0.45);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  };
  blob(S / 2, S / 2, S * 0.24);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const d = S * (0.18 + r() * 0.28);
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.015 + r() * 0.05));
  }
  splat = new THREE.CanvasTexture(c);
  return splat;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}

// ── Reward icons ──────────────────────────────────────────────────────────────────────
export type IconKind = "fire" | "ice" | "lightning" | "shadow" | "relic" | "health" | "souls" | "move" | "boss";

export const ICON_COLOR: Record<IconKind, string> = {
  fire: "#ff6a1a",
  ice: "#7fe3ff",
  lightning: "#ffe14a",
  shadow: "#b06bff",
  relic: "#5dff9a",
  health: "#ff2a3a",
  souls: "#9ef0ff",
  move: "#ffffff",
  boss: "#ff2010",
};

const iconCache = new Map<IconKind, HTMLCanvasElement>();

/** Draws an icon onto a canvas (also used by the HUD and reward cards). */
export function iconCanvas(kind: IconKind) {
  const hit = iconCache.get(kind);
  if (hit) return hit;
  const S = 256;
  const [c, g] = canvas(S);
  const col = ICON_COLOR[kind];
  g.translate(S / 2, S / 2);
  // Halo.
  const grd = g.createRadialGradient(0, 0, 10, 0, 0, S / 2);
  grd.addColorStop(0, col + "aa");
  grd.addColorStop(0.45, col + "33");
  grd.addColorStop(1, col + "00");
  g.fillStyle = grd;
  g.fillRect(-S / 2, -S / 2, S, S);
  g.shadowColor = col;
  g.shadowBlur = 18;
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineWidth = 8;
  g.lineCap = "round";
  g.lineJoin = "round";
  const P = (pts: number[][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  switch (kind) {
    case "fire":
      g.beginPath();
      g.moveTo(0, -70);
      g.bezierCurveTo(40, -20, 55, 10, 40, 45);
      g.bezierCurveTo(28, 70, -28, 70, -40, 45);
      g.bezierCurveTo(-55, 10, -20, -10, -10, -40);
      g.bezierCurveTo(0, -20, 10, -30, 0, -70);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(0, 35, 16, 26, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "ice":
      for (let i = 0; i < 6; i++) {
        g.save();
        g.rotate((i * Math.PI) / 3);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -72);
        g.moveTo(0, -40);
        g.lineTo(-18, -58);
        g.moveTo(0, -40);
        g.lineTo(18, -58);
        g.stroke();
        g.restore();
      }
      break;
    case "lightning":
      P([
        [12, -78],
        [-36, 8],
        [-4, 8],
        [-16, 78],
        [38, -14],
        [6, -14],
      ]);
      g.fill();
      break;
    case "shadow":
      g.beginPath();
      g.ellipse(0, 0, 70, 38, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#000";
      g.beginPath();
      g.ellipse(0, 0, 14, 34, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "relic":
      // Cursed chalice.
      g.beginPath();
      g.moveTo(-50, -60);
      g.lineTo(50, -60);
      g.quadraticCurveTo(50, 0, 8, 10);
      g.lineTo(8, 45);
      g.lineTo(34, 62);
      g.lineTo(-34, 62);
      g.lineTo(-8, 45);
      g.lineTo(-8, 10);
      g.quadraticCurveTo(-50, 0, -50, -60);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(0, -30, 13, 0, Math.PI * 2);
      g.fill();
      break;
    case "health":
      g.beginPath();
      g.moveTo(0, -72);
      g.bezierCurveTo(30, -30, 52, 0, 52, 26);
      g.arc(0, 26, 52, 0, Math.PI);
      g.bezierCurveTo(-52, 0, -30, -30, 0, -72);
      g.fill();
      break;
    case "souls":
      for (const [x, y, rr] of [
        [0, 6, 46],
        [-30, -40, 16],
        [34, -46, 12],
      ]) {
        g.beginPath();
        g.arc(x, y, rr, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = col;
      g.beginPath();
      g.arc(-14, 0, 8, 0, Math.PI * 2);
      g.arc(14, 0, 8, 0, Math.PI * 2);
      g.fill();
      break;
    case "move":
      // Crossed katana and revolver silhouette.
      g.save();
      g.rotate(-Math.PI / 4);
      g.fillRect(-6, -84, 12, 120);
      g.fillRect(-22, 36, 44, 8);
      g.fillRect(-5, 44, 10, 34);
      g.restore();
      g.save();
      g.rotate(Math.PI / 4);
      g.fillRect(-10, -60, 20, 70);
      g.beginPath();
      g.arc(0, 18, 18, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-12, 28, 24, 46);
      g.restore();
      break;
    case "boss":
      // Horned skull.
      g.beginPath();
      g.arc(0, -6, 48, Math.PI, 0);
      g.lineTo(40, 34);
      g.lineTo(-40, 34);
      g.closePath();
      g.fill();
      g.fillRect(-26, 30, 52, 26);
      g.beginPath();
      g.moveTo(-40, -30);
      g.quadraticCurveTo(-90, -50, -78, -96);
      g.quadraticCurveTo(-64, -60, -26, -50);
      g.moveTo(40, -30);
      g.quadraticCurveTo(90, -50, 78, -96);
      g.quadraticCurveTo(64, -60, 26, -50);
      g.fill();
      g.fillStyle = "#000";
      g.shadowBlur = 0;
      g.beginPath();
      g.ellipse(-18, 0, 13, 15, 0, 0, Math.PI * 2);
      g.ellipse(18, 0, 13, 15, 0, 0, Math.PI * 2);
      g.fill();
      break;
  }
  iconCache.set(kind, c);
  return c;
}

export function iconTexture(kind: IconKind) {
  const t = new THREE.CanvasTexture(iconCanvas(kind));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial glow (sprites, light pools). */
export function glowTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
