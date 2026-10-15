// The Fallen Lords: one per element. When the hero takes a blessing orb, its Lord rises out of the floor
// as a glowing apparition, speaks, stays while the blessing is chosen, then sinks back down.
import * as THREE from "three";
import { ELEMENT_COLOR, type Element } from "./boons";
import { Creature, type CreatureSpec } from "./creatures";
import type { Fx } from "./fx";

export type LordDef = {
  name: string;
  title: string;
  spec: CreatureSpec;
  /** Replacement base colour for untextured models. */
  color?: number;
  greet: string[];
  part: string[];
};

export const LORDS: Record<Element, LordDef> = {
  fire: {
    name: "Azgaroth",
    title: "Lord of Embers",
    spec: { key: "lord_fire", height: 3.8, yaw: 0, glow: [0.1, 0.022, 0.0], clips: { idle: { name: "Idle" }, gesture: { name: "Intimidate", from: 26, to: 29.17 } } },
    color: 0x4a3530,
    greet: ["Burn them, little horseman. Burn them all.", "My fire answers your rage. Take it.", "The Pits remember my flame. Remind them."],
    part: ["Leave nothing but ash.", "Go. Make them scream."],
  },
  ice: {
    name: "Morwen",
    title: "the Frost Widow",
    spec: { key: "lord_ice", height: 3.3, yaw: 0, glow: [0.02, 0.05, 0.09], clips: { idle: { name: "Armature|Iddle" } } },
    greet: ["Cold hands, cold heart. You will need both.", "Let me still their blood for you.", "So warm... so fragile. Take my winter."],
    part: ["Freeze, and then shatter.", "Do not look back, horseman."],
  },
  lightning: {
    name: "Tharyx",
    title: "the Storm Tyrant",
    spec: { key: "lord_storm", height: 3.8, yaw: 0, glow: [0.03, 0.025, 0.005], clips: { idle: { name: "elemental_lord_fight_idle" }, gesture: { name: "elemental_lord_skill3" } } },
    greet: ["Kneel? No. Strike. Strike faster.", "The storm chose you. Do not bore it.", "Thunder for the betrayed one!"],
    part: ["Be quick. Be cruel.", "Let the sky do the rest."],
  },
  shadow: {
    name: "Sir Vael",
    title: "Knight of the Eclipse",
    spec: { key: "lord_shadow", height: 3.6, yaw: 0, glow: [0.03, 0.008, 0.05], clips: { idle: { name: "allanimations", from: 0, to: 1.9 }, gesture: { name: "allanimations", from: 10.5, to: 13 } } },
    greet: ["I too was betrayed. Take my shadow.", "Strike from where they cannot see.", "The dark keeps its promises. Unlike them."],
    part: ["Walk unseen, brother.", "Your vengeance is mine as well."],
  },
  blood: {
    name: "Vharkul",
    title: "the Crimson Sovereign",
    spec: { key: "lord_blood", height: 3.7, yaw: 0, glow: [0.05, 0.005, 0.01], clips: { idle: { name: "birdcage-378914" } } },
    greet: ["Your blood sings, horseman. Let me teach it to feast.", "Drink deep. They have so much to spare.", "Pain is only blood leaving. Make theirs leave faster."],
    part: ["Bleed them dry.", "Come back to me thirsty."],
  },
  plague: {
    name: "Mortis",
    title: "the Plague Saint",
    spec: { key: "lord_plague", height: 3.4, yaw: 0, glow: [0.03, 0.06, 0.01], clips: { idle: { name: "Take 001" } } },
    greet: ["Breathe in, little horseman. Rot is only patience.", "Every wound I touch festers. Let me touch theirs.", "The plague is a mercy. For you."],
    part: ["Spread it far.", "Let them choke on it."],
  },
};

export function lordName(el: Element) {
  return `${LORDS[el].name}, ${LORDS[el].title}`;
}

const RISE = 1.0;
const SINK = 1.1;

/** Rim-light colour per element (HDR, picked up by bloom). */
const RIM: Record<Element, [number, number, number]> = {
  fire: [0.85, 0.2, 0.03],
  ice: [0.45, 0.95, 1.8],
  lightning: [0.55, 0.48, 0.14],
  shadow: [0.75, 0.25, 1.5],
  blood: [1.2, 0.05, 0.1],
  plague: [0.45, 1.1, 0.15],
};

