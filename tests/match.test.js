import test from "node:test";
import assert from "node:assert/strict";
import { match, featureDistance, measureAsRecording, describeMatch, targetsFromFeatures } from "../dist/js/match.js";
import { analyseSamples } from "../dist/js/features.js";
import { analyseRecording } from "../dist/js/sample.js";
import { renderNote } from "../dist/js/render.js";
import { LIBRARY } from "../dist/js/designer.js";

const entry = (name) => LIBRARY.find((e) => e.voice.name === name);

/** A voice as it would arrive from a microphone: one note, free-running, no key-release. */
function asRecording(name, { seconds = 3, note = 60 } = {}) {
  const rendered = renderNote(entry(name).voice, { note, velocity: 100, hold: seconds, tail: 0, sampleRate: 22050 });
  return analyseRecording(rendered.samples, rendered.sampleRate, { analyse: analyseSamples });
}

test("a voice measured as a recording matches itself exactly", () => {
  // This is the property everything else rests on: the recording and the candidate have to be
  // held against the same ruler, under the same conditions. Measuring a candidate the usual
  // way - with a key-release the recording never had - put a voice 2.9 away from itself.
  for (const name of ["TINE EP", "SUB BASS", "CLAVINET"]) {
    const heard = asRecording(name);
    const same = measureAsRecording(entry(name).voice, { seconds: heard.seconds, note: 60 });
    assert.ok(featureDistance(same, heard.features) < 0.01, `${name} is ${featureDistance(same, heard.features).toFixed(3)} from itself`);
  }
});

test("matching a rendered voice finds that voice, or one of its family", () => {
  const found = [];
  for (const name of ["TINE EP", "SUB BASS", "SWEEP PAD", "CLAVINET", "GRANDBRASS"]) {
    const heard = asRecording(name);
    const { results } = match(heard.features, { candidates: 5, seconds: heard.seconds });
    const best = results[0];
    const ranked = results.findIndex((r) => r.startedFrom === name);
    found.push({ name, best: best.startedFrom, ranked });
    assert.ok(ranked >= 0, `${name}: the right voice was not even among the candidates (got ${results.map((r) => r.startedFrom).join(", ")})`);
  }
  const exact = found.filter((f) => f.best === f.name).length;
  assert.ok(exact >= 4, `only ${exact} of ${found.length} matched exactly: ${JSON.stringify(found)}`);
});

test("the harmonic profile keeps a bell away from a bass", () => {
  // Brightness, attack and decay alone cannot tell these apart: before the harmonic profile
  // was measured, a tubular bell matched a funk bass and scored 0.005.
  const bell = asRecording("TUBULAR");
  const bass = measureAsRecording(entry("FUNK BASS").voice, { seconds: bell.seconds });
  const itself = measureAsRecording(entry("TUBULAR").voice, { seconds: bell.seconds });
  assert.ok(featureDistance(bell.features, bass) > featureDistance(bell.features, itself) + 0.2,
    `bell-to-bass ${featureDistance(bell.features, bass).toFixed(3)} should be well above bell-to-itself ${featureDistance(bell.features, itself).toFixed(3)}`);
  assert.ok(bell.features.harmonics.length >= 8 && Math.abs(bell.features.harmonics.reduce((a, b) => a + b, 0) - 1) < 0.01,
    "the profile is a share of the harmonic total");
});

test("targets come from the recording, and stay inside what a patch can do", () => {
  const heard = asRecording("TINE EP");
  const t = targetsFromFeatures(heard.features);
  assert.ok(t.centroid > 1 && t.centroid <= 25);
  assert.ok(t.attack >= 0.004 && t.attack <= 1.5);
  assert.ok(t.decay >= 0.08 && t.decay <= 25);
  const silly = targetsFromFeatures({ centroid: 900, attack: 40, decay: 900, early: 1, late: 90 });
  assert.equal(silly.centroid, 25);
  assert.equal(silly.attack, 1.5);
  assert.equal(silly.evolveRatio, 5);
});

test("the match says how close it got, and what it could not reach", () => {
  const heard = asRecording("TINE EP");
  const { results } = match(heard.features, { candidates: 3, seconds: heard.seconds });
  const good = describeMatch(heard.features, measureAsRecording(results[0].voice, { seconds: heard.seconds }));
  assert.match(good.quality, /very close|close/);
  // Something that is not the same sound at all should be described as such, with reasons.
  const far = describeMatch(heard.features, measureAsRecording(entry("SUB BASS").voice, { seconds: heard.seconds }));
  assert.match(far.quality, /same family|roughly similar/);
  assert.ok(far.gaps.length > 0, "and it should say what is off");
});
