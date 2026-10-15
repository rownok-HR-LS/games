// Hellbeasts of the Bone Pits (animated models from Sketchfab, see credits.ts) and their projectiles.
//   Hell Hound          pack hunter: attack stance → lunging bite (parry on the red glint)
//   Blood Demon         winged caster that hovers at range and hurls hexfire (parry to reflect it)
//   Minotaur Berserker  armoured brute: overhead ground slam (dodge the red circle) and a parryable swipe
//   Cry Wolf            flesh horror that charges straight through you (parryable)
import * as THREE from "three";
import { Creature, type CreatureSpec } from "./creatures";
import type { Game } from "./game";
import { angDiff } from "./player";
import type { Hit, Target } from "./types";
import { glow } from "./world";

export type EnemyKind = "hound" | "imp" | "golem" | "mantis";

type Def = {
  hp: number;
  speed: number;
  radius: number;
  chest: number;
  color: number;
  dmg: number;
  poise: number;
  souls: number;
  coins: number;
  name: string;
  flying?: boolean;
};

export const DEFS: Record<EnemyKind, Def> = {
  hound: { hp: 55, speed: 5.6, radius: 0.6, chest: 0.9, color: 0xff3a2a, dmg: 14, poise: 0, souls: 4, coins: 3, name: "Hell Hound" },
  imp: { hp: 44, speed: 3.9, radius: 0.5, chest: 1.8, color: 0xff3050, dmg: 13, poise: 0, souls: 5, coins: 4, name: "Blood Demon", flying: true },
  golem: { hp: 270, speed: 2.5, radius: 0.95, chest: 1.9, color: 0xff7a1a, dmg: 30, poise: 90, souls: 12, coins: 9, name: "Minotaur Berserker" },
  mantis: { hp: 58, speed: 5.6, radius: 0.55, chest: 1.2, color: 0xff2a4a, dmg: 17, poise: 0, souls: 6, coins: 5, name: "Cry Wolf" },
};

export const SPECS: Record<EnemyKind, CreatureSpec> = {
  hound: {
    key: "hound",
    height: 1.6,
    yaw: Math.PI / 2,
    glow: [0.05, 0.005, 0.003],
    clips: {
      idle: { name: "IddleBreathing" },
      move: { name: "Walk" },
      windup: { name: "AttackStance" },
      strike: { name: "Roar" },
      hurt: { name: "IddleHeadShake" },
    },
  },
  imp: {
    key: "demon",
    height: 1.5,
    yaw: 0,
    lift: 0.75,
    clips: {
      idle: { name: "Demon_Idle", from: 0, to: 2.08 },
      move: { name: "Demon_Moving", from: 4.58, to: 5.21 },
      cast: { name: "Demon_Melee", from: 2.29, to: 4.17 },
      death: { name: "Demon_Death", from: 5.63, to: 6.13 },
    },
  },
  golem: {
    key: "minotaur",
    height: 2.8,
    yaw: 0,
    clips: { idle: { name: "Warrior_Idle" }, move: { name: "Warrior_Walk" } },
  },
  mantis: {
    key: "crywolf",
    height: 1.9,
    yaw: 0,
    clips: {
      idle: { name: "rig|IDDLE1" },
      move: { name: "rig|MOVE_Walk" },
      windup: { name: "rig|ATK 1" },
      strike: { name: "rig|ATK 2" },
      hurt: { name: "rig|DAMAGE 1" },
      stun: { name: "rig|DAMAGE Stagger" },
      death: { name: "rig|DAMAGE DEATH" },
    },
  },
};

type State = "spawn" | "chase" | "windup" | "strike" | "recover" | "hurt" | "air" | "down" | "stun" | "cast" | "dead";
type Attack = "bite" | "slam" | "swipe" | "dash" | "cast";
export type EliteMod = "shielded" | "enraged" | "volatile";
export const ELITE_COLOR: Record<EliteMod, THREE.Color> = {
  shielded: new THREE.Color(2.4, 1.9, 0.6),
  enraged: new THREE.Color(3, 0.5, 0.1),
  volatile: new THREE.Color(2.6, 1.0, 0.15),
};

let nextId = 1;
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const RED_GLINT = new THREE.Color(4, 0.5, 0.2);

