// Stickman rig: a hierarchy of joints with capsule limbs, posed by per-bone rotations.
//
// Conventions (character faces +Z, its right hand is on −X):
//   thigh.x < 0 swings the leg forward, shin.x > 0 bends the knee.
//   arm.x < 0 swings the arm forward/up (−π/2 = straight ahead, −π = straight up).
//   arm.z: right arm outward is negative, left arm outward is positive.
//   fore.x < 0 bends the elbow.  spine.x > 0 leans forward.  spine.y > 0 twists toward the left.
import * as THREE from "three";

export type BoneName =
  | "hips"
  | "spine"
  | "head"
  | "armR"
  | "foreR"
  | "handR"
  | "armL"
  | "foreL"
  | "handL"
  | "thighR"
  | "shinR"
  | "thighL"
  | "shinL";

export type E3 = [number, number, number];
export type Pose = { [K in BoneName]?: E3 } & { y?: number };

export const BONES: BoneName[] = [
  "hips",
  "spine",
  "head",
  "armR",
  "foreR",
  "handR",
  "armL",
  "foreL",
  "handL",
  "thighR",
  "shinR",
  "thighL",
  "shinL",
];

export type RigLook = {
  body: THREE.Material;
  /** Limb thickness (radius) in metres at scale 1. */
  thickness?: number;
  headRadius?: number;
  /** Extra bulk on the torso (brutes, bosses). */
  torso?: number;
};

const DIM = {
  hipY: 0.98,
  thigh: 0.48,
  shin: 0.48,
  spine: 0.58,
  upper: 0.32,
  fore: 0.32,
  shoulderX: 0.07,
  hipX: 0.09,
};

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

function capsule(radius: number, len: number, mat: THREE.Material, up = false) {
  const g = new THREE.CapsuleGeometry(radius, len, 3, 8);
  g.translate(0, up ? len / 2 : -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export class StickRig {
  readonly root = new THREE.Group();
  /** Scaled container (size of the character; Wrath form grows this). */
  readonly body = new THREE.Group();
  readonly bones = {} as Record<BoneName, THREE.Group>;
  readonly headMesh: THREE.Mesh;
  /** Point on the upper back where scarves and the sheathed sword hang from. */
  readonly nape = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  readonly hipY = DIM.hipY;
  private targets = {} as Record<BoneName, THREE.Quaternion>;
  private yOffset = 0;

  constructor(look: RigLook) {
    const r = look.thickness ?? 0.052;
    const mat = look.body;
    const b = this.bones;
    for (const n of BONES) {
      b[n] = new THREE.Group();
      b[n].name = n;
      this.targets[n] = new THREE.Quaternion();
    }
    this.root.add(this.body);
    this.body.add(b.hips);
    b.hips.position.y = DIM.hipY;

    // Torso.
    b.hips.add(b.spine);
    const spineMesh = capsule(r * (look.torso ?? 1.15), DIM.spine, mat, true);
    b.spine.add(spineMesh);
    b.spine.add(b.head);
    b.head.position.y = DIM.spine;
    const hr = look.headRadius ?? 0.17;
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(hr, 18, 14), mat);
    this.headMesh.position.y = 0.06 + hr;
    this.headMesh.castShadow = true;
    b.head.add(this.headMesh);
    const neck = capsule(r * 0.9, 0.08, mat, true);
    b.head.add(neck);
    b.spine.add(this.nape);
    this.nape.position.set(0, DIM.spine - 0.04, -0.06);

    // Arms.
    for (const [arm, fore, hand, side] of [
      ["armR", "foreR", "handR", -1],
      ["armL", "foreL", "handL", 1],
    ] as const) {
      b.spine.add(b[arm]);
      b[arm].position.set(side * DIM.shoulderX, DIM.spine - 0.04, 0);
      b[arm].add(capsule(r, DIM.upper, mat));
      b[arm].add(b[fore]);
      b[fore].position.y = -DIM.upper;
      b[fore].add(capsule(r * 0.95, DIM.fore, mat));
      b[fore].add(b[hand]);
      b[hand].position.y = -DIM.fore;
    }

    // Legs.
    for (const [thigh, shin, side] of [
      ["thighR", "shinR", -1],
      ["thighL", "shinL", 1],
    ] as const) {
      b.hips.add(b[thigh]);
      b[thigh].position.x = side * DIM.hipX;
      b[thigh].add(capsule(r * 1.05, DIM.thigh, mat));
      b[thigh].add(b[shin]);
      b[shin].position.y = -DIM.thigh;
      b[shin].add(capsule(r, DIM.shin, mat));
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.meshes.push(o as THREE.Mesh);
    });
  }

  /** Set the target pose (bones not listed go to rest). */
  setPose(p: Pose) {
    for (const n of BONES) {
      const e = p[n];
      if (e) this.targets[n].setFromEuler(tmpE.set(e[0], e[1], e[2], "YXZ"));
      else this.targets[n].identity();
    }
    this.yOffset = p.y ?? 0;
  }

  /** Move joints toward the target pose; rate is per second (higher = snappier). */
  update(dt: number, rate = 22) {
    const a = rate >= 999 ? 1 : 1 - Math.exp(-dt * rate);
    for (const n of BONES) this.bones[n].quaternion.slerp(this.targets[n], a);
    const hips = this.bones.hips;
    hips.position.y += (DIM.hipY + this.yOffset - hips.position.y) * a;
  }

  /** Snap straight to the target pose. */
  snap() {
    this.update(0, 999);
  }

  setMaterial(m: THREE.Material) {
    for (const mesh of this.meshes) mesh.material = m;
  }

  worldOf(bone: BoneName, out: THREE.Vector3, local?: THREE.Vector3) {
    const g = this.bones[bone];
    g.updateWorldMatrix(true, false);
    return out.copy(local ?? ZERO).applyMatrix4(g.matrixWorld);
  }
}

