// Sound-design moves that know the algorithm: brightness lives in modulator output levels,
// loudness contour lives in carrier envelopes. Every function mutates and returns the voice.

import { ALGORITHMS, operatorRoles, opRatio, clamp } from "./dx7.js";
import { Env, LFO_HZ, lfoDelaySeconds, PITCH_LEVEL, pitchOctPerSecond } from "./render.js";
import { analyzeLayers, freeOperator, makeHammer, fixedFor, isHammer } from "./layers.js";

const roles = (v) => operatorRoles(v.algorithm);
const carriers = (v) => roles(v).filter((r) => r.carrier).map((r) => v.ops[r.op - 1]);
// Hammer operators are their own layer; general brightness and envelope edits leave them alone.
const activeModulators = (v) => roles(v).filter((r) => !r.carrier && v.ops[r.op - 1].level > 0 && !isHammer(v.ops[r.op - 1]));

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

// Rising DX7 segments move far faster than falling ones at the same rate, so segment timing
// is simulated rather than derived from the fall slope. Tables are cached per level pair.
const segmentTables = new Map();
function segmentSeconds(from, to) {
  const key = `${from}>${to}`;
  if (!segmentTables.has(key)) {
    segmentTables.set(key, Array.from({ length: 100 }, (_, rate) => {
      const e = new Env([99, rate, 99, 99], [from, to, to, 0], 127 << 5, 0, 44100);
      while (e.ix === 0) e.next();
      let blocks = 0;
      while (e.ix === 1 && blocks < 200000) e.next(), blocks++;
      return Math.max((blocks * 64) / 44100, 1e-4);
    }));
  }
  return segmentTables.get(key);
}
/** Rate that moves an envelope from level `from` to `to` in about `seconds`. */
export const rateForSegment = (from, to, seconds) => (from === to ? 99 : nearestRate((r) => segmentSeconds(from, to)[r], Math.max(seconds, 1e-4)));

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

/** Relative move: x > 0 goes from a toward max, x < 0 goes from a toward 0. */
const rel = (a, x, max) => (x >= 0 ? a + (max - a) * x : a * (1 + x));

/**
 * Shift the carriers' output level by `db` (0.75 dB per level step). Carriers only change
 * loudness, not timbre, except a carrier that also feeds back on itself: its feedback
 * weakens as its level drops, so feedback is raised one step per 6 dB to compensate.
 */
export function carrierGain(v, db) {
  const steps = Math.round(db / 0.75);
  if (!steps) return v;
  const rs = roles(v);
  const fbRole = rs[ALGORITHMS[v.algorithm].fb - 1];
  for (const r of rs) {
    const o = v.ops[r.op - 1];
    if (r.carrier && o.level > 0) o.level = clamp(o.level + steps, 1, 99);
  }
  if (fbRole.carrier && v.feedback) v.feedback = clamp(v.feedback - Math.round((steps * 0.75) / 6), 0, 7);
  return v;
}

/** Hollow (x < 0): main modulators at twice their carrier's ratio (odd harmonics). Full (x > 0): same ratio (every harmonic). */
export function setBody(v, x) {
  if (Math.abs(x) < 0.15) return v;
  const rs = roles(v);
  for (const c of rs.filter((r) => r.carrier && v.ops[r.op - 1].mode === 0 && v.ops[r.op - 1].level > 0)) {
    const carrier = v.ops[c.op - 1];
    const mods = rs
      .filter((r) => r.targets.includes(c.op) && v.ops[r.op - 1].level > 0 && v.ops[r.op - 1].mode === 0)
      .sort((p, q) => v.ops[q.op - 1].level - v.ops[p.op - 1].level);
    for (const m of mods.slice(0, Math.abs(x) > 0.6 ? mods.length : 1)) setRatio(v.ops[m.op - 1], opRatio(carrier) * (x < 0 ? 2 : 1));
  }
  return v;
}

/**
 * Brightness over time, shaped in the modulator envelopes. The four DX7 stages are used as
 *   L4 -> L1  attack bite (a spike above the starting brightness)
 *   L1 -> L2  settle quickly to the starting brightness
 *   L2 -> L3  move slowly to the ending brightness (timbre over time)
 * evolve: +1 dark->bright, -1 bright->dark. evolveTime: -1 about 0.3 s, +1 about 6 s.
 * bark: +1 adds a strong spike, -1 removes any existing one. `depth` scales the evolve
 * swing so the designer can search it against measurement.
 */
