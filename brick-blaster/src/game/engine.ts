import { COLS } from "./levels";
import type { Sound } from "./sound";
import { Backdrop } from "./backdrop";
import { POWER_ICONS, type Tone } from "./icons";
import { TRACKS } from "./music";
import { BrickSkins, LEVEL_THEMES, SKIN_PAD } from "./brickskins";
import { drawPaddle } from "./paddle";
import { drawBall } from "./balls";
import { LEVEL_STYLES } from "./levelstyle";
import { RANKS, StyleMeter, type StyleEvent } from "./style";
import { BOSSES, CAMPAIGN, WORLDS, runStage, type BossSpec, type Stage } from "./stages";
import { drawBoss } from "./boss";
import { BASE_MODS, computeMods, rollChoices, type Mods, type Upgrade } from "./upgrades";
import { seeded } from "./levelgen";

// Logical playfield; the canvas scales it to fit.
export const W = 800;
export const H = 600;
export const MAX_H = 1440;
const PADDLE_H = 14;
const PADDLE_W = 110;
const BALL_R = 7;
const GIANT_R = 11;
const TOP = 64;
const SIDE = 28;
const GAP = 4;
const BRICK_H = 22;
const BRICK_W = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
const STEP = 1 / 120;
const MAX_BALLS = 12;

type BrickType = "normal" | "strong" | "metal" | "explosive" | "mystery" | "regen" | "shooter" | "portal";
type Brick = {
  x: number;
  y: number;
  w: number;
  h: number;
  type: BrickType;
  hp: number;
  maxHp: number;
  color: string;
  row: number;
  alive: boolean;
  flash: number;
  variant: number;
  flashColor: string;
  /** Sliding row. */
  move?: { x0: number; amp: number; speed: number; phase: number };
  /** Boss shield ring: orbits the boss. */
  orbit?: { a: number; r: number; speed: number };
  /** Regenerating brick: seconds until it grows back (it does so once). */
  regrow?: number;
  regrown?: boolean;
  /** Shooter: seconds until the next shot. */
  cool?: number;
  /** Portal partner. */
  pair?: Brick;
};
type Ball = { x: number; y: number; vx: number; vy: number; stuck: boolean; offset: number; trail: { x: number; y: number }[]; pierce: number; portalCd: number };
type Drop = { x: number; y: number; kind: PowerKind; spin: number };
type Shot = { x: number; y: number; vx: number; vy: number; r: number; color: string };
type Beam = { x: number; warn: number; fire: number; hit: boolean };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "chip" | "ring" | "spark" | "ember" | "shard" | "burn" | "slice" | "zap";
  w?: number;
  h?: number;
  rot?: number;
  vr?: number;
  grav?: number;
  /** Zap target. */
  x2?: number;
  y2?: number;
};
/** What hit a brick: decides the impact and destruction animation. */
type Cause = "ball" | "fire" | "fast" | "laser" | "blast" | "zap";
type Popup = { x: number; y: number; text: string; life: number; color: string; size?: number };

export type PowerKind = "expand" | "shrink" | "multi" | "fire" | "laser" | "catch" | "slow" | "fast" | "life" | "shield" | "lightning" | "giant" | "chaos";
export type Phase = "title" | "ready" | "playing" | "paused" | "levelClear" | "stageClear" | "upgrade" | "gameOver" | "runOver";
export type Mode = "campaign" | "run";

export const POWERS: Record<PowerKind, { label: string; good: boolean; color: string; duration?: number; weight: number }> = {
  expand: { label: "Expand", good: true, color: "#3d7be0", duration: 20, weight: 14 },
  multi: { label: "Multi-ball", good: true, color: "#8b5cf6", weight: 14 },
  fire: { label: "Fireball", good: true, color: "#f2862f", duration: 10, weight: 8 },
  laser: { label: "Laser", good: true, color: "#e2508a", duration: 12, weight: 10 },
  catch: { label: "Catch", good: true, color: "#46b35e", duration: 15, weight: 10 },
  slow: { label: "Slow", good: true, color: "#2fb7c9", duration: 12, weight: 10 },
  life: { label: "Extra life", good: true, color: "#e8c43b", weight: 4 },
  shield: { label: "Shield", good: true, color: "#6da7ec", weight: 8 },
  lightning: { label: "Chain Lightning", good: true, color: "#8fdfff", duration: 10, weight: 7 },
  giant: { label: "Giant Ball", good: true, color: "#b8743a", duration: 10, weight: 6 },
  chaos: { label: "Chaos", good: true, color: "#ff2fd6", weight: 6 },
  shrink: { label: "Shrink", good: false, color: "#d63c3c", duration: 15, weight: 9 },
  fast: { label: "Fast ball", good: false, color: "#d63c3c", duration: 10, weight: 9 },
};

