// The chord progression written out as a Standard MIDI File.
//
// These tests decode the bytes back and hold them to `stepEvents` - the same answer the loop
// plays from. That is the point of the export being a re-encoding rather than a second opinion:
// if the file and what you heard ever disagree, one of them is wrong, and a test that only
// checked the file against itself would not notice.

import test from "node:test";
import assert from "node:assert/strict";
import {
  progressionMidiFile, progressionEvents, variableLength, ticksPerStep, TICKS_PER_QUARTER,
} from "../dist/js/midi-file.js";
import {
  defaultPattern, sanitizePattern, presetById, stepEvents, stepChord, progressionChords, STEPS,
} from "../dist/js/pattern.js";
import { defaultChord } from "../dist/js/harmony.js";

/** A small Standard MIDI File reader, written for the test so the writer is checked by something
 *  that does not share its code. */
function decode(bytes) {
  let at = 0;
  const u32 = () => ((bytes[at++] << 24) | (bytes[at++] << 16) | (bytes[at++] << 8) | bytes[at++]) >>> 0;
  const tag = () => String.fromCharCode(bytes[at++], bytes[at++], bytes[at++], bytes[at++]);
  const varLen = () => {
    let value = 0;
    for (;;) {
      const b = bytes[at++];
      value = value * 128 + (b & 0x7f);
      if (!(b & 0x80)) return value;
    }
  };

  assert.equal(tag(), "MThd");
  assert.equal(u32(), 6, "a header chunk is six bytes");
  const format = (bytes[at++] << 8) | bytes[at++];
  const tracks = (bytes[at++] << 8) | bytes[at++];
  const division = (bytes[at++] << 8) | bytes[at++];

  assert.equal(tag(), "MTrk");
  const length = u32();
  const end = at + length;

  const notes = [];
  const meta = {};
  let tick = 0;
  let sawEndOfTrack = false;
  while (at < end) {
    const delta = varLen();
    assert.ok(delta >= 0, "a delta is never negative");
    tick += delta;
    const status = bytes[at++];
    if (status === 0xff) {
      const type = bytes[at++];
      const size = varLen();
      const data = bytes.slice(at, at + size);
      at += size;
      if (type === 0x03) meta.name = new TextDecoder().decode(data);
      else if (type === 0x51) meta.usPerQuarter = (data[0] << 16) | (data[1] << 8) | data[2];
      else if (type === 0x58) meta.timeSignature = [...data];
      else if (type === 0x2f) sawEndOfTrack = true;
    } else {
      const kind = status & 0xf0;
      assert.ok(kind === 0x90 || kind === 0x80, `unexpected status byte ${status.toString(16)}`);
      notes.push({ tick, on: kind === 0x90, channel: status & 0x0f, note: bytes[at++], velocity: bytes[at++] });
    }
  }
  assert.ok(sawEndOfTrack, "the track ends where it says it does");
  assert.equal(at, end, "the chunk length matches what is in it");
  assert.equal(at, bytes.length, "and nothing follows the track");
  return { format, tracks, division, notes, meta };
}

const withProgression = () => sanitizePattern(presetById("progression").make());

test("a variable-length quantity is seven bits a byte, high bit as a continue", () => {
  assert.deepEqual(variableLength(0), [0x00]);
  assert.deepEqual(variableLength(127), [0x7f]);
  assert.deepEqual(variableLength(128), [0x81, 0x00]);
  assert.deepEqual(variableLength(480), [0x83, 0x60]);
  assert.deepEqual(variableLength(8192), [0xc0, 0x00]);
  assert.deepEqual(variableLength(0x0fffffff), [0xff, 0xff, 0xff, 0x7f]);
  // Every byte but the last carries the continue bit, and only the last does not.
  for (const n of [0, 1, 127, 128, 999, 100000]) {
    const bytes = variableLength(n);
    bytes.slice(0, -1).forEach((b) => assert.ok(b & 0x80));
    assert.ok(!(bytes.at(-1) & 0x80));
  }
});

test("the file is a well formed format 0 with one track", () => {
  const file = decode(progressionMidiFile(withProgression(), { name: "Tine EP" }));
  assert.equal(file.format, 0);
  assert.equal(file.tracks, 1);
  assert.equal(file.division, TICKS_PER_QUARTER);
  assert.equal(file.meta.name, "Tine EP", "the track says where it came from");
  assert.deepEqual(file.meta.timeSignature, [4, 2, 0x18, 8], "four four");
});

test("the tempo written is the tempo it was heard at", () => {
  for (const bpm of [60, 100, 128, 240]) {
    const pattern = sanitizePattern({ ...withProgression(), bpm });
    const { meta } = decode(progressionMidiFile(pattern));
    assert.equal(meta.usPerQuarter, Math.round(60000000 / bpm), `${bpm} bpm`);
    // And it reads back as the same tempo, which is what a host will do with it.
    assert.ok(Math.abs(60000000 / meta.usPerQuarter - bpm) < 0.01);
  }
});

