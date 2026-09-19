// Description -> DX7 voice.
//
// 1. Interpret the text into instrument-family evidence and signed sound dimensions.
// 2. Rank library voices by meaning (family + tags) and by how close their measured sound
//    already is to the requested direction.
// 3. For the best few, apply FM-aware edits and search the edit amounts against the
//    rendered audio until brightness, decay and attack land on their targets.
// 4. Keep the candidate whose measured sound is closest to the description.

import { cloneVoice, cleanName } from "./dx7.js";
import { interpret, stem } from "./language.js";
import { measure } from "./features.js";
import * as M from "./macros.js";
import { CORE_VOICES } from "./voices-core.js";
import { EMM_VOICES } from "./voices-emm.js";

export const LIBRARY = [...CORE_VOICES, ...EMM_VOICES];

const featureCache = new Map();
export function baseFeatures(entry) {
  if (!featureCache.has(entry.id)) featureCache.set(entry.id, measure(entry.voice));
  return featureCache.get(entry.id);
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const log = Math.log;
const SUSTAINED = 20; // decay measurements at or above this read as "holds while the key is down"

/** Per-dimension feature value on a comparable axis (positive = more of the dimension). */
function axis(f) {
  return {
    bright: log(f.centroid),
    attack: -log(f.attack + 0.004),
    decay: log(Math.min(f.decay, 30)),
    release: log(Math.max(f.release, 0.03)),
    harm: -f.inharm * 4,
    grit: f.grit * 6,
  };
}

let stats = null;
function libraryStats() {
  if (stats) return stats;
  const rows = LIBRARY.map((e) => axis(baseFeatures(e)));
  stats = {};
  for (const k of Object.keys(rows[0])) {
    const xs = rows.map((r) => r[k]);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
    stats[k] = { mean, sd };
  }
  return stats;
}

let tagFrequency = null;
/** Rare tags ("kalimba") say more than common ones ("warm"): weight by inverse frequency. */
function tagWeight(s) {
  if (!tagFrequency) {
    tagFrequency = new Map();
    for (const e of LIBRARY) for (const t of new Set(e.tags.map(stem))) tagFrequency.set(t, (tagFrequency.get(t) || 0) + 1);
  }
  return 0.6 + Math.log(LIBRARY.length / (tagFrequency.get(s) || 1)) * 0.55;
}

function semanticScore(entry, intent) {
  let score = 6 * (intent.families[entry.family] || 0);
  const tagStems = new Set(entry.tags.map(stem));
  const nameStems = new Set(entry.voice.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map(stem));
  for (const w of new Set(intent.words.map(stem))) {
    if (tagStems.has(w)) score += tagWeight(w);
    if (nameStems.has(w)) score += 2;
  }
  return score;
}

function fitScore(entry, intent) {
  const s = libraryStats();
  const a = axis(baseFeatures(entry));
  let score = 0;
  for (const k of Object.keys(a)) {
    const d = intent.dims[k] || 0;
    score += d * ((a[k] - s[k].mean) / s[k].sd);
  }
  return score * 0.9;
}

/** Search a single edit amount so that measure(edit(amount))[key] hits target (in log space). */
function solve(voice, edit, key, target, lo, hi, opts, increasing = true, steps = 7) {
  let best = { amount: 0, voice, value: null, err: Infinity };
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    const v = edit(cloneVoice(voice), mid);
    const value = measure(v, opts)[key];
    const err = Math.abs(log(value) - log(target));
    if (err < best.err) best = { amount: mid, voice: v, value, err };
    if ((value < target) === increasing) lo = mid;
    else hi = mid;
    if (err < 0.06) break;
  }
  return best;
}

/** Work out absolute targets from the base voice's measurements and the description. */
export function targetsFor(base, intent, jitter = () => 0.5) {
  const d = intent.dims;
  const j = (amt) => (jitter() - 0.5) * 2 * amt;
  const t = {};
  const brightShift = d.bright + j(0.25);
  // Darkening stops short of a bare sine unless purity was asked for, so the instrument survives.
  const floor = d.harm > 0.5 ? 1.02 : Math.max(1.1, base.centroid * 0.45);
  t.centroid = Math.max(Math.min(floor, base.centroid), Math.min(25, base.centroid * 2 ** (1.6 * brightShift)));
  if (Math.abs(d.attack) > 0.12) t.attack = Math.exp(log(1.5) + ((d.attack + 1) / 2) * (log(0.004) - log(1.5))) * (1 + j(0.15));
  if (d.decay > 0.55) t.decay = 30;
  else if (d.decay < -0.1 && base.decay >= SUSTAINED) t.decay = 1.5 * 4 ** (d.decay + 0.1) * (1 + j(0.15));
  else if (Math.abs(d.decay) > 0.1) t.decay = Math.max(0.08, Math.min(25, Math.min(base.decay, 12) * 3 ** (1.5 * d.decay)));
  if (Math.abs(d.release) > 0.1) {
    const from = base.release > 0.03 && base.release < 30 ? base.release : 0.4;
    t.release = Math.max(0.03, Math.min(12, from * 3 ** (1.5 * d.release)));
    if (d.release > 0.5) t.release = Math.max(t.release, 1.2);
  }
  return t;
}

