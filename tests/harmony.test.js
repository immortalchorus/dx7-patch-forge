// The specification for dist/js/harmony.js, derived from SpaceAge's own gates.
//
// SpaceAge pins its chord engine with three self-tests in Tests/ProcessorUiChecks.cpp:
//
//   FIFTHS            sweeps all twelve keys and checks lit degrees, spelling, pitch classes,
//                     diminished marking and the hit test against the same model that draws it
//   CHORD_ROMAN       sweeps scales and checks numerals, qualities and accidentals
//   FIFTHS_HANDOVER   checks the sketch, the send and the MIDI export
//
// Those gates need a SpaceAge build, and building SpaceAge is not this project's business. What
// is written below instead is the *cases they assert*, expressed as data: the same twelve keys,
// the same named progressions, the same nine scales with their expected numerals. If OWL
// satisfies this table and SpaceAge satisfies its gates, the two agree.
//
// This table is meant to be handed back to the SpaceAge side and asserted against the gates
// there. If the two ever disagree, SpaceAge is right and this file is wrong: its gates predate
// this port.
//
// FIFTHS_HANDOVER has no counterpart here. It is about SpaceAge's sketch, lanes and MIDI export,
// none of which OWL has.

import test from "node:test";
import assert from "node:assert/strict";
import {
  SHARP, FLAT, DIMINISHED,
  WHEEL_POSITIONS, wrap, pitchClassAt, positionOfPitchClass,
  majorName, minorName, keySignature, usesFlats,
  majorRingDegree, minorRingDegree, degreeNumeral, chordName,
  SCALES, QUALITIES, QUALITY_MAX, MODE_MAJOR, scaleModeNamed,
  romanNumeralForScaleDegree, scaleDegreeQualitySuffix,
  applyChordVoicing, chordMidiNotes, sanitizeChord, defaultChord, chordLabel,
} from "../dist/js/harmony.js";

const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

// ---------------------------------------------------------------- the wheel itself

test("the wheel is twelve fifths, clockwise from C", () => {
  assert.equal(WHEEL_POSITIONS, 12);
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => pitchClassAt(i)),
    [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5],
  );
  // Each step clockwise is a fifth up.
  for (let i = 0; i < 12; i++) assert.equal(pitchClassAt(i + 1), (pitchClassAt(i) + 7) % 12);
});

test("position and pitch class round-trip, and wrap is a true modulo", () => {
  for (let pc = 0; pc < 12; pc++) assert.equal(pitchClassAt(positionOfPitchClass(pc)), pc);
  assert.equal(wrap(-1), 11);
  assert.equal(wrap(12), 0);
  assert.equal(wrap(-13), 11);
  assert.equal(pitchClassAt(-1), 5); // one step anticlockwise from C is F
});

// ---------------------------------------------------------------- FIFTHS: the twelve keys

test("FIFTHS: every key lights exactly seven degrees, once each", () => {
  for (let key = 0; key < 12; key++) {
    const seen = new Array(7).fill(0);
    for (const ring of [majorRingDegree, minorRingDegree]) {
      for (let position = 0; position < 12; position++) {
        const degree = ring(key, position);
        if (degree < 0) continue;
        assert.ok(degree >= 0 && degree < 7, `key ${key} produced degree ${degree}`);
        seen[degree]++;
      }
    }
    assert.equal(seen.reduce((a, b) => a + b, 0), 7, `key ${key} lit ${seen} degrees`);
    assert.deepEqual(seen, [1, 1, 1, 1, 1, 1, 1], `key ${key} lit a degree twice`);
  }
});

test("FIFTHS: each lit chord is rooted the right number of semitones above the tonic", () => {
  // A position names a pair - C major and A minor share one - so the inner ring's chord is rooted
  // a minor third below the outer ring's. Nine semitones up is the same note three semitones down.
  for (let key = 0; key < 12; key++) {
    for (const [ring, isMajorRing] of [[majorRingDegree, true], [minorRingDegree, false]]) {
      for (let position = 0; position < 12; position++) {
        const degree = ring(key, position);
        if (degree < 0) continue;
        const root = isMajorRing ? pitchClassAt(position) : (pitchClassAt(position) + 9) % 12;
        const expected = (pitchClassAt(key) + MAJOR_SCALE_SEMITONES[degree]) % 12;
        assert.equal(root, expected, `key ${key} position ${position} degree ${degree}`);
      }
    }
  }
});

