import test from "node:test";
import assert from "node:assert/strict";
import { ssynthParameters, juceJson, ssynthFile } from "../dist/js/ssynth.js";
import { LIBRARY } from "../dist/js/designer.js";

const berlin = LIBRARY.find((e) => e.voice.name === "BERLIN").voice;

test("exports all 186 80s FM parameters", () => {
  assert.equal(Object.keys(ssynthParameters(berlin)).length, 186);
});

test("carries the voice's own pitch envelope, fine tuning and fixed frequency", () => {
  const p = ssynthParameters(berlin);
  assert.deepEqual([1, 2, 3, 4].map((s) => p[`fm80pitchl${s}`]), berlin.pitchEg.levels);
  berlin.ops.forEach((o, i) => {
    const x = `fm80op${i + 1}`;
    assert.equal(p[x + "mode"], o.mode);
    assert.equal(p[x + "fine"], o.fine);
    assert.equal(p[x + "ratio"], o.coarse || 0.5);
    assert.equal(p[x + "fixed"], 10 ** (o.coarse & 3));
    assert.equal(p[x + "level"], o.level / 99);
  });
  assert.equal(p.fm80algo, berlin.algorithm);
  assert.equal(p.pitch, berlin.transpose - 24);
});

test("JUCE JSON matches SpaceAge's canonical form", () => {
  assert.equal(juceJson({ b: 1, a: 0.5, c: "x" }), '{\r\n  "a": 0.5,\r\n  "b": 1.0,\r\n  "c": "x"\r\n}');
  assert.equal(juceJson(0), "0.0");
});

test("patch file includes both integrity hashes", async () => {
  const json = JSON.parse(await ssynthFile(berlin, "BERLIN", new Date(2026, 0, 1)));
  assert.equal(json.engine, 15);
  assert.match(json.parameterIntegrity, /^[0-9a-f]{64}$/);
  assert.match(json.patchIntegrity, /^[0-9a-f]{64}$/);
  assert.equal(json.integrityVersion, 1);
});
