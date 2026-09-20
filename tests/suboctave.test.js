import test from "node:test";
import assert from "node:assert/strict";
import { ALGORITHMS, opRatio, cloneVoice } from "../dist/js/dx7.js";
import { setSubOctave } from "../dist/js/macros.js";
import { tailor, LIBRARY, unavailableControls, baseFeatures } from "../dist/js/designer.js";

const entry = (name) => LIBRARY.find((e) => e.voice.name === name);
const subCarriers = (v) =>
  ALGORITHMS[v.algorithm].carriers.filter((c) => {
    const o = v.ops[c - 1];
    return o.level > 0 && !o.mode && opRatio(o) <= 0.55;
  });

test("the sub-octave control adds a carrier an octave down", () => {
  const r = tailor(entry("FINGERBASS"), { subOctave: 0.8 });
  assert.ok(subCarriers(r.voice).length >= 1, "something is now sounding an octave below");
  assert.match(r.applied.join("; "), /sub-octave/);
  // It is a carrier, not a modulator: that is the whole distinction from Growl.
  const sub = r.voice.ops[subCarriers(r.voice)[0] - 1];
  assert.ok(ALGORITHMS[r.voice.algorithm].carriers.includes(subCarriers(r.voice)[0]));
  assert.ok(sub.level > 0);
});

test("turning it down removes the sub, and zero changes nothing", () => {
  const withSub = tailor(entry("FINGERBASS"), { subOctave: 0.8 }).voice;
  const quieter = cloneVoice(withSub);
  setSubOctave(quieter, -0.95);
  assert.equal(subCarriers(quieter).length, subCarriers(withSub).length - 1, "the sub-octave carrier is silenced");
  const untouched = cloneVoice(withSub);
  assert.equal(setSubOctave(untouched, 0), null);
  assert.deepEqual(untouched, withSub);
});

test("a voice with no spare carrier says so instead of doing nothing", () => {
  // TINE EP uses all three carriers of algorithm 5, and nothing it swaps into has a spare.
  assert.match(unavailableControls(entry("TINE EP").voice).subOctave, /every carrier is in use/);
  assert.equal(unavailableControls(entry("FINGERBASS").voice).subOctave, undefined);
  const r = tailor(entry("TINE EP"), { subOctave: 0.8 });
  assert.match(r.applied.join("; "), /no sub-octave/);
});

test("GRIT FUNK is in the library and is what Admiral made", () => {
  const e = entry("GRIT FUNK");
  assert.ok(e, "the patch is in the library");
  assert.equal(e.family, "bass");
  // Two carriers an octave apart is the whole point of it.
  const carriers = ALGORITHMS[e.voice.algorithm].carriers.filter((c) => e.voice.ops[c - 1].level > 0);
  const ratios = carriers.map((c) => opRatio(e.voice.ops[c - 1]));
  assert.ok(ratios.some((r) => r <= 0.55) && ratios.some((r) => r >= 0.95), `carrier ratios ${ratios}`);
  const f = baseFeatures(e);
  assert.ok(f.inharm < 0.1, "it is harmonic, which is why it sits in a mix");
  assert.ok(f.peakDb <= 0, "and it does not clip");
});
