// The musical model behind Chord Lab: pitch classes, keys, degrees, qualities and voicings.
//
// This is a port of SpaceAge's chord engine, and it is deliberately a port rather than a fresh
// implementation. The originals are:
//
//   Source/SpaceageCircleOfFifths.h   spaceage::fifths::WheelModel   the wheel and its spelling
//   Source/PluginEditor.cpp           chordFormulas()                the 43 qualities
//   Source/PluginEditor.cpp           scaleDefinitions()             the 50 scales
//   Source/PluginEditor.cpp           romanNumeralForScaleDegree()   numerals derived from triads
//   Source/PluginEditor.cpp           chordMidiNotesForClip()        degree -> MIDI notes
//   Source/PluginProcessor.cpp        applyChordVoicing()            drop voicings
//
// SpaceAge's own gates (FIFTHS, CHORD_ROMAN) are the specification for all of it. Their cases are
// written out as data in tests/harmony.test.js; if the two implementations ever disagree,
// SpaceAge is right, because its gates predate this file.
//
// Nothing here touches the DOM, `window` or any global, and it imports nothing from OWL. That is
// what would let it be swapped for a genuinely shared package later without touching the view.
//
// Units: every note is a MIDI note number, every interval is in semitones, and every pitch class
// is 0-11 with 0 = C. There are no fractions in this file.

// ---------------------------------------------------------------- symbols
// Built from code points, and compared as code points. SpaceAge writes these the same way for a
// reason worth repeating even though the compiler bug behind it cannot recur here: MSVC turned a
// universal character name into the execution charset and produced two strings that looked
// identical on screen but did not compare equal. Never compare a symbol by what it looks like.
export const SHARP = "♯";
export const FLAT = "♭";
export const DIMINISHED = "°";

// ---------------------------------------------------------------- the wheel
export const WHEEL_POSITIONS = 12;

// Clockwise from the top in fifths: C G D A E B F#/Gb Db Ab Eb Bb F.
const WHEEL = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export const wrap = (position) => (((position | 0) % WHEEL_POSITIONS) + WHEEL_POSITIONS) % WHEEL_POSITIONS;

export const pitchClassAt = (position) => WHEEL[wrap(position)];

export function positionOfPitchClass(pitchClass) {
  const wanted = ((pitchClass % 12) + 12) % 12;
  const found = WHEEL.indexOf(wanted);
  return found < 0 ? 0 : found;
}

// Names are spelled the way the key spells them: F sharp major has an F sharp in it, D flat major
// has a D flat, and printing one for the other is the kind of detail a chart is judged on.
const MAJOR_NAMES = ["C", "G", "D", "A", "E", "B", "F" + SHARP, "D" + FLAT, "A" + FLAT, "E" + FLAT, "B" + FLAT, "F"];
const MINOR_NAMES = [
  "Am", "Em", "Bm", "F" + SHARP + "m", "C" + SHARP + "m", "G" + SHARP + "m",
  "D" + SHARP + "m", "B" + FLAT + "m", "Fm", "Cm", "Gm", "Dm",
];
const KEY_SIGNATURES = [
  "no sharps or flats", "1 sharp", "2 sharps", "3 sharps", "4 sharps", "5 sharps",
  "6 sharps", "5 flats", "4 flats", "3 flats", "2 flats", "1 flat",
];

export const majorName = (position) => MAJOR_NAMES[wrap(position)];
export const minorName = (position) => MINOR_NAMES[wrap(position)];
export const keySignature = (position) => KEY_SIGNATURES[wrap(position)];

/** A key past position 6 is spelled with flats. */
export const usesFlats = (position) => wrap(position) >= 7;

/**
 * Which scale degree, if any, the major ring holds at `position` when the tonic is at
 * `keyPosition`. -1 for the five chords outside the key.
 *
 * vii is the only diminished one, and it lands five steps clockwise because its root is the
 * leading note: in C, that is B, which sits where B major sits on the wheel.
 */
export function majorRingDegree(keyPosition, position) {
  const offset = wrap(position - keyPosition);
  if (offset === 0) return 0; // I
  if (offset === 1) return 4; // V
  if (offset === 11) return 3; // IV
  if (offset === 5) return 6; // vii, diminished
  return -1;
}

export function minorRingDegree(keyPosition, position) {
  const offset = wrap(position - keyPosition);
  if (offset === 0) return 5; // vi
  if (offset === 1) return 2; // iii
  if (offset === 11) return 1; // ii
  return -1;
}

