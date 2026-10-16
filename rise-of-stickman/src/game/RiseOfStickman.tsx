import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type Card, type HubView, type Quality, type RunStats, type UiEvent } from "./game";
import type { Action } from "./input";
import { CHANGES, CREDITS } from "./credits";
import { HUB_MODELS, loadModels, RUN_MODELS } from "./models";
import { loadSave } from "./save";
import { iconCanvas } from "./textures";
import { sigilSvg } from "./sigils";

type Screen = "title" | "intro" | "play" | "choose" | "hub" | "paused" | "dead" | "victory";
const ALL_MODELS = [...RUN_MODELS, ...HUB_MODELS];
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
  const [choice, setChoice] = useState<{ title: string; cards: Card[]; lord?: boolean; reroll?: number } | null>(null);
  const [hubView, setHubView] = useState<HubView | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [bossCard, setBossCard] = useState<{ name: string; title: string } | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [panel, setPanel] = useState<"none" | "controls" | "settings" | "credits">("none");
  const [loaded, setLoaded] = useState<[number, number]>([0, ALL_MODELS.length]);
  const ready = loaded[0] >= loaded[1];

  useEffect(() => {
    loadModels((d, t) => setLoaded([d, t]), ALL_MODELS).catch(() => setLoaded([-1, ALL_MODELS.length]));
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
        setChoice({ title: e.title, cards: e.cards, lord: e.lord, reroll: e.reroll });
        setScreen("choose");
      } else if (e.type === "hub") {
        setHubView(e.view);
        setScreen(e.view ? "hub" : "play");
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
    g.hud.show(screen === "play" || screen === "choose" || screen === "paused" || screen === "hub");
    if (screen === "title" || screen === "intro") g.audio.setCue("title");
  }, [screen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" && e.code !== "KeyP") return;
      const g = game.current!;
      if (screenRef.current === "hub") return g.hubAction("close");
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
    // The story panels only play before the very first run; after that you wake in the stable.
    if (loadSave().runs > 0) {
      g.enterHub();
      setScreen("play");
      return;
    }
    setStoryIdx(0);
    setScreen("intro");
  }, [touch]);

  /** Wake in the Forsaken Stable. */
  const startRun = useCallback(() => {
    const g = game.current!;
    g.enterHub();
    setScreen("play");
  }, []);

  const pick = (id: string) => {
    // Clear first: the game may open a new choice (e.g. after a gift) from inside choose().
    setChoice(null);
    setScreen("play");
    game.current!.choose(id);
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
          <p className="ros-fine">Hard mode · The Forsaken Stable + Floor 1 of 4: the Bone Pits</p>
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
        <div className={`ros-screen ros-choose${choice.lord ? " lord" : ""}`}>
          <h2>{choice.title}</h2>
          <p className="ros-sub">Choose one</p>
          <div className="ros-cards">
            {choice.cards.map((c) => (
              <button key={c.id} className="ros-card" style={{ ["--c" as string]: c.color, ["--r" as string]: c.rarity ?? c.color }} onClick={() => pick(c.id)}>
                <Emblem id={c.id} kind={c.icon} />
                <small>{c.tag}</small>
                <h3>{c.name}</h3>
                <p>{c.text}</p>
                {c.note && <em>{c.note}</em>}
              </button>
            ))}
          </div>
          {choice.reroll !== undefined && (
            <button className="ros-btn ghost ros-reroll" onClick={() => game.current!.reroll()}>
              ⟳ Reroll · {choice.reroll} left
            </button>
          )}
        </div>
      )}

      {screen === "hub" && hubView && <HubPanel view={hubView} act={(id) => game.current!.hubAction(id)} />}

      {screen === "paused" && (
        <div className="ros-screen ros-pause">
          <h2>Paused</h2>
          <div className="ros-menu">
            <button className="ros-btn primary" onClick={resume}>Resume</button>
            <button className="ros-btn" onClick={() => setPanel(panel === "controls" ? "none" : "controls")}>Controls</button>
            <button className="ros-btn" onClick={() => setPanel(panel === "settings" ? "none" : "settings")}>Settings</button>
            <button className="ros-btn ghost" onClick={toTitle}>{game.current?.inHub ? "Quit to title" : "Abandon run"}</button>
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
              ? "The underworld keeps what it kills, and gives you back to the Forsaken Stable."
              : "The Chained Cerberus is broken. The Drowned Cathedral waits above, in the next build."}
          </p>
          <div className="ros-stats">
            <div><b>{fmtTime(stats.time)}</b><span>Time</span></div>
            <div><b>{stats.kills}</b><span>Kills</span></div>
            <div><b>{stats.bestRank}</b><span>Best style</span></div>
            <div><b>{stats.souls}</b><span>Souls banked</span></div>
            <div><b>{stats.embers}</b><span>Embers</span></div>
          </div>
          <div className="ros-menu row">
            <button className="ros-btn primary" onClick={startRun}>Return to the Stable</button>
            <button className="ros-btn" onClick={toTitle}>Title</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** The Altar of Scars: eight scars carved in a grid, and the chosen scar's two sides in detail. */
function AltarPanel({ view, act }: { view: Extract<HubView, { kind: "altar" }>; act: (id: string) => void }) {
  const [sel, setSel] = useState(0);
  const row = view.rows[Math.min(sel, view.rows.length - 1)];
  const carved = view.rows.reduce((n, r) => n + r.a.rank + r.b.rank, 0);
  const total = view.rows.reduce((n, r) => n + r.a.max + r.b.max, 0);
  return (
    <div className="ros-screen ros-hub ros-altarscreen">
      <div className="ros-altar-top">
        <div>
          <h2>Altar of Scars</h2>
          <p>Every scar you carve stays with you through death. Each scar has two sides, and only one side burns at a time. Switching sides is free.</p>
        </div>
        <div className="ros-ember-pill">
          <i />
          <b>{view.embers}</b>
          <span>Embers</span>
        </div>
      </div>
      <div className="ros-altar2">
        <div className="ros-scargrid">
          {view.rows.map((r, i) => {
            const act0 = r.side ? r.b : r.a;
            const lit = act0.rank > 0;
            const ranks = r.a.rank + r.b.rank;
            return (
              <button key={r.id} className={`ros-scartile${i === sel ? " sel" : ""}${lit ? " lit" : ""}`} onClick={() => setSel(i)}>
                <span className="ros-scartile-no">{ROMAN[i]}</span>
                <span className="ros-scartile-sig" dangerouslySetInnerHTML={{ __html: sigilSvg(`alt:${act0.sid}`) ?? "" }} />
                <span className="ros-scartile-txt">
                  <b>{act0.name}</b>
                  <small>
                    <em className={r.side === 0 ? "on" : ""}>{r.a.name}</em> / <em className={r.side === 1 ? "on" : ""}>{r.b.name}</em>
                  </small>
                </span>
                <span className="ros-scartile-rank">{ranks ? `${ranks}/${r.a.max + r.b.max}` : "—"}</span>
              </button>
            );
          })}
        </div>
        <div className="ros-scardetail" key={row.id}>
          <div className="ros-scardetail-head">
            <span>Scar {ROMAN[sel]}</span>
            <small>{carved} of {total} carved</small>
          </div>
          {([row.a, row.b] as const).map((d, i) => {
            const on = row.side === i && d.rank > 0;
            const ab = i ? "b" : "a";
            const poor = d.next !== null && view.embers < d.next;
            return (
              <div key={ab} className={`ros-side${on ? " on" : ""}${d.rank ? " owned" : ""}`}>
                <span className="ros-side-sig" dangerouslySetInnerHTML={{ __html: sigilSvg(`alt:${d.sid}`) ?? "" }} />
                <div className="ros-side-body">
                  <div className="ros-side-head">
                    <b>{d.name}</b>
                    <span className="ros-pips">
                      {Array.from({ length: d.max }, (_, k) => (
                        <i key={k} className={k < d.rank ? "on" : ""} />
                      ))}
                    </span>
                  </div>
                  <p>{d.text}</p>
                  {d.nextText && <p className="ros-side-next">Next rank: {d.nextText}</p>}
                  <div className="ros-side-btns">
                    {d.next !== null ? (
                      <button className={`ros-carve${poor ? " poor" : ""}`} onClick={() => act(`altar:buy${ab}:${row.id}`)}>
                        <span>{d.rank ? "Deepen the scar" : "Carve the scar"}</span>
                        <b>
                          <i />
                          {d.next}
                        </b>
                      </button>
                    ) : (
                      <span className="ros-maxed">Fully carved</span>
                    )}
                    {on ? (
                      <span className="ros-burning">Burning</span>
                    ) : (
                      d.rank > 0 && (
                        <button className="ros-mini" onClick={() => act(`altar:use${ab}:${row.id}`)}>
                          Burn this side
                        </button>
                      )
                    )}
                  </div>
                  {poor && <small className="ros-need">Need {d.next! - view.embers} more Embers</small>}
                </div>
                {i === 0 && <span className="ros-side-or">or</span>}
              </div>
            );
          })}
        </div>
      </div>
      <button className="ros-btn ghost" onClick={() => act("close")}>
        Close
      </button>
    </div>
  );
}

/** Panels in the Forsaken Stable: NPC dialogue, the Altar of Scars, prophecies, keepsakes. */
function HubPanel({ view, act }: { view: HubView; act: (id: string) => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [view]);
  if (view.kind === "talk") {
    const more = step < view.lines.length - 1;
    return (
      <div className="ros-screen ros-hub talk" onClick={() => more && setStep(step + 1)}>
        <div className="ros-dialog" style={{ ["--c" as string]: view.color }}>
          <div className="ros-dialog-name">
            <b>{view.name}</b>
            <small>{view.title}</small>
          </div>
          <p key={step}>{view.lines[step]}</p>
          {more ? (
            <span className="ros-dialog-more">▼</span>
          ) : (
            <div className="ros-dialog-opts">
              {view.options.map((o) => (
                <button key={o.id} className="ros-btn" disabled={o.disabled} onClick={(e) => { e.stopPropagation(); act(o.id); }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  const close = (
    <button className="ros-btn ghost" onClick={() => act("close")}>
      Close
    </button>
  );
  if (view.kind === "altar") return <AltarPanel view={view} act={act} />;
  if (view.kind === "prophecies")
    return (
      <div className="ros-screen ros-hub">
        <h2>The Seer&apos;s Prophecies</h2>
        <p className="ros-sub">&ldquo;All of this has already happened. You just haven&apos;t been there yet.&rdquo;</p>
        <div className="ros-prophecies">
          {view.rows.map((p) => (
            <div key={p.id} className={`ros-proph${p.done ? " done" : ""}${p.claimed ? " claimed" : ""}`}>
              <div>
                <b>{p.name}</b>
                <em>{p.hint}</em>
              </div>
              <div className="ros-proph-side">
                <small>{p.reward}</small>
                {p.claimed ? (
                  <span className="ros-active">Claimed</span>
                ) : p.done ? (
                  <button className="ros-mini gold" onClick={() => act(`proph:${p.id}`)}>
                    Claim
                  </button>
                ) : (
                  <span className="ros-prog">
                    {p.goal > 1 ? `${p.progress} / ${p.goal}` : "Unfulfilled"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {close}
      </div>
    );
  return (
    <div className="ros-screen ros-hub">
      <h2>Keepsakes</h2>
      <p className="ros-sub">Wear one keepsake into each run. Give Grave Wine to Krag, the Seer, Ashmane, the Bone Merchant or a Fallen Lord to earn theirs. You have {view.wine} Grave Wine.</p>
      <div className="ros-keepsakes">
        {view.rows.map((k) => {
          const on = view.equipped === k.id;
          return (
            <button key={k.id} className={`ros-ks${k.owned ? "" : " locked"}${on ? " on" : ""}`} style={{ ["--c" as string]: k.color }} disabled={!k.owned} onClick={() => act(on ? "ks:none" : `ks:${k.id}`)}>
              <b>{k.owned ? k.name : "???"}</b>
              <p>{k.owned ? k.text : `Gift from ${k.from.startsWith("lord_") ? "a Fallen Lord" : k.from === "krag" ? "Old Krag" : k.from === "seer" ? "the Hollow Seer" : k.from === "steed" ? "Ashmane" : "the Bone Merchant"}`}</p>
              {on && <span className="ros-active">Worn</span>}
            </button>
          );
        })}
      </div>
      <div className="ros-menu row">
        <button className="ros-btn primary" onClick={() => act("ride")}>
          Ride out
        </button>
        {close}
      </div>
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

/** The power's own animated emblem, or the generic icon for rewards without one. */
function Emblem({ id, kind }: { id: string; kind: Parameters<typeof iconCanvas>[0] }) {
  const svg = sigilSvg(id);
  if (!svg) return <Icon kind={kind} />;
  return <span className="ros-sigil-box" dangerouslySetInnerHTML={{ __html: svg }} />;
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
          <li><b>Use</b> Buy from the merchant, drink from the fountain</li>
        </ul>
      ) : (
        <ul>
          <li><b>WASD</b> Move · <b>Mouse</b> Aim</li>
          <li><b>Left click</b> Katana combo (4th hit is a spin)</li>
          <li><b>Right click (hold)</b> Twin revolvers · <b>R</b> Reload, and press again in the gold zone for a perfect reload</li>
          <li><b>Space</b> Shadow dash · click right after = <i>Rift Cut</i></li>
          <li><b>Shift</b> Parry when an enemy flashes red → execution</li>
          <li><b>Q</b> Wrath form · <b>E</b> Weapon special · <b>F</b> Talk / use / buy · <b>Esc</b> Pause</li>
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
        {btn("interact", "Use", "use")}
      </div>
      <button className="ros-tpause" onTouchStart={(e) => { e.preventDefault(); onPause(); }}>❚❚</button>
    </div>
  );
}