export function shapeModulators(v, { evolve = 0, evolveTime = 0, bark = 0 }, depth = 1) {
  if (Math.abs(evolve) < 0.05 && Math.abs(bark) < 0.05) return v;
  const seconds = 0.3 * 20 ** ((evolveTime + 1) / 2);
  const swing = 32 * Math.abs(evolve) * depth;
  for (const m of activeModulators(v)) {
    const o = v.ops[m.op - 1];
    const weight = m.depth === 1 ? 1 : 0.7;
    let [l1, l2, l3] = o.levels;
    const spike0 = Math.max(0, l1 - l2);
    const w = Math.round(swing * weight);
    if (Math.abs(evolve) >= 0.05 && w > 0) {
      const settled = Math.max(l2, l3);
      // Swing around the current level, half darker and half brighter, so mellow voices with
      // quiet modulators can still open up. Levels above 99 are handled below.
      const dark = Math.max(0, settled - Math.ceil(w / 2)), bright = settled + Math.floor(w / 2);
      [l2, l3] = evolve > 0 ? [dark, bright] : [bright, dark];
      o.rates[2] = rateForSegment(clamp(l2, 0, 99), clamp(l3, 0, 99), seconds);
      // Reach the starting brightness promptly; a slow first stage would swallow the movement.
      o.rates[0] = Math.max(o.rates[0], 75);
    }
    const spike = bark > 0 ? Math.max(spike0, Math.round(30 * bark * weight)) : Math.round(spike0 * (1 + Math.min(0, bark)));
    l1 = l2 + spike;
    if (bark > 0) {
      o.rates[0] = 99;
      o.rates[1] = clamp(68 - 14 * bark, 1, 99); // a bigger bite also lasts a little longer
      o.velSens = clamp(o.velSens + 2 * bark, 0, 7);
    }
    // Keep levels in range by trading envelope level for output level (both 0.75 dB a step).
    const shift = Math.min(Math.max(0, Math.max(l1, l2, l3) - 99), 99 - o.level);
    o.level += shift;
    o.levels = [l1 - shift, l2 - shift, l3 - shift, o.levels[3]].map((x) => clamp(x, 0, 99));
  }
  return v;
}

const lfoSpeedFor = (hz) => LFO_HZ.reduce((best, x, i) => (Math.abs(x - hz) < Math.abs(LFO_HZ[best] - hz) ? i : best), 0);
const lfoDelayFor = (s) => {
  let best = 0;
  for (let d = 0; d < 100; d++) if (Math.abs(lfoDelaySeconds(d) - s) < Math.abs(lfoDelaySeconds(best) - s)) best = d;
  return best;
};
const AMS = [0, 0.259, 0.427, 1];
const PMS = [0, 10, 20, 33, 55, 92, 153, 255];
const nearestAms = (depth) => AMS.reduce((best, x, i) => (Math.abs(x - depth) < Math.abs(AMS[best] - depth) ? i : best), 0);

/** Current LFO effects: vibrato in cents, tremolo and timbre-wobble depth 0..1, rate and delay. */
export function lfoState(v) {
  const rs = roles(v);
  const amd = v.lfo.amd / 99;
  const maxAms = (isCarrier) =>
    Math.max(0, ...rs.filter((r) => r.carrier === isCarrier && v.ops[r.op - 1].level > 0).map((r) => AMS[v.ops[r.op - 1].ams]));
  return {
    cents: 1200 * (v.lfo.pmd / 99) * (PMS[v.lfo.pms] / 255),
    tremolo: amd * maxAms(true),
    wobble: amd * maxAms(false),
    hz: LFO_HZ[v.lfo.speed],
    delay: lfoDelaySeconds(v.lfo.delay),
  };
}

/**
 * The single DX7 LFO. Vibrato is pitch depth; tremolo is amplitude depth on carriers; timbre
 * wobble is the same amplitude LFO on modulators. All three share rate and delay.
 */
