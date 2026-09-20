import test from "node:test";
import assert from "node:assert/strict";
import { defaultVoice, cloneVoice } from "../dist/js/dx7.js";
import { analyzeLayers, feedbackHeard, activeChain, modulatorForCarrier } from "../dist/js/layers.js";
import { ensureModulation, ensureTine, ensureFeedbackHeard } from "../dist/js/macros.js";
import { tailor, registerEntry, unavailableControls, LIBRARY } from "../dist/js/designer.js";

const init = () => ({ ...defaultVoice(), name: "INIT" });
const initEntry = () => registerEntry({ id: "init-" + Math.random(), voice: init() });

test("an INIT voice is one carrier and nothing else", () => {
  const v = init();
  assert.deepEqual([...activeChain(v)], [1], "only OP1 is heard");
  assert.equal(feedbackHeard(v), false, "the feedback operator is silent");
  assert.deepEqual(modulatorForCarrier(v), {
    op: 2,
    target: 1,
    voice: modulatorForCarrier(v).voice,
    algorithm: 1,
  });
});

test("asking for a brighter sound brings a modulator in, and it is heard", () => {
  const before = tailor(initEntry(), {});
  const after = tailor(initEntry(), { bright: 0.8 });
  assert.ok(before.features.centroid < 1.05, `nothing to shape to begin with: ${before.features.centroid}`);
  assert.ok(after.features.centroid > 1.8, `brightness should actually move: ${after.features.centroid}`);
  assert.match(after.applied.join("; "), /operator 2 brought in to modulate operator 1/);
  assert.ok(activeChain(after.voice).has(2), "and the new operator is part of what is heard");
});

test("asking for a darker sound does not build anything: there would be nothing to darken", () => {
  const r = tailor(initEntry(), { bright: -0.8 });
  assert.equal(r.applied.join("; ").includes("brought in"), false, r.applied.join("; "));
  assert.deepEqual([...activeChain(r.voice)], [1]);
});

test("the tine controls build a tine when the voice has none", () => {
  const r = tailor(initEntry(), { tineLevel: 0.8 });
  const L = analyzeLayers(r.voice);
  assert.equal(L.tine.length, 1, "a tine layer exists now");
  assert.match(r.applied.join("; "), /tine layer built/);
  // A tine is an attack feature: it shows up early and is gone by the body of the note.
  assert.ok(r.features.early > r.features.centroid * 1.5, `early ${r.features.early} vs body ${r.features.centroid}`);
  const o = r.voice.ops[L.tine[0] - 1];
  assert.ok(o.coarse >= 6, `a high ratio, not a 1:1 modulator: ${o.coarse}`);
  assert.equal(tailor(initEntry(), { tinePitch: 0.8 }).voice.ops[1].coarse > 14, true, "tine pitch chooses the ratio");
});

test("feedback moves to an operator that can be heard", () => {
  const r = tailor(initEntry(), { grit: 0.8 });
  assert.ok(r.voice.feedback > 0);
  assert.ok(feedbackHeard(r.voice), "feedback on a silent operator would be no use");
  assert.match(r.applied.join("; "), /algorithm 1 → 2 so the feedback is heard/);
});

test("the controls are only reported unavailable when the structure cannot be built", () => {
  const off = unavailableControls(init());
  for (const id of ["tineLevel", "tinePitch", "tineTouch"]) assert.equal(off[id], undefined, `${id} can be built`);
  // Chorus still needs two parallel carriers, which is not something a control can conjure.
  assert.match(off.width, /two or more parallel carriers/);
});

test("voices that already have structure are left alone", () => {
  // The builders must not fire on the library, or every designed patch would change.
  for (const name of ["TINE EP", "SOFT RHODE", "GRANDBRASS", "GLASS BELL"]) {
    const entry = LIBRARY.find((e) => e.voice.name === name);
    if (!entry) continue;
    const v = cloneVoice(entry.voice);
    assert.equal(ensureModulation(v), null, `${name} already has a modulator`);
    if (analyzeLayers(v).tine.length) assert.equal(ensureTine(v), null, `${name} already has a tine`);
    if (feedbackHeard(v)) assert.equal(ensureFeedbackHeard(v), null, `${name} already hears its feedback`);
    assert.deepEqual(v, entry.voice, `${name} is unchanged`);
  }
});
