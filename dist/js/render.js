// DX7-style FM voice renderer.
//
// Envelope, output-level, velocity and keyboard-scaling math follow the msfa engine that
// Dexed is built on, so timing and modulation depth land close to the hardware. The
// oscillator itself is a plain sine table rather than the DX7's log-sine/exp ROM, and
// LFO delay and depth curves are approximations. Good enough to judge brightness,
// envelope shape and harmonic character; not a bit-exact emulator.

import { ALGORITHMS, opRatio, opFixedHz } from "./dx7.js";

const N = 64; // envelope block size, as in msfa
const TWO_24 = 16777216;

const OUT_LEVEL_LOW = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46];
export const scaleOutLevel = (l) => (l >= 20 ? 28 + l : OUT_LEVEL_LOW[l]);

const VELOCITY_DATA = [
  0, 70, 86, 97, 106, 114, 121, 126, 132, 138, 142, 148, 152, 156, 160, 163, 166, 170, 173, 174, 178, 181,
  184, 186, 189, 190, 194, 196, 198, 200, 202, 205, 206, 209, 211, 214, 216, 218, 220, 222, 224, 225, 227,
  229, 230, 232, 233, 235, 237, 238, 240, 241, 242, 243, 244, 246, 246, 248, 249, 250, 251, 252, 253, 254,
];
const scaleVelocity = (velocity, sens) =>
  ((sens * (VELOCITY_DATA[Math.max(0, Math.min(127, velocity)) >> 1] - 239) + 7) >> 3) << 4;

const EXP_SCALE = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 16, 19, 23, 27, 33, 39, 47, 56, 66, 80, 94, 110, 126, 142, 158, 174,
  190, 206, 222, 238, 250,
];
function scaleCurve(group, depth, curve) {
  const scale =
    curve === 0 || curve === 3
      ? (group * depth * 329) >> 12
      : (EXP_SCALE[Math.min(group, EXP_SCALE.length - 1)] * depth * 329) >> 15;
  return curve < 2 ? -scale : scale;
}
function scaleLevel(note, o) {
  const offset = note - o.breakpoint - 17;
  return offset >= 0
    ? scaleCurve(Math.trunc((offset + 1) / 3), o.rightDepth, o.rightCurve)
    : scaleCurve(Math.trunc(-(offset - 1) / 3), o.leftDepth, o.leftCurve);
}
const scaleRate = (note, sens) => (sens * Math.min(31, Math.max(0, Math.trunc(note / 3) - 7))) >> 3;

/** Operator output level after keyboard scaling and velocity, in msfa "outlevel" units. */
export function operatorOutLevel(o, note, velocity) {
  const scaled = Math.max(0, Math.min(127, scaleOutLevel(o.level) + scaleLevel(note, o)));
  return (scaled << 5) + scaleVelocity(velocity, o.velSens);
}

/** Amplitude envelope in msfa units: level is Q16 of 1/256-octave steps. */
export class Env {
  constructor(rates, levels, outLevel, rateScaling, sampleRate) {
    this.rates = rates;
    this.levels = levels;
    this.outLevel = outLevel;
    this.rateScaling = rateScaling;
    this.srScale = 44100 / sampleRate;
    this.level = 0;
    this.down = true;
    this.advance(0);
  }
  advance(ix) {
    this.ix = ix;
    if (ix > 3) return;
    const actual = Math.max(16, ((scaleOutLevel(this.levels[ix]) >> 1) << 6) + this.outLevel - 4256);
    this.target = actual * 65536;
    this.rising = this.target > this.level;
    const q = Math.min(63, ((this.rates[ix] * 41) >> 6) + this.rateScaling);
    this.inc = (4 + (q & 3)) * 2 ** (2 + 6 + (q >> 2)) * this.srScale;
  }
  /** Advance one block; returns the level. */
  next() {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        const jump = 1716 * 65536;
        if (this.level < jump) this.level = jump;
        this.level += Math.floor((17 * TWO_24 - this.level) / TWO_24) * this.inc;
        if (this.level >= this.target) {
          this.level = this.target;
          this.advance(this.ix + 1);
        }
      } else {
        this.level -= this.inc;
        if (this.level <= this.target) {
          this.level = this.target;
          this.advance(this.ix + 1);
        }
      }
    }
    return this.level;
  }
  release() {
    this.down = false;
    this.advance(3);
  }
}

