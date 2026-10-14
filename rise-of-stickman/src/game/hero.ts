// The Horseman's look: black stickman, glowing ember eyes, a long torn red scarf, a katana
// and twin revolvers. Also builds afterimage "ghosts" for the shadow dash.
import * as THREE from "three";
import { StickRig } from "./rig";

export function katanaMesh(glow: THREE.Color) {
  const g = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xd9dde4,
    metalness: 0.95,
    roughness: 0.18,
    emissive: glow,
    emissiveIntensity: 0.25,
  });
  // Slightly curved blade: a thin tapered shape extruded, lying along +Z.
  const s = new THREE.Shape();
  s.moveTo(0, -0.018);
  s.lineTo(0.96, -0.012 + 0.03);
  s.quadraticCurveTo(1.04, 0.035, 1.02, 0.045);
  s.lineTo(0, 0.018);
  s.closePath();
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false });
  bg.translate(0, 0, -0.004);
  // Shape lies along +X in its plane; turn it so the blade runs along +Z with the edge facing +Y.
  bg.rotateY(-Math.PI / 2);
  const blade = new THREE.Mesh(bg, bladeMat);
  blade.position.z = 0.12;
  blade.castShadow = true;
  g.add(blade);
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.9, roughness: 0.35 }),
  );
  guard.rotation.x = Math.PI / 2;
  guard.position.z = 0.11;
  g.add(guard);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 6), new THREE.MeshStandardMaterial({ color: 0x5a0a0c, roughness: 0.8 }));
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0;
  g.add(handle);
  return { group: g, bladeMat };
}

export function revolverMesh() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.25 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.7 });
  // Barrel along −Y (the hand's pointing direction when the arm is straight).
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.05), metal);
  barrel.position.set(0, -0.15, 0.03);
  g.add(barrel);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 8), metal);
  drum.position.set(0, -0.02, 0.03);
  g.add(drum);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.12), grip);
  handle.position.set(0, 0.03, -0.04);
  handle.rotation.x = 0.4;
  g.add(handle);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.3, 0.03);
  g.add(muzzle);
  return { group: g, muzzle };
}

