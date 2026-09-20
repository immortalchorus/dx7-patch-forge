# OWL: Operator Waveform Lab

OWL (Operator Waveform Lab) is a browser-based patch designer for 6-operator FM synthesis. It writes standard voice SysEx, compatible with the Yamaha DX7, DX7II, TX802 and Dexed, and the native SpaceAge 80s FM synthesizer format.

Describe a sound in ordinary language, audition it on the built-in keyboard, and export:

- A native single-patch `.ssynth` file for SpaceAge 80s FM
- A 163-byte single-voice `.syx`
- A 32-voice cartridge `.syx`: the chosen voice plus 31 related candidates and variations

**Audition loop.** Under the keyboard, a 16-step loop plays while you edit, so a change is heard as it is made rather than remembered across a gap. Each step has a note, a velocity and an optional hold that extends the note before it; tempo, step length, gate and an added chord are set above the grid. The presets are diagnostic rather than musical: a velocity ramp for touch response, a four-octave sweep for keyboard level and rate scaling, fast repeats for envelope retriggering and clicks, a long note and rest for the sustain stage and release tail, and a held chord for detune beating. A level meter beside the play button shows where the patch is against the point SpaceAge and Dexed clip. The transport runs inside the audio engine, so it keeps time while the designer is measuring, and the pattern is never saved into a patch.

**Monitoring level.** A VOL control beside the keyboard sets how loud the preview is, from +6 dB down to silence, defaulting to -6 dB so the first note is not painful. It sits at the end of the chain, after the peak meter is read, so turning it down cannot hide a patch that would clip in SpaceAge or Dexed, and it never reaches a file.

**How it is put together.** The forge is pure data-in, data-out and runs in a Web Worker with no DOM at all; controls are data records with stable ids; what a patch did comes back as records, not sentences. [docs/data-model.md](docs/data-model.md) is the specification.

**SpaceAge.** OWL writes patches for SpaceAge's 80s FM engine, so its `.ssynth` format is a shared interface. What OWL depends on, how each point was verified against the SpaceAge source, and what to re-check when that engine changes is in [docs/spaceage-integration.md](docs/spaceage-integration.md).

**Reverb.** A light monitoring reverb sits after the preview: three spaces (small room, plate, hall) with mix and size. It is generated in the browser as a stereo impulse response, so a mono engine comes out with some width. It is listening equipment only - never written into a patch, never sent over MIDI, and the clip meter still reads the dry signal, because SpaceAge and Dexed clip before any reverb of their own.

**Cartridges.** Open a `.syx` (32-voice cartridge, raw bank, or single voices) or a SpaceAge `.ssynth`, pick any voice and edit it with the sliders, starting exactly as loaded. Store results into a separate 32-slot "My cartridge", which is kept in the browser and downloaded as its own `.syx`. The opened file is never modified.

**MIDI in.** A controller plays whatever is on screen, with its own velocity and sustain pedal, so a patch can be played properly while it is being edited; an **All notes off** button clears anything left hanging. A voice sent from the instrument arrives as the starting voice, and a 32-voice dump lands in the opened-cartridge column with the current voice untouched - so you can edit on the hardware, transmit, and carry on here.

In Chrome or Edge, **Send to synth** also sends the current voice over Web MIDI to a DX7, TX802, Dexed or any compatible synth, on a chosen output and channel, optionally on every change. It sends only the single-voice dump, which lands in the synth's edit buffer, so nothing stored on the synth is overwritten. On a DX7, set SYS INFO AVAIL so it accepts SysEx.

Live application: https://immortalchorus.github.io/owl-operator-waveform-lab/

## How it works

1. **Interpret.** `language.js` reads the description into two things: instrument-family evidence ("wurlitzer", "flute", "tubular bells") and signed adjustments on concrete dimensions: brightness, attack, held decay, release, harmonicity, grit, vibrato, tremolo, evolving timbre, register, width and velocity response. It handles negation ("not bright"), intensifiers ("very dark") and softeners ("slightly metallic").
2. **Choose a starting voice.** The library holds 42 original voices written for this project (`voices-core.js`) and 28 voices from the Electronic & Music Maker / Music Technology type-in series (`voices-emm.js`). They are ranked by meaning (family and tags, with rare tags weighted higher) and by how close each voice's *measured* sound already is to the request.
3. **Tailor it by measurement.** For the best few candidates, `macros.js` makes FM-aware edits (modulation depth on modulators, envelope contour on carriers, off-series ratios for metallic tones, and so on). `designer.js` then searches the edit amounts against rendered audio: `render.js` plays a test note, `features.js` measures spectral centroid, attack, decay, release and inharmonicity, and each search repeats until the measurement lands on the target.
4. **Explain.** The page shows which voice it started from, which edits were applied, and the start, target and result measurements.

## Shaping the sound

After forging, sliders in seven groups (Tone, Layers, Shape, Movement, Pitch, Playing, Output) let you keep working in sound terms rather than raw operator parameters. The description sets their starting positions; 0 always means "as the starting voice has it". Every change rebuilds the voice from the starting voice plus the full slider set, so moving a slider back really undoes it. The Variation control is a small, visible offset on a few tone sliders.

Each slider is an FM-aware edit, and the ones with a measurable result are searched against the renderer like the description targets:

- **Tone:** brightness, hollow ↔ full (1:2 vs 1:1 modulators), metallic ↔ pure, grit (feedback), chorus speed and smoothness, brightness across the keyboard (level scaling), octave.
- **Layers:** OWL finds the voice's layers (towers) and their roles: tine, sustain, saw-sustain, hammer. Tine level, pitch and touch, sustain tone, attack-vs-sustain balance, and a hammer (fixed-pitch, single fast decay). When no operator is spare for the hammer, OWL moves to an interchangeable algorithm that keeps the other layers' routing (for example 5 → 13, merging two sustain towers), then rebalances by measurement. Sliders a voice cannot support are shown greyed out with the reason.
- **Shape:** attack, attack bite (a modulation spike at note-on), held length, sustain level, release, timbre over time (dark → bright or bright → dark, built from modulator envelope stages 2 and 3), and change speed.
- **Movement:** vibrato, tremolo, timbre wobble (LFO on the modulators), movement speed and movement onset. The DX7 has one LFO, so these share rate and delay. The delay can fade movement in but not out.
- **Pitch:** scoop in from below, scoop speed, fall on release. The DX7 pitch envelope starts and ends at the same level, so a scoop also bends the release.
- **Playing:** velocity to brightness, velocity to volume, rate scaling.
- **Output:** level.

### Choosing the algorithm

The algorithm card opens the full 32-algorithm chart. Algorithms interchangeable with the current one (Power DX7's families) are marked. Picking one remaps the voice onto it, keeping as much of the existing routing and as many operator roles as possible, and "why it sounds like this" reports how many connections survived.

### Level and clipping

SpaceAge and Dexed scale each voice's carrier sum by 0.5 and hard-clip it at full scale, so patches with several loud carriers or strong feedback distort. Every forged voice is levelled automatically: carrier output levels are set so the loudest note (velocity 127, across the keyboard) peaks 1 dB under the clip point. Carriers set loudness without changing timbre, and feedback on a carrier is compensated. The Output level slider trims from there, and the results table shows the measured peak. The in-browser preview uses the same per-voice clip, so a patch that clips is audible before you export it.

The renderer follows the msfa/Dexed envelope, output-level, velocity and keyboard-scaling math, so timing and modulation depth sit close to the hardware. It uses a sine table rather than the DX7's log-sine ROM, and approximates LFO delay and depth, so treat the in-browser preview as a close approximation.

Reference descriptions and programming notes for the EMM voices: https://bobbyblues.recup.ch/yamaha_dx7/patches/EMM.html

## SpaceAge .ssynth export

Native exports contain all 186 80s FM parameters, mapped as SpaceAge's `PluginProcessor` interprets them: ratio is coarse (0 means 0.5) with fine as a percentage, fixed mode is `10^(coarse & 3)` Hz with fine as `10^(fine/100)`, and the voice's own pitch envelope and keyboard scaling are carried across. The application reproduces SpaceAge's canonical JUCE JSON serialization and calculates both SHA-256 integrity fields in the browser.

No audio or prompt data is uploaded. Design, preview and file packaging all happen locally in the browser.

The practices behind every control, and their sources (Power DX7, Chowning, Martin Russ, Bo Tomlyn and others), are in [docs/research.md](docs/research.md).

## Project structure

- `dist/index.html` and `dist/styles.css`: interface, using the Sample Squad Media Player palette
- `dist/js/app.js`: UI, audition keyboard, downloads
- `dist/js/dx7.js`: voice model, the 32 algorithms, VMEM/VCED packing, SysEx read and write
- `dist/js/render.js`: DX7-style FM renderer, used for measurement and preview
- `dist/js/features.js`: audio measurements
- `dist/js/language.js`: description parsing
- `dist/js/controls.js`: slider definitions
- `dist/js/macros.js`: FM-aware edits
- `dist/js/layers.js`: layer analysis and algorithm restructuring
- `dist/js/algorithm-chart.js`: front-panel style algorithm diagrams
- `dist/js/designer.js`: base-voice ranking and measured tailoring
- `dist/js/design-worker.js`: design off the main thread
- `dist/js/preview-engine.js` and `dist/js/preview-worklet.js`: real-time preview, on the audio thread when the browser allows it and on the main thread otherwise
- `dist/js/ssynth.js`: SpaceAge native patch writer
- `dist/js/midi.js`: Web MIDI output
- `dist/js/voices-core.js` and `dist/js/voices-emm.js`: voice library
- `tests/`: Node test suite
- `.github/workflows/pages.yml`: tests, then deploys `dist/` to GitHub Pages on every push to `main`
- `.openai/hosting.json`: the earlier ChatGPT Sites configuration (no longer the live host)

## Hosting

OWL is served by GitHub Pages from this repository. Every push to `main` runs the test suite and, if it passes, publishes `dist/` to https://immortalchorus.github.io/owl-operator-waveform-lab/. A failing test blocks the deploy, so the live site stays on the last good version. The app is plain static files, so moving to another static host (for example Cloudflare Pages) only needs `dist/` as the output directory and no build command.

## Run locally

Serve the `dist` directory with any static HTTP server (ES modules and workers do not load from `file://`), for example:

```
npx http-server dist
```

There is no build step and there are no runtime dependencies. Run the tests with Node 20 or newer:

```
npm test
```

## Ownership and licensing

Copyright © 2026 Shane Sanders / Sample Squad. No license is granted for redistribution or incorporation into other software unless separately authorized.

The EMM / Music Technology voices were published by their original programmers in the magazine and remain credited to them. They are included as reference starting points; check their status before distributing exported cartridges commercially.
