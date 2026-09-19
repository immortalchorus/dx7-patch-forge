// The DX7's own parameter list: printed names, ranges and display formats.
//
// This is the table the classic editor is built from. Names and value formats follow the
// DX7 front panel and its display (ratios as 1.00, detune as -7..+7, curves as -LIN/-EXP/
// +EXP/+LIN, breakpoint and transpose as note names), so a veteran sees the numbers they
// would see on the instrument. `btn` is the numbered button the parameter sits on in the
// DX7's EDIT mode, from the owner's manual and the panel-button table at
// homepages.abdn.ac.uk/d.j.benson/pages/dx7/manuals/dx7-controls.pdf. Some buttons hold more
// than one parameter, reached by pressing them again: 21 steps through EG rates 1-4, 22
// through EG levels, 29 and 30 through the pitch EG, 24 and 25 through the left and right
// keyboard scaling, and 17 alternates oscillator mode with oscillator key sync.

import { opRatio, opFixedHz } from "./dx7.js";

const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** Note name in Yamaha numbering, where middle C (MIDI 60) is C3. */
export const noteName = (midi) => NOTE[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 2);

export const CURVES = ["−LIN", "−EXP", "+EXP", "+LIN"];
export const LFO_WAVES = ["TRIANGLE", "SAW DOWN", "SAW UP", "SQUARE", "SINE", "S/HOLD"];
export const MODES = ["RATIO", "FIXED"];
const ONOFF = ["OFF", "ON"];

/** Breakpoint 0..99 is A-1 to C8; the DX7 shows the note, not the number. */
export const breakpointNote = (b) => noteName(21 + b);
/** Key transpose 0..48 is C1 to C5, 24 being no transposition (middle C stays C3). */
export const transposeNote = (t) => noteName(36 + t);