test("the notes in the file are the notes the loop plays", () => {
  // The check that matters. Every chord the loop would sound, at the step it sounds on, with the
  // notes stepEvents gives - not a second calculation of the same thing.
  const pattern = withProgression();
  const file = decode(progressionMidiFile(pattern));
  const perStep = ticksPerStep(pattern);

  const expected = [];
  for (let step = 0; step < STEPS; step++) {
    if (stepChord(pattern, step) == null) continue;
    const ev = stepEvents(pattern, step);
    for (const note of ev.notes) expected.push({ tick: Math.round(step * perStep), note, velocity: ev.velocity });
  }
  const starts = file.notes.filter((n) => n.on).map(({ tick, note, velocity }) => ({ tick, note, velocity }));
  const key = (a) => `${a.tick}:${a.note}:${a.velocity}`;
  assert.deepEqual(starts.map(key).sort(), expected.map(key).sort());
  assert.equal(starts.length, 16, "four chords of four notes");
  assert.equal(progressionChords(pattern).length, 4);
});

test("a chord is held for as long as it rang, ties and gate included", () => {
  const pattern = withProgression(); // chords on 0, 4, 8 and 12, each held through three rests
  const file = decode(progressionMidiFile(pattern));
  const perStep = ticksPerStep(pattern);
  const wanted = Math.round(perStep * (4 - 1 + pattern.gate));

  for (const on of file.notes.filter((n) => n.on)) {
    const off = file.notes.find((n) => !n.on && n.note === on.note && n.tick > on.tick);
    assert.ok(off, `note ${on.note} at ${on.tick} is never released`);
    assert.equal(off.tick - on.tick, wanted, "held for its tied length, shortened by the gate");
  }
  // A shorter gate makes shorter notes, which is what honouring it means.
  const staccato = decode(progressionMidiFile(sanitizePattern({ ...pattern, gate: 0.2 })));
  const first = staccato.notes.find((n) => n.on);
  const release = staccato.notes.find((n) => !n.on && n.note === first.note);
  assert.ok(release.tick - first.tick < wanted, "a tighter gate writes a shorter note");
});

test("only the chords are exported; the notes written on the roll are not", () => {
  // The loop's own notes are bench equipment - a velocity ramp, a four-octave sweep - and have no
  // business in a sequencer. A step carrying a chord goes; a step carrying a note does not.
  const pattern = sanitizePattern({
    ...defaultPattern(),
    steps: defaultPattern().steps.map((s, i) => (i === 0 ? { ...s, chord: { ...defaultChord() } } : s)),
  });
  assert.ok(pattern.steps.filter((s) => s.note != null).length > 10, "the roll is full of notes");
  const file = decode(progressionMidiFile(pattern));
  const starts = file.notes.filter((n) => n.on);
  assert.deepEqual(starts.map((n) => n.note).sort((a, b) => a - b), [48, 52, 55], "the one chord, and nothing else");
  for (const n of starts) assert.equal(n.tick, 0, "all at the step the chord sits on");
});

test("nothing is left hanging, and nothing starts before it is time", () => {
  for (const id of ["progression", "chord"]) {
    const file = decode(progressionMidiFile(sanitizePattern(presetById(id).make())));
    const open = new Map();
    for (const e of file.notes) {
      if (e.on) open.set(e.note, (open.get(e.note) || 0) + 1);
      else open.set(e.note, (open.get(e.note) || 0) - 1);
      assert.ok((open.get(e.note) || 0) >= 0, `${id}: note ${e.note} released before it started`);
    }
    for (const [note, count] of open) assert.equal(count, 0, `${id}: note ${note} left hanging`);
    assert.ok(file.notes.every((e) => e.channel === 0), `${id}: everything on channel 1`);
    assert.ok(file.notes.every((e) => e.note >= 0 && e.note <= 127), `${id}: notes in range`);
  }
});

test("a progression with no chords writes no file at all", () => {
  // Better than an empty one, which looks like the export worked.
  assert.equal(progressionMidiFile(sanitizePattern(defaultPattern())), null);
  assert.deepEqual(progressionEvents(sanitizePattern(defaultPattern())), []);
});

test("every step division lands on the grid", () => {
  // 480 ticks a quarter divides by two, three, four, six and eight, so no division of the loop
  // ends up on a fractional tick and drifting.
  for (const division of ["1/4", "1/8", "1/8T", "1/16"]) {
    const pattern = sanitizePattern({ ...withProgression(), division });
    assert.equal(ticksPerStep(pattern) % 1, 0, `${division} is a whole number of ticks`);
    const file = decode(progressionMidiFile(pattern));
    for (const e of file.notes) assert.equal(e.tick % 1, 0, `${division}: a tick is a whole number`);
  }
});
