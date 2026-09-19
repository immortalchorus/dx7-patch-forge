import test from "node:test";
import assert from "node:assert/strict";
import { tailor, LIBRARY } from "../dist/js/designer.js";
import { CONTROLS, neutralSliders } from "../dist/js/controls.js";
import { lfoDelaySeconds } from "../dist/js/render.js";

const entry = (name) => LIBRARY.find((e) => e.voice.name === name);
const ratio = (r) => r.features.late / r.features.early;

test("every control has a label, both end labels and a group", () => {
  for (const c of CONTROLS) assert.ok(c.label && c.left && c.right && c.group, c.id);
  assert.equal(new Set(CONTROLS.map((c) => c.id)).size, CONTROLS.length);
});

test("sliders are deterministic, and all-zero keeps the starting voice apart from level", () => {
  const e = entry("TINE EP");
  assert.deepEqual(tailor(e, { bright: 0.4 }).voice, tailor(e, { bright: 0.4 }).voice);
  const zero = tailor(e, neutralSliders()).voice;
  const strip = (v) => v.ops.map(({ level, ...rest }) => rest);
  assert.deepEqual(strip(zero), strip(e.voice), "only carrier levels may change");
});

test("auto-level keeps the loudest note just under the clip point", () => {
  for (const name of ["TINE EP", "BRASS SECT", "DRAWBAR", "WARM PAD"]) {
    const r = tailor(entry(name), neutralSliders());
    assert.ok(r.features.peakDb <= 0 && r.features.peakDb > -3, `${name}: ${r.features.peakDb}`);
  }
  const quieter = tailor(entry("BRASS SECT"), { level: -0.5 });
  assert.ok(quieter.features.peakDb < -10);
});

test("timbre over time moves brightness in the chosen direction, monotonically", () => {
  for (const name of ["BRASS SECT", "STRINGS", "TINE EP"]) {
    const e = entry(name);
    const r = [-1, -0.5, 0, 0.5, 1].map((x) => ratio(tailor(e, { evolve: x })));
    for (let i = 1; i < r.length; i++) assert.ok(r[i] > r[i - 1], `${name}: ${r.map((x) => x.toFixed(2))}`);
  }
});

test("attack bite brightens the first moments of the note", () => {
  const e = entry("BRASS SECT");
  assert.ok(tailor(e, { bark: 1 }).features.early > tailor(e, {}).features.early * 1.5);
});

test("movement sliders set the one DX7 LFO", () => {
  const v = tailor(entry("WARM PAD"), { vibrato: 0.8, onset: 0.8 }).voice;
  assert.ok(v.lfo.pmd > 0 && lfoDelaySeconds(v.lfo.delay) > 1.5);
  const w = tailor(entry("WARM PAD"), { wobble: 1 }).voice;
  assert.ok(w.lfo.amd > 0 && w.ops.some((o) => o.ams > 0));
});

test("pitch scoop starts the note below pitch", () => {
  const v = tailor(entry("TRUMPET"), { scoop: 1 }).voice;
  assert.ok(v.pitchEg.levels[3] < 50);
  assert.deepEqual(v.pitchEg.levels.slice(0, 3), [50, 50, 50]);
});

test("hollow gives odd-harmonic 1:2 modulators", () => {
  const v = tailor(entry("WARM PAD"), { hollow: -1 }).voice;
  assert.ok(v.ops.some((o, i) => i % 2 === 1 && o.coarse === 2 && o.fine === 0));
});

test("velocity sensitivity is compensated with output level", async () => {
  const { setVelocity } = await import("../dist/js/macros.js");
  const { cloneVoice } = await import("../dist/js/dx7.js");
  const base = entry("WARM PAD").voice;
  const v = setVelocity(cloneVoice(base), { velBright: 1, velLoud: 0.5 });
  // Operators already at full level have no headroom to compensate with.
  const raised = v.ops.map((o, i) => [o, base.ops[i]]).filter(([o, b]) => o.velSens > b.velSens && b.level < 95);
  assert.ok(raised.length);
  for (const [o, b] of raised) assert.ok(o.level > b.level, "level compensates the added sensitivity");
  assert.ok(v.ops.some((o) => o.velSens === 7));
});

test("flat envelopes are eased so they do not click on hardware", async () => {
  const { avoidEnvelopeClick } = await import("../dist/js/macros.js");
  const v = { ops: [{ level: 99, rates: [99, 99, 99, 99], levels: [99, 99, 99, 0] }] };
  avoidEnvelopeClick(v);
  assert.deepEqual(v.ops[0].rates, [99, 55, 55, 99]);
  for (const { voice } of LIBRARY.map((x) => tailor(x, {}))) {
    for (const o of voice.ops)
      assert.ok(!(o.level && o.levels[0] >= 99 && o.levels[1] >= 99 && o.levels[2] >= 99 && o.rates[1] >= 95 && o.rates[2] >= 95));
  }
});