function tailor(entry, intent, rand) {
  const base = baseFeatures(entry);
  const d = intent.dims;
  const targets = targetsFor(base, intent, rand);
  let v = cloneVoice(entry.voice);
  const applied = [];
  const note = (s) => applied.push(s);

  // Direct edits first: they change timbre, so the measured searches below run after them.
  let octaves = Math.round(d.register * 1.2);
  if (entry.family === "bass" && octaves < 0 && intent.raw.register > -1.2) octaves = 0;
  if (octaves) M.shiftOctaves(v, octaves), note(`${octaves > 0 ? "up" : "down"} ${Math.abs(octaves)} octave`);
  if (Math.abs(d.harm) > 0.2) M.setHarmonicity(v, d.harm), note(d.harm > 0 ? "purer ratios" : "inharmonic modulators");
  if (Math.abs(d.grit) > 0.15) M.setGrit(v, d.grit), note(`feedback ${v.feedback}`);
  if (Math.abs(d.width) > 0.15) M.setWidth(v, d.width), note(d.width > 0 ? "detuned carriers" : "centred tuning");
  if (Math.abs(d.dyn) > 0.15) M.setDynamics(v, d.dyn), note("velocity response");
  if (d.evolve > 0.15) M.setEvolve(v, d.evolve), note("slow modulator swell");
  if (Math.abs(d.vibrato) > 0.15) M.setVibrato(v, d.vibrato), note(d.vibrato > 0 ? "vibrato" : "less vibrato");
  if (Math.abs(d.tremolo) > 0.15) M.setTremolo(v, d.tremolo), note(d.tremolo > 0 ? "tremolo" : "less tremolo");
  if (targets.decay >= SUSTAINED && base.decay < SUSTAINED) M.makeSustained(v), note("sustains while held");
  if (targets.decay && targets.decay < SUSTAINED && (base.decay >= SUSTAINED || base.sustain > -18)) M.makeDecaying(v), note("decays while held");
  if (targets.release) M.setRelease(v, targets.release), note(`release ${targets.release.toFixed(2)} s`);
  if (targets.attack) M.setAttack(v, targets.attack);

  // Attack first (it moves where the note body is measured), then decay, then brightness.
  // The edits interact, so a second pass corrects whatever the later searches disturbed.
  // Long releases need a long enough tail to be measured rather than extrapolated.
  const full = { tail: Math.max(1.5, Math.min(10, (targets.release || 0) * 1.2)) };
  const off = (key, target) => Math.abs(log(measure(v, full)[key] / target));
  let brightTotal = 0;
  for (let pass = 0; pass < 2; pass++) {
    if (targets.attack && (pass === 0 || off("attack", targets.attack) > 0.3)) {
      const r = solve(v, (x, amt) => M.setAttack(x, targets.attack * Math.exp(amt)), "attack", targets.attack, -2.5, 2.5, full, true, 6);
      v = r.voice;
    }
    if (targets.decay && targets.decay < SUSTAINED && off("decay", targets.decay) > 0.2) {
      v = solve(v, M.shiftDecay, "decay", targets.decay, -45, 45, full, false, 6).voice;
    }
    if (targets.release && measure(v, full).release > 0 && off("release", targets.release) > 0.2) {
      v = solve(v, (x, amt) => M.setRelease(x, targets.release * Math.exp(amt)), "release", targets.release, -2.5, 2.5, full, true, 6).voice;
    }
    if (off("centroid", targets.centroid) > 0.08) {
      const r = solve(v, M.brighten, "centroid", targets.centroid, -45, 45, full, true);
      v = r.voice;
      brightTotal += r.amount;
    }
  }
  if (targets.attack) note(`attack ${(targets.attack * 1000).toFixed(0)} ms`);
  if (targets.decay && targets.decay < SUSTAINED) note(`decay ${targets.decay.toFixed(2)} s`);
  if (Math.abs(brightTotal) >= 2) note(`${brightTotal > 0 ? "more" : "less"} modulation (${brightTotal > 0 ? "+" : ""}${Math.round(brightTotal)} levels)`);

  const features = measure(v, full);
  return { entry, voice: v, features, base, targets, applied, error: targetError(features, targets, base, intent) };
}

