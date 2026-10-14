// Procedural metal / gothic soundtrack (no audio files), the same synth engine as Brick Blaster with
// original tracks for Rise of Stickman. setIntensity() drives a DMC-style dynamic mix: the higher the
// style rank, the louder the rhythm guitars and the more the lead and blast beats come through.
//
// Notation (one string = one bar of sixteen 16th-notes):
//   riff:  "x" palm-muted chug on the root, "y" muted chug a semitone up,
//          0-9 a-o  open power chord at that many semitones above the root,
//          "-" hold the previous note, "." rest.
//   lead:  same characters (no x/y), counted from root + leadOctave.
//   chord: pad chord, semitones from root + 12.   arp: harpsichord cycle, semitones from root + 24.

const OFFS = "0123456789abcdefghijklmno";
const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);

type DrumStyle = "none" | "boom" | "half" | "rock" | "gallop" | "double" | "four" | "blast" | "follow";
type Bar = { riff?: string; drums?: DrumStyle; chord?: number[]; lead?: string; arp?: number[] };
export type Track = {
  name: string;
  bpm: number;
  root: number;
  pad: "organ" | "choir";
  lead: "guitar" | "organ" | "synth";
  leadOctave?: number;
  /** Mix level (1 = normal); the ambient title theme runs louder. */
  level?: number;
  sections: Record<string, Bar[]>;
  order: string[];
};

// 16-step drum grids: kick, snare, hats ("x" closed, "o" open).
const DRUMS: Record<Exclude<DrumStyle, "none" | "follow">, [string, string, string]> = {
  boom: ["x.........x.....", "................", "................"],
  half: ["x......x..x.....", "........x.......", "x.x.x.x.x.x.x.x."],
  rock: ["x.....x.x.......", "....x.......x...", "x.x.x.x.x.x.x.x."],
  gallop: ["x.xxx.xxx.xxx.xx", "....x.......x...", "x...x...x...x..."],
  double: ["xxxxxxxxxxxxxxxx", "....x.......x...", "x...x...x...x..."],
  four: ["x...x...x...x...", "....x.......x...", "..o...o...o...o."],
  blast: ["x.x.x.x.x.x.x.x.", ".x.x.x.x.x.x.x.x", "x.x.x.x.x.x.x.x."],
};

// ── The soundtrack (original) ─────────────────────────────────────────────────────────
/** Title: "Fall of the Horseman": slow choir and organ over funeral drums. */
export const TITLE: Track = {
  name: "Fall of the Horseman",
  bpm: 70,
  level: 2,
  root: 37, // C#
  pad: "choir",
  lead: "organ",
  sections: {
    A: [
      { chord: [0, 3, 7], arp: [0, 7, 12, 15, 12, 7, 3, 7], drums: "boom" },
      { chord: [-2, 2, 5], arp: [-2, 5, 10, 14, 10, 5, 2, 5], drums: "boom" },
      { chord: [-4, 0, 3], arp: [-4, 3, 8, 12, 8, 3, 0, 3], drums: "boom" },
      { chord: [-5, -1, 2], arp: [-5, 2, 7, 11, 7, 2, -1, 2], drums: "boom" },
    ],
    B: [
      { riff: "0---------------", chord: [0, 3, 7], lead: "f-------c---a-c-", drums: "half" },
      { riff: "a---------------", chord: [-2, 2, 5], lead: "e-------a-------", drums: "half" },
      { riff: "8---------------", chord: [-4, 0, 3], lead: "c-------f---h---", drums: "half" },
      { riff: "7-------7-7-7-7-", chord: [-5, -1, 2], lead: "e-------b-------", drums: "half" },
    ],
  },
  order: ["A", "B", "A", "B"],
};