test("FIFTHS: vii is diminished and its root is the leading note", () => {
  for (let key = 0; key < 12; key++) {
    const leadingNote = (pitchClassAt(key) + 11) % 12;
    assert.equal(pitchClassAt(wrap(key + 5)), leadingNote, `key ${key}`);
    assert.ok(chordName(key, 6).endsWith(DIMINISHED), `key ${key} vii is not marked diminished`);
  }
  assert.equal(degreeNumeral(6), "vii" + DIMINISHED);
  assert.deepEqual(
    Array.from({ length: 7 }, (_, d) => degreeNumeral(d)),
    ["I", "ii", "iii", "IV", "V", "vi", "vii" + DIMINISHED],
  );
  assert.equal(degreeNumeral(7), "");
  assert.equal(degreeNumeral(-1), "");
});

test("FIFTHS: chord names agree with the ring they came from", () => {
  // Two of these are musical facts and hold in every key: the first degree is the key itself, and
  // the sixth is its relative minor.
  for (let key = 0; key < 12; key++) {
    assert.equal(chordName(key, 0), majorName(key), `key ${key} I`);
    assert.equal(chordName(key, 5), minorName(key), `key ${key} vi`);
  }
  // The other four - ii, iii, IV, V against the neighbouring wheel positions - are *not* facts.
  // They are true only while no degree crosses the point where the name table switches from
  // sharps to flats, and SpaceAge asserted them as though they were always true, which is what
  // hid the mis-spellings. They are checked here as pitch, which is what the ring really promises.
  for (let key = 0; key < 12; key++) {
    // A position names a pair, so the minor ring's chord is rooted a minor third below the major
    // ring's: nine semitones up is the same note three semitones down.
    const samePitch = (name, position, isMajorRing) =>
      assert.equal(
        pitchClassOfName(name.replace(/m$/, "")),
        isMajorRing ? pitchClassAt(position) : (pitchClassAt(position) + 9) % 12,
        `key ${key}: ${name} should sound at position ${position}`,
      );
    samePitch(chordName(key, 3), wrap(key - 1), true);
    samePitch(chordName(key, 4), wrap(key + 1), true);
    samePitch(chordName(key, 1), wrap(key - 1), false);
    samePitch(chordName(key, 2), wrap(key + 1), false);
  }
});

/** The pitch class a printed chord name sounds, read back off the letter and its accidentals. */
function pitchClassOfName(name) {
  const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const sharps = (name.match(new RegExp(SHARP, "g")) || []).length;
  const flats = (name.match(new RegExp(FLAT, "g")) || []).length;
  return (letters[name[0]] + sharps - flats + 120) % 12;
}

// ---------------------------------------------------------------- spelling

test("spelling: the two keys that share a pitch class do not share a spelling", () => {
  // F sharp major has an F sharp; D flat major has a D flat. Printing one for the other is
  // wrong even though the keys sound identical.
  assert.equal(majorName(6), "F" + SHARP);
  assert.equal(usesFlats(6), false);
  assert.equal(majorName(7), "D" + FLAT);
  assert.equal(usesFlats(7), true);
  assert.notEqual(majorName(6), majorName(7));
});

test("spelling: every key's major and minor names, and its signature", () => {
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => majorName(i)),
    ["C", "G", "D", "A", "E", "B", "F" + SHARP, "D" + FLAT, "A" + FLAT, "E" + FLAT, "B" + FLAT, "F"],
  );
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => minorName(i)),
    ["Am", "Em", "Bm", "F" + SHARP + "m", "C" + SHARP + "m", "G" + SHARP + "m",
     "D" + SHARP + "m", "B" + FLAT + "m", "Fm", "Cm", "Gm", "Dm"],
  );
  assert.equal(keySignature(0), "no sharps or flats");
  assert.equal(keySignature(6), "6 sharps");
  assert.equal(keySignature(7), "5 flats");
  assert.equal(keySignature(11), "1 flat");
  // Flats begin past position 6, which is what tells the chord engine how to print its notes.
  for (let i = 0; i < 12; i++) assert.equal(usesFlats(i), i >= 7, `position ${i}`);
});

test("spelling: symbols are the right code points, not lookalikes", () => {
  // Rule 4 of the SpaceAge brief. A musical sharp is not an ASCII hash, and a musical flat is
  // not a lowercase b; comparing by appearance is how the original bug hid.
  assert.equal(SHARP.codePointAt(0), 0x266f);
  assert.equal(FLAT.codePointAt(0), 0x266d);
  assert.equal(DIMINISHED.codePointAt(0), 0x00b0);
  assert.notEqual(SHARP, "#");
  assert.notEqual(FLAT, "b");
  assert.notEqual(DIMINISHED, "o");
});

test("FIFTHS: known progressions, spelled out", () => {
  // A table can satisfy every rule above and still be rotated, so these are named outright.
  const progression = (key, degrees) => degrees.map((d) => chordName(key, d)).join(" ");
  assert.equal(progression(0, [0, 4, 5, 3]), "C G Am F");
  assert.equal(progression(1, [0, 4, 5, 3]), "G D Em C");
  assert.equal(
    progression(9, [0, 3, 4, 6]),
    `E${FLAT} A${FLAT} B${FLAT} D${DIMINISHED}`,
  );
});

