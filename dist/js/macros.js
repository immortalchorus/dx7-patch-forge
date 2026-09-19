// Sound-design moves that know the algorithm: brightness lives in modulator output levels,
// loudness contour lives in carrier envelopes. Every function mutates and returns the voice.

import { operatorRoles, opRatio, clamp } from "./dx7.js";
import { Env, LFO_HZ, lfoDelaySeconds } from "./render.js";

const roles = (v) => operatorRoles(v.algorithm);
const carriers = (v) => roles(v).filter((r) => r.carrier).map((r) => v.ops[r.op - 1]);
const activeModulators = (v) => roles(v).filter((r) => !r.carrier && v.ops[r.op - 1].level > 0);

/** dB per second of a falling envelope segment at rate r (msfa timing, no rate scaling). */
export function fallDbPerSecond(r) {
  const q = (r * 41) >> 6;
  return (4 + (q & 3)) * 2 ** (q >> 2) * (6.02 / 65536) * (44100 / 64);
}

/** Seconds for a full-scale rise (L0 -> L99) at rate r. */
const RISE_TIME = Array.from({ length: 100 }, (_, r) => {
  const e = new Env([r, 99, 99, 99], [99, 99, 99, 0], 127 << 5, 0, 44100);
  let blocks = 0;
  while (e.ix === 0 && blocks < 100000) e.next(), blocks++;
  return (blocks * 64) / 44100;
});

const nearestRate = (fn, target) => {
  let best = 0, err = Infinity;
  for (let r = 0; r < 100; r++) {
    const e = Math.abs(Math.log(fn(r)) - Math.log(target));
    if (e < err) (err = e), (best = r);
  }
  return best;
};
export const rateForRise = (seconds) => nearestRate((r) => Math.max(RISE_TIME[r], 1e-4), Math.max(seconds, 1e-4));
export const rateForFall = (dbPerSecond) => nearestRate(fallDbPerSecond, dbPerSecond);

function setRatio(o, ratio) {
  if (ratio < 1) {
    o.coarse = 0;
    o.fine = clamp((ratio / 0.5 - 1) * 100, 0, 99);
  } else {
    o.coarse = clamp(Math.floor(ratio), 1, 31);
    o.fine = clamp((ratio / o.coarse - 1) * 100, 0, 99);
  }
}

/** Raise (positive) or lower modulation depth by `amount` output-level steps (0.75 dB each). */
export function brighten(v, amount) {
  const mods = activeModulators(v);
  if (mods.length) {
    for (const r of mods) {
      const o = v.ops[r.op - 1];
      o.level = clamp(o.level + amount * (r.depth === 1 ? 1 : 0.7), 1, 99);
    }
  } else {
    // All-carrier voices (drawbar organs): brightness is the balance of upper partials.
    for (const r of roles(v)) {
      const o = v.ops[r.op - 1];
      if (o.mode === 0 && opRatio(o) >= 1.5 && o.level > 0) o.level = clamp(o.level + amount * 0.8, 1, 99);
    }
  }
  return v;
}

/** Set onset time. Modulators are slowed with the carriers so brightness does not arrive first. */
export function setAttack(v, seconds) {
  const r = rateForRise(seconds);
  for (const o of carriers(v)) o.rates[0] = r;
  for (const m of activeModulators(v)) {
    const o = v.ops[m.op - 1];
    if (r < o.rates[0]) o.rates[0] = r;
  }
  return v;
}

/** Shift decay rates (R2, R3) of every operator; positive = faster decay. */
export function shiftDecay(v, delta) {
  for (const o of v.ops) {
    if (!o.level) continue;
    o.rates[1] = clamp(o.rates[1] + delta, 1, 99);
    o.rates[2] = clamp(o.rates[2] + delta, 1, 99);
  }
  return v;
}

/** Make carriers hold while the key is down. */
export function makeSustained(v) {
  for (const o of carriers(v)) {
    o.levels[2] = Math.max(o.levels[2], 90);
    o.levels[1] = Math.max(o.levels[1], 88);
  }
  return v;
}

/** Make carriers die away while held. */
export function makeDecaying(v) {
  for (const o of carriers(v)) {
    o.levels[2] = 0;
    if (o.rates[2] > 60) o.rates[2] = 40;
  }
  return v;
}

/** Time to fall 30 dB after key-up. */
export function setRelease(v, seconds) {
  const r = rateForFall(30 / seconds);
  for (const o of v.ops) if (o.level) o.rates[3] = r;
  return v;
}

const INHARMONIC = [1.41, 1.73, 2.41, 2.76, 3.14, 4.24, 5.41, 7.07, 9.42];

