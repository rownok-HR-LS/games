"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Game, H, MAX_H, POWERS, W, type Snapshot } from "./engine";
import { POWER_ICONS } from "./icons";
import { LEVELS } from "./levels";
import { Sound } from "./sound";
import styles from "./BrickBlaster.module.css";

const BEST_KEY = "brick-blaster-best";
const MUSIC_KEY = "brick-blaster-music";
// Touch drag moves the paddle a bit further than the finger, so a short swipe crosses the field.
const TOUCH_GAIN = 1.35;

type Drag = { id: number; startX: number; paddleX: number; at: number; moved: number };

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
  const [hud, setHud] = useState<Snapshot | null>(null);
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [touch, setTouch] = useState(false);
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const s = new Sound();
    const g = new Game(s);
    try {
      g.best = Number(localStorage.getItem(BEST_KEY)) || 0;
      if (localStorage.getItem(MUSIC_KEY) === "off") {
        s.setMusicOn(false);
        setMusicOn(false);
      }
    } catch {}
    g.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    g.touch = window.matchMedia("(pointer: coarse)").matches;
    setTouch(g.touch);
    g.onBest = (score) => {
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {}
    };
    sound.current = s;
    game.current = g;
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
      const availH = immersiveRef.current
        ? stage.clientHeight
        : Math.min(availW * (availW >= 600 ? H / W : 1.4), window.innerHeight * 0.8);
      let fieldH = H;
      let cssW = availW;
      if (availH / availW >= H / W) {
        fieldH = Math.min(MAX_H, Math.round((W * availH) / availW / 20) * 20);
      } else {
        cssW = (availH * W) / H;
      }
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
      // Soundtrack follows the game: title theme, one track per level, silence after the game.
      s.setMusic(
        g.phase === "title" ? { kind: "title" } : g.phase === "gameOver" || g.phase === "won" ? { kind: "off" } : { kind: "level", level: g.level },
        g.phase === "paused",
      );
      g.render(ctx, scale);
      if (now - lastHud > 100) {
        lastHud = now;
        setHud(g.snapshot());
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Pause when the tab is hidden.
    const onVisibility = () => {
      if (document.hidden && g.phase === "playing") g.togglePause();
      s.suspend(document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Leaving browser full screen (Esc, back gesture) also leaves the game's full-screen mode.
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
  }, []);

  // Full-screen mode: fixed overlay over the page (works on iPhone too), plus the real
  // Fullscreen API where the browser supports it to hide the address bar.
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

  // On phones the game always runs full screen: starting, launching or resuming enters it.
  const act = () => {
    if (game.current?.touch && !immersiveRef.current) enterImmersive();
    sound.current?.unlock();
    game.current?.action();
    wrap.current?.focus({ preventScroll: true });
  };

  const resume = () => {
    if (game.current?.touch && !immersiveRef.current) enterImmersive();
    game.current?.togglePause();
  };

  function aim(clientX: number) {
    const g = game.current;
    const el = canvas.current;
    if (!g || !el) return;
    const r = el.getBoundingClientRect();
    g.paddle.targetX = ((clientX - r.left) / r.width) * W;
  }

  // Mouse: the paddle follows the pointer, click launches.
  // Touch: drag anywhere (canvas or thumb pad) to slide the paddle relative to where the finger
  // started, so the finger never hides it; a quick tap launches; holding fires the laser.
  function onPointerDown(e: PointerEvent<HTMLElement>) {
    const g = game.current;
    if (!g) return;
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      aim(e.clientX);
      act();
      return;
    }
    if (drag.current) return; // ignore extra fingers
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
    let x = d.paddleX + ((e.clientX - d.startX) / el.getBoundingClientRect().width) * W * TOUCH_GAIN;
    // Re-anchor at the walls so moving back responds immediately.
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
    else if (down && (k === " " || k === "enter")) act();
    else if (down && (k === "p" || k === "escape")) g.togglePause();
    else if (down && k === "m") toggleMute();
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

  const phase = hud?.phase;

  return (
    <div ref={shell} className={`${styles.shell} ${immersive ? styles.immersive : ""}`}>
      <div className={styles.hud} aria-live="off">
        <div className={styles.stat}>
          <span>Score</span>
          <strong>{hud?.score.toLocaleString() ?? 0}</strong>
        </div>
        <div className={styles.stat}>
          <span>Level</span>
          <strong>
            {hud?.level ?? 1}
            <small>/{LEVELS.length}</small>
          </strong>
        </div>
        <div className={styles.stat}>
          <span>Lives</span>
          <strong className={styles.lives} aria-label={`${hud?.lives ?? 3} lives`}>
            {"●".repeat(Math.max(0, hud?.lives ?? 3))}
          </strong>
        </div>
        <div className={styles.powers}>
          {hud?.shield && <span className={styles.power} style={{ ["--c" as string]: POWERS.shield.color }}>
              <PowerIcon kind="shield" />
              Shield
            </span>}
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
            onClick={() => (phase === "paused" ? resume() : game.current?.togglePause())}
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

        {phase === "title" && (
          <div className={styles.overlay}>
            <h3 className={styles.logo}>
              BRICK <span>BLASTER</span>
            </h3>
            <p className={styles.tagline}>A tribute to the classic DX-Ball</p>
            <button type="button" className={styles.play} onClick={act}>
              Play
            </button>
            {touch ? (
              <ul className={styles.help}>
                <li>Drag anywhere to slide the paddle</li>
                <li>Tap to launch · hold to fire the laser</li>
                <li>Plays full screen · ✕ at the top to exit</li>
              </ul>
            ) : (
              <ul className={styles.help}>
                <li>
                  <kbd>Mouse</kbd> / <kbd>←</kbd> <kbd>→</kbd> move the paddle
                </li>
                <li>
                  <kbd>Click</kbd> / <kbd>Space</kbd> launch · fire laser
                </li>
                <li>
                  <kbd>P</kbd> pause · <kbd>M</kbd> sound · <kbd>N</kbd> music · <kbd>F</kbd> full screen
                </li>
              </ul>
            )}
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
            {hud && hud.best > 0 && <p className={styles.best}>Best: {hud.best.toLocaleString()}</p>}
          </div>
        )}
        {phase === "paused" && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>Paused</h3>
            <button type="button" className={styles.play} onClick={resume}>
              Resume
            </button>
          </div>
        )}
        {(phase === "gameOver" || phase === "won") && hud && (
          <div className={styles.overlay}>
            <h3 className={styles.big}>{phase === "won" ? "You cleared every level!" : "Game over"}</h3>
            <p className={styles.final}>
              {hud.score.toLocaleString()} <span>points</span>
            </p>
            <p className={styles.best}>{hud.score >= hud.best && hud.score > 0 ? "New best score!" : `Best: ${hud.best.toLocaleString()}`}</p>
            <button type="button" className={styles.play} onClick={act}>
              Play again
            </button>
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
