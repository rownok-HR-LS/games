// Dungeon rooms. Each room is a stone platform hanging over a lava abyss: two tall gothic walls
// at the back (where the doors are), the near edges open to the drop. Floor 1 is the Bone Pits.
import * as THREE from "three";
import type { Fx } from "./fx";
import { doorIcon, type DoorPlan } from "./boons";
import type { Game } from "./game";
import { SpikePlate } from "./traps";
import { floorTextures, glowTexture, iconCanvas, ICON_COLOR, wallTexture, type IconKind } from "./textures";

export type Door = {
  pos: THREE.Vector3;
  /** Direction the door faces (into the room). */
  normal: THREE.Vector3;
  group: THREE.Group;
  portal: THREE.Mesh;
  portalMat: THREE.ShaderMaterial;
  bars: THREE.Group;
  /** Bronze reward medallion hovering in the doorway. */
  medal: THREE.Group;
  medalFace: THREE.MeshBasicMaterial[];
  medalRim: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  rune: THREE.Mesh;
  light: THREE.PointLight;
  plan: DoorPlan | null;
  open: boolean;
  t: number;
};

type Brazier = { pos: THREE.Vector3; light: THREE.PointLight; base: number; coal: THREE.MeshStandardMaterial };

const portalFrag = /* glsl */ `
  varying vec2 vUv; uniform float time; uniform vec3 color; uniform float open;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec2 p = vUv - vec2(0.5, 0.42);
    float r = length(p * vec2(1.0, 0.8));
    float a = atan(p.y, p.x);
    float sw = n(vec2(a * 3.0 + time * 1.5 - r * 8.0, r * 6.0 - time * 2.0));
    float core = smoothstep(0.55, 0.0, r);
    float rays = n(vec2(a * 6.0, time * 0.7)) * smoothstep(0.6, 0.1, r);
    vec3 c = color * (0.06 + sw * 0.28 + rays * 0.12) * core * open;
    c += color * pow(core, 6.0) * 0.22 * open;
    gl_FragColor = vec4(c, 1.0);
  }`;

const lavaFrag = /* glsl */ `
  varying vec2 vUv; uniform float time;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
  void main(){
    vec2 p = vUv * 34.0;
    float flow = fbm(p + vec2(time * 0.06, time * 0.03) + fbm(p * 0.7 - time * 0.04) * 1.5);
    float crust = smoothstep(0.42, 0.62, fbm(p * 0.55 + vec2(-time * 0.015, time * 0.02)));
    vec3 hot = mix(vec3(0.35, 0.03, 0.0), vec3(1.5, 0.42, 0.06), pow(flow, 2.6));
    vec3 c = mix(hot, vec3(0.03, 0.006, 0.0), smoothstep(0.0, 1.0, crust) * 0.92);
    float d = length(vUv - 0.5) * 2.0;
    c *= mix(0.9, 0.05, smoothstep(0.05, 0.75, d));
    gl_FragColor = vec4(c, 1.0);
  }`;

const plainVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Shared resources (built once).
let shared: ReturnType<typeof buildShared> | null = null;
function buildShared() {
  const floor = floorTextures({ stone: [62, 52, 50], grout: "#0d0807", crack: "#ffd27a", glow: "#ff4a10" });
  const wall = wallTexture([58, 44, 42]);
  const bone = new THREE.MeshStandardMaterial({ color: 0x9a907e, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2626, roughness: 0.45, metalness: 0.85 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x1a1312, roughness: 0.95 });
  const glow = glowTexture();
  // Bowl profile (lathe): narrow foot flaring to a wide lip.
  const prof = [
    [0.12, 0], [0.2, 0.05], [0.3, 0.14], [0.45, 0.27], [0.58, 0.38], [0.62, 0.42], [0.6, 0.43], [0.5, 0.36], [0.0, 0.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bowlGeo = new THREE.LatheGeometry(prof, 20);
  const coalGeo = new THREE.DodecahedronGeometry(0.09, 0);
  const rubbleGeo = new THREE.DodecahedronGeometry(0.16, 0);
  const rubble = new THREE.MeshStandardMaterial({ map: wall, color: 0x7a6a64, roughness: 0.95 });
  const inlay = inlayTextures();
  const stains = stainTexture();
  return { floor, wall, bone, iron, darkStone, glow, bowlGeo, coalGeo, rubbleGeo, rubble, inlay, stains };
}

export class Room {
  readonly group = new THREE.Group();
  readonly hx: number;
  readonly hz: number;
  readonly pillars: { x: number; z: number; r: number }[] = [];
  readonly doors: Door[] = [];
  private occluders: { x: number; z: number; mat: THREE.MeshStandardMaterial }[] = [];
  private braziers: Brazier[] = [];
  private animated: { mat: THREE.ShaderMaterial }[] = [];
  private floorMat: THREE.MeshStandardMaterial;
  private sigilMat!: THREE.MeshStandardMaterial;
  private flameCol = new THREE.Color();
  private time = 0;
  private emberT = 0;
  readonly boss: boolean;
  readonly traps: SpikePlate[] = [];

  constructor(seed: number, opts: { boss?: boolean; doors: number; traps?: number; small?: boolean }) {
    shared ??= buildShared();
    const S = shared;
    const r = rng(seed * 7919 + 13);
    this.boss = !!opts.boss;
    this.hx = this.boss ? 15 : opts.small ? 8 : 9 + Math.floor(r() * 4);
    this.hz = this.boss ? 15 : opts.small ? 8 : 9 + Math.floor(r() * 4);
    const { hx, hz } = this;
    const g = this.group;

    // ── Floor platform ──
    const fm = new THREE.MeshStandardMaterial({
      map: S.floor.map.clone(),
      emissiveMap: S.floor.emissive.clone(),
      normalMap: S.floor.normal.clone(),
      normalScale: new THREE.Vector2(1.1, 1.1),
      emissive: new THREE.Color(1, 0.42, 0.16),
      emissiveIntensity: 0.8,
      roughness: 0.82,
      metalness: 0.06,
    });
    const fo = [r(), r()];
    for (const t of [fm.map!, fm.emissiveMap!, fm.normalMap!]) {
      t.repeat.set((hx * 2) / 8, (hz * 2) / 8);
      t.offset.set(fo[0], fo[1]);
      t.needsUpdate = true;
    }
    this.floorMat = fm;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 + 2, hz * 2 + 2), fm);
    top.rotation.x = -Math.PI / 2;
    top.position.set(-0.5, 0, -0.5);
    top.receiveShadow = true;
    g.add(top);
    // Thick rock underneath, visible at the near edges.
    const side = new THREE.MeshStandardMaterial({ map: S.wall.clone(), color: 0x6a5a56, roughness: 1 });
    side.map!.repeat.set(4, 1);
    side.map!.needsUpdate = true;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 2, 6, hz * 2 + 2), [side, side, S.darkStone, S.darkStone, side, side]);
    slab.position.set(-0.5, -3.01, -0.5);
    g.add(slab);
    // Jagged broken edge blocks along the near edges.
    for (let i = 0; i < 30; i++) {
      const alongX = i % 2 === 0;
      const t = r() * 2 - 1;
      const w = 0.4 + r() * 0.8;
      const h = 0.5 + r() * 1.6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.6 + r())), S.darkStone);
      if (alongX) b.position.set(t * hx, -h / 2 - 0.3 - r() * 3, hz + 0.7 + r() * 0.5);
      else b.position.set(hx + 0.7 + r() * 0.5, -h / 2 - 0.3 - r() * 3, t * hz);
      b.rotation.set(r() * 0.5, r() * 3, r() * 0.5);
      g.add(b);
    }
    // Low broken parapet stubs on the near edges (purely decorative).
    for (let i = 0; i < 9; i++) {
      const alongX = i % 2 === 0;
      const t = (r() * 2 - 1) * 0.85;
      const h = 0.25 + r() * 0.5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.7), side);
      b.castShadow = true;
      if (alongX) b.position.set(t * hx, h / 2, hz + 0.35);
      else b.position.set(hx + 0.35, h / 2, t * hz);
      b.rotation.y = alongX ? 0 : Math.PI / 2;
      g.add(b);
    }

    // ── Lava abyss ──
    const lavaMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: plainVert, fragmentShader: lavaFrag });
    this.animated.push({ mat: lavaMat });
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), lavaMat);
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -14;
    g.add(lava);

    // ── Back walls ──
    const wm = new THREE.MeshStandardMaterial({ map: S.wall.clone(), roughness: 0.92, color: 0x9a8a86 });
    const H = this.boss ? 11 : 8.5;
    wm.map!.repeat.set((hx * 2 + 4) / 6, H / 6);
    wm.map!.needsUpdate = true;
    const wmW = wm.clone();
    wmW.map = S.wall.clone();
    wmW.map.repeat.set((hz * 2 + 4) / 6, H / 6);
    wmW.map.needsUpdate = true;
    const north = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 + 4, H + 6, 1.4), wm);
    north.position.set(-1, H / 2 - 3, -hz - 0.7);
    north.receiveShadow = true;
    g.add(north);
    const west = new THREE.Mesh(new THREE.BoxGeometry(1.4, H + 6, hz * 2 + 4), wmW);
    west.position.set(-hx - 0.7, H / 2 - 3, -1);
    west.receiveShadow = true;
    g.add(west);
    // Crenellated top line.
    for (let x = -hx - 1; x < hx + 2; x += 1.6) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.5), wm);
      c.position.set(x, H + 0.45, -hz - 0.7);
      g.add(c);
    }
    for (let z = -hz - 1; z < hz + 2; z += 1.6) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.8), wmW);
      c.position.set(-hx - 0.7, H + 0.45, z);
      g.add(c);
    }

    // ── Doors (placed first so decor avoids them) ──
    const doorSpots: { pos: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    if (opts.doors === 1) doorSpots.push({ pos: new THREE.Vector3(-hx * 0.15, 0, -hz), normal: new THREE.Vector3(0, 0, 1) });
    else {
      doorSpots.push({ pos: new THREE.Vector3(-hx * 0.35, 0, -hz), normal: new THREE.Vector3(0, 0, 1) });
      doorSpots.push({ pos: new THREE.Vector3(-hx, 0, -hz * 0.3), normal: new THREE.Vector3(1, 0, 0) });
      if (opts.doors >= 3) doorSpots.push({ pos: new THREE.Vector3(hx * 0.45, 0, -hz), normal: new THREE.Vector3(0, 0, 1) });
    }
    for (const d of doorSpots) this.doors.push(this.buildDoor(d.pos, d.normal));
    const nearDoor = (x: number, z: number, m: number) => this.doors.some((d) => Math.hypot(d.pos.x - x, d.pos.z - z) < m);

    // ── Wall decor: buttresses, glowing gothic windows, torn banners ──
    const winMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1.6, 0.18, 0.05), emissiveIntensity: 1 });
    const bannerTex = bannerTexture();
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    const walls = [
      { len: hx, along: (t: number) => new THREE.Vector3(t, 0, -hz), rotY: 0 },
      { len: hz, along: (t: number) => new THREE.Vector3(-hx, 0, t), rotY: Math.PI / 2 },
    ];
    for (const w of walls) {
      const step = this.boss ? 6 : 5;
      for (let t = -w.len + 1.5; t <= w.len + 0.5; t += step) {
        const p = w.along(t);
        if (nearDoor(p.x, p.z, 2.6)) continue;
        // Buttress.
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, H + 1.5, 1.2), wm);
        b.position.copy(p).add(new THREE.Vector3(0, (H + 1.5) / 2 - 0.2, 0));
        b.rotation.y = w.rotY;
        b.castShadow = true;
        b.receiveShadow = true;
        g.add(b);
        this.pillars.push({ x: p.x + (w.rotY ? 0.2 : 0), z: p.z + (w.rotY ? 0 : 0.2), r: 0.75 });
        // Window between this buttress and the next.
        const wp = w.along(t + step / 2);
        if (t + step / 2 < w.len - 1 && !nearDoor(wp.x, wp.z, 2.4)) {
          const win = new THREE.Mesh(archGeometry(1.1, 3.4), winMat);
          win.position.copy(wp).add(new THREE.Vector3(w.rotY ? 0.02 : 0, 3.2, w.rotY ? 0 : 0.02));
          win.rotation.y = w.rotY;
          g.add(win);
          for (let k = -1; k <= 1; k++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.6, 0.06), S.iron);
            bar.position.copy(win.position).add(new THREE.Vector3(w.rotY ? 0.05 : k * 0.35, 1.5, w.rotY ? k * 0.35 : 0.05));
            g.add(bar);
          }
          if (r() < 0.6) {
            const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.8), bannerMat);
            ban.position.copy(w.along(t + step / 2 + (r() < 0.5 ? 1.6 : -1.6))).add(new THREE.Vector3(w.rotY ? 0.05 : 0, H - 2.4, w.rotY ? 0 : 0.05));
            ban.rotation.y = w.rotY;
            g.add(ban);
          }
        }
      }
    }

    // ── Pillars ──
    const pm = new THREE.MeshStandardMaterial({ map: S.wall.clone(), color: 0x8a7a76, roughness: 0.95 });
    pm.map!.repeat.set(1.5, 2);
    pm.map!.needsUpdate = true;
    const pillarSpots: [number, number][] = [];
    if (this.boss) pillarSpots.push([-9, -9], [9, -9], [-9, 9], [9, 9]);
    else {
      const n = Math.floor(r() * 4);
      for (let i = 0; i < n * 3 && pillarSpots.length < n; i++) {
        const x = (r() * 2 - 1) * (hx - 3);
        const z = (r() * 2 - 1) * (hz - 3);
        if (Math.hypot(x, z) < 4.5 || nearDoor(x, z, 4) || pillarSpots.some(([a, b]) => Math.hypot(a - x, b - z) < 5)) continue;
        if (x > hx * 0.3 && z > hz * 0.3) continue; // keep the entry corner open
        pillarSpots.push([x, z]);
      }
    }
    for (const [x, z] of pillarSpots) {
      const broken = !this.boss && r() < 0.4;
      const h = broken ? 2 + r() * 2.5 : H + 1;
      // Own material per pillar so it can fade out when it stands between the camera and the hero.
      const pmi = pm.clone();
      pmi.transparent = true;
      this.occluders.push({ x, z, mat: pmi });
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, h, 12), pmi);
      col.position.set(x, h / 2, z);
      col.castShadow = true;
      col.receiveShadow = true;
      g.add(col);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), pm);
      base.position.set(x, 0.25, z);
      base.castShadow = true;
      g.add(base);
      if (!broken) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.7), pmi);
        cap.position.set(x, h - 0.3, z);
        g.add(cap);
        // Chains sagging from the pillar top toward the back wall.
        const a = new THREE.Vector3(x, h - 0.8, z);
        const b = new THREE.Vector3(x - (r() < 0.5 ? 0 : x + hx), H - 1, z - (z + hz) * (r() < 0.5 ? 1 : 0));
        if (b.distanceTo(a) > 2) g.add(chain(a, b, 0.8 + r() * 0.9, S.iron));
      } else {
        // Rubble at the broken top and around the base.
        for (let i = 0; i < 4; i++) {
          const rb = new THREE.Mesh(new THREE.BoxGeometry(0.3 + r() * 0.4, 0.25 + r() * 0.3, 0.3 + r() * 0.4), pm);
          rb.position.set(x + (r() - 0.5) * 2.6, 0.15, z + (r() - 0.5) * 2.6);
          rb.rotation.set(r(), r() * 3, r());
          rb.castShadow = true;
          g.add(rb);
        }
      }
      this.pillars.push({ x, z, r: 0.95 });
    }

    // ── Floor dressing ──
    // Carved summoning circle inlaid in the middle of the chamber (where rewards appear).
    this.sigilMat = new THREE.MeshStandardMaterial({
      map: S.inlay.map,
      emissiveMap: S.inlay.glow,
      emissive: new THREE.Color(1, 0.35, 0.1),
      emissiveIntensity: 0.5,
      transparent: true,
      depthWrite: false,
      roughness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const sigilSize = this.boss ? 13 : 7.5;
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(sigilSize, sigilSize).rotateX(-Math.PI / 2), this.sigilMat);
    sigil.position.y = 0.01;
    sigil.rotation.y = r() * Math.PI;
    sigil.receiveShadow = true;
    g.add(sigil);
    // Dark stains: old blood and soot.
    for (let i = 0; i < (this.boss ? 14 : 8); i++) {
      const x = (r() * 2 - 1) * (hx - 1);
      const z = (r() * 2 - 1) * (hz - 1);
      if (Math.hypot(x, z) < 4 || nearDoor(x, z, 2.5)) continue;
      const sz = 1.4 + r() * 2.6;
      const m = new THREE.MeshBasicMaterial({
        map: S.stains,
        color: r() < 0.55 ? 0x3a0604 : 0x050302,
        transparent: true,
        opacity: 0.35 + r() * 0.3,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      const st = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), m);
      st.position.set(x, 0.008, z);
      st.rotation.y = r() * Math.PI * 2;
      g.add(st);
    }
    // Rubble along the back walls and around pillars.
    const rubbleSpots: [number, number, number][] = [];
    for (let i = 0; i < 70; i++) {
      const t = r() * 2 - 1;
      const onNorth = r() < 0.5;
      const x = onNorth ? t * (hx - 0.5) : -hx + 0.35 + r() * 1.1;
      const z = onNorth ? -hz + 0.35 + r() * 1.1 : t * (hz - 0.5);
      if (nearDoor(x, z, 2.6)) continue;
      rubbleSpots.push([x, z, 0.5 + r() * 1.6]);
    }
    for (const pl of this.pillars)
      for (let k = 0; k < 6; k++) {
        const a = r() * Math.PI * 2;
        const d = pl.r + 0.15 + r() * 0.5;
        rubbleSpots.push([pl.x + Math.cos(a) * d, pl.z + Math.sin(a) * d, 0.4 + r() * 1.1]);
      }
    const rub = new THREE.InstancedMesh(S.rubbleGeo, S.rubble, rubbleSpots.length);
    rubbleSpots.forEach(([x, z, sc], i) => {
      dmy0.position.set(x, 0.06 * sc, z);
      dmy0.rotation.set(r() * 3, r() * 3, r() * 3);
      dmy0.scale.set(sc, sc * (0.5 + r() * 0.5), sc);
      dmy0.updateMatrix();
      rub.setMatrixAt(i, dmy0.matrix);
    });
    rub.castShadow = true;
    rub.receiveShadow = true;
    g.add(rub);

    // ── Bones and skulls ──
    const boneGeo = new THREE.CapsuleGeometry(0.028, 0.32, 2, 6);
    const nBones = this.boss ? 70 : 34;
    const bones = new THREE.InstancedMesh(boneGeo, S.bone, nBones);
    const dmy = new THREE.Object3D();
    const piles: [number, number][] = [];
    for (let i = 0; i < (this.boss ? 8 : 4); i++) {
      for (let k = 0; k < 10; k++) {
        const x = (r() * 2 - 1) * (hx - 1.5);
        const z = (r() * 2 - 1) * (hz - 1.5);
        if (Math.hypot(x, z) < 3.5 || nearDoor(x, z, 3)) continue;
        piles.push([x, z]);
        break;
      }
    }
    for (let i = 0; i < nBones; i++) {
      const [px, pz] = piles[i % Math.max(1, piles.length)] ?? [0, 0];
      dmy.position.set(px + (r() - 0.5) * 1.6, 0.03, pz + (r() - 0.5) * 1.6);
      dmy.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.3, r() * Math.PI * 2, 0);
      dmy.updateMatrix();
      bones.setMatrixAt(i, dmy.matrix);
    }
    bones.castShadow = true;
    g.add(bones);
    const skullGeo = new THREE.SphereGeometry(0.11, 12, 10);
    const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050202 });
    for (let i = 0; i < Math.min(piles.length * 3, 14); i++) {
      const [px, pz] = piles[i % piles.length];
      const sk = new THREE.Group();
      const s = new THREE.Mesh(skullGeo, S.bone);
      s.scale.set(1, 0.95, 1.15);
      s.castShadow = true;
      sk.add(s);
      for (const ex of [-0.06, 0.06]) {
        const e = new THREE.Mesh(eyeGeo, eyeMat);
        e.position.set(ex * 0.65, 0.01, 0.105);
        sk.add(e);
      }
      sk.position.set(px + (r() - 0.5) * 1.4, 0.1 + (i % 3 === 0 ? 0.08 : 0), pz + (r() - 0.5) * 1.4);
      sk.rotation.set((r() - 0.5) * 0.6, r() * Math.PI * 2, (r() - 0.5) * 0.6);
      g.add(sk);
    }

    // ── Braziers ──
    const bspots: THREE.Vector3[] = this.boss
      ? [new THREE.Vector3(-hx + 2, 0, -hz + 2), new THREE.Vector3(hx - 3, 0, -hz + 2), new THREE.Vector3(-hx + 2, 0, hz - 3)]
      : [new THREE.Vector3(-hx + 1.6, 0, -hz + 1.6), r() < 0.5 ? new THREE.Vector3(hx - 2, 0, -hz + 1.6) : new THREE.Vector3(-hx + 1.6, 0, hz - 2)];
    for (const p of bspots) {
      if (nearDoor(p.x, p.z, 2)) p.x += 2.5;
      const br = new THREE.Group();
      br.position.set(p.x, 0, p.z);
      br.rotation.y = r() * Math.PI;
      const bowl = new THREE.Mesh(S.bowlGeo, S.iron);
      bowl.position.y = 1.05;
      bowl.castShadow = true;
      br.add(bowl);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24).rotateX(Math.PI / 2), S.iron);
      rim.position.y = 1.47;
      br.add(rim);
      // Horn-like spikes around the rim.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 5), S.iron);
        sp.position.set(Math.cos(a) * 0.62, 1.58, Math.sin(a) * 0.62);
        sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        br.add(sp);
      }
      // Tripod with clawed feet.
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.15, 6), S.iron);
        leg.position.set(Math.cos(a) * 0.32, 0.55, Math.sin(a) * 0.32);
        leg.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32);
        leg.castShadow = true;
        br.add(leg);
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), S.iron);
        claw.position.set(Math.cos(a) * 0.52, 0.06, Math.sin(a) * 0.52);
        claw.rotation.set(Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3);
        br.add(claw);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 5, 18).rotateX(Math.PI / 2), S.iron);
      ring.position.y = 0.55;
      br.add(ring);
      // Heap of coals: dark chunks with a glowing core.
      const coalMat = new THREE.MeshStandardMaterial({ color: 0x140806, roughness: 0.9, emissive: new THREE.Color(1.0, 0.28, 0.04), emissiveIntensity: 1 });
      for (let k = 0; k < 11; k++) {
        const a = r() * Math.PI * 2;
        const d = r() * 0.42;
        const ch = new THREE.Mesh(S.coalGeo, k % 3 === 0 ? S.darkStone : coalMat);
        ch.position.set(Math.cos(a) * d, 1.38 + (0.42 - d) * 0.25, Math.sin(a) * d);
        ch.rotation.set(r() * 3, r() * 3, r() * 3);
        ch.scale.setScalar(0.8 + r() * 0.8);
        br.add(ch);
      }
      g.add(br);
      const light = new THREE.PointLight(0xff7a2a, 15, 10, 1.6);
      light.position.set(p.x, 2.3, p.z);
      g.add(light);
      this.braziers.push({ pos: new THREE.Vector3(p.x, 1.45, p.z), light, base: 15, coal: coalMat });
      this.pillars.push({ x: p.x, z: p.z, r: 0.6 });
    }

    // ── Spike plates ──
    const spots: [number, number][] = [];
    for (let i = 0; i < (opts.traps ?? 0) * 12 && spots.length < (opts.traps ?? 0); i++) {
      const x = (r() * 2 - 1) * (hx - 2.5);
      const z = (r() * 2 - 1) * (hz - 2.5);
      if (Math.hypot(x, z) < 2.5) continue; // keep the reward spot clear
      if (Math.hypot(x - (hx - 2.2), z - (hz - 2.2)) < 4) continue; // and the entrance
      if (nearDoor(x, z, 3.5)) continue;
      if (this.pillars.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.6)) continue;
      if (spots.some(([a, b]) => Math.hypot(a - x, b - z) < 3.4)) continue;
      spots.push([x, z]);
    }
    for (const [x, z] of spots) this.traps.push(new SpikePlate(g, x, z));
  }

  updateTraps(dt: number, game: Game) {
    for (const t of this.traps) t.update(dt, game);
  }

  private buildDoor(pos: THREE.Vector3, normal: THREE.Vector3): Door {
    const S = shared!;
    const grp = new THREE.Group();
    grp.position.copy(pos);
    grp.rotation.y = Math.atan2(normal.x, normal.z);
    const stone = new THREE.MeshStandardMaterial({ map: S.wall, color: 0x8a7a72, roughness: 0.9 });
    for (const sx of [-1.75, 1.75]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.75, 4.2, 0.9), stone);
      post.position.set(sx, 2.1, 0.2);
      post.castShadow = true;
      grp.add(post);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.38, 8, 20, Math.PI), stone);
    arch.position.set(0, 4.2, 0.2);
    grp.add(arch);
    // Horned skull keystone.
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), S.bone);
    sk.position.set(0, 6.0, 0.45);
    grp.add(sk);
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 8), S.bone);
      horn.position.set(sx * 0.32, 6.3, 0.45);
      horn.rotation.z = -sx * 0.9;
      grp.add(horn);
    }
    const portalMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(1, 0.2, 0.1) }, open: { value: 0 } },
      vertexShader: plainVert,
      fragmentShader: portalFrag,
    });
    this.animated.push({ mat: portalMat });
    const portal = new THREE.Mesh(archGeometry(1.4, 4.0), portalMat);
    portal.position.set(0, 0, 0.05);
    grp.add(portal);
    const bars = new THREE.Group();
    for (let i = -3; i <= 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 5.4, 0.09), S.iron);
      b.position.set(i * 0.42, 2.7, 0.3);
      bars.add(b);
    }
    for (const y of [1.2, 3.2]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 0.1), S.iron);
      b.position.set(0, y, 0.3);
      bars.add(b);
    }
    grp.add(bars);
    // Stone steps up to the threshold.
    for (const [w, d, y, z] of [
      [4.6, 1.1, 0.09, 0.9],
      [3.8, 0.7, 0.2, 0.55],
    ]) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, y * 2, d), stone);
      step.position.set(0, y / 2, z);
      step.receiveShadow = true;
      grp.add(step);
    }
    // Reward medallion: a spiked bronze disc with the reward symbol on both faces.
    const { group: medal, faces: medalFace, rim: medalRim } = buildMedal();
    medal.position.set(0, 3.0, 1.45);
    medal.scale.setScalar(0.01);
    medal.visible = false;
    grp.add(medal);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    halo.position.set(0, 3.0, 1.2);
    halo.scale.setScalar(3.6);
    grp.add(halo);
    // Glowing threshold rune on the floor.
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(1.55, 1.75, 40, 1, 0, Math.PI).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    rune.rotation.y = Math.PI;
    rune.position.set(0, 0.22, 0.6);
    grp.add(rune);
    const light = new THREE.PointLight(0xff3010, 0, 8, 1.8);
    light.position.set(0, 2.8, 2.4);
    grp.add(light);
    this.group.add(grp);
    return { pos: pos.clone(), normal, group: grp, portal, portalMat, bars, medal, medalFace, medalRim, halo, rune, light, plan: null, open: false, t: 0 };
  }

  /** Light up a door with what lies behind it: the reward icon, plus a badge for special rooms. */
  openDoor(d: Door, plan: DoorPlan) {
    d.plan = plan;
    d.open = true;
    d.t = 0;
    const kind = doorIcon(plan);
    const col = new THREE.Color(plan.type === "elite" ? "#ff3a2a" : plan.type === "abyss" ? "#b06bff" : ICON_COLOR[kind]);
    const ring = plan.type === "elite" || plan.type === "miniboss" || plan.type === "boss" ? "#ff3a2a" : plan.type === "abyss" ? "#b06bff" : null;
    const tex = medalTexture(kind, ring);
    for (const m of d.medalFace) {
      m.map = tex;
      m.needsUpdate = true;
    }
    d.medalRim.emissive.copy(col).multiplyScalar(0.12);
    d.medal.visible = true;
    d.portalMat.uniforms.color.value.copy(col);
    (d.halo.material as THREE.SpriteMaterial).color.copy(col);
    (d.rune.material as THREE.MeshBasicMaterial).color.copy(col);
    d.light.color.copy(col);
  }

  /** Fade pillars that stand between the camera and the hero. */
  fadeOccluders(hero: THREE.Vector3, cam: THREE.Vector3, dt: number) {
    const dx = cam.x - hero.x;
    const dz = cam.z - hero.z;
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    for (const o of this.occluders) {
      const px = o.x - hero.x;
      const pz = o.z - hero.z;
      const along = px * ux + pz * uz;
      const perp = Math.abs(px * uz - pz * ux);
      const target = along > -0.6 && along < 14 && perp < 2.4 ? 0.16 : 1;
      o.mat.opacity += (target - o.mat.opacity) * Math.min(1, dt * 8);
      o.mat.depthWrite = o.mat.opacity > 0.95;
    }
  }

  update(dt: number, fx: Fx) {
    this.time += dt;
    for (const a of this.animated) a.mat.uniforms.time.value = this.time;
    this.floorMat.emissiveIntensity = 0.7 + Math.sin(this.time * 1.7) * 0.14 + Math.sin(this.time * 4.3) * 0.04;
    this.sigilMat.emissiveIntensity = 0.24 + Math.sin(this.time * 1.1) * 0.09;
    for (const b of this.braziers) {
      const flick = 0.85 + Math.sin(this.time * 13 + b.pos.x) * 0.07 + Math.random() * 0.1;
      b.light.intensity = b.base * flick;
      b.coal.emissiveIntensity = 0.8 + flick * 0.5;
      // A calm, compact flame: warm orange tongues that shrink as they rise (no white blow-out).
      if (Math.random() < dt * 22) {
        const hot = Math.random();
        fx.emit({
          x: b.pos.x + (Math.random() - 0.5) * 0.45,
          y: b.pos.y + 0.05,
          z: b.pos.z + (Math.random() - 0.5) * 0.45,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 1.1 + Math.random() * 1.0,
          vz: (Math.random() - 0.5) * 0.3,
          color: this.flameCol.setRGB(1.2 + hot * 0.4, 0.34 + hot * 0.22, 0.05),
          size: 0.16 + Math.random() * 0.14,
          life: 0.35 + Math.random() * 0.3,
          additive: true,
          shrink: true,
          drag: 1.2,
        });
      }
      if (Math.random() < dt * 2.5) fx.embers(b.pos, 1, 0.3);
    }
    for (const d of this.doors) {
      if (!d.open) continue;
      d.t += dt;
      const u = Math.min(1, d.t / 0.8);
      d.portalMat.uniforms.open.value = u;
      d.bars.position.y = u * 5.2;
      d.light.intensity = 3.2 * u * (0.9 + Math.sin(this.time * 6) * 0.1);
      const pop = Math.min(1, Math.max(0, (d.t - 0.35) / 0.5));
      const back = 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2);
      d.medal.scale.setScalar(Math.max(0.01, back));
      d.medal.position.y = 3.0 + Math.sin(this.time * 1.8 + d.pos.x) * 0.1;
      // Turn toward the isometric camera so the symbol reads face-on, with a gentle sway.
      d.medal.rotation.set(-0.42, Math.PI / 4 - d.group.rotation.y + Math.sin(this.time * 0.9 + d.pos.z) * 0.18, 0, "YXZ");
      (d.halo.material as THREE.SpriteMaterial).opacity = 0.14 * pop * (0.85 + Math.sin(this.time * 3) * 0.15);
      (d.rune.material as THREE.MeshBasicMaterial).opacity = 0.55 * u * (0.75 + Math.sin(this.time * 2.4) * 0.25);
      const danger = d.plan && (d.plan.type === "elite" || d.plan.type === "miniboss" || d.plan.type === "boss");
      if (danger && Math.random() < dt * 24) {
        for (const sx of [-1.75, 1.75]) fx.fire(d.group.localToWorld(v.set(sx, 4.35, 0.25)), 1, 0.2, 0.8);
      }
    }
    // Embers drifting up out of the abyss along the open edges.
    this.emberT += dt;
    while (this.emberT > 0.05) {
      this.emberT -= 0.05;
      const alongX = Math.random() < 0.5;
      const t = Math.random() * 2 - 1;
      const p = alongX ? new THREE.Vector3(t * this.hx, -0.5, this.hz + 1.5 + Math.random() * 2) : new THREE.Vector3(this.hx + 1.5 + Math.random() * 2, -0.5, t * this.hz);
      fx.embers(p, 1, 1);
    }
  }

  /** Keep a circle of radius r inside the room and out of pillars. */
  /** The lip of the two open (near) edges, where the platform drops into the abyss. */
  get edgeX() {
    return this.hx + 0.45;
  }
  get edgeZ() {
    return this.hz + 0.45;
  }

  /** Past the lip: nothing underfoot. */
  overVoid(p: THREE.Vector3, margin = 0) {
    return p.x > this.edgeX - margin || p.z > this.edgeZ - margin;
  }

  /** Within `m` of the lip. */
  nearVoid(p: THREE.Vector3, m: number) {
    return p.x > this.edgeX - m || p.z > this.edgeZ - m;
  }

  /** Keep a body on the platform. With `allowFall` the open edges don't hold it back (dashes, big knockback). */
  resolve(p: THREE.Vector3, r: number, allowFall = false) {
    p.x = Math.max(-this.hx + r, allowFall ? p.x : Math.min(this.edgeX - r, p.x));
    p.z = Math.max(-this.hz + r, allowFall ? p.z : Math.min(this.edgeZ - r, p.z));
    for (const c of this.pillars) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const m = c.r + r;
      if (d < m && d > 1e-5) {
        p.x = c.x + (dx / d) * m;
        p.z = c.z + (dz / d) * m;
      }
    }
  }

  /** Distance along a horizontal ray until it hits a wall or pillar. */
  raycast(o: THREE.Vector3, dx: number, dz: number, max: number) {
    let t = max;
    if (dx > 1e-6) t = Math.min(t, (this.hx + 1 - o.x) / dx);
    if (dx < -1e-6) t = Math.min(t, (-this.hx - o.x) / dx);
    if (dz > 1e-6) t = Math.min(t, (this.hz + 1 - o.z) / dz);
    if (dz < -1e-6) t = Math.min(t, (-this.hz - o.z) / dz);
    for (const c of this.pillars) {
      const fx = o.x - c.x;
      const fz = o.z - c.z;
      const b = fx * dx + fz * dz;
      const cc = fx * fx + fz * fz - c.r * c.r * 0.7;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const hit = -b - Math.sqrt(disc);
      if (hit > 0 && hit < t) t = hit;
    }
    return Math.max(0, t);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== undefined) m.geometry.dispose();
    });
  }
}

