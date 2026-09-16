# DX7 Patch Forge

DX7 Patch Forge is a browser-based patch generator for Yamaha DX7-compatible SysEx and the native SpaceAge **80s FM** synthesizer format.

Describe a sound in ordinary language, choose a variation, and export:

- A native single-patch `.ssynth` file for SpaceAge 80s FM
- A 32-voice Yamaha DX7 cartridge `.syx`
- A 163-byte Yamaha DX7 single-voice `.syx`

Live application: <https://dx7-patch-forge.shanesanders.chatgpt.site>

## How it works

The current sound-design engine uses 28 authored DX7 voices from the Electronic & Music Maker / Music Technology collection as curated structural foundations. It preserves each selected voice's algorithm, operator envelopes, oscillator modes, frequency ratios, fine tuning, detuning, velocity response, keyboard scaling, feedback, pitch envelope, and LFO configuration.

Prompt terms then apply bounded, musically targeted changes instead of randomly rebuilding the six-operator topology. Implemented transformations include brightness, warmth, note length, harmonic stability, velocity response, delayed motion, LFO behavior, and several patch-specific edits documented by the original programmers.

Reference descriptions and programming notes:

- <https://bobbyblues.recup.ch/yamaha_dx7/patches/EMM.html>

## SpaceAge `.ssynth` export

Native exports contain all 186 supported 80s FM parameters. The application reproduces SpaceAge's JUCE-compatible canonical JSON serialization and calculates both required SHA-256 integrity fields in the browser.

No audio or prompt data is uploaded. Generation and file packaging happen locally in the browser.

## Project structure

- `dist/index.html` — application interface
- `dist/app.js` — prompt analysis, DX7 packing, SpaceAge serialization and integrity calculation
- `dist/emm-engine.js` — embedded EMM/MT corpus, voice decoder, template selection and bounded transformations
- `dist/styles.css` and `dist/interpretation.css` — interface styling
- `.openai/hosting.json` — ChatGPT Sites deployment configuration

## Run locally

Serve the repository root or `dist` directory with any static HTTP server, then open `dist/index.html` through that server. The application has no build step and no package dependencies.

## Ownership and licensing

Copyright © 2026 Shane Sanders / Sample Squad. No license is granted for redistribution or incorporation into other software unless separately authorized.
