# Chord Lab in OWL: what was built, and what the SpaceAge side asked for

**For:** the SpaceAge side, and whoever picks this up next
**From:** the OWL session, 2026-09-25
**Answers:** section 6 of `spaceage-active/docs/CHORD_LAB_INTO_OWL.md`

SpaceAge was read and not written to. No git command was run in that working tree; every file
named below was read with `sed`/`grep` only. Nothing in SpaceAge changed.

---

## 1. Answers to their section 3

These were already answered in `handoff/owl-chord-lab-brief-2026-09-25.md` and are repeated here
only as far as the build confirmed or corrected them.

1. **Language and runtime.** Plain ES modules, no framework, no TypeScript, no build step. Tests
   are Node's runner. Confirmed.
2. **Does OWL make sound?** Yes, fully, and it already had a 16-step transport living inside the
   audio engine. **This is the correction that shaped the whole design**: OWL did not need a
   sequencer, so none was built.
3. **What a chord does to a patch.** It plays it and it measures it. The second is the half that
   did not exist anywhere and is the reason this belongs in a patch designer.
4. **State.** Sanitised plain data in `localStorage`, one `sanitiseX()` per record. A progression
   follows that pattern exactly.
5. **MIDI.** Both directions, already built. Not yet wired to progressions — see section 5.
6. **Shared package.** None. Still none; `harmony.js` is written so one is possible later.

## 2. Which of A / B / C, and why

**B, structured so C stays possible** — as they recommended, with the correction from answer 2.

- **A (chooser only)** was rejected because OWL can sequence. A chooser would have thrown away the
  measurement, which is the only thing here that no other tool does.
- **C (shared engine)** was rejected *for now*, not on principle. It is the right long-term answer
  and nothing here blocks it: `harmony.js` imports nothing, has no DOM, and is held to SpaceAge's
  own cases. Swapping it for a WebAssembly build or a shared package would not touch the view.
  Doing it now would have meant a build toolchain OWL does not have and does not want.

The shape of B, concretely: **the existing audition loop is the transport.** A progression is a
list of chord records on the pattern; a step points into it by index. Per-step velocity, hold,
gate, tempo and division keep working exactly as they did. No new audio path, no second "play".

## 3. The module boundary

Everything that crossed from SpaceAge is in `dist/js/harmony.js`, which imports nothing.

| SpaceAge | OWL signature |
| --- | --- |
| `WheelModel::pitchClassAt/positionOfPitchClass/wrap` | `pitchClassAt(position)`, `positionOfPitchClass(pc)`, `wrap(position)` |
| `WheelModel::majorName/minorName/keySignature/usesFlats` | same names, `(position) => string \| boolean` |
| `WheelModel::majorRingDegree/minorRingDegree` | `majorRingDegree(keyPosition, position) => -1..6` |
| `WheelModel::degreeNumeral/chordName` | `degreeNumeral(degree)`, `chordName(keyPosition, degree)` |
| `chordFormulas()` (43) | `QUALITIES`, same order; the index is what a saved chord stores |
| `scaleDefinitions()` (50) | `SCALES`, same order; same caveat |
| `romanNumeralForScaleDegree(mode, degree)` | same name and signature |
| `scaleDegreeQualitySuffix(mode, degree)` | same name and signature |
| `applyChordVoicing(std::array<int,6>&, count, voicing, minMidi)` | `applyChordVoicing(notes, voiceCount, voicing, minimumMidiNote = 0)`, edits in place |
| `chordMidiNotesForClip(ChordClip)` | `chordMidiNotes(chord, { keyRoot, mode }) => sorted number[]` |

`CircleOfFifthsComponent` and `NumeralPadComponent` did **not** cross. The wheel was rebuilt as
SVG, and has since been replaced by a honeycomb - one hexagon per scale degree - in
`dist/js/chord-honeycomb.js`. See section 8 below.

## 4. Test vectors — their section 6.4

`tests/harmony.test.js` holds them, written as data so they can be read back into SpaceAge and
asserted against the gates there. **Please do run them against `FIFTHS` and `CHORD_ROMAN`.** If
the two disagree, SpaceAge is right and OWL is wrong; the gates predate this port.

What is pinned:

- **The wheel**: the twelve pitch classes in order, each step a fifth, position/pitch-class
  round-trip, and `wrap` as a true modulo including negatives.
- **FIFTHS, all twelve keys**: seven lit degrees once each; every lit chord rooted the right
  number of semitones above the tonic, with the inner ring a minor third below the outer; vii
  diminished at five steps clockwise on the leading note; all six `chordName`/ring agreements.