/** Linear amplitude of an envelope level: 2^(level/2^24 - 14). Full scale is 2.0. */
export const envGain = (level) => Math.pow(2, level / TWO_24 - 14);

const PITCHENV_RATE = [
  1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, 15, 15, 16,
  16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 28, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 40, 42, 43, 45, 46, 48, 50, 51, 53, 55, 57, 59, 61, 63, 66, 68, 71, 74, 76, 79,
  82, 85, 88, 91, 94, 97, 100, 104, 107, 111, 115, 119, 123, 127,
];
const PITCHENV_TAB = [
  -128, -116, -104, -95, -85, -76, -68, -61, -56, -52, -49, -46, -43, -41, -39, -37, -35, -33, -32, -31, -30,
  -29, -28, -27, -26, -25, -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8,
  -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 38, 40, 43, 46, 49, 53, 58, 65, 73, 82, 92, 103, 115, 127,
];

/** Pitch envelope; level is in octaves. */
class PitchEnv {
  constructor(eg, sampleRate) {
    this.eg = eg;
    // msfa: level is Q24 log2 with targets at tab << 19 (tab / 32 octaves) and
    // inc = rate * N * 2^24 / (21.3 * sampleRate), i.e. rate * N / (21.3 * sampleRate) octaves per block.
    this.unit = N / (21.3 * sampleRate);
    this.level = PITCHENV_TAB[eg.levels[3]] / 32;
    this.down = true;
    this.advance(0);
  }
  advance(ix) {
    this.ix = ix;
    if (ix > 3) return;
    this.target = PITCHENV_TAB[this.eg.levels[ix]] / 32;
    this.rising = this.target > this.level;
    this.inc = PITCHENV_RATE[this.eg.rates[ix]] * this.unit;
  }
  next() {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        this.level += this.inc;
        if (this.level >= this.target) {
          this.level = this.target;
          this.advance(this.ix + 1);
        }
      } else {
        this.level -= this.inc;
        if (this.level <= this.target) {
          this.level = this.target;
          this.advance(this.ix + 1);
        }
      }
    }
    return this.level;
  }
  release() {
    this.down = false;
    this.advance(3);
  }
}

// LFO speed in Hz for parameter values 0..99 (measured DX7 values, as used by SpaceAge).
export const LFO_HZ = [
  0.062541, 0.125031, 0.312393, 0.43712, 0.62461, 0.750694, 0.93633, 1.125302, 1.249609, 1.436782, 1.560915,
  1.752081, 1.875117, 2.062494, 2.247191, 2.374451, 2.560492, 2.686728, 2.873976, 2.99895, 3.188013, 3.36984,
  3.500175, 3.682224, 3.812065, 4.0008, 4.186202, 4.310716, 4.50126, 4.623209, 4.814636, 4.93048, 5.121901,
  5.315191, 5.434783, 5.617346, 5.750431, 5.946717, 6.062811, 6.248438, 6.431695, 6.564264, 6.74946, 6.868132,
  7.052186, 7.25058, 7.375719, 7.556294, 7.687577, 7.877738, 7.993605, 8.181967, 8.372405, 8.504848, 8.685079,
  8.810573, 8.986341, 9.122423, 9.300595, 9.500285, 9.607994, 9.798158, 9.950249, 10.117361, 11.251125,
  11.384335, 12.562814, 13.676149, 13.904338, 15.092062, 16.366612, 16.638935, 17.869907, 19.193858,
  19.425019, 20.833333, 21.034918, 22.50225, 24.003841, 24.260068, 25.746653, 27.173913, 27.578599,
  29.052876, 30.693677, 31.191516, 32.658393, 34.31709, 34.674064, 36.416606, 38.197097, 38.550501,
  40.387722, 40.749796, 42.625746, 44.326241, 44.883303, 46.772685, 48.590865, 49.261084,
];
const PMS_TAB = [0, 10, 20, 33, 55, 92, 153, 255];
const AMS_TAB = [0, 0.259, 0.427, 1];
/** Approximate LFO delay before onset, in seconds. */
export const lfoDelaySeconds = (d) => 0.0035 * Math.pow(d, 1.6);

