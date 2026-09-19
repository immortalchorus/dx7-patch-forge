// Layer analysis and restructuring.
//
// Experienced DX7 programmers think of a voice as layers ("towers"): each carrier with the
// modulators that feed it, each doing one job — a metallic tine, a sustain body, a hammer
// thump — mixed together (see docs/research.md). This module finds those layers in any voice
// and, when a new layer needs an operator, frees one by moving to an interchangeable
// algorithm that keeps the existing layers' routing.

import { ALGORITHMS, operatorRoles, opRatio, cloneVoice, clamp } from "./dx7.js";

const ratioOf = (o) => (o.mode ? 0 : opRatio(o));
/** An envelope that falls away while the key is held (L3 well below L1). */
const decays = (o) => o.levels[2] < o.levels[0] - 30;
/** A short, single-decay envelope: straight from the peak to nothing. */
const short = (o) => (o.levels[1] < 20 || o.levels[2] < 20) && o.rates[1] >= 55;
/** A hammer: fixed pitch with a short single decay. */
export const isHammer = (o) => o.mode === 1 && o.level > 0 && short(o);

/** Operators that modulate `op`, directly or through a stack. */
function feeders(alg, op) {
  const out = new Set();
  const walk = (t) => {
    for (const [from, to] of alg.edges) if (to === t && !out.has(from)) out.add(from), walk(from);
  };
  walk(op);
  return out;
}

/**
 * Describe the voice's layers.
 *   towers: one per carrier: { carrier, ops (modulators feeding it), role }
 *   tine, sustain, hammer: operators playing each role
 *   feedbackOp: the operator with the feedback loop
 */
export function analyzeLayers(voice) {
  const alg = ALGORITHMS[voice.algorithm];
  const roles = operatorRoles(voice.algorithm);
  const op = (n) => voice.ops[n - 1];
  const hammer = [], tine = [], sustain = [];
  for (const r of roles) {
    const o = op(r.op);
    if (!o.level) continue;
    if (isHammer(o)) hammer.push(r.op);
    else if (!r.carrier) {
      // A tine is a high-ratio modulator that decays quickly, relative to what it modulates.
      const target = op(r.targets[0]);
      const rel = target.mode ? ratioOf(o) : ratioOf(o) / Math.max(0.5, ratioOf(target));
      if (rel >= 5 && (decays(o) || o.rates[1] >= 45)) tine.push(r.op);
      else sustain.push(r.op);
    }
  }
  const towers = alg.carriers.map((c) => {
    const ops = [...feeders(alg, c)];
    const role = ops.some((m) => hammer.includes(m)) && ops.every((m) => hammer.includes(m)) ? "hammer"
      : ops.some((m) => tine.includes(m)) ? "tine"
      : ops.includes(alg.fb) && voice.feedback >= 5 ? "saw"
      : ops.length ? "sustain" : "sine";
    return { carrier: c, ops, role };
  });
  return { towers, tine, sustain, hammer, feedbackOp: alg.fb };
}

// Algorithms that swap with minimal change (Power DX7's interchangeability families).
export const FAMILIES = [
  [1, 2, 14, 15, 18],
  [3, 4, 10, 11, 16, 17],
  [5, 6, 7, 8, 9, 12, 13],
  [20, 21, 26, 27],
  [22, 23, 24, 25],
];
const familyOf = (a) => FAMILIES.find((f) => f.includes(a)) || [];

function* permutations(items) {
  if (items.length <= 1) return yield items;
  for (let i = 0; i < items.length; i++)
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) yield [items[i], ...rest];
}

const edgeKey = (e) => e.join(">");

/**
 * Find a routing that frees one operator to become a new modulator on a carrier, without
 * disturbing the other layers. Returns { voice, freed, target, algorithm, merged } or null.
 *
 * Tries, in order: a silent operator already modulating a carrier; then merging the two most
 * similar towers (their modulators move onto one carrier, freeing the other carrier), which
 * is how Power DX7 moves E.Piano and Tub Bells from algorithm 5 to 13.
 */
