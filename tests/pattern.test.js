import test from "node:test";
import assert from "node:assert/strict";
import { defaultPattern, sanitizePattern, stepEvents, stepSeconds, presetById, PRESETS, STEPS } from "../dist/js/pattern.js";
import { PreviewEngine } from "../dist/js/preview-engine.js";
import { LIBRARY } from "../dist/js/designer.js";

const voice = () => LIBRARY.find((e) => e.voice.name === "TINE EP").voice;

/** Run the engine for `seconds`, recording when each note starts and stops. */
function run(engine, seconds, sampleRate = 48000) {
  const frames = 128;
  const l = new Float32Array(frames), r = new Float32Array(frames);
  const started = [], stopped = [];
  const blocks = Math.round((seconds * sampleRate) / frames);
  let sounding = new Set();
  for (let b = 0; b < blocks; b++) {
    const before = new Set(engine.notes.filter((n) => n.fm.releasedAt < 0).map((n) => n.key));
    engine.render([l, r]);
    const after = new Set(engine.notes.filter((n) => n.fm.releasedAt < 0).map((n) => n.key));
    const t = (b * frames) / sampleRate;
    for (const k of after) if (!before.has(k)) started.push({ note: k, t });
    for (const k of before) if (!after.has(k)) stopped.push({ note: k, t });
    sounding = after;
  }
  return { started, stopped, sounding };
}

test("a pattern is forced into shape whatever it was loaded from", () => {
  const p = sanitizePattern({ bpm: 9000, division: "nonsense", chord: "nope", gate: 5, steps: [{ note: 300, vel: -4, tie: 1 }] });
  assert.equal(p.bpm, 240);
  assert.equal(p.division, "1/8");
  assert.equal(p.chord, "off");
  assert.equal(p.gate, 1);
  assert.equal(p.steps.length, STEPS);
  assert.deepEqual(p.steps[0], { note: 127, vel: 1, tie: true });
  assert.equal(p.steps[5].note, null, "missing steps become rests");
});

test("tied rests extend the note before them instead of retriggering", () => {
  const tail = presetById("tail").make();
  assert.deepEqual(stepEvents(tail, 0), { notes: [60], velocity: 100, steps: 6 });
  assert.equal(stepEvents(tail, 1), null);
  assert.equal(stepEvents(tail, 6), null, "an untied rest is silence");
});

test("chords add intervals to every step", () => {
  const p = sanitizePattern({ ...defaultPattern(), chord: "maj7" });
  assert.deepEqual(stepEvents(p, 0).notes, [60, 64, 67, 71]);
});

test("every preset is playable and says what it is for", () => {
  for (const preset of PRESETS) {
    const p = sanitizePattern(preset.make());
    assert.ok(p.steps.some((s) => s.note != null), `${preset.id} has notes`);
    assert.ok(preset.hint.length > 20, `${preset.id} has a hint`);
    assert.ok(stepSeconds(p) > 0.02 && stepSeconds(p) < 3, `${preset.id} step length`);
  }
});

test("the engine plays the loop in time, and stopping it lets the notes go", () => {
  const engine = new PreviewEngine(48000);
  const pattern = sanitizePattern({ ...defaultPattern(), bpm: 120, division: "1/8", gate: 0.5, steps: defaultPattern().steps });
  engine.message({ type: "voice", voice: voice() });
  engine.message({ type: "pattern", pattern });
  engine.message({ type: "transport", playing: true });
  const step = stepSeconds(pattern); // 0.25 s
  const { started, stopped } = run(engine, step * 4.5);
  assert.deepEqual(started.slice(0, 4).map((s) => s.note), pattern.steps.slice(0, 4).map((s) => s.note));
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(started[i].t - i * step) < 0.01, `step ${i} at ${started[i].t}`);
  // Gate 0.5 releases halfway through each step.
  assert.ok(Math.abs(stopped[0].t - step * 0.5) < 0.02, `note off at ${stopped[0].t}`);
  engine.message({ type: "transport", playing: false });
  const after = run(engine, 0.1);
  assert.equal(after.sounding.size, 0, "stopping releases whatever is held");
});

test("a long note is held for its whole length, not retriggered", () => {
  const engine = new PreviewEngine(48000);
  const pattern = sanitizePattern(presetById("tail").make());
  engine.message({ type: "voice", voice: voice() });
  engine.message({ type: "pattern", pattern });
  engine.message({ type: "transport", playing: true });
  const step = stepSeconds(pattern);
  const { started, stopped } = run(engine, step * 5);
  assert.equal(started.length, 1, "one note start in the first five steps");
  assert.equal(stopped.length, 0, "and it is still held");
  const later = run(engine, step * 2);
  assert.ok(later.stopped.length === 1 && later.stopped[0].note === 60, "released near the end of its six steps");
});

test("the playhead and peak level are reported back while the loop runs", () => {
  const seen = [];
  const engine = new PreviewEngine(48000, (e) => seen.push(e));
  engine.message({ type: "voice", voice: voice() });
  engine.message({ type: "pattern", pattern: sanitizePattern(defaultPattern()) });
  engine.message({ type: "transport", playing: true });
  run(engine, 1);
  const steps = seen.filter((e) => e.step >= 0).map((e) => e.step);
  assert.ok(steps.length >= 4, `saw ${steps.length} playhead reports`);
  assert.ok(seen.some((e) => e.peak > 0.01), "and a level to show on the meter");
  assert.deepEqual([...new Set(steps)].slice(0, 4), [0, 1, 2, 3]);
});

test("the octave control moves the whole pattern, or refuses to", async () => {
  const { shiftPattern } = await import("../dist/js/pattern.js");
  const p = sanitizePattern(defaultPattern());
  const up = shiftPattern(p, 12);
  assert.deepEqual(up.steps.map((s) => s.note), p.steps.map((s) => s.note + 12));
  assert.deepEqual(up.steps.map((s) => s.vel), p.steps.map((s) => s.vel), "velocities are untouched");
  assert.equal(shiftPattern(p, 96), null, "a shift that would run off the keyboard is refused");
  const withRest = sanitizePattern({ ...p, steps: p.steps.map((s, i) => (i ? s : { ...s, note: null })) });
  assert.equal(shiftPattern(withRest, 12).steps[0].note, null, "rests stay rests");
});
