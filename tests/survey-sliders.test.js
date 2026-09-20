import test from "node:test";
import assert from "node:assert/strict";
import { opRatio, defaultVoice } from "../dist/js/dx7.js";
import { analyzeLayers } from "../dist/js/layers.js";
import { renderNote } from "../dist/js/render.js";
import { setGrowl, setTail, setScalingPivot } from "../dist/js/macros.js";
import { tailor, registerEntry, LIBRARY } from "../dist/js/designer.js";

const entry = (name) => LIBRARY.find((e) => e.voice.name === name);
const subUnity = (v) => v.ops.filter((o) => o.level > 0 && !o.mode && opRatio(o) < 1).length;

/** Loudness in dB at a moment while the key is held. */
function heldLevel(voice, t) {
  const { samples, sampleRate } = renderNote(voice, { note: 60, velocity: 100, hold: 5, tail: 0.5 });
  let peak = 0;
  for (let i = Math.round(t * sampleRate); i < Math.min(samples.length, Math.round((t + 0.1) * sampleRate)); i++) peak = Math.max(peak, Math.abs(samples[i]));
  return 20 * Math.log10(Math.max(peak, 1e-6));
}

// Sub-unity modulator ratios appear in 32% of the 39,961 voices surveyed (docs/research.md).
test("growl puts a modulator below the note, and takes it away again", () => {
  const e = entry("TINE EP");
  assert.equal(subUnity(tailor(e, {}).voice), 0, "nothing sub-unity to begin with");
  const rough = tailor(e, { growl: 0.8 });
  assert.ok(subUnity(rough.voice) > 0, "a modulator now sits below the note");
  assert.match(rough.applied.join("; "), /sub-harmonic growl/);
  assert.equal(subUnity(tailor({ ...e, voice: rough.voice }, { growl: -0.8 }).voice), 0, "and it can be removed");
});

test("growl never eats the tine: that layer is the sound", () => {
  for (const name of ["TINE EP", "SOFT RHODE", "GRANDBRASS"]) {
    const e = entry(name);
    if (!e) continue;
    const before = tailor(e, {}).voice;
    const after = tailor(e, { growl: 0.8 }).voice;
    for (const n of analyzeLayers(before).tine)
      assert.equal(opRatio(after.ops[n - 1]), opRatio(before.ops[n - 1]), `${name}: tine operator ${n} kept its ratio`);
  }
});

// The two-stage decay appears in 16% of surveyed voices, and in most good bells and pianos.
test("the tail control makes a note ring on, or cuts it off", () => {
  const e = entry("GLASS BELL");
  const plain = tailor(e, {}).voice;
  const long = tailor(e, { tail: 0.8 }).voice;
  const short = tailor(e, { tail: -0.8 }).voice;
  assert.ok(heldLevel(long, 4.5) > heldLevel(plain, 4.5) + 6, "a long tail is still sounding when the plain one has gone");
  assert.ok(heldLevel(short, 1.5) < heldLevel(plain, 1.5) - 20, "and cutting the tail leaves silence");
  // The attack is not what this control is for.
  assert.ok(Math.abs(heldLevel(short, 0.05) - heldLevel(plain, 0.05)) < 6, "the start of the note is left alone");
});

// Keyboard level scaling appears in 72% of surveyed voices, most often breaking around C3.
test("the pivot control moves where the sound thins out", () => {
  const e = entry("TINE EP");
  const up = tailor(e, { pivot: 0.8 }).voice;
  const down = tailor(e, { pivot: -0.8 }).voice;
  const scaled = (v) => v.ops.filter((o) => o.level > 0 && (o.rightDepth > 0 || o.leftDepth > 0)).map((o) => o.breakpoint);
  assert.ok(scaled(up).length, "something is scaled");
  assert.ok(Math.max(...scaled(up)) > Math.max(...scaled(down)), "the break point moves with the control");
});

test("a voice with no scaling at all gets some, so the control can do something", () => {
  const v = { ...defaultVoice(), ops: defaultVoice().ops.map((o, i) => ({ ...o, level: i < 2 ? 80 : 0 })) };
  assert.equal(v.ops.every((o) => o.rightDepth === 0), true);
  setScalingPivot(v, 0.6);
  const scaled = v.ops.filter((o) => o.rightDepth > 0);
  assert.ok(scaled.length, "a plain darkening above the break point was added");
  assert.ok(scaled.every((o) => o.breakpoint > 39), "and the break point moved up as asked");
});

test("the new controls leave a voice alone at zero", () => {
  for (const name of ["TINE EP", "GLASS BELL"]) {
    const v = tailor(entry(name), {}).voice;
    const copy = JSON.parse(JSON.stringify(v));
    setGrowl(v, 0);
    setTail(v, 0);
    setScalingPivot(v, 0);
    assert.deepEqual(v, copy, name);
  }
});
