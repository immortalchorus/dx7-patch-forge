// Original FM voices written for OWL (Operator Workflow Lab), covering instrument families the EMM
// set lacks. Built from standard FM recipes (1:1 stacks with feedback for saw-like tones,
// 1:2 for odd harmonics, non-integer modulators for bells, decaying modulators for plucks).
//
// Operator shorthand: op(ratio, outputLevel, [R1,R2,R3,R4, L1,L2,L3,L4], extras).
// Ratios below 1 use coarse 0 (0.5); others become coarse + fine (fine is a percentage).

import { defaultOperator, defaultVoice, sanitizeVoice } from "./dx7.js";
import { brighten } from "./macros.js";

function op(ratio, level, env, x = {}) {
  let coarse, fine;
  if (ratio < 1) {
    coarse = 0;
    fine = Math.round((ratio / 0.5 - 1) * 100);
  } else {
    coarse = Math.floor(ratio);
    fine = Math.round((ratio / coarse - 1) * 100);
  }
  const { det = 0, ...rest } = x;
  return {
    ...defaultOperator(),
    coarse,
    fine,
    level,
    rates: env.slice(0, 4),
    levels: env.slice(4, 8),
    detune: 7 + det,
    ...rest,
  };
}
const OFF = op(1, 0, [99, 99, 99, 99, 0, 0, 0, 0]);

function voice(name, algorithm, feedback, ops, x = {}) {
  const v = defaultVoice();
  return sanitizeVoice({
    ...v,
    name,
    algorithm,
    feedback,
    ops,
    transpose: x.transpose ?? 24,
    lfo: { ...v.lfo, ...(x.lfo || {}) },
    pitchEg: x.pitchEg || v.pitchEg,
  });
}

// Common envelopes.
const GATE = [99, 99, 99, 82, 99, 99, 99, 0];
const VIBRATO = { speed: 34, delay: 40, pmd: 7, pms: 3, wave: 4, sync: 0 };
const SCALE_HIGH_DOWN = { breakpoint: 60, rightDepth: 30, rightCurve: 1 };

