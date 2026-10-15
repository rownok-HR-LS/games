// In-run powers: elemental blessings (one per slot, with rarity and level), cursed relics
// (strong with a downside) and new moves. Mods is the flattened result the combat code reads;
// power(id) is a blessing's strength multiplier (0 when not owned).
import type { IconKind } from "./textures";

export type Element = "fire" | "ice" | "lightning" | "shadow" | "blood" | "plague";
export const ELEMENTS: Element[] = ["fire", "ice", "lightning", "shadow", "blood", "plague"];
export type Slot = "blade" | "guns" | "dash" | "aux";
export type Rarity = "common" | "rare" | "epic" | "heroic";

export type Blessing = {
  id: string;
  element: Element;
  slot: Slot;
  name: string;
  text: string;
  /** Duo (two Lords) or Legendary blessings sit outside the four slots. */
  kind?: "duo" | "legend";
  pair?: [Element, Element];
};
export type Owned = Blessing & { rarity: Rarity; level: number };
export type Relic = { id: string; name: string; boon: string; curse: string };
export type Move = { id: string; name: string; text: string };

export const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.4, epic: 1.8, heroic: 2.3 };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#c9c3bd", rare: "#58a8ff", epic: "#c06bff", heroic: "#ff4a3a" };
const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "heroic"];
/** Each Ember Heart level adds this much on top of the rarity multiplier. */
export const LEVEL_STEP = 0.3;

export const BLESSINGS: Blessing[] = [
  { id: "fire_blade", element: "fire", slot: "blade", name: "Infernal Edge", text: "Weapon hits set enemies ablaze: 24 damage over 3 seconds." },
  { id: "fire_guns", element: "fire", slot: "guns", name: "Hellfire Rounds", text: "Bullets explode on impact, scorching everything nearby for 7 damage." },
  { id: "fire_dash", element: "fire", slot: "dash", name: "Ember Wake", text: "Your shadow dash leaves a trail of fire that burns enemies who touch it." },
  { id: "fire_aux", element: "fire", slot: "aux", name: "Pyre of Wrath", text: "Wrath form burns everything within 3 m every half second." },

  { id: "ice_blade", element: "ice", slot: "blade", name: "Frostbite Edge", text: "Weapon hits chill. Five chills freeze an enemy; frozen enemies shatter when killed." },
  { id: "ice_guns", element: "ice", slot: "guns", name: "Glacial Rounds", text: "Bullets chill. Chilled enemies move and attack 35% slower." },
  { id: "ice_dash", element: "ice", slot: "dash", name: "Frost Step", text: "Enemies you dash through are frozen solid for 1.5 seconds." },
  { id: "ice_aux", element: "ice", slot: "aux", name: "Cold Judgement", text: "A perfect parry releases a freezing nova around you." },

  { id: "lightning_blade", element: "lightning", slot: "blade", name: "Storm Edge", text: "Weapon hits arc lightning to 2 nearby enemies for 9 damage." },
  { id: "lightning_guns", element: "lightning", slot: "guns", name: "Thunder Rounds", text: "Every 4th shot is a lightning bolt that pierces all enemies in its path." },
  { id: "lightning_dash", element: "lightning", slot: "dash", name: "Static Rush", text: "Your dash zaps every enemy you pass through for 14 damage." },
  { id: "lightning_aux", element: "lightning", slot: "aux", name: "Wrath of Heaven", text: "In Wrath form, lightning strikes a nearby enemy every 0.4 seconds." },

  { id: "shadow_blade", element: "shadow", slot: "blade", name: "Night Edge", text: "25% chance for a weapon hit to deal double damage as a shadow strike." },
  { id: "shadow_guns", element: "shadow", slot: "guns", name: "Phantom Rounds", text: "Bullets pass through enemies and hit everything in a line." },
  { id: "shadow_dash", element: "shadow", slot: "dash", name: "Ink Clone", text: "Dashing leaves an ink clone that explodes after a moment for 22 damage." },
  { id: "shadow_aux", element: "shadow", slot: "aux", name: "Soul Harvest", text: "Every kill heals you for 2." },

  { id: "blood_blade", element: "blood", slot: "blade", name: "Crimson Edge", text: "Weapon hits make enemies Bleed: 3 damage a second per stack, up to 5 stacks." },
  { id: "blood_guns", element: "blood", slot: "guns", name: "Leech Rounds", text: "Every 3rd bullet that hits heals you for 1." },
  { id: "blood_dash", element: "blood", slot: "dash", name: "Red Mist", text: "Enemies you dash through Bleed (2 stacks), and each one heals you for 2." },
  { id: "blood_aux", element: "blood", slot: "aux", name: "Last Stand", text: "Below 30% health you deal 40% more damage and take 20% less." },

  { id: "plague_blade", element: "plague", slot: "blade", name: "Rot Edge", text: "Weapon hits Rot enemies for 4 s: they deal 25% less damage and take 15% more." },
  { id: "plague_guns", element: "plague", slot: "guns", name: "Miasma Rounds", text: "Bullets leave a small poison cloud where they hit." },
  { id: "plague_dash", element: "plague", slot: "dash", name: "Plague Wake", text: "Your dash leaves a trail of poison clouds." },
  { id: "plague_aux", element: "plague", slot: "aux", name: "Pestilence", text: "Rotted enemies burst into a poison cloud when they die." },
];

