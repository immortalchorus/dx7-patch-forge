// The audition loop's pattern: bench equipment, not part of a voice.
//
// A pattern is a short step sequence used to hear a patch while it is being edited, so the
// interesting settings are the diagnostic ones: a velocity ramp shows touch response, a wide
// sweep shows keyboard level and rate scaling, fast repeats show envelope retriggering, and a
// held note shows the sustain stage and the release tail. Nothing here is saved into a voice.

import { sanitizeChord, defaultChord, chordMidiNotes, MODE_MAJOR, wrap, pitchClassAt } from "./harmony.js";

export const STEPS = 16;
export const MIN_BPM = 30;
export const MAX_BPM = 240;

// How many chords a progression holds. Eight is SpaceAge's WheelModel::maxSequence, kept so a
// progression written here is one SpaceAge could hold too.
export const MAX_CHORDS = 8;

// Note value of a step, as a fraction of a whole note.
export const DIVISIONS = [
  { id: "1/4", label: "1/4", beats: 1 },
  { id: "1/8", label: "1/8", beats: 0.5 },
  { id: "1/8T", label: "1/8 triplet", beats: 1 / 3 },
  { id: "1/16", label: "1/16", beats: 0.25 },
];

/**
 * The progression a pattern plays: a key, a scale, and a list of chord records.
 *
 * This replaces an earlier four-entry list of fixed interval sets bolted onto every step. That
 * was enough to hear a voice stack up and nothing more: it had no key, so it could not tell a
 * major seventh in C from one in F sharp, and no spelling, so it could not name what it played.
 * A step now points at a chord in this list by index, which is what lets one progression be
 * edited in one place and heard on as many steps as it is put on.
 */
export function defaultHarmony() {
  return { keyPosition: 0, mode: MODE_MAJOR, chords: [] };
}

const step = (note, vel = 100, tie = false, chord = null) => ({ note, vel, tie, chord });
const rest = () => step(null);

export function defaultPattern() {
  return {
    bpm: 110,
    division: "1/8",
    gate: 0.8, // fraction of a step the key is held, unless the step is tied
    harmony: defaultHarmony(),
    steps: Array.from({ length: STEPS }, (_, i) => step([60, 63, 67, 70][i % 4] + (i >= 8 ? 12 : 0), 100)),
  };
}

/**
 * The diagnostic patterns. Each answers one question about a patch that a single held note
 * cannot: how it responds to touch, how it changes across the keyboard, whether fast repeats
 * click, what the tail sounds like on its own, and how two or more notes interact.
 */
