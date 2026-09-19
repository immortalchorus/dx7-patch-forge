import test from "node:test";
import assert from "node:assert/strict";
import { MidiLink } from "../dist/js/midi.js";
import { LIBRARY } from "../dist/js/designer.js";

function fakeMidi(names) {
  const sent = [];
  const outputs = new Map(names.map((name, i) => [`id${i}`, { id: `id${i}`, name, state: "connected", send: (bytes) => sent.push({ name, bytes: [...bytes] }) }]));
  let asked = null;
  // Node's navigator is a read-only global, so redefine it for the test.
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { requestMIDIAccess: async (opts) => ((asked = opts), { outputs }) },
  });
  return { sent, asked: () => asked };
}

test("sends a valid single-voice dump to the chosen output and channel", async () => {
  const midi = fakeMidi(["Dexed", "DX7 via USB"]);
  const link = new MidiLink(() => {});
  await link.connect();
  assert.deepEqual(midi.asked(), { sysex: true });
  link.set({ outputId: "id1", channel: 2 });
  const voice = LIBRARY.find((e) => e.voice.name === "TINE EP").voice;
  assert.equal(link.send(voice), "DX7 via USB");
  const { name, bytes } = midi.sent[0];
  assert.equal(name, "DX7 via USB");
  assert.equal(bytes.length, 163);
  assert.deepEqual(bytes.slice(0, 6), [0xf0, 0x43, 0x02, 0x00, 0x01, 0x1b]);
  assert.equal(bytes[162], 0xf7);
});

test("falls back to the first output when the remembered one is gone", async () => {
  fakeMidi(["Only device"]);
  const link = new MidiLink(() => {});
  await link.connect();
  link.set({ outputId: "missing" });
  assert.equal(link.output().name, "Only device");
});

function fakeMidiIO(outNames, inNames) {
  const sent = [];
  const outputs = new Map(outNames.map((name, i) => [`o${i}`, { id: `o${i}`, name, state: "connected", send: (b) => sent.push([...b]) }]));
  const inputs = new Map(inNames.map((name, i) => [`i${i}`, { id: `i${i}`, name, state: "connected", onmidimessage: null }]));
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { requestMIDIAccess: async () => ({ outputs, inputs }) },
  });
  return { sent, inputs };
}

async function linkWithInputs(handlers, inNames = ["Keystation"]) {
  globalThis.localStorage?.clear?.();
  const io = fakeMidiIO(["Dexed"], inNames);
  const link = new MidiLink(() => {}, handlers);
  await link.connect();
  return { link, io };
}

test("a controller plays the preview, with its own velocity", async () => {
  const played = [];
  const { link, io } = await linkWithInputs({ note: (n) => played.push(n) });
  const port = io.inputs.get("i0");
  assert.ok(port.onmidimessage, "the input is listened to once connected");
  port.onmidimessage({ data: Uint8Array.from([0x90, 60, 96]) });
  port.onmidimessage({ data: Uint8Array.from([0x80, 60, 0]) });
  // Running status: a note-on with velocity 0 is how many keyboards send note off.
  port.onmidimessage({ data: Uint8Array.from([0x92, 64, 40]) });
  port.onmidimessage({ data: Uint8Array.from([0x92, 64, 0]) });
  assert.deepEqual(played, [
    { note: 60, velocity: 96, on: true },
    { note: 60, velocity: 0, on: false },
    { note: 64, velocity: 40, on: true },
    { note: 64, velocity: 0, on: false },
  ]);
  assert.equal(link.receive([0x90, 60, 96]), "on", "any channel plays");
});

test("the sustain pedal holds notes until it lifts", async () => {
  const played = [];
  const { link } = await linkWithInputs({ note: (n) => played.push(n) });
  assert.equal(link.receive([0xb0, 64, 127]), "pedal down");
  link.receive([0x90, 60, 100]);
  assert.equal(link.receive([0x80, 60, 0]), "held", "the key is up but the note is not");
  assert.equal(played.filter((p) => !p.on).length, 0);
  assert.equal(link.receive([0xb0, 64, 0]), "pedal up");
  assert.deepEqual(played.filter((p) => !p.on), [{ note: 60, velocity: 0, on: false }]);
});

test("all notes off is obeyed, from the pedal's panic or the instrument's", async () => {
  let panics = 0;
  const { link } = await linkWithInputs({ note: () => {}, panic: () => panics++ });
  link.receive([0xb0, 64, 127]);
  link.receive([0x90, 60, 100]);
  assert.equal(link.receive([0xb0, 123, 0]), "all notes off");
  assert.equal(panics, 1);
  assert.equal(link.sustained.size, 0, "and nothing is left held");
  assert.equal(link.pedal, false);
});

test("a voice sent from the instrument is read straight in", async () => {
  const got = [];
  const { link } = await linkWithInputs({ voices: (v) => got.push(v) });
  const voice = LIBRARY.find((e) => e.voice.name === "TINE EP").voice;
  const { singleVoiceSysex, cartridgeSysex } = await import("../dist/js/dx7.js");
  assert.equal(link.receive(singleVoiceSysex(voice), "DX7"), "voice received");
  assert.equal(got[0].voices.length, 1);
  assert.equal(got[0].voices[0].name, "TINE EP");
  assert.equal(got[0].source, "DX7");
  assert.equal(link.receive(cartridgeSysex(Array.from({ length: 32 }, () => voice)), "DX7"), "32 voices received");
  assert.equal(got[1].voices.length, 32);
  // Someone else's SysEx, and a clock byte, are ignored rather than breaking anything.
  assert.equal(link.receive([0xf0, 0x41, 0x10, 0x42, 0x12, 0xf7]), null);
  assert.equal(link.receive([0xf8]), null);
  assert.equal(got.length, 2);
});

test("listening can be switched off, and a chosen input is the only one heard", async () => {
  const played = [];
  const { link, io } = await linkWithInputs({ note: (n) => played.push(n), panic: () => {} }, ["Keystation", "DX7 via USB"]);
  link.set({ inputId: "i1" });
  assert.equal(io.inputs.get("i0").onmidimessage, null, "the other input is let go");
  assert.ok(io.inputs.get("i1").onmidimessage);
  link.set({ listen: false });
  for (const port of io.inputs.values()) assert.equal(port.onmidimessage, null, "nothing is listened to");
  assert.deepEqual(link.listening(), []);
});