/** Gothic arch (flat shape, opening facing +Z): width w, height h, pointed top. */
function archGeometry(halfW: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-halfW, 0);
  s.lineTo(-halfW, h - halfW);
  s.quadraticCurveTo(-halfW, h - halfW * 0.1, 0, h + halfW * 0.35);
  s.quadraticCurveTo(halfW, h - halfW * 0.1, halfW, h - halfW);
  s.lineTo(halfW, 0);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 12);
  // UVs 0..1 across the shape (for the portal shader).
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + halfW) / (halfW * 2);
    uv[i * 2 + 1] = pos.getY(i) / (h + halfW * 0.35);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Sagging iron chain between two points (instanced links). */
export function chain(a: THREE.Vector3, b: THREE.Vector3, sag: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const n = Math.max(6, Math.round(len / 0.22));
  const geo = new THREE.TorusGeometry(0.1, 0.03, 5, 10);
  const im = new THREE.InstancedMesh(geo, mat, n);
  const d = new THREE.Object3D();
  const prev = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    p.lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    const t2 = (i + 1.5) / n;
    prev.lerpVectors(a, b, t2);
    prev.y -= Math.sin(t2 * Math.PI) * sag;
    d.position.copy(p);
    d.lookAt(prev);
    d.rotateY(Math.PI / 2);
    if (i % 2) d.rotateX(Math.PI / 2);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  }
  im.castShadow = true;
  return im;
}

function bannerTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 384;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5a0608";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(128, 0);
  g.lineTo(128, 300);
  // Torn bottom edge.
  for (let x = 128; x >= 0; x -= 8) g.lineTo(x, 300 + Math.random() * 80);
  g.closePath();
  g.fill();
  // Darker borders + a sigil: a horseshoe crossed by a blade.
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(0, 0, 10, 384);
  g.fillRect(118, 0, 10, 384);
  g.strokeStyle = "#c9a14a";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 140, 30, Math.PI * 0.15, Math.PI * 0.85, true);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(64, 70);
  g.lineTo(64, 210);
  g.stroke();
  // Rips.
  for (let i = 0; i < 4; i++) {
    g.clearRect(20 + Math.random() * 80, 200 + Math.random() * 90, 4 + Math.random() * 8, 20 + Math.random() * 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const v = new THREE.Vector3();
/** A spiked bronze disc with a face on each side (faces get their map from medalTexture). */
export function buildMedal() {
  const medal = new THREE.Group();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x2a1c14, metalness: 0.85, roughness: 0.4 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb98a48, metalness: 0.95, roughness: 0.28, emissive: new THREE.Color(0, 0, 0) });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.16, 48).rotateX(Math.PI / 2), bronze);
  disc.castShadow = true;
  medal.add(disc);
  medal.add(new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.075, 10, 56), rimMat));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.36, 6), rimMat);
    spike.position.set(Math.cos(a) * 1.08, Math.sin(a) * 1.08, 0);
    spike.rotation.z = a - Math.PI / 2;
    medal.add(spike);
  }
  const faces: THREE.MeshBasicMaterial[] = [];
  for (const side of [1, -1]) {
    const m = new THREE.MeshBasicMaterial({ transparent: true, color: new THREE.Color(0.8, 0.8, 0.8) });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.84, 48), m);
    face.position.z = side * 0.085;
    if (side < 0) face.rotation.y = Math.PI;
    medal.add(face);
    faces.push(m);
  }
  return { group: medal, faces, rim: rimMat };
}