/** Floor 1, the Bone Pits: "Chains of the Pit". Mid-tempo gallop with choir. */
export const BONE_PITS: Track = {
  name: "Chains of the Pit",
  bpm: 132,
  root: 35, // B (down-tuned)
  pad: "choir",
  lead: "guitar",
  sections: {
    I: [
      { riff: "0---------------", chord: [0, 3, 7], drums: "boom" },
      { riff: "x...x...x...x.xx", chord: [0, 3, 7], drums: "four" },
    ],
    A: [
      { riff: "x.xxx.xxx.xx3.1.", chord: [0, 3, 7], drums: "gallop" },
      { riff: "x.xxx.xxx.xx6.5.", chord: [0, 3, 7], drums: "gallop" },
      { riff: "x.xxx.xxx.xx3.1.", chord: [1, 5, 8], drums: "gallop" },
      { riff: "0---3---5---6-5-", chord: [-2, 2, 5], drums: "rock" },
    ],
    B: [
      { riff: "x.x.x.x.3-3-x.x.", chord: [0, 3, 7], lead: "c---f---e-c-a---", drums: "double" },
      { riff: "x.x.x.x.6-6-x.x.", chord: [-4, 0, 3], lead: "a---8---7---5---", drums: "double" },
      { riff: "x.x.x.x.3-3-x.x.", chord: [0, 3, 7], lead: "c---f---h---j---", drums: "double" },
      { riff: "1---1---1-1-1-1-", chord: [1, 5, 8], lead: "h-------g---f-e-", drums: "double" },
    ],
    C: [
      { riff: "x..x..x.x..x..x.", chord: [0, 3, 7], drums: "follow" },
      { riff: "x..x..x.x..x..1-", chord: [0, 3, 7], drums: "follow" },
      { riff: "x..x..x.x..x..x.", chord: [-4, 0, 3], drums: "follow" },
      { riff: "6-5-3-1-0-------", chord: [1, 5, 8], lead: "j-h-f-e-c-------", drums: "blast" },
    ],
  },
  order: ["I", "A", "B", "A", "C", "B"],
};

/** Boss: "The Chained Cerberus". Fast, blast beats and organ. */
export const COLOSSUS: Track = {
  name: "The Chained Cerberus",
  bpm: 168,
  root: 33, // A (low)
  pad: "organ",
  lead: "guitar",
  sections: {
    I: [
      { riff: "0---------------", chord: [0, 3, 6], drums: "boom" },
      { riff: "0-------0-------", chord: [0, 3, 6], drums: "boom" },
    ],
    A: [
      { riff: "xxxxxxxx1-1-xxxx", chord: [0, 3, 7], drums: "blast" },
      { riff: "xxxxxxxx3-3-xxxx", chord: [0, 3, 7], drums: "blast" },
      { riff: "xxxxxxxx1-1-xxxx", chord: [1, 4, 8], drums: "blast" },
      { riff: "6-6-5-5-3-3-1-1-", chord: [6, 9, 13], drums: "double" },
    ],
    B: [
      { riff: "x.xxx.xxx.xxx.xx", chord: [0, 3, 7], lead: "c-----b-----c-f-", arp: [0, 3, 7, 12], drums: "gallop" },
      { riff: "x.xxx.xxx.xxx.xx", chord: [1, 4, 8], lead: "d-------c---a---", arp: [1, 4, 8, 13], drums: "gallop" },
      { riff: "x.xxx.xxx.xxx.xx", chord: [0, 3, 7], lead: "c-----b-----c-h-", arp: [0, 3, 7, 12], drums: "gallop" },
      { riff: "6---5---3---1---", chord: [6, 9, 13], lead: "j-------h---f---", arp: [6, 9, 13, 18], drums: "double" },
    ],
    C: [
      { riff: "x...x...x..x..x.", chord: [0, 3, 6], drums: "follow" },
      { riff: "x...x...x..x..y.", chord: [0, 3, 6], drums: "follow" },
      { riff: "x...x...x..x..x.", chord: [0, 3, 6], drums: "follow" },
      { riff: "0-1-3-6-0-1-3-6-", chord: [6, 9, 13], drums: "blast" },
    ],
  },
  order: ["I", "A", "B", "C", "A", "B"],
};

// ── Synth engine ──────────────────────────────────────────────────────────────────────
function distortionCurve(k: number) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

