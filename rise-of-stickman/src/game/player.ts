// The Horseman: movement, katana combo, dual revolvers with gun-spin reload, shadow dash,
// perfect parry → execution, Crimson Cyclone special, Wrath form and the charged Ground Splitter.
import * as THREE from "three";
import {
  AIM,
  AIM_UPPER,
  CHARGE,
  DASH,
  EXECUTE_KEYS,
  GAIT_HERO,
  HURT,
  IDLE,
  PARRY,
  RELOAD_UPPER,
  SPLITTER_KEYS,
  WRATH_ROAR,
  gait,
  type SlashDef,
  type SlashFx,
} from "./anims";
import { WEAPONS, type WeaponDef, type WeaponId } from "./weapons";
import type { Element } from "./boons";
import type { Game } from "./game";
import { Ghost, GlaiveChain, HeroModel } from "./hero";
import { addPose, sampleClip, type Pose } from "./rig";
import type { AttackOpts, AttackResult, Target } from "./types";

type State = "move" | "slash" | "dash" | "parry" | "parryRecover" | "execute" | "hurt" | "wrathIntro" | "charge" | "splitter" | "falling" | "dead";

const SPEED = 7.4;
export const MAG = 8;
const RELOAD = 1.25;
const PERFECT_LO = 0.5;
const PERFECT_HI = 0.72;

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export const ELEMENT_RGB: Record<Element, THREE.Color> = {
  fire: new THREE.Color(3, 0.9, 0.2),
  ice: new THREE.Color(0.6, 1.8, 3),
  lightning: new THREE.Color(3, 2.6, 0.6),
  shadow: new THREE.Color(1.6, 0.5, 3),
};