function targetError(f, t, base, intent) {
  let e = 1.5 * log(f.centroid / t.centroid) ** 2;
  if (t.attack) e += 0.6 * log((f.attack + 0.004) / (t.attack + 0.004)) ** 2;
  if (t.decay) e += 0.5 * log(Math.min(f.decay, 30) / Math.min(t.decay, 30)) ** 2;
  if (t.release) e += 0.4 * log(Math.max(f.release, 0.03) / t.release) ** 2;
  const h = intent.dims.harm;
  if (h < -0.2) e += 3 * Math.max(0, 0.25 - f.inharm) ** 2 * 10;
  if (h > 0.2) e += 3 * Math.max(0, f.inharm - 0.05) ** 2 * 10;
  return e;
}

const DESCRIPTOR = [
  ["bright", 1, "BRT"], ["bright", -1, "DARK"], ["attack", -1, "SLOW"], ["attack", 1, "HARD"],
  ["decay", -1, "SHRT"], ["decay", 1, "LONG"], ["harm", -1, "METL"], ["harm", 1, "PURE"], ["grit", 1, "GRIT"],
  ["width", 1, "WIDE"], ["evolve", 1, "EVO"], ["vibrato", 1, "VIB"], ["release", 1, "AIRY"], ["register", -1, "DEEP"],
];

/** Short patch name: strongest descriptor + base name, max 10 characters. */
export function patchName(baseName, intent) {
  let best = null;
  for (const [dim, sign, word] of DESCRIPTOR) {
    const v = (intent.dims[dim] || 0) * sign;
    if (v > 0.3 && (!best || v > best[0])) best = [v, word];
  }
  const noun = baseName.replace(/[^A-Z0-9 ]/g, "").trim();
  if (!best) return cleanName(noun);
  const room = 10 - best[1].length - 1;
  const short = noun.split(" ").sort((a, b) => b.length - a.length)[0].slice(0, room);
  return cleanName(`${best[1]} ${short}`);
}

/**
 * Design a voice. `variation` (1-99) re-rolls the choice among close candidates and
 * nudges the targets slightly. Returns the ranked candidates, best first.
 */
export function design(prompt, { variation = 1, candidates = 6 } = {}) {
  const intent = interpret(prompt);
  const rand = rng(hash(prompt.trim().toLowerCase()) ^ Math.imul(variation, 2654435761));
  const ranked = LIBRARY.map((entry) => {
    const sem = semanticScore(entry, intent);
    const fit = fitScore(entry, intent);
    return { entry, sem, fit, pre: sem + fit + (rand() - 0.5) * 1.6 };
  }).sort((a, b) => b.pre - a.pre);

  const pool = ranked.slice(0, candidates);
  const results = pool.map((c) => {
    const r = tailor(c.entry, intent, rand);
    // Meaning dominates: a flute request should not become a brighter-matching organ.
    const score = c.sem + 0.5 * c.fit - 1.5 * Math.min(r.error, 3) + (rand() - 0.5) * 2.5;
    const name = patchName(c.entry.voice.name, intent);
    r.voice.name = name;
    return { ...r, sem: c.sem, fit: c.fit, score, name };
  });
  results.sort((a, b) => b.score - a.score);
  return { intent, results };
}

/** Fill a 32-voice cartridge: every designed candidate, then brighter/darker/detuned takes on them. */
export function cartridgeVoices(results, baseName) {
  const out = results.map((r) => r.voice);
  const variants = [
    ["+", (v) => M.brighten(v, 6)],
    ["-", (v) => M.brighten(v, -6)],
    ["W", (v) => M.setWidth(v, 0.7)],
    ["S", (v) => M.shiftDecay(v, 8)],
    ["L", (v) => M.shiftDecay(v, -8)],
  ];
  let i = 0;
  while (out.length < 32) {
    const src = results[i % results.length];
    const [tag, fn] = variants[Math.floor(i / results.length) % variants.length];
    const v = fn(cloneVoice(src.voice));
    v.name = cleanName(src.voice.name.slice(0, 8).trimEnd() + " " + tag);
    out.push(v);
    i++;
  }
  out[0] = { ...out[0], name: cleanName(baseName || out[0].name) };
  return out.slice(0, 32);
}
