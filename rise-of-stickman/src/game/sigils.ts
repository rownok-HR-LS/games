// Animated emblems for every blessing, cursed relic and move: inline SVG line art drawn in the
// card's colour (CSS `color`), each with its own small looping animation (keyframes in page.css).

const KATANA = `<path d="M-17 17 Q1 3 17 -17"/><path d="M-15 8 L-8 15" stroke-width="3.2"/><path d="M-12 12 L-20 20" stroke-width="3.6"/>`;
const BULLET = `<path d="M-7 -4 h9 q6 0 8 4 q-2 4 -8 4 h-9 z" fill="currentColor" fill-opacity=".25"/><path d="M-4 -4 v8"/>`;
const FLAME = `<path d="M0 0 c-4 -3 -3 -8 0 -12 c1 3 5 5 4 9 c0 2 -2 3 -4 3z" fill="currentColor" fill-opacity=".35"/>`;
const SPARK = `<path d="M0 -4 L1 -1 L4 0 L1 1 L0 4 L-1 1 L-4 0 L-1 -1z" fill="currentColor"/>`;
const CRYSTAL = `<path d="M0 -5 L3 0 L0 5 L-3 0z" fill="currentColor" fill-opacity=".45"/>`;
const BOLT = (d: string) => `<path d="${d}" stroke-width="2.8"/>`;
const STICK = `<circle cx="0" cy="-12" r="3.6"/><path d="M0 -8 L0 3 M0 3 L-5 12 M0 3 L5 12 M0 -5 L-7 -1 M0 -5 L6 1"/>`;
const SNOWFLAKE = `<g><path d="M0 -13 V13 M-11.3 -6.5 L11.3 6.5 M-11.3 6.5 L11.3 -6.5"/><path d="M-3 -10 L0 -7 L3 -10 M-3 10 L0 7 L3 10 M-10.2 -2.4 L-6 -3.5 L-7.3 -7.6 M10.2 2.4 L6 3.5 L7.3 7.6 M-7.3 7.6 L-6 3.5 L-10.2 2.4 M7.3 -7.6 L6 -3.5 L10.2 -2.4"/></g>`;
const DROP = `<path d="M0 -9 q7 8 7 13 a7 7 0 0 1 -14 0 q0 -5 7 -13z" fill="currentColor" fill-opacity=".45"/>`;
const PUFF = `<path d="M-12 4 a5 5 0 0 1 2 -9 a7 7 0 0 1 13 -2 a5 5 0 0 1 8 6 a4 4 0 0 1 -2 5z" fill="currentColor" fill-opacity=".25"/>`;
const SKULL = `<path d="M-8 -2 a8 9 0 1 1 16 0 v5 h-3 v3 h-10 v-3 h-3z" fill="currentColor" fill-opacity=".2"/><circle cx="-3.5" cy="-2" r="2" fill="currentColor"/><circle cx="3.5" cy="-2" r="2" fill="currentColor"/>`;
const HEART = `<path d="M0 10 c-14 -9 -14 -20 -6 -21 c3 0 5 2 6 4 c1 -2 3 -4 6 -4 c8 1 8 12 -6 21z" fill="currentColor" fill-opacity=".3"/>`;
const CHEV = `<path d="M2 -10 L12 0 L2 10 M-8 -10 L2 0 L-8 10"/>`;
const at = (x: number, y: number, s: string, cls = "", style = "", scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})"><g class="${cls}" style="${style}">${s}</g></g>`;

