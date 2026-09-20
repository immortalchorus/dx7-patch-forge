// The sound-design sliders. Every slider runs -1..1 with 0 meaning "as the starting voice
// has it", and the finished voice is always rebuilt from the starting voice plus the whole
// slider set, so moving a slider back to 0 really returns to where you were.
//
// The description sets the initial slider positions (see slidersFromIntent).
//
// Each control is a data record, not just a label: its id never changes (SpaceAge's 80s FM page
// will adopt this vocabulary, so a rename costs more than it looks), `drives` names the macro in
// macros.js that carries it out, and `kind` says how it works:
//   direct      the macro edits parameters and that is the end of it
//   searched    a measured target is set and the amount is found by rendering and measuring
//   structural  it may add an operator or change the algorithm before editing anything
//   output      it only changes level

export const GROUPS = ["Tone", "Layers", "Shape", "Movement", "Pitch", "Playing", "Output"];

export const CONTROLS = [
  { id: "bright", group: "Tone", label: "Brightness", left: "Darker", right: "Brighter", hint: "Modulation depth, measured as spectral centroid at the start of the note", drives: "brighten", kind: "searched" },
  { id: "hollow", group: "Tone", label: "Body", left: "Hollow", right: "Full", hint: "Odd-harmonic 1:2 modulators vs full-series 1:1 modulators", drives: "setBody", kind: "direct" },
  { id: "harm", group: "Tone", label: "Tuning", left: "Metallic", right: "Pure", hint: "Modulators pushed off or snapped onto the harmonic series", drives: "setHarmonicity", kind: "direct" },
  { id: "grit", group: "Tone", label: "Grit", left: "Smoother", right: "Grittier", hint: "Operator feedback", drives: "setGrit + ensureFeedbackHeard", kind: "structural" },
  { id: "width", group: "Tone", label: "Chorus speed", left: "Still", right: "Faster", hint: "Opposite detune between parallel carriers: a bigger difference beats faster (DX7 output is mono, so this is beating, not stereo)", drives: "setWidth", kind: "direct" },
  { id: "chorusSmooth", group: "Tone", label: "Chorus smoothness", left: "Wobblier", right: "Smoother", hint: "Detune on modulators causes wobble rather than chorus; smoother pulls it to centre", drives: "setChorusSmooth", kind: "direct" },
  { id: "subOctave", group: "Layers", label: "Sub-octave", left: "None", right: "Full", hint: "A second carrier an octave below the note: two notes for every key, which is what makes a bass jump between registers", drives: "setSubOctave", kind: "structural" },
  { id: "growl", group: "Tone", label: "Growl", left: "Clean", right: "Rough", hint: "A modulator below the note's own pitch, which puts partials underneath it and roughens the tone. A third of real DX7 patches have one", drives: "setGrowl", kind: "structural" },
  { id: "keyTrack", group: "Tone", label: "Across the keyboard", left: "High notes darker", right: "High notes brighter", hint: "Keyboard level scaling on the modulators", drives: "setKeyTracking", kind: "direct" },
  { id: "register", group: "Tone", label: "Octave", left: "Down", right: "Up", steps: 4, hint: "Voice transpose, up to two octaves either way", drives: "shiftOctaves", kind: "direct" },

  { id: "tineLevel", group: "Layers", label: "Tine level", left: "Less", right: "More", hint: "Output level of the metallic tine modulator only (a high-ratio, fast-decaying modulator)", drives: "setTineLevel + ensureTine", kind: "structural" },
  { id: "tinePitch", group: "Layers", label: "Tine pitch", left: "Lower, wider range", right: "Higher, sharper", hint: "Tine ratio. Lower ratios (12) stay audible higher up the keyboard than higher ones (14)", drives: "setTinePitch + ensureTine", kind: "structural" },
  { id: "tineTouch", group: "Layers", label: "Tine touch", left: "Less", right: "More", hint: "Velocity sensitivity of the tine alone: harder playing brings out the metallic edge", drives: "setTineTouch", kind: "direct" },
  { id: "sustainTone", group: "Layers", label: "Sustain tone", left: "Soft", right: "Sawtooth", hint: "Feedback and modulation in the sustain layers only, leaving the attack alone", drives: "setSustainTone", kind: "direct" },
  { id: "balance", group: "Layers", label: "Attack ↔ sustain", left: "More sustain", right: "More attack", hint: "Carrier levels of the tine tower against the sustain towers", drives: "setLayerBalance", kind: "direct" },
  { id: "hammer", group: "Layers", label: "Hammer", left: "Less", right: "More", hint: "A fixed-pitch operator with one fast decay. If no operator is spare, OWL moves to an interchangeable algorithm to free one", drives: "setHammer", kind: "structural" },
  { id: "hammerPitch", group: "Layers", label: "Hammer pitch", left: "Lower thud", right: "Higher knock", hint: "Fixed frequency, about 80 to 320 Hz (100 to 200 Hz sounds most like a hammer)", drives: "setHammer", kind: "structural" },
  { id: "hammerTouch", group: "Layers", label: "Hammer touch", left: "Less", right: "More", hint: "Velocity sensitivity of the hammer", drives: "setHammer", kind: "structural" },
  { id: "attack", group: "Shape", label: "Attack", left: "Slower", right: "Faster", hint: "Carrier rise time, measured", drives: "setAttack", kind: "searched" },
  { id: "bark", group: "Shape", label: "Attack bite", left: "Less", right: "More", hint: "A bright modulation spike at note-on that settles back, like a tine or pick", drives: "shapeModulators", kind: "searched" },
  { id: "decay", group: "Shape", label: "Held length", left: "Shorter", right: "Sustains", hint: "How long the note lasts while the key is down, measured", drives: "shiftDecay / makeSustained", kind: "searched" },
  { id: "sustain", group: "Shape", label: "Sustain level", left: "Lower", right: "Higher", hint: "Carrier level the note settles to while held", drives: "setSustain", kind: "direct" },
  { id: "tail", group: "Shape", label: "Tail after the decay", left: "None", right: "Long", hint: "The second, slower decay that keeps an electric piano or bell ringing quietly after the attack has gone", drives: "setTail", kind: "direct" },
  { id: "release", group: "Shape", label: "Release", left: "Shorter", right: "Longer", hint: "Tail after key-up, measured", drives: "setRelease", kind: "searched" },
  { id: "evolve", group: "Shape", label: "Timbre over time", left: "Bright → dark", right: "Dark → bright", hint: "Modulator envelopes that close or open while the note is held, measured early vs late", drives: "shapeModulators", kind: "searched" },
  { id: "evolveTime", group: "Shape", label: "Change speed", left: "Faster", right: "Slower", hint: "How long the timbre change takes (about 0.3 to 6 s)", drives: "shapeModulators", kind: "searched" },

  { id: "vibrato", group: "Movement", label: "Vibrato", left: "Less", right: "More", hint: "LFO pitch depth", drives: "setMovement", kind: "direct" },
  { id: "tremolo", group: "Movement", label: "Tremolo", left: "Less", right: "More", hint: "LFO amplitude depth on the carriers", drives: "setMovement", kind: "direct" },
  { id: "wobble", group: "Movement", label: "Timbre wobble", left: "Less", right: "More", hint: "LFO on the modulators: a wah-like movement in brightness", drives: "setMovement", kind: "direct" },
  { id: "lfoRate", group: "Movement", label: "Movement speed", left: "Slower", right: "Faster", hint: "LFO rate. The DX7 has one LFO, shared by vibrato, tremolo and wobble", drives: "setMovement", kind: "direct" },
  { id: "onset", group: "Movement", label: "Movement arrives", left: "Sooner", right: "Later", hint: "LFO delay: movement fades in after the note starts (the DX7 LFO cannot fade out)", drives: "setMovement", kind: "direct" },

  { id: "scoop", group: "Pitch", label: "Pitch scoop in", left: "Less", right: "More", hint: "Starts below pitch and slides up. On the DX7 the pitch envelope starts and ends at the same level, so a scoop also bends the release down", drives: "setPitchShape", kind: "direct" },
  { id: "scoopTime", group: "Pitch", label: "Scoop speed", left: "Faster", right: "Slower", hint: "How long the slide into pitch takes", drives: "setPitchShape", kind: "direct" },
  { id: "fall", group: "Pitch", label: "Pitch fall on release", left: "Less", right: "More", hint: "How quickly pitch drops after key-up", drives: "setPitchShape", kind: "direct" },

  { id: "velBright", group: "Playing", label: "Velocity → brightness", left: "Less", right: "More", hint: "Velocity sensitivity of the modulators: harder playing is brighter", drives: "setVelocity", kind: "direct" },
  { id: "velLoud", group: "Playing", label: "Velocity → volume", left: "Less", right: "More", hint: "Velocity sensitivity of the carriers: harder playing is louder", drives: "setVelocity", kind: "direct" },
  { id: "pivot", group: "Playing", label: "Where it thins out", left: "Lower", right: "Higher", hint: "The keyboard level scaling break point: below it notes keep their body, above it they thin out. Real patches sit around middle C", drives: "setScalingPivot", kind: "direct" },
  { id: "rateKey", group: "Playing", label: "High notes shorter", left: "Less", right: "More", hint: "Envelope rate scaling: higher notes decay faster, like real strings", drives: "setRateScaling", kind: "direct" },

  { id: "level", group: "Output", label: "Output level", left: "Quieter", right: "Louder", hint: "0 = automatic level with 1 dB of headroom. Right of centre can clip", drives: "carrierGain", kind: "output" },
];

export const neutralSliders = () => Object.fromEntries(CONTROLS.map((c) => [c.id, 0]));

const clamp1 = (x) => Math.max(-1, Math.min(1, x));

/** Octaves of transpose for a register slider value (steps of half = one octave). */
export const registerOctaves = (x) => Math.round(x * 2);

/** Initial slider positions from an interpreted description, for a given starting voice. */
export function slidersFromIntent(intent, entry) {
  const d = intent.dims;
  const s = neutralSliders();
  for (const c of CONTROLS) if (c.id in d) s[c.id] = clamp1(d[c.id]);
  // Coarse "expressive" maps onto both velocity sliders.
  if (d.dyn) (s.velBright = clamp1(s.velBright + d.dyn * 0.8)), (s.velLoud = clamp1(s.velLoud + d.dyn * 0.5));
  let octaves = Math.round(d.register * 1.2);
  // "Deep bass" is already low; only "sub" or "octave down" drops a bass voice further.
  if (entry?.family === "bass" && octaves < 0 && intent.raw.register > -1.2) octaves = 0;
  s.register = octaves / 2;
  return s;
}
