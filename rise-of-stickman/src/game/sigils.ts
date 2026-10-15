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
  const key = id.startsWith("lvl:") || id.startsWith("asp:") ? id.slice(4) : id;
  const art = ART[key];
  if (!art) return null;
  return `<svg class="ros-sigil" viewBox="-32 -32 64 64" aria-hidden="true">
<defs><radialGradient id="sgg-${key}"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>
<circle r="31" fill="url(#sgg-${key})"/>
<g class="sg-ring"><circle r="28" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 4"/></g>
<path d="M0 -25 L22 -12.5 L22 12.5 L0 25 L-22 12.5 L-22 -12.5z" fill="rgba(8,3,4,.55)" stroke="currentColor" stroke-opacity=".5" stroke-width="1.4"/>
<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="scale(1.12)">${art}</g></svg>`;
}
