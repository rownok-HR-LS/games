// Mid-floor mini-boss: THE PIT BUTCHER, a giant armoured Minotaur warlord with a cleaver arm,
// fighting alongside his Hell Hounds.
//   Cleave  wide parryable sweep (red glint)      Slam  overhead slam + expanding shockwave
//   Charge  barrels across the room, stuns itself on walls      Enraged below 35%: faster, calls more hounds
import * as THREE from "three";
import { Creature, type CreatureSpec } from "./creatures";
import type { Game } from "./game";
import { angDiff } from "./player";
import type { Hit, Target } from "./types";
import { glow } from "./world";

type Atk = "cleave" | "slam" | "charge" | "summon";
type State = "intro" | "walk" | "windup" | "strike" | "recover" | "stagger" | "crashed" | "dead";

const SPEC: CreatureSpec = {
  key: "minotaur",
  height: 4.2,
  yaw: 0,
  glow: [0.22, 0.02, 0.01],
  clips: { idle: { name: "Warrior_Idle" }, move: { name: "Warrior_Walk" } },
};

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

export class Butcher implements Target {
  readonly id = 9998;
  readonly c = new Creature(SPEC);
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly radius = 1.4;
  readonly chest = 2.6;
  readonly isBoss = true;
  readonly final = false;
  readonly name = "The Pit Butcher";
  readonly title = "Keeper of the Bone Pits";
  hp: number;
  maxHp: number;
  alive = true;
  air = 0;
  yaw = Math.PI / 4;
  state: State = "intro";
  st = 0;
  atk: Atk = "cleave";
  private cd = 1;
  private struck = false;
  private poise = 220;
  private flashT = 0;
  private speed01 = 0;
  private enraged = false;
  private summoned = 0;
  private tel: ReturnType<Game["fx"]["telegraph"]> | null = null;
  private target = new THREE.Vector3();
  private chargeDir = new THREE.Vector3();
  private ringR = -1;
  private ringHit = false;
  private ringAt = new THREE.Vector3();
  private glintSprite: THREE.Sprite;
  private glintT = 0;
  private glintOn = false;
  private cleaver: THREE.Group;
  private pads: THREE.Mesh[] = [];
  private burnT = 0;
  private burnDps = 0;
  private chillT = 0;
  private game: Game;

