// The chord honeycomb: one hexagon per degree of the key, staggered so they tessellate.
//
// This replaces the circle of fifths that Chord Lab started with. The wheel is a beautiful
// object and a bad fit for this job, for one reason that outgrew it: **a circle of fifths only
// describes a major key.** Its two rings are the majors and their relative minors, and the seven
// lit chords are the seven of a major scale. Ask it for Dorian, or Phrygian Dominant, or a
// pentatonic, and it has nothing to say - OWL fell back to printing roman numerals on a diagram
// that was still drawn as though the key were major.
//
// A honeycomb is one hexagon per scale degree, so it has exactly as many cells as the scale has
// notes: seven for the modes, five for a pentatonic, eight for the diminished scales. Every cell
// is a chord you can actually play in the chosen scale, and none of them are decoration.
//
// The geometry is SpaceAge's, from NumeralPadComponent in Source/SpaceageCircleOfFifths.h:
// flat-topped hexagons, each column three quarters of a width across, odd columns dropped half a
// height. That stagger is what makes it a honeycomb rather than a row of separate tiles.
//
// Nothing here touches the DOM: it returns markup, and app.js puts it on the page.

import { scaleByMode, chordLabel, romanNumeralForScaleDegree, defaultChord, degreeRootPitchClass, MODE_MAJOR } from "./harmony.js";

const H_RATIO = 0.8660254; // height of a flat-topped hexagon as a fraction of its width
const f = (n) => n.toFixed(2);

/** The box one cell occupies. Columns step three quarters across; odd ones drop half a height. */
export function cellBounds(index, { width, left = 0, top = 0 }) {
  const h = width * H_RATIO;
  return {
    x: left + index * width * 0.75,
    y: top + (index % 2 === 0 ? 0 : h * 0.5),
    w: width,
    h,
  };
}

/** A flat-topped hexagon inscribed in a box. */
const hexPath = ({ x, y, w, h }) =>
  `M${f(x + w * 0.25)} ${f(y)} L${f(x + w * 0.75)} ${f(y)} L${f(x + w)} ${f(y + h / 2)} ` +
  `L${f(x + w * 0.75)} ${f(y + h)} L${f(x + w * 0.25)} ${f(y + h)} L${f(x)} ${f(y + h / 2)} Z`;

/** How wide and tall the whole honeycomb is, for a given cell width and count. */
export function honeycombSize(count, width) {
  const h = width * H_RATIO;
  return { width: width * (0.75 * Math.max(1, count) + 0.25), height: h * 1.5 };
}

// ---------------------------------------------------------------- the controls on a cell
//
// SpaceAge carries a chord's controls on the hexagon itself rather than beside it: four of the
// six edges set the inversion and two discs set the octave, and the body still adds the chord
// (`edgeSetsInversion`, `discRaisesOctave`, `discLowersOctave`, `bodyStillAdds` in its
// FIFTHS_HANDOVER gate). A hexagon is the right shape for it - six edges is six affordances a
// circle segment does not have - and it is why OWL's honeycomb uses the same stagger.
//
// **What they act on differs, and deliberately.** In SpaceAge a pad cell *is* a placed chord, so
// each cell holds its own inversion and octave. In OWL the honeycomb is a palette: the cells are
// degrees, and placed chords live on the steps of the loop. So the controls appear on the cell of
// the **selected chord** and edit that chord. One meaning for one control, and the panel beside
// the honeycomb is a second view of the same two fields rather than a competing one.
//
// The geometry is ported: vertices at sixty degrees from the cell centre, the four edges taken
// clockwise from the lower left, each trimmed to 13-87% of its span and pulled 8.5% toward the
// centre so neighbouring marks do not pile into a wedge at the shared corner. The lower-right and
// bottom edges are left plain, as they are there - a shape whose every side is a button has no
// plain side left to steady the eye.

/** A vertex of the cell's hexagon: index 0 is the right-hand point, going clockwise on screen. */
export function hexVertex({ x, y, w, h }, index) {
  const angle = ((((index % 6) + 6) % 6) * Math.PI * 2) / 6;
  return [x + w / 2 + Math.cos(angle) * w * 0.5, y + h / 2 + Math.sin(angle) * w * 0.5];
}

/** How many inversions the edges offer, and therefore how many edges carry one. */
export const INVERSION_SLOTS = 4;

/** The untrimmed edge a slot sits on. Slot 0 is the lower left, going clockwise. */
export function edgeLine(box, slot) {
  const start = 2 + Math.min(INVERSION_SLOTS - 1, Math.max(0, slot));
  return [hexVertex(box, start), hexVertex(box, start + 1)];
}

