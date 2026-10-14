// In-run powers: elemental blessings (one per slot), cursed relics (strong with a downside)
// and new moves. Mods is the flattened result the combat code reads.
import type { IconKind } from "./textures";

export type Element = "fire" | "ice" | "lightning" | "shadow";
export type Slot = "blade" | "guns" | "dash" | "aux";

export type Blessing = { id: string; element: Element; slot: Slot; name: string; text: string };
export type Relic = { id: string; name: string; boon: string; curse: string };
export type Move = { id: string; name: string; text: string };

export const BLESSINGS: Blessing[] = [
  { id: "fire_blade", element: "fire", slot: "blade", name: "Infernal Edge", text: "Katana hits set enemies ablaze: 24 damage over 3 seconds." },
  { id: "fire_guns", element: "fire", slot: "guns", name: "Hellfire Rounds", text: "Bullets explode on impact, scorching everything nearby for 7 damage." },
  { id: "fire_dash", element: "fire", slot: "dash", name: "Ember Wake", text: "Your shadow dash leaves a trail of fire that burns enemies who touch it." },
  { id: "fire_aux", element: "fire", slot: "aux", name: "Pyre of Wrath", text: "Wrath form burns everything within 3 m every half second." },

  { id: "ice_blade", element: "ice", slot: "blade", name: "Frostbite Edge", text: "Katana hits chill. Five chills freeze an enemy; frozen enemies shatter when killed." },
  { id: "ice_guns", element: "ice", slot: "guns", name: "Glacial Rounds", text: "Bullets chill. Chilled enemies move and attack 35% slower." },
  { id: "ice_dash", element: "ice", slot: "dash", name: "Frost Step", text: "Enemies you dash through are frozen solid for 1.5 seconds." },
  { id: "ice_aux", element: "ice", slot: "aux", name: "Cold Judgement", text: "A perfect parry releases a freezing nova around you." },

  { id: "lightning_blade", element: "lightning", slot: "blade", name: "Storm Edge", text: "Katana hits arc lightning to 2 nearby enemies for 9 damage." },
  { id: "lightning_guns", element: "lightning", slot: "guns", name: "Thunder Rounds", text: "Every 4th shot is a lightning bolt that pierces all enemies in its path." },
  { id: "lightning_dash", element: "lightning", slot: "dash", name: "Static Rush", text: "Your dash zaps every enemy you pass through for 14 damage." },
  { id: "lightning_aux", element: "lightning", slot: "aux", name: "Wrath of Heaven", text: "In Wrath form, lightning strikes a nearby enemy every 0.4 seconds." },

  { id: "shadow_blade", element: "shadow", slot: "blade", name: "Night Edge", text: "25% chance for a katana hit to deal double damage as a shadow strike." },
  { id: "shadow_guns", element: "shadow", slot: "guns", name: "Phantom Rounds", text: "Bullets pass through enemies and hit everything in a line." },
  { id: "shadow_dash", element: "shadow", slot: "dash", name: "Ink Clone", text: "Dashing leaves an ink clone that explodes after a moment for 22 damage." },
  { id: "shadow_aux", element: "shadow", slot: "aux", name: "Soul Harvest", text: "Every kill heals you for 2." },
];

export const RELICS: Relic[] = [
  { id: "pact", name: "Pact of Blood", boon: "+40% damage.", curse: "You can no longer heal." },
  { id: "halo", name: "Glass Halo", boon: "+80% damage.", curse: "Max health −40%." },
  { id: "hook", name: "Gravedigger's Hook", boon: "Kills heal 3.", curse: "−15% damage." },
  { id: "hourglass", name: "Hourglass of Ash", boon: "Parry window doubled.", curse: "One fewer dash charge." },
  { id: "eye", name: "Demon's Eye", boon: "+60% style points.", curse: "You take 25% more damage." },
  { id: "crown", name: "Broken Crown", boon: "Wrath fills twice as fast.", curse: "Wrath form lasts 6 s instead of 10." },
];

export const MOVES: Move[] = [
  { id: "splitter", name: "Ground Splitter", text: "Hold attack to charge, release to send a crack through the floor that tears through every enemy in a line." },
  { id: "barrage", name: "Gun-Spin Barrage", text: "While your revolvers spin to reload, they fire 16 bullets in a spiral around you." },
  { id: "phantom", name: "Phantom Step", text: "+1 dash charge, and dashing through enemies cuts them for 12 damage." },
  { id: "executioner", name: "Executioner", text: "The spin finisher instantly kills any non-boss enemy below 30% health." },
];

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: "#ff6a1a",
  ice: "#7fe3ff",
  lightning: "#ffe14a",
  shadow: "#b06bff",
};

export type Reward =
  | { kind: "blessing"; element: Element }
  | { kind: "relic" }
  | { kind: "move" }
  | { kind: "health" }
  | { kind: "souls" }
  | { kind: "boss" };

export function rewardIcon(r: Reward): IconKind {
  return r.kind === "blessing" ? r.element : r.kind === "relic" ? "relic" : r.kind === "move" ? "move" : r.kind === "health" ? "health" : r.kind === "souls" ? "souls" : "boss";
}

export function rewardLabel(r: Reward) {
  switch (r.kind) {
    case "blessing":
      return `${r.element[0].toUpperCase()}${r.element.slice(1)} Blessing`;
    case "relic":
      return "Cursed Relic";
    case "move":
      return "New Move";
    case "health":
      return "Blood Font";
    case "souls":
      return "Demon Souls";
    case "boss":
      return "Cerberus";
  }
}

export type Mods = {
  dmg: number;
  taken: number;
  heal: number;
  maxHp: number;
  style: number;
  wrathGain: number;
  wrathDur: number;
  parryWindow: number;
  dashCharges: number;
  killHeal: number;
};

export class Loadout {
  slots: Partial<Record<Slot, Blessing>> = {};
  relics: Relic[] = [];
  moves = new Set<string>();

  has(id: string) {
    for (const b of Object.values(this.slots)) if (b?.id === id) return true;
    return this.relics.some((r) => r.id === id) || this.moves.has(id);
  }

  mods(): Mods {
    const m: Mods = { dmg: 1, taken: 1, heal: 1, maxHp: 1, style: 1, wrathGain: 1, wrathDur: 10, parryWindow: 1, dashCharges: 2, killHeal: 0 };
    for (const r of this.relics) {
      if (r.id === "pact") {
        m.dmg *= 1.4;
        m.heal = 0;
      } else if (r.id === "halo") {
        m.dmg *= 1.8;
        m.maxHp *= 0.6;
      } else if (r.id === "hook") {
        m.killHeal += 3;
        m.dmg *= 0.85;
      } else if (r.id === "hourglass") {
        m.parryWindow *= 2;
        m.dashCharges -= 1;
      } else if (r.id === "eye") {
        m.style *= 1.6;
        m.taken *= 1.25;
      } else if (r.id === "crown") {
        m.wrathGain *= 2;
        m.wrathDur = 6;
      }
    }
    if (this.moves.has("phantom")) m.dashCharges += 1;
    if (this.has("shadow_aux")) m.killHeal += 2;
    return m;
  }

  /** Three blessing offers of an element (prefers empty slots and new ones). */
  offerBlessings(el: Element): Blessing[] {
    return BLESSINGS.filter((b) => b.element === el && this.slots[b.slot]?.id !== b.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
  }
  offerRelics(): Relic[] {
    return RELICS.filter((r) => !this.relics.some((x) => x.id === r.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
  }
  offerMoves(): Move[] {
    return MOVES.filter((m) => !this.moves.has(m.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
  }
}