const duo = (id: string, a: Element, b: Element, name: string, text: string): Blessing => ({ id, element: a, slot: "aux", name, text, kind: "duo", pair: [a, b] });
/** Duo blessings: offered by either Lord once you hold a blessing from both. */
export const DUOS: Blessing[] = [
  duo("thermal_shock", "fire", "ice", "Thermal Shock", "Fire hits on frozen enemies shatter the ice in a 40-damage explosion."),
  duo("wildfire_storm", "fire", "lightning", "Wildfire Storm", "Chain lightning sets every enemy it jumps to on fire."),
  duo("black_flame", "fire", "shadow", "Black Flame", "Shadow strikes ignite their target, and burning enemies are 15% more likely to take one."),
  duo("boiling_blood", "fire", "blood", "Boiling Blood", "Bleeding enemies take 50% more burn damage."),
  duo("pyre_of_rot", "fire", "plague", "Pyre of Rot", "Fire ignites poison clouds into a burst of flame."),
  duo("superconductor", "ice", "lightning", "Superconductor", "Lightning leaps twice as far between chilled enemies and deals 50% more to frozen ones."),
  duo("frozen_shade", "ice", "shadow", "Frozen Shade", "Ink Clone explosions freeze everything they hit."),
  duo("frostbitten_veins", "ice", "blood", "Frostbitten Veins", "Frozen enemies Bleed three times faster, and every shatter heals you for 5."),
  duo("cold_rot", "ice", "plague", "Cold Rot", "Poison clouds chill, and chilled enemies are Rotted."),
  duo("dark_thunder", "lightning", "shadow", "Dark Thunder", "Shadow strikes call down a bolt of lightning on their target."),
  duo("arterial_arc", "lightning", "blood", "Arterial Arc", "Chain lightning makes enemies Bleed and heals you 1 per jump."),
  duo("contagion_arc", "lightning", "plague", "Contagion Arc", "Chain lightning spreads Rot to every enemy it jumps to."),
  duo("night_feast", "shadow", "blood", "Night Feast", "Shadow-strike kills heal you for 4. Below half health, +10% shadow strike chance."),
  duo("creeping_doom", "shadow", "plague", "Creeping Doom", "Ink Clones leave a poison cloud when they explode."),
  duo("black_death", "blood", "plague", "Black Death", "Enemies that are both Bleeding and Rotted take double damage over time."),
];

const legend = (id: string, el: Element, name: string, text: string): Blessing => ({ id, element: el, slot: "aux", name, text, kind: "legend" });
/** Legendary blessings: one per Lord, offered once you hold 2+ of that Lord's blessings. */
export const LEGENDS: Blessing[] = [
  legend("inferno_crown", "fire", "Inferno Crown", "Burning enemies explode when they die, scorching everything nearby for 30."),
  legend("absolute_zero", "ice", "Absolute Zero", "Every 8 s, your next weapon hit freezes its target solid."),
  legend("judgement_bolt", "lightning", "Judgement Bolt", "Every 5th weapon hit calls a bolt from the sky for 40 damage."),
  legend("eclipse", "shadow", "Eclipse", "After a perfect dodge, your next 3 hits are guaranteed shadow strikes."),
  legend("undying_thirst", "blood", "Undying Thirst", "Once per chamber, a killing blow leaves you at 30% health instead."),
  legend("pandemic", "plague", "Pandemic", "When an enemy dies in a poison cloud, the cloud grows and spreads to its body."),
];

export const ALL_BLESSINGS: Blessing[] = [...BLESSINGS, ...DUOS, ...LEGENDS];

export const RELICS: Relic[] = [
  { id: "pact", name: "Pact of Blood", boon: "+40% damage.", curse: "You can no longer heal." },
  { id: "halo", name: "Glass Halo", boon: "+80% damage.", curse: "Max health −40%." },
  { id: "hook", name: "Gravedigger's Hook", boon: "Kills heal 3.", curse: "−15% damage." },
  { id: "hourglass", name: "Hourglass of Ash", boon: "Parry window doubled.", curse: "One fewer dash charge." },
  { id: "eye", name: "Demon's Eye", boon: "+60% style points.", curse: "You take 25% more damage." },
  { id: "crown", name: "Broken Crown", boon: "Wrath fills twice as fast.", curse: "Wrath form lasts 4 s instead of 7." },
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
  blood: "#ff2a46",
  plague: "#9be05a",
};

