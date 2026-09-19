// Yamaha DX7 voice model, algorithm topology and SysEx encoding.
//
// Voices are plain objects. Operators are stored OP1-first (ops[0] is OP1), matching the
// numbering on the DX7 front panel and in SpaceAge. SysEx stores them OP6-first; the
// pack/unpack functions below handle that reversal in one place.

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));

// Each algorithm lists its carriers, modulation edges [from, to] and the operator that
// carries the feedback loop. Algorithms 4 and 6 feed back across a stack (OP4 -> OP6 and
// OP5 -> OP6); fbFrom records the source so the renderer can approximate them.
const A = (carriers, edges, fb, fbFrom = fb) => ({ carriers, edges, fb, fbFrom });
const STACK_1 = [[2, 1], [4, 3], [5, 4], [6, 5]];
const STACK_3 = [[2, 1], [3, 2], [5, 4], [6, 5]];
const PAIRS_5 = [[2, 1], [4, 3], [6, 5]];
const ALG_7 = [[2, 1], [4, 3], [5, 3], [6, 5]];
const ALG_10 = [[2, 1], [3, 2], [5, 4], [6, 4]];
const ALG_12 = [[2, 1], [4, 3], [5, 3], [6, 3]];
const ALG_14 = [[2, 1], [4, 3], [5, 4], [6, 4]];
const ALG_16 = [[2, 1], [3, 1], [4, 3], [5, 1], [6, 5]];
const ALG_26 = [[3, 2], [5, 4], [6, 4]];

export const ALGORITHMS = [
  null,
  A([1, 3], STACK_1, 6),
  A([1, 3], STACK_1, 2),
  A([1, 4], STACK_3, 6),
  A([1, 4], STACK_3, 6, 4),
  A([1, 3, 5], PAIRS_5, 6),
  A([1, 3, 5], PAIRS_5, 6, 5),
  A([1, 3], ALG_7, 6),
  A([1, 3], ALG_7, 4),
  A([1, 3], ALG_7, 2),
  A([1, 4], ALG_10, 3),
  A([1, 4], ALG_10, 6),
  A([1, 3], ALG_12, 2),
  A([1, 3], ALG_12, 6),
  A([1, 3], ALG_14, 6),
  A([1, 3], ALG_14, 2),
  A([1], ALG_16, 6),
  A([1], ALG_16, 2),
  A([1], [[2, 1], [3, 1], [4, 1], [5, 4], [6, 5]], 3),
  A([1, 4, 5], [[2, 1], [3, 2], [6, 4], [6, 5]], 6),
  A([1, 2, 4], [[3, 1], [3, 2], [5, 4], [6, 4]], 3),
  A([1, 2, 4, 5], [[3, 1], [3, 2], [6, 4], [6, 5]], 3),
  A([1, 3, 4, 5], [[2, 1], [6, 3], [6, 4], [6, 5]], 6),
  A([1, 2, 4, 5], [[3, 2], [6, 4], [6, 5]], 6),
  A([1, 2, 3, 4, 5], [[6, 3], [6, 4], [6, 5]], 6),
  A([1, 2, 3, 4, 5], [[6, 4], [6, 5]], 6),
  A([1, 2, 4], ALG_26, 6),
  A([1, 2, 4], ALG_26, 3),
  A([1, 3, 6], [[2, 1], [4, 3], [5, 4]], 5),
  A([1, 2, 3, 5], [[4, 3], [6, 5]], 6),
  A([1, 2, 3, 6], [[4, 3], [5, 4]], 5),
  A([1, 2, 3, 4, 5], [[6, 5]], 6),
  A([1, 2, 3, 4, 5, 6], [], 6),
];

/** Role of every operator in an algorithm: carrier flag and modulation depth (0 = carrier). */
export function operatorRoles(algorithm) {
  const alg = ALGORITHMS[algorithm];
  const depth = [0, 9, 9, 9, 9, 9, 9];
  for (const c of alg.carriers) depth[c] = 0;
  // A modulator always has a higher number than its target, so one ascending pass settles every depth.
  for (let op = 1; op <= 6; op++)
    for (const [from, to] of alg.edges) if (to === op) depth[from] = Math.min(depth[from], depth[to] + 1);
  return [1, 2, 3, 4, 5, 6].map((op) => ({
    op,
    carrier: depth[op] === 0,
    depth: depth[op],
    targets: alg.edges.filter(([f]) => f === op).map(([, t]) => t),
  }));
}

export function defaultOperator() {
  return {
    rates: [99, 99, 99, 99],
    levels: [99, 99, 99, 0],
    breakpoint: 39,
    leftDepth: 0,
    rightDepth: 0,
    leftCurve: 0,
    rightCurve: 0,
    rateScaling: 0,
    ams: 0,
    velSens: 0,
    level: 0,
    mode: 0,
    coarse: 1,
    fine: 0,
    detune: 7,
  };
}