const D = [
  ["epiano", "electric piano tine rhodes dx ep 80s ballad clean glassy bell bright", () =>
    voice("TINE EP", 5, 6, [
      op(1, 99, [96, 25, 25, 67, 99, 75, 0, 0], { velSens: 2, rateScaling: 3 }),
      op(14, 56, [95, 50, 35, 78, 99, 75, 0, 0], { velSens: 7, rateScaling: 3, ...SCALE_HIGH_DOWN }),
      op(1, 99, [95, 20, 20, 50, 99, 95, 0, 0], { velSens: 2, rateScaling: 3, det: 3 }),
      op(1, 84, [95, 29, 20, 50, 99, 95, 0, 0], { velSens: 6, rateScaling: 3 }),
      op(1, 96, [95, 20, 20, 50, 99, 95, 0, 0], { rateScaling: 3, det: -2 }),
      op(1, 74, [95, 29, 20, 50, 99, 95, 0, 0], { velSens: 6, rateScaling: 3 }),
    ])],
  ["epiano", "electric piano rhodes suitcase soft warm mellow smooth jazz neo soul", () =>
    voice("SOFT RHODE", 5, 3, [
      op(1, 99, [90, 30, 28, 60, 99, 80, 0, 0], { velSens: 3, rateScaling: 3, ams: 1 }),
      op(1, 66, [90, 40, 30, 60, 99, 70, 0, 0], { velSens: 6, rateScaling: 3 }),
      op(1, 92, [90, 30, 28, 60, 99, 80, 0, 0], { velSens: 3, rateScaling: 3, det: 2, ams: 1 }),
      op(14, 42, [99, 60, 45, 70, 99, 60, 0, 0], { velSens: 7, rateScaling: 3, ...SCALE_HIGH_DOWN }),
      op(1, 85, [90, 30, 28, 60, 99, 80, 0, 0], { velSens: 3, rateScaling: 3, det: -2, ams: 1 }),
      op(1, 54, [90, 40, 30, 60, 99, 70, 0, 0], { velSens: 5, rateScaling: 3 }),
    ], { lfo: { speed: 30, amd: 12, wave: 4, sync: 0 } })],
  ["piano", "acoustic grand piano concert hammer bright classical keys", () =>
    voice("GRAND PNO", 5, 4, [
      op(1, 99, [99, 34, 27, 55, 99, 82, 0, 0], { velSens: 3, rateScaling: 4 }),
      op(1, 76, [99, 52, 35, 60, 99, 65, 0, 0], { velSens: 6, rateScaling: 4, ...SCALE_HIGH_DOWN }),
      op(1, 96, [99, 36, 27, 55, 99, 80, 0, 0], { velSens: 3, rateScaling: 4, det: 2 }),
      op(3, 58, [99, 65, 40, 60, 99, 40, 0, 0], { velSens: 7, rateScaling: 4, ...SCALE_HIGH_DOWN }),
      op(2, 78, [99, 45, 30, 55, 99, 70, 0, 0], { velSens: 3, rateScaling: 5, det: -1 }),
      op(1, 60, [99, 70, 40, 60, 99, 50, 0, 0], { velSens: 6, rateScaling: 4 }),
    ])],
  ["bell", "glass bell crystal glassy celesta chime bright clear icy", () =>
    voice("GLASS BELL", 5, 2, [
      op(1, 99, [99, 28, 22, 35, 99, 80, 0, 0], { velSens: 2, rateScaling: 2 }),
      op(1.41, 70, [99, 30, 24, 35, 99, 75, 0, 0], { velSens: 5, rateScaling: 2 }),
      op(4.2, 72, [99, 40, 30, 40, 99, 60, 0, 0], { velSens: 2, rateScaling: 2 }),
      op(1, 50, [99, 45, 30, 40, 99, 50, 0, 0], { velSens: 4 }),
      op(1, 88, [99, 26, 22, 35, 99, 80, 0, 0], { velSens: 2, rateScaling: 2, det: 4 }),
      op(7.07, 55, [99, 55, 40, 45, 99, 30, 0, 0], { velSens: 6 }),
    ], { transpose: 36 })],
  ["bell", "tubular bells church cathedral chime large bell toll long ring", () =>
    voice("TUBULAR", 5, 0, [
      op(1, 99, [99, 24, 20, 30, 99, 85, 0, 0], { velSens: 2 }),
      op(3.5, 78, [99, 26, 22, 30, 99, 80, 0, 0], { velSens: 4 }),
      op(1, 95, [99, 24, 20, 30, 99, 85, 0, 0], { velSens: 2, det: 3 }),
      op(3.5, 74, [99, 28, 22, 30, 99, 78, 0, 0], { velSens: 4, det: -3 }),
      op(0.5, 80, [99, 22, 18, 28, 99, 85, 0, 0], { velSens: 1 }),
      op(2.76, 55, [99, 40, 30, 35, 99, 50, 0, 0], { velSens: 5 }),
    ])],
  ["bell", "gong tam tam metallic dark huge inharmonic clang temple", () =>
    voice("GONG", 5, 7, [
      op(1, 99, [85, 20, 15, 25, 99, 85, 0, 0], { velSens: 2 }),
      op(1.41, 80, [90, 22, 16, 25, 99, 80, 0, 0], { velSens: 4 }),
      op(1.73, 86, [80, 22, 16, 25, 99, 80, 0, 0], { velSens: 2, det: 3 }),
      op(2.26, 75, [85, 24, 18, 25, 99, 78, 0, 0], { velSens: 4 }),
      op(0.5, 82, [80, 18, 14, 22, 99, 88, 0, 0], { velSens: 1 }),
      op(3.17, 70, [90, 30, 20, 25, 99, 70, 0, 0], { velSens: 5 }),
    ], { transpose: 12 })],
  ["mallet", "marimba wooden mallet percussive warm tuned wood xylophone", () =>
    voice("MARIMBA", 5, 0, [
      op(1, 99, [99, 46, 30, 50, 99, 0, 0, 0], { velSens: 3, rateScaling: 3 }),
      op(4, 62, [99, 70, 40, 60, 99, 0, 0, 0], { velSens: 6, rateScaling: 3 }),
      op(4, 70, [99, 58, 40, 55, 99, 0, 0, 0], { velSens: 3, rateScaling: 3 }),
      op(1, 35, [99, 60, 40, 55, 99, 0, 0, 0], { velSens: 3 }),
      op(10, 48, [99, 80, 60, 70, 99, 0, 0, 0], { velSens: 5 }),
      OFF,
    ])],
  ["mallet", "vibraphone vibes jazz mellow metallic tremolo motor mallet", () =>
    voice("VIBES", 5, 0, [
      op(1, 99, [99, 30, 25, 40, 99, 70, 0, 0], { velSens: 3, ams: 2 }),
      op(4, 55, [99, 55, 35, 45, 99, 20, 0, 0], { velSens: 6 }),
      op(4, 60, [99, 40, 30, 40, 99, 40, 0, 0], { velSens: 3, ams: 2 }),
      op(1, 30, [99, 50, 35, 45, 99, 0, 0, 0]),
      op(1, 80, [99, 30, 25, 40, 99, 70, 0, 0], { velSens: 3, ams: 2, det: 2 }),
      op(10, 45, [99, 80, 50, 60, 99, 0, 0, 0], { velSens: 6 }),
    ], { lfo: { speed: 30, amd: 30, wave: 4, sync: 0 } })],
  ["mallet", "music box toy celesta tiny delicate lullaby twinkle metal tine", () =>
    voice("MUSIC BOX", 5, 0, [
      op(1, 99, [99, 38, 30, 40, 99, 60, 0, 0], { velSens: 2 }),
      op(7, 60, [99, 60, 40, 50, 99, 20, 0, 0], { velSens: 5 }),
      op(4.02, 72, [99, 45, 35, 45, 99, 40, 0, 0], { velSens: 2 }),
      op(1, 35, [99, 50, 40, 50, 99, 20, 0, 0]),
      op(1, 70, [99, 40, 30, 40, 99, 55, 0, 0], { velSens: 2, det: 5 }),
      op(14, 50, [99, 85, 60, 70, 99, 0, 0, 0], { velSens: 6 }),
    ], { transpose: 36 })],
  ["mallet", "kalimba thumb piano mbira plucked wooden african gentle", () =>
    voice("KALIMBA", 5, 0, [
      op(1, 99, [99, 50, 35, 50, 99, 20, 0, 0], { velSens: 3, rateScaling: 2 }),
      op(5.2, 58, [99, 75, 50, 60, 99, 0, 0, 0], { velSens: 6 }),
      op(1, 70, [99, 52, 35, 50, 99, 20, 0, 0], { velSens: 3, det: 3 }),
      op(1, 40, [99, 60, 40, 55, 99, 0, 0, 0]),
      op(6.1, 40, [99, 80, 60, 60, 99, 0, 0, 0], { velSens: 4 }),
      OFF,
    ], { transpose: 36 })],
  ["mallet", "steel drum pan calypso caribbean metallic tropical", () =>
    voice("STEEL PAN", 5, 0, [
      op(1, 99, [99, 40, 30, 50, 99, 50, 0, 0], { velSens: 3 }),
      op(2.5, 52, [99, 55, 35, 55, 99, 30, 0, 0], { velSens: 5 }),
      op(2, 74, [99, 45, 32, 50, 99, 40, 0, 0], { velSens: 3 }),
      op(1, 42, [99, 50, 35, 55, 99, 20, 0, 0]),
      op(3, 50, [99, 52, 35, 50, 99, 30, 0, 0], { velSens: 3 }),
      op(1.5, 45, [99, 60, 40, 55, 99, 0, 0, 0], { velSens: 5 }),
    ])],
  ["organ", "drawbar organ hammond tonewheel jazz rock gospel b3", () =>
    voice("DRAWBAR", 32, 1, [
      op(0.5, 86, GATE),
      op(1, 99, GATE, { det: 1 }),
      op(1.5, 76, GATE),
      op(2, 90, GATE, { det: -1 }),
      op(3, 72, GATE),
      op(4, 82, GATE),
    ], { lfo: { speed: 36, pmd: 5, pms: 3, wave: 4, sync: 0 } })],
  ["organ", "pipe organ church cathedral majestic reverent classical", () =>
    voice("PIPE ORGAN", 32, 0, [
      op(0.5, 82, [75, 99, 99, 52, 99, 99, 99, 0]),
      op(1, 99, [75, 99, 99, 52, 99, 99, 99, 0]),
      op(2, 88, [72, 99, 99, 52, 99, 99, 99, 0], { det: 1 }),
      op(3, 66, [70, 99, 99, 52, 99, 99, 99, 0]),
      op(4, 76, [70, 99, 99, 52, 99, 99, 99, 0], { det: -1 }),
      op(8, 58, [68, 99, 99, 52, 99, 99, 99, 0]),
    ])],
  ["organ", "reed organ harmonium accordion musette french squeeze", () =>
    voice("HARMONIUM", 5, 5, [
      op(1, 99, [70, 99, 99, 60, 99, 99, 99, 0]),
      op(1, 72, [70, 99, 99, 60, 99, 99, 99, 0], { velSens: 1 }),
      op(1, 92, [70, 99, 99, 60, 99, 99, 99, 0], { det: 5 }),
      op(2, 64, [70, 99, 99, 60, 99, 99, 99, 0]),
      op(2, 70, [70, 99, 99, 60, 99, 99, 99, 0], { det: -4 }),
      op(1, 60, [70, 99, 99, 60, 99, 99, 99, 0]),
    ], { lfo: { speed: 30, amd: 6, wave: 4, sync: 0 } })],
  ["brass", "brass section horns stab punchy 80s synth brass bright fanfare jump", () =>
    voice("BRASS SECT", 22, 7, [
      op(1, 99, [72, 76, 99, 71, 99, 88, 96, 0], { velSens: 2 }),
      op(1, 86, [62, 51, 29, 71, 82, 95, 96, 0], { velSens: 4 }),
      op(1, 97, [72, 76, 99, 71, 99, 88, 96, 0], { velSens: 2, det: -2 }),
      op(1, 97, [72, 76, 99, 71, 99, 88, 96, 0], { velSens: 2, det: 2 }),
      op(1, 95, [72, 76, 99, 71, 99, 88, 96, 0], { velSens: 2, det: 1 }),
      op(1, 83, [62, 51, 29, 71, 82, 95, 96, 0], { velSens: 4 }),
    ], { lfo: VIBRATO, pitchEg: { rates: [84, 95, 95, 60], levels: [50, 50, 50, 48] } })],
  ["brass", "trumpet solo horn bright expressive jazz fanfare cornet", () =>
    voice("TRUMPET", 16, 6, [
      op(1, 99, [65, 60, 99, 68, 99, 92, 95, 0], { velSens: 1 }),
      op(1, 80, [58, 50, 30, 65, 90, 94, 92, 0], { velSens: 4 }),
      op(1, 70, [60, 50, 30, 65, 88, 92, 90, 0], { velSens: 4 }),
      op(3, 50, [70, 60, 40, 65, 90, 70, 60, 0], { velSens: 5 }),
      op(2, 55, [55, 50, 30, 65, 80, 90, 88, 0], { velSens: 4 }),
      op(1, 60, [60, 50, 40, 65, 90, 88, 85, 0]),
    ], { lfo: { ...VIBRATO, delay: 45, pmd: 8 }, pitchEg: { rates: [80, 95, 95, 60], levels: [50, 50, 50, 46] } })],
  ["brass", "french horn mellow warm soft brass orchestral noble", () =>
    voice("FRENCH HRN", 16, 4, [
      op(1, 99, [55, 60, 99, 60, 99, 94, 96, 0], { velSens: 1 }),
      op(1, 68, [50, 45, 30, 60, 85, 92, 90, 0], { velSens: 3 }),
      op(1, 52, [50, 45, 30, 60, 85, 90, 88, 0], { velSens: 3 }),
      op(2, 40, [60, 55, 40, 60, 90, 70, 60, 0], { velSens: 4 }),
      op(0.5, 50, [48, 45, 30, 60, 80, 90, 88, 0], { velSens: 3 }),
      op(1, 45, [50, 45, 40, 60, 90, 88, 85, 0]),
    ], { lfo: { ...VIBRATO, delay: 50, pmd: 5 } })],
  ["strings", "string ensemble orchestra violins lush strings section warm cinematic", () =>
    voice("STRINGS", 1, 6, [
      op(1, 99, [45, 30, 20, 45, 99, 92, 90, 0], { velSens: 1, det: -3 }),
      op(1, 76, [42, 30, 20, 45, 92, 90, 88, 0], { velSens: 2 }),
      op(1, 99, [45, 30, 20, 45, 99, 92, 90, 0], { velSens: 1, det: 3 }),
      op(1, 72, [42, 30, 20, 45, 92, 90, 88, 0], { velSens: 2 }),
      op(1, 60, [42, 30, 20, 45, 92, 90, 88, 0]),
      op(1, 55, [42, 30, 20, 45, 92, 90, 88, 0]),
    ], { lfo: { speed: 32, delay: 45, pmd: 10, pms: 2, wave: 4, sync: 0 } })],
  ["strings", "pizzicato plucked strings short orchestral staccato", () =>
    voice("PIZZICATO", 5, 3, [
      op(1, 99, [99, 45, 30, 55, 99, 0, 0, 0], { velSens: 3, rateScaling: 3 }),
      op(1, 70, [99, 55, 35, 55, 99, 0, 0, 0], { velSens: 5 }),
      op(2, 60, [99, 50, 30, 55, 99, 0, 0, 0], { velSens: 3 }),
      op(1, 50, [99, 60, 40, 55, 99, 0, 0, 0]),
      op(1, 80, [99, 45, 30, 55, 99, 0, 0, 0], { velSens: 3, det: 3 }),
      op(3, 45, [99, 70, 40, 60, 99, 0, 0, 0], { velSens: 5 }),
    ])],
  ["strings", "cello solo bowed low strings expressive viola", () =>
    voice("CELLO", 1, 5, [
      op(1, 99, [52, 30, 25, 50, 99, 94, 92, 0], { velSens: 2 }),
      op(1, 74, [48, 35, 25, 50, 90, 92, 88, 0], { velSens: 3 }),
      op(0.5, 70, [52, 30, 25, 50, 99, 94, 92, 0], { velSens: 2, det: 1 }),
      op(1, 60, [48, 35, 25, 50, 90, 90, 86, 0], { velSens: 3 }),
      op(2, 45, [55, 40, 30, 50, 85, 80, 75, 0]),
      op(1, 50, [50, 40, 30, 50, 88, 85, 80, 0]),
    ], { transpose: 12, lfo: { speed: 33, delay: 35, pmd: 12, pms: 2, wave: 4, sync: 0 } })],
  ["pad", "warm pad soft lush analog ambient chords background mellow", () =>
    voice("WARM PAD", 5, 5, [
      op(1, 99, [38, 30, 25, 35, 99, 95, 92, 0], { det: -3 }),
      op(1, 70, [30, 25, 20, 35, 85, 80, 78, 0]),
      op(1, 99, [38, 30, 25, 35, 99, 95, 92, 0], { det: 3 }),
      op(1, 66, [30, 25, 20, 35, 85, 80, 78, 0]),
      op(0.5, 88, [38, 30, 25, 35, 99, 95, 92, 0]),
      op(1, 58, [30, 25, 20, 35, 85, 80, 78, 0]),
    ], { lfo: { speed: 22, pmd: 4, pms: 3, wave: 0, sync: 0 } })],
  ["pad", "glass pad crystal shimmering airy evolving bell pad digital sparkle", () =>
    voice("GLASS PAD", 5, 0, [
      op(1, 99, [99, 30, 25, 35, 99, 70, 0, 0], { velSens: 2 }),
      op(3.5, 62, [99, 35, 28, 35, 99, 55, 0, 0], { velSens: 3 }),
      op(1, 95, [34, 30, 25, 34, 99, 95, 92, 0], { det: 3 }),
      op(2, 64, [28, 20, 20, 34, 80, 90, 85, 0]),
      op(2, 88, [34, 30, 25, 34, 99, 95, 92, 0], { det: -3 }),
      op(5, 50, [20, 20, 20, 34, 70, 85, 80, 0]),
    ], { lfo: { speed: 25, pmd: 5, pms: 3, wave: 4, sync: 0 } })],
  ["pad", "evolving sweep pad slow motion cinematic sci-fi filter swell", () =>
    voice("SWEEP PAD", 1, 6, [
      op(1, 99, [34, 30, 25, 32, 99, 95, 92, 0], { det: -2 }),
      op(1, 80, [22, 18, 16, 32, 40, 90, 80, 0]),
      op(1, 99, [34, 30, 25, 32, 99, 95, 92, 0], { det: 2 }),
      op(1, 74, [20, 18, 16, 32, 45, 92, 82, 0]),
      op(2, 58, [18, 20, 18, 32, 40, 85, 70, 0]),
      op(1, 52, [20, 20, 18, 32, 50, 85, 75, 0]),
    ], { lfo: { speed: 12, pmd: 3, pms: 3, wave: 0, sync: 0 } })],
  ["pad", "dark drone ominous low evolving cinematic ambient horror", () =>
    voice("DARK DRONE", 5, 6, [
      op(0.5, 99, [30, 25, 20, 28, 99, 96, 94, 0], { det: -2 }),
      op(1, 60, [25, 20, 18, 28, 80, 85, 82, 0]),
      op(1, 90, [30, 25, 20, 28, 99, 96, 94, 0], { det: 3 }),
      op(1.41, 52, [22, 20, 18, 28, 70, 85, 80, 0]),
      op(0.5, 85, [30, 25, 20, 28, 99, 96, 94, 0], { det: 2 }),
      op(1, 56, [20, 18, 18, 28, 75, 88, 85, 0]),
    ], { transpose: 12, lfo: { speed: 8, pmd: 3, pms: 3, amd: 10, wave: 0, sync: 0 } })],
  ["choir", "choir voices aah vocal ethereal human vox angelic pad", () =>
    voice("CHOIR AAH", 5, 0, [
      op(1, 99, [48, 30, 25, 40, 99, 95, 92, 0], { velSens: 1 }),
      op(1, 58, [45, 30, 25, 40, 90, 88, 85, 0], { velSens: 2 }),
      op(2, 80, [46, 30, 25, 40, 99, 95, 92, 0], { velSens: 1, det: 3 }),
      op(1, 46, [45, 30, 25, 40, 90, 88, 85, 0]),
      op(3, 72, [44, 30, 25, 40, 99, 95, 92, 0], { velSens: 1, det: -3 }),
      op(1, 40, [45, 30, 25, 40, 90, 88, 85, 0]),
    ], { lfo: { speed: 33, delay: 30, pmd: 8, pms: 3, wave: 4, sync: 0 } })],
  ["flute", "flute breathy wind woodwind pan flute airy soft recorder", () =>
    voice("FLUTE", 5, 7, [
      op(1, 99, [62, 45, 30, 55, 99, 95, 93, 0], { velSens: 2 }),
      op(1, 48, [75, 50, 30, 55, 90, 70, 68, 0], { velSens: 4 }),
      op(2, 60, [62, 45, 30, 55, 99, 95, 93, 0], { velSens: 2, det: 2 }),
      op(1, 30, [70, 50, 30, 55, 90, 70, 68, 0]),
      op(3, 56, [80, 55, 40, 55, 90, 60, 55, 0], { velSens: 3 }),
      op(7.14, 92, [80, 55, 40, 55, 90, 80, 78, 0]),
    ], { lfo: { speed: 33, delay: 35, pmd: 6, pms: 3, wave: 4, sync: 0 } })],
  ["reed", "clarinet woodwind hollow reedy woody jazz dark", () =>
    voice("CLARINET", 5, 7, [
      op(1, 99, [66, 40, 30, 60, 99, 95, 94, 0], { velSens: 2 }),
      op(2, 72, [70, 40, 30, 60, 95, 88, 86, 0], { velSens: 4 }),
      op(1, 70, [66, 40, 30, 60, 99, 95, 94, 0], { velSens: 2, det: 2 }),
      op(2, 60, [70, 40, 30, 60, 95, 88, 86, 0], { velSens: 3 }),
      op(3, 44, [80, 55, 40, 60, 90, 60, 55, 0]),
      op(5.3, 85, [80, 55, 40, 60, 90, 80, 78, 0]),
    ], { lfo: { speed: 33, delay: 45, pmd: 4, pms: 3, wave: 4, sync: 0 } })],
  ["reed", "oboe nasal double reed woodwind thin pastoral bassoon", () =>
    voice("OBOE", 5, 4, [
      op(1, 99, [68, 40, 30, 60, 99, 95, 94, 0], { velSens: 2 }),
      op(1, 78, [70, 40, 30, 60, 95, 90, 88, 0], { velSens: 4 }),
      op(4, 55, [68, 40, 30, 60, 99, 95, 94, 0], { velSens: 2 }),
      op(1, 40, [70, 40, 30, 60, 95, 90, 88, 0]),
      op(1, 70, [68, 40, 30, 60, 99, 95, 94, 0], { velSens: 2, det: 2 }),
      op(3, 62, [70, 40, 30, 60, 95, 90, 88, 0], { velSens: 3 }),
    ], { lfo: { speed: 34, delay: 40, pmd: 6, pms: 3, wave: 4, sync: 0 } })],
  ["reed", "saxophone sax tenor alto breathy jazz smoky soulful growl", () =>
    voice("SAX", 16, 6, [
      op(1, 99, [60, 50, 99, 62, 99, 92, 95, 0], { velSens: 2 }),
      op(1, 78, [55, 45, 30, 62, 88, 92, 90, 0], { velSens: 5 }),
      op(2, 55, [55, 45, 30, 62, 85, 90, 86, 0], { velSens: 4 }),
      op(1, 45, [60, 50, 35, 62, 88, 80, 75, 0]),
      op(3, 50, [58, 45, 30, 62, 84, 88, 85, 0], { velSens: 4 }),
      op(1, 60, [60, 50, 35, 62, 90, 86, 82, 0]),
    ], { lfo: { speed: 32, delay: 40, pmd: 9, pms: 3, wave: 4, sync: 0 }, pitchEg: { rates: [75, 95, 95, 60], levels: [50, 50, 50, 47] } })],
  ["bass", "finger bass electric bass round plucked funk rock bass guitar", () =>
    voice("FINGERBASS", 5, 3, [
      op(0.5, 99, [99, 36, 25, 60, 99, 80, 0, 0], { velSens: 3 }),
      op(0.5, 72, [99, 55, 35, 60, 99, 60, 0, 0], { velSens: 5 }),
      op(0.5, 80, [99, 36, 25, 60, 99, 80, 0, 0], { velSens: 3, det: 1 }),
      op(1, 60, [99, 70, 40, 60, 99, 40, 0, 0], { velSens: 6 }),
      OFF,
      OFF,
    ])],
  ["bass", "sub bass deep 808 sine low rumble dubstep trap", () =>
    voice("SUB BASS", 5, 0, [
      op(0.5, 99, [99, 99, 99, 70, 99, 99, 99, 0], { velSens: 1 }),
      op(0.5, 42, [99, 50, 30, 60, 99, 40, 30, 0], { velSens: 3 }),
      OFF,
      OFF,
      OFF,
      OFF,
    ])],
  ["bass", "synth bass analog saw bass acid squelchy sequenced 80s moog", () =>
    voice("SYNTH BASS", 2, 7, [
      op(0.5, 99, [99, 40, 30, 65, 99, 85, 80, 0], { velSens: 2 }),
      op(0.5, 86, [99, 55, 35, 65, 99, 60, 45, 0], { velSens: 5 }),
      op(0.5, 85, [99, 40, 30, 65, 99, 85, 80, 0], { velSens: 2, det: 2 }),
      op(0.5, 78, [99, 60, 35, 65, 99, 55, 40, 0], { velSens: 4 }),
      op(1, 50, [99, 70, 40, 65, 99, 40, 0, 0]),
      op(1, 40, [99, 70, 40, 65, 99, 40, 0, 0]),
    ])],
  ["guitar", "acoustic guitar nylon plucked strum folk pluck classical", () =>
    voice("NYLON GTR", 5, 4, [
      op(1, 99, [99, 38, 30, 50, 99, 70, 0, 0], { velSens: 3, rateScaling: 3 }),
      op(3, 64, [99, 65, 40, 55, 99, 30, 0, 0], { velSens: 6 }),
      op(1, 90, [99, 40, 30, 50, 99, 65, 0, 0], { velSens: 3, det: 2, rateScaling: 3 }),
      op(1, 62, [99, 55, 35, 55, 99, 45, 0, 0], { velSens: 5 }),
      op(2, 60, [99, 50, 35, 50, 99, 50, 0, 0], { velSens: 3 }),
      op(5, 48, [99, 80, 50, 60, 99, 0, 0, 0], { velSens: 7 }),
    ])],
  ["pluck", "harp celestial glissando plucked soft angelic fairy", () =>
    voice("HARP", 5, 0, [
      op(1, 99, [99, 32, 26, 40, 99, 72, 0, 0], { velSens: 2, rateScaling: 3 }),
      op(1, 55, [99, 55, 35, 45, 99, 30, 0, 0], { velSens: 5 }),
      op(2, 55, [99, 40, 30, 40, 99, 50, 0, 0], { velSens: 2 }),
      op(1, 40, [99, 55, 35, 45, 99, 20, 0, 0]),
      op(1, 80, [99, 32, 26, 40, 99, 72, 0, 0], { velSens: 2, det: 3, rateScaling: 3 }),
      op(4, 40, [99, 75, 50, 55, 99, 0, 0, 0], { velSens: 6 }),
    ])],
  ["pluck", "synth pluck short plucky bright stab edm arpeggio", () =>
    voice("SYN PLUCK", 5, 6, [
      op(1, 99, [99, 50, 35, 60, 99, 30, 0, 0], { velSens: 2 }),
      op(1, 84, [99, 58, 40, 60, 99, 20, 0, 0], { velSens: 5 }),
      op(1, 95, [99, 50, 35, 60, 99, 30, 0, 0], { velSens: 2, det: 3 }),
      op(2, 70, [99, 60, 40, 60, 99, 20, 0, 0], { velSens: 5 }),
      op(1, 92, [99, 50, 35, 60, 99, 30, 0, 0], { velSens: 2, det: -3 }),
      op(1, 80, [99, 58, 40, 60, 99, 20, 0, 0], { velSens: 5 }),
    ])],
  ["clav", "clavinet clav funky stabby nasal bright funk", () =>
    voice("CLAVINET", 5, 6, [
      op(1, 99, [99, 50, 35, 70, 99, 85, 70, 0], { velSens: 3 }),
      op(3, 75, [99, 60, 40, 70, 99, 70, 50, 0], { velSens: 7 }),
      op(1, 90, [99, 50, 35, 70, 99, 85, 70, 0], { velSens: 3, det: 1 }),
      op(1, 70, [99, 55, 40, 70, 99, 80, 60, 0], { velSens: 5 }),
      op(2, 55, [99, 55, 40, 70, 99, 70, 50, 0], { velSens: 3 }),
      op(1, 70, [99, 55, 40, 70, 99, 80, 60, 0], { velSens: 4 }),
    ])],
  ["clav", "harpsichord baroque plucked bright classical cembalo", () =>
    voice("HARPSICHRD", 5, 5, [
      op(1, 99, [99, 42, 32, 55, 99, 60, 0, 0], { velSens: 1, rateScaling: 3 }),
      op(5, 68, [99, 48, 35, 55, 99, 50, 0, 0], { velSens: 2 }),
      op(2, 80, [99, 45, 32, 55, 99, 55, 0, 0], { velSens: 1, rateScaling: 3 }),
      op(3, 62, [99, 50, 35, 55, 99, 45, 0, 0], { velSens: 2 }),
      op(1, 85, [99, 42, 32, 55, 99, 60, 0, 0], { velSens: 1, det: 3, rateScaling: 3 }),
      op(1, 78, [99, 50, 35, 55, 99, 50, 0, 0], { velSens: 2 }),
    ])],
  ["lead", "saw lead synth lead bright solo 80s analog sawtooth", () =>
    voice("SAW LEAD", 2, 7, [
      op(1, 99, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 1 }),
      op(1, 85, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 3 }),
      op(1, 95, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 1, det: 3 }),
      op(1, 80, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 3 }),
      op(1, 55, [99, 70, 99, 60, 99, 99, 99, 0]),
      op(1, 40, [99, 70, 99, 60, 99, 99, 99, 0]),
    ], { lfo: VIBRATO })],
  ["lead", "square lead hollow chiptune 8-bit retro game reedy", () =>
    voice("SQUARE LD", 5, 0, [
      op(1, 99, [99, 70, 99, 65, 99, 99, 99, 0], { velSens: 1 }),
      op(2, 76, [99, 70, 99, 65, 99, 99, 99, 0], { velSens: 3 }),
      op(1, 92, [99, 70, 99, 65, 99, 99, 99, 0], { velSens: 1, det: 3 }),
      op(2, 72, [99, 70, 99, 65, 99, 99, 99, 0], { velSens: 3 }),
      OFF,
      OFF,
    ], { lfo: { ...VIBRATO, pmd: 5 } })],
  ["lead", "sync lead screaming aggressive bright nasal hard edgy", () =>
    voice("SYNC LEAD", 5, 7, [
      op(1, 99, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 1 }),
      op(3, 82, [99, 45, 40, 60, 99, 88, 85, 0], { velSens: 4 }),
      op(1, 95, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 1, det: 2 }),
      op(5, 72, [99, 50, 40, 60, 99, 85, 82, 0], { velSens: 4 }),
      op(1, 92, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 1, det: -2 }),
      op(1, 85, [99, 70, 99, 60, 99, 99, 99, 0], { velSens: 3 }),
    ], { lfo: VIBRATO })],
  ["fx", "sci-fi laser zap effect alien robotic space weird sweep", () =>
    voice("LASER ZAP", 5, 7, [
      op(1, 99, [99, 45, 35, 60, 99, 60, 0, 0]),
      op(1, 85, [99, 50, 35, 60, 99, 50, 0, 0], { velSens: 4 }),
      op(2, 80, [99, 45, 35, 60, 99, 60, 0, 0], { det: 5 }),
      op(3.5, 70, [99, 50, 35, 60, 99, 50, 0, 0], { velSens: 4 }),
      OFF,
      op(1, 80, [99, 50, 35, 60, 99, 50, 0, 0]),
    ], { pitchEg: { rates: [60, 99, 99, 99], levels: [50, 50, 50, 85] } })],
  ["perc", "tom drum percussion hit synth tom electronic kick thump", () =>
    voice("SYNTH TOM", 5, 5, [
      op(1, 99, [99, 50, 40, 60, 99, 0, 0, 0], { velSens: 4 }),
      op(1, 50, [99, 60, 45, 60, 99, 0, 0, 0], { velSens: 5 }),
      op(1.5, 60, [99, 65, 50, 60, 99, 0, 0, 0], { velSens: 4 }),
      op(3, 60, [99, 80, 60, 70, 99, 0, 0, 0], { velSens: 6 }),
      OFF,
      OFF,
    ], { transpose: 12, pitchEg: { rates: [72, 99, 99, 99], levels: [50, 50, 50, 70] } })],
];

// Modulation offsets (output-level steps) found by rendering each voice and searching for a
// family-typical spectral centroid. Voices whose modulators decay fast are capped so the
// attack does not turn harsh.
const CALIBRATION = {
  "SOFT RHODE": 18, "GRAND PNO": 18, "GLASS BELL": 17, TUBULAR: -8, MARIMBA: 12, VIBES: 10, "MUSIC BOX": 16,
  KALIMBA: 12, HARMONIUM: 14, "BRASS SECT": -2, TRUMPET: 13, STRINGS: 20, PIZZICATO: 18, CELLO: 6, "SWEEP PAD": 12,
  "CHOIR AAH": 20, FLUTE: 12, CLARINET: 13, OBOE: 17, SAX: 14, FINGERBASS: 20, "SYNTH BASS": 2, "NYLON GTR": 18,
  HARP: 12, "SYN PLUCK": 13, CLAVINET: 24, HARPSICHRD: 13, "SAW LEAD": -5,
};

export const CORE_VOICES = D.map(([family, tags, make], i) => {
  const v = make();
  return {
    id: "core-" + i,
    source: "OWL",
    family,
    tags: tags.split(" "),
    voice: sanitizeVoice(brighten(v, CALIBRATION[v.name] || 0)),
  };
});
