import test from "node:test";
import assert from "node:assert/strict";
import { defaultPattern, sanitizePattern, stepEvents, stepSeconds, presetById, PRESETS, STEPS, stepChordNotes, MAX_CHORDS } from "../dist/js/pattern.js";
import { defaultChord } from "../dist/js/harmony.js";
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
  const p = sanitizePattern({ bpm: 9000, division: "nonsense", gate: 5, steps: [{ note: 300, vel: -4, tie: 1 }] });
  assert.equal(p.bpm, 240);
  assert.equal(p.division, "1/8");
  assert.deepEqual(p.harmony, { keyPosition: 0, mode: 1, chords: [] });
  assert.equal(p.gate, 1);
  assert.equal(p.steps.length, STEPS);
  assert.deepEqual(p.steps[0], { note: 127, vel: 1, tie: true, chord: null });
  assert.equal(p.steps[5].note, null, "missing steps become rests");
});

test("tied rests extend the note before them instead of retriggering", () => {
  const tail = presetById("tail").make();
  assert.deepEqual(stepEvents(tail, 0), { notes: [60], velocity: 100, steps: 6 });
  assert.equal(stepEvents(tail, 1), null);
  assert.equal(stepEvents(tail, 6), null, "an untied rest is silence");
});

test("a step with a chord plays the progression instead of its own note", () => {
  // C major, the scale-relative triad on I: the chord's notes are absolute, so the note written
  // on the step is not heard as well. One step, one thing to listen to.
  const p = sanitizePattern({
    ...defaultPattern(),
    harmony: { keyPosition: 0, mode: 1, chords: [defaultChord()] },
    steps: defaultPattern().steps.map((s, i) => (i === 0 ? { ...s, chord: 0 } : s)),
  });
  assert.deepEqual(stepEvents(p, 0).notes, [48, 52, 55]);
  assert.deepEqual(stepChordNotes(p, 0), [48, 52, 55]);
  // A step with no chord still plays its own note, as it always did.
  assert.equal(stepChordNotes(p, 1), null);
  assert.deepEqual(stepEvents(p, 1).notes, [p.steps[1].note]);
});

test("a chord index that names no chord is dropped, not left dangling", () => {
  // Deleting a chord must not leave steps pointing at a hole that would throw when played.
  const p = sanitizePattern({
    ...defaultPattern(),
    harmony: { keyPosition: 0, mode: 1, chords: [defaultChord()] },
    steps: defaultPattern().steps.map((s, i) => ({ ...s, chord: i })),
  });
  assert.equal(p.steps[0].chord, 0);
  for (let i = 1; i < STEPS; i++) assert.equal(p.steps[i].chord, null, `step ${i}`);
  // A progression is capped, and anything past the cap is discarded rather than kept unplayable.
  const many = sanitizePattern({ ...defaultPattern(), harmony: { chords: Array.from({ length: 40 }, defaultChord) } });
  assert.equal(many.harmony.chords.length, MAX_CHORDS);
});

test("a chord is held through the tied rests after it, like a note", () => {
  const p = sanitizePattern(presetById("chord").make());
  const ev = stepEvents(p, 0);
  assert.equal(ev.notes.length, 4, "a major seventh is four notes");
  assert.equal(ev.steps, 8, "held through its seven tied rests");
  assert.equal(stepEvents(p, 1), null);
});

test("every preset is playable and says what it is for", () => {
  for (const preset of PRESETS) {
    const p = sanitizePattern(preset.make());
    const sounds = p.steps.some((s, i) => stepEvents(p, i) != null);
    assert.ok(sounds, `${preset.id} sounds something`);
    assert.ok(preset.hint.length > 20, `${preset.id} has a hint`);
    assert.ok(stepSeconds(p) > 0.02 && stepSeconds(p) < 3, `${preset.id} step length`);
  }
});

