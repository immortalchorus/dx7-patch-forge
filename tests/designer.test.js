import test from "node:test";
import assert from "node:assert/strict";
import { design, cartridgeVoices } from "../dist/js/designer.js";

const best = (p, variation = 42) => design(p, { variation }).results[0];

test("named instruments pick a voice from that family", () => {
  const cases = {
    "breathy flute": "flute",
    "church organ": "organ",
    "warm wurlitzer electric piano": "epiano",
    "glassy tubular bells": "bell",
    "deep synth bass": "bass",
    "lush string ensemble": "strings",
    "plucky kalimba": "mallet",
    "clarinet": "reed",
    "brass section stab": "brass",
  };
  for (const [prompt, family] of Object.entries(cases)) assert.equal(best(prompt).entry.family, family, prompt);
});

test("brightness words move the measured spectrum the right way", () => {
  const bright = best("very bright electric piano");
  const dark = best("very dark electric piano");
  assert.ok(bright.features.centroid > dark.features.centroid * 1.8, `${bright.features.centroid} vs ${dark.features.centroid}`);
});

test("attack words land on measurable onset times", () => {
  assert.ok(best("pad with a very slow attack").features.attack > 0.5);
  assert.ok(best("strings with a fast attack").features.attack < 0.05);
});

test("length words change held decay and release", () => {
  assert.ok(best("short staccato marimba").features.decay < best("marimba with a long lingering tail").features.decay);
  assert.ok(best("organ with a long release").features.release > 1);
});

test("metallic makes the spectrum inharmonic, pure makes it harmonic", () => {
  assert.ok(best("metallic inharmonic pad").features.inharm > best("pure harmonic pad").features.inharm + 0.2);
});

test("variation changes the result deterministically", () => {
  const a = best("bell", 3), b = best("bell", 3), c = best("bell", 77);
  assert.deepEqual(a.voice, b.voice);
  assert.notDeepEqual(a.voice, c.voice);
});

test("the cartridge holds 32 voices led by the chosen one", () => {
  const { results } = design("warm pad", { variation: 5 });
  const voices = cartridgeVoices(results);
  assert.equal(voices.length, 32);
  assert.deepEqual(voices[0].ops, results[0].voice.ops);
});
