// The controls carried on a honeycomb cell: four edges for the inversion, two discs for the
// octave, ported from SpaceAge's NumeralPadComponent.
//
// The geometry is checked rather than screenshotted, the way SpaceAge checks its own: a hit test
// taken from the same numbers the drawing uses is the only way to hold a shape's controls without
// a picture. What is asserted here is what its FIFTHS_HANDOVER gate asserts about the pad -
// edgeSetsInversion, discRaisesOctave, discLowersOctave, bodyStillAdds - expressed for a palette
// of degrees rather than a strip of placed chords.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  honeycombSvg, cellBounds, hexVertex, edgeLine, trimmedEdge, octaveDisc,
  controlAtPoint, INVERSION_SLOTS,
} from "../dist/js/chord-honeycomb.js";
import { defaultChord, MODE_MAJOR } from "../dist/js/harmony.js";

const WIDTH = 96;
const PAD = 6;
const box = (degree = 0) => cellBounds(degree, { width: WIDTH, left: PAD, top: PAD });
const centreOf = (b) => [b.x + b.w / 2, b.y + b.h / 2];
const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** A hair inside the cell, so a point on the boundary is not what is being tested. */
const inward = ([px, py], b, amount = 0.06) => {
  const [cx, cy] = centreOf(b);
  return [px + (cx - px) * amount, py + (cy - py) * amount];
};

// ---------------------------------------------------------------- geometry

test("a cell is a regular hexagon, and its edges are where SpaceAge puts them", () => {
  const b = box(0);
  const [cx, cy] = centreOf(b);
  // Vertices at sixty degrees from the centre, index 0 at the right-hand point.
  for (let i = 0; i < 6; i++) {
    const [vx, vy] = hexVertex(b, i);
    assert.ok(Math.abs(Math.hypot(vx - cx, vy - cy) - b.w / 2) < 1e-6, `vertex ${i} is off the circle`);
  }
  assert.deepEqual(hexVertex(b, 0).map(Math.round), [Math.round(cx + b.w / 2), Math.round(cy)]);
  assert.deepEqual(hexVertex(b, 6), hexVertex(b, 0), "the ring wraps");

  // Four edges, clockwise from the lower left. The bottom and the lower-right are left plain -
  // a shape whose every side is a button has no plain side left to steady the eye.
  assert.equal(INVERSION_SLOTS, 4);
  const top = edgeLine(b, 2);
  assert.ok(Math.abs(top[0][1] - b.y) < 1e-6 && Math.abs(top[1][1] - b.y) < 1e-6, "slot 2 is the top edge");
  const lowerLeft = edgeLine(b, 0);
  assert.ok(mid(lowerLeft)[0] < cx && mid(lowerLeft)[1] > cy, "slot 0 is the lower left");
});

test("the drawn mark is shorter than the edge it sits on, and pulled inside it", () => {
  // Trimmed at both ends so two neighbouring marks do not pile into a wedge at the shared corner,
  // then eased toward the centre. SpaceAge trims to 13-87% and eases 8.5%.
  const b = box(0);
  for (let slot = 0; slot < INVERSION_SLOTS; slot++) {
    const [ea, eb] = edgeLine(b, slot);
    const [ta, tb] = trimmedEdge(b, slot);
    const edgeLength = Math.hypot(eb[0] - ea[0], eb[1] - ea[1]);
    const markLength = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]);
    assert.ok(markLength < edgeLength * 0.8, `slot ${slot}: the mark should be clearly shorter`);
    assert.ok(markLength > edgeLength * 0.5, `slot ${slot}: but still read as the edge`);
    const [cx, cy] = centreOf(b);
    for (const p of [ta, tb]) {
      assert.ok(Math.hypot(p[0] - cx, p[1] - cy) < b.w / 2, `slot ${slot}: the mark should sit inside the hexagon`);
    }
  }
});