let sigilTex: THREE.Texture | null = null;
/** Summoning circle: rings, a five-point star and rune ticks (white, tinted by the material). */
function sigilTexture() {
  if (sigilTex) return sigilTex;
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.translate(S / 2, S / 2);
  g.strokeStyle = "#fff";
  g.shadowColor = "#fff";
  g.shadowBlur = 10;
  for (const [r, w] of [
    [240, 6],
    [214, 3],
    [150, 4],
  ]) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
    if (i === 0) g.moveTo(Math.cos(a) * 150, Math.sin(a) * 150);
    else g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150);
  }
  g.stroke();
  // Rune ticks between the outer rings.
  g.lineWidth = 3;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r1 = i % 3 === 0 ? 238 : 230;
    g.beginPath();
    g.moveTo(Math.cos(a) * 218, Math.sin(a) * 218);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    if (i % 3 === 0) g.lineTo(Math.cos(a + 0.05) * (r1 - 6), Math.sin(a + 0.05) * (r1 - 6));
    g.stroke();
  }
  sigilTex = new THREE.CanvasTexture(c);
  return sigilTex;
}

export class LordApparition {
  readonly root = new THREE.Group();
  readonly element: Element;
  private creature: Creature;
  private light: THREE.PointLight;
  private halo: THREE.Mesh;
  private t = 0;
  private life = 0;
  private state: "rise" | "stay" | "sink" = "rise";
  private mats: THREE.MeshStandardMaterial[] = [];
  private rim = { value: 0 };
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private c = new THREE.Color();
  done = false;