test("the progression preset walks its four chords in the key it names", () => {
  const p = sanitizePattern(presetById("progression").make());
  assert.equal(p.harmony.chords.length, 4);
  // I V vi IV in C, as scale-relative sevenths: CMaj7, G7, Am7, FMaj7.
  assert.deepEqual(stepEvents(p, 0).notes, [48, 52, 55, 59]);
  assert.deepEqual(stepEvents(p, 4).notes, [55, 59, 62, 65]);
  assert.deepEqual(stepEvents(p, 8).notes, [57, 60, 64, 67]);
  assert.deepEqual(stepEvents(p, 12).notes, [53, 57, 60, 64]);
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

test("a progression moves by whole octaves, and refuses anything else", async () => {
  const { shiftPattern } = await import("../dist/js/pattern.js");
  const withChords = sanitizePattern({
    ...defaultPattern(),
    harmony: { keyPosition: 0, mode: 1, chords: [defaultChord()] },
    steps: defaultPattern().steps.map((s, i) => (i === 0 ? { ...s, chord: 0 } : s)),
  });
  // An octave up moves the chord's register, which is the field that means exactly this.
  const up = shiftPattern(withChords, 12);
  assert.equal(up.harmony.chords[0].registerOctaves, 1);
  assert.deepEqual(stepChordNotes(sanitizePattern(up), 0), [60, 64, 67]);
  const down = shiftPattern(withChords, -12);
  assert.equal(down.harmony.chords[0].registerOctaves, -1);
  // Anything that is not a whole octave is refused rather than silently rewriting the degrees
  // or changing the key behind the user's back.
  assert.equal(shiftPattern(withChords, 7), null, "a fifth is not an octave");
  assert.equal(shiftPattern(withChords, 1), null, "nor is a semitone");
  // SpaceAge clamps registerOctaves to three either way, so a fourth octave is refused.
  const high = sanitizePattern({ ...withChords, harmony: { ...withChords.harmony, chords: [{ ...defaultChord(), registerOctaves: 3 }] } });
  assert.equal(shiftPattern(high, 12), null, "past three octaves is refused, not clamped");
  assert.ok(shiftPattern(high, -12), "and it can still come back down");
  // With no progression, a pattern still moves by any interval, as it always did.
  assert.ok(shiftPattern(sanitizePattern(defaultPattern()), 7), "a plain pattern still moves by a fifth");
});

test("a chord added to the progression lands on a step, so it can be heard", async () => {
  // The bug this pins: adding chords from the wheel put them in the progression but on no step,
  // so a progression you built yourself was silent and the loop went on playing its old notes.
  const { placeChord } = await import("../dist/js/pattern.js");
  const empty = sanitizePattern({
    ...defaultPattern(),
    steps: Array.from({ length: STEPS }, () => ({ note: null, vel: 100, tie: false, chord: null })),
  });
  let p = { ...empty, harmony: { ...empty.harmony, chords: [0, 4, 5, 3].map((degree) => ({ ...defaultChord(), degree })) } };
  for (let i = 0; i < 4; i++) p = sanitizePattern(placeChord(p, i));
  // Strong beats first, and each one held through the rests after it.
  assert.deepEqual(p.steps.map((s) => s.chord), [0, null, null, null, 1, null, null, null, 2, null, null, null, 3, null, null, null]);
  for (const i of [0, 4, 8, 12]) {
    assert.ok(stepEvents(p, i), `step ${i} should sound`);
    assert.equal(stepEvents(p, i).steps, 4, `step ${i} should be held for four steps`);
  }
});

test("placing a chord over a written note keeps the note underneath", async () => {
  // Placing is non-destructive, which is what makes it safe to do without asking: the chord wins
  // while it is there, and taking it off brings the note back.
  const { placeChord } = await import("../dist/js/pattern.js");
  const withNotes = sanitizePattern(defaultPattern());
  const written = withNotes.steps[0].note;
  let p = { ...withNotes, harmony: { ...withNotes.harmony, chords: [defaultChord()] } };
  p = sanitizePattern(placeChord(p, 0));
  assert.equal(p.steps[0].chord, 0);
  assert.equal(p.steps[0].note, written, "the note is still there");
  assert.deepEqual(stepEvents(p, 0).notes, [48, 52, 55], "but the chord is what sounds");
  // A pattern full of notes has nothing to tie over, so the chord lasts one step.
  assert.equal(stepEvents(p, 0).steps, 1);
  // Take the chord off and the note comes back.
  const off = sanitizePattern({ ...p, steps: p.steps.map((s, i) => (i === 0 ? { ...s, chord: null } : s)) });
  assert.deepEqual(stepEvents(off, 0).notes, [written]);
});

test("placing refuses when every step already carries a chord", async () => {
  const { placeChord } = await import("../dist/js/pattern.js");
  const base = sanitizePattern({
    ...defaultPattern(),
    harmony: { keyPosition: 0, mode: 1, chords: [defaultChord()] },
    steps: Array.from({ length: STEPS }, () => ({ note: null, vel: 100, tie: false, chord: 0 })),
  });
  assert.equal(placeChord(base, 0), base, "the same pattern is handed back, not a broken one");
});
