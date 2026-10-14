// Animated creature built from a loaded glTF model: scaled to a target height, turned to face +Z,
// with named animation actions (sub-clips cut from longer timelines where needed), cross-fades,
// bone lookups for procedural extras, and hit-flash / freeze / burn tinting.
import * as THREE from "three";
import { instantiate, type ModelKey } from "./models";

export type ClipRef = { name: string; from?: number; to?: number };

export type CreatureSpec = {
  key: ModelKey;
  /** Target height in metres. */
  height: number;
  /** Rotation that makes the model face +Z. */
  yaw: number;
  /** Extra height (flyers). */
  lift?: number;
  clips: Record<string, ClipRef>;
  /** Hell tint added to every material's emissive. */
  glow?: [number, number, number];
};

export type TintMode = "normal" | "flash" | "frozen" | "burn";
type Mat = THREE.MeshStandardMaterial;

export class Creature {
  readonly root = new THREE.Group();
  readonly holder = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly spec: CreatureSpec;
  /** Size of the scaled model (metres). */
  readonly size = new THREE.Vector3();
  private actions = new Map<string, THREE.AnimationAction>();
  current = "";
  private mats: { m: Mat; base: THREE.Color; map: boolean }[] = [];
  private bones = new Map<string, THREE.Object3D>();

  constructor(spec: CreatureSpec) {
    this.spec = spec;
    const { scene, clips } = instantiate(spec.key);
    this.model = scene;
    this.holder.add(scene);
    this.root.add(this.holder);
    this.holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.holder);
    const raw = box.getSize(new THREE.Vector3());
    const s = spec.height / Math.max(1e-6, raw.y);
    this.holder.scale.setScalar(s);
    this.holder.rotation.y = spec.yaw;
    this.holder.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(this.holder);
    this.holder.position.y = -b2.min.y + (spec.lift ?? 0);
    b2.getSize(this.size);

    this.mixer = new THREE.AnimationMixer(scene);
    for (const [logical, ref] of Object.entries(spec.clips)) {
      const src = clips.find((c) => c.name === ref.name);
      if (!src) continue;
      let clip = src;
      if (ref.from !== undefined || ref.to !== undefined) {
        const fps = 30;
        clip = THREE.AnimationUtils.subclip(src, logical, Math.round((ref.from ?? 0) * fps), Math.round((ref.to ?? src.duration) * fps), fps);
      }
      this.actions.set(logical, this.mixer.clipAction(clip));
    }

    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const sm = m as Mat;
        if (!sm.emissive) continue;
        if (spec.glow && !sm.emissiveMap) sm.emissive.setRGB(...spec.glow);
        this.mats.push({ m: sm, base: sm.emissive.clone(), map: !!sm.emissiveMap });
      }
    });
  }

  has(name: string) {
    return this.actions.has(name);
  }

  /** Cross-fade to an action. loop=false plays once and holds the last frame. */
  play(name: string, o: { fade?: number; loop?: boolean; speed?: number; restart?: boolean } = {}) {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = o.speed ?? 1;
    if (this.current === name && !o.restart) return;
    const prev = this.actions.get(this.current);
    a.reset();
    a.setLoop(o.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = o.loop === false;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, o.fade ?? 0.18, false);
    this.current = name;
  }

  setSpeed(speed: number) {
    const a = this.actions.get(this.current);
    if (a) a.timeScale = speed;
  }

  /** Fraction (0..1) through the current one-shot action. */
  progress() {
    const a = this.actions.get(this.current);
    if (!a) return 1;
    return Math.min(1, a.time / Math.max(1e-6, a.getClip().duration));
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  bone(prefix: string) {
    for (const [n, b] of this.bones) if (n.startsWith(prefix)) return b;
    return null;
  }

  /** World position of a bone (or a point in front of the model if missing). */
  boneWorld(prefix: string, out: THREE.Vector3, fwd = 0.4, h = 0.6) {
    const b = this.bone(prefix);
    if (b) return b.getWorldPosition(out);
    this.root.updateMatrixWorld(true);
    return out.set(0, this.size.y * h, this.size.z * fwd).applyMatrix4(this.root.matrixWorld);
  }

  tint(mode: TintMode, time: number) {
    for (const { m, base, map } of this.mats) {
      if (mode === "flash") m.emissive.setRGB(0.9, 0.85, 0.8);
      else if (mode === "frozen") m.emissive.setRGB(0.15, 0.45, 0.7);
      else if (mode === "burn") m.emissive.copy(base).add(new THREE.Color(0.6 + Math.sin(time * 30) * 0.2, 0.14, 0.02));
      else m.emissive.copy(base);
      if (map && mode !== "normal") m.emissiveIntensity = 1;
    }
  }

  dim() {
    for (const { m, base } of this.mats) m.emissive.copy(base).multiplyScalar(0.25);
  }

  /** All materials (for slicing). */
  materials() {
    return this.mats.map((x) => x.m);
  }

  dispose() {
    this.mixer.stopAllAction();
  }
}
