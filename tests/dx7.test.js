import test from "node:test";
import assert from "node:assert/strict";
import { packVoice, unpackVoice, singleVoiceSysex, cartridgeSysex, parseSysex, operatorRoles, ALGORITHMS, defaultVoice } from "../dist/js/dx7.js";
import { LIBRARY } from "../dist/js/designer.js";

test("every algorithm has carriers, and modulators only feed lower-numbered operators", () => {
  for (let a = 1; a <= 32; a++) {
    const alg = ALGORITHMS[a];
    assert.ok(alg.carriers.length >= 1, `alg ${a}`);
    for (const [from, to] of alg.edges) assert.ok(from > to, `alg ${a} edge ${from}->${to}`);
    for (const r of operatorRoles(a)) assert.ok(r.carrier || r.depth < 9, `alg ${a} op ${r.op} is connected`);
  }
});

test("packed voices round-trip for the whole library", () => {
  for (const { voice } of LIBRARY) assert.deepEqual(unpackVoice(packVoice(voice)), voice, voice.name);
});

test("fixed-frequency operators survive export (several EMM voices use them)", () => {
  const fixed = LIBRARY.filter((e) => e.voice.ops.some((o) => o.mode === 1));
  assert.ok(fixed.length >= 5);
  for (const { voice } of fixed) {
    const [back] = parseSysex(singleVoiceSysex(voice));
    assert.deepEqual(back.ops.map((o) => [o.mode, o.coarse, o.fine]), voice.ops.map((o) => [o.mode, o.coarse, o.fine]));
  }
});

test("single-voice dump has the standard DX7 VCED header, size and checksum", () => {
  const syx = singleVoiceSysex(LIBRARY[0].voice);
  assert.equal(syx.length, 163);
  assert.deepEqual([...syx.slice(0, 6)], [0xf0, 0x43, 0x00, 0x00, 0x01, 0x1b]);
  assert.equal(syx[162], 0xf7);
  assert.equal([...syx.slice(6, 162)].reduce((a, b) => a + b, 0) & 127, 0);
  assert.deepEqual(parseSysex(syx)[0], LIBRARY[0].voice);
});

test("cartridge dump is 4104 bytes and parses back to the same 32 voices", () => {
  const voices = LIBRARY.slice(0, 32).map((e) => e.voice);
  const syx = cartridgeSysex(voices);
  assert.equal(syx.length, 4104);
  assert.deepEqual([...syx.slice(0, 6)], [0xf0, 0x43, 0x00, 0x09, 0x20, 0x00]);
  assert.deepEqual(parseSysex(syx), voices);
});

test("a default voice has a neutral pitch envelope", () => {
  assert.deepEqual(defaultVoice().pitchEg.levels, [50, 50, 50, 50]);
});
