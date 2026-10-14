// Game orchestrator: renderer + post, isometric camera, room flow (waves → kill-cam → reward →
// doors), the damage pipeline with elemental procs, bodies/debris and hazards.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Audio } from "./audio";
import { Boss } from "./boss";
import { BLESSINGS, ELEMENT_COLOR, Loadout, MOVES, RELICS, rewardIcon, rewardLabel, type Element, type Mods, type Reward } from "./boons";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Creature } from "./creatures";
import { DEFS, Enemy, Hex, type EnemyKind } from "./enemies";
import { Fx } from "./fx";
import { Hud } from "./hud";
import { Input } from "./input";
import { ELEMENT_RGB, Player } from "./player";
import { RANKS, SOUL_MUL, StyleMeter } from "./style";
import { ICON_COLOR, type IconKind } from "./textures";
import type { AttackOpts, AttackResult, Hit, Target } from "./types";
import { Room } from "./world";

export const ROOMS = 7; // 6 combat rooms + the boss
export type Card = { id: string; name: string; text: string; icon: IconKind; color: string; tag: string; note?: string };
export type UiEvent =
  | { type: "choose"; title: string; cards: Card[] }
  | { type: "dead"; stats: RunStats }
  | { type: "victory"; stats: RunStats }
  | { type: "bossIntro"; name: string; title: string };
export type RunStats = { time: number; kills: number; souls: number; bestRank: string; rooms: number };
export type Quality = "high" | "low";