- **Spelling**: every major and minor name, every key signature, `usesFlats` at the boundary, and
  that position 6 and 7 do not share a spelling. Symbols are compared **by code point**
  (U+266F, U+266D, U+00B0), per their rule 4.
- **The named progressions**: `C G Am F`, `G D Em C`, `E♭ A♭ B♭ D°`.
- **CHORD_ROMAN**: their nine-scale table verbatim, including Phrygian Dominant
  (`I bII iii° iv v° bVI+ bvii`), plus a sweep asserting every one of the 50 scales produces a
  well-formed numeral for every degree and that the quality suffix never disagrees with it.
- **`applyChordVoicing`**: drop 2, drop 3 and drop 2-and-4 named note by note from a C Maj7; the
  floor; that a triad and voicing 0 are left alone; that out-of-range arguments clamp.
- **`chordMidiNotes`**: the key's own triad on all seven degrees, a fixed quality against a
  scale-relative one, all twelve key roots, all four inversions, register and its ±3 clamp, the
  24–96 clamp, and all 43 qualities × 7 degrees × 4 voicings for count, range and sort order.

Every one of these passed on the first run of the implementation, which is weak evidence that the
port is faithful and strong evidence that the tables were copied correctly. The layer on top of them did
not: naming a chord for a slot label had two bugs that only running the page found, both of them
cases where a generic suffix was stuck onto a name that already carried a quality ("A7" printed
for the seventh chord on vi in C, which is Am7). Both are fixed and both are now tested. The
lesson is the brief's own: a table can satisfy every rule and still be read wrongly by the thing
above it.

**`FIFTHS_HANDOVER` has no counterpart** and cannot have one: it is about the sketch, the lanes
and the MIDI export, none of which OWL has.

### Fixed in both: `chordName` printed enharmonic equivalents in five keys

Found while porting, and on the Admiral's instruction fixed in SpaceAge as well as in OWL rather
than reproduced. This section records what was wrong and what changed on each side.

`WheelModel::chordName` named a degree by looking up `majorName(keyPosition ± n)`. `majorName`
switches to flat spellings past position 6, and it does so **regardless of which key is being
spelled**. So when a degree of a sharp key landed past position 6, it came back spelled with
flats, and vice versa. The pitch classes were all correct. Only the letters were wrong.

Nine chords in five keys:

| Key | Degree | `chordName` printed | Correct spelling, now |
| --- | --- | --- | --- |
| D major | vii | D♭° | C♯° |
| A major | vii | A♭° | G♯° |
| E major | vii | E♭° | D♯° |
| B major | vii | B♭° | A♯° |
| F♯ major | iii | B♭m | A♯m |
| F♯ major | V | D♭ | C♯ |
| F♯ major | vii | F° | E♯° |
| D♭ major | ii | D♯m | E♭m |
| D♭ major | IV | F♯ | G♭ |

This is what rule 3 of the brief forbids — "a port that prints enharmonic equivalents
interchangeably is wrong" — and it was in the original, not in the port.

`FIFTHS` did not catch it because it checked **self-consistency**, not correctness:
`chordName(key, 4) == majorName(key + 1)` is true by construction whatever `majorName` returns.
The three hand-written progressions are in C, G and E♭, and all three happen to avoid the break.
A spelling check that would catch it is one line: the *n*th degree of a major key must use the
*n*th letter after the tonic's letter, each letter exactly once.

**What changed.**

SpaceAge already had the right algorithm - `spelledScaleDegreeName` in `PluginEditor.cpp`, which
is what the chord slot labels a person actually reads go through. `WheelModel::chordName` was a
second implementation of the same arithmetic that disagreed with it. It is now the same method, so
the two agree; the comment on `degreeSpelling` says so, and says why.

- `Source/SpaceageCircleOfFifths.h` - `chordName` derives the letter and accidental instead of
  looking up `majorName` at a neighbouring position. New `degreeSpelling(keyPosition, degree)`.
- `Tests/ProcessorUiChecks.cpp` - the four self-consistent assertions in `FIFTHS` are replaced by
  the real property: each key uses its seven letters once each, in order from the tonic, each
  accidental-adjusted to the right pitch. The two that *are* facts in every key - the first degree
  is the key, the sixth is its relative minor - are kept as they were.
- OWL mirrors both, in `dist/js/harmony.js` and `tests/harmony.test.js`.