export function setMovement(v, { vibrato = 0, tremolo = 0, wobble = 0, lfoRate = 0, onset = 0 }) {
  const s = lfoState(v);
  const wasIdle = !s.cents && !s.tremolo && !s.wobble;
  const cents = rel(s.cents, vibrato, Math.max(s.cents, 50));
  const trem = rel(s.tremolo, tremolo, Math.max(s.tremolo, 0.6));
  const wob = rel(s.wobble, wobble, Math.max(s.wobble, 0.8));
  if (vibrato) {
    v.lfo.pms = cents > 150 ? 5 : 3;
    v.lfo.pmd = clamp((cents / (1200 * (PMS[v.lfo.pms] / 255))) * 99, 0, 99);
  }
  if (tremolo || wobble) {
    const amd = Math.max(trem, wob);
    v.lfo.amd = clamp(amd * 99, 0, 99);
    for (const r of roles(v)) {
      const o = v.ops[r.op - 1];
      if (o.level) o.ams = amd > 0 ? nearestAms((r.carrier ? trem : wob) / amd) : 0;
    }
  }
  if (wasIdle && (v.lfo.pmd || v.lfo.amd)) {
    // A fresh LFO gets a musical default: about 5.5 Hz sine, free-running.
    v.lfo.speed = lfoSpeedFor(5.5);
    v.lfo.wave = 4;
    v.lfo.sync = 0;
  }
  if (lfoRate) v.lfo.speed = lfoSpeedFor(Math.min(30, Math.max(0.1, LFO_HZ[v.lfo.speed] * 4 ** lfoRate)));
  if (onset) v.lfo.delay = lfoDelayFor(rel(s.delay, onset, Math.max(s.delay, 3)));
  return v;
}

const pitchRateFor = (octPerSecond) => {
  let best = 0;
  for (let r = 0; r < 100; r++)
    if (Math.abs(Math.log(pitchOctPerSecond(r) / octPerSecond)) < Math.abs(Math.log(pitchOctPerSecond(best) / octPerSecond))) best = r;
  return best;
};

/**
 * Scoop into pitch from below at note-on and/or fall away at key-up. The DX7 pitch envelope
 * starts and ends at level L4, so both gestures share one depth.
 */
export function setPitchShape(v, { scoop = 0, scoopTime = 0, fall = 0 }) {
  if (Math.abs(scoop) < 0.05 && Math.abs(fall) < 0.05) return v;
  const eg = v.pitchEg;
  const depth0 = Math.max(0, 50 - eg.levels[3]);
  let depth = Math.round(rel(depth0, scoop, Math.max(depth0, 12)));
  if (fall > 0) depth = Math.max(depth, Math.round(8 * fall));
  eg.levels = [50, 50, 50, 50 - depth];
  if (!depth) {
    eg.rates = [99, 99, 99, 99];
    return v;
  }
  const oct = Math.abs(PITCH_LEVEL[50 - depth] / 32);
  const scoopSeconds = scoop > 0 ? 0.04 * 12 ** ((scoopTime + 1) / 2) : 0.001;
  const fallSeconds = fall > 0 ? 0.9 - 0.8 * fall : 3 - 2 * fall;
  eg.rates = [pitchRateFor(oct / scoopSeconds), 99, 99, pitchRateFor(oct / fallSeconds)];
  return v;
}

/** Velocity response: modulators (brightness) and carriers (volume). */
export function setVelocity(v, { velBright = 0, velLoud = 0 }) {
  for (const r of roles(v)) {
    const o = v.ops[r.op - 1];
    const x = r.carrier ? velLoud : velBright;
    if (x) o.velSens = clamp(rel(o.velSens, x, 7), 0, 7);
  }
  return v;
}

/** Keyboard level scaling on the modulators: x < 0 darkens high notes, x > 0 brightens them. */
export function setKeyTracking(v, x) {
  if (Math.abs(x) < 0.05) return v;
  for (const m of activeModulators(v)) {
    const o = v.ops[m.op - 1];
    o.breakpoint = 39;
    o.rightCurve = x < 0 ? 1 : 2;
    o.rightDepth = clamp(60 * Math.abs(x), 0, 99);
  }
  return v;
}

/** Envelope rate scaling: higher notes run their envelopes faster. */
export function setRateScaling(v, x) {
  if (Math.abs(x) < 0.05) return v;
  for (const o of v.ops) if (o.level) o.rateScaling = clamp(rel(o.rateScaling, x, 7), 0, 7);
  return v;
}

/** Carrier sustain level while held. */
export function setSustain(v, x) {
  if (Math.abs(x) < 0.05) return v;
  for (const o of carriers(v)) o.levels[2] = clamp(rel(o.levels[2], x, 99), 0, 99);
  return v;
}

// ---------------------------------------------------------------- layer edits
// These act on one layer at a time (see layers.js and docs/research.md): the tine, the
// sustain body, the hammer, and the chorus between parallel towers.

const tineOps = (v) => analyzeLayers(v).tine.map((n) => v.ops[n - 1]);

