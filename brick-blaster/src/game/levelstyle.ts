// One look per level: the backdrop colours and the brick palette are designed together, so
// the bricks always belong to the scene behind them. Index = level (same order as the
// levels, their brick materials in brickskins.ts and their tracks in music.ts).
// Colours written "r,g,b" are used with varying alpha.

export type LevelStyle = {
  sky: [string, string, string, string, string]; // top → horizon
  moon: [string, string, string]; // highlight, body, edge
  halo: string; // r,g,b
  crater: string; // r,g,b
  smoke: [string, string]; // r,g,b
  far: string; // spires silhouette
  rim: string; // r,g,b rim light on the spires
  window: string; // r,g,b lit windows
  near: string; // foreground crags
  crack: string; // r,g,b ground cracks
  sigil: string; // rune circle
  glow: string; // r,g,b glow rising from below
  embers: [string, string, string]; // big, mid, small
  /** Brick colours for the level layout letters (r o y g c b p w). */
  palette: Record<string, string>;
};

export const LEVEL_STYLES: LevelStyle[] = [
  // 1 · Hellfire Overture — lava inferno; bricks are heat bands.
  {
    sky: ["#050206", "#1a0508", "#3d0a0b", "#6e1a0c", "#a23410"],
    moon: ["#ff7a55", "#d0251a", "#6d0a0c"],
    halo: "255,50,30",
    crater: "60,0,0",
    smoke: ["20,4,6", "70,12,10"],
    far: "#1b0609",
    rim: "255,70,40",
    window: "255,150,40",
    near: "#070203",
    crack: "255,110,30",
    sigil: "#ff3b1f",
    glow: "255,90,20",
    embers: ["#ffd27a", "#ff9a3c", "#ff5a1f"],
    palette: { r: "#ff2a1a", o: "#ff4a1c", y: "#ff6f22", g: "#ff9230", c: "#ffb347", b: "#ffd27a", p: "#ff5a3a", w: "#ffe9b0" },
  },
  // 2 · Cathedral of Ash — violet dusk behind a cathedral, gold moon; jewel-tone glass.
  {
    sky: ["#04030a", "#120a26", "#26123a", "#4a1e3c", "#8a4a2a"],
    moon: ["#fff1c4", "#e0b050", "#7a4a12"],
    halo: "255,210,120",
    crater: "120,80,20",
    smoke: ["16,8,30", "50,24,60"],
    far: "#120a1c",
    rim: "255,200,120",
    window: "255,200,90",
    near: "#06040a",
    crack: "255,170,70",
    sigil: "#ffc85a",
    glow: "255,160,70",
    embers: ["#fff0c0", "#ffc860", "#ff9a40"],
    palette: { r: "#b81c34", o: "#c2561c", y: "#d6a426", g: "#1f7a52", c: "#1f7f92", b: "#2a4ab0", p: "#6a2aa8", w: "#d9d2c4" },
  },
  // 3 · Requiem Engine — foggy green catacomb; bone and ivory.
  {
    sky: ["#030504", "#0a1410", "#142218", "#22341f", "#3e5228"],
    moon: ["#f0ffe8", "#b8d8a8", "#4a6a3a"],
    halo: "170,255,190",
    crater: "60,90,50",
    smoke: ["10,20,14", "40,60,40"],
    far: "#0c140e",
    rim: "150,255,180",
    window: "150,255,170",
    near: "#030604",
    crack: "120,240,150",
    sigil: "#7affa8",
    glow: "110,230,140",
    embers: ["#e0ffe8", "#9affc0", "#5ae08a"],
    palette: { r: "#d8c4a6", o: "#cbb08a", y: "#e8ddc0", g: "#bcc8a2", c: "#c6cfc0", b: "#aaa99a", p: "#bba6a0", w: "#f2ecd9" },
  },
  // 4 · Argent Furnace — smoky orange foundry; molten energy cores.
  {
    sky: ["#060404", "#1a0c08", "#34140a", "#6a2a0e", "#b4541a"],
    moon: ["#fff0c8", "#ffa040", "#a83a0a"],
    halo: "255,150,60",
    crater: "140,50,10",
    smoke: ["30,14,8", "80,40,20"],
    far: "#160a06",
    rim: "255,140,60",
    window: "255,170,60",
    near: "#050302",
    crack: "255,140,40",
    sigil: "#ff7a1f",
    glow: "255,120,30",
    embers: ["#ffe0a0", "#ffa040", "#ff6a1f"],
    palette: { r: "#ff2e1f", o: "#ff5a1f", y: "#ffb020", g: "#ff7a30", c: "#ffd060", b: "#ff4a5a", p: "#ff3a8a", w: "#ffe6c8" },
  },
  // 5 · Siege of the Damned — stormy blue-grey night, burning ramparts; masonry.
  {
    sky: ["#03040a", "#0e1424", "#1c2436", "#2e2a34", "#5a3624"],
    moon: ["#f4f8ff", "#b4c0d8", "#4a5670"],
    halo: "200,220,255",
    crater: "70,80,110",
    smoke: ["10,12,20", "40,44,60"],
    far: "#0c0f18",
    rim: "255,140,70",
    window: "255,150,60",
    near: "#040508",
    crack: "255,120,40",
    sigil: "#8aa0d0",
    glow: "255,110,40",
    embers: ["#ffd8a0", "#ff9a40", "#ff6a20"],
    palette: { r: "#8f6a5c", o: "#9c7a58", y: "#aa9b78", g: "#6c7b68", c: "#6a7c8c", b: "#5a6480", p: "#7a6a7e", w: "#bcb4a4" },
  },
  // 6 · Bloodlust Serenade — crimson chapel by candlelight; wine velvet and gold.
  {
    sky: ["#050103", "#180208", "#330410", "#560a1c", "#86202a"],
    moon: ["#ffb0b8", "#c8102a", "#4a0008"],
    halo: "255,40,70",
    crater: "80,0,10",
    smoke: ["24,2,8", "70,8,20"],
    far: "#160208",
    rim: "255,180,90",
    window: "255,200,110",
    near: "#060103",
    crack: "255,170,80",
    sigil: "#d4a040",
    glow: "220,40,60",
    embers: ["#fff0c0", "#ffc860", "#ff8a40"],
    palette: { r: "#a00c22", o: "#a8341e", y: "#9a6a1a", g: "#5a1a40", c: "#44102e", b: "#2e0c40", p: "#6e0c4e", w: "#c8a060" },
  },
  // 7 · Tremolo Inferno — toxic green void; acid-green demon veins.
  {
    sky: ["#010302", "#03100a", "#06200e", "#0e3412", "#245a16"],
    moon: ["#eaffb0", "#6ad83a", "#1a4a08"],
    halo: "120,255,80",
    crater: "20,70,10",
    smoke: ["4,14,6", "20,50,20"],
    far: "#04100a",
    rim: "120,255,100",
    window: "160,255,90",
    near: "#010402",
    crack: "120,255,80",
    sigil: "#5aff6a",
    glow: "80,230,70",
    embers: ["#eaffc0", "#9aff6a", "#4ad84a"],
    palette: { r: "#ff3a4a", o: "#c8ff3a", y: "#e4ff70", g: "#3fe07a", c: "#3affc0", b: "#2ac08a", p: "#8aff3a", w: "#d4ffd4" },
  },
  // 8 · Crimson Spiral — crystal cavern in cold blue light; cut gems.
  {
    sky: ["#02030a", "#080e26", "#121a44", "#1e2460", "#3a2a70"],
    moon: ["#f0fcff", "#8ad8ff", "#2a4a90"],
    halo: "140,220,255",
    crater: "40,70,140",
    smoke: ["6,8,24", "30,36,80"],
    far: "#070a1e",
    rim: "140,220,255",
    window: "150,230,255",
    near: "#02030a",
    crack: "120,210,255",
    sigil: "#7ad8ff",
    glow: "90,170,255",
    embers: ["#ffffff", "#a8e8ff", "#5ab8ff"],
    palette: { r: "#e0204a", o: "#ff5a7a", y: "#ffd8ec", g: "#3affd0", c: "#4ad8ff", b: "#3a6aff", p: "#9a4aff", w: "#eef8ff" },
  },
  // 9 · Iron Maw — steel forge with sparks; hazard-painted iron.
  {
    sky: ["#030303", "#0e0e10", "#1a1a1e", "#2a2220", "#5a2c12"],
    moon: ["#ffe0b0", "#d07a30", "#5a2a0a"],
    halo: "255,150,70",
    crater: "90,40,10",
    smoke: ["12,12,14", "44,44,50"],
    far: "#0e0e12",
    rim: "255,150,70",
    window: "255,180,80",
    near: "#040404",
    crack: "255,150,50",
    sigil: "#c87a3a",
    glow: "255,130,40",
    embers: ["#fff0b0", "#ffb040", "#ff7a20"],
    palette: { r: "#a8281a", o: "#c8641a", y: "#d8a81a", g: "#4c5c3a", c: "#3a5a6a", b: "#2c3c5c", p: "#5a3a4c", w: "#a8acb4" },
  },
  // 10 · Final Judgment — apocalyptic gold-red sky; gold and fire runes.
  {
    sky: ["#030000", "#1e0302", "#440704", "#801a08", "#d05a14"],
    moon: ["#fff4c0", "#ffb020", "#8a2a04"],
    halo: "255,170,50",
    crater: "140,60,0",
    smoke: ["30,4,2", "90,20,6"],
    far: "#1a0402",
    rim: "255,190,80",
    window: "255,200,90",
    near: "#060100",
    crack: "255,170,50",
    sigil: "#ffc040",
    glow: "255,120,30",
    embers: ["#fff4c0", "#ffc040", "#ff6a1f"],
    palette: { r: "#ff3b1f", o: "#ff7a1f", y: "#ffc84a", g: "#ff5a3a", c: "#ffe08a", b: "#ffb030", p: "#ff4a6a", w: "#fff0c0" },
  },
];