export const degreeIsDiminished = (degree) => degree === 6;

const NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii"];

export function degreeNumeral(degree) {
  if (!(degree >= 0 && degree < 7)) return "";
  return NUMERALS[degree] + (degree === 6 ? DIMINISHED : "");
}

// A key's seven degrees use its seven letters in order, each exactly once: the second degree of
// D flat major is a kind of E, whatever accidental that needs, and never a kind of D.
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PITCH_CLASS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

// Which letter a tonic takes, depending on whether the key is being spelled with sharps or flats.
// Pitch class 6 is F sharp to a sharp key and G flat to a flat one, and the letter it starts from
// decides how the whole scale above it is spelled.
const SHARP_TONIC_LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const FLAT_TONIC_LETTER = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

const SHARP_NAMES = ["C", "C" + SHARP, "D", "D" + SHARP, "E", "F", "F" + SHARP, "G", "G" + SHARP, "A", "A" + SHARP, "B"];
const FLAT_NAMES = ["C", "D" + FLAT, "D", "E" + FLAT, "E", "F", "G" + FLAT, "G", "A" + FLAT, "A", "B" + FLAT, "B"];

/** A plain name for a pitch class, when nothing better is available. */
export function pitchClassName(pitchClass, preferFlats = false) {
  const pc = ((Math.round(pitchClass) % 12) + 12) % 12;
  return preferFlats ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}

/**
 * How a key spells its own nth degree: a letter, and whatever accidental puts that letter on the
 * right pitch. Ported from `spelledScaleDegreeName` in SpaceAge's PluginEditor.cpp.
 *
 * `keyRoot` is a pitch class 0-11, not a wheel position.
 *
 * **This works for every seven-note scale, not only major.** A scale of seven notes uses each of
 * the seven letters once, in order from the tonic, whatever its intervals are: E Phrygian
 * Dominant is E F G sharp A B C D, and each of those is the letter its degree is owed. That is
 * what lets the exotic scales carry real note names rather than only roman numerals.
 *
 * Scales that are not seven notes have no such letter to be owed - a pentatonic skips two of
 * them, a diminished scale needs eight - so those fall back to a plain chromatic name, spelled
 * with sharps or flats as `preferFlats` says.
 *
 * The derivation matters. Naming a degree by reading `majorName` at another wheel position, which
 * is what SpaceAge's wheel did, goes wrong wherever a degree lands past position 6, because that
 * table switches to flats regardless of the key being spelled: it printed D flat for the seventh
 * degree of D major, the right pitch under the wrong name.
 */
export function degreeSpelling(keyRoot, mode, degree, preferFlats = false) {
  const scale = scaleByMode(mode);
  const count = Math.max(1, scale.count);
  const d = clampInt(degree, 0, count - 1);
  const root = clampInt(keyRoot, 0, 11);
  const target = (root + scale.intervals[d]) % 12;
  if (count !== 7) return pitchClassName(target, preferFlats);

  const from = (preferFlats ? FLAT_TONIC_LETTER : SHARP_TONIC_LETTER)[root];
  const letterIndex = (from + d) % 7;
  // Shortest signed distance from the natural letter to the pitch we want, so a letter a semitone
  // sharp is a sharp rather than eleven flats.
  const accidental = ((target - LETTER_PITCH_CLASS[letterIndex] + 18) % 12) - 6;
  const symbol = accidental > 0 ? SHARP : FLAT;
  return LETTERS[letterIndex] + symbol.repeat(Math.min(3, Math.abs(accidental)));
}

/**
 * The chord's own name in a major key, for a slot label. The minor degrees carry an m and the
 * diminished seventh degree gets its symbol, because "B" alone would be a lie about what sounds.
 *
 * This is the wheel's own naming and stays major-only on purpose: it is what SpaceAge's FIFTHS
 * gate sweeps. Everything else goes through `chordLabel`, which handles any scale.
 */
export function chordName(keyPosition, degree) {
  if (!(degree >= 0 && degree < 7)) return "";
  const key = wrap(keyPosition);
  const base = degreeSpelling(pitchClassAt(key), MODE_MAJOR, degree, usesFlats(key));
  if (degree === 6) return base + DIMINISHED;
  if (degree === 1 || degree === 2 || degree === 5) return base + "m";
  return base;
}

