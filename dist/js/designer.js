// Description -> DX7 voice.
//
// 1. Interpret the text into instrument-family evidence and signed sound dimensions.
// 2. Rank library voices by meaning (family + tags) and by how close their measured sound
//    already is to the requested direction.
// 3. For the best few, apply FM-aware edits and search the edit amounts against the
//    rendered audio until brightness, decay and attack land on their targets.
// 4. Keep the candidate whose measured sound is closest to the description.

import { cloneVoice, cleanName, operatorRoles } from "./dx7.js";
import { interpret, stem } from "./language.js";
import { measure, peakLevel } from "./features.js";
import { neutralSliders, slidersFromIntent, registerOctaves } from "./controls.js";
import * as M from "./macros.js";
import { analyzeLayers, freeOperator, retargetAlgorithm, modulatorForCarrier } from "./layers.js";
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

/** Search one edit amount so that measure(view(edit(amount)))[key] hits target (in log space). */
function solve(voice, edit, key, target, lo, hi, opts, increasing = true, steps = 7, view = (v) => v) {
  let best = { amount: 0, voice, value: null, err: Infinity };
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    const v = edit(cloneVoice(voice), mid);
    const value = measure(view(v), opts)[key];
    const err = Math.abs(log(value) - log(target));
    if (err < best.err) best = { amount: mid, voice: v, value, err };
    if ((value < target) === increasing) lo = mid;
    else hi = mid;
    if (err < 0.06) break;
  }
  return best;
}

const evolveSeconds = (t) => 0.3 * 20 ** ((t + 1) / 2);

/** Absolute measurement targets from the starting voice's measurements and the sliders. */
export function targetsFor(base, s) {
  const t = {};
  const brightShift = s.bright;
  // Darkening stops short of a bare sine unless purity was asked for, so the instrument survives.
  const floor = s.harm > 0.5 ? 1.02 : Math.max(1.1, base.centroid * 0.45);
  t.centroid = Math.max(Math.min(floor, base.centroid), Math.min(25, base.centroid * 2 ** (1.6 * brightShift)));
  if (Math.abs(s.attack) > 0.12) t.attack = Math.exp(log(1.5) + ((s.attack + 1) / 2) * (log(0.004) - log(1.5)));
  if (s.decay > 0.55) t.decay = 30;
  else if (s.decay < -0.1 && base.decay >= SUSTAINED) t.decay = 1.5 * 4 ** (s.decay + 0.1);
  else if (Math.abs(s.decay) > 0.1) t.decay = Math.max(0.08, Math.min(25, Math.min(base.decay, 12) * 3 ** (1.5 * s.decay)));
  if (Math.abs(s.release) > 0.1) {
    const from = base.release > 0.03 && base.release < 30 ? base.release : 0.4;
    t.release = Math.max(0.03, Math.min(12, from * 3 ** (1.5 * s.release)));
    if (s.release > 0.5) t.release = Math.max(t.release, 1.2);
  }
  if (Math.abs(s.evolve) > 0.1) t.evolveRatio = (base.late / base.early) * 2 ** (1.6 * s.evolve);
  return t;
}