const PALETTE: Record<string, string> = { r: "#e5484d", o: "#f2862f", y: "#e8c43b", g: "#46b35e", c: "#2fb7c9", b: "#3d7be0", p: "#a35be0", w: "#d9d9de" };
const POINTS: Record<BrickType, number> = { normal: 50, strong: 120, metal: 0, explosive: 80, mystery: 100, regen: 70, shooter: 150, portal: 0 };
const STOPS_CLEAR = (b: Brick) => b.alive && b.type !== "metal" && b.type !== "portal" && !b.orbit;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function mix(hex: string, to: number, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function randomPower(exclude?: PowerKind): PowerKind {
  const entries = (Object.entries(POWERS) as [PowerKind, (typeof POWERS)[PowerKind]][]).filter(([k]) => k !== exclude);
  let r = Math.random() * entries.reduce((a, [, p]) => a + p.weight, 0);
  for (const [k, p] of entries) if ((r -= p.weight) <= 0) return k;
  return "expand";
}

export type StageResult = {
  stars: number;
  stageScore: number;
  bonus: number;
  peakRank: number;
  livesLost: number;
  boss: boolean;
  /** Campaign finished. */
  final: boolean;
};

export type Snapshot = {
  phase: Phase;
  mode: Mode;
  score: number;
  lives: number;
  maxLives: number;
  label: string;
  stageName: string;
  best: number;
  timers: { kind: PowerKind; left: number; total: number }[];
  shield: boolean;
  result: StageResult | null;
  choices: Upgrade[];
  stacks: Record<string, number>;
  depth: number;
  stageIndex: number;
};

type BossState = {
  spec: BossSpec;
  x: number;
  y: number;
  baseY: number;
  rx: number;
  ry: number;
  hp: number;
  maxHp: number;
  phase: number;
  t: number;
  flash: number;
  mouth: number;
  attackT: number;
  beamT: number;
  ringT: number;
  dying: number;
  boomT: number;
  dead: boolean;
  clangT: number;
};

export class Game {
  phase: Phase = "title";
  mode: Mode = "campaign";
  /** Index of the current stage (campaign) or depth (run). */
  level = 0;
  stage: Stage = CAMPAIGN[0];
  score = 0;
  lives = 3;
  best = 0;
  paddle = { x: W / 2, w: PADDLE_W, targetX: W / 2 };
  keys = { left: false, right: false };
  balls: Ball[] = [];
  bricks: Brick[] = [];
  drops: Drop[] = [];
  bolts: { x: number; y: number }[] = [];
  shots: Shot[] = [];
  beams: Beam[] = [];
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
  /** Screen shake on/off (settings). */
  shakeOn = true;
  /** Bricks pulse to the beat (settings). */
  beatPulse = true;
  /** 0..1 beat pulse from the soundtrack, set every frame by the UI. */
  beat = 0;
  style = new StyleMeter();
  mods: Mods = { ...BASE_MODS };
  stacks: Record<string, number> = {};
  runSeed = 1;
  result: StageResult | null = null;
  choices: Upgrade[] = [];
  boss: BossState | null = null;
  onStageClear?: (stage: Stage, result: StageResult, mode: Mode) => void;
  onRunOver?: (depth: number, score: number) => void;
  onBest?: (score: number) => void;
  /** Playfield height in logical units; taller than 600 on portrait phones. */
  h = H;
  /** Touch device: changes the on-canvas hint text. */
  touch = false;
  /** On-screen CSS pixels per logical unit; small screens get a bigger ball and text. */
  viewScale = 1;

  private acc = 0;
  private explosions: { brick: Brick; at: number }[] = [];
  private backdrop = new Backdrop(W);
  private skins = new BrickSkins();
  private paddleFlash = 0;
  private paddleFlashColor = "#ffffff";
  private renderScale = 1;
  private icons: Partial<Record<PowerKind, { path: Path2D; tone: Tone }[]>> = {};
  private sound: Sound;
  // Game feel.
  private freeze = 0;
  private slowT = 0;
  private slowScale = 1;
  private punch = 0;
  /** Real seconds of slow-motion finale before the level counts as cleared. */
  private finale = -1;
  private pvx = 0;
  private prevPaddleX = W / 2;
  private stun = 0;
  // Bookkeeping.
  private stageStartScore = 0;
  private stageLivesLost = 0;
  private hitCount = 0;
  private destroyedCount = 0;
  private turretT = 0;
  private magnetUsed = false;
  private secondWindUsed = false;
  private rankBanner = 0;

  get paddleY() {
    return this.h - 44;
  }

  /** Visual boost for text and pickups when the canvas is drawn small (phones). */
  private get boost() {
    return clamp(0.72 / this.viewScale, 1, 1.9);
  }

  private get ballR() {
    return this.timers.giant ? GIANT_R : BALL_R;
  }

  get maxLives() {
    return this.mode === "run" ? this.mods.maxLives : 9;
  }

  /** Resize the playfield height (e.g. phone rotated); keeps balls in play. */
  setHeight(h: number) {
    if (h === this.h) return;
    this.h = h;
    for (const b of this.balls) {
      if (b.stuck) b.y = this.paddleY - this.ballR - 1;
      else if (b.y > this.paddleY - 30) {
        b.y = this.paddleY - 30;
        b.vy = -Math.abs(b.vy);
      }
    }
  }

  constructor(sound: Sound) {
    this.sound = sound;
    this.style.onRank = (rank, up) => {
      if (up && rank > 0) {
        this.sound.rankUp(rank);
        this.punch = Math.max(this.punch, 0.6);
        this.rankBanner = 1.4;
      }
    };
    this.loadStage(0);
    this.phase = "title";
  }

  snapshot(): Snapshot {
    const s = this.stage;
    return {
      phase: this.phase,
      mode: this.mode,
      score: this.score,
      lives: this.lives,
      maxLives: this.maxLives,
      label: this.mode === "run" ? `Depth ${this.level + 1}` : `${s.world + 1}-${s.index + 1}`,
      stageName: s.name,
      best: this.best,
      timers: (Object.keys(this.timers) as PowerKind[]).map((k) => ({ kind: k, left: this.timers[k]!, total: (POWERS[k].duration ?? 1) * this.mods.powerDur })),
      shield: this.shield,
      result: this.result,
      choices: this.choices,
      stacks: this.stacks,
      depth: this.level + 1,
      stageIndex: this.level,
    };
  }

  // ── Flow ──────────────────────────────────────────────────────────────────────────
  startCampaign(index: number) {
    this.mode = "campaign";
    this.score = 0;
    this.lives = 3;
    this.mods = { ...BASE_MODS };
    this.stacks = {};
    this.loadStage(index);
  }

  startRun(seed: number) {
    this.mode = "run";
    this.runSeed = seed;
    this.score = 0;
    this.stacks = {};
    this.mods = computeMods(this.stacks);
    this.lives = 3;
    this.secondWindUsed = false;
    this.loadStage(0);
  }

  /** Campaign: on to the next level (or back to the menu after the last). */
  nextStage() {
    if (this.mode === "campaign" && this.level + 1 < CAMPAIGN.length) {
      this.lives = Math.max(this.lives, 3);
      this.loadStage(this.level + 1);
    } else this.toMenu();
  }

  retryStage() {
    this.score = this.stageStartScore;
    this.lives = 3;
    this.loadStage(this.level);
  }

  toMenu() {
    this.phase = "title";
    this.result = null;
    this.choices = [];
    this.saveBest();
  }

  chooseUpgrade(id: string) {
    this.stacks[id] = (this.stacks[id] ?? 0) + 1;
    this.mods = computeMods(this.stacks);
    if (id === "will") this.lives = Math.min(this.mods.maxLives, this.lives + 1);
    this.lives = Math.min(this.lives, this.mods.maxLives);
    this.sound.pick();
    this.choices = [];
    this.loadStage(this.level + 1);
  }

  loadStage(n: number) {
    this.level = n;
    this.stage = this.mode === "campaign" ? CAMPAIGN[n] : runStage(this.runSeed, n);
    const pal = LEVEL_STYLES[this.stage.theme].palette;
    this.bricks = [];
    this.result = null;
    this.stage.rows.forEach((raw, row) => {
      const line = raw.padEnd(COLS, ".").slice(0, COLS);
      [...line].forEach((ch, col) => {
        if (ch === ".") return;
        const type: BrickType =
          ch === "M" ? "metal" : ch === "X" ? "explosive" : ch === "?" ? "mystery" : ch === "2" || ch === "3" ? "strong" : ch === "R" ? "regen" : ch === "S" ? "shooter" : ch === "O" ? "portal" : "normal";
        const hp = type === "strong" ? Number(ch) : type === "shooter" ? 2 : 1;
        const color =
          type === "metal" ? "#a9adb8" : type === "explosive" ? "#e0452f" : type === "mystery" ? "#d6a72c" : type === "strong" ? (hp === 3 ? "#9aa3b8" : "#c3c8d4") : ch === "<" ? pal.p : type === "regen" ? pal.c : type === "shooter" ? pal.r : type === "portal" ? "#7a3aff" : pal[ch] ?? PALETTE[ch] ?? "#d9d9de";
        const x = SIDE + col * (BRICK_W + GAP);
        const b: Brick = { x, y: TOP + row * (BRICK_H + GAP), w: BRICK_W, h: BRICK_H, type, hp, maxHp: hp, color, row, alive: true, flash: 0, flashColor: "255,255,255", variant: (col * 7 + row * 3) % 4 };
        if (ch === "<") {
          b.move = { x0: x, amp: BRICK_W + GAP, speed: 1.1 + this.stage.difficulty * 0.03, phase: 0 };
        }
        if (type === "shooter") b.cool = 2 + Math.random() * 3;
        this.bricks.push(b);
      });
    });
    // Pair up portals in order.
    const portals = this.bricks.filter((b) => b.type === "portal");
    for (let i = 0; i + 1 < portals.length; i += 2) {
      portals[i].pair = portals[i + 1];
      portals[i + 1].pair = portals[i];
    }
    this.boss = null;
    if (this.stage.boss !== undefined) this.initBoss(BOSSES[this.stage.boss]);
    this.style.reset();
    this.style.peak = 0;
    this.style.decayMul = this.mods.styleDecay;
    this.stageStartScore = this.score;
    this.stageLivesLost = 0;
    this.shield = this.mods.shieldStart;
    this.shots = [];
    this.beams = [];
    this.finale = -1;
    this.slowT = 0;
    this.stun = 0;
    this.resetRound();
    this.banner = 2.4;
    this.levelTime = 0;
  }

  private resetRound() {
    this.paddle.w = PADDLE_W * this.mods.paddleW;
    this.timers = {};
    this.drops = [];
    this.bolts = [];
    this.shots = [];
    this.beams = [];
    this.explosions = [];
    this.magnetUsed = false;
    const count = 1 + this.mods.extraBalls;
    this.balls = Array.from({ length: count }, (_, i) => ({
      x: this.paddle.x,
      y: this.paddleY - BALL_R - 1,
      vx: 0,
      vy: 0,
      stuck: true,
      offset: (i - (count - 1) / 2) * 16,
      trail: [],
      pierce: 0,
      portalCd: 0,
    }));
    this.phase = "ready";
  }

  /** Click / Space: launch, release a caught ball, or fire the laser. */
  action() {
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
    if (this.timers.laser && this.laserCooldown <= 0) this.fireLaser();
  }

  private fireLaser() {
    this.bolts.push({ x: this.paddle.x - this.paddle.w / 2 + 8, y: this.paddleY - 12 }, { x: this.paddle.x + this.paddle.w / 2 - 8, y: this.paddleY - 12 });
    this.laserCooldown = 0.2;
    this.sound.laser();
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
    const base = 360 + this.stage.difficulty * 8;
    const ramp = 1 + Math.min(this.levelTime / 100, 0.3);
    // A taller (portrait) field means a longer trip, so the ball moves a little faster to keep the pace.
    const tall = (this.h / H) ** 0.6;
    return base * ramp * tall * this.mods.ballSpeed * (this.timers.slow ? 0.7 : 1) * (this.timers.fast ? 1.35 : 1);
  }

  private release(b: Ball) {
    const offset = clamp(b.offset / (this.paddle.w / 2), -1, 1);
    const angle = offset * 0.9 + (Math.random() - 0.5) * 0.2;
    const sp = this.speed();
    b.stuck = false;
    b.vx = sp * Math.sin(angle);
    b.vy = -sp * Math.cos(angle);
  }

  private addScore(base: number) {
    const pts = Math.round(base * this.style.mult * this.mods.scoreMult);
    this.score += pts;
    return pts;
  }

  // ── Simulation ────────────────────────────────────────────────────────────────────
  update(dt: number) {
    this.time += dt;
    this.backdrop.update(dt, this.h, this.reduced);
    this.banner = Math.max(0, this.banner - dt);
    this.rankBanner = Math.max(0, this.rankBanner - dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.punch = Math.max(0, this.punch - dt * 3);
    // Hit-stop: everything holds for a few frames on big hits.
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }
    // Slow motion (finales, boss deaths).
    let sdt = dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      sdt = dt * this.slowScale;
    }
    this.updateEffects(sdt);
    if (this.phase === "playing" || this.phase === "levelClear") this.style.update(sdt);
    if (this.finale >= 0) {
      this.finale -= dt;
      if (this.finale < 0) this.completeStage();
    }
    if (this.phase === "levelClear") {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.afterClear();
      return;
    }
    if (this.phase !== "playing" && this.phase !== "ready") return;
    this.acc += sdt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
      if (this.phase !== "playing" && this.phase !== "ready") {
        this.acc = 0;
        break;
      }
    }
  }

  private step(h: number) {
    const p = this.paddle;
    if (this.stun > 0) this.stun -= h;
    else {
      if (this.keys.left) p.targetX -= 720 * h;
      if (this.keys.right) p.targetX += 720 * h;
    }
    const desired = PADDLE_W * this.mods.paddleW * (this.timers.expand ? 1.5 : 1) * (this.timers.shrink ? 0.62 : 1);
    p.w += (desired - p.w) * Math.min(1, h * 10);
    p.targetX = clamp(p.targetX, p.w / 2, W - p.w / 2);
    if (this.stun <= 0) p.x = p.targetX;
    // Paddle velocity (for spin), smoothed.
    this.pvx += ((p.x - this.prevPaddleX) / h - this.pvx) * 0.35;
    this.prevPaddleX = p.x;
    this.moveBricks(h);
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

    // Hellturret upgrade: the paddle fires on its own.
    if (this.mods.turret > 0) {
      this.turretT += h;
      if (this.turretT >= this.mods.turret) {
        this.turretT = 0;
        this.fireLaser();
      }
    }

    const sp = this.speed();
    for (const ball of this.balls) {
      if (ball.stuck) {
        ball.x = p.x + ball.offset;
        ball.y = this.paddleY - this.ballR - 1;
        continue;
      }
      const cur = Math.hypot(ball.vx, ball.vy) || sp;
      const k = (cur + (sp - cur) * Math.min(1, h * 2)) / cur;
      ball.vx *= k;
      ball.vy *= k;
      if (Math.abs(ball.vy) < sp * 0.25) ball.vy = Math.sign(ball.vy || -1) * sp * 0.25;
      ball.portalCd = Math.max(0, ball.portalCd - h);
      this.moveBall(ball, h);
      if (this.timers.fire && Math.random() < (this.reduced ? 0.15 : 0.5)) this.ember(ball.x, ball.y);
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();
    }
    this.balls = this.balls.filter((b) => b.y - this.ballR < this.h + 20);
    if (!this.balls.length) {
      // Dropping the ball during the level-clear slow motion doesn't cost a life.
      if (this.finale < 0) this.loseLife();
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
      // Bolts burn enemy shots out of the air.
      const shot = this.shots.find((s) => Math.abs(s.x - bolt.x) < s.r + 3 && Math.abs(s.y - bolt.y) < s.r + 10);
      if (shot) {
        this.killShot(shot);
        return false;
      }
      if (this.boss && !this.boss.dying && this.hitsBoss(bolt.x, bolt.y, 2)) {
        this.damageBoss(0.34, bolt.x, bolt.y, "laser");
        return false;
      }
      const hit = this.bricks.find((b) => b.alive && b.type !== "portal" && bolt.x >= b.x && bolt.x <= b.x + b.w && bolt.y >= b.y && bolt.y <= b.y + b.h);
      if (hit) this.hitBrick(hit, "laser", bolt.x, bolt.y);
      return !hit;
    });

    this.updateHazards(h);
    if (this.boss) this.updateBoss(h);

    while (this.explosions.length && this.explosions[0].at <= this.levelTime) this.explode(this.explosions.shift()!.brick);

    const cleared = this.boss ? this.boss.dead : !this.bricks.some(STOPS_CLEAR);
    if (cleared && this.finale < 0) this.startFinale();
  }

  /** The last brick (or the boss) just went: a beat of slow motion before the level ends. */
  private startFinale() {
    this.finale = this.boss ? 0.6 : 1.0;
    this.slowT = this.finale;
    this.slowScale = 0.25;
    this.punch = 1;
    this.freeze = 0.08;
    if (this.shakeOn && !this.reduced) this.shake = Math.max(this.shake, 8);
  }

  private completeStage() {
    const boss = Boolean(this.boss);
    const bonus = (boss ? 3000 * (this.stage.world + 1) : 1000) + this.lives * 250;
    this.score += bonus;
    const stars = 1 + (this.stageLivesLost === 0 ? 1 : 0) + (this.style.peak >= 4 ? 1 : 0);
    this.result = {
      stars,
      stageScore: this.score - this.stageStartScore,
      bonus,
      peakRank: this.style.peak,
      livesLost: this.stageLivesLost,
      boss,
      final: this.mode === "campaign" && this.level === CAMPAIGN.length - 1,
    };
    this.popups.push({ x: W / 2, y: this.h / 2 + 40, text: `Level clear +${bonus.toLocaleString()}`, life: 2, color: "#e8c43b", size: 22 });
    this.sound.level();
    this.phase = "levelClear";
    this.clearTimer = 1.6;
    this.shots = [];
    this.beams = [];
    this.saveBest();
    this.onStageClear?.(this.stage, this.result, this.mode);
  }

  private afterClear() {
    if (this.mode === "run") {
      this.choices = rollChoices(this.stacks, seeded(this.runSeed * 7 + this.level * 131));
      this.phase = this.choices.length ? "upgrade" : "playing";
      if (!this.choices.length) this.loadStage(this.level + 1);
    } else this.phase = "stageClear";
  }

  private moveBricks(h: number) {
    for (const b of this.bricks) {
      if (b.move && b.alive) b.x = b.move.x0 + Math.sin(this.time * b.move.speed + b.move.phase) * b.move.amp;
      if (b.orbit && this.boss) {
        b.orbit.a += b.orbit.speed * h;
        b.x = this.boss.x + Math.cos(b.orbit.a) * b.orbit.r - b.w / 2;
        b.y = this.boss.y + Math.sin(b.orbit.a) * b.orbit.r * 0.72 - b.h / 2;
      }
      // Regenerating bricks grow back unless a ball is in the way.
      if (b.type === "regen" && !b.alive && b.regrow !== undefined) {
        b.regrow -= h;
        if (b.regrow <= 0 && !this.balls.some((bl) => bl.x > b.x - 10 && bl.x < b.x + b.w + 10 && bl.y > b.y - 10 && bl.y < b.y + b.h + 10)) {
          b.alive = true;
          b.hp = b.maxHp;
          b.flash = 1;
          b.flashColor = "120,255,200";
          b.regrow = undefined;
          b.regrown = true;
          this.spark(b.x + b.w / 2, b.y + b.h / 2, "#9affd8", 6);
        }
      }
    }
  }

  /** Shooter bricks, enemy shots and boss beams. */
  private updateHazards(h: number) {
    const p = this.paddle;
    for (const b of this.bricks) {
      if (b.type !== "shooter" || !b.alive) continue;
      b.cool = (b.cool ?? 3) - h;
      if (b.cool <= 0) {
        b.cool = 4 + Math.random() * 2.5;
        const sx = b.x + b.w / 2;
        const sy = b.y + b.h;
        const dx = p.x - sx;
        const dy = this.paddleY - sy;
        const len = Math.hypot(dx, dy) || 1;
        this.shots.push({ x: sx, y: sy, vx: (dx / len) * 170, vy: (dy / len) * 170, r: 5, color: "#ff4a3a" });
        this.sound.bossShoot();
      }
    }
    for (const s of this.shots) {
      s.x += s.vx * h;
      s.y += s.vy * h;
    }
    this.shots = this.shots.filter((s) => {
      if (s.y > this.h + 20 || s.x < -20 || s.x > W + 20) return false;
      // Hit the paddle → stunned.
      if (s.y + s.r >= this.paddleY && s.y - s.r <= this.paddleY + PADDLE_H && Math.abs(s.x - p.x) <= p.w / 2 + s.r) {
        this.stunPaddle(s.x);
        return false;
      }
      // A ball smashes shots out of the air.
      for (const bl of this.balls) {
        if (Math.hypot(bl.x - s.x, bl.y - s.y) < this.ballR + s.r) {
          this.killShot(s, true);
          return false;
        }
      }
      return true;
    });
    for (const beam of this.beams) {
      if (beam.warn > 0) beam.warn -= h;
      else {
        beam.fire -= h;
        if (!beam.hit && Math.abs(p.x - beam.x) < p.w / 2 + 16) {
          beam.hit = true;
          this.stunPaddle(p.x);
        }
      }
    }
    this.beams = this.beams.filter((b) => b.warn > 0 || b.fire > 0);
  }

  private killShot(s: Shot, byBall = false) {
    this.shots = this.shots.filter((o) => o !== s);
    this.spark(s.x, s.y, "#ffb08a", this.reduced ? 3 : 8);
    if (byBall) this.style.add("shot");
  }

  private stunPaddle(x: number) {
    if (this.stun > 0) return;
    this.stun = 0.7;
    this.style.damage(1);
    this.sound.stunned();
    if (this.shakeOn && !this.reduced) this.shake = Math.max(this.shake, 7);
    this.popups.push({ x, y: this.paddleY - 26, text: "STUNNED", life: 0.9, color: "#ff7b7b" });
    for (let i = 0; i < 12; i++) this.spark(x, this.paddleY, i % 2 ? "#9fd8ff" : "#ffffff", 1);
  }

  /** Moves a ball in small sub-steps so even fast balls never tunnel through a brick. */
  private moveBall(ball: Ball, h: number) {
    const R = this.ballR;
    const dist = Math.hypot(ball.vx, ball.vy) * h;
    const n = Math.max(1, Math.ceil(dist / (BALL_R * 0.5)));
    const dt = h / n;
    const p = this.paddle;
    for (let i = 0; i < n; i++) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x < R) {
        ball.x = R;
        ball.vx = Math.abs(ball.vx);
        this.sound.wall();
      } else if (ball.x > W - R) {
        ball.x = W - R;
        ball.vx = -Math.abs(ball.vx);
        this.sound.wall();
      }
      if (ball.y < R) {
        ball.y = R;
        ball.vy = Math.abs(ball.vy);
        this.sound.wall();
      }

      // Paddle: the further from the centre, the sharper the angle; a moving paddle adds spin.
      if (ball.vy > 0 && ball.y + R >= this.paddleY && ball.y - R <= this.paddleY + PADDLE_H && Math.abs(ball.x - p.x) <= p.w / 2 + R) {
        const offset = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
        const spin = clamp(this.pvx / 1400, -0.4, 0.4);
        const angle = clamp(offset * 1.05 + spin, -1.2, 1.2);
        const sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = sp * Math.sin(angle);
        ball.vy = -sp * Math.cos(angle);
        ball.y = this.paddleY - R;
        ball.pierce = this.mods.pierce;
        this.sound.paddle();
        this.style.paddle();
        if (Math.abs(spin) > 0.15 && !this.reduced) this.spark(ball.x, this.paddleY, "#ffe6c0", 3);
        if (this.timers.catch || (this.mods.magnet && !this.magnetUsed)) {
          this.magnetUsed = true;
          ball.stuck = true;
          ball.offset = ball.x - p.x;
          return;
        }
      }

      if (this.shield && ball.vy > 0 && ball.y + R >= this.h - 6) {
        ball.vy = -Math.abs(ball.vy);
        this.shield = false;
        for (let k = 0; k < 20; k++) this.spark(Math.random() * W, this.h - 6, "#6da7ec", 1);
        this.sound.metal();
      }

      // Boss body.
      if (this.boss && !this.boss.dying && this.collideBoss(ball, R)) continue;

      for (const b of this.bricks) {
        if (!b.alive) continue;
        const cx = clamp(ball.x, b.x, b.x + b.w);
        const cy = clamp(ball.y, b.y, b.y + b.h);
        const dx = ball.x - cx;
        const dy = ball.y - cy;
        if (dx * dx + dy * dy >= R * R) continue;
        if (b.type === "portal") {
          this.teleport(ball, b);
          break;
        }
        if (b.type !== "metal" && (this.timers.fire || ball.pierce > 0)) {
          if (!this.timers.fire) ball.pierce--;
          this.destroy(b, this.timers.fire ? "fire" : "ball", cx, cy);
          this.style.add("destroy");
          continue;
        }
        // Reflect on the axis of contact and push the ball out of the brick.
        if (Math.abs(dx) > Math.abs(dy)) {
          ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
          ball.x = cx + Math.sign(dx || 1) * R;
        } else {
          ball.vy = dy > 0 ? Math.abs(ball.vy) : dy < 0 ? -Math.abs(ball.vy) : -ball.vy;
          ball.y = cy + (dy !== 0 ? Math.sign(dy) : ball.vy > 0 ? 1 : -1) * R;
        }
        this.ballHit(ball, b, cx, cy);
        break;
      }
    }
  }

  /** A ball struck a brick: damage, crits, chains and splits. */
  private ballHit(ball: Ball, b: Brick, cx: number, cy: number) {
    const cause: Cause = this.timers.fast ? "fast" : "ball";
    let dmg = this.timers.giant ? 3 : 1;
    if (b.type === "strong" && this.mods.heavy) dmg += 1;
    if (b.type !== "metal" && Math.random() < this.mods.critChance) {
      dmg *= 3;
      this.freeze = Math.max(this.freeze, 0.05);
      this.popups.push({ x: cx, y: cy - 10, text: "CRIT", life: 0.7, color: "#ffd84a" });
      this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 34, color: "#ffd84a", kind: "ring" });
    }
    this.hitBrick(b, cause, cx, cy, dmg);
    if (b.type !== "metal") {
      // Chain Lightning power-up: zap up to two neighbours.
      if (this.timers.lightning) for (let k = 0; k < 2; k++) this.zapFrom(b, 1);
      // Splinter upgrade: every Nth hit splits the ball.
      this.hitCount++;
      if (this.mods.splitEvery && this.hitCount % this.mods.splitEvery === 0 && this.balls.length < MAX_BALLS) {
        const c = Math.cos(0.35);
        const s = Math.sin(0.35);
        this.balls.push({ x: ball.x, y: ball.y, vx: ball.vx * c - ball.vy * s, vy: ball.vx * s + ball.vy * c, stuck: false, offset: 0, trail: [], pierce: 0, portalCd: 0 });
        this.popups.push({ x: ball.x, y: ball.y - 14, text: "SPLIT", life: 0.6, color: "#c8b8ff" });
      }
    }
  }

  private teleport(ball: Ball, portal: Brick) {
    if (ball.portalCd > 0 || !portal.pair) return;
    const out = portal.pair;
    const sp = Math.hypot(ball.vx, ball.vy) || 1;
    const R = this.ballR;
    ball.x = out.x + out.w / 2 + (ball.vx / sp) * (out.w / 2 + R + 2);
    ball.y = out.y + out.h / 2 + (ball.vy / sp) * (out.h / 2 + R + 2);
    ball.trail = [];
    ball.portalCd = 0.4;
    this.sound.portal();
    for (const pt of [portal, out]) this.particles.push({ x: pt.x + pt.w / 2, y: pt.y + pt.h / 2, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 30, color: "#b48aff", kind: "ring" });
  }

  /** Strike the nearest living brick with a lightning arc. */
  private zapFrom(src: Brick, dmg: number) {
    const sx = src.x + src.w / 2;
    const sy = src.y + src.h / 2;
    let best: Brick | null = null;
    let bd = 110;
    for (const o of this.bricks) {
      if (!o.alive || o === src || o.type === "metal" || o.type === "portal") continue;
      const d = Math.hypot(o.x + o.w / 2 - sx, o.y + o.h / 2 - sy);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best) return;
    const tx = best.x + best.w / 2;
    const ty = best.y + best.h / 2;
    this.particles.push({ x: sx, y: sy, x2: tx, y2: ty, vx: 0, vy: 0, life: 0.18, max: 0.18, size: 2, color: "#bff0ff", kind: "zap" });
    this.sound.zap();
    this.hitBrick(best, "zap", tx, ty, dmg);
  }

  private hitBrick(b: Brick, cause: Cause, hx: number, hy: number, dmg = 1) {
    b.flash = 1;
    b.flashColor = cause === "laser" ? "255,120,210" : cause === "fire" ? "255,170,60" : cause === "fast" ? "255,90,70" : cause === "zap" ? "170,230,255" : "255,255,255";
    if (b.type === "metal" || b.type === "portal") {
      this.sound.metal();
      this.impactFx(cause, hx, hy, b);
      return;
    }
    b.hp -= dmg;
    if (b.hp > 0) {
      this.addScore(10);
      this.sound.crack();
      this.chips(b, 3);
      this.impactFx(cause, hx, hy, b);
      this.style.add("hit");
      return;
    }
    this.destroy(b, cause, hx, hy);
    this.style.add("destroy");
  }

  private destroy(b: Brick, cause: Cause = "ball", hx = b.x + b.w / 2, hy = b.y + b.h / 2) {
    if (!b.alive || b.type === "metal" || b.type === "portal") return;
    b.alive = false;
    if (b.type === "regen" && !b.regrown) b.regrow = 6;
    this.destroyFx(b, cause, hx, hy);
    const pts = this.addScore(POINTS[b.type] * (b.type === "strong" ? b.maxHp : 1));
    this.popups.push({ x: b.x + b.w / 2, y: b.y, text: `+${pts}`, life: 0.8, color: "#ffffff" });
    if (cause === "ball" || cause === "blast" || cause === "zap") this.chips(b, this.reduced ? 4 : 12);
    this.sound.brick(b.row);
    if (b.type === "mystery" || Math.random() < this.mods.dropChance) this.drops.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, kind: randomPower(), spin: 0 });
    if (b.type === "explosive" || (cause !== "blast" && Math.random() < this.mods.explodeChance)) this.explosions.push({ brick: b, at: this.levelTime + 0.06 });
    if (cause !== "zap" && Math.random() < this.mods.chainChance) this.zapFrom(b, 1);
    if (cause === "fast") this.freeze = Math.max(this.freeze, 0.035);
    // Soul Harvest upgrade.
    this.destroyedCount++;
    if (this.mods.vampire && this.destroyedCount % 60 === 0 && this.lives < this.maxLives) {
      this.lives++;
      this.popups.push({ x: b.x + b.w / 2, y: b.y - 16, text: "+1 LIFE", life: 1.2, color: "#ff8aa0" });
    }
  }

  /** Blows up every neighbouring brick; neighbouring explosives chain after a short delay. */
  private explode(b: Brick) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    this.sound.explode();
    if (this.shakeOn && !this.reduced) this.shake = Math.max(this.shake, 9);
    this.freeze = Math.max(this.freeze, 0.045);
    this.punch = Math.max(this.punch, 0.5);
    this.particles.push({ x: cx, y: cy, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 90, color: "#ffb347", kind: "ring" });
    for (let i = 0; i < (this.reduced ? 8 : 26); i++) this.spark(cx, cy, i % 2 ? "#ffd166" : "#ff6b3d", 1);
    for (const o of this.bricks) {
      if (!o.alive || o === b || o.type === "metal" || o.type === "portal" || o.orbit) continue;
      if (Math.abs(o.x + o.w / 2 - cx) <= BRICK_W * 1.2 && Math.abs(o.y + o.h / 2 - cy) <= BRICK_H * 1.6) {
        if (o.type === "explosive") {
          o.alive = false;
          this.addScore(POINTS.explosive);
          this.explosions.push({ brick: o, at: this.levelTime + 0.09 });
        } else this.destroy(o, "blast");
        this.style.add("blast");
      }
    }
  }

  // ── Boss ────────────────────────────────────────────────────────────────────────
  private initBoss(spec: BossSpec) {
    const scale = this.mode === "run" ? 0.8 + this.level * 0.05 : 1;
    const hp = Math.round(spec.hp * scale);
    this.boss = {
      spec,
      x: W / 2,
      y: TOP + 92,
      baseY: TOP + 92,
      rx: 74,
      ry: 52,
      hp,
      maxHp: hp,
      phase: 1,
      t: 0,
      flash: 0,
      mouth: 0,
      attackT: 3,
      beamT: 5,
      ringT: 0,
      dying: 0,
      boomT: 0,
      dead: false,
      clangT: 0,
    };
    this.spawnRing();
  }

  /** A ring of shield bricks orbiting the boss; the weak point is only open once it's broken. */
  private spawnRing() {
    const bs = this.boss!;
    this.bricks = this.bricks.filter((b) => !b.orbit);
    const count = 6 + bs.phase * 2;
    const pal = LEVEL_STYLES[this.stage.theme].palette;
    const letters = "roygcbp";
    for (let k = 0; k < count; k++) {
      const strong = bs.phase >= 2 && k % 2 === 0;
      const hp = strong ? bs.phase : 1;
      this.bricks.push({
        x: bs.x,
        y: bs.y,
        w: BRICK_W * 0.82,
        h: BRICK_H * 0.82,
        type: strong ? "strong" : "normal",
        hp,
        maxHp: hp,
        color: strong ? (hp === 3 ? "#9aa3b8" : "#c3c8d4") : pal[letters[k % letters.length]],
        row: k % 6,
        alive: true,
        flash: 1,
        flashColor: "255,220,160",
        variant: k % 4,
        orbit: { a: (k / count) * Math.PI * 2, r: 128 + bs.phase * 6, speed: (bs.phase % 2 ? 1 : -1) * (0.55 + bs.phase * 0.2) },
      });
    }
    bs.ringT = 0;
  }

  private get bossExposed() {
    return !!this.boss && !this.bricks.some((b) => b.orbit && b.alive);
  }

  private updateBoss(h: number) {
    const bs = this.boss!;
    bs.t += h;
    bs.flash = Math.max(0, bs.flash - h * 5);
    bs.mouth = Math.max(0, bs.mouth - h * 2.2);
    bs.clangT = Math.max(0, bs.clangT - h);
    if (bs.dying > 0) {
      // Death throes: a chain of explosions, then gone.
      bs.dying += h / 1.1;
      bs.boomT -= h;
      if (bs.boomT <= 0) {
        bs.boomT = 0.12;
        const ex = bs.x + (Math.random() - 0.5) * bs.rx * 1.8;
        const ey = bs.y + (Math.random() - 0.5) * bs.ry * 1.8;
        this.particles.push({ x: ex, y: ey, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 70, color: "#ffb347", kind: "ring" });
        for (let i = 0; i < (this.reduced ? 6 : 18); i++) this.spark(ex, ey, i % 2 ? "#ffd166" : "#ff4a2a", 1);
        this.sound.explode();
        if (this.shakeOn && !this.reduced) this.shake = Math.max(this.shake, 10);
      }
      if (bs.dying >= 1) bs.dead = true;
      return;
    }
    // Movement: a slow sway that gets faster each phase.
    const spd = [0.45, 0.7, 1.0][bs.phase - 1];
    bs.x = W / 2 + Math.sin(bs.t * spd) * (W / 2 - bs.rx - 60);
    bs.y = bs.baseY + Math.sin(bs.t * 1.7) * 10;

    // Shield ring regrows a while after it's broken.
    if (this.bossExposed) {
      bs.ringT += h;
      if (bs.ringT > [14, 12, 10][bs.phase - 1]) this.spawnRing();
    }

    // Attacks: aimed fireballs, more of them each phase.
    bs.attackT -= h;
    if (bs.attackT <= 0) {
      bs.attackT = [3.4, 2.8, 2.3][bs.phase - 1];
      bs.mouth = 1;
      const n = [1, 2, 3][bs.phase - 1];
      const sx = bs.x;
      const sy = bs.y + bs.ry * 0.6;
      const base = Math.atan2(this.paddleY - sy, this.paddle.x - sx);
      const v = 170 + bs.phase * 22;
      for (let k = 0; k < n; k++) {
        const a = base + (k - (n - 1) / 2) * 0.3;
        this.shots.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 7, color: bs.phase >= 3 ? "#ff2a1a" : "#ff8a2a" });
      }
      this.sound.bossShoot();
    }
    // Phase 3: hell-beams aimed where the paddle is.
    if (bs.phase >= 3) {
      bs.beamT -= h;
      if (bs.beamT <= 0) {
        bs.beamT = 6.5;
        this.beams.push({ x: this.paddle.x, warn: 1.0, fire: 0.45, hit: false });
      }
    }
  }

  private hitsBoss(x: number, y: number, pad: number) {
    const bs = this.boss!;
    const dx = (x - bs.x) / (bs.rx + pad);
    const dy = (y - bs.y) / (bs.ry + pad);
    return dx * dx + dy * dy < 1;
  }

  /** Ball vs the boss's head (an ellipse). Returns true if it bounced. */
  private collideBoss(ball: Ball, R: number) {
    const bs = this.boss!;
    if (!this.hitsBoss(ball.x, ball.y, R)) return false;
    // Bounce along the ellipse normal and push the ball out.
    const nx = (ball.x - bs.x) / ((bs.rx + R) * (bs.rx + R));
    const ny = (ball.y - bs.y) / ((bs.ry + R) * (bs.ry + R));
    const nl = Math.hypot(nx, ny) || 1;
    const ux = nx / nl;
    const uy = ny / nl;
    const dot = ball.vx * ux + ball.vy * uy;
    if (dot < 0) {
      ball.vx -= 2 * dot * ux;
      ball.vy -= 2 * dot * uy;
    }
    for (let k = 0; k < 20 && this.hitsBoss(ball.x, ball.y, R); k++) {
      ball.x += ux * 2;
      ball.y += uy * 2;
    }
    const hx = ball.x - ux * R;
    const hy = ball.y - uy * R;
    if (this.bossExposed) {
      let dmg = (this.timers.fire ? 2 : 1) * (this.timers.giant ? 2 : 1);
      if (Math.random() < this.mods.critChance) {
        dmg *= 3;
        this.popups.push({ x: hx, y: hy - 12, text: "CRIT", life: 0.7, color: "#ffd84a" });
      }
      this.damageBoss(dmg, hx, hy, this.timers.fire ? "fire" : "ball");
    } else if (bs.clangT <= 0) {
      bs.clangT = 0.25;
      this.sound.metal();
      this.spark(hx, hy, "#d8dce6", 6);
      this.popups.push({ x: hx, y: hy - 10, text: "SHIELDED", life: 0.6, color: "#c8ccd8" });
    }
    return true;
  }

  private damageBoss(dmg: number, x: number, y: number, cause: Cause) {
    const bs = this.boss!;
    bs.hp -= dmg;
    bs.flash = 1;
    this.freeze = Math.max(this.freeze, dmg >= 1 ? 0.06 : 0.015);
    this.punch = Math.max(this.punch, dmg >= 1 ? 0.5 : 0.15);
    if (this.shakeOn && !this.reduced && dmg >= 1) this.shake = Math.max(this.shake, 5);
    this.sound.bossHit();
    this.style.add("boss");
    this.addScore(150 * dmg);
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 40, color: cause === "fire" ? "#ffb347" : cause === "laser" ? "#ff5ab8" : "#ffffff", kind: "ring" });
    for (let i = 0; i < (this.reduced ? 4 : 12); i++) this.spark(x, y, i % 2 ? "#ffffff" : "#ff8a5a", 1);
    const frac = bs.hp / bs.maxHp;
    if (bs.hp <= 0) {
      bs.hp = 0;
      bs.dying = 0.001;
      bs.boomT = 0;
      this.bricks = this.bricks.filter((b) => !b.orbit);
      this.shots = [];
      this.beams = [];
      this.slowT = 2.2;
      this.slowScale = 0.45;
      this.sound.bossRoar();
      this.popups.push({ x: W / 2, y: this.h * 0.45, text: `${bs.spec.name} has fallen`, life: 2.4, color: "#ffd166", size: 26 });
    } else if ((bs.phase === 1 && frac <= 0.66) || (bs.phase === 2 && frac <= 0.33)) {
      bs.phase++;
      this.freeze = 0.25;
      this.punch = 1;
      if (this.shakeOn && !this.reduced) this.shake = 16;
      this.sound.bossRoar();
      this.popups.push({ x: W / 2, y: this.h * 0.45, text: bs.phase === 3 ? "ENRAGED" : "IT GROWS ANGRY", life: 1.6, color: "#ff4a3a", size: 30 });
      this.spawnRing();
    }
  }

  // ── Power-ups ───────────────────────────────────────────────────────────────────
  private powerDown() {
    this.paddleFlash = 0.8;
    this.paddleFlashColor = "#9a9aa6";
    for (let i = 0; i < (this.reduced ? 4 : 14); i++) {
      this.particles.push({ x: this.paddle.x + (Math.random() - 0.5) * this.paddle.w, y: this.paddleY, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, life: 0.7, max: 0.7, size: 3 + Math.random() * 3, color: "#6b6b75", kind: "spark" });
    }
  }

  applyPower(kind: PowerKind, x: number) {
    // Chaos: any other power, good or bad.
    if (kind === "chaos") {
      this.popups.push({ x, y: this.paddleY - 44, text: "CHAOS!", life: 1, color: POWERS.chaos.color });
      kind = randomPower("chaos");
    }
    const info = POWERS[kind];
    this.paddleFlash = 1;
    this.paddleFlashColor = info.good ? info.color : "#ff3a2a";
    this.sound.powerUp(info.good);
    this.popups.push({ x, y: this.paddleY - 24, text: info.label, life: 1.1, color: info.good ? info.color : "#ff7b7b" });
    this.addScore(25);
    if (info.good) this.style.add("power");
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
        this.lives = Math.min(this.maxLives, this.lives + 1);
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
            extra.push({ x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c, stuck: false, offset: 0, trail: [], pierce: 0, portalCd: 0 });
          }
        }
        this.balls.push(...extra);
        return;
      }
    }
    if (info.duration) this.timers[kind] = info.duration * this.mods.powerDur;
  }

  private loseLife() {
    this.lives--;
    this.stageLivesLost++;
    this.sound.lose();
    this.style.damage(3);
    if (this.shakeOn && !this.reduced) this.shake = 12;
    if (this.lives <= 0 && this.mods.secondWind && !this.secondWindUsed) {
      this.secondWindUsed = true;
      this.lives = 1;
      this.popups.push({ x: W / 2, y: this.h * 0.5, text: "SECOND WIND", life: 1.8, color: "#9affd8", size: 28 });
    }
    if (this.lives <= 0) {
      this.saveBest();
      if (this.mode === "run") {
        this.phase = "runOver";
        this.onRunOver?.(this.level + 1, this.score);
      } else this.phase = "gameOver";
      return;
    }
    this.shield = this.mods.shieldStart;
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
      this.particles.push({ x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.8) * 220, life: 0.7, max: 0.7, size: 2 + Math.random() * 4, color: b.color, kind: "chip" });
    }
  }

  private ember(x: number, y: number) {
    this.particles.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 60, life: 0.6, max: 0.6, size: 1.4 + Math.random() * 2, color: Math.random() < 0.5 ? "#ffd27a" : "#ff7a2a", kind: "ember", grav: -40 });
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
      if (this.shakeOn && !this.reduced) this.shake = Math.max(this.shake, 3);
    } else if (b.type === "metal") this.spark(x, y, "#e8ecf4", Math.ceil(4 * n));
  }

  /** The brick's death animation, by what killed it. */
  private destroyFx(b: Brick, cause: Cause, x: number, y: number) {
    const n = this.reduced ? 0.4 : 1;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (cause === "fire") {
      this.particles.push({ x: cx, y: cy, vx: 0, vy: -25, life: 0.5, max: 0.5, size: 0, color: b.color, kind: "burn", w: b.w, h: b.h });
      for (let i = 0; i < 16 * n; i++) this.ember(b.x + Math.random() * b.w, b.y + Math.random() * b.h);
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 40, color: "#ffb347", kind: "ring" });
    } else if (cause === "laser") {
      const strips = 4;
      for (let i = 0; i < strips; i++) {
        const dir = i % 2 ? 1 : -1;
        this.particles.push({ x: cx, y: b.y + (b.h / strips) * (i + 0.5), vx: dir * (90 + Math.random() * 60), vy: (Math.random() - 0.5) * 20, life: 0.45, max: 0.45, size: 0, color: b.color, kind: "slice", w: b.w, h: b.h / strips - 0.6 });
      }
      this.spark(x, y, "#ff9ad5", Math.ceil(10 * n));
    } else if (cause === "fast") {
      const len = Math.hypot(cx - x, cy - y);
      const dx = len > 0.01 ? (cx - x) / len : 0;
      const dy = len > 0.01 ? (cy - y) / len : -1;
      for (let i = 0; i < 9 * n; i++) {
        const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
        const v = 220 + Math.random() * 300;
        this.particles.push({ x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, max: 0.7, size: 4 + Math.random() * 6, color: b.color, kind: "shard", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 24, grav: 600 });
      }
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 60, color: "#ffffff", kind: "ring" });
      if (this.shakeOn && !this.reduced) this.shake = Math.max(this.shake, 5);
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
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
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
    this.backdrop.draw(ctx, this.h, scale, this.time, this.reduced, LEVEL_STYLES[this.stage.theme]);

    ctx.save();
    // Camera punch: a quick zoom toward the centre on big hits.
    if (this.punch > 0 && !this.reduced) {
      const z = 1 + this.punch * 0.035;
      ctx.translate(W / 2, this.h / 2);
      ctx.scale(z, z);
      ctx.translate(-W / 2, -this.h / 2);
    }
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    if (this.boss) this.drawBossLayer(ctx);
    for (const b of this.bricks) if (b.alive) this.drawBrick(ctx, b);
    this.drawRegrowing(ctx);

    if (this.shield) {
      ctx.fillStyle = "rgba(109,167,236,0.35)";
      ctx.fillRect(0, this.h - 8, W, 4);
      ctx.fillStyle = "#9cc6f5";
      ctx.fillRect(0, this.h - 7, W, 1.5);
    }

    for (const d of this.drops) this.drawDrop(ctx, d);
    this.drawHazards(ctx);

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
    this.drawParticles(ctx);
    ctx.restore();

    this.drawText(ctx);
    this.drawStyleMeter(ctx);
    if (this.boss && !this.boss.dead) this.drawBossBar(ctx);
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const q of this.particles) {
      const a = q.life / q.max;
      if (q.kind === "ring") {
        ctx.strokeStyle = q.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 6 * a;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (1 - a) + 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (q.kind === "zap") {
        // Jagged lightning arc between two bricks.
        ctx.globalAlpha = a;
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        const segs = 6;
        for (let s = 1; s < segs; s++) {
          const t = s / segs;
          ctx.lineTo(q.x + (q.x2! - q.x) * t + (Math.random() - 0.5) * 10, q.y + (q.y2! - q.y) * t + (Math.random() - 0.5) * 10);
        }
        ctx.lineTo(q.x2!, q.y2!);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else if (q.kind === "burn") {
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
  }

  private drawText(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    for (const t of this.popups) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = `${t.size ? 900 : 700} ${(t.size ?? 15) * this.boost}px system-ui, sans-serif`;
      if (t.size) {
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    if (this.banner > 0 && this.phase !== "title") {
      const s = this.stage;
      ctx.globalAlpha = Math.min(1, this.banner);
      ctx.shadowColor = "#ff3b1f";
      ctx.shadowBlur = 20;
      if (s.boss !== undefined) {
        ctx.font = `800 ${16 * this.boost}px system-ui, sans-serif`;
        ctx.fillStyle = "#ff6a4a";
        ctx.fillText("B O S S", W / 2, this.h / 2 - 18);
        ctx.font = `900 ${40 * Math.min(this.boost, 1.5)}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(s.name.toUpperCase(), W / 2, this.h / 2 + 22);
        ctx.shadowBlur = 0;
        ctx.font = `italic 600 ${16 * this.boost}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffb199";
        ctx.fillText(BOSSES[s.boss].title, W / 2, this.h / 2 + 22 + 30 * this.boost);
      } else {
        ctx.font = `800 ${40 * Math.min(this.boost, 1.5)}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(this.mode === "run" ? `DEPTH ${this.level + 1}` : `LEVEL ${s.world + 1}-${s.index + 1}`, W / 2, this.h / 2 + 20);
        ctx.shadowBlur = 0;
        ctx.font = `600 ${18 * this.boost}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffb199";
        ctx.fillText(this.mode === "run" ? WORLDS[s.world].name : s.name, W / 2, this.h / 2 + 20 + 30 * this.boost);
      }
      ctx.shadowBlur = 0;
      ctx.font = `italic 500 ${14 * this.boost}px system-ui, sans-serif`;
      ctx.fillStyle = "#ff9a7a";
      ctx.fillText(`♪ ${TRACKS[s.track % TRACKS.length].name}`, W / 2, this.h / 2 + 20 + 56 * this.boost);
      ctx.globalAlpha = 1;
    }
    if (this.phase === "ready" && this.banner <= 0.6) {
      ctx.font = `600 ${15 * this.boost}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(this.time * 4)})`;
      ctx.fillText(this.touch ? "Tap to launch" : "Click or press Space to launch", W / 2, this.paddleY - 40);
    }
  }

  /** Rank letter, name and gauge in the top-right corner, plus a big callout on rank-ups. */
  private drawStyleMeter(ctx: CanvasRenderingContext2D) {
    if (this.phase === "title") return;
    const st = this.style;
    if (st.value <= 0 && st.pop <= 0) return;
    const rank = RANKS[st.rank];
    const b = Math.min(this.boost, 1.5);
    const x = W - 14;
    const y = 14;
    const pop = 1 + st.pop * 0.35;
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.font = `italic 900 ${30 * b}px Georgia, 'Times New Roman', serif`;
    ctx.shadowColor = rank.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = rank.color;
    ctx.fillText(rank.letter, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = `italic 700 ${10 * b}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,240,230,0.85)";
    ctx.fillText(`${rank.name.toUpperCase()} ×${rank.mult}`, x, y + 34 * b);
    // Gauge.
    const gw = 96 * b;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - gw, y + 48 * b, gw, 4 * b);
    ctx.fillStyle = rank.color;
    ctx.fillRect(x - gw, y + 48 * b, gw * st.gauge, 4 * b);
    ctx.restore();
    // Big centred callout right after a rank-up.
    if (this.rankBanner > 0 && st.lastUp && st.rank > 0) {
      const a = Math.min(1, this.rankBanner);
      const grow = 1 + (1.4 - this.rankBanner) * 0.15;
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.textAlign = "center";
      ctx.translate(W / 2, this.h * 0.36);
      ctx.scale(grow, grow);
      ctx.font = `italic 900 ${34 * b}px Georgia, 'Times New Roman', serif`;
      ctx.shadowColor = rank.color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = rank.color;
      ctx.fillText(`${rank.name.toUpperCase()}!`, 0, 0);
      ctx.restore();
    }
  }

  private drawBossBar(ctx: CanvasRenderingContext2D) {
    const bs = this.boss!;
    const b = Math.min(this.boost, 1.4);
    const w = 300 * b;
    const x = W / 2 - w / 2;
    const y = 14;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${11 * b}px system-ui, sans-serif`;
    ctx.fillStyle = "#ffd8c8";
    ctx.fillText(bs.spec.name.toUpperCase(), W / 2, y + 2);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y + 8, w, 8 * b);
    const frac = bs.hp / bs.maxHp;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#ff2a1a");
    g.addColorStop(1, "#ffb347");
    ctx.fillStyle = g;
    ctx.fillRect(x, y + 8, w * frac, 8 * b);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (const t of [0.33, 0.66]) ctx.fillRect(x + w * t, y + 8, 1.5, 8 * b);
    if (!this.bossExposed) {
      ctx.font = `600 ${9 * b}px system-ui, sans-serif`;
      ctx.fillStyle = "#c8ccd8";
      ctx.fillText("Break the shield ring to expose its weak point", W / 2, y + 8 + 8 * b + 11 * b);
    }
    ctx.restore();
  }

  private drawBossLayer(ctx: CanvasRenderingContext2D) {
    const bs = this.boss!;
    if (bs.dead) return;
    drawBoss(ctx, {
      world: bs.spec.world,
      x: bs.x,
      y: bs.y,
      rx: bs.rx,
      ry: bs.ry,
      hp: bs.hp,
      maxHp: bs.maxHp,
      phase: bs.phase,
      flash: bs.flash,
      exposed: this.bossExposed,
      mouth: bs.mouth,
      lookX: this.paddle.x,
      time: this.time,
      dying: bs.dying,
      reduced: this.reduced,
    });
  }

  private drawHazards(ctx: CanvasRenderingContext2D) {
    for (const s of this.shots) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2.2);
      g.addColorStop(0, "#fff6d0");
      g.addColorStop(0.35, s.color);
      g.addColorStop(1, "rgba(255,40,20,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const beam of this.beams) {
      if (beam.warn > 0) {
        // Telegraph: a flickering red column where the beam will land.
        const a = 0.15 + 0.15 * Math.abs(Math.sin(this.time * 20));
        ctx.fillStyle = `rgba(255,40,30,${a})`;
        ctx.fillRect(beam.x - 18, 0, 36, this.h);
        ctx.strokeStyle = "rgba(255,90,60,0.7)";
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(beam.x - 18, 0, 36, this.h);
        ctx.setLineDash([]);
      } else {
        const g = ctx.createLinearGradient(beam.x - 24, 0, beam.x + 24, 0);
        g.addColorStop(0, "rgba(255,40,20,0)");
        g.addColorStop(0.5, "rgba(255,240,220,0.95)");
        g.addColorStop(1, "rgba(255,40,20,0)");
        ctx.fillStyle = g;
        ctx.fillRect(beam.x - 24, 0, 48, this.h);
      }
    }
    // Stunned paddle: electric crackle.
    if (this.stun > 0) {
      const p = this.paddle;
      ctx.strokeStyle = "rgba(170,220,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        let x = p.x - p.w / 2;
        ctx.moveTo(x, this.paddleY + 3 + k * 4);
        while (x < p.x + p.w / 2) {
          x += 8;
          ctx.lineTo(x, this.paddleY + 3 + k * 4 + (Math.random() - 0.5) * 10);
        }
      }
      ctx.stroke();
    }
  }

  private drawBrick(ctx: CanvasRenderingContext2D, b: Brick) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (b.type === "portal") {
      this.drawPortal(ctx, b, cx, cy);
      return;
    }
    const theme = LEVEL_THEMES[this.stage.theme];
    const skinType = b.type === "regen" || b.type === "shooter" ? "normal" : b.type;
    const img = this.skins.get(theme, skinType, b.color, b.variant, b.w, b.h, this.renderScale);
    ctx.drawImage(img, b.x - SKIN_PAD, b.y - SKIN_PAD, b.w + SKIN_PAD * 2, b.h + SKIN_PAD * 2);

    // Beat pulse.
    if (this.beatPulse && this.beat > 0.05 && !this.reduced) {
      ctx.fillStyle = `rgba(255,255,255,${this.beat * 0.08})`;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    if ((b.type === "strong" || b.type === "shooter") && b.hp < b.maxHp) {
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

    // Regenerating: a turning life rune.
    if (b.type === "regen" && !b.regrown) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.time * 2);
      ctx.strokeStyle = "rgba(150,255,210,0.85)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(150,255,210,0.9)";
      ctx.beginPath();
      ctx.moveTo(6, -3);
      ctx.lineTo(9, 1);
      ctx.lineTo(3, 1);
      ctx.fill();
      ctx.restore();
    }

    // Shooter: a glaring eye that charges before it fires.
    if (b.type === "shooter") {
      const charge = clamp(1 - (b.cool ?? 3) / 1.2, 0, 1);
      ctx.fillStyle = "#120404";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6 + charge * 4);
      eg.addColorStop(0, "#ffffff");
      eg.addColorStop(0.4, `rgba(255,60,40,${0.6 + 0.4 * charge})`);
      eg.addColorStop(1, "rgba(255,40,20,0)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + charge * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (b.flash > 0) {
      ctx.fillStyle = `rgba(${b.flashColor},${b.flash * 0.6})`;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();
    }
  }

  private drawPortal(ctx: CanvasRenderingContext2D, b: Brick, cx: number, cy: number) {
    ctx.save();
    ctx.translate(cx, cy);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, b.w * 0.55);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.3, "#b48aff");
    g.addColorStop(0.7, "rgba(80,20,180,0.6)");
    g.addColorStop(1, "rgba(40,0,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.w * 0.55, b.h * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(this.time * 3);
    ctx.strokeStyle = "rgba(220,200,255,0.8)";
    ctx.lineWidth = 1.3;
    for (let k = 0; k < 3; k++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, b.w * 0.42, b.h * 0.45, 0, 0, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Ghost outlines of regenerating bricks, filling in as they grow back. */
  private drawRegrowing(ctx: CanvasRenderingContext2D) {
    for (const b of this.bricks) {
      if (b.alive || b.type !== "regen" || b.regrow === undefined) continue;
      const k = 1 - b.regrow / 6;
      ctx.strokeStyle = `rgba(150,255,210,${0.15 + 0.35 * k})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(150,255,210,${0.12 * k})`;
      ctx.fillRect(b.x + 1, b.y + b.h - 1 - (b.h - 2) * k, b.w - 2, (b.h - 2) * k);
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
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(d.x - w / 2 + h * 0.3, d.y - h / 2 + 2, w - h * 0.6, h * 0.28, h * 0.14);
    ctx.fill();
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
    const giant = Boolean(this.timers.giant);
    drawBall(ctx, LEVEL_THEMES[this.stage.theme], {
      x: ball.x,
      y: ball.y,
      vx: ball.vx,
      vy: ball.vy,
      r: (giant ? GIANT_R : BALL_R) * 1.2 * Math.min(this.boost, 1.4),
      trail: ball.trail,
      time: this.time,
      fire: Boolean(this.timers.fire),
      fast: Boolean(this.timers.fast),
      reduced: this.reduced,
      seed: i * 1.37,
    });
    // Lightning crackle around the ball while Chain Lightning is active.
    if (this.timers.lightning && !this.reduced) {
      const r = (giant ? GIANT_R : BALL_R) * 1.9;
      ctx.strokeStyle = "rgba(170,230,255,0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * Math.PI * 2 + this.time * 9;
        const rr = r * (0.85 + Math.random() * 0.35);
        if (k) ctx.lineTo(ball.x + Math.cos(a) * rr, ball.y + Math.sin(a) * rr);
        else ctx.moveTo(ball.x + Math.cos(a) * rr, ball.y + Math.sin(a) * rr);
      }
      ctx.stroke();
    }
  }
}
