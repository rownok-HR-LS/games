// Loads the creature models (glTF, meshopt-compressed, WebP textures) once, then hands out
// independent animated copies. Models: Sketchfab, see CREDITS in credits.ts.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import houndUrl from "../assets/models/hound.glb?url";
import demonUrl from "../assets/models/demon.glb?url";
import minotaurUrl from "../assets/models/minotaur.glb?url";
import crywolfUrl from "../assets/models/crywolf.glb?url";
import cerberusUrl from "../assets/models/cerberus.glb?url";

export type ModelKey = "hound" | "demon" | "minotaur" | "crywolf" | "cerberus";
export const MODEL_URLS: Record<ModelKey, string> = {
  hound: houndUrl,
  demon: demonUrl,
  minotaur: minotaurUrl,
  crywolf: crywolfUrl,
  cerberus: cerberusUrl,
};

const cache = new Map<ModelKey, GLTF>();
let loading: Promise<void> | null = null;

export function loadModels(onProgress?: (done: number, total: number) => void) {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const keys = Object.keys(MODEL_URLS) as ModelKey[];
  let done = 0;
  loading = Promise.all(
    keys.map((k) =>
      loader.loadAsync(MODEL_URLS[k]).then((g) => {
        cache.set(k, g);
        onProgress?.(++done, keys.length);
      }),
    ),
  ).then(() => undefined);
  return loading;
}

export function modelsReady() {
  return cache.size === Object.keys(MODEL_URLS).length;
}

/** An independent copy of a model: its own skeleton, materials and animation mixer. */
export function instantiate(k: ModelKey) {
  const g = cache.get(k);
  if (!g) throw new Error(`model ${k} not loaded`);
  const scene = cloneSkinned(g.scene) as THREE.Group;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = mats.map((x) => x.clone());
      m.material = Array.isArray(m.material) ? cloned : cloned[0];
    }
  });
  return { scene, clips: g.animations };
}
