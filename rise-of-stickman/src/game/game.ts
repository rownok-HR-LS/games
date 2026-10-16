// Game orchestrator: renderer + post, isometric camera, room flow (waves → kill-cam → reward →
// doors), the damage pipeline with elemental procs, bodies/debris and hazards.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Audio } from "./audio";
import { Boss } from "./boss";
import {
  ALL_BLESSINGS,
  ELEMENTS,
  bumpRarity,
  ELEMENT_COLOR,
  LEVEL_STEP,
  Loadout,
  MOVES,
  RARITY_COLOR,
  RARITY_MULT,
  RELICS,
  rewardIcon,
  rewardLabel,
  rollRarity,
  type DoorPlan,
  type Element,
  type Mods,
  type Rarity,
  type Reward,
} from "./boons";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Creature } from "./creatures";
import { DEFS, ELITE_COLOR, Enemy, Hex, type EliteMod, type EnemyKind, type ShotStyle } from "./enemies";
import { Butcher } from "./miniboss";
import { itemIcon as shopIcon, itemName, MERCHANT_LINES, pick, Armoury, Fountain, Shop, type ShopItem } from "./special";
import { WEAPONS, type WeaponId } from "./weapons";
import { ASPECTS, aspectOf, type AspectId } from "./aspects";
import { ANVIL } from "./anvil";
import { loadSave, writeSave, type SaveData } from "./save";
import { Fx } from "./fx";
import { LordApparition, LORDS } from "./lords";
import { Hud } from "./hud";
import { Input } from "./input";
import { ELEMENT_RGB, MAG, Player } from "./player";
import { RANKS, SOUL_MUL, StyleMeter } from "./style";
import { ICON_COLOR, type IconKind } from "./textures";
import type { EnemyBar, Marker } from "./hud";
import { doorIcon } from "./boons";
import type { AttackOpts, AttackResult, Hit, Target } from "./types";
import { buildMedal, medalTexture, Room } from "./world";
import { HUB_AVOID, HUB_SIZE, RACK_SPOTS, Stable, type HubSpotId } from "./hub";
import { ALTAR, altarRanks, KEEPSAKES, keepsakeFrom, keepsakeOf, metaOf, payoutText, PROPHECIES, prophecyDone, type Meta, type Payout } from "./meta";
import { FIRST_WAKE, GIFT_LINES, idleLine, NPC, reaction, STORY, type NpcId } from "./story";

/** Chambers per floor: the last is the Warden (boss); the mini-boss waits halfway; the one before the boss is always merchant-or-fountain. */
export const FLOOR_ROOMS = 12;
export const MINIBOSS_ROOM = 6;
export type Card = { id: string; name: string; text: string; icon: IconKind; color: string; tag: string; note?: string; rarity?: string };
export type HubOption = { id: string; label: string; disabled?: boolean };
export type AltarSideRow = { name: string; text: string; rank: number; max: number; next: number | null };
export type HubView =
  | { kind: "talk"; name: string; title: string; lines: string[]; options: HubOption[]; color: string }
  | { kind: "altar"; embers: number; rows: { id: string; side: 0 | 1; a: AltarSideRow; b: AltarSideRow }[] }
  | { kind: "prophecies"; rows: { id: string; name: string; hint: string; reward: string; progress: number; goal: number; done: boolean; claimed: boolean }[] }
  | { kind: "keepsakes"; equipped: string | null; wine: number; rows: { id: string; name: string; text: string; color: string; owned: boolean; from: string }[] };
export type UiEvent =
  | { type: "choose"; title: string; cards: Card[]; lord?: boolean; reroll?: number }
  | { type: "hub"; view: HubView | null }
  | { type: "dead"; stats: RunStats }
  | { type: "victory"; stats: RunStats }
  | { type: "bossIntro"; name: string; title: string };
export type RunStats = { time: number; kills: number; souls: number; bestRank: string; rooms: number; embers: number };
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
  | { kind: "wave"; pos: THREE.Vector3; dir: THREE.Vector3; left: number; hit: Set<number>; color: THREE.Color; dmg?: number; move?: string }
  | { kind: "rift"; a: THREE.Vector3; b: THREE.Vector3; t: number; dmg: number }
  | { kind: "fountain"; obj: THREE.Object3D; t: number; scale: number }
  | { kind: "blast"; pos: THREE.Vector3; t: number; tel: ReturnType<Fx["telegraph"]> }
  | { kind: "cloud"; pos: THREE.Vector3; r: number; t: number; tick: number };