// ── Rooms and rewards ─────────────────────────────────────────────────────────────────
export type RoomType = "combat" | "elite" | "abyss" | "shop" | "fountain" | "miniboss" | "boss" | "armoury";

export type Reward =
  | { kind: "blessing"; element: Element; minRarity?: Rarity }
  | { kind: "relic" }
  | { kind: "move" }
  | { kind: "health" }
  | { kind: "coins"; amount: number }
  | { kind: "ember" }
  | { kind: "anvil" };

export type DoorPlan = { type: RoomType; reward: Reward | null };

export function rewardIcon(r: Reward): IconKind {
  switch (r.kind) {
    case "blessing":
      return r.element;
    case "coins":
      return "coins";
    case "ember":
      return "ember";
    case "anvil":
      return "anvil";
    default:
      return r.kind;
  }
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
    case "coins":
      return `${r.amount} Bone Coins`;
    case "ember":
      return "Ember Heart";
    case "anvil":
      return "Soul Anvil";
  }
}

export function doorIcon(d: DoorPlan): IconKind {
  if (d.type === "shop") return "shop";
  if (d.type === "fountain") return "fountain";
  if (d.type === "miniboss" || d.type === "boss") return "boss";
  return d.reward ? rewardIcon(d.reward) : "souls";
}

export function rollRarity(min: Rarity = "common"): Rarity {
  const x = Math.random();
  let r: Rarity = x < 0.06 ? "epic" : x < 0.3 ? "rare" : "common";
  if (RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf(min)) r = min;
  return r;
}

export function bumpRarity(r: Rarity): Rarity {
  return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, RARITY_ORDER.indexOf(r) + 1)];
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
  slots: Partial<Record<Slot, Owned>> = {};
  /** Duo and Legendary blessings (outside the slots). */
  extras: Owned[] = [];
  relics: Relic[] = [];
  moves = new Set<string>();
  /** Soul Anvil weapon upgrades taken this run. */
  anvil = new Set<string>();

  has(id: string) {
    for (const b of Object.values(this.slots)) if (b?.id === id) return true;
    if (this.extras.some((b) => b.id === id)) return true;
    return this.relics.some((r) => r.id === id) || this.moves.has(id);
  }

  owned(): Owned[] {
    return [...Object.values(this.slots).filter((b): b is Owned => !!b), ...this.extras];
  }

  /** Strength multiplier of a blessing (0 if not owned). */
  power(id: string) {
    for (const b of this.owned()) if (b.id === id) return RARITY_MULT[b.rarity] * (1 + LEVEL_STEP * (b.level - 1));
    return 0;
  }

  take(b: Blessing, rarity: Rarity) {
    if (b.kind) {
      if (!this.extras.some((x) => x.id === b.id)) this.extras.push({ ...b, rarity, level: 1 });
    } else this.slots[b.slot] = { ...b, rarity, level: 1 };
  }

  /** Base blessings held from a Lord. */
  countOf(el: Element) {
    return Object.values(this.slots).filter((b) => b?.element === el).length;
  }

  levelUp(id: string) {
    const b = this.owned().find((x) => x.id === id);
    if (b) b.level++;
  }

  mods(): Mods {
    const m: Mods = { dmg: 1, taken: 1, heal: 1, maxHp: 1, style: 1, wrathGain: 1, wrathDur: 7, parryWindow: 1, dashCharges: 2, killHeal: 0 };
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
        m.wrathDur = 4;
      }
    }
    if (this.moves.has("phantom")) m.dashCharges += 1;
    m.killHeal += 2 * this.power("shadow_aux");
    return m;
  }

  /**
   * Three offers from a Lord. Duos (you hold a blessing from both Lords) and the Legendary (you hold 2+
   * of this Lord's) can take one of the places.
   */
  offerBlessings(el: Element): Blessing[] {
    const base = BLESSINGS.filter((b) => b.element === el && this.slots[b.slot]?.id !== b.id).sort(() => Math.random() - 0.5);
    const special = [
      ...DUOS.filter((d) => d.pair!.includes(el) && !this.has(d.id) && d.pair!.every((p) => this.countOf(p) > 0)),
      ...LEGENDS.filter((l) => l.element === el && !this.has(l.id) && this.countOf(el) >= 2),
    ].sort(() => Math.random() - 0.5);
    const out = base.slice(0, 3);
    if (special.length && Math.random() < 0.45) out[Math.min(out.length, 2)] = special[0];
    return out.filter(Boolean);
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
