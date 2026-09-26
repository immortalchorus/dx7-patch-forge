// Writing the chord progression out as a Standard MIDI File.
//
// `midi.js` is a Web MIDI wrapper - live ports, a synth at the other end of a cable. This is the
// other kind of MIDI: bytes on disk, for opening in whatever the chords are going to be used in.
// The two share nothing but the name, which is why they are separate files.
//
// What is written is the **chords, and only the chords**. The notes written on the roll are the
// loop's own business - a velocity ramp or a four-octave sweep is bench equipment for hearing a
// patch, not something anyone wants in a sequencer. A step that carries a chord is exported; a
// step that carries a note is not.
//
// Nothing here decides which notes a chord sounds or how long it is held. That is `stepEvents`,
// which the loop already plays from, so the file and what you heard cannot disagree: the export
// is a re-encoding of the same answer rather than a second opinion about it. The one piece of
// timing this repeats is the engine's own hold, and it is written out below so the two can be
// compared.
//
// Format 0, one track. No running status: it saves a handful of bytes and costs the one thing a
// file like this needs, which is being obviously correct on inspection.

import { stepEvents, stepChord, divisionById, STEPS } from "./pattern.js";

/** Ticks per quarter note. 480 divides by 2, 3, 4, 6 and 8, so no division lands off-grid. */
export const TICKS_PER_QUARTER = 480;

const MIDI_CHANNEL = 0;

/** A MIDI variable-length quantity: seven bits per byte, high bit set on all but the last. */
export function variableLength(value) {
  const n = Math.max(0, Math.round(value));
  const out = [n & 0x7f];
  let rest = Math.floor(n / 128);
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return out;
}

/** How long one step lasts in ticks. */
export const ticksPerStep = (pattern) => TICKS_PER_QUARTER * divisionById(pattern.division).beats;

/**
 * The chords of a pattern as note events, in tick order.
 *
 * `hold` is the engine's own: a step's length is how many steps it covers less one, plus the
 * gate - see `transport` in preview-engine.js. A chord you heard ring through three tied rests
 * is written as one long chord here, not four short ones.
 */
export function progressionEvents(pattern) {
  const perStep = ticksPerStep(pattern);
  const events = [];
  for (let step = 0; step < STEPS; step++) {
    if (stepChord(pattern, step) == null) continue; // a written note is not part of the progression
    const ev = stepEvents(pattern, step);
    if (!ev) continue;
    const at = Math.round(step * perStep);
    const hold = Math.max(1, Math.round(perStep * (ev.steps - 1 + pattern.gate)));
    for (const note of ev.notes) {
      events.push({ tick: at, on: true, note, velocity: ev.velocity });
      events.push({ tick: at + hold, on: false, note, velocity: 0 });
    }
  }
  // Ends before starts at the same tick, so a chord repeated on the very next step retriggers
  // rather than having its opening note closed by the one it just replaced.
  events.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on) || a.note - b.note);
  return events;
}

const text = (s) => [...new TextEncoder().encode(s)];

const chunk = (tag, body) => {
  const size = body.length;
  return [...text(tag), (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff, ...body];
};

/**
 * The progression as a `.mid` file.
 *
 * `name` is written into the track, so a file that gets renamed still says what it came from.
 * Returns null when there are no chords: a file with nothing in it is worse than no file, because
 * it looks like the export worked.
 */
export function progressionMidiFile(pattern, { name = "OWL chord progression" } = {}) {
  const events = progressionEvents(pattern);
  if (!events.length) return null;

  const body = [];
  body.push(...variableLength(0), 0xff, 0x03, ...variableLength(text(name).length), ...text(name));
  // Tempo, so the file opens at the speed it was heard at rather than at a host's default 120.
  const usPerQuarter = Math.round(60000000 / pattern.bpm);
  body.push(...variableLength(0), 0xff, 0x51, 0x03, (usPerQuarter >>> 16) & 0xff, (usPerQuarter >>> 8) & 0xff, usPerQuarter & 0xff);
  // Four four, 24 clocks per beat, 8 demisemiquavers per quarter: the defaults, stated so a host
  // draws bar lines where the loop's own bars fall.
  body.push(...variableLength(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

  let last = 0;
  for (const e of events) {
    body.push(...variableLength(e.tick - last));
    body.push((e.on ? 0x90 : 0x80) | MIDI_CHANNEL, e.note & 0x7f, e.velocity & 0x7f);
    last = e.tick;
  }
  body.push(...variableLength(0), 0xff, 0x2f, 0x00); // end of track

  const header = [0, 0, 0, 1, (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff]; // format 0, one track
  return new Uint8Array([...chunk("MThd", header), ...chunk("MTrk", body)]);
}
