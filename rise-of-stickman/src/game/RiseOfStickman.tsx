import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type Card, type Quality, type RunStats, type UiEvent } from "./game";
import type { Action } from "./input";
import { CHANGES, CREDITS } from "./credits";
import { loadModels } from "./models";
import { iconCanvas } from "./textures";

type Screen = "title" | "intro" | "play" | "choose" | "paused" | "dead" | "victory";
type Settings = { music: boolean; sfx: boolean; quality: Quality; blood: boolean };

const STORY = [
  "They called him the Horseman, fourth rider of the Council, its blade in the dark.",
  "Betrayed by the ones he served, he was cast into the underworld and his name was struck out.",
  "Now he climbs. Floor by floor, through every demon citadel, toward the hand that wrote his fall.",
];

function loadSettings(): Settings {
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const def: Settings = { music: true, sfx: true, quality: coarse ? "low" : "high", blood: true };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem("ros-settings") ?? "{}") };
  } catch {
    return def;
  }
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function RiseOfStickman() {
  const host = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [choice, setChoice] = useState<{ title: string; cards: Card[] } | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [bossCard, setBossCard] = useState<{ name: string; title: string } | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [panel, setPanel] = useState<"none" | "controls" | "settings" | "credits">("none");
  const [loaded, setLoaded] = useState<[number, number]>([0, 5]);
  const ready = loaded[0] >= loaded[1];

  useEffect(() => {
    loadModels((d, t) => setLoaded([d, t])).catch(() => setLoaded([-1, 5]));
  }, []);
  const [storyIdx, setStoryIdx] = useState(0);
  const [touch, setTouch] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    const g = new Game(host.current!, hudRef.current!, settings.quality);
    game.current = g;
    (window as unknown as { __ros: Game }).__ros = g;
    g.onUi = (e: UiEvent) => {
      if (e.type === "choose") {
        setChoice({ title: e.title, cards: e.cards });
        setScreen("choose");
      } else if (e.type === "dead" || e.type === "victory") {
        setStats(e.stats);
        setScreen(e.type);
      } else if (e.type === "bossIntro") {
        setBossCard({ name: e.name, title: e.title });
        setTimeout(() => setBossCard(null), 2900);
      }
    };
    g.hud.show(false);
    return () => g.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings → game + storage.
  useEffect(() => {
    const g = game.current;
    if (!g) return;
    g.audio.setMusicOn(settings.music);
    g.audio.setSfxOn(settings.sfx);
    g.fx.blood = settings.blood;
    g.setQuality(settings.quality);
    try {
      localStorage.setItem("ros-settings", JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [settings]);

  useEffect(() => {
    const g = game.current;
    if (!g) return;
    g.hud.show(screen === "play" || screen === "choose" || screen === "paused");
    if (screen === "title" || screen === "intro") g.audio.setCue("title");
  }, [screen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" && e.code !== "KeyP") return;
      const g = game.current!;
      if (screenRef.current === "play") {
        g.setPaused(true);
        setScreen("paused");
      } else if (screenRef.current === "paused") {
        g.setPaused(false);
        setPanel("none");
        setScreen("play");
      }
    };
    const onTouch = () => setTouch(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouch, { once: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouch);
    };
  }, []);

  const begin = useCallback(() => {
    const g = game.current!;
    g.audio.unlock();
    g.audio.ui();
    if (touch) {
      const el = document.documentElement;
      el.requestFullscreen?.().catch(() => {});
      (window.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation?.lock?.("landscape").catch(() => {});
    }
    setStoryIdx(0);
    setScreen("intro");
  }, [touch]);

  const startRun = useCallback(() => {
    const g = game.current!;
    g.startRun();
    setScreen("play");
  }, []);

  const pick = (id: string) => {
    game.current!.choose(id);
    setChoice(null);
    setScreen("play");
  };

  const resume = () => {
    game.current!.setPaused(false);
    setPanel("none");
    setScreen("play");
  };

  const toTitle = () => {
    const g = game.current!;
    g.setPaused(true);
    g.running = false;
    setPanel("none");
    setScreen("title");
  };

  return (
    <div className="ros">
      <div className="ros-stage" ref={host} />
      <div className="ros-vignette" />
      <div className="ros-hud" ref={hudRef} />

      {screen === "play" && touch && <TouchControls game={game} onPause={() => {
        game.current!.setPaused(true);
        setScreen("paused");
      }} />}
      {screen === "play" && !touch && (
        <button className="ros-pausebtn" onClick={() => { game.current!.setPaused(true); setScreen("paused"); }} aria-label="Pause">❚❚</button>
      )}

      {bossCard && (
        <div className="ros-bosscard">
          <small>{bossCard.title}</small>
          <h2>{bossCard.name}</h2>
        </div>
      )}

      {screen === "title" && (
        <div className="ros-screen ros-title">
          <a className="home" href="../">
            ← All games
          </a>
          <div className="ros-logo">
            <span className="ros-logo-rise">Rise of</span>
            <span className="ros-logo-main">Stickman</span>
          </div>
          <p className="ros-tag">The Horseman fell. Now he climbs.</p>
          <div className="ros-menu">
            <button className="ros-btn primary" onClick={begin} disabled={!ready}>
              {ready ? "Rise" : loaded[0] < 0 ? "Failed to load" : `Summoning demons ${loaded[0]}/${loaded[1]}`}
            </button>
            <button className="ros-btn" onClick={() => setPanel(panel === "controls" ? "none" : "controls")}>Controls</button>
            <button className="ros-btn" onClick={() => setPanel(panel === "settings" ? "none" : "settings")}>Settings</button>
            <button className="ros-btn ghost" onClick={() => setPanel(panel === "credits" ? "none" : "credits")}>Credits</button>
          </div>
          {panel === "controls" && <Controls touch={touch} />}
          {panel === "settings" && <SettingsPanel s={settings} set={setSettings} />}
          {panel === "credits" && <Credits />}
          <p className="ros-fine">Hard mode · Floor 1 of 4: the Bone Pits · Playable slice</p>
        </div>
      )}

      {screen === "intro" && (
        <div className="ros-screen ros-intro" onClick={() => (storyIdx < STORY.length - 1 ? setStoryIdx(storyIdx + 1) : startRun())}>
          <div className="ros-panel-ink" key={storyIdx}>
            <p>{STORY[storyIdx]}</p>
          </div>
          <div className="ros-intro-foot">
            <button className="ros-btn ghost" onClick={(e) => { e.stopPropagation(); startRun(); }}>Skip</button>
            <span>{touch ? "Tap" : "Click"} to continue</span>
          </div>
        </div>
      )}

      {screen === "choose" && choice && (
        <div className="ros-screen ros-choose">
          <h2>{choice.title}</h2>
          <p className="ros-sub">Choose one</p>
          <div className="ros-cards">
            {choice.cards.map((c) => (
              <button key={c.id} className="ros-card" style={{ ["--c" as string]: c.color }} onClick={() => pick(c.id)}>
                <Icon kind={c.icon} />
                <small>{c.tag}</small>
                <h3>{c.name}</h3>
                <p>{c.text}</p>
                {c.note && <em>{c.note}</em>}
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "paused" && (
        <div className="ros-screen ros-pause">
          <h2>Paused</h2>
          <div className="ros-menu">
            <button className="ros-btn primary" onClick={resume}>Resume</button>
            <button className="ros-btn" onClick={() => setPanel(panel === "controls" ? "none" : "controls")}>Controls</button>
            <button className="ros-btn" onClick={() => setPanel(panel === "settings" ? "none" : "settings")}>Settings</button>
            <button className="ros-btn ghost" onClick={toTitle}>Abandon run</button>
          </div>
          {panel === "controls" && <Controls touch={touch} />}
          {panel === "settings" && <SettingsPanel s={settings} set={setSettings} />}
        </div>
      )}

      {(screen === "dead" || screen === "victory") && stats && (
        <div className={`ros-screen ros-end ${screen}`}>
          <h2>{screen === "dead" ? "You Fell" : "The Bone Pits Are Yours"}</h2>
          <p className="ros-sub">
            {screen === "dead"
              ? "The underworld keeps what it kills. Rise again."
              : "The Chained Cerberus is broken. The Drowned Cathedral waits above, in the next build."}
          </p>
          <div className="ros-stats">
            <div><b>{fmtTime(stats.time)}</b><span>Time</span></div>
            <div><b>{stats.kills}</b><span>Kills</span></div>
            <div><b>{stats.bestRank}</b><span>Best style</span></div>
            <div><b>{stats.souls}</b><span>Souls</span></div>
          </div>
          <div className="ros-menu row">
            <button className="ros-btn primary" onClick={startRun}>Rise again</button>
            <button className="ros-btn" onClick={toTitle}>Title</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Icon({ kind }: { kind: Parameters<typeof iconCanvas>[0] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(iconCanvas(kind), 0, 0, c.width, c.height);
  }, [kind]);
  return <canvas ref={ref} width={128} height={128} className="ros-icon" />;
}

function Credits() {
  return (
    <div className="ros-info ros-credits">
      <p style={{ marginTop: 0 }}>
        <b>Rise of Stickman</b>: game, hero, world, effects and music by rownok-HR-LS.
      </p>
      <p>Creature models from Sketchfab:</p>
      <ul>
        {CREDITS.map((c) => (
          <li key={c.url}>
            <a href={c.url} target="_blank" rel="noreferrer">{c.what}</a> by {c.by} ({c.role}),{" "}
            <a href={c.licenceUrl} target="_blank" rel="noreferrer">{c.licence}</a>
          </li>
        ))}
      </ul>
      <p>Changes: {CHANGES}</p>
    </div>
  );
}

function Controls({ touch }: { touch: boolean }) {
  return (
    <div className="ros-info">
      {touch ? (
        <ul>
          <li><b>Left stick</b> Move</li>
          <li><b>Slash</b> Katana combo (tap 4× for the spin finisher)</li>
          <li><b>Shoot</b> Hold for twin revolvers; tap again while reloading inside the gold zone for a perfect reload</li>
          <li><b>Dash</b> Shadow dash through enemies; Slash right after = Rift Cut</li>
          <li><b>Parry</b> Press when an enemy flashes red to counter and execute</li>
          <li><b>Wrath</b> When the bar is full: become a burning demon</li>
          <li><b>Cyclone</b> Crimson Cyclone special</li>
        </ul>
      ) : (
        <ul>
          <li><b>WASD</b> Move · <b>Mouse</b> Aim</li>
          <li><b>Left click</b> Katana combo (4th hit is a spin)</li>
          <li><b>Right click (hold)</b> Twin revolvers · <b>R</b> Reload, and press again in the gold zone for a perfect reload</li>
          <li><b>Space</b> Shadow dash · click right after = <i>Rift Cut</i></li>
          <li><b>Shift</b> Parry when an enemy flashes red → execution</li>
          <li><b>Q</b> Wrath form · <b>E</b> Crimson Cyclone · <b>Esc</b> Pause</li>
        </ul>
      )}
      <p>Mix sword, guns, dodges and parries to raise your <b>style rank</b> (D → SSS). Getting hit drops it.</p>
    </div>
  );
}

function SettingsPanel({ s, set }: { s: Settings; set: (f: (s: Settings) => Settings) => void }) {
  const toggle = (k: "music" | "sfx" | "blood") => set((x) => ({ ...x, [k]: !x[k] }));
  return (
    <div className="ros-info ros-settings">
      <label><input type="checkbox" checked={s.music} onChange={() => toggle("music")} /> Music</label>
      <label><input type="checkbox" checked={s.sfx} onChange={() => toggle("sfx")} /> Sound effects</label>
      <label><input type="checkbox" checked={s.blood} onChange={() => toggle("blood")} /> Blood (off = black ink)</label>
      <label>
        Graphics
        <select value={s.quality} onChange={(e) => set((x) => ({ ...x, quality: e.target.value as Quality }))}>
          <option value="high">High (shadows, sharper)</option>
          <option value="low">Low (faster on phones)</option>
        </select>
      </label>
    </div>
  );
}

// ── Touch controls ────────────────────────────────────────────────────────────────────
function TouchControls({ game, onPause }: { game: React.RefObject<Game | null>; onPause: () => void }) {
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);

  const onStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    origin.current = { id: t.identifier, x: t.clientX, y: t.clientY };
    const s = stick.current!;
    const r = s.parentElement!.getBoundingClientRect();
    s.style.left = `${t.clientX - r.left}px`;
    s.style.top = `${t.clientY - r.top}px`;
    s.classList.add("on");
  };
  const onMove = (e: React.TouchEvent) => {
    const o = origin.current;
    if (!o) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== o.id) continue;
      let dx = t.clientX - o.x;
      let dy = t.clientY - o.y;
      const l = Math.hypot(dx, dy);
      const max = 50;
      if (l > max) {
        dx = (dx / l) * max;
        dy = (dy / l) * max;
      }
      knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
      game.current?.input.setStick(dx / max, -dy / max);
    }
  };
  const onEnd = (e: React.TouchEvent) => {
    const o = origin.current;
    if (!o) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== o.id) continue;
      origin.current = null;
      knob.current!.style.transform = "";
      stick.current!.classList.remove("on");
      game.current?.input.setStick(0, 0);
    }
  };
  const btn = (a: Action, label: string, cls: string) => (
    <button
      className={`ros-tbtn ${cls}`}
      onTouchStart={(e) => {
        e.preventDefault();
        game.current?.input.down(a);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        game.current?.input.up(a);
      }}
      onTouchCancel={() => game.current?.input.up(a)}
    >
      {label}
    </button>
  );
  return (
    <div className="ros-touch">
      <div className="ros-stickzone" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        <div className="ros-stick" ref={stick}>
          <div className="ros-knob" ref={knob} />
        </div>
      </div>
      <div className="ros-buttons">
        {btn("attack", "Slash", "big slash")}
        {btn("shoot", "Shoot", "shoot")}
        {btn("dash", "Dash", "dash")}
        {btn("parry", "Parry", "parry")}
        {btn("special", "Cyclone", "special")}
        {btn("wrath", "Wrath", "wrath")}
      </div>
      <button className="ros-tpause" onTouchStart={(e) => { e.preventDefault(); onPause(); }}>❚❚</button>
    </div>
  );
}
