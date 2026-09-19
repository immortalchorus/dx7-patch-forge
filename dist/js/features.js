// Perceptual measurements of a rendered voice. These are what the designer optimises
// against, so "bright" means a measurably higher spectral centroid rather than a guess
// about which operator levels might make it brighter.

import { operatorRoles, opRatio } from "./dx7.js";
import { renderNote, LFO_HZ } from "./render.js";

const ANALYSIS = { note: 60, velocity: 100, sampleRate: 22050, hold: 2, tail: 1.5 };
const FRAME = 256;
const FFT_SIZE = 4096;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const HANN = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));

function magnitudeSpectrum(samples, start) {
  const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) re[i] = (samples[start + i] || 0) * HANN[i];
  fft(re, im);
  const mag = new Float64Array(FFT_SIZE / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

function envelopeDb(samples) {
  const out = [];
  for (let s = 0; s + FRAME <= samples.length; s += FRAME) {
    let sum = 0;
    for (let i = s; i < s + FRAME; i++) sum += samples[i] * samples[i];
    out.push(db(Math.sqrt(sum / FRAME)));
  }
  return out;
}

/** Running maximum over +-radius frames, so chorus beating does not read as decay. */
function smoothMax(env, radius) {
  return env.map((_, i) => {
    let m = -Infinity;
    for (let j = Math.max(0, i - radius); j <= Math.min(env.length - 1, i + radius); j++) m = Math.max(m, env[j]);
    return m;
  });
}

/** Seconds for a level to fall `drop` dB from index `from`, extrapolating past the end if needed. */
function fallTime(env, from, end, drop, frameSec) {
  const ref = env[from];
  for (let i = from; i < end; i++) if (env[i] <= ref - drop) return (i - from) * frameSec;
  const span = end - from;
  if (span < 8) return 30;
  // Least-squares slope over the second half of the window.
  const a = from + Math.floor(span / 2);
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let i = a; i < end; i++) {
    const x = i * frameSec, y = env[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y; n++;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  if (!(slope < -0.5)) return 30;
  const fallen = ref - env[end - 1];
  return Math.min(30, (end - 1 - from) * frameSec + (drop - fallen) / -slope);
}

/**
 * Fundamental used as the harmonic reference, as a multiple of the played note. A 1:0.5
 * carrier/modulator pair builds a harmonic series on half the note, so this is the largest
 * sub-multiple of the lowest carrier that every active ratio-mode operator sits on.
 */
export function referenceRatio(voice) {
  const roles = operatorRoles(voice.algorithm);
  const active = voice.ops.filter((o) => o.mode === 0 && o.level > 40);
  const carriers = roles.filter((r) => r.carrier && active.includes(voice.ops[r.op - 1]));
  if (!carriers.length) return 1;
  const lowest = Math.min(...carriers.map((r) => opRatio(voice.ops[r.op - 1])));
  const ratios = active.map(opRatio);
  for (let k = 1; k <= 2; k++) {
    const base = lowest / k;
    if (ratios.every((r) => Math.abs(r / base - Math.round(r / base)) < 0.03)) return base;
  }
  return lowest;
}

/**
 * Measure a voice. Returns:
 *  centroid  spectral centroid of the note body, in multiples of the reference fundamental
 *  attack    seconds to reach within 1.5 dB of peak
 *  decay     seconds from peak to -20 dB while the key is held (30 = effectively sustained)
 *  sustain   level at the end of the hold, dB relative to peak
 *  release   seconds to fall 30 dB after key-up
 *  inharm    fraction of spectral energy away from the harmonic series (0 = perfectly harmonic)
 *  grit      fraction of energy above the 16th harmonic
 *  vibrato   peak LFO pitch depth in cents (from parameters)
 *  tremolo   peak LFO amplitude depth in dB (from parameters)
 */
export function measure(voice, opts = {}) {
  const o = { ...ANALYSIS, ...opts };
  const { samples, sampleRate, releaseAt, f0 } = renderNote(voice, o);
  const frameSec = FRAME / sampleRate;
  const raw = envelopeDb(samples);
  const releaseFrame = Math.floor(releaseAt / FRAME);
  // Smooth only within each phase so the key-up drop does not smear backwards.
  const radius = Math.round(0.12 / frameSec);
  const env = [...smoothMax(raw.slice(0, releaseFrame), radius), ...smoothMax(raw.slice(releaseFrame), radius)];
  let peak = -200, peakAt = 0;
  for (let i = 0; i < releaseFrame; i++) if (raw[i] > peak) (peak = raw[i]), (peakAt = i);
  let attackAt = 0;
  while (attackAt < peakAt && raw[attackAt] < peak - 1.5) attackAt++;
  const attack = (attackAt + 0.5) * frameSec;
  const decay = fallTime(env, peakAt, releaseFrame, 20, frameSec);
  const sustain = env[releaseFrame - 1] - peak;
  const release = env[releaseFrame - 1] < peak - 60 ? 0 : fallTime(env, releaseFrame, env.length, 30, frameSec);

  // Spectrum of the note body: a few frames starting at the attack point.
  const fRef = f0 * referenceRatio(voice);
  const binHz = sampleRate / FFT_SIZE;
  const body = new Float64Array(FFT_SIZE / 2);
  const startSample = Math.max(0, Math.min(releaseAt - FFT_SIZE, Math.round(attack * sampleRate)));
  const hop = FFT_SIZE / 2;
  let frames = 0;
  for (let s = startSample; s + FFT_SIZE <= releaseAt && frames < 4; s += hop, frames++) {
    const m = magnitudeSpectrum(samples, s);
    for (let i = 0; i < m.length; i++) body[i] += m[i];
  }
  if (!frames) {
    const m = magnitudeSpectrum(samples, 0);
    for (let i = 0; i < m.length; i++) body[i] += m[i];
  }
  let total = 0, weighted = 0, energy = 0, harmonicEnergy = 0, high = 0;
  const minBin = Math.max(1, Math.floor(20 / binHz));
  for (let i = minBin; i < body.length; i++) {
    const hz = i * binHz, m = body[i], p = m * m;
    total += m;
    weighted += m * hz;
    energy += p;
    const k = Math.round(hz / fRef);
    const tol = Math.max(1.5 * binHz, Math.min(0.03 * k * fRef, 0.25 * fRef));
    if (k >= 1 && Math.abs(hz - k * fRef) <= tol) harmonicEnergy += p;
    if (hz > 16 * f0) high += p;
  }
  const centroid = total > 0 ? weighted / total / fRef : 1;
  const l = voice.lfo;
  const PMS = [0, 10, 20, 33, 55, 92, 153, 255];
  const maxAms = Math.max(...voice.ops.map((op, i) => (operatorRoles(voice.algorithm)[i].carrier ? op.ams : 0)));
  return {
    centroid,
    attack,
    decay,
    sustain,
    release,
    inharm: energy > 0 ? 1 - harmonicEnergy / energy : 0,
    grit: energy > 0 ? high / energy : 0,
    vibrato: 1200 * (l.pmd / 99) * (PMS[l.pms] / 255),
    tremolo: (l.amd / 99) * [0, 0.259, 0.427, 1][maxAms] * 24,
    lfoHz: LFO_HZ[l.speed],
    peakDb: peak,
  };
}
