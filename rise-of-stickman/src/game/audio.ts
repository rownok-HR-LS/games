// Synthesised sound effects + the soundtrack. Everything is built on the first user gesture.
import { BONE_PITS, COLOSSUS, Music, TITLE, type Track } from "./music";

export type Cue = "title" | "floor1" | "boss1" | "off";
const CUES: Record<Cue, Track | null> = { title: TITLE, floor1: BONE_PITS, boss1: COLOSSUS, off: null };

export class Audio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private music: Music | null = null;
  private cue: Cue = "off";
  private paused = false;
  private last = new Map<string, number>();
  sfxOn = true;
  musicOn = true;

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const ctx = this.ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      comp.connect(ctx.destination);
      this.out = ctx.createGain();
      this.out.gain.value = this.sfxOn ? 0.9 : 0;
      this.out.connect(comp);
      const mbus = ctx.createGain();
      mbus.gain.value = 0.5;
      mbus.connect(comp);
      this.music = new Music(ctx, mbus);
      this.music.setEnabled(this.musicOn);
      this.verb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 1.8);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
      }
      this.verb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.25;
      this.verb.connect(wet).connect(this.out);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.music.play(CUES[this.cue]);
    }
    void this.ctx.resume();
  }

  setCue(c: Cue) {
    if (c === this.cue) return;
    this.cue = c;
    this.music?.play(CUES[c]);
  }
  setPaused(p: boolean) {
    if (p === this.paused) return;
    this.paused = p;
    this.music?.setPaused(p);
  }
  setIntensity(v: number) {
    this.music?.setIntensity(v);
  }
  setMusicOn(on: boolean) {
    this.musicOn = on;
    this.music?.setEnabled(on);
  }
  setSfxOn(on: boolean) {
    this.sfxOn = on;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
  }

  // ── Building blocks ─────────────────────────────────────────────────────────────────
  /** Rate-limit identical sounds (e.g. 12 enemies hit by one slash). */
  private gate(key: string, ms: number) {
    const now = performance.now();
    if ((this.last.get(key) ?? 0) + ms > now) return false;
    this.last.set(key, now);
    return true;
  }

  private nz(t: number, dur: number, level: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1, verb = 0) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verb!);
    }
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, level: number, verb = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verb!);
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private ok() {
    return !!this.ctx && this.sfxOn;
  }
  private now() {
    return this.ctx!.currentTime;
  }

  // ── Effects ─────────────────────────────────────────────────────────────────────────
  slash(heavy = false) {
    if (!this.ok()) return;
    const t = this.now();
    const p = 0.9 + Math.random() * 0.25;
    this.nz(t, heavy ? 0.3 : 0.18, heavy ? 0.5 : 0.35, "bandpass", 1400 * p, 5200 * p, 1.4);
    this.nz(t + 0.02, 0.12, 0.18, "highpass", 6000, 9000, 0.7);
  }

  cut(heavy = false) {
    if (!this.ok() || !this.gate("cut", 35)) return;
    const t = this.now();
    this.nz(t, 0.09, 0.6, "lowpass", 2400, 300, 0.8);
    this.tone(t, "sine", heavy ? 120 : 180, 45, 0.16, heavy ? 0.7 : 0.45);
    this.nz(t + 0.01, 0.25, 0.22, "bandpass", 900, 400, 2); // wet splatter
  }

  gun(perfect = false) {
    if (!this.ok()) return;
    const t = this.now();
    this.nz(t, 0.16, 0.7, "lowpass", 5000, 400, 0.7, 0.2);
    this.tone(t, "square", 160, 50, 0.08, 0.35);
    this.nz(t, 0.03, 0.4, "highpass", 3500, 3500, 0.7);
    if (perfect) this.tone(t, "sine", 1800, 1600, 0.1, 0.06);
  }

  bulletHit() {
    if (!this.ok() || !this.gate("bh", 40)) return;
    const t = this.now();
    this.nz(t, 0.06, 0.25, "bandpass", 1800, 600, 1.2);
  }

  /** Revolver spin: a ratchet of cylinder clicks. */
  reload() {
    if (!this.ok()) return;
    const t = this.now();
    for (let i = 0; i < 9; i++) this.nz(t + i * 0.055, 0.02, 0.18 - i * 0.012, "highpass", 4200, 4200, 2);
    this.nz(t + 0.55, 0.05, 0.3, "bandpass", 2500, 1500, 3);
  }

  perfectReload() {
    if (!this.ok()) return;
    const t = this.now();
    this.nz(t, 0.04, 0.4, "bandpass", 3200, 3000, 4);
    this.tone(t, "triangle", 1320, 1320, 0.25, 0.12, 0.3);
    this.tone(t + 0.05, "triangle", 1980, 1980, 0.3, 0.1, 0.3);
  }

  jam() {
    if (!this.ok()) return;
    const t = this.now();
    this.nz(t, 0.08, 0.3, "bandpass", 700, 500, 4);
  }

  dash() {
    if (!this.ok()) return;
    const t = this.now();
    this.nz(t, 0.22, 0.4, "bandpass", 500, 2600, 1.1);
  }

  parryStance() {
    if (!this.ok()) return;
    this.nz(this.now(), 0.06, 0.15, "highpass", 5000, 7000, 1);
  }

  parry() {
    if (!this.ok()) return;
    const t = this.now();
    // Metallic clang: inharmonic partials with a long ring.
    for (const [f, l] of [
      [523, 0.3],
      [1307, 0.22],
      [2203, 0.16],
      [3361, 0.1],
    ])
      this.tone(t, "sine", f, f * 0.995, 1.2, l, 0.6);
    this.nz(t, 0.08, 0.6, "highpass", 2500, 2500, 0.8, 0.4);
    this.tone(t, "sine", 90, 40, 0.4, 0.6);
  }

  execute() {
    if (!this.ok()) return;
    const t = this.now();
    this.nz(t, 0.4, 0.5, "bandpass", 600, 6000, 1.5, 0.3);
    this.tone(t + 0.05, "sawtooth", 80, 30, 0.6, 0.35);
    this.nz(t + 0.08, 0.3, 0.5, "lowpass", 3000, 200, 0.8);
  }

  perfectDodge() {
    if (!this.ok()) return;
    const t = this.now();
    this.tone(t, "sine", 900, 220, 0.5, 0.18, 0.6);
    this.nz(t, 0.35, 0.25, "bandpass", 3000, 600, 2, 0.4);
  }

  wrath() {
    if (!this.ok()) return;
    const t = this.now();
    // Demonic roar: detuned saws dropping, plus a fire whoosh and a boom.
    for (const d of [0.98, 1, 1.03]) this.tone(t, "sawtooth", 140 * d, 55 * d, 1.3, 0.22, 0.5);
    this.nz(t, 1.2, 0.6, "lowpass", 900, 200, 0.6, 0.5);
    this.tone(t, "sine", 70, 25, 1.0, 0.9);
  }

  special() {
    if (!this.ok()) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) this.nz(t + i * 0.18, 0.2, 0.4, "bandpass", 900, 4500, 1.2);
  }

  hurt() {
    if (!this.ok() || !this.gate("hurt", 120)) return;
    const t = this.now();
    this.tone(t, "sawtooth", 220, 90, 0.25, 0.25);
    this.nz(t, 0.15, 0.5, "lowpass", 1500, 300, 0.8);
  }

  enemyAttack() {
    if (!this.ok() || !this.gate("ea", 90)) return;
    const t = this.now();
    this.nz(t, 0.15, 0.25, "bandpass", 800, 2400, 1.4);
  }

  /** The red glint before a parryable strike. */
  glint() {
    if (!this.ok() || !this.gate("glint", 120)) return;
    const t = this.now();
    this.tone(t, "sine", 2600, 2400, 0.18, 0.08, 0.5);
  }

  growl(deep = 1) {
    if (!this.ok() || !this.gate("growl", 400)) return;
    const t = this.now();
    this.tone(t, "sawtooth", 110 / deep, 60 / deep, 0.5, 0.1);
    this.nz(t, 0.5, 0.12, "bandpass", 300 / deep, 200 / deep, 3);
  }

  cast() {
    if (!this.ok() || !this.gate("cast", 120)) return;
    const t = this.now();
    this.tone(t, "triangle", 300, 900, 0.3, 0.1, 0.4);
    this.nz(t, 0.3, 0.2, "bandpass", 1200, 300, 2);
  }

  boom(size = 1) {
    if (!this.ok() || !this.gate("boom", 60)) return;
    const t = this.now();
    this.tone(t, "sine", 90 / size, 28, 0.6 * size, 0.9);
    this.nz(t, 0.5 * size, 0.6, "lowpass", 1400, 120, 0.7, 0.4);
  }

  chain() {
    if (!this.ok() || !this.gate("chain", 100)) return;
    const t = this.now();
    for (let i = 0; i < 6; i++) this.nz(t + i * 0.04, 0.05, 0.2, "bandpass", 3000 + Math.random() * 2000, 2500, 6);
    this.nz(t, 0.6, 0.3, "bandpass", 300, 1200, 1);
  }

  zap() {
    if (!this.ok() || !this.gate("zap", 50)) return;
    const t = this.now();
    this.tone(t, "sawtooth", 1800, 200, 0.15, 0.12);
    this.nz(t, 0.12, 0.3, "highpass", 3000, 3000, 1);
  }

  freeze() {
    if (!this.ok() || !this.gate("frz", 80)) return;
    const t = this.now();
    this.tone(t, "triangle", 2400, 3600, 0.2, 0.08, 0.5);
    this.nz(t, 0.2, 0.2, "highpass", 6000, 6000, 1);
  }

  shatter() {
    if (!this.ok() || !this.gate("sht", 60)) return;
    const t = this.now();
    for (let i = 0; i < 5; i++) this.tone(t + i * 0.02, "sine", 2000 + Math.random() * 3000, 1500, 0.2, 0.06);
    this.nz(t, 0.2, 0.4, "highpass", 4000, 2000, 1);
  }

  burn() {
    if (!this.ok() || !this.gate("burn", 150)) return;
    this.nz(this.now(), 0.25, 0.18, "bandpass", 700, 300, 1);
  }

  spawn() {
    if (!this.ok() || !this.gate("spawn", 150)) return;
    const t = this.now();
    this.tone(t, "sine", 60, 120, 0.5, 0.25);
    this.nz(t, 0.5, 0.15, "lowpass", 400, 1200, 2);
  }

  door() {
    if (!this.ok()) return;
    const t = this.now();
    this.tone(t, "sawtooth", 50, 40, 1.2, 0.15, 0.5);
    this.nz(t, 1.2, 0.25, "lowpass", 300, 100, 2, 0.5);
  }

  pickup() {
    if (!this.ok()) return;
    const t = this.now();
    for (const [i, f] of [523, 784, 1046].entries()) this.tone(t + i * 0.07, "triangle", f, f, 0.4, 0.12, 0.5);
  }

  rankUp(rank: number) {
    if (!this.ok()) return;
    const t = this.now();
    const f = 220 * 2 ** (rank / 6);
    this.tone(t, "sawtooth", f, f, 0.25, 0.08, 0.4);
    this.tone(t, "sawtooth", f * 1.5, f * 1.5, 0.25, 0.06, 0.4);
    this.nz(t, 0.3, 0.2, "highpass", 4000, 4000, 1, 0.3);
  }

  ui() {
    if (!this.ok()) return;
    this.tone(this.now(), "triangle", 880, 660, 0.08, 0.08);
  }

  killcam() {
    if (!this.ok()) return;
    const t = this.now();
    this.tone(t, "sine", 200, 50, 1.4, 0.4, 0.6);
    this.nz(t, 1.0, 0.3, "bandpass", 3000, 200, 1, 0.6);
  }
}