// ---------------------------------------------------------------- CHORD_ROMAN

test("CHORD_ROMAN: numerals are derived from the triad the engine stacks", () => {
  // The table from SpaceAge's CHORD_ROMAN gate, verbatim. '*' stands in for the degree sign so
  // the table stays readable. A major-tonic scale is read against the parallel major and a
  // minor-tonic scale against the parallel natural minor, which is why Natural Minor carries no
  // flats here.
  const expectations = [
    ["Major", ["I", "ii", "iii", "IV", "V", "vi", "vii*"]],
    ["Natural Minor", ["i", "ii*", "III", "iv", "v", "VI", "VII"]],
    ["Dorian", ["i", "ii", "III", "IV", "v", "#vi*", "VII"]],
    ["Phrygian", ["i", "bII", "III", "iv", "v*", "VI", "vii"]],
    ["Lydian", ["I", "II", "iii", "#iv*", "V", "vi", "vii"]],
    ["Mixolydian", ["I", "ii", "iii*", "IV", "v", "vi", "bVII"]],
    ["Locrian", ["i*", "bII", "iii", "iv", "bV", "VI", "vii"]],
    ["Harmonic Minor", ["i", "ii*", "III+", "iv", "V", "VI", "#vii*"]],
    // The scale that started this. E Phrygian Dominant is E, F, G#dim, Am, Bdim, Caug, Dm; the
    // old code reported the plain major set for every degree but the first.
    ["Phrygian Dominant", ["I", "bII", "iii*", "iv", "v*", "bVI+", "bvii"]],
  ];
  for (const [name, degrees] of expectations) {
    const mode = scaleModeNamed(name);
    assert.ok(mode >= 0, `scale ${name} is missing`);
    for (let degree = 0; degree < 7; degree++) {
      const want = degrees[degree].replace("*", DIMINISHED);
      assert.equal(romanNumeralForScaleDegree(mode, degree), want, `${name} degree ${degree + 1}`);
    }
  }
});

test("CHORD_ROMAN: the quality suffix cannot disagree with the numeral beside it", () => {
  for (let mode = 0; mode < SCALES.length; mode++) {
    for (let degree = 0; degree < SCALES[mode].count; degree++) {
      const numeral = romanNumeralForScaleDegree(mode, degree);
      const suffix = scaleDegreeQualitySuffix(mode, degree);
      if (numeral.includes(DIMINISHED)) assert.equal(suffix, "dim");
      else if (numeral.endsWith("+")) assert.equal(suffix, "aug");
      else {
        const letters = numeral.replace(/[^ivIV]/g, "");
        assert.equal(suffix, letters === letters.toLowerCase() ? "m" : "");
      }
    }
  }
});

test("CHORD_ROMAN: every scale produces a numeral for every one of its degrees", () => {
  assert.equal(SCALES.length, 50);
  for (let mode = 0; mode < SCALES.length; mode++) {
    const scale = SCALES[mode];
    assert.equal(scale.intervals.length, scale.count, `${scale.name} interval count`);
    for (let degree = 0; degree < scale.count; degree++) {
      const numeral = romanNumeralForScaleDegree(mode, degree);
      assert.ok(numeral.length > 0, `${scale.name} degree ${degree} has no numeral`);
      // A numeral is an optional accidental, a base, and an optional quality symbol.
      assert.match(numeral, new RegExp(`^[#b]{0,2}(i{1,3}|iv|vi{0,2}|I{1,3}|IV|VI{0,2})[${DIMINISHED}+]?$`), `${scale.name} degree ${degree}: ${numeral}`);
    }
  }
});

// ---------------------------------------------------------------- voicings

test("applyChordVoicing: closed leaves the stack alone, and so does a triad", () => {
  const closed = [48, 52, 55, 59];
  assert.deepEqual(applyChordVoicing([...closed], 4, 0), closed);
  // Below four voices there is nothing to drop; a triad is returned untouched at every voicing.
  for (const voicing of [0, 1, 2, 3]) assert.deepEqual(applyChordVoicing([48, 52, 55], 3, voicing), [48, 52, 55]);
});