Nothing else in SpaceAge called `chordName`; the drawn wheel labels its segments with
`majorName`/`minorName` at each position, which is a different and correct use. So the change
cannot move anything a person currently sees - it corrects a function the gate was the only
caller of, and it stops the gate blessing a wrong answer.

## 5. What was **not** ported, and what a person therefore cannot do

Their section 6.5, and the honest part of this document. `ChordClip` was ported as a documented
subset, with the list of ignored fields written at the top of `harmony.js` in code. A person using
Chord Lab in OWL **cannot**:

| Cannot | Why |
| --- | --- |
| Arpeggiate a chord, or set an arp mode, rate, gain or saturation | The loop is already a step sequencer and can write an arpeggio out as steps. A second arpeggiator inside a sequencer is two metaphors for one thing. **This is the omission most likely to be wrong** — the OWL-side brief thought arp probably mattered. It is a small addition if it turns out to. |
| Strum a chord | Same reason |
| Give a chord its own rhythm pattern | The loop's steps, ties and gate do this |
| Pan a chord or give it pan motion | OWL's preview is mono-summed; there is nothing to pan |
| Set a per-chord gain | Level belongs to the patch here |
| Set a per-chord velocity | The step a chord sits on already has one, and two sources for one number is how an edit falls on the floor. The loop's velocity lane is authoritative. |
| Enter a chord by hand rather than from the wheel | `customMidiNotes` was not ported; the wheel is the only input |
| Write a progression longer than eight chords | SpaceAge's own `maxSequence` |
| Use the minor numeral pad | The scale selector covers more, but reads as less musical |
| Send a progression to hardware | `midi.js` can send, but nothing wires a progression to it yet. This is the most valuable missing piece. |

A chord also **replaces** the note written on its step rather than sounding alongside it, since
its notes are absolute.

### One regression, stated plainly

The pattern's old `chord` field — a four-entry list of interval sets (`off`, `5th`, `maj7`,
`min9`) added to every step — was **removed**, as the brief directed. A loop saved before this
change loses that doubling and plays its notes as single notes; the sanitiser turns it into legal
data rather than erroring, but the sound changes. The `Held chord` preset was rewritten to use a
real chord, and a `Chord progression` preset was added.

## 6. The measurement, which is the reason for all of it

`chordPeak(voice, notes)` in `features.js` renders each note, applies the engine's 0.5 gain,
clips each note on its own and only then sums — which is exactly what `PreviewEngine.render`
does. It reports peak, peak in dB (0 dB = where SpaceAge and Dexed clip), whether it clips, the
per-note peaks, and **stacking cost in dB**: how much louder the chord is than its loudest single
note, which is the number a voicing decision is actually made on.

That it mirrors the engine is not asserted, it is **tested**: `tests/harmony.test.js` plays the
same chord through a real `PreviewEngine` and requires the two peaks to agree within 0.01. They
currently agree exactly.

The first real result was worth having: OWL auto-levels voices to about 1 dB under the clip point
*for a single note*, and the default tine electric piano under a plain three-note triad peaks
about **7 dB above the clipping point**. That is not a bug in the measurement; it is the thing
the measurement exists to say, and nothing in OWL could say it before.

## 7. Where everything is

| What | Where |
| --- | --- |
| The musical model | `dist/js/harmony.js` |
| The honeycomb | `dist/js/chord-honeycomb.js` |
| The progression on a pattern | `dist/js/pattern.js` |
| The measurement | `chordPeak` in `dist/js/features.js` |
| The wiring | the "chord lab" section of `dist/js/app.js` |
| The test vectors | `tests/harmony.test.js` |
| The contract, and what to check when SpaceAge changes | `docs/spaceage-integration.md` |
| The data model | `docs/data-model.md` |

## 8. The circle of fifths was replaced by a honeycomb

Chord Lab shipped with a circle-of-fifths wheel, rebuilt as SVG from SpaceAge's
`CircleOfFifthsComponent`. It has since been replaced outright by a honeycomb, for a reason that
was not obvious until the wheel was working:

**A circle of fifths can only describe a major key.** Its two rings are the twelve majors and
their relative minors, and the seven chords it lights are the seven of a major scale. Ask it for
Dorian, or Phrygian Dominant, or a pentatonic — all of which OWL's chord model supports, because
SpaceAge's fifty scales came across whole — and it has nothing to say. OWL was printing roman
numerals onto a diagram still drawn as though the key were major.

A honeycomb is one hexagon per scale degree. It has exactly as many cells as the scale has notes:
seven for the modes, five for a pentatonic, six for whole tone, eight for the diminished scales.
Every cell is a chord that can actually be played in the chosen scale, and none of them are
decoration.