// ---------------------------------------------------------------- scales
// SpaceAge's scaleDefinitions(), in order and unedited: the index is the mode number that a
// saved chord carries, so the order is a contract, not a preference.
export const SCALES = [
  { name: "Scale Off", intervals: [0, 2, 4, 5, 7, 9, 11], count: 7 },
  { name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11], count: 7 },
  { name: "Natural Minor", intervals: [0, 2, 3, 5, 7, 8, 10], count: 7 },
  { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10], count: 7 },
  { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], count: 7 },
  { name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11], count: 7 },
  { name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10], count: 7 },
  { name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10], count: 7 },
  { name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11], count: 7 },
  { name: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10], count: 5 },
  { name: "Major Pentatonic", intervals: [0, 2, 4, 7, 9], count: 5 },
  { name: "Minor Blues", intervals: [0, 3, 5, 6, 7, 10], count: 6 },
  { name: "Major Blues", intervals: [0, 2, 3, 4, 7, 9], count: 6 },
  { name: "Melodic Minor", intervals: [0, 2, 3, 5, 7, 9, 11], count: 7 },
  { name: "Dorian b2", intervals: [0, 1, 3, 5, 7, 9, 10], count: 7 },
  { name: "Lydian Augmented", intervals: [0, 2, 4, 6, 8, 9, 11], count: 7 },
  { name: "Lydian Dominant", intervals: [0, 2, 4, 6, 7, 9, 10], count: 7 },
  { name: "Mixolydian b6", intervals: [0, 2, 4, 5, 7, 8, 10], count: 7 },
  { name: "Half-Diminished", intervals: [0, 2, 3, 5, 6, 8, 10], count: 7 },
  { name: "Super Locrian", intervals: [0, 1, 3, 4, 6, 8, 10], count: 7 },
  { name: "Neapolitan Minor", intervals: [0, 1, 3, 5, 7, 8, 11], count: 7 },
  { name: "Neapolitan Major", intervals: [0, 1, 3, 5, 7, 9, 11], count: 7 },
  { name: "Oriental", intervals: [0, 1, 4, 5, 6, 9, 10], count: 7 },
  { name: "Double Harmonic", intervals: [0, 1, 4, 5, 7, 8, 11], count: 7 },
  { name: "Hungarian Gypsy", intervals: [0, 2, 3, 6, 7, 8, 11], count: 7 },
  { name: "Phrygian Dominant", intervals: [0, 1, 4, 5, 7, 8, 10], count: 7 },
  { name: "Persian", intervals: [0, 1, 4, 5, 6, 8, 11], count: 7 },
  { name: "Hindu (Aeolian Dominant)", intervals: [0, 2, 4, 5, 7, 8, 10], count: 7 },
  { name: "Enigmatic", intervals: [0, 1, 4, 6, 8, 10, 11], count: 7 },
  { name: "Romanian", intervals: [0, 2, 3, 6, 7, 9, 10], count: 7 },
  { name: "Whole Tone", intervals: [0, 2, 4, 6, 8, 10], count: 6 },
  { name: "Diminished Whole-Half", intervals: [0, 2, 3, 5, 6, 8, 9, 11], count: 8 },
  { name: "Diminished Half-Whole", intervals: [0, 1, 3, 4, 6, 7, 9, 10], count: 8 },
  { name: "Hirajoshi", intervals: [0, 2, 3, 7, 8], count: 5 },
  { name: "Harmonic Major", intervals: [0, 2, 4, 5, 7, 8, 11], count: 7 },
  { name: "Hungarian Major", intervals: [0, 3, 4, 6, 7, 9, 10], count: 7 },
  { name: "Ukrainian Dorian", intervals: [0, 2, 3, 6, 7, 9, 10], count: 7 },
  { name: "Lydian Minor", intervals: [0, 2, 4, 6, 7, 8, 10], count: 7 },
  { name: "Arabic", intervals: [0, 2, 4, 5, 6, 8, 10], count: 7 },
  { name: "Byzantine", intervals: [0, 1, 4, 5, 7, 8, 11], count: 7 },
  { name: "In Sen", intervals: [0, 1, 5, 7, 10], count: 5 },
  { name: "Iwato", intervals: [0, 1, 5, 6, 10], count: 5 },
  { name: "Kumoi", intervals: [0, 2, 3, 7, 9], count: 5 },
  { name: "Kumoi Pentatonic", intervals: [0, 1, 5, 6, 10], count: 5 },
  { name: "Dominant Pentatonic", intervals: [0, 4, 5, 7, 10], count: 5 },
  { name: "Phrygian Kumoi Pentatonic", intervals: [0, 1, 5, 7, 10], count: 5 },
  { name: "Yo", intervals: [0, 2, 5, 7, 9], count: 5 },
  { name: "Pelog", intervals: [0, 1, 3, 7, 8], count: 5 },
  { name: "Bebop Dominant", intervals: [0, 2, 4, 5, 7, 9, 10, 11], count: 8 },
  { name: "Bebop Major", intervals: [0, 2, 4, 5, 7, 8, 9, 11], count: 8 },
];