test("applyChordVoicing: drop 2, drop 3 and drop 2-and-4 lower the right note", () => {
  // C Maj7 closed: C3 E3 G3 B3.
  const closed = () => [48, 52, 55, 59];
  // Drop 2 lowers the second note from the top, G.
  assert.deepEqual(applyChordVoicing(closed(), 4, 1).slice().sort((a, b) => a - b), [43, 48, 52, 59]);
  // Drop 3 lowers the third from the top, E.
  assert.deepEqual(applyChordVoicing(closed(), 4, 2).slice().sort((a, b) => a - b), [40, 48, 55, 59]);
  // Drop 2-and-4 lowers the second and the fourth from the top: G and C.
  assert.deepEqual(applyChordVoicing(closed(), 4, 3).slice().sort((a, b) => a - b), [36, 43, 52, 59]);
});

test("applyChordVoicing: a dropped note never falls below the floor it is given", () => {
  assert.deepEqual(applyChordVoicing([24, 28, 31, 35], 4, 3, 24).slice().sort((a, b) => a - b), [24, 24, 28, 35]);
  // With no floor given it may go anywhere, which is what SpaceAge's default does.
  assert.deepEqual(applyChordVoicing([24, 28, 31, 35], 4, 1).slice().sort((a, b) => a - b), [19, 24, 28, 35]);
});

test("applyChordVoicing: out-of-range arguments are clamped, not obeyed", () => {
  assert.deepEqual(applyChordVoicing([48, 52, 55, 59], 4, 99).slice().sort((a, b) => a - b), [36, 43, 52, 59]); // as voicing 3
  assert.deepEqual(applyChordVoicing([48, 52, 55, 59], 4, -5), [48, 52, 55, 59]); // as voicing 0
  assert.deepEqual(applyChordVoicing([48, 52, 55, 59], 99, 1).slice().sort((a, b) => a - b), [43, 48, 52, 59]);
});

// ---------------------------------------------------------------- degree to notes

test("chordMidiNotes: the scale-relative triad builds the key's own chords", () => {
  const inC = (degree) => chordMidiNotes({ degree, quality: 0 }, { keyRoot: 0, mode: MODE_MAJOR });
  assert.deepEqual(inC(0), [48, 52, 55]); // C  major
  assert.deepEqual(inC(1), [50, 53, 57]); // Dm minor
  assert.deepEqual(inC(2), [52, 55, 59]); // Em minor
  assert.deepEqual(inC(3), [53, 57, 60]); // F  major
  assert.deepEqual(inC(4), [55, 59, 62]); // G  major
  assert.deepEqual(inC(5), [57, 60, 64]); // Am minor
  assert.deepEqual(inC(6), [59, 62, 65]); // B  diminished
});

test("chordMidiNotes: a fixed quality is measured in semitones, not scale degrees", () => {
  // Maj7 is quality 5 and is not scale-relative: it is the same shape on every degree.
  const maj7 = (degree) => chordMidiNotes({ degree, quality: 5 }, { keyRoot: 0, mode: MODE_MAJOR });
  assert.deepEqual(maj7(0), [48, 52, 55, 59]);
  assert.deepEqual(maj7(1), [50, 54, 57, 61]); // D Maj7, which is outside the key on purpose
  // The scale-relative 7th, by contrast, gives the key's own seventh chord on each degree.
  assert.deepEqual(chordMidiNotes({ degree: 1, quality: 1 }, { keyRoot: 0, mode: MODE_MAJOR }), [50, 53, 57, 60]); // Dm7
});

test("chordMidiNotes: the key root transposes every chord", () => {
  for (let root = 0; root < 12; root++) {
    const notes = chordMidiNotes({ degree: 0, quality: 0 }, { keyRoot: root, mode: MODE_MAJOR });
    assert.deepEqual(notes, [48 + root, 52 + root, 55 + root], `root ${root}`);
  }
});

test("chordMidiNotes: inversion lifts the lowest notes by an octave", () => {
  const maj7 = (inversion) => chordMidiNotes({ degree: 0, quality: 5, inversion }, { keyRoot: 0 });
  assert.deepEqual(maj7(0), [48, 52, 55, 59]);
  assert.deepEqual(maj7(1), [52, 55, 59, 60]);
  assert.deepEqual(maj7(2), [55, 59, 60, 64]);
  assert.deepEqual(maj7(3), [59, 60, 64, 67]);
});

test("chordMidiNotes: registerOctaves moves the whole chord, clamped to the engine's range", () => {
  assert.deepEqual(chordMidiNotes({ degree: 0, quality: 0, registerOctaves: 1 }, { keyRoot: 0 }), [60, 64, 67]);
  assert.deepEqual(chordMidiNotes({ degree: 0, quality: 0, registerOctaves: -1 }, { keyRoot: 0 }), [36, 40, 43]);
  // Two octaves down from C3 would be below 24, so the bottom note is held at the floor.
  assert.deepEqual(chordMidiNotes({ degree: 0, quality: 0, registerOctaves: -2 }, { keyRoot: 0 }), [24, 28, 31]);
  // registerOctaves is a SpaceAge field clamped to +-3; asking for more gets three.
  assert.deepEqual(
    chordMidiNotes({ degree: 0, quality: 0, registerOctaves: 9 }, { keyRoot: 0 }),
    chordMidiNotes({ degree: 0, quality: 0, registerOctaves: 3 }, { keyRoot: 0 }),
  );
});

