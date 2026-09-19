// The audition loop's pattern: bench equipment, not part of a voice.
//
// A pattern is a short step sequence used to hear a patch while it is being edited, so the
// interesting settings are the diagnostic ones: a velocity ramp shows touch response, a wide
// sweep shows keyboard level and rate scaling, fast repeats show envelope retriggering, and a
// held note shows the sustain stage and the release tail. Nothing here is saved into a voice.

export const STEPS = 16;
export const MIN_BPM = 30;
export const MAX_BPM = 240;

// Note value of a step, as a fraction of a whole note.
export const DIVISIONS = [
  { id: "1/4", label: "1/4", beats: 1 },
  { id: "1/8", label: "1/8", beats: 0.5 },
  { id: "1/8T", label: "1/8 triplet", beats: 1 / 3 },
  { id: "1/16", label: "1/16", beats: 0.25 },
];

// Extra notes played with each step, for hearing detune beating and how a voice stacks up.
export const CHORDS = [
  { id: "off", label: "Single note", intervals: [0] },
  { id: "5th", label: "Fifths", intervals: [0, 7] },
  { id: "maj7", label: "Major 7th", intervals: [0, 4, 7, 11] },
  { id: "min9", label: "Minor 9th", intervals: [0, 3, 7, 10, 14] },
];

const step = (note, vel = 100, tie = false) => ({ note, vel, tie });
const rest = () => step(null);

export function defaultPattern() {
  return {
    bpm: 110,
    division: "1/8",
    chord: "off",
    gate: 0.8, // fraction of a step the key is held, unless the step is tied
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
    hint: "A slow chord: hear detune beating, chorus width and how the voice stacks up",
    make: () => ({
      ...defaultPattern(),
      bpm: 60,
      division: "1/4",
      chord: "maj7",
      steps: Array.from({ length: STEPS }, (_, i) => (i % 4 === 0 ? step(48 + (i >= 8 ? 5 : 0), 90) : step(null, 90, true))),
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
export const chordById = (id) => CHORDS.find((c) => c.id === id) || CHORDS[0];

/** How long one step lasts, in seconds. */
export const stepSeconds = (pattern) => (60 / clampBpm(pattern.bpm)) * divisionById(pattern.division).beats;
const clampBpm = (b) => Math.min(MAX_BPM, Math.max(MIN_BPM, b || 120));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Force a pattern into legal shape, whatever it was loaded from. */
export function sanitizePattern(p) {
  const base = defaultPattern();
  const steps = Array.from({ length: STEPS }, (_, i) => {
    const s = p?.steps?.[i] || {};
    const note = s.note == null ? null : clamp(s.note, 0, 127);
    return { note, vel: clamp(s.vel ?? 100, 1, 127), tie: !!s.tie };
  });
  return {
    bpm: clampBpm(p?.bpm ?? base.bpm),
    division: divisionById(p?.division).id,
    chord: chordById(p?.chord).id,
    gate: Math.min(1, Math.max(0.05, p?.gate ?? base.gate)),
    steps,
  };
}

/**
 * What a step plays: the notes to start, and how long to hold them.
 * A step with a note starts it; each tied rest after it extends that note by another step, so a
 * note followed by tied rests is one long note.
 * Returns null when nothing starts on this step.
 */
export function stepEvents(pattern, index) {
  const steps = pattern.steps;
  const s = steps[index];
  if (!s || s.note == null) return null;
  let length = 1;
  for (let i = index + 1; i < steps.length && steps[i].tie && steps[i].note == null; i++) length++;
  const intervals = chordById(pattern.chord).intervals;
  return { notes: intervals.map((iv) => Math.min(127, s.note + iv)), velocity: s.vel, steps: length };
}

/**
 * The same pattern moved by whole semitones, or null if that would push a note off the
 * keyboard. Refusing is better than clamping: a clamped sweep silently collapses into unison.
 */
export function shiftPattern(pattern, semitones) {
  const notes = pattern.steps.filter((s) => s.note != null);
  if (notes.some((s) => s.note + semitones < 0 || s.note + semitones > 127)) return null;
  return { ...pattern, steps: pattern.steps.map((s) => (s.note == null ? { ...s } : { ...s, note: s.note + semitones })) };
}