/** The mode index Major sits at: the default scale, and the one the wheel naming still assumes. */
export const MODE_MAJOR = 1;

export const scaleByMode = (mode) => SCALES[clampInt(mode, 0, SCALES.length - 1)];
export const scaleModeNamed = (name) => SCALES.findIndex((s) => s.name === name);

// ---------------------------------------------------------------- qualities
// SpaceAge's chordFormulas(), in order and unedited. `scaleRelative` means the intervals are
// counted in scale degrees rather than semitones, so a "Triad" is whatever triad the key builds
// on that degree, major or minor or diminished, without being told which.
export const QUALITIES = [
  { name: "Triad", suffix: "", intervals: [0, 2, 4], count: 3, scaleRelative: true },
  { name: "7th", suffix: "7", intervals: [0, 2, 4, 6], count: 4, scaleRelative: true },
  { name: "sus2", suffix: "sus2", intervals: [0, 2, 7], count: 3, scaleRelative: false },
  { name: "sus4", suffix: "sus4", intervals: [0, 5, 7], count: 3, scaleRelative: false },
  { name: "add9", suffix: "add9", intervals: [0, 2, 4, 8], count: 4, scaleRelative: true },
  { name: "Maj7", suffix: "Maj7", intervals: [0, 4, 7, 11], count: 4, scaleRelative: false },
  { name: "min7", suffix: "min7", intervals: [0, 3, 7, 10], count: 4, scaleRelative: false },
  { name: "7", suffix: "7", intervals: [0, 4, 7, 10], count: 4, scaleRelative: false },
  { name: "minMaj7", suffix: "minMaj7", intervals: [0, 3, 7, 11], count: 4, scaleRelative: false },
  { name: "dim", suffix: "dim", intervals: [0, 3, 6], count: 3, scaleRelative: false },
  { name: "dim7", suffix: "dim7", intervals: [0, 3, 6, 9], count: 4, scaleRelative: false },
  { name: "min7b5", suffix: "min7b5", intervals: [0, 3, 6, 10], count: 4, scaleRelative: false },
  { name: "aug", suffix: "aug", intervals: [0, 4, 8], count: 3, scaleRelative: false },
  { name: "augMaj7", suffix: "augMaj7", intervals: [0, 4, 8, 11], count: 4, scaleRelative: false },
  { name: "6", suffix: "6", intervals: [0, 4, 7, 9], count: 4, scaleRelative: false },
  { name: "min6", suffix: "min6", intervals: [0, 3, 7, 9], count: 4, scaleRelative: false },
  { name: "6/9", suffix: "6/9", intervals: [0, 4, 7, 9, 14], count: 5, scaleRelative: false },
  { name: "9", suffix: "9", intervals: [0, 4, 7, 10, 14], count: 5, scaleRelative: false },
  { name: "min9", suffix: "min9", intervals: [0, 3, 7, 10, 14], count: 5, scaleRelative: false },
  { name: "Maj9", suffix: "Maj9", intervals: [0, 4, 7, 11, 14], count: 5, scaleRelative: false },
  { name: "7b9", suffix: "7b9", intervals: [0, 4, 7, 10, 13], count: 5, scaleRelative: false },
  { name: "7#9", suffix: "7#9", intervals: [0, 4, 7, 10, 15], count: 5, scaleRelative: false },
  { name: "quartal", suffix: "quartal", intervals: [0, 5, 10, 15], count: 4, scaleRelative: false },
  { name: "5", suffix: "5", intervals: [0, 7, 12], count: 3, scaleRelative: false },
  { name: "Promethean", suffix: "Promethean", intervals: [0, 4, 6, 10, 14, 21], count: 6, scaleRelative: false },
  { name: "Maj", suffix: "Maj", intervals: [0, 4, 7], count: 3, scaleRelative: false },
  { name: "min", suffix: "min", intervals: [0, 3, 7], count: 3, scaleRelative: false },
  { name: "add11", suffix: "add11", intervals: [0, 4, 7, 17], count: 4, scaleRelative: false },
  { name: "add#11", suffix: "add#11", intervals: [0, 4, 7, 18], count: 4, scaleRelative: false },
  { name: "7sus4", suffix: "7sus4", intervals: [0, 5, 7, 10], count: 4, scaleRelative: false },
  { name: "9sus4", suffix: "9sus4", intervals: [0, 5, 7, 10, 14], count: 5, scaleRelative: false },
  { name: "11", suffix: "11", intervals: [0, 4, 7, 10, 14, 17], count: 6, scaleRelative: false },
  { name: "min11", suffix: "min11", intervals: [0, 3, 7, 10, 14, 17], count: 6, scaleRelative: false },
  { name: "Maj11", suffix: "Maj11", intervals: [0, 4, 7, 11, 14, 17], count: 6, scaleRelative: false },
  { name: "13", suffix: "13", intervals: [0, 4, 7, 10, 14, 21], count: 6, scaleRelative: false },
  { name: "min13", suffix: "min13", intervals: [0, 3, 7, 10, 14, 21], count: 6, scaleRelative: false },
  { name: "Maj13", suffix: "Maj13", intervals: [0, 4, 7, 11, 14, 21], count: 6, scaleRelative: false },
  { name: "7b5", suffix: "7b5", intervals: [0, 4, 6, 10], count: 4, scaleRelative: false },
  { name: "7#5", suffix: "7#5", intervals: [0, 4, 8, 10], count: 4, scaleRelative: false },
  { name: "7#11", suffix: "7#11", intervals: [0, 4, 7, 10, 18], count: 5, scaleRelative: false },
  { name: "7b13", suffix: "7b13", intervals: [0, 4, 7, 10, 20], count: 5, scaleRelative: false },
  { name: "min9Maj7", suffix: "min9Maj7", intervals: [0, 3, 7, 11, 14], count: 5, scaleRelative: false },
  { name: "cluster", suffix: "cluster", intervals: [0, 1, 2, 3, 4], count: 5, scaleRelative: false },
];

