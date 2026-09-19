import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { design } from "../dist/js/designer.js";

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const defaultPrompt = html.match(/<textarea id="prompt"[^>]*>([^<]*)<\/textarea>/)[1];

// The first sound anyone hears should be welcoming: a patch with a fast attack, harmonic
// partials and a musical decay, not a long inharmonic clang.
test("the sound the app opens with is a pleasant one", () => {
  const { results } = design(defaultPrompt, { variation: 42 });
  const r = results[0];
  assert.equal(r.entry.family, "epiano", `chose ${r.entry.voice.name} (${r.entry.family})`);
  assert.ok(r.features.inharm < 0.15, `inharmonicity ${(r.features.inharm * 100).toFixed(0)}% should be low: clangy is abrasive`);
  assert.ok(r.features.attack < 0.05, `attack ${(r.features.attack * 1000).toFixed(0)} ms should be immediate, as a piano is`);
  assert.ok(r.features.centroid < 6, `brightness ${r.features.centroid.toFixed(1)}x should not be piercing`);
  assert.ok(r.features.decay > 1 && r.features.decay < 8, `decay ${r.features.decay.toFixed(1)} s should be musical`);
  assert.ok(r.features.peakDb <= 0, `peak ${r.features.peakDb.toFixed(1)} dB must not clip`);
  assert.equal(r.voice.transpose, 24, "and it should play at written pitch");
});
