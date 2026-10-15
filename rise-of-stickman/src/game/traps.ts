// Spike plates: anything that steps on one arms it (click + red glow); half a second later a
// bed of spikes shoots up and hurts everyone standing on it, hero and demons alike.
import * as THREE from "three";
import type { Game } from "./game";

const HALF = 0.85;
const ARM = 0.55;
const UP = 0.7;
const COOL = 1.1;

let shared: { plate: THREE.MeshStandardMaterial; spike: THREE.MeshStandardMaterial; spikeGeo: THREE.ConeGeometry; plateGeo: THREE.BoxGeometry; holeGeo: THREE.CircleGeometry; hole: THREE.MeshBasicMaterial } | null = null;

export class SpikePlate {
  readonly pos: THREE.Vector3;
  readonly group = new THREE.Group();
  private spikes: THREE.InstancedMesh;
  private plateMat: THREE.MeshStandardMaterial;
  private state: "idle" | "armed" | "up" | "cool" = "idle";
  private t = 0;
  private hitIds = new Set<number>();
  private hitPlayer = false;
  private dummy = new THREE.Object3D();

  constructor(parent: THREE.Object3D, x: number, z: number) {
    shared ??= {
      plate: new THREE.MeshStandardMaterial({ color: 0x2c2624, metalness: 0.7, roughness: 0.5, emissive: new THREE.Color(0, 0, 0) }),
      spike: new THREE.MeshStandardMaterial({ color: 0xc8c0b4, metalness: 0.8, roughness: 0.3 }),
      spikeGeo: new THREE.ConeGeometry(0.09, 0.7, 6).translate(0, 0.35, 0),
      plateGeo: new THREE.BoxGeometry(HALF * 2, 0.06, HALF * 2),
      holeGeo: new THREE.CircleGeometry(0.1, 8).rotateX(-Math.PI / 2),
      hole: new THREE.MeshBasicMaterial({ color: 0x050302 }),
    };
    this.pos = new THREE.Vector3(x, 0, z);
    this.group.position.copy(this.pos);
    this.plateMat = shared.plate.clone();
    const plate = new THREE.Mesh(shared.plateGeo, this.plateMat);
    plate.position.y = 0.02;
    plate.receiveShadow = true;
    this.group.add(plate);
    this.spikes = new THREE.InstancedMesh(shared.spikeGeo, shared.spike, 16);
    this.spikes.castShadow = true;
    let i = 0;
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++) {
        const hx = -HALF + 0.22 + (a * (HALF * 2 - 0.44)) / 3;
        const hz = -HALF + 0.22 + (b * (HALF * 2 - 0.44)) / 3;
        const hole = new THREE.Mesh(shared.holeGeo, shared.hole);
        hole.position.set(hx, 0.055, hz);
        this.group.add(hole);
        this.dummy.position.set(hx, -0.75, hz);
        this.dummy.updateMatrix();
        this.spikes.setMatrixAt(i++, this.dummy.matrix);
      }
    this.group.add(this.spikes);
    parent.add(this.group);
  }

  private on(x: number, z: number, r = 0) {
    return Math.abs(x - this.pos.x) < HALF + r && Math.abs(z - this.pos.z) < HALF + r;
  }

  private setHeight(h: number) {
    let i = 0;
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++) {
        const hx = -HALF + 0.22 + (a * (HALF * 2 - 0.44)) / 3;
        const hz = -HALF + 0.22 + (b * (HALF * 2 - 0.44)) / 3;
        this.dummy.position.set(hx, h, hz);
        this.dummy.updateMatrix();
        this.spikes.setMatrixAt(i++, this.dummy.matrix);
      }
    this.spikes.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, g: Game) {
    this.t += dt;
    const p = g.player;
    switch (this.state) {
      case "idle": {
        const stepped = this.on(p.pos.x, p.pos.z) || g.enemies.some((e) => e.alive && !e.def.flying && this.on(e.pos.x, e.pos.z, e.radius * 0.5));
        this.plateMat.emissive.setRGB(0, 0, 0);
        if (stepped) {
          this.state = "armed";
          this.t = 0;
          g.audio.trapClick();
        }
        break;
      }
      case "armed": {
        const u = this.t / ARM;
        this.plateMat.emissive.setRGB(0.6 + Math.sin(this.t * 40) * 0.3, 0.05, 0.02).multiplyScalar(u + 0.3);
        this.setHeight(-0.75 + u * 0.15);
        if (this.t >= ARM) {
          this.state = "up";
          this.t = 0;
          this.hitIds.clear();
          this.hitPlayer = false;
          g.audio.spikes();
          g.fx.sparks(new THREE.Vector3(this.pos.x, 0.2, this.pos.z), new THREE.Color(2, 1.6, 1), 8, 4);
        }
        break;
      }
      case "up": {
        this.setHeight(Math.min(0, -0.75 + (this.t / 0.06) * 0.75));
        this.plateMat.emissive.setRGB(0.3, 0.02, 0.01);
        if (!this.hitPlayer && this.on(p.pos.x, p.pos.z, 0.1)) {
          this.hitPlayer = true;
          p.receive(null, this.pos, 16, { parryable: false, kind: "aoe", knock: 5 });
        }
        for (const e of g.enemies) {
          if (!e.alive || e.def.flying || this.hitIds.has(e.id) || !this.on(e.pos.x, e.pos.z, e.radius * 0.5)) continue;
          this.hitIds.add(e.id);
          g.damage(e, { dmg: 40, dir: new THREE.Vector3(0, 0, 0), kind: "element", move: "trap", launch: 4, at: e.pos.clone().setY(0.5) });
          g.style.add("trap", 60);
        }
        if (this.t >= UP) {
          this.state = "cool";
          this.t = 0;
        }
        break;
      }
      case "cool":
        this.setHeight(Math.max(-0.75, -(this.t / 0.3) * 0.75));
        this.plateMat.emissive.setRGB(0, 0, 0);
        if (this.t >= COOL) {
          this.state = "idle";
          this.t = 0;
        }
        break;
    }
  }
}