export const QUALITY_MAX = QUALITIES.length - 1;
export const qualityByIndex = (quality) => QUALITIES[clampInt(quality, 0, QUALITY_MAX)];

/** The four voicings, in SpaceAge's order: the index is what a saved chord carries. */
export const VOICINGS = [
  { id: 0, label: "Closed", hint: "Every note in one octave, as the formula stacks them" },
  { id: 1, label: "Drop 2", hint: "The second note from the top dropped an octave: the standard open voicing" },
  { id: 2, label: "Drop 3", hint: "The third note from the top dropped an octave: wider still" },
  { id: 3, label: "Drop 2 and 4", hint: "Two notes dropped: the widest spread, and the one most likely to clip" },
];

// ---------------------------------------------------------------- roman numerals
// Ported from romanNumeralForScaleDegree(). Case and symbol come from the triad the engine
// actually stacks on the degree, so the label cannot drift from what you hear. The accidental
// comes from comparing the degree against a reference scale in the same position, which is what
// gives Lydian a #IV rather than a bV.
const MAJOR_REFERENCE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_REFERENCE = [0, 2, 3, 5, 7, 8, 10];
const NUMERAL_BASES = ["I", "II", "III", "IV", "V", "VI", "VII"];
// Interval to numeral base and accidental, used when the scale is not seven notes.
const CHROMATIC_BASE = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const CHROMATIC_SHIFT = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];

const accidentalString = (accidental) => (accidental > 0 ? "#" : "b").repeat(Math.abs(accidental));

/** The pitch class of a degree's root, relative to a key root. */
export function degreeRootPitchClass(keyRoot, mode, degree, rootOffsetSemitones = 0) {
  const scale = scaleByMode(mode);
  const safeDegree = clampInt(degree, 0, Math.max(1, scale.count) - 1);
  return (clampInt(keyRoot, 0, 11) + scale.intervals[safeDegree] + rootOffsetSemitones + 120) % 12;
}