  constructor(el: Element, pos: THREE.Vector3, face: THREE.Vector3) {
    this.element = el;
    const def = LORDS[el];
    this.creature = new Creature(def.spec);
    const rimCol = new THREE.Color(...RIM[el]);
    for (const m of this.creature.materials()) {
      if (def.color !== undefined) m.color.setHex(def.color);
      if (m.emissiveMap) m.emissiveIntensity = 0.35;
      // Fresnel rim glow in the Lord's element colour.
      const rim = this.rim;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.rimColor = { value: rimCol };
        sh.uniforms.rimStrength = rim;
        sh.fragmentShader = sh.fragmentShader
          .replace("void main() {", "uniform vec3 rimColor;\nuniform float rimStrength;\nvoid main() {")
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += rimColor * rimStrength * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.2);",
          );
      };
      m.customProgramCacheKey = () => "lordRim";
      m.needsUpdate = true;
      this.mats.push(m);
    }
    this.root.position.copy(pos);
    this.root.rotation.y = Math.atan2(face.x - pos.x, face.z - pos.z);
    this.root.add(this.creature.root);
    const col = new THREE.Color(ELEMENT_COLOR[el]);
    this.light = new THREE.PointLight(col, 0, 9, 1.6);
    this.light.position.set(0, 2.6, 2.2);
    this.root.add(this.light);
    // Summoning circle on the floor where the Lord rises.
    this.halo = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: sigilTexture(), color: col.multiplyScalar(1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.halo.position.y = 0.05;
    this.root.add(this.halo);
    this.creature.root.position.y = -this.creature.size.y;
    this.creature.play(this.creature.has("gesture") ? "gesture" : "idle", { loop: false, fade: 0 });
  }

  get name() {
    return lordName(this.element);
  }

  dismiss() {
    if (this.state === "sink") return;
    this.state = "sink";
    this.t = 0;
    for (const m of this.mats) m.transparent = true;
  }

  /** Real (unscaled) time, so the Lord keeps moving while the blessing cards pause the game. */
  update(real: number, fx: Fx) {
    this.t += real;
    this.life += real;
    const c = this.creature;
    if (c.current === "gesture" && c.progress() >= 1) c.play("idle", { fade: 0.4 });
    c.update(real);
    const h = c.size.y;
    this.halo.rotation.y += real * 0.35;
    let vis = 1;
    if (this.state === "rise") {
      const k = Math.min(1, this.t / RISE);
      vis = 1 - Math.pow(1 - k, 3);
      c.root.position.y = -h * (1 - vis);
      if (k >= 1) {
        this.state = "stay";
        this.t = 0;
      }
    } else if (this.state === "stay") {
      c.root.position.y = Math.sin(this.t * 1.6) * 0.05;
    } else {
      const k = Math.min(1, this.t / SINK);
      vis = 1 - k;
      c.root.position.y = -h * k * k;
      for (const m of this.mats) m.opacity = 1 - k;
      if (k >= 1) this.done = true;
    }
    this.light.intensity = vis * (4.5 + Math.sin(this.life * 3) * 0.7);
    (this.halo.material as THREE.MeshBasicMaterial).opacity = vis * (0.55 + Math.sin(this.life * 2.2) * 0.12);
    this.rim.value = vis * (0.8 + Math.sin(this.life * 2.6) * 0.2);
    this.aura(real, fx, vis, h);
  }

  /** Element particles around the body. */
  private aura(dt: number, fx: Fx, vis: number, h: number) {
    if (vis <= 0.05) return;
    const base = this.root.position;
    const n = Math.floor(26 * vis * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random();
      const x = base.x + Math.cos(a) * r;
      const z = base.z + Math.sin(a) * r;
      const y = Math.random() * h * 0.9;
      switch (this.element) {
        case "fire":
          fx.emit({ x, y, z, vx: (Math.random() - 0.5) * 0.5, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.5, color: this.c.setRGB(3, 0.8 + Math.random() * 0.6, 0.15), size: 0.05 + Math.random() * 0.05, life: 0.9 + Math.random() * 0.8, additive: true, drag: 0.4 });
          break;
        case "ice":
          // Snow motes swirling around the Widow.
          fx.emit({ x, y: y + 0.6, z, vx: -Math.sin(a) * 1.2, vy: -0.25 - Math.random() * 0.3, vz: Math.cos(a) * 1.2, color: this.c.setRGB(1.2, 1.7, 2.4), size: 0.04 + Math.random() * 0.05, life: 1.3 + Math.random(), additive: true, drag: 0.6 });
          break;
        case "lightning":
          fx.emit({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.2) * 3, vz: (Math.random() - 0.5) * 3, color: this.c.setRGB(1.8, 1.6, 0.6), size: 0.035, life: 0.25 + Math.random() * 0.25, additive: true, drag: 3 });
          break;
        case "blood":
          fx.emit({ x, y, z, vy: -0.6 - Math.random() * 0.6, color: this.c.setRGB(0.55, 0.0, 0.03), size: 0.06 + Math.random() * 0.04, life: 1.0, gravity: 4 });
          if (Math.random() < 0.3) fx.emit({ x, y: Math.random() * 0.6, z, vy: 0.3, color: this.c.setRGB(0.3, 0.0, 0.02), alpha: 0.4, size: 0.5, grow: 0.6, life: 1.2, drag: 1 });
          break;
        case "plague":
          fx.emit({ x, y: Math.random() * 0.9, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.3, color: this.c.setRGB(0.18, 0.32, 0.06), alpha: 0.45, size: 0.55, grow: 0.9, life: 1.6, drag: 1 });
          if (Math.random() < 0.4) fx.emit({ x, y, z, vy: 0.4, color: this.c.setRGB(0.7, 1.6, 0.3), size: 0.04, life: 1.0, additive: true, drag: 0.5 });
          break;
        case "shadow":
          if (Math.random() < 0.5) fx.emit({ x, y: Math.random() * 0.8, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4, color: this.c.setRGB(0.05, 0.01, 0.08), alpha: 0.5 * vis, size: 0.5, grow: 0.8, life: 1.2, drag: 1 });
          else fx.emit({ x, y, z, vy: 0.4 + Math.random() * 0.5, color: this.c.setRGB(1.1, 0.35, 2.2), size: 0.05, life: 1.2, additive: true, drag: 0.5 });
          break;
      }
    }
    // The Storm Tyrant crackles: arcs of lightning around his body now and then.
    if (this.element === "lightning" && Math.random() < dt * 1.3 * vis) {
      const a = Math.random() * Math.PI * 2;
      this.tmp.set(base.x + Math.cos(a) * 0.8, h * (0.3 + Math.random() * 0.6), base.z + Math.sin(a) * 0.8);
      this.tmp2.set(base.x + Math.cos(a + 1.4) * 1.1, h * (0.2 + Math.random() * 0.7), base.z + Math.sin(a + 1.4) * 1.1);
      fx.lightning(this.tmp, this.tmp2, this.c.setRGB(2.2, 2.0, 0.7));
    }
  }

  dispose() {
    this.creature.dispose();
  }
}
