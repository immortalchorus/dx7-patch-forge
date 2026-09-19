// SpaceAge native patch (.ssynth) for the 80s FM engine (engine 15).
//
// Parameter meanings follow SpaceAge's PluginProcessor: ratio is coarse (0 -> 0.5) with fine
// applied as ratio * (1 + fine/100); fixed mode uses 10^(coarse & 3) Hz with fine as
// 10^(fine/100); feedback and operator level are normalised to 0..1; "pitch" is transpose
// in semitones. Integrity hashes reproduce SpaceAge's canonical JUCE JSON serialisation.

import { sanitizeVoice } from "./dx7.js";

export function ssynthParameters(voice) {
  const v = sanitizeVoice(voice);
  const l = v.lfo;
  const p = {
    fm80algo: v.algorithm,
    fm80feedback: v.feedback / 7,
    fm80lfospeed: l.speed,
    fm80lfodelay: l.delay,
    fm80lfowave: l.wave,
    fm80lfosync: l.sync,
    fm80lfopmd: l.pmd,
    fm80lfopms: l.pms,
    fm80lfoamdepth: l.amd,
    fm80keysync: v.oscKeySync,
    fm80tune: 0,
    fm80wheelpitch: 0,
    fm80wheelamp: 0,
    fm80wheelegbias: 0,
    fm80afterpitch: 0,
    fm80afteramp: 0,
    fm80afteregbias: 0,
    fm80breathpitch: 0,
    fm80breathamp: 0,
    fm80breathegbias: 0,
    fm80footpitch: 0,
    fm80footamp: 0,
    fm80footegbias: 0,
    fm80legato: 0,
    fm80glide: 0,
    fm80glidemode: 1,
    fm80glidestep: 0,
    fm80bendrange: 2,
    fm80bendstep: 0,
    fm80bendmode: 0,
    pitch: v.transpose - 24,
    attack: 0.001,
    decay: 5,
    sustain: 1,
    release: 4,
    filtertype: 0,
    cutoff: 16000,
    resonance: 0.1,
    filterenv: 0,
    filterdecay: 0.25,
  };
  for (let s = 0; s < 4; s++) {
    p[`fm80pitchr${s + 1}`] = v.pitchEg.rates[s];
    p[`fm80pitchl${s + 1}`] = v.pitchEg.levels[s];
  }
  v.ops.forEach((o, i) => {
    const x = `fm80op${i + 1}`;
    Object.assign(p, {
      [x + "enabled"]: 1,
      [x + "mode"]: o.mode,
      [x + "ratio"]: o.coarse || 0.5,
      [x + "fixed"]: Math.pow(10, o.coarse & 3),
      [x + "fine"]: o.fine,
      [x + "detune"]: o.detune - 7,
      [x + "level"]: o.level / 99,
      [x + "ratescale"]: o.rateScaling,
      [x + "velsens"]: o.velSens,
      [x + "breakpoint"]: o.breakpoint,
      [x + "leftdepth"]: o.leftDepth,
      [x + "rightdepth"]: o.rightDepth,
      [x + "leftcurve"]: o.leftCurve,
      [x + "rightcurve"]: o.rightCurve,
      [x + "ams"]: o.ams,
    });
    for (let s = 0; s < 4; s++) {
      p[`${x}r${s + 1}`] = o.rates[s];
      p[`${x}l${s + 1}`] = o.levels[s];
    }
  });
  return p;
}

function reduceFixed(s) {
  const d = s.indexOf(".");
  if (d < 0) return s;
  let e = s.length;
  while (e > d + 2 && s[e - 1] === "0") e--;
  return s.slice(0, e);
}

function juceNumber(v) {
  const a = Math.abs(v);
  if (a >= 1e6 || (a <= 1e-5 && a !== 0)) {
    let [m, e] = v.toExponential(15).toLowerCase().split("e");
    m = reduceFixed(m);
    let sign = "";
    if (e[0] === "-") (sign = "-"), (e = e.slice(1));
    else if (e[0] === "+") e = e.slice(1);
    e = e.replace(/^0+(?=\d)/, "");
    return Number(e) === 0 ? m : `${m}e${sign}${e}`;
  }
  if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) return v.toFixed(1);
  return reduceFixed(v.toFixed(15));
}

const ESCAPES = { '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\t": "\\t", "\r": "\\r", "\n": "\\n" };
function juceQuote(v) {
  let s = '"';
  for (const ch of String(v)) {
    const n = ch.codePointAt(0);
    s += ESCAPES[ch] ?? (n < 32 ? "\\u" + n.toString(16).padStart(4, "0") : ch);
  }
  return s + '"';
}

/** JUCE JSON::toString(var, false) with all numbers as doubles and keys sorted. */
export function juceJson(v, indent = 0) {
  if (v == null) return "null";
  if (typeof v === "string") return juceQuote(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return juceNumber(v);
  const n = indent + 2;
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return "[\r\n" + v.map((x) => " ".repeat(n) + juceJson(x, n)).join(",\r\n") + "\r\n" + " ".repeat(indent) + "]";
  }
  const keys = Object.keys(v).sort();
  if (!keys.length) return "{\r\n" + " ".repeat(indent) + "}";
  return (
    "{\r\n" +
    keys.map((k) => " ".repeat(n) + juceQuote(k) + ": " + juceJson(v[k], n)).join(",\r\n") +
    "\r\n" +
    " ".repeat(indent) +
    "}"
  );
}

async function sha256(s) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const z = (n) => String(Math.abs(n)).padStart(2, "0");
  return (
    `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}` +
    `.${String(d.getMilliseconds()).padStart(3, "0")}${off >= 0 ? "+" : "-"}${z((off / 60) | 0)}:${z(off % 60)}`
  );
}

export async function ssynthFile(voice, name, created = new Date()) {
  const patch = {
    format: "Sample Squad Native Synth Patch",
    version: 1,
    engine: 15,
    engineName: "80s FM",
    name: (name || voice.name || "Untitled").trim().slice(0, 128) || "Untitled",
    created: localIso(created),
    parameters: ssynthParameters(voice),
  };
  patch.parameterIntegrity = await sha256(juceJson(patch.parameters));
  patch.integrityVersion = 1;
  patch.patchIntegrity = await sha256(juceJson(patch));
  return JSON.stringify(patch);
}
