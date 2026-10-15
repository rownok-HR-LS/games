// Dev-only model viewer (not part of the build): check scale, facing and animations of each creature.
import * as THREE from "three";
import { instantiate, loadModels, MODEL_URLS, type ModelKey } from "./game/models";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0d0e);
scene.add(new THREE.HemisphereLight(0xffffff, 0x442222, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 4);
scene.add(sun);
const grid = new THREE.GridHelper(10, 10, 0x884444, 0x442222);
scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200);
const ui = document.getElementById("ui")!;
const info = document.getElementById("info")!;
let current: { obj: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[] } | null = null;
const clock = new THREE.Clock();
const w = window as unknown as { show: (k: ModelKey, clip?: string, t?: number, yaw?: number) => string; view: (yaw: number, h: number) => void };

function keyRange(c: THREE.AnimationClip) {
  // Time span in which the clip's values actually change (some exports pad clips with holds).
  let first = Infinity;
  let last = 0;
  for (const tr of c.tracks) {
    const n = tr.times.length;
    const s = tr.getValueSize();
    for (let i = 1; i < n; i++) {
      let diff = 0;
      for (let k = 0; k < s; k++) diff += Math.abs(tr.values[i * s + k] - tr.values[(i - 1) * s + k]);
      if (diff > 1e-4) {
        first = Math.min(first, tr.times[i - 1]);
        last = Math.max(last, tr.times[i]);
      }
    }
  }
  return [first === Infinity ? 0 : first, last];
}

w.show = (k, clipName, t, yaw = 0) => {
  if (current) scene.remove(current.obj);
  const { scene: obj, clips } = instantiate(k);
  const holder = new THREE.Group();
  holder.add(obj);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const s = 2 / size.y;
  holder.scale.setScalar(s);
  holder.rotation.y = yaw;
  holder.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(holder);
  holder.position.y -= b2.min.y;
  const mixer = new THREE.AnimationMixer(obj);
  current = { obj: holder, mixer, clips };
  (window as unknown as { cur: unknown }).cur = current;
  const c = clipName ? clips.find((x) => x.name === clipName) : undefined;
  if (c) {
    const a = mixer.clipAction(c);
    a.play();
    if (t !== undefined) {
      a.paused = true;
      a.time = t;
      mixer.update(0);
    }
  }
  w.view(0.6, 1);
  renderer.render(scene, camera);
  info.textContent = `${k}: raw size ${size.toArray().map((v) => v.toFixed(2)).join(" x ")} (scaled ${s.toFixed(4)})\n` + clips.map((x) => `${x.name} dur ${x.duration.toFixed(2)} keys ${keyRange(x).map((v) => v.toFixed(2)).join("-")}`).join("\n");
  return info.textContent;
};

w.view = (yaw, h) => {
  camera.position.set(Math.sin(yaw) * 5.5, 1.2 + h, Math.cos(yaw) * 5.5);
  camera.lookAt(0, 1, 0);
  renderer.render(scene, camera);
};

loadModels(undefined, Object.keys(MODEL_URLS) as ModelKey[]).then(() => {
  for (const k of Object.keys(MODEL_URLS) as ModelKey[]) {
    const b = document.createElement("button");
    b.textContent = k;
    b.onclick = () => w.show(k, current?.clips[0]?.name);
    ui.appendChild(b);
  }
  w.show("hound");
});

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  current?.mixer.update(dt);
  (window as unknown as { post?: () => void }).post?.();
  renderer.render(scene, camera);
});
