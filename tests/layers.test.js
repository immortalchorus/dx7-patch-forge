import test from "node:test";
import assert from "node:assert/strict";
import { analyzeLayers, freeOperator, FAMILIES } from "../dist/js/layers.js";
import { ALGORITHMS } from "../dist/js/dx7.js";
import { tailor, LIBRARY, unavailableControls } from "../dist/js/designer.js";

const entry = (name) => LIBRARY.find((e) => e.voice.name === name);

test("finds the electric piano's tine, sustain and saw towers", () => {
  const L = analyzeLayers(entry("TINE EP").voice);
  assert.deepEqual(L.towers.map((t) => t.role), ["tine", "sustain", "saw"]);
  assert.deepEqual(L.tine, [2]);
});

test("adding a hammer reproduces Power DX7's algorithm 5 to 13 move", () => {
  const freed = freeOperator(entry("TINE EP").voice);
  assert.equal(freed.algorithm, 13);
  assert.equal(freed.freed, 5);
  // The freed operator now modulates a carrier, and the tine tower is untouched.
  assert.ok(ALGORITHMS[13].edges.some(([f, t]) => f === freed.freed && t === freed.target));
  assert.deepEqual(analyzeLayers(freed.voice).tine, [2]);
});

test("restructuring stays within an interchangeable family when it can", () => {
  for (const name of ["TINE EP", "SOFT RHODE", "TUBULAR", "GRAND PNO"]) {
    const v = entry(name).voice;
    const freed = freeOperator(v);
    const fam = FAMILIES.find((f) => f.includes(v.algorithm));
    assert.ok(fam.includes(freed.algorithm), `${name}: ${v.algorithm} -> ${freed.algorithm}`);
  }
});

test("a hammer that cannot be added is reported, not silently ignored", () => {
  const off = unavailableControls(entry("WURLITZER").voice);
  assert.match(off.hammer, /operator/);
  const r = tailor(entry("WURLITZER"), { hammer: 0.8 });
  assert.ok(r.applied.some((a) => a.startsWith("no hammer")));
});

test("the hammer is a fixed-pitch, fast-decaying operator in the finished voice", () => {
  const r = tailor(entry("TINE EP"), { hammer: 0.8 });
  const hammer = analyzeLayers(r.voice).hammer;
  assert.equal(hammer.length, 1);
  const o = r.voice.ops[hammer[0] - 1];
  assert.equal(o.mode, 1);
  assert.deepEqual(o.levels.slice(1, 3), [0, 0]);
});

test("layer sliders move what they claim, and the brightness search keeps the change", () => {
  const e = entry("TINE EP");
  const base = tailor(e, {});
  assert.ok(tailor(e, { tineLevel: 0.8 }).features.early > base.features.early * 1.1);
  assert.ok(tailor(e, { sustainTone: 0.8 }).features.centroid > base.features.centroid * 1.2);
  assert.ok(tailor(e, { sustainTone: -0.8 }).features.centroid < base.features.centroid * 0.85);
  const high = tailor(e, { tinePitch: 0.8 }).voice.ops[1].coarse;
  const low = tailor(e, { tinePitch: -0.8 }).voice.ops[1].coarse;
  assert.ok(high > 14 && low < 14, `${low} < 14 < ${high}`);
});

test("moving to another algorithm keeps as much routing as it can, and says what it cost", async () => {
  const { retargetAlgorithm } = await import("../dist/js/layers.js");
  const v = entry("TINE EP").voice;
  const same = retargetAlgorithm(v, 5);
  assert.equal(same.lostEdges, 0);
  assert.deepEqual(same.voice.ops, v.ops, "no reshuffle when the algorithm is unchanged");
  const to7 = retargetAlgorithm(v, 7);
  assert.equal(to7.lostEdges, 0);
  assert.equal(to7.voice.algorithm, 7);
  // Every operator is still present, just possibly renumbered.
  assert.deepEqual(to7.voice.ops.map((o) => o.coarse).sort(), v.ops.map((o) => o.coarse).sort());
  const r = tailor(entry("TINE EP"), { algorithm: 32 });
  assert.equal(r.voice.algorithm, 32);
  assert.match(r.applied[0], /algorithm 5 → 32/);
});