/** Positive: snap modulators to integer ratios and tighten detune. Negative: bend them off the series. */
export function setHarmonicity(v, h) {
  if (h > 0) {
    for (const o of v.ops) {
      if (o.mode) continue;
      if (o.fine && o.fine <= 6) o.fine = 0;
      o.detune = 7 + Math.round((o.detune - 7) * (1 - 0.6 * h));
    }
    for (const r of activeModulators(v)) {
      const o = v.ops[r.op - 1];
      if (o.mode || !o.fine) continue;
      const ratio = opRatio(o);
      setRatio(o, ratio < 1 ? 0.5 : Math.max(1, Math.round(ratio)));
    }
  } else if (h < 0) {
    const mods = activeModulators(v)
      .filter((r) => r.depth === 1 && v.ops[r.op - 1].mode === 0)
      .sort((a, b) => v.ops[b.op - 1].level - v.ops[a.op - 1].level);
    const count = h < -0.6 ? mods.length : Math.min(mods.length, h < -0.35 ? 2 : 1);
    for (const r of mods.slice(0, count)) {
      const o = v.ops[r.op - 1];
      const ratio = opRatio(o);
      const pick = INHARMONIC.reduce((a, b) => (Math.abs(Math.log(b / ratio)) < Math.abs(Math.log(a / ratio)) ? b : a));
      setRatio(o, pick);
      o.level = Math.max(o.level, 74); // quiet modulators leave the sidebands inaudible
    }
    // Strongly metallic: also move a secondary carrier off the series, which stays audible
    // even when the brightness search later lowers modulation depth.
    if (h < -0.6) {
      const cs = carriers(v).filter((o) => o.mode === 0 && o.level > 40).sort((a, b) => opRatio(a) - opRatio(b));
      if (cs.length > 1) setRatio(cs[1], opRatio(cs[1]) * 1.41);
    }
  }
  return v;
}

export function setGrit(v, g) {
  v.feedback = clamp(v.feedback + g * 5, 0, 7);
  return v;
}

const lfoSpeedFor = (hz) => LFO_HZ.reduce((best, x, i) => (Math.abs(x - hz) < Math.abs(LFO_HZ[best] - hz) ? i : best), 0);
const lfoDelayFor = (s) => {
  let best = 0;
  for (let d = 0; d < 100; d++) if (Math.abs(lfoDelaySeconds(d) - s) < Math.abs(lfoDelaySeconds(best) - s)) best = d;
  return best;
};

/** amount > 0 adds vibrato (8-45 cents), < 0 removes pitch LFO. */
export function setVibrato(v, amount) {
  if (amount <= 0) {
    v.lfo.pmd = Math.round(v.lfo.pmd * (1 + amount));
    return v;
  }
  const cents = 8 + 37 * amount;
  v.lfo.pms = 3;
  v.lfo.pmd = clamp((cents / (1200 * (33 / 255))) * 99, 1, 99);
  v.lfo.speed = lfoSpeedFor(5.5);
  v.lfo.wave = 4;
  v.lfo.delay = lfoDelayFor(0.35);
  v.lfo.sync = 0;
  return v;
}

/** amount > 0 adds amplitude tremolo on the carriers, < 0 removes it. */
export function setTremolo(v, amount) {
  if (amount <= 0) {
    v.lfo.amd = Math.round(v.lfo.amd * (1 + amount));
    return v;
  }
  v.lfo.amd = clamp(15 + 45 * amount, 0, 99);
  for (const o of carriers(v)) o.ams = Math.max(o.ams, 2);
  v.lfo.speed = lfoSpeedFor(4.5);
  v.lfo.wave = 4;
  v.lfo.delay = 0;
  return v;
}

/** Timbre that opens up over seconds: modulators start lower and swell. */
export function setEvolve(v, amount) {
  if (amount <= 0) return v;
  for (const r of activeModulators(v)) {
    const o = v.ops[r.op - 1];
    const peak = Math.max(o.levels[0], o.levels[1]);
    o.levels[0] = clamp(peak - 22 * amount, 0, 99);
    o.levels[1] = peak;
    o.levels[2] = Math.max(o.levels[2], peak - 6);
    o.rates[0] = Math.min(o.rates[0], clamp(55 - 25 * amount, 1, 99));
    o.rates[1] = Math.min(o.rates[1], clamp(30 - 12 * amount, 1, 99));
  }
  if (!v.lfo.pmd) {
    v.lfo.pmd = 3;
    v.lfo.pms = Math.max(v.lfo.pms, 3);
    v.lfo.speed = lfoSpeedFor(1.2);
    v.lfo.wave = 0;
  }
  return v;
}

export function shiftOctaves(v, octaves) {
  v.transpose = clamp(v.transpose + 12 * octaves, 0, 48);
  return v;
}

/** w > 0 spreads carrier detune for chorus; w < 0 pulls everything to centre. */
export function setWidth(v, w) {
  const cs = carriers(v).filter((o) => o.mode === 0 && o.level > 0);
  if (w > 0) {
    const spread = Math.round(1 + 3 * w);
    const pattern = [-1, 1, 0.5, -0.5, 0.25, -0.25];
    cs.forEach((o, i) => (o.detune = clamp(7 + pattern[i] * spread, 0, 14)));
  } else if (w < 0) {
    for (const o of v.ops) o.detune = 7 + Math.round((o.detune - 7) * (1 + w));
  }
  return v;
}

export function setDynamics(v, d) {
  const rs = roles(v);
  for (const r of rs) {
    const o = v.ops[r.op - 1];
    if (d > 0) o.velSens = Math.max(o.velSens, Math.round(r.carrier ? 1 + 2 * d : 3 + 4 * d));
    else o.velSens = Math.round(o.velSens * (1 + d));
  }
  return v;
}
