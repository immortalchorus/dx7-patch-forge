// Survey a pile of DX7 cartridges and report what real patches actually do.
//
// This is a research tool, not part of the app. It reads .syx files with the app's own parser
// and reports distributions: which algorithms get used, what ratios modulators sit at, how
// envelopes are shaped, how often scaling, feedback, fixed frequencies and the pitch envelope
// appear. The point is to ground new controls in what programmers really vary, and to check
// the ones we have against a large body of work rather than a handful of library voices.
//
//   node tools/survey.mjs <directory> [sampleSize]
//
// It reads the patches; it does not copy them anywhere or ship them.

import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { readDx7File, operatorRoles, opRatio, opFixedHz, ALGORITHMS } from "../dist/js/dx7.js";

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** True when this file was run directly, rather than imported. Paths with spaces need the URL decoded. */
const runAsScript = () => process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** Voices from every readable .syx under a directory, de-duplicated by content. */
export async function loadCorpus(dir) {
  const voices = [];
  const seen = new Set();
  let files = 0, unreadable = 0, checksumErrors = 0;
  for await (const path of walk(dir)) {
    if (![".syx", ".SYX", ".bin", ".dx7"].includes(extname(path))) continue;
    files++;
    try {
      const r = readDx7File(new Uint8Array(await readFile(path)));
      checksumErrors += r.checksumErrors;
      for (const v of r.voices) {
        const key = JSON.stringify(v);
        if (seen.has(key)) continue;
        seen.add(key);
        voices.push(v);
      }
    } catch {
      unreadable++;
    }
  }
  return { voices, files, unreadable, checksumErrors };
}

const pct = (n, total) => `${((100 * n) / (total || 1)).toFixed(1)}%`;
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

/** One voice's measurable habits, in the terms the controls use. */
export function describeVoice(v) {
  const roles = operatorRoles(v.algorithm);
  const alg = ALGORITHMS[v.algorithm];
  const live = v.ops.map((o) => o.level > 0);
  const carriers = alg.carriers.filter((c) => live[c - 1]);
  const mods = roles.filter((r) => !r.carrier && live[r.op - 1]);
  const ratios = mods.filter((r) => !v.ops[r.op - 1].mode).map((r) => opRatio(v.ops[r.op - 1]));
  const anyOp = (fn) => v.ops.some((o, i) => live[i] && fn(o));
  // A second, slower decay after a fast one: the shape behind electric pianos and bells.
  const doubleDecay = v.ops.filter((o, i) => live[i] && o.levels[0] - o.levels[1] > 25 && o.levels[1] - o.levels[2] < 15 && o.levels[1] > 15).length;
  return {
    algorithm: v.algorithm,
    carriers: carriers.length,
    activeOps: live.filter(Boolean).length,
    feedback: v.feedback,
    feedbackHeard: v.feedback > 0,
    ratios,
    highRatio: ratios.filter((x) => x >= 6).length, // tine-like
    lowRatio: ratios.filter((x) => x < 1).length, // sub-harmonic, growl
    fixed: v.ops.filter((o, i) => live[i] && o.mode === 1).length,
    fixedHz: v.ops.filter((o, i) => live[i] && o.mode === 1).map(opFixedHz),
    detuned: v.ops.filter((o, i) => live[i] && o.detune !== 7).length,
    scaling: anyOp((o) => o.leftDepth > 0 || o.rightDepth > 0),
    breakpoints: v.ops.filter((o, i) => live[i] && (o.leftDepth > 0 || o.rightDepth > 0)).map((o) => o.breakpoint),
    rateScaling: anyOp((o) => o.rateScaling > 0),
    velocity: v.ops.filter((o, i) => live[i] && o.velSens > 0).length,
    ams: anyOp((o) => o.ams > 0),
    doubleDecay,
    pitchEg: v.pitchEg.levels.some((l) => l !== 50),
    lfoPitch: v.lfo.pmd > 0 && v.lfo.pms > 0,
    lfoAmp: v.lfo.amd > 0,
    lfoDelay: v.lfo.delay,
    oscKeySync: v.oscKeySync,
    transposed: v.transpose !== 24,
  };
}

export function summarise(voices) {
  const d = voices.map(describeVoice);
  const n = d.length;
  const count = (fn) => d.filter(fn).length;
  const algs = {};
  for (const x of d) algs[x.algorithm] = (algs[x.algorithm] || 0) + 1;
  const topAlgs = Object.entries(algs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([a, c]) => `${a} (${pct(c, n)})`);
  const allRatios = d.flatMap((x) => x.ratios);
  const ratioHist = {};
  for (const r of allRatios) {
    const k = r < 1 ? "<1" : r < 2 ? "1–2" : r < 4 ? "2–4" : r < 8 ? "4–8" : r < 16 ? "8–16" : "16+";
    ratioHist[k] = (ratioHist[k] || 0) + 1;
  }
  return {
    voices: n,
    algorithms: { distinct: Object.keys(algs).length, top: topAlgs },
    carriers: { median: median(d.map((x) => x.carriers)), one: pct(count((x) => x.carriers === 1), n), threePlus: pct(count((x) => x.carriers >= 3), n) },
    activeOps: { median: median(d.map((x) => x.activeOps)), allSix: pct(count((x) => x.activeOps === 6), n) },
    feedback: { used: pct(count((x) => x.feedback > 0), n), median: median(d.filter((x) => x.feedback > 0).map((x) => x.feedback)) },
    modulatorRatios: Object.fromEntries(Object.entries(ratioHist).map(([k, c]) => [k, pct(c, allRatios.length)])),
    highRatioVoices: pct(count((x) => x.highRatio > 0), n),
    lowRatioVoices: pct(count((x) => x.lowRatio > 0), n),
    fixedFrequency: { voices: pct(count((x) => x.fixed > 0), n), medianHz: median(d.flatMap((x) => x.fixedHz)) },
    detune: pct(count((x) => x.detuned > 0), n),
    keyboardLevelScaling: { used: pct(count((x) => x.scaling), n), medianBreakpoint: median(d.flatMap((x) => x.breakpoints)) },
    rateScaling: pct(count((x) => x.rateScaling), n),
    velocitySensitivity: pct(count((x) => x.velocity > 0), n),
    ampModSensitivity: pct(count((x) => x.ams), n),
    doubleDecayEnvelopes: pct(count((x) => x.doubleDecay > 0), n),
    pitchEnvelope: pct(count((x) => x.pitchEg), n),
    lfo: { pitch: pct(count((x) => x.lfoPitch), n), amplitude: pct(count((x) => x.lfoAmp), n), medianDelay: median(d.map((x) => x.lfoDelay)) },
    oscKeySync: pct(count((x) => x.oscKeySync), n),
    transposed: pct(count((x) => x.transposed), n),
  };
}

if (runAsScript()) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node tools/survey.mjs <directory>");
    process.exit(1);
  }
  const { voices, files, unreadable, checksumErrors } = await loadCorpus(dir);
  console.log(`read ${files} files, ${voices.length} distinct voices (${unreadable} unreadable, ${checksumErrors} checksum warnings)\n`);
  console.log(JSON.stringify(summarise(voices), null, 2));
}