export class Enemy implements Target {
  readonly id = nextId++;
  readonly kind: EnemyKind;
  readonly def: Def;
  readonly c: Creature;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly radius: number;
  readonly chest: number;
  readonly isBoss = false;
  hp: number;
  maxHp: number;
  alive = true;
  air = 0;
  private vy = 0;
  yaw = 0;
  state: State = "spawn";
  st = 0;
  private flashT = 0;
  attackCd = 1 + Math.random();
  private token = false;
  private attack: Attack = "bite";
  private struck = false;
  private tel: ReturnType<Game["fx"]["telegraph"]> | null = null;
  private glintSprite: THREE.Sprite;
  private glintT = 0;
  glintOn = false;
  private glintSounded = false;
  private speed01 = 0;
  private poise: number;
  private burnT = 0;
  private burnDps = 0;
  private chillT = 0;
  private chillStacks = 0;
  private frozenT = 0;
  private iceMesh: THREE.Mesh | null = null;
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private dashDir = new THREE.Vector3();
  private orb: THREE.Mesh | null = null;
  private pitch = 0;
  readonly elite: EliteMod | null;
  shield = 0;
  private aura: THREE.Mesh | null = null;
  private bubble: THREE.Mesh | null = null;
  private game: Game;

  constructor(game: Game, kind: EnemyKind, x: number, z: number, elite: EliteMod | null = null) {
    this.game = game;
    this.kind = kind;
    this.elite = elite;
    const d = (this.def = DEFS[kind]);
    this.hp = this.maxHp = d.hp * game.hpScale * (elite ? 1.7 : 1);
    this.poise = d.poise;
    this.radius = d.radius;
    this.chest = d.chest;
    this.c = new Creature(SPECS[kind]);
    this.pos.set(x, 0, z);
    this.yaw = Math.atan2(game.player.pos.x - x, game.player.pos.z - z);
    const root = this.c.root;
    root.position.set(x, -2.5, z);
    root.rotation.y = this.yaw;
    this.c.play(kind === "hound" ? "strike" : "idle", { fade: 0 });
    game.scene.add(root);
    if (kind === "imp") {
      // Hexfire gathers between the demon's claws while it casts.
      this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.5, 1.4) }));
      this.orb.visible = false;
      game.scene.add(this.orb);
    }
    this.glintSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: RED_GLINT, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.glintSprite.visible = false;
    this.glintSprite.renderOrder = 10;
    game.scene.add(this.glintSprite);
    if (elite) {
      root.scale.setScalar(1.12);
      const ec = ELITE_COLOR[elite];
      this.aura = new THREE.Mesh(
        new THREE.RingGeometry(this.radius + 0.25, this.radius + 0.5, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: ec, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      game.scene.add(this.aura);
      if (elite === "shielded") {
        this.shield = this.maxHp * 0.6;
        this.bubble = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1, 2),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.55, 0.15), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }),
        );
        this.bubble.scale.set(this.radius + 0.5, this.chest * 0.9 + 0.4, this.radius + 0.5);
        game.scene.add(this.bubble);
      }
    }
    const c = new THREE.Color(d.color);
    game.fx.ring(this.pos, 0.2, 1.4 + d.radius, c.clone().multiplyScalar(2), 0.7);
    game.fx.smoke(v1.set(x, 0.1, z), new THREE.Color(0.01, 0.01, 0.01), 8, 0.8, 0.7);
  }

  // ── Status effects ──────────────────────────────────────────────────────────────────
  chill(amount: number) {
    if (!this.alive) return;
    this.chillT = 3;
    this.chillStacks += amount;
    if (this.chillStacks >= 5) {
      this.chillStacks = 0;
      this.freeze(2);
    }
  }
  freeze(sec: number) {
    if (!this.alive) return;
    this.frozenT = Math.max(this.frozenT, sec);
    this.endAttack();
    if (!this.iceMesh) {
      const r = 0.55 + this.radius * 0.6;
      this.iceMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 0),
        new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2, emissive: new THREE.Color(0.1, 0.4, 0.6) }),
      );
      this.iceMesh.scale.set(1, this.chest / r, 1);
      this.game.scene.add(this.iceMesh);
    }
    this.game.audio.freeze();
  }
  frozen() {
    return this.frozenT > 0;
  }
  ignite(dps: number, sec: number) {
    if (!this.alive) return;
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnT = Math.max(this.burnT, sec);
  }

  // ── Combat ──────────────────────────────────────────────────────────────────────────
  takeHit(h: Hit) {
    if (!this.alive) return;
    const g = this.game;
    let dmg = h.dmg;
    // A shield soaks damage first and breaks into a stagger.
    if (this.shield > 0 && !h.execute) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      if (this.bubble) (this.bubble.material as THREE.MeshBasicMaterial).opacity = 0.5;
      if (this.shield <= 0) {
        g.fx.sparks(v1.set(this.pos.x, this.chest, this.pos.z), ELITE_COLOR.shielded, 30, 8);
        g.fx.ring(this.pos, 0.3, 2.5, ELITE_COLOR.shielded, 0.35);
        g.audio.shatter();
        g.toast("SHIELD BROKEN", "#ffd84a");
        if (this.bubble) {
          g.scene.remove(this.bubble);
          this.bubble = null;
        }
        this.endAttack();
        this.enter("stun");
      }
      if (dmg <= 0) {
        this.vel.addScaledVector(h.dir, (h.knock ?? 0) * 0.2);
        return;
      }
    }
    this.hp -= dmg;
    this.flashT = 0.08;
    if (this.hp <= 0 || h.execute) {
      this.hp = 0;
      this.die(h);
      return;
    }
    if (this.state === "spawn") return;
    const armoured = this.def.poise > 0 || this.shield > 0;
    const knock = (h.knock ?? 0) / (armoured ? 3 : 1);
    this.vel.addScaledVector(h.dir, knock);
    if (this.frozenT > 0) return;
    if (armoured) {
      this.poise -= h.dmg;
      if (this.poise <= 0) {
        this.poise = this.def.poise;
        this.endAttack();
        this.enter("stun");
        g.audio.growl(1.6);
        return;
      }
      if (h.heavy && this.state !== "strike") {
        this.endAttack();
        this.enter("hurt");
      }
      return;
    }
    // Flyers can't be launched, only knocked about.
    if (h.launch && this.air < 0.1 && !this.def.flying) {
      this.vy = h.launch;
      this.air = 0.05;
      this.endAttack();
      this.enter("air");
      return;
    }
    if (this.state === "air") {
      this.vy = Math.max(this.vy, h.kind === "gun" ? 2.6 : 4.5);
      return;
    }
    if (h.kind === "gun" && this.state === "strike") return; // bullets don't interrupt a committed strike
    this.endAttack();
    this.enter("hurt");
  }

  parried() {
    this.endAttack();
    this.enter("stun");
    this.st = 0.4;
  }

  private die(h: Hit) {
    const g = this.game;
    this.alive = false;
    this.state = "dead";
    this.endAttack();
    this.glintSprite.visible = false;
    const shatter = this.frozenT > 0;
    if (this.iceMesh) {
      g.scene.remove(this.iceMesh);
      this.iceMesh = null;
    }
    if (this.orb) g.scene.remove(this.orb);
    this.dropElite();
    if (this.elite === "volatile") g.volatileBlast(this.pos.clone());
    g.addCoins(Math.round(this.def.coins * (this.elite ? 2.5 : 1)), this.pos);
    const c = this.c;
    c.holder.rotation.x = 0;
    if (shatter) g.shatterBody(c.root, this.pos);
    else if (h.kind === "blade" || h.kind === "execute" || h.kind === "special" || h.kind === "splitter" || h.kind === "dash") g.sliceCreature(c, h.dir);
    else if (c.has("death")) g.dieAnimated(c, h.dir);
    else g.collapseBody(c.root, h.dir, Math.min(0.6, c.size.x * 0.3));
    g.onKill(this, h);
  }

  private endAttack() {
    if (this.tel) {
      this.game.fx.endTel(this.tel);
      this.tel = null;
    }
    if (this.token) {
      this.game.releaseToken();
      this.token = false;
    }
    this.glintOn = false;
    this.glintSprite.visible = false;
    if (this.orb) this.orb.visible = false;
  }

  private enter(s: State) {
    this.state = s;
    this.st = 0;
    this.struck = false;
  }

  /** Red glint (the parry cue): starts after `delay`, lasts 0.3 s, brightest in the middle. */
  private glint(delay: number) {
    this.glintOn = true;
    this.glintT = delay;
    this.glintSounded = false;
  }

  private dropElite() {
    if (this.aura) this.game.scene.remove(this.aura);
    if (this.bubble) this.game.scene.remove(this.bubble);
    this.aura = this.bubble = null;
  }

  remove() {
    this.endAttack();
    this.dropElite();
    this.game.scene.remove(this.glintSprite);
    if (this.orb) this.game.scene.remove(this.orb);
    if (this.iceMesh) this.game.scene.remove(this.iceMesh);
    if (this.alive) this.game.scene.remove(this.c.root);
  }

  /** Where the strike comes from (mouth / fist / claws). */
  strikePoint(out: THREE.Vector3) {
    const c = this.c;
    switch (this.kind) {
      case "hound":
        return c.boneWorld("Head_", out);
      case "golem":
        return c.boneWorld("mixamorigRightHand", out);
      default:
        return c.boneWorld("__none__", out, 0.45, 0.7);
    }
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────────────
  update(dt: number) {
    if (!this.alive) return;
    const g = this.game;
    const p = g.player;
    if (this.burnT > 0) {
      this.burnT -= dt;
      g.damage(this, { dmg: this.burnDps * dt, dir: new THREE.Vector3(), kind: "dot", move: "burn", element: null, proc: true });
      if (Math.random() < dt * 25) g.fx.fire(v1.set(this.pos.x, this.chest * (0.5 + Math.random() * 0.8) + this.air, this.pos.z), 1, 0.4);
      if (!this.alive) return;
    }
    if (this.chillT > 0) {
      this.chillT -= dt;
      if (this.chillT <= 0) this.chillStacks = 0;
    }
    const slow = this.chillT > 0 ? 0.65 : 1;
    let tdt = dt * slow;
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      tdt = 0;
      if (this.iceMesh) this.iceMesh.position.set(this.pos.x, this.chest * 0.75 + this.air, this.pos.z);
      if (this.frozenT <= 0 && this.iceMesh) {
        g.scene.remove(this.iceMesh);
        this.iceMesh = null;
        g.fx.sparks(v1.set(this.pos.x, 1, this.pos.z), new THREE.Color(0.8, 1.6, 2.4), 10, 4);
      }
    }
    if (this.elite === "enraged") tdt *= 1.3;
    this.st += tdt;
    this.attackCd -= tdt;
    if (this.aura) {
      this.aura.position.set(this.pos.x, 0.04, this.pos.z);
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(g.time * 6) * 0.2;
    }
    if (this.bubble) {
      this.bubble.position.set(this.pos.x, this.chest * 0.7 + this.air, this.pos.z);
      const m = this.bubble.material as THREE.MeshBasicMaterial;
      m.opacity += (0.35 - m.opacity) * Math.min(1, dt * 6);
      this.bubble.rotation.y += dt;
    }
    if (this.elite === "enraged" && Math.random() < dt * 18)
      g.fx.fire(v1.set(this.pos.x + (Math.random() - 0.5) * this.radius, Math.random() * this.chest + this.air, this.pos.z + (Math.random() - 0.5) * this.radius), 1, 0.2, 0.7);
    if (this.elite === "volatile" && Math.random() < dt * 10) g.fx.embers(v1.set(this.pos.x, this.chest * 0.6, this.pos.z), 1, this.radius);

    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(dx, dz);
    this.speed01 *= 0.9;

    if (tdt > 0)
      switch (this.state) {
        case "spawn": {
          const u = Math.min(1, this.st / 0.75);
          this.c.root.position.y = -2.5 * (1 - u) * (1 - u);
          this.yaw = toYaw;
          if (u >= 1) this.enter("chase");
          break;
        }
        case "chase":
          this.chase(tdt, dist, toYaw);
          break;
        case "windup":
        case "strike":
        case "recover":
        case "cast":
          this.attackStep(tdt, dist, toYaw);
          break;
        case "hurt":
          if (this.st > 0.3) this.enter("chase");
          break;
        case "stun":
          if (Math.random() < tdt * 4) g.fx.sparks(v1.set(this.pos.x, this.chest + 0.5, this.pos.z), new THREE.Color(2, 2, 0.6), 1, 1.5);
          if (this.st > 1.4) this.enter("chase");
          break;
        case "down":
          if (this.st > 0.55) this.enter("chase");
          break;
      }

    // Vertical motion (juggles).
    if (this.air > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.air += this.vy * dt;
      if (this.air <= 0) {
        this.air = 0;
        this.vy = 0;
        if (this.state === "air") {
          this.enter("down");
          g.fx.smoke(this.pos, new THREE.Color(0.08, 0.06, 0.05), 4, 0.6, 0.4);
          g.shake(0.08);
        }
      }
    }

    // Motion + collision.
    this.vel.multiplyScalar(Math.exp(-dt * (this.state === "strike" && (this.attack === "dash" || this.attack === "bite") ? 1.5 : 7)));
    this.pos.addScaledVector(this.vel, tdt);
    this.separate();
    g.room.resolve(this.pos, this.radius);

    // Model.
    const root = this.c.root;
    root.position.x = this.pos.x;
    root.position.z = this.pos.z;
    if (this.state !== "spawn") root.position.y = this.air;
    root.rotation.y = this.yaw;
    if (tdt > 0) this.animate(tdt);
    this.flashT -= dt;
    this.c.tint(this.flashT > 0 ? "flash" : this.frozenT > 0 ? "frozen" : this.burnT > 0 ? "burn" : "normal", g.time);
    if (this.orb?.visible) this.strikePoint(this.orb.position);

    // Glint before a parryable strike.
    if (this.glintOn) {
      this.glintT -= tdt;
      if (this.glintT <= 0) {
        const u = -this.glintT / 0.3;
        if (!this.glintSounded) {
          this.glintSounded = true;
          g.audio.glint();
        }
        this.strikePoint(v1);
        this.glintSprite.position.copy(v1);
        const s = Math.sin(Math.min(1, u) * Math.PI) * 1.5 * Math.max(1, this.radius);
        this.glintSprite.scale.set(s, s, 1);
        this.glintSprite.visible = true;
        if (u >= 1) {
          this.glintOn = false;
          this.glintSprite.visible = false;
        }
      }
    }
  }

  /** Pick the animation for the current state, then add procedural touches the clips lack. */
  private animate(dt: number) {
    const c = this.c;
    const k = this.kind;
    const W = this.windupTime();
    const u = Math.min(1, this.st / W);
    let pitchTarget = 0;
    switch (this.state) {
      case "spawn":
        c.play(k === "hound" ? "strike" : "idle");
        break;
      case "chase":
      case "recover":
        if (this.speed01 > 0.15) {
          const rate = k === "hound" ? 2.2 : k === "mantis" ? 2.6 : k === "golem" ? 1.1 : 1;
          c.play("move");
          c.setSpeed(rate * (0.5 + this.speed01 * 0.7));
        } else c.play("idle");
        break;
      case "windup":
        if (c.has("windup")) c.play("windup", { loop: false, speed: k === "mantis" ? 0.5 : 1 });
        else c.play("idle");
        if (k === "hound") pitchTarget = 0.12;
        break;
      case "cast":
        c.play("cast", { loop: false, speed: 1.6 });
        if (this.orb) {
          this.orb.visible = true;
          this.orb.scale.setScalar(Math.max(0.1, u));
        }
        break;
      case "strike":
        if (c.has("strike")) c.play("strike", { loop: false, speed: k === "hound" ? 2.4 : 1.6 });
        if (k === "hound") pitchTarget = -0.35;
        break;
      case "hurt":
        if (c.has("hurt")) c.play("hurt", { loop: false, speed: 1.5 });
        pitchTarget = -0.15;
        break;
      case "stun":
      case "down":
        if (c.has("stun")) c.play("stun", { loop: false });
        else if (c.has("hurt")) c.play("hurt", { speed: 0.6 });
        else c.play("idle", { speed: 0.4 });
        pitchTarget = 0.15;
        break;
      case "air":
        c.play(c.has("hurt") ? "hurt" : "idle");
        pitchTarget = -0.6;
        break;
    }
    c.update(dt);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 12);
    c.holder.rotation.x = this.pitch;
    // The Minotaur's clips only cover idle/walk: raise and swing its arms for the slam and swipe.
    if (k === "golem") {
      const R = c.bone("mixamorigRightArm");
      const L = c.bone("mixamorigLeftArm");
      const spine = c.bone("mixamorigSpine1");
      const a = this.attack;
      const s = this.state;
      if (R && L && spine) {
        if (s === "windup" && a === "slam") {
          R.rotateX(2.3 * u);
          L.rotateX(2.3 * u);
          spine.rotateX(-0.25 * u);
        } else if ((s === "strike" || (s === "recover" && this.st < 0.5)) && a === "slam") {
          R.rotateX(0.7);
          L.rotateX(0.7);
          spine.rotateX(0.45);
        } else if (s === "windup" && a === "swipe") {
          R.rotateX(1.4 * u);
          spine.rotateY(-0.8 * u);
        } else if ((s === "strike" || (s === "recover" && this.st < 0.4)) && a === "swipe") {
          R.rotateX(1.3);
          spine.rotateY(0.8);
        }
      }
    }
  }

  private separate() {
    for (const o of this.game.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const m = this.radius + o.radius;
      if (d < m && d > 1e-4) {
        const push = (m - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
      }
    }
    if (this.def.flying) return;
    const p = this.game.player.pos;
    const dx = this.pos.x - p.x;
    const dz = this.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    const m = this.radius + 0.35;
    if (d < m && d > 1e-4 && !this.game.player.dashing) {
      this.pos.x = p.x + (dx / d) * m;
      this.pos.z = p.z + (dz / d) * m;
    }
  }

  private turn(to: number, dt: number, rate: number) {
    const d = angDiff(to, this.yaw);
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  private chase(dt: number, dist: number, toYaw: number) {
    const g = this.game;
    const d = this.def;
    let want = 0;
    let side = 0;
    const kind = this.kind;
    if (kind === "imp") {
      if (dist < 5.5) want = -1;
      else if (dist > 11) want = 1;
      side = this.strafe * 0.7;
      if (this.attackCd <= 0 && dist < 15) return this.beginAttack("cast");
    } else {
      const reach = kind === "golem" ? 2.9 : kind === "mantis" ? 7 : 2.6;
      if (dist > reach * 0.85) want = 1;
      else if (this.attackCd <= 0) {
        if (g.takeToken()) {
          this.token = true;
          if (kind === "golem") this.beginAttack(Math.random() < 0.55 ? "slam" : "swipe");
          else if (kind === "mantis") this.beginAttack("dash");
          else this.beginAttack("bite");
          return;
        }
        side = this.strafe;
      } else side = this.strafe * 0.8;
      if (kind === "mantis" && dist < 3.5) want = -0.6;
    }
    this.turn(toYaw, dt, kind === "golem" ? 3 : 8);
    const fx = Math.sin(toYaw);
    const fz = Math.cos(toYaw);
    const sp = d.speed;
    v1.set(fx * want + fz * side * 0.6, 0, fz * want - fx * side * 0.6);
    if (v1.lengthSq() > 1) v1.normalize();
    const k = 1 - Math.exp(-dt * 8);
    this.vel.x += (v1.x * sp - this.vel.x) * k;
    this.vel.z += (v1.z * sp - this.vel.z) * k;
    if (Math.random() < dt * 0.3) this.strafe *= -1;
    this.speed01 = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / sp);
    if (Math.random() < dt * 0.1) g.audio.growl(kind === "golem" ? 2 : kind === "hound" ? 0.8 : 1.2);
  }

  private beginAttack(a: Attack) {
    const g = this.game;
    this.attack = a;
    this.enter(a === "cast" ? "cast" : "windup");
    this.vel.multiplyScalar(0.2);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (a === "slam") {
      v1.set(this.pos.x + fx * 2.2, 0, this.pos.z + fz * 2.2);
      this.tel = g.fx.telegraph("circle", v1, 0, 2.6, 0, this.windupTime());
    } else if (a === "dash") {
      this.dashDir.set(fx, 0, fz);
      this.tel = g.fx.telegraph("rect", this.pos, this.yaw, 1.4, 8, this.windupTime());
    } else if (a === "swipe") {
      this.tel = g.fx.telegraph("sector", this.pos, this.yaw, 3.3, 1.1, this.windupTime(), new THREE.Color(1.2, 0.1, 0.05));
    }
    if (a !== "cast" && a !== "slam") this.glint(this.windupTime() - 0.3);
  }

  private windupTime() {
    switch (this.attack) {
      case "bite":
        return 0.55;
      case "slam":
        return 0.95;
      case "swipe":
        return 0.62;
      case "dash":
        return 0.62;
      case "cast":
        return 0.7;
    }
  }

  private attackStep(dt: number, dist: number, toYaw: number) {
    const g = this.game;
    const p = g.player;
    const a = this.attack;
    const W = this.windupTime();
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (this.state === "windup" || this.state === "cast") {
      if (a !== "dash" || this.st < W * 0.6) this.turn(toYaw, dt, a === "slam" ? 1.5 : a === "dash" ? 6 : 4);
      if (a === "dash" && this.tel && this.st < W * 0.6) {
        this.dashDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.tel.mesh.rotation.y = this.yaw + Math.PI;
        this.tel.mesh.position.set(this.pos.x + this.dashDir.x * 4, 0.03, this.pos.z + this.dashDir.z * 4);
      }
      if (a === "slam" && this.tel) this.tel.mesh.position.set(this.pos.x + fx * 2.2, 0.03, this.pos.z + fz * 2.2);
      if (this.st >= W) {
        if (this.state === "cast") {
          this.fireHex();
          this.enter("recover");
        } else {
          this.enter("strike");
          g.audio.enemyAttack();
          if (a === "bite") this.vel.set(fx * 11, 0, fz * 11);
          if (a === "dash") this.vel.copy(this.dashDir).multiplyScalar(26);
        }
      }
      return;
    }
    if (this.state === "strike") {
      const at = a === "dash" ? 0 : a === "bite" ? 0.08 : 0.06;
      if (!this.struck && this.st >= at) {
        if (a === "dash") {
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.3) {
            this.struck = true;
            g.enemyAttack(this, this.hitDmg(), { parryable: true, kind: "melee", knock: 9 });
          }
        } else {
          this.struck = true;
          if (a === "slam") {
            v1.set(this.pos.x + fx * 2.2, 0, this.pos.z + fz * 2.2);
            g.fx.ring(v1, 0.3, 3.3, new THREE.Color(2.5, 0.8, 0.2), 0.45);
            g.fx.smoke(v1, new THREE.Color(0.12, 0.08, 0.06), 10, 1.2, 0.5);
            g.fx.sparks(v1, new THREE.Color(3, 1, 0.3), 16, 6);
            g.fx.fire(v1, 8, 1.6, 1.2);
            g.audio.boom(1);
            g.shake(0.35);
            if (Math.hypot(p.pos.x - v1.x, p.pos.z - v1.z) < 2.7) g.enemyAttack(this, this.hitDmg(), { parryable: false, kind: "aoe", knock: 12 });
          } else {
            const reach = a === "swipe" ? 3.3 : 2.1;
            const cone = a === "swipe" ? 1.15 : 0.9;
            const off = Math.abs(angDiff(toYaw, this.yaw));
            if (dist < reach + 0.35 && off < cone) g.enemyAttack(this, this.hitDmg() * (a === "swipe" ? 0.8 : 1), { parryable: true, kind: "melee", knock: 7 });
          }
        }
      }
      const dur = a === "dash" ? 0.34 : a === "slam" ? 0.3 : a === "bite" ? 0.3 : 0.22;
      if (a === "dash" && this.st < dur) {
        this.vel.copy(this.dashDir).multiplyScalar(26);
        if (Math.random() < 0.7) g.fx.sparks(v1.set(this.pos.x, 0.9, this.pos.z), new THREE.Color(2.5, 0.2, 0.3), 1, 2);
      }
      if (this.st >= dur) {
        this.enter("recover");
        if (this.tel) {
          g.fx.endTel(this.tel);
          this.tel = null;
        }
      }
      return;
    }
    const rec = this.kind === "golem" ? 1.0 : this.kind === "imp" ? 0.45 : 0.65;
    if (this.st >= rec) {
      this.endAttack();
      this.attackCd = ((this.kind === "imp" ? 1.7 : this.kind === "golem" ? 1.3 : 0.75) + Math.random() * 0.9) * (this.elite === "enraged" ? 0.55 : 1);
      this.enter("chase");
    }
  }

  private hitDmg() {
    return this.def.dmg * (this.elite === "enraged" ? 1.25 : 1);
  }

  private fireHex() {
    const g = this.game;
    this.strikePoint(v1);
    if (this.orb) this.orb.visible = false;
    const p = g.player.pos;
    v2.set(p.x - v1.x, 0, p.z - v1.z).normalize();
    g.spawnHex(v1.clone().setY(Math.min(1.6, v1.y)), v2.clone().multiplyScalar(11.5), this.hitDmg());
    g.audio.cast();
  }
}

