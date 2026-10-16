// Meta progression bought in the Forsaken Stable: the Altar of Scars (eight slots, each with two
// swappable sides paid in Embers), keepsakes (gifts for Grave Wine, one worn per run) and the Hollow
// Seer's prophecies (goals that pay out once claimed).
import { ELEMENTS, type Element } from "./boons";
import { LORDS } from "./lords";
import type { SaveData } from "./save";
import type { WeaponId } from "./weapons";

// ── Altar of Scars ──────────────────────────────────────────────────────────────────────
export type AltarSide = { id: string; name: string; text: (rank: number) => string; costs: number[] };
export type AltarSlot = { id: string; a: AltarSide; b: AltarSide };

const pct = (n: number) => `${Math.round(n)}%`;

export const ALTAR: AltarSlot[] = [
  {
    id: "defiance",
    a: { id: "defiance", name: "Defiance", costs: [20, 50], text: (r) => `+${Math.max(1, r)} Death Defiance${Math.max(1, r) > 1 ? "s" : ""} each run (up to 3 in all).` },
    b: { id: "stubborn", name: "Stubborn Scar", costs: [35], text: () => "Heal 40% of your health after you slay each boss or mini-boss." },
  },
  {
    id: "hide",
    a: { id: "hide", name: "Thick Hide", costs: [5, 8, 10, 12, 15], text: (r) => `+${5 * Math.max(1, r)} max health.` },
    b: { id: "blood_debt", name: "Blood Debt", costs: [20], text: () => "Heal 2 health every time you clear a chamber." },
  },
  {
    id: "strength",
    a: { id: "strength", name: "Fallen Strength", costs: [8, 10, 12, 15, 20], text: (r) => `+${4 * Math.max(1, r)}% damage with everything.` },
    b: { id: "exec", name: "Executioner", costs: [30], text: () => "+15% damage to enemies below 30% health." },
  },
  {
    id: "stride",
    a: { id: "stride", name: "Shadow Stride", costs: [40], text: () => "+1 dash charge." },
    b: { id: "ghost", name: "Ghost Step", costs: [25], text: () => "Your perfect-dodge window is twice as long." },
  },
  {
    id: "pockets",
    a: { id: "pockets", name: "Deep Pockets", costs: [5, 8, 10, 12], text: (r) => `Start each run with ${25 * Math.max(1, r)} Bone Coins.` },
    b: { id: "haggler", name: "Haggler", costs: [10, 15, 20], text: (r) => `The Bone Merchant charges ${pct(10 * Math.max(1, r))} less.` },
  },
  {
    id: "favour",
    a: { id: "favour", name: "Lord's Favour", costs: [8, 10, 12, 15], text: (r) => `+${5 * Math.max(1, r)}% chance for Rare blessings.` },
    b: { id: "ember_heart", name: "Ember Heart", costs: [30], text: () => "The first blessing you take each run starts at Lv 2." },
  },
  {
    id: "kindle",
    a: { id: "kindle", name: "Wrath Kindle", costs: [8, 12, 16], text: (r) => `Wrath fills ${10 * Math.max(1, r)}% faster.` },
    b: { id: "burning", name: "Burning Start", costs: [25], text: () => "Begin each floor with your Wrath bar half full." },
  },
  {
    id: "chance",
    a: { id: "chance", name: "Second Chance", costs: [15, 25, 35], text: (r) => `${Math.max(1, r)} reroll${Math.max(1, r) > 1 ? "s" : ""} each run, for reward cards or the doors.` },
    b: { id: "harvest", name: "Soul Harvest", costs: [10, 15, 20], text: (r) => `+${10 * Math.max(1, r)}% souls from kills.` },
  },
];

/** What the Altar (and the worn keepsake) do this run. */
export type Meta = {
  defiance: number;
  stubborn: boolean;
  hp: number;
  bloodDebt: number;
  dmg: number;
  exec: boolean;
  dash: number;
  ghost: boolean;
  coins: number;
  haggle: number;
  favour: number;
  emberHeart: boolean;
  wrath: number;
  burning: boolean;
  rerolls: number;
  souls: number;
  keepsake: string | null;
  /** Keepsake: Lord whose blessing comes first. */
  sigil: Element | null;
};

export function altarRanks(s: SaveData, slot: string): [number, number] {
  return s.altar[slot] ?? [0, 0];
}

/** Ranks that count: only the active side of each slot. */
function active(s: SaveData, slot: string, side: 0 | 1) {
  return (s.altarSide[slot] ?? 0) === side ? altarRanks(s, slot)[side] : 0;
}

export function metaOf(s: SaveData): Meta {
  const k = s.keepsake && s.keepsakes.includes(s.keepsake) ? s.keepsake : null;
  const sigil = k?.startsWith("sigil_") ? (k.slice(6) as Element) : null;
  return {
    defiance: active(s, "defiance", 0),
    stubborn: active(s, "defiance", 1) > 0,
    hp: 5 * active(s, "hide", 0) + (k === "ash_horseshoe" ? 15 : 0),
    bloodDebt: active(s, "hide", 1) > 0 ? 2 : 0,
    dmg: 1 + 0.04 * active(s, "strength", 0),
    exec: active(s, "strength", 1) > 0,
    dash: active(s, "stride", 0),
    ghost: active(s, "stride", 1) > 0,
    coins: 25 * active(s, "pockets", 0) + (k === "gold_tooth" ? 40 : 0),
    haggle: 1 - 0.1 * active(s, "pockets", 1),
    favour: 0.05 * active(s, "favour", 0),
    emberHeart: active(s, "favour", 1) > 0,
    wrath: 1 + 0.1 * active(s, "kindle", 0),
    burning: active(s, "kindle", 1) > 0,
    rerolls: active(s, "chance", 0),
    souls: 1 + 0.1 * active(s, "chance", 1),
    keepsake: k,
    sigil: sigil && ELEMENTS.includes(sigil) ? sigil : null,
  };
}

