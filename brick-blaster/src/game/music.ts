// Procedural metal / gothic soundtrack (no audio files). Original tracks in the spirit of
// industrial-metal and gothic-action game scores: down-tuned distorted guitars, double-kick and
// blast-beat drums, church organ, choir, harpsichord arpeggios and a screaming lead.
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
type Track = {
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

const rep = <T,>(n: number, b: T): T[] => Array.from({ length: n }, () => b);

// ── The soundtrack ────────────────────────────────────────────────────────────────────
export const TITLE: Track = {
  name: "Gates of Dis",
  bpm: 76,
  level: 2,
  root: 38, // D
  pad: "choir",
  lead: "organ",
  sections: {
    A: [
      { chord: [0, 3, 7], arp: [0, 3, 7, 12, 15, 12, 7, 3], drums: "boom" },
      { chord: [-4, 0, 3], arp: [-4, 0, 3, 8, 12, 8, 3, 0], drums: "boom" },
      { chord: [5, 8, 12], arp: [5, 8, 12, 17, 20, 17, 12, 8], drums: "boom" },
      { chord: [7, 11, 14], arp: [7, 11, 14, 19, 23, 19, 14, 11], drums: "boom" },
    ],
    B: [
      { riff: "0---------------", chord: [0, 3, 7], lead: "c-------f---e-c-", drums: "half" },
      { riff: "8---------------", chord: [-4, 0, 3], lead: "a-------8---7---", drums: "half" },
      { riff: "5---------------", chord: [5, 8, 12], lead: "8-------a---c---", drums: "half" },
      { riff: "7-------7-7-7-7-", chord: [7, 11, 14], lead: "b-------e-------", drums: "half" },
    ],
  },
  order: ["A", "A", "B", "B"],
};

export const TRACKS: Track[] = [
  {
    // 1 · Rainbow — galloping E-phrygian opener with choir.
    name: "Hellfire Overture",
    bpm: 140,
    root: 40,
    pad: "choir",
    lead: "guitar",
    sections: {
      I: [
        { riff: "0---------------", chord: [0, 3, 7], drums: "boom" },
        { riff: "1---------------", chord: [1, 5, 8], drums: "boom" },
      ],
      A: [
        { riff: "xxx.xxx.xxx.3-1-", drums: "gallop" },
        { riff: "xxx.xxx.xxx.5-3-", drums: "gallop" },
        { riff: "xxx.xxx.xxx.3-1-", drums: "gallop" },
        { riff: "xxx.xxx.6-5-3-1-", drums: "gallop" },
      ],
      B: [
        { riff: "0-------1-------", chord: [0, 3, 7], lead: "c---a---8---7---", drums: "double" },
        { riff: "3-------1-------", chord: [3, 7, 10], lead: "8---7---5---3-5-", drums: "double" },
        { riff: "0-------1-------", chord: [0, 3, 7], lead: "c---d---f---d---", drums: "double" },
        { riff: "6-------5---3---", chord: [1, 5, 8], lead: "c-------b---c---", drums: "double" },
      ],
    },
    order: ["I", "A", "A", "B", "A", "B"],
  },
  {
    // 2 · Pyramid — gothic D harmonic minor: organ, harpsichord, half-time.
    name: "Cathedral of Ash",
    bpm: 118,
    root: 38,
    pad: "organ",
    lead: "organ",
    sections: {
      A: [
        { riff: "0-----0-----3-5-", chord: [0, 3, 7], arp: [0, 3, 7, 12], drums: "half" },
        { riff: "8-----8-----7-5-", chord: [-4, 0, 3], arp: [-4, 0, 3, 8], drums: "half" },
        { riff: "0-----0-----3-5-", chord: [0, 3, 7], arp: [0, 3, 7, 12], drums: "half" },
        { riff: "7-----7-----b-c-", chord: [7, 11, 14], arp: [7, 11, 14, 19], drums: "half" },
      ],
      B: [
        { riff: "xx.xx.xx0---3---", chord: [0, 3, 7], lead: "f-e-c-e-f---h---", drums: "rock" },
        { riff: "xx.xx.xx8---7---", chord: [-4, 0, 3], lead: "j---h-f-e---c---", drums: "rock" },
        { riff: "xx.xx.xx5---3---", chord: [5, 8, 12], lead: "h-f-e-c-a---c---", drums: "rock" },
        { riff: "7---7---7-7-7-7-", chord: [7, 11, 14], lead: "b---e---h---j---", drums: "double" },
      ],
    },
    order: ["A", "A", "B", "A", "B"],
  },
  {
    // 3 · Checkmate — racing C# minor with harpsichord over double kick.
    name: "Requiem Engine",
    bpm: 152,
    root: 37,
    pad: "organ",
    lead: "guitar",
    sections: {
      A: [
        { riff: "x.x.x.x.x.x.3-2-", arp: [0, 7, 12, 15, 12, 7], drums: "double" },
        { riff: "x.x.x.x.x.x.5-3-", arp: [0, 8, 12, 15, 12, 8], drums: "double" },
        { riff: "x.x.x.x.x.x.3-2-", arp: [0, 7, 12, 15, 12, 7], drums: "double" },
        { riff: "x.x.x.x.7-8-7-5-", arp: [-1, 7, 11, 14, 11, 7], drums: "double" },
      ],
      B: [
        { riff: "0---------3-----", chord: [0, 3, 7], lead: "c-f-e-c-f-h-j-h-", drums: "gallop" },
        { riff: "8---------7-----", chord: [-4, 0, 3], lead: "k-j-h-f-e-c-e-f-", drums: "gallop" },
        { riff: "5---------3-----", chord: [5, 8, 12], lead: "h-j-k-j-h-f-e-c-", drums: "gallop" },
        { riff: "7-----------b---", chord: [7, 11, 14], lead: "b-------e-------", drums: "gallop" },
      ],
    },
    order: ["A", "B", "A", "B"],
  },
  {
    // 4 · Chain reaction — industrial four-on-the-floor with synth stabs.
    name: "Argent Furnace",
    bpm: 168,
    root: 40,
    pad: "choir",
    lead: "synth",
    sections: {
      A: [
        { riff: ".x.x.x.x.x.x3-1-", lead: "c..c..c.f..e..c.", drums: "four" },
        { riff: ".x.x.x.x.x.x5-3-", lead: "c..c..c.h..f..e.", drums: "four" },
        { riff: ".x.x.x.x.x.x3-1-", lead: "c..c..c.f..e..c.", drums: "four" },
        { riff: ".x.x.x.x6-5-3-1-", lead: "i..h..f..e..d..c", drums: "four" },
      ],
      B: [
        { riff: "x.xx.xx.x.xx.xx.", chord: [0, 3, 7], drums: "double" },
        { riff: "x.xx.xx.x.xx1---", chord: [1, 5, 8], drums: "double" },
        { riff: "x.xx.xx.x.xx.xx.", chord: [0, 3, 7], drums: "double" },
        { riff: "6---5---3---1---", chord: [6, 10, 13], drums: "blast" },
      ],
    },
    order: ["A", "A", "B", "A", "B"],
  },
  {
    // 5 · Fortress — slow, crushing drop-C doom with a wailing lead.
    name: "Siege of the Damned",
    bpm: 96,
    root: 36,
    pad: "choir",
    lead: "guitar",
    sections: {
      A: [
        { riff: "0-----------1---", chord: [0, 3, 7], drums: "half" },
        { riff: "0-------3---1---", chord: [0, 3, 7], drums: "half" },
        { riff: "0-----------1---", chord: [1, 5, 8], drums: "half" },
        { riff: "6-------5---3-1-", chord: [6, 10, 13], drums: "half" },
      ],
      B: [
        { riff: "0-----------1---", chord: [0, 3, 7], lead: "c-----------d---", drums: "rock" },
        { riff: "0-------3---1---", chord: [0, 3, 7], lead: "f-------d---c---", drums: "rock" },
        { riff: "0-----------1---", chord: [1, 5, 8], lead: "h-----f-d---c---", drums: "rock" },
        { riff: "xxxxxxxxxxxxxxxx", chord: [6, 10, 13], lead: "i---------------", drums: "double" },
      ],
    },
    order: ["A", "B", "A", "B"],
  },
  {
    // 6 · Heart — dark romance in A harmonic minor: organ melody over gallop.
    name: "Bloodlust Serenade",
    bpm: 132,
    root: 33,
    pad: "organ",
    lead: "organ",
    leadOctave: 36,
    sections: {
      A: [
        { riff: "x.xxx.xxx.xxx.xx", chord: [0, 3, 7], lead: "0-------3-5-7---", drums: "gallop" },
        { riff: "x.xxx.xxx.xxx.xx", chord: [5, 8, 12], lead: "8-------7-5-3---", drums: "gallop" },
        { riff: "x.xxx.xxx.xxx.xx", chord: [3, 7, 10], lead: "2-------3-5-7-8-", drums: "gallop" },
        { riff: "7---------------", chord: [7, 11, 14], lead: "b-------7-------", drums: "gallop" },
      ],
      B: [
        { riff: "0-------8-------", chord: [0, 3, 7], arp: [0, 3, 7, 12, 7, 3], drums: "half" },
        { riff: "5-------3-------", chord: [5, 8, 12], arp: [5, 8, 12, 17, 12, 8], drums: "half" },
        { riff: "2-------8-------", chord: [2, 5, 8], arp: [2, 5, 8, 14, 8, 5], drums: "half" },
        { riff: "7-------7-7-b-c-", chord: [7, 11, 14], arp: [7, 11, 14, 19, 14, 11], drums: "double" },
      ],
    },
    order: ["A", "A", "B", "A", "B"],
  },
  {
    // 7 · Invader — tremolo picking and blast beats.
    name: "Tremolo Inferno",
    bpm: 184,
    root: 38,
    pad: "choir",
    lead: "guitar",
    sections: {
      A: [
        { riff: "0000000011113333", chord: [0, 3, 7], drums: "blast" },
        { riff: "5555333311110000", chord: [5, 8, 12], drums: "blast" },
        { riff: "0000000011113333", chord: [0, 3, 7], drums: "blast" },
        { riff: "6666555533331111", chord: [6, 10, 13], drums: "blast" },
      ],
      B: [
        { riff: "x.x.x.x.x.x.x.x.", lead: "c---f---e---c---", drums: "double" },
        { riff: "x.x.x.x.x.x.x.x.", lead: "d---c---a---8---", drums: "double" },
        { riff: "x.x.x.x.x.x.x.x.", lead: "c---f---h---i---", drums: "double" },
        { riff: "0---1---3---6---", lead: "h-------f-------", drums: "double" },
      ],
    },
    order: ["A", "B", "A", "A", "B"],
  },
  {
    // 8 · Diamond — B phrygian dominant, syncopated chugs and spiralling harpsichord.
    name: "Crimson Spiral",
    bpm: 136,
    root: 35,
    pad: "organ",
    lead: "guitar",
    leadOctave: 36,
    sections: {
      A: [
        { riff: "x..x..x.x..x.x..", arp: [0, 4, 7, 12, 13, 12, 7, 4], drums: "follow" },
        { riff: "x..x..x.x..x1---", arp: [1, 5, 8, 13, 17, 13, 8, 5], drums: "follow" },
        { riff: "x..x..x.x..x.x..", arp: [0, 4, 7, 12, 13, 12, 7, 4], drums: "follow" },
        { riff: "x..x..x.5-4-1-0-", arp: [-2, 1, 5, 10, 13, 10, 5, 1], drums: "follow" },
      ],
      B: [
        { riff: "0-------1-------", chord: [0, 4, 7], lead: "0-1-4-5-7-8-7-5-", drums: "double" },
        { riff: "5-------4-------", chord: [5, 8, 12], lead: "4-------1-------", drums: "double" },
        { riff: "0-------1-------", chord: [0, 4, 7], lead: "7-8-a-c-d-c-a-8-", drums: "double" },
        { riff: "4-------1---0---", chord: [1, 5, 8], lead: "7-------0-------", drums: "double" },
      ],
    },
    order: ["A", "A", "B", "A", "B"],
  },
  {
    // 9 · Steel bars — stop-start djent with a locrian edge.
    name: "Iron Maw",
    bpm: 160,
    root: 38,
    pad: "choir",
    lead: "synth",
    sections: {
      A: [
        { riff: "x.x..x.x.x..6-5-", drums: "follow" },
        { riff: "x.x..x.x.x..1---", drums: "follow" },
        { riff: "x.x..x.x.x..6-5-", drums: "follow" },
        { riff: "xxxx....xxxx....", drums: "follow" },
      ],
      B: [
        { riff: "0-------6-------", chord: [0, 3, 6], lead: "c..c..f..e..c...", drums: "double" },
        { riff: "1-------3-------", chord: [1, 5, 8], lead: "d..d..f..i..h...", drums: "double" },
        { riff: "0-------6-------", chord: [0, 3, 6], lead: "c..c..f..e..c...", drums: "double" },
        { riff: "8---6---5---1---", chord: [8, 12, 15], lead: "k---i---h---d---", drums: "blast" },
      ],
    },
    order: ["A", "A", "B", "A", "B"],
  },
  {
    // 10 · The boss — everything at once: blast beats, choir, organ and lead.
    name: "Final Judgment",
    bpm: 192,
    root: 37,
    pad: "choir",
    lead: "guitar",
    sections: {
      I: [
        { riff: "0---------------", chord: [0, 3, 7], drums: "boom" },
        { riff: "1---------------", chord: [1, 4, 8], drums: "boom" },
      ],
      A: [
        { riff: "0000111100003333", chord: [0, 3, 7], lead: "c-------d-------", drums: "blast" },
        { riff: "0000111100006666", chord: [1, 4, 8], lead: "f-------e---d---", drums: "blast" },
        { riff: "0000111100003333", chord: [0, 3, 7], lead: "c-------d-------", drums: "blast" },
        { riff: "8888777766661111", chord: [6, 9, 13], lead: "i-------h---d---", drums: "blast" },
      ],
      B: [
        { riff: "x.xxx.xxx.xxx.xx", chord: [0, 3, 7], arp: [0, 3, 7, 12, 15, 12, 7, 3], drums: "gallop" },
        { riff: "x.xxx.xxx.xx1---", chord: [1, 4, 8], arp: [1, 4, 8, 13, 16, 13, 8, 4], drums: "gallop" },
        { riff: "x.xxx.xxx.xxx.xx", chord: [0, 3, 7], arp: [0, 3, 7, 12, 15, 12, 7, 3], drums: "gallop" },
        { riff: "6---5---3---1---", chord: [6, 9, 13], arp: [6, 9, 13, 18, 21, 18, 13, 9], drums: "double" },
      ],
      C: [
        // Half-time breakdown under the choir.
        ...rep(3, { riff: "x..x..x...x.x...", chord: [0, 3, 7], drums: "follow" } as Bar),
        { riff: "0---1---3---6---", chord: [6, 9, 13], drums: "double" },
      ],
    },
    order: ["I", "A", "B", "A", "C", "B"],
  },
];

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
    const style = bar.drums ?? "none";
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