/** The drawn part of that edge: shortened at both ends, then eased toward the centre. */
export function trimmedEdge(box, slot, endTrim = 0.13, inward = 0.085) {
  const [a, b] = edgeLine(box, slot);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const along = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const ease = ([px, py]) => [px + (cx - px) * inward, py + (cy - py) * inward];
  return [ease(along(endTrim)), ease(along(1 - endTrim))];
}

/**
 * The octave disc. Minus on the left and plus on the right, because you subtract to the left and
 * add to the right everywhere else.
 *
 * SpaceAge sits these just inside the bottom of its cell; OWL's cells are smaller and already
 * carry the numeral on that row, so they flank it instead of crowding above it.
 */
export function octaveDisc(box, up) {
  const r = Math.max(7, box.w * 0.08);
  return {
    cx: box.x + box.w / 2 + (up ? 1 : -1) * box.w * 0.24,
    cy: box.y + box.h / 2 + box.h * 0.275,
    r,
  };
}

/** Distance from a point to a segment, clamped along it: SpaceAge's distanceToEdge. */
function distanceToEdge([a, b], px, py) {
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const lengthSquared = sx * sx + sy * sy;
  if (lengthSquared < 1e-6) return Math.hypot(px - a[0], py - a[1]);
  const t = Math.min(1, Math.max(0, ((px - a[0]) * sx + (py - a[1]) * sy) / lengthSquared));
  return Math.hypot(px - (a[0] + sx * t), py - (a[1] + sy * t));
}

/**
 * What a point lands on inside a cell, in SpaceAge's order: the discs first, then the inversion
 * edges, then the body. Ported so a test can hold the geometry without a screenshot, and because
 * the drawn markup and the answer here have to agree about where a control is.
 *
 * Returns `{ control: "octave" | "inversion" | "body", value }`, or null when the point is not
 * in the cell at all. The band is a fraction of the cell's width, as it is there, and it only
 * applies inside the hexagon - which is what stops one cell's edge stealing its neighbour's body.
 */
export function controlAtPoint(x, y, degree, { width = 96, pad = 6, band = 0.13 } = {}) {
  const box = cellBounds(degree, { width, left: pad, top: pad });
  if (!pointInHex(x, y, box)) return null;
  for (const up of [true, false]) {
    const disc = octaveDisc(box, up);
    if (Math.hypot(x - disc.cx, y - disc.cy) <= disc.r) return { control: "octave", value: up ? 1 : -1 };
  }
  for (let slot = 0; slot < INVERSION_SLOTS; slot++) {
    if (distanceToEdge(edgeLine(box, slot), x, y) <= width * band) return { control: "inversion", value: slot };
  }
  return { control: "body", value: degree };
}

/**
 * The honeycomb for a key and scale, as SVG markup.
 *
 * `selected` is the degree currently being edited, or null. Every cell carries `data-degree`, so
 * what a click means is written on the shape itself rather than worked out from where the
 * pointer landed. The cells are their own hit targets, which is the whole reason this needs no
 * hit test the way the JUCE original does.
 */
export function honeycombSvg(
  keyPosition,
  mode = MODE_MAJOR,
  { width = 96, selected = null, pad = 6, preferFlats, chord: activeChord = null, maxOctaves = 3 } = {},
) {
  const scale = scaleByMode(mode);
  const count = Math.max(1, scale.count);
  let out = "";
  // Only the selected chord's cell carries controls, so there is never a question about which
  // chord an edge belongs to. One clip path is enough for that one cell, and clipping is what
  // reproduces SpaceAge's rule that a band only counts inside its own hexagon.
  const withControls = activeChord && selected != null && selected >= 0 && selected < count ? selected : null;
  if (withControls != null) {
    out += `<defs><clipPath id="hexclip">${`<path d="${hexPath(cellBounds(withControls, { width, left: pad, top: pad }))}"/>`}</clipPath></defs>`;
  }

  for (let degree = 0; degree < count; degree++) {
    const box = cellBounds(degree, { width, left: pad, top: pad });
    // The plain chord this degree builds, for the name on the cell. Deliberately not called
    // `chord`: the selected chord is `activeChord`, and a local of that name shadowed it once,
    // which fed the controls a default chord and made them always read root position.
    const plain = { ...defaultChord(), degree };
    const label = chordLabel(plain, { keyPosition, mode, preferFlats });
    const numeral = romanNumeralForScaleDegree(mode, degree);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const title = `${label}, ${numeral}, degree ${degree + 1} of ${scale.name}`;
    out += `<g class="hcell${degree === selected ? " sel" : ""}" role="button" tabindex="0"`;
    out += ` data-degree="${degree}" aria-label="${title}">`;
    out += `<title>${title}</title>`;
    out += `<path d="${hexPath(box)}"/>`;
    // A scale with no key-correct letter spelling is named by its numeral, and then the numeral
    // underneath would say the same thing twice. One line, centred, in that case.
    const doubled = label === numeral;
    out += `<text class="hname" x="${f(cx)}" y="${f(doubled ? cy + 6 : cy + 2)}" text-anchor="middle">${label}</text>`;
    if (!doubled) out += `<text class="hnum" x="${f(cx)}" y="${f(cy + box.h * 0.28)}" text-anchor="middle">${numeral}</text>`;
    out += `</g>`;
    if (degree === withControls) out += cellControls(box, activeChord, label, maxOctaves);
  }
  return out;
}