/** Tine level: output level of the tine modulators (Power DX7 tunes 58-80). */
export function setTineLevel(v, x) {
  for (const o of tineOps(v)) o.level = clamp(o.level + 14 * x, 30, 92);
  return v;
}

/** Tine pitch: a lower ratio keeps the tine audible higher up the keyboard (12 vs 14). */
export function setTinePitch(v, x) {
  for (const o of tineOps(v)) {
    const ratio = Math.round(opRatio(o) * 2 ** (0.35 * x));
    o.coarse = clamp(ratio, 5, 24);
    o.fine = 0;
  }
  return v;
}

/** Tine touch: velocity sensitivity of the tine alone, so hard playing gets the metallic edge. */
export function setTineTouch(v, x) {
  for (const o of tineOps(v)) o.velSens = clamp(rel(o.velSens, x, 7), 0, 7);
  return v;
}

/** Sustain tone, soft to sawtooth: feedback and modulation in the sustain layers only. */
export function setSustainTone(v, x) {
  const L = analyzeLayers(v);
  for (const n of L.sustain) {
    const o = v.ops[n - 1];
    o.level = clamp(o.level + 8 * x, 20, 92);
  }
  if (L.sustain.includes(L.feedbackOp) || L.towers.some((t) => t.role !== "tine" && t.ops.includes(L.feedbackOp)))
    v.feedback = clamp(v.feedback + 3 * x, 0, 7);
  return v;
}

/** Balance between the attack (tine) towers and the sustain towers, via their carrier levels. */
export function setLayerBalance(v, x) {
  const L = analyzeLayers(v);
  for (const t of L.towers) {
    const o = v.ops[t.carrier - 1];
    if (!o.level) continue;
    if (t.role === "tine") o.level = clamp(o.level + 8 * Math.min(0, x) + 4 * Math.max(0, x), 40, 99);
    else if (t.role !== "hammer") o.level = clamp(o.level - 8 * Math.max(0, x) - 4 * Math.min(0, x), 40, 99);
  }
  return v;
}

/**
 * Chorus smoothness. Detuning a modulator gives wobble rather than chorus (Power DX7,
 * Tomlyn), so smoother pulls modulator detune to centre; rougher spreads it.
 */
export function setChorusSmooth(v, x) {
  const mods = activeModulators(v).map((r) => v.ops[r.op - 1]).filter((o) => o.mode === 0);
  if (x > 0) for (const o of mods) o.detune = 7 + Math.round((o.detune - 7) * (1 - x));
  else mods.forEach((o, i) => (o.detune = clamp(7 + (i % 2 ? 1 : -1) * Math.round(-x * 4), 0, 14)));
  return v;
}

/**
 * Hammer layer (Power DX7; Tomlyn's Rhodes thud): a fixed-frequency operator with a single
 * fast decay. amount > 0 adds or strengthens it, freeing an operator by moving to an
 * interchangeable algorithm when none is spare; amount < 0 quietens or removes it.
 * Returns a description of any restructuring, or null.
 */
export function setHammer(v, { hammer = 0, hammerPitch = 0, hammerTouch = 0 }) {
  if (!hammer && !hammerPitch && !hammerTouch) return null;
  let L = analyzeLayers(v);
  let change = null;
  const hz = Math.max(60, Math.min(400, 158.5 * 2 ** hammerPitch));
  if (!L.hammer.length && hammer > 0) {
    const tine = L.towers.find((t) => t.role === "tine");
    const freed = freeOperator(v, L.towers.find((t) => t.role !== "tine")?.carrier);
    if (!freed) return { unavailable: "no operator can be freed without changing an existing layer" };
    const before = v.algorithm;
    Object.assign(v, freed.voice);
    makeHammer(v.ops[freed.freed - 1], { hz, level: 76 + 14 * hammer, velSens: 3 });
    change = { from: before, to: v.algorithm, freed: freed.freed, merged: freed.merged, tine: !!tine };
    L = analyzeLayers(v);
  }
  for (const n of L.hammer) {
    const o = v.ops[n - 1];
    if (hammer) o.level = hammer < 0 ? clamp(o.level * (1 + hammer), 0, 99) : change ? o.level : clamp(o.level + 10 * hammer, 0, 92);
    if (hammerPitch) Object.assign(o, fixedFor(hz));
    if (hammerTouch) o.velSens = clamp(rel(o.velSens, hammerTouch, 7), 0, 7);
  }
  return change;
}