test("the octave discs are minus on the left and plus on the right, and both sit inside the cell", () => {
  const b = box(0);
  const [cx] = centreOf(b);
  const down = octaveDisc(b, false);
  const up = octaveDisc(b, true);
  assert.ok(down.cx < cx && up.cx > cx, "you subtract to the left and add to the right");
  assert.ok(Math.abs(down.cy - up.cy) < 1e-6, "they share a row");
  assert.ok(up.cx - down.cx > up.r * 2, "and do not overlap each other");
  for (const disc of [down, up]) {
    assert.equal(controlAtPoint(disc.cx, disc.cy, 0, { width: WIDTH, pad: PAD })?.control, "octave");
  }
});

// ---------------------------------------------------------------- the hit test

test("a point lands on the control the drawing put there", () => {
  const opts = { width: WIDTH, pad: PAD };
  const b = box(0);

  // Each inversion edge answers with its own slot.
  for (let slot = 0; slot < INVERSION_SLOTS; slot++) {
    const hit = controlAtPoint(...inward(mid(edgeLine(b, slot)), b), 0, opts);
    assert.deepEqual(hit, { control: "inversion", value: slot }, `the middle of slot ${slot}`);
  }

  // The discs answer before the edges, as they do there.
  assert.deepEqual(controlAtPoint(octaveDisc(b, true).cx, octaveDisc(b, true).cy, 0, opts), { control: "octave", value: 1 });
  assert.deepEqual(controlAtPoint(octaveDisc(b, false).cx, octaveDisc(b, false).cy, 0, opts), { control: "octave", value: -1 });

  // The body is still the body: the centre, and the two edges left plain.
  assert.equal(controlAtPoint(...centreOf(b), 0, opts).control, "body", "the middle of the cell adds the chord");
  const bottom = [hexVertex(b, 1), hexVertex(b, 2)];
  assert.equal(controlAtPoint(...inward(mid(bottom), b), 0, opts).control, "body", "the bottom edge carries nothing");
  const lowerRight = [hexVertex(b, 0), hexVertex(b, 1)];
  assert.equal(controlAtPoint(...inward(mid(lowerRight), b), 0, opts).control, "body", "nor the lower right");
});

test("a band only counts inside its own hexagon", () => {
  // SpaceAge tests hexPath.contains() before any band, which is what stops one cell's edge from
  // swallowing the neighbour's body where the two meet. The drawn controls are clipped to the
  // cell for the same reason, so the markup and this answer agree.
  const opts = { width: WIDTH, pad: PAD };
  const b = box(0);
  const [tx, ty] = mid(edgeLine(b, 2)); // the top edge
  assert.equal(controlAtPoint(tx, ty - 4, 0, opts), null, "just above the top edge is not in this cell");
  assert.equal(controlAtPoint(...inward([tx, ty], b), 0, opts).control, "inversion", "just below it is");
  assert.equal(controlAtPoint(0, 0, 0, opts), null, "the corner of the viewBox is in no cell");
  // And the neighbouring cell's centre belongs to the neighbour, not to this one's edge band.
  assert.equal(controlAtPoint(...centreOf(box(1)), 1, opts).control, "body");
});

// ---------------------------------------------------------------- the markup

test("only the selected chord's cell carries controls", () => {
  // An edge with no chord to act on would be a control that does nothing, and an edge on a cell
  // that is not the selected one would raise the question this design exists to avoid: which
  // chord does it belong to?
  const chord = { ...defaultChord() };
  const count = (svg) => (svg.match(/data-control=/g) || []).length;
  assert.equal(count(honeycombSvg(0, MODE_MAJOR, { selected: null, chord })), 0, "nothing selected");
  assert.equal(count(honeycombSvg(0, MODE_MAJOR, { selected: 0, chord: null })), 0, "no chord given");
  assert.equal(count(honeycombSvg(0, MODE_MAJOR, { selected: 0, chord })), INVERSION_SLOTS + 2, "one cell, six controls");
  assert.equal(count(honeycombSvg(0, MODE_MAJOR, { selected: 99, chord })), 0, "a degree outside the scale");
  // The controls are clipped to the cell they belong to.
  const svg = honeycombSvg(0, MODE_MAJOR, { selected: 0, chord });
  assert.match(svg, /<clipPath id="hexclip">/);
  assert.match(svg, /class="hctl" clip-path="url\(#hexclip\)"/);
});

