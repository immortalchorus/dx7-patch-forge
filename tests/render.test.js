import test from "node:test";
import assert from "node:assert/strict";
import { renderNote } from "../dist/js/render.js";
import { measure } from "../dist/js/features.js";
import { defaultVoice } from "../dist/js/dx7.js";
import { fallDbPerSecond, rateForRise } from "../dist/js/macros.js";

test("a single carrier sounds at the played pitch", () => {
  const { samples, sampleRate } = renderNote(defaultVoice(), { note: 69, hold: 0.5, tail: 0 });
  let crossings = 0;
  for (let i = 2000; i < samples.length; i++) if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
  const hz = crossings / ((samples.length - 2000) / sampleRate);
  assert.ok(Math.abs(hz - 440) < 3, `got ${hz}`);
});

test("modulation raises the measured spectral centroid", () => {
  const plain = measure(defaultVoice());
  const v = defaultVoice();
  v.ops[1].level = 85;
  assert.ok(plain.centroid < 1.1);
  assert.ok(measure(v).centroid > plain.centroid * 1.5);
});

test("envelope timing is monotonic in rate", () => {
  for (let r = 1; r < 99; r++) assert.ok(fallDbPerSecond(r + 1) >= fallDbPerSecond(r));
  assert.ok(rateForRise(1) < rateForRise(0.05));
});