const ZERO = new THREE.Vector3();

/** Mirror a pose left↔right (for alternating swings). */
export function mirror(p: Pose): Pose {
  const out: Pose = { y: p.y };
  const swap: Record<string, BoneName> = {
    armR: "armL",
    armL: "armR",
    foreR: "foreL",
    foreL: "foreR",
    handR: "handL",
    handL: "handR",
    thighR: "thighL",
    thighL: "thighR",
    shinR: "shinL",
    shinL: "shinR",
  };
  for (const n of BONES) {
    const e = p[n];
    if (!e) continue;
    out[swap[n] ?? n] = [e[0], -e[1], -e[2]];
  }
  return out;
}

/** Blend two poses (t = 0 → a, 1 → b), per-component lerp. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = { y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t };
  for (const n of BONES) {
    const ea = a[n] ?? Z3;
    const eb = b[n] ?? Z3;
    if (!a[n] && !b[n]) continue;
    out[n] = [ea[0] + (eb[0] - ea[0]) * t, ea[1] + (eb[1] - ea[1]) * t, ea[2] + (eb[2] - ea[2]) * t];
  }
  return out;
}

/** Add b's rotations on top of a (for layering breathing, recoil, flinches). */
export function addPose(a: Pose, b: Pose, w = 1): Pose {
  const out: Pose = { y: (a.y ?? 0) + (b.y ?? 0) * w };
  for (const n of BONES) {
    const ea = a[n];
    const eb = b[n];
    if (!ea && !eb) continue;
    const x = ea ?? Z3;
    const y = eb ?? Z3;
    out[n] = [x[0] + y[0] * w, x[1] + y[1] * w, x[2] + y[2] * w];
  }
  return out;
}

const Z3: E3 = [0, 0, 0];

/** Keyframed clip: sample at time t (seconds) with smoothstep easing between keys. */
export type Key = { t: number; pose: Pose; ease?: "in" | "out" | "linear" | "smooth" };
export function sampleClip(keys: Key[], t: number): Pose {
  if (t <= keys[0].t) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k.t) {
      const p = keys[i - 1];
      let u = (t - p.t) / Math.max(1e-6, k.t - p.t);
      const e = k.ease ?? "smooth";
      if (e === "smooth") u = u * u * (3 - 2 * u);
      else if (e === "out") u = 1 - (1 - u) * (1 - u) * (1 - u);
      else if (e === "in") u = u * u * u;
      return lerpPose(p.pose, k.pose, u);
    }
  }
  return keys[keys.length - 1].pose;
}

export function quatOf(e: E3) {
  return tmpQ.setFromEuler(tmpE.set(e[0], e[1], e[2], "YXZ"));
}
