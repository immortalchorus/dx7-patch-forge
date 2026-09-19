# DX7 Patch Forge

DX7 Patch Forge is a browser-based patch designer for Yamaha DX7-compatible SysEx and the native SpaceAge 80s FM synthesizer format.

Describe a sound in ordinary language, audition it on the built-in keyboard, and export:

- A native single-patch `.ssynth` file for SpaceAge 80s FM
- A 163-byte Yamaha DX7 single-voice `.syx`
- A 32-voice Yamaha DX7 cartridge `.syx`: the chosen voice plus 31 related candidates and variations

Live application: https://dx7-patch-forge.shanesanders.chatgpt.site

## How it works

1. **Interpret.** `language.js` reads the description into two things: instrument-family evidence ("wurlitzer", "flute", "tubular bells") and signed adjustments on concrete dimensions: brightness, attack, held decay, release, harmonicity, grit, vibrato, tremolo, evolving timbre, register, width and velocity response. It handles negation ("not bright"), intensifiers ("very dark") and softeners ("slightly metallic").
2. **Choose a starting voice.** The library holds 42 original voices written for this project (`voices-core.js`) and 28 voices from the Electronic & Music Maker / Music Technology type-in series (`voices-emm.js`). They are ranked by meaning (family and tags, with rare tags weighted higher) and by how close each voice's *measured* sound already is to the request.
3. **Tailor it by measurement.** For the best few candidates, `macros.js` makes FM-aware edits (modulation depth on modulators, envelope contour on carriers, off-series ratios for metallic tones, and so on). `designer.js` then searches the edit amounts against rendered audio: `render.js` plays a test note, `features.js` measures spectral centroid, attack, decay, release and inharmonicity, and each search repeats until the measurement lands on the target.
4. **Explain.** The page shows which voice it started from, which edits were applied, and the start, target and result measurements.

The renderer follows the msfa/Dexed envelope, output-level, velocity and keyboard-scaling math, so timing and modulation depth sit close to the hardware. It uses a sine table rather than the DX7's log-sine ROM, and approximates LFO delay and depth, so treat the in-browser preview as a close approximation.

Reference descriptions and programming notes for the EMM voices: https://bobbyblues.recup.ch/yamaha_dx7/patches/EMM.html

## SpaceAge .ssynth export

Native exports contain all 186 80s FM parameters, mapped as SpaceAge's `PluginProcessor` interprets them: ratio is coarse (0 means 0.5) with fine as a percentage, fixed mode is `10^(coarse & 3)` Hz with fine as `10^(fine/100)`, and the voice's own pitch envelope and keyboard scaling are carried across. The application reproduces SpaceAge's canonical JUCE JSON serialization and calculates both SHA-256 integrity fields in the browser.

No audio or prompt data is uploaded. Design, preview and file packaging all happen locally in the browser.

## Project structure

- `dist/index.html`, `dist/styles.css` and `dist/app.css`: interface
- `dist/js/app.js`: UI, audition keyboard, downloads
- `dist/js/dx7.js`: voice model, the 32 algorithms, VMEM/VCED packing, SysEx read and write
- `dist/js/render.js`: DX7-style FM renderer, used for measurement and preview
- `dist/js/features.js`: audio measurements
- `dist/js/language.js`: description parsing
- `dist/js/macros.js`: FM-aware edits
- `dist/js/designer.js`: base-voice ranking and measured tailoring
- `dist/js/design-worker.js` and `dist/js/preview-worklet.js`: design off the main thread, real-time preview
- `dist/js/ssynth.js`: SpaceAge native patch writer
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