export function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Player {
  readonly model = new HeroModel();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  hp = 100;
  maxHp = 100;
  /** Extra lives left this run (Death Defiance). */
  defiance = 1;
  defianceMax = 1;
  wrath = 0;
  wrathT = 0;
  state: State = "move";
  st = 0;
  private slashDef: SlashDef | null = null;
  private combo = 0;
  private sinceSlash = 9;
  private buffered = false;
  private hitsDone = 0;
  private hitIds = new Set<number>();
  private spin = 0;
  dashCharges = 2;
  dashMax = 2;
  private dashRecharge = 0;
  private dashDir = new THREE.Vector3();
  private lastDashEnd = -9;
  private dashPassed = new Set<number>();
  iframes = 0;
  ammo = MAG;
  reloadT = 0;
  reloading = false;
  private reloadTried = false;
  perfectShots = 0;
  private fireT = 0;
  private hand = 0;
  private shots = 0;
  gunModeT = 0;
  private recoil = [0, 0];
  private gunSpin = 0;
  private barrageT = 0;
  specialCd = 0;
  get specialMax() {
    return this.w.specialCd;
  }
  /** Equipped melee weapon. */
  w: WeaponDef = WEAPONS.katana;
  private chain: GlaiveChain;
  /** Arc of the current glaive swing (for the disc on its chain). */
  private arcFrame: { c: THREE.Vector3; x: THREE.Vector3; z: THREE.Vector3; sweep: number; radius: number } | null = null;
  /** The thrown glaive (special): flies between enemies, then back to the hand. */
  private thrown: { pos: THREE.Vector3; target: Target | null; aim: THREE.Vector3; hit: Set<number>; left: number; back: boolean; t: number } | null = null;
  private discSpin = 0;
  /** Falling into the abyss: drop below the platform, and where to come back to. */
  private fallY = 0;
  private fallVy = 0;
  private knockFall = false;
  private readonly safePos = new THREE.Vector3();
  private parryLen = 0.2;
  private execTarget: Target | null = null;
  private execFrom = new THREE.Vector3();
  private execTo = new THREE.Vector3();
  private phase = 0;
  private ghosts: Ghost[] = [];
  private ghostT = 0;
  private chargeT = 0;
  private wrathFxT = 0;
  private auxT = 0;
  readonly aim = new THREE.Vector3();
  private moveDir = new THREE.Vector3();
  private time = 0;
  private game: Game;
  private glow: THREE.PointLight;

  constructor(game: Game) {
    this.game = game;
    game.scene.add(this.model.rig.root);
    for (const s of this.model.scarves) game.scene.add(s.mesh);
    // Soft warm light that follows the hero so he reads against the dark floor.
    this.glow = new THREE.PointLight(0xffb48a, 9, 7, 1.6);
    game.scene.add(this.glow);
    this.chain = new GlaiveChain(new THREE.Color(0.6, 0.7, 1));
    game.scene.add(this.chain.group);
    for (let i = 0; i < 14; i++) {
      const g = new Ghost(this.model.rig);
      this.ghosts.push(g);
      game.scene.add(g.group);
    }
  }

  get rig() {
    return this.model.rig;
  }

  setWeapon(id: WeaponId) {
    this.w = WEAPONS[id];
    this.model.setMelee(id);
    this.combo = 0;
    this.thrown = null;
    this.model.setGlaiveOut(false);
    this.chain.hide();
  }
  get alive() {
    return this.state !== "dead";
  }
  get inWrath() {
    return this.wrathT > 0;
  }
  get dashing() {
    return this.state === "dash";
  }

  spawn(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.state = "move";
    this.st = 0;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = yaw;
    this.rig.setPose(IDLE);
    this.fallY = 0;
    this.safePos.set(x, 0, z);
    this.rig.snap();
    this.rig.root.updateMatrixWorld(true);
    this.anchor(v1);
    for (const s of this.model.scarves) s.reset(v1);
  }

  private anchor(out: THREE.Vector3) {
    return this.rig.worldOf("spine", out, v2.set(0, 0.55, -0.07));
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────────────
  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const mods = g.mods;
    this.time += dt;
    this.st += dt;
    this.sinceSlash += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.gunModeT = Math.max(0, this.gunModeT - dt);
    this.recoil[0] *= Math.exp(-dt * 18);
    this.recoil[1] *= Math.exp(-dt * 18);
    this.dashMax = mods.dashCharges;
    if (this.dashCharges < this.dashMax) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= 0.85) {
        this.dashRecharge = 0;
        this.dashCharges++;
      }
    } else {
      this.dashCharges = this.dashMax;
      this.dashRecharge = 0;
    }
    if (this.wrathT > 0) {
      this.wrathT -= dt;
      this.wrathAura(dt);
      if (this.wrathT <= 0) this.endWrath();
    }

    // Screen-relative movement → world (camera looks from +X+Z toward the origin).
    const mx = input.move.x;
    const my = input.move.y;
    this.moveDir.set((mx - my) * Math.SQRT1_2, 0, (-mx - my) * Math.SQRT1_2);
    const moving = this.moveDir.lengthSq() > 0.01;
    this.updateAim();

    // Reload runs in the background of every state.
    this.updateReload(dt);

    switch (this.state) {
      case "move":
        this.stMove(dt, moving);
        break;
      case "slash":
        this.stSlash(dt);
        break;
      case "dash":
        this.stDash(dt);
        break;
      case "parry":
        this.rig.setPose(PARRY);
        this.friction(dt, 30);
        if (this.st >= this.parryLen) this.enter("parryRecover");
        break;
      case "parryRecover":
        this.rig.setPose(PARRY);
        this.friction(dt, 30);
        if (this.st >= 0.26) this.enter("move");
        break;
      case "execute":
        this.stExecute(dt);
        break;
      case "hurt":
        this.rig.setPose(HURT);
        this.friction(dt, 8);
        if (this.st > 0.12 && input.pressed.has("dash")) this.startDash();
        else if (this.st >= 0.3) this.enter("move");
        break;
      case "wrathIntro":
        this.stWrathIntro();
        break;
      case "charge":
        this.stCharge(dt);
        break;
      case "splitter":
        this.rig.setPose(sampleClip(SPLITTER_KEYS, this.st));
        this.friction(dt, 20);
        if (this.st >= 0.45) this.enter("move");
        break;
      case "falling":
        this.stFall(dt);
        break;
      case "dead":
        this.friction(dt, 6);
        break;
    }

    // Integrate + collide. Dashes and big knockback can carry the hero over the open edge.
    this.pos.addScaledVector(this.vel, dt);
    if (this.state !== "falling" && this.state !== "dead") {
      const canFall = this.state === "dash" || (this.state === "slash" && this.slashDef === this.w.dash) || (this.state === "hurt" && this.knockFall);
      g.room.resolve(this.pos, 0.4, canFall);
      if (g.room.overVoid(this.pos)) this.startFall();
      else if (!g.room.nearVoid(this.pos, 1.4) && this.state !== "hurt") this.safePos.copy(this.pos);
    }

    // Model.
    const root = this.rig.root;
    root.position.copy(this.pos);
    root.position.y += this.fallY;
    root.rotation.y = this.yaw + this.spin;
    this.glow.position.set(this.pos.x + 1.2, 3.2, this.pos.z + 1.2);
    this.glow.color.setHex(this.inWrath ? 0xff6a20 : 0xffb48a);
    this.glow.intensity = this.inWrath ? 30 : 9;
    const sc = this.inWrath ? 1.3 : 1;
    this.rig.body.scale.setScalar(this.rig.body.scale.x + (sc - this.rig.body.scale.x) * Math.min(1, dt * 8));
    const rate = this.state === "slash" || this.state === "execute" || this.state === "splitter" ? 45 : this.state === "dash" ? 40 : 20;
    this.rig.update(dt, rate);
    // Revolver spin while reloading; recoil kick.
    const spinning = this.reloading;
    this.gunSpin = spinning ? this.gunSpin + dt * 34 : this.gunSpin * Math.exp(-dt * 30);
    this.model.guns[0].group.rotation.x = this.gunSpin;
    this.model.guns[1].group.rotation.x = -this.gunSpin;
    this.model.setWeapon(this.gunModeT > 0 && this.state !== "slash" && this.state !== "execute" && this.state !== "parry" ? "guns" : "sword");
    root.updateMatrixWorld(true);
    // Scarf.
    this.anchor(v1);
    const back = v2.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(0.6).addScaledVector(this.vel, -0.12);
    for (const s of this.model.scarves) s.update(dt, v1, back, g.camera.position, this.time + (s === this.model.scarves[1] ? 1.3 : 0), sc);
    for (const gh of this.ghosts) gh.update(dt);
    // Blade glow during attacks.
    const attacking = this.state === "slash" || this.state === "execute";
    this.model.setGlow(attacking ? 1.6 : this.inWrath ? 1.2 : 0.25);
    this.updateGlaive(dt);
  }

  private enter(s: State) {
    this.state = s;
    this.st = 0;
    if (s !== "slash" && s !== "dash") this.spin = 0;
  }

  private friction(dt: number, k: number) {
    this.vel.multiplyScalar(Math.exp(-dt * k));
  }

  private updateAim() {
    const g = this.game;
    if (g.input.touch) {
      // Auto-target: the nearest enemy, preferring ones in front.
      let best: Target | null = null;
      let bestScore = 1e9;
      for (const t of g.targets()) {
        const dx = t.pos.x - this.pos.x;
        const dz = t.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 16) continue;
        const ang = Math.abs(angDiff(Math.atan2(dx, dz), this.yaw));
        const score = d + ang * 3;
        if (score < bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (best) this.aim.set(best.pos.x, 0, best.pos.z);
      else if (this.moveDir.lengthSq() > 0.01) this.aim.copy(this.pos).addScaledVector(this.moveDir, 5);
      else this.aim.set(this.pos.x + Math.sin(this.yaw) * 5, 0, this.pos.z + Math.cos(this.yaw) * 5);
    } else this.aim.copy(g.mouseGround);
  }

  private aimYaw() {
    return Math.atan2(this.aim.x - this.pos.x, this.aim.z - this.pos.z);
  }

  private turnTo(target: number, dt: number, rate: number) {
    const d = angDiff(target, this.yaw);
    const step = rate * dt;
    this.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
  }

  /** Face the best melee target near the aim direction. */
  private meleeAssist() {
    let yaw = this.aimYaw();
    let best = 99;
    for (const t of this.game.targets()) {
      const dx = t.pos.x - this.pos.x;
      const dz = t.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) - t.radius;
      if (d > 4.2) continue;
      const a = Math.atan2(dx, dz);
      const off = Math.abs(angDiff(a, yaw));
      if (off > 1.1) continue;
      const score = d + off * 2;
      if (score < best) {
        best = score;
        yaw = a;
      }
    }
    this.yaw = yaw;
  }

  // ── States ──────────────────────────────────────────────────────────────────────────
  private stMove(dt: number, moving: boolean) {
    const g = this.game;
    const input = g.input;
    const speed = SPEED * (this.inWrath ? 1.15 : 1) * (this.gunModeT > 0 ? 0.8 : 1);
    v1.copy(this.moveDir).multiplyScalar(speed);
    const k = 1 - Math.exp(-dt * 14);
    this.vel.x += (v1.x - this.vel.x) * k;
    this.vel.z += (v1.z - this.vel.z) * k;
    const shooting = input.held.has("shoot");
    if (shooting || this.gunModeT > 0) this.turnTo(this.aimYaw(), dt, 22);
    else if (moving) this.turnTo(Math.atan2(this.moveDir.x, this.moveDir.z), dt, 16);

    // Actions (priority order).
    if (input.pressed.has("wrath") && this.wrath >= 100 && !this.inWrath) return this.startWrath();
    if (input.pressed.has("dash") && this.dashCharges > 0) return this.startDash();
    if (input.pressed.has("parry")) return this.startParry();
    if (this.thrown) {
      if (input.pressed.has("attack")) this.thrown.back = true;
    } else if (input.pressed.has("special") && this.specialCd <= 0) return this.startSlash(this.w.special);

    if (input.pressed.has("attack") && !this.thrown) {
      if (this.time - this.lastDashEnd < 0.22) return this.startSlash(this.w.dash);
      const next = this.sinceSlash < 0.5 ? (this.combo + 1) % this.w.combo.length : 0;
      return this.startSlash(this.w.combo[next], next);
    }
    if (input.held.has("attack") && g.loadout.moves.has("splitter") && this.sinceSlash < 0.6 && this.sinceSlash > 0.05) {
      if (performance.now() - input.attackDownAt > 380) return this.enter("charge");
    }
    if (input.pressed.has("reload")) this.tryReload();
    if (shooting) this.shoot(dt);

    // Pose.
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const k01 = Math.min(1, sp / SPEED);
    this.phase += dt * (6 + sp * 1.25);
    let pose: Pose;
    if (this.gunModeT > 0) {
      const upper = this.reloading ? RELOAD_UPPER : AIM_UPPER;
      pose = k01 > 0.1 ? { ...gait(this.phase, k01 * 0.8, { ...GAIT_HERO, lean: 0.15 }), ...upper } : { ...AIM, ...upper };
      pose = addPose(pose, { armR: [this.recoil[0], 0, 0], armL: [this.recoil[1], 0, 0] });
    } else if (k01 > 0.12) {
      pose = { ...gait(this.phase, k01, GAIT_HERO), ...this.w.runUpper };
    } else {
      const b = Math.sin(this.time * 2.2) * 0.04;
      pose = addPose(this.w.idle, { spine: [b, 0, 0], armL: [b * 2, 0, 0], y: b * 0.3 });
    }
    this.rig.setPose(pose);
  }

  private startSlash(def: SlashDef, comboIdx = -1) {
    const g = this.game;
    if (comboIdx >= 0) this.combo = comboIdx;
    if (def === this.w.special) {
      this.specialCd = this.specialMax;
      g.audio.special();
    }
    this.slashDef = def;
    this.hitsDone = 0;
    this.hitIds.clear();
    this.buffered = false;
    this.gunModeT = 0;
    this.spin = 0;
    this.enter("slash");
    if (def !== this.w.dash) this.meleeAssist();
    else {
      // Rift Cut goes the way you were dashing (or aiming).
      this.yaw = this.dashDir.lengthSq() > 0 ? Math.atan2(this.dashDir.x, this.dashDir.z) : this.aimYaw();
      this.iframes = 0.2;
    }
    this.vel.set(0, 0, 0);
    this.rig.setPose(def.keys[0].pose);
    this.arcFrame = def.style === "chain" ? this.frameOf(def.fx) : null;
  }

  /** Centre and basis of a swing arc (same maths as fx.slash). */
  private frameOf(f: SlashFx) {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(fwd, f.roll);
    if (f.left) n.negate();
    const x = fwd.clone().applyAxisAngle(n, f.sweep >= Math.PI * 1.9 ? 0 : f.sweep / 2 + (f.offset ?? 0)).normalize();
    const z = new THREE.Vector3().crossVectors(x, n).normalize();
    return { c: new THREE.Vector3(this.pos.x, f.height, this.pos.z), x, z, sweep: f.sweep, radius: f.radius * (this.inWrath ? 1.3 : 1) };
  }

  private stSlash(dt: number) {
    const def = this.slashDef!;
    const g = this.game;
    const input = g.input;
    const speedMul = this.inWrath ? 1.15 : 1;
    const t = this.st * speedMul;
    this.rig.setPose(sampleClip(def.keys, t));
    // Lunge forward during the strike.
    const lungeT = def === this.w.dash ? 0.14 : 0.16;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (def.travel) {
      if (this.moveDir.lengthSq() > 0.01) this.turnTo(Math.atan2(this.moveDir.x, this.moveDir.z), dt, 5);
      this.vel.set(Math.sin(this.yaw) * def.travel, 0, Math.cos(this.yaw) * def.travel);
    } else if (t < lungeT) {
      const sp = (def.lunge / lungeT) * (def === this.w.dash ? 1 : 1.6 * (1 - t / lungeT));
      this.vel.set(fx * sp, 0, fz * sp);
    } else this.friction(dt, 24);
    if (def.spin) {
      const u = Math.min(1, Math.max(0, (t - def.hitAt * 0.6) / (def.dur * 0.75)));
      this.spin = def.spin * (1 - (1 - u) * (1 - u));
    }
    // Rift Cut: hit everything we pass through.
    if (def === this.w.dash && def.style !== "lash") {
      if (this.st < 0.02) {
        this.swingSound(def);
        v1.set(this.pos.x, 1.1, this.pos.z);
        v2.set(this.pos.x + fx * def.lunge, 1.1, this.pos.z + fz * def.lunge);
        g.fx.beam(v1, v2, this.slashColor(), 0.06, 0.25);
        this.moveFx(def);
      }
      if (t < lungeT + 0.03) this.hitAround(def, 1.5, true);
    } else {
      const n = def.hits ?? 1;
      while (this.hitsDone < n) {
        const at = def.hitAt + (n > 1 ? ((def.span ?? 0) * this.hitsDone) / (n - 1) : 0);
        if (t < at) break;
        if (this.hitsDone === 0 || def.repeatFx) {
          if (this.hitsDone === 0) this.swingSound(def);
          this.moveFx(def);
        }
        if (this.hitsDone > 0) this.hitIds.clear();
        if (def.style === "throw") this.throwDisc();
        else this.hitAround(def, def.range, false);
        this.hitsDone++;
      }
    }
    if (this.st > 0.05 && input.pressed.has("attack")) this.buffered = true;
    // Cancels.
    if (t >= def.cancelAt * 0.6 && input.pressed.has("dash") && this.dashCharges > 0) return this.startDash();
    if (t >= def.hitAt && input.pressed.has("parry")) return this.startParry();
    if (this.buffered && t >= def.cancelAt && this.w.combo.includes(def) && def !== this.w.combo[this.w.combo.length - 1]) {
      const next = this.w.combo.indexOf(def) + 1;
      this.sinceSlash = 0;
      return this.startSlash(this.w.combo[next], next);
    }
    if (t >= def.dur) {
      this.sinceSlash = this.buffered && def === this.w.combo[this.w.combo.length - 1] ? 9 : 0;
      if (def === this.w.combo[this.w.combo.length - 1] || def === this.w.special || def === this.w.dash) this.combo = this.w.combo.length - 1; // next press restarts at 0
      this.spin = 0;
      this.enter("move");
      if (this.buffered && (def === this.w.combo[this.w.combo.length - 1] || def === this.w.dash || def === this.w.special)) {
        this.sinceSlash = 9;
        this.startSlash(this.w.combo[0], 0);
      }
    }
  }

  private slashColor() {
    if (this.inWrath) return new THREE.Color(1.5, 0.35, 0.06);
    const el = this.game.loadout.slots.blade?.element;
    if (el) return ELEMENT_RGB[el].clone().multiplyScalar(0.32);
    return this.w.trail.clone();
  }

  private swingSound(def: SlashDef) {
    const g = this.game;
    if (this.w.sound === "punch") g.audio.punch(!!def.heavy);
    else if (this.w.sound === "chain") g.audio.chainWhip(!!def.heavy);
    else g.audio.slash(!!def.heavy);
  }

  /** What a move looks like when it lands. */
  private moveFx(def: SlashDef) {
    const g = this.game;
    const col = this.slashColor();
    switch (def.style) {
      case "slam": {
        const at = v1.set(this.pos.x + Math.sin(this.yaw) * 0.7, 0.05, this.pos.z + Math.cos(this.yaw) * 0.7);
        g.fx.ring(at, 0.3, def.range + 0.4, new THREE.Color(1.3, 0.55, 0.15), 0.4);
        g.fx.smoke(at, new THREE.Color(0.12, 0.09, 0.07), 10, 1.0, 0.5);
        g.fx.sparks(v2.set(at.x, 0.3, at.z), new THREE.Color(1.6, 0.7, 0.2), 16, 6);
        g.fx.decal(at.x, at.z, def.range * 0.6, new THREE.Color(0.04, 0.03, 0.025));
        g.audio.boom(def.dmg > 30 ? 1.2 : 0.8);
        g.shake(def.dmg > 30 ? 0.4 : 0.25);
        return;
      }
      case "punch": {
        this.arc(def.fx);
        this.rig.root.updateMatrixWorld(true);
        const fist = this.rig.worldOf(def.hand === "L" ? "handL" : "handR", v1, v2.set(0, -0.12, 0));
        g.fx.ring(fist, 0.05, 0.7, new THREE.Color(1.2, 0.6, 0.2), 0.15);
        return;
      }
      case "lash": {
        this.rig.root.updateMatrixWorld(true);
        const hand = this.rig.worldOf("handR", v1);
        const end = v2.set(this.pos.x + Math.sin(this.yaw) * def.range, 1.1, this.pos.z + Math.cos(this.yaw) * def.range);
        g.fx.beam(hand, end, col, 0.04, 0.18);
        return;
      }
      case "throw":
        return;
      default:
        this.arc(def.fx);
        if (def.fx2) this.arc(def.fx2);
    }
  }

  // ── Glaive ─────────────────────────────────────────────────────────────────────────
  private throwDisc() {
    const g = this.game;
    this.rig.root.updateMatrixWorld(true);
    const from = this.rig.worldOf("handR", new THREE.Vector3());
    const aim = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 9, 1.1, this.pos.z + Math.cos(this.yaw) * 9);
    this.thrown = { pos: from, target: this.nextDiscTarget(from, new Set(), 13, true), aim, hit: new Set(), left: 5, back: false, t: 0 };
    this.model.setGlaiveOut(true);
    g.audio.chainWhip(true);
  }

  private nextDiscTarget(from: THREE.Vector3, hit: Set<number>, range: number, ahead = false) {
    let best: Target | null = null;
    let bd = range;
    for (const t of this.game.targets()) {
      if (hit.has(t.id)) continue;
      const d = Math.hypot(t.pos.x - from.x, t.pos.z - from.z);
      if (ahead && Math.abs(angDiff(Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z), this.yaw)) > 1.0) continue;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Glaive disc and chain: thrown, mid-swing, or resting in the hand. */
  private updateGlaive(dt: number) {
    if (this.w.id !== "glaive") {
      this.chain.hide();
      return;
    }
    const g = this.game;
    this.discSpin += dt * 28;
    this.rig.root.updateMatrixWorld(true);
    const hand = this.rig.worldOf("handR", v1, v2.set(0, -0.15, 0)).clone();
    const th = this.thrown;
    if (th) {
      th.t += dt;
      if (th.t > 3) th.back = true;
      if (!th.back && th.target && !th.target.alive) th.target = this.nextDiscTarget(th.pos, th.hit, 9);
      const dest = th.back ? hand : th.target ? v2.set(th.target.pos.x, th.target.chest + th.target.air, th.target.pos.z) : th.aim;
      const d = th.pos.distanceTo(dest);
      const step = (th.back ? 30 : 26) * dt;
      th.pos.addScaledVector(v1.subVectors(dest, th.pos).normalize(), Math.min(d, step));
      if (Math.random() < dt * 40) g.fx.sparks(th.pos, this.slashColor(), 1, 2);
      if (th.back) {
        // Cuts on the way home too.
        for (const t of g.targets())
          if (!th.hit.has(t.id) && Math.hypot(t.pos.x - th.pos.x, t.pos.z - th.pos.z) < t.radius + 0.5) {
            th.hit.add(t.id);
            this.discHit(t, th.pos);
          }
        if (th.pos.distanceTo(hand) < 0.6) {
          this.thrown = null;
          this.model.setGlaiveOut(false);
          this.chain.hide();
          g.audio.reload();
          return;
        }
      } else if (d < 0.5 + (th.target ? th.target.radius : 0)) {
        if (th.target) {
          th.hit.add(th.target.id);
          this.discHit(th.target, th.pos);
          th.left--;
          th.target = th.left > 0 ? this.nextDiscTarget(th.pos, th.hit, 9) : null;
          if (!th.target) th.back = true;
        } else th.back = true;
      }
      this.chain.show(hand, th.pos, this.discSpin);
      return;
    }
    const def = this.slashDef;
    if (this.state === "slash" && def && (def.style === "chain" || def.style === "lash")) {
      const t = this.st;
      const out = Math.max(0.02, def.hitAt - 0.07);
      const ret = def.hitAt + 0.08;
      let at: THREE.Vector3;
      if (def.style === "lash") {
        const reach = def.range * (this.inWrath ? 1.3 : 1);
        const k = t < def.hitAt ? t / def.hitAt : Math.max(0, 1 - (t - def.hitAt) / Math.max(0.05, def.dur * 0.7 - def.hitAt));
        const tip = v2.set(this.pos.x + Math.sin(this.yaw) * reach, 1.1, this.pos.z + Math.cos(this.yaw) * reach);
        at = hand.clone().lerp(tip, k);
      } else if (this.arcFrame) {
        const f = this.arcFrame;
        const P = (u: number) => {
          const th2 = u * f.sweep;
          return new THREE.Vector3().copy(f.x).multiplyScalar(Math.cos(th2) * f.radius).addScaledVector(f.z, Math.sin(th2) * f.radius).add(f.c);
        };
        if (t < out) at = hand.clone().lerp(P(0), t / out);
        else if (t < ret) at = P((t - out) / (ret - out));
        else at = P(1).lerp(hand, Math.min(1, (t - ret) / Math.max(0.05, def.dur * 0.8 - ret)));
      } else at = hand;
      if (at.distanceTo(hand) > 0.3) {
        this.model.setGlaiveOut(true);
        this.chain.show(hand, at, this.discSpin);
        return;
      }
    }
    this.model.setGlaiveOut(false);
    this.chain.hide();
  }

  private discHit(t: Target, at: THREE.Vector3) {
    const g = this.game;
    const dir = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
    g.damage(t, {
      dmg: this.w.special.dmg * g.mods.dmg * (this.inWrath ? 1.8 : 1),
      dir,
      kind: "special",
      move: "ricochet",
      knock: this.w.special.knock,
      heavy: true,
      element: this.inWrath ? "fire" : g.loadout.slots.blade?.element ?? null,
      at: at.clone(),
    });
    g.fx.sparks(at, this.slashColor(), 10, 5);
  }

  private arc(f: SlashDef["fx"]) {
    const fwd = v1.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(fwd, f.roll);
    if (f.left) n.negate();
    const start = fwd.clone().applyAxisAngle(n, f.sweep >= Math.PI * 1.9 ? 0 : f.sweep / 2 + (f.offset ?? 0));
    const c = new THREE.Vector3(this.pos.x, f.height, this.pos.z);
    const scale = this.inWrath ? 1.3 : 1;
    this.game.fx.slash(c, start, n, f.sweep, f.radius * scale, this.slashColor(), { width: (f.width ?? 0.8) * 0.55 * scale, dur: 0.2 });
  }

  private hitAround(def: SlashDef, range: number, path: boolean) {
    const g = this.game;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const mods = g.mods;
    const r = range * (this.inWrath ? 1.3 : 1);
    for (const t of g.targets()) {
      if (this.hitIds.has(t.id)) continue;
      const dx = t.pos.x - this.pos.x;
      const dz = t.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - t.radius > r) continue;
      if (!path && def.cone < Math.PI && d > 0.9) {
        const off = Math.abs(angDiff(Math.atan2(dx, dz), this.yaw));
        if (off > def.cone) continue;
      }
      this.hitIds.add(t.id);
      const dir = d > 0.01 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(fx, 0, fz);
      if (def.cone >= Math.PI && !path) dir.lerp(new THREE.Vector3(fx, 0, fz), 0.2).normalize();
      let dmg = def.dmg * mods.dmg * (this.inWrath ? 1.8 : 1);
      if (def.airBonus && t.air > 0.3) dmg *= def.airBonus;
      let crit = false;
      if (Math.random() < 0.18 * g.loadout.power("shadow_blade")) {
        dmg *= 2;
        crit = true;
      }
      const execute =
        def === this.w.combo[this.w.combo.length - 1] && g.loadout.moves.has("executioner") && !t.isBoss && t.hp < t.maxHp * 0.3;
      g.damage(t, {
        dmg,
        dir,
        kind: def === this.w.special ? "special" : "blade",
        move: def.id,
        knock: def.knock,
        launch: def.launch,
        heavy: def.heavy,
        element: this.inWrath ? "fire" : g.loadout.slots.blade?.element ?? null,
        crit,
        execute,
        at: new THREE.Vector3(t.pos.x - dir.x * t.radius * 0.5, t.chest + t.air, t.pos.z - dir.z * t.radius * 0.5),
      });
    }
    // Cut enemy projectiles out of the air.
    g.cutProjectiles(this.pos, r);
  }

  // ── Dash ────────────────────────────────────────────────────────────────────────────
  private startDash() {
    const g = this.game;
    this.dashCharges--;
    this.dashDir.copy(this.moveDir.lengthSq() > 0.01 ? this.moveDir : v1.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))).normalize();
    this.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.iframes = 0.24;
    this.dashPassed.clear();
    this.spin = 0;
    this.enter("dash");
    this.rig.setPose(DASH);
    g.audio.dash();
    this.ghostT = 0;
    this.spawnGhost(0.7);
    g.fx.smoke(this.pos, new THREE.Color(0.02, 0.02, 0.03), 5, 0.6, 0.6);
    if (g.loadout.has("shadow_dash")) g.inkClone(this.pos.clone());
  }

  private stDash(dt: number) {
    const g = this.game;
    const DUR = 0.17;
    const sp = 6.6 / DUR;
    this.vel.copy(this.dashDir).multiplyScalar(sp);
    this.rig.setPose(DASH);
    this.ghostT += dt;
    if (this.ghostT > 0.03) {
      this.ghostT = 0;
      this.spawnGhost(0.5);
    }
    // Things we pass through.
    for (const t of g.targets()) {
      if (this.dashPassed.has(t.id)) continue;
      if (Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < t.radius + 0.8) {
        this.dashPassed.add(t.id);
        g.dashThrough(t, this.dashDir);
      }
    }
    if (g.loadout.has("fire_dash") && Math.random() < dt * 40) g.firePatch(this.pos.clone());
    if (g.input.pressed.has("attack") && !this.thrown) {
      this.lastDashEnd = this.time;
      return this.startSlash(this.w.dash);
    }
    if (this.st >= DUR) {
      this.lastDashEnd = this.time;
      this.vel.multiplyScalar(0.25);
      this.enter("move");
    }
  }

  private spawnGhost(op: number) {
    const gh = this.ghosts.find((x) => !x.live) ?? this.ghosts[0];
    const col = this.inWrath ? new THREE.Color(1.4, 0.25, 0.02) : new THREE.Color(0.01, 0.01, 0.02);
    this.rig.root.updateMatrixWorld(true);
    gh.capture(this.rig, col, op, 0.4);
  }

  // ── Parry / execution ───────────────────────────────────────────────────────────────
  private startParry() {
    this.parryLen = 0.2 * this.game.mods.parryWindow;
    this.gunModeT = 0;
    this.enter("parry");
    this.rig.setPose(PARRY);
    this.game.audio.parryStance();
  }

  /** Called by attackers; decides how an incoming attack resolves. */
  receive(src: Target | null, srcPos: THREE.Vector3, dmg: number, o: AttackOpts): AttackResult {
    const g = this.game;
    if (this.state === "dead" || this.state === "falling") return "dodged";
    if (this.state === "parry" && o.parryable) {
      this.onParry(src, srcPos);
      return "parried";
    }
    if (this.state === "execute" || this.state === "wrathIntro") return "dodged";
    if (this.iframes > 0) {
      if (this.state === "dash" || this.time - this.lastDashEnd < 0.12) {
        if (o.kind !== "projectile" || Math.random() < 0.5) g.perfectDodge(this.pos);
        return "perfect";
      }
      return "dodged";
    }
    // Take the hit.
    const taken = dmg * g.mods.taken * g.dmgScale * (this.inWrath ? 0.6 : 1);
    this.hp -= taken;
    g.onPlayerHurt(taken);
    this.iframes = 0.35;
    if (this.hp <= 0) {
      if (this.defiance > 0) {
        // Death Defiance: rise again with 40% health.
        this.defiance--;
        this.hp = Math.round(this.maxHp * 0.4);
        this.iframes = 1.6;
        this.vel.set(0, 0, 0);
        this.enter("move");
        g.onDefiance(this.pos);
        return "hit";
      }
      this.hp = 0;
      this.enter("dead");
      g.onPlayerDeath();
      return "hit";
    }
    if (!this.inWrath) {
      const d = v1.subVectors(this.pos, srcPos).setY(0).normalize();
      this.vel.copy(d).multiplyScalar(o.knock ?? 6);
      this.gunModeT = 0;
      this.knockFall = (o.knock ?? 6) >= 9;
      this.enter("hurt");
    }
    return "hit";
  }

  // ── The abyss ───────────────────────────────────────────────────────────────────────
  private startFall() {
    const g = this.game;
    this.enter("falling");
    this.fallY = 0;
    this.fallVy = 2.2;
    this.gunModeT = 0;
    this.reloading = false;
    this.thrown = null;
    this.model.setGlaiveOut(false);
    g.audio.hurt();
    g.shake(0.15);
  }

  private stFall(dt: number) {
    const g = this.game;
    this.fallVy -= 26 * dt;
    this.fallY += this.fallVy * dt;
    this.vel.x *= Math.exp(-dt * 1.2);
    this.vel.z *= Math.exp(-dt * 1.2);
    this.spin += dt * 2.5;
    // Flailing as he drops.
    const f = Math.sin(this.time * 18);
    this.rig.setPose({ y: 0, spine: [-0.3, 0, f * 0.15], head: [-0.5, 0, 0], armR: [-2.6 + f * 0.6, 0, -0.8], foreR: [-0.6, 0, 0], armL: [-2.6 - f * 0.6, 0, 0.8], foreL: [-0.6, 0, 0], thighR: [-0.9 + f * 0.5, 0, -0.2], shinR: [1.2, 0, 0], thighL: [-0.9 - f * 0.5, 0, 0.2], shinL: [1.2, 0, 0] });
    if (this.st < 0.9 && Math.random() < dt * 20) g.fx.embers(v1.set(this.pos.x, this.fallY + 0.5, this.pos.z), 1, 0.6);
    if (this.st < 1.15) return;
    // The fall counts as a death.
    this.fallY = 0;
    this.spin = 0;
    this.vel.set(0, 0, 0);
    if (this.defiance > 0) {
      this.defiance--;
      this.hp = Math.max(this.hp, Math.round(this.maxHp * 0.4));
      this.pos.copy(this.safePos);
      this.iframes = 1.6;
      this.enter("move");
      g.toast("THE ABYSS SPITS YOU BACK", "#c06bff");
      g.onDefiance(this.pos);
      return;
    }
    this.hp = 0;
    this.fallY = -20;
    this.enter("dead");
    g.toast("LOST TO THE ABYSS", "#c06bff");
    g.onPlayerDeath();
  }

  private onParry(src: Target | null, srcPos: THREE.Vector3) {
    const g = this.game;
    g.onParry(this.pos, srcPos);
    if (src && src.alive) {
      this.execTarget = src;
      this.execFrom.copy(this.pos);
      const d = v1.subVectors(this.pos, src.pos).setY(0).normalize();
      this.execTo.copy(src.pos).addScaledVector(d, src.radius + 0.9);
      this.yaw = Math.atan2(-d.x, -d.z);
      this.hitIds.clear();
      this.hitsDone = 0;
      this.enter("execute");
      src.parried();
    } else {
      this.enter("parryRecover");
      this.st = 0.15;
    }
  }

  private stExecute(dt: number) {
    const g = this.game;
    const t = this.execTarget;
    this.rig.setPose(sampleClip(EXECUTE_KEYS, this.st));
    if (this.st < 0.12) {
      const u = this.st / 0.12;
      this.pos.lerpVectors(this.execFrom, this.execTo, u);
      this.vel.set(0, 0, 0);
      if (Math.random() < 0.6) this.spawnGhost(0.4);
    }
    const marks = [0.18, 0.28, 0.42];
    while (this.hitsDone < marks.length && this.st >= marks[this.hitsDone]) {
      const last = this.hitsDone === marks.length - 1;
      if (t && t.alive) {
        const d = v1.subVectors(t.pos, this.pos).setY(0).normalize();
        this.yaw = Math.atan2(d.x, d.z);
        const fwd = d.clone();
        const roll = [0.2, -0.3, -1.45][this.hitsDone];
        const n = UP.clone().applyAxisAngle(fwd, roll);
        if (this.hitsDone !== 1) n.negate();
        g.fx.slash(new THREE.Vector3(this.pos.x, 1.1, this.pos.z), fwd.clone().applyAxisAngle(n, 1.3), n, 2.6, 2.4, this.slashColor(), { width: 0.7 });
        g.audio.slash(last);
        g.damage(t, {
          dmg: (t.isBoss ? 40 : last ? 999 : 20) * g.mods.dmg,
          dir: d,
          kind: "execute",
          move: "execute",
          knock: last ? 10 : 1,
          heavy: true,
          execute: last && !t.isBoss,
          element: g.loadout.slots.blade?.element ?? null,
          at: new THREE.Vector3(t.pos.x, t.chest + t.air, t.pos.z),
        });
      }
      this.hitsDone++;
    }
    if (this.st >= 0.62) {
      this.execTarget = null;
      this.enter("move");
    }
  }

  // ── Guns ────────────────────────────────────────────────────────────────────────────
  private shoot(dt: number) {
    const g = this.game;
    this.gunModeT = 0.75;
    if (this.reloading) return;
    this.fireT -= dt;
    if (this.fireT > 0) return;
    if (this.ammo <= 0) {
      this.tryReload();
      return;
    }
    this.fireT = 0.13;
    this.ammo--;
    this.shots++;
    const hand = this.hand;
    this.hand ^= 1;
    this.recoil[hand] = 0.5;
    const perfect = this.perfectShots > 0;
    if (perfect) this.perfectShots--;
    const lightning = g.loadout.has("lightning_guns") && this.shots % 4 === 0;
    this.rig.root.updateMatrixWorld(true);
    const muzzle = this.model.guns[hand].muzzle.getWorldPosition(new THREE.Vector3());
    const yaw = this.aimYaw() + (Math.random() - 0.5) * 0.05;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    g.audio.gun(perfect);
    g.fx.flash(muzzle, perfect ? new THREE.Color(3, 2.2, 0.6) : new THREE.Color(3, 1.6, 0.5), 0.7, 0.06);
    g.fx.casing(muzzle, dir.x, dir.z);
    g.shake(0.05);
    g.fireBullet(muzzle, dir, {
      dmg: (perfect ? 6 : 4) * g.mods.dmg * (this.inWrath ? 1.8 : 1),
      pierce: lightning || g.loadout.has("shadow_guns"),
      lightning,
      perfect,
    });
    if (this.ammo <= 0) this.tryReload();
  }

  private tryReload() {
    const g = this.game;
    if (this.reloading) {
      // Active reload: a well-timed press finishes instantly with boosted rounds.
      if (this.reloadTried) return;
      this.reloadTried = true;
      if (this.reloadT >= PERFECT_LO && this.reloadT <= PERFECT_HI) {
        this.reloading = false;
        this.ammo = MAG;
        this.perfectShots = MAG;
        g.onPerfectReload(this.pos);
      } else {
        this.reloadT -= 0.35;
        g.audio.jam();
      }
      return;
    }
    if (this.ammo >= MAG) return;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadTried = false;
    this.gunModeT = Math.max(this.gunModeT, RELOAD + 0.2);
    g.audio.reload();
  }

  private updateReload(dt: number) {
    if (!this.reloading) return;
    const g = this.game;
    this.reloadT += dt;
    this.gunModeT = Math.max(this.gunModeT, 0.3);
    if ((g.input.pressed.has("reload") || g.input.pressed.has("shoot")) && this.reloadT > 0.05) this.tryReload();
    if (g.loadout.moves.has("barrage") && this.reloadT < 0.8) {
      this.barrageT += dt;
      while (this.barrageT > 0.05) {
        this.barrageT -= 0.05;
        for (let k = 0; k < 2; k++) {
          const a = this.time * 9 + k * Math.PI;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          g.fireBullet(new THREE.Vector3(this.pos.x, 1.15, this.pos.z).addScaledVector(dir, 0.4), dir, { dmg: 4 * g.mods.dmg, pierce: false, lightning: false, perfect: false, quiet: true });
        }
      }
    }
    if (this.reloadT >= RELOAD) {
      this.reloading = false;
      this.ammo = MAG;
    }
  }

  get reloadInfo() {
    return { t: this.reloading ? this.reloadT : -1, dur: RELOAD, lo: PERFECT_LO, hi: PERFECT_HI };
  }

  // ── Wrath ───────────────────────────────────────────────────────────────────────────
  private startWrath() {
    const g = this.game;
    this.wrath = 0;
    this.gunModeT = 0;
    this.vel.set(0, 0, 0);
    this.enter("wrathIntro");
    this.rig.setPose(WRATH_ROAR);
    g.onWrathStart(this.pos);
  }

  private stWrathIntro() {
    const g = this.game;
    this.rig.setPose(WRATH_ROAR);
    if (this.st >= 0.32 && this.wrathT <= 0) {
      this.wrathT = g.mods.wrathDur;
      this.model.setWrath(true);
      g.onWrathBurst(this.pos);
    }
    if (this.st > 0.6) this.enter("move");
  }

  private wrathAura(dt: number) {
    const g = this.game;
    this.wrathFxT += dt;
    while (this.wrathFxT > 0.02) {
      this.wrathFxT -= 0.02;
      const bones = ["head", "handR", "handL", "shinL", "shinR", "spine"] as const;
      const b = bones[(Math.random() * bones.length) | 0];
      this.rig.worldOf(b, v1);
      g.fx.fire(v1, 1, 0.2, 0.8);
    }
    this.auxT += dt;
    if (this.auxT >= 0.4) {
      this.auxT = 0;
      const pyre = g.loadout.power("fire_aux");
      if (pyre)
        for (const t of g.targets())
          if (Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < 3 + t.radius)
            g.damage(t, { dmg: 6 * pyre, dir: new THREE.Vector3(), kind: "element", move: "pyre", element: "fire", proc: true });
      if (g.loadout.has("lightning_aux")) g.lightningStrike(this.pos, 9);
    }
  }

  private endWrath() {
    this.wrathT = 0;
    this.model.setWrath(false);
    this.game.fx.smoke(this.pos, new THREE.Color(0.1, 0.05, 0.03), 10, 1, 0.5);
  }

  // ── Ground Splitter ─────────────────────────────────────────────────────────────────
  private stCharge(dt: number) {
    const g = this.game;
    this.chargeT = this.st;
    this.friction(dt, 20);
    this.turnTo(this.aimYaw(), dt, 10);
    this.rig.setPose(CHARGE);
    this.rig.worldOf("handR", v1);
    if (Math.random() < dt * 30) g.fx.sparks(v1, this.slashColor(), 1, 2);
    if (!g.input.held.has("attack")) {
      if (this.chargeT > 0.35) {
        this.enter("splitter");
        g.splitter(this.pos, this.yaw, this.slashColor());
      } else this.enter("move");
    }
    if (g.input.pressed.has("dash")) this.startDash();
  }
}