test("every control is reachable and says what it does", () => {
  const svg = honeycombSvg(0, MODE_MAJOR, { selected: 0, chord: { ...defaultChord(), inversion: 2 } });
  const controls = [...svg.matchAll(/<g class="[^"]*" role="button" tabindex="(-?\d)" data-control="(\w+)" data-value="(-?\d)"([^>]*)>/g)];
  assert.equal(controls.length, INVERSION_SLOTS + 2);
  for (const [, tabindex, control, value, rest] of controls) {
    assert.match(rest, /aria-label="[^"]{4,}"/, `${control} ${value} needs a label`);
    assert.ok(["inversion", "octave"].includes(control));
    if (control === "inversion") assert.equal(tabindex, "0", "every inversion is reachable");
  }
  // The held inversion is the pressed one, and only it.
  const pressed = [...svg.matchAll(/data-control="inversion" data-value="(\d)" aria-pressed="(\w+)"/g)];
  assert.equal(pressed.length, INVERSION_SLOTS);
  assert.deepEqual(pressed.filter(([, , on]) => on === "true").map(([, v]) => v), ["2"]);
});

test("a disc that can go no further says so, and stops taking focus", () => {
  const atTop = honeycombSvg(0, MODE_MAJOR, { selected: 0, chord: { ...defaultChord(), registerOctaves: 3 } });
  assert.match(atTop, /data-control="octave" data-value="1" aria-disabled="true"/, "up is spent at +3");
  assert.match(atTop, /data-control="octave" data-value="-1" aria-disabled="false"/, "down still works");
  assert.match(atTop, /<g class="hoct spent" role="button" tabindex="-1" data-control="octave" data-value="1"/);

  const atBottom = honeycombSvg(0, MODE_MAJOR, { selected: 0, chord: { ...defaultChord(), registerOctaves: -3 } });
  assert.match(atBottom, /data-control="octave" data-value="-1" aria-disabled="true"/, "down is spent at -3");
  assert.match(atBottom, /data-control="octave" data-value="1" aria-disabled="false"/);

  const middle = honeycombSvg(0, MODE_MAJOR, { selected: 0, chord: { ...defaultChord() } });
  assert.equal((middle.match(/aria-disabled="true"/g) || []).length, 0, "neither is spent in the middle");
  // The label carries where the octave currently stands, for anyone who cannot see the discs.
  assert.match(atTop, /aria-label="Octave up, currently \+3"/);
});

// ---------------------------------------------------------------- the two views agree

test("the hexagon and the panel beside it offer the same two fields", () => {
  // The controls on the cell are a second view of Inversion and Register, not a competing one.
  // If the panel ever offers a choice the hexagon cannot reach, one of them is lying.
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const panel = html.slice(html.indexOf('id="clEditorBlock"'), html.indexOf('id="clMeasure"'));
  assert.ok(panel.includes('id="clInversion"'), "the panel still has its inversion control");
  assert.ok(panel.includes('id="clRegister"'), "and its register control");

  const app = readFileSync(new URL("../dist/js/app.js", import.meta.url), "utf8");
  // Both views write through the same edit, so neither can change a chord the other cannot see.
  assert.match(app, /\$\("#clInversion"\)\.onchange = \(e\) => editSelected/, "the panel edits the selected chord");
  assert.match(app, /function useCellControl/, "and so does the hexagon");
  assert.match(app, /editSelected\(\(c\) => \(c\.inversion = value\)\)/, "the edge sets the same field the panel does");
  assert.match(app, /c\.registerOctaves = next/, "and the disc the same field as Register");
  // The panel offers four inversions, which is exactly what the four edges offer.
  assert.equal(INVERSION_SLOTS, 4);
  assert.match(app, /\["Root position", "1st", "2nd", "3rd"\]/, "four inversions in the panel, four edges on the cell");
});
