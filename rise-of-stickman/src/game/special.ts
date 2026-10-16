// Non-combat chambers: the Bone Merchant's shop (a talking skull on a candle cart, paid in Bone
// Coins) and the Blood Fountain (heals once).
import * as THREE from "three";
import { Creature } from "./creatures";
import { gauntletMesh, glaiveDiscMesh, katanaMesh, scytheMesh } from "./hero";
import { WEAPON_ORDER, WEAPONS, type WeaponId } from "./weapons";
import { ELEMENT_COLOR, type Element } from "./boons";
import { glowTexture, iconTexture, ICON_COLOR, type IconKind } from "./textures";

export type ShopItem =
  | { kind: "vial"; price: number }
  | { kind: "blessing"; element: Element; price: number }
  | { kind: "ember"; price: number }
  | { kind: "relic"; price: number }
  | { kind: "move"; price: number }
  | { kind: "defiance"; price: number };

export function itemName(i: ShopItem) {
  switch (i.kind) {
    case "vial":
      return "Blood Vial (heal 30%)";
    case "blessing":
      return `${i.element[0].toUpperCase()}${i.element.slice(1)} Blessing`;
    case "ember":
      return "Ember Heart (level up a blessing)";
    case "relic":
      return "Cursed Relic";
    case "move":
      return "New Move";
    case "defiance":
      return "Death Defiance (restore 1 extra life)";
  }
}

export function itemIcon(i: ShopItem): IconKind {
  switch (i.kind) {
    case "vial":
      return "health";
    case "blessing":
      return i.element;
    case "ember":
      return "ember";
    case "relic":
      return "relic";
    case "move":
      return "move";
    case "defiance":
      return "boss";
  }
}

function label(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 40px 'Barlow Condensed', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(text, 128, 34);
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.8, 0.45, 1);
  return s;
}

export const MERCHANT_LINES = {
  enter: [
    "Heh heh heh... a customer! Coins first, questions never.",
    "Back from the dead again? Death is good for business.",
    "Spend it here, Horseman. The pit doesn't take coins.",
    "Ooh, blood on your boots. Fresh! Browse, browse.",
  ],
  buy: ["A fine choice! Fine for me, anyway.", "Pleasure doing business. Try not to die before you use it.", "Heh! Sold!", "No refunds. Not even in death."],
  poor: ["No coins, no bones, no deal.", "Come back when your pockets rattle.", "I don't do credit. I don't do mercy either."],
  leave: ["Mind the spikes on your way out!", "Come back alive. Or don't, heh."],
};

export function pick<T>(a: T[]) {
  return a[(Math.random() * a.length) | 0];
}

export class Shop {
  readonly group = new THREE.Group();
  readonly items: { item: ShopItem; pos: THREE.Vector3; sold: boolean; icon: THREE.Sprite; tag: THREE.Sprite; ped: THREE.Group }[] = [];
  private merchant: Creature;
  private skull: THREE.Group;
  private talkT = 0;
  private flames: { s: THREE.Sprite; base: number }[] = [];
  private time = 0;
  readonly merchantPos = new THREE.Vector3(0, 0, -4.5);

