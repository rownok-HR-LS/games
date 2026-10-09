// Synthesised sound effects plus the per-level soundtrack (no audio files).
// Everything is created on the first user gesture, as browsers require.
import { Music, TITLE, TRACKS } from "./music";

export type MusicCue = { kind: "title" } | { kind: "level"; level: number } | { kind: "off" };

export class Sound {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private music: Music | null = null;
  private cue: MusicCue = { kind: "off" };
  private musicPaused = false;
  muted = false;
  musicOn = true;

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      // Shared mixer: sfx + music → gentle compressor → speakers.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(comp);
      const musicBus = this.ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(comp);
      this.music = new Music(this.ctx, musicBus);
      this.music.setEnabled(this.musicOn);
      this.applyCue();
    }
    void this.ctx.resume();
  }

  /** Which soundtrack should be playing; cheap to call every frame. */
  setMusic(cue: MusicCue, paused: boolean) {
    const same =
      cue.kind === this.cue.kind && (cue.kind !== "level" || (this.cue.kind === "level" && cue.level === this.cue.level));
    if (!same) {
      this.cue = cue;
      this.applyCue();
    }
    if (paused !== this.musicPaused) {
      this.musicPaused = paused;
      this.music?.setPaused(paused);
    }
  }

  private applyCue() {
    if (!this.music) return;
    const c = this.cue;
    this.music.play(c.kind === "title" ? TITLE : c.kind === "level" ? TRACKS[c.level % TRACKS.length] : null);
  }

  setMusicOn(on: boolean) {
    this.musicOn = on;
    this.music?.setEnabled(on);
  }

  /** Stop all audio while the tab is hidden; resume when it's back. */
  suspend(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.08, slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain = 0.25) {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted) return;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(filter).connect(g).connect(this.sfx);
    src.start();
  }

  paddle() {
    this.tone(330, 0.08, "square", 0.05, 440);
  }
  wall() {
    this.tone(220, 0.05, "triangle", 0.05);
  }
  brick(row: number) {
    this.tone(520 + row * 45, 0.07, "square", 0.05);
  }
  metal() {
    this.tone(1400, 0.09, "triangle", 0.05, 1100);
  }
  crack() {
    this.tone(300, 0.06, "sawtooth", 0.04);
  }
  explode() {
    this.noise(0.45, 0.35);
  }
  powerUp(good: boolean) {
    if (good) {
      this.tone(520, 0.08, "square", 0.05);
      setTimeout(() => this.tone(780, 0.12, "square", 0.05), 70);
    } else this.tone(300, 0.25, "sawtooth", 0.05, 120);
  }
  laser() {
    this.tone(1200, 0.06, "square", 0.025, 600);
  }
  lose() {
    this.tone(400, 0.6, "sawtooth", 0.06, 80);
  }
  level() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, "square", 0.05), i * 110));
  }
}
