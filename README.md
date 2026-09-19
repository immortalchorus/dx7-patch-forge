# OWL: Operator Waveform Lab

OWL (Operator Waveform Lab, formerly DX7 Patch Forge) is a browser-based patch designer for Yamaha DX7-compatible SysEx and the native SpaceAge 80s FM synthesizer format.

Describe a sound in ordinary language, audition it on the built-in keyboard, and export:

- A native single-patch `.ssynth` file for SpaceAge 80s FM
- A 163-byte Yamaha DX7 single-voice `.syx`
- A 32-voice Yamaha DX7 cartridge `.syx`: the chosen voice plus 31 related candidates and variations

**Cartridges.** Open a DX7 `.syx` (32-voice cartridge, raw bank, or single voices) or a SpaceAge `.ssynth`, pick any voice and edit it with the sliders, starting exactly as loaded. Store results into a separate 32-slot "My cartridge", which is kept in the browser and downloaded as its own `.syx`. The opened file is never modified.

In Chrome or Edge, **Send to synth** also sends the current voice over Web MIDI to a DX7, TX802, Dexed or any compatible synth, on a chosen output and channel, optionally on every change. It sends only the single-voice dump, which lands in the synth's edit buffer, so nothing stored on the synth is overwritten. On a DX7, set SYS INFO AVAIL so it accepts SysEx.

Live application: https://dx7-patch-forge.shanesanders.chatgpt.site

## How it works

1. **Interpret.** `language.js` reads the description into two things: instrument-family evidence ("wurlitzer", "flute", "tubular bells") and signed adjustments on concrete dimensions: brightness, attack, held decay, release, harmonicity, grit, vibrato, tremolo, evolving timbre, register, width and velocity response. It handles negation ("not bright"), intensifiers ("very dark") and softeners ("slightly metallic").
2. **Choose a starting voice.** The library holds 42 original voices written for this project (`voices-core.js`) and 28 voices from the Electronic & Music Maker / Music Technology type-in series (`voices-emm.js`). They are ranked by meaning (family and tags, with rare tags weighted higher) and by how close each voice's *measured* sound already is to the request.
3. **Tailor it by measurement.** For the best few candidates, `macros.js` makes FM-aware edits (modulation depth on modulators, envelope contour on carriers, off-series ratios for metallic tones, and so on). `designer.js` then searches the edit amounts against rendered audio: `render.js` plays a test note, `features.js` measures spectral centroid, attack, decay, release and inharmonicity, and each search repeats until the measurement lands on the target.
4. **Explain.** The page shows which voice it started from, which edits were applied, and the start, target and result measurements.

## Shaping the sound

After forging, sliders in seven groups (Tone, Layers, Shape, Movement, Pitch, Playing, Output) let you keep working in sound terms rather than DX7 parameters. The description sets their starting positions; 0 always means "as the starting voice has it". Every change rebuilds the voice from the starting voice plus the full slider set, so moving a slider back really undoes it. The Variation control is a small, visible offset on a few tone sliders.

Each slider is an FM-aware edit, and the ones with a measurable result are searched against the renderer like the description targets:

- **Tone:** brightness, hollow ↔ full (1:2 vs 1:1 modulators), metallic ↔ pure, grit (feedback), chorus speed and smoothness, brightness across the keyboard (level scaling), octave.
- **Layers:** OWL finds the voice's layers (towers) and their roles: tine, sustain, saw-sustain, hammer. Tine level, pitch and touch, sustain tone, attack-vs-sustain balance, and a hammer (fixed-pitch, single fast decay). When no operator is spare for the hammer, OWL moves to an interchangeable algorithm that keeps the other layers' routing (for example 5 → 13, merging two sustain towers), then rebalances by measurement. Sliders a voice cannot support are shown greyed out with the reason.
- **Shape:** attack, attack bite (a modulation spike at note-on), held length, sustain level, release, timbre over time (dark → bright or bright → dark, built from modulator envelope stages 2 and 3), and change speed.
- **Movement:** vibrato, tremolo, timbre wobble (LFO on the modulators), movement speed and movement onset. The DX7 has one LFO, so these share rate and delay. The delay can fade movement in but not out.
- **Pitch:** scoop in from below, scoop speed, fall on release. The DX7 pitch envelope starts and ends at the same level, so a scoop also bends the release.
- **Playing:** velocity to brightness, velocity to volume, rate scaling.
- **Output:** level.

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
- `.openai/hosting.json`: ChatGPT Sites deployment configuration

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