const SINE_SIZE = 4096;
const SINE = new Float64Array(SINE_SIZE + 1);
for (let i = 0; i <= SINE_SIZE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / SINE_SIZE);
function sine(cycles) {
  const x = (cycles - Math.floor(cycles)) * SINE_SIZE;
  const i = x | 0;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i);
}

export const midiHz = (note) => 440 * Math.pow(2, (note - 69) / 12);

/** One sounding note. Call next(n) repeatedly (n a multiple of 64 is most accurate). */
export class FmNote {
  constructor(voice, note, velocity, sampleRate, seed = 1) {
    this.v = voice;
    this.sr = sampleRate;
    this.note = Math.max(0, Math.min(127, note + voice.transpose - 24));
    this.alg = ALGORITHMS[voice.algorithm];
    this.env = voice.ops.map(
      (o) =>
        new Env(o.rates, o.levels, operatorOutLevel(o, this.note, velocity), scaleRate(this.note, o.rateScaling), sampleRate),
    );
    this.gain = new Float64Array(6);
    this.pitchEnv = new PitchEnv(voice.pitchEg, sampleRate);
    this.phase = new Float64Array(6);
    if (!voice.oscKeySync) {
      let s = seed >>> 0 || 1;
      for (let i = 0; i < 6; i++) this.phase[i] = ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    }
    this.baseInc = voice.ops.map((o) => this.opFrequency(o) / sampleRate);
    this.isFixed = voice.ops.map((o) => o.mode === 1);
    this.fb = [0, 0];
    this.fbScale = voice.feedback ? Math.pow(2, voice.feedback - 8) : 0;
    this.targets = [0, 1, 2, 3, 4, 5].map((i) => this.alg.edges.filter(([f]) => f === i + 1).map(([, t]) => t - 1));
    this.carrier = [0, 1, 2, 3, 4, 5].map((i) => this.alg.carriers.includes(i + 1));
    this.bus = Array.from({ length: 6 }, () => new Float64Array(N));
    this.out = new Float64Array(N);
    this.t = 0;
    this.blockPos = N;
    this.lfoPhase = 0;
    this.lfoHold = 0;
    this.lfoLast = -1;
    this.pendingRelease = false;
    this.releasedAt = -1;
  }
  opFrequency(o) {
    if (o.mode === 1) {
      const det = o.detune > 7 ? Math.pow(2, (13457 * (o.detune - 7)) / TWO_24) : 1;
      return opFixedHz(o) * det;
    }
    const hz = midiHz(this.note);
    const log2 = Math.log2(hz);
    const detuneOct = ((0.0209 * Math.exp(-0.396 * log2)) / 7) * log2 * (o.detune - 7);
    return hz * opRatio(o) * Math.pow(2, detuneOct);
  }
  release() {
    this.pendingRelease = true;
  }
  /** True once every carrier envelope has decayed below audibility after release. */
  get finished() {
    if (this.releasedAt < 0) return false;
    return this.env.every((e, i) => !this.carrier[i] || (e.ix > 3 && e.level <= 16 * 65536 + 1) || envGain(e.level) < 1e-4);
  }
  lfoValue() {
    const l = this.v.lfo;
    const hz = LFO_HZ[l.speed];
    this.lfoPhase += (hz * N) / this.sr;
    const p = this.lfoPhase - Math.floor(this.lfoPhase);
    let bi;
    switch (l.wave) {
      case 0: bi = p < 0.5 ? 4 * p - 1 : 3 - 4 * p; break;
      case 1: bi = 1 - 2 * p; break;
      case 2: bi = 2 * p - 1; break;
      case 3: bi = p < 0.5 ? 1 : -1; break;
      case 4: bi = Math.sin(2 * Math.PI * p); break;
      default: {
        const cycle = Math.floor(this.lfoPhase);
        if (cycle !== this.lfoLast) {
          this.lfoLast = cycle;
          this.lfoHold = Math.sin(cycle * 12.9898 + 78.233) * 43758.5453;
          this.lfoHold = 2 * (this.lfoHold - Math.floor(this.lfoHold)) - 1;
        }
        bi = this.lfoHold;
      }
    }
    const delay = lfoDelaySeconds(l.delay);
    const age = this.t / this.sr;
    const fade = delay <= 0 ? 1 : Math.max(0, Math.min(1, (age - delay) / (0.5 * delay + 0.05)));
    return { bi: bi * fade, uni: ((bi + 1) / 2) * fade };
  }
  block() {
    if (this.pendingRelease) {
      this.pendingRelease = false;
      this.releasedAt = this.t;
      for (const e of this.env) e.release();
      this.pitchEnv.release();
    }
    const v = this.v;
    const lfo = this.lfoValue();
    const pitchOct = this.pitchEnv.next() + (lfo.bi * (v.lfo.pmd / 99) * (PMS_TAB[v.lfo.pms] / 255));
    const pitchMul = Math.pow(2, pitchOct);
    const ampLfo = lfo.uni * (v.lfo.amd / 99);
    const fbOp = this.alg.fb - 1;
    this.out.fill(0);
    for (const b of this.bus) b.fill(0);
    for (let op = 5; op >= 0; op--) {
      const g0 = this.gain[op];
      let level = this.env[op].next();
      const ams = AMS_TAB[v.ops[op].ams];
      if (ams) level -= ampLfo * ams * 4 * TWO_24; // up to 4 octaves (-24 dB) of attenuation
      const g1 = envGain(level);
      this.gain[op] = g1;
      const inc = this.isFixed[op] ? this.baseInc[op] : this.baseInc[op] * pitchMul;
      const input = this.bus[op];
      const targets = this.targets[op];
      const isCarrier = this.carrier[op];
      let phase = this.phase[op];
      const dg = (g1 - g0) / N;
      let g = g0;
      if (op === fbOp && this.fbScale) {
        let [y0, y1] = this.fb;
        for (let i = 0; i < N; i++) {
          g += dg;
          const y = g * sine(phase + input[i] + (y0 + y1) * 0.5 * this.fbScale);
          y0 = y1;
          y1 = y;
          phase += inc;
          for (const t of targets) this.bus[t][i] += y;
          if (isCarrier) this.out[i] += y;
        }
        this.fb = [y0, y1];
      } else {
        for (let i = 0; i < N; i++) {
          g += dg;
          const y = g * sine(phase + input[i]);
          phase += inc;
          for (const t of targets) this.bus[t][i] += y;
          if (isCarrier) this.out[i] += y;
        }
      }
      this.phase[op] = phase - Math.floor(phase);
    }
    this.t += N;
    this.blockPos = 0;
  }
  /** Add n samples of output into dest starting at offset. */
  renderInto(dest, offset, n, gain = 1) {
    for (let i = 0; i < n; i++) {
      if (this.blockPos >= N) this.block();
      dest[offset + i] += this.out[this.blockPos++] * gain;
    }
  }
}

/**
 * Render one note offline: held for `hold` seconds, then released for `tail` seconds.
 * Output is raw carrier sum (full-scale single carrier = 2.0).
 */
export function renderNote(voice, { note = 60, velocity = 100, sampleRate = 22050, hold = 1.5, tail = 1 } = {}) {
  const holdN = Math.round((hold * sampleRate) / N) * N;
  const total = holdN + Math.round((tail * sampleRate) / N) * N;
  const out = new Float32Array(total);
  const fm = new FmNote(voice, note, velocity, sampleRate);
  const tmp = new Float64Array(total);
  fm.renderInto(tmp, 0, holdN);
  fm.release();
  fm.renderInto(tmp, holdN, total - holdN);
  out.set(tmp);
  return { samples: out, sampleRate, releaseAt: holdN, f0: midiHz(fm.note) };
}