/** The pitch class of one voice of a chord. */
export function chordVoicePitchClass(keyRoot, mode, degree, quality, voiceIndex, rootOffsetSemitones = 0) {
  const scale = scaleByMode(mode);
  const degreeCount = Math.max(1, scale.count);
  const safeDegree = clampInt(degree, 0, degreeCount - 1);
  const formula = qualityByIndex(quality);
  const safeVoice = clampInt(voiceIndex, 0, Math.max(0, formula.count - 1));
  const safeRoot = clampInt(keyRoot, 0, 11);

  if (!formula.scaleRelative) {
    return (degreeRootPitchClass(safeRoot, mode, safeDegree, rootOffsetSemitones) + formula.intervals[safeVoice]) % 12;
  }
  const totalDegree = safeDegree + formula.intervals[safeVoice];
  const octave = Math.trunc(totalDegree / degreeCount);
  const scaleDegree = ((totalDegree % degreeCount) + degreeCount) % degreeCount;
  return (safeRoot + scale.intervals[scaleDegree] + octave * 12 + rootOffsetSemitones + 120) % 12;
}

/** The third of the triad the engine stacks on a scale's own tonic, which decides the frame. */
const tonicTriadThird = (mode) =>
  (chordVoicePitchClass(0, mode, 0, 0, 1) - degreeRootPitchClass(0, mode, 0) + 12) % 12;
const tonicTriadIsMinor = (mode) => tonicTriadThird(mode) === 3;

/**
 * The roman numeral for a scale degree, derived from the scale itself rather than looked up.
 *
 * A stack that is not a triad at all - which is what happens on a pentatonic or whole-tone scale,
 * where degree, degree+2 and degree+4 are not thirds - gets a plain uppercase numeral with no
 * quality symbol, because there is no triad quality to report.
 */
export function romanNumeralForScaleDegree(mode, degree) {
  const scale = scaleByMode(mode);
  const degreeCount = Math.max(1, scale.count);
  const safeDegree = clampInt(degree, 0, degreeCount - 1);

  let baseIndex = safeDegree;
  let accidental = 0;
  if (degreeCount === 7) {
    // Accidentals are relative to the scale's own tonic quality, not always to the parallel
    // major: a scale with a minor tonic triad is read in a minor frame, the way a minor key
    // signature already carries its flats. This keeps Natural Minor as i ii* III iv v VI VII
    // rather than spelling three flats the key already implies, and leaves Major untouched.
    const reference = tonicTriadIsMinor(mode) ? MINOR_REFERENCE : MAJOR_REFERENCE;
    accidental = scale.intervals[safeDegree] - reference[safeDegree];
  } else {
    const interval = ((scale.intervals[safeDegree] % 12) + 12) % 12;
    baseIndex = CHROMATIC_BASE[interval];
    accidental = CHROMATIC_SHIFT[interval];
  }
  accidental = clampInt(accidental, -2, 2);

  // Quality 0 is the scale-relative triad, so this is the same chord the degree inserts.
  const root = degreeRootPitchClass(0, mode, safeDegree);
  const third = (chordVoicePitchClass(0, mode, safeDegree, 0, 1) - root + 12) % 12;
  const fifth = (chordVoicePitchClass(0, mode, safeDegree, 0, 2) - root + 12) % 12;
  const minorThird = third === 3;
  const majorThird = third === 4;

  let numeral = accidentalString(accidental);
  numeral += minorThird ? NUMERAL_BASES[baseIndex].toLowerCase() : NUMERAL_BASES[baseIndex];
  if (minorThird && fifth === 6) numeral += DIMINISHED;
  else if (majorThird && fifth === 8) numeral += "+";
  return numeral;
}

/**
 * The chord quality a degree has in its scale, as the suffix a reader expects: Am, B dim, C aug.
 * "A" on its own is not neutral, it reads as A major. That is the whole reason to print the
 * suffix: a capital letter alone is a claim.
 */
export function scaleDegreeQualitySuffix(mode, degree) {
  const numeral = romanNumeralForScaleDegree(mode, degree);
  if (!numeral) return "";
  if (numeral.includes(DIMINISHED)) return "dim";
  if (numeral.endsWith("+")) return "aug";
  const letters = numeral.replace(/[^ivIV]/g, "");
  if (!letters) return "";
  return letters === letters.toLowerCase() ? "m" : "";
}

// ---------------------------------------------------------------- voicings
/**
 * Drop voicings, ported verbatim from applyChordVoicing(). Edits `notes` in place.
 *
 * A drop voicing lowers one note of a close stack by an octave, counted from the top: drop 2
 * moves the second note down, drop 3 the third, drop 2-and-4 both. Below four voices there is
 * nothing to drop, which is why the function refuses rather than spreading a triad.
 */