/** Verlet scarf tail rendered as a camera-facing ribbon. */
export class Scarf {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private old: THREE.Vector3[] = [];
  private seg: number;
  private width: number;
  private geo: THREE.BufferGeometry;
  readonly mat: THREE.MeshStandardMaterial;
  constructor(n: number, seg: number, width: number, mat: THREE.MeshStandardMaterial) {
    this.seg = seg;
    this.width = width;
    this.mat = mat;
    for (let i = 0; i < n; i++) {
      this.pts.push(new THREE.Vector3(0, 1.5 - i * seg, 0));
      this.old.push(this.pts[i].clone());
    }
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      uv[i * 4] = 0;
      uv[i * 4 + 1] = i / (n - 1);
      uv[i * 4 + 2] = 1;
      uv[i * 4 + 3] = i / (n - 1);
      if (i < n - 1) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  reset(anchor: THREE.Vector3) {
    for (let i = 0; i < this.pts.length; i++) {
      this.pts[i].copy(anchor).add(new THREE.Vector3(0, -i * this.seg, 0));
      this.old[i].copy(this.pts[i]);
    }
  }

  update(dt: number, anchor: THREE.Vector3, back: THREE.Vector3, cam: THREE.Vector3, t: number, scale = 1) {
    const n = this.pts.length;
    const d = Math.min(dt, 1 / 30);
    this.pts[0].copy(anchor);
    // Wind: a gentle flutter pushing the tail backward.
    const flutter = Math.sin(t * 9) * 0.6 + Math.sin(t * 15.7) * 0.3;
    for (let i = 1; i < n; i++) {
      const p = this.pts[i];
      const o = this.old[i];
      const vx = (p.x - o.x) * 0.96;
      const vy = (p.y - o.y) * 0.96;
      const vz = (p.z - o.z) * 0.96;
      o.copy(p);
      const w = (i / n) * d * d;
      p.x += vx + back.x * 9 * w + flutter * back.z * w * 6;
      p.y += vy - 9 * d * d * 0.4 + (2.4 + Math.sin(t * 7 + i) * 2) * w;
      p.z += vz + back.z * 9 * w - flutter * back.x * w * 6;
      if (p.y < 0.03) p.y = 0.03;
    }
    const seg = this.seg * scale;
    for (let it = 0; it < 3; it++)
      for (let i = 1; i < n; i++) {
        const a = this.pts[i - 1];
        const b = this.pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const l = Math.hypot(dx, dy, dz) || 1e-5;
        const k = (l - seg) / l;
        if (i === 1) {
          b.x -= dx * k;
          b.y -= dy * k;
          b.z -= dz * k;
        } else {
          a.x += dx * k * 0.5;
          a.y += dy * k * 0.5;
          a.z += dz * k * 0.5;
          b.x -= dx * k * 0.5;
          b.y -= dy * k * 0.5;
          b.z -= dz * k * 0.5;
        }
      }
    // Ribbon facing the camera, tapering and torn toward the tip.
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const view = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      dir.subVectors(this.pts[Math.min(n - 1, i + 1)], this.pts[Math.max(0, i - 1)]).normalize();
      view.subVectors(cam, p).normalize();
      side.crossVectors(dir, view).normalize();
      const w = this.width * scale * (1 - (i / n) * 0.45) * (i === n - 1 ? 0.4 : 1);
      pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

function scarfTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#d0161c");
  grd.addColorStop(1, "#8a0a10");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  // Torn, ragged end and a few holes.
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  g.moveTo(0, 256);
  for (let x = 0; x <= 64; x += 6) g.lineTo(x, 200 + Math.random() * 56);
  g.lineTo(64, 256);
  g.closePath();
  g.fill();
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(10 + Math.random() * 44, 80 + Math.random() * 120, 2 + Math.random() * 4, 4 + Math.random() * 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (let y = 120; y < 256; y += 30) {
    g.fillRect(Math.random() < 0.5 ? 0 : 58, y, 6, 10 + Math.random() * 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HeroModel {
  readonly rig: StickRig;
  readonly bodyMat: THREE.MeshStandardMaterial;
  readonly wrathMat: THREE.MeshStandardMaterial;
  readonly katana: ReturnType<typeof katanaMesh>;
  readonly sheathed: THREE.Group;
  readonly guns: ReturnType<typeof revolverMesh>[];
  readonly scarves: Scarf[];
  readonly eyes: THREE.Mesh[] = [];
  readonly eyeMat: THREE.MeshBasicMaterial;

  constructor() {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.55, metalness: 0.1 });
    this.wrathMat = new THREE.MeshStandardMaterial({
      color: 0x1a0300,
      roughness: 0.5,
      emissive: new THREE.Color(2.6, 0.55, 0.08),
      emissiveIntensity: 1,
    });
    this.rig = new StickRig({ body: this.bodyMat, thickness: 0.05, headRadius: 0.165 });
    // Ember eyes.
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.55, 0.1) });
    for (const x of [-0.055, 0.055]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), this.eyeMat);
      e.scale.set(1.7, 0.55, 0.6);
      e.position.set(x, 0.24, 0.145);
      e.rotation.z = x > 0 ? -0.35 : 0.35;
      this.rig.bones.head.add(e);
      this.eyes.push(e);
    }
    // Katana in the right hand.
    this.katana = katanaMesh(new THREE.Color(0.4, 0.6, 1));
    this.katana.group.position.set(0, -0.03, 0);
    this.rig.bones.handR.add(this.katana.group);
    // Sheathed katana across the back (shown while shooting).
    this.sheathed = new THREE.Group();
    const sk = katanaMesh(new THREE.Color(0.4, 0.6, 1));
    this.sheathed.add(sk.group);
    const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.95, 6), new THREE.MeshStandardMaterial({ color: 0x120a0a, roughness: 0.6 }));
    sheath.rotation.x = Math.PI / 2;
    sheath.position.z = 0.6;
    this.sheathed.add(sheath);
    sk.group.children[0].visible = false; // blade hidden inside the sheath
    this.sheathed.position.set(0, -0.05, -0.05);
    this.sheathed.rotation.set(-Math.PI * 0.62, 0, 0.6);
    this.rig.nape.add(this.sheathed);
    this.sheathed.visible = false;
    // Revolvers.
    this.guns = [revolverMesh(), revolverMesh()];
    this.rig.bones.handR.add(this.guns[0].group);
    this.rig.bones.handL.add(this.guns[1].group);
    for (const g of this.guns) g.group.visible = false;
    // Two scarf tails.
    const sm = new THREE.MeshStandardMaterial({
      map: scarfTexture(),
      side: THREE.DoubleSide,
      alphaTest: 0.4,
      roughness: 0.85,
      emissive: new THREE.Color(0.35, 0.02, 0.02),
    });
    this.scarves = [new Scarf(12, 0.12, 0.048, sm), new Scarf(9, 0.11, 0.038, sm)];
    // Wrap around the neck.
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.035, 6, 14), sm);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = 0.04;
    this.rig.bones.head.add(wrap);
  }

  setWeapon(mode: "sword" | "guns") {
    const guns = mode === "guns";
    this.katana.group.visible = !guns;
    this.sheathed.visible = guns;
    for (const g of this.guns) g.group.visible = guns;
  }

  setWrath(on: boolean) {
    this.rig.setMaterial(on ? this.wrathMat : this.bodyMat);
    this.eyeMat.color.setRGB(on ? 3 : 1.9, on ? 1.2 : 0.55, on ? 0.3 : 0.1);
    for (const s of this.scarves) s.mat.emissive.setRGB(on ? 2.5 : 0.35, on ? 0.5 : 0.02, on ? 0.05 : 0.02);
  }
}

/** Snapshot of a rig as a fading silhouette (shared geometry, own material). */
export class Ghost {
  readonly group = new THREE.Group();
  readonly mat: THREE.MeshBasicMaterial;
  t = 0;
  dur = 0.35;
  live = false;
  constructor(rig: StickRig) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false });
    for (const m of rig.meshes) {
      const g = new THREE.Mesh(m.geometry, this.mat);
      g.matrixAutoUpdate = false;
      this.group.add(g);
    }
    this.group.visible = false;
  }
  capture(rig: StickRig, color: THREE.Color, opacity = 0.55, dur = 0.35) {
    rig.root.updateMatrixWorld(true);
    rig.meshes.forEach((m, i) => {
      const g = this.group.children[i] as THREE.Mesh;
      g.matrix.copy(m.matrixWorld);
      g.visible = m.visible && (m.parent?.visible ?? true);
    });
    this.mat.color.copy(color);
    this.mat.opacity = opacity;
    this.t = 0;
    this.dur = dur;
    this.live = true;
    this.group.visible = true;
  }
  update(dt: number) {
    if (!this.live) return;
    this.t += dt;
    const u = this.t / this.dur;
    this.mat.opacity *= 1 - Math.min(1, dt * 6);
    if (u >= 1) {
      this.live = false;
      this.group.visible = false;
    }
  }
}
