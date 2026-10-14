// Dungeon rooms. Each room is a stone platform hanging over a lava abyss: two tall gothic walls
// at the back (where the doors are), the near edges open to the drop. Floor 1 is the Bone Pits.
import * as THREE from "three";
import type { Fx } from "./fx";
import type { Reward } from "./boons";
import { rewardIcon } from "./boons";
import { floorTextures, glowTexture, iconTexture, ICON_COLOR, wallTexture } from "./textures";

export type Door = {
  pos: THREE.Vector3;
  /** Direction the door faces (into the room). */
  normal: THREE.Vector3;
  group: THREE.Group;
  portal: THREE.Mesh;
  portalMat: THREE.ShaderMaterial;
  bars: THREE.Group;
  icon: THREE.Sprite;
  light: THREE.PointLight;
  reward: Reward | null;
  open: boolean;
  t: number;
};

type Brazier = { pos: THREE.Vector3; light: THREE.PointLight; base: number };

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
    vec3 c = mix(vec3(0.0), color * (0.25 + sw * 0.8), core * open);
    c += color * pow(core, 4.0) * 0.7 * open;
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
  return { floor, wall, bone, iron, darkStone, glow };
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
  private time = 0;
  private emberT = 0;
  readonly boss: boolean;

  constructor(seed: number, opts: { boss?: boolean; doors: number }) {
    shared ??= buildShared();
    const S = shared;
    const r = rng(seed * 7919 + 13);
    this.boss = !!opts.boss;
    this.hx = this.boss ? 15 : 9 + Math.floor(r() * 4);
    this.hz = this.boss ? 15 : 9 + Math.floor(r() * 4);
    const { hx, hz } = this;
    const g = this.group;

    // ── Floor platform ──
    const fm = new THREE.MeshStandardMaterial({
      map: S.floor.map.clone(),
      emissiveMap: S.floor.emissive.clone(),
      emissive: new THREE.Color(1, 0.45, 0.2),
      emissiveIntensity: 0.9,
      roughness: 0.88,
      metalness: 0.05,
    });
    for (const t of [fm.map!, fm.emissiveMap!]) {
      t.repeat.set((hx * 2) / 9, (hz * 2) / 9);
      t.offset.set(r(), r());
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
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 0.45, 10, 1, true), S.iron);
      bowl.position.set(p.x, 1.25, p.z);
      g.add(bowl);
      const coal = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 10),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1, 0.2) }),
      );
      coal.rotation.x = -Math.PI / 2;
      coal.position.set(p.x, 1.4, p.z);
      g.add(coal);
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2), S.iron);
        const a = (k / 3) * Math.PI * 2;
        leg.position.set(p.x + Math.cos(a) * 0.3, 0.6, p.z + Math.sin(a) * 0.3);
        leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
        g.add(leg);
      }
      const light = new THREE.PointLight(0xff7a2a, 22, 11, 1.6);
      light.position.set(p.x, 2.2, p.z);
      g.add(light);
      this.braziers.push({ pos: new THREE.Vector3(p.x, 1.4, p.z), light, base: 22 });
      this.pillars.push({ x: p.x, z: p.z, r: 0.6 });
    }
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
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    icon.position.set(0, 2.5, 0.9);
    icon.scale.set(1.9, 1.9, 1);
    icon.visible = false;
    grp.add(icon);
    const light = new THREE.PointLight(0xff3010, 0, 9, 1.6);
    light.position.set(0, 2.2, 1.6);
    grp.add(light);
    this.group.add(grp);
    return { pos: pos.clone(), normal, group: grp, portal, portalMat, bars, icon, light, reward: null, open: false, t: 0 };
  }

  /** Light up a door with a reward behind it. */
  openDoor(d: Door, reward: Reward) {
    d.reward = reward;
    d.open = true;
    d.t = 0;
    const kind = rewardIcon(reward);
    const col = new THREE.Color(ICON_COLOR[kind]);
    d.portalMat.uniforms.color.value.copy(col);
    (d.icon.material as THREE.SpriteMaterial).map = iconTexture(kind);
    (d.icon.material as THREE.SpriteMaterial).needsUpdate = true;
    d.icon.visible = true;
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
    this.floorMat.emissiveIntensity = 0.75 + Math.sin(this.time * 1.7) * 0.18 + Math.sin(this.time * 4.3) * 0.05;
    for (const b of this.braziers) {
      b.light.intensity = b.base * (0.85 + Math.sin(this.time * 13 + b.pos.x) * 0.08 + Math.random() * 0.12);
      if (Math.random() < dt * 30) fx.fire(b.pos, 1, 0.5, 1);
      if (Math.random() < dt * 3) fx.embers(b.pos, 1, 0.4);
    }
    for (const d of this.doors) {
      if (!d.open) continue;
      d.t += dt;
      const u = Math.min(1, d.t / 0.8);
      d.portalMat.uniforms.open.value = u;
      d.bars.position.y = u * 5.2;
      d.light.intensity = 8 * u * (0.9 + Math.sin(this.time * 6) * 0.1);
      d.icon.position.y = 2.5 + Math.sin(this.time * 2) * 0.12;
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
  resolve(p: THREE.Vector3, r: number) {
    p.x = Math.max(-this.hx + r, Math.min(this.hx - r, p.x));
    p.z = Math.max(-this.hz + r, Math.min(this.hz - r, p.z));
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

export function glow() {
  shared ??= buildShared();
  return shared.glow;
}
