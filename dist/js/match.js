// Matching a recording with a patch, by feature.
//
// This is the first and cheapest of the two ways to do it. It measures the recording with the
// same ruler used on every voice (features.js), finds the library voices whose measurements
// are closest, and then runs OWL's existing searches against the recording's own numbers
// instead of against slider positions. The result is a patch in the right family with the
// right envelope and brightness - a cousin of the sample, not a copy of it.
//
// What it cannot do is reproduce a spectrum partial by partial: that needs harmonic tracking
// and a search over ratios, which is the next piece of work. The literature is clear that the
// ratios have to come from analysis rather than from search (Horner 1997; Turian & Henry
// 2020), so this stays honest about being an approximation and says how close it got.

import { LIBRARY, tailor } from "./designer.js";
import { neutralSliders } from "./controls.js";
import { analyseSamples, referenceRatio } from "./features.js";
import { renderNote } from "./render.js";

const log = Math.log;
const ratio = (a, b) => log(Math.max(a, 1e-4) / Math.max(b, 1e-4)) ** 2;

// How much each measurement counts. Brightness dominates because it is what listeners judge
// first (Horner, Beauchamp & So 2006 found the first few harmonics carry most of the
// discrimination), then the envelope, then the finer texture.
const WEIGHTS = { centroid: 1.2, attack: 0.9, decay: 0.7, evolve: 0.8, inharm: 1.2, grit: 0.4, sustain: 0.3, harmonics: 6 };

/**
 * Distance between two harmonic profiles. This is the part that knows a bell from a bass:
 * both can share a brightness figure while putting their energy in entirely different
 * partials. Weighted towards the low harmonics, which is where listeners discriminate
 * (Horner, Beauchamp & So 2011 found about five terms carry most of it).
 */
function profileDistance(a = [], b = []) {
  let d = 0, weight = 0;
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    const w = 1 / (k + 1);
    d += w * ((a[k] || 0) - (b[k] || 0)) ** 2;
    weight += w;
  }
  return weight > 0 ? d / weight : 0;
}

/** Distance between two sets of measurements. 0 is identical; about 1 is a different sound. */
export function featureDistance(a, b) {
  let d = 0;
  d += WEIGHTS.centroid * ratio(a.centroid, b.centroid);
  d += WEIGHTS.attack * ratio(a.attack + 0.004, b.attack + 0.004);
  d += WEIGHTS.decay * ratio(Math.min(a.decay, 20), Math.min(b.decay, 20));
  d += WEIGHTS.evolve * ratio((a.late + 0.1) / (a.early + 0.1), (b.late + 0.1) / (b.early + 0.1));
  d += WEIGHTS.inharm * (a.inharm - b.inharm) ** 2 * 4;
  d += WEIGHTS.grit * (a.grit - b.grit) ** 2 * 4;
  if (a.sustain != null && b.sustain != null) d += WEIGHTS.sustain * ((a.sustain - b.sustain) / 40) ** 2;
  d += WEIGHTS.harmonics * profileDistance(a.harmonics, b.harmonics);
  return d;
}

/** The recording's own measurements, as targets for the searches in tailor(). */
export function targetsFromFeatures(f) {
  const targets = { centroid: Math.max(1.02, Math.min(25, f.centroid)) };
  if (f.attack > 0) targets.attack = Math.max(0.004, Math.min(1.5, f.attack));
  if (f.decay > 0) targets.decay = Math.max(0.08, Math.min(25, f.decay));
  if (f.early > 0 && f.late > 0) targets.evolveRatio = Math.max(0.2, Math.min(5, f.late / f.early));
  return targets;
}

/**
 * A voice measured under the recording's own conditions: the same note, the same length, and
 * held throughout, because a recording has no key-release for the analysis to find. Measuring
 * a candidate the usual way instead compares a note that was let go against one that was not,
 * which put a voice nearly three units of distance away from itself.
 */
export function measureAsRecording(voice, { seconds = 2, note = 60, sampleRate = 22050 } = {}) {
  const rendered = renderNote(voice, { note, velocity: 100, hold: seconds, tail: 0, sampleRate });
  return analyseSamples({
    samples: rendered.samples,
    sampleRate: rendered.sampleRate,
    releaseAt: rendered.samples.length,
    f0: rendered.f0,
    fRef: rendered.f0 * referenceRatio(voice),
  });
}

const measured = new Map();
/** Cached, because a match measures every voice in the library against one recording. */
function candidateFeatures(entry, conditions) {
  const key = `${entry.id}|${conditions.note}|${conditions.seconds.toFixed(2)}`;
  if (!measured.has(key)) measured.set(key, measureAsRecording(entry.voice, conditions));
  return measured.get(key);
}

/** Sliders that point in the right direction before the measured searches take over. */
function startingSliders(base, target) {
  const s = neutralSliders();
  // Texture is not something the searches chase, so set it from the measurement directly.
  const inharmGap = target.inharm - base.inharm;
  if (Math.abs(inharmGap) > 0.08) s.harm = Math.max(-1, Math.min(1, -inharmGap * 3));
  const gritGap = target.grit - base.grit;
  if (gritGap > 0.05) s.grit = Math.min(1, gritGap * 4);
  return s;
}

/**
 * Patches that sound as close to the recording as feature matching can get.
 * `target` is the measurement of the recording (features.js analyseSamples).
 * Returns candidates best first, each carrying how close it ended up.
 */
export function match(target, { candidates = 5, library = LIBRARY, seconds = 2, note = 60, sampleRate = 22050 } = {}) {
  const conditions = { seconds: Math.max(0.3, Math.min(6, seconds)), note, sampleRate };
  const targets = targetsFromFeatures(target);
  const ranked = library
    .map((entry) => ({ entry, base: candidateFeatures(entry, conditions), }))
    .map((c) => ({ ...c, distance: featureDistance(c.base, target) }))
    .sort((a, b) => a.distance - b.distance);

  const results = ranked.slice(0, candidates).map(({ entry, base, distance }) => {
    const r = tailor(entry, startingSliders(base, target), { targets });
    // Score the finished patch the same way: under the recording's conditions, not the
    // designer's. Otherwise the ranking rewards voices that measure well when let go.
    const after = featureDistance(measureAsRecording(r.voice, conditions), target);
    return { ...r, startedFrom: entry.voice.name, family: entry.family, before: distance, distance: after };
  });
  results.sort((a, b) => a.distance - b.distance);
  return { targets, results };
}

/**
 * How the match went, in words rather than a number, and what it could not do. Being straight
 * about this matters: a patch that is merely in the same family should not be presented as a
 * copy of the recording.
 */
export function describeMatch(target, features) {
  const d = featureDistance(target, features);
  const quality = d < 0.05 ? "very close" : d < 0.15 ? "close" : d < 0.4 ? "in the same family" : "roughly similar";
  const gaps = [];
  const off = (name, a, b, tol = 0.25) => {
    if (Math.abs(log(Math.max(a, 1e-4) / Math.max(b, 1e-4))) > tol) gaps.push(name);
  };
  off("brightness", features.centroid, target.centroid);
  off("attack", features.attack + 0.004, target.attack + 0.004, 0.5);
  off("decay", Math.min(features.decay, 20), Math.min(target.decay, 20), 0.5);
  if (target.inharm - features.inharm > 0.15) gaps.push("the clangy, non-harmonic part");
  if (target.grit - features.grit > 0.1) gaps.push("the very top of the spectrum");
  return { distance: d, quality, gaps };
}