const ART: Record<string, string> = {
  // ── Fire ──
  fire_blade: `${KATANA}${at(-6, 4, FLAME, "sg-flicker")}${at(3, -4, FLAME, "sg-flicker", "animation-delay:-.3s")}${at(11, -12, FLAME, "sg-flicker", "animation-delay:-.6s")}`,
  fire_guns: `<g class="sg-slide">${at(-6, 0, BULLET)}<path d="M-14 -3 h-8 M-15 0 h-11 M-14 3 h-8" stroke-opacity=".6"/></g>${at(19, 0, `<path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2z" fill="currentColor" fill-opacity=".5"/>`, "sg-burst")}`,
  fire_dash: `<g class="sg-slide-s"><path d="M2 -10 L12 0 L2 10 M-8 -10 L2 0 L-8 10"/></g>${at(-14, 10, FLAME, "sg-flicker")}${at(-20, 6, FLAME, "sg-flicker", "animation-delay:-.4s", 0.7)}${at(-8, 14, FLAME, "sg-flicker", "animation-delay:-.2s", 0.6)}`,
  fire_aux: `<circle r="17" stroke-dasharray="4 4" class="sg-spin"/>${at(0, 9, `<path d="M0 0 c-8 -5 -7 -15 0 -22 c2 6 9 9 8 16 c0 4 -4 6 -8 6z" fill="currentColor" fill-opacity=".35"/>`, "sg-flicker")}<path d="M-9 -12 q-4 -6 -2 -12 M9 -12 q4 -6 2 -12" stroke-width="2.2"/>`,
  // ── Ice ──
  ice_blade: `${KATANA}${at(-4, -2, CRYSTAL, "sg-twinkle")}${at(6, -10, CRYSTAL, "sg-twinkle", "animation-delay:-.5s")}${at(12, -2, CRYSTAL, "sg-twinkle", "animation-delay:-1s")}`,
  ice_guns: `<g class="sg-slide"><path d="M-22 0 L0 -4 L8 0 L0 4z" fill="currentColor" fill-opacity=".3"/><path d="M-12 -2 L-6 0 L-12 2" stroke-opacity=".6"/></g>${at(16, 0, `<circle r="6"/>`, "sg-ripple")}`,
  ice_dash: `<g class="sg-slide-s"><path d="M4 -10 L14 0 L4 10 M-6 -10 L4 0 L-6 10"/></g>${at(-16, 0, `<g transform="scale(.55)">${SNOWFLAKE}</g>`, "sg-spin")}`,
  ice_aux: `${at(0, 0, SNOWFLAKE, "sg-spin-slow")}${at(0, 0, `<circle r="18" stroke-opacity=".7"/>`, "sg-ripple")}`,
  // ── Lightning ──
  lightning_blade: `${KATANA}${at(0, 0, BOLT("M-6 -18 L1 -9 L-3 -7 L6 3"), "sg-flash")}${at(10, -6, SPARK, "sg-twinkle", "animation-delay:-.3s")}`,
  lightning_guns: `<g class="sg-slide">${at(-4, 0, BULLET)}</g>${at(0, 0, BOLT("M-24 -8 L-17 -2 L-21 1 L-12 8"), "sg-flash")}${at(18, -8, SPARK, "sg-twinkle")}${at(16, 9, SPARK, "sg-twinkle", "animation-delay:-.4s")}`,
  lightning_dash: `${at(0, 0, `<path d="M-20 4 L-8 -6 L-6 2 L8 -8 L6 0 L18 -10" stroke-width="2.8"/><path d="M12 -12 L18 -10 L16 -4"/>`, "sg-flash-s")}${at(-12, 10, SPARK, "sg-twinkle")}${at(4, 8, SPARK, "sg-twinkle", "animation-delay:-.35s")}${at(14, 4, SPARK, "sg-twinkle", "animation-delay:-.7s")}`,
  lightning_aux: `<path d="M-14 -8 a6 6 0 0 1 4 -10 a8 8 0 0 1 15 -1 a6 6 0 0 1 9 6 a5 5 0 0 1 -3 5z" fill="currentColor" fill-opacity=".18"/>${at(0, 0, BOLT("M0 -7 L-5 3 L1 3 L-4 16"), "sg-strike")}${at(-4, 18, `<path d="M-6 0 h12" stroke-opacity=".6"/>`, "sg-flash")}`,
  // ── Shadow ──
  shadow_blade: `${at(6, -6, `<path d="M4 -14 a14 14 0 1 0 10 18 a10 10 0 1 1 -10 -18z" fill="currentColor" fill-opacity=".3" stroke-opacity=".7"/>`, "sg-pulse")}<path class="sg-sweep" d="M-17 17 Q1 3 17 -17" stroke-dasharray="48" />${KATANA}`,
  shadow_guns: `<path d="M-12 -12 v24 M0 -12 v24 M12 -12 v24" stroke-opacity=".45" stroke-dasharray="3 3"/><g class="sg-pierce">${at(0, 0, BULLET)}</g>`,
  shadow_dash: `${at(6, 2, STICK)}${at(-10, 2, STICK, "sg-clone")}`,
  shadow_aux: `<path d="M-8 -2 a8 9 0 1 1 16 0 v5 h-3 v3 h-10 v-3 h-3z" fill="currentColor" fill-opacity=".2"/><circle cx="-3.5" cy="-2" r="2" fill="currentColor"/><circle cx="3.5" cy="-2" r="2" fill="currentColor"/><g class="sg-orbit"><circle cx="0" cy="-19" r="2.6" fill="currentColor"/><circle cx="16" cy="10" r="2" fill="currentColor"/><circle cx="-16" cy="10" r="2.2" fill="currentColor"/></g>`,
  // ── Blood ──
  blood_blade: `${KATANA}${at(-6, 6, DROP, "sg-drip")}${at(6, -4, DROP, "sg-drip", "animation-delay:-.6s")}`,
  blood_guns: `<g class="sg-slide">${at(-6, 0, BULLET)}</g>${at(16, 0, `<g transform="scale(.55)">${HEART}</g>`, "sg-pulse")}`,
  blood_dash: `<g class="sg-slide-s">${CHEV}</g>${at(-14, 6, DROP, "sg-drip")}${at(-20, -4, DROP, "sg-drip", "animation-delay:-.5s")}`,
  blood_aux: `${at(0, 2, `${HEART}<path d="M-2 -8 l3 6 l-3 4 l2 6" stroke-width="1.8"/>`, "sg-pulse")}`,
  // ── Plague ──
  plague_blade: `${KATANA}${at(-6, 4, `<circle r="2.4" fill="currentColor"/>`, "sg-twinkle")}${at(4, -6, `<circle r="1.8" fill="currentColor"/>`, "sg-twinkle", "animation-delay:-.5s")}${at(11, -12, `<circle r="2.2" fill="currentColor"/>`, "sg-twinkle", "animation-delay:-1s")}`,
  plague_guns: `<g class="sg-slide">${at(-6, 0, BULLET)}</g>${at(16, 2, `<g transform="scale(.7)">${PUFF}</g>`, "sg-ripple")}`,
  plague_dash: `<g class="sg-slide-s">${CHEV}</g>${at(-16, 6, `<g transform="scale(.6)">${PUFF}</g>`, "sg-pulse")}${at(-20, -6, `<g transform="scale(.45)">${PUFF}</g>`, "sg-pulse", "animation-delay:-1s")}`,
  plague_aux: `${SKULL}<g class="sg-orbit">${at(0, -18, `<g transform="scale(.5)">${PUFF}</g>`)}${at(15, 10, `<g transform="scale(.4)">${PUFF}</g>`)}${at(-15, 10, `<g transform="scale(.45)">${PUFF}</g>`)}</g>`,
  // ── Duos ──
  thermal_shock: `${at(-6, 0, `<g transform="scale(.7)">${SNOWFLAKE}</g>`, "sg-spin-slow")}${at(9, 8, FLAME, "sg-flicker")}${at(0, 0, `<path d="M0 -10 L2 -3 L9 0 L2 3 L0 10 L-2 3 L-9 0 L-2 -3z" fill="currentColor" fill-opacity=".5"/>`, "sg-burst")}`,
  wildfire_storm: `${BOLT("M-4 -18 L4 -6 L-2 -4 L6 8")}${at(-10, 14, FLAME, "sg-flicker")}${at(8, 14, FLAME, "sg-flicker", "animation-delay:-.4s")}`,
  black_flame: `${at(0, 8, `<path d="M0 0 c-8 -5 -7 -15 0 -22 c2 6 9 9 8 16 c0 4 -4 6 -8 6z" fill="currentColor" fill-opacity=".45"/>`, "sg-flicker")}<path d="M-14 -4 q14 -12 28 0 q-14 12 -28 0z" stroke-opacity=".8"/><circle r="2.6" cy="-4" fill="currentColor"/>`,
  boiling_blood: `${at(0, 4, `<g transform="scale(1.4)">${DROP}</g>`)}${at(-3, -2, `<circle r="1.8"/>`, "sg-drip", "animation-direction:reverse")}${at(3, 2, `<circle r="1.4"/>`, "sg-drip", "animation-direction:reverse;animation-delay:-.6s")}${at(0, 14, FLAME, "sg-flicker")}`,
  pyre_of_rot: `${PUFF}${at(0, 6, FLAME, "sg-flicker")}${at(-10, 8, `<g transform="scale(.6)">${FLAME}</g>`, "sg-flicker", "animation-delay:-.3s")}`,
  superconductor: `${at(-14, 0, CRYSTAL, "sg-twinkle")}${at(14, 0, CRYSTAL, "sg-twinkle", "animation-delay:-.7s")}${at(0, 0, BOLT("M-10 0 L-4 -5 L0 3 L5 -4 L10 0"), "sg-flash")}`,
  frozen_shade: `${at(4, 2, STICK, "sg-clone")}${at(-10, -10, `<g transform="scale(.55)">${SNOWFLAKE}</g>`, "sg-spin")}`,
  frostbitten_veins: `${at(0, -2, `<g transform="scale(2)">${CRYSTAL}</g>`, "sg-twinkle")}${at(-6, 12, DROP, "sg-drip")}${at(6, 12, DROP, "sg-drip", "animation-delay:-.7s")}`,
  cold_rot: `${at(0, 4, PUFF, "sg-pulse")}${at(0, -10, `<g transform="scale(.6)">${SNOWFLAKE}</g>`, "sg-spin-slow")}`,
  dark_thunder: `${at(-6, -6, `<path d="M4 -10 a10 10 0 1 0 8 14 a7 7 0 1 1 -8 -14z" fill="currentColor" fill-opacity=".35"/>`, "sg-pulse")}${at(4, 0, BOLT("M2 -10 L-4 2 L2 2 L-3 16"), "sg-strike")}`,
  arterial_arc: `${BOLT("M-16 -10 L-6 0 L-10 3 L4 12")}${at(8, -8, DROP, "sg-drip")}${at(14, 2, DROP, "sg-drip", "animation-delay:-.5s")}`,
  contagion_arc: `${BOLT("M-16 -6 L-6 4 L-10 6 L6 14")}${at(-14, -12, `<circle r="2.4" fill="currentColor"/>`, "sg-twinkle")}${at(10, 8, `<circle r="2.4" fill="currentColor"/>`, "sg-twinkle", "animation-delay:-.4s")}${at(14, -6, `<circle r="2.4" fill="currentColor"/>`, "sg-twinkle", "animation-delay:-.8s")}`,
  night_feast: `<path d="M-6 -16 a16 16 0 1 0 16 22 a12 12 0 1 1 -16 -22z" fill="currentColor" fill-opacity=".25"/>${at(4, 2, DROP, "sg-drip")}<path d="M-4 -2 l2 6 l2 -6" stroke-width="1.8"/>`,
  creeping_doom: `${at(-4, 0, STICK, "sg-clone")}${at(8, 10, `<g transform="scale(.7)">${PUFF}</g>`, "sg-ripple")}`,
  black_death: `${at(0, -4, SKULL)}${at(-10, 12, DROP, "sg-drip")}${at(10, 12, `<circle r="2.4" fill="currentColor"/>`, "sg-twinkle")}`,
  // ── Legendaries ──
  inferno_crown: `${at(0, 6, `<path d="M-15 8 L-15 -6 L-8 2 L0 -10 L8 2 L15 -6 L15 8z" fill="currentColor" fill-opacity=".25"/>`)}${at(-8, -2, FLAME, "sg-flicker")}${at(0, -8, FLAME, "sg-flicker", "animation-delay:-.3s")}${at(8, -2, FLAME, "sg-flicker", "animation-delay:-.6s")}`,
  absolute_zero: `${at(0, 0, SNOWFLAKE, "sg-spin-slow")}${at(0, 0, `<circle r="20" stroke-opacity=".6"/>`, "sg-pulse")}`,
  judgement_bolt: `<path d="M-14 -12 a6 6 0 0 1 4 -10 a8 8 0 0 1 15 -1 a6 6 0 0 1 9 6 a5 5 0 0 1 -3 5z" fill="currentColor" fill-opacity=".2"/>${at(0, 0, BOLT("M1 -8 L-5 3 L1 3 L-4 18"), "sg-strike")}${at(-4, 19, `<ellipse rx="9" ry="2.5"/>`, "sg-ripple")}`,
  eclipse: `<circle r="15" fill="currentColor" fill-opacity=".25"/>${at(5, -3, `<circle r="13" fill="rgba(8,3,4,.95)" stroke-opacity=".7"/>`, "sg-bob")}<circle r="19" stroke-dasharray="2 4" stroke-opacity=".6"/>`,
  undying_thirst: `${at(0, 4, HEART, "sg-pulse")}${at(0, -14, `<ellipse rx="10" ry="3"/>`, "sg-bob")}`,
  pandemic: `${at(0, 2, PUFF, "sg-pulse")}${at(0, 0, `<circle r="12" stroke-opacity=".6"/>`, "sg-ripple")}${at(0, 0, `<circle r="12" stroke-opacity=".6"/>`, "sg-ripple", "animation-delay:-.9s")}`,
  // ── Soul Anvil ──
  moon_wave: `${at(-4, 4, `<path d="M-10 10 a14 14 0 0 1 20 -20 a10 10 0 0 0 -20 20z" fill="currentColor" fill-opacity=".4"/>`, "sg-slide")}${at(12, -10, `<circle r="5" fill="currentColor" fill-opacity=".3"/>`, "sg-pulse")}`,
  quickdraw: `${KATANA}${at(10, 10, `<g transform="scale(.6)">${BULLET}</g>`, "sg-slide")}${at(-12, -8, `<g transform="scale(.6)">${BULLET}</g>`, "sg-slide", "animation-delay:-.6s")}`,
  twin_cyclone: `<g class="sg-spin-fast"><path d="M0 -16 a16 16 0 0 1 16 16" stroke-width="2.8"/><path d="M0 16 a16 16 0 0 1 -16 -16" stroke-width="2.8"/></g><g class="sg-spin"><path d="M0 -9 a9 9 0 0 1 9 9"/><path d="M0 9 a9 9 0 0 1 -9 -9"/></g>`,
  rift_walker: `${KATANA}${at(0, 0, `<path d="M-20 6 L20 -6" stroke-dasharray="3 3" stroke-width="2.6"/>`, "sg-flash")}`,
  first_blood: `${KATANA}${at(12, 10, `<path d="M0 -7 q5 6 5 9 a5 5 0 0 1 -10 0 q0 -3 5 -9z" fill="currentColor"/>`, "sg-drip")}<path d="M-14 -16 h8 M-10 -20 v8" stroke-width="2"/>`,
  reapers_toss: `<g class="sg-spin"><path d="M-2 -14 q12 2 12 14 q-5 -8 -12 -8z" fill="currentColor" fill-opacity=".35"/><path d="M2 14 q-12 -2 -12 -14 q5 8 12 8z" fill="currentColor" fill-opacity=".35"/></g><path d="M-20 18 q20 -10 40 0" stroke-dasharray="3 3" stroke-opacity=".6"/>`,
  blade_orbit: `${at(0, 2, STICK)}<g class="sg-orbit"><path d="M-18 0 q-4 -6 2 -9" stroke-width="2.6"/><path d="M18 0 q4 6 -2 9" stroke-width="2.6"/></g>`,
  thousand_cuts: `<path d="M-16 -10 L10 14 M-10 -16 L16 8" stroke-width="2.4"/>${at(0, 0, `<path d="M-16 6 L6 -16 M-10 12 L12 -10" stroke-width="2.4"/>`, "sg-flash")}`,
  crescent_ring: `<circle r="5" fill="currentColor" fill-opacity=".4"/>${[0, 1, 2, 3, 4, 5].map((i) => at(Math.cos((i * Math.PI) / 3) * 15, Math.sin((i * Math.PI) / 3) * 15, `<path d="M-4 -4 a6 6 0 0 1 0 8" stroke-width="2.4"/>`, "sg-pulse", `animation-delay:-${i * 0.25}s`)).join("")}`,
  long_reach: `<path d="M-20 18 L14 -16" stroke-width="2.4"/><path d="M14 -16 q12 2 8 14 q-3 -9 -8 -14z" fill="currentColor" fill-opacity=".35"/>${at(-6, 6, `<path d="M-6 0 h12 M2 -4 l4 4 l-4 4"/>`, "sg-slide-s")}`,
  shockwave_jabs: `${at(-8, 0, `<path d="M-7 -6 h12 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-12 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3z" fill="currentColor" fill-opacity=".25"/>`)}${at(10, 0, `<path d="M0 -10 a10 10 0 0 1 0 20" stroke-width="2.4"/>`, "sg-ripple")}`,
  aftershock: `<path d="M-20 10 h40" stroke-opacity=".5"/>${at(0, 10, `<path d="M-6 0 L-12 -8 M6 0 L12 -8 M0 0 V-10"/>`, "sg-burst")}${at(0, 10, `<path d="M-6 0 L-12 -8 M6 0 L12 -8 M0 0 V-10"/>`, "sg-burst", "animation-delay:-.5s")}`,
  rising_dragon: `${at(0, 0, `<path d="M-4 16 q-8 -14 4 -24 q10 -8 6 -16 q8 8 0 18 q-8 8 -2 22z" fill="currentColor" fill-opacity=".35"/>`, "sg-bob")}`,
  iron_wall: `<path d="M-14 -16 h28 v14 q0 14 -14 20 q-14 -6 -14 -20z" fill="currentColor" fill-opacity=".2"/>${at(0, 0, `<path d="M-6 -4 h12 v8 h-12z" fill="currentColor" fill-opacity=".5"/>`, "sg-pulse")}`,
  battering_ram: `${at(-4, 0, `<path d="M-12 -8 h16 l8 8 l-8 8 h-16z" fill="currentColor" fill-opacity=".3"/>`, "sg-slide-s")}${at(16, -8, SPARK, "sg-twinkle")}${at(16, 8, SPARK, "sg-twinkle", "animation-delay:-.5s")}`,
  twin_discs: `${at(-6, 0, `<circle r="8"/><circle r="2.5" fill="currentColor"/>`, "sg-spin")}${at(8, 4, `<circle r="8" stroke-opacity=".6"/><circle r="2.5" fill="currentColor"/>`, "sg-spin", "animation-delay:-.4s")}`,
  razor_ricochet: `<path d="M-20 12 L-6 -6 L6 8 L20 -10" stroke-dasharray="3 3"/>${at(-6, -6, `<circle r="4"/>`, "sg-pulse")}${at(6, 8, `<circle r="5.5"/>`, "sg-pulse", "animation-delay:-.4s")}${at(20, -10, `<circle r="7" fill="currentColor" fill-opacity=".3"/>`, "sg-pulse", "animation-delay:-.8s")}`,
  long_chain: `<path d="M-20 16 L12 -12" stroke-dasharray="3 2.5" stroke-width="2.6"/>${at(14, -14, `<circle r="6"/><circle r="2" fill="currentColor"/>`, "sg-spin")}`,
  spinning_saw: `<g class="sg-spin-fast"><circle r="11"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${Math.cos((i * Math.PI) / 4) * 11} ${Math.sin((i * Math.PI) / 4) * 11} l${Math.cos((i * Math.PI) / 4 + 0.6) * 5} ${Math.sin((i * Math.PI) / 4 + 0.6) * 5}"/>`).join("")}</g>`,
  stunning_lash: `<path d="M-20 14 q14 -4 30 -22" stroke-dasharray="3 2.5" stroke-width="2.6"/>${at(12, -10, `<circle r="5"/>`)}${at(0, -16, SPARK, "sg-twinkle")}${at(8, -20, SPARK, "sg-twinkle", "animation-delay:-.4s")}${at(18, -16, SPARK, "sg-twinkle", "animation-delay:-.8s")}`,
  // ── Cursed relics ──
  pact: `<path d="M-11 -14 h22 q0 14 -11 16 q-11 -2 -11 -16z M0 2 v10 M-7 14 h14"/>${at(0, -6, `<path d="M0 0 q-3 4 0 6 q3 -2 0 -6z" fill="currentColor"/>`, "sg-drip")}`,
  halo: `<g class="sg-bob"><ellipse rx="15" ry="5" cy="-6"/><path d="M-3 -11 l2 4 l-2 3" stroke-width="1.8"/></g>${at(0, 10, `<path d="M-6 0 h12" stroke-opacity=".5"/>`, "sg-pulse")}`,
  hook: `<g class="sg-swing"><path d="M0 -22 V4 a8 8 0 1 1 -10 -6"/><path d="M-10 -2 l-3 -4" /></g>`,
  hourglass: `<g class="sg-flip"><path d="M-10 -15 h20 M-10 15 h20 M-8 -15 q0 10 8 15 q8 -5 8 -15 M-8 15 q0 -10 8 -15 q8 5 8 15"/><path d="M-4 11 h8 l-4 -4z" fill="currentColor"/></g>`,
  eye: `<path d="M-18 0 q18 -16 36 0 q-18 16 -36 0z"/><g class="sg-blink"><circle r="6" fill="currentColor" fill-opacity=".3"/><path d="M0 -6 q2 6 0 12 q-2 -6 0 -12z" fill="currentColor"/></g>`,
  crown: `<g class="sg-pulse"><path d="M-15 8 L-15 -8 L-8 0 L0 -12 L8 0 L15 -8 L15 8z" fill="currentColor" fill-opacity=".2"/><path d="M2 -9 L-1 -2 L3 2 L0 8" stroke-width="1.8"/></g>`,
  // ── Moves ──
  splitter: `${at(0, -4, `<path d="M0 -18 V6 M-6 -2 h12" stroke-width="2.8"/>`, "sg-chop")}<path d="M-20 12 h40" stroke-opacity=".5"/>${at(0, 12, `<path d="M-4 0 L-10 6 M4 0 L10 6 M0 0 L0 7"/>`, "sg-burst")}`,
  barrage: `<g class="sg-spin-fast"><path d="M-12 -3 h18 v6 h-10 l-2 6 h-5 l1 -6 h-2z" fill="currentColor" fill-opacity=".25"/><circle cx="-3" cy="0" r="3"/></g>`,
  phantom: `${at(-12, 2, STICK, "sg-clone", "animation-delay:-.6s")}${at(-2, 2, STICK, "sg-clone", "animation-delay:-.3s")}${at(10, 2, STICK)}`,
  // ── Weapon aspects ──
  horseman: `${KATANA}${at(-12, -12, `<path d="M-5 4 v-5 a5 5 0 0 1 10 0 v5" stroke-width="2.6"/>`, "sg-pulse")}`,
  ronin: `${at(0, 0, `<path d="M-12 -14 L0 -21 L12 -14z" fill="currentColor" fill-opacity=".3"/>`)}${at(0, 4, `<path d="M-17 13 Q1 -1 17 -19" stroke-dasharray="3 4" stroke-opacity=".5"/>`, "sg-slide-s")}${KATANA}`,
  butcher: `${at(0, -2, `<path d="M-14 -10 h20 v12 h-20z" fill="currentColor" fill-opacity=".3"/><path d="M6 -4 h10" stroke-width="3.4"/><circle cx="-9" cy="-5" r="1.6" fill="currentColor"/>`, "sg-chop")}<path d="M-20 14 h40" stroke-opacity=".45"/>`,
  reaper: `<g class="sg-spin-slow"><path d="M-2 -18 q16 2 16 18 q-6 -10 -16 -10z" fill="currentColor" fill-opacity=".3"/><path d="M2 18 q-16 -2 -16 -18 q6 10 16 10z" fill="currentColor" fill-opacity=".3"/></g><path d="M-14 14 L14 -14"/>`,
  harvest: `<path d="M-12 14 h24" stroke-opacity=".5"/>${at(-8, 8, `<circle r="2.6" fill="currentColor"/>`, "sg-drip", "animation-direction:reverse")}${at(0, 8, `<circle r="2.6" fill="currentColor"/>`, "sg-drip", "animation-direction:reverse;animation-delay:-.5s")}${at(8, 8, `<circle r="2.6" fill="currentColor"/>`, "sg-drip", "animation-direction:reverse;animation-delay:-1s")}<path d="M-14 -8 q14 -14 28 0" stroke-width="2.6"/>`,
  grave: `<g class="sg-spin"><path d="M0 0 m0 -3 a3 3 0 1 1 -3 3 a6 6 0 0 1 6 -6 a9 9 0 0 1 9 9 a12 12 0 0 1 -12 12 a15 15 0 0 1 -15 -15"/></g>`,
  brawler: `${at(0, 0, `<path d="M-7 -6 h12 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-12 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3z" fill="currentColor" fill-opacity=".25"/><path d="M-4 -6 v5 M0 -6 v5 M4 -6 v5 M-10 1 h-4 v-6"/>`, "sg-slide-s")}`,
  titan: `${at(-3, 0, `<path d="M-7 -6 h12 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-12 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3z" fill="currentColor" fill-opacity=".25"/><path d="M-4 -6 v5 M0 -6 v5 M4 -6 v5 M-10 1 h-4 v-6"/>`)}${at(14, 0, `<path d="M0 -10 l4 6 M0 10 l4 -6 M2 0 h8" stroke-width="2.4"/>`, "sg-burst")}`,
  phoenix: `${at(0, 6, `<path d="M0 0 q-14 -4 -18 -18 q8 8 14 6 q-2 -8 4 -12 q6 4 4 12 q6 2 14 -6 q-4 14 -18 18z" fill="currentColor" fill-opacity=".35"/>`, "sg-flicker")}`,
  warden: `<g class="sg-spin"><circle r="10"/><path d="M0 -14 l3 4 h-6z M14 0 l-4 3 v-6z M0 14 l-3 -4 h6z M-14 0 l4 -3 v6z" fill="currentColor"/></g><path d="M-22 18 l8 -8" stroke-dasharray="2 3"/>`,
  hunter: `<circle r="12"/><path d="M0 -18 v8 M0 10 v8 M-18 0 h8 M10 0 h8"/>${at(0, 0, `<circle r="3" fill="currentColor"/>`, "sg-pulse")}`,
  serpent: `<g class="sg-bob"><path d="M-16 12 q-4 -10 6 -10 q10 0 10 -8 q0 -8 10 -6" stroke-dasharray="3 2.5" stroke-width="2.6"/><circle cx="12" cy="-12" r="3.4" fill="currentColor"/></g>`,
  executioner: `<path d="M-8 6 a8 9 0 1 1 16 0 v4 h-16z" fill="currentColor" fill-opacity=".2" stroke-opacity=".7"/>${at(4, -8, `<path d="M0 -12 V12" stroke-width="2.8"/><path d="M0 -12 q12 2 10 12 q-6 -3 -10 -2z" fill="currentColor" fill-opacity=".35"/>`, "sg-axe")}`,
};

/** Inline SVG emblem for a blessing / relic / move id (also "lvl:<id>"), or null if there is none. */
export function sigilSvg(id: string): string | null {
  const key = id.startsWith("lvl:") || id.startsWith("asp:") || id.startsWith("anv:") ? id.slice(4) : id;
  const art = ART[key];
  if (!art) return null;
  return `<svg class="ros-sigil" viewBox="-32 -32 64 64" aria-hidden="true">
<defs><radialGradient id="sgg-${key}"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>
<circle r="31" fill="url(#sgg-${key})"/>
<g class="sg-ring"><circle r="28" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 4"/></g>
<path d="M0 -25 L22 -12.5 L22 12.5 L0 25 L-22 12.5 L-22 -12.5z" fill="rgba(8,3,4,.55)" stroke="currentColor" stroke-opacity=".5" stroke-width="1.4"/>
<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="scale(1.12)">${art}</g></svg>`;
}
