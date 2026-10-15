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

/**
 * Flagstone floor, tileable: colour map (bevelled worn stones, soot and old blood, chips, hairline
 * fractures), emissive map (lava seeping through some seams) and a normal map built from a height map.
 */
export function floorTextures(theme: FloorTheme, seed = 7) {
  const S = 1024;
  const r = rng(seed);
  const [c, g] = canvas(S);
  const [ec, eg] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = theme.grout;
  g.fillRect(0, 0, S, S);
  eg.fillStyle = "#000";
  eg.fillRect(0, 0, S, S);
  hg.fillStyle = "#000";
  hg.fillRect(0, 0, S, S);

  // Row heights and stone widths that sum exactly to S, so the layout wraps seamlessly.
  const fit = (min: number, span: number) => {
    const out: number[] = [];
    let sum = 0;
    while (sum < S - min * 0.5) {
      const v = min + r() * span;
      out.push(v);
      sum += v;
    }
    return out.map((v) => (v * S) / sum);
  };
  type Stone = { x: number; y: number; w: number; h: number };
  const stones: Stone[] = [];
  let y = 0;
  for (const rh of fit(100, 70)) {
    let x = r() * S;
    for (const w of fit(120, 130)) {
      stones.push({ x, y, w, h: rh });
      x += w;
    }
    y += rh;
  }
  // Draw a shape at its position and at its wrapped copies.
  const wrap = (s: Stone, f: (x: number, y: number) => void) => {
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const x = s.x % S + ox;
        const yy = s.y + oy;
        if (x + s.w < 0 || x > S || yy + s.h < 0 || yy > S) continue;
        f(x, yy);
      }
  };
  const [sr, sg, sb] = theme.stone;
  for (const s of stones) {
    const v = 0.72 + r() * 0.45;
    const warm = (r() - 0.5) * 10;
    const pad = 5 + r() * 3;
    const rad = 8 + r() * 10;
    const stain = r();
    const blots = Array.from({ length: 10 }, () => [r() * s.w, r() * s.h, 8 + r() * 30, 0.04 + r() * 0.1]);
    const chips = Array.from({ length: 3 }, () => [r() < 0.5 ? pad : s.w - pad, r() < 0.5 ? pad : s.h - pad, 6 + r() * 10]);
    const hBase = 150 + r() * 60;
    const fracture = r() < 0.3 ? Array.from({ length: 7 }, () => r()) : null;
    wrap(s, (x, yy) => {
      const ix = x + pad;
      const iy = yy + pad;
      const iw = s.w - pad * 2;
      const ih = s.h - pad * 2;
      // Colour.
      g.fillStyle = `rgb(${(sr * v + warm) | 0},${(sg * v) | 0},${(sb * v - warm * 0.5) | 0})`;
      roundRect(g, ix, iy, iw, ih, rad);
      g.fill();
      g.save();
      roundRect(g, ix, iy, iw, ih, rad);
      g.clip();
      for (const [bx, by, br, ba] of blots) {
        g.fillStyle = `rgba(0,0,0,${ba})`;
        g.beginPath();
        g.arc(x + bx, yy + by, br, 0, Math.PI * 2);
        g.fill();
      }
      if (stain < 0.18) {
        // Old blood or soot pooled on the stone.
        const grd = g.createRadialGradient(x + s.w * 0.5, yy + s.h * 0.5, 4, x + s.w * 0.5, yy + s.h * 0.5, Math.max(s.w, s.h) * 0.55);
        grd.addColorStop(0, stain < 0.09 ? "rgba(70,6,4,0.55)" : "rgba(8,4,3,0.5)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(x, yy, s.w, s.h);
      }
      // Bevel: lit top-left edge, shadowed bottom-right edge.
      g.lineWidth = 5;
      g.strokeStyle = "rgba(255,225,205,0.09)";
      roundRect(g, ix + 2, iy + 2, iw, ih, rad);
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.45)";
      roundRect(g, ix - 2, iy - 2, iw, ih, rad);
      g.stroke();
      g.restore();
      // Chipped corners.
      g.fillStyle = theme.grout;
      for (const [cx, cy, cr] of chips) {
        g.beginPath();
        g.moveTo(x + cx, yy + cy);
        g.lineTo(x + cx + (cx < s.w / 2 ? cr : -cr), yy + cy);
        g.lineTo(x + cx, yy + cy + (cy < s.h / 2 ? cr : -cr));
        g.fill();
      }
      // Height: raised stone with a soft bevelled edge.
      hg.fillStyle = `rgb(${hBase * 0.55 | 0},${hBase * 0.55 | 0},${hBase * 0.55 | 0})`;
      roundRect(hg, ix, iy, iw, ih, rad);
      hg.fill();
      hg.save();
      hg.shadowColor = `rgb(${hBase | 0},${hBase | 0},${hBase | 0})`;
      hg.shadowBlur = 10;
      hg.fillStyle = hg.shadowColor;
      roundRect(hg, ix + 7, iy + 7, iw - 14, ih - 14, rad);
      hg.fill();
      hg.restore();
      // Hairline fracture across some stones.
      if (fracture) {
        const pts: [number, number][] = [];
        let px = x + s.w * (0.2 + fracture[0] * 0.6);
        let py = yy + pad;
        let ang = Math.PI / 2 + (fracture[1] - 0.5);
        for (let i = 0; i < 9; i++) {
          pts.push([px, py]);
          ang += (fracture[(i + 2) % 7] - 0.5) * 0.9;
          px += Math.cos(ang) * (s.h / 9);
          py += Math.sin(ang) * (s.h / 9);
        }
        for (const [ctx, col, wdt] of [
          [g, "rgba(6,3,2,0.9)", 2],
          [hg, "rgba(0,0,0,1)", 3],
        ] as const) {
          ctx.strokeStyle = col;
          ctx.lineWidth = wdt;
          ctx.beginPath();
          pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
          ctx.stroke();
        }
        if (fracture[6] < 0.5) {
          eg.save();
          eg.strokeStyle = theme.glow;
          eg.globalAlpha = 0.55;
          eg.shadowColor = theme.glow;
          eg.shadowBlur = 6;
          eg.lineWidth = 2;
          eg.beginPath();
          pts.forEach(([a, b], i) => (i ? eg.lineTo(a, b) : eg.moveTo(a, b)));
          eg.stroke();
          eg.restore();
        }
      }
    });
  }
  // Lava seeping up through some of the seams between stones.
  for (const s of stones) {
    if (r() > 0.22) continue;
    const side = Math.floor(r() * 4);
    const from = 0.1 + r() * 0.3;
    const to = from + 0.3 + r() * 0.4;
    wrap(s, (x, yy) => {
      const seg: [number, number, number, number] =
        side === 0
          ? [x + s.w * from, yy, x + s.w * to, yy]
          : side === 1
            ? [x + s.w * from, yy + s.h, x + s.w * to, yy + s.h]
            : side === 2
              ? [x, yy + s.h * from, x, yy + s.h * to]
              : [x + s.w, yy + s.h * from, x + s.w, yy + s.h * to];
      for (const [col, wdt, blur, alpha] of [
        [theme.glow, 7, 14, 0.7],
        [theme.crack, 1.6, 0, 0.9],
      ] as const) {
        eg.save();
        eg.globalAlpha = alpha;
        eg.strokeStyle = col;
        eg.lineWidth = wdt;
        eg.lineCap = "round";
        eg.shadowColor = col;
        eg.shadowBlur = blur;
        eg.beginPath();
        eg.moveTo(seg[0], seg[1]);
        eg.lineTo(seg[2], seg[3]);
        eg.stroke();
        eg.restore();
      }
    });
  }
  // Fine grain on colour and height.
  const img = g.getImageData(0, 0, S, S);
  const himg = hg.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 20;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
    himg.data[i] += (r() - 0.5) * 14;
  }
  g.putImageData(img, 0, 0);
  // Normal map from the height map (wrapping at the edges).
  const [nc, ng] = canvas(S);
  const nimg = ng.createImageData(S, S);
  const hgt = (x: number, yy: number) => himg.data[(((yy + S) % S) * S + ((x + S) % S)) * 4] / 255;
  const strength = 3.2;
  for (let yy = 0; yy < S; yy++)
    for (let x = 0; x < S; x++) {
      const dx = (hgt(x - 1, yy) - hgt(x + 1, yy)) * strength;
      const dy = (hgt(x, yy - 1) - hgt(x, yy + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (yy * S + x) * 4;
      nimg.data[o] = ((dx / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  ng.putImageData(nimg, 0, 0);
  void hc;
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(ec);
  emissive.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(nc);
  for (const t of [map, emissive, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, emissive, normal };
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
export type IconKind = "fire" | "ice" | "lightning" | "shadow" | "blood" | "plague" | "relic" | "health" | "souls" | "move" | "boss" | "coins" | "ember" | "shop" | "fountain";

export const ICON_COLOR: Record<IconKind, string> = {
  fire: "#ff6a1a",
  ice: "#7fe3ff",
  lightning: "#ffe14a",
  shadow: "#b06bff",
  blood: "#ff2a46",
  plague: "#9be05a",
  relic: "#5dff9a",
  health: "#ff2a3a",
  souls: "#9ef0ff",
  move: "#ffffff",
  boss: "#ff2010",
  coins: "#ffd24a",
  ember: "#ff7a3a",
  shop: "#ffd24a",
  fountain: "#ff2a4a",
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
    case "blood": {
      // A falling drop with two fangs biting into it.
      g.beginPath();
      g.moveTo(0, -74);
      g.bezierCurveTo(34, -30, 56, 2, 56, 28);
      g.arc(0, 28, 56, 0, Math.PI);
      g.bezierCurveTo(-56, 2, -34, -30, 0, -74);
      g.fill();
      g.fillStyle = "#000";
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 30, 4);
        g.lineTo(sx * 12, 4);
        g.lineTo(sx * 20, 44);
        g.closePath();
        g.fill();
      }
      break;
    }
    case "plague": {
      // Plague doctor mask: round head, long beak, hollow eyes.
      g.beginPath();
      g.arc(-14, -14, 42, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(10, -26);
      g.quadraticCurveTo(70, -6, 78, 58);
      g.quadraticCurveTo(40, 30, 6, 24);
      g.closePath();
      g.fill();
      g.fillStyle = "#000";
      for (const [x, y] of [
        [-32, -22],
        [0, -24],
      ]) {
        g.beginPath();
        g.arc(x, y, 10, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
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
    case "coins":
      // A small stack of bone coins.
      for (const [x, y] of [
        [-26, 28],
        [22, 22],
        [-4, -8],
      ]) {
        g.beginPath();
        g.ellipse(x, y, 34, 30, 0, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.fillStyle = col;
        g.shadowBlur = 0;
        g.beginPath();
        g.ellipse(x, y, 12, 14, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      break;
    case "ember":
      // A burning heart.
      g.beginPath();
      g.moveTo(0, 62);
      g.bezierCurveTo(-70, 10, -60, -50, -22, -50);
      g.bezierCurveTo(-6, -50, 0, -36, 0, -26);
      g.bezierCurveTo(0, -36, 6, -50, 22, -50);
      g.bezierCurveTo(60, -50, 70, 10, 0, 62);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, 40);
      g.quadraticCurveTo(-22, 10, 0, -14);
      g.quadraticCurveTo(22, 10, 0, 40);
      g.fill();
      break;
    case "shop":
      // Merchant's skull with a coin in its jaw.
      g.beginPath();
      g.arc(0, -14, 50, Math.PI, 0);
      g.lineTo(36, 30);
      g.lineTo(-36, 30);
      g.closePath();
      g.fill();
      g.fillStyle = "#000";
      g.shadowBlur = 0;
      g.beginPath();
      g.ellipse(-18, -10, 12, 14, 0, 0, Math.PI * 2);
      g.ellipse(18, -10, 12, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(0, 52, 22, 0, Math.PI * 2);
      g.fill();
      break;
    case "fountain":
      // A blood fountain basin.
      g.beginPath();
      g.moveTo(-64, 10);
      g.lineTo(64, 10);
      g.quadraticCurveTo(54, 50, 0, 54);
      g.quadraticCurveTo(-54, 50, -64, 10);
      g.fill();
      g.fillRect(-10, 50, 20, 26);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, -70);
      g.bezierCurveTo(20, -40, 26, -24, 26, -14);
      g.arc(0, -14, 26, 0, Math.PI);
      g.bezierCurveTo(-26, -24, -20, -40, 0, -70);
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
