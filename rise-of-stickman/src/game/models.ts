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
import merchantUrl from "../assets/models/merchant.glb?url";
import lordFireUrl from "../assets/models/lord_fire.glb?url";
import lordIceUrl from "../assets/models/lord_ice.glb?url";
import lordStormUrl from "../assets/models/lord_storm.glb?url";
import lordShadowUrl from "../assets/models/lord_shadow.glb?url";
import smithUrl from "../assets/models/smith.glb?url";
import steedUrl from "../assets/models/steed.glb?url";
import oracleUrl from "../assets/models/oracle.glb?url";

export type ModelKey =
  | "hound"
  | "demon"
  | "minotaur"
  | "crywolf"
  | "cerberus"
  | "merchant"
  | "lord_fire"
  | "lord_ice"
  | "lord_storm"
  | "lord_shadow"
  | "smith"
  | "steed"
  | "oracle";
export const MODEL_URLS: Record<ModelKey, string> = {
  hound: houndUrl,
  demon: demonUrl,
  minotaur: minotaurUrl,
  crywolf: crywolfUrl,
  cerberus: cerberusUrl,
  merchant: merchantUrl,
  lord_fire: lordFireUrl,
  lord_ice: lordIceUrl,
  lord_storm: lordStormUrl,
  lord_shadow: lordShadowUrl,
  smith: smithUrl,
  steed: steedUrl,
  oracle: oracleUrl,
};

/** Models needed in a run. Hub NPCs (smith, steed, oracle) load later via loadModels(HUB_MODELS). */
export const RUN_MODELS: ModelKey[] = ["hound", "demon", "minotaur", "crywolf", "cerberus", "merchant", "lord_fire", "lord_ice", "lord_storm", "lord_shadow"];
export const HUB_MODELS: ModelKey[] = ["smith", "steed", "oracle"];

const cache = new Map<ModelKey, GLTF>();
const pending = new Map<ModelKey, Promise<GLTF>>();
let loader: GLTFLoader | null = null;

export function loadModels(onProgress?: (done: number, total: number) => void, keys: ModelKey[] = RUN_MODELS) {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const l = loader;
  let done = 0;
  return Promise.all(
    keys.map((k) => {
      let p = pending.get(k);
      if (!p) {
        p = l.loadAsync(MODEL_URLS[k]).then((g) => {
          cache.set(k, g);
          return g;
        });
        pending.set(k, p);
      }
      return p.then(() => onProgress?.(++done, keys.length));
    }),
  ).then(() => undefined);
}

export function modelsReady(keys: ModelKey[] = RUN_MODELS) {
  return keys.every((k) => cache.has(k));
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