  constructor(items: ShopItem[]) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2b2522, metalness: 0.8, roughness: 0.45 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xe0d4bc, roughness: 0.6 });
    const wax = new THREE.MeshStandardMaterial({ color: 0xd9cfb8, roughness: 0.8 });
    // Cart.
    const cart = new THREE.Group();
    cart.position.copy(this.merchantPos);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.6), wood);
    body.position.y = 1.0;
    body.castShadow = true;
    cart.add(body);
    for (const sx of [-1.4, 1.4]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 18), iron);
      wheel.position.set(sx, 0.55, 0.85);
      cart.add(wheel);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), iron);
      spoke.position.copy(wheel.position);
      cart.add(spoke);
    }
    // The merchant: a big pirate-hatted skull with an animated jaw, perched on the cart.
    this.skull = new THREE.Group();
    this.skull.position.set(0, 1.55, 0.1);
    this.merchant = new Creature({ key: "merchant", height: 3.1, yaw: Math.PI / 2, glow: [0.05, 0.03, 0.02], clips: { talk: { name: "Take 001" } } });
    this.merchant.play("talk");
    this.skull.add(this.merchant.root);
    const eyeGlow = new THREE.PointLight(0x7dffc0, 2.5, 3, 2);
    eyeGlow.position.set(0, 1.5, 1.2);
    this.skull.add(eyeGlow);
    cart.add(this.skull);
    // Candles.
    const flameTex = glowTexture();
    for (let i = 0; i < 7; i++) {
      const x = (i % 2 ? -1 : 1) * (0.85 + Math.random() * 0.6);
      const h = 0.2 + Math.random() * 0.35;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 8), wax);
      candle.position.set(x, 1.55 + h / 2, 0.3 + Math.random() * 0.5 - 0.25);
      cart.add(candle);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(1.6, 0.8, 0.25), blending: THREE.AdditiveBlending, depthWrite: false }));
      f.position.set(x, 1.55 + h + 0.1, candle.position.z);
      f.scale.setScalar(0.3);
      cart.add(f);
      this.flames.push({ s: f, base: 0.3 });
    }
    const light = new THREE.PointLight(0xffa04a, 6, 8, 1.8);
    light.position.set(0, 1.9, 1.8);
    cart.add(light);
    this.group.add(cart);

    // Item pedestals in an arc in front of the cart.
    items.forEach((item, i) => {
      const a = (i - (items.length - 1) / 2) * 0.55;
      const pos = new THREE.Vector3(Math.sin(a) * 4.2, 0, -4.5 + Math.cos(a) * 4.2);
      const ped = new THREE.Group();
      ped.position.copy(pos);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.0, 10), new THREE.MeshStandardMaterial({ color: 0x3a302c, roughness: 0.9 }));
      col.position.y = 0.5;
      col.castShadow = true;
      ped.add(col);
      const kind = itemIcon(item);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind), transparent: true, depthWrite: false, opacity: 0.85, color: new THREE.Color(0.55, 0.55, 0.55) }));
      icon.position.y = 1.7;
      icon.scale.setScalar(1.2);
      ped.add(icon);
      const color = item.kind === "blessing" ? ELEMENT_COLOR[item.element] : ICON_COLOR[kind];
      const tag = label(`${item.price}`, "#ffd24a");
      tag.position.y = 2.55;
      tag.visible = false; // prices are shown by the HUD markers
      ped.add(tag);
      const glow = new THREE.PointLight(new THREE.Color(color), 1.5, 2.5, 2);
      glow.position.y = 1.6;
      ped.add(glow);
      this.group.add(ped);
      this.items.push({ item, pos, sold: false, icon, tag, ped });
    });
  }

  sell(i: number) {
    const it = this.items[i];
    it.sold = true;
    it.icon.visible = false;
    it.tag.visible = false;
  }

  talk() {
    this.talkT = 1.4;
  }

  update(dt: number, fx?: { emit: (e: Parameters<import("./fx").Fx["emit"]>[0]) => void }) {
    this.time += dt;
    // Green soul-wisps drifting up around the merchant.
    if (fx && Math.random() < dt * 9) {
      const a = Math.random() * Math.PI * 2;
      fx.emit({ x: this.merchantPos.x + Math.cos(a) * 1.3, y: 1.8 + Math.random() * 1.6, z: this.merchantPos.z + 0.1 + Math.sin(a) * 1.0, vx: -Math.sin(a) * 0.4, vy: 0.35 + Math.random() * 0.4, vz: Math.cos(a) * 0.4, color: new THREE.Color(0.35, 1.6, 0.9), size: 0.06 + Math.random() * 0.05, life: 1.6 + Math.random(), additive: true, drag: 0.4 });
    }
    this.talkT = Math.max(0, this.talkT - dt);
    this.merchant.setSpeed(this.talkT > 0 ? 2.4 : 0.8);
    this.merchant.update(dt);
    this.skull.position.y = 1.55 + Math.sin(this.time * 2) * 0.04 + (this.talkT > 0 ? Math.abs(Math.sin(this.time * 11)) * 0.05 : 0);
    this.skull.rotation.z = Math.sin(this.time * 1.3) * 0.08;
    for (const f of this.flames) f.s.scale.setScalar(f.base * (0.85 + Math.random() * 0.3));
    for (const it of this.items) if (!it.sold) it.icon.position.y = 1.7 + Math.sin(this.time * 2.5 + it.pos.x) * 0.1;
  }
}

