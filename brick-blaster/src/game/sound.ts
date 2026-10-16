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
  private musicBus: GainNode | null = null;
  private musicVol = 0.8;
  private sfxVol = 0.9;
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
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(comp);
      const musicBus = this.ctx.createGain();
      musicBus.gain.value = 0.69 * this.musicVol;
      musicBus.connect(comp);
      this.musicBus = musicBus;
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

  /** Settings sliders, 0..1. */
  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.ctx && this.musicBus && this.sfx) {
      this.musicBus.gain.setTargetAtTime(0.69 * music, this.ctx.currentTime, 0.05);
      this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    }
  }

  /** Style rank 0..1 drives how hard the soundtrack hits. */
  setIntensity(x: number) {
    this.music?.setIntensity(x);
  }

  /** 0..1 pulse on every beat of the current track (for visuals). */
  beat() {
    return this.music?.beat() ?? 0;
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
  /** Style rank up: a rising power chord stab. */
  rankUp(rank: number) {
    const base = 196 * 2 ** (rank / 6);
    this.tone(base, 0.25, "sawtooth", 0.05, base * 1.5);
    this.tone(base * 1.5, 0.3, "square", 0.035);
  }
  bossHit() {
    this.tone(110, 0.22, "sawtooth", 0.09, 55);
    this.noise(0.18, 0.25);
  }
  bossRoar() {
    this.tone(90, 1.1, "sawtooth", 0.1, 40);
    this.tone(134, 1.1, "sawtooth", 0.07, 60);
    this.noise(0.9, 0.3);
  }
  bossShoot() {
    this.tone(240, 0.25, "sawtooth", 0.05, 90);
  }
  stunned() {
    this.tone(880, 0.3, "square", 0.05, 220);
    this.noise(0.25, 0.2);
  }
  portal() {
    this.tone(300, 0.25, "sine", 0.06, 1200);
  }
  zap() {
    this.tone(1600, 0.08, "square", 0.03, 400);
  }
  pick() {
    [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, "triangle", 0.06), i * 60));
  }
  level() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, "square", 0.05), i * 110));
  }
}