test("chordMidiNotes: voicing is applied after the chord is built, with a floor of 24", () => {
  assert.deepEqual(chordMidiNotes({ degree: 0, quality: 5, voicing: 1 }, { keyRoot: 0 }), [43, 48, 52, 59]);
  assert.deepEqual(chordMidiNotes({ degree: 0, quality: 5, voicing: 3 }, { keyRoot: 0 }), [36, 43, 52, 59]);
  // Dropped low enough to hit the floor rather than run off the bottom of the range.
  const low = chordMidiNotes({ degree: 0, quality: 5, voicing: 3, registerOctaves: -2 }, { keyRoot: 0 });
  assert.ok(Math.min(...low) >= 24, `voicing pushed a note to ${Math.min(...low)}`);
});

test("chordMidiNotes: every quality produces its own voice count, in range and sorted", () => {
  assert.equal(QUALITIES.length, 43);
  assert.equal(QUALITY_MAX, 42);
  for (let quality = 0; quality <= QUALITY_MAX; quality++) {
    const formula = QUALITIES[quality];
    assert.equal(formula.intervals.length, formula.count, `${formula.name} interval count`);
    for (let degree = 0; degree < 7; degree++) {
      for (const voicing of [0, 1, 2, 3]) {
        const notes = chordMidiNotes({ degree, quality, voicing }, { keyRoot: 0, mode: MODE_MAJOR });
        assert.equal(notes.length, formula.count, `${formula.name} degree ${degree}`);
        for (const n of notes) {
          assert.ok(Number.isInteger(n), `${formula.name} produced ${n}`);
          assert.ok(n >= 24 && n <= 96, `${formula.name} produced ${n}, outside 24-96`);
        }
        for (let i = 1; i < notes.length; i++) assert.ok(notes[i] >= notes[i - 1], `${formula.name} came back unsorted`);
      }
    }
  }
});

test("chordMidiNotes: a chord behaves the same whatever scale length it is asked for", () => {
  // Pentatonic and eight-note scales have degree counts other than seven; a degree past the end
  // is clamped to the last one rather than wrapping into a different chord.
  for (let mode = 0; mode < SCALES.length; mode++) {
    const scale = SCALES[mode];
    const past = chordMidiNotes({ degree: 7, quality: 0 }, { keyRoot: 0, mode });
    const last = chordMidiNotes({ degree: scale.count - 1, quality: 0 }, { keyRoot: 0, mode });
    assert.deepEqual(past, last, `${scale.name} did not clamp a degree past its end`);
  }
});

// ---------------------------------------------------------------- the chord record

test("sanitizeChord: garbage in, legal data out", () => {
  assert.deepEqual(sanitizeChord(undefined), defaultChord());
  assert.deepEqual(sanitizeChord(null), defaultChord());
  assert.deepEqual(sanitizeChord({}), defaultChord());
  const wild = sanitizeChord({
    degree: 99, rootOffsetSemitones: -999, quality: 1e9, inversion: -4,
    voicing: "3", registerOctaves: 42, velocity: 90, pad: 7, chordGain: 2, arpEnabled: true,
  });
  assert.deepEqual(wild, {
    degree: 7, rootOffsetSemitones: -24, quality: QUALITY_MAX, inversion: 0,
    voicing: 3, registerOctaves: 3,
  });
  // Fields OWL does not port are dropped rather than carried along as dead weight.
  assert.equal("pad" in wild, false);
  assert.equal("velocity" in wild, false); // the step the chord sits on owns velocity
  assert.equal("arpEnabled" in wild, false);
  // Text and NaN fall to the bottom of the range rather than poisoning the arithmetic.
  const bad = sanitizeChord({ degree: "x", quality: NaN, rootOffsetSemitones: Infinity });
  assert.equal(bad.degree, 0);
  assert.equal(bad.quality, 0);
  assert.equal(bad.rootOffsetSemitones, -24);
  for (const value of Object.values(bad)) assert.ok(Number.isInteger(value));
});

test("sanitizeChord: a sanitised chord always names real notes", () => {
  const notes = chordMidiNotes(sanitizeChord({ degree: 1e9, quality: -1e9, voicing: NaN }), { keyRoot: 99, mode: 1e9 });
  assert.ok(notes.length > 0);
  for (const n of notes) assert.ok(n >= 24 && n <= 96);
});