export const getParam = (obj, path) => path.split(".").reduce((o, k) => o[k], obj);
export function setParam(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

const P = (id, short, name, max, opts = {}) => ({ id, short, name, path: opts.path || id, min: 0, max, ...opts });

/** Per-operator parameters, in the DX7's own groups. */
export const OP_PARAMS = [
  P("mode", "OSC MODE", "OSCILLATOR MODE", 1, { btn: 17, group: "FREQUENCY", choices: MODES }),
  P("coarse", "COARSE", "FREQUENCY COARSE", 31, { btn: 18, group: "FREQUENCY" }),
  P("fine", "FINE", "FREQUENCY FINE", 99, { btn: 19, group: "FREQUENCY" }),
  P("detune", "DETUNE", "OSCILLATOR DETUNE", 14, { btn: 20, group: "FREQUENCY", fmt: (x) => (x - 7 > 0 ? "+" : "") + (x - 7) }),
  P("rate1", "R1", "EG RATE 1", 99, { btn: 21, group: "ENVELOPE", path: "rates.0" }),
  P("rate2", "R2", "EG RATE 2", 99, { btn: 21, group: "ENVELOPE", path: "rates.1" }),
  P("rate3", "R3", "EG RATE 3", 99, { btn: 21, group: "ENVELOPE", path: "rates.2" }),
  P("rate4", "R4", "EG RATE 4", 99, { btn: 21, group: "ENVELOPE", path: "rates.3" }),
  P("level1", "L1", "EG LEVEL 1", 99, { btn: 22, group: "ENVELOPE", path: "levels.0" }),
  P("level2", "L2", "EG LEVEL 2", 99, { btn: 22, group: "ENVELOPE", path: "levels.1" }),
  P("level3", "L3", "EG LEVEL 3", 99, { btn: 22, group: "ENVELOPE", path: "levels.2" }),
  P("level4", "L4", "EG LEVEL 4", 99, { btn: 22, group: "ENVELOPE", path: "levels.3" }),
  P("breakpoint", "BREAK POINT", "KEYBOARD LEVEL SCALING BREAK POINT", 99, { btn: 23, group: "SCALING", fmt: breakpointNote }),
  P("leftDepth", "LEFT DEPTH", "KEYBOARD LEVEL SCALING LEFT DEPTH", 99, { btn: 25, group: "SCALING" }),
  P("rightDepth", "RIGHT DEPTH", "KEYBOARD LEVEL SCALING RIGHT DEPTH", 99, { btn: 25, group: "SCALING" }),
  P("leftCurve", "LEFT CURVE", "KEYBOARD LEVEL SCALING LEFT CURVE", 3, { btn: 24, group: "SCALING", choices: CURVES }),
  P("rightCurve", "RIGHT CURVE", "KEYBOARD LEVEL SCALING RIGHT CURVE", 3, { btn: 24, group: "SCALING", choices: CURVES }),
  P("rateScaling", "RATE SCALING", "KEYBOARD RATE SCALING", 7, { btn: 26, group: "SCALING" }),
  P("level", "OUTPUT LEVEL", "OPERATOR OUTPUT LEVEL", 99, { btn: 27, group: "OUTPUT" }),
  P("velSens", "VELOCITY", "KEY VELOCITY SENSITIVITY", 7, { btn: 28, group: "OUTPUT" }),
  P("ams", "AMP MOD SENS", "AMPLITUDE MODULATION SENSITIVITY", 3, { btn: 16, group: "OUTPUT" }),
];

/** Voice-wide parameters. */
export const VOICE_PARAMS = [
  P("algorithm", "ALGORITHM", "ALGORITHM SELECT", 32, { btn: 7, group: "VOICE", min: 1 }),
  P("feedback", "FEEDBACK", "FEEDBACK", 7, { btn: 8, group: "VOICE" }),
  P("oscKeySync", "OSC KEY SYNC", "OSCILLATOR KEY SYNC", 1, { btn: 17, group: "VOICE", choices: ONOFF }),
  P("transpose", "TRANSPOSE", "KEY TRANSPOSE", 48, { btn: 31, group: "VOICE", fmt: transposeNote }),
  P("pitchRate1", "PR1", "PITCH EG RATE 1", 99, { btn: 29, group: "PITCH EG", path: "pitchEg.rates.0" }),
  P("pitchRate2", "PR2", "PITCH EG RATE 2", 99, { btn: 29, group: "PITCH EG", path: "pitchEg.rates.1" }),
  P("pitchRate3", "PR3", "PITCH EG RATE 3", 99, { btn: 29, group: "PITCH EG", path: "pitchEg.rates.2" }),
  P("pitchRate4", "PR4", "PITCH EG RATE 4", 99, { btn: 29, group: "PITCH EG", path: "pitchEg.rates.3" }),
  P("pitchLevel1", "PL1", "PITCH EG LEVEL 1", 99, { btn: 30, group: "PITCH EG", path: "pitchEg.levels.0" }),
  P("pitchLevel2", "PL2", "PITCH EG LEVEL 2", 99, { btn: 30, group: "PITCH EG", path: "pitchEg.levels.1" }),
  P("pitchLevel3", "PL3", "PITCH EG LEVEL 3", 99, { btn: 30, group: "PITCH EG", path: "pitchEg.levels.2" }),
  P("pitchLevel4", "PL4", "PITCH EG LEVEL 4", 99, { btn: 30, group: "PITCH EG", path: "pitchEg.levels.3" }),
  P("lfoSpeed", "SPEED", "LFO SPEED", 99, { btn: 10, group: "LFO", path: "lfo.speed" }),
  P("lfoDelay", "DELAY", "LFO DELAY", 99, { btn: 11, group: "LFO", path: "lfo.delay" }),
  P("lfoPmd", "PITCH MOD DEPTH", "LFO PITCH MODULATION DEPTH", 99, { btn: 12, group: "LFO", path: "lfo.pmd" }),
  P("lfoAmd", "AMP MOD DEPTH", "LFO AMPLITUDE MODULATION DEPTH", 99, { btn: 13, group: "LFO", path: "lfo.amd" }),
  P("lfoSync", "KEY SYNC", "LFO KEY SYNC", 1, { btn: 14, group: "LFO", path: "lfo.sync", choices: ONOFF }),
  P("lfoWave", "WAVE", "LFO WAVE", 5, { btn: 9, group: "LFO", path: "lfo.wave", choices: LFO_WAVES }),
  P("lfoPms", "PITCH MOD SENS", "PITCH MODULATION SENSITIVITY", 7, { btn: 15, group: "LFO", path: "lfo.pms" }),
];

export const OP_GROUPS = ["FREQUENCY", "ENVELOPE", "SCALING", "OUTPUT"];
export const VOICE_GROUPS = ["VOICE", "PITCH EG", "LFO"];

/** How the DX7 would display this parameter's value. */
export function displayValue(param, value, ctx) {
  if (param.choices) return param.choices[value] ?? String(value);
  if (param.fmt) return param.fmt(value, ctx);
  return String(value);
}

/** The frequency an operator is running at, as the DX7 shows it. */
export function frequencyText(o) {
  if (o.mode) {
    const hz = opFixedHz(o);
    return `${hz < 10 ? hz.toFixed(2) : hz < 1000 ? hz.toFixed(1) : Math.round(hz)} Hz`;
  }
  return opRatio(o).toFixed(2);
}
