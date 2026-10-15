// The Soul Anvil: weapon upgrades that change how a weapon attacks. A rare door offers three for the
// weapon in hand; each one taken lasts the rest of the run. Move-shape changes are applied here;
// on-hit behaviours are checked by id in the player code.
import type { SlashDef } from "./anims";
import type { WeaponDef, WeaponId } from "./weapons";

export type AnvilUpgrade = { id: string; name: string; text: string };

export const ANVIL: Record<WeaponId, AnvilUpgrade[]> = {
  katana: [
    { id: "moon_wave", name: "Blood Moon Wave", text: "The cyclone finisher launches a flying crescent wave that pierces everything in a line." },
    { id: "quickdraw", name: "Quickdraw", text: "Your second slash also fires both revolvers at the nearest enemies." },
    { id: "twin_cyclone", name: "Twin Cyclone", text: "Crimson Cyclone spins twice as long." },
    { id: "rift_walker", name: "Rift Walker", text: "Rift Cut leaves a rift that cuts everything along it again half a second later." },
    { id: "first_blood", name: "First Blood", text: "Weapon hits on enemies above 80% health deal double damage." },
  ],
  scythes: [
    { id: "reapers_toss", name: "Reaper's Toss", text: "The X-cross hurls both scythes out like boomerangs that pierce and return." },
    { id: "blade_orbit", name: "Blade Orbit", text: "After Whirlwind, two spectral scythes orbit you for 4 s, cutting anything they touch." },
    { id: "thousand_cuts", name: "Thousand Cuts", text: "Your first two reaps each hit twice." },
    { id: "crescent_ring", name: "Crescent Ring", text: "The whirl finisher sends a ring of crescent waves outward." },
    { id: "long_reach", name: "Long Reach", text: "+30% range on every scythe swing." },
  ],
  gauntlets: [
    { id: "shockwave_jabs", name: "Shockwave Jabs", text: "Every jab sends a short shockwave forward." },
    { id: "aftershock", name: "Aftershock", text: "Your slam strikes the ground a second time 0.4 s later." },
    { id: "rising_dragon", name: "Rising Dragon", text: "The uppercut hits twice and launches 50% higher." },
    { id: "iron_wall", name: "Iron Wall", text: "While punching you take 30% less damage." },
    { id: "battering_ram", name: "Battering Ram", text: "Shoulder Charge stuns everything it hits and knocks them twice as far." },
  ],
  glaive: [
    { id: "twin_discs", name: "Twin Discs", text: "Every sweep and lash is followed by a second disc." },
    { id: "razor_ricochet", name: "Razor Ricochet", text: "The Ricochet deals +20% damage with every bounce." },
    { id: "long_chain", name: "Long Chain", text: "+30% reach on every sweep and lash." },
    { id: "spinning_saw", name: "Spinning Saw", text: "The chain-spin finisher keeps spinning for 1 more second, hitting 4 more times." },
    { id: "stunning_lash", name: "Stunning Lash", text: "The lash stuns every enemy it hits for a moment." },
  ],
};

const reach = (d: SlashDef, k: number): SlashDef => ({ ...d, range: d.range * k, fx: { ...d.fx, radius: d.fx.radius * k } });
const longer = (d: SlashDef, k: number, extraHits: number): SlashDef => ({
  ...d,
  dur: d.dur * k,
  cancelAt: d.cancelAt * k,
  span: (d.span ?? 0) * k + (k - 1) * 0.3,
  hits: (d.hits ?? 1) + extraHits,
  spin: (d.spin ?? 0) * k,
  keys: d.keys.map((key, i, all) => (i === all.length - 1 ? { ...key, t: key.t * k } : key)),
});

/** The weapon's moves with the run's anvil upgrades applied. */
export function applyAnvil(w: WeaponDef, owned: Set<string>): WeaponDef {
  if (!owned.size) return w;
  let { combo, dash, special } = w;
  const has = (id: string) => owned.has(id);
  if (w.id === "katana" && has("twin_cyclone")) special = longer(special, 2, special.hits ?? 3);
  if (w.id === "scythes") {
    if (has("thousand_cuts")) combo = combo.map((d, i) => (i < 2 ? { ...d, hits: 2, span: 0.05 } : d));
    if (has("long_reach")) {
      combo = combo.map((d) => reach(d, 1.3));
      dash = reach(dash, 1.3);
      special = reach(special, 1.3);
    }
  }
  if (w.id === "gauntlets") {
    if (has("rising_dragon")) combo = combo.map((d) => (d.id === "uppercut" ? { ...d, hits: 2, span: 0.06, launch: (d.launch ?? 0) * 1.5 } : d));
    if (has("battering_ram")) dash = { ...dash, knock: dash.knock * 2 };
  }
  if (w.id === "glaive") {
    if (has("long_chain")) {
      combo = combo.map((d) => (d.style === "chain" || d.style === "lash" ? reach(d, 1.3) : d));
      dash = reach(dash, 1.3);
    }
    if (has("spinning_saw")) combo = combo.map((d) => (d.id === "chainspin" ? longer(d, 1 + 1 / d.dur, 4) : d));
  }
  return { ...w, combo, dash, special };
}