export function applyChordVoicing(notes, voiceCount, voicing, minimumMidiNote = 0) {
  voiceCount = clampInt(voiceCount, 0, notes.length);
  voicing = clampInt(voicing, 0, 3);
  if (voicing === 0 || voiceCount < 4) return notes;

  const order = Array.from({ length: voiceCount }, (_, i) => i).sort((a, b) => notes[a] - notes[b]);
  const dropRank = (rank) => {
    const noteIndex = order[voiceCount - rank];
    notes[noteIndex] = Math.max(minimumMidiNote, notes[noteIndex] - 12);
  };
  if (voicing === 1 || voicing === 3) dropRank(2);
  if (voicing === 2) dropRank(3);
  if (voicing === 3) dropRank(4);
  return notes;
}

// ---------------------------------------------------------------- the chord record
//
// SpaceAge's ChordClip carries far more than this, because there it is a composition unit on a
// timeline with its own rhythm, pan and arpeggiator. OWL is a patch designer with one instrument
// and an existing step sequencer, so the port is a documented subset rather than the whole
// struct. **Fields SpaceAge has that OWL deliberately ignores**, and why:
//
//   start, length                 OWL's chord lives on a step of the existing loop instead
//   rhythmPattern, customRhythm*  the loop's own steps, velocities, ties and gate do this job
//   arpEnabled, arpMode, arpRate, arpGain, arpSaturation
//                                 the loop can already write an arpeggio out as steps; a second
//                                 arpeggiator inside a sequencer is two metaphors for one thing
//   strumTime, preserveStrumEnd   same reason
//   performancePan, panMotion*    OWL's preview is mono-summed; there is nothing to pan
//   chordGain                     level belongs to the patch here, not to a chord
//   velocity                      the step the chord sits on already has a velocity, and two
//                                 sources for one number is how an edit ends up falling on the
//                                 floor. The loop's velocity lane is the only one.
//   playbackMode, muted, pad      OWL has one instrument and no pads
//   customNoteCount, customMidiNotes
//                                 hand-entered chords; the wheel is the only input here
//
// Anything a chord record does carry is named exactly as SpaceAge names it, so the two can be
// compared field by field.

export const MAX_VOICES = 6;

export function defaultChord() {
  return {
    degree: 0,
    rootOffsetSemitones: 0,
    quality: 0, // Triad
    inversion: 0,
    voicing: 0, // closed
    registerOctaves: 0,
  };
}

/** Force a chord into legal shape, whatever it was loaded from. */
export function sanitizeChord(c) {
  const base = defaultChord();
  return {
    degree: clampInt(c?.degree ?? base.degree, 0, 7),
    rootOffsetSemitones: clampInt(c?.rootOffsetSemitones ?? base.rootOffsetSemitones, -24, 24),
    quality: clampInt(c?.quality ?? base.quality, 0, QUALITY_MAX),
    inversion: clampInt(c?.inversion ?? base.inversion, 0, 3),
    voicing: clampInt(c?.voicing ?? base.voicing, 0, 3),
    registerOctaves: clampInt(c?.registerOctaves ?? base.registerOctaves, -3, 3),
  };
}

/**
 * The MIDI notes a chord sounds, ported from chordMidiNotesForClip().
 *
 * `keyRoot` is a pitch class 0-11 and `mode` is an index into SCALES. The result is sorted
 * ascending and every note is between 24 and 96, which is SpaceAge's range and is kept so the two
 * produce the same notes for the same chord.
 */
export function chordMidiNotes(chord, { keyRoot = 0, mode = MODE_MAJOR } = {}) {
  const c = sanitizeChord(chord);
  const scale = scaleByMode(mode);
  const formula = qualityByIndex(c.quality);
  const voiceCount = clampInt(formula.count, 1, MAX_VOICES);
  const degreeCount = Math.max(1, scale.count);
  const root = clampInt(keyRoot, 0, 11);
  const chordDegree = clampInt(c.degree, 0, Math.max(0, degreeCount - 1));
  const chordRootMidi = 48 + root + scale.intervals[chordDegree] + c.rootOffsetSemitones;

  const notes = [];
  for (let i = 0; i < voiceCount; i++) {
    let midi = chordRootMidi + formula.intervals[i];
    if (formula.scaleRelative) {
      const totalDegree = chordDegree + formula.intervals[i];
      const octave = Math.trunc(totalDegree / degreeCount);
      const degree = ((totalDegree % degreeCount) + degreeCount) % degreeCount;
      midi = 48 + root + octave * 12 + scale.intervals[degree] + c.rootOffsetSemitones;
    }
    if (i < c.inversion) midi += 12;
    midi += c.registerOctaves * 12;
    notes.push(clampInt(midi, 24, 96));
  }
  applyChordVoicing(notes, voiceCount, c.voicing, 24);
  notes.sort((a, b) => a - b);
  return notes;
}

