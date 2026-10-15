// Floor 1 boss: THE CHAINED CERBERUS, warden of the Bone Pits. A three-headed hell hound
// (Sketchfab model, see credits.ts) dragging spiked iron balls chained to its forepaws.
//   Phase 1  leaping bite (shockwave ring: dash through it), chain whirl, charge, parryable bite
//   Phase 2  (60%) chains ignite: adds fire breath from all three heads and summons Hell Hounds
//   Phase 3  (30%) frenzy: faster, bite-bite-leap combos
import * as THREE from "three";
import { Creature, type CreatureSpec } from "./creatures";
import type { Game } from "./game";
import { angDiff } from "./player";
import type { Hit, Target } from "./types";
import { glow } from "./world";

type Atk = "slam" | "sweep" | "charge" | "punch" | "breath" | "summon";
type State = "intro" | "walk" | "windup" | "strike" | "recover" | "stagger" | "crashed" | "dead";

const SPEC: CreatureSpec = {
  key: "cerberus",
  height: 4.4,
  yaw: 0,
  clips: {
    idle: { name: "CERBERUS@idleAggresive" },
    walk: { name: "CERBERUS@walk" },
    run: { name: "CERBERUS@run" },
    bite: { name: "CERBERUS@biteAggressive" },
    jump: { name: "CERBERUS@jumpBiteAggressive" },
    fire: { name: "CERBERUS@blowFireAggressive" },
    hit: { name: "CERBERUS@getHitAggressive" },
    death: { name: "CERBERUS@deathAggressive" },
    look: { name: "CERBERUS@idleLookAround" },
  },
};
const HEADS = ["CERBERUS__Head", "CERBERUS_L_HEAD", "CERBERUS_R_HEAD"];

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

export class Boss implements Target {
  readonly id = 9999;
  readonly c = new Creature(SPEC);
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly radius = 2.3;
  readonly chest = 2.4;
  readonly isBoss = true;
  readonly name = "The Chained Cerberus";
  readonly title = "Warden of the Bone Pits";
  readonly final = true;
  hp: number;
  maxHp: number;
  alive = true;
  air = 0;
  yaw = Math.PI / 4;
  state: State = "intro";
  st = 0;
  phase = 1;
  atk: Atk = "slam";
  cd = 1.2;
  private struck = false;
  private poise = 280;
  private flashT = 0;
  private speed01 = 0;
  private tel: ReturnType<Game["fx"]["telegraph"]> | null = null;
  private target = new THREE.Vector3();
  private chargeDir = new THREE.Vector3();
  private balls: { mesh: THREE.Mesh; pos: THREE.Vector3; vel: THREE.Vector3; chain: THREE.InstancedMesh; paw: string }[] = [];
  private ringR = -1;
  private ringHit = false;
  private ringAt = new THREE.Vector3();
  private sweepA = 0;
  private breathTick = 0;
  private combo = 0;
  private summonCd = 10;
  private glintSprite: THREE.Sprite;
  private glintT = 0;
  private glintOn = false;
  private burnT = 0;
  private burnDps = 0;
  private chillT = 0;
  private game: Game;

