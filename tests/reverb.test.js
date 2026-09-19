import test from "node:test";
import assert from "node:assert/strict";
import { impulseResponse, sanitizeReverb, defaultReverb, REVERB_PRESETS, presetById, MAX_SECONDS } from "../dist/js/reverb.js";

const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
/** Rough measure of how much high frequency a signal has, relative to its level. */
const brightness = (a) => {
  let diff = 0;
  for (let i = 1; i < a.length; i++) diff += Math.abs(a[i] - a[i - 1]);
  return diff / a.length / (rms(a) || 1);
};
const slice = (a, from, to) => a.slice(Math.round(a.length * from), Math.round(a.length * to));

test("the impulse decays to silence over its length", () => {
  const [l] = impulseResponse(48000, { seconds: 1, damping: 0.5 });
  assert.equal(l.length, 48000);
  const head = rms(slice(l, 0, 0.1));
  const tail = rms(slice(l, 0.9, 1));
  assert.ok(head > 0, "it makes sound");
  assert.ok(tail < head / 100, `tail ${tail} should be far below head ${head}`);
  assert.ok(Math.abs(l[0]) < Math.abs(l[Math.round(0.004 * 48000)]), "no click on the very first sample");
});

test("damping darkens the tail", () => {
  const [dark] = impulseResponse(48000, { seconds: 1.5, damping: 0.05 });
  const [bright] = impulseResponse(48000, { seconds: 1.5, damping: 1 });
  assert.ok(brightness(slice(bright, 0.5, 0.9)) > brightness(slice(dark, 0.5, 0.9)) * 1.3, "a bright space keeps its highs longer");
});

test("left and right differ, so a mono engine comes out with width", () => {
  const [l, r] = impulseResponse(48000, { seconds: 0.8, damping: 0.5 });
  let same = 0;
  for (let i = 0; i < l.length; i++) if (l[i] === r[i]) same++;
  assert.ok(same < l.length * 0.01, "the two channels are generated separately");
  assert.ok(Math.abs(rms(l) - rms(r)) < rms(l) * 0.2, "but they are the same loudness");
});

test("a bigger space is not a louder one", () => {
  const small = rms(impulseResponse(48000, { seconds: 0.5, damping: 0.5 })[0]);
  const big = rms(impulseResponse(48000, { seconds: 3.5, damping: 0.5 })[0]);
  // Normalised by energy, so the mix control means the same thing at any size.
  assert.ok(big < small, "a long tail spreads the same energy over more time");
  assert.ok(big > small / 8, `not wildly quieter: ${big} vs ${small}`);
});

test("settings are forced into range, and every preset is usable", () => {
  const s = sanitizeReverb({ mix: 9, seconds: 900, preset: "nowhere" });
  assert.equal(s.mix, 1);
  assert.equal(s.seconds, MAX_SECONDS);
  assert.equal(s.preset, "room");
  assert.deepEqual(sanitizeReverb(undefined), defaultReverb());
  assert.ok(defaultReverb().on && defaultReverb().mix < 0.3, "on by default, and light");
  for (const p of REVERB_PRESETS) {
    assert.equal(presetById(p.id).id, p.id);
    const [l] = impulseResponse(44100, { seconds: p.seconds, damping: p.damping });
    assert.ok(l.length > 1000 && rms(l) > 0, p.id);
  }
});

/** Convolve, the way a ConvolverNode with normalize = false does. */
function convolve(input, h) {
  const out = new Float64Array(input.length + h.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    if (!x) continue;
    for (let k = 0; k < h.length; k++) out[i + k] += x * h[k];
  }
  return out;
}

test("the mix control means what it says: 20% mix is about 20% wet", () => {
  // A short space at a low rate, so a plain convolution is quick.
  const sr = 8000;
  const [h] = impulseResponse(sr, { seconds: 0.4, damping: 0.5 });
  const noise = new Float64Array(sr);
  let seed = 12345;
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = (seed / 0x3fffffff - 1) * 0.3;
  }
  const wet = convolve(noise, h);
  // Convolving must leave the level alone, or the mix control lies about how much reverb there is.
  const ratio = rms(wet.slice(0, noise.length)) / rms(noise);
  assert.ok(ratio > 0.6 && ratio < 1.6, `wet path is ${ratio.toFixed(2)}x the dry signal, should be about 1x`);
  for (const mix of [0.1, 0.2, 0.5]) {
    const mixed = rms(wet.slice(0, noise.length).map((x) => x * mix)) / rms(noise);
    assert.ok(Math.abs(mixed - mix) < mix * 0.6, `at ${mix * 100}% the wet signal is ${(mixed * 100).toFixed(0)}% of the dry`);
  }
});
