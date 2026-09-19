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