const pct = (x) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}`;

/**
 * Build a voice from a library entry and a full slider set. Deterministic: the same sliders
 * always give the same voice.
 */
export function tailor(entry, sliders, { targets: override } = {}) {
  const s = { ...neutralSliders(), ...sliders };
  const base = baseFeatures(entry);
  // Matching a recording supplies its own targets, measured from the audio rather than
  // derived from slider positions. Everything below then works the same way.
  const targets = override ? { ...targetsFor(base, s), ...override } : targetsFor(base, s);
  let v = cloneVoice(entry.voice);
  const applied = [];
  const note = (x) => applied.push(x);
  const on = (id, t = 0.1) => Math.abs(s[id]) > t;

  // Structural edits first: they change the algorithm and operator numbering.
  if (s.algorithm && s.algorithm !== v.algorithm) {
    const moved = retargetAlgorithm(v, s.algorithm);
    const was = v.algorithm;
    Object.assign(v, moved.voice);
    note(
      `algorithm ${was} → ${s.algorithm} (kept ${moved.keptEdges} of ${moved.keptEdges + moved.lostEdges} connections` +
        `${moved.newEdges ? `, ${moved.newEdges} new` : ""}${moved.carrierChanges ? `, ${moved.carrierChanges} operator role change${moved.carrierChanges > 1 ? "s" : ""}` : ""})`,
    );
  }
  // A voice with nothing modulating a carrier - the DX7's own INIT, or anything stripped back
  // by hand - has nothing for the tone controls to take hold of. Bring an operator in rather
  // than moving controls that cannot do anything.
  // Only when something is being asked for that needs a modulator. Asking for a darker sound
  // does not justify building one: there would be nothing to darken.
  const wantsTone =
    s.bright > 0.05 || s.bark > 0.05 || s.grit > 0.15 || on("harm", 0.2) || on("hollow", 0.15) || targets.centroid > base.centroid * 1.05;
  if (wantsTone) {
    const added = M.ensureModulation(v);
    if (added)
      note(
        `operator ${added.op} brought in to modulate operator ${added.target}${added.from !== added.to ? ` (algorithm ${added.from} → ${added.to})` : ""}`,
      );
  }
  const wantsTine = on("tineLevel", 0.05) || on("tinePitch", 0.05) || on("tineTouch", 0.05);
  const builtTine = wantsTine ? M.ensureTine(v, { ratio: tineRatio(s.tinePitch), level: 60 + 25 * Math.max(0, s.tineLevel) }) : null;
  if (builtTine)
    note(`tine layer built on operator ${builtTine.op}${builtTine.from !== builtTine.to ? ` (algorithm ${builtTine.from} → ${builtTine.to})` : ""}`);
  if (on("grit", 0.15)) {
    const moved = M.ensureFeedbackHeard(v);
    if (moved) note(`algorithm ${moved.from} → ${moved.to} so the feedback is heard`);
  }
  const hammerChange = M.setHammer(v, s);
  if (hammerChange?.unavailable) note(`no hammer: ${hammerChange.unavailable}`);
  else if (hammerChange)
    note(`algorithm ${hammerChange.from} → ${hammerChange.to} to free operator ${hammerChange.freed} for a hammer${hammerChange.merged ? ` (tower ${hammerChange.merged.from} merged into tower ${hammerChange.merged.into})` : ""}`);
  else if (on("hammer", 0.05) || on("hammerPitch", 0.05)) note("hammer");

  // Direct edits: they change timbre, so the measured searches below run after them.
  const octaves = registerOctaves(s.register);
  if (octaves) M.shiftOctaves(v, octaves), note(`${octaves > 0 ? "up" : "down"} ${Math.abs(octaves)} octave${Math.abs(octaves) > 1 ? "s" : ""}`);
  if (on("hollow", 0.15)) M.setBody(v, s.hollow), note(s.hollow < 0 ? "hollow 1:2 modulators" : "full 1:1 modulators");
  if (on("harm", 0.2)) M.setHarmonicity(v, s.harm), note(s.harm > 0 ? "purer ratios" : "inharmonic modulators");
  if (on("grit", 0.15)) M.setGrit(v, s.grit), note(`feedback ${v.feedback}`);
  if (on("width", 0.15)) M.setWidth(v, s.width), note(s.width > 0 ? "faster chorus" : "less chorus");
  if (on("chorusSmooth", 0.1)) M.setChorusSmooth(v, s.chorusSmooth), note(s.chorusSmooth > 0 ? "smoother chorus" : "wobblier chorus");
  // Layer edits are deliberate timbre changes: measure their effect so the overall
  // brightness search below keeps it, and only corrects side effects (such as the extra
  // modulation from merging towers when a hammer is added).
  const layerIds = ["tineLevel", "tinePitch", "sustainTone", "balance"];
  const layerEdit = layerIds.some((k) => on(k, 0.05));
  const beforeLayers = layerEdit ? measure(v).centroid : 0;
  if (on("tineLevel", 0.05) && !builtTine) M.setTineLevel(v, s.tineLevel), note(`tine ${s.tineLevel > 0 ? "louder" : "softer"}`);
  if (on("tinePitch", 0.05) && !builtTine) M.setTinePitch(v, s.tinePitch), note(`tine ratio ${analyzeLayers(v).tine.map((n) => v.ops[n - 1].coarse).join("/")}`);
  if (on("tineTouch", 0.05)) M.setTineTouch(v, s.tineTouch), note("tine velocity");
  if (on("sustainTone", 0.05)) M.setSustainTone(v, s.sustainTone), note(`sustain ${s.sustainTone > 0 ? "more sawtooth" : "softer"}`);
  if (on("balance", 0.05)) M.setLayerBalance(v, s.balance), note(`more ${s.balance > 0 ? "attack" : "sustain"}`);
  if (layerEdit) targets.centroid *= measure(v).centroid / beforeLayers;
  if (on("growl", 0.05)) M.setGrowl(v, s.growl), note(s.growl > 0 ? "sub-harmonic growl" : "no sub-harmonic");
  if (on("tail", 0.05)) M.setTail(v, s.tail), note(s.tail > 0 ? "long tail after the decay" : "single decay, no tail");
  if (on("keyTrack")) M.setKeyTracking(v, s.keyTrack), note(s.keyTrack < 0 ? "high notes darker" : "high notes brighter");
  if (on("pivot", 0.05)) M.setScalingPivot(v, s.pivot), note("scaling break point moved");
  if (on("rateKey")) M.setRateScaling(v, s.rateKey), note("rate scaling");
  if (on("velBright", 0.05) || on("velLoud", 0.05)) M.setVelocity(v, s), note("velocity response");
  if (["vibrato", "tremolo", "wobble", "lfoRate", "onset"].some((k) => on(k, 0.05))) {
    M.setMovement(v, s);
    const l = M.lfoState(v);
    const parts = [];
    if (l.cents >= 1) parts.push(`vibrato ${Math.round(l.cents)} cents`);
    if (l.tremolo > 0.01) parts.push(`tremolo ${Math.round(l.tremolo * 100)}%`);
    if (l.wobble > 0.01) parts.push(`timbre wobble ${Math.round(l.wobble * 100)}%`);
    if (parts.length) note(`${parts.join(", ")} at ${l.hz.toFixed(1)} Hz${l.delay > 0.05 ? ` after ${l.delay.toFixed(1)} s` : ""}`);
  }
  if (on("scoop", 0.05) || on("fall", 0.05)) M.setPitchShape(v, s), note("pitch envelope");
  if (targets.decay >= SUSTAINED && base.decay < SUSTAINED) M.makeSustained(v), note("sustains while held");
  if (targets.decay && targets.decay < SUSTAINED && (base.decay >= SUSTAINED || base.sustain > -18)) M.makeDecaying(v), note("decays while held");
  if (on("sustain", 0.05)) M.setSustain(v, s.sustain), note(`sustain ${pct(s.sustain)}`);
  if (targets.release) M.setRelease(v, targets.release), note(`release ${targets.release.toFixed(2)} s`);
  if (targets.attack) M.setAttack(v, targets.attack);
  if (on("bark", 0.05)) note(s.bark > 0 ? "attack bite" : "softer attack bite");

  // Modulator envelopes carry both the attack bite and timbre over time; the evolve swing is
  // searched against the measured late/early brightness ratio.
  let shapeDepth = 1;
  const shaped = () => M.shapeModulators(cloneVoice(v), s, shapeDepth);
  // Timbre movement is judged from the end of the attack to the end of a hold long enough for
  // the change to finish. Long releases need a long enough tail to be measured, not extrapolated.
  const attackEnd = Math.min(2, targets.attack ?? base.attack);
  const earlyAt = attackEnd > 0.1 ? attackEnd : 0.02;
  const hold = targets.evolveRatio ? Math.min(8, Math.max(2, earlyAt + evolveSeconds(s.evolveTime) + 0.7)) : 2;
  const full = { hold, earlyAt, tail: Math.max(1.5, Math.min(10, (targets.release || 0) * 1.2)) };
  const off = (key, target) => Math.abs(log(measure(shaped(), full)[key] / target));

  // Attack first (it moves where the note body is measured), then decay, release, timbre
  // movement and brightness. The edits interact, so a second pass corrects drift.
  let brightTotal = 0;
  const passes = targets.evolveRatio ? 3 : 2;
  for (let pass = 0; pass < passes; pass++) {
    if (targets.attack && (pass === 0 || off("attack", targets.attack) > 0.3))
      v = solve(v, (x, amt) => M.setAttack(x, targets.attack * Math.exp(amt)), "attack", targets.attack, -2.5, 2.5, full, true, 6, shapeWith(s, shapeDepth)).voice;
    if (targets.decay && targets.decay < SUSTAINED && off("decay", targets.decay) > 0.2)
      v = solve(v, M.shiftDecay, "decay", targets.decay, -45, 45, full, false, 6, shapeWith(s, shapeDepth)).voice;
    if (targets.release && measure(shaped(), full).release > 0 && off("release", targets.release) > 0.2)
      v = solve(v, (x, amt) => M.setRelease(x, targets.release * Math.exp(amt)), "release", targets.release, -2.5, 2.5, full, true, 6, shapeWith(s, shapeDepth)).voice;
    if (targets.evolveRatio) {
      const ratio = (f) => f.late / f.early;
      // Relative to this voice after the other edits (a slow attack alone changes early vs late).
      if (pass === 0) targets.evolveRatio = ratio(measure(M.shapeModulators(cloneVoice(v), { ...s, evolve: 0 }), full)) * 2 ** (1.6 * s.evolve);
      let lo = 0, hi = 2.2, best = { d: 1, err: Infinity };
      for (let i = 0; i < 6; i++) {
        const d = (lo + hi) / 2;
        const r = ratio(measure(M.shapeModulators(cloneVoice(v), s, d), full));
        const err = Math.abs(log(r / targets.evolveRatio));
        if (err < best.err) best = { d, err };
        if ((r < targets.evolveRatio) === s.evolve > 0) lo = d;
        else hi = d;
        if (err < 0.08) break;
      }
      shapeDepth = best.d;
    }
    if (off("centroid", targets.centroid) > 0.08) {
      const r = solve(v, M.brighten, "centroid", targets.centroid, -45, 45, full, true, 7, shapeWith(s, shapeDepth));
      v = r.voice;
      brightTotal += r.amount;
    }
  }
  v = M.avoidEnvelopeClick(shaped());
  if (targets.attack) note(`attack ${(targets.attack * 1000).toFixed(0)} ms`);
  if (targets.decay && targets.decay < SUSTAINED) note(`decay ${targets.decay.toFixed(2)} s`);
  if (targets.evolveRatio) note(`${s.evolve > 0 ? "opens up" : "closes down"} over ~${evolveSeconds(s.evolveTime).toFixed(1)} s`);
  if (Math.abs(brightTotal) >= 2) note(`${brightTotal > 0 ? "more" : "less"} modulation (${brightTotal > 0 ? "+" : ""}${Math.round(brightTotal)} levels)`);

  // Level last: carriers only, so the sound is unchanged apart from loudness.
  const auto = entry.autoLevel === false && !s.autoLevel ? 0 : autoLevel(v);
  const trim = s.level < 0 ? 24 * s.level : 6 * s.level;
  if (trim) M.carrierGain(v, trim);
  const peak = peakLevel(v);
  if (auto || entry.autoLevel !== false || s.autoLevel) note(`level ${auto >= 0 ? "+" : ""}${auto.toFixed(1)} dB automatic`);
  if (trim) note(`level ${trim > 0 ? "+" : ""}${trim.toFixed(1)} dB trim`);

  const features = { ...measure(v, full), peak, peakDb: 20 * Math.log10(peak / 2) };
  return { entry, voice: v, features, base, targets, applied, sliders: s, error: targetError(features, targets, s), unavailable: unavailableControls(entry.voice) };
}

// The measured searches edit the unshaped voice and re-apply the modulator shaping for each
// measurement, so shaping never compounds.
const shapeWith = (s, depth) => (v) => M.shapeModulators(cloneVoice(v), s, depth);

const tineRatio = (pitch = 0) => Math.max(6, Math.min(24, Math.round(14 + 6 * pitch)));

const HEADROOM = 2 * 10 ** (-1 / 20); // 1 dB under the level where SpaceAge and Dexed clip one voice

/** Scale carriers so the loudest note sits just under the clip point. Returns the change in dB. */
export function autoLevel(v) {
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const peak = peakLevel(v);
    if (!peak) break;
    const db = 20 * Math.log10(HEADROOM / peak);
    // Boost only as far as the loudest carrier allows; never push past headroom.
    const loudest = Math.max(...v.ops.filter((_, k) => operatorRoles(v.algorithm)[k].carrier).map((o) => o.level));
    const steps = db > 0 ? Math.min(Math.floor(db / 0.75), 99 - loudest) : Math.floor(db / 0.75);
    if (!steps) break;
    M.carrierGain(v, steps * 0.75);
    total += steps * 0.75;
  }
  return total;
}

function targetError(f, t, s) {
  let e = 1.5 * log(f.centroid / t.centroid) ** 2;
  if (t.attack) e += 0.6 * log((f.attack + 0.004) / (t.attack + 0.004)) ** 2;
  if (t.decay) e += 0.5 * log(Math.min(f.decay, 30) / Math.min(t.decay, 30)) ** 2;
  if (t.release) e += 0.4 * log(Math.max(f.release, 0.03) / t.release) ** 2;
  if (t.evolveRatio) e += 0.8 * log(f.late / f.early / t.evolveRatio) ** 2;
  if (s.harm < -0.2) e += 30 * Math.max(0, 0.25 - f.inharm) ** 2;
  if (s.harm > 0.2) e += 30 * Math.max(0, f.inharm - 0.05) ** 2;
  return e;
}

const DESCRIPTOR = [
  ["bright", 1, "BRT"], ["bright", -1, "DARK"], ["attack", -1, "SLOW"], ["attack", 1, "HARD"],
  ["decay", -1, "SHRT"], ["decay", 1, "LONG"], ["harm", -1, "METL"], ["harm", 1, "PURE"], ["grit", 1, "GRIT"],
  ["width", 1, "WIDE"], ["evolve", 1, "OPEN"], ["evolve", -1, "FADE"], ["vibrato", 1, "VIB"], ["release", 1, "AIRY"],
  ["register", -1, "DEEP"], ["hollow", -1, "HOLW"], ["bark", 1, "BITE"], ["wobble", 1, "WAH"], ["scoop", 1, "SCOP"],
];

/** Short patch name: strongest descriptor + base name, max 10 characters. */
export function patchName(baseName, sliders) {
  let best = null;
  for (const [dim, sign, word] of DESCRIPTOR) {
    const x = (sliders[dim] || 0) * sign;
    if (x > 0.3 && (!best || x > best[0])) best = [x, word];
  }
  const noun = baseName.replace(/[^A-Z0-9 ]/g, "").trim();
  if (!best) return cleanName(noun);
  const room = 10 - best[1].length - 1;
  const short = noun.split(" ").sort((a, b) => b.length - a.length)[0].slice(0, room);
  return cleanName(`${best[1]} ${short}`);
}

// Voices the user loads from a file become starting voices too, without joining the library
// that descriptions search.
const USER_ENTRIES = new Map();
export function registerEntry(entry) {
  USER_ENTRIES.set(entry.id, { family: "loaded", tags: [], source: "Loaded file", autoLevel: false, ...entry });
  featureCache.delete(entry.id);
  return USER_ENTRIES.get(entry.id);
}
export const entryById = (id) => USER_ENTRIES.get(id) || LIBRARY.find((e) => e.id === id);

/** Which layer sliders make sense for this voice: id -> reason it is unavailable. */
export function unavailableControls(voice) {
  const L = analyzeLayers(voice);
  const out = {};
  const noTine = "this voice has no tine layer, and no operator can be freed to build one";
  if (!L.tine.length && !modulatorForCarrier(voice)) for (const id of ["tineLevel", "tinePitch", "tineTouch"]) out[id] = noTine;
  if (!L.sustain.length) out.sustainTone = "this voice has no sustain layer";
  const tineTowers = L.towers.filter((t) => t.role === "tine").length;
  if (!tineTowers || tineTowers === L.towers.length) out.balance = "needs a tine tower and a separate sustain tower";
  if (!L.hammer.length && !freeOperator(voice)) {
    const why = "every operator is in use and no interchangeable algorithm frees one without changing a layer";
    out.hammer = out.hammerPitch = out.hammerTouch = why;
  }
  const ratioCarriers = L.towers.filter((t) => voice.ops[t.carrier - 1].mode === 0 && voice.ops[t.carrier - 1].level);
  if (ratioCarriers.length < 2) out.width = "chorus needs two or more parallel carriers";
  return out;
}

// A variation is a small, visible offset on a few tone sliders, so every variation can be
// seen (and undone) in the slider panel rather than hidden inside the search.
const VARY = { bright: 0.25, width: 0.3, bark: 0.25, evolve: 0.2, attack: 0.15 };
export function varySliders(sliders, variation) {
  const rand = rng(Math.imul(variation, 2654435761) ^ 0x5eed);
  const out = { ...sliders };
  for (const [id, amount] of Object.entries(VARY))
    out[id] = Math.max(-1, Math.min(1, Math.round((out[id] + (rand() - 0.5) * 2 * amount) * 20) / 20));
  return out;
}

/**
 * Design a voice. `variation` (1-99) re-rolls the choice among close candidates and
 * nudges the targets slightly. Returns the ranked candidates, best first; each carries the
 * slider set that produced it.
 */
export function design(prompt, { variation = 1, candidates = 6 } = {}) {
  const intent = interpret(prompt);
  const rand = rng(hash(prompt.trim().toLowerCase()) ^ Math.imul(variation, 2654435761));
  const ranked = LIBRARY.map((entry) => {
    const sem = semanticScore(entry, intent);
    const fit = fitScore(entry, intent);
    return { entry, sem, fit, pre: sem + fit + (rand() - 0.5) * 1.6 };
  }).sort((a, b) => b.pre - a.pre);

  const results = ranked.slice(0, candidates).map((c) => {
    const r = tailor(c.entry, varySliders(slidersFromIntent(intent, c.entry), variation), variation);
    // Meaning dominates: a flute request should not become a brighter-matching organ.
    const score = c.sem + 0.5 * c.fit - 1.5 * Math.min(r.error, 3) + (rand() - 0.5) * 2.5;
    const name = patchName(c.entry.voice.name, r.sliders);
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
