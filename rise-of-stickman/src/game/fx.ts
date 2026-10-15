// Visual effects: GPU point particles (additive + normal), floor decals (blood, scorch),
// crescent slash arcs, bullet tracers, shockwave rings, attack telegraphs and lightning.
import * as THREE from "three";
import { splatTexture } from "./textures";

const MAX_P = 4000;

type PSys = {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  rgba: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  max: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  base: Float32Array; // base size
  grow: Float32Array;
  a0: Float32Array; // starting alpha
  flags: Uint8Array; // 1 = leaves a blood decal on landing, 2 = bounce, 4 = shrink
  count: number;
  next: number;
  mat: THREE.ShaderMaterial;
};

export type Emit = {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  color: THREE.Color;
  alpha?: number;
  size: number;
  life: number;
  gravity?: number;
  drag?: number;
  grow?: number;
  additive?: boolean;
  decal?: boolean;
  bounce?: boolean;
  shrink?: boolean;
};

function makeSys(additive: boolean): PSys {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_P * 3);
  const rgba = new Float32Array(MAX_P * 4);
  const size = new Float32Array(MAX_P);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("rgba", new THREE.BufferAttribute(rgba, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 800 }, soft: { value: additive ? 0.0 : 0.55 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;
      void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec4 vC; uniform float soft;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
        float a = 1.0 - smoothstep(soft, 1.0, r); if (a <= 0.01 || vC.a <= 0.0) discard;
        gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 5 : 4;
  return {
    points,
    geo,
    pos,
    rgba,
    size,
    vel: new Float32Array(MAX_P * 3),
    life: new Float32Array(MAX_P),
    max: new Float32Array(MAX_P),
    grav: new Float32Array(MAX_P),
    drag: new Float32Array(MAX_P),
    base: new Float32Array(MAX_P),
    grow: new Float32Array(MAX_P),
    a0: new Float32Array(MAX_P),
    flags: new Uint8Array(MAX_P),
    count: 0,
    next: 0,
    mat,
  };
}

// ── Slash arcs ────────────────────────────────────────────────────────────────────────
const arcVert = /* glsl */ `
  varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const arcFrag = /* glsl */ `
  varying vec2 vUv; uniform float progress; uniform float fade; uniform vec3 color; uniform vec3 core;
  void main(){
    float a = vUv.x;            // 0 = start of swing, 1 = end
    float r = vUv.y;            // 0 = inner edge, 1 = outer edge
    float head = progress;
    if (a > head) discard;
    float tail = smoothstep(head - 0.55, head, a);
    float edge = pow(r, 2.8);
    float body = tail * edge;
    float hot = smoothstep(0.9, 1.0, r) * tail;
    vec3 c = mix(color, core, hot);
    float alpha = clamp(body * 1.1, 0.0, 0.7) * fade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(c * (1.0 + hot * 0.5), alpha);
  }`;

const WHITE = new THREE.Color(1.1, 1.1, 1.15);

type Arc = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; sweep: number; live: boolean };

function arcGeometry(inner: number, outer: number, angle: number) {
  // Sector in the XZ plane from angle 0 to `angle`, uv.x along the sweep, uv.y radial.
  const seg = 40;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const th = u * angle;
    const c = Math.cos(th);
    const s = Math.sin(th);
    pos.push(c * inner, 0, s * inner, c * outer, 0, s * outer);
    uv.push(u, 0, u, 1);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ── Telegraphs (danger zones on the floor) ─────────────────────────────────────────────
const telFrag = /* glsl */ `
  varying vec2 vUv; uniform float fill; uniform float alpha; uniform vec3 color; uniform float shape; uniform float arc;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float m = 0.0; float f = 0.0; float edge = 0.0;
    if (shape < 0.5) {               // circle
      float r = length(p); if (r > 1.0) discard;
      edge = smoothstep(0.9, 1.0, r); f = step(r, fill);
    } else if (shape < 1.5) {        // rectangle (fills from near end, v = 0)
      edge = max(smoothstep(0.92, 1.0, abs(p.x)), smoothstep(0.96, 1.0, abs(p.y)));
      f = step(vUv.y, fill);
    } else {                         // sector, centred on +v, half-angle 'arc'
      float r = length(p); if (r > 1.0) discard;
      float ang = abs(atan(p.x, p.y)); if (ang > arc) discard;
      edge = max(smoothstep(0.92, 1.0, r), smoothstep(arc - 0.06, arc, ang));
      f = step(r, fill);
    }
    m = 0.1 + f * 0.2 + edge * 0.55;
    gl_FragColor = vec4(color * (0.7 + edge * 0.8), m * alpha);
  }`;

type Tel = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; live: boolean };

type Tracer = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; live: boolean };
type Ring = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; r0: number; r1: number; live: boolean };

export class Fx {
  readonly group = new THREE.Group();
  private add = makeSys(true);
  private norm = makeSys(false);
  private decals: THREE.InstancedMesh;
  private decalNext = 0;
  private decalCount = 0;
  private arcs: Arc[] = [];
  private tels: Tel[] = [];
  private tracers: Tracer[] = [];
  private rings: Ring[] = [];
  private tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  private ringGeo = new THREE.RingGeometry(0.86, 1, 64);
  private dummy = new THREE.Object3D();
  private arcGeos = new Map<string, THREE.BufferGeometry>();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private c = new THREE.Color();
  /** Gore setting: false turns blood into black ink. */
  blood = true;

  constructor() {
    this.group.add(this.add.points, this.norm.points);
    const tex = splatTexture();
    const dm = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      color: 0xffffff,
    });
    const dg = new THREE.PlaneGeometry(1, 1);
    dg.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(dg, dm, 260);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    this.decals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(260 * 3), 3);
    this.group.add(this.decals);
    this.tracerGeo.rotateX(Math.PI / 2); // length along +Z
    this.tracerGeo.translate(0, 0, 0.5);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  setScale(px: number) {
    this.add.mat.uniforms.scale.value = px;
    this.norm.mat.uniforms.scale.value = px;
  }

  clearRoom() {
    this.decalCount = 0;
    this.decalNext = 0;
    this.decals.count = 0;
    for (const s of [this.add, this.norm]) {
      s.life.fill(0);
      s.rgba.fill(0);
    }
    for (const t of this.tels) this.endTel(t);
  }

  // ── Particles ───────────────────────────────────────────────────────────────────────
  emit(e: Emit) {
    const s = e.additive ? this.add : this.norm;
    const i = s.next;
    s.next = (s.next + 1) % MAX_P;
    s.pos[i * 3] = e.x;
    s.pos[i * 3 + 1] = e.y;
    s.pos[i * 3 + 2] = e.z;
    s.vel[i * 3] = e.vx ?? 0;
    s.vel[i * 3 + 1] = e.vy ?? 0;
    s.vel[i * 3 + 2] = e.vz ?? 0;
    s.rgba[i * 4] = e.color.r;
    s.rgba[i * 4 + 1] = e.color.g;
    s.rgba[i * 4 + 2] = e.color.b;
    s.a0[i] = e.alpha ?? 1;
    s.rgba[i * 4 + 3] = s.a0[i];
    s.base[i] = e.size;
    s.size[i] = e.size;
    s.life[i] = e.life;
    s.max[i] = e.life;
    s.grav[i] = e.gravity ?? 0;
    s.drag[i] = e.drag ?? 0;
    s.grow[i] = e.grow ?? 0;
    s.flags[i] = (e.decal ? 1 : 0) | (e.bounce ? 2 : 0) | (e.shrink ? 4 : 0);
  }

  private stepSys(s: PSys, dt: number) {
    for (let i = 0; i < MAX_P; i++) {
      if (s.life[i] <= 0) continue;
      s.life[i] -= dt;
      if (s.life[i] <= 0) {
        s.rgba[i * 4 + 3] = 0;
        s.size[i] = 0;
        continue;
      }
      const k = i * 3;
      const d = Math.max(0, 1 - s.drag[i] * dt);
      s.vel[k] *= d;
      s.vel[k + 2] *= d;
      s.vel[k + 1] = s.vel[k + 1] * d - s.grav[i] * dt;
      s.pos[k] += s.vel[k] * dt;
      s.pos[k + 1] += s.vel[k + 1] * dt;
      s.pos[k + 2] += s.vel[k + 2] * dt;
      if (s.pos[k + 1] < 0.02 && s.vel[k + 1] < 0 && s.grav[i] > 0) {
        s.pos[k + 1] = 0.02;
        if (s.flags[i] & 1) {
          if (Math.random() < 0.45) this.decal(s.pos[k], s.pos[k + 2], s.base[i] * (2.2 + Math.random() * 2.5));
          s.life[i] = 0;
          s.rgba[i * 4 + 3] = 0;
          s.size[i] = 0;
          continue;
        }
        if (s.flags[i] & 2) {
          s.vel[k + 1] *= -0.35;
          s.vel[k] *= 0.6;
          s.vel[k + 2] *= 0.6;
        } else {
          s.vel[k + 1] = 0;
          s.vel[k] *= 0.5;
          s.vel[k + 2] *= 0.5;
        }
      }
      const u = s.life[i] / s.max[i];
      s.rgba[i * 4 + 3] = s.a0[i] * Math.min(1, u * 2.2);
      const g = s.base[i] + s.grow[i] * (1 - u);
      s.size[i] = s.flags[i] & 4 ? g * u : g;
    }
    (s.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (s.geo.attributes.rgba as THREE.BufferAttribute).needsUpdate = true;
    (s.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  // ── High-level emitters ─────────────────────────────────────────────────────────────
  /** Blood spray in a direction (dx,dz), amount ~ 1..3. */
  bleed(p: THREE.Vector3, dx: number, dz: number, amount = 1, up = 1) {
    const n = Math.round(14 * amount);
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 7 * amount;
      const spread = 0.8;
      const red = this.blood ? 0.42 + Math.random() * 0.35 : 0.02;
      this.emit({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: (dx + (Math.random() - 0.5) * spread) * sp,
        vy: (Math.random() * 3 + 1) * up,
        vz: (dz + (Math.random() - 0.5) * spread) * sp,
        color: this.c.setRGB(red, this.blood ? 0.0 : 0.02, this.blood ? 0.02 : 0.03),
        size: 0.05 + Math.random() * 0.09,
        life: 0.6 + Math.random() * 0.6,
        gravity: 16,
        drag: 1.2,
        decal: true,
      });
    }
    // Mist.
    for (let i = 0; i < Math.round(3 * amount); i++) {
      this.emit({
        x: p.x + (Math.random() - 0.5) * 0.3,
        y: p.y + (Math.random() - 0.5) * 0.3,
        z: p.z + (Math.random() - 0.5) * 0.3,
        vx: dx * (1 + Math.random() * 2),
        vy: 0.3,
        vz: dz * (1 + Math.random() * 2),
        color: this.c.setRGB(this.blood ? 0.32 : 0.03, 0.005, 0.015),
        alpha: 0.3,
        size: 0.3 + Math.random() * 0.3,
        grow: 0.8,
        life: 0.5 + Math.random() * 0.4,
        drag: 3,
      });
    }
  }

  sparks(p: THREE.Vector3, color: THREE.Color, n = 12, speed = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * 1.2 - 0.2;
      const sp = speed * (0.4 + Math.random());
      this.emit({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * Math.cos(b) * sp,
        vy: Math.sin(b) * sp + 1,
        vz: Math.sin(a) * Math.cos(b) * sp,
        color,
        size: 0.06 + Math.random() * 0.05,
        life: 0.18 + Math.random() * 0.3,
        gravity: 12,
        drag: 3,
        additive: true,
        bounce: true,
      });
    }
  }

  flash(p: THREE.Vector3, color: THREE.Color, size = 1.6, life = 0.12) {
    this.emit({ x: p.x, y: p.y, z: p.z, color, size, life, additive: true, grow: size * 0.3 });
  }

  fire(p: THREE.Vector3, n = 2, spread = 0.3, power = 1) {
    for (let i = 0; i < n; i++) {
      const hot = Math.random();
      this.emit({
        x: p.x + (Math.random() - 0.5) * spread,
        y: p.y + (Math.random() - 0.5) * spread * 0.5,
        z: p.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.4 + Math.random() * 1.8 * power,
        vz: (Math.random() - 0.5) * 0.6,
        color: this.c.setRGB(2.4 + hot, 0.7 + hot * 0.6, 0.15),
        size: (0.2 + Math.random() * 0.25) * power,
        life: 0.35 + Math.random() * 0.35,
        additive: true,
        shrink: true,
        drag: 1,
      });
    }
  }

  embers(p: THREE.Vector3, n = 1, spread = 1) {
    for (let i = 0; i < n; i++)
      this.emit({
        x: p.x + (Math.random() - 0.5) * spread,
        y: p.y,
        z: p.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.6 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * 0.8,
        color: this.c.setRGB(3, 0.9 + Math.random() * 0.5, 0.2),
        size: 0.04 + Math.random() * 0.04,
        life: 1.5 + Math.random() * 2,
        additive: true,
        drag: 0.3,
      });
  }

  smoke(p: THREE.Vector3, color: THREE.Color, n = 4, size = 0.8, alpha = 0.45) {
    for (let i = 0; i < n; i++)
      this.emit({
        x: p.x + (Math.random() - 0.5) * 0.4,
        y: p.y + Math.random() * 0.3,
        z: p.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 1.6,
        vy: 0.4 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 1.6,
        color,
        alpha,
        size,
        grow: size * 1.4,
        life: 0.6 + Math.random() * 0.5,
        drag: 2,
      });
  }

  /** Brass shell casing ejected from a revolver (the reels' yellow casings). */
  casing(p: THREE.Vector3, dx: number, dz: number) {
    this.emit({
      x: p.x,
      y: p.y,
      z: p.z,
      vx: -dz * 2 + (Math.random() - 0.5),
      vy: 2.5 + Math.random() * 1.5,
      vz: dx * 2 + (Math.random() - 0.5),
      color: this.c.setRGB(1.6, 1.15, 0.3),
      size: 0.06,
      life: 1.6,
      gravity: 14,
      drag: 0.4,
      bounce: true,
      additive: true,
    });
  }

  decal(x: number, z: number, size: number, color?: THREE.Color) {
    const i = this.decalNext;
    this.decalNext = (this.decalNext + 1) % 260;
    this.decalCount = Math.min(260, this.decalCount + 1);
    this.dummy.position.set(x, 0.012 + (i % 13) * 0.0004, z);
    this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.dummy.scale.set(size * (0.7 + Math.random() * 0.6), 1, size);
    this.dummy.updateMatrix();
    this.decals.setMatrixAt(i, this.dummy.matrix);
    const c = color ?? (this.blood ? this.c.setRGB(0.25 + Math.random() * 0.15, 0.0, 0.01) : this.c.setRGB(0.02, 0.02, 0.03));
    this.decals.setColorAt(i, c);
    this.decals.count = this.decalCount;
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor!.needsUpdate = true;
  }

  // ── Slash arcs ──────────────────────────────────────────────────────────────────────
  /**
   * A crescent arc swept around `center`, starting at direction `start` and sweeping `angle` radians
   * toward start × normal. With normal = up the sweep turns clockwise seen from above (toward a +Z-facing
   * character's right); normal = down sweeps toward its left; a horizontal normal gives a vertical slash.
   */
  slash(
    center: THREE.Vector3,
    start: THREE.Vector3,
    normal: THREE.Vector3,
    angle: number,
    radius: number,
    color: THREE.Color,
    opts: { dur?: number; width?: number; core?: THREE.Color } = {},
  ) {
    let arc = this.arcs.find((a) => !a.live);
    if (!arc) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          progress: { value: 0 },
          fade: { value: 1 },
          color: { value: new THREE.Color() },
          core: { value: new THREE.Color() },
        },
        vertexShader: arcVert,
        fragmentShader: arcFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      arc = { mesh: new THREE.Mesh(undefined, mat), mat, t: 0, dur: 0, sweep: 0, live: false };
      arc.mesh.renderOrder = 6;
      arc.mesh.frustumCulled = false;
      this.arcs.push(arc);
      this.group.add(arc.mesh);
    }
    const w = Math.min(radius - 0.05, opts.width ?? 0.55);
    const key = `${radius.toFixed(2)}|${w.toFixed(2)}|${angle.toFixed(2)}`;
    let g = this.arcGeos.get(key);
    if (!g) {
      g = arcGeometry(radius - w, radius, angle);
      this.arcGeos.set(key, g);
    }
    arc.mesh.geometry = g;
    arc.mat.uniforms.color.value.copy(color);
    arc.mat.uniforms.core.value.copy(opts.core ?? WHITE);
    arc.mat.uniforms.progress.value = 0;
    arc.mat.uniforms.fade.value = 1;
    arc.t = 0;
    arc.dur = opts.dur ?? 0.22;
    arc.live = true;
    arc.mesh.visible = true;
    arc.mesh.position.copy(center);
    // Geometry point at θ is (cos θ, 0, sin θ): map local X → start, Y → normal, Z → start × normal.
    const x = this.v1.copy(start).normalize();
    const y = this.v2.copy(normal).normalize();
    const z = this.v3.crossVectors(x, y).normalize();
    y.crossVectors(z, x);
    this.m4.makeBasis(x, y, z);
    arc.mesh.quaternion.setFromRotationMatrix(this.m4);
  }

  // ── Tracers / beams ─────────────────────────────────────────────────────────────────
  beam(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, width = 0.03, dur = 0.07) {
    let t = this.tracers.find((x) => !x.live);
    if (!t) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      t = { mesh: new THREE.Mesh(this.tracerGeo, mat), mat, t: 0, dur: 0, live: false };
      t.mesh.frustumCulled = false;
      t.mesh.renderOrder = 6;
      this.tracers.push(t);
      this.group.add(t.mesh);
    }
    t.mat.color.copy(color);
    t.mat.opacity = 1;
    t.t = 0;
    t.dur = dur;
    t.live = true;
    t.mesh.visible = true;
    t.mesh.position.copy(a);
    t.mesh.lookAt(b);
    t.mesh.scale.set(width, width, a.distanceTo(b));
  }

  lightning(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color) {
    const segs = 6;
    let prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      if (i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6));
      this.beam(prev, p, color, 0.035, 0.14);
      prev = p;
    }
    this.flash(b, color, 1.2, 0.15);
  }

  ring(p: THREE.Vector3, r0: number, r1: number, color: THREE.Color, dur = 0.4) {
    let r = this.rings.find((x) => !x.live);
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      r = { mesh: new THREE.Mesh(this.ringGeo, mat), mat, t: 0, dur: 0, r0: 0, r1: 0, live: false };
      r.mesh.renderOrder = 6;
      this.rings.push(r);
      this.group.add(r.mesh);
    }
    r.mat.color.copy(color);
    r.t = 0;
    r.dur = dur;
    r.r0 = r0;
    r.r1 = r1;
    r.live = true;
    r.mesh.visible = true;
    r.mesh.position.set(p.x, p.y + 0.05, p.z);
  }

  // ── Telegraphs ──────────────────────────────────────────────────────────────────────
  /** Circle (radius), rectangle (width × length starting at p toward yaw) or sector (radius, half-angle). */
  telegraph(
    shape: "circle" | "rect" | "sector",
    p: THREE.Vector3,
    yaw: number,
    a: number,
    b: number,
    dur: number,
    color = new THREE.Color(1.5, 0.1, 0.04),
  ): Tel {
    let t = this.tels.find((x) => !x.live);
    if (!t) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          fill: { value: 0 },
          alpha: { value: 1 },
          color: { value: new THREE.Color() },
          shape: { value: 0 },
          arc: { value: 1 },
        },
        vertexShader: arcVert,
        fragmentShader: telFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      t = { mesh: new THREE.Mesh(g, mat), mat, t: 0, dur: 0, live: false };
      t.mesh.renderOrder = 2;
      this.tels.push(t);
      this.group.add(t.mesh);
    }
    const u = t.mat.uniforms;
    u.color.value.copy(color);
    u.fill.value = 0;
    u.alpha.value = 1;
    t.t = 0;
    t.dur = dur;
    t.live = true;
    t.mesh.visible = true;
    t.mesh.rotation.set(0, yaw, 0);
    if (shape === "circle") {
      u.shape.value = 0;
      t.mesh.position.set(p.x, 0.03, p.z);
      t.mesh.scale.set(a * 2, 1, a * 2);
    } else if (shape === "rect") {
      u.shape.value = 1;
      // Plane's +v (uv.y = 1) is toward −Z after rotateX; flip so it extends along yaw.
      t.mesh.rotation.set(0, yaw + Math.PI, 0);
      t.mesh.position.set(p.x + Math.sin(yaw) * b * 0.5, 0.03, p.z + Math.cos(yaw) * b * 0.5);
      t.mesh.scale.set(a, 1, b);
    } else {
      u.shape.value = 2;
      u.arc.value = b;
      t.mesh.rotation.set(0, yaw + Math.PI, 0);
      t.mesh.position.set(p.x, 0.03, p.z);
      t.mesh.scale.set(a * 2, 1, a * 2);
    }
    return t;
  }

  endTel(t: Tel) {
    t.live = false;
    t.mesh.visible = false;
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────────────
  update(dt: number) {
    this.stepSys(this.add, dt);
    this.stepSys(this.norm, dt);
    for (const a of this.arcs) {
      if (!a.live) continue;
      a.t += dt;
      const u = a.t / a.dur;
      a.mat.uniforms.progress.value = Math.min(1, u * 2.2) + 0.001;
      a.mat.uniforms.fade.value = u < 0.3 ? 1 : Math.max(0, 1 - (u - 0.3) / 0.7);
      if (u >= 1) {
        a.live = false;
        a.mesh.visible = false;
      }
    }
    for (const t of this.tracers) {
      if (!t.live) continue;
      t.t += dt;
      t.mat.opacity = Math.max(0, 1 - t.t / t.dur);
      if (t.t >= t.dur) {
        t.live = false;
        t.mesh.visible = false;
      }
    }
    for (const r of this.rings) {
      if (!r.live) continue;
      r.t += dt;
      const u = Math.min(1, r.t / r.dur);
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - u) * (1 - u));
      r.mesh.scale.set(rad, 1, rad);
      r.mat.opacity = 1 - u;
      if (u >= 1) {
        r.live = false;
        r.mesh.visible = false;
      }
    }
    for (const t of this.tels) {
      if (!t.live) continue;
      t.t += dt;
      t.mat.uniforms.fill.value = Math.min(1, t.t / t.dur);
      t.mat.uniforms.alpha.value = 0.75 + Math.sin(t.t * 30) * 0.25;
      if (t.t >= t.dur + 0.05) this.endTel(t);
    }
  }
}