/** Blood and Plague statuses on any target. */
type Status = { bleed: number; bleedT: number; tick: number; rotT: number };

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
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
  boss: Boss | Butcher | null = null;
  private shop: Shop | null = null;
  private armoury: Armoury | null = null;
  /** The Forsaken Stable (hub between runs). */
  private stable: Stable | null = null;
  private rideT = -1;
  /** Altar of Scars + keepsake effects for this run. */
  meta: Meta = metaOf(loadSave());
  private baseHp = 100;
  rerolls = 0;
  private reroller: (() => void) | null = null;
  private lastOffer: { title: string; cards: Card[] } | null = null;
  private doorsRandom = false;
  private firstBlessing = false;
  private defianceUsed = false;
  private wineDoors = 0;
  private runEmbers = 0;
  lastHurtBy = "the pit itself";
  /** Progress kept between runs. */
  save: SaveData = loadSave();
  private banked = false;
  private fountain: Fountain | null = null;
  private hexes: Hex[] = [];
  private debris: Debris[] = [];
  private hazards: Hazard[] = [];
  readonly mouseGround = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  time = 0;
  hpScale = 1;
  dmgScale = 1;
  coins = 0;
  private shopSeen = false;
  private pendingRarity = new Map<string, Rarity>();
  private camFocus = new THREE.Vector3();
  // Flow.
  roomNo = 1;
  private plan: DoorPlan = { type: "combat", reward: null };
  private waves: { kind: EnemyKind; elite: EliteMod | null }[][] = [];
  private waveDelay = 0;
  private phase: "fight" | "killcam" | "loot" | "doors" | "fade" | "bossIntro" | "over" | "hub" = "fight";
  private phaseT = 0;
  /** Room reward pickup: a floating medallion showing the reward's symbol. */
  private orb: THREE.Group | null = null;
  /** Bleed / Rot per target id. */
  private status = new Map<number, Status>();
  private leechHits = 0;
  private lastCloud = 0;
  private boltHits = 0;
  private zeroT = 0;
  /** Undying Thirst used this chamber. */
  undyingUsed = false;
  /** Soul Anvil doors offered this run. */
  private anvils = 0;
  /** Bodies tumbling into the abyss. */
  private fallers: { obj: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  private orbMedal: THREE.Group | null = null;
  private orbRing: THREE.Mesh | null = null;
  private orbColor = new THREE.Color();
  private orbT = 0;
  /** The Fallen Lord handing out the current blessing, and what to do once it has risen. */
  private lord: LordApparition | null = null;
  private lordCue: (() => void) | null = null;
  private lordCueT = 0;
  private nextPlan: DoorPlan | null = null;
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
      if (up && r >= RANKS.length - 1 && this.running) this.note("sss");
      this.hud.rank(r, up);
    };
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.buildRoom(1, { type: "combat", reward: null });
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
  /** Wake in the Forsaken Stable (after a death, a win, or from the title). */
  enterHub() {
    this.clearRoom();
    this.save = loadSave();
    this.meta = metaOf(this.save);
    this.roomNo = 0;
    this.plan = { type: "armoury", reward: null };
    this.loadout = new Loadout();
    this.mods = this.computeMods();
    this.baseHp = 100 + this.meta.hp;
    this.player.maxHp = this.player.hp = this.baseHp;
    this.player.defiance = this.player.defianceMax = 1 + this.meta.defiance;
    this.player.wrath = 0;
    this.player.wrathT = 0;
    this.player.model.setWrath(false);
    this.player.ammo = MAG;
    this.player.reloading = false;
    this.player.setWeapon(this.save.weapon, this.save.aspect[this.save.weapon]);
    this.souls = 0;
    this.coins = 0;
    this.style.reset();
    this.hud.boons(this.loadout);
    this.room = new Room(5, { doors: 0, hub: true, size: HUB_SIZE, avoid: HUB_AVOID });
    this.scene.add(this.room.group);
    this.fitShadow();
    this.stable = new Stable();
    this.scene.add(this.stable.group);
    this.room.pillars.push(...this.stable.blockers);
    this.armoury = new Armoury(RACK_SPOTS);
    this.scene.add(this.armoury.group);
    for (const r of this.armoury.racks) this.room.pillars.push({ x: r.pos.x, z: r.pos.z, r: 0.75 });
    this.player.spawn(2.6, 3.6, Math.atan2(-1, -1));
    this.focus.copy(this.player.pos);
    this.zoom = this.zoomTarget = 1;
    this.focusOverride = null;
    this.waves = [];
    this.phase = "hub";
    this.phaseT = 0;
    this.rideT = -1;
    this.hud.mode(true);
    this.hud.room("The Forsaken Stable");
    this.hud.boss(null, 0);
    this.audio.setCue("title");
    this.paused = false;
    this.running = true;
    this.audio.unlock();
    if (this.save.runs === 0 && !this.save.talkRun.seer) this.hud.say(NPC.seer.name, FIRST_WAKE);
    else {
      const ready = PROPHECIES.filter((p) => prophecyDone(this.save, p) && !this.save.claimed.includes(p.id)).length;
      if (ready) this.hud.toast(`${ready} PROPHEC${ready > 1 ? "IES" : "Y"} TO CLAIM AT THE SEER`, "#c9b6ff");
    }
    this.updateCamera(1);
  }

  /** The run's mods: blessings and relics, plus the Altar of Scars. */
  private computeMods() {
    const m = this.loadout.mods();
    m.dmg *= this.meta.dmg;
    m.dashCharges += this.meta.dash;
    m.wrathGain *= this.meta.wrath;
    if (this.meta.ghost) m.dodgeWindow *= 2;
    return m;
  }

  private fitShadow() {
    const s = Math.max(this.room.hx, this.room.hz) + 3;
    const sc = this.key.shadow.camera;
    sc.left = -s;
    sc.right = s;
    sc.top = s;
    sc.bottom = -s;
    sc.far = 60;
    sc.updateProjectionMatrix();
    this.key.target.position.set(0, 0, 0);
  }

  get inHub() {
    return !!this.stable;
  }

  /** Ride out from the stable into the Bone Pits. */
  startRun() {
    this.save = loadSave();
    this.meta = metaOf(this.save);
    this.save.runs++;
    writeSave(this.save);
    this.loadout = new Loadout();
    this.anvils = 0;
    this.wineDoors = 0;
    this.runEmbers = 0;
    this.firstBlessing = false;
    this.defianceUsed = false;
    this.rerolls = this.meta.rerolls;
    this.mods = this.computeMods();
    this.baseHp = 100 + this.meta.hp;
    this.player.maxHp = this.baseHp;
    this.player.hp = this.baseHp;
    this.player.defiance = this.player.defianceMax = 1 + this.meta.defiance;
    this.player.wrath = this.meta.burning ? 50 : 0;
    this.player.wrathT = 0;
    this.player.model.setWrath(false);
    this.player.ammo = MAG;
    this.player.reloading = false;
    this.player.specialCd = 0;
    this.style.reset();
    this.style.best = 0;
    this.souls = 0;
    this.coins = this.meta.coins;
    this.kills = 0;
    this.runTime = 0;
    this.shopSeen = false;
    this.hud.boons(this.loadout);
    this.banked = false;
    this.player.setWeapon(this.save.weapon, this.save.aspect[this.save.weapon]);
    this.hud.mode(false);
    const first = this.meta.sigil ?? ELEMENTS[(Math.random() * ELEMENTS.length) | 0];
    this.buildRoom(1, { type: "combat", reward: { kind: "blessing", element: first } });
    const ks = keepsakeOf(this.meta.keepsake);
    if (ks) this.hud.toast(`KEEPSAKE: ${ks.name.toUpperCase()}`, ks.color);
    this.paused = false;
    this.running = true;
    this.audio.unlock();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.audio.setPaused(p);
  }

  private stats(): RunStats {
    return { time: this.runTime, kills: this.kills, souls: Math.round(this.souls * this.meta.souls), bestRank: RANKS[this.style.best].letter, rooms: this.roomNo, embers: this.runEmbers };
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
    for (const h of this.hazards) if (h.kind === "blast") this.fx.endTel(h.tel);
    this.hazards = [];
    if (this.orb) this.scene.remove(this.orb);
    this.orb = null;
    this.status.clear();
    this.undyingUsed = false;
    for (const f of this.fallers) this.scene.remove(f.obj);
    this.fallers = [];
    this.removeLord();
    if (this.shop) this.scene.remove(this.shop.group);
    if (this.fountain) this.scene.remove(this.fountain.group);
    if (this.armoury) this.scene.remove(this.armoury.group);
    this.armoury = null;
    if (this.stable) {
      this.scene.remove(this.stable.group);
      this.stable.dispose();
    }
    this.stable = null;
    this.shop = null;
    this.fountain = null;
    this.hud.prompt(null);
    this.hud.clearFloaters();
    this.fx.clearRoom();
    if (this.room) {
      this.scene.remove(this.room.group);
      this.room.dispose();
    }
    this.tokens = 0;
  }

  private buildRoom(no: number, plan: DoorPlan) {
    this.clearRoom();
    this.roomNo = no;
    this.plan = plan;
    this.undyingUsed = false;
    const type = plan.type;
    const fight = type === "combat" || type === "elite" || type === "abyss";
    const visit = type === "shop" || type === "fountain" || type === "armoury";
    // Deeper = tougher.
    this.hpScale = type === "boss" ? 1.3 : 1 + 0.07 * (no - 1);
    this.dmgScale = type === "boss" ? 1.15 : 1 + 0.045 * (no - 1);
    const doors = type === "boss" ? 0 : type === "armoury" ? 1 : no === FLOOR_ROOMS - 1 || no === MINIBOSS_ROOM - 1 ? 1 : no === FLOOR_ROOMS - 2 ? 2 : no >= 3 ? 3 : 2;
    const traps = fight && no >= 2 ? Math.min(5, 2 + Math.floor(no / 3)) : type === "miniboss" ? 3 : 0;
    this.room = new Room(no * 31 + Math.floor(Math.random() * 1000), { boss: type === "boss", doors, traps, small: visit });
    this.scene.add(this.room.group);
    this.fitShadow();
    this.player.spawn(this.room.hx - 2.2, this.room.hz - 2.2, Math.atan2(-1, -1));
    this.fx.ring(this.player.pos, 0.2, 2, new THREE.Color(2, 0.2, 0.1), 0.6);
    this.focus.copy(this.player.pos);
    this.zoom = this.zoomTarget = 1;
    this.focusOverride = null;
    this.waves = fight ? this.composeWaves(no, type) : [];
    this.waveDelay = 0.9;
    this.phase = fight ? "fight" : visit ? "doors" : "bossIntro";
    this.phaseT = 0;
    if (type === "boss" || type === "miniboss") {
      this.boss = type === "boss" ? new Boss(this, -5, -5) : new Butcher(this, -3, -3);
      this.audio.setCue("boss1");
      this.onUi({ type: "bossIntro", name: this.boss.name, title: this.boss.title });
    } else this.audio.setCue("floor1");
    if (type === "shop") {
      this.shopSeen = true;
      this.shop = new Shop(this.shopStock());
      this.scene.add(this.shop.group);
      this.merchantSay(pick(MERCHANT_LINES.enter));
    }
    if (type === "fountain") {
      this.fountain = new Fountain();
      this.scene.add(this.fountain.group);
    }
    if (type === "armoury") {
      this.armoury = new Armoury();
      this.scene.add(this.armoury.group);
      this.hud.say("The Armoury", `Choose a weapon and its aspect: walk to a rack and press F. ${Math.floor(this.save.souls)} souls banked.`);
    }
    if (visit) this.openDoors();
    const names: Record<DoorPlan["type"], string> = { combat: "", elite: " · Elite", abyss: " · Abyss", shop: " · Merchant", fountain: " · Fountain", miniboss: " · The Butcher", boss: " · Warden", armoury: "" };
    this.hud.room(`Bone Pits · ${type === "boss" ? "Warden" : type === "armoury" ? "Armoury" : `Chamber ${no}/${FLOOR_ROOMS - 1}`}${type === "boss" ? "" : names[type]}`);
    this.hud.boss(null, 0);
    this.updateCamera(1);
  }

  private composeWaves(no: number, type: DoorPlan["type"]): { kind: EnemyKind; elite: EliteMod | null }[][] {
    const cost: Record<EnemyKind, number> = { hound: 1.6, imp: 3, mantis: 3, golem: 7 };
    const pool: EnemyKind[] = ["hound", "hound", "hound"];
    if (no >= 2) pool.push("imp", "imp");
    if (no >= 3) pool.push("golem");
    if (no >= 4) pool.push("mantis", "mantis");
    const n = type === "abyss" ? 3 : no >= 4 ? 3 : 2;
    const budget = (9 + no * 3.6) * (type === "elite" ? 1.1 : type === "abyss" ? 1.45 : 1);
    const mods: EliteMod[] = ["shielded", "enraged", "volatile"];
    const eliteChance = type === "elite" ? 1 : type === "abyss" ? 0.35 : no >= 4 ? 0.12 : 0;
    const waves: { kind: EnemyKind; elite: EliteMod | null }[][] = [];
    for (let w = 0; w < n; w++) {
      let b = budget / n + w * 1.5;
      const wave: { kind: EnemyKind; elite: EliteMod | null }[] = [];
      let guard = 0;
      while (b > 1.5 && guard++ < 40) {
        const k = pool[(Math.random() * pool.length) | 0];
        const elite = Math.random() < eliteChance ? mods[(Math.random() * mods.length) | 0] : null;
        const c = cost[k] * (elite ? 1.8 : 1);
        if (c > b + 1) continue;
        if (k === "golem" && wave.some((x) => x.kind === "golem")) continue;
        wave.push({ kind: k, elite });
        b -= c;
      }
      if (no === 3 && w === n - 1 && !wave.some((x) => x.kind === "golem")) wave.push({ kind: "golem", elite: null });
      waves.push(wave);
    }
    return waves;
  }

  spawnEnemy(kind: EnemyKind, x: number, z: number, elite: EliteMod | null = null) {
    v1.set(x, 0, z);
    this.room.resolve(v1, 1);
    const e = new Enemy(this, kind, v1.x, v1.z, elite);
    this.enemies.push(e);
    this.audio.spawn();
    return e;
  }

  private spawnWave(wave: { kind: EnemyKind; elite: EliteMod | null }[]) {
    const r = this.room;
    for (const { kind, elite } of wave) {
      let x = 0;
      let z = 0;
      for (let i = 0; i < 20; i++) {
        x = (Math.random() * 2 - 1) * (r.hx - 2);
        z = (Math.random() * 2 - 1) * (r.hz - 2);
        if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) > 6) break;
      }
      this.spawnEnemy(kind, x, z, elite);
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
            this.waveDelay = 1.0;
          }
        }
        break;
      case "bossIntro":
        this.focusOverride = this.boss ? this.camFocus.copy(this.boss.pos).setY(2) : null;
        this.zoomTarget = 0.8;
        if (this.phaseT > 3) {
          this.focusOverride = null;
          this.zoomTarget = 1;
          this.phase = "fight";
        }
        break;
      case "killcam":
        if (this.phaseT > (this.boss?.final ? 2.6 : 1.3)) {
          this.zoomTarget = 1;
          this.focusOverride = null;
          this.hud.letterbox(false);
          if (this.boss?.final) {
            this.phase = "over";
            this.phaseT = 0;
          } else this.roomCleared();
        }
        break;
      case "loot":
        if (this.orb && this.orbMedal && this.orbRing) {
          this.orbT += real;
          const pop = Math.min(1, this.orbT / 0.45);
          const back = 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2);
          this.orbMedal.scale.setScalar(Math.max(0.01, back * 0.7));
          this.orbMedal.position.y = 1.7 + Math.sin(this.orbT * 2.4) * 0.12;
          this.orbMedal.rotation.set(-0.42, Math.PI / 4 + Math.sin(this.orbT * 1.4) * 0.5, 0, "YXZ");
          this.orbRing.rotation.y += real * 0.8;
          (this.orbRing.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.orbT * 3) * 0.12;
          if (Math.random() < real * 6) this.fx.emit({ x: this.orb.position.x + (Math.random() - 0.5) * 1.6, y: 0.2, z: this.orb.position.z + (Math.random() - 0.5) * 1.6, vy: 0.8 + Math.random() * 0.8, color: this.orbColor, size: 0.05, life: 1.2, additive: true, drag: 0.4 });
          if (Math.hypot(this.player.pos.x - this.orb.position.x, this.player.pos.z - this.orb.position.z) < 1.3) this.collectOrb();
        }
        break;
      case "doors":
        this.updateInteract();
        for (const d of this.room.doors) {
          if (!d.open || !d.plan) continue;
          if (Math.hypot(this.player.pos.x - d.pos.x, this.player.pos.z - d.pos.z) < 1.9) {
            this.phase = "fade";
            this.phaseT = 0;
            this.nextPlan = d.plan;
            this.hud.fade(true);
            this.hud.prompt(null);
            this.audio.door();
            if (this.shop) this.merchantSay(pick(MERCHANT_LINES.leave));
          }
        }
        break;
      case "fade":
        if (this.phaseT > 0.5 && this.nextPlan) {
          const plan = this.nextPlan;
          this.nextPlan = null;
          if (plan.type === "abyss") {
            // The Abyss takes its toll up front.
            const cost = Math.round(this.player.maxHp * 0.2);
            this.player.hp = Math.max(1, this.player.hp - cost);
            this.hud.toast(`THE ABYSS TAKES ${cost} HEALTH`, "#c06bff");
          }
          this.buildRoom(this.roomNo + 1, plan);
          this.hud.fade(false);
        }
        break;
      case "over":
        if (this.phaseT > 1.5 && this.running) {
          this.running = false;
          this.audio.setCue("title");
          this.endRun("won", "");
          this.onUi({ type: "victory", stats: this.stats() });
        }
        break;
      case "hub":
        if (this.rideT < 0) this.updateInteract();
        else {
          this.rideT += real;
          this.hud.prompt(null);
          if (this.rideT > 1.0 && this.rideT - real <= 1.0) this.hud.fade(true);
          if (this.rideT > 1.6) {
            this.rideT = -1;
            this.startRun();
            this.hud.fade(false);
          }
        }
        break;
    }
  }

  private roomCleared() {
    this.phase = "loot";
    this.phaseT = 0;
    this.style.add("clear", 40);
    if (this.plan.type === "elite") this.addCoins(35, new THREE.Vector3(0, 0, 0));
    if (this.meta.bloodDebt && this.player.hp < this.player.maxHp) {
      this.healFlat(this.meta.bloodDebt);
      this.fx.ring(this.player.pos, 0.2, 1.4, new THREE.Color(1.6, 0.1, 0.15), 0.35);
    }
    if (this.boss && !this.boss.final) this.boss = null;
    const r = this.plan.reward;
    if (!r) return this.openDoors();
    const kind = rewardIcon(r);
    const col = new THREE.Color(ICON_COLOR[kind]).multiplyScalar(2.5);
    this.orbColor.set(ICON_COLOR[kind]).multiplyScalar(1.4);
    this.orb = new THREE.Group();
    const { group: medal, faces, rim } = buildMedal();
    const tex = medalTexture(kind, this.plan.type === "elite" ? "#ff3a2a" : null);
    for (const m of faces) m.map = tex;
    rim.emissive.set(ICON_COLOR[kind]).multiplyScalar(0.12);
    medal.scale.setScalar(0.01);
    this.orb.add(medal);
    this.orbMedal = medal;
    this.orbRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(ICON_COLOR[kind]), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.orbRing.position.y = 0.04;
    this.orb.add(this.orbRing);
    const light = new THREE.PointLight(new THREE.Color(ICON_COLOR[kind]), 2.5, 5, 1.8);
    light.position.set(0, 1.8, 1.2);
    this.orb.add(light);
    this.orbT = 0;
    this.scene.add(this.orb);
    this.fx.ring(new THREE.Vector3(0, 0.05, 0), 0.2, 2.2, col.multiplyScalar(0.5), 0.6);
    this.hud.toast(`${rewardLabel(r)} appears`, ICON_COLOR[kind]);
  }

  private collectOrb() {
    const r = this.plan.reward!;
    if (this.orb) {
      this.fx.flash(this.orb.position.clone().setY(1.7), this.orbColor, 2, 0.25);
      this.fx.sparks(this.orb.position.clone().setY(1.7), this.orbColor, 14, 5);
      this.scene.remove(this.orb);
      this.orb = null;
      this.orbMedal = null;
      this.orbRing = null;
    }
    this.audio.pickup();
    this.grant(r, this.plan.type === "elite");
  }

  /** Hand out a reward (from a room or the shop). */
  private grant(r: Reward, bonus = false) {
    switch (r.kind) {
      case "health":
        this.heal(0.3);
        return this.afterChoice();
      case "coins":
        this.addCoins(r.amount, this.player.pos);
        return this.afterChoice();
      case "blessing": {
        let min = r.minRarity ?? "common";
        if (bonus) min = bumpRarity(min === "common" ? "common" : min);
        const rarity = bonus ? (min === "common" ? "rare" : min) : min;
        return this.summonLord(r.element, () => this.offerBlessings(r.element, rarity));
      }
      case "ember":
        return this.offerLevelUp();
      case "relic":
        return this.offer(
          "Cursed Relic",
          this.loadout.offerRelics().map((x) => ({ id: x.id, name: x.name, text: `${x.boon} ${x.curse}`, icon: "relic" as IconKind, color: "#5dff9a", tag: "Cursed relic", note: x.curse })),
          () => this.grant(r),
        );
      case "anvil": {
        const w = this.player.w;
        const ups = ANVIL[w.id].filter((u) => !this.loadout.anvil.has(u.id)).sort(() => Math.random() - 0.5).slice(0, 3);
        return this.offer(
          "Soul Anvil",
          ups.map((u) => ({ id: `anv:${u.id}`, name: u.name, text: u.text, icon: "anvil" as IconKind, color: "#c57bff", rarity: "#c57bff", tag: `Soul Anvil · ${w.name}` })),
          () => this.grant(r),
        );
      }
      case "move":
        return this.offer(
          "New Move",
          this.loadout.offerMoves().map((x) => ({ id: x.id, name: x.name, text: x.text, icon: "move" as IconKind, color: "#ffffff", tag: "Move" })),
          () => this.grant(r),
        );
      case "embers":
        this.gainEmbers(r.amount);
        return this.afterChoice();
      case "wine":
        this.save.wine++;
        writeSave(this.save);
        this.hud.toast("+1 GRAVE WINE", "#c03aff");
        return this.afterChoice();
    }
  }

  /** Embers go straight to the bank (kept even if you die). */
  private gainEmbers(n: number) {
    this.save.embers += n;
    this.runEmbers += n;
    writeSave(this.save);
    this.hud.toast(`+${n} EMBERS`, "#ff6a2a");
  }

  private offerBlessings(el: Element, min0: Rarity) {
    this.pendingRarity.clear();
    const min: Rarity = !this.firstBlessing && this.meta.keepsake === "blind_eye" && min0 === "common" ? "rare" : min0;
    const cards: Card[] = this.loadout.offerBlessings(el).map((b) => {
      const rarity = rollRarity(min, this.meta.favour);
      this.pendingRarity.set(b.id, rarity);
      const owned = b.kind ? undefined : this.loadout.slots[b.slot];
      if (b.kind) {
        this.pendingRarity.set(b.id, "epic");
        const other = b.pair ? b.pair.find((p) => p !== el) ?? b.pair[1] : null;
        return {
          id: b.id,
          name: b.name,
          text: b.text,
          icon: b.element as IconKind,
          color: ELEMENT_COLOR[b.element],
          tag: b.kind === "duo" ? `Duo · ${LORDS[el].name} + ${LORDS[other!].name}` : `Legendary · ${LORDS[el].name}`,
          rarity: b.kind === "duo" ? "#ffd24a" : "#ff8a1a",
        };
      }
      return {
        id: b.id,
        name: b.name,
        text: b.text,
        icon: b.element as IconKind,
        color: ELEMENT_COLOR[b.element],
        tag: `${rarity[0].toUpperCase()}${rarity.slice(1)} · ${b.slot === "aux" ? "Passive" : b.slot === "blade" ? "Weapon" : b.slot[0].toUpperCase() + b.slot.slice(1)} · ${Math.round(RARITY_MULT[rarity] * 100)}% power`,
        rarity: RARITY_COLOR[rarity],
        note: owned ? `Replaces ${owned.name}` : undefined,
      };
    });
    const gift = `lord_${el}`;
    if (this.save.wine > 0 && !this.save.gifted.includes(gift)) {
      const k = keepsakeFrom(gift);
      cards.push({ id: `gift:${gift}`, name: "Offer Grave Wine", text: `Give ${LORDS[el].name} a bottle of Grave Wine and receive the ${k.name}: ${k.text}`, icon: "wine", color: "#c03aff", rarity: "#c03aff", tag: `Gift · ${this.save.wine} bottle${this.save.wine > 1 ? "s" : ""}`, note: "Then choose your blessing" });
    }
    this.offer(`Blessing of ${LORDS[el].name}, ${LORDS[el].title}`, cards, () => this.offerBlessings(el, min0));
  }

  private offerLevelUp() {
    const owned = this.loadout.owned();
    if (!owned.length) return this.offerBlessings(ELEMENTS[(Math.random() * ELEMENTS.length) | 0], "rare");
    this.offer(
      "Ember Heart",
      owned.map((b) => ({
        id: `lvl:${b.id}`,
        name: `${b.name}  Lv ${b.level} → ${b.level + 1}`,
        text: b.text,
        icon: b.element as IconKind,
        color: ELEMENT_COLOR[b.element],
        tag: `Level up · ${Math.round(RARITY_MULT[b.rarity] * (1 + LEVEL_STEP * (b.level - 1)) * 100)}% → ${Math.round(RARITY_MULT[b.rarity] * (1 + LEVEL_STEP * b.level) * 100)}% power`,
        rarity: RARITY_COLOR[b.rarity],
      })),
    );
  }

  private offer(title: string, cards: Card[], reroll?: () => void) {
    this.reroller = reroll ?? null;
    this.lastOffer = { title, cards };
    if (!cards.length) {
      this.lord?.dismiss();
      this.releaseLordCam();
      this.addCoins(40, this.player.pos);
      return this.afterChoice();
    }
    this.setPaused(true);
    this.hud.markers([]);
    this.onUi({ type: "choose", title, cards, lord: !!this.lord, reroll: this.reroller && this.rerolls > 0 ? this.rerolls : undefined });
  }

  /** Second Chance: roll the cards again. */
  reroll() {
    if (!this.reroller || this.rerolls <= 0) return;
    this.rerolls--;
    this.audio.ui();
    this.hud.toast(`REROLLED · ${this.rerolls} LEFT`, "#ffd24a");
    this.reroller();
  }

  /** Called by the UI when a card is picked. */
  choose(id: string) {
    if (id.startsWith("gift:")) {
      const giver = id.slice(5);
      this.giftTo(giver);
      const left = this.lastOffer!.cards.filter((c) => c.id !== id);
      return this.offer(this.lastOffer!.title, left, this.reroller ?? undefined);
    }
    if (id.startsWith("anv:")) {
      this.note("anvil");
      this.loadout.anvil.add(id.slice(4));
      this.player.refreshWeapon();
      this.audio.buy();
      this.hud.toast("WEAPON REFORGED", "#c57bff");
      this.fx.ring(this.player.pos, 0.3, 2.4, new THREE.Color(1.2, 0.6, 1.8), 0.45);
      this.hud.boons(this.loadout);
      this.setPaused(false);
      return this.afterChoice();
    }
    if (id.startsWith("asp:")) {
      this.setPaused(false);
      return this.pickAspect(id.slice(4) as AspectId);
    }
    if (id.startsWith("lvl:")) this.loadout.levelUp(id.slice(4));
    const b = ALL_BLESSINGS.find((x) => x.id === id);
    const rl = RELICS.find((x) => x.id === id);
    const mv = MOVES.find((x) => x.id === id);
    if (b) {
      this.loadout.take(b, this.pendingRarity.get(id) ?? "common");
      if (!b.kind && !this.firstBlessing && this.meta.emberHeart) this.loadout.levelUp(b.id);
      this.firstBlessing = true;
      if (b.kind === "duo") this.note("duo");
      if (b.kind === "legend") this.note("legend");
    }
    if (this.lord && b) {
      this.lord.dismiss();
      this.releaseLordCam();
      this.hud.say(this.lord.name, pick(LORDS[this.lord.element].part));
    }
    if (rl) this.loadout.relics.push(rl);
    if (mv) this.loadout.moves.add(mv.id);
    const oldMax = this.player.maxHp;
    this.mods = this.computeMods();
    this.player.maxHp = Math.round(this.baseHp * this.mods.maxHp);
    if (this.player.maxHp < oldMax) this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.hud.boons(this.loadout);
    this.audio.pickup();
    this.setPaused(false);
    this.afterChoice();
  }

  /** A Fallen Lord rises in front of the hero, speaks, then `then` runs (opens the blessing cards). */
  private summonLord(el: Element, then: () => void) {
    this.removeLord();
    if (!this.save.lordsMet.includes(el)) {
      this.save.lordsMet.push(el);
      writeSave(this.save);
      this.checkProphecies();
    }
    const p = this.player.pos;
    const at = new THREE.Vector3(p.x * 0.6, 0, Math.max(-9, p.z - 3.4));
    this.lord = new LordApparition(el, at, p);
    this.scene.add(this.lord.root);
    this.focusOverride = this.camFocus.set(CAM_DIR.x, 0, CAM_DIR.z).normalize().multiplyScalar(0.6).add(at);
    this.zoomTarget = 0.78;
    const col = new THREE.Color(ELEMENT_COLOR[el]).multiplyScalar(2.2);
    this.fx.ring(at.clone().setY(0.05), 0.3, 3.2, col, 0.7);
    this.fx.flash(at.clone().setY(1.5), col, 4, 0.35);
    this.hud.say(this.lord.name, pick(LORDS[el].greet));
    this.lordCue = then;
    this.lordCueT = 1.15;
  }

  private updateLord(real: number) {
    if (!this.lord) return;
    this.lord.update(real, this.fx);
    if (this.lordCue && (this.lordCueT -= real) <= 0) {
      const cue = this.lordCue;
      this.lordCue = null;
      cue();
    }
    if (this.lord?.done) this.removeLord();
  }

  private releaseLordCam() {
    if (this.focusOverride === this.camFocus && this.lord) {
      this.focusOverride = null;
      this.zoomTarget = 1;
    }
  }

  private removeLord() {
    this.releaseLordCam();
    if (this.lord) {
      this.scene.remove(this.lord.root);
      this.lord.dispose();
    }
    this.lord = null;
    this.lordCue = null;
  }

  private afterChoice() {
    if (this.phase === "loot") this.openDoors();
  }

  private heal(frac: number) {
    const amt = Math.round(this.player.maxHp * frac * this.mods.heal);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amt);
    this.hud.toast(amt > 0 ? `+${amt} health` : "The Pact forbids healing", "#ff4a5a");
    if (amt > 0) this.fx.ring(this.player.pos, 0.3, 2, new THREE.Color(2.4, 0.2, 0.3), 0.5);
  }

  addCoins(n: number, at: THREE.Vector3) {
    if (n <= 0) return;
    this.coins += n;
    this.audio.coin();
    for (let i = 0; i < Math.min(12, 2 + n / 3); i++)
      this.fx.emit({ x: at.x, y: 0.8, z: at.z, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, color: new THREE.Color(2.6, 2, 0.5), size: 0.12, life: 0.7, gravity: 14, bounce: true, additive: true });
  }

  private merchantSay(line: string) {
    this.shop?.talk();
    this.hud.say("The Bone Merchant", line);
  }

  private shopStock(): ShopItem[] {
    const el = ELEMENTS[(Math.random() * ELEMENTS.length) | 0];
    const items: ShopItem[] = [{ kind: "vial", price: 70 }, { kind: "blessing", element: el, price: 140 }];
    items.push(this.loadout.owned().length ? { kind: "ember", price: 110 } : { kind: "relic", price: 120 });
    if (this.player.defiance < this.player.defianceMax) items.push({ kind: "defiance", price: 200 });
    else items.push(Math.random() < 0.5 ? { kind: "move", price: 130 } : { kind: "relic", price: 120 });
    for (const it of items) it.price = Math.round(it.price * this.meta.haggle);
    return items;
  }

  private updateInteract() {
    const p = this.player.pos;
    let prompt: string | null = null;
    let act: (() => void) | null = null;
    let best = Infinity;
    if (this.stable)
      for (const s of this.stable.spots) {
        const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
        if (d > s.r || d / s.r > best) continue;
        best = d / s.r;
        prompt = { krag: "Talk to Old Krag", seer: "Talk to the Hollow Seer", steed: "Ashmane: ride out", altar: "The Altar of Scars" }[s.id];
        act = () => this.useSpot(s.id);
      }
    if (this.shop && this.save.wine > 0 && !this.save.gifted.includes("merchant") && Math.hypot(p.x - this.shop.merchantPos.x, p.z - (this.shop.merchantPos.z + 1.3)) < 1.8) {
      prompt = "Give the Bone Merchant a bottle of Grave Wine";
      act = () => {
        this.giftTo("merchant");
        this.merchantSay(GIFT_LINES.merchant);
      };
    }
    if (this.shop) {
      this.shop.items.forEach((it, i) => {
        if (it.sold || Math.hypot(p.x - it.pos.x, p.z - it.pos.z) > 1.7) return;
        prompt = `${itemName(it.item)} · ${it.item.price} coins`;
        act = () => this.buy(i);
      });
    }
    if (this.armoury)
      for (const r of this.armoury.racks) {
        const d = Math.hypot(p.x - r.pos.x, p.z - r.pos.z);
        if (d > 1.8 || d / 1.8 > best) continue;
        best = d / 1.8;
        prompt = r.id === this.player.w.id ? `${WEAPONS[r.id].name}: choose aspect` : `Take the ${WEAPONS[r.id].name}`;
        act = () => this.openAspects(r.id);
      }
    if (this.fountain && !this.fountain.used && Math.hypot(p.x - this.fountain.pos.x, p.z - this.fountain.pos.z) < 3) {
      prompt = "Drink from the Blood Fountain (heal 40%)";
      act = () => {
        this.fountain!.use();
        this.audio.fountain();
        this.heal(0.4);
      };
    }
    // Second Chance: reroll the doors.
    if (!prompt && this.phase === "doors" && this.doorsRandom && this.rerolls > 0 && this.room.doors.some((d) => d.open && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 5.5)) {
      prompt = `Reroll the doors (${this.rerolls} left)`;
      act = () => {
        this.rerolls--;
        this.audio.ui();
        this.hud.toast(`DOORS REROLLED · ${this.rerolls} LEFT`, "#ffd24a");
        this.openDoors();
      };
    }
    this.hud.prompt(prompt);
    if (act && this.input.pressed.has("interact")) (act as () => void)();
  }

  // ── The Forsaken Stable ─────────────────────────────────────────────────────────────
  private useSpot(id: HubSpotId) {
    this.audio.ui();
    if (id === "altar") return this.showHub(this.altarView());
    this.openTalk(id);
  }

  private showHub(view: HubView) {
    this.setPaused(true);
    this.hud.prompt(null);
    this.hud.markers([]);
    this.onUi({ type: "hub", view });
  }

  private closeHub() {
    this.setPaused(false);
    this.onUi({ type: "hub", view: null });
  }

  /** An NPC speaks: a reaction to the last run plus the next piece of the story, or an idle line. */
  private openTalk(npc: NpcId, extra?: string) {
    const s = this.save;
    const lines: string[] = [];
    if (extra) lines.push(extra);
    else if ((s.talkRun[npc] ?? -1) < s.runs) {
      if (s.talkRun[npc] !== undefined) {
        const r = reaction(npc, s.last);
        if (r) lines.push(r);
      }
      const i = s.talk[npc] ?? 0;
      if (i < STORY[npc].length) {
        lines.push(STORY[npc][i]);
        s.talk[npc] = i + 1;
      }
      s.talkRun[npc] = s.runs;
      writeSave(s);
    }
    if (!lines.length) lines.push(idleLine(npc));
    this.stable?.talk(npc);
    const opts: HubOption[] = [];
    if (npc === "steed") opts.push({ id: "ride", label: "Ride out into the Bone Pits" }, { id: "view:keepsakes", label: "Keepsakes" });
    if (npc === "seer") {
      const ready = PROPHECIES.filter((p) => prophecyDone(s, p) && !s.claimed.includes(p.id)).length;
      opts.push({ id: "view:prophecies", label: `Prophecies${ready ? ` (${ready} to claim)` : ""}` });
    }
    if (!s.gifted.includes(npc)) opts.push({ id: `gift:${npc}`, label: s.wine > 0 ? `Give Grave Wine (${s.wine})` : "Give Grave Wine (you have none)", disabled: s.wine <= 0 });
    opts.push({ id: "close", label: "Leave" });
    const color = { krag: "#ff9a4a", seer: "#c9b6ff", steed: "#7fd8ff" }[npc];
    this.showHub({ kind: "talk", name: NPC[npc].name, title: NPC[npc].title, lines, options: opts, color });
  }

  /** Give a bottle of Grave Wine; the giver hands over their keepsake. */
  private giftTo(giver: string) {
    const s = this.save;
    if (s.wine <= 0 || s.gifted.includes(giver)) return;
    const k = keepsakeFrom(giver);
    s.wine--;
    s.gifted.push(giver);
    if (!s.keepsakes.includes(k.id)) s.keepsakes.push(k.id);
    writeSave(s);
    this.audio.buy();
    this.hud.toast(`KEEPSAKE: ${k.name.toUpperCase()}`, k.color);
  }

  private altarView(): HubView {
    const s = this.save;
    const side = (id: string, i: 0 | 1) => {
      const slot = ALTAR.find((x) => x.id === id)!;
      const d = i ? slot.b : slot.a;
      const rank = altarRanks(s, id)[i];
      return { name: d.name, text: d.text(rank || 1), rank, max: d.costs.length, next: rank < d.costs.length ? d.costs[rank] : null };
    };
    return { kind: "altar", embers: s.embers, rows: ALTAR.map((a) => ({ id: a.id, side: s.altarSide[a.id] ?? 0, a: side(a.id, 0), b: side(a.id, 1) })) };
  }

  private prophecyView(): HubView {
    const s = this.save;
    return {
      kind: "prophecies",
      rows: PROPHECIES.map((p) => ({ id: p.id, name: p.name, hint: p.hint, reward: payoutText(p.reward), progress: Math.min(p.goal, p.progress(s)), goal: p.goal, done: prophecyDone(s, p), claimed: s.claimed.includes(p.id) })),
    };
  }

  private keepsakeView(): HubView {
    const s = this.save;
    return { kind: "keepsakes", equipped: s.keepsake, wine: s.wine, rows: KEEPSAKES.map((k) => ({ ...k, owned: s.keepsakes.includes(k.id) })) };
  }

  /** A button in a hub panel. */
  hubAction(id: string) {
    const s = this.save;
    const [a, b, c] = id.split(":");
    if (id === "close") return this.closeHub();
    if (id === "ride") {
      this.closeHub();
      this.rideT = 0;
      this.stable?.rideOut();
      this.audio.door();
      this.hud.say(NPC.steed.name, "Ashmane rears, blue fire roaring from her mane.");
      return;
    }
    if (a === "view") return this.showHub(b === "keepsakes" ? this.keepsakeView() : b === "prophecies" ? this.prophecyView() : this.altarView());
    if (a === "gift") {
      this.giftTo(b);
      return this.openTalk(b as NpcId, GIFT_LINES[b]);
    }
    if (a === "altar") {
      const slot = ALTAR.find((x) => x.id === c)!;
      const i = (b === "buyb" || b === "useb" ? 1 : 0) as 0 | 1;
      if (b === "buya" || b === "buyb") {
        const ranks = altarRanks(s, c);
        const costs = (i ? slot.b : slot.a).costs;
        const cost = costs[ranks[i]];
        if (cost === undefined) return;
        if (s.embers < cost) {
          this.audio.deny();
          this.hud.toast(`NEED ${cost - s.embers} MORE EMBERS`, "#8a6a6a");
          return this.showHub(this.altarView());
        }
        s.embers -= cost;
        const next: [number, number] = [ranks[0], ranks[1]];
        next[i]++;
        s.altar[c] = next;
        s.altarSide[c] = i;
        this.audio.buy();
        this.fx.ring(new THREE.Vector3(-1.8, 0.1, -7.7), 0.4, 3, new THREE.Color(2, 0.1, 0.1), 0.5);
      } else s.altarSide[c] = i;
      writeSave(s);
      this.applyHubMeta();
      return this.showHub(this.altarView());
    }
    if (a === "proph") {
      const p = PROPHECIES.find((x) => x.id === b);
      if (!p || !prophecyDone(s, p) || s.claimed.includes(p.id)) return;
      s.claimed.push(p.id);
      this.pay(p.reward);
      this.audio.pickup();
      return this.showHub(this.prophecyView());
    }
    if (a === "ks") {
      s.keepsake = b === "none" ? null : b;
      writeSave(s);
      this.applyHubMeta();
      this.audio.ui();
      return this.showHub(this.keepsakeView());
    }
  }

  private pay(r: Payout) {
    const s = this.save;
    if (r.embers) s.embers += r.embers;
    if (r.souls) s.souls += r.souls;
    if (r.wine) s.wine += r.wine;
    writeSave(s);
    this.hud.toast(`+${payoutText(r).toUpperCase()}`, "#c9b6ff");
  }

  /** Show Altar / keepsake changes on the hero right away in the stable. */
  private applyHubMeta() {
    this.meta = metaOf(this.save);
    this.mods = this.computeMods();
    this.baseHp = 100 + this.meta.hp;
    this.player.maxHp = this.player.hp = this.baseHp;
    this.player.defiance = this.player.defianceMax = 1 + this.meta.defiance;
  }

  // ── Prophecy bookkeeping ──
  note(flag: string) {
    if (this.save.flags.includes(flag)) return;
    this.save.flags.push(flag);
    writeSave(this.save);
    this.checkProphecies();
  }

  private bump(counter: string, n = 1) {
    this.save.counts[counter] = (this.save.counts[counter] ?? 0) + n;
    this.checkProphecies();
    writeSave(this.save);
  }

  private checkProphecies() {
    for (const p of PROPHECIES) {
      if (this.save.told.includes(p.id) || !prophecyDone(this.save, p)) continue;
      this.save.told.push(p.id);
      writeSave(this.save);
      this.hud.toast(`PROPHECY FULFILLED: ${p.name.toUpperCase()}`, "#c9b6ff");
    }
  }

  /** Who hit the hero last (for the NPCs' reactions). */
  noteHurt(src: Target | null) {
    this.lastHurtBy = src instanceof Enemy ? DEFS[src.kind].name : ((src as { name?: string } | null)?.name ?? "the pit itself");
  }

  /** Bank souls and record how the run ended. */
  private endRun(result: "dead" | "won", by: string) {
    if (this.banked) return;
    this.bankSouls();
    const s = this.save;
    if (result === "dead") s.deaths++;
    else {
      s.wins++;
      if (!this.defianceUsed) s.flags.includes("flawless") || s.flags.push("flawless");
    }
    s.last = { result, by, room: this.roomNo, weapon: this.player.w.id };
    writeSave(s);
    this.checkProphecies();
  }

  /** The three aspects of a weapon as cards (locked ones show their price). */
  private openAspects(id: WeaponId) {
    const w = WEAPONS[id];
    const col = `#${w.trail.clone().multiplyScalar(2).getHexString()}`;
    const bank = Math.floor(this.save.souls);
    this.offer(
      `${w.name}`,
      ASPECTS[id].map((a, i) => {
        const owned = this.save.unlocked.includes(a.id);
        const on = this.player.w.id === id && this.player.asp.id === a.id;
        return {
          id: `asp:${a.id}`,
          name: a.name,
          text: a.text,
          icon: "move" as IconKind,
          color: owned ? col : "#6a5a58",
          rarity: on ? "#ffd24a" : owned ? col : "#4a3a38",
          tag: `Aspect ${["I", "II", "III"][i]} · ${on ? "Equipped" : owned ? "Unlocked" : `Locked · ${a.cost} souls`}`,
          note: owned ? undefined : bank >= a.cost ? `Unlock with ${a.cost} of your ${bank} souls` : `Need ${a.cost - bank} more souls (you have ${bank})`,
        };
      }),
    );
  }

  private pickAspect(aid: AspectId) {
    const a = aspectOf(aid);
    if (!this.save.unlocked.includes(aid)) {
      if (this.save.souls < a.cost) {
        this.audio.deny();
        this.hud.toast(`NEED ${Math.ceil(a.cost - this.save.souls)} MORE SOULS`, "#8a6a6a");
        return;
      }
      this.save.souls -= a.cost;
      this.save.unlocked.push(aid);
      this.hud.toast("ASPECT UNLOCKED", "#ffd24a");
      this.note("aspect");
    }
    this.equip(a.weapon, aid);
  }

  private equip(id: WeaponId, aspect: AspectId) {
    this.player.setWeapon(id, aspect);
    this.save.weapon = id;
    this.save.aspect[id] = aspect;
    writeSave(this.save);
    const w = WEAPONS[id];
    const a = aspectOf(aspect);
    this.audio.buy();
    this.fx.ring(this.player.pos, 0.2, 1.8, w.trail.clone().multiplyScalar(2), 0.4);
    this.hud.toast(w.name.toUpperCase(), `#${w.trail.clone().multiplyScalar(1.8).getHexString()}`);
    this.hud.say(a.name, a.text);
  }

  /** Add this run's souls to the bank (once per run). */
  private bankSouls() {
    if (this.banked) return;
    this.banked = true;
    const n = Math.floor(this.souls * this.meta.souls);
    this.save.souls += n;
    writeSave(this.save);
    if (n > 0) this.hud.toast(`+${n} SOULS BANKED`, "#7fd8ff");
  }

  private buy(i: number) {
    const it = this.shop!.items[i];
    if (this.coins < it.item.price) {
      this.audio.deny();
      return this.merchantSay(pick(MERCHANT_LINES.poor));
    }
    this.coins -= it.item.price;
    this.shop!.sell(i);
    this.audio.buy();
    this.merchantSay(pick(MERCHANT_LINES.buy));
    const item = it.item;
    switch (item.kind) {
      case "vial":
        return this.heal(0.3);
      case "defiance":
        this.player.defiance = Math.min(this.player.defianceMax, this.player.defiance + 1);
        return this.hud.toast("DEATH DEFIANCE RESTORED", "#ffd84a");
      case "blessing":
        return this.grant({ kind: "blessing", element: item.element });
      case "ember":
        return this.grant({ kind: "ember" });
      case "relic":
        return this.grant({ kind: "relic" });
      case "move":
        return this.grant({ kind: "move" });
    }
  }

  private openDoors() {
    this.phase = "doors";
    this.phaseT = 0;
    const doors = this.room.doors;
    this.doorsRandom = false;
    if (!doors.length) return;
    this.audio.door();
    const next = this.roomNo + 1;
    if (this.roomNo === 0) return this.room.openDoor(doors[0], { type: "combat", reward: { kind: "blessing", element: ELEMENTS[(Math.random() * ELEMENTS.length) | 0] } });
    if (next === FLOOR_ROOMS) return this.room.openDoor(doors[0], { type: "boss", reward: null });
    if (next === MINIBOSS_ROOM) return this.room.openDoor(doors[0], { type: "miniboss", reward: { kind: "move" } });
    if (next === FLOOR_ROOMS - 1) {
      this.room.openDoor(doors[0], { type: "shop", reward: null });
      if (doors[1]) this.room.openDoor(doors[1], { type: "fountain", reward: null });
      return;
    }
    this.doorsRandom = true;
    const used = new Set<string>();
    let abyss = false;
    let shop = false;
    for (const d of doors) {
      let plan: DoorPlan = { type: "combat", reward: { kind: "coins", amount: 50 } };
      for (let i = 0; i < 25; i++) {
        const t = Math.random();
        let type: DoorPlan["type"] = "combat";
        if (next >= 3 && t < 0.2) type = "elite";
        else if (next >= 4 && t < 0.3 && !abyss && this.player.hp > this.player.maxHp * 0.3) type = "abyss";
        else if (next >= 3 && next <= 9 && t < 0.4 && !shop && !this.shopSeen) type = "shop";
        if (type === "shop") {
          plan = { type, reward: null };
          shop = true;
          break;
        }
        const reward = this.rollReward(type);
        const key = reward.kind === "blessing" ? reward.element : reward.kind;
        if (used.has(key)) continue;
        used.add(key);
        if (type === "abyss") abyss = true;
        plan = { type, reward };
        break;
      }
      this.room.openDoor(d, plan);
    }
  }

  private rollReward(type: DoorPlan["type"]): Reward {
    const el = ELEMENTS[(Math.random() * ELEMENTS.length) | 0];
    // Soul Anvil: rare, from Chamber 3, at most twice a run.
    if ((type === "combat" || type === "elite") && this.roomNo + 1 >= 3 && this.anvils < 2 && Math.random() < 0.12) {
      this.anvils++;
      return { kind: "anvil" };
    }
    if (type === "abyss") return Math.random() < 0.7 ? { kind: "blessing", element: el, minRarity: "epic" } : { kind: "relic" };
    // Hub currencies: rare Ember doors and (once a run) a bottle of Grave Wine.
    if (this.roomNo + 1 >= 3 && this.wineDoors < 1 && Math.random() < 0.06) {
      this.wineDoors++;
      return { kind: "wine" };
    }
    if (this.roomNo + 1 >= 2 && Math.random() < 0.09) return { kind: "embers", amount: 5 + ((Math.random() * 4) | 0) };
    const owned = this.loadout.owned().length > 0;
    for (let i = 0; i < 10; i++) {
      const x = Math.random();
      if (x < 0.44) return { kind: "blessing", element: el, minRarity: type === "elite" ? "rare" : "common" };
      if (x < 0.58 && owned) return { kind: "ember" };
      if (x < 0.74) return { kind: "coins", amount: 45 + Math.round(Math.random() * 30) };
      if (x < 0.83 && this.loadout.relics.length < RELICS.length) return { kind: "relic" };
      if (x < 0.92 && this.loadout.moves.size < MOVES.length) return { kind: "move" };
      if (x >= 0.96) return { kind: "health" };
    }
    return { kind: "coins", amount: 60 };
  }

  // ── Combat services ─────────────────────────────────────────────────────────────────
  targets(): Target[] {
    const out: Target[] = [];
    for (const e of this.enemies) if (e.alive && e.state !== "spawn") out.push(e);
    if (this.boss && this.boss.alive && this.boss.state !== "intro") out.push(this.boss);
    return out;
  }

  takeToken() {
    if (this.tokens >= 5) return false;
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
    const L = this.loadout;
    const weaponHit = !h.proc && (h.kind === "blade" || h.kind === "special" || h.kind === "execute");
    if (t.frozen() && (h.kind === "blade" || h.kind === "special")) dmg *= 1.5;
    // Last Stand, Rot, Superconductor, Boiling Blood, Black Death.
    if (L.has("blood_aux") && this.player.hp < this.player.maxHp * 0.3) dmg *= 1.4;
    const st = this.status.get(t.id);
    if (st && st.rotT > 0) dmg *= 1.15;
    if (el === "lightning" && L.has("superconductor") && t.frozen()) dmg *= 1.5;
    if (h.kind === "dot" && st) {
      if (h.move === "burn" && st.bleed > 0 && L.has("boiling_blood")) dmg *= 1.5;
      if (st.bleed > 0 && st.rotT > 0 && L.has("black_death")) dmg *= 2;
    }
    if (el && weaponHit) {
      const pw = this.player.inWrath && el === "fire" ? 1 : Math.max(1, L.power(`${el}_blade`));
      if (el === "fire") t.ignite(8 * pw, 3);
      if (el === "ice") t.chill(pw >= 1.8 ? 2 : 1);
      if (el === "lightning") this.chainLightning(t, pw >= 1.4 ? 3 : 2, 9 * pw);
      if (el === "blood") this.addBleed(t, pw >= 1.8 ? 2 : 1);
      if (el === "plague") this.rot(t, 4);
    }
    // Thermal Shock: fire on a frozen enemy.
    if (L.has("thermal_shock") && t.frozen() && (el === "fire" || burning(t)) && h.move !== "thermal") {
      this.fx.ring(v1.set(t.pos.x, 0.1, t.pos.z), 0.2, 2.6, new THREE.Color(1.6, 1.2, 1.6), 0.35);
      this.fx.sparks(v1.set(t.pos.x, t.chest, t.pos.z), new THREE.Color(1.2, 1.6, 2), 20, 7);
      this.audio.shatter();
      for (const u of this.targets())
        if (u.pos.distanceTo(t.pos) < 2.6) this.damage(u, { dmg: 40 * this.mods.dmg, dir: v2.subVectors(u.pos, t.pos).setY(0).normalize().clone(), kind: "element", move: "thermal", element: "ice", proc: true, knock: 6 });
    }
    // Pyre of Rot: fire touches a poison cloud.
    if (el === "fire" && L.has("pyre_of_rot")) this.igniteClouds(t.pos);
    // Shadow strikes: Black Flame, Dark Thunder.
    if (h.crit) {
      if (L.has("black_flame")) t.ignite(10, 3);
      if (L.has("dark_thunder") && h.move !== "darkthunder") this.skyBolt(t, 24, "darkthunder");
    }
    // Weapon-hit legendaries.
    if (weaponHit) {
      if (L.has("absolute_zero") && this.zeroT <= 0) {
        t.freeze(2);
        this.zeroT = 8;
        this.fx.ring(v1.set(t.pos.x, 0.1, t.pos.z), 0.2, 2, ELEMENT_RGB.ice, 0.4);
        this.audio.freeze();
      }
      if (L.has("judgement_bolt") && ++this.boltHits % 5 === 0) this.skyBolt(t, 40, "judgement");
    }
    const shieldOf = () => (t as { shield?: number }).shield ?? 0;
    if (this.meta.keepsake === "anvil_shard" && t instanceof Enemy && (t.elite || shieldOf() > 0)) dmg *= 1.25;
    if (this.meta.exec && t.hp < t.maxHp * 0.3) dmg *= 1.15;
    const at = h.at ?? v1.set(t.pos.x, t.chest + t.air, t.pos.z).clone();
    const hp0 = t.hp;
    const sh0 = shieldOf();
    const wasFrozen = t.frozen();
    const wasBurning = burning(t);
    const wasRotted = !!(st && st.rotT > 0);
    t.takeHit({ ...h, dmg });
    if (!t.alive) this.onStatusDeath(t, h, wasFrozen, wasBurning, wasRotted);
    const dealt = Math.max(0, hp0 - Math.max(0, t.hp)) + Math.max(0, sh0 - shieldOf());
    if (dealt >= 0.5) {
      const style = sh0 > shieldOf() && hp0 === t.hp ? "shield" : h.crit ? "crit" : h.kind === "dot" || h.kind === "element" ? "dot" : h.kind === "gun" ? "gun" : h.heavy || h.kind === "execute" ? "heavy" : "";
      const col = style === "dot" && el ? `#${ELEMENT_RGB[el].clone().multiplyScalar(0.5).getHexString()}` : undefined;
      this.hud.popNumber(v2.set(t.pos.x, t.chest * 1.4 + t.air + 0.4, t.pos.z), dealt, style, col);
    }
    // Effects.
    if (h.kind !== "dot") {
      const amount = Math.min(3, 0.5 + dmg / 14);
      if (h.kind !== "element") this.fx.bleed(at, h.dir.x, h.dir.z, h.kind === "gun" ? 0.4 : amount);
      if (h.kind === "blade" || h.kind === "special" || h.kind === "execute" || h.kind === "splitter") {
        this.fx.flash(at, new THREE.Color(0.8, 0.75, 0.7), h.heavy ? 0.45 : 0.28, 0.05);
        this.audio.cut(!!h.heavy, this.player.w.sound);
        this.hitstop(h.heavy ? 0.075 : 0.04);
        this.shake(h.heavy ? 0.22 : 0.09);
      } else if (h.kind === "gun") this.audio.bulletHit();
      if (h.crit) this.fx.sparks(at, ELEMENT_RGB.shadow, 10, 6);
      if (el && h.kind !== "gun") this.fx.sparks(at, ELEMENT_RGB[el].clone().multiplyScalar(0.6), 3, 4);
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
    if (!this.player.inWrath && h.kind !== "dot") this.player.wrath = Math.min(100, this.player.wrath + dmg * 0.14 * this.mods.wrathGain * (1 + this.style.rank * 0.12));
  }

  private chainLightning(from: Target, n: number, dmg: number) {
    const hit = new Set<number>([from.id]);
    let src = from;
    for (let i = 0; i < n; i++) {
      let best: Target | null = null;
      let bd = this.loadout.has("superconductor") && chilled(src) ? 12 : 6;
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
      const L = this.loadout;
      if (L.has("wildfire_storm")) best.ignite(6, 2);
      if (L.has("arterial_arc")) {
        this.addBleed(best, 1);
        this.healFlat(1);
      }
      if (L.has("contagion_arc")) this.rot(best, 4);
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
    this.damage(t, { dmg: 14 * Math.max(1, this.loadout.power("lightning_aux")) * this.mods.dmg, dir: new THREE.Vector3(), kind: "element", move: "heaven", element: "lightning", proc: true });
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
      if (gunEl === "blood" && ++this.leechHits % 3 === 0) this.healFlat(1 * this.loadout.power("blood_guns"));
      if (gunEl === "plague" && this.runTime - this.lastCloud > 0.3) {
        this.lastCloud = this.runTime;
        this.cloud(t.pos, 1.3, 2.5);
      }
      if (gunEl === "fire") {
        this.fx.flash(at, ELEMENT_RGB.fire, 1.2, 0.12);
        this.fx.fire(at, 4, 0.5);
        for (const u of this.targets())
          if (u !== t && u.pos.distanceTo(t.pos) < 1.8)
            this.damage(u, { dmg: 7 * this.loadout.power("fire_guns") * this.mods.dmg, dir, kind: "element", move: "hellfire", element: "fire", proc: true });
      }
    }
    if (!use.length && !o.quiet) this.fx.sparks(end, new THREE.Color(2, 1.5, 0.8), 3, 3);
  }

  cutProjectiles(pos: THREE.Vector3, r: number) {
    for (const h of this.hexes) {
      if (!h.alive || h.owner !== "enemy" || h.lobbed) continue;
      if (Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z) < r + 0.3) {
        h.burst(this);
        this.style.add("deflect", 40);
      }
    }
  }

  spawnHex(pos: THREE.Vector3, vel: THREE.Vector3, dmg: number, style: ShotStyle = "needle", tel: Parameters<Fx["endTel"]>[0] | null = null) {
    this.hexes.push(new Hex(this.scene, pos, vel, dmg, style, tel));
  }

  enemyAttack(src: Target, dmg: number, o: AttackOpts): AttackResult {
    return this.player.receive(src, src.pos, this.isRotted(src) ? dmg * 0.75 : dmg, o);
  }

  dashThrough(t: Target, dir: THREE.Vector3) {
    const l = this.loadout;
    let hit = false;
    if (l.has("ice_dash")) t.freeze(1.5 * l.power("ice_dash"));
    if (l.has("lightning_dash")) {
      this.fx.lightning(v1.set(this.player.pos.x, 1, this.player.pos.z).clone(), v2.set(t.pos.x, t.chest, t.pos.z).clone(), ELEMENT_RGB.lightning);
      this.audio.zap();
      this.damage(t, { dmg: 14 * l.power("lightning_dash") * this.mods.dmg, dir, kind: "element", move: "static", element: "lightning", proc: true });
      hit = true;
    }
    if (l.has("blood_dash")) {
      this.addBleed(t, 2);
      this.healFlat(2 * l.power("blood_dash"));
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

  /** A slash wave that travels along the floor (Blood Moon Wave, Crescent Ring, Shockwave Jabs). */
  wave(pos: THREE.Vector3, yaw: number, color: THREE.Color, length: number, dmg: number, move: string) {
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.hazards.push({ kind: "wave", pos: pos.clone().setY(0).addScaledVector(dir, 0.6), dir, left: length, hit: new Set(), color, dmg, move });
  }

  /** Rift Walker: the line of a Rift Cut tears again a moment later. */
  rift(a: THREE.Vector3, b: THREE.Vector3, dmg: number) {
    this.hazards.push({ kind: "rift", a: a.clone().setY(0), b: b.clone().setY(0), t: 0.5, dmg });
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
    this.player.onKill(h.kind);
    const at = v1.set(t.pos.x, t.chest + t.air, t.pos.z).clone();
    this.fx.bleed(at, h.dir.x, h.dir.z, t.isBoss ? 6 : 2.5, 1.6);
    const souls = (t instanceof Enemy ? DEFS[t.kind].souls : 220) * SOUL_MUL[this.style.rank];
    if (t.isBoss) {
      const final = !!this.boss?.final;
      this.gainEmbers(final ? 20 : 10);
      this.note(final ? "cerberus" : "butcher");
      if (final) this.note(`cerb:${this.player.w.id}`);
      if (this.meta.stubborn) this.heal(0.4);
    }
    this.souls += souls;
    this.style.add(h.kind === "execute" ? "execution" : "kill", h.kind === "execute" ? 120 : 30);
    if (this.mods.killHeal && this.mods.heal > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.mods.killHeal * this.mods.heal);
    if (h.kind === "execute") this.hud.toast("EXECUTED", "#ff3b3b");
    // Last kill of the room (or the boss) → kill-cam.
    const remaining = this.enemies.some((e) => e.alive) || this.waves.length > 0;
    if (t.isBoss || (!remaining && !this.boss && this.phase === "fight")) {
      const final = t.isBoss && !!this.boss?.final;
      this.phase = "killcam";
      this.phaseT = 0;
      for (const e of this.enemies) if (e.alive) e.takeHit({ dmg: 9999, dir: new THREE.Vector3(0, 0, 1), kind: "gun", move: "x" });
      this.slowmo(0.12, final ? 2.6 : 1.3);
      this.zoomTarget = final ? 0.6 : 0.55;
      this.focusOverride = at.clone();
      this.hud.letterbox(true);
      this.hud.inkFlash();
      this.audio.killcam();
      if (t.isBoss) this.hud.toast(final ? "CERBERUS FALLS" : "THE BUTCHER FALLS", "#ffd84a");
    }
  }

/** A volatile elite's death: a marked circle, then an explosion that hurts everything inside. */
  volatileBlast(pos: THREE.Vector3) {
    const tel = this.fx.telegraph("circle", pos, 0, 2.8, 0, 0.9, new THREE.Color(2.2, 0.8, 0.1));
    this.hazards.push({ kind: "blast", pos: pos.clone(), t: 0.9, tel });
  }

  onDefiance(at: THREE.Vector3) {
    this.defianceUsed = true;
    this.audio.defiance();
    this.slowmo(0.2, 1.1);
    this.hud.toast("DEATH DEFIED", "#ffd84a");
    this.hud.wrathFlash();
    this.fx.ring(at, 0.4, 7, new THREE.Color(3, 2.4, 0.8), 0.7);
    this.fx.sparks(v1.set(at.x, 1.2, at.z), new THREE.Color(3, 2.4, 0.8), 40, 10);
    this.shake(0.5);
    for (const t of this.targets()) {
      const d = t.pos.distanceTo(at);
      if (d < 6) this.damage(t, { dmg: 20, dir: v2.subVectors(t.pos, at).setY(0).normalize().clone(), kind: "wrath", move: "defiance", knock: 14, heavy: true });
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
    this.bump("parry");
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
    if (this.loadout.has("eclipse")) {
      this.player.eclipse = 3;
      this.hud.toast("ECLIPSE", "#b06bff");
    }
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

  // ── Blood and Plague ────────────────────────────────────────────────────────────────
  private stOf(t: Target) {
    let s = this.status.get(t.id);
    if (!s) {
      s = { bleed: 0, bleedT: 0, tick: 0, rotT: 0 };
      this.status.set(t.id, s);
    }
    return s;
  }

  /** Add Bleed stacks (max 5); each stack bleeds 3 damage a second for 4 s. */
  addBleed(t: Target, n: number) {
    if (!t.alive) return;
    const s = this.stOf(t);
    s.bleed = Math.min(5, s.bleed + n);
    s.bleedT = 4;
  }

  /** Rot: the target deals 25% less damage and takes 15% more. */
  rot(t: Target, sec: number) {
    if (!t.alive) return;
    const s = this.stOf(t);
    if (s.rotT <= 0) this.fx.ring(v1.set(t.pos.x, 0.1, t.pos.z), 0.2, 1.2, ELEMENT_RGB.plague.clone().multiplyScalar(0.5), 0.3);
    s.rotT = Math.max(s.rotT, sec);
  }

  isRotted(t: Target) {
    return (this.status.get(t.id)?.rotT ?? 0) > 0;
  }

  /** A poison cloud that hurts enemies standing in it. */
  cloud(pos: THREE.Vector3, r: number, sec: number) {
    const clouds = this.hazards.filter((h) => h.kind === "cloud");
    if (clouds.length > 26) return;
    this.hazards.push({ kind: "cloud", pos: pos.clone().setY(0.05), r, t: sec, tick: 0.1 });
    this.fx.decal(pos.x, pos.z, r * 0.8, new THREE.Color(0.04, 0.06, 0.01));
  }

  /** Pyre of Rot: clouds near a fire hit burst into flame. */
  private igniteClouds(at: THREE.Vector3) {
    for (const h of this.hazards) {
      if (h.kind !== "cloud" || h.t <= 0 || Math.hypot(h.pos.x - at.x, h.pos.z - at.z) > h.r + 1) continue;
      h.t = 0;
      this.fx.fire(v1.set(h.pos.x, 0.4, h.pos.z), 18, h.r * 1.4, 1.6);
      this.fx.ring(v1.set(h.pos.x, 0.1, h.pos.z), 0.3, h.r + 1, ELEMENT_RGB.fire.clone().multiplyScalar(0.6), 0.35);
      this.audio.boom(0.7);
      for (const t of this.targets())
        if (Math.hypot(t.pos.x - h.pos.x, t.pos.z - h.pos.z) < h.r + t.radius) {
          t.ignite(10, 3);
          this.damage(t, { dmg: 25 * this.mods.dmg, dir: v2.subVectors(t.pos, h.pos).setY(0).normalize().clone(), kind: "element", move: "pyre", element: "fire", proc: true, knock: 4 });
        }
    }
  }

  /** A bolt from the sky onto a target (Dark Thunder, Judgement Bolt). */
  private skyBolt(t: Target, dmg: number, move: string) {
    this.fx.lightning(v1.set(t.pos.x + 0.8, 12, t.pos.z + 0.8).clone(), v2.set(t.pos.x, t.chest, t.pos.z).clone(), ELEMENT_RGB.lightning);
    this.fx.ring(v1.set(t.pos.x, 0.1, t.pos.z), 0.2, 1.8, ELEMENT_RGB.lightning.clone().multiplyScalar(0.5), 0.3);
    this.audio.zap();
    this.damage(t, { dmg: dmg * this.mods.dmg, dir: new THREE.Vector3(), kind: "element", move, element: "lightning", proc: true });
  }

  healFlat(n: number) {
    if (this.mods.heal <= 0 || n <= 0 || !this.player.alive) return;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + n * this.mods.heal);
  }

  /** Death effects that depend on a target's status. */
  private onStatusDeath(t: Target, h: Hit, frozen: boolean, burn: boolean, rotted: boolean) {
    const L = this.loadout;
    if (rotted && L.has("plague_aux")) this.cloud(t.pos, 2.2, 3.5);
    if (burn && L.has("inferno_crown")) {
      this.fx.fire(v1.set(t.pos.x, 0.5, t.pos.z), 16, 1.8, 1.6);
      this.fx.ring(v1.set(t.pos.x, 0.1, t.pos.z), 0.3, 2.6, ELEMENT_RGB.fire.clone().multiplyScalar(0.6), 0.35);
      this.audio.boom(0.7);
      for (const u of this.targets())
        if (u !== t && u.pos.distanceTo(t.pos) < 2.6) this.damage(u, { dmg: 30 * this.mods.dmg, dir: v2.subVectors(u.pos, t.pos).setY(0).normalize().clone(), kind: "element", move: "inferno", element: "fire", proc: true, knock: 5 });
    }
    if (h.crit && L.has("night_feast")) this.healFlat(4);
    if (frozen && L.has("frostbitten_veins")) this.healFlat(5);
    if (L.has("pandemic"))
      for (const c of this.hazards)
        if (c.kind === "cloud" && c.t > 0 && Math.hypot(c.pos.x - t.pos.x, c.pos.z - t.pos.z) < c.r + 0.5) {
          c.r = Math.min(4, c.r + 0.6);
          c.t = Math.max(c.t, 3);
          this.cloud(t.pos, 1.8, 3);
          break;
        }
    this.status.delete(t.id);
  }

  private updateStatus(dt: number) {
    this.zeroT = Math.max(0, this.zeroT - dt);
    if (!this.status.size) return;
    const blood = Math.max(1, this.loadout.power("blood_blade"), this.loadout.power("blood_dash"));
    for (const t of this.targets()) {
      const s = this.status.get(t.id);
      if (!s) continue;
      s.rotT = Math.max(0, s.rotT - dt);
      if (s.rotT > 0 && Math.random() < dt * 10) this.fx.emit({ x: t.pos.x + (Math.random() - 0.5) * t.radius, y: t.chest + t.air + Math.random() * 0.4, z: t.pos.z + (Math.random() - 0.5) * t.radius, vy: 0.5, color: ROT_COL, size: 0.07, life: 0.7, additive: true });
      if (s.bleed <= 0) continue;
      s.bleedT -= dt;
      if (s.bleedT <= 0) {
        s.bleed = 0;
        continue;
      }
      if (Math.random() < dt * 6 * s.bleed) this.fx.emit({ x: t.pos.x + (Math.random() - 0.5) * t.radius, y: t.chest + t.air, z: t.pos.z + (Math.random() - 0.5) * t.radius, vy: -1, color: BLEED_COL, size: 0.06, life: 0.6, gravity: 9 });
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        const fast = t.frozen() && this.loadout.has("frostbitten_veins") ? 3 : 1;
        this.damage(t, { dmg: 1.5 * s.bleed * blood * fast, dir: new THREE.Vector3(), kind: "dot", move: "bleed", element: "blood", proc: true });
      }
    }
    for (const id of [...this.status.keys()]) if (!this.targets().some((t) => t.id === id)) this.status.delete(id);
  }

  /** Let a body drop off the platform; it burns up in the lava far below. */
  dropIntoVoid(obj: THREE.Object3D, vel: THREE.Vector3) {
    this.bump("void");
    this.fallers.push({ obj, vel: new THREE.Vector3(vel.x * 0.6, 3, vel.z * 0.6), spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6) });
  }

  private updateFallers(dt: number) {
    this.fallers = this.fallers.filter((f) => {
      f.vel.y -= 24 * dt;
      f.obj.position.addScaledVector(f.vel, dt);
      f.obj.rotation.x += f.spin.x * dt;
      f.obj.rotation.z += f.spin.z * dt;
      if (f.obj.position.y > -13) return true;
      // Splash into the lava.
      v1.copy(f.obj.position).setY(-13.5);
      this.fx.fire(v1, 10, 1.5, 2);
      this.fx.embers(v1, 8, 1.5);
      this.scene.remove(f.obj);
      return false;
    });
  }

  onPlayerDeath(cause?: string) {
    this.endRun("dead", cause ?? this.lastHurtBy);
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
        case "cloud": {
          h.t -= dt;
          h.tick -= dt;
          if (Math.random() < dt * (6 + h.r * 4)) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * h.r * 0.85;
            this.fx.emit({ x: h.pos.x + Math.cos(a) * d, y: 0.2 + Math.random() * 0.5, z: h.pos.z + Math.sin(a) * d, vy: 0.25, color: CLOUD_COL, alpha: 0.38 * Math.min(1, h.t), size: 0.6 + h.r * 0.25, grow: 0.8, life: 1.3, drag: 1 });
          }
          if (h.tick <= 0) {
            h.tick = 0.4;
            const pw = Math.max(1, this.loadout.power("plague_guns"), this.loadout.power("plague_dash"), this.loadout.power("plague_aux"));
            for (const t of this.targets())
              if (Math.hypot(t.pos.x - h.pos.x, t.pos.z - h.pos.z) < h.r + t.radius * 0.5) {
                if (this.loadout.has("cold_rot")) {
                  t.chill(1);
                  this.rot(t, 2);
                }
                this.damage(t, { dmg: 4 * pw * this.mods.dmg, dir: new THREE.Vector3(), kind: "dot", move: "miasma", element: "plague", proc: true });
              }
          }
          break;
        }
        case "rift":
          h.t -= dt;
          if (Math.random() < dt * 30) this.fx.emit({ x: h.a.x + (h.b.x - h.a.x) * Math.random(), y: 1, z: h.a.z + (h.b.z - h.a.z) * Math.random(), color: this.player.w.trail, size: 0.12, life: 0.3, additive: true });
          if (h.t <= 0) {
            this.fx.beam(v1.set(h.a.x, 1.1, h.a.z).clone(), v2.set(h.b.x, 1.1, h.b.z).clone(), this.player.w.trail.clone().multiplyScalar(2), 0.08, 0.3);
            this.audio.slash(true);
            const ab = v1.subVectors(h.b, h.a);
            const len2 = Math.max(1e-4, ab.lengthSq());
            for (const t of this.targets()) {
              const k = Math.max(0, Math.min(1, ((t.pos.x - h.a.x) * ab.x + (t.pos.z - h.a.z) * ab.z) / len2));
              if (Math.hypot(t.pos.x - (h.a.x + ab.x * k), t.pos.z - (h.a.z + ab.z * k)) < t.radius + 1.0)
                this.damage(t, { dmg: h.dmg * this.mods.dmg, dir: ab.clone().normalize(), kind: "special", move: "rift", knock: 3 });
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
                this.damage(t, { dmg: 22 * Math.max(1, this.loadout.power("shadow_dash")) * this.mods.dmg, dir, kind: "element", move: "inkclone", element: "shadow", proc: true, knock: 6 });
                if (this.loadout.has("frozen_shade")) t.freeze(1.5);
              }
            if (this.loadout.has("creeping_doom")) this.cloud(h.pos, 2.4, 3.5);
          }
          break;
        case "wave": {
          const step = Math.min(h.left, 24 * dt);
          h.pos.addScaledVector(h.dir, step);
          h.left -= step;
          if (Math.abs(h.pos.x) > this.room.hx || Math.abs(h.pos.z) > this.room.hz) h.left = 0;
          this.fx.sparks(v1.set(h.pos.x, 0.2, h.pos.z), h.color, 3, 5);
          if (!h.dmg) this.fx.fire(h.pos, 1, 0.5, 1);
          else this.fx.emit({ x: h.pos.x, y: 0.6, z: h.pos.z, color: h.color, size: 0.5, life: 0.18, additive: true, shrink: true });
          if (Math.random() < 0.6) this.fx.decal(h.pos.x, h.pos.z, 0.9, new THREE.Color(0.02, 0.015, 0.01));
          for (const t of this.targets()) {
            if (h.hit.has(t.id)) continue;
            if (Math.hypot(t.pos.x - h.pos.x, t.pos.z - h.pos.z) < t.radius + 1.3) {
              h.hit.add(t.id);
              if (h.dmg) this.damage(t, { dmg: h.dmg * this.mods.dmg, dir: h.dir, kind: "special", move: h.move ?? "wave", knock: 3, element: this.loadout.slots.blade?.element ?? null });
              else this.damage(t, { dmg: 45 * this.mods.dmg, dir: h.dir, kind: "splitter", move: "splitter", knock: 5, launch: 6, heavy: true });
            }
          }
          break;
        }
        case "blast":
          h.t -= dt;
          if (Math.random() < dt * 30) this.fx.embers(h.pos, 1, 1.5);
          if (h.t <= 0) {
            this.fx.endTel(h.tel);
            this.fx.ring(h.pos, 0.3, 3, new THREE.Color(3, 1.1, 0.2), 0.4);
            this.fx.fire(h.pos, 20, 2.4, 1.6);
            this.fx.sparks(v1.set(h.pos.x, 0.8, h.pos.z), new THREE.Color(3, 1.2, 0.3), 24, 8);
            this.audio.boom(1.2);
            this.shake(0.3);
            const p = this.player.pos;
            if (Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < 2.8) this.player.receive(null, h.pos, 20, { parryable: false, kind: "aoe", knock: 9 });
            for (const t of this.targets())
              if (t.pos.distanceTo(h.pos) < 2.8 + t.radius) this.damage(t, { dmg: 40, dir: v2.subVectors(t.pos, h.pos).setY(0).normalize().clone(), kind: "element", move: "volatile", knock: 8, element: "fire", proc: true });
          }
          break;
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
    if (!this.focusOverride && this.phase === "doors") {
      const open = this.room.doors.filter((d) => d.open);
      if (open.length) {
        v2.set(0, 0, 0);
        for (const d of open) v2.add(d.pos).addScaledVector(d.normal, 3);
        target.lerp(v2.divideScalar(open.length), this.shop ? 0.25 : 0.55);
      }
    }
    this.focus.lerp(target, 1 - Math.exp(-real * (this.focusOverride ? 4 : 7)));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-real * 5));
    const aspect = this.camera.aspect;
    const base = (this.boss?.final ? 23 : this.boss ? 20 : 16.5) * (aspect < 1 ? 1.55 : aspect < 1.3 ? 1.2 : 1);
    const dist = base * this.zoom * (this.phase === "doors" && !this.shop ? 1.22 : this.stable ? 1.08 : 1);
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

