import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTROLS, GROUPS, neutralSliders } from "../dist/js/controls.js";
import { LIBRARY, tailor } from "../dist/js/designer.js";
import * as macros from "../dist/js/macros.js";

// SpaceAge's 80s FM page will adopt this vocabulary natively, so these ids become user-visible
// in a second product. Renaming one is a breaking change, not a tidy-up. This list is the
// contract: add to it freely, change an existing entry only deliberately.
const IDS = [
  "bright", "hollow", "harm", "grit", "width", "chorusSmooth", "growl", "keyTrack", "register",
  "subOctave", "tineLevel", "tinePitch", "tineTouch", "sustainTone", "balance", "hammer", "hammerPitch", "hammerTouch",
  "attack", "bark", "decay", "sustain", "release", "tail", "evolve", "evolveTime",
  "vibrato", "tremolo", "wobble", "lfoRate", "onset",
  "scoop", "scoopTime", "fall",
  "velBright", "velLoud", "rateKey", "pivot",
  "level",
];

test("the control vocabulary is stable", () => {
  const ids = CONTROLS.map((c) => c.id);
  const gone = IDS.filter((id) => !ids.includes(id));
  assert.deepEqual(gone, [], `these ids disappeared or were renamed, which breaks a second product: ${gone}`);
  assert.deepEqual([...new Set(ids)], ids, "ids are unique");
});

test("every control says what it drives, how, and where it lives", () => {
  const kinds = new Set(["direct", "searched", "structural", "output"]);
  for (const c of CONTROLS) {
    assert.ok(GROUPS.includes(c.group), `${c.id} is in a real group`);
    assert.ok(c.label && c.left && c.right && c.hint, `${c.id} has a label, both poles and a hint`);
    assert.ok(kinds.has(c.kind), `${c.id} has a known kind, got ${c.kind}`);
    assert.ok(c.drives, `${c.id} names what carries it out`);
    // Every macro it names must actually exist, so the table cannot rot silently.
    for (const fn of c.drives.split(/[+/]/).map((s) => s.trim()))
      assert.ok(typeof macros[fn] === "function", `${c.id} drives ${fn}, which is not exported from macros.js`);
  }
});

test("every control is wired into the shaping pipeline", () => {
  // A control that is declared but never read would be a dead slider. Some are read inside the
  // macro rather than in the pipeline - setHammer takes the whole slider set - so look in both.
  const source = ["../dist/js/designer.js", "../dist/js/macros.js"]
    .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
    .join("\n");
  for (const c of CONTROLS) {
    const read = source.includes('"' + c.id + '"') || source.includes("s." + c.id) || source.includes(c.id + " =");
    assert.ok(read, `${c.id} is never read anywhere in the pipeline`);
  }
  assert.deepEqual(Object.keys(neutralSliders()).sort(), CONTROLS.map((c) => c.id).sort());
});

test("what a patch did is data, and the prose is derived from it", () => {
  // The explanation has to port into another product, so it cannot only exist as a sentence.
  const r = tailor(LIBRARY.find((e) => e.voice.name === "TINE EP"), { bright: 0.5, growl: 0.4, attack: -0.6 });
  assert.ok(r.changes.length >= 3);
  assert.deepEqual(r.applied, r.changes.map((c) => c.text), "the prose is the records, rendered");
  const attributed = r.changes.filter((c) => c.id);
  assert.equal(attributed.length, r.changes.length, `every change names the control that caused it: ${JSON.stringify(r.changes)}`);
  for (const c of attributed) {
    assert.ok(CONTROLS.some((k) => k.id === c.id), `${c.id} is a real control`);
    assert.equal(typeof c.amount, "number", `${c.id} records how far it was pushed`);
    assert.equal(typeof c.text, "string");
  }
});
