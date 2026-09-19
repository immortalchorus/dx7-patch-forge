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