  constructor(game: Game, x: number, z: number) {
    this.game = game;
    this.hp = this.maxHp = 4200 * game.hpScale;
    this.pos.set(x, 0, z);
    const root = this.c.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    this.c.play("fire", { loop: false, fade: 0 });
    game.scene.add(root);
    const iron = new THREE.MeshStandardMaterial({ color: 0x2b2522, metalness: 0.85, roughness: 0.4, emissive: new THREE.Color(0, 0, 0) });
    for (const paw of ["CERBERUS__L_Hand", "CERBERUS__R_Hand"]) {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), iron);
      for (let k = 0; k < 12; k++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), iron);
        const d = new THREE.Vector3().randomDirection();
        sp.position.copy(d).multiplyScalar(0.6);
        sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        ball.add(sp);
      }
      ball.castShadow = true;
      const pos = new THREE.Vector3(x + (paw.includes("_L_") ? 2.5 : -2.5), 0.6, z + 2.5);
      ball.position.copy(pos);
      game.scene.add(ball);
      const chain = new THREE.InstancedMesh(new THREE.TorusGeometry(0.14, 0.045, 5, 10), iron, 28);
      chain.castShadow = true;
      chain.frustumCulled = false;
      game.scene.add(chain);
      this.balls.push({ mesh: ball, pos, vel: new THREE.Vector3(), chain, paw });
    }
    this.glintSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: new THREE.Color(4, 0.5, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.glintSprite.visible = false;
    game.scene.add(this.glintSprite);
  }

  // ── Target interface ────────────────────────────────────────────────────────────────
  takeHit(h: Hit) {
    if (!this.alive) return;
    let dmg = h.dmg;
    if (h.kind === "gun") dmg *= 0.6;
    if (this.state === "stagger" || this.state === "crashed") dmg *= 1.5;
    this.hp -= dmg;
    this.flashT = 0.06;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(h);
      return;
    }
    if (this.state !== "stagger" && this.state !== "crashed" && this.state !== "intro") {
      this.poise -= dmg * (h.heavy ? 1.5 : 1);
      if (this.poise <= 0) this.stagger(2.4);
    }
    const f = this.hp / this.maxHp;
    if (this.phase === 1 && f < 0.6) this.enterPhase(2);
    else if (this.phase === 2 && f < 0.3) this.enterPhase(3);
  }

  parried() {
    this.stagger(2.2);
  }
  chill() {
    this.chillT = 2;
  }
  freeze() {
    this.chillT = 2;
  }
  frozen() {
    return false;
  }
  ignite(dps: number, sec: number) {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnT = Math.max(this.burnT, sec);
  }

  private stagger(sec: number) {
    const g = this.game;
    this.endAttack();
    this.combo = 0;
    this.poise = 280 + this.phase * 40;
    this.state = "stagger";
    this.st = 2.4 - sec; // the stagger timer runs up to 2.4
    this.c.play("hit", { loop: false, restart: true });
    g.audio.growl(3);
    g.toast("STAGGERED", "#ffd84a");
    g.shake(0.3);
  }

  private enterPhase(p: number) {
    const g = this.game;
    this.phase = p;
    if (p === 2) {
      g.toast("THE CHAINS IGNITE", "#ff6a1a");
      for (const b of this.balls) (b.mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(1.6, 0.4, 0.05);
    }
    if (p === 3) {
      g.toast("CERBERUS IS FRENZIED", "#ff3b3b");
      g.audio.boom(1.5);
    }
    g.audio.growl(3);
  }

  private die(h: Hit) {
    const g = this.game;
    this.alive = false;
    this.state = "dead";
    this.endAttack();
    this.glintSprite.visible = false;
    for (const b of this.balls) b.vel.set((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4);
    if (h.kind === "gun" || h.kind === "element" || h.kind === "dot" || h.kind === "reflect") g.dieAnimated(this.c, h.dir);
    else g.sliceCreature(this.c, h.dir);
    g.onKill(this, h);
  }

  private endAttack() {
    if (this.tel) {
      this.game.fx.endTel(this.tel);
      this.tel = null;
    }
    this.glintOn = false;
    this.glintSprite.visible = false;
  }

  remove() {
    const g = this.game;
    g.scene.remove(this.glintSprite);
    for (const b of this.balls) {
      g.scene.remove(b.mesh);
      g.scene.remove(b.chain);
    }
    if (this.alive) g.scene.remove(this.c.root);
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────────────
  update(dt: number) {
    const g = this.game;
    const p = g.player;
    this.updateBalls(dt);
    this.updateRing(dt);
    if (!this.alive) return;
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.hp -= this.burnDps * dt;
      if (Math.random() < dt * 20) g.fx.fire(v1.set(this.pos.x, 1.5 + Math.random() * 2, this.pos.z), 1, 1.5, 1.4);
      if (this.hp <= 0) this.hp = 1;
    }
    if (this.chillT > 0) this.chillT -= dt;
    const speedMul = (this.phase === 3 ? 1.25 : 1) * (this.chillT > 0 ? 0.8 : 1);
    const tdt = dt * speedMul;
    this.st += tdt;
    this.cd -= tdt;
    this.summonCd -= tdt;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(dx, dz);
    this.speed01 *= 0.92;
    const c = this.c;

    switch (this.state) {
      case "intro":
        if (this.st > 0.7 && this.st < 2.3) this.breathFx(-0.7);
        if (this.st > 0.7 && this.st - tdt <= 0.7) {
          g.audio.growl(4);
          g.audio.chain();
          g.shake(0.5);
        }
        if (this.st > 2.6) this.enter("walk");
        break;
      case "walk": {
        this.turn(toYaw, tdt, 1.5);
        const want = dist > 5.5 ? 1 : 0;
        const sp = 3.2;
        const k = 1 - Math.exp(-tdt * 4);
        this.vel.x += (Math.sin(this.yaw) * sp * want - this.vel.x) * k;
        this.vel.z += (Math.cos(this.yaw) * sp * want - this.vel.z) * k;
        this.speed01 = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / sp);
        if (this.speed01 > 0.2) {
          c.play("walk");
          c.setSpeed(0.6 + this.speed01 * 0.6);
        } else c.play("idle");
        if (this.cd <= 0) this.choose(dist);
        break;
      }
      case "windup":
      case "strike":
      case "recover":
        this.attackStep(tdt, dist, toYaw);
        break;
      case "stagger":
        this.vel.multiplyScalar(0.9);
        if (c.progress() >= 1) c.play("look", { speed: 1.5 });
        if (Math.random() < tdt * 6) g.fx.sparks(c.boneWorld("CERBERUS__Head", v1).add(v2.set(0, 0.8, 0)), new THREE.Color(3, 2.6, 0.6), 1, 2);
        if (this.st > 2.4) {
          this.enter("walk");
          this.cd = 0.3;
        }
        break;
      case "crashed":
        this.vel.multiplyScalar(0.85);
        if (this.st > 2.2) {
          this.enter("walk");
          this.cd = 0.4;
        }
        break;
    }

    this.pos.addScaledVector(this.vel, tdt);
    const r = g.room;
    const lim = this.radius;
    const hitWall = Math.abs(this.pos.x) > r.hx - lim || Math.abs(this.pos.z) > r.hz - lim;
    r.resolve(this.pos, lim);
    if (hitWall && this.state === "strike" && this.atk === "charge") this.crash();
    const pd = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (pd < this.radius + 0.4 && pd > 1e-3 && !p.dashing) {
      p.pos.x = this.pos.x + ((p.pos.x - this.pos.x) / pd) * (this.radius + 0.4);
      p.pos.z = this.pos.z + ((p.pos.z - this.pos.z) / pd) * (this.radius + 0.4);
    }

    const root = c.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    c.update(tdt);
    this.flashT -= dt;
    c.tint(this.flashT > 0 ? "flash" : "normal", g.time);
    if (this.phase >= 2 && Math.random() < dt * 20) {
      const b = this.balls[(Math.random() * 2) | 0];
      g.fx.fire(b.pos, 1, 0.8, 1.2);
    }
    // Glint on the middle head before a parryable bite.
    if (this.glintOn) {
      this.glintT -= tdt;
      if (this.glintT <= 0) {
        const u = -this.glintT / 0.32;
        if (u < 0.05) g.audio.glint();
        c.boneWorld("CERBERUS__Head", v1);
        this.glintSprite.position.copy(v1);
        const s = Math.sin(Math.min(1, u) * Math.PI) * 3;
        this.glintSprite.scale.set(s, s, 1);
        this.glintSprite.visible = true;
        if (u >= 1) {
          this.glintOn = false;
          this.glintSprite.visible = false;
        }
      }
    }
  }

  /** Fire streaming from all three mouths (pitch < 0 aims up). */
  private breathFx(pitch: number, count = 1) {
    const g = this.game;
    const fwd = v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    for (const h of HEADS) {
      const m = this.c.boneWorld(h, v1).addScaledVector(fwd, 0.5);
      for (let i = 0; i < count; i++) {
        const sp = 9 + Math.random() * 4;
        g.fx.emit({
          x: m.x,
          y: m.y,
          z: m.z,
          vx: (fwd.x + (Math.random() - 0.5) * 0.35) * sp * Math.cos(pitch),
          vy: -Math.sin(pitch) * sp + (Math.random() - 0.5) * 2,
          vz: (fwd.z + (Math.random() - 0.5) * 0.35) * sp * Math.cos(pitch),
          color: new THREE.Color(1.1 + Math.random() * 0.5, 0.3 + Math.random() * 0.25, 0.05),
          alpha: 0.55,
          size: 0.22 + Math.random() * 0.22,
          grow: 0.7,
          life: 0.45 + Math.random() * 0.2,
          shrink: true,
          additive: true,
          drag: 1.2,
          gravity: -1.5,
        });
      }
    }
  }

  private enter(s: State) {
    this.state = s;
    this.st = 0;
    this.struck = false;
  }

  private turn(to: number, dt: number, rate: number) {
    const d = angDiff(to, this.yaw);
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  private choose(dist: number) {
    const opts: Atk[] = [];
    if (this.phase >= 2 && this.summonCd <= 0 && this.game.enemies.filter((e) => e.alive).length < 3) {
      this.summonCd = 16;
      return this.begin("summon");
    }
    if (this.combo > 0) {
      this.combo--;
      return this.begin(this.combo === 0 ? "slam" : "punch");
    }
    if (dist < 6) opts.push("punch", "punch", "slam", "sweep");
    else if (dist < 10) opts.push("slam", "sweep", "charge");
    else opts.push("charge", "charge");
    if (this.phase >= 2 && dist < 11) opts.push("breath", "breath");
    const a = opts[(Math.random() * opts.length) | 0];
    if (this.phase === 3 && a === "punch" && Math.random() < 0.6) this.combo = 2;
    this.begin(a);
  }

  private wind(a: Atk) {
    return { slam: 0.9, sweep: 0.95, charge: 0.85, punch: 0.62, breath: 0.85, summon: 1.1 }[a] / (this.phase === 3 ? 1.15 : 1);
  }

  private begin(a: Atk) {
    const g = this.game;
    this.atk = a;
    this.enter("windup");
    this.vel.multiplyScalar(0.2);
    const W = this.wind(a);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const c = this.c;
    c.play("idle", { speed: 1.6 });
    if (a === "slam") {
      this.target.set(this.pos.x + fx * 5, 0, this.pos.z + fz * 5);
      this.tel = g.fx.telegraph("circle", this.target, 0, 3.4, 0, W + 0.45);
    } else if (a === "sweep") {
      this.tel = g.fx.telegraph("circle", this.pos, 0, 7.8, 0, W, new THREE.Color(1.2, 0.08, 0.03));
      g.audio.chain();
    } else if (a === "charge") {
      this.tel = g.fx.telegraph("rect", this.pos, this.yaw, 3.6, 26, W);
    } else if (a === "punch") {
      this.glintOn = true;
      this.glintT = W - 0.32;
    } else if (a === "breath") {
      this.tel = g.fx.telegraph("sector", this.pos, this.yaw, 9, 0.55, W);
      g.audio.growl(4);
    } else if (a === "summon") {
      c.play("look", { speed: 2 });
      g.audio.growl(4);
    }
  }

  private attackStep(dt: number, dist: number, toYaw: number) {
    const g = this.game;
    const p = g.player;
    const a = this.atk;
    const W = this.wind(a);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const c = this.c;
    if (this.state === "windup") {
      if (a === "charge" && this.st < W * 0.7) {
        this.turn(toYaw, dt, 2.2);
        if (this.tel) {
          this.tel.mesh.rotation.y = this.yaw + Math.PI;
          this.tel.mesh.position.set(this.pos.x + Math.sin(this.yaw) * 13, 0.03, this.pos.z + Math.cos(this.yaw) * 13);
        }
      } else if (a === "punch" || a === "breath") {
        this.turn(toYaw, dt, a === "breath" ? 1.6 : 2.5);
        if (a === "breath" && this.tel) this.tel.mesh.rotation.y = this.yaw + Math.PI;
      }
      if (a === "slam" && this.tel) {
        this.turn(toYaw, dt, 0.8);
        this.target.set(this.pos.x + Math.sin(this.yaw) * 5, 0, this.pos.z + Math.cos(this.yaw) * 5);
        this.tel.mesh.position.set(this.target.x, 0.03, this.target.z);
      }
      if (this.st >= W) {
        this.enter("strike");
        if (a === "slam") c.play("jump", { loop: false, speed: 1.1, restart: true });
        if (a === "punch") c.play("bite", { loop: false, speed: 1.5, restart: true });
        if (a === "breath") c.play("fire", { loop: false, speed: 1, restart: true });
        if (a === "sweep") c.play("run", { speed: 1.4 });
        if (a === "charge") {
          this.chargeDir.set(fx, 0, fz);
          c.play("run", { speed: 1.3 });
          g.audio.growl(3);
        }
        if (a === "sweep") this.sweepA = this.yaw;
        if (a === "summon") {
          for (let i = 0; i < 3; i++) {
            const ang = this.yaw + (i - 1) * 1.1;
            g.spawnEnemy("hound", this.pos.x + Math.sin(ang) * 5, this.pos.z + Math.cos(ang) * 5);
          }
        }
      }
      return;
    }
    if (this.state === "strike") {
      switch (a) {
        case "slam": {
          // Leap onto the marked circle, then land with a shockwave.
          const LAND = 0.55;
          if (this.st < LAND) {
            const k = (5 - 1.2) / LAND;
            this.vel.set(fx * k, 0, fz * k);
          } else this.vel.multiplyScalar(0.6);
          if (!this.struck && this.st >= LAND) {
            this.struck = true;
            this.vel.set(0, 0, 0);
            if (this.tel) {
              g.fx.endTel(this.tel);
              this.tel = null;
            }
            g.fx.ring(this.target, 0.5, 4, new THREE.Color(3, 1, 0.3), 0.4);
            g.fx.smoke(this.target, new THREE.Color(0.12, 0.08, 0.06), 16, 1.6, 0.6);
            g.fx.sparks(this.target, new THREE.Color(3, 1.2, 0.3), 30, 9);
            for (let i = 0; i < 6; i++) g.fx.decal(this.target.x + (Math.random() - 0.5) * 3, this.target.z + (Math.random() - 0.5) * 3, 1.5, new THREE.Color(0.02, 0.015, 0.01));
            g.audio.boom(2);
            g.shake(0.7);
            if (Math.hypot(p.pos.x - this.target.x, p.pos.z - this.target.z) < 3.4) g.enemyAttack(this, 30, { parryable: false, kind: "aoe", knock: 14 });
            this.ringAt.copy(this.target);
            this.ringR = 3.4;
            this.ringHit = false;
          }
          if (this.st > 0.95) this.enter("recover");
          return;
        }
        case "sweep": {
          // Whirls on the spot, whipping a chained ball round in a wide circle.
          this.yaw += (dt * Math.PI * 3) / 1.1;
          this.sweepA = this.yaw;
          if (this.st < 1.1 && Math.random() < 0.3) g.audio.chain();
          if (this.st >= 1.1) this.enter("recover");
          return;
        }
        case "charge":
          this.vel.copy(this.chargeDir).multiplyScalar(19);
          if (!this.struck && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.radius + 0.8) {
            this.struck = true;
            g.enemyAttack(this, 32, { parryable: false, kind: "melee", knock: 16 });
          }
          if (Math.random() < 0.5) g.fx.smoke(v1.set(this.pos.x, 0.1, this.pos.z), new THREE.Color(0.1, 0.07, 0.05), 1, 1.2, 0.5);
          if (this.st > 1.5) {
            if (this.tel) {
              g.fx.endTel(this.tel);
              this.tel = null;
            }
            this.enter("recover");
          }
          return;
        case "punch":
          if (!this.struck && this.st > 0.3) {
            this.struck = true;
            const off = Math.abs(angDiff(toYaw, this.yaw));
            if (dist < 5.4 && off < 0.8) g.enemyAttack(this, 24, { parryable: true, kind: "melee", knock: 12 });
            g.audio.enemyAttack();
            g.shake(0.15);
            this.vel.set(fx * 6, 0, fz * 6);
          }
          if (this.st > 0.75) this.enter("recover");
          return;
        case "breath": {
          // Fire pours from all three heads into the marked cone.
          const on = this.st > 0.5 && this.st < 2.1;
          if (on) {
            this.breathFx(0.15, 2);
            this.breathTick -= dt;
            if (this.breathTick <= 0) {
              this.breathTick = 0.3;
              g.audio.burn();
              const off = Math.abs(angDiff(toYaw, this.yaw));
              if (dist < 9 && off < 0.55) g.enemyAttack(this, 9, { parryable: false, kind: "aoe", knock: 3 });
              if (Math.random() < 0.6) g.firePatch(v1.set(this.pos.x + fx * (3 + Math.random() * 5), 0, this.pos.z + fz * (3 + Math.random() * 5)).clone(), true);
            }
          }
          if (this.st > 2.3) {
            if (this.tel) {
              g.fx.endTel(this.tel);
              this.tel = null;
            }
            this.enter("recover");
          }
          return;
        }
        case "summon":
          if (this.st > 0.6) this.enter("recover");
          return;
      }
    }
    // Recover.
    if (c.current === "run") c.play("idle");
    const rec = a === "charge" ? 0.6 : a === "punch" ? (this.combo > 0 ? 0.15 : 0.45) : 0.7;
    if (this.st >= rec) {
      if (this.tel) {
        g.fx.endTel(this.tel);
        this.tel = null;
      }
      this.cd = (this.phase === 3 ? 0.35 : 0.8) + Math.random() * 0.6;
      if (this.combo > 0) this.cd = 0;
      this.enter("walk");
    }
  }

  private crash() {
    const g = this.game;
    if (this.tel) {
      g.fx.endTel(this.tel);
      this.tel = null;
    }
    this.vel.set(0, 0, 0);
    this.enter("crashed");
    this.c.play("hit", { loop: false, restart: true });
    g.audio.boom(2.5);
    g.shake(0.9);
    g.toast("CRASHED INTO THE WALL", "#ffd84a");
    v1.copy(this.pos).addScaledVector(this.chargeDir, this.radius + 1);
    v1.y = 2.5;
    g.fx.smoke(v1, new THREE.Color(0.15, 0.1, 0.08), 20, 2, 0.6);
    g.fx.sparks(v1, new THREE.Color(3, 1.5, 0.4), 30, 10);
  }

  private updateRing(dt: number) {
    if (this.ringR < 0) return;
    const g = this.game;
    const p = g.player;
    this.ringR += dt * 13;
    g.fx.ring(this.ringAt, this.ringR - 0.1, this.ringR, new THREE.Color(3, 0.9, 0.25), 0.05);
    const d = Math.hypot(p.pos.x - this.ringAt.x, p.pos.z - this.ringAt.z);
    if (!this.ringHit && Math.abs(d - this.ringR) < 0.55) {
      this.ringHit = true;
      g.enemyAttack(this, 18, { parryable: false, kind: "aoe", knock: 8 });
    }
    if (this.ringR > 13) this.ringR = -1;
  }

  /** Iron balls chained to the forepaws: dragged when idle, whirled in the sweep. */
  private updateBalls(dt: number) {
    const g = this.game;
    this.c.root.updateMatrixWorld(true);
    const dummy = new THREE.Object3D();
    for (const [i, b] of this.balls.entries()) {
      const anchor = this.c.boneWorld(b.paw, v1);
      if (this.alive && this.state === "strike" && this.atk === "sweep" && i === 0) {
        const r = 6.8;
        b.pos.set(this.pos.x + Math.sin(this.sweepA) * r, 1.0, this.pos.z + Math.cos(this.sweepA) * r);
        const p = g.player;
        if (!this.struck && Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < 1.5) {
          this.struck = true;
          g.enemyAttack(this, 26, { parryable: false, kind: "melee", knock: 14 });
        }
        if (Math.random() < 0.5) g.fx.sparks(v2.set(b.pos.x, 0.2, b.pos.z), new THREE.Color(3, 1.4, 0.4), 1, 3);
        b.vel.set(0, 0, 0);
      } else {
        b.vel.y -= 25 * dt;
        b.pos.addScaledVector(b.vel, dt);
        if (b.pos.y < 0.6) {
          b.pos.y = 0.6;
          b.vel.y = 0;
          b.vel.x *= 0.8;
          b.vel.z *= 0.8;
        }
        const maxLen = 4.5;
        const d = b.pos.distanceTo(anchor);
        if (d > maxLen && this.alive) {
          const pull = v2.subVectors(anchor, b.pos).normalize();
          b.pos.addScaledVector(pull, d - maxLen);
          b.vel.addScaledVector(pull, (d - maxLen) * 10);
        }
      }
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += Math.hypot(b.vel.x, b.vel.z) * dt;
      const n = 28;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        v2.lerpVectors(anchor, b.pos, t);
        v2.y = Math.max(0.08, v2.y - Math.sin(t * Math.PI) * Math.max(0, 1.4 - anchor.distanceTo(b.pos) * 0.2));
        dummy.position.copy(v2);
        dummy.lookAt(b.pos);
        dummy.rotateY(Math.PI / 2);
        if (k % 2) dummy.rotateX(Math.PI / 2);
        dummy.updateMatrix();
        b.chain.setMatrixAt(k, dummy.matrix);
      }
      b.chain.instanceMatrix.needsUpdate = true;
    }
  }
}