const INVERSION_NAMES = ["Root position", "First inversion", "Second inversion", "Third inversion"];

/**
 * The controls carried on one cell: four edges for the inversion, two discs for the octave.
 *
 * Painted after the cell so they sit above it, and in reverse slot order so that slot 0 is the
 * topmost where two bands meet at a shared corner - SVG gives the click to whatever is painted
 * last, and SpaceAge gives it to the lowest slot. The discs come last of all because it tests
 * them first.
 */
function cellControls(box, chord, label, maxOctaves) {
  const held = Math.min(INVERSION_SLOTS - 1, Math.max(0, chord.inversion | 0));
  const octaves = chord.registerOctaves | 0;
  let out = `<g class="hctl" clip-path="url(#hexclip)">`;

  for (let slot = INVERSION_SLOTS - 1; slot >= 0; slot--) {
    const [a, b] = edgeLine(box, slot);
    const [ta, tb] = trimmedEdge(box, slot);
    const name = INVERSION_NAMES[slot];
    const on = slot === held;
    out += `<g class="hinv${on ? " on" : ""}" role="button" tabindex="0" data-control="inversion" data-value="${slot}"`;
    out += ` aria-pressed="${on}" aria-label="${name} of ${label}">`;
    out += `<title>${name}</title>`;
    // The wide stroke is the target and is never seen; the thin one is the mark. Ported from
    // SpaceAge, where the band is 0.13 of the cell's width either side of the edge.
    out += `<line class="hit" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke-width="${f(box.w * 0.26)}"/>`;
    out += `<line class="mark" x1="${f(ta[0])}" y1="${f(ta[1])}" x2="${f(tb[0])}" y2="${f(tb[1])}"/>`;
    out += `</g>`;
  }

  for (const up of [false, true]) {
    const disc = octaveDisc(box, up);
    const at = up ? maxOctaves : -maxOctaves;
    const spent = octaves === at;
    const name = up ? "Octave up" : "Octave down";
    out += `<g class="hoct${spent ? " spent" : ""}" role="button" tabindex="${spent ? -1 : 0}"`;
    out += ` data-control="octave" data-value="${up ? 1 : -1}" aria-disabled="${spent}"`;
    out += ` aria-label="${name}${octaves ? `, currently ${octaves > 0 ? "+" : ""}${octaves}` : ""}">`;
    out += `<title>${name}${spent ? " (as far as it goes)" : ""}</title>`;
    out += `<circle cx="${f(disc.cx)}" cy="${f(disc.cy)}" r="${f(disc.r)}"/>`;
    out += `<text x="${f(disc.cx)}" y="${f(disc.cy + disc.r * 0.42)}" text-anchor="middle">${up ? "+" : "−"}</text>`;
    out += `</g>`;
  }
  return out + `</g>`;
}

/**
 * Which cell a point lands on, or -1.
 *
 * The drawn honeycomb does not need this - its hexagons are their own hit targets - but the
 * JUCE original's hit test is what SpaceAge's FIFTHS gate sweeps, and a test that only checked
 * the drawn cells would be checking this file against itself. Point-in-polygon on the same path
 * the cell is drawn from, so the two cannot drift.
 */
export function degreeAtPoint(x, y, mode = MODE_MAJOR, { width = 96, pad = 6 } = {}) {
  const count = Math.max(1, scaleByMode(mode).count);
  // Later columns overlap earlier ones at the seams, so the last match wins the same way a
  // honeycomb drawn left to right puts the later cell on top.
  for (let degree = count - 1; degree >= 0; degree--) {
    if (pointInHex(x, y, cellBounds(degree, { width, left: pad, top: pad }))) return degree;
  }
  return -1;
}

function pointInHex(px, py, { x, y, w, h }) {
  const pts = [
    [x + w * 0.25, y], [x + w * 0.75, y], [x + w, y + h / 2],
    [x + w * 0.75, y + h], [x + w * 0.25, y + h], [x, y + h / 2],
  ];
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The pitch class each cell is rooted on, so a test can check the honeycomb against the scale. */
export const cellRootPitchClass = (keyRoot, mode, degree) => degreeRootPitchClass(keyRoot, mode, degree);
