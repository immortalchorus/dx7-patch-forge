# OWL's data model

Written so the forge can be read as a specification. SpaceAge's 80s FM page will eventually
express the same grammar natively, and that should be a port, not a reimplementation with new
bugs. Everything here is data in, data out: no DOM, no globals, no hidden state.

## Where the line is

`dist/js/app.js` and `dist/js/classic.js` are the only files that touch the page. Everything
else — `designer.js`, `macros.js`, `layers.js`, `features.js`, `render.js`, `controls.js`,
`language.js`, `dx7.js`, `ssynth.js`, `match.js`, `sample.js`, `pattern.js`, `harmony.js`,
`chord-wheel.js` — is pure. `chord-wheel.js` draws, but it returns SVG markup as a string and
never touches an element, the way `algorithm-chart.js` does. This is
enforced by architecture rather than discipline: the forge runs inside a Web Worker
(`design-worker.js`), a context with no `document` at all, so a DOM reference there does not
degrade, it throws. `midi.js` is the one exception and is a browser-API wrapper, not forge logic.

## A control

`controls.js` holds one record per control. The id is a stable name: renaming it breaks saved
work and a second product, so treat the list in `tests/vocabulary.test.js` as a contract.

```js
{ id: "growl",          // never changes, even if the label does
  group: "Tone",        // which tab it appears under
  label: "Growl",       // what a person reads
  left: "Clean",        // the two poles of a bipolar control, -1 .. +1
  right: "Rough",
  hint: "...",          // one sentence explaining the idea
  drives: "setGrowl",   // the macro in macros.js that carries it out
  kind: "structural" }  // how it works, see below
```

`kind` says what happens when the control moves:

| kind | meaning |
| --- | --- |
| `direct` | the macro edits parameters, and that is the end of it |
| `searched` | a measured target is set, and the amount is found by rendering and measuring until the target is hit |
| `structural` | it may add an operator or change the algorithm before editing anything |
| `output` | it only changes level |

Every slider is bipolar and runs **−1 to +1**, with 0 meaning "as the starting voice has it".
That is the whole mental model: a patch is a starting voice plus a set of offsets, and moving a
slider back really does undo it, because the voice is rebuilt from the start each time.

## What a design returns

`tailor(entry, sliders)` returns data, never text for the screen:

- `voice` — the finished voice, in DX7 units (see below).
- `features`, `base`, `targets` — measurements of the result, of the starting voice, and of what
  was being aimed at. Numbers with units, never formatted strings.
- `changes` — one record per edit: `{ id, amount, text }`, where `id` is the control that caused
  it and `amount` is how far it was pushed. `applied` is `changes.map(c => c.text)`, so the prose
  and the data cannot disagree.
- `unavailable` — `{ controlId: reason }` for controls this voice cannot support, with the reason
  in plain words rather than a silent no-op.

`interpret(prompt)` in `language.js` returns `{ cues, dims, families }`, where each cue is a
record (`{ phrase, family, dim, amount }`), not an assembled sentence.

## Units, stated once

This is the class of bug that does not error, so it is worth being explicit.

| Quantity | Unit | Where |
| --- | --- | --- |
| Operator level, EG rates and levels | DX7 integers 0–99 | the voice |
| Coarse ratio | DX7 integer, 0 meaning 0.5 | the voice |
| Detune | 0–14, 7 meaning none | the voice |
| Feedback | 0–7 | the voice |
| Slider positions | −1 … +1 | `sliders` |
| `centroid`, `early`, `late` | multiples of the fundamental | `features` |
| `attack`, `decay`, `release` | seconds | `features` |
| `sustain` | dB relative to the peak | `features` |
| `inharm`, `grit` | fraction 0–1 | `features` |
| `harmonics` | fractions summing to 1 | `features` |
| `peakDb` | dB, 0 = where SpaceAge and Dexed clip | `features` |
| Everything in a `.ssynth` | mostly normalised 0–1 | `ssynth.js`, at the boundary only |

The voice is held in **DX7 units everywhere inside OWL**. Normalisation to 0–1 happens in
`ssynth.js` and nowhere else, which is why that file is the only place a "1" can mean either
"maximum" or "one seventh". See [spaceage-integration.md](spaceage-integration.md).

## A chord

`harmony.js` is a port of SpaceAge's chord engine and is the one module in OWL whose shape was
decided elsewhere. It holds the circle of fifths, 50 scales, 43 chord qualities, the drop
voicings and the roman-numeral analysis, and it imports nothing — not even from OWL — so it could
later be replaced by a package shared with SpaceAge without touching anything that draws.

A chord is a plain record, and every field is named exactly as SpaceAge names it so the two can
be compared field by field:

```js
{ degree: 0,               // 0..6 of the scale, or up to 7 for the eight-note scales
  rootOffsetSemitones: 0,  // pushes the root off the degree, -24..24
  quality: 0,              // index into QUALITIES; 0 is the scale-relative triad
  inversion: 0,            // 0..3, lifts that many of the lowest voices an octave
  voicing: 0,              // 0 closed, 1 drop 2, 2 drop 3, 3 drop 2 and 4
  registerOctaves: 0 }     // -3..3, the whole chord up or down
```

`chordMidiNotes(chord, { keyRoot, mode })` turns one into sorted MIDI notes between 24 and 96,
which is SpaceAge's range and is kept so that the same chord gives the same notes in both.

SpaceAge's `ChordClip` carries a great deal more — rhythm, arpeggiation, strum, pan, gain, pads.
The list of what OWL ignores and why is at the top of `harmony.js`, in code, because a chord type
that was quietly reduced once already cost SpaceAge a round of edits that fell on the floor.

## A progression

A pattern carries one, and a step points into it by index:

```js
harmony: { keyPosition: 0,   // 0..11 on the circle of fifths; 0 is C, 7 is D flat
           mode: 1,          // index into SCALES; 1 is Major
           chords: [ ... ] } // up to 8, SpaceAge's WheelModel::maxSequence
steps: [ { note, vel, tie, chord } ]   // chord is an index into harmony.chords, or null
```

A step with a chord plays that chord's notes instead of its own note, because the chord's notes
are absolute and the step's note would be a second, unrelated thing to hear. Everything else about
a step — velocity, hold, gate, tempo, division — works exactly as it did, and the transport that
plays it is the audition loop that was already there. There is no second sequencer.

Units, again explicitly: every note in `harmony.js` is a MIDI note number and every interval is in
semitones. `chordPeak` in `features.js` reports on the mix's scale, where **1.0 is the clipping
point** and `peakDb` is 0 dB there — not the raw carrier-sum scale that `peakLevel` uses, where
full scale is 2.0. The two are a factor of two apart and it is the kind of mistake that does not
error, so a number from one must never be compared with a number from the other.