/** Health bars above living enemies (bosses use the big bar), plus the floating damage numbers. */
  private updateEnemyBars(real: number) {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const v = v3;
    const project = (p: THREE.Vector3, out: { x: number; y: number }) => {
      v.copy(p).project(this.camera);
      if (v.z > 1) return false;
      out.x = (v.x * 0.5 + 0.5) * w;
      out.y = (-v.y * 0.5 + 0.5) * h;
      return out.x > -40 && out.x < w + 40 && out.y > -40 && out.y < h + 40;
    };
    const bars: EnemyBar[] = [];
    const o = { x: 0, y: 0 };
    for (const e of this.enemies) {
      if (!e.alive || e.state === "spawn") continue;
      const top = e.c.root.position.y + e.c.size.y * e.c.root.scale.y + 0.35;
      if (!project(v.set(e.pos.x, top, e.pos.z), o)) continue;
      bars.push({
        id: e.id,
        x: o.x,
        y: o.y,
        hp: Math.max(0, e.hp / e.maxHp),
        shield: e.shield > 0 ? e.shield / (e.maxHp * 0.6) : 0,
        wide: e.kind === "golem" || !!e.elite,
        elite: e.elite ? `#${ELITE_COLOR[e.elite].clone().multiplyScalar(0.45).getHexString()}` : null,
      });
    }
    this.hud.enemyBars(bars, real);
    this.hud.updateNumbers(real, project);
  }