type Debris = {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  ground: number;
  t: number;
  landed: boolean;
  /** 0 = stays upright (animated corpses). */
  lieSign: number;
  fallDelay: number;
  onUpdate?: (dt: number) => void;
};
type Hazard =
  | { kind: "fire"; pos: THREE.Vector3; t: number; enemy: boolean; tick: number }
  | { kind: "clone"; pos: THREE.Vector3; t: number }
  | { kind: "wave"; pos: THREE.Vector3; dir: THREE.Vector3; left: number; hit: Set<number>; color: THREE.Color }
  | { kind: "fountain"; obj: THREE.Object3D; t: number; scale: number };

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const CAM_DIR = new THREE.Vector3(1, 1.32, 1).normalize();

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private key: THREE.DirectionalLight;
  readonly input: Input;
  readonly audio = new Audio();
  readonly fx = new Fx();
  readonly hud: Hud;
  readonly style = new StyleMeter();
  loadout = new Loadout();
  mods: Mods = this.loadout.mods();
  room!: Room;
  readonly player: Player;
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  private hexes: Hex[] = [];
  private debris: Debris[] = [];
  private hazards: Hazard[] = [];
  readonly mouseGround = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  time = 0;
  hpScale = 1;
  // Flow.
  roomNo = 1;
  private roomReward: Reward | null = null;
  private waves: EnemyKind[][] = [];
  private waveDelay = 0;
  private phase: "fight" | "killcam" | "loot" | "doors" | "fade" | "bossIntro" | "over" = "fight";
  private phaseT = 0;
  private orb: THREE.Mesh | null = null;
  private nextDoor: { reward: Reward } | null = null;
  souls = 0;
  kills = 0;
  private runTime = 0;
  private tokens = 0;
  // Time effects.
  private stopT = 0;
  private slowT = 0;
  private slowScale = 1;
  private trauma = 0;
  private zoom = 1;
  private zoomTarget = 1;
  private focus = new THREE.Vector3();
  private focusOverride: THREE.Vector3 | null = null;
  private camPos = new THREE.Vector3();
  paused = true;
  running = false;
  private raf = 0;
  private last = 0;
  private quality: Quality;
  onUi: (e: UiEvent) => void = () => {};
  private host: HTMLElement;
  private resizeObs: ResizeObserver;

  constructor(host: HTMLElement, hudEl: HTMLElement, quality: Quality) {
    this.host = host;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality === "high", powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = quality === "high";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
    this.scene.background = new THREE.Color(0x070304);
    this.scene.fog = new THREE.Fog(0x12060a, 40, 95);
    // Lights: dim hellish ambience, a warm key from above with shadows, a red rim from the camera side.
    this.scene.add(new THREE.HemisphereLight(0x8a6a7a, 0x501808, 1.1));
    this.key = new THREE.DirectionalLight(0xffc29a, 2.4);
    this.key.position.set(-10, 22, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.03;
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight(0xff3a20, 1.3);
    rim.position.set(12, 4, 12);
    this.scene.add(rim);
    this.scene.add(this.fx.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.input = new Input(host);
    this.hud = new Hud(hudEl);
    this.player = new Player(this);
    this.style.onRank = (r, up) => {
      if (up) this.audio.rankUp(r);
      this.hud.rank(r, up);
    };
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.buildRoom(1, null);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === "high";
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality === "high" ? 1.75 : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setScale((h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Run flow ────────────────────────────────────────────────────────────────────────
  startRun() {
    this.loadout = new Loadout();
    this.mods = this.loadout.mods();
    this.player.maxHp = 100;
    this.player.hp = 100;
    this.player.wrath = 0;
    this.player.wrathT = 0;
    this.player.model.setWrath(false);
    this.player.ammo = 12;
    this.player.reloading = false;
    this.player.specialCd = 0;
    this.style.reset();
    this.style.best = 0;
    this.souls = 0;
    this.kills = 0;
    this.runTime = 0;
    this.hud.boons(this.loadout);
    this.buildRoom(1, null);
    this.paused = false;
    this.running = true;
    this.audio.unlock();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.audio.setPaused(p);
  }

  private stats(): RunStats {
    return { time: this.runTime, kills: this.kills, souls: Math.round(this.souls), bestRank: RANKS[this.style.best].letter, rooms: this.roomNo };
  }

  private clearRoom() {
    for (const e of this.enemies) e.remove();
    this.enemies = [];
    this.boss?.remove();
    if (this.boss && !this.boss.alive) this.scene.remove(this.boss.c.root);
    this.boss = null;
    for (const h of this.hexes) this.scene.remove(h.mesh);
    this.hexes = [];
    for (const d of this.debris) d.obj.parent?.remove(d.obj);
    this.debris = [];
    this.hazards = [];
    if (this.orb) this.scene.remove(this.orb);
    this.orb = null;
    this.fx.clearRoom();
    if (this.room) {
      this.scene.remove(this.room.group);
      this.room.dispose();
    }
    this.tokens = 0;
  }

  private buildRoom(no: number, reward: Reward | null) {
    this.clearRoom();
    this.roomNo = no;
    this.roomReward = reward;
    const isBoss = no === ROOMS;
    this.room = new Room(no * 31 + Math.floor(Math.random() * 1000), { boss: isBoss, doors: isBoss ? 0 : no === ROOMS - 1 ? 1 : no >= 3 ? 3 : 2 });
    this.scene.add(this.room.group);
    const s = Math.max(this.room.hx, this.room.hz) + 3;
    const sc = this.key.shadow.camera;
    sc.left = -s;
    sc.right = s;
    sc.top = s;
    sc.bottom = -s;
    sc.far = 60;
    sc.updateProjectionMatrix();
    this.key.target.position.set(0, 0, 0);
    this.player.spawn(this.room.hx - 2.2, this.room.hz - 2.2, Math.atan2(-1, -1));
    this.fx.ring(this.player.pos, 0.2, 2, new THREE.Color(2, 0.2, 0.1), 0.6);
    this.focus.copy(this.player.pos);
    this.zoom = this.zoomTarget = 1;
    this.focusOverride = null;
    this.waves = isBoss ? [] : this.composeWaves(no);
    this.waveDelay = 0.9;
    this.phase = isBoss ? "bossIntro" : "fight";
    this.phaseT = 0;
    if (isBoss) {
      this.boss = new Boss(this, -5, -5);
      this.audio.setCue("boss1");
      this.onUi({ type: "bossIntro", name: "The Chained Cerberus", title: "Warden of the Bone Pits" });
    } else this.audio.setCue("floor1");
    this.hud.room(`Bone Pits · ${isBoss ? "Warden" : `Chamber ${no}/${ROOMS - 1}`}`);
    this.hud.boss(null, 0);
    this.updateCamera(1);
  }

  private composeWaves(no: number): EnemyKind[][] {
    const cost: Record<EnemyKind, number> = { hound: 1.6, imp: 3, mantis: 3, golem: 7 };
    const pool: EnemyKind[] = ["hound", "hound", "hound"];
    if (no >= 2) pool.push("imp", "imp");
    if (no >= 3) pool.push("golem");
    if (no >= 4) pool.push("mantis", "mantis");
    const n = no >= 4 ? 3 : 2;
    const budget = 7 + no * 3.2;
    const waves: EnemyKind[][] = [];
    for (let w = 0; w < n; w++) {
      let b = budget / n + w;
      const wave: EnemyKind[] = [];
      let guard = 0;
      while (b > 1.5 && guard++ < 40) {
        const k = pool[(Math.random() * pool.length) | 0];
        if (cost[k] > b + 1) continue;
        if (k === "golem" && wave.includes("golem")) continue;
        wave.push(k);
        b -= cost[k];
      }
      if (no === 3 && w === n - 1 && !wave.includes("golem")) wave.push("golem");
      waves.push(wave);
    }
    return waves;
  }

  spawnEnemy(kind: EnemyKind, x: number, z: number) {
    v1.set(x, 0, z);
    this.room.resolve(v1, 1);
    const e = new Enemy(this, kind, v1.x, v1.z);
    this.enemies.push(e);
    this.audio.spawn();
    return e;
  }

  private spawnWave(wave: EnemyKind[]) {
    const r = this.room;
    for (const k of wave) {
      let x = 0;
      let z = 0;
      for (let i = 0; i < 20; i++) {
        x = (Math.random() * 2 - 1) * (r.hx - 2);
        z = (Math.random() * 2 - 1) * (r.hz - 2);
        if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) > 6) break;
      }
      this.spawnEnemy(k, x, z);
    }
  }

  private updateFlow(dt: number, real: number) {
    this.phaseT += real;
    const alive = this.enemies.filter((e) => e.alive).length;
    switch (this.phase) {
      case "fight":
        if (this.waves.length && alive <= 1) {
          this.waveDelay -= dt;
          if (this.waveDelay <= 0) {
            this.spawnWave(this.waves.shift()!);
            this.waveDelay = 1.2;
          }
        }
        break;
      case "bossIntro":
        this.focusOverride = this.boss ? v1.copy(this.boss.pos).setY(2) : null;
        this.zoomTarget = 0.8;
        if (this.phaseT > 3) {
          this.focusOverride = null;
          this.zoomTarget = 1;
          this.phase = "fight";
        }
        break;
      case "killcam":
        if (this.phaseT > (this.boss ? 2.6 : 1.3)) {
          this.zoomTarget = 1;
          this.focusOverride = null;
          this.hud.letterbox(false);
          if (this.boss) {
            this.phase = "over";
            this.phaseT = 0;
          } else this.roomCleared();
        }
        break;
      case "loot":
        if (this.orb) {
          this.orb.position.y = 1.2 + Math.sin(this.time * 3) * 0.15;
          this.orb.rotation.y += real * 2;
          if (Math.random() < real * 30) this.fx.sparks(this.orb.position, (this.orb.material as THREE.MeshBasicMaterial).color, 1, 1.5);
          if (Math.hypot(this.player.pos.x - this.orb.position.x, this.player.pos.z - this.orb.position.z) < 1.3) this.collectOrb();
        }
        break;
      case "doors":
        for (const d of this.room.doors) {
          if (!d.open || !d.reward) continue;
          if (Math.hypot(this.player.pos.x - d.pos.x, this.player.pos.z - d.pos.z) < 1.9) {
            this.phase = "fade";
            this.phaseT = 0;
            this.nextDoor = { reward: d.reward };
            this.hud.fade(true);
            this.audio.door();
          }
        }
        break;
      case "fade":
        if (this.phaseT > 0.5 && this.nextDoor) {
          const r = this.nextDoor.reward;
          this.nextDoor = null;
          this.buildRoom(this.roomNo + 1, r.kind === "boss" ? null : r);
          this.hud.fade(false);
        }
        break;
      case "over":
        if (this.phaseT > 1.5 && this.running) {
          this.running = false;
          this.audio.setCue("title");
          this.onUi({ type: "victory", stats: this.stats() });
        }
        break;
    }
  }

  private roomCleared() {
    this.phase = "loot";
    this.phaseT = 0;
    this.style.add("clear", 40);
    const r = this.roomReward;
    if (!r) return this.openDoors();
    const kind = rewardIcon(r);
    const col = new THREE.Color(ICON_COLOR[kind]).multiplyScalar(2.5);
    this.orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: col }));
    this.orb.position.set(0, 1.2, 0);
    this.scene.add(this.orb);
    this.fx.ring(this.orb.position.clone().setY(0), 0.2, 2.5, col, 0.8);
    this.hud.toast(`${rewardLabel(r)} appears`, ICON_COLOR[kind]);
  }

  private collectOrb() {
    const r = this.roomReward!;
    if (this.orb) {
      this.fx.flash(this.orb.position, (this.orb.material as THREE.MeshBasicMaterial).color, 3, 0.3);
      this.scene.remove(this.orb);
      this.orb = null;
    }
    this.audio.pickup();
    switch (r.kind) {
      case "health": {
        const heal = 35 * this.mods.heal;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.hud.toast(heal > 0 ? `+${Math.round(heal)} health` : "The Pact forbids healing", "#ff4a5a");
        return this.openDoors();
      }
      case "souls": {
        const s = Math.round(45 * SOUL_MUL[this.style.rank]);
        this.souls += s;
        this.hud.toast(`+${s} demon souls`, "#9ef0ff");
        return this.openDoors();
      }
      case "blessing":
        return this.offer(
          `${r.element[0].toUpperCase()}${r.element.slice(1)} Blessing`,
          this.loadout.offerBlessings(r.element).map((b) => ({
            id: b.id,
            name: b.name,
            text: b.text,
            icon: b.element,
            color: ELEMENT_COLOR[b.element],
            tag: `${b.slot === "aux" ? "Passive" : b.slot[0].toUpperCase() + b.slot.slice(1)} blessing`,
            note: this.loadout.slots[b.slot] ? `Replaces ${this.loadout.slots[b.slot]!.name}` : undefined,
          })),
        );
      case "relic":
        return this.offer(
          "Cursed Relic",
          this.loadout.offerRelics().map((x) => ({ id: x.id, name: x.name, text: `${x.boon} ${x.curse}`, icon: "relic" as IconKind, color: "#5dff9a", tag: "Cursed relic", note: x.curse })),
        );
      case "move":
        return this.offer(
          "New Move",
          this.loadout.offerMoves().map((x) => ({ id: x.id, name: x.name, text: x.text, icon: "move" as IconKind, color: "#ffffff", tag: "Move" })),
        );
      case "boss":
        return this.openDoors();
    }
  }

  private offer(title: string, cards: Card[]) {
    if (!cards.length) {
      this.souls += 30;
      this.hud.toast("+30 demon souls", "#9ef0ff");
      return this.openDoors();
    }
    this.setPaused(true);
    this.onUi({ type: "choose", title, cards });
  }

  /** Called by the UI when a card is picked. */
  choose(id: string) {
    const b = BLESSINGS.find((x) => x.id === id);
    const rl = RELICS.find((x) => x.id === id);
    const mv = MOVES.find((x) => x.id === id);
    if (b) this.loadout.slots[b.slot] = b;
    if (rl) this.loadout.relics.push(rl);
    if (mv) this.loadout.moves.add(mv.id);
    const oldMax = this.player.maxHp;
    this.mods = this.loadout.mods();
    this.player.maxHp = Math.round(100 * this.mods.maxHp);
    if (this.player.maxHp < oldMax) this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.hud.boons(this.loadout);
    this.audio.pickup();
    this.setPaused(false);
    this.openDoors();
  }

  private openDoors() {
    this.phase = "doors";
    this.phaseT = 0;
    const doors = this.room.doors;
    if (!doors.length) return;
    this.audio.door();
    if (this.roomNo === ROOMS - 1) {
      this.room.openDoor(doors[0], { kind: "boss" });
      return;
    }
    const used = new Set<string>();
    const elements: Element[] = ["fire", "ice", "lightning", "shadow"];
    for (const d of doors) {
      let r: Reward = { kind: "souls" };
      for (let i = 0; i < 20; i++) {
        const x = Math.random();
        r =
          x < 0.46
            ? { kind: "blessing", element: elements[(Math.random() * 4) | 0] }
            : x < 0.6
              ? { kind: "relic" }
              : x < 0.74
                ? { kind: "move" }
                : x < 0.87
                  ? { kind: "health" }
                  : { kind: "souls" };
        if (r.kind === "relic" && this.loadout.relics.length >= RELICS.length) continue;
        if (r.kind === "move" && this.loadout.moves.size >= MOVES.length) continue;
        const key = r.kind === "blessing" ? r.element : r.kind;
        if (used.has(key)) continue;
        used.add(key);
        break;
      }
      this.room.openDoor(d, r);
    }
  }

  // ── Combat services ─────────────────────────────────────────────────────────────────
  targets(): Target[] {
    const out: Target[] = [];
    for (const e of this.enemies) if (e.alive && e.state !== "spawn") out.push(e);
    if (this.boss && this.boss.alive && this.boss.state !== "intro") out.push(this.boss);
    return out;
  }

  takeToken() {
    if (this.tokens >= 3) return false;
    this.tokens++;
    return true;
  }
  releaseToken() {
    this.tokens = Math.max(0, this.tokens - 1);
  }

  /** The damage pipeline: elemental procs, effects, style, Wrath gain. */
  damage(t: Target, h: Hit) {
    if (!t.alive) return;
    const el = h.element;
    let dmg = h.dmg;
    if (t.frozen() && (h.kind === "blade" || h.kind === "special")) dmg *= 1.5;
    if (el && !h.proc && (h.kind === "blade" || h.kind === "special" || h.kind === "execute")) {
      if (el === "fire") t.ignite(8, 3);
      if (el === "ice") t.chill(1);
      if (el === "lightning") this.chainLightning(t, 2, 9);
    }
    const at = h.at ?? v1.set(t.pos.x, t.chest + t.air, t.pos.z).clone();
    t.takeHit({ ...h, dmg });
    // Effects.
    if (h.kind !== "dot") {
      const amount = Math.min(3, 0.5 + dmg / 14);
      if (h.kind !== "element") this.fx.bleed(at, h.dir.x, h.dir.z, h.kind === "gun" ? 0.4 : amount);
      if (h.kind === "blade" || h.kind === "special" || h.kind === "execute" || h.kind === "splitter") {
        this.fx.flash(at, new THREE.Color(1.4, 1.3, 1.2), h.heavy ? 0.7 : 0.45, 0.06);
        this.audio.cut(!!h.heavy);
        this.hitstop(h.heavy ? 0.075 : 0.04);
        this.shake(h.heavy ? 0.22 : 0.09);
      } else if (h.kind === "gun") this.audio.bulletHit();
      if (h.crit) this.fx.sparks(at, ELEMENT_RGB.shadow, 10, 6);
      if (el && h.kind !== "gun") this.fx.sparks(at, ELEMENT_RGB[el], 5, 5);
    }
    // Style.
    const pts: Partial<Record<Hit["kind"], number>> = { blade: 14, special: 10, execute: 60, gun: 4, reflect: 50, splitter: 25, dash: 18, element: 3, wrath: 12 };
    let p = pts[h.kind] ?? 0;
    let move = h.move;
    if (h.kind === "gun" && t.air > 0.3) {
      p = 12;
      move = "juggle";
    }
    if (p) this.style.add(move, p);
    if (!this.player.inWrath && h.kind !== "dot") this.player.wrath = Math.min(100, this.player.wrath + dmg * 0.22 * this.mods.wrathGain * (1 + this.style.rank * 0.12));
  }

  private chainLightning(from: Target, n: number, dmg: number) {
    const hit = new Set<number>([from.id]);
    let src = from;
    for (let i = 0; i < n; i++) {
      let best: Target | null = null;
      let bd = 6;
      for (const t of this.targets()) {
        if (hit.has(t.id)) continue;
        const d = t.pos.distanceTo(src.pos);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) break;
      hit.add(best.id);
      this.fx.lightning(v1.set(src.pos.x, src.chest + src.air, src.pos.z).clone(), v2.set(best.pos.x, best.chest + best.air, best.pos.z).clone(), ELEMENT_RGB.lightning);
      this.audio.zap();
      this.damage(best, { dmg: dmg * this.mods.dmg, dir: v2.subVectors(best.pos, src.pos).setY(0).normalize().clone(), kind: "element", move: "chain", element: "lightning", proc: true });
      src = best;
    }
  }

  lightningStrike(pos: THREE.Vector3, radius: number) {
    const ts = this.targets().filter((t) => t.pos.distanceTo(pos) < radius);
    if (!ts.length) return;
    const t = ts[(Math.random() * ts.length) | 0];
    this.fx.lightning(v1.set(t.pos.x + 1, 12, t.pos.z + 1).clone(), v2.set(t.pos.x, t.chest, t.pos.z).clone(), ELEMENT_RGB.lightning);
    this.audio.zap();
    this.damage(t, { dmg: 14 * this.mods.dmg, dir: new THREE.Vector3(), kind: "element", move: "heaven", element: "lightning", proc: true });
  }

  fireBullet(origin: THREE.Vector3, dir: THREE.Vector3, o: { dmg: number; pierce: boolean; lightning: boolean; perfect: boolean; quiet?: boolean }) {
    const max = this.room.raycast(origin, dir.x, dir.z, 24);
    const hits: { t: Target; d: number }[] = [];
    for (const t of this.targets()) {
      const fx = t.pos.x - origin.x;
      const fz = t.pos.z - origin.z;
      const along = fx * dir.x + fz * dir.z;
      if (along < 0 || along > max) continue;
      const perp = Math.abs(fx * dir.z - fz * dir.x);
      if (perp > t.radius + 0.25) continue;
      hits.push({ t, d: along - Math.sqrt(Math.max(0, (t.radius + 0.25) ** 2 - perp * perp)) });
    }
    hits.sort((a, b) => a.d - b.d);
    const use = o.pierce ? hits : hits.slice(0, 1);
    const endD = !o.pierce && use.length ? use[0].d : max;
    const end = v1.copy(origin).addScaledVector(dir, endD).clone();
    const col = o.lightning ? ELEMENT_RGB.lightning : o.perfect ? new THREE.Color(3, 2.2, 0.5) : new THREE.Color(2.2, 1.8, 1.1);
    if (o.lightning) this.fx.lightning(origin, end, col);
    else this.fx.beam(origin, end, col, o.perfect ? 0.04 : 0.022, 0.06);
    const gunEl = this.loadout.slots.guns?.element ?? null;
    for (const { t } of use) {
      const at = v2.set(t.pos.x - dir.x * t.radius, origin.y, t.pos.z - dir.z * t.radius).clone();
      this.damage(t, { dmg: o.dmg + (o.lightning ? 12 : 0), dir, kind: "gun", move: o.lightning ? "thunder" : "gun", knock: 0.9, element: gunEl, at });
      if (gunEl === "ice") t.chill(1);
      if (gunEl === "fire") {
        this.fx.flash(at, ELEMENT_RGB.fire, 1.2, 0.12);
        this.fx.fire(at, 4, 0.5);
        for (const u of this.targets())
          if (u !== t && u.pos.distanceTo(t.pos) < 1.8)
            this.damage(u, { dmg: 7 * this.mods.dmg, dir, kind: "element", move: "hellfire", element: "fire", proc: true });
      }
    }
    if (!use.length && !o.quiet) this.fx.sparks(end, new THREE.Color(2, 1.5, 0.8), 3, 3);
  }

  cutProjectiles(pos: THREE.Vector3, r: number) {
    for (const h of this.hexes) {
      if (!h.alive || h.owner !== "enemy") continue;
      if (Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z) < r + 0.3) {
        h.burst(this);
        this.style.add("deflect", 40);
      }
    }
  }

  spawnHex(pos: THREE.Vector3, vel: THREE.Vector3, dmg: number) {
    this.hexes.push(new Hex(this.scene, pos, vel, dmg));
  }

  enemyAttack(src: Target, dmg: number, o: AttackOpts): AttackResult {
    return this.player.receive(src, src.pos, dmg, o);
  }

  dashThrough(t: Target, dir: THREE.Vector3) {
    const l = this.loadout;
    let hit = false;
    if (l.has("ice_dash")) t.freeze(1.5);
    if (l.has("lightning_dash")) {
      this.fx.lightning(v1.set(this.player.pos.x, 1, this.player.pos.z).clone(), v2.set(t.pos.x, t.chest, t.pos.z).clone(), ELEMENT_RGB.lightning);
      this.audio.zap();
      this.damage(t, { dmg: 14 * this.mods.dmg, dir, kind: "element", move: "static", element: "lightning", proc: true });
      hit = true;
    }
    if (l.moves.has("phantom")) {
      this.damage(t, { dmg: 12 * this.mods.dmg, dir, kind: "dash", move: "phantom", knock: 2 });
      hit = true;
    }
    if (!hit) this.style.add("passthrough", 6);
  }

  firePatch(pos: THREE.Vector3, enemy = false) {
    this.hazards.push({ kind: "fire", pos: pos.clone().setY(0.05), t: enemy ? 3.5 : 2.2, enemy, tick: 0 });
    this.fx.decal(pos.x, pos.z, 1.3, new THREE.Color(0.03, 0.015, 0.01));
  }

  inkClone(pos: THREE.Vector3) {
    this.hazards.push({ kind: "clone", pos: pos.clone(), t: 0.6 });
  }

  splitter(pos: THREE.Vector3, yaw: number, color: THREE.Color) {
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.hazards.push({ kind: "wave", pos: pos.clone().addScaledVector(dir, 0.8), dir, left: 13, hit: new Set(), color });
    this.audio.slash(true);
    this.audio.boom(0.8);
    this.shake(0.3);
  }

  // ── Events ──────────────────────────────────────────────────────────────────────────
  onKill(t: Target, h: Hit) {
    this.kills++;
    const at = v1.set(t.pos.x, t.chest + t.air, t.pos.z).clone();
    this.fx.bleed(at, h.dir.x, h.dir.z, t.isBoss ? 6 : 2.5, 1.6);
    const souls = (t instanceof Enemy ? DEFS[t.kind].souls : 220) * SOUL_MUL[this.style.rank];
    this.souls += souls;
    this.style.add(h.kind === "execute" ? "execution" : "kill", h.kind === "execute" ? 120 : 30);
    if (this.mods.killHeal && this.mods.heal > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.mods.killHeal * this.mods.heal);
    if (h.kind === "execute") this.hud.toast("EXECUTED", "#ff3b3b");
    // Last kill of the room (or the boss) → kill-cam.
    const remaining = this.enemies.some((e) => e.alive) || this.waves.length > 0;
    if (t.isBoss || (!remaining && !this.boss && this.phase === "fight")) {
      this.phase = "killcam";
      this.phaseT = 0;
      for (const e of this.enemies) if (e.alive) e.takeHit({ dmg: 9999, dir: new THREE.Vector3(0, 0, 1), kind: "gun", move: "x" });
      this.slowmo(0.12, t.isBoss ? 2.6 : 1.3);
      this.zoomTarget = t.isBoss ? 0.6 : 0.55;
      this.focusOverride = at.clone();
      this.hud.letterbox(true);
      this.hud.inkFlash();
      this.audio.killcam();
      if (t.isBoss) {
        this.hud.toast("CERBERUS FALLS", "#ffd84a");
        this.souls += 0;
      }
    }
  }

  onParry(at: THREE.Vector3, src: THREE.Vector3) {
    const mid = v1.lerpVectors(at, src, 0.45).setY(1.3).clone();
    this.audio.parry();
    this.fx.sparks(mid, new THREE.Color(3, 2.4, 0.8), 26, 9);
    this.fx.flash(mid, new THREE.Color(1.8, 1.5, 0.9), 1.1, 0.14);
    this.fx.ring(at, 0.3, 3, new THREE.Color(1.6, 1.3, 0.6), 0.35);
    this.slowmo(0.15, 0.55);
    this.style.add("parry", 90);
    this.player.wrath = Math.min(100, this.player.wrath + 12 * this.mods.wrathGain);
    this.hud.toast("PERFECT PARRY", "#ffd84a");
    this.shake(0.25);
    this.zoomTarget = 0.82;
    setTimeout(() => (this.zoomTarget = this.phase === "killcam" ? this.zoomTarget : 1), 650);
    if (this.loadout.has("ice_aux")) {
      this.fx.ring(at, 0.5, 5, ELEMENT_RGB.ice, 0.5);
      for (const t of this.targets()) if (t.pos.distanceTo(at) < 5) t.freeze(2);
    }
  }

  perfectDodge(at: THREE.Vector3) {
    this.slowmo(0.25, 0.6);
    this.audio.perfectDodge();
    this.style.add("dodge", 60);
    this.hud.toast("PERFECT DODGE", "#7fe3ff");
    this.fx.ring(at, 0.3, 2.5, new THREE.Color(0.6, 1.6, 3), 0.4);
  }

  onPerfectReload(at: THREE.Vector3) {
    this.audio.perfectReload();
    this.style.add("reload", 45);
    this.hud.toast("PERFECT RELOAD", "#ffd84a");
    this.fx.sparks(v1.set(at.x, 1.2, at.z), new THREE.Color(3, 2.4, 0.6), 12, 4);
  }

  onWrathStart(at: THREE.Vector3) {
    this.audio.wrath();
    this.slowmo(0.3, 0.7);
    this.hud.wrathFlash();
    this.zoomTarget = 0.75;
    this.fx.fire(v1.set(at.x, 0.5, at.z), 30, 1.5, 2);
  }

  onWrathBurst(at: THREE.Vector3) {
    this.zoomTarget = 1;
    this.fx.ring(at, 0.5, 7, new THREE.Color(3, 0.9, 0.2), 0.6);
    this.fx.ring(at, 0.2, 4, new THREE.Color(3, 2, 0.6), 0.4);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 5;
      this.fx.fire(v1.set(at.x + Math.cos(a) * r, 0.3, at.z + Math.sin(a) * r), 1, 0.4, 1.5);
    }
    this.shake(0.6);
    this.audio.boom(1.8);
    for (const t of this.targets()) {
      const d = t.pos.distanceTo(at);
      if (d < 6.5) {
        const dir = v2.subVectors(t.pos, at).setY(0).normalize().clone();
        this.damage(t, { dmg: 25 * this.mods.dmg, dir, kind: "wrath", move: "wrath", knock: 12, heavy: true, element: "fire", launch: 5 });
      }
    }
  }

  onPlayerHurt(dmg: number) {
    this.style.hit();
    this.hud.hurt();
    this.shake(0.3 + dmg / 80);
    this.audio.hurt();
    this.fx.bleed(v1.set(this.player.pos.x, 1.2, this.player.pos.z), 0, 0, 1);
    this.hitstop(0.06);
  }

  onPlayerDeath() {
    this.slowmo(0.2, 2);
    this.hud.letterbox(true);
    this.phase = "over";
    this.phaseT = -99;
    this.audio.killcam();
    this.player.rig.setPose({ y: -0.5, spine: [1.2, 0, 0], head: [0.6, 0, 0], thighL: [-1.4, 0, 0], shinL: [2.2, 0, 0], thighR: [-1.2, 0, 0], shinR: [2.0, 0, 0], armR: [-0.3, 0, -0.3], armL: [-0.3, 0, 0.3] });
    setTimeout(() => {
      this.running = false;
      this.hud.letterbox(false);
      this.audio.setCue("title");
      this.onUi({ type: "dead", stats: this.stats() });
    }, 2200);
  }

  // ── Bodies ──────────────────────────────────────────────────────────────────────────
  addDebris(obj: THREE.Object3D, vel: THREE.Vector3, ground: number) {
    this.debris.push({
      obj,
      vel: vel.clone(),
      spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8),
      ground,
      t: 0,
      landed: false,
      lieSign: Math.random() < 0.5 ? 1 : -1,
      fallDelay: 0,
    });
  }

  /** Cut in two: the front/top half flies off, the rest topples onto its side. */
  sliceBody(root: THREE.Object3D, upper: THREE.Object3D, dir: THREE.Vector3, upperLie: number, lie: number) {
    root.updateMatrixWorld(true);
    this.scene.attach(upper);
    const big = lie > 1;
    const vel = dir.clone().multiplyScalar(big ? 2 : 3 + Math.random() * 2).add(new THREE.Vector3(0, big ? 3 : 3.5 + Math.random() * 2, 0));
    this.addDebris(upper, vel, upperLie);
    const scale = big ? 3 : 1;
    this.hazards.push({ kind: "fountain", obj: upper, t: 0.8, scale });
    this.debris.push({
      obj: root,
      vel: dir.clone().multiplyScalar(0.5),
      spin: new THREE.Vector3(),
      ground: lie,
      t: 0,
      landed: false,
      lieSign: Math.random() < 0.5 ? 1 : -1,
      fallDelay: 0.3,
    });
    this.hazards.push({ kind: "fountain", obj: root, t: 0.5, scale });
  }

  /**
   * Katana kill on a real model: freeze its pose, duplicate it, and clip the two copies along a
   * tilted plane through the body, so it falls apart in two halves with a blood-red cut face.
   */
  sliceCreature(c: Creature, dir: THREE.Vector3) {
    const root = c.root;
    root.updateMatrixWorld(true);
    const centre = new THREE.Vector3(0, c.size.y * 0.48, 0).applyMatrix4(root.matrixWorld);
    const n = new THREE.Vector3(0, 1, 0).addScaledVector(dir, 0.45).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, centre);
    const upper = cloneSkinned(root) as THREE.Group;
    this.scene.add(upper);
    upper.updateMatrixWorld(true);
    const big = c.size.y > 3;
    const clipU = this.clipObject(upper, plane);
    const clipL = this.clipObject(root, plane.clone().negate());
    const fling = dir.clone().multiplyScalar(big ? 2 : 3.2 + Math.random() * 2).add(new THREE.Vector3(0, big ? 3 : 4 + Math.random() * 2, 0));
    this.debris.push({ obj: upper, vel: fling, spin: new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6), ground: Math.min(0.5, c.size.x * 0.2), t: 0, landed: false, lieSign: Math.random() < 0.5 ? 1 : -1, fallDelay: 0, onUpdate: clipU });
    this.debris.push({ obj: root, vel: dir.clone().multiplyScalar(0.4), spin: new THREE.Vector3(), ground: Math.min(0.45, c.size.x * 0.2), t: 0, landed: false, lieSign: Math.random() < 0.5 ? 1 : -1, fallDelay: 0.3, onUpdate: clipL });
    const scale = big ? 3 : 1;
    const cut = new THREE.Object3D();
    cut.position.copy(centre);
    upper.attach(cut);
    this.hazards.push({ kind: "fountain", obj: cut, t: 0.8, scale });
    const cut2 = new THREE.Object3D();
    cut2.position.copy(centre);
    root.attach(cut2);
    this.hazards.push({ kind: "fountain", obj: cut2, t: 0.6, scale });
    this.fx.bleed(centre, dir.x, dir.z, big ? 5 : 3, 1.2);
  }

  /** Give an object its own clipped materials; returns a per-frame updater that keeps the plane attached. */
  private clipObject(obj: THREE.Object3D, worldPlane: THREE.Plane) {
    const plane = worldPlane.clone();
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const local = worldPlane.clone().applyMatrix4(inv);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
        const cm = x.clone();
        cm.clippingPlanes = [plane];
        cm.side = THREE.DoubleSide;
        cm.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(
            "#include <dithering_fragment>",
            "#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(0.32, 0.01, 0.02, 1.0);",
          );
        };
        cm.customProgramCacheKey = () => "cutface";
        return cm;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0];
    });
    return () => {
      obj.updateMatrixWorld(true);
      plane.copy(local).applyMatrix4(obj.matrixWorld);
    };
  }

  /** Killed by guns/elements and the model has a death animation: play it where it stands. */
  dieAnimated(c: Creature, dir: THREE.Vector3) {
    c.play("death", { loop: false, fade: 0.1, speed: 1.4 });
    const lift = c.spec.lift ?? 0;
    const y0 = c.holder.position.y;
    let t = 0;
    this.debris.push({
      obj: c.root,
      vel: dir.clone().multiplyScalar(2.5),
      spin: new THREE.Vector3(),
      ground: c.root.position.y,
      t: 0,
      landed: true,
      lieSign: 0,
      fallDelay: 0,
      onUpdate: (dt) => {
        t += dt;
        if (t < 4) c.update(dt);
        // Flyers drop out of the air.
        if (lift) c.holder.position.y = Math.max(y0 - lift, y0 - lift * Math.min(1, (t * t) / 0.36));
      },
    });
  }

  /** Killed by guns/elements: knocked back and keels over onto its side. */
  collapseBody(root: THREE.Object3D, dir: THREE.Vector3, lie: number) {
    this.debris.push({
      obj: root,
      vel: dir.clone().multiplyScalar(4).add(new THREE.Vector3(0, 2, 0)),
      spin: new THREE.Vector3(),
      ground: lie,
      t: 0,
      landed: false,
      lieSign: dir.x * Math.cos(root.rotation.y) - dir.z * Math.sin(root.rotation.y) > 0 ? -1 : 1,
      fallDelay: 0,
    });
  }

  shatterBody(root: THREE.Object3D, pos: THREE.Vector3) {
    this.scene.remove(root);
    this.audio.shatter();
    for (let i = 0; i < 40; i++) {
      this.fx.emit({
        x: pos.x + (Math.random() - 0.5) * 0.6,
        y: 0.3 + Math.random() * 1.6,
        z: pos.z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 9,
        vy: 2 + Math.random() * 6,
        vz: (Math.random() - 0.5) * 9,
        color: new THREE.Color(0.6 + Math.random() * 0.6, 1.2, 1.8),
        size: 0.08 + Math.random() * 0.1,
        life: 0.8 + Math.random() * 0.6,
        gravity: 16,
        bounce: true,
        additive: true,
      });
    }
    this.fx.flash(v1.set(pos.x, 1, pos.z), ELEMENT_RGB.ice, 2, 0.2);
  }

  private updateDebris(dt: number) {
    for (const d of this.debris) {
      d.t += dt;
      d.onUpdate?.(dt);
      if (d.lieSign === 0) {
        // Animated corpse: slide to a stop where it stands.
        d.vel.multiplyScalar(Math.exp(-dt * 6));
        d.obj.position.x += d.vel.x * dt;
        d.obj.position.z += d.vel.z * dt;
        continue;
      }
      if (d.landed && d.t > 2) continue;
      if (d.fallDelay > 0) {
        d.fallDelay -= dt;
        d.obj.position.addScaledVector(d.vel, dt);
        continue;
      }
      const o = d.obj;
      const lieZ = (Math.PI / 2) * d.lieSign;
      if (!d.landed) {
        d.vel.y -= 22 * dt;
        o.position.addScaledVector(d.vel, dt);
        if (d.spin.lengthSq() > 0) {
          o.rotation.x += d.spin.x * dt;
          o.rotation.z += d.spin.z * dt;
        } else {
          // A whole body (root at the feet) keels over sideways.
          o.rotation.z += (lieZ - o.rotation.z) * Math.min(1, dt * 5);
        }
        if (o.position.y <= d.ground) {
          o.position.y = d.ground;
          if (Math.abs(d.vel.y) > 3) {
            d.vel.y *= -0.25;
            d.vel.x *= 0.5;
            d.vel.z *= 0.5;
            this.fx.decal(o.position.x, o.position.z, 1.4);
          } else {
            d.landed = true;
            d.t = 0;
            this.fx.decal(o.position.x, o.position.z, 1.8 + d.ground);
          }
        }
      } else {
        // Settle on its side.
        const k = Math.min(1, dt * 8);
        o.rotation.x += (Math.round(o.rotation.x / Math.PI) * Math.PI - o.rotation.x) * k;
        o.rotation.z += (lieZ - o.rotation.z) * k;
        d.vel.multiplyScalar(Math.exp(-dt * 6));
        o.position.x += d.vel.x * dt;
        o.position.z += d.vel.z * dt;
        o.position.y += (d.ground - o.position.y) * k;
      }
      this.room.resolve(o.position, 0.2);
    }
  }

  private updateHazards(dt: number) {
    for (const h of this.hazards) {
      switch (h.kind) {
        case "fire":
          h.t -= dt;
          h.tick -= dt;
          if (Math.random() < dt * 25) this.fx.fire(h.pos, 1, 0.9, 0.9);
          if (h.tick <= 0) {
            h.tick = 0.35;
            if (h.enemy) {
              const p = this.player.pos;
              if (Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < 1.1) this.player.receive(null, h.pos, 6, { parryable: false, kind: "aoe", knock: 2 });
            } else
              for (const t of this.targets())
                if (Math.hypot(t.pos.x - h.pos.x, t.pos.z - h.pos.z) < 1.1 + t.radius) {
                  t.ignite(8, 2);
                  this.damage(t, { dmg: 3, dir: new THREE.Vector3(), kind: "element", move: "ember", element: "fire", proc: true });
                }
          }
          break;
        case "clone":
          h.t -= dt;
          if (Math.random() < dt * 40) this.fx.smoke(h.pos, new THREE.Color(0.02, 0.0, 0.04), 1, 0.7, 0.7);
          if (h.t <= 0) {
            this.fx.ring(h.pos, 0.3, 2.6, ELEMENT_RGB.shadow, 0.35);
            this.fx.sparks(v1.set(h.pos.x, 1, h.pos.z), ELEMENT_RGB.shadow, 18, 7);
            this.audio.boom(0.6);
            for (const t of this.targets())
              if (t.pos.distanceTo(h.pos) < 2.6) {
                const dir = v2.subVectors(t.pos, h.pos).setY(0).normalize().clone();
                this.damage(t, { dmg: 22 * this.mods.dmg, dir, kind: "element", move: "inkclone", element: "shadow", proc: true, knock: 6 });
              }
          }
          break;
        case "wave": {
          const step = Math.min(h.left, 24 * dt);
          h.pos.addScaledVector(h.dir, step);
          h.left -= step;
          if (Math.abs(h.pos.x) > this.room.hx || Math.abs(h.pos.z) > this.room.hz) h.left = 0;
          this.fx.sparks(v1.set(h.pos.x, 0.2, h.pos.z), h.color, 3, 5);
          this.fx.fire(h.pos, 1, 0.5, 1);
          if (Math.random() < 0.6) this.fx.decal(h.pos.x, h.pos.z, 0.9, new THREE.Color(0.02, 0.015, 0.01));
          for (const t of this.targets()) {
            if (h.hit.has(t.id)) continue;
            if (Math.hypot(t.pos.x - h.pos.x, t.pos.z - h.pos.z) < t.radius + 1.3) {
              h.hit.add(t.id);
              this.damage(t, { dmg: 45 * this.mods.dmg, dir: h.dir, kind: "splitter", move: "splitter", knock: 5, launch: 6, heavy: true });
            }
          }
          break;
        }
        case "fountain": {
          h.t -= dt;
          h.obj.getWorldPosition(v1);
          v1.y += 0.1 * h.scale;
          this.fx.bleed(v1, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.25 * Math.min(2, h.scale), 2.2);
          break;
        }
      }
    }
    this.hazards = this.hazards.filter((h) => (h.kind === "wave" ? h.left > 0 : h.t > 0));
  }

  // ── Time + camera ───────────────────────────────────────────────────────────────────
  hitstop(sec: number) {
    this.stopT = Math.max(this.stopT, sec);
  }
  slowmo(scale: number, sec: number) {
    if (this.slowT > 0 && scale > this.slowScale) {
      this.slowT = Math.max(this.slowT, sec * 0.5);
      return;
    }
    this.slowScale = scale;
    this.slowT = sec;
  }
  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  toast(text: string, color: string) {
    this.hud.toast(text, color);
  }

  private updateCamera(real: number) {
    const p = this.player.pos;
    const target = this.focusOverride ?? v1.copy(p).lerp(this.mouseGround, this.input.touch ? 0 : 0.12);
    // Boss fights: keep the boss in frame too.
    if (!this.focusOverride && this.boss?.alive) target.lerp(v2.set(this.boss.pos.x, 0, this.boss.pos.z), 0.35);
    this.focus.lerp(target, 1 - Math.exp(-real * (this.focusOverride ? 4 : 7)));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-real * 5));
    const aspect = this.camera.aspect;
    const base = (this.roomNo === ROOMS ? 23 : 16.5) * (aspect < 1 ? 1.55 : aspect < 1.3 ? 1.2 : 1);
    const dist = base * this.zoom;
    this.camPos.copy(this.focus).addScaledVector(CAM_DIR, dist);
    this.trauma = Math.max(0, this.trauma - real * 1.6);
    const s = this.trauma * this.trauma * 0.7;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * s,
      this.camPos.y + (Math.random() - 0.5) * s,
      this.camPos.z + (Math.random() - 0.5) * s,
    );
    this.camera.lookAt(this.focus.x, this.focus.y + 0.6, this.focus.z);
  }

  // ── Main loop ───────────────────────────────────────────────────────────────────────
  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    const real = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.frame(real);
  }

  /** One frame (exposed for testing: hidden panes throttle requestAnimationFrame). */
  frame(real: number) {
    if (this.paused) {
      this.composer.render();
      return;
    }
    let scale = 1;
    if (this.stopT > 0) {
      this.stopT -= real;
      scale = 0.04;
    } else if (this.slowT > 0) {
      this.slowT -= real;
      scale = this.slowScale;
    }
    const dt = real * scale;
    this.time += dt;
    this.runTime += real;
    this.input.poll();
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.aim.x, this.input.aim.y), this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.mouseGround);
    if (this.phase !== "bossIntro") this.player.update(dt);
    else this.player.update(0);
    for (const e of this.enemies) e.update(dt);
    this.boss?.update(this.phase === "bossIntro" ? real : dt);
    for (const h of this.hexes) if (h.alive) h.update(dt, this);
    this.hexes = this.hexes.filter((h) => h.alive);
    this.updateHazards(dt);
    this.updateDebris(dt);
    this.room.update(dt, this.fx);
    this.fx.update(dt);
    this.updateFlow(dt, real);
    const inCombat = this.phase === "fight" && (this.enemies.some((e) => e.alive) || !!this.boss?.alive);
    this.style.update(real, inCombat);
    this.audio.setIntensity(inCombat ? 0.2 + (this.style.rank / 6) * 0.8 : 0.35);
    this.hud.update(this, real);
    this.updateCamera(real);
    this.room.fadeOccluders(this.player.pos, this.camera.position, real);
    this.composer.render();
    this.input.endFrame();
  }
}

