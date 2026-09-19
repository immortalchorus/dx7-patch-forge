// Turns a sound description into (a) instrument-family evidence for choosing a base voice
// and (b) signed adjustments on concrete sound dimensions.
//
// Dimensions (each summed from cues, then squashed to -1..1):
//   bright   spectral brightness              attack   + fast / - slow onset
//   decay    + sustains longer while held     release  + longer tail after key-up
//   harm     + pure/harmonic, - metallic      grit     + rough/buzzy (feedback)
//   vibrato  pitch wobble                     tremolo  amplitude wobble
//   evolve   + dark->bright, - bright->dark   register octave shift, + up
//   width    detuned / chorused spread        dyn      velocity sensitivity
// plus the finer controls in controls.js (bark, onset, scoop, wobble...), which cues can
// also set directly.

export const DIMENSIONS = [
  "bright", "attack", "decay", "release", "harm", "grit", "vibrato", "tremolo", "evolve", "register", "width", "dyn",
  "hollow", "bark", "sustain", "evolveTime", "wobble", "lfoRate", "onset", "scoop", "scoopTime", "fall",
  "velBright", "velLoud", "rateKey", "keyTrack", "level",
];

// Instrument vocabulary. Longer phrases are matched first and consume their words.
const FAMILY_WORDS = {
  epiano: ["electric piano", "e-piano", "e piano", "epiano", "rhodes", "wurlitzer", "wurli", "dx piano", "tine", "suitcase", "ep"],
  piano: ["grand piano", "upright piano", "acoustic piano", "honky tonk", "honky-tonk", "piano", "grand", "keys"],
  bell: ["tubular bell", "bell", "bells", "chime", "chimes", "gong", "glockenspiel", "glock", "celesta", "carillon", "tam tam"],
  mallet: ["music box", "steel drum", "steel pan", "marimba", "xylophone", "vibraphone", "vibes", "kalimba", "mbira", "mallet", "mallets"],
  organ: ["pipe organ", "church organ", "drawbar", "hammond", "organ", "harmonium", "accordion", "tonewheel"],
  brass: ["french horn", "brass section", "brass", "trumpet", "trombone", "horn", "horns", "tuba", "fanfare", "cornet"],
  strings: ["string ensemble", "string section", "strings", "string", "violin", "violins", "viola", "cello", "orchestra", "orchestral", "pizzicato", "bowed"],
  pad: ["pad", "pads", "drone", "atmosphere", "ambience", "soundscape", "texture", "wash"],
  choir: ["choir", "choral", "voices", "voice", "vocal", "vox", "aah", "ooh", "chant", "singers"],
  vox: ["fairlight", "formant", "talking"],
  flute: ["pan flute", "flute", "piccolo", "recorder", "ocarina", "whistle", "shakuhachi", "pipe"],
  reed: ["clarinet", "oboe", "bassoon", "saxophone", "sax", "harmonica", "woodwind", "reed"],
  bass: ["sub bass", "bass guitar", "bassline", "bass", "808"],
  guitar: ["guitar", "nylon", "strum", "koto", "sitar", "banjo", "mandolin"],
  pluck: ["pluck", "plucked", "plucky", "harp", "arp", "arpeggio"],
  clav: ["clavinet", "clav", "harpsichord", "cembalo"],
  lead: ["lead", "solo synth", "synth lead", "sawtooth", "saw", "square", "sync", "chiptune", "8-bit"],
  fx: ["laser", "zap", "sci-fi", "scifi", "alien", "robot", "robotic", "effect", "fx", "siren", "riser"],
  perc: ["drum", "drums", "tom", "kick", "percussion", "percussive hit", "hit", "thump", "snare"],
};

// Words that name a family but mostly describe a shape count for less.
const WEAK_FAMILY_WORDS = {
  pluck: 0.35, plucked: 0.35, plucky: 0.35, arp: 0.5, arpeggio: 0.5, hit: 0.4, keys: 0.6, voice: 0.6, voices: 0.7,
  pipe: 0.5, saw: 0.6, square: 0.6, sync: 0.6, effect: 0.6, texture: 0.6, wash: 0.5, string: 0.7, bowed: 0.6,
  orchestral: 0.5, orchestra: 0.6, thump: 0.4, grand: 0.7, reed: 0.7,
};