  constructor(game: Game, x: number, z: number) {
    this.game = game;
    this.hp = this.maxHp = 1700 * game.hpScale;
    this.pos.set(x, 0, z);
    this.c.root.position.copy(this.pos);
    this.c.root.rotation.y = this.yaw;
    this.c.play("idle", { fade: 0 });
    game.scene.add(this.c.root);
    // A cleaver the size of a door, and bone pauldrons; placed on the bones every frame.
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2626, metalness: 0.85, roughness: 0.35, emissive: new THREE.Color(0.35, 0.02, 0.01) });
    this.cleaver = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 1.9), steel);
    blade.position.z = 1.1;
    blade.castShadow = true;
    this.cleaver.add(blade);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 1.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.4, 0.15) }));
    edge.position.set(0, -0.38, 1.1);
    this.cleaver.add(edge);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x2a1408 }));
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.05;
    this.cleaver.add(handle);
    game.scene.add(this.cleaver);
    const bone = new THREE.MeshStandardMaterial({ color: 0x9c8f7c, roughness: 0.7 });
    for (let i = 0; i < 2; i++) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bone);
      pad.scale.set(1, 0.7, 1.2);
      pad.castShadow = true;
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), bone);
        sp.position.set((k - 1) * 0.16, 0.3, 0);
        pad.add(sp);
      }
      game.scene.add(pad);
      this.pads.push(pad);
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
      if (this.poise <= 0) this.stagger(2.2);
    }
    if (!this.enraged && this.hp < this.maxHp * 0.35) {
      this.enraged = true;
      this.game.toast("THE BUTCHER IS ENRAGED", "#ff3b3b");
      this.game.audio.growl(3);
    }
  }
  parried() {
    this.stagger(2);
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
    this.endAttack();
    this.poise = 220;
    this.state = "stagger";
    this.st = 2.2 - sec;
    this.game.audio.growl(2.5);
    this.game.toast("STAGGERED", "#ffd84a");
  }

  private die(h: Hit) {
    const g = this.game;
    this.alive = false;
    this.state = "dead";
    this.endAttack();
    for (const p of this.pads) g.addDebris(p, new THREE.Vector3((Math.random() - 0.5) * 6, 5, (Math.random() - 0.5) * 6), 0.2);
    g.addDebris(this.cleaver, new THREE.Vector3((Math.random() - 0.5) * 4, 6, (Math.random() - 0.5) * 4), 0.1);
    if (h.kind === "gun" || h.kind === "element" || h.kind === "dot" || h.kind === "reflect") g.collapseBody(this.c.root, h.dir, 0.9);
    else g.sliceCreature(this.c, h.dir);
    g.addCoins(80, this.pos);
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
    if (this.alive) {
      g.scene.remove(this.c.root);
      g.scene.remove(this.cleaver);
      for (const p of this.pads) g.scene.remove(p);
    }
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────────────
  update(dt: number) {
    const g = this.game;
    const p = g.player;
    this.updateRing(dt);
    if (!this.alive) return;
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.hp = Math.max(1, this.hp - this.burnDps * dt);
    }
    if (this.chillT > 0) this.chillT -= dt;
    const tdt = dt * (this.enraged ? 1.3 : 1) * (this.chillT > 0 ? 0.8 : 1);
    this.st += tdt;
    this.cd -= tdt;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(dx, dz);
    this.speed01 *= 0.92;
    const c = this.c;

    switch (this.state) {
      case "intro":
        this.yaw = toYaw;
        if (this.st > 0.4 && this.summoned === 0) this.summon();
        if (this.st > 2.4) this.enter("walk");
        break;
      case "walk": {
        this.turn(toYaw, tdt, 2);
        const want = dist > 3.4 ? 1 : 0;
        const sp = 3.4;
        const k = 1 - Math.exp(-tdt * 5);
        this.vel.x += (Math.sin(this.yaw) * sp * want - this.vel.x) * k;
        this.vel.z += (Math.cos(this.yaw) * sp * want - this.vel.z) * k;
        this.speed01 = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / sp);
        if (this.speed01 > 0.2) {
          c.play("move");
          c.setSpeed(0.8 + this.speed01 * 0.5);
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
      case "crashed":
        this.vel.multiplyScalar(0.88);
        c.play("idle", { speed: 0.4 });
        if (Math.random() < tdt * 5) g.fx.sparks(c.boneWorld("mixamorigHead", v1).add(v2.set(0, 0.6, 0)), new THREE.Color(3, 2.6, 0.6), 1, 2);
        if (this.st > 2.2) {
          this.enter("walk");
          this.cd = 0.3;
        }
        break;
    }

    this.pos.addScaledVector(this.vel, tdt);
    const r = g.room;
    const hitWall = Math.abs(this.pos.x) > r.hx - this.radius || Math.abs(this.pos.z) > r.hz - this.radius;
    r.resolve(this.pos, this.radius);
    if (hitWall && this.state === "strike" && this.atk === "charge") this.crash();
    const pd = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (pd < this.radius + 0.4 && pd > 1e-3 && !p.dashing) {
      p.pos.x = this.pos.x + ((p.pos.x - this.pos.x) / pd) * (this.radius + 0.4);
      p.pos.z = this.pos.z + ((p.pos.z - this.pos.z) / pd) * (this.radius + 0.4);
    }

    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yaw;
    c.update(tdt);
    this.poseArms();
    this.flashT -= dt;
    c.tint(this.flashT > 0 ? "flash" : this.enraged ? "burn" : "normal", g.time);
    this.placeProps();
    if (this.enraged && Math.random() < dt * 25) g.fx.fire(v1.set(this.pos.x + (Math.random() - 0.5) * 2, Math.random() * 4, this.pos.z + (Math.random() - 0.5) * 2), 1, 0.4, 1.1);
    if (this.glintOn) {
      this.glintT -= tdt;
      if (this.glintT <= 0) {
        const u = -this.glintT / 0.32;
        if (u < 0.05) g.audio.glint();
        this.glintSprite.position.copy(this.cleaverTip(v1));
        const s = Math.sin(Math.min(1, u) * Math.PI) * 2.6;
        this.glintSprite.scale.set(s, s, 1);
        this.glintSprite.visible = true;
        if (u >= 1) {
          this.glintOn = false;
          this.glintSprite.visible = false;
        }
      }
    }
  }

  private cleaverTip(out: THREE.Vector3) {
    return out.set(0, 0, 2).applyMatrix4(this.cleaver.matrixWorld);
  }

  /** Cleaver in the right fist (pointing along the forearm), pauldrons on the shoulders. */
  private placeProps() {
    const c = this.c;
    const hand = c.boneWorld("mixamorigRightHand", v1);
    const fore = c.boneWorld("mixamorigRightForeArm", v2);
    this.cleaver.position.copy(hand);
    this.cleaver.lookAt(v2.sub(hand).negate().add(hand));
    this.cleaver.updateMatrixWorld(true);
    const shoulders = ["mixamorigRightArm", "mixamorigLeftArm"];
    this.pads.forEach((p, i) => {
      c.boneWorld(shoulders[i], p.position);
      p.position.y += 0.05;
      p.rotation.set(0, this.yaw, i === 0 ? 0.4 : -0.4);
    });
  }

  /** Procedural arm work (the model's own clips are just idle and walk). */
  private poseArms() {
    const c = this.c;
    const R = c.bone("mixamorigRightArm");
    const L = c.bone("mixamorigLeftArm");
    const spine = c.bone("mixamorigSpine1");
    if (!R || !L || !spine) return;
    const W = this.wind(this.atk);
    const u = Math.min(1, this.st / W);
    const s = this.state;
    if (s === "intro") {
      R.rotateX(2.4 * Math.min(1, this.st));
      L.rotateX(2.4 * Math.min(1, this.st));
      spine.rotateX(-0.3);
    } else if (this.atk === "slam" && s === "windup") {
      R.rotateX(2.4 * u);
      L.rotateX(2.4 * u);
      spine.rotateX(-0.3 * u);
    } else if (this.atk === "slam" && (s === "strike" || (s === "recover" && this.st < 0.5))) {
      R.rotateX(0.7);
      L.rotateX(0.7);
      spine.rotateX(0.5);
    } else if (this.atk === "cleave" && s === "windup") {
      R.rotateX(1.5 * u);
      spine.rotateY(-0.9 * u);
    } else if (this.atk === "cleave" && (s === "strike" || (s === "recover" && this.st < 0.4))) {
      R.rotateX(1.4);
      spine.rotateY(0.9);
    } else {
      R.rotateX(0.35);
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

  private summon() {
    const g = this.game;
    this.summoned++;
    g.audio.growl(3);
    for (let i = 0; i < 2; i++) {
      const a = this.yaw + (i ? 1 : -1) * 1.2;
      g.spawnEnemy("hound", this.pos.x + Math.sin(a) * 4, this.pos.z + Math.cos(a) * 4);
    }
  }

  private choose(dist: number) {
    if (this.enraged && this.summoned < 2) return this.begin("summon");
    const opts: Atk[] = dist < 5 ? ["cleave", "cleave", "slam"] : dist < 9 ? ["slam", "charge", "cleave"] : ["charge"];
    this.begin(opts[(Math.random() * opts.length) | 0]);
  }

  private wind(a: Atk) {
    return { cleave: 0.65, slam: 0.95, charge: 0.8, summon: 0.8 }[a];
  }

  private begin(a: Atk) {
    const g = this.game;
    this.atk = a;
    this.enter("windup");
    this.vel.multiplyScalar(0.2);
    const W = this.wind(a);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.c.play("idle", { speed: 1.4 });
    if (a === "cleave") {
      this.glintOn = true;
      this.glintT = W - 0.32;
      this.tel = g.fx.telegraph("sector", this.pos, this.yaw, 4.6, 1.2, W, new THREE.Color(1.2, 0.08, 0.04));
    } else if (a === "slam") {
      this.target.set(this.pos.x + fx * 3, 0, this.pos.z + fz * 3);
      this.tel = g.fx.telegraph("circle", this.target, 0, 3.2, 0, W);
    } else if (a === "charge") {
      this.tel = g.fx.telegraph("rect", this.pos, this.yaw, 2.8, 22, W);
    }
  }

  private attackStep(dt: number, dist: number, toYaw: number) {
    const g = this.game;
    const p = g.player;
    const a = this.atk;
    const W = this.wind(a);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (this.state === "windup") {
      if (a === "cleave") {
        this.turn(toYaw, dt, 2.4);
        if (this.tel) {
          this.tel.mesh.rotation.y = this.yaw + Math.PI;
          this.tel.mesh.position.set(this.pos.x, 0.03, this.pos.z);
        }
      } else if (a === "slam") {
        this.turn(toYaw, dt, 1);
        this.target.set(this.pos.x + fx * 3, 0, this.pos.z + fz * 3);
        if (this.tel) this.tel.mesh.position.set(this.target.x, 0.03, this.target.z);
      } else if (a === "charge" && this.st < W * 0.7) {
        this.turn(toYaw, dt, 2.4);
        if (this.tel) {
          this.tel.mesh.rotation.y = this.yaw + Math.PI;
          this.tel.mesh.position.set(this.pos.x + fx * 11, 0.03, this.pos.z + fz * 11);
        }
      }
      if (this.st >= W) {
        this.enter("strike");
        if (a === "charge") {
          this.chargeDir.set(fx, 0, fz);
          this.c.play("move", { speed: 2.2 });
          g.audio.growl(2.5);
        }
        if (a === "summon") this.summon();
      }
      return;
    }
    if (this.state === "strike") {
      switch (a) {
        case "cleave":
          if (!this.struck && this.st > 0.05) {
            this.struck = true;
            g.audio.slash(true);
            g.fx.slash(v1.set(this.pos.x, 1.6, this.pos.z), v2.set(Math.sin(this.yaw - 1.2), 0, Math.cos(this.yaw - 1.2)), new THREE.Vector3(0, -1, 0), 2.4, 4.4, new THREE.Color(2, 0.3, 0.1), { width: 1.2, dur: 0.3 });
            const off = Math.abs(angDiff(toYaw, this.yaw));
            if (dist < 4.9 && off < 1.25) g.enemyAttack(this, 26, { parryable: true, kind: "melee", knock: 12 });
            g.shake(0.2);
          }
          if (this.st > 0.3) this.enter("recover");
          return;
        case "slam":
          if (!this.struck && this.st > 0.08) {
            this.struck = true;
            g.fx.ring(this.target, 0.5, 3.6, new THREE.Color(3, 1, 0.3), 0.4);
            g.fx.smoke(this.target, new THREE.Color(0.12, 0.08, 0.06), 14, 1.4, 0.6);
            g.fx.sparks(this.target, new THREE.Color(3, 1.2, 0.3), 24, 8);
            g.audio.boom(1.8);
            g.shake(0.6);
            if (Math.hypot(p.pos.x - this.target.x, p.pos.z - this.target.z) < 3.2) g.enemyAttack(this, 30, { parryable: false, kind: "aoe", knock: 14 });
            this.ringAt.copy(this.target);
            this.ringR = 3.2;
            this.ringHit = false;
          }
          if (this.st > 0.5) this.enter("recover");
          return;
        case "charge":
          this.vel.copy(this.chargeDir).multiplyScalar(17);
          if (!this.struck && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.radius + 0.7) {
            this.struck = true;
            g.enemyAttack(this, 28, { parryable: false, kind: "melee", knock: 15 });
          }
          if (Math.random() < 0.5) g.fx.smoke(v1.set(this.pos.x, 0.1, this.pos.z), new THREE.Color(0.1, 0.07, 0.05), 1, 1, 0.5);
          if (this.st > 1.4) this.enter("recover");
          return;
        case "summon":
          if (this.st > 0.5) this.enter("recover");
          return;
      }
    }
    // Recover.
    if (this.st >= (a === "charge" ? 0.6 : 0.55)) {
      this.endAttack();
      this.cd = (this.enraged ? 0.35 : 0.75) + Math.random() * 0.5;
      this.enter("walk");
    }
  }

  private crash() {
    const g = this.game;
    this.endAttack();
    this.vel.set(0, 0, 0);
    this.enter("crashed");
    g.audio.boom(2.2);
    g.shake(0.8);
    g.toast("CRASHED INTO THE WALL", "#ffd84a");
  }

  private updateRing(dt: number) {
    if (this.ringR < 0) return;
    const g = this.game;
    const p = g.player;
    this.ringR += dt * 12;
    g.fx.ring(this.ringAt, this.ringR - 0.1, this.ringR, new THREE.Color(3, 0.9, 0.25), 0.05);
    const d = Math.hypot(p.pos.x - this.ringAt.x, p.pos.z - this.ringAt.z);
    if (!this.ringHit && Math.abs(d - this.ringR) < 0.55) {
      this.ringHit = true;
      g.enemyAttack(this, 16, { parryable: false, kind: "aoe", knock: 8 });
    }
    if (this.ringR > 11) this.ringR = -1;
  }
}