The geometry is SpaceAge's own, from `NumeralPadComponent` in `Source/SpaceageCircleOfFifths.h`:
flat-topped hexagons, each column three quarters of a width across, odd columns dropped half a
height. That stagger is what makes it tessellate rather than read as a row of separate tiles.
SpaceAge uses the pad for minor keys and the wheel for major ones (`majorUsesTheWheel`,
`minorUsesThePad` in `FIFTHS_HANDOVER`); OWL now uses the honeycomb for everything.

**None of the musical model changed.** `harmony.js` is untouched by this: the honeycomb is a
different projection of the same degrees, qualities and spellings, and every test that pinned the
model still passes. Only the drawing was replaced.

### What was lost, and what it would take to get back

The wheel drew the five chords *outside* the key as unlit context, which made borrowed chords
visible even though it could not insert them. The honeycomb has no cells for them, because it is
indexed by scale degree and a borrowed chord is not one.

The model already carries what borrowing needs — `rootOffsetSemitones`, which SpaceAge exposes as
its "BORROW" family — and it is sanitised and tested here. It is simply not on the surface. A row
of borrowed cells under the honeycomb, or a modifier on a cell, would restore it.

### The obvious next step - done, see section 11

SpaceAge carries per-hexagon controls on the shape itself: the body adds the chord, the four
edges set the inversion, and two discs set the octave (`edgeSetsInversion`, `discRaisesOctave`,
`discLowersOctave`, `bodyStillAdds`). OWL keeps those on a separate panel beside the honeycomb.
Folding them onto the cells would make the two products feel like one, and a hexagon is the right
shape for it — six edges is six affordances that a circle segment does not have.

## 9. Every scale now carries note names, not only the major ones

A correction to this document and to the code. Section 8 said the honeycomb made all fifty scales
usable; that was half true. The cells appeared, but for anything other than a major scale they
were labelled with roman numerals alone — `i`, `bII`, `iii°` — which tells a player what a chord
*does* and not what to put their hands on.

The comment in `harmony.js` justified that by claiming a real spelling engine was needed and that
"SpaceAge does not have either". **That was wrong.** `spelledScaleDegreeName` in
`PluginEditor.cpp` is exactly that engine, and it had already been read during the `chordName`
fix. It is now ported as `degreeSpelling(keyRoot, mode, degree, preferFlats)`.

The rule it encodes is simple and general: **a seven-note scale uses each of the seven letters
once, in order from the tonic, whatever its intervals are.** That is what a seven-note scale is.
So the same derivation that spells a major key spells every mode:

| Scale | Now reads |
| --- | --- |
| C Phrygian Dominant | C · D♭ · E° · Fm · G° · A♭aug · B♭m |
| E Phrygian Dominant | E · F · G♯° · Am · B° · Caug · Dm |
| C Harmonic Minor | Cm · D° · E♭aug · Fm · G · A♭ · B° |
| C Dorian | Cm · Dm · E♭ · F · Gm · A° · B♭ |

The E Phrygian Dominant row is worth noting: the SpaceAge brief states in prose that this scale
is "E, F, G#dim, Am, Bdim, Caug, Dm". The port reproduces it exactly, which is an independent
check that the two agree — it is asserted in `tests/harmony.test.js`.

The numeral did not go away. Each honeycomb cell now shows the note name and the numeral
together, which is what the two are for: the name is what you play, the numeral is what it does.

### Where the key is not enough, and the control that fixes it

A five-, six- or eight-note scale has no letter per degree to be owed — a pentatonic skips two of
them, a diminished scale needs eight — so those fall back to a chromatic name, sharp or flat by
the key's own spelling. That is SpaceAge's behaviour and it is kept.

It is also, for these scales, sometimes wrong in a way no rule reliably fixes. C minor pentatonic
is spelled with an E flat by every player alive, but the key of C spells itself with sharps, so
the derivation gives D♯ and A♯. Several heuristics were tried against the fifty scales — "flats
if the scale has a minor third", "flats if it has any flattened degree" — and each had
counterexamples among them.

So it is a control rather than a guess: **Spelling — from the key / sharps / flats**, stored on
the progression as `preferFlats` (`null` meaning "from the key", which is the default and the
SpaceAge behaviour). It also reaches seven-note scales, where it chooses which enharmonic tonic
to spell from: F♯ major's six sharps become G♭ major's six flats.

Spelling is a name and never a pitch. The same chord sounds identically however it is spelled,
and that is asserted too.

## 10. Each placed chord owns its settings

