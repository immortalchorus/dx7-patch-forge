import test from "node:test";
import assert from "node:assert/strict";
import { defaultVoice, defaultOperator, sanitizeVoice, singleVoiceSysex, parseSysex } from "../dist/js/dx7.js";
import { OP_PARAMS, VOICE_PARAMS, getParam, setParam, displayValue, breakpointNote, transposeNote, frequencyText, noteName } from "../dist/js/dx7-params.js";
import { envelopeShape } from "../dist/js/classic.js";

/** Every leaf value in an object, as dotted paths. */
function leaves(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...leaves(v, path));
    else out.push(path);
  }
  return out;
}

test("the editor reaches every parameter a DX7 voice stores", () => {
  const voice = defaultVoice();
  const voiceLeaves = leaves({ ...voice, ops: undefined }).filter((p) => p !== "ops");
  const covered = new Set(VOICE_PARAMS.map((p) => p.path));
  // The name is edited in the header field, not in the parameter list.
  assert.deepEqual(voiceLeaves.filter((p) => !covered.has(p)), ["name"]);
  const opCovered = new Set(OP_PARAMS.map((p) => p.path));
  assert.deepEqual(leaves(defaultOperator()).filter((p) => !opCovered.has(p)), []);
});

test("parameter ids are unique and their ranges are the DX7's", () => {
  for (const table of [OP_PARAMS, VOICE_PARAMS]) {
    const ids = table.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const p of table) assert.ok(p.max > p.min && p.btn >= 1 && p.btn <= 32, p.id);
  }
  const max = (table, id) => table.find((p) => p.id === id).max;
  assert.equal(max(OP_PARAMS, "level"), 99);
  assert.equal(max(OP_PARAMS, "detune"), 14);
  assert.equal(max(OP_PARAMS, "rateScaling"), 7);
  assert.equal(max(VOICE_PARAMS, "algorithm"), 32);
  assert.equal(max(VOICE_PARAMS, "transpose"), 48);
});

test("edits made through the parameter table survive a SysEx round trip", () => {
  const v = defaultVoice();
  // Put a distinct, legal value in every parameter, then send and read it back.
  let n = 3;
  for (const p of VOICE_PARAMS) setParam(v, p.path, (n = (n * 7 + 5) % (p.max - p.min + 1)) + p.min);
  for (const op of v.ops) for (const p of OP_PARAMS) setParam(op, p.path, (n = (n * 7 + 5) % (p.max + 1)));
  const sane = sanitizeVoice(v);
  const back = parseSysex(singleVoiceSysex(sane))[0];
  for (const p of VOICE_PARAMS) assert.equal(getParam(back, p.path), getParam(sane, p.path), p.id);
  for (let i = 0; i < 6; i++)
    for (const p of OP_PARAMS) assert.equal(getParam(back.ops[i], p.path), getParam(sane.ops[i], p.path), `OP${i + 1} ${p.id}`);
});

test("values read the way the DX7's display reads them", () => {
  assert.equal(noteName(60), "C3"); // middle C, Yamaha numbering
  assert.equal(breakpointNote(39), "C3");
  assert.equal(breakpointNote(0), "A-1");
  assert.equal(breakpointNote(99), "C8");
  assert.equal(transposeNote(24), "C3");
  const detune = OP_PARAMS.find((p) => p.id === "detune");
  assert.equal(displayValue(detune, 7), "0");
  assert.equal(displayValue(detune, 14), "+7");
  assert.equal(displayValue(detune, 0), "-7");
  const curve = OP_PARAMS.find((p) => p.id === "leftCurve");
  assert.equal(displayValue(curve, 1), "−EXP");
  assert.equal(frequencyText({ mode: 0, coarse: 1, fine: 0 }), "1.00");
  assert.equal(frequencyText({ mode: 0, coarse: 0, fine: 0 }), "0.50");
  assert.equal(frequencyText({ mode: 1, coarse: 2, fine: 0 }), "100.0 Hz");
});

test("the envelope picture follows the envelope: held high, then released", () => {
  const sustained = { ...defaultOperator(), level: 99, rates: [45, 99, 99, 60], levels: [99, 99, 99, 0] };
  const { points, releaseAt } = envelopeShape(sustained, { hold: 1 });
  const at = (t) => points.find(([x]) => x >= t)[1];
  assert.ok(at(0.5) > at(0.02) + 3, "a slow attack climbs to the sustain level");
  assert.ok(at(releaseAt + 0.3) < at(releaseAt - 0.05) - 1, "and falls away after the key is released");
  const percussive = { ...sustained, rates: [99, 60, 60, 60], levels: [99, 0, 0, 0] };
  const p2 = envelopeShape(percussive, { hold: 1 }).points;
  assert.ok(p2.find(([x]) => x >= 0.9)[1] < p2.find(([x]) => x >= 0.05)[1] - 3, "a single-decay envelope is quiet before release");
});