test("chordLabel: a chord is named the way its key spells it", () => {
  // The plain triad takes the wheel's own spelling.
  assert.equal(chordLabel({ degree: 0, quality: 0 }, { keyPosition: 0 }), "C");
  assert.equal(chordLabel({ degree: 5, quality: 0 }, { keyPosition: 0 }), "Am");
  assert.equal(chordLabel({ degree: 6, quality: 0 }, { keyPosition: 0 }), "B" + DIMINISHED);
  assert.equal(chordLabel({ degree: 0, quality: 0 }, { keyPosition: 7 }), "D" + FLAT);
  assert.equal(chordLabel({ degree: 0, quality: 0 }, { keyPosition: 6 }), "F" + SHARP);
  // A different quality replaces the one the plain name implies, rather than stacking on it:
  // "AmMaj7" would be a lie about what sounds.
  assert.equal(chordLabel({ degree: 5, quality: 5 }, { keyPosition: 0 }), "AMaj7");
  assert.equal(chordLabel({ degree: 5, quality: 6 }, { keyPosition: 0 }), "Amin7");
  assert.equal(chordLabel({ degree: 0, quality: 7 }, { keyPosition: 1 }), "G7");
});

// ---------------------------------------------------------------- measuring a patch under chords

test("chordPeak: a stack is louder than any one of its notes, and says by how much", async () => {
  const { chordPeak } = await import("../dist/js/features.js");
  const { LIBRARY } = await import("../dist/js/designer.js");
  const voice = LIBRARY.find((e) => e.voice.name === "TINE EP").voice;

  const one = chordPeak(voice, [48]);
  const four = chordPeak(voice, chordMidiNotes({ degree: 0, quality: 5 }, { keyRoot: 0 }));
  assert.equal(one.voices.length, 1);
  assert.equal(four.voices.length, 4);
  assert.ok(four.peak > one.peak, `four notes (${four.peak}) should beat one (${one.peak})`);
  // Stacking cost is measured against the loudest single note, so one note costs nothing.
  assert.ok(Math.abs(one.stackingDb) < 0.001, `one note reported ${one.stackingDb} dB of stacking`);
  assert.ok(four.stackingDb > 0, "a four-note chord should cost something to stack");
  // 0 dB is the clipping point, so headroom is negative.
  assert.ok(Math.abs(four.peakDb - 20 * Math.log10(four.peak)) < 1e-9);
  assert.equal(four.clips, four.peak >= 1);
});

test("chordPeak: an empty chord measures nothing rather than throwing", () => {
  // Guarding this matters: a step can point at a chord that has just been deleted.
  return import("../dist/js/features.js").then(({ chordPeak }) => {
    const nothing = chordPeak({}, []);
    assert.equal(nothing.peak, 0);
    assert.equal(nothing.clips, false);
    assert.deepEqual(nothing.voices, []);
  });
});

test("chordPeak: a wider voicing is measured, not assumed", async () => {
  const { chordPeak } = await import("../dist/js/features.js");
  const { LIBRARY } = await import("../dist/js/designer.js");
  const voice = LIBRARY.find((e) => e.voice.name === "TINE EP").voice;
  // The point of the measurement is that voicing changes the answer. Both are reported on the
  // same scale, so the two can be compared at all.
  const closed = chordPeak(voice, chordMidiNotes({ degree: 0, quality: 5, voicing: 0 }, { keyRoot: 0 }));
  const drop2 = chordPeak(voice, chordMidiNotes({ degree: 0, quality: 5, voicing: 1 }, { keyRoot: 0 }));
  assert.equal(closed.voices.length, drop2.voices.length);
  assert.notDeepEqual(closed.voices.map((v) => v.note), drop2.voices.map((v) => v.note));
  for (const r of [closed, drop2]) assert.ok(r.peak > 0 && r.peak <= 4);
});

// ---------------------------------------------------------------- the drawn honeycomb

test("the honeycomb draws one cell per degree, whatever the scale", async () => {
  const { honeycombSvg } = await import("../dist/js/chord-honeycomb.js");
  // This is the reason the circle of fifths was replaced. A circle of fifths only describes a
  // major key: its two rings are the majors and their relative minors, and its seven lit chords
  // are the seven of a major scale. A honeycomb has one cell per scale degree, so it says
  // something true about all fifty scales rather than about one.
  for (let mode = 0; mode < SCALES.length; mode++) {
    const svg = honeycombSvg(0, mode);
    const cells = [...svg.matchAll(/data-degree="(\d+)"/g)].map(([, d]) => +d);
    assert.equal(cells.length, SCALES[mode].count, `${SCALES[mode].name} drew ${cells.length} cells`);
    assert.deepEqual(cells, cells.map((_, i) => i), `${SCALES[mode].name} cells out of order`);
  }
});