export function freeOperator(voice, preferTarget = null) {
  const alg = ALGORITHMS[voice.algorithm];
  const roles = operatorRoles(voice.algorithm);
  const silentModulator = roles.find((r) => !r.carrier && r.depth === 1 && !voice.ops[r.op - 1].level);
  if (silentModulator)
    return { voice: cloneVoice(voice), freed: silentModulator.op, target: silentModulator.targets[0], algorithm: voice.algorithm, merged: null };

  // Pairs of towers that could merge: carriers at the same pitch, preferring similar envelopes.
  const carriers = alg.carriers.filter((c) => voice.ops[c - 1].level);
  const towerOps = (c) => [...feeders(alg, c)];
  const pairs = [];
  for (const keep of carriers)
    for (const drop of carriers) {
      if (keep === drop) continue;
      const a = voice.ops[keep - 1], b = voice.ops[drop - 1];
      if (a.mode || b.mode || Math.abs(Math.log2(ratioOf(a) / ratioOf(b))) > 0.05) continue;
      // Only a tower whose modulators feed nothing else can merge cleanly.
      const mods = towerOps(drop);
      if (mods.some((m) => alg.edges.some(([f, t]) => f === m && t !== drop && !mods.includes(t)))) continue;
      const envDiff = a.rates.concat(a.levels).reduce((s, x, i) => s + Math.abs(x - b.rates.concat(b.levels)[i]), 0);
      // Never fold the tine (the layer that defines an electric piano or bell) into another.
      const tineish = (c) => towerOps(c).some((m) => ratioOf(voice.ops[m - 1]) >= 5 * Math.max(0.5, ratioOf(voice.ops[c - 1])));
      const score = envDiff + (tineish(keep) || tineish(drop) ? 400 : 0) + (preferTarget && keep !== preferTarget ? 50 : 0);
      pairs.push({ keep, drop, score });
    }
  pairs.sort((x, y) => x.score - y.score);

  const fam = familyOf(voice.algorithm);
  const algOrder = [...fam.filter((a) => a !== voice.algorithm), ...Array.from({ length: 32 }, (_, i) => i + 1).filter((a) => !fam.includes(a))];
  for (const { keep, drop } of pairs) {
    // Required routing after the merge, in the old operator numbering.
    const required = new Set();
    for (const [f, t] of alg.edges) required.add(edgeKey([f, t === drop ? keep : t]));
    required.add(edgeKey([drop, keep])); // the freed operator becomes a modulator on `keep`
    const oldCarriers = new Set(alg.carriers.filter((c) => c !== drop));
    for (const a of algOrder) {
      const cand = ALGORITHMS[a];
      if (cand.edges.length !== required.size || cand.carriers.length !== oldCarriers.size) continue;
      const newEdges = new Set(cand.edges.map(edgeKey));
      for (const perm of permutations([1, 2, 3, 4, 5, 6])) {
        // perm[i-1] = new operator number for old operator i
        const map = (o) => perm[o - 1];
        if (![...required].every((k) => newEdges.has(edgeKey(k.split(">").map(Number).map(map))))) continue;
        if (![...oldCarriers].every((c) => cand.carriers.includes(map(c)))) continue;
        // Keep the feedback loop on the same operator (or drop it if the feedback op was freed).
        const fbKept = alg.fb !== drop;
        if (fbKept && voice.feedback && map(alg.fb) !== cand.fb) continue;
        const v = cloneVoice(voice);
        v.algorithm = a;
        v.ops = [1, 2, 3, 4, 5, 6].map((newOp) => cloneVoice(voice.ops[perm.indexOf(newOp)]));
        if (!fbKept) v.feedback = 0;
        return { voice: v, freed: map(drop), target: map(keep), algorithm: a, merged: { from: drop, into: keep, map: perm } };
      }
    }
  }
  return null;
}

/**
 * Move a voice onto a different algorithm, keeping as much of its structure as possible.
 * Tries every operator permutation and keeps the one that preserves the most of what matters:
 * which operators modulate which, and which are carriers, weighted by how loud each is.
 * Returns { voice, keptEdges, lostEdges, newEdges, carrierChanges }.
 */
export function retargetAlgorithm(voice, newAlgorithm) {
  const from = ALGORITHMS[voice.algorithm];
  const to = ALGORITHMS[newAlgorithm];
  const weight = (op) => 0.3 + (voice.ops[op - 1].level / 99) * 0.7;
  let best = null;
  for (const perm of permutations([1, 2, 3, 4, 5, 6])) {
    const map = (o) => perm[o - 1];
    const newEdges = new Set(to.edges.map(edgeKey));
    let score = 0, kept = 0, lost = 0;
    for (const [f, t] of from.edges) {
      if (newEdges.has(edgeKey([map(f), map(t)]))) (score += 3 * weight(f)), kept++;
      else (score -= 2 * weight(f)), lost++;
    }
    const mappedOld = new Set(from.edges.map(([f, t]) => edgeKey([map(f), map(t)])));
    const added = to.edges.filter((e) => !mappedOld.has(edgeKey(e))).length;
    score -= added;
    let carrierChanges = 0;
    for (let op = 1; op <= 6; op++) {
      const wasCarrier = from.carriers.includes(op), isCarrier = to.carriers.includes(map(op));
      if (wasCarrier === isCarrier) score += 2 * weight(op);
      else (score -= weight(op)), carrierChanges++;
    }
    if (map(from.fb) === to.fb) score += 1;
    if (!best || score > best.score) best = { score, perm, kept, lost, added, carrierChanges };
  }
  const v = cloneVoice(voice);
  v.algorithm = newAlgorithm;
  v.ops = [1, 2, 3, 4, 5, 6].map((newOp) => cloneVoice(voice.ops[best.perm.indexOf(newOp)]));
  return { voice: v, keptEdges: best.kept, lostEdges: best.lost, newEdges: best.added, carrierChanges: best.carrierChanges };
}

/** Algorithms that swap with the given one with minimal change. */
export const interchangeableWith = (algorithm) => familyOf(algorithm).filter((a) => a !== algorithm);

/** Fixed-frequency coarse/fine for a target in Hz (10^(coarse & 3) * 10^(fine/100)). */
export function fixedFor(hz) {
  const decade = clamp(Math.floor(Math.log10(Math.max(1, hz))), 0, 3);
  return { coarse: decade, fine: clamp(100 * Math.log10(hz / 10 ** decade), 0, 99) };
}

/** Turn an operator into a hammer: fixed pitch, single fast decay (Power DX7, Tomlyn). */
export function makeHammer(o, { hz = 158.5, level = 88, velSens = 3 } = {}) {
  const f = fixedFor(hz);
  Object.assign(o, {
    mode: 1,
    coarse: f.coarse,
    fine: f.fine,
    detune: 7,
    level: clamp(level, 0, 99),
    rates: [98, 78, 50, 60],
    levels: [99, 0, 0, 0],
    velSens: clamp(velSens, 0, 7),
    rateScaling: 1,
    ams: 0,
    breakpoint: 39,
    leftDepth: 0,
    rightDepth: 0,
  });
  return o;
}
