import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "../dist/js/language.js";

test("negation and intensifiers change direction and size", () => {
  assert.ok(interpret("bright").dims.bright > 0);
  assert.ok(interpret("not bright").dims.bright < 0);
  assert.ok(interpret("very bright").dims.bright > interpret("bright").dims.bright);
});

test("instrument words become family evidence", () => {
  assert.ok(interpret("an old Wurlitzer").families.epiano > 0);
  assert.ok(interpret("breathy pan flute").families.flute > 0);
  assert.ok(!interpret("not a piano, more like a bell").families.piano);
});

test("plucked names a family and shortens the sound; sub bass does not double-count sub", () => {
  const p = interpret("plucked");
  assert.ok(p.families.pluck > 0 && p.dims.decay < 0);
  assert.equal(interpret("sub bass").dims.register, 0);
});