const c = (phrase, fx) => [phrase, fx];
// Descriptive cues. Values are contributions on the dimensions above.
const CUES = [
  // brightness
  c("very bright", { bright: 1.2 }), c("bright", { bright: 0.7 }), c("brilliant", { bright: 0.9 }),
  c("sparkling", { bright: 0.8, harm: 0.2 }), c("sparkly", { bright: 0.8 }), c("shimmering", { bright: 0.5, width: 0.4, tremolo: 0.2 }),
  c("shimmer", { bright: 0.5, width: 0.4 }), c("glassy", { bright: 0.5, harm: -0.2 }), c("glass", { bright: 0.4 }),
  c("crystalline", { bright: 0.6, harm: -0.2 }), c("crystal", { bright: 0.5 }), c("icy", { bright: 0.5, width: -0.2 }),
  c("cold", { bright: 0.3, width: -0.3 }), c("cutting", { bright: 0.8, grit: 0.3 }), c("piercing", { bright: 0.9 }),
  c("harsh", { bright: 0.8, grit: 0.6 }), c("edgy", { bright: 0.6, grit: 0.4 }), c("biting", { bright: 0.6, grit: 0.3 }),
  c("strident", { bright: 0.8 }), c("brassy", { bright: 0.6 }), c("nasal", { bright: 0.5 }), c("thin", { bright: 0.3, register: 0.2 }),
  c("airy", { bright: 0.3, release: 0.3 }), c("luminous", { bright: 0.4, release: 0.3 }), c("radiant", { bright: 0.5 }),
  c("very dark", { bright: -1.2 }), c("dark", { bright: -0.7 }), c("dull", { bright: -0.8 }), c("muted", { bright: -0.7 }),
  c("muffled", { bright: -0.9 }), c("mellow", { bright: -0.6, attack: -0.1 }), c("soft", { bright: -0.4, attack: -0.3, dyn: 0.1 }),
  c("gentle", { bright: -0.4, attack: -0.2 }), c("round", { bright: -0.4 }), c("rounded", { bright: -0.4 }),
  c("smooth", { bright: -0.3, grit: -0.5 }), c("velvety", { bright: -0.5, grit: -0.4 }), c("warm", { bright: -0.35, width: 0.35, harm: 0.2 }),
  c("dusty", { bright: -0.3, grit: 0.2 }), c("lo-fi", { bright: -0.5, grit: 0.3 }), c("vintage", { bright: -0.2, width: 0.2 }),
  c("hollow", { hollow: -0.8, bright: -0.1 }), c("woody", { bright: -0.2 }), c("wooden", { bright: -0.2 }), c("pure", { bright: -0.4, harm: 0.8, grit: -0.6 }),
  c("sine", { bright: -0.8, harm: 0.8 }), c("clean", { harm: 0.5, grit: -0.6 }), c("clear", { harm: 0.4, grit: -0.3 }),
  // attack
  c("very slow attack", { attack: -1.4 }), c("slow attack", { attack: -1 }), c("long attack", { attack: -1 }),
  c("soft attack", { attack: -0.6 }), c("gentle attack", { attack: -0.6 }), c("fade in", { attack: -1 }), c("fades in", { attack: -1 }),
  c("swell", { attack: -0.9 }), c("swelling", { attack: -0.9 }), c("bloom", { attack: -0.6, evolve: 0.4 }), c("blooming", { attack: -0.6, evolve: 0.4 }),
  c("fast attack", { attack: 1 }), c("hard attack", { attack: 1, bright: 0.2 }), c("sharp attack", { attack: 1, bright: 0.3 }),
  c("instant", { attack: 1 }), c("snappy", { attack: 1, decay: -0.5 }), c("punchy", { attack: 1, decay: -0.3, bright: 0.2 }),
  c("percussive", { attack: 1, decay: -0.7 }), c("plucky", { attack: 1, decay: -0.8 }), c("plucked", { attack: 1, decay: -0.4 }),
  c("stab", { attack: 1, decay: -0.5, release: -0.5 }), c("stabby", { attack: 1, decay: -0.5 }), c("click", { attack: 1, bright: 0.2 }),
  // length while held
  c("sustained", { decay: 1.2 }), c("sustaining", { decay: 1.2 }), c("held", { decay: 1 }), c("endless", { decay: 1.5, release: 0.8 }),
  c("infinite", { decay: 1.5, release: 0.8 }), c("long decay", { decay: 1, release: 0.6 }), c("long", { decay: 0.6, release: 0.5 }),
  c("lingering", { decay: 0.7, release: 0.8 }), c("ringing", { decay: 0.8, release: 0.6 }), c("resonant", { decay: 0.5, release: 0.4 }),
  c("short decay", { decay: -1 }), c("short", { decay: -0.9, release: -0.6 }), c("staccato", { decay: -1.2, release: -0.8 }),
  c("tight", { decay: -0.6, release: -0.6 }), c("dry", { release: -0.8 }), c("quick", { decay: -0.6, attack: 0.4 }),
  // release / space
  c("long release", { release: 1.2 }), c("long tail", { release: 1.2 }), c("tail", { release: 0.6 }), c("decaying", { decay: -0.3, release: 0.3 }),
  c("distant", { release: 0.8, attack: -0.3, bright: -0.3 }), c("spacious", { release: 0.8, width: 0.5 }), c("vast", { release: 1, width: 0.5 }),
  c("huge", { release: 0.6, width: 0.4, register: -0.3 }), c("ambient", { release: 0.9, attack: -0.4 }), c("reverberant", { release: 1 }),
  c("ethereal", { release: 0.8, attack: -0.5, bright: 0.2, width: 0.3 }), c("dreamy", { release: 0.8, attack: -0.5, width: 0.5 }),
  c("atmospheric", { release: 0.8, attack: -0.4, evolve: 0.3 }), c("cinematic", { release: 0.6, width: 0.3 }), c("intimate", { release: -0.4, width: -0.3 }),
  // harmonic character
  c("metallic", { harm: -0.8, bright: 0.3 }), c("metal", { harm: -0.6 }), c("inharmonic", { harm: -1.2 }), c("clangy", { harm: -1, bright: 0.4 }),
  c("clangorous", { harm: -1, bright: 0.4 }), c("dissonant", { harm: -1 }), c("bell-like", { harm: -0.6, decay: 0.4 }), c("tinny", { harm: -0.4, bright: 0.5 }),
  c("harmonic", { harm: 0.6 }), c("tonal", { harm: 0.4 }), c("stable", { harm: 0.5, vibrato: -0.5 }), c("focused", { harm: 0.4, width: -0.4 }),
  // grit
  c("aggressive", { grit: 0.9, bright: 0.5, attack: 0.3 }), c("distorted", { grit: 1.2, bright: 0.4 }), c("dirty", { grit: 0.9 }),
  c("gritty", { grit: 0.9 }), c("growling", { grit: 0.8, register: -0.3 }), c("growl", { grit: 0.8 }), c("raspy", { grit: 0.8, bright: 0.3 }),
  c("buzzy", { grit: 0.8, bright: 0.4 }), c("fizzy", { grit: 0.7, bright: 0.5 }), c("rough", { grit: 0.7 }), c("crunchy", { grit: 0.8 }),
  c("fat", { grit: 0.3, width: 0.5, register: -0.2 }), c("thick", { grit: 0.3, width: 0.5 }), c("heavy", { grit: 0.5, register: -0.3 }),
  c("powerful", { grit: 0.3, bright: 0.4 }), c("massive", { grit: 0.3, width: 0.5, register: -0.3 }), c("brutal", { grit: 1.2, bright: 0.6 }),
  c("breathy", { grit: 0.2, bright: -0.1, attack: -0.3 }),
  // movement
  c("vibrato", { vibrato: 1 }), c("heavy vibrato", { vibrato: 1.6 }), c("gentle vibrato", { vibrato: 0.5 }), c("delayed vibrato", { vibrato: 0.8 }),
  c("tremolo", { tremolo: 1 }), c("pulsing", { tremolo: 0.9 }), c("throbbing", { tremolo: 1 }), c("wobble", { vibrato: 1.2 }), c("wobbly", { vibrato: 1.2 }),
  c("wobbling", { vibrato: 1.2 }), c("warbling", { vibrato: 1.3 }), c("detuned", { width: 1 }), c("chorus", { width: 1 }), c("chorused", { width: 1 }),
  c("lush", { width: 0.8, release: 0.3 }), c("wide", { width: 0.8 }), c("ensemble", { width: 0.6 }), c("unison", { width: 0.8 }),
  c("evolving", { evolve: 1, attack: -0.3 }), c("morphing", { evolve: 1 }), c("moving", { evolve: 0.7 }), c("animated", { evolve: 0.7, vibrato: 0.2 }),
  c("sweeping", { evolve: 1 }), c("sweep", { evolve: 0.9 }), c("static", { evolve: -0.8, vibrato: -0.8, tremolo: -0.8 }), c("steady", { vibrato: -0.6, tremolo: -0.6 }),
  // register
  c("sub", { register: -1 }), c("deep", { register: -0.8, bright: -0.2 }), c("low", { register: -0.7 }), c("rumbling", { register: -1, grit: 0.3 }),
  c("high", { register: 0.7 }), c("octave up", { register: 1 }), c("octave down", { register: -1 }), c("tiny", { register: 0.8, decay: -0.2 }),
  c("high pitched", { register: 1 }), c("small", { register: 0.5 }),
  // body and bite
  c("full", { hollow: 0.5 }), c("rich", { hollow: 0.6, bright: 0.2 }), c("full-bodied", { hollow: 0.8 }), c("reedy", { hollow: -0.6, bright: 0.2 }),
  c("bark", { bark: 1 }), c("barking", { bark: 1 }), c("bite", { bark: 0.8 }), c("biting attack", { bark: 1 }), c("tine", { bark: 0.6 }),
  c("attack transient", { bark: 0.8 }), c("chiff", { bark: 0.6 }), c("pick", { bark: 0.6 }), c("thwack", { bark: 1 }),
  // timbre over time
  c("opens up", { evolve: 1 }), c("opening", { evolve: 0.9 }), c("gets brighter", { evolve: 1 }), c("brightens", { evolve: 1 }),
  c("dark to bright", { evolve: 1.4 }), c("bright to dark", { evolve: -1.4 }), c("gets darker", { evolve: -1 }), c("darkens", { evolve: -1 }),
  c("darkening", { evolve: -1 }), c("mellows", { evolve: -0.9 }), c("closes", { evolve: -0.8 }), c("fading", { evolve: -0.5, decay: -0.2 }),
  c("slowly", { evolveTime: 0.6, attack: -0.2 }), c("gradual", { evolveTime: 0.6 }), c("gradually", { evolveTime: 0.6 }),
  // movement timing and speed
  c("delayed vibrato", { vibrato: 0.8, onset: 1 }), c("late vibrato", { vibrato: 0.8, onset: 1.2 }), c("toward the end", { onset: 1.2 }),
  c("towards the end", { onset: 1.2 }), c("at the end", { onset: 1 }), c("later in the note", { onset: 1.2 }), c("comes in", { onset: 0.6 }),
  c("fast vibrato", { vibrato: 0.8, lfoRate: 0.8 }), c("slow vibrato", { vibrato: 0.8, lfoRate: -0.8 }), c("flutter", { tremolo: 0.8, lfoRate: 1 }),
  c("trill", { vibrato: 1, lfoRate: 1 }), c("wah", { wobble: 1 }), c("wah-wah", { wobble: 1.2 }), c("filter wobble", { wobble: 1 }),
  c("rhythmic", { tremolo: 0.6, lfoRate: 0.4 }), c("slow tremolo", { tremolo: 0.8, lfoRate: -0.7 }), c("fast tremolo", { tremolo: 0.8, lfoRate: 0.8 }),
  // pitch
  c("scoop", { scoop: 0.8 }), c("scooping", { scoop: 0.8 }), c("bend up", { scoop: 0.8 }), c("slides in", { scoop: 0.7, scoopTime: 0.5 }),
  c("slide", { scoop: 0.6, scoopTime: 0.4 }), c("fall off", { fall: 1 }), c("falls off", { fall: 1 }), c("droop", { fall: 0.7 }),
  c("drops", { fall: 0.6 }), c("pitch drop", { fall: 1 }), c("dive", { fall: 1 }),
  // playing
  c("velocity sensitive", { velBright: 1, velLoud: 0.6 }), c("touch", { velBright: 0.6 }), c("even", { velBright: -0.6, velLoud: -0.6 }),
  c("realistic", { rateKey: 0.6, keyTrack: -0.4 }), c("natural", { rateKey: 0.5, keyTrack: -0.3 }),
  // level
  c("quiet", { level: -0.5 }), c("quieter", { level: -0.5 }), c("loud", { level: 0.2 }),
  // mood and character
  c("spacey", { release: 0.9, width: 0.5, evolve: 0.6, vibrato: 0.3 }), c("spacy", { release: 0.9, width: 0.5, evolve: 0.6 }),
  c("cosmic", { release: 1, width: 0.5, evolve: 0.6 }), c("space", { release: 0.7, evolve: 0.4 }),
  c("weird", { harm: -0.8, evolve: 0.5 }), c("strange", { harm: -0.7, evolve: 0.4 }), c("odd", { harm: -0.5 }),
  c("otherworldly", { harm: -0.6, release: 0.8, evolve: 0.6 }), c("eerie", { harm: -0.5, vibrato: 0.4, release: 0.6 }),
  c("haunting", { release: 0.8, attack: -0.4, vibrato: 0.3 }), c("mysterious", { harm: -0.4, release: 0.6, bright: -0.2 }),
  c("sad", { bright: -0.4, attack: -0.2, release: 0.3 }), c("melancholic", { bright: -0.4, release: 0.4 }),
  c("nostalgic", { bright: -0.3, width: 0.4 }), c("happy", { bright: 0.4 }), c("cheerful", { bright: 0.4, decay: -0.2 }),
  c("angry", { grit: 0.8, bright: 0.5 }), c("calm", { attack: -0.4, bright: -0.3, release: 0.4 }), c("relaxing", { attack: -0.4, bright: -0.3, release: 0.5 }),
  c("epic", { width: 0.5, release: 0.5, grit: 0.2 }), c("retro", { width: 0.2 }), c("80s", { width: 0.3, bright: 0.2 }),
  // dynamics
  c("expressive", { dyn: 1 }), c("dynamic", { dyn: 1 }), c("velocity", { dyn: 1 }), c("touch sensitive", { dyn: 1.2 }), c("responsive", { dyn: 0.8 }),
];

