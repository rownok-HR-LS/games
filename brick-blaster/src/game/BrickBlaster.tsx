"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Game, H, MAX_H, POWERS, W, type Snapshot } from "./engine";
import { POWER_ICONS } from "./icons";
import { Sound } from "./sound";
import { RANKS } from "./style";
import { CAMPAIGN, WORLDS } from "./stages";
import { DEFAULT_SETTINGS, loadSave, writeSave, type SaveData, type Settings } from "./save";
import { UPGRADES } from "./upgrades";
import styles from "./BrickBlaster.module.css";

const MUSIC_KEY = "brick-blaster-music";

type Drag = { id: number; startX: number; paddleX: number; at: number; moved: number };
type Screen = "main" | "worlds" | "world" | "settings" | "howto";

export default function BrickBlaster() {
  const shell = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const sound = useRef<Sound | null>(null);
  const drag = useRef<Drag | null>(null);
  const immersiveRef = useRef(false);
  const usedFullscreen = useRef(false);
  const layoutRef = useRef<() => void>(() => {});
  const saveRef = useRef<SaveData>(loadSave());
  const prefersReduced = useRef(false);
  const [save, setSave] = useState<SaveData>(saveRef.current);
  const [hud, setHud] = useState<Snapshot | null>(null);
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [touch, setTouch] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [screen, setScreen] = useState<Screen>("main");
  const [world, setWorld] = useState(0);
  /** Settings opened from the pause menu return there. */
  const [pauseSettings, setPauseSettings] = useState(false);

  function commit(mutate: (d: SaveData) => void) {
    const next = structuredClone(saveRef.current);
    mutate(next);
    saveRef.current = next;
    writeSave(next);
    setSave(next);
  }

  function applySettings(st: Settings) {
    const g = game.current;
    sound.current?.setVolumes(st.music, st.sfx);
    if (g) {
      g.shakeOn = st.shake;
      g.beatPulse = st.beatPulse;
      g.reduced = prefersReduced.current || st.effects === "reduced";
    }
  }

  useEffect(() => {
    const s = new Sound();
    const g = new Game(s);
    sound.current = s;
    game.current = g;
    prefersReduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    g.best = saveRef.current.highScore;
    try {
      if (localStorage.getItem(MUSIC_KEY) === "off") {
        s.setMusicOn(false);
        setMusicOn(false);
      }
    } catch {}
    g.touch = window.matchMedia("(pointer: coarse)").matches;
    setTouch(g.touch);
    applySettings(saveRef.current.settings);
    g.onBest = (score) => commit((d) => (d.highScore = Math.max(d.highScore, score)));
    g.onStageClear = (stage, result, mode) => {
      if (mode !== "campaign") return;
      const i = CAMPAIGN.indexOf(stage);
      commit((d) => {
        d.stars[i] = Math.max(d.stars[i] ?? 0, result.stars);
        d.best[i] = Math.max(d.best[i] ?? 0, result.stageScore);
        d.unlocked = Math.max(d.unlocked, Math.min(CAMPAIGN.length - 1, i + 1));
      });
    };
    g.onRunOver = (depth, score) =>
      commit((d) => {
        d.runs++;
        d.runBestDepth = Math.max(d.runBestDepth, depth);
        d.runBestScore = Math.max(d.runBestScore, score);
      });
    setHud(g.snapshot());

    const el = canvas.current!;
    const stage = wrap.current!;
    const ctx = el.getContext("2d")!;
    let scale = 1;

    // Fit the playfield to the space available. Wide screens keep the classic 4:3 field;
    // portrait phones get a taller field (same width, more height) so the game fills the screen.
    const layout = () => {
      const availW = stage.clientWidth;
      if (!availW) return;
      const availH = immersiveRef.current ? stage.clientHeight : Math.min(availW * (availW >= 600 ? H / W : 1.4), window.innerHeight * 0.8);
      let fieldH = H;
      let cssW = availW;
      if (availH / availW >= H / W) fieldH = Math.min(MAX_H, Math.round((W * availH) / availW / 20) * 20);
      else cssW = (availH * W) / H;
      const cssH = (cssW * fieldH) / W;
      g.setHeight(fieldH);
      g.viewScale = cssW / W;
      el.style.width = `${cssW}px`;
      el.style.height = `${cssH}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(cssW * dpr);
      el.height = Math.round(cssH * dpr);
      scale = el.width / W;
    };
    layoutRef.current = layout;
    const ro = new ResizeObserver(layout);
    ro.observe(stage);
    layout();

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (drag.current) g.fire(); // holding a finger down keeps the laser firing
      g.update(dt);
      // Soundtrack: title theme in menus, the stage's track while playing, silence after a loss.
      s.setMusic(
        g.phase === "title" ? { kind: "title" } : g.phase === "gameOver" || g.phase === "runOver" ? { kind: "off" } : { kind: "level", level: g.stage.track },
        g.phase === "paused",
      );
      s.setIntensity(g.phase === "title" ? 0.6 : g.style.rank / 6);
      g.beat = s.beat();
      g.render(ctx, scale);
      if (now - lastHud > 100) {
        lastHud = now;
        setHud(g.snapshot());
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      if (document.hidden && g.phase === "playing") g.togglePause();
      s.suspend(document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onFullscreen = () => {
      if (!document.fullscreenElement && usedFullscreen.current) {
        usedFullscreen.current = false;
        immersiveRef.current = false;
        setImmersive(false);
        if (g.phase === "playing") g.togglePause();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    immersiveRef.current = immersive;
    layoutRef.current();
    if (!immersive) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [immersive]);

  async function enterImmersive() {
    immersiveRef.current = true;
    setImmersive(true);
    const el = shell.current;
    if (el?.requestFullscreen && !document.fullscreenElement) {
      try {
        await el.requestFullscreen({ navigationUI: "hide" });
        usedFullscreen.current = true;
      } catch {}
    }
  }

  function exitImmersive() {
    immersiveRef.current = false;
    setImmersive(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const g = game.current;
    if (g?.phase === "playing") g.togglePause();
  }

  const toggleImmersive = () => (immersive ? exitImmersive() : enterImmersive());

  /** Run a game action from a menu button, then refresh the overlay straight away. */
  function go(fn: (g: Game) => void) {
    const g = game.current;
    if (!g) return;
    sound.current?.unlock();
    if (g.touch && !immersiveRef.current) enterImmersive();
    fn(g);
    setHud(g.snapshot());
    wrap.current?.focus({ preventScroll: true });
  }

  // In play: launch, release, fire.
  const act = () => {
    const g = game.current;
    if (!g || g.phase === "title") return;
    go((g) => g.action());
  };

  function aim(clientX: number) {
    const g = game.current;
    const el = canvas.current;
    if (!g || !el) return;
    const r = el.getBoundingClientRect();
    g.paddle.targetX = ((clientX - r.left) / r.width) * W;
  }

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    const g = game.current;
    if (!g) return;
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      aim(e.clientX);
      act();
      return;
    }
    if (drag.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    if (!g.touch) {
      g.touch = true;
      setTouch(true);
    }
    sound.current?.unlock();
    drag.current = { id: e.pointerId, startX: e.clientX, paddleX: g.paddle.x, at: performance.now(), moved: 0 };
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const g = game.current;
    if (!g) return;
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      aim(e.clientX);
      return;
    }
    const d = drag.current;
    const el = canvas.current;
    if (!d || d.id !== e.pointerId || !el) return;
    d.moved = Math.max(d.moved, Math.abs(e.clientX - d.startX));
    let x = d.paddleX + ((e.clientX - d.startX) / el.getBoundingClientRect().width) * W * saveRef.current.settings.touchGain;
    const lo = g.paddle.w / 2;
    const hi = W - lo;
    if (x < lo) {
      d.paddleX += lo - x;
      x = lo;
    } else if (x > hi) {
      d.paddleX -= x - hi;
      x = hi;
    }
    g.paddle.targetX = x;
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (e.type === "pointerup" && d.moved < 12 && performance.now() - d.at < 350) act();
  }

  const pointer = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

  function onKey(e: KeyboardEvent<HTMLDivElement>, down: boolean) {
    const g = game.current;
    if (!g) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") g.keys.left = down;
    else if (k === "arrowright" || k === "d") g.keys.right = down;
    else if (down && (k === " " || k === "enter") && g.phase !== "title") act();
    else if (down && (k === "p" || k === "escape")) {
      g.togglePause();
      setHud(g.snapshot());
    } else if (down && k === "m") toggleMute();
    else if (down && k === "n") toggleMusic();
    else if (down && k === "f") toggleImmersive();
    else return;
    e.preventDefault();
  }

  function toggleMusic() {
    const s = sound.current;
    if (!s) return;
    s.unlock();
    s.setMusicOn(!s.musicOn);
    setMusicOn(s.musicOn);
    try {
      localStorage.setItem(MUSIC_KEY, s.musicOn ? "on" : "off");
    } catch {}
  }

  function toggleMute() {
    if (!sound.current) return;
    sound.current.muted = !sound.current.muted;
    setMuted(sound.current.muted);
  }

  function updateSettings(patch: Partial<Settings>) {
    commit((d) => (d.settings = { ...d.settings, ...patch }));
    applySettings({ ...saveRef.current.settings });
  }

  const phase = hud?.phase;
  useEffect(() => {
    if (phase !== "paused") setPauseSettings(false);
  }, [phase]);
  const totalStars = save.stars.reduce((a, b) => a + (b ?? 0), 0);
  const continueAt = Math.min(save.unlocked, CAMPAIGN.length - 1);

  return (
    <div ref={shell} className={`${styles.shell} ${immersive ? styles.immersive : ""}`}>
      <div className={styles.hud} aria-live="off">
        <div className={styles.stat}>
          <span>Score</span>
          <strong>{hud?.score.toLocaleString() ?? 0}</strong>
        </div>
        <div className={styles.stat}>
          <span>{hud?.mode === "run" ? "Run" : "Level"}</span>
          <strong>{phase === "title" ? "—" : hud?.label}</strong>
        </div>
        <div className={styles.stat}>
          <span>Lives</span>
          <strong className={styles.lives} aria-label={`${hud?.lives ?? 3} lives`}>
            {"●".repeat(Math.max(0, Math.min(9, hud?.lives ?? 3)))}
          </strong>
        </div>
        <div className={styles.powers}>
          {hud?.shield && (
            <span className={styles.power} style={{ ["--c" as string]: POWERS.shield.color }}>
              <PowerIcon kind="shield" />
              Shield
            </span>
          )}
          {hud?.timers.map((t) => (
            <span key={t.kind} className={styles.power} style={{ ["--c" as string]: POWERS[t.kind].color }}>
              <PowerIcon kind={t.kind} />
              {POWERS[t.kind].label}
              <i style={{ width: `${(t.left / t.total) * 100}%` }} />
            </span>
          ))}
        </div>
        <div className={styles.hudButtons}>
          <button type="button" onClick={toggleMusic} aria-pressed={!musicOn} aria-label={musicOn ? "Music on" : "Music off"} title="Music (N)">
            <Icon name={musicOn ? "music" : "musicOff"} />
            <span>{musicOn ? "Music on" : "Music off"}</span>
          </button>
          <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Sound off" : "Sound on"} title="Sound (M)">
            <Icon name={muted ? "muted" : "sound"} />
            <span>{muted ? "Sound off" : "Sound on"}</span>
          </button>
          <button
            type="button"
            onClick={() => go((g) => g.togglePause())}
            disabled={phase !== "playing" && phase !== "paused"}
            aria-label={phase === "paused" ? "Resume" : "Pause"}
            title="Pause (P)"
          >
            <Icon name={phase === "paused" ? "play" : "pause"} />
            <span>{phase === "paused" ? "Resume" : "Pause"}</span>
          </button>
          <button type="button" onClick={toggleImmersive} aria-pressed={immersive} aria-label={immersive ? "Exit full screen" : "Full screen"} title="Full screen (F)">
            <Icon name={immersive ? "exit" : "expand"} />
            <span>{immersive ? "Exit" : "Full screen"}</span>
          </button>
        </div>
      </div>

      <div
        ref={wrap}
        className={styles.stage}
        tabIndex={0}
        role="application"
        aria-label="Brick Blaster game. Move with the mouse, arrow keys or by dragging; click, tap or press Space to launch."
        onKeyDown={(e) => onKey(e, true)}
        onKeyUp={(e) => onKey(e, false)}
        onBlur={() => {
          if (game.current) game.current.keys = { left: false, right: false };
        }}
      >
        <canvas ref={canvas} className={styles.canvas} {...pointer} />

        {/* ── Menus ── */}
        {phase === "title" && screen === "main" && (
          <div className={styles.overlay}>
            <h3 className={styles.logo}>
              BRICK <span>BLASTER</span>
            </h3>
            <p className={styles.tagline}>A tribute to the classic DX-Ball</p>
            <div className={styles.menu}>
              <button type="button" className={styles.play} onClick={() => (save.unlocked > 0 ? go((g) => g.startCampaign(continueAt)) : go((g) => g.startCampaign(0)))}>
                {save.unlocked > 0 ? `Continue ${CAMPAIGN[continueAt].world + 1}-${CAMPAIGN[continueAt].index + 1}` : "Start campaign"}
              </button>
              <button type="button" className={styles.menuBtn} onClick={() => setScreen("worlds")}>
                World map <small>★ {totalStars} / {CAMPAIGN.length * 3}</small>
              </button>
              <button type="button" className={styles.menuBtn} onClick={() => go((g) => g.startRun(Math.floor(Math.random() * 1e9)))}>
                Endless Descent <small>roguelite · best depth {save.runBestDepth}</small>
              </button>
              <div className={styles.menuRow}>
                <button type="button" className={styles.ghostBtn} onClick={() => setScreen("howto")}>
                  How to play
                </button>
                <button type="button" className={styles.ghostBtn} onClick={() => setScreen("settings")}>
                  Settings
                </button>
              </div>
            </div>
            {save.highScore > 0 && <p className={styles.best}>High score {save.highScore.toLocaleString()}</p>}
          </div>
        )}

        {phase === "title" && screen === "worlds" && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>World map</h3>
            <div className={styles.worlds}>
              {WORLDS.map((w, i) => {
                const start = i * 10;
                const locked = start > save.unlocked;
                const stars = save.stars.slice(start, start + 10).reduce((a, b) => a + (b ?? 0), 0);
                return (
                  <button
                    key={w.name}
                    type="button"
                    className={styles.worldCard}
                    disabled={locked}
                    onClick={() => {
                      setWorld(i);
                      setScreen("world");
                    }}
                  >
                    <b>
                      {i + 1} · {w.name}
                    </b>
                    <span>{locked ? "Locked: beat the previous world's boss" : w.blurb}</span>
                    <em>★ {stars} / 30</em>
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.ghostBtn} onClick={() => setScreen("main")}>
              Back
            </button>
          </div>
        )}

        {phase === "title" && screen === "world" && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>
              {world + 1} · {WORLDS[world].name}
            </h3>
            <div className={styles.levels}>
              {CAMPAIGN.slice(world * 10, world * 10 + 10).map((st, k) => {
                const i = world * 10 + k;
                const locked = i > save.unlocked;
                const stars = save.stars[i] ?? 0;
                return (
                  <button key={i} type="button" className={`${styles.levelBtn} ${st.boss !== undefined ? styles.bossBtn : ""}`} disabled={locked} onClick={() => go((g) => g.startCampaign(i))} title={st.name}>
                    <b>{st.boss !== undefined ? "BOSS" : `${world + 1}-${k + 1}`}</b>
                    <span>{locked ? "🔒" : st.name}</span>
                    <em>{"★".repeat(stars)}{"☆".repeat(3 - stars)}</em>
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.ghostBtn} onClick={() => setScreen("worlds")}>
              Back
            </button>
          </div>
        )}

        {((phase === "title" && screen === "settings") || (phase === "paused" && pauseSettings)) && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>Settings</h3>
            <div className={styles.settings}>
              <label>
                Music volume
                <input type="range" min={0} max={1} step={0.05} value={save.settings.music} onChange={(e) => updateSettings({ music: Number(e.target.value) })} />
              </label>
              <label>
                Sound effects volume
                <input type="range" min={0} max={1} step={0.05} value={save.settings.sfx} onChange={(e) => updateSettings({ sfx: Number(e.target.value) })} />
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={save.settings.shake} onChange={(e) => updateSettings({ shake: e.target.checked })} />
                Screen shake
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={save.settings.beatPulse} onChange={(e) => updateSettings({ beatPulse: e.target.checked })} />
                Bricks pulse to the music
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={save.settings.effects === "reduced"} onChange={(e) => updateSettings({ effects: e.target.checked ? "reduced" : "full" })} />
                Reduced effects (calmer visuals, better on slow phones)
              </label>
              {touch && (
                <label>
                  Touch sensitivity
                  <input type="range" min={0.8} max={2.2} step={0.05} value={save.settings.touchGain} onChange={(e) => updateSettings({ touchGain: Number(e.target.value) })} />
                </label>
              )}
              <button type="button" className={styles.linkBtn} onClick={() => updateSettings({ ...DEFAULT_SETTINGS })}>
                Reset to defaults
              </button>
            </div>
            <button type="button" className={styles.ghostBtn} onClick={() => (pauseSettings ? setPauseSettings(false) : setScreen("main"))}>
              Back
            </button>
          </div>
        )}

        {phase === "title" && screen === "howto" && (
          <div className={`${styles.overlay} ${styles.scroll}`}>
            <h3 className={styles.big}>How to play</h3>
            <ul className={styles.howto}>
              <li>
                <b>Move</b> with the mouse, ← → / A D, or drag on a touch screen. <b>Launch</b> with a click, Space or a tap.
              </li>
              <li>
                <b>Spin:</b> hit the ball while the paddle is moving to curve its angle.
              </li>
              <li>
                <b>Style meter:</b> chain hits without the ball touching the paddle to climb from <i style={{ color: RANKS[0].color }}>D</i> to{" "}
                <i style={{ color: RANKS[6].color }}>SSS</i>. Your rank multiplies every point. Losing a ball or getting stunned drops it.
              </li>
              <li>
                <b>Stars:</b> clear a level, clear it without losing a life, and reach rank S or higher.
              </li>
              <li>
                <b>Bricks:</b> strong bricks take several hits, steel can't break, explosives chain, <i>?</i> always drops a power-up, sliding rows move, green-rune bricks grow back once, red-eyed shooters fire at you (getting hit stuns the paddle), and portals swap the ball across the field.
              </li>
              <li>
                <b>Bosses</b> end every world: break the orbiting shield ring, then strike the glowing gem on the forehead. Dodge the fireballs and the red beam markers.
              </li>
              <li>
                <b>Endless Descent:</b> random levels that get harder, a boss every 5 depths, and after each level you pick 1 of 3 relics.
              </li>
            </ul>
            <div className={styles.legend}>
              {(Object.keys(POWERS) as (keyof typeof POWERS)[]).map((k) => (
                <span key={k} style={{ ["--c" as string]: POWERS[k].color }} title={POWERS[k].good ? "Good" : "Bad"}>
                  <b>
                    <PowerIcon kind={k} size={16} />
                  </b>
                  {POWERS[k].label}
                </span>
              ))}
            </div>
            <button type="button" className={styles.ghostBtn} onClick={() => setScreen("main")}>
              Back
            </button>
          </div>
        )}

        {/* ── In-game overlays ── */}
        {phase === "paused" && !pauseSettings && hud && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>Paused</h3>
            <div className={styles.menu}>
              <button type="button" className={styles.play} onClick={() => go((g) => g.togglePause())}>
                Resume
              </button>
              {hud.mode === "campaign" && (
                <button type="button" className={styles.menuBtn} onClick={() => go((g) => g.retryStage())}>
                  Restart level
                </button>
              )}
              <button type="button" className={styles.menuBtn} onClick={() => setPauseSettings(true)}>
                Settings
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => {
                  setScreen("main");
                  go((g) => g.toMenu());
                }}
              >
                {hud.mode === "run" ? "Abandon run" : "Quit to menu"}
              </button>
            </div>
          </div>
        )}

        {phase === "stageClear" && hud?.result && (
          <div className={styles.overlay}>
            <p className={styles.kicker}>{hud.result.boss ? "Boss defeated" : "Level clear"}</p>
            <h3 className={styles.big}>{hud.result.final ? "You conquered the Throne of Judgment!" : hud.stageName}</h3>
            <p className={styles.stars} aria-label={`${hud.result.stars} of 3 stars`}>
              {[0, 1, 2].map((k) => (
                <span key={k} className={k < hud.result!.stars ? styles.starOn : styles.starOff} style={{ animationDelay: `${k * 0.25}s` }}>
                  ★
                </span>
              ))}
            </p>
            <ul className={styles.summary}>
              <li>
                Level score <b>{hud.result.stageScore.toLocaleString()}</b>
              </li>
              <li>
                Peak style <b style={{ color: RANKS[hud.result.peakRank].color }}>{RANKS[hud.result.peakRank].letter}</b>
              </li>
              <li>
                Lives lost <b>{hud.result.livesLost}</b>
              </li>
            </ul>
            <div className={styles.menu}>
              {!hud.result.final && (
                <button type="button" className={styles.play} onClick={() => go((g) => g.nextStage())}>
                  Next level
                </button>
              )}
              <div className={styles.menuRow}>
                <button type="button" className={styles.ghostBtn} onClick={() => go((g) => g.retryStage())}>
                  Replay
                </button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => {
                    setScreen("worlds");
                    go((g) => g.toMenu());
                  }}
                >
                  World map
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "upgrade" && hud && (
          <div className={`${styles.overlay} ${styles.scroll}`}>
            <p className={styles.kicker}>Depth {hud.depth} cleared</p>
            <h3 className={styles.big}>Choose a relic</h3>
            <div className={styles.cards}>
              {hud.choices.map((u) => (
                <button key={u.id} type="button" className={`${styles.card} ${styles[u.rarity]}`} onClick={() => go((g) => g.chooseUpgrade(u.id))}>
                  <span className={styles.sigil}>{u.sigil}</span>
                  <b>{u.name}</b>
                  <small>
                    {u.rarity}
                    {(hud.stacks[u.id] ?? 0) > 0 ? ` · owned ${hud.stacks[u.id]}/${u.max}` : ""}
                  </small>
                  <span>{u.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "gameOver" && hud && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>Game over</h3>
            <p className={styles.final}>
              {hud.score.toLocaleString()} <span>points</span>
            </p>
            <div className={styles.menu}>
              <button type="button" className={styles.play} onClick={() => go((g) => g.retryStage())}>
                Try {hud.label} again
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => {
                  setScreen("main");
                  go((g) => g.toMenu());
                }}
              >
                Menu
              </button>
            </div>
          </div>
        )}

        {phase === "runOver" && hud && (
          <div className={styles.overlay}>
            <p className={styles.kicker}>The descent ends</p>
            <h3 className={styles.big}>Depth {hud.depth}</h3>
            <p className={styles.final}>
              {hud.score.toLocaleString()} <span>points</span>
            </p>
            <p className={styles.best}>
              Best: depth {save.runBestDepth} · {save.runBestScore.toLocaleString()} points
            </p>
            {Object.keys(hud.stacks).length > 0 && (
              <p className={styles.relics}>
                {UPGRADES.filter((u) => hud.stacks[u.id]).map((u) => (
                  <span key={u.id} title={u.name}>
                    {u.sigil}
                    {hud.stacks[u.id]! > 1 ? `×${hud.stacks[u.id]}` : ""}
                  </span>
                ))}
              </p>
            )}
            <div className={styles.menu}>
              <button type="button" className={styles.play} onClick={() => go((g) => g.startRun(Math.floor(Math.random() * 1e9)))}>
                New descent
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => {
                  setScreen("main");
                  go((g) => g.toMenu());
                }}
              >
                Menu
              </button>
            </div>
          </div>
        )}
      </div>

      {touch && (
        <div className={styles.pad} {...pointer} aria-hidden="true">
          <span>◀</span> Drag here to move · tap to launch <span>▶</span>
        </div>
      )}
    </div>
  );
}

const ICONS: Record<string, string> = {
  sound: "M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z",
  music: "M9 3v10.6A3.5 3.5 0 1 0 11 16.6V8h6V3H9z",
  musicOff: "M9 3v10.6A3.5 3.5 0 1 0 11 16.6V8h6V3H9zM3.4 2 2 3.4l18.6 18.6 1.4-1.4z",
  muted: "M4 9v6h4l5 4V5L8 9H4zm12.6.6L15.2 11l-1.4-1.4-1 1L14.2 12l-1.4 1.4 1 1 1.4-1.4 1.4 1.4 1-1L16.2 12l1.4-1.4z",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
  play: "M8 5v14l11-7z",
  expand: "M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z",
  exit: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d={ICONS[name]} fill="currentColor" />
    </svg>
  );
}

// Dark layers take a deeper shade of the power-up colour (--c on the parent), like the capsules.
const TONE_FILL = { main: "currentColor", soft: "currentColor", dark: "color-mix(in srgb, var(--c) 65%, black)" };

function PowerIcon({ kind, size = 14 }: { kind: keyof typeof POWER_ICONS; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {POWER_ICONS[kind].map((l, i) => (
        <path key={i} d={l.d} fill={TONE_FILL[l.tone]} fillOpacity={l.tone === "soft" ? 0.6 : 1} fillRule="evenodd" />
      ))}
    </svg>
  );
}
