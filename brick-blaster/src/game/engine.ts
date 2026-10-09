import { COLS, LEVELS } from "./levels";
import type { Sound } from "./sound";
import { Backdrop } from "./backdrop";
import { POWER_ICONS, type Tone } from "./icons";
import { TRACKS } from "./music";
import { BrickSkins, LEVEL_THEMES, SKIN_PAD } from "./brickskins";
import { drawPaddle } from "./paddle";
import { drawBall } from "./balls";
import { LEVEL_STYLES } from "./levelstyle";

// Logical playfield; the canvas scales it to fit.
export const W = 800;
export const H = 600;
export const MAX_H = 1440;
const PADDLE_H = 14;
const PADDLE_W = 110;
const BALL_R = 7;
const TOP = 64;
const SIDE = 28;
const GAP = 4;
const BRICK_H = 22;
const BRICK_W = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
const STEP = 1 / 120;
const MAX_BALLS = 12;

type BrickType = "normal" | "strong" | "metal" | "explosive" | "mystery";
type Brick = { x: number; y: number; w: number; h: number; type: BrickType; hp: number; maxHp: number; color: string; row: number; alive: boolean; flash: number; variant: number; flashColor: string };
type Ball = { x: number; y: number; vx: number; vy: number; stuck: boolean; offset: number; trail: { x: number; y: number }[] };
type Drop = { x: number; y: number; kind: PowerKind; spin: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "chip" | "ring" | "spark" | "ember" | "shard" | "burn" | "slice";
  /** Optional extras for the power-up effects. */
  w?: number;
  h?: number;
  rot?: number;
  vr?: number;
  grav?: number;
};
/** What hit a brick: decides the impact and destruction animation. */
type Cause = "ball" | "fire" | "fast" | "laser" | "blast";
type Popup = { x: number; y: number; text: string; life: number; color: string };

export type PowerKind = "expand" | "shrink" | "multi" | "fire" | "laser" | "catch" | "slow" | "fast" | "life" | "shield";
export type Phase = "title" | "ready" | "playing" | "paused" | "levelClear" | "gameOver" | "won";

export const POWERS: Record<PowerKind, { label: string; good: boolean; color: string; duration?: number; weight: number }> = {
  expand: { label: "Expand", good: true, color: "#3d7be0", duration: 20, weight: 14 },
  multi: { label: "Multi-ball", good: true, color: "#8b5cf6", weight: 14 },
  fire: { label: "Fireball", good: true, color: "#f2862f", duration: 10, weight: 8 },
  laser: { label: "Laser", good: true, color: "#e2508a", duration: 12, weight: 10 },
  catch: { label: "Catch", good: true, color: "#46b35e", duration: 15, weight: 10 },
  slow: { label: "Slow", good: true, color: "#2fb7c9", duration: 12, weight: 10 },
  life: { label: "Extra life", good: true, color: "#e8c43b", weight: 4 },
  shield: { label: "Shield", good: true, color: "#6da7ec", weight: 8 },
  shrink: { label: "Shrink", good: false, color: "#d63c3c", duration: 15, weight: 9 },
  fast: { label: "Fast ball", good: false, color: "#d63c3c", duration: 10, weight: 9 },
};