const INTENSIFY = /\b(very|extremely|really|super|incredibly|intensely|ultra|quite|so)\s+$/;
const SOFTEN = /\b(slightly|subtly|somewhat|a bit|a little|gently|mildly|a touch)\s+$/;
const NEGATE = /\b(not|no|without|less|non|never|avoid|minus)\s+(?:a\s+|an\s+|the\s+|too\s+|very\s+|so\s+)?$/;
const MORE = /\b(more|extra|plenty of|lots of|lot of)\s+$/;

const normalize = (s) => " " + s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9+#-]+/g, " ").replace(/\s+/g, " ").trim() + " ";

function findAll(text, phrase, used) {
  const out = [];
  const needle = " " + phrase + " ";
  let from = 0, idx;
  while ((idx = text.indexOf(needle, from)) !== -1) {
    const start = idx + 1, end = start + phrase.length;
    from = idx + 1;
    if (used.some(([a, b]) => start < b && end > a)) continue;
    out.push([start, end]);
  }
  return out;
}

function modifier(text, start) {
  const pre = text.slice(Math.max(0, start - 24), start);
  if (NEGATE.test(pre)) return { scale: -0.7, tag: "not " };
  if (INTENSIFY.test(pre)) return { scale: 1.5, tag: "very " };
  if (SOFTEN.test(pre)) return { scale: 0.5, tag: "slightly " };
  if (MORE.test(pre)) return { scale: 1.2, tag: "more " };
  return { scale: 1, tag: "" };
}

