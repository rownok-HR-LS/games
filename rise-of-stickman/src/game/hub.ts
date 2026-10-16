// The Forsaken Stable: the hub between runs. A ruined hell-stable on a rock over the lava: broken
// stone stalls under charred beams with chains swinging from them, hay burning with blue soul-fire,
// lava glowing up through holes in the floor. Old Krag works his forge by the weapon racks, the Hollow
// Seer floats in her candle shrine, the Altar of Scars bleeds, and Ashmane waits to ride out.
import * as THREE from "three";
import { Creature } from "./creatures";
import type { Fx } from "./fx";
import { glowTexture, wallTexture } from "./textures";
import { chain } from "./world";

export type HubSpotId = "krag" | "seer" | "steed" | "altar";
export type HubSpot = { id: HubSpotId; pos: THREE.Vector3; r: number; head: number };

type Fire = { pos: THREE.Vector3; spread: number; light: THREE.PointLight; base: number; kind: "soul" | "forge" | "lava" };
type Swing = { obj: THREE.Object3D; phase: number; amp: number };
type Candle = { s: THREE.Sprite; base: number };

const v = new THREE.Vector3();
const c1 = new THREE.Color();

/** Room size used for the stable (half extents). */
export const HUB_SIZE: [number, number] = [12, 10];

/** Floor holes into the lava: [x, z, radius]. */
const HOLES: [number, number, number][] = [
  [-4.6, 1.6, 1.0],
  [1.6, 6.8, 0.85],
  [9.6, 5.8, 1.1],
  [2.2, -5.6, 0.75],
];

/** Where the wall decor of the room must stay clear (stalls, forge, shrine). */
export const HUB_AVOID: { x: number; z: number; r: number }[] = [
  { x: 7.5, z: -10, r: 2.4 },
  { x: -2, z: -10, r: 1.6 },
  { x: -12, z: -3, r: 2 },
  { x: -12, z: 5.4, r: 2.2 },
];

/** Weapon rack spots, next to Krag. */
export const RACK_SPOTS = [new THREE.Vector3(0.9, 0, -2.8), new THREE.Vector3(3.1, 0, -2.3), new THREE.Vector3(5.3, 0, -2.3), new THREE.Vector3(7.5, 0, -2.8)];

export class Stable {
  readonly group = new THREE.Group();
  readonly spots: HubSpot[] = [];
  /** Solid circles (added to the room's pillars). */
  readonly blockers: { x: number; z: number; r: number }[] = [];
  readonly krag: Creature;
  readonly seer: Creature;
  readonly steed: Creature;
  private steedRoot = new THREE.Group();
  private seerRoot = new THREE.Group();
  private fires: Fire[] = [];
  private swings: Swing[] = [];
  private candles: Candle[] = [];
  private lavaMats: THREE.MeshStandardMaterial[] = [];
  private scarMat: THREE.MeshStandardMaterial;
  private poolMat: THREE.MeshStandardMaterial;
  private anvilTop = new THREE.Vector3(8.3, 1.05, -5.6);
  private time = 0;
  private kragT = 3;
  private talkT: Partial<Record<HubSpotId, number>> = {};
  private steedT = 4;
  private riding = false;
  private rim = { value: 0.9 };