// ── Keepsakes ───────────────────────────────────────────────────────────────────────────
export type Keepsake = { id: string; name: string; from: string; text: string; color: string };

const SIGIL_NAME: Record<Element, string> = { fire: "Ember", ice: "Frost", lightning: "Storm", shadow: "Eclipse", blood: "Blood", plague: "Plague" };
const SIGIL_COLOR: Record<Element, string> = { fire: "#ff6a1a", ice: "#7fe3ff", lightning: "#ffe14a", shadow: "#b06bff", blood: "#ff2a46", plague: "#9be05a" };

export const KEEPSAKES: Keepsake[] = [
  { id: "anvil_shard", name: "Anvil Shard", from: "krag", text: "+25% damage to shielded and elite enemies.", color: "#ff9a4a" },
  { id: "blind_eye", name: "Blind Eye", from: "seer", text: "The first blessing of each run is Rare or better.", color: "#c9b6ff" },
  { id: "ash_horseshoe", name: "Ash Horseshoe", from: "steed", text: "+15 max health.", color: "#7fd8ff" },
  { id: "gold_tooth", name: "Gold Tooth", from: "merchant", text: "Start each run with +40 Bone Coins.", color: "#ffd24a" },
  ...ELEMENTS.map((el) => ({
    id: `sigil_${el}`,
    name: `${SIGIL_NAME[el]} Sigil`,
    from: `lord_${el}`,
    text: `The first blessing of each run comes from ${LORDS[el].name}.`,
    color: SIGIL_COLOR[el],
  })),
];

export const keepsakeOf = (id: string | null) => KEEPSAKES.find((k) => k.id === id) ?? null;
export const keepsakeFrom = (giver: string) => KEEPSAKES.find((k) => k.from === giver)!;

// ── Prophecies ──────────────────────────────────────────────────────────────────────────
export type Payout = { embers?: number; souls?: number; wine?: number };
export type Prophecy = { id: string; name: string; hint: string; reward: Payout; goal: number; progress: (s: SaveData) => number };

const flag = (f: string) => (s: SaveData) => (s.flags.includes(f) ? 1 : 0);
const count = (c: string) => (s: SaveData) => s.counts[c] ?? 0;
const WEAPON_NAME: Record<WeaponId, string> = { katana: "Katana", scythes: "Twin Scythes", gauntlets: "Iron Gauntlets", glaive: "Chain Glaive" };

export const PROPHECIES: Prophecy[] = [
  { id: "butcher", name: "Slay the Pit Butcher", hint: "The butcher's cleaver falls. Then he does.", reward: { embers: 10 }, goal: 1, progress: flag("butcher") },
  { id: "cerberus", name: "Slay the Chained Cerberus", hint: "Three heads, one collar, no master left to hold it.", reward: { embers: 20 }, goal: 1, progress: flag("cerberus") },
  ...(["katana", "scythes", "gauntlets", "glaive"] as WeaponId[]).map((w) => ({
    id: `cerb_${w}`,
    name: `Slay Cerberus with the ${WEAPON_NAME[w]}`,
    hint: "Every blade must learn the taste of the hound.",
    reward: { embers: 15 },
    goal: 1,
    progress: flag(`cerb:${w}`),
  })),
  { id: "lords", name: "Meet all six Fallen Lords", hint: "Six thrones in the dark. Six voices that will want you.", reward: { souls: 100, wine: 1 }, goal: 6, progress: (s) => s.lordsMet.length },
  { id: "duo", name: "Take a Duo blessing", hint: "Two Lords who hate each other, agreeing on you.", reward: { embers: 15 }, goal: 1, progress: flag("duo") },
  { id: "legend", name: "Take a Legendary blessing", hint: "A Lord's whole heart, given once.", reward: { embers: 20 }, goal: 1, progress: flag("legend") },
  { id: "sss", name: "Reach SSS style rank", hint: "Dance so well the pit forgets to kill you.", reward: { embers: 10 }, goal: 1, progress: flag("sss") },
  { id: "void", name: "Knock 25 enemies into the void", hint: "The abyss is hungry. Feed it.", reward: { souls: 100 }, goal: 25, progress: count("void") },
  { id: "parry", name: "Perfect-parry 50 attacks", hint: "Fifty blows turned aside, each one a heartbeat early.", reward: { souls: 100 }, goal: 50, progress: count("parry") },
  { id: "aspect", name: "Buy an Aspect", hint: "Krag's old steel remembers other shapes.", reward: { wine: 1 }, goal: 1, progress: flag("aspect") },
  { id: "anvil", name: "Use a Soul Anvil", hint: "A weapon reforged in the middle of the pit.", reward: { embers: 10 }, goal: 1, progress: flag("anvil") },
  { id: "flawless", name: "Win a run without Death Defiance", hint: "Climb out without once being pulled back.", reward: { embers: 30 }, goal: 1, progress: flag("flawless") },
  { id: "die10", name: "Die 10 times", hint: "It was always going to happen.", reward: { wine: 1 }, goal: 10, progress: (s) => s.deaths },
];

export function prophecyDone(s: SaveData, p: Prophecy) {
  return p.progress(s) >= p.goal;
}

export function payoutText(r: Payout) {
  const out: string[] = [];
  if (r.embers) out.push(`${r.embers} Embers`);
  if (r.souls) out.push(`${r.souls} souls`);
  if (r.wine) out.push(`${r.wine} Grave Wine`);
  return out.join(" + ");
}
