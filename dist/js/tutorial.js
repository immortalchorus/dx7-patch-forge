// The Chord Lab tutorial, as data.
//
// One list of steps, read two ways: the in-app tour walks them, highlighting the real control and
// running the step on the real Chord Lab, and tutorial.html renders the same records as an
// article you can read end to end. Written once so the two cannot drift apart.
//
// This follows the rule the rest of the forge follows: explanations are data, and the prose is
// derived from them (see `changes` in designer.js). A step says *what* should happen; it never
// touches the page. `run` is handed an api by app.js and calls methods on it, so this file has no
// DOM, no globals and no side effects, and can be rendered by a page that has no Chord Lab on it
// at all.
//
// `target` is the id of the control the step is about. Those ids are a contract - the same
// contract `tests/vocabulary.test.js` holds the control vocabulary to - and
// `tests/tutorial.test.js` asserts every one of them still exists in index.html, so a renamed
// control fails the suite instead of quietly leaving the tutorial pointing at nothing.

export const TUTORIAL_TITLE = "Chord Lab";

export const TUTORIAL_INTRO =
  "Chord Lab is bench equipment for designing a patch, not for writing music. You pick chords, the " +
  "loop plays them through the voice you are working on, and OWL measures what happens. The " +
  "measuring is the part no other tool does.";

export const TUTORIAL_STEPS = [
  {
    id: "why",
    target: "#chordLab",
    title: "Why this is in a patch designer",
    body:
      "Four stacked carriers clip where one does not. A patch can measure clean on every single " +
      "note across the keyboard and still be unusable under a four-note voicing, and until this " +
      "existed nothing in OWL could tell you so. Everything here is bench equipment: it is never " +
      "written into a patch, never exported, and never sent over MIDI.",
  },
  {
    id: "honeycomb",
    target: "#clHoneycomb",
    title: "One hexagon per degree of the key",
    body:
      "Each cell is one degree of the scale you have chosen - seven for a major key. Click one and " +
      "the chord goes into the progression and onto a step of the loop, so it is audible straight " +
      "away rather than sitting in a list. The large name is what you play; the small numeral " +
      "underneath is what that chord does in the key.",
    run: (lab) => {
      lab.setKey(0);
      lab.setScale("Major");
      lab.clearChords();
    },
  },
  {
    id: "progression",
    target: "#clProgression",
    title: "Build a progression",
    body:
      "These four are I, V, vi and IV in C. They land on beats one, five, nine and thirteen and " +
      "hold through the rests after them, which is why you hear four chords rather than four " +
      "stabs. A progression holds up to eight.",
    run: (lab) => {
      for (const degree of [0, 4, 5, 3]) lab.addChord(degree);
    },
  },
  {
    id: "row",
    target: "#chordLane",
    title: "The chord row says where they sit",
    body:
      "Click an empty step to repeat the selected chord there, click another step's chord to " +
      "select it, and click the selected one again to take it off. A repeat arrives as a copy: two " +
      "steps showing the same chord are two chords, so you can voice one of them differently " +
      "without disturbing the other.",
  },
  {
    id: "quality",
    target: "#clEditorBlock",
    title: "Quality, inversion, voicing and register",
    body:
      "These four apply to the one chord you have selected. Setting Quality to 7th is worth trying " +
      "first: it gives the seventh chord the key itself builds on that degree, so the same control " +
      "makes I a major seventh and V a dominant. The key decides, not the control.",
    run: (lab) => {
      lab.selectNth(0);
      lab.editChord({ quality: 1 });
    },
  },
  {
    id: "scales",
    target: "#clMode",
    title: "It is not only for major keys",
    body:
      "Because the honeycomb is one cell per degree rather than a circle of fifths, it describes " +
      "every scale OWL knows - five hexagons for a pentatonic, six for whole tone, eight for a " +
      "diminished scale. Every chord still gets a real note name: C Phrygian Dominant reads C, D " +
      "flat, E diminished, F minor, G diminished, A flat augmented, B flat minor.",
    run: (lab) => lab.setScale("Phrygian Dominant"),
  },
  {
    id: "spelling",
    target: "#clSpelling",
    title: "When the key spells it wrong",
    body:
      "A seven-note scale owns a letter for each degree, so the key always spells it correctly. A " +
      "five- or six-note scale has no such letter and falls back to a plain name, and there the " +
      "key can be wrong: C minor pentatonic is spelled with an E flat by every player alive, but " +
      "the key of C spells itself with sharps. Set Spelling to Flats when that happens.",
    run: (lab) => lab.setScale("Minor Pentatonic"),
  },
  {
    id: "measure",
    target: "#clMeasure",
    title: "Measure the patch under the chords",
    body:
      "This renders every chord through the voice you are designing and reports what the mix peaks " +
      "at, where 0 dB is exactly where SpaceAge and Dexed clip. Stacking is how much louder the " +
      "chord is than its loudest single note. Most patches are levelled for one note at a time and " +
      "clip hard under four - the default electric piano is about nine decibels over.",
    run: (lab) => {
      lab.setKey(0);
      lab.setScale("Major");
      lab.setSpelling("key");
      lab.clearChords();
      for (const degree of [0, 4, 5, 3]) lab.addChord(degree, 1);
      lab.measure();
    },
  },
  {
    id: "voicing",
    target: "#clVoicing",
    title: "Then fix it with a voicing",
    body:
      "Drop 2 lowers the second note from the top by an octave, spreading the chord out instead of " +
      "stacking it in one place. Measure again and the number moves. That is the whole point of " +
      "this panel: a voicing chosen on a measurement rather than on a guess.",
    run: (lab) => {
      lab.selectNth(0);
      lab.editChord({ voicing: 1 });
    },
  },
  {
    id: "end",
    target: null,
    title: "That is all of it",
    body:
      "Your progression is remembered between visits, so the next patch starts where you left off. " +
      "If you were part way through something when you opened this tour, it has been put back " +
      "exactly as it was.",
  },
];

/** The steps that change something, for a test that wants to exercise them. */
export const runnableSteps = () => TUTORIAL_STEPS.filter((s) => typeof s.run === "function");

/** Every control the tutorial points at, for a test that checks they all still exist. */
export const tutorialTargets = () => TUTORIAL_STEPS.map((s) => s.target).filter(Boolean);