const dmy0 = new THREE.Object3D();

/** Floor inlay: carved rings, a star and rune marks (dark colour map + thin glowing emissive lines). */
function inlayTextures() {
  const S = 1024;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d")!;
    g.translate(S / 2, S / 2);
    return [c, g] as const;
  };
  const [mc, m] = mk();
  const [gc, gl] = mk();
  const star = (ctx: CanvasRenderingContext2D, rad: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = -Math.PI / 2 + ((i * 3) % 7) * ((Math.PI * 2) / 7);
      if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.stroke();
  };
  // Carved grooves (dark) with a worn lighter lip.
  for (const [rad, w] of [
    [490, 22],
    [440, 8],
    [300, 14],
    [120, 10],
  ]) {
    m.lineWidth = w + 6;
    m.strokeStyle = "rgba(200,170,150,0.10)";
    m.beginPath();
    m.arc(2, 2, rad, 0, Math.PI * 2);
    m.stroke();
    m.lineWidth = w;
    m.strokeStyle = "rgba(6,3,2,0.85)";
    m.beginPath();
    m.arc(0, 0, rad, 0, Math.PI * 2);
    m.stroke();
  }
  m.lineWidth = 10;
  m.strokeStyle = "rgba(6,3,2,0.8)";
  star(m, 300);
  // Rune blocks in the outer band.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    m.save();
    m.rotate(a);
    m.fillStyle = "rgba(6,3,2,0.8)";
    m.fillRect(-10, -478, 20, 26);
    m.fillRect(-3, -470, 6 + (i % 3) * 6, 10);
    m.restore();
  }
  // Glow: only the inner star and the middle ring carry a faint ember line.
  gl.shadowColor = "#ff6a20";
  gl.shadowBlur = 16;
  gl.strokeStyle = "#ff8a3a";
  gl.lineWidth = 2;
  star(gl, 300);
  gl.beginPath();
  gl.arc(0, 0, 300, 0, Math.PI * 2);
  gl.stroke();
  gl.globalAlpha = 0.6;
  gl.beginPath();
  gl.arc(0, 0, 120, 0, Math.PI * 2);
  gl.stroke();
  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.CanvasTexture(gc);
  glow.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, glow]) t.anisotropy = 8;
  return { map, glow };
}