test("every honeycomb cell names the chord its degree actually builds", async () => {
  const { honeycombSvg } = await import("../dist/js/chord-honeycomb.js");
  for (let key = 0; key < 12; key++) {
    const svg = honeycombSvg(key, MODE_MAJOR);
    for (let degree = 0; degree < 7; degree++) {
      assert.ok(svg.includes(chordName(key, degree)), `key ${key} did not print ${chordName(key, degree)}`);
    }
  }
  // Key-correct spelling survives the move off the wheel, flats and all.
  assert.ok(honeycombSvg(7, MODE_MAJOR).includes("D" + FLAT), "D flat major should print a flat");
  assert.ok(honeycombSvg(6, MODE_MAJOR).includes("F" + SHARP), "F sharp major should print a sharp");
  assert.ok(honeycombSvg(2, MODE_MAJOR).includes("C" + SHARP + DIMINISHED), "D major's vii is C sharp diminished");
  // A scale with no key-correct letter spelling falls back to numerals, and still draws.
  const dorian = honeycombSvg(0, scaleModeNamed("Dorian"));
  assert.ok(dorian.includes("#vi" + DIMINISHED), "Dorian's sharpened sixth keeps its accidental");
});

test("the honeycomb tessellates: cells touch, and each one is its own hit target", async () => {
  const { degreeAtPoint, cellBounds, honeycombSize } = await import("../dist/js/chord-honeycomb.js");
  const width = 96;
  const pad = 6;
  // SpaceAge's geometry, from NumeralPadComponent: three quarters of a width across, odd columns
  // dropped half a height. That stagger is what makes it a honeycomb rather than a row of
  // separate tiles, so it is checked rather than assumed.
  const a = cellBounds(0, { width, left: pad, top: pad });
  const b = cellBounds(1, { width, left: pad, top: pad });
  assert.ok(Math.abs(b.x - a.x - width * 0.75) < 1e-9, "columns step three quarters of a width");
  assert.ok(Math.abs(b.y - a.y - a.h * 0.5) < 1e-9, "odd columns drop half a height");
  assert.ok(b.x < a.x + a.w, "neighbouring cells overlap rather than leaving a gap");

  // The centre of every cell lands on that cell, for every length of scale.
  for (const mode of [1, 9, 11, 31]) {
    const count = SCALES[mode].count;
    for (let degree = 0; degree < count; degree++) {
      const box = cellBounds(degree, { width, left: pad, top: pad });
      const hit = degreeAtPoint(box.x + box.w / 2, box.y + box.h / 2, mode, { width, pad });
      assert.equal(hit, degree, `${SCALES[mode].name} degree ${degree}`);
    }
    const size = honeycombSize(count, width);
    assert.ok(size.width > 0 && size.height > 0);
    // Well outside the honeycomb is a miss, not the nearest cell.
    assert.equal(degreeAtPoint(-50, -50, mode, { width, pad }), -1);
    assert.equal(degreeAtPoint(size.width + 200, size.height + 200, mode, { width, pad }), -1);
  }
});


test("chordPeak reports the same number the live engine does", async () => {
  // The whole claim of the measurement is that a chord which clips here clips audibly in the
  // preview. That is only true if the offline mix and the engine's own mix are the same
  // arithmetic, so this plays the chord through the real engine and compares the two peaks
  // rather than trusting that the port of the output stage stayed in step.
  const { PreviewEngine } = await import("../dist/js/preview-engine.js");
  const { chordPeak } = await import("../dist/js/features.js");
  const { LIBRARY } = await import("../dist/js/designer.js");
  const voice = LIBRARY.find((e) => e.voice.name === "TINE EP").voice;
  const sampleRate = 48000;

  for (const quality of [0, 5]) {
    const notes = chordMidiNotes({ degree: 0, quality }, { keyRoot: 0 });
    const engine = new PreviewEngine(sampleRate);
    engine.message({ type: "voice", voice });
    for (const n of notes) engine.message({ type: "on", note: n, velocity: 100 });
    const l = new Float32Array(128), r = new Float32Array(128);
    let enginePeak = 0;
    for (let b = 0; b < Math.round((0.7 * sampleRate) / 128); b++) {
      engine.render([l, r]);
      enginePeak = Math.max(enginePeak, engine.peak);
    }
    const offline = chordPeak(voice, notes, { velocity: 100, sampleRate, hold: 0.7, tail: 0.05 });
    assert.ok(
      Math.abs(offline.peak - enginePeak) < 0.01,
      `quality ${quality}: offline ${offline.peak} vs engine ${enginePeak}`,
    );
  }
});