const PALETTE: Record<string, string> = { r: "#e5484d", o: "#f2862f", y: "#e8c43b", g: "#46b35e", c: "#2fb7c9", b: "#3d7be0", p: "#a35be0", w: "#d9d9de" };
const POINTS: Record<BrickType, number> = { normal: 50, strong: 120, metal: 0, explosive: 80, mystery: 100 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function mix(hex: string, to: number, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function randomPower(): PowerKind {
  const entries = Object.entries(POWERS) as [PowerKind, (typeof POWERS)[PowerKind]][];
  let r = Math.random() * entries.reduce((a, [, p]) => a + p.weight, 0);
  for (const [k, p] of entries) if ((r -= p.weight) <= 0) return k;
  return "expand";
}

export type Snapshot = {
  phase: Phase;
  score: number;
  lives: number;
  level: number;
  levelName: string;
  best: number;
  balls: number;
  timers: { kind: PowerKind; left: number; total: number }[];
  shield: boolean;
};

export class Game {
  phase: Phase = "title";
  level = 0;
  score = 0;
  lives = 3;
  best = 0;
  loop = 0;
  paddle = { x: W / 2, w: PADDLE_W, targetX: W / 2 };
  keys = { left: false, right: false };
  balls: Ball[] = [];
  bricks: Brick[] = [];
  drops: Drop[] = [];
  bolts: { x: number; y: number }[] = [];
  particles: Particle[] = [];
  popups: Popup[] = [];
  timers: Partial<Record<PowerKind, number>> = {};
  shield = false;
  shake = 0;
  banner = 0;
  clearTimer = 0;
  levelTime = 0;
  time = 0;
  laserCooldown = 0;
  reduced = false;
  onBest?: (score: number) => void;
  private acc = 0;
  private explosions: { brick: Brick; at: number }[] = [];
  /** Playfield height in logical units; taller than 600 on portrait phones. */
  h = H;
  /** Touch device: changes the on-canvas hint text. */
  touch = false;
  /** On-screen CSS pixels per logical unit; small screens get a bigger ball and text. */
  viewScale = 1;
  private backdrop = new Backdrop(W);
  private skins = new BrickSkins();
  /** Paddle burst when a power is gained (its colour) or lost (smoke grey). */
  private paddleFlash = 0;
  private paddleFlashColor = "#ffffff";
  private renderScale = 1;
  private icons: Partial<Record<PowerKind, { path: Path2D; tone: Tone }[]>> = {};

  private sound: Sound;

  get paddleY() {
    return this.h - 44;
  }

  /** Visual boost for text and pickups when the canvas is drawn small (phones). */
  private get boost() {
    return clamp(0.72 / this.viewScale, 1, 1.9);
  }

  /** Resize the playfield height (e.g. phone rotated); keeps balls in play. */
  setHeight(h: number) {
    if (h === this.h) return;
    this.h = h;
    for (const b of this.balls) {
      if (b.stuck) b.y = this.paddleY - BALL_R - 1;
      else if (b.y > this.paddleY - 30) {
        b.y = this.paddleY - 30;
        b.vy = -Math.abs(b.vy);
      }
    }
  }

  constructor(sound: Sound) {
    this.sound = sound;
    this.loadLevel(0);
    this.phase = "title";
  }

  snapshot(): Snapshot {
    return {
      phase: this.phase,
      score: this.score,
      lives: this.lives,
      level: this.level + 1,
      levelName: LEVELS[this.level].name,
      best: this.best,
      balls: this.balls.length,
      timers: (Object.keys(this.timers) as PowerKind[]).map((k) => ({ kind: k, left: this.timers[k]!, total: POWERS[k].duration ?? 1 })),
      shield: this.shield,
    };
  }

  // ── Flow ──────────────────────────────────────────────────────────────────────────
  newGame() {
    this.score = 0;
    this.lives = 3;
    this.loop = 0;
    this.loadLevel(0);
  }

  loadLevel(n: number) {
    this.level = n;
    this.bricks = [];
    LEVELS[n].rows.forEach((raw, row) => {
      const line = raw.padEnd(COLS, ".").slice(0, COLS);
      [...line].forEach((ch, col) => {
        if (ch === ".") return;
        const type: BrickType = ch === "M" ? "metal" : ch === "X" ? "explosive" : ch === "?" ? "mystery" : ch === "2" || ch === "3" ? "strong" : "normal";
        const hp = type === "strong" ? Number(ch) : 1;
        const color = type === "metal" ? "#a9adb8" : type === "explosive" ? "#e0452f" : type === "mystery" ? "#d6a72c" : type === "strong" ? (hp === 3 ? "#9aa3b8" : "#c3c8d4") : LEVEL_STYLES[n % LEVEL_STYLES.length].palette[ch] ?? PALETTE[ch] ?? "#d9d9de";
        this.bricks.push({ x: SIDE + col * (BRICK_W + GAP), y: TOP + row * (BRICK_H + GAP), w: BRICK_W, h: BRICK_H, type, hp, maxHp: hp, color, row, alive: true, flash: 0, flashColor: "255,255,255", variant: (col * 7 + row * 3) % 4 });
      });
    });
    this.resetRound();
    this.banner = 2.2;
    this.levelTime = 0;
  }

  private resetRound() {
    this.paddle.w = PADDLE_W;
    this.timers = {};
    this.drops = [];
    this.bolts = [];
    this.explosions = [];
    this.balls = [{ x: this.paddle.x, y: this.paddleY - BALL_R - 1, vx: 0, vy: 0, stuck: true, offset: 0, trail: [] }];
    this.phase = "ready";
  }

  /** Click / Space: start, launch, release a caught ball, or fire the laser. */
  action() {
    if (this.phase === "title" || this.phase === "gameOver" || this.phase === "won") {
      this.newGame();
      return;
    }
    if (this.phase === "paused") {
      this.phase = "playing";
      return;
    }
    if (this.phase === "ready") this.phase = "playing";
    if (this.phase !== "playing") return;
    const stuck = this.balls.filter((b) => b.stuck);
    if (stuck.length) {
      for (const b of stuck) this.release(b);
      return;
    }
    if (this.timers.laser && this.laserCooldown <= 0) {
      this.bolts.push({ x: this.paddle.x - this.paddle.w / 2 + 8, y: this.paddleY - 12 }, { x: this.paddle.x + this.paddle.w / 2 - 8, y: this.paddleY - 12 });
      this.laserCooldown = 0.2;
      this.sound.laser();
    }
  }

  /** Fire the laser only (touch hold auto-fire); never launches a ball. */
  fire() {
    if (this.phase === "playing" && this.timers.laser && this.laserCooldown <= 0 && !this.balls.some((b) => b.stuck)) this.action();
  }

  togglePause() {
    if (this.phase === "playing") this.phase = "paused";
    else if (this.phase === "paused") this.phase = "playing";
  }

  private speed() {
    const base = 360 + this.level * 14 + this.loop * 60;
    const ramp = 1 + Math.min(this.levelTime / 100, 0.3);
    // A taller (portrait) field means a longer trip, so the ball moves a little faster to keep the pace.
    const tall = (this.h / H) ** 0.6;
    return base * ramp * tall * (this.timers.slow ? 0.7 : 1) * (this.timers.fast ? 1.35 : 1);
  }

  private release(b: Ball) {
    const offset = clamp(b.offset / (this.paddle.w / 2), -1, 1);
    const angle = offset * 0.9 + (Math.random() - 0.5) * 0.2;
    const sp = this.speed();
    b.stuck = false;
    b.vx = sp * Math.sin(angle);
    b.vy = -sp * Math.cos(angle);
  }

  // ── Simulation ────────────────────────────────────────────────────────────────────
  update(dt: number) {
    this.time += dt;
    this.backdrop.update(dt, this.h, this.reduced);
    this.banner = Math.max(0, this.banner - dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.updateEffects(dt);
    if (this.phase === "levelClear") {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        if (this.level + 1 < LEVELS.length) this.loadLevel(this.level + 1);
        else {
          this.phase = "won";
          this.saveBest();
        }
      }
      return;
    }
    if (this.phase !== "playing" && this.phase !== "ready") return;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
  }

  private step(h: number) {
    const p = this.paddle;
    if (this.keys.left) p.targetX -= 720 * h;
    if (this.keys.right) p.targetX += 720 * h;
    const desired = PADDLE_W * (this.timers.expand ? 1.5 : 1) * (this.timers.shrink ? 0.62 : 1);
    p.w += (desired - p.w) * Math.min(1, h * 10);
    p.targetX = clamp(p.targetX, p.w / 2, W - p.w / 2);
    p.x = p.targetX;
    if (this.phase === "ready") {
      for (const b of this.balls) b.x = p.x + b.offset;
      return;
    }
    this.levelTime += h;
    this.laserCooldown -= h;

    for (const k of Object.keys(this.timers) as PowerKind[]) {
      this.timers[k]! -= h;
      if (this.timers[k]! <= 0) {
        delete this.timers[k];
        this.powerDown();
        if (k === "catch") this.balls.filter((b) => b.stuck).forEach((b) => this.release(b));
      }
    }

    const sp = this.speed();
    for (const ball of this.balls) {
      if (ball.stuck) {
        ball.x = p.x + ball.offset;
        ball.y = this.paddleY - BALL_R - 1;
        continue;
      }
      // Ease each ball towards the current target speed.
      const cur = Math.hypot(ball.vx, ball.vy) || sp;
      const k = (cur + (sp - cur) * Math.min(1, h * 2)) / cur;
      ball.vx *= k;
      ball.vy *= k;
      // Never let the ball travel almost horizontally forever.
      if (Math.abs(ball.vy) < sp * 0.25) ball.vy = Math.sign(ball.vy || -1) * sp * 0.25;
      this.moveBall(ball, h);
      if (this.timers.fire && Math.random() < (this.reduced ? 0.15 : 0.5)) this.ember(ball.x, ball.y);
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();
    }
    this.balls = this.balls.filter((b) => b.y - BALL_R < this.h + 20);
    if (!this.balls.length) {
      this.loseLife();
      return;
    }

    for (const d of this.drops) {
      d.y += 150 * h;
      d.spin += h * 4;
    }
    this.drops = this.drops.filter((d) => {
      const caught = d.y + 12 >= this.paddleY && d.y - 12 <= this.paddleY + PADDLE_H && Math.abs(d.x - p.x) < p.w / 2 + 20;
      if (caught) this.applyPower(d.kind, d.x);
      return !caught && d.y < this.h + 20;
    });

    for (const bolt of this.bolts) {
      bolt.y -= 900 * h;
      if (!this.reduced && Math.random() < 0.25)
        this.particles.push({ x: bolt.x + (Math.random() - 0.5) * 3, y: bolt.y + 10, vx: (Math.random() - 0.5) * 60, vy: 40, life: 0.25, max: 0.25, size: 1.6, color: "#ffb8e6", kind: "spark" });
    }
    this.bolts = this.bolts.filter((bolt) => {
      if (bolt.y < 0) return false;
      const hit = this.bricks.find((b) => b.alive && bolt.x >= b.x && bolt.x <= b.x + b.w && bolt.y >= b.y && bolt.y <= b.y + b.h);
      if (hit) {
        this.hitBrick(hit, "laser", bolt.x, bolt.y);
      }
      return !hit;
    });

    while (this.explosions.length && this.explosions[0].at <= this.levelTime) this.explode(this.explosions.shift()!.brick);

    if (!this.bricks.some((b) => b.alive && b.type !== "metal")) {
      const bonus = 1000 + this.lives * 250;
      this.score += bonus;
      this.popups.push({ x: W / 2, y: this.h / 2 + 40, text: `Level clear +${bonus}`, life: 2, color: "#e8c43b" });
      this.sound.level();
      this.phase = "levelClear";
      this.clearTimer = 2;
      if (this.level + 1 >= LEVELS.length) this.loop++;
    }
  }

  /** Moves a ball in small sub-steps so even fast balls never tunnel through a brick. */
  private moveBall(ball: Ball, h: number) {
    const dist = Math.hypot(ball.vx, ball.vy) * h;
    const n = Math.max(1, Math.ceil(dist / (BALL_R * 0.5)));
    const dt = h / n;
    const p = this.paddle;
    for (let i = 0; i < n; i++) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x < BALL_R) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx);
        this.sound.wall();
      } else if (ball.x > W - BALL_R) {
        ball.x = W - BALL_R;
        ball.vx = -Math.abs(ball.vx);
        this.sound.wall();
      }
      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
        this.sound.wall();
      }

      // Paddle: the further from the centre, the sharper the angle (up to ~60°).
      if (ball.vy > 0 && ball.y + BALL_R >= this.paddleY && ball.y - BALL_R <= this.paddleY + PADDLE_H && Math.abs(ball.x - p.x) <= p.w / 2 + BALL_R) {
        const offset = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
        const angle = offset * 1.05;
        const sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = sp * Math.sin(angle);
        ball.vy = -sp * Math.cos(angle);
        ball.y = this.paddleY - BALL_R;
        this.sound.paddle();
        if (this.timers.catch) {
          ball.stuck = true;
          ball.offset = ball.x - p.x;
          return;
        }
      }

      if (this.shield && ball.vy > 0 && ball.y + BALL_R >= this.h - 6) {
        ball.vy = -Math.abs(ball.vy);
        this.shield = false;
        for (let k = 0; k < 20; k++) this.spark(Math.random() * W, this.h - 6, "#6da7ec", 1);
        this.sound.metal();
      }

      for (const b of this.bricks) {
        if (!b.alive) continue;
        const cx = clamp(ball.x, b.x, b.x + b.w);
        const cy = clamp(ball.y, b.y, b.y + b.h);
        const dx = ball.x - cx;
        const dy = ball.y - cy;
        if (dx * dx + dy * dy >= BALL_R * BALL_R) continue;
        if (this.timers.fire && b.type !== "metal") {
          this.destroy(b, "fire", cx, cy);
          continue;
        }
        // Reflect on the axis of contact and push the ball out of the brick.
        if (Math.abs(dx) > Math.abs(dy)) {
          ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
          ball.x = cx + Math.sign(dx || 1) * BALL_R;
        } else {
          ball.vy = dy > 0 ? Math.abs(ball.vy) : dy < 0 ? -Math.abs(ball.vy) : -ball.vy;
          ball.y = cy + (dy !== 0 ? Math.sign(dy) : ball.vy > 0 ? 1 : -1) * BALL_R;
        }
        this.hitBrick(b, this.timers.fire ? "fire" : this.timers.fast ? "fast" : "ball", cx, cy);
        break;
      }
    }
  }

  private hitBrick(b: Brick, cause: Cause, hx: number, hy: number) {
    b.flash = 1;
    b.flashColor = cause === "laser" ? "255,120,210" : cause === "fire" ? "255,170,60" : cause === "fast" ? "255,90,70" : "255,255,255";
    if (b.type === "metal") {
      this.sound.metal();
      this.impactFx(cause, hx, hy, b);
      return;
    }
    b.hp--;
    if (b.hp > 0) {
      this.score += 10;
      this.sound.crack();
      this.chips(b, 3);
      this.impactFx(cause, hx, hy, b);
      return;
    }
    this.destroy(b, cause, hx, hy);
  }

  private destroy(b: Brick, cause: Cause = "ball", hx = b.x + b.w / 2, hy = b.y + b.h / 2) {
    if (!b.alive || b.type === "metal") return;
    b.alive = false;
    this.destroyFx(b, cause, hx, hy);
    const pts = POINTS[b.type] * (b.type === "strong" ? b.maxHp : 1);
    this.score += pts;
    this.popups.push({ x: b.x + b.w / 2, y: b.y, text: `+${pts}`, life: 0.8, color: "#ffffff" });
    if (cause === "ball" || cause === "blast") this.chips(b, this.reduced ? 4 : 12);
    this.sound.brick(b.row);
    if (b.type === "mystery" || Math.random() < 0.1) this.drops.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, kind: randomPower(), spin: 0 });
    if (b.type === "explosive") this.explosions.push({ brick: b, at: this.levelTime + 0.06 });
  }

  /** Blows up every neighbouring brick; neighbouring explosives chain after a short delay. */
  private explode(b: Brick) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    this.sound.explode();
    if (!this.reduced) this.shake = Math.max(this.shake, 9);
    this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 90, color: "#ffb347", kind: "ring" });
    for (let i = 0; i < (this.reduced ? 8 : 26); i++) this.spark(cx, cy, i % 2 ? "#ffd166" : "#ff6b3d", 1);
    for (const o of this.bricks) {
      if (!o.alive || o === b || o.type === "metal") continue;
      if (Math.abs(o.x + o.w / 2 - cx) <= BRICK_W * 1.2 && Math.abs(o.y + o.h / 2 - cy) <= BRICK_H * 1.6) {
        if (o.type === "explosive") {
          o.alive = false;
          this.score += POINTS.explosive;
          this.explosions.push({ brick: o, at: this.levelTime + 0.09 });
        } else this.destroy(o, "blast");
      }
    }
  }

  private powerDown() {
    this.paddleFlash = 0.8;
    this.paddleFlashColor = "#9a9aa6";
    for (let i = 0; i < (this.reduced ? 4 : 14); i++) {
      this.particles.push({
        x: this.paddle.x + (Math.random() - 0.5) * this.paddle.w,
        y: this.paddleY,
        vx: (Math.random() - 0.5) * 60,
        vy: -40 - Math.random() * 60,
        life: 0.7,
        max: 0.7,
        size: 3 + Math.random() * 3,
        color: "#6b6b75",
        kind: "spark",
      });
    }
  }

  private applyPower(kind: PowerKind, x: number) {
    const info = POWERS[kind];
    this.paddleFlash = 1;
    this.paddleFlashColor = info.good ? info.color : "#ff3a2a";
    this.sound.powerUp(info.good);
    this.popups.push({ x, y: this.paddleY - 24, text: info.label, life: 1.1, color: info.good ? info.color : "#ff7b7b" });
    this.score += 25;
    switch (kind) {
      case "expand":
        delete this.timers.shrink;
        break;
      case "shrink":
        delete this.timers.expand;
        break;
      case "slow":
        delete this.timers.fast;
        break;
      case "fast":
        delete this.timers.slow;
        break;
      case "life":
        this.lives = Math.min(9, this.lives + 1);
        return;
      case "shield":
        this.shield = true;
        return;
      case "multi": {
        const extra: Ball[] = [];
        for (const b of this.balls) {
          if (b.stuck) this.release(b);
          for (const turn of [-0.4, 0.4]) {
            if (this.balls.length + extra.length >= MAX_BALLS) break;
            const c = Math.cos(turn);
            const s = Math.sin(turn);
            extra.push({ x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c, stuck: false, offset: 0, trail: [] });
          }
        }
        this.balls.push(...extra);
        return;
      }
    }
    if (info.duration) this.timers[kind] = info.duration;
  }

  private loseLife() {
    this.lives--;
    this.sound.lose();
    if (!this.reduced) this.shake = 12;
    if (this.lives <= 0) {
      this.phase = "gameOver";
      this.saveBest();
      return;
    }
    this.shield = false;
    this.resetRound();
  }

  private saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      this.onBest?.(this.score);
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────────────
  private chips(b: Brick, count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: b.x + Math.random() * b.w,
        y: b.y + Math.random() * b.h,
        vx: (Math.random() - 0.5) * 260,
        vy: (Math.random() - 0.8) * 220,
        life: 0.7,
        max: 0.7,
        size: 2 + Math.random() * 4,
        color: b.color,
        kind: "chip",
      });
    }
  }

  private ember(x: number, y: number) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 50,
      vy: -30 - Math.random() * 60,
      life: 0.6,
      max: 0.6,
      size: 1.4 + Math.random() * 2,
      color: Math.random() < 0.5 ? "#ffd27a" : "#ff7a2a",
      kind: "ember",
      grav: -40,
    });
  }

  /** A hit that doesn't destroy the brick (strong or metal). */
  private impactFx(cause: Cause, x: number, y: number, b: Brick) {
    const n = this.reduced ? 0.4 : 1;
    if (cause === "fire") {
      for (let i = 0; i < 10 * n; i++) this.ember(x, y);
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 26, color: "#ff8a2a", kind: "ring" });
    } else if (cause === "laser") {
      this.spark(x, y, "#ff9ad5", Math.ceil(8 * n));
      this.spark(x, y, "#ffffff", Math.ceil(3 * n));
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, size: 14, color: "#ff5ab8", kind: "ring" });
    } else if (cause === "fast") {
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 44, color: "#ffd0c0", kind: "ring" });
      this.spark(x, y, "#ffffff", Math.ceil(6 * n));
      if (!this.reduced) this.shake = Math.max(this.shake, 3);
    } else if (b.type === "metal") this.spark(x, y, "#e8ecf4", Math.ceil(4 * n));
  }

  /** The brick's death animation, by what killed it. */
  private destroyFx(b: Brick, cause: Cause, x: number, y: number) {
    const n = this.reduced ? 0.4 : 1;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (cause === "fire") {
      // Burns away: a white-hot ghost of the brick rising into embers.
      this.particles.push({ x: cx, y: cy, vx: 0, vy: -25, life: 0.5, max: 0.5, size: 0, color: b.color, kind: "burn", w: b.w, h: b.h });
      for (let i = 0; i < 16 * n; i++) this.ember(b.x + Math.random() * b.w, b.y + Math.random() * b.h);
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 40, color: "#ffb347", kind: "ring" });
    } else if (cause === "laser") {
      // Sliced into strips that slide apart with glowing cut edges.
      const strips = 4;
      for (let i = 0; i < strips; i++) {
        const dir = i % 2 ? 1 : -1;
        this.particles.push({
          x: cx,
          y: b.y + (b.h / strips) * (i + 0.5),
          vx: dir * (90 + Math.random() * 60),
          vy: (Math.random() - 0.5) * 20,
          life: 0.45,
          max: 0.45,
          size: 0,
          color: b.color,
          kind: "slice",
          w: b.w,
          h: b.h / strips - 0.6,
        });
      }
      this.spark(x, y, "#ff9ad5", Math.ceil(10 * n));
    } else if (cause === "fast") {
      // Shatters into spinning shards punched onward through the brick, away from the hit.
      const len = Math.hypot(cx - x, cy - y);
      const dx = len > 0.01 ? (cx - x) / len : 0;
      const dy = len > 0.01 ? (cy - y) / len : -1;
      for (let i = 0; i < 9 * n; i++) {
        const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
        const v = 220 + Math.random() * 300;
        this.particles.push({
          x: b.x + Math.random() * b.w,
          y: b.y + Math.random() * b.h,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.7,
          max: 0.7,
          size: 4 + Math.random() * 6,
          color: b.color,
          kind: "shard",
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 24,
          grav: 600,
        });
      }
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 60, color: "#ffffff", kind: "ring" });
      if (!this.reduced) this.shake = Math.max(this.shake, 5);
    }
  }

  private spark(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 320;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, size: 2.5, color, kind: "spark" });
    }
  }

  private updateEffects(dt: number) {
    this.paddleFlash = Math.max(0, this.paddleFlash - dt * 2.2);
    for (const b of this.bricks) b.flash = Math.max(0, b.flash - dt * 6);
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.grav !== undefined) q.vy += q.grav * dt;
      else if (q.kind === "chip") q.vy += 700 * dt;
      else q.vx *= 0.96;
      if (q.vr) q.rot = (q.rot ?? 0) + q.vr * dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const t of this.popups) {
      t.life -= dt;
      t.y -= 40 * dt;
    }
    this.popups = this.popups.filter((t) => t.life > 0);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────────
  render(ctx: CanvasRenderingContext2D, scale: number) {
    this.renderScale = scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.backdrop.draw(ctx, this.h, scale, this.time, this.reduced, LEVEL_STYLES[this.level % LEVEL_STYLES.length]);

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    for (const b of this.bricks) if (b.alive) this.drawBrick(ctx, b);

    if (this.shield) {
      ctx.fillStyle = "rgba(109,167,236,0.35)";
      ctx.fillRect(0, this.h - 8, W, 4);
      ctx.fillStyle = "#9cc6f5";
      ctx.fillRect(0, this.h - 7, W, 1.5);
    }

    for (const d of this.drops) this.drawDrop(ctx, d);

    for (const bolt of this.bolts) {
      const beam = ctx.createLinearGradient(0, bolt.y, 0, bolt.y + 34);
      beam.addColorStop(0, "rgba(255,120,210,0.9)");
      beam.addColorStop(1, "rgba(255,60,170,0)");
      ctx.strokeStyle = beam;
      ctx.lineCap = "round";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(bolt.x, bolt.y);
      ctx.lineTo(bolt.x, bolt.y + 34);
      ctx.stroke();
      ctx.strokeStyle = "#ffe6f5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bolt.x, bolt.y);
      ctx.lineTo(bolt.x, bolt.y + 18);
      ctx.stroke();
      const head = ctx.createRadialGradient(bolt.x, bolt.y, 0, bolt.x, bolt.y, 7);
      head.addColorStop(0, "rgba(255,255,255,1)");
      head.addColorStop(1, "rgba(255,90,190,0)");
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawPaddle(ctx);
    this.balls.forEach((ball, i) => this.drawBall(ctx, ball, i));

    for (const q of this.particles) {
      const a = q.life / q.max;
      if (q.kind === "ring") {
        ctx.strokeStyle = q.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 6 * a;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (1 - a) + 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (q.kind === "burn") {
        // White-hot ghost of the brick, cooling to red as it rises and shrinks.
        const k = 1 - a;
        const w = q.w! * (1 - k * 0.35);
        const h = q.h! * (1 - k * 0.6);
        const hot = ctx.createLinearGradient(0, q.y - h / 2, 0, q.y + h / 2);
        hot.addColorStop(0, `rgba(255,250,220,${a})`);
        hot.addColorStop(0.5, `rgba(255,170,60,${a})`);
        hot.addColorStop(1, `rgba(200,40,10,${a * 0.6})`);
        ctx.fillStyle = hot;
        ctx.beginPath();
        ctx.roundRect(q.x - w / 2, q.y - h / 2, w, h, 3);
        ctx.fill();
      } else if (q.kind === "slice") {
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.w! / 2, q.y - q.h! / 2, q.w!, q.h!);
        ctx.fillStyle = "#ffd6f0";
        ctx.fillRect(q.x - q.w! / 2, q.y - q.h! / 2, q.w!, 0.8);
        ctx.fillRect(q.x - q.w! / 2, q.y + q.h! / 2 - 0.8, q.w!, 0.8);
      } else if (q.kind === "shard") {
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot ?? 0);
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.moveTo(0, -q.size * 0.6);
        ctx.lineTo(q.size * 0.55, q.size * 0.45);
        ctx.lineTo(-q.size * 0.5, q.size * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.restore();
      } else if (q.kind === "ember") {
        ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(this.time * 30 + q.x));
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.textAlign = "center";
    for (const t of this.popups) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = `700 ${15 * this.boost}px system-ui, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    if (this.banner > 0 && this.phase !== "title") {
      ctx.globalAlpha = Math.min(1, this.banner);
      ctx.font = `800 ${44 * Math.min(this.boost, 1.5)}px system-ui, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ff3b1f";
      ctx.shadowBlur = 20;
      ctx.fillText(`LEVEL ${this.level + 1}`, W / 2, this.h / 2 + 20);
      ctx.shadowBlur = 0;
      ctx.font = `600 ${18 * this.boost}px system-ui, sans-serif`;
      ctx.fillStyle = "#ffb199";
      ctx.fillText(LEVELS[this.level].name, W / 2, this.h / 2 + 20 + 30 * this.boost);
      ctx.font = `italic 500 ${14 * this.boost}px system-ui, sans-serif`;
      ctx.fillStyle = "#ff9a7a";
      ctx.fillText(`♪ ${TRACKS[this.level % TRACKS.length].name}`, W / 2, this.h / 2 + 20 + 56 * this.boost);
      ctx.globalAlpha = 1;
    }
    if (this.phase === "ready" && this.banner <= 0.6) {
      ctx.font = `600 ${15 * this.boost}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(this.time * 4)})`;
      ctx.fillText(this.touch ? "Tap to launch" : "Click or press Space to launch", W / 2, this.paddleY - 40);
    }
  }

  private drawBrick(ctx: CanvasRenderingContext2D, b: Brick) {
    // Level material (cached per theme/type/colour), matched to the level's soundtrack.
    const theme = LEVEL_THEMES[this.level % LEVEL_THEMES.length];
    const img = this.skins.get(theme, b.type, b.color, b.variant, b.w, b.h, this.renderScale);
    ctx.drawImage(img, b.x - SKIN_PAD, b.y - SKIN_PAD, b.w + SKIN_PAD * 2, b.h + SKIN_PAD * 2);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    // Damage: cracks spread as a strong brick weakens.
    if (b.type === "strong" && b.hp < b.maxHp) {
      ctx.strokeStyle = "rgba(10,6,6,0.85)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.3, b.y + 1);
      ctx.lineTo(b.x + b.w * 0.42, b.y + b.h * 0.55);
      ctx.lineTo(b.x + b.w * 0.36, b.y + b.h - 1);
      ctx.moveTo(b.x + b.w * 0.42, b.y + b.h * 0.55);
      ctx.lineTo(b.x + b.w * 0.55, b.y + b.h * 0.7);
      if (b.maxHp - b.hp > 1) {
        ctx.moveTo(b.x + b.w * 0.42, b.y + b.h * 0.55);
        ctx.lineTo(b.x + b.w * 0.7, b.y + b.h * 0.4);
        ctx.lineTo(b.x + b.w * 0.82, b.y + 1);
        ctx.moveTo(b.x + b.w * 0.7, b.y + b.h * 0.4);
        ctx.lineTo(b.x + b.w * 0.74, b.y + b.h - 1);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Explosive: pulsing molten core.
    if (b.type === "explosive") {
      const p = 0.5 + 0.5 * Math.sin(this.time * 6 + b.x * 0.05);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 7);
      core.addColorStop(0, "#fff3c4");
      core.addColorStop(0.45, `rgba(255,150,40,${0.75 + 0.25 * p})`);
      core.addColorStop(1, "rgba(200,30,10,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + p * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,190,80,${0.25 + 0.35 * p})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 3);
      ctx.stroke();
    }

    // Mystery: glowing gold sigil.
    if (b.type === "mystery") {
      const p = 0.5 + 0.5 * Math.sin(this.time * 4 + b.x * 0.03);
      ctx.save();
      ctx.shadowColor = "#ffcf5a";
      ctx.shadowBlur = 6 + p * 6;
      ctx.font = "900 13px Georgia, 'Times New Roman', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(255,226,140,${0.8 + 0.2 * p})`;
      ctx.fillText("?", cx, cy + 0.5);
      ctx.restore();
    }

    if (b.flash > 0) {
      ctx.fillStyle = `rgba(${b.flashColor},${b.flash * 0.6})`;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();
    }
  }


  private drawDrop(ctx: CanvasRenderingContext2D, d: Drop) {
    const info = POWERS[d.kind];
    const w = 48 * this.boost;
    const h = 24 * this.boost;
    const g = ctx.createLinearGradient(0, d.y - h / 2, 0, d.y + h / 2);
    g.addColorStop(0, mix(info.color, 255, 0.5));
    g.addColorStop(0.5, info.color);
    g.addColorStop(1, mix(info.color, 0, 0.4));
    ctx.fillStyle = g;
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(d.x - w / 2, d.y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Glossy capsule: dark rim plus a bright highlight band across the top.
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(d.x - w / 2 + h * 0.3, d.y - h / 2 + 2, w - h * 0.6, h * 0.28, h * 0.14);
    ctx.fill();

    // Layered icon (shared 24×24 paths) with a soft drop shadow so it reads on any colour.
    const layers = (this.icons[d.kind] ??= POWER_ICONS[d.kind].map((l) => ({ path: new Path2D(l.d), tone: l.tone })));
    const size = 20 * this.boost;
    ctx.save();
    ctx.translate(d.x - size / 2, d.y - size / 2);
    ctx.scale(size / 24, size / 24);
    for (const l of layers) {
      ctx.shadowColor = l.tone === "main" ? "rgba(0,0,0,0.55)" : "transparent";
      ctx.shadowBlur = l.tone === "main" ? 3 : 0;
      ctx.fillStyle = l.tone === "main" ? "#ffffff" : l.tone === "soft" ? "rgba(255,255,255,0.6)" : mix(info.color, 0, 0.35);
      ctx.fill(l.path, "evenodd");
    }
    ctx.restore();
  }

  private drawPaddle(ctx: CanvasRenderingContext2D) {
    const p = this.paddle;
    drawPaddle(ctx, {
      x: p.x,
      y: this.paddleY,
      w: p.w,
      h: PADDLE_H,
      time: this.time,
      timers: this.timers,
      flash: this.paddleFlash,
      flashColor: this.paddleFlashColor,
      muzzle: Math.max(0, (this.laserCooldown - 0.1) / 0.1),
      shield: this.shield,
      reduced: this.reduced,
    });
  }


  private drawBall(ctx: CanvasRenderingContext2D, ball: Ball, i: number) {
    // Themed per level (see balls.ts); slightly larger than the physics radius so details read,
    // and larger again on small screens so it stays easy to track.
    drawBall(ctx, LEVEL_THEMES[this.level % LEVEL_THEMES.length], {
      x: ball.x,
      y: ball.y,
      vx: ball.vx,
      vy: ball.vy,
      r: BALL_R * 1.2 * Math.min(this.boost, 1.4),
      trail: ball.trail,
      time: this.time,
      fire: Boolean(this.timers.fire),
      fast: Boolean(this.timers.fast),
      reduced: this.reduced,
      seed: i * 1.37,
    });
  }

}