/** Door rewards and shop prices as screen labels; doors off-screen get pinned to the edge with an arrow. */
  private updateMarkers() {
    if (this.paused) return this.hud.markers([]);
    const list: Marker[] = [];
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const pad = 70;
    const v = new THREE.Vector3();
    const place = (world: THREE.Vector3, m: Omit<Marker, "x" | "y" | "arrow">, pin: boolean, offOnly = false) => {
      v.copy(world).project(this.camera);
      let x = (v.x * 0.5 + 0.5) * w;
      let y = (-v.y * 0.5 + 0.5) * h;
      const behind = v.z > 1;
      if (behind) {
        x = w - x;
        y = h - y;
      }
      const off = behind || x < pad || x > w - pad || y < pad + 40 || y > h - pad;
      if (off && !pin) return;
      if (!off && offOnly) return;
      let arrow: number | null = null;
      if (off) {
        const cx = w / 2;
        const cy = h / 2;
        arrow = Math.atan2(y - cy, x - cx);
        x = Math.min(w - pad - 40, Math.max(pad + 40, x));
        y = Math.min(h - pad, Math.max(pad + 60, y));
      }
      list.push({ ...m, x, y, arrow });
    };
    if (this.phase === "doors" || this.phase === "loot") {
      for (const d of this.room.doors) {
        if (!d.open || !d.plan) continue;
        const icon = doorIcon(d.plan);
        const r = d.plan.reward;
        const t = d.plan.type;
        const title =
          t === "shop" ? "Bone Merchant" : t === "fountain" ? "Blood Fountain" : t === "boss" ? "The Warden" : t === "miniboss" ? "The Pit Butcher" : r ? rewardLabel(r) : "Chamber";
        const sub = t === "elite" ? "Elite chamber" : t === "abyss" ? "Abyss · costs 20% HP" : t === "miniboss" ? "Mini-boss" : t === "boss" ? "Boss" : t === "combat" ? "" : "";
        const color = t === "elite" ? "#ff4a3a" : t === "abyss" ? "#c06bff" : ICON_COLOR[icon];
        place(v.copy(d.pos).addScaledVector(d.normal, 2.4).setY(0.4).clone(), { icon, title, sub, color }, true, !!this.shop);
      }
    }
    if (this.orb && this.plan.reward) {
      const kind = rewardIcon(this.plan.reward);
      place(this.orb.position.clone().setY(3.1), { icon: kind, title: rewardLabel(this.plan.reward), sub: "Walk over to claim", color: ICON_COLOR[kind] }, true);
    }
    if (this.stable)
      for (const s of this.stable.spots) {
        const near = Math.hypot(this.player.pos.x - s.pos.x, this.player.pos.z - s.pos.z) < s.r + 3;
        const t = s.id === "altar" ? { title: "Altar of Scars", sub: `${this.save.embers} Embers`, color: "#ff3a3a", icon: "embers" as IconKind } : { title: NPC[s.id].name, sub: NPC[s.id].title, color: { krag: "#ff9a4a", seer: "#c9b6ff", steed: "#7fd8ff" }[s.id], icon: (s.id === "steed" ? "souls" : s.id === "seer" ? "shadow" : "anvil") as IconKind };
        if (near || s.id === "steed") place(s.pos.clone().setY(s.head), { ...t, sub: near ? `${t.sub} · Press F` : t.sub }, false);
      }
    if (this.armoury)
      for (const r of this.armoury.racks) {
        const w = WEAPONS[r.id];
        const on = r.id === this.player.w.id;
        // In the stable only the rack you stand at is labelled.
        if (this.stable && Math.hypot(this.player.pos.x - r.pos.x, this.player.pos.z - r.pos.z) > 2.2) continue;
        place(r.pos.clone().setY(3.2), { icon: "move", title: w.name, sub: on ? `Equipped · ${this.player.asp.name.replace("Aspect of the ", "")}` : "Press F", color: on ? "#ffd24a" : `#${w.trail.clone().multiplyScalar(2.2).getHexString()}` }, false);
      }
    if (this.shop)
      for (const it of this.shop.items) {
        if (it.sold) continue;
        place(it.pos.clone().setY(2.4), { icon: shopIcon(it.item), title: itemName(it.item).replace(/ \(.*\)$/, ""), sub: `${it.item.price} coins${this.coins < it.item.price ? " · can't afford" : ""}`, color: this.coins >= it.item.price ? "#ffd24a" : "#9a7a70" }, false);
      }
    this.hud.markers(list);
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
      if (this.stable) {
        this.stable.update(real, this.fx, this.player.pos);
        this.fx.update(real);
      }
      if (this.lord) {
        this.lord.update(real, this.fx);
        this.fx.update(real);
        this.updateCamera(real);
      }
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
    this.updateFallers(dt);
    this.updateStatus(dt);
    this.room.update(dt, this.fx);
    if (this.phase === "fight" || this.phase === "killcam") this.room.updateTraps(dt, this);
    this.shop?.update(dt, this.fx);
    this.fountain?.update(dt, this.fx);
    this.armoury?.update(dt, this.player.w.id);
    this.stable?.update(dt, this.fx, this.player.pos);
    this.updateLord(real);
    this.fx.update(dt);
    this.updateFlow(dt, real);
    const inCombat = this.phase === "fight" && (this.enemies.some((e) => e.alive) || !!this.boss?.alive);
    this.style.update(real, inCombat);
    this.audio.setIntensity(inCombat ? 0.2 + (this.style.rank / 6) * 0.8 : 0.35);
    this.hud.update(this, real);
    this.updateCamera(real);
    this.updateMarkers();
    this.updateEnemyBars(real);
    this.room.fadeOccluders(this.player.pos, this.camera.position, real);
    this.composer.render();
    this.input.endFrame();
  }
}


const CLOUD_COL = new THREE.Color(0.14, 0.26, 0.05);
const ROT_COL = new THREE.Color(0.6, 1.4, 0.25);
const BLEED_COL = new THREE.Color(0.5, 0.0, 0.03);
function burning(t: Target) {
  return ((t as unknown as { burnT?: number }).burnT ?? 0) > 0;
}
function chilled(t: Target) {
  return ((t as unknown as { chillT?: number }).chillT ?? 0) > 0 || t.frozen();
}