export class Fountain {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3(0, 0, -1);
  used = false;
  private surface: THREE.Mesh;
  private time = 0;
  constructor() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a3c38, roughness: 0.9 });
    this.group.position.copy(this.pos);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.3, 0.7, 20), stone);
    base.position.y = 0.35;
    base.castShadow = true;
    this.group.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.18, 8, 28), stone);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.72;
    this.group.add(rim);
    this.surface = new THREE.Mesh(new THREE.CircleGeometry(1.8, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a0006, emissive: new THREE.Color(1.4, 0.05, 0.08), roughness: 0.15, metalness: 0.2 }));
    this.surface.position.y = 0.66;
    this.group.add(this.surface);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 10), stone);
    pillar.position.y = 1.4;
    this.group.add(pillar);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.6 }));
    skull.position.y = 2.7;
    this.group.add(skull);
    const light = new THREE.PointLight(0xff2030, 14, 8, 1.6);
    light.position.y = 1.8;
    this.group.add(light);
  }

  use() {
    this.used = true;
    (this.surface.material as THREE.MeshStandardMaterial).emissive.setRGB(0.15, 0.0, 0.01);
  }

  update(dt: number, fx: { emit: (e: Parameters<import("./fx").Fx["emit"]>[0]) => void }) {
    this.time += dt;
    if (this.used) return;
    if (Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2;
      fx.emit({
        x: this.pos.x + Math.cos(a) * 0.2,
        y: 2.5,
        z: this.pos.z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * 1.4,
        vy: 1.5,
        vz: Math.sin(a) * 1.4,
        color: new THREE.Color(0.5, 0.0, 0.02),
        size: 0.09,
        life: 1,
        gravity: 9,
        drag: 0.3,
      });
    }
  }
}

/** The weapon racks in the Forsaken Stable, beside Krag: the four weapons on stone plinths. */
export class Armoury {
  readonly group = new THREE.Group();
  readonly racks: { id: WeaponId; pos: THREE.Vector3; display: THREE.Group; light: THREE.PointLight; ring: THREE.Mesh }[] = [];
  private time = 0;
  constructor(spots?: THREE.Vector3[]) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a3e3a, roughness: 0.92 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2626, metalness: 0.85, roughness: 0.4 });
    WEAPON_ORDER.forEach((id, i) => {
      const pos = spots?.[i]?.clone() ?? new THREE.Vector3(-4.8 + i * 3.2, 0, -1.6 - Math.abs(i - 1.5) * 0.6);
      const w = WEAPONS[id];
      const col = w.trail.clone().multiplyScalar(1.6);
      const base = new THREE.Group();
      base.position.copy(pos);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 8), stone);
      plinth.position.y = 0.45;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      base.add(plinth);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.6, 0.12, 8), stone);
      cap.position.y = 0.95;
      base.add(cap);
      // Rack frame behind the plinth.
      for (const sx of [-0.75, 0.75]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), iron);
        post.position.set(sx, 1.3, -0.75);
        post.castShadow = true;
        base.add(post);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), iron);
        tip.position.set(sx, 2.75, -0.75);
        base.add(tip);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), iron);
      bar.position.set(0, 2.35, -0.75);
      base.add(bar);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.0, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.position.y = 0.03;
      base.add(ring);
      // The weapon itself, floating above the plinth.
      const display = new THREE.Group();
      display.position.y = 1.85;
      const glow = new THREE.Color(col.r * 0.9, col.g * 0.9, col.b * 0.9);
      if (id === "katana") {
        const k = katanaMesh(glow);
        k.group.rotation.x = -Math.PI / 2;
        k.group.position.y = -0.45;
        k.group.scale.setScalar(1.25);
        display.add(k.group);
      } else if (id === "scythes") {
        for (const side of [-1, 1]) {
          const sc = scytheMesh(glow);
          sc.group.rotation.set(-Math.PI / 2, 0, side * 0.45);
          sc.group.position.set(side * 0.18, -0.35, 0);
          sc.group.scale.setScalar(1.3);
          display.add(sc.group);
        }
      } else if (id === "gauntlets") {
        for (const side of [-1, 1]) {
          const gt = gauntletMesh(glow);
          gt.group.position.set(side * 0.22, 0, 0);
          gt.group.rotation.z = side * 0.25;
          gt.group.scale.setScalar(1.8);
          display.add(gt.group);
        }
      } else {
        const d = glaiveDiscMesh(glow);
        d.group.scale.setScalar(1.6);
        display.add(d.group);
      }
      display.scale.setScalar(1.8);
      base.add(display);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col.clone().multiplyScalar(0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.set(0, 1.85, -0.2);
      halo.scale.setScalar(2.4);
      base.add(halo);
      const light = new THREE.PointLight(col, 2.5, 4.5, 1.8);
      light.position.set(0, 2.0, 1.1);
      base.add(light);
      this.group.add(base);
      this.racks.push({ id, pos, display, light, ring });
    });
  }

  update(dt: number, equipped: WeaponId) {
    this.time += dt;
    for (const r of this.racks) {
      const on = r.id === equipped;
      r.display.rotation.y += dt * (on ? 1.4 : 0.6);
      r.display.position.y = 1.85 + Math.sin(this.time * 1.8 + r.pos.x) * 0.08;
      (r.ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.7 + Math.sin(this.time * 4) * 0.15 : 0.22;
      r.light.intensity = on ? 4.5 : 2.2;
    }
  }
}