export class Music {
  private ctx: AudioContext;
  private out: GainNode; // fades between tracks / pause
  private enabledGain: GainNode;
  private reverb: ConvolverNode;
  private guitarL: GainNode;
  private guitarR: GainNode;
  private leadBus: GainNode;
  private noise: AudioBuffer;
  private track: Track | null = null;
  private bars: Bar[] = [];
  private loopFrom = 0;
  private bar = 0;
  private stepIdx = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  enabled = true;
  private rhythmLevels: GainNode[] = [];
  private leadLevel: GainNode | null = null;
  private intensity = 1;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.enabledGain = ctx.createGain();
    this.enabledGain.connect(destination);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.enabledGain);

    // Hall reverb from a generated impulse response.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    this.reverb.connect(wet).connect(this.out);

    // Noise for drums.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Double-tracked rhythm guitar: two amp chains panned hard-ish left and right.
    this.guitarL = this.amp(-0.65, 0.16);
    this.guitarR = this.amp(0.65, 0.16);

    // Lead guitar: amp + feedback delay + reverb.
    this.leadBus = this.amp(0, 0.1, true);
  }

  /** Distortion → cabinet EQ → pan. Returns the input node. */
  private amp(pan: number, level: number, lead = false) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = lead ? 5 : 8;
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(lead ? 40 : 70);
    shaper.oversample = "2x";
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = lead ? 200 : 75;
    const scoop = ctx.createBiquadFilter();
    scoop.type = "peaking";
    scoop.frequency.value = 750;
    scoop.Q.value = 0.8;
    scoop.gain.value = lead ? 2 : -6;
    const cab = ctx.createBiquadFilter();
    cab.type = "lowpass";
    cab.frequency.value = lead ? 3800 : 4200;
    cab.Q.value = 0.7;
    const cab2 = ctx.createBiquadFilter();
    cab2.type = "lowpass";
    cab2.frequency.value = 6500;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const level$ = ctx.createGain();
    level$.gain.value = level;
    if (lead) this.leadLevel = level$;
    else this.rhythmLevels.push(level$);
    input.connect(shaper).connect(hp).connect(scoop).connect(cab).connect(cab2).connect(panner).connect(level$).connect(this.out);
    if (lead) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.33;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const send = ctx.createGain();
      send.gain.value = 0.35;
      level$.connect(delay).connect(fb).connect(delay);
      delay.connect(send).connect(this.out);
      level$.connect(this.reverb);
    }
    return input;
  }

  /** 0..1: style rank. Low = drums, pads and quiet chugs; high = full guitars, lead and blast beats. */
  setIntensity(v: number) {
    v = Math.max(0, Math.min(1, v));
    if (Math.abs(v - this.intensity) < 0.01) return;
    this.intensity = v;
    const t = this.ctx.currentTime;
    for (const g of this.rhythmLevels) g.gain.setTargetAtTime(0.16 * (0.3 + 0.7 * v), t, 0.4);
    this.leadLevel?.gain.setTargetAtTime(0.1 * Math.max(0, Math.min(1, (v - 0.25) / 0.4)), t, 0.4);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.enabledGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  /** Switch to a track (crossfades); null stops the music. */
  play(track: Track | null) {
    if (track === this.track) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + 0.4);
    this.track = track;
    if (!track) {
      this.stopTimer();
      return;
    }
    this.bars = track.order.flatMap((s) => track.sections[s]);
    // Loop back past a one-off intro section.
    this.loopFrom = track.order[0] === "I" ? track.sections.I.length : 0;
    this.bar = 0;
    this.stepIdx = 0;
    this.nextTime = t + 0.45;
    this.out.gain.linearRampToValueAtTime(0.0001, t + 0.44);
    this.out.gain.linearRampToValueAtTime(track.level ?? 1, t + 0.9);
    if (!this.paused) this.startTimer();
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    if (paused) {
      this.out.gain.linearRampToValueAtTime(0, t + 0.25);
      this.stopTimer();
    } else if (this.track) {
      this.out.gain.linearRampToValueAtTime(this.track.level ?? 1, t + 0.4);
      this.nextTime = t + 0.08;
      this.startTimer();
    }
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const track = this.track;
    if (!track) return;
    const step = 60 / track.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(track, this.bars[this.bar], this.stepIdx, this.nextTime, step);
      this.nextTime += step;
      if (++this.stepIdx === 16) {
        this.stepIdx = 0;
        if (++this.bar >= this.bars.length) this.bar = this.loopFrom;
      }
    }
  }

  // ── One 16th-note step ──────────────────────────────────────────────────────────────
  private playStep(track: Track, bar: Bar, i: number, t: number, step: number) {
    const sectionStart = this.isSectionStart();
    const sectionEnd = this.isSectionEnd();
    const root = track.root;

    // Guitars + bass.
    if (bar.riff) {
      const c = bar.riff[i];
      const muted = c === "x" || c === "y";
      const off = c === "x" ? 0 : c === "y" ? 1 : OFFS.indexOf(c);
      if (off >= 0) {
        let len = 1;
        while (i + len < 16 && bar.riff[i + len] === "-") len++;
        const dur = muted ? step * 0.9 : step * len;
        this.guitar(root + off, t, dur, muted);
        const prev = i > 0 ? bar.riff[i - 1] : "";
        if (muted || prev !== c || i % 4 === 0) {
          let blen = len;
          while (!muted && i + blen < 16 && bar.riff[i + blen] === c && (i + blen) % 4 !== 0) blen++;
          this.bass(root - 12 + off, t, muted ? step * 0.9 : step * blen);
        }
      }
    }

    // Drums.
    let style = bar.drums ?? "none";
    if (this.intensity < 0.25 && (style === "blast" || style === "double")) style = "rock";
    if (style !== "none") {
      const [k, s, h] =
        style === "follow" ? [this.onsets(bar.riff), "........x.......", "x...x...x...x..."] : DRUMS[style];
      if (k[i] === "x") this.kick(t);
      const fill = sectionEnd && i >= 12 && style !== "boom";
      if (s[i] === "x" || fill) this.snare(t, fill ? 0.8 : 1);
      if (h[i] === "x") this.hat(t, false);
      else if (h[i] === "o") this.hat(t, true);
      if (i === 0 && sectionStart) this.crash(t);
    }

    // Pad chord, held for the whole bar.
    if (bar.chord && i === 0) {
      const dur = step * 16;
      for (const n of bar.chord) {
        if (track.pad === "organ") this.organ(root + 12 + n, t, dur, 0.035);
        else this.choir(root + 12 + n, t, dur);
      }
    }

    // Harpsichord arpeggio.
    if (bar.arp) this.harpsichord(root + 24 + bar.arp[i % bar.arp.length], t);

    // Lead melody.
    if (bar.lead) {
      const c = bar.lead[i];
      const off = OFFS.indexOf(c);
      if (off >= 0) {
        let len = 1;
        while (i + len < 16 && bar.lead[i + len] === "-") len++;
        const note = root + (track.leadOctave ?? 24) + off;
        const dur = step * len;
        if (track.lead === "guitar") this.leadGuitar(note, t, dur);
        else if (track.lead === "organ") this.organ(note, t, dur, 0.05);
        else this.synth(note, t, dur);
      }
    }
  }

  private isSectionStart() {
    const order = this.track!.order;
    let b = 0;
    for (const s of order) {
      if (b === this.bar) return true;
      b += this.track!.sections[s].length;
    }
    return false;
  }

  private isSectionEnd() {
    const order = this.track!.order;
    let b = 0;
    for (const s of order) {
      b += this.track!.sections[s].length;
      if (b - 1 === this.bar) return true;
    }
    return false;
  }

  private onsets(riff?: string) {
    if (!riff) return "x...............";
    return [...riff].map((c) => (c === "-" || c === "." ? "." : "x")).join("");
  }

  // ── Instruments ─────────────────────────────────────────────────────────────────────
  private env(g: GainNode, t: number, peak: number, attack: number, dur: number, release: number) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, dur) + release);
  }

  private osc(type: OscillatorType, freq: number, t: number, stop: number, dest: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  /** Power chord (root + fifth, + octave when open) into both rhythm amps. */
  private guitar(note: number, t: number, dur: number, muted: boolean) {
    const ctx = this.ctx;
    const f = midi(note);
    const end = t + dur + (muted ? 0.05 : 0.12);
    for (const [bus, det] of [
      [this.guitarL, -7],
      [this.guitarR, 7],
    ] as const) {
      const g = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = muted ? 650 : 5000;
      tone.Q.value = muted ? 1.2 : 0.5;
      tone.connect(g).connect(bus);
      if (muted) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      } else this.env(g, t, 0.35, 0.004, dur, 0.1);
      this.osc("sawtooth", f, t, end, tone, det);
      this.osc("sawtooth", f * 1.4983, t, end, tone, -det);
      if (!muted && bus === this.guitarL) this.osc("sawtooth", f * 2, t, end, tone, det * 0.5);
    }
  }

  private bass(note: number, t: number, dur: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.connect(g).connect(this.out);
    this.env(g, t, 0.2, 0.005, dur, 0.06);
    this.osc("sawtooth", midi(note), t, t + dur + 0.1, lp);
  }

  private kick(t: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    g.gain.setValueAtTime(0.75, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
    // Beater click.
    this.noiseHit(t, 0.012, 0.18, "highpass", 2500);
  }

  private snare(t: number, level: number) {
    this.noiseHit(t, 0.18, 0.32 * level, "highpass", 1400, true);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    g.gain.setValueAtTime(0.28 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.14);
  }

  private hat(t: number, open: boolean) {
    this.noiseHit(t, open ? 0.22 : 0.04, open ? 0.06 : 0.05, "highpass", 7500);
  }

  private crash(t: number) {
    this.noiseHit(t, 1.6, 0.14, "highpass", 4500, true);
  }

  private noiseHit(t: number, dur: number, level: number, type: BiquadFilterType, freq: number, verb = false) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    if (verb) g.connect(this.reverb);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** Church organ: drawbar-style sine partials. */
  private organ(note: number, t: number, dur: number, level: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.out);
    g.connect(this.reverb);
    this.env(g, t, level, 0.06, dur, 0.35);
    const f = midi(note);
    const end = t + dur + 0.4;
    for (const [mult, amp] of [
      [0.5, 0.5],
      [1, 1],
      [2, 0.6],
      [3, 0.35],
      [4, 0.2],
    ]) {
      const pg = ctx.createGain();
      pg.gain.value = amp;
      pg.connect(g);
      this.osc("sine", f * mult, t, end, pg);
    }
  }

  /** Dark choir "aah": detuned saws through vowel formants. */
  private choir(note: number, t: number, dur: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.out);
    g.connect(this.reverb);
    this.env(g, t, 0.05, 0.35, dur, 0.9);
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 720;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1150;
    f2.Q.value = 6;
    const f2g = ctx.createGain();
    f2g.gain.value = 0.6;
    f1.connect(g);
    f2.connect(f2g).connect(g);
    const f = midi(note);
    const end = t + dur + 1;
    for (const det of [-9, 0, 9]) this.osc("sawtooth", f, t, end, f1, det).connect(f2);
  }

  private harpsichord(note: number, t: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 350;
    hp.connect(g);
    g.connect(this.out);
    g.connect(this.reverb);
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    const f = midi(note);
    this.osc("sawtooth", f, t, t + 0.36, hp);
    this.osc("square", f * 2, t, t + 0.36, hp, 4);
  }

  /** Screaming lead guitar with vibrato. */
  private leadGuitar(note: number, t: number, dur: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.leadBus);
    this.env(g, t, 0.4, 0.01, dur, 0.15);
    const o = this.osc("sawtooth", midi(note), t, t + dur + 0.2, g);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.6;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(dur > 0.3 ? 22 : 0, t + Math.min(0.25, dur));
    lfo.connect(depth).connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.2);
  }

  /** Industrial square-wave stab. */
  private synth(note: number, t: number, dur: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + Math.max(0.08, dur));
    lp.connect(g);
    g.connect(this.out);
    g.connect(this.reverb);
    this.env(g, t, 0.05, 0.004, dur * 0.8, 0.08);
    this.osc("square", midi(note), t, t + dur + 0.1, lp, -6);
    this.osc("sawtooth", midi(note), t, t + dur + 0.1, lp, 6);
  }
}