/**
 * Interpret a description.
 * Returns { dims: {dim: -1..1}, raw: {dim: sum}, families: {family: weight}, words: [...], cues: [...] }.
 */
export function interpret(input) {
  const text = normalize(input || "");
  const used = [];
  const families = {};
  const cues = [];
  const famPhrases = Object.entries(FAMILY_WORDS)
    .flatMap(([fam, words]) => words.map((w) => [w, fam]))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, fam] of famPhrases) {
    for (const [s, e] of findAll(text, phrase, used)) {
      const { scale, tag } = modifier(text, s);
      if (scale < 0) continue; // "not a piano" says nothing useful about what it is
      // Earlier nouns usually name the instrument; later ones tend to be comparisons.
      const weight = phrase.includes(" ") ? 1.4 : WEAK_FAMILY_WORDS[phrase] ?? 1;
      families[fam] = (families[fam] || 0) + weight * (1 - Math.min(0.4, s / 400));
      used.push([s, e]);
      cues.push({ phrase: tag + phrase, family: fam });
    }
  }
  // Single instrument words can still carry description ("plucked" is a family and a
  // shape); multi-word names ("sub bass") are consumed so "sub" is not counted twice.
  const cueUsed = used.filter(([s, e]) => text.slice(s, e).includes(" "));
  const raw = Object.fromEntries(DIMENSIONS.map((d) => [d, 0]));
  for (const [phrase, fx] of [...CUES].sort((a, b) => b[0].length - a[0].length)) {
    for (const [s, e] of findAll(text, phrase, cueUsed)) {
      const { scale, tag } = modifier(text, s);
      for (const [d, v] of Object.entries(fx)) raw[d] += v * scale;
      cueUsed.push([s, e]);
      cues.push({ phrase: tag + phrase, effects: fx, scale });
    }
  }
  const dims = Object.fromEntries(DIMENSIONS.map((d) => [d, Math.tanh(raw[d])]));
  const words = text.trim().split(" ").filter((w) => w.length > 2);
  return { dims, raw, families, words, cues };
}

/** Light stemming so "bells", "plucked" and "shimmering" meet their tags. */
export function stem(w) {
  return w
    .replace(/(ing|ed|es|s|y|er|ly)$/, "")
    .replace(/(.)\1$/, "$1");
}