/** Irregular splatter blot (white with alpha; tinted by the material). */
function stainTexture() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const blob = (x: number, y: number, rad: number, a: number) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.7, `rgba(255,255,255,${a * 0.6})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  };
  blob(128, 128, 80, 0.8);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * 80;
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 6 + Math.random() * 26, 0.5 + Math.random() * 0.4);
  }
  return new THREE.CanvasTexture(c);
}

const medalCache = new Map<string, THREE.Texture>();
/** Medallion face: dark enamel, a coloured inner ring (red for danger, violet for the Abyss), the reward symbol. */
export function medalTexture(kind: IconKind, ring: string | null) {
  const key = kind + (ring ?? "");
  const hit = medalCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const col = ICON_COLOR[kind];
  const bg = g.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S / 2);
  bg.addColorStop(0, "#2a1410");
  bg.addColorStop(0.75, "#120806");
  bg.addColorStop(1, "#050202");
  g.fillStyle = bg;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = ring ?? col;
  g.shadowColor = ring ?? col;
  g.shadowBlur = 14;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2);
  g.stroke();
  // Notches around the ring.
  g.lineWidth = 4;
  for (let i = 0; i < 24; i++) {
    const an = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(an) * (S / 2 - 24), S / 2 + Math.sin(an) * (S / 2 - 24));
    g.lineTo(S / 2 + Math.cos(an) * (S / 2 - 32), S / 2 + Math.sin(an) * (S / 2 - 32));
    g.stroke();
  }
  g.shadowBlur = 0;
  g.drawImage(iconCanvas(kind), 30, 30, S - 60, S - 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  medalCache.set(key, t);
  return t;
}

export function glow() {
  shared ??= buildShared();
  return shared.glow;
}