test("every key spells its seven degrees on its seven letters, once each", () => {
  // This is the check that catches what SpaceAge's FIFTHS gate could not. That gate asserted a
  // degree's name against `majorName` at a neighbouring wheel position, which is self-consistent
  // by construction and stayed true while the name was wrong: D major's seventh degree printed
  // D flat, the right pitch under the wrong letter, because the name table switches to flats past
  // position 6 whatever key is being spelled. Nine chords across five keys were affected.
  //
  // A key uses each of its seven letters exactly once, in order from the tonic, and the accidental
  // is whatever puts that letter on the right pitch. Both halves are asserted here, because
  // either one alone is satisfiable by something wrong.
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
  for (let key = 0; key < 12; key++) {
    const tonic = majorName(key);
    const from = LETTERS.indexOf(tonic[0]);
    const used = [];
    for (let degree = 0; degree < 7; degree++) {
      const printed = chordName(key, degree).replace(/m$/, "").replace(DIMINISHED, "");
      assert.equal(printed[0], LETTERS[(from + degree) % 7], `${tonic} major, degree ${degree + 1}: ${printed}`);
      assert.equal(
        pitchClassOfName(printed),
        (pitchClassAt(key) + MAJOR_STEPS[degree]) % 12,
        `${tonic} major, degree ${degree + 1}: ${printed} is the wrong pitch`,
      );
      used.push(printed[0]);
    }
    assert.equal(new Set(used).size, 7, `${tonic} major reuses a letter: ${used.join(" ")}`);
  }
  // The cases that were wrong before, named outright so a regression is legible.
  assert.equal(chordName(2, 6), "C" + SHARP + DIMINISHED, "D major's vii");
  assert.equal(chordName(6, 4), "C" + SHARP, "F sharp major's V");
  assert.equal(chordName(6, 6), "E" + SHARP + DIMINISHED, "F sharp major's vii");
  assert.equal(chordName(7, 1), "E" + FLAT + "m", "D flat major's ii");
  assert.equal(chordName(7, 3), "G" + FLAT, "D flat major's IV");
});

test("no key needs a double sharp or a double flat", () => {
  // True of all twelve major keys, and worth pinning: if it ever stops being true the accidental
  // logic is producing something like F double-sharp where a simpler spelling exists.
  for (let key = 0; key < 12; key++) {
    for (let degree = 0; degree < 7; degree++) {
      const printed = chordName(key, degree);
      assert.ok(!printed.includes(SHARP + SHARP), `${printed} has a double sharp`);
      assert.ok(!printed.includes(FLAT + FLAT), `${printed} has a double flat`);
    }
  }
});

test("a scale-relative chord is named for what it sounds, not for its formula", () => {
  // Quality 1 is the scale-relative 7th, whose suffix in the table is a bare "7". Taking that
  // suffix literally printed "A7" for the seventh chord on vi in C - a real chord, and the wrong
  // one. The quality has to be read off the intervals the chord actually sounds.
  const inC = (degree, quality) => chordLabel({ degree, quality }, { keyPosition: 0, mode: MODE_MAJOR });
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((d) => inC(d, 1)),
    ["CMaj7", "Dmin7", "Emin7", "FMaj7", "G7", "Amin7", "Bmin7b5"],
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((d) => inC(d, 0)),
    ["C", "Dm", "Em", "F", "G", "Am", "B" + DIMINISHED],
  );
  // A fixed quality keeps its own suffix, because that is what it plays whatever the degree.
  assert.equal(inC(5, 5), "AMaj7");
  assert.equal(inC(5, 6), "Amin7");
});

test("only a major key is named with letters; every other scale gets its numeral", () => {
  // The wheel spells the seven chords of a major key. Read against any other scale its letters
  // are wrong - in C natural minor the third degree is E flat and the wheel would call it E - so
  // those scales are named by numeral, which is always true.
  const minor = [0, 1, 2, 3, 4, 5, 6].map((d) => chordLabel({ degree: d, quality: 0 }, { keyPosition: 0, mode: scaleModeNamed("Natural Minor") }));
  assert.deepEqual(minor, ["i", "ii" + DIMINISHED, "III", "iv", "v", "VI", "VII"]);
  // A numeral already states the triad quality, so it is not stated twice: not "im", not "ii°°".
  for (const label of minor) {
    assert.ok(!/m$/.test(label), `${label} says minor twice`);
    assert.ok((label.match(new RegExp(DIMINISHED, "g")) || []).length <= 1, `${label} says diminished twice`);
  }
  // Dorian's sharpened sixth keeps its accidental in the numeral.
  const dorian = chordLabel({ degree: 5, quality: 0 }, { keyPosition: 0, mode: scaleModeNamed("Dorian") });
  assert.equal(dorian, "#vi" + DIMINISHED);
});
