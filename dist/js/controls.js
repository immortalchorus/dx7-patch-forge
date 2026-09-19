// The sound-design sliders. Every slider runs -1..1 with 0 meaning "as the starting voice
// has it", and the finished voice is always rebuilt from the starting voice plus the whole
// slider set, so moving a slider back to 0 really returns to where you were.
//
// The description sets the initial slider positions (see slidersFromIntent).

export const GROUPS = ["Tone", "Shape", "Movement", "Pitch", "Playing", "Output"];

export const CONTROLS = [
  { id: "bright", group: "Tone", label: "Brightness", left: "Darker", right: "Brighter", hint: "Modulation depth, measured as spectral centroid at the start of the note" },
  { id: "hollow", group: "Tone", label: "Body", left: "Hollow", right: "Full", hint: "Odd-harmonic 1:2 modulators vs full-series 1:1 modulators" },
  { id: "harm", group: "Tone", label: "Tuning", left: "Metallic", right: "Pure", hint: "Modulators pushed off or snapped onto the harmonic series" },
  { id: "grit", group: "Tone", label: "Grit", left: "Smoother", right: "Grittier", hint: "Operator feedback" },
  { id: "width", group: "Tone", label: "Detune", left: "Focused", right: "Wide", hint: "Carrier detune spread (DX7 output is mono, so this is chorus-like beating)" },
  { id: "keyTrack", group: "Tone", label: "Across the keyboard", left: "High notes darker", right: "High notes brighter", hint: "Keyboard level scaling on the modulators" },
  { id: "register", group: "Tone", label: "Octave", left: "Down", right: "Up", steps: 4, hint: "Voice transpose, up to two octaves either way" },

  { id: "attack", group: "Shape", label: "Attack", left: "Slower", right: "Faster", hint: "Carrier rise time, measured" },
  { id: "bark", group: "Shape", label: "Attack bite", left: "Less", right: "More", hint: "A bright modulation spike at note-on that settles back, like a tine or pick" },
  { id: "decay", group: "Shape", label: "Held length", left: "Shorter", right: "Sustains", hint: "How long the note lasts while the key is down, measured" },
  { id: "sustain", group: "Shape", label: "Sustain level", left: "Lower", right: "Higher", hint: "Carrier level the note settles to while held" },
  { id: "release", group: "Shape", label: "Release", left: "Shorter", right: "Longer", hint: "Tail after key-up, measured" },
  { id: "evolve", group: "Shape", label: "Timbre over time", left: "Bright → dark", right: "Dark → bright", hint: "Modulator envelopes that close or open while the note is held, measured early vs late" },
  { id: "evolveTime", group: "Shape", label: "Change speed", left: "Faster", right: "Slower", hint: "How long the timbre change takes (about 0.3 to 6 s)" },

  { id: "vibrato", group: "Movement", label: "Vibrato", left: "Less", right: "More", hint: "LFO pitch depth" },
  { id: "tremolo", group: "Movement", label: "Tremolo", left: "Less", right: "More", hint: "LFO amplitude depth on the carriers" },
  { id: "wobble", group: "Movement", label: "Timbre wobble", left: "Less", right: "More", hint: "LFO on the modulators: a wah-like movement in brightness" },
  { id: "lfoRate", group: "Movement", label: "Movement speed", left: "Slower", right: "Faster", hint: "LFO rate. The DX7 has one LFO, shared by vibrato, tremolo and wobble" },
  { id: "onset", group: "Movement", label: "Movement arrives", left: "Sooner", right: "Later", hint: "LFO delay: movement fades in after the note starts (the DX7 LFO cannot fade out)" },

  { id: "scoop", group: "Pitch", label: "Pitch scoop in", left: "Less", right: "More", hint: "Starts below pitch and slides up. On the DX7 the pitch envelope starts and ends at the same level, so a scoop also bends the release down" },
  { id: "scoopTime", group: "Pitch", label: "Scoop speed", left: "Faster", right: "Slower", hint: "How long the slide into pitch takes" },
  { id: "fall", group: "Pitch", label: "Pitch fall on release", left: "Less", right: "More", hint: "How quickly pitch drops after key-up" },

  { id: "velBright", group: "Playing", label: "Velocity → brightness", left: "Less", right: "More", hint: "Velocity sensitivity of the modulators: harder playing is brighter" },
  { id: "velLoud", group: "Playing", label: "Velocity → volume", left: "Less", right: "More", hint: "Velocity sensitivity of the carriers: harder playing is louder" },
  { id: "rateKey", group: "Playing", label: "High notes shorter", left: "Less", right: "More", hint: "Envelope rate scaling: higher notes decay faster, like real strings" },

  { id: "level", group: "Output", label: "Output level", left: "Quieter", right: "Louder", hint: "0 = automatic level with 1 dB of headroom. Right of centre can clip" },
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