A design mistake, found by the Admiral and fixed. OWL held the progression as a list of chord
records on the harmony, with each step carrying an *index* into that list. Two steps showing the
same chord were therefore one chord heard twice, and editing either changed both.

That is not what a progression is. A I–V–I wants two tonic chords that can be voiced differently,
not one chord that appears twice. And SpaceAge already says so: `FIFTHS_HANDOVER` asserts
`slotsKeepTheirOwnSettings` and `editingOneSlotSparesTheRest` about its own sketch slots, which is
exactly the property OWL had broken. The port had diverged on a point their gate already covered —
worth noting, because it is the second time reading those gate names has corrected this side.

**Each step now owns its chord record outright.** `harmony` keeps the key, the scale and the
spelling; the chords live on the steps. The progression is derived by `progressionChords(pattern)`
— the chords on the steps, in playing order — so the list and what sounds cannot disagree.
Repeating a chord copies it.

Saved patterns are migrated: an old index is resolved into its own copy, so a repeated chord
becomes two independent chords rather than being lost or staying linked.

The chord row's click changed with it, since cycling through a shared list no longer means
anything. An empty step repeats the selected chord as its own copy; another step's chord selects
it; the selected one again takes it off.

## 11. The controls moved onto the hexagons

Section 8 ended by saying that folding SpaceAge's per-hexagon controls onto OWL's cells would make
the two products feel like one. That is done: four of a cell's six edges set the inversion and two
discs set the octave, as they do in `NumeralPadComponent`.

**The geometry is ported**, and is now the third piece of that component in OWL, after the stagger
and the cell shape:

| SpaceAge | OWL |
| --- | --- |
| `hexVertex` — six vertices at sixty degrees, radius half the cell's width | `hexVertex(box, index)` |
| `edgeLine(bounds, slot)` — vertices `2 + slot` to `3 + slot`, four slots clockwise from the lower left | `edgeLine(box, slot)` |
| `trimToward(edge, centre, 0.13)` — trim to 13–87%, then ease 8.5% toward the centre | `trimmedEdge(box, slot)` |
| `octaveDisc(bounds, up)` — minus on the left, plus on the right | `octaveDisc(box, up)` |
| `hitTest` — inside the hexagon first, then the discs, then the edges at a band of 0.13 × width, then the body | `controlAtPoint(x, y, degree, opts)` |

The bottom and lower-right edges are left plain, as they are there. The bottom edge is SpaceAge's
bars row and OWL has no chord length to put on it; the lower-right is deliberately blank in both,
because a shape whose every side is a button has no plain side left to steady the eye.

### Where it deliberately differs, and why

**In SpaceAge a pad cell *is* a placed chord**, so every cell holds its own inversion and octave,
and the gate asserts `degreesHoldDifferentInversions`. In OWL the honeycomb is a **palette**: the
cells are degrees of the scale, and placed chords live on the steps of the loop (section 10).

So the controls appear on the cell of the **selected chord** and edit that chord — one meaning for
one control. Giving every cell a per-degree inversion would have raised exactly the question this
design exists to avoid: when a degree is armed one way and the selected chord on that degree is
voiced another, which of the two is the edge showing? The OWL analogue of
`degreesHoldDifferentInversions` is that *placed chords* hold different inversions, which is
already guaranteed and already tested.

The panel beside the honeycomb is unchanged. It is a second view of the same two fields rather
than a competing one: both write through `editSelected`, and both read the chord back after every
change, so they cannot disagree. That is asserted rather than assumed.

### What is tested

`tests/honeycomb-controls.test.js` holds the geometry the way SpaceAge holds its own — a hit test
taken from the same numbers the drawing uses, because that is the only way to check a shape's
controls without a screenshot. It asserts that the hexagon is regular, that slot 2 is the top edge
and slot 0 the lower left, that the drawn mark is shorter than its edge and sits inside it, that
each edge's midpoint answers with its own slot, that the discs answer before the edges, that the
centre and the two plain edges still answer "body", and that **a band only counts inside its own
hexagon** — the property that stops one cell's edge swallowing its neighbour's body.

It also pins the accessibility surface: every control is a button with a label, exactly one
inversion is `aria-pressed`, and a disc that can go no further is `aria-disabled` and drops out of
the tab order rather than sitting there looking pressable.

One bug is worth recording, because these tests caught it on the way in and would catch it coming
back: the per-cell label built a local `chord` that **shadowed** the selected chord passed in as an
option, so the controls were handed a default and always read root position at octave zero. The
local is now called `plain`, and the comment on it says why.