  constructor() {
    const g = this.group;
    const stoneTex = wallTexture([60, 46, 44], 11);
    stoneTex.repeat.set(1, 1);
    const stone = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x8a7a74, roughness: 0.95 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x2c1c14, roughness: 0.92 });
    const charred = new THREE.MeshStandardMaterial({ color: 0x140c0a, roughness: 1, emissive: new THREE.Color(0.25, 0.05, 0.01), emissiveIntensity: 0.6 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2626, roughness: 0.45, metalness: 0.85 });
    const hay = new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 1 });
    const glow = glowTexture();
    const rnd = mulberry(77);

    // ── Stalls along the north wall: broken stone partitions, charred posts, burning hay ──
    for (const x of [-11.3, -8.0, -4.7]) {
      // Broken half-wall: three blocks stepping down toward the room.
      let h = 1.7 + rnd() * 0.5;
      for (let k = 0; k < 3; k++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 1.05), stone);
        seg.position.set(x, h / 2, -9.4 + k * 1.05);
        seg.rotation.y = (rnd() - 0.5) * 0.06;
        seg.castShadow = seg.receiveShadow = true;
        g.add(seg);
        h *= 0.55 + rnd() * 0.3;
      }
      this.blockers.push({ x, z: -9.2, r: 0.5 }, { x, z: -8.2, r: 0.45 });
      // Post up to the beam.
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.8, 0.3), wood);
      post.position.set(x, 3.4, -7.0);
      post.rotation.z = (rnd() - 0.5) * 0.05;
      post.castShadow = true;
      g.add(post);
      this.blockers.push({ x, z: -7.0, r: 0.35 });
    }
    // Hay in the two stall bays, burning with blue soul-fire.
    for (const x of [-9.65, -6.35]) this.hayPile(x, -8.6, 1.2, hay, true);
    // Beams: one along the stalls, one along the west wall, one broken across the corner.
    this.beam(new THREE.Vector3(-12, 6.8, -7.0), new THREE.Vector3(-0.8, 6.6, -7.0), 0.36, charred);
    this.beam(new THREE.Vector3(-10.4, 7.2, -10), new THREE.Vector3(-10.4, 6.9, 8.5), 0.36, charred);

    // A fallen beam lying on the floor.
    const fallen = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.32, 0.34), charred);
    fallen.position.set(-6.6, 0.3, 3.9);
    fallen.rotation.set(0.05, 0.7, 0.18);
    fallen.castShadow = true;
    g.add(fallen);
    this.blockers.push({ x: -7.4, z: 4.6, r: 0.5 }, { x: -5.8, z: 3.2, r: 0.5 });
    // Chains swinging from the beams.
    for (const [x, z, len] of [
      [-10.0, -7.0, 2.8],
      [-7.0, -7.0, 3.6],
      [-3.0, -7.0, 2.4],
      [-10.4, -1.0, 3.2],
      [-10.4, 1.8, 2.2],
      [-10.4, 7.0, 3.0],
    ] as [number, number, number][]) {
      const top = new THREE.Vector3(x, x === -10.4 ? 6.95 : 6.6, z);
      this.hangChain(top, len, iron, rnd);
    }
    // Wall shackles.
    for (const [x, z] of [
      [-12, -6.0],
      [-12, 1.0],
      [-0.2, -10],
    ]) {
      const a = new THREE.Vector3(x + (x === -12 ? 0.75 : -0.6), 3.4, z + (x === -12 ? -0.6 : 0.75));
      const b = new THREE.Vector3(x + (x === -12 ? 0.75 : 0.6), 3.4, z + (x === -12 ? 0.6 : 0.75));
      g.add(chain(a, b, 0.9, iron));
    }

    // ── Lava holes ──
    for (const [x, z, r] of HOLES) this.lavaHole(x, z, r, rnd);

    // ── Straw strewn across the floor ──
    const straw = new THREE.MeshBasicMaterial({ map: strawTexture(), transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1 });
    for (let i = 0; i < 16; i++) {
      const x = -11 + rnd() * 21;
      const z = -9 + rnd() * 18;
      if (HOLES.some(([hx, hz, hr]) => Math.hypot(hx - x, hz - z) < hr + 1)) continue;
      const s = 1.4 + rnd() * 2.2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), straw);
      p.position.set(x, 0.012, z);
      p.rotation.y = rnd() * Math.PI;
      g.add(p);
    }

    // ── Krag's forge ──
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.9), stone);
    hearth.position.set(7.5, 0.6, -8.9);
    hearth.castShadow = hearth.receiveShadow = true;
    g.add(hearth);
    const coals = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.4).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x140806, emissive: new THREE.Color(0.7, 0.16, 0.02), emissiveIntensity: 1, roughness: 1 }),
    );
    coals.position.set(7.5, 1.21, -8.9);
    g.add(coals);
    this.lavaMats.push(coals.material as THREE.MeshStandardMaterial);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.1, 2.6, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0x1e1816, metalness: 0.6, roughness: 0.6, side: THREE.DoubleSide }));
    hood.rotation.y = Math.PI / 4;
    hood.position.set(7.5, 3.9, -9.1);
    g.add(hood);
    const flue = new THREE.Mesh(new THREE.BoxGeometry(1.0, 4.4, 1.0), stone);
    flue.position.set(7.5, 7.4, -9.4);
    g.add(flue);
    this.blockers.push({ x: 6.3, z: -8.8, r: 0.95 }, { x: 7.5, z: -8.8, r: 0.95 }, { x: 8.7, z: -8.8, r: 0.95 });
    const forgeLight = new THREE.PointLight(0xff6a1a, 12, 11, 1.6);
    forgeLight.position.set(7.5, 2.2, -7.4);
    g.add(forgeLight);
    this.fires.push({ pos: new THREE.Vector3(7.5, 1.25, -8.9), spread: 1.2, light: forgeLight, base: 12, kind: "forge" });
    // Anvil (and a hammer resting on it), a quench barrel, a heap of blades.
    const anvil = new THREE.Group();
    anvil.position.set(this.anvilTop.x, 0, this.anvilTop.z);
    anvil.rotation.y = 0.5;
    const ab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.7), iron);
    ab.position.y = 0.15;
    const aw = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.4), iron);
    aw.position.y = 0.52;
    const at = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.5), iron);
    at.position.y = 0.88;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 10).rotateZ(Math.PI / 2), iron);
    horn.position.set(-0.92, 0.9, 0);
    for (const m of [ab, aw, at, horn]) {
      m.castShadow = true;
      anvil.add(m);
    }
    const hammer = new THREE.Group();
    const hh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.18), iron);
    const hs = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6).rotateZ(Math.PI / 2), wood);
    hs.position.x = 0.5;
    hammer.add(hh, hs);
    hammer.position.set(0.2, 1.12, 0.05);
    hammer.rotation.y = 0.6;
    anvil.add(hammer);
    g.add(anvil);
    this.blockers.push({ x: this.anvilTop.x, z: this.anvilTop.z, r: 0.75 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1.0, 12), wood);
    barrel.position.set(10.2, 0.5, -8.4);
    barrel.castShadow = true;
    g.add(barrel);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.46, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050a0c, roughness: 0.05, metalness: 0.4 }));
    water.position.set(10.2, 0.98, -8.4);
    g.add(water);
    this.blockers.push({ x: 10.2, z: -8.4, r: 0.6 });
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4 + rnd() * 0.6, 0.02), iron);
      blade.position.set(9.6 + rnd() * 1.2, 0.6, -6.6 + rnd() * 0.6);
      blade.rotation.set((rnd() - 0.5) * 0.6, rnd() * 3, 0.3 + rnd() * 0.5);
      g.add(blade);
    }
    // Krag himself, beside the anvil.
    this.krag = new Creature({ key: "smith", height: 3.3, yaw: 0, glow: [0.05, 0.02, 0.01], clips: { idle: { name: "Armature|Ideal" }, work: { name: "Armature|Slam" }, talk: { name: "Armature|Roar2" } } });
    // The model ships with a flat ground plane under the ogre: hide it.
    this.krag.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const s = m.geometry.boundingBox!.getSize(v);
      if (!(m as THREE.SkinnedMesh).isSkinnedMesh && Math.min(s.x, s.y, s.z) < Math.max(s.x, s.y, s.z) * 0.03) m.visible = false;
    });
    this.krag.root.position.set(9.9, 0, -4.4);
    this.krag.root.rotation.y = Math.atan2(this.anvilTop.x - 9.9, this.anvilTop.z + 4.4) + 0.5;
    this.krag.play("idle");
    g.add(this.krag.root);
    this.blockers.push({ x: 9.9, z: -4.4, r: 0.9 });
    this.spots.push({ id: "krag", pos: new THREE.Vector3(9.9, 0, -4.4), r: 2.6, head: 3.7 });

    // ── The Altar of Scars: a bleeding monolith ──
    const altar = new THREE.Group();
    altar.position.set(-1.8, 0, -7.7);
    const scar = scarTextures();
    this.scarMat = new THREE.MeshStandardMaterial({ map: scar.map, emissiveMap: scar.glow, emissive: new THREE.Color(0.6, 0.02, 0.02), emissiveIntensity: 1, roughness: 0.85 });
    const mono = new THREE.Mesh(roughBox(1.7, 4.0, 1.1, 0.12, rnd), this.scarMat);
    mono.position.y = 2.0;
    mono.rotation.set(0.04, 0.35, -0.05);
    mono.castShadow = true;
    altar.add(mono);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, 0.3, 8), stone);
    step.position.y = 0.15;
    step.receiveShadow = true;
    altar.add(step);
    this.poolMat = new THREE.MeshStandardMaterial({ color: 0x2a0003, emissive: new THREE.Color(0.32, 0.0, 0.01), emissiveIntensity: 0.8, roughness: 0.08, metalness: 0.3 });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28).rotateX(-Math.PI / 2), this.poolMat);
    pool.position.y = 0.31;
    pool.scale.set(1, 1, 0.75);
    altar.add(pool);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.9 + rnd() * 0.6, 5), iron);
      sp.position.set(Math.cos(a) * 2.0, 0.6, Math.sin(a) * 2.0 * 0.85);
      sp.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      altar.add(sp);
    }
    const altarLight = new THREE.PointLight(0xff1a22, 5, 7, 1.7);
    altarLight.position.set(0, 2.4, 1.6);
    altar.add(altarLight);
    g.add(altar);
    this.blockers.push({ x: -1.8, z: -7.7, r: 1.5 });
    this.spots.push({ id: "altar", pos: new THREE.Vector3(-1.8, 0, -7.7), r: 3.0, head: 4.8 });

    // ── The Hollow Seer's shrine ──
    const shrine = new THREE.Group();
    shrine.position.set(-10.2, 0, -3);
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.32, 20), stone);
    dais.position.y = 0.16;
    dais.receiveShadow = true;
    shrine.add(dais);
    const ward = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.25, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.45, 1.2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ward.position.y = 0.02;
    shrine.add(ward);
    const wax = new THREE.MeshStandardMaterial({ color: 0xd9cfb8, roughness: 0.8 });
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 1.25 + rnd() * 1.0;
      const h = 0.15 + rnd() * 0.5;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (x < -1.2) continue; // not inside the wall
      const y0 = d < 1.75 ? 0.32 : 0;
      const cnd = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 7), wax);
      cnd.position.set(x, y0 + h / 2, z);
      shrine.add(cnd);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.5, 0.9, 0.5), blending: THREE.AdditiveBlending, depthWrite: false }));
      f.position.set(x, y0 + h + 0.08, z);
      f.scale.setScalar(0.22);
      shrine.add(f);
      this.candles.push({ s: f, base: 0.22 });
    }
    // A hanging lantern.
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x110c18, emissive: new THREE.Color(0.8, 0.6, 1.4), emissiveIntensity: 1 }));
    lantern.position.set(0.6, 4.6, 0);
    shrine.add(lantern);
    shrine.add(chain(new THREE.Vector3(0.6, 7.0, 0), new THREE.Vector3(0.61, 4.8, 0), 0, iron));
    const seerLight = new THREE.PointLight(0xb8a0ff, 8, 8, 1.7);
    seerLight.position.set(1.4, 2.6, 0);
    shrine.add(seerLight);
    g.add(shrine);
    this.seer = new Creature({ key: "oracle", height: 2.9, yaw: 0, glow: [0.02, 0.01, 0.03], clips: {} });
    this.seerRoot.position.set(-10.2, 0.45, -3);
    this.seerRoot.rotation.y = Math.PI / 2 - 0.35;
    this.seerRoot.add(this.seer.root);
    g.add(this.seerRoot);
    this.blockers.push({ x: -10.2, z: -3, r: 1.8 });
    this.spots.push({ id: "seer", pos: new THREE.Vector3(-10.2, 0, -3), r: 3.2, head: 3.9 });

    // ── Ashmane, the Spectral Steed ──
    const trough = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 2.6), wood);
    trough.position.set(-11.2, 0.35, 5.4);
    trough.castShadow = true;
    g.add(trough);
    this.hayPile(-11.2, 5.4, 0.8, hay, true, 0.75);
    for (const z of [3.5, 7.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7.0, 0.3), wood);
      post.position.set(-10.4, 3.5, z);
      post.castShadow = true;
      g.add(post);
      this.blockers.push({ x: -10.4, z, r: 0.35 });
    }
    this.blockers.push({ x: -11.2, z: 4.6, r: 0.6 }, { x: -11.2, z: 6.2, r: 0.6 });
    this.steed = new Creature({
      key: "steed",
      height: 2.5,
      yaw: 0,
      glow: [0.05, 0.12, 0.3],
      clips: { idle: { name: "Skeleton|1 Ilde" }, idle2: { name: "Skeleton|2 Ilde" }, eat: { name: "Skeleton|6 Eat" }, rear: { name: "Skeleton|Buck_1" }, gallop: { name: "Skeleton|Gallop" } },
    });
    this.spectral(this.steed);
    this.steedRoot.position.set(-8.4, 0, 5.4);
    this.steedRoot.rotation.y = Math.atan2(1, -0.55);
    this.steedRoot.add(this.steed.root);
    this.steed.play("idle");
    g.add(this.steedRoot);
    const steedLight = new THREE.PointLight(0x4aa8ff, 7, 8, 1.7);
    steedLight.position.set(-7.6, 2.6, 6.2);
    g.add(steedLight);
    this.blockers.push({ x: -8.4, z: 5.4, r: 0.9 }, { x: -7.4, z: 4.8, r: 0.7 }, { x: -9.4, z: 6.0, r: 0.7 });
    this.spots.push({ id: "steed", pos: new THREE.Vector3(-8.0, 0, 5.2), r: 2.8, head: 3.4 });
  }

  /** A burning heap of hay (blue soul-fire). */
  private hayPile(x: number, z: number, r: number, mat: THREE.Material, burn: boolean, y = 0) {
    const pile = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), mat);
    pile.scale.set(1, 0.42, 0.9);
    pile.position.set(x, y + r * 0.2, z);
    pile.castShadow = true;
    this.group.add(pile);
    if (!burn) return;
    const light = new THREE.PointLight(0x3a9cff, 4, 6, 1.7);
    light.position.set(x, y + 1.8, z + 0.6);
    this.group.add(light);
    this.fires.push({ pos: new THREE.Vector3(x, y + r * 0.45, z), spread: r * 1.1, light, base: 4, kind: "soul" });
  }

  private beam(a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w * 1.2, len), mat);
    m.position.lerpVectors(a, b, 0.5);
    m.lookAt(b);
    m.castShadow = true;
    this.group.add(m);
  }

  private hangChain(top: THREE.Vector3, len: number, iron: THREE.Material, rnd: () => number) {
    const pivot = new THREE.Group();
    pivot.position.copy(top);
    const links = chain(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.001, -len, 0), 0, iron);
    pivot.add(links);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI * 1.3), iron);
    hook.position.y = -len - 0.15;
    hook.rotation.z = Math.PI * 0.85;
    pivot.add(hook);
    this.group.add(pivot);
    this.swings.push({ obj: pivot, phase: rnd() * 6, amp: 0.05 + rnd() * 0.05 });
  }

  private lavaHole(x: number, z: number, r: number, rnd: () => number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a0300, emissive: new THREE.Color(0.9, 0.2, 0.03), emissiveIntensity: 1, roughness: 0.6 });
    this.lavaMats.push(mat);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), mat);
    lava.position.set(x, 0.015, z);
    this.group.add(lava);
    // Dark crust in the middle so it reads as depth.
    const deep = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.72, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a0300, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    deep.position.set(x + 0.08, 0.02, z - 0.05);
    this.group.add(deep);
    // Broken rim stones.
    const rock = new THREE.MeshStandardMaterial({ color: 0x241a18, roughness: 1 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.4;
      const s = 0.18 + rnd() * 0.22;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
      st.position.set(x + Math.cos(a) * r, s * 0.3, z + Math.sin(a) * r);
      st.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      st.castShadow = true;
      this.group.add(st);
    }
    const light = new THREE.PointLight(0xff5a14, 3, 3 + r * 2, 1.8);
    light.position.set(x, 0.6, z);
    this.group.add(light);
    this.fires.push({ pos: new THREE.Vector3(x, 0.05, z), spread: r * 0.8, light, base: 3, kind: "lava" });
    this.blockers.push({ x, z, r: r + 0.1 });
  }

  /** Ghostly blue horse: dark body, blue Fresnel rim, faint inner glow. */
  private spectral(c: Creature) {
    const rimCol = new THREE.Color(0.25, 0.75, 2.2);
    for (const m of c.materials()) {
      m.color.multiplyScalar(0.35).lerp(new THREE.Color(0.1, 0.16, 0.3), 0.5);
      if (m.emissiveMap) m.emissiveIntensity = 0.3;
      const rim = this.rim;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.rimColor = { value: rimCol };
        sh.uniforms.rimStrength = rim;
        sh.fragmentShader = sh.fragmentShader
          .replace("void main() {", "uniform vec3 rimColor;\nuniform float rimStrength;\nvoid main() {")
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += rimColor * rimStrength * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);",
          );
      };
      m.customProgramCacheKey = () => "steedRim";
      m.needsUpdate = true;
    }
  }

  /** An NPC turns to talk. */
  talk(id: HubSpotId) {
    this.talkT[id] = 2.2;
    if (id === "krag") this.krag.play("talk", { loop: false, fade: 0.25 });
    if (id === "steed") this.steed.play("idle2", { fade: 0.3 });
  }

  /** Ashmane rears; the run starts once she lands. */
  rideOut() {
    this.riding = true;
    this.steed.play("rear", { loop: false, fade: 0.15 });
  }

  update(dt: number, fx: Fx, hero: THREE.Vector3) {
    this.time += dt;
    const t = this.time;
    for (const k of Object.keys(this.talkT) as HubSpotId[]) this.talkT[k] = Math.max(0, (this.talkT[k] ?? 0) - dt);
    // Krag: hammering at the anvil between rests, sparks on each blow.
    const kc = this.krag;
    if (kc.current === "talk" && kc.progress() >= 1) kc.play("idle", { fade: 0.4 });
    if (kc.current === "idle" && (this.kragT -= dt) <= 0) {
      kc.play("work", { loop: false, fade: 0.25, speed: 0.9 });
      this.kragT = 5 + Math.random() * 4;
    }
    if (kc.current === "work") {
      const p = kc.progress();
      if (p > 0.45 && p < 0.47 + dt) {
        fx.sparks(v.copy(this.anvilTop).setY(1.1), c1.setRGB(3, 1.4, 0.4), 18, 6);
        fx.flash(v.copy(this.anvilTop).setY(1.2), c1.setRGB(1.6, 0.7, 0.2), 0.8, 0.08);
      }
      if (p >= 1) kc.play("idle", { fade: 0.4 });
    }
    // Turn Krag toward the hero while talking.
    const want = (this.talkT.krag ?? 0) > 0 ? Math.atan2(hero.x - kc.root.position.x, hero.z - kc.root.position.z) : Math.atan2(this.anvilTop.x - 9.9, this.anvilTop.z + 4.4) + 0.5;
    kc.root.rotation.y += angleDiff(want, kc.root.rotation.y) * Math.min(1, dt * 3);
    kc.update(dt);
    // The Seer floats and sways.
    this.seerRoot.position.y = 0.45 + Math.sin(t * 1.1) * 0.12;
    this.seerRoot.rotation.z = Math.sin(t * 0.7) * 0.04;
    const seerWant = (this.talkT.seer ?? 0) > 0 ? Math.atan2(hero.x - this.seerRoot.position.x, hero.z - this.seerRoot.position.z) : Math.PI / 2 - 0.35;
    this.seerRoot.rotation.y += angleDiff(seerWant, this.seerRoot.rotation.y) * Math.min(1, dt * 2);
    this.seer.update(dt);
    if (Math.random() < dt * 5) fx.emit({ x: -10.2 + (Math.random() - 0.5) * 1.6, y: 0.6 + Math.random() * 2.4, z: -3 + (Math.random() - 0.5) * 1.6, vy: 0.25, color: c1.setRGB(0.7, 0.55, 1.4), size: 0.05, life: 1.8, additive: true, drag: 0.6 });
    // Ashmane: idles, eats, stamps; rears when riding out.
    const sc = this.steed;
    if (!this.riding) {
      if ((sc.current === "eat" || sc.current === "idle2") && sc.progress() >= 1) sc.play("idle", { fade: 0.4 });
      if (sc.current === "idle" && (this.steedT -= dt) <= 0) {
        sc.play(Math.random() < 0.5 ? "eat" : "idle2", { loop: false, fade: 0.4 });
        this.steedT = 6 + Math.random() * 6;
      }
    }
    sc.update(dt);
    this.rim.value = 0.75 + Math.sin(t * 2.2) * 0.2;
    // Blue flame along her mane and hooves.
    if (Math.random() < dt * 26) {
      const yaw = this.steedRoot.rotation.y;
      const along = 0.4 + Math.random() * 0.8;
      const x = this.steedRoot.position.x + Math.sin(yaw) * along;
      const z = this.steedRoot.position.z + Math.cos(yaw) * along;
      fx.emit({ x, y: 1.9 + along * 0.35 + Math.random() * 0.2, z, vx: -Math.sin(yaw) * 0.4, vy: 0.9 + Math.random() * 0.5, vz: -Math.cos(yaw) * 0.4, color: c1.setRGB(0.35, 0.9, 2.4), size: 0.14 + Math.random() * 0.1, life: 0.45, additive: true, shrink: true, drag: 1 });
    }
    // Fires: blue soul-fire on the hay, the forge, lava breathing up through the holes.
    for (const f of this.fires) {
      const flick = 0.85 + Math.sin(t * 11 + f.pos.x * 3) * 0.08 + Math.random() * 0.1;
      f.light.intensity = f.base * flick;
      const rate = f.kind === "lava" ? 3 : f.kind === "forge" ? 20 : 16;
      if (Math.random() >= dt * rate) continue;
      const ox = (Math.random() - 0.5) * f.spread;
      const oz = (Math.random() - 0.5) * f.spread;
      if (f.kind === "soul") {
        const hot = Math.random();
        fx.emit({ x: f.pos.x + ox, y: f.pos.y, z: f.pos.z + oz, vx: (Math.random() - 0.5) * 0.3, vy: 1.0 + Math.random() * 1.0, vz: (Math.random() - 0.5) * 0.3, color: c1.setRGB(0.14 + hot * 0.24, 0.45 + hot * 0.4, 1.9), size: 0.15 + Math.random() * 0.12, life: 0.45 + Math.random() * 0.3, additive: true, shrink: true, drag: 1.1 });
      } else if (f.kind === "forge") {
        const hot = Math.random();
        fx.emit({ x: f.pos.x + ox, y: f.pos.y, z: f.pos.z + oz * 0.6, vx: (Math.random() - 0.5) * 0.3, vy: 0.9 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.3, color: c1.setRGB(1.3 + hot * 0.4, 0.36 + hot * 0.2, 0.05), size: 0.18 + Math.random() * 0.12, life: 0.4 + Math.random() * 0.3, additive: true, shrink: true, drag: 1.2 });
        if (Math.random() < 0.15) fx.embers(f.pos, 1, 0.6);
      } else fx.embers(v.set(f.pos.x + ox, 0.1, f.pos.z + oz), 1, 0.3);
    }
    this.lavaMats.forEach((m, i) => (m.emissiveIntensity = 0.85 + Math.sin(t * 1.6 + i * 1.9) * 0.15));
    // The Altar's scars pulse like a heartbeat and bleed.
    const beat = Math.pow(Math.max(0, Math.sin(t * 2.6)), 8);
    this.scarMat.emissiveIntensity = 0.35 + beat * 0.65;
    this.poolMat.emissiveIntensity = 0.5 + beat * 0.5;
    if (Math.random() < dt * 7) {
      const side = Math.random() < 0.5 ? -1 : 1;
      fx.emit({ x: -1.8 + side * (0.2 + Math.random() * 0.5), y: 1.2 + Math.random() * 2.4, z: -7.7 + 0.58, vy: -0.4, color: c1.setRGB(0.45, 0.0, 0.02), size: 0.06, life: 1.0, gravity: 6 });
    }
    // Candles and swinging chains.
    for (const cd of this.candles) cd.s.scale.setScalar(cd.base * (0.85 + Math.random() * 0.3));
    for (const s of this.swings) {
      s.obj.rotation.z = Math.sin(t * 0.9 + s.phase) * s.amp;
      s.obj.rotation.x = Math.sin(t * 0.7 + s.phase * 1.7) * s.amp * 0.6;
    }
  }

  /** Ashmane's rear has finished: time to go. */
  get rodeOut() {
    return this.riding && this.steed.progress() >= 0.85;
  }

  dispose() {
    this.krag.dispose();
    this.seer.dispose();
    this.steed.dispose();
  }
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A box with jittered vertices: a rough hewn stone. */
function roughBox(w: number, h: number, d: number, jitter: number, rnd: () => number) {
  const geo = new THREE.BoxGeometry(w, h, d, 3, 6, 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let off = seen.get(key);
    if (!off) {
      const top = p.getY(i) > h / 2 - 1e-3;
      off = [(rnd() - 0.5) * jitter * 2, top ? (rnd() - 0.8) * jitter * 4 : (rnd() - 0.5) * jitter, (rnd() - 0.5) * jitter * 2];
      seen.set(key, off);
    }
    p.setXYZ(i, p.getX(i) + off[0], p.getY(i) + off[1], p.getZ(i) + off[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Dark stone with glowing gashes, for the Altar of Scars. */
function scarTextures() {
  const S = 256;
  const map = document.createElement("canvas");
  map.width = map.height = S;
  const m = map.getContext("2d")!;
  m.fillStyle = "#2a201e";
  m.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const l = 20 + Math.random() * 40;
    m.fillStyle = `rgba(${l},${l * 0.8},${l * 0.75},0.35)`;
    m.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  const glow = document.createElement("canvas");
  glow.width = glow.height = S;
  const gl = glow.getContext("2d")!;
  gl.fillStyle = "#000";
  gl.fillRect(0, 0, S, S);
  // Gashes: jagged diagonal strokes, darker on the stone, glowing in the emissive map.
  for (let i = 0; i < 9; i++) {
    let x = 20 + Math.random() * (S - 40);
    let y = 10 + Math.random() * 60;
    const pts: [number, number][] = [[x, y]];
    const len = 4 + Math.floor(Math.random() * 5);
    for (let k = 0; k < len; k++) {
      x += (Math.random() - 0.35) * 26;
      y += 14 + Math.random() * 20;
      pts.push([x, y]);
    }
    for (const [ctx, col, w] of [
      [m, "#120404", 6],
      [gl, "#ff2a1a", 3],
    ] as [CanvasRenderingContext2D, string, number][]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
    gl.strokeStyle = "rgba(255,90,60,0.25)";
    gl.lineWidth = 9;
    gl.beginPath();
    pts.forEach(([px, py], k) => (k ? gl.lineTo(px, py) : gl.moveTo(px, py)));
    gl.stroke();
  }
  const tm = new THREE.CanvasTexture(map);
  tm.colorSpace = THREE.SRGBColorSpace;
  const tg = new THREE.CanvasTexture(glow);
  tg.colorSpace = THREE.SRGBColorSpace;
  return { map: tm, glow: tg };
}

/** Loose straw scattered on the floor. */
function strawTexture() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI;
    const r = Math.sqrt(Math.random()) * S * 0.42;
    const x = S / 2 + Math.cos(Math.random() * Math.PI * 2) * r;
    const y = S / 2 + Math.sin(Math.random() * Math.PI * 2) * r;
    const l = 10 + Math.random() * 22;
    const k = 0.6 + Math.random() * 0.4;
    g.strokeStyle = `rgba(${Math.round(170 * k)},${Math.round(140 * k)},${Math.round(70 * k)},${0.5 + Math.random() * 0.5})`;
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
