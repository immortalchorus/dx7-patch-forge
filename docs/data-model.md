# OWL's data model

Written so the forge can be read as a specification. SpaceAge's 80s FM page will eventually
express the same grammar natively, and that should be a port, not a reimplementation with new
bugs. Everything here is data in, data out: no DOM, no globals, no hidden state.

## Where the line is

`dist/js/app.js` and `dist/js/classic.js` are the only files that touch the page. Everything
else — `designer.js`, `macros.js`, `layers.js`, `features.js`, `render.js`, `controls.js`,
`language.js`, `dx7.js`, `ssynth.js`, `match.js`, `sample.js`, `pattern.js` — is pure. This is
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