// The suffix a reader expects for a stack, from the intervals that are actually sounding.
// Ported from chordTriadSuffixForDisplay and chordSeventhSuffixForDisplay.
function triadSuffix(third, fifth) {
  if (third === 3 && fifth === 7) return "m";
  if (third === 3 && fifth === 6) return DIMINISHED;
  if (third === 4 && fifth === 8) return "aug";
  return "";
}
function seventhSuffix(third, fifth, seventh) {
  if (third === 4 && fifth === 7 && seventh === 11) return "Maj7";
  if (third === 3 && fifth === 7 && seventh === 10) return "min7";
  if (third === 4 && fifth === 7 && seventh === 10) return "7";
  if (third === 3 && fifth === 6 && seventh === 10) return "min7b5";
  if (third === 3 && fifth === 6 && seventh === 9) return "dim7";
  if (third === 3 && fifth === 7 && seventh === 11) return "minMaj7";
  if (third === 4 && fifth === 8 && seventh === 11) return "augMaj7";
  return "7";
}

/**
 * The letter name of a chord's root, spelled the way its key and scale spell it.
 *
 * **Every scale gets a letter**, not only the major ones. An earlier version of this comment said
 * the opposite - that spelling an arbitrary mode needs an engine "which SpaceAge does not have
 * either" - and that was simply wrong: `spelledScaleDegreeName` in PluginEditor.cpp is exactly
 * that engine, and `degreeSpelling` above is a port of it. The mistake cost the exotic scales
 * their note names for a while; they were labelled with roman numerals alone, which tells a
 * player the function of a chord but not what to put their hands on.
 */
function rootLetter(keyPosition, mode, c, preferFlats) {
  const key = wrap(keyPosition);
  const flats = preferFlats ?? usesFlats(key);
  // A borrowed chord is not on a degree of the scale any more, so there is no letter it is owed.
  // Name it for the pitch it actually lands on and say so plainly.
  if (c.rootOffsetSemitones !== 0) {
    return { text: pitchClassName(degreeRootPitchClass(pitchClassAt(key), mode, c.degree, c.rootOffsetSemitones), flats), isLetter: true };
  }
  return { text: degreeSpelling(pitchClassAt(key), mode, c.degree, flats), isLetter: true };
}

/**
 * What to call a chord, for a slot label.
 *
 * A scale-relative quality has no fixed suffix - the whole point of it is that the key decides
 * whether the degree is major, minor or diminished - so the suffix is read off the intervals the
 * chord actually sounds. Taking the formula's own suffix instead would print "A7" for the seventh
 * chord on vi in C, which is a real chord and the wrong one: it is Am7.
 */
export function chordLabel(chord, { keyPosition = 0, mode = MODE_MAJOR, preferFlats } = {}) {
  const c = sanitizeChord(chord);
  const formula = qualityByIndex(c.quality);
  const { text } = rootLetter(keyPosition, mode, c, preferFlats);
  if (!formula.scaleRelative) return text + formula.suffix;

  const root = degreeRootPitchClass(0, mode, c.degree, c.rootOffsetSemitones);
  const above = (i) => (chordVoicePitchClass(0, mode, c.degree, c.quality, i, c.rootOffsetSemitones) - root + 12) % 12;
  const third = above(1);
  const fifth = above(2);
  // A stack whose fourth voice is a scale seventh is named as a seventh chord; anything else with
  // four or more voices keeps its own suffix on top of the triad quality, as add9 does.
  if (formula.count >= 4 && formula.intervals[3] === 6) return text + seventhSuffix(third, fifth, above(3));
  if (formula.count >= 4) return text + triadSuffix(third, fifth) + formula.suffix;
  return text + triadSuffix(third, fifth);
}

const clampInt = (n, lo, hi) => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
};