// ── Projectiles ───────────────────────────────────────────────────────────────────────
export class Hex {
  readonly mesh: THREE.Mesh;
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  dmg: number;
  life = 3.2;
  owner: "enemy" | "player" = "enemy";
  alive = true;
  private homing = 0.7;
  constructor(scene: THREE.Scene, pos: THREE.Vector3, vel: THREE.Vector3, dmg: number) {
    this.pos = pos;
    this.vel = vel;
    this.dmg = dmg;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.5, 1.4) }));
    this.mesh.position.copy(pos);
    scene.add(this.mesh);
  }

  reflect(dir: THREE.Vector3) {
    this.owner = "player";
    this.vel.copy(dir).multiplyScalar(19);
    this.dmg *= 2.5;
    this.life = 2;
    (this.mesh.material as THREE.MeshBasicMaterial).color.setRGB(3, 1.4, 0.4);
  }

  update(dt: number, game: Game) {
    this.life -= dt;
    if (this.owner === "enemy" && this.homing > 0) {
      this.homing -= dt;
      const p = game.player.pos;
      v1.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize().multiplyScalar(this.vel.length());
      this.vel.lerp(v1, Math.min(1, dt * 1.6));
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.scale.setScalar(1 + Math.sin(game.time * 40) * 0.15);
    const col = this.owner === "enemy" ? new THREE.Color(1.8, 0.35, 1.0) : new THREE.Color(2.6, 1.0, 0.3);
    game.fx.emit({ x: this.pos.x, y: this.pos.y, z: this.pos.z, color: col, size: 0.35, life: 0.25, additive: true, shrink: true });
    const r = game.room;
    if (this.life <= 0 || Math.abs(this.pos.x) > r.hx + 0.5 || Math.abs(this.pos.z) > r.hz + 0.5) return this.burst(game);
    if (this.owner === "enemy") {
      const p = game.player;
      if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 0.6) {
        const res = p.receive(null, this.pos, this.dmg, { parryable: true, kind: "projectile", knock: 5 });
        if (res === "parried") {
          let best: THREE.Vector3 | null = null;
          let bd = 1e9;
          for (const t of game.targets()) {
            const d = t.pos.distanceTo(this.pos);
            if (d < bd) {
              bd = d;
              best = t.pos;
            }
          }
          const dir = best ? v1.set(best.x - this.pos.x, 0, best.z - this.pos.z).normalize() : v1.copy(this.vel).negate().normalize();
          this.reflect(dir);
          game.style.add("reflect", 80);
          return;
        }
        if (res === "hit") return this.burst(game);
      }
    } else {
      for (const t of game.targets()) {
        if (Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < t.radius + 0.3) {
          game.damage(t, { dmg: this.dmg, dir: this.vel.clone().normalize(), kind: "reflect", move: "reflect", knock: 6, heavy: true, at: this.pos.clone() });
          return this.burst(game);
        }
      }
    }
  }

  burst(game: Game) {
    this.alive = false;
    game.scene.remove(this.mesh);
    const col = this.owner === "enemy" ? new THREE.Color(2, 0.4, 1.2) : new THREE.Color(3, 1.2, 0.3);
    game.fx.sparks(this.pos, col, 12, 5);
    game.fx.flash(this.pos, col, 1.4, 0.15);
  }
}
