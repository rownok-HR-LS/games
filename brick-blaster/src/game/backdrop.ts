// Hellscape wallpaper: blood moon, gothic spires, jagged crags, a turning rune circle,
// molten glow and rising embers. Original artwork, drawn procedurally.
// The static scenery is pre-rendered once per size; only the sigil, glow and embers animate.

type Ember = { x: number; y: number; vy: number; sway: number; phase: number; size: number; life: number };

// Small seeded random so the skyline is the same on every redraw.
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export class Backdrop {
  private cache: HTMLCanvasElement | null = null;
  private key = "";
  private embers: Ember[] = [];
  private w: number;

  constructor(w: number) {
    this.w = w;
  }

  update(dt: number, h: number, reduced: boolean) {
    const target = reduced ? 25 : 70;
    while (this.embers.length < target) this.embers.push(this.spawn(h, true));
    for (const e of this.embers) {
      e.y -= e.vy * dt * (reduced ? 0.3 : 1);
      e.phase += dt * 1.6;
      e.life -= dt * 0.12;
    }
    this.embers = this.embers.map((e) => (e.y < -10 || e.life <= 0 ? this.spawn(h, false) : e));
  }

  private spawn(h: number, anywhere: boolean): Ember {
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * h : h + Math.random() * 40,
      vy: 25 + Math.random() * 70,
      sway: 6 + Math.random() * 18,
      phase: Math.random() * 6.28,
      size: 1 + Math.random() * 2.4,
      life: 0.6 + Math.random() * 0.4,
    };
  }

  draw(ctx: CanvasRenderingContext2D, h: number, scale: number, time: number, reduced: boolean) {
    const W = this.w;
    const key = `${h}:${scale}`;
    if (key !== this.key || !this.cache) {
      this.cache = this.paint(h, scale);
      this.key = key;
    }
    ctx.drawImage(this.cache, 0, 0, W, h);

    // Rune circle, slowly turning behind the play area.
    const cx = W / 2;
    const cy = h * 0.52;
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(reduced ? 0 : time * 0.06);
    ctx.globalAlpha = 0.1 + 0.06 * pulse;
    ctx.strokeStyle = "#ff3b1f";
    ctx.shadowColor = "#ff2a10";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    for (const r of [215, 190, 120]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Rune marks between the two outer rings.
    ctx.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      if (i % 3 === 0) {
        ctx.moveTo(195, -4);
        ctx.lineTo(210, 0);
        ctx.lineTo(195, 4);
      } else if (i % 3 === 1) {
        ctx.moveTo(194, 0);
        ctx.lineTo(211, 0);
        ctx.moveTo(202, -5);
        ctx.lineTo(202, 5);
      } else {
        ctx.moveTo(196, -3);
        ctx.lineTo(209, 3);
      }
      ctx.stroke();
      ctx.restore();
    }
    // Inner triangle and spokes.
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      const x = Math.cos(a) * 190;
      const y = Math.sin(a) * 190;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.rotate(-time * (reduced ? 0 : 0.14));
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
      ctx.lineTo(Math.cos(a) * 120, Math.sin(a) * 120);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Molten glow breathing up from below.
    const glow = ctx.createLinearGradient(0, h, 0, h * 0.62);
    glow.addColorStop(0, `rgba(255,90,20,${0.32 + 0.1 * pulse})`);
    glow.addColorStop(1, "rgba(255,60,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, h * 0.62, W, h * 0.38);

    // Embers.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const e of this.embers) {
      const flicker = 0.55 + 0.45 * Math.sin(e.phase * 3.1 + e.x);
      ctx.globalAlpha = Math.max(0, Math.min(1, e.life * 1.4)) * flicker;
      ctx.fillStyle = e.size > 2.6 ? "#ffd27a" : e.size > 1.8 ? "#ff9a3c" : "#ff5a1f";
      ctx.fillRect(e.x + Math.sin(e.phase) * e.sway, e.y, e.size, e.size);
    }
    ctx.restore();
  }

  /** Paints the static scenery to an offscreen canvas at device resolution. */
  private paint(h: number, scale: number) {
    const W = this.w;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(W * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext("2d")!;
    ctx.scale(scale, scale);
    const rnd = seeded(1337);

    // Sky: near-black at the top, blood red, then a burning horizon.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#050206");
    sky.addColorStop(0.35, "#1a0508");
    sky.addColorStop(0.7, "#3d0a0b");
    sky.addColorStop(0.9, "#6e1a0c");
    sky.addColorStop(1, "#a23410");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, h);

    // Blood moon with a wide halo.
    const mx = W * 0.83;
    const my = h * 0.5;
    const halo = ctx.createRadialGradient(mx, my, 40, mx, my, 300);
    halo.addColorStop(0, "rgba(255,50,30,0.35)");
    halo.addColorStop(1, "rgba(255,30,20,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, h);
    const disk = ctx.createRadialGradient(mx - 22, my - 22, 8, mx, my, 72);
    disk.addColorStop(0, "#ff7a55");
    disk.addColorStop(0.55, "#d0251a");
    disk.addColorStop(1, "#6d0a0c");
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(mx, my, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(60,0,0,0.35)";
    for (const [dx, dy, r] of [[-20, 12, 14], [18, -20, 9], [26, 22, 11], [-30, -24, 6], [4, 34, 7]]) {
      ctx.beginPath();
      ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drifting smoke bands.
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W;
      const y = h * (0.15 + rnd() * 0.55);
      const r = 80 + rnd() * 160;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rnd() < 0.5 ? "20,4,6" : "70,12,10"},${0.25 + rnd() * 0.2})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Far layer: gothic cathedral spires with a red rim light.
    const base = h * 0.84;
    ctx.fillStyle = "#1b0609";
    ctx.beginPath();
    ctx.moveTo(0, h);
    let x = -10;
    while (x < W + 10) {
      const bw = 26 + rnd() * 46;
      const top = base - (40 + rnd() * 120);
      const spire = 30 + rnd() * 90;
      ctx.lineTo(x, base - 10);
      ctx.lineTo(x, top);
      if (rnd() < 0.75) {
        // Pointed roof with a needle spire.
        ctx.lineTo(x + bw * 0.5 - 2, top - spire * 0.6);
        ctx.lineTo(x + bw * 0.5, top - spire);
        ctx.lineTo(x + bw * 0.5 + 2, top - spire * 0.6);
      } else {
        // Crenellated tower.
        for (let k = 0; k < 4; k++) {
          const s = x + (bw / 4) * k;
          ctx.lineTo(s, top - 8);
          ctx.lineTo(s + bw / 8, top - 8);
          ctx.lineTo(s + bw / 8, top);
        }
      }
      ctx.lineTo(x + bw, top);
      ctx.lineTo(x + bw, base - 10);
      x += bw + rnd() * 14;
    }
    ctx.lineTo(W, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,70,40,0.25)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Lit gothic windows.
    for (let i = 0; i < 26; i++) {
      const wx = rnd() * W;
      const wy = base - 20 - rnd() * 90;
      ctx.fillStyle = `rgba(255,${120 + Math.round(rnd() * 80)},40,${0.35 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(wx, wy + 8);
      ctx.lineTo(wx, wy + 2);
      ctx.lineTo(wx + 2, wy);
      ctx.lineTo(wx + 4, wy + 2);
      ctx.lineTo(wx + 4, wy + 8);
      ctx.fill();
    }

    // Near layer: jagged hell crags and bones of the earth.
    ctx.fillStyle = "#070203";
    ctx.beginPath();
    ctx.moveTo(0, h);
    x = 0;
    while (x <= W) {
      ctx.lineTo(x, h - 18 - rnd() * 34);
      x += 18 + rnd() * 26;
      if (rnd() < 0.18) {
        // A tall spike.
        ctx.lineTo(x - 4, h - 70 - rnd() * 60);
        x += 8;
      }
    }
    ctx.lineTo(W, h);
    ctx.closePath();
    ctx.fill();
    // Lava cracks glowing through the ground.
    ctx.strokeStyle = "rgba(255,110,30,0.75)";
    ctx.shadowColor = "#ff5a10";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      let lx = rnd() * W;
      let ly = h - 4;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      for (let k = 0; k < 4; k++) {
        lx += (rnd() - 0.5) * 30;
        ly -= 4 + rnd() * 6;
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Vignette keeps the edges dark so bricks and ball stay readable.
    const vig = ctx.createRadialGradient(W / 2, h / 2, Math.min(W, h) * 0.35, W / 2, h / 2, Math.max(W, h) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, h);
    return c;
  }
}