export const PRESETS = [
  {
    id: "ramp",
    label: "Velocity ramp",
    hint: "Soft to hard on one note: hear touch response and where velocity sensitivity runs out",
    make: () => ({ ...defaultPattern(), bpm: 100, division: "1/8", steps: Array.from({ length: STEPS }, (_, i) => step(60, Math.round(20 + (107 * i) / (STEPS - 1)))) }),
  },
  {
    id: "sweep",
    label: "Keyboard sweep",
    hint: "Four octaves up and back: hear keyboard level scaling and rate scaling",
    make: () => ({
      ...defaultPattern(),
      bpm: 120,
      division: "1/8",
      steps: Array.from({ length: STEPS }, (_, i) => step(36 + 12 * (i < 8 ? i % 5 : 4 - ((i - 3) % 5)), 100)),
    }),
  },
  {
    id: "repeats",
    label: "Fast repeats",
    hint: "Sixteenths on one note: hear envelope retriggering and any click at the start",
    make: () => ({ ...defaultPattern(), bpm: 132, division: "1/16", gate: 0.5, steps: Array.from({ length: STEPS }, () => step(60, 100)) }),
  },
  {
    id: "tail",
    label: "Long note and rest",
    hint: "One long note, then silence: hear the sustain stage and the release tail on their own",
    make: () => ({
      ...defaultPattern(),
      bpm: 80,
      division: "1/8",
      steps: Array.from({ length: STEPS }, (_, i) => (i === 0 ? step(60, 100) : i < 6 ? step(null, 100, true) : rest())),
    }),
  },
  {
    id: "chord",
    label: "Held chord",
    hint: "A slow major seventh: hear detune beating, chorus width and how the voice stacks up",
    make: () => ({
      ...defaultPattern(),
      bpm: 60,
      division: "1/4",
      harmony: { keyPosition: 0, mode: MODE_MAJOR, chords: [{ ...defaultChord(), quality: 5 }] },
      steps: Array.from({ length: STEPS }, (_, i) => (i % 8 === 0 ? step(null, 90, false, 0) : step(null, 90, true))),
    }),
  },
  {
    id: "progression",
    label: "Chord progression",
    hint: "I V vi IV as sevenths: hear whether four stacked notes stay clear or turn to mud",
    make: () => ({
      ...defaultPattern(),
      bpm: 100,
      division: "1/4",
      harmony: {
        keyPosition: 0,
        mode: MODE_MAJOR,
        // Quality 1 is the scale-relative 7th, so each degree gets the seventh chord the key
        // itself builds there rather than the same shape transposed.
        chords: [0, 4, 5, 3].map((degree) => ({ ...defaultChord(), degree, quality: 1 })),
      },
      steps: Array.from({ length: STEPS }, (_, i) =>
        i % 4 === 0 ? step(null, 96, false, (i / 4) % 4) : step(null, 96, true),
      ),
    }),
  },
  {
    id: "riff",
    label: "Arpeggio",
    hint: "A plain broken chord, for listening rather than testing",
    make: defaultPattern,
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);
export const divisionById = (id) => DIVISIONS.find((d) => d.id === id) || DIVISIONS[1];

/** How long one step lasts, in seconds. */
export const stepSeconds = (pattern) => (60 / clampBpm(pattern.bpm)) * divisionById(pattern.division).beats;
const clampBpm = (b) => Math.min(MAX_BPM, Math.max(MIN_BPM, b || 120));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Force a progression into legal shape, whatever it was loaded from. */
export function sanitizeHarmony(h) {
  const list = Array.isArray(h?.chords) ? h.chords.slice(0, MAX_CHORDS) : [];
  return {
    keyPosition: wrap(Number.isFinite(+h?.keyPosition) ? +h.keyPosition : 0),
    mode: clamp(h?.mode ?? MODE_MAJOR, 0, 49),
    chords: list.map(sanitizeChord),
  };
}

/** Force a pattern into legal shape, whatever it was loaded from. */
export function sanitizePattern(p) {
  const base = defaultPattern();
  const harmony = sanitizeHarmony(p?.harmony);
  const steps = Array.from({ length: STEPS }, (_, i) => {
    const s = p?.steps?.[i] || {};
    const note = s.note == null ? null : clamp(s.note, 0, 127);
    // A chord index that names no chord is dropped rather than kept as a dangling reference:
    // deleting a chord must not leave steps pointing at a hole.
    const index = s.chord == null ? null : clamp(s.chord, 0, MAX_CHORDS - 1);
    const chord = index != null && index < harmony.chords.length ? index : null;
    return { note, vel: clamp(s.vel ?? 100, 1, 127), tie: !!s.tie, chord };
  });
  return {
    bpm: clampBpm(p?.bpm ?? base.bpm),
    division: divisionById(p?.division).id,
    gate: Math.min(1, Math.max(0.05, p?.gate ?? base.gate)),
    harmony,
    steps,
  };
}

// Where a newly added chord goes: strong beats first, then the offbeats, then whatever is left.
// A chord that is added but not placed is a chord you cannot hear, which makes the wheel look
// broken - you click four chords, press play, and the loop plays its old notes.
const PLACEMENT_ORDER = [0, 4, 8, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15];

/**
 * Put a chord on a step, so adding one from the wheel is audible straight away.
 *
 * Placing a chord on a step that already has a note does not destroy the note: a chord wins over
 * the note underneath it while it is there, and taking the chord off brings the note back. That
 * is what makes it safe to do this without asking.
 *
 * The chord is then held through the empty rests after it, so it sounds like a chord rather than
 * a blip, but it never ties over a step that has a note or a chord of its own.
 * Returns the pattern unchanged when every step already carries a chord.
 */
export function placeChord(pattern, chordIndex) {
  const steps = pattern.steps.map((s) => ({ ...s }));
  const at = PLACEMENT_ORDER.find((i) => steps[i].chord == null);
  if (at == null) return pattern;
  steps[at].chord = chordIndex;
  steps[at].tie = false;
  for (let i = at + 1; i < steps.length; i++) {
    if (steps[i].chord != null || steps[i].note != null) break;
    steps[i].tie = true;
  }
  return { ...pattern, steps };
}

/** The chord record a step plays, or null if it plays its own note instead. */
export function stepChord(pattern, index) {
  const at = pattern?.steps?.[index]?.chord;
  if (at == null) return null;
  return pattern.harmony?.chords?.[at] ?? null;
}

/** The pitch class the progression's key is rooted on. */
export const harmonyKeyRoot = (harmony) => pitchClassAt(harmony?.keyPosition ?? 0);

/** The MIDI notes a step's chord sounds, or null if the step has no chord. */
export function stepChordNotes(pattern, index) {
  const chord = stepChord(pattern, index);
  if (!chord) return null;
  return chordMidiNotes(chord, { keyRoot: harmonyKeyRoot(pattern.harmony), mode: pattern.harmony.mode });
}

/**
 * What a step plays: the notes to start, and how long to hold them.
 *
 * A step starts either a chord from the progression or its own single note; a chord wins, because
 * its notes are absolute and the step's note would be a second, unrelated thing to hear. Each
 * tied rest after it extends what started by another step, so a note followed by tied rests is
 * one long note. Returns null when nothing starts on this step.
 */
export function stepEvents(pattern, index) {
  const steps = pattern.steps;
  const s = steps[index];
  if (!s) return null;
  const chordNotes = stepChordNotes(pattern, index);
  if (!chordNotes && s.note == null) return null;
  let length = 1;
  for (let i = index + 1; i < steps.length && steps[i].tie && steps[i].note == null && steps[i].chord == null; i++) length++;
  return { notes: chordNotes || [s.note], velocity: s.vel, steps: length };
}

/**
 * The same pattern moved by whole semitones, or null if that would push a note off the
 * keyboard. Refusing is better than clamping: a clamped sweep silently collapses into unison.
 *
 * A progression moves by whole octaves only. Its chords are held as degrees of a key, so moving
 * them by some other interval would mean either rewriting every degree or changing the key, and
 * both of those are edits the user should make on purpose rather than have happen to them while
 * the octave button is pressed. An octave is `registerOctaves`, which is a field the chord
 * already has, and which SpaceAge clamps to three either way.
 */
export function shiftPattern(pattern, semitones) {
  const notes = pattern.steps.filter((s) => s.note != null);
  if (notes.some((s) => s.note + semitones < 0 || s.note + semitones > 127)) return null;
  const chords = pattern.harmony?.chords ?? [];
  let moved = chords;
  if (chords.length) {
    if (semitones % 12 !== 0) return null;
    const octaves = semitones / 12;
    if (chords.some((c) => Math.abs(c.registerOctaves + octaves) > 3)) return null;
    moved = chords.map((c) => ({ ...c, registerOctaves: c.registerOctaves + octaves }));
  }
  return {
    ...pattern,
    harmony: { ...pattern.harmony, chords: moved },
    steps: pattern.steps.map((s) => (s.note == null ? { ...s } : { ...s, note: s.note + semitones })),
  };
}