export function defaultVoice() {
  return {
    name: "INIT VOICE",
    algorithm: 1,
    feedback: 0,
    oscKeySync: 1,
    transpose: 24,
    lfo: { speed: 35, delay: 0, pmd: 0, amd: 0, sync: 1, wave: 0, pms: 3 },
    pitchEg: { rates: [99, 99, 99, 99], levels: [50, 50, 50, 50] },
    ops: Array.from({ length: 6 }, (_, i) => ({ ...defaultOperator(), level: i === 0 ? 99 : 0 })),
  };
}

export const cloneVoice = (v) => JSON.parse(JSON.stringify(v));

/** Frequency multiple of a ratio-mode operator (coarse 0 means 0.5). */
export const opRatio = (o) => (o.coarse || 0.5) * (1 + o.fine / 100);

/** Frequency of a fixed-mode operator in Hz. */
export const opFixedHz = (o) => Math.pow(10, o.coarse & 3) * Math.pow(10, o.fine / 100);

const NAME_CHARS = /[^ !#$%&'()*+,\-./0-9:;<=>?@A-Z[\]^_`{|}]/g;
export const cleanName = (s) => String(s).toUpperCase().replace(NAME_CHARS, "").slice(0, 10);

/** Force every field into its legal DX7 range. Returns a new voice. */
export function sanitizeVoice(v) {
  const o = cloneVoice(v);
  o.name = cleanName(o.name || "VOICE");
  o.algorithm = clamp(o.algorithm, 1, 32);
  o.feedback = clamp(o.feedback, 0, 7);
  o.oscKeySync = clamp(o.oscKeySync, 0, 1);
  o.transpose = clamp(o.transpose, 0, 48);
  const l = o.lfo;
  l.speed = clamp(l.speed, 0, 99);
  l.delay = clamp(l.delay, 0, 99);
  l.pmd = clamp(l.pmd, 0, 99);
  l.amd = clamp(l.amd, 0, 99);
  l.sync = clamp(l.sync, 0, 1);
  l.wave = clamp(l.wave, 0, 5);
  l.pms = clamp(l.pms, 0, 7);
  o.pitchEg.rates = o.pitchEg.rates.map((x) => clamp(x, 0, 99));
  o.pitchEg.levels = o.pitchEg.levels.map((x) => clamp(x, 0, 99));
  for (const op of o.ops) {
    op.rates = op.rates.map((x) => clamp(x, 0, 99));
    op.levels = op.levels.map((x) => clamp(x, 0, 99));
    op.breakpoint = clamp(op.breakpoint, 0, 99);
    op.leftDepth = clamp(op.leftDepth, 0, 99);
    op.rightDepth = clamp(op.rightDepth, 0, 99);
    op.leftCurve = clamp(op.leftCurve, 0, 3);
    op.rightCurve = clamp(op.rightCurve, 0, 3);
    op.rateScaling = clamp(op.rateScaling, 0, 7);
    op.ams = clamp(op.ams, 0, 3);
    op.velSens = clamp(op.velSens, 0, 7);
    op.level = clamp(op.level, 0, 99);
    op.mode = clamp(op.mode, 0, 1);
    op.coarse = clamp(op.coarse, 0, 31);
    op.fine = clamp(op.fine, 0, 99);
    op.detune = clamp(op.detune, 0, 14);
  }
  return o;
}

const nameBytes = (name) => [...cleanName(name).padEnd(10)].map((c) => c.charCodeAt(0) & 127);
const checksum = (bytes) => (128 - (bytes.reduce((a, b) => a + b, 0) & 127)) & 127;

/** 128-byte packed voice (VMEM), as stored in a 32-voice cartridge. */
export function packVoice(voice) {
  const v = sanitizeVoice(voice);
  const d = [];
  for (let stored = 0; stored < 6; stored++) {
    const o = v.ops[5 - stored];
    d.push(
      ...o.rates,
      ...o.levels,
      o.breakpoint,
      o.leftDepth,
      o.rightDepth,
      o.leftCurve | (o.rightCurve << 2),
      o.rateScaling | (o.detune << 3),
      o.ams | (o.velSens << 2),
      o.level,
      o.mode | (o.coarse << 1),
      o.fine,
    );
  }
  d.push(
    ...v.pitchEg.rates,
    ...v.pitchEg.levels,
    v.algorithm - 1,
    v.feedback | (v.oscKeySync << 3),
    v.lfo.speed,
    v.lfo.delay,
    v.lfo.pmd,
    v.lfo.amd,
    v.lfo.sync | (v.lfo.wave << 1) | (v.lfo.pms << 4),
    v.transpose,
    ...nameBytes(v.name),
  );
  return d;
}

export function unpackVoice(d) {
  const ops = [];
  for (let stored = 5; stored >= 0; stored--) {
    const q = d.slice(stored * 17, stored * 17 + 17);
    ops.push({
      rates: [...q.slice(0, 4)],
      levels: [...q.slice(4, 8)],
      breakpoint: q[8],
      leftDepth: q[9],
      rightDepth: q[10],
      leftCurve: q[11] & 3,
      rightCurve: (q[11] >> 2) & 3,
      rateScaling: q[12] & 7,
      detune: (q[12] >> 3) & 15,
      ams: q[13] & 3,
      velSens: (q[13] >> 2) & 7,
      level: q[14],
      mode: q[15] & 1,
      coarse: (q[15] >> 1) & 31,
      fine: q[16],
    });
  }
  return sanitizeVoice({
    name: String.fromCharCode(...d.slice(118, 128)).trimEnd(),
    algorithm: (d[110] & 31) + 1,
    feedback: d[111] & 7,
    oscKeySync: (d[111] >> 3) & 1,
    transpose: d[117],
    lfo: {
      speed: d[112],
      delay: d[113],
      pmd: d[114],
      amd: d[115],
      sync: d[116] & 1,
      wave: (d[116] >> 1) & 7,
      pms: (d[116] >> 4) & 7,
    },
    pitchEg: { rates: [...d.slice(102, 106)], levels: [...d.slice(106, 110)] },
    ops,
  });
}

/** 155-byte unpacked voice (VCED), as sent in a single-voice dump. */
export function vcedData(voice) {
  const v = sanitizeVoice(voice);
  const d = [];
  for (let stored = 0; stored < 6; stored++) {
    const o = v.ops[5 - stored];
    d.push(
      ...o.rates,
      ...o.levels,
      o.breakpoint,
      o.leftDepth,
      o.rightDepth,
      o.leftCurve,
      o.rightCurve,
      o.rateScaling,
      o.ams,
      o.velSens,
      o.level,
      o.mode,
      o.coarse,
      o.fine,
      o.detune,
    );
  }
  const l = v.lfo;
  d.push(...v.pitchEg.rates, ...v.pitchEg.levels, v.algorithm - 1, v.feedback, v.oscKeySync);
  d.push(l.speed, l.delay, l.pmd, l.amd, l.sync, l.wave, l.pms, v.transpose, ...nameBytes(v.name));
  return d;
}

/** Single-voice SysEx: F0 43 0n 00 01 1B <155 bytes> <checksum> F7 (163 bytes). */
export function singleVoiceSysex(voice, channel = 0) {
  const d = vcedData(voice);
  return new Uint8Array([0xf0, 0x43, channel & 15, 0x00, 0x01, 0x1b, ...d, checksum(d), 0xf7]);
}

/** 32-voice cartridge SysEx: F0 43 0n 09 20 00 <4096 bytes> <checksum> F7 (4104 bytes). */
export function cartridgeSysex(voices, channel = 0) {
  if (voices.length !== 32) throw new Error(`A DX7 cartridge holds 32 voices, got ${voices.length}`);
  const d = voices.flatMap(packVoice);
  return new Uint8Array([0xf0, 0x43, channel & 15, 0x09, 0x20, 0x00, ...d, checksum(d), 0xf7]);
}

/** Parse a cartridge or single-voice dump. Returns the voices it contains. */
export function parseSysex(bytes) {
  const b = [...bytes];
  if (b.length === 4104 && b[0] === 0xf0 && b[1] === 0x43 && b[3] === 0x09) {
    const d = b.slice(6, 4102);
    if (checksum(d) !== b[4102]) throw new Error("Cartridge checksum mismatch");
    return Array.from({ length: 32 }, (_, i) => unpackVoice(d.slice(i * 128, i * 128 + 128)));
  }
  if (b.length === 163 && b[0] === 0xf0 && b[1] === 0x43 && b[3] === 0x00 && b[4] === 0x01 && b[5] === 0x1b) {
    const d = b.slice(6, 161);
    if (checksum(d) !== b[161]) throw new Error("Voice checksum mismatch");
    return [vcedToVoice(d)];
  }
  throw new Error("Not a DX7 voice or cartridge dump");
}

function vcedToVoice(d) {
  const ops = [];
  for (let stored = 5; stored >= 0; stored--) {
    const q = d.slice(stored * 21, stored * 21 + 21);
    ops.push({
      rates: q.slice(0, 4),
      levels: q.slice(4, 8),
      breakpoint: q[8],
      leftDepth: q[9],
      rightDepth: q[10],
      leftCurve: q[11],
      rightCurve: q[12],
      rateScaling: q[13],
      ams: q[14],
      velSens: q[15],
      level: q[16],
      mode: q[17],
      coarse: q[18],
      fine: q[19],
      detune: q[20],
    });
  }
  return sanitizeVoice({
    name: String.fromCharCode(...d.slice(145, 155)).trimEnd(),
    algorithm: d[134] + 1,
    feedback: d[135],
    oscKeySync: d[136],
    lfo: { speed: d[137], delay: d[138], pmd: d[139], amd: d[140], sync: d[141], wave: d[142], pms: d[143] },
    transpose: d[144],
    pitchEg: { rates: d.slice(126, 130), levels: d.slice(130, 134) },
    ops,
  });
}
